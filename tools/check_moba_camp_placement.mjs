#!/usr/bin/env node
// ============================================================================
//  野怪營地選點規則守門（2026-09-10）
//
//  執行：`node tools/check_moba_camp_placement.mjs`
//
//  ── 為什麼需要這一支 ────────────────────────────────────────────────────
//  `camp_blue_b` 曾經整個壓在下路兵線上（距路線 1.0，規則要求 ≥5.5），
//  它的鏡像 `camp_red_b` 同樣壓在上路。根因**不是**有人把營地移錯：
//    · 營地座標定於 2026-07-15（Sprint 29B1），對當時的路線是合規的
//    · `LANES` 在 2026-07-16（Sprint 29B5 世界尺度調整）被重新塑形
//    · 沒有任何東西在那之後重新驗證營地 ⇒ 路線從營地底下移走，沒人發現
//
//  ⇒ 這支守的不是「營地座標對不對」，而是**營地與路線之間的關係**。
//    以後不管是誰動了路線、地圖範圍還是營地，只要關係破了就會紅。
//    只驗座標值等於把今天的數字寫死，下次改地圖仍然抓不到。
//
//  ⚠ 規則來源是 `gameData.js` 裡 CAMPS 上方那段註解（選點時就是照它掃格的），
//    不是我另外發明的門檻。
// ============================================================================
import { CAMPS, LANES, BUSHES, BASE, FOUNTAIN } from "../src/gameData.js";
import { isWalkable, clearanceAt, HERO_RADIUS } from "../src/battle/moba/nav/mobaNavigation.js";
import { RIFT_DESIGN_SPAN, RIFT_EXTENT_RATIO } from "../src/battle/moba/map/riftMapMetrics.js";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};

/** 規則門檻。⚠ 改這些數字等於改地圖設計規則，不是「讓測試過」。 */
const MIN_LANE = 5.5;       // 距三路路線
const MIN_BUSH = 1.5;       // 距草叢邊緣（草叢半徑之外再留的餘裕）
const MIN_BASE = 20;        // 距雙方基地／泉水
const MIN_CAMP = 12;        // 營地彼此
const SPAN = RIFT_DESIGN_SPAN * RIFT_EXTENT_RATIO;

const segDist = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
const laneDist = (p, pts) => {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(p, pts[i - 1], pts[i]));
  return m;
};

console.log("\n── ① 每一座營地都不得壓在任何一條路線上 ──");
//  ⚠ 這是本輪真正發生過的事故：營地落在兵線上，玩家看到野怪站在下路。
for (const c of CAMPS) {
  const per = Object.fromEntries(Object.entries(LANES).map(([n, pts]) => [n, laneDist(c, pts)]));
  const min = Math.min(...Object.values(per));
  const nearest = Object.entries(per).find(([, v]) => v === min)[0];
  ck(`① ${c.id} 距最近路線 ≥ ${MIN_LANE}`, min >= MIN_LANE,
    `${min.toFixed(1)}（最近＝${nearest}路）`);
}

console.log("\n── ② 營地必須站得住（導航可通行）──");
//  ⚠ 光是「離路線夠遠」不夠：挪到牆裡的話野怪打不到、打野走不進去。
for (const c of CAMPS) {
  ck(`② ${c.id} 可通行且淨空 ≥ 英雄半徑`, isWalkable(c.x, c.y) && clearanceAt(c.x, c.y) >= HERO_RADIUS,
    `淨空 ${clearanceAt(c.x, c.y).toFixed(1)}`);
}

console.log("\n── ③ 兩側必須是精確的 180° 鏡像 ──");
//  ⚠ 對稱是公平性，不是美觀。只修一邊會讓其中一方的野區比較好走。
const byId = Object.fromEntries(CAMPS.map((c) => [c.id, c]));
for (const c of CAMPS.filter((x) => x.side === "blue")) {
  const mid = c.id.replace("blue", "red");
  const m = byId[mid];
  if (!m) { ck(`③ ${c.id} 找得到鏡像 ${mid}`, false); continue; }
  ck(`③ ${c.id} ↔ ${mid} 為精確鏡像`,
    Math.abs(c.x + m.x - SPAN) < 1e-6 && Math.abs(c.y + m.y - SPAN) < 1e-6,
    `${c.x}+${m.x}=${c.x + m.x}、${c.y}+${m.y}=${c.y + m.y}（應為 ${SPAN}）`);
}

console.log("\n── ④ 與草叢／基地／其他營地保持距離 ──");
for (const c of CAMPS) {
  const bush = Math.min(...BUSHES.map((b) => Math.hypot(c.x - b.x, c.y - b.y) - b.r));
  ck(`④ ${c.id} 距草叢邊緣 ≥ ${MIN_BUSH}`, bush >= MIN_BUSH, bush.toFixed(1));
}
for (const c of CAMPS) {
  const base = Math.min(
    ...Object.values(BASE).map((b) => Math.hypot(c.x - b.x, c.y - b.y)),
    ...Object.values(FOUNTAIN).map((b) => Math.hypot(c.x - b.x, c.y - b.y)),
  );
  ck(`④ ${c.id} 距基地／泉水 ≥ ${MIN_BASE}`, base >= MIN_BASE, base.toFixed(1));
}
for (let i = 0; i < CAMPS.length; i++) {
  for (let j = i + 1; j < CAMPS.length; j++) {
    const d = Math.hypot(CAMPS[i].x - CAMPS[j].x, CAMPS[i].y - CAMPS[j].y);
    ck(`④ ${CAMPS[i].id} ↔ ${CAMPS[j].id} 距離 ≥ ${MIN_CAMP}`, d >= MIN_CAMP, d.toFixed(1));
  }
}

console.log("\n── ⑤ 營地的座標只有一個真相來源 ──");
//  ⚠ 這條擋的是「畫面看起來不對，就在 renderer 裡放第二組座標」那種修法。
//    以前發生過（見 gameData.js 註解：G.4 只在 renderer 位移，實體與畫面差 17.1）。
import fs from "node:fs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const renderers = ["src/battle/moba/render/MobaRuntimeObjectives.jsx", "src/MobaView3D.jsx"]
  .filter((p) => fs.existsSync(new URL(`../${p}`, import.meta.url)));
for (const p of renderers) {
  const src = strip(fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
  //  renderer 不可以自己寫死營地座標；要嘛用 CAMPS，要嘛用傳進去的物件。
  const hardcoded = /camp_(blue|red)_[ab]\s*[:=]\s*\{/.test(src) || /\bx:\s*\d+(\.\d+)?,\s*y:\s*\d+(\.\d+)?\s*\}\s*,?\s*\/\/\s*camp/i.test(src);
  ck(`⑤ ${p.split("/").pop()} 沒有自己的一組營地座標`, !hardcoded);
}

console.log(`\n野怪營地選點：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
