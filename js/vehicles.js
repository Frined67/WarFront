// js/vehicles.js
// หน้ารวมยานพาหนะ: กรองตามกลุ่ม ประเภท สัญชาติ Rank และค้นหาชื่อ

drawNavbar("vehicles");

let allVehicles = [];   // ข้อมูลทั้งหมดจาก data/index.json
let shownCount = 40;    // แสดงทีละ 40 คัน กดปุ่มเพื่อโหลดเพิ่ม

// STEP 1: อ่านค่าที่ส่งมาทาง URL เช่น vehicles.html?role=heavy_tank
const params = new URLSearchParams(location.search);

// STEP 2: โหลดข้อมูลแล้วเตรียมตัวเลือกในกล่องกรอง
//         รายชื่อจากวิกิ (data/index.json) + คันที่เพิ่มเองในฐานข้อมูล (ถ้ามีหลังบ้าน)
loadIndex().then(async function (data) {
    allVehicles = data.vehicles;

    try {
        const extra = await loadDbVehicles({ limit: 200 });
        extra.vehicles.forEach(function (vehicle) {
            // ถ้า id ซ้ำกับของวิกิ ให้ของในฐานข้อมูลทับไป (ถือว่าเป็นข้อมูลที่แก้ล่าสุด)
            const same = allVehicles.findIndex(function (item) {
                return item.id === vehicle.id;
            });
            if (same >= 0) {
                allVehicles[same] = vehicle;
            } else {
                allVehicles.unshift(vehicle);
            }
        });
    } catch (err) {
        // ไม่มีหลังบ้าน/ฐานข้อมูล ก็แสดงเฉพาะข้อมูลจากวิกิ
    }

    // เก็บค่าที่มีจริงในข้อมูล เอาไปใส่เป็น option
    const roles = {};
    const nations = {};
    const ranks = {};
    allVehicles.forEach(function (vehicle) {
        if (vehicle.roleId) roles[vehicle.roleId] = vehicle.role;
        nations[vehicle.nation] = true;
        if (vehicle.rank) ranks[vehicle.rank] = true;
    });

    const roleSelect = document.getElementById("vehicles_role");
    Object.keys(roles).sort().forEach(function (roleId) {
        roleSelect.innerHTML += '<option value="' + roleId + '">' + escapeText(roleLabel(roleId, roles[roleId])) + "</option>";
    });

    const nationSelect = document.getElementById("vehicles_nation");
    Object.keys(nations).forEach(function (nation) {
        nationSelect.innerHTML += '<option value="' + nation + '">' + escapeText(nationLabel(nation)) + "</option>";
    });

    const rankSelect = document.getElementById("vehicles_rank");
    ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"].forEach(function (rank) {
        if (ranks[rank]) rankSelect.innerHTML += '<option value="' + rank + '">Rank ' + rank + "</option>";
    });

    // STEP 3: ถ้ามีค่ามาจาก URL ให้ตั้งค่าในกล่องกรองตามนั้น
    if (params.get("role")) document.getElementById("vehicles_role").value = params.get("role");
    if (params.get("nation")) document.getElementById("vehicles_nation").value = params.get("nation");
    if (params.get("branch")) document.getElementById("vehicles_branch").value = params.get("branch");

    drawList();
}).catch(function (err) {
    document.getElementById("vehicles_list").innerHTML =
        '<p class="vehicles_count">เกิดข้อผิดพลาด: ' + escapeText(err.message) + "</p>";
});

// STEP 4: กรองข้อมูลตามค่าในกล่องกรอง แล้ววาดการ์ดออกมา
function drawList() {
    const search = document.getElementById("vehicles_search").value.trim().toLowerCase();
    const branch = document.getElementById("vehicles_branch").value;
    const role = document.getElementById("vehicles_role").value;
    const nation = document.getElementById("vehicles_nation").value;
    const rank = document.getElementById("vehicles_rank").value;
    const onlyDetail = document.getElementById("vehicles_only_detail").checked;

    const found = allVehicles.filter(function (vehicle) {
        if (search && vehicle.name.toLowerCase().indexOf(search) < 0) return false;
        if (branch && vehicle.branch !== branch) return false;
        if (role && vehicle.roleId !== role) return false;
        if (nation && vehicle.nation !== nation) return false;
        if (rank && vehicle.rank !== rank) return false;
        if (onlyDetail && !vehicle.hasDetail) return false;
        return true;
    });

    document.getElementById("vehicles_count").textContent = "พบ " + found.length + " คัน";

    let html = "";
    found.slice(0, shownCount).forEach(function (vehicle) {
        const br = vehicle.br && vehicle.br.RB ? "BR " + vehicle.br.RB : "Rank " + vehicle.rank;
        html +=
            '<a href="vehicle.html?id=' + encodeURIComponent(vehicle.id) + '" class="vehicles_card">' +
            '<img src="' + escapeText(vehicle.icon) + '" alt="" class="vehicles_card-icon" loading="lazy">' +
            '<div class="vehicles_card-name">' + escapeText(vehicle.name) + "</div>" +
            '<div class="vehicles_card-meta">' + escapeText(nationLabel(vehicle.nation)) + " · " + escapeText(br) + "</div>" +
            '<div class="vehicles_card-role">' + escapeText(vehicle.role || "") + "</div>" +
            "</a>";
    });
    if (html === "") html = '<p class="vehicles_count">ไม่พบยานพาหนะตามเงื่อนไขนี้</p>';
    document.getElementById("vehicles_list").innerHTML = html;

    // ปุ่มโหลดเพิ่ม จะโชว์ก็ต่อเมื่อยังมีเหลือ
    const moreButton = document.getElementById("vehicles_more");
    if (found.length > shownCount) {
        moreButton.classList.remove("hidden");
    } else {
        moreButton.classList.add("hidden");
    }
}

// STEP 5: ผูกเหตุการณ์ของกล่องกรองทุกช่อง
["vehicles_search", "vehicles_branch", "vehicles_role", "vehicles_nation", "vehicles_rank", "vehicles_only_detail"]
    .forEach(function (id) {
        document.getElementById(id).addEventListener("input", function () {
            shownCount = 40;
            drawList();
        });
    });

document.getElementById("vehicles_more").addEventListener("click", function () {
    shownCount += 40;
    drawList();
});
