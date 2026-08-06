// ============================================================================
//  screens/common/matchPrepAction.js — 賽前主按鈕的身分判定（純函式）
//
//  ── 為什麼獨立成一支 .js ──────────────────────────────────────────────────
//  這段是整個賽前流程唯一的「現在該做什麼」判定，值得被獨立驗證。
//  放在 .jsx 裡 Node 匯入不了（JSX 語法），驗證器就只能用正則猜——
//  那等於沒驗到。抽出來之後 `check_acceptance_fix_p1` 可以直接呼叫它，
//  把九種狀態一條一條驗過。
//
//  ⚠ 這裡**不做任何決策**，只是把 store 已經算好的 view 翻譯成按鈕文案：
//  「能不能進場」「票券有沒有效」全部是 O4–O7 契約的結論，本檔不重判。
// ============================================================================
import { TICKET_STATES } from "../../platform/contracts/matchmaking.js";

/**
 * 底部主按鈕該長什麼樣。**唯一的流程推進點。**
 *
 * @param {object} p
 * @param {boolean} p.entryOk  出賽申請是否通過驗證
 * @param {object}  p.view     matchmakingView()
 * @param {object}  p.room     matchRoomView()
 * @param {object}  p.session  matchSessionView()
 * @returns {{key:string, label:string, disabled:boolean, tone:string}}
 */
export function primaryActionFor({ entryOk, view, room, session }) {
  const st = view?.state ?? TICKET_STATES.idle;

  //  終局類：票券作廢 ⇒ 重新配對
  if (st === TICKET_STATES.rejected || st === TICKET_STATES.cancelled
    || room?.state === "expired" || room?.state === "cancelled") {
    return { key: "reset", label: "重新配對", disabled: false, tone: "neutral" };
  }
  //  場次已簽發且可進場 ⇒ 進入對戰
  if (session?.canLaunch) return { key: "launch", label: "進入對戰", disabled: false, tone: "go" };
  //  雙方確認階段
  if (room?.state === "ready_check") {
    return room.usReady
      ? { key: "wait", label: "等待對手確認…", disabled: true, tone: "wait" }
      : { key: "confirm", label: "我方確認", disabled: false, tone: "warn" };
  }
  if (room?.state === "waiting") return { key: "wait", label: "等待房間開啟…", disabled: true, tone: "wait" };
  if (room?.state === "confirmed") return { key: "wait", label: "場次簽發中…", disabled: true, tone: "wait" };
  //  排隊中
  if (st === TICKET_STATES.queued || st === TICKET_STATES.validating) {
    const s = Number(view?.waitedSec) || 0;
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return { key: "queued", label: `配對中… ${mm}:${ss}`, disabled: true, tone: "wait" };
  }
  if (st === TICKET_STATES.matched) return { key: "wait", label: "已配對，開啟房間中…", disabled: true, tone: "wait" };
  //  尚未排隊
  return entryOk
    ? { key: "enqueue", label: "確認陣容 → 開始配對", disabled: false, tone: "go" }
    : { key: "blocked", label: "陣容未通過驗證，無法配對", disabled: true, tone: "off" };
}
