#!/usr/bin/env node
// ============================================================================
//  tools/check_growth_loop_p0.mjs — Milestone P0：等級 → 能力成長
//
//  執行：repo 根目錄 `node tools/check_growth_loop_p0.mjs`；**失敗時 exit 1**。
//
//  分析發現的缺口：升級只發天賦點，玩家不手動花掉就**完全不影響實力**。
//  本檔驗這一段真的接上了：
//    ① 升級會提升基礎能力，且分配依定位（沿用 POSITION_PROFILE，非第二套規則）
//    ② 完全決定性（無亂數、無時鐘），伺服器可重算
//    ③ 尊重潛力上限與 99 硬上限；越接近上限成長越慢
//    ④ 走 S25 唯一結算入口；同一場重送不會二次成長
//    ⑤ 成長真的傳到對戰輸入（CS 引擎短鍵、MOBA 行為 mods）
//    ⑥ 天賦點照發，兩套成長不互相取代、不重複計算
// ============================================================================
import {
  LEVEL_GROWTH, applyLevelGrowth, growthKeysFor, growthSummary,
} from "../src/platform/progress/levelGrowth.js";
import { applyProgressToState } from "../src/platform/progress/applyMatchProgress.js";
import { createMatchProgressTransaction } from "../src/platform/contracts/matchProgressTransaction.js";
import { POSITION_PROFILE, statZh } from "../src/data/playerModel.js";
import { getPlayerDerivedStats } from "../src/platform/talents/playerDerivedStats.js";
import { toFpsRoster } from "../src/battle/fps/fpsRoster.js";
import { toEnginePlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { levelFromTotalXp, totalXpForLevel, TALENT_POINTS_PER_LEVEL } from "../src/platform/progress/playerLevel.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const statsAll = (v) => Object.fromEntries(
  ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability",
    "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"].map((k) => [k, v]));
const mkPlayer = (id, role, over = {}) => ({
  id, name: `P-${id}`, role, lv: 5, xp: totalXpForLevel(5), energy: 95, morale: 80,
  personality: "steady", condition: "精神飽滿", stats: statsAll(60), potential: 90,
  talentPoints: 0, rosterTier: "active", ...over,
});
const LANES = ["上路", "打野", "中路", "下路", "輔助"];
const ROSTER = LANES.map((lane, i) => mkPlayer(`s${i + 1}`, lane));

console.log("══ Milestone P0：等級 → 能力成長 ══\n");

// ── 1) 升級會提升能力，且依定位分配 ────────────────────────────────────
{
  const mid = mkPlayer("m", "中路");
  const g = applyLevelGrowth(mid, 1);
  ck("1) 升一級會提升基礎能力", g.total > 0, `共 +${g.total} 點`);
  const keys = growthKeysFor(mid);
  ck("1b) 成長分配沿用 POSITION_PROFILE（不是第二套定位規則）",
    JSON.stringify(keys) === JSON.stringify(POSITION_PROFILE["MOBA中路"].key), keys.join("/"));
  ck("1c) 只成長該定位的主能力，其他項不動",
    Object.keys(g.gains).every((k) => keys.includes(k)) &&
    Object.keys(mid.stats).filter((k) => !keys.includes(k)).every((k) => g.stats[k] === mid.stats[k]),
    growthSummary(g.gains, statZh));
  //  權重遞減：第一項成長最多
  const ordered = keys.map((k) => g.gains[k] ?? 0);
  ck("1d) 依 5/4/3/2/1 權重遞減分配",
    ordered.every((v, i) => i === 0 || v <= ordered[i - 1]), ordered.join(" ≥ "));
  //  不同定位 → 不同成長項
  const sup = applyLevelGrowth(mkPlayer("p", "輔助"), 1);
  ck("1e) 不同定位成長的項目不同",
    JSON.stringify(Object.keys(g.gains).sort()) !== JSON.stringify(Object.keys(sup.gains).sort()),
    `中路 ${Object.keys(g.gains).join("/")}｜輔助 ${Object.keys(sup.gains).join("/")}`);
  //  升多級 → 成長更多
  ck("1f) 升多級成長更多", applyLevelGrowth(mid, 3).total > g.total,
    `1 級 +${g.total}｜3 級 +${applyLevelGrowth(mid, 3).total}`);
  ck("1g) 沒升級 → 完全不成長",
    applyLevelGrowth(mid, 0).total === 0 && Object.keys(applyLevelGrowth(mid, 0).gains).length === 0);
}

// ── 2) 決定性 ──────────────────────────────────────────────────────────
{
  const p = mkPlayer("d", "上路");
  ck("2) 同一輸入重算逐欄相同（無亂數、無時鐘）",
    JSON.stringify(applyLevelGrowth(p, 2)) === JSON.stringify(applyLevelGrowth(p, 2)));
  ck("2b) 不修改輸入物件（純函式）",
    (() => { const before = JSON.stringify(p); applyLevelGrowth(p, 2); return JSON.stringify(p) === before; })());
}

// ── 3) 潛力上限與收斂 ──────────────────────────────────────────────────
{
  const low = mkPlayer("lo", "中路", { potential: 62, stats: statsAll(60) });
  const g = applyLevelGrowth(low, 5);
  ck("3) 成長不得超過潛力上限",
    Object.values(g.stats).every((v) => v <= low.potential), `潛力 ${low.potential}｜最高 ${Math.max(...Object.values(g.stats))}`);
  const capped = mkPlayer("cap", "中路", { potential: 60, stats: statsAll(60) });
  ck("3b) 已達潛力上限 → 不再成長", applyLevelGrowth(capped, 10).total === 0);
  //  越接近上限成長越慢
  const far = applyLevelGrowth(mkPlayer("far", "中路", { potential: 95, stats: statsAll(50) }), 1).total;
  const near = applyLevelGrowth(mkPlayer("near", "中路", { potential: 95, stats: statsAll(92) }), 1).total;
  ck("3c) 越接近潛力上限，成長越慢", far > near, `距上限 45 → +${far}｜距上限 3 → +${near}`);
  const genius = applyLevelGrowth(mkPlayer("g", "中路", { potential: 99, stats: statsAll(20) }), 1);
  ck("3d) 單項每級成長有上限（極端潛力不暴衝）",
    Math.max(...Object.values(genius.gains)) <= LEVEL_GROWTH.perStatCap,
    `最大單項 +${Math.max(...Object.values(genius.gains))}（上限 ${LEVEL_GROWTH.perStatCap}）`);
  ck("3e) 不會超過 99 硬上限",
    Object.values(applyLevelGrowth(mkPlayer("h", "中路", { potential: 99, stats: statsAll(99) }), 5).stats)
      .every((v) => v <= LEVEL_GROWTH.hardCap));
  ck("3f) 沒有定位時平均分配（不編造欄位、不當掉）",
    (() => {
      const g2 = applyLevelGrowth(mkPlayer("n", null), 1);
      return g2.total > 0 && Object.keys(g2.gains).every((k) => k in statsAll(0));
    })());
}

// ── 4) 走 S25 唯一結算入口，且不會二次成長 ────────────────────────────
{
  const state = {
    meta: { days: 8, week: 2, season: 1, fans: 1000, reputation: 40 },
    finance: { funds: 1_000_000, transactions: [] },
    players: ROSTER.map((p) => ({ ...p })),
    economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: "standard", formLog: [] },
    processedMatchTransactions: {},
  };
  //  一次給足夠 XP 讓他們升級
  const need = totalXpForLevel(7) - totalXpForLevel(5);
  const tx = createMatchProgressTransaction({
    mode: "moba", matchId: "g-1", sourceResultVersion: "BattleResult.v2",
    teamRewards: { money: 0, fans: 0, reputation: 0 },
    playerProgress: ROSTER.map((p) => ({
      playerId: p.id, xpGained: need, previousXp: p.xp, newXp: p.xp + need,
      previousLevel: 5, newLevel: 7, levelsGained: 2, talentPointsGained: 2, reasons: [],
    })),
    metadata: { winner: "us" },
  });
  const applied = applyProgressToState(state, tx);
  const after = applied.nextState.players;
  const before = state.players;
  ck("4) 賽後升級 → 能力真的變高",
    after[2].stats.accuracy > before[2].stats.accuracy,
    `中路 accuracy ${before[2].stats.accuracy} → ${after[2].stats.accuracy}`);
  ck("4b) 等級確實由 xp 導出（未破壞 S25 規則）",
    after.every((p, i) => p.lv === levelFromTotalXp(p.xp) && p.lv > before[i].lv));
  ck("4c) receipt 帶成長明細（可顯示前後差異）",
    applied.receipt.players.every((r) => r.growth && typeof r.growth.total === "number") &&
    applied.receipt.players[2].growth.total > 0,
    growthSummary(applied.receipt.players[2].growth.gains, statZh));
  ck("4d) **天賦點照發**（兩套成長不互相取代）",
    after.every((p, i) => p.talentPoints === before[i].talentPoints + 2 * TALENT_POINTS_PER_LEVEL));
  //  冪等：同一場再結算
  const again = applyProgressToState({ ...state, ...applied.nextState }, tx);
  ck("4e) **同一場重送 → 不會二次成長**",
    again.nextState === null && again.receipt.alreadyApplied === true);
  ck("4f) 沒升級的比賽不會有成長", (() => {
    const st2 = { ...state, players: after.map((p) => ({ ...p })), processedMatchTransactions: {} };
    const tx2 = createMatchProgressTransaction({
      mode: "moba", matchId: "g-2", sourceResultVersion: "BattleResult.v2",
      teamRewards: { money: 0, fans: 0, reputation: 0 },
      playerProgress: after.map((p) => ({
        playerId: p.id, xpGained: 1, previousXp: p.xp, newXp: p.xp + 1,
        previousLevel: p.lv, newLevel: p.lv, levelsGained: 0, talentPointsGained: 0, reasons: [],
      })),
      metadata: { winner: "us" },
    });
    const r = applyProgressToState(st2, tx2);
    return r.receipt.players.every((x) => x.growth.total === 0);
  })());
}

// ── 5) 成長真的傳到對戰輸入 ────────────────────────────────────────────
{
  const beforeP = mkPlayer("b1x", "中路");
  const grown = { ...beforeP, lv: 10, stats: applyLevelGrowth(beforeP, 5).stats };
  ck("5) 成長進得了 derived stats（天賦疊在基礎值上，不重複計算）",
    getPlayerDerivedStats(grown).accuracy > getPlayerDerivedStats(beforeP).accuracy,
    `${getPlayerDerivedStats(beforeP).accuracy} → ${getPlayerDerivedStats(grown).accuracy}`);
  //  CS：引擎短鍵
  const csBefore = toFpsRoster(LANES.map((l, i) => mkPlayer(`c${i}`, l)).map((p) => ({ ...p, status: "主力" })), null);
  const csAfter = toFpsRoster(LANES.map((l, i) => {
    const p = mkPlayer(`c${i}`, l);
    return { ...p, status: "主力", stats: applyLevelGrowth(p, 5).stats };
  }), null);
  ck("5b) **CS 引擎輸入確實變強**（成長影響對戰）",
    csAfter[2].stats.acc > csBefore[2].stats.acc && csAfter[2].fps > csBefore[2].fps,
    `綜合 ${csBefore[2].fps} → ${csAfter[2].fps}`);
  //  MOBA：行為 mods
  const slotsOf = (list) => list.map((p, i) => ({ id: `b${i + 1}`, stats: getPlayerDerivedStats(p) }));
  const mBefore = toEnginePlayerMods({ blue: slotsOf(ROSTER), red: [] });
  const mAfter = toEnginePlayerMods({
    blue: slotsOf(ROSTER.map((p) => ({ ...p, stats: applyLevelGrowth(p, 8).stats }))), red: [],
  });
  ck("5c) MOBA 行為 mods 也跟著改變（成長有進引擎）",
    JSON.stringify(mBefore) !== JSON.stringify(mAfter));
  //  ⚠ 誠實揭露：MOBA 目前只吃行為 mods，不吃戰力
  ck("5d) （已知限制）MOBA 注入的仍只有行為層，不含 power/tough",
    !/\"power\"|\"tough\"/.test(JSON.stringify(mAfter)));
}

console.log("\n── 成長規則摘要 ──────────────────────────────────────────────");
{
  const p = mkPlayer("demo", "中路");
  const g1 = applyLevelGrowth(p, 1);
  console.log(`   每級 ${LEVEL_GROWTH.pointsPerLevel} 點，依定位權重 ${LEVEL_GROWTH.weights.join("/")} 分配`);
  console.log(`   中路 Lv5→6（能力 60／潛力 90）：${growthSummary(g1.gains, statZh)}（共 +${g1.total}）`);
  console.log(`   單項每級上限 +${LEVEL_GROWTH.perStatCap}｜硬上限 ${LEVEL_GROWTH.hardCap}｜受潛力上限`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
