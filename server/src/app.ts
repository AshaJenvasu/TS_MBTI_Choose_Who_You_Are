import { OpenAPIHono } from "@hono/zod-openapi";
import { createSubmitTestRoutes } from "./assessment/controllers/submit-test.controllers";
import type { Db } from "./db/client";
import { globalErrorHandler } from "./errors";

export const OPENAPI_CONFIG = {
  openapi: "3.0.0",
  info: { title: "MBTI API", version: "0.1.0" },
} as const;

export function createApp(db: Db) {
  const app = new OpenAPIHono();
  app.onError(globalErrorHandler);
  app.route("/", createSubmitTestRoutes(db));
  return app;
}
