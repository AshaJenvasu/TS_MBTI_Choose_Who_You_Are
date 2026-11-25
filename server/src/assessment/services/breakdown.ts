import type { Dichotomy } from "./question-bank";

/** Largest |net score| of one axis: 6 items per axis × Likert weight ±2. */
export const MAX_NET_SCORE = 12;

export type Breakdown = { ei: number; sn: number; tf: number; jp: number };

/**
 * Net axis score (-12..+12) → % of the axis's first letter (E/S/T/J), an integer 0..100.
 * The only place this formula lives: submit and result detail both call it.
 *
 * Rounding is symmetric around 50 (ties round away from 50), so mirror leanings show
 * mirror numbers: +3 → 63 and -3 → 37 (plain Math.round would give 38, i.e. I 62%).
 * -12/0/+12 land on 0/50/100 exactly; only net 0 gives 50, so the % never
 * contradicts the letter (ties go to E/S/T/J in scoring.ts).
 */
export function netScoreToPercentage(net: number): number {
  const raw = ((net + MAX_NET_SCORE) / (2 * MAX_NET_SCORE)) * 100; // 0..100
  const offset = raw - 50;
  const roundedOffset = Math.sign(offset) * Math.round(Math.abs(offset));
  return 50 + roundedOffset;
}

/** All four axes: net scores → % of each first letter. */
export function toBreakdown(net: Record<Dichotomy, number>): Breakdown {
  return {
    ei: netScoreToPercentage(net.EI),
    sn: netScoreToPercentage(net.SN),
    tf: netScoreToPercentage(net.TF),
    jp: netScoreToPercentage(net.JP),
  };
}
