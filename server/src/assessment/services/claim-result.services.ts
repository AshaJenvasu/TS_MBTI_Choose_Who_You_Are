import type { Db } from "../../db/client";
import {
  claimGuestResult,
  findOwnedResultItem,
} from "../repositories/claim-result.repository";
import { ResultNotFoundError } from "./get-result.services";
import { type ResultListItem, toResultListItem } from "./list-results.services";

// guest_token is a uuid column: a non-UUID value would make Postgres throw (a 500),
// so such a token simply cannot match and never reaches the UPDATE.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Claims a guest result for the signed-in user (`userId` from the session only).
 * - Unclaimed row + matching token → claimed (user_id = me, guest_token = NULL).
 * - Nothing claimed but the row is already mine (a retry) → same result, no change.
 * - Anything else (someone else's, wrong token, no such id) → ResultNotFoundError (one 404).
 * UPDATE and read run in one transaction.
 */
export async function claimResult(
  db: Db,
  resultId: string,
  userId: string,
  guestToken: string,
): Promise<ResultListItem> {
  return db.transaction(async (tx) => {
    if (UUID.test(guestToken)) {
      await claimGuestResult(tx, resultId, userId, guestToken);
    }
    // Claimed just now or by an earlier retry: either way the row must be mine now.
    const row = await findOwnedResultItem(tx, resultId, userId);
    if (!row) throw new ResultNotFoundError();
    return toResultListItem(row);
  });
}
