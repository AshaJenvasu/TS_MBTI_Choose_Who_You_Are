import type { Db } from "../../db/client";
import {
  findCharacterAndGoldenPairByMbtiType,
  insertTestResult,
} from "../repositories/submit-test.repository";
import { type Breakdown, toBreakdown } from "./breakdown";
import { mbtiTypeFromNet, scoreAxes, type Answer } from "./scoring";

export type SubmitTestResult = {
  resultId: string;
  guestToken: string | null;
  mbtiType: string;
  character: {
    name: string;
    house: string;
    imageUrl: string;
    description: string;
  };
  goldenPairType: string;
  breakdown: Breakdown;
};

/**
 * Who owns the new TestResult: the signed-in user (id from the session only),
 * or a guest identified by a fresh guest token.
 */
export type ResultOwner = { userId: string } | { guestToken: string };

/** Scores the answers, matches the character, and records one TestResult. */
export async function submitTest(
  db: Db,
  answers: readonly Answer[],
  owner: ResultOwner,
): Promise<SubmitTestResult> {
  // Score once: the same net scores give the type, the breakdown and the stored columns.
  const net = scoreAxes(answers);
  const mbtiType = mbtiTypeFromNet(net);

  const matched = await findCharacterAndGoldenPairByMbtiType(db, mbtiType);

  if (!matched) {
    // Reference data (Ticket 1 seed) is missing: a server problem, not a bad request.
    throw new Error(`No character seeded for MBTI type ${mbtiType}`);
  }

  // Exactly one owner column is set: user_id for a signed-in user, guest_token for a guest.
  const userId = "userId" in owner ? owner.userId : null;
  const guestToken = "guestToken" in owner ? owner.guestToken : null;

  const resultId = await insertTestResult(db, {
    userId,
    guestToken,
    mbtiType,
    matchedCharacterId: matched.characterId,
    eiScore: net.EI,
    snScore: net.SN,
    tfScore: net.TF,
    jpScore: net.JP,
  });

  return {
    resultId,
    guestToken,
    mbtiType,
    character: {
      name: matched.name,
      house: matched.house,
      imageUrl: matched.imageUrl,
      description: matched.description,
    },
    goldenPairType: matched.goldenPairType,
    breakdown: toBreakdown(net),
  };
}
