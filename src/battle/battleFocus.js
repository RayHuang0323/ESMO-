// ============================================================================
//  battle/battleFocus.js — 戰鬥焦點計算（純 JS，無 React/three）
//  以 snapshot 推導「鏡頭該看哪」：資源團 > 最大交戰聚類 > 場中心。
//  與引擎內部 hot 概念平行，但完全在呈現層獨立計算，不改引擎。
//  回傳 { x, y, intensity }：x/y 為 0..100 邏輯座標；intensity 0..1 供 zoom 用。
// ============================================================================

import { dist } from "../gameData.js";
import { objectivePitOf } from "../platform/contracts/objectiveLayout.js";

const FIGHT_R = 8;
const MELEE_R = 3.5;
const ACTIVE_FX_WINDOW = 1.6;

export function computeFocus(snap) {
  const alive = (snap.players ?? []).filter((p) => !p.dead);
  const recent = (snap.fx ?? []).filter((f) =>
    f.sourceId && f.targetId && (snap.ts ?? 0) - (f.at ?? -Infinity) <= ACTIVE_FX_WINDOW);
  const activePair = (a, b) => recent.some((f) =>
    (f.sourceId === a.id && f.targetId === b.id) || (f.sourceId === b.id && f.targetId === a.id));

  // Each candidate is an opposing pair. A broad proximity cluster used to average
  // bystanders into the frame, even when the actual melee was elsewhere.
  let best = null;
  for (const a of alive) {
    for (const b of alive) {
      if (a.side === b.side) continue;
      const gap = dist(a.pos, b.pos);
      if (gap > FIGHT_R) continue;
      if (gap > MELEE_R && !activePair(a, b)) continue;
      const midpoint = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 };
      const nearby = alive.filter((p) => dist(p.pos, midpoint) <= FIGHT_R);
      const bursts = recent.filter((f) => nearby.some((p) => p.id === f.sourceId)
        && nearby.some((p) => p.id === f.targetId) && f.feedback === "skill").length;
      const score = 2 + (gap <= MELEE_R ? 3 : 0) + (activePair(a, b) ? 3 : 0)
        + Math.min(4, Math.max(0, nearby.length - 2))
        + Math.min(3, bursts) + (1 - Math.min(a.hp ?? 1, b.hp ?? 1)) * 2;
      if (!best || score > best.score || (score === best.score && `${a.id}:${b.id}` < best.key)) {
        best = { ...midpoint, intensity: Math.min(1, score / 12), score,
          key: `${a.id}:${b.id}`, kind: "fight" };
      }
    }
  }
  if (best) return best;

  // Only a live objective contest is a camera target. A pit with merely one
  // visitor on each side is not automatically more important than a fight.
  //  v16 Objective Layout：坑位讀本場 snapshot 的配置（SWAPPED 時巨龍在上方坑）
  for (const [key, pit] of [["baron", objectivePitOf(snap, "baron")], ["dragon", objectivePitOf(snap, "dragon")]]) {
    if (!snap[key]?.alive) continue;
    const near = alive.filter((p) => dist(p.pos, pit) < 9);
    if (near.length >= 2 && near.some((p) => p.side !== near[0].side))
      return { x: pit.x, y: pit.y, intensity: Math.min(1, near.length / 6), score: 2, key, kind: "objective" };
  }

  // Idle: anchor on one real hero, never an average point in empty terrain.
  const blue = alive.filter((p) => p.side === "blue");
  if (blue.length) {
    const dragonPit = objectivePitOf(snap, "dragon");
    const hero = blue.slice().sort((a, b) => dist(a.pos, dragonPit) - dist(b.pos, dragonPit)
      || String(a.id).localeCompare(String(b.id)))[0];
    return { x: hero.pos.x, y: hero.pos.y, intensity: 0, score: 0, key: hero.id, kind: "roam" };
  }
  const hero = alive[0];
  return hero ? { x: hero.pos.x, y: hero.pos.y, intensity: 0, score: 0, key: hero.id, kind: "roam" }
    : { x: 50, y: 50, intensity: 0, score: 0, key: "center", kind: "roam" };
}

// ── Sprint07 導播焦點：事件優先 → 資源/交戰 → 重心（純函數，Node 可驗）─────────
//  events：battleStore.events；nowTs：目前快照時間
//  優先序：VICTORY(鎖主堡) > ACE/MULTI_KILL(4s) > TOWER_DESTROYED(3s) > computeFocus
const EVENT_HOLD = { VICTORY: 9999, ACE: 2, MULTI_KILL: 2.5, FIRST_BLOOD: 2.5, KILL: 2.2,
  TOWER_DESTROYED: 2.5, DRAGON_SLAIN: 2.5, BARON_SLAIN: 2.5 };
export function computeSpectatorFocus(snap, events = []) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const hold = EVENT_HOLD[ev.type];
    if (!hold) continue;
    if (snap.ts - ev.t > hold) break;          // 事件已過期（events 時間序，往前只會更舊）
    if (ev.type === "VICTORY") {
      const nexus = Object.values(snap.towers).find((t) => t.lane === "nexus" && t.hp <= 0) || Object.values(snap.towers).find((t) => t.lane === "nexus");
      if (nexus) return { x: nexus.pos.x, y: nexus.pos.y, intensity: 1, score: 20, key: "victory", kind: "event" };
    }
    if (ev.pos) return { x: ev.pos.x, y: ev.pos.y,
      intensity: ev.type === "ACE" || ev.type === "MULTI_KILL" ? 1 : 0.75,
      score: 14, key: `${ev.type}:${ev.id ?? ev.t}`, kind: "event" };
  }
  return computeFocus(snap);
}
