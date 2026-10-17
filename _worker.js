// _worker.js
// หลังบ้านของเว็บ (Cloudflare Pages แบบ advanced mode — ไฟล์เดียวจบ)
// ไฟล์นี้ทำหน้าที่ 3 อย่าง
//   1. /api/config และ /api/chat            -> จัดการเอง
//   2. /api/auth/login /api/me /api/users /api/vehicles -> ระบบ CRUD บนฐานข้อมูล D1
//   3. path อื่น ๆ ทั้งหมด                   -> ส่งต่อให้ไฟล์ static (html/css/js/data) ตามปกติ
//
// ค่า key อ่านจาก Environment Variables ของ Cloudflare (ตั้งในหน้า Settings ของโปรเจกต์)
//   GEMINI_API_KEY   (Secret)
//   GEMINI_MODEL     (Text เช่น gemini-3.8-flash)
//   GOOGLE_CLIENT_ID (Text)
// ฐานข้อมูลผูกไว้ที่ binding ชื่อ DB (ดู wrangler.toml และ schema.sql)
// ตอนรันในเครื่องด้วย wrangler จะอ่านจากไฟล์ .dev.vars ให้เอง

// อีเมลที่เป็นผู้ดูแลระบบตั้งต้น — ล็อกอินครั้งแรกก็ได้ role admin ทันที
const ADMIN_EMAILS = [
    "674295011@parichat.skru.ac.th",
    "seree999@gmail.com",
    "kobsak.na@skru.ac.th",
    "anaphat.kh@skru.ac.th",
    "nakool.kh@skru.ac.th"
];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // STEP 1: ส่งค่าที่เปิดเผยได้ให้หน้าเว็บ (Client ID ไม่ใช่ความลับ)
        if (url.pathname === "/api/config") {
            return Response.json({
                googleClientId: env.GOOGLE_CLIENT_ID || "",
                hasGeminiKey: Boolean(env.GEMINI_API_KEY),
                hasDatabase: Boolean(env.DB)
            });
        }

        // STEP 2: หน้าแชทยิงคำถามมาที่นี่
        if (url.pathname === "/api/chat" && request.method === "POST") {
            return await askAI(request, env);
        }

        // STEP 3: เส้นทางของระบบ CRUD ทั้งหมดขึ้นต้นด้วย /api/
        if (url.pathname.indexOf("/api/") === 0) {
            try {
                return await handleApi(request, env, url);
            } catch (err) {
                return Response.json({ error: "เกิดข้อผิดพลาดในหลังบ้าน: " + err.message }, { status: 500 });
            }
        }

        // STEP 4: ที่เหลือคือไฟล์ปกติของเว็บ
        return env.ASSETS.fetch(request);
    }
};

// ===============================================================
// ส่วนที่ 1: ตัวช่วยเล็ก ๆ
// ===============================================================

function badRequest(message, status) {
    return Response.json({ error: message }, { status: status || 400 });
}

// ตัดช่องว่างหัวท้ายและกันค่า undefined/null ไม่ให้หลุดลงฐานข้อมูล
function text(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
}

// เก็บลิสต์/ออบเจ็กต์ลง D1 เป็นข้อความ JSON
function jsonText(value, fallback) {
    if (value === undefined || value === null) return fallback;
    return JSON.stringify(value);
}

function parseJson(value, fallback) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch (err) {
        return fallback;
    }
}

// แปลงแถวในตาราง vehicles ให้มีรูปร่างเหมือนไฟล์ data/vehicles/<id>.json
// หน้าเว็บเดิม (js/vehicle.js) จะใช้ข้อมูลจากทั้งสองที่ได้โดยไม่ต้องแก้วิธีอ่าน
function vehicleRowToObject(row) {
    return {
        id: row.id,
        name: row.name,
        branch: row.branch,
        branchLabel: row.branch === "aviation" ? "Aviation" : "Ground vehicles",
        nation: row.nation,
        rank: row.rank,
        roleId: row.role_id,
        role: row.role,
        br: { AB: row.br_ab, RB: row.br_rb, SB: row.br_sb },
        icon: row.icon,
        image: row.image,
        wiki: row.wiki,
        description: row.description,
        stats: parseJson(row.stats_json, []),
        weapons: parseJson(row.weapons_json, []),
        shells: parseJson(row.shells_json, []),
        hasDetail: true,
        source: "database",
        createdBy: row.created_by,
        updated: row.updated_at
    };
}

// ===============================================================
// ส่วนที่ 2: ตรวจสอบว่าใครเป็นคนยิง request มา
// ===============================================================

// หน้าเว็บแนบ ID token ของ Google มาในหัว Authorization: Bearer <token>
// เราส่งไปให้ Google ตรวจให้ (ปลอดภัยกว่าการแกะ JWT เองในเบราว์เซอร์)
async function verifyGoogleToken(request, env) {
    const header = request.headers.get("Authorization") || "";
    if (header.indexOf("Bearer ") !== 0) return null;

    const token = header.slice(7);
    if (!token) return null;

    const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token));
    if (!res.ok) return null;

    const info = await res.json();

    // ต้องเป็น token ที่ออกให้เว็บของเราเท่านั้น และอีเมลต้องยืนยันแล้ว
    if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID) return null;
    if (info.email_verified !== "true" && info.email_verified !== true) return null;
    if (!info.email) return null;

    return {
        email: String(info.email).toLowerCase(),
        name: info.name || info.email,
        picture: info.picture || ""
    };
}

// หาแถวผู้ใช้ในฐานข้อมูล ถ้ายังไม่มีก็สร้างให้ (ล็อกอินครั้งแรก)
async function findOrCreateUser(env, account) {
    const startRole = ADMIN_EMAILS.indexOf(account.email) >= 0 ? "admin" : "user";

    await env.DB.prepare(
        "INSERT INTO users (email, name, picture, role, last_login_at) VALUES (?, ?, ?, ?, datetime('now')) " +
        "ON CONFLICT(email) DO UPDATE SET name = ?, picture = ?, last_login_at = datetime('now')"
    ).bind(account.email, account.name, account.picture, startRole, account.name, account.picture).run();

    // อีเมลในลิสต์ ADMIN_EMAILS ให้เป็น admin เสมอ แม้แถวจะถูกสร้างไว้ก่อนแล้ว
    if (startRole === "admin") {
        await env.DB.prepare("UPDATE users SET role = 'admin' WHERE email = ?").bind(account.email).run();
    }

    return await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(account.email).first();
}

// ใช้ก่อนทุกงานที่ต้องล็อกอิน: คืนแถวผู้ใช้ หรือ null ถ้าไม่ผ่าน
async function currentUser(request, env) {
    const account = await verifyGoogleToken(request, env);
    if (!account) return null;
    return await findOrCreateUser(env, account);
}

function publicUser(row) {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        picture: row.picture,
        role: row.role,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at
    };
}

// ===============================================================
// ส่วนที่ 3: ตัวแยกเส้นทางของ /api/*
// ===============================================================

async function handleApi(request, env, url) {
    if (!env.DB) {
        return badRequest("ยังไม่ได้ผูกฐานข้อมูล D1 (binding ชื่อ DB) ดูวิธีตั้งค่าใน README", 503);
    }

    // ตัด "/api/" ออก แล้วแยกเป็นชิ้น ๆ เช่น ["vehicles", "us_m4a1"]
    const parts = url.pathname.slice(5).split("/").filter(function (part) {
        return part !== "";
    });
    const section = parts[0] || "";
    const itemId = parts[1] ? decodeURIComponent(parts[1]) : "";
    const method = request.method;

    // ---- ล็อกอิน: หน้าเว็บส่ง ID token มาแลกข้อมูลผู้ใช้ + role ----
    if (section === "auth" && parts[1] === "login" && method === "POST") {
        const account = await verifyGoogleToken(request, env);
        if (!account) return badRequest("ตรวจสอบการล็อกอินกับ Google ไม่ผ่าน", 401);
        const row = await findOrCreateUser(env, account);
        return Response.json({ user: publicUser(row) });
    }

    // ---- ดูข้อมูลตัวเองและ role ของตัวเอง ----
    if (section === "me" && method === "GET") {
        const user = await currentUser(request, env);
        if (!user) return badRequest("ยังไม่ได้ล็อกอิน", 401);
        return Response.json({ user: publicUser(user) });
    }

    if (section === "ai-settings") return await handleAiSettings(request, env, method);
    if (section === "chat-test" && method === "POST") return await handleChatTest(request, env);
    if (section === "chat-test-prompt" && method === "GET") return await handleChatTestPrompt(request, env);
    if (section === "users") return await handleUsers(request, env, method, itemId);
    if (section === "vehicles") return await handleVehicles(request, env, url, method, itemId);

    return badRequest("ไม่มีเส้นทางนี้ในหลังบ้าน", 404);
}

// ===============================================================
// ส่วนที่ 4: CRUD ของตาราง users (เฉพาะ admin)
// ===============================================================

async function handleUsers(request, env, method, itemId) {
    const me = await currentUser(request, env);
    if (!me) return badRequest("ยังไม่ได้ล็อกอิน", 401);
    if (me.role !== "admin") return badRequest("ต้องเป็นผู้ดูแลระบบเท่านั้น", 403);

    // READ: รายชื่อผู้ใช้ทั้งหมด
    if (method === "GET" && !itemId) {
        const result = await env.DB.prepare("SELECT * FROM users ORDER BY role, email").all();
        return Response.json({ users: result.results.map(publicUser) });
    }

    // READ: ผู้ใช้รายคน
    if (method === "GET" && itemId) {
        const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(itemId).first();
        if (!row) return badRequest("ไม่พบผู้ใช้คนนี้", 404);
        return Response.json({ user: publicUser(row) });
    }

    // CREATE: เพิ่มอีเมลไว้ล่วงหน้า (ตั้ง role ก่อนเจ้าตัวจะล็อกอินครั้งแรกได้)
    if (method === "POST" && !itemId) {
        const body = await request.json();
        const email = text(body.email).toLowerCase();
        const role = body.role === "admin" ? "admin" : "user";
        if (email.indexOf("@") < 0) return badRequest("กรุณากรอกอีเมลให้ถูกต้อง");

        const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (exists) return badRequest("มีอีเมลนี้ในระบบอยู่แล้ว", 409);

        await env.DB.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, ?)")
            .bind(email, text(body.name), role).run();

        const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        return Response.json({ user: publicUser(row) }, { status: 201 });
    }

    // UPDATE: แก้ชื่อหรือเปลี่ยน role
    if (method === "PUT" && itemId) {
        const body = await request.json();
        const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(itemId).first();
        if (!row) return badRequest("ไม่พบผู้ใช้คนนี้", 404);

        const role = body.role === "admin" ? "admin" : "user";

        // กันพลาด 2 ข้อ: ปลด admin ของตัวเอง และปลด admin ที่ตั้งไว้ในโค้ด
        if (role !== "admin" && row.id === me.id) {
            return badRequest("ปลดสิทธิ์ผู้ดูแลของตัวเองไม่ได้", 400);
        }
        if (role !== "admin" && ADMIN_EMAILS.indexOf(row.email) >= 0) {
            return badRequest("อีเมลนี้ถูกตั้งเป็นผู้ดูแลระบบไว้ในโค้ด ปลดสิทธิ์ไม่ได้", 400);
        }

        const name = body.name === undefined ? row.name : text(body.name);
        await env.DB.prepare("UPDATE users SET name = ?, role = ? WHERE id = ?").bind(name, role, row.id).run();

        const updated = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(row.id).first();
        return Response.json({ user: publicUser(updated) });
    }

    // DELETE: ลบผู้ใช้
    if (method === "DELETE" && itemId) {
        const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(itemId).first();
        if (!row) return badRequest("ไม่พบผู้ใช้คนนี้", 404);
        if (row.id === me.id) return badRequest("ลบบัญชีของตัวเองไม่ได้", 400);
        if (ADMIN_EMAILS.indexOf(row.email) >= 0) {
            return badRequest("อีเมลนี้ถูกตั้งเป็นผู้ดูแลระบบไว้ในโค้ด ลบไม่ได้", 400);
        }

        await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(row.id).run();
        return Response.json({ ok: true });
    }

    return badRequest("คำสั่งนี้ใช้กับ /api/users ไม่ได้", 405);
}

// ===============================================================
// ส่วนที่ 5: CRUD ของตาราง vehicles
//   อ่าน (GET) เปิดให้ทุกคน / เพิ่ม-แก้-ลบ ต้องเป็น admin
// ===============================================================

async function handleVehicles(request, env, url, method, itemId) {
    // READ: รายการยานพาหนะในฐานข้อมูล + ตัวกรองและแบ่งหน้า
    if (method === "GET" && !itemId) {
        const search = text(url.searchParams.get("search")).toLowerCase();
        const branch = text(url.searchParams.get("branch"));
        const nation = text(url.searchParams.get("nation"));
        const roleId = text(url.searchParams.get("role"));

        let limit = parseInt(url.searchParams.get("limit") || "50", 10);
        if (isNaN(limit) || limit < 1) limit = 50;
        if (limit > 200) limit = 200;

        let offset = parseInt(url.searchParams.get("offset") || "0", 10);
        if (isNaN(offset) || offset < 0) offset = 0;

        // ต่อเงื่อนไข WHERE เท่าที่ผู้ใช้กรอกมา (ใช้ ? เสมอ กัน SQL injection)
        let where = "WHERE 1 = 1";
        const values = [];
        if (search) {
            where += " AND (lower(name) LIKE ? OR lower(id) LIKE ?)";
            values.push("%" + search + "%", "%" + search + "%");
        }
        if (branch) {
            where += " AND branch = ?";
            values.push(branch);
        }
        if (nation) {
            where += " AND nation = ?";
            values.push(nation);
        }
        if (roleId) {
            where += " AND role_id = ?";
            values.push(roleId);
        }

        const counted = await env.DB.prepare("SELECT COUNT(*) AS total FROM vehicles " + where).bind(...values).first();
        const result = await env.DB.prepare(
            "SELECT * FROM vehicles " + where + " ORDER BY updated_at DESC LIMIT ? OFFSET ?"
        ).bind(...values, limit, offset).all();

        return Response.json({
            total: counted.total,
            limit: limit,
            offset: offset,
            vehicles: result.results.map(vehicleRowToObject)
        });
    }

    // READ: รายคัน (หน้า vehicle.html เรียกเส้นนี้ก่อน ถ้าไม่มีจึงไปอ่านไฟล์ใน data/)
    if (method === "GET" && itemId) {
        const row = await env.DB.prepare("SELECT * FROM vehicles WHERE id = ?").bind(itemId).first();
        if (!row) return badRequest("ไม่มียานพาหนะคันนี้ในฐานข้อมูล", 404);
        return Response.json({ vehicle: vehicleRowToObject(row) });
    }

    // ตั้งแต่บรรทัดนี้ลงไปต้องเป็น admin
    const me = await currentUser(request, env);
    if (!me) return badRequest("ยังไม่ได้ล็อกอิน", 401);
    if (me.role !== "admin") return badRequest("ต้องเป็นผู้ดูแลระบบเท่านั้น", 403);

    // CREATE
    if (method === "POST" && !itemId) {
        const body = await request.json();
        const id = text(body.id).toLowerCase().replace(/[^a-z0-9_\-]/g, "_");
        if (!id) return badRequest("กรุณากรอกรหัสยานพาหนะ (id) เช่น us_m4a1");
        if (!text(body.name)) return badRequest("กรุณากรอกชื่อยานพาหนะ");

        const exists = await env.DB.prepare("SELECT id FROM vehicles WHERE id = ?").bind(id).first();
        if (exists) return badRequest("มีรหัสนี้ในฐานข้อมูลอยู่แล้ว", 409);

        await env.DB.prepare(
            "INSERT INTO vehicles (id, name, branch, nation, rank, role_id, role, br_ab, br_rb, br_sb, " +
            "icon, image, wiki, description, stats_json, weapons_json, shells_json, created_by) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(...vehicleValues(body, id), me.email).run();

        const row = await env.DB.prepare("SELECT * FROM vehicles WHERE id = ?").bind(id).first();
        return Response.json({ vehicle: vehicleRowToObject(row) }, { status: 201 });
    }

    // UPDATE
    if (method === "PUT" && itemId) {
        const body = await request.json();
        const row = await env.DB.prepare("SELECT * FROM vehicles WHERE id = ?").bind(itemId).first();
        if (!row) return badRequest("ไม่พบยานพาหนะคันนี้", 404);
        if (!text(body.name)) return badRequest("กรุณากรอกชื่อยานพาหนะ");

        const values = vehicleValues(body, row.id);
        await env.DB.prepare(
            "UPDATE vehicles SET name = ?, branch = ?, nation = ?, rank = ?, role_id = ?, role = ?, " +
            "br_ab = ?, br_rb = ?, br_sb = ?, icon = ?, image = ?, wiki = ?, description = ?, " +
            "stats_json = ?, weapons_json = ?, shells_json = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(...values.slice(1), row.id).run();

        const updated = await env.DB.prepare("SELECT * FROM vehicles WHERE id = ?").bind(row.id).first();
        return Response.json({ vehicle: vehicleRowToObject(updated) });
    }

    // DELETE
    if (method === "DELETE" && itemId) {
        const row = await env.DB.prepare("SELECT id FROM vehicles WHERE id = ?").bind(itemId).first();
        if (!row) return badRequest("ไม่พบยานพาหนะคันนี้", 404);

        await env.DB.prepare("DELETE FROM vehicles WHERE id = ?").bind(itemId).run();
        return Response.json({ ok: true });
    }

    return badRequest("คำสั่งนี้ใช้กับ /api/vehicles ไม่ได้", 405);
}

// เรียงค่าที่จะยัดลงฐานข้อมูลให้ตรงลำดับคอลัมน์ของทั้ง INSERT และ UPDATE
function vehicleValues(body, id) {
    const br = body.br || {};
    return [
        id,
        text(body.name),
        body.branch === "aviation" ? "aviation" : "ground",
        text(body.nation),
        text(body.rank),
        text(body.roleId),
        text(body.role),
        text(br.AB),
        text(br.RB),
        text(br.SB),
        text(body.icon),
        text(body.image),
        text(body.wiki),
        text(body.description),
        jsonText(body.stats, "[]"),
        jsonText(body.weapons, "[]"),
        jsonText(body.shells, "[]")
    ];
}

// ===============================================================
// ส่วนที่ 6: ค่าตั้งของ AI (API key / โมเดล / ผู้ให้บริการ) — เฉพาะ admin
// ===============================================================

// อ่านค่าตั้งทั้งหมดจากตาราง settings ออกมาเป็นออบเจ็กต์เดียว
async function readSettings(env) {
    const value = { ai_provider: "gemini", ai_api_key: "", ai_model: "", ai_base_url: "" };
    if (!env.DB) return value;
    try {
        const result = await env.DB.prepare("SELECT key, value FROM settings").all();
        result.results.forEach(function (row) {
            value[row.key] = row.value;
        });
    } catch (err) {
        // ยังไม่ได้สร้างตาราง (ยังไม่รัน schema.sql) ก็ใช้ค่าจาก Environment Variable ไปก่อน
    }
    return value;
}

async function writeSetting(env, key, value, email) {
    await env.DB.prepare(
        "INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime('now')) " +
        "ON CONFLICT(key) DO UPDATE SET value = ?, updated_by = ?, updated_at = datetime('now')"
    ).bind(key, value, email, value, email).run();
}

// ปิดบัง API key ก่อนส่งกลับหน้าเว็บ เหลือให้เห็นแค่ 4 ตัวท้ายพอให้รู้ว่าใส่ค่าไหนไว้
function maskKey(key) {
    if (!key) return "";
    if (key.length <= 4) return "****";
    return "****" + key.slice(-4);
}

async function handleAiSettings(request, env, method) {
    const me = await currentUser(request, env);
    if (!me) return badRequest("ยังไม่ได้ล็อกอิน", 401);
    if (me.role !== "admin") return badRequest("ต้องเป็นผู้ดูแลระบบเท่านั้น", 403);

    // READ: ส่งค่าปัจจุบันไปให้ฟอร์ม (ไม่ส่ง API key ตัวจริงกลับไป)
    if (method === "GET") {
        const settings = await readSettings(env);
        return Response.json({
            settings: {
                provider: settings.ai_provider || "gemini",
                model: settings.ai_model || "",
                baseUrl: settings.ai_base_url || "",
                apiKeyMasked: maskKey(settings.ai_api_key),
                hasApiKey: Boolean(settings.ai_api_key),
                envGeminiKey: Boolean(env.GEMINI_API_KEY),
                envGeminiModel: env.GEMINI_MODEL || ""
            }
        });
    }

    // UPDATE: บันทึกค่าที่แก้จากหน้า admin
    if (method === "PUT") {
        const body = await request.json();
        const provider = body.provider === "openai_compatible" ? "openai_compatible" : "gemini";

        await writeSetting(env, "ai_provider", provider, me.email);
        await writeSetting(env, "ai_model", text(body.model), me.email);
        await writeSetting(env, "ai_base_url", text(body.baseUrl), me.email);

        // ส่ง apiKey มาเป็นค่าว่าง = ไม่เปลี่ยน / ส่งคำว่า clear = ล้างค่าออก
        const apiKey = text(body.apiKey);
        if (apiKey === "clear") {
            await writeSetting(env, "ai_api_key", "", me.email);
        } else if (apiKey !== "") {
            await writeSetting(env, "ai_api_key", apiKey, me.email);
        }

        const settings = await readSettings(env);
        return Response.json({
            settings: {
                provider: settings.ai_provider,
                model: settings.ai_model,
                baseUrl: settings.ai_base_url,
                apiKeyMasked: maskKey(settings.ai_api_key),
                hasApiKey: Boolean(settings.ai_api_key)
            }
        });
    }

    return badRequest("คำสั่งนี้ใช้กับ /api/ai-settings ไม่ได้", 405);
}

// ===============================================================
// ส่วนที่ 7: กล่องแชท AI "ผู้บัญชาการทหาร"
//   ค่าที่ใช้มาจากตาราง settings ก่อน ถ้าว่างจึงถอยไปใช้ Environment Variable
// ===============================================================

async function askAI(request, env) {
    // STEP 1: รับข้อความจากหน้าเว็บ
    const body = await request.json();
    const messages = body.messages || [];
    const vehicleText = body.vehicleText || "";

    // STEP 2: บทบาทของ AI — ผู้บัญชาการทหารใน War Thunder
    const systemPrompt = defaultSystemPrompt(vehicleText);

    // STEP 3: ดูว่าผู้ดูแลตั้งให้ใช้ผู้ให้บริการไหน
    const settings = await readSettings(env);

    if (settings.ai_provider === "openai_compatible") {
        return await askOpenAiCompatible(settings, systemPrompt, messages);
    }
    return await askGemini(env, settings, systemPrompt, messages);
}

// บทบาทมาตรฐานของ AI (ใช้ร่วมกันทั้ง /api/chat และ /api/chat-test)
function defaultSystemPrompt(vehicleText) {
    return "คุณคือ 'ผู้บัญชาการทหาร' (Tactical Commander) ที่ปรึกษาด้านแทคติกของเกม War Thunder " +
        "ตอบเป็นภาษาไทย กระชับ ตรงประเด็น เป็นข้อ ๆ แบบคำสั่งทางทหาร " +
        "ครอบคลุมเรื่องจุดเจาะเกราะที่ควรเล็ง การจัดกระสุน การวางตำแหน่ง การ dogfight และการตั้งค่าปุ่ม " +
        "ถ้าไม่แน่ใจข้อมูลตัวเลข ให้บอกตรง ๆ ว่าให้ไปตรวจสอบที่หน้าวิกิของยานพาหนะคันนั้น " +
        (vehicleText ? "\n\nข้อมูลยานพาหนะที่ผู้ใช้กำลังดูอยู่ (ดึงจาก War Thunder Wiki):\n" + vehicleText : "");
}

// ดึง prompt มาตรฐานออกมาให้ผู้ดูแลแก้ในแท็บทดสอบ (ไม่เปลี่ยนค่าอะไรในฐานข้อมูล)
async function handleChatTestPrompt(request, env) {
    const me = await currentUser(request, env);
    if (!me) return badRequest("ยังไม่ได้ล็อกอิน", 401);
    if (me.role !== "admin") return badRequest("ต้องเป็นผู้ดูแลระบบเท่านั้น", 403);
    return Response.json({ prompt: defaultSystemPrompt("") });
}

// ทดสอบ chatbot: ผู้ดูแลกรอก system prompt + บทสนทนาเอง แล้วยิงไปหาผู้ให้บริการที่ตั้งไว้อยู่แล้ว
// ใช้ตรวจว่า prompt ที่แก้แล้วให้คำตอบออกมายังไง โดยไม่กระทบแชทจริงของหน้าเว็บ
async function handleChatTest(request, env) {
    const me = await currentUser(request, env);
    if (!me) return badRequest("ยังไม่ได้ล็อกอิน", 401);
    if (me.role !== "admin") return badRequest("ต้องเป็นผู้ดูแลระบบเท่านั้น", 403);

    const body = await request.json();

    // รับได้ทั้งแบบส่งบทสนทนาทั้งชุด (messages) และแบบส่งคำถามเดียว (question)
    let messages = [];
    if (Array.isArray(body.messages)) {
        body.messages.forEach(function (message) {
            const value = text(message && message.text);
            if (value) {
                messages.push({ role: message.role === "ai" ? "ai" : "user", text: value });
            }
        });
    } else {
        const question = text(body.question);
        if (question) messages.push({ role: "user", text: question });
    }

    if (!messages.length) return badRequest("กรุณากรอกคำถามที่ต้องการทดสอบ", 400);

    const systemPrompt = text(body.systemPrompt) || defaultSystemPrompt("");
    const settings = await readSettings(env);

    if (settings.ai_provider === "openai_compatible") {
        return await askOpenAiCompatible(settings, systemPrompt, messages);
    }
    return await askGemini(env, settings, systemPrompt, messages);
}

// ---- ทางที่ 1: Google Gemini ----
async function askGemini(env, settings, systemPrompt, messages) {
    const apiKey = settings.ai_api_key || env.GEMINI_API_KEY || "";
    if (!apiKey) {
        return Response.json({ error: "ยังไม่ได้ตั้งค่า API key ของ Gemini (ตั้งได้ที่หน้าจัดการระบบ)" }, { status: 500 });
    }

    const model = settings.ai_model || env.GEMINI_MODEL || "gemini-3.8-flash";
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";

    // แปลงประวัติแชทให้อยู่ในรูปแบบของ Gemini
    const contents = messages.map(function (message) {
        return {
            role: message.role === "ai" ? "model" : "user",
            parts: [{ text: message.text }]
        };
    });

    const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: contents
        })
    });

    const data = await res.json();

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

// ---- ทางที่ 2: OpenAI-compatible (OpenAI, OpenRouter, Groq, LM Studio, Ollama ฯลฯ) ----
async function askOpenAiCompatible(settings, systemPrompt, messages) {
    const apiKey = settings.ai_api_key || "";
    const model = settings.ai_model || "gpt-4o-mini";

    // ตัด / ท้าย url ออก แล้วต่อ /chat/completions ตามมาตรฐานของ OpenAI
    let baseUrl = (settings.ai_base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
    if (!apiKey) {
        return Response.json({ error: "ยังไม่ได้ตั้งค่า API key ของผู้ให้บริการ (ตั้งได้ที่หน้าจัดการระบบ)" }, { status: 500 });
    }

    // แปลงประวัติแชทให้อยู่ในรูปแบบของ OpenAI
    const chat = [{ role: "system", content: systemPrompt }];
    messages.forEach(function (message) {
        chat.push({
            role: message.role === "ai" ? "assistant" : "user",
            content: message.text
        });
    });

    const res = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
        },
        body: JSON.stringify({ model: model, messages: chat })
    });

    const data = await res.json();

    if (!res.ok) {
        const message = data && data.error ? (data.error.message || data.error) : "เรียก AI ไม่สำเร็จ";
        return Response.json({ error: String(message) }, { status: res.status });
    }

    let answer = "";
    if (data.choices && data.choices[0] && data.choices[0].message) {
        answer = data.choices[0].message.content || "";
    }

    return Response.json({ answer: answer || "ผู้บัญชาการยังไม่มีคำตอบให้ในตอนนี้" });
}
