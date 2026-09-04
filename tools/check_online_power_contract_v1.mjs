#!/usr/bin/env node
// ============================================================================
//  Online Competitive Power Contract v1 — 邊界驗證
//
//  守四件事（Owner 指定），全部針對**目前真的存在的程式**：
//    ① `MatchEntryRequest` 不信任 client 送來的數值
//    ② capability modifier（Team Development／Coach／未來 Facilities）不跨邊界
//    ③ roster identity 契約穩定（版本語意不被能力值污染）
//    ④ duplicate／reload／version 語意沒被破壞
//
//  ⚠ 本檔**不驗 CBR／Rating／Cap／Bracket** —— 那些在 main 上根本不存在
//    （見 `docs/design/Online_Competitive_Power_Contract_v1.md` §1）。
//    驗一個不存在的東西只會產生假的安全感。
//  ⚠ 本檔不做任何數值校準，也不 import battle runtime。
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import {
  createMatchEntryRequest, validateMatchEntryRequest, rosterVersionOf,
  stableHash, FORBIDDEN_VALUE_KEYS, MATCH_ENTRY_VERSION,
} from "../src/platform/contracts/matchEntry.js";
import {
  MATCH_SQUAD_VERSION, createSquadSubmission, validateSquadSubmission,
  seatsOf, tierOf,
} from "../src/platform/contracts/matchSquad.js";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** 五名合法 MOBA 選手（能力值刻意給滿，證明它們**不會**出現在申請單裡）。 */
const mkPlayers = (bump = 0) => ["b1", "b2", "b3", "b4", "b5"].map((id, i) => ({
  id, name: `選手${i}`, role: ["top", "jungle", "mid", "adc", "sup"][i],
  status: "主力", rosterTier: "starter",
  energy: 100, morale: 90, lv: 50 + bump, xp: 99999,
  potential: 99,
  stats: Object.fromEntries(["reflex", "accuracy", "apm", "positioning", "mapAware",
    "tacticalIQ", "decision", "adaptability", "courage", "focus", "clutch", "consistency",
    "teamwork", "comms", "leadership", "synergy"].map((k) => [k, 88 + bump])),
}));
const SEATS = { b1: "b1", b2: "b2", b3: "b3", b4: "b4", b5: "b5" };
const CTX = { teamId: "t1", teamName: "隊伍", day: 8, week: 2, season: 1 };

// ── §1 現況：哪些線上契約真的存在 ────────────────────────────────────────
console.log("── §1 現況 ──");
{
  const EXISTS = ["src/platform/contracts/matchEntry.js", "src/platform/contracts/matchSquad.js"];
  const ABSENT = [
    "src/platform/contracts/squadSnapshot.js",
    "src/platform/contracts/onlineCbr.js",
    "src/platform/contracts/onlineValuation.js",
    "src/platform/contracts/matchmakingPolicy.js",
    "src/platform/contracts/cbrDecisionGate.js",
  ];
  ck("canonical 線上契約存在", EXISTS.every((f) => existsSync(new URL(`../${f}`, import.meta.url))));
  //  ⚠ 這一條是**刻意**斷言「不存在」：文件與註解多處提到 SquadSnapshot／CBR，
  //    若有人日後把它們加進來卻沒更新契約文件，這裡會紅，逼出一次同步。
  const present = ABSENT.filter((f) => existsSync(new URL(`../${f}`, import.meta.url)));
  ck("CBR／SquadSnapshot／估值層在 main 上仍不存在（設計尚未實作）",
    present.length === 0, present.join(", ") || "5 個都不存在");
  ck("契約版本字串穩定",
    MATCH_ENTRY_VERSION === "MatchEntryRequest.v1" && MATCH_SQUAD_VERSION === "MatchSquad.v1",
    `${MATCH_ENTRY_VERSION} / ${MATCH_SQUAD_VERSION}`);
}

// ── §2 ① client 送不出數值 ──────────────────────────────────────────────
console.log("\n── §2 client 不得送數值 ──");
{
  const players = mkPlayers();
  const r = createMatchEntryRequest({ mode: "moba", seats: SEATS, players, context: CTX });
  ck("合法陣容產得出申請單", r.ok === true, (r.errors ?? []).map((e) => e.message).join(" | "));
  const json = JSON.stringify(r.request);
  //  申請單裡不得出現任何能力數值鍵
  const leaked = FORBIDDEN_VALUE_KEYS.filter((k) => new RegExp(`"${k}"`).test(json));
  ck("申請單不含任何被禁的數值欄位", leaked.length === 0, leaked.join(",") || FORBIDDEN_VALUE_KEYS.length + " 個鍵都沒出現");
  //  也不得夾帶實際數值。
  //  ⚠ 不能用字串比對（第一版就是這樣寫錯的：`88` 會命中十六進位雜湊
  //    `db8873d2` 裡的 "88"）。改成**收集所有數值型別的值**再判斷。
  const numbersIn = (v, out = []) => {
    if (typeof v === "number") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => numbersIn(x, out));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => numbersIn(x, out));
    return out;
  };
  ck("陣容條目完全不含數值型別（能力值進不去）",
    numbersIn(r.request.squad).length === 0, JSON.stringify(numbersIn(r.request.squad)));
  //  整張申請單唯一允許的數字是時間座標
  const allNumbers = numbersIn(r.request);
  const timeNumbers = numbersIn(r.request.submittedAt);
  ck("申請單裡唯一的數字是時間座標（day/week/season）",
    allNumbers.length === timeNumbers.length, JSON.stringify(allNumbers));
  ck("申請單只帶身分與編制",
    r.request.squad.every((s) => Object.keys(s).sort().join(",") === "playerId,role,seat,seatRole,tier"),
    JSON.stringify(Object.keys(r.request.squad[0]).sort()));

  //  伺服器端驗證會擋下被夾帶數值的申請單
  for (const key of ["stats", "power", "rating", "ovr", "derived"]) {
    const tampered = JSON.parse(JSON.stringify(r.request));
    tampered.squad[0][key] = 99;
    const v = validateMatchEntryRequest(tampered, players);
    ck(`夾帶 ${key} 的申請單被拒`, v.ok === false, (v.errors ?? []).map((e) => e.code).join(","));
  }
  //  巢狀夾帶也要擋（遞迴掃描，不是只看第一層）
  const nested = JSON.parse(JSON.stringify(r.request));
  nested.squad[0].meta = { deep: { stats: { reflex: 99 } } };
  ck("巢狀夾帶數值也被拒", validateMatchEntryRequest(nested, players).ok === false);
}

// ── §3 ② capability modifier 不跨邊界 ───────────────────────────────────
console.log("\n── §3 capability 不跨邊界 ──");
{
  const BOUNDARY = [
    "src/platform/contracts/matchEntry.js",
    "src/platform/contracts/matchSquad.js",
    "src/platform/contracts/matchmaking.js",
    "src/platform/contracts/matchRoom.js",
    "src/platform/contracts/matchSession.js",
    "src/platform/matchmaking/mockGateway.js",
    "src/platform/matchmaking/practiceGateway.js",
  ];
  //  Career-only modifier 的所有形式：來源、旗標、合併權威
  const MODIFIERS = [
    "teamDevelopment", "clubCapabilit", "clubAssets", "headCoachId", "coachCatalog",
    "trainingDaysReduction", "dailyRecoveryBonus", "scoutDaysReduction",
    "growthPlanning", "mobaTacticInsight", "mobaMatchOverview",
    "csTacticInsight", "csMatchOverview", "sponsorInsight",
  ];
  for (const f of BOUNDARY) {
    const src = code(read(f));
    const hits = MODIFIERS.filter((m) => src.includes(m));
    ck(`${f.split("/").pop()} 不含任何 career modifier`, hits.length === 0, hits.join(",") || "clean");
  }
  //  gateway 不得自己算戰力
  const gw = code(read("src/platform/matchmaking/mockGateway.js"));
  ck("配對閘道不自己計算戰力",
    !/calcPower|teamStrength|combineStrength/.test(gw));
  //  teamStrength 目前只服務賽季模擬，尚未被線上路徑使用
  const strengthUsers = ["src/platform/competition/simulateFixture.js"];
  ck("teamStrength 目前只被賽季模擬使用（線上尚未接）",
    strengthUsers.every((f) => read(f).includes("teamStrength")));
}

// ── §4 ③ roster identity 契約穩定 ───────────────────────────────────────
console.log("\n── §4 roster identity ──");
{
  const base = mkPlayers();
  const v0 = rosterVersionOf(base, SEATS, "moba");
  //  能力變動不得改變版本（否則「名單有沒有換人」這件事會被練功污染）
  const trained = mkPlayers(10);
  ck("練功／升級不改變 rosterVersion", rosterVersionOf(trained, SEATS, "moba") === v0, v0);
  //  體力／士氣變動也不得改變版本
  const tired = base.map((p) => ({ ...p, energy: 10, morale: 10 }));
  ck("體力／士氣變動不改變 rosterVersion", rosterVersionOf(tired, SEATS, "moba") === v0);
  //  換人要改變版本
  const swapped = [...base.slice(0, 4), { ...base[4], id: "b9" }];
  ck("換人會改變 rosterVersion",
    rosterVersionOf(swapped, { ...SEATS, b5: "b9" }, "moba") !== v0);
  //  改名單分層要改變版本
  const retiered = base.map((p, i) => (i === 0 ? { ...p, rosterTier: "bench", status: "替補" } : p));
  ck("改名單分層會改變 rosterVersion", rosterVersionOf(retiered, SEATS, "moba") !== v0);
  //  改席位指派要改變版本
  ck("改席位指派會改變 rosterVersion",
    rosterVersionOf(base, { ...SEATS, b1: "b2", b2: "b1" }, "moba") !== v0);
  //  兩個模式的版本不互通
  ck("MOBA 與 CS 的 rosterVersion 不互通",
    rosterVersionOf(base, SEATS, "moba") !== rosterVersionOf(base, SEATS, "cs"));
  ck("雜湊是決定性的", stableHash("abc") === stableHash("abc") && stableHash("abc") !== stableHash("abd"));
}

// ── §5 ④ duplicate / reload / version 語意 ──────────────────────────────
console.log("\n── §5 冪等與版本語意 ──");
{
  const players = mkPlayers();
  const a = createMatchEntryRequest({ mode: "moba", seats: SEATS, players, context: CTX });
  const b = createMatchEntryRequest({ mode: "moba", seats: SEATS, players, context: CTX });
  ck("同陣容同一天送兩次 ⇒ 同一個 transactionId（伺服器可去重）",
    a.request.transactionId === b.request.transactionId, a.request.transactionId);
  //  reload：JSON 往返後仍然驗得過、id 不變
  const round = JSON.parse(JSON.stringify(a.request));
  ck("JSON 往返後申請單仍然合法", validateMatchEntryRequest(round, players).ok === true);
  ck("JSON 往返後 transactionId 不變", round.transactionId === a.request.transactionId);
  //  練功之後：版本不變 ⇒ id 不變（練功不是「換名單」）
  const afterTraining = createMatchEntryRequest({ mode: "moba", seats: SEATS, players: mkPlayers(10), context: CTX });
  ck("練功後 transactionId 不變（能力不是身分）",
    afterTraining.request.transactionId === a.request.transactionId);
  //  換人之後：版本改變 ⇒ id 改變
  const swappedPlayers = [...players.slice(0, 4), { ...players[4], id: "b9" }];
  const afterSwap = createMatchEntryRequest({
    mode: "moba", seats: { ...SEATS, b5: "b9" }, players: swappedPlayers, context: CTX,
  });
  ck("換人後 transactionId 改變", afterSwap.request.transactionId !== a.request.transactionId);
  //  不同天 ⇒ 不同 id（同一份陣容在不同日子是不同申請）
  const nextDay = createMatchEntryRequest({ mode: "moba", seats: SEATS, players, context: { ...CTX, day: 9 } });
  ck("不同日期 ⇒ 不同 transactionId", nextDay.request.transactionId !== a.request.transactionId);
  //  用舊名單送單會被抓（rosterVersion 對不上）
  const stale = JSON.parse(JSON.stringify(a.request));
  stale.rosterVersion = "deadbeef";
  ck("rosterVersion 對不上的申請單被拒", validateMatchEntryRequest(stale, players).ok === false);
  //  MatchSquad 提交單同樣只帶身分
  const sub = createSquadSubmission({ mode: "moba", seats: SEATS, players });
  ck("MatchSquad 提交單也不帶數值",
    sub.ok !== false && !FORBIDDEN_VALUE_KEYS.some((k) => JSON.stringify(sub).includes(`"${k}"`)));
  ck("MatchSquad 提交單驗得過", validateSquadSubmission(sub.submission ?? sub, players).ok !== false);
}

// ── §6 兩個模式共用同一份契約 ───────────────────────────────────────────
console.log("\n── §6 MOBA / CS 共用 ──");
{
  const csPlayers = ["f1", "f2", "f3", "f4", "f5"].map((id, i) => ({
    ...mkPlayers()[i], id,
  }));
  const csSeats = { f1: "f1", f2: "f2", f3: "f3", f4: "f4", f5: "f5" };
  const cs = createMatchEntryRequest({ mode: "cs", seats: csSeats, players: csPlayers, context: CTX });
  ck("CS 走同一份 MatchEntryRequest 契約", cs.ok === true, (cs.errors ?? []).map((e) => e.message).join("|"));
  ck("CS 申請單同樣不帶數值",
    !FORBIDDEN_VALUE_KEYS.some((k) => JSON.stringify(cs.request).includes(`"${k}"`)));
  ck("兩個模式的席位表不同但契約相同",
    seatsOf("moba").join(",") !== seatsOf("cs").join(",")
    && cs.request.schema === MATCH_ENTRY_VERSION);
}

// ── §7 CBR / Rating 未被本輪動到 ────────────────────────────────────────
console.log("\n── §7 本輪不動數值 ──");
{
  //  ⚠ 這幾條守的是「本 Sprint 是 design-only」。日後真的實作 CBR 時，
  //    這一節要連同契約文件一起更新，而不是默默拿掉。
  const NUMERIC = ["starExcess", "MATCH_BAND", "CBR_", "ratingDelta", "eloK"];
  const all = [
    "src/platform/contracts/matchEntry.js", "src/platform/contracts/matchSquad.js",
    "src/platform/contracts/matchmaking.js", "src/platform/matchmaking/mockGateway.js",
  ];
  const hits = [];
  for (const f of all) for (const n of NUMERIC) if (read(f).includes(n)) hits.push(`${f}:${n}`);
  ck("線上契約層沒有任何 CBR／Rating 數值", hits.length === 0, hits.join(",") || "clean");
  ck("teamStrength 版本字串未變", read("src/platform/competition/teamStrength.js").includes('"teamStrength.v1"'));
}

// ── §8 定價 ≠ 模擬：免費戰力的實測 ──────────────────────────────────────
//
//  ⚠ 這一節是 Owner Review 反駁 Model A 之後補的，也是整份契約最重要的證據。
//    Season vNext 的 I13 要求「定價與模擬吃同一份輸入」。實測**目前做不到**：
//    引擎把選手經 `withDerivedStats`（天賦加成）之後才注入，而定價路徑
//    （`teamStrength(players[])`）看的是**原始** `stats` ⇒ 天賦是免費戰力。
//    ⇒ 在 `teamStrength` 被證明足夠準確之前，不得把「raw stats 原樣進線上」
//      寫成不可逆的 FINAL。
console.log("\n── §8 定價 ≠ 模擬（免費戰力）──");
{
  const { teamStrength } = await import("../src/platform/competition/teamStrength.js");
  const { withDerivedStats, getTalentStatBonuses } =
    await import("../src/platform/talents/playerDerivedStats.js");
  const { TALENT_DEFINITIONS } = await import("../src/platform/talents/talentDefinitions.js");

  const STATS = Object.fromEntries(["reflex", "accuracy", "apm", "positioning", "mapAware",
    "tacticalIQ", "decision", "adaptability", "courage", "focus", "clutch", "consistency",
    "teamwork", "comms", "leadership", "synergy"].map((k) => [k, 70]));
  const ranks = Object.fromEntries(TALENT_DEFINITIONS.map((d) => [d.id, d.maxRank ?? 3]));
  const mk = () => ({ id: "p", role: "mid", status: "主力", morale: 70, condition: "正常",
    stats: { ...STATS }, talents: { ranks } });
  const team = [mk(), mk(), mk(), mk(), mk()];

  ck("天賦確實會加能力（前提成立）", Object.keys(getTalentStatBonuses({ ranks })).length > 0);
  const priced = teamStrength(team, "moba");
  const engineSide = teamStrength(team.map(withDerivedStats), "moba");
  //  ⚠ 這一條**斷言差異存在**。它不是在守「差異要消失」——那要等校準；
  //    它守的是「這件事還沒被解決」這個事實不會被默默遺忘。
  //    真的把定價與模擬對齊之後，這一條要連同契約文件一起更新（會紅，逼出同步）。
  ck("已知缺口：定價看不到天賦加成（免費戰力仍存在）",
    engineSide > priced, `定價 ${priced} vs 引擎側 ${engineSide}（+${(engineSide - priced).toFixed(2)}）`);

  //  引擎真的有走 derived，定價真的沒有 —— 兩邊各自釘住
  const adapter = read("src/battle/moba/mobaRosterAdapter.js");
  ck("MOBA 引擎注入前有套用 withDerivedStats", /\.map\(withDerivedStats\)/.test(adapter));
  const sim = code(read("src/platform/competition/simulateFixture.js"));
  ck("定價路徑未套用 withDerivedStats", !/withDerivedStats/.test(sim));

  //  其餘已知未定價的向度（只做存在性斷言，證明它們確實在模擬側）
  ck("英雄熟練會影響引擎 power/tough（未被定價）", /英雄熟練/.test(adapter));
  ck("召喚師技能隨對戰名單注入（未被定價）", /spellsFor/.test(adapter));
  ck("CS 地圖適配是真實計算（未被定價）",
    /export function mapFit/.test(read("src/battle/fps/csPrepData.js")));
}

console.log(`\nOnline Competitive Power Contract v1：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
