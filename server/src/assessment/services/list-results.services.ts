import type { Db } from "../../db/client";
import {
  countResultsByUserId,
  findResultsByUserId,
} from "../repositories/list-results.repository";
import { PAGE_SIZE } from "./pagination";

export type ResultListItem = {
  id: string;
  mbtiType: string;
  character: { name: string; imageUrl: string };
  createdAt: string;
};

/** Columns a short result item is built from (list and claim select the same ones). */
export type ResultListItemRow = {
  id: string;
  mbtiType: string;
  characterName: string;
  characterImageUrl: string;
  createdAt: Date;
};

/** Row → whitelisted DTO, field by field. Shared by GET /results and the claim response. */
export const toResultListItem = (row: ResultListItemRow): ResultListItem => ({
  id: row.id,
  mbtiType: row.mbtiType,
  character: { name: row.characterName, imageUrl: row.characterImageUrl },
  createdAt: row.createdAt.toISOString(),
});

export type ResultPage = {
  items: ResultListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/**
 * One page of the signed-in user's results, newest first. `userId` must come from the
 * session (requireAuth), never from the request: that is the whole BOLA protection.
 * `page` is already validated (1..MAX_PAGE). The page and the total are two separate
 * reads, not one transaction: total may be slightly off if a result lands in between.
 */
export async function listResults(db: Db, userId: string, page: number): Promise<ResultPage> {
  const [rows, total] = await Promise.all([
    findResultsByUserId(db, userId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countResultsByUserId(db, userId),
  ]);
  return {
    items: rows.map(toResultListItem),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}
