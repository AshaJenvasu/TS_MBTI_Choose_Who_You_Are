import { DEFAULT_DATABASE_URL } from "../client";

/**
 * Test-database safety (H3). Tests may only ever touch a database whose name ends with
 * "_test", so `bun run test` can never wipe the dev database or a real (deploy) one.
 *
 * Two guard layers:
 *  1. Before any test runs: vitest.config.ts picks the URL with resolveTestDatabaseUrl
 *     (fails the run before any connection), then global-setup.ts asks Postgres with
 *     assertTestDatabase before migrating or seeding.
 *  2. Before every clear: clearTestData asks Postgres again before any DELETE.
 */

/** The minimum a guard needs: run one SQL text and read rows (pg.Pool / pg.Client fit). */
export type Queryable = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * The original env values, read BEFORE vitest's test.env overrides DATABASE_URL.
 * Passed in explicitly: this module never reads process.env itself.
 */
export type TestDbEnv = {
  TEST_DATABASE_URL?: string;
  DATABASE_URL?: string;
};

/**
 * Only plain lower-case names ending with "_test". Strict on purpose: the same check
 * guards CREATE DATABASE, where the name becomes a (quoted) SQL identifier.
 */
export function isTestDatabaseName(name: string): boolean {
  return /^[a-z0-9_]+$/.test(name) && name.endsWith("_test");
}

const refusal = (name: string, where: string) =>
  new Error(
    `Refusing to use database "${name}" for tests (${where}): ` +
      `the name must be lower-case [a-z0-9_] and end with "_test".`,
  );

/** The database name of a Postgres URL: the URL path only (never the query string). */
export function databaseNameOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Never echo the URL: it may hold a password.
    throw new Error("Test database URL is not a valid URL (TEST_DATABASE_URL).");
  }
  return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
}

/** Local docker-compose Postgres, database mbti_test (same server and role as dev). */
function defaultTestDatabaseUrl(): string {
  const url = new URL(DEFAULT_DATABASE_URL);
  url.pathname = "/mbti_test";
  return url.toString();
}

/**
 * Picks the URL tests use: TEST_DATABASE_URL, or the local mbti_test default.
 * Never DATABASE_URL. Throws when the name is not a test name, or when it is the same
 * database (by name, any host) as the ORIGINAL DATABASE_URL.
 */
export function resolveTestDatabaseUrl(env: TestDbEnv): string {
  const url = env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl();
  const name = databaseNameOf(url);
  if (!isTestDatabaseName(name)) throw refusal(name, "TEST_DATABASE_URL");

  if (env.DATABASE_URL) {
    let appName: string | undefined;
    try {
      appName = databaseNameOf(env.DATABASE_URL);
    } catch {
      appName = undefined; // an unparsable DATABASE_URL cannot name the same database
    }
    if (appName === name) {
      throw new Error(
        `Refusing to use database "${name}" for tests: it is also the database of DATABASE_URL. ` +
          `Point TEST_DATABASE_URL at a separate *_test database.`,
      );
    }
  }
  return url;
}

/** Asks Postgres which database the connection is really on; throws unless it ends with "_test". */
export async function assertTestDatabase(db: Queryable): Promise<void> {
  const { rows } = await db.query("select current_database()");
  const name = String(rows[0]?.current_database ?? "");
  if (!isTestDatabaseName(name)) throw refusal(name, "connected database");
}

/** The shared clearAll: guard first, then delete the per-test rows (never reference data). */
export async function clearTestData(db: Queryable): Promise<void> {
  await assertTestDatabase(db);
  // FK order: test_result points at "user"; session/account cascade but are cleared explicitly.
  await db.query(`delete from test_result`);
  await db.query(`delete from session`);
  await db.query(`delete from account`);
  await db.query(`delete from verification`);
  await db.query(`delete from "user"`);
}

/** pg error codes for "that database already exists" (incl. a concurrent CREATE). */
const ALREADY_EXISTS = new Set(["42P04", "23505"]);

/**
 * Creates the test database through an admin connection unless it already exists.
 * CREATE DATABASE cannot run in a transaction and has no IF NOT EXISTS, so: check
 * pg_database first, and treat "already exists" from a race as success.
 */
export async function createTestDatabaseIfMissing(
  admin: Queryable,
  name: string,
): Promise<"created" | "exists"> {
  if (!isTestDatabaseName(name)) throw refusal(name, "CREATE DATABASE");

  const { rows } = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (rows.length > 0) return "exists";

  try {
    // Safe to inline: the name matched ^[a-z0-9_]+$ above, and it is quoted as an identifier.
    await admin.query(`CREATE DATABASE "${name}"`);
    return "created";
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code && ALREADY_EXISTS.has(code)) return "exists";
    throw err;
  }
}
