// ============================================================================
//  battle/battleFocus.js — 戰鬥焦點計算（純 JS，無 React/three）
//  以 snapshot 推導「鏡頭該看哪」：資源團 > 最大交戰聚類 > 場中心。
//  與引擎內部 hot 概念平行，但完全在呈現層獨立計算，不改引擎。
//  回傳 { x, y, intensity }：x/y 為 0..100 邏輯座標；intensity 0..1 供 zoom 用。
// ============================================================================

import { dist, PITS } from "../gameData.js";

const CLUSTER_R = 14;   // 聚類半徑（與引擎 hot 判定同尺度）

export function computeFocus(snap) {
  const alive = snap.players.filter((p) => !p.dead);

  // 1) 資源坑爭奪優先（龍/巴龍存活且坑邊有雙方）
  for (const [key, pit] of [["baron", PITS.baron], ["dragon", PITS.dragon]]) {
    if (!snap[key].alive) continue;
    const b = alive.filter((p) => p.side === "blue" && dist(p.pos, pit) < 9).length;
    const r = alive.filter((p) => p.side === "red" && dist(p.pos, pit) < 9).length;
    if (b + r >= 2) return { x: pit.x, y: pit.y, intensity: Math.min(1, (b + r) / 6) };
  }

  // 2) 最大交戰聚類（含雙方成員的最大群）
  let best = null;
  for (const a of alive) {
    const near = alive.filter((b) => dist(a.pos, b.pos) < CLUSTER_R);
    const hasEnemy = near.some((b) => b.side !== a.side);
    if (!hasEnemy || near.length < 2) continue;
    if (!best || near.length > best.count) {
      best = {
        x: near.reduce((s, p) => s + p.pos.x, 0) / near.length,
        y: near.reduce((s, p) => s + p.pos.y, 0) / near.length,
        count: near.length,
      };
    }
  }
  if (best) return { x: best.x, y: best.y, intensity: Math.min(1, best.count / 10) };

  // 3) 無交戰：藍方存活重心（跟著我方隊伍），再退回場中心
  const blue = alive.filter((p) => p.side === "blue");
  if (blue.length) {
    return { x: blue.reduce((s, p) => s + p.pos.x, 0) / blue.length, y: blue.reduce((s, p) => s + p.pos.y, 0) / blue.length, intensity: 0 };
  }
  return { x: 50, y: 50, intensity: 0 };
}

// ── Sprint07 導播焦點：事件優先 → 資源/交戰 → 重心（純函數，Node 可驗）─────────
//  events：battleStore.events；nowTs：目前快照時間
//  優先序：VICTORY(鎖主堡) > ACE/MULTI_KILL(4s) > TOWER_DESTROYED(3s) > computeFocus
const EVENT_HOLD = { VICTORY: 9999, ACE: 4, MULTI_KILL: 4, TOWER_DESTROYED: 3, DRAGON_SLAIN: 3, BARON_SLAIN: 3 };
export function computeSpectatorFocus(snap, events = []) {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const hold = EVENT_HOLD[ev.type];
    if (!hold) continue;
    if (snap.ts - ev.t > hold) break;          // 事件已過期（events 時間序，往前只會更舊）
    if (ev.type === "VICTORY") {
      const nexus = Object.values(snap.towers).find((t) => t.lane === "nexus" && t.hp <= 0) || Object.values(snap.towers).find((t) => t.lane === "nexus");
      if (nexus) return { x: nexus.pos.x, y: nexus.pos.y, intensity: 1 };
    }
    if (ev.pos) return { x: ev.pos.x, y: ev.pos.y, intensity: ev.type === "ACE" || ev.type === "MULTI_KILL" ? 1 : 0.75 };
  }
  return computeFocus(snap);
}
