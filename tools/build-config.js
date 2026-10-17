// tools/build-config.js
// อ่านค่า key ทั้งหมดจากไฟล์ .env แล้วสร้างไฟล์ js/config.js ให้หน้าเว็บใช้
//
// วิธีใช้:  node tools/build-config.js
//
// หมายเหตุสำคัญ: ทุกอย่างใน js/config.js จะถูกส่งไปที่เบราว์เซอร์ผู้ใช้
// จึงเขียนเฉพาะค่าที่เปิดเผยได้เท่านั้น (GOOGLE_CLIENT_ID, GEMINI_MODEL)
// ส่วน GEMINI_API_KEY จะไปอยู่ใน .dev.vars / Cloudflare Secret ซึ่งอยู่ฝั่งเซิร์ฟเวอร์อย่างเดียว

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// STEP 1: อ่านไฟล์ .env
const envFile = path.join(ROOT, ".env");
if (!fs.existsSync(envFile)) {
    console.log("ไม่พบไฟล์ .env — ให้คัดลอกจาก .env.example ก่อน");
    process.exit(1);
}
const envText = fs.readFileSync(envFile, "utf8");

// STEP 2: แปลงแต่ละบรรทัด KEY=VALUE เก็บไว้ในออบเจ็กต์
const env = {};
envText.split("\n").forEach(function (line) {
    const text = line.trim();
    if (text === "" || text.startsWith("#")) return;
    const at = text.indexOf("=");
    if (at < 0) return;
    const key = text.slice(0, at).trim();
    const value = text.slice(at + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = value;
});

// STEP 3: เตือนถ้ายังไม่ได้ใส่ค่าที่จำเป็น
["GOOGLE_CLIENT_ID", "GEMINI_API_KEY"].forEach(function (key) {
    if (!env[key] || env[key].indexOf("ใส่-") === 0) {
        console.log("เตือน: ยังไม่ได้ตั้งค่า " + key + " ใน .env");
    }
});

// STEP 4: เขียนไฟล์ js/config.js
const config =
    "// js/config.js — ไฟล์นี้ถูกสร้างอัตโนมัติจาก .env โดย tools/build-config.js\n" +
    "// อย่าแก้ไฟล์นี้ตรง ๆ ให้ไปแก้ที่ .env แล้วสั่ง node tools/build-config.js ใหม่\n\n" +
    "const GOOGLE_CLIENT_ID = " + JSON.stringify(env.GOOGLE_CLIENT_ID || "") + ";\n" +
    "const GEMINI_MODEL = " + JSON.stringify(env.GEMINI_MODEL || "gemini-3.8-flash") + ";\n" +
    "const WIKI_SOURCE = " + JSON.stringify(env.WIKI_SOURCE || "https://wiki.warthunder.com") + ";\n";

fs.writeFileSync(path.join(ROOT, "js", "config.js"), config);
console.log("สร้าง js/config.js จาก .env เรียบร้อย");

// STEP 5: สร้าง .dev.vars ให้ wrangler (ตอนรัน Cloudflare Pages ในเครื่อง)
//         ไฟล์นี้คือ .env เวอร์ชันของฝั่งเซิร์ฟเวอร์ Cloudflare จะอ่านเอง
const devVars =
    "GOOGLE_CLIENT_ID=" + (env.GOOGLE_CLIENT_ID || "") + "\n" +
    "GEMINI_API_KEY=" + (env.GEMINI_API_KEY || "") + "\n" +
    "GEMINI_MODEL=" + (env.GEMINI_MODEL || "gemini-3.8-flash") + "\n";
fs.writeFileSync(path.join(ROOT, ".dev.vars"), devVars);
console.log("สร้าง .dev.vars สำหรับ wrangler เรียบร้อย");
