// Placeholder reference data for the 16 MBTI types.
// Real names/descriptions/compatibility content arrive in the content stage.

// TODO: placeholder logic ชั่วคราว รอ content design จริงของ MBTI 16 type ในอนาคต
/**
 * Each type with its golden pair (the type with first and last letter flipped)
 * and its house (one house per type; placeholder names).
 */
export const MBTI_TYPES = [
  { typeCode: "INFJ", goldenPairType: "ENFP", house: "House INFJ Placeholder" },
  { typeCode: "INFP", goldenPairType: "ENFJ", house: "House INFP Placeholder" },
  { typeCode: "INTJ", goldenPairType: "ENTP", house: "House INTJ Placeholder" },
  { typeCode: "INTP", goldenPairType: "ENTJ", house: "House INTP Placeholder" },
  { typeCode: "ISFJ", goldenPairType: "ESFP", house: "House ISFJ Placeholder" },
  { typeCode: "ISFP", goldenPairType: "ESFJ", house: "House ISFP Placeholder" },
  { typeCode: "ISTJ", goldenPairType: "ESTP", house: "House ISTJ Placeholder" },
  { typeCode: "ISTP", goldenPairType: "ESTJ", house: "House ISTP Placeholder" },
  { typeCode: "ENFJ", goldenPairType: "INFP", house: "House ENFJ Placeholder" },
  { typeCode: "ENFP", goldenPairType: "INFJ", house: "House ENFP Placeholder" },
  { typeCode: "ENTJ", goldenPairType: "INTP", house: "House ENTJ Placeholder" },
  { typeCode: "ENTP", goldenPairType: "INTJ", house: "House ENTP Placeholder" },
  { typeCode: "ESFJ", goldenPairType: "ISFP", house: "House ESFJ Placeholder" },
  { typeCode: "ESFP", goldenPairType: "ISFJ", house: "House ESFP Placeholder" },
  { typeCode: "ESTJ", goldenPairType: "ISTP", house: "House ESTJ Placeholder" },
  { typeCode: "ESTP", goldenPairType: "ISTJ", house: "House ESTP Placeholder" },
] as const;

export const CHARACTERS = MBTI_TYPES.map(({ typeCode }) => ({
  mbtiType: typeCode,
  name: `Type ${typeCode} Placeholder`,
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

    const sameMiddle = a.typeCode[1] === b.typeCode[1] && a.typeCode[2] === b.typeCode[2];
    const oppositeMiddle = a.typeCode[1] !== b.typeCode[1] && a.typeCode[2] !== b.typeCode[2];

    if (sameMiddle) return [{ typeCode: a.typeCode, otherType: b.typeCode, kind: "compatible" }];
    if (oppositeMiddle)
      return [{ typeCode: a.typeCode, otherType: b.typeCode, kind: "challenging" }];
    return [];
  }),
);
