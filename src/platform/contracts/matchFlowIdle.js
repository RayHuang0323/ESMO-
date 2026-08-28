// ============================================================================
//  src/platform/contracts/matchFlowIdle.js
//      「這條配對流程還在跑嗎？」——**唯一判定處**（TD-44）
//
//  ── 為什麼要獨立成一支 ─────────────────────────────────────────────────
//  同一個問題本來有兩份答案，而且只有一份是對的：
//
//    · `matchPrepAction.canStartPracticeFrom()` 自己算過一次終局，算得對——
//      它知道「場次走到終局時，殘留的 `confirmed` 房間要視為閒置」。
//    · `profileStore.matchPracticeContext()` 完全沒算終局，只看 `origin.kind`。
//      於是打完一場快速練習之後，殘留的 `session=completed/practice` ＋
//      `room=confirmed/practice` 讓「還在練習中」**永遠為真**：賽前頁停在
//      practice 層級、主按鈕只剩「重新開始快速練習」、一般對戰的名稱與今日
//      容量再也看不到，而且重整與推進天數都清不掉（TD-44）。
//
//  ⇒ 把那份對的判定抽出來，兩邊共用。**不要再各自維護第二份終局清單。**
//
//  ── 兩個坑（都是瀏覽器實測才抓到的，改這裡之前先讀完）──────────────────
//  ① 「閒置」要看**還活著沒有**，不是「有沒有值」。寫成 `!session && !room`
//     的話，打完任何一場之後殘留的終局場次會讓判定永遠為假。
//  ② 房間**不能**直接套 `ROOM_TERMINAL`：那份清單把 `confirmed` 也算終局
//     （房間的任務確實完成了），但簽場次的那一刻流程正要進場，絕不是閒置。
//     ⇒ 房間自己只認 `cancelled` / `expired`；`confirmed` 要不要算閒置，
//       **綁在場次上**——場次已終局才算，場次是 null 代表正要進場。
// ============================================================================
import { SESSION_TERMINAL } from "./matchSession.js";

/**
 * 房間自己就算作廢的狀態。
 * ⚠ 刻意**不是** `ROOM_TERMINAL`——理由見檔頭第 ② 點。
 */
export const ROOM_IDLE_STATES = Object.freeze(["cancelled", "expired"]);

/**
 * 這條流程現在算不算閒置。
 *
 * @param {object} p
 * @param {string|null} p.roomState     房間狀態（`ROOM_STATES` 之一或 null）
 * @param {string|null} p.sessionState  場次狀態（`SESSION_STATES` 之一或 null）
 * @returns {{sessionOver:boolean, sessionIdle:boolean, roomIdle:boolean, idle:boolean}}
 *   sessionOver 場次已走到終局（completed／abandoned／cancelled／expired）
 *   sessionIdle 沒有場次，或場次已終局
 *   roomIdle    沒有房間、房間已作廢，或場次已終局（殘留的 confirmed 不算數）
 *   idle        兩者皆閒置 ⇒ 這條流程已經結束了
 */
export function matchFlowIdleFrom({ roomState = null, sessionState = null } = {}) {
  const sessionOver = !!sessionState && SESSION_TERMINAL.includes(sessionState);
  const sessionIdle = !sessionState || sessionOver;
  const roomIdle = !roomState || ROOM_IDLE_STATES.includes(roomState) || sessionOver;
  return { sessionOver, sessionIdle, roomIdle, idle: sessionIdle && roomIdle };
}
