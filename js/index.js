// js/index.js
// หน้าแรก: แสดงจำนวนข้อมูล ทางลัดตามสัญชาติ และยานพาหนะแนะนำ

// STEP 1: วาดเมนูบน
drawNavbar("index");

// STEP 2: โหลดรายชื่อยานพาหนะทั้งหมดจากไฟล์ที่ดึงมาจากวิกิ
loadIndex().then(function (data) {

    // STEP 3: นับจำนวนคันทั้งหมด และจำนวนที่มีข้อมูลละเอียดแล้ว
    let detailCount = 0;
    data.vehicles.forEach(function (vehicle) {
        if (vehicle.hasDetail) detailCount++;
    });
    document.getElementById("index_count").textContent =
        "ข้อมูลจากวิกิ " + data.count + " คัน (มีหน้ารายละเอียดครบแล้ว " + detailCount +
        " คัน) อัปเดตล่าสุด " + data.updated;

    // STEP 4: นับจำนวนคันของแต่ละสัญชาติ แล้ววาดเป็นปุ่มทางลัด
    const countByNation = {};
    data.vehicles.forEach(function (vehicle) {
        countByNation[vehicle.nation] = (countByNation[vehicle.nation] || 0) + 1;
    });

    let nationHtml = "";
    Object.keys(countByNation).forEach(function (nation) {
        nationHtml +=
            '<a href="vehicles.html?nation=' + nation + '" class="index_card">' +
            '<div class="index_card-title">' + escapeText(nationLabel(nation)) + "</div>" +
            '<div class="index_card-text">' + countByNation[nation] + " คัน</div>" +
            "</a>";
    });
    document.getElementById("index_nations").innerHTML = nationHtml;

    // STEP 5: หยิบคันที่มีข้อมูลละเอียดแล้วมาโชว์ 8 คันแรก
    const featured = data.vehicles.filter(function (vehicle) {
        return vehicle.hasDetail;
    }).slice(0, 8);

    let featuredHtml = "";
    featured.forEach(function (vehicle) {
        featuredHtml +=
            '<a href="vehicle.html?id=' + encodeURIComponent(vehicle.id) + '" class="index_vehicle">' +
            '<img src="' + escapeText(vehicle.icon) + '" alt="" class="index_vehicle-icon" loading="lazy">' +
            '<div class="index_vehicle-name">' + escapeText(vehicle.name) + "</div>" +
            '<div class="index_vehicle-meta">' + escapeText(nationLabel(vehicle.nation)) +
            " · Rank " + escapeText(vehicle.rank) + "</div>" +
            "</a>";
    });
    document.getElementById("index_featured").innerHTML =
        featuredHtml || '<p class="index_hero-note">ยังไม่มีข้อมูลละเอียด ลองรัน node tools/scrape.js details 100</p>';

}).catch(function (err) {
    document.getElementById("index_count").textContent = "เกิดข้อผิดพลาด: " + err.message;
});
