import { describe, expect, it } from "vitest";
import { MAX_NET_SCORE, netScoreToPercentage, toBreakdown } from "./breakdown";

// Hand-computed: % of the first letter = 50 + (net / 24 * 100 rounded half away from 50).
// 100/24 = 4.1666…: net n → 50 + n·4.1666… → nearest integer, ties (.5) away from 50.
const EXPECTED: Record<number, number> = {
  [-12]: 0,
  [-11]: 4,
  [-10]: 8,
  [-9]: 12,
  [-8]: 17,
  [-7]: 21,
  [-6]: 25,
  [-5]: 29,
  [-4]: 33,
  [-3]: 37,
  [-2]: 42,
  [-1]: 46,
  0: 50,
  1: 54,
  2: 58,
  3: 63,
  4: 67,
  5: 71,
  6: 75,
  7: 79,
  8: 83,
  9: 88,
  10: 92,
  11: 96,
  12: 100,
};

describe("netScoreToPercentage — AC4 boundary values", () => {
  it("-12 → 0, 0 → 50, +12 → 100, exactly", () => {
    expect(netScoreToPercentage(-12)).toBe(0);
    expect(netScoreToPercentage(0)).toBe(50);
    expect(netScoreToPercentage(12)).toBe(100);
  });

  it("the range is ±12 (6 items per axis × Likert weight ±2)", () => {
    expect(MAX_NET_SCORE).toBe(12);
  });
});

describe("netScoreToPercentage — every possible net score", () => {
  it.each(Object.entries(EXPECTED).map(([n, p]) => [Number(n), p]))(
    "net %i → %i%%",
    (net, percent) => {
      const result = netScoreToPercentage(net);
      expect(result).toBe(percent);
      // No floating-point leftovers like 99.99999 or 4.1666.
      expect(Number.isInteger(result)).toBe(true);
    },
  );
});

describe("netScoreToPercentage — symmetric rounding", () => {
  it("mirror leanings show mirror numbers: p(n) + p(-n) = 100 for every n", () => {
    for (let n = 0; n <= MAX_NET_SCORE; n++) {
      expect(netScoreToPercentage(n) + netScoreToPercentage(-n)).toBe(100);
    }
  });

  it("the .5 cases round away from 50: +3 → 63 / -3 → 37, +9 → 88 / -9 → 12", () => {
    expect(netScoreToPercentage(3)).toBe(63);
    expect(netScoreToPercentage(-3)).toBe(37);
    expect(netScoreToPercentage(9)).toBe(88);
    expect(netScoreToPercentage(-9)).toBe(12);
  });

  it("only a tie shows 50%, so the % never contradicts the letter", () => {
    for (let n = -MAX_NET_SCORE; n <= MAX_NET_SCORE; n++) {
      if (n !== 0) expect(netScoreToPercentage(n)).not.toBe(50);
    }
  });
});

describe("toBreakdown", () => {
  it("maps each axis net score to the % of its first letter (E, S, T, J)", () => {
    expect(toBreakdown({ EI: 7, SN: -9, TF: 5, JP: 7 })).toEqual({
      ei: 79,
      sn: 12,
      tf: 71,
      jp: 79,
    });
  });
});
