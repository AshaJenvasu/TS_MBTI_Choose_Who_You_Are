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

---

## Session 2026-11-24 (ต่อ) — Ticket 2: POST /test/submit

### สถานะ ticket
| Ticket | สถานะ | หมายเหตุ |
| --- | --- | --- |
| 01-seed-mbti-reference-data | ✅ เสร็จ | commit แล้ว |
| 02-submit-test-endpoint | ✅ เสร็จ (ยังไม่ commit, รอรีวิว) | 34 tests เขียว + 1 todo (AC2), `tsc --noEmit` ผ่าน |

### Ticket 2 — ที่ทำเสร็จ
- Migration `server/drizzle/0001_famous_pestilence.sql`: ตาราง `test_result` (id uuid, user_id text nullable ไม่มี FK, guest_token uuid nullable unique, mbti_type FK, matched_character_id FK, created_at timestamptz) + CHECK `user_id IS NOT NULL OR guest_token IS NOT NULL`
- `server/src/assessment/scoring.ts`: `calculateMbtiType` (pure, deterministic)
- `server/src/assessment/submit-test.service.ts`: `submitTest(db, answers, guestToken)` join `mbti_type_info` + `character` แล้ว insert `test_result`
- `server/src/assessment/submit-test.route.ts`: `createRoute` ของ `@hono/zod-openapi` + Zod validation (answers ครบ 20 ข้อ, int 1-5)
- `server/src/app.ts` (`createApp(db)`), `server/src/db/client.ts` (`createDb`), `server/src/generate-openapi.ts` → สร้าง `server/openapi.yaml` ด้วย `bun run openapi:generate`
- Test: `scoring.test.ts` (6) + `submit-test.route.test.ts` (AC1, AC3, AC4, OpenAPI) ใช้ Postgres จริงใน Docker
- RED: 2 test file แดง (`Cannot find module './scoring'` / `'../app'`) → GREEN → REFACTOR (แชร์ `OPENAPI_CONFIG`, เพิ่ม `minItems/maxItems` ใน spec)

### การตัดสินใจ (tech lead อนุมัติ)
- Response: `{ resultId, guestToken, mbtiType, character{name,house,imageUrl,description}, goldenPairType }`
- `guest_token` ใช้ `crypto.randomUUID()`
- Auth: ทุก request เป็น guest เสมอ (`user_id = null`) ไม่มี branch เช็ค login — AC2 ถูกเลื่อนไป Epic 2 (เหลือเป็น `describe.skip` + `it.todo` ใน test)
- Rate limiting: ยังไม่ทำ ดู Known gap ด้านล่าง

### ⚠️ Known gap (security-debt) — ต้องกลับมาทำก่อน production
- **OWASP API4 Unrestricted Resource Consumption:** `POST /test/submit` เปิดให้ guest เรียกได้โดยไม่ต้อง auth และยังไม่มี rate limit
- ต้องเพิ่ม Cloudflare Rate Limiting binding (ticket ระบุตัวอย่าง 10 req/min ต่อ IP) ก่อน deploy จริง
- ยอมรับความเสี่ยงชั่วคราวเพราะ scale เล็ก (~1,000 users) และยังไม่มี `wrangler.toml`/Workers deploy config
- มี comment `TODO(security-debt)` เหนือ route handler ใน `submit-test.route.ts`

### สิ่งที่ผมตัดสินใจเอง (รอ tech lead ยืนยัน)
- Scoring เป็น placeholder: Q1-5 E/I, Q6-10 S/N, Q11-15 T/F, Q16-20 J/P, ผลรวมต่อหมวด > 15 เลือกตัวอักษรแรก (E/S/T/J), เท่ากับ 15 (เสมอ) เลือกตัวที่สอง (I/N/F/P) — แทนด้วย mapping จริงเมื่อมีคำถามจริง
- Success status = **201**, error body = `{ "error": "INVALID_ANSWERS" }`
- JSON ที่ parse ไม่ได้ก็ตอบ 400 `INVALID_ANSWERS` เหมือนกัน

### ขั้นต่อไป
1. รีวิว Ticket 2 แล้ว commit (`server/` มีไฟล์ใหม่ + แก้ `schema.ts`, `package.json`, `bun.lock`)
2. ยังไม่เริ่ม Ticket 3 จนกว่าผู้ใช้สั่ง
3. ก่อน production: ทำ rate limiting (Known gap ข้างบน), ตั้ง Workers entry + `wrangler.toml`, ใช้ Neon HTTP driver แทน `pg`

---

## Session 2026-11-24 (ต่อ) — Restructure `server/` ตาม ADR-004

### ที่ทำ
ย้ายโครงสร้างโฟลเดอร์ของ `server/` เป็น Screaming Architecture + Package by Feature (top-level = Bounded Context, layer ซ้อนข้างใน) **ไม่แตะ business logic** (เปลี่ยนแค่ตำแหน่งไฟล์/ชื่อไฟล์/import path) เหตุผลสั้นๆ: รักษาขอบเขต DDD Bounded Context และ naming convention เดิมที่ผู้ใช้คุ้น รายละเอียดอยู่ใน `docs/adr/004-project-folder-structure.md`

| เดิม (`server/src/assessment/`) | ใหม่ |
| --- | --- |
| `submit-test.route.ts` (+ `.test.ts`) | `controllers/submit-test.controllers.ts` (+ `.test.ts`) |
| `scoring.ts` (+ `.test.ts`) | `services/scoring.ts` (+ `.test.ts`) |
| `submit-test.service.ts` | `services/submit-test.services.ts` |
| `db/schema.ts` (Drizzle) | `repositories/schema.ts` |
| `db/seed.ts`, `db/seed-data.ts`, `db/reference-data.test.ts` | `repositories/` |
| Zod schema ที่อยู่ใน controller | `schema/submit-test.schema.ts` (ดึงออกมาใหม่) |
| Drizzle query ที่อยู่ใน `submit-test.service.ts` | `repositories/submit-test.repository.ts` (ดึงออกมาใหม่) |

- Repository มี 2 function: `findCharacterAndGoldenPairByMbtiType` (join เดียวเหมือนเดิม ไม่แยกเป็น 2 query เพื่อไม่เปลี่ยนพฤติกรรม) และ `insertTestResult`
- `services/submit-test.services.ts` ไม่ import Drizzle แล้ว เรียกผ่าน repository เท่านั้น (logic scoring/throw/สร้าง response เหมือนเดิม)

- ไม่ได้ย้าย: `src/app.ts`, `src/db/client.ts`, `src/generate-openapi.ts`, `openapi.yaml`, `drizzle/`
- แก้ config ตาม path ใหม่: `drizzle.config.ts` (schema path), `package.json` (script `db:seed`), import ใน `app.ts` และไฟล์ที่ย้าย
- หมายเหตุ: `schema/` (Zod) กับ `repositories/schema.ts` (Drizzle) ชื่อซ้ำแต่คนละความหมาย

### ผลตรวจหลังย้าย
- test 34 ข้อเขียว + 1 todo (เท่าเดิมก่อนย้าย และเท่าเดิมหลังแยก repository), `tsc --noEmit` ผ่าน
- `openapi.yaml` regenerate แล้วเหมือนเดิมทุกบรรทัด
- `drizzle-kit generate` ได้ "No schema changes" (migration ไม่ต้องเพิ่ม)
- `db:seed` รันจาก path ใหม่ได้

### ขั้นต่อไป
1. รีวิวผล restructure แล้ว commit (ยังไม่ commit: ทั้ง Ticket 2 และ restructure อยู่ใน working tree)
2. ยังไม่เริ่ม Ticket 3 จนกว่าผู้ใช้สั่ง
