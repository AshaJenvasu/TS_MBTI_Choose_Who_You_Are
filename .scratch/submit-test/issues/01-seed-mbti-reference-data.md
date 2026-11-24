# Ticket 1: Seed ข้อมูลอ้างอิง 16 MBTI Types

## ขอบเขต
- Migration: สร้างตาราง `Character` + `MbtiTypeInfo` ตาม ER Diagram ที่ตกลงไว้
- Seed script: ใส่ข้อมูล 16 type (placeholder content ก่อนได้ — ชื่อ/คำบรรยายจริงรอ content stage)
- Test: query แล้วเช็คว่ามีครบ 16 แถว, type_code unique, ทุกแถวมี golden_pair_type ที่ชี้ไปยัง type_code อื่นที่มีอยู่จริง (ไม่ refer ตัวเอง)

## Dependency
- ไม่มี (ticket แรก เริ่มได้เลย)

## TDD
RED: เขียน test เช็คจำนวนแถว+ความถูกต้องของ golden_pair ก่อน (ควรแดงเพราะยังไม่มีตาราง/ข้อมูล)
GREEN: เขียน migration + seed ให้ test ผ่าน
REFACTOR: จัดระเบียบ seed data ให้อ่านง่าย

## OWASP Check
ข้ามได้ — ไม่มี endpoint เปิดให้เรียกจากภายนอกใน ticket นี้ (เป็นแค่ data layer)
