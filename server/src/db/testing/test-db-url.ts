import { inject } from "vitest";
import { databaseNameOf, isTestDatabaseName } from "./test-database";

declare module "vitest" {
  interface ProvidedContext {
    /** Set once in vitest.config.ts by resolveTestDatabaseUrl (never from DATABASE_URL). */
    testDatabaseUrl: string;
  }
}

/**
 * The test database URL, for test files (workers). Comes from vitest.config.ts through
 * `provide`/`inject`, so tests never read DATABASE_URL themselves.
 */
export function testDatabaseUrl(): string {
  const url = inject("testDatabaseUrl");
  // Cheap re-check of the name; the real guard is clearTestData asking Postgres.
  const name = databaseNameOf(url);
  if (!isTestDatabaseName(name)) {
    throw new Error(`Refusing to use database "${name}" for tests: the name must end with "_test".`);
  }
  return url;
}
