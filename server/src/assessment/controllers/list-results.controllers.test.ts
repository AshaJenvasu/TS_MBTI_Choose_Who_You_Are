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
    `insert into test_result (user_id, guest_token, mbti_type, matched_character_id, created_at,
                              ei_score, sn_score, tf_score, jp_score)
     select $1, case when $1::text is null then gen_random_uuid() end, c.mbti_type, c.id, $3,
            0, 0, 0, 0
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

/**
 * Inserts `count` results for one user (or guests when userId is null) in ONE query.
 * Row g (1..count) is created `g` minutes before `base`, so row 1 is the newest;
 * with `sameTime` every row gets exactly `base` (ties are broken by id only).
 */
async function insertMany(opts: {
  userId: string | null;
  count: number;
  base: string;
  sameTime?: boolean;
}) {
  const { rows } = await pool.query<{ id: string }>(
    `insert into test_result (user_id, guest_token, mbti_type, matched_character_id, created_at,
                              ei_score, sn_score, tf_score, jp_score)
     select $1, case when $1::text is null then gen_random_uuid() end, c.mbti_type, c.id,
            $3::timestamptz - case when $4::boolean then interval '0' else g * interval '1 minute' end,
            0, 0, 0, 0
       from generate_series(1, $2::int) g
       cross join "character" c
      where c.mbti_type = 'INTJ'
     returning id`,
    [opts.userId, opts.count, opts.base, opts.sameTime ?? false],
  );
  return rows.map((r) => r.id);
}

/** The expected order, computed by Postgres itself (not a JS sort). */
async function idsInDbOrder(userId: string) {
  const { rows } = await pool.query<{ id: string }>(
    `select id from test_result where user_id = $1 order by created_at desc, id desc`,
    [userId],
  );
  return rows.map((r) => r.id);
}

const list = (jar?: CookieJar) =>
  app.request("/results", jar ? { headers: { Cookie: jar.header() } } : {});

/** GET /results with a raw query string (e.g. "?page=2"), so odd values reach the server as typed. */
const listQuery = (query: string, jar?: CookieJar) =>
  app.request(`/results${query}`, jar ? { headers: { Cookie: jar.header() } } : {});

type Item = { id: string; mbtiType: string; character: object; createdAt: string };
type Page = { items: Item[]; page: number; pageSize: number; total: number; totalPages: number };

const INVALID_PAGE = { error: { code: "INVALID_PAGE", message: expect.any(String) } };

describe("GET /results — AC1 the signed-in user's results, newest first", () => {
  it("returns every result of the user, ordered by created_at DESC, as whitelisted DTOs", async () => {
    const { jar, userId } = await signInAs(ALICE);
    const oldest = await insertResult({ userId, mbtiType: "INTJ", createdAt: "2026-01-01T00:00:00Z" });
    const newest = await insertResult({ userId, mbtiType: "ENFP", createdAt: "2026-03-01T00:00:00Z" });
    const middle = await insertResult({ userId, mbtiType: "ISTP", createdAt: "2026-02-01T00:00:00Z" });

    const res = await list(jar);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Page;
    expect(body.items.map((r) => r.id)).toEqual([newest, middle, oldest]);

    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(["character", "createdAt", "id", "mbtiType"]);
      expect(Object.keys(item.character).sort()).toEqual(["imageUrl", "name"]);
    }
    expect(body.items[0]).toEqual({
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
  it("returns 200 with an empty page, not an error", async () => {
    const { jar } = await signInAs(ALICE);

    const res = await list(jar);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
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

    const ids = ((await res.json()) as Page).items.map((r) => r.id);
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
    const body = (await res.json()) as Page;
    expect(body.items).toEqual([]);
    expect(JSON.stringify(body)).not.toContain(bobResult);
  });

  it("each user gets their own list from the same endpoint", async () => {
    const bob = await signInAs(BOB);
    const alice = await signInAs(ALICE);
    const a = await insertResult({ userId: alice.userId, mbtiType: "INFJ", createdAt: "2026-01-02T00:00:00Z" });
    const b = await insertResult({ userId: bob.userId, mbtiType: "ESTJ", createdAt: "2026-01-03T00:00:00Z" });

    const forAlice = ((await (await list(alice.jar)).json()) as Page).items.map((r) => r.id);
    const forBob = ((await (await list(bob.jar)).json()) as Page).items.map((r) => r.id);

    expect(forAlice).toEqual([a]);
    expect(forBob).toEqual([b]);
  });
});

describe("GET /results — OpenAPI", () => {
  const doc = app.getOpenAPIDocument(OPENAPI_CONFIG);

  it("documents 200, 400, 401 and 500 behind the session cookie, with only the page query param", () => {
    const op = doc.paths?.["/results"]?.get;
    expect(Object.keys(op?.responses ?? {}).sort()).toEqual(["200", "400", "401", "500"]);
    expect(op?.security).toEqual([{ sessionCookie: [] }]);
    const params = (op?.parameters ?? []) as { in: string; name: string }[];
    expect(params.map((p) => [p.in, p.name])).toEqual([["query", "page"]]);
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

// ---------------------------------------------------------------------------
// Epic 3 · C1 — pagination (.scratch/results-pagination/issues/C1-get-results-pagination.md)
// ---------------------------------------------------------------------------

const BASE = "2026-06-01T12:00:00Z";

describe("GET /results — C1 AC1 first page by default", () => {
  it("25 results, no page param → the 10 newest, page 1 of 3", async () => {
    const { jar, userId } = await signInAs(ALICE);
    await insertMany({ userId, count: 25, base: BASE });
    const expected = await idsInDbOrder(userId);

    const res = await list(jar);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Page;
    expect(body.items.map((r) => r.id)).toEqual(expected.slice(0, 10));
    expect(body).toMatchObject({ page: 1, pageSize: 10, total: 25, totalPages: 3 });
  });
});

describe("GET /results — C1 AC2 pages 2 and 3", () => {
  it("pages 1, 2, 3 hold 10, 10, 5 results: all 25, no duplicates, newest to oldest", async () => {
    const { jar, userId } = await signInAs(ALICE);
    await insertMany({ userId, count: 25, base: BASE });
    const expected = await idsInDbOrder(userId);

    const pages: Page[] = [];
    for (const p of [1, 2, 3]) {
      const res = await listQuery(`?page=${p}`, jar);
      expect(res.status).toBe(200);
      pages.push((await res.json()) as Page);
    }

    expect(pages.map((p) => p.items.length)).toEqual([10, 10, 5]);
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    for (const p of pages) expect(p).toMatchObject({ pageSize: 10, total: 25, totalPages: 3 });
    const all = pages.flatMap((p) => p.items.map((r) => r.id));
    expect(all).toEqual(expected);
    expect(new Set(all).size).toBe(25);
  });
});

describe("GET /results — C1 AC3 equal created_at across the page 1/2 boundary", () => {
  it("12 results with the same created_at are ordered by id DESC, as Postgres orders them", async () => {
    const { jar, userId } = await signInAs(ALICE);
    await insertMany({ userId, count: 12, base: BASE, sameTime: true });
    const { rows } = await pool.query<{ id: string }>(
      `select id from test_result where user_id = $1 order by id desc`,
      [userId],
    );
    const expected = rows.map((r) => r.id);

    const page1 = (await (await listQuery("?page=1", jar)).json()) as Page;
    const page2 = (await (await listQuery("?page=2", jar)).json()) as Page;

    expect(page1.items.map((r) => r.id)).toEqual(expected.slice(0, 10));
    expect(page2.items.map((r) => r.id)).toEqual(expected.slice(10));
    expect(new Set([...page1.items, ...page2.items].map((r) => r.id)).size).toBe(12);
  });
});

describe("GET /results — C1 AC4 page past the last one", () => {
  it("page 4 of 25 results → 200, no items, real total and totalPages", async () => {
    const { jar, userId } = await signInAs(ALICE);
    await insertMany({ userId, count: 25, base: BASE });

    const res = await listQuery("?page=4", jar);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], page: 4, pageSize: 10, total: 25, totalPages: 3 });
  });
});

describe("GET /results — C1 AC5 no results at all", () => {
  it("→ 200, no items, total 0, totalPages 0", async () => {
    const { jar } = await signInAs(ALICE);

    const res = await listQuery("?page=1", jar);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
  });
});

describe("GET /results — C1 AC6 malformed page → 400 INVALID_PAGE", () => {
  it.each([
    ["0", "?page=0"],
    ["-1", "?page=-1"],
    ["abc", "?page=abc"],
    ["1.5", "?page=1.5"],
    ["1e2", "?page=1e2"],
    ["01", "?page=01"],
    ["' 1' (leading space)", "?page=%201"],
    ["'' (empty)", "?page="],
    ["99999999999999999999", "?page=99999999999999999999"],
    ["sent twice", "?page=1&page=2"],
  ])("page %s → 400 with the shared error shape (never 500)", async (_label, query) => {
    const { jar } = await signInAs(ALICE);

    const res = await listQuery(query, jar);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(INVALID_PAGE);
  });
});

describe("GET /results — C1 AC7 MAX_PAGE boundary", () => {
  it("page=1000 → 200", async () => {
    const { jar, userId } = await signInAs(ALICE);
    await insertMany({ userId, count: 1, base: BASE });

    const res = await listQuery("?page=1000", jar);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], page: 1000, pageSize: 10, total: 1, totalPages: 1 });
  });

  it("page=1001 → 400 INVALID_PAGE", async () => {
    const { jar } = await signInAs(ALICE);

    const res = await listQuery("?page=1001", jar);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(INVALID_PAGE);
  });
});

describe("GET /results — C1 AC8 the client cannot choose how many rows the server reads", () => {
  it.each([
    "?pageSize=500",
    "?limit=500",
    "?offset=5",
    "?pageSize=500&limit=500&offset=5",
  ])("%s is ignored: still page 1 with at most 10 items", async (query) => {
    const { jar, userId } = await signInAs(ALICE);
    await insertMany({ userId, count: 25, base: BASE });
    const expected = await idsInDbOrder(userId);

    const res = await listQuery(query, jar);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Page;
    expect(body.items.map((r) => r.id)).toEqual(expected.slice(0, 10));
    expect(body).toMatchObject({ page: 1, pageSize: 10, total: 25, totalPages: 3 });
  });
});

describe("GET /results — C1 AC9 no session → 401 before page is validated", () => {
  it.each(["", "?page=1", "?page=abc", "?page=0", "?page=1001", "?page=1&page=2"])(
    "query %j without a session → 401, never 400",
    async (query) => {
      const res = await listQuery(query);

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(UNAUTHORIZED);
    },
  );
});

describe("GET /results — C1 AC10 BOLA: total and items are the session user's only", () => {
  it("Alice 25, Bob 7, guests 3 → Bob sees total 7 and only his own results on every page", async () => {
    const bob = await signInAs(BOB);
    const alice = await signInAs(ALICE);
    const aliceIds = await insertMany({ userId: alice.userId, count: 25, base: BASE });
    const bobIds = await insertMany({ userId: bob.userId, count: 7, base: "2026-06-02T12:00:00Z" });
    const guestIds = await insertMany({ userId: null, count: 3, base: "2026-06-03T12:00:00Z" });

    const page1 = (await (await listQuery("?page=1", bob.jar)).json()) as Page;
    const page2 = (await (await listQuery("?page=2", bob.jar)).json()) as Page;

    expect(page1).toMatchObject({ page: 1, pageSize: 10, total: 7, totalPages: 1 });
    expect(page1.items.map((r) => r.id)).toEqual(await idsInDbOrder(bob.userId));
    expect(page2).toEqual({ items: [], page: 2, pageSize: 10, total: 7, totalPages: 1 });
    const seen = JSON.stringify([page1, page2]);
    for (const other of [...aliceIds, ...guestIds]) expect(seen).not.toContain(other);
    expect(bobIds).toHaveLength(7);

    const forAlice = (await (await list(alice.jar)).json()) as Page;
    expect(forAlice).toMatchObject({ total: 25, totalPages: 3 });
  });
});

describe("GET /results — C1 AC11 OpenAPI contract", () => {
  const doc = app.getOpenAPIDocument(OPENAPI_CONFIG);
  const op = doc.paths?.["/results"]?.get as any;
  const schemas = (doc.components?.schemas ?? {}) as Record<string, any>;
  /** Follows a `$ref` into components.schemas (or returns the inline schema). */
  const resolve = (s: any): any =>
    s?.$ref ? schemas[String(s.$ref).replace("#/components/schemas/", "")] : s;

  it("declares the page query param: integer 1–1000, default 1, optional", () => {
    const page = (op?.parameters ?? []).find((p: any) => p.in === "query" && p.name === "page");
    expect(page).toBeDefined();
    expect(page.required ?? false).toBe(false);
    expect(page.schema).toMatchObject({ type: "integer", minimum: 1, maximum: 1000, default: 1 });
  });

  it("the 400 response is the shared error shape with code INVALID_PAGE", () => {
    const schema = resolve(op?.responses?.["400"]?.content?.["application/json"]?.schema);
    expect(Object.keys(schema?.properties ?? {})).toEqual(["error"]);
    const error = resolve(schema.properties.error);
    expect(Object.keys(error.properties).sort()).toEqual(["code", "message"]);
    expect(error.properties.code.enum).toEqual(["INVALID_PAGE"]);
  });

  it("the 200 response is { items, page, pageSize, total, totalPages } with ResultListItem items", () => {
    const schema = resolve(op?.responses?.["200"]?.content?.["application/json"]?.schema);
    expect(schema?.type).toBe("object");
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual([
      "items",
      "page",
      "pageSize",
      "total",
      "totalPages",
    ]);
    expect([...(schema.required ?? [])].sort()).toEqual([
      "items",
      "page",
      "pageSize",
      "total",
      "totalPages",
    ]);
    expect(schema.properties.items.type).toBe("array");
    expect(schema.properties.items.items).toEqual({ $ref: "#/components/schemas/ResultListItem" });
    for (const key of ["page", "pageSize", "total", "totalPages"]) {
      expect(schema.properties[key]?.type, key).toBe("integer");
    }
  });

  it("POST /results/{resultId}/claim still answers 200 with a single ResultListItem", () => {
    const claim = doc.paths?.["/results/{resultId}/claim"]?.post as any;
    expect(claim?.responses?.["200"]?.content?.["application/json"]?.schema).toEqual({
      $ref: "#/components/schemas/ResultListItem",
    });
  });
});
