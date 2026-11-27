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
  const { rows } = await pool.query<{ id: string }>(
    `select id from "user" where email = $1`,
    [who.email],
  );
  return { jar, userId: rows[0]!.id };
}

const OWNER_TOKEN = "11111111-1111-4111-8111-111111111111";
const OTHER_TOKEN = "22222222-2222-4222-8222-222222222222";

/** Inserts a result owned by `guestToken` (or by a user id when guestToken is null). */
async function insertResult(
  guestToken: string | null,
  mbtiType = "ENFP",
  userId: string | null = null,
) {
  const { rows } = await pool.query<{ id: string }>(
    // Net scores are NOT NULL since Ticket 5; 0 on every axis is enough for these tests.
    `insert into test_result (user_id, guest_token, mbti_type, matched_character_id,
                              ei_score, sn_score, tf_score, jp_score)
     select $1, $2, c.mbti_type, c.id, 0, 0, 0, 0 from "character" c where c.mbti_type = $3
     returning id`,
    [userId, guestToken, mbtiType],
  );
  return rows[0]!.id;
}

const get = (resultId: string, guestToken?: string) =>
  app.request(`/results/${resultId}`, {
    headers: guestToken === undefined ? {} : { "X-Guest-Token": guestToken },
  });

const nowhere = () => crypto.randomUUID();

/** Expected data, read with raw SQL (independent of the repository code). */
async function expectedFor(mbtiType: string) {
  const info = await pool.query(
    `select i.house, i.golden_pair_type, c.name, c.image_url, c.description
     from mbti_type_info i join "character" c on c.mbti_type = i.type_code
     where i.type_code = $1`,
    [mbtiType],
  );
  const compat = await pool.query<{ other_type: string; kind: string }>(
    `select other_type, kind::text as kind from mbti_type_compatibility
     where type_code = $1 order by other_type`,
    [mbtiType],
  );
  const of = (kind: string) =>
    compat.rows.filter((r) => r.kind === kind).map((r) => r.other_type);
  return {
    row: info.rows[0],
    compatible: of("compatible"),
    challenging: of("challenging"),
  };
}

/** GET with an optional session cookie and an optional X-Guest-Token. */
const getAs = (resultId: string, opts: { jar?: CookieJar; guestToken?: string }) => {
  const headers: Record<string, string> = {};
  if (opts.jar) headers.Cookie = opts.jar.header();
  if (opts.guestToken !== undefined) headers["X-Guest-Token"] = opts.guestToken;
  return app.request(`/results/${resultId}`, { headers });
};

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

describe("GET /results/:resultId — AC1 owner sees the result", () => {
  it("returns 200 with the full result for the matching guest token", async () => {
    const id = await insertResult(OWNER_TOKEN, "ENFP");
    const res = await get(id, OWNER_TOKEN);
    expect(res.status).toBe(200);

    const body = await res.json();
    const expected = await expectedFor("ENFP");

    expect(Object.keys(body).sort()).toEqual([
      "breakdown",
      "challengingTypes",
      "character",
      "compatibleTypes",
      "goldenPair",
      "house",
      "mbtiType",
    ]);
    expect(body.mbtiType).toBe("ENFP");
    expect(Object.keys(body.character).sort()).toEqual([
      "description",
      "imageUrl",
      "name",
    ]);
    expect(body.character).toEqual({
      name: expected.row.name,
      imageUrl: expected.row.image_url,
      description: expected.row.description,
    });
    expect(body.house).toBe(expected.row.house);
    expect(body.goldenPair).toBe(expected.row.golden_pair_type);
    expect(body.compatibleTypes).toEqual(expected.compatible);
    expect(body.challengingTypes).toEqual(expected.challenging);
  });

  it("compatibility lists are non-empty arrays of plain type codes", async () => {
    const body = await (await get(await insertResult(OWNER_TOKEN, "ENFP"), OWNER_TOKEN)).json();
    for (const list of [body.compatibleTypes, body.challengingTypes]) {
      expect(list.length).toBeGreaterThan(0);
      for (const code of list) expect(code).toMatch(/^[EI][SN][TF][JP]$/);
    }
  });

  it("returns the data of the result's own type, not another one", async () => {
    const body = await (await get(await insertResult(OWNER_TOKEN, "ISTJ"), OWNER_TOKEN)).json();
    const expected = await expectedFor("ISTJ");
    expect(body.mbtiType).toBe("ISTJ");
    expect(body.house).toBe(expected.row.house);
    expect(body.compatibleTypes).toEqual(expected.compatible);
  });

  it("never echoes the guest token or any owner field back", async () => {
    const text = await (await get(await insertResult(OWNER_TOKEN), OWNER_TOKEN)).text();
    expect(text).not.toContain(OWNER_TOKEN);
    expect(text).not.toContain("guestToken");
    expect(text).not.toContain("userId");
  });

  it("works for a result just created through POST /test/submit", async () => {
    const answers = QUESTIONS.map((q) => ({ questionId: q.id, value: 3 }));
    const created = await (
      await app.request("/test/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      })
    ).json();

    const res = await get(created.resultId, created.guestToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mbtiType).toBe(created.mbtiType);
    expect(body.character.name).toBe(created.character.name);
    expect(body.house).toBe(created.character.house);
  });
});

describe("GET /results/:resultId — AC2 resultId is not a UUID", () => {
  it.each([["not-a-uuid"], ["123"], ["11111111-1111-4111-8111-11111111111g"], ["11111111-1111-4111-8111-1111111111111"]])(
    "%s → 400 INVALID_RESULT_ID",
    async (badId) => {
      const res = await get(badId, OWNER_TOKEN);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(Object.keys(json)).toEqual(["error"]);
      expect(json.error.code).toBe("INVALID_RESULT_ID");
      expect(json.error.message.length).toBeGreaterThan(0);
    },
  );

  it("bad resultId with no X-Guest-Token and no session → 400 INVALID_RESULT_ID (not AUTH_REQUIRED)", async () => {
    // Since Epic 2 A3 the header is optional, so the param check wins over the missing credential.
    const res = await get("not-a-uuid");
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Object.keys(json)).toEqual(["error"]);
    expect(json.error.code).toBe("INVALID_RESULT_ID");
  });
});

describe("GET /results/:resultId — AC3 no such result", () => {
  it("a well-formed UUID that is not in the system → 404 RESULT_NOT_FOUND", async () => {
    const res = await get(nowhere(), OWNER_TOKEN);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(Object.keys(json)).toEqual(["error"]);
    expect(json.error.code).toBe("RESULT_NOT_FOUND");
    expect(json.error.message.length).toBeGreaterThan(0);
  });
});

describe("GET /results/:resultId — AC4 someone else's result (BOLA)", () => {
  it("the row really exists and its owner can read it (so a 404 is not 'missing')", async () => {
    const id = await insertResult(OWNER_TOKEN);
    expect((await get(id, OWNER_TOKEN)).status).toBe(200);
  });

  it("a different guest token gets exactly the same 404 as a nonexistent result", async () => {
    const id = await insertResult(OWNER_TOKEN);
    // Control: the row exists, owner reads it. The only change below is the token.
    expect((await get(id, OWNER_TOKEN)).status).toBe(200);

    const notYours = await get(id, OTHER_TOKEN);
    const missing = await get(nowhere(), OTHER_TOKEN);

    expect(notYours.status).toBe(404);
    expect(notYours.status).toBe(missing.status);
    expect(await notYours.text()).toBe(await missing.text());
    expect(notYours.headers.get("content-type")).toBe(
      missing.headers.get("content-type"),
    );
  });

  it("a result owned by a user id (no guest token) is also 404 for any token", async () => {
    // test_result.user_id has a FK to "user" (Ticket 04), so the owner must exist.
    await pool.query(
      `insert into "user" (id, name, email) values ('user-123', 'Owner', 'user-123@example.test')
       on conflict (id) do nothing`,
    );
    const id = await insertResult(null, "ENFP", "user-123");
    const res = await get(id, OTHER_TOKEN);
    const missing = await get(nowhere(), OTHER_TOKEN);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe(await missing.text());
  });

  it("a token that is not even a UUID is 404 too, never a 500 or a distinguishable error", async () => {
    const id = await insertResult(OWNER_TOKEN);
    const res = await get(id, "abc");
    const missing = await get(nowhere(), "abc");

    expect(res.status).toBe(404);
    expect(await res.text()).toBe(await missing.text());
  });

  it("a guest cannot reach another guest's result by trying many ids or tokens", async () => {
    const mine = await insertResult(OWNER_TOKEN);
    const theirs = await insertResult(OTHER_TOKEN);

    expect((await get(mine, OWNER_TOKEN)).status).toBe(200);
    expect((await get(theirs, OTHER_TOKEN)).status).toBe(200);
    expect((await get(mine, OTHER_TOKEN)).status).toBe(404);
    expect((await get(theirs, OWNER_TOKEN)).status).toBe(404);
  });
});

describe("GET /results/:resultId — AC5 no X-Guest-Token header", () => {
  it("existing result, no header → 400 AUTH_REQUIRED (not 200, not 404)", async () => {
    const id = await insertResult(OWNER_TOKEN);
    const res = await get(id);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Object.keys(json)).toEqual(["error"]);
    expect(json.error.code).toBe("AUTH_REQUIRED");
    expect(json.error.message.length).toBeGreaterThan(0);
  });

  it("nonexistent result, no header → the same 400 (existence is never revealed)", async () => {
    const withRow = await get(await insertResult(OWNER_TOKEN));
    const withoutRow = await get(nowhere());
    expect(withoutRow.status).toBe(400);
    expect(await withoutRow.text()).toBe(await withRow.text());
  });

  it("empty header value counts as missing → 400 AUTH_REQUIRED", async () => {
    const res = await get(await insertResult(OWNER_TOKEN), "");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("AUTH_REQUIRED");
  });
});

describe("GET /results/:resultId — A3 signed-in owner (session, no X-Guest-Token)", () => {
  it("the session user sees their own result: 200 with the full body", async () => {
    const alice = await signInAs(ALICE);
    const id = await insertResult(null, "ENFP", alice.userId);

    const res = await getAs(id, { jar: alice.jar });

    expect(res.status).toBe(200);
    const body = await res.json();
    const expected = await expectedFor("ENFP");
    expect(body).toEqual({
      mbtiType: "ENFP",
      character: {
        name: expected.row.name,
        imageUrl: expected.row.image_url,
        description: expected.row.description,
      },
      house: expected.row.house,
      goldenPair: expected.row.golden_pair_type,
      compatibleTypes: expected.compatible,
      challengingTypes: expected.challenging,
      breakdown: { ei: 50, sn: 50, tf: 50, jp: 50 },
    });
    // The owner id never leaks back.
    expect(JSON.stringify(body)).not.toContain(alice.userId);
  });

  it("BOLA: user B asking for user A's result gets exactly the nonexistent 404", async () => {
    const alice = await signInAs(ALICE);
    const bob = await signInAs(BOB);
    const id = await insertResult(null, "ENFP", alice.userId);
    // Control: the row exists and its owner reads it.
    expect((await getAs(id, { jar: alice.jar })).status).toBe(200);

    const notYours = await getAs(id, { jar: bob.jar });
    const missing = await getAs(nowhere(), { jar: bob.jar });

    expect(notYours.status).toBe(404);
    expect(await notYours.text()).toBe(await missing.text());
    expect(notYours.headers.get("content-type")).toBe(missing.headers.get("content-type"));
  });

  it("a session cannot read a guest's result (user_id null) without its token", async () => {
    const alice = await signInAs(ALICE);
    const id = await insertResult(OWNER_TOKEN);

    const res = await getAs(id, { jar: alice.jar });
    const missing = await getAs(nowhere(), { jar: alice.jar });

    expect(res.status).toBe(404);
    expect(await res.text()).toBe(await missing.text());
  });

  it("a nonexistent result with a session → 404 RESULT_NOT_FOUND", async () => {
    const alice = await signInAs(ALICE);
    const res = await getAs(nowhere(), { jar: alice.jar });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("RESULT_NOT_FOUND");
  });

  it("a user id sent by the client is ignored: the session decides", async () => {
    const alice = await signInAs(ALICE);
    const bob = await signInAs(BOB);
    const bobsResult = await insertResult(null, "ESTJ", bob.userId);

    const res = await app.request(`/results/${bobsResult}?userId=${bob.userId}`, {
      headers: { Cookie: alice.jar.header(), "X-User-Id": bob.userId },
    });

    expect(res.status).toBe(404);
  });

  it("works for a result just created by a signed-in POST /test/submit", async () => {
    const alice = await signInAs(ALICE);
    const answers = QUESTIONS.map((q) => ({ questionId: q.id, value: 3 }));
    const created = await (
      await app.request("/test/submit", {
        method: "POST",
        headers: { "content-type": "application/json", Cookie: alice.jar.header() },
        body: JSON.stringify({ answers }),
      })
    ).json();
    expect(created.guestToken).toBeNull();

    const res = await getAs(created.resultId, { jar: alice.jar });
    expect(res.status).toBe(200);
    expect((await res.json()).mbtiType).toBe(created.mbtiType);
  });
});

describe("GET /results/:resultId — A3 guest token has priority over the session", () => {
  it("signed in + X-Guest-Token of a cached guest result → 200 (token wins)", async () => {
    const alice = await signInAs(ALICE);
    const id = await insertResult(OWNER_TOKEN, "ISTJ");

    const res = await getAs(id, { jar: alice.jar, guestToken: OWNER_TOKEN });

    expect(res.status).toBe(200);
    expect((await res.json()).mbtiType).toBe("ISTJ");
  });

  it("a wrong token never falls back to the session, even for the user's own result → 404", async () => {
    const alice = await signInAs(ALICE);
    const id = await insertResult(null, "ENFP", alice.userId);

    const res = await getAs(id, { jar: alice.jar, guestToken: OTHER_TOKEN });
    const missing = await getAs(nowhere(), { jar: alice.jar, guestToken: OTHER_TOKEN });

    expect(res.status).toBe(404);
    expect(await res.text()).toBe(await missing.text());
  });
});

describe("GET /results/:resultId — A3 no usable credential", () => {
  it("invalid session cookie and no X-Guest-Token → the same 400 AUTH_REQUIRED (not 401/500)", async () => {
    const id = await insertResult(OWNER_TOKEN);
    const jar = new CookieJar();
    jar.set("better-auth.session_token", "not-a-real-token.not-a-real-signature");

    const res = await getAs(id, { jar });
    const noCredential = await get(id);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe(await noCredential.text());
  });
});

describe("GET /results/:resultId — OpenAPI document", () => {
  const doc = app.getOpenAPIDocument(OPENAPI_CONFIG);
  const op = doc.paths["/results/{resultId}"]?.get as any;

  it("describes GET /results/{resultId} with 200, 400, 404 and 500", () => {
    expect(op).toBeDefined();
    expect(Object.keys(op.responses).sort()).toEqual(["200", "400", "404", "500"]);
  });

  it("documents the resultId path param (uuid) and the required X-Guest-Token header", () => {
    const byName = Object.fromEntries(op.parameters.map((p: any) => [p.name, p]));
    expect(byName.resultId.in).toBe("path");
    expect(byName.resultId.schema.format).toBe("uuid");
    expect(byName["x-guest-token"].in).toBe("header");
    // Optional since Epic 2 A3: a signed-in user can read their own result with the session.
    expect(byName["x-guest-token"].required ?? false).toBe(false);
  });

  it("documents the 200 body and the 404 error body", () => {
    const schemas = doc.components?.schemas as Record<string, any>;
    const ok = schemas.GetResultResponse;
    expect(Object.keys(ok.properties).sort()).toEqual([
      "breakdown",
      "challengingTypes",
      "character",
      "compatibleTypes",
      "goldenPair",
      "house",
      "mbtiType",
    ]);
    expect(Object.keys(ok.properties.character.properties).sort()).toEqual([
      "description",
      "imageUrl",
      "name",
    ]);
    const notFound = schemas.ResultNotFoundResponse.properties.error;
    expect(notFound.properties.code.enum).toEqual(["RESULT_NOT_FOUND"]);
  });
});
