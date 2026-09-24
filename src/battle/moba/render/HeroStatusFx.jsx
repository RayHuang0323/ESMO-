// ============================================================================
//  render/HeroStatusFx.jsx — 英雄持續狀態的角色附著效果（feature/moba-spectacle-vision）
//
//  為什麼：snapshot 的 `statusEffects` 有完整的護盾／增益／減益／控制，但英雄身上幾乎沒有
//  持續表現，護盾和控制在畫面上看起來一樣。這一層依 `heroStatusMeta` 的類別給**不同造型**：
//
//    bubble   護盾      多面體護殼（fresnel shader，包住角色）
//    plates   減傷      三片環繞軀幹的護甲板（mesh）
//    streaks  加速      身後的速度拖尾（長條 mesh，沿面向）
//    embers   強化      往上飄的火星（billboard particle）
//    frost    減速      腳邊繞行的冰晶（八面體 mesh）
//    flames   點燃      身上的小火焰（billboard）
//    spikes   定身      腳下冒出的尖刺（cone mesh）
//    stars    暈眩／擊飛 頭頂旋轉星星（billboard）
//    icon     沉默／嘲諷／標記／冷卻／免控／隱身：頭頂圖示（atlas billboard）
//
//  ── 規則（create-game-vfx）───────────────────────────────────────────────
//   · owner＝英雄；時長＝狀態剩餘時間；英雄死亡或狀態消失 ⇒ 當幀就不畫（沒有殘留）。
//   · 5 個 instanced pool、依畫質設上限；geometry／material／texture 一次建立、卸載時釋放。
//   · 每幀零配置（scratch 物件重用）。reduced motion ⇒ 不旋轉、不飄，只留靜態造型。
//   · 純呈現：只讀 frameRef，不寫任何戰鬥狀態。
// ============================================================================
import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { statusMetaOf, sortedStatuses } from "../presentation/heroStatusMeta.js";
import { useReducedBattleMotion } from "./useReducedBattleMotion.js";
import { diagnosticsEnabled } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;
const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;
const HERO_H = 2.6 * S, HERO_R = 1.15 * S, ICON_Y = 6.1 * S;
const CELLS = ["star", "silence", "taunt", "mark", "clock", "immune", "dot", "flame", "stealth", "root"];
const CELL = Object.fromEntries(CELLS.map((n, i) => [n, i]));
const CAPS = {
  high: { bill: 160, bubble: 10, box: 60, cone: 60, octa: 60 },
  medium: { bill: 110, bubble: 10, box: 40, cone: 40, octa: 40 },
  low: { bill: 60, bubble: 10, box: 24, cone: 24, octa: 24 },
};

function drawAtlas() {
  const size = 64, canvas = document.createElement("canvas");
  canvas.width = size * CELLS.length; canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineCap = "round"; g.lineJoin = "round";
  const at = (i) => { g.setTransform(1, 0, 0, 1, i * size + size / 2, size / 2); };
  // star
  at(CELL.star); g.beginPath();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 11 : 26, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill();
  // silence：對話框＋斜線
  at(CELL.silence); g.lineWidth = 5; g.beginPath(); g.ellipse(0, -3, 22, 17, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(-8, 12); g.lineTo(-14, 25); g.lineTo(2, 13); g.stroke();
  g.beginPath(); g.moveTo(-24, 20); g.lineTo(24, -26); g.stroke();
  // taunt：驚嘆號
  at(CELL.taunt); g.fillRect(-6, -27, 12, 36); g.beginPath(); g.arc(0, 21, 7, 0, Math.PI * 2); g.fill();
  // mark：準星
  at(CELL.mark); g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke();
  for (const [x, y] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { g.beginPath(); g.moveTo(x * 14, y * 14); g.lineTo(x * 30, y * 30); g.stroke(); }
  // clock
  at(CELL.clock); g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 23, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -15); g.moveTo(0, 0); g.lineTo(11, 7); g.stroke();
  // immune：盾＋十字
  at(CELL.immune); g.beginPath(); g.moveTo(0, -27); g.lineTo(23, -17); g.lineTo(19, 9); g.lineTo(0, 27); g.lineTo(-19, 9); g.lineTo(-23, -17); g.closePath(); g.fill();
  g.globalCompositeOperation = "destination-out"; g.fillRect(-3, -15, 6, 26); g.fillRect(-11, -5, 22, 6); g.globalCompositeOperation = "source-over";
  // dot：柔光點（火星用）
  at(CELL.dot); { const grd = g.createRadialGradient(0, 0, 0, 0, 0, 28); grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.35, "rgba(255,255,255,.7)"); grd.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = grd; g.fillRect(-32, -32, 64, 64); g.fillStyle = "#fff"; }
  // flame：水滴形火焰
  at(CELL.flame); { const grd = g.createLinearGradient(0, 28, 0, -28); grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(1, "rgba(255,255,255,.15)"); g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, -28); g.bezierCurveTo(16, -6, 22, 10, 0, 27); g.bezierCurveTo(-22, 10, -16, -6, 0, -28); g.fill(); g.fillStyle = "#fff"; }
  // stealth：虛線眼
  at(CELL.stealth); g.lineWidth = 4; g.setLineDash([6, 5]); g.beginPath(); g.ellipse(0, 0, 25, 14, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill();
  // root：鎖鏈
  at(CELL.root); g.lineWidth = 5; for (const x of [-12, 12]) { g.beginPath(); g.ellipse(x, 0, 13, 8, 0, 0, Math.PI * 2); g.stroke(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  return tex;
}

const billVert = `
attribute float cell; attribute vec4 tint;
varying vec2 vUv; varying float vCell; varying vec4 vTint;
void main(){ vUv=uv; vCell=cell; vTint=tint; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`;
const billFrag = `
uniform sampler2D atlas; uniform float cells;
varying vec2 vUv; varying float vCell; varying vec4 vTint;
void main(){ vec4 t=texture2D(atlas, vec2((vCell+vUv.x)/cells, vUv.y)); float a=t.a*vTint.a; if(a<0.02) discard;
  gl_FragColor=vec4(mix(vTint.rgb, vec3(1.0), 0.18)*t.rgb, a); }`;
const shellVert = `
attribute vec4 tint; varying vec4 vTint; varying vec3 vN; varying vec3 vV;
void main(){ vTint=tint; vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.0); vV=-p.xyz; vN=normalize(normalMatrix*mat3(instanceMatrix)*normal); gl_Position=projectionMatrix*p; }`;
const shellFrag = `
varying vec4 vTint; varying vec3 vN; varying vec3 vV;
void main(){ float rim=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.2); float a=(0.08+rim*0.75)*vTint.a; if(a<0.01) discard;
  gl_FragColor=vec4(mix(vTint.rgb, vec3(1.0), rim*0.35), a); }`;

function instanced(geometry, material, cap, withCell) {
  const mesh = new THREE.InstancedMesh(geometry, material, cap);
  mesh.frustumCulled = false; mesh.count = 0;
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  geometry.setAttribute("tint", tint);
  if (withCell) geometry.setAttribute("cell", new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
  return mesh;
}

export default function HeroStatusFx({ frameRef, quality = "high" }) {
  const reduced = useReducedBattleMotion();
  const caps = CAPS[quality] ?? CAPS.high;
  const res = useMemo(() => {
    const atlas = drawAtlas();
    const billMat = new THREE.ShaderMaterial({ vertexShader: billVert, fragmentShader: billFrag, transparent: true, depthWrite: false, depthTest: false,
      uniforms: { atlas: { value: atlas }, cells: { value: CELLS.length } } });
    const shellMat = new THREE.ShaderMaterial({ vertexShader: shellVert, fragmentShader: shellFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const solid = (opacity) => new THREE.ShaderMaterial({ vertexShader: shellVert, transparent: true, depthWrite: false,
      fragmentShader: `varying vec4 vTint; varying vec3 vN; varying vec3 vV; void main(){ float l=0.55+0.45*abs(dot(normalize(vN),normalize(vec3(0.3,0.8,0.5)))); gl_FragColor=vec4(vTint.rgb*l, vTint.a*${opacity.toFixed(2)}); }` });
    const meshes = {
      bill: instanced(new THREE.PlaneGeometry(1, 1), billMat, caps.bill, true),
      bubble: instanced(new THREE.IcosahedronGeometry(1, 1), shellMat, caps.bubble, false),
      box: instanced(new THREE.BoxGeometry(1, 1, 1), solid(0.85), caps.box, false),
      cone: instanced(new THREE.ConeGeometry(0.5, 1, 5), solid(0.95), caps.cone, false),
      octa: instanced(new THREE.OctahedronGeometry(1, 0), solid(0.9), caps.octa, false),
    };
    meshes.bill.renderOrder = 62; meshes.bubble.renderOrder = 30;
    return { atlas, meshes, mats: [billMat, shellMat, meshes.box.material, meshes.cone.material, meshes.octa.material] };
  }, [caps.bill, caps.bubble, caps.box, caps.cone, caps.octa]);
  useEffect(() => () => {
    res.atlas.dispose();
    for (const m of Object.values(res.meshes)) { m.geometry.dispose(); m.dispose?.(); }
    for (const m of res.mats) m.dispose();
  }, [res]);

  const scratch = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color(), counts: { bill: 0, bubble: 0, box: 0, cone: 0, octa: 0 },
    seen: {} }), []);
  //  驗收用（只在 ?diag=1）：累計看過哪些造型／類別，讓瀏覽器 gate 驗「狀態真的有不同表現」。
  useEffect(() => {
    if (!diagnosticsEnabled()) return undefined;
    window.__HERO_STATUS_FX_DIAG = () => ({ seen: { ...scratch.seen }, counts: { ...scratch.counts } });
    return () => { delete window.__HERO_STATUS_FX_DIAG; };
  }, [scratch]);

  useFrame(({ camera, clock }) => {
    const { o, c, counts } = scratch;
    for (const k in counts) counts[k] = 0;
    const now = reduced ? 0 : clock.elapsedTime;
    const put = (pool, x, y, z, sx, sy, sz, hex, alpha, opts = {}) => {
      const mesh = res.meshes[pool];
      if (counts[pool] >= caps[pool]) return;
      const i = counts[pool]++;
      o.position.set(x, y, z);
      if (opts.billboard) o.quaternion.copy(camera.quaternion);
      else o.rotation.set(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
      o.scale.set(sx, sy, sz); o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      c.set(hex);
      const t = mesh.geometry.attributes.tint;
      t.array[i * 4] = c.r; t.array[i * 4 + 1] = c.g; t.array[i * 4 + 2] = c.b; t.array[i * 4 + 3] = alpha;
      if (opts.cell !== undefined) mesh.geometry.attributes.cell.array[i] = opts.cell;
    };
    for (const h of frameRef?.current?.heroes ?? []) {
      if (!h.alive || h.fogHidden || !h.world || !(h.statusEffects?.length)) continue;
      const x = h.world.x, z = h.world.z, y0 = GROUND_Y;
      const list = sortedStatuses(h.statusEffects);
      const fade = (e) => Math.min(1, Math.max(0.25, (e.remaining ?? 1) / 0.5));   // 最後 0.5 秒淡出
      const seen = new Set();
      let icons = 0;
      const seed = (h.id.length * 1.7) % 6.28;
      for (const e of list) {
        const meta = statusMetaOf(e.id);
        if (!meta.fx || seen.has(meta.fx)) continue;
        seen.add(meta.fx);
        scratch.seen[`${meta.cat}:${meta.fx}`] = (scratch.seen[`${meta.cat}:${meta.fx}`] ?? 0) + 1;
        const a = fade(e), col = meta.color;
        switch (meta.fx) {
          case "bubble": {
            const pulse = 1 + Math.sin(now * 3.2) * 0.035;
            put("bubble", x, y0 + HERO_H * 0.55, z, HERO_R * 1.55 * pulse, HERO_H * 0.72 * pulse, HERO_R * 1.55 * pulse, col, 0.85 * a, { ry: now * 0.4 });
            break;
          }
          case "plates":
            for (let k = 0; k < 3; k++) {
              const ang = now * 1.6 + seed + k * 2.094;
              put("box", x + Math.cos(ang) * HERO_R * 1.25, y0 + HERO_H * 0.55, z + Math.sin(ang) * HERO_R * 1.25,
                0.12 * S, HERO_H * 0.42, HERO_R * 0.62, col, 0.8 * a, { ry: -ang });
            }
            break;
          case "streaks": {
            const f = Number.isFinite(h.facing) ? h.facing : 0;
            for (let k = 0; k < 3; k++) {
              const side = (k - 1) * HERO_R * 0.55, back = HERO_R * (1.1 + k * 0.25) + (reduced ? 0 : (now * 6 + k) % 1 * HERO_R * 0.6);
              put("box", x - Math.sin(f) * back + Math.cos(f) * side, y0 + HERO_H * (0.3 + k * 0.15), z - Math.cos(f) * back - Math.sin(f) * side,
                0.06 * S, 0.06 * S, HERO_R * 1.1, col, 0.55 * a, { ry: f });
            }
            break;
          }
          case "embers":
            for (let k = 0; k < 6; k++) {
              const life = reduced ? 0.5 : (now * 0.9 + k / 6) % 1;
              const ang = seed + k * 1.05;
              put("bill", x + Math.cos(ang) * HERO_R * 0.8, y0 + HERO_H * (0.25 + life * 0.95), z + Math.sin(ang) * HERO_R * 0.8,
                0.55 * S, 0.55 * S, 1, col, (1 - life) * 0.9 * a, { billboard: true, cell: CELL.dot });
            }
            break;
          case "frost":
            for (let k = 0; k < 5; k++) {
              const ang = now * 0.8 + seed + k * 1.2566;
              put("octa", x + Math.cos(ang) * HERO_R * 1.05, y0 + 0.25 * S + (k % 2) * 0.2 * S, z + Math.sin(ang) * HERO_R * 1.05,
                0.2 * S, 0.42 * S, 0.2 * S, col, 0.9 * a, { ry: ang });
            }
            break;
          case "flames":
            for (let k = 0; k < 3; k++) {
              const ang = seed + k * 2.094, flick = reduced ? 1 : 0.85 + Math.sin(now * 13 + k) * 0.15;
              put("bill", x + Math.cos(ang) * HERO_R * 0.5, y0 + HERO_H * (0.45 + k * 0.12), z + Math.sin(ang) * HERO_R * 0.5,
                0.7 * S, 1.1 * S * flick, 1, col, 0.9 * a, { billboard: true, cell: CELL.flame });
            }
            break;
          case "spikes":
            for (let k = 0; k < 6; k++) {
              const ang = seed + k * 1.047, rise = 1;
              put("cone", x + Math.cos(ang) * HERO_R * 0.95, y0 + 0.35 * S * rise, z + Math.sin(ang) * HERO_R * 0.95,
                0.28 * S, 0.8 * S * rise, 0.28 * S, col, 0.95 * a, { rx: Math.cos(ang) * 0.35, rz: -Math.sin(ang) * 0.35 });
            }
            break;
          case "stars":
            for (let k = 0; k < 3; k++) {
              const ang = now * 4.2 + k * 2.094;
              put("bill", x + Math.cos(ang) * HERO_R * 0.75, y0 + ICON_Y - 1.2 * S, z + Math.sin(ang) * HERO_R * 0.75,
                0.85 * S, 0.85 * S, 1, col, a, { billboard: true, cell: CELL.star });
            }
            break;
          default: break;
        }
        //  頭頂圖示：控制 ＞ 標記 ＞ 其餘；最多 2 個並排，避免頭上一排字。
        if (meta.icon && meta.fx !== "stars" && icons < 2) {
          const bob = reduced ? 0 : Math.sin(now * 2.4 + seed) * 0.12 * S;
          const spin = meta.icon === "mark" && !reduced ? 1 + Math.sin(now * 5) * 0.08 : 1;
          put("bill", x + (icons - 0.5) * 1.3 * S * (list.length > 1 ? 1 : 0), y0 + ICON_Y + bob, z,
            1.25 * S * spin, 1.25 * S * spin, 1, meta.color, a, { billboard: true, cell: CELL[meta.icon] });
          icons++;
        }
      }
    }
    for (const [k, mesh] of Object.entries(res.meshes)) {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.tint.needsUpdate = true;
      if (mesh.geometry.attributes.cell) mesh.geometry.attributes.cell.needsUpdate = true;
    }
  });

  return (
    <group name="hero-status-fx" userData={{ part: "hero-status-fx" }}>
      {Object.entries(res.meshes).map(([k, mesh]) => <primitive key={k} object={mesh} />)}
    </group>
  );
}
