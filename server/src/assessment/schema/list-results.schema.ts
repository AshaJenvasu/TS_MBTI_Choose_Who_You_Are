import { z } from "@hono/zod-openapi";

/** One entry in the result history. Whitelist: no user_id, guest_token or character id. */
export const ResultListItem = z
  .object({
    id: z.uuid(),
    mbtiType: z.string().length(4),
    character: z.object({
      name: z.string(),
      imageUrl: z.string(),
    }),
    createdAt: z.iso.datetime().openapi({ description: "When the test was taken (ISO 8601, UTC)" }),
  })
  .openapi("ResultListItem");

export const ListResultsResponse = z
  .array(ResultListItem)
  .openapi("ListResultsResponse", {
    description: "Newest first. Empty array when the user has no results yet.",
  });
