import type { Db } from "../../db/client";
import { findResultsByUserId } from "../repositories/list-results.repository";

export type ResultListItem = {
  id: string;
  mbtiType: string;
  character: { name: string; imageUrl: string };
  createdAt: string;
};

/**
 * The signed-in user's results, newest first. `userId` must come from the session
 * (requireAuth), never from the request: that is the whole BOLA protection.
 */
export async function listResults(db: Db, userId: string): Promise<ResultListItem[]> {
  const rows = await findResultsByUserId(db, userId);
  return rows.map((row) => ({
    id: row.id,
    mbtiType: row.mbtiType,
    character: { name: row.characterName, imageUrl: row.characterImageUrl },
    createdAt: row.createdAt.toISOString(),
  }));
}
