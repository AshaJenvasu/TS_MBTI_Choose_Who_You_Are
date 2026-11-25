import { desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { character, testResult } from "./schema";

/**
 * All results owned by one user, newest first, joined with their character.
 * Only the columns the list shows are selected (never user_id / guest_token).
 */
export async function findResultsByUserId(db: Db, userId: string) {
  return db
    .select({
      id: testResult.id,
      mbtiType: testResult.mbtiType,
      characterName: character.name,
      characterImageUrl: character.imageUrl,
      createdAt: testResult.createdAt,
    })
    .from(testResult)
    .innerJoin(character, eq(character.id, testResult.matchedCharacterId))
    .where(eq(testResult.userId, userId))
    .orderBy(desc(testResult.createdAt));
}
