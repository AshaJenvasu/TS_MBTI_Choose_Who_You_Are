# 🎫 Hardening H3 — แยก test DB จาก dev DB + guard กันลบผิดฐานข้อมูล
Weight: Supporting (test infra + ความปลอดภัยของข้อมูล) · ไม่มี endpoint ใหม่ จึงไม่ต้องทำ OWASP API check
หมายเหตุ: ข้อมูลที่ยังไม่ได้ verify อยู่ในหัวข้อ "Phase 0" ห้ามเดา ให้รายงานตามที่เจอจริง

## 🌱 ทำไม
ตอนนี้ test ใช้ฐานข้อมูลเดียวกับ dev (process.env.DATABASE_URL ?? ค่า default ของ dev) และ clearAll ลบทั้งตารางทุกครั้งที่รัน ผลคือ (1) ข้อมูลที่ลองมือใน dev หายทุกครั้ง (2) ตัวแปร DATABASE_URL ตัวเดียวกันจะถูกใช้กับ Neon จริงตอน deploy (D-1) ถ้าเผลอรัน test ตอนตัวแปรชี้ฐานจริง clearAll จะลบข้อมูลจริง

## 🔒 การตัดสินใจที่ล็อกแล้ว (ห้ามเปลี่ยนเอง)
- แบบ A: ฐานข้อมูลแยกชื่อ mbti_test ใน Postgres container เดิม (ไม่ใช้ transaction rollback ต่อ test, ไม่ใช้ Testcontainers)
- ตัวแปรแยก TEST_DATABASE_URL (ถ้าไม่ตั้ง ใช้ค่า default ของ local ที่ชี้ mbti_test) test ห้ามอ่านหรือถอยกลับไปใช้ DATABASE_URL จาก shell
- guard 2 ชั้น: (1) ก่อนเริ่มรัน test (2) ก่อน clearAll ทุกครั้ง โดยถาม Postgres ด้วย SELECT current_database() ว่าฐานที่ต่ออยู่จริงลงท้าย _test ถ้าไม่ใช่ให้ throw ก่อนมีคำสั่งลบ
- เกณฑ์ guard: ชื่อฐานข้อมูลต้องลงท้าย "_test" และ TEST_DATABASE_URL ต้องไม่ชี้ฐานเดียวกับ DATABASE_URL (ไม่เช็ก host)
- test ต้องเห็น DATABASE_URL เป็นฐาน test ผ่าน test.env ของ vitest (กันโค้ดข้างในที่อ่านตัวแปรนี้ตอน import เช่น db/client.ts ต่อผิดฐาน)
- สร้างฐาน + รัน migration + seed ข้อมูลอ้างอิงให้เองตอนเริ่มรัน test (globalSetup) ต้อง idempotent (รันซ้ำได้ ไม่ซ้ำ ไม่พัง)

## ✅ Acceptance Criteria
- AC1: Given รัน bun run test ตามปกติ / Then test ทั้งชุดใช้ฐานข้อมูลที่ชื่อลงท้าย _test และข้อมูลใน dev DB (mbti) ไม่ถูกแตะ (พิสูจน์ด้วย marker ดูหัวข้อ "พิสูจน์ด้วยมือ")
- AC2: Given ตัวแปร DATABASE_URL ใน shell ชี้ฐานอื่นใด (รวม dev) และไม่ได้ตั้ง TEST_DATABASE_URL / Then test ยังใช้ฐาน test ไม่ใช่ฐานที่ DATABASE_URL ชี้
- AC3: Given TEST_DATABASE_URL ชี้ฐานที่ชื่อไม่ลงท้าย _test (เช่น ฐาน dev) / When เริ่มรัน test / Then ล้มทันทีด้วยข้อความชัดเจนและ exit code ไม่เป็น 0 ก่อนมีคำสั่งเขียนหรือลบใดๆ (ชั้น 1)
- AC4: Given ฐานที่ต่ออยู่จริงชื่อไม่ลงท้าย _test / When clearAll ทำงาน / Then throw ก่อนคำสั่ง DELETE (ชั้น 2) พิสูจน์ด้วย unit test ที่ใช้ db จำลอง (ชื่อ "mbti" ต้อง throw, "mbti_test" ผ่าน, "mbti_test_prod" ต้อง throw, ค่าว่างต้อง throw)
- AC5: Given เครื่องที่ยังไม่มี mbti_test / When รัน bun run test / Then สร้างฐาน รัน migration ครบทุกไฟล์ และ seed ข้อมูลอ้างอิง (16/16/96) ให้เอง แล้ว test ผ่านครบ และเมื่อรันซ้ำ ต้องไม่มีข้อมูลซ้ำและไม่พัง
- AC6: Given มี migration ใหม่ในอนาคต / When รัน test / Then ฐาน test ถูก migrate อัตโนมัติ ไม่ต้องทำขั้นมือ
- AC7: เอกสาร (CLAUDE.md หรือ README ตามที่ repo ใช้) อธิบายวิธีรัน test, ตัวแปร TEST_DATABASE_URL และกฎว่า test ห้ามใช้ DATABASE_URL

## 🔎 Phase 0 — ตรวจก่อนเขียนโค้ด (read-only รายงานอย่างเดียว)
1. ไฟล์ config ของ vitest ปัจจุบัน: มี globalSetup/setupFiles/test.env หรือ fileParallelism อยู่แล้วหรือไม่
2. ไฟล์ test ทุกไฟล์ที่อ่าน DATABASE_URL หรืออ้างค่า default ของ dev (รายการ ไฟล์:บรรทัด) และ helper clearAll/insert/signIn ที่ประกาศซ้ำในแต่ละไฟล์ มีกี่ที่
3. db/client.ts อ่าน env ตอน import หรือไม่ และมี instance อื่น (เช่น Better Auth) ที่สร้าง connection เองหรือไม่
4. driver ของ Postgres ที่ใช้ และวิธี migrate แบบเขียนโค้ด (programmatic) ที่เข้ากับ driver นี้ (เทียบกับ db:migrate = drizzle-kit migrate)
5. script seed: ไฟล์/คำสั่ง และ idempotent หรือไม่ (รันซ้ำแล้วข้อมูลซ้ำ/พังไหม) ตารางไหนที่ test ลบด้วย clearAll และตารางข้อมูลอ้างอิง (character, mbti_type_info, mbti_type_compatibility) ถูกลบด้วยหรือไม่
6. role ของฐานข้อมูลที่ใช้มีสิทธิ์ CREATE DATABASE หรือไม่ (ดูจาก docker-compose และ SELECT rolcreatedb จาก role ที่ใช้ ห้ามพิมพ์รหัสผ่าน)
7. vitest รัน test file แบบขนานหรือไม่ (ผลต่อการใช้ฐานเดียวร่วมกัน) และปัจจุบันผ่านได้เพราะอะไร
8. ไม่ทราบ/ตรวจไม่ได้

## 🔴 RED
- เขียน unit test ของ guard ก่อน (AC4: ชื่อ "mbti" ต้อง throw, "mbti_test" ผ่าน, "mbti_test_prod" ต้อง throw, ค่าว่างต้อง throw) และ test ของตัวเลือก URL (ไม่ถอยกลับไปใช้ DATABASE_URL, ปฏิเสธเมื่อ TEST_DATABASE_URL ชี้ฐานเดียวกับ DATABASE_URL) ใช้ db จำลอง ห้ามต่อฐานจริงใน unit test นี้
- รันแล้วต้องแดงเพราะยังไม่มีฟังก์ชัน ไม่ใช่เพราะ syntax

## 🟢 GREEN
- ฟังก์ชัน guard + ฟังก์ชันเลือก URL ของ test ในตำแหน่งตาม convention ของ repo (รายงานว่าเลือกที่ไหนเพราะอะไร)
- globalSetup: เลือก URL → guard ชั้น 1 → สร้างฐานถ้ายังไม่มี (CREATE DATABASE ทำใน transaction ไม่ได้ และไม่มี IF NOT EXISTS ต้องเช็ก pg_database ก่อน) → migrate → seed แบบ idempotent
- vitest config: ตั้ง test.env.DATABASE_URL เป็น URL ของ test เสมอ
- แก้ clearAll (ทุกที่ที่มี ให้ใช้ตัวเดียวร่วมกันถ้าทำได้โดยไม่ขยายขอบเขต) ให้เรียก guard ชั้น 2 ก่อนลบ
- แทนที่การอ่าน DATABASE_URL/ค่า default ของ dev ในไฟล์ test ด้วย helper กลาง
- ห้ามแก้โค้ดของแอป (db/client.ts และค่า default ของ dev ยังเหมือนเดิม)
- ห้ามรวม cursor, Testcontainers, CI หรือการแก้ test ตัวอื่นนอกเหนือที่จำเป็น

## 🧬 พิสูจน์ด้วย mutation (ใช้เฉพาะ unit test กับ db จำลอง ห้ามรันกับฐานจริง)
1. ลบการเรียก guard ออกจาก clearAll → test ที่ตรวจว่า clearAll เรียก guard ต้องแดง
2. เปลี่ยนเงื่อนไข endsWith("_test") เป็น includes("test") → case "mbti_test_prod" ต้องแดง
ย้อนกลับด้วยไฟล์สำรอง ตรวจ sha256 และ git grep MUTATION ว่าไม่มีหลงเหลือ

## 🧪 พิสูจน์ end-to-end ด้วยมือ (ห้ามใช้ mutation กับฐานจริง)
- A) marker: ใส่แถวสังเคราะห์ที่ชัดเจนว่าปลอม 1 แถวใน dev DB (mbti) ก่อน รัน bun run test ทั้งชุด ตรวจว่า marker ยังอยู่หลังรัน จากนั้นลบ marker และรายงานจำนวนแถวก่อน/หลัง (ไม่พิมพ์ข้อมูลอื่น)
- B) ตั้ง DATABASE_URL ใน shell ชี้ dev แล้วรัน test โดยไม่ตั้ง TEST_DATABASE_URL: ต้องผ่านและ marker ยังอยู่ (AC2)
- C) ตั้ง TEST_DATABASE_URL ชี้ dev (ชื่อไม่ลงท้าย _test) แล้วรัน test: ต้องล้มทันทีด้วย exit code ไม่ใช่ 0 และ marker ยังอยู่ (AC3)
- D) รัน bun run test สองรอบติดกัน และทดสอบรอบแรกจากเครื่องที่ยังไม่มี mbti_test (ถ้าทำได้ เช่นลบ mbti_test ก่อน) ตรวจจำนวนแถวข้อมูลอ้างอิงเป็น 16/16/96 ทั้งสองรอบ (AC5, AC6)
- ห้ามพิมพ์ connection string รหัสผ่าน หรือค่าตัวแปร ในรายงาน ให้อ้างชื่อตัวแปรเท่านั้น

## 🏁 เสร็จเมื่อ
- test ทั้งชุดเขียว (279 + test ใหม่) บนฐาน test, tsc และ lint:deps ผ่านเท่าเดิม
- mutation 2 จุดพิสูจน์แล้ว และ end-to-end A-D ผ่านพร้อมหลักฐาน
- เอกสารอัปเดตตาม AC7
- HANDOFF จดผล Phase 0, การตัดสินใจที่เลือก, ข้อสังเกตนอกขอบเขต, และข้อควรระวังว่าตอนทำ D-1 ห้ามตั้ง TEST_DATABASE_URL บนระบบ deploy และห้ามรัน test ใน pipeline ที่ต่อฐานจริง

## 🔗 ติดอะไร
- ไม่มี blocker (ทำต่อจาก C1 ที่ commit แล้ว)
- ที่ตามมา: E2E (Playwright) ต้องใช้ฐาน test นี้ · D-1 ต้องเพิ่มข้อควรระวังข้างบนใน checklist
=== END TICKET H3 ===
