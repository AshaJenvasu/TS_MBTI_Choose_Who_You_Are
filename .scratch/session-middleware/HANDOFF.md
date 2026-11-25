# HANDOFF — session-middleware (Epic 2 / Feature A)

## Session 2026-11-25 — Ticket A2: Session Middleware

### สถานะ
- Ticket A2: โค้ด + tests เสร็จ ยังไม่ commit (ต่อจาก commit `1a06c75` ของ Ticket 04)
- Tests: 121 passed + 1 todo (8 files), เพิ่ม 15 tests ใน `server/src/identity/controllers/me.controllers.test.ts`. `tsc --noEmit` ผ่าน

### ทำอะไรไปแล้ว
- `server/src/identity/middleware/require-auth.ts`
  - `createRequireAuth(auth)` เรียก `auth.api.getSession({ headers })`
  - ไม่มี session หรือ invalid → `401` ด้วย `UNAUTHORIZED_BODY` ตัวเดียว
  - valid → `c.set("user", user)`
  - export `AuthEnv`, `AuthUser`
- `server/src/errors.ts` — เพิ่ม `UnauthorizedResponse` (Zod, `{ error: { code: "UNAUTHORIZED", message } }`) ไว้ข้าง `InternalServerErrorResponse`
- `server/src/identity/schema/me.schema.ts` — `MeResponse` (`id`, `email`, `name`, `image: string | null`) + `toMe(user)` map เป็น DTO ทีละ field
- `server/src/identity/controllers/me.controllers.ts` — `GET /api/me` ผ่าน `createRoute({ middleware: [requireAuth], security: [{ sessionCookie: [] }] })`, register security scheme `sessionCookie` (cookie `better-auth.session_token`)
- `server/src/app.ts` — mount `createMeRoutes(auth)` เมื่อ `createApp(db, auth)` ได้รับ auth (เหมือน `/api/auth/*`)
- Refactor test helper ที่ตกลงไว้: ย้าย fake-Google sign-in (`CookieJar`, `createTestClient` → `request`/`startSignIn`/`signIn`, `stubGoogleTokenEndpoint`, `TEST_AUTH_CONFIG`, `ALICE`) จาก `auth.test.ts` ไป `server/src/identity/testing/fake-google.ts`. `auth.test.ts` เปลี่ยนแค่ import/setup, logic test เดิม 13 ตัวผ่านครบ

### Tests (me.controllers.test.ts)
- AC1: login ผ่าน flow fake-Google → 200, key = `email, id, image, name` เป๊ะ และค่าตรงกับแถวใน `"user"`
- AC2: ไม่มี cookie → 401 `{ error: { code: "UNAUTHORIZED", message: "Authentication required" } }`
- AC3: 4 เคส ต้องได้ `status`, `content-type`, `set-cookie` และ body **เหมือนเคสไม่มี cookie ทุกตัว**
  - token มั่ว
  - cookie ที่ token ถูกแก้แต่ signature เดิม (tamper)
  - session ที่ sign-out แล้ว (revoke)
  - `expires_at = '2000-01-01'` (หมดอายุ)
- AC4: dummy route `/test-only/protected` ใน test ใส่ `createRequireAuth(auth)` ตัวเดียวกัน
  - valid session: handler รันและเห็น user คนเดียวกับ `/api/me`
  - ไม่มี session หรือ invalid ทั้ง 4 แบบ: response เหมือน `/api/me` และ handler ไม่ถูกเรียกเลย (`handlerRuns = 0`, deny-by-default)
- Session check พัง (`vi.spyOn(auth.api, "getSession").mockRejectedValue(...)` จำลอง DB ล่ม) → `/api/me` ได้ **500** `INTERNAL_SERVER_ERROR` ไม่ใช่ 401, body ไม่มีข้อความ error จริง (`ECONNREFUSED`) หลุดออกไป, error ถูก log
  - Code เดิม GREEN ทันที (ไม่มี RED จริง) → พิสูจน์ว่า test fail ได้ด้วย mutation: ใส่ `.catch(() => null)` ให้ getSession (กลืน error เป็น 401) → `expected 401 to be 500` → restore แล้ว
- OpenAPI: `/api/me` มี 200/401/500, `security: [{ sessionCookie: [] }]`, `MeResponse` มีแค่ 4 field
- Mutation check (แก้ชั่วคราวแล้ว restore แล้ว):
  - ให้ middleware ตอบ message ต่างกันเมื่อมี cookie → AC3 fail 4 ตัว
  - ให้ `toMe` spread raw user → AC1 fail

### วิธี apply `requireAuth` กับ route ใหม่ (สำหรับ Epic1-Ticket4 GET /results list, Epic2-B1 claim)
1. Controller factory ต้องรับ `auth` (DI แบบเดียวกับ `db`) แล้วสร้าง middleware ครั้งเดียว:
   ```ts
   import type { Auth } from "../../identity/auth";
   import { type AuthEnv, createRequireAuth } from "../../identity/middleware/require-auth";
   import { UnauthorizedResponse } from "../../errors";

   export function createXxxRoutes(db: Db, auth: Auth) {
     const requireAuth = createRequireAuth(auth);
     const route = createRoute({
       method: "get",
       path: "/results",
       security: [{ sessionCookie: [] }],
       middleware: [requireAuth] as const, // ด่านแรก ก่อน handler/validation logic ใดๆ
       responses: {
         200: { ... },
         401: { description: "...", content: { "application/json": { schema: UnauthorizedResponse } } },
         500: { ... },
       },
     });
     const routes = new OpenAPIHono<AuthEnv>({ defaultHook: ... });
     routes.onError(globalErrorHandler);
     return routes.openapi(route, (c) => {
       const userId = c.get("user").id; // ใช้ id จาก session เสมอ ห้ามรับ userId จาก client (BOLA)
       ...
     });
   }
   ```
2. `app.ts`: route ที่ต้อง auth ต้อง mount ใน block `if (auth) { ... }` แล้วส่ง `auth` เข้าไป
3. ลำดับใน Hono: ใน `createRoute` นั้น `middleware` จะรัน**ก่อน** zod validation ของ request (params/body/headers) และก่อน handler. คนที่ไม่ login จึงได้ 401 ก่อนจะได้ 400 เสมอ ถ้า ticket ต้องการลำดับอื่นต้องตัดสินใจใหม่
4. Route ธรรมดาที่ไม่ใช่ OpenAPI ใช้ได้เหมือนกัน: `new Hono<AuthEnv>().get(path, requireAuth, handler)` (ดู AC4 test)
5. Security scheme `sessionCookie` register ไว้ใน `me.controllers.ts` แล้ว route อื่นอ้างชื่อเดิมได้เลย ไม่ต้อง register ซ้ำ
6. Test: ใช้ `server/src/identity/testing/fake-google.ts` (`stubGoogleTokenEndpoint(() => ALICE)` ใน `beforeEach`, `createTestClient(app).signIn()` ได้ jar ที่มี session cookie, ส่ง `{ headers: { Cookie: jar.header() } }`). Cleanup ตามลำดับ FK: `test_result` → `session`/`account`/`verification` → `"user"`

### ข้อสังเกต
- Better Auth `cookieCache` ปิดอยู่ (default) → `getSession` เช็ค DB ทุก request, revoke มีผลทันที. ถ้าวันหลังเปิด cookieCache, session ที่ revoke แล้วจะยังผ่านได้จนกว่า cache หมด → ต้องทบทวน AC3
- DB error ระหว่าง `getSession` ไม่ถูกกลืนเป็น 401 แต่ไปที่ `globalErrorHandler` → 500
- `image` เป็น `null` ได้ (Google บางบัญชีไม่มีรูป)
- `/api/me` มีอยู่ใน `/doc` (OpenAPI) แต่ `/api/auth/*` ยังไม่มีเหมือนเดิม (ของ Better Auth)

### ขั้นต่อไป
1. Review + commit Ticket A2
2. Epic1-Ticket4 (GET /results list) และ Epic2-B1 (claim) apply `requireAuth` ตามหัวข้อด้านบน
