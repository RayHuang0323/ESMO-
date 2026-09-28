#!/usr/bin/env node
// ============================================================================
//  Competitive Enablement v1 — 系統層驗證
//
//  執行：`node tools/check_competitive_enablement_v1.mjs`（純函式，約 1–3 秒）
//
//  守八件事（對應 docs/design/Competitive_Enablement_v1.md §0）：
//    A 正式入口與 mode contract：預設關閉、關閉理由可讀、單一開關
//    B 不污染正式賽季：ranked 來源不帶賽事欄位、結算入口拒收、結果不得帶賽季帳本
//    C 不得刷永久能力：成長 0、XP 0、獎金粉絲 0、結算入口硬拒、100 場後生涯逐值不變
//    D CareerTime ↔ ServerTime：伺服器日不讀生涯日、配額只由伺服器日重置、不可付費
//    E 既有每日容量：3 場／世界日、跨日歸零、不跨日累積、只有一般對戰吃容量
//    F 資料責任：CompetitiveRecord 獨立、MOBA/CS 分帳、冪等、不進生涯存檔
//    G 生涯 roster 帶入：只經權威層取值、正規化、輸入不被寫、生涯日不進戰力雜湊
//    H CBR 接口：Cap → Bracket → Rating 順序固定、各階段只拿到自己的輸入、預設無數值
//
//  ⚠ 本檔**不驗**真伺服器、配對、即時連線、排行榜後端 —— 那些這一輪不存在，
//    驗它們只會產生假的安全感。
// ============================================================================
import { readFileSync, existsSync, readdirSync } from "node:fs";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const url = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(url(p), "utf8");
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\/.*$/gm, "");
const tryImport = async (p) => { try { return await import(`../${p}`); } catch (e) { return { __error: e }; } };

const COMPETITIVE_FILES = [
  "src/platform/competitive/competitiveMode.js",
  "src/platform/competitive/ratedQuota.js",
  "src/platform/competitive/competitiveRecord.js",
  "src/platform/competitive/cbrPipeline.js",
  "src/platform/competitive/rosterBridge.js",
  "src/platform/competitive/index.js",
  "src/platform/time/serverClock.js",
];

// ── 0 檔案存在 ──────────────────────────────────────────────────────────
console.log("── 0 檔案 ──");
for (const f of COMPETITIVE_FILES) ck(`${f} 存在`, existsSync(url(f)));
const missing = COMPETITIVE_FILES.filter((f) => !existsSync(url(f)));
if (missing.length) {
  console.log(`\nCompetitive Enablement v1：${pass}/${pass + fail} PASS（缺檔，後續各節無法執行）`);
  process.exit(1);
}

const CM = await import("../src/platform/competitive/competitiveMode.js");
const RQ = await import("../src/platform/competitive/ratedQuota.js");
const CR = await import("../src/platform/competitive/competitiveRecord.js");
const CBR = await import("../src/platform/competitive/cbrPipeline.js");
const RB = await import("../src/platform/competitive/rosterBridge.js");
const IDX = await import("../src/platform/competitive/index.js");
const SC = await import("../src/platform/time/serverClock.js");
const MS = await import("../src/platform/progress/matchSource.js");
const MO = await import("../src/platform/contracts/matchOrigin.js");
const CG = await import("../src/platform/progress/careerGrowth.js");
const RF = await import("../src/platform/progress/rewardFormulas.js");
const WC = await import("../src/platform/time/worldClock.js");
const P = await import("../src/platform/progress/applyMatchProgress.js");
const TX = await import("../src/platform/contracts/matchProgressTransaction.js");
const { STAT_DEF } = await import("../src/data/playerModel.js");
const { SNAPSHOT_SEATS } = await import("../src/platform/contracts/squadSnapshot.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 22, 12, 0, 0);   // 固定時刻；本檔不讀真實時鐘
const fixedClock = (ms) => SC.createServerClock({ kind: "test-fixed", now: () => ms });

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── A 正式入口與 mode contract ──");
{
  ck("A1 契約版本字串", CM.COMPETITIVE_MODE_VERSION === "CompetitiveMode.v1");
  ck("A2 **預設關閉**（COMPETITIVE_ENABLED = false）", CM.COMPETITIVE_ENABLED === false);
  const M = CM.COMPETITIVE_MODE;
  ck("A3 mode descriptor 凍結", Object.isFrozen(M));
  ck("A4 來源是獨立一格 ranked（不是 competitive＝一般對戰）",
    M.matchSource === "ranked" && MS.MATCH_SOURCE.ranked === "ranked" && M.matchSource !== MS.MATCH_SOURCE.competitive);
  ck("A5 時鐘是 ServerTime，不是 CareerTime", M.clock === "server");
  ck("A6 生涯寫回宣告為 NONE", M.careerWriteback === "none");
  ck("A7 支援模式 moba / cs，且兩者分帳（I9）",
    JSON.stringify(M.modes) === JSON.stringify(["moba", "cs"]) && M.crossModeShared === false);
  ck("A8 評分名稱是 LadderRating（不與 BattleResult 單場 rating 混用）", M.ratingName === "LadderRating");

  //  正式入口：預設一律不可用，且理由是「未開放」
  const off = CM.competitiveAvailability({ mode: "moba", serverClock: fixedClock(T0), quotaState: null });
  ck("A9 預設入口不可用", off.available === false);
  ck("A10 不可用理由第一條是 competitive_disabled", off.reasons[0]?.code === "competitive_disabled",
    off.reasons.map((r) => r.code).join(","));
  ck("A11 理由有中文訊息（畫面不出現內部字串）", /[一-鿿]/.test(off.reasons[0]?.message ?? ""));

  //  明確開啟（測試用注入）時，缺伺服器時間 ⇒ 仍不可用
  const noClock = CM.competitiveAvailability({ enabled: true, mode: "moba", serverClock: SC.createServerClock(null) });
  ck("A12 開啟但沒有伺服器時間 ⇒ 不可用（server_time_unavailable）",
    noClock.available === false && noClock.reasons.some((r) => r.code === "server_time_unavailable"));
  const badMode = CM.competitiveAvailability({ enabled: true, mode: "lol", serverClock: fixedClock(T0) });
  ck("A13 未知模式被拒", badMode.available === false && badMode.reasons.some((r) => r.code === "mode"));
  const on = CM.competitiveAvailability({ enabled: true, mode: "moba", serverClock: fixedClock(T0), quotaState: null });
  ck("A14 開啟＋伺服器時間＋配額未用 ⇒ 可用", on.available === true && on.quota?.remaining === RQ.RATED_QUOTA.ratedPerServerDay,
    JSON.stringify(on.reasons));

  //  單一開關：competitive 模組以外不得自己宣告第二個開關
  const flagSrc = code(read("src/featureFlags.js"));
  ck("A15 featureFlags.js 沒有第二個 competitive 開關（單一開關在 competitiveMode.js）",
    !/competitive/i.test(flagSrc));
  ck("A16 公開入口 index.js 匯出 availability 與契約",
    typeof IDX.competitiveAvailability === "function" && IDX.COMPETITIVE_MODE === CM.COMPETITIVE_MODE
    && typeof IDX.applyCompetitiveResult === "function" && typeof IDX.evaluateCbr === "function"
    && typeof IDX.buildCompetitiveEntry === "function");
  ck("A17 玩家可見層級名稱（與 matchSource 同源）",
    MS.MATCH_TIER_LABELS.ranked?.name === "競技排位" && /不影響生涯/.test(MS.MATCH_TIER_LABELS.ranked?.note ?? ""));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── B 不污染正式賽季 ──");
{
  ck("B1 ORIGIN_KINDS 有 ranked", MO.ORIGIN_KINDS.ranked === "ranked");
  ck("B2 ranked 中文名", MO.originKindLabel("ranked") === "競技排位");
  const o = MO.originFromRanked({ matchId: "rk-1", mode: "moba" });
  ck("B3 originFromRanked 合法", o.ok && MO.validateOrigin(o.origin).ok, JSON.stringify(o.errors));
  ck("B4 ranked 來源不帶任何賽事欄位",
    o.origin.competitionId === null && o.origin.stageId === null && o.origin.fixtureId === null);
  ck("B5 帶了賽事欄位的 ranked 來源被 validateOrigin 拒絕",
    !MO.validateOrigin({ ...o.origin, competitionId: "league-s1" }).ok);
  ck("B6 matchSourceFromOrigin(ranked) = ranked（不是 official／competitive）",
    MS.matchSourceFromOrigin(o.origin) === MS.MATCH_SOURCE.ranked);
  ck("B7 isRankedSource 判定", MS.isRankedSource("ranked") && !MS.isRankedSource("competitive") && !MS.isRankedSource("challenge"));
  ck("B8 缺 matchId 被拒", !MO.originFromRanked({ mode: "moba" }).ok);

  //  結果契約不得夾帶賽季帳本
  const leak = CR.validateCompetitiveResult({
    schema: CR.COMPETITIVE_RESULT_VERSION, resultId: "r1", mode: "moba", serverDay: 10, outcome: "win",
    rated: true, entryPowerHash: "aaaaaaaa", opponent: { teamId: "t2", powerHash: "bbbbbbbb" },
    bracketId: "open", circuitPoints: 30,
  });
  ck("B9 結果夾帶 circuitPoints 被拒", !leak.ok && leak.errors.some((e) => e.code === "season_leak"));
  for (const k of ["standings", "honors", "competitionId", "fixtureId", "trophies"]) {
    const r = CR.validateCompetitiveResult({
      schema: CR.COMPETITIVE_RESULT_VERSION, resultId: "r1", mode: "moba", serverDay: 10, outcome: "win",
      rated: true, entryPowerHash: "aaaaaaaa", opponent: { teamId: "t2", powerHash: "bbbbbbbb", [k]: 1 },
    });
    ck(`B10 巢狀夾帶 ${k} 也被拒`, !r.ok);
  }

  //  結算入口（唯一的生涯寫入點）硬拒 ranked
  const tx = TX.createMatchProgressTransaction({
    matchId: "rk-1", mode: "moba", sourceResultVersion: "BattleResult.v2", recordedAt: 1,
    teamRewards: { money: 5000, fans: 50 }, playerProgress: [{ playerId: "b1", xpGained: 60 }],
    metadata: { matchSource: "ranked", winner: "us" },
  });
  const st = { players: [{ id: "b1", xp: 0, stats: { reflex: 60 } }], finance: { funds: 0 }, meta: { days: 5, fans: 0 },
    processedMatchTransactions: {} };
  const r = P.applyProgressToState(st, tx);
  ck("B11 applyProgressToState 拒收 ranked 交易單", r.nextState === null && r.receipt.ok === false
    && r.receipt.errors.some((e) => e.code === "ranked_not_career"), JSON.stringify(r.receipt.errors));
  ck("B12 拒收時**連冪等帳都不記**（不留半套）", Object.keys(st.processedMatchTransactions).length === 0);

  //  結構：賽季帳本模組不 import competitive；competitive 不 import 賽季／Store
  const seasonFiles = readdirSync(url("src/platform/competition")).filter((f) => f.endsWith(".js"))
    .map((f) => `src/platform/competition/${f}`)
    .concat(["src/platform/seasonStore.js", "src/platform/contracts/circuit.js", "src/platform/contracts/finalStandings.js"]);
  const seasonHits = seasonFiles.filter((f) => /from\s+["'][^"']*competitive\//.test(read(f)));
  ck("B13 賽季／巡迴／名次模組不 import competitive/", seasonHits.length === 0, seasonHits.join(",") || `${seasonFiles.length} 檔 clean`);
  const compImports = COMPETITIVE_FILES.flatMap((f) => [...read(f).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => `${f}→${m[1]}`));
  const bad = compImports.filter((s) => /seasonStore|profileStore|competition\/|circuit|finalStandings|applyMatchProgress|levelGrowth|zustand|react/.test(s));
  ck("B14 competitive 模組不 import Store／賽季／結算／成長", bad.length === 0, bad.join(" ; ") || "clean");
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── C 不得靠對戰刷永久能力 ──");
{
  ck("C1 GROWTH_SOURCES.ranked 存在", CG.GROWTH_SOURCES.ranked === "ranked");
  ck("C2 sourceBase.ranked = 0.0", CG.PCGM_PARAMS.sourceBase.ranked === 0);
  ck("C3 careerGrowthFactor(ranked) = 0",
    CG.careerGrowthFactor({ source: "ranked", player: { age: 20, stats: { learning: 80 } } }) === 0);
  const rw = RF.teamRewardsFor({ win: true, marginF: 1, streak: 3, fansNow: 1000, matchSource: "ranked" });
  ck("C4 teamRewardsFor(ranked) = 0 獎金 0 粉絲", rw.money === 0 && rw.fans === 0 && rw.prizeWan === 0);
  ck("C5 playerXpFor(ranked) = 0（不升級、不發天賦點）", RF.playerXpFor({ win: true, perf: 1.3, isMvp: true, matchSource: "ranked" }) === 0);
  ck("C6 對照：一般對戰仍有 XP（確認沒有誤傷）", RF.playerXpFor({ win: true, perf: 1, isMvp: false, matchSource: "competitive" }) > 0);

  //  100 場 ranked 結果只進 CompetitiveRecord；生涯狀態逐值不變
  const career = { players: [{ id: "b1", xp: 100, lv: 2, stats: { reflex: 70 }, energy: 80 }], meta: { days: 9, fans: 10 }, finance: { funds: 500 } };
  const before = JSON.stringify(career);
  let rec = CR.emptyCompetitiveRecord();
  for (let i = 0; i < 100; i++) {
    const made = CR.createCompetitiveResult({
      resultId: `farm-${i}`, mode: "moba", serverDay: 100 + Math.floor(i / 3), outcome: i % 2 ? "win" : "loss",
      rated: true, entryPowerHash: "aaaaaaaa", opponent: { teamId: `t${i}`, powerHash: "bbbbbbbb" }, bracketId: "open",
    });
    rec = CR.applyCompetitiveResult(rec, made.result).record;
  }
  ck("C7 100 場之後生涯狀態逐值不變", JSON.stringify(career) === before);
  ck("C8 100 場全部進了 CompetitiveRecord", rec.byMode.moba.played === 100, `played=${rec.byMode.moba.played}`);
  ck("C9 CompetitiveRecord 沒有任何能力／經濟欄位",
    CM.findCareerWriteKeys(rec).length === 0, CM.findCareerWriteKeys(rec).join(","));
  const src = COMPETITIVE_FILES.map((f) => code(read(f))).join("\n");
  ck("C10 competitive 模組沒有 set()／save()／players 寫入", !/\bset\(|\.save\(|players\s*\[[^\]]*\]\s*=|\.stats\s*=/.test(src));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── D CareerTime ↔ ServerTime ──");
{
  ck("D1 ServerTime 契約版本", SC.SERVER_TIME_VERSION === "ServerTime.v1");
  ck("D2 同一 UTC 日同一伺服器日", SC.serverDayOf(T0) === SC.serverDayOf(T0 + 11 * 3600 * 1000) && SC.serverDayOf(T0) === SC.serverDayOf(T0 - 12 * 3600 * 1000));
  ck("D3 跨 UTC 日 +1", SC.serverDayOf(T0 + DAY_MS) === SC.serverDayOf(T0) + 1);
  ck("D4 非數字 ⇒ null（不猜）", SC.serverDayOf(NaN) === null && SC.serverDayOf(undefined) === null);
  const none = SC.createServerClock(null);
  ck("D5 沒有權威時間來源 ⇒ unavailable，serverDay 為 null", none.available === false && none.serverDay() === null);
  const scSrc = code(read("src/platform/time/serverClock.js"));
  ck("D6 serverClock **不退回裝置時間**（無 Date.now）", !/Date\.now/.test(scSrc));
  ck("D7 serverClock 不 import worldClock／profileStore（兩個時鐘不互相依賴）",
    !/worldClock|profileStore|meta\.days/.test(scSrc));
  const wcSrc = code(read("src/platform/time/worldClock.js"));
  ck("D8 worldClock 不 import serverClock", !/serverClock/.test(wcSrc));
  ck("D9 WORLD_TIME_COST.ranked = 0（線上不推進生涯日）", WC.WORLD_TIME_COST.ranked === 0);

  //  配額：只由伺服器日重置
  const s0 = null;
  const day = SC.serverDayOf(T0);
  let q = RQ.ratedQuotaOf(s0, day, "moba");
  ck("D10 每伺服器日 Rated 基準 3", q.capacity === 3 && q.remaining === 3 && RQ.RATED_QUOTA.ratedPerServerDay === 3);
  let st = s0;
  for (let i = 0; i < 3; i++) { const c = RQ.consumeRatedQuota(st, day, "moba"); st = c.next; }
  ck("D11 用完 3 場 ⇒ remaining 0", RQ.ratedQuotaOf(st, day, "moba").remaining === 0);
  const over = RQ.consumeRatedQuota(st, day, "moba");
  ck("D12 第 4 場被拒且狀態不變", over.ok === false && JSON.stringify(over.next) === JSON.stringify(st));
  ck("D13 下一個伺服器日自動歸零", RQ.ratedQuotaOf(st, day + 1, "moba").remaining === 3);
  ck("D14 MOBA 用完不影響 CS（I9）", RQ.ratedQuotaOf(st, day, "cs").remaining === 3);
  //  CareerTime 推進 1000 天也不會重置配額（配額根本不吃生涯日）
  const careerAdvanced = RQ.ratedQuotaOf(st, day, "moba", { careerDay: 99999, days: 99999 });
  ck("D15 生涯快轉不重置配額（I16）", careerAdvanced.remaining === 0);
  ck("D16 配額狀態不含任何生涯時間欄位", SC.findCareerTimeKeys(st).length === 0, SC.findCareerTimeKeys(st).join(","));
  //  永不可付費增加
  ck("D17 RATED_QUOTA 宣告不可購買且凍結", RQ.RATED_QUOTA.purchasable === false && Object.isFrozen(RQ.RATED_QUOTA));
  const bribed = RQ.ratedQuotaOf(null, day, "moba", { bonus: 5, purchased: 10, extra: 3 });
  ck("D18 傳入 bonus／purchased／extra 不改變容量", bribed.capacity === 3);
  const rqSrc = code(read("src/platform/competitive/ratedQuota.js"));
  ck("D19 ratedQuota 不讀生涯時鐘", !/meta\.days|careerDay|worldClock|advanceDay/.test(rqSrc));
  ck("D20 伺服器日不可用時配額回報 unavailable", RQ.ratedQuotaOf(null, null, "moba").available === false);
  ck("D21 careerTime 洩漏偵測器認得 days／careerDay／careerYear",
    SC.findCareerTimeKeys({ a: { days: 1 }, careerDay: 2, x: [{ careerYear: 3 }] }).length === 3);
  const r = CR.validateCompetitiveResult({
    schema: CR.COMPETITIVE_RESULT_VERSION, resultId: "r1", mode: "moba", serverDay: 10, outcome: "win",
    rated: true, entryPowerHash: "aaaaaaaa", opponent: { teamId: "t2", powerHash: "bbbbbbbb" }, careerDay: 5,
  });
  ck("D22 結果帶 careerDay 被拒（I5：生涯日不得進線上）", !r.ok && r.errors.some((e) => e.code === "career_time_leak"));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── E 既有每日容量規則 ──");
{
  ck("E1 一般對戰每世界日 3 場", WC.COMPETITIVE_BLOCK.matchesPerDay === 3);
  const b = WC.competitiveBlockOf({ day: 5, used: 2 }, 5);
  ck("E2 同日累計", b.used === 2 && b.remaining === 1);
  ck("E3 跨日自動歸零", WC.competitiveBlockOf({ day: 5, used: 3 }, 6).remaining === 3);
  ck("E4 不跨日累積（I7）：昨天沒用完，今天仍是 3 不是 4",
    WC.competitiveBlockOf({ day: 5, used: 0 }, 6).capacity === 3 && WC.competitiveBlockOf(null, 6).remaining === 3);
  ck("E5 超用夾住（used 不超過 capacity）", WC.competitiveBlockOf({ day: 5, used: 9 }, 5).used === 3);

  const mkTx = (src, id) => TX.createMatchProgressTransaction({
    matchId: id, mode: "moba", sourceResultVersion: "BattleResult.v2", recordedAt: 1,
    teamRewards: {}, playerProgress: [], metadata: { matchSource: src, winner: "us" },
  });
  const base = { players: [], finance: { funds: 0 }, meta: { days: 7, fans: 0, competitiveBlock: { day: 7, used: 1 } },
    processedMatchTransactions: {} };
  const usedAfter = (src) => P.applyProgressToState(base, mkTx(src, `e-${src}`)).nextState?.meta?.competitiveBlock?.used;
  ck("E6 一般對戰結算扣一格", usedAfter("competitive") === 2);
  ck("E7 快速練習不扣", usedAfter("practice") === 1);
  ck("E8 正式季賽不扣", usedAfter("official") === 1);
  ck("E9 ranked 根本進不了結算（不可能扣到生涯容量）",
    P.applyProgressToState(base, mkTx("ranked", "e-ranked")).nextState === null);
  const storeSrc = read("src/platform/profileStore.js");
  ck("E10 排隊入口在容量用滿時擋下（competitive_block_full）", /competitive_block_full/.test(storeSrc));
  ck("E11 Rated 配額與生涯容量是兩個常數、兩個檔案",
    !/COMPETITIVE_BLOCK/.test(code(read("src/platform/competitive/ratedQuota.js")))
    && !/RATED_QUOTA|ratedQuota/.test(code(read("src/platform/time/worldClock.js"))));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── F 資料責任 ──");
{
  ck("F1 契約版本", CR.COMPETITIVE_RESULT_VERSION === "CompetitiveResult.v1" && CR.COMPETITIVE_RECORD_VERSION === "CompetitiveRecord.v1");
  const empty = CR.emptyCompetitiveRecord();
  ck("F2 空紀錄分 MOBA／CS 兩本帳", Object.keys(empty.byMode).sort().join() === "cs,moba");
  ck("F3 預設 LadderRating 為 null（未評分，不是 0 也不是 1500）",
    empty.byMode.moba.ladderRating === null && empty.byMode.cs.ladderRating === null);
  const mk = (id, mode = "moba", outcome = "win") => CR.createCompetitiveResult({
    resultId: id, mode, serverDay: 20, outcome, rated: true,
    entryPowerHash: "aaaaaaaa", opponent: { teamId: "t2", powerHash: "bbbbbbbb" }, bracketId: "open",
  });
  const m1 = mk("x1");
  ck("F4 createCompetitiveResult 合法", m1.ok && CR.validateCompetitiveResult(m1.result).ok, JSON.stringify(m1.errors));
  const a1 = CR.applyCompetitiveResult(empty, m1.result);
  ck("F5 套用一場：played 1 wins 1", a1.applied && a1.record.byMode.moba.played === 1 && a1.record.byMode.moba.wins === 1);
  const a2 = CR.applyCompetitiveResult(a1.record, m1.result);
  ck("F6 同一 resultId 再套用 ⇒ 冪等（alreadyApplied，不重複計）",
    a2.alreadyApplied === true && a2.applied === false && a2.record.byMode.moba.played === 1);
  ck("F7 MOBA 結果不污染 CS 帳", a1.record.byMode.cs.played === 0);
  const csR = CR.applyCompetitiveResult(a1.record, mk("x1", "cs").result);
  ck("F8 同一 resultId 在 CS 是另一場（帳本分開）", csR.applied && csR.record.byMode.cs.played === 1);
  ck("F9 輸入紀錄未被就地修改（純函式）", empty.byMode.moba.played === 0);
  ck("F10 不合法結果不寫入", CR.applyCompetitiveResult(empty, { resultId: "bad" }).applied === false);
  const unrated = CR.applyCompetitiveResult(empty, CR.createCompetitiveResult({
    resultId: "u1", mode: "moba", serverDay: 20, outcome: "win", rated: false,
    entryPowerHash: "aaaaaaaa", opponent: { teamId: "t2", powerHash: "bbbbbbbb" }, bracketId: "open",
  }).result);
  ck("F11 unrated 場只進歷史不進戰績", unrated.record.byMode.moba.played === 0 && unrated.record.byMode.moba.history.length === 1);
  let big = empty;
  for (let i = 0; i < CR.HISTORY_LIMIT + 20; i++) big = CR.applyCompetitiveResult(big, mk(`h${i}`, "moba", "loss").result).record;
  ck("F12 歷史有上限（不無限長大）", big.byMode.moba.history.length === CR.HISTORY_LIMIT);
  ck("F13 歷史裁掉後冪等帳仍擋得住舊 resultId", CR.applyCompetitiveResult(big, mk("h0", "moba", "loss").result).alreadyApplied === true);
  ck("F14 預設評分政策不動 LadderRating（數值 LATER）", big.byMode.moba.ladderRating === null);

  //  生涯存檔不承擔 Competitive 帳本
  const store = code(read("src/platform/profileStore.js"));
  ck("F15 profileStore 沒有 CompetitiveRecord／LadderRating／ratedQuota 欄位",
    !/competitiveRecord|ladderRating|ratedQuota|CompetitiveRecord/.test(store));
  ck("F16 CompetitiveRecord 宣告擁有者是 ranked authority，不是生涯存檔",
    CR.COMPETITIVE_RECORD_OWNER?.persistedInCareerSave === false && CR.COMPETITIVE_RECORD_OWNER?.trusted === false);
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── G 生涯 roster 帶入 ──");
{
  const KEYS = STAT_DEF.map((s) => s.key);
  const statsAt = (base) => Object.fromEntries(KEYS.map((k, i) => [k, base + (i % 5)]));
  const mkPlayers = (base) => SNAPSHOT_SEATS.map((seat, i) => ({
    id: seat, name: `選手${i}`, role: ["top", "jungle", "mid", "adc", "sup"][i], status: "主力", rosterTier: "active",
    stats: statsAt(base + i), morale: 12, condition: "疲勞", energy: 3,
  }));
  const careerStateOf = (base, day, extra = {}) => ({
    players: mkPlayers(base),
    lineup: Object.fromEntries(SNAPSHOT_SEATS.map((s) => [s, s])),
    heroProgress: Object.fromEntries(SNAPSHOT_SEATS.map((s, i) => [`hero_${s}`, { level: 3 + i }])),
    heroAssign: Object.fromEntries(SNAPSHOT_SEATS.map((s) => [s, `hero_${s}`])),
    team: { teamId: "team:alpha", teamName: "測試戰隊", tag: "TST" },
    careerDay: day, lastPublishedCareerDay: day,   // ⚠ 防守節流已用掉 ⇒ 證明 entry 不吃節流
    ...extra,
  });
  const request = { teamId: "team:alpha", tacticId: "m1" };
  const cs1 = careerStateOf(60, 10);
  const frozen = JSON.stringify(cs1);
  const e1 = RB.buildCompetitiveEntry({ request, careerState: cs1, now: 1000, mode: "moba" });
  ck("G1 從生涯狀態建出 CompetitiveEntry", e1.ok && e1.entry?.schema === "CompetitiveEntry.v1", JSON.stringify(e1.errors));
  ck("G2 生涯狀態未被寫入（純讀取）", JSON.stringify(cs1) === frozen);
  ck("G3 快照由權威層簽發且標記 untrusted（目前無真伺服器）",
    e1.entry.provenance.issuedBy && e1.entry.provenance.trusted === false);
  ck("G4 值原樣進入（不縮放能力）", e1.entry.powerInputs.stats.b1.reflex === cs1.players[0].stats.reflex);
  ck("G5 狀態欄位（morale／condition／energy）不進戰力輸入",
    !JSON.stringify(e1.entry.powerInputs.stats).match(/morale|condition|energy/));
  ck("G6 provenance 記錄 guardrail 未作用（policy none，effective = raw）",
    e1.entry.provenance.guardrail.policy === "none" && e1.entry.provenance.guardrail.applied === false);
  const e2 = RB.buildCompetitiveEntry({ request, careerState: careerStateOf(60, 400), now: 9000, mode: "moba" });
  ck("G7 **生涯日／簽發時刻不進戰力雜湊**（I4：快轉不換線上戰力）", e1.entry.powerHash === e2.entry.powerHash);
  ck("G8 但快照雜湊會記到不同日（可查帳）", e1.entry.provenance.snapshotHash !== e2.entry.provenance.snapshotHash);
  const e3 = RB.buildCompetitiveEntry({ request, careerState: careerStateOf(61, 10), now: 1000, mode: "moba" });
  ck("G9 能力改變 ⇒ 戰力雜湊改變（練功會被看見，不是免費戰力）", e3.entry.powerHash !== e1.entry.powerHash);
  const leak = RB.buildCompetitiveEntry({ request: { ...request, stats: { reflex: 99 } }, careerState: cs1, now: 1000, mode: "moba" });
  ck("G10 請求夾帶數值被拒（client trust boundary 不放寬）", !leak.ok);
  const cs = RB.buildCompetitiveEntry({ request, careerState: cs1, now: 1000, mode: "cs" });
  //  ⚠ 2026-09-28（Online Backend Foundation v1）：CS 線上快照延後（TD-58：CS 沒有登記的模擬版本，
  //    且 `toFpsRoster` 已套 csStatDamp 疲勞）。這裡守：CS 出賽單一律以 `CS_ENTRY_DEFERRED` 拒絕，
  //    不做任何替代推導；未知模式一律拒。
  const unknownMode = RB.buildCompetitiveEntry({ request, careerState: cs1, now: 1000, mode: "lol" });
  ck("G11 CS 出賽單延後（cs_snapshot_deferred ⇒ 拒）；未知模式被拒",
    !cs.ok && cs.errors.some((e) => e.code === RB.CS_ENTRY_DEFERRED.code)
    && !unknownMode.ok && unknownMode.errors.some((e) => e.code === "mode"));
  const short = RB.buildCompetitiveEntry({ request, careerState: { ...cs1, players: cs1.players.slice(0, 3) }, now: 1000, mode: "moba" });
  ck("G12 先發不完整被拒", !short.ok);
  ck("G13 powerInputs 不含生涯時間欄位", SC.findCareerTimeKeys(e1.entry.powerInputs).length === 0);
  ck("G14 entry 物件凍結（進場即凍結，I10）", Object.isFrozen(e1.entry) && Object.isFrozen(e1.entry.powerInputs));
}

// ══════════════════════════════════════════════════════════════════════════
console.log("\n── H CBR 接口（Cap → Bracket → Rating）──");
{
  ck("H1 版本與階段順序", CBR.CBR_PIPELINE_VERSION === "CbrPipeline.v1"
    && JSON.stringify(CBR.CBR_STAGES) === JSON.stringify(["cap", "bracket", "rating"]));
  const powerInputs = Object.freeze({ mode: "moba", stats: { b1: { reflex: 70 } } });
  const d = CBR.evaluateCbr({ powerInputs, ladderRating: null });
  ck("H2 預設政策可跑完三階段", d.ok && d.stages.map((s) => s.stage).join() === "cap,bracket,rating", JSON.stringify(d));
  ck("H3 預設 Cap 未定價（priced false，price null）", d.stages[0].priced === false && d.stages[0].price === null);
  ck("H4 預設 Bracket 為單一開放級", d.bracketId === "open");
  ck("H5 預設 Rating 範圍無數值", d.ratingBand.min === null && d.ratingBand.max === null);

  //  各階段只拿到自己該拿的輸入
  const seen = {};
  const spy = {
    cap: { id: "cap.spy", evaluate: (inp) => { seen.cap = Object.keys(inp).sort().join(); return { eligible: true, priced: true, price: 42 }; } },
    bracket: { id: "bracket.spy", assign: (inp) => { seen.bracket = Object.keys(inp).sort().join(); return { bracketId: "b2" }; } },
    rating: { id: "rating.spy", band: (inp) => { seen.rating = Object.keys(inp).sort().join(); return { min: null, max: null }; }, rate: (x) => x.ladderRating },
  };
  const s = CBR.evaluateCbr({ powerInputs, ladderRating: null, pricer: () => 42 }, spy);
  ck("H6 Cap 看得到戰力輸入與定價器", seen.cap === "powerInputs,pricer", seen.cap);
  ck("H7 Bracket 只看得到 Cap 的定價結果（看不到原始能力）", seen.bracket === "price", seen.bracket);
  ck("H8 Rating 只看得到 LadderRating 與級別（看不到陣容）", seen.rating === "bracketId,ladderRating", seen.rating);
  ck("H9 自訂政策的級別被採用", s.bracketId === "b2");

  const capReject = CBR.evaluateCbr({ powerInputs, ladderRating: null }, {
    ...CBR.DEFAULT_CBR_POLICIES,
    cap: { id: "cap.reject", evaluate: () => ({ eligible: false, priced: true, price: 999, reason: "over_cap" }) },
  });
  ck("H10 Cap 拒絕 ⇒ 停在 cap，不進 Bracket／Rating",
    capReject.ok === false && capReject.rejectedAt === "cap" && capReject.stages.length === 1);
  const badPolicy = CBR.validateCbrPolicies({ cap: { id: "x" }, bracket: CBR.DEFAULT_CBR_POLICIES.bracket, rating: CBR.DEFAULT_CBR_POLICIES.rating });
  ck("H11 缺函式的政策被拒", !badPolicy.ok);
  ck("H12 Bracket 政策不得寫入 powerInputs（凍結傳入）", (() => {
    try {
      CBR.evaluateCbr({ powerInputs: { mode: "moba", stats: {} }, ladderRating: null }, {
        ...CBR.DEFAULT_CBR_POLICIES,
        cap: { id: "cap.mut", evaluate: (inp) => { inp.powerInputs.stats.hacked = 1; return { eligible: true, priced: false, price: null }; } },
      });
      return false;
    } catch { return true; }
  })());
  const cbrSrc = code(read("src/platform/competitive/cbrPipeline.js"));
  ck("H13 管線不自建戰力公式（無 calcPower／teamStrength）", !/calcPower|teamStrength|combineStrength/.test(cbrSrc));
  //  ⚠ 不用 "CBR_" 當禁字：`CBR_PIPELINE_VERSION` / `CBR_STAGES` 是結構常數名。
  //    改成更嚴的斷言：去掉註解與字串之後，管線裡**一個數字常值都沒有**。
  const cbrNoStrings = cbrSrc.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
  const numerals = cbrNoStrings.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w])/g) ?? [];
  ck("H14 管線沒有任何 CBR／Rating 數值（無數字常值、無 starExcess／MATCH_BAND／eloK）",
    numerals.length === 0 && !/starExcess|MATCH_BAND|ratingDelta|eloK/.test(cbrSrc), numerals.join(",") || "0 個數字");
  const rt = CR.applyCompetitiveResult(CR.emptyCompetitiveRecord(), CR.createCompetitiveResult({
    resultId: "p1", mode: "moba", serverDay: 1, outcome: "win", rated: true,
    entryPowerHash: "aaaaaaaa", opponent: { teamId: "t", powerHash: "bbbbbbbb" }, bracketId: "open",
  }).result, { ratingPolicy: { id: "rating.test", band: () => ({ min: null, max: null }), rate: ({ ladderRating, outcome }) => (ladderRating ?? 0) + (outcome === "win" ? 1 : -1) } });
  ck("H15 評分政策可插拔：注入政策後才產生 LadderRating", rt.record.byMode.moba.ladderRating === 1
    && rt.record.byMode.moba.ratingPolicy === "rating.test");
}

// ══════════════════════════════════════════════════════════════════════════
console.log(`\nCompetitive Enablement v1：${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
