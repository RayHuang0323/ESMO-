// ============================================================================
//  battle/moba/render/CombatFeedbackRuntime.jsx — 浮動戰鬥數字 ＋ +Gold（現場對戰）
//
//  資料：`presentation/combatFeedback.js` 由相鄰兩格引擎 snapshot 推導（hp×mhp、護盾量、
//  累計收入、中立物件與塔的 hp×maxHp）。本元件只負責「在哪裡、畫成什麼樣子」。
//  ⚠ 不讀任何傷害公式；數字全部是 state 的差。
//  ⚠ 只在現場對戰掛（`source` 為 null）：Replay frame 沒有 mhp／護盾量，不造假。
//  ⚠ 迷霧：看不見的敵方英雄、看不見位置上的野怪／塔一律不跳字（不洩漏資訊）。
//
//  效能：固定 28 個 Sprite 的物件池，每個自帶一張小 CanvasTexture，產生數字時重畫，
//  不在戰鬥中配置新的 texture／material；每幀只改 position／opacity／scale。
// ============================================================================
import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "../../../useGameStore.js";
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import {
  deriveFeedbackEvents, createFeedbackAggregator, FEEDBACK_POLICY,
} from "../presentation/combatFeedback.js";
import { diagnosticsEnabled } from "./runtimeDiagnostics.js";
import { pixelsPerWorld, isCompactViewport, overheadScaleOf, nameplateScaleOf, floatWorldHeight } from "./overheadScale.js";

const S = WORLD_SCALE;
const GROUND_Y = Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0;
const POOL = FEEDBACK_POLICY.maxActive;
const CANVAS_W = 192, CANVAS_H = 64;

/** 顏色與尺寸（世界單位）。重要傷害放大且偏橘，補血綠、護盾淡藍、金錢金色。 */
const LOOK = Object.freeze({
  //  h ＝ 世界尺寸下限（鏡頭拉近時用）；畫面像素下限見 overheadScale.FLOAT_PX
  damageHero:  { fill: "#fff4f0", stroke: "#7f1d1d", h: 1.05 * S },
  damageMajor: { fill: "#ffb347", stroke: "#7c2d12", h: 1.55 * S },
  damageOther: { fill: "#f1f5f9", stroke: "#1e293b", h: 0.95 * S },
  heal:        { fill: "#4ade80", stroke: "#14532d", h: 1.0 * S, prefix: "+" },
  shield:      { fill: "#93c5fd", stroke: "#1e3a8a", h: 0.95 * S, prefix: "+" },
  gold:        { fill: "#facc15", stroke: "#713f12", h: 1.05 * S, prefix: "+", coin: true },
});
const LIFE = { damage: 0.85, major: 1.15, heal: 0.95, shield: 0.95, gold: 1.25 };
/** 起始高度：英雄頭頂血條上方；塔與中立物件更高。 */
const LIFT = { hero: 6.4 * S, neutral: 4.2 * S, tower: 9.5 * S };

function lookKeyOf(e) {
  if (e.kind === "damage") return e.major ? "damageMajor" : (e.targetKind === "hero" ? "damageHero" : "damageOther");
  return e.kind;
}
const lookOf = (e) => LOOK[lookKeyOf(e)];
/** 英雄頭頂血條的世界寬度／高度（與 MobaRuntimeHeroes 的 HERO 同值）——浮字要起在放大後的名牌上方。 */
const HERO_BAR_W = 3.4 * S, HERO_BAR_H = 0.42 * S, HERO_BAR_Y = 5.0 * S, HERO_PLATE_H = 0.68 * S;

function drawLabel(ctx, text, look) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.font = "900 46px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const x = look.coin ? CANVAS_W / 2 + 14 : CANVAS_W / 2;
  ctx.lineJoin = "round";
  ctx.lineWidth = 8;
  ctx.strokeStyle = look.stroke;
  ctx.strokeText(text, x, CANVAS_H / 2 + 2, CANVAS_W - (look.coin ? 40 : 8));
  ctx.fillStyle = look.fill;
  ctx.fillText(text, x, CANVAS_H / 2 + 2, CANVAS_W - (look.coin ? 40 : 8));
  if (look.coin) {
    const w = Math.min(ctx.measureText(text).width, CANVAS_W - 40);
    const cx = x - w / 2 - 16;
    ctx.beginPath(); ctx.arc(cx, CANVAS_H / 2 + 2, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#facc15"; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = "#713f12"; ctx.stroke();
  }
}

const visibleAt = (frame, w) => !frame?.fog?.sources || frame.fog.sources.some((s) => (w.x - s.x) ** 2 + (w.z - s.z) ** 2 <= s.r * s.r);

/** 目標目前在世界哪裡（英雄跟著內插位置；中立營地成員各自定位）。null ⇒ 不畫。 */
function anchorOf(frame, e) {
  if (e.targetKind === "hero") {
    const h = frame.heroes?.find((x) => x.id === e.targetId);
    if (!h || h.fogHidden) return null;
    return { x: h.world.x, z: h.world.z, lift: LIFT.hero };
  }
  if (e.targetKind === "tower") {
    const s = frame.structures?.find((x) => x.id === e.targetId);
    if (!s || !visibleAt(frame, s.world)) return null;
    return { x: s.world.x, z: s.world.z, lift: LIFT.tower };
  }
  const [oid, mid] = e.targetId.split("/");
  const o = frame.objectives?.find((x) => x.id === oid);
  if (!o) return null;
  const m = mid ? o.members?.find((x) => String(x.id) === mid) : null;
  const w = m?.world ?? o.world;
  if (!w || !visibleAt(frame, w)) return null;
  return { x: w.x, z: w.z, lift: LIFT.neutral };
}

export default function CombatFeedbackRuntime({ frameRef, source = null, enabled = true }) {
  const active = enabled && !source;
  const pool = useMemo(() => Array.from({ length: POOL }, () => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    return { canvas, ctx: canvas.getContext("2d"), texture, material, born: -1, life: 1, kind: "damage", lookKey: "damageHero", targetKind: "hero", x: 0, z: 0, lift: 0, h: 1, drift: 0 };
  }), []);
  const spritesRef = useRef([]);
  const state = useRef({ last: null, agg: createFeedbackAggregator(), seq: 0, clock: 0 });
  //  驗收用計數（只有 ?diag=1／?shot= 才掛到 window；正式對戰不存在）
  const diag = useMemo(() => (diagnosticsEnabled() ? { spawned: { damage: 0, heal: 0, shield: 0, gold: 0, major: 0 }, byTarget: { hero: 0, neutral: 0, tower: 0 }, active: 0, peak: 0, last: [] } : null), []);
  useEffect(() => {
    if (!diag) return undefined;
    window.__ESMO_COMBAT_FEEDBACK = () => JSON.parse(JSON.stringify(diag));
    return () => { delete window.__ESMO_COMBAT_FEEDBACK; };
  }, [diag]);

  useEffect(() => () => pool.forEach((p) => { p.texture.dispose(); p.material.dispose(); }), [pool]);

  const spawn = (e, frame) => {
    const at = anchorOf(frame, e);
    if (!at) return;
    const look = lookOf(e);
    //  取空槽；全滿就取最舊的（重要傷害永遠搶得到）
    let slot = pool.find((p) => p.born < 0);
    if (!slot) slot = pool.reduce((a, b) => (a.born <= b.born ? a : b));
    const prefix = look.prefix ?? "";
    drawLabel(slot.ctx, `${prefix}${e.amount}`, look);
    slot.texture.needsUpdate = true;
    const st = state.current;
    st.seq += 1;
    //  同一目標連續跳字左右錯開，避免疊成一團（決定性：只看序號）
    slot.drift = ((st.seq % 5) - 2) * 0.55 * S;
    slot.born = st.clock;
    slot.life = e.kind === "damage" ? (e.major ? LIFE.major : LIFE.damage) : LIFE[e.kind];
    slot.kind = e.major ? "major" : e.kind;
    slot.x = at.x; slot.z = at.z; slot.lift = at.lift + (e.kind === "gold" ? 1.2 * S : 0);
    slot.h = look.h; slot.lookKey = lookKeyOf(e); slot.targetKind = e.targetKind;
    if (diag) {
      diag.spawned[e.kind] += 1; if (e.major) diag.spawned.major += 1;
      diag.byTarget[e.targetKind] += 1;
      diag.last = [...diag.last.slice(-11), { kind: e.kind, targetKind: e.targetKind, targetId: e.targetId, amount: e.amount, major: !!e.major }];
    }
  };

  useFrame(({ camera, size }, delta) => {
    const st = state.current;
    const ppw = pixelsPerWorld(camera, size);
    const compact = isCompactViewport(size);
    const overheadK = overheadScaleOf(HERO_BAR_W, ppw, compact);
    //  英雄浮字起點：放大後名牌的上緣再往上一點
    const plateK = nameplateScaleOf(HERO_PLATE_H, ppw, compact, overheadK);
    const heroLift = HERO_BAR_Y + HERO_BAR_H * 0.75 * overheadK + HERO_PLATE_H * 1.3 * plateK;
    st.clock += Math.min(delta, 0.1);
    if (active) {
      const snap = useGameStore.getState().snapshot;
      if (snap && snap !== st.last) {
        //  ⚠ 跟自己上一次處理的那一格比，不跟 store.prev 比：一個繪製幀內推了好幾格時才不會漏。
        const prev = st.last;
        st.last = snap;
        if (prev && snap.ts < prev.ts) st.agg = createFeedbackAggregator();   // 新的一場 ⇒ 重置
        else if (prev) {
          const ready = st.agg.push(deriveFeedbackEvents(prev, snap), snap.ts);
          const frame = frameRef.current;
          for (const e of ready) spawn(e, frame);
        }
      }
    }
    const sprites = spritesRef.current;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const sp = sprites[i];
      if (!sp) continue;
      if (p.born < 0) { sp.visible = false; continue; }
      const age = (st.clock - p.born) / p.life;
      if (age >= 1) { p.born = -1; sp.visible = false; continue; }
      //  先往上彈一下再緩升；最後 35% 淡出。重要傷害一開始放大 1.25 倍再回落。
      const h = floatWorldHeight(p.lookKey, p.h, ppw, compact);
      const rise = (1 - (1 - age) ** 2) * h * 1.6;
      const lift = p.targetKind === "hero" ? heroLift + (p.lift - LIFT.hero) : p.lift;
      const pop = p.kind === "major" ? 1 + 0.25 * Math.max(0, 1 - age * 4) : 1 + 0.12 * Math.max(0, 1 - age * 5);
      sp.visible = true;
      sp.position.set(p.x + p.drift * age * (h / p.h), GROUND_Y + lift + rise, p.z);
      sp.scale.set(h * (CANVAS_W / CANVAS_H) * pop, h * pop, 1);
      p.material.opacity = age < 0.65 ? 1 : Math.max(0, 1 - (age - 0.65) / 0.35);
    }
    if (diag) { diag.active = pool.filter((p) => p.born >= 0).length; diag.peak = Math.max(diag.peak, diag.active); }
  });

  if (!active) return null;
  return (
    <group userData={{ part: "combat-feedback" }}>
      {pool.map((p, i) => (
        <sprite key={i} ref={(el) => { spritesRef.current[i] = el; }} material={p.material}
          visible={false} renderOrder={90} frustumCulled={false} userData={{ part: "combat-feedback-text" }} />
      ))}
    </group>
  );
}
