# Ticket B1 — Claim guest result

**Epic:** 2 — Identity & Claim
**Feature:** B — Claim
**Bounded Context:** Assessment (🔴 Core) — เป็นเจ้าของตาราง `test_result`
**Depends on:** A2 (`requireAuth`), A3 (submit/detail รองรับ session)

## User Story
**As a** ผู้ใช้ที่ทำ test ตอนเป็น guest แล้วมา login ทีหลัง
**I want** ผูกผลที่ทำไว้ตอนเป็น guest เข้ากับบัญชีของฉัน
**So that** ผลนั้นไปอยู่ในประวัติ (`GET /results`) และเปิดดูได้ด้วยบัญชี ไม่ต้องพึ่ง guest token อีก

## API
`POST /results/{resultId}/claim` — ต้อง login (`requireAuth`), guest token ส่งทาง header `X-Guest-Token`
- `userId` มาจาก session เท่านั้น ห้ามรับจาก param/query/body
- `200` → `{ id, mbtiType, character: { name, imageUrl }, createdAt }` (shape เดียวกับรายการใน `GET /results`, ไม่มี breakdown)
- `400` → resultId ไม่ใช่ UUID (`INVALID_RESULT_ID`) / ไม่มี X-Guest-Token (`AUTH_REQUIRED`) — เหมือน `GET /results/:resultId`
- `401` → ไม่ได้ login (body เดียวกับ route ที่ป้องกันอื่นๆ)
- `404` → `RESULT_NOT_FOUND` เหมือนกันทุกกรณีที่ claim ไม่ได้

## การทำงาน (ตัดสินใจแล้ว ตาม ADR-003)
```sql
UPDATE test_result SET user_id = :me, guest_token = NULL
WHERE id = :id AND user_id IS NULL AND guest_token = :token
```
- UPDATE คำสั่งเดียวแบบ atomic (ไม่ใช่เช็คก่อนแล้วค่อยเขียนสองจังหวะ)
- UPDATE ไม่โดนแถวไหนเลย → เช็คว่าแถวนั้นมี `user_id` = ผู้ใช้คนนี้อยู่แล้วหรือเปล่า
  - ใช่ → `200` ผลเดิม (idempotent ไม่แก้ข้อมูล)
  - ไม่ใช่ → `404` (คนอื่น claim ไปแล้ว / token ผิด / ไม่มี resultId)

## Acceptance Criteria
- **AC1** login + token ถูกต้อง → `200` response แบบย่อ และ `GET /results` เห็นผลนั้น
- **AC2** หลัง claim แถวมี `user_id` = ฉัน และ `guest_token` = NULL
- **AC3** claim ซ้ำโดยเจ้าของ → `200` ผลเดิม ไม่เปลี่ยนข้อมูล
- **AC4** ผลที่คนอื่น claim ไปแล้ว / token ผิด / ไม่มี resultId → `404` เหมือนกันทุกกรณี
- **AC5** ไม่ได้ login → `401`
- **AC6** สอง request คนละ user claim ผลเดียวกันพร้อมกัน → สำเร็จคนเดียว อีกคน `404` (พิสูจน์ด้วย test จริง)
- **AC7** เจ้าของที่ login เปิดผลที่ claim แล้วได้ (`GET /results/:resultId` ด้วย session ซึ่งรองรับตั้งแต่ A3)

## Backend Layer Breakdown
- Route — `POST /results/{resultId}/claim` + `requireAuth` + Zod schema (param, header) ตาม pattern ของ `GET /results/:resultId`
- Service — `claimResult(db, resultId, userId, guestToken)` รวม UPDATE + อ่านผลไว้ใน transaction เดียว
- Repository — conditional UPDATE + select ผลที่ user เป็นเจ้าของ

## OWASP
- API1 BOLA: เจ้าของต้องจริง `userId` มาจาก session เท่านั้น และ 404 เหมือนกันทุกกรณี (ไม่บอกว่าผลมีอยู่จริง)
- API3: response มีแค่ 4 field (ไม่มี user_id, guest_token, breakdown)
- API5: `requireAuth`
- API4: rate-limit ยังไม่ทำ → `TODO(security-debt)` ในโค้ด (เหมือน submit-test) ไม่ implement

## โน้ต
- event `ResultClaimed` เป็นเรื่องของบัญชี แต่โค้ดอยู่ใน Assessment เพราะ Assessment เป็นเจ้าของตาราง `test_result` (Identity import Assessment ไม่ได้ตาม rule `identity-not-to-assessment`)
- client ต้องเก็บ guestToken ไว้ให้รอดข้ามหน้า login/register (เป็นงานของ Frontend)
- rate-limit ของ endpoint นี้ยังไม่ทำ (OWASP API4) → ใส่ `TODO(security-debt)` 1 บรรทัดในโค้ด
