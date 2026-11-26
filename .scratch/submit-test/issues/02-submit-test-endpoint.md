# Ticket 2: POST /test/submit

## ขอบเขต (ครบทุก layer ในรอบเดียว)
- **Specification**: Zod schema validate `answers[]` (ต้องครบ 24 ข้อ, ค่าแต่ละข้อ 1-5)
- **Repository**: Migration ตาราง `TestResult` + CHECK constraint (`user_id IS NOT NULL OR guest_token IS NOT NULL`)
- **Service**: ฟังก์ชันคำนวณ MBTI type จาก answers (pure function, test แยกได้) + lookup Character ผ่าน MbtiTypeInfo.type_code (deterministic)
- **Route**: `POST /test/submit` — เช็ค auth (ถ้า login ใช้ user_id, ถ้าไม่ login สุ่ม guest_token) → เรียก service → บันทึก → ตอบกลับตาม API surface ที่ตกลงไว้

## Dependency
- ✅ ต้องมี Ticket 1 เสร็จก่อน (ต้องมี Character/MbtiTypeInfo ให้ join)

## Test ต้องครอบคลุม (อิง AC1-AC4)
- [ ] AC1: guest submit สำเร็จ → ได้ guestToken กลับมา
- [ ] AC2: logged-in submit สำเร็จ → ไม่มี guestToken ใน response
- [ ] AC3: answers ไม่ครบ/ค่าผิด → 400 `INVALID_ANSWERS`, ไม่มีแถวค้าง DB
- [ ] AC4: คำตอบชุดเดียวกัน → character ตัวเดิมเสมอ (เทส 2 ครั้งเทียบกัน)

## TDD
RED → GREEN → REFACTOR ตามลำดับ เขียน test ครบ 4 AC ก่อนเขียนโค้ดจริง

## OWASP Check (เฉพาะที่เกี่ยวข้อง)
- **API4 Unrestricted Resource Consumption**: ควรมี rate-limit เบื้องต้นกัน spam submit รัวๆ (เช่น 10 req/min ต่อ IP) — ใส่ไว้ตั้งแต่ ticket นี้เลยเพราะ endpoint เปิดให้ guest เรียกได้โดยไม่ต้อง auth

อัปเดต 2026-11-26: 20 → 24 ข้อ ตาม ADR-005
