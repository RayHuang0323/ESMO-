// ============================================================================
//  battle/moba/map/MobaMapBlockout.jsx — MOBA 地圖渲染層（Milestone F → G.7）
//
//  本檔只做「形狀資料 → three.js 幾何」的轉換：
//    座標真相 src/gameData.js → mobaMapLayout → mapTerrainShapes（形狀構成）→ 本檔。
//  **不含任何模擬邏輯**（不 import LogicEngine / store），不改動任何模擬常數。
//  所有「自然化」都用決定性偽亂數（見 mapShapePrimitives），不用 Math.random()。
//
//  【G.7 效能整理】前一版每一塊地面色塊 / 每一個塔零件 / 每一個野怪零件都是**獨立
//    mesh + inline material**（實測 draw call ≈ 824、材質數百）。本輪一次收斂：
//    · 地面：依「圖層開關群組」合併成頂點著色的大 mesh（212 → ~7 draw call）。
//    · 塔：每座合併成「塔身(頂點色) + 塔冠」兩個 mesh（104 → 44），共用材質。
//    · 野怪：每隻合併成「主體 + 發光重點」兩個 mesh（467 → 24），共用材質。
//    · 牆：沿用 InstancedMesh，但改用 per-instance 顏色 + 共用材質（材質 22 → 2）。
//    · 靜態物件一律不 useFrame；草叢/牆/野怪一律不投影（只有塔/史詩可選投影）。
//    · Debug Html 標籤只在 Debug 模式建立。
//    詳細效能數字以預覽頁的即時 HUD（gl.info）為準。
// ============================================================================
import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Html } from "@react-three/drei";
import { worldX, worldZ, WORLD_SCALE, toWorld } from "./coordinateMapping.js";
import { hash01 } from "./mapShapePrimitives.js";
import { buildMobaLayout } from "./mobaMapLayout.js";
import { buildLandmarks } from "./mapLandmarks.js";
import { buildTerrainShapes } from "./mapTerrainShapes.js";
import { PALETTE, VOLUME_COLOR, HEIGHT } from "./mapVisualStyle.js";
import { MONSTER_COLOR } from "./mapMonsterShapes.js";
import { getRock } from "../../../environment/assets/rocks/index.js";
import { InstancedLODGroup } from "../../../environment/placement/InstancedLODGroup.jsx";
import { presetForLod } from "../../../environment/placement/lodRings.js";

const S = WORLD_SCALE;

// 地面色塊的 kind → 圖層開關群組
const LAYER_TOGGLE = {
  lane: "lane", ramp: "lane",
  jungle: "jungle", clearing: "jungle",
  pit: "pits", tower_pad: "towers",
  bush: "bush",
};

// ── 幾何工具 ────────────────────────────────────────────────────────────────
/** 模擬座標多邊形 → 平躺的 ShapeGeometry（尚未套世界高度）。 */
function polyGeometry(poly) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(worldX(p.x), -worldZ(p.y))));
  return new THREE.ShapeGeometry(shape);
}
/** 多邊形 → 有厚度的量體（基地高地平台用）。 */
function extrudePoly(poly, depth) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(worldX(p.x), -worldZ(p.y))));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 2 });
}
/** 給整塊 geometry 塗上單一頂點色（供 mergeGeometries 後用一個 vertexColors 材質畫）。 */
function paintGeo(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[3 * i] = c.r; arr[3 * i + 1] = c.g; arr[3 * i + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}
const GROUND_ROT = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

// ── G.14-fix：基地聚焦模式的篩選規則（debug 專用）──────────────────
//  「結構件」的定義與 tools/lib/baseSymmetryRaster.mjs 一致：決定基地輪廓與
//  可走性的東西。裝飾件（路斑 / 地表斑 / 岩影 / 草叢）一律不屬於結構件，
//  因此「只看基地結構」時會被關掉——也就是使用者要的「先關掉基地裝飾件」。
const BASE_STRUCT_LAYER_RE = /^(base|slab|fountain|ramp|highland|towerpad|plaza)_/;
const BASE_EXIT_LAYER_RE = /^(ramp|highland)_/;
const BASE_WALL_KINDS = new Set(["base_rim", "base_keep", "base_gate", "fountain_rim"]);
const BASE_FOCUS_LAYER = {
  struct: (id) => BASE_STRUCT_LAYER_RE.test(id),
  wall: () => false,
  tower: (id) => /^towerpad_/.test(id),
  exit: (id) => BASE_EXIT_LAYER_RE.test(id),
};

//  G.15：blueprint 檢視模式（debug 專用）。
//   "bp_blue"    只畫藍方 blueprint
//   "bp_red"     只畫紅方（＝藍方的鏡射結果）
//   "bp_overlay" 兩份一起畫，但把紅方**繞地圖中心轉 180°** 疊回藍方身上
//                （worldX(110)=worldZ(110)=0，所以「繞世界原點轉 π」就是那個鏡射）
//                ⇒ 兩份不重合的地方，畫面上會直接看到兩層錯開的量體。
const BP_SIDE_MODES = new Set(["bp_blue", "bp_red", "bp_overlay"]);
//  blueprint 檢視要畫的地面層：只有基地 blueprint 產出的東西。
//  ⚠ 不能沿用 BASE_STRUCT_LAYER_RE：它包含塔前廣場 plaza_ 與**兵線塔**的底座
//    towerpad_blue_top_0，那些是塔系統的東西，不歸基地 blueprint 管，混進來會讓
//    「只看藍方 blueprint」畫出一堆不屬於 blueprint 的物件。
const BP_LAYER_RE = /^(base|slab|fountain|ramp|highland)_(blue|red)|^towerpad_(blue|red)_nexus_/;
const sideOfId = (id) => (id.includes("_blue") || id.includes("blue_") ? "blue"
  : id.includes("_red") || id.includes("red_") ? "red" : null);

/** 靜態 InstancedMesh：一次設定矩陣 + per-instance 顏色（所有牆段共用材質）。 */
function WallInstances({ items, geometry, material, capOffset = 0, capScale = null, colorOf }) {
  const ref = useRef();
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      const len = (it.len + it.thick * 0.55) * S, th = it.thick * S;
      if (capScale) {
        p.set(worldX(it.x), it.h + capOffset, worldZ(it.y));
        s.set(th * capScale[0], capScale[1], len * capScale[2]);
      } else {
        p.set(worldX(it.x), it.h / 2, worldZ(it.y));
        s.set(th, it.h, len);
      }
      q.setFromAxisAngle(up, it.angle);
      mat.compose(p, q, s); m.setMatrixAt(i, mat);
      m.setColorAt(i, col.set(colorOf(it)));
    });
    m.count = items.length; m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items, capOffset, capScale, colorOf]);
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(items.length, 1)]}
    frustumCulled={false} castShadow={false} receiveShadow />;
}

/**
 * G.10 圓潤低模巨石：野區岩體（rock / jungle_struct）用一顆 20 面 icosahedron 縮放 +
 * 每顆隨機微傾 ⇒ 讀成分散的鈍角散石，不再是尖銳直切的 box 牆。單一 InstancedMesh。
 */
function RockInstances({ items, geometry, material }) {
  const ref = useRef();
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    items.forEach((it, i) => {
      const th = it.thick * S, len = it.len * S, h = it.h;
      p.set(worldX(it.x), h * 0.46, worldZ(it.y));
      // G.12：沿牆向大幅拉長 ⇒ 相鄰岩顯著重疊、連成**連續彎曲低岩壁**（不再是一顆一顆碎石）。
      s.set(th * 1.1, h, (len + th) * 1.2);
      // 微傾但幅度收小（太亂會又讀成散石）
      e.set(hash01(i, 3) * 0.18 - 0.09, it.angle, hash01(i, 7) * 0.18 - 0.09);
      q.setFromEuler(e);
      mat.compose(p, q, s); m.setMatrixAt(i, mat);
      // 亮度微擾 ⇒ 每顆石略有明暗，不是一片死板同色
      const base = (VOLUME_COLOR[it.kind] ?? VOLUME_COLOR.rock).face;
      col.set(base).multiplyScalar(0.86 + hash01(i, 11) * 0.28);
      m.setColorAt(i, col);
    });
    m.count = items.length; m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items, geometry]);
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(items.length, 1)]}
    frustumCulled={false} castShadow={false} receiveShadow />;
}

// ── 野怪：規格 → 合併幾何 ────────────────────────────────────────────────────
const ACCENT = new Set([
  MONSTER_COLOR.blue_crystal, MONSTER_COLOR.red_ember, MONSTER_COLOR.camp_accent,
  MONSTER_COLOR.dragon_accent, MONSTER_COLOR.baron_accent,
]);
function partGeometry(p) {
  if (p.shape === "box") return new THREE.BoxGeometry(p.d * S, p.h, p.w * S);
  if (p.shape === "cyl") return new THREE.CylinderGeometry(p.rTop * S, p.rBot * S, p.h, p.seg ?? 9);
  if (p.shape === "cone") return new THREE.ConeGeometry(p.r * S, p.h, p.seg ?? 8);
  //  G.9：球 / 膠囊段數壓到「圓弧但低模」（8~9 徑向、5~6 縱向）⇒ 控制三角面預算。
  if (p.shape === "sph") return new THREE.SphereGeometry(1, 9, 6).scale(p.rx * S, p.ry, p.rz * S);
  if (p.shape === "cap") return new THREE.CapsuleGeometry(p.r * S, p.len, 2, 8);
  if (p.shape === "ico") return new THREE.IcosahedronGeometry(p.r * S, 0);
  return new THREE.OctahedronGeometry(p.r * S, 0);
}
function partLocalMatrix(p) {
  const half = p.h / 2;
  if (p.shape === "cone") {
    const tf = p.tiltF ?? 0, ts = p.tiltS ?? 0;
    const T = new THREE.Matrix4().makeTranslation(-half * Math.sin(ts), p.z + half * Math.cos(tf) * Math.cos(ts), half * Math.sin(tf));
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tf, 0, ts, "XYZ"));
    return T.multiply(R);
  }
  if (p.shape === "box") {
    const T = new THREE.Matrix4().makeTranslation(0, p.z + half, 0);
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.tiltF ?? 0, -(p.rot ?? 0), p.tiltS ?? 0, "XYZ"));
    return T.multiply(R);
  }
  if (p.shape === "sph") {
    return new THREE.Matrix4().makeTranslation(0, p.z + p.ry, 0).multiply(new THREE.Matrix4().makeRotationY(-(p.rot ?? 0)));
  }
  if (p.shape === "cap") {
    // 膠囊：几何總高 = len + 2·(r·S)，底部落在 z ⇒ 中心 = z + len/2 + r·S；tilt 繞 X/Z。
    const T = new THREE.Matrix4().makeTranslation(0, p.z + p.len / 2 + p.r * S, 0);
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.tiltF ?? 0, 0, p.tiltS ?? 0, "XYZ"));
    return T.multiply(R);
  }
  if (p.shape === "octa") {
    return new THREE.Matrix4().makeTranslation(0, p.z + half, 0).multiply(new THREE.Matrix4().makeRotationY(-(p.rot ?? 0)));
  }
  return new THREE.Matrix4().makeTranslation(0, p.z + half, 0); // cyl / ico
}
/** 一隻怪 → { body, accent, accentColor }（合併幾何；水平尺寸已含 S，垂直不含）。 */
function buildMonsterGeo(m) {
  const bodyGeos = [], accentGeos = []; let accentColor = null;
  for (const mem of m.members) {
    const memMat = new THREE.Matrix4().makeTranslation(-mem.dy * S, 0, mem.dx * S)
      .multiply(new THREE.Matrix4().makeRotationY(-(mem.rot ?? 0)));
    for (const p of mem.parts) {
      // ⚠ G.8 關鍵修正：box/cyl/cone 是 indexed、ico/octa 是 non-indexed；
      //   mergeGeometries 混合 indexed + non-indexed 會回傳 **null** ⇒ G.7 的野怪主體整個消失，
      //   只剩 accent（八面體晶體）在畫面上 ⇒ 巴龍/小龍/Buff 看起來像「點/晶體/圓圈」。
      //   一律轉成 non-indexed 再合併，主體才會回來。
      let g = partGeometry(p);
      if (g.index) g = g.toNonIndexed();
      const M = memMat.clone()
        .multiply(new THREE.Matrix4().makeTranslation(-p.dy * S, 0, p.dx * S))
        .multiply(partLocalMatrix(p));
      g.applyMatrix4(M);
      paintGeo(g, p.color);
      if (ACCENT.has(p.color)) { accentGeos.push(g); if (accentColor == null) accentColor = p.color; }
      else bodyGeos.push(g);
    }
  }
  return {
    body: bodyGeos.length ? mergeGeometries(bodyGeos, false) : null,
    accent: accentGeos.length ? mergeGeometries(accentGeos, false) : null,
    accentColor: accentColor ?? 0xffffff,
  };
}

// ── 塔：規格 → 合併幾何 ──────────────────────────────────────────────────────
/** 一座塔的塔身（底座 + 逐層塔身）合併幾何（頂點著色）；塔冠另外畫（發光）。 */
function buildTowerBody(t, yBase) {
  const geos = [];
  const plinth = PALETTE[t.plinth] ?? PALETTE.tower_plinth_outer, stone = PALETTE.tower_stone;
  const base = new THREE.CylinderGeometry(t.padR * S * 0.72, t.padR * S * 0.82, 1.8, 8);
  base.translate(0, yBase + 0.9, 0); paintGeo(base, plinth); geos.push(base);
  let h = yBase;
  t.tiers.forEach((tier, i) => {
    const y = 1.8 + h + tier.h / 2; const next = t.tiers[i + 1];
    const g = new THREE.CylinderGeometry((next ? next.r : tier.r * 0.8) * S, tier.r * S, tier.h, 8);
    g.translate(0, y, 0); paintGeo(g, stone); geos.push(g); h += tier.h;
  });
  const crownY = 1.8 + h + t.crown * 0.9;
  return { body: mergeGeometries(geos, false), crownY };
}

export default function MobaMapBlockout({ show = {}, ring = "desktop", castTowerShadow = false }) {
  const L = useMemo(() => buildMobaLayout(), []);
  const T = useMemo(() => buildTerrainShapes(L), [L]);
  const LM = useMemo(() => buildLandmarks(L, T.camps), [L, T]);

  const showLane = show.lane ?? true, showJungle = show.jungle ?? true;
  const showTowers = show.towers ?? true, showPits = show.pits ?? true;
  const showCoords = show.coords ?? false, showDecor = show.decor ?? true;
  const showLabels = show.labels ?? true;
  const showBush = show.bush ?? true, showMonsters = show.monsters ?? true;
  const showWalls = show.walls ?? true;   // G.9：獨立的「牆體」總開關（供「只看地表 / 只看基地」乾淨隔離）
  const showBase = show.base ?? true;      // G.9：基地平台 / 主堡 / 泉水總開關
  //  G.14-fix：基地聚焦模式（debug 專用）。null = 正常畫。
  //   "struct" 只看基地結構（平台/石板/泉水/坡道/高地/塔座/廣場 + 基地牆 + 塔）
  //   "wall"   只看基地牆體
  //   "tower"  只看基地塔（門牙塔 + 高地塔）
  //   "exit"   只看三路出口（坡道 + 高地走廊 + 高地塔）
  //  依據是 id 前綴 / 牆的 kind，與 verifier 跟截圖工具用同一份定義。
  const baseFocus = show.baseFocus ?? null;
  //  G.15：blueprint 檢視（只看藍方 / 只看紅方鏡射 / 藍紅 overlay）
  const bpMode = BP_SIDE_MODES.has(baseFocus) ? baseFocus : null;
  const flags = { lane: showLane, jungle: showJungle, towers: showTowers, pits: showPits, bush: showBush };
  const lodRing = presetForLod(ring);

  // ── 共用材質（材質數量從數百收斂到十幾個的關鍵：mesh 多、material 物件少）──
  const mats = useMemo(() => ({
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    groundRiver: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0x0d2b36, emissiveIntensity: 0.28 }),
    wallFace: new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    wallCap: new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    towerBody: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }),
    crownBlue: new THREE.MeshStandardMaterial({ color: PALETTE.nexus_blue, emissive: PALETTE.nexus_blue, emissiveIntensity: 0.75, roughness: 0.25 }),
    crownRed: new THREE.MeshStandardMaterial({ color: PALETTE.nexus_red, emissive: PALETTE.nexus_red, emissiveIntensity: 0.75, roughness: 0.25 }),
    monBody: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
    //  G.15 overlay 用：紅方整組染成洋紅（color 會乘在頂點色上）⇒ 疊不合的地方一眼看見
    groundTint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: 0xff6ad0,
      transparent: true, opacity: 0.75, depthWrite: false }),
    wallTint: new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, color: 0xff6ad0,
      transparent: true, opacity: 0.7, depthWrite: false }),
  }), []);
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  // ── 地面：依開關群組合併（212 mesh → ~7 mesh）───────────────────────────────
  const groundGroups = useMemo(() => {
    const groups = {};
    for (const layer of T.groundLayers) {
      let key, river = false, side = null;
      if (bpMode) {
        //  blueprint 檢視：只留基地 blueprint 產出的層，並依 blue / red 分組
        if (!BP_LAYER_RE.test(layer.id)) continue;
        side = sideOfId(layer.id);
        if (!side) continue;
        if (bpMode === "bp_blue" && side !== "blue") continue;
        if (bpMode === "bp_red" && side !== "red") continue;
        key = `bp_${side}`;
      } else if (baseFocus) {
        //  G.14-fix 的四個基地聚焦模式：關掉所有非結構件（路斑 / 地表斑 / 岩影 / 草叢）
        if (!BASE_FOCUS_LAYER[baseFocus](layer.id)) continue;
        key = "always";
      } else {
        river = layer.kind === "river";
        key = river ? "river" : (LAYER_TOGGLE[layer.kind] ?? "always");
      }
      const g = polyGeometry(layer.poly);
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, layer.y, 0).multiply(GROUND_ROT));
      paintGeo(g, layer.color);
      (groups[key] || (groups[key] = {
        river, side, toggle: (key === "always" || key === "river" || key.startsWith("bp_")) ? null : key, geos: [],
      })).geos.push(g);
    }
    return Object.entries(groups)
      .map(([key, v]) => ({ key, river: v.river, side: v.side, toggle: v.toggle, geo: mergeGeometries(v.geos, false) }))
      .filter((g) => g.geo);
  }, [T, baseFocus, bpMode]);

  // ── 牆：G.10 把野區岩體（rock / jungle_struct）分出來，用**圓潤低模巨石**渲染；
  //     其餘（崖 / 基地城牆 / 坑壁）維持 box。box 群組依開關（always/pits）分組。
  const rockItems = useMemo(() => T.wallItems.filter((it) => it.kind === "rock" || it.kind === "jungle_struct"), [T]);
  const wallGroups = useMemo(() => {
    const by = { always: [], pits: [], bp_blue: [], bp_red: [] };
    for (const it of T.wallItems) {
      if (it.kind === "rock" || it.kind === "jungle_struct") continue;
      if (bpMode) {
        if (!BASE_WALL_KINDS.has(it.kind)) continue;
        const side = sideOfId(it.struct ?? "");
        if (!side) continue;
        if (bpMode === "bp_blue" && side !== "blue") continue;
        if (bpMode === "bp_red" && side !== "red") continue;
        by[`bp_${side}`].push(it);
        continue;
      }
      if (baseFocus && !BASE_WALL_KINDS.has(it.kind)) continue;
      if (baseFocus === "tower" || baseFocus === "exit") continue;
      (it.kind === "pit_wall" ? by.pits : by.always).push(it);
    }
    return Object.entries(by).filter(([, items]) => items.length)
      .map(([key, items]) => ({ key, items, toggle: key === "pits" ? "pits" : null }));
  }, [T, baseFocus, bpMode]);
  const wallFaceColor = useMemo(() => (it) => (VOLUME_COLOR[it.kind] ?? VOLUME_COLOR.wall).face, []);
  const wallCapColor = useMemo(() => (it) => (VOLUME_COLOR[it.kind] ?? VOLUME_COLOR.wall).top, []);
  const rockGeo = useMemo(() => new THREE.IcosahedronGeometry(0.5, 1), []);  // G.12：再圓一階（80 面）⇒ 連續岩壁不菱角
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), []);

  // ── 塔：每座合併塔身 + 塔冠 ──────────────────────────────────────────────────
  const towerData = useMemo(() => {
    //  G.15：blueprint 檢視只留「基地塔」（門牙塔 + 高地塔），並依 side 過濾。
    if (bpMode) {
      const wantSide = bpMode === "bp_red" ? "red" : bpMode === "bp_blue" ? "blue" : null;
      const pick = (t) => !wantSide || t.side === wantSide;
      return [
        ...T.towers.filter((t) => t.kind === "highground" && pick(t)).map((t) => ({ t, yBase: 0, ...buildTowerBody(t, 0) })),
        ...T.nexusTurrets.filter(pick).map((t) => ({ t, yBase: HEIGHT.base_platform, ...buildTowerBody(t, HEIGHT.base_platform) })),
      ];
    }
    //  G.14-fix：基地聚焦時只留「基地塔」（門牙塔 + 高地塔）。
    const keepLane = baseFocus === "wall" ? () => false
      : baseFocus ? (t) => t.kind === "highground" : () => true;
    const keepNexus = baseFocus === "wall" || baseFocus === "exit" ? false : true;
    return [
      ...T.towers.filter(keepLane).map((t) => ({ t, yBase: 0, ...buildTowerBody(t, 0) })),
      ...(keepNexus ? T.nexusTurrets : []).map((t) => ({ t, yBase: HEIGHT.base_platform, ...buildTowerBody(t, HEIGHT.base_platform) })),
    ];
  }, [T, baseFocus, bpMode]);

  // ── 野怪：每隻合併主體 + 發光重點 ────────────────────────────────────────────
  const monsterData = useMemo(() => T.monsters.map((m) => ({ m, ...buildMonsterGeo(m) })), [T]);

  // ── 基地高地平台 ────────────────────────────────────────────────────────────
  const baseVolumes = useMemo(() => {
    if (baseFocus === "wall" || baseFocus === "tower") return [];
    const wantSide = bpMode === "bp_red" ? "red" : bpMode === "bp_blue" ? "blue" : null;
    return T.meta.nexus.filter((n) => !wantSide || n.side === wantSide)
      .map((n) => ({ ...n, geo: extrudePoly(n.poly, HEIGHT.base_platform) }));
  }, [T, baseFocus, bpMode]);

  // ── 裝飾岩 ─────────────────────────────────────────────────────────────────
  const rockGroups = useMemo(() => {
    if (!showDecor) return [];
    const names = ["Rock_Large_A", "Rock_Cliff_A", "Rock_Large_B"];
    const byAsset = {};
    T.rocks.forEach((r, i) => {
      const name = names[i % names.length];
      // G.11：裝飾石視覺尺寸略縮小（×0.85），不再壓迫野區與主路
      (byAsset[name] || (byAsset[name] = [])).push({ pos: toWorld(r.x, r.y, 4.5), rotY: r.rot, scale: r.scale * 0.85, color: [0.82, 0.8, 0.76] });
    });
    return Object.keys(byAsset).map((name) => ({ name, transforms: byAsset[name] }));
  }, [T, showDecor]);

  //  G.15 overlay：紅方整組**繞世界原點轉 180°**（worldX(110)=worldZ(110)=0 ⇒ 世界原點
  //  就是地圖中心）疊回藍方身上。重合＝兩邊一模一樣；錯開＝畫面上直接看到洋紅色殘影。
  const bpOverlayRed = bpMode === "bp_overlay";
  const BpWrap = ({ side, children }) => (
    bpOverlayRed && side === "red"
      ? <group rotation={[0, Math.PI, 0]}>{children}</group>
      : <>{children}</>
  );

  return (
    <group>
      {/* ── 地面（合併大 mesh）── */}
      {groundGroups.map((g) => (
        (g.toggle && !flags[g.toggle]) ? null : (
          <BpWrap key={g.key} side={g.side}>
            <mesh geometry={g.geo} receiveShadow
              material={bpOverlayRed && g.side === "red" ? mats.groundTint
                : g.river ? mats.groundRiver : mats.ground} />
          </BpWrap>
        )
      ))}

      {/* ── 牆量體（崖 / 基地城牆 / 坑壁：box + 頂蓋）── */}
      {showWalls && wallGroups.map((g) => {
        if (g.toggle && !flags[g.toggle]) return null;
        const red = bpOverlayRed && g.key === "bp_red";
        return (
          <BpWrap key={g.key} side={g.key === "bp_red" ? "red" : "blue"}>
            <group>
              <WallInstances items={g.items} geometry={boxGeo}
                material={red ? mats.wallTint : mats.wallFace} colorOf={wallFaceColor} />
              {!red && <WallInstances items={g.items} geometry={boxGeo} material={mats.wallCap} colorOf={wallCapColor}
                capOffset={0.55} capScale={[1.06, 1.1, 1.0]} />}
            </group>
          </BpWrap>
        );
      })}

      {/* ── 野區岩體：圓潤低模巨石（分散、鈍角；跟「野區」開關）── */}
      {showWalls && showJungle && rockItems.length > 0 && (
        <RockInstances items={rockItems} geometry={rockGeo} material={rockMat} />
      )}

      {/* ── 基地：高地平台 + 主堡 + 泉水 ── */}
      {showBase && baseVolumes.map((n) => (
        <BpWrap key={n.side} side={n.side}>
        <group>
          <mesh geometry={n.geo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <meshStandardMaterial color={n.platformColor} roughness={0.9} flatShading />
          </mesh>
          <mesh position={toWorld(n.x, n.y, HEIGHT.base_platform + 3.4)}>
            <cylinderGeometry args={[5.4, 7.6, 6.8, 6]} />
            <meshStandardMaterial color={n.platformTop} roughness={0.6} flatShading />
          </mesh>
          <mesh position={toWorld(n.x, n.y, HEIGHT.base_platform + 10.4)}>
            <octahedronGeometry args={[5.6, 0]} />
            <meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={0.7} roughness={0.2} />
          </mesh>
          <mesh position={toWorld(n.fountain.x, n.fountain.y, HEIGHT.base_platform + 1.4)}>
            <cylinderGeometry args={[1.5 * S, 2.1 * S, 2.4, 8]} />
            <meshStandardMaterial color={n.platformTop} roughness={0.7} flatShading />
          </mesh>
          <mesh position={toWorld(n.fountain.x, n.fountain.y, HEIGHT.base_platform + 4.6)}>
            <cylinderGeometry args={[0.5 * S, 1.1 * S, 4.2, 8]} />
            <meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={0.55} roughness={0.35} />
          </mesh>
          <mesh position={toWorld(n.fountain.x, n.fountain.y, HEIGHT.base_platform + 7.4)}>
            <octahedronGeometry args={[1.6 * S, 0]} />
            <meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={0.85} roughness={0.2} />
          </mesh>
          <pointLight position={toWorld(n.fountain.x, n.fountain.y, HEIGHT.base_platform + 5)}
            color={n.color} intensity={18} distance={44} decay={2} />
        </group>
        </BpWrap>
      ))}

      {/* ── 塔（塔身合併 + 塔冠）── */}
      {showTowers && towerData.map(({ t, yBase, body, crownY }) => (
        <BpWrap key={t.id} side={t.side}>
        <group>
          <mesh geometry={body} material={mats.towerBody} position={toWorld(t.x, t.y, 0)} castShadow={castTowerShadow} />
          <mesh geometry={crownGeo(t)} material={t.side === "blue" ? mats.crownBlue : mats.crownRed}
            position={toWorld(t.x, t.y, crownY)} />
        </group>
        </BpWrap>
      ))}

      {/* ── 草叢 / cover（可穿越視野遮蔽，非障礙）── */}
      {showBush && <BushClusters clusters={T.bushClusters} />}

      {/* ── 野怪 / 史詩野怪（合併幾何；史詩跟龍/巴龍開關）── */}
      {monsterData.map(({ m, body, accent, accentColor }) => (
        (m.kind === "epic" ? showPits : showMonsters) ? (
          <group key={m.id} position={toWorld(m.x, m.y, 0)} rotation={[0, Math.PI / 2 - m.facing, 0]} scale={m.sizeK ?? 1}>
            {body && <mesh geometry={body} material={mats.monBody} castShadow={m.kind === "epic" && castTowerShadow} />}
            {accent && <mesh geometry={accent}>
              <meshStandardMaterial vertexColors color={0xffffff} emissive={accentColor} emissiveIntensity={0.5} roughness={0.3} flatShading />
            </mesh>}
          </group>
        ) : null
      ))}

      {/* ── 裝飾岩 ── */}
      {rockGroups.map((g) => (
        <InstancedLODGroup key={"rk-" + g.name} asset={getRock(g.name)} transforms={g.transforms} ring={lodRing} />
      ))}

      {/* ── 標籤（Debug 模式才建立 Html）── */}
      {showLabels && LM.labels.map((l) => {
        const mon = T.monsters.find((m) => m.id === "mon_" + l.key.slice(4));
        const y = mon ? mon.headroom + 2 : l.kind === "base" ? 22 : 14;
        return (
          <CoordLabel key={l.key} p={l} y={y} text={l.text}
            color={l.kind === "pit" ? "#e9d5ff" : l.kind === "base" ? "#cfe3ff"
              : l.kind === "buff" ? "#fde68a" : l.kind === "camp" ? "#d8e8a8"
                : l.kind === "lane" ? "#efe3c8" : "#cbe58a"} />
        );
      })}
      {showCoords && (
        <>
          <CoordLabel p={L.bases.blue} text={`主堡 ${L.bases.blue.x},${L.bases.blue.y}`} color="#7ab8ff" />
          <CoordLabel p={L.bases.red} text={`主堡 ${L.bases.red.x},${L.bases.red.y}`} color="#ff9a9a" />
          {T.camps.map((c) => (
            <CoordLabel key={c.id} p={c} color="#c7f39a"
              text={c.isPresentation ? `${c.x},${c.y}（呈現用）` : `${c.x},${c.y}`} />
          ))}
          {T.towers.map((t) => (
            <CoordLabel key={"c" + t.id} p={t} color="#dbe7f5"
              text={t.kind === "highground" ? "高地塔" : t.kind === "inner" ? "內塔" : "外塔"} />
          ))}
          {T.nexusTurrets.map((t) => <CoordLabel key={"c" + t.id} p={t} text="門牙塔" color="#dbe7f5" />)}
        </>
      )}
    </group>
  );
}

// 塔冠幾何（每座一個小 octahedron；共用材質，依 side 選藍/紅）
const _crownCache = new Map();
function crownGeo(t) {
  const key = t.crown.toFixed(3);
  if (!_crownCache.has(key)) _crownCache.set(key, new THREE.OctahedronGeometry(t.crown * S * 0.8, 0));
  return _crownCache.get(key);
}

/**
 * 草叢 / cover：把每一叢的 blobs 攤平成兩個 InstancedMesh（亮葉 / 暗葉，各一個 draw call）。
 * blob 用壓扁的 icosahedron ⇒ 低模灌木團塊。水平 ×S，垂直不乘。
 */
function BushInstances({ blobs, color, emissive }) {
  const ref = useRef();
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion();
    const s = new THREE.Vector3(), p = new THREE.Vector3();
    blobs.forEach((b, i) => {
      const rw = b.r * S;
      p.set(worldX(b.x), b.h * 0.5, worldZ(b.y));
      s.set(rw, b.h * 0.55, rw);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i % 6) * 0.5);
      mat.compose(p, q, s); m.setMatrixAt(i, mat);
    });
    m.count = blobs.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }, [blobs]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(blobs.length, 1)]}
      frustumCulled={false} castShadow={false} receiveShadow>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} roughness={1} flatShading emissive={emissive} emissiveIntensity={0.06} />
    </instancedMesh>
  );
}
function BushClusters({ clusters }) {
  const { lit, dark } = useMemo(() => {
    const lit = [], dark = [];
    for (const c of clusters) for (const b of c.blobs) {
      const world = { x: c.x + b.dx, y: c.y + b.dy, r: b.r, h: b.h };
      (b.lit ? lit : dark).push(world);
    }
    return { lit, dark };
  }, [clusters]);
  return (
    <group>
      <BushInstances blobs={dark} color={PALETTE.bush_leaf} emissive={0x0a1206} />
      <BushInstances blobs={lit} color={PALETTE.bush_leaf_lit} emissive={0x0a1206} />
    </group>
  );
}

function CoordLabel({ p, text, color, y = 14 }) {
  return (
    <Html position={toWorld(p.x, p.y, y)} center distanceFactor={240}
      style={{ font: "700 12px ui-monospace,monospace", color, whiteSpace: "nowrap", textShadow: "0 1px 3px #000", pointerEvents: "none" }}>
      {text}
    </Html>
  );
}
