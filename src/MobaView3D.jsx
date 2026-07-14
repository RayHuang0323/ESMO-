// ============================================================================
//  MobaView3D.jsx  —  正式 3D 渲染殼（React Three Fiber + Bloom/SSAO）
//  - 只讀 useGameStore（prev/snapshot/subTRef），不改任何邏輯/數值
//  - 場景內容用一條 useFrame 命令式更新（沿用已驗證的更新邏輯，效能/正確性高）
//  - Canvas / 正交神之視角 / OrbitControls / 燈光 / 後製濾鏡 皆為 R3F 宣告式
//
//  安裝：npm install three @react-three/fiber @react-three/drei \
//                    @react-three/postprocessing postprocessing zustand
//  注意：此檔需在你的 Vite/CRA 專案執行（Claude artifact 沙盒無法 import R3F）。
//  HUD / 小地圖 / Start 按鈕是 DOM 疊層 → 放在 GameView.jsx。
// ============================================================================

import React, { useRef, useEffect } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrthographicCamera, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom, SSAO, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { useGameStore } from "./useGameStore.js";
import {
  lerp, clamp, ease, LANES, posOnLane, WATER, WALLS, PITS, BUSHES,
  BASE, ROLE_NAME, SIDE, GLOW,
} from "./gameData.js";
import BattleCameraController from "./battle/ui/BattleCameraController.jsx";
import { presetFor } from "./battle/quality.js";

// ── 世界尺度（放大；只影響渲染，不影響邏輯）──────────────────────────────────
const S = 1.7;
const wx = (x) => (x - 50) * S, wz = (y) => (y - 50) * S;

// S29：可重用的暫存向量（避免在 useFrame 內每幀 new THREE.Vector3）
const _up = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();

// ── 程序化彩色底圖（無上傳圖時的後備）────────────────────────────────────────
function makeRiftTexture() {
  const s = 1024, cv = document.createElement("canvas"); cv.width = cv.height = s;
  const g = cv.getContext("2d"), px = (p) => (p / 100) * s;
  const grad = g.createLinearGradient(0, s, s, 0);
  grad.addColorStop(0, "#2f7d4f"); grad.addColorStop(0.5, "#347a46"); grad.addColorStop(1, "#5a7a36");
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 320; i++) { g.fillStyle = `rgba(${20+Math.random()*40},${90+Math.random()*70},${40+Math.random()*40},0.18)`; g.beginPath(); g.arc(Math.random()*s, Math.random()*s, 8+Math.random()*26, 0, 7); g.fill(); }
  g.strokeStyle = "rgba(70,160,200,0.55)"; g.lineWidth = px(11); g.lineCap = "round"; g.beginPath(); g.moveTo(px(20), px(20)); g.lineTo(px(80), px(80)); g.stroke();
  g.strokeStyle = "rgba(150,220,245,0.45)"; g.lineWidth = px(4); g.beginPath(); g.moveTo(px(20), px(20)); g.lineTo(px(80), px(80)); g.stroke();
  for (const lane of ["top", "mid", "bot"]) {
    g.strokeStyle = "rgba(196,170,120,0.85)"; g.lineWidth = px(6.2); g.lineJoin = "round";
    g.beginPath(); LANES[lane].forEach((p, i) => (i ? g.lineTo(px(p.x), px(p.y)) : g.moveTo(px(p.x), px(p.y)))); g.stroke();
  }
  BUSHES.forEach((b) => { g.fillStyle = "rgba(18,70,34,0.6)"; g.beginPath(); g.ellipse(px(b.x), px(b.y), px(b.r), px(b.r * 0.8), 0, 0, 7); g.fill(); });
  const baseGlow = (b, c1, c2) => { const gr = g.createRadialGradient(px(b.x), px(b.y), px(2), px(b.x), px(b.y), px(11)); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.beginPath(); g.arc(px(b.x), px(b.y), px(11), 0, 7); g.fill(); };
  baseGlow(BASE.blue, "rgba(120,180,255,0.85)", "rgba(40,90,200,0.05)");
  baseGlow(BASE.red, "rgba(255,150,150,0.85)", "rgba(200,50,50,0.05)");
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

// ════════════════════════════════════════════════════════════════════════════
//  場景內容（命令式建立 + 單一 useFrame 更新）
// ════════════════════════════════════════════════════════════════════════════
function MobaScene({ mapTexture, roster, Q }) {
  const { scene, camera } = useThree();
  const R = useRef({});

  useEffect(() => {
    const world = new THREE.Group(); scene.add(world);
    const snap0 = useGameStore.getState().snapshot;

    // 地板
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100 * S, 100 * S), floorMat);
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
      const ang = rng() * 7, rad = 18 + rng() * 30, cx = 50 + Math.cos(ang) * rad, cy = 50 + Math.sin(ang) * rad, h = (1.2 + rng() * 3) * S;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry((0.8 + rng() * 1.8) * S, 0), rockMat);
      m.position.set(wx(clamp(cx, 5, 95)), h * 0.3, wz(clamp(cy, 5, 95))); m.rotation.set(rng() * 3, rng() * 3, rng() * 3); m.scale.y = 0.6 + rng(); m.castShadow = true; m.receiveShadow = true; world.add(m);
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
        const m = new THREE.Mesh(new THREE.CylinderGeometry(ti.r * sc * S, (ti.r + 0.4) * sc * S, ti.h * sc * S, 8), new THREE.MeshStandardMaterial({ color: ti.c, emissive: ti.c === col ? col : 0x000000, emissiveIntensity: ti.c === col ? 0.45 : 0, roughness: 0.5, metalness: 0.55 }));
        m.position.y = ti.y * sc * S; m.castShadow = true; m.receiveShadow = true; grp.add(m);
      });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry((isNexus ? 4.6 : 1.4) * S, 0), new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: isNexus ? 1.9 : 1.3, roughness: 0.1, metalness: 0.35 }));
      crystal.position.y = (isNexus ? 16 : 13.5) * sc * S; crystal.castShadow = Q.shadows; grp.add(crystal);
      // S29 效能修復（最大單一元凶之一）：舊碼**每座塔都掛一盞 PointLight**（18 塔 + 2 主堡
      //   = 20 盞，再加龍/巴龍共 22 盞）。Three.js 的 MeshStandardMaterial 會把每一盞燈
      //   都編進 per-fragment 迴圈 ⇒ 手機直接崩。
      //   改為：**只有主堡**有燈（2 盞），一般塔靠 emissive + Bloom 發光（視覺幾乎不變）。
      //   high 檔可選擇性開回塔燈（Q.towerLights）。
      if (isNexus || Q.towerLights) grp.add(new THREE.PointLight(glow, isNexus ? 9 : 2.2, (isNexus ? 60 : 26) * S));
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(2.4 * sc * S, 3.0 * sc * S, 2.0 * sc * S, 7), new THREE.MeshStandardMaterial({ color: 0x33363d, roughness: 1, metalness: 0.1, flatShading: true }));
      stump.position.y = 1.0 * sc * S; stump.visible = false; stump.castShadow = true; grp.add(stump);
      const hpBar = new THREE.Group(); hpBar.position.y = (isNexus ? 22 : 15) * sc * S;
      const hbg = new THREE.Mesh(new THREE.PlaneGeometry((isNexus ? 6 : 3.2) * S, 0.5 * S), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, depthTest: false })); hbg.position.z = -0.01;
      const hfgW = (isNexus ? 5.8 : 3.0) * S;
      const hfg = new THREE.Mesh(new THREE.PlaneGeometry(hfgW, 0.38 * S), new THREE.MeshBasicMaterial({ color: t.side === "blue" ? 0x60a5fa : 0xf87171, depthTest: false }));
      hpBar.add(hbg, hfg); grp.add(hpBar);
      world.add(grp); towerObjs[key] = { grp, crystal, stump, isNexus, hpBar, hfg, hfgW };
    });

    // 龍/巴龍
    const obj3d = {};
    [["dragon", PITS.dragon, 0xb794f6], ["baron", PITS.baron, 0xfbbf24]].forEach(([k, pit, col]) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 * S, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.6 }));
      m.position.set(wx(pit.x), 2.0 * S, wz(pit.y)); m.castShadow = true; m.visible = false; world.add(m);
      const pl = new THREE.PointLight(col, 3, 24 * S); pl.position.copy(m.position); pl.visible = false; world.add(pl);
      obj3d[k] = { mesh: m, light: pl };
    });

    // 英雄
    const heroObjs = {};
    snap0.players.forEach((p) => {
      const col = SIDE[p.side], glow = GLOW[p.side];
      const root = new THREE.Group(); root.position.set(wx(p.pos.x), 0, wz(p.pos.y));
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.65, roughness: 0.3, metalness: 0.7 });
      const cap = makeCapsule(1.0 * S, 2.0 * S, mat); cap.position.y = 1.7 * S; root.add(cap);
      const ringMat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5 * S, 2.0 * S, 32), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; root.add(ring);
      const hpGrp = new THREE.Group(); hpGrp.position.y = 4.0 * S;
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(2.6 * S, 0.4 * S), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 })); bg.position.z = -0.01;
      const fgMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
      const fg = new THREE.Mesh(new THREE.PlaneGeometry(2.5 * S, 0.3 * S), fgMat);
      hpGrp.add(bg, fg); root.add(hpGrp);
      const topper = makeTopper(p.role, glow); topper.position.y = 3.4 * S; root.add(topper);
      const overlayHex = p.side === "blue" ? 0x93c5fd : 0xfca5a5;
      const overlay = makeOverlaySprite(overlayHex); overlay.position.y = 5.6 * S; root.add(overlay);
      world.add(root);
      heroObjs[p.id] = { root, cap, mat, ring, ringMat, hpGrp, fg, fgMat, topper, overlay, overlayHex, lastOverlay: "", seed: Math.random() * 7 };
    });

    // ── 小兵：共享 geometry + 2 個共享材質 + 物件池 ───────────────────────────
    //  S29 效能修復：舊碼**每隻小兵各 new 一份 geometry 與 MeshStandardMaterial**
    //   （場上最多 96 隻），且每次生成/陣亡就 new/dispose 一輪。
    const minionGeo = new THREE.CylinderGeometry(0.4 * S, 0.52 * S, 1.3 * S, 6);
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

    const killGroup = new THREE.Group(); world.add(killGroup);

    R.current = {
      world, floorMat, blades, towerObjs, obj3d, heroObjs,
      minionMeshes, minionPool, minionGeo, minionMat,
      fxGroup, fxPool, killGroup, killSprites: [], seenFeed: new Set(), Q,
    };

    return () => {
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
  }, [mapTexture, scene, Q]);

  // 單一 useFrame：讀 store → 命令式更新（不觸發 React 重繪）
  useFrame((state, dt) => {
    const r = R.current; if (!r.heroObjs) return;
    const now = state.clock.getElapsedTime() * 1000;
    const { prev, snapshot, subTRef } = useGameStore.getState();
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
      o.cap.scale.y = dead ? 0.25 : 1; o.cap.position.y = dead ? 0.4 * S : 1.7 * S + Math.sin(now / 1000 * 3 + o.seed) * 0.07 * S;
      o.mat.color.setHex(dead ? 0x3a3a3a : SIDE[p.side]); o.mat.emissiveIntensity = dead ? 0 : 0.65;
      o.ringMat.opacity = dead ? 0.12 : 0.6;
      o.hpGrp.visible = !dead; o.hpGrp.quaternion.copy(camera.quaternion);
      const hp = clamp(p.hp, 0.001, 1); o.fg.scale.x = hp; o.fg.position.x = -(2.5 * S * (1 - hp)) / 2;
      o.fgMat.color.setHex(hp > 0.55 ? 0x34d399 : hp > 0.28 ? 0xfbbf24 : 0xf87171);
      o.topper.visible = !dead; o.topper.rotation.y += dt * 1.2; o.topper.position.y = 3.4 * S + Math.sin(now / 1000 * 3 + o.seed) * 0.07 * S;
      o.root.visible = p.side === "blue" ? true : vis(np.pos);
      // Sprint07 Hero Overlay v2：英雄名 / 玩家名·Lv(佔位) / KDA或復活倒數 + 狀態徽章
      const heroName = roster?.[p.id]?.hero ?? ROLE_NAME[np.role];
      const playerName = `${roster?.[p.id]?.player ?? p.id.toUpperCase()} · Lv${np.lv ?? 1}`;  // Sprint08：真等級（Hero Progress loadout）
      const line3 = dead ? `☠ ${Math.max(0, np.respawn).toFixed(0)}s` : `${np.k}/${np.d}/${np.a ?? 0}`;
      const badge = dead ? null
        : np.state === "撤退" ? { text: "⛊ 撤退", bg: "#fbbf24" }
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
    });

    // 小兵
    const seen = new Set(), nextMin = {};
    ["top", "mid", "bot"].forEach((ln) => { ["bm", "rm"].forEach((k) => snapshot.lanes[ln][k].forEach((m) => (nextMin[k[0] + ":" + ln + ":" + m.id] = m.t))); });
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
            r.minionMeshes.set(key, mesh); r.world.add(mesh);
          }
          const tt = lerp(m.t, nextMin[key] ?? m.t, a), p = posOnLane(ln, tt);
          mesh.position.set(wx(p.x), 0.65 * S, wz(p.y)); mesh.visible = side === "blue" ? true : vis(p, 14);
        });
      });
    });
    // S29：回收進池，**不 dispose**（geometry/material 是共享的，dispose 會炸掉其他小兵）
    r.minionMeshes.forEach((mesh, key) => {
      if (!seen.has(key)) { r.world.remove(mesh); r.minionPool.push(mesh); r.minionMeshes.delete(key); }
    });

    // 塔
    Object.entries(snapshot.towers).forEach(([key, t]) => {
      const o = r.towerObjs[key]; if (!o) return;
      const dead = t.hp <= 0;
      o.crystal.visible = !dead; o.grp.children.forEach((c) => { if (c !== o.stump && c !== o.hpBar) c.visible = !dead; }); o.stump.visible = dead;
      o.hpBar.visible = !dead; o.hpBar.quaternion.copy(camera.quaternion);
      o.hfg.scale.x = clamp(t.hp, 0.001, 1); o.hfg.position.x = -(o.hfgW * (1 - clamp(t.hp, 0, 1))) / 2;
      if (!dead) { o.crystal.rotation.y += dt * (o.isNexus ? 0.5 : 1.0); if (o.isNexus) o.crystal.scale.setScalar(1 + Math.sin(now / 1000 * 2) * 0.06); }
    });

    // 龍/巴龍
    ["dragon", "baron"].forEach((k) => { const d = snapshot[k], o = r.obj3d[k]; o.mesh.visible = d.alive; o.light.visible = d.alive; if (d.alive) { o.mesh.rotation.y += dt * 0.7; o.mesh.material.emissiveIntensity = d.contested ? 2.6 : 1.4; } });

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

/**
 * S29：畫質分級（quality preset）。
 *   · dpr 上限：舊碼 [1,2] ⇒ 手機 retina 直接 2× 像素量（配上 SSAO 幾乎必卡）。
 *   · 後製：**不砍光**（S29 §11 禁止用「移除全部視覺效果」掩蓋效能問題）——
 *     Bloom 三檔都保留（水晶/技能發光是 MOBA 的識別度來源），
 *     只有最貴的 SSAO + normalPass 降到 high 才開。
 *   · quality 由呼叫端傳入（GameView 依 battle/quality.js 自動判斷 + 玩家手動覆寫）。
 */
export default function MobaView3D({ mapTexture = null, autoRotate = true, battleFollow = false, roster = null, debug = false, quality = null }) {
  const Q = quality ?? presetFor("medium");
  return (
    <Canvas
      shadows={Q.shadows}
      dpr={[1, Q.dpr]}
      gl={{ antialias: Q.id !== "low", powerPreference: "high-performance" }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.35; }}
    >
      <color attach="background" args={["#0d1420"]} />
      <fog attach="fog" args={["#0d1420", 260 * S, 460 * S]} />

      {/* 正交神之視角（斜對角）；用滾輪縮放或調 zoom 對齊畫面 */}
      <OrthographicCamera makeDefault position={[55 * S, 78 * S, 78 * S]} zoom={3.4} near={0.1} far={2000} />
      <OrbitControls makeDefault target={[0, 0, 0]} autoRotate={autoRotate && !battleFollow} autoRotateSpeed={0.6} enablePan={debug} minZoom={1.6} maxZoom={9} />

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

      <MobaScene mapTexture={mapTexture} roster={roster} Q={Q} />
      <BattleCameraController follow={battleFollow} />

      {/* 後製：Bloom 三檔都保留；SSAO（含 normalPass）只在 high 開啟 */}
      <EffectComposer enableNormalPass={Q.ssao} multisampling={Q.multisampling}>
        {Q.ssao ? <SSAO blendFunction={BlendFunction.MULTIPLY} samples={24} radius={4} intensity={22} luminanceInfluence={0.5} color="black" /> : <></>}
        {Q.bloom ? <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.5} intensity={1.1} mipmapBlur /> : <></>}
        {Q.vignette ? <Vignette eskil={false} offset={0.25} darkness={0.5} /> : <></>}
      </EffectComposer>
    </Canvas>
  );
}
