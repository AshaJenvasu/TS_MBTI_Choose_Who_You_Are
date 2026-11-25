# Epic 1 Ticket 4 — GET /results (list)

**Epic:** 1 — Assessment
**Bounded Context:** Assessment (🔴 Core)
**Depends on:** Ticket A2 (session middleware — `requireAuth`) ✅ เสร็จแล้ว

## User Story
**As a** ผู้ใช้ที่ login แล้ว
**I want** ดูรายการผล MBTI test ทั้งหมดที่ฉันเคยทำ
**So that** ฉันย้อนดูประวัติผลของตัวเองได้ ไม่ใช่แค่ผลล่าสุด

## Acceptance Criteria

**AC1 — ดูรายการผลของตัวเองได้**
- Given: ผู้ใช้ login แล้ว มี test result ที่ผูกกับ account อยู่หลายรายการ
- When: เรียก `GET /results`
- Then: ได้ `200` พร้อม array ของผลทั้งหมดที่เป็นของ user นี้เท่านั้น เรียงจากล่าสุด → เก่าสุด (`ORDER BY created_at DESC`)

**AC2 — ไม่ login เข้าไม่ได้**
- Given: ไม่มี session cookie
- When: เรียก `GET /results`
- Then: ได้ `401` (ใช้ `requireAuth` middleware จาก A2 ตรงๆ — import จาก identity context ได้ตามกฎ Customer-Supplier)

**AC3 — ยังไม่เคยทำ test**
- Given: ผู้ใช้ login แล้วแต่ไม่มีผล test เลย
- When: เรียก `GET /results`
- Then: ได้ `200` พร้อม array ว่าง `[]` (ไม่ใช่ error/404)

**AC4 — BOLA check**
- Given: user A login อยู่ และมีผล test ของ user B อยู่ใน DB ด้วย
- When: user A เรียก `GET /results`
- Then: เห็นแค่ผลของตัวเอง ไม่เห็นของ user B เลยแม้แต่รายการเดียว (filter ด้วย `user_id` จาก session เท่านั้น ห้ามรับ user id จาก client)

## Scope
**IN:** `GET /results` endpoint, repository query filter by session user_id, DTO mapping, tests AC1-4
**OUT:** Pagination, filter/sort options อื่นนอกจาก created_at desc, guest-token access

## Backend Layer Breakdown
- Specification — `GET /results` → `200 [{ id, mbtiType, character: { name, imageUrl }, createdAt }]` หรือ `401` ไม่มี request param/body
- Repository — `findResultsByUserId(userId)`: `WHERE user_id = ? ORDER BY created_at DESC` ไม่มี schema/migration ใหม่
- Service — map แถว DB → DTO whitelist
- Route — `requireAuth` → `c.get('user').id` → service → array

## Security Note
- Challenge 1 (BOLA): filter มาจาก session เท่านั้น
- Challenge 4 (Excessive Data Exposure): DTO whitelist
