import { execFileSync } from "node:child_process";
import pg from "pg";
import { Redis } from "ioredis";

const POSTGRES_CONTAINER_NAME = "airlock-test-postgres";
const POSTGRES_PORT = 55432;
const DATABASE_URL = `postgres://airlock:airlock@localhost:${POSTGRES_PORT}/airlock`;

const REDIS_CONTAINER_NAME = "airlock-test-redis";
// Avoid Windows' dynamic Hyper-V port exclusion ranges (`netsh interface ipv4
// show excludedportrange protocol=tcp`), which can otherwise block bind().
const REDIS_PORT = 57379;
const REDIS_URL = `redis://localhost:${REDIS_PORT}`;

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

async function runMigrationsWithRetry(attempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      execFileSync("npm", ["run", "migrate"], { stdio: "inherit", env: process.env, shell: true });
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      await sleep(2000);
    }
  }
}

function removeContainer(name: string) {
  try {
    execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  } catch {
    // container didn't exist yet — fine
  }
}

/**
 * Spins up throwaway Postgres + Redis containers so integration tests exercise
 * the real dependencies (not mocks) — matching how the gateway actually runs.
 * Requires Docker to be available locally, same as `npm run dev`.
 */
export async function setup(): Promise<void> {
  removeContainer(POSTGRES_CONTAINER_NAME);
  removeContainer(REDIS_CONTAINER_NAME);

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

  process.env.DATABASE_URL = DATABASE_URL;
  process.env.REDIS_URL = REDIS_URL;
  process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
  process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret";
  process.env.LOG_LEVEL ??= "silent";

  await Promise.all([waitForPostgres(), waitForRedis()]);

  // Postgres's docker-entrypoint briefly starts and stops an internal server to
  // run initdb before the real one comes up — a successful connect() can land
  // in that window and then reset. A short settle + a couple of retries absorbs it.
  await sleep(1000);
  await runMigrationsWithRetry();
}

export async function teardown(): Promise<void> {
  removeContainer(POSTGRES_CONTAINER_NAME);
  removeContainer(REDIS_CONTAINER_NAME);
}
