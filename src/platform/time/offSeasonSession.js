// ============================================================================
//  platform/time/offSeasonSession.js — 休賽期會期（V6-3）
//
//  ── 為什麼現在才做這個畫面 ────────────────────────────────────────────────
//  V5 設計 §6 立過一條產品判準：**Off-season 至少要有一個「會影響下一年、
//  且不可逆」的決策；做不到就不要做畫面**——多一個沒有決策的畫面比沒有畫面更糟。
//
//  到 V6-2 為止，年度邊界已經累積出三個真實決策：
//    ① 有人宣布最後一年 ⇒ 要不要現在簽接班人
//    ② 有人合約即將到期 ⇒ 續約還是放走
//    ③ 續約要花錢 ⇒ 和補強搶同一份預算
//  ⇒ 判準過了，會期才存在。
//
//  ── 這一層只做「有沒有事要處理」與「處理完了沒有」──────────────────────
//  它**不擁有**任何決策的內容：退休在 `progress/retirement.js`、
//  合約在 `progress/contract.js`、補強走既有的 `signProspect` 與 V4 市場價值。
//  本檔只負責會期的開與關，以及「同一個生涯年度不得開兩次」。
//
//  ⚠ MOBA / CS 共用同一個生涯年度 ⇒ 會期鍵是**年度編號**，
//    與兩個項目各自的賽季無關，結構上不可能各開一次。
//  ⚠ 純函式：不 import Store / React / localStorage。
// ============================================================================
import { contractStatusOf } from "../progress/contract.js";

export const OFF_SEASON_SESSION_VERSION = "OffSeasonSession.v1";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * 這個存檔現在有哪些**需要玩家處理**的年度決策。
 * @returns {{intents:Array, expiring:Array, total:number}}
 */
export function pendingDecisionsOf(state) {
  const players = state?.players ?? [];
  const intents = players
    .filter((p) => Number.isFinite(Number(p?.retirement?.intentYear)))
    .map((p) => ({ id: p.id, name: p.name ?? p.id, age: num(p.age) }));
  const expiring = players
    .filter((p) => {
      const s = contractStatusOf(p);
      return (s === "expiring" || s === "expired")
        && !Number.isFinite(Number(p?.retirement?.intentYear));   // 退役者不列入續約決策
    })
    .map((p) => ({ id: p.id, name: p.name ?? p.id, days: num(p.contract) }));
  return { intents, expiring, total: intents.length + expiring.length };
}

/** 目前開著的會期；沒有就是 `null`。 */
export function sessionOf(state) {
  const s = state?.meta?.offSeason?.session;
  return s && s.open ? s : null;
}

/**
 * 開啟會期——**只在真的有決策時**。
 *
 * ⚠ 沒有決策 ⇒ 回傳同一個 state 參考、`opened: false`。
 *   這就是「不得多卡一道空殼畫面」的結構保證。
 * ⚠ 同一個生涯年度完成過就不再開（`lastCompletedYear`）。
 *
 * @returns {{state:object, opened:boolean, pending:object}}
 */
export function openSession(state, { careerYear = 1, day = null } = {}) {
  const meta = state?.meta ?? {};
  const off = meta.offSeason ?? {};
  if (off.session?.open) return { state, opened: false, pending: pendingDecisionsOf(state) };
  if (num(off.lastCompletedYear) >= careerYear) return { state, opened: false, pending: pendingDecisionsOf(state) };
  const pending = pendingDecisionsOf(state);
  if (pending.total <= 0) return { state, opened: false, pending };
  const session = {
    open: true,
    careerYear,
    openedOnDay: day == null ? num(meta.days) : num(day),
    fundsAtOpen: num(state?.finance?.funds),
  };
  return { state: { ...state, meta: { ...meta, offSeason: { ...off, session } } }, opened: true, pending };
}

/**
 * 完成休賽期。**永遠成功、永遠免費**——這就是安全出口：
 * 破產、全部放走、什麼都不做，都走得下去。
 */
export function completeSession(state) {
  const meta = state?.meta ?? {};
  const off = meta.offSeason ?? {};
  if (!off.session?.open) return { state, completed: false };
  const year = num(off.session.careerYear);
  return {
    state: { ...state, meta: { ...meta, offSeason: { ...off, session: null, lastCompletedYear: year } } },
    completed: true,
  };
}

/** 畫面的單一讀取點。 */
export function offSeasonSessionViewOf(state) {
  const s = sessionOf(state);
  const pending = pendingDecisionsOf(state);
  return {
    version: OFF_SEASON_SESSION_VERSION,
    open: !!s,
    careerYear: s?.careerYear ?? null,
    fundsAtOpen: s?.fundsAtOpen ?? null,
    fundsNow: num(state?.finance?.funds),
    ...pending,
  };
}
