import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertTestDatabase,
  clearTestData,
  createTestDatabaseIfMissing,
  type Queryable,
  resolveTestDatabaseUrl,
} from "./test-database";

// Unit tests only: a fake Queryable stands in for Postgres. No real connection is opened.

/** Fake db: answers `select current_database()` with `name` and records every SQL text. */
function fakeDb(name: string) {
  const sql: string[] = [];
  const db: Queryable = {
    async query(text: string) {
      sql.push(text);
      if (/current_database\(\)/i.test(text)) return { rows: [{ current_database: name }] };
      return { rows: [] };
    },
  };
  return { db, sql };
}

/** Builds a URL for a database name without any real credentials. */
const urlFor = (dbName: string, host = "db.example.test") =>
  `postgres://someone:not-a-real-secret@${host}:5432/${dbName}`;

const dbNameOf = (url: string) => new URL(url).pathname.replace(/^\//, "");

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The guard's message must name the database and the "_test" rule (never a bare toThrow()). */
const refused = (name: string) => new RegExp(`"${escapeRegExp(name)}".*_test`);

/** Fake admin connection for CREATE DATABASE: records SQL + params, can fail the CREATE. */
function fakeAdmin(opts: { exists: boolean; createError?: Error & { code?: string } }) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const db: Queryable = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (/from\s+pg_database/i.test(sql)) return { rows: opts.exists ? [{ exists: 1 }] : [] };
      if (/^create\s+database/i.test(sql) && opts.createError) throw opts.createError;
      return { rows: [] };
    },
  };
  return { db, calls };
}

const pgError = (code: string) => Object.assign(new Error(`pg error ${code}`), { code });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assertTestDatabase — guard layer 2 asks Postgres for current_database()", () => {
  it('"mbti_test" passes, after asking current_database()', async () => {
    const { db, sql } = fakeDb("mbti_test");

    await expect(assertTestDatabase(db)).resolves.toBeUndefined();
    expect(sql).toHaveLength(1);
    expect(sql[0]).toMatch(/select\s+current_database\(\)/i);
  });

  it.each([
    ["mbti", "the dev database"],
    ["mbti_test_prod", "contains test but does not END with _test"],
    ["", "empty name"],
    ["MBTI_TEST", "upper case is refused: only [a-z0-9_]"],
  ])('"%s" (%s) → throws a message naming the database and the _test rule', async (name) => {
    const { db } = fakeDb(name);

    await expect(assertTestDatabase(db)).rejects.toThrow(refused(name));
  });
});

describe("clearTestData — the shared clearAll calls the guard before any DELETE", () => {
  it('on "mbti" it throws and never sends a DELETE', async () => {
    const { db, sql } = fakeDb("mbti");

    await expect(clearTestData(db)).rejects.toThrow(refused("mbti"));
    expect(sql.some((s) => /\bdelete\b/i.test(s))).toBe(false);
  });

  it('on "mbti_test" it checks current_database() first, then clears the per-test tables in FK order', async () => {
    const { db, sql } = fakeDb("mbti_test");

    await clearTestData(db);

    expect(sql[0]).toMatch(/select\s+current_database\(\)/i);
    expect(sql.slice(1)).toEqual([
      `delete from test_result`,
      `delete from session`,
      `delete from account`,
      `delete from verification`,
      `delete from "user"`,
    ]);
  });

  it("never deletes reference data (character, mbti_type_info, mbti_type_compatibility)", async () => {
    const { db, sql } = fakeDb("mbti_test");

    await clearTestData(db);

    expect(sql.join("\n")).not.toMatch(/character|mbti_type_info|mbti_type_compatibility/i);
  });
});

describe("resolveTestDatabaseUrl — picks the test URL from the ORIGINAL env values", () => {
  it("TEST_DATABASE_URL unset → the local default, whose database is mbti_test", () => {
    const url = resolveTestDatabaseUrl({});

    expect(dbNameOf(url)).toBe("mbti_test");
  });

  it("never falls back to DATABASE_URL: DATABASE_URL set, TEST_DATABASE_URL unset → still mbti_test", () => {
    const url = resolveTestDatabaseUrl({ DATABASE_URL: urlFor("mbti", "localhost") });

    expect(dbNameOf(url)).toBe("mbti_test");
  });

  it("TEST_DATABASE_URL set to a *_test database → that URL as is", () => {
    const wanted = urlFor("other_test");

    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: wanted, DATABASE_URL: urlFor("mbti") })).toBe(
      wanted,
    );
  });

  it("TEST_DATABASE_URL points at a name that does not end with _test (e.g. the dev db) → throws", () => {
    expect(() =>
      resolveTestDatabaseUrl({ TEST_DATABASE_URL: urlFor("mbti"), DATABASE_URL: urlFor("mbti") }),
    ).toThrow(refused("mbti"));
  });

  it("TEST_DATABASE_URL ends with _test but is the same database name as DATABASE_URL (other host) → throws", () => {
    expect(() =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: urlFor("shared_test", "host-a.example.test"),
        DATABASE_URL: urlFor("shared_test", "host-b.example.test"),
      }),
    ).toThrow(/"shared_test".*DATABASE_URL/);
  });

  it("the default is checked too: DATABASE_URL (original value) already points at mbti_test → throws", () => {
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL: urlFor("mbti_test", "localhost") })).toThrow(
      /"mbti_test".*DATABASE_URL/,
    );
  });

  it("reads the name from the URL path only: ?sslmode=require on mbti_test → accepted", () => {
    const wanted = `${urlFor("mbti_test")}?sslmode=require`;

    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: wanted })).toBe(wanted);
  });

  it("a query string cannot fake the suffix: /mbti?note=_test → throws for \"mbti\"", () => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: `${urlFor("mbti")}?note=_test` })).toThrow(
      refused("mbti"),
    );
  });

  it.each([
    ["no path at all", "postgres://someone:not-a-real-secret@db.example.test:5432"],
    ["an empty path", "postgres://someone:not-a-real-secret@db.example.test:5432/"],
  ])("%s → throws for the empty name", (_label, url) => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow(refused(""));
  });

  it("upper case is refused (names must be [a-z0-9_] and end with _test): MBTI_TEST → throws", () => {
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: urlFor("MBTI_TEST") })).toThrow(
      refused("MBTI_TEST"),
    );
  });

  it("reads only the values passed in, never process.env", () => {
    vi.stubEnv("TEST_DATABASE_URL", urlFor("from_process_env_test"));
    vi.stubEnv("DATABASE_URL", urlFor("mbti_test"));

    const url = resolveTestDatabaseUrl({ DATABASE_URL: urlFor("mbti") });

    expect(dbNameOf(url)).toBe("mbti_test");
  });
});

describe("createTestDatabaseIfMissing — the name is checked before any SQL", () => {
  it.each([
    "mbti",
    "mbti-test",
    "Mbti_test",
    "mbti test_test",
    'x"; drop database mbti; --_test',
    "",
  ])("%j is refused before any query is sent", async (name) => {
    const { db, calls } = fakeAdmin({ exists: false });

    await expect(createTestDatabaseIfMissing(db, name)).rejects.toThrow(refused(name));
    expect(calls).toEqual([]);
  });

  it("missing → looks it up in pg_database (name as a parameter), then CREATE DATABASE with a quoted identifier", async () => {
    const { db, calls } = fakeAdmin({ exists: false });

    await expect(createTestDatabaseIfMissing(db, "mbti_test")).resolves.toBe("created");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.sql).toMatch(/from\s+pg_database\s+where\s+datname\s*=\s*\$1/i);
    expect(calls[0]!.params).toEqual(["mbti_test"]);
    expect(calls[1]!.sql).toBe(`CREATE DATABASE "mbti_test"`);
  });

  it("already there → no CREATE", async () => {
    const { db, calls } = fakeAdmin({ exists: true });

    await expect(createTestDatabaseIfMissing(db, "mbti_test")).resolves.toBe("exists");
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["42P04", "duplicate_database"],
    ["23505", "unique_violation on pg_database"],
  ])("created by someone else in between (%s %s) → treated as already there", async (code) => {
    const { db } = fakeAdmin({ exists: false, createError: pgError(code) });

    await expect(createTestDatabaseIfMissing(db, "mbti_test")).resolves.toBe("exists");
  });

  it("any other CREATE error is not swallowed", async () => {
    const { db } = fakeAdmin({ exists: false, createError: pgError("42501") });

    await expect(createTestDatabaseIfMissing(db, "mbti_test")).rejects.toThrow("pg error 42501");
  });
});
