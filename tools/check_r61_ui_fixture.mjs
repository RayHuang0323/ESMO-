#!/usr/bin/env node
// R61 focused fixture：不渲染玩家 Debug UI，只提供可重複的 UI state / effect fixtures。
// 用途是讓未來 verifier 能快速取得戰隊發展各種閱讀狀態，不建立第二套 Store。
import { readFileSync } from "node:fs";
import {
  TEAM_DEVELOPMENT_CATEGORIES,
  TEAM_DEVELOPMENT_NODES,
  applyTeamDevelopmentPurchase,
  sanitizeTeamDevelopment,
  teamDevelopmentEffects,
  teamDevelopmentLevelEffect,
  teamDevelopmentNodeById,
  teamDevelopmentNodesByCategory,
  validateTeamDevelopmentState,
} from "../src/platform/development/teamDevelopment.js";

const check = (label, value) => {
  if (!value) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
};
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const state = (ranks = {}, availablePoints = 0) => sanitizeTeamDevelopment({ ranks, availablePoints, updatedAt: 1700000000000 });

const idle = state({}, 4);
const lv1 = state({ general_training_flow: 1 }, 3);
const lv2 = state({ general_training_flow: 2 }, 2);
const lv3 = state({ general_training_flow: 3 }, 1);
const prerequisiteLocked = state({}, 4);
const planned = state({ general_growth_support: 3, moba_tactical_prep: 3, cs_match_intel: 3, management_finance: 3 }, 0);
const informationBefore = state({}, 4);
const informationAfter = state({
  general_data_analysis: 1,
  moba_opponent_research: 1,
  cs_demo_analysis: 1,
  management_contracts: 1,
}, 0);

check("四分類與 20 節點", TEAM_DEVELOPMENT_CATEGORIES.length === 4 && TEAM_DEVELOPMENT_NODES.length === 20
  && TEAM_DEVELOPMENT_CATEGORIES.every((category) => teamDevelopmentNodesByCategory(category.id).length === 5));
check("未升級 fixture", idle.ranks.general_training_flow == null && idle.availablePoints === 4 && validateTeamDevelopmentState(idle).ok);
check("Lv1 fixture 與已啟用效果", lv1.ranks.general_training_flow === 1
  && teamDevelopmentLevelEffect(teamDevelopmentNodeById("general_training_flow"), 0)?.status === "live"
  && teamDevelopmentEffects(lv1).trainingDaysReduction === 1);
check("Lv2 fixture 保留逐級狀態", lv2.ranks.general_training_flow === 2 && teamDevelopmentEffects(lv2).trainingDaysReduction === 2);
check("Lv3 fixture 與完整路線", lv3.ranks.general_training_flow === 3 && teamDevelopmentEffects(lv3).trainingDaysReduction === 3);

const blocked = applyTeamDevelopmentPurchase(prerequisiteLocked, "moba_draft_intel", { now: 1700000000000 });
check("前置條件鎖定 fixture", !blocked.receipt.success && /英雄研究室/.test(blocked.receipt.failureReason));
check("規劃中 fixture 不產生假效果", Object.keys(teamDevelopmentEffects(planned).unlocks).length === 0
  && teamDevelopmentEffects(planned).trainingDaysReduction === 0);
check("資訊解鎖前後 fixture", Object.keys(teamDevelopmentEffects(informationBefore).unlocks).length === 0
  && teamDevelopmentEffects(informationAfter).unlocks.dataAnalysis === "選手與比賽摘要"
  && teamDevelopmentEffects(informationAfter).unlocks.mobaOpponentResearch === "對手選角摘要"
  && teamDevelopmentEffects(informationAfter).unlocks.csDemoAnalysis === "地圖與對手情報"
  && teamDevelopmentEffects(informationAfter).unlocks.contractSummary === "合約摘要");

const purchaseA = applyTeamDevelopmentPurchase(idle, "general_training_flow", { now: 1700000000000 });
const purchaseB = applyTeamDevelopmentPurchase(idle, "general_training_flow", { now: 1700000000000 });
check("Lv0→Lv1 deterministic", purchaseA.receipt.success && JSON.stringify(purchaseA) === JSON.stringify(purchaseB));
check("重複操作不重複扣點", purchaseA.nextState.availablePoints === idle.availablePoints - 1
  && purchaseA.nextState.spentPoints === 1
  && sanitizeTeamDevelopment(JSON.parse(JSON.stringify(purchaseA.nextState))).spentPoints === 1);

const developmentUi = read("src/screens/manage/TeamDevelopmentScreen.jsx");
const rosterUi = read("src/screens/manage/RosterScreen.jsx");
const profileUi = read("src/screens/manage/PlayerDetailScreen.jsx");
const frameUi = read("src/screens/manage/ManageFrame.jsx");
const shellUi = read("src/AppShell.jsx");
check("戰隊發展路線 fixture markers", /development-route-summary/.test(developmentUi)
  && /data-development-current-effect/.test(developmentUi)
  && /data-development-next-node/.test(developmentUi)
  && /data-development-next-effect/.test(developmentUi)
  && /prefers-reduced-motion/.test(developmentUi));
check("名單窄版 fixture markers", /data-roster-screen/.test(rosterUi)
  && /data-roster-card/.test(rosterUi)
  && /data-roster-modal-body/.test(rosterUi)
  && /max-width:400px/.test(rosterUi));
check("選手檔案 16 項窄版 fixture markers", /data-player-detail-screen/.test(profileUi)
  && /cs-stat-grid/.test(profileUi)
  && /moba-stat-grid/.test(profileUi)
  && /max-width:400px/.test(profileUi));
check("共用返回操作具備手機目標", /minWidth: 40/.test(frameUi) && /aria-label="返回"/.test(frameUi));
check("高頻流程路由仍相連", /RosterScreen/.test(shellUi) && /RecruitScreen/.test(shellUi)
  && /TeamDevelopmentScreen/.test(shellUi) && /CsPrepScreen/.test(shellUi)
  && /LineupScreen/.test(shellUi) && /TacticScreen/.test(shellUi));

console.log("R61 UI Fixture: PASS");
