# HANDOFF — compatibility-one-kind (Hardening H1)

## Session 2026-11-26 — H1: คู่หนึ่งมี kind ได้อย่างเดียว (mbti_type_compatibility)

### สถานะ
- เสร็จแล้ว ยังไม่ commit (พร้อม commit)
- Tests: 187 passed (10 files) | `tsc --noEmit` ผ่าน | `lint:deps` 0 violations (มี warning `missing-tsc-transpiler` จาก typescript 7.0 อยู่แล้วก่อน ticket นี้)
- ไม่ได้แตะ service/repository/controller ของ Ticket 3 และไม่ได้แก้ seed data

### ขั้นเตรียม
- ไม่มีคู่ `(type_code, other_type)` ที่มีมากกว่า 1 แถว (0 rows), ข้อมูลมี 96 แถว
- PK เดิมชื่อ `mbti_type_compatibility_type_code_other_type_kind_pk`

### ไฟล์ที่เปลี่ยน
- `server/src/assessment/repositories/schema.ts` — PK เหลือ `(typeCode, otherType)`; `kind` เป็น `.notNull()` อยู่แล้ว (เพิ่มคอมเมนต์)
- `server/drizzle/0006_fancy_cyclops.sql` (generate ด้วย drizzle-kit) — `DROP CONSTRAINT ..._kind_pk` + `ADD CONSTRAINT "mbti_type_compatibility_type_code_other_type_pk" PRIMARY KEY("type_code","other_type")` ไม่มี TRUNCATE/DELETE
- `server/drizzle/meta/0006_snapshot.json`, `_journal.json`, `docs/schema.dbml` (ทั้งหมดนี้ generate อัตโนมัติ)
- `server/src/assessment/repositories/reference-data.test.ts` — describe "MbtiTypeCompatibility constraints (Hardening H1)" 3 tests; insert ภายใน transaction ที่ rollback เสมอ ข้อมูล seed จึงไม่เปลี่ยน

### TDD
- RED: แดงเฉพาะ test "same pair with the other kind → 23505" (insert ผ่าน) ส่วน test duplicate ทุกคอลัมน์ (23505) และ test kind null (23502) เขียวตั้งแต่แรก เพราะ PK เดิมกันได้อยู่แล้ว และ `kind` เป็น NOT NULL อยู่แล้ว
- GREEN: test ทั้ง 17 ตัวของ reference-data ผ่าน โดยไม่ได้แก้ assertion เดิมเลย
- `\d` หลัง migrate (ทั้ง DB ที่มีข้อมูลอยู่ และ DB ใหม่ที่สร้างผ่าน `db:setup`):
  - PK 2 คอลัมน์ `(type_code, other_type)`
  - `kind` ยังเป็น not null
  - CHECK `not_self` และ FK ทั้ง 2 ตัวยังอยู่ครบ
  - ข้อมูล 96 แถว
- DB ใหม่: สร้าง database แยกชื่อ `mbti_h1_fresh` ใน container เดิม (ไม่แตะ DB หลัก) ใช้เสร็จแล้ว drop
- Mutation:
  - แก้ schema กลับเป็น PK 3 คอลัมน์ และย้าย 0006 sql/snapshot ออก แล้วใช้ `_journal` ของ HEAD (เพราะ `migrate` อ่านไฟล์ SQL ไม่ได้อ่าน schema.ts)
  - สร้าง DB เปล่า `mbti_h1_mutant` แล้วรัน `db:setup` ได้ PK `..._kind_pk` → test ข้อแรกแดงเหมือนตอน RED
  - restore แล้วเช็ค sha256 ของ 4 ไฟล์ตรงกับก่อน mutation ทุกไฟล์ และ drop DB ชั่วคราวแล้ว
- `drizzle-kit generate` หลัง restore: "No schema changes"

### ขั้นต่อไป
1. Review + commit H1
2. Epic 2 Feature B, Ticket B1 — claim guest result
