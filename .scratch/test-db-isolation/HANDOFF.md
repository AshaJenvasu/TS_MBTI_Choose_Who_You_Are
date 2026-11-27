# HANDOFF — test-db-isolation (Hardening H3)

## Session 2026-11-27 — H3: Phase 0 + Phase 1 (RED)

### สถานะ
- Ticket: `.scratch/test-db-isolation/issues/H3-test-db-guard.md` (มีบรรทัด `=== END TICKET H3 ===` ครบ)
- Phase 0 (ตรวจ read-only) และ Phase 1 (RED) เสร็จ **รอผู้ใช้รีวิวก่อน GREEN**
- ยังไม่ commit และยังไม่แก้ vitest config, globalSetup, clearAll หรือ test เดิม

### การตัดสินใจจากผู้ใช้ (ถามระหว่าง Phase 0)
1. **"ฐานเดียวกัน"**: เทียบชื่อฐาน (path ของ URL) ไม่สน host โดยเทียบกับ DATABASE_URL **ดั้งเดิม** (จาก .env/shell ก่อนถูก test.env override) unit test ส่งค่าเข้าไปตรงๆ ไม่อ่าน process.env
2. **Seed**: สร้างไฟล์ใหม่ที่ export `seedReferenceData(db)` ซึ่งไม่มี side effect ส่วน `seed.ts` เหลือเป็น CLI บางๆ ที่สร้าง pool เอง เรียกฟังก์ชัน แล้วปิด pool อนุญาตให้แก้ seed.ts เพื่อการนี้เท่านั้น
   - ต้องพิสูจน์ว่า `bun run db:seed` พฤติกรรมไม่เปลี่ยน: ลำดับ insert, onConflictDoNothing, transaction (เดิมไม่มี ห้ามเพิ่ม), exit code และ output
   - ต้องรันกับ dev ก่อนและหลังแก้ แล้วตารางอ้างอิงต้องเป็น 16/16/96
3. **RED แบบ stub**: test ที่ "ต้อง throw" assert ข้อความเจาะจง (ชื่อฐาน + `_test` หรือ `DATABASE_URL`) และข้อความของ stub (`not implemented`) ต้องไม่ตรง pattern

### Phase 0 (สรุป)
1. `server/vitest.config.ts:4-9`: มีแค่ `include` และ `fileParallelism: false` (`:8`) ไม่มี globalSetup, setupFiles หรือ test.env
2. ไฟล์ test ที่อ่าน `DATABASE_URL ?? <dev default>` มี 7 ไฟล์:
   - `claim-result.controllers.test.ts:17`, `get-result.controllers.test.ts:18`, `list-results.controllers.test.ts:17`, `submit-test.controllers.test.ts:18`
   - `reference-data.test.ts:7`, `identity/auth.test.ts:20`, `identity/controllers/me.controllers.test.ts:18`
   - helper ซ้ำ: `clearAll` 4 ที่ (claim:48, get:96, list:48, submit:66) และ `clearIdentity` 2 ที่ (auth:47, me:46) รวม **6 ที่ ลบ 5 ตารางเดียวกัน**
   - `signInAs` 4 ที่ (claim:57, get:29, list:57, submit:29)
   - insert helper: claim `insertGuestResult`:68, get `insertResult`:43, list `insertResult`:68, `characterOf`:86, `insertMany`:99
3. `src/db/client.ts:8`: `createDb(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL)` อ่าน env ตอน**เรียก** ไม่ใช่ตอน import
   - Better Auth ไม่สร้าง connection เอง ใช้ `drizzleAdapter(db)` ที่รับเข้ามา (`identity/auth.ts:41`)
   - ที่สร้าง pool เอง: test แต่ละไฟล์ (`new pg.Pool` + `createDb`), `seed.ts:6`, `dev.ts:8` (createDb)
   - `drizzle.config.ts:11` อ่าน DATABASE_URL (ของ drizzle-kit)
4. ใช้ driver `pg` 8.23.1 (node-postgres) ส่วน migrate แบบเขียนโค้ดใช้ `drizzle-orm/node-postgres/migrator` (มีอยู่ใน node_modules) ซึ่งใช้ตาราง `drizzle.__drizzle_migrations` เดียวกับ `drizzle-kit migrate`
5. `db:seed` = `bun run src/assessment/repositories/seed.ts`:
   - ทำงานตอน import (top-level await), สร้าง pool เองจาก DATABASE_URL, insert mbti_type_info → character → compatibility ด้วย `onConflictDoNothing` จึง idempotent (`:13-15`) ไม่มี transaction
   - clearAll ลบแค่ test_result, session, account, verification, "user" ไม่มี test ไหนลบตารางอ้างอิง
   - `reference-data.test.ts` insert แล้ว rollback (`:176-183`)
6. role `mbti`: `rolsuper=t`, `rolcreatedb=t` (docker-compose `POSTGRES_USER`) จึงสร้างฐานได้ ตอนนี้มีฐาน `postgres` และ `mbti` (ยังไม่มี `mbti_test`)
7. `fileParallelism: false` ทำให้ไฟล์ test รันทีละไฟล์ และ test ในไฟล์ก็รันตามลำดับ (ค่า default) ที่ผ่านได้ทุกวันนี้เพราะมีคนเดียวที่ใช้ฐานในแต่ละช่วงเวลา และทุก test ล้างข้อมูลก่อนเริ่ม
8. **ข้อค้นพบสำคัญ**:
   - shell ไม่ได้ตั้ง `DATABASE_URL` แต่ Bun โหลด `server/.env` ให้เอง และ process ลูกที่เป็น Node ก็เห็น DATABASE_URL ชี้ฐาน `mbti` (ทดสอบด้วยการพิมพ์แค่ชื่อฐาน) แปลว่าทุกครั้งที่รัน `bun run test` ตอนนี้ test ชี้ dev จาก .env อยู่แล้ว
   - `server/.env` ถูก ignore (`server/.gitignore:2`) และไม่ได้ track (track แค่ `.env.example`)
   - **ตรวจไม่ได้**: globalSetup ของ vitest 5.1.1 เห็นค่าจาก `test.env` หรือไม่ ต้องลองตอน GREEN แต่การตัดสินใจข้อ 1 ทำให้ guard ไม่ขึ้นกับเรื่องนี้ เพราะจับค่าดั้งเดิมไว้ก่อน override

### Phase 1 RED
- ไฟล์ใหม่:
  - `server/src/db/testing/test-database.ts` (stub): `resolveTestDatabaseUrl`, `assertTestDatabase`, `clearTestData`
  - `server/src/db/testing/test-database.test.ts`: 14 tests, db จำลอง ไม่ต่อฐานจริง
- ที่วาง: `src/db/testing/` เพราะ `src/db/**` เป็น shared code ที่ dependency-cruiser ยกเว้นไว้ (`.dependency-cruiser.cjs:4-5`) และ test ของทั้ง assessment และ identity ใช้ได้ ตั้งชื่อโฟลเดอร์ `testing/` ตามแบบ `identity/testing/`
- ผล: **14 แดง / 279 ผ่าน (293)**, tsc ผ่าน, lint:deps no violations (69 modules, 181 deps)

### Phase 2 (GREEN / REFACTOR / mutation / e2e / docs): ผู้ใช้อนุมัติ RED แล้ว
**ขั้น 0: test เพิ่ม 17 ข้อ** (แดงทั้งหมดด้วย `not implemented` หรือ regex ไม่ตรง):
- selector:
  - `?sslmode=require` บน mbti_test ต้องผ่าน
  - `/mbti?note=_test` ต้อง throw
  - ไม่มี path หรือ path ว่าง (2) ต้อง throw
  - `MBTI_TEST` ต้อง throw
- guard: `"MBTI_TEST"` ต้อง throw
- `createTestDatabaseIfMissing`:
  - ชื่อผิด 6 แบบ (`mbti`, `mbti-test`, `Mbti_test`, `mbti test_test`, ชื่อที่มี `"; drop database`, ว่าง) ต้องถูกปฏิเสธโดยไม่มี SQL เลย
  - ยังไม่มีฐาน: SELECT pg_database (`$1`) แล้ว `CREATE DATABASE "mbti_test"`
  - มีอยู่แล้ว: ไม่ CREATE
  - race 42P04 หรือ 23505 ถือว่ามีอยู่แล้ว
  - error อื่น (42501) ต้องไม่ถูกกลืน

**ตัวพิมพ์ใหญ่**: ปฏิเสธ ชื่อต้องตรง `^[a-z0-9_]+$` และ `endsWith("_test")` (`isTestDatabaseName`) เกณฑ์เดียวใช้ทั้ง selector, guard และ CREATE DATABASE

**ไฟล์**:
- `server/src/db/testing/test-database.ts` (ใหม่):
  - `isTestDatabaseName` :32, `databaseNameOf` :43 (อ่านจาก path ของ URL เท่านั้น ไม่ echo URL)
  - `defaultTestDatabaseUrl` :55 (สร้างจาก `DEFAULT_DATABASE_URL` เปลี่ยนแค่ path จึงไม่มี credential ซ้ำ)
  - `resolveTestDatabaseUrl` :66, `assertTestDatabase` :89, `clearTestData` :96, `ALREADY_EXISTS` :107, `createTestDatabaseIfMissing` :114
- `server/src/db/testing/test-db-url.ts` (ใหม่): `testDatabaseUrl()` :15 ใช้ `inject("testDatabaseUrl")` + declare `ProvidedContext`
- `server/src/db/testing/global-setup.ts` (ใหม่): `setup(project)` :18 → URL จาก `getProvidedContext()` :19 → ต่อฐาน `postgres` แล้ว `createTestDatabaseIfMissing` :27 → `assertTestDatabase` :34 (ชั้น 1) → `migrate` :36 → `seedReferenceData` :37
- `server/vitest.config.ts`: `resolveTestDatabaseUrl` ตอนโหลด config จาก env ดั้งเดิม :7, `globalSetup` :19, `provide` :21, `env.DATABASE_URL` :23 (ไม่แตะ `include` และ `fileParallelism`)
- `server/src/assessment/repositories/seed-reference-data.ts` (ใหม่): `seedReferenceData(db)` :11 ย้าย insert 3 บรรทัดมาตามเดิม ไม่มี transaction
- `server/src/assessment/repositories/seed.ts`: เหลือเป็น CLI (สร้าง pool → `seedReferenceData` → ปิด pool) บรรทัด connection string ไม่แตะ
- test 7 ไฟล์: URL มาจาก `testDatabaseUrl()` และ clear helper 6 ฟังก์ชันเปลี่ยนเป็น `clearTestData(pool)` แก้ comment "bun run db:setup" ให้ตรงความจริง ไม่แตะ helper อื่น
- `.claude/CLAUDE.md`: section ใหม่ "Tests (database)" (AC7)

**db:seed ก่อนและหลังแก้ (dev)**: exit 0 ทั้งคู่, output `$ bun run src/assessment/repositories/seed.ts` เหมือนกันทุก byte (`cmp`), จำนวนแถวเป็น 16/16/96 ทั้งสองครั้ง

**Mutation** (config ชั่วคราวที่รันแค่ unit test ไม่มี globalSetup จึงไม่ต่อฐานจริง; sha256 ตรงหลังย้อนกลับ; `git grep MUTATION` ไม่เจอ):
1. ลบ guard ออกจาก clearTestData → 2 แดง: `promise resolved "undefined" instead of rejecting` และ `expected 'delete from test_result' to match /select\s+current_database\(\)/i`
2. `endsWith("_test")` → `includes("test")` → 1 แดง: `"mbti_test_prod"` ได้ `promise resolved "undefined" instead of rejecting`

**E2E** (marker = แถว `"user"` id `h3-marker-fake-user` ใน dev):

| ขั้น | ผล |
|---|---|
| ก่อนใส่ marker | dev `"user"` = 0 แถว, ใส่ marker แล้ว = 1 |
| A) `bun run test` | exit 0, 310 passed, marker ยังอยู่ (1) |
| B) export `DATABASE_URL` → dev ใน shell, ไม่ตั้ง `TEST_DATABASE_URL` | exit 0, 310 passed, marker ยังอยู่ |
| C) `TEST_DATABASE_URL` → dev | exit 1, `Startup Error` → `Refusing to use database "mbti" for tests (TEST_DATABASE_URL): …end with "_test".` ไม่มี test ไหนรัน และ output ไม่มี URL marker ยังอยู่ |
| D) `DROP DATABASE mbti_test` แล้วรัน 2 รอบ | D1 และ D2: exit 0, 310 passed, mbti_test = 16/16/96 และ migrations = 8 ทั้งสองรอบ marker ยังอยู่ ส่วนอ้างอิงของ dev ไม่ถูกแตะ (16/16/96) |
| ลบ marker | dev `"user"` = 0, marker = 0 |

หมายเหตุ: `mbti_test` ถูกสร้างครั้งแรกตอนรันทั้งชุดหลัง GREEN (ก่อน e2e) จึงพิสูจน์การสร้างเองซ้ำใน D ด้วยการ drop ก่อน

**ผลตรวจรวม**: test 310/310 (279 เดิม + 31 ใหม่), `tsc` exit 0, `lint:deps` no violations (74 modules, 206 deps)

### ข้อควรระวัง (D-1)
- **ห้ามตั้ง `TEST_DATABASE_URL` บนระบบ deploy และห้ามรัน test ใน pipeline ที่ต่อฐานจริง** guard กันฐานที่ชื่อไม่ลงท้าย `_test` ได้ แต่ถ้าฐานจริงตั้งชื่อลงท้าย `_test` guard จะกันไม่ได้

### ข้อสังเกตนอกขอบเขต (ไม่ได้แก้)
1. **line ending ปนกัน**:
   - working tree: `get-result` และ `submit-test` test เป็น CRLF ส่วนไฟล์อื่นเป็น LF (blob ใน git เป็น LF ทั้งหมด, `core.autocrlf=true`) script แทนที่รอบแรกจึงพลาด 2 ไฟล์นี้ ต้องทำซ้ำแบบรองรับ `\r?\n`
   - ตรวจหลังแก้: สองไฟล์ยังเป็น CRLF ทุกบรรทัด (CR 470/470 และ 481/481 บรรทัด, `file`: "with CRLF line terminators") และ `git diff --stat` = 19 บรรทัดเท่าไฟล์ LF อื่น จึงไม่ใช่ diff ทั้งไฟล์
   - **ข้อเสนอ**: ใส่ `.gitattributes` (เช่น `* text=auto eol=lf`) และ `.editorconfig` ใน ticket formatter
2. **ค่า default ของ dev ซ้ำ**: `seed.ts:9` และ `drizzle.config.ts:11` ยัง hard-code ค่า default ของ dev ซ้ำกับ `DEFAULT_DATABASE_URL` (`src/db/client.ts:6`) มีอยู่ก่อนแล้ว ควรให้ใช้ค่าคงที่ตัวเดียว (ไม่ได้แก้)
3. `server/.env.example`: เพิ่มบรรทัดคอมเมนต์ `TEST_DATABASE_URL` แบบ placeholder (USER/PASSWORD) แล้ว (:3-5)
4. **ตรวจไม่ได้ / ไม่ได้ตรวจ**: globalSetup ของ vitest 5.1.1 เห็นค่าจาก `test.env` หรือไม่ ออกแบบให้ไม่ต้องพึ่ง (ใช้ `provide`)
5. test แต่ละไฟล์เปิด 2 pool (`pg.Pool` + `createDb`) มีอยู่ก่อนแล้ว
6. header "AI Context" ใน `.claude/CLAUDE.md` (CURRENT FEATURE) อัปเดตแล้ว: C1 commit แล้ว (`9b095b0` จาก git log) และ H3 เสร็จรอ commit
7. grep `DATABASE_URL` ใน `server/src` + config แล้ว ไม่มีไฟล์ test ไหนอ่านเอง ที่ยังเหลือมีเหตุผลทุกที่ (ดูรายงานเก็บงาน 2026-11-27)

### ขั้นต่อไป
1. ผู้ใช้รีวิว Phase 2 แล้ว commit เอง
