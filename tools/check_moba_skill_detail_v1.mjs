import assert from 'node:assert/strict';
import { CHAMPIONS_100 } from '../src/data/heroDatabase.js';
import { buildHeroSkillDetail } from '../src/battle/moba/skills/heroSkillDetail.js';
import { compileGameplaySkill } from '../src/battle/moba/skills/heroSkillGameplay.js';
import { battleTalentOptions } from '../src/battle/moba/talents/heroBattleTalents.js';

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
console.log(`Skill detail authority: ${n}/500 PASS`);
