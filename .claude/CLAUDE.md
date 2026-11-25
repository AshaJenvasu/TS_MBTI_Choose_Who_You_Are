## 🧠 AI Context Header

PROJECT: TS_MBTI_Choose_Who_You_Are!
WEIGHT: 🔴 Core
BOUNDED CONTEXTS:

- Assessment (🔴 Core) — ทำ test, แมตช์ตัวละคร, ดูผล+ประวัติ
- Identity (🟡 Supporting) — สมัคร/login, claim ผล guest เข้าบัญชี
- Sharing (🟡 Supporting) — share link + compare compatibility
  UBIQUITOUS LANGUAGE:
- TestResult = ผลการทำ test 1 ครั้ง (ผูกกับ user หรือ guest_token)
- Character = ข้อมูลภาพ/ชื่อตัวละคร (16 ตัว, 1 ต่อ MBTI type)
- MbtiTypeInfo = ความหมาย/ของแต่ละ type (แยกจาก Character)
- Claim = การผูกผล guest เข้ากับบัญชีที่สมัคร/login
- ShareLink = ลิงก์สาธารณะสำหรับแชร์ผล
  LATEST EVENT FLOW: User → ViewHistory (GET /results, requireAuth) → SessionValidated → HistoryViewed (own results only, newest first; [] if none) | no/invalid session → Unauthorized (401)
  CURRENT FEATURE: Epic 2 Feature B, Ticket B1 — claim guest result — next up

## Working style

- ทำเฉพาะสิ่งที่ถูกขอเท่านั้น ห้าม refactor/เพิ่มฟีเจอร์เกินขอบเขตโดยไม่ถามก่อน
- ถ้างานมีหลายขั้นตอน ให้สรุป plan สั้นๆ ก่อนเริ่มลงมือ แล้วรอ confirm
- ถ้าไม่แน่ใจ scope ให้ถามก่อน อย่าเดาเอง

## Session Management

- ก่อนจบ session ทุกครั้ง ต้องอัปเดต `HANDOFF.md` ของ feature ที่กำลังทำอยู่ (เก็บที่ `.scratch/<feature>/HANDOFF.md`) ให้ตรงกับสถานะล่าสุด (ticket ไหนเสร็จ/ค้าง, ขั้นต่อไปคืออะไร)
- ห้ามเขียนทับหรือลบ section ของ "วันอื่น/session อื่นที่ปิดไปแล้ว" ใน HANDOFF.md — ให้เพิ่ม section ใหม่ต่อท้ายเสมอ (กันเสียประวัติ)
- การแก้ข้อความภายใน section ของ "วันเดียวกัน/session เดียวกันที่ยังเปิดอยู่" ไม่ถือเป็นการ overwrite ประวัติ — แก้ได้ตามปกติเพื่อให้ข้อมูลล่าสุดถูกต้อง

## Auth endpoints (Better Auth)

- `/api/auth/*` (sign-in/social, callback/google, sign-out, get-session) เป็นของ Better Auth เอง mount ใน `server/src/app.ts` — ไม่ผ่าน `@hono/zod-openapi` และไม่อยู่ใน `/doc` (OpenAPI)
- ห้ามสร้าง OpenAPI entry ปลอมให้ route เหล่านี้ — ดู spec ที่ Better Auth docs: https://www.better-auth.com/docs/concepts/api
