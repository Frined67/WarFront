# WarFront Guide & AI Tactician

สารานุกรมยานพาหนะ War Thunder (รถถัง + อากาศยาน) พร้อมผู้ช่วย AI "ผู้บัญชาการทหาร"
เขียนด้วย **HTML + CSS (Tailwind CDN) + JavaScript ล้วน ไม่มี PHP / MySQL**
มีระบบ CRUD เต็มรูปแบบ (ยานพาหนะ + ผู้ใช้/สิทธิ์ + ค่าตั้ง AI) อยู่บน **Cloudflare D1**
ข้อมูลทั้งหมดดึงจากของจริงที่ <https://wiki.warthunder.com>

## โครงสร้างไฟล์

```
index.html        หน้าแรก (ทางลัดตามประเภท/สัญชาติ)
vehicles.html     ฐานข้อมูลยานพาหนะ + ตัวกรอง
vehicle.html      หน้ารายละเอียดรายคัน (?id=us_m4a1)
admin.html        หน้าจัดการระบบ (CRUD ยานพาหนะ / ผู้ใช้ / ค่าตั้ง AI) เฉพาะ admin
chat.html         ลิงก์เก่า -> เด้งกลับหน้าแรกแล้วเปิดกล่องแชท

css/global.css    สไตล์ที่ใช้ร่วมกันทุกหน้า
css/index.css     สไตล์เฉพาะหน้า index  (คลาสขึ้นต้นด้วย index_)
css/vehicles.css  สไตล์เฉพาะหน้า vehicles
css/vehicle.css   สไตล์เฉพาะหน้า vehicle
css/admin.css     สไตล์เฉพาะหน้า admin   (คลาสขึ้นต้นด้วย admin_)
css/chatbox.css   สไตล์ของกล่องแชท AI แบบลอย (คลาสขึ้นต้น chatbox_)

js/config.js      ค่าคอนฟิกฝั่งเบราว์เซอร์ (สร้างอัตโนมัติจาก .env)
js/global.js      เมนูบน + ระบบล็อกอิน Google + ตัวโหลดข้อมูล
js/chatbox.js     กล่องแชท AI แบบลอย (ปุ่มมุมขวาล่าง + modal) มีอยู่ทุกหน้า
js/index.js       js/vehicles.js   js/vehicle.js   js/admin.js

_worker.js                หลังบ้านทั้งหมด (ล็อกอิน, CRUD, ค่าตั้ง AI, เรียก AI)
schema.sql                โครงสร้างตารางของ D1 + รายชื่อ admin ตั้งต้น
wrangler.toml             ค่าตั้งของ Cloudflare Pages + binding ฐานข้อมูล D1

data/index.json           รายชื่อยานพาหนะทั้งหมดจากวิกิ (2,936 คัน)
data/vehicles/<id>.json   ข้อมูลละเอียดรายคัน (สเปก กระสุน เกราะ คำอธิบาย)

tools/scrape.js           ตัวดึงข้อมูลจากวิกิ
tools/build-config.js     อ่าน .env -> สร้าง js/config.js และ .dev.vars
```

## AI Tactical Commander

กล่องแชทเป็น **ปุ่มลอยมุมขวาล่างที่มีอยู่ทุกหน้า** กดแล้วเปิดเป็น modal กลางจอ
(ปิดด้วยปุ่ม × กดพื้นหลัง หรือกด Esc) ไม่ต้องเปลี่ยนหน้า

- ยังไม่ล็อกอิน -> ใน modal จะขึ้นปุ่ม Sign in with Google ให้ก่อน
- ถ้าเปิดจากหน้า `vehicle.html` ระบบจะแนบสเปก + ตารางการเจาะเกราะของคันนั้น
  ไปให้ AI อัตโนมัติ (แถบบอกบริบทจะโชว์ชื่อคันไว้ใต้หัว modal)
- เมนู "AI Tactical Commander" ด้านบนและปุ่มในหน้าต่าง ๆ ก็สั่งเปิด modal ตัวเดียวกัน

## ระบบ CRUD และสิทธิ์ผู้ใช้

หลังบ้านอยู่ใน `_worker.js` ไฟล์เดียว เก็บข้อมูลที่ **Cloudflare D1** (SQLite)
ทุกคำขอที่ต้องยืนยันตัวตนจะแนบ ID token ของ Google มาในหัว `Authorization: Bearer <token>`
แล้วหลังบ้านส่ง token ไปให้ Google ตรวจอีกรอบ (ไม่เชื่อค่าที่เบราว์เซอร์แกะเอง)

### ตาราง

| ตาราง | ใช้ทำอะไร |
|---|---|
| `users` | ผู้ใช้ + `role` (`admin` / `user`) สร้างอัตโนมัติตอนล็อกอินครั้งแรก |
| `vehicles` | ยานพาหนะที่เพิ่ม/แก้ได้จากหน้าเว็บ (ของใน `data/` เป็นต้นฉบับจากวิกิ อ่านได้เท่านั้น) |
| `settings` | ค่าตั้งของ AI: ผู้ให้บริการ, API key, โมเดล, base URL |

### เส้นทาง API

| วิธี | เส้นทาง | สิทธิ์ | ทำอะไร |
|---|---|---|---|
| POST | `/api/auth/login` | ล็อกอินแล้ว | แลก ID token เป็นข้อมูลผู้ใช้ + role |
| GET | `/api/me` | ล็อกอินแล้ว | ดูข้อมูลและสิทธิ์ของตัวเอง |
| GET | `/api/users` `/api/users/:id` | admin | อ่านรายชื่อผู้ใช้ |
| POST | `/api/users` | admin | เพิ่มอีเมล + ตั้งสิทธิ์ล่วงหน้า |
| PUT | `/api/users/:id` | admin | แก้ชื่อ / เปลี่ยน role |
| DELETE | `/api/users/:id` | admin | ลบผู้ใช้ |
| GET | `/api/vehicles` | ทุกคน | รายการ + ค้นหา/กรอง/แบ่งหน้า (`search` `branch` `nation` `role` `limit` `offset`) |
| GET | `/api/vehicles/:id` | ทุกคน | ยานพาหนะรายคัน |
| POST | `/api/vehicles` | admin | เพิ่มยานพาหนะ |
| PUT | `/api/vehicles/:id` | admin | แก้ไขยานพาหนะ |
| DELETE | `/api/vehicles/:id` | admin | ลบยานพาหนะ |
| GET | `/api/ai-settings` | admin | อ่านค่าตั้ง AI (API key ถูกปิดบังเหลือ 4 ตัวท้าย) |
| PUT | `/api/ai-settings` | admin | บันทึกผู้ให้บริการ / key / โมเดล |
| POST | `/api/chat` | ทุกคน | ถาม AI ผู้บัญชาการ |

### ผู้ดูแลระบบตั้งต้น

5 อีเมลนี้เป็น `admin` อัตโนมัติตั้งแต่ล็อกอินครั้งแรก และปลด/ลบจากหน้าเว็บไม่ได้
(รายชื่ออยู่ทั้งใน `schema.sql` และตัวแปร `ADMIN_EMAILS` ใน `_worker.js` — ถ้าจะเพิ่มคน ต้องแก้ให้ตรงกันทั้งสองที่)

- `674295011@parichat.skru.ac.th`
- `seree999@gmail.com`
- `kobsak.na@skru.ac.th`
- `anaphat.kh@skru.ac.th`
- `nakool.kh@skru.ac.th`

ส่วนคนอื่นที่ยังไม่เคยล็อกอิน ก็ตั้งสิทธิ์ล่วงหน้าได้จากแท็บ "ผู้ใช้และสิทธิ์" ในหน้า `admin.html`

### หน้าจัดการระบบ

เมนู **"จัดการระบบ"** บนแถบบนจะโชว์ให้เฉพาะคนที่ role เป็น `admin` (และหลังบ้านตรวจซ้ำอีกชั้น)
ในหน้ามี 3 แท็บ: **ยานพาหนะ** (ตาราง + ฟอร์มเพิ่ม/แก้/ลบ), **ผู้ใช้และสิทธิ์**, **ตั้งค่า AI**

หน้า `vehicle.html` จะดูในฐานข้อมูลก่อน ถ้าไม่มีจึงอ่านไฟล์ `data/vehicles/<id>.json`
ดังนั้นถ้าเพิ่มคันใหม่ด้วย id ที่ซ้ำกับของวิกิ ข้อมูลในฐานข้อมูลจะถูกใช้แทน

## ตั้งค่า AI จากหน้าเว็บ

แท็บ **ตั้งค่า AI** ให้เลือกผู้ให้บริการด้วยปุ่มวงกลม (radio) 2 ทาง

| ตัวเลือก | เรียกไปที่ | ช่องที่ต้องกรอก |
|---|---|---|
| **Google Gemini** | `generativelanguage.googleapis.com` | API key, ชื่อโมเดล (เช่น `gemini-3.8-flash`) |
| **OpenAI-compatible** | `<base URL>/chat/completions` | API key, ชื่อโมเดล, Base URL |

แบบ OpenAI-compatible ใช้ได้กับ OpenAI, OpenRouter, Groq, Together, LM Studio, Ollama ฯลฯ
(ใส่ Base URL ถึงระดับ `/v1` ระบบจะต่อ `/chat/completions` ให้เอง)

ค่าที่บันทึกในฐานข้อมูลมีความสำคัญกว่าค่าใน Environment Variable
ถ้ายังไม่ได้บันทึก key ไว้ ระบบจะถอยไปใช้ `GEMINI_API_KEY` / `GEMINI_MODEL` ตามเดิม
API key ที่เก็บไว้จะไม่ถูกส่งกลับมาที่เบราว์เซอร์อีก (เห็นแค่ `****1234`)
มีปุ่ม **ทดสอบคุยกับ AI** ให้ยิงคำถามสั้น ๆ เช็กว่าค่าที่ตั้งใช้งานได้จริง

## เรื่อง .env (คำถามที่พบบ่อย)

`.env` **ไม่ได้ใช้ได้เองในเบราว์เซอร์** และโปรเจกต์นี้ไม่มี PHP มาอ่านให้
ที่นี่เลยใช้ `.env` เป็น "แหล่งเก็บ key ที่เดียว" แล้วแจกออกเป็น 2 ทาง:

| ค่า | เป็นความลับไหม | ไปอยู่ที่ไหน |
|---|---|---|
| `GOOGLE_CLIENT_ID` | ไม่ลับ (เปิดเผยได้ตามปกติของ OAuth) | `js/config.js` และ `/api/config` |
| `GEMINI_API_KEY` | **ลับ** | อยู่ที่ Cloudflare เท่านั้น ใช้ใน `functions/api/chat.js` ไม่ถูกส่งไปเบราว์เซอร์ |

### ตั้งค่า Google OAuth

เว็บนี้ใช้ **Google Identity Services (ปุ่ม Sign in with Google แบบ ID token)**
ซึ่งทำงานจบในหน้าเว็บ ไม่มีการ redirect กลับมาที่เซิร์ฟเวอร์ ดังนั้น:

- ต้องตั้ง **Authorized JavaScript origins** ให้ตรงกับที่เปิดเว็บ เช่น
  `http://localhost` (เปิดผ่าน Apache) และ `http://localhost:8788` (ตอนรัน wrangler)
  และโดเมน `https://xxx.pages.dev` ตอน deploy
- **Authorized redirect URIs ไม่ได้ถูกใช้เลย** (ที่ใส่ไว้เป็น
  `.../functions/api/googlecallback.js` จะไม่มีผล ลบทิ้งได้)
- `client_secret` ในไฟล์ JSON ที่โหลดมาจาก Google **ห้ามใส่ลงในโค้ดฝั่งเว็บ**
  วิธีล็อกอินแบบนี้ใช้แค่ Client ID เท่านั้น เก็บไฟล์นั้นไว้นอกโปรเจกต์

### รันในเครื่อง

```bash
cp .env.example .env         # แล้วแก้ค่าใน .env
node tools/build-config.js   # สร้าง js/config.js + .dev.vars
npm install                  # ติดตั้ง wrangler

npx wrangler d1 create warfront               # ครั้งแรกครั้งเดียว -> เอา database_id ไปใส่ wrangler.toml
npm run db:init                               # สร้างตารางในฐานข้อมูลเครื่องตัวเอง
npm run dev                                   # เปิดเว็บพร้อมหลังบ้าน /api/*
```

เปิดด้วย Apache/Live Server เฉย ๆ ก็ได้ อ่านวิกิได้ครบ แต่หน้าแชทกับหน้าจัดการระบบจะใช้ไม่ได้
เพราะไม่มี `/api/*` (ข้อความจะบอกให้รัน wrangler)

### Deploy ขึ้น Cloudflare Pages

วิธีละเอียดทุกแบบ (wrangler / GitHub / หน้าเว็บ Cloudflare), การตั้งค่า D1, env, Google OAuth
และตารางแก้ปัญหา อยู่ในไฟล์ [deploy.md](deploy.md) — ย่อ ๆ คือ:

1. push โค้ดขึ้น GitHub แล้วสร้างโปรเจกต์ Pages (Framework preset: **None**,
   Build command: เว้นว่าง, Output directory: `/`)
2. ไปที่ Settings → **Variables and Secrets** ใส่:
   - `GEMINI_API_KEY` = ใส่เป็น **Secret**
   - `GEMINI_MODEL` = `gemini-3.8-flash`
   - `GOOGLE_CLIENT_ID` = Client ID ของคุณ
3. ไปที่ Settings → **Bindings** → เพิ่ม D1 database binding ชื่อ `DB` ชี้ไปที่ฐานข้อมูล `warfront`
   แล้วสั่ง `npm run db:init:remote` เพื่อสร้างตารางบนฐานข้อมูลจริง
4. ที่ Google Cloud Console ใส่โดเมน Pages (`https://xxx.pages.dev`)
   ลงใน Authorized JavaScript origins
5. ไฟล์ `.env` **ไม่ต้อง** อัปขึ้น (อยู่ใน `.gitignore` แล้ว) — Cloudflare ใช้ค่าจากข้อ 2

## อัปเดตข้อมูลจากวิกิ

```bash
node tools/scrape.js index          # รายชื่อทั้งหมด -> data/index.json
node tools/scrape.js details 200    # ดึงรายละเอียดเพิ่มอีก 200 คัน
node tools/scrape.js details all    # ดึงให้ครบทุกคัน (ใช้เวลานาน)
node tools/scrape.js one us_m4a1    # ดึงเฉพาะคันเดียว
```

สคริปต์จะข้ามคันที่มีไฟล์อยู่แล้ว และเว้นจังหวะยิง request 0.4 วินาที
เพื่อไม่ให้รบกวนเซิร์ฟเวอร์วิกิ

## ที่มาของข้อมูล

ข้อมูลทั้งหมดเป็นของ War Thunder Wiki / Gaijin Entertainment
โปรเจกต์นี้ทำเพื่อการศึกษา ไม่มีส่วนเกี่ยวข้องกับผู้พัฒนาเกม
