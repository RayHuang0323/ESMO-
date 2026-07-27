// ============================================================================
//  battle/moba/map/mapRiverStyle.js — 河道的形狀語言（Milestone G.1）
//
//  【為什麼要拆這一支】
//  v1 的河是「把 gameData 的 7 點河道折線整條拉成一條 50 單位寬的等寬帶」⇒
//  畫面上是一條從左上角貫穿到右下角的粗藍色對角線，比三路還搶眼，把整張地圖
//  切成兩半。人工目視的結論是「不像 MOBA 地圖」。
//
//  【G.1 的河道語言】不是一條大水道，而是**三段式水系**：
//    ① 中央交會淺灘（ford）：河在正中央收成最窄的淺水，中路直接涉水通過
//       ⇒ 中路仍然是「基地連基地」的一條路，不是被河切斷。
//    ② 兩條河臂（arm）：由中央往 Baron（西北）與 Dragon（東南）延伸，
//       寬度沿路變化（河灣 → 窄河道 → 河口），不是等寬長方帶。
//    ③ 兩個坑口水域（mouth）：河臂末端在坑口張開成水域，把坑自然併進河系，
//       而不是靠一條粗河硬串起來。
//  河的兩端**不再碰到地圖邊界**：地圖左上／右下角回歸成野區與崖體。
//
//  【水的層次】深水 → 淺水 → 淺灘 → 沙洲 → 泥岸 → 濕草，共 6 階，全部低彩度。
//
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()（形狀必須每次相同）。
//  ⚠ 不改動 gameData.js：河道中心線仍取自 RIVER.points 與 PITS（經 layout 傳入）。
// ============================================================================
import {
  smoothPath, wobblePath, ribbonPolygon, offsetPath, blobRing,
  widthProfile, pathLength, hash01,
} from "./mapShapePrimitives.js";
import { WIDTH } from "./mapVisualStyle.js";

/** 依弧長裁掉折線頭尾（單位＝模擬單位）。用來讓河臂「離中心一段距離才開始」。 */
function trimPath(pts, fromStart = 0, fromEnd = 0) {
  const total = pathLength(pts);
  if (total <= fromStart + fromEnd + 1) return pts.slice();
  let acc = 0, i0 = 0, i1 = pts.length - 1;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc >= fromStart) { i0 = i; break; }
  }
  acc = 0;
  for (let i = pts.length - 1; i > 0; i--) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc >= fromEnd) { i1 = i; break; }
  }
  return pts.slice(i0, Math.max(i0 + 2, i1 + 1));
}

// 河臂的寬度曲線（t=0 在中央端、t=1 在坑口端）。
//  0.30 附近收到 0.5 倍 ⇒ 河臂中段是**窄河道**；兩端張開 ⇒ 河灣與河口。
const ARM_PROFILE = widthProfile([
  [0.00, 1.25], [0.14, 1.05], [0.36, 0.62], [0.54, 0.78],
  [0.74, 1.10], [0.90, 1.35], [1.00, 1.42],
]);
// 涉水點：正中央最窄，往兩側張開去接河臂。
const FORD_PROFILE = widthProfile([[0.0, 1.15], [0.5, 0.66], [1.0, 1.15]]);
// 坑口水域：最寬處刻意落在**坑口**（t≈0.45）而不是坑心，
// 否則整片水都被坑底色塊蓋住，看起來就變成「坑跟河沒有連在一起」。
const MOUTH_PROFILE = widthProfile([[0.0, 0.62], [0.45, 1.30], [0.78, 0.92], [1.0, 0.55]]);

/** 河的每一段共用的 6 層外框（由外而內）。 */
function riverBands(path, profile, seed) {
  return {
    wetgrass: ribbonPolygon(path, WIDTH.river_wetgrass, { vary: 0.26, seed: seed + 1, profile, taper: 0.55 }),
    bank: ribbonPolygon(path, WIDTH.river_bank, { vary: 0.24, seed: seed + 2, profile, taper: 0.5 }),
    shoal: ribbonPolygon(path, WIDTH.river_shoal, { vary: 0.22, seed: seed + 3, profile, taper: 0.45 }),
    water: ribbonPolygon(path, WIDTH.river_water, { vary: 0.18, seed: seed + 4, profile, taper: 0.4 }),
    deep: ribbonPolygon(path, WIDTH.river_deep, { vary: 0.30, seed: seed + 5, profile, taper: 0.3 }),
  };
}

/**
 * 建立整套水系的形狀。
 * @param L buildMobaLayout() 的輸出
 * @returns {{ parts, sandbars, stones, waterPolys, bankPolys, meta }}
 *   parts:   [{ id, kind, path, bands }]  bands = {wetgrass,bank,shoal,water,deep}
 *   sandbars:[{ id, poly }]               河中沙洲（打破大片水色）
 *   stones:  [{ x,y,angle,len,thick,h }]  岸邊/涉水點的石頭（量體）
 */
export function buildRiverPlan(L) {
  const cx = L.bounds.centerX, cy = L.bounds.centerY;
  const R = L.river.points;
  const center = { x: cx, y: cy };

  // ── 河臂中心線：中央 → 中繼點（沿用 gameData 河道折線）→ 坑心 ────────────
  //   RIVER.points = [(42,38)…(110,110)…(178,182)]，索引 3 就是地圖中心；
  //   只取「中心 → 坑」這兩段，地圖四角的河道整段捨棄（河不再貫穿全圖）。
  const armCtrl = {
    baron: [center, R[2], R[1], L.pits.baron],
    dragon: [center, R[4], R[5], L.pits.dragon],
  };

  const GAP = 11;   // 河臂距地圖中心的起點距離 ⇒ 中央讓出一段給涉水點與中路兩塔
  const PIT_BACK = 9; // 河臂在坑外就停住，剩下的交給「坑口水域」

  const parts = [];
  const armEnds = {};
  const armPaths = {};
  ["baron", "dragon"].forEach((key, i) => {
    const dense = wobblePath(smoothPath(armCtrl[key], 2.2), 1.9, 11 + i * 6);
    const path = trimPath(dense, GAP, PIT_BACK);
    armPaths[key] = path;
    armEnds[key] = { start: path[0], end: path[path.length - 1] };
    parts.push({ id: `arm_${key}`, kind: "arm", path, bands: riverBands(path, ARM_PROFILE, 20 + i * 10) });
  });

  // ── 中央涉水點：接起兩條河臂的起點，正中央最窄 ─────────────────────────
  //   刻意**不做深水**：中央是淺灘，中路才能讀成「涉水而過」而不是「被河切斷」。
  const fordPath = wobblePath(
    smoothPath([armEnds.baron.start, center, armEnds.dragon.start], 1.8), 0.8, 41);
  const fordBands = {
    wetgrass: ribbonPolygon(fordPath, WIDTH.ford * 1.45, { vary: 0.2, seed: 42, profile: FORD_PROFILE }),
    bank: ribbonPolygon(fordPath, WIDTH.ford * 1.2, { vary: 0.2, seed: 43, profile: FORD_PROFILE }),
    shoal: ribbonPolygon(fordPath, WIDTH.ford, { vary: 0.18, seed: 44, profile: FORD_PROFILE }),
    water: ribbonPolygon(fordPath, WIDTH.ford * 0.52, { vary: 0.16, seed: 45, profile: FORD_PROFILE }),
    deep: null,
  };
  parts.push({ id: "ford", kind: "ford", path: fordPath, bands: fordBands });

  // ── 坑口水域：河臂末端 → 坑心 → 越過坑心一小段（確保整個坑口併進河系）────
  const mouths = {};
  ["baron", "dragon"].forEach((key, i) => {
    const p = L.pits[key];
    // 起點取「河臂上距坑心約 22 單位」的那一點，而不是河臂端點：
    // 河臂端點離坑可能只剩 6 單位，坑口水域會短到讀不出來（實測 Dragon 只有 8.8 長）。
    const arm = armPaths[key];
    const from = [...arm].reverse().find((q) => Math.hypot(q.x - p.x, q.y - p.y) >= 22) ?? arm[0];
    let dx = p.x - from.x, dy = p.y - from.y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const beyond = { x: p.x + dx * 13, y: p.y + dy * 13 };
    const path = smoothPath([from, p, beyond], 2.0);
    const bands = {
      wetgrass: ribbonPolygon(path, WIDTH.pit_mouth * 1.55, { vary: 0.2, seed: 60 + i, profile: MOUTH_PROFILE }),
      bank: ribbonPolygon(path, WIDTH.pit_mouth * 1.2, { vary: 0.2, seed: 62 + i, profile: MOUTH_PROFILE }),
      shoal: ribbonPolygon(path, WIDTH.pit_mouth, { vary: 0.18, seed: 64 + i, profile: MOUTH_PROFILE }),
      water: ribbonPolygon(path, WIDTH.pit_mouth * 0.78, { vary: 0.16, seed: 66 + i, profile: MOUTH_PROFILE }),
      deep: ribbonPolygon(path, WIDTH.pit_mouth * 0.4, { vary: 0.24, seed: 68 + i, profile: MOUTH_PROFILE }),
    };
    mouths[key] = { path, bands };
    parts.push({ id: `mouth_${key}`, kind: "mouth", path, bands });
  });

  // ── 沙洲：河臂寬處露出的地，打破大片同色水面 ────────────────────────────
  const sandbars = [];
  ["baron", "dragon"].forEach((key, i) => {
    const path = armPaths[key];
    [0.14, 0.78].forEach((t, j) => {
      const idx = Math.round(t * (path.length - 1));
      const p = path[idx];
      const off = (j % 2 ? 1 : -1) * (2.2 + hash01(j, 7 + i) * 2.4);
      const nb = path[Math.min(path.length - 1, idx + 1)];
      let dx = nb.x - p.x, dy = nb.y - p.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      sandbars.push({
        id: `sandbar_${key}_${j}`,
        poly: blobRing(p.x - dy * off, p.y + dx * off, 4.6 + hash01(j, 13 + i) * 2.2,
          { n: 16, amp: 0.3, seed: 70 + i * 3 + j, squashX: 1.5, squashY: 0.7, rot: Math.atan2(dy, dx) }),
      });
    });
  });

  // ── 岸石：只沿河臂兩岸放，數量少、貼著水邊 ─────────────────────────────
  const stones = [];
  ["baron", "dragon"].forEach((key, i) => {
    const path = armPaths[key];
    [1, -1].forEach((sgn, si) => {
      const line = smoothPath(offsetPath(path, sgn * (WIDTH.river_shoal / 2 + 1.6)), 4.2);
      for (let k = 2; k < line.length - 2; k += 4) {
        const p = line[k], q = line[k + 1];
        stones.push({
          kind: "river_stone", x: p.x, y: p.y,
          angle: Math.atan2(q.x - p.x, q.y - p.y),
          len: 3.0 + hash01(k, 9 + si + i * 4) * 2.4,
          thick: 2.6 + hash01(k, 21 + si + i * 4) * 2.0,
          h: 1.6 + hash01(k, 33 + si + i * 4) * 2.2,
        });
      }
    });
  });

  return {
    parts, sandbars, stones,
    waterPolys: parts.map((p) => p.bands.water).filter(Boolean),
    bankPolys: parts.map((p) => p.bands.bank).filter(Boolean),
    meta: { armPaths, armEnds, fordPath, mouths, center, gap: GAP },
  };
}
