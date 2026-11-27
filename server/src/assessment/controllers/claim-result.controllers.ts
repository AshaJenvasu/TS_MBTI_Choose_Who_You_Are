import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../../db/client";
import {
  globalErrorHandler,
  InternalServerErrorResponse,
  UnauthorizedResponse,
} from "../../errors";
import type { Auth } from "../../identity/auth";
import { type AuthEnv, createRequireAuth } from "../../identity/middleware/require-auth";
import { ClaimResultHeaders } from "../schema/claim-result.schema";
import {
  GetResultParams,
  InvalidGetResultRequestResponse,
  ResultNotFoundResponse,
} from "../schema/get-result.schema";
import { ResultListItem } from "../schema/list-results.schema";
import { claimResult } from "../services/claim-result.services";
import { ResultNotFoundError } from "../services/get-result.services";
import { RESULT_NOT_FOUND_BODY, resultRequestHook } from "./result-errors";

export function createClaimResultRoutes(db: Db, auth: Auth) {
  const requireAuth = createRequireAuth(auth);

  const claimResultRoute = createRoute({
    method: "post",
    path: "/results/{resultId}/claim",
    tags: ["Assessment"],
    summary: "Claim a guest result into the signed-in user's account",
    // Whose account is decided by the session only (BOLA): no user id in the request.
    security: [{ sessionCookie: [] }],
    middleware: [requireAuth] as const,
    request: { params: GetResultParams, headers: ClaimResultHeaders },
    responses: {
      200: {
        description: "Claimed (or already claimed by this user: a retry returns the same result)",
        content: { "application/json": { schema: ResultListItem } },
      },
      400: {
        description:
          "resultId is not a UUID (INVALID_RESULT_ID) or X-Guest-Token is missing (AUTH_REQUIRED)",
        content: { "application/json": { schema: InvalidGetResultRequestResponse } },
      },
      401: {
        description: "No valid session (same body as every protected route)",
        content: { "application/json": { schema: UnauthorizedResponse } },
      },
      404: {
        description:
          "No such result, wrong token, or claimed by someone else (identical on purpose)",
        content: { "application/json": { schema: ResultNotFoundResponse } },
      },
      500: {
        description: "Unexpected server error",
        content: { "application/json": { schema: InternalServerErrorResponse } },
      },
    },
  });

  // Same 400s as GET /results/:resultId (shared hook).
  const routes = new OpenAPIHono<AuthEnv>({ defaultHook: resultRequestHook });

  routes.onError(globalErrorHandler);

  // TODO(security-debt): OWASP API4 — ยังไม่มี rate limit ของ claim (ทำพร้อม Cloudflare Rate Limiting ของ submit ก่อน deploy จริง)
  return routes.openapi(claimResultRoute, async (c) => {
    const { resultId } = c.req.valid("param");
    const { "x-guest-token": guestToken } = c.req.valid("header");

    try {
      return c.json(await claimResult(db, resultId, c.get("user").id, guestToken), 200);
    } catch (err) {
      if (err instanceof ResultNotFoundError) return c.json(RESULT_NOT_FOUND_BODY, 404);
      throw err;
    }
  });
}
