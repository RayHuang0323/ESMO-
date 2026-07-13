// ============================================================================
//  platform/progress/settleCsMatch.js — CS 賽後結算邊界（Sprint25）
//
//  為什麼存在：Sprint23 的 CS 結算掛在 CsResultScreen 的 useEffect（掛載時才發獎）。
//    → 玩家若沒進 Result 畫面（直接返回 / 流程被打斷），獎勵**永久漏發**。
//  Sprint25 把它移到「比賽完成邊界」＝ CsMatchScreen.onFinish（AppShell 呼叫），
//    與 MOBA 的 useBattleFeed 終局分支對稱。Result Screen 只負責「顯示 receipt」。
//
//  §10 的順序，在這裡一次做完：
//    Result 契約驗證 → 建 Transaction → Apply（唯一發獎點）→ receipt
//    → 寫 csHistory（附 transactionId）→ 回傳 receipt 給 UI
// ============================================================================
import { useProfileStore } from "../profileStore.js";
import { validateCsMatchResult } from "../contracts/CsMatchResult.js";
import { csResultToTransaction } from "./adapters/csProgressAdapter.js";

/**
 * @param {object} csResult  CsMatchResult.v1
 * @returns {object|null} receipt（已套用過 → alreadyApplied: true；驗證失敗 → ok: false）
 */
export function settleCsMatch(csResult) {
  const store = useProfileStore.getState();

  // 1) Result 契約驗證（不合法 → 不入史、不發獎，回傳錯誤，不產生半套狀態）
  const v = validateCsMatchResult(csResult);
  if (!v.ok) return { ok: false, applied: false, alreadyApplied: false, errors: v.errors };

  // 2) 建 Transaction（CS 連勝只看 csHistory，不讀 MOBA 戰績）
  const hist = store.csHistory ?? [];
  const tx = csResultToTransaction(csResult, {
    players: store.players ?? [],
    streak: csWinStreak(hist),
    fansNow: store.meta?.fans ?? 0,
  });
  if (!tx) return { ok: false, applied: false, alreadyApplied: false, errors: ["無法建立 transaction"] };

  // 3) Apply（唯一發獎點；冪等）
  const receipt = useProfileStore.getState().applyMatchProgress(tx);

  // 4) 入史（只寫紀錄，不發獎；同 matchId 冪等）
  useProfileStore.getState().recordCsMatch(csResult, receipt);

  return receipt;
}

/** CS 連勝：csHistory 最新在前，往後數到第一場非勝為止。 */
function csWinStreak(hist) {
  let n = 0;
  for (const h of hist) {
    if (h?.winner === "us") n++;
    else break;
  }
  return n;
}
