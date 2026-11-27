# 🎫 Epic 3 · Ticket C1 — Pagination ของ GET /results + index
Context: Assessment (Supporting) · Event: HistoryViewed · ไม่เพิ่มคำใหม่ใน Glossary
หมายเหตุ: เลขบรรทัดด้านล่างมาจากรายงานตรวจ read-only เมื่อ 27 พ.ย. 2026 ให้ตรวจซ้ำก่อนแก้จริง ถ้าไม่ตรงให้รายงาน

## 📖 User Story
As a ผู้ใช้ที่ login แล้ว
I want ดูประวัติผล test ของตัวเองเป็นหน้าๆ (หน้าละ 10 ผล ใหม่สุดก่อน)
so that ย้อนดูผลเก่าได้เร็ว โดยไม่ต้องโหลดทุกผลในครั้งเดียว

## 🔒 การตัดสินใจที่ล็อกแล้ว (ห้ามเปลี่ยนเอง)
- แก้ GET /results เดิม ไม่เพิ่ม endpoint
- แบบนับหน้า (offset) ขนาดหน้าคงที่ 10 กำหนดที่ server (client กำหนดไม่ได้)
- ORDER BY created_at DESC, id DESC
- page ไม่ส่ง = 1
- page ผิดรูป หรือ > MAX_PAGE (1000) = 400 INVALID_PAGE (validate ด้วย Zod ก่อนถึง DB)
- page เกินหน้าสุดท้าย = 200 items ว่าง
- response: { items, page, pageSize, total, totalPages } (item แต่ละตัวเหมือนเดิม)
- ไม่มีผลเลย: total = 0, totalPages = 0
- นับ total แยก query จากการดึงหน้า และไม่ครอบ transaction (read-only ยอมให้ total คลาดเล็กน้อยได้) ห้ามเปลี่ยนเป็น transaction หรือ window function
- index: (user_id, created_at DESC, id DESC) ผ่าน Drizzle schema + drizzle-kit generate
- หลักฐานว่า index ถูกใช้ = EXPLAIN ด้วยมือ 1 ครั้ง แปะใน HANDOFF (ไม่ใช่ automated test)

## ✅ Acceptance Criteria (Given/When/Then)

การแบ่งหน้า
- AC1: Given user มี 25 ผล / When GET /results (ไม่ส่ง page) / Then 200, items = 10 ผลใหม่สุด, page=1, pageSize=10, total=25, totalPages=3
- AC2: When page=2 และ page=3 / Then ได้ 10 และ 5 ผลตามลำดับ รวมสามหน้าครบ 25 ไม่ซ้ำ ไม่ตกหล่น เรียงต่อเนื่องจากใหม่ไปเก่า
- AC3: Given หลายผลมี created_at เท่ากันและคร่อมรอยต่อหน้า 1/2 / Then เรียงตาม id DESC แน่นอน เปิดทุกหน้าแล้วไม่ซ้ำ ไม่หาย
- AC4: When page เกินหน้าสุดท้าย (เช่น page=4 ของ 25 ผล) / Then 200, items = [], total และ totalPages ยังเป็นค่าจริง
- AC5: Given user ไม่มีผลเลย / Then 200, items = [], total=0, totalPages=0

การป้องกัน input
- AC6: When page เป็น "0", "-1", "abc", "1.5", "1e2", "01", " 1", "" (ค่าว่าง), "99999999999999999999", หรือส่งซ้ำ (?page=1&page=2) / Then 400 INVALID_PAGE รูป error เดียวกับ endpoint อื่น ({ error: { code, message } }) และต้องไม่ใช่ 500
  (รับเฉพาะเลขจำนวนเต็มบวกรูปแบบปกติ ไม่แปลงค่าที่กำกวมให้)
- AC7: When page=1000 / Then 200 · When page=1001 / Then 400 INVALID_PAGE
- AC8: When แนบ ?pageSize=500, ?limit=500 หรือ ?offset=... / Then พารามิเตอร์เหล่านั้นถูกเมิน ได้ไม่เกิน 10 ผล และ pageSize ในผลลัพธ์ยังเป็น 10 (query schema ต้องไม่ strict)

Auth / ความเป็นเจ้าของ
- AC9: Given ไม่มี session / When ส่ง page ผิดหรือถูกก็ตาม / Then 401 เสมอ ไม่ใช่ 400
- AC10: Given Alice มี 25 ผล, Bob มี 7 ผล / Then Bob เห็น total=7 และไม่เห็นผลของ Alice หรือของ guest ในทุกหน้า (total ต้องไม่รั่วจำนวนของคนอื่น)

Contract / Performance
- AC11: item แต่ละตัวยังมีแค่ id, mbtiType, character{name,imageUrl}, createdAt · OpenAPI ประกาศ query page (integer 1–1000, default 1), response 400 และรูป response ใหม่ · POST /results/:resultId/claim response ไม่เปลี่ยน
- AC12: มี index (user_id, created_at DESC, id DESC) ผ่าน migration ถัดไป (คาดว่า 0007) และมีหลักฐาน EXPLAIN ใน HANDOFF

## 🌱 ทำไม
ตอนนี้ endpoint ดึงทุกแถวของ user โดยไม่มี LIMIT และ ORDER BY ไม่มี tiebreak ซึ่งเป็นช่องโหว่ OWASP API4 (Unrestricted Resource Consumption) ที่มีอยู่แล้ว ticket นี้ใส่เพดานด้วยการแบ่งหน้า และเตรียม contract ให้หน้า History ฝั่ง Frontend ใช้

## 🛠️ ทำอะไร (Weight = Supporting)
- Route: เพิ่ม request.query (page) + response 400 (schema error ทำตามแบบ get-result.schema.ts:41-48) + defaultHook ที่ router (list-results.controllers.ts:41) ให้ error ของ query กลายเป็น INVALID_PAGE ตามแบบ get-result.controllers.ts:66-78
- Schema: response เปลี่ยนจาก z.array(ResultListItem) เป็น object { items, page, pageSize, total, totalPages } (list-results.schema.ts:16-20) ห้ามแก้รูป item
- ค่าคงที่ PAGE_SIZE และ MAX_PAGE ตัวเดียวทั้งโปรเจกต์ มี comment บอกเหตุผล (กัน page ตัวเลขใหญ่ล้น bigint จนเกิด 500)
- Service/Repository: query หน้านั้น (LIMIT 10 OFFSET (page-1)*10, ORDER BY created_at DESC, id DESC) + query นับ total ของ user เดียวกัน
  - ก่อนตัด join กับ character ออกจาก query นับ ให้ยืนยันก่อนว่า matched_character_id เป็น NOT NULL จริง ถ้ายืนยันไม่ได้ ให้นับด้วย join เดียวกับ list เพื่อให้ total ตรงกับ items
- Schema DB: เพิ่ม index ใน assessment/repositories/schema.ts (extras array หลัง :87, เพิ่ม index ใน import :2-13) แล้ว generate migration ด้วย db:generate
  - เปิดไฟล์ SQL ที่ generate ดูว่ามี "created_at" DESC และ "id" DESC จริง ถ้าไม่มี ให้รายงาน ห้ามเดา ห้ามแก้มือเงียบๆ
  - db:generate สร้าง ERD ด้วย หลังรันให้ดู git status ว่าไฟล์ไหนเปลี่ยนเพิ่ม แล้วรายงานรายการทั้งหมด
- ถ้ามีไฟล์ openapi.yaml ที่ commit ไว้ ให้ regenerate ตามวิธีของ repo

## 🔴 RED
- test ใหม่ (ไฟล์ list-results.controllers.test.ts):
  - AC1, AC2 (ใช้ 25 แถว)
  - AC3 (ใช้ 12 แถว created_at เดียวกัน เทียบลำดับกับผลของ SQL ORDER BY id DESC ที่ query ใน test เอง ไม่เทียบด้วย JS sort)
  - AC4, AC5
  - AC6 แบบ table-driven ครบทุกค่าที่ระบุ
  - AC7, AC8, AC9, AC10
- test เดิมที่ต้องปรับเพราะ contract เปลี่ยนโดยตั้งใจ: list-results.controllers.test.ts #1, #4, #5, #6, #7, #8 (ปรับ status ["200","400","401","500"] และ parameters ที่มี page) และ claim-result.controllers.test.ts:107-108 (toEqual([body]) → เทียบที่ .items)
- ห้ามลดความเข้มของ assertion เดิม ปรับเฉพาะการเข้าถึง .items และ contract
- test ต้องแดงด้วยเหตุผลที่ถูก ไม่ใช่ syntax error หรือ import พัง

## 🟢 GREEN
เขียนโค้ดน้อยที่สุดให้ test ผ่าน ตามหัวข้อ "ทำอะไร" ด้านบน

## 🔵 REFACTOR
ปรับให้สะอาดโดย test เขียวตลอด ปัญหานอกขอบเขตที่เจอ (เช่น helper badRequest ที่เขียนซ้ำ 3 ไฟล์) ให้จดเป็นข้อสังเกตใน HANDOFF ห้ามแก้เอง

## 🧬 พิสูจน์ด้วย mutation (แก้ทีละจุด รัน test ต้องแดง แล้วย้อนกลับ รันให้เขียว รายงานผลทั้งสามจุด)
1. ลบ id DESC ออกจาก ORDER BY → test AC3 ต้องแดง
2. ขยับขอบ MAX_PAGE ไป ±1 → test AC7 ต้องแดง
3. เอา filter user_id ออกจาก query นับ → test AC10 ต้องแดง

## 🛡️ OWASP API Security Check (เช็คแล้วจดผลใน HANDOFF)
- API1 (BOLA): userId มาจาก session เท่านั้น test เดิม #5 และ #6 ต้องยังผ่าน และ total ต้องไม่รั่วของคนอื่น (AC10)
- API3 (Property Level): item ผ่าน toResultListItem เหมือนเดิม ไม่มี field เพิ่ม
- API4 (Resource Consumption): เพดาน pageSize ที่ server, MAX_PAGE กัน offset ลึกเกินจริง, validate ก่อนถึง DB
- API2/API5: requireAuth เป็นด่านแรก (AC9) ไม่มี role ที่เกี่ยวข้อง
- crAPI Challenge 6: client ห้ามกำหนดจำนวนที่ server ต้องดึงเอง (AC8)

## 📊 หลักฐาน index (ทำด้วยมือ ไม่เป็น automated test)
- ใช้ BEGIN ... ROLLBACK ครอบทั้งหมด ห้ามมีข้อมูลสังเคราะห์หรือ user จำลองค้างใน DB (user จำลองต้องสร้างใน transaction เดียวกัน เพราะ user_id มี FK)
- สร้างข้อมูลด้วย generate_series ให้มีทั้ง user ทั่วไปและ user ที่มีผลหลายพันแถว สั่ง ANALYZE test_result ก่อนทุกครั้ง
- เทียบ EXPLAIN (ANALYZE, BUFFERS) ของ query หน้า 1 ก่อนและหลังมี index (ภายใน transaction เดียวกัน สร้างหรือ drop index ภายใน transaction ได้) สิ่งที่ต้องดู: Index Scan ที่ใช้ index ใหม่ และไม่มี Sort node
- ตารางเล็กอาจยังเลือก Seq Scan แม้มี index ซึ่งไม่ใช่บั๊ก (planner เลือกตามต้นทุน) ถ้าเป็นแบบนั้นให้เพิ่มจำนวนแถวจนเห็นการเปลี่ยนแผน
- แปะลง HANDOFF พร้อมผล SELECT version() และผล \d test_result (หรือ pg_indexes) ที่ยืนยันว่า migration สร้าง index ถูกนิยาม

## 🧱 Scope guard (ห้ามทำ)
- ไม่ทำ cursor pagination, cache, หรือ frontend
- ไม่เปลี่ยนรูป item, ไม่แตะ response ของ claim, ไม่แก้ endpoint อื่น
- ไม่ merge helper badRequest ที่ซ้ำกัน (จดเป็นข้อสังเกตเท่านั้น)
- ไม่เปลี่ยนวิธีนับ total เป็น transaction หรือ window function
- ไม่รัน git commit และไม่ใส่ secret ใน HANDOFF

## 🏁 เสร็จเมื่อ
- test ใหม่ทั้งหมดเขียว และ test เดิมทั้งชุด (รวม claim) เขียว
- mutation ทั้ง 3 จุดพิสูจน์แล้ว
- check ปกติของ repo ผ่าน (test, typecheck, lint, lint:deps)
- migration ถูกตรวจ SQL และหลักฐาน EXPLAIN อยู่ใน HANDOFF
- HANDOFF จดข้อจำกัดที่ยอมรับ: (1) offset อาจซ้ำหรือข้ามถ้ามีผลใหม่แทรกขณะเปิดดู (2) total อาจคลาดเล็กน้อยเพราะนับแยก query (3) user ที่มีผลเกิน 10,000 รายการเปิดหน้าที่เกิน 1,000 ไม่ได้ (ในทางปฏิบัติไม่เกิดที่ ~1,000 users)
- HANDOFF จดข้อสังเกตนอกขอบเขตที่เจอ (เช่น helper badRequest ซ้ำ)

## 🔗 ติดอะไร
- ไม่มี blocker: A3 เสร็จแล้ว (ผลถูกผูก user_id) และ B1 เสร็จแล้ว (claim)
- ที่ตามมา: หน้า History ฝั่ง Frontend จะใช้ contract นี้ · CACHE-1 ไม่เกี่ยว (ห้าม cache ข้อมูลของ user)
