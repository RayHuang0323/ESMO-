// ============================================================================
//  platform/challenge/challengeBoard.js — 挑戰看板（Slice 3）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  Slice 2 只有一個對手、一顆按鈕。Slice 3 要讓玩家**自己選風險**，
//  而選擇要成立就必須「看得懂對手」。
//
//  ── 唯一的硬規則：不得宣告系統證明不了的事 ───────────────────────────────
//  271b31d 實測過：`calcPower` 看不到英雄熟練（勝負的主要決定者），
//  相近定價的隊伍勝率跨度約 28pp ⇒ **我們沒有可信的戰力度量**。
//
//  ⇒ 本檔**不 import** `teamStrength` / `calcPower`，也不產生任何
//    strength / rating / tier / 星等 欄位。卡片上的每一句都必須是：
//      ① 從快照本身讀得出來的**事實**（熟練等級、能力分布、年齡、戰術、發布時間）
//      ② 或**已觀測**的挑戰結果（帶樣本數）
//  ⇒ 也不用 Career Year 當公平軸、不宣稱 Club Level 等於戰力（Owner Decision 5）。
//
//  ── 觀測紀錄是「你的紀錄」，不是全服紀錄 ─────────────────────────────────
//  ⚠ 目前沒有伺服器，所以「被攻破幾次」只能從**這台機器上、這個存檔**的
//    挑戰歷史推導。文案必須寫「你挑戰過 N 次」，不得寫成全服統計——
//    那會是憑空捏造的社群資料。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { FIXTURE_OPPONENTS, fixtureOpponentByKey } from "./fixtureOpponents.js";
import { mobaTacticById } from "../contracts/MobaTacticConfig.js";
import { DOCTRINES } from "../mastery/doctrine.js";

export const CHALLENGE_BOARD_VERSION = "ChallengeBoard.v1";

/** 觀測紀錄要幾筆才敢分類。低於這個數 ⇒ 誠實寫「尚無足夠挑戰紀錄」。 */
export const MIN_RECORD_SAMPLE = 3;

/** 快照「新鮮」的門檻（生涯日）。⚠ 起始基準，不是最終數值。 */
export const FRESH_WITHIN_DAYS = 3;

/**
 * 候選位。**每一格都由可證明的資訊定義，沒有一格是強弱推估。**
 *
 * · `warmup`   有觀測紀錄且**你攻破過較多次**／或「熟練與你相同」的事實
 * · `even`     有觀測紀錄且攻破率接近一半
 * · `hard`     有觀測紀錄且**你很少攻破**
 * · `unusual`  組成與眾不同（偏科／年齡結構），**完全不宣告強弱**
 * · `changed`  近期發布過新陣容（新鮮度事實）
 * · `unknown`  樣本不足 ⇒ 誠實標示
 */
export const BOARD_SLOTS = Object.freeze({
  warmup: { id: "warmup", label: "可以先試手" },
  even: { id: "even", label: "勢均力敵" },
  hard: { id: "hard", label: "硬仗" },
  unusual: { id: "unusual", label: "特殊陣容" },
  changed: { id: "changed", label: "近期有變動" },
  unknown: { id: "unknown", label: "尚無足夠挑戰紀錄" },
});

/**
 * 從**這個存檔自己的**挑戰歷史推導每個對手的觀測紀錄。
 *
 * ⚠ 只看 `formal`（正式挑戰）。`retry`（打同一份舊快照的再試一次）
 *   不計入紀錄——否則玩家可以靠重試把「攻破率」刷成任何數字。
 *
 * @returns {Object<string,{challenged:number,broke:number,held:number}>} key → 紀錄
 */
export function observedRecords(challengeState) {
  const out = {};
  const instances = challengeState?.instances ?? {};
  for (const id of challengeState?.order ?? []) {
    const inst = instances[id];
    if (!inst?.result || inst.kind === "retry") continue;
    const key = inst.opponentKey;
    if (!key) continue;
    const row = out[key] ?? (out[key] = { challenged: 0, broke: 0, held: 0 });
    row.challenged += 1;
    if (inst.result.outcome === "challengerWin") row.broke += 1;
    else row.held += 1;
  }
  return out;
}

/** 一句**可證明**的紀錄描述。⚠ 不得出現「較弱／較強」這類推估詞。 */
export function recordLabel(rec) {
  if (!rec || rec.challenged === 0) return "你還沒有挑戰過這支隊伍";
  if (rec.challenged < MIN_RECORD_SAMPLE) {
    return `你挑戰過 ${rec.challenged} 次（紀錄太少，還看不出傾向）`;
  }
  return `你挑戰過 ${rec.challenged} 次，攻破 ${rec.broke} 次、被守下 ${rec.held} 次`;
}

/**
 * 依觀測紀錄決定候選位。
 *
 * ⚠ 樣本不足一律 `unknown`——**不推估、不補值**。
 *   這是整份設計裡最容易被偷懶掉的一條：沒資料時給一個「大概」的分類，
 *   看起來體驗比較好，但那就是在宣告我們證明不了的事。
 */
export function slotFromRecord(rec) {
  if (!rec || rec.challenged < MIN_RECORD_SAMPLE) return BOARD_SLOTS.unknown.id;
  const rate = rec.broke / rec.challenged;
  if (rate >= 0.6) return BOARD_SLOTS.warmup.id;
  if (rate <= 0.25) return BOARD_SLOTS.hard.id;
  return BOARD_SLOTS.even.id;
}

/** 快照新鮮度（相對玩家目前的生涯日）。負數代表 fixture 的固定時刻，一律當作「不新」。 */
export function freshnessOf(snapshot, careerDay) {
  const published = Number(snapshot?.careerDay);
  const now = Number(careerDay);
  if (!Number.isFinite(published) || !Number.isFinite(now)) return { days: null, fresh: false, label: "發布時間不明" };
  const days = Math.max(0, now - published);
  return {
    days,
    fresh: days <= FRESH_WITHIN_DAYS,
    label: days === 0 ? "今天發布" : `${days} 天前發布`,
  };
}

/** 從快照推導**可觀測**的組成特徵。⚠ 只描述看得到的東西，不算戰力。 */
export function compositionOf(snapshot) {
  const seats = snapshot?.seats ?? [];
  const loadout = snapshot?.combat?.loadout ?? {};
  const levels = seats.map((s) => Number(loadout[s.seat]?.level) || 0);
  const avgMastery = levels.length ? Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10 : 0;
  //  ⚠ 核心選手＝**熟練度最高的席位**。這是快照裡讀得到的事實，
  //    不是「最強的人」——熟練高不等於整體強，卡片文案也要照這個寫。
  const top = seats.reduce((best, s) => {
    const lv = Number(loadout[s.seat]?.level) || 0;
    return !best || lv > best.level ? { seat: s.seat, playerId: s.playerId, role: s.role, level: lv } : best;
  }, null);
  return { avgMastery, masteryMin: Math.min(...levels), masteryMax: Math.max(...levels), core: top };
}

/**
 * 建立看板。
 *
 * @param {object} p
 * @param {object} p.challengeState     存檔切片（提供觀測紀錄）
 * @param {number} p.careerDay          玩家目前生涯日（算新鮮度）
 * @param {Function} p.snapshotFor      `(key) => { ok, snapshot }`（走權威層）
 * @param {number} p.playerMasteryLevel 玩家目前平均熟練（`drill_mirror` 對齊用）
 * @returns {{ candidates: Array, coldStart: boolean }}
 */
export function buildChallengeBoard({
  challengeState = null, careerDay = 1, snapshotFor = null, playerMasteryLevel = 1,
} = {}) {
  const records = observedRecords(challengeState);
  const anyRecord = Object.values(records).some((r) => r.challenged >= MIN_RECORD_SAMPLE);

  const candidates = [];
  for (const def of FIXTURE_OPPONENTS) {
    const built = snapshotFor?.(def.key);
    if (!built?.ok) continue;
    const snap = built.snapshot;
    const rec = records[def.key] ?? null;
    const comp = compositionOf(snap);
    const fresh = freshnessOf(snap, careerDay);
    const tactic = mobaTacticById(snap.standingOrders.tacticId);
    const doctrine = DOCTRINES.find((d) => d.id === def.doctrineHint) ?? null;

    //  ── 候選位 ───────────────────────────────────────────────────────────
    //  有足夠樣本 ⇒ 用觀測紀錄。沒有 ⇒ 用**組成事實**分到描述性的格子，
    //  而那些格子（unusual / changed / unknown）**不宣告強弱**。
    let slot = slotFromRecord(rec);
    if (slot === BOARD_SLOTS.unknown.id) {
      if (def.spread > 0) slot = BOARD_SLOTS.unusual.id;
      else if (def.recentLineupChange) slot = BOARD_SLOTS.changed.id;
    }

    candidates.push({
      key: def.key,
      snapshotHash: snap.hash,
      team: snap.team,
      publishedAt: snap.issuedAt,
      freshness: fresh,
      seats: snap.seats.map((s) => ({ seat: s.seat, playerId: s.playerId, role: s.role, level: snap.combat.loadout[s.seat]?.level ?? null })),
      composition: comp,
      doctrine: doctrine ? { id: doctrine.id, zh: doctrine.zh, emoji: doctrine.emoji, claim: doctrine.claim } : null,
      tactic: tactic ? { tacticId: tactic.tacticId, name: tactic.name, emoji: tactic.emoji, focus: tactic.focus, cons: tactic.cons } : null,
      traits: [...def.traits],
      recentLineupChange: !!def.recentLineupChange,
      record: rec,
      recordLabel: recordLabel(rec),
      slot,
      //  ⚠ `mirrorsPlayerMastery` 是**事實**（熟練與玩家相同），
      //    UI 用它顯示「可以先試手」的**理由**，而不是顯示一個強弱分數。
      mirrorsPlayerMastery: def.mastery === "mirror",
      note: def.note,
    });
  }

  //  ── 冷啟：保證至少有一個「合理可嘗試」的候選 ─────────────────────────
  //  ⚠ 這不是保證勝率，也不是把對手調弱。它保證的是：
  //    盤面上**至少有一個對手，其熟練度與你相同**——那是快照裡讀得出來的事實。
  //    新玩家 vs 熟練 4–12 的 fixture 是**結構性必敗**（Slice 2 實測 0/18），
  //    而結構性必敗的首戰不是難度，是設計缺陷。
  const mirror = candidates.find((c) => c.mirrorsPlayerMastery);
  if (mirror && !anyRecord) mirror.slot = BOARD_SLOTS.warmup.id;

  return {
    schema: CHALLENGE_BOARD_VERSION,
    candidates,
    //  冷啟 = 還沒有任何足夠樣本的觀測紀錄。UI 據此說明「分類會隨你的紀錄變準」。
    coldStart: !anyRecord,
    playerMasteryLevel,
  };
}

/** 看板上有沒有「合理可嘗試」的候選（冷啟保證）。verifier 直接讀這一支。 */
export const hasReasonableCandidate = (board) =>
  (board?.candidates ?? []).some((c) => c.slot === BOARD_SLOTS.warmup.id || c.mirrorsPlayerMastery);

// ══════════════════════════════════════════════════════════════════════════
//  賽後：「賽前情報」vs「實際發生」
//
//  ⚠ **只用真實資料**。左邊是戰術自己宣告的 `evidence.goal`
//    （`MobaTacticConfig.js` 裡逐條寫死的觀察指標），
//    右邊是引擎的 `tacticExec` 真實計數。兩者並排，**不下結論**。
//  ⚠ 明確不做：勝因分析、AI 教練建議、「你應該改成 X」。
//    那些需要我們沒有的因果模型，寫出來就是編造。
// ══════════════════════════════════════════════════════════════════════════

/**
 * 我方戰術的宣告 vs 實際。
 *
 * @param {object} tactic  `MOBA_TACTICS` 的一張（含 `evidence`）
 * @param {object} exec    `result.tacticExec.challenger`
 * @returns {Array<{key,label,goal,actual,met}>}
 */
export function tacticEvidenceRows(tactic, exec) {
  const rows = [];
  for (const ev of tactic?.evidence ?? []) {
    const actual = Number(exec?.[ev.key]);
    rows.push({
      key: ev.key,
      label: ev.label,
      goal: ev.goal,
      //  ⚠ 引擎沒有這個計數 ⇒ `null`，UI 顯示「—」。**不要填 0**：
      //    「沒統計到」與「真的是 0」是兩件事，混在一起會讓玩家讀出錯誤結論。
      actual: Number.isFinite(actual) ? actual : null,
      met: Number.isFinite(actual) ? actual >= ev.goal : null,
    });
  }
  return rows;
}

/**
 * 賽前看到的對手情報，賽後哪些「對上了」。
 *
 * ⚠ 只比對**可證明**的項目：對手宣告的戰術，實際上有沒有做出它的指標。
 *   不比「他是不是比較強」——我們沒有那個度量。
 */
export function opponentEvidenceRows(defenderTactic, exec) {
  return tacticEvidenceRows(defenderTactic, exec);
}
