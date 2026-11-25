import { createMiddleware } from "hono/factory";
import type { Auth } from "../auth";

export type AuthUser = Auth["$Infer"]["Session"]["user"];

/** Hono env for routes behind requireAuth: `c.get("user")` is the signed-in user. */
export type AuthEnv = { Variables: { user: AuthUser } };

/** The only 401 body. Same for every reason, so it never hints why a session was refused. */
export const UNAUTHORIZED_BODY = {
  error: {
    code: "UNAUTHORIZED" as const,
    message: "Authentication required",
  },
};

/**
 * Deny-by-default session check. Put it first, before any handler logic:
 * no cookie, unknown/expired/revoked session or tampered cookie → 401 UNAUTHORIZED_BODY.
 * Valid session → `c.set("user", user)` and the route runs.
 * Better Auth checks the session row on every call (cookieCache is off), so a revoked
 * session stops working immediately. DB errors are not swallowed: they become a 500.
 */
export function createRequireAuth(auth: Auth) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json(UNAUTHORIZED_BODY, 401);
    c.set("user", session.user);
    await next();
  });
}
