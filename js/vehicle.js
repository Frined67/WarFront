// js/vehicle.js
// หน้ารายละเอียดยานพาหนะ 1 คัน เช่น vehicle.html?id=germ_pzkpfw_VI_ausf_e_tiger

drawNavbar("");

// STEP 1: อ่าน id จาก URL
const params = new URLSearchParams(location.search);
const id = params.get("id");
const body = document.getElementById("vehicle_body");

if (!id) {
    body.innerHTML = '<p class="vehicle_note">ไม่ได้ระบุยานพาหนะ กลับไปที่ <a href="vehicles.html">ฐานข้อมูล</a></p>';
} else {
    loadVehicle(id).then(drawVehicle).catch(function (err) {
        body.innerHTML =
            '<p class="vehicle_note">' + escapeText(err.message) + "<br>" +
            'ลองรัน <code>node tools/scrape.js one ' + escapeText(id) + "</code> เพื่อดึงข้อมูลคันนี้จากวิกิ</p>";
    });
}

// STEP 2: หาค่าสเปกตัวที่ต้องการจากรายการ stats
function findStat(vehicle, label) {
    let found = "";
    vehicle.stats.forEach(function (stat) {
        if (found === "" && stat.label === label) found = stat.value;
    });
    return found;
}

// STEP 3: สรุปจุดแข็ง/จุดอ่อนแบบง่าย ๆ จากตัวเลขที่ดึงมาจากวิกิ
function makeTips(vehicle) {
    const strong = [];
    const weak = [];

    const armour = findStat(vehicle, "Armour");
    const speed = parseFloat(findStat(vehicle, "Max speed"));
    const power = parseFloat(findStat(vehicle, "Power-to-weight ratio"));
    const reload = findStat(vehicle, "Reload");
    const visibility = parseFloat(findStat(vehicle, "Visibility"));

    if (armour) {
        const front = parseInt(armour, 10);
        if (front >= 100) strong.push("เกราะหน้าตัวถัง " + armour + " หนาพอจะยืนแลกกับกระสุนเจาะเกราะทั่วไปในระดับ BR เดียวกัน");
        if (front > 0 && front < 30) weak.push("เกราะบาง (" + armour + ") โดนปืนกลหนักหรือกระสุนระเบิดก็เสียหายหนัก ต้องเล่นหลบกำบัง");
    }
    if (speed >= 60) strong.push("ความเร็วสูงสุด " + speed + " กม./ชม. ใช้ชิงจุดและตีโอบได้ดี");
    if (speed > 0 && speed < 35) weak.push("ความเร็วต่ำ (" + speed + ") เปลี่ยนตำแหน่งช้า ควรเลือกจุดยิงให้ดีตั้งแต่ต้นเกม");
    if (power >= 18) strong.push("อัตราส่วนกำลังต่อน้ำหนัก " + power + " ออกตัวและไต่เนินไว");
    if (power > 0 && power < 10) weak.push("อัตราส่วนกำลังต่อน้ำหนักต่ำ (" + power + ") อืดเวลาถอยหนี");
    if (visibility >= 120) weak.push("ค่าการมองเห็น " + visibility + "% ตัวใหญ่ ถูกสังเกตง่าย");
    if (reload) strong.push("เวลาบรรจุกระสุน " + reload + " (พลบรรจุระดับต่ำ → ระดับสูง)");

    if (vehicle.shells && vehicle.shells.length > 0) {
        // หากระสุนที่เจาะเกราะได้ดีที่สุดที่ระยะ 500 เมตร
        let best = vehicle.shells[0];
        vehicle.shells.forEach(function (shell) {
            const now = parseInt(shell.penetration[2] || shell.penetration[0], 10);
            const old = parseInt(best.penetration[2] || best.penetration[0], 10);
            if (now > old) best = shell;
        });
        strong.push("กระสุนเจาะเกราะดีที่สุดคือ " + best.name + " (" + best.type + ") เจาะได้ " +
            (best.penetration[2] || best.penetration[0]) + " มม. ที่ระยะ 500 ม.");
    }

    if (strong.length === 0) strong.push("ข้อมูลสเปกจากวิกิยังไม่พอสรุปจุดแข็ง");
    if (weak.length === 0) weak.push("ยังไม่พบจุดอ่อนชัดเจนจากตัวเลขสเปก ลองถาม AI Tactical Commander เพิ่ม");
    return { strong: strong, weak: weak };
}

// STEP 4: วาดหน้าออกมา
function drawVehicle(vehicle) {
    document.title = vehicle.name + " | WarFront Guide";

    let html = "";

    // ---- หัวการ์ด ----
    html += '<div class="vehicle_head global_panel p-5">';
    html += '<div class="flex flex-col md:flex-row gap-5">';
    if (vehicle.image) {
        html += '<img src="' + escapeText(vehicle.image) + '" alt="" class="vehicle_image">';
    }
    html += "<div>";
    html += '<div class="vehicle_branch">' + escapeText(vehicle.branchLabel) + "</div>";
    html += '<h1 class="vehicle_name">' + escapeText(vehicle.name) + "</h1>";
    html += '<div class="vehicle_tags">';
    html += '<span class="vehicle_tag">Rank ' + escapeText(vehicle.rank) + "</span>";
    html += '<span class="vehicle_tag">' + escapeText(roleLabel(vehicle.roleId, vehicle.role)) + "</span>";
    ["AB", "RB", "SB"].forEach(function (mode) {
        if (vehicle.br[mode]) {
            html += '<span class="vehicle_tag vehicle_tag--br">' + mode + " " + escapeText(vehicle.br[mode]) + "</span>";
        }
    });
    html += "</div>";
    html += '<p class="vehicle_desc">' + escapeText(vehicle.description) + "</p>";
    html += '<div class="mt-3 flex gap-3 flex-wrap">';
    html += '<button type="button" class="vehicle_button" onclick="openChatbox()">ถาม AI เรื่องคันนี้</button>';
    html += '<a href="' + escapeText(vehicle.wiki) + '" target="_blank" class="vehicle_button vehicle_button--ghost">ดูหน้าต้นฉบับในวิกิ</a>';
    html += "</div></div></div></div>";

    // ---- ตารางสเปก ----
    html += '<h2 class="vehicle_section">สถิติพื้นฐาน</h2>';
    html += '<div class="global_panel p-4"><table class="vehicle_table"><tbody>';
    vehicle.stats.forEach(function (stat) {
        html += "<tr><th>" + escapeText(stat.label) + "</th><td>" + escapeText(stat.value) + "</td></tr>";
    });
    html += "</tbody></table></div>";

    // ---- อาวุธ ----
    if (vehicle.weapons.length > 0) {
        html += '<h2 class="vehicle_section">อาวุธประจำตัว</h2>';
        html += '<div class="global_panel p-4"><ul class="vehicle_list">';
        vehicle.weapons.forEach(function (weapon) {
            html += "<li>" + escapeText(weapon) + "</li>";
        });
        html += "</ul></div>";
    }

    // ---- ตารางการเจาะเกราะของกระสุน ----
    if (vehicle.shells.length > 0) {
        html += '<h2 class="vehicle_section">การเจาะเกราะของกระสุน (มม.)</h2>';
        html += '<div class="global_panel p-4 overflow-x-auto"><table class="vehicle_table vehicle_table--shell">';
        html += "<thead><tr><th>กระสุน</th><th>ชนิด</th><th>10 ม.</th><th>100 ม.</th><th>500 ม.</th><th>1000 ม.</th><th>1500 ม.</th><th>2000 ม.</th></tr></thead><tbody>";
        vehicle.shells.forEach(function (shell) {
            html += "<tr><td>" + escapeText(shell.name) + "</td><td>" + escapeText(shell.type) + "</td>";
            for (let i = 0; i < 6; i++) {
                html += "<td>" + escapeText(shell.penetration[i] || "-") + "</td>";
            }
            html += "</tr>";
        });
        html += "</tbody></table></div>";
    }

    // ---- จุดแข็ง / จุดอ่อน / คำแนะนำการจัดกระสุน ----
    const tips = makeTips(vehicle);
    html += '<h2 class="vehicle_section">จุดแข็ง จุดอ่อน และคำแนะนำ</h2>';
    html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">';
    html += '<div class="global_panel p-4"><div class="vehicle_tip-title vehicle_tip-title--good">จุดแข็ง</div><ul class="vehicle_list">';
    tips.strong.forEach(function (text) {
        html += "<li>" + escapeText(text) + "</li>";
    });
    html += "</ul></div>";
    html += '<div class="global_panel p-4"><div class="vehicle_tip-title vehicle_tip-title--bad">จุดอ่อน</div><ul class="vehicle_list">';
    tips.weak.forEach(function (text) {
        html += "<li>" + escapeText(text) + "</li>";
    });
    html += "</ul></div></div>";

    if (vehicle.shells.length > 0) {
        html += '<h2 class="vehicle_section">คำแนะนำการจัดกระสุน</h2>';
        html += '<div class="global_panel p-4"><ul class="vehicle_list">';
        html += "<li>พกกระสุนเจาะเกราะที่ค่าทะลวงสูงสุดเป็นหลัก ใช้กับรถถังหนักและเป้าหมายเกราะหนา</li>";
        html += "<li>พกกระสุนระเบิดแรงสูง (HE) ไว้เล็กน้อย สำหรับรถเปิดประทุน รถต่อสู้อากาศยาน และรถที่เกราะบาง</li>";
        html += "<li>เริ่มเกมอย่าบรรจุเต็มแม็ก เก็บช่องกระสุนล่างให้ว่างไว้ ลดโอกาสระเบิดคลังกระสุน</li>";
        html += '<li>อยากได้คำแนะนำเฉพาะสถานการณ์ กดปุ่ม AI Tactical Commander มุมขวาล่างได้เลย</li>';
        html += "</ul></div>";
    }

    html += '<p class="vehicle_note mt-4">ข้อมูลดึงจากวิกิเมื่อ ' + escapeText(vehicle.updated) + "</p>";

    body.innerHTML = html;

    // STEP 5: ส่งสเปกคันนี้ให้กล่องแชทลอย เพื่อให้ AI ตอบโดยอิงข้อมูลจริงของคันนี้
    setChatboxVehicle(vehicle);
}
