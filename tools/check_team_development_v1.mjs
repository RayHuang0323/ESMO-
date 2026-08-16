// 戰隊發展 v1 focused verifier
import { readFileSync } from "node:fs";
import {
  TEAM_DEVELOPMENT_CATEGORIES,
  TEAM_DEVELOPMENT_NODES,
  teamDevelopmentNodeById,
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

ck("四個發展分類各自存在", TEAM_DEVELOPMENT_CATEGORIES.length === 4 && ["general", "moba", "cs", "management"].every((id) => TEAM_DEVELOPMENT_CATEGORIES.some((x) => x.id === id)));
ck("v1 只建立少量代表節點", TEAM_DEVELOPMENT_NODES.length === 8 && TEAM_DEVELOPMENT_NODES.every((node) => node.maxRank === 1 && node.costPerRank === 1));
ck("節點沒有直接玩家 stat effect", TEAM_DEVELOPMENT_NODES.every((node) => !node.effect?.stat && node.effect?.kind));

const migrated = sanitizeTeamDevelopment(null, 3);
ck("舊存檔從 legacy pool 相容出發展點", migrated.availablePoints === 3 && migrated.spentPoints === 0 && validateTeamDevelopmentState(migrated).ok);
const dirty = sanitizeTeamDevelopment({ availablePoints: -4, ranks: { general_training_flow: 9, unknown: 3 } });
ck("損壞 state 安全清洗", dirty.availablePoints === 0 && dirty.ranks.general_training_flow === 1 && !dirty.ranks.unknown && validateTeamDevelopmentState(dirty).ok);

const first = applyTeamDevelopmentPurchase(migrated, "general_training_flow", { now: 100 });
ck("第一次投入只扣一點", first.receipt.success && first.nextState.availablePoints === 2 && first.nextState.spentPoints === 1 && first.nextState.ranks.general_training_flow === 1);
const duplicate = applyTeamDevelopmentPurchase(first.nextState, "general_training_flow", { now: 101 });
ck("滿級重複操作不再扣點", !duplicate.receipt.success && duplicate.nextState === null && duplicate.receipt.remainingPoints === 2);
const blocked = applyTeamDevelopmentPurchase(migrated, "moba_draft_intel", { now: 100 });
ck("前置條件確實阻擋", !blocked.receipt.success && /英雄研究室/.test(blocked.receipt.failureReason));
const moba1 = applyTeamDevelopmentPurchase(migrated, "moba_hero_lab", { now: 100 });
const moba2 = applyTeamDevelopmentPurchase(moba1.nextState, "moba_draft_intel", { now: 100 });
ck("完成前置後可解鎖下一節點", moba1.receipt.success && moba2.receipt.success && moba2.nextState.ranks.moba_draft_intel === 1);
const effects = teamDevelopmentEffects({ availablePoints: 0, ranks: { general_training_flow: 1, general_recovery: 1, management_scout_network: 1, moba_hero_lab: 1 } });
ck("效率與資訊解鎖由同一 state 推導", effects.trainingDaysReduction === 1 && effects.dailyRecoveryBonus === 4 && effects.scoutDaysReduction === 1 && effects.unlocks.mobaResearch === "英雄研究");

const repeatedA = applyTeamDevelopmentPurchase(migrated, "general_recovery", { now: 555 });
const repeatedB = applyTeamDevelopmentPurchase(migrated, "general_recovery", { now: 555 });
ck("相同輸入 deterministic", JSON.stringify(repeatedA) === JSON.stringify(repeatedB));

const store = read("src/platform/profileStore.js");
const dashboard = read("src/screens/DashboardScreen.jsx");
const shell = read("src/AppShell.jsx");
const personal = read("src/screens/manage/PlayerTalentScreen.jsx");
const training = read("src/screens/manage/TrainingScreen.jsx");
ck("profileStore migration 與唯一 write hook", /PROFILE_SCHEMA_VERSION = 10/.test(store) && /teamDevelopment: sanitizeTeamDevelopment/.test(store) && /purchaseTeamDevelopment\(nodeId\)/.test(store));
ck("戰隊發展效率接入訓練／恢復", /trainingDaysReduction/.test(store) && /recoveryBonus/.test(store));
ck("首頁入口改為戰隊發展", /label="戰隊發展"/.test(dashboard) && /teamDevelopment/.test(dashboard) && /TeamDevelopmentScreen/.test(shell));
ck("個人天賦改為被動特質相容檢視", /選手個人天賦/.test(personal) && /既有個人天賦資料/.test(personal) && !/確認投入/.test(personal) && !/purchasePlayerTalent/.test(personal));
ck("訓練仍走既有流程", /assignTraining/.test(training) && /advanceTrainingDay/.test(training) && /StatGainList/.test(training));

// 以實際 Store hook 驗證投入會寫回俱樂部 state，但不會改寫選手能力。
const { useProfileStore } = await import("../src/platform/profileStore.js?team_development_v1");
const liveStore = useProfileStore;
const originalState = liveStore.getState();
const originalTeamDevelopment = originalState.teamDevelopment;
const originalPlayers = originalState.players;
const firstPlayerId = originalPlayers[0]?.id;
liveStore.setState({ teamDevelopment: sanitizeTeamDevelopment({ availablePoints: 1, ranks: {} }) });
const beforeStats = JSON.stringify(liveStore.getState().players.map((p) => ({ id: p.id, stats: p.stats, talentPoints: p.talentPoints })));
const liveReceipt = liveStore.getState().purchaseTeamDevelopment("general_training_flow");
const afterPurchase = liveStore.getState();
ck("實際 Store 投入只寫回戰隊發展 state", liveReceipt.success && afterPurchase.teamDevelopment.availablePoints === 0 && afterPurchase.teamDevelopment.spentPoints === 1);
ck("戰隊發展投入不直接改選手能力", beforeStats === JSON.stringify(afterPurchase.players.map((p) => ({ id: p.id, stats: p.stats, talentPoints: p.talentPoints }))));
liveStore.setState({
  teamDevelopment: sanitizeTeamDevelopment({ availablePoints: 1, ranks: { general_training_flow: 1 } }),
  players: originalPlayers.map((p) => p.id === firstPlayerId ? { ...p, training: null, energy: 100 } : p),
});
const assigned = liveStore.getState().assignTraining(firstPlayerId, "aim");
ck("戰隊發展效率接入既有訓練排程", assigned && liveStore.getState().players.find((p) => p.id === firstPlayerId)?.training?.daysLeft === 1);
liveStore.setState({ teamDevelopment: originalTeamDevelopment, players: originalPlayers });

console.log("Team Development v1: PASS");
