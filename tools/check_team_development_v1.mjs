#!/usr/bin/env node
// R59.1 focused verifier：戰隊發展路線、相容性與真實效果讀取點。
import { readFileSync } from "node:fs";
import {
  TEAM_DEVELOPMENT_CATEGORIES,
  TEAM_DEVELOPMENT_NODES,
  teamDevelopmentLevelEffect,
  teamDevelopmentNodeById,
  teamDevelopmentNodesByCategory,
  sanitizeTeamDevelopment,
  validateTeamDevelopmentState,
  applyTeamDevelopmentPurchase,
  teamDevelopmentEffects,
} from "../src/platform/development/teamDevelopment.js";

const ck = (label, ok) => {
  if (!ok) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
};
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

ck("四個發展分類", TEAM_DEVELOPMENT_CATEGORIES.length === 4 && ["general", "moba", "cs", "management"].every((id) => TEAM_DEVELOPMENT_CATEGORIES.some((x) => x.id === id)));
ck("20 個節點與每類五項", TEAM_DEVELOPMENT_NODES.length === 20 && TEAM_DEVELOPMENT_CATEGORIES.every((cat) => teamDevelopmentNodesByCategory(cat.id).length === 5));
ck("基礎、進階、專精路線", TEAM_DEVELOPMENT_CATEGORIES.every((cat) => {
  const tiers = teamDevelopmentNodesByCategory(cat.id).map((node) => node.tier);
  return tiers.filter((tier) => tier === "base").length === 2 && tiers.filter((tier) => tier === "advanced").length === 2 && tiers.filter((tier) => tier === "specialty").length === 1;
}));
ck("三格等級與下一級說明", TEAM_DEVELOPMENT_NODES.every((node) => node.maxRank === 3 && node.costPerRank === 1 && node.levelEffects.length === 3 && teamDevelopmentLevelEffect(node, 0)));
ck("效果不直接寫入選手能力", TEAM_DEVELOPMENT_NODES.every((node) => !node.effect?.stat));

const migrated = sanitizeTeamDevelopment(null, 3);
ck("舊存檔初始化與狀態驗證", migrated.availablePoints === 3 && migrated.spentPoints === 0 && validateTeamDevelopmentState(migrated).ok);
const dirty = sanitizeTeamDevelopment({ availablePoints: -4, ranks: { general_training_flow: 9, unknown: 3 } });
ck("舊資料清理與等級上限", dirty.availablePoints === 0 && dirty.ranks.general_training_flow === 3 && !dirty.ranks.unknown && validateTeamDevelopmentState(dirty).ok);

const level1 = applyTeamDevelopmentPurchase(migrated, "general_training_flow", { now: 100 });
const level2 = applyTeamDevelopmentPurchase(level1.nextState, "general_training_flow", { now: 101 });
const level3 = applyTeamDevelopmentPurchase(level2.nextState, "general_training_flow", { now: 102 });
ck("Lv.0 到 Lv.3 逐級投入", level1.receipt.success && level2.receipt.success && level3.receipt.success && level3.nextState.availablePoints === 0 && level3.nextState.spentPoints === 3 && level3.nextState.ranks.general_training_flow === 3);
const maxed = applyTeamDevelopmentPurchase(level3.nextState, "general_training_flow", { now: 103 });
ck("完成後不可重複投入", !maxed.receipt.success && maxed.nextState === null && maxed.receipt.remainingPoints === 0);

const blocked = applyTeamDevelopmentPurchase(migrated, "moba_draft_intel", { now: 100 });
ck("前置條件會阻擋升級", !blocked.receipt.success && /英雄研究室/.test(blocked.receipt.failureReason));
const moba1 = applyTeamDevelopmentPurchase(migrated, "moba_hero_lab", { now: 100 });
const moba2 = applyTeamDevelopmentPurchase(moba1.nextState, "moba_draft_intel", { now: 101 });
ck("完成前置後可解鎖下一項", moba1.receipt.success && moba2.receipt.success && moba2.nextState.ranks.moba_draft_intel === 1);
const mobaFuture = applyTeamDevelopmentPurchase(moba1.nextState, "moba_hero_lab", { now: 102 });
ck("既有解鎖的後續等級不假裝生效", !mobaFuture.receipt.success && /規劃/.test(mobaFuture.receipt.failureReason));

const effects = teamDevelopmentEffects({
  availablePoints: 0,
  ranks: {
    general_training_flow: 3,
    general_recovery: 2,
    management_scout_network: 1,
    moba_hero_lab: 1,
    moba_opponent_research: 1,
    cs_map_lab: 1,
    cs_demo_analysis: 1,
    management_contracts: 1,
    general_data_analysis: 3,
  },
});
ck("真實 consumer 依等級累計", effects.trainingDaysReduction === 3 && effects.dailyRecoveryBonus === 8 && effects.scoutDaysReduction === 1
  && effects.unlocks.mobaResearch === "英雄研究支援"
  && effects.unlocks.dataAnalysis === "選手與比賽摘要"
  && effects.unlocks.mobaOpponentResearch === "對手選角摘要"
  && effects.unlocks.csDemoAnalysis === "地圖與對手情報"
  && effects.unlocks.contractSummary === "合約摘要");
const plannedEffects = teamDevelopmentEffects({
  availablePoints: 0,
  ranks: {
    general_growth_support: 3,
    general_scout_support: 3,
    moba_tactical_prep: 3,
    moba_match_analysis: 3,
    cs_tactical_prep: 3,
    cs_match_intel: 3,
    management_sponsorship: 3,
    management_finance: 3,
  },
});
ck("規劃中節點不產生假效果", Object.keys(plannedEffects.unlocks).length === 0);
ck("尚未升級時不生效", Object.keys(teamDevelopmentEffects({ availablePoints: 0, ranks: {} }).unlocks).length === 0);

const repeatedA = applyTeamDevelopmentPurchase(migrated, "general_recovery", { now: 555 });
const repeatedB = applyTeamDevelopmentPurchase(migrated, "general_recovery", { now: 555 });
ck("相同輸入 deterministic", JSON.stringify(repeatedA) === JSON.stringify(repeatedB));

const store = read("src/platform/profileStore.js");
const dashboard = read("src/screens/DashboardScreen.jsx");
const shell = read("src/AppShell.jsx");
const personal = read("src/screens/manage/PlayerTalentScreen.jsx");
const training = read("src/screens/manage/TrainingScreen.jsx");
const development = read("src/screens/manage/TeamDevelopmentScreen.jsx");
const banPick = read("src/screens/moba/BanPickScreen.jsx");
const csTactic = read("src/screens/fps/CsTacticScreen.jsx");
const roster = read("src/screens/manage/RosterScreen.jsx");
//  ⚠ 原斷言硬寫 `PROFILE_SCHEMA_VERSION = 10`，CS Season M0 把 schema 升到 11
//    之後這一支就一直是紅的（TD-56 之前即如此，非本輪造成）。發展樹要的是
//    「**至少** v10 起有這一塊」，不是「永遠停在 v10」——schema 每升一版就
//    要回頭改一次戰隊發展的驗證器，本身就是錯的判準。改成下限比對。
//    （`check_home_team_contract.mjs` 早就是用下限寫的，這裡與它對齊。）
const schemaVersion = Number(/PROFILE_SCHEMA_VERSION = (\d+)/.exec(store)?.[1] ?? 0);
ck("profileStore migration 與 write hook", schemaVersion >= 10 && /teamDevelopment: sanitizeTeamDevelopment/.test(store) && /purchaseTeamDevelopment\(nodeId\)/.test(store));
ck("訓練與恢復讀取戰隊效果", /trainingDaysReduction/.test(store) && /recoveryBonus/.test(store));
ck("首頁入口與頁面路由", /teamDevelopment/.test(dashboard) && /TeamDevelopmentScreen/.test(shell));
// Contract §11：PlayerTalent 是 legacy compatibility/detail，必須保留；
// 新版長期投資入口則由首頁「戰隊發展」與 teamDevelopment route 負責。
// 舊斷言把「不得取代戰隊發展」誤寫成「不得出現 purchasePlayerTalent」，
// 會把合法的 legacy 詳情流程判成紅燈。
//  ⚠ 原斷言在 `dashboard` 裡找 `talent: "talentPick"`。那個入口後來搬到
//    PlayerDetail →「天賦」，首頁不再直接掛它（TD-56 之前即如此，非本輪造成）。
//    契約要守的是「**talentPick 路由仍然存在**、且沒有取代戰隊發展入口」，
//    不是「它一定掛在首頁」——路由住哪是 IA 決定，不是本契約的範圍。
//    改成在 AppShell 找路由註冊點。
ck("個人天賦保留為 legacy compatibility，不取代戰隊發展",
  /purchasePlayerTalent/.test(personal) && /PlayerTalent/.test(personal)
  && /teamDevelopment/.test(dashboard) && /screen === "talentPick"/.test(shell));
//  ⚠ Season vNext V1 之後訓練中心改走具名入口 `advanceWorldDays(1, { reason: training })`；
//    `advanceTrainingDay` 仍在 profileStore 保留為別名，但畫面不再直接呼叫它
//    （TD-56 之前即如此，非本輪造成）。契約要守的是「訓練仍然推得動同一個時鐘」，
//    不是「一定叫那個舊名字」⇒ 兩個名字都接受。
ck("訓練流程維持既有入口", /assignTraining/.test(training) && /advance(TrainingDay|WorldDays)/.test(training) && /StatGainList/.test(training));
ck("GSAP 路線回饋與減少動態支援", /useGSAP/.test(development) && /gsap\.timeline/.test(development) && /gsap\.utils\.toArray/.test(development) && /gsap\.set\(\[content, \.\.\.cards\], \{ autoAlpha: 1/.test(development) && /prefers-reduced-motion/.test(development));
ck("玩家用語與路線資訊", /下一級效果/.test(development) && /發展路線/.test(development) && !/consumer|reducer|schema|production/.test(development));
ck("R60 真實資訊讀取點", /dataAnalysis/.test(development) && /mobaOpponentResearch/.test(banPick) && /analyzeChamp/.test(banPick)
  && /csDemoAnalysis/.test(csTactic) && /CS_MAPS/.test(csTactic) && /mapFit/.test(csTactic)
  && /contractSummary/.test(roster) && /\.contract/.test(roster));

// Store hook runtime check：確認升級只改俱樂部 state，並仍會被訓練讀取。
const { useProfileStore } = await import("../src/platform/profileStore.js?team_development_v15");
const liveStore = useProfileStore;
const originalState = liveStore.getState();
const originalTeamDevelopment = originalState.teamDevelopment;
const originalPlayers = originalState.players;
const firstPlayerId = originalPlayers[0]?.id;
liveStore.setState({ teamDevelopment: sanitizeTeamDevelopment({ availablePoints: 1, ranks: {} }) });
const beforeStats = JSON.stringify(liveStore.getState().players.map((p) => ({ id: p.id, stats: p.stats, talentPoints: p.talentPoints })));
const liveReceipt = liveStore.getState().purchaseTeamDevelopment("general_training_flow");
const afterPurchase = liveStore.getState();
ck("Store 升級寫入俱樂部 state", liveReceipt.success && afterPurchase.teamDevelopment.availablePoints === 0 && afterPurchase.teamDevelopment.spentPoints === 1);
ck("升級不改選手 stats", beforeStats === JSON.stringify(afterPurchase.players.map((p) => ({ id: p.id, stats: p.stats, talentPoints: p.talentPoints }))));
liveStore.setState({
  teamDevelopment: sanitizeTeamDevelopment({ availablePoints: 1, ranks: { general_training_flow: 1 } }),
  players: originalPlayers.map((p) => p.id === firstPlayerId ? { ...p, training: null, energy: 100 } : p),
});
const assigned = liveStore.getState().assignTraining(firstPlayerId, "aim");
ck("訓練讀取流程效果", assigned && liveStore.getState().players.find((p) => p.id === firstPlayerId)?.training?.daysLeft === 1);
const roundTripped = sanitizeTeamDevelopment(JSON.parse(JSON.stringify(afterPurchase.teamDevelopment)));
ck("發展狀態可保存與讀回", validateTeamDevelopmentState(roundTripped).ok && roundTripped.ranks.general_training_flow === 1 && roundTripped.spentPoints === 1);
liveStore.setState({ teamDevelopment: originalTeamDevelopment, players: originalPlayers });

console.log("Team Development v1.5: PASS");
