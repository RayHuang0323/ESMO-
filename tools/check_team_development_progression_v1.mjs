#!/usr/bin/env node
// ============================================================================
//  TD-56 focused verifier：發展點供給（Team Development Progression v1）
//
//  守的東西只有一句話：**點數必須有來源，而且同一筆只能發一次。**
//  TD-56 之前的主幹沒有第一半（全生涯只有 1 點），所以這支驗證器的每一條
//  都是新的行為，不是既有行為的回歸網。
//
//  ⚠ 本檔不驗發展樹的內容（節點／前置／效果）——那是 `check_team_development_v1.mjs`
//    的範圍，不在這裡重寫一份。
// ============================================================================
import { readFileSync } from "node:fs";
import {
  sanitizeTeamDevelopment, validateTeamDevelopmentState, applyTeamDevelopmentPurchase,
  teamDevelopmentEffects, TEAM_DEVELOPMENT_TOTAL_BUYABLE, TEAM_DEVELOPMENT_NODES,
  teamDevelopmentEligibility,
} from "../src/platform/development/teamDevelopment.js";
import {
  reconcileDevelopmentPoints, developmentPointsViewOf, dueGrantsFor, migrationGrantsOf,
  DEVELOPMENT_POINT_SEED, CLUB_LEVEL_MILESTONES, POINTS_PER_CAREER_SEASON,
  DEVELOPMENT_POINT_VERSION, grantedTotalOf,
} from "../src/platform/development/developmentPoints.js";
import { clubLevelOf, clubXpForLevel, clubXpForMatch } from "../src/platform/progression/clubProgression.js";
import { clubCapabilitiesOf } from "../src/platform/assets/clubCapabilities.js";
import { deriveTime, DAYS_PER_WEEK, WEEKS_PER_SEASON } from "../src/platform/economy/timeline.js";
import { WORLD_TIME_COST } from "../src/platform/time/worldClock.js";

let pass = 0, fail = 0;
const ck = (label, ok, note = "") => {
  if (ok) { pass++; console.log(`✅ ${label}${note ? `　${note}` : ""}`); }
  else { fail++; console.log(`❌ ${label}${note ? `　${note}` : ""}`); }
};
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SEASON_DAYS = DAYS_PER_WEEK * WEEKS_PER_SEASON;
/** 第 n 季的第一天（完成第 n-1 季）。 */
const firstDayOfSeason = (n) => (n - 1) * SEASON_DAYS + 1;
const xpForLevel = (lv) => clubXpForLevel(lv);
const fresh = () => sanitizeTeamDevelopment(null, DEVELOPMENT_POINT_SEED);

// ── §1 供給表本身 ────────────────────────────────────────────────────────
console.log("── §1 供給表 ──");
ck("供給表有版本字串", DEVELOPMENT_POINT_VERSION === "DevelopmentPointSupply.v1");
ck("種子點數沿用 TD-56 之前的值", DEVELOPMENT_POINT_SEED === 1);
ck("Club Level 里程碑是有限表（刷分打不穿）",
  Array.isArray(CLUB_LEVEL_MILESTONES) && CLUB_LEVEL_MILESTONES.length > 0 && Object.isFrozen(CLUB_LEVEL_MILESTONES),
  `${CLUB_LEVEL_MILESTONES.length} 個里程碑`);
ck("里程碑遞增且不重複",
  CLUB_LEVEL_MILESTONES.every((m, i) => i === 0 || m > CLUB_LEVEL_MILESTONES[i - 1]));
ck("每季發放點數為正整數", Number.isInteger(POINTS_PER_CAREER_SEASON) && POINTS_PER_CAREER_SEASON > 0);
ck("發展樹可購買總點數由節點表推導，不是手寫常數",
  TEAM_DEVELOPMENT_TOTAL_BUYABLE === TEAM_DEVELOPMENT_NODES.reduce(
    (s, n) => s + (n.future ? 0 : Math.min(n.maxRank, n.activeLevelCap) * n.costPerRank), 0),
  `${TEAM_DEVELOPMENT_TOTAL_BUYABLE} 點`);
ck("光靠等級里程碑買不完整棵樹（必須打賽季）",
  DEVELOPMENT_POINT_SEED + CLUB_LEVEL_MILESTONES.length < TEAM_DEVELOPMENT_TOTAL_BUYABLE,
  `${DEVELOPMENT_POINT_SEED + CLUB_LEVEL_MILESTONES.length} < ${TEAM_DEVELOPMENT_TOTAL_BUYABLE}`);

// ── §2 新存檔 ────────────────────────────────────────────────────────────
console.log("\n── §2 新存檔 ──");
{
  const f = fresh();
  const r = reconcileDevelopmentPoints(f, { clubXp: 0, days: 8 });
  ck("新存檔對帳後點數不變（開局行為沒被改掉）",
    r.state.availablePoints === DEVELOPMENT_POINT_SEED && r.gained === 0,
    `available=${r.state.availablePoints}`);
  ck("新存檔的種子被認列進帳本", r.state.grants?.seed === DEVELOPMENT_POINT_SEED);
  ck("新存檔沒有憑空的 legacy 補償", !r.state.grants?.legacy);
  ck("新存檔狀態通過驗證", validateTeamDevelopmentState(sanitizeTeamDevelopment(r.state)).ok);
}

// ── §3 發點：Club Level 里程碑 ───────────────────────────────────────────
console.log("\n── §3 發點（俱樂部等級）──");
{
  const first = CLUB_LEVEL_MILESTONES[0];
  const below = reconcileDevelopmentPoints(fresh(), { clubXp: xpForLevel(first) - 1, days: 8 });
  const at = reconcileDevelopmentPoints(fresh(), { clubXp: xpForLevel(first), days: 8 });
  ck("未達第一個里程碑不發點",
    below.state.availablePoints === DEVELOPMENT_POINT_SEED, `Lv${clubLevelOf(xpForLevel(first) - 1)}`);
  ck("達到第一個里程碑發 1 點",
    at.state.availablePoints === DEVELOPMENT_POINT_SEED + 1 && at.gained === 1, `Lv${first}`);
  const all = reconcileDevelopmentPoints(fresh(), {
    clubXp: xpForLevel(CLUB_LEVEL_MILESTONES[CLUB_LEVEL_MILESTONES.length - 1] + 5), days: 8,
  });
  const view = developmentPointsViewOf(all.state, { clubXp: 0, days: 8 });
  ck("等級來源的總量剛好是里程碑數（有上限）",
    view.bySource.clubLevel === CLUB_LEVEL_MILESTONES.length, `${view.bySource.clubLevel} 點`);
  ck("超過最後一個里程碑不會再發等級點",
    reconcileDevelopmentPoints(all.state, { clubXp: xpForLevel(90), days: 8 }).gained === 0);
}

// ── §4 發點：生涯賽季 ────────────────────────────────────────────────────
console.log("\n── §4 發點（生涯賽季）──");
{
  const s1 = reconcileDevelopmentPoints(fresh(), { clubXp: 0, days: SEASON_DAYS });
  const s2 = reconcileDevelopmentPoints(fresh(), { clubXp: 0, days: firstDayOfSeason(2) });
  ck("第 1 季還沒打完不發賽季點",
    s1.state.availablePoints === DEVELOPMENT_POINT_SEED, `第 ${SEASON_DAYS} 天仍在 S${deriveTime(SEASON_DAYS).season}`);
  ck("跨進第 2 季發第 1 季的獎勵",
    s2.state.availablePoints === DEVELOPMENT_POINT_SEED + POINTS_PER_CAREER_SEASON,
    `+${POINTS_PER_CAREER_SEASON}`);
  const s4 = reconcileDevelopmentPoints(fresh(), { clubXp: 0, days: firstDayOfSeason(4) });
  ck("跨多季一次補齊（不會漏發）",
    s4.state.availablePoints === DEVELOPMENT_POINT_SEED + 3 * POINTS_PER_CAREER_SEASON,
    `${s4.state.availablePoints} 點`);
}

// ── §5 只發一次 / 重複防護 / 重讀存檔 ────────────────────────────────────
console.log("\n── §5 冪等 ──");
{
  const ctx = { clubXp: xpForLevel(CLUB_LEVEL_MILESTONES[2]), days: firstDayOfSeason(3) };
  const once = reconcileDevelopmentPoints(fresh(), ctx);
  const twice = reconcileDevelopmentPoints(once.state, ctx);
  const thrice = reconcileDevelopmentPoints(twice.state, ctx);
  ck("同一組里程碑再對帳一次不發第二遍", twice.gained === 0 && thrice.gained === 0);
  ck("重複對帳不改變餘額", twice.state.availablePoints === once.state.availablePoints);
  ck("沒有新入帳時回傳原物件（呼叫端可跳過寫入）", twice.state === once.state && twice.changed === false);
  //  reload：存檔 → JSON → 讀回 → 再對帳
  const persisted = sanitizeTeamDevelopment(JSON.parse(JSON.stringify(once.state)));
  const afterReload = reconcileDevelopmentPoints(persisted, ctx);
  ck("存檔往返後帳本還在", Object.keys(persisted.grants ?? {}).length === Object.keys(once.state.grants).length);
  ck("重讀存檔不會重發點數", afterReload.gained === 0 && persisted.availablePoints === once.state.availablePoints,
    `${persisted.availablePoints} 點`);
  ck("帳本鍵是里程碑本身（可讀且可去重）",
    Object.keys(once.state.grants).some((k) => k.startsWith("level:"))
    && Object.keys(once.state.grants).some((k) => k.startsWith("season:")));
  ck("帳本總量等於已發總量",
    grantedTotalOf(once.state.grants) === once.state.availablePoints + once.state.spentPoints);
  //  同一個 due 清單重跑多次必須完全穩定
  const dueA = JSON.stringify(dueGrantsFor(ctx));
  const dueB = JSON.stringify(dueGrantsFor(ctx));
  ck("同輸入的應發清單 deterministic", dueA === dueB);
}

// ── §6 舊存檔 ────────────────────────────────────────────────────────────
console.log("\n── §6 舊存檔 ──");
{
  //  TD-56 之前的存檔：有餘額、沒有帳本。
  const legacySave = sanitizeTeamDevelopment({ availablePoints: 1, ranks: {} });
  ck("舊存檔沒有帳本欄位（migration 前提）", legacySave.grants === undefined);
  const migrated = reconcileDevelopmentPoints(legacySave, { clubXp: 0, days: 8 });
  ck("舊存檔遷移不會平白多一點",
    migrated.state.availablePoints === 1, `${migrated.state.availablePoints} 點`);
  ck("舊存檔遷移把種子認列進帳本", migrated.state.grants?.seed === DEVELOPMENT_POINT_SEED);
  ck("遷移只跑一次（第二次對帳是 no-op）",
    reconcileDevelopmentPoints(migrated.state, { clubXp: 0, days: 8 }).gained === 0);

  //  舊 meta.talentPending 給過 3 點的存檔：多的 2 點必須保留。
  const generous = sanitizeTeamDevelopment({ availablePoints: 3, ranks: {} });
  const kept = reconcileDevelopmentPoints(generous, { clubXp: 0, days: 8 });
  ck("舊存檔多給過的點數一點都不收回",
    kept.state.availablePoints === 3 && kept.state.grants.legacy === 2, `${kept.state.availablePoints} 點`);
  ck("遷移拆帳不加也不減",
    (() => { const m = migrationGrantsOf({ availablePoints: 3, spentPoints: 2 }); return m.seed + m.legacy === 5; })());

  //  已經投入過的舊存檔：spentPoints 也算已發過。
  const spentSave = sanitizeTeamDevelopment({ availablePoints: 0, ranks: { general_training_flow: 1 } });
  const spentMigrated = reconcileDevelopmentPoints(spentSave, { clubXp: 0, days: 8 });
  ck("已投入的點數算進已發總量（不會被再發一次）",
    spentMigrated.state.availablePoints === 0 && spentMigrated.state.grants.seed === 1);

  //  跑了好幾季的舊存檔：一次補齊整段生涯應得的點。
  const veteran = reconcileDevelopmentPoints(
    sanitizeTeamDevelopment({ availablePoints: 1, ranks: {} }),
    { clubXp: xpForLevel(13), days: firstDayOfSeason(4) },
  );
  ck("老玩家一次補齊生涯應得的點", veteran.gained > 0 && veteran.state.availablePoints > 1,
    `+${veteran.gained} → ${veteran.state.availablePoints} 點`);
  ck("補齊後的狀態通過驗證", validateTeamDevelopmentState(sanitizeTeamDevelopment(veteran.state)).ok);
  //  壞掉的帳本不得讓載入炸掉
  const corrupt = sanitizeTeamDevelopment({ availablePoints: 1, ranks: {}, grants: { "level:4": -3, "": 2, bad: "x" } });
  ck("壞掉的帳本被清成空帳本而不是丟例外",
    corrupt.grants && Object.keys(corrupt.grants).length === 0);
}

// ── §7 上限：不發花不掉的點 ──────────────────────────────────────────────
console.log("\n── §7 上限 ──");
{
  const maxed = reconcileDevelopmentPoints(fresh(), { clubXp: xpForLevel(60), days: firstDayOfSeason(30) });
  ck("累計發放不超過發展樹能吸收的量",
    grantedTotalOf(maxed.state.grants) <= TEAM_DEVELOPMENT_TOTAL_BUYABLE,
    `${grantedTotalOf(maxed.state.grants)} / ${TEAM_DEVELOPMENT_TOTAL_BUYABLE}`);
  ck("到頂之後不再發點", reconcileDevelopmentPoints(maxed.state, { clubXp: xpForLevel(80), days: firstDayOfSeason(40) }).gained === 0);
}

// ── §8 快速練習 = 0 點 ───────────────────────────────────────────────────
console.log("\n── §8 快速練習 ──");
{
  ck("快速練習給 0 Club XP", clubXpForMatch({ matchSource: "practice", win: true }) === 0);
  ck("快速練習不推進世界日", WORLD_TIME_COST.practice === 0);
  //  結構保證：兩個來源都動不了 ⇒ 練習必然發不出點，而且不需要 practice 特判。
  const before = reconcileDevelopmentPoints(fresh(), { clubXp: 0, days: 8 }).state;
  let xp = 0, days = 8;
  for (let i = 0; i < 500; i++) {
    xp += clubXpForMatch({ matchSource: "practice", win: true });
    days += WORLD_TIME_COST.practice;
  }
  const after = reconcileDevelopmentPoints(before, { clubXp: xp, days });
  ck("打 500 場快速練習發出 0 點", after.gained === 0 && after.state.availablePoints === before.availablePoints,
    `xp=${xp} days=${days}`);
  const src = read("src/platform/development/developmentPoints.js");
  ck("供給表沒有 practice 特判（結構保證，不是 if）", !/practice/i.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
}

// ── §9 購買：扣點、前置、等級、點數不足 ─────────────────────────────────
console.log("\n── §9 購買 ──");
{
  const base = reconcileDevelopmentPoints(fresh(), { clubXp: xpForLevel(30), days: firstDayOfSeason(6) }).state;
  const buy = applyTeamDevelopmentPurchase(base, "general_training_flow");
  ck("投入一級成功", buy.receipt.success && buy.receipt.newRank === 1);
  ck("投入後扣掉 costPerRank",
    buy.nextState.availablePoints === base.availablePoints - 1, `${base.availablePoints} → ${buy.nextState.availablePoints}`);
  ck("投入後 spentPoints 跟著漲", buy.nextState.spentPoints === base.spentPoints + 1);
  ck("投入不會動到帳本（帳本記的是發放，不是花用）",
    JSON.stringify(buy.nextState.grants) === JSON.stringify(base.grants));
  const lvl3 = applyTeamDevelopmentPurchase(
    applyTeamDevelopmentPurchase(buy.nextState, "general_training_flow").nextState, "general_training_flow");
  ck("可逐級投入到 Lv.3", lvl3.receipt.success && lvl3.nextState.ranks.general_training_flow === 3);
  ck("完成後不可再投入", applyTeamDevelopmentPurchase(lvl3.nextState, "general_training_flow").receipt.success === false);
  ck("前置未完成會被擋下",
    applyTeamDevelopmentPurchase(base, "management_contracts").receipt.success === false);
  ck("完成前置後可解鎖",
    applyTeamDevelopmentPurchase(
      applyTeamDevelopmentPurchase(base, "management_scout_network").nextState, "management_contracts",
    ).receipt.success === true);
  //  點數不足
  const broke = sanitizeTeamDevelopment({ availablePoints: 0, ranks: {}, grants: { seed: 1 } });
  const denied = applyTeamDevelopmentPurchase(broke, "general_recovery");
  ck("點數不足時擋下且不產生部分更新", denied.receipt.success === false && denied.nextState === null);
  ck("點數不足的原因是玩家看得懂的中文", /發展點/.test(denied.receipt.failureReason ?? ""), denied.receipt.failureReason);
}

// ── §10 能力合併：Team Development + 總教練 ─────────────────────────────
console.log("\n── §10 能力合併 ──");
{
  const invested = (() => {
    let s = reconcileDevelopmentPoints(fresh(), { clubXp: xpForLevel(30), days: firstDayOfSeason(6) }).state;
    for (let i = 0; i < 2; i++) s = applyTeamDevelopmentPurchase(s, "general_training_flow").nextState;
    return s;
  })();
  const devEffects = teamDevelopmentEffects(invested);
  ck("發點之後發展樹效果真的生效（TD-56 之前買不起）",
    devEffects.trainingDaysReduction === 2, `trainingDaysReduction=${devEffects.trainingDaysReduction}`);
  const merged = clubCapabilitiesOf({ developmentEffects: devEffects, clubAssets: null });
  ck("clubCapabilities() 仍是合併後的唯一權威", merged.total && merged.sources && merged.schema === "ClubCapabilities.v1");
  ck("沒有教練時 total 等於發展樹來源",
    merged.total.trainingDaysReduction === merged.sources.teamDevelopment.trainingDaysReduction);
  const withCoach = clubCapabilitiesOf({
    developmentEffects: devEffects,
    clubAssets: { headCoachId: "coach_none", owned: {} },
  });
  ck("未擁有的教練不提供能力（合併不被繞過）",
    withCoach.sources.coach.trainingDaysReduction === 0);
  ck("合併仍套用 policy 上限（發滿點也不會破表）",
    merged.total.trainingDaysReduction <= 2, `cap 2 → ${merged.total.trainingDaysReduction}`);
  ck("sources 拆得開（球探人才池只吃發展樹那一份）",
    typeof merged.sources.teamDevelopment.scoutDaysReduction === "number"
    && typeof merged.sources.coach.scoutDaysReduction === "number");
}

// ── §11 不得污染別人的權威 ───────────────────────────────────────────────
console.log("\n── §11 邊界 ──");
{
  const src = read("src/platform/development/developmentPoints.js");
  ck("供給表不寫 Club XP", !/addClubXp|clubProgression\s*:/.test(src));
  ck("供給表不寫 Club Points / retention", !/clubPoints|retention/i.test(src));
  ck("供給表不碰資金", !/funds|finance/i.test(src));
  //  ⚠ 只看程式碼：檔頭註解自己就寫著「不 import React / zustand / localStorage」，
  //    不剝註解的話這一條會被自己的說明文字判紅。
  const code = (text) => text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  ck("供給表是純函式（不 import React / zustand / localStorage）",
    !/from "react"|zustand|localStorage/.test(code(src)));
  //  結算路徑：發展點對帳不得改動 Club XP / Club Points 的寫入
  const settle = read("src/platform/progress/applyMatchProgress.js");
  ck("結算仍只由 clubXpForMatch 決定 Club XP", /clubXpForMatch\(/.test(settle));
  ck("發展點對帳掛在既有結算的冪等之內", /reconcileDevelopmentPoints\(/.test(settle));
  const store = read("src/platform/profileStore.js");
  ck("Store 有供給視圖給畫面用", /developmentPointsView\(\)/.test(store));
  ck("Store 的對帳入口冪等且可重複呼叫", /syncDevelopmentPoints\(\)/.test(store));
  ck("載入路徑會對帳", /withDevelopmentPoints\(withIdentity\(/.test(store));
  //  UI 用玩家語言
  const screen = read("src/screens/manage/TeamDevelopmentScreen.jsx");
  ck("發展畫面顯示下一個里程碑", /下一個發展點/.test(screen));
  ck("發展畫面的完整規則預設收合（progressive disclosure）", /development-point-detail-toggle/.test(screen));
  ck("發展畫面不出現工程術語",
    !/ledger|reconcile|authority|canonical|grant\b/i.test(screen.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
}

// ── §12 投影：目標節奏 ───────────────────────────────────────────────────
console.log("\n── §12 節奏投影 ──");
{
  //  雙項主線玩家：兩個聯賽各 14 場，平均分布在 84 天內，勝率 50%。
  const XP_PER_OFFICIAL = Math.round(150 * 1.25);
  const project = (seasons, officialPerSeason) => {
    let xp = 0, granted = DEVELOPMENT_POINT_SEED;
    let state = reconcileDevelopmentPoints(fresh(), { clubXp: 0, days: 1 }).state;
    for (let day = 1; day <= seasons * SEASON_DAYS; day++) {
      if (day % Math.floor(SEASON_DAYS / officialPerSeason) === 0) xp += XP_PER_OFFICIAL;
      state = reconcileDevelopmentPoints(state, { clubXp: xp, days: day }).state;
    }
    granted = grantedTotalOf(state.grants);
    return granted;
  };
  const s1 = project(1, 28);
  const s8 = project(8, 28);
  ck("第一季拿得到「數次真正選擇」（≥3 點）", s1 >= 3, `S1 = ${s1} 點`);
  ck("第一季不可能把整棵樹買完", s1 < TEAM_DEVELOPMENT_TOTAL_BUYABLE, `S1 = ${s1} / ${TEAM_DEVELOPMENT_TOTAL_BUYABLE}`);
  ck("八季內可走完整棵樹", s8 >= TEAM_DEVELOPMENT_TOTAL_BUYABLE, `S8 = ${s8} / ${TEAM_DEVELOPMENT_TOTAL_BUYABLE}`);
  //  重度刷分：Club XP 拉到天花板，但世界日一天都沒多推
  const grindOneSeason = reconcileDevelopmentPoints(fresh(), { clubXp: xpForLevel(60), days: SEASON_DAYS });
  ck("刷滿 Club XP 也無法在第一季畢業（賽季那一條刷不動）",
    grantedTotalOf(grindOneSeason.state.grants) < TEAM_DEVELOPMENT_TOTAL_BUYABLE,
    `${grantedTotalOf(grindOneSeason.state.grants)} / ${TEAM_DEVELOPMENT_TOTAL_BUYABLE}`);
}

// ── §13 資格判定是單一來源（Owner Review 發現 ②）─────────────────────────
console.log("\n── §13 資格判定 ──");
{
  const rich = sanitizeTeamDevelopment({ availablePoints: 5, ranks: {} });
  const broke = sanitizeTeamDevelopment({ availablePoints: 0, ranks: { general_training_flow: 1 } });
  const preUnmet = teamDevelopmentEligibility(rich, "general_data_analysis");
  const noPoints = teamDevelopmentEligibility(broke, "general_recovery");
  ck("前置未完成與點數不足是不同的 kind",
    preUnmet.kind === "prerequisite" && noPoints.kind === "points",
    `${preUnmet.kind} / ${noPoints.kind}`);
  ck("前置未完成的原因指名要先完成哪一項",
    /需先完成/.test(preUnmet.reason) && /訓練流程優化/.test(preUnmet.reason), preUnmet.reason);
  ck("點數不足的原因說得出還要幾點",
    /需要 1 點發展點/.test(noPoints.reason), noPoints.reason);
  ck("可投入時 ok = true 且沒有原因",
    (() => { const e = teamDevelopmentEligibility(rich, "general_recovery"); return e.ok && e.reason === null; })());
  ck("已完成 / 規劃中 / 下一階段規劃中 各有自己的 kind", (() => {
    const maxed = teamDevelopmentEligibility(sanitizeTeamDevelopment({ availablePoints: 5, ranks: { general_training_flow: 3 } }), "general_training_flow");
    const planned = teamDevelopmentEligibility(rich, "general_growth_support");
    const nextPlanned = teamDevelopmentEligibility(sanitizeTeamDevelopment({ availablePoints: 5, ranks: { moba_hero_lab: 1 } }), "moba_hero_lab");
    return maxed.kind === "maxed" && planned.kind === "planned" && nextPlanned.kind === "nextPlanned";
  })());
  //  前置優先於點數：兩者都不成立時要先講前置（有錢也買不到）
  const both = teamDevelopmentEligibility(sanitizeTeamDevelopment({ availablePoints: 0, ranks: {} }), "general_data_analysis");
  ck("前置與點數都不足時，先講前置", both.kind === "prerequisite", both.reason);
  //  投入路徑與畫面路徑必須是同一份判定
  const src = read("src/platform/development/teamDevelopment.js");
  ck("投入 reducer 走的就是這份資格判定", /const eligibility = nodeEligibility\(/.test(src));
  ck("資格判定只有一處實作", (src.match(/function nodeEligibility\(/g) ?? []).length === 1);
  const screen = read("src/screens/manage/TeamDevelopmentScreen.jsx");
  ck("畫面不再自己重推前置／點數條件",
    /teamDevelopmentEligibility\(/.test(screen)
    && !/prerequisites\.some\(/.test(screen)
    && !/availablePoints >= node\.costPerRank/.test(screen));
  ck("畫面把「點數不足」與「待解鎖」分成兩個徽章",
    /needsPoints/.test(screen) && /點數不足/.test(screen));
  //  ⚠ 只看程式碼：說明這次為什麼要改的註解裡本來就會提到舊字串。
  const stripComments = (t) => t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")   // JSX 註解
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  ck("畫面不再出現「目前可生效」（會與「待解鎖」打架）", !/目前可生效/.test(stripComments(screen)));
  const dash = read("src/screens/DashboardScreen.jsx");
  ck("桌機管理工具有常駐的戰隊發展入口",
    /utilityItems = useMemo\(\(\) => \[[\s\S]{0,700}?id: "development"/.test(dash));
  ck("常駐入口沿用既有路由，沒有第二套",
    (dash.match(/development: "teamDevelopment"/g) ?? []).length === 1);
}

console.log(`\nTeam Development Progression v1：${pass}/${pass + fail} ${fail === 0 ? "PASS" : "FAIL"}`);
if (fail) process.exitCode = 1;
