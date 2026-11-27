import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { clearTestData } from "../../db/testing/test-database";
import { testDatabaseUrl } from "../../db/testing/test-db-url";
import { createApp, OPENAPI_CONFIG } from "../../app";
import { createDb } from "../../db/client";
import { createAuth } from "../../identity/auth";
import {
  ALICE,
  type CookieJar,
  createTestClient,
  type GoogleProfile,
  stubGoogleTokenEndpoint,
  TEST_AUTH_CONFIG,
} from "../../identity/testing/fake-google";

// Test Postgres (a *_test database): created, migrated and seeded by src/db/testing/global-setup.ts.
const url = testDatabaseUrl();
const pool = new pg.Pool({ connectionString: url });
const { db, close } = createDb(url);

const auth = createAuth(db, TEST_AUTH_CONFIG);
const app = createApp(db, auth);
const client = createTestClient(app);

const BOB: GoogleProfile = { sub: "google-sub-bob", email: "bob@example.test", name: "Bob" };
const UNAUTHORIZED = {
  error: { code: "UNAUTHORIZED", message: "Authentication required" },
};

let googleUser: GoogleProfile = ALICE;

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

/** Signs in as `who` through the real (fake-Google) flow; returns the jar and user id. */
async function signInAs(who: GoogleProfile) {
  googleUser = who;
  const { jar } = await client.signIn();
  const { rows } = await pool.query<{ id: string }>(`select id from "user" where email = $1`, [
    who.email,
  ]);
  return { jar, userId: rows[0]!.id };
}

/** Inserts an unclaimed guest result; returns its id and guest token. */
async function insertGuestResult(mbtiType = "ENFP") {
  const { rows } = await pool.query<{ id: string; guest_token: string }>(
    `insert into test_result (guest_token, mbti_type, matched_character_id,
                              ei_score, sn_score, tf_score, jp_score)
     select gen_random_uuid(), c.mbti_type, c.id, 0, 0, 0, 0
       from "character" c where c.mbti_type = $1
     returning id, guest_token`,
    [mbtiType],
  );
  return { id: rows[0]!.id, token: rows[0]!.guest_token };
}

/** The whole stored row, to prove a request did (or did not) change it. */
const rowOf = async (id: string) =>
  (await pool.query(`select * from test_result where id = $1`, [id])).rows[0];

const claim = (resultId: string, opts: { jar?: CookieJar; token?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (opts.jar) headers.Cookie = opts.jar.header();
  if (opts.token !== undefined) headers["X-Guest-Token"] = opts.token;
  return app.request(`/results/${resultId}/claim`, { method: "POST", headers });
};

const nowhere = () => crypto.randomUUID();

describe("POST /results/:resultId/claim — AC1 claim succeeds", () => {
  it("returns 200 with the short item, and GET /results now lists it", async () => {
    const alice = await signInAs(ALICE);
    const guest = await insertGuestResult("ENFP");

    const res = await claim(guest.id, { jar: alice.jar, token: guest.token });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["character", "createdAt", "id", "mbtiType"]);
    expect(Object.keys(body.character).sort()).toEqual(["imageUrl", "name"]);
    expect(body.id).toBe(guest.id);
    expect(body.mbtiType).toBe("ENFP");

    const list = await app.request("/results", { headers: { Cookie: alice.jar.header() } });
    expect(((await list.json()) as { items: unknown[] }).items).toEqual([body]);
  });
});

describe("POST /results/:resultId/claim — AC2 the row now belongs to the user", () => {
  it("sets user_id to the session user and clears guest_token", async () => {
    const alice = await signInAs(ALICE);
    const guest = await insertGuestResult();

    await claim(guest.id, { jar: alice.jar, token: guest.token });

    const row = await rowOf(guest.id);
    expect(row.user_id).toBe(alice.userId);
    expect(row.guest_token).toBeNull();
  });
});

describe("POST /results/:resultId/claim — AC3 claiming again is idempotent", () => {
  it("the owner claims twice: same 200 body, row unchanged by the second call", async () => {
    const alice = await signInAs(ALICE);
    const guest = await insertGuestResult();
    const first = await (await claim(guest.id, { jar: alice.jar, token: guest.token })).json();
    const afterFirst = await rowOf(guest.id);

    const again = await claim(guest.id, { jar: alice.jar, token: guest.token });

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    expect(await rowOf(guest.id)).toEqual(afterFirst);
  });
});

describe("POST /results/:resultId/claim — AC4 cannot claim: one identical 404", () => {
  it("already claimed by someone else / wrong token / no such result → same 404, nothing changed", async () => {
    const bob = await signInAs(BOB);
    const alice = await signInAs(ALICE);
    const bobs = await insertGuestResult();
    await claim(bobs.id, { jar: bob.jar, token: bobs.token });
    const open = await insertGuestResult();
    const openBefore = await rowOf(open.id);
    const bobsBefore = await rowOf(bobs.id);

    const responses = [
      await claim(bobs.id, { jar: alice.jar, token: bobs.token }), // claimed by someone else
      await claim(open.id, { jar: alice.jar, token: nowhere() }), // wrong token (a UUID)
      await claim(open.id, { jar: alice.jar, token: "not-a-uuid" }), // wrong token (not a UUID)
      await claim(nowhere(), { jar: alice.jar, token: open.token }), // no such result
    ];

    const bodies = await Promise.all(responses.map((r) => r.text()));
    for (const r of responses) expect(r.status).toBe(404);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]!).error.code).toBe("RESULT_NOT_FOUND");
    expect(await rowOf(open.id)).toEqual(openBefore);
    expect(await rowOf(bobs.id)).toEqual(bobsBefore);
  });
});

describe("POST /results/:resultId/claim — AC5 not signed in", () => {
  it("no session → 401 with the shared body, row unchanged", async () => {
    const guest = await insertGuestResult();
    const before = await rowOf(guest.id);

    const res = await claim(guest.id, { token: guest.token });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(UNAUTHORIZED);
    expect(await rowOf(guest.id)).toEqual(before);
  });
});

describe("POST /results/:resultId/claim — AC6 two users claim at the same time", () => {
  it("exactly one wins (200), the other gets 404, and the row belongs to the winner", async () => {
    const bob = await signInAs(BOB);
    const alice = await signInAs(ALICE);
    const users = [
      { name: "alice", ...alice },
      { name: "bob", ...bob },
    ];

    // Several rounds: one race per fresh result, both requests in flight together.
    for (let round = 0; round < 5; round++) {
      const guest = await insertGuestResult();

      const responses = await Promise.all(
        users.map((u) => claim(guest.id, { jar: u.jar, token: guest.token })),
      );

      const statuses = responses.map((r) => r.status);
      expect([...statuses].sort(), `round ${round}`).toEqual([200, 404]);
      const winner = users[statuses.indexOf(200)]!;
      const row = await rowOf(guest.id);
      expect(row.user_id, `round ${round}`).toBe(winner.userId);
      expect(row.guest_token).toBeNull();
    }
  });
});

describe("POST /results/:resultId/claim — AC7 the owner opens the claimed result", () => {
  it("GET /results/:resultId with the session (no guest token) → 200", async () => {
    const alice = await signInAs(ALICE);
    const guest = await insertGuestResult("ISTJ");
    await claim(guest.id, { jar: alice.jar, token: guest.token });

    const res = await app.request(`/results/${guest.id}`, {
      headers: { Cookie: alice.jar.header() },
    });

    expect(res.status).toBe(200);
    expect((await res.json()).mbtiType).toBe("ISTJ");
  });
});

describe("POST /results/:resultId/claim — bad input, same as GET /results/:resultId", () => {
  it("resultId not a UUID → 400 INVALID_RESULT_ID; no X-Guest-Token → 400 AUTH_REQUIRED", async () => {
    const alice = await signInAs(ALICE);
    const guest = await insertGuestResult();

    const badId = await claim("not-a-uuid", { jar: alice.jar, token: guest.token });
    const noToken = await claim(guest.id, { jar: alice.jar });

    expect(badId.status).toBe(400);
    expect((await badId.json()).error.code).toBe("INVALID_RESULT_ID");
    expect(noToken.status).toBe(400);
    expect((await noToken.json()).error.code).toBe("AUTH_REQUIRED");
  });
});

describe("POST /results/:resultId/claim — OpenAPI", () => {
  it("is documented", () => {
    const doc = app.getOpenAPIDocument(OPENAPI_CONFIG);
    expect(doc.paths?.["/results/{resultId}/claim"]?.post).toBeDefined();
  });
});
