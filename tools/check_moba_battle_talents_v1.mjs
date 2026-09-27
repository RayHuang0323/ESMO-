import assert from 'node:assert/strict';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { compileGameplaySkill } from '../src/battle/moba/skills/heroSkillGameplay.js';
import {
  BATTLE_TALENT_PILOT_HEROES, classifyBattleTalentProfile, battleTalentOptions,
  selectBattleTalents, applyBattleTalentToRule,
} from '../src/battle/moba/talents/heroBattleTalents.js';

assert.equal(CHAMPIONS_100.filter((hero) => classifyBattleTalentProfile(hero)?.arch).length, 100);
assert.equal(BATTLE_TALENT_PILOT_HEROES.length, 10);
assert.equal(new Set(BATTLE_TALENT_PILOT_HEROES).size, 10);
for (const heroId of BATTLE_TALENT_PILOT_HEROES) {
  const options = battleTalentOptions(heroId);
  assert.equal(options.length, 2, `${heroId} needs two real choices`);
  assert.notEqual(options[0].id, options[1].id);
  for (const talent of options) {
    assert(talent.effects.length > 0);
    const effect = talent.effects[0];
    const baseline = compileGameplaySkill(heroId, effect.slot);
    const modified = applyBattleTalentToRule(baseline, talent, effect.slot);
    assert.notEqual(modified[effect.field], baseline[effect.field], `${talent.id} must change gameplay`);
    assert.equal(compileGameplaySkill(heroId, effect.slot)[effect.field], baseline[effect.field], 'database must remain unchanged');
  }
}
const roster = Object.fromEntries(BATTLE_TALENT_PILOT_HEROES.map((heroId, i) => [
  `${i < 5 ? 'b' : 'r'}${i % 5 + 1}`, { heroId },
]));
const first = selectBattleTalents(roster);
const second = selectBattleTalents(roster);
assert.deepEqual(first, second, 'AI selection must be deterministic');
assert.equal(Object.keys(first.players).length, 10);
const override = selectBattleTalents(roster, { b1: battleTalentOptions(BATTLE_TALENT_PILOT_HEROES[0])[1].id });
assert.equal(override.players.b1.id, battleTalentOptions(BATTLE_TALENT_PILOT_HEROES[0])[1].id);
assert.equal(selectBattleTalents(roster, { b1: 'invalid' }).players.b1.id, first.players.b1.id);
const mirror = { b1: { heroId: 'ironclad' }, r1: { heroId: 'ironclad' } };
const mirrored = selectBattleTalents(mirror);
assert.equal(mirrored.players.b1.id, mirrored.players.r1.id, 'mirrored roster must select the same AI talent');
assert.notEqual(selectBattleTalents(mirror, { b1: battleTalentOptions('sting')[0].id }).players.b1.id,
  battleTalentOptions('sting')[0].id, 'a different hero talent must be rejected');
console.log('Battle Talent v1 contract: 100 profiles / 10 pilots / 20 choices / deterministic AI PASS');
