// ============================================================================
//  tools/retention_economy_model.mjs — Retention 經濟的 deterministic projection
//
//  這是 `check_retention_economy_v1.mjs` 的模型層。獨立成一支的理由：
//  Phase 0 的稽核、Phase 1 的三種玩家投影、Phase 3 校準前後的 before/after
//  都要用**同一個**模型跑，模型自己藏在 verifier 裡就會出現「稽核用一套假設、
//  校準用另一套」的分歧。
//
//  ── 這個模型不是重寫規則 ─────────────────────────────────────────────────
//  目標判定、計數、領取、價格、賽程供給**全部呼叫生產程式**：
//    · `retentionViewOf` / `claimObjective` / `recordMatchActivity` / …
//    · `createSeasonState` ＋ `applyAsiaCircuit`（真的賽程，不是估的）
//    · `ALL_ASSETS`（真的價格）
//  模型自己只負責一件事：**玩家每天做了什麼**（archetype 行為）。
//  那部分是假設，所以全部集中在 `ARCHETYPES`，而且會被印出來。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;

const R = await import(u("src/platform/retention/retentionState.js"));
const O = await import(u("src/platform/retention/retentionObjectives.js"));
const { deriveTime, DAYS_PER_WEEK, WEEKS_PER_SEASON } = await import(u("src/platform/economy/timeline.js"));
const { createSeasonState } = await import(u("src/platform/competition/seasonState.js"));
const { applyAsiaCircuit } = await import(u("src/platform/competition/asiaCircuit.js"));
const { ALL_ASSETS } = await import(u("src/platform/assets/assetCatalog.js"));
const { COMPETITIVE_BLOCK } = await import(u("src/platform/time/worldClock.js"));

export { R, O, deriveTime, DAYS_PER_WEEK, WEEKS_PER_SEASON, ALL_ASSETS, COMPETITIVE_BLOCK };

export const DAYS_PER_SEASON = DAYS_PER_WEEK * WEEKS_PER_SEASON;   // 7 × 12 = 84

// ── 真實賽程供給 ───────────────────────────────────────────────────────────

/**
 * 玩家一季實際被排到哪些天有正式賽。
 *
 * ⚠ 用**真的**賽季建構器，不是估算。預設含亞洲巡迴賽（`featureFlags.asiaCircuit`
 *   在正式站是 true）⇒ 14 場聯賽 ＋ 3 站 × 7 場 = 35 場。
 *   關掉巡迴的舊制只有 14 場——兩者差 2.5 倍，這正是稽核要抓的東西。
 */
export function fixtureDaysForSeason({ seasonSeed = 12345, season = 1, withCircuit = true } = {}) {
  const team = { id: "me", name: "模擬俱樂部", tag: "SIM", emoji: "◆" };
  const made = createSeasonState({ playerTeam: team, season, seasonSeed, startDay: 1, fansAtStart: 1000 });
  if (!made.ok) throw new Error(`createSeasonState 失敗：${JSON.stringify(made.errors)}`);
  let state = made.state;
  if (withCircuit) {
    const wc = applyAsiaCircuit(state, { playerTeam: team, seasonSeed });
    if (wc.ok) state = wc.state;
  }
  return Object.values(state.fixtures ?? {})
    .filter((f) => f.sideA === "me" || f.sideB === "me")
    .map((f) => Math.max(1, Math.floor(Number(f.day) || 1)))
    .sort((a, b) => a - b);
}

/** 每一週各有幾場正式賽（index 0 = 第 1 週）。 */
export function fixturesPerWeek(days) {
  const out = new Array(WEEKS_PER_SEASON).fill(0);
  for (const d of days) {
    const w = Math.floor((d - 1) / DAYS_PER_WEEK);
    if (w >= 0 && w < WEEKS_PER_SEASON) out[w] += 1;
  }
  return out;
}

// ── 型錄 ───────────────────────────────────────────────────────────────────

export const PURCHASABLE = ALL_ASSETS.filter((a) => Number.isInteger(a.priceClubPoints) && a.priceClubPoints > 0);
export const CATALOG_TOTAL = PURCHASABLE.reduce((s, a) => s + a.priceClubPoints, 0);
/** 「第一個有感資產」＝ 型錄裡最便宜的那個。 */
export const CHEAPEST = PURCHASABLE.reduce((m, a) => (a.priceClubPoints < m.priceClubPoints ? a : m), PURCHASABLE[0]);
export const CHEAPEST_COACH = PURCHASABLE.filter((a) => a.type === "coach")
  .reduce((m, a) => (a.priceClubPoints < m.priceClubPoints ? a : m), PURCHASABLE.find((a) => a.type === "coach"));

// ── 玩家原型 ───────────────────────────────────────────────────────────────
//
//  ⚠ 這一段是**唯一的假設**，其餘都是生產程式算出來的。刻意寫得保守：
//    · 不假設玩家每天機械式打滿 3 場競技容量（那是 theoretical maximum，
//      規格明文說不要拿它當基準）。
//    · 不假設玩家為了任務去做沒有產品價值的重複點擊。
//    · 名單成長按「正常經營」推進：新局只有 5 人（`data/players.js`），
//      要輪替就必須先簽人，這本身就是一個真實的門檻。

export const ARCHETYPES = Object.freeze({
  //  ⚠ 這一個**不是**產品想要的玩法，是用來量測漏洞大小的：
  //    Natural 玩家每天多打一場快速練習，看能換到多少永久 Club Points。
  practiceFarmer: Object.freeze({
    key: "practiceFarmer",
    label: "Practice Farmer（漏洞量測用，非產品目標）",
    note: "與 Natural 完全相同，只多了每天一場快速練習",
    extraCompetitivePerWeek: 0,
    practicePerDay: 1,
    trainingPerWeek: 3,
    scoutPerWeek: 1,
    rosterAt: (week, season) => (season > 1 ? 8 : Math.min(8, 5 + Math.floor(week / 4))),
    rotationEffort: 0.35,
    winRate: 0.5,
    leagueRank: 5,
    circuitPointsPerSeason: 45,
  }),
  natural: Object.freeze({
    key: "natural",
    label: "Natural Career Player",
    note: "只打系統排定的正式賽程；正常訓練與球探；不刻意刷額外比賽",
    extraCompetitivePerWeek: 0,
    trainingPerWeek: 3,
    scoutPerWeek: 1,
    //  名單：第 1 季慢慢補到 7 人，之後穩定 8 人（正常經營節奏）
    rosterAt: (week, season) => (season > 1 ? 8 : Math.min(8, 5 + Math.floor(week / 4))),
    //  願意為了輪替而換陣容的程度：0 = 永遠打同一套先發
    rotationEffort: 0.35,
    winRate: 0.5,
    leagueRank: 5,
    circuitPointsPerSeason: 45,
  }),
  engaged: Object.freeze({
    key: "engaged",
    label: "Engaged Player",
    note: "正式賽程 ＋ 適量一般競技（每週 3 場）；正常經營；會為輪替換陣容",
    extraCompetitivePerWeek: 3,
    trainingPerWeek: 4,
    scoutPerWeek: 2,
    rosterAt: (week, season) => (season > 1 ? 10 : Math.min(10, 5 + Math.floor(week / 3))),
    rotationEffort: 0.7,
    winRate: 0.55,
    leagueRank: 3,
    circuitPointsPerSeason: 85,
  }),
  high: Object.freeze({
    key: "high",
    label: "High Activity Player",
    note: "高度參與所有自然內容 ＋ 每週 7 場一般競技（≈ 隔天一場，不是每天打滿 3 場）",
    extraCompetitivePerWeek: 7,
    trainingPerWeek: 5,
    scoutPerWeek: 3,
    rosterAt: (week, season) => (season > 1 ? 12 : Math.min(12, 5 + Math.floor(week / 2))),
    rotationEffort: 1,
    winRate: 0.6,
    leagueRank: 2,
    circuitPointsPerSeason: 130,
  }),
});

// ── 決定性亂數（同一個 seed 永遠同一條軌跡）────────────────────────────────
function rng(seed) {
  let h = (Number(seed) || 1) >>> 0;
  return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 0x100000000; };
}

/**
 * 這一天要派哪五個人上場。
 *
 * ⚠ 輪替不是免費的：`rotationEffort` 是玩家**願意動陣容**的程度。
 *   0 ⇒ 永遠 b1–b5（新局只有 5 人時，這是唯一可能的陣容）。
 */
function lineupFor({ rosterSize, matchIndex, rotationEffort, rand }) {
  const ids = Array.from({ length: rosterSize }, (_, i) => `p${i + 1}`);
  if (rosterSize <= 5) return ids.slice(0, 5);
  if (rand() > rotationEffort) return ids.slice(0, 5);
  //  換 1–2 個位置給板凳（真實玩家的輪替長這樣，不是整套換掉）
  const swaps = 1 + Math.floor(rand() * 2);
  const out = ids.slice(0, 5);
  for (let i = 0; i < swaps; i++) {
    const benchIdx = 5 + Math.floor(rand() * (rosterSize - 5));
    out[(matchIndex + i) % 5] = ids[benchIdx];
  }
  return out;
}

/** 出賽名單裡的年齡。前 5 人沿用新局名單（2 名 U21），板凳一律當新秀（U21）。 */
const ageOf = (id) => ({ p1: 23, p2: 21, p3: 24, p4: 22, p5: 20 }[id] ?? 20);

/**
 * 跑一段生涯，回傳完整的經濟軌跡。
 *
 * @param {object} p
 * @param {object} p.archetype     `ARCHETYPES` 之一
 * @param {number} p.seasons       跑幾季
 * @param {object} [p.objectives]  覆寫目標定義（校準 before/after 用）
 * @param {number} [p.matchIncome] 一場正式賽的隊伍收入（元）
 */
export function projectCareer({
  archetype, seasons = 1, seed = 20260904,
  objectivesOverride = null, matchIncome = 200_000, withCircuit = true,
} = {}) {
  const A = archetype;
  const rand = rng(seed);
  let retention = R.emptyRetention();

  const perSeason = [];
  const weeklyOutcomes = [];   // 每一週：抽到哪些、完成幾個
  const dailyOutcomes = [];
  const cpByScope = { daily: 0, weekly: 0, season: 0 };
  let firstReach = { cheapest: null, coach: null, coachSet: null, identitySet: null, fullCatalog: null };
  let lifetimeAtDay = [];

  const coachTotal = PURCHASABLE.filter((a) => a.type === "coach").reduce((s, a) => s + a.priceClubPoints, 0);
  const identityTotal = PURCHASABLE.filter((a) => a.type !== "coach").reduce((s, a) => s + a.priceClubPoints, 0);

  for (let season = 1; season <= seasons; season++) {
    const fixtureDays = new Set(fixtureDaysForSeason({ season, seasonSeed: 12345 + season, withCircuit }));
    const seasonStartLifetime = retention.clubPointsLifetime;
    let matchIndex = 0;

    for (let dayOfSeason = 1; dayOfSeason <= DAYS_PER_SEASON; dayOfSeason++) {
      const absDay = (season - 1) * DAYS_PER_SEASON + dayOfSeason;
      const t = deriveTime(absDay);
      const coords = R.coordsOf({ day: absDay, week: t.week, year: season });
      const weekOfSeason = Math.floor((dayOfSeason - 1) / DAYS_PER_WEEK) + 1;
      const rosterSize = A.rosterAt(weekOfSeason, season);

      //  ① 正式賽（賽程帶到的，玩家不能選）
      if (fixtureDays.has(dayOfSeason)) {
        const ids = lineupFor({ rosterSize, matchIndex: matchIndex++, rotationEffort: A.rotationEffort, rand });
        retention = R.recordMatchActivity(retention, {
          matchSource: "official",
          win: rand() < A.winRate,
          income: matchIncome,
          appeared: ids.map((id) => ({ id, age: ageOf(id) })),
        }, coords);
      }

      //  ② 一般競技（玩家自己去打的）。攤平到一週裡，不擠在同一天打滿容量。
      const extraToday = (() => {
        const perWeek = A.extraCompetitivePerWeek;
        if (perWeek <= 0) return 0;
        const dow = ((dayOfSeason - 1) % DAYS_PER_WEEK) + 1;
        const base = Math.floor(perWeek / DAYS_PER_WEEK);
        const remainder = perWeek % DAYS_PER_WEEK;
        const n = base + (dow <= remainder ? 1 : 0);
        return Math.min(n, COMPETITIVE_BLOCK.matchesPerDay);
      })();
      for (let i = 0; i < extraToday; i++) {
        const ids = lineupFor({ rosterSize, matchIndex: matchIndex++, rotationEffort: A.rotationEffort, rand });
        retention = R.recordMatchActivity(retention, {
          matchSource: "competitive",
          win: rand() < A.winRate,
          income: Math.round(matchIncome * 0.6),
          appeared: ids.map((id) => ({ id, age: ageOf(id) })),
        }, coords);
      }

      //  ②b 快速練習（只有漏洞量測的 archetype 會做）
      for (let i = 0; i < (A.practicePerDay ?? 0); i++) {
        const ids = lineupFor({ rosterSize, matchIndex: matchIndex++, rotationEffort: A.rotationEffort, rand });
        retention = R.recordMatchActivity(retention, {
          matchSource: "practice", win: rand() < A.winRate, income: 0,
          appeared: ids.map((id) => ({ id, age: ageOf(id) })),
        }, coords);
      }

      //  ③ 經營行為（訓練消耗一個世界日 ⇒ 一天最多一次）
      const dow = ((dayOfSeason - 1) % DAYS_PER_WEEK) + 1;
      if (dow <= A.trainingPerWeek) retention = R.recordTrainingActivity(retention, coords);
      if (dow <= A.scoutPerWeek) retention = R.recordScoutActivity(retention, coords);

      //  ④ 領取（玩家看到亮了就領；領取是手動的，但沒有人會不領）
      const view = viewOf(retention, coords, A, season, objectivesOverride);
      for (const g of view.groups) {
        for (const item of g.items) {
          if (!item.claimable) continue;
          const r = R.claimObjective(retention, item.id, view);
          if (r.ok) { retention = r.retention; cpByScope[g.scope] += r.gained; }
        }
      }
      //  日目標：在**當天結束**時看完成了幾個（領取已經在上面做完）
      {
        const dv = viewOf(retention, coords, A, season, objectivesOverride);
        dailyOutcomes.push({
          done: dv.daily.items.filter((i) => i.done).length,
          total: dv.daily.items.length,
          items: dv.daily.items.map((i) => ({ defId: i.defId, done: i.done, progress: i.rawProgress, target: i.target })),
          hasFixture: fixtureDays.has(dayOfSeason),
        });
      }

      //  ⑤ 里程碑
      const life = retention.clubPointsLifetime;
      lifetimeAtDay.push(life);
      if (firstReach.cheapest === null && life >= CHEAPEST.priceClubPoints) firstReach.cheapest = absDay;
      if (firstReach.coach === null && life >= CHEAPEST_COACH.priceClubPoints) firstReach.coach = absDay;
      if (firstReach.coachSet === null && life >= coachTotal) firstReach.coachSet = absDay;
      if (firstReach.identitySet === null && life >= identityTotal) firstReach.identitySet = absDay;
      if (firstReach.fullCatalog === null && life >= CATALOG_TOTAL) firstReach.fullCatalog = absDay;

      //  ⑥ 週結：記錄這一週抽到什麼、完成幾個（在該週最後一天結算）
      if (dow === DAYS_PER_WEEK) {
        const wv = viewOf(retention, coords, A, season, objectivesOverride);
        weeklyOutcomes.push({
          season, week: weekOfSeason,
          items: wv.weekly.items.map((i) => ({ defId: i.defId, done: i.done, progress: i.rawProgress, target: i.target })),
          done: wv.weekly.items.filter((i) => i.done).length,
          total: wv.weekly.items.length,
        });
      }
    }

    perSeason.push({
      season,
      cpEarned: retention.clubPointsLifetime - seasonStartLifetime,
      cpLifetime: retention.clubPointsLifetime,
    });
  }

  const weeklyDone = weeklyOutcomes.reduce((s, w) => s + w.done, 0);
  const weeklyTotal = weeklyOutcomes.reduce((s, w) => s + w.total, 0);
  const dailyDone = dailyOutcomes.reduce((s, d) => s + d.done, 0);
  const dailyTotal = dailyOutcomes.reduce((s, d) => s + d.total, 0);
  const withFx = dailyOutcomes.filter((d) => d.hasFixture);
  const noFx = dailyOutcomes.filter((d) => !d.hasFixture);
  const rateOf = (rows) => {
    const t = rows.reduce((s, d) => s + d.total, 0);
    return t ? rows.reduce((s, d) => s + d.done, 0) / t : 0;
  };
  const dailyByDef = {};
  for (const d of dailyOutcomes) {
    for (const it of d.items) {
      const b = dailyByDef[it.defId] ?? (dailyByDef[it.defId] = { drawn: 0, done: 0, target: it.target });
      b.drawn += 1; b.done += it.done ? 1 : 0;
    }
  }
  for (const [, b] of Object.entries(dailyByDef)) b.rate = b.drawn ? b.done / b.drawn : 0;

  //  逐個目標的完成率（校準要看的是「哪一個」擋住，不是總分）
  const byDef = {};
  for (const w of weeklyOutcomes) {
    for (const it of w.items) {
      const b = byDef[it.defId] ?? (byDef[it.defId] = { drawn: 0, done: 0, target: it.target, progressSum: 0 });
      b.drawn += 1; b.done += it.done ? 1 : 0; b.progressSum += it.progress;
    }
  }
  for (const [, b] of Object.entries(byDef)) {
    b.rate = b.drawn ? b.done / b.drawn : 0;
    b.avgProgress = b.drawn ? b.progressSum / b.drawn : 0;
  }

  const days = (d) => (d === null ? null : d);
  return {
    archetype: A.key,
    seasons,
    perSeason,
    cpTotal: retention.clubPointsLifetime,
    cpPerSeason: Math.round(retention.clubPointsLifetime / seasons),
    cpFirstSeason: perSeason[0]?.cpEarned ?? 0,
    cpFirstWeek: lifetimeAtDay[DAYS_PER_WEEK - 1] ?? 0,
    weeklyCompletion: weeklyTotal ? weeklyDone / weeklyTotal : 0,
    weeklyByDef: byDef,
    dailyCompletion: dailyTotal ? dailyDone / dailyTotal : 0,
    dailyCompletionOnFixtureDays: rateOf(withFx),
    dailyCompletionOnQuietDays: rateOf(noFx),
    dailyByDef,
    cpByScope: { ...cpByScope },
    cpByScopePerSeason: {
      daily: Math.round(cpByScope.daily / seasons),
      weekly: Math.round(cpByScope.weekly / seasons),
      season: Math.round(cpByScope.season / seasons),
    },
    firstReach: {
      cheapest: days(firstReach.cheapest),
      coach: days(firstReach.coach),
      coachSet: days(firstReach.coachSet),
      identitySet: days(firstReach.identitySet),
      fullCatalog: days(firstReach.fullCatalog),
    },
    retention,
  };
}

function viewOf(retention, coords, A, season, objectivesOverride) {
  //  賽季目標需要名次與巡迴積分。它們**不是**靠刷比賽得到的，
  //  所以由 archetype 直接給，並且照賽季進度線性逼近（不是一開賽就滿）。
  const progress = Math.min(1, ((coords.day - 1) % DAYS_PER_SEASON + 1) / DAYS_PER_SEASON);
  return R.retentionViewOf(retention, {
    coords, teamId: "me",
    leagueRank: A.leagueRank,
    circuitPoints: Math.round(A.circuitPointsPerSeason * progress),
    ...(objectivesOverride ? { objectivesOverride } : {}),
  });
}

/** 天數 → 「第 N 週」的可讀字串。 */
export const asWeeks = (d) => (d === null ? "未達成" : `第 ${Math.ceil(d / DAYS_PER_WEEK)} 週（第 ${d} 天）`);
/** 天數 → 「第 N 季」的可讀字串。 */
export const asSeasons = (d) => (d === null ? "未達成"
  : `${(d / DAYS_PER_SEASON).toFixed(1)} 季（第 ${d} 天）`);
