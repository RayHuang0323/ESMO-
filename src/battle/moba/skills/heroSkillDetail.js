import { heroById, heroSkillIconUrl } from '../../../data/heroDatabase.js';
import { targetCapabilities } from './heroSkillTargetCapabilities.js';
import { compileGameplaySkill } from './heroSkillGameplay.js';
import { applyBattleTalentToRule, battleTalentById } from '../talents/heroBattleTalents.js';
import { skillLevelChanges } from './heroSkillLevels.js';
import { passiveRuleOf } from './heroPassiveGameplay.js';

const FIELD_LABELS = Object.freeze({
  damage: '基礎傷害', powerRatio: '戰力係數', damageType: '傷害類型', finalMultiplier: '最終倍率',
  healAmount: '基礎治療', healPowerRatio: '治療戰力係數', shieldPctMaxHp: '最大生命護盾比例',
  shieldDuration: '護盾時間', range: '射程', radius: '半徑', width: '寬度',
  duration: '持續時間', guardDuration: '守護時間', controlDuration: '控制時間',
  rootDuration: '定身時間', slowDuration: '緩速時間', silenceDuration: '沉默時間',
  tauntDuration: '嘲諷時間', markDuration: '標記時間', dotDuration: '持續傷害時間',
  wallDuration: '牆體時間', speedFactor: '移速倍率', slowFactor: '緩速倍率',
  powerFactor: '戰力倍率', reduction: '減傷比例', armorMultiplier: '護甲倍率',
  damageAmp: '後續傷害增幅', cooldownFactor: '冷卻倍率',
  hitCount: '命中次數', splitCount: '分裂數', splitRadius: '分裂半徑',
  interval: '命中間隔', tickInterval: '持續效果間隔', travel: '飛行時間',
  delay: '延遲時間', knockback: '擊退距離', pullDistance: '拉近距離',
  blinkDistance: '位移距離', dashStop: '衝刺停點', pathWidth: '路徑寬度',
  pathSlowFactor: '路徑緩速倍率', pathSlowDuration: '路徑緩速時間',
  blastRadius: '爆發半徑', hitRadius: '命中半徑', triggerHpRatio: '觸發生命比例',
  executeThreshold: '斬殺門檻', falloff: '遞減倍率', halfAngle: '扇形半角',
  bonusDamage: '強化普攻傷害', bonusPowerRatio: '強化普攻戰力係數',
  reviveWindow: '復活窗口', reviveHpRatio: '復活生命比例',
  control: '控制類型', targetMode: '目標模式', blinkMode: '位移模式', cooldown: '冷卻時間',
  direction: '位移方向', armorGrowth: '護甲成長', baseArmor: '基礎護甲',
});
const EXCLUDED = new Set(['version', 'mechanic', 'skillId', 'cooldown']);
const ENUM_ZH = Object.freeze({
  damageType: { physical: '物理', magic: '法術', true: '真實' },
  control: { knockup: '擊飛', stun: '暈眩', root: '定身' },
  direction: { away: '遠離', toward: '靠近' },
  blinkMode: { 'pull-to-caster': '拉向施法者', 'self-to-ally': '移至隊友' },
  targetMode: { self: '自身', ally: '友方' },
});
const format = (key, value) => {
  if (typeof value !== 'number') return ENUM_ZH[key]?.[value] ?? String(value);
  if (/Ratio|Factor|Multiplier|reduction|damageAmp|Threshold|falloff|slowFactor/.test(key)) return `${Number((value * 100).toFixed(1))}%`;
  return String(Number(value.toFixed(2)));
};

/**
 * Every surface that shows P (battle HUD tile, skill detail, hero sheet, replay HUD) reads its
 * wording from here so none of them can drift from the engine state.
 * Hero Passive Runtime v2 (moba-sim.v17): a hero whose snapshot row carries `heroPassive` is live.
 * 'info' passives (vision/information only) never enter the engine and are labelled as such —
 * never as "live", never as "not implemented yet".
 */
export const PASSIVE_STATUS = Object.freeze({
  short: '未生效',
  kind: '被動 · 本場未生效',
  aria: '被動本場未生效，僅展示英雄設定資料',
  availability: '本場未生效',
  live: '生效中',
  liveKind: '被動 · 已實裝',
  info: '資訊類',
  infoKind: '被動 · 資訊類',
  infoAvailability: '資訊類被動 · 不影響戰鬥',
  infoAria: '資訊類被動，不影響戰鬥結果',
});

const PASSIVE_TRIGGER_TEXT = Object.freeze({
  'burst-damage': '受到大量單次傷害時', 'damage-accum': '累積受傷時', damaged: '受到傷害時',
  'low-hp': '低血量時', periodic: '週期觸發', 'out-of-combat': '脫戰後', stationary: '靜止時',
  moving: '移動時', 'in-zone': '在草叢／河道時', takedown: '擊殺／助攻時', kill: '擊殺時',
  'ally-low-hp': '隊友低血量時', 'ally-burst': '隊友受重傷時', 'attack-beat': '普攻時',
  'skill-hit': '技能命中時', 'hit-by-skill': '被技能命中時', 'skill-cast': '施放技能時',
  'ally-cast': '對隊友施法時', always: '常駐',
});
/** Hero Passive Runtime v2：snapshot `heroPassive`（規則開啟且此英雄有戰鬥被動時存在）→ 顯示文字。 */
export const passiveLiveText = (live) => {
  if (!live?.trigger) return null;
  const always = live.trigger === 'always';
  const count = always ? `本場加成 ${live.boosted ?? 0} 次` : `已觸發 ${live.procs ?? 0} 次`;
  const cd = live.ready === false && !always ? `（${Math.ceil(live.cd)} 秒後可再觸發）` : '';
  return `已實裝${live.tier === 'approx' ? '（近似）' : ''} · ${PASSIVE_TRIGGER_TEXT[live.trigger] ?? live.trigger} · ${count}`
    + `${live.stacks ? ` · 疊層 ${live.stacks}` : ''}${live.armed ? ' · 已蓄力' : ''}${cd}`;
};
/** 靜態分類（不需對戰狀態）：info＝資訊類、approx＝近似、full＝完整；沒有規則 ⇒ null。 */
export const passiveTierOf = (heroId) => passiveRuleOf(heroId)?.tier ?? null;

/** Read-only UI model. Never computes damage from player stats or prose. */
export function buildHeroSkillDetail(heroId, slot, live = null, { replay = false, selectedTalentId = null } = {}) {
  const hero = heroById(heroId);
  const skill = hero?.skills?.[slot];
  if (!skill) return null;
  const baseRule = slot === 'P' ? null : compileGameplaySkill(heroId, slot);
  const rule = live?.rule ?? (selectedTalentId
    ? applyBattleTalentToRule(baseRule, battleTalentById(selectedTalentId), slot) : baseRule);
  const gameplayAvailable = slot !== 'P' && !!rule;
  const level = live?.level ? { supported: true, current: live.level.current,
    cap: live.level.cap, next: live.level.next, nextAt: live.level.nextAt } :
    { supported: false, current: null, cap: null, next: null, nextAt: null };
  const nextLevel = live?.level?.nextRule ? skillLevelChanges(rule, live.level.nextRule)
    .map((change) => ({ ...change, label: FIELD_LABELS[change.field] ?? change.field,
      fromText: format(change.field, change.from), toText: format(change.field, change.to) })) : null;
  return {
    heroId, slot, name: skill.name, iconUrl: heroSkillIconUrl(heroId, slot),
    description: skill.desc ?? '', gameplayAvailable,
    rule,
    rows: gameplayAvailable ? Object.entries(rule).filter(([key]) => !EXCLUDED.has(key))
      .map(([key, value]) => ({ key, label: FIELD_LABELS[key] ?? key, value: format(key, value) })) : [],
    baseCooldown: gameplayAvailable ? rule.cooldown : null,
    cooldownRemaining: gameplayAvailable && Number.isFinite(live?.cd) ? live.cd : null,
    ready: gameplayAvailable && typeof live?.ready === 'boolean' ? live.ready : null,
    targets: targetCapabilities(rule, slot),
    level: gameplayAvailable ? level : { supported: false, current: null, cap: null, next: null, nextAt: null },
    nextLevel: gameplayAvailable ? nextLevel : null,
    passiveLive: slot === 'P' && !!live?.trigger,
    passiveInfo: slot === 'P' && passiveTierOf(heroId) === 'info',
    passiveNote: slot === 'P' ? passiveRuleOf(heroId)?.note ?? null : null,
    availability: slot === 'P' ? (passiveLiveText(live)
      ?? (passiveTierOf(heroId) === 'info' ? PASSIVE_STATUS.infoAvailability : PASSIVE_STATUS.availability)) :
      replay && !live ? '此重播未保存個別技能冷卻' : !live ? '此段沒有技能即時狀態' :
        live.ready ? '可用' : `冷卻 ${Math.ceil(live.cd)} 秒`,
  };
}
