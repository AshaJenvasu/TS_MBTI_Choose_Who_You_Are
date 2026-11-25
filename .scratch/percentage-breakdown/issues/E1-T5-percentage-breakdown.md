# Epic 1 Ticket 5 — Percentage Breakdown

**Epic:** 1 — Assessment
**Bounded Context:** Assessment (🔴 Core)
**Builds on:** Ticket 2 (Likert-weighted scoring) — reuses `scoreAxes()`

## User Story
**As a** ผู้ใช้ที่ทำ test เสร็จ
**I want** เห็นเปอร์เซ็นต์ความเอียงของแต่ละมิติ (ไม่ใช่แค่ตัวอักษร 4 ตัว)
**So that** เข้าใจผลตัวเองลึกขึ้น และดูย้อนหลังได้เหมือนเดิมทุกครั้ง

## Acceptance Criteria

**AC1 — Submit แล้วได้ breakdown ทันที**
- Given: ตอบครบ 24 ข้อ
- When: `POST /test/submit`
- Then: response มี `breakdown: { ei, sn, tf, jp }` (% ของตัวอักษรแรก E/S/T/J แต่ละแกน ปัดเป็นจำนวนเต็ม) นอกเหนือจาก `mbtiType` เดิม

**AC2 — Net score ถูก persist ลง DB**
- Given: submit สำเร็จแล้ว
- When: query `test_result` โดยตรง
- Then: เจอ 4 column ใหม่ (`ei_score`, `sn_score`, `tf_score`, `jp_score`) ค่าตรงกับที่ `scoreAxes()` คำนวณได้ (ช่วง -12 ถึง +12) ทุก column เป็น `NOT NULL`

**AC3 — ดูย้อนหลังได้ breakdown เดียวกันเป๊ะ**
- Given: มีผลที่ submit ไปแล้ว
- When: เรียก `GET /results/:resultId`
- Then: ได้ `breakdown` คำนวณจาก net score ที่เก็บไว้ ค่าต้องตรงกับตอน submit เป๊ะ

**AC4 — Boundary values ถูกต้อง**
- Given: net score = -12, 0, +12
- When: แปลงเป็น %
- Then: ได้ 0%, 50%, 100% แม่นยำ

## Scope
**IN:** persist net score, formula net→%, เพิ่มใน response ของ `POST /test/submit` และ `GET /results/:resultId`
**OUT:** `GET /results` (list), เก็บ 24 คำตอบดิบ

## Decision (2026-11-25)
Rounding: symmetric around 50 (ties away from 50) แทน `Math.round` ตรงๆ — net +3 → 63 / -3 → 37
