# Ticket 03: GET /results/:resultId

## User Story
ในฐานะคนที่เพิ่งทำ test เสร็จ (guest หรือ login แล้ว) ฉันอยากดูผลลัพธ์ของตัวเองอีกครั้งผ่าน resultId
เพื่อดูตัวละครที่จับคู่ บ้าน (house) และ compatibility โดยไม่ต้องทำ test ใหม่

## Acceptance Criteria (Given/When/Then)

1. Given resultId ถูกต้อง + header `X-Guest-Token` ตรงกับเจ้าของผล
   When เรียก GET /results/:resultId
   Then ได้ 200 พร้อม { mbtiType, character, house, goldenPair, compatibleTypes, challengingTypes }

2. Given resultId ไม่ใช่รูปแบบ UUID
   When เรียก
   Then ได้ 400 (error shape มาตรฐานของโปรเจกต์)

3. Given resultId เป็น UUID ถูกต้อง แต่ไม่มีแถวนี้อยู่จริงในระบบ
   When เรียก
   Then ได้ 404

4. Given resultId มีอยู่จริง แต่ guest_token ที่ส่งมา "ไม่ตรง" กับเจ้าของผล (เป็นผลของคนอื่น)
   When เรียก
   Then ได้ 404 เหมือนข้อ 3 เป๊ะ (ห้ามแยกแยะได้จาก response — ป้องกัน BOLA/resource enumeration)

5. Given ไม่ส่ง header X-Guest-Token มาเลย
   When เรียก
   Then ได้ 400/401 (ระบุ auth required)

## Scope จำกัดไว้ (อย่าทำเกิน)
- รองรับแค่ guest_token (header `X-Guest-Token`) เท่านั้น — ยังไม่มี Better Auth/session
  (จะมาเพิ่มตอน Epic 2) ห้ามเขียน logic รองรับ session ล่วงหน้า
- ก่อนเขียนโค้ด ให้เช็คก่อนว่า `MbtiTypeInfo` schema ปัจจุบันมีคอลัมน์ `house` อยู่แล้วหรือยัง
  ถ้ายังไม่มี ให้เพิ่มเข้าไป (migration ใหม่) ถ้ามีแล้วใช้ของเดิมเลย ห้ามเดาไปเขียนโดยไม่เช็คไฟล์จริงก่อน
- ไม่ต้องแตะ GET /results (list) — เป็น ticket ถัดไป

## Backend — RED-GREEN-REFACTOR (ตาม layer ของ Package by Feature เดิม)
- Specification: validation resultId เป็น UUID (Zod), response schema ตาม AC ข้อ 1
- Repository: query TestResult join Character + MbtiTypeInfo ด้วย resultId
- Service: ตรวจ guest_token ตรงกับ TestResult.guest_token ไหม (ถ้าไม่ตรง/ไม่เจอ → throw NotFound เดียวกันทั้งคู่)
- Route: GET /results/:resultId + openapi.yaml

## OWASP Check ที่เกี่ยวข้องกับ ticket นี้โดยตรง
- API1 Broken Object Level Authorization — คือแก่นของ ticket นี้เลย (AC ข้อ 4 พิสูจน์เรื่องนี้โดยตรง)

## DSA Design Check
Logic นี้ส่วนใหญ่เป็น DB query ครั้งเดียว ไม่มีการวน/สะสมค่าซับซ้อน — ข้ามได้ตามเกณฑ์ที่ตั้งไว้
(เป็น CRUD-like read ธรรมดา)
