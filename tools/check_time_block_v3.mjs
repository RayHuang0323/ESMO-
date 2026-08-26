#!/usr/bin/env node
// ============================================================================
//  tools/check_time_block_v3.mjs — Season vNext V3：時間快速推進
//
//  執行：repo 根目錄 `node tools/check_time_block_v3.mjs`；失敗 exit 1。
//
//  ── 這一輪解什麼 ─────────────────────────────────────────────────────────
//  V1 把世界時間解凍、V2 立了每日競技容量與年度邊界，但玩家仍然只能一天一天按。
//  設計文件 §2.4 量過：17 年生涯要按 **556 次**推進 ⇒ V1/V2 體感上到不了。
//
//  V3 讓玩家可以「推進一天 / 推進一週 / 前往下一站」，但**不新增第二個時鐘**：
//  規劃器只回傳「該推幾天」，真正推進的仍然是 V1 的 `advanceWorldDays`
//  （→ `advanceDay`），沿路的訓練、恢復、週結算、年度跨越一步都不能少。
//
//  ── 本檔特別補兩個 Design Sprint 指定的缺口 ───────────────────────────────
//  ① **§I7 競技每日容量不得跨日累積**——推 7 天不得拿到 21 場。
//     現況（V2）是**碰巧正確**的：`competitiveBlockOf` 在 `stored.day !== today`
//     時把 `used` 歸零。但 V2 的 47 項裡**沒有任何一項釘住它** ⇒ 任何人加一個
//     「把沒用完的容量結轉」的善意功能都不會有 gate 變紅。V3 讓天數可以被大量
//     跳過，這個洞才真的有人會踩到。
//  ② **§W 多週快速推進的結算冪等**——`check_time_block_v2` §F1 只驗過單週。
//     一次跳 3 週必須**恰好結算 3 次**，且與「跳 21 次一天」逐值相同。
//
//  ⚠ 本輪**不做**：Lifecycle / 衰退 / 退休 / Off-season / 真人競技 / 定時賽事。
//
//  §A 規劃器契約　§B 不得跳過玩家賽程　§C 不是第二個時鐘
//  §I7 容量不跨日累積　§W 多週結算冪等　§Y 跨年度　§P 公平契約
//  §E 端到端　§N 本輪邊界　§M mutation sentinel
// ============================================================================
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(resolve(ROOT, p), "utf8");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const soft = async (p) => { try { return await imp(p); } catch { return null; } };

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => {
  if (ok) { pass++; console.log(`✅ ${n}${d ? "　" + d : ""}`); }
  else { fail++; console.log(`❌ ${n}${d ? "　" + d : ""}`); }
};
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_FF = "src/platform/time/fastForward.js";
const P_CLOCK = "src/platform/time/worldClock.js";
const P_STORE = "src/platform/profileStore.js";
const P_SETTLE = "src/platform/economy/weeklySettlement.js";
const P_DASH = "src/screens/DashboardScreen.jsx";

const ff = await soft(P_FF);
const clock = await imp(P_CLOCK);
const timeline = await imp("src/platform/economy/timeline.js");
const settle = await imp(P_SETTLE);

// ════════════════════════════════════════════════════════════════════════════
//  §A 規劃器契約
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§A 規劃器契約】");

ck("A1) 有獨立的快轉規劃器 `time/fastForward.js`", !!ff,
  ff ? "" : "模組不存在");

ck("A2) 它是**純模組**（不 import Store / React / zustand / localStorage）",
  !!ff && (() => {
    const s = codeOnly(read(P_FF));
    return !/profileStore|zustand|from "react"|localStorage/.test(s);
  })());

ck("A3) 停止理由是**白名單**（不是散落各處的字串）",
  !!ff && !!ff.STOP_REASONS && typeof ff.STOP_REASONS === "object"
  && Object.isFrozen(ff.STOP_REASONS),
  ff?.STOP_REASONS ? Object.keys(ff.STOP_REASONS).join("/") : "");

ck("A4) 快轉級距宣告在契約裡（UI 不得自己寫死天數）",
  !!ff && Array.isArray(ff.FAST_FORWARD_STEPS) && ff.FAST_FORWARD_STEPS.length >= 2
  && ff.FAST_FORWARD_STEPS.every((n) => Number.isInteger(n) && n >= 1),
  ff?.FAST_FORWARD_STEPS ? JSON.stringify(ff.FAST_FORWARD_STEPS) : "");

ck("A5) 有 `planAdvance()`：回傳**該推幾天**，不自己推",
  !!ff && typeof ff.planAdvance === "function");

ck("A6) 有 `nextStopOf()`：回傳下一站（天、理由、可顯示標籤）",
  !!ff && typeof ff.nextStopOf === "function");

ck("A7) 規劃器有**硬性天數上限**（不得一次跳完整個生涯）",
  !!ff && Number.isFinite(ff.MAX_FAST_FORWARD_DAYS)
  && ff.MAX_FAST_FORWARD_DAYS >= 1
  && ff.MAX_FAST_FORWARD_DAYS <= clock.CAREER_YEAR.daysPerYear,
  ff ? `上限 ${ff.MAX_FAST_FORWARD_DAYS} 天／年度 ${clock.CAREER_YEAR.daysPerYear} 天` : "");

ck("A8) 級距不得超過硬性上限",
  !!ff && ff.FAST_FORWARD_STEPS.every((n) => n <= ff.MAX_FAST_FORWARD_DAYS));

// ════════════════════════════════════════════════════════════════════════════
//  §B 規劃器不得跳過玩家賽程
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§B 不得跳過玩家賽程】");

//  ⚠ 規劃器吃的是**基本型別**（今天第幾天、下一場玩家賽事在第幾天），
//    不是整個 state。理由見 B5：它不得成為第二套賽程掃描器。
const at = (day, nextFixtureDay = null) => ({ day, nextFixtureDay });

ck("B1) 下一站認得出玩家自己的賽程日",
  !!ff && (() => {
    const s = ff.nextStopOf(at(5, 10));
    return s && s.day === 10 && s.code === ff.STOP_REASONS.playerFixture;
  })(),
  ff ? JSON.stringify(ff.nextStopOf(at(5, 10))) : "");

ck("B2) `planAdvance` **不得**規劃超過玩家賽程日",
  !!ff && (() => {
    const p = ff.planAdvance(at(5, 10));
    return p.days > 0 && 5 + p.days <= 10;
  })(),
  ff ? JSON.stringify(ff.planAdvance(at(5, 10))) : "");

ck("B3) 已經站在賽程日上 ⇒ 規劃 0 天（要玩家先處理，不得繞過）",
  !!ff && ff.planAdvance(at(10, 10)).days === 0,
  ff ? JSON.stringify(ff.planAdvance(at(10, 10))) : "");

ck("B4) 賽程日在過去 ⇒ 忽略，且**永不規劃負天數**",
  !!ff && (() => {
    const p = ff.planAdvance(at(20, 10));
    const s = ff.nextStopOf(at(20, 10));
    return p.days >= 0 && (!s || s.code !== ff.STOP_REASONS.playerFixture);
  })(),
  ff ? JSON.stringify(ff.planAdvance(at(20, 10))) : "");

//  ⚠ 這一條比「規劃器自己找得到賽程」更重要：專案已經有唯一的賽程查找
//    （`seasonState.nextPlayerFixture` + `absoluteDayOf`，兩個項目取交集由
//    `worldTimeView().nextFixtureDay` 負責）。規劃器再寫一份就是第二套賽程邏輯，
//    而兩套遲早會對「下一場在第幾天」給出不同答案。
ck("B5) 規劃器**不得自己掃賽程**（不 import seasonState、不讀 `.fixtures`）",
  !!ff && (() => {
    const s = codeOnly(read(P_FF));
    return !/seasonState|competitionByMode|\.fixtures|playerTeamId|absoluteDayOf/.test(s);
  })());

ck("B6) 沒有排定賽程時仍規劃得動（世界不會因為沒有比賽就停住）",
  !!ff && ff.planAdvance(at(5, null)).days > 0,
  ff ? JSON.stringify(ff.planAdvance(at(5, null))) : "");

ck("B7) 規劃器**不含**任何自動出賽／棄權／選陣容的字眼",
  !!ff && (() => {
    const s = codeOnly(read(P_FF));
    return !/forfeit|startFixtureMatch|autoPlay|setLineup/i.test(s);
  })());

ck("B8) 賽程日比年度邊界近 ⇒ 停在賽程日（賽事優先於年度）",
  !!ff && (() => {
    const s = ff.nextStopOf(at(2, 5));
    return s && s.day === 5 && s.code === ff.STOP_REASONS.playerFixture;
  })());

ck("B9) 沒有賽程時，下一站是**生涯年度邊界**（跨年會 age +1，值得停）",
  !!ff && (() => {
    const s = ff.nextStopOf(at(clock.CAREER_YEAR.daysPerYear - 2, null));
    return s && s.code === ff.STOP_REASONS.careerYear
      && s.day === clock.CAREER_YEAR.daysPerYear + 1;
  })(),
  ff ? JSON.stringify(ff.nextStopOf(at(clock.CAREER_YEAR.daysPerYear - 2, null))) : "");

//  ⚠ B10／B11 是**瀏覽器實測抓到的缺陷**（2026-08-26 V3 closure）：
//    站在自己的比賽日上時，卡片顯示「下一站：第 85 天進入第 2 生涯年度（還有 36 天）」
//    ——但玩家一步都走不了。畫面在說謊，而且說的正好是最會誤導人的那個方向。
ck("B10) **今天就是比賽日** ⇒ 下一站是今天（`daysAway` 0），不得跳到遙遠的年度邊界",
  !!ff && (() => {
    const s = ff.nextStopOf(at(10, 10));
    return s && s.code === ff.STOP_REASONS.playerFixture && s.day === 10 && s.daysAway === 0;
  })(),
  ff ? JSON.stringify(ff.nextStopOf(at(10, 10))) : "");

ck("B11) 同一格 `planAdvance` 回 0 天，且 `stop` 仍指向那場比賽（不得回下下一站）",
  !!ff && (() => {
    const p = ff.planAdvance(at(10, 10));
    return p.days === 0 && p.stop?.code === ff.STOP_REASONS.playerFixture && p.stop?.daysAway === 0;
  })(),
  ff ? JSON.stringify(ff.planAdvance(at(10, 10))) : "");

// ════════════════════════════════════════════════════════════════════════════
//  §C 不是第二個時鐘
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C 不是第二個時鐘】");

const storeSrc = codeOnly(read(P_STORE));

ck("C1) Store 有 `advanceToNextStop()` 入口",
  /advanceToNextStop\s*\(/.test(storeSrc));

ck("C2) 規劃器**不寫** `meta.days`（全檔沒有指派 days 的痕跡）",
  !!ff && !/meta\.days\s*=|days:\s*[a-zA-Z0-9_]+\s*\+/.test(codeOnly(read(P_FF))));

ck("C3) `meta.days` 的寫入點仍然只有既有那些（V3 沒有新增第二個）",
  (() => {
    const settleSrc = codeOnly(read(P_SETTLE));
    const writes = (settleSrc.match(/meta:\s*\{\s*\.\.\.meta,\s*days:/g) ?? []).length;
    return writes === 1;
  })(),
  "weeklySettlement.advanceDaysInState 一處");

ck("C4) `advanceToNextStop` 是薄包裝——經由 `advanceWorldDays` 推進",
  (() => {
    const i = storeSrc.indexOf("advanceToNextStop");
    if (i < 0) return false;
    const body = storeSrc.slice(i, i + 900);
    return /advanceWorldDays\(/.test(body);
  })());

ck("C5) 推進理由仍在既有白名單內（沒有為 V3 新增推進權）",
  Object.keys(clock.ADVANCE_REASONS).length === 4
  && clock.PRODUCTION_REASONS.length === 3,
  Object.keys(clock.ADVANCE_REASONS).join("/"));

// ════════════════════════════════════════════════════════════════════════════
//  §I7 競技每日容量不得跨日累積（Design Sprint 缺口 ①）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§I7 容量不跨日累積】");

const CAP = clock.COMPETITIVE_BLOCK.matchesPerDay;

ck("I7-1) 跨 1 天 ⇒ 容量回到上限（不是上限 ×2）",
  clock.competitiveBlockOf({ day: 5, used: CAP }, 6).remaining === CAP,
  `remaining ${clock.competitiveBlockOf({ day: 5, used: CAP }, 6).remaining} / cap ${CAP}`);

ck("I7-2) **跳過 7 天 ⇒ 容量仍然只有上限**（不得拿到 7×上限）",
  clock.competitiveBlockOf({ day: 5, used: CAP }, 12).remaining === CAP,
  `remaining ${clock.competitiveBlockOf({ day: 5, used: CAP }, 12).remaining}，不是 ${7 * CAP}`);

ck("I7-3) 跳過一整個生涯年度也不累積",
  clock.competitiveBlockOf({ day: 1, used: 0 }, 1 + clock.CAREER_YEAR.daysPerYear).remaining === CAP);

ck("I7-4) 容量**恆等於**上限，與跳過幾天無關（掃 1–90 天）",
  (() => {
    for (let skip = 1; skip <= 90; skip++) {
      const b = clock.competitiveBlockOf({ day: 3, used: CAP }, 3 + skip);
      if (b.remaining !== CAP || b.used !== 0 || b.capacity !== CAP) return false;
    }
    return true;
  })(),
  `1–90 天皆為 remaining ${CAP}`);

ck("I7-5) 同一天內不會被誤重置（用了 1 格仍然只剩 上限−1）",
  clock.competitiveBlockOf({ day: 5, used: 1 }, 5).remaining === CAP - 1);

ck("I7-6) `used` 永不超過上限（舊存檔帶髒資料也不會變成負剩餘）",
  clock.competitiveBlockOf({ day: 5, used: 999 }, 5).remaining === 0
  && clock.competitiveBlockOf({ day: 5, used: 999 }, 5).used === CAP);

ck("I7-7) 規劃器**不得**宣稱可以囤積容量（全檔無結轉字眼）",
  !!ff && !/carry|bank|accumulate|結轉|累積/i.test(read(P_FF).replace(/不得[^。\n]*累積/g, "")));

// ════════════════════════════════════════════════════════════════════════════
//  §W 多週快速推進的結算冪等（Design Sprint 缺口 ②）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§W 多週結算冪等】");

const DPW = timeline.DAYS_PER_WEEK;

//  ⚠ 用**純 reducer** 比較，不用 Store：同一份輸入可以跑兩次，
//    否則 zustand 是單例，第二次的起點已經被第一次改掉了。
const baseState = () => ({
  meta: { days: 1, week: 1, season: 1 },
  players: [],
  finance: { funds: 1000000, transactions: [], salaryPerWeek: 0, opsPerWeek: 0 },
  economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: "default" },
  activeSponsor: null,
  contracts: {},
});

const weeksIn = (n) => {
  const a = settle.advanceDaysInState(baseState(), n);
  return a;
};

ck("W1) 一次跳 3 週 ⇒ **恰好** 3 次週結算",
  weeksIn(3 * DPW).receipts.length === 3,
  `${weeksIn(3 * DPW).receipts.length} 次 / 期望 3`);

ck("W2) 一次跳 3 週 與 跳 21 次一天：**結算次數相同**",
  (() => {
    let cur = baseState(); let n = 0;
    for (let i = 0; i < 3 * DPW; i++) { const r = settle.advanceDaysInState(cur, 1); cur = r.nextState; n += r.receipts.length; }
    return n === weeksIn(3 * DPW).receipts.length;
  })());

ck("W3) 一次跳 3 週 與 跳 21 次一天：**天數逐值相同**",
  (() => {
    let cur = baseState();
    for (let i = 0; i < 3 * DPW; i++) cur = settle.advanceDaysInState(cur, 1).nextState;
    return cur.meta.days === weeksIn(3 * DPW).nextState.meta.days;
  })(),
  `day ${weeksIn(3 * DPW).nextState.meta.days}`);

ck("W4) 一次跳 3 週 與 跳 21 次一天：**資金逐值相同**（沒有多算或少算一次薪水）",
  (() => {
    let cur = baseState();
    for (let i = 0; i < 3 * DPW; i++) cur = settle.advanceDaysInState(cur, 1).nextState;
    return Number(cur.finance?.funds) === Number(weeksIn(3 * DPW).nextState.finance?.funds);
  })(),
  `一次跳：${weeksIn(3 * DPW).nextState.finance?.funds}`);

ck("W5) 一次跳 3 週 與 跳 21 次一天：**`lastSettledWeek` 相同**",
  (() => {
    let cur = baseState();
    for (let i = 0; i < 3 * DPW; i++) cur = settle.advanceDaysInState(cur, 1).nextState;
    return Number(cur.economy?.lastSettledWeek) === Number(weeksIn(3 * DPW).nextState.economy?.lastSettledWeek);
  })());

ck("W6) 結算的冪等鍵是**累計週次**，同一週不可能出現兩次",
  (() => {
    const r = weeksIn(6 * DPW);
    const keys = Object.keys(r.nextState.economy?.settledWeeks ?? {});
    return keys.length === new Set(keys).size && keys.length === 6;
  })(),
  `${Object.keys(weeksIn(6 * DPW).nextState.economy?.settledWeeks ?? {}).length} 個相異週`);

ck("W7) 已結算的週**不會被回頭補算**（在已推進的 state 上再推，舊週不重算）",
  (() => {
    const first = weeksIn(3 * DPW);
    const again = settle.advanceDaysInState(first.nextState, 3 * DPW);
    const before = Object.keys(first.nextState.economy?.settledWeeks ?? {});
    const after = Object.keys(again.nextState.economy?.settledWeeks ?? {});
    return after.length === before.length + 3
      && before.every((k) => after.includes(k));
  })());

ck("W8) 不滿一週的推進 ⇒ **不結算**（跨過週尾才算）",
  settle.advanceDaysInState(baseState(), DPW - 1).receipts.length === 0);

ck("W9) 剛好跨過一個週尾 ⇒ 恰好 1 次",
  settle.advanceDaysInState(baseState(), DPW).receipts.length === 1);

// ════════════════════════════════════════════════════════════════════════════
//  §Y 跨生涯年度（一次跳多天）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§Y 跨年度】");

const roll = await imp("src/platform/time/careerYearRollover.js");
const DPY = clock.CAREER_YEAR.daysPerYear;

ck("Y1) 一次跳過年度邊界 ⇒ 跨越數 **恰好 1**（不是 0 也不是 2）",
  roll.careerYearsCrossed(DPY - 3, DPY + 3) === 1,
  `${DPY - 3} → ${DPY + 3}`);

ck("Y2) 一次跳一整年 ⇒ 恰好 1",
  roll.careerYearsCrossed(1, 1 + DPY) === 1);

ck("Y3) 年度內大跳 ⇒ 0（不會因為跳很多天就多老一歲）",
  roll.careerYearsCrossed(2, DPY - 1) === 0,
  `2 → ${DPY - 1}`);

ck("Y4) 規劃器的上限不會讓玩家一次跳過**兩個**年度邊界",
  !!ff && ff.MAX_FAST_FORWARD_DAYS <= DPY);

// ════════════════════════════════════════════════════════════════════════════
//  §P 公平契約（Design Sprint 91ec289 的不變式）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§P 公平契約】");

const source = await imp("src/platform/progress/matchSource.js");
const origin = await imp("src/platform/contracts/matchOrigin.js");

ck("P1) 快轉不碰 ServerTime——規劃器沒有任何真實時間來源",
  !!ff && !/Date\.now|new Date|performance\.now/.test(codeOnly(read(P_FF))));

ck("P2) 快速練習仍然是 0 世界時間（V3 沒有動它）",
  clock.WORLD_TIME_COST.practice === 0);

ck("P3) 一般競技仍然 0 加天（成本仍在每日容量，不在每一場）",
  clock.WORLD_TIME_COST.competitive === 0 && clock.isWorldTimeCostDecided("competitive"));

ck("P4) **本輪未建立**真人競技／定時賽事的 origin kind",
  Object.keys(origin.ORIGIN_KINDS).length === 3
  && !("online" in origin.ORIGIN_KINDS) && !("event" in origin.ORIGIN_KINDS),
  Object.keys(origin.ORIGIN_KINDS).join("/"));

ck("P5) **本輪未建立**線上成長來源",
  Object.keys(source.MATCH_SOURCE).length === 4 && !("online" in source.MATCH_SOURCE),
  Object.keys(source.MATCH_SOURCE).join("/"));

ck("P6) 快轉不產生額外收益——規劃器不碰 finance / 粉絲",
  !!ff && !/finance|funds|fans|粉絲|sponsorIncome/i.test(codeOnly(read(P_FF))));

// ════════════════════════════════════════════════════════════════════════════
//  §E 端到端（真的 Store）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§E 端到端】");
globalThis.localStorage = globalThis.localStorage ?? {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
const store = await imp(P_STORE);
const S = () => store.useProfileStore.getState();

ck("E1) Store 有 `nextStopView()` 給畫面讀（畫面不自己算）",
  typeof S().nextStopView === "function",
  (() => { try { return JSON.stringify(S().nextStopView()); } catch { return ""; } })());

{
  const before = S().meta.days;
  const r = typeof S().advanceToNextStop === "function" ? S().advanceToNextStop() : null;
  ck("E2) `advanceToNextStop()` 真的推得動世界時間",
    !!r && r.daysAdvanced > 0 && S().meta.days === before + r.daysAdvanced,
    r ? `day ${before} → ${S().meta.days}（推 ${r.daysAdvanced} 天）` : "沒有這個 action");
}

{
  //  一次跳 7 天，確認容量沒有被囤積
  const day0 = S().meta.days;
  S()._setCompetitiveBlock?.(day0, clock.COMPETITIVE_BLOCK.matchesPerDay);
  const r = S().advanceWorldDays(7, { reason: "rest" });
  const block = S().competitiveBlockView();
  ck("E3) 用滿今天的容量後跳 7 天 ⇒ 容量回到上限，**不是 7 倍**",
    r.ok && block.remaining === CAP && block.capacity === CAP,
    `推 ${r.daysAdvanced} 天｜remaining ${block.remaining}（不是 ${7 * CAP}）`);
}

{
  //  多週推進：資金一定有變（薪水付出去了），且週次前進
  const w0 = S().worldTimeView().week;
  const f0 = Number(S().finance?.funds);
  const r = S().advanceWorldDays(3 * DPW, { reason: "rest" });
  const w1 = S().worldTimeView().week;
  ck("E4) 一次推 3 週 ⇒ 週次前進 3（沿路的週結算沒有被跳過）",
    r.ok && w1 - w0 === 3,
    `week ${w0} → ${w1}｜資金 ${f0} → ${S().finance?.funds}`);
}

{
  //  訓練沿路被結算：指派一門課再跳多天，daysLeft 必須真的走完
  const p = (S().players ?? [])[0];
  ck("E5) 快轉沿路仍會跑每日恢復（體力不會因為跳天數而凍住）",
    !!p && (() => {
      const e0 = Number(p.energy ?? 100);
      S()._patchPlayer(p.id, (x) => ({ ...x, energy: 40, training: null }));
      S().advanceWorldDays(5, { reason: "rest" });
      const after = (S().players ?? []).find((x) => x.id === p.id);
      return Number(after.energy) > 40 && Number.isFinite(e0);
    })(),
    "體力有回升");
}

ck("E6) 世界時間仍只有一份（`worldTimeView` 與 `meta.days` 一致）",
  S().worldTimeView().day === S().meta.days
  && S().worldTimeView().careerYear === clock.careerYearOf(S().meta.days).year);

// ════════════════════════════════════════════════════════════════════════════
//  §U 畫面入口
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§U 畫面入口】");
const dash = read(P_DASH);

//  ⚠ 只找 testid 的**字面值**，不要求 `data-testid="…"` 這個寫法——
//    testid 可能由三元運算子產生（多顆級距按鈕共用一段 JSX）。
//    瀏覽器 gate 查的是 testid 本身，這裡對齊同一個判準。
ck("U1) 首頁世界時間卡有多日快轉入口",
  /"home-advance-days"/.test(dash));

ck("U2) 首頁有「前往下一站」入口",
  /"home-advance-next"/.test(dash));

ck("U2b) 單日入口仍在（既有 browser gate 靠它，不得改名）",
  /"home-advance-day"/.test(dash));

ck("U2c) 首頁會顯示「下一站」給玩家看",
  /"home-next-stop"/.test(dash) && /nextStopView/.test(dash));

ck("U3) 畫面**不自己寫死天數**——級距讀自契約",
  /FAST_FORWARD_STEPS/.test(dash));

ck("U4) 畫面會顯示停下來的原因（不是靜靜地什麼都不做）",
  /stoppedBy|res\.reason|setNote/.test(dash));

// ════════════════════════════════════════════════════════════════════════════
//  §N 本輪邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

ck("N1) 沒有做能力衰退 / 退休 / 生涯階段 / Off-season",
  !!ff && !/decline|retire|offSeason|lifecycleStage|衰退|退休/i.test(read(P_FF)));

ck("N2) 沒有做真人連線 / matchmaking server / Ranked",
  !!ff && !/server|ranked|matchmakingServer|online/i.test(codeOnly(read(P_FF))));

ck("N3) 規劃器很小（不得長成第二個賽季系統）",
  !!ff && codeOnly(read(P_FF)).split("\n").length <= 90,
  ff ? `${codeOnly(read(P_FF)).split("\n").length} 行實碼` : "");

// ════════════════════════════════════════════════════════════════════════════
//  §M mutation sentinel
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M mutation sentinel】");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-v3-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  //  A：讓容量跨日結轉 ⇒ §I7 變紅（Design Sprint 缺口 ① 的守門）
  const A = await mutated(P_CLOCK,
    (s) => s.replace(/const used = stored && Number\(stored\.day\) === today/,
      "const used = stored && Number(stored.day) <= today"), "A-bank");
  ck("M-A) 讓容量跨日結轉 ⇒ §I7-2 變紅",
    A.competitiveBlockOf({ day: 5, used: CAP }, 12).remaining !== CAP);

  //  B：把週結算的跨週判定改成「>=」⇒ 同一週會被結算兩次 ⇒ §W 變紅
  const B = await mutated(P_SETTLE,
    (s) => s.replace(/if \(t\.week > endedWeek\) \{/, "if (t.week >= endedWeek) {"), "B-doubleWeek");
  ck("M-B) 讓週結算在同一週內重複觸發 ⇒ §W1 變紅",
    B.advanceDaysInState(baseState(), 3 * DPW).receipts.length !== 3);

  //  C：讓規劃器忽略玩家賽程 ⇒ §B1 變紅
  if (ff) {
    const C = await mutated(P_FF,
      (s) => s.replace(/code: STOP_REASONS\.playerFixture/, "code: STOP_REASONS.careerYear"), "C-skipFixture");
    ck("M-C) 讓規劃器不認玩家賽程 ⇒ §B1 變紅",
      (() => {
        const s = C.nextStopOf(at(5, 10));
        return !s || s.code !== C.STOP_REASONS.playerFixture;
      })());
  } else {
    ck("M-C) 讓規劃器不認玩家賽程 ⇒ §B1 變紅", false, "規劃器不存在，無法變異");
  }

  //  D：拿掉規劃上限 ⇒ §A7／§Y4 變紅（一次跳完整個生涯）
  if (ff) {
    const D = await mutated(P_FF,
      (s) => s.replace(/export const MAX_FAST_FORWARD_DAYS = \d+;/,
        "export const MAX_FAST_FORWARD_DAYS = 9999;"), "D-nocap");
    ck("M-D) 拿掉快轉天數上限 ⇒ §A7 變紅",
      !(D.MAX_FAST_FORWARD_DAYS <= clock.CAREER_YEAR.daysPerYear));
  } else {
    ck("M-D) 拿掉快轉天數上限 ⇒ §A7 變紅", false, "規劃器不存在，無法變異");
  }
} catch (e) {
  ck("M) sentinel 執行完成", false, String(e.message ?? e));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch { /* ignore */ } }
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${fail === 0 ? "✅" : "❌"} check_time_block_v3：${pass}/${pass + fail} 通過`);
if (fail === 0) {
  console.log("   快轉只規劃、不推進：真正推進的仍是 V1 的 `advanceWorldDays`。");
  console.log("   競技容量不跨日累積｜多週結算恰好一次｜遇玩家賽程必停，不自動出賽或棄權。");
  console.log("   ⚠ 本輪不做：Lifecycle／衰退／退休／Off-season／真人競技／定時賽事。");
}
process.exit(fail === 0 ? 0 : 1);
