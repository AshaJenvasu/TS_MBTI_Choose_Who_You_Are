import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client";
import { character, testResult } from "./schema";

/** The db or a transaction from `db.transaction()`: both run these queries the same way. */
type Executor = Pick<Db, "select" | "update">;

/**
 * Claim in ONE conditional UPDATE (ADR-003): sets the owner and clears the guest token
 * only while the row is still an unclaimed guest row holding this exact token.
 * Atomic, so two concurrent claims cannot both win (no check-then-write).
 * Returns true when this call claimed the row.
 */
export async function claimGuestResult(
  db: Executor,
  resultId: string,
  userId: string,
  guestToken: string,
) {
  const claimed = await db
    .update(testResult)
    .set({ userId, guestToken: null })
    .where(
      and(
        eq(testResult.id, resultId),
        isNull(testResult.userId),
        eq(testResult.guestToken, guestToken),
      ),
    )
    .returning({ id: testResult.id });
  return claimed.length === 1;
}

/**
 * One result, only if `userId` owns it, joined with its character.
 * Only the columns of the short item (never user_id / guest_token).
 */
export async function findOwnedResultItem(db: Executor, resultId: string, userId: string) {
  const [row] = await db
    .select({
      id: testResult.id,
      mbtiType: testResult.mbtiType,
      characterName: character.name,
      characterImageUrl: character.imageUrl,
      createdAt: testResult.createdAt,
    })
    .from(testResult)
    .innerJoin(character, eq(character.id, testResult.matchedCharacterId))
    .where(and(eq(testResult.id, resultId), eq(testResult.userId, userId)));
  return row;
}
