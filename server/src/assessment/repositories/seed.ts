import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { seedReferenceData } from "./seed-reference-data";

// CLI wrapper for `bun run db:seed`: owns the connection, the inserts live in seedReferenceData.

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://mbti:mbti@localhost:5433/mbti",
});
const db = drizzle(pool);

await seedReferenceData(db);

await pool.end();
