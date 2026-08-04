// ============================================================================
//  platform/recruit/applyRecruitment.js — 招募的單一寫入點（Milestone O）
//
//  這是**唯一**把新秀變成隊員的地方。畫面與其他 Store 動作一律不得自己
//  push 進 players[] 或動 funds：
//      ✅  const receipt = signProspect(prospect, poolSeed)   // store 薄包裝
//      ❌  set({ players: [...players, 自己組的物件] })
//
//  核心是純 reducer `applyRecruitmentToState(state, tx)`：
//    · 不 import React / zustand / localStorage ⇒ 可直接 Node 測試
//      （驗證器：tools/check_recruit_o.mjs）。
//    · **一次寫完**：名單、資金、交易帳本、招募帳本在同一個 nextState 內，
//      不會出現「扣了錢沒進人」或「進了人沒扣錢」的半套狀態。
//
//  ── 三道保護（缺一不可）────────────────────────────────────────────────
//    ① 名額：`players.length >= ROSTER_CAP` ⇒ 拒絕
//    ② 餘額：`finance.funds < 簽約金` ⇒ 拒絕
//    ③ 重複：`recruitment.signed[transactionId]` 已存在 ⇒ 冪等回傳既有 receipt
//       （M O 之前沒有這一道，同一位新秀可以無限簽、無限扣款、無限複製）
//
//  ── 決定性（為了日後由伺服器接管）──────────────────────────────────────
//  舊實作用 `Date.now()` 產 id、用 `Math.random()` 產士氣 ⇒ 同一張交易單重播
//  會得到不同的選手。本檔全部改成由交易單內容推導，**沒有任何亂數與時鐘**。
// ============================================================================
import { ROSTER_CAP, conditionFor } from "../../data/playerModel.js";
import { validateRecruitmentTransaction } from "../contracts/recruitment.js";
import { WAN } from "../economy/units.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 選手 id：由冪等鍵推導 ⇒ 同一張交易單永遠產生同一個 id（可重播）。 */
export const recruitPlayerId = (poolSeed, prospectId) => `r${poolSeed}-${prospectId}`;

/**
 * 初始士氣：由能力快照推導，**不用亂數**。
 * 取 potential 落在 [72, 92] 的穩定映射——高潛力新秀進隊時士氣略高。
 */
function initialMorale(player) {
  const pot = num(player?.potential);
  return 72 + (Math.abs(Math.round(pot)) % 21);
}

/**
 * 純 reducer：state + 招募交易單 → { nextState, receipt }
 *
 * @returns {{nextState:object|null, receipt:object}}
 *   nextState = null 代表**完全沒有寫入**（驗證失敗／名額滿／餘額不足／已簽過）。
 *   receipt.reason 說明原因，畫面可直接顯示，不必自己再判一次。
 */
export function applyRecruitmentToState(state, tx) {
  const v = validateRecruitmentTransaction(tx);
  if (!v.ok) {
    return { nextState: null, receipt: { ok: false, signed: false, alreadySigned: false, reason: "invalid", errors: v.errors } };
  }

  const recruitment = state.recruitment ?? { signed: {} };
  const signedLedger = recruitment.signed ?? {};
  //  ③ 重複：冪等——回傳既有 receipt，不重複扣款、不重複進人
  const existing = signedLedger[tx.transactionId];
  if (existing) {
    return { nextState: null, receipt: { ...existing, alreadySigned: true } };
  }

  const players = state.players ?? [];
  //  ① 名額
  if (players.length >= ROSTER_CAP) {
    return {
      nextState: null,
      receipt: { ok: false, signed: false, alreadySigned: false, reason: "roster_full", rosterCap: ROSTER_CAP, rosterSize: players.length },
    };
  }

  const finance = state.finance ?? {};
  const cost = Math.round(num(tx.costWan) * WAN);
  const fundsBefore = num(finance.funds);
  //  ② 餘額
  if (fundsBefore < cost) {
    return {
      nextState: null,
      receipt: { ok: false, signed: false, alreadySigned: false, reason: "insufficient_funds", cost, funds: fundsBefore },
    };
  }

  const snap = tx.player;
  const energy = 100;
  const player = {
    id: recruitPlayerId(tx.poolSeed, tx.prospectId),
    name: snap.name,
    //  未綁定英雄 ⇒ Roster 頁誠實顯示「未綁定」，不亂塞一個
    heroId: null,
    role: snap.role,
    status: "預備隊",
    training: null,
    //  S25：新秀從 0 累積總 XP，lv 由 xp 導出（等級閉環在選手層）
    lv: 1,
    xp: 0,
    talentPoints: 0,
    talents: {},
    potential: num(snap.potential),
    age: num(snap.age),
    personality: snap.personality,
    morale: initialMorale(snap),
    energy,
    condition: conditionFor(energy),
    contract: 365,
    //  ⚠ 這個欄位是**身價／轉會用**，不是週薪。
    //    週薪自 N2 起一律由 economy/salary.js 依能力推導，週結算不讀它。
    salary: Math.max(1, Math.round(num(tx.costWan) / 10)),
    traits: Array.isArray(snap.traits) ? [...snap.traits] : [],
    tier: snap.tier ?? null,
    stats: { ...snap.stats },
    //  招募來源（可稽核；日後伺服器接管時用來對帳）
    signedVia: tx.transactionId,
  };

  const fundsAfter = fundsBefore - cost;
  const receipt = {
    ok: true,
    signed: true,
    alreadySigned: false,
    reason: null,
    transactionId: tx.transactionId,
    playerId: player.id,
    name: player.name,
    role: player.role,
    cost,
    fundsBefore,
    fundsAfter,
    rosterSize: players.length + 1,
    rosterCap: ROSTER_CAP,
    signedAt: tx.signedAt,
  };

  const nextState = {
    players: [...players, player],
    finance: {
      ...finance,
      funds: fundsAfter,
      //  進交易帳本：招募是真實金流，財務頁要看得到。
      //  id 由冪等鍵推導 ⇒ 不用 Date.now，同一張交易單不會產生兩筆。
      transactions: [
        {
          id: `sign-${tx.transactionId}`,
          date: `第${num(tx.signedAt?.week)}週`,
          type: "expense",
          cat: "recruit",
          label: `簽下新秀 ${player.name}（${player.role}）`,
          amount: -cost,
          color: "#f97316",
          week: num(tx.signedAt?.week),
        },
        ...(finance.transactions ?? []),
      ].slice(0, 60),
    },
    meta: { ...(state.meta ?? {}), players: players.length + 1 },
    recruitment: { ...recruitment, signed: { ...signedLedger, [tx.transactionId]: receipt } },
  };

  return { nextState, receipt };
}

/** 這位新秀是否已經簽過（畫面用；不改任何狀態）。 */
export function isProspectSigned(state, transactionId) {
  return !!(state?.recruitment?.signed ?? {})[transactionId];
}
