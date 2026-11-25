import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../../db/client";
import {
  globalErrorHandler,
  InternalServerErrorResponse,
  UnauthorizedResponse,
} from "../../errors";
import type { Auth } from "../../identity/auth";
import { type AuthEnv, createRequireAuth } from "../../identity/middleware/require-auth";
import { ListResultsResponse } from "../schema/list-results.schema";
import { listResults } from "../services/list-results.services";

export function createListResultsRoutes(db: Db, auth: Auth) {
  const requireAuth = createRequireAuth(auth);

  const listResultsRoute = createRoute({
    method: "get",
    path: "/results",
    tags: ["Assessment"],
    summary: "The signed-in user's test results, newest first",
    // No params, query or body: whose results is decided by the session only (BOLA).
    security: [{ sessionCookie: [] }],
    middleware: [requireAuth] as const,
    responses: {
      200: {
        description: "The user's results (an empty array when there are none)",
        content: { "application/json": { schema: ListResultsResponse } },
      },
      401: {
        description:
          "No session, or the session is expired, revoked or tampered with (one identical response for all)",
        content: { "application/json": { schema: UnauthorizedResponse } },
      },
      500: {
        description: "Unexpected server error",
        content: { "application/json": { schema: InternalServerErrorResponse } },
      },
    },
  });

  const routes = new OpenAPIHono<AuthEnv>();
  routes.onError(globalErrorHandler);

  return routes.openapi(listResultsRoute, async (c) =>
    c.json(await listResults(db, c.get("user").id), 200),
  );
}
