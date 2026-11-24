import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../../db/client";
import { InternalServerErrorResponse, globalErrorHandler } from "../../errors";
import {
  GetResultHeaders,
  GetResultParams,
  GetResultResponse,
  InvalidGetResultRequestResponse,
  ResultNotFoundResponse,
} from "../schema/get-result.schema";
import { getResult, ResultNotFoundError } from "../services/get-result.services";

const getResultRoute = createRoute({
  method: "get",
  path: "/results/{resultId}",
  tags: ["Assessment"],
  summary: "Get a test result again (guest token required)",
  request: { params: GetResultParams, headers: GetResultHeaders },
  responses: {
    200: {
      description: "The result, for the guest token that owns it",
      content: { "application/json": { schema: GetResultResponse } },
    },
    400: {
      description:
        "resultId is not a UUID (INVALID_RESULT_ID) or X-Guest-Token is missing (AUTH_REQUIRED)",
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

const badRequest = (code: "INVALID_RESULT_ID" | "AUTH_REQUIRED", message: string) => ({
  error: { code, message },
});

export function createGetResultRoutes(db: Db) {
  const routes = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (result.success) return;
      // `target` says which part of the request failed validation.
      if (result.target === "header") {
        return c.json(
          badRequest("AUTH_REQUIRED", "X-Guest-Token header is required"),
          400,
        );
      }
      return c.json(
        badRequest("INVALID_RESULT_ID", "resultId must be a valid UUID"),
        400,
      );
    },
  });

  routes.onError(globalErrorHandler);

  return routes.openapi(getResultRoute, async (c) => {
    const { resultId } = c.req.valid("param");
    const { "x-guest-token": guestToken } = c.req.valid("header");

    try {
      return c.json(await getResult(db, resultId, guestToken), 200);
    } catch (err) {
      // Same status and body whether the result is missing or not yours.
      if (err instanceof ResultNotFoundError) {
        return c.json(
          {
            error: {
              code: "RESULT_NOT_FOUND" as const,
              message: "Result not found",
            },
          },
          404,
        );
      }
      throw err;
    }
  });
}
