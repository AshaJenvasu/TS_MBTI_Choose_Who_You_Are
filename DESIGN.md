# 🎨 Design System — TS_MBTI_Choose_Who_You_Are!

## 🧭 Style Guide (ทิศทางรวม)
- ธีม: Magic Academy (อารมณ์ Harry Potter) ผสมสไตล์ anime
- Mood: อบอุ่น มีเสน่ห์ลึกลับนิดๆ แต่**ไม่น่ากลัว** — เข้าถึงง่ายสำหรับคนทั่วไปที่ไม่ใช่ hardcore otaku
- หลีกเลี่ยงโทนมืด/goth จ๋าเกินไป เพราะ target กว้าง ไม่ใช่แค่กลุ่ม dark fantasy fan

## 🎨 Color Palette

### Base / Neutral
| Token | ค่า | ใช้ทำอะไร |
| --- | --- | --- |
| `--color-bg` | `#F5EFE0` (ครีมพาร์ชเมนต์) | พื้นหลังหลัก |
| `--color-surface` | `#EDE4CF` | การ์ด/พื้นผิวที่ยกขึ้นมา |
| `--color-text-primary` | `#2B2320` | ข้อความหลัก |
| `--color-text-secondary` | `#6B5D4F` | ข้อความรอง/คำอธิบาย |

### Brand Accent
| Token | ค่า | ใช้ทำอะไร |
| --- | --- | --- |
| `--color-primary` | `#C9A227` (ทองคำ) | ปุ่มหลัก, จุดเด่นเวทมนตร์ |
| `--color-secondary` | `#5B3A8E` (ม่วงเวทมนตร์) | accent รอง, การ์ดพิเศษ |

### Semantic (สถานะ)
| Token | ค่า | ใช้ทำอะไร |
| --- | --- | --- |
| `--color-success` | `#2F6B4F` | สำเร็จ |
| `--color-error` | `#8C2F39` | error state |
| `--color-warning` | `#C97A1A` | เตือน |

### 🏠 House Accent (สำหรับ 16 MBTI types)
⚠️ ยังไม่กำหนดสีแต่ละ type ตายตัวตอนนี้ (รอ content stage) แต่กำหนด**ระบบ**ไว้ล่วงหน้า:

```text
house_accent_hue = (type_index * 22.5) % 360 // 16 types กระจายทั่ว hue wheel เท่าๆกัน
house_accent_color = hsl(house_accent_hue, 55%, 45%)
```

→ ให้สีแต่ละบ้านกระจายสม่ำเสมอ ไม่ต้องเลือกมือทีละสี ลดงานตอนทำจริง + สีไม่ซ้ำ/ไม่ใกล้กันเกินไป

## ✍️ Typography
| Role | Font | หมายเหตุ |
| --- | --- | --- |
| Header/Logo (EN) | `Cinzel` (serif, fantasy) | ใช้เฉพาะคำอังกฤษสั้นๆ เช่น ชื่อบ้าน/โลโก้ |
| Body (TH+EN) | `IBM Plex Sans Thai` | รองรับไทยเต็มรูปแบบ อ่านง่าย ไม่ใช่ font ตกแต่ง |

### Scale

```css
--font-size-h1: 32px
--font-size-h2: 24px
--font-size-h3: 20px
--font-size-body: 16px
--font-size-small: 14px
```

## 📐 Spacing & Layout

```css
--space-1: 4px --space-2: 8px --space-3: 12px
--space-4: 16px --space-5: 24px --space-6: 32px
--space-7: 48px --space-8: 64px
```

- Mobile-first (คนส่วนใหญ่เปิดจากลิงก์แชร์บนมือถือ) → design container max-width 480px บนมือถือ, ขยายเป็น 768px บน tablet+

## 🧩 Design Token (เพิ่มเติม)

```css
--radius-sm: 8px --radius-md: 12px --radius-lg: 16px // โค้งมน เป็นมิตร ไม่เหลี่ยมจัด
--shadow-magic: 0 0 24px rgba(201, 162, 39, 0.4) // เอฟเฟกต์เรืองแสงทอง ใช้ตอน gacha reveal
```

## 🗺️ Grid System
- Mobile: 1 column เต็มความกว้าง, padding 16px ซ้าย-ขวา
- Tablet/Desktop (≥768px): max-width 768px, จัดกึ่งกลางหน้าจอ
