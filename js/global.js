// js/global.js
// ส่วนที่ทุกหน้าใช้ร่วมกัน: เมนูบน, สถานะล็อกอิน Google, และการโหลดไฟล์ข้อมูลจาก data/

// ---------------------------------------------------------------
// ชื่อชาติและชื่อประเภท ใช้แสดงผลเป็นภาษาไทย
// ---------------------------------------------------------------
const NATION_NAME = {
    usa: "สหรัฐอเมริกา",
    germany: "เยอรมนี",
    ussr: "สหภาพโซเวียต",
    britain: "สหราชอาณาจักร",
    japan: "ญี่ปุ่น",
    china: "จีน",
    italy: "อิตาลี",
    france: "ฝรั่งเศส",
    sweden: "สวีเดน",
    israel: "อิสราเอล"
};

const ROLE_NAME = {
    light_tank: "รถถังเบา (Light Tank)",
    medium_tank: "รถถังกลาง (Medium Tank)",
    heavy_tank: "รถถังหนัก (Heavy Tank)",
    tank_destroyer: "รถถังพิฆาต (Tank Destroyer)",
    spaa: "รถต่อสู้อากาศยาน (SPAA)",
    fighter: "เครื่องบินขับไล่ (Fighter)",
    assault: "เครื่องบินโจมตี (Attacker)",
    bomber: "เครื่องบินทิ้งระเบิด (Bomber)",
    strike_aircraft: "เครื่องบินโจมตีภาคพื้น (Strike Aircraft)",
    interceptor: "เครื่องบินสกัดกั้น (Interceptor)"
};

function nationLabel(nation) {
    return NATION_NAME[nation] || nation;
}

function roleLabel(roleId, fallback) {
    return ROLE_NAME[roleId] || fallback || roleId || "ไม่ระบุ";
}

// ---------------------------------------------------------------
// ส่วนล็อกอินด้วย Google (เก็บผู้ใช้ไว้ใน localStorage)
// ---------------------------------------------------------------

// STEP 1: อ่านข้อมูลผู้ใช้ที่ล็อกอินค้างไว้
function getUser() {
    const text = localStorage.getItem("warfront_user");
    if (!text) return null;
    return JSON.parse(text);
}

// STEP 2: Google ส่ง ID token (JWT) กลับมา
//         เราเก็บ token ไว้แนบไปกับทุกคำขอของหลังบ้าน แล้วให้หลังบ้านเป็นคนบอกว่า role อะไร
function handleGoogleLogin(response) {
    const token = response.credential;
    localStorage.setItem("warfront_token", token);

    const parts = token.split(".");
    const json = decodeURIComponent(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
            .split("")
            .map(function (c) {
                return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join("")
    );
    const claims = JSON.parse(json);

    const user = {
        name: claims.name,
        email: claims.email,
        picture: claims.picture,
        role: "user",
        loginAt: new Date().toISOString()
    };
    localStorage.setItem("warfront_user", JSON.stringify(user));

    // ถามหลังบ้านว่าอีเมลนี้มี role อะไร (ถ้าไม่มีหลังบ้านก็ใช้สิทธิ์ผู้ใช้ทั่วไปไป)
    apiFetch("api/auth/login", { method: "POST" })
        .then(function (data) {
            user.role = data.user.role;
            user.name = data.user.name || user.name;
            localStorage.setItem("warfront_user", JSON.stringify(user));
        })
        .catch(function (err) {
            // ไม่เป็นไร เปิดเว็บแบบ static ธรรมดาก็ยังอ่านวิกิได้
        })
        .then(function () {
            location.reload();
        });
}

function getToken() {
    return localStorage.getItem("warfront_token") || "";
}

function isAdmin() {
    const user = getUser();
    return Boolean(user && user.role === "admin");
}

// ตัวกลางเรียกหลังบ้าน: แนบ token ของ Google ให้อัตโนมัติ และโยน error เป็นข้อความไทย
async function apiFetch(path, options) {
    const setting = options || {};
    const headers = setting.headers || {};

    if (getToken()) headers["Authorization"] = "Bearer " + getToken();
    if (setting.body !== undefined) {
        headers["Content-Type"] = "application/json";
        setting.body = JSON.stringify(setting.body);
    }
    setting.headers = headers;

    const res = await fetch(path, setting);

    let data = null;
    try {
        data = await res.json();
    } catch (err) {
        data = null;
    }

    if (!res.ok) {
        throw new Error((data && data.error) || "เรียกหลังบ้านไม่สำเร็จ (" + res.status + ")");
    }
    return data;
}

// STEP 3: หา Google Client ID — ถ้า deploy บน Cloudflare จะได้จาก /api/config
//         ถ้าเปิดเป็นไฟล์ static ธรรมดา จะใช้ค่าใน js/config.js ที่สร้างจาก .env
let serverConfig = null;

async function loadServerConfig() {
    if (serverConfig) return serverConfig;
    try {
        const res = await fetch("api/config");
        if (res.ok) {
            serverConfig = await res.json();
            return serverConfig;
        }
    } catch (err) {
        // ไม่มีหลังบ้าน (เปิดจาก Apache/Live Server เฉย ๆ) ก็ไม่เป็นไร
    }
    serverConfig = { googleClientId: "", hasGeminiKey: false };
    return serverConfig;
}

// STEP 4: สคริปต์ของ Google โหลดแบบ async ตอนเรียกใช้อาจยังมาไม่ถึง
//         ฟังก์ชันนี้จะรอจนกว่าตัวแปร google จะพร้อม (รอไม่เกิน 5 วินาที)
async function waitForGoogle() {
    for (let i = 0; i < 50; i++) {
        if (typeof google !== "undefined" && google.accounts) return true;
        await new Promise(function (ok) {
            setTimeout(ok, 100);
        });
    }
    return false;
}

// STEP 5: วาดปุ่มล็อกอิน หรือชื่อผู้ใช้ ลงในกล่องมุมขวาบนของทุกหน้า
async function drawLoginBox(boxId) {
    const box = document.getElementById(boxId);
    if (!box) return;

    const user = getUser();
    if (user) {
        box.innerHTML =
            '<div class="global_user">' +
            '<img src="' + user.picture + '" alt="" class="global_user-photo">' +
            "<span>" + escapeText(user.name) + "</span>" +
            '<button type="button" class="global_logout" onclick="logoutUser()">ออกจากระบบ</button>' +
            "</div>";
        return;
    }

    box.innerHTML = '<div id="global_gsi"></div>';

    const config = await loadServerConfig();
    const clientId = config.googleClientId || GOOGLE_CLIENT_ID;

    if (!clientId || clientId.indexOf("ใส่-") === 0) {
        box.innerHTML = '<span class="global_login-warn">ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID</span>';
        return;
    }

    const googleReady = await waitForGoogle();
    if (!googleReady) {
        box.innerHTML = '<span class="global_login-warn">โหลดสคริปต์ Google Login ไม่สำเร็จ</span>';
        return;
    }
    google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleLogin
    });
    google.accounts.id.renderButton(document.getElementById("global_gsi"), {
        theme: "filled_black",
        size: "medium",
        text: "signin_with",
        shape: "pill"
    });
}

// ---------------------------------------------------------------
// ตัวช่วยเล็ก ๆ
// ---------------------------------------------------------------

// กันข้อความแปลก ๆ จากวิกิหรือจากผู้ใช้ไม่ให้กลายเป็น HTML
function escapeText(text) {
    if (text === undefined || text === null) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// โหลดรายชื่อยานพาหนะทั้งหมด (ไฟล์เดียว ใช้ทั้งหน้า browse และหน้าแรก)
async function loadIndex() {
    const res = await fetch("data/index.json");
    if (!res.ok) throw new Error("โหลด data/index.json ไม่ได้");
    return await res.json();
}

// โหลดข้อมูลละเอียดของยานพาหนะหนึ่งคัน
// ดูในฐานข้อมูล (คันที่ admin เพิ่ม/แก้เอง) ก่อน ถ้าไม่มีจึงอ่านไฟล์ต้นฉบับจากวิกิใน data/
async function loadVehicle(id) {
    try {
        const data = await apiFetch("api/vehicles/" + encodeURIComponent(id));
        if (data && data.vehicle) return data.vehicle;
    } catch (err) {
        // ไม่มีในฐานข้อมูล หรือไม่มีหลังบ้าน -> ไปอ่านไฟล์ต่อ
    }

    const res = await fetch("data/vehicles/" + id + ".json");
    if (!res.ok) throw new Error("ยังไม่มีข้อมูลละเอียดของคันนี้");
    return await res.json();
}

// โหลดรายการยานพาหนะที่อยู่ในฐานข้อมูล (ใช้เติมในหน้า vehicles.html และหน้าจัดการระบบ)
async function loadDbVehicles(query) {
    const data = await apiFetch("api/vehicles?" + new URLSearchParams(query || {}).toString());
    return data;
}

// วาดแถบเมนูบนให้เหมือนกันทุกหน้า
function drawNavbar(active) {
    const menu = [
        { href: "index.html", text: "หน้าแรก", key: "index" },
        { href: "vehicles.html", text: "ฐานข้อมูลยานพาหนะ", key: "vehicles" },
        { href: "", text: "AI Tactical Commander", key: "chat" }
    ];

    // เมนูจัดการระบบจะโชว์ให้เฉพาะผู้ดูแลระบบ
    if (isAdmin()) {
        menu.push({ href: "admin.html", text: "จัดการระบบ", key: "admin" });
    }

    let html = '<a href="index.html" class="global_brand">WAR<span>FRONT</span></a>';
    html += '<nav class="global_nav">';
    menu.forEach(function (item) {
        const css = item.key === active ? "global_nav-link global_nav-link--active" : "global_nav-link";
        // เมนูจัดการระบบเพิ่มคลาสเด่น ๆ ให้ไม่กลืนหายในหมู่เมนูอื่น ๆ
        const adminCss = item.key === "admin" ? " global_nav-link--admin" : "";
        // ปุ่ม AI ชวนให้กดใช้: เด่นสีและกะพริบแสง
        const aiCss = item.key === "chat" ? " global_nav-link--ai" : "";
        if (item.key === "chat") {
            // ปุ่มนี้ไม่พาไปหน้าใหม่ แต่เปิดกล่องแชทลอยที่อยู่ในทุกหน้า
            html += '<button type="button" class="' + css + adminCss + aiCss + ' global_nav-button" onclick="openChatbox()">' +
                item.text + "</button>";
            return;
        }
        html += '<a href="' + item.href + '" class="' + css + adminCss + '">' + item.text + "</a>";
    });
    html += "</nav>";
    html += '<div id="global_login"></div>';

    document.getElementById("global_header").innerHTML = html;
    drawLoginBox("global_login");
    drawFooter();
}

// วาดท้ายหน้าให้เหมือนกันทุกหน้า: แถบผู้จัดทำแนวนอน + เครดิตวิกิ
function drawFooter() {
    const footer = document.querySelector(".global_footer");
    if (!footer) return;

    footer.innerHTML =
        '<div class="global_author">' +
            '<img class="global_author-photo" src="img/profile.jpg" alt="รูปโปรไฟล์ของปรมินทร์ ปานเจริญ">' +
            '<span class="global_author-name">ปรมินทร์ ปานเจริญ</span>' +
            '<span class="global_author-sep">·</span>' +
            "<span>รหัสนักศึกษา 674295011</span>" +
            '<span class="global_author-sep">·</span>' +
            '<a href="https://www.facebook.com/poramin.pancharoen.2024" target="_blank" rel="noopener">Facebook</a>' +
        "</div>" +
        '<p class="global_footer-note">ข้อมูลยานพาหนะดึงมาจาก ' +
            '<a href="https://wiki.warthunder.com" target="_blank" rel="noopener">War Thunder Wiki</a>' +
            " — โปรเจกต์เพื่อการศึกษา ไม่ได้มีส่วนเกี่ยวข้องกับ Gaijin Entertainment</p>";
}
