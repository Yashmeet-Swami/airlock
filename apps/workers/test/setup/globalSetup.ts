import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { Redis } from "ioredis";

const POSTGRES_CONTAINER_NAME = "airlock-test-postgres-workers";
const POSTGRES_PORT = 55433;
const DATABASE_URL = `postgres://airlock:airlock@localhost:${POSTGRES_PORT}/airlock`;

const REDIS_CONTAINER_NAME = "airlock-test-redis-workers";
// Avoid Windows' dynamic Hyper-V port exclusion ranges, same as the gateway's harness.
const REDIS_PORT = 57380;
const REDIS_URL = `redis://localhost:${REDIS_PORT}`;

const OPENSEARCH_CONTAINER_NAME = "airlock-test-opensearch-workers";
const OPENSEARCH_PORT = 9202;
const OPENSEARCH_URL = `http://localhost:${OPENSEARCH_PORT}`;

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await sleep(1000);
    }
  }
  throw new Error("Postgres test container did not become ready in time");
}

async function waitForRedis(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const client = new Redis(REDIS_URL, { lazyConnect: true, retryStrategy: () => null });
    try {
      await client.connect();
      await client.ping();
      client.disconnect();
      return;
    } catch {
      client.disconnect();
      await sleep(1000);
    }
  }
  throw new Error("Redis test container did not become ready in time");
}

async function waitForOpenSearch(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(`${OPENSEARCH_URL}/_cluster/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(2000);
  }
  throw new Error("OpenSearch test container did not become ready in time");
}

function removeContainer(name: string) {
  try {
    execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  } catch {
    // container didn't exist yet — fine
  }
}

async function runGatewayMigrationsWithRetry(attempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      execFileSync("npm", ["run", "migrate", "--workspace", "apps/gateway"], {
        stdio: "inherit",
        cwd: REPO_ROOT,
        env: { ...process.env, DATABASE_URL },
        shell: true,
      });
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      await sleep(2000);
    }
  }
}

/**
 * Workers has no migrations of its own (gateway owns the Postgres schema, per
 * the Phase 1 convention) — this harness runs gateway's migration files
 * against a throwaway Postgres container dedicated to workers' own test run.
 */
export async function setup(): Promise<void> {
  removeContainer(POSTGRES_CONTAINER_NAME);
  removeContainer(REDIS_CONTAINER_NAME);
  removeContainer(OPENSEARCH_CONTAINER_NAME);

  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      POSTGRES_CONTAINER_NAME,
      "-e",
      "POSTGRES_USER=airlock",
      "-e",
      "POSTGRES_PASSWORD=airlock",
      "-e",
      "POSTGRES_DB=airlock",
      "-p",
      `${POSTGRES_PORT}:5432`,
      "postgres:16-alpine",
    ],
    { stdio: "ignore" },
  );

  execFileSync(
    "docker",
    ["run", "-d", "--name", REDIS_CONTAINER_NAME, "-p", `${REDIS_PORT}:6379`, "redis:7-alpine"],
    { stdio: "ignore" },
  );

  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      OPENSEARCH_CONTAINER_NAME,
      "-e",
      "discovery.type=single-node",
      "-e",
      "DISABLE_SECURITY_PLUGIN=true",
      "-e",
      "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m",
      "-p",
      `${OPENSEARCH_PORT}:9200`,
      "opensearchproject/opensearch:2",
    ],
    { stdio: "ignore" },
  );

  process.env.DATABASE_URL = DATABASE_URL;
  process.env.REDIS_URL = REDIS_URL;
  process.env.OPENSEARCH_URL = OPENSEARCH_URL;
  process.env.LOG_LEVEL ??= "silent";
  // Fast, test-only retry/backoff schedule so retry-to-dead-letter tests don't
  // take ~13 real minutes (see Phase 3 plan, scope decision #3).
  process.env.WEBHOOK_MAX_ATTEMPTS = "3";
  process.env.WEBHOOK_BACKOFF_MS = "50,100,150";
  process.env.WEBHOOK_DELIVERY_TIMEOUT_MS = "2000";
  process.env.LOG_INDEXER_CONCURRENCY ??= "10";

  await Promise.all([waitForPostgres(), waitForRedis(), waitForOpenSearch()]);
  await sleep(1000);
  await runGatewayMigrationsWithRetry();
}

export async function teardown(): Promise<void> {
  removeContainer(POSTGRES_CONTAINER_NAME);
  removeContainer(REDIS_CONTAINER_NAME);
  removeContainer(OPENSEARCH_CONTAINER_NAME);
}
