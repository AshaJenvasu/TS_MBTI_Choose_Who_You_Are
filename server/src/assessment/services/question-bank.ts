export type Dichotomy = "EI" | "SN" | "TF" | "JP";

export type Question = {
  id: number;
  text: string;
  dichotomy: Dichotomy;
  /** The letter an agreeing answer points to. The other letter of the axis is the reverse. */
  pole: string;
};

// PLACEHOLDER: the question texts are stand-ins. Real wording is written in the
// content stage. Only ids, axes and poles are final structure.
//
// Layout: ids 1-6 EI, 7-12 SN, 13-18 TF, 19-24 JP (fixed, never shuffled).
// Each axis has 4 items pointing to the first letter (E/S/T/J) and 2 reverse-scored
// items pointing to the second letter (I/N/F/P), in the fixed order
// [first, second, first, first, second, first].
// The uneven 4:2 split is on purpose: answering the same value everywhere (all 5 or
// all 1) can never tie, because the 4-item side always outweighs the 2-item side.
const AXES: ReadonlyArray<readonly [Dichotomy, string, string]> = [
  ["EI", "E", "I"],
  ["SN", "S", "N"],
  ["TF", "T", "F"],
  ["JP", "J", "P"],
];

const ITEMS_PER_AXIS = 6;

// true = the item points to the second (reverse-scored) letter of its axis.
const IS_SECOND_POLE = [false, true, false, false, true, false] as const;

export const QUESTIONS: readonly Question[] = AXES.flatMap(
  ([dichotomy, first, second], axisIndex) =>
    Array.from({ length: ITEMS_PER_AXIS }, (_, i) => {
      const pole = IS_SECOND_POLE[i] ? second : first;
      return {
        id: axisIndex * ITEMS_PER_AXIS + i + 1,
        text: `Placeholder ${dichotomy}-Q${i + 1} (pole=${pole})`,
        dichotomy,
        pole,
      };
    }),
);
