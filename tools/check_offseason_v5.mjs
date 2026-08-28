#!/usr/bin/env node
// ============================================================================
//  tools/check_offseason_v5.mjs — Season vNext V5-1：Off-season / 生涯年度邊界
//
//  執行：repo 根目錄 `node tools/check_offseason_v5.mjs`；失敗 exit 1。
//
//  ── 這一輪解什麼 ─────────────────────────────────────────────────────────
//  V2 建了生涯年度邊界，但它只做一件事（age +1），而且**沒有留下任何紀錄**：
//  跨過去之後，沒有人知道第 N 年度發生過、也沒有地方讓 V5-2／V5-3 掛載。
//  V5-1 把那一個瞬間變成**有紀錄、可冪等、可驗證的邊界**。
//
//  ── 本輪的邊界（由 §N 反向釘住）───────────────────────────────────────────
//  **不改能力、不退休任何人、不改 AI roster、不改合約、不補新秀。**
//  V5-1 只立骨架與掛載點。衰退是 V5-2，退休與補位是 V5-3。
//
//  ── 為什麼冪等鍵是「年度編號」────────────────────────────────────────────
//  照抄週結算已經驗證過的形狀（`economy.settledWeeks[week]` + `lastSettledWeek`）。
//  年度編號是**世界時間的推導值**，不是計數器 ⇒ 重整、重讀存檔、重複呼叫
//  都不可能讓同一年被封存兩次。
//
//  §C 契約　§B 邊界只觸發一次　§I 冪等與存檔安全　§F 快轉＝逐日
//  §M 兩個項目共用一個邊界　§S 賽季 rollover 不得觸發　§U 最小 UI
//  §N 本輪邊界　§R V3／V4 不回歸　§X mutation sentinel
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

const P_OFF = "src/platform/time/offSeason.js";
const P_STORE = "src/platform/profileStore.js";
const P_ROLL = "src/platform/time/careerYearRollover.js";
const P_SEASON = "src/platform/competition/seasonState.js";
const P_DASH = "src/screens/DashboardScreen.jsx";
const KEY = "esmo.profile.v1";

const off = await soft(P_OFF);
const clock = await imp("src/platform/time/worldClock.js");
const DPY = clock.CAREER_YEAR.daysPerYear;

// ════════════════════════════════════════════════════════════════════════════
//  §C 契約
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§C 契約】");

ck("C1) 有獨立的 Off-season 純模組 `time/offSeason.js`", !!off, off ? "" : "模組不存在");

ck("C2) 它是**純模組**（不 import Store / React / zustand / localStorage）",
  !!off && !/profileStore|zustand|from "react"|localStorage/.test(codeOnly(read(P_OFF))));

ck("C3) 有版本字串（契約要能被指名）",
  !!off && typeof off.OFF_SEASON_VERSION === "string" && /OffSeason/.test(off.OFF_SEASON_VERSION),
  off?.OFF_SEASON_VERSION ?? "");

ck("C4) **九步序列宣告在契約裡**（V5-2／V5-3 的掛載點寫得出來）",
  !!off && Array.isArray(off.OFF_SEASON_STEPS) && off.OFF_SEASON_STEPS.length >= 8
  && Object.isFrozen(off.OFF_SEASON_STEPS),
  off?.OFF_SEASON_STEPS ? `${off.OFF_SEASON_STEPS.length} 步` : "");

ck("C5) **本輪真正執行的步驟另外宣告**（不假裝九步都做了）",
  !!off && Array.isArray(off.IMPLEMENTED_STEPS)
  && off.IMPLEMENTED_STEPS.length < off.OFF_SEASON_STEPS.length
  && off.IMPLEMENTED_STEPS.every((s) => off.OFF_SEASON_STEPS.includes(s)),
  off?.IMPLEMENTED_STEPS ? off.IMPLEMENTED_STEPS.join("／") : "");

ck("C6) 有 `sealCareerYears()` 純 reducer 與 `offSeasonViewOf()` 讀取點",
  !!off && typeof off.sealCareerYears === "function" && typeof off.offSeasonViewOf === "function");

// ════════════════════════════════════════════════════════════════════════════
//  §B 邊界只觸發一次
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§B 邊界只觸發一次】");

const bare = (day) => ({ meta: { days: day }, players: [{ id: "a", age: 22 }, { id: "b", age: 25 }] });

ck("B1) Day 84 → 85 封存**恰好一個**年度",
  !!off && (() => {
    const r = off.sealCareerYears(bare(DPY), { fromDay: DPY, toDay: DPY + 1 });
    return off.sealedYearsOf(r.state.meta).length === 1 && r.sealed.length === 1;
  })(),
  !!off ? JSON.stringify(off.sealCareerYears(bare(DPY), { fromDay: DPY, toDay: DPY + 1 }).sealed) : "");

ck("B2) 封存的是**剛結束的那一年**（第 1 年度），不是新的那一年",
  !!off && off.sealCareerYears(bare(DPY), { fromDay: DPY, toDay: DPY + 1 }).sealed[0].careerYear === 1);

ck("B3) 年度內推進 ⇒ **不封存**（回傳同一個 state 參考）",
  !!off && (() => {
    const s0 = bare(10);
    const r = off.sealCareerYears(s0, { fromDay: 10, toDay: 11 });
    return r.state === s0 && r.sealed.length === 0;
  })());

ck("B4) 一次跨兩個年度 ⇒ 兩個年度**各封存一次**（不是一次帶過）",
  !!off && (() => {
    const r = off.sealCareerYears(bare(1), { fromDay: 1, toDay: 2 * DPY + 1 });
    return r.sealed.length === 2 && r.sealed.map((x) => x.careerYear).join(",") === "1,2";
  })(),
  !!off ? off.sealCareerYears(bare(1), { fromDay: 1, toDay: 2 * DPY + 1 }).sealed.map((x) => x.careerYear).join(",") : "");

ck("B5) 封存紀錄帶得出「哪一年、哪一天封的、那年的最後一天」",
  !!off && (() => {
    const e = off.sealCareerYears(bare(DPY), { fromDay: DPY, toDay: DPY + 1 }).sealed[0];
    return e.careerYear === 1 && e.sealedOnDay === DPY + 1 && e.endedOnDay === DPY;
  })(),
  !!off ? JSON.stringify(off.sealCareerYears(bare(DPY), { fromDay: DPY, toDay: DPY + 1 }).sealed[0]) : "");

// ════════════════════════════════════════════════════════════════════════════
//  §I 冪等與存檔安全
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§I 冪等與存檔安全】");

ck("I1) **同一個邊界呼叫兩次 ⇒ 第二次什麼都不做**（回同一個 state 參考）",
  !!off && (() => {
    const r1 = off.sealCareerYears(bare(DPY), { fromDay: DPY, toDay: DPY + 1 });
    const r2 = off.sealCareerYears(r1.state, { fromDay: DPY, toDay: DPY + 1 });
    return r2.state === r1.state && r2.sealed.length === 0;
  })());

ck("I2) 已封存的年度**不會被回頭補封**",
  !!off && (() => {
    const r1 = off.sealCareerYears(bare(1), { fromDay: 1, toDay: DPY + 1 });
    const r2 = off.sealCareerYears(r1.state, { fromDay: 1, toDay: 2 * DPY + 1 });
    return r2.sealed.length === 1 && r2.sealed[0].careerYear === 2
      && off.sealedYearsOf(r2.state.meta).length === 2;
  })());

ck("I3) 冪等鍵是**年度編號**（不是計數器，重讀存檔算得出同一個答案）",
  !!off && typeof off.isYearSealed === "function"
  && (() => {
    const r = off.sealCareerYears(bare(DPY), { fromDay: DPY, toDay: DPY + 1 });
    return off.isYearSealed(r.state.meta, 1) === true && off.isYearSealed(r.state.meta, 2) === false;
  })());

ck("I4) 舊存檔（`meta` 沒有 offSeason 欄位）不炸，且視為「什麼都還沒封存」",
  !!off && off.sealedYearsOf({}).length === 0 && off.sealedYearsOf(null).length === 0
  && off.isYearSealed({}, 1) === false);

// ════════════════════════════════════════════════════════════════════════════
//  §F 快轉 ＝ 逐日
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§F 快轉＝逐日】");

ck("F1) 一次跨過邊界 與 逐日跨過邊界：**封存結果逐值相同**",
  !!off && (() => {
    const jump = off.sealCareerYears(bare(DPY - 5), { fromDay: DPY - 5, toDay: DPY + 5 });
    let cur = bare(DPY - 5);
    for (let d = DPY - 5; d < DPY + 5; d++) {
      cur = off.sealCareerYears(cur, { fromDay: d, toDay: d + 1 }).state;
    }
    return JSON.stringify(cur.meta.offSeason) === JSON.stringify(jump.state.meta.offSeason);
  })());

ck("F2) 28 天快轉（V3 上限）跨年度安全：**恰好一個年度**",
  !!off && off.sealCareerYears(bare(DPY - 10), { fromDay: DPY - 10, toDay: DPY - 10 + 28 }).sealed.length === 1);

// ════════════════════════════════════════════════════════════════════════════
//  §S 賽季 rollover 不得觸發
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§S 只有 advanceDay 能觸發】");

const storeSrc = codeOnly(read(P_STORE));
const seasonSrc = codeOnly(read(P_SEASON));

ck("S1) `sealCareerYears` 在 Store 裡**只被呼叫一次**（唯一觸發點）",
  (storeSrc.match(/sealCareerYears\(/g) ?? []).length === 1,
  `${(storeSrc.match(/sealCareerYears\(/g) ?? []).length} 次`);

ck("S2) 那一次就在 `advanceDay` 內（與 `applyCareerYearRollover` 同一段）",
  (() => {
    const i = storeSrc.indexOf("advanceDay(n = 1)");
    if (i < 0) return false;
    const body = storeSrc.slice(i, i + 4500);
    return /sealCareerYears\(/.test(body) && /applyCareerYearRollover\(/.test(body);
  })());

ck("S3) **賽季狀態機完全不碰 Off-season**（賽季容器不控制選手時間）",
  !/offSeason|sealCareerYears/.test(seasonSrc));

ck("S4) 賽季 rollover 也不碰年齡（V2 立的規則沒有被本輪破壞）",
  !/\.age\s*[+=]|age:\s*\w+\s*\+/.test(seasonSrc));

// ════════════════════════════════════════════════════════════════════════════
//  §M 兩個項目共用同一個邊界
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§M MOBA / CS 共用一個邊界】");

ck("M1) 封存只吃 `meta.days`，**不吃 mode**（結構上不可能各觸發一次）",
  !!off && !/mode|moba|cs\b|GAME_MODES/i.test(codeOnly(read(P_OFF))));

ck("M2) `_sealSeasonIfFinished`（賽季封存，逐 mode）與年度封存是**兩件事**",
  /_sealSeasonIfFinished/.test(storeSrc) && !/\_sealSeasonIfFinished[\s\S]{0,200}sealCareerYears/.test(storeSrc));

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

ck("E1) Store 有 `offSeasonView()` 給畫面讀（畫面不自己算）",
  typeof S().offSeasonView === "function",
  (() => { try { return JSON.stringify(S().offSeasonView()); } catch { return ""; } })());

//  ⚠ 缺 API 時要**報紅**，不是讓整支 gate 崩掉——崩掉的 gate 沒有鑑別力。
const viewOf = () => (typeof S().offSeasonView === "function" ? S().offSeasonView() : { sealedCount: -1 });

{
  //  推到第 83 天，再跨過去
  S().resetMatchmaking?.();
  let guard = 0;
  while (S().meta.days < DPY - 1 && guard++ < 300) {
    const r = S().advanceWorldDays(Math.min(28, DPY - 1 - S().meta.days), { reason: "rest" });
    if (!r.ok || r.daysAdvanced === 0) break;
  }
  const before = viewOf();
  const yearBefore = clock.careerYearOf(S().meta.days).year;
  S().advanceWorldDays(3, { reason: "rest" });
  const after = viewOf();

  ck("E2) 真的跨過 Day 84 ⇒ 年度被封存",
    clock.careerYearOf(S().meta.days).year === yearBefore + 1
    && before.sealedCount >= 0 && after.sealedCount === before.sealedCount + 1,
    `day ${S().meta.days}｜封存數 ${before.sealedCount} → ${after.sealedCount}`);

  ck("E3) 封存紀錄真的落盤（存檔裡讀得到）",
    (() => {
      const saved = JSON.parse(globalThis.localStorage.getItem(KEY) ?? "{}");
      return Array.isArray(off?.sealedYearsOf?.(saved.meta)) && off.sealedYearsOf(saved.meta).length >= 1;
    })(),
    (() => { try { const s = JSON.parse(globalThis.localStorage.getItem(KEY) ?? "{}"); return `存檔內 ${off?.sealedYearsOf?.(s.meta)?.length ?? 0} 筆`; } catch { return ""; } })());

  ck("E4) **重讀存檔不會重複封存**（把存檔的 state 再跑一次同一個邊界 ⇒ 無事發生）",
    (() => {
      const saved = JSON.parse(globalThis.localStorage.getItem(KEY) ?? "{}");
      const y = clock.careerYearOf(S().meta.days).year;
      const again = off.sealCareerYears(saved, { fromDay: (y - 1) * DPY, toDay: (y - 1) * DPY + 1 });
      return again.sealed.length === 0;
    })());

  //  ⚠ V5-2 自檢抓到的語意 bug：封存原本跑在 rollover **之後**，
  //    於是第 1 年度的紀錄寫著第 2 年的年齡（22.0 被記成 23.0）。
  //    第 N 年度的 snapshot 必須代表「**該年度結束時**」，而 age +1 是跨進 N+1 才發生的。
  ck("E4b) **封存的是「該年度結束時」的狀態**（不是 age +1 之後）",
    (() => {
      const first = off.sealedYearsOf(S().meta)[0];
      if (!first) return false;
      //  開局五人 23/21/24/22/20 ⇒ 第 1 年度結束時平均 22.0（跨完年才是 23.0）
      return first.careerYear === 1 && first.averageAge === 22;
    })(),
    (() => { const f = off.sealedYearsOf(S().meta)[0]; return f ? `第 ${f.careerYear} 年度平均 ${f.averageAge} 歲` : "無紀錄"; })());

  ck("E5) 快轉**不會被年度邊界卡住**（V5-1 沒有決策，不得擋路）",
    (() => {
      const d0 = S().meta.days;
      const r = S().advanceWorldDays(28, { reason: "rest" });
      return r.ok && r.daysAdvanced > 0 && S().meta.days > d0;
    })());
}

// ════════════════════════════════════════════════════════════════════════════
//  §R V3 / V4 不回歸
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§R 既有不回歸】");

const stage = await imp("src/platform/progress/careerStage.js");
const market = await imp("src/platform/economy/marketValue.js");
const train = await imp("src/data/trainingCalculator.js");

ck("R1) V4 生涯階段仍算得出來（五個階段，不含退役）",
  Object.keys(stage.CAREER_STAGES).length === 5 && !("retired" in stage.CAREER_STAGES));

ck("R2) V4 市場價值折舊仍在（28 歲不折、29 歲折）",
  market.ageMultiplier(28) === 1 && market.ageMultiplier(29) < 1);

ck("R3) `ageEfficiency` 逐值不變（V5-1 不碰成長）",
  [20, 28, 29, 34].map((a) => train.ageEfficiency(a)).join(",") === "1.1,0.98,0.87,0.32");

ck("R4) V3 競技容量仍不跨日累積",
  clock.competitiveBlockOf({ day: 5, used: clock.COMPETITIVE_BLOCK.matchesPerDay }, 12).remaining
  === clock.COMPETITIVE_BLOCK.matchesPerDay);

ck("R5) 週結算冪等鍵仍是累計週次（V5-1 沒有動它）",
  /lastSettledWeek/.test(read("src/platform/economy/weeklySettlement.js")));

// ════════════════════════════════════════════════════════════════════════════
//  §N 本輪邊界：不改能力、不退休、不動 AI、不動合約、不補新秀
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§N 本輪邊界】");

const offSrc = off ? codeOnly(read(P_OFF)) : "";

ck("N1) **不改任何能力值**（模組沒有寫 stats 的痕跡）",
  !!off && !/stats\s*\[[^\]]*\]\s*=|stats:\s*\{/.test(offSrc));

//  ⚠ 這裡要禁的是**行為**，不是**宣告**。九步序列本來就會提到後續的掛載點名稱，
//    用「檔案裡不准出現這個詞」去擋會連「宣告我還沒做這件事」都一起擋掉。
//
//  ⚠ **邊界會隨 Sprint 前進**：`departureIntent` / `departureResolve` 在 V5-1 時
//    刻意未實作，V5-3 正式實作了它們 ⇒ 這一條改成釘住**V5-3 之後仍未實作**的那三步。
//    （這是範圍推進，不是回歸。）
ck("N2) **尚未實作的步驟仍然誠實標示**（不假裝九步都做了）",
  !!off && ["lifecycleEvaluation", "talentMarket", "decisionWindow"]
    .every((s) => !off.IMPLEMENTED_STEPS.includes(s)),
  !!off ? `已實作：${off.IMPLEMENTED_STEPS.join("／")}` : "");

ck("N2b) **本檔自己不移除選手**（離隊由 `progress/retirement.js` 負責，職責不混）",
  !!off && !/players\s*\.\s*filter|splice|delete\s+\w*[Pp]layer|retired\s*:|departed\s*:/.test(offSrc));

ck("N3) **不動 AI roster**",
  !!off && !/aiTeam|AI_TEAMS|aiRoster/i.test(offSrc));

ck("N4) **不動合約、不補新秀**",
  !!off && !/contract|prospect|genProspects|recruit/i.test(offSrc));

ck("N5) 模組很小（骨架不得長成第二個賽季系統）",
  !!off && offSrc.split("\n").length <= 75,
  !!off ? `${offSrc.split("\n").length} 行實碼` : "");

ck("N6) 選手在跨年度時**只有年齡改變**（V2 的行為，V5-1 沒有多動）",
  !!off && (() => {
    const s0 = { meta: { days: DPY }, players: [{ id: "a", age: 30, stats: { reflex: 70 }, potential: 80 }] };
    const r = off.sealCareerYears(s0, { fromDay: DPY, toDay: DPY + 1 });
    const p = r.state.players[0];
    return p.age === 30 && p.stats.reflex === 70;
  })(),
  "封存本身不碰選手");

// ════════════════════════════════════════════════════════════════════════════
//  §U 最小 UI
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§U 最小 UI】");
const dash = read(P_DASH);

ck("U1) 首頁看得到「上一個年度已封存」的狀態",
  /offSeasonView|home-offseason/.test(dash));

//  ⚠ **邊界隨 Sprint 前進**：V5-1 時「沒有 Off-season 畫面」是正確的邊界——
//    那時沒有任何決策，而 V5 設計 §6 的判準是「沒有決策就不要做畫面」。
//    V6-3 之後畫面存在，是**因為判準達成了**（續約／放走／補強三個真決策）。
//    ⇒ 這一條改成釘住**判準本身**：畫面可以存在，但必須由
//      `offSeasonSession` 判斷「真的有決策」才進得去，不得無條件顯示。
ck("U2) 有畫面就必須由**真的有決策**把關（不得是無條件的空殼頁）",
  (() => {
    const screen = resolve(ROOT, "src/screens/manage/OffSeasonScreen.jsx");
    if (!fs.existsSync(screen)) return true;                    // 沒有畫面也合格
    const sess = resolve(ROOT, "src/platform/time/offSeasonSession.js");
    if (!fs.existsSync(sess)) return false;                     // 有畫面卻沒有把關 ⇒ 紅
    const src = fs.readFileSync(sess, "utf8");
    //  會期只在 `pending.total > 0` 時開——這就是判準的落地處。
    return /pending\.total <= 0/.test(src)
      && /data-testid="home-offseason-enter"/.test(read("src/screens/DashboardScreen.jsx"));
  })());

// ════════════════════════════════════════════════════════════════════════════
//  §X mutation sentinel
// ════════════════════════════════════════════════════════════════════════════
console.log("\n【§X mutation sentinel】");
const TMP = [];
async function mutated(relPath, mutate, tag) {
  const src = read(relPath);
  const out = mutate(src);
  if (out === src) throw new Error(`sentinel ${tag}：變異沒有套用（錨點已改）`);
  const tmp = resolve(ROOT, `${dirname(resolve(ROOT, relPath))}/.sentinel-v51-${tag}.js`);
  fs.writeFileSync(tmp, out, "utf8");
  TMP.push(tmp);
  return import(pathToFileURL(tmp).href);
}
try {
  if (off) {
    //  A：拿掉「已封存就跳過」⇒ §I1 變紅（重讀存檔會重複封存）
    const A = await mutated(P_OFF, (s) => s.replace(/if \(isYearSealed\(meta, y\)\) continue;/, "if (false) continue;"), "A-double");
    ck("X-A) 拿掉冪等檢查 ⇒ §I1 變紅（同一年會被封存兩次）",
      (() => {
        const r1 = A.sealCareerYears(bare(DPY), { fromDay: DPY, toDay: DPY + 1 });
        const r2 = A.sealCareerYears(r1.state, { fromDay: DPY, toDay: DPY + 1 });
        return r2.sealed.length !== 0;
      })());

    //  B：改成用「天數差 / 84」判斷跨越 ⇒ §B1 變紅（Day 84→85 會算成 0）
    const B = await mutated(P_OFF,
      (s) => s.replace(/const toYear = careerYearOf\(to\)\.year;/,
        "const toYear = careerYearOf(from).year + Math.floor((to - from) / CAREER_YEAR.daysPerYear);"), "B-daydiff");
    ck("X-B) 用『天數差 / 84』判斷跨年 ⇒ §B1 變紅",
      B.sealCareerYears(bare(DPY), { fromDay: DPY, toDay: DPY + 1 }).sealed.length !== 1);
  } else {
    ck("X-A) 拿掉冪等檢查 ⇒ §I1 變紅", false, "模組不存在");
    ck("X-B) 用『天數差 / 84』判斷跨年 ⇒ §B1 變紅", false, "模組不存在");
  }
} catch (e) {
  ck("X) sentinel 執行完成", false, String(e.message ?? e));
} finally {
  for (const t of TMP) { try { fs.unlinkSync(t); } catch { /* ignore */ } }
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${fail === 0 ? "✅" : "❌"} check_offseason_v5：${pass}/${pass + fail} 通過`);
if (fail === 0) {
  console.log("   生涯年度邊界＝有紀錄、冪等（鍵為年度編號）、只由 advanceDay 觸發。");
  console.log("   快轉與逐日推進逐值相同；重讀存檔不會重複封存；MOBA／CS 共用同一個邊界。");
  console.log("   ⚠ 本輪不做：能力衰退（V5-2）／退休與補位（V5-3）／AI 換血。");
}
process.exit(fail === 0 ? 0 : 1);
