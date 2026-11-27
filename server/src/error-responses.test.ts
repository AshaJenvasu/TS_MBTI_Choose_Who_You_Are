import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { createApp } from "./app";
import { createDb } from "./db/client";
import { clearTestData } from "./db/testing/test-database";
import { testDatabaseUrl } from "./db/testing/test-db-url";
import { createAuth } from "./identity/auth";
import {
  ALICE,
  CookieJar,
  createTestClient,
  type GoogleProfile,
  stubGoogleTokenEndpoint,
  TEST_AUTH_CONFIG,
} from "./identity/testing/fake-google";

// H4 regression net: every error response of the API, locked BEFORE the error-body refactor.
// Messages we write ourselves are locked letter by letter (toEqual on the whole body, so an
// extra field fails too). Messages built from Zod are locked as code + shape only.
// Test Postgres (a *_test database): created, migrated and seeded by src/db/testing/global-setup.ts.
const url = testDatabaseUrl();
const pool = new pg.Pool({ connectionString: url });
const { db, close } = createDb(url);
const auth = createAuth(db, TEST_AUTH_CONFIG);
const app = createApp(db, auth);
const client = createTestClient(app);

const BOB: GoogleProfile = { sub: "google-sub-bob-h4", email: "bob-h4@example.test", name: "Bob" };

const BAD_ID = { error: { code: "INVALID_RESULT_ID", message: "resultId must be a valid UUID" } };
const AUTH_REQUIRED = {
  error: { code: "AUTH_REQUIRED", message: "X-Guest-Token header is required" },
};
const NOT_FOUND = { error: { code: "RESULT_NOT_FOUND", message: "Result not found" } };
const UNAUTHORIZED = { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
const BAD_PAGE = {
  error: { code: "INVALID_PAGE", message: "page must be an integer from 1 to 1000" },
};
const BAD_JSON = { error: { code: "INVALID_ANSWERS", message: "Request body must be valid JSON" } };

// Fixtures, set once (every request below fails, so nothing changes between tests).
let alice: CookieJar;
let bob: CookieJar;
let guest: { id: string; token: string };
let bobsResultId: string;
const nowhere = "00000000-0000-4000-8000-000000000000";
const fakeSession = () => {
  const jar = new CookieJar();
  jar.set("better-auth.session_token", "not-a-real-token.not-a-real-signature");
  return jar;
};

async function signInAs(who: GoogleProfile) {
  stubGoogleTokenEndpoint(() => who);
  const { jar } = await client.signIn();
  vi.restoreAllMocks();
  return jar;
}

async function insertResult(userId: string | null) {
  const { rows } = await pool.query<{ id: string; guest_token: string | null }>(
    `insert into test_result (user_id, guest_token, mbti_type, matched_character_id,
                              ei_score, sn_score, tf_score, jp_score)
     select $1, case when $1::text is null then gen_random_uuid() end, c.mbti_type, c.id, 0, 0, 0, 0
       from "character" c where c.mbti_type = 'ENFP'
     returning id, guest_token`,
    [userId],
  );
  return rows[0]!;
}

beforeAll(async () => {
  await clearTestData(pool);
  alice = await signInAs(ALICE);
  bob = await signInAs(BOB);
  const { rows } = await pool.query<{ id: string }>(`select id from "user" where email = $1`, [
    BOB.email,
  ]);
  const g = await insertResult(null);
  guest = { id: g.id, token: g.guest_token! };
  bobsResultId = (await insertResult(rows[0]!.id)).id;
});

afterAll(async () => {
  await clearTestData(pool);
  await pool.end();
  await close();
});

type Req = { path: string; method?: string; headers?: Record<string, string>; body?: string };

function send({ path, method = "GET", headers = {}, body }: Req, jar?: CookieJar) {
  const h = { ...headers };
  if (jar) h.Cookie = jar.header();
  return app.request(path, { method, headers: h, body });
}

/** [case, request (built lazily, after the fixtures exist), status, exact body]. */
type ExactCase = [string, () => [Req, CookieJar?], number, unknown];

const exactCases: ExactCase[] = [
  // GET /results/:resultId (optional session)
  [
    "GET result: resultId not a UUID (with token)",
    () => [{ path: "/results/not-a-uuid", headers: { "X-Guest-Token": guest.token } }],
    400,
    BAD_ID,
  ],
  [
    "GET result: X-Guest-Token empty",
    () => [{ path: `/results/${guest.id}`, headers: { "X-Guest-Token": "" } }],
    400,
    AUTH_REQUIRED,
  ],
  [
    "GET result: no token, no session",
    () => [{ path: `/results/${guest.id}` }],
    400,
    AUTH_REQUIRED,
  ],
  [
    "GET result: no token, invalid session cookie",
    () => [{ path: `/results/${guest.id}` }, fakeSession()],
    400,
    AUTH_REQUIRED,
  ],
  [
    "GET result: bad resultId AND empty token (param checked first)",
    () => [{ path: "/results/not-a-uuid", headers: { "X-Guest-Token": "" } }],
    400,
    BAD_ID,
  ],
  [
    "GET result: bad resultId, no token, no session",
    () => [{ path: "/results/not-a-uuid" }],
    400,
    BAD_ID,
  ],
  [
    "GET result: well-formed id that does not exist",
    () => [{ path: `/results/${nowhere}`, headers: { "X-Guest-Token": guest.token } }],
    404,
    NOT_FOUND,
  ],
  [
    "GET result: guest result with a wrong token",
    () => [{ path: `/results/${guest.id}`, headers: { "X-Guest-Token": nowhere } }],
    404,
    NOT_FOUND,
  ],
  [
    "GET result: someone else's result (Bob's, Alice's session)",
    () => [{ path: `/results/${bobsResultId}` }, alice],
    404,
    NOT_FOUND,
  ],

  // POST /results/:resultId/claim (requireAuth first)
  [
    "POST claim: no session",
    () => [
      {
        path: `/results/${guest.id}/claim`,
        method: "POST",
        headers: { "X-Guest-Token": guest.token },
      },
    ],
    401,
    UNAUTHORIZED,
  ],
  [
    "POST claim: no session AND bad resultId (401 before validation)",
    () => [{ path: "/results/not-a-uuid/claim", method: "POST" }],
    401,
    UNAUTHORIZED,
  ],
  [
    "POST claim: resultId not a UUID",
    () => [
      {
        path: "/results/not-a-uuid/claim",
        method: "POST",
        headers: { "X-Guest-Token": guest.token },
      },
      alice,
    ],
    400,
    BAD_ID,
  ],
  [
    "POST claim: X-Guest-Token missing",
    () => [{ path: `/results/${guest.id}/claim`, method: "POST" }, alice],
    400,
    AUTH_REQUIRED,
  ],
  [
    "POST claim: X-Guest-Token empty",
    () => [
      { path: `/results/${guest.id}/claim`, method: "POST", headers: { "X-Guest-Token": "" } },
      alice,
    ],
    400,
    AUTH_REQUIRED,
  ],
  [
    "POST claim: bad resultId AND token missing (param checked first)",
    () => [{ path: "/results/not-a-uuid/claim", method: "POST" }, alice],
    400,
    BAD_ID,
  ],
  [
    "POST claim: well-formed id that does not exist",
    () => [
      {
        path: `/results/${nowhere}/claim`,
        method: "POST",
        headers: { "X-Guest-Token": guest.token },
      },
      alice,
    ],
    404,
    NOT_FOUND,
  ],
  [
    "POST claim: guest result with a wrong token",
    () => [
      { path: `/results/${guest.id}/claim`, method: "POST", headers: { "X-Guest-Token": nowhere } },
      alice,
    ],
    404,
    NOT_FOUND,
  ],
  [
    "POST claim: someone else's result (Bob's)",
    () => [
      {
        path: `/results/${bobsResultId}/claim`,
        method: "POST",
        headers: { "X-Guest-Token": guest.token },
      },
      alice,
    ],
    404,
    NOT_FOUND,
  ],

  // GET /results (requireAuth first)
  ["GET results: no session", () => [{ path: "/results" }], 401, UNAUTHORIZED],
  [
    "GET results: no session AND bad page (401 before validation)",
    () => [{ path: "/results?page=abc" }],
    401,
    UNAUTHORIZED,
  ],
  [
    "GET results: invalid session cookie",
    () => [{ path: "/results" }, fakeSession()],
    401,
    UNAUTHORIZED,
  ],
  ["GET results: page=abc", () => [{ path: "/results?page=abc" }, alice], 400, BAD_PAGE],
  ["GET results: page=0", () => [{ path: "/results?page=0" }, alice], 400, BAD_PAGE],
  ["GET results: page=1001", () => [{ path: "/results?page=1001" }, bob], 400, BAD_PAGE],

  // GET /api/me (requireAuth)
  ["GET me: no session", () => [{ path: "/api/me" }], 401, UNAUTHORIZED],
  ["GET me: invalid session cookie", () => [{ path: "/api/me" }, fakeSession()], 401, UNAUTHORIZED],

  // POST /test/submit: the two messages we write ourselves
  [
    "POST submit: malformed JSON",
    () => [
      {
        path: "/test/submit",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      },
    ],
    400,
    BAD_JSON,
  ],
  [
    "POST submit: empty body with a JSON content-type",
    () => [
      { path: "/test/submit", method: "POST", headers: { "content-type": "application/json" } },
    ],
    400,
    BAD_JSON,
  ],
];

describe("H4 regression net — exact status and body (messages we write)", () => {
  it.each(exactCases)("%s", async (_name, build, status, body) => {
    const [req, jar] = build();
    const res = await send(req, jar);

    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
  });
});

const json = (body: unknown): Req => ({
  path: "/test/submit",
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Only { error: { code, message } } with a non-empty string message: nothing else. */
function expectErrorShape(body: unknown, code: string) {
  expect(Object.keys(body as object)).toEqual(["error"]);
  const error = (body as { error: Record<string, unknown> }).error;
  expect(Object.keys(error).sort()).toEqual(["code", "message"]);
  expect(error.code).toBe(code);
  expect(typeof error.message).toBe("string");
  expect((error.message as string).length).toBeGreaterThan(0);
}

describe("H4 regression net — INVALID_ANSWERS from Zod (code + shape only)", () => {
  it.each([
    ["questionId is a string", { answers: [{ questionId: "x", value: 3 }] }],
    ["answers missing", {}],
    ["answers not an array", { answers: "nope" }],
    ["empty answers", { answers: [] }],
    ["value out of range", { answers: [{ questionId: 1, value: 9 }] }],
  ])("%s → 400 INVALID_ANSWERS", async (_name, body) => {
    const res = await send(json(body));

    expect(res.status).toBe(400);
    expectErrorShape(await res.json(), "INVALID_ANSWERS");
  });
});

describe("H4 AC6 — a 400 INVALID_ANSWERS never echoes the input", () => {
  const MARKER = "zz-h4-marker-7f3c";
  it.each([
    ["marker as a value", { answers: [{ questionId: 1, value: MARKER }] }],
    ["marker as a questionId", { answers: [{ questionId: MARKER, value: 3 }] }],
    ["marker as the answers field", { answers: MARKER }],
    ["marker as an unknown key (body otherwise invalid)", { answers: [], [MARKER]: MARKER }],
    [
      "marker as an unknown key inside an answer",
      { answers: [{ questionId: 1, value: 3, [MARKER]: 1 }] },
    ],
  ])("%s → 400 without the marker", async (_name, body) => {
    const res = await send(json(body));
    const text = await res.text();

    expect(res.status).toBe(400);
    expectErrorShape(JSON.parse(text), "INVALID_ANSWERS");
    expect(text).not.toContain(MARKER);
  });
});
