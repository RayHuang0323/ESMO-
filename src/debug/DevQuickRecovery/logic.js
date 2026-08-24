// ============================================================================
//  debug/DevQuickRecovery/logic.js — DEV 快速恢復的純規則（無 React、無 JSX）
//
//  ⚠⚠ **開發測試便利功能，不是正式遊戲設計。** 正式商業上線前必須關閉或移除。
//
//  拆成獨立 .js 的唯一理由：**讓 verifier 能直接 import 並實跑**。
//  JSX 檔在 Node 裡 import 不了，閘門與恢復目標若寫在 .jsx 裡就只能靠字串比對驗，
//  那擋不住「行為改了但字面沒改」。這兩個函式是本工具僅有的判斷，所以放這裡。
//
//  本檔**不得**出現任何體力數字、不得複製任何恢復或日期公式——
//  門檻與費率一律向 `platform/condition` 要。由 `tools/check_dev_quick_recovery.mjs`
//  的 mutation sentinel 守住。
// ============================================================================
import { CONDITION, isMatchFit } from "../../platform/condition/playerCondition.js";
import { featureEnabled } from "../../featureFlags.js";
import { isDebugMode } from "../../ui/debugMode.js";

/**
 * 兩層閘門，**兩層都成立**才顯示：
 *   1. `isDebugMode()`    —— 現在是不是測試模式（?debug=1 / localStorage / vite dev）
 *   2. `devQuickRecovery` —— 這個開發工具還在不在（單一旗標，關掉即全站消失）
 *
 * 正式站的預設情況兩層都不成立 ⇒ 玩家看不到，也按不到。
 * ⚠ 少掉任何一層，語意就從「測試工具」滑成「隱藏功能」，所以兩層都要在。
 */
export const devQuickRecoveryEnabled = () =>
  isDebugMode() && featureEnabled("devQuickRecovery");

/**
 * 這名選手要恢復到多少體力才「可出賽」。
 *
 * 從現值起反覆疊加**既有的**每日自然恢復量 `CONDITION.restPerDay`，
 * 直到 authoritative 的 `isMatchFit()` 判定通過為止。所以：
 *   · 沒有硬寫的體力數字——門檻與恢復量都來自 `CONDITION`
 *   · 不是第二套恢復公式——用的就是正式玩法每天在用的那個量
 *   · 永遠不可能比正式門檻寬鬆——停在 `isMatchFit()` 說 ok 的第一步
 *   · 門檻日後被調整，這裡自動跟著調整，不必回來改
 *
 * 迴圈上限只是防呆（費率被改成 0 或負數時不要卡死），不是行為的一部分。
 *
 * @returns {number} 目標體力（已經可出賽的人回傳現值，不動他）
 */
export function energyToMatchFit(player) {
  const start = Number.isFinite(Number(player?.energy)) ? Number(player.energy) : 0;
  let energy = start;
  for (let step = 0; step < 1000; step++) {
    if (isMatchFit({ ...player, energy })) return energy;
    if (!(CONDITION.restPerDay > 0)) break;   // 費率壞掉 ⇒ 不硬湊，照實回原值
    energy += CONDITION.restPerDay;
  }
  return energy;
}

/** 名單摘要（面板抬頭與 verifier 共用同一份判定，畫面不自己數一套）。 */
export const unfitPlayers = (players = []) => (players ?? []).filter((p) => !isMatchFit(p));
