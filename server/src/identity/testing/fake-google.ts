// Test-only helpers: sign in through Better Auth's real Google flow with Google faked.
// Only Google's token endpoint is stubbed. Better Auth's Google provider reads the profile
// from the id_token it gets back (no signature check in the code flow, because the token
// comes straight from Google over TLS), so the rest of the flow is real.
import { expect, vi } from "vitest";
import type { AuthConfig } from "../auth";

export const BASE = "http://localhost:8787";
export const PAGE = "/dev/auth-test";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const TEST_AUTH_CONFIG: AuthConfig = {
  baseURL: BASE,
  secret: "test-secret-that-is-long-enough-for-better-auth",
  googleClientId: "test-client-id",
  googleClientSecret: "test-client-secret",
};

export type GoogleProfile = { sub: string; email: string; name: string };
export const ALICE: GoogleProfile = {
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
      aud: TEST_AUTH_CONFIG.googleClientId,
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

/**
 * Stubs fetch to Google's token endpoint; `currentUser` picks who "approved" on Google.
 * Other fetches go through. Undo with vi.restoreAllMocks().
 */
export function stubGoogleTokenEndpoint(currentUser: () => GoogleProfile) {
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const target =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (target.startsWith(GOOGLE_TOKEN_ENDPOINT)) {
      return Response.json({
        access_token: "fake-access-token",
        id_token: fakeIdToken(currentUser()),
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid email profile",
      });
    }
    return realFetch(input, init);
  });
}

/** Minimal cookie jar: keeps name=value pairs, drops cookies the server expires. */
export class CookieJar {
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
  get(name: string) {
    return this.cookies.get(name);
  }
  set(name: string, value: string) {
    this.cookies.set(name, value);
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

type App = { request: (url: string, init?: RequestInit) => Response | Promise<Response> };

/** Browser-like client for `app`: same Origin as BASE, carries cookies in `jar`. */
export function createTestClient(app: App) {
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

  return { request, startSignIn, signIn };
}
