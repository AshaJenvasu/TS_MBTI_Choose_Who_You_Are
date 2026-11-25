# Ticket A2 — Session Middleware

**Epic:** 2 — Identity & Claim
**Feature:** A — Account Setup
**Bounded Context:** Identity (🟡 Supporting) — ตัวนี้ Weight: ⚪ Generic (ใช้ library สำเร็จรูปเป็นหลัก ไม่ใช่ custom business logic)
**Depends on:** Ticket 04 (Better Auth + Google OAuth setup) — ต้องเสร็จก่อน

## User Story
**As a** ผู้ใช้ที่ login ด้วย Google แล้ว
**I want** ระบบรู้จักว่าฉัน login อยู่เวลาเรียก endpoint ที่ต้องมีสิทธิ์
**So that** ฉันเข้าถึงข้อมูลของตัวเองได้อย่างปลอดภัย โดยคนที่ไม่ login เข้าไม่ได้

## Acceptance Criteria

**AC1 — Valid session เข้าถึงข้อมูลตัวเองได้**
- Given: ผู้ใช้ login แล้ว มี session cookie ที่ valid
- When: เรียก `GET /api/me`
- Then: ได้ `200` พร้อม user info เฉพาะ field ที่ปลอดภัยเปิดเผยได้: `id`, `email`, `name`, `image` (ห้าม dump raw DB row ทั้งก้อน)

**AC2 — ไม่มี session เลย**
- Given: ไม่มี session cookie ส่งมาเลย
- When: เรียก `GET /api/me`
- Then: ได้ `401 Unauthorized` — ใช้ error response shape เดิมที่มีอยู่แล้วในโปรเจกต์ (ห้ามสร้าง shape ใหม่)

**AC3 — Session หมดอายุ/invalid/ถูก revoke**
- Given: มี session cookie แต่ invalid ไม่ว่าเหตุผลอะไร (หมดอายุ / ถูกลบ / tamper)
- When: เรียก `GET /api/me`
- Then: ได้ `401` **response เหมือน AC2 เป๊ะ** ห้ามมีข้อความ/field ที่บอกใบ้ว่า invalid เพราะอะไร

**AC4 — Middleware ต้อง reusable**
- Given: มี route อื่น (สมมติใน test) ที่ apply `requireAuth` middleware เหมือนกัน
- When: เรียก route นั้นทั้งแบบมี valid session / ไม่มี session
- Then: ได้ behavior เดียวกับ AC1-3 โดยไม่ต้อง copy-paste auth-check logic ซ้ำ

## Scope
**IN:** `requireAuth` Hono middleware, `GET /api/me`, tests AC1-4
**OUT:** apply `requireAuth` กับ route จริงของ Epic1-Ticket4 (GET /results list) และ Epic2-B1 (claim); role-based authorization

## Backend Layer Breakdown
- Specification — `GET /api/me` → `200 { id, email, name, image }` หรือ `401` (shape เดิม) ไม่มี schema DB ใหม่
- Repository — ไม่มีใหม่ เรียก `auth.api.getSession({ headers })` ตรงๆ
- Service — `requireAuth`: getSession → ไม่มี/invalid → 401 → valid → `c.set('user', session.user)` แล้ว whitelist field (DTO)
- Route — `GET /api/me` ใช้ `requireAuth` คั่นก่อน + Zod schema สำหรับ `@hono/zod-openapi`

## Security Note
- BOLA: N/A — `/me` ไม่รับ ID จาก client
- Excessive Data Exposure: whitelist field ห้าม dump raw Better Auth user
- Deny-by-default: middleware เป็นด่านแรกเสมอ
