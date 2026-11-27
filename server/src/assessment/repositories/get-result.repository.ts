import { asc, eq } from "drizzle-orm";
import type { Db } from "../../db/client";
import { character, mbtiTypeCompatibility, mbtiTypeInfo, testResult } from "./schema";

/** A test result joined with its character and type info, or undefined if no such id. */
export async function findResultWithTypeInfoById(db: Db, resultId: string) {
  const [row] = await db
    .select({
      // Owner columns: used for the ownership check only, never returned to the client.
      userId: testResult.userId,
      guestToken: testResult.guestToken,
      mbtiType: testResult.mbtiType,
      characterName: character.name,
      characterImageUrl: character.imageUrl,
      characterDescription: character.description,
      house: mbtiTypeInfo.house,
      goldenPairType: mbtiTypeInfo.goldenPairType,
      eiScore: testResult.eiScore,
      snScore: testResult.snScore,
      tfScore: testResult.tfScore,
      jpScore: testResult.jpScore,
    })
    .from(testResult)
    .innerJoin(character, eq(character.id, testResult.matchedCharacterId))
    .innerJoin(mbtiTypeInfo, eq(mbtiTypeInfo.typeCode, testResult.mbtiType))
    .where(eq(testResult.id, resultId));
  return row;
}

/** Compatible/challenging type codes of one type, in a stable (alphabetical) order. */
export async function findCompatibilityByType(db: Db, typeCode: string) {
  return db
    .select({
      otherType: mbtiTypeCompatibility.otherType,
      kind: mbtiTypeCompatibility.kind,
    })
    .from(mbtiTypeCompatibility)
    .where(eq(mbtiTypeCompatibility.typeCode, typeCode))
    .orderBy(asc(mbtiTypeCompatibility.otherType));
}
