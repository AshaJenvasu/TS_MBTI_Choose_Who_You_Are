import { OpenAPIHono } from "@hono/zod-openapi";
import { createGetResultRoutes } from "./assessment/controllers/get-result.controllers";
import { createListResultsRoutes } from "./assessment/controllers/list-results.controllers";
import { createSubmitTestRoutes } from "./assessment/controllers/submit-test.controllers";
import type { Db } from "./db/client";
import { globalErrorHandler } from "./errors";
import type { Auth } from "./identity/auth";
import { createMeRoutes } from "./identity/controllers/me.controllers";

export const OPENAPI_CONFIG = {
  openapi: "3.0.0",
  info: { title: "MBTI API", version: "0.1.0" },
} as const;

export function createApp(db: Db, auth?: Auth) {
  const app = new OpenAPIHono();
  app.onError(globalErrorHandler);
  // Better Auth owns /api/auth/* (sign-in, callback, sign-out, get-session).
  // Not in OpenAPI: see Better Auth docs. Optional so tests without auth still build the app.
  if (auth) {
    app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
    app.route("/", createMeRoutes(auth));
    app.route("/", createListResultsRoutes(db, auth));
  }
  app.route("/", createSubmitTestRoutes(db));
  app.route("/", createGetResultRoutes(db));
  return app;
}
