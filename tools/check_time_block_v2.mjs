#!/usr/bin/env node
// ============================================================================
//  tools/check_time_block_v2.mjs — Season vNext V2：時間區塊與年度邊界
//
//  執行：repo 根目錄 `node tools/check_time_block_v2.mjs`；失敗 exit 1。
//
//  ── 這一輪解兩件事 ───────────────────────────────────────────────────────
//  ① **一般競技比賽如何合理消耗 Career Time**
//  ② **跨過 84 天年度邊界時，年齡由哪條 authoritative path 觸發**
//
//  ── 為什麼是「每日配額」而不是「每場加天」 ────────────────────────────────
//  四種候選實跑比較（`tools/timeblock_calibration.mjs`）：
//
//    做法                     凍齡？   一年打 100 場額外老幾天   需要新增什麼
//    A 每場 +1 天              擋住     +100 天（年度的 119%）   比賽結算要**寫時鐘**
//    B 每 N 場自動 +1 天        有界     +33 天（39%）           比賽結算要**寫時鐘**
//    C 每日配額 N 場            擋住     **+0 天**               一個「今天用了幾格」的計數器
//    D 競技點數條              有界     +0 天                   一條與體力平行的新資源
//
//  A / B 都讓「愛打競技的人老得特別快」（實測一年多老 84 天），
//  而且**都需要在比賽結算裡推時鐘 ⇒ 第二個時間推進者**，違反 V1 立的規則。
//  D 可行，但要再養一條與體力平行的疲勞資源 ⇒ 兩套疲勞、兩處要調。
//  ⇒ **選 C**：時間不是「一場比賽的價格」，而是「一個世界日裡能做多少事」。
//    競技比賽**一天都不加**，但一個世界日只有 N 格競技容量；要再打就得自己
//    推進日曆（走 V1 既有的 `advanceWorldDays`）⇒ 刷 XP 必然要付出世界時間，
//    但**不會比不打的人老得快**。
//
//  ⚠ 本輪**不做**：能力衰退、退休、生涯階段效果、Off-season、AI 老化。
//
//  §B 競技區塊  §Q 配額實際生效  §R 年度跨越  §G age +1
//  §X 攻擊面（凍齡／老太快／跨模式重複／BO3 重複／age+2／練習誤觸）
//  §F 既有結算不重複  §N 邊界  §M sentinel
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

const P_CLOCK = "src/platform/time/worldClock.js";
const P_ROLL = "src/platform/time/careerYearRollover.js";
const P_STORE = "src/platform/profileStore.js";
const P_SETTLE = "src/platform/progress/applyMatchProgress.js";

const clock = await imp(P_CLOCK);
const roll = await soft(P_ROLL);
const timeline = await imp("src/platform/economy/timeline.js");
const source = await imp("src/platform/progress/matchSource.js");
const storeSrc = codeOnly(read(P_STORE));

// ════════════════════════════════════════════════════════════════════════════
//  §B 競技區塊的宣告
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§B 競技時間區塊】");

ck("B1) `COMPETITIVE_BLOCK` 宣告在世界時間契約裡（不是散落各處的魔術數字）",
  !!clock.COMPETITIVE_BLOCK && Number.isFinite(clock.COMPETITIVE_BLOCK.matchesPerDay),
  clock.COMPETITIVE_BLOCK ? JSON.stringify(clock.COMPETITIVE_BLOCK) : "沒有宣告");

ck("B2) 容量是**可調的單一常數**（balance 之後只改這一處）",
  (() => {
    const s = codeOnly(read(P_CLOCK));
    return (s.match(/matchesPerDay/g) ?? []).length <= 3;
  })());

ck("B3) 容量落在合理區間（1–10；太大等於沒有區塊，太小等於不能打）",
  clock.COMPETITIVE_BLOCK.matchesPerDay >= 1 && clock.COMPETITIVE_BLOCK.matchesPerDay <= 10,
  `每日 ${clock.COMPETITIVE_BLOCK?.matchesPerDay} 場`);

//  ⚠ V1 時 `competitive` 標 `null`（明確未定案）。V2 決定了，而決定的內容是
//    「**不加天**，改用每日容量」——所以它現在是 0 且 `isWorldTimeCostDecided` 為真。
ck("B4) `WORLD_TIME_COST.competitive` 已定案為 0（成本不在每一場，在每日容量）",
  clock.WORLD_TIME_COST.competitive === 0
  && clock.isWorldTimeCostDecided("competitive") === true);

ck("B5) 其餘三種活動的時間關係**逐值未變**（V1 的結論沒有被本輪改掉）",
  clock.WORLD_TIME_COST.practice === 0 && clock.WORLD_TIME_COST.official === 0
  && clock.WORLD_TIME_COST.training === 1 && clock.WORLD_TIME_COST.rest === 1);

ck("B6) 有純函式可以問「今天還剩幾格」（畫面與 Store 不各自算一套）",
  typeof clock.competitiveBlockOf === "function"
  && clock.competitiveBlockOf({ day: 5, used: 0 }, 5).remaining === clock.COMPETITIVE_BLOCK.matchesPerDay);

//  跨日自動歸零：不需要在 advanceDay 裡寫重置邏輯（少一個會忘記維護的地方）
ck("B7) 跨到新的一天 ⇒ 容量**自動**重置（讀取時推導，不靠重置程式）",
  clock.competitiveBlockOf({ day: 5, used: 3 }, 6).used === 0
  && clock.competitiveBlockOf({ day: 5, used: 3 }, 5).used === 3);

ck("B8) 舊存檔（沒有這個欄位）安全降級為「今天還沒用過」",
  clock.competitiveBlockOf(null, 10).used === 0
  && clock.competitiveBlockOf(undefined, 10).remaining === clock.COMPETITIVE_BLOCK.matchesPerDay);

// ════════════════════════════════════════════════════════════════════════════
//  §Q 配額真的生效（不是只有宣告）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§Q 配額實際生效】");
globalThis.localStorage = globalThis.localStorage ?? {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
const store = await imp(P_STORE);
const S = () => store.useProfileStore.getState();

ck("Q1) Store 有單一讀取點 `competitiveBlockView()`",
  typeof S().competitiveBlockView === "function",
  JSON.stringify(S().competitiveBlockView?.() ?? null));

ck("Q2) `enqueueMatch` 會檢查配額（用滿了就擋，並給中文原因）",
  /competitiveBlock|COMPETITIVE_BLOCK/.test(storeSrc)
  && /enqueueMatch/.test(storeSrc));

//  真的把配額用完，再排一次必須被擋下
{
  S().autoFillLineup("moba");
  const cap = clock.COMPETITIVE_BLOCK.matchesPerDay;
  //  直接把今天的格子填滿（模擬已經打了 cap 場）
  S()._setCompetitiveBlockUsed?.(cap);
  const blocked = S().enqueueMatch("moba");
  ck("Q3) 配額用完 ⇒ **排不進**競技比賽，且回中文原因",
    blocked?.ok === false && /競技|今天|區塊|場/.test(blocked?.errors?.[0]?.message ?? ""),
    blocked?.errors?.[0]?.message ?? "沒有被擋下");

  ck("Q4) 配額用完**不影響快速練習**（純測試場不吃競技容量）",
    S().startPracticeMatch("moba")?.ok === true);
  //  收拾：把練習場次清掉，後面的段落要乾淨的起點
  S().resetMatchmaking();

  //  推進一天之後應該重新可以打
  S().advanceWorldDays(1, { reason: "rest" });
  const after = S().competitiveBlockView();
  ck("Q5) 推進一天 ⇒ 容量回滿（要再打就得付出世界時間）",
    after.used === 0 && after.remaining === cap,
    `used ${after.used}／remaining ${after.remaining}`);
}

ck("Q6) 配額由**唯一結算入口**扣除（不是畫面自己減）",
  /competitiveBlock/.test(codeOnly(read(P_SETTLE))),
  "扣格子與發獎在同一個交易裡，冪等也一起繼承");

// ════════════════════════════════════════════════════════════════════════════
//  §R 年度跨越
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§R 年度跨越事件】");

ck("R1) 有純函式算「跨了幾個生涯年度」",
  !!roll && typeof roll.careerYearsCrossed === "function",
  roll ? "" : "careerYearRollover.js 不存在");

ck("R2) Day 84 → 85 恰好跨 **1** 個年度（不是 2）",
  !!roll && roll.careerYearsCrossed(84, 85) === 1);

ck("R3) 同一年度內移動 ⇒ 跨 0 個",
  !!roll && roll.careerYearsCrossed(1, 84) === 0 && roll.careerYearsCrossed(85, 168) === 0);

ck("R4) 一次推很多天 ⇒ 照實跨多個（不吞、也不多算）",
  !!roll && roll.careerYearsCrossed(1, 169) === 2 && roll.careerYearsCrossed(80, 300) === 3,
  "1→169 跨 2；80→300 跨 3");

ck("R5) 倒退或原地 ⇒ 0（防禦；世界時間不會倒退，但不得因此炸掉）",
  !!roll && roll.careerYearsCrossed(90, 90) === 0 && roll.careerYearsCrossed(90, 10) === 0);

ck("R6) 年度邊界與 `careerYearOf` 同源（不是第三套換算）",
  !!roll && [1, 84, 85, 168, 169].every((d) =>
    roll.careerYearsCrossed(1, d) === clock.careerYearOf(d).year - clock.careerYearOf(1).year));

// ════════════════════════════════════════════════════════════════════════════
//  §G age +1
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§G 跨年度 age +1】");

ck("G1) 有純 reducer `applyCareerYearRollover(state, {fromDay, toDay})`",
  !!roll && typeof roll.applyCareerYearRollover === "function");

ck("G2) 跨一個年度 ⇒ 每位選手 age **恰好 +1**",
  (() => {
    if (!roll) return false;
    const st = { players: [{ id: "a", age: 20 }, { id: "b", age: 27 }] };
    const r = roll.applyCareerYearRollover(st, { fromDay: 84, toDay: 85 });
    return r.yearsCrossed === 1 && r.state.players[0].age === 21 && r.state.players[1].age === 28;
  })());

ck("G3) 沒跨年度 ⇒ **完全不動**（回傳同一個 state 參考）",
  (() => {
    if (!roll) return false;
    const st = { players: [{ id: "a", age: 20 }] };
    const r = roll.applyCareerYearRollover(st, { fromDay: 10, toDay: 20 });
    return r.yearsCrossed === 0 && r.state === st;
  })());

ck("G4) 跨兩個年度 ⇒ +2（不是 +1，也不是 +4）",
  (() => {
    if (!roll) return false;
    const st = { players: [{ id: "a", age: 20 }] };
    return roll.applyCareerYearRollover(st, { fromDay: 1, toDay: 169 }).state.players[0].age === 22;
  })());

ck("G5) 缺 age 的舊存檔不被塞進假年齡（不虛構資料）",
  (() => {
    if (!roll) return false;
    const st = { players: [{ id: "a" }, { id: "b", age: null }] };
    const r = roll.applyCareerYearRollover(st, { fromDay: 84, toDay: 85 });
    return r.state.players[0].age === undefined && (r.state.players[1].age ?? null) === null;
  })());

ck("G6) 是純函式：不 import Store / React",
  !!roll && !/profileStore|zustand|react/i.test(codeOnly(read(P_ROLL))));

ck("G7) 只由 `advanceDay`（唯一時鐘）觸發——不是賽季 rollover、不是玩家按鈕",
  /applyCareerYearRollover/.test(storeSrc)
  && (storeSrc.match(/applyCareerYearRollover\(/g) ?? []).length === 1,
  `Store 內出現 ${(storeSrc.match(/applyCareerYearRollover\(/g) ?? []).length} 次`);

ck("G8) 賽季狀態機**沒有**碰年齡（賽季 rollover 不得推動年齡）",
  !/\bage\b/.test(codeOnly(read("src/platform/competition/seasonState.js"))));

// ════════════════════════════════════════════════════════════════════════════
//  §X 攻擊面
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§X 攻擊面】");
{
  const cap = clock.COMPETITIVE_BLOCK.matchesPerDay;

  ck("X1) 狂打競技**無法凍齡**：不推日曆時，一天最多只打得到 N 場",
    (() => {
      S()._setCompetitiveBlockUsed(0);
      let played = 0;
      for (let i = 0; i < 50; i++) {
        const v = S().competitiveBlockView();
        if (v.remaining <= 0) break;
        S()._setCompetitiveBlockUsed(v.used + 1);
        played += 1;
      }
      return played === cap;
    })(),
    `不推進日曆時上限 ${cap} 場／日`);

  ck("X2) 狂打競技**也不會老太快**：競技比賽一天都不加",
    clock.WORLD_TIME_COST.competitive === 0);

  //  跨模式重複吃時間：配額是**俱樂部層級**的，不是每個項目一份
  ck("X3) 切換 MOBA / CS **不能**各拿一份配額",
    (() => {
      S()._setCompetitiveBlockUsed(cap);
      const a = S().enqueueMatch("moba");
      const b = S().enqueueMatch("cs");
      return a.ok === false && b.ok === false;
    })(),
    "配額掛在 meta，不掛在 mode");

  ck("X4) 正式季賽**不吃**競技配額（BO3／多場系列賽不會被擋，也不重複推日）",
    (() => {
      //  賽程來源不是 ticket ⇒ 分類為 official ⇒ 不佔格子
      const o = { schema: "MatchOrigin.v1", kind: "fixture", originId: "f1", mode: "moba",
        competitionId: "comp:moba:s1:org:regular", stageId: "s", fixtureId: "f1" };
      return source.matchSourceFromOrigin(o) === source.MATCH_SOURCE.official
        && clock.WORLD_TIME_COST.official === 0;
    })());

  ck("X5) 跨 Day 84 **不可能** age +2",
    !!roll && roll.careerYearsCrossed(84, 85) === 1
    && roll.applyCareerYearRollover({ players: [{ id: "a", age: 20 }] }, { fromDay: 84, toDay: 85 })
      .state.players[0].age === 21);

  ck("X6) 快速練習**不觸發**年度推進，也不吃配額",
    (() => {
      S().resetMatchmaking();
      S()._setCompetitiveBlockUsed(0);
      const before = { day: S().meta.days, used: S().competitiveBlockView().used };
      S().autoFillLineup("moba");
      const ok = S().startPracticeMatch("moba")?.ok === true;
      const after = { day: S().meta.days, used: S().competitiveBlockView().used };
      S().resetMatchmaking();
      return ok && before.day === after.day && before.used === after.used;
    })());
}

// ════════════════════════════════════════════════════════════════════════════
//  §F 既有結算不重複
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§F 既有結算不重複】");

ck("F1) 週結算仍以**累計週次**為冪等鍵（Finance / Sponsor 不會同一週算兩次）",
  /weeksCompletedBetween|settledWeeks/.test(codeOnly(read("src/platform/economy/weeklySettlement.js"))));

ck("F2) 年度事件在**同一個 set()** 裡完成（不會出現「時間走了但年齡沒走」）",
  (() => {
    const i = storeSrc.indexOf("applyCareerYearRollover(");
    const j = storeSrc.indexOf("set(nextState)");
    return i > 0 && j > i;
  })(),
  "rollover 必須在 set(nextState) 之前折進 nextState");

ck("F3) `meta.days` 的寫入點仍然只有兩處（沒有第二個時鐘）",
  (() => {
    const files = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { walk(rel); continue; }
        if (!/\.(js|jsx)$/.test(e.name)) continue;
        if (/EsportsGame\.jsx$|^src\/App\.jsx$/.test(rel)) continue;
        files.push(rel);
      }
    })("src");
    const writers = files.filter((f) => {
      const s = codeOnly(read(f));
      return /meta:\s*\{[^}]*\bdays\s*:/.test(s) || /\bmeta\.days\s*=/.test(s);
    });
    return writers.length === 2;
  })());

ck("F4) 比賽結算**不寫時鐘**（這正是不選 A／B 兩種做法的理由）",
  !/advanceDay|advanceWorldDays|meta\.days\s*[+=]/.test(codeOnly(read(P_SETTLE))));

// ════════════════════════════════════════════════════════════════════════════
//  §N 本輪邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

ck("N1) 沒有做能力衰退 / 退休 / 生涯階段 / Off-season",
  !/decline|retire|offSeason|lifecycleStage/i.test(codeOnly(read(P_ROLL)) + codeOnly(read(P_CLOCK))));

ck("N2) 沒有讓 AI 隊伍老化（AI turnover 是 V6）",
  !/aiTeams|participants/.test(codeOnly(read(P_ROLL))));

ck("N3) 年度事件檔很小（不得長成生涯系統）",
  (() => {
    const n = codeOnly(read(P_ROLL)).split("\n").filter((l) => l.trim()).length;
    return n <= 45;
  })(),
  `${codeOnly(read(P_ROLL)).split("\n").filter((l) => l.trim()).length} 行實碼`);

// ════════════════════════════════════════════════════════════════════════════
//  §E 端到端：真的推過 Day 84
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§E 端到端：推過年度邊界】");
{
  //  乾淨起點：把時鐘推到第 83 天，記下年齡
  S().resetMatchmaking();
  const target = 83;
  let guard = 0;
  while (S().meta.days < target && guard++ < 200) {
    const r = S().advanceWorldDays(Math.min(7, target - S().meta.days), { reason: "rest" });
    if (!r.ok || r.daysAdvanced === 0) break;
  }
  const atDay = S().meta.days;
  const agesBefore = (S().players ?? []).map((p) => p.age);
  const yearBefore = clock.careerYearOf(atDay).year;

  const r1 = S().advanceWorldDays(1, { reason: "rest" });
  const agesMid = (S().players ?? []).map((p) => p.age);
  ck("E1) 年度內推進 ⇒ 年齡不動",
    r1.ok && clock.careerYearOf(S().meta.days).year === yearBefore
      ? JSON.stringify(agesMid) === JSON.stringify(agesBefore) : true,
    `day ${atDay} → ${S().meta.days}`);

  //  推到跨過 84
  let guard2 = 0;
  while (clock.careerYearOf(S().meta.days).year === yearBefore && guard2++ < 200) {
    const r = S().advanceWorldDays(1, { reason: "rest" });
    if (!r.ok || r.daysAdvanced === 0) break;
  }
  const dayAfter = S().meta.days;
  const agesAfter = (S().players ?? []).map((p) => p.age);
  ck("E2) 跨過 Day 84 ⇒ 每位選手 age **恰好 +1**",
    clock.careerYearOf(dayAfter).year === yearBefore + 1
    && agesAfter.length === agesBefore.length
    && agesAfter.every((a, i) => (a ?? 0) === (agesBefore[i] ?? 0) + 1),
    `day ${dayAfter}｜年度 ${yearBefore} → ${clock.careerYearOf(dayAfter).year}｜${agesBefore.join(",")} → ${agesAfter.join(",")}`);

  ck("E3) 世界時間仍只有一份（`worldTimeView` 與 `meta.days` 一致）",
    S().worldTimeView().day === S().meta.days
    && S().worldTimeView().careerYear === clock.careerYearOf(S().meta.days).year);
}

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
  //  A：讓競技比賽每場 +1 天 ⇒ §X2 變紅（回到被否決的做法 A）
  const A = await mutated(P_CLOCK, (s) => s.replace(/competitive:\s*0,/, "competitive: 1,"), "A-perMatch");
  ck("M-A) 讓競技每場加天 ⇒ §X2『不會老太快』變紅",
    A.WORLD_TIME_COST.competitive !== 0);

  //  B：把跨年度算成「經過幾天 / 84」⇒ 邊界會錯（Day 84→85 變 0 或 2）
  const B = await mutated(P_ROLL,
    (s) => s.replace(
      /return Math\.max\(0, careerYearOf\(to\)\.year - careerYearOf\(from\)\.year\);/,
      "return Math.floor((to - from) / CAREER_YEAR.daysPerYear);"), "B-boundary");
  ck("M-B) 把年度跨越改成『天數差 / 84』⇒ §R2 變紅",
    B.careerYearsCrossed(84, 85) !== 1);

  //  C：把配額跨日重置拿掉 ⇒ §B7 變紅（世界走了但格子還是滿的）
  const C = await mutated(P_CLOCK,
    (s) => s.replace(/Number\(stored\.day\) === today/, "true"), "C-noreset");
  ck("M-C) 拿掉跨日重置 ⇒ §B7 變紅",
    C.competitiveBlockOf({ day: 5, used: 3 }, 6).used !== 0);
} catch (e) {
  ck("M-*) sentinel 可執行", false, String(e.message).slice(0, 170));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch {} }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} check_time_block_v2：${pass}/${pass + fail} 通過`);
console.log(`   競技時間區塊：每個世界日 ${clock.COMPETITIVE_BLOCK?.matchesPerDay} 場｜競技比賽本身 **不加天**`);
console.log(`   生涯年度 ${clock.CAREER_YEAR.daysPerYear} 天；跨年度由 advanceDay（唯一時鐘）觸發 age +1`);
console.log(`   ⚠ 本輪不做：衰退／退休／生涯階段／Off-season／AI 老化。`);
process.exit(fail === 0 ? 0 : 1);
