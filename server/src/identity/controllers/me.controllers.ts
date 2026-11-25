import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  globalErrorHandler,
  InternalServerErrorResponse,
  UnauthorizedResponse,
} from "../../errors";
import type { Auth } from "../auth";
import { type AuthEnv, createRequireAuth } from "../middleware/require-auth";
import { MeResponse, toMe } from "../schema/me.schema";

/** Better Auth's session cookie (`__Secure-` prefixed when served over https). */
const SESSION_COOKIE_SCHEME = "sessionCookie";

export function createMeRoutes(auth: Auth) {
  const requireAuth = createRequireAuth(auth);

  const meRoute = createRoute({
    method: "get",
    path: "/api/me",
    tags: ["Identity"],
    summary: "The signed-in user's public profile",
    security: [{ [SESSION_COOKIE_SCHEME]: [] }],
    // requireAuth runs before the handler: no valid session never reaches it.
    middleware: [requireAuth] as const,
    responses: {
      200: {
        description: "Signed in: id, email, name and image only",
        content: { "application/json": { schema: MeResponse } },
      },
      401: {
        description:
          "No session, or the session is expired, revoked or tampered with (one identical response for all)",
        content: { "application/json": { schema: UnauthorizedResponse } },
      },
      500: {
        description: "Unexpected server error",
        content: { "application/json": { schema: InternalServerErrorResponse } },
      },
    },
  });

  const routes = new OpenAPIHono<AuthEnv>();
  routes.onError(globalErrorHandler);
  routes.openAPIRegistry.registerComponent("securitySchemes", SESSION_COOKIE_SCHEME, {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Set by Google sign-in at /api/auth/*. Named __Secure-better-auth.session_token over https.",
  });

  return routes.openapi(meRoute, (c) => c.json(toMe(c.get("user")), 200));
}
