# Ticket 04: Better Auth + Google OAuth Setup (Epic 2 / Feature A, Ticket A1)

**Epic:** 2 — Identity & Claim
**Feature:** Account Setup (Feature A)
**Bounded Context:** Identity
**Weight:** ⚪ Generic (ใช้ library สำเร็จรูป แต่ AC2/AC5 ต้องเทสจริงจัง)

## User Story
As a guest user, I want to sign in with my Google account, so that I have a
persistent account to save my MBTI results to.

## Acceptance Criteria (Given/When/Then)

**AC1 — Sign in ครั้งแรก (สร้าง account ใหม่)**
Given ผู้เยี่ยมชมใหม่ไม่เคยมี account
When คลิก "Sign in with Google" แล้วอนุมัติ consent screen สำเร็จ
Then ระบบสร้าง user record ใหม่ + session, ตั้ง cookie, และเรียก session
endpoint แล้วได้ profile กลับมาถูกต้อง

**AC2 — Sign in ซ้ำ (ห้ามสร้าง account ซ้ำ)**
Given user ที่เคย sign in ด้วย Google account นี้มาแล้ว
When sign in ด้วย Google account เดิมอีกครั้ง
Then ได้ session ใหม่ผูกกับ user record เดิม ไม่สร้างแถวซ้ำ

**AC3 — Sign out**
Given user ที่ login อยู่ มี session ใช้งานได้
When เรียก sign-out
Then session ถูกเคลียร์ และ request ถัดไปด้วย cookie เก่าถือเป็น
unauthenticated

**AC4 — ผู้ใช้กด cancel ที่หน้า Google consent**
Given ผู้เยี่ยมชมเริ่ม flow sign-in with Google
When กด cancel/ปฏิเสธที่หน้า Google เอง
Then redirect กลับมาแอปพร้อม error state ที่อ่านง่าย ไม่มี user/session
ถูกสร้างค้างไว้

**AC5 — ตรวจ schema เข้ากับ claim-idempotency design (⚠️ สำคัญ)**
Given design เดิมที่ TestResult.user_id ต้องอ้างอิง user table ของ
Identity context (ตกลงไว้ตั้งแต่ Round 1)
When Better Auth generate schema ของตัวเอง (ตาราง user/session/account)
Then ต้องตรวจและยืนยันว่า FK ที่จะใช้ตอน claim (Feature B) ชี้ไปตาราง/
คอลัมน์ที่ถูกต้องจริง ไม่ชนหรือไม่ตรงกัน — เช็คจาก schema จริงที่มีอยู่
ตอนนี้ ห้ามเดาจากเอกสาร design เก่าอย่างเดียว

## Scope

**IN:**
- ติดตั้ง + config `better-auth` library, Google OAuth provider เท่านั้น
- Migration ตาราง user/session/account/verification ของ Better Auth
- Sign-in / sign-out / session endpoint (auto-generate จาก Better Auth)
- หน้า HTML ทดสอบเล็กๆ (ปุ่ม "Sign in with Google") สำหรับ manual test
  เท่านั้น — ไม่ใช่ frontend จริง ไม่ขึ้น production

**OUT (ห้ามทำใน ticket นี้):**
- Session-protected middleware สำหรับ route อื่น → Ticket A2 แยกต่างหาก
- Claim guest result logic → Feature B
- OAuth provider อื่น (Discord/email) → ยังไม่ทำตอนนี้
- Frontend UI จริงของ Epic 2 → รอ backend ทุก epic เสร็จก่อนตามกลยุทธ์
  ที่ตกลงกันไว้

## Backend layer breakdown
- Specification: auth endpoints เป็นของ Better Auth เอง ไม่ผ่าน @hono/zod-openapi — เพิ่ม note สั้นๆ ใน CLAUDE.md ชี้ไปที่ Better Auth docs แทนการพยายาม generate OpenAPI entry ปลอมๆ
- Repository (Model): รัน Better Auth CLI generate schema ด้วย Drizzle adapter → เทียบกับ schema จริงก่อน migrate (ดู AC5) → เพิ่ม FK user_id → "user".id ON DELETE RESTRICT ในรอบ migration เดียวกัน
- Service: Better Auth instance config (session strategy, Google provider, cookie settings)
- Route: mount Better Auth handler เข้า Hono app ที่ /api/auth/*, serve หน้า HTML ทดสอบแยกเป็น dev-only route ชัดเจน
