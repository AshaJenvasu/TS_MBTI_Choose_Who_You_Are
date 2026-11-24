import { afterAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { createApp, OPENAPI_CONFIG } from "../../app";
import { createDb } from "../../db/client";

// Real Postgres (docker compose) with migration + seed applied: `bun run db:setup`.
const url =
  process.env.DATABASE_URL ?? "postgres://mbti:mbti@localhost:5433/mbti";
const pool = new pg.Pool({ connectionString: url });
const { db, close } = createDb(url);
const app = createApp(db);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ENFP_ANSWERS = [
  ...Array<number>(5).fill(5),
  ...Array<number>(15).fill(1),
];
const ISTJ_ANSWERS = [
  ...Array<number>(5).fill(1),
  ...Array<number>(5).fill(5),
  ...Array<number>(5).fill(5),
  ...Array<number>(5).fill(5),
];

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
      `select name, house, image_url, description from "character"
       where mbti_type = 'ENFP'`,
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
});

// AC2 (logged-in submit, no guestToken) is out of scope for this ticket:
// Better Auth is Epic 2, so every request is treated as a guest for now.
describe.skip("POST /test/submit — AC2 logged-in submit (Epic 2)", () => {
  it.todo("returns no guestToken and stores user_id");
});

describe("POST /test/submit — AC3 invalid answers", () => {
  const cases: Array<[string, unknown]> = [
    ["fewer than 20 answers", { answers: ENFP_ANSWERS.slice(0, 19) }],
    ["more than 20 answers", { answers: [...ENFP_ANSWERS, 3] }],
    ["empty answers", { answers: [] }],
    ["value below 1", { answers: [0, ...ENFP_ANSWERS.slice(1)] }],
    ["value above 5", { answers: [6, ...ENFP_ANSWERS.slice(1)] }],
    ["non-integer value", { answers: [3.5, ...ENFP_ANSWERS.slice(1)] }],
    ["string value", { answers: ["5", ...ENFP_ANSWERS.slice(1)] }],
    ["answers missing", {}],
    ["answers not an array", { answers: "11111111111111111111" }],
    ["malformed JSON", "{ not json"],
  ];

  it.each(cases)("%s → 400 INVALID_ANSWERS and no row saved", async (_n, body) => {
    const res = await submit(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_ANSWERS" });
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
  it("describes POST /test/submit", () => {
    const doc = app.getOpenAPIDocument(OPENAPI_CONFIG);
    expect(doc.paths["/test/submit"]?.post).toBeDefined();
  });
});
