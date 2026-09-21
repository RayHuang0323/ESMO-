import assert from 'node:assert/strict';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { LogicEngine } from '../src/LogicEngine.js';
import { compileGameplaySkill, toEngineHeroSkills } from '../src/battle/moba/skills/heroSkillGameplay.js';
import { adaptEffects } from '../src/battle/moba/map/mobaRuntimeMapAdapter.js';
import { adaptNamedHeroSkill } from '../src/battle/moba/skills/heroSkillContract.js';
import { snapshotToFrame } from '../src/platform/contracts/mobaReplay.js';
import { createReplaySource } from '../src/battle/moba/replay/replayPresentationSource.js';
import { mitigate } from '../src/battle/moba/items/itemEffects.js';
import { WORLD_BOUNDS } from '../src/gameData.js';

let pass = 0;
const ck = (name, fn) => { fn(); console.log(`✅ ${name}`); pass++; };
const roster = { b1: { heroId: 'ironclad' }, r1: { heroId: 'ironclad' } };
const config = toEngineHeroSkills(roster);
ck('100 heroes remain canonical; four hundred explicit slots are authored', () => {
  assert.equal(CHAMPIONS_100.length, 100);
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  assert.equal(compileGameplaySkill('ironclad', 'Q').skillId, 'ironclad:Q');
  assert.equal(compileGameplaySkill('bingshuang', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('bingshuang', 'E').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('dadi', 'Q').mechanic, 'line');
  assert.equal(compileGameplaySkill('dadi', 'W').mechanic, 'ally-shield');
  assert.equal(compileGameplaySkill('dadi', 'E').mechanic, 'root-target');
  assert.equal(compileGameplaySkill('cinderfist', 'W').mechanic, 'shield-burst');
  assert.equal(compileGameplaySkill('cinderfist', 'E').mechanic, 'dash-wall');
  assert.equal(compileGameplaySkill('dawnstrike', 'Q').mechanic, 'piercing-line');
  assert.equal(compileGameplaySkill('ironclad', 'W').mechanic, 'area-taunt-guard');
  assert.equal(compileGameplaySkill('thornwall', 'Q').mechanic, 'dash-control-strike');
  assert.equal(compileGameplaySkill('thornwall', 'E').mechanic, 'root-dot');
  assert.equal(compileGameplaySkill('gambler', 'W').mechanic, 'blink-shield');
  assert.equal(compileGameplaySkill('ravager', 'Q').mechanic, 'dash-knockup-strike');
  assert.equal(compileGameplaySkill('ravager', 'E').mechanic, 'dash-blast');
  assert.equal(compileGameplaySkill('sting', 'Q').mechanic, 'blink-strike');
  assert.equal(compileGameplaySkill('greymantle', 'E').mechanic, 'dash-blast');
  assert.equal(compileGameplaySkill('embercoil', 'Q').mechanic, 'root-dot');
  assert.equal(compileGameplaySkill('auralith', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('razorwing', 'E').mechanic, 'blink-shield');
  assert.equal(compileGameplaySkill('phantom', 'E').mechanic, 'cone-strike');
  assert.equal(compileGameplaySkill('mirrorshot', 'E').mechanic, 'cone-strike');
  assert.equal(compileGameplaySkill('mantra', 'R').mechanic, 'team-shield');
  assert.equal(compileGameplaySkill('luminary', 'E').mechanic, 'dash-blast');
  assert.equal(compileGameplaySkill('stoneguard', 'Q').mechanic, 'control-target');
  assert.equal(compileGameplaySkill('hexweave', 'Q').mechanic, 'area-root');
  assert.equal(toEngineHeroSkills({ b2: { heroId: 'unknown' } }), null);
});
ck('next six heroes use explicit shared contracts, not class fallback', () => {
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  assert.equal(compileGameplaySkill('suishan', 'W').mechanic, 'area-taunt');
  assert.equal(compileGameplaySkill('suishan', 'R').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('tixue', 'E').mechanic, 'line');
  assert.equal(compileGameplaySkill('rongyan', 'E').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('kuangfeng', 'W').mechanic, 'dash-blast');
  assert.equal(compileGameplaySkill('yueying', 'Q').mechanic, 'piercing-line');
  assert.equal(compileGameplaySkill('dianguang', 'Q').mechanic, 'blink-strike');
});
ck('thirteenth batch uses explicit sky, molten, frost, cyclone, and storm primitives', () => {
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  assert.equal(compileGameplaySkill('tiankong', 'Q').mechanic, 'dash-knockup-strike');
  assert.equal(compileGameplaySkill('tiankong', 'R').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('ronggang', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('ronggang', 'R').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('bingshouweis', 'E').mechanic, 'area-taunt-guard');
  assert.equal(compileGameplaySkill('bingshouweis', 'R').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('jufeng', 'Q').mechanic, 'cone-strike');
  assert.equal(compileGameplaySkill('jufeng', 'R').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('leimingcf', 'E').mechanic, 'dash-blast');
  assert.equal(compileGameplaySkill('leimingcf', 'R').mechanic, 'multi-strike');
});
ck('fourteenth batch uses explicit shadow, earth, fate, tide, judgment, and sanctified primitives', () => {
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  assert.equal(compileGameplaySkill('youming', 'Q').mechanic, 'silence-target');
  assert.equal(compileGameplaySkill('shanying', 'Q').mechanic, 'blink-strike');
  assert.equal(compileGameplaySkill('shanying', 'E').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('dadi2', 'Q').mechanic, 'dash-wall');
  assert.equal(compileGameplaySkill('dadi2', 'R').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('mingyun2', 'Q').mechanic, 'root-target');
  assert.equal(compileGameplaySkill('mingyun2', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('mingyun2', 'E').mechanic, 'control-target');
  assert.equal(compileGameplaySkill('haixiao', 'Q').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('haixiao', 'E').mechanic, 'line');
  assert.equal(compileGameplaySkill('jueying', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('jueying', 'E').mechanic, 'blink-strike');
  assert.equal(compileGameplaySkill('tianfa', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('tianfa', 'W').mechanic, 'blink-shield');
  assert.equal(compileGameplaySkill('shengyan', 'Q').mechanic, 'piercing-line');
});
ck('fifteenth batch uses explicit quantum, doomsday, lifeline, ironheart, fate, and soul primitives', () => {
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  assert.equal(compileGameplaySkill('liangzicz', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('liangzicz', 'W').mechanic, 'blink-shield');
  assert.equal(compileGameplaySkill('mori', 'E').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('shengming', 'Q').mechanic, 'root-target');
  assert.equal(compileGameplaySkill('shengming', 'E').mechanic, 'root-dot');
  assert.equal(compileGameplaySkill('tieshixin', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('mingyunyindao', 'E').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('linghun', 'Q').mechanic, 'control-target');
  assert.equal(compileGameplaySkill('guihuo', 'Q').mechanic, 'delayed-area');
});
ck('sixteenth batch uses explicit guard, area, multi-strike, retreat, and finisher primitives', () => {
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  assert.equal(compileGameplaySkill('ironclad', 'R').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('thornwall', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('thornwall', 'R').mechanic, 'area-root');
  assert.equal(compileGameplaySkill('ravager', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('cinderfist', 'Q').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('cinderfist', 'R').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('sting', 'W').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('embercoil', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('gambler', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('gambler', 'E').mechanic, 'area-root');
  assert.equal(compileGameplaySkill('razorwing', 'R').mechanic, 'dash-control-strike');
  assert.equal(compileGameplaySkill('phantom', 'R').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('dawnstrike', 'W').mechanic, 'blink-shield');
  assert.equal(compileGameplaySkill('dawnstrike', 'R').mechanic, 'piercing-line');
  assert.equal(compileGameplaySkill('luminary', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('kuangfeng', 'E').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('tixue', 'R').mechanic, 'empowered-strike');
});
ck('seventeenth batch introduces marks, heals, and ally movement as explicit primitives', () => {
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  assert.equal(compileGameplaySkill('dawnstrike', 'E').mechanic, 'target-mark');
  assert.equal(compileGameplaySkill('yueying', 'W').mechanic, 'target-mark');
  assert.equal(compileGameplaySkill('maestro', 'E').mechanic, 'target-mark');
  assert.equal(compileGameplaySkill('hanbing', 'E').mechanic, 'target-mark');
  assert.equal(compileGameplaySkill('shengguang', 'Q').mechanic, 'target-heal');
  assert.equal(compileGameplaySkill('shengguang', 'E').mechanic, 'area-heal');
  assert.equal(compileGameplaySkill('zhanchang', 'Q').mechanic, 'target-heal');
  assert.equal(compileGameplaySkill('hexweave', 'E').mechanic, 'ally-blink');
  assert.equal(compileGameplaySkill('anliuyouXia', 'R').mechanic, 'ally-blink');
  assert.equal(compileGameplaySkill('zhanchang', 'R').mechanic, 'ally-blink');
  assert.equal(compileGameplaySkill('huanjing', 'E').mechanic, 'ally-blink');
});
ck('eighteenth batch introduces deterministic empowered basic attacks as an explicit primitive', () => {
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  for (const [heroId, slot] of [['ironclad', 'E'], ['ravager', 'R'], ['sting', 'R'], ['duskblade', 'R'],
    ['maestro', 'Q'], ['gambler', 'R'], ['dianguang', 'R'], ['mingyun', 'R'], ['tixue', 'R'], ['tianfa', 'R']]) {
    assert.equal(compileGameplaySkill(heroId, slot).mechanic, 'empowered-strike');
  }
});
ck('nineteenth batch introduces team and targeted ally haste primitives', () => {
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  assert.equal(compileGameplaySkill('greymantle', 'W').mechanic, 'team-haste');
  assert.equal(compileGameplaySkill('langwang', 'W').mechanic, 'team-haste');
  assert.equal(compileGameplaySkill('fengshen', 'W').mechanic, 'targeted-ally-haste');
  assert.equal(compileGameplaySkill('fuwenbianzhi', 'W').mechanic, 'targeted-ally-haste');
});
ck('haste primitives apply deterministic movement state and expose it in snapshot', () => {
  const team = new LogicEngine(41);
  team.configureHeroSkills({ players: { b1: { W: compileGameplaySkill('greymantle', 'W') } } });
  const b1 = team.players.find(p => p.id === 'b1'), b2 = team.players.find(p => p.id === 'b2');
  b1.pos = { x: 100, y: 100 }; b2.pos = { x: 103, y: 100 };
  team._heroSkillStep();
  assert.equal(b1.heroSkillHasteFactor, compileGameplaySkill('greymantle', 'W').speedFactor);
  assert.equal(b2.heroSkillHasteFactor, compileGameplaySkill('greymantle', 'W').speedFactor);
  assert.ok(team.snapshot().players.find(p => p.id === 'b2').statusEffects.some(s => s.id === 'hero-haste'));

  const targeted = new LogicEngine(43);
  targeted.configureHeroSkills({ players: { b1: { W: compileGameplaySkill('fengshen', 'W') } } });
  const c1 = targeted.players.find(p => p.id === 'b1'), c2 = targeted.players.find(p => p.id === 'b2');
  c1.pos = { x: 100, y: 100 }; c2.pos = { x: 102, y: 100 }; c2.hp = c2.maxHp * 0.4;
  targeted._heroSkillStep();
  assert.equal(c2.heroSkillHasteFactor, compileGameplaySkill('fengshen', 'W').speedFactor);
  assert.equal(c1.heroSkillHasteFactor, undefined);
  targeted.t = 20;
  assert.equal(targeted.snapshot().players.find(p => p.id === 'b2').statusEffects.some(s => s.id === 'hero-haste'), false);
});
ck('empowered basic attacks are a one-shot authoritative buff with expiry and no VFX-owned damage', () => {
  const e = new LogicEngine(37);
  e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('ironclad', 'E') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 103, y: 100 };
  e._heroSkillStep();
  assert.ok(b.heroSkillEmpowerUntil > 0);
  assert.equal(e.snapshot().players.find(p => p.id === 'b1').statusEffects.some(s => s.id === 'empowered-strike'), true);
  const before = r.hp;
  const pending = [];
  e._combatStep(b, b.lane, e.players, 0.1, 1, pending);
  assert.equal(pending.length, 1);
  e._damageHero(r, pending[0][2]);
  assert.ok(r.hp < before);
  assert.equal(b.heroSkillEmpowerUntil, 0);
  e.t = 20;
  assert.equal(e.snapshot().players.find(p => p.id === 'b1').statusEffects.some(s => s.id === 'empowered-strike'), false);
});
ck('marks are authoritative status, damage amplification, and replay-visible state', () => {
  const e = new LogicEngine(17);
  e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('dawnstrike', 'E') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 103, y: 100 };
  e._heroSkillStep();
  assert.equal(r.heroSkillMarkSourceId, 'b1');
  assert.equal(r.heroSkillMarkAmp, 0.2);
  assert.equal(e._heroSkillDamageFactor(r), 1.2);
  assert.ok(e.snapshot().players.find(p => p.id === 'r1').statusEffects.some(s => s.id === 'mark'));
  e.t = 5; assert.equal(e._heroSkillDamageFactor(r), 1);
  assert.equal(e.snapshot().players.find(p => p.id === 'r1').statusEffects.some(s => s.id === 'mark'), false);
});
ck('target and area healing use canonical hp/heal accounting and deterministic ally selection', () => {
  const target = new LogicEngine(19);
  target.configureHeroSkills({ players: { b1: { Q: compileGameplaySkill('shengguang', 'Q') } } });
  const b1 = target.players.find(p => p.id === 'b1'), b2 = target.players.find(p => p.id === 'b2');
  b1.pos = { x: 100, y: 100 }; b2.pos = { x: 102, y: 100 }; b2.hp = b2.maxHp * 0.5;
  const before = b2.hp, healBefore = b2.heal;
  target._heroSkillStep();
  assert.ok(b2.hp > before); assert.ok(b2.heal > healBefore);

  const area = new LogicEngine(23);
  area.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('shengguang', 'E') } } });
  const a1 = area.players.find(p => p.id === 'b1'), a2 = area.players.find(p => p.id === 'b2'), a3 = area.players.find(p => p.id === 'b3');
  a1.pos = { x: 100, y: 100 }; a2.pos = { x: 102, y: 100 }; a3.pos = { x: 104, y: 100 };
  a2.hp = a2.maxHp * 0.5; a3.hp = a3.maxHp * 0.5;
  const a2Before = a2.hp, a3Before = a3.hp;
  area._heroSkillStep();
  assert.ok(a2.hp > a2Before); assert.equal(a3.hp, a3Before);
});
ck('ally blink primitives preserve direction and move only the authored actor', () => {
  const pull = new LogicEngine(29);
  pull.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('hexweave', 'E') } } });
  const p1 = pull.players.find(p => p.id === 'b1'), p2 = pull.players.find(p => p.id === 'b2');
  p1.pos = { x: 100, y: 100 }; p2.pos = { x: 104, y: 100 };
  pull._heroSkillStep();
  assert.equal(p1.pos.x, 100); assert.ok(p2.pos.x < 104 && p2.pos.x > 100);

  const jump = new LogicEngine(31);
  jump.configureHeroSkills({ players: { b1: { R: compileGameplaySkill('anliuyouXia', 'R') } } });
  const j1 = jump.players.find(p => p.id === 'b1'), j2 = jump.players.find(p => p.id === 'b2');
  j1.pos = { x: 100, y: 100 }; j2.pos = { x: 104, y: 100 };
  jump._heroSkillStep();
  assert.ok(j1.pos.x > 100 && j1.pos.x < 104); assert.equal(j2.pos.x, 104);
});
ck('area-taunt and delayed area-control preserve target ownership and timing', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: {
    W: compileGameplaySkill('suishan', 'W'), R: compileGameplaySkill('suishan', 'R'),
  } } });
  const b = e.players.find(p => p.id === 'b1');
  const [r1, r2] = ['r1', 'r2'].map(id => e.players.find(p => p.id === id));
  b.pos = { x: 100, y: 100 }; r1.pos = { x: 103, y: 100 }; r2.pos = { x: 103, y: 101 };
  const hp = [r1.hp, r2.hp];
  e._heroSkillStep();
  assert.deepEqual([r1.hp, r2.hp], hp);
  assert.equal(r1.heroSkillTauntSourceId, 'b1');
  assert.equal(r2.heroSkillTauntSourceId, 'b1');
  e.t = 0.1; e._heroSkillStep();
  assert.ok(e.heroSkillPending.some(entry => entry.kind === 'area-control'));
  e.t = 0.75; e._heroSkillStep();
  assert.ok(r1.hp < hp[0] && r2.hp < hp[1]);
  assert.equal(r1.heroSkillControlKind, 'knockup');
  assert.equal(r2.heroSkillControlKind, 'knockup');
});
ck('multi-strike and silence contracts are explicit for the next six heroes', () => {
  assert.equal(CHAMPIONS_100.reduce((n, h) => n + ['Q','W','E','R'].filter(s => h.skills[s].gameplay).length, 0), 400);
  assert.equal(compileGameplaySkill('duskblade', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('duskblade', 'W').mechanic, 'silence-target');
  assert.equal(compileGameplaySkill('voidrift', 'W').mechanic, 'silence-target');
  assert.equal(compileGameplaySkill('anye', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('jiansheng', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('xingchen', 'Q').mechanic, 'piercing-line');
  assert.equal(compileGameplaySkill('leiting', 'R').mechanic, 'delayed-area');
});
ck('the next six heroes use explicit movement, shield, control, and finisher contracts', () => {
  assert.equal(compileGameplaySkill('maestro', 'W').mechanic, 'blink-shield');
  assert.equal(compileGameplaySkill('maestro', 'R').finalMultiplier, 3);
  assert.equal(compileGameplaySkill('fengbao', 'Q').mechanic, 'root-target');
  assert.equal(compileGameplaySkill('fengbao', 'W').mechanic, 'dash-strike');
  assert.equal(compileGameplaySkill('shikong', 'Q').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('shikong', 'W').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('liuxing', 'E').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('liuxing', 'R').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('longji', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('longji', 'R').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('binghe', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('binghe', 'R').mechanic, 'dash-strike');
});
ck('retreat blink and self shield preserve deterministic authority', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: {
    W: compileGameplaySkill('maestro', 'W'), E: compileGameplaySkill('longji', 'W'),
  } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 103, y: 100 };
  e._heroSkillStep();
  assert.ok(b.pos.x < 100, `expected retreat, got ${b.pos.x}`);
  assert.ok(b.shield > 0);
  const frame = e.snapshot();
  assert.ok(frame.players.find(p => p.id === 'b1').statusEffects.some(s => s.id === 'shield'));
});
ck('multi-strike applies the authored final-hit multiplier', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { R: compileGameplaySkill('maestro', 'R') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 103, y: 100 };
  const start = r.hp;
  e._heroSkillStep();
  const rule = compileGameplaySkill('maestro', 'R');
  for (let i = 0; i < rule.hitCount; i++) { e.t = i * rule.interval; e._heroSkillStep(); }
  assert.ok(start - r.hp > (rule.damage + b.power * rule.powerRatio) * rule.finalMultiplier);
});
ck('the next shared-contract batch stays explicit across eight canonical heroes', () => {
  assert.equal(compileGameplaySkill('huanying', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('huanying', 'E').mechanic, 'cone-strike');
  assert.equal(compileGameplaySkill('huanying', 'R').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('shengguang', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('tianshi', 'Q').mechanic, 'root-target');
  assert.equal(compileGameplaySkill('tianshi', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('fuwenbianzhi', 'Q').mechanic, 'root-target');
  assert.equal(compileGameplaySkill('xueyue', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('xueyue', 'E').mechanic, 'dash-blast');
  assert.equal(compileGameplaySkill('tiemu', 'Q').mechanic, 'control-target');
  assert.equal(compileGameplaySkill('tiemu', 'E').mechanic, 'area-root');
  assert.equal(compileGameplaySkill('dushe', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('dushe', 'W').mechanic, 'root-target');
  assert.equal(compileGameplaySkill('dushe', 'E').mechanic, 'cone-strike');
  assert.equal(compileGameplaySkill('yingsi', 'W').mechanic, 'blink-strike');
  assert.equal(compileGameplaySkill('yingsi', 'E').mechanic, 'area-root');
});
ck('the next elemental and marksman batch uses only validated primitives', () => {
  assert.equal(compileGameplaySkill('langwang', 'Q').mechanic, 'dash-strike');
  assert.equal(compileGameplaySkill('chichuan', 'Q').mechanic, 'cone-strike');
  assert.equal(compileGameplaySkill('chichuan', 'E').mechanic, 'dash-blast');
  assert.equal(compileGameplaySkill('hunpo', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('leiming', 'Q').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('leiming', 'E').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('ronghuo', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('miwu', 'Q').mechanic, 'blink-strike');
  assert.equal(compileGameplaySkill('miwu', 'W').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('jingxiang', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('yanfeng', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('yanfeng', 'W').mechanic, 'dash-blast');
  assert.equal(compileGameplaySkill('yanfeng', 'E').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('hanbing', 'Q').mechanic, 'piercing-line');
  assert.equal(compileGameplaySkill('dujian', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('dujian', 'E').mechanic, 'multi-strike');
});
ck('the next frontline and support batch stays explicit across ten canonical heroes', () => {
  assert.equal(compileGameplaySkill('liangzi', 'Q').mechanic, 'piercing-line');
  assert.equal(compileGameplaySkill('liangzi', 'W').mechanic, 'blink-strike');
  assert.equal(compileGameplaySkill('zhanchang', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('shiqiang', 'Q').mechanic, 'control-target');
  assert.equal(compileGameplaySkill('shiqiang', 'E').mechanic, 'dash-knockup-strike');
  assert.equal(compileGameplaySkill('shiqiang', 'R').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('fengshen', 'Q').mechanic, 'root-target');
  assert.equal(compileGameplaySkill('fengshen', 'R').mechanic, 'team-shield');
  assert.equal(compileGameplaySkill('mingyun', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('xukong', 'R').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('longyi', 'Q').mechanic, 'cone-strike');
});
ck('the next lightning, bramble, gravity, and flame batch stays explicit', () => {
  assert.equal(compileGameplaySkill('leisuhunter', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('leisuhunter', 'W').mechanic, 'blink-strike');
  assert.equal(compileGameplaySkill('jingci', 'Q').mechanic, 'root-dot');
  assert.equal(compileGameplaySkill('jingci', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('jingci', 'E').mechanic, 'root-dot');
  assert.equal(compileGameplaySkill('jingci', 'R').mechanic, 'area-root');
  assert.equal(compileGameplaySkill('anliuyouXia', 'Q').mechanic, 'dash-strike');
  assert.equal(compileGameplaySkill('anliuyouXia', 'W').mechanic, 'shield-burst');
  assert.equal(compileGameplaySkill('anliuyouXia', 'E').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('xingjie', 'Q').mechanic, 'area-control');
  assert.equal(compileGameplaySkill('xingjie', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('xingjie', 'E').mechanic, 'blink-strike');
  assert.equal(compileGameplaySkill('lieyan', 'Q').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('lieyan', 'W').mechanic, 'shield-burst');
  assert.equal(compileGameplaySkill('lieyan', 'E').mechanic, 'dash-wall');
  assert.equal(compileGameplaySkill('lieyan', 'R').mechanic, 'area-control');
});
ck('the next sanctum, marksman, cyclone, and bulwark batch stays explicit', () => {
  assert.equal(compileGameplaySkill('shengdun', 'Q').mechanic, 'dash-knockup-strike');
  assert.equal(compileGameplaySkill('shengdun', 'W').mechanic, 'shield-burst');
  assert.equal(compileGameplaySkill('shengdun', 'E').mechanic, 'area-taunt-guard');
  assert.equal(compileGameplaySkill('shengdun', 'R').mechanic, 'team-shield');
  assert.equal(compileGameplaySkill('guangsu', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('guangsu', 'W').mechanic, 'blink-shield');
  assert.equal(compileGameplaySkill('guangsu', 'E').mechanic, 'piercing-line');
  assert.equal(compileGameplaySkill('siwang', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('siwang', 'W').mechanic, 'blink-shield');
  assert.equal(compileGameplaySkill('siwang', 'E').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('xuanfeng', 'Q').mechanic, 'cone-strike');
  assert.equal(compileGameplaySkill('xuanfeng', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('xuanfeng', 'E').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('tiebi', 'Q').mechanic, 'dash-control-strike');
  assert.equal(compileGameplaySkill('tiebi', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('tiebi', 'E').mechanic, 'area-root');
});
ck('the next shadow, chaos, time, dream, and blood contracts stay explicit', () => {
  assert.equal(compileGameplaySkill('tielian', 'Q').mechanic, 'root-target');
  assert.equal(compileGameplaySkill('tielian', 'W').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('yeiren', 'Q').mechanic, 'multi-strike');
  assert.equal(compileGameplaySkill('wuxing', 'Q').mechanic, 'control-target');
  assert.equal(compileGameplaySkill('wuxing', 'E').mechanic, 'blink-strike');
  assert.equal(compileGameplaySkill('hundun', 'Q').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('hundun', 'E').mechanic, 'self-shield');
  assert.equal(compileGameplaySkill('shensheng', 'Q').mechanic, 'projectile');
  assert.equal(compileGameplaySkill('shensheng', 'W').mechanic, 'blink-shield');
  assert.equal(compileGameplaySkill('shensheng', 'E').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('shensheng', 'R').mechanic, 'delayed-area');
  assert.equal(compileGameplaySkill('shiguang', 'Q').mechanic, 'control-target');
  assert.equal(compileGameplaySkill('shiguang', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('huanjing', 'Q').mechanic, 'control-target');
  assert.equal(compileGameplaySkill('huanjing', 'W').mechanic, 'targeted-ally-shield');
  assert.equal(compileGameplaySkill('xuemai', 'Q').mechanic, 'root-dot');
});
ck('multi-strike resolves deterministic locked hits while silence blocks skills only', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { Q: compileGameplaySkill('duskblade', 'Q') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 103, y: 100 };
  const start = r.hp;
  e._heroSkillStep();
  assert.ok(e.heroSkillPending.some(entry => entry.kind === 'multi-strike'));
  e.t = 0.18; e._heroSkillStep();
  assert.ok(r.hp < start);
  const s = new LogicEngine(7);
  s.configureHeroSkills({ players: {
    b1: { W: compileGameplaySkill('duskblade', 'W') },
    r1: { Q: compileGameplaySkill('duskblade', 'Q') },
  } });
  const caster = s.players.find(p => p.id === 'b1'), foe = s.players.find(p => p.id === 'r1');
  caster.pos = { x: 100, y: 100 }; foe.pos = { x: 103, y: 100 };
  foe.heroSkillReadyAt.Q = 1;
  s._heroSkillStep();
  assert.equal(foe.heroSkillSilenceUntil, 1.5);
  const readyDuringSilence = foe.heroSkillReadyAt.Q;
  s.t = 0.5; s._heroSkillStep();
  assert.equal(foe.heroSkillReadyAt.Q, readyDuringSilence);
  assert.equal(foe.heroSkillControlUntil, undefined);
});
ck('cone and area-root primitives keep directional and delayed control deterministic', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: {
    E: compileGameplaySkill('mirrorshot', 'E'), Q: compileGameplaySkill('hexweave', 'Q'),
  } } });
  const b = e.players.find(p => p.id === 'b1');
  const [r1, r2, r3] = ['r1', 'r2', 'r3'].map(id => e.players.find(p => p.id === id));
  b.pos = { x: 100, y: 100 }; r1.pos = { x: 104, y: 100 }; r2.pos = { x: 104, y: 1.5 + 100 }; r3.pos = { x: 104, y: 104 };
  const hp = [r1.hp, r2.hp, r3.hp];
  e._heroSkillStep();
  assert.ok(r1.hp < hp[0] && r2.hp < hp[1]);
  assert.equal(r3.hp, hp[2]);
  e.t = 0.1; e._heroSkillStep();
  assert.ok(e.heroSkillPending.some(entry => entry.kind === 'area-root'));
  e.t = 0.65; e._heroSkillStep();
  assert.equal(r1.heroSkillRootUntil, 2.15);
  assert.ok(r1.hp < hp[0]);
});
ck('targeted and team shield primitives select only canonical allies', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: {
    W: compileGameplaySkill('mantra', 'W'), R: compileGameplaySkill('mantra', 'R'),
  } } });
  const b = e.players.find(p => p.id === 'b1'), ally = e.players.find(p => p.id === 'b2'), far = e.players.find(p => p.id === 'b3');
  const foe = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; ally.pos = { x: 103, y: 100 }; far.pos = { x: 120, y: 100 }; foe.pos = { x: 104, y: 100 };
  ally.hp = ally.maxHp * 0.35; far.hp = far.maxHp * 0.4;
  e._heroSkillStep();
  assert.equal(ally.shield, ally.maxHp * 0.16);
  assert.equal(far.shield, 0);
  e.t = 0.1; e._heroSkillStep();
  assert.ok(b.shield > 0 && ally.shield > 0);
  assert.equal(foe.shield, 0);
});
ck('ravager dash-knockup and blast primitives preserve path intent and AoE ownership', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: {
    Q: compileGameplaySkill('ravager', 'Q'), E: compileGameplaySkill('ravager', 'E'),
  } } });
  const b = e.players.find(p => p.id === 'b1');
  const [r1, r2] = ['r1', 'r2'].map(id => e.players.find(p => p.id === id));
  b.pos = { x: 100, y: 100 }; r1.pos = { x: 104, y: 100 }; r2.pos = { x: 104, y: 101.35 };
  const hp = r1.hp;
  e._heroSkillStep();
  assert.ok(r1.hp < hp);
  assert.equal(r1.heroSkillControlKind, 'knockup');
  assert.ok(b.pos.x > 100);
  assert.equal(r2.heroSkillSlowFactor, compileGameplaySkill('ravager', 'Q').pathSlowFactor);
  e.t = 0.1;
  e._heroSkillStep();
  assert.equal(b.heroSkillReadyAt.E, 14.1);
  assert.ok(r2.hp < r2.maxHp);
  assert.equal(e.fx.at(-1).skillId, 'ravager:E');
});
ck('sting blink-strike lands beside the target and dash-blast remains deterministic', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: {
    Q: compileGameplaySkill('sting', 'Q'), E: compileGameplaySkill('sting', 'E'),
  } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 104, y: 100 };
  const hp = r.hp;
  e._heroSkillStep();
  assert.ok(r.hp < hp);
  assert.ok(Math.abs(r.pos.x - b.pos.x) > 0.9 && Math.abs(r.pos.x - b.pos.x) < 1.3);
  assert.equal(b.heroSkillReadyAt.Q, 8);
  e.t = 0.1; e._heroSkillStep();
  assert.equal(b.heroSkillReadyAt.E, 14.1);
  assert.ok(e.fx.some(f => f.skillId === 'sting:E'));
});
ck('thorn charge dashes, stuns the first target, and slows other enemies on its path', () => {
  const e = new LogicEngine(7), rule = compileGameplaySkill('thornwall', 'Q');
  e.configureHeroSkills({ players: { b1: { Q: rule } } });
  const b = e.players.find(p => p.id === 'b1');
  const [r1, r2] = ['r1', 'r2'].map(id => e.players.find(p => p.id === id));
  b.pos = { x: 100, y: 100 }; r1.pos = { x: 102, y: 100 }; r2.pos = { x: 102, y: 101.6 };
  const hp = r1.hp;
  e._heroSkillStep();
  assert.ok(r1.hp < hp);
  assert.equal(r1.heroSkillControlKind, 'stun');
  assert.equal(r1.heroSkillControlUntil, rule.controlDuration);
  assert.equal(r2.heroSkillSlowFactor, rule.pathSlowFactor);
  assert.equal(r2.heroSkillSlowUntil, rule.pathSlowDuration);
  assert.equal(b.heroSkillReadyAt.Q, rule.cooldown);
  assert.equal(e.fx.at(-1).skillId, 'thornwall:Q');
});
ck('thorn chain roots for its full lock and applies three deterministic magic damage ticks', () => {
  const e = new LogicEngine(7), rule = compileGameplaySkill('thornwall', 'E');
  e.configureHeroSkills({ players: { b1: { E: rule } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 103, y: 100 };
  const start = r.hp;
  e._heroSkillStep();
  assert.equal(r.heroSkillRootUntil, rule.rootDuration);
  assert.equal(r.hp, start);
  e.t = 0.5; e._heroSkillStep();
  const afterOne = r.hp;
  e.t = 1; e._heroSkillStep();
  const afterTwo = r.hp;
  e.t = 1.5; e._heroSkillStep();
  assert.ok(afterOne < start && afterTwo < afterOne && r.hp < afterTwo);
  assert.ok(Math.abs(start - r.hp - (rule.damage + b.power * rule.powerRatio) * 3) < 1e-9);
  assert.equal(e.fx.at(-1).skillId, 'thornwall:E');
});
ck('gambler blink-shield changes position without dealing damage and exposes shield state', () => {
  const e = new LogicEngine(7), rule = compileGameplaySkill('gambler', 'W');
  e.configureHeroSkills({ players: { b1: { W: rule } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 104, y: 100 };
  const hp = r.hp, before = { ...b.pos };
  e._heroSkillStep();
  assert.equal(r.hp, hp);
  assert.ok(Math.abs(b.pos.x - before.x) > 3.4);
  assert.equal(b.shieldUntil, rule.shieldDuration);
  assert.equal(b.shield, b.maxHp * rule.shieldPctMaxHp);
  assert.equal(e.fx.at(-1).skillId, 'gambler:W');
});
ck('iron guard taunts every nearby enemy without damaging or stunning, and exposes cooldown/Replay identity', () => {
  const e = new LogicEngine(7);
  const rule = compileGameplaySkill('ironclad', 'W');
  e.configureHeroSkills({ players: { b1: { W: rule } } });
  const b = e.players.find(p => p.id === 'b1');
  const [r1, r2, r3] = ['r1', 'r2', 'r3'].map(id => e.players.find(p => p.id === id));
  b.pos = { x: 100, y: 100 }; r1.pos = { x: 103, y: 100 };
  r2.pos = { x: 100, y: 103 }; r3.pos = { x: 110, y: 100 };
  const hp = [r1.hp, r2.hp, r3.hp];
  e._heroSkillStep();
  assert.deepEqual([r1.hp, r2.hp, r3.hp], hp);
  assert.equal(r1.heroSkillTauntSourceId, 'b1');
  assert.equal(r2.heroSkillTauntSourceId, 'b1');
  assert.equal(r3.heroSkillTauntSourceId, undefined);
  assert.equal(r1.heroSkillTauntUntil, rule.tauntDuration);
  assert.equal(r1.heroSkillControlUntil, undefined);
  assert.equal(b.heroSkillReadyAt.W, rule.cooldown);
  assert.equal(b.heroSkillGuardReduction, rule.reduction);
  assert.equal(b.heroSkillGuardUntil, rule.guardDuration);
  assert.ok(e.snapshot().players.find(p => p.id === 'r1').statusEffects.some(s => s.id === 'taunt'));
  const frame = snapshotToFrame(e.snapshot());
  const source = createReplaySource({ frames: [frame] });
  const view = adaptEffects({ ts: frame.t, fx: source.getState().snapshot.fx }, frame.t + 0.2,
    { roster: { b1: { heroId: 'ironclad' } } });
  assert.ok(view.some(f => f.skillId === 'ironclad:W' && adaptNamedHeroSkill(f)?.provenance === 'authority'));
});
ck('taunted hero attacks the caster over a nearer enemy, then normal targeting resumes on expiry', () => {
  const e = new LogicEngine(7), rule = compileGameplaySkill('ironclad', 'W');
  e.configureHeroSkills({ players: { b1: { W: rule } } });
  const b = e.players.find(p => p.id === 'b1'), other = e.players.find(p => p.id === 'b2');
  const r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; other.pos = { x: 102, y: 100 }; r.pos = { x: 103, y: 100 };
  e._heroSkillStep();
  const tauntedHits = []; e.t = 0.5; e._combatStep(r, r.lane, e.players, 0.5, 1, tauntedHits);
  assert.equal(tauntedHits[0]?.[1].id, 'b1');
  const normalHits = []; e.t = rule.tauntDuration; e._combatStep(r, r.lane, e.players, 0.5, 1, normalHits);
  assert.equal(normalHits[0]?.[1].id, 'b2');
});
ck('taunt redirects movement intent to the living caster and releases on expiry or death', () => {
  const e = new LogicEngine(7), rule = compileGameplaySkill('ironclad', 'W');
  e.configureHeroSkills({ players: { b1: { W: rule } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 103, y: 100 };
  e._heroSkillStep();
  const retreat = { x: 200, y: 200 };
  assert.deepEqual(e._heroTauntTarget(r, retreat), b.pos);
  e.t = rule.tauntDuration;
  assert.equal(e._heroTauntTarget(r, retreat), retreat);
  e.t = 0.5; b.dead = true;
  assert.equal(e._heroTauntTarget(r, retreat), retreat);
});
ck('guard reduces incoming hero damage before shields in Items OFF and ON, then expires', () => {
  for (const itemsOn of [false, true]) {
    const e = new LogicEngine(7), rule = compileGameplaySkill('ironclad', 'W');
    if (itemsOn) e.configureItems({ players: { b1: { arch: '坦克' }, r1: { arch: '戰士' } } });
    e.configureHeroSkills({ players: { b1: { W: rule } } });
    const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
    b.pos = { x: 100, y: 100 }; r.pos = { x: 103, y: 100 };
    e._heroSkillStep();
    const hp = b.hp;
    if (itemsOn) {
      const raw = e.items.resolveAbilityHit(r, b, 100, 'true');
      e.items.applyDamage(b, e._heroGuardHit(b, raw), e.t);
    } else e._damageHero(b, 100);
    assert.ok(Math.abs(hp - b.hp - 100 * (1 - rule.reduction)) < 1e-9);
    e.t = rule.guardDuration;
    const before = b.hp;
    if (itemsOn) {
      const raw = e.items.resolveAbilityHit(r, b, 100, 'true');
      e.items.applyDamage(b, e._heroGuardHit(b, raw), e.t);
    } else e._damageHero(b, 100);
    assert.equal(before - b.hp, 100);
  }
});
ck('guard scales physical, magic and true Item channels equally after resistance', () => {
  const e = new LogicEngine(7), rule = compileGameplaySkill('ironclad', 'W');
  e.configureItems({ players: { b1: { arch: '坦克' }, r1: { arch: '戰士' } } });
  e.configureHeroSkills({ players: { b1: { W: rule } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 103, y: 100 };
  e._heroSkillStep();
  for (const type of ['physical', 'magic', 'true']) {
    const raw = e.items.resolveAbilityHit(r, b, 100, type);
    const guarded = e._heroGuardHit(b, raw);
    assert.ok(Math.abs(guarded.total - raw.total * (1 - rule.reduction)) < 1e-9);
  }
});
ck('steel guard taunt and guard duration mirror across sides without changing opt-out', () => {
  const make = side => {
    const e = new LogicEngine(7), seat = side === 'blue' ? 'b1' : 'r1';
    const foeId = side === 'blue' ? 'r1' : 'b1', sign = side === 'blue' ? -1 : 1;
    e.configureHeroSkills({ players: { [seat]: { W: compileGameplaySkill('ironclad', 'W') } } });
    const p = e.players.find(q => q.id === seat), foe = e.players.find(q => q.id === foeId);
    p.pos = { x: WORLD_BOUNDS.centerX + sign * 65, y: WORLD_BOUNDS.centerY + sign * 65 };
    foe.pos = { x: p.pos.x - sign * 3, y: p.pos.y };
    e._heroSkillStep();
    return { e, p, foe };
  };
  const blue = make('blue'), red = make('red');
  assert.equal(blue.foe.heroSkillTauntUntil, red.foe.heroSkillTauntUntil);
  assert.equal(blue.p.heroSkillGuardReduction, red.p.heroSkillGuardReduction);
  assert.equal(blue.p.heroSkillGuardUntil, red.p.heroSkillGuardUntil);
  assert.equal(blue.e.fx.find(f => f.skillId === 'ironclad:W').life,
    red.e.fx.find(f => f.skillId === 'ironclad:W').life);
  for (const field of ['x', 'y']) assert.ok(Math.abs(
    blue.p.pos[field] + red.p.pos[field] - 2 * WORLD_BOUNDS[`center${field.toUpperCase()}`]) < 1e-6);
});
ck('piercing arrow orders all line hits by travel distance and decays damage per target', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { Q: compileGameplaySkill('dawnstrike', 'Q') } } });
  const b = e.players.find(p => p.id === 'b1');
  const foes = ['r1', 'r2', 'r3', 'r4'].map(id => e.players.find(p => p.id === id));
  b.pos = { x: 100, y: 100 };
  foes[0].pos = { x: 104, y: 100 }; foes[1].pos = { x: 106, y: 100 };
  foes[2].pos = { x: 108, y: 100 }; foes[3].pos = { x: 105, y: 103 };
  const hp = foes.map(p => p.hp), rule = compileGameplaySkill('dawnstrike', 'Q');
  e._heroSkillStep();
  assert.deepEqual(foes.map(p => p.hp), hp);
  assert.equal(e.heroSkillPending.filter(entry => entry.kind === 'piercing-line').length, 1);
  assert.equal(b.heroSkillReadyAt.Q, 8);
  const frame = snapshotToFrame(e.snapshot());
  e.t = rule.travel; e._heroSkillStep();
  const raw = rule.damage + b.power * rule.powerRatio;
  for (let i = 0; i < 3; i++) assert.ok(Math.abs((hp[i] - foes[i].hp) - raw * rule.falloff ** i) < 1e-8);
  assert.equal(foes[3].hp, hp[3]);
  const source = createReplaySource({ frames: [frame] });
  const view = adaptEffects({ ts: frame.t, fx: source.getState().snapshot.fx }, frame.t + 0.2,
    { roster: { b1: { heroId: 'dawnstrike' } } });
  assert.ok(view.some(f => f.skillId === 'dawnstrike:Q' && adaptNamedHeroSkill(f)?.provenance === 'authority'));
});
ck('piercing arrow checks occupants at impact, allowing exit and entry before contact', () => {
  const e = new LogicEngine(7);
  const rule = compileGameplaySkill('dawnstrike', 'Q');
  e.configureHeroSkills({ players: { b1: { Q: rule } } });
  const b = e.players.find(p => p.id === 'b1');
  const first = e.players.find(p => p.id === 'r1'), entrant = e.players.find(p => p.id === 'r2');
  b.pos = { x: 100, y: 100 }; first.pos = { x: 104, y: 100 };
  entrant.pos = { x: 106, y: 103 };
  const firstHp = first.hp, entrantHp = entrant.hp;
  e._heroSkillStep();
  first.pos = { x: 104, y: 103 }; entrant.pos = { x: 106, y: 100 };
  e.t = rule.travel; e._heroSkillStep();
  assert.equal(first.hp, firstHp);
  assert.ok(entrant.hp < entrantHp);
});
ck('piercing arrow path and falloff mirror across sides', () => {
  const cast = side => {
    const e = new LogicEngine(7), seat = side === 'blue' ? 'b1' : 'r1';
    const foeId = side === 'blue' ? 'r1' : 'b1', sign = side === 'blue' ? -1 : 1;
    const rule = compileGameplaySkill('dawnstrike', 'Q');
    e.configureHeroSkills({ players: { [seat]: { Q: rule } } });
    const p = e.players.find(q => q.id === seat), foe = e.players.find(q => q.id === foeId);
    p.pos = { x: WORLD_BOUNDS.centerX + sign * 65, y: WORLD_BOUNDS.centerY + sign * 65 };
    foe.pos = { x: p.pos.x - sign * 4, y: p.pos.y };
    const hp = foe.hp; e._heroSkillStep();
    const arrow = e.heroSkillPending.find(entry => entry.kind === 'piercing-line');
    e.t = rule.travel; e._heroSkillStep();
    return { arrow, loss: hp - foe.hp };
  };
  const blue = cast('blue'), red = cast('red');
  for (const field of ['x', 'y']) {
    assert.ok(Math.abs(blue.arrow.end[field] + red.arrow.end[field]
      - 2 * WORLD_BOUNDS[`center${field.toUpperCase()}`]) < 1e-6);
  }
  assert.equal(blue.loss, red.loss);
});
ck('one hero casts at most one authored slot per tick, retaining the next ready slot', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: {
    W: compileGameplaySkill('cinderfist', 'W'), E: compileGameplaySkill('cinderfist', 'E'),
  } } });
  const b = e.players.find(p => p.id === 'b1');
  const foe = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; foe.pos = { x: 104, y: 100 };
  b.hp = b.maxHp * 0.5;
  e._heroSkillStep();
  assert.equal(e.heroSkillPending.length, 1);
  assert.equal(e.heroSkillPending[0].kind, 'shield-burst');
  assert.equal(b.heroSkillReadyAt.W, 11);
  assert.equal(b.heroSkillReadyAt.E, undefined);
  e.t = 0.1; e._heroSkillStep();
  assert.ok(e.heroSkillPending.some(entry => entry.kind === 'dash-wall'));
  assert.equal(b.heroSkillReadyAt.E, 14.1);
});
ck('fire dash crosses the enemy and its two-second wall hits occupants, not escaped targets', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('cinderfist', 'E') } } });
  const b = e.players.find(p => p.id === 'b1');
  const near = e.players.find(p => p.id === 'r1');
  const entrant = e.players.find(p => p.id === 'r2');
  const off = e.players.find(p => p.id === 'r3');
  b.pos = { x: 100, y: 100 }; near.pos = { x: 104, y: 100 };
  entrant.pos = { x: 104, y: 104 }; off.pos = { x: 104, y: 107 };
  const nearHp = near.hp, entrantHp = entrant.hp, offHp = off.hp;
  e._heroSkillStep();
  assert.ok(b.pos.x > near.pos.x);
  assert.equal(near.hp, nearHp);
  assert.equal(b.heroSkillReadyAt.E, 14);
  const wall = e.heroSkillPending.find(entry => entry.kind === 'dash-wall');
  assert.ok(wall && wall.end.x === b.pos.x && wall.until === 2);
  assert.ok(e.fx.some(f => f.skillId === 'cinderfist:E' && f.targetId === 'r1'));
  const frame = snapshotToFrame(e.snapshot());
  e.t = 0.5; e._heroSkillStep();
  assert.ok(near.hp < nearHp);
  assert.equal(entrant.hp, entrantHp);
  assert.equal(off.hp, offHp);
  near.pos = { x: 104, y: 104 }; entrant.pos = { x: 105, y: 100 };
  e.t = 1; e._heroSkillStep();
  assert.ok(entrant.hp < entrantHp);
  const exitedHp = near.hp;
  e.t = 1.5; e._heroSkillStep();
  assert.equal(near.hp, exitedHp);
  e.t = 2; e._heroSkillStep();
  const finalHp = entrant.hp;
  e.t = 2.5; e._heroSkillStep();
  assert.equal(entrant.hp, finalHp);
  assert.equal(e.heroSkillPending.filter(entry => entry.kind === 'dash-wall').length, 0);
  const source = createReplaySource({ frames: [frame] });
  const view = adaptEffects({ ts: frame.t, fx: source.getState().snapshot.fx }, frame.t + 0.2,
    { roster: { b1: { heroId: 'cinderfist' } } });
  assert.ok(view.some(f => f.skillId === 'cinderfist:E' && adaptNamedHeroSkill(f)?.provenance === 'authority'));
});
ck('expired fire wall cannot deal delayed damage after a skipped time interval', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('cinderfist', 'E') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 104, y: 100 };
  e._heroSkillStep();
  const hp = r.hp;
  e.t = 3; e._heroSkillStep();
  assert.equal(r.hp, hp);
  assert.equal(e.heroSkillPending.filter(entry => entry.kind === 'dash-wall').length, 0);
});
ck('root prevents fire dash without consuming its cooldown or leaving a wall', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('cinderfist', 'E') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 104, y: 100 };
  b.heroSkillRootUntil = 2;
  e._heroSkillStep();
  assert.equal(b.pos.x, 100);
  assert.equal(b.heroSkillReadyAt.E, undefined);
  assert.equal(e.heroSkillPending.length, 0);
  e.t = 2; e._heroSkillStep();
  assert.ok(b.pos.x > 104);
  assert.equal(b.heroSkillReadyAt.E, 16);
});
ck('Items ON fire wall ticks use magic mitigation and remain same-seed deterministic', () => {
  const setup = () => {
    const e = new LogicEngine(31);
    e.configureItems({ players: { b1: { arch: '戰士' }, r1: { arch: '坦克' } } });
    e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('cinderfist', 'E') } } });
    const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
    b.pos = { x: 100, y: 100 }; r.pos = { x: 104, y: 100 };
    const defender = e.items.stateOf('r1');
    defender.cs = { ...defender.cs, mr: 100, effects: [] };
    defender.magicShield = { amount: 10, until: 5 };
    return { e, b, r, defender };
  };
  const a = setup(), b = setup(), hp = a.r.hp;
  for (const run of [a, b]) { run.e._heroSkillStep(); run.e.t = 0.5; run.e._heroSkillStep(); }
  const raw = 18 + a.b.power * 0.16;
  assert.ok(a.r.hp < hp && hp - a.r.hp < raw);
  assert.equal(a.defender.magicShield.amount, 0);
  assert.deepEqual(a.e.snapshot(), b.e.snapshot());
});
ck('fire dash and wall endpoints mirror across the canonical map center', () => {
  const makeSide = (side) => {
    const e = new LogicEngine(7), seat = side === 'blue' ? 'b1' : 'r1';
    const foeId = side === 'blue' ? 'r1' : 'b1';
    e.configureHeroSkills({ players: { [seat]: { E: compileGameplaySkill('cinderfist', 'E') } } });
    const p = e.players.find(q => q.id === seat), foe = e.players.find(q => q.id === foeId);
    const sign = side === 'blue' ? -1 : 1;
    p.pos = { x: WORLD_BOUNDS.centerX + sign * 65, y: WORLD_BOUNDS.centerY + sign * 65 };
    foe.pos = { x: p.pos.x - sign * 4, y: p.pos.y };
    e._heroSkillStep();
    const wall = e.heroSkillPending.find(entry => entry.kind === 'dash-wall');
    e.t = 0.5; e._heroSkillStep();
    return { p, foe, wall };
  };
  const blue = makeSide('blue'), red = makeSide('red');
  for (const field of ['x', 'y']) {
    assert.ok(Math.abs(blue.p.pos[field] + red.p.pos[field] - 2 * WORLD_BOUNDS[`center${field.toUpperCase()}`]) < 1e-6);
    assert.ok(Math.abs(blue.wall.end[field] + red.wall.end[field] - 2 * WORLD_BOUNDS[`center${field.toUpperCase()}`]) < 1e-6);
  }
  assert.equal(blue.foe.maxHp - blue.foe.hp, red.foe.maxHp - red.foe.hp);
});

const setup = () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills(config);
  e.players.find(p => p.id === 'b1').pos = { x: 100, y: 100 };
  e.players.find(p => p.id === 'r1').pos = { x: 104, y: 100 };
  return e;
};
ck('equal opposing Q casts resolve in same frame with damage and cooldown', () => {
  const e = setup(), b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  const bHp = b.hp, rHp = r.hp;
  e._heroSkillStep();
  assert.equal(e.fx.filter(f => f.skillId === 'ironclad:Q').length, 2);
  assert.equal(bHp - b.hp, rHp - r.hp);
  assert.ok(b.hp < bHp && r.hp < rHp);
  assert.equal(b.heroSkillReadyAt.Q, 8);
  assert.equal(r.heroSkillReadyAt.Q, 8);
  assert.equal(e.snapshot().players.find(p => p.id === 'b1').heroSkills.Q.cd, 8);
  // Equal opposing dash/knockback vectors cancel; neither side gets a free displacement.
  assert.equal(b.pos.x, 100);
  assert.equal(r.pos.x, 104);
  e._heroSkillStep();
  assert.equal(e.fx.filter(f => f.skillId === 'ironclad:Q').length, 2);
  assert.ok(e.fx.filter(f => f.skillId).length >= 2);
});
ck('one-sided dash and knockback move both actors in the authored direction', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills(toEngineHeroSkills({ b1: { heroId: 'ironclad' } }));
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 104, y: 100 };
  e._heroSkillStep();
  assert.ok(b.pos.x > 100 && r.pos.x > 104);
  assert.equal(e.fx.filter(f => f.skillId).length, 1);
});
ck('authoritative Q event reaches adapter and named VFX, without preview provenance', () => {
  const e = setup(); e._heroSkillStep();
  const fx = adaptEffects(e.snapshot(), e.t + 0.2, { roster });
  const named = fx.filter(f => f.skillId === 'ironclad:Q');
  assert.equal(named.length, 2);
  for (const f of named) {
    const visual = adaptNamedHeroSkill(f);
    assert.equal(visual?.provenance, 'authority');
    assert.equal(visual?.visual?.motif, 'charge-stomp');
    assert.equal(visual?.skillId, f.skillId);
  }
});
ck('saved Replay tuple retains Q identity and replays without running the engine', () => {
  const e = setup(); e._heroSkillStep();
  const frame = snapshotToFrame(e.snapshot());
  const row = frame.fx.find(x => x[8] === 'hero:Q');
  assert.equal(row?.length, 12); // No wire-format change.
  const source = createReplaySource({ frames: [frame] });
  const replayFx = source.getState().snapshot.fx;
  const view = adaptEffects({ ts: frame.t, fx: replayFx }, frame.t + 0.2, { roster });
  assert.equal(view.filter(f => adaptNamedHeroSkill(f)?.provenance === 'authority').length, 2);
  assert.equal(view.find(f => f.skillId)?.presentation?.isActualSkillCast, true);
});
ck('ice projectile resolves after travel and misses an escaped target', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { Q: compileGameplaySkill('bingshuang', 'Q') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 105, y: 100 };
  const hp = r.hp;
  e._heroSkillStep();
  assert.equal(r.hp, hp);
  assert.equal(e.heroSkillPending.length, 1);
  assert.ok(Math.abs(e.fx.find(f => f.skillId === 'bingshuang:Q').life * 0.69 - 0.5) < 0.02);
  assert.equal(snapshotToFrame(e.snapshot()).fx.find(row => row[8] === 'hero:Q')?.[7], 0.72);
  e.t = 0.5; e._heroSkillStep();
  assert.ok(r.hp < hp && r.heroSkillSlowUntil > e.t);
  assert.ok(e.snapshot().players.find(p => p.id === 'r1').statusEffects.some(s => s.id === 'hero-slow'));
  const miss = new LogicEngine(7);
  miss.configureHeroSkills({ players: { b1: { Q: compileGameplaySkill('bingshuang', 'Q') } } });
  const caster = miss.players.find(p => p.id === 'b1'), target = miss.players.find(p => p.id === 'r1');
  caster.pos = { x: 100, y: 100 }; target.pos = { x: 105, y: 100 };
  const before = target.hp;
  miss._heroSkillStep(); target.pos = { x: 114, y: 100 };
  miss.t = 0.5; miss._heroSkillStep();
  assert.equal(target.hp, before);
});
ck('ice crystal locks cast point, bursts after 0.7s and hits only occupants at impact', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('bingshuang', 'E') } } });
  const b = e.players.find(p => p.id === 'b1');
  const [r1, r2, r3] = ['r1', 'r2', 'r3'].map(id => e.players.find(p => p.id === id));
  b.pos = { x: 100, y: 100 }; r1.pos = { x: 105, y: 100 };
  r2.pos = { x: 106, y: 100 }; r3.pos = { x: 111, y: 100 };
  const hp = [r1.hp, r2.hp, r3.hp];
  e._heroSkillStep();
  assert.deepEqual([r1.hp, r2.hp, r3.hp], hp);
  assert.equal(e.heroSkillPending[0].at, 0.7);
  assert.deepEqual(e.heroSkillPending[0].target, { x: 105, y: 100 });
  assert.ok(e.fx.some(f => f.skillId === 'bingshuang:E' && f.ability === 'hero:E'));
  r1.pos = { x: 112, y: 100 }; r3.pos = { x: 105, y: 101 };
  e.t = 0.5; e._heroSkillStep();
  assert.deepEqual([r1.hp, r2.hp, r3.hp], hp);
  e.t = 0.7; e._heroSkillStep();
  assert.equal(r1.hp, hp[0]);
  assert.ok(r2.hp < hp[1] && r3.hp < hp[2]);
  assert.equal(e.heroSkillPending.length, 0);
  const frame = snapshotToFrame(e.snapshot());
  const source = createReplaySource({ frames: [frame] });
  const view = adaptEffects({ ts: frame.t, fx: source.getState().snapshot.fx }, frame.t + 0.1,
    { roster: { b1: { heroId: 'bingshuang' } } });
  assert.ok(view.some(f => f.skillId === 'bingshuang:E' && adaptNamedHeroSkill(f)?.provenance === 'authority'));
});
ck('short authored projectile visual does not shorten legacy skill FX', () => {
  const e = new LogicEngine(7);
  e.pushFx({ type: 'line', pos: { x: 100, y: 100 }, feedback: 'skill', life: 0.72 });
  assert.equal(e.fx[0].life, 1.6);
});
ck('earth line strikes aligned foes, not off-axis foes, and blocks attack during knockup', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills(toEngineHeroSkills({ b1: { heroId: 'dadi' } }));
  const b = e.players.find(p => p.id === 'b1'), r1 = e.players.find(p => p.id === 'r1');
  const r2 = e.players.find(p => p.id === 'r2');
  b.pos = { x: 100, y: 100 }; r1.pos = { x: 105, y: 100 }; r2.pos = { x: 106, y: 101 };
  const r3 = e.players.find(p => p.id === 'r3'); r3.pos = { x: 105, y: 104 };
  const hp = [r1.hp, r2.hp, r3.hp];
  e._heroSkillStep();
  assert.ok(r1.hp < hp[0] && r2.hp < hp[1]);
  assert.equal(r3.hp, hp[2]);
  assert.equal(r1.heroSkillControlKind, 'knockup');
  assert.ok(e.snapshot().players.find(p => p.id === 'r1').statusEffects.some(s => s.id === 'knockup'));
  const pos = { ...r1.pos }, ticks = r1.atkTicks ?? 0;
  e.tick(0.5);
  assert.deepEqual(r1.pos, pos);
  assert.equal(r1.atkTicks ?? 0, ticks);
});
ck('earth grasp roots movement and blink, while basic attacks remain legal', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('dadi', 'E') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 105, y: 100 };
  const hp = r.hp, pos = { ...r.pos }, ticks = r.atkTicks ?? 0;
  e._heroSkillStep();
  assert.ok(r.hp < hp);
  assert.equal(r.heroSkillRootUntil, 2);
  assert.equal(b.heroSkillReadyAt.E, 14);
  assert.ok(e.snapshot().players.find(p => p.id === 'r1').statusEffects.some(s => s.id === 'root'));
  const frame = snapshotToFrame(e.snapshot());
  assert.ok(frame.fx.some(row => row[8] === 'hero:E'));
  const source = createReplaySource({ frames: [frame] });
  const view = adaptEffects({ ts: frame.t, fx: source.getState().snapshot.fx }, frame.t + 0.2,
    { roster: { b1: { heroId: 'dadi' } } });
  assert.ok(view.some(f => f.skillId === 'dadi:E' && adaptNamedHeroSkill(f)?.provenance === 'authority'));
  e.tick(0.5);
  assert.deepEqual(r.pos, pos);
  assert.ok((r.atkTicks ?? 0) > ticks);
});
ck('earth W shields the lowest-health reachable ally and records W authority', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { W: compileGameplaySkill('dadi', 'W') } } });
  const b = e.players.find(p => p.id === 'b1');
  const ally = e.players.find(p => p.id === 'b2');
  const other = e.players.find(p => p.id === 'b3');
  b.pos = { x: 100, y: 100 }; ally.pos = { x: 104, y: 100 };
  other.pos = { x: 105, y: 100 };
  ally.hp = ally.maxHp * 0.35; other.hp = other.maxHp * 0.6;
  e._heroSkillStep();
  assert.equal(ally.shield, 38 * 3);
  assert.equal(other.shield, 0);
  assert.equal(b.shield, 0);
  assert.equal(ally.shieldUntil, 3);
  assert.equal(b.heroSkillReadyAt.W, 11);
  assert.ok(e.snapshot().players.find(p => p.id === 'b2').statusEffects.some(s => s.id === 'shield'));
  assert.ok(e.fx.some(f => f.skillId === 'dadi:W' && f.sourceId === 'b1' && f.targetId === 'b2'));
  const frame = snapshotToFrame(e.snapshot());
  const source = createReplaySource({ frames: [frame] });
  const view = adaptEffects({ ts: frame.t, fx: source.getState().snapshot.fx }, frame.t + 0.2,
    { roster: { b1: { heroId: 'dadi' } } });
  assert.ok(view.some(f => f.skillId === 'dadi:W' && adaptNamedHeroSkill(f)?.provenance === 'authority'));
  const hp = ally.hp; e._damageHero(ally, 50); assert.equal(ally.hp, hp);
});
ck('earth W derives self armor and Item armor/aura from the canonical caster', () => {
  const e = new LogicEngine(7);
  e.configureItems({ players: { b1: { arch: '坦克' }, b2: { arch: '戰士' } } });
  e.configureHeroSkills({ players: { b1: { W: compileGameplaySkill('dadi', 'W') } } });
  const b = e.players.find(p => p.id === 'b1');
  const ally = e.players.find(p => p.id === 'b2');
  b.pos = { x: 100, y: 100 }; ally.pos = { x: 104, y: 100 };
  ally.hp = ally.maxHp * 0.5; b.mlv = 2;
  const casterItems = e.items.stateOf('b1');
  casterItems.cs = { ...casterItems.cs, armor: 50, healShieldPower: 0.2 };
  casterItems.aura = { ...casterItems.aura, armor: 8 };
  e._heroSkillStep();
  assert.equal(ally.shield, (38 + 4.5 + 50 + 8) * 3 * 1.2);
  assert.equal(e.items.stateOf('b2').cs.armor >= 0, true);
});
ck('earth W uses self when wounded allies are out of range and does not spam at full health', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { W: compileGameplaySkill('dadi', 'W') } } });
  const b = e.players.find(p => p.id === 'b1'), ally = e.players.find(p => p.id === 'b2');
  b.pos = { x: 100, y: 100 }; ally.pos = { x: 120, y: 100 };
  ally.hp = ally.maxHp * 0.2;
  e._heroSkillStep();
  assert.equal(b.heroSkillReadyAt.W, undefined);
  b.hp = b.maxHp * 0.6;
  e._heroSkillStep();
  assert.equal(b.shield, 38 * 3);
  assert.equal(ally.shield, 0);
  assert.ok(e.fx.some(f => f.skillId === 'dadi:W' && f.sourceId === 'b1' && f.targetId === 'b1'));
});
ck('root prevents an otherwise eligible v3 escape Flash', () => {
  const setupRoot = (rooted) => {
    const e = new LogicEngine(7, null, { rules: 'v3' });
    e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('dadi', 'E') } } });
    const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
    b.pos = { x: 100, y: 100 }; r.pos = { x: 102, y: 100 };
    r.hp = r.maxHp * 0.1; r.retreating = true;
    r.heroSkillRootUntil = rooted ? 2 : 0;
    return { e, r };
  };
  const rooted = setupRoot(true), control = setupRoot(false);
  rooted.e.tick(0.5); control.e.tick(0.5);
  assert.equal(rooted.r.sp.f.uses, 0);
  assert.equal(control.r.sp.f.uses, 1);
});
ck('root blocks dash skills without consuming their cooldown', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { Q: compileGameplaySkill('ironclad', 'Q') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 104, y: 100 };
  b.heroSkillRootUntil = 2;
  e._heroSkillStep();
  assert.equal(b.pos.x, 100);
  assert.equal(b.heroSkillReadyAt.Q, undefined);
  e.t = 2; e._heroSkillStep();
  assert.ok(b.pos.x > 100);
  assert.equal(b.heroSkillReadyAt.Q, 10);
});
ck('authored damage types use Item resist and magic shield when Items are ON', () => {
  assert.equal(compileGameplaySkill('ironclad', 'Q').damageType, 'physical');
  assert.equal(compileGameplaySkill('bingshuang', 'Q').damageType, 'magic');
  assert.equal(compileGameplaySkill('dadi', 'E').damageType, 'magic');
  const e = new LogicEngine(7);
  e.configureItems({ players: { b1: { arch: '法師' }, r1: { arch: '坦克' } } });
  e.configureHeroSkills({ players: { b1: { E: compileGameplaySkill('dadi', 'E') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 105, y: 100 };
  const defender = e.items.stateOf('r1');
  defender.cs = { ...defender.cs, armor: 0, mr: 100, effects: [] };
  defender.magicShield = { amount: 20, until: 5 };
  const raw = 85 + b.power * 0.6, hp = r.hp;
  const taken = mitigate({ phys: 0, magic: raw, attackerCs: e.items.stateOf('b1').cs,
    defenderCs: defender.cs, aura: defender.aura }).magicTaken;
  e._heroSkillStep();
  assert.ok(taken > 20);
  assert.ok(Math.abs((hp - r.hp) - (taken - 20)) < 1e-7);
  assert.equal(defender.magicShield.amount, 0);
  assert.equal(r.heroSkillRootUntil, 2);
});
ck('Item ability true-damage channel bypasses resists and magic-only shield', () => {
  const e = new LogicEngine(7);
  e.configureItems({ players: { b1: { arch: '法師' }, r1: { arch: '坦克' } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  const defender = e.items.stateOf('r1');
  defender.cs = { ...defender.cs, armor: 400, mr: 400, effects: [] };
  defender.magicShield = { amount: 30, until: 5 };
  const hit = e.items.resolveAbilityHit(b, r, 90, 'true');
  assert.equal(hit.total, 90);
  assert.equal(hit.trueTaken, 90);
  const hp = r.hp;
  e.items.applyDamage(r, hit, e.t);
  assert.equal(hp - r.hp, 90);
  assert.equal(defender.magicShield.amount, 30);
});
ck('fire shield absorbs damage and bursts only after authored delay', () => {
  const e = new LogicEngine(7);
  e.configureHeroSkills({ players: { b1: { W: compileGameplaySkill('cinderfist', 'W') } } });
  const b = e.players.find(p => p.id === 'b1'), r = e.players.find(p => p.id === 'r1');
  b.pos = { x: 100, y: 100 }; r.pos = { x: 104, y: 100 };
  b.hp = b.maxHp * 0.6;
  const hp = r.hp;
  e._heroSkillStep();
  assert.ok(b.shield > 0);
  e._damageHero(b, b.shield / 2);
  assert.equal(b.hp, b.maxHp * 0.6);
  assert.equal(r.hp, hp);
  r.pos = { x: 102, y: 100 };
  e.t = 3; e._heroSkillStep();
  assert.ok(r.hp < hp); // Burst checks the current location, not the old target point.
  const frame = snapshotToFrame(e.snapshot());
  const source = createReplaySource({ frames: [frame] });
  const replayFx = source.getState().snapshot.fx;
  const view = adaptEffects({ ts: frame.t, fx: replayFx }, frame.t + 0.2,
    { roster: { b1: { heroId: 'cinderfist' } } });
  assert.ok(view.some(f => f.skillId === 'cinderfist:W' && adaptNamedHeroSkill(f)?.provenance === 'authority'));
});
ck('same seed and roster produce identical opt-in snapshots; opt-out unchanged', () => {
  const a = new LogicEngine(73), b = new LogicEngine(73), legacy = new LogicEngine(73);
  a.configureHeroSkills(config); b.configureHeroSkills(config);
  for (let i = 0; i < 30; i++) { a.tick(0.5); b.tick(0.5); legacy.tick(0.5); }
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal('heroSkills' in legacy.snapshot(), false);
});
ck('mixed authored roster remains deterministic through live ticks and real casts', () => {
  const mixed = toEngineHeroSkills({ b1: { heroId: 'ironclad' }, b3: { heroId: 'bingshuang' },
    b5: { heroId: 'dadi' }, r1: { heroId: 'cinderfist' } });
  const a = new LogicEngine(73), b = new LogicEngine(73);
  a.configureHeroSkills(mixed); b.configureHeroSkills(mixed);
  let casts = 0;
  for (let i = 0; i < 420; i++) {
    a.tick(0.5); b.tick(0.5);
    casts += a.fx.filter(f => f.skillId && f.at === a.t).length;
    assert.deepEqual(a.snapshot(), b.snapshot());
  }
  assert.ok(casts > 0);
});
ck('Items ON plus authored skills remain same-seed deterministic in live battle', () => {
  const roster = { b1: { heroId: 'ironclad' }, b3: { heroId: 'bingshuang' },
    r1: { heroId: 'cinderfist' }, r5: { heroId: 'dadi' } };
  const items = { players: { b1: { arch: '坦克' }, b3: { arch: '法師' },
    r1: { arch: '戰士' }, r5: { arch: '坦克' } } };
  const a = new LogicEngine(73), b = new LogicEngine(73);
  for (const e of [a, b]) {
    assert.equal(e.configureItems(items), true);
    e.configureHeroSkills(toEngineHeroSkills(roster));
  }
  let casts = 0;
  for (let i = 0; i < 420; i++) {
    a.tick(0.5); b.tick(0.5);
    casts += a.fx.filter(f => f.skillId && f.at === a.t).length;
    assert.deepEqual(a.snapshot(), b.snapshot());
  }
  assert.ok(casts > 0);
});
console.log(`Hero skills gameplay slice ${pass}/${pass} PASS`);
