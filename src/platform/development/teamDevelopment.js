// ============================================================================
// 戰隊發展 v1.5
//
// 戰隊發展是俱樂部層級的長期路線，不直接寫入 players[].stats，也不取代
// 選手訓練、個人天賦或比賽公式。只有已有穩定讀取點的節點才會產生 effect；
// 尚未接上讀取點的節點保留在路線圖中，但會標記為「規劃中」。
// ============================================================================

export const TEAM_DEVELOPMENT_STATE_VERSION = "TeamDevelopmentState.v1";

const LIVE = (text) => ({ text, status: "live" });
const FUTURE = (text) => ({ text, status: "future" });

const NODE = (
  id,
  category,
  tier,
  name,
  description,
  scope,
  options = {},
) => ({
  id,
  category,
  tier,
  name,
  description,
  scope,
  maxRank: options.maxRank ?? 3,
  costPerRank: options.costPerRank ?? 1,
  prerequisites: options.prerequisites ?? [],
  effect: options.effect ?? null,
  future: options.future ?? false,
  // activeLevelCap allows a real one-time unlock to keep a three-step route
  // without pretending that future levels already have gameplay effects.
  activeLevelCap: options.activeLevelCap ?? (options.future ? 0 : options.maxRank ?? 3),
  levelEffects: options.levelEffects ?? [
    LIVE("完成第一階段路線"),
    LIVE("深化目前路線"),
    LIVE("完成專精路線"),
  ],
});

export const TEAM_DEVELOPMENT_CATEGORIES = [
  { id: "general", zh: "通用", emoji: "◆", colorKey: "green", description: "讓日常培養與俱樂部支援更順暢" },
  { id: "moba", zh: "MOBA", emoji: "◈", colorKey: "blueL", description: "累積 MOBA 賽前研究與準備能力" },
  { id: "cs", zh: "CS", emoji: "◇", colorKey: "gold", description: "累積 CS 地圖與團隊準備能力" },
  { id: "management", zh: "經營", emoji: "▣", colorKey: "purp", description: "擴大球探、青訓與俱樂部營運支援" },
];

const rankEffects = (texts) => texts.map((text) => LIVE(text));

export const TEAM_DEVELOPMENT_NODES = [
  // 通用：訓練與恢復是目前已接上的基礎 consumer。
  NODE("general_training_flow", "general", "base", "訓練流程優化", "縮短單一選手完成訓練所需的排程時間。", "訓練", {
    effect: { kind: "trainingDaysReduction", amount: 1 },
    levelEffects: rankEffects(["訓練排程時間 -1 天", "訓練排程時間 -2 天", "訓練排程時間 -3 天"]),
  }),
  NODE("general_recovery", "general", "base", "恢復中心", "讓閒置與訓練中的選手更快恢復體力。", "恢復", {
    effect: { kind: "dailyRecoveryBonus", amount: 4 },
    levelEffects: rankEffects(["每日恢復 +4", "每日恢復 +8", "每日恢復 +12"]),
  }),
  NODE("general_data_analysis", "general", "advanced", "數據分析室", "整理選手與比賽資料，支援日後更精準的培養判斷。", "成長支援", {
    future: true,
    prerequisites: [{ nodeId: "general_training_flow", minRank: 1 }],
    levelEffects: [FUTURE("未來：開放訓練資料摘要"), FUTURE("未來：開放比賽資料比較"), FUTURE("未來：開放長期趨勢建議")],
  }),
  NODE("general_growth_support", "general", "advanced", "成長支援", "建立俱樂部層級的長期培養支援，協助規劃選手成長。", "成長支援", {
    future: true,
    prerequisites: [{ nodeId: "general_recovery", minRank: 1 }],
    levelEffects: [FUTURE("未來：解鎖成長規劃提示"), FUTURE("未來：擴充培養建議"), FUTURE("未來：開放長期成長報告")],
  }),
  NODE("general_scout_support", "general", "specialty", "球探支援", "讓通用支援路線延伸到人才觀察與招募準備。", "球探", {
    future: true,
    prerequisites: [{ nodeId: "general_data_analysis", minRank: 1 }, { nodeId: "general_growth_support", minRank: 1 }],
    levelEffects: [FUTURE("未來：擴充球探報告摘要"), FUTURE("未來：提升人才比較深度"), FUTURE("未來：解鎖長期招募規劃")],
  }),

  // MOBA：目前的研究節點只提供既有賽前畫面的研究支援提示。
  NODE("moba_hero_lab", "moba", "base", "英雄研究室", "整理英雄研究方向，讓賽前準備看得到目前可用的研究支援。", "MOBA 賽前", {
    activeLevelCap: 1,
    effect: { kind: "unlock", flag: "mobaResearch", label: "英雄研究支援" },
    levelEffects: [LIVE("解鎖英雄研究提示"), FUTURE("未來：擴充英雄研究內容"), FUTURE("未來：開放研究路線比較")],
  }),
  NODE("moba_draft_intel", "moba", "base", "Ban/Pick 情報", "讓賽前準備看得到 Ban/Pick 情報支援方向。", "MOBA 賽前", {
    activeLevelCap: 1,
    effect: { kind: "unlock", flag: "mobaDraftIntel", label: "Ban/Pick 情報支援" },
    prerequisites: [{ nodeId: "moba_hero_lab", minRank: 1 }],
    levelEffects: [LIVE("解鎖 Ban/Pick 情報提示"), FUTURE("未來：擴充對局資料整理"), FUTURE("未來：開放選擇比較")],
  }),
  NODE("moba_opponent_research", "moba", "advanced", "對手研究", "建立對手資料整理方向，支援未來的賽前判讀。", "MOBA 賽前", {
    future: true,
    prerequisites: [{ nodeId: "moba_hero_lab", minRank: 1 }],
    levelEffects: [FUTURE("未來：開放對手摘要"), FUTURE("未來：開放對位比較"), FUTURE("未來：開放對手趨勢")],
  }),
  NODE("moba_tactical_prep", "moba", "advanced", "戰術準備", "把研究成果整理成比賽前可採用的戰術準備方向。", "MOBA 賽前", {
    future: true,
    prerequisites: [{ nodeId: "moba_draft_intel", minRank: 1 }],
    levelEffects: [FUTURE("未來：解鎖戰術準備摘要"), FUTURE("未來：擴充戰術選項"), FUTURE("未來：開放戰術配對")],
  }),
  NODE("moba_match_analysis", "moba", "specialty", "賽前分析", "將英雄、選擇與對手資訊整合成完整賽前分析。", "MOBA 賽前", {
    future: true,
    prerequisites: [{ nodeId: "moba_opponent_research", minRank: 1 }, { nodeId: "moba_tactical_prep", minRank: 1 }],
    levelEffects: [FUTURE("未來：開放賽前總覽"), FUTURE("未來：開放情境比較"), FUTURE("未來：開放完整準備報告")],
  }),

  // CS：保留既有地圖研究與團隊磨合讀取點，其餘先是可見但不生效的路線。
  NODE("cs_map_lab", "cs", "base", "地圖研究室", "整理 CS 地圖研究方向，支援賽前準備。", "CS 賽前", {
    activeLevelCap: 1,
    effect: { kind: "unlock", flag: "csMapResearch", label: "地圖研究支援" },
    levelEffects: [LIVE("解鎖地圖研究提示"), FUTURE("未來：擴充地圖資料整理"), FUTURE("未來：開放地圖比較")],
  }),
  NODE("cs_team_drill", "cs", "base", "團隊磨合", "整理團隊配合方向，支援 CS 賽前準備。", "CS 賽前", {
    activeLevelCap: 1,
    effect: { kind: "unlock", flag: "csTeamPrep", label: "團隊磨合支援" },
    prerequisites: [{ nodeId: "cs_map_lab", minRank: 1 }],
    levelEffects: [LIVE("解鎖團隊磨合提示"), FUTURE("未來：擴充配合資料整理"), FUTURE("未來：開放隊伍組合比較")],
  }),
  NODE("cs_demo_analysis", "cs", "advanced", "Demo／對手分析", "建立 Demo 與對手資料整理方向，支援未來的賽前判讀。", "CS 賽前", {
    future: true,
    prerequisites: [{ nodeId: "cs_map_lab", minRank: 1 }],
    levelEffects: [FUTURE("未來：開放 Demo 摘要"), FUTURE("未來：開放對手比較"), FUTURE("未來：開放回合趨勢")],
  }),
  NODE("cs_tactical_prep", "cs", "advanced", "戰術準備", "把地圖與團隊資料整理成賽前可採用的戰術方向。", "CS 賽前", {
    future: true,
    prerequisites: [{ nodeId: "cs_team_drill", minRank: 1 }],
    levelEffects: [FUTURE("未來：解鎖戰術準備摘要"), FUTURE("未來：擴充戰術選項"), FUTURE("未來：開放戰術配對")],
  }),
  NODE("cs_match_intel", "cs", "specialty", "賽前情報", "整合地圖、Demo 與團隊磨合，形成完整 CS 賽前情報。", "CS 賽前", {
    future: true,
    prerequisites: [{ nodeId: "cs_demo_analysis", minRank: 1 }, { nodeId: "cs_tactical_prep", minRank: 1 }],
    levelEffects: [FUTURE("未來：開放賽前總覽"), FUTURE("未來：開放情境比較"), FUTURE("未來：開放完整情報報告")],
  }),

  // 經營：球探效率是目前正式讀取點，青訓支援維持既有資訊提示。
  NODE("management_scout_network", "management", "base", "球探網絡", "縮短球探完成報告所需的時間。", "球探", {
    effect: { kind: "scoutDaysReduction", amount: 1 },
    levelEffects: rankEffects(["球探報告時間 -1 天", "球探報告時間 -2 天", "球探報告時間 -3 天"]),
  }),
  NODE("management_academy", "management", "base", "青訓資料庫", "讓青訓支援方向在招募與培養流程中可被看見。", "青訓", {
    activeLevelCap: 1,
    effect: { kind: "unlock", flag: "academySupport", label: "青訓支援" },
    levelEffects: [LIVE("解鎖青訓支援提示"), FUTURE("未來：擴充青訓資料"), FUTURE("未來：開放培養路線比較")],
  }),
  NODE("management_contracts", "management", "advanced", "合約管理", "建立合約與續約資料的長期管理方向。", "經營", {
    future: true,
    prerequisites: [{ nodeId: "management_scout_network", minRank: 1 }],
    levelEffects: [FUTURE("未來：開放合約摘要"), FUTURE("未來：擴充續約提醒"), FUTURE("未來：開放合約規劃")],
  }),
  NODE("management_sponsorship", "management", "advanced", "贊助拓展", "建立贊助與俱樂部曝光的長期經營方向。", "經營", {
    future: true,
    prerequisites: [{ nodeId: "management_contracts", minRank: 1 }],
    levelEffects: [FUTURE("未來：開放贊助機會摘要"), FUTURE("未來：擴充合作選項"), FUTURE("未來：開放贊助規劃")],
  }),
  NODE("management_finance", "management", "specialty", "財務規劃", "把球探、青訓與經營資源整合成長期財務方向。", "經營", {
    future: true,
    prerequisites: [{ nodeId: "management_sponsorship", minRank: 1 }],
    levelEffects: [FUTURE("未來：開放財務摘要"), FUTURE("未來：擴充資源預測"), FUTURE("未來：開放長期預算規劃")],
  }),
];

const BY_ID = new Map(TEAM_DEVELOPMENT_NODES.map((node) => [node.id, node]));

export const teamDevelopmentNodeById = (id) => BY_ID.get(id) ?? null;
export const teamDevelopmentNodesByCategory = (category) =>
  TEAM_DEVELOPMENT_NODES.filter((node) => node.category === category);

export function teamDevelopmentLevelEffect(node, rank) {
  if (!node) return null;
  return node.levelEffects?.[Math.max(0, Math.floor(Number(rank) || 0))] ?? null;
}

export function recomputeTeamDevelopmentSpent(ranks = {}) {
  return Object.entries(ranks).reduce((spent, [id, rank]) => {
    const node = teamDevelopmentNodeById(id);
    if (!node) return spent;
    return spent + Math.max(0, Math.min(node.maxRank, Math.floor(Number(rank) || 0))) * node.costPerRank;
  }, 0);
}

/** 讀取舊存檔；未知節點會被忽略，既有節點等級與點數會保留。 */
export function sanitizeTeamDevelopment(raw, fallbackPoints = 0) {
  const source = raw && typeof raw === "object" ? raw : null;
  const sourceRanks = source?.ranks && typeof source.ranks === "object" ? source.ranks : {};
  const ranks = {};
  for (const [id, value] of Object.entries(sourceRanks)) {
    const node = teamDevelopmentNodeById(id);
    if (!node) continue;
    const n = Number(value);
    const rank = Number.isFinite(n) ? Math.max(0, Math.min(node.maxRank, Math.floor(n))) : 0;
    if (rank > 0) ranks[id] = rank;
  }
  const spentPoints = recomputeTeamDevelopmentSpent(ranks);
  const rawAvailable = source ? source.availablePoints : fallbackPoints;
  const availablePoints = Number.isFinite(Number(rawAvailable))
    ? Math.max(0, Math.floor(Number(rawAvailable)))
    : 0;
  return {
    version: TEAM_DEVELOPMENT_STATE_VERSION,
    availablePoints,
    spentPoints,
    ranks,
    updatedAt: Number.isFinite(source?.updatedAt) ? source.updatedAt : null,
  };
}

export function validateTeamDevelopmentState(state) {
  const errors = [];
  if (!state || typeof state !== "object") return { ok: false, errors: ["state 必須是物件"] };
  if (state.version !== TEAM_DEVELOPMENT_STATE_VERSION) errors.push("version 不正確");
  if (!Number.isInteger(state.availablePoints) || state.availablePoints < 0) errors.push("availablePoints 不正確");
  if (!state.ranks || typeof state.ranks !== "object") errors.push("ranks 不正確");
  else {
    for (const [id, rank] of Object.entries(state.ranks)) {
      const node = teamDevelopmentNodeById(id);
      if (!node) errors.push(`未知 nodeId: ${id}`);
      else if (!Number.isInteger(rank) || rank < 0 || rank > node.maxRank) errors.push(`ranks.${id} 不正確`);
    }
    if (state.spentPoints !== recomputeTeamDevelopmentSpent(state.ranks)) errors.push("spentPoints 不正確");
  }
  return { ok: errors.length === 0, errors };
}

function blockedReason(state, node, previousRank) {
  if (node.future || node.activeLevelCap <= 0) return "這項發展仍在規劃中";
  if (previousRank >= node.activeLevelCap) return "下一階段尚在規劃中";
  for (const prerequisite of node.prerequisites) {
    if ((state.ranks[prerequisite.nodeId] ?? 0) < prerequisite.minRank) {
      const parent = teamDevelopmentNodeById(prerequisite.nodeId);
      return `需要先完成「${parent?.name ?? prerequisite.nodeId}」`;
    }
  }
  if (state.availablePoints < node.costPerRank) return `需要 ${node.costPerRank} 點發展點`;
  return null;
}

/** 純 reducer：一次只投入一點，失敗時不產生部分更新。 */
export function applyTeamDevelopmentPurchase(rawState, nodeId, { now = null } = {}) {
  const state = sanitizeTeamDevelopment(rawState);
  const node = teamDevelopmentNodeById(nodeId);
  const previousRank = state.ranks[nodeId] ?? 0;
  const fail = (reason) => ({
    nextState: null,
    receipt: { success: false, nodeId, previousRank, newRank: previousRank, pointsSpent: 0, remainingPoints: state.availablePoints, failureReason: reason },
  });
  if (!node) return fail("找不到這項發展");
  if (previousRank >= node.maxRank) return fail("這項發展已完成");
  const reason = blockedReason(state, node, previousRank);
  if (reason) return fail(reason);
  const ranks = { ...state.ranks, [nodeId]: previousRank + 1 };
  const nextState = {
    ...state,
    availablePoints: state.availablePoints - node.costPerRank,
    spentPoints: recomputeTeamDevelopmentSpent(ranks),
    ranks,
    updatedAt: Number.isFinite(now) ? now : null,
  };
  return {
    nextState,
    receipt: { success: true, nodeId, previousRank, newRank: previousRank + 1, pointsSpent: node.costPerRank, remainingPoints: nextState.availablePoints, failureReason: null },
  };
}

export function teamDevelopmentEffects(rawState) {
  const state = sanitizeTeamDevelopment(rawState);
  const effects = { trainingDaysReduction: 0, dailyRecoveryBonus: 0, scoutDaysReduction: 0, unlocks: {} };
  for (const [id, rank] of Object.entries(state.ranks)) {
    const node = teamDevelopmentNodeById(id);
    if (!node || rank <= 0 || node.future || !node.effect) continue;
    const activeRank = Math.min(rank, node.activeLevelCap);
    if (activeRank <= 0) continue;
    const effect = node.effect;
    if (effect.kind === "unlock") effects.unlocks[effect.flag] = effect.label;
    if (effect.kind === "trainingDaysReduction") effects.trainingDaysReduction += effect.amount * activeRank;
    if (effect.kind === "dailyRecoveryBonus") effects.dailyRecoveryBonus += effect.amount * activeRank;
    if (effect.kind === "scoutDaysReduction") effects.scoutDaysReduction += effect.amount * activeRank;
  }
  return effects;
}

export const hasTeamDevelopment = (rawState, flag) => Boolean(teamDevelopmentEffects(rawState).unlocks[flag]);
