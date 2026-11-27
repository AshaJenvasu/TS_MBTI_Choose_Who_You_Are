=== TICKET H4 ===
ชื่อ: Hardening H4 — รวมตัวสร้าง error body และ hook ที่ซ้ำ (Epic 3)
ชนิด: refactor ล้วน พฤติกรรมภายนอกต้องเหมือนเดิมทุกอย่าง

User Story
As a ผู้ดูแล API, I want ให้ body ของ error ทุกตัวถูกสร้างจากที่เดียว, so that รูปร่างและข้อความ error คงที่ทั้งระบบ และแก้ครั้งเดียวไม่ต้องไล่แก้หลายไฟล์

ที่มา: รายงาน H4 Phase 0 พบ body รูป {error:{code,message}} เขียน 5 แบบ (badRequest ซ้ำทุกตัวอักษรใน get-result และ claim-result, INVALID_PAGE_BODY, invalidAnswers, UNAUTHORIZED_BODY ใน identity, body 404 inline ซ้ำ 2 ที่) และ hook ของ get-result กับ claim-result ตรรกะเดียวกัน

การตัดสินใจที่ล็อกแล้ว (ห้ามเปลี่ยนเอง)
1. errorBody เป็น generic วางใน src/errors.ts: ลายเซ็นตั้งต้น errorBody<C extends string>(code: C, message: string) คืน { error: { code: C; message: string } } (เก็บชนิด literal ของ code) errors.ts ห้ามรู้จัก code ของ context ใดๆ ถ้าลายเซ็นนี้ใช้ไม่ได้จริงให้บอกเหตุผลพร้อมหลักฐานก่อนเปลี่ยน
2. hook ของ get-result และ claim-result (ตรรกะเดียวกัน: target header → AUTH_REQUIRED, อย่างอื่น → INVALID_RESULT_ID) รวมไปไว้ในไฟล์ร่วมใต้ src/assessment/ พร้อมค่าคงที่ message AUTH_REQUIRED และ body 404 RESULT_NOT_FOUND ที่ซ้ำ 2 ที่ ตั้งชื่อไฟล์ตามธรรมเนียมของ repo และรายงานเหตุผล ห้ามวางไว้ใน errors.ts (เพราะเป็นศัพท์ของ assessment)
3. hook ของ list-results และ submit-test อยู่ที่เดิม (ตรรกะต่างกัน) แค่เปลี่ยนไปสร้าง body ผ่าน errorBody
4. UNAUTHORIZED_BODY ใน identity/middleware/require-auth.ts คงชื่อ export และค่าเดิม แต่สร้างผ่าน errorBody
5. 415 ของ POST /test/submit เป็น Known gap นอกขอบเขต ห้ามแก้ ห้ามเขียน test ล็อก

นอกขอบเขต (ห้ามแตะ)
- status code, error code, ข้อความ, ลำดับการตรวจ (query → param → header → body)
- Zod error schema และชื่อ component ใน OpenAPI (InvalidGetResultRequestResponse, ResultNotFoundResponse, InvalidPageResponse, InvalidAnswersResponse ฯลฯ)
- 415, ตรรกะของ INVALID_ANSWERS (ยังสร้าง message จาก Zod issue แรกเหมือนเดิม)
- ห้ามจัด format ของบรรทัดที่ไม่เกี่ยว (formatter เป็นอีก ticket) ห้ามเพิ่ม dependency ห้ามแก้ test เดิม (ถ้าต้องแก้ ให้หยุดและรายงานเหตุผล)
- เก็บ line ending เดิมของทุกไฟล์ที่แก้

Acceptance Criteria
AC1 (ล็อกของเดิม) Given API ปัจจุบัน When ยิงทุกเคส error ที่ระบุในตาราง B ของรายงาน Phase 0 รวมช่องโหว่ข้อ C (claim ที่ param ผิดพร้อม header หาย) Then status และ body ตรงกับของเดิมเป๊ะ: ข้อความที่เราเขียนเองล็อกตัวอักษร ข้อความที่มาจาก Zod ล็อกแค่ code + รูปร่าง (keys เท่ากับ ["error"] และ error มี code กับ message เท่านั้น)
AC2 (helper) Given errorBody When เรียกด้วย code และ message Then ได้ object ที่มีเฉพาะ {error:{code,message}} (ไม่มี field เกิน) และชนิดของ code เป็น literal
AC3 (ไม่ซ้ำ) Given โค้ด production Then ไม่มีการเขียน literal { error: { code: ... } } มือใน controller/middleware อีก (ยกเว้น errors.ts และไฟล์ร่วมใน assessment) ยืนยันด้วย git grep และแสดงผล
AC4 (hook ร่วม) Given get-result และ claim-result Then ใช้ hook ตัวเดียวกันจากไฟล์ร่วม และผลทุกเคสใน AC1 ไม่เปลี่ยน
AC5 (ไม่เปลี่ยน contract) Given OpenAPI document ที่ app สร้าง Then ก่อนและหลัง refactor เหมือนกันทุก byte (เทียบ sha256)
AC6 (ไม่ echo input) Given POST /test/submit ที่ส่งค่าผิดที่มีข้อความเฉพาะตัว (marker) When ได้ 400 INVALID_ANSWERS Then body ไม่มี marker นั้น (ถ้า test นี้แดงบนโค้ดเดิม ให้หยุดและรายงานเป็น finding ห้ามแก้ใน ticket นี้)
AC7 (type-safety) Given route ที่ประกาศ code เป็น literal When handler คืน errorBody ด้วย code ที่ไม่ตรง Then tsc --noEmit ต้องแดง (พิสูจน์ด้วยการลองจริงชั่วคราวแล้วย้อนกลับ ถ้า tsc ไม่แดงให้รายงานตรงๆ ห้ามอ้างว่าจับได้)
AC8 (สถาปัตยกรรมและเช็กท้าย) bun run test เขียวหมด, tsc --noEmit exit 0, bun run lint:deps ไม่มี violation (จำนวน module เพิ่มได้ตามไฟล์ใหม่ รายงานตัวเลข) และ circular เป็น 0
OWASP: API8 (Security Misconfiguration: รูปแบบ error สม่ำเสมอ ไม่รั่วรายละเอียดภายใน) และ API3 (ไม่มี property เกินใน error body)
=== END TICKET ===
