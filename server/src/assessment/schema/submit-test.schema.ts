import { z } from "@hono/zod-openapi";

export const QUESTION_COUNT = 20;

export const SubmitTestRequest = z
  .object({
    answers: z
      .array(z.number().int().min(1).max(5))
      .length(QUESTION_COUNT)
      .openapi({
        description: `${QUESTION_COUNT} answers, each an integer from 1 to 5`,
        minItems: QUESTION_COUNT,
        maxItems: QUESTION_COUNT,
      }),
  })
  .openapi("SubmitTestRequest");

export const SubmitTestResponse = z
  .object({
    resultId: z.uuid(),
    guestToken: z.uuid().nullable().openapi({
      description: "Set for guests only (every request is a guest for now)",
    }),
    mbtiType: z.string().length(4),
    character: z.object({
      name: z.string(),
      house: z.string(),
      imageUrl: z.string(),
      description: z.string(),
    }),
    goldenPairType: z.string().length(4),
  })
  .openapi("SubmitTestResponse");

export const InvalidAnswersResponse = z
  .object({ error: z.literal("INVALID_ANSWERS") })
  .openapi("InvalidAnswersResponse");
