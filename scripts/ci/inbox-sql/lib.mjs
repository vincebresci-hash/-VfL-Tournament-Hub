/**
 * Local-only helpers for inbox SQL integration tests.
 * Connects exclusively to disposable Supabase from `supabase status`.
 * Never reads production secrets or remote DATABASE_URL.
 */

import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { execFileSync } from "node:child_process";

const FORBIDDEN_HOST_RE =
  /supabase\.co|amazonaws\.com|neon\.tech|[\w-]+\.pooler\.supabase\.com/i;

export function loadLocalSupabaseEnv() {
  if (process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must not be set; use local supabase status only");
  }
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN must be empty for isolated CI");
  }

  const raw = execFileSync("supabase", ["status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const env = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }

  const apiUrl = env.API_URL || env.SUPABASE_URL;
  const dbUrl = env.DB_URL || env.DATABASE_URL;
  const serviceKey = env.SERVICE_ROLE_KEY;
  const anonKey = env.ANON_KEY;

  if (!apiUrl || !dbUrl || !serviceKey || !anonKey) {
    throw new Error("supabase status did not provide API_URL/DB_URL/SERVICE_ROLE_KEY/ANON_KEY");
  }

  if (FORBIDDEN_HOST_RE.test(apiUrl) || FORBIDDEN_HOST_RE.test(dbUrl)) {
    throw new Error("Refusing non-local Supabase endpoint from status output");
  }
  if (!/127\.0\.0\.1|localhost/.test(apiUrl) || !/127\.0\.0\.1|localhost/.test(dbUrl)) {
    throw new Error("Supabase status endpoints must be localhost/127.0.0.1");
  }

  return { apiUrl, dbUrl, serviceKey, anonKey };
}

export function createPgClient(dbUrl) {
  return new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 10_000 });
}

export function createServiceSupabase({ apiUrl, serviceKey }) {
  return createClient(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function assertSessionRole(client, expectedRole) {
  const { rows } = await client.query(
    `SELECT current_user AS current_user, session_user AS session_user`,
  );
  const currentUser = rows[0]?.current_user;
  const sessionUser = rows[0]?.session_user;
  if (currentUser !== expectedRole) {
    throw new Error(
      `Expected current_user=${expectedRole}, got current_user=${currentUser} session_user=${sessionUser}`,
    );
  }
  if (currentUser === "postgres" || currentUser === "supabase_admin") {
    throw new Error(`Refusing privileged session where ${expectedRole} is required`);
  }
}

/** Begin a transaction as authenticated with JWT claims for auth.uid(). */
export async function withAuthenticatedTransaction(dbUrl, userId, fn) {
  const client = createPgClient(dbUrl);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
    ]);
    await client.query("SET LOCAL ROLE authenticated");
    await assertSessionRole(client, "authenticated");
    const uid = await client.query(`SELECT auth.uid() AS uid`);
    if (uid.rows[0]?.uid !== userId) {
      throw new Error(
        `auth.uid() mismatch: expected ${userId}, got ${uid.rows[0]?.uid ?? "null"}`,
      );
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await client.end();
  }
}

/** Begin a transaction as service_role (RLS bypass + service grants). */
export async function withServiceRoleTransaction(dbUrl, fn) {
  const client = createPgClient(dbUrl);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE service_role");
    await assertSessionRole(client, "service_role");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await client.end();
  }
}

export async function withPostgresTransaction(dbUrl, fn) {
  const client = createPgClient(dbUrl);
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await client.end();
  }
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function expectError(fn, predicate, message) {
  let caught = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  if (!caught) {
    throw new Error(message || "Expected error was not thrown");
  }
  if (predicate && !predicate(caught)) {
    throw new Error(
      `${message || "Error did not match predicate"}: ${caught.message || caught}`,
    );
  }
  return caught;
}

export function isPermissionDenied(error) {
  const code = error?.code || error?.cause?.code;
  const text = `${error?.message || ""} ${error?.cause?.message || ""}`.toLowerCase();
  return (
    code === "42501" ||
    text.includes("permission denied") ||
    text.includes("not authorized") ||
    text.includes("not authenticated")
  );
}

export function isLockLost(error) {
  const text = `${error?.message || ""}`.toLowerCase();
  return text.includes("sync lock lost");
}
