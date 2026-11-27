=== TICKET H5 ===
ชื่อ: Hardening H5 — Biome (format + lint) + scripts verify + line ending (Epic 3)
ชนิด: งานเครื่องมือ ห้ามเปลี่ยนพฤติกรรมของโค้ดใดๆ

User Story
As a ผู้พัฒนา, I want ให้มี format และ lint อัตโนมัติพร้อมคำสั่งเดียวที่ตรวจทุกอย่าง, so that โค้ดสไตล์เดียวกัน ข้อผิดพลาดง่ายๆ ถูกจับเร็ว และ "เสร็จ" มีนิยามเดียวที่ทั้งคนและ Claude Code ใช้ร่วมกัน

ที่มา: รายงาน H5 Phase 0 (ESLint+typescript-eslint ใช้กับ TS 7.0.2 ไม่ได้ ส่วน Biome 2.6.9 ไม่พึ่ง TypeScript, recommended 0 error / 59 warning, format ครั้งแรกแตะ 36/57 ไฟล์ ~673 บรรทัด, Biome กับ Prettier ให้ผลตรงกัน)

การตัดสินใจที่ล็อกแล้ว (ห้ามเปลี่ยนเอง ถ้าติดปัญหาจริงให้หยุดรายงานพร้อมหลักฐาน)
1. เครื่องมือ: @biomejs/biome ติดตั้งเป็น devDependency ใน server/ แบบ exact version (ใช้เวอร์ชันล่าสุดตอนติดตั้ง ถ้าไม่ใช่ 2.6.9 ให้รายงาน) ห้ามติดตั้งแพ็กเกจอื่น ห้ามอัปเกรดแพ็กเกจเดิม
2. config ที่ server/biome.json เขียนด้วยไวยากรณ์ของเวอร์ชันที่ติดตั้ง ห้ามใช้ "recommended": true แบบที่เลิกใช้แล้ว ต้องไม่มี deprecation warning หรือ config error
   - ขอบเขตไฟล์: src/**, vitest.config.ts, drizzle.config.ts
   - ยกเว้น: drizzle/**, bun.lock, .env*, .dependency-cruiser.cjs, node_modules
   - สไตล์: indent 2 space, double quote, semicolon always, trailing comma all, arrow parens always, lineWidth 100, lineEnding lf
   - ปิดการเรียง import อัตโนมัติ (organizeImports/assist) เพื่อให้ commit format เป็น format ล้วน
   - กฎ lint: recommended + noFloatingPromises เป็น error ทั้ง production และ test; noExplicitAny และ noNonNullAssertion เป็น error ใน production และปิดใน **/*.test.ts (ใช้ overrides)
3. scripts ใน server/package.json: check = biome check (อ่านอย่างเดียว) · check:fix = biome check --write · typecheck = tsc --noEmit · verify = รัน check → typecheck → lint:deps → test ต่อกัน หยุดทันทีที่ขั้นใดล้ม
4. .gitattributes ที่ราก repo: * text=auto eol=lf · .editorconfig ที่ราก repo: root=true, utf-8, LF, indent 2 space, ตัดช่องว่างท้ายบรรทัด, newline ท้ายไฟล์ ยกเว้นให้ไม่บังคับใน drizzle/** (SQL 2 ไฟล์ที่ drizzle-kit สร้างไม่มี newline ท้ายไฟล์) ตรวจว่า .editorconfig กับ biome.json ไม่ขัดกัน
5. 12 จุด `!` (noNonNullAssertion) ใน production: ตรวจทีละจุด ถ้าปลอดภัยจริงใส่ biome-ignore พร้อมเหตุผลที่เขียนกำกับ ถ้าไม่ปลอดภัยให้รายงานเป็น finding ห้ามแก้พฤติกรรมใน ticket นี้
6. commit แยก 4 ก้อน (ผู้ใช้ commit เอง) ① config+scripts+.gitattributes+.editorconfig (ยังไม่ format) ② format ล้วน ③ biome-ignore และแก้ตามที่ lint เจอ ④ .git-blame-ignore-revs (Phase D สั่งแยกภายหลังเมื่อมี hash)

นอกขอบเขต: CI (ticket CI-1), git hook, ESLint, format ไฟล์ .md/generated/.scratch, เปลี่ยนพฤติกรรมโค้ด, แก้ `!` ที่ไม่ปลอดภัย, อัปเกรด dependency อื่น, Phase D

Acceptance Criteria
AC1 Biome ติดตั้ง exact, biome.json ถูกต้องตามเวอร์ชัน ไม่มี deprecation warning
AC2 bun run check จบด้วย exit 0 และ 0 error 0 warning (หลัง Phase C)
AC3 commit format ล้วน: ไฟล์ที่เปลี่ยนทุกไฟล์ "เทียบเท่าทาง AST" กับ HEAD (ไม่นับ whitespace, ชนิด quote, วงเล็บ/คอมมาที่ไม่เปลี่ยนความหมาย), test 351 ผ่านเท่าเดิม, tsc exit 0, lint:deps ไม่มี violation และจำนวน modules/deps เท่าเดิม, OpenAPI document sha256 ตรง 5277437e9f910da58bea2d4e4d176aa56ff097444e3a96e9a414b3542b3eee7c
AC4 noFloatingPromises: รายงานจำนวนที่เจอ จัดการให้เหลือ 0 (แก้หรือรายงานเป็น finding) และพิสูจน์ว่ากฎกัดจริงด้วยโค้ดชั่วคราว (promise ที่ไม่ await) ที่ทำให้ check ล้ม แล้วย้อนกลับ
AC5 ตารางทั้ง 12 จุด `!`: ไฟล์:บรรทัด | โค้ด | ปลอดภัยไหม | เหตุผล | การกระทำ
AC6 ไฟล์ generated และ .scratch ไม่ถูกแก้ (ยืนยันด้วย sha256 ก่อน-หลัง) ยกเว้น package.json และ bun.lock ที่เพิ่ม Biome
AC7 scripts ครบ และ verify ล้มจริงเมื่อมีขั้นใดล้ม (พิสูจน์ด้วยกรณีชั่วคราวแล้วย้อนกลับ)
AC8 line ending: ไฟล์ .ts ในขอบเขตเป็น LF ทั้งหมดใน working tree (git ls-files --eol) ไม่มี mixed
=== END TICKET ===

## สถานะ (อัปเดต 2026-11-27, Phase D)
- [x] AC1 ติดตั้ง Biome 2.6.9 exact และ `biome.json` ใช้ `preset` ไม่มี deprecation warning
- [x] AC2 `bun run check` exit 0, 0 error 0 warning (หลังก้อน ③)
- [x] AC3 format ล้วน: AST เทียบเท่า 37/37 (control 7/7), test 351, tsc 0, lint:deps 77/222, OpenAPI `5277437e…` ตรง
- [x] AC4 `noFloatingPromises`: เจอ 0 จุดใน repo, canary จับเคส async ที่ไม่ await ได้ (รวมข้ามไฟล์) · ข้อจำกัด: ไม่จับ Drizzle builder และ thenable class (จดใน CLAUDE.md และ HANDOFF)
- [x] AC5 ตาราง 12 จุด `!` อยู่ใน HANDOFF
- [x] AC6 ไฟล์ generated, `.scratch`, `docs`, `.claude` ไม่ถูกแก้ใน ①–③ (เทียบ sha256 แล้ว) ยกเว้น `package.json` และ `bun.lock`
- [x] AC7 มี scripts ครบ และ `verify` หยุดที่ขั้นที่ล้มจริง (Phase A ล้มที่ check โดยไม่รันขั้นถัดไป)
- [x] AC8 ไฟล์ .ts ในขอบเขตทั้ง 59 ไฟล์เป็น `w/lf`
- ส่วนที่เบี่ยงจากแผนเดิม: `fake-google.ts:129` (`get("state")!`) ตอนแรกจะรายงานเป็น finding อย่างเดียว แต่ผู้ใช้เลือกตัวเลือก B ให้แก้ด้วย `if (state === null) throw …` ในก้อน ③ และพิสูจน์ด้วย M3 แล้ว
- commit: ① `2872419` ② `27af46c` ③ `01a123f` ④ รอผู้ใช้
