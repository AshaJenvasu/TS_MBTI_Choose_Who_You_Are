# HANDOFF — results-pagination (Epic 3 · C1)

## Session 2026-11-27 — C1: pagination ของ GET /results + index

### สถานะ
- Ticket: `.scratch/results-pagination/issues/C1-get-results-pagination.md`
- Phase 1 (RED), Phase 2 (GREEN/REFACTOR/mutation) และ Phase 3 (index + migration 0007 + EXPLAIN) **เสร็จครบทุก AC (AC1–AC12)**
- **ยังไม่ commit**: ผู้ใช้จะ commit เอง
- Migration `0007_workable_zombie` **apply ลง dev DB แล้ว** (`drizzle.__drizzle_migrations` = 8 แถว)
- ผลตรวจรวมล่าสุด:
  - `bun run test`: 279 passed / 0 failed (12 files)
  - `tsc --noEmit`: exit 0
  - `lint:deps`: no violations (67 modules, 179 deps)

### ไฟล์
- ใหม่:
  - `server/src/assessment/services/pagination.ts`: `PAGE_SIZE` = 10 (`:7`), `MAX_PAGE` = 1000 (`:14`) พร้อม comment บอกเหตุผล
  - `server/drizzle/0007_workable_zombie.sql`
  - `server/drizzle/meta/0007_snapshot.json`
- แก้:
  - `server/src/assessment/schema/list-results.schema.ts`:
    - `ListResultsQuery` `:22` (regex `:25`, override OpenAPI `:29`)
    - `ListResultsResponse` `:39` เป็น object
    - `InvalidPageResponse` `:52`
    - รูป item ไม่เปลี่ยน
  - `server/src/assessment/controllers/list-results.controllers.ts`:
    - `INVALID_PAGE_BODY` `:18`
    - `request.query` `:38`
    - response 400 `:44`
    - defaultHook `:61-64` (`target === "query"`)
    - `page = 1` `:70`
  - `server/src/assessment/repositories/list-results.repository.ts`:
    - query หน้า `:10-29`: `ORDER BY created_at DESC, id DESC` (`:26`) + `LIMIT/OFFSET` (`:27-28`)
    - query นับ `countResultsByUserId` `:35-41` ไม่ join เพราะ FK + NOT NULL
  - `server/src/assessment/services/list-results.services.ts`: `listResults(db, userId, page)` `:46` ใช้ `Promise.all` ยิงสอง query (`:47`), `totalPages = Math.ceil(total / PAGE_SIZE)` (`:56`)
  - `server/src/assessment/repositories/schema.ts`: import `index` `:5` และ index `:89-97` (`.desc().nullsFirst()` ทั้งสองคอลัมน์)
  - `server/drizzle/meta/_journal.json`: เพิ่ม entry idx 7 (`0007_workable_zombie`)
  - `docs/schema.dbml`: generator เพิ่ม block `indexes` (ดูข้อสังเกตข้อ 6)
  - test: `list-results.controllers.test.ts` (เพิ่ม 32 ข้อ + ปรับ #1, #4–#8) และ `claim-result.controllers.test.ts:108`

### Contract
- `GET /results?page=N` ตอบ `200 { items, page, pageSize: 10, total, totalPages }`
- item เหมือนเดิม: `id, mbtiType, character{name,imageUrl}, createdAt`
- ไม่ส่ง page จะได้หน้า 1
- page เกินหน้าสุดท้ายได้ `items: []` แต่ total และ totalPages ยังเป็นค่าจริง ไม่มีผลเลยได้ total 0 และ totalPages 0
- page ที่ไม่ใช่ `^[1-9][0-9]*$` หรือเกิน 1000 ได้ `400 { error: { code: "INVALID_PAGE", message } }` ค่ากำกวม (`01`, ` 1`, `1.5`, `1e2`, ค่าว่าง, ส่งซ้ำ) ก็ได้ 400 เช่นกัน
- ไม่มี session ได้ 401 เสมอ (requireAuth ทำงานก่อน validator ที่ `node_modules/@hono/zod-openapi/dist/index.cjs:164-165`)
- `?page=1&page=2`: Hono เปลี่ยนเป็น array (`node_modules/hono/dist/validator/validator.js:44-47`) แล้ว `z.string()` ไม่ยอมรับ จึงได้ 400 INVALID_PAGE
- OpenAPI ของ `page`: ถ้าไม่ override จะออกมาเป็น `{type:"string", pattern:"^[1-9][0-9]*$"}` จึงใช้ `.openapi({type:"integer", minimum:1, maximum:MAX_PAGE, default:1})` ทับไว้ ผลจริงคือ `{"type":"integer","minimum":1,"maximum":1000,"default":1}` และไม่มี pattern ค้าง **ถ้าแก้ regex ต้องแก้ override คู่กัน**

### Migration 0007
ไฟล์ `server/drizzle/0007_workable_zombie.sql` เป็น CREATE INDEX อย่างเดียว:
```sql
CREATE INDEX "test_result_user_id_created_at_id_idx" ON "test_result" USING btree ("user_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);
```
ผลใน DB หลัง `db:migrate`:
```
\d test_result → Indexes:
    "test_result_pkey" PRIMARY KEY, btree (id)
    "test_result_guest_token_unique" UNIQUE CONSTRAINT, btree (guest_token)
    "test_result_user_id_created_at_id_idx" btree (user_id, created_at DESC, id DESC)
pg_indexes: CREATE INDEX test_result_user_id_created_at_id_idx ON public.test_result USING btree (user_id, created_at DESC, id DESC)
version(): PostgreSQL 17.12 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit
```
ไม่มี `NULLS LAST` เพราะ `DESC NULLS FIRST` คือค่า default ของ Postgres

### 📚 บทเรียน: drizzle กับ Postgres ใช้ค่า default ของ NULLS ใน index ต่างกัน
- **สาเหตุ**:
  - drizzle-orm ตั้ง nulls ของ index column เป็น `"last"` เสมอ (`node_modules/drizzle-orm/pg-core/columns/common.js:76`) ถ้าเขียนแค่ `.desc()` จะได้ `DESC NULLS LAST`
  - แต่ `ORDER BY x DESC` ของ Postgres หมายถึง `DESC NULLS FIRST`
  - ลำดับไม่ตรงกัน planner จึงใช้ index แทนการ sort ไม่ได้ แม้คอลัมน์จะเป็น NOT NULL ก็ตาม
- **หลักฐาน**: migration แรกที่ generate ได้ `0007_narrow_the_call` เป็น `("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST)` เมื่อ EXPLAIN ใน BEGIN/ROLLBACK query ที่มี ORDER BY (หน้า 1, page 1000, หน้า 1 ของ user ทั่วไป) ยังมี Sort ส่วน count ไม่มี ORDER BY จึงไม่มี Sort (ดูตาราง EXPLAIN ด้านล่าง)
- **วิธีแก้** (ผู้ใช้อนุมัติ):
  1. ยืนยันว่า 0007 เดิมยังไม่ได้ apply (DB มี 7 migrations และไม่มี index นี้)
  2. ยืนยันว่า `_journal.json` และ `schema.dbml` มีแค่ผลจาก generate ครั้งแรก
  3. ลบ `0007_narrow_the_call.sql` + `meta/0007_snapshot.json` แล้ว `git checkout` `_journal.json` และ `docs/schema.dbml`
  4. แก้ schema เป็น `.desc().nullsFirst()` แล้ว `db:generate` ใหม่ได้ `0007_workable_zombie` (ไม่ได้แก้ SQL ด้วยมือ)
- **กฎ**: ครั้งหน้าที่เปลี่ยน ORDER BY หรือ index ต้องรัน EXPLAIN ซ้ำ และต้องเปิดดู SQL ที่ generate ว่า `NULLS FIRST/LAST` ตรงกับ ORDER BY ของ query จริง

### 📊 หลักฐาน EXPLAIN (ANALYZE, BUFFERS)
**วิธีทำ**:
- ใช้ `docker exec -i mbti_app_postgres psql` ครอบทั้งหมดด้วย `BEGIN ... ROLLBACK`
- สร้าง user จำลองใน transaction เดียวกัน: 2,000 user ทั่วไป × 20 ผล = 40,000 แถว และ `explain-big` 12,000 แถว (ทุก 10 แถวมี `created_at` ซ้ำกัน) รวม 52,000 แถว
- สั่ง `ANALYZE test_result` ก่อนทุกรอบ
- รอบที่สองใช้ `SET plan_cache_mode = force_custom_plan`
- **ที่มาของ SQL**: ดึงจาก drizzle logger ตอนเรียก `findResultsByUserId` / `countResultsByUserId` ตัวจริง (ไม่ได้เขียนใหม่) แล้วใช้ผ่าน `PREPARE`:
  - หน้า: `select "test_result"."id", "test_result"."mbti_type", "character"."name", "character"."image_url", "test_result"."created_at" from "test_result" inner join "character" on "character"."id" = "test_result"."matched_character_id" where "test_result"."user_id" = $1 order by "test_result"."created_at" desc, "test_result"."id" desc limit $2 offset $3`
  - นับ: `select count(*) from "test_result" where "test_result"."user_id" = $1`
- จำนวนแถวก่อนและหลังทั้งสองรอบ: `test_result` 0 → 0, `"user"` 0 → 0 (ไม่มีอะไรค้าง)
- **output ดิบ** (เปิดตรวจแล้ว ไม่มี connection string, password, token หรือข้อมูลส่วนตัว ค่าในแผนมีแค่ id จำลอง `explain-big`, `explain-u7`):
  - `.scratch/results-pagination/evidence/c1-explain-nullslast.out`: รอบแรก (ไม่มี index → index แบบ NULLS LAST → diagnostic แบบ DESC ปกติ)
  - `.scratch/results-pagination/evidence/c1-explain-v2.out`: รอบสอง (ไม่มี index → index แบบ NULLS FIRST ตาม 0007_workable_zombie)

| Query (user 12,000 แถว) | ไม่มี index | index แบบ NULLS LAST (0007 เดิม, ทิ้งแล้ว) | index แบบ NULLS FIRST (0007_workable_zombie) |
|---|---|---|---|
| 1) หน้า 1 | Seq Scan → Hash Join → **Sort** (top-N) · 6.0–6.4 ms · 643 buffers | Bitmap Index Scan (index ใหม่) → Hash Join → **Sort** (top-N) · 5.9 ms | **Index Scan using test_result_user_id_created_at_id_idx → Nested Loop, ไม่มี Sort** · **0.092 ms** · 6 buffers |
| 2) count | Seq Scan · 2.7 ms · 642 buffers | Bitmap Index Scan (index ใหม่) · 1.3 ms · 237 buffers | Bitmap Index Scan (index ใหม่) · 1.65 ms · 237 buffers |
| 3) page 1000 (OFFSET 9990) | Seq Scan → **Sort** (quicksort 10,000 แถว) · 7.7 ms | Bitmap → **Sort** · 6.0 ms | Bitmap → **Sort** · 6.1 ms (planner เลือกตามต้นทุน ดูหมายเหตุ) |
| 1b) หน้า 1 ของ user ทั่วไป (20 แถว) | — | Index Scan แต่ยังมี **Sort** · 0.124 ms | Index Scan ไม่มี Sort · 0.081 ms |

**แผนดิบของหน้า 1 (user `explain-big` 12,000 แถว) ครบ 3 แบบ**: คัดจากไฟล์ใน `evidence/` ด้วย `sed -n` ทุกบรรทัด ไม่ได้ย่อหรือเรียบเรียงใหม่

**แบบที่ 1: ไม่มี index** (`evidence/c1-explain-v2.out:23-47`, รอบเดียวกับแบบที่ 3, `force_custom_plan`; รอบแรกที่ไม่มี index อยู่ที่ `evidence/c1-explain-nullslast.out:22-46` ได้ 6.392 ms):
```
                                                            QUERY PLAN                                                             
-----------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1603.80..1603.82 rows=10 width=93) (actual time=5.998..6.000 rows=10 loops=1)
   Buffers: shared hit=643
   ->  Sort  (cost=1603.80..1633.72 rows=11969 width=93) (actual time=5.997..5.998 rows=10 loops=1)
         Sort Key: test_result.created_at DESC, test_result.id DESC
         Sort Method: top-N heapsort  Memory: 27kB
         Buffers: shared hit=643
         ->  Hash Join  (cost=21.48..1345.15 rows=11969 width=93) (actual time=1.659..3.697 rows=12000 loops=1)
               Hash Cond: (test_result.matched_character_id = "character".id)
               Buffers: shared hit=643
               ->  Seq Scan on test_result  (cost=0.00..1292.00 rows=11969 width=33) (actual time=1.595..2.400 rows=12000 loops=1)
                     Filter: (user_id = 'explain-big'::text)
                     Rows Removed by Filter: 40000
                     Buffers: shared hit=642
               ->  Hash  (cost=15.10..15.10 rows=510 width=68) (actual time=0.016..0.016 rows=16 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 10kB
                     Buffers: shared hit=1
                     ->  Seq Scan on "character"  (cost=0.00..15.10 rows=510 width=68) (actual time=0.006..0.007 rows=16 loops=1)
                           Buffers: shared hit=1
 Planning:
   Buffers: shared hit=121
 Planning Time: 0.791 ms
 Execution Time: 6.045 ms
(22 rows)
```

**แบบที่ 2: index แบบ NULLS LAST** (0007_narrow_the_call ทิ้งแล้ว, `evidence/c1-explain-nullslast.out:90-117`), หลักฐานว่า Sort ยังอยู่:
```
                                                                                QUERY PLAN                                                                                
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1543.11..1543.14 rows=10 width=93) (actual time=5.809..5.812 rows=10 loops=1)
   Buffers: shared hit=150 read=88
   ->  Sort  (cost=1543.11..1572.95 rows=11936 width=93) (actual time=5.807..5.809 rows=10 loops=1)
         Sort Key: test_result.created_at DESC, test_result.id DESC
         Sort Method: top-N heapsort  Memory: 27kB
         Buffers: shared hit=150 read=88
         ->  Hash Join  (cost=462.39..1285.18 rows=11936 width=93) (actual time=0.838..3.213 rows=12000 loops=1)
               Hash Cond: (test_result.matched_character_id = "character".id)
               Buffers: shared hit=150 read=88
               ->  Bitmap Heap Scan on test_result  (cost=440.92..1232.12 rows=11936 width=33) (actual time=0.809..1.478 rows=12000 loops=1)
                     Recheck Cond: (user_id = 'explain-big'::text)
                     Heap Blocks: exact=149
                     Buffers: shared hit=149 read=88
                     ->  Bitmap Index Scan on test_result_user_id_created_at_id_idx  (cost=0.00..437.94 rows=11936 width=0) (actual time=0.756..0.757 rows=12000 loops=1)
                           Index Cond: (user_id = 'explain-big'::text)
                           Buffers: shared read=88
               ->  Hash  (cost=15.10..15.10 rows=510 width=68) (actual time=0.015..0.016 rows=16 loops=1)
                     Buckets: 1024  Batches: 1  Memory Usage: 10kB
                     Buffers: shared hit=1
                     ->  Seq Scan on "character"  (cost=0.00..15.10 rows=510 width=68) (actual time=0.007..0.008 rows=16 loops=1)
                           Buffers: shared hit=1
 Planning:
   Buffers: shared hit=25 read=1
 Planning Time: 0.365 ms
 Execution Time: 5.892 ms
(25 rows)
```

**แบบที่ 3: index แบบ NULLS FIRST** (0007_workable_zombie ตัวปัจจุบัน, `evidence/c1-explain-v2.out:91-112`), Index Scan ไม่มี Sort:
```
                                                                               QUERY PLAN                                                                               
------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=0.57..2.87 rows=10 width=93) (actual time=0.044..0.049 rows=10 loops=1)
   Buffers: shared hit=3 read=3
   ->  Nested Loop  (cost=0.57..2768.63 rows=12028 width=93) (actual time=0.043..0.048 rows=10 loops=1)
         Buffers: shared hit=3 read=3
         ->  Index Scan using test_result_user_id_created_at_id_idx on test_result  (cost=0.41..2467.96 rows=12028 width=33) (actual time=0.031..0.032 rows=10 loops=1)
               Index Cond: (user_id = 'explain-big'::text)
               Buffers: shared hit=1 read=3
         ->  Memoize  (cost=0.16..0.18 rows=1 width=68) (actual time=0.001..0.001 rows=1 loops=10)
               Cache Key: test_result.matched_character_id
               Cache Mode: logical
               Hits: 9  Misses: 1  Evictions: 0  Overflows: 0  Memory Usage: 1kB
               Buffers: shared hit=2
               ->  Index Scan using character_pkey on "character"  (cost=0.15..0.17 rows=1 width=68) (actual time=0.008..0.008 rows=1 loops=1)
                     Index Cond: (id = test_result.matched_character_id)
                     Buffers: shared hit=2
 Planning:
   Buffers: shared hit=25 read=1
 Planning Time: 0.385 ms
 Execution Time: 0.092 ms
(19 rows)
```

**หมายเหตุ page 1000**:
- OFFSET ลึกต้องอ่าน 10,000 แถวไม่ว่าจะเลือกแผนไหน (นี่คือต้นทุนของ offset pagination)
- ใน custom plan, planner ประเมินว่า Bitmap + Sort ถูกกว่า Index Scan ที่อ่าน 10,000 แถว จึงยังมี Sort (6.1 ms) ไม่ใช่บั๊ก
- รอบ diagnostic ที่ใช้ generic plan เลือก Index Scan ไม่มี Sort ได้ 3.5 ms
- เกณฑ์ "ไม่มี Sort node" ของ ticket ใช้กับ query หน้า 1 ซึ่งผ่านแล้ว

### 🧬 Mutation (Phase 2)
ทำทีละจุด แล้วย้อนกลับจากไฟล์สำรอง sha256 ตรงกับก่อนแก้ และ `git grep MUTATION` ไม่เจอ

| # | Mutation | Test ที่แดง |
|---|---|---|
| 1 | ลบ `desc(testResult.id)` | AC3 เท่านั้น: `expected [ …(10) ] to deeply equal [ …(10) ]` |
| 2a | `MAX_PAGE = 1001` | AC7 page=1001 (`expected 200 to be 400`) + AC11 param |
| 2b | `MAX_PAGE = 999` | AC7 page=1000 (`expected 400 to be 200`) + AC11 param |
| 3 | เอา `.where(user_id)` ออกจาก count | AC10 เท่านั้น: total ของ Bob ไม่ใช่ 7 |

ไม่มี mutation ไหนรอด

### 🛡️ OWASP API Security Check
- **API1 BOLA**:
  - `userId` มาจาก `c.get("user").id` (session) เท่านั้น
  - test เดิม #5 (A≠B) และ #6 (ส่ง `?userId=` / `X-User-Id` ถูกเมิน) ยังผ่าน
  - query นับกรองด้วย `user_id` เดียวกัน (AC10 + mutation 3 พิสูจน์ว่า total ไม่รั่วจำนวนของคนอื่น)
- **API2 / API5**: `requireAuth` เป็นด่านแรกก่อน validator (AC9 6 ข้อ ไม่มี session ได้ 401 เสมอ ไม่ใช่ 400) endpoint นี้ไม่มี role
- **API3 Property Level**: item ผ่าน `toResultListItem` (whitelist) เหมือนเดิม test #1 และ AC11 ยืนยันว่ามีแค่ 4 key และ claim ยังตอบ `ResultListItem` เหมือนเดิม
- **API4 Resource Consumption**:
  - pageSize ตายตัวที่ server (10)
  - `MAX_PAGE` 1000 จำกัด OFFSET ไว้ที่ 9,990
  - Zod ตรวจก่อนถึง DB จึงไม่มีตัวเลขยักษ์ไปถึง Postgres (`99999999999999999999` ได้ 400 ไม่ใช่ 500)
  - index ทำให้หน้า 1 อ่านแค่ 10 แถว
- **crAPI Challenge 6**: `pageSize`, `limit`, `offset` จาก client ถูกเมิน (AC8 4 ข้อ ได้ 10 ผลและ `pageSize: 10` เสมอ)

### ทำไมไม่ครอบ transaction
- เป็นการอ่านอย่างเดียว ถ้า total คลาดไปเล็กน้อยเพราะมีผลใหม่แทรกระหว่างสอง query ก็ไม่ทำให้ข้อมูลเสียหาย
- เป็นข้อเสียชนิดเดียวกับ offset pagination ที่ยอมรับไว้แล้ว (หน้าอาจเลื่อน)
- ticket ล็อกไว้ว่าห้ามใช้ transaction หรือ window function
- `Promise.all` แค่ยิงสอง query พร้อมกันบน pool ไม่ได้ใช้ transaction

### ข้อจำกัดที่ยอมรับ (ตาม ticket)
1. Offset pagination: ถ้ามีผลใหม่แทรกระหว่างเปิดดู แถวอาจซ้ำหรือถูกข้ามระหว่างหน้า
2. total อาจคลาดเล็กน้อยเพราะนับแยก query
3. user ที่มีผลเกิน 10,000 รายการ (PAGE_SIZE × MAX_PAGE) เปิดหน้าที่เกิน 1,000 ไม่ได้ ในทางปฏิบัติไม่เกิดที่ ~1,000 users

### ผลตรวจ `pagination.ts` (Phase 3 ขั้น 1, รายงานอย่างเดียว ไม่ได้ย้าย)
- **circular import: ไม่มี**
  - วิธีตรวจ: `bun run lint:deps --output-type json` แล้วนับ dependency ที่ `circular: true` ได้ 0
  - `pagination.ts` ไม่ import อะไรเลย
  - ถูก import โดย `schema/list-results.schema.ts`, `services/list-results.services.ts` และ `controllers/list-results.controllers.ts`
- **convention ที่เห็นใน repo**:
  - ค่าคงที่ที่เป็นกฎของ domain อยู่ใน `services/` เป็นไฟล์ตามแนวคิด ไม่มี dependency เช่น `services/question-bank.ts` (`QUESTIONS`) และ `services/breakdown.ts:4` (`MAX_NET_SCORE`)
  - มีตัวอย่างของ schema ที่ import ค่าจาก services มาก่อนแล้ว: `schema/submit-test.schema.ts:2` import `QUESTIONS` จาก `../services/question-bank`
  - body ของ error อยู่ในไฟล์ที่ใช้ (`identity/middleware/require-auth.ts:10` `UNAUTHORIZED_BODY`) ส่วน schema error ที่ใช้ร่วมกันอยู่ที่ `src/errors.ts`
  - ค่าคงที่ของ infra อยู่ใน `src/db/client.ts` (`DEFAULT_DATABASE_URL`) และ `src/app.ts` (`OPENAPI_CONFIG`)
- **สรุป**: `pagination.ts` ตรงกับ convention นี้ (เทียบได้กับ `question-bank.ts`) ไม่ต้องย้าย

### ข้อสังเกตนอกขอบเขต (จดไว้ ไม่ได้แก้)
1. body ของ error 400 เขียนซ้ำ 3 แบบ: `badRequest` ใน `get-result.controllers.ts:23` และ `claim-result.controllers.ts:20` และ `INVALID_PAGE_BODY` ใน `list-results.controllers.ts:18`
2. hook ของ list จับแค่ `target === "query"` ถ้า validation fail ใน target อื่น zod-validator จะตอบ 400 แบบดิบ (`node_modules/@hono/zod-validator/dist/index.cjs:21`) ตอนนี้ route มีแค่ query จึงไม่เกิดขึ้นจริง
3. warning `missing-tsc-transpiler` ของ dependency-cruiser (typescript 7.0 ไม่รองรับ) มีอยู่ก่อนแล้ว ผลยังเป็น no violations
4. repo ไม่มี script `lint` และไม่มี config eslint/biome ที่ ticket เขียนว่า "lint ผ่าน" เป็นความคลาดเคลื่อนของ ticket เอง
5. **test ใช้ DB เดียวกับ dev (ยืนยันแล้ว)**:
   - test ใช้ `process.env.DATABASE_URL ?? <ค่าเดียวกับ DEFAULT_DATABASE_URL (src/db/client.ts:6)>` (ไม่เขียนค่าจริงไว้ที่นี่)
   - dev server (`src/dev.ts:8` `createDb()`) ใช้ `DATABASE_URL` จาก `server/.env` ซึ่งชี้ไป host `localhost` port `5433` db `mbti` (ตรวจแค่ host/port/db ไม่ได้ดู password)
   - `clearAll` ของ test ลบ `test_result`, `session`, `account`, `verification`, `"user"` ทั้งตาราง ข้อมูลที่ลองมือบน dev จะหายทุกครั้งที่รัน test (ตอนเริ่ม Phase 3 ตารางว่างทั้งหมด)
6. `docs/schema.dbml` ที่ generator สร้างมี trailing whitespace 5 บรรทัด (บรรทัดละ 4 space) ใน block `indexes` (น่าจะเป็น check constraint ที่ drizzle-dbml-generator แปลงไม่ได้) ไม่ได้แก้มือ
   - docs/schema.dbml ไม่แสดง DESC ของ index เป็นข้อจำกัดของ generator ส่วน trailing whitespace ใน block indexes เป็น artifact ของ generator ให้ยืนยันทิศทางของ index จาก `\d test_result` หรือ SQL ของ migration เท่านั้น
7. `0007_workable_zombie` apply ลง dev DB แล้ว ถ้าตัดสินใจไม่ commit งานนี้ ต้องย้อน DB เอง (drop index และลบแถวที่ 8 ใน `drizzle.__drizzle_migrations`)

### ขั้นต่อไป
1. ผู้ใช้รีวิวแล้ว commit เอง (ไฟล์ทั้งหมดดูได้จาก `git status`)
2. Frontend หน้า History ใช้ contract นี้ได้เลย
