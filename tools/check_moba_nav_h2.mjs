// ============================================================================
//  tools/check_moba_nav_h2.mjs — H.2 導航／碰撞驗收器
//
//  【這支在驗什麼】H.2 把英雄碰撞從 `gameData.WALLS`（28 個手寫圓）換成
//  `mobaNavigation`（真實地圖牆體的距離場 + 動態結構圓）。那件事只要有一處不對稱
//  或一處把路封死，比賽就會變成「藍紅不公平」或「推不完」——而且從勝率上看不出原因。
//  這支就是把原因逐項量出來：
//
//    A. 距離場 180° 旋轉對稱（mirrorSymmetric 真的生效）
//    B. 結構碰撞圓鏡像對稱（塔位、半徑、主堡）
//    C. 連通性：泉水 → 三線各塔 → 敵方主堡，藍紅**各自**都走得通
//    D. 路徑長 / 直線距離比（移速補償係數的實測依據）
//    E. 引擎塔位與呈現座標一致（推塔判定距離 9 以內）
//
//  用法：node tools/check_moba_nav_h2.mjs
//  ⚠ 只讀資料，不改任何檔案。零 Math.random。
// ============================================================================
import { buildField, HERO_RADIUS } from "../src/battle/moba/map/mapPassability.js";
import { buildMobaLayout } from "../src/battle/moba/map/mobaMapLayout.js";
import { buildTerrainShapes } from "../src/battle/moba/map/mapTerrainShapes.js";
import { buildTowerPlacement } from "../src/battle/moba/map/mobaTowerPlacement.js";
import { findPath, isWalkable, projectToWalkable, structureList, navInfo } from "../src/battle/moba/nav/mobaNavigation.js";
import { FOUNTAIN, BASE, posOnLane } from "../src/gameData.js";

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, label, detail = "") => {
  if (cond) { pass++; return true; }
  fail++; fails.push(`${label}${detail ? ` — ${detail}` : ""}`);
  return false;
};

const T = buildTerrainShapes(buildMobaLayout());
const F = buildField(T, { mirrorSymmetric: true });
const Fraw = buildField(T);

// ── A. 距離場對稱 ──────────────────────────────────────────────────────────
{
  const { nx, ny, idx, dist, wall } = F;
  let wallDiff = 0, distDiff = 0, worst = 0, cells = 0;
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const a = idx(ix, iy), b = idx(nx - 1 - ix, ny - 1 - iy);
    cells++;
    if (wall[a] !== wall[b]) wallDiff++;
    const d = Math.abs(dist[a] - dist[b]);
    if (d > 1e-9) { distDiff++; worst = Math.max(worst, d); }
  }
  ok(wallDiff === 0, "A1 對稱化後牆體遮罩完全鏡像", `${wallDiff} 格不一致`);
  ok(distDiff === 0, "A2 對稱化後距離場完全鏡像", `${distDiff} 格不一致（最壞 ${worst.toFixed(3)}）`);
  // 對照組：沒對稱化的原始場本來有多不對稱（證明這一步不是白做的）
  let rawDiff = 0;
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const a = Fraw.idx(ix, iy), b = Fraw.idx(nx - 1 - ix, ny - 1 - iy);
    if (Math.abs(Fraw.dist[a] - Fraw.dist[b]) > 1e-9) rawDiff++;
  }
  console.log(`A. 距離場 ${nx}×${ny}=${cells} 格｜未對稱化不一致 ${rawDiff} 格 (${(rawDiff / cells * 100).toFixed(1)}%) → 對稱化後 ${distDiff} 格`);
}

// ── B. 結構碰撞圓鏡像 ──────────────────────────────────────────────────────
const MIRROR_LANE = { top: "bot", bot: "top", mid: "mid" };
const CX = (T.meta.bounds.minX + T.meta.bounds.maxX) / 2;
const CY = (T.meta.bounds.minY + T.meta.bounds.maxY) / 2;
{
  const byId = new Map(structureList().map((s) => [s.id, s]));
  let worstPos = 0, worstR = 0, missing = 0;
  for (const lane of ["top", "mid", "bot"]) for (let tier = 0; tier < 3; tier++) {
    const a = byId.get(`blue_${lane}_${tier}`), b = byId.get(`red_${MIRROR_LANE[lane]}_${tier}`);
    if (!a || !b) { missing++; continue; }
    //  b 繞地圖中心轉 180° 應該落在 a 上
    worstPos = Math.max(worstPos, Math.hypot(2 * CX - b.x - a.x, 2 * CY - b.y - a.y));
    worstR = Math.max(worstR, Math.abs(a.r - b.r));
  }
  const nb = byId.get("blue_nexus"), nr = byId.get("red_nexus");
  const nexPos = nb && nr ? Math.hypot(2 * CX - nr.x - nb.x, 2 * CY - nr.y - nb.y) : Infinity;
  ok(missing === 0, "B0 18 座塔的碰撞圓齊備", `缺 ${missing} 組`);
  ok(worstPos < 0.01, "B1 塔碰撞圓位置鏡像", `最大偏差 ${worstPos.toFixed(3)}`);
  ok(worstR < 1e-9, "B2 塔碰撞半徑鏡像", `最大差 ${worstR.toFixed(3)}`);
  ok(nexPos < 0.01, "B3 主堡碰撞圓鏡像", `偏差 ${Number.isFinite(nexPos) ? nexPos.toFixed(3) : "缺主堡"}`);
  console.log(`B. 結構 ${byId.size} 個｜塔位鏡像偏差 ${worstPos.toFixed(3)}｜主堡 ${Number.isFinite(nexPos) ? nexPos.toFixed(3) : "n/a"}`);
}

// ── C. 連通性（藍紅各自：泉水 → 各塔 → 敵方主堡）────────────────────────────
//  ⚠ 用**推塔順序**下的實際阻擋狀態：打第 k 級塔時，同路較外側的塔已經倒了；
//  打主堡時三路九塔全倒。用「全部塔都活著」去測是不現實的，會誤報。
const PL = buildTowerPlacement();
const ALL_IDS = PL.list.map((p) => p.id).concat(["blue_nexus", "red_nexus"]);
const aliveExcept = (deadIds) => new Set(ALL_IDS.filter((id) => !deadIds.includes(id)));
const legs = [];
for (const side of ["blue", "red"]) {
  const foe = side === "blue" ? "red" : "blue";
  const from = FOUNTAIN[side];
  for (const lane of ["top", "mid", "bot"]) for (let tier = 0; tier < 3; tier++) {
    const p = PL.byId[`${foe}_${lane}_${tier}`];
    if (!p) continue;
    const dead = [];
    for (let k = 0; k < tier; k++) dead.push(`${foe}_${lane}_${k}`);
    legs.push({ side, label: `${side}→${foe}_${lane}_${tier}`, from, to: { x: p.x, y: p.y }, alive: aliveExcept(dead) });
  }
  const allTowersDown = ["top", "mid", "bot"].flatMap((l) => [0, 1, 2].map((k) => `${foe}_${l}_${k}`));
  legs.push({ side, label: `${side}→${foe}_nexus`, from, to: BASE[foe], alive: aliveExcept(allTowersDown) });
}
const ratios = [];
const unreachable = { blue: [], red: [] };
for (const leg of legs) {
  const s = projectToWalkable(leg.from.x, leg.from.y, HERO_RADIUS, leg.alive);
  const g = projectToWalkable(leg.to.x, leg.to.y, HERO_RADIUS, leg.alive);
  const path = findPath(s, g, HERO_RADIUS, leg.alive);
  if (!path || !path.length) { unreachable[leg.side].push(leg.label); continue; }
  let len = Math.hypot(path[0].x - s.x, path[0].y - s.y);
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  const straight = Math.hypot(g.x - s.x, g.y - s.y);
  if (straight > 1) ratios.push({ label: leg.label, side: leg.side, ratio: len / straight, len, straight });
}
ok(unreachable.blue.length === 0, "C1 藍方目標全部可達", unreachable.blue.join(", "));
ok(unreachable.red.length === 0, "C2 紅方目標全部可達", unreachable.red.join(", "));
{
  //  同一組鏡像航段的路徑長必須幾乎相等，否則一方天生要多走路
  const byLabel = new Map(ratios.map((r) => [r.label, r]));
  let worst = 0, worstPair = "";
  for (const lane of ["top", "mid", "bot"]) for (let tier = 0; tier < 3; tier++) {
    const a = byLabel.get(`blue→red_${lane}_${tier}`);
    const b = byLabel.get(`red→blue_${MIRROR_LANE[lane]}_${tier}`);
    if (!a || !b) continue;
    const d = Math.abs(a.len - b.len);
    if (d > worst) { worst = d; worstPair = `${a.label} ${a.len.toFixed(1)} vs ${b.label} ${b.len.toFixed(1)}`; }
  }
  ok(worst < 2.0, "C3 鏡像航段路徑長對稱（<2 單位）", `最大差 ${worst.toFixed(2)}｜${worstPair}`);
  console.log(`C. 航段 ${legs.length} 條｜不可達 藍 ${unreachable.blue.length} / 紅 ${unreachable.red.length}｜鏡像路徑長最大差 ${worst.toFixed(2)}`);
}

// ── D. 路徑長 / 直線比（移速補償依據）─────────────────────────────────────
{
  const vals = ratios.map((r) => r.ratio).sort((a, b) => a - b);
  if (vals.length) {
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const med = vals[Math.floor(vals.length / 2)];
    const p90 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))];
    console.log(`D. 路徑/直線比 n=${vals.length}｜平均 ${mean.toFixed(3)}｜中位 ${med.toFixed(3)}｜p90 ${p90.toFixed(3)}｜最大 ${vals[vals.length - 1].toFixed(3)}`);
    ok(mean < 1.35, "D1 平均繞路比 < 1.35（移速補償仍在合理範圍）", `實測 ${mean.toFixed(3)}`);
  } else ok(false, "D1 有可量測的航段");
}

// ── E. 引擎塔位 vs 呈現座標 ────────────────────────────────────────────────
{
  let worstLaneOff = 0, worstSiegeGap = 0;
  for (const p of PL.list) {
    worstLaneOff = Math.max(worstLaneOff, p.laneOffset);
    const q = posOnLane(p.lane, p.t);
    worstSiegeGap = Math.max(worstSiegeGap, Math.hypot(q.x - p.x, q.y - p.y));
  }
  ok(worstLaneOff < 9, "E1 塔離 lane 折線側偏 < 9（推塔判定距離）", `最大 ${worstLaneOff.toFixed(2)}`);
  ok(worstSiegeGap < 9, "E2 塔的 t 反算回折線後仍在推塔距離內", `最大 ${worstSiegeGap.toFixed(2)}`);
  //  塔自己站的位置必須是「不可走」（它是障礙），但塔腳邊要有可走環（否則推不到）
  let noApproach = [];
  for (const p of PL.list) {
    let found = false;
    for (let k = 0; k < 16 && !found; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const rr of [4, 5, 6, 7, 8]) {
        if (isWalkable(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, HERO_RADIUS)) { found = true; break; }
      }
    }
    if (!found) noApproach.push(p.id);
  }
  ok(noApproach.length === 0, "E3 每座塔都有可站的接近點（8 單位內）", noApproach.join(", "));
  console.log(`E. 塔位側偏最大 ${worstLaneOff.toFixed(2)}｜無接近點的塔 ${noApproach.length} 座`);
}

// ── F. 擋人判定（blocks）必須鏡像一致 ──────────────────────────────────────
{
  const { blocking } = navInfo();
  const by = new Map(blocking.map((b) => [b.id, b]));
  let mismatch = [];
  for (const lane of ["top", "mid", "bot"]) for (let tier = 0; tier < 3; tier++) {
    const a = by.get(`blue_${lane}_${tier}`), b = by.get(`red_${MIRROR_LANE[lane]}_${tier}`);
    if (!a || !b) continue;
    if (a.blocks !== b.blocks) mismatch.push(`${a.id}=${a.blocks} vs ${b.id}=${b.blocks}`);
  }
  const nb = by.get("blue_nexus"), nr = by.get("red_nexus");
  if (nb && nr && nb.blocks !== nr.blocks) mismatch.push(`blue_nexus=${nb.blocks} vs red_nexus=${nr.blocks}`);
  ok(mismatch.length === 0, "F1 擋人判定鏡像一致（藍紅同待遇）", mismatch.join("; "));
  const off = blocking.filter((b) => !b.blocks);
  console.log(`F. 擋人 ${blocking.length - off.length} 個｜放行 ${off.length} 個` +
    (off.length ? `：${off.map((b) => `${b.id}(${b.note})`).join("、")}` : ""));
}

console.log(`\n=== check_moba_nav_h2: ${pass} PASS / ${fail} FAIL ===`);
if (fail) { console.log(fails.map((f, i) => `  ${i + 1}. ${f}`).join("\n")); process.exit(1); }
