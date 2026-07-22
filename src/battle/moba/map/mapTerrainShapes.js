// ============================================================================
//  battle/moba/map/mapTerrainShapes.js — MOBA 地圖視覺原型 v1 的「地形構成」
//
//  Milestone F。把整張地圖的形狀一次算完並輸出成**純資料**（模擬座標），
//  由三個消費端共用同一份真相：
//    · src/battle/moba/map/MobaMapBlockout.jsx  → 轉成 three.js 幾何
//    · tools/preview_moba_map.mjs               → 俯視圖 PNG（無瀏覽器自檢用）
//    · tools/check_moba_map.mjs                 → 結構驗證
//
//  ⚠ 座標真相來源仍是 src/gameData.js（經 mobaMapLayout 讀入）。本檔只做**呈現用
//    衍生形狀**，不改動、不複製任何模擬常數。
//  ⚠ 全部決定性（不使用 Math.random）。
//
//  構圖總則（為什麼長這樣）：
//   · 競技場不是整塊矩形：左上／右下兩個「死角」（沒有任何路經過）被切掉並填成崖體，
//     可行走區變成沿「藍(左下) → 紅(右上)」對角拉長的六邊形 ⇒ 一眼看出對角方向感。
//   · 河道走另一條對角，與 mid lane 在正中央交叉 ⇒ 自然把地圖切成四個野區象限。
//   · 亮度階序：路(最亮) > 河(次亮冷色) > 空地 > 主草地 > 野區草 > 崖體(最暗)，
//     所以關掉標籤後仍能靠明度讀出結構。
// ============================================================================
import {
  smoothPath, wobblePath, ribbonPolygon, offsetPath, blobRing, ringRuns,
  naturalWallRun, pointInPoly, nearestOnPath, wrapDelta, swobble, hash01, TAU,
} from "./mapShapePrimitives.js";
import { WIDTH, HEIGHT, LAYER_Y, PALETTE } from "./mapVisualStyle.js";

const LANES3 = ["top", "mid", "bot"];

/** 競技場輪廓：矩形內縮 3，並切掉左上／右下兩個無路經過的死角（x+y=66 / x+y=374）。 */
function arenaPolygon(B) {
  const m = 3, C = 63; // C = 切角起點距角落的距離
  return [
    { x: B.minX + m, y: B.minY + C }, { x: B.minX + C, y: B.minY + m },
    { x: B.maxX - m, y: B.minY + m },
    { x: B.maxX - m, y: B.maxY - C }, { x: B.maxX - C, y: B.maxY - m },
    { x: B.minX + m, y: B.maxY - m },
  ];
}

/** 多邊形對中心等比縮放（做內縮的崖腳陰影帶）。 */
const scalePoly = (poly, k, cx, cy) => poly.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));

/** 把 run 依「禁區多邊形」切斷（保證牆體不會長在路面／河面／基地平台上）。 */
function filterRuns(runs, blockPolys, minPts = 3) {
  const out = [];
  for (const run of runs) {
    let cur = [];
    for (const p of run) {
      if (blockPolys.some((poly) => pointInPoly(p.x, p.y, poly))) {
        if (cur.length >= minPts) out.push(cur);
        cur = [];
      } else cur.push(p);
    }
    if (cur.length >= minPts) out.push(cur);
  }
  return out;
}

/**
 * 建立整張地圖的地形形狀。
 * @param L buildMobaLayout() 的輸出（座標取自 gameData.js）
 * @returns {{ groundLayers, wallItems, towers, gates, rocks, meta }}
 *   groundLayers: 由後往前疊的地面色塊 [{ id, kind, poly, color, y }]
 *   wallItems:    量體（長方牆段）[{ kind, x, y, angle, len, thick, h }]（x/y/len/thick 為模擬單位、h 為世界高度）
 *   towers:       塔標記規格 [{ id, side, lane, kind, x, y, padR, tiers }]
 *   gates:        入口門柱 [{ key, kind, x, y, angle, scale, color }]
 *   rocks:        裝飾岩 [{ x, y, rot, scale }]
 */
export function buildTerrainShapes(L) {
  const B = L.bounds, cx = B.centerX, cy = B.centerY;
  const ground = [];
  const walls = [];
  const gates = [];
  const push = (id, kind, poly, colorKey, y) => ground.push({ id, kind, poly, color: PALETTE[colorKey], colorKey, y });

  // ══ 1. 地圖底盤與競技場輪廓 ════════════════════════════════════════════
  const boundsPoly = [
    { x: B.minX, y: B.minY }, { x: B.maxX, y: B.minY },
    { x: B.maxX, y: B.maxY }, { x: B.minX, y: B.maxY },
  ];
  const arena = arenaPolygon(B);
  const arenaSmooth = smoothPath(arena, 6, { closed: true });
  push("bedrock", "bedrock", boundsPoly, "bedrock", LAYER_Y.bedrock);
  push("cliff_shadow", "shadow", arenaSmooth, "cliff_shadow", LAYER_Y.cliff_shadow);
  push("arena", "arena", scalePoly(arenaSmooth, 0.965, cx, cy), "grass_arena", LAYER_Y.arena);

  // ══ 2. 三路：把 lane 折線延伸進雙方基地 → 細分 → 擾動 ═══════════════════
  //  兩端各再往基地中心「越過」6 單位，讓路面帶真的把基地包進去（而不是剛好停在
  //  基地座標上 ⇒ 端點落在多邊形邊界，既不好看、驗證也判不到）。
  const beyond = (from, to, d) => {
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    return { x: to.x + Math.cos(a) * d, y: to.y + Math.sin(a) * d };
  };
  const lanePaths = {};
  LANES3.forEach((ln, k) => {
    const raw = L.lanes[ln];
    const pts = [beyond(raw[0], L.bases.blue, 6), ...raw, beyond(raw[raw.length - 1], L.bases.red, 6)];
    lanePaths[ln] = wobblePath(smoothPath(pts, 5), 1.8, 21 + k * 7);
  });
  const laneSurfPoly = {}, laneBlockPoly = {};
  LANES3.forEach((ln, k) => {
    const w = ln === "mid" ? WIDTH.lane_surface_mid : WIDTH.lane_surface;
    const p = lanePaths[ln];
    const shoulder = ribbonPolygon(p, WIDTH.lane_shoulder, { vary: 0.2, seed: 3 + k });
    const edge = ribbonPolygon(p, WIDTH.lane_edge, { vary: 0.15, seed: 31 + k });
    const surf = ribbonPolygon(p, w, { vary: 0.16, seed: 61 + k });
    laneSurfPoly[ln] = surf;
    // 禁區用「與路面同一 seed、同一 vary」再加固定 margin ⇒ 保證每一點都比路面寬。
    // （首版用不同 seed，兩條帶的寬度變化相位不同步，導致 7 段牆長在路面上。）
    laneBlockPoly[ln] = ribbonPolygon(p, w + WIDTH.lane_block_margin, { vary: 0.16, seed: 61 + k });
    push(`lane_${ln}_shoulder`, "lane", shoulder, "lane_shoulder", LAYER_Y.lane_shoulder);
    push(`lane_${ln}_edge`, "lane", edge, "lane_edge", LAYER_Y.lane_edge);
    push(`lane_${ln}_surface`, "lane", surf, "lane_surface", LAYER_Y.lane_surface);
    // mid lane 多一條路心亮帶 ⇒ 成為畫面最明顯的對角線
    if (ln === "mid") {
      push("lane_mid_inlay", "lane", ribbonPolygon(p, WIDTH.lane_inlay, { vary: 0.3, seed: 91 }),
        "lane_inlay", LAYER_Y.lane_inlay);
    }
  });

  // ══ 3. 河道：貫穿中段的四層帶，並以「河灣」把兩坑併進河道 ════════════════
  const riverPath = wobblePath(smoothPath(L.river.points, 5), 2.4, 9);
  //  taper：河的兩端收窄，否則帶子會被硬生生切一刀，讀成「藍色長方形」而不是河。
  const riverPolys = {
    bank: ribbonPolygon(riverPath, WIDTH.river_bank, { vary: 0.22, seed: 5, taper: 0.30 }),
    bed: ribbonPolygon(riverPath, WIDTH.river_bed, { vary: 0.18, seed: 15, taper: 0.26 }),
    water: ribbonPolygon(riverPath, WIDTH.river_water, { vary: 0.14, seed: 25, taper: 0.22 }),
    shallow: ribbonPolygon(riverPath, WIDTH.river_shallow, { vary: 0.32, seed: 35, taper: 0.18 }),
  };

  // ══ 4. 基地高地：三葉形平台（三個葉瓣朝三路出口）══════════════════════════
  const baseInfo = {};
  ["blue", "red"].forEach((side, si) => {
    const b = L.bases[side];
    const laneAngs = LANES3.map((ln) => {
      const p = side === "blue" ? L.lanes[ln][0] : L.lanes[ln][L.lanes[ln].length - 1];
      return Math.atan2(p.y - b.y, p.x - b.x);
    });
    // R 15：基地位於地圖角落，平台再大就會被地圖邊界切掉、讀成「角落色塊」而非高地。
    const R = 15, N = 64;
    const poly = [], angles = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      const d = Math.min(...laneAngs.map((la) => wrapDelta(a, la)));
      const lobe = d < 0.55 ? 8 * (1 - d / 0.55) : 0;   // 朝三路方向鼓出 ⇒ 出口
      const rr = R + lobe + swobble(k, 17 + si, 0.55) * 1.2;
      poly.push({ x: b.x + Math.cos(a) * rr, y: b.y + Math.sin(a) * rr });
      angles.push({ a, d, rr });
    }
    baseInfo[side] = { b, laneAngs, poly, angles, R };
    push(`base_${side}_apron`, "base", poly, side === "blue" ? "high_blue" : "high_red", LAYER_Y.base_apron);
  });

  // ══ 5. 坑：Dragon（寬、開口大、下半區）／ Baron（窄、壁厚、上半區）═════════
  const pitSpec = {
    dragon: { R: 17, gapHalf: 0.74, h: HEIGHT.pit_wall_dragon, thick: 5.2, color: "pit_dragon" },
    baron: { R: 14, gapHalf: 0.50, h: HEIGHT.pit_wall_baron, thick: 7.4, color: "pit_baron" },
  };
  const pits = {};
  ["dragon", "baron"].forEach((kind, i) => {
    const p = L.pits[kind], S = pitSpec[kind];
    // 入口朝河道：取河道最近點的切線方向，坑口開在河的上下游兩側
    const nr = nearestOnPath(riverPath, p);
    const entA = nr.tangent, entB = nr.tangent + Math.PI;
    const gaps = [{ angle: entA, half: S.gapHalf }, { angle: entB, half: S.gapHalf }];
    // 坑底大、色環細：靠形狀（厚壁 + 下凹）辨識，顏色只當輔助，不做成 UI 圓標
    const floorPoly = blobRing(p.x, p.y, S.R * 0.98, { n: 30, amp: 0.1, seed: 40 + i });
    const glowPoly = blobRing(p.x, p.y, S.R * 0.66, { n: 26, amp: 0.12, seed: 44 + i });
    const corePoly = blobRing(p.x, p.y, S.R * 0.56, { n: 22, amp: 0.14, seed: 48 + i });
    // 河灣：從河道最近點切一條水帶進坑口（越過坑心 5 單位，確保整個坑口併進河道）
    const spurEnd = { x: p.x + (p.x - nr.point.x) * 0.45, y: p.y + (p.y - nr.point.y) * 0.45 };
    const spurPath = smoothPath([nr.point, p, spurEnd], 2.5);
    const spurPoly = ribbonPolygon(spurPath, WIDTH.pit_spur, { vary: 0.18, seed: 51 + i });
    pits[kind] = { ...S, x: p.x, y: p.y, entA, entB, gaps, floorPoly, glowPoly, corePoly, spurPoly, spurPath };
    gates.push(
      { key: `ent_${kind}_0`, kind: "pit", x: p.x + Math.cos(entA) * (S.R + 2), y: p.y + Math.sin(entA) * (S.R + 2), angle: entA, scale: 1, color: PALETTE[S.color] },
      { key: `ent_${kind}_1`, kind: "pit", x: p.x + Math.cos(entB) * (S.R + 2), y: p.y + Math.sin(entB) * (S.R + 2), angle: entB, scale: 1, color: PALETTE[S.color] },
    );
  });

  // ══ 6. 禁區遮罩：牆體不得長在路面／河面／基地平台／坑底上 ═══════════════
  const blockPolys = [
    ...LANES3.map((ln) => laneBlockPoly[ln]),
    riverPolys.water,
    ...["blue", "red"].map((s) => baseInfo[s].poly),
    ...["dragon", "baron"].map((k) => pits[k].floorPoly),
    ...["dragon", "baron"].map((k) => pits[k].spurPoly),
  ];

  // ══ 7. 四個野區草地（明度略低於主草地，兩兩交替避免單色）════════════════
  //  野區色塊要「填滿路與河之間」，不能是小圓點，否則讀成草叢而不是一個區域。
  //  以象限中心到地圖中心的方向拉長（squash），讓四塊沿對角鋪開。
  L.quadrants.forEach((q, i) => {
    const rot = Math.atan2(cy - q.y, cx - q.x);
    const poly = blobRing(q.x, q.y, q.r * 2.15, { n: 34, amp: 0.24, seed: 60 + i * 3, squashX: 1.12, squashY: 0.86, rot });
    push(`jungle_${q.id}`, "jungle", poly, i % 2 ? "grass_jungle_alt" : "grass_jungle", LAYER_Y.jungle);
  });

  // 河道畫在野區之上 ⇒ 河把上下（藍/紅）野區切開
  push("river_bank", "river", riverPolys.bank, "river_bank", LAYER_Y.river_bank);
  push("river_bed", "river", riverPolys.bed, "river_bed", LAYER_Y.river_bed);
  push("river_water", "river", riverPolys.water, "river_water", LAYER_Y.river_water);
  push("river_shallow", "river", riverPolys.shallow, "river_shallow", LAYER_Y.river_shallow);
  ["dragon", "baron"].forEach((k) => push(`river_spur_${k}`, "river", pits[k].spurPoly, "river_water", LAYER_Y.river_water + 0.01));

  // 地面色塊需依 y 排序後輸出（push 順序與 y 不完全一致：野區/河在路之前畫）
  // → 統一在最後 sort，消費端只要照陣列順序畫即可。

  // ══ 7b. 樹叢暗斑：打破野區大片死綠（純地面暗色塊，非 Bush/Tree Pack）════
  //  只長在野區象限內、且避開路面/河面/平台；決定性取點，不灑到全圖。
  L.quadrants.forEach((q, qi) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + qi * 0.7;
      const rad = q.r * (0.55 + hash01(i, 90 + qi) * 0.95);
      const p = { x: q.x + Math.cos(a) * rad, y: q.y + Math.sin(a) * rad };
      if (blockPolys.some((poly) => pointInPoly(p.x, p.y, poly))) continue;
      if (!pointInPoly(p.x, p.y, arenaSmooth)) continue;
      push(`grove_${q.id}_${i}`, "jungle",
        blobRing(p.x, p.y, 7 + hash01(i, 95 + qi) * 5, { n: 16, amp: 0.26, seed: 100 + qi * 7 + i }),
        "grass_grove", LAYER_Y.jungle + 0.02);
    }
  });

  // ══ 8. 野區空地（camp / buff 的明確小空間）═════════════════════════════
  L.camps.forEach((c, i) => {
    const r = c.type === "buff" ? 14 : 10.5;
    push(`clearing_${c.id}`, "clearing", blobRing(c.x, c.y, r, { n: 22, amp: 0.18, seed: 80 + i }),
      "grass_clearing", LAYER_Y.clearing);
  });

  // ══ 9. 坑底色塊（畫在河/路之上，讀成下凹地形）═══════════════════════════
  ["dragon", "baron"].forEach((k) => {
    const P = pits[k];
    push(`pit_${k}_floor`, "pit", P.floorPoly, "pit_floor", LAYER_Y.pit_floor);
    ground.push({ id: `pit_${k}_glow`, kind: "pit", poly: P.glowPoly, color: PALETTE[P.color], colorKey: P.color, y: LAYER_Y.pit_ring });
    push(`pit_${k}_core`, "pit", P.corePoly, "pit_floor", LAYER_Y.pit_ring + 0.02);
  });

  // ══ 10. 塔：沿三路排列，外/二/高地以底座與層數區分 ═════════════════════
  //  三個等級靠「底座大小 + 疊層數 + 總高」區分，不只靠顏色。
  const TOWER_SPEC = {
    outer: { padR: 5.0, tiers: [{ r: 3.1, h: 3.0 }, { r: 2.3, h: 5.2 }], crown: 1.6 },
    inner: { padR: 6.2, tiers: [{ r: 3.9, h: 3.4 }, { r: 2.9, h: 6.0 }, { r: 2.1, h: 3.4 }], crown: 1.9 },
    highground: { padR: 7.6, tiers: [{ r: 4.9, h: 3.8 }, { r: 3.6, h: 6.6 }, { r: 2.6, h: 5.0 }], crown: 2.3 },
  };
  const towers = L.towers.filter((t) => t.kind !== "nexus").map((t) => {
    const S = TOWER_SPEC[t.kind] || TOWER_SPEC.outer;
    push(`towerpad_${t.id}`, "tower_pad", blobRing(t.x, t.y, S.padR, { n: 8, amp: 0.05, seed: 5 }),
      "tower_plinth", LAYER_Y.tower_pad);
    return { id: t.id, side: t.side, lane: t.lane, kind: t.kind, x: t.x, y: t.y, padR: S.padR, tiers: S.tiers, crown: S.crown };
  });

  // ══ 11. 量體：競技場外緣崖 ═══════════════════════════════════════════
  const laneSurfaceBlock = LANES3.map((ln) => laneSurfPoly[ln]);
  const rimRuns = filterRuns([[...arenaSmooth, arenaSmooth[0]]], laneSurfaceBlock, 3);
  rimRuns.forEach((run, i) => {
    walls.push(...naturalWallRun(run, {
      seed: 200 + i * 7, step: 3.2, amp: 1.6, height: HEIGHT.cliff_rim, heightVar: 4.5,
      thick: 6, thickVar: 0.34, kind: "cliff",
    }));
  });

  // ══ 12. 量體：左上／右下死角的崖體massif（形成戰場輪廓，而非矩形草皮）════
  //  以數條平行於切角線的山脊往角落遞減，讀成從角落隆起的岩體。
  const cornerMassif = (corner) => {
    const isTL = corner === "tl";
    for (let ridge = 0; ridge < 7; ridge++) {
      const off = 6 + ridge * 8;                      // 距切角線往角落的距離
      const sum = isTL ? 66 - off : 374 + off;        // x+y = sum 的直線
      // 山脊沿 x+y=sum 這條線，兩端夾在地圖界內
      const x0 = isTL ? Math.max(2, sum - (B.maxY - 2)) : Math.max(2, sum - (B.maxY - 2));
      const x1 = isTL ? Math.min(B.maxX - 2, sum - 2) : Math.min(B.maxX - 2, sum - 2);
      const pts = [];
      const steps = 10;
      for (let s = 0; s <= steps; s++) {
        const xx = x0 + (s / steps) * (x1 - x0);
        const yy = sum - xx;
        if (xx < 1 || yy < 1 || xx > B.maxX - 1 || yy > B.maxY - 1) continue;
        pts.push({ x: xx, y: yy });
      }
      if (pts.length < 3) continue;
      walls.push(...naturalWallRun(pts, {
        seed: 300 + (isTL ? 0 : 50) + ridge * 9, step: 3.4, amp: 2.0,
        height: HEIGHT.cliff_corner - ridge * 1.9, heightVar: 3.4,
        thick: 10 - ridge * 0.7, thickVar: 0.4, kind: "cliff_mass",
      }));
    }
  };
  cornerMassif("tl"); cornerMassif("br");

  // ══ 13. 量體：野區岩壁（gameData 的 8 條牆鏈 → 連續弧形岩壁）═════════════
  //  WALLS = BLUE_WALLS(4/4/3/3 點) + RED_WALLS(180° 鏡射) ⇒ 還原成 8 條牆鏈。
  const WALL_CHAINS = [[0, 4], [4, 8], [8, 11], [11, 14], [14, 18], [18, 22], [22, 25], [25, 28]];
  const jungleChains = WALL_CHAINS.map(([s, e]) => L.walls.slice(s, e));
  jungleChains.forEach((chain, ci) => {
    const avgR = chain.reduce((m, w) => m + (w.r ?? 6), 0) / chain.length;
    const dense = wobblePath(smoothPath(chain, 2.3), 2.4, ci * 13 + 3);
    filterRuns([dense], blockPolys, 3).forEach((run, ri) => {
      walls.push(...naturalWallRun(run, {
        seed: ci * 13 + 3 + ri, step: 2.3, amp: 0.9,
        height: HEIGHT.jungle_wall, heightVar: HEIGHT.jungle_wall_var,
        thick: avgR * 1.2, thickVar: 0.42, kind: "wall",
      }));
    });
  });

  // ══ 14. 量體：營地口袋牆（讓 Buff / camp 位於明確小空間，並留繞行入口）════
  L.camps.forEach((c, i) => {
    const r = c.type === "buff" ? 17 : 13;
    const toCenter = Math.atan2(cy - c.y, cx - c.x);
    const runs = ringRuns(c.x, c.y, r, [
      { angle: toCenter, half: 0.75 }, { angle: toCenter + Math.PI, half: 0.75 },
    ], { n: 40, amp: 0.1, seed: 120 + i * 4 });
    filterRuns(runs, blockPolys, 3).forEach((run, ri) => {
      walls.push(...naturalWallRun(run, {
        seed: 120 + i * 4 + ri, step: 2.2, amp: 0.7,
        height: c.type === "buff" ? 8.0 : 6.6, heightVar: 2.4,
        thick: 5.4, thickVar: 0.35, kind: "wall",
      }));
    });
    gates.push({
      key: `junent_${c.id}`, kind: "jungle",
      x: c.x + Math.cos(toCenter) * (r + 1.5), y: c.y + Math.sin(toCenter) * (r + 1.5),
      angle: toCenter, scale: 0.72, color: PALETTE.camp_marker,
    });
  });

  // ══ 15. 量體：坑壁（馬蹄形厚壁，斷口＝朝河入口）═════════════════════════
  ["dragon", "baron"].forEach((kind, i) => {
    const P = pits[kind];
    const runs = ringRuns(P.x, P.y, P.R, P.gaps, { n: 52, amp: 0.08, seed: 70 + i * 6 });
    runs.forEach((run, ri) => {
      walls.push(...naturalWallRun(run, {
        seed: 70 + i * 6 + ri, step: 2.0, amp: 0.55,
        height: P.h, heightVar: 3.0, thick: P.thick, thickVar: 0.36, kind: "pit_wall",
      }));
    });
  });

  // ══ 16. 量體：基地 rim（沿三葉平台外緣，三路方向留缺口）═══════════════════
  ["blue", "red"].forEach((side, si) => {
    const I = baseInfo[side];
    let cur = [];
    const flush = (ri) => {
      if (cur.length >= 3) {
        walls.push(...naturalWallRun(cur, {
          seed: 400 + si * 11 + ri, step: 2.2, amp: 0.6,
          height: HEIGHT.base_rim, heightVar: 2.2, thick: 5.0, thickVar: 0.3, kind: "base_rim",
        }));
      }
      cur = [];
    };
    I.angles.forEach((A, k) => {
      // 缺口＝三路出口。0.46 rad ≈ 在半徑 23 處讓出 ~21 單位寬，確實容得下路面帶
      // （首版 0.34 剛好等於路面半寬的角度，rim 會壓在路上）。
      if (A.d < 0.46) { flush(k); return; }
      cur.push({ x: I.b.x + Math.cos(A.a) * (A.rr + 1.2), y: I.b.y + Math.sin(A.a) * (A.rr + 1.2) });
    });
    flush(999);
    // 三路出口坡道 + 門柱
    I.laneAngs.forEach((a, li) => {
      const path = smoothPath([
        { x: I.b.x + Math.cos(a) * I.R * 0.3, y: I.b.y + Math.sin(a) * I.R * 0.3 },
        { x: I.b.x + Math.cos(a) * (I.R + 12), y: I.b.y + Math.sin(a) * (I.R + 12) },
      ], 2.5);
      ground.push({
        id: `ramp_${side}_${LANES3[li]}`, kind: "ramp",
        poly: ribbonPolygon(path, 12, { vary: 0.12, seed: 71 + li }),
        color: PALETTE.lane_surface, colorKey: "lane_surface",
        y: HEIGHT.base_platform + 0.12,                 // 畫在高地平台頂面上
      });
      gates.push({
        key: `baseent_${side}_${LANES3[li]}`, kind: "base",
        x: I.b.x + Math.cos(a) * (I.R + 4), y: I.b.y + Math.sin(a) * (I.R + 4), angle: a,
        scale: 1.05, color: side === "blue" ? PALETTE.nexus_blue : PALETTE.nexus_red,
      });
    });
  });

  // ══ 17. 河岸石（泥/石岸過渡；少量、只沿河，不灑滿地）═══════════════════
  [1, -1].forEach((sgn, si) => {
    const bankLine = offsetPath(riverPath, sgn * (WIDTH.river_water / 2 + 2.5));
    const dense = smoothPath(bankLine, 3.5);
    for (let i = 3; i < dense.length - 3; i += 5) {
      const p = dense[i];
      if (blockPolys.some((poly) => pointInPoly(p.x, p.y, poly))) continue;
      const nxt = dense[i + 1];
      walls.push({
        kind: "river_stone", x: p.x, y: p.y,
        angle: Math.atan2(nxt.x - p.x, nxt.y - p.y),
        len: 3.4 + hash01(i, 9 + si) * 2.6, thick: 3.0 + hash01(i, 21 + si) * 2.2,
        h: HEIGHT.river_stone * (0.7 + hash01(i, 33 + si) * 0.7),
      });
    }
  });

  // ══ 18. 裝飾岩：只放在牆鏈端點與崖腳，不平均灑滿地 ═════════════════════
  const rocks = [];
  jungleChains.forEach((chain, ci) => {
    [chain[0], chain[chain.length - 1]].forEach((w, j) => {
      rocks.push({ x: w.x, y: w.y, rot: (ci * 2 + j) * (Math.PI / 5), scale: Math.min(2.4, Math.max(1.5, (w.r ?? 6) * 0.32)) });
    });
  });
  [["tl", 30], ["br", 190]].forEach(([c, base], k) => {
    for (let i = 0; i < 5; i++) {
      const t = 0.12 + i * 0.19;
      const sum = c === "tl" ? 72 : 368;
      const xx = c === "tl" ? 6 + t * (sum - 12) : (sum - 214) + t * (214 - (sum - 214));
      const yy = sum - xx;
      rocks.push({ x: xx, y: yy, rot: (i + k) * 0.9, scale: 2.0 + hash01(i, base) * 0.8 });
    }
  });

  // ══ 19. 收斂到地圖邊界 ═══════════════════════════════════════════════
  //  基地在地圖角落、河岸帶很寬、崖體山脊貼著角落 ⇒ 一定會有形狀超出 0..220。
  //  地面色塊「夾」進邊界（等於被地圖邊界裁切，視覺上正確）；
  //  量體則直接丟掉中心越界的段（免得出現半截浮空的牆）。
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  for (const layer of ground) {
    layer.poly = layer.poly.map((p) => ({ x: clamp(p.x, B.minX, B.maxX), y: clamp(p.y, B.minY, B.maxY) }));
  }
  //  另外做一次「不可站在路上」的最終保險：naturalWallRun 的側向擾動是在 filterRuns
  //  之後才施加的，個別段仍可能漂到路面上，這裡以最終座標再篩一次。
  //  （崖體例外：地圖外緣崖與路肩本來就該貼在一起。）
  const noStand = [...LANES3.map((ln) => laneSurfPoly[ln]), ...["blue", "red"].map((s) => baseInfo[s].poly)];
  const inBounds = (w) => w.x >= B.minX && w.x <= B.maxX && w.y >= B.minY && w.y <= B.maxY;
  const kept = walls.filter((w) => inBounds(w) &&
    (w.kind === "cliff" || w.kind === "cliff_mass" || !noStand.some((poly) => pointInPoly(w.x, w.y, poly))));
  walls.length = 0; walls.push(...kept);

  ground.sort((a, b) => a.y - b.y);

  return {
    groundLayers: ground,
    wallItems: walls,
    towers,
    gates,
    rocks,
    meta: {
      arena, arenaSmooth, lanePaths, laneSurfPoly, riverPath, riverPolys, pits, baseInfo,
      bounds: B,
      nexus: ["blue", "red"].map((side) => ({
        side, x: L.bases[side].x, y: L.bases[side].y,
        fountain: { ...L.fountains[side] },
        color: side === "blue" ? PALETTE.nexus_blue : PALETTE.nexus_red,
        platformColor: side === "blue" ? PALETTE.high_blue : PALETTE.high_red,
        platformTop: side === "blue" ? PALETTE.high_blue_top : PALETTE.high_red_top,
        poly: baseInfo[side].poly, R: baseInfo[side].R,
      })),
      camps: L.camps.map((c) => ({ ...c })),
    },
  };
}
