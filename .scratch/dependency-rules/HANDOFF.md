# HANDOFF — dependency-rules (Hardening H2)

## Session 2026-11-26 — H2: architecture lint ใต้ TypeScript 7 + rule assessment-not-to-sharing

### สถานะ
- ระยะ 1 + 2 เสร็จแล้ว ยังไม่ commit (พร้อม commit)
- Tests 238 passed (11 files) | `tsc --noEmit` ผ่าน | `lint:deps` exit 0 (61 modules, 151 dependencies)
- sha256 ของ `tsconfig.json` (`63fb8a3b…`) และ `package.json` (`980d87ed…`) ตรงกับค่าเดิม

### ระยะ 1 (ตรวจสอบ)
- dependency-cruiser 18.9.0, typescript 7.0.2, @swc/core 1.16.22
- config ใช้ `parser: "swc"`, `tsPreCompilationDeps: true`, `tsConfig: tsconfig.json`
- warning `missing-tsc-transpiler` ขึ้นเพราะไม่มี tsc รุ่นที่ dependency-cruiser รองรับ แต่ตัว parse จริงคือ swc
- coverage: ไฟล์ใต้ src ถูก cruise ครบทุกไฟล์ (ตอนนั้น 42 ไฟล์ รวม test)
- probe (พี่รันเองด้วย `!`): rule เดิมจับได้ครบทั้ง 6 รูปแบบ และพบช่องโหว่ว่า assessment → sharing ไม่มี rule กันไว้
- ⚠️ `npx depcruise` ใน Git Bash หา binary ของ Bun (`.exe`/`.bunx`) ไม่เจอ เลยไปดาวน์โหลด placeholder `depcruise@1.0.0` จาก npm มารัน (ไม่มี install script, cli.js มีแค่ `console.log`) ห้ามใช้ `npx depcruise` ให้ใช้ `bun run lint:deps` หรือ `bun node_modules/dependency-cruiser/bin/dependency-cruiser.mjs`
  - cache อยู่ที่ `%LOCALAPPDATA%\npm-cache\_npx\a5f588f01cc4cc70\` ยังไม่ได้ลบ

### ระยะ 2 (ไฟล์ที่เปลี่ยน)
- `server/.dependency-cruiser.cjs`: เพิ่ม rule `assessment-not-to-sharing` (error, `^src/assessment/` → `^src/sharing/`) 1 ข้อ ไม่ได้แตะ rule เดิม
- `server/src/dependency-rules.test.ts` (ไฟล์ใหม่ 202 บรรทัด)
  - fixture สร้างด้วย `mkdtemp(os.tmpdir())` ที่ copy `tsconfig.json` ของจริงไปใส่ และ cleanup ใน `afterAll`
  - รัน depcruise ด้วย config จริง ผ่าน `bun <path เต็มของ dependency-cruiser.mjs>` โดยให้ cwd = fixture
  - ใน beforeAll ยืนยันก่อนว่าทุกไฟล์ของ fixture ถูก cruise จริง (กันกรณี "ไม่มี violation" เพราะไฟล์ไม่ถูกตรวจ)
  - เคสทั้งหมด:
    - 5 rule × 8 รูปแบบ = 40 เคส (value, import type, `import { type X }`, `export { x } from`, `export * from`, `export type { X } from`, dynamic `import()`, `.test.ts`)
    - เช็คว่าทุก violation เป็น severity error
    - control 3 เคส: sharing/acl → assessment, sharing → assessment/public, assessment → identity
    - fixture สะอาดต้องมี 0 violation
    - exit code ไม่เป็น 0 แยกทีละ rule (5 เคส) และ fixture สะอาดต้อง exit 0
  - รวม 51 เคส ใช้เวลาราว 1–2 วินาที

### TDD + mutation
- RED (ก่อนเพิ่ม rule): แดง 8 เคส ทั้งหมดเป็น `assessment-not-to-sharing × ทุกรูปแบบ` ผ่าน 39
  (ตอนนั้นยังไม่มีเคส exit code แยกทีละ rule)
- GREEN: ผ่าน 51/51
- Mutation 1 (ลบ rule ใหม่): แดง 9 เคส = 8 รูปแบบ + exit code ของ rule นี้
- Mutation 2 (`identity-not-to-assessment` เปลี่ยนเป็น `warn`): แดง 2 เคส = "every violation is severity error" + exit code ของ rule นี้
- คืนค่า config จาก backup แล้วเช็ค sha256 ตรง ผล `git diff --stat` คือ `.dependency-cruiser.cjs | 8 +` และมีไฟล์ test ใหม่เป็น untracked

### ขั้นต่อไป
1. Review + commit H2
2. (ถ้าต้องการ) ลบ npx cache `a5f588f01cc4cc70`
3. Epic 2 Feature B, Ticket B1 — claim guest result
