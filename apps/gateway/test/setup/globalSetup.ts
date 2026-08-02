import { execFileSync } from "node:child_process";
import pg from "pg";

const CONTAINER_NAME = "airlock-test-postgres";
const PORT = 55432;
const DATABASE_URL = `postgres://airlock:airlock@localhost:${PORT}/airlock`;

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

/**
 * Spins up a throwaway Postgres container so integration tests exercise the
 * real database (not a mock) — matching how the gateway actually runs. Requires
 * Docker to be available locally, same as `npm run dev`.
 */
export async function setup(): Promise<void> {
  try {
    execFileSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
  } catch {
    // container didn't exist yet — fine
  }

  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      CONTAINER_NAME,
      "-e",
      "POSTGRES_USER=airlock",
      "-e",
      "POSTGRES_PASSWORD=airlock",
      "-e",
      "POSTGRES_DB=airlock",
      "-p",
      `${PORT}:5432`,
      "postgres:16-alpine",
    ],
    { stdio: "ignore" },
  );

  process.env.DATABASE_URL = DATABASE_URL;
  process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
  process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret";
  process.env.LOG_LEVEL ??= "silent";

  await waitForPostgres();

  execFileSync("npm", ["run", "migrate"], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
}

export async function teardown(): Promise<void> {
  try {
    execFileSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
  } catch {
    // best-effort cleanup
  }
}
