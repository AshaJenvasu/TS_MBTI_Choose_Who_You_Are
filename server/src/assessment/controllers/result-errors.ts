import type { Hook } from "@hono/zod-openapi";
import type { Context, Env } from "hono";
import { errorBody } from "../../errors";

// Errors shared by the two routes on a single result: GET /results/{resultId} and
// POST /results/{resultId}/claim. Assessment vocabulary, so it lives here, not in src/errors.ts.

export const AUTH_REQUIRED_BODY = errorBody("AUTH_REQUIRED", "X-Guest-Token header is required");
export const INVALID_RESULT_ID_BODY = errorBody("INVALID_RESULT_ID", "resultId must be a valid UUID");

/** Same status and body whether the result is missing or not yours. */
export const RESULT_NOT_FOUND_BODY = errorBody("RESULT_NOT_FOUND", "Result not found");

/**
 * defaultHook of both routers: a bad X-Guest-Token header → 400 AUTH_REQUIRED, any other
 * failed check (the resultId param) → 400 INVALID_RESULT_ID. `target` says which part failed.
 * Generic over the router's Env (OptionalAuthEnv for GET, AuthEnv for claim): a Context<Env>
 * parameter would not accept either of them.
 */
export function resultRequestHook<E extends Env>(
  result: Parameters<Hook<unknown, E, string, Response | undefined>>[0],
  c: Context<E, string>,
): Response | undefined {
  if (result.success) return;
  if (result.target === "header") return c.json(AUTH_REQUIRED_BODY, 400);
  return c.json(INVALID_RESULT_ID_BODY, 400);
}
