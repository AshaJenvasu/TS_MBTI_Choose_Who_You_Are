import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { Db } from "../../db/client";
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
      description: "Answers are missing, incomplete, or out of range",
      content: { "application/json": { schema: InvalidAnswersResponse } },
    },
  },
});

export function createSubmitTestRoutes(db: Db) {
  const routes = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: "INVALID_ANSWERS" }, 400);
    },
  });

  // Malformed JSON never reaches the validator hook: Hono throws a 400 HTTPException.
  routes.onError((err, c) => {
    if (err instanceof HTTPException && err.status === 400) {
      return c.json({ error: "INVALID_ANSWERS" }, 400);
    }
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.text("Internal Server Error", 500);
  });

  // TODO(security-debt): OWASP API4 — ต้องเพิ่ม Cloudflare Rate Limiting binding ก่อน deploy จริง ยอมรับความเสี่ยงชั่วคราวเพราะ scale เล็ก (~1,000 users) และยังไม่มี Workers deploy config ในโปรเจกต์
  return routes.openapi(submitTestRoute, async (c) => {
    const { answers } = c.req.valid("json");
    const result = await submitTest(db, answers, crypto.randomUUID());
    return c.json(result, 201);
  });
}
