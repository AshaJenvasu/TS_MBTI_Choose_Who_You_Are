import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "../db/client";
import * as identitySchema from "./repositories/schema";

export type AuthConfig = {
  baseURL: string;
  secret: string;
  googleClientId: string;
  googleClientSecret: string;
};

/** Reads auth config from env. Tests pass their own config to createAuth instead. */
export function authConfigFromEnv(env = process.env): AuthConfig {
  const missing = [
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ].filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing auth env vars: ${missing.join(", ")}`);
  }
  return {
    baseURL: env.BETTER_AUTH_URL!,
    secret: env.BETTER_AUTH_SECRET!,
    googleClientId: env.GOOGLE_CLIENT_ID!,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET!,
  };
}

/**
 * Better Auth instance for the Identity context: Google OAuth only, sessions stored in
 * Postgres (session table), cookie-based. Endpoints are served under /api/auth/*.
 */
export function createAuth(db: Db, config: AuthConfig) {
  return betterAuth({
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    database: drizzleAdapter(db, { provider: "pg", schema: identitySchema }),
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
      },
    },
    advanced: {
      // httpOnly + SameSite=Lax are Better Auth defaults; Secure only over https.
      useSecureCookies: config.baseURL.startsWith("https://"),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
