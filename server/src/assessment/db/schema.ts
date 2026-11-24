import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  unique,
} from "drizzle-orm/pg-core";

export const compatibilityKind = pgEnum("compatibility_kind", [
  "compatible",
  "challenging",
]);

export const mbtiTypeInfo = pgTable(
  "mbti_type_info",
  {
    typeCode: text("type_code").primaryKey(),
    goldenPairType: text("golden_pair_type").notNull(),
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
    house: text("house").notNull(),
    imageUrl: text("image_url").notNull(),
    description: text("description").notNull(),
  },
  (t) => [unique("character_mbti_type_unique").on(t.mbtiType)],
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
    kind: compatibilityKind("kind").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.typeCode, t.otherType, t.kind] }),
    check(
      "mbti_type_compatibility_not_self",
      sql`${t.otherType} <> ${t.typeCode}`,
    ),
  ],
);
