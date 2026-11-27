import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../../db/client";
import { errorBody, globalErrorHandler, InternalServerErrorResponse } from "../../errors";
import type { Auth } from "../../identity/auth";
import {
  createOptionalAuth,
  OPTIONAL_SESSION_SECURITY,
  type OptionalAuthEnv,
} from "../../identity/middleware/optional-auth";
import {
  InvalidAnswersResponse,
  SubmitTestRequest,
  SubmitTestResponse,
} from "../schema/submit-test.schema";
import { submitTest } from "../services/submit-test.services";

const invalidAnswers = (message: string) => errorBody("INVALID_ANSWERS", message);

export function createSubmitTestRoutes(db: Db, auth?: Auth) {
  const optionalAuth = createOptionalAuth(auth);

  const submitTestRoute = createRoute({
    method: "post",
    path: "/test/submit",
    tags: ["Assessment"],
    summary: "Submit test answers and get the matched character",
    // Guests need no credential; a valid session cookie makes the result the user's.
    security: OPTIONAL_SESSION_SECURITY,
    middleware: [optionalAuth] as const,
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: SubmitTestRequest } },
      },
    },
    responses: {
      201: {
        description:
          "Result recorded: owned by the session user (guestToken null) or by a new guest token",
        content: { "application/json": { schema: SubmitTestResponse } },
      },
      400: {
        description:
          "Answers are not exactly the 24 question ids with a 1-5 value each",
        content: { "application/json": { schema: InvalidAnswersResponse } },
      },
      500: {
        description: "Unexpected server error",
        content: { "application/json": { schema: InternalServerErrorResponse } },
      },
    },
  });

  const routes = new OpenAPIHono<OptionalAuthEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issue = result.error.issues[0];
        const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
        return c.json(
          invalidAnswers(`${where}${issue?.message ?? "Invalid request body"}`),
          400,
        );
      }
    },
  });

  // Malformed JSON never reaches the validator hook: Hono throws a 400 HTTPException.
  routes.onError((err, c) => {
    if (err instanceof HTTPException && err.status === 400) {
      return c.json(invalidAnswers("Request body must be valid JSON"), 400);
    }
    return globalErrorHandler(err, c);
  });

  // TODO(security-debt): OWASP API4 — ต้องเพิ่ม Cloudflare Rate Limiting binding ก่อน deploy จริง ยอมรับความเสี่ยงชั่วคราวเพราะ scale เล็ก (~1,000 users) และยังไม่มี Workers deploy config ในโปรเจกต์
  return routes.openapi(submitTestRoute, async (c) => {
    const { answers } = c.req.valid("json");
    // Owner comes from the session only (API1): never from the body or headers.
    const user = c.get("user");
    const owner = user
      ? { userId: user.id }
      : { guestToken: crypto.randomUUID() };
    const result = await submitTest(db, answers, owner);
    return c.json(result, 201);
  });
}
