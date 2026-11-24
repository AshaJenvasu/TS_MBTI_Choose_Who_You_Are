import { Scalar } from "@scalar/hono-api-reference";
import { createApp, OPENAPI_CONFIG } from "./app";
import { createDb } from "./db/client";

// Local dev server only (Bun). Not the Workers entry: that needs wrangler.toml later.
const { db } = createDb();
const app = createApp(db);

app.doc("/doc", OPENAPI_CONFIG);
app.get("/scalar", Scalar({ url: "/doc" }));

const port = Number(process.env.PORT ?? 8787);

console.log(`API:        http://localhost:${port}`);
console.log(`Scalar:     http://localhost:${port}/scalar`);
console.log(`OpenAPI:    http://localhost:${port}/doc`);

// `bun run` serves a default export with { port, fetch }.
export default { port, fetch: app.fetch };
