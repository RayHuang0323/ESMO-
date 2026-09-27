import { heroById, heroSkillIconUrl } from '../../../data/heroDatabase.js';
import { targetCapabilities } from './heroSkillTargetCapabilities.js';
import { compileGameplaySkill } from './heroSkillGameplay.js';
import { applyBattleTalentToRule, battleTalentById } from '../talents/heroBattleTalents.js';

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
  control: '控制類型', targetMode: '目標模式', blinkMode: '位移模式',
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

/** Read-only UI model. Never computes damage from player stats or prose. */
export function buildHeroSkillDetail(heroId, slot, live = null, { replay = false, selectedTalentId = null } = {}) {
  const hero = heroById(heroId);
  const skill = hero?.skills?.[slot];
  if (!skill) return null;
  const baseRule = slot === 'P' ? null : compileGameplaySkill(heroId, slot);
  const rule = live?.rule ?? (selectedTalentId
    ? applyBattleTalentToRule(baseRule, battleTalentById(selectedTalentId), slot) : baseRule);
  const gameplayAvailable = slot !== 'P' && !!rule;
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
    // v13 QWER uses fixed authored rules. Generic legacy skillData arrays are not runtime levels.
    level: { supported: false, current: null, next: null },
    nextLevel: null,
    availability: slot === 'P' ? '被動尚未實裝；僅提供英雄設定資料' :
      replay && !live ? '此重播未保存個別技能冷卻' : !live ? '此段沒有技能即時狀態' :
        live.ready ? '可用' : `冷卻 ${Math.ceil(live.cd)} 秒`,
  };
}
