import { writeFileSync } from "node:fs";
import { stringify } from "yaml";
import { createApp, OPENAPI_CONFIG } from "./app";
import { createDb } from "./db/client";

// The pool connects lazily, so generating the document never touches the database.
const { db, close } = createDb();
const document = createApp(db).getOpenAPIDocument(OPENAPI_CONFIG);
await close();

const target = new URL("../openapi.yaml", import.meta.url);
writeFileSync(target, stringify(document));
console.log(`Wrote ${target.pathname}`);
