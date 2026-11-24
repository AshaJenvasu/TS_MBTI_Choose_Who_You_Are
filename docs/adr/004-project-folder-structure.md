# ADR-004: Project Folder Structure — Screaming Architecture + Package by Feature

**Status:** ✅ Accepted (2026-11-24)

## Context
ADR-001 เลือก Modular Monolith และกำหนดให้แยกโฟลเดอร์ตาม Bounded Context (`/assessment`, `/identity`, `/sharing`)
แต่ยังไม่ได้กำหนดว่าข้างในแต่ละ context จัดไฟล์อย่างไร ช่วง Ticket 1-2 โค้ด Assessment ถูกวางแบบแบน
(`route`, `service`, `scoring`, `db/` ปนอยู่ในโฟลเดอร์เดียวกัน) ซึ่งจะอ่านยากขึ้นเมื่อ Epic 2-3 (Identity, Sharing) เพิ่มเข้ามา
ผู้ใช้คุ้นกับ naming convention แบบแยก layer (controllers / services / repositories / schema) จากโปรเจกต์ก่อนหน้า
และต้องการเก็บความคุ้นเคยนั้นไว้ โดยไม่ทำให้ขอบเขต DDD Bounded Context เสีย

## Decision
ใช้ **Screaming Architecture + Package by Feature** โดยให้ top-level folder = **Bounded Context** เท่านั้น
(ไม่ใช่หน้าจอหรือฟีเจอร์ย่อย) แล้วซ้อน layer ไว้ข้างใน:

```text
server/src/
├── app.ts                  # Hono app bootstrap (ใช้ร่วมข้าม context)
├── db/client.ts            # DB client (ใช้ร่วมข้าม context)
└── assessment/             # Bounded Context
    ├── controllers/        # *.controllers.ts  — Hono route + createRoute
    ├── services/           # *.services.ts     — logic (scoring, submit-test)
    ├── repositories/       # *.repository.ts / schema.ts / seed — Drizzle table + seed
    └── schema/             # *.schema.ts       — Zod request/response validation
```

- `repositories/schema.ts` = Drizzle ORM table definitions
- `schema/*.schema.ts` = Zod validation schema (คนละความหมายกัน แยกตามโฟลเดอร์)
- โค้ดที่ใช้ร่วมข้าม context (`app.ts`, `db/client.ts`) และ `drizzle/` (migration) อยู่นอก context folder
- Context ใหม่ (`identity/`, `sharing/`) ใช้โครงเดียวกัน และ import direction ยังต้องเป็นไปตาม Context Map ใน ADR-001

## Consequences
- ✅ เห็นทันทีว่าระบบทำอะไร (Assessment / Identity / Sharing) จากชื่อโฟลเดอร์ระดับบนสุด
- ✅ ขอบเขต Bounded Context ยังชัด และตรงกับ lint rule ใน ADR-001
- ✅ ผู้ใช้ยังได้ naming convention เดิม (controllers / services / repositories / schema) อ่านง่ายและเดาตำแหน่งไฟล์ได้
- ⚠️ ชื่อ `schema` ซ้ำความหมาย (Drizzle ใน `repositories/` กับ Zod ใน `schema/`) ต้องจำให้ดี
- ⚠️ ฟีเจอร์เดียวกระจายอยู่หลายโฟลเดอร์ (controller + service + schema) ต้องเปิดหลายไฟล์ตอนแก้

## Alternatives Considered
- **Layer-first ที่ top-level (`controllers/`, `services/`, ... ใหญ่ชั้นเดียวทั้งโปรเจกต์)** — ปัดตก เพราะ Bounded Context หายไปจากโครงสร้าง ทำให้ import direction ตาม Context Map บังคับด้วย lint ยากขึ้น
- **Top-level = ฟีเจอร์/use case (`submit-test/`, `view-result/`, ...)** — ปัดตก เพราะผูกกับหน้าจอ/ฟีเจอร์ย่อย ไม่ใช่ขอบเขต DDD และข้าม context ได้ง่ายเกินไป
- **คงโครงแบนเดิมในแต่ละ context** — ปัดตก เพราะไฟล์จะปนกันมากขึ้นเมื่อ Epic 2-3 เข้ามา
