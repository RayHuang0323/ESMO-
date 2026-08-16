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

const effects = teamDevelopmentEffects({ availablePoints: 0, ranks: { general_training_flow: 3, general_recovery: 2, management_scout_network: 1, moba_hero_lab: 1, general_data_analysis: 3 } });
ck("真實 consumer 依等級累計", effects.trainingDaysReduction === 3 && effects.dailyRecoveryBonus === 8 && effects.scoutDaysReduction === 1 && effects.unlocks.mobaResearch === "英雄研究支援");
ck("規劃中節點不產生假效果", !effects.unlocks.generalDataAnalysis && Object.keys(effects.unlocks).length === 1);

const repeatedA = applyTeamDevelopmentPurchase(migrated, "general_recovery", { now: 555 });
const repeatedB = applyTeamDevelopmentPurchase(migrated, "general_recovery", { now: 555 });
ck("相同輸入 deterministic", JSON.stringify(repeatedA) === JSON.stringify(repeatedB));

const store = read("src/platform/profileStore.js");
const dashboard = read("src/screens/DashboardScreen.jsx");
const shell = read("src/AppShell.jsx");
const personal = read("src/screens/manage/PlayerTalentScreen.jsx");
const training = read("src/screens/manage/TrainingScreen.jsx");
const development = read("src/screens/manage/TeamDevelopmentScreen.jsx");
ck("profileStore migration 與 write hook", /PROFILE_SCHEMA_VERSION = 10/.test(store) && /teamDevelopment: sanitizeTeamDevelopment/.test(store) && /purchaseTeamDevelopment\(nodeId\)/.test(store));
ck("訓練與恢復讀取戰隊效果", /trainingDaysReduction/.test(store) && /recoveryBonus/.test(store));
ck("首頁入口與頁面路由", /teamDevelopment/.test(dashboard) && /TeamDevelopmentScreen/.test(shell));
ck("個人天賦未被改成投資樹", /purchasePlayerTalent/.test(personal) === false && /PlayerTalent/.test(personal));
ck("訓練流程維持既有入口", /assignTraining/.test(training) && /advanceTrainingDay/.test(training) && /StatGainList/.test(training));
ck("GSAP 路線回饋與減少動態支援", /useGSAP/.test(development) && /gsap\.timeline/.test(development) && /gsap\.utils\.toArray/.test(development) && /prefers-reduced-motion/.test(development));
ck("玩家用語與路線資訊", /下一級效果/.test(development) && /發展路線/.test(development) && !/consumer|reducer|schema|production/.test(development));

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
liveStore.setState({ teamDevelopment: originalTeamDevelopment, players: originalPlayers });

console.log("Team Development v1.5: PASS");
