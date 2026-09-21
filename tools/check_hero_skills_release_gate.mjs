import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { LogicEngine } from '../src/LogicEngine.js';
import { toEngineHeroSkills } from '../src/battle/moba/skills/heroSkillGameplay.js';

const SLOTS = ['Q', 'W', 'E', 'R'];
const GROUP_SIZE = 5;
const SEEDS = [1, 42, 99, 777, 2024];
const SIDES = ['blue', 'red'];
const LANES = ['top', 'mid', 'bot'];
const DT = 0.5;
// Simulation safety cap only. It is classified below as cap-hit/structural
// pathology; it is not a duration acceptance threshold.
const MAX_TICKS = 12000;
const PROGRESS_BUCKET_HP = 500;

const rosterFor = (group) => {
  const ids = CHAMPIONS_100.slice(group * GROUP_SIZE, (group + 1) * GROUP_SIZE).map((h) => h.id);
  return Object.fromEntries([
    ...ids.map((heroId, i) => [`b${i + 1}`, { heroId }]),
    ...ids.map((heroId, i) => [`r${i + 1}`, { heroId }]),
  ]);
};

const run = (seed, roster, enabled) => {
  const engine = new LogicEngine(seed, null, { rules: 'v3' });
  if (enabled) engine.configureHeroSkills(toEngineHeroSkills(roster));
  const initialCoreHp = Object.fromEntries(SIDES.map((side) => [side, engine.towers[`${side}_nexus`].hp]));
  const previousCoreBucket = Object.fromEntries(SIDES.map((side) => [side,
    Math.floor(initialCoreHp[side] / PROGRESS_BUCKET_HP)]));
  const previousStructureBucket = Object.fromEntries(SIDES.map((side) => [side,
    Math.floor(Object.values(engine.towers)
      .filter((tower) => tower.side === side && tower.lane !== 'nexus')
      .reduce((sum, tower) => sum + tower.hp, 0) / PROGRESS_BUCKET_HP)]));
  let ticks = 0;
  let coreProgressEvents = 0;
  let structureProgressEvents = 0;
  const baseWaveTicks = Object.fromEntries(SIDES.map((side) => [side, 0]));
  const hasBaseWave = (side) => {
    const key = side === 'blue' ? 'bm' : 'rm';
    return LANES.some((lane) => {
      const blocker = engine.frontStructure(side, lane);
      return blocker && (blocker.lane === 'nexus_guard' || blocker.lane === 'nexus')
        && engine.lanes[lane][key].some((minion) => engine._minionAtBase(side, blocker, lane, minion));
    });
  };
  while (ticks < MAX_TICKS && !engine.over) {
    engine.tick(DT);
    ticks += 1;
    for (const side of SIDES) {
      const coreBucket = Math.floor(engine.towers[`${side}_nexus`].hp / PROGRESS_BUCKET_HP);
      if (coreBucket < previousCoreBucket[side]) coreProgressEvents += 1;
      previousCoreBucket[side] = coreBucket;

      const structureBucket = Math.floor(Object.values(engine.towers)
        .filter((tower) => tower.side === side && tower.lane !== 'nexus')
        .reduce((sum, tower) => sum + tower.hp, 0) / PROGRESS_BUCKET_HP);
      if (structureBucket < previousStructureBucket[side]) structureProgressEvents += 1;
      previousStructureBucket[side] = structureBucket;
      if (hasBaseWave(side)) baseWaveTicks[side] += 1;
    }
  }
  const capHit = !engine.over && ticks >= MAX_TICKS;
  const baseEntryReached = SIDES.every((side) => engine.laneCleared(side));
  const coresStillFull = SIDES.every((side) =>
    engine.towers[`${side}_nexus`].hp >= initialCoreHp[side] - 1e-9);
  const baseWaveTickCount = Object.values(baseWaveTicks).reduce((sum, count) => sum + count, 0);
  const pathologicalDeadlock = capHit && baseEntryReached && coresStillFull
    && coreProgressEvents === 0 && baseWaveTickCount === 0;
  const healthyCloseStalemate = capHit && !pathologicalDeadlock
    && (structureProgressEvents > 0 || coreProgressEvents > 0 || baseWaveTickCount > 0);
  const unclassifiedCapHit = capHit && !pathologicalDeadlock && !healthyCloseStalemate;
  const classification = pathologicalDeadlock
    ? 'PATHOLOGICAL_LONG_MATCH'
    : healthyCloseStalemate
      ? 'HEALTHY_CLOSE_STALEMATE'
      : capHit
        ? 'UNFINISHED_CAP_HIT'
        : engine.over && engine.winner
          ? 'NATURAL_FINISH'
          : 'UNFINISHED';
  const snapshot = engine.snapshot();
  return {
    seed,
    enabled,
    over: engine.over,
    winner: engine.winner,
    duration: engine.t,
    ticks,
    capHit,
    classification,
    structural: {
      baseEntryReached,
      coresStillFull,
      coreProgressEvents,
      structureProgressEvents,
      baseWaveTicks,
      baseWaveTickCount,
    },
    blueKills: engine.bK,
    redKills: engine.rK,
    snapshot,
  };
};

const slotCount = CHAMPIONS_100.reduce(
  (sum, hero) => sum + SLOTS.filter((slot) => hero.skills?.[slot]?.gameplay).length,
  0,
);
assert.equal(CHAMPIONS_100.length, 100, 'canonical roster must remain 100 heroes');
assert.equal(slotCount, 400, 'formal release requires all 400 QWER gameplay slots');

const onRows = [];
const offRows = [];
for (let group = 0; group < CHAMPIONS_100.length / GROUP_SIZE; group += 1) {
  const roster = rosterFor(group);
  const compiled = toEngineHeroSkills(roster);
  assert.equal(Object.keys(compiled.players).length, 10, `group ${group} must compile both sides`);
  for (const seed of SEEDS) onRows.push({ ...run(seed, roster, true), group,
    heroes: roster.b1.heroId + '/' + roster.b2.heroId + '/' + roster.b3.heroId + '/' + roster.b4.heroId + '/' + roster.b5.heroId });
  // One fixed OFF control per group preserves the unchanged engine comparison.
  offRows.push(run(SEEDS[0], roster, false));
}

const deterministicRoster = rosterFor(0);
const deterministicA = run(4242, deterministicRoster, true);
const deterministicB = run(4242, deterministicRoster, true);
assert.deepEqual(deterministicA.snapshot, deterministicB.snapshot, 'skill-on same-seed snapshots must be identical');
assert.equal(deterministicA.duration, deterministicB.duration, 'skill-on same-seed duration must be identical');

const finished = onRows.filter((row) => row.over);
const pathologicalRows = onRows.filter((row) => row.classification === 'PATHOLOGICAL_LONG_MATCH');
const unclassifiedCapHitRows = onRows.filter((row) => row.classification === 'UNFINISHED_CAP_HIT');
const offPathologicalRows = offRows.filter((row) => row.classification === 'PATHOLOGICAL_LONG_MATCH');
const offUnclassifiedCapHitRows = offRows.filter((row) => row.classification === 'UNFINISHED_CAP_HIT');
const durations = finished.map((row) => row.duration / 60).sort((a, b) => a - b);
const totalBlueKills = finished.reduce((sum, row) => sum + row.blueKills, 0);
const totalRedKills = finished.reduce((sum, row) => sum + row.redKills, 0);
const blueWins = finished.filter((row) => row.winner === 'blue').length;
const p50 = durations[Math.floor(durations.length * 0.5)];
const p90 = durations[Math.max(0, Math.ceil(durations.length * 0.9) - 1)];
const max = durations.at(-1);
const blueWinRate = blueWins / Math.max(1, finished.length);
const killRatio = totalBlueKills / Math.max(1, totalRedKills);

console.log('Top skill-on tail diagnostics:', JSON.stringify(onRows
  .slice().sort((a, b) => b.duration - a.duration).slice(0, 10)
  .map((row) => ({ group: row.group, heroes: row.heroes, seed: row.seed, winner: row.winner,
    durationMinutes: row.duration / 60, blueKills: row.blueKills, redKills: row.redKills,
    over: row.over, classification: row.classification, structural: row.structural })), null, 2));

console.log('Structural release diagnostics:', JSON.stringify({
  skillOn: {
    capHit: onRows.filter((row) => row.capHit).length,
    pathological: pathologicalRows.length,
    healthyCloseStalemate: onRows.filter((row) => row.classification === 'HEALTHY_CLOSE_STALEMATE').length,
    unclassifiedCapHit: unclassifiedCapHitRows.length,
  },
  skillOffControl: {
    capHit: offRows.filter((row) => row.capHit).length,
    pathological: offPathologicalRows.length,
    healthyCloseStalemate: offRows.filter((row) => row.classification === 'HEALTHY_CLOSE_STALEMATE').length,
    unclassifiedCapHit: offUnclassifiedCapHitRows.length,
  },
}, null, 2));

assert.equal(pathologicalRows.length, 0,
  'skill-on release contains a structural pathological long match/deadlock');
assert.equal(unclassifiedCapHitRows.length, 0,
  'skill-on release contains an unfinished cap-hit without formal structural evidence');
assert.equal(offPathologicalRows.length, 0,
  'skill-off control contains a structural pathological long match/deadlock');
assert.equal(offUnclassifiedCapHitRows.length, 0,
  'skill-off control contains an unfinished cap-hit without formal structural evidence');
assert.ok(blueWinRate >= 0.3 && blueWinRate <= 0.7, `skill-on side balance outside [30%,70%]: ${blueWinRate}`);
assert.ok(killRatio >= 0.6 && killRatio <= 1.6667, `skill-on kill ratio outside [0.6,1.6667]: ${killRatio}`);
assert.ok(p50 >= 14 && p50 <= 26, `skill-on median duration outside [14,26]: ${p50}`);
assert.ok(p90 <= 35, `skill-on P90 duration exceeds 35 minutes: ${p90}`);

const result = {
  coverage: { heroes: CHAMPIONS_100.length, gameplaySlots: slotCount },
  matches: { skillOn: onRows.length, skillOffControl: offRows.length },
  skillOn: {
    finished: finished.length,
    unfinished: onRows.length - finished.length,
    capHit: onRows.filter((row) => row.capHit).length,
    pathological: pathologicalRows.length,
    healthyCloseStalemate: onRows.filter((row) => row.classification === 'HEALTHY_CLOSE_STALEMATE').length,
    unclassifiedCapHit: unclassifiedCapHitRows.length,
    blueWinRate,
    redWinRate: 1 - blueWinRate,
    blueKills: totalBlueKills,
    redKills: totalRedKills,
    killRatio,
    medianMinutes: p50,
    p90Minutes: p90,
    maxMinutes: max,
  },
  skillOffControl: {
    finished: offRows.filter((row) => row.over).length,
    unfinished: offRows.filter((row) => !row.over).length,
    capHit: offRows.filter((row) => row.capHit).length,
    pathological: offPathologicalRows.length,
    healthyCloseStalemate: offRows.filter((row) => row.classification === 'HEALTHY_CLOSE_STALEMATE').length,
    unclassifiedCapHit: offUnclassifiedCapHitRows.length,
    durationsMinutes: offRows.map((row) => row.duration / 60),
  },
  deterministic: true,
  featureFlag: 'heroSkillsV1=true',
  rules: 'v3',
};
mkdirSync('tmp/hero-skills', { recursive: true });
writeFileSync('tmp/hero-skills/release-gate.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log('Hero Skills Release Gate: PASS');
