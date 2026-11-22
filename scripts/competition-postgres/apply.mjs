/**
 * Load repository migrations into the disposable cluster.
 *
 * Historical files are not edited. The one replay accommodation is the
 * fingerprint-pinned DROP of public.tournament_public_roster(text) used by
 * scripts/ci/inbox-sql, and it runs only against this cluster.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FUNCTION_RETURN_COMPAT_MIGRATIONS,
  assertResultColumnsMatch,
  parseTableResultColumns,
} from "../ci/inbox-sql/function-return-compat-migrations.mjs";
import { resolveFunctionMeta } from "../ci/inbox-sql/function-catalog-lookup.mjs";
import { openClient } from "./cluster.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const BOOTSTRAP = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$fn$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT string_to_array(name, '/');
$fn$;
`;

function canonicalMigrationText(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (normalized.includes("\r")) {
    throw new Error("Refusing fingerprint: migration contains CR characters other than CRLF line endings");
  }
  return normalized;
}

function sha256(content) {
  return createHash("sha256").update(canonicalMigrationText(content), "utf8").digest("hex");
}

function psqlEnv(cluster) {
  return cluster.env;
}

function psql(cluster, database, args) {
  const executable = path.join(cluster.root, "bin", process.platform === "win32" ? "psql.exe" : "psql");
  return execFileSync(executable, [
    "-h",
    "127.0.0.1",
    "-p",
    String(cluster.port),
    "-U",
    cluster.user,
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
    ...args,
  ], {
    env: psqlEnv(cluster),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function dropRosterAfterShapeCheck(client, filename, content) {
  const spec = FUNCTION_RETURN_COMPAT_MIGRATIONS[filename];
  const digest = sha256(content);
  if (digest !== spec.sha256) {
    throw new Error(
      `Fingerprint mismatch for ${filename}: expected ${spec.sha256}, got ${digest}. Historical file was not modified and will not be force-applied.`,
    );
  }
  const meta = await resolveFunctionMeta(client, spec.functionIdentity);
  if (!meta) {
    throw new Error(`${spec.functionIdentity} was not installed by earlier migrations`);
  }
  assertResultColumnsMatch(
    parseTableResultColumns(meta.resultType),
    spec.expectedOldResultColumns,
    `${filename} before disposable DROP`,
  );
  if (spec.dropStatement !== "DROP FUNCTION public.tournament_public_roster(text);") {
    throw new Error("Refusing an unexpected roster DROP statement");
  }
  await client.query(spec.dropStatement);
  return {
    file: filename,
    accommodation:
      "disposable-only DROP FUNCTION public.tournament_public_roster(text) after verifying the 8-column return shape; fingerprint compared after CRLF-to-LF normalization and was not used to edit the historical file",
  };
}

export async function prepareDatabase(cluster) {
  const admin = openClient(cluster, cluster.maintenanceDatabase);
  await admin.connect();
  try {
    const tables = await admin.query(`
      SELECT count(*)::integer AS public_tables
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    if (tables.rows[0].public_tables !== 0) {
      throw new Error("Refusing schema load: maintenance database already has public tables");
    }
    await admin.query(`CREATE DATABASE ${cluster.database}`);
  } finally {
    await admin.end();
  }

  const client = openClient(cluster, cluster.database);
  await client.connect();
  const accommodations = [];
  try {
    const empty = await client.query(`
      SELECT count(*)::integer AS public_tables
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    if (empty.rows[0].public_tables !== 0) {
      throw new Error("Refusing schema load: new database already has public tables");
    }
    await client.query(`ALTER DATABASE ${cluster.database} SET app.disposable_competition_test = 'on'`);
  } finally {
    await client.end();
  }

  const marked = openClient(cluster, cluster.database);
  await marked.connect();
  try {
    const marker = await marked.query(
      `SELECT current_setting('app.disposable_competition_test', true) AS marker`,
    );
    if (marker.rows[0].marker !== "on") {
      throw new Error("Disposable marker was not set on the new database");
    }
    await marked.query(BOOTSTRAP);
    const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
    for (const filename of files) {
      const content = readFileSync(path.join(migrationsDir, filename), "utf8");
      if (FUNCTION_RETURN_COMPAT_MIGRATIONS[filename]) {
        accommodations.push(await dropRosterAfterShapeCheck(marked, filename, content));
      }
      try {
        psql(cluster, cluster.database, ["-f", path.join(migrationsDir, filename)]);
      } catch (error) {
        const stderr = error instanceof Error && "stderr" in error ? String(error.stderr) : "";
        throw new Error(`Migration failed: ${filename}\n${stderr || error}`);
      }
    }
    return { filesApplied: files.length, accommodations };
  } finally {
    await marked.end();
  }
}
