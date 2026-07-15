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
    this.seenSpells = new Set();    // S29B1：已轉為事件的召喚師技能（spellLog id）
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
    const push = (type, side, text, pos = null, data = null) =>
      out.push({ id: this._eid++, t: snap.ts, type, side, text, pos, data });

    // ── 擊殺 / First Blood / 連殺（讀真實 feed，附上快照時間）────────────
    const CTX_ZH = { gank: "Gank", ambush: "埋伏", pick: "抓單", teamfight: "團戰", objective: "目標戰", towerDive: "越塔", chase: "追擊" };
    for (const f of [...snap.feed].reverse()) {           // feed 是 unshift，反轉成時間序
      if (this.seenFeed.has(f.id)) continue;
      this.seenFeed.add(f.id);
      const ctxTag = f.ctx?.type && CTX_ZH[f.ctx.type] ? `【${CTX_ZH[f.ctx.type]}】` : "";
      const ast = (f.assists?.length ? `（助攻 ${f.assists.map((x) => x.toUpperCase()).join(",")}）` : "") + ctxTag;
      // S29B1：ctx = 引擎的 killContext（v3 才有；原封傳遞，不重新分類）
      const kd = { killer: f.killer, victim: f.victim, assists: f.assists || [], ...(f.ctx ? { ctx: f.ctx } : {}) };
      if (!this.firstBlood) {
        this.firstBlood = true;
        push("FIRST_BLOOD", f.side, `FIRST BLOOD! ${f.killer.toUpperCase()} 擊殺 ${f.victim.toUpperCase()}${ast}`, f.vpos, kd);
      } else {
        push("KILL", f.side, `${f.killer.toUpperCase()} 擊殺 ${f.victim.toUpperCase()}${ast}`, f.vpos, kd);
      }
      const w = (this.killWindows.get(f.killer) || []).filter((t) => snap.ts - t <= MULTI_WINDOW);
      w.push(snap.ts);
      this.killWindows.set(f.killer, w);
      if (w.length >= 2 && MULTI_NAME[Math.min(w.length, 5)]) {
        push("MULTI_KILL", f.side, `${MULTI_NAME[Math.min(w.length, 5)]}! ${f.killer.toUpperCase()}`, f.vpos, { killer: f.killer, streak: Math.min(w.length, 5) });
      }
    }

    if (prev) {
      // ── 塔被摧毀（hp 由 >0 跨到 <=0；破壞方 = 塔的對面）──────────────
      for (const [key, tw] of Object.entries(snap.towers)) {
        const before = prev.towers[key];
        if (before && before.hp > 0 && tw.hp <= 0) {
          const destroyer = tw.side === "blue" ? "red" : "blue";
          const label = tw.lane === "nexus" ? "主堡" : `${LANE_NAME[tw.lane]} ${3 - tw.tier} 塔`;
          push("TOWER_DESTROYED", destroyer, `${tw.side === "blue" ? "藍方" : "紅方"}${label} 被摧毀`, tw.pos, { lane: tw.lane, tier: tw.tier, victimSide: tw.side, isNexus: tw.lane === "nexus" });
        }
      }
      // ── 龍 / 巴龍（alive 由 true → false）。歸屬：S29B1 起 snapshot.objectives
      //    帶引擎真實 killerTeam（含 Smite 搶奪）⇒ 優先使用；舊快照（無 objectives）
      //    退回「坑邊人數多者」重演。
      const objOf = (id) => (snap.objectives ?? []).find((o) => o.id === id) ?? null;
      for (const [key, name] of [["dragon", "Dragon"], ["baron", "Baron"]]) {
        if (prev[key].alive && !snap[key].alive && snap[key].respawn > 0) {
          const pit = PITS[key];
          let side = objOf(key)?.killerTeam ?? null;
          if (!side && !objOf(key)) {
            const near = (s) => prev.players.filter((p) => p.side === s && !p.dead && dist(p.pos, pit) < 9).length;
            const b = near("blue"), r = near("red");
            side = b > r ? "blue" : r > b ? "red" : null;
          }
          push(key === "dragon" ? "DRAGON_SLAIN" : "BARON_SLAIN", side, `${name} 被${side === "blue" ? "藍方" : side === "red" ? "紅方" : ""}擊殺`, pit,
            objOf(key) ? { killerTeam: side, participants: objOf(key).participants } : null);
        }
        // S29B1：目標出生事件（出生 → 集結 → 擊殺 → 重生的完整生命週期可回放）
        if (!prev[key].alive && snap[key].alive) {
          push("OBJECTIVE_SPAWN", null, `${name} 已刷新`, PITS[key], { objective: key });
        }
      }
      // ── S29B1：召喚師技能事件（引擎 spellLog 尾端；原封轉為 Timeline 事件）──
      if (snap.spellEvents) {
        for (const se of snap.spellEvents) {
          if (this.seenSpells.has(se.id)) continue;
          this.seenSpells.add(se.id);
          const zh = se.spell === "flash" ? "閃現" : "懲戒";
          const rz = { escape: "逃生", chase: "追擊", engage: "切入" }[se.reason] ?? se.reason;
          push("SPELL_USED", se.side, `${se.playerId.toUpperCase()} 使用${zh}（${rz}）`, se.from, { playerId: se.playerId, spell: se.spell, reason: se.reason });
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
