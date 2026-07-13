// ============================================================================
//  platform/progress/applyMatchProgress.js — 單一賽後結算服務（Sprint25）
//
//  這是**唯一**的賽後寫入點。Result Screen 一律不得自己動 Store：
//      ✅  const receipt = applyMatchProgress(transaction)
//      ❌  addMoney(...) / addFans(...) / players.forEach(addXp) / recordHistory(...)
//
//  本檔核心是純 reducer `applyProgressToState(state, tx)`：
//    · 不 import React、不 import zustand、不碰 localStorage → 可直接 Node 測試。
//    · profileStore 只是薄包裝：把 nextState 一次 set() 進去（單一 synchronous
//      state update）→ 不會出現「history 寫了但錢沒寫」的半套狀態。
//
//  冪等（§5）：
//    · 冪等鍵 = transaction.transactionId（由 mode + matchId 決定性推導）。
//    · state.processedMatchTransactions[txId] 存 receipt。
//    · 同一個 txId 再次套用 → 不加錢、不加粉絲、不加 XP、不發天賦點，
//      回傳既有 receipt 並標記 alreadyApplied: true。
//    · 因此 React StrictMode 雙掛載 / 重整後重進 Result 都不會重複發獎。
// ============================================================================
import { validateMatchProgressTransaction } from "../contracts/matchProgressTransaction.js";
import { levelFromTotalXp, TALENT_POINTS_PER_LEVEL } from "./playerLevel.js";

/**
 * 純 reducer：state + transaction → { nextState, receipt }
 * 不合法的 transaction 一律拒絕，**完全不寫入**（不產生半套狀態）。
 *
 * @param {object} state  profileStore 相關切片（players / finance / meta / processedMatchTransactions）
 * @param {object} tx     MatchProgressTransaction.v1
 */
export function applyProgressToState(state, tx) {
  // 1) 驗證 transaction
  const v = validateMatchProgressTransaction(tx);
  if (!v.ok) {
    return { nextState: null, receipt: { ok: false, applied: false, alreadyApplied: false, errors: v.errors } };
  }

  // 2) 檢查冪等
  const processed = state.processedMatchTransactions ?? {};
  const existing = processed[tx.transactionId];
  if (existing) {
    return { nextState: null, receipt: { ...existing, alreadyApplied: true } };
  }

  const players = state.players ?? [];
  const finance = state.finance ?? {};
  const meta = state.meta ?? {};

  // 3) 團隊金錢 / 4) 粉絲・聲望
  const moneyBefore = num(finance.funds);
  const fansBefore = num(meta.fans);
  const repBefore = num(meta.reputation);
  const moneyAfter = moneyBefore + num(tx.teamRewards.money);
  const fansAfter = fansBefore + num(tx.teamRewards.fans);
  const repAfter = repBefore + num(tx.teamRewards.reputation);

  // 5–7) 選手 XP / 升級 / 天賦點
  //    ⚠ 以 Store 的**現值**重算，不盲信 transaction 裡的 previousXp
  //      （transaction 可能是在別的狀態下建立的；receipt 必須反映真實差額）。
  const byId = new Map(players.map((p) => [p.id, p]));
  const playerReceipts = [];
  const patched = new Map();

  for (const pp of tx.playerProgress) {
    const me = byId.get(pp.playerId);
    if (!me) continue;                                  // 已離隊 → 跳過（不建立幽靈選手）
    const prevXp = Math.max(0, num(me.xp));
    const prevLevel = levelFromTotalXp(prevXp);
    const gain = Math.max(0, num(pp.xpGained));
    const newXp = prevXp + gain;
    const newLevel = Math.max(prevLevel, levelFromTotalXp(newXp));   // 等級不倒退
    const levelsGained = newLevel - prevLevel;
    const talentGained = levelsGained * TALENT_POINTS_PER_LEVEL;
    const prevTalent = Math.max(0, num(me.talentPoints));

    patched.set(pp.playerId, {
      ...me,
      xp: newXp,
      lv: newLevel,                                     // lv 一律由 xp 導出 → 不會與 xp 不一致
      talentPoints: prevTalent + talentGained,
    });

    playerReceipts.push({
      playerId: pp.playerId,
      name: me.name,
      xpGained: gain,
      previousXp: prevXp,
      newXp,
      previousLevel: prevLevel,
      newLevel,
      levelsGained,
      talentPointsGained: talentGained,
      reasons: pp.reasons ?? [],
    });
  }

  const nextPlayers = players.map((p) => patched.get(p.id) ?? p);

  // 財務流水（讓「近期交易」看得到這筆獎金；money 為 0 就不記帳）
  const nextTransactions = num(tx.teamRewards.money) > 0
    ? [{
        id: `${tx.mode}-${tx.matchId}`,
        date: fmtDate(tx.recordedAt),
        type: "income",
        cat: "prize",
        label: `${tx.mode === "cs" ? "CS" : "MOBA"} ${tx.metadata.winner === "us" ? "勝利" : "參賽"}獎金`,
        amount: num(tx.teamRewards.money),
        color: "#34d399",
      }, ...(finance.transactions ?? [])].slice(0, 30)
    : (finance.transactions ?? []);

  // 8) 寫入完成紀錄（receipt 存進 processedMatchTransactions → 冪等憑證）
  const receipt = {
    ok: true,
    applied: true,
    alreadyApplied: false,
    transactionId: tx.transactionId,
    matchId: tx.matchId,
    mode: tx.mode,
    recordedAt: tx.recordedAt,
    team: {
      money: moneyAfter - moneyBefore,
      fans: fansAfter - fansBefore,
      reputation: repAfter - repBefore,
      moneyBefore, moneyAfter, fansBefore, fansAfter,
    },
    players: playerReceipts,
    totals: {
      xpGained: playerReceipts.reduce((s, p) => s + p.xpGained, 0),
      levelsGained: playerReceipts.reduce((s, p) => s + p.levelsGained, 0),
      talentPointsGained: playerReceipts.reduce((s, p) => s + p.talentPointsGained, 0),
    },
    metadata: tx.metadata,
  };

  const nextState = {
    players: nextPlayers,
    finance: { ...finance, funds: moneyAfter, transactions: nextTransactions },
    meta: { ...meta, fans: fansAfter, reputation: repAfter },
    processedMatchTransactions: { ...processed, [tx.transactionId]: receipt },
  };

  return { nextState, receipt };
}

/** 查詢：這場是否已結算過（Result Screen 用來決定要不要播成長動畫）。 */
export function findReceipt(state, transactionId) {
  return (state?.processedMatchTransactions ?? {})[transactionId] ?? null;
}

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtDate(ts) {
  const d = Number.isFinite(ts) ? new Date(ts) : new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
