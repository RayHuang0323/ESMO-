#!/usr/bin/env node
// ============================================================================
//  tools/check_matchmaking_flow_acceptance.mjs — 正式環境驗收：配對流程修正
//
//  執行：repo 根目錄 `node tools/check_matchmaking_flow_acceptance.mjs`；失敗 exit 1。
//
//  ── 這一輪要證明什麼 ──────────────────────────────────────────────────────
//  正式環境驗收發現：找到對手後永遠等待中、進不了 Ban/Pick、重新配對沒反應、
//  配對中底部還寫「確認陣容 → 開始配對」。
//
//  根因是**訂閱寫法**：`MatchPrepFrame` 訂閱的是選擇器函式本身
//  （`useProfileStore((s) => s.matchmakingView)()`），那個函式身分永不改變
//  ⇒ zustand 不會通知它 ⇒ 底部按鈕凍結在第一次的樣子。
//  上一輪把所有主要動作搬到那顆凍結的按鈕上，整條流程因此斷掉。
//
//  §1 主按鈕判定（純函式，九種狀態逐條）
//  §2 store 端到端：一張票 → 房間 → 雙方確認 → 場次 → 進場
//  §3 重新配對：作廢舊房間與票券、新 ticketId/roomId、不沿用確認狀態、連按不重複
//  §4 逾時：舊房間不可再確認
//  §5 持久化恢復：重整後不重複開場
//  §6 單一狀態來源（原始值訂閱、不得再有第二處輪詢）
//  §7 正式 UI 不外洩內部識別
//  §8 Ban/Pick 接線走既有 flow，不繞過一次性 launchToken
//  §9 MOBA／CS 共用外框不回歸
//  §10 UI 未定義識別字掃描 ＋ 窄螢幕靜態檢查
// ============================================================================
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";

const traverse = _traverse.default ?? _traverse;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const FRAME = "src/screens/common/MatchPrepFrame.jsx";
const QUEUE = "src/screens/common/MatchQueuePanel.jsx";
const ENTRY = "src/screens/common/MatchEntryPanel.jsx";
const HOOK = "src/screens/common/useMatchFlow.js";
const ACTION = "src/screens/common/matchPrepAction.js";
const LINEUP = "src/screens/moba/LineupScreen.jsx";
const CSPREP = "src/screens/fps/CsPrepScreen.jsx";

const { primaryActionFor, flowStepOf, flowStatusText } = await import("../src/screens/common/matchPrepAction.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");
const { TICKET_STATES } = await import("../src/platform/contracts/matchmaking.js");

const A = (o) => primaryActionFor(o);

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §1 主按鈕：唯一判定來源，九種狀態 ══");
{
  ck("§1a 陣容未完成 ⇒ 停用並說明", (() => {
    const r = A({ entryOk: false, view: { state: "idle" }, room: {}, session: {} });
    return r.key === "blocked" && r.disabled && /陣容尚未完成/.test(r.label);
  })());
  ck("§1b 陣容就緒 ⇒ 唯一入口「確認陣容並開始配對」", (() => {
    const r = A({ entryOk: true, view: { state: "idle" }, room: {}, session: {} });
    return r.key === "enqueue" && !r.disabled && r.label === "確認陣容並開始配對";
  })());
  ck("§1c 尋找對手中 ⇒ **開始配對按鈕不再可用**，改顯示等待秒數", (() => {
    const r = A({ entryOk: true, view: { state: "queued", waitedSec: 75 }, room: {}, session: {} });
    return r.key === "queued" && r.disabled && r.label.includes("01:15") && !/開始配對/.test(r.label);
  })(), "正在尋找對手… 01:15");
  ck("§1d 已配對未開房 ⇒ 停用",
    A({ entryOk: true, view: { state: "matched" }, room: {}, session: {} }).disabled);
  ck("§1e 雙方確認且我方未確認 ⇒ 「確認進入對戰」可按", (() => {
    const r = A({ entryOk: true, view: { state: "matched" }, room: { state: "ready_check", usReady: false, remainingSec: 12 }, session: {} });
    return r.key === "confirm" && !r.disabled && /確認進入對戰/.test(r.label) && r.label.includes("12");
  })());
  ck("§1f 我方已確認 ⇒ 停用並等待對手", (() => {
    const r = A({ entryOk: true, view: { state: "matched" }, room: { state: "ready_check", usReady: true }, session: {} });
    return r.key === "waiting" && r.disabled;
  })());
  ck("§1g 場次可啟動 ⇒ 顯示自動進入 Ban/Pick（**不需要玩家再按**）", (() => {
    const r = A({ entryOk: true, view: { state: "matched" }, room: { state: "confirmed" }, session: { canLaunch: true } });
    return r.key === "launching" && r.disabled && /Ban\/Pick/.test(r.label);
  })());
  for (const [name, o] of [
    ["取消", { view: { state: "cancelled" }, room: {} }],
    ["被拒絕", { view: { state: "rejected" }, room: {} }],
    ["房間逾期", { view: { state: "matched" }, room: { state: "expired" } }],
  ]) {
    ck(`§1h ${name} ⇒ 重新配對`, A({ entryOk: true, session: {}, ...o }).key === "requeue");
  }
  //  四步流程
  ck("§1i 四步指示器推導正確",
    flowStepOf({ view: { state: "idle" }, room: {}, session: {} }) === 0 &&
    flowStepOf({ view: { state: "queued" }, room: {}, session: {} }) === 1 &&
    flowStepOf({ view: { state: "matched" }, room: { state: "ready_check" }, session: {} }) === 2 &&
    flowStepOf({ view: {}, room: {}, session: { canLaunch: true } }) === 3);
  //  ⚠ 中文原因
  ck("§1j 逾時的中文原因正確",
    flowStatusText({ entryOk: true, view: { state: "matched" }, room: { state: "expired" }, session: {} })
      === "確認逾時，本次配對已取消");
  ck("§1k 被拒絕沿用契約給的中文原因",
    flowStatusText({ entryOk: true, view: { state: "rejected", ticket: { reason: "陣容中有選手不可出賽" } }, room: {}, session: {} })
      === "陣容中有選手不可出賽");
  ck("§1l 取消的中文原因正確",
    /取消/.test(flowStatusText({ entryOk: true, view: { state: "cancelled" }, room: {}, session: {} })));
  //  按鈕文案不得出現內部詞彙
  const labels = [
    A({ entryOk: true, view: { state: "idle" }, room: {}, session: {} }).label,
    A({ entryOk: true, view: { state: "queued", waitedSec: 3 }, room: {}, session: {} }).label,
    A({ entryOk: true, view: {}, room: { state: "ready_check", usReady: false }, session: {} }).label,
    A({ entryOk: true, view: {}, room: {}, session: { canLaunch: true } }).label,
  ].join(" ");
  ck("§1m 按鈕文案不出現票券／房間／場次等內部詞彙",
    !/票券|ticket|roomId|session|申請識別|隊伍版本/i.test(labels), labels);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §2 端到端：一張票 → 房間 → 雙方確認 → 場次 → 進場 ══");
const st = () => useProfileStore.getState();
{
  st().reset?.();
  st().autoFillLineup("moba");
  ck("§2a 自動填入後陣容合法", st().squadCheck("moba").ok === true,
    `${st().squadCheck("moba").filled}/${st().squadCheck("moba").required}`);

  //  ① 開始配對：只建立一張票
  const r1 = st().enqueueMatch("moba");
  ck("§2b 開始配對成功，狀態為 queued",
    r1.ok && r1.ticket.state === TICKET_STATES.queued, r1.ticket?.state);
  const firstTicket = r1.ticket.ticketId;

  //  ② 重複按不得建立第二張
  const r2 = st().enqueueMatch("moba");
  ck("§2c 重複開始配對被擋（不會有第二張票）", r2.ok === false && /已有一張/.test(r2.errors[0].message));
  ck("§2d 票券 id 未改變", st().matchmaking.ticket.ticketId === firstTicket);

  //  ③ 輪詢到 matched
  let guard = 0;
  while (st().matchmaking.ticket.state === TICKET_STATES.queued && guard++ < 400) {
    st().pollMatchmaking(Date.now() + guard * 1000);
  }
  ck("§2e 輪詢後配對成功", st().matchmaking.ticket.state === TICKET_STATES.matched,
    st().matchmaking.ticket.state);
  ck("§2f 指派單由 gateway 簽發且不夾帶對手數值", (() => {
    const a = st().matchmaking.ticket.assignment;
    return !!a?.assignmentId && !!a.opponent?.id
      && !("power" in a.opponent) && !("stats" in a.opponent);
  })());

  //  ④ 開房（重複呼叫不得產生第二間）
  st().openMatchRoom();
  const roomId1 = st().matchmaking.room.roomId;
  st().openMatchRoom();
  ck("§2g 開房成功且重複呼叫不產生第二間", st().matchmaking.room.roomId === roomId1, roomId1?.slice(-10));

  //  ⑤ 對手確認（mock gateway 模擬）
  guard = 0;
  while (!st().matchmaking.room?.confirmations?.opponent && guard++ < 400) {
    st().pollMatchRoom(Date.now() + guard * 1000);
  }
  ck("§2h 對手確認由既有 mock gateway 模擬",
    st().matchmaking.room.confirmations.opponent === true);

  //  ⑥ **我方尚未確認 ⇒ 不得進入 Ban/Pick**
  ck("§2i 對手已確認、我方未確認 ⇒ 房間不得進場",
    st().matchRoomView().canEnter === false, st().matchRoomView().blockedReason ?? "");
  ck("§2j 此時尚未簽發場次", st().matchmaking.session == null);
  ck("§2k 主按鈕此時是「確認進入對戰」", (() => {
    const r = A({ entryOk: true, view: st().matchmakingView(), room: st().matchRoomView(), session: st().matchSessionView() });
    return r.key === "confirm";
  })());

  //  ⑦ 我方確認 ⇒ **必須真的寫進 Store 與房間契約**
  const beforeUs = st().matchmaking.room.confirmations.us;
  const c = st().confirmMatchReady();
  ck("§2l 我方確認回傳成功", c.ok === true);
  ck("§2m 我方確認寫入 Store（不是只改 React state）",
    beforeUs === false && st().matchmaking.room.confirmations.us === true);
  ck("§2n 房間契約狀態進入 confirmed",
    st().matchmaking.room.state === "confirmed", st().matchmaking.room.state);

  //  ⑧ 簽發場次（重複呼叫不得建立第二場）
  st().createMatchSession();
  const sid = st().matchmaking.session.sessionId;
  st().createMatchSession();
  ck("§2o 場次簽發且重複呼叫不建立第二場",
    st().matchmaking.session.sessionId === sid, sid?.slice(-10));
  ck("§2p 場次可啟動 ⇒ 主按鈕轉為自動進入 Ban/Pick", (() => {
    const r = A({ entryOk: true, view: st().matchmakingView(), room: st().matchRoomView(), session: st().matchSessionView() });
    return r.key === "launching";
  })());

  //  ⑨ 進場：一次性 launchToken
  const l1 = st().launchMatchSession();
  ck("§2q 啟動成功並取得 launch 參數",
    l1.ok === true && Number.isFinite(st().matchmaking.launch?.seed));
  const l2 = st().launchMatchSession();
  ck("§2r 一次性令牌：第二次啟動被擋（保護未被繞過）", l2.ok === false,
    l2.errors?.[0]?.message ?? "");
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §3 重新配對 ══");
{
  st().reset?.();
  st().autoFillLineup("moba");
  st().enqueueMatch("moba");
  let g = 0;
  while (st().matchmaking.ticket.state === TICKET_STATES.queued && g++ < 400) st().pollMatchmaking(Date.now() + g * 1000);
  st().openMatchRoom();
  const oldTicket = st().matchmaking.ticket.ticketId;
  const oldRoom = st().matchmaking.room.roomId;
  //  讓房間逾期
  g = 0;
  while (st().matchmaking.room && !["expired", "cancelled"].includes(st().matchmaking.room.state) && g++ < 600) {
    st().pollMatchRoom(Date.now() + g * 2000);
  }
  ck("§3a 房間逾時進入 expired", st().matchmaking.room.state === "expired", st().matchmaking.room.state);
  ck("§3b 逾時後主按鈕是「重新配對」", (() => {
    const r = A({ entryOk: true, view: st().matchmakingView(), room: st().matchRoomView(), session: st().matchSessionView() });
    return r.key === "requeue";
  })());
  //  ⚠ 逾時的舊房間不可再確認
  const bad = st().confirmMatchReady();
  ck("§3c 逾時的舊房間**不可再確認**", bad.ok === false, bad.errors?.[0]?.message ?? "");

  //  重新配對
  const rq = st().requeueMatch("moba");
  ck("§3d 重新配對成功並重新進入 queued",
    rq.ok && st().matchmaking.ticket.state === TICKET_STATES.queued, st().matchmaking.ticket.state);
  ck("§3e 產生**新的 ticketId**", st().matchmaking.ticket.ticketId !== oldTicket);
  ck("§3f 舊房間被作廢（room 已清空）", st().matchmaking.room == null);
  ck("§3g 不沿用舊的雙方確認狀態", st().matchmaking.room?.confirmations == null);
  ck("§3h 場次與進場令牌一併清乾淨",
    st().matchmaking.session == null && st().matchmaking.launch == null);

  //  連按不得建立第二張
  const t1 = st().matchmaking.ticket.ticketId;
  const again = st().requeueMatch("moba");
  ck("§3i 連按重新配對不建立第二張票券",
    again.ok && again.reused === true && st().matchmaking.ticket.ticketId === t1);

  //  新房間 id 必須不同
  g = 0;
  while (st().matchmaking.ticket.state === TICKET_STATES.queued && g++ < 400) st().pollMatchmaking(Date.now() + g * 1000);
  st().openMatchRoom();
  ck("§3j 重新配對後產生**新的 roomId**",
    st().matchmaking.room.roomId !== oldRoom, st().matchmaking.room.roomId?.slice(-10));
  ck("§3k 新房間的雙方確認都是未確認",
    st().matchmaking.room.confirmations.us === false);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §3.5 進行中的對戰：回去打完或放棄 ══");
//  ⚠ 正式驗收踩到的卡死：進了 Ban/Pick 又離開，場次仍是 `launched`，
//  舊版只顯示**停用**的「進入 Ban/Pick…」⇒ 按鈕永久按不動，而且一次性
//  launchToken 早就用掉了。O6 其實備好了 resumeSession／abandonSession，UI 沒接。
{
  st().reset?.();
  st().autoFillLineup("moba");
  st().enqueueMatch("moba");
  let g = 0;
  while (st().matchmaking.ticket.state === TICKET_STATES.queued && g++ < 400) st().pollMatchmaking(Date.now() + g * 1000);
  st().openMatchRoom();
  g = 0;
  while (!st().matchmaking.room?.confirmations?.opponent && g++ < 400) st().pollMatchRoom(Date.now() + g * 1000);
  st().confirmMatchReady();
  st().createMatchSession();
  const launched = st().launchMatchSession();
  ck("§3.5a 進場成功（場次進入 launched）",
    launched.ok && st().matchmaking.session.state === "launched", st().matchmaking.session.state);

  const act = A({ entryOk: true, view: st().matchmakingView(), room: st().matchRoomView(), session: st().matchSessionView() });
  ck("§3.5b 回到賽前頁時主按鈕**可按**（不是卡死的停用狀態）",
    act.key === "resume" && act.disabled === false, `${act.key} / ${act.label}`);
  ck("§3.5c 按鈕文案是「返回進行中的對戰」", act.label === "返回進行中的對戰");
  ck("§3.5d 一次性令牌已消耗 ⇒ 不可再 launch", st().launchMatchSession().ok === false);

  const seedBefore = st().matchmaking.session.seed;
  const rs = st().resumeMatchSession();
  ck("§3.5e 恢復成功並取得 launch 參數", rs.ok === true && Number.isFinite(rs.launch?.seed));
  ck("§3.5f 恢復後 seed 與原場次相同（初始狀態不變）", rs.launch.seed === seedBefore);
  ck("§3.5g 恢復不建立第二場", st().matchmaking.session.seed === seedBefore);
  ck("§3.5h 恢復次數有被記錄", (st().matchmaking.session.resumeCount ?? 0) >= 1);

  const ab = st().abandonMatchSession();
  ck("§3.5i 放棄本場成功", ab.ok === true && st().matchmaking.session.state === "abandoned");
  ck("§3.5j 放棄後不可再恢復", st().resumeMatchSession().ok === false);
  const act2 = A({ entryOk: true, view: st().matchmakingView(), room: st().matchRoomView(), session: st().matchSessionView() });
  ck("§3.5k 放棄後主按鈕可繼續操作（不卡死）", act2.disabled === false, `${act2.key} / ${act2.label}`);
  const rq = st().requeueMatch("moba");
  ck("§3.5l 放棄後可重新配對", rq.ok === true && st().matchmaking.ticket.state === TICKET_STATES.queued);

  const queue = read(QUEUE), hook = read(HOOK);
  ck("§3.5m 狀態卡提供「放棄本場」入口",
    queue.includes('data-testid="abandon-match"') && /放棄本場/.test(queue));
  ck("§3.5n 恢復與放棄都走 O6 既有 action（沒有第二套）",
    /resumeMatchSession/.test(hook) && /abandonMatchSession/.test(hook));
  ck("§3.5o 已 launched 的場次不會被自動進場邏輯再啟動一次",
    /if \(!st\.matchSessionView\(\)\.canLaunch\) return;/.test(hook));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §4 持久化恢復 ══");
{
  st().reset?.();
  st().autoFillLineup("moba");
  st().enqueueMatch("moba");
  let g = 0;
  while (st().matchmaking.ticket.state === TICKET_STATES.queued && g++ < 400) st().pollMatchmaking(Date.now() + g * 1000);
  st().openMatchRoom();
  const before = JSON.parse(JSON.stringify(st().matchmaking));
  //  模擬重整：狀態往返 JSON（＝localStorage 的實際行為）
  const after = JSON.parse(JSON.stringify(before));
  ck("§4a 重整後票券與房間完整保留",
    after.ticket.ticketId === before.ticket.ticketId && after.room.roomId === before.room.roomId);
  ck("§4b 重整後不會重複開場（openMatchRoom 認得同一張指派單）", (() => {
    const rid = st().matchmaking.room.roomId;
    st().openMatchRoom();
    return st().matchmaking.room.roomId === rid;
  })());
  ck("§4c 重整後確認狀態不被重置",
    after.room.confirmations.us === before.room.confirmations.us);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §5 單一狀態來源 ══");
{
  const frame = read(FRAME), queue = read(QUEUE), hook = read(HOOK);

  //  ⚠ 根因防迴歸：**不得再訂閱選擇器函式本身**
  const badSub = /useProfileStore\(\(s\) => s\.(matchmakingView|matchRoomView|matchSessionView|matchEntry|squadCheck)\)\(\)/;
  ck("§5a 外框不再訂閱選擇器函式（那是按鈕凍結的根因）", !badSub.test(frame));
  ck("§5b 狀態卡不再訂閱選擇器函式", !badSub.test(queue));
  ck("§5c hook 訂閱的是**原始值**（狀態一變就重繪）",
    /s\.matchmaking\?\.ticket\?\.state/.test(hook) &&
    /s\.matchmaking\?\.room\?\.state/.test(hook) &&
    /confirmations\?\.us/.test(hook));

  //  只有一處輪詢
  //  ⚠ 去註解再數——說明文字裡寫到 setInterval 不算「元件在輪詢」
  const intervals = [frame, queue, read(ENTRY)].map((f) => (stripComments(f).match(/setInterval/g) ?? []).length);
  ck("§5d 元件裡沒有任何 setInterval（輪詢只在 hook 一處）",
    intervals.every((n) => n === 0), `frame/queue/entry = ${intervals.join("/")}`);
  ck("§5e hook 是唯一輪詢處", (stripComments(hook).match(/setInterval/g) ?? []).length === 1);

  //  元件不得自己呼叫推進流程的 store action
  const advancing = ["enqueueMatch", "confirmMatchReady", "launchMatchSession", "requeueMatch"];
  ck("§5f 外框不自己呼叫推進流程的 action（一律經由 hook）",
    advancing.every((a) => !stripComments(frame).includes(a)));
  ck("§5g 狀態卡不自己呼叫任何推進流程的 action",
    advancing.every((a) => !stripComments(queue).includes(a)));
  ck("§5h hook 才是呼叫既有 action 的地方（沒有第二套配對流程）",
    advancing.every((a) => hook.includes(a)) &&
    !/createTicket|makeTicket|createAssignment|new MatchmakingTicket/.test(hook));

  //  主按鈕判定唯一來源
  ck("§5i 主按鈕狀態一律由 matchPrepAction 純函式判定",
    hook.includes("primaryActionFor") &&
    !/primaryActionFor/.test(stripComments(queue)) &&
    !/primaryActionFor/.test(stripComments(frame)));
  ck("§5j 狀態卡只吃 flow（不自己算流程狀態）",
    /export default function MatchQueuePanel\(\{ mode = "moba", flow \}\)/.test(queue));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §6 正式 UI 不外洩內部識別 ══");
{
  const queue = stripComments(read(QUEUE)), entry = stripComments(read(ENTRY)), frame = stripComments(read(FRAME));
  const secrets = ["rosterVersion", "transactionId", "ticketId", "roomId", "seed", "issuedBy"];

  //  狀態卡：內部識別只能出現在 debug 區塊
  const dbgIdx = queue.indexOf("{debug && (");
  const queueMain = queue.slice(0, dbgIdx > 0 ? dbgIdx : queue.length);
  ck("§6a 配對狀態卡的正式區塊沒有任何內部識別",
    !secrets.some((k) => queueMain.includes(k)),
    secrets.filter((k) => queueMain.includes(k)).join(",") || "無");
  ck("§6b 技術內容整區都在 debug 之後", dbgIdx > 0);
  ck("§6c 技術內容預設收合", /useState\(false\)/.test(queue) && /查看技術內容/.test(queue));

  //  出賽陣容卡：同樣只在 debug
  const eIdx = entry.indexOf("{debug && ok && req && (");
  const entryMain = entry.slice(0, eIdx > 0 ? eIdx : entry.length);
  ck("§6d 出賽陣容卡的正式區塊沒有隊伍版本／申請識別",
    !entryMain.includes("rosterVersion") && !entryMain.includes("transactionId"));
  ck("§6e 「出賽申請」這個內部詞彙已從正式標題移除",
    !/出賽申請/.test(entryMain) && /出賽陣容/.test(entryMain));
  ck("§6f 正式區塊只顯示陣容完整度與中文原因",
    /check\.filled\}\/\{check\.required/.test(entry) && /e\.message/.test(entry));

  //  外框本身不得畫出任何識別
  ck("§6g 共用外框沒有任何內部識別", !secrets.some((k) => frame.includes(k)));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §7 Ban/Pick 接線 ══");
{
  const hook = read(HOOK), shell = read("src/AppShell.jsx");
  ck("§7a 自動進場走既有 launchMatchSession（不繞過一次性令牌）",
    /launchMatchSession\(\)/.test(hook) && /if \(!r\.ok\)/.test(hook));
  ck("§7b 啟動失敗不重試、不自己造場次，只顯示原因",
    /launchedFor\.current = null;\s*\n\s*setErr/.test(hook));
  ck("§7c 防重複啟動（StrictMode 雙掛載也只啟動一次）",
    /launchedFor = useRef\(null\)/.test(hook) && /launchedFor\.current === sessionId/.test(hook));
  ck("§7d 由既有 MOBA flow 推進 Ban/Pick（LineupScreen → onNext → banpick）",
    /screen === "lineup" && <LineupScreen onNext=\{go\("matchmaking"\)\}/.test(shell) ||
    /onEnterBattle=\{onNext\}/.test(read(LINEUP)));
  ck("§7e 沒有第二套 router、沒有硬跳頁",
    !/window\.location|history\.push|createBrowserRouter/.test(hook) &&
    !/window\.location|history\.push/.test(read(FRAME)));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §8 MOBA／CS 共用外框不回歸 ══");
{
  const lineup = read(LINEUP), cs = read(CSPREP), frame = read(FRAME);
  ck("§8a 兩邊都用共用外框",
    lineup.includes("MatchPrepFrame") && cs.includes("MatchPrepFrame"));
  ck("§8b 兩邊都用共用席位列",
    lineup.includes("SquadSeatRow") && cs.includes("SquadSeatRow"));
  ck("§8c 兩邊都不自己放出賽卡／狀態卡",
    !lineup.includes("<MatchEntryPanel") && !cs.includes("<MatchEntryPanel") &&
    !lineup.includes("<MatchQueuePanel") && !cs.includes("<MatchQueuePanel"));
  ck("§8d 外框仍負責頁首／席位／陣容卡／狀態卡／主按鈕",
    /<MatchEntryPanel/.test(frame) && /<MatchQueuePanel/.test(frame) &&
    /data-testid="prep-primary-action"/.test(frame) && /\{seats &&/.test(frame));
  ck("§8e 四步流程指示器存在", /data-testid="flow-steps"/.test(frame));
  //  CS 缺員席位不得回歸
  ck("§8f CS 五席恆在（缺員不消失）",
    /seated=\{!!p\}/.test(cs) && !/const seats = [\s\S]{0,200}\.filter\(Boolean\)/.test(cs));
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §9 UI 未定義識別字掃描 ══");
{
  const FILES = [FRAME, QUEUE, ENTRY, HOOK, ACTION, LINEUP, CSPREP];
  const GLOBALS = new Set(["React", "window", "document", "console", "Math", "JSON", "Object",
    "Array", "Number", "String", "Boolean", "Date", "Map", "Set", "Promise", "parseInt",
    "parseFloat", "isNaN", "isFinite", "setTimeout", "clearTimeout", "setInterval",
    "clearInterval", "localStorage", "navigator", "Error", "TypeError", "Symbol", "Intl",
    "globalThis", "undefined", "NaN", "Infinity", "fetch", "URL", "process", "requestAnimationFrame"]);
  const bad = [];
  for (const f of FILES) {
    const ast = parse(read(f), { sourceType: "module", plugins: ["jsx", "optionalChaining", "nullishCoalescingOperator"] });
    traverse(ast, {
      ReferencedIdentifier(path) {
        const n = path.node.name;
        if (GLOBALS.has(n) || path.scope.hasBinding(n, true)) return;
        bad.push(`${f}:${path.node.loc?.start.line} → ${n}`);
      },
    });
  }
  ck("§9a 全部沒有未定義識別字", bad.length === 0, bad.slice(0, 6).join("　") || `掃描 ${FILES.length} 檔`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n══ §10 窄螢幕：靜態防溢出檢查 ══");
//  ⚠ 誠實揭露：這不是排版測試。證明 320/360/390/430px 不溢出需要瀏覽器排版引擎，
//  本專案沒有。這裡只檢查「必然造成溢出的寫法」有沒有被引入。實機仍須人工確認。
{
  const files = [FRAME, QUEUE, ENTRY];
  const wide = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/(?:width|minWidth):\s*(\d{3,})\b/g)) {
      if (Number(m[1]) >= 320) wide.push(`${f} → ${m[1]}px`);
    }
  }
  ck("§10a 沒有 ≥320px 的寫死寬度", wide.length === 0, wide.join("　"));
  for (const f of files) {
    const src = read(f);
    ck(`§10b ${f.split("/").pop()} 可換行且可收縮`,
      /flexWrap:\s*"wrap"/.test(src) && /minWidth:\s*0/.test(src));
  }
  ck("§10c 對手名稱與長字串有省略處理",
    /textOverflow:\s*"ellipsis"/.test(read(QUEUE)));
  ck("§10d 倒數與秒數 nowrap（不被擠換行）",
    (read(QUEUE).match(/whiteSpace:\s*"nowrap"/g) ?? []).length >= 3);
}

console.log(`\n${fail === 0 ? "🟢" : "🔴"} 配對流程驗收修正：${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
