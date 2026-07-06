// ============================================================================
//  battle/battleEvents.js — Battle Presentation Layer：事件推導（純 JS）
//  - 不 import React / three / zustand；不修改 LogicEngine
//  - 以「相鄰兩張 snapshot 的差分」推導 Timeline 事件（塔倒、龍/巴龍、擊殺、
//    First Blood、連殺、ACE、勝利）→ 引擎零改動，多人版收伺服器快照同樣適用
//  - mvpCandidate()：即時 MVP 候選（僅讀 snapshot 的真實 k/d/gold）
//  事件形狀：{ t, type, side|null, text, pos|null }
//    type ∈ FIRST_BLOOD | KILL | MULTI_KILL | ACE | TOWER_DESTROYED |
//           DRAGON_SLAIN | BARON_SLAIN | VICTORY
// ============================================================================

import { dist, PITS, ROLE_NAME } from "../gameData.js";

const MULTI_WINDOW = 10;       // 同一人連殺判定窗（模擬秒）
const MULTI_NAME = { 2: "Double Kill", 3: "Triple Kill", 4: "Quadra Kill", 5: "PENTA KILL" };
const LANE_NAME = { top: "上路", mid: "中路", bot: "下路" };

export class BattleEventTracker {
  constructor() { this.reset(); }
  reset() {
    this.prev = null;
    this.seenFeed = new Set();
    this.killWindows = new Map();   // killerId -> [ts, ...]
    this.firstBlood = false;
    this.aceState = { blue: false, red: false };
    this.victoryEmitted = false;
    this._eid = 1;
  }

  /** 餵入最新 snapshot，回傳「本幀新產生」的事件陣列（可能為空） */
  update(snap) {
    // 新對局偵測（時間倒退）→ 自我重置
    if (this.prev && snap.ts < this.prev.ts) this.reset();
    const prev = this.prev;
    const out = [];
    const push = (type, side, text, pos = null) =>
      out.push({ id: this._eid++, t: snap.ts, type, side, text, pos });

    // ── 擊殺 / First Blood / 連殺（讀真實 feed，附上快照時間）────────────
    for (const f of [...snap.feed].reverse()) {           // feed 是 unshift，反轉成時間序
      if (this.seenFeed.has(f.id)) continue;
      this.seenFeed.add(f.id);
      const ast = f.assists?.length ? `（助攻 ${f.assists.map((x) => x.toUpperCase()).join(",")}）` : "";
      if (!this.firstBlood) {
        this.firstBlood = true;
        push("FIRST_BLOOD", f.side, `FIRST BLOOD! ${f.killer.toUpperCase()} 擊殺 ${f.victim.toUpperCase()}${ast}`, f.vpos);
      } else {
        push("KILL", f.side, `${f.killer.toUpperCase()} 擊殺 ${f.victim.toUpperCase()}${ast}`, f.vpos);
      }
      const w = (this.killWindows.get(f.killer) || []).filter((t) => snap.ts - t <= MULTI_WINDOW);
      w.push(snap.ts);
      this.killWindows.set(f.killer, w);
      if (w.length >= 2 && MULTI_NAME[Math.min(w.length, 5)]) {
        push("MULTI_KILL", f.side, `${MULTI_NAME[Math.min(w.length, 5)]}! ${f.killer.toUpperCase()}`, f.vpos);
      }
    }

    if (prev) {
      // ── 塔被摧毀（hp 由 >0 跨到 <=0；破壞方 = 塔的對面）──────────────
      for (const [key, tw] of Object.entries(snap.towers)) {
        const before = prev.towers[key];
        if (before && before.hp > 0 && tw.hp <= 0) {
          const destroyer = tw.side === "blue" ? "red" : "blue";
          const label = tw.lane === "nexus" ? "主堡" : `${LANE_NAME[tw.lane]} ${3 - tw.tier} 塔`;
          push("TOWER_DESTROYED", destroyer, `${tw.side === "blue" ? "藍方" : "紅方"}${label} 被摧毀`, tw.pos);
        }
      }
      // ── 龍 / 巴龍（alive 由 true → false；歸屬方以引擎同規則重演：坑邊人數多者）──
      for (const [key, name] of [["dragon", "Dragon"], ["baron", "Baron"]]) {
        if (prev[key].alive && !snap[key].alive && snap[key].respawn > 0) {
          const pit = PITS[key];
          const near = (side) => prev.players.filter((p) => p.side === side && !p.dead && dist(p.pos, pit) < 9).length;
          const b = near("blue"), r = near("red");
          const side = b > r ? "blue" : r > b ? "red" : null;
          push(key === "dragon" ? "DRAGON_SLAIN" : "BARON_SLAIN", side, `${name} 被${side === "blue" ? "藍方" : side === "red" ? "紅方" : ""}擊殺`, pit);
        }
      }
      // ── ACE（一方 5 人全滅的「進入瞬間」）──────────────────────────────
      for (const side of ["blue", "red"]) {
        const sq = snap.players.filter((p) => p.side === side);
        const allDead = sq.length > 0 && sq.every((p) => p.dead);
        if (allDead && !this.aceState[side]) push("ACE", side === "blue" ? "red" : "blue", `ACE! ${side === "blue" ? "藍方" : "紅方"}全滅`);
        this.aceState[side] = allDead;
      }
    }

    // ── 勝利（over 首次為 true）────────────────────────────────────────
    if (snap.over && !this.victoryEmitted) {
      this.victoryEmitted = true;
      push("VICTORY", snap.winner, "VICTORY!");
    }

    this.prev = snap;
    return out;
  }
}

// ── Rating / 即時 MVP（呈現層暫定公式；輸入全為 snapshot 真實欄位）──────────
//  rating = k*3 + a*1.5 − d*2 + dmg/800 + heal/1600 + gold/400
//  Sprint03 的正規化評分公式重新同步後應取代此處。
export function playerRating(p) {
  return p.k * 3 + (p.a || 0) * 1.5 - p.d * 2 + (p.dmg || 0) / 800 + (p.heal || 0) / 1600 + (p.gold || 0) / 400;
}
export function participation(p, snap) {
  const teamK = p.side === "blue" ? snap.bK : snap.rK;
  return teamK > 0 ? Math.min(1, (p.k + (p.a || 0)) / teamK) : 0;
}
export function mvpCandidate(snap) {
  let best = null;
  for (const p of snap.players) {
    const score = playerRating(p);
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && (p.gold || 0) > (best.gold || 0))) {
      best = { id: p.id, side: p.side, role: p.role, k: p.k, d: p.d, a: p.a || 0, gold: p.gold || 0, dmg: p.dmg || 0, heal: p.heal || 0, score };
    }
  }
  return best;
}

// ── 呈現層共用小工具 ────────────────────────────────────────────────────
export const towersDestroyedBy = (snap, side) => {
  const enemy = side === "blue" ? "red" : "blue";
  return Object.values(snap.towers).filter((t) => t.side === enemy && t.lane !== "nexus" && t.hp <= 0).length;
};
export const displayName = (p, roster) => roster?.[p.id]?.player ?? p.id.toUpperCase();
export const heroName = (p, roster) => roster?.[p.id]?.hero ?? ROLE_NAME[p.role];
