import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { CHARACTERS, COMPATIBILITY, MBTI_TYPES } from "./seed-data";
import { character, mbtiTypeCompatibility, mbtiTypeInfo } from "./schema";

/**
 * Inserts the reference data (16 types, 16 characters, 96 compatibility rows).
 * No side effects beyond the inserts: the caller owns the connection (opens and closes it).
 * Idempotent: onConflictDoNothing, so running it again adds nothing. No transaction.
 * Used by `bun run db:seed` (seed.ts) and by the test global setup.
 */
export async function seedReferenceData(db: NodePgDatabase): Promise<void> {
  // Insert order matters: types first, since everything else references them.
  await db.insert(mbtiTypeInfo).values([...MBTI_TYPES]).onConflictDoNothing();
  await db.insert(character).values(CHARACTERS).onConflictDoNothing();
  await db.insert(mbtiTypeCompatibility).values(COMPATIBILITY).onConflictDoNothing();
}
