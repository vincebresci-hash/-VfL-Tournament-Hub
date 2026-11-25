/**
 * Repeatable disposable PostgreSQL checks for competition configuration.
 *
 * Run: npm run test:competition-postgres
 * The process creates its own localhost cluster, proves that cluster is empty,
 * loads repository migrations, runs assertions, then deletes only that data directory.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertIsolation, openClient, startDisposableCluster } from "./cluster.mjs";
import { prepareDatabase } from "./apply.mjs";
import { runConcurrency } from "./concurrency.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contractFile = path.join(repoRoot, "supabase", "tests", "save_competition_configuration.sql");
const leagueApplyFile = path.join(repoRoot, "supabase", "tests", "apply_champions_league_league_phase.sql");

function statusOf(error) {
  return error && typeof error === "object" && error.status === "BLOCKED" ? "BLOCKED" : "FAIL";
}

async function runContract(cluster, file = contractFile, suite = "contract") {
  const started = performance.now();
  const { execFileSync } = await import("node:child_process");
  const psql = path.join(cluster.root, "bin", process.platform === "win32" ? "psql.exe" : "psql");
  try {
    execFileSync(psql, [
      "-h", "127.0.0.1",
      "-p", String(cluster.port),
      "-U", cluster.user,
      "-d", cluster.database,
      "-v", "ON_ERROR_STOP=1",
      "-f", file,
    ], {
      env: cluster.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String(error.stderr) : String(error);
    const partial = await readResults(cluster, suite);
    return [
      ...partial,
      {
        name: "Contract script",
        status: "FAIL",
        detail: stderr.slice(-2000),
        ms: Math.round(performance.now() - started),
      },
    ];
  }
  const rows = await readResults(cluster, suite);
  const elapsed = Math.round(performance.now() - started);
  if (rows.length === 0) {
    return [{ name: "Contract script", status: "FAIL", detail: "no executable assertions were recorded", ms: elapsed }];
  }
  return rows.map((row) => ({ ...row, ms: elapsed }));
}

async function readResults(cluster, suite = "contract") {
  const client = openClient(cluster);
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT name, ok, detail FROM public.test_results WHERE suite = $1 ORDER BY id`,
      [suite],
    );
    return rows.map((row) => ({
      name: row.name,
      status: row.ok ? "PASS" : "FAIL",
      detail: row.detail,
    }));
  } catch {
    return [];
  } finally {
    await client.end();
  }
}

async function snapshot(cluster) {
  const client = openClient(cluster);
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        (SELECT count(*)::integer FROM public.tournament_groups g
          JOIN public.tournaments t ON t.id = g.tournament_id
          WHERE t.slug NOT LIKE 'contract-%' AND t.slug NOT LIKE 'concurrency-%') AS groups,
        (SELECT count(*)::integer FROM public.tournament_matches m
          JOIN public.tournaments t ON t.id = m.tournament_id
          WHERE t.slug NOT LIKE 'contract-%' AND t.slug NOT LIKE 'concurrency-%') AS matches
    `);
    return rows[0];
  } finally {
    await client.end();
  }
}

function printReport(report) {
  for (const test of report.tests) {
    console.log(`${test.status}\t${test.ms}ms\t${test.name}\t${test.detail}`);
  }
  console.log(
    `TOTAL\t${report.durationMs}ms\t${report.status}\tPASS ${report.counts.PASS} FAIL ${report.counts.FAIL} BLOCKED ${report.counts.BLOCKED} SKIPPED ${report.counts.SKIPPED}`,
  );
  console.log(`COMPETITION_POSTGRES_RESULT ${JSON.stringify(report)}`);
}

const started = performance.now();
let cluster;
try {
  cluster = await startDisposableCluster();
  console.error(`cluster ${cluster.version} on 127.0.0.1:${cluster.port}`);
  const before = await assertIsolation(cluster, cluster.maintenanceDatabase);
  console.error("isolation proved before schema load");
  const applied = await prepareDatabase(cluster);
  console.error(`migrations applied: ${applied.filesApplied}`);
  const after = await assertIsolation(cluster, cluster.database);
  if (after.marker !== "on") {
    throw new Error("disposable marker missing after schema preparation");
  }
  const beforeCounts = await snapshot(cluster);
  const contract = await runContract(cluster);
  const leagueApply = await runContract(cluster, leagueApplyFile, "league-apply");
  let concurrency;
  try {
    concurrency = await runConcurrency(cluster);
  } catch (error) {
    concurrency = [{
      name: "Concurrency",
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
      ms: 0,
    }];
  }
  const afterCounts = await snapshot(cluster);
  const drift = beforeCounts.groups !== afterCounts.groups || beforeCounts.matches !== afterCounts.matches
    ? [{
        name: "No unintended match or group mutations outside fixtures",
        status: "FAIL",
        detail: `seed groups ${beforeCounts.groups}->${afterCounts.groups}, matches ${beforeCounts.matches}->${afterCounts.matches}`,
        ms: 0,
      }]
    : [{
        name: "No unintended match or group mutations outside fixtures",
        status: "PASS",
        detail: `seed groups ${afterCounts.groups}, matches ${afterCounts.matches}`,
        ms: 0,
      }];
  const tests = [...contract, ...leagueApply, ...concurrency, ...drift];
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, SKIPPED: 0 };
  for (const test of tests) counts[test.status] += 1;
  const status = counts.BLOCKED > 0 && counts.FAIL === 0 ? "BLOCKED" : counts.FAIL || counts.SKIPPED ? "FAIL" : "PASS";
  const report = {
    status,
    durationMs: Math.round(performance.now() - started),
    counts,
    executableTests: tests.length,
    postgres: cluster.version,
    isolation: {
      dataDirectory: before.data_directory,
      port: Number(after.port),
      serverAddr: after.server_addr,
      listenAddresses: after.listen_addresses,
      database: after.database_name,
      marker: after.marker,
    },
    migrations: applied,
    ignoredDatabaseUrl: Boolean(process.env.DATABASE_URL),
    tests,
  };
  printReport(report);
  process.exitCode = status === "PASS" ? 0 : status === "BLOCKED" ? 2 : 1;
} catch (error) {
  const status = statusOf(error);
  const report = {
    status,
    durationMs: Math.round(performance.now() - started),
    counts: { PASS: 0, FAIL: status === "FAIL" ? 1 : 0, BLOCKED: status === "BLOCKED" ? 1 : 0, SKIPPED: 0 },
    executableTests: 0,
    error: error instanceof Error ? error.message : String(error),
    tests: [{
      name: "Disposable PostgreSQL harness",
      status,
      detail: error instanceof Error ? error.message : String(error),
      ms: Math.round(performance.now() - started),
    }],
  };
  printReport(report);
  process.exitCode = status === "BLOCKED" ? 2 : 1;
} finally {
  if (cluster) cluster.stop();
}
