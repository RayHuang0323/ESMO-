import { CHAMPIONS_100, heroById } from '../../../data/heroDatabase.js';

export const HERO_BATTLE_TALENT_CONTRACT = 'HeroBattleTalent.v1';
export const BATTLE_TALENT_PILOT_HEROES = Object.freeze([
  'ironclad', 'cinderfist', 'bingshuang', 'leiting', 'sting',
  'shengming', 'dadi', 'gambler', 'hanbing', 'chichuan',
]);

// v1 deliberately implements pre-match, skill-rule modifiers only. Triggered
// on-hit/on-cast, stacks and reset are contract-extension points, not fake effects.
const talent = (heroId, code, name, description, aiStyle, slot, field, multiplier, primitive) => Object.freeze({
  id: `${heroId}:${code}`, heroId, name, description, aiStyle,
  effects: Object.freeze([Object.freeze({
    trigger: 'pre-match', condition: Object.freeze({ slot }), primitive,
    slot, field, multiplier,
  })]),
});

const PILOT = Object.freeze({
  ironclad: [
    talent('ironclad', 'shield-oath', '鋼誓守陣', '神聖嘲諷的守護時間小幅延長。', 'protect', 'W', 'guardDuration', 1.08, 'duration'),
    talent('ironclad', 'breach-horn', '破陣撞角', '衝鋒踐踏的突進距離小幅增加。', 'skirmish', 'Q', 'range', 1.05, 'range'),
  ],
  cinderfist: [
    talent('cinderfist', 'molten-guard', '熔心護體', '熔岩護盾吸收量小幅提升。', 'protect', 'W', 'shieldPctMaxHp', 1.06, 'shield'),
    talent('cinderfist', 'ember-trail', '灼痕', '烈焰衝身留下的火牆小幅延長。', 'skirmish', 'E', 'wallDuration', 1.08, 'duration'),
  ],
  bingshuang: [
    talent('bingshuang', 'ice-shard', '凝霜銳晶', '冰晶投射的基礎傷害小幅提升。', 'frontline', 'Q', 'damage', 1.06, 'damage'),
    talent('bingshuang', 'frost-domain', '寒域擴張', '冰霜落點的作用半徑小幅擴大。', 'skirmish', 'E', 'radius', 1.06, 'area'),
  ],
  leiting: [
    talent('leiting', 'quick-arc', '疾弧', '雷霆箭矢更快命中。', 'skirmish', 'Q', 'travel', 0.94, 'timing'),
    talent('leiting', 'storm-crest', '雷冠', '雷霆大招的基礎傷害小幅提升。', 'frontline', 'R', 'damage', 1.05, 'ultimate'),
  ],
  sting: [
    talent('sting', 'venom-point', '毒鋒', '突刺的基礎傷害小幅提升。', 'frontline', 'Q', 'damage', 1.06, 'damage'),
    talent('sting', 'shadow-step', '影步', '幻影突進的冷卻小幅縮短。', 'skirmish', 'E', 'cooldown', 0.94, 'cooldown'),
  ],
  shengming: [
    talent('shengming', 'lifeline', '生命繫線', '單體生命護盾吸收量小幅增加。', 'protect', 'W', 'shieldPctMaxHp', 1.06, 'shield'),
    talent('shengming', 'renewal', '群生回響', '群體治療的基礎量小幅增加。', 'sustain', 'R', 'healAmount', 1.06, 'heal'),
  ],
  dadi: [
    talent('dadi', 'faultline', '裂地脈', '裂地擊的判定寬度小幅增加。', 'frontline', 'Q', 'width', 1.06, 'area'),
    talent('dadi', 'stone-ward', '磐石守護', '援護護甲倍率小幅提升。', 'protect', 'W', 'armorMultiplier', 1.04, 'shield'),
  ],
  gambler: [
    talent('gambler', 'loaded-deck', '滿手好牌', '命運之牌的單發基礎傷害小幅提升。', 'frontline', 'Q', 'damage', 1.05, 'damage'),
    talent('gambler', 'fate-step', '命運閃步', '閃現護盾的冷卻小幅縮短。', 'skirmish', 'W', 'cooldown', 0.94, 'cooldown'),
  ],
  hanbing: [
    talent('hanbing', 'frost-pierce', '霜矢貫穿', '穿透箭的基礎傷害小幅提升。', 'frontline', 'Q', 'damage', 1.05, 'damage'),
    talent('hanbing', 'winter-fan', '凜冬展翼', '終極箭雨的扇形角度小幅擴大。', 'skirmish', 'R', 'halfAngle', 1.06, 'ultimate'),
  ],
  chichuan: [
    talent('chichuan', 'flame-arc', '焚天弧', '火焰斬擊的扇形角度小幅擴大。', 'skirmish', 'Q', 'halfAngle', 1.06, 'area'),
    talent('chichuan', 'warflame', '赤炎戰旗', '團隊大招的增益時間小幅延長。', 'protect', 'R', 'duration', 1.05, 'ultimate'),
  ],
});

export function classifyBattleTalentProfile(hero) {
  if (!hero?.id || !hero?.skills) return null;
  const mechanics = ['Q', 'W', 'E', 'R'].map((slot) => hero.skills[slot]?.gameplay?.mechanic ?? '');
  return {
    heroId: hero.id, arch: hero.arch, lane: hero.lane,
    mobility: mechanics.some((name) => /dash|blink/.test(name)),
    sustain: mechanics.some((name) => /shield|heal|guard|revive/.test(name)),
    control: mechanics.some((name) => /root|control|taunt|silence|mark/.test(name)),
    area: mechanics.some((name) => /area|cone|line|split/.test(name)),
    ultimate: hero.skills.R?.gameplay?.mechanic ?? null,
  };
}
export const BATTLE_TALENT_PROFILES = Object.freeze(CHAMPIONS_100.map(classifyBattleTalentProfile));
export const battleTalentOptions = (heroId) => PILOT[heroId] ?? GENERATED[heroId] ?? [];
export const battleTalentById = (id) => battleTalentOptions(String(id).split(':')[0]).find((row) => row.id === id) ?? null;

function aiScore(talent, ownHeroes, enemyHeroes) {
  const own = ownHeroes.map((id) => heroById(id)?.arch);
  const enemies = enemyHeroes.map((id) => heroById(id)?.arch);
  const frontline = enemies.filter((arch) => arch === '坦克' || arch === '戰士').length;
  const ranged = enemies.filter((arch) => arch === '法師' || arch === '射手').length;
  const carry = own.filter((arch) => arch === '法師' || arch === '射手').length;
  if (talent.aiStyle === 'frontline') return frontline * 2 + 1;
  if (talent.aiStyle === 'skirmish') return ranged * 2 + 1;
  if (talent.aiStyle === 'protect') return carry * 2 + enemies.filter((arch) => arch === '刺客').length + 1;
  if (talent.aiStyle === 'sustain') return own.length + 1;
  return 0;
}

/** Player picks override AI only when the ID belongs to that seat's hero. */
export function selectBattleTalents(roster, requested = {}) {
  const entries = Object.entries(roster ?? {}).filter(([seat]) => /^[br][1-5]$/.test(seat));
  const heroIdOf = (entry) => entry?.hero?.id ?? entry?.heroId ?? entry?.id;
  const players = {};
  for (const [seat, entry] of entries) {
    const heroId = heroIdOf(entry);
    const options = battleTalentOptions(heroId);
    if (!options.length) continue;
    const picked = options.find((option) => option.id === requested?.[seat]);
    const ownHeroes = entries.filter(([id]) => id[0] === seat[0]).map(([, row]) => heroIdOf(row));
    const enemyHeroes = entries.filter(([id]) => id[0] !== seat[0]).map(([, row]) => heroIdOf(row));
    const chosen = picked ?? [...options].sort((a, b) => aiScore(b, ownHeroes, enemyHeroes) - aiScore(a, ownHeroes, enemyHeroes) || a.id.localeCompare(b.id))[0];
    players[seat] = Object.freeze({ id: chosen.id, heroId, source: picked ? 'player' : 'ai' });
  }
  return Object.freeze({ version: HERO_BATTLE_TALENT_CONTRACT, players: Object.freeze(players) });
}

const FIELDS = Object.freeze({
  damage: ['damage'], cooldown: ['cooldown'], range: ['range'], duration: ['duration', 'wallDuration', 'guardDuration'],
  area: ['radius', 'width', 'halfAngle'], shield: ['shieldPctMaxHp', 'armorMultiplier'],
  heal: ['healAmount'], timing: ['travel'], ultimate: ['damage', 'halfAngle', 'duration'],
  control: ['controlDuration', 'rootDuration', 'silenceDuration', 'slowDuration', 'tauntDuration'],
  mark: ['markDuration', 'damageAmp'], mitigation: ['reduction', 'guardDuration'],
  haste: ['speedFactor', 'duration'],
});

// The remaining 90 heroes are authored from their canonical QWER mechanics, not
// a second hero mapping. Each pair changes a different skill and gameplay axis.
const ATTACK_FIELDS = Object.freeze([
  ['radius', 'area'], ['width', 'area'], ['halfAngle', 'area'],
  ['controlDuration', 'control'], ['rootDuration', 'control'],
  ['damage', 'damage'], ['range', 'range'], ['cooldown', 'cooldown'],
]);
const COUNTER_FIELDS = Object.freeze([
  ['shieldPctMaxHp', 'shield'], ['healAmount', 'heal'], ['reduction', 'mitigation'],
  ['guardDuration', 'mitigation'], ['markDuration', 'mark'], ['damageAmp', 'mark'],
  ['silenceDuration', 'control'], ['slowDuration', 'control'],
  ['wallDuration', 'duration'], ['duration', 'duration'], ['speedFactor', 'haste'],
  ['radius', 'area'], ['controlDuration', 'control'], ['rootDuration', 'control'],
  ['travel', 'timing'], ['cooldown', 'cooldown'], ['range', 'range'],
]);
const FIELD_PHRASE = Object.freeze({
  damage: '基礎傷害', range: '施放距離', cooldown: '冷卻時間', radius: '作用半徑',
  width: '判定寬度', halfAngle: '扇形角度', controlDuration: '控制時間',
  rootDuration: '定身時間', silenceDuration: '沉默時間', slowDuration: '減速時間',
  shieldPctMaxHp: '護盾強度', healAmount: '治療量', reduction: '減傷幅度',
  guardDuration: '守護時間', markDuration: '印記時間', damageAmp: '印記增傷',
  wallDuration: '牆體維持時間', duration: '增益時間', speedFactor: '加速幅度',
  travel: '命中時間',
});
function chooseTalentField(hero, slots, fields, forbidden = null) {
  for (const slot of slots) {
    if (slot === forbidden?.slot) continue;
    const rule = hero.skills[slot]?.gameplay;
    for (const [field, primitive] of fields) {
      if (primitive === forbidden?.primitive || !Number.isFinite(rule?.[field]) || rule[field] <= 0) continue;
      // Authoritative compiler must contain this field; do not talent a prose-only value.
      if (!FIELDS[primitive]?.includes(field)) continue;
      return { slot, field, primitive };
    }
  }
  throw new Error(`No distinct battle talent field for ${hero.id}`);
}
function generatedTalent(hero, code, axis, choice, aiStyle) {
  const skill = hero.skills[choice.slot];
  const faster = choice.field === 'cooldown' || choice.field === 'travel';
  const factor = faster ? 0.94 : 1.06;
  const phrase = FIELD_PHRASE[choice.field];
  return talent(hero.id, code, `${hero.zh}・${skill.name}${axis}`,
    `${skill.name}的${phrase}${faster ? '小幅縮短' : '小幅提升'}；實戰數值以技能詳情為準。`,
    aiStyle, choice.slot, choice.field, factor, choice.primitive);
}
const GENERATED = Object.freeze(Object.fromEntries(CHAMPIONS_100
  .filter((hero) => !PILOT[hero.id])
  .map((hero) => {
    const attack = chooseTalentField(hero, ['Q', 'E', 'R', 'W'], ATTACK_FIELDS);
    const counter = chooseTalentField(hero, ['W', 'R', 'E', 'Q'], COUNTER_FIELDS, attack);
    return [hero.id, Object.freeze([
      generatedTalent(hero, 'battle-form', '・攻勢', attack, 'frontline'),
      generatedTalent(hero, 'counter-form', '・應變', counter, 'protect'),
    ])];
  })));

/** Compiles a selected talent into the same authoritative QWER rule used by LogicEngine. */
export function applyBattleTalentToRule(rule, selected, slot) {
  if (!rule || !selected || !rule.skillId?.startsWith(`${selected.heroId}:`)) return rule;
  const talent = battleTalentById(selected.id);
  if (!talent || talent.heroId !== selected.heroId) return rule;
  let next = rule;
  for (const effect of talent.effects) {
    if (effect.trigger !== 'pre-match' || effect.slot !== slot || effect.condition.slot !== slot) continue;
    if (!FIELDS[effect.primitive]?.includes(effect.field) || !Number.isFinite(rule[effect.field])
      || !(effect.multiplier >= 0.9 && effect.multiplier <= 1.1)) throw new Error(`Invalid talent effect ${talent.id}`);
    next = { ...next, [effect.field]: Number((next[effect.field] * effect.multiplier).toFixed(4)) };
  }
  return next === rule ? rule : Object.freeze(next);
}
