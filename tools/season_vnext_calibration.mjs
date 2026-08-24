#!/usr/bin/env node
// ============================================================================
//  tools/season_vnext_calibration.mjs — Season vNext 設計量測（不是 verifier）
//
//  執行：`node tools/season_vnext_calibration.mjs`
//
//  ── 這支存在的理由 ────────────────────────────────────────────────────────
//  「Career Year 要 10 / 12 / 14 週」如果用估的，之後一定會被打臉。
//  本檔**用主幹真正在跑的那幾個函式**（`calculateTrainingResult`、
//  `applyLevelGrowth`、`playerLevel` 的 XP 曲線、`dayForRound` 的賽程間距、
//  `genProspects` 的新秀分佈）把候選長度各跑一次。
//
//  ── 為什麼不用「跑到潛力上限要幾年」當判準 ──────────────────────────────
//  成長正比於**剩餘空間**（training 的 `potentialSpace`、levelGrowth 的
//  `roomFull`）⇒ 尾巴是**漸近線，永遠到不了**。用它當判準會得到「30 年還沒成熟」
//  這種被數學假象誤導的結論。
//  本檔改用產品看得懂的指標：
//      **潛力空間關閉率 = (現值 − 起始值) / (潛力 − 起始值)**
//  0% = 剛入行，100% = 完全開發完。並回答一個具體問題：
//      **19–21 歲新人，正常玩法下幾個 Career Year 變成熟主力？**
//
//  ⚠ **本檔不改任何產品碼、不是 gate、不進 CI**、沒有 exit 1。
//    所有數值 **PROPOSED / NOT FROZEN**，核准前不得寫進產品碼。
// ============================================================================
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);

const training = await imp("src/data/trainingCalculator.js");
const playerModel = await imp("src/data/playerModel.js");
const levelGrowth = await imp("src/platform/progress/levelGrowth.js");
const playerLevel = await imp("src/platform/progress/playerLevel.js");
const rewards = await imp("src/platform/progress/rewardFormulas.js");
const schedule = await imp("src/platform/competition/scheduleGenerator.js");
const regular = await imp("src/platform/competition/regularSeason.js");
const cond = await imp("src/platform/condition/playerCondition.js");
const recruit = await imp("src/data/recruitPool.js");

const DAYS_PER_WEEK = 7;
const PLAYER_FIXTURES = 14;
const CANDIDATES = [10, 12, 14];
const STAT_KEYS = playerModel.STAT_DEF.map((s) => s.key);

const r1 = (v) => Math.round(v * 10) / 10;
const pct = (v) => `${r1(v * 100)}%`;

const line = (s = "") => console.log(s);
line("══════════════════════════════════════════════════════════════════");
line("  ESMO Season vNext — 成長與 Career Year 量測");
line("  ⚠ PROPOSED / NOT FROZEN：設計輸入，不是已核准的 balance");
line("══════════════════════════════════════════════════════════════════");

// ── 現況基準 ────────────────────────────────────────────────────────────────
line("\n【現況基準（主幹實跑值）】");
line(`  SEASON_DAYS ${regular.SEASON_DAYS} 天（${regular.SEASON_DAYS / DAYS_PER_WEEK} 週）｜玩家 ${PLAYER_FIXTURES} 場｜場間 `
  + `${schedule.dayForRound(2, PLAYER_FIXTURES, { from: 1, to: regular.SEASON_DAYS }) - schedule.dayForRound(1, PLAYER_FIXTURES, { from: 1, to: regular.SEASON_DAYS })} 天`);
line(`  每場 XP 勝 ${rewards.BASE_XP_WIN} / 負 ${rewards.BASE_XP_LOSS}｜升級成長每級 ${levelGrowth.LEVEL_GROWTH.pointsPerLevel} 點`);
line(`  體力：每場 −${cond.CONDITION.matchEnergyCost}、每日 +${cond.CONDITION.restPerDay}、不可出賽 <${cond.CONDITION.unfitBelow}`);

// ── 新秀的真實分佈（不要自己編一個假的起始值）────────────────────────────
const pool = recruit.genProspects(7);
const mainKeysOf = (p) => levelGrowth.growthKeysFor(p) ?? STAT_KEYS.slice(0, 5);
const avgMain = (p) => { const k = mainKeysOf(p); return k.reduce((s, x) => s + (p.stats[x] ?? 50), 0) / k.length; };
const ratios = pool.map((p) => avgMain(p) / p.potential).sort((a, b) => a - b);
const med = ratios[Math.floor(ratios.length / 2)];
line(`\n【新秀池真實分佈（genProspects，40 人）】`);
line(`  年齡 ${Math.min(...pool.map((p) => p.age))}–${Math.max(...pool.map((p) => p.age))}｜潛力 ${Math.min(...pool.map((p) => p.potential))}–${Math.max(...pool.map((p) => p.potential))}`);
line(`  入行時「主能力 / 潛力」：中位數 ${pct(med)}（區間 ${pct(ratios[0])}–${pct(ratios.at(-1))}）`);
line(`  ⇒ 模擬的起始值採用真實分佈，不自己編一個 50。`);

// ── 代表性玩家：**直接從真實新秀池抽**，不自己編起始值 ─────────────────────
//  ⚠ 這一段修過一次。第一版對每個原型都套同一個起始比例（池中位數 87.6%），
//    結果把「潛力 92 的天才」也給了跟中位一樣的 11 點成長空間——完全失真。
//    池子裡**潛力越高、入行達成率越低**（潛力 92 剩 34 點，潛力 46 只剩 1.8 點），
//    那個相關性本身就是設計的一部分，不能被合成資料抹掉。
const mkFrom = (prospect, label) => ({
  ...prospect, name: label, energy: 100, condition: "精神飽滿", lv: 1, xp: 0,
  stats: { ...prospect.stats },
  _start: avgMain(prospect),
});
const pickBy = (fn, label) => {
  const found = pool.find(fn);
  return found ? mkFrom(found, label) : null;
};
const ARCHETYPES = [
  pickBy((p) => p.age >= 19 && p.age <= 21 && p.potential >= 78 && p.potential <= 86, "典型新人 19–21歲"),
  pickBy((p) => p.age >= 18 && p.age <= 21 && p.potential >= 90, "高潛天才 ≤21歲"),
  pickBy((p) => p.age >= 21 && p.potential < 70, "即戰力 21+歲 低潛"),
  pickBy((p) => p.age <= 17 && p.potential >= 85, "超新星 ≤17歲"),
].filter(Boolean);

line("\n【代表性選手（自新秀池實抽，非合成）】");
for (const a of ARCHETYPES) {
  line(`  ${a.name.padEnd(18)} ${a.role}  age=${a.age}  潛力=${a.potential}  `
    + `入行主能力=${r1(a._start)}  成長空間=${r1(a.potential - a._start)} 點  learning=${a.stats.learning}`);
}
line(`  ⚠ 「成長空間」就是這名選手一輩子能長的全部——池中位數只有 ${r1(pool.map((p) => p.potential - avgMain(p)).sort((x, y) => x - y)[20])} 點。`);

/** 潛力空間關閉率：0 = 剛入行，1 = 完全開發完。 */
const closed = (p) => {
  const room = p.potential - p._start;
  if (room <= 0) return 1;
  return Math.min(1, Math.max(0, (avgMain(p) - p._start) / room));
};

/**
 * 跑一個 Career Year。回傳成長點數並**分來源記帳**。
 *
 * 目前主幹只有兩個永久成長來源：
 *   · Training（`calculateTrainingResult`，含 age / learning / condition）
 *   · Formal Competition（賽果 XP → 升級 → `applyLevelGrowth`）
 * Practice 與 Ranked **目前沒有任何永久成長路徑**（尚未存在）⇒ 記為 0，
 * 這正是設計要補的缺口，不是量測誤差。
 */
function simYear(p0, weeks, { winRate = 0.5, trainRatio = 0.8 } = {}) {
  const p = { ...p0, stats: { ...p0.stats } };
  const days = weeks * DAYS_PER_WEEK;
  const fixtureDays = new Set(Array.from({ length: PLAYER_FIXTURES }, (_, i) =>
    schedule.dayForRound(i + 1, PLAYER_FIXTURES, { from: 1, to: days })));

  //  ① Formal Competition
  const wins = Math.round(PLAYER_FIXTURES * winRate);
  const xpGained = wins * rewards.BASE_XP_WIN + (PLAYER_FIXTURES - wins) * rewards.BASE_XP_LOSS;
  const lvBefore = playerLevel.levelFromTotalXp(p.xp);
  p.xp += xpGained;
  const lvAfter = playerLevel.levelFromTotalXp(p.xp);
  const g = levelGrowth.applyLevelGrowth(p, Math.max(0, lvAfter - lvBefore));
  p.stats = g.stats;
  p.lv = lvAfter;
  const fromFormal = g.total;

  //  ② Training（課程必須整段塞得進下一場比賽之前）
  let fromTraining = 0, coursesDone = 0;
  const courses = [...playerModel.TRAINING_COURSES.filter((c) => c.id !== "rest")]
    .sort((a, b) => b.gain / Math.max(1, b.hours) - a.gain / Math.max(1, a.hours));
  const nextFixture = (d) => { for (let x = d; x <= days; x++) if (fixtureDays.has(x)) return x; return days + 1; };
  let day = 1, tick = 0;
  while (day <= days) {
    if (fixtureDays.has(day)) { p.energy = Math.max(0, p.energy - cond.CONDITION.matchEnergyCost); day += 1; continue; }
    const room = nextFixture(day) - day;
    const wantTrain = (tick++ % 10) < Math.round(trainRatio * 10);
    const c = courses.find((x) => x.hours <= room && p.energy >= x.energyCost);
    if (wantTrain && c) {
      const res = training.calculateTrainingResult(p, c);
      if (res.completed) {
        for (const [k, ch] of Object.entries(res.statChanges)) p.stats[k] = ch.after;
        fromTraining += res.totalGain; coursesDone += 1; p.energy = res.energyAfter;
      }
      day += c.hours;
    } else { p.energy = Math.min(100, p.energy + cond.CONDITION.restPerDay); day += 1; }
  }
  return {
    player: p, coursesDone,
    fromTraining: r1(fromTraining), fromFormal: r1(fromFormal),
    fromPractice: 0, fromRanked: 0,          // 尚未存在的路徑
    total: r1(fromTraining + fromFormal),
  };
}

/** 跑一段生涯，回傳逐年的關閉率與來源分帳。 */
function career(p0, weeks, years = 12, opts = {}) {
  let p = { ...p0, stats: { ...p0.stats } };
  const rows = [];
  for (let y = 1; y <= years; y++) {
    const before = closed(p);
    const s = simYear(p, weeks, opts);
    p = { ...s.player, _start: p0._start, age: p.age + 1 };
    rows.push({ year: y, age: p.age, closedBefore: before, closedAfter: closed(p), ...s });
  }
  return rows;
}

// ── ① 前三年關閉多少潛力空間 ────────────────────────────────────────────────
line("\n【① 潛力空間關閉率：前三年（12 週 Career Year）】");
line("  選手                  入行值  第1年後  第2年後  第3年後");
for (const a of ARCHETYPES) {
  const rows = career(a, 12, 3);
  line(`  ${a.name.padEnd(20)}  ${String(r1(a._start)).padStart(6)}  `
    + rows.map((r) => pct(r.closedAfter).padStart(7)).join("  "));
}

// ── ② 到達 70 / 80 / 90% 要幾年 ─────────────────────────────────────────────
line("\n【② 到達 70% / 80% / 90% 潛力開發程度要幾個 Career Year】");
for (const w of CANDIDATES) {
  line(`\n  ── ${w} 週 Career Year ──`);
  line("  選手                  70%   80%   90%   12年後");
  for (const a of ARCHETYPES) {
    const rows = career(a, w, 12);
    const hit = (t) => { const r = rows.find((x) => x.closedAfter >= t); return r ? `${r.year}年` : "—"; };
    line(`  ${a.name.padEnd(20)}  ${hit(0.7).padStart(4)}  ${hit(0.8).padStart(4)}  ${hit(0.9).padStart(4)}  ${pct(rows.at(-1).closedAfter).padStart(6)}`);
  }
}

// ── ③ 成長來源貢獻比例 ──────────────────────────────────────────────────────
line("\n【③ 成長來源貢獻比例（12 週，典型新人，前 5 年累計）】");
{
  const rows = career(ARCHETYPES[0], 12, 5);
  const t = rows.reduce((a, r) => a + r.fromTraining, 0);
  const f = rows.reduce((a, r) => a + r.fromFormal, 0);
  const all = t + f;
  line(`  Training（訓練課程）        ${String(r1(t)).padStart(6)} 點   ${pct(t / all).padStart(6)}`);
  line(`  Formal Competition（聯賽）  ${String(r1(f)).padStart(6)} 點   ${pct(f / all).padStart(6)}`);
  line(`  Practice                    ${String(0).padStart(6)} 點   ${"0%".padStart(6)}   ← 目前無永久成長路徑`);
  line(`  Ranked                      ${String(0).padStart(6)} 點   ${"0%".padStart(6)}   ← 目前不存在`);
  line(`  🔴 現況：訓練 : 聯賽 ≈ ${Math.round(t / f)} : 1。`);
  line(`     「正式賽事是生涯成果」在數字上不成立——它只貢獻 ${pct(f / all)}。`);
}

// ── ④ 核心問題 ──────────────────────────────────────────────────────────────
line("\n【④ 核心問題：19–21 歲新人，正常玩法下幾個 Career Year 變成熟主力？】");
line("  定義「成熟主力」＝ 潛力空間關閉 80%（再練也只剩尾巴，可以扛先發）");
line("");
line(`  週數  ${ARCHETYPES.map((a) => a.name.slice(0, 8).padStart(10)).join("  ")}`);
for (const w of CANDIDATES) {
  const cells = ARCHETYPES.map((a) => {
    const rows = career(a, w, 12);
    const r = rows.find((x) => x.closedAfter >= 0.8);
    return r ? `${r.year}年(${r.age}歲)` : ">12年";
  });
  line(`  ${String(w).padStart(4)}  ${cells.map((c) => c.padStart(10)).join("  ")}`);
}

// ── ⑤ 生涯操作量（UX 現實檢查）──────────────────────────────────────────────
line("\n【⑤ 生涯操作量：17 年生涯要按幾次推進】");
line("  週數  17年=天   推進3天   推進1週   推進到下一場(6天)");
for (const w of CANDIDATES) {
  const d = w * DAYS_PER_WEEK * 17;
  line(`  ${String(w).padStart(4)}  ${String(d).padStart(7)}  ${String(Math.ceil(d / 3)).padStart(7)}次  ${String(Math.ceil(d / 7)).padStart(7)}次  ${String(Math.ceil(d / 6)).padStart(15)}次`);
}

// ── ⑥ Practice 防刷曲線 ─────────────────────────────────────────────────────
line("\n【⑥ Practice 防刷：一個 Time Block 內打 N 場的永久成長】");
line("   N   等比例   √N    1/(1+lnN)   budget制(上限3)");
for (const n of [1, 2, 3, 5, 10, 20, 50]) {
  line(`  ${String(n).padStart(2)}   ${String(n).padStart(6)}  ${String(r1(Math.sqrt(n))).padStart(4)}  `
    + `${String(r1(n / (1 + Math.log(Math.max(1, n))))).padStart(9)}   ${String(Math.min(n, 3)).padStart(13)}`);
}
line("  ⚠ 1/(1+lnN) 在 N 大時反而超過 √N（50 場時 10.2 > 7.1）⇒ 不是好的防刷曲線。");

line("\n══════════════════════════════════════════════════════════════════");
line("  ⚠ 全部 PROPOSED / NOT FROZEN。核准前不得寫進產品碼或標為 FINAL。");
line("══════════════════════════════════════════════════════════════════");
