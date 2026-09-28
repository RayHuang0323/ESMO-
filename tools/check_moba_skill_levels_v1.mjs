import assert from 'node:assert/strict';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { LogicEngine } from '../src/LogicEngine.js';
import { compileGameplaySkill, toEngineHeroSkills } from '../src/battle/moba/skills/heroSkillGameplay.js';
import { battleTalentOptions, selectBattleTalents } from '../src/battle/moba/talents/heroBattleTalents.js';
import { BattleEventTracker } from '../src/battle/battleEvents.js';
import { snapshotToBattleResult } from '../src/battle/battleResult.js';
import { beginReplayCapture, captureReplayFrame, finalizeReplay } from '../src/battle/moba/replay/replayBuffer.js';
import { createReplaySource } from '../src/battle/moba/replay/replayPresentationSource.js';
import { validateMobaReplay } from '../src/platform/contracts/mobaReplay.js';
import {
  HERO_SKILL_LEVEL_CONTRACT, skillLevelsAtMatchLevel, applySkillLevelToRule,
  skillLevelChanges, SKILL_LEVEL_CAPS,
} from '../src/battle/moba/skills/heroSkillLevels.js';

assert.equal(HERO_SKILL_LEVEL_CONTRACT, 'HeroSkillLevel.v1');
assert.deepEqual(SKILL_LEVEL_CAPS, { Q: 3, W: 3, E: 3, R: 2 });
let covered = 0;
for (const hero of CHAMPIONS_100) for (const slot of ['Q', 'W', 'E', 'R']) {
  const base = compileGameplaySkill(hero.id, slot);
  const cap = SKILL_LEVEL_CAPS[slot];
  const first = applySkillLevelToRule(base, 1);
  const last = applySkillLevelToRule(base, cap);
  assert.deepEqual(first, base, `${hero.id}:${slot} rank 1 must preserve the authored rule`);
  assert.notDeepEqual(last, first, `${hero.id}:${slot} must grow at its final rank`);
  assert(skillLevelChanges(first, last).length > 0);
  assert.equal(base.cooldown, compileGameplaySkill(hero.id, slot).cooldown, 'canonical DB must stay unchanged');
  covered++;
}
assert.equal(covered, 400);
const ranks = skillLevelsAtMatchLevel(15, {}, null);
assert.deepEqual(ranks, { Q: 3, W: 3, E: 3, R: 2 });
assert.deepEqual(skillLevelsAtMatchLevel(1, {}, null), { Q: 1, W: 1, E: 1, R: 1 });

const heroId = 'bingshuang';
const roster = { b1: { heroId }, r1: { heroId } };
const selected = selectBattleTalents(roster, { b1: battleTalentOptions(heroId)[1].id });
const config = toEngineHeroSkills(roster, selected);
const left = new LogicEngine(777), right = new LogicEngine(777);
left.configureHeroSkills(config); right.configureHeroSkills(config);
const tracker = new BattleEventTracker();
tracker.update(left.snapshot());
beginReplayCapture({ seed: 777, roster, config: { battleTalentIds: { b1: selected.players.b1.id } } });
captureReplayFrame(left.snapshot());
for (const engine of [left, right]) {
  const player = engine.players.find((p) => p.id === 'b1');
  for (const matchLevel of [3, 5, 7, 9, 11, 13, 15]) {
    player.mlv = matchLevel;
    engine._updateHeroSkillLevels(player);
  }
}
assert.deepEqual(left.snapshot(), right.snapshot(), 'same-seed leveled snapshot must match');
const live = left.snapshot().players.find((p) => p.id === 'b1');
assert.equal(live.heroSkills.Q.level.current, 3);
assert.equal(live.heroSkills.R.level.current, 2);
assert.equal(live.heroSkills.Q.level.next, null);
assert(live.heroSkills.Q.rule !== null);
assert.deepEqual(left.heroSkills.b1, right.heroSkills.b1);
const events = tracker.update(left.snapshot());
assert.equal(events.filter((event) => event.type === 'SKILL_LEVEL_UP').length, 7);
assert(events.every((event) => Number.isFinite(event.t)));
const result = snapshotToBattleResult({ ...left.snapshot(), over: true, winner: 'blue' }, events);
assert.deepEqual(result.players.find((p) => p.id === 'b1').heroSkillLevels,
  { Q: 3, W: 3, E: 3, R: 2 });
assert.equal(result.timeline.filter((event) => event.type === 'SKILL_LEVEL_UP').length, 7);
for (let i = 0; i < 5; i++) left.tick(0.5);
captureReplayFrame(left.snapshot());
const replay = finalizeReplay({ matchId: 'skill-level-v1', events });
assert.equal(validateMobaReplay(replay).ok, true);
assert.equal(replay.frames.at(-1).sl[0][0][0], 3);
const source = createReplaySource(replay);
source.seek(replay.duration);
const replayed = source.getState().snapshot.players.find((p) => p.id === 'b1');
assert.equal(replayed.heroSkills.Q.level.current, 3);
assert.deepEqual(replayed.heroSkills.Q.rule, left.snapshot().players.find((p) => p.id === 'b1').heroSkills.Q.rule);
const legacy = { ...replay, config: {}, frames: replay.frames.map(({ sl, ...frame }) => frame) };
const oldSource = createReplaySource(legacy);
assert.equal(oldSource.getState().snapshot.players.find((p) => p.id === 'b1').heroSkills, undefined);
console.log('Hero Skill Level v1: 400/400 rules / AI / same-seed snapshot PASS');
