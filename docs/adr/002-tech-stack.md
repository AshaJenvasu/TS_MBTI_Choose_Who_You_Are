# ADR-002: Tech Stack — Cloudflare Workers + Neon (Hybrid)

**Status:** ✅ Accepted (2026-11-23)

## Context
ผู้ใช้ต้องการฝึกของใหม่ (Cloudflare, Next.js+TanStack Query, Better Auth) แทนการใช้ stack เดิมที่พิสูจน์แล้ว
(Vercel+Render+Neon จากโปรเจกต์แรก) เพื่อการเรียนรู้ — และยังต้องการฝึก transaction/ACID เต็มรูปแบบ

## Decision
| Layer | เลือก | เหตุผล |
| --- | --- | --- |
| Frontend | Next.js + TanStack Query | ของใหม่ที่อยากฝึก |
| Backend Runtime | Cloudflare Workers (Hono) | Edge, V8 isolate ไม่มี cold-spin-down แบบ Render free tier |
| Database | **Neon Postgres** (ไม่ใช่ Cloudflare D1) | D1 (SQLite-based) ไม่รองรับ interactive `BEGIN TRANSACTION` — ขัดกับเป้าหมายฝึก ACID โดยตรง |
| ORM | Drizzle | ยืนยันจาก tech stack template ส่วนตัวของผู้ใช้ |
| Auth | Better Auth + OAuth | รองรับ Hono/Workers/Drizzle/Neon ครบ, มี provider สำเร็จรูป 30+ ตัว |

เหตุผลหลักของ "Hybrid" (Workers รัน compute, Neon เก็บข้อมูล แทนที่จะใช้ D1 ล้วน):
รักษาความสามารถทำ transaction/ACID จริงไว้ ซึ่งเป็นเป้าหมายการเรียนรู้หลักของโปรเจกต์นี้

## Consequences
- ✅ ได้ฝึก Cloudflare ecosystem ของใหม่ตามที่ต้องการ
- ✅ ยังฝึก transaction/ACID เต็มรูปแบบได้ (ผ่าน Neon)
- ⚠️ Next.js บน Cloudflare ต้องพึ่ง `vinext` adapter ที่ยังใหม่/ไม่ stable เต็มที่ (ความเสี่ยงหลักของ stack นี้)
- ⚠️ Neon serverless driver ต้องใช้ HTTP แทน raw TCP (ข้อจำกัดจาก Workers runtime)

## Alternatives Considered
- **Vercel + Render + Neon (stack เดิมจากโปรเจกต์แรก)** — ปลอดภัยกว่า เรียนรู้น้อยกว่า ปัดตกเพราะผู้ใช้ต้องการฝึกของใหม่โดยเฉพาะ
- **Cloudflare D1 ล้วน (ไม่ใช้ Neon)** — ปัดตกเพราะไม่รองรับ interactive transaction ขัดกับเป้าหมายการเรียนรู้
