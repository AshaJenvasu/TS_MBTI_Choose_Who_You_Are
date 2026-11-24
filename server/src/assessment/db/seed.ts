import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { CHARACTERS, COMPATIBILITY, MBTI_TYPES } from "./seed-data";
import { character, mbtiTypeCompatibility, mbtiTypeInfo } from "./schema";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://mbti:mbti@localhost:5433/mbti",
});
const db = drizzle(pool);

// Insert order matters: types first, since everything else references them.
await db.insert(mbtiTypeInfo).values([...MBTI_TYPES]).onConflictDoNothing();
await db.insert(character).values(CHARACTERS).onConflictDoNothing();
await db.insert(mbtiTypeCompatibility).values(COMPATIBILITY).onConflictDoNothing();

await pool.end();
