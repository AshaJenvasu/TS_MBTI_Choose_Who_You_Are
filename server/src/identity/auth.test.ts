import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { createApp } from "../app";
import { createDb } from "../db/client";
import { createAuth } from "./auth";

// Real Postgres (docker compose) with migrations + seed applied: `bun run db:setup`.
// Google itself is faked: only the token endpoint is stubbed. Better Auth's Google provider
// reads the profile from the id_token it gets back (no signature check in the code flow,
// because the token comes straight from Google over TLS), so the rest of the flow is real.
const url =
  process.env.DATABASE_URL ?? "postgres://mbti:mbti@localhost:5433/mbti";
const pool = new pg.Pool({ connectionString: url });
const { db, close } = createDb(url);

const BASE = "http://localhost:8787";
const auth = createAuth(db, {
  baseURL: BASE,
  secret: "test-secret-that-is-long-enough-for-better-auth",
  googleClientId: "test-client-id",
  googleClientSecret: "test-client-secret",
});
const app = createApp(db, auth);

const PAGE = "/dev/auth-test";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

type GoogleProfile = { sub: string; email: string; name: string };
const ALICE: GoogleProfile = {
  sub: "google-sub-alice",
  email: "alice@example.test",
  name: "Alice",
};

const b64url = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");

/** Unsigned JWT shaped like a Google id_token. */
function fakeIdToken(p: GoogleProfile) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: "RS256", typ: "JWT", kid: "test" }),
    b64url({
      iss: "https://accounts.google.com",
      aud: "test-client-id",
      sub: p.sub,
      email: p.email,
      email_verified: true,
      name: p.name,
      picture: "https://example.test/a.png",
      iat: now,
      exp: now + 3600,
    }),
    "sig",
  ].join(".");
}

/** Next Google user returned by the stubbed token endpoint. */
let googleUser: GoogleProfile = ALICE;
const realFetch = globalThis.fetch;

beforeEach(async () => {
  await clearIdentity();
  googleUser = ALICE;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const target =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (target.startsWith(GOOGLE_TOKEN_ENDPOINT)) {
      return Response.json({
        access_token: "fake-access-token",
        id_token: fakeIdToken(googleUser),
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid email profile",
      });
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await clearIdentity();
  await pool.end();
  await close();
});

/** FK order: test_result points at "user"; session/account cascade but are cleared explicitly. */
async function clearIdentity() {
  await pool.query(`delete from test_result`);
  await pool.query(`delete from session`);
  await pool.query(`delete from account`);
  await pool.query(`delete from verification`);
  await pool.query(`delete from "user"`);
}

/** Minimal cookie jar: keeps name=value pairs, drops cookies the server expires. */
class CookieJar {
  private cookies = new Map<string, string>();
  store(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair!.indexOf("=");
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === "";
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  copy() {
    const c = new CookieJar();
    c.cookies = new Map(this.cookies);
    return c;
  }
}

async function request(path: string, jar: CookieJar, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Origin", BASE);
  const cookie = jar.header();
  if (cookie) headers.set("Cookie", cookie);
  const res = await app.request(`${BASE}${path}`, { ...init, headers });
  jar.store(res);
  return res;
}

/** Step 1: click "Sign in with Google". Returns the Google URL's state param. */
async function startSignIn(jar: CookieJar) {
  const res = await request("/api/auth/sign-in/social", jar, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      callbackURL: PAGE,
      errorCallbackURL: PAGE,
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { url: string };
  const googleUrl = new URL(body.url);
  expect(googleUrl.origin).toBe("https://accounts.google.com");
  return googleUrl.searchParams.get("state")!;
}

/** Full sign-in: start, approve on Google, Google redirects back with a code. */
async function signIn(jar = new CookieJar()) {
  const state = await startSignIn(jar);
  const res = await request(
    `/api/auth/callback/google?code=fake-code&state=${encodeURIComponent(state)}`,
    jar,
  );
  return { res, jar };
}

const getSession = async (jar: CookieJar) => {
  const res = await request("/api/auth/get-session", jar);
  expect(res.status).toBe(200);
  return (await res.json()) as {
    user: { id: string; email: string; name: string };
    session: { id: string; userId: string };
  } | null;
};

const count = async (table: string) => {
  const { rows } = await pool.query<{ n: string }>(`select count(*) as n from ${table}`);
  return Number(rows[0]!.n);
};

describe("Google sign-in — AC1 first sign-in creates an account", () => {
  it("creates a user + account + session, sets the session cookie and returns the profile", async () => {
    const { res, jar } = await signIn();

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(PAGE);
    expect(jar.header()).toMatch(/better-auth\.session_token=/);

    expect(await count(`"user"`)).toBe(1);
    expect(await count("account")).toBe(1);
    expect(await count("session")).toBe(1);

    const { rows } = await pool.query(
      `select provider_id, account_id from account`,
    );
    expect(rows[0]).toEqual({ provider_id: "google", account_id: ALICE.sub });

    const session = await getSession(jar);
    expect(session?.user).toMatchObject({ email: ALICE.email, name: ALICE.name });
  });
});

describe("Google sign-in — AC2 signing in again reuses the same user", () => {
  it("a second sign-in with the same Google account adds a session, not a user", async () => {
    const first = await signIn();
    const second = await signIn();

    expect(second.res.status).toBe(302);
    expect(await count(`"user"`)).toBe(1);
    expect(await count("account")).toBe(1);
    expect(await count("session")).toBe(2);

    const a = await getSession(first.jar);
    const b = await getSession(second.jar);
    expect(a?.user.id).toBe(b?.user.id);
    expect(a?.session.id).not.toBe(b?.session.id);
  });

  it("a different Google account gets its own user", async () => {
    await signIn();
    googleUser = { sub: "google-sub-bob", email: "bob@example.test", name: "Bob" };
    await signIn();

    expect(await count(`"user"`)).toBe(2);
  });
});

describe("Google sign-in — duplicate accounts are refused by the DB, not only by app code", () => {
  const insertAccount = (id: string, userId: string) =>
    pool.query(
      `insert into account (id, account_id, provider_id, user_id, updated_at)
       values ($1, 'google-sub-dup', 'google', $2, now())`,
      [id, userId],
    );

  it("a second account row with the same (provider_id, account_id) violates the unique index", async () => {
    await pool.query(
      `insert into "user" (id, name, email) values
         ('u1', 'One', 'one@example.test'), ('u2', 'Two', 'two@example.test')`,
    );
    await insertAccount("a1", "u1");

    // Same user or another user: the pair itself must be unique.
    await expect(insertAccount("a2", "u1")).rejects.toMatchObject({
      code: "23505",
      constraint: "account_provider_account_unique",
    });
    await expect(insertAccount("a3", "u2")).rejects.toMatchObject({
      code: "23505",
      constraint: "account_provider_account_unique",
    });
    expect(await count("account")).toBe(1);
  });

  it("two concurrent first sign-ins with the same Google account leave 1 user and 1 account", async () => {
    // Both requests really race (each runs through the DB in-process). Observed: the loser
    // hits user_email_unique first (user is inserted before account) and is redirected
    // with ?error=unable_to_create_user. account_provider_account_unique backs this up for
    // races where the user already exists; the raw insert test above proves that index.
    const results = await Promise.all([signIn(), signIn()]);

    expect(await count(`"user"`)).toBe(1);
    expect(await count("account")).toBe(1);
    // At least one request finishes signed in; the loser may be redirected with an error.
    const sessions = await Promise.all(results.map((r) => getSession(r.jar)));
    expect(sessions.filter((s) => s !== null).length).toBeGreaterThanOrEqual(1);
  });

  /** Postgres errors (code + constraint) Better Auth logged via console.error, e.g. "Unable to link account". */
  function loggedPgErrors(spy: { mock: { calls: unknown[][] } }) {
    const found: { code: string; constraint: string }[] = [];
    for (const args of spy.mock.calls) {
      for (const arg of args) {
        // Drizzle wraps the pg error: walk the cause chain.
        for (let e: any = arg; e; e = e.cause) {
          if (typeof e?.code === "string" && typeof e?.constraint === "string") {
            found.push({ code: e.code, constraint: e.constraint });
          }
        }
      }
    }
    return found;
  }

  it("concurrent re-sign-ins of an existing user + account insert nothing (the app finds the account first)", async () => {
    await signIn(); // sequential: user + account already exist
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const results = await Promise.all([signIn(), signIn()]);

    // Better Auth looks the account up by (provider_id, account_id) and only adds a session,
    // so no insert races here and no unique index is involved.
    expect(await count("account")).toBe(1);
    expect(await count(`"user"`)).toBe(1);
    expect(await count("session")).toBe(3);
    expect(results.map((r) => r.res.headers.get("location"))).toEqual([PAGE, PAGE]);
    expect(loggedPgErrors(errors)).toEqual([]);
  });

  it("concurrent first links of a Google account to an existing user: account_provider_account_unique refuses the loser", async () => {
    // The only real-flow path that inserts an account for an existing user is implicit
    // linking: same verified email, no Google account yet. Both requests find no account,
    // both try to insert one; only the unique index can stop the second.
    await pool.query(
      `insert into "user" (id, name, email, email_verified) values ('existing', 'Alice', $1, true)`,
      [ALICE.email],
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const results = await Promise.all([signIn(), signIn()]);

    const { rows } = await pool.query(
      `select user_id from account where provider_id = 'google' and account_id = $1`,
      [ALICE.sub],
    );
    expect(rows).toEqual([{ user_id: "existing" }]);
    expect(await count(`"user"`)).toBe(1);

    const locations = results.map((r) => r.res.headers.get("location")).sort();
    expect(locations).toEqual([PAGE, `${PAGE}?error=unable_to_link_account`]);
    expect(loggedPgErrors(errors)).toEqual([
      { code: "23505", constraint: "account_provider_account_unique" },
    ]);
  });
});

describe("Google sign-in — AC3 sign-out", () => {
  it("clears the session; the old cookie is unauthenticated afterwards", async () => {
    const { jar } = await signIn();
    const oldCookie = jar.copy();

    const res = await request("/api/auth/sign-out", jar, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);

    expect(await count("session")).toBe(0);
    expect(await getSession(oldCookie)).toBeNull();
    expect(await getSession(jar)).toBeNull();
  });
});

describe("Google sign-in — AC4 user cancels on Google's consent screen", () => {
  it("redirects back to the app with a readable error and creates no user or session", async () => {
    const jar = new CookieJar();
    const state = await startSignIn(jar);

    const res = await request(
      `/api/auth/callback/google?error=access_denied&state=${encodeURIComponent(state)}`,
      jar,
    );

    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!, BASE);
    expect(location.pathname).toBe(PAGE);
    expect(location.searchParams.get("error")).toBe("access_denied");

    expect(await count(`"user"`)).toBe(0);
    expect(await count("account")).toBe(0);
    expect(await count("session")).toBe(0);
    expect(await getSession(jar)).toBeNull();
  });
});

describe("Schema — AC5 test_result.user_id references Identity's user table", () => {
  const insertResult = (userId: string) =>
    pool.query(
      `insert into test_result (user_id, mbti_type, matched_character_id)
       select $1, c.mbti_type, c.id from "character" c where c.mbti_type = 'ENFP'`,
      [userId],
    );

  it("the FK points at \"user\".id (text) with ON DELETE RESTRICT", async () => {
    const { rows } = await pool.query(
      `select ccu.table_name as ref_table, ccu.column_name as ref_column, rc.delete_rule,
              (select data_type from information_schema.columns
                where table_name = 'test_result' and column_name = 'user_id') as fk_type,
              (select data_type from information_schema.columns
                where table_name = 'user' and column_name = 'id') as pk_type
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on kcu.constraint_name = tc.constraint_name
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name
         join information_schema.referential_constraints rc
           on rc.constraint_name = tc.constraint_name
        where tc.table_name = 'test_result' and tc.constraint_type = 'FOREIGN KEY'
          and kcu.column_name = 'user_id'`,
    );
    expect(rows).toEqual([
      {
        ref_table: "user",
        ref_column: "id",
        delete_rule: "RESTRICT",
        fk_type: "text",
        pk_type: "text",
      },
    ]);
  });

  it("rejects a result whose user_id is not a real user", async () => {
    await expect(insertResult("no-such-user")).rejects.toMatchObject({ code: "23503" });
  });

  it("accepts the id of a user created by Google sign-in (what claim will write)", async () => {
    const { jar } = await signIn();
    const session = await getSession(jar);

    await expect(insertResult(session!.user.id)).resolves.toMatchObject({ rowCount: 1 });
  });

  it("blocks deleting a user who still owns results", async () => {
    const { jar } = await signIn();
    const session = await getSession(jar);
    await insertResult(session!.user.id);

    await expect(
      pool.query(`delete from "user" where id = $1`, [session!.user.id]),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
