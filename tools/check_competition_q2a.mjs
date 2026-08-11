#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_q2a.mjs — Milestone Q2a：AI 隊伍 / 賽事契約 / 賽程
//
//  執行：repo 根目錄 `node tools/check_competition_q2a.mjs`；**失敗時 exit 1**。
//
//  Q2a 的四件事：
//    ① 7 支唯讀 AI 隊伍，與玩家組成 8 隊
//    ② Competition / Stage / Fixture 契約
//    ③ round_robin 雙循環賽程產生器
//    ④ 賽程種子由既有 meta.seasonSeed 派生
//
//  最重要的四組不變式：
//    §4 8 隊雙循環固定 56 場、玩家 14 場、AI vs AI 42 場
//    §5 同 seed 重跑逐場完全一致（含順序）
//    §6 主客場對稱：每對互為主客各一次，每隊 7 主 7 客
//    §7 fixtureId 決定性且唯一
// ============================================================================
import fs from "node:fs";
import {
  AI_TEAMS, AI_TEAM_COUNT, LEAGUE_TEAM_COUNT, buildAiTeams, aiTeamById, aiTeamByKey,
  leagueParticipants, TEAM_STYLES,
} from "../src/platform/competition/aiTeams.js";
import {
  COMPETITION_VERSION, STAGE_VERSION, FIXTURE_VERSION, STAGE_FORMATS, IMPLEMENTED_FORMATS,
  FIXTURE_STATES, FIXTURE_TERMINAL, canFixtureTransition, isFixtureTerminal,
  createCompetition, createStage, createFixture, transitionFixture,
  validateCompetition, validateStage, validateFixture,
  stageFormatLabel, fixtureStatusLabel, involvesTeam, opponentOf, sideOf,
} from "../src/platform/contracts/competition.js";
import {
  generateSchedule, fixturesOf, aiOnlyFixtures, fixturesOnDay, homeAwayTally, dayForRound,
} from "../src/platform/competition/scheduleGenerator.js";
import { buildRegularSeason, SEASON_DAYS } from "../src/platform/competition/regularSeason.js";
import { deriveTeamId, seedForSeason, isTeamId } from "../src/platform/identity/teamIdentity.js";
import { STAT_DEF } from "../src/data/playerModel.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const PLAYER_TEAM = {
  id: deriveTeamId({ name: "白貓戰隊", tag: "GSEAL", scenario: "standard", createdDay: 1 }),
  name: "白貓戰隊", tag: "GSEAL", emoji: "🐱",
};
const SEASON_SEED = 1660418839;   // 與 Q1 §2 同一個示範值

console.log("══ Milestone Q2a：AI 隊伍 / 賽事契約 / 賽程 ══\n");

// ── 1) AI 隊伍：7 支、唯讀、共用 playerModel ────────────────────────────
{
  ck("1) 剛好 7 支 AI 隊伍", AI_TEAMS.length === AI_TEAM_COUNT && AI_TEAM_COUNT === 7);
  ck("1b) 加上玩家共 8 隊", LEAGUE_TEAM_COUNT === 8);
  ck("1c) 每支都有 5 名選手", AI_TEAMS.every((t) => t.roster.length === 5));
  ck("1d) 共 35 名 AI 選手", AI_TEAMS.reduce((n, t) => n + t.roster.length, 0) === 35);

  ck("1e) **AI 隊伍 id 與玩家在同一個命名空間**（isTeamId 驗得過）",
    AI_TEAMS.every((t) => isTeamId(t.id)), AI_TEAMS[0].id);
  ck("1f) 隊伍 id 互不重複", new Set(AI_TEAMS.map((t) => t.id)).size === 7);
  ck("1g) 不與玩家隊伍 id 相撞", !AI_TEAMS.some((t) => t.id === PLAYER_TEAM.id));

  //  ★ 共用 playerModel：16 項能力齊全、鍵名一致（不是第二套模型）
  const keys = STAT_DEF.map((s) => s.key).sort().join();
  ck("1h) **每名 AI 選手都有完整 16 項能力，鍵名與 playerModel 一致**",
    AI_TEAMS.every((t) => t.roster.every((p) => Object.keys(p.stats).sort().join() === keys)));
  ck("1i) 能力值都在合理範圍（35–97）",
    AI_TEAMS.every((t) => t.roster.every((p) => Object.values(p.stats).every((v) => v >= 35 && v <= 97))));
  ck("1j) 五個定位齊全（每隊各一）",
    AI_TEAMS.every((t) => t.roster.map((p) => p.role).sort().join() === ["上路", "下路", "中路", "打野", "輔助"].sort().join()));
  ck("1k) 選手 id 全域唯一",
    new Set(AI_TEAMS.flatMap((t) => t.roster.map((p) => p.id))).size === 35);
  ck("1l) 每名選手都指回自己的隊伍",
    AI_TEAMS.every((t) => t.roster.every((p) => p.teamId === t.id)));

  //  ★ 唯讀：不帶經營欄位（不會被誤當成 profileStore.players[] 的成員）
  const mgmtKeys = ["rosterTier", "salary", "xp", "talentPoints", "talents", "training"];
  ck("1m) **AI 選手不帶任何經營欄位**（不進 profileStore.players[] 的證據）",
    AI_TEAMS.every((t) => t.roster.every((p) => !mgmtKeys.some((k) => k in p))));
  ck("1n) 每名 AI 選手都標記 readOnly",
    AI_TEAMS.every((t) => t.roster.every((p) => p.readOnly === true)));
  ck("1o) 隊伍風格都在已定義的清單內",
    AI_TEAMS.every((t) => TEAM_STYLES.includes(t.style)));

  //  ★ 決定性
  ck("1p) 同 seed 重建逐值相同",
    JSON.stringify(buildAiTeams()) === JSON.stringify(buildAiTeams()));
  ck("1q) 不同 seed 產生不同 roster",
    JSON.stringify(buildAiTeams(1)) !== JSON.stringify(buildAiTeams(2)));
  ck("1r) 查詢函式可用", aiTeamById(AI_TEAMS[0].id)?.key === AI_TEAMS[0].key && aiTeamByKey("shadowwolf") !== null);

  //  ★ 參賽者組裝
  const ps = leagueParticipants(PLAYER_TEAM);
  ck("1s) 參賽者共 8 名，玩家排第一且未標記為 AI",
    ps.length === 8 && ps[0].id === PLAYER_TEAM.id && ps[0].isAi === false);
  ck("1t) 其餘 7 名都標記為 AI", ps.slice(1).every((p) => p.isAi === true));
}

// ── 2) 契約：Competition / Stage / Fixture ──────────────────────────────
{
  const c = createCompetition({ gameMode: "moba", season: 1 });
  ck("2) 建立賽事", c.ok && validateCompetition(c.competition).ok && c.competition.schema === COMPETITION_VERSION);
  ck("2b) 賽事 id 決定性", createCompetition({ gameMode: "moba", season: 1 }).competition.id === c.competition.id);
  ck("2c) 不同賽季 → 不同賽事 id", createCompetition({ gameMode: "moba", season: 2 }).competition.id !== c.competition.id);
  ck("2d) **Stage Graph 存在但 Q2a 是零條邊**",
    Array.isArray(c.competition.stageIds) && Array.isArray(c.competition.qualifications) && c.competition.qualifications.length === 0);
  ck("2e) 非法 gameMode / 賽季 → 拒絕",
    !createCompetition({ gameMode: "rts", season: 1 }).ok && !createCompetition({ gameMode: "moba", season: 0 }).ok);

  ck("2f) 四種賽制都有定義，中文名齊全",
    Object.keys(STAGE_FORMATS).sort().join() === "double_elim,round_robin,single_elim,swiss" &&
    stageFormatLabel("round_robin") === "循環賽" && stageFormatLabel("swiss") === "瑞士輪");
  ck("2g) **Q2a 只實作循環賽**", IMPLEMENTED_FORMATS.length === 1 && IMPLEMENTED_FORMATS[0] === "round_robin");

  const participants = leagueParticipants(PLAYER_TEAM);
  const s = createStage({ competition: c.competition, participants, legs: 2 });
  ck("2h) 建立賽段", s.ok && validateStage(s.stage).ok && s.stage.schema === STAGE_VERSION);
  ck("2i) 賽段只存身分，不存戰力",
    s.stage.participants.every((p) => Object.keys(p).sort().join() === "id,isAi,name,tag"));
  ck("2j) 參賽者少於兩名 → 拒絕", !createStage({ competition: c.competition, participants: [participants[0]] }).ok);
  ck("2k) 同一參賽者重複 → 拒絕",
    !createStage({ competition: c.competition, participants: [participants[0], participants[0]] }).ok);
  ck("2l) 參賽者夾帶戰力數值 → 拒絕",
    !createStage({ competition: c.competition, participants: [{ ...participants[0], power: 99 }, participants[1]] }).ok);
  ck("2m) 循環數只能是 1 或 2", !createStage({ competition: c.competition, participants, legs: 3 }).ok);

  const f = createFixture({ stage: s.stage, round: 1, day: 6, sideA: participants[0].id, sideB: participants[1].id });
  ck("2n) 建立賽程場次", f.ok && validateFixture(f.fixture).ok && f.fixture.schema === FIXTURE_VERSION);
  ck("2o) **場次沒有任何勝負／比分欄位**",
    !["winner", "score", "result", "outcome", "rewards"].some((k) => k in f.fixture));
  ck("2p) 自己對自己 → 拒絕",
    !createFixture({ stage: s.stage, round: 1, day: 6, sideA: participants[0].id, sideB: participants[0].id }).ok);
  ck("2q) 非參賽者 → 拒絕",
    !createFixture({ stage: s.stage, round: 1, day: 6, sideA: participants[0].id, sideB: "team:deadbeef" }).ok);
  ck("2r) 項目專屬設定原樣攜帶（共用層不解讀）", (() => {
    const mf = { bestOf: 3, sideSelect: "coinflip", banPickOrder: "standard" };
    return JSON.stringify(createFixture({ stage: s.stage, round: 1, day: 6, sideA: participants[0].id, sideB: participants[1].id, matchFormat: mf }).fixture.matchFormat) === JSON.stringify(mf);
  })());

  for (const key of ["winner", "score", "rewards", "mvp", "power", "rating"]) {
    ck(`2s) 場次夾帶「${key}」→ 驗證拒絕`,
      !validateFixture({ ...f.fixture, [key]: 1 }).ok &&
      validateFixture({ ...f.fixture, [key]: 1 }).errors.some((e) => e.code === "result_leak"));
  }
}

// ── 3) Fixture 狀態機（Q12）────────────────────────────────────────────
{
  const c = createCompetition({ gameMode: "moba", season: 1 }).competition;
  const participants = leagueParticipants(PLAYER_TEAM);
  const stage = createStage({ competition: c, participants }).stage;
  const fx = createFixture({ stage, round: 1, day: 6, sideA: participants[0].id, sideB: participants[1].id }).fixture;

  ck("3) 四種狀態齊全，中文名齊全",
    Object.keys(FIXTURE_STATES).sort().join() === "completed,forfeited,launched,scheduled" &&
    fixtureStatusLabel("forfeited") === "棄權判負");
  ck("3b) 初始狀態是已排定", fx.status === FIXTURE_STATES.scheduled);
  ck("3c) 兩個終局狀態", [...FIXTURE_TERMINAL].sort().join() === "completed,forfeited");

  const launched = transitionFixture(fx, FIXTURE_STATES.launched);
  ck("3d) 已排定 → 進行中", launched.ok && launched.fixture.status === "launched");
  ck("3e) **進行中不可回到已排定**（中離不得規避敗場）",
    !transitionFixture(launched.fixture, FIXTURE_STATES.scheduled).ok &&
    !canFixtureTransition("launched", "scheduled"));
  ck("3f) 進行中 → 已完成", transitionFixture(launched.fixture, FIXTURE_STATES.completed).ok);
  ck("3g) 進行中 → 棄權（逾期未完成）",
    transitionFixture(launched.fixture, FIXTURE_STATES.forfeited, { reason: "逾期未完成" }).ok);
  ck("3h) 已排定 → 棄權（未出賽）",
    transitionFixture(fx, FIXTURE_STATES.forfeited, { reason: "未出賽" }).ok);
  ck("3i) 棄權必須附原因", !transitionFixture(fx, FIXTURE_STATES.forfeited).ok);
  const done = transitionFixture(launched.fixture, FIXTURE_STATES.completed).fixture;
  ck("3j) 終局狀態不可再轉移",
    isFixtureTerminal(done) && !transitionFixture(done, FIXTURE_STATES.launched).ok);
  ck("3k) 未知狀態 → 拒絕", !transitionFixture(fx, "paused").ok);
  ck("3l) 已排定不可直接跳到已完成", !canFixtureTransition("scheduled", "completed"));
}

// ── 4) ★ 賽程規模：56 / 14 / 42 ─────────────────────────────────────────
{
  const s = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: SEASON_SEED });
  ck("4) 賽季建立成功", s.ok, s.errors.map((e) => e.message).join("；"));
  ck("4a) 8 隊參賽", s.stage.participants.length === 8);
  ck("4b) **雙循環固定 56 場**", s.fixtures.length === 56, `實得 ${s.fixtures.length}`);
  ck("4c) 14 輪 × 4 場", s.summary.rounds === 14 && s.summary.matchesPerRound === 4);

  const mine = fixturesOf(s.fixtures, PLAYER_TEAM.id);
  ck("4d) **玩家固定 14 場**", mine.length === 14, `實得 ${mine.length}`);
  const ai = aiOnlyFixtures(s.fixtures, PLAYER_TEAM.id);
  ck("4e) **AI vs AI 固定 42 場**", ai.length === 42, `實得 ${ai.length}`);
  ck("4f) 14 + 42 = 56（沒有漏算或重算）", mine.length + ai.length === s.fixtures.length);

  ck("4g) 每隊都是 14 場", (() => {
    const tally = homeAwayTally(s.fixtures);
    return tally.size === 8 && [...tally.values()].every((t) => t.total === 14);
  })());
  ck("4h) 玩家每輪恰好一場（行事曆驅動的前提）", (() => {
    const rounds = mine.map((f) => f.round).sort((a, b) => a - b);
    return rounds.length === 14 && rounds.every((r, i) => r === i + 1);
  })());

  //  日程
  ck("4i) 全部場次落在賽季日區間內", s.fixtures.every((f) => f.day >= 1 && f.day <= SEASON_DAYS));
  ck("4j) 第 1 輪第 6 天、第 14 輪第 84 天（每 6 天一輪）",
    dayForRound(1, 14, { from: 1, to: 84 }) === 6 && dayForRound(14, 14, { from: 1, to: 84 }) === 84);
  ck("4k) 同一輪的 4 場在同一天",
    [...new Set(s.fixtures.map((f) => f.round))].every((r) => new Set(s.fixtures.filter((f) => f.round === r).map((f) => f.day)).size === 1));
  ck("4l) 玩家的比賽日共 14 天且互不重複", new Set(mine.map((f) => f.day)).size === 14);
  ck("4m) fixturesOnDay 取得當天全部場次", fixturesOnDay(s.fixtures, mine[0].day).length === 4);

  //  每一對只碰兩次
  ck("4n) 每一對隊伍恰好對戰兩次", (() => {
    const pair = new Map();
    for (const f of s.fixtures) {
      const k = [f.sideA, f.sideB].sort().join("|");
      pair.set(k, (pair.get(k) ?? 0) + 1);
    }
    return pair.size === 28 && [...pair.values()].every((n) => n === 2);
  })());
  ck("4o) 沒有任何一場是自己對自己", s.fixtures.every((f) => f.sideA !== f.sideB));
  ck("4p) 每一場都通過契約驗證", s.fixtures.every((f) => validateFixture(f).ok));
  ck("4q) 每一場初始都是已排定", s.fixtures.every((f) => f.status === FIXTURE_STATES.scheduled));
  ck("4r) 輔助函式一致", (() => {
    const f = mine[0];
    return involvesTeam(f, PLAYER_TEAM.id) && opponentOf(f, PLAYER_TEAM.id) !== PLAYER_TEAM.id &&
      ["home", "away"].includes(sideOf(f, PLAYER_TEAM.id)) && opponentOf(f, "team:deadbeef") === null;
  })());
}

// ── 5) ★ 決定性：同 seed 重跑逐場完全一致 ───────────────────────────────
{
  const a = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: SEASON_SEED });
  const b = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: SEASON_SEED });
  ck("5) **同 seed 重跑：賽程逐場完全一致（含順序）**",
    JSON.stringify(a.fixtures) === JSON.stringify(b.fixtures));
  ck("5b) 連跑 20 次結果全同", (() => {
    const want = JSON.stringify(a.fixtures);
    return Array.from({ length: 20 }, () =>
      JSON.stringify(buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: SEASON_SEED }).fixtures))
      .every((x) => x === want);
  })());

  //  ★ 逐賽季派生：不同賽季不同賽程，但各自可重現
  const s2 = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 2, seasonSeed: SEASON_SEED });
  ck("5c) **不同賽季 → 不同賽程**（證明有用 seedForSeason，沒有直接用 seasonSeed）",
    JSON.stringify(a.fixtures.map((f) => f.id)) !== JSON.stringify(s2.fixtures.map((f) => f.id)));
  ck("5d) 第 2 賽季自己重跑仍逐場相同",
    JSON.stringify(s2.fixtures) === JSON.stringify(buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 2, seasonSeed: SEASON_SEED }).fixtures));
  ck("5e) 賽程種子確實是 seedForSeason 的輸出", a.summary.seed === seedForSeason(SEASON_SEED, 1));
  ck("5f) 不同 seasonSeed → 不同賽程", (() => {
    const other = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: 12345 });
    return JSON.stringify(other.fixtures.map((f) => f.id)) !== JSON.stringify(a.fixtures.map((f) => f.id));
  })());
  ck("5g) 兩個賽季的規模都是 56 場", s2.fixtures.length === 56);

  //  缺前置條件 → 拒絕（不產生半套賽季）
  ck("5h) 缺 team.id → 拒絕建立賽季",
    !buildRegularSeason({ playerTeam: { name: "x" }, season: 1, seasonSeed: SEASON_SEED }).ok);
  ck("5i) 缺 seasonSeed → 拒絕建立賽季",
    !buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1 }).ok);
  ck("5j) 未實作的賽制 → 明確拒絕，不悄悄產生空賽程", (() => {
    const c = createCompetition({ gameMode: "moba", season: 1 }).competition;
    const stage = createStage({ competition: c, participants: leagueParticipants(PLAYER_TEAM), format: STAGE_FORMATS.swiss }).stage;
    const r = generateSchedule({ stage, seed: 1 });
    return !r.ok && r.errors[0].code === "format_not_implemented";
  })());
}

// ── 6) ★ 主客場對稱 ─────────────────────────────────────────────────────
{
  const s = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: SEASON_SEED });
  const tally = homeAwayTally(s.fixtures);
  ck("6) **每隊主場 7 場、客場 7 場**",
    [...tally.values()].every((t) => t.home === 7 && t.away === 7),
    [...tally.entries()].map(([, t]) => `${t.home}/${t.away}`).join(" "));

  ck("6b) **每一對隊伍恰好互為主客各一次**", (() => {
    const seen = new Map();
    for (const f of s.fixtures) {
      const k = [f.sideA, f.sideB].sort().join("|");
      const arr = seen.get(k) ?? [];
      arr.push(`${f.sideA}>${f.sideB}`);
      seen.set(k, arr);
    }
    return [...seen.values()].every((arr) => arr.length === 2 && arr[0] !== arr[1]);
  })());

  ck("6c) 第二循環是第一循環的主客互換", (() => {
    const leg1 = s.fixtures.filter((f) => f.round <= 7);
    const leg2 = s.fixtures.filter((f) => f.round > 7);
    if (leg1.length !== 28 || leg2.length !== 28) return false;
    const key1 = new Set(leg1.map((f) => `${f.sideA}>${f.sideB}`));
    return leg2.every((f) => key1.has(`${f.sideB}>${f.sideA}`));
  })());

  ck("6d) 玩家自己也是 7 主 7 客",
    tally.get(PLAYER_TEAM.id).home === 7 && tally.get(PLAYER_TEAM.id).away === 7);
}

// ── 7) ★ fixtureId 決定性且唯一 ─────────────────────────────────────────
{
  const s = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: SEASON_SEED });
  const ids = s.fixtures.map((f) => f.id);
  ck("7) **56 個 fixtureId 全部唯一**", new Set(ids).size === 56, `唯一 ${new Set(ids).size}`);
  ck("7b) id 格式一致", ids.every((id) => /^fx:moba:[0-9a-f]{8}$/.test(id)), ids[0]);
  ck("7c) 同 seed 重跑 id 逐字一致",
    JSON.stringify(buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: SEASON_SEED }).fixtures.map((f) => f.id)) === JSON.stringify(ids));

  ck("7d) **主客互換是不同的 id**（有序推導）", (() => {
    const c = createCompetition({ gameMode: "moba", season: 1 }).competition;
    const ps = leagueParticipants(PLAYER_TEAM);
    const stage = createStage({ competition: c, participants: ps }).stage;
    const ab = createFixture({ stage, round: 1, day: 6, sideA: ps[0].id, sideB: ps[1].id }).fixture;
    const ba = createFixture({ stage, round: 1, day: 6, sideA: ps[1].id, sideB: ps[0].id }).fixture;
    return ab.id !== ba.id;
  })());
  ck("7e) 不同輪次的同一對是不同 id", (() => {
    const c = createCompetition({ gameMode: "moba", season: 1 }).competition;
    const ps = leagueParticipants(PLAYER_TEAM);
    const stage = createStage({ competition: c, participants: ps }).stage;
    return createFixture({ stage, round: 1, day: 6, sideA: ps[0].id, sideB: ps[1].id }).fixture.id
        !== createFixture({ stage, round: 8, day: 48, sideA: ps[0].id, sideB: ps[1].id }).fixture.id;
  })());
  ck("7f) 不同賽季的 id 不相撞", (() => {
    const s2 = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 2, seasonSeed: SEASON_SEED });
    return s2.fixtures.every((f) => !ids.includes(f.id));
  })());
}

// ── 8) 邊界：Q2a 刻意不做的事 ───────────────────────────────────────────
//  ⚠ 制度教訓（Q1 §6 踩過第十次）：掃原始碼前先剝註解，否則會掃到說明文字本身。
{
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const read = (p) => stripComments(fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
  const files = [
    "src/platform/competition/aiTeams.js",
    "src/platform/competition/scheduleGenerator.js",
    "src/platform/competition/regularSeason.js",
    "src/platform/contracts/competition.js",
  ];

  for (const f of files) {
    const name = f.split("/").pop();
    const code = read(f);
    ck(`8) ${name} 程式碼沒有 Math.random()／Date.now()`,
      !/Math\.random\s*\(/.test(code) && !/Date\.now\s*\(|new\s+Date\s*\(/.test(code));
    ck(`8b) ${name} 不 import React／zustand，也不碰 localStorage`,
      !/from\s+["'](react|zustand)["']/.test(code) && !/localStorage/.test(code));
  }

  const all = files.map(read).join("\n");
  ck("8c) **沒有產生 FixtureOutcome**（Q2b 的事）", !/FixtureOutcome/.test(all));
  ck("8d) **沒有 simulateFixture**（Q2b 的事）", !/simulateFixture/.test(all));
  ck("8e) **沒有 Standings**（Q2b 的事）", !/[Ss]tandings\b/.test(all.replace(/standingsRule/g, "")));
  ck("8f) **沒有碰 Battle Engine**", !/LogicEngine|useLocalServer|battleStore/.test(all));
  ck("8g) **沒有碰 Shop／Ranking**", !/[Ss]hop|Entitlement|RankingKey|\bMMR\b/.test(all));
  ck("8h) **沒有 CS 賽事**（Q2a 只做 MOBA 常規賽）", (() => {
    const rs = read("src/platform/competition/regularSeason.js");
    return !/["']cs["']/.test(rs);
  })());

  //  ★ 行為證明：契約層允許 cs，但 Q2a 的組裝入口預設只建 MOBA
  const s = buildRegularSeason({ playerTeam: PLAYER_TEAM, season: 1, seasonSeed: SEASON_SEED });
  ck("8i) 預設建立的是 MOBA 賽事", s.competition.gameMode === "moba" && s.stage.gameMode === "moba");
  ck("8j) 賽段沒有晉級邊（Stage Graph 只有一個節點）",
    s.stage.qualifications.length === 0 && s.competition.stageIds.length === 1);
  ck("8k) 賽程場次沒有任何結果欄位",
    s.fixtures.every((f) => !["winner", "score", "result", "outcome", "rewards", "mvp"].some((k) => k in f)));
}

console.log(`\n${pass}/${pass + fail} 通過`);
if (fail) { console.log(`\n❌ ${fail} 條未通過`); process.exit(1); }
