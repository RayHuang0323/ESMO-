// ============================================================================
//  screens/common/matchPrepAction.js — 賽前主按鈕的身分判定（純函式）
//
//  ── 這是正式主按鈕狀態的**唯一**判定來源 ────────────────────────────────
//  `MatchPrepFrame`、`MatchQueuePanel` 與底部主按鈕都吃這一份輸出，
//  不得各自再判一次「現在能不能配對／能不能進場」。
//
//  放在 .js 而不是 .jsx 的理由：Node 匯入得了，驗證器才驗得到每一種狀態。
//  上一輪它曾經寫在 .jsx 裡，驗證只能用正則猜——那等於沒驗。
//
//  ⚠ 本檔**不做決策**，只把 store 已經算好的 view 翻譯成按鈕文案。
//    「票券有沒有效」「房間能不能進場」「場次能不能啟動」全部是 O4–O7
//    契約的結論（`canEnterMatchOf` / `canEnterRoom` / `validateSession`）。
//
//  ── 玩家只需要理解四步 ────────────────────────────────────────────────────
//      確認出賽陣容 → 尋找對手 → 雙方確認 → 進入 Ban/Pick
//  按鈕文案一律照這四步的語言寫，不出現票券、房間、場次等內部詞彙。
// ============================================================================
import { TICKET_STATES } from "../../platform/contracts/matchmaking.js";
import { SESSION_TERMINAL } from "../../platform/contracts/matchSession.js";

/** 四步流程的階段代碼（畫面用來畫步驟指示器）。 */
export const FLOW_STEPS = Object.freeze([
  { key: "lineup", label: "確認出賽陣容" },
  { key: "search", label: "尋找對手" },
  { key: "confirm", label: "雙方確認" },
  { key: "enter", label: "進入 Ban/Pick" },
]);

/**
 * 目前走到四步中的哪一步（0–3）。純推導，不判規則。
 */
export function flowStepOf({ view, room, session }) {
  if (session?.canLaunch || session?.state === "launched") return 3;
  if (room?.state === "ready_check" || room?.state === "confirmed") return 2;
  if (room?.state === "waiting" || view?.state === TICKET_STATES.matched) return 2;
  if (view?.state === TICKET_STATES.queued || view?.state === TICKET_STATES.validating) return 1;
  return 0;
}

/**
 * 「上一次沒成功，這是你的退路」這一類主動作的 key。
 * 一般配對是 `requeue`（重新排隊、會換對手），賽程是 `refixture`（重進同一場、不換對手）。
 * 畫面要判斷「現在是不是在給退路」時一律用這一份，不要再各自列舉字串。
 */
export const RETRY_ACTION_KEYS = Object.freeze(["requeue", "refixture"]);

const mmss = (sec) => {
  const s = Math.max(0, Number(sec) || 0);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * 底部主按鈕該長什麼樣。**唯一的流程推進點。**
 *
 * @param {{inFixture:boolean, fixtureId:string|null}} [fixture]
 *   這條流程綁在哪一場賽程（來自 `profileStore.matchFixtureContext()`）。
 *
 * @returns {{key:string, label:string, disabled:boolean, tone:string}}
 *   key ∈ enqueue | blocked | queued | waiting | confirm | launching | requeue | refixture
 */
export function primaryActionFor({ entryOk, view, room, session, mode = null, fixture = null }) {
  const st = view?.state ?? TICKET_STATES.idle;
  //  Q3.6：賽程區間內，「重新來過」＝重新進入**同一場賽程**，不是重新配對。
  //  一般配對會換掉對手（瀏覽器實測配到隨機隊伍），而賽程的對手是賽程決定的。
  //  ⚠ 這不是第二條賽事流程：它呼叫的是既有的 `startFixtureMatch()`
  //    （出賽用的同一支，內建 `allowRelaunch`）。
  const inFixture = !!fixture?.inFixture;
  const retry = inFixture
    ? { key: "refixture", label: "重新進入本場賽事", disabled: false, tone: "go" }
    : { key: "requeue", label: "重新配對", disabled: false, tone: "neutral" };

  //  ① 終局：票券或房間作廢 ⇒ 重新來過（**實際作廢並重新排隊**，不是回到起點）
  if (st === TICKET_STATES.rejected || st === TICKET_STATES.cancelled
    || room?.state === "expired" || room?.state === "cancelled") {
    return retry;
  }

  //  ② 已經啟動、但人回到賽前頁 ⇒ **可以回到那場比賽**
  //  ⚠ 這一條是正式驗收踩到的坑：進了 Ban/Pick 又離開，場次仍是 `launched`
  //    （一場沒打完的比賽），舊版只顯示停用的「進入 Ban/Pick…」⇒ **永久卡死**，
  //    而且一次性 launchToken 已經用掉，再按也沒用。
  //    O6 早就備好 `resumeSession`／`abandonSession`，只是 UI 從來沒接。
  if (session?.state === "launched" && (!mode || !session?.session?.mode || session.session.mode === mode)) {
    return { key: "resume", label: "返回進行中的比賽", disabled: false, tone: "go" };
  }
  if (session?.state === "launched" && mode && session?.session?.mode && session.session.mode !== mode) {
    return { key: "blocked", label: "另一個模式有進行中的比賽", disabled: true, tone: "off" };
  }
  //  ③ 場次已進入終局（打完／放棄／取消／逾期）⇒ 可以重新配對
  //  ⚠ 少了這一條一樣會卡死：放棄本場之後 room 仍是 `confirmed`，
  //    按鈕會落到下面「雙方已確認，準備進場…」的停用分支，玩家還是動不了。
  //    終局清單直接取自 O6 契約（`SESSION_TERMINAL`），不另外維護第二份。
  if (session?.state && SESSION_TERMINAL.includes(session.state)) {
    return retry;
  }
  //  ④ 場次已簽發且通過驗證 ⇒ 自動進入 Ban/Pick（按鈕只是狀態顯示，不需要玩家再按）
  if (session?.canLaunch) {
    return { key: "launching", label: "進入 Ban/Pick…", disabled: true, tone: "go" };
  }

  //  ③ 雙方確認階段
  if (room?.state === "ready_check") {
    if (!room.usReady) {
      const t = Number.isFinite(room.remainingSec) ? `（${room.remainingSec}s）` : "";
      return { key: "confirm", label: `確認進入對戰${t}`, disabled: false, tone: "warn" };
    }
    return { key: "waiting", label: "已確認，等待對手…", disabled: true, tone: "wait" };
  }
  if (room?.state === "confirmed") return { key: "waiting", label: "雙方已確認，準備進場…", disabled: true, tone: "wait" };
  if (room?.state === "waiting") return { key: "waiting", label: "對手已找到，開啟房間中…", disabled: true, tone: "wait" };

  //  ④ 尋找對手中
  if (st === TICKET_STATES.queued || st === TICKET_STATES.validating) {
    return { key: "queued", label: `正在尋找對手… ${mmss(view?.waitedSec)}`, disabled: true, tone: "wait" };
  }
  if (st === TICKET_STATES.matched) return { key: "waiting", label: "對手已找到，開啟房間中…", disabled: true, tone: "wait" };

  //  ⑤ 尚未開始
  return entryOk
    ? { key: "enqueue", label: "確認陣容並開始配對", disabled: false, tone: "go" }
    : { key: "blocked", label: "陣容尚未完成，無法開始配對", disabled: true, tone: "off" };
}

/**
 * 玩家看得懂的流程狀態句（正式畫面用；不含票券／房間／場次等內部詞彙）。
 */
export function flowStatusText({ entryOk, view, room, session, opponentName, fixture = null }) {
  const st = view?.state ?? TICKET_STATES.idle;
  //  Q3.6：賽程區間內的終局訊息要說清楚「對手不會換」，否則玩家會以為
  //  逾時＝這場聯賽沒了（實測就是這個誤解讓人去按重新配對）。
  const inFixture = !!fixture?.inFixture;
  if (st === TICKET_STATES.rejected) return view?.ticket?.reason ?? "配對被拒絕，請重新配對";
  if (st === TICKET_STATES.cancelled) return view?.ticket?.reason ?? "已取消配對，未進入對戰";
  if (room?.state === "expired") {
    return inFixture ? "確認逾時。這是聯賽賽程，可以重新進入本場，對手不會換" : "確認逾時，本次配對已取消";
  }
  if (room?.state === "cancelled") return room?.room?.reason ?? "本次對戰已取消";
  if (session?.state && SESSION_TERMINAL.includes(session.state)) {
    if (inFixture) return "本場賽事還沒打完，可以重新進入（對手不會換）";
    return session.state === "completed" ? "上一場已結束，可以開始新的配對" : "已放棄上一場，可以重新配對";
  }
  if (session?.state === "launched") return "你有一場進行中的對戰";
  if (session?.canLaunch) return "雙方已確認，正在進入 Ban/Pick";
  if (room?.state === "ready_check") {
    return room.usReady ? "你已確認，等待對手確認" : "對手已就緒，請確認進入對戰";
  }
  if (room?.state === "confirmed") return "雙方已確認，正在準備場次";
  if (room?.state === "waiting" || st === TICKET_STATES.matched) {
    return opponentName ? `已找到對手：${opponentName}` : "已找到對手，正在開啟房間";
  }
  if (st === TICKET_STATES.queued || st === TICKET_STATES.validating) return "正在尋找對手…";
  return entryOk ? "陣容已就緒，可以開始配對" : "請先補滿出賽陣容";
}
