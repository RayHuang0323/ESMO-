// ============================================================================
//  Club Progression v1 驗證：repo 根目錄執行 `node tools/check_club_progression_v1.mjs`
//
//  驗的是這一輪的契約：
//    · Club XP 是**獨立**的 canonical 狀態，不是 clubPointsLifetime 改名。
//    · Club Level 由 XP **推導**（不落盤）⇒ 不可能出現兩份會漂移的權威。
//    · 授予點只有一個：`applyProgressToState`（因此天生帶冪等保護）。
//    · 快速練習永遠 0 XP；一般競技 < 正式賽季；勝場加成。
//    · 舊存檔 migration 保守 bootstrap，且不得把假的 Lv.93／72700 洗成真歷史。
//
//  ⚠ 中文 OneDrive 路徑下 ESM 相對解析會失敗 → 一律用絕對 file:// URL import。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;

const A = [];
const ck = (name, cond) => A.push([name, !!cond]);
const notes = [];

const CP = await import(u("src/platform/progression/clubProgression.js"));
const {
  CLUB_PROGRESSION_VERSION, clubLevelOf, clubXpForLevel, clubProgressToNextLevel,
  emptyClubProgression, bootstrapClubProgression, normalizeClubProgression,
  addClubXp, clubXpForMatch, clubProgressionViewOf, CLUB_XP_AWARD, CLUB_XP_WIN_BONUS,
  BOOTSTRAP_RATIO,
} = CP;
const { applyProgressToState } = await import(u("src/platform/progress/applyMatchProgress.js"));
const { mobaResultToTransaction } = await import(u("src/platform/progress/adapters/mobaProgressAdapter.js"));
const { csResultToTransaction } = await import(u("src/platform/progress/adapters/csProgressAdapter.js"));
const { MATCH_SOURCE } = await import(u("src/platform/progress/matchSource.js"));

// ── Fixtures ───────────────────────────────────────────────────────────────
const mkPlayers = () => [
  { id: "b1", name: "Kaiser", role: "上路", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b2", name: "Nacht", role: "打野", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b3", name: "Frost", role: "中路", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b4", name: "Blitz", role: "下路", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b5", name: "Seelowe", role: "輔助", xp: 0, lv: 1, talentPoints: 0 },
];
const mkState = (over = {}) => ({
  players: mkPlayers(),
  finance: { funds: 1_000_000, transactions: [] },
  meta: { fans: 1000, reputation: 10 },
  processedMatchTransactions: {},
  clubProgression: emptyClubProgression(),
  ...over,
});

//  三種來源的 origin。判定走 `matchSourceFromOrigin`，這裡不自己比字串。
const ORIGIN = {
  practice: { kind: "practice" },
  competitive: { kind: "ticket", ticketId: "t1" },
  official: { kind: "fixture", fixtureId: "f1", seasonId: "s1" },
};

function mkMoba({ win = true, salt = 0 } = {}) {
  const P = (id, side, role, k, d, a, gold, dmg, rating, part) => ({
    id, side, role, heroId: "x", lv: 10, k, d, a, gold, dmg, heal: 0, twrDmg: 0,
    participation: part, rating, won: side === (win ? "blue" : "red"), mvp: id === "b3",
  });
  return {
    schema: "BattleResult.v2", mode: "moba",
    teams: { blue: { name: "藍" }, red: { name: "紅" } },
    winner: win ? "blue" : "red",
    duration: 1200.5 + salt,
    score: { blue: win ? 30 : 12, red: win ? 12 : 30 },
    gold: { blue: 50000 + salt, red: 42000 },
    towers: { blue: 8, red: 3 },
    dragon: { blue: 2, red: 1 }, baron: { blue: 1, red: 0 },
    tactic: null, tacticExecution: null, timeline: [], mvpId: "b3",
    players: [
      P("b1", "blue", "top", 6, 4, 8, 9000, 30000, 30, 0.55),
      P("b2", "blue", "jungle", 5, 5, 12, 8500, 24000, 28, 0.60),
      P("b3", "blue", "mid", 14, 2, 6, 13000, 52000, 62, 0.70),
      P("b4", "blue", "adc", 9, 3, 7, 11000, 41000, 44, 0.58),
      P("b5", "blue", "sup", 1, 6, 20, 5000, 9000, 10, 0.72),
      P("r1", "red", "top", 3, 7, 5, 7000, 20000, 12, 0.4),
    ],
  };
}

function mkCs({ win = true, matchId = "cs-001" } = {}) {
  const P = (playerId, name, role, k, d, a, rating, kast) => ({
    playerId, playerName: name, role, roleKey: null,
    kills: k, deaths: d, assists: a, rating, adr: 80, hsPct: 50, kast,
    clutches: 0, entryKills: 0, mvpRounds: 2,
  });
  return {
    schema: "CsMatchResult.v1", mode: "cs", matchId,
    seed: 1, mapId: "dust2", mapName: "Dust II",
    tacticId: "f1", tacticName: "標準", tacticType: "default", engineTactic: null,
    winner: win ? "us" : "enemy",
    ourScore: win ? 16 : 9, enemyScore: win ? 9 : 16,
    duration: null, roundCount: 25, teamName: "德國海豹", oppName: "Compulsary",
    players: [
      P("b1", "Kaiser", "突破", 20, 14, 4, 1.35, 72),
      P("b2", "Nacht", "狙擊", 24, 15, 3, 1.45, 70),
      P("b3", "Frost", "步槍", 18, 16, 6, 1.10, 68),
      P("b4", "Blitz", "輔助", 12, 17, 9, 0.88, 74),
      P("b5", "Seelowe", "指揮", 9, 18, 11, 0.72, 76),
    ],
    opponents: [], mvp: { playerId: "b2", playerName: "Nacht", role: "狙擊", rating: 1.45 },
    summaryEvents: [], rewards: { money: null, fans: null, xp: null }, recordedAt: null,
  };
}

const runMoba = (state, opts) => applyProgressToState(state, mobaResultToTransaction(
  mkMoba(opts), { players: state.players, streak: 0, fansNow: 1000, origin: opts.origin }));
const runCs = (state, opts) => applyProgressToState(state, csResultToTransaction(
  mkCs(opts), { players: state.players, streak: 0, fansNow: 1000, origin: opts.origin }));

// ── A. 曲線：推導、單調、集中 ───────────────────────────────────────────────
ck("1) schema 是 ClubProgression.v1", CLUB_PROGRESSION_VERSION === "ClubProgression.v1");
ck("2) 空進度 = Lv.1 / 0 XP", (() => {
  const e = emptyClubProgression();
  return e.xp === 0 && clubLevelOf(e.xp) === 1 && e.schema === CLUB_PROGRESSION_VERSION;
})());
ck("3) Level 由 XP 推導，state 不落盤 level", (() => {
  const e = emptyClubProgression();
  return !("level" in e) && !("lv" in e);
})());
ck("4) clubLevelOf 單調不減（0..500000 掃描）", (() => {
  let prev = clubLevelOf(0);
  for (let x = 0; x <= 500_000; x += 137) {
    const lv = clubLevelOf(x);
    if (lv < prev) return false;
    prev = lv;
  }
  return true;
})());
ck("5) clubXpForLevel / clubLevelOf 互為反函數（Lv.1..60）", (() => {
  for (let lv = 1; lv <= 60; lv++) {
    const at = clubXpForLevel(lv);
    if (clubLevelOf(at) !== lv) return false;
    if (lv > 1 && clubLevelOf(at - 1) !== lv - 1) return false;
  }
  return true;
})());
ck("6) 級距遞增（後期變長，不是無限線性）", (() => {
  const span = (lv) => clubXpForLevel(lv + 1) - clubXpForLevel(lv);
  return span(1) < span(5) && span(5) < span(12) && span(12) <= span(20);
})());
ck("7) clubProgressToNextLevel 內部一致", (() => {
  for (const xp of [0, 119, 120, 5_000, 47_000, 1_000_000]) {
    const p = clubProgressToNextLevel(xp);
    if (p.level !== clubLevelOf(xp)) return false;
    if (p.intoLevel !== xp - p.levelFloor) return false;
    if (p.intoLevel + p.toNext !== p.levelSpan) return false;
    if (p.percent < 0 || p.percent > 100) return false;
  }
  return true;
})());

// ── B. 授予規則：練習 0、正式 > 競技、勝場加成 ──────────────────────────────
ck("8) 快速練習 = 0 Club XP（勝敗都是）",
  clubXpForMatch({ matchSource: MATCH_SOURCE.practice, win: true }) === 0
  && clubXpForMatch({ matchSource: MATCH_SOURCE.practice, win: false }) === 0);
ck("9) unknown 來源 = 0（查不到不發，保守方向）",
  clubXpForMatch({ matchSource: MATCH_SOURCE.unknown, win: true }) === 0);
ck("10) 一般競技 > 0 且 正式賽季 > 一般競技",
  CLUB_XP_AWARD.competitive > 0 && CLUB_XP_AWARD.official > CLUB_XP_AWARD.competitive);
ck("11) 勝場加成 = 敗場 ×(1+bonus)", (() => {
  for (const src of ["competitive", "official"]) {
    const lose = clubXpForMatch({ matchSource: MATCH_SOURCE[src], win: false });
    const winv = clubXpForMatch({ matchSource: MATCH_SOURCE[src], win: true });
    if (lose !== CLUB_XP_AWARD[src]) return false;
    if (winv !== Math.round(CLUB_XP_AWARD[src] * (1 + CLUB_XP_WIN_BONUS))) return false;
  }
  return true;
})());
ck("12) addClubXp 拒絕負數（不可消耗、只增不減）", (() => {
  const r = addClubXp(emptyClubProgression(), -500);
  return r.progression.xp === 0 && r.gained === 0;
})());

// ── C. 結算整合：唯一授予點 + 冪等 ─────────────────────────────────────────
const mobaPractice = runMoba(mkState(), { win: true, origin: ORIGIN.practice, salt: 1 });
const mobaComp = runMoba(mkState(), { win: true, origin: ORIGIN.competitive, salt: 2 });
const mobaCompLose = runMoba(mkState(), { win: false, origin: ORIGIN.competitive, salt: 3 });
const mobaOfficial = runMoba(mkState(), { win: true, origin: ORIGIN.official, salt: 4 });
const csComp = runCs(mkState(), { win: true, origin: ORIGIN.competitive, matchId: "cs-c" });
const csOfficial = runCs(mkState(), { win: true, origin: ORIGIN.official, matchId: "cs-o" });

ck("13) MOBA 快速練習結算後 Club XP 仍為 0",
  mobaPractice.nextState.clubProgression.xp === 0 && mobaPractice.receipt.club.xpGained === 0);
ck("14) MOBA 一般競技（勝）發出預期 XP",
  mobaComp.nextState.clubProgression.xp === clubXpForMatch({ matchSource: MATCH_SOURCE.competitive, win: true }));
ck("15) MOBA 一般競技（敗）低於勝場但仍 > 0",
  mobaCompLose.nextState.clubProgression.xp > 0
  && mobaCompLose.nextState.clubProgression.xp < mobaComp.nextState.clubProgression.xp);
ck("16) MOBA 正式賽季權重高於一般競技",
  mobaOfficial.nextState.clubProgression.xp > mobaComp.nextState.clubProgression.xp);
ck("17) CS 走同一份授予權威（不改 CS runtime）",
  csComp.nextState.clubProgression.xp === mobaComp.nextState.clubProgression.xp
  && csOfficial.nextState.clubProgression.xp === mobaOfficial.nextState.clubProgression.xp);
ck("18) receipt 帶 club 區塊（Result 畫面只讀不重算）", (() => {
  const c = mobaOfficial.receipt.club;
  return c && typeof c.xpGained === "number" && typeof c.xpBefore === "number"
    && typeof c.xpAfter === "number" && typeof c.levelBefore === "number"
    && typeof c.levelAfter === "number" && typeof c.leveledUp === "boolean"
    && c.xpAfter === c.xpBefore + c.xpGained;
})());
ck("19) 同一場重複結算不重複發 Club XP（冪等）", (() => {
  let s = mkState();
  const tx = mobaResultToTransaction(mkMoba({ win: true, salt: 9 }),
    { players: s.players, streak: 0, fansNow: 1000, origin: ORIGIN.official });
  for (let i = 0; i < 3; i++) {
    const r = applyProgressToState(s, tx);
    if (r.nextState) s = { ...s, ...r.nextState };
  }
  return s.clubProgression.xp === clubXpForMatch({ matchSource: MATCH_SOURCE.official, win: true });
})());
ck("20) 練習賽刷不出永久 Club XP（連打 50 場）", (() => {
  let s = mkState();
  for (let i = 0; i < 50; i++) {
    const r = runMoba(s, { win: true, origin: ORIGIN.practice, salt: 100 + i });
    if (r.nextState) s = { ...s, ...r.nextState };
  }
  return s.clubProgression.xp === 0;
})());
ck("21) 連續正式賽季結算後 Club XP 單調遞增", (() => {
  let s = mkState();
  let prev = 0;
  for (let i = 0; i < 20; i++) {
    const r = runMoba(s, { win: i % 3 !== 0, origin: ORIGIN.official, salt: 200 + i });
    if (!r.nextState) return false;
    s = { ...s, ...r.nextState };
    if (s.clubProgression.xp <= prev) return false;
    prev = s.clubProgression.xp;
  }
  return true;
})());
ck("22) Club XP 與 clubPointsLifetime 是兩份獨立狀態", (() => {
  const before = mobaOfficial.nextState.retention?.clubPointsLifetime ?? 0;
  //  兩者不同源：Club XP 由來源權重決定，clubPointsLifetime 由目標系統決定。
  return mobaOfficial.nextState.clubProgression.xp !== before
    || mobaOfficial.nextState.clubProgression.xp === CLUB_XP_AWARD.official * 1.5;
})());
ck("23) 結算不動 clubAssets（永久所有權不受影響）", (() => {
  const s = mkState({ clubAssets: { schema: "ClubAssets.v1", owned: ["coach_a"], equipped: {} } });
  const r = runMoba(s, { win: true, origin: ORIGIN.official, salt: 300 });
  const after = r.nextState.clubAssets ?? s.clubAssets;
  return after.owned.length === 1 && after.owned[0] === "coach_a";
})());

// ── D. Migration / normalize ───────────────────────────────────────────────
ck("24) 舊存檔（無 clubProgression）→ 由 clubPointsLifetime 保守 bootstrap", (() => {
  const p = normalizeClubProgression(undefined, { clubPointsLifetime: 4000 });
  return p.xp === Math.floor(4000 * BOOTSTRAP_RATIO) && p.schema === CLUB_PROGRESSION_VERSION;
})());
ck("25) bootstrap 不引用假的 Lv.93 / 72700", (() => {
  const p = normalizeClubProgression(undefined, { clubPointsLifetime: 0, team: { lv: 93, xp: 7.27, xpMax: 12.1 } });
  return p.xp === 0 && clubLevelOf(p.xp) === 1;
})());
ck("26) 全新存檔（lifetime 0）→ Lv.1 / 0 XP", (() => {
  const p = normalizeClubProgression(undefined, { clubPointsLifetime: 0 });
  return p.xp === 0 && clubLevelOf(p.xp) === 1;
})());
ck("27) migration 只做一次：已有 clubProgression 就不再 bootstrap", (() => {
  const once = normalizeClubProgression(undefined, { clubPointsLifetime: 10_000 });
  const twice = normalizeClubProgression(once, { clubPointsLifetime: 10_000 });
  return twice.xp === once.xp;
})());
ck("28) reload 冪等：normalize(normalize(x)) === normalize(x)", (() => {
  for (const raw of [undefined, null, {}, { xp: 1234 }, { schema: "x", xp: "88" }, { xp: -5 }, { xp: NaN }]) {
    const a = normalizeClubProgression(raw, { clubPointsLifetime: 3000 });
    const b = normalizeClubProgression(a, { clubPointsLifetime: 3000 });
    if (JSON.stringify(a) !== JSON.stringify(b)) return false;
  }
  return true;
})());
ck("29) 髒資料一律夾回合法值（負數 / NaN / 字串 / 小數）", (() => {
  const cases = [[{ xp: -900 }, 0], [{ xp: NaN }, 0], [{ xp: "450" }, 450], [{ xp: 10.7 }, 10]];
  return cases.every(([raw, want]) => normalizeClubProgression(raw, {}).xp === want);
})());
ck("30) migration 後 Club XP 與 clubPointsLifetime 正式分離", (() => {
  //  bootstrap 之後再賺點數，Club XP 不得跟著動。
  const p = normalizeClubProgression(undefined, { clubPointsLifetime: 4000 });
  const later = normalizeClubProgression(p, { clubPointsLifetime: 99_999 });
  return later.xp === p.xp;
})());
ck("31) 存檔切片只有 schema + xp（+ 一次性 migration 註記）", (() => {
  const keys = Object.keys(normalizeClubProgression(undefined, { clubPointsLifetime: 4000 })).sort();
  return keys.every((k) => ["schema", "xp", "migratedFromLifetime"].includes(k));
})());

// ── E. View（Home 讀的那一份）──────────────────────────────────────────────
ck("32) clubProgressionViewOf 給 Home 需要的欄位", (() => {
  const v = clubProgressionViewOf({ schema: CLUB_PROGRESSION_VERSION, xp: 900 }, { clubPointsLifetime: 0 });
  return ["xp", "level", "intoLevel", "levelSpan", "toNext", "percent"].every((k) => typeof v[k] === "number");
})());
ck("33) View 的 level 與 domain 同源（畫面不自己算門檻）", (() => {
  for (const xp of [0, 300, 5_000, 120_000]) {
    const v = clubProgressionViewOf({ schema: CLUB_PROGRESSION_VERSION, xp }, {});
    if (v.level !== clubLevelOf(xp)) return false;
  }
  return true;
})());

// ── F. 量級投影（不是斷言，是要印出來給 Owner 看的數字）────────────────────
const XP_COMP_WIN = clubXpForMatch({ matchSource: MATCH_SOURCE.competitive, win: true });
const XP_COMP_LOSE = clubXpForMatch({ matchSource: MATCH_SOURCE.competitive, win: false });
const XP_OFF_WIN = clubXpForMatch({ matchSource: MATCH_SOURCE.official, win: true });
const XP_OFF_LOSE = clubXpForMatch({ matchSource: MATCH_SOURCE.official, win: false });
//  一個賽季每隊打幾場正式賽：8 隊雙循環 ⇒ 14 輪，每隊 14 場
//  （來源：src/platform/competition/scheduleGenerator.js:15）。季後賽最多再 2 場
//  （準決＋決賽／季軍戰，playoffs.js:150-161），這裡取保守的常規賽 14 場。
const SEASON_FIXTURES = 14;
const WINRATE = 0.5;
const seasonXp = Math.round(SEASON_FIXTURES * (WINRATE * XP_OFF_WIN + (1 - WINRATE) * XP_OFF_LOSE));

const proj = [
  ["1 場一般競技（勝）", XP_COMP_WIN],
  ["1 場一般競技（敗）", XP_COMP_LOSE],
  ["1 場正式賽季（勝）", XP_OFF_WIN],
  ["1 場正式賽季（敗）", XP_OFF_LOSE],
  [`1 個生涯賽季（${SEASON_FIXTURES} 場正式 · 勝率 50%）`, seasonXp],
  ["3 個賽季", seasonXp * 3],
  ["10 個賽季", seasonXp * 10],
];
for (const [label, xp] of proj) {
  const p = clubProgressToNextLevel(xp);
  notes.push(`   ${label.padEnd(34)} → ${String(xp).padStart(7)} XP  ⇒ Lv.${p.level}`);
}
ck("34) 一個賽季拿得到看得見的等級（≥ Lv.3）", clubLevelOf(seasonXp) >= 3);
ck("35) 十個賽季不會爆掉（Lv. ≤ 60，仍在手工表＋線性尾巴範圍內）", clubLevelOf(seasonXp * 10) <= 60);
ck("36) 十季 > 三季 > 一季（曲線不飽和）",
  clubLevelOf(seasonXp * 10) > clubLevelOf(seasonXp * 3)
  && clubLevelOf(seasonXp * 3) > clubLevelOf(seasonXp));

// ── 輸出 ───────────────────────────────────────────────────────────────────
console.log("\n=== Club Progression v1 ===\n");
let pass = 0;
for (const [name, ok] of A) {
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  if (ok) pass++;
}
console.log("\n--- Club XP 量級投影（勝率 50%）---");
for (const line of notes) console.log(line);
console.log(`\n前 20 級門檻：${Array.from({ length: 20 }, (_, i) => clubXpForLevel(i + 2)).join(" / ")}`);
console.log(`\n${pass}/${A.length} 通過`);
process.exit(pass === A.length ? 0 : 1);
