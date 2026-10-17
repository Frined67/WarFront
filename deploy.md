# Deploy — WarFront

หลังบ้านคือ `_worker.js` (Cloudflare Pages advanced mode) + ฐานข้อมูล D1
Apache/Live Server รัน `_worker.js` ไม่ได้ → `/api/*`, ล็อกอิน, `/admin`, แชท ใช้ได้เฉพาะบน Pages หรือ `npm run dev`

## ค่าที่ตั้งไว้แล้ว

| | |
|---|---|
| บัญชี CF | `674295011@parichat.skru.ac.th` |
| `CLOUDFLARE_ACCOUNT_ID` | `7e7620cc1e9df81cadf559af2e2e6d35` |
| Pages project | `warfront` → <https://warfront-4cu.pages.dev> |
| D1 | `warfront` / `c93912c5-7e69-4bba-9689-73cfbcdb9db0` / binding `DB` |
| env | `GOOGLE_CLIENT_ID`, `GEMINI_MODEL` อยู่ใน `[vars]` ของ `wrangler.toml` · `GEMINI_API_KEY` เป็น Secret บน CF |

## คำสั่ง

```bash
export CLOUDFLARE_ACCOUNT_ID=7e7620cc1e9df81cadf559af2e2e6d35

npx wrangler pages deploy . --project-name warfront --branch main   # deploy
npm run dev                                                        # เทสต์ในเครื่อง :8788
npm run db:init / db:init:remote                                   # รัน schema.sql (รันซ้ำได้)
npx wrangler d1 execute warfront --remote --command "SELECT email, role FROM users"
npx wrangler d1 export warfront --remote --output=backup.sql
npx wrangler pages secret put GEMINI_API_KEY --project-name warfront
```

## ตรวจหลัง deploy

```bash
curl -s https://warfront-4cu.pages.dev/api/config   # ต้องได้ hasGeminiKey:true, hasDatabase:true
curl -s https://warfront-4cu.pages.dev/api/users    # ต้องได้ {"error":"ยังไม่ได้ล็อกอิน"}
```

## สิ่งที่ต้องรู้

- สิทธิ์ admin อยู่ 2 ที่ ต้องแก้ให้ตรงกัน: `ADMIN_EMAILS` ใน `_worker.js` (ตัวบังคับใช้จริง) และ `INSERT INTO users` ใน `schema.sql`
- ค่า AI ที่ตั้งจากหน้า `/admin` (ตาราง `settings` ใน D1) มาก่อน env เสมอ รองรับ Gemini และ OpenAI-compatible
- Google OAuth ต้องมี origin ครบ: `https://warfront-4cu.pages.dev`, `http://localhost:8788` — **โดเมนพรีวิวของแต่ละ deploy ล็อกอินไม่ได้** เทสต์ที่โดเมนหลักเท่านั้น
- `.assetsignore` กัน `node_modules`/`tools`/`schema.sql`/เอกสาร ไม่ให้อัปเป็นไฟล์เว็บ
- `vehicles` ใน D1 คือฉบับแก้ไข ทับไฟล์ `data/vehicles/<id>.json` ที่ id เดียวกัน · ลบแถว = กลับไปใช้ไฟล์ต้นฉบับ
- rollback: Dashboard → Deployments → Rollback (ข้อมูลใน D1 ไม่ย้อนตาม)
- แก้ JS แล้วเว็บไม่เปลี่ยน → hard reload (เบราว์เซอร์แคช `js/*.js`)
