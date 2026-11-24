import { describe, expect, it } from "vitest";
import { QUESTIONS } from "./question-bank";

const AXES = {
  EI: ["E", "I"],
  SN: ["S", "N"],
  TF: ["T", "F"],
  JP: ["J", "P"],
} as const;

describe("QUESTIONS", () => {
  it("has 24 questions with fixed ids 1..24 in order", () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1),
    );
  });

  it("has exactly 6 questions per axis", () => {
    for (const axis of Object.keys(AXES)) {
      expect(QUESTIONS.filter((q) => q.dichotomy === axis)).toHaveLength(6);
    }
  });

  it("only uses the two letters of its own axis as pole", () => {
    for (const q of QUESTIONS) {
      expect(AXES[q.dichotomy]).toContain(q.pole);
    }
  });

  it("mixes both poles in every axis, at least 2 reverse-scored items each way", () => {
    for (const [axis, [first, second]] of Object.entries(AXES)) {
      const items = QUESTIONS.filter((q) => q.dichotomy === axis);
      expect(items.filter((q) => q.pole === first).length).toBeGreaterThanOrEqual(2);
      expect(items.filter((q) => q.pole === second).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("has 4 first-letter and 2 second-letter items per axis, in a fixed order", () => {
    for (const [axis, [first, second]] of Object.entries(AXES)) {
      const poles = QUESTIONS.filter((q) => q.dichotomy === axis).map((q) => q.pole);
      // positions 1,3,4,6 -> first letter; positions 2,5 -> second letter
      expect(poles).toEqual([first, second, first, first, second, first]);
    }
  });

  it("has a non-empty text for every question", () => {
    for (const q of QUESTIONS) expect(q.text.length).toBeGreaterThan(0);
  });
});
