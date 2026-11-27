import { z } from "@hono/zod-openapi";

const percent = (letter: string) =>
  z
    .number()
    .int()
    .min(0)
    .max(100)
    .openapi({
      description: `% leaning to ${letter} (the other letter is 100 minus this)`,
    });

/** % of each axis's first letter. Shared by POST /test/submit and GET /results/{resultId}. */
export const BreakdownSchema = z
  .object({
    ei: percent("E"),
    sn: percent("S"),
    tf: percent("T"),
    jp: percent("J"),
  })
  .openapi("Breakdown");
