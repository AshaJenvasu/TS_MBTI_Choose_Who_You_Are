# HANDOFF — Feature: ดูผลลัพธ์ (GET /results/:resultId)

Tickets อยู่ที่ `.scratch/view-result/issues/`
หมายเหตุ: `.scratch/view-result/` เป็นที่เก็บเอกสาร/ticket เท่านั้น โค้ดอยู่ใน `server/src/assessment/` (Bounded Context = Assessment ไม่เปลี่ยน)

## Session 2026-11-24 (ต่อ) — Ticket 03: GET /results/:resultId

### สถานะ ticket
| Ticket | สถานะ | หมายเหตุ |
| --- | --- | --- |
| 03-get-result-by-id | ✅ เสร็จ (ยังไม่ commit, รอรีวิว) | test 93 passed + 1 todo, `tsc --noEmit` exit code 0 |
| GET /results (list) | ⏳ ยังไม่เริ่ม | ticket ถัดไป ห้ามแตะใน ticket 03 |

### ที่ทำ
- **Migration `server/drizzle/0002_safe_annihilus.sql`:** ย้าย `house` จาก `character` → `mbti_type_info` (ไม่แก้ migration เดิม) drizzle-kit generate ออกมาเป็น `ADD COLUMN ... NOT NULL` + `DROP COLUMN` ซึ่งพังบน DB ที่มีข้อมูลและทำข้อมูลหาย จึงแก้ SQL มือเป็น เพิ่มคอลัมน์ nullable → `UPDATE` คัดลอกค่าจาก `character` → `SET NOT NULL` → `DROP COLUMN`
  - ตรวจกับ DB local ที่มีข้อมูล: house 16 แถวเหมือนก่อน/หลังย้ายทุกแถว, `house` เหลือเฉพาะ `mbti_type_info`
  - ตรวจกับ DB เปล่า (database ชั่วคราว): migrate + seed + test ผ่านครบ (ลบ database ชั่วคราวแล้ว)
- **Seed:** `seed-data.ts` ย้าย `house` ไปอยู่ใน `MBTI_TYPES` ครบ 16 type (ค่าเดิม `House <TYPE> Placeholder`)
- **`POST /test/submit` ไม่เปลี่ยน contract:** response ยังมี `character.house` (repository ดึง house จาก `mbti_type_info` แทน) test ของ submit แก้แค่ query ที่ใช้เทียบข้อมูล
- **Endpoint ใหม่ `GET /results/{resultId}`** (ตาม layer Package by Feature ใน `src/assessment/`):
  - `schema/get-result.schema.ts` — Zod: resultId UUID, header `x-guest-token`, response
  - `repositories/get-result.repository.ts` — `findResultWithTypeInfoById` (join test_result + character + mbti_type_info), `findCompatibilityByType` (เรียง other_type ตามตัวอักษร)
  - `services/get-result.services.ts` — `getResult` + `ResultNotFoundError`
  - `controllers/get-result.controllers.ts` — route + error mapping, mount ใน `src/app.ts`
- **Response 200:** `{ mbtiType, character{name,imageUrl,description}, house, goldenPair, compatibleTypes[], challengingTypes[] }` (type code ธรรมดา ไม่ enrich) ไม่คืน guest token/user id กลับ
- **Error ทั้งหมดเป็น nested `{ error: { code, message } }`:**
  - 400 `INVALID_RESULT_ID` (resultId ไม่ใช่ UUID)
  - 400 `AUTH_REQUIRED` (ไม่มี header `X-Guest-Token` หรือค่าว่าง)
  - 404 `RESULT_NOT_FOUND` (ไม่มีแถว หรือเป็นผลของคนอื่น — status + body เหมือนกันเป๊ะ)
  - 500 ใช้ global error handler เดิม (ใส่ใน OpenAPI ของ route นี้ด้วย)
- **BOLA (OWASP API1):** service โยน `ResultNotFoundError` ตัวเดียวทั้งกรณีไม่เจอ / token ไม่ตรง / แถวที่ไม่มี guest_token (เป็นของ user) / token ไม่ใช่ UUID (เทียบ string ใน service ไม่ cast เป็น uuid ใน SQL จึงไม่เกิด 500)
- **ลำดับตรวจ:** resultId + header ถูก validate ก่อนแตะ DB → ไม่มี header = 400 เสมอ ไม่ว่า resultId จะมีจริงหรือไม่ (ไม่รั่วว่ามีแถวนี้)

### Test (ไฟล์ใหม่ `get-result.controllers.test.ts` 21 ข้อ + แก้ของเดิม)
- AC1 owner อ่านได้ (ข้อมูลตรงกับ DB ที่ query ด้วย SQL ดิบอิสระจาก repository, ไม่รั่ว token, ต่อกับ POST /test/submit ได้จริง)
- AC2 resultId ผิดรูปแบบ 4 แบบ → 400
- AC3 UUID ที่ไม่มีแถว → 404
- AC4 แยกจาก AC3 ชัดเจน: สร้างแถวจริงของ owner A, ยืนยันว่า A อ่านได้ (200) แล้วใช้ token B → 404 ที่ status/body/content-type เหมือน AC3 ทุกอย่าง + กรณีแถวของ user (ไม่มี guest_token) + token ที่ไม่ใช่ UUID + สลับ id/token ข้ามกัน
  - mutation check: ลบเงื่อนไขตรวจ token ออกจาก service ชั่วคราว → 4 test แดงจริง แล้วคืนโค้ดกลับ
- AC5 ไม่มี header / header ว่าง → 400 `AUTH_REQUIRED` (resultId มี/ไม่มีจริง → response เหมือนกัน)
- OpenAPI: path/params/headers/responses 200,400,404,500
- `reference-data.test.ts` เพิ่ม 2 test: house ครบ 16 แถวใน `mbti_type_info`, `character` ไม่มีคอลัมน์ house แล้ว
- **`vitest.config.ts`: เพิ่ม `fileParallelism: false`** เพราะ test ที่ใช้ DB หลายไฟล์ลบ `test_result` ทั้งตาราง ถ้ารันพร้อมกันจะชนกัน (flaky)
- RED ก่อนแก้: 21 test แดง (route ยังไม่มี, `house` ยังไม่อยู่บน `mbti_type_info`) → GREEN ทั้งหมดในรอบแรกที่ implement

### ผลสุดท้าย
- test **93 passed + 1 todo (รวม 94)** ใน 6 files (ก่อน ticket นี้: 70 passed + 1 todo) — todo 1 ข้อคือ AC2 logged-in submit ของ Epic 2
- `tsc --noEmit` exit code 0
- ตรวจ live ผ่าน dev server: submit → owner 200 / token ผิด 404 / id ไม่มี 404 (body เหมือนกัน) / ไม่มี header 400 / id ผิดรูปแบบ 400

### สิ่งที่ไม่ได้ทำตาม ticket (ต้องแจ้ง)
- **ไม่ได้ regenerate `openapi.yaml`:** ผู้ใช้ลบ `openapi.yaml` และ `generate-openapi.ts` (กับ script `openapi:generate`) ไปแล้ว spec ของ route ใหม่ดูได้ที่ `/doc` และ `/scalar` ของ dev server (`bun run dev`) และมี test เช็ค OpenAPI document ครอบคลุมไว้ ถ้าต้องการไฟล์ `openapi.yaml` กลับมา ต้องสร้าง script ใหม่
- ไม่มี logic รองรับ session/Better Auth (ตามขอบเขต ticket รอ Epic 2)
- ไม่ได้ตรวจ timing attack ของการเทียบ token (ตามที่ ticket บอกว่าไม่ต้องกังวลในสเกลนี้)

### ขั้นต่อไป
1. รีวิวแล้ว commit เอง (ไฟล์ใหม่ + migration `0002` + แก้ schema/seed/test ที่ระบุข้างบน)
2. ticket ถัดไป: `GET /results` (list) — ยังไม่เริ่ม
3. Known gap เดิม: rate limiting (OWASP API4) ก่อน production — endpoint ใหม่นี้ก็เปิดโดยไม่ต้อง login เช่นกัน
4. `.claude/CLAUDE.md` หัว AI Context Header (`LATEST EVENT FLOW` / `CURRENT FEATURE`) ยังชี้ feature เดิม (submit test) — ผู้ใช้ตัดสินใจเองว่าจะอัปเดตเมื่อไร
