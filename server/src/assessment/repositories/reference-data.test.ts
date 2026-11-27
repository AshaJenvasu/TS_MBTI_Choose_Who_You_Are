import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { testDatabaseUrl } from "../../db/testing/test-db-url";

// Test Postgres (a *_test database): created, migrated and seeded by src/db/testing/global-setup.ts.
const pool = new pg.Pool({
  connectionString: testDatabaseUrl(),
});

afterAll(() => pool.end());

async function rows<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  return (await pool.query<T>(sql)).rows;
}

describe("MbtiTypeInfo reference data", () => {
  it("has exactly 16 rows", async () => {
    const [r] = await rows<{ n: number }>(`select count(*)::int as n from mbti_type_info`);
    expect(r?.n).toBe(16);
  });

  it("has unique type_code", async () => {
    const [r] = await rows<{ n: number }>(
      `select count(distinct type_code)::int as n from mbti_type_info`,
    );
    expect(r?.n).toBe(16);
  });

  it("every golden_pair_type points to another existing type_code", async () => {
    const dangling = await rows(
      `select i.type_code from mbti_type_info i
       left join mbti_type_info g on g.type_code = i.golden_pair_type
       where g.type_code is null`,
    );
    expect(dangling).toEqual([]);

    const selfRef = await rows(
      `select type_code from mbti_type_info where golden_pair_type = type_code`,
    );
    expect(selfRef).toEqual([]);
  });
});

describe("house lives on MbtiTypeInfo, not on Character", () => {
  it("every type has a non-empty house", async () => {
    const [r] = await rows<{ n: number }>(
      `select count(*)::int as n from mbti_type_info
       where house is not null and house <> ''`,
    );
    expect(r?.n).toBe(16);
  });

  it("mbti_type_info has the house column and character no longer does", async () => {
    const cols = await rows<{ table_name: string }>(
      `select table_name from information_schema.columns
       where column_name = 'house' and table_name in ('mbti_type_info', 'character')`,
    );
    expect(cols.map((c) => c.table_name)).toEqual(["mbti_type_info"]);
  });
});

describe("Character reference data", () => {
  it("has 16 rows, exactly one per MBTI type", async () => {
    const [r] = await rows<{ n: number; types: number }>(
      `select count(*)::int as n, count(distinct mbti_type)::int as types
       from "character"`,
    );
    expect(r).toEqual({ n: 16, types: 16 });
  });

  it("every character points to an existing type_code", async () => {
    const orphans = await rows(
      `select c.id from "character" c
       left join mbti_type_info i on i.type_code = c.mbti_type
       where i.type_code is null`,
    );
    expect(orphans).toEqual([]);
  });
});

describe("MbtiTypeCompatibility reference data", () => {
  it("every row points to existing type_codes, never to itself", async () => {
    const bad = await rows(
      `select c.type_code, c.other_type from mbti_type_compatibility c
       left join mbti_type_info a on a.type_code = c.type_code
       left join mbti_type_info b on b.type_code = c.other_type
       where a.type_code is null or b.type_code is null
          or c.type_code = c.other_type`,
    );
    expect(bad).toEqual([]);
  });

  it("only has kind compatible or challenging", async () => {
    const kinds = await rows<{ kind: string }>(
      `select distinct kind::text as kind from mbti_type_compatibility
       order by kind`,
    );
    expect(kinds.map((k) => k.kind)).toEqual(["challenging", "compatible"]);
  });

  it("has exactly 96 rows: 32 compatible + 64 challenging", async () => {
    const [r] = await rows<{ total: number; compat: number; chall: number }>(
      `select count(*)::int as total,
              count(*) filter (where kind = 'compatible')::int as compat,
              count(*) filter (where kind = 'challenging')::int as chall
       from mbti_type_compatibility`,
    );
    expect(r).toEqual({ total: 96, compat: 32, chall: 64 });
  });

  it("stores sample pairs in both directions", async () => {
    const samples = [
      ["INFJ", "INFP", "compatible"],
      ["INFP", "INFJ", "compatible"],
      ["INFJ", "ISTP", "challenging"],
      ["ISTP", "INFJ", "challenging"],
    ];
    for (const [a, b, kind] of samples) {
      const found = await pool.query(
        `select 1 from mbti_type_compatibility
         where type_code = $1 and other_type = $2 and kind = $3`,
        [a, b, kind],
      );
      expect(found.rowCount, `${a} -> ${b} (${kind})`).toBe(1);
    }
  });

  it("never lists a golden pair as compatible or challenging", async () => {
    const dupes = await rows(
      `select c.type_code, c.other_type, c.kind
       from mbti_type_compatibility c
       join mbti_type_info i
         on i.type_code = c.type_code and i.golden_pair_type = c.other_type`,
    );
    expect(dupes).toEqual([]);
  });

  it("is stored in both directions", async () => {
    const missingReverse = await rows(
      `select c.type_code, c.other_type, c.kind
       from mbti_type_compatibility c
       left join mbti_type_compatibility r
         on r.type_code = c.other_type
        and r.other_type = c.type_code
        and r.kind = c.kind
       where r.type_code is null`,
    );
    expect(missingReverse).toEqual([]);
  });

  it("every type has at least one compatible and one challenging type", async () => {
    const lacking = await rows(
      `select i.type_code from mbti_type_info i
       where not exists (select 1 from mbti_type_compatibility c
                         where c.type_code = i.type_code and c.kind = 'compatible')
          or not exists (select 1 from mbti_type_compatibility c
                         where c.type_code = i.type_code and c.kind = 'challenging')`,
    );
    expect(lacking).toEqual([]);
  });
});

/**
 * Runs one insert inside a transaction that is always rolled back,
 * so a constraint test never changes the seeded reference data.
 */
async function insertCompatibilityThenRollback(
  typeCode: string,
  otherType: string,
  kind: string | null,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    return await client.query(
      `insert into mbti_type_compatibility (type_code, other_type, kind)
       values ($1, $2, $3)`,
      [typeCode, otherType, kind],
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
}

describe("MbtiTypeCompatibility constraints (Hardening H1)", () => {
  it("one pair holds one kind only: same pair with the other kind → 23505", async () => {
    // INFJ → INFP is seeded as compatible.
    await expect(
      insertCompatibilityThenRollback("INFJ", "INFP", "challenging"),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("an exact duplicate row is still rejected → 23505", async () => {
    await expect(
      insertCompatibilityThenRollback("INFJ", "INFP", "compatible"),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("kind stays NOT NULL (it is no longer part of the PK) → 23502", async () => {
    // INFJ → ENFP (golden pair) has no row, so only NOT NULL can reject this.
    await expect(insertCompatibilityThenRollback("INFJ", "ENFP", null)).rejects.toMatchObject({
      code: "23502",
      column: "kind",
    });
  });
});
