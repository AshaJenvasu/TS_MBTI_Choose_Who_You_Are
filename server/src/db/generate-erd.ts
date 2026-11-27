// Generates docs/schema.dbml from the Drizzle schemas (run: `bun run db:erd`).
// Then copies it to the clipboard and opens https://dbdiagram.io/d: paste it into the editor.
// `--no-open` only writes the file (used by `db:generate`).
// Add new bounded-context schema files here and in drizzle.config.ts.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pgGenerate } from "drizzle-dbml-generator";
import * as assessment from "../assessment/repositories/schema";
import * as identity from "../identity/repositories/schema";

const DBDIAGRAM_URL = "https://dbdiagram.io/d";
const out = fileURLToPath(new URL("../../../docs/schema.dbml", import.meta.url));

const dbml = pgGenerate({ schema: { ...assessment, ...identity }, out });
console.log(`ERD written: ${out}`);

if (!process.argv.includes("--no-open")) {
  const copied = copyToClipboard(dbml);
  openBrowser(DBDIAGRAM_URL);
  console.log(
    copied
      ? `Copied to clipboard. In ${DBDIAGRAM_URL}: select all in the editor, then paste.`
      : `Could not copy to clipboard. Open ${out} and paste it into ${DBDIAGRAM_URL}.`,
  );
}

/** Best effort: returns false when no clipboard tool is available. */
function copyToClipboard(text: string) {
  const [cmd, ...args] =
    process.platform === "win32"
      ? ["powershell", "-NoProfile", "-Command", "$input | Set-Clipboard"]
      : process.platform === "darwin"
        ? ["pbcopy"]
        : ["xclip", "-selection", "clipboard"];
  // biome-ignore lint/style/noNonNullAssertion: every branch above is a non-empty array literal
  const res = spawnSync(cmd!, args, { input: text });
  return res.status === 0;
}

function openBrowser(url: string) {
  const [cmd, ...args] =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];
  // biome-ignore lint/style/noNonNullAssertion: every branch above is a non-empty array literal
  spawnSync(cmd!, args, { stdio: "ignore" });
}
