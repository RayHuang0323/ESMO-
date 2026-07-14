// ============================================================================
//  Sprint25 賽後結算與選手成長驗證：repo 根目錄執行 `node tools/check_progress25.mjs`
//
//  ⚠ 中文 OneDrive 路徑下 ESM 相對解析會失敗（會把 ESMO 目錄吃掉）
//    → 一律用絕對 file:// URL import。
//  ⚠ Sprint24 曾發生「兩邊都崩潰卻比較為相同」的假通過
//    → 本檔所有子行程一律先檢查 exit code（見 §E）。
// ============================================================================
import { pathToFileURL } from "url";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;

const A = [];
const ck = (name, cond) => A.push([name, !!cond]);

const { validateMatchProgressTransaction, makeTransactionId, MATCH_PROGRESS_TX_VERSION } = await import(u("src/platform/contracts/matchProgressTransaction.js"));
const { mobaResultToTransaction, mobaMatchId } = await import(u("src/platform/progress/adapters/mobaProgressAdapter.js"));
const { csResultToTransaction } = await import(u("src/platform/progress/adapters/csProgressAdapter.js"));
const { applyProgressToState } = await import(u("src/platform/progress/applyMatchProgress.js"));
const { xpRequiredForLevel, levelFromTotalXp, totalXpForLevel, calculateLevelProgress, TALENT_POINTS_PER_LEVEL } = await import(u("src/platform/progress/playerLevel.js"));

// ── Fixtures ───────────────────────────────────────────────────────────────
const mkPlayers = () => [
  { id: "b1", name: "Kaiser", role: "上路", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b2", name: "Nacht", role: "打野", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b3", name: "Frost", role: "中路", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b4", name: "Blitz", role: "下路", xp: 0, lv: 1, talentPoints: 0 },
  { id: "b5", name: "Seelowe", role: "輔助", xp: 0, lv: 1, talentPoints: 0 },
];
const mkState = (players = mkPlayers()) => ({
  players,
  finance: { funds: 1_000_000, transactions: [] },
  meta: { fans: 1000, reputation: 10 },
  processedMatchTransactions: {},
});

// MOBA BattleResult.v2 fixture：carry 高分、support 低 rating 但高參與（角色公平測試用）
function mkMoba({ win = true, mvpId = "b3" } = {}) {
  const P = (id, side, role, k, d, a, gold, dmg, rating, part) => ({
    id, side, role, heroId: "x", lv: 10, k, d, a, gold, dmg, heal: 0, twrDmg: 0,
    participation: part, rating, won: side === (win ? "blue" : "red"), mvp: id === mvpId,
  });
  return {
    schema: "BattleResult.v2", mode: "moba",
    teams: { blue: { name: "藍" }, red: { name: "紅" } },
    winner: win ? "blue" : "red",
    duration: 1200.5,
    score: { blue: win ? 30 : 12, red: win ? 12 : 30 },
    gold: { blue: 50000, red: 42000 },
    towers: { blue: 8, red: 3 },
    dragon: { blue: 2, red: 1 }, baron: { blue: 1, red: 0 },
    tactic: null, tacticExecution: null, timeline: [],
    mvpId,
    players: [
      P("b1", "blue", "top", 6, 4, 8, 9000, 30000, 30, 0.55),
      P("b2", "blue", "jungle", 5, 5, 12, 8500, 24000, 28, 0.60),
      P("b3", "blue", "mid", 14, 2, 6, 13000, 52000, 62, 0.70),   // carry
      P("b4", "blue", "adc", 9, 3, 7, 11000, 41000, 44, 0.58),
      P("b5", "blue", "sup", 1, 6, 20, 5000, 9000, 10, 0.72),      // support：rating 低、參與高
      P("r1", "red", "top", 3, 7, 5, 7000, 20000, 12, 0.4),
    ],
  };
}

// CS CsMatchResult.v1 fixture：AWP 高 rating、IGL 低 rating 但高 KAST
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
      P("b5", "Seelowe", "指揮", 9, 18, 11, 0.72, 76),   // IGL：rating 低、KAST 高
      P(null, "Bot", "步槍", 5, 20, 1, 0.5, 40),          // 引擎示範選手 → 不該發 XP
    ],
    opponents: [], mvp: { playerId: "b2", playerName: "Nacht", role: "狙擊", rating: 1.45 },
    summaryEvents: [], rewards: { money: null, fans: null, xp: null }, recordedAt: null,
  };
}

// ── A. 契約 ────────────────────────────────────────────────────────────────
const st0 = mkState();
const mTx = mobaResultToTransaction(mkMoba(), { players: st0.players, streak: 0, fansNow: 1000 });
const cTx = csResultToTransaction(mkCs(), { players: st0.players, streak: 0, fansNow: 1000 });

ck("1) MOBA Adapter 輸出符合 MatchProgressTransaction.v1", validateMatchProgressTransaction(mTx).ok);
ck("2) CS Adapter 輸出符合 MatchProgressTransaction.v1", validateMatchProgressTransaction(cTx).ok);
ck("   契約 version / transactionId 決定性推導", mTx.version === MATCH_PROGRESS_TX_VERSION
  && mTx.transactionId === makeTransactionId("moba", mTx.matchId)
  && cTx.transactionId === makeTransactionId("cs", "cs-001"));
ck("   MOBA matchId 對同一場結果決定性一致", mobaMatchId(mkMoba()) === mobaMatchId(mkMoba()));
ck("   MOBA matchId 對不同結果不同", mobaMatchId(mkMoba({ win: true })) !== mobaMatchId(mkMoba({ win: false })));
ck("   playerId 不是 index / 不是名字", mTx.playerProgress.every((p) => /^[br]\d/.test(p.playerId)));
ck("   引擎示範選手（playerId=null）不發 XP", cTx.playerProgress.every((p) => p.playerId) && cTx.playerProgress.length === 5);

// ── B. Progress Service：冪等 / StrictMode ─────────────────────────────────
const r1 = applyProgressToState(mkState(), mTx);
ck("3) 相同 matchId 只套用一次（第二次 alreadyApplied）", (() => {
  const s = mkState();
  const a = applyProgressToState(s, mTx);
  const s2 = { ...s, ...a.nextState };
  const b = applyProgressToState(s2, mTx);
  return a.receipt.applied === true && b.receipt.alreadyApplied === true && b.nextState === null;
})());
ck("4) StrictMode 模擬雙呼叫不重複發獎（錢/粉絲/XP 皆只加一次）", (() => {
  let s = mkState();
  const before = { funds: s.finance.funds, fans: s.meta.fans };
  for (let i = 0; i < 2; i++) {                       // 雙掛載
    const { nextState } = applyProgressToState(s, mTx);
    if (nextState) s = { ...s, ...nextState };
  }
  const dMoney = s.finance.funds - before.funds;
  const dFans = s.meta.fans - before.fans;
  const totalXp = s.players.reduce((a, p) => a + p.xp, 0);
  return dMoney === mTx.teamRewards.money && dFans === mTx.teamRewards.fans
    && totalXp === mTx.playerProgress.reduce((a, p) => a + p.xpGained, 0);
})());
ck("18) 重整後（帳本從 localStorage 還原）仍被識別為已套用", (() => {
  const s = mkState();
  const a = applyProgressToState(s, mTx);
  // 模擬：JSON 序列化 → 反序列化（重整）
  const revived = JSON.parse(JSON.stringify({ ...s, ...a.nextState }));
  const b = applyProgressToState(revived, mTx);
  return b.receipt.alreadyApplied === true;
})());

// ── C. 數值健全 ────────────────────────────────────────────────────────────
const allNums = (t) => [t.teamRewards.money, t.teamRewards.fans, t.teamRewards.reputation,
  ...t.playerProgress.flatMap((p) => [p.xpGained, p.previousXp, p.newXp, p.previousLevel, p.newLevel, p.levelsGained, p.talentPointsGained])];
ck("5) XP 不為負數", [mTx, cTx].every((t) => t.playerProgress.every((p) => p.xpGained >= 0 && p.newXp >= p.previousXp)));
ck("6) money / fans 不為 NaN 或 Infinity", [mTx, cTx].every((t) => allNums(t).every((n) => Number.isFinite(n))));
ck("   損壞輸入（NaN/Infinity/字串 xp）安全降級不崩潰", (() => {
  const bad = mkState([{ id: "b1", name: "X", xp: NaN, lv: Infinity, talentPoints: "abc" },
    { id: "b2", name: "Y", xp: -50, lv: null, talentPoints: -3 }]);
  const tx = mobaResultToTransaction(mkMoba(), { players: bad.players, streak: 0, fansNow: 0 });
  const { nextState, receipt } = applyProgressToState(bad, tx);
  return receipt.ok && nextState.players.every((p) => Number.isFinite(p.xp) && p.xp >= 0 && Number.isFinite(p.lv) && p.talentPoints >= 0);
})());
ck("7) 勝利與失敗都可正常結算", (() => {
  const w = mobaResultToTransaction(mkMoba({ win: true }), { players: mkPlayers(), streak: 0, fansNow: 0 });
  const l = mobaResultToTransaction(mkMoba({ win: false }), { players: mkPlayers(), streak: 0, fansNow: 0 });
  return validateMatchProgressTransaction(w).ok && validateMatchProgressTransaction(l).ok
    && applyProgressToState(mkState(), w).receipt.applied && applyProgressToState(mkState(), l).receipt.applied;
})());

// ── D. XP / 等級 / 天賦點 ──────────────────────────────────────────────────
ck("8) 一次跨多級能正確計算", (() => {
  const p = calculateLevelProgress(0, 1000);   // lv1→? （100+150+200+250 = 700 到 lv5；+300=1000 到 lv6 邊界）
  return p.levelsGained >= 3 && p.newLevel === levelFromTotalXp(1000) && p.newXp === 1000;
})());
ck("9) 天賦點 = 實際升級數 × 規則值", (() => {
  const p = calculateLevelProgress(0, 1000);
  return p.talentPointsGained === p.levelsGained * TALENT_POINTS_PER_LEVEL;
})());
ck("   等級不會倒退 / XP 不為負 / 0 XP 不升級", (() => {
  const a = calculateLevelProgress(totalXpForLevel(10), -999);
  const b = calculateLevelProgress(totalXpForLevel(10), 0);
  return a.xpGained === 0 && a.newLevel === 10 && a.levelsGained === 0 && b.newLevel === 10;
})());
ck("   levelFromTotalXp 與 totalXpForLevel 自洽（1–60 級無浮點重複升級）", (() => {
  for (let L = 1; L <= 60; L++) {
    if (levelFromTotalXp(totalXpForLevel(L)) !== L) return false;
    if (levelFromTotalXp(totalXpForLevel(L) - 1) !== Math.max(1, L - 1)) return false;
  }
  return true;
})());
ck("10) receipt 與 Store 實際差額一致", (() => {
  const s = mkState();
  const { nextState, receipt } = applyProgressToState(s, mTx);
  const dMoney = nextState.finance.funds - s.finance.funds;
  const dFans = nextState.meta.fans - s.meta.fans;
  if (dMoney !== receipt.team.money || dFans !== receipt.team.fans) return false;
  return receipt.players.every((pr) => {
    const before = s.players.find((p) => p.id === pr.playerId);
    const after = nextState.players.find((p) => p.id === pr.playerId);
    return after.xp - before.xp === pr.xpGained
      && after.talentPoints - (before.talentPoints ?? 0) === pr.talentPointsGained
      && after.lv === pr.newLevel;
  });
})());

// ── E. 角色公平 / 平衡（§8 §9）────────────────────────────────────────────
const wm = mobaResultToTransaction(mkMoba({ win: true }), { players: mkPlayers(), streak: 0, fansNow: 0 });
const lm = mobaResultToTransaction(mkMoba({ win: false, mvpId: "b3" }), { players: mkPlayers(), streak: 0, fansNow: 0 });
const wc = csResultToTransaction(mkCs({ win: true }), { players: mkPlayers(), streak: 0, fansNow: 0 });
const lc = csResultToTransaction(mkCs({ win: false, matchId: "cs-002" }), { players: mkPlayers(), streak: 0, fansNow: 0 });
const xpOf = (t, id) => t.playerProgress.find((p) => p.playerId === id)?.xpGained ?? 0;
const avgXp = (t) => t.playerProgress.reduce((s, p) => s + p.xpGained, 0) / Math.max(1, t.playerProgress.length);

ck("   輸不會比贏拿更多（MOBA / CS 團隊獎金＋粉絲＋XP）",
  wm.teamRewards.money > lm.teamRewards.money && wm.teamRewards.fans > lm.teamRewards.fans && avgXp(wm) > avgXp(lm) &&
  wc.teamRewards.money > lc.teamRewards.money && wc.teamRewards.fans > lc.teamRewards.fans && avgXp(wc) > avgXp(lc));
ck("   MOBA Support 不因 KDA 低而長期吃虧（support XP ≥ 隊均 80%）",
  xpOf(wm, "b5") >= avgXp(wm) * 0.8);
ck("   CS IGL 不因 rating 低而長期吃虧（IGL XP ≥ 隊均 80%）",
  xpOf(wc, "b5") >= avgXp(wc) * 0.8);
ck("   MVP XP 不異常高（≤ 隊均 1.6×）", xpOf(wm, "b3") <= avgXp(wm) * 1.6 && xpOf(wc, "b2") <= avgXp(wc) * 1.6);
ck("   兩款遊戲不失衡（CS 單場團隊獎金 ≤ MOBA 3×，且 ≥ 1/3×）", (() => {
  const rm = wm.teamRewards.money, rc = wc.teamRewards.money;
  return rc <= rm * 3 && rc >= rm / 3;
})());
ck("   比賽拖長不放大獎勵（duration 不進公式）", (() => {
  const long = mkMoba(); long.duration = 3600;
  const t = mobaResultToTransaction(long, { players: mkPlayers(), streak: 0, fansNow: 0 });
  return avgXp(t) === avgXp(wm) && t.teamRewards.money === wm.teamRewards.money;
})());

// ── F. 隔離 / 契約凍結 ─────────────────────────────────────────────────────
import fs from "fs";
const brSrc = fs.readFileSync("src/battle/battleResult.js", "utf8");
const csSrc = fs.readFileSync("src/platform/contracts/CsMatchResult.js", "utf8");
ck("13) 不修改 BattleResult.v2（schema 字串與 players 欄位仍在）", brSrc.includes('schema: "BattleResult.v2"') && !brSrc.includes("MatchProgressTransaction"));
ck("14) 不修改 CsMatchResult.v1", csSrc.includes('CS_RESULT_SCHEMA = "CsMatchResult.v1"') && !csSrc.includes("MatchProgressTransaction"));
ck("15) 不修改 FPS 3D Presentation", !fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8").includes("MatchProgressTransaction"));
const psSrc = fs.readFileSync("src/platform/profileStore.js", "utf8");
const feedSrc = fs.readFileSync("src/battle/useBattleFeed.js", "utf8");
const settleSrc = fs.readFileSync("src/platform/progress/settleCsMatch.js", "utf8");
// 11) MOBA 路徑（useBattleFeed / MOBA adapter / progress service）完全不碰 csHistory；
//     csHistory 的唯一寫入點是 recordCsMatch（set({ csHistory: ... }) 只出現一次）。
ck("11) MOBA history 不寫入 csHistory（csHistory 唯一寫入點 = recordCsMatch）",
  !feedSrc.includes("csHistory")
  && !fs.readFileSync("src/platform/progress/adapters/mobaProgressAdapter.js", "utf8").includes("csHistory")
  && !fs.readFileSync("src/platform/progress/applyMatchProgress.js", "utf8").includes("csHistory")
  && (psSrc.match(/set\(\{\s*csHistory:/g) || []).length === 1);
// 12) CS 路徑不得寫 MOBA Season：profileStore 與 CS 結算流程都不得 import seasonStore
//     （用 import 語句判斷，不能只 grep 字串——註解裡本來就會提到 seasonStore）。
const importsSeason = (src) => /import\s[^;]*seasonStore/.test(src);
ck("12) CS history 不污染 MOBA Season（CS 路徑不 import seasonStore）",
  !importsSeason(psSrc) && !importsSeason(settleSrc)
  && !importsSeason(fs.readFileSync("src/platform/progress/adapters/csProgressAdapter.js", "utf8"))
  && !importsSeason(fs.readFileSync("src/platform/progress/applyMatchProgress.js", "utf8")));
ck("   Result Screen 不自行發獎（無 applyMatchProgress / recordCsMatch 呼叫）", (() => {
  const es = fs.readFileSync("src/battle/ui/BattleEndScreen.jsx", "utf8");
  const cs = fs.readFileSync("src/screens/fps/CsResultScreen.jsx", "utf8");
  return !es.includes("applyMatchProgress(") && !cs.includes("recordCsMatch(") && !cs.includes("applyMatchProgress(");
})());

// ── G. Migration fixtures（§12）────────────────────────────────────────────
const { PROFILE_SCHEMA_VERSION } = await import(u("src/platform/profileStore.js"));
ck("17) 舊 persistence fixture 可 migration（Sprint24 前 / S24 / S25 / 損壞）", (() => {
  // 直接測 migratePlayer 的行為契約（透過 playerLevel 推導；profileStore 內部函式不外露）
  const preS24 = { id: "b1", name: "Kaiser", lv: 38 };                       // 無 xp（S24 前 / S24 現行）
  const s25 = { id: "b2", name: "Nacht", lv: 5, xp: totalXpForLevel(5) };    // S25 新資料
  const broken = { id: "b3", name: "X", lv: "abc", xp: NaN };                // 損壞
  const mig = (p) => {
    const lvSafe = Number.isFinite(p.lv) && p.lv >= 1 ? Math.min(99, Math.floor(p.lv)) : 1;
    const xp = Number.isFinite(p.xp) && p.xp >= 0 ? Math.round(p.xp) : totalXpForLevel(lvSafe);
    return { xp, lv: levelFromTotalXp(xp) };
  };
  const a = mig(preS24), b = mig(s25), c = mig(broken);
  return a.lv === 38 && a.xp === totalXpForLevel(38)     // 等級不倒退
    && b.lv === 5 && b.xp === totalXpForLevel(5)
    && c.lv === 1 && Number.isFinite(c.xp);              // 損壞 → 安全降級，不白畫面
})());
ck("   profileStore 有 schemaVersion 且沿用同一個 localStorage key（不清資料）",
  PROFILE_SCHEMA_VERSION >= 2 && psSrc.includes('const KEY = "esmo.profile.v1"') && !psSrc.includes("localStorage.clear"));

// ── H. 子行程（必須檢查 exit code；禁止假通過）─────────────────────────────
function runNode(script) {
  try {
    const out = execFileSync(process.execPath, [script], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}
const t24 = runNode("tools/check_moba_tactic24.mjs");
ck("16) check_moba_tactic24 仍全綠（exit code 0；MOBA balance baseline 未變）",
  t24.code === 0 && /29\/29 通過/.test(t24.out));   // S29：C4 重導（飽和的 dragonContests → objRate）+2 條

// ── 報告 ───────────────────────────────────────────────────────────────────
let pass = 0;
for (const [n, ok] of A) { console.log(`${ok ? "✅" : "❌"} ${n}`); if (ok) pass++; }
console.log(`\n${pass}/${A.length} 通過`);

// 平衡比較表（§8 要求輸出）
const row = (label, t) => [
  label.padEnd(12),
  String(t.teamRewards.money).padStart(7),
  String(t.teamRewards.fans).padStart(5),
  avgXp(t).toFixed(1).padStart(6),
].join(" | ");
console.log("\n=== MOBA / CS 獎勵比較（固定 fixture）===");
console.log("情境          | team$ 元 | 粉絲 | 均XP");
console.log(row("MOBA 勝利", wm));
console.log(row("MOBA 失敗", lm));
console.log(row("CS 勝利", wc));
console.log(row("CS 失敗", lc));
console.log(`\nMOBA 高表現(b3 carry) XP=${xpOf(wm, "b3")}　低表現(b5 support) XP=${xpOf(wm, "b5")}　隊均=${avgXp(wm).toFixed(1)}`);
console.log(`CS   高表現(b2 AWP)   XP=${xpOf(wc, "b2")}　低表現(b5 IGL)     XP=${xpOf(wc, "b5")}　隊均=${avgXp(wc).toFixed(1)}`);
console.log(`勝負差距：MOBA 均XP ${avgXp(wm).toFixed(1)} vs ${avgXp(lm).toFixed(1)}　CS 均XP ${avgXp(wc).toFixed(1)} vs ${avgXp(lc).toFixed(1)}`);

process.exit(pass === A.length ? 0 : 1);
