import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { goldenSkills, compileHeroSkill, createSkillPreviewEvent, sampleSkillEvent, ownsHeroAttack, adaptHeroAttack } from '../src/battle/moba/skills/heroSkillContract.js';
import { adaptEffects } from '../src/battle/moba/map/mobaRuntimeMapAdapter.js';
import { snapshotToFrame } from '../src/platform/contracts/mobaReplay.js';
let n = 0;
const ck = (name, fn) => { fn(); console.log(`PASS ${++n} ${name}`); };
const skills = goldenSkills();
ck('100 canonical heroes, 100 Golden heroes / 400 authored visuals', () => {
  assert.equal(CHAMPIONS_100.length, 100); assert.equal(skills.length, 400);
  assert.equal(new Set(skills.map(s => s.heroId)).size, 100);
  for (const s of skills) { assert.equal(s.gameplayEnabled, false); assert(Object.isFrozen(s.presentation)); }
});
ck('unknown skills are explicit absent, not class fallback', () => {
  assert.equal(compileHeroSkill('unknown', 'Q'), null); assert.equal(compileHeroSkill('ironclad', 'P'), null);
});
const origin = { x: -3, y: 0, z: -1 }, target = { x: 3, y: 0, z: 1 };
const e = createSkillPreviewEvent(skills[0], { id: 'e1', at: 2, origin, target });
ck('immutable copied inputs / rejects malformed coordinates', () => {
  assert.notEqual(e.origin, origin); assert(Object.isFrozen(e.origin));
  assert.throws(() => createSkillPreviewEvent(skills[0], { id: 'x', at: 0, origin: { x: NaN }, target }));
});
ck('absolute-time expiry, deterministic pause and seek backwards', () => {
  assert.equal(sampleSkillEvent(e, 1), null); assert.equal(sampleSkillEvent(e, 2 + e.duration), null);
  const at = sampleSkillEvent(e, 2.5); sampleSkillEvent(e, 3);
  assert.deepEqual(sampleSkillEvent(e, 2.5), at); assert.equal(sampleSkillEvent(e, NaN), null);
});
ck('side transform does not change timing or recipe', () => {
  const mirror = p => ({ x: -p.x, y: p.y, z: -p.z });
  const m = createSkillPreviewEvent(skills[0], { id: 'mirror', at: 2, origin: mirror(origin), target: mirror(target) });
  assert.equal(sampleSkillEvent(m, 2.5).progress, sampleSkillEvent(e, 2.5).progress);
  assert.deepEqual(m.origin, mirror(e.origin)); assert.equal(m.primitive, e.primitive);
});
const raw = { id: 'fx1', type: 'ult', ability: 'mid:power', sourceId: 'b1', targetId: 'r1',
  at: 10, life: 0.6, pos: { x: 100, y: 100 }, target: { x: 105, y: 105 } };
const snap = { ts: 10.3, players: [], towers: {}, bK: 0, rK: 0, bGold: 0, rGold: 0, fx: [raw] };
const before = JSON.stringify(snap);
const fx = adaptEffects(snap, 10.3, { roster: { b1: { heroId: 'bingshuang' } } })[0];
ck('legacy power never manufactures QWER / hit / status', () => {
  assert(ownsHeroAttack(fx)); const a = adaptHeroAttack(fx);
  assert.equal(a.skillId, null); assert.equal(a.provenance, 'legacy-attack');
  assert.equal(a.primitive, 'projectile'); assert.equal(JSON.stringify(snap), before);
  assert.equal(adaptHeroAttack({ ...fx, targetWorld: null }), null);
  assert(ownsHeroAttack({ ...fx, sourceId: null }));
});
ck('exclusive routing preserves environmental effects', () => {
  for (const ability of ['tower:basic', 'minion:basic', 'summoner:flash', 'buff:baron']) {
    assert.equal(ownsHeroAttack({ ...fx, ability }), false);
  }
  for (const role of ['top', 'jungle', 'mid', 'adc', 'sup']) {
    for (const variant of ['basic', 'power']) assert(ownsHeroAttack({ ...fx, ability: `${role}:${variant}` }));
  }
});
ck('replay retains original event tuple, no preview metadata', () => {
  const frame = snapshotToFrame(snap);
  assert(frame.fx.some(row => row.includes('mid:power') && row.includes('b1')));
  assert(!JSON.stringify(frame).includes('preview')); assert.equal(JSON.stringify(snap), before);
});
ck('formal renderer replacement, comparison only legacy mount', () => {
  const view = fs.readFileSync('src/battle/moba/render/MobaRuntimeView3D.jsx', 'utf8');
  const old = fs.readFileSync('src/battle/moba/render/MobaRuntimeEffects.jsx', 'utf8');
  assert(view.includes('<HeroVfxRuntime')); assert(!view.includes('<HeroSkillEffects'));
  assert(old.includes('if (ownsHeroAttack(fx)) continue;'));
});
ck('fairness / Item catalog and economy / replay contracts unchanged from official baseline', () => {
  // Hero Skills now owns separately tested opt-in LogicEngine and typed ability
  // damage in itemsEngineRuntime. Every other protected Item module stays frozen.
  const paths = ['src/battle/moba/matchProgression.js', 'src/battle/moba/mobaNavigation.js',
    'src/battle/battleResult.js', 'src/platform/contracts/mobaReplay.js', 'src/battle/moba/replay'];
  const diff = execFileSync('git', ['diff', 'dc520f1', '--', ...paths], { encoding: 'utf8' });
  assert.equal(diff.trim(), '');
  const itemPaths = execFileSync('git', ['diff', '--name-only', 'dc520f1', '--', 'src/battle/moba/items'], { encoding: 'utf8' });
  assert.deepEqual(itemPaths.trim().split(/\r?\n/), ['src/battle/moba/items/itemsEngineRuntime.js']);
});
console.log(`Hero Skills Phase 1: PASS ${n}/${n}`);
