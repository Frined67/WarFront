// tools/scrape.js
// ดึงข้อมูลจริงจาก War Thunder Wiki (https://wiki.warthunder.com)
// แล้วเขียนเป็นไฟล์ JSON ไว้ในโฟลเดอร์ data/ ให้หน้าเว็บ (HTML + JS) โหลดไปใช้
//
// วิธีใช้:
//   node tools/scrape.js index              -> ทำ data/index.json (รายชื่อยานพาหนะทั้งหมด)
//   node tools/scrape.js details 150        -> ทำ data/vehicles/<id>.json (ข้อมูลละเอียด 150 คันแรกที่ยังไม่มี)
//   node tools/scrape.js details all        -> ดึงละเอียดทุกคัน (ช้ามาก ใช้เวลาเป็นชั่วโมง)
//   node tools/scrape.js one us_m4a1        -> ดึงละเอียดคันเดียว

const fs = require("fs");
const path = require("path");

const SITE = "https://wiki.warthunder.com";
const DATA_DIR = path.join(__dirname, "..", "data");
const DETAIL_DIR = path.join(DATA_DIR, "vehicles");

// ---------------------------------------------------------------
// ฟังก์ชันพื้นฐานที่ใช้ซ้ำทั้งไฟล์ (เท่าที่จำเป็นจริง ๆ)
// ---------------------------------------------------------------

async function getHtml(url) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": "WarFrontGuide/1.0 (student project; wiki scraper)",
            "Accept-Language": "en"
        }
    });
    if (!res.ok) {
        throw new Error("HTTP " + res.status + " " + url);
    }
    return await res.text();
}

function unescapeHtml(text) {
    return text
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

function sleep(ms) {
    return new Promise(function (ok) {
        setTimeout(ok, ms);
    });
}

// ---------------------------------------------------------------
// STEP A: ทำรายชื่อยานพาหนะทั้งหมดจากหน้า /ground และ /aviation
// ---------------------------------------------------------------

function readTree(html, branch) {
    // หน้า tree แบ่งเป็นบล็อกของแต่ละชาติด้วย data-tree-id="usa"
    const list = [];
    const parts = html.split('data-tree-id="');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i];
        const nation = block.slice(0, block.indexOf('"'));

        // ในแต่ละชาติยังแบ่งเป็น Rank I, II, III ... ตามหัวข้อในหน้า
        let rank = "";
        const re = /wt-tree_r-header_label">Rank <span>([IVX]+)<\/span>|data-unit-id="([a-z0-9_\-]+)"[\s\S]{0,400}?item-text"><span>(.*?)<\/span>/g;
        let m;
        while ((m = re.exec(block)) !== null) {
            if (m[1]) {
                rank = m[1];
                continue;
            }
            const id = m[2];
            const name = unescapeHtml(m[3]);
            if (!id || !name) continue;
            list.push({
                id: id,
                name: name,
                branch: branch,
                nation: nation,
                rank: rank,
                icon: "https://static.encyclopedia.warthunder.com/slots/" + id + ".png",
                wiki: SITE + "/unit/" + id
            });
        }
    }
    return list;
}

async function buildIndex() {
    console.log("กำลังโหลดหน้ารวมรถถัง /ground ...");
    const groundHtml = await getHtml(SITE + "/ground");
    console.log("กำลังโหลดหน้ารวมอากาศยาน /aviation ...");
    const airHtml = await getHtml(SITE + "/aviation");

    const ground = readTree(groundHtml, "ground");
    const aviation = readTree(airHtml, "aviation");

    // กันรายการซ้ำ (บางคันโผล่หลายกิ่งในต้นไม้)
    const seen = {};
    const vehicles = [];
    ground.concat(aviation).forEach(function (vehicle) {
        if (seen[vehicle.id]) return;
        seen[vehicle.id] = true;
        vehicles.push(vehicle);
    });

    const out = {
        source: SITE,
        updated: new Date().toISOString().slice(0, 10),
        count: vehicles.length,
        vehicles: vehicles
    };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "index.json"), JSON.stringify(out, null, 1));
    console.log("เขียน data/index.json แล้ว ทั้งหมด " + vehicles.length + " คัน");
}

// ---------------------------------------------------------------
// STEP B: ดึงข้อมูลละเอียดของยานพาหนะทีละคันจาก /unit/<id>
// ---------------------------------------------------------------

function readCharBlocks(html) {
    // อ่านคู่ "หัวข้อ / ค่า" ของตารางสเปก
    const stats = [];
    const re = /chars-header">([\s\S]*?)<\/span>[\s\S]*?chars-value">([\s\S]*?)<\/span>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const label = unescapeHtml(m[1]);
        const value = unescapeHtml(m[2]);
        if (label && value) stats.push({ label: label, value: value });
    }
    return stats;
}

function readShells(html) {
    // ตารางการเจาะเกราะของกระสุนแต่ละชนิด
    const shells = [];
    const tables = html.split('game-unit_belt-list');
    for (let i = 1; i < tables.length; i++) {
        const body = tables[i].split("</table>")[0];
        const rows = body.split("<tr>");
        rows.forEach(function (row) {
            if (row.indexOf("<td") < 0) return;
            const rawCells = row.split("<td").slice(1).map(function (cell) {
                // ตัดส่วน attribute ของ <td ...> ทิ้ง เหลือแต่เนื้อในช่อง
                const inside = cell.split("</td>")[0];
                return inside.slice(inside.indexOf(">") + 1);
            });
            if (rawCells.length < 4) return;

            // ชื่อกระสุนอยู่ในป๊อปอัปที่ถูก escape ไว้ เช่น &lt;span&gt;PzGr 39&lt;/span&gt;
            const nameInPopover = rawCells[0].match(/&lt;span&gt;([^&]+)&lt;\/span&gt;/);
            const cells = rawCells.map(unescapeHtml);
            const name = nameInPopover ? unescapeHtml(nameInPopover[1]) : cells[0].split(" ")[0];
            const type = cells[1];
            const penetration = cells.slice(2).filter(function (text) {
                return /^[0-9]+$/.test(text);
            });
            if (!name || penetration.length === 0) return;
            shells.push({
                name: name,
                type: type,
                penetration: penetration // 10m, 100m, 500m, 1000m, 1500m, 2000m
            });
        });
    }
    return shells;
}

function readOne(html, id) {
    const vehicle = { id: id, wiki: SITE + "/unit/" + id };

    const name = html.match(/game-unit_name">([\s\S]*?)<\/h1>/);
    vehicle.name = name ? unescapeHtml(name[1]) : id;

    const branch = html.match(/game-unit_nation">([\s\S]*?)<\/div>/);
    vehicle.branchLabel = branch ? unescapeHtml(branch[1]) : "";

    const role = html.match(/class_icon\/([a-z0-9_]+)\.svg[\s\S]*?text-truncate">([\s\S]*?)<\/div>/);
    vehicle.roleId = role ? role[1] : "";
    vehicle.role = role ? unescapeHtml(role[2]) : "";

    const rank = html.match(/game-unit_rank">[\s\S]*?card-info_value">([\s\S]*?)<\/div>/);
    vehicle.rank = rank ? unescapeHtml(rank[1]) : "";

    vehicle.br = {};
    const brRe = /<div class="mode">(AB|RB|SB)<\/div>\s*<div class="value">([\d.]+)<\/div>/g;
    let b;
    while ((b = brRe.exec(html)) !== null) {
        vehicle.br[b[1]] = b[2];
    }

    const desc = html.match(/game-unit_desc[\s\S]*?content-markdown">([\s\S]*?)<\/div>/);
    vehicle.description = desc ? unescapeHtml(desc[1]) : "";

    const image = html.match(/https:\/\/static\.encyclopedia\.warthunder\.com\/images\/[^"' ]+/);
    vehicle.image = image ? image[0] : "";

    vehicle.weapons = [];
    const weaponRe = /game-unit_weapon-title"><a [^>]*>([\s\S]*?)<\/a>/g;
    let w;
    while ((w = weaponRe.exec(html)) !== null) {
        vehicle.weapons.push(unescapeHtml(w[1]));
    }

    vehicle.stats = readCharBlocks(html);
    vehicle.shells = readShells(html);
    vehicle.updated = new Date().toISOString().slice(0, 10);
    return vehicle;
}

async function fetchDetail(id) {
    const html = await getHtml(SITE + "/unit/" + id);
    const vehicle = readOne(html, id);
    fs.mkdirSync(DETAIL_DIR, { recursive: true });
    fs.writeFileSync(path.join(DETAIL_DIR, id + ".json"), JSON.stringify(vehicle, null, 1));
    return vehicle;
}

async function buildDetails(limitText) {
    const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "index.json"), "utf8"));
    const limit = limitText === "all" ? index.vehicles.length : parseInt(limitText || "50", 10);

    // เรียงคิวแบบสลับชาติ/สลับประเภท เพื่อให้ดึงมาได้ครบทุกกลุ่มถึงแม้ดึงไม่หมด
    const groups = {};
    index.vehicles.forEach(function (vehicle) {
        const key = vehicle.branch + "-" + vehicle.nation;
        if (!groups[key]) groups[key] = [];
        groups[key].push(vehicle);
    });
    const keys = Object.keys(groups);
    const queue = [];
    for (let round = 0; queue.length < index.vehicles.length; round++) {
        let added = 0;
        keys.forEach(function (key) {
            if (groups[key][round]) {
                queue.push(groups[key][round]);
                added++;
            }
        });
        if (added === 0) break;
    }

    let done = 0;
    const roles = {}; // เก็บ role ของแต่ละคัน ไว้ใส่กลับเข้า index.json ตอนท้าย
    for (let i = 0; i < queue.length && done < limit; i++) {
        const vehicle = queue[i];
        const file = path.join(DETAIL_DIR, vehicle.id + ".json");
        if (fs.existsSync(file)) {
            const old = JSON.parse(fs.readFileSync(file, "utf8"));
            roles[vehicle.id] = old;
            continue;
        }
        try {
            const detail = await fetchDetail(vehicle.id);
            roles[vehicle.id] = detail;
            done++;
            console.log(done + "/" + limit + "  " + vehicle.id + "  " + detail.role);
        } catch (err) {
            console.log("ข้าม " + vehicle.id + " : " + err.message);
        }
        await sleep(400); // เว้นจังหวะ ไม่ยิงถี่เกินไปใส่เว็บวิกิ
    }

    // เติม role / br ลงใน index.json ให้หน้า browse กรองได้ทันทีโดยไม่ต้องโหลดทีละไฟล์
    index.vehicles.forEach(function (vehicle) {
        const detail = roles[vehicle.id];
        if (!detail) return;
        vehicle.role = detail.role;
        vehicle.roleId = detail.roleId;
        vehicle.br = detail.br;
        vehicle.hasDetail = true;
    });
    index.updated = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(DATA_DIR, "index.json"), JSON.stringify(index, null, 1));
    console.log("อัปเดต data/index.json เรียบร้อย");
}

// ---------------------------------------------------------------
// ตัวสั่งงาน
// ---------------------------------------------------------------

const command = process.argv[2] || "index";

if (command === "index") {
    buildIndex();
} else if (command === "details") {
    buildDetails(process.argv[3]);
} else if (command === "one") {
    fetchDetail(process.argv[3]).then(function (vehicle) {
        console.log("เขียน data/vehicles/" + vehicle.id + ".json แล้ว");
    });
} else {
    console.log("คำสั่งที่ใช้ได้: index | details <จำนวน|all> | one <id>");
}
