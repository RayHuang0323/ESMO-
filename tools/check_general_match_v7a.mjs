#!/usr/bin/env node
// ============================================================================
//  tools/check_general_match_v7a.mjs — V7A：一般對戰收口（General Match Closure）
//
//  執行：repo 根目錄 `node tools/check_general_match_v7a.mjs`；失敗 exit 1。
//
//  ── 這一支要釘住什麼 ─────────────────────────────────────────────────────
//  三個對戰層級到 V0D 為止**零件都在**（`MatchOrigin` → `matchSource` →
//  `careerGrowth` / `rewardFormulas` / `competitiveBlock`），但從來沒有一支
//  驗證器把「一般對戰」這一層的**產品契約**整條寫下來：
//
//      保留 ── 少量實戰成長、合理的一般生涯收益、每日容量上限
//      禁止 ── 正式聯賽排名、巡迴積分、晉級、冠軍、正式賽季獎金、正式榮譽
//
//  V0C 證明了「分得出來」，V0D 證明了「練習是零」，但**沒有人證明過
//  一般對戰打一百場也動不了賽季一個位元**。那正是本檔存在的理由。
//
//  ── V7A 實際改了什麼（其餘都是既有行為，本檔只是把它們釘住）────────────
//  ① `applyMatchProgress` 的 `appendFormEntry` 原本是**無條件**的
//     ⇒ 快速練習會寫進 `economy.formLog` ⇒ `recentForm()` ⇒ 週結算的
//       贊助績效獎金 ⇒ **練習其實有永久金錢影響**，只是繞了一週才付款。
//     V0D 把錢／粉絲／XP 都歸了零，唯獨漏掉這一條（實測見 §Z3）。
//  ② 三個層級的**玩家可見名稱與說明**收進 `progress/matchSource.js`
//     （分類與名稱同源），賽前頁顯示層級與今日容量。
//  ③ 帳本裡一般對戰那筆錢改名為「一般對戰勝利／參賽收入」——
//     「獎金」在本專案專指賽季名次獎金，混用會讓玩家以為拿到了賽事獎金。
//
//  ⚠ 本輪**不做**：Ranked、牌位、排行榜、真人連線、第二條 battle pipeline、
//    調整任何來源倍率（那是 Foundation Calibration 的事）。
//
//  §T 三層定位與命名同源   §G 一般對戰保留項（實測）   §P 不得污染正式賽季
//  §Z 快速對戰仍是零永久影響   §U UI 名稱與說明    §N 本輪邊界
//  §M mutation sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};

//  只掃程式碼，不掃註解——本檔驗的好幾條規則，理由本身就寫在註解裡。
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_SOURCE = "src/platform/progress/matchSource.js";
const P_APPLY = "src/platform/progress/applyMatchProgress.js";
const P_STORE = "src/platform/profileStore.js";
const P_CLOCK = "src/platform/time/worldClock.js";
const P_FLOW = "src/screens/common/useMatchFlow.js";
const P_FRAME = "src/screens/common/MatchPrepFrame.jsx";

const src = await imp(P_SOURCE);
const growth = await imp("src/platform/progress/careerGrowth.js");
const clock = await imp(P_CLOCK);
const origin = await imp("src/platform/contracts/matchOrigin.js");
const mobaAd = await imp("src/platform/progress/adapters/mobaProgressAdapter.js");
const csAd = await imp("src/platform/progress/adapters/csProgressAdapter.js");
const applyMod = await imp(P_APPLY);
const comp = await imp("src/platform/competition/competitionGateway.js");
const bridge = await imp("src/platform/competition/fixtureResultBridge.js");

const { MATCH_SOURCE } = src;

// ════════════════════════════════════════════════════════════════════════════
//  §T 三層定位與命名同源
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§T 三層定位】");

const ticketOrigin = { schema: origin.ORIGIN_VERSION, kind: "ticket", originId: "t-v7a", mode: "moba" };
const practiceOrigin = origin.originFromPractice({ transactionId: "tx-v7a", mode: "moba" }).origin;
const fixtureOrigin = origin.originFromFixture(
  { fixtureId: "fx-v7a", competitionId: "c1", stageId: "s1", mode: "moba" },
  { transactionId: "tx-fx-v7a", mode: "moba" },
).origin;

ck("T1) 一般對戰 = `ticket` 來源 → competitive（不是 practice、不是 official）",
  src.matchSourceFromOrigin(ticketOrigin) === MATCH_SOURCE.competitive,
  src.matchSourceFromOrigin(ticketOrigin));

ck("T2) 三層互斥且齊備（practice / competitive / official 各對一種來源）",
  src.matchSourceFromOrigin(practiceOrigin) === MATCH_SOURCE.practice
  && src.matchSourceFromOrigin(fixtureOrigin) === MATCH_SOURCE.official
  && new Set([MATCH_SOURCE.practice, MATCH_SOURCE.competitive, MATCH_SOURCE.official]).size === 3);

ck("T3) 名稱與分類**同源**：層級標籤住在分類器裡，不是畫面各寫一份",
  !!src.MATCH_TIER_LABELS
  && src.MATCH_TIER_LABELS[MATCH_SOURCE.competitive]?.name === "一般對戰"
  && src.MATCH_TIER_LABELS[MATCH_SOURCE.practice]?.name === "快速練習"
  && src.MATCH_TIER_LABELS[MATCH_SOURCE.official]?.name === "生涯季賽",
  Object.values(src.MATCH_TIER_LABELS ?? {}).map((v) => v.name).join(" / "));

ck("T4) 每一層都有一句話說明契約（`unknown` 例外：不是產品層級，不下承諾）",
  Object.entries(src.MATCH_TIER_LABELS).every(([k, v]) =>
    k === MATCH_SOURCE.unknown ? v.note === "" : (typeof v.note === "string" && v.note.length > 0)));

ck("T5) 一般對戰的說明必須講明「不計入正式賽季」（玩家看得到的承諾）",
  /不計入正式賽季/.test(src.MATCH_TIER_LABELS[MATCH_SOURCE.competitive].note),
  src.MATCH_TIER_LABELS[MATCH_SOURCE.competitive].note);

ck("T6) 賽前層級判定是純推導（吃兩個布林，不看畫面／路由）",
  src.matchTierOf({ inFixture: false, inPractice: false }) === MATCH_SOURCE.competitive
  && src.matchTierOf({ inFixture: true, inPractice: false }) === MATCH_SOURCE.official
  && src.matchTierOf({ inFixture: false, inPractice: true }) === MATCH_SOURCE.practice
  //  兩者同時為真是不可能的狀態；真的發生時**寧可少承諾**
  && src.matchTierOf({ inFixture: true, inPractice: true }) === MATCH_SOURCE.practice);

ck("T7) MOBA / CS 共用同一份分類與標籤（不是兩套詞彙）",
  /matchSourceFromOrigin/.test(codeOnly(read("src/platform/progress/adapters/mobaProgressAdapter.js")))
  && /matchSourceFromOrigin/.test(codeOnly(read("src/platform/progress/adapters/csProgressAdapter.js"))));

// ════════════════════════════════════════════════════════════════════════════
//  §G 一般對戰的保留項——**實測**，不是讀程式碼猜
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§G 一般對戰保留：成長／收益／每日容量】");

const PLAYERS = () => ([
  { id: "p1", name: "A", age: 20, level: 5, xp: 0, stats: { learning: 70 }, condition: { stamina: 100 }, energy: 100 },
  { id: "p2", name: "B", age: 21, level: 5, xp: 0, stats: { learning: 70 }, condition: { stamina: 100 }, energy: 100 },
]);
const BR = {
  schema: "BattleResult.v2", winner: "blue", duration: 1800,
  score: { blue: 20, red: 5 }, gold: { blue: 50000, red: 30000 }, towers: { blue: 9, red: 2 },
  mvpId: "p1",
  players: [
    { id: "p1", side: "blue", k: 10, d: 1, a: 5, gold: 12000, dmg: 30000, rating: 60, participation: 0.8 },
    { id: "p2", side: "blue", k: 5, d: 2, a: 8, gold: 9000, dmg: 20000, rating: 40, participation: 0.6 },
  ],
};

//  ⚠ 賽季切片放的是**哨兵值**：只要結算路徑碰了它們任何一個位元，§P 就會紅。
const SEASON_SENTINEL = () => ({
  competition: { schema: "sentinel", fixtures: [], standings: ["DO_NOT_TOUCH"] },
  competitionByMode: { moba: { schema: "sentinel" }, cs: { schema: "sentinel" } },
  seasonStateV2: { schema: "sentinel" },
  competitionHistory: ["sentinel"],
  competitionHistoryByMode: { moba: ["sentinel"], cs: ["sentinel"] },
  circuitHistory: ["sentinel"],
  honors: [{ schema: "Honor.v1", id: "sentinel" }],
  processedCompetitionAwards: { sentinel: true },
});

const baseState = () => ({
  players: PLAYERS(),
  finance: { funds: 1_000_000, transactions: [] },
  meta: { days: 10, fans: 1000, competitiveBlock: null },
  processedMatchTransactions: {},
  economy: { formLog: [] },
  ...SEASON_SENTINEL(),
});

/** 用指定來源跑一次唯一結算入口，回傳前後狀態。 */
function settleOnce(org, { state = baseState(), adapter = "moba" } = {}) {
  const ctx = { players: state.players, lineup: null, streak: 0, fansNow: state.meta.fans, origin: org };
  const tx = adapter === "cs" ? null : mobaAd.mobaResultToTransaction(BR, ctx);
  const r = applyMod.applyProgressToState(state, tx);
  return { before: state, after: r.nextState, receipt: r.receipt, tx };
}

const G = settleOnce(ticketOrigin);
ck("G1) 一般對戰**有**實戰成長（XP 真的進帳）",
  (G.receipt?.totals?.xpGained ?? 0) > 0, `xp +${G.receipt?.totals?.xpGained}`);

ck("G2) 一般對戰**有**一般生涯收益（錢與粉絲都動）",
  G.after.finance.funds > G.before.finance.funds && G.after.meta.fans > G.before.meta.fans,
  `錢 +${G.after.finance.funds - G.before.finance.funds}／粉絲 +${G.after.meta.fans - G.before.meta.fans}`);

ck("G3) 成長**少於**正式季賽（一般對戰不是最佳養成法）",
  growth.PCGM_PARAMS.sourceBase[MATCH_SOURCE.competitive]
    < growth.PCGM_PARAMS.sourceBase[MATCH_SOURCE.official],
  `competitive ${growth.PCGM_PARAMS.sourceBase[MATCH_SOURCE.competitive]} < official ${growth.PCGM_PARAMS.sourceBase[MATCH_SOURCE.official]}`);

ck("G4) 每日容量常數只有一處，且 > 0（唯一的 balance 旋鈕）",
  Number(clock.COMPETITIVE_BLOCK.matchesPerDay) > 0
  && (read(P_CLOCK).match(/matchesPerDay:\s*\d+/g) ?? []).length === 1,
  `${clock.COMPETITIVE_BLOCK.matchesPerDay} 場／日`);

ck("G5) 只有一般對戰吃容量（結算後 used 0 → 1）",
  G.after.meta.competitiveBlock?.used === 1,
  JSON.stringify(G.after.meta.competitiveBlock));

ck("G6) 容量**跨日自動歸零**（推導出來的，沒有第二個要維護的重置點）",
  clock.competitiveBlockOf({ day: 10, used: 3 }, 11).used === 0
  && clock.competitiveBlockOf({ day: 10, used: 3 }, 10).used === 3);

ck("G7) 打滿之後**排隊就被擋**（不是打完才發現；錯誤訊息說得出怎麼解）",
  (() => {
    const s = codeOnly(read(P_STORE));
    return /competitive_block_full/.test(s) && /block\.remaining\s*<=\s*0/.test(s);
  })());

ck("G8) 檢查在排隊、扣格子在結算（排了又取消不白吃一格）",
  /competitiveBlockView\(\)/.test(codeOnly(read(P_STORE)))
  && /MATCH_SOURCE\.competitive/.test(codeOnly(read(P_APPLY))));

ck("G9) 一般對戰**不推世界時間**（愛打的人不會老得比較快）",
  Number(clock.WORLD_TIME_COST.competitive) === 0
  && clock.consumesWorldTime("competitive") === false);

// ════════════════════════════════════════════════════════════════════════════
//  §P 不得污染正式賽季——排名／巡迴積分／晉級／冠軍／賽季獎金／榮譽
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§P 一般對戰不得污染正式賽季】");

const SEASON_KEYS = Object.keys(SEASON_SENTINEL());
const seasonDiff = (before, after) => SEASON_KEYS.filter(
  (k) => k in (after ?? {}) && JSON.stringify(after[k]) !== JSON.stringify(before[k]));

ck("P1) 一般對戰結算後，賽季相關切片**一個位元都沒動**",
  seasonDiff(G.before, G.after).length === 0,
  seasonDiff(G.before, G.after).join(", ") || `${SEASON_KEYS.length} 個切片全數未變`);

ck("P2) 結算產出的 nextState **根本不含**任何賽季鍵（結構上就寫不進去）",
  SEASON_KEYS.every((k) => !(k in (G.after ?? {}))),
  SEASON_KEYS.filter((k) => k in (G.after ?? {})).join(", ") || "無");

ck("P3) 一般對戰的場次**不對應任何賽程**（`fixtureIdOfSession` 回 null）",
  bridge.fixtureIdOfSession({ origin: ticketOrigin }) === null
  && bridge.isFixtureSession({ origin: ticketOrigin }) === false);

ck("P4) 一般對戰的指派單不是賽事指派（賽事閘道認不得它）",
  comp.isCompetitionAssignment({ origin: ticketOrigin }) === false
  && comp.isCompetitionAssignment({ origin: fixtureOrigin }) === true);

ck("P5) 賽程回寫**唯一**的呼叫點被 `isFixtureSession` 守住",
  (() => {
    const s = codeOnly(read(P_STORE));
    const calls = s.match(/_writeFixtureResultFromMatch\s*\(/g) ?? [];
    //  一次是定義、一次是呼叫；呼叫那一次必須與 isFixtureSession 同一行條件
    return calls.length <= 2 && /isFixtureSession\(session\)\)\s*\{?\s*[\r\n]?\s*get\(\)\._writeFixtureResultFromMatch/.test(s);
  })(),
  "賽果回寫不得脫離 fixture 判定");

ck("P6) 來源契約禁止非賽程來源夾帶賽事欄位（積分／晉級沒有攀附點）",
  (() => {
    const bad = { ...ticketOrigin, competitionId: "c1", stageId: "s1", fixtureId: "fx1" };
    const v = origin.validateOrigin(bad);
    return v.ok === false && v.errors.some((e) => e.code === "ticket_origin_leak");
  })());

ck("P7) 巡迴積分**只由賽事結果推導**，沒有一般對戰的寫入路徑",
  (() => {
    const s = codeOnly(read("src/platform/competition/circuitPoints.js"));
    return !/ticket|competitive|matchSource/.test(s);
  })());

ck("P8) 榮譽（冠軍）只由賽事決賽產生，不吃 MatchResult",
  (() => {
    const s = codeOnly(read("src/platform/competition/honors.js"));
    return !/ticket|competitive|matchSource|MatchResult/.test(s);
  })());

ck("P9) 一般對戰的錢**不是賽季名次獎金**（走的是兩套不同的入帳路徑）",
  (() => {
    const award = codeOnly(read("src/platform/economy/competitionAward.js"));
    //  名次獎金那一支不得認得比賽來源；比賽結算那一支不得叫任何名次獎金函式
    return !/matchSource|MATCH_SOURCE/.test(award)
      && !/competitionAward|prizeForRank/.test(codeOnly(read(P_APPLY)));
  })());

ck("P10) 一般對戰照樣進**經濟層近期戰績**（那是收益的一部分，不是賽季成績）",
  (G.after.economy?.formLog?.length ?? 0) === 1,
  JSON.stringify(G.after.economy?.formLog ?? []));

// ════════════════════════════════════════════════════════════════════════════
//  §Z 快速對戰仍然是「完全零永久影響」——含 V7A 補掉的那個漏洞
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§Z 快速對戰零永久影響】");

const Z = settleOnce(practiceOrigin);
ck("Z1) 練習：0 錢 0 粉絲 0 XP",
  Z.after.finance.funds === Z.before.finance.funds
  && Z.after.meta.fans === Z.before.meta.fans
  && (Z.receipt?.totals?.xpGained ?? 0) === 0);

ck("Z2) 練習不吃每日容量（測試場不該跟正事搶額度）",
  (Z.after.meta.competitiveBlock?.used ?? 0) === 0,
  JSON.stringify(Z.after.meta.competitiveBlock));

//  ⚠⚠ 這一條就是 V7A 修掉的漏洞。formLog → recentForm() → 週結算的贊助績效
//    獎金 ⇒ 練習寫進去等於**繞一週才付款的永久金錢影響**。
//    V0D 只歸零了當場的錢／粉絲／XP，沒有人檢查這條延後生效的路。
ck("Z3) 練習**不進** `economy.formLog`（否則贊助績效獎金會偷偷變高）",
  (Z.after.economy?.formLog?.length ?? 0) === 0,
  JSON.stringify(Z.after.economy?.formLog ?? []));

ck("Z4) 練習不動賽季任何切片",
  seasonDiff(Z.before, Z.after).length === 0,
  seasonDiff(Z.before, Z.after).join(", ") || "全數未變");

ck("Z5) 歸零判定走 `isPracticeSource`，不是自己比對字串（TD-36 的形狀）",
  /isPracticeSource/.test(codeOnly(read(P_APPLY))));

ck("Z6) `unknown`（舊存檔／debug）**照舊記錄**戰績——資料遺失不該變成隱形懲罰",
  (() => {
    const U = settleOnce(null);
    return (U.after.economy?.formLog?.length ?? 0) === 1;
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §U UI：一般對戰要有名字、有說明、看得到今天還剩幾場
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§U UI 名稱與說明】");

const frame = read(P_FRAME);
const flow = read(P_FLOW);

ck("U1) 賽前頁有層級橫幅，且 MOBA / CS 共用同一個元件",
  /data-testid="prep-tier-banner"/.test(frame) && /<TierBanner/.test(frame),
  "MatchPrepFrame 是兩個模式共用的外框");

//  ⚠ 只掃 `TierBanner` 這個函式本體。整檔掃會掃到 V0D 那顆練習次要按鈕的
//    「🧪 快速練習 · 不影響戰績與數值」——那是 V0D §U 釘住的既有文案，
//    不是本輪的層級標籤，掃到它等於要求我去改一條綠的規則。
const bannerBody = (() => {
  const i = frame.indexOf("function TierBanner");
  const j = frame.indexOf("const TONE_STYLE", i);
  return i >= 0 && j > i ? frame.slice(i, j) : "";
})();

ck("U2) 層級橫幅**不寫死**任何一層的名稱與說明（一律取自分類器）",
  bannerBody.length > 0
  && /\{tier\.name\}/.test(bannerBody) && /\{tier\.note\}/.test(bannerBody)
  //  「已用滿」那句是容量提示，不是層級名稱 ⇒ 掃之前先拿掉
  && !/一般對戰|快速練習|生涯季賽/.test(codeOnly(bannerBody).replace(/今天的一般對戰已用滿[^<]*/g, "")),
  "文案來源必須是 MATCH_TIER_LABELS");

ck("U3) flow 從單一來源取層級（`matchTierOf` + `MATCH_TIER_LABELS`）",
  /matchTierOf/.test(codeOnly(flow)) && /MATCH_TIER_LABELS/.test(codeOnly(flow)));

ck("U4) 賽前頁看得到今天的容量（不必打滿才知道有這個限制）",
  /data-testid="prep-tier-capacity"/.test(frame) && /block\.used/.test(frame) && /block\.capacity/.test(frame));

ck("U5) 容量會隨結算即時更新（訂閱的是原始值，不是推導函式）",
  /blockSig/.test(codeOnly(flow)) && /competitiveBlock\?\.used/.test(flow),
  "本檔開頭那個「選擇器身分不變 ⇒ 永不重繪」的坑");

ck("U6) 帳本裡一般對戰那筆錢**不叫獎金**（獎金專指賽季名次獎金）",
  (() => {
    const s = codeOnly(read(P_APPLY));
    return /MATCH_TIER_LABELS\[matchSourceOfTx\]/.test(s) && !/勝利.*獎金/.test(s);
  })(),
  `實測標籤：${G.after.finance.transactions?.[0]?.label ?? "（無）"}`);

ck("U7) 實測標籤真的帶得出層級名稱",
  /一般對戰/.test(G.after.finance.transactions?.[0]?.label ?? ""),
  G.after.finance.transactions?.[0]?.label ?? "（無）");

//  ── 快速練習那顆次要按鈕：什麼叫「閒置」──────────────────────────────────
//  ⚠ 這條規則踩過**兩次**坑，兩次都是瀏覽器實測才抓到，所以在這裡用**單元**
//    的方式釘死，不要每次都得起一個 dev server 才知道有沒有壞。
const prep = await imp("src/screens/common/matchPrepAction.js");
const P = (o) => prep.canStartPracticeFrom({ entryOk: true, live: false, inPractice: false, ...o });

ck("U8) 全新存檔（沒有房間、沒有場次）⇒ 練習按鈕出得來",
  P({ roomState: null, sessionState: null }) === true);

ck("U9) **打完一場之後仍然出得來**（房間停在 confirmed、場次 completed）",
  P({ roomState: "confirmed", sessionState: "completed" }) === true,
  "第一版在這裡是 false ⇒ 打完任何一場競技，練習入口就消失了");

ck("U10) 放棄／逾期的場次同樣算閒置",
  P({ roomState: "confirmed", sessionState: "abandoned" }) === true
  && P({ roomState: "expired", sessionState: null }) === true);

ck("U11) **正要進場時不算閒置**（房間 confirmed、場次還沒簽出來）",
  P({ roomState: "confirmed", sessionState: null }) === false,
  "這正是不能直接套 ROOM_TERMINAL 的理由");

ck("U12) 進行中的對戰不算閒置", P({ roomState: "confirmed", sessionState: "launched" }) === false);

ck("U13) 已經在練習裡、或陣容沒補滿 ⇒ 不再勸他開練習",
  prep.canStartPracticeFrom({ entryOk: true, live: false, inPractice: true }) === false
  && prep.canStartPracticeFrom({ entryOk: false, live: false, inPractice: false }) === false);

ck("U14) 賽程的「重新進入本場」期間不勸他去練習（會清掉 fixtureAssignment）",
  P({ roomState: null, sessionState: "completed", actKey: "refixture" }) === false);

ck("U15) 規則住在純函式裡，hook 只遞原始值（可單元驗證）",
  /export function canStartPracticeFrom/.test(read("src/screens/common/matchPrepAction.js"))
  && /canStartPracticeFrom\(\{/.test(codeOnly(read(P_FLOW)))
  && !/\["cancelled", "expired"\]/.test(codeOnly(read(P_FLOW))),
  "useMatchFlow 不得再自己列房間狀態");


// ════════════════════════════════════════════════════════════════════════════
//  §N 本輪邊界：沒有為了 Ranked 過度設計
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

const ALL_SRC = ["src/platform/progress", "src/platform/matchmaking", "src/screens/common"]
  .flatMap((d) => fs.readdirSync(resolve(ROOT, d)).map((f) => `${d}/${f}`))
  .filter((p) => /\.(js|jsx)$/.test(p));

ck("N1) 沒有新增牌位／評分／排行榜（Ranked 是之後的事）",
  ALL_SRC.every((p) => !/\b(mmr|elo|ladder|rankTier|leaderboard)\b/i.test(codeOnly(read(p)))),
  `掃過 ${ALL_SRC.length} 個檔`);

ck("N2) 沒有第二條 battle pipeline（三個來源共用同一組 Room / Session 工廠）",
  (() => {
    const mock = codeOnly(read("src/platform/matchmaking/mockGateway.js"));
    const prac = codeOnly(read("src/platform/matchmaking/practiceGateway.js"));
    const cg = codeOnly(read("src/platform/competition/competitionGateway.js"));
    return [mock, prac, cg].every((s) => /createRoom|createAssignment/.test(s));
  })());

ck("N3) 沒有動任何來源倍率（calibration 不在本輪）",
  growth.PCGM_PARAMS.sourceBase[MATCH_SOURCE.competitive] === 1.0
  && growth.PCGM_PARAMS.sourceBase[MATCH_SOURCE.official] === 3.0
  && growth.PCGM_PARAMS.sourceBase[MATCH_SOURCE.practice] === 0.0
  && growth.PCGM_PARAMS.sourceBase[MATCH_SOURCE.unknown] === 1.0);

ck("N4) 生涯季賽沒有被誤傷（official 仍發錢／粉絲／XP，且不吃容量）",
  (() => {
    const O = settleOnce(fixtureOrigin);
    return O.after.finance.funds > O.before.finance.funds
      && (O.receipt?.totals?.xpGained ?? 0) > 0
      && (O.after.meta.competitiveBlock?.used ?? 0) === 0;
  })());

ck("N5) CS 走同一條（CS adapter 也帶得出 competitive 來源）",
  /matchSourceFromOrigin/.test(codeOnly(read("src/platform/progress/adapters/csProgressAdapter.js")))
  && typeof csAd.csResultToTransaction === "function");

// ════════════════════════════════════════════════════════════════════════════
//  §M mutation sentinel：把修正拿掉，對應的檢查必須變紅
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M mutation sentinel】");
{
  const applySrc = read(P_APPLY);

  //  A：把 formLog 的練習判斷拿掉 ⇒ §Z3 必須變紅
  const mutA = applySrc.replace(
    /economy: isPracticeSource\(matchSourceOfTx\)\s*\r?\n\s*\? \(state\.economy \?\? \{\}\)\s*\r?\n\s*: appendFormEntry\(/,
    "economy: appendFormEntry(");
  ck("M-A) 拿掉練習的 formLog 判斷 ⇒ 程式碼真的變了（§Z3 的守衛存在）",
    mutA !== applySrc, "sentinel 找得到那段判斷");

  //  B：容量只認 competitive 這件事必須寫在程式碼裡
  ck("M-B) 容量扣格只認 competitive（改成無條件就會影響 §Z2/§N4）",
    /matchSourceOfTx === MATCH_SOURCE\.competitive/.test(codeOnly(applySrc)));

  //  C：層級標籤必須是 frozen（避免呼叫端改到共用文案）
  ck("M-C) `MATCH_TIER_LABELS` 是凍結的（呼叫端改不動共用文案）",
    Object.isFrozen(src.MATCH_TIER_LABELS)
    && Object.values(src.MATCH_TIER_LABELS).every(Object.isFrozen));
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log(`V7A 一般對戰收口：${pass} / ${pass + fail} 通過`);
if (fail) { console.log(`❌ ${fail} 項未通過`); process.exit(1); }
console.log("✅ 全數通過");
