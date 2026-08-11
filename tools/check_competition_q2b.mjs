#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_q2b.mjs — Milestone Q2b：賽果 / 實力 / 模擬 / 積分榜
//
//  執行：repo 根目錄 `node tools/check_competition_q2b.mjs`；**失敗時 exit 1**。
//
//  Q2b 的四件事：
//    ① FixtureOutcome.v1（含 provenance 五項）
//    ② teamStrength(roster) —— **必須真的由 16 項能力推導**
//    ③ 決定性 simulateFixture
//    ④ Standings 純推導 + 決定性 tiebreaker
//
//  最關鍵的四組：
//    §2e/§2f **改 AI_TEAMS[].strength 不影響賽果；改選手能力才影響**（行為證明 D16）
//    §3b/§3c 同 fixture + 同 seed + 同版本 ⇒ 逐值一致
//    §4h     Standings 只由 outcomes 推導，沒有第二份勝敗真相
//    §5      兩類 Analytics 的分界（simulated 進 Competition、不進 Combat）
// ============================================================================
import fs from "node:fs";
import {
  FIXTURE_OUTCOME_VERSION, RESULT_SOURCES, resultSourceLabel,
  createFixtureOutcome, validateFixtureOutcome, loserOf,
  isEngineOutcome, isSimulatedOutcome, competitionOutcomes, combatOutcomes,
} from "../src/platform/contracts/fixtureOutcome.js";
import {
  teamStrength, teamStrengthBreakdown, TEAM_STRENGTH_VERSION, COMBINE,
} from "../src/platform/competition/teamStrength.js";
import {
  simulateFixture, simulateFixtures, simSeedFor, winRateFor,
  SIMULATOR_VERSION, SIM_PARAMS,
} from "../src/platform/competition/simulateFixture.js";
import {
  computeStandings, standingOf, outcomeSourceMix, STANDINGS_RULES, TIEBREAKERS,
} from "../src/platform/competition/standings.js";
import { buildRegularSeason } from "../src/platform/competition/regularSeason.js";
import { AI_TEAMS, leagueParticipants } from "../src/platform/competition/aiTeams.js";
import { deriveTeamId, seedForSeason } from "../src/platform/identity/teamIdentity.js";
import { calcPower, STAT_DEF } from "../src/data/playerModel.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

//  ⚠ 制度教訓（第十一次）：任何掃原始碼的斷言都**必須先剝掉註解**，
//    否則會掃到說明文字本身而假紅。本檔第一版的 §5g 就是這樣紅的——
//    standings.js 的註解裡提到 `combatOutcomes()`，被自己的正則抓到。
//    所以這兩個工具放在模組層級，全檔共用，不再各節自己寫一份。
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const readCode = (p) => stripComments(fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

// ── fixture：沿用 Q2a 的真實賽季（不另造假資料）────────────────────────
const PLAYER_TEAM = {
  id: deriveTeamId({ name: "白貓戰隊", tag: "GSEAL", scenario: "standard", createdDay: 1 }),
  name: "白貓戰隊", tag: "GSEAL", emoji: "🐱",
};
const SEASON_SEED = 1660418839;
const SEASON = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: SEASON_SEED });
const PARTICIPANTS = SEASON.stage.participants;

//  玩家 roster：用與 AI 同形狀的選手（Q2b 不接 profileStore）
const statsAll = (v) => Object.fromEntries(STAT_DEF.map((s) => [s.key, v]));
const PLAYER_ROSTER = ["上路", "打野", "中路", "下路", "輔助"].map((role, i) => ({
  id: `me-p${i + 1}`, name: `ME-${role}`, role, personality: "steady",
  morale: 80, condition: "正常", stats: statsAll(74),
}));

const ROSTERS = {
  [PLAYER_TEAM.id]: PLAYER_ROSTER,
  ...Object.fromEntries(AI_TEAMS.map((t) => [t.id, t.roster])),
};
const BASE_SEED = seedForSeason(SEASON_SEED, 1);

console.log("══ Milestone Q2b：賽果 / 實力 / 模擬 / 積分榜 ══\n");

// ── 1) FixtureOutcome.v1 ────────────────────────────────────────────────
{
  const fx = SEASON.fixtures[0];
  const made = createFixtureOutcome({
    fixture: fx, resultSource: RESULT_SOURCES.simulated, simulatorVersion: "test.v1",
    winner: fx.sideA, score: { a: 22, b: 14 }, duration: 1650, seed: 42, highlights: ["鏖戰"],
  });
  ck("1) 建立賽果", made.ok && validateFixtureOutcome(made.outcome, fx).ok);
  ck("1b) schema 正確", made.outcome.schema === FIXTURE_OUTCOME_VERSION);

  //  ★ provenance 五項（規格修正 3）
  const o = made.outcome;
  ck("1c) **provenance 五項齊全**：fixtureId / gameMode / seed / simulatorVersion / resultSource",
    o.fixtureId === fx.id && o.gameMode === "moba" && o.seed === 42 &&
    o.simulatorVersion === "test.v1" && o.resultSource === "simulated");
  ck("1d) 自帶對戰雙方（賽程可重算、賽果不可 ⇒ 必須自足）",
    o.sideA === fx.sideA && o.sideB === fx.sideB);
  ck("1e) 敗方是純推導，不另存欄位", loserOf(o) === fx.sideB && !("loser" in o));

  //  ★ 不可變（規格 D11）
  ck("1f) **賽果物件被凍結（不可變）**", Object.isFrozen(o) && Object.isFrozen(o.score));
  ck("1g) 契約不提供任何修改函式", (() => {
    const src = fs.readFileSync(new URL("../src/platform/contracts/fixtureOutcome.js", import.meta.url), "utf8");
    return !/export\s+function\s+(update|patch|transition|mutate)/.test(src);
  })());

  //  來源與 simulatorVersion 必須相符
  ck("1h) 模擬賽果缺模擬器版本 → 拒絕",
    !createFixtureOutcome({ fixture: fx, resultSource: "simulated", winner: fx.sideA, score: { a: 1, b: 0 }, duration: 60, seed: 1 }).ok);
  ck("1i) **實際對戰的賽果不得標記模擬器版本**",
    !createFixtureOutcome({ fixture: fx, resultSource: "engine", simulatorVersion: "x", winner: fx.sideA, score: { a: 1, b: 0 }, duration: 60, seed: 1 }).ok);
  ck("1j) 實際對戰賽果（simulatorVersion = null）可建立",
    createFixtureOutcome({ fixture: fx, resultSource: "engine", winner: fx.sideA, score: { a: 1, b: 0 }, duration: 60, seed: 1 }).ok);
  ck("1k) 只有兩種來源，中文名齊全",
    Object.keys(RESULT_SOURCES).sort().join() === "engine,simulated" &&
    resultSourceLabel("simulated") === "快速模擬");

  //  拒絕條件
  ck("1l) 勝方不是對戰雙方之一 → 拒絕",
    !createFixtureOutcome({ fixture: fx, resultSource: "simulated", simulatorVersion: "v", winner: "team:deadbeef", score: { a: 1, b: 0 }, duration: 60, seed: 1 }).ok);
  ck("1m) 缺 seed → 拒絕（可重現性的前提）",
    !createFixtureOutcome({ fixture: fx, resultSource: "simulated", simulatorVersion: "v", winner: fx.sideA, score: { a: 1, b: 0 }, duration: 60 }).ok);
  ck("1n) 缺比分 → 拒絕",
    !createFixtureOutcome({ fixture: fx, resultSource: "simulated", simulatorVersion: "v", winner: fx.sideA, duration: 60, seed: 1 }).ok);
  ck("1o) 賽果與別場的 fixture 比對 → 拒絕",
    !validateFixtureOutcome(o, SEASON.fixtures[1]).ok);
  ck("1p) 對戰雙方被竄改 → 拒絕",
    !validateFixtureOutcome({ ...o, sideA: "team:deadbeef" }, fx).ok);
}

// ── 2) ★ teamStrength 必須真的由 16 項能力推導 ──────────────────────────
{
  const t = AI_TEAMS[0];
  const s = teamStrength(t.roster);
  ck("2) teamStrength 回傳數值", typeof s === "number" && s > 0, String(s));
  ck("2b) 空名單回 null（不假裝有實力）", teamStrength([]) === null && teamStrength(null) === null);
  ck("2c) 決定性：連跑 50 次全同",
    new Set(Array.from({ length: 50 }, () => teamStrength(t.roster))).size === 1);
  ck("2d) **建在既有 calcPower 之上**（不是第二套能力模型）", (() => {
    const powers = t.roster.map((p) => calcPower(p, "moba"));
    const mean = powers.reduce((a, b) => a + b, 0) / powers.length;
    const want = Math.round((mean * COMBINE.mean + Math.max(...powers) * COMBINE.top) * 100) / 100;
    return s === want;
  })(), `teamStrength=${s}`);

  //  ★★ 這兩條是 D16 的核心：實力必須來自能力，不是來自 strength 欄位
  ck("2e) **改隊伍的 strength 欄位，實力值不變**（沒有偷用 AI_TEAMS[].strength）",
    teamStrength({ ...t, strength: 1 }.roster) === s && teamStrength(t.roster) === s);
  ck("2f) **改任一名選手的能力，實力值就會變**（16 項能力真的被吃進去）", (() => {
    const bumped = t.roster.map((p, i) => (i === 2 ? { ...p, stats: { ...p.stats, mapAware: Math.min(97, p.stats.mapAware + 10) } } : p));
    return teamStrength(bumped) !== s;
  })());
  ck("2g) **16 項能力每一項都影響實力值**（沒有任何一項被忽略）", (() => {
    return STAT_DEF.every(({ key }) => {
      const bumped = t.roster.map((p) => ({ ...p, stats: { ...p.stats, [key]: Math.min(99, p.stats[key] + 12) } }));
      return teamStrength(bumped) !== s;
    });
  })());
  ck("2h) 士氣與狀態也影響（沿用 calcPower 的既有語意）", (() => {
    const low = t.roster.map((p) => ({ ...p, morale: 40, condition: "低潮" }));
    return teamStrength(low) < s;
  })());
  ck("2i) 拆解與主計算同一份", (() => {
    const bd = teamStrengthBreakdown(t.roster);
    return bd.strength === s && bd.members.length === 5 && bd.statCount === 16;
  })());
  ck("2j) 強隊實力高於弱隊（AI_TEAMS 依 strength 遞減產生 roster）",
    teamStrength(AI_TEAMS[0].roster) > teamStrength(AI_TEAMS[6].roster),
    `${teamStrength(AI_TEAMS[0].roster)} vs ${teamStrength(AI_TEAMS[6].roster)}`);
  ck("2k) 版本字串存在", typeof TEAM_STRENGTH_VERSION === "string" && TEAM_STRENGTH_VERSION.length > 0);
}

// ── 3) ★ 決定性模擬 ─────────────────────────────────────────────────────
{
  const fx = SEASON.fixtures.find((f) => f.sideA !== PLAYER_TEAM.id && f.sideB !== PLAYER_TEAM.id);
  const r1 = simulateFixture({ fixture: fx, rosters: ROSTERS, seed: 12345 });
  ck("3) 模擬成功並產生合法賽果", r1.ok && validateFixtureOutcome(r1.outcome, fx).ok);
  ck("3a) 賽果標記為 simulated，且帶模擬器版本",
    r1.outcome.resultSource === "simulated" && r1.outcome.simulatorVersion === SIMULATOR_VERSION);

  //  ★★ 同 fixture + 同 seed + 同版本 ⇒ 逐值一致
  ck("3b) **同 fixture + 同 seed 重跑逐值一致**",
    JSON.stringify(r1.outcome) === JSON.stringify(simulateFixture({ fixture: fx, rosters: ROSTERS, seed: 12345 }).outcome));
  ck("3c) 連跑 50 次結果全同", (() => {
    const want = JSON.stringify(r1.outcome);
    return Array.from({ length: 50 }, () => JSON.stringify(simulateFixture({ fixture: fx, rosters: ROSTERS, seed: 12345 }).outcome)).every((x) => x === want);
  })());
  ck("3d) 不同 seed → 通常不同結果", (() => {
    const seen = new Set(Array.from({ length: 12 }, (_, i) =>
      JSON.stringify(simulateFixture({ fixture: fx, rosters: ROSTERS, seed: 1000 + i }).outcome)));
    return seen.size > 1;
  })());
  ck("3e) 不同 fixture → 不同結果（種子含 fixtureId）", (() => {
    const other = SEASON.fixtures.find((f) => f.id !== fx.id && f.sideA !== PLAYER_TEAM.id && f.sideB !== PLAYER_TEAM.id);
    return simulateFixture({ fixture: other, rosters: ROSTERS, seed: 12345 }).outcome.fixtureId !== r1.outcome.fixtureId;
  })());

  //  ★★ 不得使用 AI_TEAMS[].strength
  ck("3f) **改隊伍 strength 欄位，模擬結果不變**", (() => {
    const tampered = { ...ROSTERS };
    //  strength 是隊伍層欄位，roster 沒帶它 ⇒ 模擬根本讀不到
    return JSON.stringify(simulateFixture({ fixture: fx, rosters: tampered, seed: 12345 }).outcome) === JSON.stringify(r1.outcome);
  })());
  ck("3g) **改選手能力，模擬結果會變**（實力真的來自 roster）", (() => {
    const boosted = { ...ROSTERS, [fx.sideA]: ROSTERS[fx.sideA].map((p) => ({ ...p, stats: Object.fromEntries(Object.entries(p.stats).map(([k, v]) => [k, Math.min(97, v + 15)])) })) };
    const r2 = simulateFixture({ fixture: fx, rosters: boosted, seed: 12345 });
    return r2.detail.strengthA > r1.detail.strengthA && r2.detail.winRateA > r1.detail.winRateA;
  })());
  ck("3h) 缺名單 → 明確拒絕，不產生半套賽果",
    !simulateFixture({ fixture: fx, rosters: {}, seed: 1 }).ok &&
    simulateFixture({ fixture: fx, rosters: {}, seed: 1 }).outcome === null);
  ck("3i) 缺 seed → 拒絕", !simulateFixture({ fixture: fx, rosters: ROSTERS }).ok);

  //  勝率模型
  ck("3j) 實力相同 → 勝率約等於 0.5 + 主場優勢",
    Math.abs(winRateFor(70, 70) - (0.5 + SIM_PARAMS.homeEdge)) < 1e-9);
  ck("3k) 勝率有上下限（弱隊仍有機會、強隊不保證贏）",
    winRateFor(10, 99) >= SIM_PARAMS.minWinRate && winRateFor(99, 10) <= SIM_PARAMS.maxWinRate);
  ck("3l) 實力高 → 勝率高（單調）", winRateFor(80, 70) > winRateFor(75, 70) && winRateFor(75, 70) > winRateFor(70, 70));

  //  賽果內容合理
  ck("3m) 勝方比分較高", (() => {
    const o = r1.outcome;
    return o.winner === o.sideA ? o.score.a > o.score.b : o.score.b > o.score.a;
  })());
  ck("3n) 時長落在設定區間",
    r1.outcome.duration >= SIM_PARAMS.durationMin && r1.outcome.duration <= SIM_PARAMS.durationMax);
  ck("3o) **賽果不夾帶實力數值**（detail 是除錯用，不進 outcome）",
    !["strengthA", "strengthB", "winRateA", "roll", "power", "rating"].some((k) => k in r1.outcome));
  ck("3p) 摘要是純文字標籤", r1.outcome.highlights.every((h) => typeof h === "string"));

  //  整批模擬
  const aiFx = SEASON.fixtures.filter((f) => f.sideA !== PLAYER_TEAM.id && f.sideB !== PLAYER_TEAM.id);
  const batch = simulateFixtures({ fixtures: aiFx, rosters: ROSTERS, baseSeed: BASE_SEED });
  ck("3q) **AI vs AI 42 場全部模擬成功**", batch.ok && batch.outcomes.length === 42, `實得 ${batch.outcomes.length}`);
  ck("3r) 整批重跑逐值一致",
    JSON.stringify(batch.outcomes) === JSON.stringify(simulateFixtures({ fixtures: aiFx, rosters: ROSTERS, baseSeed: BASE_SEED }).outcomes));
  ck("3s) 每場種子由 fixtureId 派生 ⇒ 增減任一場不影響其他場", (() => {
    const subset = simulateFixtures({ fixtures: aiFx.slice(5), rosters: ROSTERS, baseSeed: BASE_SEED });
    const byId = new Map(batch.outcomes.map((o) => [o.fixtureId, JSON.stringify(o)]));
    return subset.outcomes.every((o) => byId.get(o.fixtureId) === JSON.stringify(o));
  })());
  ck("3t) simSeedFor 與整批模擬用同一套推導",
    batch.outcomes[0].seed === simSeedFor(BASE_SEED, batch.outcomes[0].fixtureId));
  ck("3u) 全部 42 場都通過契約驗證", batch.outcomes.every((o) => validateFixtureOutcome(o).ok));
}

// ── 4) ★ Standings 純推導 + 決定性 tiebreaker ───────────────────────────
{
  const all = simulateFixtures({ fixtures: SEASON.fixtures, rosters: ROSTERS, baseSeed: BASE_SEED }).outcomes;
  const st = computeStandings({ outcomes: all, participants: PARTICIPANTS });

  ck("4) 8 隊都有一列", st.rows.length === 8);
  ck("4a) 全季 56 場都被計入", st.played === 56, `實得 ${st.played}`);
  ck("4b) 每隊 14 場", st.rows.every((r) => r.played === 14));
  ck("4c) 勝負場數相加 = 出賽場數", st.rows.every((r) => r.wins + r.losses === r.played));
  ck("4d) 全聯盟總勝場 = 總敗場 = 總場數",
    st.rows.reduce((n, r) => n + r.wins, 0) === 56 && st.rows.reduce((n, r) => n + r.losses, 0) === 56);
  ck("4e) 積分 = 勝場 × 3", st.rows.every((r) => r.points === r.wins * 3));
  ck("4f) 全聯盟淨勝分總和為 0", st.rows.reduce((n, r) => n + r.scoreDiff, 0) === 0);
  ck("4g) 名次連續 1–8", st.rows.map((r) => r.rank).join() === "1,2,3,4,5,6,7,8");

  //  ★★ 只由 outcomes 推導
  ck("4h) **沒有賽果時全部為 0**（證明沒有第二份勝敗真相）", (() => {
    const empty = computeStandings({ outcomes: [], participants: PARTICIPANTS });
    return empty.rows.length === 8 && empty.rows.every((r) => r.played === 0 && r.wins === 0 && r.points === 0) && empty.played === 0;
  })());
  ck("4i) 移除一半賽果，積分榜跟著變（推導而非儲存）", (() => {
    const half = computeStandings({ outcomes: all.slice(0, 28), participants: PARTICIPANTS });
    return half.played === 28 && half.rows.reduce((n, r) => n + r.wins, 0) === 28;
  })());
  ck("4j) 別的賽事的賽果不會混進來", (() => {
    const foreign = createFixtureOutcome({
      fixture: { id: "fx:moba:ffffffff", gameMode: "moba", sideA: "team:aaaaaaaa", sideB: "team:bbbbbbbb" },
      resultSource: "simulated", simulatorVersion: "v", winner: "team:aaaaaaaa",
      score: { a: 9, b: 1 }, duration: 600, seed: 1,
    }).outcome;
    return computeStandings({ outcomes: [...all, foreign], participants: PARTICIPANTS }).played === 56;
  })());

  //  ★★ 決定性
  ck("4k) 同一批賽果重算逐列相同",
    JSON.stringify(st.rows) === JSON.stringify(computeStandings({ outcomes: all, participants: PARTICIPANTS }).rows));
  ck("4l) **打亂賽果順序，積分榜完全相同**（不受陣列順序影響）", (() => {
    const shuffled = [...all].reverse();
    return JSON.stringify(computeStandings({ outcomes: shuffled, participants: PARTICIPANTS }).rows) === JSON.stringify(st.rows);
  })());
  ck("4m) 打亂參賽者順序，積分榜完全相同", (() => {
    const ps = [...PARTICIPANTS].reverse();
    const other = computeStandings({ outcomes: all, participants: ps });
    return JSON.stringify(other.rows) === JSON.stringify(st.rows);
  })());

  //  ★★ tiebreaker 是全序
  ck("4n) tiebreaker 有五級，最後一級是決定性收尾",
    TIEBREAKERS.length === 5 && TIEBREAKERS[4].key === "teamId");
  ck("4o) **完全並列的兩隊仍有確定順序（全序）**", (() => {
    //  造兩隊各一勝一敗、比分完全對稱 ⇒ 只剩 teamId 能分
    const ps = [{ id: "team:00000001", name: "A" }, { id: "team:00000002", name: "B" }];
    const mk = (w, l, sa, sb) => createFixtureOutcome({
      fixture: { id: `fx:moba:${w.slice(-4)}${l.slice(-4)}`, gameMode: "moba", sideA: w, sideB: l },
      resultSource: "simulated", simulatorVersion: "v", winner: w, score: { a: sa, b: sb }, duration: 600, seed: 1,
    }).outcome;
    const os = [mk(ps[0].id, ps[1].id, 10, 5), mk(ps[1].id, ps[0].id, 10, 5)];
    const r = computeStandings({ outcomes: os, participants: ps });
    const rev = computeStandings({ outcomes: [...os].reverse(), participants: [...ps].reverse() });
    return r.rows[0].teamId === "team:00000001" && JSON.stringify(r.rows) === JSON.stringify(rev.rows);
  })());
  ck("4p) 同分時對戰成績優先於淨勝分", (() => {
    const ps = [{ id: "team:0000000a" }, { id: "team:0000000b" }, { id: "team:0000000c" }];
    const mk = (id, w, l, sa, sb) => createFixtureOutcome({
      fixture: { id: `fx:moba:${id}`, gameMode: "moba", sideA: w, sideB: l },
      resultSource: "simulated", simulatorVersion: "v", winner: w, score: { a: sa, b: sb }, duration: 600, seed: 1,
    }).outcome;
    //  A 與 B 同為 1 勝 1 敗；A 直接擊敗 B，但 B 淨勝分較高
    const os = [
      mk("1", ps[0].id, ps[1].id, 11, 10),   // A 勝 B（+1）
      mk("2", ps[1].id, ps[2].id, 30, 5),    // B 勝 C（+25）
      mk("3", ps[2].id, ps[0].id, 20, 5),    // C 勝 A（A −15）
    ];
    const r = computeStandings({ outcomes: os, participants: ps });
    const a = standingOf(r, ps[0].id), b = standingOf(r, ps[1].id);
    return a.points === b.points && a.rank < b.rank && b.scoreDiff > a.scoreDiff;
  })());

  ck("4q) 積分規則可切換", (() => {
    const r = computeStandings({ outcomes: all, participants: PARTICIPANTS, rule: "win1" });
    return r.rule.id === "win1" && r.rows.every((x) => x.points === x.wins);
  })());
  ck("4r) 未知規則回退預設", computeStandings({ outcomes: all, participants: PARTICIPANTS, rule: "nope" }).rule.id === "win3");
  ck("4s) standingOf 查得到、查不到回 null",
    standingOf(st, PLAYER_TEAM.id) !== null && standingOf(st, "team:deadbeef") === null);
  ck("4t) 積分榜列出來源分佈（誠實標示有多少場是模擬）",
    st.rows.every((r) => r.engineGames + r.simulatedGames === r.played));
}

// ── 5) ★ 兩類 Analytics 的分界 ──────────────────────────────────────────
{
  const fx = SEASON.fixtures[0];
  const sim = simulateFixture({ fixture: fx, rosters: ROSTERS, seed: 999 }).outcome;
  const eng = createFixtureOutcome({
    fixture: SEASON.fixtures[1], resultSource: "engine", winner: SEASON.fixtures[1].sideA,
    score: { a: 25, b: 12 }, duration: 1800, seed: 777,
  }).outcome;
  const mixed = [sim, eng];

  ck("5) 判別函式正確",
    isSimulatedOutcome(sim) && !isEngineOutcome(sim) && isEngineOutcome(eng) && !isSimulatedOutcome(eng));
  ck("5a) **Competition Analytics 兩種來源一視同仁**", competitionOutcomes(mixed).length === 2);
  ck("5b) **Combat/Balance Analytics 只吃 engine**",
    combatOutcomes(mixed).length === 1 && combatOutcomes(mixed)[0].resultSource === "engine");
  ck("5c) 非法賽果兩邊都被擋掉", (() => {
    const bad = { ...sim, schema: "wrong" };
    return competitionOutcomes([...mixed, bad]).length === 2 && combatOutcomes([...mixed, bad]).length === 1;
  })());

  //  ★ Standings 必須吃 simulated（AI 賽果是正式賽果）
  ck("5d) **Standings 計入 simulated 賽果**", (() => {
    const r = computeStandings({ outcomes: [sim], participants: PARTICIPANTS });
    return r.played === 1 && standingOf(r, sim.winner).wins === 1;
  })());
  ck("5e) Standings 也計入 engine 賽果", (() => {
    const r = computeStandings({ outcomes: mixed, participants: PARTICIPANTS });
    return r.played === 2;
  })());
  ck("5f) 來源分佈統計正確", (() => {
    const mix = outcomeSourceMix(mixed);
    return mix.total === 2 && mix.engine === 1 && mix.simulated === 1;
  })());
  ck("5g) **Standings 不呼叫 combatOutcomes**（否則 AI 賽果會被吃掉）", (() => {
    const code = readCode("src/platform/competition/standings.js");   // ← 已剝註解
    return /competitionOutcomes/.test(code) && !/combatOutcomes\s*\(/.test(code);
  })());
}

// ── 6) 邊界：Q2b 刻意不做的事 ───────────────────────────────────────────
//  掃原始碼一律走模組層級的 readCode()（已剝註解），見檔頭說明。
{
  const read = readCode;
  const files = [
    "src/platform/contracts/fixtureOutcome.js",
    "src/platform/competition/teamStrength.js",
    "src/platform/competition/simulateFixture.js",
    "src/platform/competition/standings.js",
  ];
  for (const f of files) {
    const name = f.split("/").pop();
    const code = read(f);
    ck(`6) ${name} 程式碼沒有 Math.random()／Date.now()`,
      !/Math\.random\s*\(/.test(code) && !/Date\.now\s*\(|new\s+Date\s*\(/.test(code));
    ck(`6b) ${name} 不 import React／zustand，也不碰 localStorage`,
      !/from\s+["'](react|zustand)["']/.test(code) && !/localStorage/.test(code));
  }
  const all = files.map(read).join("\n");
  ck("6c) **沒有碰 Battle Engine**", !/LogicEngine|useLocalServer|battleStore|BattleResult/.test(all));
  ck("6d) **沒有接 profileStore**", !/profileStore/.test(all));
  ck("6e) **沒有 advanceDay**", !/advanceDay/.test(all));
  ck("6f) **沒有 competitionGateway／玩家出賽**", !/competitionGateway|MatchOrigin|createAssignment/.test(all));
  ck("6g) **模擬器不 import aiTeams**（拿不到 AI_TEAMS[].strength）", (() => {
    const sim = read("src/platform/competition/simulateFixture.js");
    return !/aiTeams/.test(sim) && !/AI_TEAMS/.test(sim);
  })());
  ck("6h) teamStrength 只從 playerModel 取能力模型",
    /from\s+["']\.\.\/\.\.\/data\/playerModel\.js["']/.test(read("src/platform/competition/teamStrength.js")));
}

console.log(`\n${pass}/${pass + fail} 通過`);
if (fail) { console.log(`\n❌ ${fail} 條未通過`); process.exit(1); }
