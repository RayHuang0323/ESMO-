import assert from 'node:assert/strict';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { LogicEngine } from '../src/LogicEngine.js';
import { toEngineHeroSkills } from '../src/battle/moba/skills/heroSkillGameplay.js';
import { BATTLE_TALENT_PILOT_HEROES, battleTalentOptions, selectBattleTalents } from '../src/battle/moba/talents/heroBattleTalents.js';
import { beginReplayCapture, captureReplayFrame, finalizeReplay } from '../src/battle/moba/replay/replayBuffer.js';

const roster = Object.fromEntries(BATTLE_TALENT_PILOT_HEROES.map((heroId, index) => [
  `${index < 5 ? 'b' : 'r'}${index % 5 + 1}`, { heroId, hero: heroId, player: `P${index}` },
]));
const selections = selectBattleTalents(roster);
const config = toEngineHeroSkills(roster, selections);
assert.equal(Object.keys(config.players).length, 10);
assert.equal(Object.keys(config.talents).length, 10);
assert.notDeepEqual(config.players.b1, toEngineHeroSkills(roster).players.b1);

let verifiedEffects = 0;
for (const heroId of CHAMPIONS_100.map((hero) => hero.id)) {
  const single = { b1: { heroId } };
  const base = toEngineHeroSkills(single).players.b1;
  for (const option of battleTalentOptions(heroId)) {
    const selected = selectBattleTalents(single, { b1: option.id });
    const actual = toEngineHeroSkills(single, selected).players.b1;
    const effect = option.effects[0];
    const previous = base[effect.slot][effect.field];
    assert.equal(Number.isFinite(previous), true, `missing authoritative field ${option.id}`);
    assert.equal(actual[effect.slot][effect.field], Number((previous * effect.multiplier).toFixed(4)), option.id);
    assert.equal(base[effect.slot][effect.field], previous, `base mutated by ${option.id}`);
    verifiedEffects++;
  }
}
assert.equal(verifiedEffects, 200);

function make(seed) {
  const engine = new LogicEngine(seed);
  engine.configureHeroSkills(config);
  return engine;
}
const left = make(777), right = make(777);
for (let step = 0; step < 120; step++) {
  assert.deepEqual(left.snapshot(), right.snapshot(), `same-seed drift at tick ${step}`);
  left.tick(0.5); right.tick(0.5);
}
const live = left.snapshot();
assert.equal(live.players.find((row) => row.id === 'b1').heroBattleTalent.id, selections.players.b1.id);
assert.equal(live.players.find((row) => row.id === 'r5').heroBattleTalent.id, selections.players.r5.id);

const replayRoster = Object.fromEntries(Object.entries(roster).map(([seat, row]) => [seat,
  { ...row, battleTalentId: selections.players[seat].id },
]));
beginReplayCapture({ seed: 777, roster: replayRoster, config: { battleTalentIds: Object.fromEntries(Object.entries(selections.players).map(([seat, row]) => [seat, row.id])) } });
captureReplayFrame(live);
left.tick(0.5);
captureReplayFrame(left.snapshot());
const replay = finalizeReplay({ matchId: 'battle-talent-pilot-test' });
assert(replay);
assert.equal(replay.playersMeta.find((row) => row.id === 'b1').battleTalentId, selections.players.b1.id);
assert.equal(replay.config.battleTalentIds.b1, selections.players.b1.id);
console.log('Battle Talent runtime: 200/200 effects / 10/10 seats / same-seed 120 ticks / snapshot / Replay PASS');
