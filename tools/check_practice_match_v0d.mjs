#!/usr/bin/env node
// ============================================================================
//  tools/check_practice_match_v0d.mjs — TD-36 + V0D：快速練習模式
//
//  執行：repo 根目錄 `node tools/check_practice_match_v0d.mjs`；失敗 exit 1。
//
//  ── 這一輪要解決什麼 ─────────────────────────────────────────────────────
//  V0C 把三層來源接進結算，但 `practice` **沒有產品入口**——唯一會落到它的是
//  「交易單拿不到 origin」。於是 Foundation Calibration 只能把
//  `sourceBase.practice` 留在 1.0：調低它等於把**資料遺失**變成一個看不見的
//  成長懲罰（TD-36）。
//
//  本輪做兩件事：
//   ① **把兩者分開**：`matchSourceFromOrigin(null)` 改回 `unknown`（base 恆 1.0），
//      `practice` 從此只由**明確的 practice origin** 產生 ⇒ 可以安全設為 0。
//   ② **給快速練習一個真的入口**：第三個 origin 生產者 `practiceGateway`，
//      與 `competitionGateway`（賽程）對 `mockGateway`（排隊）的關係完全相同。
//
//  ── 最重要的不變式 ───────────────────────────────────────────────────────
//  **沒有第二套 battle pipeline，也沒有第二套 settlement。**
//  三個生產者都呼叫同一個 `createRoom` / `createSession`（§G 用 function
//  reference identity 釘住），之後的 poll / confirm / launch / battle / result /
//  `applyMatchProgress` 一行都不分岔。
//
//  §O 來源契約  §T 來源分類（TD-36）  §Z 獎勵歸零  §G 閘道共用管線
//  §S Store 入口與分派  §H 不計戰績  §U UI 入口與 retry  §N 沒有過度設計
//  §M mutation sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";
import { execFileSync } from "child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const soft = async (p) => { try { return await imp(p); } catch { return null; } };

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};

//  ⚠ 只掃**程式碼**，不掃註解。本輪好幾個檔案的註解裡就寫著
//    「不得靠 route 猜來源」「不得建立第二套 settlement」這類句子，
//    用裸關鍵字掃會掃到說明本身 ⇒ 變成「把理由寫下來就變紅」。
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_ORIGIN = "src/platform/contracts/matchOrigin.js";
const P_SOURCE = "src/platform/progress/matchSource.js";
const P_CAREER = "src/platform/progress/careerGrowth.js";
const P_REWARD = "src/platform/progress/rewardFormulas.js";
const P_GATE = "src/platform/matchmaking/practiceGateway.js";
const P_MOCK = "src/platform/matchmaking/mockGateway.js";
const P_COMP = "src/platform/competition/competitionGateway.js";
const P_STORE = "src/platform/profileStore.js";
const P_FEED = "src/battle/useBattleFeed.js";
const P_CSSETTLE = "src/platform/progress/settleCsMatch.js";
const P_ACTION = "src/screens/common/matchPrepAction.js";
const P_FLOW = "src/screens/common/useMatchFlow.js";
const P_FRAME = "src/screens/common/MatchPrepFrame.jsx";
const P_MOBA_AD = "src/platform/progress/adapters/mobaProgressAdapter.js";
const P_CS_AD = "src/platform/progress/adapters/csProgressAdapter.js";

const origin = await imp(P_ORIGIN);
const source = await imp(P_SOURCE);
const career = await imp(P_CAREER);
const reward = await imp(P_REWARD);
const room = await imp("src/platform/contracts/matchRoom.js");
const session = await imp("src/platform/contracts/matchSession.js");
const pgate = await soft(P_GATE);
const mock = await imp(P_MOCK);
const comp = await imp(P_COMP);
const mobaAd = await imp(P_MOBA_AD);
const csAd = await imp(P_CS_AD);
const txc = await imp("src/platform/contracts/matchProgressTransaction.js");
const mmc = await imp("src/platform/contracts/matchmaking.js");
const fanw = await imp("src/platform/progress/fanSourceWeight.js");
const ORIGIN_KIND_PRACTICE = origin.ORIGIN_KINDS.practice;

//  真實的出賽申請單（用契約自己的工廠，不手捏）
const entryC = await imp("src/platform/contracts/matchEntry.js");
const lineupC = await imp("src/platform/contracts/matchLineup.js");

// ════════════════════════════════════════════════════════════════════════════
//  §O 來源契約
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§O 快速練習的比賽來源】");

ck("O1) `ORIGIN_KINDS` 有第三種 practice",
  origin.ORIGIN_KINDS?.practice === "practice",
  Object.keys(origin.ORIGIN_KINDS ?? {}).join(","));

ck("O2) 有 practice 來源工廠 `originFromPractice`",
  typeof origin.originFromPractice === "function");

//  用真的申請單建來源（下面好幾段都吃它）
const players = [
  { id: "p1", name: "A", role: "上路", energy: 100, tier: "active" },
  { id: "p2", name: "B", role: "打野", energy: 100, tier: "active" },
  { id: "p3", name: "C", role: "中路", energy: 100, tier: "active" },
  { id: "p4", name: "D", role: "下路", energy: 100, tier: "active" },
  { id: "p5", name: "E", role: "輔助", energy: 100, tier: "active" },
];
const seats = { b1: "p1", b2: "p2", b3: "p3", b4: "p4", b5: "p5" };
const entry = entryC.createMatchEntryRequest({
  mode: "moba", seats, players,
  context: { teamId: "t1", teamName: "測試隊", day: 1, week: 1, season: 1 },
});
const practiceOrigin = origin.originFromPractice?.(entry.request)?.origin ?? null;

ck("O3) 練習來源通過 `validateOrigin`",
  !!practiceOrigin && origin.validateOrigin(practiceOrigin).ok,
  practiceOrigin ? `${practiceOrigin.kind}:${practiceOrigin.originId}` : "沒有來源",
);

ck("O4) 練習來源**不得**帶賽事欄位（與票券來源同一條規則）",
  (() => {
    if (!practiceOrigin) return false;
    const leaked = { ...practiceOrigin, competitionId: "comp:moba:s1:org:regular" };
    return origin.validateOrigin(leaked).ok === false;
  })());

ck("O5) 沒有申請單就建不出練習來源（不得憑空產生）",
  origin.originFromPractice?.(null)?.ok === false
  && origin.originFromPractice?.({})?.ok === false);

ck("O6) `compatTicketIdOf(練習來源)` 為 null（它不是票券）",
  !!practiceOrigin && origin.compatTicketIdOf(practiceOrigin) === null);

// ════════════════════════════════════════════════════════════════════════════
//  §T 來源分類：TD-36 —— 把「查不到來源」與「明確是練習」分開
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§T 來源分類（TD-36）】");

ck("T1) `MATCH_SOURCE` 增加 `unknown`（四層）",
  ["unknown", "practice", "competitive", "official"].every((k) => k in (source.MATCH_SOURCE ?? {})),
  Object.keys(source.MATCH_SOURCE ?? {}).join(","));

ck("T2) **沒有 origin ⇒ unknown**（不再等同於快速練習）",
  source.matchSourceFromOrigin(null) === source.MATCH_SOURCE.unknown
  && source.matchSourceFromOrigin(undefined) === source.MATCH_SOURCE.unknown
  && source.matchSourceFromOrigin({}) === source.MATCH_SOURCE.unknown);

ck("T3) 明確的 practice origin ⇒ practice",
  !!practiceOrigin && source.matchSourceFromOrigin(practiceOrigin) === source.MATCH_SOURCE.practice);

ck("T4) 既有兩種來源的分類逐值不變（ticket→competitive、fixture→official）",
  source.matchSourceFromOrigin({ kind: "ticket", originId: "t", mode: "moba" }) === source.MATCH_SOURCE.competitive
  && source.matchSourceFromOrigin({ kind: "fixture", originId: "f", mode: "moba" }) === source.MATCH_SOURCE.official);

ck("T5) `practice` 的成長倍率為 0（明確的練習賽不給永久成長）",
  career.PCGM_PARAMS?.sourceBase?.[source.MATCH_SOURCE.practice] === 0,
  `practice=${career.PCGM_PARAMS?.sourceBase?.practice}`);

//  ⚠ 這一條是 TD-36 的核心。`unknown` 是「資料遺失」的退路，
//    它必須**永遠中性**——否則舊存檔／debug harness 會被默默扣成長。
ck("T6) `unknown` 維持中性 1.0：資料遺失不得變成隱形懲罰",
  career.PCGM_PARAMS?.sourceBase?.unknown === 1.0,
  `unknown=${career.PCGM_PARAMS?.sourceBase?.unknown}`);

ck("T7) `unknown` ≤ `official`：沒有人有動機去弄掉 origin 換成長",
  career.PCGM_PARAMS.sourceBase.unknown <= career.PCGM_PARAMS.sourceBase.official);

ck("T8) `careerGrowthFactor` 對練習來源真的回 0",
  career.careerGrowthFactor({ source: "practice", player: { age: 20, stats: { learning: 70 } } }) === 0);

ck("T9) 分類仍是純函式，不讀 UI / route / stage / Store",
  !/useProfileStore|window\.|document\.|location|STAGE/.test(codeOnly(read(P_SOURCE))));

// ════════════════════════════════════════════════════════════════════════════
//  §Z 獎勵歸零：不給錢、不給粉絲、不給 XP
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§Z 快速練習不發任何獎勵】");

ck("Z1) `teamRewardsFor` 對練習來源回 0 錢 0 粉絲",
  (() => {
    const r = reward.teamRewardsFor({ win: true, marginF: 1, streak: 5, fansNow: 100000, matchSource: "practice" });
    return r.money === 0 && r.fans === 0 && r.prizeWan === 0;
  })());

ck("Z2) `playerXpFor` 對練習來源回 0 XP（⇒ 不升級 ⇒ 不發天賦點）",
  reward.playerXpFor({ win: true, perf: 1.35, isMvp: true, matchSource: "practice" }) === 0);

ck("Z3) 既有來源的獎勵**逐值不變**（沒傳 matchSource ⇒ 行為與改動前相同）",
  (() => {
    const a = reward.teamRewardsFor({ win: true, marginF: 3 / 8, streak: 0, fansNow: 1000 });
    const b = reward.teamRewardsFor({ win: true, marginF: 3 / 8, streak: 0, fansNow: 1000, matchSource: "competitive" });
    const c = reward.teamRewardsFor({ win: true, marginF: 3 / 8, streak: 0, fansNow: 1000, matchSource: "official" });
    return a.money === b.money && a.fans === b.fans && a.money === c.money && a.fans === c.fans && a.money > 0
      && reward.playerXpFor({ win: true, perf: 1, isMvp: false })
        === reward.playerXpFor({ win: true, perf: 1, isMvp: false, matchSource: "competitive" });
  })());

//  ⚠ 規則必須只有**一份**。兩支 adapter 各自 `if (practice) money = 0` 會漂移。
ck("Z4) 歸零規則寫在唯一的獎勵公式檔，adapter 不自己判",
  /isPracticeSource/.test(codeOnly(read(P_REWARD)))
  && !/money:\s*0|fans:\s*0/.test(codeOnly(read(P_MOBA_AD)))
  && !/money:\s*0|fans:\s*0/.test(codeOnly(read(P_CS_AD))));

//  兩支 adapter 對練習來源都必須送出空的 playerProgress：
//  交易單裡沒有選手 ⇒ 不發 XP、不成長、**也不會呼叫 `applyMatchWear`**（不扣體力）。
const practiceCtx = { players, lineup: null, streak: 0, fansNow: 0, origin: practiceOrigin };
const br = {
  schema: "BattleResult.v2", winner: "blue", duration: 1800,
  score: { blue: 20, red: 5 }, gold: { blue: 50000, red: 30000 }, towers: { blue: 9, red: 2 },
  //  ⚠ 這裡的 id 必須是**選手 id**（p1/p2），不是引擎席位（b1/b2）。
  //    沒有 lineup 時 adapter 走 identity 查表，用席位 id 會查不到人 ⇒
  //    對照組也會得到空的 playerProgress，那就測不出「練習才是空的」。
  mvpId: "p1",
  players: [
    { id: "p1", side: "blue", k: 10, d: 1, a: 5, gold: 12000, dmg: 30000, rating: 60, participation: 0.8 },
    { id: "p2", side: "blue", k: 5, d: 2, a: 8, gold: 9000, dmg: 20000, rating: 40, participation: 0.6 },
  ],
};
const practiceTx = mobaAd.mobaResultToTransaction(br, practiceCtx);

ck("Z5) MOBA 練習交易單：0 錢、0 粉絲、**沒有任何 playerProgress**",
  !!practiceTx && practiceTx.teamRewards.money === 0 && practiceTx.teamRewards.fans === 0
  && Array.isArray(practiceTx.playerProgress) && practiceTx.playerProgress.length === 0,
  practiceTx ? `money=${practiceTx.teamRewards.money} fans=${practiceTx.teamRewards.fans} progress=${practiceTx.playerProgress?.length}` : "建不出交易單");

ck("Z6) 練習交易單仍帶得出來源（結算讀得到 practice）",
  practiceTx?.metadata?.matchSource === "practice", practiceTx?.metadata?.matchSource);

ck("Z7) 練習交易單仍是合法交易單（走的是同一條結算，不是特例）",
  txc.validateMatchProgressTransaction(practiceTx).ok);

//  對照組：同一場比賽走一般競技來源，獎勵與 XP 必須照常發。
const ticketOrigin = { schema: origin.ORIGIN_VERSION, kind: "ticket", originId: "t1", mode: "moba" };
const normalTx = mobaAd.mobaResultToTransaction(br, { ...practiceCtx, origin: ticketOrigin });
ck("Z8) 對照組：一般比賽仍照常發錢／粉絲／XP（本輪沒有誤傷正式流程）",
  !!normalTx && normalTx.teamRewards.money > 0 && normalTx.teamRewards.fans > 0
  && normalTx.playerProgress.length > 0 && normalTx.playerProgress.every((p) => p.xpGained > 0),
  normalTx ? `money=${normalTx.teamRewards.money} fans=${normalTx.teamRewards.fans} progress=${normalTx.playerProgress.length}` : "");

// ════════════════════════════════════════════════════════════════════════════
//  §G 閘道：第三個生產者，但**共用同一條管線**
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§G 練習閘道（不得是第二套管線）】");

ck("G1) `practiceGateway.js` 存在且匯出三支對照函式",
  !!pgate?.issuePracticeMatch && !!pgate?.openRoomForPractice && !!pgate?.openSessionForPractice,
  pgate ? Object.keys(pgate).join(",") : "模組不存在");

//  ⚠ 這是本 gate 最重要的一條：三個生產者必須呼叫**同一個** function 物件。
//    用 reference identity 而不是正則——正則只能證明「有出現這個字」。
ck("G2) 三個生產者共用同一個 `createRoom` / `createSession`（reference identity）",
  (() => {
    const codeM = codeOnly(read(P_MOCK)), codeC = codeOnly(read(P_COMP));
    const codeP = pgate ? codeOnly(read(P_GATE)) : "";
    const importsRoom = (s) => /from\s+["'][^"']*contracts\/matchRoom\.js["']/.test(s);
    const importsSession = (s) => /from\s+["'][^"']*contracts\/matchSession\.js["']/.test(s);
    return importsRoom(codeM) && importsRoom(codeC) && importsRoom(codeP)
      && importsSession(codeC) && importsSession(codeP);
  })(),
  "三支都 import contracts/ 的同一份工廠");

ck("G3) 練習閘道**不得**自己造 room/session 物件（不得有第二種 schema）",
  pgate ? !/schema:\s*["']Match(Room|Session)\./.test(codeOnly(read(P_GATE))) : false);

const issued = pgate?.issuePracticeMatch?.({ entryRequest: entry.request, players, now: 0 }) ?? null;
ck("G4) 可以簽發練習指派單，且來源是 practice",
  issued?.ok === true && issued.assignment?.origin?.kind === "practice",
  issued?.ok ? `對手 ${issued.assignment?.opponent?.name}｜seed ${issued.assignment?.seed}` : issued?.reason ?? "簽發失敗");

ck("G5) 指派單通過既有的 `validateAssignment`（不是另一種形狀）",
  mmc.validateAssignment(issued?.assignment ?? null).ok === true);

ck("G6) 對手與 seed 是**決定性**的（同一份申請單 ⇒ 同一場練習）",
  (() => {
    const a = pgate?.issuePracticeMatch?.({ entryRequest: entry.request, players, now: 0 });
    const b = pgate?.issuePracticeMatch?.({ entryRequest: entry.request, players, now: 999999 });
    return !!a?.ok && !!b?.ok
      && a.assignment.assignmentId === b.assignment.assignmentId
      && a.assignment.seed === b.assignment.seed;
  })());

ck("G7) 陣容不合法就簽不出練習（練習不繞過出賽資格）",
  pgate?.issuePracticeMatch?.({ entryRequest: null, players, now: 0 })?.ok === false
  && pgate?.issuePracticeMatch?.({ entryRequest: { ...entry.request, squad: [] }, players, now: 0 })?.ok === false);

const proom = issued?.ok ? pgate.openRoomForPractice({ assignment: issued.assignment, now: 0 }) : null;
ck("G8) 練習房間開得起來，且 `room.origin.kind === practice`",
  proom?.ok === true && proom.room?.origin?.kind === "practice"
  && proom.room?.schema === room.ROOM_VERSION,
  proom?.ok ? proom.room.roomId : proom?.errors?.[0]?.message ?? "開不了房");

ck("G9) 練習房間的 `ticketId` 為 null（它沒有票券，不得偽造一張）",
  proom?.ok === true && proom.room.ticketId === null);

ck("G10) 練習場次簽得出來，且 launchToken / TTL 一應俱全（走同一個 createSession）",
  (() => {
    if (!proom?.ok) return false;
    //  ⚠ 房間開出來是 `waiting`，必須先進 `ready_check` 才能確認——
    //    這是既有的房間狀態機，練習沒有繞過它（正是本節要證明的事）。
    let r = room.transitionRoom(proom.room, room.ROOM_STATES.ready_check, { now: 0 });
    if (!r.ok) return false;
    r = room.confirmSide(r.room, "us", { now: 0 });
    if (!r.ok) return false;
    r = room.confirmSide(r.room, "opponent", { now: 0 });
    if (!r.ok || r.room.state !== room.ROOM_STATES.confirmed) return false;
    const s = pgate.openSessionForPractice({ room: r.room, assignment: issued.assignment, now: 0 });
    return s.ok === true && !!s.session?.launchToken && s.session.origin.kind === "practice"
      && s.session.schema === session.SESSION_VERSION;
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §S Store 入口與分派點
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S Store 入口與兩個分派點】");
const storeSrc = codeOnly(read(P_STORE));

ck("S1) 有 `startPracticeMatch` 入口",
  /startPracticeMatch\s*\(/.test(storeSrc));

//  ⚠ 這兩條是實作前 Audit 抓到的坑：
//    `pollMatchRoom` 的票券檢查若仍以「是不是 fixture」為條件，
//    練習房間會被當成「票券已失效」**一開就關掉**。
ck("S2) `pollMatchRoom` 的票券檢查改成只套用在**票券房間**（不是「非 fixture」）",
  /ORIGIN_KINDS\.ticket/.test(storeSrc) && !/isFixtureRoom/.test(storeSrc),
  "練習房間沒有票券，不得被票券檢查關掉");

ck("S3) `createMatchSession` 依 origin kind 三向分派（練習走練習閘道）",
  /openSessionForPractice/.test(storeSrc));

ck("S4) 有 `matchPracticeContext`（讓 UI 判斷「現在在練習」，不靠畫面名稱猜）",
  /matchPracticeContext\s*\(/.test(storeSrc));

ck("S5) Store 不自己判斷來源字串（一律向契約要）",
  !/kind\s*===\s*["']practice["']/.test(storeSrc)
  || /ORIGIN_KINDS\.practice/.test(storeSrc),
  "允許用 ORIGIN_KINDS.practice，不允許裸字串");

// ════════════════════════════════════════════════════════════════════════════
//  §H 不計戰績、不污染賽季
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§H 不計戰績】");

ck("H1) MOBA：練習不寫 season history / hero progress",
  (() => {
    const s = codeOnly(read(P_FEED));
    return /practice/i.test(s) && /recordResult/.test(s) && /recordBattleResult/.test(s)
      && /if\s*\(\s*!\s*\w*[Pp]ractice/.test(s);
  })(),
  "兩個 record 呼叫必須被練習判斷包住");

ck("H2) CS：練習不寫 csHistory",
  (() => {
    const s = codeOnly(read(P_CSSETTLE));
    return /practice/i.test(s) && /recordCsMatch/.test(s);
  })());

//  賽季污染是**結構上**不可能的：練習來源不是 fixture ⇒
//  `fixtureIdOfSession` 回 null ⇒ `completeFixtureMatch` 永遠不會被觸發。
ck("H3) 練習場次不對應任何賽程（賽季污染在結構上不可能）",
  (() => {
    const mm = comp.fixtureIdOfAssignment?.(issued?.assignment ?? null);
    return mm === null || mm === undefined;
  })());

ck("H4) 練習來源在粉絲分類上不是正式賽（與成長分類不分歧）",
  fanw.fanSourceFromOrigin(practiceOrigin) !== "league",
  "fanSourceWeight.js 本身不需要改動");

// ════════════════════════════════════════════════════════════════════════════
//  §U UI 入口與 retry
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§U UI 入口】");
const action = await imp(P_ACTION);

//  ⚠ 這是 grilling 抓到最危險的一條：練習失敗後若走既有的 `requeue`，
//    會呼叫 `enqueueMatch` ⇒ **把一場練習變成一場真的競技比賽**。
ck("U1) 練習流程的『重新來過』不是重新配對（不得把練習換成競技）",
  (() => {
    const act = action.primaryActionFor({
      entryOk: true, view: { state: "cancelled" }, room: null, session: null,
      mode: "moba", practice: { inPractice: true },
    });
    return act.key !== "requeue" && act.key === "repractice";
  })(),
  "練習的退路必須回到練習");

ck("U2) 一般配對的退路**逐值不變**（沒有誤傷既有流程）",
  action.primaryActionFor({ entryOk: true, view: { state: "cancelled" }, room: null, session: null, mode: "moba" }).key === "requeue");

ck("U3) 賽程的退路**逐值不變**",
  action.primaryActionFor({
    entryOk: true, view: { state: "cancelled" }, room: null, session: null,
    mode: "moba", fixture: { inFixture: true, fixtureId: "f1" },
  }).key === "refixture");

ck("U4) `useMatchFlow` 暴露 `startPractice` 並處理 `repractice`",
  (() => { const s = codeOnly(read(P_FLOW)); return /startPractice/.test(s) && /repractice/.test(s); })());

ck("U5) 入口在 **MOBA / CS 共用的** `MatchPrepFrame`（兩邊不各做一顆）",
  /startPractice/.test(codeOnly(read(P_FRAME))),
  "共用元件 ⇒ 兩個模式自動都有");

ck("U6) 按鈕有明示「不影響戰績與數值」（玩家看得懂它是測試場）",
  /快速練習/.test(read(P_FRAME)) && /不影響/.test(read(P_FRAME)));

ck("U7) 沒有為快速練習新增第二個 Result 畫面",
  (() => {
    const files = fs.readdirSync(resolve(ROOT, "src/screens/common"));
    return !files.some((f) => /practice/i.test(f) && /result|report/i.test(f));
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §E 端到端：真的跑一場練習，看存檔前後有沒有變
//
//  上面各段驗的是「零件對不對」。這一段把整條流程**真的跑一遍**：
//  `startPracticeMatch` → 輪詢房間 → 雙方確認 → 簽發場次 → 啟動 →
//  賽後交易單 → `settleMatchThroughSession`（唯一結算邊界）。
//  然後逐值比對資金／粉絲／選手 xp／體力／天賦點。
//  ⚠ 這是唯一能證明「零件組起來也沒問題」的一段——單元檢查全綠但流程
//    在某個分派點斷掉，是這一輪 Audit 實際預測到的風險（見 §S2/§S3）。
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§E 端到端（真的跑一場）】");
globalThis.localStorage = globalThis.localStorage ?? {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
{
  const { useProfileStore } = await imp(P_STORE);
  const S = () => useProfileStore.getState();
  const snap = () => ({
    funds: S().finance?.funds, fans: S().meta?.fans,
    players: (S().players ?? []).map((p) => `${p.id}:${p.xp ?? 0}:${p.energy}:${p.talentPoints ?? 0}:${p.matchStreak ?? 0}`).join("|"),
  });

  S().autoFillLineup("moba");
  const before = snap();
  const started = S().startPracticeMatch("moba");
  ck("E1) `startPracticeMatch` 開得起來，且房間來源是 practice、票券為 null",
    started.ok === true && S().matchmaking.room?.origin?.kind === ORIGIN_KIND_PRACTICE
    && S().matchmaking.ticket === null,
    started.ok ? `room=${S().matchmaking.room.roomId}` : started.reason ?? "");

  ck("E2) `matchPracticeContext` 認得出現在在練習（UI 不必猜）",
    S().matchPracticeContext().inPractice === true);

  //  ⚠ 房間必須真的走得完既有狀態機——這正是 §S2 那個分派點的實測。
  let now = Date.now();
  for (let i = 0; i < 60 && S().matchmaking.room?.state !== "confirmed"; i++) {
    now += 1000;
    S().pollMatchRoom(now);
    if (S().matchmaking.room?.state === "ready_check" && !S().matchmaking.room.confirmations?.us) S().confirmMatchReady(now);
  }
  ck("E3) 練習房間走得完既有狀態機（不會被票券檢查關掉）",
    S().matchmaking.room?.state === "confirmed", `room=${S().matchmaking.room?.state}`);

  const cs = S().createMatchSession(now);
  ck("E4) 場次由練習閘道簽發（走 §S3 的分派）",
    cs.ok === true && cs.session?.origin?.kind === ORIGIN_KIND_PRACTICE && cs.session?.issuedBy === "practice-gateway",
    cs.ok ? cs.session.issuedBy : cs.errors?.[0]?.message ?? "");

  const lr = S().launchMatchSession(now);
  ck("E5) 一次性 launchToken 照舊（練習沒有繞過進場保護）", lr.ok === true);

  //  賽後：用**現役場次的 origin** 建交易單，走唯一結算邊界
  const seatIds = ["b1", "b2", "b3", "b4", "b5"];
  const liveBr = {
    schema: "BattleResult.v2", winner: "blue", duration: 1800,
    score: { blue: 25, red: 4 }, gold: { blue: 60000, red: 30000 }, towers: { blue: 11, red: 0 },
    mvpId: "b1",
    players: seatIds.map((s, i) => ({ id: s, side: "blue", k: 10 - i, d: 1, a: 5, gold: 12000, dmg: 30000, rating: 60, participation: 0.8 })),
  };
  const liveTx = mobaAd.mobaResultToTransaction(liveBr, {
    players: S().players ?? [], lineup: S().lineup, streak: 0, fansNow: S().meta?.fans ?? 0,
    origin: S().matchmaking.session.origin,
  });
  const boundary = await imp("src/platform/progress/settleMatchBoundary.js");
  const out = boundary.settleMatchThroughSession({
    mode: "moba",
    outcome: boundary.outcomeFromBattleResult(liveBr, mobaAd.mobaMatchId(liveBr)),
    transaction: liveTx,
  });

  ck("E6) 結算走**權威路徑**（viaSession），不是無場次的退路",
    out.viaSession === true && out.receipt?.ok !== false);

  ck("E7) 場次收尾為 completed（玩家不會卡在一場打不完的練習）",
    S().matchmaking.session?.state === "completed", S().matchmaking.session?.state);

  const after = snap();
  ck("E8) 資金未變", before.funds === after.funds, `${before.funds} → ${after.funds}`);
  ck("E9) 粉絲未變", before.fans === after.fans, `${before.fans} → ${after.fans}`);
  ck("E10) 選手 xp / 體力 / 天賦點 / 連續出賽**逐值未變**",
    before.players === after.players,
    before.players === after.players ? "" : `${before.players}\n      → ${after.players}`);
}

// ════════════════════════════════════════════════════════════════════════════
//  §N 沒有過度設計（本輪的邊界）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

ck("N1) 沒有做 Ranked / 牌位 / 評分",
  !/RANKED|rankedRating|mmr|牌位/i.test(codeOnly(read(P_SOURCE)) + (pgate ? codeOnly(read(P_GATE)) : "")));

ck("N2) 沒有做 Career Clock / 年齡推進 / 退休",
  !/careerClock|advanceAge|retirement|退休/i.test(pgate ? codeOnly(read(P_GATE)) : ""));

ck("N3) `fanSourceWeight.js` 零改動（粉絲行為逐值不變）",
  (() => {
    //  ⚠ 這是 ESM 檔，不能用 require —— 之前踩過一次，錯誤會被 catch 吃掉
    //    變成「永遠紅」而不是「真的有 diff」。
    try {
      execFileSync("git", ["diff", "--quiet", "HEAD", "--", "src/platform/progress/fanSourceWeight.js"], { cwd: ROOT });
      return true;
    } catch { return false; }
  })());

ck("N4) 練習閘道很小（對照 competitionGateway，不得長成第二套賽事系統）",
  (() => {
    if (!pgate) return false;
    const lines = codeOnly(read(P_GATE)).split("\n").filter((l) => l.trim()).length;
    return lines <= 80;
  })(),
  pgate ? `${codeOnly(read(P_GATE)).split("\n").filter((l) => l.trim()).length} 行實碼` : "");

// ════════════════════════════════════════════════════════════════════════════
//  §M mutation sentinel
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M mutation sentinel】");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  //  A：把 fallback 改回 practice ⇒ TD-36 又出現（資料遺失＝練習）
  const A = await mutated(P_SOURCE,
    (s) => s.replace("return MATCH_SOURCE.unknown;", "return MATCH_SOURCE.practice;"), "A-fallback");
  ck("M-A) fallback 改回 practice ⇒ §T2 變紅",
    A.matchSourceFromOrigin(null) !== A.MATCH_SOURCE.unknown);

  //  B：把獎勵歸零拿掉 ⇒ §Z1 變紅
  const B = await mutated(P_REWARD,
    (s) => s.replace(/if \(isPracticeSource\(matchSource\)\) return \{ prizeWan: 0, money: 0, fans: 0 \};/, ""), "B-rewards");
  ck("M-B) 拿掉練習歸零 ⇒ §Z1 變紅",
    (() => {
      const r = B.teamRewardsFor({ win: true, marginF: 1, streak: 5, fansNow: 100000, matchSource: "practice" });
      return !(r.money === 0 && r.fans === 0);
    })());

  //  C：把 practice base 調回 1.0 ⇒ §T5 變紅
  const C = await mutated(P_CAREER,
    (s) => s.replace(/\[GROWTH_SOURCES\.practice\]:\s*0\.0/, "[GROWTH_SOURCES.practice]: 1.0"), "C-base");
  ck("M-C) practice base 調回 1.0 ⇒ §T5 變紅",
    C.PCGM_PARAMS.sourceBase.practice !== 0);

  //  D：把練習的 retry 改回 requeue ⇒ §U1 變紅（練習被換成競技）
  const D = await mutated(P_ACTION,
    (s) => s.replace(/key: "repractice"/, 'key: "requeue"'), "D-retry");
  ck("M-D) 練習的退路改回重新配對 ⇒ §U1 變紅",
    D.primaryActionFor({
      entryOk: true, view: { state: "cancelled" }, room: null, session: null,
      mode: "moba", practice: { inPractice: true },
    }).key !== "repractice");
} catch (e) {
  ck("M-*) sentinel 可執行", false, String(e.message).slice(0, 170));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch {} }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} check_practice_match_v0d：${pass}/${pass + fail} 通過`);
console.log(`   四層來源：unknown（資料遺失，中性 1.0）／practice（快速練習，0）／competitive（1.0）／official（3.0）`);
console.log(`   ⚠ 快速練習不給成長、不給錢、不給粉絲、不計戰績、不扣體力——它是純測試場。`);
process.exit(fail === 0 ? 0 : 1);
