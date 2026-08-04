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
import { appendFormEntry } from "../economy/formLog.js";
import { deriveTime } from "../economy/timeline.js";
import { applyMatchWear } from "../condition/playerCondition.js";
import { applyLevelGrowth } from "./levelGrowth.js";

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

    //  Milestone O2：出賽損耗（體力／連續出賽／受傷）只對**實際出賽的人**套用。
    //  這裡就是那個唯一入口——tx.playerProgress 是 adapter 依實際陣容產生的名單，
    //  替補與未登錄根本不會出現在其中，所以不可能誤拿出賽獎勵或損耗。
    //  受傷判定以 `${transactionId}:${playerId}` 決定性推導 ⇒ 伺服器可獨立重算。
    //  Milestone P0：**升級 → 基礎能力成長**。
    //  在此之前升級只發天賦點，玩家不手動花掉就完全不影響實力。
    //  成長是 (選手, 升幾級) 的決定性函式，沿用定位權重與潛力上限，
    //  寫回 `stats`（基礎值）⇒ 天賦加成仍疊在上面，不重複計算。
    //  冪等由既有的 transactionId 保證：同一場再結算不會二次成長。
    const growth = applyLevelGrowth(me, levelsGained);

    const wear = applyMatchWear({
      ...me,
      xp: newXp,
      lv: newLevel,                                     // lv 一律由 xp 導出 → 不會與 xp 不一致
      talentPoints: prevTalent + talentGained,
      stats: growth.stats,                              // P0：等級成長後的能力
      restDays: 0,                                      // 今天出賽了 ⇒ 休息日數歸零
    }, `${tx.transactionId}:${pp.playerId}`);
    patched.set(pp.playerId, wear.player);

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
      //  P0：升級帶來的能力成長（可直接顯示「成長前後差異」）
      growth: { gains: growth.gains, total: growth.total },
      //  O2：狀態變化一併回報（畫面顯示、伺服器對帳）
      condition: {
        energyBefore: Math.round(num(me.energy ?? 100)),
        energyAfter: wear.player.energy,
        drained: wear.drained,
        matchStreak: wear.player.matchStreak,
        injured: wear.injured,
        injuryDays: wear.injuryDays,
      },
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
    //  Milestone N3：把這一場的勝負追加到**統一賽績紀錄**（MOBA 與 CS 一視同仁），
    //  供經濟層的贊助績效獎金使用。勝負直接取自契約既有的 metadata.winner，
    //  **不重新統計任何戰績**——戰績來源仍是 BattleResult / seasonStore。
    //  N3 之前只有 CS 的紀錄進得了績效，MOBA 打再多都不影響收入。
    //  ⚠ 本檔刻意不提及 CS 的歷史清單識別字：check_progress25 §11 以字串比對
    //    確保 MOBA 路徑不碰它，連註解都算。要講那件事請寫在 economy/formLog.js。
    economy: appendFormEntry(state.economy, {
      id: tx.transactionId,
      mode: tx.mode,
      win: tx.metadata?.winner === "us",
      week: deriveTime(meta.days ?? 1).week,
    }),
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
