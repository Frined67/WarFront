# WarFront Guide & AI Tactician

สารานุกรมยานพาหนะ War Thunder (รถถัง + อากาศยาน) พร้อมผู้ช่วย AI "ผู้บัญชาการทหาร"
HTML + CSS (Tailwind CDN) + JavaScript ล้วน หลังบ้านเป็น Cloudflare Pages Functions + D1 ไม่มี PHP/MySQL

**เว็บจริง:** <https://warfront-4cu.pages.dev> · ข้อมูลยานพาหนะ 2,936 คันดึงจาก <https://wiki.warthunder.com>
**ผู้จัดทำ:** ปรมินทร์ ปานเจริญ (674295011) · [Facebook](https://www.facebook.com/poramin.pancharoen.2024)

## โครงสร้าง

```
index.html vehicles.html vehicle.html   หน้าแรก / ฐานข้อมูล+ตัวกรอง / รายละเอียดรายคัน (?id=us_m4a1)
admin.html                              หน้าจัดการระบบ เฉพาะ admin
_worker.js                              หลังบ้านทั้งหมด: ล็อกอิน, CRUD, ค่าตั้ง AI, เรียก AI
schema.sql wrangler.toml                ตาราง D1 + ค่าตั้ง Pages
css/ js/                                แยกไฟล์ตามหน้า คลาสขึ้นต้นด้วยชื่อหน้า (index_, admin_, chatbox_)
data/index.json data/vehicles/<id>.json ข้อมูลต้นฉบับจากวิกิ (อ่านอย่างเดียว)
tools/scrape.js tools/build-config.js   ดึงข้อมูลจากวิกิ / อ่าน .env สร้าง js/config.js
```

## AI Tactical Commander

ปุ่มลอยมุมขวาล่างมีอยู่ทุกหน้า กดแล้วเปิดเป็น modal (ปิดด้วย × / คลิกพื้นหลัง / Esc)
ต้องล็อกอิน Google ก่อน ถ้าเปิดจากหน้า `vehicle.html` ระบบจะแนบสเปกและตารางการเจาะเกราะของคันนั้นไปให้ AI อัตโนมัติ

## สิทธิ์และ API

ทุกคำขอที่ต้องยืนยันตัวตนแนบ ID token ของ Google มาในหัว `Authorization: Bearer <token>`
แล้วหลังบ้านส่งไปให้ Google ตรวจอีกรอบ ไม่เชื่อค่าที่เบราว์เซอร์แกะเอง

| เส้นทาง | สิทธิ์ | ทำอะไร |
|---|---|---|
| `POST /api/auth/login` · `GET /api/me` | ล็อกอินแล้ว | แลก token เป็นข้อมูลผู้ใช้ + role |
| `GET/POST/PUT/DELETE /api/users[/:id]` | admin | จัดการผู้ใช้และสิทธิ์ |
| `GET /api/vehicles[/:id]` | ทุกคน | รายการ + ค้นหา/กรอง/แบ่งหน้า (`search` `branch` `nation` `role` `limit` `offset`) |
| `POST/PUT/DELETE /api/vehicles[/:id]` | admin | เพิ่ม/แก้/ลบยานพาหนะ |
| `GET/PUT /api/ai-settings` | admin | ค่าตั้ง AI (key ถูกปิดบังเหลือ 4 ตัวท้าย) |
| `POST /api/chat` | ทุกคน | ถาม AI ผู้บัญชาการ |
| `GET /api/chat-test-prompt` · `POST /api/chat-test` | admin | ทดสอบ system prompt โดยไม่กระทบแชทจริง |

ตาราง D1: `users` (สร้างอัตโนมัติตอนล็อกอินครั้งแรก) · `vehicles` (ฉบับแก้ไข ทับไฟล์ใน `data/` ที่ id เดียวกัน ลบแถว = กลับไปใช้ต้นฉบับ) · `settings` (ค่าตั้ง AI)

admin ตั้งต้น 5 อีเมลปลดจากหน้าเว็บไม่ได้ อยู่ทั้งใน `ADMIN_EMAILS` ของ `_worker.js` (ตัวบังคับใช้จริง) และ `schema.sql` — **เพิ่มคนต้องแก้ให้ตรงกันทั้งสองที่**

## หน้าจัดการระบบ

เมนู "จัดการระบบ" โชว์เฉพาะ role `admin` (หลังบ้านตรวจซ้ำอีกชั้น) มี 4 แท็บ:

- **ยานพาหนะ** — ตาราง + ฟอร์มเพิ่ม/แก้/ลบ กดแก้คันต้นฉบับได้ ระบบดึงข้อมูลเดิมมาเติมฟอร์มให้
- **ผู้ใช้และสิทธิ์** — ตั้งสิทธิ์ล่วงหน้าให้คนที่ยังไม่เคยล็อกอินได้
- **ตั้งค่า AI** — เลือก Google Gemini หรือ OpenAI-compatible (OpenAI, OpenRouter, Groq, LM Studio, Ollama — ใส่ Base URL ถึงระดับ `/v1`) ค่าในฐานข้อมูลมาก่อน Environment Variable เสมอ
- **ทดสอบ Chatbot** — กล่องแชทเต็มรูปแบบ แก้ system prompt ที่แผงข้างแล้วคุยทดสอบได้ต่อเนื่อง ไม่กระทบแชทจริง

## รันในเครื่อง

```bash
cp .env.example .env && node tools/build-config.js   # สร้าง js/config.js + .dev.vars
npm install
npm run db:init                                       # สร้างตารางในฐานข้อมูลเครื่องตัวเอง
npm run dev                                           # เปิดที่ :8788 พร้อมหลังบ้าน /api/*
```

เปิดด้วย Apache/Live Server เฉย ๆ ก็อ่านวิกิได้ครบ แต่ล็อกอิน แชท และหน้าจัดการระบบใช้ไม่ได้เพราะไม่มี `/api/*`

`GOOGLE_CLIENT_ID` ไม่ลับ (ไปอยู่ใน `js/config.js`) · `GEMINI_API_KEY` ลับ อยู่ที่ Cloudflare เท่านั้น ไม่ถูกส่งไปเบราว์เซอร์
ล็อกอินใช้ Google Identity Services แบบ ID token จึงตั้งแค่ **Authorized JavaScript origins** (`http://localhost:8788` + โดเมน Pages) ไม่ใช้ redirect URI และไม่ใช้ `client_secret`

## Deploy

```bash
npx wrangler pages deploy . --project-name warfront --branch main
```

ค่าบัญชี/D1/Secret ที่ตั้งไว้แล้ว ขั้นตอน deploy ครั้งแรก และตารางแก้ปัญหา อยู่ใน [deploy.md](deploy.md)

## อัปเดตข้อมูลจากวิกิ

```bash
node tools/scrape.js index          # รายชื่อทั้งหมด -> data/index.json
node tools/scrape.js details all    # ดึงรายละเอียดให้ครบทุกคัน (นาน)
node tools/scrape.js one us_m4a1    # เฉพาะคันเดียว
```

ข้ามคันที่มีไฟล์แล้ว เว้นจังหวะยิง request 0.4 วินาที

## ที่มาของข้อมูล

ข้อมูลทั้งหมดเป็นของ War Thunder Wiki / Gaijin Entertainment โปรเจกต์นี้ทำเพื่อการศึกษา ไม่มีส่วนเกี่ยวข้องกับผู้พัฒนาเกม
