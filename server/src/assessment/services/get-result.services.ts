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
 * Returns the result only to the guest token that owns it.
 * Guest tokens are the only owner check for now (sessions arrive with Epic 2).
 */
export async function getResult(
  db: Db,
  resultId: string,
  guestToken: string,
): Promise<GetResultResponse> {
  const row = await findResultWithTypeInfoById(db, resultId);

  // No row, a row with no guest token (not a guest result), or a different token:
  // all the same error.
  if (!row || row.guestToken === null || row.guestToken !== guestToken) {
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
    compatibleTypes: compatibility
      .filter((c) => c.kind === "compatible")
      .map((c) => c.otherType),
    challengingTypes: compatibility
      .filter((c) => c.kind === "challenging")
      .map((c) => c.otherType),
    // From the stored net scores (raw answers are not kept), so it matches submit exactly.
    breakdown: toBreakdown({
      EI: row.eiScore,
      SN: row.snScore,
      TF: row.tfScore,
      JP: row.jpScore,
    }),
  };
}
