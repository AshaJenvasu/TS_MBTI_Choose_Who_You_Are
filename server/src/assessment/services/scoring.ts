// Placeholder question layout (final questions arrive in the content stage):
// Q1-5 E/I, Q6-10 S/N, Q11-15 T/F, Q16-20 J/P.
// Each answer is 1-5, so a block of 5 sums to 5-25 with 15 as the midpoint.
// Sum > 15 picks the first letter (E/S/T/J); 15 or less picks the second (I/N/F/P).
const DIMENSIONS = [
  ["E", "I"],
  ["S", "N"],
  ["T", "F"],
  ["J", "P"],
] as const;

const QUESTIONS_PER_DIMENSION = 5;
const MIDPOINT = 15;

/** Pure and deterministic: same answers always give the same type. */
export function calculateMbtiType(answers: readonly number[]): string {
  return DIMENSIONS.map(([first, second], i) => {
    const start = i * QUESTIONS_PER_DIMENSION;
    const sum = answers
      .slice(start, start + QUESTIONS_PER_DIMENSION)
      .reduce((total, value) => total + value, 0);
    return sum > MIDPOINT ? first : second;
  }).join("");
}
