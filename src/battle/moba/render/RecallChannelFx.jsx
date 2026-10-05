// ============================================================================
//  battle/moba/render/RecallChannelFx.jsx — 回城引導特效（現場對戰）
//
//  資料（全部是引擎既有輸出，見 presentation/combatFeedback.js `recallViewOf`）：
//    players[].rc     引導剩餘秒數（>0 ＝ 正在引導）→ 進度 = 1 − rc / rules.recallChannelT
//    recallEvents[]   start／cancel／done（done 帶傳送起點 from）
//  ⇒ 開始、取消、完成都跟引擎同一格同步；**沒有任何計時器自己在跑回城**。
//
//  畫面：
//    引導中  地面符文環（緩轉）＋外圈 12 格進度刻度（逐格點亮）＋光柱由淡轉亮、末段收束變細
//    完成    起點留一個外擴光環＋短光柱（0.7 秒）；英雄本身已經被引擎傳回泉水
//    取消    符文環變紅、外擴碎裂淡出（0.45 秒）
//  ⚠ 迷霧中看不見的敵方英雄：不畫（不洩漏「對方在回城」）。
//  ⚠ Replay frame 沒有 rc／recallEvents ⇒ 只在現場對戰掛。
// ============================================================================
import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "../../../useGameStore.js";
import { WORLD_SCALE, simToWorld } from "../map/coordinateMapping.js";
import { LAYER_Y } from "../map/mapVisualStyle.js";
import { recallViewOf, newRecallEvents } from "../presentation/combatFeedback.js";
import { diagnosticsEnabled } from "./runtimeDiagnostics.js";

const S = WORLD_SCALE;
const GROUND_Y = (Number.isFinite(LAYER_Y.lane_surface) ? LAYER_Y.lane_surface : 0) + 0.4;
const TICKS = 12;
const SLOTS = 10;          // 十名英雄各一組
const BURSTS = 6;          // 完成／取消的一次性特效
const TEAM = { blue: 0x60a5fa, red: 0xf87171 };
const RUNE_R = 2.6 * S;

function makeRuneTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.translate(128, 128);
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 88, 0, Math.PI * 2); g.stroke();
  //  內圈六芒星＋八個符文刻點
  g.lineWidth = 4; g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = (i * 2 * Math.PI) / 6 * 2; const r = 80; g[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); }
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.save(); g.rotate(a); g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(-4, -104, 8, 14); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const visibleHero = (frame, id) => {
  const h = frame?.heroes?.find((x) => x.id === id);
  return h && h.alive && !h.fogHidden ? h : null;
};

export default function RecallChannelFx({ frameRef, source = null, enabled = true }) {
  const active = enabled && !source;
  const res = useMemo(() => {
    const rune = makeRuneTexture();
    const mk = (o) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...o });
    const geo = {
      rune: new THREE.PlaneGeometry(RUNE_R * 2, RUNE_R * 2),
      tick: new THREE.PlaneGeometry(0.34 * S, 0.9 * S),
      column: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
      ring: new THREE.RingGeometry(0.86, 1, 48),
    };
    const slot = () => ({
      rune: mk({ map: rune, opacity: 0 }), tick: mk({ opacity: 0 }), column: mk({ opacity: 0 }),
    });
    const burst = () => ({ ring: mk({ opacity: 0 }), column: mk({ opacity: 0 }), born: -1, kind: "done", x: 0, z: 0, color: 0xffffff });
    return { rune, geo, slots: Array.from({ length: SLOTS }, slot), bursts: Array.from({ length: BURSTS }, burst) };
  }, []);
  useEffect(() => () => {
    res.rune.dispose();
    Object.values(res.geo).forEach((g) => g.dispose());
    res.slots.forEach((s) => Object.values(s).forEach((m) => m.dispose()));
    res.bursts.forEach((b) => { b.ring.dispose(); b.column.dispose(); });
  }, [res]);

  const slotRefs = useRef([]);   // [{ group, rune, ticks:[], column }]
  const burstRefs = useRef([]);  // [{ ring, column }]
  const st = useRef({ seen: new Set(), primed: false, clock: 0, lastTs: null });
  //  驗收用計數（只有 ?diag=1／?shot= 才掛）：畫面上正在畫的引導數 vs snapshot 裡可見的引導數
  const diag = useMemo(() => (diagnosticsEnabled() ? { drawn: 0, expected: 0, mismatchFrames: 0, frames: 0, maxDrawn: 0, bursts: { done: 0, cancel: 0 } } : null), []);
  useEffect(() => {
    if (!diag) return undefined;
    window.__ESMO_RECALL_FX = () => ({ ...diag, bursts: { ...diag.bursts } });
    return () => { delete window.__ESMO_RECALL_FX; };
  }, [diag]);

  useFrame((_, delta) => {
    const s = st.current;
    s.clock += Math.min(delta, 0.1);
    const snap = active ? useGameStore.getState().snapshot : null;
    const frame = frameRef.current;
    const view = snap ? recallViewOf(snap) : { channels: [], events: [] };
    if (snap && s.lastTs !== null && snap.ts < s.lastTs) { s.seen = new Set(); s.primed = false; }   // 新的一場
    if (snap) s.lastTs = snap.ts;

    // ── 一次性：完成／取消 ──────────────────────────────────────────────
    const fresh = newRecallEvents(view.events, s.seen);
    if (!s.primed) s.primed = true;          // 掛載當下已經存在的歷史事件只記錄、不重播
    else for (const e of fresh) {
      if (e.phase === "start") continue;
      let w = null;
      if (e.phase === "done" && e.from) w = simToWorld(e.from, 0);
      else { const h = visibleHero(frame, e.playerId); if (h) w = h.world; }
      const hero = frame?.heroes?.find((x) => x.id === e.playerId);
      if (!w || hero?.fogHidden) continue;
      //  完成時英雄已在泉水：起點是否在視野內，以迷霧來源判斷
      if (frame?.fog?.sources && hero?.team !== frame.fog.side
        && !frame.fog.sources.some((q) => (w.x - q.x) ** 2 + (w.z - q.z) ** 2 <= q.r * q.r)) continue;
      const b = res.bursts.reduce((a, c) => (a.born <= c.born ? a : c));
      b.born = s.clock; b.kind = e.phase; b.x = w.x; b.z = w.z;
      b.color = e.phase === "cancel" ? 0xef4444 : (TEAM[hero?.team] ?? 0xffffff);
      if (diag) diag.bursts[e.phase] += 1;
    }

    // ── 引導中 ───────────────────────────────────────────────────────────
    const byId = new Map(view.channels.map((c) => [c.id, c]));
    const order = (frame?.heroes ?? []).slice(0, SLOTS);
    for (let i = 0; i < SLOTS; i++) {
      const r = slotRefs.current[i];
      if (!r?.group) continue;
      const h = order[i];
      const c = h ? byId.get(h.id) : null;
      if (!c || !visibleHero(frame, h.id)) { r.group.visible = false; continue; }
      const m = res.slots[i];
      const color = TEAM[h.team] ?? 0xffffff;
      const p = c.progress;
      r.group.visible = true;
      r.group.position.set(h.world.x, GROUND_Y, h.world.z);
      r.rune.rotation.z = s.clock * 0.9;
      m.rune.color.setHex(color); m.rune.opacity = 0.35 + 0.45 * p;
      m.tick.color.setHex(color); m.tick.opacity = 0.95;
      const lit = Math.ceil(p * TICKS);
      r.ticks.forEach((t, k) => { if (t) t.visible = k < lit; });
      //  光柱：越接近完成越亮，最後 20% 收束變細
      const squeeze = p > 0.8 ? 1 - (p - 0.8) / 0.2 * 0.65 : 1;
      const radius = 1.25 * S * squeeze;
      const height = 9 * S * (0.45 + 0.55 * p);
      r.column.scale.set(radius, height, radius);
      r.column.position.y = height / 2;
      m.column.color.setHex(color);
      m.column.opacity = (0.12 + 0.38 * p) * (0.85 + 0.15 * Math.sin(s.clock * 9));
    }

    if (diag && snap) {
      const drawn = slotRefs.current.filter((r) => r?.group?.visible).length;
      const expected = view.channels.filter((c) => visibleHero(frame, c.id) && order.some((h) => h.id === c.id)).length;
      diag.frames += 1; diag.drawn = drawn; diag.expected = expected; diag.maxDrawn = Math.max(diag.maxDrawn, drawn);
      if (drawn !== expected) diag.mismatchFrames += 1;
    }
    // ── 一次性特效播放 ──────────────────────────────────────────────────
    for (let i = 0; i < BURSTS; i++) {
      const r = burstRefs.current[i];
      const b = res.bursts[i];
      if (!r?.ring) continue;
      const life = b.kind === "cancel" ? 0.45 : 0.7;
      const age = b.born < 0 ? 1 : (s.clock - b.born) / life;
      if (age >= 1) { r.ring.visible = false; r.column.visible = false; continue; }
      const k = 1 - age;
      r.ring.visible = true;
      r.ring.position.set(b.x, GROUND_Y + 0.05, b.z);
      const ringR = RUNE_R * (b.kind === "cancel" ? 1 + age * 0.9 : 0.6 + age * 2.2);
      r.ring.scale.set(ringR, ringR, ringR);
      b.ring.color.setHex(b.color); b.ring.opacity = 0.9 * k;
      r.column.visible = b.kind === "done";
      if (r.column.visible) {
        const hgt = 12 * S * (0.6 + 0.4 * k);
        r.column.position.set(b.x, GROUND_Y + hgt / 2, b.z);
        r.column.scale.set(0.9 * S * k + 0.1, hgt, 0.9 * S * k + 0.1);
        b.column.color.setHex(b.color); b.column.opacity = 0.7 * k;
      }
    }
  });

  if (!active) return null;
  return (
    <group userData={{ part: "recall-fx" }}>
      {res.slots.map((m, i) => (
        <group key={`s${i}`} visible={false}
          ref={(el) => { (slotRefs.current[i] ??= { ticks: [] }).group = el; }}
          userData={{ part: "recall-channel" }}>
          <mesh geometry={res.geo.rune} material={m.rune} rotation={[-Math.PI / 2, 0, 0]} renderOrder={13}
            ref={(el) => { (slotRefs.current[i] ??= { ticks: [] }).rune = el; }} frustumCulled={false} />
          {Array.from({ length: TICKS }, (_, k) => {
            const a = (k / TICKS) * Math.PI * 2;
            return (
              <mesh key={k} geometry={res.geo.tick} material={m.tick} renderOrder={13} frustumCulled={false}
                position={[Math.sin(a) * RUNE_R * 1.18, 0.06, -Math.cos(a) * RUNE_R * 1.18]}
                rotation={[-Math.PI / 2, 0, -a]}
                ref={(el) => { ((slotRefs.current[i] ??= { ticks: [] }).ticks ??= [])[k] = el; }} />
            );
          })}
          <mesh geometry={res.geo.column} material={m.column} renderOrder={14} frustumCulled={false}
            ref={(el) => { (slotRefs.current[i] ??= { ticks: [] }).column = el; }} />
        </group>
      ))}
      {res.bursts.map((b, i) => (
        <group key={`b${i}`}>
          <mesh geometry={res.geo.ring} material={b.ring} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={13} frustumCulled={false}
            ref={(el) => { (burstRefs.current[i] ??= {}).ring = el; }} userData={{ part: "recall-burst" }} />
          <mesh geometry={res.geo.column} material={b.column} visible={false} renderOrder={14} frustumCulled={false}
            ref={(el) => { (burstRefs.current[i] ??= {}).column = el; }} />
        </group>
      ))}
    </group>
  );
}
