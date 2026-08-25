// ============================================================================
//  tools/lib/careerSim.mjs — Career Year 模擬器（Foundation Calibration 共用）
//
//  ── 為什麼要獨立一份 ─────────────────────────────────────────────────────
//  `check_foundation_calibration.mjs`（gate）與 `foundation_calibration.mjs`
//  （量測報告）問的是同一件事：「這組參數跑出來的生涯長什麼樣」。
//  兩邊各寫一份模擬器 = 兩套真相，報告綠、gate 紅（或反過來）時無從判斷誰對。
//  ⇒ 本檔是**唯一**的模擬器，兩邊都 import 它。
//
//  ── 這支模擬的是什麼 ─────────────────────────────────────────────────────
//  一個 Career Year（`SEASON_DAYS` 天）內，一名選手身上會發生的永久能力成長：
//    · **正式季賽**：賽程排定的 `PLAYER_FIXTURES` 場 ⇒ XP ⇒ 升級 ⇒ `applyLevelGrowth`
//    · **競技比賽**：玩家自己排隊的場次（可選）⇒ 同一條路徑，但來源不同
//    · **訓練課程**：`calculateTrainingResult`，受體力與「下一場比賽之前塞不塞得下」限制
//
//  ⚠ **一律呼叫主幹真正在跑的那幾個函式**（`calculateTrainingResult` /
//    `applyLevelGrowth` / `levelFromTotalXp` / `dayForRound` / `CONDITION`）。
//    本檔不複製任何成長公式——複製一份就會與產品碼漂移，量測就失去意義。
//
//  ⚠ 這是**近似**，不是重播真實存檔。已知的簡化：
//    · 勝率固定（預設 0.5），不模擬對手強度
//    · 一年份的升級在年底一次結算，不逐場結算
//      （來源比例仍照該來源的 XP 佔比分配 ⇒ 分帳正確，時點不精確）
//    · 體力只走「出賽扣、訓練扣、其餘 +restPerDay」，不含 streak 加乘
//  這些簡化對「來源比例」與「Year 0–4 關閉率」的結論不敏感，
//  但**不可**拿本檔的絕對數字當存檔預期值。
// ============================================================================
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const load = async (root, p) => import(pathToFileURL(resolve(root, p)).href);

/** 載入模擬需要的主幹模組。root = repo 根目錄。 */
export async function loadWorld(root) {
  const [playerModel, levelGrowth, playerLevel, training, schedule, regular, condition, recruit, career, rewards, space] =
    await Promise.all([
      load(root, "src/data/playerModel.js"),
      load(root, "src/platform/progress/levelGrowth.js"),
      load(root, "src/platform/progress/playerLevel.js"),
      load(root, "src/data/trainingCalculator.js"),
      load(root, "src/platform/competition/scheduleGenerator.js"),
      load(root, "src/platform/competition/regularSeason.js"),
      load(root, "src/platform/condition/playerCondition.js"),
      load(root, "src/data/recruitPool.js"),
      load(root, "src/platform/progress/careerGrowth.js"),
      load(root, "src/platform/progress/rewardFormulas.js"),
      load(root, "src/platform/progress/potentialSpace.js"),
    ]);
  return { playerModel, levelGrowth, playerLevel, training, schedule, regular, condition, recruit, career, rewards, space };
}

/** 玩家一個賽季實際打幾場正式賽（賽程決定，玩家改不了 ⇒ 這是防刷的結構性上限）。 */
export const PLAYER_FIXTURES = 14;

const r1 = (v) => Math.round(v * 10) / 10;
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 這名選手的 5 項定位主能力（沒有定位 ⇒ 取前 5 項，與 levelGrowth 同一套規則）。 */
export const mainKeysOf = (W, p) =>
  W.levelGrowth.growthKeysFor(p) ?? W.playerModel.STAT_DEF.map((s) => s.key).slice(0, 5);

/** 主能力平均值。產品驗收看的是這個，不是全 16 項平均。 */
export const mainAvgOf = (W, p) => {
  const keys = mainKeysOf(W, p);
  return keys.reduce((s, k) => s + (p.stats?.[k] ?? 50), 0) / keys.length;
};

/**
 * 潛力空間關閉率：0 = 剛入行，1 = 完全開發完。
 *
 * ⚠ 刻意**不用**「現值 / 潛力」——那個比值一入行就有 70%+，看不出成長。
 *   也刻意不用「距離潛力還剩幾點」當成熟判準：線性收斂的尾巴是漸近線，
 *   會得到「30 年還沒成熟」這種被數學假象誤導的結論（見 TD-33）。
 */
export const closureOf = (W, start, now) => {
  const space = start.potential - mainAvgOf(W, start);
  if (space <= 0) return 1;
  return clampN((mainAvgOf(W, now) - mainAvgOf(W, start)) / space, 0, 1);
};

/**
 * 跑一個 Career Year。
 *
 * @param {object} W                 loadWorld() 的結果
 * @param {object} p0                選手（需要 stats / potential / age / role / energy / xp）
 * @param {object} [opts]
 * @param {number} [opts.winRate]        勝率（影響 XP，不影響訓練）
 * @param {number} [opts.trainRatio]     非比賽日裡有多少比例真的排課
 * @param {number} [opts.competitive]    這一年想打幾場競技比賽（體力會自己擋下來）
 * @param {number} [opts.competitiveMinEnergy] 體力低於此就不排競技賽。
 *   ⚠ 這個門檻對結果影響**很大**，而且是真實的產品機制，不是模擬器的旋鈕：
 *     `conditionEfficiency` 會用體力去乘**所有**訓練成長，所以連打幾場把體力
 *     打到 28 之後，接下來整年的訓練都在打折。貪心地一開年就連打（門檻 = 最低
 *     可出賽線）會誇大競技賽的傷害；理性玩家會等體力回滿再打。
 *     預設用「精神飽滿」線（70），要模擬無腦刷才調到最低。
 * @param {"focused"|"any"} [opts.style] 排課策略：只練定位主能力／有什麼練什麼
 * @returns {{player:object, bySource:{training:number,official:number,competitive:number},
 *            competitivePlayed:number, levels:number}}
 */
export function simulateYear(W, p0, opts = {}) {
  const { winRate = 0.5, trainRatio = 0.8, competitive = 0, style = "focused" } = opts;
  const DAYS = W.regular.SEASON_DAYS;
  const COND = W.condition.CONDITION;
  const compMinEnergy = opts.competitiveMinEnergy ?? 70;
  const courses = W.playerModel.TRAINING_COURSES.filter((c) => c.id !== "rest");
  const fixtureDays = new Set(Array.from({ length: PLAYER_FIXTURES }, (_, i) =>
    W.schedule.dayForRound(i + 1, PLAYER_FIXTURES, { from: 1, to: DAYS })));

  const p = { ...p0, stats: { ...p0.stats } };
  const bySource = { training: 0, official: 0, competitive: 0 };

  //  ── 一年的日子 ────────────────────────────────────────────────────────
  let day = 1, tick = 0, compLeft = Math.max(0, competitive), compPlayed = 0;
  const nextFixture = (d) => { for (let x = d; x <= DAYS; x++) if (fixtureDays.has(x)) return x; return DAYS + 1; };
  while (day <= DAYS) {
    if (fixtureDays.has(day)) {                       // 正式賽日：只出賽
      p.energy = Math.max(0, (p.energy ?? 100) - COND.matchEnergyCost);
      day += 1; continue;
    }
    if (compLeft > 0 && (p.energy ?? 100) >= Math.max(compMinEnergy, COND.matchEnergyCost + COND.unfitBelow)) {
      p.energy = Math.max(0, p.energy - COND.matchEnergyCost);
      compLeft -= 1; compPlayed += 1; day += 1; continue;
    }
    const window = nextFixture(day) - day;            // 課程必須整段塞得進下一場之前
    const wantTrain = (tick++ % 10) < Math.round(trainRatio * 10);
    const mk = new Set(mainKeysOf(W, p));
    const ranked = style === "focused"
      ? [...courses].sort((a, b) => b.stats.filter((k) => mk.has(k)).length - a.stats.filter((k) => mk.has(k)).length)
          .filter((c) => c.stats.some((k) => mk.has(k)))
      : courses;
    const course = ranked.find((c) => c.hours <= window && p.energy >= c.energyCost)
      ?? courses.find((c) => c.hours <= window && p.energy >= c.energyCost);
    if (wantTrain && course) {
      const res = W.training.calculateTrainingResult(p, course);
      if (res.completed) {
        for (const [k, ch] of Object.entries(res.statChanges)) p.stats[k] = ch.after;
        bySource.training += res.totalGain;
        p.energy = res.energyAfter;
      }
      day += course.hours;
    } else {
      p.energy = Math.min(100, (p.energy ?? 100) + COND.restPerDay);
      day += 1;
    }
  }

  //  ── 比賽 XP → 升級 → 能力成長 ─────────────────────────────────────────
  //  正式賽的場次由賽程決定（刷不了）；競技賽由玩家自己排（體力是唯一天花板）。
  const WIN = W.rewards.BASE_XP_WIN, LOSS = W.rewards.BASE_XP_LOSS;   // 不自己寫 50 / 20
  const wins = Math.round(PLAYER_FIXTURES * winRate);
  const xpOfficial = wins * WIN + (PLAYER_FIXTURES - wins) * LOSS;
  const xpCompetitive = Math.round(compPlayed * (WIN + LOSS) / 2);
  const lvBefore = W.playerLevel.levelFromTotalXp(p.xp ?? 0);
  p.xp = (p.xp ?? 0) + xpOfficial + xpCompetitive;
  const lvAfter = W.playerLevel.levelFromTotalXp(p.xp);
  const levels = Math.max(0, lvAfter - lvBefore);
  const totalXp = xpOfficial + xpCompetitive;
  const lvOfficial = totalXp > 0 ? Math.round(levels * (xpOfficial / totalXp)) : levels;
  const lvCompetitive = levels - lvOfficial;

  const S = W.career.GROWTH_SOURCES;
  for (const [levelCount, source, bucket] of [
    [lvOfficial, S.official, "official"],
    [lvCompetitive, S.competitive, "competitive"],
  ]) {
    if (levelCount <= 0) continue;
    const g = W.levelGrowth.applyLevelGrowth(p, levelCount, { source });
    p.stats = g.stats;
    bySource[bucket] += g.total;
  }
  p.lv = lvAfter;

  for (const k of Object.keys(bySource)) bySource[k] = r1(bySource[k]);
  return { player: p, bySource, competitivePlayed: compPlayed, levels };
}

/**
 * 跑一整段生涯。**年齡每年 +1 只存在於本模擬器內**——
 * 產品的 Career Clock / aging 尚未實作，這裡加一歲是為了讓年齡係數
 * 在多年尺度上真的發揮作用，不是宣稱主幹已經會長年齡。
 */
export function simulateCareer(W, p0, years, opts = {}) {
  const start = { ...p0, stats: { ...p0.stats } };
  let p = { ...p0, stats: { ...p0.stats } };
  const rows = [];
  const total = { training: 0, official: 0, competitive: 0 };
  let competitivePlayed = 0;
  for (let y = 1; y <= years; y++) {
    const s = simulateYear(W, p, opts);
    p = { ...s.player, age: (p.age ?? 20) + 1 };
    for (const k of Object.keys(total)) total[k] += s.bySource[k];
    competitivePlayed += s.competitivePlayed;
    rows.push({
      year: y, age: p.age,
      closure: closureOf(W, start, p),
      mainAvg: r1(mainAvgOf(W, p)),
      levels: s.levels,
    });
  }
  return {
    rows, total, competitivePlayed,
    startMain: r1(mainAvgOf(W, start)),
    space: r1(start.potential - mainAvgOf(W, start)),
  };
}

/** 大樣本新秀池。多個 seed 是必要的——超新星只佔約 5%，單一 40 人池經常抽不到。 */
export const POOL_SEEDS = Object.freeze([7, 46, 99, 2026, 4242, 555, 808, 1234, 31337, 64]);
export function prospectPool(W, seeds = POOL_SEEDS) {
  return seeds.flatMap((s) => W.recruit.genProspects(s))
    .map((p) => ({ ...p, stats: { ...p.stats }, energy: 100, lv: 1, xp: 0 }));
}

/** 合成選手：要單獨看某一個變數（年齡／learning／potential）時用，避免被池子的相關性干擾。 */
export function syntheticPlayer(W, { age = 20, learning = 70, potential = 80, start = 60, role = "中路" } = {}) {
  const stats = Object.fromEntries(W.playerModel.STAT_DEF.map((s) => [s.key, start]));
  stats.learning = learning;
  return { id: "sim", role, age, potential, energy: 100, lv: 1, xp: 0, stats };
}

export const round1 = r1;
