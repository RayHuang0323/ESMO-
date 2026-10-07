// HeroSkillLevel.v2 (moba-sim.v19, Tactical AI Phase 1): deterministic unlock + rank growth from the match level.
// No XP source, random draw, player-stat formula or second hero database lives here.
//   · Lv1 / Lv2 / Lv3 unlock the three basic skills one by one (upgrade-priority order).
//   · Basic skills rank up at Lv4 / 5 / 7 / 8 / 9 / 10 (each basic reaches rank 3 by Lv10).
//   · R unlocks at Lv6 and ranks up at Lv11 / Lv16 (cap 3).
//   · Rank 0 = locked: the engine must not cast it; presentation shows it as locked.
//   · Special heroes: an authored `rules.R.unlockLevels` (e.g. [1, 6, 11]) overrides the R schedule (metadata hook).
// v1 (all four skills rank 1 at match start, R rank 2 at Lv9) was the moba-sim.v13–v18 schedule.
export const HERO_SKILL_LEVEL_CONTRACT = 'HeroSkillLevel.v2';
export const SKILL_LEVEL_CAPS = Object.freeze({ Q: 3, W: 3, E: 3, R: 3 });
export const ULTIMATE_LEVELS = Object.freeze([6, 11, 16]);
/** [matchLevel, priorityIndex] — basic skill unlocks (rank 1) and rank-ups, in level order. */
export const BASIC_SKILL_SCHEDULE = Object.freeze([
  [1, 0], [2, 1], [3, 2], [4, 0], [5, 1], [7, 0], [8, 1], [9, 2], [10, 2],
].map((row) => Object.freeze(row)));
/** Every match level at which some skill unlocks or ranks up (presentation / report helpers). */
export const SKILL_UPGRADE_MATCH_LEVELS = Object.freeze([...new Set([...BASIC_SKILL_SCHEDULE.map(([lv]) => lv), ...ULTIMATE_LEVELS])]
  .sort((a, b) => a - b));

const FIELD_CAP = Object.freeze({
  halfAngle: Math.PI / 2, shieldPctMaxHp: 1, reduction: 1, speedFactor: 1.6,
});
const FIELD_GROUPS = Object.freeze({
  shield: ['shieldPctMaxHp', 'armorMultiplier', 'shieldDuration'],
  heal: ['healAmount'],
  guard: ['reduction', 'guardDuration'],
  mark: ['damageAmp', 'markDuration'],
  mobility: ['range'],
  area: ['radius', 'width', 'halfAngle', 'wallWidth'],
  control: ['controlDuration', 'rootDuration', 'silenceDuration', 'tauntDuration', 'slowDuration'],
  buff: ['duration', 'speedFactor', 'powerFactor'],
  damage: ['damage', 'bonusDamage'],
});
const firstPositive = (rule, fields) => fields.find((field) => Number.isFinite(rule[field]) && rule[field] > 0);

/** Exactly one authored effect axis plus a modest cooldown gain per rank. */
export function skillLevelModifier(rule) {
  if (!rule?.mechanic) return null;
  const name = rule.mechanic;
  const groups = [
    /shield/.test(name) && 'shield', /heal/.test(name) && 'heal',
    /guard/.test(name) && 'guard', /mark/.test(name) && 'mark',
    /dash|blink/.test(name) && 'mobility',
    /area|cone|line|split|wall/.test(name) && 'area',
    /root|control|taunt|silence|pull/.test(name) && 'control',
    /buff|haste|stealth|empower|cdr/.test(name) && 'buff',
    'damage', 'control', 'buff', 'mobility',
  ].filter(Boolean);
  const field = groups.map((group) => firstPositive(rule, FIELD_GROUPS[group])).find(Boolean) ?? 'cooldown';
  return Object.freeze({ field, perRank: field === 'cooldown' ? 0.06 : 0.06, cooldownPerRank: field === 'cooldown' ? 0 : 0.03 });
}

export function applySkillLevelToRule(rule, level) {
  if (!rule || !Number.isInteger(level) || level < 1 || level > (SKILL_LEVEL_CAPS[rule.skillId?.split(':')[1]] ?? 3))
    throw new Error(`Invalid hero skill level ${rule?.skillId ?? '?'}:${level}`);
  if (level === 1) return rule;
  const modifier = skillLevelModifier(rule);
  const steps = level - 1;
  const field = modifier.field;
  const next = { ...rule };
  if (field === 'cooldown') next.cooldown = Number((rule.cooldown * (1 - modifier.perRank * steps)).toFixed(4));
  else {
    next[field] = Number(Math.min(rule[field] * (1 + modifier.perRank * steps), FIELD_CAP[field] ?? Infinity).toFixed(4));
    next.cooldown = Number((rule.cooldown * (1 - modifier.cooldownPerRank * steps)).toFixed(4));
  }
  return Object.freeze(next);
}

export function skillLevelChanges(currentRule, nextRule) {
  if (!currentRule || !nextRule) return [];
  return Object.keys(nextRule).filter((field) => Number.isFinite(nextRule[field])
    && Number.isFinite(currentRule[field]) && nextRule[field] !== currentRule[field])
    .map((field) => Object.freeze({ field, from: currentRule[field], to: nextRule[field] }));
}

/** AI priority: selected talent's skill first, then real control/area/pressure. */
export function skillUpgradePriority(rules, talentSlot = null) {
  const baseTie = { Q: 3, W: 2, E: 1 };
  return Object.freeze(['Q', 'W', 'E'].sort((a, b) => {
    const score = (slot) => {
      const rule = rules?.[slot] ?? {};
      return (slot === talentSlot ? 100 : 0) +
        (/control|root|silence|taunt/.test(rule.mechanic ?? '') ? 12 : 0) +
        (/area|cone|line/.test(rule.mechanic ?? '') ? 8 : 0) +
        (Number.isFinite(rule.damage) && rule.damage > 0 ? 5 : 0) + baseTie[slot];
    };
    return score(b) - score(a) || a.localeCompare(b);
  }));
}

/** R schedule: authored metadata override (special heroes) or the standard Lv6 / 11 / 16. */
export function ultimateLevelsOf(rules) {
  const own = rules?.R?.unlockLevels;
  return Array.isArray(own) && own.length && own.every((lv) => Number.isInteger(lv) && lv >= 1 && lv <= 18)
    ? own.slice(0, SKILL_LEVEL_CAPS.R) : ULTIMATE_LEVELS;
}

/** HeroSkillLevel.v2 ranks at a match level (0 = locked). */
export function skillLevelsAtMatchLevel(matchLevel, rules, talentSlot = null) {
  const level = Math.max(1, Math.min(18, Math.floor(Number(matchLevel) || 1)));
  const priority = skillUpgradePriority(rules, talentSlot);
  const ranks = { Q: 0, W: 0, E: 0, R: 0 };
  for (const [unlock, index] of BASIC_SKILL_SCHEDULE) if (level >= unlock) ranks[priority[index]]++;
  for (const unlock of ultimateLevelsOf(rules)) if (level >= unlock) ranks.R++;
  return ranks;
}

export function nextSkillUnlock(matchLevel, rules, talentSlot, slot) {
  const current = skillLevelsAtMatchLevel(matchLevel, rules, talentSlot)[slot];
  if (current == null || current >= SKILL_LEVEL_CAPS[slot]) return null;
  for (let lv = Math.floor(Number(matchLevel) || 1) + 1; lv <= 18; lv++) {
    if (skillLevelsAtMatchLevel(lv, rules, talentSlot)[slot] > current) return lv;
  }
  return null;
}
