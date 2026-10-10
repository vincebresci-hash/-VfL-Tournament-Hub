#!/usr/bin/env node
/**
 * CI-only local migration applier for disposable Supabase.
 *
 * - Applies every file in supabase/migrations in lexicographic order.
 * - For two fingerprint-pinned historical files, commits enum ADD VALUE
 *   statements before executing the full original file (unchanged on disk).
 * - Never connects using DATABASE_URL / remote hosts / production secrets.
 * - Records applied versions in supabase_migrations.schema_migrations.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ENUM_SAFE_MIGRATIONS } from "./enum-safe-migrations.mjs";
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

  const client = createPgClient(env.dbUrl);
  await client.connect();

  let applied = 0;
  let enumSafe = 0;

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
      const spec = assertEnumSafeSpec(filename, content);

      if (await isApplied(client, version)) {
        throw new Error(`Migration ${version} unexpectedly already recorded`);
      }

      process.stdout.write(`Applying ${filename}${spec ? " [enum-safe]" : ""} ... `);

      if (spec) {
        await applyEnumSafeMigration(client, filename, content, spec);
        enumSafe += 1;
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

    console.log(
      `Applied ${applied} migrations (${enumSafe} enum-safe special-cased). History recorded.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
