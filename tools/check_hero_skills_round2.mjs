import assert from 'node:assert/strict';
import { goldenSkills, createSkillPreviewEvent, sampleSkillEvent, adaptHeroAttack } from '../src/battle/moba/skills/heroSkillContract.js';
import { emitChoreography, sampleWorkshopPose, visualPhase } from '../src/battle/moba/skills/skillChoreography.js';
import { WORLD_SCALE } from '../src/gameData.js';
import { compileGameplaySkill } from '../src/battle/moba/skills/heroSkillGameplay.js';
const skills = goldenSkills(); let passed = 0;
const ck = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
const make = s => createSkillPreviewEvent(s, { id: s.id, at: 0, origin: { x: -3, y: 0, z: 0 }, target: { x: 3, y: 0, z: 0 } });
const commands = (e, options) => { const out = []; emitChoreography(e, (...c) => out.push(c), options); return out; };
ck('400 authored motifs, 100 consistent elemental palettes, bounded fusion recipes', () => {
  assert.equal(new Set(skills.map(s => s.presentation.motif)).size, 400);
  assert.equal(new Set(skills.map(s => s.presentation.element)).size, 100);
  for (const s of skills) for (const other of skills.filter(x => x.heroId === s.heroId)) assert.equal(s.presentation.accent, other.presentation.accent);
});
ck('steel taunt bulwark keeps directional slabs with a bounded shield volume', () => {
  const skill = skills.find(s => s.id === 'ironclad:W');
  const rule = compileGameplaySkill('ironclad', 'W');
  assert.equal(skill.presentation.radius, rule.range * WORLD_SCALE);
  const event = make(skill);
  const active = commands(sampleSkillEvent(event, event.duration * 0.5));
  assert.ok(active.some(c => c[0] === 3 && c[5] > 0.5));
  assert.ok(active.some(c => c[1] > event.origin.x + 1));
  const reduced = commands(sampleSkillEvent(event, event.duration * 0.5), { reduced: true });
  assert.ok(reduced.length >= 6 && reduced.some(c => c[0] === 1) && reduced.some(c => c[0] === 3));
});
ck('solar piercing arrow crosses the full authored lane without circular marks', () => {
  const skill = skills.find(s => s.id === 'dawnstrike:Q');
  const rule = compileGameplaySkill('dawnstrike', 'Q');
  assert.equal(skill.presentation.radius, rule.width * WORLD_SCALE);
  assert.ok(Math.abs(skill.presentation.duration * (skill.presentation.windup + 0.25) - rule.travel) < 0.01);
  const event = make(skill);
  const active = commands(sampleSkillEvent(event, event.duration * 0.5));
  assert.ok(active.some(c => c[1] > 0));
  assert.ok(active.every(c => [0, 1, 2, 3, 4].includes(c[0])));
  assert.ok(commands(sampleSkillEvent(event, event.duration * 0.5), { reduced: true }).length >= 3);
});
ck('fire dash wall shows the authoritative two-second line footprint without a fullscreen pass', () => {
  const skill = skills.find(s => s.id === 'cinderfist:E');
  const rule = compileGameplaySkill('cinderfist', 'E');
  assert.ok(skill);
  assert.equal(skill.presentation.radius, rule.wallWidth * WORLD_SCALE);
  assert.equal(skill.presentation.duration, rule.wallDuration + 0.25);
  const event = make(skill);
  const active = commands(sampleSkillEvent(event, event.duration * 0.5));
  assert.ok(active.some(c => c[1] < -1) && active.some(c => c[1] > 1));
  assert.ok(active.some(c => Math.abs(c[3]) >= skill.presentation.radius * 0.6));
  const reduced = commands(sampleSkillEvent(event, event.duration * 0.5), { reduced: true });
  assert.ok(reduced.length >= 2);
  assert.ok(reduced.every(c => [0, 1, 2, 3, 4].includes(c[0])));
});
ck('ice crystal telegraph radius matches its authoritative area in world units', () => {
  const visual = skills.find(s => s.id === 'bingshuang:E').presentation;
  const gameplay = compileGameplaySkill('bingshuang', 'E');
  assert.equal(visual.radius, gameplay.radius * WORLD_SCALE);
  assert.equal(visual.duration * visual.windup, gameplay.delay);
});
ck('earth ally shield stone rampart is centered on the protected target, including reduced motion', () => {
  const skill = skills.find(s => s.id === 'dadi:W');
  for (const options of [{}, { reduced: true }]) {
    const e = sampleSkillEvent(make(skill), skill.presentation.duration * 0.5);
    const slabs = commands(e, options);
    assert(slabs.length >= 3);
    assert(slabs.every(c => Math.abs(c[1] - e.target.x) < 0.4));
  }
});
  for (const s of skills) ck(`${s.id} bounded / finite / deterministic / selective fusion`, () => {
  const event = make(s);
  for (const p of [0.12, 0.5, 0.78]) assert(commands(sampleSkillEvent(event, event.duration * p)).length > 0, `${s.id} blank stage ${p}`);
  for (let i = 1; i < 100; i++) {
    const e = sampleSkillEvent(event, event.duration * i / 100);
    const c = commands(e);
    assert(c.length <= 128);
    assert(c.every(x => [0, 1, 2, 3, 4].includes(x[0])));
    assert(c.every(x => x.slice(1, 8).every(Number.isFinite)));
    assert.deepEqual(commands(e), c);
  }
  const reduced = commands(sampleSkillEvent(event, event.duration * 0.25), { reduced: true });
  assert.deepEqual(commands(sampleSkillEvent(event, event.duration * 0.8), { reduced: true }), reduced);
});
ck('R has separate windup / main burst / aftermath silhouettes', () => {
  for (const s of skills.filter(s => s.slot === 'R')) {
    const e = make(s);
    const phases = [0.15, 0.5, 0.8].map(p => sampleSkillEvent(e, p * e.duration));
    assert.deepEqual(phases.map(visualPhase), ['windup', 'burst', 'afterglow']);
    assert.equal(new Set(phases.map(x => JSON.stringify(commands(x)))).size, 3);
    assert(phases.every(x => commands(x).length > 0));
  }
});
ck('dash actor moves and lands, reduced motion stays at origin', () => {
  for (const s of skills.filter(s => s.presentation.primitive === 'dash')) {
    const e = make(s), start = sampleSkillEvent(e, e.duration * 0.1), end = sampleSkillEvent(e, e.duration * 0.7);
    if (s.presentation.motif === 'magma-wake') assert.ok(sampleWorkshopPose(start).x > -3);
    else assert.equal(sampleWorkshopPose(start).x, -3);
    assert.equal(sampleWorkshopPose(end).x, 3);
    assert.equal(sampleWorkshopPose(end, true).x, -3);
    assert.deepEqual(sampleWorkshopPose(start), sampleWorkshopPose(start));
  }
});
ck('canonical origin/target frame rotates symmetrically for both sides', () => {
  for (const s of skills) {
    const e = sampleSkillEvent(make(s), s.presentation.duration * 0.55);
    const mirror = { ...e, origin: { x: 3, y: 0, z: 0 }, target: { x: -3, y: 0, z: 0 } };
    const a = commands(e), b = commands(mirror); assert.equal(a.length, b.length);
    a.forEach((c, i) => { assert(Math.abs(c[1] + b[i][1]) < 1e-9); assert(Math.abs(c[3] + b[i][3]) < 1e-9); });
  }
});
ck('compat adapter never leaks preview choreography into real attacks', () => {
  const scratch = { visual: skills[0].presentation };
  const fx = { type: 'line', ability: 'top:basic', sourceId: 'b1', world: { x: 0, y: 0, z: 0 }, targetWorld: { x: 1, y: 0, z: 0 }, progress: 0.5 };
  assert.equal(adaptHeroAttack(fx, scratch).visual, null);
});
console.log(`Hero Skills Round 2: PASS ${passed}/${passed}`);
