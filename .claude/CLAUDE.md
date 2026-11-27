## 🧠 AI Context Header

PROJECT: TS_MBTI_Choose_Who_You_Are!
WEIGHT: 🔴 Core
BOUNDED CONTEXTS:

- Assessment (🔴 Core) — ทำ test, แมตช์ตัวละคร, ดูผล+ประวัติ
- Identity (🟡 Supporting) — สมัคร/login, claim ผล guest เข้าบัญชี
- Sharing (🟡 Supporting) — share link + compare compatibility
  UBIQUITOUS LANGUAGE:
- TestResult = ผลการทำ test 1 ครั้ง (ผูกกับ user หรือ guest_token)
- Character = ข้อมูลภาพ/ชื่อตัวละคร (16 ตัว, 1 ต่อ MBTI type)
- MbtiTypeInfo = ความหมาย/ของแต่ละ type (แยกจาก Character)
- Claim = การผูกผล guest เข้ากับบัญชีที่สมัคร/login
- ShareLink = ลิงก์สาธารณะสำหรับแชร์ผล
  LATEST EVENT FLOW: User → ClaimResult (POST /results/:resultId/claim, requireAuth, X-Guest-Token) → SessionValidated → atomic UPDATE (user_id = me, guest_token = NULL WHERE user_id IS NULL AND guest_token = token) → ResultClaimed (200 short item; then in GET /results) | already mine → 200 same result (idempotent) | someone else's / wrong token / no such id → NotFound (404) | no session → Unauthorized (401)
  CURRENT FEATURE: Epic 3 (History) — C1 pagination ของ GET /results + index commit แล้ว (commit 9b095b0) · Hardening H3 (แยก test DB `mbti_test` + guard) งานเสร็จ รอ commit · Epic 2 (Identity & Claim) commit แล้ว (B1 commit e12be19)

## Working style

- ทำเฉพาะสิ่งที่ถูกขอเท่านั้น ห้าม refactor/เพิ่มฟีเจอร์เกินขอบเขตโดยไม่ถามก่อน
- ถ้างานมีหลายขั้นตอน ให้สรุป plan สั้นๆ ก่อนเริ่มลงมือ แล้วรอ confirm
- ถ้าไม่แน่ใจ scope ให้ถามก่อน อย่าเดาเอง

## Session Management

- ก่อนจบ session ทุกครั้ง ต้องอัปเดต `HANDOFF.md` ของ feature ที่กำลังทำอยู่ (เก็บที่ `.scratch/<feature>/HANDOFF.md`) ให้ตรงกับสถานะล่าสุด (ticket ไหนเสร็จ/ค้าง, ขั้นต่อไปคืออะไร)
- ห้ามเขียนทับหรือลบ section ของ "วันอื่น/session อื่นที่ปิดไปแล้ว" ใน HANDOFF.md — ให้เพิ่ม section ใหม่ต่อท้ายเสมอ (กันเสียประวัติ)
- การแก้ข้อความภายใน section ของ "วันเดียวกัน/session เดียวกันที่ยังเปิดอยู่" ไม่ถือเป็นการ overwrite ประวัติ — แก้ได้ตามปกติเพื่อให้ข้อมูลล่าสุดถูกต้อง

## Auth endpoints (Better Auth)

- `/api/auth/*` (sign-in/social, callback/google, sign-out, get-session) เป็นของ Better Auth เอง mount ใน `server/src/app.ts` — ไม่ผ่าน `@hono/zod-openapi` และไม่อยู่ใน `/doc` (OpenAPI)
- ห้ามสร้าง OpenAPI entry ปลอมให้ route เหล่านี้ — ดู spec ที่ Better Auth docs: https://www.better-auth.com/docs/concepts/api

## Tests (database)

- รัน: `cd server && bun run test` (ต้องเปิด Postgres ก่อน: `bun run db:up`) ไม่ต้อง migrate/seed ฐาน test เอง
- test ใช้ฐานแยกชื่อ `mbti_test` ใน Postgres container เดียวกับ dev: `src/db/testing/global-setup.ts` สร้างฐาน (ถ้ายังไม่มี) → migrate ทุกไฟล์ใน `server/drizzle` → seed ข้อมูลอ้างอิง ทุกครั้งที่รัน (idempotent)
- `TEST_DATABASE_URL` (ไม่บังคับ): ชี้ฐาน test อื่น ชื่อฐานต้องเป็น `[a-z0-9_]` และลงท้าย `_test` และต้องไม่ใช่ฐานเดียวกับ `DATABASE_URL` ไม่งั้น `vitest.config.ts` จะล้มทันทีก่อนต่อฐาน ถ้าไม่ตั้งจะใช้ `mbti_test` บน server ของ `DEFAULT_DATABASE_URL`
- **กฎ: test ห้ามใช้ `DATABASE_URL`** (Bun โหลดจาก `server/.env` ให้เองอยู่แล้ว และวันหน้าจะชี้ฐานจริงตอน deploy)
  - ไฟล์ test อ่าน URL ด้วย `testDatabaseUrl()` (`src/db/testing/test-db-url.ts`) เท่านั้น
  - ล้างข้อมูลด้วย `clearTestData(pool)` (`src/db/testing/test-database.ts`) ซึ่งถาม `current_database()` ก่อนลบทุกครั้ง
  - `vitest.config.ts` ตั้ง `test.env.DATABASE_URL` เป็นฐาน test ให้โค้ดที่ยังอ่าน `DATABASE_URL` ข้างใน test ด้วย
- ห้ามตั้ง `TEST_DATABASE_URL` บนระบบ deploy และห้ามรัน test ใน pipeline ที่ต่อฐานจริง

## Dependency rules (lint:deps)

- warning `missing-tsc-transpiler` ของ `bun run lint:deps` รู้แล้วและปลอดภัย: `tsPreCompilationDeps: true` ต้องใช้ tsc แต่ typescript 7.0 อยู่นอกช่วงที่ depcruise รองรับ ตัวที่แยก import จริงคือ swc (ตรวจแล้วว่าเห็นครบ รวม `import type`)
- ห้ามเอา `tsPreCompilationDeps` ออกเพื่อกำจัด warning: ตอนนี้ swc นับ `import type` เองจึงไม่ต่าง แต่ถ้า depcruise ใช้ tsc ได้ (TS 7.1) การปิดจะทำให้ `import type` หายจากการตรวจ ถ้า TS 7.1 ออกและ depcruise เปลี่ยนไปใช้ tsc ให้รัน canary ใน `server/src/dependency-rules.test.ts` ยืนยันว่ายังจับ `import type` ได้ก่อนปรับ option ใดๆ
- หลักฐาน: `.scratch/dependency-rules/HANDOFF.md` (session 2026-11-27) และ canary `server/src/dependency-rules.test.ts` ทบทวนเมื่อ typescript 7.1 ตัวจริงออก
