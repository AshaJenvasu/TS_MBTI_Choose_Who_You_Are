import { describe, expect, expectTypeOf, it } from "vitest";
import { errorBody } from "./errors";

describe("errorBody — the one error body of the API", () => {
  it("builds exactly { error: { code, message } }, nothing more", () => {
    const body = errorBody("SOME_CODE", "Some message");

    expect(body).toEqual({ error: { code: "SOME_CODE", message: "Some message" } });
    expect(Object.keys(body)).toEqual(["error"]);
    expect(Object.keys(body.error)).toEqual(["code", "message"]);
  });

  it("returns a new object each call (callers cannot share mutable state by accident)", () => {
    expect(errorBody("A", "m")).not.toBe(errorBody("A", "m"));
  });

  it("keeps the code as a literal type (checked by tsc --noEmit)", () => {
    const body = errorBody("INVALID_PAGE", "m");

    expectTypeOf(body.error.code).toEqualTypeOf<"INVALID_PAGE">();
    expectTypeOf(body.error.message).toEqualTypeOf<string>();
    expectTypeOf(body).toEqualTypeOf<{ error: { code: "INVALID_PAGE"; message: string } }>();
  });
});
