import { z } from "@hono/zod-openapi";
import { MAX_PAGE } from "../services/pagination";

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

/**
 * `?page=`: only a plain positive integer ("1".."1000"). Ambiguous forms such as
 * "01", " 1", "1.5", "1e2", "" or a repeated param (an array) are rejected, not coerced.
 * Not strict: unknown params (pageSize, limit, offset…) are ignored.
 */
export const ListResultsQuery = z.object({
  page: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(MAX_PAGE))
    .optional()
    .openapi({
      param: { name: "page", in: "query" },
      type: "integer",
      minimum: 1,
      maximum: MAX_PAGE,
      default: 1,
      description: "1-based page number; omitted = 1",
    }),
});

export const ListResultsResponse = z
  .object({
    items: z.array(ResultListItem),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  })
  .openapi("ListResultsResponse", {
    description:
      "One page, newest first. A page past the last one has no items; no results at all → total 0, totalPages 0.",
  });

export const InvalidPageResponse = z
  .object({
    error: z.object({
      code: z.enum(["INVALID_PAGE"]),
      message: z.string(),
    }),
  })
  .openapi("InvalidPageResponse");
