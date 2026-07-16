// ============================================================================
//  MobaView3D.jsx  —  正式 3D 渲染殼（React Three Fiber + Bloom/SSAO）
//  - 只讀呈現資料源的 prev/snapshot/subTRef，不改任何邏輯/數值
//    （S29B6：資料源可注入 —— 預設 useGameStore；Replay 傳唯讀 adapter ⇒ 現場與重播共用本檔）
//  - 場景內容用一條 useFrame 命令式更新（沿用已驗證的更新邏輯，效能/正確性高）
//  - Canvas / 正交神之視角 / 燈光 / 後製濾鏡 皆為 R3F 宣告式
//    （S29B6：相機改由 cameraStore + BattleCameraController 單一驅動，已移除 OrbitControls）
//
//  安裝：npm install three @react-three/fiber @react-three/drei \
//                    @react-three/postprocessing postprocessing zustand
//  注意：此檔需在你的 Vite/CRA 專案執行（Claude artifact 沙盒無法 import R3F）。
//  HUD / 小地圖 / Start 按鈕是 DOM 疊層 → 放在 GameView.jsx。
// ============================================================================

import React, { useRef, useEffect } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
// S29B6：不再使用 drei `OrbitControls`——它同時持有 pan/zoom/rotate，與 cameraStore
//   形成雙頭控制；且它的 `enablePan` 舊碼寫死成 debug ⇒ 地圖不能平移、只能旋轉。
//   2.5D 戰術視角不要旋轉，改由 cameraStore + BattleCameraController 單一驅動。
import { OrthographicCamera } from "@react-three/drei";
import { EffectComposer, Bloom, SSAO, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { useGameStore } from "./useGameStore.js";
import {
  lerp, clamp, ease, dist, LANES, posOnLane, WATER, WALLS, PITS, BUSHES, RIVER,
  BASE, FOUNTAIN, ROLE_NAME, SIDE, GLOW, CAMPS,
  WORLD_BOUNDS, WORLD_SCALE, worldX, worldZ, mapNormX,
  OBJECTIVE_PRESENTATION, presentationForObjective,
} from "./gameData.js";
import BattleCameraController from "./battle/ui/BattleCameraController.jsx";
import { useCameraStore, ZOOM_MIN, ZOOM_MAX } from "./battle/cameraStore.js";
import { presetFor } from "./battle/quality.js";
import { useIsMobile } from "./ui/useViewport.js";

// ── 世界尺度（放大；只影響渲染，不影響邏輯）──────────────────────────────────
const S = WORLD_SCALE;
const wx = worldX, wz = worldZ;
// S29B6：中立目標死亡淡出時長（秒，真實時間）。任務單規格 0.8–1.5s；
//   舊值 0.5s 太短，配上「血條追值殘留」讓死亡看起來像瞬間消失。
//   live 與 Replay 共用同一段程式碼 ⇒ 兩邊的 fade 必然一致。
export const OBJ_FADE_S = 1.1;
// S29B2：英雄可讀性放大係數（實機回報「英雄太小」；只放大視覺模型，不碰座標/邏輯）
const HK = 1.3;
const HERO_CAP_Y = 1.7 * HK * S;     // 建立與 useFrame 更新共用，避免兩處不一致
const HERO_TOP_Y = 3.4 * HK * S;
const HERO_HP_Y = 4.1 * HK * S;
const HERO_HPW = 2.5 * HK * S;
const OVERLAY_Y = 5.6 * HK * S;

// S29：可重用的暫存向量（避免在 useFrame 內每幀 new THREE.Vector3）
const _up = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();

// ── 程序化彩色底圖（無上傳圖時的後備）────────────────────────────────────────
//  S29B2 地圖語意升級（一次性繪製，零 runtime 成本）：河道成帶狀水域、三路材質
//  與野地明確區分、Dragon/Baron pit 有坑面+色環、營地有標記、草叢像可進入區、
//  野徑把營地與路連起來 ⇒ 玩家看得懂「哪裡是路、哪裡是野區、目標在哪」。
function makeRiftTexture() {
  const s = 1024, cv = document.createElement("canvas"); cv.width = cv.height = s;
  const g = cv.getContext("2d"), px = (p) => mapNormX(p) * s;
  const grad = g.createLinearGradient(0, s, s, 0);
  grad.addColorStop(0, "#295f41"); grad.addColorStop(0.5, "#2c6340"); grad.addColorStop(1, "#4a6b30");
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  // 野地雜訊（深色 ⇒ 與路面的亮沙色對比更強）
  for (let i = 0; i < 340; i++) { g.fillStyle = `rgba(${12+Math.random()*30},${66+Math.random()*54},${30+Math.random()*32},0.20)`; g.beginPath(); g.arc(Math.random()*s, Math.random()*s, 8+Math.random()*26, 0, 7); g.fill(); }
  // 野徑：營地 → 最近路點的淡色小徑（地圖語意：野區入口）
  const lanePts = [];
  for (const ln of ["top", "mid", "bot"]) for (let t = 0; t <= 1.001; t += 0.04) lanePts.push(posOnLane(ln, t));
  g.strokeStyle = "rgba(180,160,110,0.28)"; g.lineWidth = px(2.2); g.lineCap = "round";
  for (const c of CAMPS) {
    let best = lanePts[0], bd = Infinity;
    for (const p of lanePts) { const dd = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (dd < bd) { bd = dd; best = p; } }
    g.beginPath(); g.moveTo(px(c.x), px(c.y)); g.lineTo(px(best.x), px(best.y)); g.stroke();
  }
  // 河道：寬水帶 + 淺灘邊線 + 波光
  const riverPath = () => RIVER.points.forEach((p, i) => (i ? g.lineTo(px(p.x), px(p.y)) : g.moveTo(px(p.x), px(p.y))));
  g.strokeStyle = "rgba(38,110,160,0.75)"; g.lineWidth = px(RIVER.width); g.lineCap = "round";
  g.beginPath(); riverPath(); g.stroke();
  g.strokeStyle = "rgba(70,160,200,0.6)"; g.lineWidth = px(RIVER.width * 0.68);
  g.beginPath(); riverPath(); g.stroke();
  g.strokeStyle = "rgba(160,225,248,0.5)"; g.lineWidth = px(1.4);
  g.beginPath(); riverPath(); g.stroke();
  // 三路：亮沙色路面 + 深色路緣（兵線行進路徑一眼可辨）
  for (const lane of ["top", "mid", "bot"]) {
    g.strokeStyle = "rgba(60,48,30,0.55)"; g.lineWidth = px(7.6); g.lineJoin = "round";
    g.beginPath(); LANES[lane].forEach((p, i) => (i ? g.lineTo(px(p.x), px(p.y)) : g.moveTo(px(p.x), px(p.y)))); g.stroke();
    g.strokeStyle = "rgba(214,190,140,0.9)"; g.lineWidth = px(5.8);
    g.beginPath(); LANES[lane].forEach((p, i) => (i ? g.lineTo(px(p.x), px(p.y)) : g.moveTo(px(p.x), px(p.y)))); g.stroke();
  }
  // Dragon / Baron pit：坑面 + 色環（紫=龍、金=巴龍）
  for (const key of ["dragon", "baron"]) {
    const pit = PITS[key];
    const hex = OBJECTIVE_PRESENTATION[key].color, col = `${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255}`;
    g.fillStyle = "rgba(10,16,20,0.72)";
    g.beginPath(); g.arc(px(pit.x), px(pit.y), px(6.2), 0, 7); g.fill();
    g.strokeStyle = `rgba(${col},0.85)`; g.lineWidth = px(0.9);
    g.beginPath(); g.arc(px(pit.x), px(pit.y), px(6.2), 0, 7); g.stroke();
    g.strokeStyle = `rgba(${col},0.35)`; g.lineWidth = px(0.5);
    g.beginPath(); g.arc(px(pit.x), px(pit.y), px(7.6), 0, 7); g.stroke();
  }
  // 營地標記：菱形 + 色暈（粉=buff、萊姆=一般；與 3D 低模/Minimap 同色系）
  for (const c of CAMPS) {
    const hex = presentationForObjective(c).color, col = `${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255}`;
    const gr = g.createRadialGradient(px(c.x), px(c.y), px(0.4), px(c.x), px(c.y), px(3.4));
    gr.addColorStop(0, `rgba(${col},0.5)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(px(c.x), px(c.y), px(3.4), 0, 7); g.fill();
    g.save(); g.translate(px(c.x), px(c.y)); g.rotate(Math.PI / 4);
    g.fillStyle = `rgba(${col},0.9)`; g.fillRect(-px(0.8), -px(0.8), px(1.6), px(1.6)); g.restore();
  }
  // 草叢：亮綠可進入區 + 邊界描邊（不再只是深色裝飾）
  BUSHES.forEach((b) => {
    g.fillStyle = "rgba(52,150,74,0.55)";
    g.beginPath(); g.ellipse(px(b.x), px(b.y), px(b.r), px(b.r * 0.82), 0, 0, 7); g.fill();
    g.strokeStyle = "rgba(120,220,140,0.5)"; g.lineWidth = px(0.45);
    g.setLineDash([px(0.9), px(0.7)]);
    g.beginPath(); g.ellipse(px(b.x), px(b.y), px(b.r), px(b.r * 0.82), 0, 0, 7); g.stroke();
    g.setLineDash([]);
  });
  // 基地：色暈 + 平台方界（與泉水區分）
  const baseGlow = (b, c1, c2) => { const gr = g.createRadialGradient(px(b.x), px(b.y), px(2), px(b.x), px(b.y), px(11)); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.beginPath(); g.arc(px(b.x), px(b.y), px(11), 0, 7); g.fill(); };
  baseGlow(BASE.blue, "rgba(120,180,255,0.85)", "rgba(40,90,200,0.05)");
  baseGlow(BASE.red, "rgba(255,150,150,0.85)", "rgba(200,50,50,0.05)");
  for (const [b, col] of [[BASE.blue, "96,165,250"], [BASE.red, "248,113,113"]]) {
    g.strokeStyle = `rgba(${col},0.55)`; g.lineWidth = px(0.6);
    g.strokeRect(px(b.x - 7), px(b.y - 7), px(14), px(14));
  }
  // S29B3：泉水區——明確圓形平台 + 十字治療符號（與基地方界區分）
  for (const [f, col] of [[FOUNTAIN.blue, "96,165,250"], [FOUNTAIN.red, "248,113,113"]]) {
    g.fillStyle = `rgba(${col},0.35)`;
    g.beginPath(); g.arc(px(f.x), px(f.y), px(4.2), 0, 7); g.fill();
    g.strokeStyle = `rgba(${col},0.9)`; g.lineWidth = px(0.55);
    g.beginPath(); g.arc(px(f.x), px(f.y), px(4.2), 0, 7); g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = px(0.8);
    g.beginPath(); g.moveTo(px(f.x - 1.6), px(f.y)); g.lineTo(px(f.x + 1.6), px(f.y));
    g.moveTo(px(f.x), px(f.y - 1.6)); g.lineTo(px(f.x), px(f.y + 1.6)); g.stroke();
  }
  // S29B3：地面文字標籤（玩家看不懂色塊 ⇒ 直接寫字；billboard 標籤另見 3D sprite）
  const label = (x, y, text, col, size = 2.6) => {
    g.font = `900 ${px(size)}px system-ui,sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = px(0.5); g.strokeStyle = "rgba(0,0,0,0.8)"; g.strokeText(text, px(x), px(y));
    g.fillStyle = col; g.fillText(text, px(x), px(y));
  };
  label(PITS.dragon.x, PITS.dragon.y + 14, "DRAGON 巨龍", "rgba(200,170,255,0.95)");
  label(PITS.baron.x, PITS.baron.y - 14, "BARON 巴龍", "rgba(253,224,71,0.95)");
  label(FOUNTAIN.blue.x + 6, FOUNTAIN.blue.y - 4.5, "泉水", "rgba(147,197,253,0.95)", 2.2);
  label(FOUNTAIN.red.x - 6, FOUNTAIN.red.y + 4.5, "泉水", "rgba(252,165,165,0.95)", 2.2);
  for (const c of CAMPS) {
    const p = presentationForObjective(c);
    label(c.x, c.y + 5, p.label.toUpperCase(), c.presentationKey === "blueBuff" ? "rgba(56,189,248,0.95)" : c.presentationKey === "redBuff" ? "rgba(249,115,22,0.95)" : "rgba(163,230,53,0.95)", 1.8);
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
}
function makeCapsule(r, len, mat) {
  const grp = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18), mat); cyl.castShadow = true;
  const top = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat); top.position.y = len / 2; top.castShadow = true;
  const bot = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat); bot.position.y = -len / 2; bot.castShadow = true;
  grp.add(cyl, top, bot); return grp;
}
function makeLabelSprite(text, hex, sx = 3, sy = 1.5) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 64; const g = c.getContext("2d");
  g.font = "bold 44px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 7; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(text, 64, 34);
  g.fillStyle = "#" + hex.toString(16).padStart(6, "0"); g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(sx * S, sy * S, 1); return sp;
}
// ── Sprint06 Hero Overlay：可重繪文字 sprite（玩家名+KDA / 復活倒數）──────────
//  S29 效能修復：舊碼每次內容變動就 `map.dispose()` + `new THREE.CanvasTexture(新 canvas)`。
//    復活倒數每模擬秒都會變 ⇒ 最多 10 個英雄 × 每秒數次 = 每秒數十次「建 canvas + 上傳 GPU
//    texture」。改為**重用同一張 canvas 與同一個 texture**，只重畫並設 needsUpdate。
function paintOverlay(c, hero, player, line3, hex, badge) {
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = "center"; g.textBaseline = "middle";
  // 第 1 行：英雄名
  g.font = "bold 32px system-ui,sans-serif";
  g.lineWidth = 7; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(hero, 170, 22);
  g.fillStyle = "#" + hex.toString(16).padStart(6, "0"); g.fillText(hero, 170, 22);
  // 第 2 行：玩家名 · Lv（S29：本場等級 mlv）
  g.font = "bold 24px system-ui,sans-serif";
  g.lineWidth = 6; g.strokeText(player, 170, 60);
  g.fillStyle = "rgba(255,255,255,0.85)"; g.fillText(player, 170, 60);
  // 第 3 行：KDA / 復活倒數 + 狀態徽章
  g.font = "bold 28px monospace";
  g.lineWidth = 6; g.strokeText(line3, 170, 102);
  g.fillStyle = "#ffffff"; g.fillText(line3, 170, 102);
  if (badge) {
    g.font = "bold 22px system-ui,sans-serif";
    const bw = g.measureText(badge.text).width + 16;
    g.fillStyle = badge.bg; const bx = 170 - bw / 2, by = 116;
    g.beginPath(); g.roundRect(bx, by - 12, bw, 24, 8); g.fill();
    g.fillStyle = "#0d1420"; g.fillText(badge.text, 170, by);
  }
}
function makeOverlaySprite(hex) {
  const c = document.createElement("canvas"); c.width = 340; c.height = 132;
  paintOverlay(c, " ", " ", " ", hex, null);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(6.0 * S, 2.35 * S, 1);
  sp.userData.canvas = c;      // 重用：之後只重畫這張，不再新建 texture
  return sp;
}

function makeTopper(role, color) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.85, roughness: 0.2, metalness: 0.85 });
  let g, flat = false;
  if (role === "adc") g = new THREE.ConeGeometry(0.34 * S, 1.9 * S, 4);
  else if (role === "mid") g = new THREE.SphereGeometry(0.55 * S, 12, 12);
  else if (role === "jungle") g = new THREE.TetrahedronGeometry(0.75 * S);
  else if (role === "sup") { g = new THREE.TorusGeometry(0.6 * S, 0.17 * S, 8, 18); flat = true; }
  else g = new THREE.BoxGeometry(1.7 * S, 0.5 * S, 0.95 * S);
  const m = new THREE.Mesh(g, mat); if (flat) m.rotation.x = Math.PI / 2; m.castShadow = true; return m;
}

// S29B5：ESMO 程序化中立目標輪廓。全部由 Three.js 基本幾何組成，
// 不讀取、不複製任何第三方模型、圖示或紋理。
function makeNeutralVisual(key, shadows) {
  const meta = OBJECTIVE_PRESENTATION[key] ?? OBJECTIVE_PRESENTATION.jungleCamp;
  const root = new THREE.Group(), materials = [];
  const mat = (color = meta.color, emissive = 0.16) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.55, metalness: 0.22, flatShading: true });
    materials.push(m); return m;
  };
  const add = (geo, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, material); mesh.position.set(x * S, y * S, z * S); mesh.rotation.set(rx, ry, rz); mesh.castShadow = shadows; root.add(mesh); return mesh;
  };
  if (key === "dragon") {
    const body = add(new THREE.IcosahedronGeometry(2.2 * S, 0), mat(), 0, 2.2, 0); body.scale.set(1.65, 0.78, 0.9);
    add(new THREE.ConeGeometry(1.9 * S, 4.6 * S, 3), mat(meta.accent, 0.1), -3.2, 2.8, 0, 0, 0, -1.18);
    add(new THREE.ConeGeometry(1.9 * S, 4.6 * S, 3), mat(meta.accent, 0.1), 3.2, 2.8, 0, 0, 0, 1.18);
    add(new THREE.ConeGeometry(1.0 * S, 2.8 * S, 5), mat(), 0, 2.4, -3.1, Math.PI / 2, 0, 0);
  } else if (key === "baron") {
    add(new THREE.CylinderGeometry(2.5 * S, 3.6 * S, 6.8 * S, 7), mat(), 0, 3.4, 0);
    add(new THREE.TorusGeometry(3.0 * S, 0.7 * S, 6, 10), mat(meta.accent, 0.12), 0, 5.5, 0, Math.PI / 2);
    for (const x of [-2.2, 0, 2.2]) add(new THREE.ConeGeometry(0.65 * S, 2.7 * S, 5), mat(meta.accent, 0.08), x, 8.0 - Math.abs(x) * 0.25, 0);
  } else if (key === "blueBuff") {
    add(new THREE.BoxGeometry(4.6 * S, 4.0 * S, 3.2 * S), mat(), 0, 2.2, 0);
    add(new THREE.OctahedronGeometry(1.65 * S, 0), mat(meta.accent, 0.08), -3.0, 3.2, 0, 0, 0, -0.25);
    add(new THREE.OctahedronGeometry(1.65 * S, 0), mat(meta.accent, 0.08), 3.0, 3.2, 0, 0, 0, 0.25);
  } else if (key === "redBuff") {
    add(new THREE.DodecahedronGeometry(2.6 * S, 0), mat(), 0, 2.4, 0);
    add(new THREE.ConeGeometry(0.75 * S, 3.4 * S, 5), mat(meta.accent, 0.08), -1.7, 5.0, 0, 0, 0, -0.35);
    add(new THREE.ConeGeometry(0.75 * S, 3.4 * S, 5), mat(meta.accent, 0.08), 1.7, 5.0, 0, 0, 0, 0.35);
    add(new THREE.TetrahedronGeometry(1.1 * S), mat(meta.accent, 0.08), 0, 2.4, -2.7, 0.25, 0, 0);
  } else {
    for (const [x, z, s] of [[-1.8,0,1.35],[1.6,-0.4,1.1],[0.3,1.7,0.9]]) {
      add(new THREE.TetrahedronGeometry(s * S), mat(), x, 1.15 * s, z, 0.2, 0.3, 0);
    }
  }
  return { root, materials, color: meta.color, meta };
}

// ════════════════════════════════════════════════════════════════════════════
//  場景內容（命令式建立 + 單一 useFrame 更新）
// ════════════════════════════════════════════════════════════════════════════
function MobaScene({ mapTexture, roster, Q, source = null }) {
  const { scene, camera, gl } = useThree();
  const R = useRef({});
  // S29B6：呈現資料源（live useGameStore / Replay 唯讀 adapter）——只讀，不寫。
  const src = source ?? useGameStore;

  useEffect(() => {
    const world = new THREE.Group(); scene.add(world);
    const snap0 = src.getState().snapshot;

    // 地板
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_BOUNDS.width * S, WORLD_BOUNDS.height * S), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
    if (mapTexture) new THREE.TextureLoader().load(mapTexture, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; floorMat.map = t; floorMat.needsUpdate = true; });
    else { floorMat.map = makeRiftTexture(); floorMat.needsUpdate = true; }

    // 河道水體
    WATER.forEach((o) => {
      const w = new THREE.Mesh(new THREE.CircleGeometry(o.r * S, 40), new THREE.MeshStandardMaterial({ color: 0x2b6f9e, emissive: 0x1d6fa0, emissiveIntensity: 0.3, transparent: true, opacity: 0.6, roughness: 0.2, metalness: 0.3 }));
      w.rotation.x = -Math.PI / 2; w.position.set(wx(o.x), 0.05, wz(o.y)); w.receiveShadow = true; world.add(w);
    });
    // 起伏石塊
    const rng = (() => { let x = 7; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d7689, roughness: 0.85, metalness: 0.15, flatShading: true });
    for (let i = 0; i < 46; i++) {
      const ang = rng() * 7, rad = WORLD_BOUNDS.width * (0.18 + rng() * 0.28),
        cx = WORLD_BOUNDS.centerX + Math.cos(ang) * rad, cy = WORLD_BOUNDS.centerY + Math.sin(ang) * rad, h = (1.2 + rng() * 3) * S;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry((0.8 + rng() * 1.8) * S, 0), rockMat);
      m.position.set(wx(clamp(cx, WORLD_BOUNDS.minX + 8, WORLD_BOUNDS.maxX - 8)), h * 0.3, wz(clamp(cy, WORLD_BOUNDS.minY + 8, WORLD_BOUNDS.maxY - 8))); m.rotation.set(rng() * 3, rng() * 3, rng() * 3); m.scale.y = 0.6 + rng(); m.castShadow = true; m.receiveShadow = true; world.add(m);
    }
    // 立體石牆
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a6478, roughness: 0.8, metalness: 0.18, flatShading: true });
    WALLS.forEach((o) => {
      const h = (2.2 + o.r * 0.9) * S;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.85 * S, o.r * S, h, 7), wallMat); m.position.set(wx(o.x), h / 2, wz(o.y)); m.castShadow = true; m.receiveShadow = true; world.add(m);
      const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(o.r * 0.5 * S, 0), wallMat); cap.position.set(wx(o.x), h + o.r * 0.3 * S, wz(o.y)); cap.castShadow = true; world.add(cap);
    });
    // 草叢
    // S29 效能修復：舊碼**每片葉子都 new 一個 MeshStandardMaterial**（約 100 個獨立材質）。
    //   改為 4 個共享材質（顏色本來就只有 4 種）+ 依畫質縮減葉片數。
    const blades = [];
    const bladeCols = [0x2aa14e, 0x37c065, 0x1f8a42, 0x46d47a];
    const bladeMats = bladeCols.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05, flatShading: true }));
    BUSHES.forEach((b, bi) => {
      const grp = new THREE.Group(); grp.position.set(wx(b.x), 0, wz(b.y));
      const n = Math.max(3, Math.round(b.r * 3 * Q.grassBlades));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 7 + bi, rr = b.r * (0.25 + rng() * 0.7) * S, hh = (1.4 + rng() * 1.6) * S;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5 * S, hh, 5), bladeMats[i % 4]);
        leaf.position.set(Math.cos(a) * rr, hh / 2, Math.sin(a) * rr); leaf.castShadow = Q.shadows; leaf.userData.ph = rng() * 7; grp.add(leaf); blades.push(leaf);
      }
      world.add(grp);
    });

    // 防禦塔 + 巨大主堡 + 血條
    const towerObjs = {};
    Object.entries(snap0.towers).forEach(([key, t]) => {
      const isNexus = t.lane === "nexus", col = SIDE[t.side], glow = GLOW[t.side], sc = isNexus ? 1 : 0.62;
      const grp = new THREE.Group(); grp.position.set(wx(t.pos.x), 0, wz(t.pos.y));
      [{ r: 3.0, h: 4.0, y: 2.0, c: 0x7d8696 }, { r: 2.2, h: 4.6, y: 6.3, c: col }, { r: 1.6, h: 3.0, y: 10.3, c: 0x9aa6ba }].forEach((ti) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(ti.r * sc * S, (ti.r + 0.4) * sc * S, ti.h * sc * S, 8), new THREE.MeshStandardMaterial({ color: ti.c, emissive: ti.c === col ? col : 0x000000, emissiveIntensity: ti.c === col ? 0.04 : 0, roughness: 0.5, metalness: 0.55 }));
        m.position.y = ti.y * sc * S; m.castShadow = true; m.receiveShadow = true; grp.add(m);
      });
      // S29B4：移除常駐 idle glow——平時幾乎不自發光（靠場景光呈現正常材質、
      //   仍可辨識塔位），只有**被攻擊/摧毀**時才短暫增亮（見 useFrame）。
      //   常態 emissive 主堡 0.14 / 塔 0.06（低於 Bloom 門檻 ⇒ 不再有常駐光暈）。
      const IDLE_EMISS = isNexus ? 0.14 : 0.06;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry((isNexus ? 4.6 : 1.4) * S, 0), new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: IDLE_EMISS, roughness: 0.1, metalness: 0.35 }));
      crystal.position.y = (isNexus ? 16 : 13.5) * sc * S; crystal.castShadow = Q.shadows; grp.add(crystal);
      // S29 效能修復（最大單一元凶之一）：舊碼**每座塔都掛一盞 PointLight**（18 塔 + 2 主堡
      //   = 20 盞，再加龍/巴龍共 22 盞）。Three.js 的 MeshStandardMaterial 會把每一盞燈
      //   都編進 per-fragment 迴圈 ⇒ 手機直接崩。
      //   改為：**只有主堡**有燈（2 盞），一般塔靠 emissive + Bloom 發光（視覺幾乎不變）。
      //   high 檔可選擇性開回塔燈（Q.towerLights）。
      // S29B4：主堡常駐 PointLight 再降（3.5 → 2.0）；一般塔僅 high 檔開（既有）。
      //   ⚠ 不新增任何 PointLight（維持 S29A 的 ≤2 盞上限，避免手機效能回退）。
      if (isNexus || Q.towerLights) grp.add(new THREE.PointLight(glow, isNexus ? 2.0 : 1.6, (isNexus ? 40 : 26) * S));
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(2.4 * sc * S, 3.0 * sc * S, 2.0 * sc * S, 7), new THREE.MeshStandardMaterial({ color: 0x33363d, roughness: 1, metalness: 0.1, flatShading: true }));
      stump.position.y = 1.0 * sc * S; stump.visible = false; stump.castShadow = true; grp.add(stump);
      const hpBar = new THREE.Group(); hpBar.position.y = (isNexus ? 22 : 15) * sc * S;
      const hbg = new THREE.Mesh(new THREE.PlaneGeometry((isNexus ? 6 : 3.2) * S, 0.5 * S), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, depthTest: false })); hbg.position.z = -0.01;
      const hfgW = (isNexus ? 5.8 : 3.0) * S;
      const hfg = new THREE.Mesh(new THREE.PlaneGeometry(hfgW, 0.38 * S), new THREE.MeshBasicMaterial({ color: t.side === "blue" ? 0x60a5fa : 0xf87171, depthTest: false }));
      hpBar.add(hbg, hfg); grp.add(hpBar);
      world.add(grp); towerObjs[key] = { grp, crystal, stump, isNexus, hpBar, hfg, hfgW, lastHp: 1, flashT: 0, idleEmiss: IDLE_EMISS };
    });

    // S29B6：absent 環——目標死亡後坑位不再空無一物（重生即隱藏）。
    //   加在 `world` 而非目標自己的 group：group 在死亡後會被隱藏，環必須留著。
    //   共享 geometry / 每個各自一份材質（opacity 要各自脈動）；不新增任何燈光。
    const absentGeo = new THREE.RingGeometry(0.62, 1, 28);
    const mkAbsent = (x, y, col, rad) => {
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(absentGeo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(wx(x), 0.12, wz(y));
      ring.scale.setScalar(rad * S);
      ring.visible = false; world.add(ring);
      return ring;
    };

    // Dragon / Baron：S29B5 ESMO 自有程序化輪廓（寬翼巨龍 / 高耸冠角蛇體）。
    const obj3d = {};
    [["dragon", PITS.dragon], ["baron", PITS.baron]].forEach(([k, pit]) => {
      const visual = makeNeutralVisual(k, Q.shadows), col = visual.color, m = visual.root;
      m.position.set(wx(pit.x), 0, wz(pit.y)); m.visible = false; world.add(m);
      const hpGrp = new THREE.Group(); hpGrp.position.set(wx(pit.x), 7.6 * S, wz(pit.y)); hpGrp.visible = false;
      const hbg = new THREE.Mesh(new THREE.PlaneGeometry(6.4 * S, 0.62 * S), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, depthTest: false })); hbg.position.z = -0.01;
      const hfg = new THREE.Mesh(new THREE.PlaneGeometry(6.2 * S, 0.48 * S), new THREE.MeshBasicMaterial({ color: col, depthTest: false }));
      hpGrp.add(hbg, hfg); world.add(hpGrp);
      obj3d[k] = { mesh: m, materials: visual.materials, color: col, hpGrp, hfg, hfgW: 6.2 * S, lastHp: 1, flashT: 0, shownHp: 1, wasAlive: false, deathT: 0, baseY: 0, baseScale: 1, absent: mkAbsent(pit.x, pit.y, col, 4.6) };
    });

    // Blue Buff / Red Buff / Jungle Camp：各自獨立 silhouette，不以光圈當模型。
    //   資料/座標唯一來源 = snapshot.objectives（← 引擎 ← gameData.CAMPS）；
    //   Minimap / Replay 用同一組座標 ⇒ 三處必然一致。
    const campObjs = new Map();
    (snap0.objectives ?? []).forEach((o) => {
      if (o.type !== "camp" && o.type !== "buff") return;
      const key = o.presentationKey ?? (o.type === "buff" ? (o.side === "red" ? "redBuff" : "blueBuff") : "jungleCamp");
      const visual = makeNeutralVisual(key, Q.shadows), col = visual.color;
      const grp = new THREE.Group(); grp.position.set(wx(o.pos.x), 0, wz(o.pos.y));
      const body = visual.root; grp.add(body);
      const hpGrp = new THREE.Group(); hpGrp.position.y = (o.type === "buff" ? 7.0 : 4.4) * S;
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(3.4 * S, 0.42 * S), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, depthTest: false })); bg.position.z = -0.01;
      const fg = new THREE.Mesh(new THREE.PlaneGeometry(3.3 * S, 0.32 * S), new THREE.MeshBasicMaterial({ color: col, depthTest: false }));
      hpGrp.add(bg, fg); grp.add(hpGrp);
      grp.visible = false; world.add(grp);
      campObjs.set(o.id, { grp, body, materials: visual.materials, color: col, presentationKey: key, hpGrp, fg, w: 3.3 * S, lastHp: 1, flashT: 0, shownHp: 1, wasAlive: false, deathT: 0, baseY: 0, absent: mkAbsent(o.pos.x, o.pos.y, col, o.type === "buff" ? 2.4 : 2.0) });
    });

    // ── S29B3/S29B5：常駐 billboard 標籤——Dragon/Baron/泉水/營地不再只是色塊 ──
    //  一次性建立（makeLabelSprite 重用）；與地面文字標籤（makeRiftTexture）互補：
    //  地面字給俯視語意、billboard 給任何角度的即時辨識。
    const mkTag = (text, hex, x, y, h, sx = 4.6, sy = 2.1) => {
      const sp = makeLabelSprite(text, hex, sx, sy);
      sp.position.set(wx(x), h, wz(y));
      world.add(sp);
    };
    mkTag("Dragon", 0xc8aaff, PITS.dragon.x, PITS.dragon.y, 10.5 * S, 6.2, 2.1);
    mkTag("Baron", 0xfde047, PITS.baron.x, PITS.baron.y, 10.5 * S, 5.4, 2.1);
    mkTag("泉水", 0x93c5fd, FOUNTAIN.blue.x, FOUNTAIN.blue.y, 5 * S, 3.6, 1.7);
    mkTag("泉水", 0xfca5a5, FOUNTAIN.red.x, FOUNTAIN.red.y, 5 * S, 3.6, 1.7);
    CAMPS.forEach((c) => {
      const p = presentationForObjective(c);
      mkTag(p.label, p.color, c.x, c.y, 4.8 * S, c.type === "buff" ? 5.4 : 6.2, 1.4);
    });

    // 英雄（S29B2：模型 ×HK 放大可讀性；lastHp/flashT 供受擊閃光）
    const heroObjs = {};
    snap0.players.forEach((p) => {
      const col = SIDE[p.side], glow = GLOW[p.side];
      const root = new THREE.Group(); root.position.set(wx(p.pos.x), 0, wz(p.pos.y));
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.65, roughness: 0.3, metalness: 0.7 });
      const cap = makeCapsule(1.0 * HK * S, 2.0 * HK * S, mat); cap.position.y = HERO_CAP_Y; root.add(cap);
      const ringMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5 * HK * S, 2.0 * HK * S, 32), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; root.add(ring);
      const hpGrp = new THREE.Group(); hpGrp.position.y = HERO_HP_Y;
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(HERO_HPW + 0.14 * S, 0.5 * S), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 })); bg.position.z = -0.01;
      const fgMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
      const fg = new THREE.Mesh(new THREE.PlaneGeometry(HERO_HPW, 0.38 * S), fgMat);
      hpGrp.add(bg, fg); root.add(hpGrp);
      const topper = makeTopper(p.role, glow); topper.position.y = HERO_TOP_Y; root.add(topper);
      const overlayHex = p.side === "blue" ? 0x93c5fd : 0xfca5a5;
      const overlay = makeOverlaySprite(overlayHex); overlay.position.y = OVERLAY_Y; root.add(overlay);
      // S29B3：回城引導 / 泉水回血 aura ring（藍=回城 channel、綠=泉水治療）
      const auraMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
      const aura = new THREE.Mesh(new THREE.RingGeometry(2.2 * HK * S, 2.8 * HK * S, 32), auraMat);
      aura.rotation.x = -Math.PI / 2; aura.position.y = 0.14; aura.visible = false; root.add(aura);
      world.add(root);
      heroObjs[p.id] = { root, cap, mat, ring, ringMat, hpGrp, fg, fgMat, topper, overlay, overlayHex, aura, auraMat, lastOverlay: "", seed: Math.random() * 7, lastHp: 1, flashT: 0 };
    });

    // ── 小兵：共享 geometry + 2 個共享材質 + 物件池 ───────────────────────────
    //  S29 效能修復：舊碼**每隻小兵各 new 一份 geometry 與 MeshStandardMaterial**
    //   （場上最多 96 隻），且每次生成/陣亡就 new/dispose 一輪。
    const minionGeo = new THREE.CylinderGeometry(0.5 * S, 0.65 * S, 1.65 * S, 6);   // S29B2：×1.25 可讀性
    const minionMat = {
      blue: new THREE.MeshStandardMaterial({ color: SIDE.blue, emissive: SIDE.blue, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.6 }),
      red: new THREE.MeshStandardMaterial({ color: SIDE.red, emissive: SIDE.red, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.6 }),
    };
    const minionMeshes = new Map();
    const minionPool = [];                 // 回收後重用，不 dispose

    // ── FX：物件池（S29 最大效能元凶的修復）──────────────────────────────────
    //  舊碼在 useFrame 裡「dispose 掉全部 fx → 再 new 一輪 geometry + MeshStandardMaterial」，
    //  **每一個渲染幀**都跑一次（60fps × 最多 60 個 fx ⇒ 每秒最多 3600 次配置）。
    //  材質建立會觸發 shader program 查找/編譯，這正是「桌機與手機都 LAG」的主因。
    //  改為：預先建好固定數量的可重用 mesh（unit 尺寸，靠 scale/position 擺放），
    //  每幀只更新 transform / color / opacity / visible ⇒ 穩態零配置。
    const fxGroup = new THREE.Group(); world.add(fxGroup);
    const unitCyl = new THREE.CylinderGeometry(0.4, 1, 1, 6);      // 錐狀彈道（scale 決定粗細/長度）
    const unitRing = new THREE.RingGeometry(0.62, 1, 36);
    const unitSphere = new THREE.SphereGeometry(1, 14, 14);
    const mkPool = (n, geo, matFactory) => Array.from({ length: n }, () => {
      const m = new THREE.Mesh(geo, matFactory());
      m.visible = false; fxGroup.add(m); return m;
    });
    const fxPool = {
      line: mkPool(Q.maxFx, unitCyl, () => new THREE.MeshStandardMaterial({ emissiveIntensity: 2.6, transparent: true })),
      ring: mkPool(Math.ceil(Q.maxFx / 3), unitRing, () => new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide })),
      orb: mkPool(Math.ceil(Q.maxFx / 2), unitSphere, () => new THREE.MeshStandardMaterial({ emissiveIntensity: 2.3, transparent: true })),
    };
    for (const m of fxPool.ring) m.rotation.x = -Math.PI / 2;

    // ── S29B2：呈現層事件 FX 池（死亡淡出圈 / 小兵交戰火花）────────────────────
    //  與 fxPool（引擎 snapshot.fx 驅動）分開：這池由 view 端「事件轉場」觸發
    //  （小兵消失=死亡、目標 alive→dead、塔倒）。固定容量、重用、穩態零配置
    //  （S29A 教訓：禁止每幀 new/dispose）。滿了就搶最舊的一格（刻意上限，非 bug）。
    const VIEWFX_N = 14;
    const viewFx = Array.from({ length: VIEWFX_N }, () => {
      const ring = new THREE.Mesh(unitRing, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.visible = false; fxGroup.add(ring);
      return { ring, life: 0, maxLife: 0.5, size: 1 };
    });
    const spawnViewFx = (x, z, color, size = 2, life = 0.5) => {
      let slot = viewFx[0];
      for (const v of viewFx) { if (v.life <= 0) { slot = v; break; } if (v.life < slot.life) slot = v; }
      slot.life = life; slot.maxLife = life; slot.size = size;
      slot.ring.position.set(x, 0.35, z);
      slot.ring.material.color.setHex(color);
      slot.ring.material.opacity = 0.85; slot.ring.visible = true;
    };

    const killGroup = new THREE.Group(); world.add(killGroup);

    R.current = {
      world, floorMat, blades, towerObjs, obj3d, heroObjs, campObjs,
      minionMeshes, minionPool, minionGeo, minionMat,
      fxGroup, fxPool, killGroup, killSprites: [], seenFeed: new Set(), Q,
      viewFx, spawnViewFx, sparkNext: { top: 0, mid: 0, bot: 0 },   // S29B2
      camera,                                                       // S29B3：raycast 用（useFrame 每幀更新）
      seenRecalls: new Set(),                                       // S29B3：回城事件已播記錄
    };

    // ── S29B3/S29B6：地圖操作手勢（純呈現層；不讀寫引擎 ⇒ 不可能改變模擬結果）──
    //  S29B6 根因：舊碼只會「切換相機模式」，真正的平移/縮放交給 drei OrbitControls，
    //    而它的 `enablePan` 被寫死成 `debug`（GameView 從未傳 ⇒ 永遠 false）
    //    ⇒ 拖曳只會旋轉 2.5D 正交視角、雙指只剩 dolly，地圖等於不能移動。
    //  現在手勢直接寫 cameraStore（單一狀態源），BattleCameraController 單一套用：
    //    · 單指/滑鼠拖曳 ⇒ pan（抓住的地面點跟著手指走）⇒ free
    //    · 雙指捏合 ⇒ pinch zoom（+ 中點位移一併 pan）⇒ free
    //    · 滾輪 ⇒ zoom ⇒ free
    //    · tap 英雄 ⇒ heroFocus 4s；tap 空白 ⇒ free；雙擊 ⇒ 回導播
    //  pan 由 cameraStore clamp 在 WORLD_BOUNDS 內 ⇒ 不會拖出地圖黑區。
    const el = gl.domElement;
    el.style.touchAction = "none";   // 舊版由 OrbitControls 設定；移除它後必須自己設
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitA = new THREE.Vector3(), hitB = new THREE.Vector3();
    const camStore = () => useCameraStore.getState();
    const pointers = new Map();      // pointerId → { x, y }（多點觸控追蹤）
    let downPt = null;               // 單指按下點（tap 判定）
    let dragAnchor = null;           // 按下當下抓住的**地面 3D 座標**（pan 用）
    let pinchDist = 0, pinchZoom = 0;
    let moved = 0;

    /** 螢幕座標 → 地面（y=0）3D 交點；正交相機必定有解（除非平行，實務上不會）。 */
    const groundAt = (clientX, clientY, out) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, R.current.camera ?? camera);
      return ray.ray.intersectPlane(GROUND, out);
    };
    const mid = () => {
      const pts = [...pointers.values()];
      return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    };
    const spread = () => {
      const pts = [...pointers.values()];
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };
    /** 把「抓住的地面點」拉回手指下：正交投影下 screen→ground 是仿射映射，
     *  pan += (anchor − 目前手指下的地面點) 一步收斂。 */
    const panToAnchor = (clientX, clientY) => {
      if (!dragAnchor) return;
      const cur = groundAt(clientX, clientY, hitB);
      if (!cur) return;
      const st = camStore();
      st.userPanTo(st.pan.x + (dragAnchor.x - cur.x) / S, st.pan.y + (dragAnchor.z - cur.z) / S);
    };

    const onPtrDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
      if (pointers.size === 1) {
        downPt = { x: e.clientX, y: e.clientY }; moved = 0;
        const g = groundAt(e.clientX, e.clientY, hitA);
        dragAnchor = g ? g.clone() : null;
      } else if (pointers.size === 2) {
        downPt = null;                      // 兩指 ⇒ 不再是 tap
        pinchDist = spread(); pinchZoom = camStore().zoom;
        const m = mid();
        const g = groundAt(m.x, m.y, hitA);
        dragAnchor = g ? g.clone() : null;
      }
    };

    const onPtrMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        // 雙指：先套 zoom（改變投影 ⇒ 影響地面映射），再把中點的地面錨點拉回中點
        const d = spread();
        if (pinchDist > 4 && d > 4) camStore().userZoomTo(clamp(pinchZoom * (d / pinchDist), ZOOM_MIN, ZOOM_MAX));
        const m = mid();
        panToAnchor(m.x, m.y);
        return;
      }
      if (!downPt) return;
      moved = Math.max(moved, Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y));
      if (moved > 8) panToAnchor(e.clientX, e.clientY);   // 拖曳 ⇒ pan（userPanTo 內含切 free）
    };

    const onPtrUp = (e) => {
      pointers.delete(e.pointerId);
      el.releasePointerCapture?.(e.pointerId);
      if (pointers.size >= 1) { dragAnchor = null; return; }   // 還有手指在 ⇒ 不判定 tap
      const wasTap = downPt && moved <= 8;
      const pt = downPt; downPt = null; dragAnchor = null;
      if (!wasTap) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      ndc.set(((pt.x - rect.left) / rect.width) * 2 - 1, -((pt.y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, R.current.camera ?? camera);
      const meshes = [];
      for (const id in R.current.heroObjs) {
        const o = R.current.heroObjs[id];
        if (!o.root.visible) continue;
        o.cap.traverse((m) => { if (m.isMesh) { m.userData.heroId = id; meshes.push(m); } });
      }
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit) camStore().focusHero(hit.object.userData.heroId);   // 點英雄 ⇒ zoom-in 聚焦
      else camStore().setMode("free");                             // 點空白 ⇒ 自由鏡頭
    };
    const onPtrCancel = (e) => { pointers.delete(e.pointerId); downPt = null; dragAnchor = null; };
    const onDbl = () => camStore().backToDirector();               // 雙擊空白 ⇒ 回導播
    // 滾輪 zoom：以**畫面中心**為錨（單次離散事件無法像捏合那樣逐幀收斂到指標錨點，
    //   硬做會因為「相機這一幀還是舊 zoom」而漂移 ⇒ 維持中心縮放，行為可預期）。
    //   ⚠ 必須 passive:false + preventDefault：戰場只有 min(82vh,720px) 高、外層頁面可捲，
    //   passive 監聽器不能擋預設行為 ⇒ 會變成「一邊縮放一邊捲動整頁」
    //   （任務單 A-10：不得用瀏覽器頁面捲動代替地圖操作）。舊版是 OrbitControls 擋掉的。
    const onWheel = (e) => {
      e.preventDefault();
      const st = camStore();
      st.userZoomTo(clamp(st.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), ZOOM_MIN, ZOOM_MAX));
    };
    el.addEventListener("pointerdown", onPtrDown);
    el.addEventListener("pointermove", onPtrMove);
    el.addEventListener("pointerup", onPtrUp);
    el.addEventListener("pointercancel", onPtrCancel);
    el.addEventListener("dblclick", onDbl);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", onPtrDown);
      el.removeEventListener("pointermove", onPtrMove);
      el.removeEventListener("pointerup", onPtrUp);
      el.removeEventListener("pointercancel", onPtrCancel);
      el.removeEventListener("dblclick", onDbl);
      el.removeEventListener("wheel", onWheel);
      scene.remove(world);
      // 共享 geometry/material 會被多個 mesh 參照 → 用 Set 去重，避免重複 dispose
      const geos = new Set(), mats = new Set();
      world.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
      });
      for (const m of R.current.minionPool ?? []) { if (m.geometry) geos.add(m.geometry); if (m.material) mats.add(m.material); }
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => { m.map?.dispose?.(); m.dispose(); });
    };
  }, [mapTexture, scene, Q, src]);

  // 單一 useFrame：讀 store → 命令式更新（不觸發 React 重繪）
  useFrame((state, dt) => {
    const r = R.current; if (!r.heroObjs) return;
    r.camera = camera;   // S29B3：raycast 永遠用當前生效相機（makeDefault 可能晚掛）
    const now = state.clock.getElapsedTime() * 1000;
    const { prev, snapshot, subTRef } = src.getState();
    const a = ease(clamp(subTRef.current, 0, 1));
    const nextHero = {}; snapshot.players.forEach((p) => (nextHero[p.id] = p));
    // 戰爭迷霧（藍方視角）
    const VIS = [];
    snapshot.players.forEach((p) => { if (p.side === "blue" && !p.dead) VIS.push(p.pos); });
    Object.values(snapshot.towers).forEach((t) => { if (t.side === "blue" && t.hp > 0) VIS.push(t.pos); });
    const vis = (pos, rad = 17) => VIS.some((v) => (v.x - pos.x) ** 2 + (v.y - pos.y) ** 2 < rad * rad);

    // 英雄
    prev.players.forEach((p) => {
      const o = r.heroObjs[p.id]; if (!o) return;
      const np = nextHero[p.id] || p;
      o.root.position.x = lerp(wx(p.pos.x), wx(np.pos.x), a);
      o.root.position.z = lerp(wz(p.pos.y), wz(np.pos.y), a);
      const dx = wx(np.pos.x) - wx(p.pos.x), dz = wz(np.pos.y) - wz(p.pos.y);
      if (dx * dx + dz * dz > 1e-4) o.root.rotation.y = Math.atan2(dx, dz);
      const dead = p.dead;
      o.cap.scale.y = dead ? 0.25 : 1; o.cap.position.y = dead ? 0.4 * S : HERO_CAP_Y + Math.sin(now / 1000 * 3 + o.seed) * 0.07 * S;
      // S29B2：受擊閃光——hp 由真實 snapshot 差分（prev→next 下降 ⇒ emissive 短暫拉高）
      const hpDelta = (np.hp ?? 1) - (o.lastHp ?? 1);   // S29B3：也供泉水回血 aura 判定
      if (hpDelta < -0.004 && !dead) o.flashT = 0.25;
      o.lastHp = np.hp ?? 1;
      if (o.flashT > 0) o.flashT = Math.max(0, o.flashT - dt);
      o.mat.color.setHex(dead ? 0x3a3a3a : SIDE[p.side]);
      o.mat.emissiveIntensity = dead ? 0 : 0.65 + (o.flashT / 0.25) * 1.5;
      o.ringMat.opacity = dead ? 0.12 : 0.6;
      o.hpGrp.visible = !dead; o.hpGrp.quaternion.copy(camera.quaternion);
      const hp = clamp(p.hp, 0.001, 1); o.fg.scale.x = hp; o.fg.position.x = -(HERO_HPW * (1 - hp)) / 2;
      o.fgMat.color.setHex(hp > 0.55 ? 0x34d399 : hp > 0.28 ? 0xfbbf24 : 0xf87171);
      o.topper.visible = !dead; o.topper.rotation.y += dt * 1.2; o.topper.position.y = HERO_TOP_Y + Math.sin(now / 1000 * 3 + o.seed) * 0.07 * S;
      o.root.visible = p.side === "blue" ? true : vis(np.pos);
      // Sprint07 Hero Overlay v2：英雄名 / 玩家名·Lv(佔位) / KDA或復活倒數 + 狀態徽章
      const heroName = roster?.[p.id]?.hero ?? ROLE_NAME[np.role];
      const playerName = `${roster?.[p.id]?.player ?? p.id.toUpperCase()} · Lv${np.lv ?? 1}`;  // Sprint08：真等級（Hero Progress loadout）
      // S29B6：Replay 的 frame 沒有擷取 respawn 秒數 ⇒ 顯示「陣亡」而不是假的「0s」倒數
      const line3 = dead
        ? (Number.isFinite(np.respawn) ? `☠ ${Math.max(0, np.respawn).toFixed(0)}s` : "☠ 陣亡")
        : `${np.k}/${np.d}/${np.a ?? 0}`;
      const badge = dead ? null
        : np.state === "撤退" ? { text: "⛊ 撤退", bg: "#fbbf24" }
        : np.state === "回城中" ? { text: "🌀 回城中", bg: "#60a5fa" }   // S29B3：引導中
        : np.state === "回城" ? { text: "⛲ 泉水", bg: "#34d399" }        // S29B3：泉水補血
        : np.state === "追擊" ? { text: "🏃 追擊", bg: "#f9a8d4" }
        : np.state === "團戰!" ? { text: "⚔ 團戰", bg: "#f87171" }
        : np.state === "圍攻" ? { text: "⚑ 圍攻", bg: "#a78bfa" } : null;
      const key = heroName + "|" + playerName + "|" + line3 + "|" + (badge?.text ?? "");
      if (key !== o.lastOverlay) {
        o.lastOverlay = key;
        // S29：重畫同一張 canvas + needsUpdate（不再 dispose 舊 texture 再 new 一張）
        paintOverlay(o.overlay.userData.canvas, heroName, playerName, line3, dead ? 0x9ca3af : o.overlayHex, badge);
        o.overlay.material.map.needsUpdate = true;
      }
      o.overlay.visible = o.root.visible;
      // S29B3：回城引導（藍圈快轉）/ 泉水回血（綠圈慢轉）——真實狀態與 hp 上升差分
      const recallCh = np.state === "回城中";
      const healing = !dead && hpDelta > 0.004 && dist(np.pos, FOUNTAIN[p.side]) < 12;
      if ((recallCh || healing) && o.root.visible) {
        o.aura.visible = true;
        o.auraMat.color.setHex(recallCh ? 0x60a5fa : 0x34d399);
        o.auraMat.opacity = 0.45 + 0.3 * Math.sin(now / 130);
        o.aura.rotation.z += dt * (recallCh ? 2.6 : 1.1);
      } else o.aura.visible = false;
    });

    // S29B3：回城傳送閃光（引擎 recallEvents：done 帶傳送起點 ⇒ 起點爆點；
    //   泉水端由引擎 fx ult 呈現）——「他是回城傳送」而不是「亂走後瞬移」
    (snapshot.recallEvents ?? []).forEach((ev) => {
      if (r.seenRecalls.has(ev.id)) return;
      r.seenRecalls.add(ev.id);
      if (ev.phase === "done" && ev.from) r.spawnViewFx(wx(ev.from.x), wz(ev.from.y), 0x60a5fa, 2.6, 0.5);
    });

    // 小兵（S29B2：hp 縮放 + 受擊脈衝 + 死亡爆點；hp 來自 snapshot 真資料）
    const seen = new Set(), nextMin = {};
    ["top", "mid", "bot"].forEach((ln) => { ["bm", "rm"].forEach((k) => snapshot.lanes[ln][k].forEach((m) => (nextMin[k[0] + ":" + ln + ":" + m.id] = m))); });
    ["top", "mid", "bot"].forEach((ln) => {
      [["bm", "blue"], ["rm", "red"]].forEach(([k, side]) => {
        prev.lanes[ln][k].forEach((m) => {
          const key = k[0] + ":" + ln + ":" + m.id; seen.add(key);
          let mesh = r.minionMeshes.get(key);
          if (!mesh) {
            // S29：從物件池取（共享 geometry / 共享材質）；池空才 new
            mesh = r.minionPool.pop() ?? new THREE.Mesh(r.minionGeo, r.minionMat[side]);
            mesh.material = r.minionMat[side];
            mesh.castShadow = r.Q.shadows;
            mesh.userData.lastHp = 1; mesh.userData.flashT = 0;
            r.minionMeshes.set(key, mesh); r.world.add(mesh);
          }
          const nm = nextMin[key];
          const tt = lerp(m.t, nm?.t ?? m.t, a), p = posOnLane(ln, tt);
          mesh.position.set(wx(p.x), 0.82 * S, wz(p.y)); mesh.visible = side === "blue" ? true : vis(p, 14);
          // 受擊脈衝＋瀕死縮小：真實 hp 差分（共享材質不可改色 ⇒ 用 per-mesh scale）
          const hpm = nm?.hp ?? m.hp ?? 1;
          if ((mesh.userData.lastHp ?? 1) - hpm > 0.01) mesh.userData.flashT = 0.2;
          mesh.userData.lastHp = hpm;
          if (mesh.userData.flashT > 0) mesh.userData.flashT = Math.max(0, mesh.userData.flashT - dt);
          const fl = (mesh.userData.flashT ?? 0) / 0.2;
          mesh.scale.set(1 + fl * 0.35, 0.55 + 0.45 * hpm + fl * 0.15, 1 + fl * 0.35);
        });
      });
    });
    // S29：回收進池，**不 dispose**。S29B2：小兵只會因 hp≤0 離場 ⇒ 消失 = 死亡，
    //   在回收點補死亡爆點（fog 內的紅方小兵不噴，避免洩漏視野外資訊）。
    r.minionMeshes.forEach((mesh, key) => {
      if (!seen.has(key)) {
        if (mesh.visible) {
          r.spawnViewFx(mesh.position.x, mesh.position.z, key.startsWith("b") ? 0x93c5fd : 0xfca5a5, 1.5, 0.4);
        }
        mesh.scale.set(1, 1, 1); mesh.userData.lastHp = 1; mesh.userData.flashT = 0;
        r.world.remove(mesh); r.minionPool.push(mesh); r.minionMeshes.delete(key);
      }
    });
    // S29B2：小兵交戰火花——雙方前鋒接觸（與引擎交戰判定同尺度 0.035）⇒ 接觸點火花
    for (const ln of ["top", "mid", "bot"]) {
      const bm = snapshot.lanes[ln].bm, rm = snapshot.lanes[ln].rm;
      if (!bm.length || !rm.length) continue;
      const lead = Math.max(...bm.map((m) => m.t)), rlead = Math.min(...rm.map((m) => m.t));
      if (lead >= rlead - 0.035 && now > r.sparkNext[ln]) {
        r.sparkNext[ln] = now + 380;
        const mid = posOnLane(ln, (lead + rlead) / 2);
        if (vis(mid, 20)) r.spawnViewFx(wx(mid.x), wz(mid.y), 0xffe9a3, 1.7, 0.35);
      }
    }

    // 塔（S29B2：受擊閃光 + 倒塔爆點——hp 差分，真資料）
    Object.entries(snapshot.towers).forEach(([key, t]) => {
      const o = r.towerObjs[key]; if (!o) return;
      const dead = t.hp <= 0;
      if ((o.lastHp ?? 1) - t.hp > 0.002 && !dead) o.flashT = 0.25;
      if (!dead) o.wasAlive = true;
      if (dead && o.wasAlive) { o.wasAlive = false; r.spawnViewFx(o.grp.position.x, o.grp.position.z, SIDE[t.side], o.isNexus ? 7 : 4.5, 0.7); }
      o.lastHp = t.hp;
      if (o.flashT > 0) o.flashT = Math.max(0, o.flashT - dt);
      o.crystal.visible = !dead; o.grp.children.forEach((c) => { if (c !== o.stump && c !== o.hpBar) c.visible = !dead; }); o.stump.visible = dead;
      o.hpBar.visible = !dead; o.hpBar.quaternion.copy(camera.quaternion);
      o.hfg.scale.x = clamp(t.hp, 0.001, 1); o.hfg.position.x = -(o.hfgW * (1 - clamp(t.hp, 0, 1))) / 2;
      if (!dead) {
        o.crystal.rotation.y += dt * (o.isNexus ? 0.5 : 1.0);
        if (o.isNexus) o.crystal.scale.setScalar(1 + Math.sin(now / 1000 * 2) * 0.06);
        // S29B4：常態近乎不發光（idleEmiss），**被攻擊時**才短暫拉高（+1.6 峰值）
        o.crystal.material.emissiveIntensity = o.idleEmiss + (o.flashT / 0.25) * 1.6;
      }
    });

    // ── 中立目標：龍 / 巴龍 / Buff / 野怪營地 ────────────────────────────────
    //  S29B6 根因（Ray 實測「打完後疑似延遲或突然消失」）：
    //    ① **相位差**：英雄/小兵畫在 `lerp(prev → snapshot, a)` 上，視覺上落後
    //       snapshot 最多**一個 tick**（1× 500ms、2× 250ms）；但中立目標舊碼直接讀
    //       `snapshot` 且**不插值** ⇒ 目標的死亡比「英雄視覺上打完最後一下」早一個 tick。
    //    ② **血條追值殘留**：舊碼 `shownHp = lerp(shownHp, hpNow, dt*6)` 是追值（落後真值），
    //       死亡瞬間又被強制歸零 ⇒ 血條還剩兩三成、模型就沒了＝「突然消失」。
    //    ③ fade 只有 0.5s（規格要 0.8–1.5s），且死後坑位空無一物、重生直接彈出。
    //  修法：目標的 hp / 存活改由 **prev→snapshot 插值（與英雄同一個 a）**——
    //    next 死亡時撐到 a=1 才轉死，血條同時線性走到 0 ⇒ 歸零與死亡同幀發生；
    //    fade = OBJ_FADE_S（1.1s）；死後坑位留 absent 環，重生時消失。
    //  全部是既有真實資料的差分/插值：**不改 objective reward / Progress / 節奏**。
    const objMap = {}, prevObjMap = {};
    (snapshot.objectives ?? []).forEach((o) => (objMap[o.id] = o));
    (prev.objectives ?? []).forEach((o) => (prevObjMap[o.id] = o));
    const updNeutral = (o, id, nx, baseEmissive, sizeFx) => {
      const pv = prevObjMap[id];
      const nAlive = !!nx?.alive, pAlive = !!pv?.alive;
      // 視覺存活：next 已死 ⇒ 撐到本 tick 結束（a=1）＝英雄視覺上打完最後一下才轉死
      const alive = nAlive || (pAlive && a < 1);
      // hp 與英雄同一條插值時間軸；死亡 tick 平滑走到 0（不再有殘留血條）
      const hpNow = nAlive
        ? (pAlive ? lerp(pv.hp, nx.hp, a) : nx.hp)      // 重生 ⇒ 直接滿血，不從 0 長回來
        : (pAlive ? lerp(pv.hp, 0, a) : 0);
      if (alive && (o.lastHp ?? 1) - hpNow > 0.002) o.flashT = 0.25;   // 受擊閃光
      o.lastHp = hpNow;
      if (o.flashT > 0) o.flashT = Math.max(0, o.flashT - dt);
      // 死亡轉場：alive → dead ⇒ 爆點 + OBJ_FADE_S 縮小下沉淡出（不是瞬間消失）
      if (o.wasAlive && !alive) { o.deathT = OBJ_FADE_S; o.spawnDeath?.(); }
      o.wasAlive = alive;
      if (o.deathT > 0) o.deathT = Math.max(0, o.deathT - dt);
      o.shownHp = alive ? clamp(hpNow, 0, 1) : 0;
      return { alive, hpNow, flash: (o.flashT / 0.25), dying: o.deathT > 0, dieK: o.deathT / OBJ_FADE_S, emissive: baseEmissive + (o.flashT / 0.25) * sizeFx };
    };
    // absent 環：死亡後坑位不是空無一物；重生（alive）即隱藏 ⇒ 狀態一眼可辨
    const updAbsent = (ring, alive, dying) => {
      if (!ring) return;
      ring.visible = !alive && !dying;
      if (ring.visible) ring.material.opacity = 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(now / 420));
    };
    ["dragon", "baron"].forEach((k) => {
      const d = snapshot[k], o = r.obj3d[k];
      o.spawnDeath = () => r.spawnViewFx(o.mesh.position.x, o.mesh.position.z, o.color, 6, 0.7);
      const st = updNeutral(o, k, objMap[k], d.contested ? 0.75 : 0.16, 1.2);
      o.mesh.visible = st.alive || st.dying;
      if (st.alive) { o.mesh.rotation.y += dt * 0.35; o.materials.forEach((m) => { m.emissiveIntensity = st.emissive; }); o.mesh.scale.setScalar(1); o.mesh.position.y = o.baseY; }
      else if (st.dying) { const s2 = 0.3 + 0.7 * st.dieK; o.mesh.scale.setScalar(s2); o.mesh.position.y = o.baseY * st.dieK; }
      updAbsent(o.absent, st.alive, st.dying);
      if (o.hpGrp) {
        // 死亡/淡出中 ⇒ 不顯示 HP 條（不再讓已死目標看起來還能打）
        o.hpGrp.visible = st.alive && !!objMap[k];
        if (o.hpGrp.visible) {
          const hp = clamp(o.shownHp, 0.001, 1);
          o.hfg.scale.x = hp; o.hfg.position.x = -(o.hfgW * (1 - hp)) / 2;
          o.hpGrp.quaternion.copy(camera.quaternion);
        }
      }
    });
    // 野怪營地（S29B2 起同一套受擊/死亡管線；S29B6 一併吃到插值同步 + absent 環）
    r.campObjs?.forEach((co, id) => {
      co.spawnDeath = () => r.spawnViewFx(co.grp.position.x, co.grp.position.z, co.color, 3.2, 0.55);
      const st = updNeutral(co, id, objMap[id], 0.14, 1.3);
      co.grp.visible = st.alive || st.dying;
      updAbsent(co.absent, st.alive, st.dying);
      if (st.alive) {
        co.body.rotation.y += dt * 0.8;
        co.materials.forEach((m) => { m.emissiveIntensity = st.emissive; });
        co.body.scale.setScalar(1); co.body.position.y = co.baseY;
        co.hpGrp.visible = true;
        const hp = clamp(co.shownHp, 0.001, 1);
        co.fg.scale.x = hp; co.fg.position.x = -(co.w * (1 - hp)) / 2;
        co.hpGrp.quaternion.copy(camera.quaternion);
      } else if (st.dying) {
        co.hpGrp.visible = false;
        const s2 = 0.25 + 0.75 * st.dieK;
        co.body.scale.setScalar(s2); co.body.position.y = co.baseY * st.dieK;
      }
    });
    // S29B2：呈現層事件 FX 池更新（死亡圈/火花：擴散 + 淡出；穩態零配置）
    for (const v of r.viewFx) {
      if (v.life <= 0) { if (v.ring.visible) v.ring.visible = false; continue; }
      v.life = Math.max(0, v.life - dt);
      const k2 = 1 - v.life / v.maxLife;
      const rr = (0.6 + k2 * v.size) * S;
      v.ring.scale.set(rr, rr, 1);
      v.ring.material.opacity = 0.85 * (1 - k2);
      if (v.life <= 0) v.ring.visible = false;
    }

    // ── FX：從物件池取用（S29；舊碼每幀 dispose 全部再 new ⇒ 每秒最多 3600 次配置）──
    //  穩態零配置：只更新 transform / color / opacity / visible。超過池容量的 fx 直接略過
    //  （maxFx 依畫質分級；這是刻意的上限，不是 bug）。
    let li = 0, ri = 0, oi = 0;
    const P = r.fxPool;
    for (const f of snapshot.fx) {
      if (!vis(f.pos, 22)) continue;
      const maxLife = f.type === "ult" ? 0.6 : 0.35, ratio = clamp(f.exp / maxLife, 0, 1);
      if (f.type === "line" || f.type === "tower") {
        const m = P.line[li]; if (!m) continue;
        const ax = wx(f.pos.x), az = wz(f.pos.y), bx = wx(f.target.x), bz = wz(f.target.y);
        const len = Math.hypot(bx - ax, bz - az); if (len < 0.01) continue;
        const rad = (0.1 + 0.18 * ratio) * S;
        m.position.set((ax + bx) / 2, 1.2 * S, (az + bz) / 2);
        m.scale.set(rad, len, rad);
        _v1.set(bx - ax, 0, bz - az).normalize();
        m.quaternion.setFromUnitVectors(_up, _v1);
        m.material.color.setHex(f.color); m.material.emissive.setHex(f.color);
        m.material.opacity = 0.35 + 0.65 * ratio;
        m.visible = true; li++;
      } else if (f.type === "ult") {
        const ring = P.ring[ri];
        if (ring) {
          const rout = (1.2 + (1 - ratio) * 4.5) * S;
          ring.position.set(wx(f.pos.x), 0.3, wz(f.pos.y));
          ring.scale.set(rout, rout, 1);
          ring.material.color.setHex(f.color); ring.material.opacity = 0.7 * ratio;
          ring.visible = true; ri++;
        }
        const core = P.orb[oi];
        if (core) {
          const rr = 1.6 * S * ratio + 0.3;
          core.position.set(wx(f.pos.x), 1.6 * S, wz(f.pos.y));
          core.scale.setScalar(rr);
          core.material.color.setHex(f.color); core.material.emissive.setHex(f.color);
          core.material.opacity = ratio;
          core.visible = true; oi++;
        }
      } else {
        const orb = P.orb[oi]; if (!orb) continue;
        orb.position.set(wx(f.pos.x), 1.6 * S, wz(f.pos.y));
        orb.scale.setScalar(1.4 * S);
        orb.material.color.setHex(f.color); orb.material.emissive.setHex(f.color);
        orb.material.opacity = 0.85 * ratio;
        orb.visible = true; oi++;
      }
    }
    for (let i = li; i < P.line.length; i++) P.line[i].visible = false;
    for (let i = ri; i < P.ring.length; i++) P.ring[i].visible = false;
    for (let i = oi; i < P.orb.length; i++) P.orb[i].visible = false;

    // 擊殺浮字
    snapshot.feed.forEach((k) => {
      if (r.seenFeed.has(k.id) || !k.vpos) return; r.seenFeed.add(k.id);
      const sp = makeLabelSprite("💀", 0xffffff, 3.4, 3.4); sp.position.set(wx(k.vpos.x), 3 * S, wz(k.vpos.y)); sp.userData.born = now; r.killGroup.add(sp); r.killSprites.push(sp);
    });
    for (let i = r.killSprites.length - 1; i >= 0; i--) {
      const sp = r.killSprites[i], age = (now - sp.userData.born) / 1000;
      if (age > 1.6) { r.killGroup.remove(sp); sp.material.map.dispose(); sp.material.dispose(); r.killSprites.splice(i, 1); continue; }
      sp.position.y = 3 * S + age * 4 * S; sp.material.opacity = clamp(1 - age / 1.6, 0, 1);
    }

    // 草叢
    const tt = now / 1000;
    r.blades.forEach((l) => { l.rotation.z = Math.sin(tt * 1.6 + l.userData.ph) * 0.18; l.rotation.x = Math.cos(tt * 1.2 + l.userData.ph) * 0.12; });
  });

  return null;
}

// S29B2 的 `CameraRig`（非跟隨模式的預設取景）已於 S29B6 併入 BattleCameraController：
//   相機只能有**一個**驅動點，否則 rig / controller / OrbitControls 會互相覆寫。
//   非跟隨（賽前待機）取景 = controller 的 `!follow` 分支（世界中心 + fitZoomFor）。

/**
 * S29：畫質分級（quality preset）。
 *   · dpr 上限：舊碼 [1,2] ⇒ 手機 retina 直接 2× 像素量（配上 SSAO 幾乎必卡）。
 *   · 後製：**不砍光**（S29 §11 禁止用「移除全部視覺效果」掩蓋效能問題）——
 *     Bloom 三檔都保留（水晶/技能發光是 MOBA 的識別度來源），
 *     只有最貴的 SSAO + normalPass 降到 high 才開。
 *   · quality 由呼叫端傳入（GameView 依 battle/quality.js 自動判斷 + 玩家手動覆寫）。
 */
/**
 * @param source S29B6：呈現資料源。預設 `null` ⇒ live `useGameStore`。
 *   Replay 傳入 `createReplaySource(replay)`（唯讀 adapter：replay frame → snapshot），
 *   讓**重播與現場共用同一套 3D 戰場**，而不是各自維護一張地圖。
 *   本檔只呼叫 `source.getState()`，永遠不寫入 ⇒ 重播不可能觸發終局結算 / 發獎。
 */
export default function MobaView3D({ mapTexture = null, autoRotate = true, battleFollow = false, roster = null, debug = false, quality = null, source = null }) {
  const Q = quality ?? presetFor("medium");
  const mobile = useIsMobile();   // S29B2：取景分歧（桌機全圖 / 手機聚焦戰場）
  return (
    <Canvas
      shadows={Q.shadows}
      dpr={[1, Q.dpr]}
      gl={{ antialias: Q.id !== "low", powerPreference: "high-performance" }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.35; }}
    >
      <color attach="background" args={["#0d1420"]} />
      <fog attach="fog" args={["#0d1420", 260 * S, 460 * S]} />

      {/* 2.5D 正交戰術視角（固定斜俯角，不旋轉）。position/zoom 只是初值——
          之後由 BattleCameraController 依 cameraStore 的 pan/zoom 單一驅動。 */}
      <OrthographicCamera makeDefault position={[55 * S, 78 * S, 78 * S]} zoom={3.4} near={0.1} far={2000} />

      {/* 明亮光影。⚠ 場上的動態 PointLight 已從 22 盞降到 2 盞（只剩主堡），見 MobaScene。 */}
      <ambientLight intensity={1.15} />
      <hemisphereLight args={[0xcfe6ff, 0x415028, 0.85]} />
      {Q.shadows ? (
        <directionalLight position={[60 * S, 150 * S, 50 * S]} intensity={2.7} color={0xfff4e0} castShadow shadow-mapSize={[Q.shadowMapSize, Q.shadowMapSize]} shadow-bias={-0.0004}>
          <orthographicCamera attach="shadow-camera" args={[-110 * S, 110 * S, 110 * S, -110 * S, 1, 500 * S]} />
        </directionalLight>
      ) : (
        <directionalLight position={[60 * S, 150 * S, 50 * S]} intensity={2.7} color={0xfff4e0} />
      )}
      <directionalLight position={[-50 * S, 60 * S, -40 * S]} intensity={0.6} color={0x9ec8ff} />

      <MobaScene mapTexture={mapTexture} roster={roster} Q={Q} source={source} />
      <BattleCameraController follow={battleFollow} mobile={mobile} source={source} />

      {/* 後製：Bloom 三檔都保留；SSAO（含 normalPass）只在 high 開啟 */}
      <EffectComposer enableNormalPass={Q.ssao} multisampling={Q.multisampling}>
        {Q.ssao ? <SSAO blendFunction={BlendFunction.MULTIPLY} samples={24} radius={4} intensity={22} luminanceInfluence={0.5} color="black" /> : <></>}
        {Q.bloom ? <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.5} intensity={Q.bloomIntensity ?? 1.05} mipmapBlur /> : <></>}
        {Q.vignette ? <Vignette eskil={false} offset={0.25} darkness={0.5} /> : <></>}
      </EffectComposer>
    </Canvas>
  );
}
