import type { Db } from "../../db/client";
import { type Breakdown, toBreakdown } from "./breakdown";
import {
  findCompatibilityByType,
  findResultWithTypeInfoById,
} from "../repositories/get-result.repository";

export type GetResultResponse = {
  mbtiType: string;
  character: { name: string; imageUrl: string; description: string };
  house: string;
  goldenPair: string;
  compatibleTypes: string[];
  challengingTypes: string[];
  breakdown: Breakdown;
};

/**
 * Thrown for a missing result AND for someone else's result, so the two cases
 * cannot be told apart from outside (OWASP API1 BOLA / resource enumeration).
 */
export class ResultNotFoundError extends Error {
  constructor() {
    super("Result not found");
  }
}

/**
 * Who is asking: a guest token from X-Guest-Token, or the session user's id.
 * The caller picks one (guest token first); there is no fallback between them.
 */
export type ResultViewer = { guestToken: string } | { userId: string };

const isOwner = (
  row: { guestToken: string | null; userId: string | null },
  viewer: ResultViewer,
) =>
  "guestToken" in viewer
    ? row.guestToken !== null && row.guestToken === viewer.guestToken
    : row.userId !== null && row.userId === viewer.userId;

/** Returns the result only to its owner: the guest token or the user that owns it. */
export async function getResult(
  db: Db,
  resultId: string,
  viewer: ResultViewer,
): Promise<GetResultResponse> {
  const row = await findResultWithTypeInfoById(db, resultId);

  // No row, or a row this viewer does not own (other token/user, or the other
  // owner kind): all the same error.
  if (!row || !isOwner(row, viewer)) {
    throw new ResultNotFoundError();
  }

  const compatibility = await findCompatibilityByType(db, row.mbtiType);

  return {
    mbtiType: row.mbtiType,
    character: {
      name: row.characterName,
      imageUrl: row.characterImageUrl,
      description: row.characterDescription,
    },
    house: row.house,
    goldenPair: row.goldenPairType,
    compatibleTypes: compatibility.filter((c) => c.kind === "compatible").map((c) => c.otherType),
    challengingTypes: compatibility.filter((c) => c.kind === "challenging").map((c) => c.otherType),
    // From the stored net scores (raw answers are not kept), so it matches submit exactly.
    breakdown: toBreakdown({
      EI: row.eiScore,
      SN: row.snScore,
      TF: row.tfScore,
      JP: row.jpScore,
    }),
  };
}
