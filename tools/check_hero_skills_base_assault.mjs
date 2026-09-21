import assert from 'node:assert/strict';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { LogicEngine } from '../src/LogicEngine.js';
import { toEngineHeroSkills } from '../src/battle/moba/skills/heroSkillGameplay.js';

// Focused regression for the deterministic tail discovered by the formal
// release gate: after both teams clear lane structures, a nexus must remain
// reachable by the minion/base-entry contract.
const ids = CHAMPIONS_100.slice(95, 100).map((hero) => hero.id);
const roster = Object.fromEntries([
  ...ids.map((heroId, i) => [`b${i + 1}`, { heroId }]),
  ...ids.map((heroId, i) => [`r${i + 1}`, { heroId }]),
]);
const engine = new LogicEngine(777, null, { rules: 'v3' });
engine.configureHeroSkills(toEngineHeroSkills(roster));

let guardsClearedAt = null;
let coreAtGuardClear = null;
let firstCoreProgressAt = null;
let firstCoreDamageAt = null;
for (let tick = 0; tick < 6000 && !engine.over; tick += 1) {
  engine.tick(0.5);
  if (firstCoreDamageAt == null && (
    engine.towers.blue_nexus.hp < 7200 || engine.towers.red_nexus.hp < 7200
  )) firstCoreDamageAt = engine.t;
  const guardsAlive = Object.values(engine.towers).some((tower) => tower.lane === 'nexus_guard' && tower.hp > 0);
  if (guardsClearedAt == null && !guardsAlive) {
    guardsClearedAt = engine.t;
    coreAtGuardClear = { blue: engine.towers.blue_nexus.hp, red: engine.towers.red_nexus.hp };
  }
  if (guardsClearedAt != null && firstCoreProgressAt == null && (
    engine.towers.blue_nexus.hp !== coreAtGuardClear.blue ||
    engine.towers.red_nexus.hp !== coreAtGuardClear.red
  )) firstCoreProgressAt = engine.t;
}

assert.ok(engine.over, 'focused base-assault fixture must finish naturally');
assert.ok(firstCoreDamageAt != null, 'core must receive real structure progression');
// Healthy long matches are valid under the formal Fairness contract. This focused
// invariant guards eventual natural core progression after guard clearance without
// introducing a second fixed post-guard timeout policy.
if (guardsClearedAt != null) assert.ok(
  firstCoreProgressAt != null && firstCoreProgressAt >= guardsClearedAt,
  `nexus progression must follow guard clearance (guardsClearedAt=${guardsClearedAt}, firstCoreProgressAt=${firstCoreProgressAt}, t=${engine.t})`,
);
console.log(JSON.stringify({
  seed: 777, heroes: ids, guardsClearedAt, coreAtGuardClear, firstCoreProgressAt, firstCoreDamageAt,
  final: { t: engine.t, over: engine.over, winner: engine.winner,
    blueNexus: engine.towers.blue_nexus.hp, redNexus: engine.towers.red_nexus.hp },
  coreProgressedAfterGuards: firstCoreProgressAt != null,
}));
console.log('Hero Skills base-assault invariant: PASS');
