import { QUESTIONS, type Dichotomy } from "./question-bank";

export type Answer = { questionId: number; value: number };

// [first letter, second letter] of each axis, in MBTI order.
const LETTERS: Record<Dichotomy, readonly [string, string]> = {
  EI: ["E", "I"],
  SN: ["S", "N"],
  TF: ["T", "F"],
  JP: ["J", "P"],
};

const AXIS_ORDER: readonly Dichotomy[] = ["EI", "SN", "TF", "JP"];

const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

/** Likert 1-5 -> weight -2..+2 (3 is neutral). */
export function likertToWeight(value: number): number {
  return value - 3;
}

/**
 * Net score per axis: (score of first letter) - (score of second letter).
 * Single pass over the answers, accumulating all 4 axes at once.
 * Each answer adds its weight to the side of the axis named by the question's pole,
 * so disagreeing (negative weight) with an item pushes toward the opposite letter.
 * The input must already be validated (see submit-test.schema.ts).
 */
export function scoreAxes(answers: readonly Answer[]): Record<Dichotomy, number> {
  const net: Record<Dichotomy, number> = { EI: 0, SN: 0, TF: 0, JP: 0 };

  for (const { questionId, value } of answers) {
    const question = QUESTION_BY_ID.get(questionId);
    if (!question) throw new Error(`Unknown questionId ${questionId}`);

    const [first] = LETTERS[question.dichotomy];
    const weight = likertToWeight(value);
    net[question.dichotomy] += question.pole === first ? weight : -weight;
  }

  return net;
}

/** Pure and deterministic: same answers always give the same type, in any order. */
export function calculateMbtiType(answers: readonly Answer[]): string {
  const net = scoreAxes(answers);

  return AXIS_ORDER.map((axis) => {
    const [first, second] = LETTERS[axis];
    // A tie (net === 0) goes to the letter that comes first in the MBTI convention
    // (E, S, T, J). Some letter must win, and the first-listed one is the
    // conventional default, so ties stay deterministic and easy to explain.
    return net[axis] >= 0 ? first : second;
  }).join("");
}
