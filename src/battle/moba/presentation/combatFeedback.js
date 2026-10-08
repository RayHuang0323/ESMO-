// ============================================================================
//  battle/moba/presentation/combatFeedback.js — 戰鬥即時回饋的**事件推導**（純函式）
//
//  ── 資料從哪裡來 ────────────────────────────────────────────────────────────
//  只讀引擎 `snapshot()` 已經輸出的權威 state，相鄰兩格比較：
//    英雄   hp（0–1）× mhp（絕對最大血量）、statusEffects.shield.amount、gold（累計收入）
//    中立   objectives[].hp × maxHp、members[].hp × maxHp（野怪營地成員）
//    塔     towers[].hp × 塔最大血量（引擎同一組常數：TOWER_HP／NEXUS_HP／rules.nexusGuardHp）
//  ⚠ 數字是 **state 的差**，不是 UI 用公式重算傷害：攻擊力、護甲、技能倍率全都不碰。
//  ⚠ 引擎檔（LogicEngine.js／items runtime）一行都沒改 ⇒ 不影響模擬、不需要升 sim version。
//
//  ── 刻意不做的（資料缺口，見 docs/design/MOBA_Combat_Feedback_Polish.md）────────
//    · 小兵：snapshot 只有 hp 比例、沒有絕對最大血量 ⇒ 不顯示數字（不猜）。
//    · 金錢：讀 items 帳本的**來源累計**（canonical ledger，唯讀輸出）；被動來源（passive／tithe）
//      由帳本自己分類，UI 只排除這兩個來源名，不重算任何收入。沒有帳本 ⇒ 不顯示。
//    · Replay：frame 沒有 mhp／護盾量 ⇒ 只在現場對戰推導。
//
//  純函式：不 import React / three / store，不讀時鐘。
// ============================================================================
import { TOWER_HP, NEXUS_HP } from "../../../gameData.js";
import { rulesFor } from "../matchProgression.js";

export const COMBAT_FEEDBACK_VERSION = "CombatFeedback.v1";

export const FEEDBACK_POLICY = Object.freeze({
  /** 同一目標同一種回饋在這段 sim 秒內合併成一個數字（避免每 tick 洗版）。 */
  mergeWindowSec: 0.6,
  /** 金錢另外合併得久一點：對線期小兵收入是一小筆一小筆進來的。 */
  goldMergeSec: 1.2,
  /** 小於這個值的傷害／補血先累積，不單獨跳字（再生、DoT 碎片）。 */
  minDamage: 8,
  minHeal: 15,
  minShield: 10,
  /** 單筆 ≥ 目標最大血量這個比例 ⇒ 強調（字大、顏色亮）。 */
  majorRatio: 0.12,
  majorAbs: 300,
  /** 同時存在的浮字上限（物件池大小）；合併器另以它當「每 sim 秒最多吐出幾個」的顯示預算，
   *  超出的依重要性延後、併進同一目標的下一筆（v20：集火讓團戰更集中，峰值曾到 30）。 */
  maxActive: 28,
});

/** 塔的最大血量：與引擎建塔時用的同一組常數。 */
export function structureMaxHp(lane, rules = rulesFor()) {
  if (lane === "nexus") return NEXUS_HP;
  if (lane === "nexus_guard") return rules.nexusGuardHp ?? TOWER_HP;
  return TOWER_HP;
}

const fin = (v) => typeof v === "number" && Number.isFinite(v);
/** 不算「獎勵」的帳本來源：每秒被動收入、守護徽章的被動分成。其餘（擊殺／助攻／小兵／野怪／塔／物件）都是獎勵。 */
export const PASSIVE_GOLD_SOURCES = Object.freeze(["passive", "tithe"]);
/** 某英雄在這一格的帳本非被動累計（milli-gold）；沒有帳本 ⇒ null。 */
export function nonPassiveMilliOf(snap, id) {
  const by = snap?.items?.players?.[id]?.gold?.earnedMilliBySource;
  if (!by || typeof by !== "object") return null;
  let sum = 0;
  for (const [k, v] of Object.entries(by)) if (!PASSIVE_GOLD_SOURCES.includes(k) && fin(v)) sum += v;
  return sum;
}
const shieldOf = (p) => (Array.isArray(p?.statusEffects)
  ? p.statusEffects.find((e) => e?.id === "shield" && fin(e.amount)) ?? null : null);

/**
 * 相鄰兩格 snapshot → 原始回饋事件（未合併）。
 * @returns {Array<{kind:"damage"|"heal"|"shield"|"gold", targetKind:"hero"|"neutral"|"tower",
 *                  targetId:string, amount:number, maxHp:number|null, team:string|null}>}
 */
export function deriveFeedbackEvents(prev, snap, { rules = rulesFor() } = {}) {
  if (!prev || !snap || !fin(prev.ts) || !fin(snap.ts) || snap.ts <= prev.ts) return [];
  const dt = snap.ts - prev.ts;
  const out = [];
  const push = (e) => { if (e.amount > 0) out.push(e); };

  // ── 英雄 ───────────────────────────────────────────────────────────────
  const prevPlayers = new Map((prev.players ?? []).map((p) => [p.id, p]));
  for (const p of snap.players ?? []) {
    const q = prevPlayers.get(p.id);
    if (!q) continue;
    const id = String(p.id);
    const team = p.side ?? null;
    //  金錢：**只讀正式帳本**（items snapshot `gold.earnedMilliBySource`）的非被動來源累計差，逐 milli 精確。
    //  ⚠ 沒有帳本（裝備系統關閉）⇒ 不顯示 +Gold（資料缺口）。UI 不自行扣被動收入、不重算來源。
    const npNow = nonPassiveMilliOf(snap, p.id), npPrev = nonPassiveMilliOf(prev, p.id);
    if (npNow !== null && npPrev !== null && npNow > npPrev) {
      push({ kind: "gold", targetKind: "hero", targetId: id, amount: (npNow - npPrev) / 1000, amountMilli: npNow - npPrev, maxHp: null, team, source: "ledger" });
    }
    //  最後一擊：上一格活著、這一格死了 ⇒ 剩下的血＋護盾就是這一擊打掉的
    if (p.dead && !q.dead && fin(q.mhp) && q.mhp > 0) {
      push({ kind: "damage", targetKind: "hero", targetId: id, amount: q.hp * q.mhp + (shieldOf(q)?.amount ?? 0), maxHp: q.mhp, team });
      continue;
    }
    //  血量／護盾：兩格都活著、而且都有絕對最大血量才算（復活轉場不出數字）
    if (p.dead || q.dead || !fin(p.mhp) || !fin(q.mhp) || p.mhp <= 0 || q.mhp <= 0) continue;
    const hpNow = p.hp * p.mhp, hpPrev = q.hp * q.mhp;
    const shNow = shieldOf(p), shPrev = shieldOf(q);
    const aNow = shNow?.amount ?? 0, aPrev = shPrev?.amount ?? 0;
    //  護盾被打掉的部分算傷害；**自然到期**（上一格剩餘時間 ≤ 這段間隔）不算。
    const expired = !!shPrev && !shNow && fin(shPrev.remaining) && shPrev.remaining <= dt + 0.05;
    const absorbed = !expired && aPrev > aNow ? aPrev - aNow : 0;
    const hpLoss = hpPrev > hpNow ? hpPrev - hpNow : 0;
    push({ kind: "damage", targetKind: "hero", targetId: id, amount: hpLoss + absorbed, maxHp: p.mhp, team });
    if (hpNow > hpPrev) push({ kind: "heal", targetKind: "hero", targetId: id, amount: hpNow - hpPrev, maxHp: p.mhp, team });
    if (aNow > aPrev) push({ kind: "shield", targetKind: "hero", targetId: id, amount: aNow - aPrev, maxHp: p.mhp, team });
  }

  // ── 中立物件（龍／巴龍／野怪營地）──────────────────────────────────────────
  const prevObj = new Map((prev.objectives ?? []).map((o) => [o.id, o]));
  for (const o of snap.objectives ?? []) {
    const q = prevObj.get(o.id);
    if (!q) continue;
    if (o.alive && q.alive && fin(o.maxHp) && o.maxHp > 0 && q.hp > o.hp) {
      push({ kind: "damage", targetKind: "neutral", targetId: String(o.id), amount: (q.hp - o.hp) * o.maxHp, maxHp: o.maxHp, team: null });
    }
    //  營地：物件本體的 hp 是匯總；逐隻成員各自出數字更準
    if (Array.isArray(o.members) && Array.isArray(q.members)) {
      const pm = new Map(q.members.map((m) => [m.id, m]));
      for (const m of o.members) {
        const r = pm.get(m.id);
        if (!r || !r.alive || !fin(m.maxHp) || m.maxHp <= 0) continue;
        //  成員死在這一格：最後一擊照樣出數字（hp 歸零）
        const before = r.hp, after = m.alive ? m.hp : 0;
        if (before > after) push({ kind: "damage", targetKind: "neutral", targetId: `${o.id}/${m.id}`, amount: (before - after) * m.maxHp, maxHp: m.maxHp, team: null });
      }
    }
  }

  // ── 塔 ─────────────────────────────────────────────────────────────────
  for (const [id, t] of Object.entries(snap.towers ?? {})) {
    const q = prev.towers?.[id];
    if (!q || !(q.hp > 0) || !(q.hp > t.hp)) continue;
    const maxHp = structureMaxHp(t.lane, rules);
    push({ kind: "damage", targetKind: "tower", targetId: id, amount: (q.hp - t.hp) * maxHp, maxHp, team: t.side ?? null });
  }
  return out;
}

const MIN = { damage: FEEDBACK_POLICY.minDamage, heal: FEEDBACK_POLICY.minHeal, shield: FEEDBACK_POLICY.minShield, gold: 1 };

/** 一筆合併後的數字算不算「重要傷害」。 */
export const isMajor = (e) => e.kind === "damage"
  && (e.amount >= FEEDBACK_POLICY.majorAbs || (fin(e.maxHp) && e.amount >= e.maxHp * FEEDBACK_POLICY.majorRatio));

/**
 * 合併器：同一目標＋同一種類在 mergeWindowSec 內累加；小於門檻的碎片持續累積，
 * 視窗到期時夠大才吐出，不夠就丟掉（再生／被動之類的雜訊）。金錢用較長的 goldMergeSec。
 */
export function createFeedbackAggregator(policy = FEEDBACK_POLICY) {
  const open = new Map();   // key → { kind, targetKind, targetId, amount, maxHp, team, since }
  const windowOf = (kind) => (kind === "gold" ? policy.goldMergeSec : policy.mergeWindowSec);
  //  帳本金錢：以 milli 累加，顯示取整後**零頭留到下一筆**（不四捨五入、不丟）⇒ 顯示總額 ＝ 帳本總額（差 < 1）
  const goldCarry = new Map();   // targetId → 尚未顯示的 milli
  const emitGold = (cur) => {
    const total = (goldCarry.get(cur.targetId) ?? 0) + cur.amountMilli;
    const shown = Math.floor(total / 1000);
    goldCarry.set(cur.targetId, total - shown * 1000);
    return shown >= 1 ? { kind: "gold", targetKind: cur.targetKind, targetId: cur.targetId, amount: shown, maxHp: null, team: cur.team, major: false, source: "ledger" } : null;
  };
  const emitted = [];   // 最近 1 sim 秒內吐出的時間戳（顯示預算）
  let deferred = 0;
  //  重要性：重要傷害 → 英雄傷害 → 塔 → 英雄補血／護盾 → 野怪 → 金錢
  const rankOf = (c) => (c.kind === "damage"
    ? (isMajor({ ...c, amount: Math.round(c.amount) }) ? 0 : c.targetKind === "hero" ? 1 : c.targetKind === "tower" ? 2 : 4)
    : c.kind === "gold" ? 5 : 3);
  return {
    /** 餵入一格的原始事件；回傳這一格**應該顯示**的數字。 */
    push(events, ts) {
      const ready = [];
      for (const e of events) {
        const key = `${e.kind}|${e.targetId}`;
        const cur = open.get(key);
        if (cur) { cur.amount += e.amount; if (fin(e.amountMilli)) cur.amountMilli = (cur.amountMilli ?? 0) + e.amountMilli; cur.maxHp = e.maxHp ?? cur.maxHp; }
        else open.set(key, { ...e, since: ts });
      }
      //  顯示預算（maxActive／每 sim 秒）：到期的數字先排優先序，超出預算的**不丟**——放回合併視窗，
      //  跟同一目標接下來的數字合成一筆再出（集火時同一目標本來就會連續挨打）。總量守恆、不改傷害。
      const due = [];
      for (const [key, cur] of open) if (ts - cur.since >= windowOf(cur.kind)) due.push([key, cur]);
      while (emitted.length && ts - emitted[0] >= 1) emitted.shift();
      let room = policy.maxActive - emitted.length;
      due.sort((a, b) => rankOf(a[1]) - rankOf(b[1]) || b[1].amount - a[1].amount || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      for (const [key, cur] of due) {
        const amount = Math.round(cur.amount);
        const shows = cur.kind === "gold" && fin(cur.amountMilli)
          ? Math.floor(((goldCarry.get(cur.targetId) ?? 0) + cur.amountMilli) / 1000) >= 1
          : amount >= MIN[cur.kind];
        if (shows && room <= 0) { cur.since = ts; deferred++; continue; }   // 延後合併，不丟
        open.delete(key);
        if (cur.kind === "gold" && fin(cur.amountMilli)) { const g = emitGold(cur); if (g) { ready.push(g); emitted.push(ts); room--; } continue; }
        if (shows) { ready.push({ kind: cur.kind, targetKind: cur.targetKind, targetId: cur.targetId, amount, maxHp: cur.maxHp, team: cur.team, major: isMajor({ ...cur, amount }) }); emitted.push(ts); room--; }
      }
      return ready;
    },
    /** 因顯示預算而延後合併的次數（驗收用）。 */
    get deferred() { return deferred; },
    /** 目標死亡／換場時把它累積的部分立即結算（最後一擊不被吞掉）。 */
    flush(ts = Infinity) {
      const ready = [];
      for (const [key, cur] of open) {
        open.delete(key);
        if (cur.kind === "gold" && fin(cur.amountMilli)) { const g = emitGold(cur); if (g) ready.push(g); continue; }
        const amount = Math.round(cur.amount);
        if (amount >= MIN[cur.kind]) ready.push({ kind: cur.kind, targetKind: cur.targetKind, targetId: cur.targetId, amount, maxHp: cur.maxHp, team: cur.team, major: isMajor({ ...cur, amount }) });
      }
      return ready;
    },
    get size() { return open.size; },
  };
}

// ── 回城 ───────────────────────────────────────────────────────────────────
/**
 * 回城引導的呈現狀態：只讀 `players[].rc`（剩餘秒數）與 `recallEvents`（start／cancel／done）。
 * 進度 = 1 − rc / rules.recallChannelT（與引擎開始引導時寫入的同一個常數）。
 */
export function recallViewOf(snap, { rules = rulesFor() } = {}) {
  const total = rules.recallChannelT;
  const channels = [];
  if (!rules.recallChannel || !fin(total) || total <= 0) return { channels, events: [] };
  for (const p of snap?.players ?? []) {
    if (!(p.rc > 0) || p.dead) continue;
    channels.push({ id: String(p.id), team: p.side ?? null, remaining: p.rc, progress: Math.min(1, Math.max(0, 1 - p.rc / total)) });
  }
  const events = (snap?.recallEvents ?? []).filter((e) => e && e.id && (e.phase === "start" || e.phase === "cancel" || e.phase === "done"))
    .map((e) => ({ id: String(e.id), playerId: String(e.playerId), phase: e.phase, t: e.t, from: e.from ?? null }));
  return { channels, events };
}

/** 只取上次之後新出現的回城事件（以引擎給的 id 去重）。 */
export function newRecallEvents(events, seen) {
  const fresh = [];
  for (const e of events) { if (!seen.has(e.id)) { seen.add(e.id); fresh.push(e); } }
  return fresh;
}
