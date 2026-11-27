import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import pg from "pg";
import { clearTestData } from "../../db/testing/test-database";
import { testDatabaseUrl } from "../../db/testing/test-db-url";
import { createApp, OPENAPI_CONFIG } from "../../app";
import { createDb } from "../../db/client";
import { createAuth } from "../auth";
import { type AuthEnv, createRequireAuth } from "../middleware/require-auth";
import {
  ALICE,
  CookieJar,
  createTestClient,
  stubGoogleTokenEndpoint,
  TEST_AUTH_CONFIG,
} from "../testing/fake-google";

// Test Postgres (a *_test database): created, migrated and seeded by src/db/testing/global-setup.ts.
const url = testDatabaseUrl();
const pool = new pg.Pool({ connectionString: url });
const { db, close } = createDb(url);

const auth = createAuth(db, TEST_AUTH_CONFIG);
const app = createApp(db, auth);
const client = createTestClient(app);

const SESSION_COOKIE = "better-auth.session_token";
const UNAUTHORIZED = {
  error: { code: "UNAUTHORIZED", message: "Authentication required" },
};

beforeEach(async () => {
  await clearTestData(pool);
  stubGoogleTokenEndpoint(() => ALICE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await clearTestData(pool);
  await pool.end();
  await close();
});

/** Signed-in browser: cookie jar holding a valid session cookie. */
async function signedIn() {
  const { jar } = await client.signIn();
  expect(jar.get(SESSION_COOKIE)).toBeTruthy();
  return jar;
}

/** Everything a client could compare between two responses. */
async function observable(res: Response) {
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    setCookie: res.headers.get("set-cookie"),
    body: await res.text(),
  };
}

const withCookie = (jar: CookieJar) => ({ headers: { Cookie: jar.header() } });

/** Every way a cookie can be present but not a valid session (AC3). */
const invalidSessions: [string, () => Promise<CookieJar>][] = [
  [
    "a made-up token",
    async () => {
      const jar = new CookieJar();
      jar.set(SESSION_COOKIE, "not-a-real-token.not-a-real-signature");
      return jar;
    },
  ],
  [
    "a tampered cookie (token changed, signature kept)",
    async () => {
      const jar = await signedIn();
      const value = decodeURIComponent(jar.get(SESSION_COOKIE)!);
      const dot = value.lastIndexOf(".");
      const token = value.slice(0, dot);
      const flipped = (token[0] === "a" ? "b" : "a") + token.slice(1);
      jar.set(SESSION_COOKIE, encodeURIComponent(`${flipped}${value.slice(dot)}`));
      return jar;
    },
  ],
  [
    "a session revoked by sign-out",
    async () => {
      const jar = await signedIn();
      const old = jar.copy();
      const out = await client.request("/api/auth/sign-out", jar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(out.status).toBe(200);
      return old;
    },
  ],
  [
    "an expired session",
    async () => {
      const jar = await signedIn();
      // Far in the past so the host/DB timezone difference cannot matter.
      await pool.query(`update session set expires_at = '2000-01-01'`);
      return jar;
    },
  ],
];

describe("GET /api/me — AC1 valid session", () => {
  it("returns 200 with exactly id, email, name and image", async () => {
    const jar = await signedIn();

    const res = await app.request("/api/me", withCookie(jar));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["email", "id", "image", "name"]);

    const { rows } = await pool.query(`select id, email, name, image from "user"`);
    expect(body).toEqual(rows[0]);
    expect(body).toMatchObject({ email: ALICE.email, name: ALICE.name });
  });
});

describe("GET /api/me — AC2 no session cookie", () => {
  it("returns 401 with the project's { error: { code, message } } shape", async () => {
    const res = await app.request("/api/me");

    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual(UNAUTHORIZED);
  });
});

describe("GET /api/me — AC3 invalid session looks exactly like no session", () => {
  it.each(invalidSessions)("%s → identical 401 to AC2", async (_, makeJar) => {
    const jar = await makeJar();
    const noCookie = await observable(await app.request("/api/me"));

    const invalid = await observable(await app.request("/api/me", withCookie(jar)));

    expect(invalid).toEqual(noCookie);
    expect(invalid.status).toBe(401);
  });
});

describe("GET /api/me — session check fails (e.g. DB down)", () => {
  it("returns 500, not 401: an error is never treated as 'not signed in'", async () => {
    const jar = await signedIn();
    vi.spyOn(auth.api, "getSession").mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:5433"),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await app.request("/api/me", withCookie(jar));

    expect(auth.api.getSession).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      },
    });
    // The real error is only logged, never sent to the client.
    expect(body).not.toContain("ECONNREFUSED");
    expect(logged).toHaveBeenCalled();
  });
});

describe("requireAuth — AC4 reusable on any route", () => {
  // A second route, built only here, protected by the same middleware.
  let handlerRuns = 0;
  const other = new Hono<AuthEnv>().get(
    "/test-only/protected",
    createRequireAuth(auth),
    (c) => {
      handlerRuns++;
      return c.json({ userId: c.get("user").id });
    },
  );

  beforeEach(() => {
    handlerRuns = 0;
  });

  it("valid session: the handler runs and sees the signed-in user", async () => {
    const jar = await signedIn();
    const me = (await (await app.request("/api/me", withCookie(jar))).json()) as { id: string };

    const res = await other.request("/test-only/protected", withCookie(jar));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: me.id });
    expect(handlerRuns).toBe(1);
  });

  it("no session: same 401 as /api/me, and the handler never runs", async () => {
    const res = await observable(await other.request("/test-only/protected"));
    const me = await observable(await app.request("/api/me"));

    expect(res).toEqual(me);
    expect(handlerRuns).toBe(0);
  });

  it.each(invalidSessions)(
    "%s: same 401 as /api/me, and the handler never runs",
    async (_, makeJar) => {
      const jar = await makeJar();

      const res = await observable(await other.request("/test-only/protected", withCookie(jar)));
      const me = await observable(await app.request("/api/me", withCookie(jar)));

      expect(res).toEqual(me);
      expect(res.status).toBe(401);
      expect(handlerRuns).toBe(0);
    },
  );
});

describe("GET /api/me — OpenAPI", () => {
  const doc = app.getOpenAPIDocument(OPENAPI_CONFIG);

  it("documents 200, 401 and 500 behind the session cookie", () => {
    const op = doc.paths?.["/api/me"]?.get;
    expect(Object.keys(op?.responses ?? {}).sort()).toEqual(["200", "401", "500"]);
    expect(op?.security).toEqual([{ sessionCookie: [] }]);
    expect(doc.components?.securitySchemes?.sessionCookie).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "better-auth.session_token",
    });
  });

  it("the 200 schema lists only the whitelisted fields", () => {
    const schema = doc.components?.schemas?.MeResponse as { properties: object };
    expect(Object.keys(schema.properties).sort()).toEqual(["email", "id", "image", "name"]);
  });
});
