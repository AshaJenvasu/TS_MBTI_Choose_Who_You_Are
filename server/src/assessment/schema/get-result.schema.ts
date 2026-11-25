import { z } from "@hono/zod-openapi";
import { BreakdownSchema } from "./breakdown.schema";

export const GetResultParams = z.object({
  resultId: z.uuid().openapi({
    param: { name: "resultId", in: "path" },
    description: "id of a test result (UUID)",
  }),
});

// Hono lowercases header names before validating, so the key must be lowercase.
// HTTP header names are case-insensitive: clients can send X-Guest-Token.
export const GetResultHeaders = z.object({
  "x-guest-token": z.string().min(1).openapi({
    description: "Guest token returned by POST /test/submit (X-Guest-Token)",
  }),
});

export const GetResultResponse = z
  .object({
    mbtiType: z.string().length(4),
    character: z.object({
      name: z.string(),
      imageUrl: z.string(),
      description: z.string(),
    }),
    house: z.string(),
    goldenPair: z.string().length(4).openapi({
      description: "MBTI type code of the golden pair, e.g. ENFP",
    }),
    compatibleTypes: z.array(z.string().length(4)),
    challengingTypes: z.array(z.string().length(4)),
    breakdown: BreakdownSchema,
  })
  .openapi("GetResultResponse");

export const InvalidGetResultRequestResponse = z
  .object({
    error: z.object({
      code: z.enum(["INVALID_RESULT_ID", "AUTH_REQUIRED"]),
      message: z.string(),
    }),
  })
  .openapi("InvalidGetResultRequestResponse");

export const ResultNotFoundResponse = z
  .object({
    error: z.object({
      code: z.literal("RESULT_NOT_FOUND"),
      message: z.string(),
    }),
  })
  .openapi("ResultNotFoundResponse");
