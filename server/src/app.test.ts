import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import type { Db } from "./db/client";
import { QUESTIONS } from "./assessment/services/question-bank";

const validBody = {
  answers: QUESTIONS.map((q) => ({ questionId: q.id, value: 3 })),
};

const post = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request("/test/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

afterEach(() => vi.restoreAllMocks());

describe("global error handler — unhandled errors become nested 500 JSON", () => {
  const expected = {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: expect.any(String),
    },
  };

  it("POST /test/submit: a throwing DB gives 500 { error: { code, message } }", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const brokenDb = {
      select: () => {
        throw new Error("db down: secret-connection-detail");
      },
    } as unknown as Db;

    const res = await post(createApp(brokenDb), validBody);

    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json).toEqual(expected);
    expect(json.error.message.length).toBeGreaterThan(0);
    // The real error is logged on the server, never sent to the client.
    expect(JSON.stringify(json)).not.toContain("secret-connection-detail");
    expect(logged).toHaveBeenCalled();
  });

  it("any other route in the app is covered too, not just submit-test", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({} as Db);
    app.get("/boom", () => {
      throw new Error("unexpected failure");
    });

    const res = await app.request("/boom");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(expected);
  });

  it("an async rejection (not just a sync throw) is handled the same way", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({} as Db);
    app.get("/reject", async () => {
      throw new Error("async failure");
    });

    const res = await app.request("/reject");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(expected);
  });

  it("validation errors still give 400 INVALID_ANSWERS, not 500", async () => {
    const res = await post(createApp({} as Db), { answers: [] });

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_ANSWERS");
  });
});
