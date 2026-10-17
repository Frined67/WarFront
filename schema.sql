-- schema.sql
-- โครงสร้างฐานข้อมูล Cloudflare D1 ของ WarFront
-- สร้างฐานข้อมูลครั้งแรก:
--   npx wrangler d1 create warfront
--   npx wrangler d1 execute warfront --local  --file=./schema.sql
--   npx wrangler d1 execute warfront --remote --file=./schema.sql

-- ตารางผู้ใช้ (สร้างอัตโนมัติตอนล็อกอินด้วย Google ครั้งแรก)
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL DEFAULT '',
    picture       TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'user',   -- 'admin' หรือ 'user'
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
);

-- ตารางยานพาหนะที่แก้ไขได้จากหน้าเว็บ (ของในโฟลเดอร์ data/ เป็นต้นฉบับจากวิกิ อ่านได้เท่านั้น)
CREATE TABLE IF NOT EXISTS vehicles (
    id            TEXT PRIMARY KEY,               -- เช่น us_m4a1
    name          TEXT NOT NULL,
    branch        TEXT NOT NULL DEFAULT 'ground', -- ground | aviation
    nation        TEXT NOT NULL DEFAULT '',
    rank          TEXT NOT NULL DEFAULT '',
    role_id       TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT '',
    br_ab         TEXT NOT NULL DEFAULT '',
    br_rb         TEXT NOT NULL DEFAULT '',
    br_sb         TEXT NOT NULL DEFAULT '',
    icon          TEXT NOT NULL DEFAULT '',
    image         TEXT NOT NULL DEFAULT '',
    wiki          TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    stats_json    TEXT NOT NULL DEFAULT '[]',     -- [{label,value}]
    weapons_json  TEXT NOT NULL DEFAULT '[]',     -- ["..."]
    shells_json   TEXT NOT NULL DEFAULT '[]',     -- [{name,type,penetration:[...]}]
    created_by    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS vehicles_name_index   ON vehicles (name);
CREATE INDEX IF NOT EXISTS vehicles_branch_index ON vehicles (branch, nation);

-- ตารางค่าตั้งของระบบ (เก็บแบบ key/value) ใช้เก็บค่า AI ที่แก้ได้จากหน้า admin
--   ai_provider  = 'gemini' หรือ 'openai_compatible'
--   ai_api_key   = API key ของผู้ให้บริการที่เลือก (ว่าง = ใช้ค่าจาก Environment Variable)
--   ai_model     = ชื่อโมเดล เช่น gemini-3.8-flash หรือ gpt-4o-mini
--   ai_base_url  = ปลายทางของ OpenAI-compatible เช่น https://api.openai.com/v1
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('ai_provider', 'gemini'),
    ('ai_api_key',  ''),
    ('ai_model',    ''),
    ('ai_base_url', 'https://api.openai.com/v1');

-- ผู้ดูแลระบบตั้งต้น (ยังไม่ต้องเคยล็อกอิน ใส่ชื่อไว้ก่อนได้)
INSERT INTO users (email, role) VALUES
    ('674295011@parichat.skru.ac.th', 'admin'),
    ('seree999@gmail.com',            'admin'),
    ('kobsak.na@skru.ac.th',          'admin'),
    ('anaphat.kh@skru.ac.th',         'admin'),
    ('nakool.kh@skru.ac.th',          'admin')
ON CONFLICT(email) DO UPDATE SET role = 'admin';
