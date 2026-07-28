// ============================================================================
//  heroArchetypes.js — H.3 可重用英雄職業原型（純呈現資料）
//
//  不是英雄技能/數值表，也不參與 LogicEngine 判定。每個角色依既有 role 映射到
//  四種低面數剪影，之後可逐步替換模型，不需要重寫 Runtime / Replay。
// ============================================================================

export const HERO_ARCHETYPES = Object.freeze({
  guardian: Object.freeze({
    id: "guardian", bodyScale: [1.12, 1.05, 1.12], shoulderScale: [1.18, 1, 1.12],
    accessory: "shield", effectWidth: 1.35,
  }),
  skirmisher: Object.freeze({
    id: "skirmisher", bodyScale: [0.86, 1.05, 0.86], shoulderScale: [0.88, 0.82, 0.9],
    accessory: "blades", effectWidth: 0.8,
  }),
  arcanist: Object.freeze({
    id: "arcanist", bodyScale: [0.9, 1.08, 0.9], shoulderScale: [0.92, 0.8, 0.92],
    accessory: "focus", effectWidth: 1.05,
  }),
  marksman: Object.freeze({
    id: "marksman", bodyScale: [0.82, 1.03, 0.82], shoulderScale: [0.95, 0.72, 0.82],
    accessory: "launcher", effectWidth: 0.62,
  }),
});

export const ROLE_ARCHETYPE = Object.freeze({
  top: "guardian",
  jungle: "skirmisher",
  mid: "arcanist",
  adc: "marksman",
  support: "guardian",
});

export function archetypeForRole(role) {
  return ROLE_ARCHETYPE[role] ?? "skirmisher";
}

export function archetypeData(id) {
  return HERO_ARCHETYPES[id] ?? HERO_ARCHETYPES.skirmisher;
}
