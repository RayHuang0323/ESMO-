import { CHAMPIONS_100, heroById } from '../../../data/heroDatabase.js';
import { MOTIFS } from './skillChoreography.js';

export const VFX_PRIMITIVES = Object.freeze(['projectile', 'beam', 'burst', 'shield', 'dash', 'aura', 'ground']);
export const HERO_SKILL_CONTRACT = 'HeroSkill.v1';

/** Compile only authored presentation metadata, never infer mechanics from prose. */
export function compileHeroSkill(heroId, slot) {
  const hero = heroById(heroId);
  const skill = hero?.skills?.[slot];
  const p = skill?.presentation;
  if (!p) return null;
  if (p.version !== 1 || p.readiness !== 'preview-only' || !VFX_PRIMITIVES.includes(p.primitive)
    || !Number.isFinite(p.duration) || p.duration <= 0 || p.duration > 5
    || !Number.isFinite(p.radius) || p.radius <= 0 || p.radius > 6
    || (p.visualRevision === 2 && (!MOTIFS.includes(p.motif)
      || ![p.accent, p.core, p.shade].every(c => /^#[0-9a-f]{6}$/i.test(c))
      || !(p.windup > 0 && p.windup < p.burstEnd && p.burstEnd < 1)))) throw new Error('Invalid HeroSkill presentation');
  return Object.freeze({ contract: HERO_SKILL_CONTRACT, id: `${hero.id}:${slot}`,
    heroId: hero.id, slot, name: skill.name, color: hero.color,
    gameplayEnabled: false, presentation: Object.freeze({ ...p }) });
}

export function goldenSkills() {
  return CHAMPIONS_100.flatMap(h => Object.keys(h.skills).map(slot => compileHeroSkill(h.id, slot)).filter(Boolean));
}

const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
/** Presentation timeline, absolute time makes pause/replay seeking independent of frame rate. */
export function createSkillPreviewEvent(skill, { id, at, origin, target }) {
  if (!skill || skill.contract !== HERO_SKILL_CONTRACT || !id || !Number.isFinite(at)
    || !point(origin) || !point(target)) throw new Error('Invalid skill preview event');
  return Object.freeze({ id: String(id), provenance: 'preview', skillId: skill.id,
    heroId: skill.heroId, at, duration: skill.presentation.duration,
    primitive: skill.presentation.primitive, radius: skill.presentation.radius, color: skill.color,
    visual: skill.presentation,
    origin: Object.freeze({ ...origin }), target: Object.freeze({ ...target }) });
}

export function sampleSkillEvent(event, time, out = {}) {
  const progress = (time - event.at) / event.duration;
  if (!Number.isFinite(progress) || progress < 0 || progress >= 1) return null;
  Object.assign(out, event, { progress });
  return out;
}

// Minimal legacy input adapter. "power" is NOT evidence of QWER, shield, CC or a hit.
export function ownsHeroAttack(fx) {
  return (fx?.skillId && /^hero:[QWER]$/.test(fx?.ability ?? '') && (fx?.type === 'line' || fx?.type === 'ult'))
    || /^(top|jungle|mid|adc|sup):(basic|power)$/.test(fx?.ability ?? '')
    && (fx.type === 'line' || fx.type === 'ult');
}
export function adaptNamedHeroSkill(fx, out = {}) {
  if (!fx?.skillId || !fx?.world || !fx?.targetWorld
    || !Number.isFinite(fx.progress) || fx.progress < 0 || fx.progress >= 1) return null;
  const heroId = fx.presentation?.heroId;
  const slot = fx.skillId.slice(heroId?.length + 1);
  if (!heroId || fx.skillId !== `${heroId}:${slot}`) return null;
  const skill = compileHeroSkill(heroId, slot);
  if (!skill) return null;
  return Object.assign(out, { id: fx.id, provenance: 'authority',
    skillId: skill.id, heroId, primitive: skill.presentation.primitive,
    radius: skill.presentation.radius, color: skill.color,
    visual: skill.presentation, origin: fx.world, target: fx.targetWorld,
    progress: fx.progress });
}
export function adaptHeroAttack(fx, out = {}) {
  if (fx?.skillId || !ownsHeroAttack(fx) || !point(fx.world) || !point(fx.targetWorld)
    || !Number.isFinite(fx.progress) || fx.progress < 0 || fx.progress >= 1) return null;
  const hero = heroById(fx.presentation?.heroId);
  return Object.assign(out, { id: fx.id, provenance: 'legacy-attack', skillId: null,
    visual: null,
    heroId: hero?.id ?? null, primitive: 'projectile', radius: 1.2,
    color: hero?.color ?? '#d7e4f0', origin: fx.world, target: fx.targetWorld,
    progress: fx.progress });
}
