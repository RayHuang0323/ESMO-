#!/usr/bin/env node
// ============================================================================
//  tools/check_td44_practice_exit.mjs — TD-44：練習打完之後要回得到一般對戰
//
//  執行：repo 根目錄 `node tools/check_td44_practice_exit.mjs`；失敗 exit 1。
//
//  ── TD-44 是什麼 ────────────────────────────────────────────────────────
//  打完一場快速練習之後，MOBA **與 CS** 的賽前頁都永久停在 `tier=practice`，
//  主按鈕只剩「重新開始快速練習」，一般對戰的名稱與今日 N/3 容量再也看不到；
//  重整、推 1 天、再推 7 天都清不掉。2026-08-28 的正式站 smoke 實測到。
//
//  根因：同一個問題有兩份答案，只有一份是對的。
//    · `canStartPracticeFrom()` 自己算過終局，算得對。
//    · `matchPracticeContext().inPractice` 只看 `origin.kind`，沒算終局
//      ⇒ 殘留的 `session=completed/practice` ＋ `room=confirmed/practice`
//        讓「還在練習中」永遠為真。
//
//  ── 修法，以及**為什麼不能只改一個旗標** ────────────────────────────────
//  `inPractice` 有兩類消費者，需求相反：
//
//    結算端（`battle/useBattleFeed.js`、`progress/settleCsMatch.js`）
//      問的是「這一場的來源是不是練習」。⚠ `settleCsMatch` 第 4 步（入史）
//      的讀取時機**在 `settleMatchThroughSession` 之後**——那時場次已經
//      `completed`。把終局判定加進 `inPractice`，練習賽會立刻開始寫 CS 戰績。
//
//    賽前頁（層級橫幅、主按鈕退路、「快速練習」次要按鈕）
//      問的是「**現在**還在練習流程裡嗎」。
//
//  ⇒ 拆成兩個欄位：`inPractice`（原意，不動）＋ `activePractice`（新）。
//    終局判定抽到 `contracts/matchFlowIdle.js`，與 `canStartPracticeFrom`
//    共用同一份，不再有第二套。
//
//  §I 共用 predicate 的真值表        §S 判定只有一份
//  §C matchPracticeContext 兩個欄位   §A 結算端語意不得被動到
//  §U 賽前頁必須改讀 activePractice   §E 端到端（純函式層）
//  §M mutation sentinel
// ============================================================================
import fs from "fs";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve, join } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};

//  只掃程式碼，不掃註解——本檔好幾條規則的理由本身就寫在註解裡，
//  掃到註解會讓「規則還在嗎」永遠是綠的。
const codeOnly = (s) => s.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_IDLE = "src/platform/contracts/matchFlowIdle.js";
const P_PREP = "src/screens/common/matchPrepAction.js";
const P_FLOW = "src/screens/common/useMatchFlow.js";
const P_STORE = "src/platform/profileStore.js";
const P_FEED = "src/battle/useBattleFeed.js";
const P_CSSETTLE = "src/platform/progress/settleCsMatch.js";

const idleMod = await imp(P_IDLE);
const prep = await imp(P_PREP);
const srcMod = await imp("src/platform/progress/matchSource.js");
const originMod = await imp("src/platform/contracts/matchOrigin.js");

const { matchFlowIdleFrom } = idleMod;
const { canStartPracticeFrom, primaryActionFor } = prep;
const { matchTierOf, MATCH_SOURCE } = srcMod;
const { ORIGIN_KINDS } = originMod;

// ════════════════════════════════════════════════════════════════════════════
//  §I 共用 predicate 的真值表
// ════════════════════════════════════════════════════════════════════════════
console.log("【§I 共用 predicate：matchFlowIdleFrom 真值表】");
const idle = (roomState, sessionState) => matchFlowIdleFrom({ roomState, sessionState }).idle;

ck("I1) 什麼都沒有 ⇒ 閒置", idle(null, null) === true);
ck("I2) 房間 waiting ⇒ 不閒置（正在開房）", idle("waiting", null) === false);
ck("I3) 房間 ready_check ⇒ 不閒置（等確認）", idle("ready_check", null) === false);
//  ⚠ 這一條是 `ROOM_TERMINAL` 不能直接拿來用的原因：房間的任務確實完成了，
//    但簽場次的那一刻流程正要進場，絕不是閒置。
ck("I4) 房間 confirmed 但**還沒有場次** ⇒ 不閒置（正要進場）", idle("confirmed", null) === false);
ck("I5) 房間 cancelled ⇒ 閒置", idle("cancelled", null) === true);
ck("I6) 房間 expired ⇒ 閒置", idle("expired", null) === true);
ck("I7) 場次 created ⇒ 不閒置", idle("confirmed", "created") === false);
ck("I8) 場次 launched ⇒ 不閒置（比賽進行中）", idle("confirmed", "launched") === false);
//  ⇒ TD-44 的核心：打完之後房間停在 confirmed，靠場次終局把它視為閒置。
ck("I9) 場次 completed ＋ 殘留 confirmed 房間 ⇒ **閒置**（TD-44 核心）",
  idle("confirmed", "completed") === true);
ck("I10) 場次 abandoned ⇒ 閒置", idle("confirmed", "abandoned") === true);
ck("I11) 場次 cancelled ⇒ 閒置", idle("confirmed", "cancelled") === true);
ck("I12) 場次 expired ⇒ 閒置", idle("confirmed", "expired") === true);

// ════════════════════════════════════════════════════════════════════════════
//  §S 判定只有一份
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 終局判定只有一份】");
const prepSrc = read(P_PREP);
const storeSrc = read(P_STORE);
const flowSrc = read(P_FLOW);

ck("S1) `contracts/matchFlowIdle.js` 存在且匯出 `matchFlowIdleFrom`",
  typeof matchFlowIdleFrom === "function");
ck("S2) `matchPrepAction` 匯入共用判定", /from\s+".*contracts\/matchFlowIdle\.js"/.test(prepSrc));
ck("S3) `profileStore` 匯入共用判定", /from\s+"\.\/contracts\/matchFlowIdle\.js"/.test(storeSrc));
//  ⚠ 這一條在守「不要再長回第二份」：`canStartPracticeFrom` 的函式體裡
//    不得再出現自己列的房間終局清單。
const canStartBody = codeOnly(prepSrc).match(/export function canStartPracticeFrom\([\s\S]*?\n\}/)?.[0] ?? "";
ck("S4) `canStartPracticeFrom` body 裡不再自列房間終局清單",
  canStartBody.length > 0 && !/\["cancelled",\s*"expired"\]/.test(canStartBody),
  canStartBody.length ? "已改用共用判定" : "⚠ 找不到函式本體");
ck("S5) `ROOM_IDLE_STATES` 集中在共用模組（不是 ROOM_TERMINAL）",
  Array.isArray(idleMod.ROOM_IDLE_STATES)
  && idleMod.ROOM_IDLE_STATES.includes("cancelled")
  && idleMod.ROOM_IDLE_STATES.includes("expired")
  && !idleMod.ROOM_IDLE_STATES.includes("confirmed"),
  JSON.stringify(idleMod.ROOM_IDLE_STATES));

// ════════════════════════════════════════════════════════════════════════════
//  §C matchPracticeContext：兩個欄位問兩件事
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C matchPracticeContext：inPractice vs activePractice】");
const { useProfileStore } = await imp(P_STORE);
const PK = ORIGIN_KINDS.practice;
const CK_ = ORIGIN_KINDS.competitive ?? "competitive";

const ctxOf = (mm) => {
  useProfileStore.setState({ matchmaking: mm });
  return useProfileStore.getState().matchPracticeContext();
};
const practiceRoom = (state) => ({ state, origin: { kind: PK } });
const practiceSession = (state) => ({ state, origin: { kind: PK } });

{
  const c = ctxOf({ ticket: null, room: null, session: null, practiceAssignment: null });
  ck("C1) 全新狀態 ⇒ 兩個都 false", c.inPractice === false && c.activePractice === false);
}
{
  const c = ctxOf({ room: practiceRoom("ready_check"), session: null, practiceAssignment: { origin: { kind: PK } } });
  ck("C2) 練習等待確認中 ⇒ 兩個都 true（**必須維持 tier=practice**）",
    c.inPractice === true && c.activePractice === true);
}
{
  const c = ctxOf({ room: practiceRoom("confirmed"), session: practiceSession("launched"), practiceAssignment: { origin: { kind: PK } } });
  ck("C3) 練習比賽進行中 ⇒ 兩個都 true", c.inPractice === true && c.activePractice === true);
}
{
  //  TD-44 的那一格。`inPractice` **必須維持 true**——結算端在這個時點讀它。
  const c = ctxOf({ room: practiceRoom("confirmed"), session: practiceSession("completed"), practiceAssignment: { origin: { kind: PK } } });
  ck("C4) 練習**打完** ⇒ inPractice 仍 true（結算要用）、activePractice **false**（TD-44）",
    c.inPractice === true && c.activePractice === false,
    `inPractice=${c.inPractice} activePractice=${c.activePractice}`);
}
{
  const c = ctxOf({ room: practiceRoom("confirmed"), session: practiceSession("abandoned"), practiceAssignment: { origin: { kind: PK } } });
  ck("C5) 練習被放棄 ⇒ activePractice false", c.activePractice === false);
}
{
  const c = ctxOf({ room: practiceRoom("cancelled"), session: null, practiceAssignment: { origin: { kind: PK } } });
  ck("C6) 練習房間取消 ⇒ activePractice false", c.activePractice === false);
}
{
  const c = ctxOf({ room: practiceRoom("expired"), session: null, practiceAssignment: { origin: { kind: PK } } });
  ck("C7) 練習房間逾時 ⇒ activePractice false", c.activePractice === false);
}
{
  //  ⚠ 反向誤導的守衛，比 TD-44 本身更危險：`practiceAssignment` 沒有任何流程
  //    會清掉它。若 `activePractice` 把它算進去，玩家按「重新配對」開一場**真的**
  //    競技比賽時，橫幅會寫「快速練習」——以為在測試，其實在打正式的。
  const c = ctxOf({
    room: { state: "waiting", origin: { kind: CK_ } }, session: null,
    practiceAssignment: { origin: { kind: PK } },
  });
  ck("C8) 殘留練習 assignment ＋ **競技**房間 ⇒ activePractice false（不得反向誤導）",
    c.activePractice === false, `inPractice=${c.inPractice}（來源仍看得到殘留）`);
}
{
  const c = ctxOf({ room: null, session: null, practiceAssignment: { origin: { kind: PK } } });
  ck("C9) 只剩殘留 assignment、沒有房間也沒有場次 ⇒ activePractice false",
    c.activePractice === false);
}

// ════════════════════════════════════════════════════════════════════════════
//  §A 結算端的語意不得被動到
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§A 結算端仍讀 inPractice（零永久影響不得鬆動）】");
const feedSrc = codeOnly(read(P_FEED));
const csSrc = codeOnly(read(P_CSSETTLE));
ck("A1) `useBattleFeed` 讀 `.inPractice`", /matchPracticeContext\(\)\.inPractice/.test(feedSrc));
ck("A2) `useBattleFeed` **不得**改讀 `.activePractice`", !/activePractice/.test(feedSrc));
ck("A3) `settleCsMatch` 讀 `.inPractice`", /matchPracticeContext\(\)\.inPractice/.test(csSrc));
//  ⚠ 這一條是本輪最重要的守衛：`settleCsMatch` 第 4 步在 `settleMatchThroughSession`
//    之後才讀，那時場次已 completed。改讀 activePractice ⇒ 練習開始寫 CS 戰績。
ck("A4) `settleCsMatch` **不得**改讀 `.activePractice`（改了練習就會計戰績）",
  !/activePractice/.test(csSrc));

// ════════════════════════════════════════════════════════════════════════════
//  §U 賽前頁必須改讀 activePractice
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§U 賽前頁讀 activePractice】");
const flowCode = codeOnly(flowSrc);
ck("U1) 層級橫幅（`matchTierOf`）吃 activePractice",
  /matchTierOf\(\{[^}]*inPractice:\s*!!practice\?\.activePractice/.test(flowCode));
ck("U2) 「快速練習」次要按鈕（`canStartPracticeFrom`）吃 activePractice",
  /inPractice:\s*practice\.activePractice/.test(flowCode));
const prepCode = codeOnly(prepSrc);
ck("U3) `primaryActionFor` 的退路判定讀 activePractice",
  /practice\?\.activePractice\s*\?\?\s*!!practice\?\.inPractice/.test(prepCode));
ck("U4) `flowStatusText` 的練習文案讀 activePractice",
  /if\s*\(practice\?\.activePractice\s*\?\?\s*practice\?\.inPractice\)/.test(prepCode));

// ════════════════════════════════════════════════════════════════════════════
//  §E 端到端（純函式層）：打完練習之後，一般對戰真的回得來
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§E 端到端：練習打完 ⇒ 回到一般對戰】");
const DONE = { roomState: "confirmed", sessionState: "completed" };
const RUNNING = { roomState: "ready_check", sessionState: null };
const ctxDone = ctxOf({ room: practiceRoom("confirmed"), session: practiceSession("completed"), practiceAssignment: { origin: { kind: PK } } });
const ctxRun = ctxOf({ room: practiceRoom("ready_check"), session: null, practiceAssignment: { origin: { kind: PK } } });

ck("E1) 打完練習 ⇒ 「快速練習」按鈕回得來（可以再打一場）",
  canStartPracticeFrom({ entryOk: true, live: false, inPractice: ctxDone.activePractice, ...DONE, actKey: "requeue" }) === true);
ck("E2) 打完練習 ⇒ 主按鈕是**一般對戰**的「重新配對」，不是 repractice",
  primaryActionFor({
    entryOk: true, view: { state: "idle" },
    room: { state: "confirmed" }, session: { state: "completed" },
    practice: ctxDone,
  }).key === "requeue");
//  ⚠ 這一條在守「不要修過頭」：練習**還在跑**的時候，退路仍必須回到練習，
//    否則一場失敗的練習會落到 enqueueMatch ⇒ 玩家以為在測試，實際打正式的。
ck("E3) 練習**進行中** ⇒ 退路仍是 repractice（不得回歸）",
  primaryActionFor({
    entryOk: true, view: { state: "idle" },
    room: { state: "cancelled" }, session: null,
    practice: ctxOf({ room: practiceRoom("ready_check"), session: null, practiceAssignment: { origin: { kind: PK } } }),
  }).key === "repractice");
ck("E4) 練習進行中 ⇒ 次要按鈕不出現（不會疊兩顆練習）",
  canStartPracticeFrom({ entryOk: true, live: false, inPractice: ctxRun.activePractice, ...RUNNING, actKey: "confirm" }) === false);
ck("E5) 打完練習 ⇒ 層級回到 competitive（一般對戰的名字與容量回得來）",
  matchTierOf({ inFixture: false, inPractice: ctxDone.activePractice }) === MATCH_SOURCE.competitive);
ck("E6) 練習進行中 ⇒ 層級仍是 practice",
  matchTierOf({ inFixture: false, inPractice: ctxRun.activePractice }) === MATCH_SOURCE.practice);
//  賽程優先於練習：正式季賽不得被殘留的練習狀態污染。
ck("E7) 賽程流程不受影響（inFixture 優先）",
  matchTierOf({ inFixture: true, inPractice: false }) === MATCH_SOURCE.official);

// ════════════════════════════════════════════════════════════════════════════
//  §M mutation sentinel：把修正拿掉，對應的檢查必須變紅
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M mutation sentinel】");
{
  //  M-A：真的把共用判定改壞再 import 回來——不是只證明「字串換得掉」。
  //  把 roomIdle 裡的 `|| sessionOver` 拿掉 ⇒ I9（completed ＋ confirmed）必須不再閒置。
  const idleSrc = read(P_IDLE);
  const mutated = idleSrc
    .replace(
      'const roomIdle = !roomState || ROOM_IDLE_STATES.includes(roomState) || sessionOver;',
      'const roomIdle = !roomState || ROOM_IDLE_STATES.includes(roomState);')
    .replace('from "./matchSession.js"',
      `from ${JSON.stringify(pathToFileURL(resolve(ROOT, "src/platform/contracts/matchSession.js")).href)}`);
  ck("M-A0) sentinel 找得到 roomIdle 那一行", mutated !== idleSrc);
  const tmp = join(os.tmpdir(), `td44_sentinel_${Date.now()}.mjs`);
  try {
    fs.writeFileSync(tmp, mutated, "utf8");
    const bad = await import(pathToFileURL(tmp).href);
    const badIdle = bad.matchFlowIdleFrom({ roomState: "confirmed", sessionState: "completed" }).idle;
    ck("M-A) 拿掉「場次終局 ⇒ 殘留 confirmed 視為閒置」⇒ I9 真的變紅",
      badIdle === false, `mutated idle=${badIdle}（正常版本應為 true）`);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* 清不掉就算了，不影響結果 */ }
  }
}
{
  //  M-B：把賽前頁改回讀 inPractice ⇒ U1 的守衛必須抓得到。
  const mutB = flowSrc.replace("inPractice: !!practice?.activePractice", "inPractice: !!practice?.inPractice");
  ck("M-B) 把橫幅改回讀 inPractice ⇒ 程式碼真的變了（U1 的守衛存在）", mutB !== flowSrc);
  ck("M-B2) 改回之後 U1 的正則不再命中",
    !/matchTierOf\(\{[^}]*inPractice:\s*!!practice\?\.activePractice/.test(codeOnly(mutB)));
}
{
  //  M-C：把 practiceAssignment 算進 activePractice ⇒ C8 的反向誤導守衛必須抓得到。
  const mutC = storeSrc.replace(
    "const flowKind = kindOf(mm.session) ?? kindOf(mm.room) ?? null;",
    "const flowKind = kindOf(mm.session) ?? kindOf(mm.room) ?? kindOf(mm.practiceAssignment) ?? null;");
  ck("M-C) 把殘留 assignment 算進現役流程 ⇒ 程式碼真的變了（C8 的守衛存在）", mutC !== storeSrc);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log(`TD-44 練習退場：${pass} / ${pass + fail} 通過`);
if (fail) { console.log(`❌ ${fail} 項未通過`); process.exit(1); }
console.log("✅ 全數通過");
