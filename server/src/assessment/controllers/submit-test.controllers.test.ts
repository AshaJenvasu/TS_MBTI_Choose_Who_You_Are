import { afterAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp, OPENAPI_CONFIG } from "../../app";
import { createDb } from "../../db/client";
import { QUESTIONS } from "../services/question-bank";

// Real Postgres (docker compose) with migration + seed applied: `bun run db:setup`.
const url =
  process.env.DATABASE_URL ?? "postgres://mbti:mbti@localhost:5433/mbti";
const pool = new pg.Pool({ connectionString: url });
const { db, close } = createDb(url);
const app = createApp(db);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Answers that push every axis toward `type`: agree strongly (5) with items whose
 * pole is in the type, disagree strongly (1) with the rest. Both add +2 toward the type.
 */
const answersFor = (type: string) =>
  QUESTIONS.map((q) => ({
    questionId: q.id,
    value: type.includes(q.pole) ? 5 : 1,
  }));

const ENFP_ANSWERS = answersFor("ENFP");
const ISTJ_ANSWERS = answersFor("ISTJ");

const submit = (body: unknown) =>
  app.request("/test/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const countResults = async () =>
  (await pool.query<{ n: number }>(`select count(*)::int as n from test_result`))
    .rows[0]!.n;

beforeEach(async () => {
  await pool.query(`delete from test_result`);
});

afterAll(async () => {
  await pool.query(`delete from test_result`);
  await pool.end();
  await close();
});

describe("POST /test/submit — AC1 guest submit succeeds", () => {
  it("returns 201 with guestToken and the full result shape", async () => {
    const res = await submit({ answers: ENFP_ANSWERS });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "character",
      "goldenPairType",
      "guestToken",
      "mbtiType",
      "resultId",
    ]);
    expect(body.resultId).toMatch(UUID);
    expect(body.guestToken).toMatch(UUID);
    expect(body.mbtiType).toBe("ENFP");
    expect(body.goldenPairType).toBe("INFJ");
    expect(Object.keys(body.character).sort()).toEqual([
      "description",
      "house",
      "imageUrl",
      "name",
    ]);
  });

  it("returns the character stored for that type in the reference data", async () => {
    const body = await (await submit({ answers: ENFP_ANSWERS })).json();
    const { rows } = await pool.query(
      // house now lives on mbti_type_info; the submit response keeps character.house.
      `select c.name, i.house, c.image_url, c.description
       from "character" c join mbti_type_info i on i.type_code = c.mbti_type
       where c.mbti_type = 'ENFP'`,
    );
    expect(body.character).toEqual({
      name: rows[0].name,
      house: rows[0].house,
      imageUrl: rows[0].image_url,
      description: rows[0].description,
    });
  });

  it("records exactly one TestResult as a guest row", async () => {
    const body = await (await submit({ answers: ENFP_ANSWERS })).json();
    expect(await countResults()).toBe(1);

    const { rows } = await pool.query(
      `select r.id, r.user_id, r.guest_token, r.mbti_type, r.created_at,
              c.mbti_type as char_type
       from test_result r
       join "character" c on c.id = r.matched_character_id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(body.resultId);
    expect(rows[0].user_id).toBeNull();
    expect(rows[0].guest_token).toBe(body.guestToken);
    expect(rows[0].mbti_type).toBe("ENFP");
    expect(rows[0].char_type).toBe("ENFP");
    expect(rows[0].created_at).toBeInstanceOf(Date);
  });

  it("accepts the 24 answers in any order", async () => {
    const body = await (
      await submit({ answers: [...ENFP_ANSWERS].reverse() })
    ).json();
    expect(body.mbtiType).toBe("ENFP");
  });
});

// AC2 (logged-in submit, no guestToken) is out of scope for this ticket:
// Better Auth is Epic 2, so every request is treated as a guest for now.
describe.skip("POST /test/submit — AC2 logged-in submit (Epic 2)", () => {
  it.todo("returns no guestToken and stores user_id");
});

describe("POST /test/submit — AC3 invalid answers", () => {
  const valid = ENFP_ANSWERS;
  const withFirst = (patch: object) => [{ ...valid[0], ...patch }, ...valid.slice(1)];

  const cases: Array<[string, unknown]> = [
    ["fewer than 24 answers", { answers: valid.slice(0, 23) }],
    ["more than 24 answers", { answers: [...valid, { questionId: 1, value: 3 }] }],
    ["empty answers", { answers: [] }],
    [
      "duplicate questionId (24 items, id 24 replaced by id 1)",
      { answers: [...valid.slice(0, 23), { questionId: 1, value: 3 }] },
    ],
    [
      "questionId not in QUESTIONS (25)",
      { answers: [...valid.slice(0, 23), { questionId: 25, value: 3 }] },
    ],
    ["questionId 0", { answers: withFirst({ questionId: 0 }) }],
    ["non-integer questionId", { answers: withFirst({ questionId: 1.5 }) }],
    ["value below 1", { answers: withFirst({ value: 0 }) }],
    ["value above 5", { answers: withFirst({ value: 6 }) }],
    ["non-integer value", { answers: withFirst({ value: 3.5 }) }],
    ["string value", { answers: withFirst({ value: "5" }) }],
    ["missing value", { answers: withFirst({ value: undefined }) }],
    ["old format: plain numbers", { answers: Array<number>(24).fill(3) }],
    ["answers missing", {}],
    ["answers not an array", { answers: "nope" }],
    ["malformed JSON", "{ not json"],
  ];

  it.each(cases)("%s → 400 INVALID_ANSWERS and no row saved", async (_n, body) => {
    const res = await submit(body);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("INVALID_ANSWERS");
    expect(typeof json.error.message).toBe("string");
    expect(json.error.message.length).toBeGreaterThan(0);
    expect(Object.keys(json)).toEqual(["error"]);
    expect(await countResults()).toBe(0);
  });
});

describe("POST /test/submit — AC4 deterministic result", () => {
  it("same answers twice → same type and character, but separate results/tokens", async () => {
    const a = await (await submit({ answers: ISTJ_ANSWERS })).json();
    const b = await (await submit({ answers: ISTJ_ANSWERS })).json();

    expect(a.mbtiType).toBe("ISTJ");
    expect(b.mbtiType).toBe(a.mbtiType);
    expect(b.character).toEqual(a.character);
    expect(b.goldenPairType).toBe(a.goldenPairType);

    expect(b.resultId).not.toBe(a.resultId);
    expect(b.guestToken).not.toBe(a.guestToken);
    expect(await countResults()).toBe(2);
  });

  it("different answers → different character", async () => {
    const a = await (await submit({ answers: ENFP_ANSWERS })).json();
    const b = await (await submit({ answers: ISTJ_ANSWERS })).json();
    expect(a.character.name).not.toBe(b.character.name);
  });
});

describe("OpenAPI document", () => {
  const doc = app.getOpenAPIDocument(OPENAPI_CONFIG);

  it("describes POST /test/submit", () => {
    expect(doc.paths["/test/submit"]?.post).toBeDefined();
  });

  it("documents the 24 { questionId, value } answers", () => {
    const schemas = doc.components?.schemas as Record<string, any>;
    const answers = schemas.SubmitTestRequest.properties.answers;
    expect(answers.minItems).toBe(24);
    expect(answers.maxItems).toBe(24);
    expect(Object.keys(answers.items.properties).sort()).toEqual([
      "questionId",
      "value",
    ]);
    expect(answers.items.properties.value.minimum).toBe(1);
    expect(answers.items.properties.value.maximum).toBe(5);
  });

  it("gives docs UIs (Scalar) a valid example body: 24 unique ids, accepted by the API", async () => {
    const schemas = doc.components?.schemas as Record<string, any>;
    const example = schemas.SubmitTestRequest.properties.answers.example;

    expect(example).toHaveLength(24);
    expect(example.map((a: any) => a.questionId)).toEqual(
      QUESTIONS.map((q) => q.id),
    );

    const res = await submit({ answers: example });
    expect(res.status).toBe(201);
  });

  it("documents the error shape { error: { code, message } }", () => {
    const schemas = doc.components?.schemas as Record<string, any>;
    const error = schemas.InvalidAnswersResponse.properties.error;
    expect(Object.keys(error.properties).sort()).toEqual(["code", "message"]);
  });

  it("documents the 500 response with the shared INTERNAL_SERVER_ERROR shape", () => {
    const responses = doc.paths["/test/submit"]!.post!.responses as Record<string, any>;
    expect(Object.keys(responses).sort()).toEqual(["201", "400", "500"]);
    expect(responses["500"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/InternalServerErrorResponse",
    );

    const schemas = doc.components?.schemas as Record<string, any>;
    const error = schemas.InternalServerErrorResponse.properties.error;
    expect(Object.keys(error.properties).sort()).toEqual(["code", "message"]);
    expect(error.properties.code.enum).toEqual(["INTERNAL_SERVER_ERROR"]);
    expect(error.properties.message.type).toBe("string");
    expect(schemas.InternalServerErrorResponse.required).toEqual(["error"]);
  });
});
