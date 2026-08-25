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
const pcgm = await imp("src/platform/progress/careerGrowth.js");

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
//  V0B 之後新秀帶著 `archetype` 欄位 ⇒ 直接照原型抽，不再用年齡／潛力區間去猜。
//  （用區間猜的舊版在 V0B 改變分佈之後只挑得到一個原型，整張表等於空的。）
const ARCHETYPES = [
  pickBy((p) => p.archetype === "standard" && p.age >= 19, "一般新人 19–21歲"),
  pickBy((p) => p.archetype === "developmental", "養成型"),
  pickBy((p) => p.archetype === "readymade", "即戰力"),
  pickBy((p) => p.archetype === "superstar", "超新星"),
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

// ── ⑦ V0A：PCGM 係數本身（與 prospect pool 無關）─────────────────────────
line("\n【⑦ V0A：PCGM 係數本身（只看公式，不看新秀池）】");
line("   age  年齡係數   learning  學習係數   合成係數");
for (const [age, lrn] of [[18, 90], [20, 80], [24, 70], [28, 60], [32, 50], [36, 40]]) {
  const b = pcgm.careerGrowthBreakdown({ player: { age, stats: { learning: lrn } } });
  line(`  ${String(age).padStart(4)}  ${String(b.age).padStart(7)}   ${String(lrn).padStart(7)}  ${String(b.learning).padStart(8)}   ${Math.round(b.total * 1000) / 1000}`);
}
line(`  ⇒ 年齡相對差距：18 歲 vs 36 歲 = ${Math.round(pcgm.ageFactor(18) / pcgm.ageFactor(36) * 100) / 100}×`);
line(`  ⇒ learning 相對差距：90 vs 40 = ${Math.round(pcgm.learningFactor(90) / pcgm.learningFactor(40) * 100) / 100}×`);
line("  ⚠ sourceBase 目前四個來源**一律 1.0**（見 careerGrowth.js 的 PCGM_PARAMS 註解）：");
line("     applyMatchProgress 拿不到 MatchOrigin，分不出聯賽與自由對戰 ⇒");
line("     現在調高 formal 等於自由對戰一起調高，會直接製造刷分 exploit。");

// ── ⑧ V0A：用真實 prospect pool 跑一個 Career Year ────────────────────────
line("\n【⑧ V0A：接上 PCGM 之後，實際跑一個 Career Year（12 週）】");
line("  選手                  成長空間   年成長   其中訓練   其中比賽");
for (const a of ARCHETYPES) {
  const s1 = simYear(a, 12);
  line(`  ${a.name.padEnd(20)}  ${String(r1(a.potential - a._start)).padStart(6)} 點  `
    + `${String(s1.total).padStart(6)}   ${String(s1.fromTraining).padStart(7)}   ${String(s1.fromFormal).padStart(7)}`);
}
line("  ⚠ **Expected pending V0B**：新秀成長空間中位仍只有 8.4 點（TD-32 未修）。");
line("     這裡的年成長仍然關不掉潛力空間——那是 **V0B 的問題，不是 V0A**。");
line("     V0A 只負責讓成長**認年齡與學習能力**；空間多大由 V0B 決定。");
line("  ⚠ **潛力漸近線（TD-33）也未修**：floorRate 會改變 Training v1.1 的輸出值，");
line("     屬 Foundation calibration，不在 V0A 範圍。");

// ── ⑨ V0A + V0B joint calibration：Year 0–4 ───────────────────────────────
//  ⚠ metric 口徑（不得混用分母）：
//     Year 0 = **StartingCore**（定位 5 項主能力平均，metric A）
//     Year 1–4 = **MainStat 潛力空間關閉率**（metric E / C）
line("\n【⑨ V0A + V0B joint calibration：Year 0–4】");
line("  Year 0 = StartingCore（metric A）｜Year 1–4 = MainStat 空間關閉率（metric E/C）");
line("  原型                起始  空間   Y1     Y2     Y3     Y4");
for (const a of ARCHETYPES) {
  let p = { ...a, stats: { ...a.stats } };
  const cells = [];
  for (let y = 1; y <= 4; y++) {
    const s1 = simYear(p, 12);
    p = { ...s1.player, _start: a._start, age: p.age + 1 };
    cells.push(pct(closed(p)));
  }
  line(`  ${a.name.padEnd(18)}  ${String(r1(a._start)).padStart(4)}  ${String(r1(a.potential - a._start)).padStart(4)}  `
    + cells.map((c) => c.padStart(6)).join(" "));
}
line("  產品目標：Y1 明顯進步可進輪換｜Y2 左右有機會穩定主力｜Y3–4 好選手接近成熟");

// ── ⑩ 招募等級對新人池的影響（低 / 中 / 高）───────────────────────────────
line("\n【⑩ 招募等級（球探網絡）對新人池的影響】");
line("  rank  已知(lv≥1)  完全揭露(lv2)  平均起始  平均空間  平均潛力");
for (const rank of [0, 1, 3]) {
  const pool2 = [7, 46, 99].flatMap((s) => recruit.genProspects(s, { scoutNetworkRank: rank }));
  const known = pool2.filter((p) => p.scoutLv >= 1).length / pool2.length;
  const full = pool2.filter((p) => p.scoutLv >= 2).length / pool2.length;
  const core = pool2.reduce((s, p) => s + avgMain(p), 0) / pool2.length;
  const space = pool2.reduce((s, p) => s + (p.potential - avgMain(p)), 0) / pool2.length;
  const pot = pool2.reduce((s, p) => s + p.potential, 0) / pool2.length;
  line(`  ${String(rank).padStart(4)}  ${pct(known).padStart(9)}  ${pct(full).padStart(12)}  `
    + `${String(r1(core)).padStart(8)}  ${String(r1(space)).padStart(8)}  ${String(r1(pot)).padStart(8)}`);
}
line("  ⇒ **起始／空間／潛力三欄在三個等級完全相同**——招募等級只改變資訊，不讓新人變強。");
line("  ⇒ 提高的是「發現優質人才的機率與判斷可靠度」（已知比例），而且永遠不會全開。");

line("\n══════════════════════════════════════════════════════════════════");
line("  ⚠ 全部 PROPOSED / NOT FROZEN。核准前不得寫進產品碼或標為 FINAL。");
line("══════════════════════════════════════════════════════════════════");
