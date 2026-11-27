import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { seedReferenceData } from "../../assessment/repositories/seed-reference-data";
import { assertTestDatabase, createTestDatabaseIfMissing, databaseNameOf } from "./test-database";

const MIGRATIONS = fileURLToPath(new URL("../../../drizzle", import.meta.url));

/**
 * Runs once before all test files (vitest globalSetup). Uses the URL vitest.config.ts
 * already picked and checked (resolveTestDatabaseUrl), passed through `provide`:
 *  1. connect to the server's maintenance database "postgres" → create the test db if missing
 *  2. connect to the test db → guard layer 1 (current_database() must end with _test)
 *  3. apply every migration (drizzle-orm migrator) → seed reference data (idempotent)
 */
export default async function setup(project: TestProject) {
  const url = project.getProvidedContext().testDatabaseUrl;
  const name = databaseNameOf(url);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await createTestDatabaseIfMissing(admin, name);
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: url });
  try {
    await assertTestDatabase(pool);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS });
    await seedReferenceData(db);
  } finally {
    await pool.end();
  }
}
