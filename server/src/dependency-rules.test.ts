// Locks the Context Map import rules (.dependency-cruiser.cjs) with real depcruise runs.
// Fixtures live in os.tmpdir() (never in src/): a fake src/{identity,assessment,sharing}
// tree, cruised with the project's own config, so a config change that stops catching
// a violation (or stops failing the build) turns this test red.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SERVER_DIR = resolve(__dirname, "..");
const CONFIG = join(SERVER_DIR, ".dependency-cruiser.cjs");
// Always the local package through bun: never npx (a missing local bin falls back to the registry).
const DEPCRUISE = join(SERVER_DIR, "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs");

type RuleName =
  | "identity-not-to-assessment"
  | "sharing-to-assessment-only-via-acl"
  | "identity-not-to-sharing"
  | "sharing-not-to-identity"
  | "assessment-not-to-sharing";

// Import targets inside the fixture (plain files with one value and one type export).
const TARGET = {
  assessment: "src/assessment/services/target.ts",
  assessmentPublic: "src/assessment/public/api.ts",
  identity: "src/identity/target.ts",
  sharing: "src/sharing/target.ts",
} as const;

const TARGET_BODY = "export const x = 1;\nexport type X = { n: number };\n";

/** Each rule: the folder the violating file lives in, and what it imports. */
const RULES: Record<RuleName, { fromDir: string; to: string }> = {
  "identity-not-to-assessment": { fromDir: "src/identity", to: TARGET.assessment },
  "sharing-to-assessment-only-via-acl": { fromDir: "src/sharing", to: TARGET.assessment },
  "identity-not-to-sharing": { fromDir: "src/identity", to: TARGET.sharing },
  "sharing-not-to-identity": { fromDir: "src/sharing", to: TARGET.identity },
  "assessment-not-to-sharing": { fromDir: "src/assessment", to: TARGET.sharing },
};

/** Every import/export form that creates a dependency. `s` is the module specifier. */
const FORMS = {
  value: (s: string) => `import { x } from "${s}";\nexport const p = x;\n`,
  "import-type": (s: string) => `import type { X } from "${s}";\nexport type P = X;\n`,
  "inline-type": (s: string) => `import { type X } from "${s}";\nexport type P = X;\n`,
  "export-named": (s: string) => `export { x } from "${s}";\n`,
  "export-star": (s: string) => `export * from "${s}";\n`,
  "export-type": (s: string) => `export type { X } from "${s}";\n`,
  dynamic: (s: string) => `export async function p() {\n  return await import("${s}");\n}\n`,
  "test-file": (s: string) => `import { x } from "${s}";\nexport const p = x;\n`,
} as const;
type Form = keyof typeof FORMS;

/** Relative specifier from one fixture file to another, without the .ts extension. */
function specifier(fromFile: string, toFile: string) {
  const fromParts = dirname(fromFile).split("/");
  const toParts = toFile.replace(/\.ts$/, "").split("/");
  let i = 0;
  while (i < fromParts.length && fromParts[i] === toParts[i]) i++;
  const up = fromParts.length - i;
  return (up === 0 ? "./" : "../".repeat(up)) + toParts.slice(i).join("/");
}

const violatingFile = (rule: RuleName, form: Form) =>
  `${RULES[rule].fromDir}/${rule}__${form}${form === "test-file" ? ".test.ts" : ".ts"}`;

// Allowed by the Context Map: must never be reported.
const CONTROLS = {
  "sharing/acl -> assessment": { file: "src/sharing/acl/adapter.ts", to: TARGET.assessment },
  "sharing -> assessment/public": { file: "src/sharing/uses-public.ts", to: TARGET.assessmentPublic },
  "assessment -> identity": { file: "src/assessment/uses-identity.ts", to: TARGET.identity },
} as const;

type Fixture = { dir: string; files: Record<string, string> };

function writeFixture({ dir, files }: Fixture) {
  // Same tsconfig as the project (config points at tsconfig.json relative to cwd).
  copyFileSync(join(SERVER_DIR, "tsconfig.json"), join(dir, "tsconfig.json"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
}

function cleanFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const t of Object.values(TARGET)) files[t] = TARGET_BODY;
  for (const c of Object.values(CONTROLS)) files[c.file] = FORMS.value(specifier(c.file, c.to));
  return files;
}

function violatingFiles(): Record<string, string> {
  const files = cleanFiles();
  for (const rule of Object.keys(RULES) as RuleName[]) {
    for (const form of Object.keys(FORMS) as Form[]) {
      const file = violatingFile(rule, form);
      files[file] = FORMS[form](specifier(file, RULES[rule].to));
    }
  }
  return files;
}

function depcruise(cwd: string, outputType?: "json") {
  const args = [DEPCRUISE, "src", "--config", CONFIG];
  if (outputType) args.push("--output-type", outputType);
  const res = spawnSync("bun", args, { cwd, encoding: "utf8" });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

type CruiseResult = {
  modules: { source: string }[];
  summary: { error: number; violations: { from: string; rule: { name: string; severity: string } }[] };
};

const tmpRoots: string[] = [];
function newFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "mbti-depcruise-"));
  tmpRoots.push(dir);
  writeFixture({ dir, files });
  return dir;
}

let violating: { dir: string; json: CruiseResult };
let clean: { dir: string; json: CruiseResult };

beforeAll(() => {
  for (const [name, files] of [
    ["violating", violatingFiles()],
    ["clean", cleanFiles()],
  ] as const) {
    const dir = newFixture(files);
    const run = depcruise(dir, "json");
    let json: CruiseResult;
    try {
      json = JSON.parse(run.stdout);
    } catch {
      throw new Error(`depcruise (${name}) did not return JSON. stderr:\n${run.stderr}`);
    }
    // Every fixture file must really be cruised, or a "no violation" result means nothing.
    const cruised = new Set(json.modules.map((m) => m.source));
    const missing = Object.keys(files).filter((f) => !cruised.has(f));
    if (missing.length) throw new Error(`depcruise (${name}) skipped: ${missing.join(", ")}`);
    if (name === "violating") violating = { dir, json };
    else clean = { dir, json };
  }
}, 120_000);

afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

const rulesFiredFrom = (json: CruiseResult, file: string) =>
  [...new Set(json.summary.violations.filter((v) => v.from === file).map((v) => v.rule.name))];

describe("dependency rules — every import form is caught, per rule", () => {
  const cases = (Object.keys(RULES) as RuleName[]).flatMap((rule) =>
    (Object.keys(FORMS) as Form[]).map((form) => [rule, form] as const),
  );

  it.each(cases)("%s × %s → reported as that rule only", (rule, form) => {
    expect(rulesFiredFrom(violating.json, violatingFile(rule, form))).toEqual([rule]);
  });

  it("every violation is severity error", () => {
    for (const v of violating.json.summary.violations) expect(v.rule.severity).toBe("error");
  });
});

describe("dependency rules — allowed paths are never reported", () => {
  it.each(Object.entries(CONTROLS))("%s → no violation", (_name, c) => {
    expect(rulesFiredFrom(violating.json, c.file)).toEqual([]);
  });

  it("a clean fixture has no violations at all", () => {
    expect(clean.json.summary.violations).toEqual([]);
  });
});

describe("dependency rules — the gate really fails (default reporter, exit code)", () => {
  // One fixture per rule with a single violation: if any one rule is downgraded to warn,
  // its own case goes red (a fixture with every rule would still fail on the others).
  it.each(Object.keys(RULES) as RuleName[])(
    "a %s violation alone makes depcruise exit non-zero",
    (rule) => {
      const file = violatingFile(rule, "value");
      const dir = newFixture({
        ...cleanFiles(),
        [file]: FORMS.value(specifier(file, RULES[rule].to)),
      });
      const { status } = depcruise(dir);
      expect(status).not.toBe(0);
    },
    60_000,
  );

  it("a clean tree exits 0", () => {
    const { status } = depcruise(clean.dir);
    expect(status).toBe(0);
  }, 60_000);
});
