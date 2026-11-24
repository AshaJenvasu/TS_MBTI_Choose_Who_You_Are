import { describe, expect, it } from "vitest";
import { QUESTIONS } from "./question-bank";
import { calculateMbtiType, likertToWeight, scoreAxes } from "./scoring";

// Question bank layout (ids are fixed): 1-6 EI, 7-12 SN, 13-18 TF, 19-24 JP.
// Inside each axis, 4 items point to the first letter (E/S/T/J) at positions 1,3,4,6
// and 2 items point to the second letter (I/N/F/P) at positions 2,5.
// Per axis: net = (sum of weights on first-letter items) - (sum on second-letter items).
//   net > 0 -> first letter, net < 0 -> second letter, net = 0 -> first letter.
// weight = value - 3.

/** Builds the 24 answers from 4 groups of 6 values, one group per axis, in id order. */
const answers = (...groups: [number[], number[], number[], number[]]) =>
  groups.flat().map((value, i) => ({ questionId: i + 1, value }));

const NEUTRAL = [3, 3, 3, 3, 3, 3];
const all = (value: number) => answers(...([0, 1, 2, 3].map(() => Array<number>(6).fill(value)) as [number[], number[], number[], number[]]));

describe("likertToWeight", () => {
  it.each([
    [1, -2],
    [2, -1],
    [3, 0],
    [4, 1],
    [5, 2],
  ])("maps Likert %i to weight %i", (value, weight) => {
    expect(likertToWeight(value)).toBe(weight);
  });
});

describe("calculateMbtiType — reverse-scored items", () => {
  it("agreeing with a first-letter item pushes toward that letter", () => {
    // EI: E item (pos 1) = 5 -> +2 -> net +2 -> E
    const set = answers([5, 3, 3, 3, 3, 3], NEUTRAL, NEUTRAL, NEUTRAL);
    expect(scoreAxes(set).EI).toBe(2);
    expect(calculateMbtiType(set)).toBe("ESTJ");
  });

  it("agreeing with a second-letter item pushes toward that letter", () => {
    // EI: I item (pos 2) = 5 -> I +2 -> net -2 -> I
    const set = answers([3, 5, 3, 3, 3, 3], NEUTRAL, NEUTRAL, NEUTRAL);
    expect(scoreAxes(set).EI).toBe(-2);
    expect(calculateMbtiType(set)).toBe("ISTJ");
  });

  it("disagreeing with a first-letter item pushes toward the other letter", () => {
    // EI: E item (pos 3) = 2 -> E -1 -> net -1 -> I
    const set = answers([3, 3, 2, 3, 3, 3], NEUTRAL, NEUTRAL, NEUTRAL);
    expect(scoreAxes(set).EI).toBe(-1);
    expect(calculateMbtiType(set)).toBe("ISTJ");
  });

  it("disagreeing with a second-letter item pushes toward the other letter", () => {
    // EI: I item (pos 5) = 2 -> I -1 -> net = 0 - (-1) = +1 -> E
    const set = answers([3, 3, 3, 3, 2, 3], NEUTRAL, NEUTRAL, NEUTRAL);
    expect(scoreAxes(set).EI).toBe(1);
    expect(calculateMbtiType(set)).toBe("ESTJ");
  });

  it("applies the same direction on every axis", () => {
    // first-letter items = 1 (-2 each, 4 items = -8), second-letter items = 5 (+2 each, 2 items = +4)
    const toSecond = [1, 5, 1, 1, 5, 1];
    expect(scoreAxes(answers(toSecond, toSecond, toSecond, toSecond))).toEqual({
      EI: -12,
      SN: -12,
      TF: -12,
      JP: -12,
    });
    expect(calculateMbtiType(answers(toSecond, toSecond, toSecond, toSecond))).toBe("INFP");

    // first-letter items = 5 (+8), second-letter items = 1 (-4) -> net +12
    const toFirst = [5, 1, 5, 5, 1, 5];
    expect(calculateMbtiType(answers(toFirst, toFirst, toFirst, toFirst))).toBe("ESTJ");
  });
});

describe("calculateMbtiType — uniform answers (4:2 split)", () => {
  it("answering 5 everywhere is not a tie: 4 first-letter items outweigh 2", () => {
    // per axis: first +2*4 = +8, second +2*2 = +4, net 8 - 4 = +4
    expect(scoreAxes(all(5))).toEqual({ EI: 4, SN: 4, TF: 4, JP: 4 });
    expect(calculateMbtiType(all(5))).toBe("ESTJ");
  });

  it("answering 1 everywhere is not a tie: second letter wins every axis", () => {
    // per axis: first -2*4 = -8, second -2*2 = -4, net -8 - (-4) = -4
    expect(scoreAxes(all(1))).toEqual({ EI: -4, SN: -4, TF: -4, JP: -4 });
    expect(calculateMbtiType(all(1))).toBe("INFP");
  });

  it("answering 3 everywhere (neutral) falls back to ESTJ on purpose", () => {
    expect(scoreAxes(all(3))).toEqual({ EI: 0, SN: 0, TF: 0, JP: 0 });
    expect(calculateMbtiType(all(3))).toBe("ESTJ");
  });
});

describe("calculateMbtiType — ties default to E/S/T/J", () => {
  it("a non-trivial exact tie (first +1, second +1 -> net 0) picks E", () => {
    const set = answers([4, 4, 3, 3, 3, 3], NEUTRAL, NEUTRAL, NEUTRAL);
    expect(scoreAxes(set).EI).toBe(0);
    expect(calculateMbtiType(set)).toBe("ESTJ");
  });

  it("net -1 is enough to pick the second letter", () => {
    // EI: I item (pos 2) = 4 -> I +1 -> net -1 -> I
    const set = answers([3, 4, 3, 3, 3, 3], NEUTRAL, NEUTRAL, NEUTRAL);
    expect(scoreAxes(set).EI).toBe(-1);
    expect(calculateMbtiType(set)).toBe("ISTJ");
  });
});

describe("calculateMbtiType — hand-computed full 24-answer sets", () => {
  it("set 1 -> ENFP", () => {
    // EI [4,2,3,3,4,5]: first (pos 1,3,4,6) 4,3,3,5 = +1+0+0+2 = 3; second (pos 2,5) 2,4 = -1+1 = 0; net 3-0 = +3 -> E
    // SN [2,4,1,5,3,4]: first 2,1,5,4 = -1-2+2+1 = 0; second 4,3 = +1+0 = 1; net 0-1 = -1 -> N
    // TF [5,5,4,2,2,1]: first 5,4,2,1 = +2+1-1-2 = 0; second 5,2 = +2-1 = 1; net 0-1 = -1 -> F
    // JP [1,3,2,4,3,3]: first 1,2,4,3 = -2-1+1+0 = -2; second 3,3 = 0+0 = 0; net -2-0 = -2 -> P
    const set = answers(
      [4, 2, 3, 3, 4, 5],
      [2, 4, 1, 5, 3, 4],
      [5, 5, 4, 2, 2, 1],
      [1, 3, 2, 4, 3, 3],
    );
    expect(scoreAxes(set)).toEqual({ EI: 3, SN: -1, TF: -1, JP: -2 });
    expect(calculateMbtiType(set)).toBe("ENFP");
  });

  it("set 2 (three axes tie) -> ISTJ", () => {
    // EI [2,5,1,4,2,4]: first 2,1,4,4 = -1-2+1+1 = -1; second 5,2 = +2-1 = 1; net -1-1 = -2 -> I
    // SN [5,2,4,1,5,3]: first 5,4,1,3 = +2+1-2+0 = 1; second 2,5 = -1+2 = 1; net 1-1 = 0 -> tie -> S
    // TF [1,5,2,4,1,5]: first 1,2,4,5 = -2-1+1+2 = 0; second 5,1 = +2-2 = 0; net 0 -> tie -> T
    // JP [4,3,5,2,3,1]: first 4,5,2,1 = +1+2-1-2 = 0; second 3,3 = 0; net 0 -> tie -> J
    const set = answers(
      [2, 5, 1, 4, 2, 4],
      [5, 2, 4, 1, 5, 3],
      [1, 5, 2, 4, 1, 5],
      [4, 3, 5, 2, 3, 1],
    );
    expect(scoreAxes(set)).toEqual({ EI: -2, SN: 0, TF: 0, JP: 0 });
    expect(calculateMbtiType(set)).toBe("ISTJ");
  });

  it("set 3 (three axes tie) -> ESTJ", () => {
    // EI [5,3,4,4,3,2]: first 5,4,4,2 = +2+1+1-1 = 3; second 3,3 = 0; net +3 -> E
    // SN [3,3,3,3,3,3]: all 0; net 0 -> tie -> S
    // TF [2,4,1,5,2,4]: first 2,1,5,4 = -1-2+2+1 = 0; second 4,2 = +1-1 = 0; net 0 -> tie -> T
    // JP [3,5,2,4,3,5]: first 3,2,4,5 = 0-1+1+2 = 2; second 5,3 = +2+0 = 2; net 2-2 = 0 -> tie -> J
    const set = answers(
      [5, 3, 4, 4, 3, 2],
      [3, 3, 3, 3, 3, 3],
      [2, 4, 1, 5, 2, 4],
      [3, 5, 2, 4, 3, 5],
    );
    expect(scoreAxes(set)).toEqual({ EI: 3, SN: 0, TF: 0, JP: 0 });
    expect(calculateMbtiType(set)).toBe("ESTJ");
  });

  it("set 4 (all axes decided) -> ISFP", () => {
    // EI [1,5,2,4,4,2]: first 1,2,4,2 = -2-1+1-1 = -3; second 5,4 = +2+1 = 3; net -3-3 = -6 -> I
    // SN [4,2,5,1,3,3]: first 4,5,1,3 = +1+2-2+0 = 1; second 2,3 = -1+0 = -1; net 1+1 = +2 -> S
    // TF [2,4,1,3,5,2]: first 2,1,3,2 = -1-2+0-1 = -4; second 4,5 = +1+2 = 3; net -4-3 = -7 -> F
    // JP [2,5,1,3,4,3]: first 2,1,3,3 = -1-2+0+0 = -3; second 5,4 = +2+1 = 3; net -3-3 = -6 -> P
    const set = answers(
      [1, 5, 2, 4, 4, 2],
      [4, 2, 5, 1, 3, 3],
      [2, 4, 1, 3, 5, 2],
      [2, 5, 1, 3, 4, 3],
    );
    expect(scoreAxes(set)).toEqual({ EI: -6, SN: 2, TF: -7, JP: -6 });
    expect(calculateMbtiType(set)).toBe("ISFP");
  });

  it("set 5 (all axes decided) -> ENTJ", () => {
    // EI [5,2,4,3,1,4]: first 5,4,3,4 = +2+1+0+1 = 4; second 2,1 = -1-2 = -3; net 4+3 = +7 -> E
    // SN [1,4,2,2,5,1]: first 1,2,2,1 = -2-1-1-2 = -6; second 4,5 = +1+2 = 3; net -6-3 = -9 -> N
    // TF [4,3,5,3,2,4]: first 4,5,3,4 = +1+2+0+1 = 4; second 3,2 = 0-1 = -1; net 4+1 = +5 -> T
    // JP [5,1,4,4,2,3]: first 5,4,4,3 = +2+1+1+0 = 4; second 1,2 = -2-1 = -3; net 4+3 = +7 -> J
    const set = answers(
      [5, 2, 4, 3, 1, 4],
      [1, 4, 2, 2, 5, 1],
      [4, 3, 5, 3, 2, 4],
      [5, 1, 4, 4, 2, 3],
    );
    expect(scoreAxes(set)).toEqual({ EI: 7, SN: -9, TF: 5, JP: 7 });
    expect(calculateMbtiType(set)).toBe("ENTJ");
  });
});

describe("calculateMbtiType — purity", () => {
  it("is deterministic, ignores answer order, and does not mutate input", () => {
    const set = answers(
      [4, 2, 3, 3, 4, 5],
      [2, 4, 1, 5, 3, 4],
      [5, 5, 4, 2, 2, 1],
      [1, 3, 2, 4, 3, 3],
    );
    const copy = set.map((a) => ({ ...a }));
    const reversed = [...set].reverse();

    expect(calculateMbtiType(set)).toBe(calculateMbtiType(set));
    expect(calculateMbtiType(reversed)).toBe(calculateMbtiType(set));
    expect(set).toEqual(copy);
    expect(set).toHaveLength(QUESTIONS.length);
  });
});
