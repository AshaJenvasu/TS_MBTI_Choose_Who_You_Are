import { eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { character, mbtiTypeInfo, testResult } from "./schema";

/** One join: the character seeded for a type, plus that type's golden pair. */
export async function findCharacterAndGoldenPairByMbtiType(
  db: Db,
  mbtiType: string,
) {
  const [row] = await db
    .select({
      characterId: character.id,
      name: character.name,
      house: mbtiTypeInfo.house,
      imageUrl: character.imageUrl,
      description: character.description,
      goldenPairType: mbtiTypeInfo.goldenPairType,
    })
    .from(mbtiTypeInfo)
    .innerJoin(character, eq(character.mbtiType, mbtiTypeInfo.typeCode))
    .where(eq(mbtiTypeInfo.typeCode, mbtiType));
  return row;
}

export type NewTestResult = {
  userId: string | null;
  guestToken: string | null;
  mbtiType: string;
  matchedCharacterId: number;
  /** Net axis scores from scoreAxes(), -12..+12 each. */
  eiScore: number;
  snScore: number;
  tfScore: number;
  jpScore: number;
};

/** Inserts one test_result row and returns its generated id. */
export async function insertTestResult(db: Db, values: NewTestResult) {
  const [saved] = await db
    .insert(testResult)
    .values(values)
    .returning({ id: testResult.id });
  return saved!.id;
}
