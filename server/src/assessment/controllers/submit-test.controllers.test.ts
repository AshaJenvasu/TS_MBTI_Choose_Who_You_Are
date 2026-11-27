import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { clearTestData } from "../../db/testing/test-database";
import { testDatabaseUrl } from "../../db/testing/test-db-url";
import { createApp, OPENAPI_CONFIG } from "../../app";
import { createDb } from "../../db/client";
import { createAuth } from "../../identity/auth";
import {
  ALICE,
  CookieJar,
  createTestClient,
  type GoogleProfile,
  stubGoogleTokenEndpoint,
  TEST_AUTH_CONFIG,
} from "../../identity/testing/fake-google";
import { QUESTIONS } from "../services/question-bank";

// Test Postgres (a *_test database): created, migrated and seeded by src/db/testing/global-setup.ts.
const url = testDatabaseUrl();
const pool = new pg.Pool({ connectionString: url });
const { db, close } = createDb(url);
const auth = createAuth(db, TEST_AUTH_CONFIG);
const app = createApp(db, auth);
const client = createTestClient(app);

const BOB: GoogleProfile = { sub: "google-sub-bob", email: "bob@example.test", name: "Bob" };
let googleUser: GoogleProfile = ALICE;

/** Signs in as `who` through the real (fake-Google) flow; returns the jar and user id. */
async function signInAs(who: GoogleProfile) {
  googleUser = who;
  const { jar } = await client.signIn();
  const { rows } = await pool.query<{ id: string }>(`select id from "user" where email = $1`, [
    who.email,
  ]);
  return { jar, userId: rows[0]!.id };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

const submit = (body: unknown, extraHeaders: Record<string, string> = {}) =>
  app.request("/test/submit", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const countResults = async () =>
  (await pool.query<{ n: number }>(`select count(*)::int as n from test_result`)).rows[0]!.n;

beforeEach(async () => {
  await clearTestData(pool);
  googleUser = ALICE;
  stubGoogleTokenEndpoint(() => googleUser);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await clearTestData(pool);
  await pool.end();
  await close();
});

describe("POST /test/submit — AC1 guest submit succeeds", () => {
  it("returns 201 with guestToken and the full result shape", async () => {
    const res = await submit({ answers: ENFP_ANSWERS });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "breakdown",
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
    const body = await (await submit({ answers: [...ENFP_ANSWERS].reverse() })).json();
    expect(body.mbtiType).toBe("ENFP");
  });
});

const storedOwner = async (resultId: string) =>
  (
    await pool.query<{ user_id: string | null; guest_token: string | null }>(
      `select user_id, guest_token from test_result where id = $1`,
      [resultId],
    )
  ).rows[0]!;

describe("POST /test/submit — AC2 logged-in submit (Epic 2 A3)", () => {
  it("returns guestToken null and stores the session user's id (no guest token)", async () => {
    const alice = await signInAs(ALICE);

    const res = await submit({ answers: ENFP_ANSWERS }, { Cookie: alice.jar.header() });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.guestToken).toBeNull();
    expect(body.resultId).toMatch(UUID);
    expect(body.mbtiType).toBe("ENFP");
    expect(await countResults()).toBe(1);
    expect(await storedOwner(body.resultId)).toEqual({
      user_id: alice.userId,
      guest_token: null,
    });
  });

  it("a user id sent by the client is ignored: the session decides (BOLA)", async () => {
    const bob = await signInAs(BOB);
    const alice = await signInAs(ALICE);

    const res = await submit(
      { answers: ENFP_ANSWERS, userId: bob.userId, user_id: bob.userId },
      { Cookie: alice.jar.header(), "X-User-Id": bob.userId },
    );

    expect(res.status).toBe(201);
    const { resultId } = await res.json();
    expect((await storedOwner(resultId)).user_id).toBe(alice.userId);
  });

  it("a guest cannot claim a user id: without a session it is still a guest row", async () => {
    const bob = await signInAs(BOB);

    const res = await submit(
      { answers: ENFP_ANSWERS, userId: bob.userId },
      { "X-User-Id": bob.userId },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.guestToken).toMatch(UUID);
    expect(await storedOwner(body.resultId)).toEqual({
      user_id: null,
      guest_token: body.guestToken,
    });
  });
});

describe("POST /test/submit — guest regression with auth enabled", () => {
  it("an invalid session cookie is treated as a guest, never a 401", async () => {
    const jar = new CookieJar();
    jar.set("better-auth.session_token", "not-a-real-token.not-a-real-signature");

    const res = await submit({ answers: ENFP_ANSWERS }, { Cookie: jar.header() });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.guestToken).toMatch(UUID);
    expect(await storedOwner(body.resultId)).toEqual({
      user_id: null,
      guest_token: body.guestToken,
    });
  });
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
    expect(Object.keys(answers.items.properties).sort()).toEqual(["questionId", "value"]);
    expect(answers.items.properties.value.minimum).toBe(1);
    expect(answers.items.properties.value.maximum).toBe(5);
  });

  it("gives docs UIs (Scalar) a valid example body: 24 unique ids, accepted by the API", async () => {
    const schemas = doc.components?.schemas as Record<string, any>;
    const example = schemas.SubmitTestRequest.properties.answers.example;

    expect(example).toHaveLength(24);
    expect(example.map((a: any) => a.questionId)).toEqual(QUESTIONS.map((q) => q.id));

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

// ---------------------------------------------------------------------------
// Ticket 5 — percentage breakdown
// ---------------------------------------------------------------------------

/**
 * Hand-computed set (same as scoring.test.ts "set 5"): net { EI: 7, SN: -9, TF: 5, JP: 7 } → ENTJ.
 * % of first letter = 50 + round-half-away-from-50(net / 24 * 100):
 *   EI  +7 → 50 + 29.17 → 79    SN  -9 → 50 - 37.5 → 12    TF  +5 → 50 + 20.83 → 71    JP  +7 → 79
 */
const ENTJ_HAND_SET = [
  [5, 2, 4, 3, 1, 4],
  [1, 4, 2, 2, 5, 1],
  [4, 3, 5, 3, 2, 4],
  [5, 1, 4, 4, 2, 3],
]
  .flat()
  .map((value, i) => ({ questionId: i + 1, value }));
const ENTJ_HAND_NET = { ei_score: 7, sn_score: -9, tf_score: 5, jp_score: 7 };
const ENTJ_HAND_BREAKDOWN = { ei: 79, sn: 12, tf: 71, jp: 79 };

const storedScores = async (resultId: string) =>
  (
    await pool.query(
      `select ei_score, sn_score, tf_score, jp_score from test_result where id = $1`,
      [resultId],
    )
  ).rows[0];

describe("Ticket 5 — AC1 submit returns the % breakdown", () => {
  it("breakdown matches the hand-computed % of each first letter", async () => {
    const res = await submit({ answers: ENTJ_HAND_SET });
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.mbtiType).toBe("ENTJ");
    expect(body.breakdown).toEqual(ENTJ_HAND_BREAKDOWN);
  });

  it("extreme answers give 0/100 on every axis, as integers", async () => {
    const enfp = await (await submit({ answers: ENFP_ANSWERS })).json();
    const istj = await (await submit({ answers: ISTJ_ANSWERS })).json();

    // ENFP: E fully (100), N fully (S 0), F fully (T 0), P fully (J 0).
    expect(enfp.breakdown).toEqual({ ei: 100, sn: 0, tf: 0, jp: 0 });
    expect(istj.breakdown).toEqual({ ei: 0, sn: 100, tf: 100, jp: 100 });
  });
});

describe("Ticket 5 — AC2 net scores are stored", () => {
  it("the 4 columns hold exactly the net scores of the answers", async () => {
    const { resultId } = await (await submit({ answers: ENTJ_HAND_SET })).json();

    expect(await storedScores(resultId)).toEqual(ENTJ_HAND_NET);
  });

  it("extremes are stored as ±12", async () => {
    const { resultId } = await (await submit({ answers: ENFP_ANSWERS })).json();

    expect(await storedScores(resultId)).toEqual({
      ei_score: 12,
      sn_score: -12,
      tf_score: -12,
      jp_score: -12,
    });
  });

  it("columns are NOT NULL and CHECK-limited to -12..+12 in the DB itself", async () => {
    const insert = (scores: [number | null, number, number, number]) =>
      pool.query(
        `insert into test_result (guest_token, mbti_type, matched_character_id,
                                  ei_score, sn_score, tf_score, jp_score)
         select gen_random_uuid(), c.mbti_type, c.id, $1, $2, $3, $4
           from "character" c where c.mbti_type = 'ENFP'`,
        scores,
      );

    await expect(insert([13, 0, 0, 0])).rejects.toMatchObject({
      code: "23514",
      constraint: "test_result_ei_score_range",
    });
    await expect(insert([-13, 0, 0, 0])).rejects.toMatchObject({
      code: "23514",
      constraint: "test_result_ei_score_range",
    });
    await expect(insert([null, 0, 0, 0])).rejects.toMatchObject({
      code: "23502",
      column: "ei_score",
    });
    await expect(insert([12, -12, 0, 0])).resolves.toMatchObject({ rowCount: 1 });
  });
});

describe("Ticket 5 — AC3 GET /results/:resultId shows the same breakdown later", () => {
  it("detail breakdown equals the submit breakdown exactly", async () => {
    const submitted = await (await submit({ answers: ENTJ_HAND_SET })).json();

    const res = await app.request(`/results/${submitted.resultId}`, {
      headers: { "X-Guest-Token": submitted.guestToken },
    });

    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.breakdown).toEqual(submitted.breakdown);
    expect(detail.breakdown).toEqual(ENTJ_HAND_BREAKDOWN);
  });

  it("detail is computed from the stored columns (changing them changes the breakdown)", async () => {
    const submitted = await (await submit({ answers: ENTJ_HAND_SET })).json();
    await pool.query(
      `update test_result set ei_score = -3, sn_score = 3, tf_score = 0, jp_score = -12 where id = $1`,
      [submitted.resultId],
    );

    const detail = await (
      await app.request(`/results/${submitted.resultId}`, {
        headers: { "X-Guest-Token": submitted.guestToken },
      })
    ).json();

    expect(detail.breakdown).toEqual({ ei: 37, sn: 63, tf: 50, jp: 0 });
  });
});

describe("Ticket 5 — OpenAPI", () => {
  const schemas = app.getOpenAPIDocument(OPENAPI_CONFIG).components?.schemas as Record<string, any>;

  it("both responses reference one shared Breakdown schema of 4 integer % fields", () => {
    expect(schemas.SubmitTestResponse.properties.breakdown.$ref).toBe(
      "#/components/schemas/Breakdown",
    );
    expect(schemas.GetResultResponse.properties.breakdown.$ref).toBe(
      "#/components/schemas/Breakdown",
    );
    const b = schemas.Breakdown;
    expect(Object.keys(b.properties).sort()).toEqual(["ei", "jp", "sn", "tf"]);
    for (const field of Object.values(b.properties) as any[]) {
      expect(field).toMatchObject({ type: "integer", minimum: 0, maximum: 100 });
    }
  });
});
