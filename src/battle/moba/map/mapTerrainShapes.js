// ============================================================================
//  battle/moba/map/mapTerrainShapes.js — MOBA 地圖的「地形構成」總裝
//
//  Milestone F 建立、Milestone G.1（Structure & Readability Pass）重寫。
//  把整張地圖的形狀一次算完並輸出成**純資料**（模擬座標），由三個消費端共用
//  同一份真相：
//    · src/battle/moba/map/MobaMapBlockout.jsx  → 轉成 three.js 幾何
//    · tools/preview_moba_map.mjs               → 俯視圖 PNG（無瀏覽器自檢用）
//    · tools/check_moba_map.mjs                 → 結構驗證
//
//  ⚠ 座標真相來源仍是 src/gameData.js（經 mobaMapLayout 讀入）。本檔只做**呈現用
//    衍生形狀**，不改動、不複製任何模擬常數。
//  ⚠ 全部決定性（不使用 Math.random）。
//
//  【本檔的角色】只做「總裝與疊層順序」。各系統的形狀語言各自拆檔：
//    mapLaneStyle.js        三路的 4 階帶狀與路面色斑
//    mapRiverStyle.js       水系（中央涉水點 + 兩條河臂 + 兩個坑口水域）
//    mapBaseLayoutStyle.js  主堡台 / 內牆 / 高地平台 / 城牆 / 高地走廊
//    mapTowerLayoutStyle.js 三階塔位規格
//
//  【G.1 的構圖總則】
//   · 讀圖順序要是：**基地 → 高地塔 → 內塔 → 外塔 → 河/中央交戰區**。
//     所以由基地往外，地表明度與量體尺寸都遞減，河只出現在中央與兩坑之間。
//   · 河不再貫穿全圖：地圖左上／右下角是崖體與野區，不是水。
//   · 中路在正中央以「涉水點」跨過河，河在此收到最窄 ⇒ 中路仍是一條完整的路。
//   · 每一種地形至少三階明度（草 6 階、路 4 階、水 6 階）⇒ 關掉標籤仍可讀。
// ============================================================================
import {
  smoothPath, wobblePath, ribbonPolygon, blobRing, ringRuns, offsetPath,
  naturalWallRun, pointInPoly, nearestOnPath, swobble, hash01, TAU,
} from "./mapShapePrimitives.js";
import { WIDTH, HEIGHT, LAYER_Y, BASE_TOP_Y, PALETTE } from "./mapVisualStyle.js";
import { buildLanePlan, LANES3 } from "./mapLaneStyle.js";
import { alignHighgroundTowers } from "./mapBaseFrame.js";
import { buildRiverPlan } from "./mapRiverStyle.js";
import { buildBasePlan, BASE_GEO } from "./mapBaseLayoutStyle.js";
import { buildTowerPlan } from "./mapTowerLayoutStyle.js";
import { buildMonsters } from "./mapMonsterShapes.js";
import { buildCampPlan, CAMP_SIZE } from "./mapCampLayout.js";
import { buildBushCover, bushReach } from "./mapBushCover.js";
import { buildJungleMasses, buildBoundaryMasses, buildTrailPaths, JUNGLE_TOPOLOGY_VERSION, TOPOLOGY_CLEAR } from "./mapJungleTopology.js";
import { translateRiftSpatial } from './riftLayoutGeometry.js';
import { RIFT_DESIGN_SPAN } from './riftMapMetrics.js';
import { clearRiftLaneWalls } from './riftLaneClearance.js';

/** 競技場輪廓：矩形內縮 3，並切掉左上／右下兩個無路經過的死角。 */
function arenaPolygon(B) {
  const m = 3, C = 60; // C = 切角起點距角落的距離
  return [
    { x: B.minX + m, y: B.minY + C }, { x: B.minX + C, y: B.minY + m },
    { x: B.maxX - m, y: B.minY + m },
    { x: B.maxX - m, y: B.maxY - C }, { x: B.maxX - C, y: B.maxY - m },
    { x: B.minX + m, y: B.maxY - m },
  ];
}

/** 多邊形重心（拿來判斷「這塊裝飾是不是落在基地淨空圓裡」）。 */
function centroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}

/** 多邊形對中心等比縮放（做內縮的崖腳陰影帶）。 */
const scalePoly = (poly, k, cx, cy) => poly.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));

/** 把 run 依「禁區多邊形」切斷（保證牆體不會長在路面／水面／基地平台上）。 */
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
 * 入口的「岩壁收口」：從環狀牆的缺口兩側，各往缺口內延伸一小段**變矮的**牆。
 *
 * G.3 用它取代 G.2 的「入口門柱」。門柱是兩根獨立的發光柱子，
 * 在真實 MOBA 地圖上不存在，一看就會讓人問「這是什麼？」。
 * 收口則是同一道岩壁自然收窄變矮，讀成地形，不是道具。
 *
 * @param gaps [{ angle, half }] 與 ringRuns 用的同一組缺口
 * @param baseH 主牆高度（收口由此遞減）
 */
function entranceTaper(cx0, cy0, r, gaps, { baseH, thick, seed = 0, span = 0.20 }) {
  const out = [];
  gaps.forEach((g, gi) => {
    [-1, 1].forEach((sgn, si) => {
      // 兩段：外段 0.62 倍高、內段 0.34 倍高 ⇒ 岩壁往開口方向逐級沉下去
      [[0, 0.5, 0.62], [0.5, 1, 0.34]].forEach(([u0, u1, hk], k) => {
        const pts = [];
        for (let i = 0; i <= 4; i++) {
          const u = u0 + ((u1 - u0) * i) / 4;
          const a = g.angle + sgn * (g.half - u * span);
          pts.push({ x: cx0 + Math.cos(a) * r, y: cy0 + Math.sin(a) * r });
        }
        out.push(...naturalWallRun(pts, {
          seed: seed + gi * 7 + si * 3 + k, step: 1.8, amp: 0.25,
          height: baseH * hk, heightVar: 0.6,
          thick: thick * (0.9 - k * 0.25), thickVar: 0.12, kind: "entrance_taper",
        }));
      });
    });
  });
  return out;
}

/**
 * 建立整張地圖的地形形狀。
 * @param L buildMobaLayout() 的輸出（座標取自 gameData.js）
 * @returns {{ groundLayers, wallItems, towers, gates, rocks, meta }}
 */
export function buildTerrainShapes(L) {
  const offset = (L.bounds.width - RIFT_DESIGN_SPAN) / 2;
  const core = translateRiftSpatial(L, -offset);
  core.bounds = { minX:0, minY:0, maxX:RIFT_DESIGN_SPAN, maxY:RIFT_DESIGN_SPAN,
    width:RIFT_DESIGN_SPAN, height:RIFT_DESIGN_SPAN,
    centerX:RIFT_DESIGN_SPAN/2, centerY:RIFT_DESIGN_SPAN/2 };
  core.quadrants = L.quadrants;
  const result = translateRiftSpatial(buildDesignTerrainShapes(core), offset);
  result.meta.bounds = L.bounds;
  result.meta.arena = arenaPolygon(L.bounds);
  result.meta.arenaSmooth = smoothPath(result.meta.arena, 6, {closed:true});
  result.groundLayers.unshift({ id:'outer_forest', kind:'jungle', poly:result.meta.arena,
    color:PALETTE.grass_jungle, colorKey:'grass_jungle', y:LAYER_Y.arena-.08 });
  //  Topology Final：三路外側不再是可走的空地。外環＝邊界量體（藍半邊追蹤、紅半邊 180° 鏡射），
  //  與野區量體同一種資料：導航距離場與 Blender 都只吃這份多邊形。
  //  ⚠ 用 arenaSmooth：導航距離場把「平滑輪廓之外」當牆，邊界量體必須貼著同一條線，
  //    否則平滑曲線在切角外凸的那一圈會變成可走縫（實測 892 個外環可走取樣）。
  const boundary = buildBoundaryMasses({ bounds: L.bounds, arena: result.meta.arenaSmooth,
    lanes: L.lanes, nexus: L.bases, fountains: L.fountains,
    baseCenters: { blue: result.meta.bases.blue.center, red: result.meta.bases.red.center } });
  result.wallMasses.push(...boundary);
  boundary.filter((m) => m.side === 'blue').forEach((m, i) => {
    result.groundLayers.push({ id:`boundary_floor_${i}`, kind:'jungle', poly:m.poly,
      color:PALETTE.grass_grove, colorKey:'grass_grove', y:LAYER_Y.grove });
  });
  boundary.filter((m) => m.side === 'red').forEach((m, i) => {
    result.groundLayers.push({ id:`boundary_floor_red_${i}`, kind:'jungle', poly:m.poly,
      color:PALETTE.grass_grove, colorKey:'grass_grove', y:LAYER_Y.grove });
  });
  result.groundLayers.sort((a, b) => a.y - b.y);
  result.wallItems = clearRiftLaneWalls(result.wallItems, L.lanes);
  return result;
}

function buildDesignTerrainShapes(L) {
  const B = L.bounds, cx = B.centerX, cy = B.centerY;
  const ground = [];
  const walls = [];
  const entrances = [];   // 純資料的入口節點（G.3 起不再產生任何「門柱」造型物件）
  const push = (id, kind, poly, colorKey, y) =>
    ground.push({ id, kind, poly, color: PALETTE[colorKey], colorKey, y });

  // ══ G.14-fix：單一 base blueprint ═════════════════════════════════════════
  //
  //  【G.14 為什麼 verifier 綠、畫面還是歪】上一輪讓 buildBasePlan 只生成藍方、
  //   紅方純鏡射，**但這一支（渲染資料層）仍然是「兩方各跑一次同一段程式」**：
  //   `["blue","red"].forEach(...)`。只要那段程式裡有任何一項不是旋轉不變的
  //   （blobRing 的外形、石板環的起始角、塔前廣場的凹凸），兩邊就會長得不一樣，
  //   而 G.14 的驗證器只比對了 id 以 base/slab/fountain/ramp/highland 開頭的圖層，
  //   **塔前廣場 plaza_ 根本沒被驗到** —— 實測畫面不對稱率 16.8% 全出在它身上。
  //
  //  【本輪的作法】不再讓紅方跑任何一行生成程式：
  //   `emitBlueThenMirror(fn)` 先讓 fn 只為藍方產生項目，接著把「這次新產生的」
  //   地面層 / 牆段 / 入口節點整批做 180° 鏡射後推進去當紅方。
  //   ⇒ 紅方在結構上不可能有自己的 seed、自己的偏移、自己的外形，
  //     除非有人故意繞過這個函式。驗證器另有一條檢查會抓這件事。
  /** 圖層 / 入口 id 的鏡射：blue→red，且 180° 旋轉把上路↔下路互換。 */
  const mirrorId = (id) => id.replace("blue", "red")
    .replace(/(^|_)(top|bot)(_|$)/, (m, a, ln, b) => `${a}${ln === "top" ? "bot" : "top"}${b}`);
  const mirPt = (p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y });
  //  少數圖層帶陣營色（泉水水面）：鏡射時色 key 也要換到紅方，其餘一律沿用藍方的色。
  const MIRROR_COLOR_KEY = { fountain_water_blue: "fountain_water_red" };
  const mirrorGroundLayer = (g) => {
    const ck = MIRROR_COLOR_KEY[g.colorKey];
    return { ...g, id: mirrorId(g.id), poly: g.poly.map(mirPt),
      ...(ck ? { colorKey: ck, color: PALETTE[ck] } : {}) };
  };
  //  牆段是「有長有厚的長方體」：位置鏡射、角度 +π（長方體對 180° 自我重合，
  //  長 / 厚 / 高一個字都不能動 ⇒ 兩方 rotation / scale 必然一致）。
  const mirrorWallItem = (w) => ({
    ...w, x: 2 * cx - w.x, y: 2 * cy - w.y, angle: w.angle + Math.PI,
    //  struct 只在有值時帶（undefined 鍵在 JSON source 會被丟掉，逐欄比對就會不相等）
    ...(typeof w.struct === "string" ? { struct: mirrorId(w.struct) } : {}),
  });
  const mirrorEntrance = (e) => ({
    ...e, key: mirrorId(e.key), x: 2 * cx - e.x, y: 2 * cy - e.y, angle: e.angle + Math.PI,
  });
  /** 只為藍方跑一次 fn，然後把 fn 新產生的所有項目整批鏡射成紅方。 */
  function emitBlueThenMirror(fn) {
    const g0 = ground.length, w0 = walls.length, e0 = entrances.length;
    fn();
    const gEnd = ground.length, wEnd = walls.length, eEnd = entrances.length;
    for (let i = g0; i < gEnd; i++) ground.push(mirrorGroundLayer(ground[i]));
    for (let i = w0; i < wEnd; i++) walls.push(mirrorWallItem(walls[i]));
    for (let i = e0; i < eEnd; i++) entrances.push(mirrorEntrance(entrances[i]));
  }

  //  ⚠ 順序有意義（G.15-final）：
  //    ① 先算塔位（呈現座標；來源是 gameData 的 posOnLane）
  //    ② alignHighgroundTowers() 把三座高地塔貼到自己那個城門的軸線上
  //       ⇒ 三路的「出口 → 塔」相對位置完全相同（見 mapBaseFrame 檔頭）
  //    ③ 道路才生成：近基地段改走「主堡 → 城門 → 高地塔」，塔因此仍站在路面上
  //    ④ 最後才是基地本體
  const TP = buildTowerPlan(L);
  alignHighgroundTowers(L, TP.laneTowers);
  const lane = buildLanePlan(L);
  const river = buildRiverPlan(L);
  const towerPlan = TP.laneTowers;
  const nexusTurrets = TP.nexusTurrets;
  const bases = buildBasePlan(L, lane, TP);
  const baseBlueprint = bases.blueprint;
  //  基地淨空區：兩方各一個**同半徑的圓**（圓心 = 主堡）⇒ 天生 180° 鏡射對稱。
  //  野區岩壁 / 野區結構 / 裝飾岩 / 岩影 / 樹叢暗斑 / 路面色斑一律不得進入，
  //  這是「基地出口旁某一側多一顆大石塊」的根治法：不是把石頭搬對稱，是不准有石頭。
  const baseKeepOut = ["blue", "red"].map((s) => bases[s].keepOutPoly);
  //  G.4：營地座標改由 mapCampLayout 決定（含把壓在路上的 Buff 移回野區，
  //  以及在兩個空象限補上呈現用的鳥營與蟾蜍）。
  const camps = buildCampPlan(L);
  const monsters = buildMonsters(L, camps);
  //  G.6：草叢 / cover。此處只算團塊，過濾（不得壓路／河／基地）在 blockPolys 建好後做。
  const bushCoverAll = buildBushCover(L);

  // ══ 1. 底盤與競技場輪廓 ════════════════════════════════════════════════
  const boundsPoly = [
    { x: B.minX, y: B.minY }, { x: B.maxX, y: B.minY },
    { x: B.maxX, y: B.maxY }, { x: B.minX, y: B.maxY },
  ];
  const arena = arenaPolygon(B);
  const arenaSmooth = smoothPath(arena, 6, { closed: true });
  push("bedrock", "bedrock", boundsPoly, "bedrock", LAYER_Y.bedrock);
  push("cliff_shadow", "shadow", arenaSmooth, "cliff_shadow", LAYER_Y.cliff_shadow);
  push("arena", "arena", scalePoly(arenaSmooth, 0.965, cx, cy), "grass_arena", LAYER_Y.arena);

  // ══ 2. 主草地斑塊：打破「一整片同色綠」（低對比、大塊、決定性取點）════════
  //  G.10 hand-painted：斑塊加量、外加一層「柔和過渡斑」（中間色）⇒ 色塊邊界不再是硬切，
  //  讀成手繪筆觸而非測試色塊。
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + 0.4;
    const rad = 26 + hash01(i, 501) * 64;
    const p = { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad * 0.92 };
    if (!pointInPoly(p.x, p.y, arenaSmooth)) continue;
    //  G.15：草地斑塊是繞地圖中心的單一環（不是兩方各生成），但取樣點的角度偏移
    //  讓它在基地附近不對稱（實測基地 60 單位內藍 0 / 紅 1）。基地淨空圓內不畫。
    if (Math.min(Math.hypot(p.x - L.bases.blue.x, p.y - L.bases.blue.y),
      Math.hypot(p.x - L.bases.red.x, p.y - L.bases.red.y)) < BASE_GEO.keepOutR) continue;
    push(`arena_mottle_${i}`, "arena", blobRing(p.x, p.y, 15 + hash01(i, 507) * 16,
      { n: 22, amp: 0.34, seed: 510 + i, squashX: 1.3, squashY: 0.78, rot: a }),
      i % 3 === 0 ? "grass_arena_alt" : i % 3 === 1 ? "grass_arena_lit" : "grass_soft", LAYER_Y.arena_mottle);
  }

  // ══ 3. 基地：整份 blueprint 一次發射（G.15）═══════════════════════════════
  //
  //  【G.15 起，基地的每一件東西都只從這裡出來】平台 / 內庭 / 主堡台 / 石板 /
  //   坡道 / 高地草地 / 高地走廊 / 泉水 / 門牙塔底座 / 外牆 / 門柱 / 主堡外圈矮牆 /
  //   池緣，全部是 mapBaseBlueprint 的 blueprint item。
  //   藍方 = blueprint 本尊；紅方 = mirrorBaseItems() 的輸出，**沒有任何一行生成程式**。
  //   ⇒ 「紅方是不是藍方鏡射」變成逐件 id 對照 + 逐欄位相等，不再是「看起來像」。
  //
  //  ⚠ 之後要加基地物件，一律加進 mapBaseBlueprint 的 items，不要在這裡 push。
  //    直接在這裡 push 的東西不會被鏡射，也不會被 G.15 的 blueprint verifier 驗到。
  const BASE_GROUND_KIND = { highland: "highland", ramp: "ramp" };
  function emitBaseItem(it, side) {
    if (it.role === "ground") {
      ground.push({
        id: it.id, kind: BASE_GROUND_KIND[it.kind] ?? "base", poly: it.poly,
        color: PALETTE[it.colorKey], colorKey: it.colorKey, y: it.layerY,
        blueprint: it.id,
      });
    } else if (it.role === "wall") {
      walls.push({
        kind: it.kind, x: it.x, y: it.y, angle: it.rot,
        len: it.len, thick: it.thick, h: it.h, struct: it.id,
      });
    } else if (it.role === "node" && it.kind === "gate") {
      entrances.push({ key: `baseent_${side}_${it.lane}`, kind: "base", x: it.x, y: it.y, angle: it.rot });
    }
  }
  baseBlueprint.blue.forEach((it) => emitBaseItem(it, "blue"));
  baseBlueprint.red.forEach((it) => emitBaseItem(it, "red"));

  // ══ 4. 靠河潮濕草地（草 → 泥岸的第一階過渡）══════════════════════════════
  river.parts.forEach((part) => {
    push(`river_wetgrass_${part.id}`, "river_wet", part.bands.wetgrass, "grass_wet", LAYER_Y.river_wetgrass);
  });

  // ══ 5. 野區草地（四象限，兩兩交替避免單色）══════════════════════════════
  L.quadrants.forEach((q, i) => {
    const rot = Math.atan2(cy - q.y, cx - q.x);
    const poly = blobRing(q.x, q.y, q.r * 2.05, { n: 34, amp: 0.24, seed: 60 + i * 3, squashX: 1.14, squashY: 0.84, rot });
    push(`jungle_${q.id}`, "jungle", poly, i % 2 ? "grass_jungle_alt" : "grass_jungle", LAYER_Y.jungle);
  });

  // ══ 6. 禁區遮罩：牆體不得長在路面／水面／基地平台／坑底上 ═════════════════
  //  （先於樹叢/空地建立，因為它們也要避開這些區域）
  //  G.7：坑口半角放大（dragon 0.74→0.82、baron 0.50→0.66）＋ baron 壁厚 7.4→6.2，
  //  讓坑口 / 河口淨寬 ≥7（英雄可正常進出，史詩野怪爭奪不會卡在細縫）。
  //  Objective Pit Gameplay Symmetry（2026-09-30，moba-sim.v16）：
  //  兩坑的 **gameplay 腳印**（半徑／坑口半角／壁厚＝碰撞、可走區、坑口寬、導航）統一成同一份，
  //  而且巴龍坑的腳印是巨龍坑的**精確 180° 鏡射**（不再各自有 seed）。
  //  原本巨龍 R17／0.82／5.2、巴龍 R14／0.66／6.2；導航場的 mirrorSymmetric 取「聯集」
  //  ⇒ 兩坑都疊了一圈對方的隱形牆。統一後兩坑碰撞相同、也不再有隱形牆。
  //  取兩者中間值：兩坑的外觀位移都最小；坑口淨寬仍遠大於 G.7 的下限 7。
  //  **視覺**仍可不同：壁高（h）、坑色、光暈顏色、史詩野怪模型。
  const PIT_FOOTPRINT = { R: 15.5, gapHalf: 0.74, thick: 5.7 };
  const pitSpec = {
    dragon: { ...PIT_FOOTPRINT, h: HEIGHT.pit_wall_dragon, color: "pit_dragon" },
    baron: { ...PIT_FOOTPRINT, h: HEIGHT.pit_wall_baron, color: "pit_baron" },
  };
  const pits = {};
  ["dragon", "baron"].forEach((kind, i) => {
    const p = L.pits[kind], S = pitSpec[kind];
    // 入口朝河：取該坑口水域路徑的切線方向，坑口開在上下游兩側
    const mouthPath = river.meta.mouths[kind].path;
    const nr = nearestOnPath(mouthPath, p);
    if (kind === "dragon") {
      const entA = nr.tangent, entB = nr.tangent + Math.PI;
      pits[kind] = {
        ...S, x: p.x, y: p.y, entA, entB,
        gaps: [{ angle: entA, half: S.gapHalf }, { angle: entB, half: S.gapHalf }],
        floorPoly: blobRing(p.x, p.y, S.R * 0.98, { n: 30, amp: 0.1, seed: 40 }),
        glowPoly: blobRing(p.x, p.y, S.R * 0.66, { n: 26, amp: 0.12, seed: 44 }),
        corePoly: blobRing(p.x, p.y, S.R * 0.56, { n: 22, amp: 0.14, seed: 48 }),
        mouthPoly: river.meta.mouths[kind].bands.shoal,
      };
    } else {
      //  巴龍坑＝巨龍坑的 180° 鏡射（坑心、坑口角度、坑底形狀）；只保留自己的視覺規格與河口水域。
      const D = pits.dragon, mp = (q) => ({ x: 2 * cx - q.x, y: 2 * cy - q.y });
      pits[kind] = {
        ...S, x: 2 * cx - D.x, y: 2 * cy - D.y, entA: D.entA + Math.PI, entB: D.entB + Math.PI,
        gaps: D.gaps.map((g) => ({ angle: g.angle + Math.PI, half: g.half })),
        floorPoly: D.floorPoly.map(mp), glowPoly: D.glowPoly.map(mp), corePoly: D.corePoly.map(mp),
        mouthPoly: river.meta.mouths[kind].bands.shoal,
      };
    }
    // 坑口門柱擺在**坑口水域的中心線上**（而不是沿切線硬推 R+2 個單位）：
    // 水域在坑口最寬、越過坑心後收束，沿切線外推會掉到水域之外，門柱就會站在旱地上。
    //  取「路徑上距坑心最接近 R 的內部取樣點」，並排除頭尾兩點
    //  （頭尾正好落在帶狀多邊形的封口線上，pointInPoly 判定會不穩定）。
    const pivot = nr.index;
    const pickNear = (lo, hi) => {
      let best = null, bd = Infinity;
      for (let i = Math.max(1, lo); i <= Math.min(mouthPath.length - 2, hi); i++) {
        const q = mouthPath[i];
        const d = Math.abs(Math.hypot(q.x - p.x, q.y - p.y) - S.R * 0.85);
        if (d < bd) { bd = d; best = q; }
      }
      return best ?? mouthPath[Math.max(1, Math.min(mouthPath.length - 2, lo))];
    };
    [[0, pivot - 1], [pivot + 1, mouthPath.length - 1]].forEach(([lo, hi], gi) => {
      const q = pickNear(lo, hi);
      entrances.push({
        key: `ent_${kind}_${gi}`, kind: "pit", x: q.x, y: q.y,
        angle: gi === 0 ? pits[kind].entA : pits[kind].entB,
      });
    });
  });

  //  G.3：三路出口的淨空通道也是禁建區 ⇒ 高地出口不會被牆石堵住。
  const exitCorridorPolys = ["blue", "red"].flatMap((sd) => bases[sd].exitCorridors.map((c) => c.poly));
  const blockPolysNoBaseKeepOut = [
    ...LANES3.map((ln) => lane.blockPolys[ln]),
    ...river.waterPolys,
    ...["blue", "red"].map((s) => bases[s].apronPoly),
    ...["dragon", "baron"].map((k) => pits[k].floorPoly),
    ...["dragon", "baron"].map((k) => pits[k].mouthPoly),
    ...exitCorridorPolys,
    //  營地空地本身也是禁建區：補的野區牆不可以穿過營地口袋
    ...camps.map((c) => blobRing(c.x, c.y, c.clearR + 2.5, { n: 14, amp: 0.05, seed: 9 })),
  ];
  //  G.15：基地淨空圓（兩方同半徑）⇒ 基地周邊不會再冒出單邊的野區岩壁 / 結構牆。
  const blockPolys = [...blockPolysNoBaseKeepOut, ...baseKeepOut];

  //  G.6：草叢過濾。草叢是可穿越的視野遮蔽（不是障礙、不進 wallItems），但中心不得
  //  落在路面／出口通道／水面／基地平台上（否則讀成「路中間長了一叢擋路的草」）。
  //  gameData 的視野草叢與呈現用 cover 一律套同一份過濾 ⇒ 鏡射對稱不會被單邊破壞。
  const bushBlock = [
    ...LANES3.map((ln) => lane.bands[ln].surface),
    ...river.waterPolys,
    ...["blue", "red"].map((s) => bases[s].apronPoly),
    ...exitCorridorPolys,
    ...baseKeepOut,   // G.15：基地淨空圓
  ];
  //  有模擬實體的草叢（gameData.BUSHES）一律保留——引擎就是拿它們算埋伏；只過濾呈現用 cover。
  const bushClusters = bushCoverAll.filter((c) => c.isPresentation === false || !bushBlock.some((poly) => pointInPoly(c.x, c.y, poly)));

  // ══ 7. 樹叢暗斑：打破野區大片死綠（純地面暗色塊，非 Bush/Tree Pack）═══════
  L.quadrants.forEach((q, qi) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + qi * 0.7;
      const rad = q.r * (0.55 + hash01(i, 90 + qi) * 0.95);
      const p = { x: q.x + Math.cos(a) * rad, y: q.y + Math.sin(a) * rad };
      if (blockPolys.some((poly) => pointInPoly(p.x, p.y, poly))) continue;
      if (!pointInPoly(p.x, p.y, arenaSmooth)) continue;
      push(`grove_${q.id}_${i}`, "jungle",
        blobRing(p.x, p.y, 6.5 + hash01(i, 95 + qi) * 4.5, { n: 16, amp: 0.26, seed: 100 + qi * 7 + i }),
        "grass_grove", LAYER_Y.grove);
    }
  });

  // ══ 8. 野區空地（camp / buff 的明確小空間）════════════════════════════════
  //  G.3：空地縮小（buff 14→12、camp 10.5→9.5），並在中心加一塊「踩踏地」，
  //  讓營地讀成「有東西住在這裡」而不是一塊亮綠色圓形貼紙。
  camps.forEach((c, i) => {
    push(`clearing_${c.id}`, "clearing", blobRing(c.x, c.y, c.clearR, { n: 22, amp: 0.18, seed: 80 + i }),
      "grass_clearing", LAYER_Y.clearing_over_lane);
    push(`campfloor_${c.id}`, "clearing", blobRing(c.x, c.y, c.clearR * 0.62, { n: 18, amp: 0.22, seed: 88 + i }),
      "camp_floor", LAYER_Y.clearing_over_lane + 0.01);
  });

  // ══ 8b. 草叢地面投影（G.6）：讓草叢團塊「坐」在地上，俯視也讀得出遮蔽區 ════════
  bushClusters.forEach((c, i) => {
    push(`bushshade_${c.id}`, "bush", blobRing(c.x, c.y, bushReach(c) * 0.95,
      { n: 18, amp: 0.22, seed: 820 + i * 3, squashX: 1.15, squashY: 0.9 }),
      "bush_shade", LAYER_Y.bush_shade);
  });

  // ══ 9. 三路：草緣 → 路肩 → 路緣（外三階，畫在河之下）═══════════════════════
  LANES3.forEach((ln) => {
    const b = lane.bands[ln];
    push(`lane_${ln}_verge`, "lane", b.verge, "lane_verge", LAYER_Y.lane_verge);
    push(`lane_${ln}_shoulder`, "lane", b.shoulder, "lane_shoulder", LAYER_Y.lane_shoulder);
    push(`lane_${ln}_edge`, "lane", b.edge, "lane_edge", LAYER_Y.lane_edge);
  });

  // ══ 10. 水系：泥岸 → 淺灘 → 淺水 → 深水 → 沙洲 ═══════════════════════════
  //  刻意夾在「路緣之上、路面之下」（原因見 mapVisualStyle 的 LAYER_Y 說明）。
  river.parts.forEach((part) => {
    push(`river_bank_${part.id}`, "river", part.bands.bank, "river_bank", LAYER_Y.river_bank);
  });
  river.parts.forEach((part) => {
    push(`river_shoal_${part.id}`, "river", part.bands.shoal, "river_shoal", LAYER_Y.river_shoal);
  });
  river.parts.forEach((part) => {
    push(`river_water_${part.id}`, "river", part.bands.water, "river_water", LAYER_Y.river_water);
  });
  river.parts.forEach((part) => {
    if (part.bands.deep) push(`river_deep_${part.id}`, "river", part.bands.deep, "river_deep", LAYER_Y.river_deep);
  });
  river.sandbars.forEach((s) => push(s.id, "river", s.poly, "river_sand", LAYER_Y.river_sand));

  // ══ 11. 三路：塔前廣場 → 路面 → 路面色斑 → 路心亮帶（內三階，畫在水之上）═══
  //  塔前廣場先畫：讓「防禦節點」在路上鼓出一塊，路面再蓋回中間 ⇒ 讀成路口。
  //  G.14-fix：塔前廣場是 blobRing（凹凸外形**不是**旋轉對稱的），兩方各畫一次就會
  //  長得不一樣——實測這一項就佔了基地畫面不對稱的 16.8%。改成只畫藍方 + 鏡射。
  emitBlueThenMirror(() => {
    towerPlan.filter((t) => t.side === "blue").forEach((t) => {
      push(`plaza_${t.id}`, "lane", blobRing(t.x, t.y, t.plazaR, { n: 18, amp: 0.12, seed: 300 + t.rank }),
        "tower_plaza", LAYER_Y.lane_plaza);
    });
  });
  //  中央交戰空地：中路跨過河的地方鋪一塊石砌渡口廣場。
  //  G.2 把中路兩座外塔各往後拉到距中心 22.6（原本只有 4.5、兩塔僅差 9.1），
  //  這塊廣場就是空出來的那個「中央交戰區」，之後放英雄/兵線才有位置。
  {
    const midDir = Math.atan2(-1, 1);   // mid lane 在中心的走向（左下 → 右上）
    //  ⚠ 圖層必須放在**河之下**（lane_edge 之上一點）：放在河之上會把中央涉水點
    //    整塊蓋掉，河就被切成兩段互不相連的小溪。
    push("center_arena", "lane",
      blobRing(cx, cy, 14, { n: 26, amp: 0.14, seed: 620, squashX: 1.5, squashY: 0.9, rot: midDir }),
      "lane_shoulder", LAYER_Y.lane_edge + 0.01);
  }
  //  mid 的路面比上/下路亮一階 ⇒ 關掉標籤也一眼看得出「中路才是主戰線」。
  LANES3.forEach((ln) => {
    push(`lane_${ln}_surface`, "lane", lane.bands[ln].surface,
      ln === "mid" ? "lane_surface" : "lane_surface_side", LAYER_Y.lane_surface);
  });
  //  G.15：路面色斑是**單邊生成**的裝飾（藍紅各自沿自己的 lane 折線取樣，實測基地
  //  附近藍 2 塊 / 紅 1 塊）。基地淨空圓內一律不畫 ⇒ 基地口的地表不會一邊花一邊乾淨。
  lane.patches
    .filter((p) => { const c = centroid(p.poly); return !baseKeepOut.some((poly) => pointInPoly(c.x, c.y, poly)); })
    .forEach((p) => push(p.id, "lane", p.poly, "lane_patch", LAYER_Y.lane_patch));
  push("lane_mid_inlay", "lane", lane.bands.mid.inlay, "lane_inlay", LAYER_Y.lane_inlay);

  // ══ 12. 坑底（畫在水/路之上，讀成下凹地形）════════════════════════════════
  ["dragon", "baron"].forEach((k) => {
    const P = pits[k];
    push(`pit_${k}_floor`, "pit", P.floorPoly, "pit_floor", LAYER_Y.pit_floor);
    ground.push({ id: `pit_${k}_glow`, kind: "pit", poly: P.glowPoly, color: PALETTE[P.color], colorKey: P.color, y: LAYER_Y.pit_ring });
    push(`pit_${k}_core`, "pit", P.corePoly, "pit_floor", LAYER_Y.pit_ring + 0.02);
  });

  // ══ 13. 塔基座（明度三階 ⇒ 空拍圖也讀得出層級）═══════════════════════════
  //  G.14-fix：同 plaza，底座 blob 也只畫藍方 + 鏡射（原本靠手動 rot:π 補償，
  //  只要有人改了 blobRing 的參數就會再度失效）。
  emitBlueThenMirror(() => {
    towerPlan.filter((t) => t.side === "blue").forEach((t) => {
      push(`towerpad_${t.id}`, "tower_pad", blobRing(t.x, t.y, t.padR, { n: 8, amp: 0.05, seed: 5 }),
        t.plinth, LAYER_Y.tower_pad);
    });
  });

  // ══ 14.（G.15）基地的地面層與牆體已在 §3 由 blueprint 一次發射完畢 ═══════════
  //  這裡刻意留白：**不要**在這一段再 push 任何基地物件。

  // ══ 15–18. 野區量體（Topology Final）══════════════════════════════════════
  //  舊版的 外緣崖 rim／角落崖 massif／gameData 牆鏈岩弧／象限弧牆／野區結構節點／營地口袋牆
  //  全部移除，改由 mapJungleTopology 的「房間＋走道」負空間量體取代：
  //   · 牆島是完整多邊形（不是一串短膠囊），藍方生成、紅方 180° 鏡射 ⇒ 導航不再需要
  //     用鏡像聯集去補不對稱的牆，看不見的牆歸零；
  //   · 營地房間、三角草路口、河道入口、Gank 走道都是刻意設計的節點，牆是剩下的空間。
  const topo = buildJungleMasses({
    bounds: B, lanes: L.lanes, river: L.river.points, pits: L.pits,
    nexus: L.bases, bushes: L.bushes,
  });
  const masses = topo.masses;
  const rockChunks = [];   // 舊版岩影來源；量體改由下方 mass shade 呈現
  masses.forEach((m) => {
    push(`massshade_${m.id}`, "jungle", m.poly, "rock_shade", LAYER_Y.rock_shade);
  });
  //  野區土徑：沿每條走道樣條的窄帶（寬度約走道的 45%）。藍方生成、紅方 180° 鏡射。
  //  ⚠ 純地表：不進 wallItems / wallMasses，不影響導航。
  emitBlueThenMirror(() => {
    buildTrailPaths().forEach((tp, i) => {
      const w = tp.pts.reduce((s, p) => s + p.w, 0) / tp.pts.length;
      push(`trail_blue_${tp.id}`, "jungle", ribbonPolygon(tp.pts, w * 0.45, { vary: 0.22, seed: 700 + i, taper: 0.55 }),
        "trail", LAYER_Y.trail);
    });
  });

  // ══ 18b. 岩壁地面投影（G.11 精簡）════════════════════════════════════════════
  //  讓岩壁「坐」在地上（柔和投影暗斑），岩與草不是硬邊。每 2 段一塊、不再鋪土斑
  //  （連續短弧不需要碎石時代的土斑，避免野區變花）。
  rockChunks.forEach((rk, i) => {
    if (i % 2) return;
    //  G.15：岩影跟著岩壁走，而岩壁的側向擾動（±0.9）是在禁建區過濾**之後**才施加的，
    //  所以少數岩塊會漂進基地淨空圓。這裡以最終座標再篩一次。
    if (baseKeepOut.some((poly) => pointInPoly(rk.x, rk.y, poly))) return;
    push(`rockshade_${i}`, "jungle", blobRing(rk.x + rk.r * 0.15, rk.y + rk.r * 0.15, rk.r * 1.5,
      { n: 10, amp: 0.3, seed: 320 + i }), "rock_shade", LAYER_Y.rock_shade);
  });

  // ══ 19. 量體：坑壁（馬蹄形厚壁，斷口＝朝河入口）════════════════════════════
  //  v16 Objective Pit Gameplay Symmetry：只為巨龍坑產生牆段，巴龍坑的牆段＝整批 180° 鏡射
  //  （位置鏡射、角度 +π、長／厚一字不動 ⇒ 碰撞腳印精確對稱）；只把壁高換成巴龍的視覺高度。
  {
    const P = pits.dragon, w0 = walls.length;
    const runs = ringRuns(P.x, P.y, P.R, P.gaps, { n: 52, amp: 0.08, seed: 70 });
    runs.forEach((run, ri) => {
      walls.push(...naturalWallRun(run, {
        seed: 70 + ri, step: 2.0, amp: 0.55,
        height: P.h, heightVar: 3.0, thick: P.thick, thickVar: 0.36, kind: "pit_wall",
      }));
    });
    // 坑口：岩壁往開口收窄變矮（取代 G.2 的門柱）。
    walls.push(...entranceTaper(P.x, P.y, P.R, P.gaps, {
      baseH: P.h, thick: P.thick, seed: 600, span: 0.10,
    }));
    const hK = pits.baron.h / pits.dragon.h, wEnd = walls.length;
    for (let i = w0; i < wEnd; i++) {
      const w = mirrorWallItem(walls[i]);
      walls.push({ ...w, h: w.h * hK });
    }
  }

  // ══ 20.（G.15）基地城牆已在 §3 由 blueprint 發射（base_rim / base_gate /
  //     base_keep / fountain_rim）。稜堡（bastion）整組移除：它是「非出口方向的
  //     角墩」，在俯視圖上就是使用者說的「某一側多出來的石塊」。

  // ══ 21. 量體：河岸石（來自 mapRiverStyle，只沿河臂兩岸）════════════════════
  river.stones.forEach((s) => {
    if (blockPolys.some((poly) => pointInPoly(s.x, s.y, poly))) return;
    walls.push(s);
  });

  // ══ 22. 裝飾岩：只放在牆鏈端點與崖腳，不平均灑滿地 ═══════════════════════════
  //  Topology Final：裝飾岩來源（gameData 牆鏈端點、角落崖腳）已隨程序化岩壁一起退役。
  const rocks = [];

  //  裝飾岩同樣不得落在出口通道 / 路面 / 基地平台上（否則會被誤讀成「走不過去」）
  {
    const rockBlock = [
      ...exitCorridorPolys,
      ...LANES3.map((ln) => lane.bands[ln].surface),
      ...["blue", "red"].map((sd) => bases[sd].apronPoly),
      //  G.15：使用者指名的「不要在基地出口旁放隨機大石塊」。裝飾岩來自 gameData
      //  牆鏈端點，兩方**不是**精確鏡射（實測配對誤差 2.97）⇒ 基地淨空圓內一律不放。
      ...baseKeepOut,
    ];
    const keptRocks = rocks.filter((r) => !rockBlock.some((poly) => pointInPoly(r.x, r.y, poly)));
    rocks.length = 0; rocks.push(...keptRocks);
  }

  // ══ 23. 收斂到地圖邊界 ═══════════════════════════════════════════════════
  //  基地在地圖角落、崖體山脊貼著角落 ⇒ 一定會有形狀超出 0..220。
  //  地面色塊「夾」進邊界（＝被地圖邊界裁切，視覺上正確）；
  //  量體則直接丟掉中心越界的段（免得出現半截浮空的牆）。
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  for (const layer of ground) {
    layer.poly = layer.poly.map((p) => ({ x: clamp(p.x, B.minX, B.maxX), y: clamp(p.y, B.minY, B.maxY) }));
  }
  //  最終保險：naturalWallRun 的側向擾動在 filterRuns 之後才施加，個別段仍可能漂到
  //  路面上，這裡以最終座標再篩一次。
  //  例外（＝這些量體本來就該壓在路/平台上，被篩掉才是 bug）：
  //   · cliff / cliff_mass：外緣崖與路肩本來就貼在一起
  //   · base_rim / base_keep：基地的城牆與內牆本來就長在高地平台上
  //  fountain_rim 也要豁免：溫泉本來就蓋在高地平台上，被 noStand 篩掉才是 bug
  const WALL_EXEMPT = new Set(["cliff", "cliff_mass", "base_rim", "base_keep", "base_gate", "fountain_rim"]);
  const noStand = [
    ...LANES3.map((ln) => lane.bands[ln].surface),
    ...["blue", "red"].map((s) => bases[s].apronPoly),
  ];
  const inBounds = (w) => w.x >= B.minX && w.x <= B.maxX && w.y >= B.minY && w.y <= B.maxY;
  //  出口通道是**所有**量體的禁區，連城牆自己也不例外
  //  （城牆缺口本來就該讓開，段落漂進通道就是 bug）。
  //  唯一例外：溫泉池緣（它在主堡後方，不在任何出口通道上，但形狀上會貼著主堡台）。
  const inCorridor = (w) => w.kind !== "fountain_rim" &&
    exitCorridorPolys.some((poly) => pointInPoly(w.x, w.y, poly));
  //  G.15：基地淨空圓的最終把關。野區岩壁的側向擾動（±0.9）是在 filterRuns **之後**
  //  才施加的，所以少數段會從淨空圓外漂進來（實測 3 段），俯視就是「基地出口旁多
  //  出來的石塊」。這裡以最終座標再篩一次。外緣崖豁免：它是地圖邊界本身。
  const CLIFF = new Set(["cliff", "cliff_mass"]);
  const inBaseKeepOut = (w) => !WALL_EXEMPT.has(w.kind) && !CLIFF.has(w.kind) &&
    baseKeepOut.some((poly) => pointInPoly(w.x, w.y, poly));
  const kept = walls.filter((w) => inBounds(w) && !inCorridor(w) && !inBaseKeepOut(w) &&
    (WALL_EXEMPT.has(w.kind) || !noStand.some((poly) => pointInPoly(w.x, w.y, poly))));
  walls.length = 0; walls.push(...kept);

  //  野區路線結構節點 census（只算「過濾後仍有牆段存活」的結構）⇒ verifier 用它清點
  //  可讀結構密度、逐象限最少結構數。
  const jungleStructures = masses.map((m) => {
    let x = 0, y = 0; for (const p of m.poly) { x += p.x; y += p.y; }
    return { id: m.id, quadrant: m.quad, role: "mass", x: x / m.poly.length, y: y / m.poly.length };
  });

  ground.sort((a, b) => a.y - b.y);

  return {
    groundLayers: ground,
    wallItems: walls,
    wallMasses: masses,       // Topology Final：野區／邊界量體（多邊形；導航與 Blender 唯一來源）
    towers: towerPlan,        // 18 座兵線塔（呈現座標；模擬座標見 t.sim）
    nexusTurrets,             // 4 座門牙塔（雙方各 2，主堡最後防線）
    monsters,                 // 野怪 / 史詩野怪的低模剪影
    bushClusters,             // 草叢 / cover 的低模團塊（可穿越，非障礙）
    jungleStructures,         // 野區路線結構節點（過濾後存活的 camp_wall/divider/lane_cut/river_hook）
    baseBlueprint,            // G.15：基地的單一 blueprint（{ blue, red }，紅方純鏡射）
    camps,       // 營地配置（含位移量與 isPresentation 標記）
    entrances,   // 入口節點（位置＋方向）；沒有任何造型物件，供地形收口與 verifier 使用
    rocks,
    meta: {
      arena, arenaSmooth,
      lanePaths: lane.paths, laneSurfPoly: Object.fromEntries(LANES3.map((ln) => [ln, lane.bands[ln].surface])),
      river, bases, baseGeo: BASE_GEO, pits, exitCorridorPolys,
      topology: { version: JUNGLE_TOPOLOGY_VERSION, clear: TOPOLOGY_CLEAR },
      bounds: B,
      nexus: ["blue", "red"].map((side) => ({
        side, x: L.bases[side].x, y: L.bases[side].y,
        fountain: { ...L.fountains[side] },
        color: side === "blue" ? PALETTE.nexus_blue : PALETTE.nexus_red,
        //  G.14：平台/主堡台一律中性石板灰（兩方同色），陣營色只留給 color（晶體/泉水）
        platformColor: PALETTE.base_apron,
        platformTop: PALETTE.base_apron_top,
        poly: bases[side].apronPoly, keepPoly: bases[side].keepPoly,
        center: bases[side].center, R: BASE_GEO.apronR,
      })),
      camps: camps.map((c) => ({ ...c })),
    },
  };
}
