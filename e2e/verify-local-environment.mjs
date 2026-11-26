/**
 * Read-only, fail-closed guard for the CL Release 5 CI stack.
 *
 * It runs before the migration applier or synthetic seed and only accepts the
 * fixed localhost ports from supabase/config.toml. No key value is logged.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import pg from "pg";

function fail(message) {
  throw new Error(`local-environment preflight: ${message}`);
}

for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "DATABASE_URL"]) {
  if (process.env[name]) fail(`${name} must be empty`);
}

const config = readFileSync("supabase/config.toml", "utf8");
if (!/^project_id\s*=\s*"vfl-tournament-hub-local"\s*$/m.test(config)) {
  fail("unexpected Supabase project_id");
}
if (!/^major_version\s*=\s*17\s*$/m.test(config)) {
  fail("supabase/config.toml must request PostgreSQL 17");
}

const raw = execFileSync("supabase", ["status", "-o", "env"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const env = Object.fromEntries(
  raw
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => {
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return [match[1], value];
    }),
);

const apiUrl = env.API_URL ?? env.SUPABASE_URL ?? "";
const dbUrl = env.DB_URL ?? "";
const anonKey = env.ANON_KEY ?? "";
const serviceKey = env.SERVICE_ROLE_KEY ?? "";
const api = new URL(apiUrl);
const database = new URL(dbUrl);

if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "54321") {
  fail("API_URL is not the fixed local endpoint");
}
if (!["postgres:", "postgresql:"].includes(database.protocol) || !["127.0.0.1", "localhost"].includes(database.hostname) || database.port !== "54322") {
  fail("DB_URL is not the fixed local endpoint");
}
if (!anonKey || !serviceKey) fail("local anon/service keys are missing");
if (/ogopebvpojuvheimzged|supabase\.co/i.test(`${apiUrl} ${dbUrl}`)) {
  fail("production or hosted Supabase reference detected");
}

const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 10_000 });
await client.connect();
try {
  const result = await client.query("SHOW server_version_num");
  const version = String(result.rows[0]?.server_version_num ?? "");
  if (!version.startsWith("17")) fail(`expected PostgreSQL 17, received ${version || "unknown"}`);
} finally {
  await client.end();
}

if (!process.env.GITHUB_ENV) fail("GITHUB_ENV is required in this CI workflow");
appendFileSync(
  process.env.GITHUB_ENV,
  [
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    "",
  ].join("\n"),
  "utf8",
);

console.log("local-environment preflight ok: localhost API, localhost database, PostgreSQL 17");
