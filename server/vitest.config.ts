import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl } from "./src/db/testing/test-database";

// Tests run on their own *_test database, never on DATABASE_URL (dev, or a real one later).
// Picked once here, from the ORIGINAL env (before test.env below overrides DATABASE_URL);
// a wrong TEST_DATABASE_URL fails the run right here, before any connection.
const testDatabaseUrl = resolveTestDatabaseUrl({
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
});

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // DB-backed test files share one Postgres and clear test_result between tests,
    // so files must not run at the same time.
    fileParallelism: false,
    // Creates/migrates/seeds the test database, then guards it (layer 1).
    globalSetup: ["./src/db/testing/global-setup.ts"],
    // Test files read the URL with testDatabaseUrl() (inject), never from DATABASE_URL.
    provide: { testDatabaseUrl },
    // Anything that still reads DATABASE_URL inside a test (e.g. createDb()) gets the test db.
    env: { DATABASE_URL: testDatabaseUrl },
  },
});
