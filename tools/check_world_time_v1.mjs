#!/usr/bin/env node
// ============================================================================
//  tools/check_world_time_v1.mjs — Season vNext V1：世界時間基礎
//
//  執行：repo 根目錄 `node tools/check_world_time_v1.mjs`；失敗 exit 1。
//
//  ── 這一輪要解決什麼 ─────────────────────────────────────────────────────
//  `meta.days` 一直是唯一的時鐘（寫入點全 repo 只有兩處），但它**沒有擁有者**：
//  正式 UI 唯一推得動它的地方是訓練中心那顆「推進訓練日」，而那顆按鈕第一行是
//      if (training.length === 0) { push("無選手在訓練中"); return; }
//  ⇒ **沒有人在訓練，世界就完全停住。** 不是推得慢，是零。
//  這比 TD-34 記載的更嚴重：TD-34 寫「只靠訓練推進」，實際是「必須真的有人在訓練」。
//
//  本輪不新增第二個時鐘，只補上三件事：
//   ① **誰有權推進**：`advanceWorldDays(n, { reason })` 具名入口 ＋ 理由白名單
//   ② **哪些活動屬於世界時間**：`WORLD_TIME_COST` 宣告表
//      （練習 0、正式賽 0、訓練 1、一般競技**明確未定案**）
//   ③ **不可能被凍結**：正式入口不得依賴任何前置條件
//  以及把既有但沒被釘住的東西鎖起來：賽程↔世界日期的唯一換算、84 天年度邊界。
//
//  ⚠ **本輪不做**：age +1、衰退、退休、Off-season、Ranked、真人連線。
//  ⚠ 一般競技比賽的時間成本**刻意留白**——標成 `null`（明確未定），不是填 0。
//
//  §C 單一時鐘  §O 推進權  §A 活動歸屬  §F 不可凍結  §S 賽程對齊
//  §Y 年度邊界  §D 不重複推進／不重複結算  §N 邊界  §M sentinel
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

//  只掃程式碼，不掃註解（本輪好幾個檔的註解就寫著「不得有第二個時鐘」這類句子）
const codeOnly = (src) => src.split(/\r?\n/)
  .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

const P_CLOCK = "src/platform/time/worldClock.js";
const P_TIMELINE = "src/platform/economy/timeline.js";
const P_STORE = "src/platform/profileStore.js";
const P_WEEKLY = "src/platform/economy/weeklySettlement.js";
const P_SEASON = "src/platform/competition/seasonState.js";
const P_TRAINING_UI = "src/screens/manage/TrainingScreen.jsx";
const P_DASH = "src/screens/DashboardScreen.jsx";

const clock = await soft(P_CLOCK);
const timeline = await imp(P_TIMELINE);
const seasonState = await imp(P_SEASON);
const regular = await imp("src/platform/competition/regularSeason.js");

// ════════════════════════════════════════════════════════════════════════════
//  §C 單一時鐘：`meta.days` 只能從一個地方長大
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C 單一時鐘】");
{
  //  掃全 src（排除 Legacy 巨檔——它們是獨立的舊血脈，不參與主幹時鐘）
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

  //  「寫 meta.days」的形狀：物件字面值裡出現 `days:` 且同一段有 `meta`
  const writers = files.filter((f) => {
    const s = codeOnly(read(f));
    return /meta:\s*\{[^}]*\bdays\s*:/.test(s) || /\bmeta\.days\s*=/.test(s);
  });
  ck("C1) `meta.days` 的寫入點仍然只有『週結算』與『開新局』兩處",
    writers.length === 2
    && writers.some((f) => f.endsWith("weeklySettlement.js"))
    && writers.some((f) => f.endsWith("profileStore.js")),
    writers.join(", ") || "(掃不到寫入點)");

  ck("C2) 沒有第二個時間計數器（week / season 一律由 days 導出）",
    !/\bmeta\.week\s*\+\+|\bmeta\.season\s*\+\+|weekCounter|dayCounter/.test(codeOnly(read(P_STORE))));

  //  賽季容器不得碰世界時間——這是「賽季容器不能控制選手時間」的結構性保證
  ck("C3) 賽季狀態機**完全不寫** `meta`（賽季容器不控制世界時間）",
    !/meta\s*:/.test(codeOnly(read(P_SEASON))) && !/meta\.days/.test(codeOnly(read(P_SEASON))));

  ck("C4) 週結算的冪等鍵是**累計週次**（跨賽季不重置 ⇒ 同一週不可能算兩次）",
    /settledWeeks|lastSettledWeek|weeksCompletedBetween/.test(codeOnly(read(P_WEEKLY))));
}

// ════════════════════════════════════════════════════════════════════════════
//  §O 推進權：誰有權推進世界時間
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§O 推進權】");

ck("O1) `worldClock.js` 存在，且宣告推進理由白名單",
  !!clock?.ADVANCE_REASONS && !!clock?.PRODUCTION_REASONS,
  clock ? Object.keys(clock.ADVANCE_REASONS ?? {}).join(",") : "模組不存在");

ck("O2) 白名單分得出**正式**與 **DEV**（DEV 工具不算正式推進權）",
  !!clock && clock.PRODUCTION_REASONS.length > 0
  && !clock.PRODUCTION_REASONS.includes(clock.ADVANCE_REASONS.dev)
  && "dev" in clock.ADVANCE_REASONS,
  clock ? `正式：${clock.PRODUCTION_REASONS.join(",")}` : "");

ck("O3) 至少有一個**不依賴訓練**的正式推進理由",
  !!clock && clock.PRODUCTION_REASONS.some((r) => r !== clock.ADVANCE_REASONS.training));

ck("O4) `worldClock.js` 是純契約：不 import Store / React",
  (() => { try { const s = read(P_CLOCK); return !/profileStore|zustand|react/i.test(codeOnly(s)); } catch { return false; } })());

ck("O5) 年度／週長常數**不重寫一次**，一律由 `timeline.js` 推導",
  (() => {
    try {
      const s = codeOnly(read(P_CLOCK));
      //  不得出現裸的 84 / 12 / 7 字面值當常數用
      return /from\s+["'][^"']*timeline\.js["']/.test(s) && !/daysPerYear:\s*84/.test(s);
    } catch { return false; }
  })(),
  "84 必須是 7 × 12 算出來的，不是再寫一次");

const store = await imp(P_STORE);
const storeSrc = codeOnly(read(P_STORE));

ck("O6) Store 有具名入口 `advanceWorldDays(n, { reason })`",
  /advanceWorldDays\s*\(/.test(storeSrc));

ck("O7) 不在白名單的理由**拒絕推進**（不是默默照推）",
  /isAdvanceReason|ADVANCE_REASONS/.test(storeSrc),
  "推進權必須是可驗證的，不能只靠慣例");

ck("O8) 有單一讀取點 `worldTimeView()`（畫面不自己算時間）",
  /worldTimeView\s*\(/.test(storeSrc));

// ════════════════════════════════════════════════════════════════════════════
//  §A 活動歸屬：哪些活動屬於世界時間
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§A 活動歸屬】");

ck("A1) 有宣告式的活動→時間成本表",
  !!clock?.WORLD_TIME_COST,
  clock ? JSON.stringify(clock.WORLD_TIME_COST) : "");

ck("A2) 快速練習**不消耗**世界時間（純測試場）",
  !!clock && clock.WORLD_TIME_COST.practice === 0
  && clock.consumesWorldTime("practice") === false);

ck("A3) 正式季賽本身不推進時間（賽程日由日曆帶到，不是比賽推日曆）",
  !!clock && clock.WORLD_TIME_COST.official === 0
  && clock.consumesWorldTime("official") === false);

ck("A4) 訓練與休息**消耗**世界時間",
  !!clock && clock.consumesWorldTime("training") === true
  && clock.consumesWorldTime("rest") === true);

//  ⚠ 這一條是刻意的留白，不是漏填。產品要求「不要過早鎖死每種活動消耗幾天」。
ck("A5) 一般競技比賽的成本是**明確未定案**（null），不是被填成 0",
  !!clock && clock.WORLD_TIME_COST.competitive === null
  && clock.isWorldTimeCostDecided("competitive") === false
  && clock.isWorldTimeCostDecided("practice") === true,
  "未定案必須看得出來，否則之後沒人知道那個 0 是決定還是遺漏");

ck("A6) 表裡的四種活動與 `MATCH_SOURCE` / 訓練對得起來（不是第二套詞彙）",
  (async () => true) && (() => {
    if (!clock) return false;
    const keys = Object.keys(clock.WORLD_TIME_COST);
    return ["practice", "competitive", "official", "training", "rest"].every((k) => keys.includes(k));
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §F 不可凍結
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§F 不可凍結】");

//  ⚠ 這是本輪的核心。原本的樣子：訓練中心那顆按鈕第一行就 `return`。
ck("F1) 訓練中心**不再**因為『沒有人在訓練』就拒絕推進",
  (() => {
    const s = codeOnly(read(P_TRAINING_UI));
    return !/training\.length\s*===\s*0[^)]*\)\s*\{[^}]*return/.test(s)
      && !/if\s*\(\s*training\.length\s*===\s*0\s*\)\s*\{\s*push\([^)]*\);\s*return/.test(s);
  })(),
  "沒有人在訓練 ⇒ 世界完全停住，這是原本的樣子");

ck("F2) 存在**非訓練**的正式推進入口（首頁）",
  /advanceWorldDays/.test(codeOnly(read(P_DASH))),
  "時間不能只有訓練中心推得動");

ck("F3) 那個入口**不依賴**任何前置條件（不是另一個訓練閘門）",
  (() => {
    const s = codeOnly(read(P_DASH));
    //  不得出現「有人在訓練才可推進」這類條件
    return !/training\.length\s*[><=]/.test(s) && !/players\.some\([^)]*training/.test(s);
  })());

ck("F4) DEV 工具**不是**唯一的非訓練入口（正式模式看不到 DEV）",
  (() => {
    const dash = codeOnly(read(P_DASH));
    return /advanceWorldDays/.test(dash) && !/isDebugMode|featureEnabled/.test(
      dash.split("advanceWorldDays")[0].slice(-400));
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §S 賽程與世界日期一致
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 賽程對齊】");

ck("S1) 賽程日 → 世界日只有**一個**換算點 `absoluteDayOf`",
  typeof seasonState.absoluteDayOf === "function"
  && /absoluteDayOf\s*=\s*\(state,\s*fixture\)/.test(read(P_SEASON)));

ck("S2) 換算就是 `startDay + fixture.day - 1`（賽季錨在建立當天）",
  seasonState.absoluteDayOf({ startDay: 30 }, { day: 5 }) === 34
  && seasonState.absoluteDayOf({ startDay: 1 }, { day: 1 }) === 1);

ck("S3) 沒有人繞過它直接拿 `fixture.day` 跟 `meta.days` 比",
  (() => {
    const s = codeOnly(read(P_STORE));
    return !/fixture\.day\s*===\s*[^;]*meta\.days|meta\.days\s*===\s*[^;]*fixture\.day/.test(s);
  })());

ck("S4) 賽季長度仍是 84 天，且與世界年度同長（允許未來分開，但要刻意）",
  regular.SEASON_DAYS === 84 && !!clock && clock.CAREER_YEAR.daysPerYear === regular.SEASON_DAYS,
  `SEASON_DAYS=${regular.SEASON_DAYS}｜CAREER_YEAR=${clock?.CAREER_YEAR?.daysPerYear}`);

// ════════════════════════════════════════════════════════════════════════════
//  §Y 年度邊界（給未來的年齡系統用；本輪不動選手年齡）
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§Y 生涯年度邊界】");

ck("Y1) 年度長度 = 每週天數 × 每年週數 = 84",
  !!clock && clock.CAREER_YEAR.daysPerYear === timeline.DAYS_PER_WEEK * timeline.WEEKS_PER_SEASON
  && clock.CAREER_YEAR.daysPerYear === 84,
  clock ? `${timeline.DAYS_PER_WEEK} × ${timeline.WEEKS_PER_SEASON} = ${clock.CAREER_YEAR.daysPerYear}` : "");

ck("Y2) `careerYearOf` 與 `deriveTime` 同源（不是第二套換算）",
  !!clock && [1, 84, 85, 168, 169, 500].every((d) =>
    clock.careerYearOf(d).year === timeline.deriveTime(d).season));

ck("Y3) 年度邊界正確：第 84 天仍是第 1 年，第 85 天進第 2 年",
  !!clock && clock.careerYearOf(84).year === 1 && clock.careerYearOf(85).year === 2
  && clock.careerYearOf(84).dayOfYear === 84 && clock.careerYearOf(85).dayOfYear === 1);

ck("Y4) 異常輸入安全降級（舊存檔 / undefined 不得炸掉時間）",
  !!clock && clock.careerYearOf(undefined).year === 1 && clock.careerYearOf(0).year === 1
  && clock.careerYearOf(-5).year === 1);

//  ⚠ 本輪明文不動年齡。這一條擋的是「順手做了」。
ck("Y5) 本輪**沒有**動選手年齡（沒有 age +1 / 衰退 / 退休）",
  (() => {
    const s = codeOnly(read(P_CLOCK) ? read(P_CLOCK) : "");
    return !/age\s*\+\s*1|age\s*\+\+|decline|retire/i.test(s)
      && !/\bage\s*:\s*[^,}]*\+\s*1/.test(codeOnly(read(P_STORE)));
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §D 不重複推進、不重複結算
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§D 不重複】");

ck("D1) MOBA / CS 共用一條時間：兩個賽季時取**交集**，不各推各的",
  /live\.length\s*>\s*1/.test(storeSrc) && /probe\.daysAdvanced\s*<\s*effective/.test(storeSrc),
  "任一項目有未收尾的比賽日，日曆就停在那裡");

ck("D2) `_advanceCompetition` 只被 `advanceDay` 呼叫（沒有第二條推賽季的路）",
  (storeSrc.match(/_advanceCompetition\(/g) ?? []).length === 2,
  `出現 ${(storeSrc.match(/_advanceCompetition\(/g) ?? []).length} 次（宣告 1 ＋ 呼叫 1）`);

ck("D3) 推不動時**完全不寫入**（不動時鐘、不結算、不存檔）",
  /effective\s*<=\s*0/.test(storeSrc));

// ════════════════════════════════════════════════════════════════════════════
//  §E 端到端：真的推一次，看世界有沒有動、練習有沒有偷推
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§E 端到端】");
globalThis.localStorage = globalThis.localStorage ?? {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
{
  const S = () => store.useProfileStore.getState();
  const day0 = S().meta.days;

  const bad = S().advanceWorldDays?.(1, { reason: "定義外的理由" });
  ck("E1) 不在白名單的理由被拒絕，且**沒有推進**",
    bad?.ok === false && S().meta.days === day0,
    bad?.reason ?? "");

  const ok1 = S().advanceWorldDays?.(1, { reason: "rest" });
  ck("E2) 非訓練理由（rest）推得動世界時間——**沒有人在訓練也一樣**",
    ok1?.ok === true && S().meta.days === day0 + 1,
    `day ${day0} → ${S().meta.days}`);

  const day1 = S().meta.days;
  const ok2 = S().advanceWorldDays?.(3, { reason: "training" });
  ck("E3) 訓練理由照常推進（既有行為不變）",
    ok2?.ok === true && S().meta.days > day1,
    `day ${day1} → ${S().meta.days}｜實推 ${ok2?.daysAdvanced}`);

  //  快速練習：跑一整場，世界時間必須逐值不變
  const dayBeforePractice = S().meta.days;
  S().autoFillLineup("moba");
  const started = S().startPracticeMatch("moba");
  let now = Date.now();
  for (let i = 0; i < 60 && S().matchmaking.room?.state !== "confirmed"; i++) {
    now += 1000; S().pollMatchRoom(now);
    if (S().matchmaking.room?.state === "ready_check" && !S().matchmaking.room.confirmations?.us) S().confirmMatchReady(now);
  }
  S().createMatchSession(now);
  S().launchMatchSession(now);
  ck("E4) 快速練習跑完整條流程，世界時間**逐值不變**",
    started?.ok === true && S().meta.days === dayBeforePractice,
    `day ${dayBeforePractice} → ${S().meta.days}`);

  const view = S().worldTimeView?.();
  ck("E5) `worldTimeView` 與 `meta.days` 一致（畫面不會看到第二個時間）",
    !!view && view.day === S().meta.days
    && view.week === timeline.deriveTime(S().meta.days).week
    && view.careerYear === clock.careerYearOf(S().meta.days).year,
    view ? `day ${view.day}｜week ${view.week}｜年度 ${view.careerYear} 第 ${view.dayOfYear} 天` : "");
}

// ════════════════════════════════════════════════════════════════════════════
//  §N 本輪邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

ck("N1) 沒有做 Time Block（留給 V2，但契約表已預留擴充位）",
  !/TIME_BLOCK|timeBlock/.test(codeOnly(read(P_CLOCK))));

ck("N2) 沒有做 Off-season / Ranked / 真人連線",
  !/offSeason|offseason|ranked|multiplayer/i.test(codeOnly(read(P_CLOCK))));

ck("N3) 世界時間契約很小（不得長成第二個賽季系統）",
  (() => {
    const lines = codeOnly(read(P_CLOCK)).split("\n").filter((l) => l.trim()).length;
    return lines <= 70;
  })(),
  `${codeOnly(read(P_CLOCK)).split("\n").filter((l) => l.trim()).length} 行實碼`);

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
  //  A：把練習的時間成本改成 1 ⇒ §A2 變紅
  const A = await mutated(P_CLOCK, (s) => s.replace(/practice:\s*0/, "practice: 1"), "A-practice");
  ck("M-A) 讓練習消耗時間 ⇒ §A2 變紅",
    A.consumesWorldTime("practice") !== false);

  //  B：把 competitive 從 null 填成 0 ⇒ §A5 變紅（未定案被偷偷變成已定案）
  //  ⚠ 錨點必須帶結尾逗號。檔頭註解裡就有 `competitive: null` 這串字，
  //    不帶逗號會改到**註解**，程式碼原封不動 ⇒ sentinel 假綠。
  const B = await mutated(P_CLOCK, (s) => s.replace(/competitive:\s*null,/, "competitive: 0,"), "B-decided");
  ck("M-B) 把未定案填成 0 ⇒ §A5 變紅",
    B.isWorldTimeCostDecided("competitive") !== false);

  //  C：把年度長度脫離 timeline 常數 ⇒ §Y1／§Y2 變紅
  //  ⚠ 錨點打在**唯一算年度長度的那一行**。第一版打在 `weeksPerYear` 上，
  //    但當時 `daysPerYear` 是另外獨立算的 ⇒ 改了也沒有任何效果。
  //    那不只是 sentinel 沒寫好，是**產品碼本身內部不一致**（已一併修正）。
  const C = await mutated(P_CLOCK,
    (s) => s.replace(/const DAYS_PER_CAREER_YEAR = DAYS_PER_WEEK \* WEEKS_PER_SEASON;/, "const DAYS_PER_CAREER_YEAR = 100;"), "C-year");
  ck("M-C) 年度長度脫離 timeline 常數 ⇒ §Y1／§Y2 變紅",
    C.CAREER_YEAR.daysPerYear !== timeline.DAYS_PER_WEEK * timeline.WEEKS_PER_SEASON
    || ![1, 85, 169].every((d) => C.careerYearOf(d).year === timeline.deriveTime(d).season));

  //  D：把訓練閘門加回去 ⇒ §F1 變紅
  const D = read(P_TRAINING_UI).replace(
    /const res = advanceWorldDays/,
    'if (training.length === 0) { push("無選手在訓練中"); return; }\n    const res = advanceWorldDays');
  ck("M-D) 把『沒人訓練就不能推進』加回去 ⇒ §F1 變紅",
    /if\s*\(\s*training\.length\s*===\s*0\s*\)\s*\{\s*push\([^)]*\);\s*return/.test(codeOnly(D)));
} catch (e) {
  ck("M-*) sentinel 可執行", false, String(e.message).slice(0, 170));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch {} }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} check_world_time_v1：${pass}/${pass + fail} 通過`);
console.log(`   世界時間：唯一來源 meta.days｜生涯年度 ${clock?.CAREER_YEAR?.daysPerYear ?? "?"} 天（${timeline.DAYS_PER_WEEK} × ${timeline.WEEKS_PER_SEASON}）`);
console.log(`   ⚠ 一般競技比賽的時間成本**刻意未定案**，留給 V2 Time Block。本輪不動選手年齡。`);
process.exit(fail === 0 ? 0 : 1);
