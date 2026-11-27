# HANDOFF — results-list (Epic 1 / Ticket 4)

## Session 2026-11-25 — Epic 1 Ticket 4: GET /results (list)

### สถานะ
- โค้ด + tests เสร็จ ยังไม่ commit
- Tests: 131 passed + 1 todo (9 files), เพิ่ม 10 tests ใน `server/src/assessment/controllers/list-results.controllers.test.ts`
- `tsc --noEmit` ผ่าน, `bun run lint:deps` ผ่าน 0 violations (53 modules, 127 dependencies)

### ทำอะไรไปแล้ว (TDD: RED 9 fail ด้วย 404 → GREEN)
- `server/src/assessment/repositories/list-results.repository.ts`
  - `findResultsByUserId(db, userId)`: join `character`, `WHERE user_id = $1 ORDER BY created_at DESC`
  - select เฉพาะ `id`, `mbti_type`, character `name`/`image_url`, `created_at` (ไม่ `SELECT *`)
- `server/src/assessment/services/list-results.services.ts` — `listResults(db, userId)` map เป็น DTO ทีละ field, `createdAt` เป็น ISO 8601 (UTC)
- `server/src/assessment/schema/list-results.schema.ts` — `ResultListItem` (`id`, `mbtiType`, `character { name, imageUrl }`, `createdAt`) + `ListResultsResponse` (array)
- `server/src/assessment/controllers/list-results.controllers.ts`
  - `createListResultsRoutes(db, auth)` ใช้ `createRoute({ middleware: [requireAuth], security: [{ sessionCookie: [] }] })`
  - route ไม่มี param/query/body, `userId` มาจาก `c.get("user").id` อย่างเดียว
- `server/src/app.ts` — mount ใน block `if (auth)` ถัดจาก `/api/me`. `GET /results/{resultId}` (guest token) เดิมไม่เปลี่ยน

### DTO (ตัดสินใจกับ user แล้ว)
`[{ id, mbtiType, character: { name, imageUrl }, createdAt }]` — ไม่ส่ง `user_id`, `guest_token`, `matched_character_id`. ถ้าต้องการรายละเอียดเต็มค่อยเปิด `GET /results/{id}`

### Tests
- AC1: 3 ผลของ user เดียว insert สลับลำดับเวลา → ได้ `[newest, middle, oldest]`, key ทุก item = whitelist เป๊ะ, ค่า character ตรงกับ raw SQL, `createdAt = "2026-03-01T00:00:00.000Z"`
- AC2: ไม่มี cookie → 401 `UNAUTHORIZED`; cookie ปลอม → body เหมือนกันเป๊ะ
- AC3: user ใหม่ → `200 []`
- AC4 (BOLA):
  - A เห็นแค่ผลของ A (มีผลของ B 2 รายการ + guest 1 รายการ แทรกเวลาอยู่ระหว่างกลาง) — ไม่มี id ของคนอื่นหลุด
  - ส่ง `?userId=<B>&user_id=<B>` + header `X-User-Id: <B>` ด้วย cookie ของ A → `[]` (session ตัดสินอย่างเดียว)
  - A และ B เรียก endpoint เดียวกัน ได้ list ของตัวเองแยกกัน
- OpenAPI: `/results` มี 200/401/500, `security: sessionCookie`, ไม่มี parameters; `ResultListItem` มีแค่ 4 field; `/results/{resultId}` ยังอยู่
- Mutation check (แก้ชั่วคราวแล้ว restore แล้ว, ไฟล์ byte-identical):
  - ลบ `WHERE user_id` → fail 3
  - เรียง ASC → fail 2
  - ใส่ `userId` ใน DTO → fail 1

### Assessment → Identity import (dependency-cruiser)
- **แก้ข้อความใน ticket:** ticket นี้ไม่ใช่ครั้งแรกที่ Assessment import Identity — ครั้งแรกคือ Ticket 04 (`assessment/repositories/schema.ts` → `identity/repositories/schema.ts` เพื่อทำ FK `test_result.user_id → "user".id`)
- ticket นี้เป็น**ครั้งแรกที่ import ระดับ runtime/HTTP**: `assessment/controllers/list-results.controllers.ts` → `identity/auth.ts` (type `Auth`) และ `identity/middleware/require-auth.ts` (`createRequireAuth`, `AuthEnv`)
- test import `identity/testing/fake-google.ts` ด้วย
- ทุกตัวเป็นทิศ assessment → identity (downstream → upstream, Customer-Supplier) ผ่าน `bun run lint:deps` 0 violations

### ข้อสังเกต (ไม่ได้ทำ)
- `test_result.user_id` ไม่มี index (Postgres ไม่สร้างให้ FK เอง). ที่ scale ~1,000 users ไม่มีผล ถ้าต้องการค่อยเพิ่ม `(user_id, created_at DESC)` ใน ticket แยก
- ตอนนี้ `POST /test/submit` ยังเขียน `user_id = null` เสมอ → ใน DB จริง list จะว่างจนกว่า Feature B (claim) หรือ submit แบบ login จะผูก `user_id`

### ขั้นต่อไป
1. Review + commit ticket นี้
2. Epic 2 Feature B (claim) — ใช้ `requireAuth` แบบเดียวกัน, claim แล้วผลจะโผล่ใน `GET /results`

## หมายเหตุอัปเดต (2026-11-27)
- บรรทัด 45 ("`test_result.user_id` ไม่มี index") ล้าสมัยแล้ว: Epic 3 · C1 เพิ่ม index `test_result_user_id_created_at_id_idx` บน `(user_id, created_at DESC, id DESC)` ใน migration `server/drizzle/0007_workable_zombie.sql` (commit `9b095b0`) ดูหลักฐาน EXPLAIN ใน `.scratch/results-pagination/HANDOFF.md`
