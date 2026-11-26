# HANDOFF — claim-guest-result (Epic 2 / Ticket B1)

## Session 2026-11-26 — B1: POST /results/:resultId/claim

### สถานะ
- โค้ด + tests เสร็จ ยังไม่ commit
- Tests 247 passed (12 files) | `tsc --noEmit` (`bun node_modules/typescript/bin/tsc`) ผ่าน | `lint:deps` exit 0 (66 modules, 176 dependencies)
- Ticket: `.scratch/claim-guest-result/issues/01-claim-result-endpoint.md`

### ไฟล์
- ใหม่:
  - `server/src/assessment/controllers/claim-result.controllers.ts` (route + `requireAuth` + `TODO(security-debt)` API4)
  - `server/src/assessment/services/claim-result.services.ts` (transaction: conditional UPDATE → อ่านผลที่ user เป็นเจ้าของ)
  - `server/src/assessment/repositories/claim-result.repository.ts`
  - `server/src/assessment/schema/claim-result.schema.ts`
  - `server/src/assessment/controllers/claim-result.controllers.test.ts` (8 tests)
- แก้:
  - `server/src/app.ts` — mount route ใน block `if (auth)`
  - `server/src/assessment/services/list-results.services.ts` — แยก mapper `toResultListItem` ออกมาใช้ร่วมกับ claim (REFACTOR)
- ใช้ซ้ำ: `GetResultParams`, `InvalidGetResultRequestResponse`, `ResultNotFoundResponse`, `ResultListItem`, `ResultNotFoundError`, `createRequireAuth`

### การทำงาน
- token ที่ไม่ใช่ UUID จะไม่ถูกส่งเข้า UPDATE เลย (คอลัมน์ `guest_token` เป็น uuid ถ้าส่งเข้าไป Postgres จะ throw กลายเป็น 500) แต่ยังเข้าเช็ค "เป็นของฉันอยู่แล้วไหม" → 404 เหมือนกรณีอื่น
- ทั้ง claim สำเร็จและ retry ใช้ SELECT ตัวเดียวกันตัดสินผล (`id` + `user_id = me`) ถ้าไม่เจอ → 404

### TDD + mutation
- RED: แดง 8/8 (route ยังไม่มี → 404)
- GREEN: ผ่าน 8/8 และหลัง REFACTOR ยังผ่าน (รวม list-results ได้ 18/18) รันซ้ำ 5 รอบเขียวทุกรอบ
- Mutation A (ลบ `user_id IS NULL`): AC6 **ยังเขียว** เพราะ `guest_token = :token` + ล้าง token เป็น NULL กันคนที่สองไว้ได้อยู่แล้ว
- Mutation B (check-then-write: SELECT เช็คก่อนแล้ว UPDATE ด้วย id อย่างเดียว): AC6 **แดง 3/3** `expected [ 200, 200 ] to deeply equal [ 200, 404 ]`
- Mutation C (ลบ `guest_token = :token` แต่คง `user_id IS NULL` ไว้): AC4 **แดง** `expected 200 to be 404` (ใช้ token ผิดแล้ว claim ได้)
- คืนค่าทุกครั้งแล้ว: sha256 ตรงกับก่อน mutation และ `git grep -n MUTATION` ไม่เจออะไร

### ปิดงานเพิ่ม
- เพิ่ม OpenAPI test 1 ข้อ (`/results/{resultId}/claim` ต้องอยู่ใน OpenAPI doc) ทำให้ claim test เป็น 9 ข้อ
- ADR-003: เพิ่ม "หมายเหตุอัปเดต (2026-11-26)" ท้ายไฟล์ว่ากรณีไม่ใช่เจ้าของตอบ 404 ไม่ใช่ 403 (เช็คแล้วว่าทั้ง GET และ claim ตอบ 404 จริง)

### ขั้นต่อไป
1. Review + commit B1
2. rate-limit ของ claim → จดไว้ใน backlog Epic 5 (SD-1) คู่กับของ submit
