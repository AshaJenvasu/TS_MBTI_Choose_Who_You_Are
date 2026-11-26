import { z } from "@hono/zod-openapi";
import { QUESTIONS } from "../services/question-bank";
import { BreakdownSchema } from "./breakdown.schema";

const QUESTION_IDS = new Set(QUESTIONS.map((q) => q.id));

// Example body for docs UIs (Scalar generates a broken one otherwise: every
// questionId = 1). One value per question, in id order; this set scores ISFP.
const EXAMPLE_VALUES = [
  1, 5, 2, 4, 4, 2, 4, 2, 5, 1, 3, 3, 2, 4, 1, 3, 5, 2, 2, 5, 1, 3, 4, 3,
];
const EXAMPLE_ANSWERS = QUESTIONS.map((q, i) => ({
  questionId: q.id,
  value: EXAMPLE_VALUES[i]!,
}));

const Answer = z.object({
  questionId: z.number().int().openapi({
    description: "id of a question in the question bank (1-24)",
  }),
  value: z.number().int().min(1).max(5).openapi({
    description: "Likert value: 1 strongly disagree .. 5 strongly agree",
  }),
});

export const SubmitTestRequest = z
  .object({
    answers: z
      .array(Answer)
      .length(QUESTIONS.length, {
        message: `must contain exactly ${QUESTIONS.length} items`,
      })
      .superRefine((answers, ctx) => {
        const seen = new Set<number>();
        for (const [index, { questionId }] of answers.entries()) {
          if (!QUESTION_IDS.has(questionId)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "questionId"],
              message: `questionId ${questionId} does not exist`,
            });
          } else if (seen.has(questionId)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "questionId"],
              message: `questionId ${questionId} appears more than once`,
            });
          }
          seen.add(questionId);
        }
      })
      .openapi({
        description: `Exactly ${QUESTIONS.length} answers: every question id once, in any order`,
        minItems: QUESTIONS.length,
        maxItems: QUESTIONS.length,
        example: EXAMPLE_ANSWERS,
      }),
  })
  .openapi("SubmitTestRequest");

export const SubmitTestResponse = z
  .object({
    resultId: z.uuid(),
    guestToken: z.uuid().nullable().openapi({
      description:
        "Set for guests only; null when signed in (the result is stored under the session user)",
    }),
    mbtiType: z.string().length(4),
    character: z.object({
      name: z.string(),
      house: z.string(),
      imageUrl: z.string(),
      description: z.string(),
    }),
    goldenPairType: z.string().length(4),
    breakdown: BreakdownSchema,
  })
  .openapi("SubmitTestResponse");

export const InvalidAnswersResponse = z
  .object({
    error: z.object({
      code: z.literal("INVALID_ANSWERS"),
      message: z.string(),
    }),
  })
  .openapi("InvalidAnswersResponse");
