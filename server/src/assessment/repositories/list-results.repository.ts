import { count, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { character, testResult } from "./schema";

/**
 * One page of a user's results, newest first, joined with their character.
 * `id DESC` breaks ties on created_at so every row lands on exactly one page.
 * Only the columns the list shows are selected (never user_id / guest_token).
 */
export async function findResultsByUserId(
  db: Db,
  userId: string,
  { limit, offset }: { limit: number; offset: number },
) {
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
    .orderBy(desc(testResult.createdAt), desc(testResult.id))
    .limit(limit)
    .offset(offset);
}

/**
 * How many results one user owns. No join with character: matched_character_id is
 * NOT NULL with a FK to character.id, so every row the list joins is counted here too.
 */
export async function countResultsByUserId(db: Db, userId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(testResult)
    .where(eq(testResult.userId, userId));
  return row?.total ?? 0;
}
