import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
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

// Real Postgres (docker compose) with migrations + seed applied: `bun run db:setup`.
const url =
  process.env.DATABASE_URL ?? "postgres://mbti:mbti@localhost:5433/mbti";
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
  await clearAll();
  googleUser = ALICE;
  stubGoogleTokenEndpoint(() => googleUser);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await clearAll();
  await pool.end();
  await close();
});

async function clearAll() {
  await pool.query(`delete from test_result`);
  await pool.query(`delete from session`);
  await pool.query(`delete from account`);
  await pool.query(`delete from verification`);
  await pool.query(`delete from "user"`);
}

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

/** Inserts a result owned by a user (or a guest when userId is null) at a fixed time. */
async function insertResult(opts: {
  userId: string | null;
  mbtiType: string;
  createdAt: string;
}) {
  const { rows } = await pool.query<{ id: string }>(
    `insert into test_result (user_id, guest_token, mbti_type, matched_character_id, created_at)
     select $1, case when $1::text is null then gen_random_uuid() end, c.mbti_type, c.id, $3
       from "character" c where c.mbti_type = $2
     returning id`,
    [opts.userId, opts.mbtiType, opts.createdAt],
  );
  return rows[0]!.id;
}

/** Expected character for a type, read with raw SQL (independent of the repository code). */
async function characterOf(mbtiType: string) {
  const { rows } = await pool.query<{ name: string; imageUrl: string }>(
    `select name, image_url as "imageUrl" from "character" where mbti_type = $1`,
    [mbtiType],
  );
  return rows[0]!;
}

const list = (jar?: CookieJar) =>
  app.request("/results", jar ? { headers: { Cookie: jar.header() } } : {});

type Item = { id: string; mbtiType: string; character: object; createdAt: string };

describe("GET /results — AC1 the signed-in user's results, newest first", () => {
  it("returns every result of the user, ordered by created_at DESC, as whitelisted DTOs", async () => {
    const { jar, userId } = await signInAs(ALICE);
    const oldest = await insertResult({ userId, mbtiType: "INTJ", createdAt: "2026-01-01T00:00:00Z" });
    const newest = await insertResult({ userId, mbtiType: "ENFP", createdAt: "2026-03-01T00:00:00Z" });
    const middle = await insertResult({ userId, mbtiType: "ISTP", createdAt: "2026-02-01T00:00:00Z" });

    const res = await list(jar);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Item[];
    expect(body.map((r) => r.id)).toEqual([newest, middle, oldest]);

    for (const item of body) {
      expect(Object.keys(item).sort()).toEqual(["character", "createdAt", "id", "mbtiType"]);
      expect(Object.keys(item.character).sort()).toEqual(["imageUrl", "name"]);
    }
    expect(body[0]).toEqual({
      id: newest,
      mbtiType: "ENFP",
      character: await characterOf("ENFP"),
      createdAt: "2026-03-01T00:00:00.000Z",
    });
  });
});

describe("GET /results — AC2 not signed in", () => {
  it("returns 401 with the same body as every other protected route", async () => {
    const res = await list();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(UNAUTHORIZED);
  });

  it("an invalid session cookie gets the identical 401", async () => {
    const jar = new CookieJar();
    jar.set("better-auth.session_token", "not-a-real-token.not-a-real-signature");
    const noCookie = await list();

    const invalid = await list(jar);

    expect(invalid.status).toBe(401);
    expect(await invalid.text()).toBe(await noCookie.text());
  });
});

describe("GET /results — AC3 no results yet", () => {
  it("returns 200 with an empty array, not an error", async () => {
    const { jar } = await signInAs(ALICE);

    const res = await list(jar);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /results — AC4 BOLA: only the session user's results", () => {
  it("user A never sees user B's or a guest's results", async () => {
    const bob = await signInAs(BOB);
    const alice = await signInAs(ALICE);
    const aliceIds = [
      await insertResult({ userId: alice.userId, mbtiType: "INFJ", createdAt: "2026-01-02T00:00:00Z" }),
      await insertResult({ userId: alice.userId, mbtiType: "ENTP", createdAt: "2026-01-04T00:00:00Z" }),
    ];
    const othersIds = [
      await insertResult({ userId: bob.userId, mbtiType: "ESTJ", createdAt: "2026-01-03T00:00:00Z" }),
      await insertResult({ userId: bob.userId, mbtiType: "ISFP", createdAt: "2026-01-05T00:00:00Z" }),
      await insertResult({ userId: null, mbtiType: "ENFJ", createdAt: "2026-01-06T00:00:00Z" }),
    ];

    const res = await list(alice.jar);

    const ids = ((await res.json()) as Item[]).map((r) => r.id);
    expect(ids).toEqual([aliceIds[1], aliceIds[0]]);
    for (const other of othersIds) expect(ids).not.toContain(other);
  });

  it("a user id sent by the client is ignored: the session decides", async () => {
    const bob = await signInAs(BOB);
    const alice = await signInAs(ALICE);
    const bobResult = await insertResult({ userId: bob.userId, mbtiType: "ESTJ", createdAt: "2026-01-03T00:00:00Z" });

    const res = await app.request(`/results?userId=${bob.userId}&user_id=${bob.userId}`, {
      headers: { Cookie: alice.jar.header(), "X-User-Id": bob.userId },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Item[];
    expect(body).toEqual([]);
    expect(JSON.stringify(body)).not.toContain(bobResult);
  });

  it("each user gets their own list from the same endpoint", async () => {
    const bob = await signInAs(BOB);
    const alice = await signInAs(ALICE);
    const a = await insertResult({ userId: alice.userId, mbtiType: "INFJ", createdAt: "2026-01-02T00:00:00Z" });
    const b = await insertResult({ userId: bob.userId, mbtiType: "ESTJ", createdAt: "2026-01-03T00:00:00Z" });

    const forAlice = ((await (await list(alice.jar)).json()) as Item[]).map((r) => r.id);
    const forBob = ((await (await list(bob.jar)).json()) as Item[]).map((r) => r.id);

    expect(forAlice).toEqual([a]);
    expect(forBob).toEqual([b]);
  });
});

describe("GET /results — OpenAPI", () => {
  const doc = app.getOpenAPIDocument(OPENAPI_CONFIG);

  it("documents 200, 401 and 500 behind the session cookie, with no request params", () => {
    const op = doc.paths?.["/results"]?.get;
    expect(Object.keys(op?.responses ?? {}).sort()).toEqual(["200", "401", "500"]);
    expect(op?.security).toEqual([{ sessionCookie: [] }]);
    expect(op?.parameters ?? []).toEqual([]);
  });

  it("the item schema lists only the whitelisted fields", () => {
    const item = doc.components?.schemas?.ResultListItem as {
      properties: Record<string, { properties?: object }>;
    };
    expect(Object.keys(item.properties).sort()).toEqual(["character", "createdAt", "id", "mbtiType"]);
    expect(Object.keys(item.properties.character!.properties!).sort()).toEqual(["imageUrl", "name"]);
  });

  it("GET /results/{resultId} (guest token) is still documented", () => {
    expect(doc.paths?.["/results/{resultId}"]?.get).toBeDefined();
  });
});
