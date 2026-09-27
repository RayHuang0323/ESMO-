// Canonical v13 target eligibility shared by the engine and read-only skill detail.
// This describes possible targets, not a guaranteed cast or hit.
export const OBJ_SKILL_MECHANICS = new Set([
  'projectile', 'split-projectile', 'line', 'piercing-line', 'delayed-area', 'area-dot',
  'cone-strike', 'multi-strike', 'control-target', 'root-target', 'silence-target', 'execute-strike',
  'root-dot', 'area-root', 'area-control', 'area-silence', 'area-mark',
]);
export const LANE_SKILL_SINGLE = new Set(['projectile', 'multi-strike', 'execute-strike']);
export const LANE_SKILL_AREA = new Set(['split-projectile', 'line', 'piercing-line', 'delayed-area', 'area-dot', 'cone-strike']);
export const NON_HERO_SPLASH = new Set([
  'delayed-area', 'area-dot', 'area-root', 'area-control', 'area-silence', 'area-mark',
  'line', 'piercing-line', 'cone-strike', 'split-projectile',
]);

export function targetCapabilities(rule, slot) {
  if (!rule) return { hero: '尚無正式 Gameplay', minion: '不適用', jungle: '不適用', boss: '不適用' };
  const mechanic = rule.mechanic;
  const damaging = (rule.damage ?? 0) > 0 || (rule.powerRatio ?? 0) > 0;
  const lane = damaging && slot !== 'R' && (LANE_SKILL_SINGLE.has(mechanic) || LANE_SKILL_AREA.has(mechanic));
  const splash = damaging && NON_HERO_SPLASH.has(mechanic);
  const neutral = damaging && OBJ_SKILL_MECHANICS.has(mechanic);
  return {
    hero: '依技能目標規則',
    minion: lane ? '條件清兵；亦可受範圍波及' : splash ? '僅可能受範圍波及' : '不適用',
    jungle: neutral ? '條件施放／範圍波及' : splash ? '僅可能受範圍波及' : '不適用',
    boss: neutral || splash ? '可承傷；硬控與緩速免疫' : '不適用',
  };
}
