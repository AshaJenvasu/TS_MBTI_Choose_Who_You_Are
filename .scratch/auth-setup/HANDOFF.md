# HANDOFF — auth-setup (Epic 2 / Feature A)

## Session 2026-11-25 — Ticket 04 (A1): Better Auth + Google OAuth

### สถานะ
- Ticket 04: โค้ด + automated tests เสร็จ (ยังไม่ commit). เหลือ **manual test กับ Google จริง** (ต้องมี Google OAuth client)
- Tests: 106 passed + 1 todo (7 files) — เพิ่ม 13 tests ใน `server/src/identity/auth.test.ts`. `tsc --noEmit` ผ่าน

### ทำอะไรไปแล้ว
- ติดตั้ง `better-auth@1.7.28`
- `server/src/identity/repositories/schema.ts` — generate จาก `@better-auth/cli generate` (Drizzle adapter): `user`, `session`, `account`, `verification`
- `server/src/identity/auth.ts` — `createAuth(db, config)` (Google only, DB sessions, cookie httpOnly/Lax default, Secure เมื่อ baseURL เป็น https) + `authConfigFromEnv()` (throw ถ้า env ขาด)
- `server/src/app.ts` — `createApp(db, auth?)` mount `/api/auth/*` เมื่อส่ง auth มา (test เก่าที่ไม่ส่ง auth ยังใช้ได้)
- `server/src/dev.ts` — สร้าง auth จาก env + mount หน้า dev-only `GET /dev/auth-test` (`server/src/identity/dev/auth-test-page.ts`) ไม่อยู่ใน `createApp` → ไม่ขึ้น production
- Migration `server/drizzle/0003_handy_vapor.sql`: 4 ตาราง Better Auth + `test_result_user_id_user_id_fk` → `"user"(id) ON DELETE RESTRICT`
- `drizzle.config.ts` — `schema` เป็น array (assessment + identity)
- `.env.example` — เพิ่ม `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `.claude/CLAUDE.md` — note: `/api/auth/*` ไม่อยู่ใน OpenAPI ดู Better Auth docs
- `get-result.controllers.test.ts` — test "owned by a user id" ต้อง insert `"user"` row `user-123` ก่อน (เพราะ FK ใหม่)
- Migration `server/drizzle/0004_tired_kid_colt.sql`: `CREATE UNIQUE INDEX account_provider_account_unique ON account (provider_id, account_id)` — เพิ่มเองใน `identity/repositories/schema.ts` (Better Auth CLI ไม่ generate ให้) → **ถ้า regenerate schema ต้องใส่กลับ** (มี comment บอกไว้หัวไฟล์)

### AC5 — ผลตรวจ schema จริง
- `"user".id` = `text` PK (Better Auth generate id เป็น string) ↔ `test_result.user_id` = `text` nullable → ตรงกัน
- FK ยืนยันใน DB จริง: `test_result_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE RESTRICT`
- CHECK `test_result_user_or_guest` ยังอยู่ → ADR-003 claim (`SET user_id = :id, guest_token = NULL`) ใช้ได้ตรงๆ
- เลือก RESTRICT (ไม่ใช่ SET NULL) เพราะ row ที่ claim แล้วมี `guest_token = NULL` → SET NULL จะชน CHECK
- `session`/`account` → `user` เป็น `ON DELETE CASCADE` (default ของ Better Auth)

### วิธีเทส OAuth แบบ automated
- stub `fetch` เฉพาะ `https://oauth2.googleapis.com/token` คืน `id_token` ปลอม (unsigned JWT). Google provider ของ Better Auth อ่าน profile ด้วย `decodeJwt` (ไม่ verify signature ใน code flow) → flow sign-in → callback → session เป็นของจริงทั้งหมด
- Cleanup order: `test_result` → `session`/`account`/`verification` → `"user"`

### กัน duplicate account จาก race (unique index)
- Better Auth เช็ค account ซ้ำแค่ใน app code (find แล้วค่อย insert) → 2 request พร้อมกันอาจ insert ซ้ำได้ → เพิ่ม `account_provider_account_unique (provider_id, account_id)` ให้ DB ปฏิเสธเอง
- Test 1 (DB-level): insert `account` ตรงๆ 2 แถวที่ `('google', 'google-sub-dup')` ซ้ำ (ทั้ง user เดิมและคนละ user) → โดน `23505` constraint `account_provider_account_unique` จริง
- Test 2 (concurrent จริง): `Promise.all([signIn(), signIn()])` ด้วย Google account เดียวกัน → `"user"` = 1, `account` = 1, อย่างน้อย 1 request ได้ session
  - รันซ้ำ 5 รอบ: race เกิดจริงทุกรอบ — ตัวชนะได้ `302 /dev/auth-test`, ตัวแพ้ได้ `302 /dev/auth-test?error=unable_to_create_user`
  - จาก Postgres log: ตัวแพ้โดน **`user_email_unique`** ก่อน (Better Auth insert user ก่อน account) ไม่ใช่ index ใหม่ → test นี้เป็น regression guard ของ flow ทั้งหมด ส่วน index ใหม่พิสูจน์ด้วย Test 1
  - index ใหม่จะเป็นด่านจริงในเคสที่ user มีอยู่แล้วแต่ยังไม่มี account นั้น (เช่น link account / provider อื่นในอนาคตที่ email ซ้ำได้)

### พิสูจน์ `account_provider_account_unique` ผ่าน flow จริง (concurrency test เฉพาะ index)
- **เคสที่ขอ (user + account มีอยู่แล้ว → sign in ซ้ำพร้อมกัน 2 ครั้ง): index ไม่เกี่ยว** — Better Auth `handleOAuthUserInfo` (`better-auth/dist/oauth2/link-account.mjs`) เรียก `findAccountOwnerByKey(provider_id, account_id)` เจอ account → แค่สร้าง session ไม่ insert account เลย จึงไม่มี race บน account
  - Test: `account` = 1, `session` = 3, ทั้ง 2 request ได้ `302 /dev/auth-test`, **ไม่มี** Postgres unique error ถูก log เลย
- **เคสที่ index ทำงานจริง: implicit account linking** — มี `"user"` อยู่แล้ว (`email_verified = true`, email เดียวกับ Google) แต่ยังไม่มี Google account → 2 request หา account ไม่เจอทั้งคู่ → ทั้งคู่เรียก `linkAccount` insert
  - Test: `account` ของ `('google', sub)` = 1 แถว ผูกกับ user เดิม, `"user"` = 1, ตัวชนะ `302 /dev/auth-test`, ตัวแพ้ `302 /dev/auth-test?error=unable_to_link_account`
  - Error ของตัวแพ้ (ดักจาก `console.error("Unable to link account", e)` ของ Better Auth แล้วไล่ `.cause` ของ Drizzle error) = **`23505` / `account_provider_account_unique`** อย่างเดียว ไม่มี constraint อื่น
  - รันซ้ำ 5 รอบ ผ่าน 5/5 — test assert ว่าต้องมีตัวแพ้ 1 ตัวพร้อม error นี้ ดังนั้นผ่าน = race เกิดจริงทุกรอบ (Postgres log ยืนยันว่ามี `account_provider_account_unique` violation ในช่วงที่รัน)
  - Mutation check: `DROP INDEX account_provider_account_unique` แล้วรัน test นี้ → **fail** (account กลายเป็น 2 แถว) → index คือตัวที่กันจริง ไม่ใช่ app logic. สร้าง index กลับแล้ว
- สรุป constraint ที่ทำงานในแต่ละ race: user ใหม่พร้อมกัน → `user_email_unique`; link account ให้ user เดิมพร้อมกัน → `account_provider_account_unique`; sign in ซ้ำของคนที่มี account แล้ว → ไม่มี (app หา account เจอ ไม่ insert)

### ตัดสินใจ: ไม่เพิ่ม id_token signature verification ใน code flow (ตรวจแล้ว ไม่ได้มองข้าม)
- ตรวจ `better-auth@1.7.28` (= npm `latest`, 2026-11-24) จากโค้ดใน `node_modules` + GitHub release notes v1.5.5–v1.7.28
- **Flow ส่ง id_token มาเอง** (`signIn.social({ idToken })`, One Tap): verify ครบ เปิดเป็น default แบบ fail-closed (`verifyProviderIdToken` → signature กับ Google JWKS, issuer, audience = clientId, RS256, อายุ ≤ 1h, nonce). ลองยิง id_token ปลอม → `401 INVALID_TOKEN`, ไม่มี user ถูกสร้าง
- **Redirect/code flow ที่เราใช้**: Google provider `getUserInfo` ใช้ `decodeJwt` อย่างเดียว ไม่ verify signature — ไม่ใช่ config ที่ปิดไว้ ไม่มี flag ให้เปิด
- เหตุผลที่ยอมรับได้: **OpenID Connect Core 1.0 §3.1.3.7 (ID Token Validation) ข้อ 6** — ถ้าได้ ID Token จาก Token Endpoint โดยตรงผ่าน TLS (server-to-server) client ใช้ TLS server validation ยืนยันผู้ออก token แทนการตรวจ signature ได้. ของเรา: แลก code กับ `https://oauth2.googleapis.com/token` ตรงผ่าน TLS + `client_secret` + PKCE, และ Better Auth ปฏิเสธ redirect ของ token endpoint (กัน SSRF) → ผู้โจมตีปลอม id_token ใน flow นี้ไม่ได้ถ้าไม่ได้ควบคุม TLS ไปหา Google
- จึงไม่เพิ่ม defense-in-depth (override `getUserInfo` ให้เรียก `verifyGoogleIdToken`) เพราะได้ความปลอดภัยเพิ่มน้อย แต่ต้องดึง JWKS ทุก sign-in และ test ต้อง sign JWT ด้วย RSA จริง + stub certs endpoint
- ถ้าในอนาคตมีเหตุให้ไม่ไว้ใจช่องทาง TLS (เช่น proxy/egress ที่ terminate TLS) ให้กลับมาพิจารณาใหม่

### ข้อสังเกต / ความเสี่ยง
- `bun run dev` ตอนนี้ **ต้องมี** auth env ครบ ไม่งั้น throw `Missing auth env vars: ...`
- ตาราง Better Auth ใช้ timestamp ไม่มี timezone (ต่างจาก `test_result.created_at` ที่เป็น timestamptz) — ปล่อยตาม CLI generate

### ขั้นต่อไป
1. Manual test (ต้องทำเอง): สร้าง OAuth client ใน Google Cloud, redirect URI `http://localhost:8787/api/auth/callback/google` → ใส่ค่าใน `server/.env` → `bun run dev` → เปิด `http://localhost:8787/dev/auth-test` → ทดสอบ AC1–AC4 (AC2: เช็ค `select count(*) from "user"` = 1)
2. Commit Ticket 04
3. Ticket A2: session-protected middleware
