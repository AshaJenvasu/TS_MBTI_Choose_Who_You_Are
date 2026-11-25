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

/** Scores the answers, matches the character, and records one TestResult. */
export async function submitTest(
  db: Db,
  answers: readonly Answer[],
  guestToken: string,
): Promise<SubmitTestResult> {
  // Score once: the same net scores give the type, the breakdown and the stored columns.
  const net = scoreAxes(answers);
  const mbtiType = mbtiTypeFromNet(net);

  const matched = await findCharacterAndGoldenPairByMbtiType(db, mbtiType);

  if (!matched) {
    // Reference data (Ticket 1 seed) is missing: a server problem, not a bad request.
    throw new Error(`No character seeded for MBTI type ${mbtiType}`);
  }

  // Auth is Epic 2: every request is a guest for now (user_id stays null).
  const resultId = await insertTestResult(db, {
    userId: null,
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
