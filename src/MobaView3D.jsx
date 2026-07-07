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

// ── 世界尺度（放大；只影響渲染，不影響邏輯）──────────────────────────────────
const S = 1.7;
const wx = (x) => (x - 50) * S, wz = (y) => (y - 50) * S;

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
function drawOverlayTexture(hero, player, line3, hex, badge) {
  const c = document.createElement("canvas"); c.width = 340; c.height = 132;
  const g = c.getContext("2d"); g.textAlign = "center"; g.textBaseline = "middle";
  // 第 1 行：英雄名
  g.font = "bold 32px system-ui,sans-serif";
  g.lineWidth = 7; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(hero, 170, 22);
  g.fillStyle = "#" + hex.toString(16).padStart(6, "0"); g.fillText(hero, 170, 22);
  // 第 2 行：玩家名 · Lv
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
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function makeOverlaySprite(hex) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: drawOverlayTexture(" ", " ", " ", hex, null), transparent: true, depthTest: false }));
  sp.scale.set(6.0 * S, 2.35 * S, 1); return sp;
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
function MobaScene({ mapTexture, roster }) {
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
    const blades = [];
    BUSHES.forEach((b, bi) => {
      const grp = new THREE.Group(); grp.position.set(wx(b.x), 0, wz(b.y));
      const n = Math.max(7, Math.round(b.r * 3)), cols = [0x2aa14e, 0x37c065, 0x1f8a42, 0x46d47a];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 7 + bi, rr = b.r * (0.25 + rng() * 0.7) * S, hh = (1.4 + rng() * 1.6) * S;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5 * S, hh, 5), new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: 0.75, metalness: 0.05, flatShading: true }));
        leaf.position.set(Math.cos(a) * rr, hh / 2, Math.sin(a) * rr); leaf.castShadow = true; leaf.userData.ph = rng() * 7; grp.add(leaf); blades.push(leaf);
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
      crystal.position.y = (isNexus ? 16 : 13.5) * sc * S; crystal.castShadow = true; grp.add(crystal);
      grp.add(new THREE.PointLight(glow, isNexus ? 9 : 2.2, (isNexus ? 60 : 26) * S));
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

    const minionMeshes = new Map();
    const fxGroup = new THREE.Group(); world.add(fxGroup);
    const killGroup = new THREE.Group(); world.add(killGroup);

    R.current = { world, floorMat, blades, towerObjs, obj3d, heroObjs, minionMeshes, fxGroup, killGroup, killSprites: [], seenFeed: new Set() };

    return () => {
      scene.remove(world);
      world.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose?.(); m.dispose(); }); });
    };
  }, [mapTexture, scene]);

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
      const playerName = `${roster?.[p.id]?.player ?? p.id.toUpperCase()} · Lv—`;  // Lv：引擎尚無等級資料，佔位不造假
      const line3 = dead ? `☠ ${Math.max(0, np.respawn).toFixed(0)}s` : `${np.k}/${np.d}/${np.a ?? 0}`;
      const badge = dead ? null
        : np.state === "撤退" ? { text: "⛊ 撤退", bg: "#fbbf24" }
        : np.state === "團戰!" ? { text: "⚔ 團戰", bg: "#f87171" }
        : np.state === "圍攻" ? { text: "⚑ 圍攻", bg: "#a78bfa" } : null;
      const key = heroName + "|" + playerName + "|" + line3 + "|" + (badge?.text ?? "");
      if (key !== o.lastOverlay) {
        o.lastOverlay = key;
        o.overlay.material.map.dispose();
        o.overlay.material.map = drawOverlayTexture(heroName, playerName, line3, dead ? 0x9ca3af : o.overlayHex, badge);
        o.overlay.material.needsUpdate = true;
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
          if (!mesh) { mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * S, 0.52 * S, 1.3 * S, 6), new THREE.MeshStandardMaterial({ color: SIDE[side], emissive: SIDE[side], emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.6 })); mesh.castShadow = true; r.minionMeshes.set(key, mesh); r.world.add(mesh); }
          const tt = lerp(m.t, nextMin[key] ?? m.t, a), p = posOnLane(ln, tt);
          mesh.position.set(wx(p.x), 0.65 * S, wz(p.y)); mesh.visible = side === "blue" ? true : vis(p, 14);
        });
      });
    });
    r.minionMeshes.forEach((mesh, key) => { if (!seen.has(key)) { r.world.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); r.minionMeshes.delete(key); } });

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

    // fx 重建（彈道淡出 / 大招擴散環，迷霧外不顯示）
    while (r.fxGroup.children.length) { const c = r.fxGroup.children.pop(); c.geometry?.dispose?.(); c.material?.dispose?.(); }
    snapshot.fx.forEach((f) => {
      if (!vis(f.pos, 22)) return;
      const maxLife = f.type === "ult" ? 0.6 : 0.35, ratio = clamp(f.exp / maxLife, 0, 1);
      if (f.type === "line" || f.type === "tower") {
        const A = new THREE.Vector3(wx(f.pos.x), 1.2 * S, wz(f.pos.y)), B = new THREE.Vector3(wx(f.target.x), 1.2 * S, wz(f.target.y));
        const len = A.distanceTo(B); if (len < 0.01) return;
        const rad = (0.1 + 0.18 * ratio) * S;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.4, rad, len, 6), new THREE.MeshStandardMaterial({ color: f.color, emissive: f.color, emissiveIntensity: 2.6, transparent: true, opacity: 0.35 + 0.65 * ratio }));
        m.position.copy(A.clone().add(B).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); r.fxGroup.add(m);
      } else if (f.type === "ult") {
        const rout = (1.2 + (1 - ratio) * 4.5) * S;
        const ring = new THREE.Mesh(new THREE.RingGeometry(rout * 0.62, rout, 36), new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.7 * ratio, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(wx(f.pos.x), 0.3, wz(f.pos.y)); r.fxGroup.add(ring);
        const core = new THREE.Mesh(new THREE.SphereGeometry(1.6 * S * ratio + 0.3, 14, 14), new THREE.MeshStandardMaterial({ color: f.color, emissive: f.color, emissiveIntensity: 2.4, transparent: true, opacity: ratio }));
        core.position.set(wx(f.pos.x), 1.6 * S, wz(f.pos.y)); r.fxGroup.add(core);
      } else {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(1.4 * S, 16, 16), new THREE.MeshStandardMaterial({ color: f.color, emissive: f.color, emissiveIntensity: 2.2, transparent: true, opacity: 0.85 * ratio }));
        orb.position.set(wx(f.pos.x), 1.6 * S, wz(f.pos.y)); r.fxGroup.add(orb);
      }
    });

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

export default function MobaView3D({ mapTexture = null, autoRotate = true, battleFollow = false, roster = null, debug = false }) {
  return (
    <Canvas
      shadows dpr={[1, 2]} gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.35; }}
    >
      <color attach="background" args={["#0d1420"]} />
      <fog attach="fog" args={["#0d1420", 260 * S, 460 * S]} />

      {/* 正交神之視角（斜對角）；用滾輪縮放或調 zoom 對齊畫面 */}
      <OrthographicCamera makeDefault position={[55 * S, 78 * S, 78 * S]} zoom={3.4} near={0.1} far={2000} />
      <OrbitControls makeDefault target={[0, 0, 0]} autoRotate={autoRotate && !battleFollow} autoRotateSpeed={0.6} enablePan={debug} minZoom={1.6} maxZoom={9} />

      {/* 明亮光影 */}
      <ambientLight intensity={1.15} />
      <hemisphereLight args={[0xcfe6ff, 0x415028, 0.85]} />
      <directionalLight position={[60 * S, 150 * S, 50 * S]} intensity={2.7} color={0xfff4e0} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}>
        <orthographicCamera attach="shadow-camera" args={[-110 * S, 110 * S, 110 * S, -110 * S, 1, 500 * S]} />
      </directionalLight>
      <directionalLight position={[-50 * S, 60 * S, -40 * S]} intensity={0.6} color={0x9ec8ff} />

      <MobaScene mapTexture={mapTexture} roster={roster} />
      <BattleCameraController follow={battleFollow} />

      {/* 後製濾鏡。若 SSAO 在你的版本報錯：移除 enableNormalPass 或把 SSAO 整段拿掉 */}
      <EffectComposer enableNormalPass multisampling={4}>
        <SSAO blendFunction={BlendFunction.MULTIPLY} samples={24} radius={4} intensity={22} luminanceInfluence={0.5} color="black" />
        <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.5} intensity={1.1} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.5} />
      </EffectComposer>
    </Canvas>
  );
}
