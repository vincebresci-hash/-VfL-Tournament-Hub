/**
 * Disposable PostgreSQL 17 cluster for competition-configuration tests.
 *
 * Creates a new data directory and listens only on 127.0.0.1.
 * Never reads DATABASE_URL and never attaches to an existing cluster.
 */
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import net from "node:net";
import pg from "pg";

const BINARY_URL =
  "https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip";
const CACHE_DIR = path.join(tmpdir(), "vfl-pg17-binary-cache");

function blocked(message) {
  const error = new Error(`BLOCKED: ${message}`);
  error.status = "BLOCKED";
  return error;
}

function samePath(left, right) {
  return path.resolve(left).replace(/\\/g, "/").toLowerCase() === path.resolve(right).replace(/\\/g, "/").toLowerCase();
}

function binaryRootFromEnv() {
  const configured = process.env.DISPOSABLE_PG17_BIN;
  if (!configured) return null;
  return configured;
}

function hasServerFiles(root) {
  const exe = process.platform === "win32" ? ".exe" : "";
  return (
    existsSync(path.join(root, "bin", `initdb${exe}`)) &&
    existsSync(path.join(root, "share", "postgres.bki"))
  );
}

function assertPostgreSql17(root) {
  const exe = process.platform === "win32" ? ".exe" : "";
  const output = execFileSync(path.join(root, "bin", `postgres${exe}`), ["-V"], {
    encoding: "utf8",
  });
  if (!/PostgreSQL\)?\s+17\./.test(output)) {
    throw blocked(`disposable tests require PostgreSQL 17 binaries, found: ${output.trim()}`);
  }
  return output.trim();
}

async function downloadWindowsBinaries() {
  if (process.platform !== "win32") {
    throw blocked(
      "PostgreSQL 17 server binaries were not found. Set DISPOSABLE_PG17_BIN to a complete PostgreSQL 17 tree (bin and share). Existing databases are not used.",
    );
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const zipPath = path.join(CACHE_DIR, "postgresql-17.11-1-windows-x64-binaries.zip");
  const extracted = path.join(CACHE_DIR, "pgsql");
  if (hasServerFiles(extracted)) {
    return extracted;
  }
  if (!existsSync(zipPath) || statSync(zipPath).size < 300_000_000) {
    const response = await fetch(BINARY_URL);
    if (!response.ok || !response.body) {
      throw blocked(`could not download PostgreSQL 17 binaries (${response.status})`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(zipPath));
  }
  execFileSync("tar", ["-xf", zipPath, "-C", CACHE_DIR], { stdio: "inherit" });
  if (!hasServerFiles(extracted)) {
    throw blocked("downloaded PostgreSQL 17 archive did not contain share/postgres.bki");
  }
  return extracted;
}

export async function resolvePostgres17Root() {
  const candidates = [binaryRootFromEnv(), path.join(CACHE_DIR, "pgsql")].filter(Boolean);
  for (const root of candidates) {
    if (hasServerFiles(root)) {
      const version = assertPostgreSql17(root);
      return { root, version };
    }
  }
  const root = await downloadWindowsBinaries();
  const version = assertPostgreSql17(root);
  return { root, version };
}

function exe(root, name) {
  return path.join(root, "bin", process.platform === "win32" ? `${name}.exe` : name);
}

async function reserveLocalPort() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const chosen = typeof address === "object" && address ? address.port : 0;
        server.close(() => resolve(chosen));
      });
      server.on("error", reject);
    });
    if (port > 1024 && port !== 5432) return port;
  }
  throw blocked("could not reserve a non-default localhost port");
}

function scrubEnv(root) {
  const env = { ...process.env };
  for (const key of ["DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSERVICE"]) {
    delete env[key];
  }
  env.PATH = `${path.join(root, "bin")}${path.delimiter}${env.PATH || ""}`;
  return env;
}

export async function startDisposableCluster() {
  const { root, version } = await resolvePostgres17Root();
  const port = await reserveLocalPort();
  const dataDir = path.join(tmpdir(), `vfl-competition-pg-${process.pid}-${Date.now()}`);
  if (existsSync(dataDir)) {
    throw blocked(`refusing to reuse an existing data directory: ${dataDir}`);
  }
  const env = scrubEnv(root);
  try {
  execFileSync(exe(root, "initdb"), [
    "-D",
    dataDir,
    "-U",
    "vfl_test_super",
    "--auth-local=trust",
    "--auth-host=trust",
    "--encoding=UTF8",
    "--locale=C",
  ], { env, stdio: "ignore" });

  writeFileSync(
    path.join(dataDir, "pg_hba.conf"),
    [
      "# Disposable test cluster. Localhost trust only.",
      "local all all trust",
      "host all all 127.0.0.1/32 trust",
      "host all all ::1/128 trust",
      "",
    ].join("\n"),
  );
  const confPath = path.join(dataDir, "postgresql.conf");
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    confPath,
    `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = ''\n`,
  );
  writeFileSync(path.join(dataDir, "ISOLATION_MARKER.txt"), `port=${port}\nbin=${root}\n`);

  const logPath = path.join(dataDir, "server.log");
  execFileSync(exe(root, "pg_ctl"), ["-D", dataDir, "-l", logPath, "-w", "-t", "30", "start"], {
    env,
    stdio: "ignore",
  });
  } catch (error) {
    try {
      execFileSync(exe(root, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "-t", "10", "stop"], {
        env,
        stdio: "ignore",
      });
    } catch {
      // The partial data directory is removed below.
    }
    rmSync(dataDir, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : String(error);
    throw blocked(`could not start the disposable cluster. ${detail}`);
  }

  return {
    root,
    version,
    port,
    dataDir,
    user: "vfl_test_super",
    database: "vfl_competition_disposable",
    maintenanceDatabase: "postgres",
    env,
    stop() {
      try {
        execFileSync(exe(root, "pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "-t", "20", "stop"], {
          env,
          stdio: "ignore",
        });
      } catch {
        // The data directory is still removed below.
      }
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export function openClient(cluster, database = cluster.database) {
  return new pg.Client({
    host: "127.0.0.1",
    port: cluster.port,
    user: cluster.user,
    database,
    connectionTimeoutMillis: 8000,
  });
}

export async function assertIsolation(cluster, database) {
  const client = openClient(cluster, database);
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        current_setting('data_directory') AS data_directory,
        current_setting('port') AS port,
        current_setting('listen_addresses') AS listen_addresses,
        inet_server_addr()::text AS server_addr,
        current_database() AS database_name,
        current_setting('app.disposable_competition_test', true) AS marker
    `);
    const proof = rows[0];
    if (!samePath(proof.data_directory, cluster.dataDir)) {
      throw blocked(`data_directory is ${proof.data_directory}, not the new cluster`);
    }
    if (String(proof.port) !== String(cluster.port)) {
      throw blocked(`server port is ${proof.port}, expected ${cluster.port}`);
    }
    if (proof.listen_addresses !== "127.0.0.1" || !String(proof.server_addr).startsWith("127.0.0.1")) {
      throw blocked(`server is not localhost-only: ${proof.listen_addresses} ${proof.server_addr}`);
    }
    if (proof.database_name !== database) {
      throw blocked(`connected to ${proof.database_name}`);
    }
    const databases = await client.query(
      `SELECT datname FROM pg_database WHERE datname NOT IN ('postgres', 'template0', 'template1', $1)`,
      [cluster.database],
    );
    if (databases.rows.length > 0) {
      throw blocked(`unexpected databases: ${databases.rows.map((row) => row.datname).join(", ")}`);
    }
    return proof;
  } finally {
    await client.end();
  }
}
