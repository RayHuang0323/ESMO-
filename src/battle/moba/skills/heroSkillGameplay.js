import { heroById } from '../../../data/heroDatabase.js';

const SEATS = /^(b|r)[1-5]$/;

/** Only explicitly authored mechanics may enter the authoritative engine. */
export function compileGameplaySkill(heroId, slot) {
  const hero = heroById(heroId);
  const rule = hero?.skills?.[slot]?.gameplay;
  if (!rule) return null;
  const common = ['range', 'cooldown'];
  const extras = {
    'dash-strike': ['dashStop', 'knockback', 'pathWidth', 'pathSlowFactor', 'pathSlowDuration'],
    'dash-control-strike': ['dashStop', 'knockback', 'pathWidth', 'pathSlowFactor', 'pathSlowDuration', 'controlDuration'],
    'dash-knockup-strike': ['dashStop', 'knockback', 'pathWidth', 'pathSlowFactor', 'pathSlowDuration', 'controlDuration'],
    'dash-blast': ['dashStop', 'pathWidth', 'pathSlowFactor', 'pathSlowDuration', 'blastRadius'],
    'blink-strike': ['arrivalOffset'],
    'cone-strike': ['halfAngle'],
    'area-root': ['delay', 'radius', 'rootDuration'],
    'control-target': ['controlDuration'],
    projectile: ['travel', 'hitRadius', 'slowFactor', 'slowDuration'],
    'delayed-area': ['delay', 'radius'],
    line: ['width', 'controlDuration'],
    'root-target': ['rootDuration'],
    'root-dot': ['rootDuration', 'dotDuration', 'tickInterval'],
    'shield-burst': ['triggerHpRatio', 'shieldPctMaxHp', 'shieldDuration', 'burstRadius'],
    'ally-shield': ['triggerHpRatio', 'armorMultiplier', 'shieldDuration'],
    'targeted-ally-shield': ['shieldPctMaxHp', 'shieldDuration'],
    'team-shield': ['radius', 'shieldPctMaxHp', 'shieldDuration'],
    'area-taunt': ['tauntDuration'],
    'area-control': ['delay', 'radius', 'controlDuration'],
    'area-silence': ['delay', 'radius', 'silenceDuration'],
    'area-mark': ['delay', 'radius', 'markDuration', 'damageAmp', 'slowFactor'],
    'multi-strike': ['hitCount', 'interval', 'falloff'],
    'silence-target': ['silenceDuration'],
    'self-shield': ['shieldPctMaxHp', 'shieldDuration'],
    'dash-wall': ['wallDuration', 'wallWidth', 'tickInterval'],
    'piercing-line': ['travel', 'width', 'falloff'],
    'area-taunt-guard': ['tauntDuration', 'guardDuration', 'reduction'],
    'blink-shield': ['blinkDistance', 'shieldPctMaxHp', 'shieldDuration'],
    'target-mark': ['markDuration', 'damageAmp', 'slowFactor'],
    'target-heal': ['healAmount', 'healPowerRatio'],
    'area-heal': ['radius', 'healAmount', 'healPowerRatio'],
    'ally-blink': ['blinkDistance'],
    'empowered-strike': ['bonusDamage', 'bonusPowerRatio', 'duration'],
    'team-haste': ['radius', 'speedFactor', 'duration'],
    'targeted-ally-haste': ['speedFactor', 'duration'],
    'barrier-line': ['wallDuration', 'wallWidth', 'tickInterval', 'slowFactor', 'slowDuration'],
    'area-dot': ['delay', 'radius', 'dotDuration', 'tickInterval', 'controlDuration'],
    'team-buff': ['radius', 'powerFactor', 'speedFactor', 'duration'],
    'cleanse-guard': ['guardDuration', 'reduction', 'targetMode'],
    'self-guard': ['guardDuration', 'reduction'],
    'split-projectile': ['travel', 'hitRadius', 'splitRadius', 'splitCount', 'slowFactor', 'slowDuration'],
    'revive-target': ['reviveWindow', 'reviveHpRatio'],
    'team-guard': ['radius', 'guardDuration', 'reduction'],
    'targeted-ally-guard': ['guardDuration', 'reduction'],
    'targeted-empower': ['powerFactor', 'duration'],
    'targeted-cdr': ['cooldownFactor', 'duration'],
    'self-buff': ['powerFactor', 'speedFactor', 'duration'],
    stealth: ['speedFactor', 'duration'],
    'area-silence': ['delay', 'radius', 'silenceDuration'],
    'execute-strike': ['executeThreshold'],
    'pull-target': ['pullDistance', 'controlDuration'],
  };
  const damaging = !['ally-shield', 'area-taunt-guard', 'area-taunt', 'blink-shield', 'targeted-ally-shield', 'team-shield', 'self-shield',
    'target-mark', 'target-heal', 'area-heal', 'ally-blink', 'empowered-strike', 'team-haste', 'targeted-ally-haste',
    'team-buff', 'cleanse-guard', 'self-guard', 'revive-target', 'team-guard', 'targeted-ally-guard', 'targeted-empower',
    'targeted-cdr', 'self-buff', 'stealth', 'area-mark'].includes(rule.mechanic);
  const finalMultiplier = rule.finalMultiplier ?? 1;
  const fields = [...common, ...(damaging ? ['damage', 'powerRatio'] : []), ...(extras[rule.mechanic] ?? [])];
  const numericFields = fields.filter((field) => field !== 'targetMode');
  if (rule.version !== 1 || !extras[rule.mechanic]
    || (damaging && !['physical', 'magic', 'true'].includes(rule.damageType))
    || !numericFields.every((field) => Number.isFinite(rule[field]) && rule[field] >= 0)
    || rule.range <= 0 || rule.cooldown <= 0
    || (rule.mechanic === 'dash-strike' && (rule.dashStop >= rule.range || rule.pathSlowFactor > 1))
    || (rule.mechanic === 'dash-control-strike' && (rule.dashStop >= rule.range || rule.pathSlowFactor > 1
      || rule.control !== 'stun' || rule.controlDuration <= 0))
    || (rule.mechanic === 'dash-knockup-strike' && (rule.dashStop >= rule.range || rule.pathSlowFactor > 1
      || rule.control !== 'knockup' || rule.controlDuration <= 0))
    || (rule.mechanic === 'dash-blast' && (rule.dashStop >= rule.range || rule.pathSlowFactor > 1
      || rule.blastRadius <= 0))
    || (rule.mechanic === 'blink-strike' && (rule.arrivalOffset <= 0 || rule.arrivalOffset >= rule.range))
    || (rule.mechanic === 'cone-strike' && (rule.halfAngle <= 0 || rule.halfAngle > Math.PI / 2))
    || (rule.mechanic === 'projectile' && (rule.travel <= 0 || rule.slowFactor > 1))
    || (rule.mechanic === 'piercing-line' && (rule.travel <= 0 || rule.width <= 0
      || rule.falloff <= 0 || rule.falloff > 1))
    || (rule.mechanic === 'area-taunt-guard' && (rule.tauntDuration < 1.2 || rule.tauntDuration > 2
      || rule.guardDuration <= 0 || rule.reduction < 0.25 || rule.reduction > 0.45))
    || (rule.mechanic === 'delayed-area' && (rule.delay <= 0 || rule.radius <= 0))
    || (rule.mechanic === 'dash-wall' && (rule.wallDuration <= 0 || rule.wallWidth <= 0
      || rule.tickInterval <= 0 || rule.tickInterval > rule.wallDuration))
    || (rule.mechanic === 'line' && (rule.width <= 0 || rule.control !== 'knockup'))
    || (rule.mechanic === 'root-target' && rule.rootDuration <= 0)
    || (rule.mechanic === 'area-root' && (rule.delay <= 0 || rule.radius <= 0 || rule.rootDuration <= 0))
    || (rule.mechanic === 'area-taunt' && (rule.tauntDuration < 1.2 || rule.tauntDuration > 2.5))
    || (rule.mechanic === 'area-control' && (rule.delay <= 0 || rule.radius <= 0
      || rule.controlDuration <= 0 || !['stun', 'knockup', 'root'].includes(rule.control)))
    || (rule.mechanic === 'multi-strike' && (rule.hitCount < 2 || rule.hitCount > 12
      || rule.interval <= 0 || rule.interval > 1 || rule.falloff <= 0 || rule.falloff > 1
      || !Number.isFinite(finalMultiplier) || finalMultiplier <= 0 || finalMultiplier > 4))
    || (rule.mechanic === 'silence-target' && (rule.silenceDuration <= 0 || rule.silenceDuration > 4))
    || (rule.mechanic === 'self-shield' && (rule.shieldPctMaxHp <= 0 || rule.shieldPctMaxHp > 1
      || rule.shieldDuration <= 0 || rule.shieldDuration > 10))
    || (rule.mechanic === 'control-target' && (!['stun', 'knockup'].includes(rule.control) || rule.controlDuration <= 0))
    || (rule.mechanic === 'root-dot' && (rule.rootDuration <= 0 || rule.dotDuration <= 0
      || rule.tickInterval <= 0 || rule.tickInterval > rule.dotDuration))
    || (rule.mechanic === 'ally-shield' && (rule.triggerHpRatio <= 0 || rule.triggerHpRatio > 1
      || rule.armorMultiplier <= 0 || rule.shieldDuration <= 0
      || !Number.isFinite(hero.stats?.armor) || !Number.isFinite(hero.stats?.armorg)))
    || (rule.mechanic === 'shield-burst' && (rule.triggerHpRatio > 1 || rule.shieldDuration <= 0 || rule.burstRadius <= 0))
    || (rule.mechanic === 'blink-shield' && (rule.blinkDistance <= 0 || rule.shieldPctMaxHp <= 0
      || rule.shieldDuration <= 0 || (rule.direction != null && !['toward', 'away'].includes(rule.direction))))
    || (rule.mechanic === 'targeted-ally-shield' && (rule.shieldPctMaxHp <= 0 || rule.shieldDuration <= 0))
    || (rule.mechanic === 'team-shield' && (rule.radius <= 0 || rule.shieldPctMaxHp <= 0 || rule.shieldDuration <= 0))
    || (rule.mechanic === 'target-mark' && (rule.markDuration <= 0 || rule.damageAmp < 0 || rule.damageAmp > 1
      || rule.slowFactor <= 0 || rule.slowFactor > 1))
    || (rule.mechanic === 'target-heal' && (rule.healAmount <= 0 || rule.healPowerRatio < 0))
    || (rule.mechanic === 'area-heal' && (rule.radius <= 0 || rule.healAmount <= 0 || rule.healPowerRatio < 0))
    || (rule.mechanic === 'ally-blink' && (rule.blinkDistance <= 0 || rule.blinkDistance > rule.range
      || !['pull-to-caster', 'self-to-ally'].includes(rule.blinkMode)))
    || (rule.mechanic === 'empowered-strike' && (rule.bonusDamage <= 0 || rule.bonusPowerRatio < 0
      || rule.duration <= 0 || rule.duration > 8))
    || (rule.mechanic === 'team-haste' && (rule.radius <= 0 || rule.speedFactor < 1
      || rule.speedFactor > 1.6 || rule.duration <= 0 || rule.duration > 8))
    || (rule.mechanic === 'targeted-ally-haste' && (rule.speedFactor < 1
      || rule.speedFactor > 1.6 || rule.duration <= 0 || rule.duration > 8))
    || (rule.mechanic === 'barrier-line' && (rule.wallDuration <= 0 || rule.wallWidth <= 0
      || rule.tickInterval <= 0 || rule.tickInterval > rule.wallDuration || rule.slowFactor <= 0
      || rule.slowFactor > 1 || rule.slowDuration <= 0))
    || (rule.mechanic === 'area-dot' && (rule.delay <= 0 || rule.radius <= 0 || rule.dotDuration <= 0
      || rule.tickInterval <= 0 || rule.tickInterval > rule.dotDuration
      || rule.controlDuration < 0 || rule.controlDuration > 4))
    || (rule.mechanic === 'team-buff' && (rule.radius <= 0 || rule.powerFactor < 1
      || rule.powerFactor > 1.6 || rule.speedFactor < 1 || rule.speedFactor > 1.6
      || rule.duration <= 0 || rule.duration > 10))
    || (rule.mechanic === 'cleanse-guard' && !['self', 'ally'].includes(rule.targetMode))
    || (['cleanse-guard', 'self-guard'].includes(rule.mechanic)
      && (rule.guardDuration <= 0 || rule.guardDuration > 10 || rule.reduction < 0 || rule.reduction > 1))
    || (rule.mechanic === 'split-projectile' && (rule.travel <= 0 || rule.hitRadius <= 0
      || rule.splitRadius <= 0 || rule.splitCount < 1 || rule.splitCount > 6 || rule.slowFactor <= 0
      || rule.slowFactor > 1 || rule.slowDuration <= 0))
    || (rule.mechanic === 'revive-target' && (rule.reviveWindow <= 0 || rule.reviveWindow > 12
      || rule.reviveHpRatio <= 0 || rule.reviveHpRatio > 1))
    || (rule.mechanic === 'team-guard' && (rule.radius <= 0 || rule.guardDuration <= 0
      || rule.guardDuration > 10 || rule.reduction < 0 || rule.reduction > 1))
    || (rule.mechanic === 'targeted-ally-guard' && (rule.guardDuration <= 0
      || rule.guardDuration > 10 || rule.reduction < 0 || rule.reduction > 1))
    || (rule.mechanic === 'targeted-empower' && (rule.powerFactor < 1 || rule.powerFactor > 1.6
      || rule.duration <= 0 || rule.duration > 10))
    || (rule.mechanic === 'targeted-cdr' && (rule.cooldownFactor <= 0 || rule.cooldownFactor > 1
      || rule.duration <= 0 || rule.duration > 10))
    || (rule.mechanic === 'self-buff' && (rule.powerFactor < 1 || rule.powerFactor > 1.6
      || rule.speedFactor < 1 || rule.speedFactor > 1.6 || rule.duration <= 0 || rule.duration > 10))
    || (rule.mechanic === 'stealth' && (rule.speedFactor < 1 || rule.speedFactor > 1.6
      || rule.duration <= 0 || rule.duration > 10))
    || (rule.mechanic === 'area-silence' && (rule.delay <= 0 || rule.radius <= 0
      || rule.silenceDuration <= 0 || rule.silenceDuration > 4))
    || (rule.mechanic === 'area-mark' && (rule.delay <= 0 || rule.radius <= 0
      || rule.markDuration <= 0 || rule.damageAmp < 0 || rule.damageAmp > 1
      || rule.slowFactor <= 0 || rule.slowFactor > 1))
    || (rule.mechanic === 'execute-strike' && (rule.executeThreshold <= 0 || rule.executeThreshold > 1))
    || (rule.mechanic === 'pull-target' && (rule.pullDistance <= 0 || rule.controlDuration <= 0))) {
    throw new Error(`Invalid gameplay skill ${heroId}:${slot}`);
  }
  return Object.freeze({ ...rule, ...(rule.mechanic === 'ally-shield'
    ? { baseArmor: hero.stats.armor, armorGrowth: hero.stats.armorg } : {}), skillId: `${heroId}:${slot}` });
}

/** Canonical roster -> engine parameters; no hero identity lookup inside LogicEngine. */
export function toEngineHeroSkills(roster) {
  const players = {};
  for (const [seat, entry] of Object.entries(roster ?? {})) {
    if (!SEATS.test(seat)) continue;
    const heroId = entry?.hero?.id ?? entry?.heroId ?? entry?.id;
    const skills = Object.fromEntries(['Q', 'W', 'E', 'R']
      .map((slot) => [slot, compileGameplaySkill(heroId, slot)])
      .filter(([, rule]) => rule));
    if (Object.keys(skills).length) players[seat] = Object.freeze(skills);
  }
  return Object.keys(players).length ? Object.freeze({ players: Object.freeze(players) }) : null;
}
