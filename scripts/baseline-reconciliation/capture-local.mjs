/**
 * Capture the pre-CL repository function catalog in a disposable PostgreSQL 17
 * cluster. Output is restricted to the operating-system temp directory.
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openClient, startDisposableCluster } from "../competition-postgres/cluster.mjs";
import { prepareDatabase } from "../competition-postgres/apply.mjs";

const terminalMigration = "20261009150000_ionos_inbox_readonly.sql";
const outputPath = process.argv[2];

if (!outputPath) {
  throw new Error("Pass an output path below the operating-system temp directory");
}

const resolvedOutput = path.resolve(outputPath);
const resolvedTemp = `${path.resolve(tmpdir())}${path.sep}`;
if (!resolvedOutput.startsWith(resolvedTemp)) {
  throw new Error(`Refusing non-temporary output path: ${resolvedOutput}`);
}

const cluster = await startDisposableCluster();
try {
  await prepareDatabase(cluster, { throughFilename: terminalMigration });
  const client = openClient(cluster);
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        p.oid::regprocedure::text AS function_signature,
        md5(regexp_replace(p.prosrc, '\\s+', '', 'g')) AS body_hash,
        pg_get_function_result(p.oid) AS result_type,
        l.lanname AS language,
        p.prosecdef AS security_definer,
        p.provolatile AS volatility,
        p.proisstrict AS is_strict,
        p.proleakproof AS leakproof,
        p.proconfig AS config,
        COALESCE(p.proacl::text, '') AS acl,
        pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_depend d
          WHERE d.classid = 'pg_proc'::regclass
            AND d.objid = p.oid
            AND d.deptype = 'e'
        )
      ORDER BY function_signature
    `);
    writeFileSync(resolvedOutput, JSON.stringify({ rows }, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log(`captured ${rows.length} local function definitions`);
  } finally {
    await client.end();
  }
} finally {
  cluster.stop();
}
