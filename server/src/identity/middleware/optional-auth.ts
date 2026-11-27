import { createMiddleware } from "hono/factory";
import type { Auth } from "../auth";
import type { AuthUser } from "./require-auth";

/**
 * OpenAPI `security` for routes behind optionalAuth: no credential (`{}`) OR the session cookie.
 * Typed as a plain array on purpose: an inline `[{}, ...]` literal in createRoute breaks
 * @hono/zod-openapi's input inference (`c.req.valid(...)` becomes `never`).
 */
export const OPTIONAL_SESSION_SECURITY: Array<Record<string, string[]>> = [
  {},
  { sessionCookie: [] },
];

/** Hono env for routes behind optionalAuth: `c.get("user")` is the signed-in user, or null. */
export type OptionalAuthEnv = { Variables: { user: AuthUser | null } };

/**
 * Session check that never rejects (unlike requireAuth): for routes guests can use too.
 * Valid session → `c.set("user", user)`. No cookie, or an unknown/expired/revoked/tampered
 * session → `c.set("user", null)` and the request continues as a guest.
 * The user always comes from the session, never from anything the client sends.
 * Without `auth` (apps built without Better Auth) every request is a guest.
 * DB errors are not swallowed: they become a 500.
 */
export function createOptionalAuth(auth?: Auth) {
  return createMiddleware<OptionalAuthEnv>(async (c, next) => {
    const session = auth ? await auth.api.getSession({ headers: c.req.raw.headers }) : null;
    c.set("user", session?.user ?? null);
    await next();
  });
}
