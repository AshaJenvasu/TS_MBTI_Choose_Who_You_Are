import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../../db/client";
import { InternalServerErrorResponse, globalErrorHandler } from "../../errors";
import type { Auth } from "../../identity/auth";
import {
  createOptionalAuth,
  OPTIONAL_SESSION_SECURITY,
  type OptionalAuthEnv,
} from "../../identity/middleware/optional-auth";
import {
  GetResultHeaders,
  GetResultParams,
  GetResultResponse,
  InvalidGetResultRequestResponse,
  ResultNotFoundResponse,
} from "../schema/get-result.schema";
import {
  getResult,
  ResultNotFoundError,
  type ResultViewer,
} from "../services/get-result.services";
import { AUTH_REQUIRED_BODY, RESULT_NOT_FOUND_BODY, resultRequestHook } from "./result-errors";

export function createGetResultRoutes(db: Db, auth?: Auth) {
  const optionalAuth = createOptionalAuth(auth);

  const getResultRoute = createRoute({
    method: "get",
    path: "/results/{resultId}",
    tags: ["Assessment"],
    summary: "Get a test result again (guest token or session)",
    // Either credential: X-Guest-Token (checked first) or the session cookie.
    security: OPTIONAL_SESSION_SECURITY,
    middleware: [optionalAuth] as const,
    request: { params: GetResultParams, headers: GetResultHeaders },
    responses: {
      200: {
        description:
          "The result, for the guest token or the signed-in user that owns it",
        content: { "application/json": { schema: GetResultResponse } },
      },
      400: {
        description:
          "resultId is not a UUID (INVALID_RESULT_ID), or there is neither an X-Guest-Token nor a valid session (AUTH_REQUIRED)",
        content: {
          "application/json": { schema: InvalidGetResultRequestResponse },
        },
      },
      404: {
        description:
          "No such result, or it belongs to someone else (the two look identical on purpose)",
        content: { "application/json": { schema: ResultNotFoundResponse } },
      },
      500: {
        description: "Unexpected server error",
        content: { "application/json": { schema: InternalServerErrorResponse } },
      },
    },
  });

  const routes = new OpenAPIHono<OptionalAuthEnv>({ defaultHook: resultRequestHook });

  routes.onError(globalErrorHandler);

  return routes.openapi(getResultRoute, async (c) => {
    const { resultId } = c.req.valid("param");
    const { "x-guest-token": guestToken } = c.req.valid("header");
    const user = c.get("user");

    // Guest token first (a signed-in user may still hold an unclaimed guest result),
    // then the session user. The user id comes from the session only (API1).
    let viewer: ResultViewer;
    if (guestToken !== undefined) viewer = { guestToken };
    else if (user) viewer = { userId: user.id };
    else return c.json(AUTH_REQUIRED_BODY, 400);

    try {
      return c.json(await getResult(db, resultId, viewer), 200);
    } catch (err) {
      // Same status and body whether the result is missing or not yours.
      if (err instanceof ResultNotFoundError) return c.json(RESULT_NOT_FOUND_BODY, 404);
      throw err;
    }
  });
}
