# WarFront Guide & AI Tactician

สารานุกรมยานพาหนะ War Thunder (รถถัง + อากาศยาน) พร้อมผู้ช่วย AI "ผู้บัญชาการทหาร"
เขียนด้วย **HTML + CSS (Tailwind CDN) + JavaScript ล้วน ไม่มี PHP / MySQL**
ข้อมูลทั้งหมดดึงจากของจริงที่ <https://wiki.warthunder.com>

## โครงสร้างไฟล์

```
index.html        หน้าแรก (ทางลัดตามประเภท/สัญชาติ)
vehicles.html     ฐานข้อมูลยานพาหนะ + ตัวกรอง
vehicle.html      หน้ารายละเอียดรายคัน (?id=us_m4a1)
chat.html         ลิงก์เก่า -> เด้งกลับหน้าแรกแล้วเปิดกล่องแชท

css/global.css    สไตล์ที่ใช้ร่วมกันทุกหน้า
css/index.css     สไตล์เฉพาะหน้า index  (คลาสขึ้นต้นด้วย index_)
css/vehicles.css  สไตล์เฉพาะหน้า vehicles
css/vehicle.css   สไตล์เฉพาะหน้า vehicle
css/chatbox.css   สไตล์ของกล่องแชท AI แบบลอย (คลาสขึ้นต้น chatbox_)

js/config.js      ค่าคอนฟิกฝั่งเบราว์เซอร์ (สร้างอัตโนมัติจาก .env)
js/global.js      เมนูบน + ระบบล็อกอิน Google + ตัวโหลดข้อมูล
js/chatbox.js     กล่องแชท AI แบบลอย (ปุ่มมุมขวาล่าง + modal) มีอยู่ทุกหน้า
js/index.js       js/vehicles.js   js/vehicle.js

functions/api/chat.js     หลังบ้านเรียก Gemini (Cloudflare Pages Function)
functions/api/config.js   ส่ง GOOGLE_CLIENT_ID ให้หน้าเว็บ

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
npx wrangler pages dev .     # เปิดเว็บพร้อมหลังบ้าน /api/chat
```

เปิดด้วย Apache/Live Server เฉย ๆ ก็ได้ อ่านวิกิได้ครบ แต่หน้าแชทจะใช้ไม่ได้
เพราะไม่มี `/api/chat` (ข้อความจะบอกให้รัน wrangler)

### Deploy ขึ้น Cloudflare Pages

1. push โค้ดขึ้น GitHub แล้วสร้างโปรเจกต์ Pages (Framework preset: **None**,
   Build command: เว้นว่าง, Output directory: `/`)
2. ไปที่ Settings → **Variables and Secrets** ใส่:
   - `GEMINI_API_KEY` = ใส่เป็น **Secret**
   - `GEMINI_MODEL` = `gemini-3.8-flash`
   - `GOOGLE_CLIENT_ID` = Client ID ของคุณ
3. ที่ Google Cloud Console ใส่โดเมน Pages (`https://xxx.pages.dev`)
   ลงใน Authorized JavaScript origins
4. ไฟล์ `.env` **ไม่ต้อง** อัปขึ้น (อยู่ใน `.gitignore` แล้ว) — Cloudflare ใช้ค่าจากข้อ 2

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
