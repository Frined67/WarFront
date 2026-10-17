// _worker.js
// หลังบ้านของเว็บ (Cloudflare Pages แบบ advanced mode — ไฟล์เดียวจบ)
// ไฟล์นี้ทำหน้าที่ 2 อย่าง
//   1. /api/config และ /api/chat  -> จัดการเอง
//   2. path อื่น ๆ ทั้งหมด        -> ส่งต่อให้ไฟล์ static (html/css/js/data) ตามปกติ
//
// ค่า key อ่านจาก Environment Variables ของ Cloudflare (ตั้งในหน้า Settings ของโปรเจกต์)
//   GEMINI_API_KEY   (Secret)
//   GEMINI_MODEL     (Text เช่น gemini-3.8-flash)
//   GOOGLE_CLIENT_ID (Text)
// ตอนรันในเครื่องด้วย wrangler จะอ่านจากไฟล์ .dev.vars ให้เอง

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // STEP 1: ส่งค่าที่เปิดเผยได้ให้หน้าเว็บ (Client ID ไม่ใช่ความลับ)
        if (url.pathname === "/api/config") {
            return Response.json({
                googleClientId: env.GOOGLE_CLIENT_ID || "",
                hasGeminiKey: Boolean(env.GEMINI_API_KEY)
            });
        }

        // STEP 2: หน้าแชทยิงคำถามมาที่นี่
        if (url.pathname === "/api/chat" && request.method === "POST") {
            return await askGemini(request, env);
        }

        // STEP 3: ที่เหลือคือไฟล์ปกติของเว็บ
        return env.ASSETS.fetch(request);
    }
};

async function askGemini(request, env) {
    // STEP 1: รับข้อความจากหน้าเว็บ
    const body = await request.json();
    const messages = body.messages || [];
    const vehicleText = body.vehicleText || "";

    if (!env.GEMINI_API_KEY) {
        return Response.json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Cloudflare" }, { status: 500 });
    }

    // STEP 2: บทบาทของ AI — ผู้บัญชาการทหารใน War Thunder
    const systemPrompt =
        "คุณคือ 'ผู้บัญชาการทหาร' (Tactical Commander) ที่ปรึกษาด้านแทคติกของเกม War Thunder " +
        "ตอบเป็นภาษาไทย กระชับ ตรงประเด็น เป็นข้อ ๆ แบบคำสั่งทางทหาร " +
        "ครอบคลุมเรื่องจุดเจาะเกราะที่ควรเล็ง การจัดกระสุน การวางตำแหน่ง การ dogfight และการตั้งค่าปุ่ม " +
        "ถ้าไม่แน่ใจข้อมูลตัวเลข ให้บอกตรง ๆ ว่าให้ไปตรวจสอบที่หน้าวิกิของยานพาหนะคันนั้น " +
        (vehicleText ? "\n\nข้อมูลยานพาหนะที่ผู้ใช้กำลังดูอยู่ (ดึงจาก War Thunder Wiki):\n" + vehicleText : "");

    // STEP 3: แปลงประวัติแชทให้อยู่ในรูปแบบของ Gemini
    const contents = messages.map(function (message) {
        return {
            role: message.role === "ai" ? "model" : "user",
            parts: [{ text: message.text }]
        };
    });

    // STEP 4: เรียก Gemini API
    const model = env.GEMINI_MODEL || "gemini-3.8-flash";
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";

    const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: contents
        })
    });

    const data = await res.json();

    // STEP 5: ส่งเฉพาะข้อความตอบกลับไปให้หน้าเว็บ
    if (!res.ok) {
        const message = data && data.error ? data.error.message : "เรียก Gemini ไม่สำเร็จ";
        return Response.json({ error: message }, { status: res.status });
    }

    let answer = "";
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        data.candidates[0].content.parts.forEach(function (part) {
            if (part.text) answer += part.text;
        });
    }

    return Response.json({ answer: answer || "ผู้บัญชาการยังไม่มีคำตอบให้ในตอนนี้" });
}
