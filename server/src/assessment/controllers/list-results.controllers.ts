import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../../db/client";
import {
  errorBody,
  globalErrorHandler,
  InternalServerErrorResponse,
  UnauthorizedResponse,
} from "../../errors";
import type { Auth } from "../../identity/auth";
import { type AuthEnv, createRequireAuth } from "../../identity/middleware/require-auth";
import {
  InvalidPageResponse,
  ListResultsQuery,
  ListResultsResponse,
} from "../schema/list-results.schema";
import { listResults } from "../services/list-results.services";
import { MAX_PAGE } from "../services/pagination";

const INVALID_PAGE_BODY = errorBody(
  "INVALID_PAGE",
  `page must be an integer from 1 to ${MAX_PAGE}`,
);

export function createListResultsRoutes(db: Db, auth: Auth) {
  const requireAuth = createRequireAuth(auth);

  const listResultsRoute = createRoute({
    method: "get",
    path: "/results",
    tags: ["Assessment"],
    summary: "The signed-in user's test results, one page at a time, newest first",
    // Only `page` is read. Whose results is decided by the session only (BOLA);
    // the page size is fixed by the server (the client cannot choose it).
    security: [{ sessionCookie: [] }],
    // requireAuth runs before the query validator, so no session is always a 401.
    middleware: [requireAuth] as const,
    request: { query: ListResultsQuery },
    responses: {
      200: {
        description: "One page of the user's results",
        content: { "application/json": { schema: ListResultsResponse } },
      },
      400: {
        description: `page is not a plain integer from 1 to ${MAX_PAGE} (INVALID_PAGE)`,
        content: { "application/json": { schema: InvalidPageResponse } },
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

  const routes = new OpenAPIHono<AuthEnv>({
    defaultHook: (result, c) => {
      if (result.success) return;
      // `target` says which part of the request failed validation; the query is the only one.
      if (result.target === "query") return c.json(INVALID_PAGE_BODY, 400);
    },
  });
  routes.onError(globalErrorHandler);

  return routes.openapi(listResultsRoute, async (c) => {
    const { page = 1 } = c.req.valid("query");
    return c.json(await listResults(db, c.get("user").id, page), 200);
  });
}
