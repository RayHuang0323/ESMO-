// ============================================================================
//  platform/competition/scheduleGenerator.js — 賽程產生器（Milestone Q2a）
//
//  ── 這一支做什麼 ──────────────────────────────────────────────────────────
//  賽季開始時，把一個 Stage 的參賽者排成一整季的 Fixture。
//  Q2a 只實作 `round_robin`（單／雙循環），其餘賽制是第二階段的事。
//
//  ── 決定性 ────────────────────────────────────────────────────────────────
//  種子一律來自 `identity/teamIdentity.seedForSeason(meta.seasonSeed, season)`。
//  **不得直接用 `meta.seasonSeed`**——那會讓每個賽季排出完全一樣的賽程。
//  無 `Math.random()`、無 `Date.now()` ⇒ 同一賽季重排逐場相同，伺服器可重播。
//
//  ── 環形演算法（circle method）────────────────────────────────────────────
//  固定第一支隊伍，其餘輪轉。n 支隊伍 ⇒ 每循環 n−1 輪、每輪 n/2 場。
//  8 隊雙循環 ⇒ 14 輪 × 4 場 = **56 場**，每隊 14 場。
//
//  ── 主客場對稱 ────────────────────────────────────────────────────────────
//  第二循環把第一循環的每一場主客互換 ⇒ **每一對隊伍恰好一次互為主客**，
//  且每隊主場數 = 客場數 = 7。這是本檔的核心不變式，verifier 逐項驗。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import {
  STAGE_VERSION, STAGE_FORMATS, IMPLEMENTED_FORMATS, createFixture, stageFormatLabel,
} from "../contracts/competition.js";

/** 決定性 LCG（與 `data/recruitPool.js` / `competition/aiTeams.js` 同一套）。 */
const mkRng = (s) => { let x = (s >>> 0) || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };

/** 決定性 Fisher–Yates 洗牌（不改動輸入陣列）。 */
function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 一個循環的配對（環形演算法）。
 *
 * @param {Array<string>} ids 參賽者 id（長度必須是偶數）
 * @returns {Array<Array<[string,string]>>} rounds[roundIndex] = [[home, away], ...]
 */
function roundRobinLeg(ids) {
  const n = ids.length;
  const rounds = [];
  //  固定第一支，其餘輪轉
  const fixed = ids[0];
  let rot = ids.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const order = [fixed, ...rot];
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      //  讓固定隊伍不會每輪都是主場：奇數輪把第一組互換
      pairs.push(i === 0 && r % 2 === 1 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    //  向右輪轉一位
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  return rounds;
}

/**
 * 把輪次平均分配到賽季日區間。
 * 例：from=1, to=84, rounds=14 ⇒ 第 1 輪第 6 天、…、第 14 輪第 84 天（每 6 天一輪）。
 */
export function dayForRound(round, totalRounds, dayRange = { from: 1, to: 84 }) {
  const span = dayRange.to - dayRange.from + 1;
  return dayRange.from - 1 + Math.round((round * span) / totalRounds);
}

/**
 * 產生一個賽段的完整賽程。
 *
 * @param {object} p
 * @param {object} p.stage        Stage.v1
 * @param {number} p.seed         **必須**是 seedForSeason() 的輸出，不是 meta.seasonSeed
 * @param {object} [p.matchFormat] 項目專屬設定（原樣掛到每一場，共用層不解讀）
 * @returns {{ok:boolean, fixtures:Array, errors:Array, summary:object|null}}
 */
export function generateSchedule({ stage, seed, matchFormat = null } = {}) {
  const errors = [];
  if (!stage || stage.schema !== STAGE_VERSION) {
    return { ok: false, fixtures: [], summary: null, errors: [{ code: "stage", message: "賽段無效，無法產生賽程" }] };
  }
  if (!IMPLEMENTED_FORMATS.includes(stage.format)) {
    return {
      ok: false, fixtures: [], summary: null,
      errors: [{ code: "format_not_implemented", message: `賽制「${stageFormatLabel(stage.format)}」尚未實作賽程產生（Q2a 只做循環賽）` }],
    };
  }
  if (typeof seed !== "number" || !Number.isFinite(seed)) {
    errors.push({ code: "seed", message: "缺少賽程種子（必須由 seedForSeason 派生）" });
  }
  const ids = stage.participants.map((p) => p.id);
  if (ids.length % 2 !== 0) {
    errors.push({ code: "odd_participants", message: "循環賽目前不支援奇數隊（需要輪空機制）" });
  }
  if (errors.length) return { ok: false, fixtures: [], summary: null, errors };

  //  ① 決定性洗牌：同一賽季固定，不同賽季不同
  const order = shuffled(ids, mkRng(seed));
  //  ② 第一循環
  const leg1 = roundRobinLeg(order);
  const roundsPerLeg = leg1.length;
  const totalRounds = roundsPerLeg * stage.legs;

  const fixtures = [];
  for (let leg = 0; leg < stage.legs; leg++) {
    for (let r = 0; r < roundsPerLeg; r++) {
      const round = leg * roundsPerLeg + r + 1;
      const day = dayForRound(round, totalRounds, stage.dayRange);
      for (const [home, away] of leg1[r]) {
        //  第二循環主客互換 ⇒ 每一對恰好互為主客一次
        const [sideA, sideB] = leg === 0 ? [home, away] : [away, home];
        const made = createFixture({ stage, round, day, sideA, sideB, matchFormat });
        if (!made.ok) return { ok: false, fixtures: [], summary: null, errors: made.errors };
        fixtures.push(made.fixture);
      }
    }
  }

  //  ③ 決定性排序：輪次 → 場次 id（同 seed 重跑逐場完全一致，含順序）
  fixtures.sort((a, b) => (a.round - b.round) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    ok: true,
    errors: [],
    fixtures,
    summary: {
      teams: ids.length,
      legs: stage.legs,
      rounds: totalRounds,
      matchesPerRound: ids.length / 2,
      total: fixtures.length,
      perTeam: totalRounds,
      dayRange: { ...stage.dayRange },
    },
  };
}

/** 某隊在這份賽程裡的所有場次（依輪次排序）。 */
export function fixturesOf(fixtures, teamId) {
  return (fixtures ?? []).filter((f) => f.sideA === teamId || f.sideB === teamId);
}

/** 玩家不參與的場次（Q2b 的快速模擬對象）。 */
export function aiOnlyFixtures(fixtures, playerTeamId) {
  return (fixtures ?? []).filter((f) => f.sideA !== playerTeamId && f.sideB !== playerTeamId);
}

/** 某一天的所有場次。 */
export function fixturesOnDay(fixtures, day) {
  return (fixtures ?? []).filter((f) => f.day === day);
}

/**
 * 主客場統計（verifier 與畫面共用；不另算一套）。
 * @returns {Map<string,{home:number, away:number, total:number}>}
 */
export function homeAwayTally(fixtures) {
  const tally = new Map();
  const bump = (id, key) => {
    const t = tally.get(id) ?? { home: 0, away: 0, total: 0 };
    t[key]++; t.total++;
    tally.set(id, t);
  };
  for (const f of fixtures ?? []) { bump(f.sideA, "home"); bump(f.sideB, "away"); }
  return tally;
}

export { STAGE_FORMATS };
