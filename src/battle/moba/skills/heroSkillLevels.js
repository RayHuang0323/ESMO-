// HeroSkillLevel.v1: deterministic rank growth from the existing match level.
// No XP source, random draw, player-stat formula or second hero database lives here.
export const HERO_SKILL_LEVEL_CONTRACT = 'HeroSkillLevel.v1';
export const SKILL_LEVEL_CAPS = Object.freeze({ Q: 3, W: 3, E: 3, R: 2 });
export const SKILL_UPGRADE_MATCH_LEVELS = Object.freeze([3, 5, 7, 9, 11, 13, 15]);

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

/** Rank 1 of all four skills is available at match start, preserving v13 casts. */
export function skillLevelsAtMatchLevel(matchLevel, rules, talentSlot = null) {
  const level = Math.max(1, Math.min(18, Math.floor(Number(matchLevel) || 1)));
  const priority = skillUpgradePriority(rules, talentSlot);
  const slots = [priority[0], priority[1], priority[2], 'R', priority[0], priority[1], priority[2]];
  const ranks = { Q: 1, W: 1, E: 1, R: 1 };
  SKILL_UPGRADE_MATCH_LEVELS.forEach((unlock, index) => {
    if (level >= unlock) ranks[slots[index]]++;
  });
  return ranks;
}

export function nextSkillUnlock(matchLevel, rules, talentSlot, slot) {
  const current = skillLevelsAtMatchLevel(matchLevel, rules, talentSlot)[slot];
  if (!current || current >= SKILL_LEVEL_CAPS[slot]) return null;
  return SKILL_UPGRADE_MATCH_LEVELS.find((unlock) => unlock > matchLevel
    && skillLevelsAtMatchLevel(unlock, rules, talentSlot)[slot] > current) ?? null;
}
