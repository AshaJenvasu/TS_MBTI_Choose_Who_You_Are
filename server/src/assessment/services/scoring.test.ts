import { describe, expect, it } from "vitest";
import { calculateMbtiType } from "./scoring";

// Placeholder question layout (final questions arrive in the content stage):
// Q1-5 E/I, Q6-10 S/N, Q11-15 T/F, Q16-20 J/P.
// A high answer (sum > 15 of 5-25) picks the first letter (E/S/T/J).
// A sum of exactly 15 (tie) picks the second letter (I/N/F/P).
const fill = (...blocks: [number, number, number, number]) =>
  blocks.flatMap((v) => Array<number>(5).fill(v));

describe("calculateMbtiType", () => {
  it("returns ESTJ when every answer is 5", () => {
    expect(calculateMbtiType(Array<number>(20).fill(5))).toBe("ESTJ");
  });

  it("returns INFP when every answer is 1", () => {
    expect(calculateMbtiType(Array<number>(20).fill(1))).toBe("INFP");
  });

  it("maps each block of 5 answers to its own letter", () => {
    expect(calculateMbtiType(fill(5, 1, 1, 1))).toBe("ENFP");
    expect(calculateMbtiType(fill(1, 5, 1, 1))).toBe("ISFP");
    expect(calculateMbtiType(fill(1, 1, 5, 1))).toBe("INTP");
    expect(calculateMbtiType(fill(1, 1, 1, 5))).toBe("INFJ");
  });

  it("treats a tie (sum of exactly 15) as the second letter", () => {
    expect(calculateMbtiType(Array<number>(20).fill(3))).toBe("INFP");
  });

  it("flips the letter at the boundary (sum 16 vs 15)", () => {
    const sixteen = [4, 3, 3, 3, 3];
    const rest = Array<number>(15).fill(1);
    expect(calculateMbtiType([...sixteen, ...rest])[0]).toBe("E");
    const fifteen = [3, 3, 3, 3, 3];
    expect(calculateMbtiType([...fifteen, ...rest])[0]).toBe("I");
  });

  it("is deterministic and does not mutate its input", () => {
    const answers = [5, 4, 3, 2, 1, 1, 2, 3, 4, 5, 5, 5, 1, 1, 3, 2, 2, 4, 4, 1];
    const copy = [...answers];
    expect(calculateMbtiType(answers)).toBe(calculateMbtiType(answers));
    expect(answers).toEqual(copy);
  });
});
