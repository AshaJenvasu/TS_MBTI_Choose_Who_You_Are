import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../identity/repositories/schema";

export const compatibilityKind = pgEnum("compatibility_kind", [
  "compatible",
  "challenging",
]);

export const mbtiTypeInfo = pgTable(
  "mbti_type_info",
  {
    typeCode: text("type_code").primaryKey(),
    goldenPairType: text("golden_pair_type").notNull(),
    house: text("house").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.goldenPairType],
      foreignColumns: [t.typeCode],
      name: "mbti_type_info_golden_pair_type_fk",
    }),
    check(
      "mbti_type_info_golden_pair_not_self",
      sql`${t.goldenPairType} <> ${t.typeCode}`,
    ),
  ],
);

export const character = pgTable(
  "character",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    mbtiType: text("mbti_type")
      .notNull()
      .references(() => mbtiTypeInfo.typeCode),
    name: text("name").notNull(),
    imageUrl: text("image_url").notNull(),
    description: text("description").notNull(),
  },
  (t) => [unique("character_mbti_type_unique").on(t.mbtiType)],
);

// user_id references Identity's Better Auth "user" table (text id). Claim (ADR-003)
// sets it. RESTRICT: a user who still owns results cannot be deleted by accident.
export const testResult = pgTable(
  "test_result",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "restrict" }),
    guestToken: uuid("guest_token").unique(),
    mbtiType: text("mbti_type")
      .notNull()
      .references(() => mbtiTypeInfo.typeCode),
    matchedCharacterId: integer("matched_character_id")
      .notNull()
      .references(() => character.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Net score per axis from scoreAxes(): (first letter) - (second letter), -12..+12.
    // Kept instead of the 24 raw answers: enough to show the % breakdown again later.
    eiScore: integer("ei_score").notNull(),
    snScore: integer("sn_score").notNull(),
    tfScore: integer("tf_score").notNull(),
    jpScore: integer("jp_score").notNull(),
  },
  (t) => [
    check(
      "test_result_user_or_guest",
      sql`${t.userId} IS NOT NULL OR ${t.guestToken} IS NOT NULL`,
    ),
    check("test_result_ei_score_range", sql`${t.eiScore} BETWEEN -12 AND 12`),
    check("test_result_sn_score_range", sql`${t.snScore} BETWEEN -12 AND 12`),
    check("test_result_tf_score_range", sql`${t.tfScore} BETWEEN -12 AND 12`),
    check("test_result_jp_score_range", sql`${t.jpScore} BETWEEN -12 AND 12`),
  ],
);

export const mbtiTypeCompatibility = pgTable(
  "mbti_type_compatibility",
  {
    typeCode: text("type_code")
      .notNull()
      .references(() => mbtiTypeInfo.typeCode),
    otherType: text("other_type")
      .notNull()
      .references(() => mbtiTypeInfo.typeCode),
    // NOT NULL on its own: kind is no longer part of the PK.
    kind: compatibilityKind("kind").notNull(),
  },
  (t) => [
    // One row per (type_code, other_type): a pair is compatible OR challenging, never both.
    primaryKey({ columns: [t.typeCode, t.otherType] }),
    check(
      "mbti_type_compatibility_not_self",
      sql`${t.otherType} <> ${t.typeCode}`,
    ),
  ],
);
