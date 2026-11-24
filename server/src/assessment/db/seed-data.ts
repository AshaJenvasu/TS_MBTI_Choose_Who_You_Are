// Placeholder reference data for the 16 MBTI types.
// Real names/descriptions/compatibility content arrive in the content stage.

// TODO: placeholder logic ชั่วคราว รอ content design จริงของ MBTI 16 type ในอนาคต
/** Each type with its golden pair (the type with first and last letter flipped). */
export const MBTI_TYPES = [
  { typeCode: "INFJ", goldenPairType: "ENFP" },
  { typeCode: "INFP", goldenPairType: "ENFJ" },
  { typeCode: "INTJ", goldenPairType: "ENTP" },
  { typeCode: "INTP", goldenPairType: "ENTJ" },
  { typeCode: "ISFJ", goldenPairType: "ESFP" },
  { typeCode: "ISFP", goldenPairType: "ESFJ" },
  { typeCode: "ISTJ", goldenPairType: "ESTP" },
  { typeCode: "ISTP", goldenPairType: "ESTJ" },
  { typeCode: "ENFJ", goldenPairType: "INFP" },
  { typeCode: "ENFP", goldenPairType: "INFJ" },
  { typeCode: "ENTJ", goldenPairType: "INTP" },
  { typeCode: "ENTP", goldenPairType: "INTJ" },
  { typeCode: "ESFJ", goldenPairType: "ISFP" },
  { typeCode: "ESFP", goldenPairType: "ISFJ" },
  { typeCode: "ESTJ", goldenPairType: "ISTP" },
  { typeCode: "ESTP", goldenPairType: "ISTJ" },
] as const;

export const CHARACTERS = MBTI_TYPES.map(({ typeCode }) => ({
  mbtiType: typeCode,
  name: `Type ${typeCode} Placeholder`,
  house: `House ${typeCode} Placeholder`,
  imageUrl: `/placeholder/${typeCode.toLowerCase()}.png`,
  description: `Type ${typeCode} Placeholder description`,
}));

type CompatibilityRow = {
  typeCode: string;
  otherType: string;
  kind: "compatible" | "challenging";
};

// TODO: placeholder logic ชั่วคราว รอ content design จริงของ MBTI 16 type ในอนาคต
/**
 * Placeholder rule (not final content):
 * - compatible:  same N/S and T/F letters (excluding self and golden pair)
 * - challenging: both N/S and T/F letters differ
 * The rule is symmetric, so every pair is stored in both directions.
 */
export const COMPATIBILITY: CompatibilityRow[] = MBTI_TYPES.flatMap((a) =>
  MBTI_TYPES.flatMap((b): CompatibilityRow[] => {
    const isSelf = a.typeCode === b.typeCode;
    const isGolden = a.goldenPairType === b.typeCode;
    if (isSelf || isGolden) return [];

    const sameMiddle =
      a.typeCode[1] === b.typeCode[1] && a.typeCode[2] === b.typeCode[2];
    const oppositeMiddle =
      a.typeCode[1] !== b.typeCode[1] && a.typeCode[2] !== b.typeCode[2];

    if (sameMiddle)
      return [{ typeCode: a.typeCode, otherType: b.typeCode, kind: "compatible" }];
    if (oppositeMiddle)
      return [{ typeCode: a.typeCode, otherType: b.typeCode, kind: "challenging" }];
    return [];
  }),
);
