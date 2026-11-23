# ADR-001: Architecture Style — Modular Monolith

**Status:** ✅ Accepted (2026-11-23)

## Context
โปรเจกต์ MBTI Test (Anime Style) มี 3 Bounded Contexts (Assessment, Identity, Sharing)
Context Map ส่วนใหญ่เป็น Customer-Supplier (Identity→Assessment) และมี ACL เดียว (Assessment→Sharing)
แต่ ACL นี้เป็นการป้องกันข้อมูลภายใน (privacy) ไม่ใช่การพึ่งพาระบบนอก/ทีมอื่น
Scale ของโปรเจกต์ (~1,000 users, budget 0 บาท, นักพัฒนาคนเดียว) ไม่มีเหตุผลให้แยก service

## Decision
ใช้ **Modular Monolith** — 1 codebase, แยกโฟลเดอร์ตาม Bounded Context
(`/assessment`, `/identity`, `/sharing`) บังคับ import direction ตาม Context Map ด้วย lint rule

## Consequences
- ✅ Deploy ง่าย, ไม่มี network overhead ระหว่าง context
- ✅ เหมาะกับทีมคนเดียว ไม่มีปัญหาชนกันใน codebase
- ⚠️ ต้องรักษา discipline เรื่อง import direction เอง (ไม่มี network boundary มาบังคับให้)

## Alternatives Considered
- **Microservices** — ปัดตก เพราะไม่มี traffic pattern ที่ต่างกันจริงจัง และเพิ่ม complexity โดยไม่มีประโยชน์ที่ scale นี้
