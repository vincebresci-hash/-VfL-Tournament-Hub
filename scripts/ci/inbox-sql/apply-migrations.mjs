#!/usr/bin/env node
/**
 * CI-only local migration applier for disposable Supabase.
 *
 * - Applies every file in supabase/migrations in lexicographic order.
 * - For two fingerprint-pinned historical files, commits enum ADD VALUE
 *   statements before executing the full original file (unchanged on disk).
 * - For one fingerprint-pinned historical file, drops tournament_public_roster(text)
 *   (no CASCADE) after verifying the old RETURNS TABLE shape, then applies the
 *   full original file in the same transaction.
 * - Never connects using DATABASE_URL / remote hosts / production secrets.
 * - Records applied versions in supabase_migrations.schema_migrations.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ENUM_SAFE_MIGRATIONS } from "./enum-safe-migrations.mjs";
import {
  FUNCTION_RETURN_COMPAT_MIGRATIONS,
  assertResultColumnsMatch,
  parseTableResultColumns,
} from "./function-return-compat-migrations.mjs";
import { createPgClient, loadLocalSupabaseEnv } from "./lib.mjs";

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function migrationVersion(filename) {
  const match = filename.match(/^(\d+)_/);
  if (!match) {
    throw new Error(`Migration filename missing version prefix: ${filename}`);
  }
  return match[1];
}

function assertEnumSafeSpec(filename, content) {
  const spec = ENUM_SAFE_MIGRATIONS[filename];
  if (!spec) {
    return null;
  }

  const digest = sha256(content);
  if (digest !== spec.sha256) {
    throw new Error(
      `Fingerprint mismatch for ${filename}: expected ${spec.sha256}, got ${digest}. ` +
        "Fail closed — refusing special enum handling on an unexpected historical file.",
    );
  }

  for (const statement of spec.enumStatements) {
    if (!content.includes(statement)) {
      throw new Error(
        `Expected enum statement missing from ${filename}. Fail closed.\n${statement}`,
      );
    }
  }

  return spec;
}

function assertFunctionReturnCompatSpec(filename, content) {
  const spec = FUNCTION_RETURN_COMPAT_MIGRATIONS[filename];
  if (!spec) {
    return null;
  }

  const digest = sha256(content);
  if (digest !== spec.sha256) {
    throw new Error(
      `Fingerprint mismatch for ${filename}: expected ${spec.sha256}, got ${digest}. ` +
        "Fail closed — refusing function return-type compat on an unexpected historical file.",
    );
  }

  if (spec.dropStatement.includes("CASCADE") || /cascade/i.test(spec.dropStatement)) {
    throw new Error("Refusing function return-type compat: DROP must never use CASCADE");
  }
  if (spec.dropStatement !== "DROP FUNCTION public.tournament_public_roster(text);") {
    throw new Error(
      `Refusing function return-type compat: unexpected DROP statement: ${spec.dropStatement}`,
    );
  }

  return spec;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[],
      name text
    );
  `);
}

async function isApplied(client, version) {
  const { rows } = await client.query(
    `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1`,
    [version],
  );
  return rows.length > 0;
}

async function recordMigration(client, version, filename, statements) {
  const { rows: columns } = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'supabase_migrations'
       AND table_name = 'schema_migrations'`,
  );
  const names = new Set(columns.map((row) => row.column_name));

  if (names.has("statements") && names.has("name")) {
    const inserted = await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
       VALUES ($1, $2::text[], $3)
       ON CONFLICT (version) DO NOTHING
       RETURNING version`,
      [version, statements, filename],
    );
    if (inserted.rows.length !== 1) {
      throw new Error(`Failed to record migration history for ${version} (duplicate or no row)`);
    }
    return;
  }

  if (names.has("version")) {
    const inserted = await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version)
       VALUES ($1)
       ON CONFLICT (version) DO NOTHING
       RETURNING version`,
      [version],
    );
    if (inserted.rows.length !== 1) {
      throw new Error(`Failed to record migration history for ${version} (duplicate or no row)`);
    }
    return;
  }

  throw new Error("supabase_migrations.schema_migrations has unexpected columns");
}

async function execSql(client, sql, label) {
  try {
    await client.query(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed while applying ${label}: ${message}`);
  }
}

async function applyStandardMigration(client, filename, content) {
  await client.query("BEGIN");
  try {
    await execSql(client, content, filename);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }
}

/**
 * Phase 1: commit reviewed enum ADD VALUE statements.
 * Phase 2: apply the full original file (ADD VALUE IF NOT EXISTS is then a no-op).
 * No PL/pgSQL body splitting — the entire historical file runs unchanged after commit.
 */
async function applyEnumSafeMigration(client, filename, content, spec) {
  await client.query("BEGIN");
  try {
    for (const statement of spec.enumStatements) {
      await execSql(client, statement, `${filename}::enum-precommit`);
    }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }

  await client.query("BEGIN");
  try {
    await execSql(client, content, `${filename}::full-after-enum-commit`);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }
}

async function getRosterFunctionMeta(client) {
  const { rows } = await client.query(`
    SELECT
      p.oid,
      pg_get_function_identity_arguments(p.oid) AS identity_args,
      pg_get_function_result(p.oid) AS result_type,
      p.prosecdef AS security_definer,
      COALESCE(p.proconfig, ARRAY[]::text[]) AS config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'tournament_public_roster'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
  `);
  return rows[0] || null;
}

async function assertNoBlockingDependents(client, functionOid) {
  const { rows } = await client.query(
    `
    SELECT pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent, d.deptype
    FROM pg_depend d
    WHERE d.refobjid = $1::oid
      AND d.deptype = 'n'
    ORDER BY 1
    `,
    [functionOid],
  );
  if (rows.length > 0) {
    const list = rows.map((row) => `${row.dependent} (deptype=${row.deptype})`).join("; ");
    throw new Error(
      `Refusing DROP FUNCTION public.tournament_public_roster(text): unexpected dependents: ${list}`,
    );
  }
}

/**
 * Verify old 8-column shape, DROP without CASCADE, apply original file — one transaction.
 */
async function applyFunctionReturnCompatMigration(client, filename, content, spec) {
  await client.query("BEGIN");
  try {
    const meta = await getRosterFunctionMeta(client);
    if (!meta) {
      throw new Error(
        `Expected ${spec.functionIdentity} to exist before compat DROP (from earlier migrations)`,
      );
    }

    const actualColumns = parseTableResultColumns(meta.result_type);
    assertResultColumnsMatch(
      actualColumns,
      spec.expectedOldResultColumns,
      `${filename}::pre-drop return shape`,
    );

    await assertNoBlockingDependents(client, meta.oid);

    await execSql(client, spec.dropStatement, `${filename}::compat-drop`);
    await execSql(client, content, `${filename}::full-after-compat-drop`);

    const after = await getRosterFunctionMeta(client);
    if (!after) {
      throw new Error(`${spec.functionIdentity} missing after applying ${filename}`);
    }
    assertResultColumnsMatch(
      parseTableResultColumns(after.result_type),
      spec.expectedNewResultColumns,
      `${filename}::post-apply return shape`,
    );

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }
}

async function assertFinalTournamentPublicRoster(client) {
  const spec = FUNCTION_RETURN_COMPAT_MIGRATIONS["20260825160000_participant_logos.sql"];
  const meta = await getRosterFunctionMeta(client);
  if (!meta) {
    throw new Error("Final assertion: public.tournament_public_roster(text) missing");
  }

  assertResultColumnsMatch(
    parseTableResultColumns(meta.result_type),
    spec.expectedNewResultColumns,
    "final tournament_public_roster return shape",
  );

  if (!meta.security_definer) {
    throw new Error("Final assertion: tournament_public_roster must be SECURITY DEFINER");
  }

  const config = Array.isArray(meta.config) ? meta.config : [];
  const searchPath = config.find((entry) => /^search_path\s*=/i.test(entry));
  if (!searchPath || !/search_path\s*=\s*public\b/i.test(searchPath)) {
    throw new Error(
      `Final assertion: expected search_path=public, got ${JSON.stringify(config)}`,
    );
  }

  const { rows: grants } = await client.query(`
    SELECT
      has_function_privilege('anon', 'public.tournament_public_roster(text)', 'EXECUTE') AS anon_exec,
      has_function_privilege('authenticated', 'public.tournament_public_roster(text)', 'EXECUTE') AS auth_exec,
      has_function_privilege('public', 'public.tournament_public_roster(text)', 'EXECUTE') AS public_exec
  `);
  if (!grants[0]?.anon_exec || !grants[0]?.auth_exec) {
    throw new Error(
      "Final assertion: EXECUTE must be granted to anon and authenticated",
    );
  }
  if (grants[0]?.public_exec) {
    throw new Error("Final assertion: PUBLIC must not retain EXECUTE (REVOKE ALL FROM PUBLIC)");
  }

  // Later historical replacement (20260913200000) keeps the 10-column shape and
  // prefers application logo overrides — confirm that body landed.
  const { rows: defRows } = await client.query(
    `SELECT pg_get_functiondef($1::oid) AS definition`,
    [meta.oid],
  );
  const definition = defRows[0]?.definition || "";
  if (!definition.includes("logo_manual_override")) {
    throw new Error(
      "Final assertion: expected later application_participant_logos body (logo_manual_override)",
    );
  }
  if (!definition.includes("SECURITY DEFINER")) {
    throw new Error("Final assertion: function definition missing SECURITY DEFINER");
  }
}

async function main() {
  if (process.env.INBOX_SQL_CI !== "1") {
    throw new Error("Refusing to run outside INBOX_SQL_CI=1");
  }
  if (process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must not be set for local CI apply");
  }
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN must be empty for local CI apply");
  }

  const env = loadLocalSupabaseEnv();
  const migrationsDir = join(process.cwd(), "supabase/migrations");
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error("No migration files found");
  }

  // Fail closed if allowlisted files are missing from disk.
  for (const filename of Object.keys(ENUM_SAFE_MIGRATIONS)) {
    if (!files.includes(filename)) {
      throw new Error(`Allowlisted migration missing from disk: ${filename}`);
    }
  }
  for (const filename of Object.keys(FUNCTION_RETURN_COMPAT_MIGRATIONS)) {
    if (!files.includes(filename)) {
      throw new Error(`Function-return compat allowlisted migration missing: ${filename}`);
    }
  }

  // A migration must not be in both special-case allowlists.
  for (const filename of Object.keys(FUNCTION_RETURN_COMPAT_MIGRATIONS)) {
    if (ENUM_SAFE_MIGRATIONS[filename]) {
      throw new Error(`Migration ${filename} is in both enum-safe and function-return allowlists`);
    }
  }

  const client = createPgClient(env.dbUrl);
  await client.connect();

  let applied = 0;
  let enumSafe = 0;
  let functionReturnCompat = 0;

  try {
    // Guard: project migrations must not already be applied by supabase start.
    await ensureMigrationsTable(client);
    const { rows: existing } = await client.query(
      `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
    );
    const existingVersions = new Set(existing.map((row) => row.version));
    const projectVersions = files.map(migrationVersion);
    const alreadyApplied = projectVersions.filter((version) => existingVersions.has(version));
    if (alreadyApplied.length > 0) {
      throw new Error(
        `Refusing to continue: supabase start/reset already applied project migrations ` +
          `(e.g. ${alreadyApplied.slice(0, 3).join(", ")}). ` +
          "Automatic CLI migration apply must be disabled before start.",
      );
    }

    // Inbox schema must not exist yet if auto-apply was correctly disabled.
    const { rows: inboxProbe } = await client.query(
      `SELECT to_regclass('public.inbox_messages') AS reg`,
    );
    if (inboxProbe[0]?.reg) {
      throw new Error(
        "public.inbox_messages already exists before CI apply — automatic migrations were not disabled",
      );
    }

    for (const filename of files) {
      const version = migrationVersion(filename);
      const fullPath = join(migrationsDir, filename);
      const content = readFileSync(fullPath, "utf8");
      const enumSpec = assertEnumSafeSpec(filename, content);
      const returnCompatSpec = assertFunctionReturnCompatSpec(filename, content);

      if (await isApplied(client, version)) {
        throw new Error(`Migration ${version} unexpectedly already recorded`);
      }

      let label = "";
      if (enumSpec) label = " [enum-safe]";
      if (returnCompatSpec) label = " [function-return-compat]";
      process.stdout.write(`Applying ${filename}${label} ... `);

      if (enumSpec) {
        await applyEnumSafeMigration(client, filename, content, enumSpec);
        enumSafe += 1;
      } else if (returnCompatSpec) {
        await applyFunctionReturnCompatMigration(
          client,
          filename,
          content,
          returnCompatSpec,
        );
        functionReturnCompat += 1;
      } else {
        await applyStandardMigration(client, filename, content);
      }

      await recordMigration(client, version, filename, [content]);
      applied += 1;
      process.stdout.write("ok\n");
    }

    const { rows: recorded } = await client.query(
      `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
    );
    if (recorded.length !== files.length || recorded.length !== applied) {
      throw new Error(
        `Migration history mismatch: recorded=${recorded.length} applied=${applied} files=${files.length}`,
      );
    }
    for (const filename of files) {
      const version = migrationVersion(filename);
      if (!recorded.some((row) => row.version === version)) {
        throw new Error(`Migration history missing version ${version}`);
      }
    }

    const { rows: inboxAfter } = await client.query(
      `SELECT to_regclass('public.inbox_messages') AS reg`,
    );
    if (!inboxAfter[0]?.reg) {
      throw new Error("inbox_messages missing after full migration apply");
    }

    await assertFinalTournamentPublicRoster(client);
    console.log("[function-return-compat] final tournament_public_roster assertions ok");

    console.log(
      `Applied ${applied} migrations (${enumSafe} enum-safe, ${functionReturnCompat} function-return-compat). History recorded.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
