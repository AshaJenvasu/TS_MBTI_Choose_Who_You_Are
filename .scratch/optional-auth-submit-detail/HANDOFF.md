# HANDOFF — optional-auth-submit-detail (Epic 2 / Ticket A3)

## Session 2026-11-26 — Epic 2 Ticket A3: Submit + Detail รองรับ user ที่ login อยู่

### สถานะ
- โค้ดและ tests เสร็จแล้ว ยังไม่ได้ commit
- Tests: 184 passed (10 files) ไม่เหลือ `it.todo`/`describe.skip` ของ AC2 แล้ว
- `tsc --noEmit` ผ่าน
- `bun run lint:deps` ผ่าน: exit 0, "no dependency violations found (57 modules, 146 dependencies cruised)"
  - มี warning `missing-tsc-transpiler`: "typescript@7.0 is not supported as its API lacks what dependency-cruiser needs" (warning นี้บอกว่าอาจพลาด dependency บางตัวที่เป็น TS)
  - ไม่เกี่ยวกับ ticket นี้: `git diff HEAD` ของ package.json และ lockfile ว่าง และ `"typescript": "^7.0.2"` อยู่ตั้งแต่ commit แรก 7066dd7 (2026-11-24)
  - ถ้าจะแก้ warning ให้ pin typescript `^6` หรือขึ้นไป `^7.1` — ทำเป็น ticket แยก

### Decisions (confirm กับ user แล้ว)
- ถ้าส่งทั้ง X-Guest-Token และ session มาพร้อมกัน **guest token มี priority** และ**ไม่ fallback** ไป session ถ้า token ไม่ตรง (ผลคือ 404)
- ไม่มีทั้ง session และ token: **คง 400 AUTH_REQUIRED เดิม** (ticket เขียนว่า 404 แต่เลือกรักษา contract AC5 เดิมไว้)
- submit ตอน login: response มี `guestToken: null` (shape เดิม nullable ไม่แก้ schema)

### ทำอะไรไปแล้ว (TDD: RED 9 fail ด้วยเหตุผลที่ถูก → GREEN)
- **ใหม่** `server/src/identity/middleware/optional-auth.ts`
  - `createOptionalAuth(auth?)` เรียก `auth.api.getSession` แล้ว `c.set("user", user | null)` ไม่ 401 ถ้าไม่มี session ถ้าไม่มี `auth` = guest เสมอ, DB error ไม่ถูก swallow (กลายเป็น 500)
  - `OptionalAuthEnv`, `OPTIONAL_SESSION_SECURITY` (`[{}, { sessionCookie: [] }]`)
  - ⚠️ ต้องประกาศ security เป็น const แบบ typed แยกไว้: ถ้าเขียน `[{}, ...]` inline ใน `createRoute` จะทำให้ type inference ของ @hono/zod-openapi พัง (`c.req.valid(...)` กลายเป็น `never`)
- `server/src/app.ts` — ส่ง `auth` เข้า `createSubmitTestRoutes` / `createGetResultRoutes`
- Submit: controller ใช้ `middleware: [optionalAuth]` แล้วสร้าง owner = `{ userId: user.id }` หรือ `{ guestToken: randomUUID() }`; service `submitTest(db, answers, owner: ResultOwner)`
- Detail:
  - schema: `x-guest-token` เป็น `.optional()` (ส่ง `""` มายังได้ 400 AUTH_REQUIRED เหมือนเดิม)
  - controller เลือก viewer ตามลำดับ: token → session user → 400 AUTH_REQUIRED (ตอบก่อน query DB)
  - service `getResult(db, id, viewer: ResultViewer)` + `isOwner()` เช็คแยก 2 ทาง (guest_token / user_id ต้องไม่ null และต้องตรง)
  - repository select `userId` เพิ่ม (ใช้เช็ค ownership เท่านั้น ไม่ส่งออกใน response)
- OpenAPI: ทั้ง 2 routes มี `security: [{}, { sessionCookie: [] }]`, `x-guest-token.required = false`, แก้ descriptions แล้ว

### Tests ที่เพิ่ม
- Submit (`submit-test.controllers.test.ts`): AC2 login → `guestToken null` + row `user_id = session user`, `guest_token null`; ถ้า client ส่ง userId ปลอมมา (body/header) ระบบ ignore; guest ส่ง userId มา → ยังเป็น guest row; ใช้ cookie ปลอม → ทำงานแบบ guest ไม่ 401
- Detail (`get-result.controllers.test.ts`): เจ้าของที่ login อยู่ → 200 body ครบ; BOLA (Bob ขอผลของ Alice) → 404 เหมือนผลที่ไม่มีอยู่จริงทุก byte; session ขอผล guest → 404; ไม่มีผล → 404; userId ปลอมใน query/header ถูก ignore; E2E submit ตอน login → detail ด้วย cookie; priority ของ token (200) / ไม่ fallback (404); cookie ปลอม + ไม่มี header → 400 เหมือนไม่มี credential
- test files ทั้งสองไฟล์เปลี่ยนเป็น `createApp(db, auth)` + `clearAll` (ลบ session/account/verification/user)

### Behavior change เล็กน้อย (ไม่รั่วข้อมูล)
- resultId ผิดรูป + ไม่ส่ง header: เดิมได้ AUTH_REQUIRED ตอนนี้ได้ INVALID_RESULT_ID
- เพิ่ม test ล็อกพฤติกรรมนี้แล้วใน `get-result.controllers.test.ts` (describe AC2): ไม่ส่งทั้ง header และ session → 400 `INVALID_RESULT_ID`

### ขั้นต่อไป
1. Review + commit ticket นี้
2. (ถ้าต้องการ) แก้ warning `missing-tsc-transpiler` ของ dependency-cruiser — ticket แยก
3. Epic 2 Feature B, Ticket B1 — claim guest result
