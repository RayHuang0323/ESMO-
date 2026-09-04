#!/usr/bin/env node
// ============================================================================
//  Team Development Expansion v1 focused verifier
//
//  守的是一句話：**擴充只加了「看得到」，沒有加任何「變強」。**
//
//  ⚠ 供給表、發展點帳本、capability policy、Online 邊界都不在本輪改動範圍，
//    所以本檔有相當比重是**否定斷言**（確認某些東西沒有被動到）。
//    那不是湊數——TD-56 的教訓是「沒有紅燈的邊界遲早會被越過」。
// ============================================================================
import { readFileSync } from "node:fs";
import {
  TEAM_DEVELOPMENT_NODES, TEAM_DEVELOPMENT_TOTAL_BUYABLE, teamDevelopmentNodeById,
  sanitizeTeamDevelopment, validateTeamDevelopmentState, applyTeamDevelopmentPurchase,
  teamDevelopmentEffects, teamDevelopmentEligibility, teamDevelopmentNodesByCategory,
} from "../src/platform/development/teamDevelopment.js";
import {
  reconcileDevelopmentPoints, developmentPointsViewOf,
  DEVELOPMENT_POINT_SEED, CLUB_LEVEL_MILESTONES, POINTS_PER_CAREER_SEASON,
  grantedTotalOf,
} from "../src/platform/development/developmentPoints.js";
import { CAPABILITY_POLICY, clubCapabilitiesOf } from "../src/platform/assets/clubCapabilities.js";
import { clubXpForLevel, clubXpForMatch } from "../src/platform/progression/clubProgression.js";
import { deriveTime, DAYS_PER_WEEK, WEEKS_PER_SEASON } from "../src/platform/economy/timeline.js";
import { WORLD_TIME_COST } from "../src/platform/time/worldClock.js";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SEASON_DAYS = DAYS_PER_WEEK * WEEKS_PER_SEASON;
const firstDayOfSeason = (n) => (n - 1) * SEASON_DAYS + 1;
const fresh = () => sanitizeTeamDevelopment(null, DEVELOPMENT_POINT_SEED);

const ADOPTED = [
  ["general_growth_support", "general", "growthPlanning"],
  ["moba_tactical_prep", "moba", "mobaTacticInsight"],
  ["moba_match_analysis", "moba", "mobaMatchOverview"],
  ["cs_tactical_prep", "cs", "csTacticInsight"],
  ["cs_match_intel", "cs", "csMatchOverview"],
  ["management_sponsorship", "management", "sponsorInsight"],
];
const REJECTED = ["general_scout_support", "management_finance"];

// ── §1 節點表 ────────────────────────────────────────────────────────────
console.log("── §1 節點表 ──");
ck("6 個 adopted node 全部存在", ADOPTED.every(([id]) => teamDevelopmentNodeById(id) !== null));
ck("2 個 rejected node 已移除",
  REJECTED.every((id) => teamDevelopmentNodeById(id) === null), REJECTED.join(", "));
ck("節點總數 = 18（20 − 2）", TEAM_DEVELOPMENT_NODES.length === 18, `${TEAM_DEVELOPMENT_NODES.length}`);
ck("沒有任何節點還是 future", TEAM_DEVELOPMENT_NODES.filter((n) => n.future).length === 0);
ck("可購買總點數 = 24", TEAM_DEVELOPMENT_TOTAL_BUYABLE === 24, `${TEAM_DEVELOPMENT_TOTAL_BUYABLE}`);
for (const [id, category, flag] of ADOPTED) {
  const n = teamDevelopmentNodeById(id);
  ck(`${id}：category / cost / cap / unlock 旗標`,
    n.category === category && n.costPerRank === 1 && n.activeLevelCap === 1
    && n.effect?.kind === "unlock" && n.effect?.flag === flag,
    `${n.category} cost=${n.costPerRank} cap=${n.activeLevelCap} flag=${n.effect?.flag}`);
  ck(`${id}：第 1 階是 live，二三階誠實標為未來`,
    n.levelEffects[0].status === "live" && n.levelEffects.slice(1).every((e) => e.status === "future"));
}
ck("adopted 節點都不提供數值能力（只 unlock）",
  ADOPTED.every(([id]) => teamDevelopmentNodeById(id).effect.kind === "unlock"));
ck("prerequisite 未指向已移除的節點",
  TEAM_DEVELOPMENT_NODES.every((n) => n.prerequisites.every((p) => teamDevelopmentNodeById(p.nodeId) !== null)));
ck("四個分類仍然都在", ["general", "moba", "cs", "management"]
  .every((c) => teamDevelopmentNodesByCategory(c).length > 0),
  ["general", "moba", "cs", "management"].map((c) => `${c}:${teamDevelopmentNodesByCategory(c).length}`).join(" "));

// ── §2 供給表未變 ────────────────────────────────────────────────────────
console.log("\n── §2 供給表未變 ──");
ck("種子仍是 1", DEVELOPMENT_POINT_SEED === 1);
ck("等級里程碑仍是 8 個且內容不變",
  CLUB_LEVEL_MILESTONES.length === 8 && CLUB_LEVEL_MILESTONES.join(",") === "4,6,8,10,13,16,19,22",
  CLUB_LEVEL_MILESTONES.join(","));
ck("每季仍是 2 點", POINTS_PER_CAREER_SEASON === 2);
ck("新存檔仍然只有 1 點（開局行為不變）",
  reconcileDevelopmentPoints(fresh(), { clubXp: 0, days: 8 }).state.availablePoints === 1);
{
  //  上限變大 ⇒ 後段會多發，但早期完全不變（這是採用 1 階的關鍵理由）
  const at = (season, lv) => grantedTotalOf(reconcileDevelopmentPoints(fresh(), {
    clubXp: clubXpForLevel(lv), days: firstDayOfSeason(season),
  }).state.grants);
  //  ⚠ 期望值由**供給公式**算出來，不手寫數字——手寫等於把某個玩法檔案的
  //    投影數字誤當成公式常數（本檔第一版就是這樣寫錯的：4 是「單項休閒」
  //    在 Lv8 的值，拿去對 Lv10 當然不合）。
  const expected = (season, lv) => Math.min(
    TEAM_DEVELOPMENT_TOTAL_BUYABLE,
    DEVELOPMENT_POINT_SEED
      + CLUB_LEVEL_MILESTONES.filter((m) => lv >= m).length
      + Math.max(0, season - 1) * POINTS_PER_CAREER_SEASON,
  );
  for (const [season, lv] of [[1, 8], [1, 10], [3, 12], [5, 15]]) {
    ck(`早期供給未受擴充影響（S${season} / Lv${lv}）`,
      at(season, lv) === expected(season, lv), `${at(season, lv)} = ${expected(season, lv)}`);
  }
  const s9 = grantedTotalOf(reconcileDevelopmentPoints(fresh(), { clubXp: clubXpForLevel(22), days: firstDayOfSeason(9) }).state.grants);
  ck("S9 可以拿滿 24 點（全樹 ETA）", s9 === 24, `${s9}`);
  const s20 = grantedTotalOf(reconcileDevelopmentPoints(fresh(), { clubXp: clubXpForLevel(60), days: firstDayOfSeason(20) }).state.grants);
  ck("累計發放不超過新的可購買總量", s20 <= TEAM_DEVELOPMENT_TOTAL_BUYABLE, `${s20} / ${TEAM_DEVELOPMENT_TOTAL_BUYABLE}`);
}

// ── §3 購買 ──────────────────────────────────────────────────────────────
console.log("\n── §3 購買 ──");
{
  const rich = sanitizeTeamDevelopment({ availablePoints: 9, ranks: {}, grants: { seed: 1 } });
  //  前置未完成 ⇒ 擋下，而且理由分得出來
  const blocked = teamDevelopmentEligibility(rich, "moba_match_analysis");
  ck("adopted 節點的前置會擋下", blocked.ok === false && blocked.kind === "prerequisite", blocked.reason);
  //  逐步解鎖鏈：moba_hero_lab → moba_draft_intel → moba_tactical_prep
  let st = rich;
  for (const id of ["moba_hero_lab", "moba_draft_intel", "moba_tactical_prep"]) {
    const r = applyTeamDevelopmentPurchase(st, id);
    ck(`可依序投入 ${id}`, r.receipt.success, r.receipt.failureReason ?? "");
    if (r.nextState) st = r.nextState;
  }
  ck("投入後正確扣點", st.availablePoints === 9 - 3, `${st.availablePoints}`);
  ck("投入後 spentPoints 正確", st.spentPoints === 3);
  ck("解鎖旗標真的生效",
    teamDevelopmentEffects(st).unlocks.mobaTacticInsight === "戰術歷史表現",
    JSON.stringify(Object.keys(teamDevelopmentEffects(st).unlocks)));
  //  只開 1 階 ⇒ 第二次投入被擋
  const again = applyTeamDevelopmentPurchase(st, "moba_tactical_prep");
  ck("adopted 節點只能投入 1 階（重複操作被擋）",
    again.receipt.success === false && again.nextState === null, again.receipt.failureReason);
  //  點數不足
  const broke = sanitizeTeamDevelopment({ availablePoints: 0, ranks: {}, grants: { seed: 1 } });
  const denied = applyTeamDevelopmentPurchase(broke, "general_recovery");
  ck("點數不足時擋下且不部分更新", denied.receipt.success === false && denied.nextState === null);
  ck("點數不足的理由是玩家看得懂的中文", /發展點/.test(denied.receipt.failureReason ?? ""), denied.receipt.failureReason);
  //  reload
  const round = sanitizeTeamDevelopment(JSON.parse(JSON.stringify(st)));
  ck("存檔往返後投入結果保留",
    round.ranks.moba_tactical_prep === 1 && round.spentPoints === 3 && validateTeamDevelopmentState(round).ok);
  ck("reload 後不重複發點", reconcileDevelopmentPoints(round, { clubXp: 0, days: 8 }).gained === 0);
}

// ── §4 舊存檔 ────────────────────────────────────────────────────────────
console.log("\n── §4 舊存檔 ──");
{
  //  舊存檔可能帶著已移除節點的 rank（理論上不可能買到，但手改存檔會）
  const dirty = sanitizeTeamDevelopment({
    availablePoints: 2, ranks: { general_scout_support: 3, management_finance: 2, general_training_flow: 1 },
  });
  ck("已移除節點的 rank 被安全丟棄，不丟例外",
    !("general_scout_support" in dirty.ranks) && !("management_finance" in dirty.ranks)
    && dirty.ranks.general_training_flow === 1);
  ck("丟棄後 spentPoints 重新算對（不含已移除節點）", dirty.spentPoints === 1, `${dirty.spentPoints}`);
  ck("清洗後狀態通過驗證", validateTeamDevelopmentState(dirty).ok);
  ck("不需要 migration（sanitize 就處理掉了）",
    reconcileDevelopmentPoints(dirty, { clubXp: 0, days: 8 }).state.availablePoints >= 0);
  //  TD-56 的舊存檔（有帳本）載入後不得被重發
  const td56 = sanitizeTeamDevelopment({ availablePoints: 3, spentPoints: 1, ranks: { general_training_flow: 1 }, grants: { seed: 1, "level:4": 1, "season:1": 2 } });
  ck("TD-56 存檔載入不重發點", reconcileDevelopmentPoints(td56, { clubXp: clubXpForLevel(4), days: firstDayOfSeason(2) }).gained === 0);
}

// ── §5 capability cap 未被突破 ───────────────────────────────────────────
console.log("\n── §5 capability ──");
{
  ck("policy 仍是四個 kind", Object.keys(CAPABILITY_POLICY).length === 4, Object.keys(CAPABILITY_POLICY).join(","));
  ck("三個數值 kind 的 cap 未被提高",
    CAPABILITY_POLICY.trainingDaysReduction.cap === 2
    && CAPABILITY_POLICY.dailyRecoveryBonus.cap === 8
    && CAPABILITY_POLICY.scoutDaysReduction.cap === 2);
  //  全樹買滿 ＋ 裝備教練 ⇒ 仍不得破 cap
  let maxed = sanitizeTeamDevelopment({ availablePoints: 99, ranks: {}, grants: { seed: 1 } });
  for (const n of TEAM_DEVELOPMENT_NODES) {
    for (let i = 0; i < n.activeLevelCap; i++) {
      const r = applyTeamDevelopmentPurchase(maxed, n.id);
      if (r.nextState) maxed = r.nextState;
    }
  }
  ck("全樹買滿正好花掉 24 點", maxed.spentPoints === 24, `${maxed.spentPoints}`);
  const dev = teamDevelopmentEffects(maxed);
  const merged = clubCapabilitiesOf({
    developmentEffects: dev,
    clubAssets: { headCoachId: "coach_conditioning", owned: { coach_conditioning: { assetId: "coach_conditioning" } } },
  });
  ck("全樹＋教練後 trainingDaysReduction 仍被 cap 夾住",
    merged.total.trainingDaysReduction <= 2, `${merged.total.trainingDaysReduction}`);
  ck("全樹＋教練後 dailyRecoveryBonus 仍被 cap 夾住",
    merged.total.dailyRecoveryBonus <= 8, `${merged.total.dailyRecoveryBonus}`);
  ck("全樹＋教練後 scoutDaysReduction 仍被 cap 夾住",
    merged.total.scoutDaysReduction <= 2, `${merged.total.scoutDaysReduction}`);
  ck("六個新旗標全部解鎖得到",
    ADOPTED.every(([, , flag]) => Boolean(dev.unlocks[flag])),
    ADOPTED.map(([, , f]) => f).filter((f) => !dev.unlocks[f]).join(",") || "all");
  ck("教練相容：未擁有的教練仍不給能力",
    clubCapabilitiesOf({ developmentEffects: dev, clubAssets: { headCoachId: "coach_conditioning", owned: {} } })
      .sources.coach.trainingDaysReduction === 0);
}

// ── §6 快速練習 = 0 點 ───────────────────────────────────────────────────
console.log("\n── §6 快速練習 ──");
ck("練習仍給 0 Club XP", clubXpForMatch({ matchSource: "practice", win: true }) === 0);
ck("練習仍不推進世界日", WORLD_TIME_COST.practice === 0);
ck("打 300 場練習發出 0 點", (() => {
  const before = reconcileDevelopmentPoints(fresh(), { clubXp: 0, days: 8 }).state;
  let xp = 0, days = 8;
  for (let i = 0; i < 300; i++) { xp += clubXpForMatch({ matchSource: "practice", win: true }); days += WORLD_TIME_COST.practice; }
  return reconcileDevelopmentPoints(before, { clubXp: xp, days }).gained === 0;
})());

// ── §7 邊界：沒有東西偷偷回來 ────────────────────────────────────────────
console.log("\n── §7 邊界 ──");
{
  const nodeSrc = read("src/platform/development/teamDevelopment.js");
  ck("被 REJECT 的球探節點沒有以任何形式留在節點表",
    !/general_scout_support"/.test(nodeSrc.replace(/^\s*\/\/.*$/gm, "")));
  ck("被 REJECT 的財務節點沒有以任何形式留在節點表",
    !/management_finance"/.test(nodeSrc.replace(/^\s*\/\/.*$/gm, "")));
  ck("沒有新增第 7／8 個節點來湊數", TEAM_DEVELOPMENT_NODES.length === 18);
  //  六個新旗標都不得提供數值能力
  ck("六個 adopted 節點都沒有數值 effect",
    ADOPTED.every(([id]) => {
      const e = teamDevelopmentNodeById(id).effect;
      return e.kind === "unlock" && e.amount === undefined;
    }));
  //  Online 邊界：capability 不得出現在邊界檔案（GAP-3 的靜態守門）
  const BOUNDARY = [
    "src/platform/contracts/matchEntry.js",
    "src/platform/contracts/matchSquad.js",
    "src/platform/contracts/matchmaking.js",
    "src/platform/matchmaking/mockGateway.js",
  ];
  const leaks = BOUNDARY.filter((f) => /teamDevelopment|clubCapabilit|trainingDaysReduction|dailyRecoveryBonus|scoutDaysReduction|unlocks\./.test(code(read(f))));
  ck("Online 邊界檔案沒有 capability 洩漏", leaks.length === 0, leaks.join(", ") || "4 個檔案都乾淨");
  const newFlags = ADOPTED.map(([, , f]) => f);
  const flagLeaks = BOUNDARY.filter((f) => newFlags.some((flag) => read(f).includes(flag)));
  ck("六個新旗標沒有進入 Online 邊界", flagLeaks.length === 0, flagLeaks.join(", ") || "clean");
}

// ── §8 消費端存在且不越權 ────────────────────────────────────────────────
console.log("\n── §8 消費端 ──");
{
  const consumers = {
    growthPlanning: "src/screens/manage/TeamDevelopmentScreen.jsx",
    mobaTacticInsight: "src/screens/moba/TacticScreen.jsx",
    mobaMatchOverview: "src/screens/moba/BanPickScreen.jsx",
    csTacticInsight: "src/screens/fps/CsTacticScreen.jsx",
    csMatchOverview: "src/screens/fps/CsTacticScreen.jsx",
    sponsorInsight: "src/screens/manage/FinanceScreen.jsx",
  };
  for (const [flag, file] of Object.entries(consumers)) {
    //  ⚠ 畫面可以把 `.total.unlocks` 解構成自己的名字（FinanceScreen 叫
    //    `clubUnlocks`），所以認的是「這個旗標被讀到」，不是某一種固定寫法。
    ck(`${flag} 有真實讀取點`, new RegExp(`[Uu]nlocks\\.${flag}`).test(read(file)), file);
  }
  //  N6 不得改動贊助條件
  const fin = code(read("src/screens/manage/FinanceScreen.jsx"));
  ck("贊助面板只讀型錄，沒有寫入贊助或資金",
    !/setActiveSponsor|signSponsor|funds\s*[-+]?=/.test(fin));
  //  N1 不得加速成長
  const tdScreen = code(read("src/screens/manage/TeamDevelopmentScreen.jsx"));
  ck("成長面板沒有呼叫任何成長／訓練寫入",
    !/applyCourse|assignTraining|advanceDay|advanceWorldDays/.test(tdScreen));
  //  N2/N4 不得解鎖戰術
  const insights = code(read("src/ui/DevelopmentInsights.jsx"));
  ck("戰術面板不解鎖任何戰術變體（那是 Club Mastery 的責任）",
    !/equipVariant|setActiveDoctrine|tacticVariant/.test(insights));
  ck("共用面板是純呈現層（不碰 Store／localStorage）",
    !/useProfileStore|localStorage|zustand/.test(insights));
  //  CS 禁區完全沒被碰
  const CS_FORBIDDEN = [
    "src/battle/fps/EsportsFPS3D.jsx", "src/data/fpsRoster.js",
    "src/screens/fps/CsPrepScreen.jsx", "src/screens/fps/CsLoadingScreen.jsx",
  ];
  ck("Codex 的 CS runtime 禁區沒有出現新旗標",
    CS_FORBIDDEN.every((f) => { try { return !newFlagsInclude(read(f)); } catch { return true; } }),
    CS_FORBIDDEN.join(", "));
  function newFlagsInclude(text) {
    return ["csTacticInsight", "csMatchOverview", "growthPlanning", "sponsorInsight"].some((f) => text.includes(f));
  }
}

// ── §9 UI 密度（Owner Review ④）─────────────────────────────────────────
console.log("\n── §9 UI 密度 ──");
{
  const screen = read("src/screens/manage/TeamDevelopmentScreen.jsx");
  ck("節點卡有細節層開關", /development-detail-toggle-/.test(screen));
  ck("節點卡細節層預設收合（單一 detailId）", /const \[detailId, setDetailId\]/.test(screen));
  ck("敘述已移出主卡（只在細節層出現）",
    (screen.match(/\{node\.description\}/g) ?? []).length === 1);
  //  ⚠ `node.scope` 在路線摘要面板（RouteSummary）也用得到，不能全域計數。
  //    要證明的是**主卡那一行不見了**，所以看的是主卡的字面寫法。
  ck("影響範圍已移出主卡（主卡不再有「影響：」那一行）",
    !/影響：\{node\.scope\}/.test(screen));
  //  ⚠ 只看程式碼：解釋「搬到哪裡」的註解本身就會提到這個標籤。
  ck("影響範圍改在細節層以「影響範圍」呈現",
    (code(screen).match(/影響範圍/g) ?? []).length === 1);
  ck("主卡仍保留核心效果一行", /data-development-next-effect/.test(screen));
  ck("主卡仍保留 locked reason", /data-development-blocked-reason/.test(screen));
  ck("主卡仍保留 cost 與 CTA", /每級 \{node\.costPerRank\} 點/.test(screen) && /data-development-cta\b/.test(screen));
  ck("③ Available Points hierarchy 未被順手改動（仍是 18px）",
    /可用發展點<\/div><div style=\{\{ color: GC\.gold, fontSize: 18/.test(screen));
  ck("玩家端沒有工程術語",
    !/ledger|reconcile|canonical|authority|consumer|reducer/i.test(code(screen)));
}

console.log(`\nTeam Development Expansion v1：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
