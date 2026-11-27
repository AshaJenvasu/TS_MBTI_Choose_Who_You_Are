# HANDOFF — tooling-biome (Hardening H5)

## Session 2026-11-27 — H5: Biome (format + lint) + verify + line ending

### สถานะ
- Ticket: `.scratch/tooling-biome/issues/H5-biome.md`
- Phase A–D เสร็จ รอผู้ใช้ commit ก้อน ④
- ให้ผู้ใช้รันเอง 1 ครั้ง เพื่อให้ `git blame` ข้าม commit format โดยอัตโนมัติ: `git config blame.ignoreRevsFile .git-blame-ignore-revs`

### การตัดสินใจ
- **ใช้ Biome อย่างเดียว** (`@biomejs/biome` 2.6.9 exact, devDependency ใน `server/`)
  - Biome ไม่พึ่ง TypeScript
  - ESLint + typescript-eslint 8.74 ล้มกับ TS 7.0.2 (`typescript-eslint does not support TS 7.0.`)
- **Style**: indent 2 space, double quotes, semicolons always, trailing commas all, arrow parens always, lineWidth 100, LF, `assist` ปิด (ไม่เรียง import)
- **Lint**:
  - `preset: "recommended"`
  - `nursery.noFloatingPromises: error`
  - `noExplicitAny` และ `noNonNullAssertion` เป็น error ใน production และปิดใน `**/*.test.ts` (overrides)
- **Scripts** (`server/package.json`): `check`, `check:fix`, `typecheck` (`tsc --noEmit`), `verify` (= check → typecheck → lint:deps → test ด้วย `&&`)
- **Line ending**: `.gitattributes` (`* text=auto eol=lf`) และ `.editorconfig` (root, utf-8, LF, space 2, trim, final newline ยกเว้นใน `server/drizzle/**`)
- **Commit 4 ก้อน**:
  - ① `28724195b7ab339993f8a19d9cf1d0443802833c` config + scripts + .gitattributes + .editorconfig
  - ② `27af46cac8f401251f5c8d597bd56e4f764eb181` format ล้วน (อยู่ใน `.git-blame-ignore-revs`)
  - ③ `01a123fe38d893e0bf3d5ecfa87ca6a636fe8ef0` biome-ignore 11 จุด + guard ที่ `fake-google.ts`
  - ④ (ยังว่าง รอผู้ใช้ commit) `.git-blame-ignore-revs` และเอกสาร

### หลักฐาน
- **AST**: format ②: ทั้ง 37 ไฟล์ AST เทียบเท่ากับ HEAD เดิม (swc ตัด span/raw ทิ้งก่อนเทียบ) และคอมเมนต์ตรงกัน ตัว script ผ่าน control 7/7 (1→2, rename, สลับ arg, string เปลี่ยน ต้องต่าง / quote, trailing comma, arrow parens ต้องเท่ากัน)
- **OpenAPI**: sha256 `5277437e9f910da58bea2d4e4d176aa56ff097444e3a96e9a414b3542b3eee7c` เท่าเดิมหลัง ② และหลัง ③
- **check**: test 351 passed, lint:deps 77 modules / 222 deps no violations, typecheck exit 0, check 0 error 0 warning (หลัง ③)
- **blame**: `schema.ts:17` ถ้าไม่ใช้ flag จะชี้ไปที่ `27af46cac8f` ถ้าใช้ `--ignore-revs-file` จะชี้ไปที่ `7066dd73327` (commit เดิม)

### Canary ของ `noFloatingPromises` (Biome 2.6.9)
| เคส | ผล |
|---|---|
| a) async function ที่ไม่ await | จับ |
| b) `await` (control) | ไม่จับ |
| c) `void work()` | ไม่จับ (ยอม) |
| d1) ฟังก์ชันคืน class ที่ `implements PromiseLike` (return type เป็นชื่อ class) | **ไม่จับ** |
| d2) ฟังก์ชันตัวเดียวกันแต่ return type เป็น `PromiseLike<number>` | จับ |
| e) Drizzle `tx.insert(...).values(...)` ใน transaction ที่ไม่ await | **ไม่จับ** |
| e2) Drizzle `db.select().from(...)` ที่ไม่ await | **ไม่จับ** |
| cross-file: `claimGuestResult(...)` import จริง ไม่ await / await | จับ / ไม่จับ |

### Mutation
| mutation | Biome | tsc | test |
|---|---|---|---|
| M1 ลบ `await` หน้า `claimGuestResult` (`claim-result.services.ts:25`) | จับ | เงียบ | **ผ่านครบ 351 ข้อ (ไม่มี test จับ)** |
| M2 ลบ `await` หน้า `findOwnedResultItem` (`:28`) | เงียบ | ล้ม TS2739 | ล้ม 9 ข้อ (claim AC1–AC4, AC6, AC7 + error-responses claim 404 ×3) |
| M3 `fake-google.ts` `.get("state")` เป็นชื่อที่ไม่มีจริง | — | — | `auth.test.ts` ล้ม 10/13 ด้วย `Google authorize URL has no state parameter` ทุกข้อ |

### `noNonNullAssertion` 12 จุด (สถานะสุดท้าย)
| จุด | การกระทำ |
|---|---|
| `submit-test.repository.ts` `saved!.id` | biome-ignore (INSERT แถวเดียวที่ไม่มี ON CONFLICT จะคืน 1 แถวหรือ throw) |
| `submit-test.schema.ts` `EXAMPLE_VALUES[i]!` | biome-ignore (นับด้วย AST ได้ 24 = `QUESTIONS.length` 24 และ control ผ่าน) |
| `generate-erd.ts` `cmd!` ×2 | biome-ignore (ทุกทางของ ternary เป็น array literal ที่ไม่ว่าง) |
| `auth.ts` `env.X!` ×4 | biome-ignore (ใน `authConfigFromEnv()` ตรวจชื่อทั้ง 4 แล้ว throw ก่อน `return`) |
| `fake-google.ts` `pair!` ×3 | biome-ignore (`String.split` คืนอย่างน้อย 1 ค่าเสมอ) |
| `fake-google.ts:129` `get("state")!` | **แก้ด้วย** `if (state === null) throw new Error("Google authorize URL has no state parameter")` |

### ข้อจำกัดที่รู้แล้ว (ยังไม่พิสูจน์ / ยังไม่ทำ)
- Drizzle query builder และ class ที่เป็น thenable ไม่ถูก `noFloatingPromises` จับ
- `void promise` ผ่านกฎได้
- ไม่มี test ที่จำลองให้ UPDATE ใน claim transaction ล้ม จึงจับ M1 ได้แค่ Biome

### ไอเดีย backlog (ยังไม่ใช่ ticket)
- (ก) failure-injection test ของ claim transaction
- (ข) กฎหรือ plugin เสริมของ Biome สำหรับ Drizzle builder ที่ไม่ await (ยังไม่ได้ตรวจเอกสารว่าทำได้)
- (ค) validate env ให้เป็น typed config ตัวเดียว แทน `!` 4 จุดใน `auth.ts`
- (ง) Vite เตือนเรื่อง `configLoader 'native'` ที่ `vitest.config.ts:2` และ `src/db/testing/test-database.ts:1` (import ไม่มีนามสกุล มาจาก H3 ไม่เกี่ยวกับ Biome)
- (จ) `EXAMPLE_VALUES` ไม่มี guard ความยาว นอกจาก test ที่ล็อก `QUESTIONS` ไว้

### บทเรียน (retro)
- ความเข้มของการพิสูจน์ควรสัมพันธ์กับความเสียหายถ้าพลาดและ weight ของงาน: format 37 ไฟล์ทำ AST proof คุ้ม แต่การเพิ่มแค่คอมเมนต์ ดู `git diff` ก็พอ
- ตรวจสมมติฐานของพรอมต์กับโค้ดจริงก่อนเชื่อ: พรอมต์บอกว่าการตรวจ env ทำ "ตอน module load" แต่จริงๆ ทำใน `authConfigFromEnv()` ทุกครั้งที่เรียก
- ระหว่างทางพลาดเอง 3 ครั้ง:
  - Phase A: ไฟล์ backup ไปลงที่ `/tmp` แล้ว restore ล้ม ต้องแก้ `biome.json` กลับเอง
  - Phase C: เขียนไฟล์ชั่วคราวลง `node_modules` (ลบทันที)
  - Phase C: dedupe output จนนับผลไม่ได้ ต้องรันซ้ำ
- กติกาที่ได้: ไม่แก้ config แม้ชั่วคราว และกู้คืนด้วยการแก้กลับแล้วตรวจด้วย `git diff`
