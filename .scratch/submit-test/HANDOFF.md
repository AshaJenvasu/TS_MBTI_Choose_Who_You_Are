# HANDOFF — Feature: ทำ Test แล้วได้ผลลัพธ์ (POST /test/submit)

Tickets อยู่ที่ `.scratch/submit-test/issues/`

## Session 2026-11-24

### สถานะ ticket
| Ticket | สถานะ | หมายเหตุ |
| --- | --- | --- |
| 01-seed-mbti-reference-data | ✅ เสร็จ (ยังไม่ commit) | tech lead อนุมัติแล้ว |
| 02-submit-test-endpoint | ⏳ ยังไม่เริ่ม | รอคำสั่งจากผู้ใช้ |

### Ticket 1 — ที่ทำเสร็จ
- Scaffold backend ที่ `server/` (เดิมสร้างที่ `apps/api/` แล้วผู้ใช้ย้ายเป็น `server/`): Hono + Drizzle + Vitest, package manager = bun
- Schema 3 ตาราง (`server/src/assessment/db/schema.ts`):
  - `mbti_type_info` (PK `type_code`, `golden_pair_type` FK self-ref + CHECK ไม่ชี้ตัวเอง)
  - `character` (id identity, `mbti_type` FK + unique, name/house/image_url/description NOT NULL)
  - `mbti_type_compatibility` (junction, PK `(type_code, other_type, kind)`, enum `compatible|challenging`, CHECK ไม่ชี้ตัวเอง)
- Migration: `server/drizzle/0000_aberrant_ben_grimm.sql`
- Seed: `server/src/assessment/db/seed-data.ts` (ข้อมูล) + `seed.ts` (รัน insert, idempotent ด้วย `onConflictDoNothing`)
  - 16 type, 16 character (placeholder), 96 แถว compatibility (32 compatible + 64 challenging, เก็บทั้ง 2 ทิศทาง)
- Test: `server/src/assessment/db/reference-data.test.ts` — **12 tests เขียวทั้งหมด**, `tsc --noEmit` ผ่าน
  - RED ก่อนมี migration: 9/9 แดง (`relation "mbti_type_info" does not exist`)
  - GREEN หลัง migrate + seed, REFACTOR แยก seed-data แล้วยังเขียว
  - หลัง tech lead review เพิ่ม test 3 ข้อ (96 แถวเป๊ะ, ตัวอย่างสมมาตร, golden pair ไม่ซ้ำใน junction) ตรวจแล้วว่าแดงจริงเมื่อข้อมูลผิด

### การตัดสินใจ (อนุมัติโดย tech lead)
- Compatible/challenging แยกเป็นตาราง junction `mbti_type_compatibility` (ไม่ใช้ `text[]`) และ seed ทั้ง 2 ทิศทาง
- Golden pair / compatible / challenging ใช้ logic placeholder ชั่วคราว (มี `TODO` ใน `seed-data.ts`) รอ content design จริง
  - golden pair = สลับตัวอักษรตัวแรกกับตัวสุดท้าย
  - compatible = ตัวอักษรกลาง 2 ตัวเหมือนกัน (ไม่รวมตัวเอง/golden pair)
  - challenging = ตัวอักษรกลาง 2 ตัวต่างกันทั้งคู่
  - golden pair ไม่ถูกใส่ซ้ำใน junction
- `image_url`/`house` เป็น NOT NULL + ค่า placeholder
- CHECK constraint กันชี้ตัวเอง เก็บไว้
- Test DB = Postgres ใน Docker (`server/docker-compose.yml`, port **5433**), test query ผ่าน `pg` ตรงๆ หลัง migrate + seed

### วิธีรัน (จาก `server/`)
- `bun run db:up` เปิด Postgres
- `bun run db:setup` migrate + seed
- `bun run test` รัน test
- `bunx drizzle-kit studio` ดูข้อมูลใน Drizzle Studio

### ขั้นต่อไป
1. ผู้ใช้ commit งาน Ticket 1 (โฟลเดอร์ `server/` ยัง untracked)
2. เริ่ม Ticket 2: `POST /test/submit` (ต้องการ Ticket 1 แล้ว ซึ่งพร้อม) — ผู้ใช้สั่งว่ายังไม่ให้เริ่มจนกว่าจะสั่ง
3. สิ่งที่ Ticket 2 ต้องตัดสินใจ/ยืนยันก่อน: API surface ที่ตกลงไว้ (response shape), วิธีสุ่ม `guest_token`, วิธีเช็ค auth (Better Auth ยังไม่ได้ตั้งค่า), rate-limit 10 req/min ต่อ IP บน Workers

### จุดที่ยังเปิดอยู่
- `.claude/CLAUDE.md` → `CURRENT FEATURE` ชี้ feature นี้อยู่แล้ว ไม่ต้องแก้
- Neon (production) ยังไม่ได้ตั้งค่า, driver ของ Workers (Neon HTTP) ยังไม่ได้ใช้ — ตอนนี้ใช้ `pg` กับ Docker เฉพาะ dev/test
