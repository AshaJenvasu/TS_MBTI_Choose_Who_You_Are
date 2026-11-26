import { z } from "@hono/zod-openapi";

// Required here (unlike GET /results/:resultId): claiming is proving you hold the token.
// Lowercase key: Hono lowercases header names before validating.
export const ClaimResultHeaders = z.object({
  "x-guest-token": z.string().min(1).openapi({
    description: "Guest token returned by POST /test/submit (X-Guest-Token)",
  }),
});
