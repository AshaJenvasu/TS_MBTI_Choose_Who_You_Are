# HANDOFF — error-helper (Hardening H4)

## Session 2026-11-27 — H4 Phase 1: ล็อกพฤติกรรมเดิม (ยังไม่แก้ production)

### สถานะ
- Ticket: `.scratch/error-helper/issues/H4-error-helper.md`
- Phase 1 เสร็จ **รอผู้ใช้สั่งก่อนเริ่ม Phase 2 (refactor)**
- ยังไม่ commit และยังไม่แก้ production
- `.claude/CLAUDE.md` (หัวข้อ "Dependency rules (lint:deps)") แก้จากรอบสำรวจ H4 Phase 0 ยังไม่ commit

### Baseline (ก่อนแก้)
- test: 310 passed (13 files)
- OpenAPI document: สร้างแบบเดียวกับ test (`createApp(db, createAuth(db, TEST_AUTH_CONFIG))` → `getOpenAPIDocument(OPENAPI_CONFIG)` → `JSON.stringify(doc, null, 2)`) ผ่านสคริปต์ใน scratchpad
  - sha256 `5277437e9f910da58bea2d4e4d176aa56ff097444e3a96e9a414b3542b3eee7c` (รัน 2 ครั้งได้ค่าเดียวกัน)
  - 5 paths, 13 schemas
  - ไฟล์และสคริปต์อยู่ใน scratchpad ไม่ได้อยู่ใน repo

### ตาข่าย regression: `server/src/error-responses.test.ts` (ใหม่, 38 tests, เขียวบนโค้ดเดิมทันที)
- 28 เคส `toEqual` body เต็ม (ล็อกข้อความทุกตัวอักษรและห้าม field เกิน):
  - GET result 9 เคส
  - POST claim 9 เคส (รวม param ผิดพร้อม header หาย และ 401 ก่อนการ validate)
  - GET results 6 เคส
  - GET me 2 เคส
  - submit "valid JSON" 2 เคส
- 5 เคส `INVALID_ANSWERS` จาก Zod: ล็อกแค่ code และรูปร่าง
- 5 เคส AC6 (marker): **ผ่านบนโค้ดเดิม ไม่มีการ echo input**
- ไม่ล็อก 415 ตาม ticket

### Mutation (รันแค่ไฟล์นี้, ย้อนกลับแล้ว sha256 ตรง, `git grep MUTATION` สะอาด)
| ข้อ | แก้ที่ | แดง |
|---|---|---|
| a | ข้อความ INVALID_RESULT_ID (`get-result.controllers.ts` hook) | 3 |
| b | `AUTH_REQUIRED_MESSAGE` (get-result) | 3 |
| c | ข้อความ INVALID_PAGE (list-results) | 3 |
| d | ข้อความ UNAUTHORIZED (`require-auth.ts`) | 7 |
| e | ข้อความ RESULT_NOT_FOUND (get-result) | 3 |
| f | hook ของ get-result: header ให้ไปเป็น INVALID_RESULT_ID | 1 |
| g | "Request body must be valid JSON" (submit-test) | 2 |
| h | เพิ่ม field `hint` ใน `INVALID_PAGE_BODY` | 3 |

- รอบแรก (a) และ (c) ใช้ไม่ได้เพราะ mutation ของผมเองเสีย ((a) ใช้ `//` จนไฟล์โหลดไม่ขึ้น, (c) perl ไม่ match) ทำใหม่ด้วย `/* MUTATION */` แล้วแดงตามที่ควร

### ผลหลัง Phase 1
- test 348 passed (14 files), `tsc` exit 0, `lint:deps` no violations (75 modules, 214 deps)

## Session 2026-11-27 (ต่อ) — H4 Phase 2–3: refactor + เอกสาร (ผู้ใช้อนุมัติ Phase 1 แล้ว)

### สถานะ
- refactor เสร็จ test เขียวทั้งหมด **รอผู้ใช้รีวิวแล้ว commit เอง**

### การตัดสินใจ 5 ข้อ (ตาม ticket) และสิ่งที่ทำ
1. `errorBody<C extends string>(code, message): { error: { code: C; message: string } }` อยู่ที่ `server/src/errors.ts:18-28` ใช้ลายเซ็นตามที่ล็อกไว้ไม่ต้องเปลี่ยน errors.ts ไม่รู้จัก code ของ context ไหน
2. ไฟล์ร่วม **`server/src/assessment/controllers/result-errors.ts`**:
   - **ทำไมชื่อนี้**: ไฟล์ที่ไม่ใช่ route ใน repo ตั้งชื่อตามแนวคิดโดยไม่มี suffix (`services/pagination.ts`, `services/breakdown.ts`) และวางไว้ชั้น controllers เพราะ hook กับ body เป็นเรื่อง HTTP ไม่ใช่ service
   - มี `AUTH_REQUIRED_BODY` :8, `INVALID_RESULT_ID_BODY` :9, `RESULT_NOT_FOUND_BODY` :12, `resultRequestHook` :20-28
   - hook เป็น generic `<E extends Env>` ใช้ชนิด `Hook` ของ @hono/zod-openapi และไม่มี `any`
   - **หลักฐานที่ต้องเป็น generic**: ลองใช้ชนิดตายตัว `Hook<unknown, Env, …>` แล้ว tsc ไม่ยอม `TS2322 … Type 'Context<OptionalAuthEnv, any, {}>' is not assignable to type 'Context<Env, string, {}>' … Types of property 'env' are incompatible.`
   - get-result และ claim-result ใช้ `defaultHook: resultRequestHook` ตัวเดียวกัน
3. list-results (`INVALID_PAGE_BODY` :19) และ submit-test (`invalidAnswers` :18) ใช้ hook เดิม แค่สร้าง body ผ่าน `errorBody`
4. `UNAUTHORIZED_BODY` (`identity/middleware/require-auth.ts:11`) ชื่อและค่าเดิม สร้างผ่าน `errorBody` (identity → `src/errors.ts` ได้ เพราะ errors.ts อยู่นอก context ทุกตัว)
5. 415 ไม่แตะ และไม่มี test

### ขั้น 2.0 (ก่อนแตะ production)
- sha256 ของ `server/src/error-responses.test.ts` = `aaaf0eec904a2ccc14dfde7cfca9bf45dcee2f084e9546c9469bb0ee80c321e2` ตอนจบยังเท่าเดิม (`sha256sum -c` OK)
- OpenAPI สร้างซ้ำจากโค้ดเดิม = `5277437e…` เท่า baseline
- mutation ฝั่ง claim (ใช้ `/* MUTATION */`, ย้อนกลับแล้ว sha256 OK):
  - (a) ข้อความ INVALID_RESULT_ID → แดง 2
  - (b) ข้อความ AUTH_REQUIRED → แดง 2
  - (c) header ให้ไปเป็น INVALID_RESULT_ID → แดง 2
  - (d) "Result not found" → แดง 3

### ผล AC
| AC | ผล | หลักฐาน |
|---|---|---|
| AC1 | ✅ | ตาข่าย 38 ข้อ (`error-responses.test.ts`, ไม่ได้แก้ sha256 เท่าเดิม) เขียวหลังแก้ทุกไฟล์ และหลังแก้ทั้งหมด |
| AC2 | ✅ | `server/src/errors.test.ts` (3 tests): `toEqual` + keys `["error"]`/`["code","message"]` + `expectTypeOf(...).toEqualTypeOf<"INVALID_PAGE">()` (ลองเปลี่ยนเป็น `<string>` ชั่วคราวแล้ว tsc แดง `TS2344` ยืนยันว่า tsc ตรวจจริง) |
| AC3 | ✅ | grep `error:[[:space:]]*\{` ทั้ง `server/src` (ไม่รวม test): เจอแค่ `src/errors.ts` (ตัว `errorBody` และ body 500 ของ `globalErrorHandler` :53-54) ไม่มี `badRequest`, `AUTH_REQUIRED_MESSAGE` หรือ `code: "…" as const` เหลือ |
| AC4 | ✅ | get-result :61 และ claim :63 ใช้ `resultRequestHook` ตัวเดียวกัน และ AC1 เขียว |
| AC5 | ✅ | OpenAPI หลัง refactor sha256 `5277437e9f910da58bea2d4e4d176aa56ff097444e3a96e9a414b3542b3eee7c` เท่า baseline (`cmp` byte-identical) |
| AC6 | ✅ | 5 เคส marker ไม่ echo (เขียวตั้งแต่โค้ดเดิม) |
| AC7 | ⚠️ บางส่วน | **handler**: คืน `errorBody("WRONG_CODE")` ใน get-result หรือ `errorBody("NOPE")` ใน list-results แล้ว tsc แดง (`TS2345`) · **defaultHook**: ให้ `INVALID_PAGE_BODY` ใช้ code `"INVALID_PAGES"` แล้ว **tsc ไม่แดง (exit 0)** เพราะ zod-openapi ประกาศ `defaultHook?: Hook<any, E, any, any>` ค่าที่ hook คืนจึงไม่ถูกตรวจกับ schema ของ route (เป็นแบบนี้มาตั้งแต่ก่อน refactor) ตาข่าย runtime จับได้แทน (แดง 3) |
| AC8 | ✅ | test 351/351 (15 files), tsc exit 0, lint:deps no violations **77 modules / 222 deps** (เดิม 75/214: +2 ไฟล์ใหม่), circular 0 |

### Mutation หลัง refactor (2.6, ย้อนกลับแล้ว sha256 OK, `git grep MUTATION` สะอาด)
| ข้อ | แก้ที่ | แดง |
|---|---|---|
| 1 | `errorBody` เพิ่ม field `detail` | 39 (ตาข่าย 36 + unit 3) |
| 2a | ข้อความ AUTH_REQUIRED ในไฟล์ร่วม | 5 |
| 2b | hook ร่วม: header ให้ไปเป็น INVALID_RESULT_ID | 3 |
| 3 | ข้อความ body 404 ร่วม | 6 |

### ขอบเขตที่แก้
- production 7 ไฟล์: แก้ 6 (`errors.ts`, controller 4 ตัว, `require-auth.ts`) + ใหม่ 1 (`result-errors.ts`)
- test: ใหม่ 2 (`errors.test.ts`, `error-responses.test.ts`) **ไม่ได้แก้ test เดิมเลย** (ไม่มีอยู่ใน `git diff --stat`)
- line ending: ทุกไฟล์เป็น LF ทั้งก่อนและหลัง
- `git diff --stat` ของ production: +26 / −67 บรรทัด

### Known gap: 415 ของ POST /test/submit
- ถ้าส่งโดยไม่มี content-type, `text/plain` หรือ form จะได้ 415 `Unsupported Media Type` เป็นข้อความธรรมดา ไม่ใช่ `{error:{code,message}}` และไม่ได้ประกาศใน OpenAPI (submit ประกาศแค่ 201/400/500)
- ต้นตอยังไม่ทราบ (zod-openapi หรือ hono)
- เบาะแสแรกที่ควรตรวจ (ยังไม่ verify): globalErrorHandler ใน errors.ts คืน err.getResponse() ของ HTTPException ตรงๆ (เป็นข้อความธรรมดา) และ onError ของ submit-test แปลงเฉพาะ HTTPException ที่เป็น 400 ถ้า 415 ถูกโยนเป็น HTTPException จะหลุดผ่านทางนี้ ให้ยืนยันก่อนเลือกจุดแก้
- **กลับมาทำตอน code/security review รวม ก่อนเริ่ม Frontend**

### ข้อสังเกต
1. **กับดัก list-results**: hook จับแค่ `target === "query"` ถ้าวันหน้าเพิ่ม param หรือ header ให้ route นี้ ต้องเพิ่ม hook ไม่งั้นจะได้ 400 ดิบของ zod-validator
2. **INVALID_ANSWERS ส่ง path ของ Zod กลับไปโดยตั้งใจ** (เช่น `answers.0.questionId: …`) เพราะ schema อยู่ใน OpenAPI สาธารณะอยู่แล้ว และ AC6 ยืนยันว่าไม่ echo ค่าที่ผู้ใช้ส่งมา
3. **ช่องโหว่ของ type-safety ใน defaultHook** (AC7): code ผิดใน hook ไม่ถูก tsc จับ มีแค่ตาข่าย runtime
4. body 500 ใน `globalErrorHandler` (`errors.ts:52-57`) ยังเป็น literal ไม่ได้ผ่าน `errorBody` (นอกการตัดสินใจ 5 ข้อ และ AC3 ยกเว้น errors.ts) เปลี่ยนได้ทีหลังถ้าต้องการ
5. ข้อความ `INVALID_PAGE` ยังสร้างใน list-results จาก `MAX_PAGE` (ไม่ได้ย้าย เพราะ ticket ให้คงไว้ที่เดิม)

### ขั้นต่อไป
1. ผู้ใช้รีวิวแล้ว commit เอง (รวม `.claude/CLAUDE.md` หัวข้อ lint:deps ที่ค้างจาก Phase 0)
