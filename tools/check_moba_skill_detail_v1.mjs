import assert from 'node:assert/strict';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { buildHeroSkillDetail } from '../src/battle/moba/skills/heroSkillDetail.js';
import { compileGameplaySkill } from '../src/battle/moba/skills/heroSkillGameplay.js';
import { battleTalentOptions } from '../src/battle/moba/talents/heroBattleTalents.js';
import { LogicEngine } from '../src/LogicEngine.js';
import { toEngineHeroSkills } from '../src/battle/moba/skills/heroSkillGameplay.js';

let n = 0;
for (const hero of CHAMPIONS_100) for (const slot of ['P', 'Q', 'W', 'E', 'R']) {
  const detail = buildHeroSkillDetail(hero.id, slot, { ready: false, cd: 3.2, cdMax: 8 });
  assert.equal(detail.name, hero.skills[slot].name);
  assert(detail.iconUrl.endsWith(`/${hero.id}/${slot.toLowerCase()}.svg`));
  assert.equal(detail.level.supported, false);
  assert.equal(detail.level.current, null);
  assert.equal(detail.level.next, null);
  assert.equal(detail.nextLevel, null);
  assert.equal(detail.gameplayAvailable, slot !== 'P');
  if (slot !== 'P') {
    assert.deepEqual(detail.rule, compileGameplaySkill(hero.id, slot), 'detail fallback must use the formal compiled rule');
    assert.equal(detail.cooldownRemaining, 3.2);
    assert(detail.targets.hero);
  } else assert.equal(detail.cooldownRemaining, null);
  n++;
}
const selected = battleTalentOptions('bingshuang')[0];
const actual = buildHeroSkillDetail('bingshuang', 'Q', null, { replay: true, selectedTalentId: selected.id });
assert(actual.rule.damage > CHAMPIONS_100.find((hero) => hero.id === 'bingshuang').skills.Q.gameplay.damage);
assert.equal(actual.ready, null, 'old replay cooldown must remain unknown');
const physical = buildHeroSkillDetail('cinderfist', 'Q');
assert.equal(physical.rows.find((row) => row.key === 'damageType')?.value, '物理', 'player UI must not expose engine enum');
const knockup = CHAMPIONS_100.flatMap((hero) => ['Q', 'W', 'E', 'R'].map((slot) => [hero.id, slot]))
  .find(([heroId, slot]) => buildHeroSkillDetail(heroId, slot)?.rule?.control === 'knockup');
assert(knockup);
assert.equal(buildHeroSkillDetail(...knockup).rows.find((row) => row.key === 'control')?.value, '擊飛');
const engine = new LogicEngine(777);
engine.configureHeroSkills(toEngineHeroSkills({ b1: { heroId: 'bingshuang' } }));
//  moba-sim.v19 HeroSkillLevel.v2：冰霜的 Q 在升級順序排第三 ⇒ Lv1 鎖定、Lv3 解鎖、Lv9 升 2 級。
const atLv1 = engine.snapshot().players.find((row) => row.id === 'b1');
const locked = buildHeroSkillDetail('bingshuang', 'Q', atLv1.heroSkills.Q);
assert.equal(locked.level.current, 0, 'Q is locked at Lv1 (third in upgrade priority)');
assert.equal(locked.level.nextAt, 3, 'Q unlocks at Lv3');
engine.players.find((row) => row.id === 'b1').mlv = 3;
engine._updateHeroSkillLevels(engine.players.find((row) => row.id === 'b1'));
const before = engine.snapshot().players.find((row) => row.id === 'b1');
const first = buildHeroSkillDetail('bingshuang', 'Q', before.heroSkills.Q);
assert.equal(first.level.current, 1);
assert.equal(first.level.next, 2);
assert(first.nextLevel.length > 0);
assert.equal(first.level.nextAt, 9, 'Q follows the higher-priority control and area skills');
engine.players.find((row) => row.id === 'b1').mlv = 15;
engine._updateHeroSkillLevels(engine.players.find((row) => row.id === 'b1'));
const after = engine.snapshot().players.find((row) => row.id === 'b1');
const final = buildHeroSkillDetail('bingshuang', 'Q', after.heroSkills.Q);
assert.equal(final.level.current, 3);
assert.equal(final.nextLevel, null);
assert.notDeepEqual(final.rule, first.rule);
console.log(`Skill detail authority: ${n}/500 PASS`);
