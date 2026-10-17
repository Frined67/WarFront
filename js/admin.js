// js/admin.js
// หน้าจัดการระบบ: CRUD ยานพาหนะ, CRUD ผู้ใช้และสิทธิ์, และตั้งค่า AI
// ทุกคำสั่งยิงไปที่ /api/* โดยแนบ ID token ของ Google ให้หลังบ้านตรวจสิทธิ์อีกชั้น

drawNavbar("admin");

// ---------------------------------------------------------------
// STEP 1: ด่านตรวจสิทธิ์ — ถามหลังบ้านว่าเราเป็น admin จริงไหม
// ---------------------------------------------------------------
const guard = document.getElementById("admin_guard");
const main = document.getElementById("admin_main");

checkAdmin();

async function checkAdmin() {
    const user = getUser();
    if (!user) {
        return denied("หน้านี้สำหรับผู้ดูแลระบบ กรุณาล็อกอินด้วย Google ที่มุมขวาบนก่อน");
    }

    try {
        const data = await apiFetch("api/me");

        // เก็บ role ล่าสุดไว้ใน localStorage ด้วย เพื่อให้เมนูบนทุกหน้าแสดงถูก
        user.role = data.user.role;
        localStorage.setItem("warfront_user", JSON.stringify(user));

        if (data.user.role !== "admin") {
            return denied("บัญชี " + escapeText(data.user.email) + " ไม่ใช่ผู้ดูแลระบบ");
        }
    } catch (err) {
        return denied("ตรวจสิทธิ์ไม่สำเร็จ: " + escapeText(err.message) +
            "<br>หน้านี้ต้องเปิดผ่านหลังบ้าน (npx wrangler pages dev . หรือบน Cloudflare Pages)");
    }

    main.classList.remove("hidden");
    fillSelectOptions();
    loadVehicleRows();
    loadUserRows();
    loadAiSettings();
}

function denied(html) {
    guard.innerHTML = '<p class="admin_count">' + html + "</p>";
    guard.classList.remove("hidden");
}

// ---------------------------------------------------------------
// STEP 2: แถบสลับแท็บ และแถบข้อความแจ้งผล
// ---------------------------------------------------------------
document.querySelectorAll(".admin_tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
        document.querySelectorAll(".admin_tab").forEach(function (other) {
            other.classList.remove("admin_tab--active");
        });
        tab.classList.add("admin_tab--active");

        ["vehicles", "users", "ai", "chat"].forEach(function (name) {
            const panel = document.getElementById("admin_panel_" + name);
            if (name === tab.dataset.tab) {
                panel.classList.remove("hidden");
            } else {
                panel.classList.add("hidden");
            }
        });
    });
});

const messageBox = document.getElementById("admin_message");

function showMessage(text, good) {
    messageBox.textContent = text;
    messageBox.className = "admin_message " + (good ? "admin_message--good" : "admin_message--bad");
    messageBox.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------------------------------------------------------------
// STEP 3: เติมตัวเลือกในฟอร์มจากรายชื่อชาติ/ประเภทที่เว็บใช้อยู่
// ---------------------------------------------------------------
function fillSelectOptions() {
    const nation = document.getElementById("admin_f_nation");
    nation.innerHTML = '<option value="">ไม่ระบุ</option>';
    Object.keys(NATION_NAME).forEach(function (key) {
        nation.innerHTML += '<option value="' + key + '">' + escapeText(NATION_NAME[key]) + "</option>";
    });

    const role = document.getElementById("admin_f_roleid");
    role.innerHTML = '<option value="">ไม่ระบุ</option>';
    Object.keys(ROLE_NAME).forEach(function (key) {
        role.innerHTML += '<option value="' + key + '">' + escapeText(ROLE_NAME[key]) + "</option>";
    });

    const rank = document.getElementById("admin_f_rank");
    rank.innerHTML = '<option value="">ไม่ระบุ</option>';
    ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"].forEach(function (value) {
        rank.innerHTML += '<option value="' + value + '">Rank ' + value + "</option>";
    });
}

// ---------------------------------------------------------------
// STEP 4: READ — ตารางยานพาหนะ
//   รวม 2 แหล่ง: คันที่อยู่ในฐานข้อมูล (แก้/ลบได้) + รายชื่อทั้งหมดจากวิกิใน data/index.json
//   กดแก้คันของวิกิได้เลย ระบบจะคัดลอกข้อมูลคันนั้นมาเก็บลงฐานข้อมูลเป็นฉบับแก้ไข
//   (หน้า vehicle.html อ่านฐานข้อมูลก่อนไฟล์ เลยเห็นของที่แก้ทันที)
// ---------------------------------------------------------------
let vehicleCache = {};   // คันที่อยู่ในฐานข้อมูล (ข้อมูลเต็ม พร้อมเติมฟอร์มได้ทันที)
let indexCache = {};     // รายชื่อจากวิกิ id -> แถวใน data/index.json
let tableRows = [];      // แถวที่จะวาดในตาราง (ผ่านตัวกรองแล้ว)
let tableShown = 100;    // วาดทีละ 100 แถว กดปุ่มเพื่อโหลดเพิ่ม

async function loadVehicleRows() {
    const rows = document.getElementById("admin_v_rows");

    try {
        // คันในฐานข้อมูลเอามาให้หมด (ปกติมีไม่มาก) ส่วนรายชื่อวิกิโหลดครั้งเดียวพอ
        const data = await loadDbVehicles({ limit: 200 });
        vehicleCache = {};
        data.vehicles.forEach(function (vehicle) {
            vehicleCache[vehicle.id] = vehicle;
        });

        if (Object.keys(indexCache).length === 0) {
            const wiki = await loadIndex();
            wiki.vehicles.forEach(function (vehicle) {
                indexCache[vehicle.id] = vehicle;
            });
        }

        document.getElementById("admin_v_count").textContent =
            "แก้ไขไว้ในฐานข้อมูล " + data.total + " คัน · จากวิกิทั้งหมด " + Object.keys(indexCache).length + " คัน";

        tableShown = 100;
        drawVehicleTable();
    } catch (err) {
        rows.innerHTML = '<tr><td colspan="8" class="admin_count">โหลดไม่สำเร็จ: ' + escapeText(err.message) + "</td></tr>";
    }
}

// รวมสองแหล่งเป็นลิสต์เดียว แล้วกรองตามช่องค้นหา/กลุ่ม
function buildTableRows() {
    const search = document.getElementById("admin_v_search").value.trim().toLowerCase();
    const branch = document.getElementById("admin_v_branch").value;
    const onlyEdited = document.getElementById("admin_v_only_db").checked;

    const list = [];
    const seen = {};

    // คันที่แก้ไว้ในฐานข้อมูลขึ้นก่อน
    Object.keys(vehicleCache).forEach(function (id) {
        const vehicle = vehicleCache[id];
        seen[id] = true;
        list.push({
            id: id,
            name: vehicle.name,
            branch: vehicle.branch,
            nation: vehicle.nation,
            rank: vehicle.rank,
            br: vehicle.br.RB,
            updated: vehicle.updated,
            inDb: true
        });
    });

    // ที่เหลือคือของวิกิที่ยังไม่ถูกแก้
    if (!onlyEdited) {
        Object.keys(indexCache).forEach(function (id) {
            if (seen[id]) return;
            const vehicle = indexCache[id];
            list.push({
                id: id,
                name: vehicle.name,
                branch: vehicle.branch,
                nation: vehicle.nation,
                rank: vehicle.rank,
                br: vehicle.br && vehicle.br.RB ? vehicle.br.RB : "",
                updated: "",
                inDb: false
            });
        });
    }

    return list.filter(function (row) {
        if (branch && row.branch !== branch) return false;
        if (search && row.name.toLowerCase().indexOf(search) < 0 && row.id.toLowerCase().indexOf(search) < 0) return false;
        return true;
    });
}

function drawVehicleTable() {
    const rows = document.getElementById("admin_v_rows");
    tableRows = buildTableRows();

    document.getElementById("admin_v_found").textContent =
        "พบ " + tableRows.length + " คันตามเงื่อนไขนี้";

    if (tableRows.length === 0) {
        rows.innerHTML = '<tr><td colspan="8" class="admin_count">ไม่พบยานพาหนะตามเงื่อนไขนี้</td></tr>';
        document.getElementById("admin_v_more").classList.add("hidden");
        return;
    }

    let html = "";
    tableRows.slice(0, tableShown).forEach(function (row) {
        html += "<tr>";
        html += "<td>" + escapeText(row.id) + "</td>";
        html += '<td><a href="vehicle.html?id=' + encodeURIComponent(row.id) + '" target="_blank">' +
            escapeText(row.name) + "</a>" +
            (row.inDb
                ? ' <span class="admin_tag admin_tag--admin">แก้ไขแล้ว</span>'
                : ' <span class="admin_tag">ต้นฉบับวิกิ</span>') + "</td>";
        html += "<td>" + (row.branch === "aviation" ? "อากาศยาน" : "ภาคพื้น") + "</td>";
        html += "<td>" + escapeText(nationLabel(row.nation)) + "</td>";
        html += "<td>" + escapeText(row.rank) + "</td>";
        html += "<td>" + escapeText(row.br) + "</td>";
        html += '<td class="admin_count">' + escapeText(row.updated || "—") + "</td>";
        html += '<td style="white-space:nowrap">' +
            '<button type="button" class="admin_button admin_button--ghost" style="padding:4px 12px;font-weight:400"' +
            " onclick=\"editVehicle('" + escapeText(row.id) + "')\">แก้ไข</button> ";

        // ของวิกิยังไม่มีอะไรในฐานข้อมูลให้ลบ ส่วนของที่แก้แล้วลบได้ (= คืนค่าเป็นต้นฉบับวิกิ)
        if (row.inDb) {
            const label = indexCache[row.id] ? "คืนค่าต้นฉบับ" : "ลบ";
            html += '<button type="button" class="admin_button admin_button--danger"' +
                " onclick=\"deleteVehicle('" + escapeText(row.id) + "')\">" + label + "</button>";
        }
        html += "</td></tr>";
    });
    rows.innerHTML = html;

    const moreButton = document.getElementById("admin_v_more");
    if (tableRows.length > tableShown) {
        moreButton.classList.remove("hidden");
    } else {
        moreButton.classList.add("hidden");
    }
}

["admin_v_search", "admin_v_branch", "admin_v_only_db"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", function () {
        tableShown = 100;
        drawVehicleTable();
    });
});

document.getElementById("admin_v_more").addEventListener("click", function () {
    tableShown += 100;
    drawVehicleTable();
});

// ---------------------------------------------------------------
// STEP 5: ฟอร์มยานพาหนะ (ใช้ร่วมกันทั้งเพิ่มและแก้ไข)
// ---------------------------------------------------------------
const vehicleForm = document.getElementById("admin_v_form");
let editingId = "";   // ว่าง = กำลังเพิ่มคันใหม่

document.getElementById("admin_v_new").addEventListener("click", function () {
    openVehicleForm(null, false);
});

document.getElementById("admin_v_cancel").addEventListener("click", function () {
    vehicleForm.classList.add("hidden");
});

function setValue(id, value) {
    document.getElementById(id).value = value === undefined || value === null ? "" : value;
}

function getValue(id) {
    return document.getElementById(id).value.trim();
}

// แปลงข้อความหลายบรรทัดในฟอร์มกลับเป็นโครงสร้างข้อมูล
function linesToStats(text) {
    return text.split("\n").map(function (line) {
        const piece = line.split("|");
        return { label: (piece[0] || "").trim(), value: (piece[1] || "").trim() };
    }).filter(function (stat) {
        return stat.label !== "";
    });
}

function linesToShells(text) {
    return text.split("\n").map(function (line) {
        const piece = line.split("|").map(function (part) {
            return part.trim();
        });
        return { name: piece[0] || "", type: piece[1] || "", penetration: piece.slice(2) };
    }).filter(function (shell) {
        return shell.name !== "";
    });
}

// vehicle = null คือเพิ่มคันใหม่ / inDb = คันนี้มีอยู่ในฐานข้อมูลแล้วหรือยัง
//   อยู่แล้ว -> กดบันทึกเป็น PUT (แก้ไข) / ยังไม่อยู่ -> เป็น POST (สร้างฉบับแก้ไข)
function openVehicleForm(vehicle, inDb) {
    editingId = vehicle && inDb ? vehicle.id : "";

    document.getElementById("admin_v_form_title").textContent =
        vehicle ? "แก้ไข: " + vehicle.name : "เพิ่มยานพาหนะใหม่";
    document.getElementById("admin_f_id").readOnly = Boolean(vehicle);

    setValue("admin_f_id", vehicle ? vehicle.id : "");
    setValue("admin_f_name", vehicle ? vehicle.name : "");
    setValue("admin_f_branch", vehicle ? vehicle.branch : "ground");
    setValue("admin_f_nation", vehicle ? vehicle.nation : "");
    setValue("admin_f_rank", vehicle ? vehicle.rank : "");
    setValue("admin_f_roleid", vehicle ? vehicle.roleId : "");
    setValue("admin_f_role", vehicle ? vehicle.role : "");
    setValue("admin_f_ab", vehicle ? vehicle.br.AB : "");
    setValue("admin_f_rb", vehicle ? vehicle.br.RB : "");
    setValue("admin_f_sb", vehicle ? vehicle.br.SB : "");
    setValue("admin_f_icon", vehicle ? vehicle.icon : "");
    setValue("admin_f_image", vehicle ? vehicle.image : "");
    setValue("admin_f_wiki", vehicle ? vehicle.wiki : "");
    setValue("admin_f_desc", vehicle ? vehicle.description : "");

    setValue("admin_f_stats", vehicle ? vehicle.stats.map(function (stat) {
        return stat.label + " | " + stat.value;
    }).join("\n") : "");

    setValue("admin_f_weapons", vehicle ? vehicle.weapons.join("\n") : "");

    setValue("admin_f_shells", vehicle ? vehicle.shells.map(function (shell) {
        return [shell.name, shell.type].concat(shell.penetration).join(" | ");
    }).join("\n") : "");

    vehicleForm.classList.remove("hidden");
    vehicleForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

// CREATE / UPDATE
vehicleForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const body = {
        id: getValue("admin_f_id"),
        name: getValue("admin_f_name"),
        branch: getValue("admin_f_branch"),
        nation: getValue("admin_f_nation"),
        rank: getValue("admin_f_rank"),
        roleId: getValue("admin_f_roleid"),
        role: getValue("admin_f_role"),
        br: { AB: getValue("admin_f_ab"), RB: getValue("admin_f_rb"), SB: getValue("admin_f_sb") },
        icon: getValue("admin_f_icon"),
        image: getValue("admin_f_image"),
        wiki: getValue("admin_f_wiki"),
        description: getValue("admin_f_desc"),
        stats: linesToStats(getValue("admin_f_stats")),
        weapons: getValue("admin_f_weapons").split("\n").map(function (line) {
            return line.trim();
        }).filter(function (line) {
            return line !== "";
        }),
        shells: linesToShells(getValue("admin_f_shells"))
    };

    try {
        if (editingId) {
            await apiFetch("api/vehicles/" + encodeURIComponent(editingId), { method: "PUT", body: body });
            showMessage("บันทึกการแก้ไข " + body.name + " แล้ว", true);
        } else {
            await apiFetch("api/vehicles", { method: "POST", body: body });
            showMessage("เพิ่ม " + body.name + " เข้าฐานข้อมูลแล้ว", true);
        }
        vehicleForm.classList.add("hidden");
        loadVehicleRows();
    } catch (err) {
        showMessage("บันทึกไม่สำเร็จ: " + err.message, false);
    }
});

// ปุ่มในตารางเรียกสองฟังก์ชันนี้ (ต้องอยู่ระดับ global จึงไม่ใส่ไว้ในบล็อกอื่น)
async function editVehicle(id) {
    // คันที่อยู่ในฐานข้อมูลแล้ว -> เติมฟอร์มได้ทันที (กดบันทึกแล้วเป็นการแก้ไข)
    if (vehicleCache[id]) {
        openVehicleForm(vehicleCache[id], true);
        return;
    }

    // คันของวิกิ -> ดึงไฟล์รายละเอียดมาเติมฟอร์มให้ (กดบันทึกแล้วเป็นการสร้างฉบับแก้ไขในฐานข้อมูล)
    showMessage("กำลังดึงข้อมูล " + id + " จากไฟล์ต้นฉบับ...", true);
    try {
        const detail = await loadVehicle(id);
        const base = indexCache[id] || {};

        // ไฟล์รายละเอียดไม่มีช่อง branch/nation/icon เก็บไว้ ต้องเอาจากรายชื่อมาเติม
        const vehicle = {
            id: id,
            name: detail.name || base.name || "",
            branch: base.branch || (detail.branchLabel === "Aviation" ? "aviation" : "ground"),
            nation: base.nation || "",
            rank: detail.rank || base.rank || "",
            roleId: detail.roleId || base.roleId || "",
            role: detail.role || base.role || "",
            br: detail.br || base.br || {},
            icon: base.icon || "",
            image: detail.image || "",
            wiki: detail.wiki || base.wiki || "",
            description: detail.description || "",
            stats: detail.stats || [],
            weapons: detail.weapons || [],
            shells: detail.shells || []
        };

        openVehicleForm(vehicle, false);
        showMessage("เติมข้อมูลต้นฉบับของ " + vehicle.name + " ให้แล้ว แก้แล้วกดบันทึกเพื่อเก็บลงฐานข้อมูล", true);
    } catch (err) {
        showMessage("ดึงข้อมูลคันนี้ไม่ได้: " + err.message +
            " (คันนี้ยังไม่มีไฟล์รายละเอียด ลองกรอกเองด้วยปุ่มเพิ่มยานพาหนะใหม่)", false);
    }
}

// DELETE
async function deleteVehicle(id) {
    // ถ้าคันนี้มีต้นฉบับในวิกิอยู่ การลบ = เอาฉบับที่แก้ออก แล้วกลับไปใช้ไฟล์ต้นฉบับ
    const question = indexCache[id]
        ? "เอาฉบับที่แก้ของ " + id + " ออก แล้วกลับไปใช้ข้อมูลต้นฉบับจากวิกิ?"
        : "ลบ " + id + " ออกจากฐานข้อมูล?";
    if (!confirm(question)) return;
    try {
        await apiFetch("api/vehicles/" + encodeURIComponent(id), { method: "DELETE" });
        showMessage("ลบ " + id + " แล้ว", true);
        loadVehicleRows();
    } catch (err) {
        showMessage("ลบไม่สำเร็จ: " + err.message, false);
    }
}

// ---------------------------------------------------------------
// STEP 6: CRUD ผู้ใช้และสิทธิ์
// ---------------------------------------------------------------
async function loadUserRows() {
    const rows = document.getElementById("admin_u_rows");
    try {
        const data = await apiFetch("api/users");

        let html = "";
        data.users.forEach(function (user) {
            const tag = user.role === "admin" ? "admin_tag admin_tag--admin" : "admin_tag";
            html += "<tr>";
            html += "<td>" + escapeText(user.email) + "</td>";
            html += "<td>" + escapeText(user.name) + "</td>";
            html += '<td><span class="' + tag + '">' + (user.role === "admin" ? "ผู้ดูแลระบบ" : "ผู้ใช้ทั่วไป") + "</span></td>";
            html += '<td class="admin_count">' + escapeText(user.lastLoginAt || "ยังไม่เคยล็อกอิน") + "</td>";
            html += '<td style="white-space:nowrap">';
            html += '<button type="button" class="admin_button admin_button--ghost" style="padding:4px 12px;font-weight:400"' +
                " onclick=\"changeRole(" + user.id + ", '" + (user.role === "admin" ? "user" : "admin") + "')\">" +
                (user.role === "admin" ? "ปลดเป็นผู้ใช้ทั่วไป" : "ตั้งเป็นผู้ดูแล") + "</button> ";
            html += '<button type="button" class="admin_button admin_button--danger" onclick="deleteUser(' + user.id + ')">ลบ</button>';
            html += "</td></tr>";
        });
        rows.innerHTML = html;
    } catch (err) {
        rows.innerHTML = '<tr><td colspan="5" class="admin_count">โหลดไม่สำเร็จ: ' + escapeText(err.message) + "</td></tr>";
    }
}

// CREATE
document.getElementById("admin_u_form").addEventListener("submit", async function (event) {
    event.preventDefault();
    const body = {
        email: getValue("admin_u_email"),
        name: getValue("admin_u_name"),
        role: getValue("admin_u_role")
    };

    try {
        await apiFetch("api/users", { method: "POST", body: body });
        showMessage("เพิ่ม " + body.email + " แล้ว", true);
        document.getElementById("admin_u_form").reset();
        loadUserRows();
    } catch (err) {
        showMessage("เพิ่มผู้ใช้ไม่สำเร็จ: " + err.message, false);
    }
});

// UPDATE (เปลี่ยนสิทธิ์)
async function changeRole(id, role) {
    try {
        await apiFetch("api/users/" + id, { method: "PUT", body: { role: role } });
        showMessage("เปลี่ยนสิทธิ์เรียบร้อย", true);
        loadUserRows();
    } catch (err) {
        showMessage("เปลี่ยนสิทธิ์ไม่สำเร็จ: " + err.message, false);
    }
}

// DELETE
async function deleteUser(id) {
    if (!confirm("ลบผู้ใช้คนนี้ออกจากระบบ?")) return;
    try {
        await apiFetch("api/users/" + id, { method: "DELETE" });
        showMessage("ลบผู้ใช้แล้ว", true);
        loadUserRows();
    } catch (err) {
        showMessage("ลบไม่สำเร็จ: " + err.message, false);
    }
}

// ---------------------------------------------------------------
// STEP 7: ตั้งค่า AI (เลือกผู้ให้บริการด้วยปุ่มวงกลม + API key + โมเดล)
// ---------------------------------------------------------------
function currentProvider() {
    const picked = document.querySelector('input[name="admin_ai_provider"]:checked');
    return picked ? picked.value : "gemini";
}

// ซ่อน/แสดงช่อง Base URL และเปลี่ยนตัวอย่างชื่อโมเดลตามผู้ให้บริการที่เลือก
function drawProviderFields() {
    const openai = currentProvider() === "openai_compatible";
    const box = document.getElementById("admin_ai_baseurl_box");

    if (openai) {
        box.classList.remove("hidden");
    } else {
        box.classList.add("hidden");
    }

    document.getElementById("admin_ai_model").placeholder = openai ? "gpt-4o-mini" : "gemini-3.8-flash";
    document.getElementById("admin_ai_model_hint").textContent = openai
        ? "ตัวอย่าง: gpt-4o-mini, llama-3.3-70b-versatile, qwen2.5:7b"
        : "ตัวอย่าง: gemini-3.8-flash, gemini-2.5-pro (เว้นว่าง = ใช้ค่าจาก GEMINI_MODEL)";
}

document.querySelectorAll('input[name="admin_ai_provider"]').forEach(function (radio) {
    radio.addEventListener("change", drawProviderFields);
});

async function loadAiSettings() {
    try {
        const data = await apiFetch("api/ai-settings");
        const settings = data.settings;

        document.querySelectorAll('input[name="admin_ai_provider"]').forEach(function (radio) {
            radio.checked = radio.value === settings.provider;
        });
        setValue("admin_ai_model", settings.model);
        setValue("admin_ai_baseurl", settings.baseUrl);

        let hint = settings.hasApiKey
            ? "ตอนนี้เก็บ key ไว้แล้ว: " + settings.apiKeyMasked + " (เว้นช่องว่างไว้ = ใช้ค่าเดิม)"
            : "ยังไม่มี key ในฐานข้อมูล";
        if (!settings.hasApiKey && settings.envGeminiKey) {
            hint += " — แต่มี GEMINI_API_KEY ใน Environment Variable อยู่แล้ว ระบบจะใช้ค่านั้น";
        }
        document.getElementById("admin_ai_key_hint").textContent = hint;

        drawProviderFields();
    } catch (err) {
        showMessage("โหลดค่าตั้ง AI ไม่สำเร็จ: " + err.message, false);
    }
}

// UPDATE
document.getElementById("admin_ai_form").addEventListener("submit", async function (event) {
    event.preventDefault();
    await saveAiSettings(getValue("admin_ai_key"));
});

document.getElementById("admin_ai_clear").addEventListener("click", async function () {
    if (!confirm("ล้าง API key ที่เก็บไว้ในฐานข้อมูล?")) return;
    await saveAiSettings("clear");
});

async function saveAiSettings(apiKey) {
    const body = {
        provider: currentProvider(),
        model: getValue("admin_ai_model"),
        baseUrl: getValue("admin_ai_baseurl"),
        apiKey: apiKey
    };

    try {
        await apiFetch("api/ai-settings", { method: "PUT", body: body });
        setValue("admin_ai_key", "");
        showMessage("บันทึกค่าตั้ง AI แล้ว", true);
        loadAiSettings();
    } catch (err) {
        showMessage("บันทึกไม่สำเร็จ: " + err.message, false);
    }
}

// ปุ่มทดสอบ: ยิงคำถามสั้น ๆ ไปที่ /api/chat ด้วยค่าที่บันทึกไว้จริง
document.getElementById("admin_ai_test").addEventListener("click", async function () {
    const result = document.getElementById("admin_ai_test_result");
    result.textContent = "กำลังทดสอบ...";

    try {
        const data = await apiFetch("api/chat", {
            method: "POST",
            body: { messages: [{ role: "user", text: "ทดสอบระบบ ตอบสั้น ๆ ว่าพร้อมปฏิบัติการ" }] }
        });
        result.textContent = "AI ตอบกลับ: " + data.answer;
    } catch (err) {
        result.textContent = "ทดสอบไม่ผ่าน: " + err.message;
    }
});

// ---------------------------------------------------------------
// STEP 8: ทดสอบ Chatbot — หน้าตาเหมือนแชทจริง ส่งบทสนทนาทั้งชุดไปที่ /api/chat-test
// ---------------------------------------------------------------
const chatForm = document.getElementById("admin_chat_test_form");
const chatInput = document.getElementById("admin_chat_question");
const chatSend = document.getElementById("admin_chat_send");
const chatLog = document.getElementById("admin_chat_log");
const chatState = document.getElementById("admin_chat_state");

// บทสนทนาที่คุยกันอยู่ เก็บเป็น { role: "user" | "ai", text: "..." }
let chatHistory = [];
let chatBusy = false;

drawChatLog();

// วาดบทสนทนาทั้งหมดใหม่ทุกครั้งที่มีอะไรเปลี่ยน (เขียนง่าย อ่านง่าย)
function drawChatLog(typing) {
    if (!chatHistory.length && !typing) {
        chatLog.innerHTML = '<p class="admin_chat_empty">ยังไม่มีบทสนทนา<br>' +
            'ลองพิมพ์คำถาม หรือกดชิปคำถามด่วนด้านล่าง เพื่อดูว่า system prompt ที่ตั้งไว้ให้คำตอบแบบไหน</p>';
        return;
    }

    let html = "";
    chatHistory.forEach(function (message) {
        html += chatRowHtml(message.role, message.text);
    });

    if (typing) {
        html += '<div class="admin_chat_row">' +
            '<div class="admin_chat_who">ผู้บัญชาการทหาร</div>' +
            '<div class="admin_chat_bubble admin_chat_bubble--ai admin_chat_typing">' +
            "<span></span><span></span><span></span></div></div>";
    }

    chatLog.innerHTML = html;
    chatLog.scrollTop = chatLog.scrollHeight;
}

function chatRowHtml(role, value) {
    if (role === "me" || role === "user") {
        return '<div class="admin_chat_row admin_chat_row--me">' +
            '<div class="admin_chat_who">คุณ (ผู้ดูแลระบบ)</div>' +
            '<div class="admin_chat_bubble admin_chat_bubble--me">' + escapeText(value) + "</div></div>";
    }
    if (role === "error") {
        return '<div class="admin_chat_row">' +
            '<div class="admin_chat_who">ข้อผิดพลาด</div>' +
            '<div class="admin_chat_bubble admin_chat_bubble--error">' + escapeText(value) + "</div></div>";
    }
    return '<div class="admin_chat_row">' +
        '<div class="admin_chat_who">ผู้บัญชาการทหาร</div>' +
        '<div class="admin_chat_bubble admin_chat_bubble--ai">' + escapeText(value) + "</div></div>";
}

chatForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (chatBusy) return;

    const question = chatInput.value.trim();
    if (!question) return;

    // ขึ้นข้อความของเราก่อนเลย ให้รู้สึกเหมือนแชทจริง
    chatHistory.push({ role: "user", text: question });
    chatInput.value = "";
    setChatBusy(true);
    drawChatLog(true);

    const systemPrompt = document.getElementById("admin_chat_prompt").value.trim();

    try {
        const data = await apiFetch("api/chat-test", {
            method: "POST",
            body: { systemPrompt: systemPrompt, messages: chatHistory }
        });
        chatHistory.push({ role: "ai", text: data.answer || "AI ไม่มีคำตอบให้" });
        chatState.textContent = "ตอบแล้ว " + chatHistory.filter(function (m) { return m.role === "ai"; }).length + " ครั้ง";
    } catch (err) {
        chatHistory.push({ role: "error", text: "ทดสอบไม่สำเร็จ: " + err.message });
        chatState.textContent = "ทดสอบไม่สำเร็จ";
    }

    setChatBusy(false);
    drawChatLog();
    chatInput.focus();
});

function setChatBusy(busy) {
    chatBusy = busy;
    chatSend.disabled = busy;
    chatInput.disabled = busy;
    if (busy) chatState.textContent = "กำลังรอคำตอบ...";
}

// ชิปคำถามด่วน: กดแล้วเติมลงช่องพิมพ์แล้วส่งเลย
document.querySelectorAll(".admin_chat_chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
        if (chatBusy) return;
        chatInput.value = chip.textContent.trim();
        chatForm.requestSubmit();
    });
});

// ล้างบทสนทนา เริ่มทดสอบ prompt ใหม่แบบไม่มีบริบทเก่าค้าง
document.getElementById("admin_chat_clear").addEventListener("click", function () {
    chatHistory = [];
    chatState.textContent = "พร้อมทดสอบ";
    drawChatLog();
});

// ปุ่มดึง prompt มาตรฐานมาให้แก้ (ค่าเดิมจากหลังบ้าน)
document.getElementById("admin_chat_default_prompt").addEventListener("click", async function () {
    const box = document.getElementById("admin_chat_prompt");
    try {
        const data = await apiFetch("api/chat-test-prompt");
        box.value = data.prompt || "";
        showMessage("ดึง prompt มาตรฐานมาให้แล้ว แก้ได้เลยแล้วลองคุยในกล่องแชท", true);
    } catch (err) {
        showMessage("ดึง prompt มาตรฐานไม่สำเร็จ: " + err.message, false);
    }
});
