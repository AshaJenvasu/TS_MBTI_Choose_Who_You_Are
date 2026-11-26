# ADR-003: Guest-Claim Idempotency Design & Backup Strategy

**Status:** ✅ Accepted (2026-11-23)

## Context
Hotspot จาก DDD Round 1: การ "claim" ผล guest เข้ากับ user ต้อง idempotent + กัน race condition
ต้องตัดสินใจ 2 เรื่อง: (1) constraint design ของ `user_id`/`guest_token`, (2) backup strategy ของ Neon free tier

## Decision

### 1) Claim Constraint
```sql
UPDATE TestResult
SET user_id = :myUserId, guest_token = NULL
WHERE id = :resultId AND guest_token = :presentedToken AND user_id IS NULL
```
- Atomic conditional update กัน race condition (ไม่ใช่ check-then-act 2 จังหวะ)
- ล้าง `guest_token` เป็น NULL ทันทีที่ claim สำเร็จ (ปิดช่องโหว่ token หลุด + data hygiene)
- Idempotent retry: ถ้า affected=0 → `SELECT user_id` เช็คว่าเป็นของผู้ขอเอง (claim ไปแล้วจาก retry ก่อนหน้า) → ตอบสำเร็จ, ถ้าไม่ใช่ → 403
- Schema: `CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL)` กันแถวไม่มีเจ้าของ

### 2) Backup Strategy
ใช้ Neon Free-tier Instant Restore (PITR, history window 6 ชม., อัตโนมัติไม่ต้องตั้งค่าเพิ่ม) ตามที่มีให้ฟรี
ไม่ทำ off-site backup เพิ่ม — เกินความจำเป็นของ scope (budget 0 บาท, ไม่ใช่ production จริง)
เสริม manual snapshot (ฟรี 1 ชุด) ก่อน migration/deploy ที่เสี่ยง เป็น practice เพิ่มความปลอดภัย

## Consequences
- ✅ Idempotent + race-safe โดยไม่ต้องเก็บ secret token ค้างตลอดไป
- ✅ Backup ครอบคลุม human-error เคสทั่วไปโดยไม่เสียค่าใช้จ่าย
- ⚠️ Backup ไม่ครอบคลุม disaster-level (Neon project/account หาย) — ยอมรับความเสี่ยงนี้ตาม scope

## Alternatives Considered
- **เก็บ `guest_token` ตลอดไป (ไม่ล้าง)** — ปัดตก เพราะมีช่องโหว่ security (token หลุดใช้ดูผลได้อยู่) + ขัด data hygiene
- **Off-site backup เพิ่มเติม (เช่น pg_dump ไป S3)** — ปัดตก เพราะเกิน scope/budget ของโปรเจกต์ personal portfolio นี้

## หมายเหตุอัปเดต (2026-11-26)
- กรณีไม่ใช่เจ้าของ resource ระบบตอบ 404 (ไม่ใช่ 403) เพื่อไม่บอกว่า resource นั้นมีอยู่จริง (OWASP API1)
  ข้อความเดิมที่ระบุ 403 ให้ถือตามหมายเหตุนี้
