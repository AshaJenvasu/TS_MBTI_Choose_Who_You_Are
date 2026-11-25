# HANDOFF — percentage-breakdown (Epic 1 / Ticket 5)

## Session 2026-11-25 — Epic 1 Ticket 5: Percentage Breakdown

### สถานะ
- โค้ด + tests เสร็จ, commit แล้ว (`5682134`)
- Tests: 170 passed + 1 todo (10 files). `tsc --noEmit` ผ่าน, `bun run lint:deps` 0 violations
- Migration `server/drizzle/0005_sticky_zaladane.sql` apply กับ local DB แล้ว

### สูตร `netScoreToPercentage` (`server/src/assessment/services/breakdown.ts`)
```ts
const raw = ((net + 12) / 24) * 100;            // 0..100 (% ของตัวอักษรแรก E/S/T/J)
const offset = raw - 50;
const roundedOffset = Math.sign(offset) * Math.round(Math.abs(offset));
return 50 + roundedOffset;                      // จำนวนเต็ม 0..100
```
- net = (คะแนนตัวอักษรแรก) - (คะแนนตัวอักษรที่สอง) จาก `scoreAxes()`, ช่วง ±12 (6 ข้อ/แกน × Likert weight ±2, validation บังคับครบ 24 ข้อ)
- **ปัดแบบสมมาตรรอบ 50** (ตัดสินใจกับ user แล้ว): ค่า .5 ปัดออกจาก 50 → net +3 → 63, -3 → 37; +9 → 88, -9 → 12. เหตุผล: ความเอียงที่ mirror กันต้องโชว์เลข mirror กัน (เผื่อ Epic 3 compatibility เทียบผล 2 คน). `Math.round` ตรงๆ จะได้ +3 → 63 แต่ -3 → 38 (I 62) ไม่สมมาตร
- ค่า .5 เกิดที่ net ±3, ±9 เท่านั้น และคำนวณออกมาตรงเป๊ะใน binary (12.5/37.5) ค่าอื่นมี float ปลายเพี้ยน (เช่น 4.1666…6) แต่ปัดแล้วถูกทุกตัว — ไล่ครบ 25 ค่าใน test
- เฉพาะ net 0 เท่านั้นที่ได้ 50% → % ไม่มีวันขัดกับตัวอักษร (tie → E/S/T/J ใน `scoring.ts`)
- สูตรอยู่ที่เดียว: `toBreakdown(net)` เรียกจากทั้ง `submit-test.services.ts` และ `get-result.services.ts`
- อีกตัวอักษรของแกน = 100 - ค่านี้ (response ส่งแค่ % ของตัวแรก)

### ทำไมเก็บ net score แทน 24 คำตอบดิบ
- feature นี้ต้องการแค่ net score ต่อแกน (4 int) เพื่อคำนวณ % ซ้ำได้ตรงเป๊ะ — คำตอบดิบไม่ได้ให้อะไรเพิ่มสำหรับ breakdown
- เล็กกว่า (4 int vs 24 ค่า), ตรวจได้ด้วย DB constraint ง่าย (`CHECK BETWEEN -12 AND 12`), และไม่ผูกกับ question bank (ถ้าข้อความ/ข้อคำถามเปลี่ยนในอนาคต net เดิมยังอ่านได้)
- ข้อเสียที่ยอมรับ: ถ้าวันหลังเปลี่ยนวิธีให้คะแนน (เช่น weight ใหม่) จะคำนวณผลเก่าใหม่ไม่ได้ — ต้องเก็บคำตอบดิบเพิ่มใน ticket แยก ถ้าจำเป็น
- ผลก่อน Ticket 5 ไม่มี net score (คำตอบไม่ได้เก็บ) — dev DB ตอน migrate มี 0 แถว จึงไม่มีข้อมูลค้าง

### ทำอะไรไปแล้ว
- Schema + migration `0005`:
  - `test_result` เพิ่ม `ei_score`, `sn_score`, `tf_score`, `jp_score` เป็น `integer NOT NULL`
  - CHECK `test_result_{ei,sn,tf,jp}_score_range` (`BETWEEN -12 AND 12`)
  - **ไม่ใส่ TRUNCATE ใน migration** (ไฟล์จะรันบน DB อื่นในอนาคตด้วย) ถ้ามีแถวค้าง `ADD COLUMN NOT NULL` จะ fail ให้เห็น ไม่ลบข้อมูลเงียบๆ
- `scoring.ts` — เพิ่ม `mbtiTypeFromNet(net)`; `calculateMbtiType` เรียกผ่านตัวนี้ (API เดิมไม่เปลี่ยน). submit คิด `scoreAxes` ครั้งเดียว ใช้ทั้ง type, breakdown, และค่าที่เก็บ
- `breakdown.ts` — `MAX_NET_SCORE = 12`, `netScoreToPercentage`, `toBreakdown`, type `Breakdown`
- `schema/breakdown.schema.ts` — Zod `Breakdown` (`ei/sn/tf/jp` int 0..100) ใช้ร่วมใน `SubmitTestResponse` และ `GetResultResponse`
- submit: insert 4 คะแนน + response `breakdown`; detail: repository select 4 คะแนน → `toBreakdown`
- `GET /results` (list) ไม่แตะ (exact-keys test เดิมยืนยันว่าไม่มี `breakdown`)
- Test เดิมที่ insert `test_result` ด้วย raw SQL ต้องใส่ 4 คะแนน (`0,0,0,0`) เพราะ NOT NULL: `get-result.controllers.test.ts`, `list-results.controllers.test.ts`, `identity/auth.test.ts`. key list ใน 3 assertion เพิ่ม `"breakdown"`. logic test เดิมไม่เปลี่ยน

### Tests ใหม่
- `breakdown.test.ts` (31):
  - AC4: -12/0/+12 → 0/50/100
  - ครบ 25 ค่าเทียบตารางมือ + `Number.isInteger`
  - mirror `p(n) + p(-n) = 100`
  - .5 cases (±3, ±9)
  - เฉพาะ 0 ที่ได้ 50
  - `toBreakdown`
- `submit-test.controllers.test.ts` (+8):
  - AC1: ชุดคำตอบมือ (net `{7,-9,5,7}` → ENTJ) → `{ ei: 79, sn: 12, tf: 71, jp: 79 }`; ENFP/ISTJ สุดขั้ว → 0/100
  - AC2: column ตรงกับ net; สุดขั้วเก็บ ±12; DB ปฏิเสธ 13/-13 (`23514`) และ null (`23502`)
  - AC3: GET detail ได้ breakdown เท่ากับตอน submit; แก้ค่าใน DB แล้ว breakdown เปลี่ยนตาม (พิสูจน์ว่าอ่านจาก column จริง)
  - OpenAPI: ทั้ง 2 response อ้าง `#/components/schemas/Breakdown`, 4 field int 0..100
- Mutation check (แก้ชั่วคราวแล้ว restore แล้ว, byte-identical):
  - ตัด `Math.round` → fail 26
  - หาร 25 แทน 24 → fail 29
  - ใช้ `Math.round(raw)` ไม่สมมาตร → fail 8
  - detail ใช้ EI = 0 แทนค่าที่เก็บ → fail 2
  - submit เก็บ SN ลง `ei_score` → fail 3
- หมายเหตุ: test boundary 3 ตัว (-12/0/+12) อย่างเดียวจับ "ลืม `Math.round`" **ไม่ได้** เพราะ 3 ค่านี้คำนวณออกมาเป็นจำนวนเต็มพอดีอยู่แล้ว — ตัวที่จับได้คือ test ครบ 25 ค่า + `Number.isInteger`

### เรื่องค้าง (พบหลังปิด ticket, ยังไม่มี ticket รับ)
- **Straight-lining (กดค่าเดิมทุกข้อ)**: ตอนนี้ไม่มีอะไรกัน backend รับทุกชุดที่ valid
  - ทุกข้อ 3 → net 0 ทุกแกน → ESTJ 50/50/50/50 (tie → E/S/T/J เงียบๆ)
  - ทุกข้อ 5 → net +4 ทุกแกน → ESTJ 67 ทุกแกน; ทุกข้อ 1 → net -4 → INFP 33
  - ต้นเหตุที่ 5/1 ไม่ได้ 50: keying แต่ละแกนเป็น 4:2 (4 ข้อชี้ตัวอักษรแรก, 2 ข้อชี้ตัวที่สอง) → คนตอบ "เห็นด้วย" ทุกข้อถูกดันไป E/S/T/J (acquiescence bias)
  - แนวทางที่คุยไว้ (user ยังไม่ตัดสินใจ, "ค่อยว่ากัน"): (2) flag `lowConfidence` ใน response เมื่อตอบค่าเดียวทั้งหมด / 3 เกินครึ่ง / มีแกน net 0 — ไม่บล็อก; คู่กับ (1) ปรับ question bank เป็น 3:3 ต่อแกน. ทางอื่น: 422 ถ้าตอบเหมือนกันทั้ง 24 ข้อ, ตัดตัวเลือกกลาง (4/6 ระดับ), UX ฝั่ง frontend
- **ตาราง `character` ยังเป็น placeholder** ทั้ง 16 แถว (`Type INFJ Placeholder`, `/placeholder/infj.png`, ...) — ยังไม่มีชื่อ/รูป/คำอธิบายจริง และไม่มีไฟล์รูป แก้ที่ข้อมูล seed แล้ว `bun run db:seed`
- **หลัง migrate ต้อง restart dev server**: `bun run dev` ไม่มี `--watch` — server เก่า (เริ่มก่อน Ticket 5) insert `test_result` โดยไม่ใส่ `ei_score..jp_score` → NOT NULL violation → `POST /test/submit` ได้ 500 ใน Scalar. Restart แล้วหาย

### ขั้นต่อไป
1. Epic 2 Feature B (B1 claim) ตาม CLAUDE.md
2. ตัดสินใจเรื่อง straight-lining ข้างบน (ticket แยก)
