import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

export type Db = NodePgDatabase;

export const DEFAULT_DATABASE_URL = "postgres://mbti:mbti@localhost:5433/mbti";

export function createDb(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL) {
  const pool = new pg.Pool({ connectionString: url });
  return { db: drizzle(pool) as Db, close: () => pool.end() };
}
