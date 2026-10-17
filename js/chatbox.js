// js/chatbox.js
// AI Tactical Commander แบบลอยอยู่ทุกหน้า
// - ปุ่มกลมมุมขวาล่าง กดแล้วเปิดเป็น modal เต็มจอกลางหน้า
// - ต้องล็อกอิน Google ก่อนถึงจะพิมพ์ได้ (ส่วนวิกิอ่านได้ปกติ)
// - ถ้าอยู่หน้า vehicle.html จะดึงสเปกคันนั้นแนบไปเป็นบริบทให้ AI อัตโนมัติ

const chatboxMessages = [];   // ประวัติการคุยในรอบนี้
let chatboxVehicleText = "";  // ข้อมูลยานพาหนะที่กำลังดูอยู่
let chatboxVehicleName = "";
let chatboxReady = false;     // วาด modal แล้วหรือยัง

const CHATBOX_QUICK = [
    "เจอกับ Tiger I ตัวต่อตัว ควรยิงตรงไหน?",
    "เครื่องบินพลังงานต่ำควร Dogfight ยังไง?",
    "ขอวิธีตั้งค่าปุ่มสำหรับพลปืน",
    "เล่นรถถังเบาควรวางตำแหน่งยังไงช่วงต้นเกม?"
];

// ---------------------------------------------------------------
// STEP 1: วาดปุ่มลอยและโครง modal ลงในทุกหน้า
// ---------------------------------------------------------------
function drawChatbox() {
    const holder = document.createElement("div");
    holder.innerHTML =
        '<button type="button" class="chatbox_fab" id="chatbox_fab">' +
        '<span class="chatbox_fab-dot"></span>' +
        '<span class="chatbox_fab-label">AI TACTICAL<span>COMMANDER</span></span>' +
        "</button>" +

        '<div class="chatbox_overlay hidden" id="chatbox_overlay">' +
        '<div class="chatbox_modal">' +

        '<div class="chatbox_header">' +
        '<div class="chatbox_badge">★</div>' +
        "<div>" +
        '<div class="chatbox_header-title">AI TACTICAL COMMANDER</div>' +
        '<div class="chatbox_header-sub">ที่ปรึกษาแทคติกประจำสนามรบ · War Thunder</div>' +
        "</div>" +
        '<button type="button" class="chatbox_close" id="chatbox_close">×</button>' +
        "</div>" +

        '<div class="chatbox_context hidden" id="chatbox_context"></div>' +

        '<div class="chatbox_log" id="chatbox_log"></div>' +

        '<div class="chatbox_foot hidden" id="chatbox_foot">' +
        '<div class="chatbox_quick" id="chatbox_quick"></div>' +
        '<form class="chatbox_form" id="chatbox_form">' +
        '<input type="text" id="chatbox_input" class="chatbox_input" autocomplete="off" ' +
        'placeholder="พิมพ์คำถามถึงผู้บัญชาการ เช่น เล่น M4A1 เจอ Panther ต้องทำยังไง">' +
        '<button type="submit" id="chatbox_send" class="chatbox_send">ส่ง</button>' +
        "</form>" +
        '<div class="chatbox_status" id="chatbox_status"></div>' +
        "</div>" +

        "</div></div>";

    document.body.appendChild(holder);

    // ผูกปุ่มเปิด/ปิด
    document.getElementById("chatbox_fab").addEventListener("click", openChatbox);
    document.getElementById("chatbox_close").addEventListener("click", closeChatbox);
    document.getElementById("chatbox_overlay").addEventListener("click", function (event) {
        if (event.target.id === "chatbox_overlay") closeChatbox();
    });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeChatbox();
    });

    // ปุ่มคำถามสำเร็จรูป
    let quickHtml = "";
    CHATBOX_QUICK.forEach(function (question) {
        quickHtml += '<button type="button" class="chatbox_quick-item">' + escapeText(question) + "</button>";
    });
    document.getElementById("chatbox_quick").innerHTML = quickHtml;
    document.querySelectorAll(".chatbox_quick-item").forEach(function (button) {
        button.addEventListener("click", function () {
            askCommander(button.textContent);
        });
    });

    // ฟอร์มพิมพ์คำถาม
    document.getElementById("chatbox_form").addEventListener("submit", function (event) {
        event.preventDefault();
        const input = document.getElementById("chatbox_input");
        const question = input.value.trim();
        if (question === "") return;
        input.value = "";
        askCommander(question);
    });
}

// ---------------------------------------------------------------
// STEP 2: เปิด modal — เช็กล็อกอินก่อนเสมอ
// ---------------------------------------------------------------
function openChatbox() {
    document.getElementById("chatbox_overlay").classList.remove("hidden");

    const user = getUser();
    const log = document.getElementById("chatbox_log");
    const foot = document.getElementById("chatbox_foot");

    if (!user) {
        // ยังไม่ล็อกอิน: โชว์ปุ่ม Sign in with Google
        foot.classList.add("hidden");
        log.innerHTML =
            '<div class="chatbox_lock">' +
            '<div class="chatbox_lock-title">ต้องล็อกอินด้วย Google ก่อนใช้งาน</div>' +
            '<p class="chatbox_lock-text">ส่วนวิกิเปิดให้อ่านได้ทุกคน ' +
            "แต่การขอคำปรึกษาจากผู้บัญชาการต้องยืนยันตัวตนก่อน</p>" +
            '<div class="chatbox_lock-box" id="chatbox_login"></div>' +
            "</div>";
        drawLoginBox("chatbox_login");
        return;
    }

    foot.classList.remove("hidden");

    // ทักทายครั้งแรกครั้งเดียว
    if (chatboxMessages.length === 0) {
        addChatboxMessage("ai",
            "รายงานตัว! ผมคือผู้บัญชาการประจำสนาม " + user.name.split(" ")[0] +
            "\nถามมาได้เลย ไม่ว่าจะเป็นจุดเจาะเกราะ การจัดกระสุน แนวทาง dogfight หรือการตั้งค่าปุ่ม");
    }
    document.getElementById("chatbox_input").focus();
}

function closeChatbox() {
    const overlay = document.getElementById("chatbox_overlay");
    if (overlay) overlay.classList.add("hidden");
}

// ---------------------------------------------------------------
// STEP 3: เพิ่มข้อความลงในกล่อง
// ---------------------------------------------------------------
function addChatboxMessage(role, text) {
    chatboxMessages.push({ role: role, text: text });

    const log = document.getElementById("chatbox_log");
    const css = role === "ai" ? "chatbox_bubble chatbox_bubble--ai" : "chatbox_bubble chatbox_bubble--me";
    const who = role === "ai" ? "ผู้บัญชาการ" : "คุณ";

    log.innerHTML +=
        '<div class="' + css + '">' +
        '<div class="chatbox_who">' + who + "</div>" +
        escapeText(text) +
        "</div>";
    log.scrollTop = log.scrollHeight;
}

// ---------------------------------------------------------------
// STEP 4: ส่งคำถามไปที่หลังบ้าน (functions/api/chat.js)
// ---------------------------------------------------------------
async function askCommander(question) {
    if (!getUser()) {
        openChatbox();
        return;
    }
    addChatboxMessage("me", question);

    const log = document.getElementById("chatbox_log");
    const status = document.getElementById("chatbox_status");
    const sendButton = document.getElementById("chatbox_send");

    // แสดงจุดสามจุดระหว่างรอคำตอบ
    log.innerHTML +=
        '<div class="chatbox_bubble chatbox_bubble--ai" id="chatbox_wait">' +
        '<div class="chatbox_who">ผู้บัญชาการ</div>' +
        '<div class="chatbox_typing"><span></span><span></span><span></span></div></div>';
    log.scrollTop = log.scrollHeight;

    status.textContent = "กำลังประเมินสถานการณ์...";
    sendButton.disabled = true;

    try {
        const res = await fetch("api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: chatboxMessages,
                vehicleText: chatboxVehicleText
            })
        });

        if (res.status === 404) {
            throw new Error("ยังไม่มีหลังบ้าน api/chat — ต้องรันด้วย npx wrangler pages dev . หรือ deploy ขึ้น Cloudflare Pages ก่อน");
        }

        const data = await res.json();
        document.getElementById("chatbox_wait").remove();
        if (data.error) throw new Error(data.error);

        addChatboxMessage("ai", data.answer);
        status.textContent = "";
    } catch (err) {
        const wait = document.getElementById("chatbox_wait");
        if (wait) wait.remove();
        status.textContent = "เกิดข้อผิดพลาด: " + err.message;
    }

    sendButton.disabled = false;
}

// ---------------------------------------------------------------
// STEP 5: ถ้าอยู่หน้ายานพาหนะ ให้ดึงสเปกคันนั้นมาเป็นบริบท
// ---------------------------------------------------------------
function setChatboxVehicle(vehicle) {
    let text = "ชื่อ: " + vehicle.name + "\n";
    text += "ประเภท: " + vehicle.role + " | Rank " + vehicle.rank + "\n";
    text += "BR: AB " + (vehicle.br.AB || "-") + " / RB " + (vehicle.br.RB || "-") + " / SB " + (vehicle.br.SB || "-") + "\n";
    vehicle.stats.forEach(function (stat) {
        text += stat.label + ": " + stat.value + "\n";
    });
    vehicle.shells.forEach(function (shell) {
        text += "กระสุน " + shell.name + " (" + shell.type + ") เจาะ " +
            shell.penetration.join("/") + " มม. ที่ 10/100/500/1000/1500/2000 ม.\n";
    });

    chatboxVehicleText = text;
    chatboxVehicleName = vehicle.name;

    const box = document.getElementById("chatbox_context");
    box.classList.remove("hidden");
    box.innerHTML = "กำลังปรึกษาเรื่อง <b>" + escapeText(vehicle.name) + "</b> · " +
        escapeText(vehicle.role) + " · BR " + escapeText(vehicle.br.RB || "-");
}

// ---------------------------------------------------------------
// STEP 6: เริ่มทำงานทันทีที่โหลดหน้า
// ---------------------------------------------------------------
drawChatbox();
chatboxReady = true;

// เปิด modal ให้เลยถ้า URL มี ?chat=1 (ใช้ตอนกดมาจากเมนูหรือปุ่มในหน้าอื่น)
if (new URLSearchParams(location.search).get("chat") === "1") {
    openChatbox();
}
