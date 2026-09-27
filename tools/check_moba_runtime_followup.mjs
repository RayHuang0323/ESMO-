#!/usr/bin/env node
import assert from "node:assert/strict";
import { LogicEngine } from "../src/LogicEngine.js";
import { rulesFor } from "../src/battle/moba/matchProgression.js";
import { adaptObjectives } from "../src/battle/moba/map/mobaRuntimeMapAdapter.js";
import { computeFocus, computeSpectatorFocus } from "../src/battle/battleFocus.js";
import { CHAMPIONS_100 } from "../src/data/heroDatabase.js";
import { toEngineHeroSkills } from "../src/battle/moba/skills/heroSkillGameplay.js";

const roster = Object.fromEntries(["b", "r"].flatMap((side) =>
  CHAMPIONS_100.slice(0, 5).map((h, i) => [`${side}${i + 1}`, { heroId: h.id }])));
const make = (seed, skills) => {
  const e = new LogicEngine(seed, null, { rules: "v3" });
  if (skills) e.configureHeroSkills(toEngineHeroSkills(roster));
  return e;
};
const check = (name, fn) => { fn(); console.log(`PASS ${name}`); };

check("100 heroes / 400 authored QWER gameplay and presentation", () => {
  assert.equal(CHAMPIONS_100.length, 100);
  for (const h of CHAMPIONS_100) for (const slot of "QWER") {
    assert.ok(h.skills[slot].gameplay, `${h.id}:${slot} gameplay`);
    assert.ok(h.skills[slot].presentation, `${h.id}:${slot} presentation`);
  }
});

check("director prefers live melee and keeps kill event position", () => {
  const players = [
    { id: "b1", side: "blue", pos: { x: 15, y: 15 }, hp: .4 },
    { id: "r1", side: "red", pos: { x: 16, y: 15 }, hp: .7 },
    { id: "b2", side: "blue", pos: { x: 80, y: 80 }, hp: 1 },
    { id: "r2", side: "red", pos: { x: 86, y: 80 }, hp: 1 },
  ];
  const snap = { ts: 100, players, fx: [], towers: {} };
  const focus = computeFocus(snap);
  assert.equal(focus.key, "b1:r1");
  assert.equal(focus.x, 15.5);
  const event = computeSpectatorFocus(snap, [{ type: "KILL", id: "k1", t: 99,
    pos: { x: 16, y: 15 } }]);
  assert.equal(event.kind, "event");
  assert.equal(event.x, 16);
});

check("Blue Buff members have independent authoritative HP through adapter", () => {
  const e = make(1, true);
  const camp = e.neutrals.camps.find((c) => c.presentationKey === "blueBuff");
  assert.ok(camp);
  camp.alive = true; camp.spawnedOnce = true;
  for (const m of camp.members) { m.alive = true; m.spawnedOnce = true; m.hp = m.maxHp; }
  camp.members[1].hp *= .375;
  const snap = e.snapshot();
  const source = snap.objectives.find((o) => o.id === camp.id);
  const view = adaptObjectives(snap).find((o) => o.id === camp.id);
  assert.equal(source.members.length, 3);
  assert.equal(new Set(source.members.map((m) => m.id)).size, 3);
  assert.equal(view.members[0].hpRatio, 1);
  assert.equal(view.members[1].hpRatio, .375);
  assert.equal(view.members[2].hpRatio, 1);
});

check("skill-off trajectory does not depend on new gates", () => {
  const a = make(11, false), b = make(11, false);
  b.rules = { ...rulesFor("v3"), phaseScalingV1: false, nonHeroSkillV1: false };
  for (let i = 0; i < 300; i++) {
    a.tick(.5); b.tick(.5);
    assert.deepEqual(a.snapshot(), b.snapshot(), `tick ${i}`);
  }
});

check("phase growth is symmetric, capped, and separate from Baron reward", () => {
  const e = make(3, true);
  const early = e._spawnMinion("blue", "mid", 0, 0, "melee");
  e.t = 1800;
  const blue = e._spawnMinion("blue", "mid", 0, 0, "melee");
  const red = e._spawnMinion("red", "mid", 0, 0, "melee");
  assert.equal(blue.hp, red.hp);
  assert.equal(blue.dmg, red.dmg);
  assert.equal(blue.hp / early.hp, e.rules.minionPhaseHpMax);
  assert.equal(blue.dmg / early.dmg, e.rules.minionPhaseDmgMax);
  assert.equal(e.fsm3.blue.baronBuffUntil, 0);
  const camp = e.neutrals.camps[0];
  const earlyCampHp = camp.maxHp;
  for (const member of camp.members) { member.alive = false; member.respawnAt = e.t; }
  e._updateNeutralsV3([], .5);
  assert.equal(camp.maxHp / earlyCampHp, e.rules.neutralPhaseHpMax);
  assert.equal(camp.hp, camp.maxHp);
  assert.equal(camp.members.reduce((sum, member) => sum + member.maxHp, 0), camp.maxHp);
  const off = make(3, false); off.t = 1800;
  assert.equal(off._spawnMinion("blue", "mid", 0, 0, "melee").hp, early.hp);
});

check("minion/camp control, boss hard-CC immunity, authored impact", () => {
  const e = make(4, true), p = e.players[0];
  const m = e._spawnMinion("red", "mid", 0, 0, "melee");
  e.lanes.mid.rm.push(m);
  const target = e._minionPos("mid", m);
  const rule = { mechanic: "area-control", radius: 2, damage: 20,
    powerRatio: 0, controlDuration: 1.5, skillId: "test:Q" };
  e._queueNonHeroAreaImpact({ kind: "area-control", p, rule, target });
  assert.equal(e._laneSkillHits.length, 1);
  e._applyLaneSkillHits();
  assert.ok(m.hp < m.maxHp);
  assert.ok(m.heroSkillStunUntil > e.t);
  assert.ok(e.fx.some((f) => f.targetId === m.id && f.skillId === "test:Q"));
  e._queueNonHeroAreaImpact({ kind: "line", p,
    from: { x: target.x - 3, y: target.y }, end: { x: target.x + 3, y: target.y },
    rule: { mechanic: "line", width: 1, damage: 10, powerRatio: 0,
      control: "stun", controlDuration: .75, skillId: "test:W" } });
  assert.ok(e._laneSkillHits.some((h) => h.memberId === m.id && h.rule.skillId === "test:W"));
  e._applyLaneSkillHits();
  assert.ok(e.fx.some((f) => f.targetId === m.id && f.skillId === "test:W"));
  const camp = e.neutrals.camps[0].members[0];
  assert.equal(e._nonHeroSkillEffect(camp, rule, "camp", p.id), "stun");
  assert.equal(e._nonHeroSkillEffect(e.neutrals.baron, rule, "boss", p.id), null);
  assert.equal(e.neutrals.baron.heroSkillStunUntil, undefined);
});

check("skill-on same-seed remains deterministic across snapshots", () => {
  for (const seed of [1, 715, 1000]) {
    const a = make(seed, true), b = make(seed, true);
    for (let step = 0; step < 1200 && (!a.over || !b.over); step++) {
      a.tick(.5); b.tick(.5);
      if (step % 20 === 0 || a.over || b.over) assert.deepEqual(a.snapshot(), b.snapshot(), `seed ${seed} step ${step}`);
    }
  }
});

console.log("MOBA runtime follow-up: PASS");
