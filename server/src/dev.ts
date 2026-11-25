import { Scalar } from "@scalar/hono-api-reference";
import { createApp, OPENAPI_CONFIG } from "./app";
import { createDb } from "./db/client";
import { authConfigFromEnv, createAuth } from "./identity/auth";
import { AUTH_TEST_PAGE_PATH, authTestPageHtml } from "./identity/dev/auth-test-page";

// Local dev server only (Bun). Not the Workers entry: that needs wrangler.toml later.
const { db } = createDb();
const auth = createAuth(db, authConfigFromEnv());
const app = createApp(db, auth);

app.doc("/doc", OPENAPI_CONFIG);
app.get("/scalar", Scalar({ url: "/doc" }));
// Dev-only manual test page for Google sign-in (never mounted in createApp).
app.get(AUTH_TEST_PAGE_PATH, (c) => c.html(authTestPageHtml));

const port = Number(process.env.PORT ?? 8787);

console.log(`API:        http://localhost:${port}`);
console.log(`Scalar:     http://localhost:${port}/scalar`);
console.log(`OpenAPI:    http://localhost:${port}/doc`);
console.log(`Auth test:  http://localhost:${port}${AUTH_TEST_PAGE_PATH}`);

// `bun run` serves a default export with { port, fetch }.
export default { port, fetch: app.fetch };
