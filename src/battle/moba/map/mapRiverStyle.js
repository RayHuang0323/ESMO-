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
//  ⚠ Topology Final（2026-10-06）取代了上面「兩條河臂只在坑與中央之間」的 G.1 規則：
//    河道改為**貫通上下路**（上路河口 → 巴龍池 → 中央涉水點 → 小龍池 → 下路河口），
//    只生成巴龍側半條、小龍側 180° 鏡射；坑周張成水潭，岸石移除（河岸阻擋改由
//    mapJungleTopology 的野區量體提供）。實作見本檔下半部 buildRiverPlan。
//
//  【水的層次】深水 → 淺水 → 淺灘 → 沙洲 → 泥岸 → 濕草，共 6 階，全部低彩度。
//
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()（形狀必須每次相同）。
//  ⚠ 不改動 gameData.js：河道中心線仍取自 RIVER.points 與 PITS（經 layout 傳入）。
// ============================================================================
import {
  smoothPath, wobblePath, ribbonPolygon, blobRing,
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

// ── Topology Final（2026-10-06）：完整河道＋180° 精確鏡像 ─────────────────
//  舊版兩條河臂各用不同 seed 生成（11 / 17）、岸石兩側各自取樣 ⇒ 河道不是鏡像，
//  導航距離場的鏡像聯集就在對岸生出畫面上不存在的阻擋。現在只生成**巴龍側半條河**
//  （上路河口外側 → 上路河口 → 巴龍池 → 中央），小龍側一律 180° 旋轉。
//  河道兩端延伸到三路外側、流進邊界崖壁底下（LoL：河道連通上下路，是轉線與 gank 的主幹）。

// 河臂寬度曲線（t=0 在中央端、t=1 在外側端）。巴龍坑約在 t≈0.45 ⇒ 河在坑周張成水潭。
const ARM_PROFILE = widthProfile([
  [0.00, 1.05], [0.14, 0.92], [0.30, 1.30], [0.45, 1.70], [0.60, 1.30],
  [0.74, 0.96], [0.86, 1.00], [1.00, 1.10],
]);
// 中央涉水點：中路穿過的地方收成淺灘（不做深水，中路讀成「涉水而過」）。
const FORD_PROFILE = widthProfile([[0.0, 1.0], [1.0, 0.72]]);

/** 河的每一段共用的 6 層外框（由外而內）。 */
function riverBands(path, profile, seed) {
  return {
    wetgrass: ribbonPolygon(path, WIDTH.river_wetgrass, { vary: 0.18, seed: seed + 1, profile, taper: 1 }),
    bank: ribbonPolygon(path, WIDTH.river_bank, { vary: 0.16, seed: seed + 2, profile, taper: 1 }),
    shoal: ribbonPolygon(path, WIDTH.river_shoal, { vary: 0.15, seed: seed + 3, profile, taper: 1 }),
    water: ribbonPolygon(path, WIDTH.river_water, { vary: 0.12, seed: seed + 4, profile, taper: 1 }),
    deep: ribbonPolygon(path, WIDTH.river_deep, { vary: 0.22, seed: seed + 5, profile, taper: 0.55 }),
  };
}

/**
 * 建立整套水系的形狀（巴龍側生成、小龍側 180° 鏡射）。
 * @param L buildMobaLayout() 的輸出（核心座標 0..220）
 * @returns {{ parts, sandbars, stones, waterPolys, bankPolys, meta }}
 */
export function buildRiverPlan(L) {
  const cx = L.bounds.centerX, cy = L.bounds.centerY;
  const R = L.river.points;
  const center = { x: cx, y: cy };
  const mirPt = (p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y });
  const mirPoly = (poly) => poly && poly.map(mirPt);
  const mirBands = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, mirPoly(v)]));
  //  RIVER.points：0..3 = 巴龍側（外 → 中央前），4 = 中央。
  const ci = R.findIndex((p) => Math.hypot(p.x - cx, p.y - cy) < 1e-6);
  const ctrl = [center, ...R.slice(0, ci).reverse()];        // 中央 → 外側
  const GAP = 9;                                               // 中央讓給涉水點
  const dense = wobblePath(smoothPath(ctrl, 2.0), 1.1, 23);
  const path = trimPath(dense, GAP, 0);
  const parts = [];
  const armPaths = { baron: path, dragon: path.map(mirPt) };
  const armBands = riverBands(path, ARM_PROFILE, 20);
  parts.push({ id: "arm_baron", kind: "arm", path, bands: armBands });
  parts.push({ id: "arm_dragon", kind: "arm", path: armPaths.dragon, bands: mirBands(armBands) });
  const armEnds = {
    baron: { start: path[0], end: path[path.length - 1] },
    dragon: { start: mirPt(path[0]), end: mirPt(path[path.length - 1]) },
  };

  // ── 中央涉水點：兩半各一條短帶（中央 → 河臂起點），鏡射成對 ──────────────
  const fordHalf = smoothPath([center, path[0], path[Math.min(path.length - 1, 3)]], 1.6);
  const fordBands = {
    wetgrass: ribbonPolygon(fordHalf, WIDTH.ford * 1.45, { vary: 0, profile: FORD_PROFILE }),
    bank: ribbonPolygon(fordHalf, WIDTH.ford * 1.2, { vary: 0, profile: FORD_PROFILE }),
    shoal: ribbonPolygon(fordHalf, WIDTH.ford, { vary: 0, profile: FORD_PROFILE }),
    water: ribbonPolygon(fordHalf, WIDTH.ford * 0.52, { vary: 0, profile: FORD_PROFILE }),
    deep: null,
  };
  parts.push({ id: "ford_baron", kind: "ford", path: fordHalf, bands: fordBands });
  parts.push({ id: "ford_dragon", kind: "ford", path: fordHalf.map(mirPt), bands: mirBands(fordBands) });
  const fordPath = [...fordHalf.slice().reverse(), ...fordHalf.slice(1).map(mirPt)];

  // ── 坑周水潭：河在坑周張成一圈淺水（坑本身是池中的石砌台）──────────────
  const mouths = {};
  {
    const p = L.pits.baron;
    const near = nearestIndex(path, p);
    const seg = path.slice(Math.max(0, near - 9), Math.min(path.length, near + 10));
    const pool = {
      wetgrass: blobRing(p.x, p.y, 27.5, { n: 40, amp: 0.05, seed: 61 }),
      bank: blobRing(p.x, p.y, 24.5, { n: 40, amp: 0.05, seed: 62 }),
      shoal: blobRing(p.x, p.y, 22, { n: 40, amp: 0.045, seed: 63 }),
      water: blobRing(p.x, p.y, 19.5, { n: 40, amp: 0.04, seed: 64 }),
      deep: null,
    };
    mouths.baron = { path: seg, bands: pool };
    mouths.dragon = { path: seg.map(mirPt), bands: mirBands(pool) };
    parts.push({ id: "mouth_baron", kind: "mouth", path: seg, bands: pool });
    parts.push({ id: "mouth_dragon", kind: "mouth", path: mouths.dragon.path, bands: mouths.dragon.bands });
  }

  // ── 沙洲：巴龍側取樣，小龍側鏡射 ───────────────────────────────────────
  const sandbars = [];
  [0.2, 0.78].forEach((t, j) => {
    const idx = Math.round(t * (path.length - 1));
    const p = path[idx], nb = path[Math.min(path.length - 1, idx + 1)];
    let dx = nb.x - p.x, dy = nb.y - p.y;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const off = (j % 2 ? 1 : -1) * (2.0 + hash01(j, 7) * 1.6);
    const poly = blobRing(p.x - dy * off, p.y + dx * off, 3.6 + hash01(j, 13) * 1.8,
      { n: 16, amp: 0.3, seed: 70 + j, squashX: 1.5, squashY: 0.7, rot: Math.atan2(dy, dx) });
    sandbars.push({ id: `sandbar_baron_${j}`, poly });
    sandbars.push({ id: `sandbar_dragon_${j}`, poly: mirPoly(poly) });
  });

  //  岸石移除：河道步道（中心線 ±10）一律可走，河岸的阻擋改由野區量體（mapJungleTopology）
  //  提供，這樣畫面上的岸與導航的岸是同一份多邊形。
  const stones = [];

  return {
    parts, sandbars, stones,
    waterPolys: parts.map((p) => p.bands.water).filter(Boolean),
    bankPolys: parts.map((p) => p.bands.bank).filter(Boolean),
    meta: { armPaths, armEnds, fordPath, mouths, center, gap: GAP },
  };
}

function nearestIndex(pts, p) {
  let best = 0, bd = Infinity;
  pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = i; } });
  return best;
}
