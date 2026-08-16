// ============================================================================
//  development/teamDevelopment.js — 戰隊發展 v1（純資料／reducer）
//
//  戰隊發展是俱樂部層的長期投資，不直接寫入 players[].stats，也不取代
//  players[].training、growthLog 或舊存檔的 PlayerTalentState。
//  v1 只放少量代表節點：兩個安全的經營效率效果，及幾個備戰資訊解鎖。
// ============================================================================

export const TEAM_DEVELOPMENT_STATE_VERSION = "TeamDevelopmentState.v1";

const NODE = (id, category, name, description, effect, prerequisites = []) => ({
  id,
  category,
  name,
  description,
  maxRank: 1,
  costPerRank: 1,
  prerequisites,
  effect,
});

export const TEAM_DEVELOPMENT_CATEGORIES = [
  { id: "general", zh: "通用", emoji: "◈", colorKey: "green", description: "讓日常經營更有效率。" },
  { id: "moba", zh: "MOBA", emoji: "◆", colorKey: "blueL", description: "把資源投入選角與戰術準備。" },
  { id: "cs", zh: "CS", emoji: "◇", colorKey: "gold", description: "把資源投入地圖與團隊備戰。" },
  { id: "management", zh: "經營", emoji: "▣", colorKey: "purp", description: "擴大球探與青訓支援。" },
];

export const TEAM_DEVELOPMENT_NODES = [
  NODE("general_training_flow", "general", "訓練流程優化", "訓練安排更有效率，已排課程的完成天數最多少 1 天。", { kind: "trainingDaysReduction", amount: 1 }),
  NODE("general_recovery", "general", "恢復中心", "未訓練選手每日額外恢復 4 點體力。", { kind: "dailyRecoveryBonus", amount: 4 }),
  NODE("moba_hero_lab", "moba", "英雄研究室", "解鎖 MOBA 賽前的英雄研究提示，不改戰鬥公式。", { kind: "unlock", flag: "mobaResearch", label: "英雄研究" }),
  NODE("moba_draft_intel", "moba", "Ban/Pick 情報", "解鎖 MOBA 選角準備提示，不替玩家做決策。", { kind: "unlock", flag: "mobaDraftIntel", label: "Ban/Pick 情報" }, [{ nodeId: "moba_hero_lab", minRank: 1 }]),
  NODE("cs_map_lab", "cs", "地圖研究室", "解鎖 CS 地圖研究提示，不改對戰場景或隨機數。", { kind: "unlock", flag: "csMapResearch", label: "地圖研究" }),
  NODE("cs_team_drill", "cs", "團隊磨合", "解鎖 CS 賽前團隊準備提示，不改 16 項能力公式。", { kind: "unlock", flag: "csTeamPrep", label: "團隊磨合" }, [{ nodeId: "cs_map_lab", minRank: 1 }]),
  NODE("management_scout_network", "management", "球探網絡", "偵查安排更有效率，球探回報時間最多少 1 天。", { kind: "scoutDaysReduction", amount: 1 }),
  NODE("management_academy", "management", "青訓資料庫", "在招募頁顯示青訓支援狀態，保留現有招募規則。", { kind: "unlock", flag: "academySupport", label: "青訓支援" }),
];

const BY_ID = new Map(TEAM_DEVELOPMENT_NODES.map((node) => [node.id, node]));

export const teamDevelopmentNodeById = (id) => BY_ID.get(id) ?? null;
export const teamDevelopmentNodesByCategory = (category) =>
  TEAM_DEVELOPMENT_NODES.filter((node) => node.category === category);

export function recomputeTeamDevelopmentSpent(ranks = {}) {
  return Object.entries(ranks).reduce((spent, [id, rank]) => {
    const node = teamDevelopmentNodeById(id);
    if (!node) return spent;
    return spent + Math.max(0, Math.min(node.maxRank, Math.floor(Number(rank) || 0))) * node.costPerRank;
  }, 0);
}

/** 舊存檔沒有 teamDevelopment 時，只把 legacy meta.talentPending 當一次性初始池。 */
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
  if (!state || typeof state !== "object") return { ok: false, errors: ["state 不是物件"] };
  if (state.version !== TEAM_DEVELOPMENT_STATE_VERSION) errors.push("version 不正確");
  if (!Number.isInteger(state.availablePoints) || state.availablePoints < 0) errors.push("availablePoints 不正確");
  if (!state.ranks || typeof state.ranks !== "object") errors.push("ranks 不正確");
  else {
    for (const [id, rank] of Object.entries(state.ranks)) {
      const node = teamDevelopmentNodeById(id);
      if (!node) errors.push(`未知 nodeId: ${id}`);
      else if (!Number.isInteger(rank) || rank < 0 || rank > node.maxRank) errors.push(`ranks.${id} 不正確`);
    }
    if (state.spentPoints !== recomputeTeamDevelopmentSpent(state.ranks)) errors.push("spentPoints 不一致");
  }
  return { ok: errors.length === 0, errors };
}

function blockedReason(state, node) {
  for (const prerequisite of node.prerequisites) {
    if ((state.ranks[prerequisite.nodeId] ?? 0) < prerequisite.minRank) {
      const parent = teamDevelopmentNodeById(prerequisite.nodeId);
      return `需先完成「${parent?.name ?? prerequisite.nodeId}」`;
    }
  }
  if (state.availablePoints < node.costPerRank) return `發展點不足（需 ${node.costPerRank} 點）`;
  return null;
}

/** 唯一升級 reducer；失敗時完全不改 state。 */
export function applyTeamDevelopmentPurchase(rawState, nodeId, { now = null } = {}) {
  const state = sanitizeTeamDevelopment(rawState);
  const node = teamDevelopmentNodeById(nodeId);
  const previousRank = state.ranks[nodeId] ?? 0;
  const fail = (reason) => ({
    nextState: null,
    receipt: { success: false, nodeId, previousRank, newRank: previousRank, pointsSpent: 0, remainingPoints: state.availablePoints, failureReason: reason },
  });
  if (!node) return fail("發展節點不存在");
  if (previousRank >= node.maxRank) return fail("此節點已滿級");
  const reason = blockedReason(state, node);
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
    if (!node || rank <= 0) continue;
    const effect = node.effect;
    if (effect.kind === "unlock") effects.unlocks[effect.flag] = effect.label;
    if (effect.kind === "trainingDaysReduction") effects.trainingDaysReduction += effect.amount * rank;
    if (effect.kind === "dailyRecoveryBonus") effects.dailyRecoveryBonus += effect.amount * rank;
    if (effect.kind === "scoutDaysReduction") effects.scoutDaysReduction += effect.amount * rank;
  }
  return effects;
}

export const hasTeamDevelopment = (rawState, flag) => Boolean(teamDevelopmentEffects(rawState).unlocks[flag]);
