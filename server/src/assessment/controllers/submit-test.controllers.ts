import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../../db/client";
import { globalErrorHandler, InternalServerErrorResponse } from "../../errors";
import {
  InvalidAnswersResponse,
  SubmitTestRequest,
  SubmitTestResponse,
} from "../schema/submit-test.schema";
import { submitTest } from "../services/submit-test.services";

const submitTestRoute = createRoute({
  method: "post",
  path: "/test/submit",
  tags: ["Assessment"],
  summary: "Submit test answers and get the matched character",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: SubmitTestRequest } },
    },
  },
  responses: {
    201: {
      description: "Result recorded",
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

const invalidAnswers = (message: string) => ({
  error: { code: "INVALID_ANSWERS" as const, message },
});

export function createSubmitTestRoutes(db: Db) {
  const routes = new OpenAPIHono({
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
    const result = await submitTest(db, answers, crypto.randomUUID());
    return c.json(result, 201);
  });
}
