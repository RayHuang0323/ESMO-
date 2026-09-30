// ============================================================================
//  heroPassiveGameplay.js — Hero Passive P Runtime v2（100 名英雄的機器契約）
//
//  為什麼 P 以前只有資料與圖示：heroDatabase 的 P 只有「截斷的散文」，沒有任何機器可讀欄位；
//  toEngineHeroSkills 只編譯 Q/W/E/R。v1（2026-09-29）先做了框架＋4 名 pilot；v2 把**同一套**
//  觸發／效果語彙擴成可重用的 primitives，100 名英雄全部用資料表描述——引擎裡**沒有任何
//  heroId 分支**，也沒有 100 套獨立 hard-code。
//
//  決定性：不消耗 rng、固定玩家順序、事件依引擎產生順序處理 ⇒ Replay 可重現。
//  規則寫在這裡（受 simulationVersion 語意指紋保護），**不**寫進未受指紋保護的 heroDatabase。
//
//  ── 觸發（trigger.kind）────────────────────────────────────────────────
//   輪詢（每 tick 由既有狀態推導）
//    burst-damage  {pctMaxHp}   本 tick 淨受傷 ≥ pct × 最大血量
//    damage-accum  {pctMaxHp}   累積受傷達 pct × 最大血量（觸發後歸零重算）
//    damaged                    本 tick 有受傷（淨值 > 0）
//    low-hp        {below}      血量比例 < below
//    periodic      {inCombat?}  每 icd 秒（inCombat ⇒ 只在 3 秒內受過傷／出過手時）
//    out-of-combat {secs}       連續 secs 秒沒掉血也沒出手（一次脫戰只觸發一次）
//    stationary    {secs}       連續 secs 秒沒有移動（一次只觸發一次，移動後重新上膛）
//    moving        {secs}       連續移動 secs 秒
//    in-zone       {zone}       站在草叢（bush）或河道（river）
//    takedown / kill            擊殺或助攻數增加／擊殺數增加
//    ally-low-hp   {below, radius}      半徑內有隊友血量 < below（目標＝該隊友）
//    ally-burst    {pctMaxHp, radius}   半徑內有隊友本 tick 淨受傷 ≥ pct（目標＝該隊友）
//   事件（引擎在發生點推入 _passiveEvents，本 tick 末一次處理）
//    attack-beat                普攻節拍（atkCd 到點的那一下；目標＝被打的敵方英雄）
//    skill-hit     {slot?}      自己的技能命中敵方英雄（目標＝被命中者）
//    hit-by-skill               被敵方技能命中（目標＝施放者）
//    skill-cast                 施放任一技能
//    ally-cast                  對隊友（非自己）施放技能（目標＝該隊友）
//   共通欄位：every（第 N 次合格事件才觸發）、icd（觸發後冷卻）、cond（額外條件）
//
//  ── 效果（effects[].kind）──────────────────────────────────────────────
//    shield {pctMaxHp,duration,to,layers?}  guard {reduction,duration,to,healPctMaxHp?}
//    team-shield / team-guard {radius}       heal {pctMaxHp,to}   haste {factor,duration,to}
//    power {factor,duration}  stealth {duration}  cdr {secs,to}
//    strike {beats,missingPct?,radius?,max?,chain?,true?}（額外一擊；以「一次普攻節拍」為單位）
//    burn {beatsPerSec,duration,stacks?}  slow {factor,duration,floor?}  stun {duration}
//    mark {amp,duration}  reflect {pct}  stack {add,max,duration?,onDeath?}
//    arm {charges?}（上膛：下一次 release 事件釋放 rule.release.effects）
//    transfer {pctCurrentHp}（把自身當前血量的一部分轉給目標隊友）
//   to：self（預設）／target（事件目標）／attacker（最後一個打到自己的敵方英雄）
//
//  ── 常駐修正（mods[]；讀在傷害式與移動裡，只有開啟時才會 ≠ 1）──────────
//    {kind:'dmg'|'taken'|'speed', mult, when?}
//    when：targetHpBelow／targetHpAboveSelf／selfHpAbove／selfMissingPer{per,cap}／perStack／
//          stacksAtLeast／targetBurning／targetSlowed／moving／zone／chain{per,max}
//    上限：傷害 ×[1, 1.35]、承傷 ×[0.75, 1]、移速 ×[1, 1.3]（引擎端夾住）
//
//  tier：'full'＝散文核心機制已實裝；'approx'＝以既有引擎語彙近似（note 說明差異）；
//        'info'＝純資訊／視野類，**不影響戰鬥**（UI 誠實標示，不硬編效果湊數）。
//  levelScale：護盾／治療量 × (1 + levelScale × (本場等級 − 1))。
// ============================================================================

export const HERO_PASSIVE_CONTRACT = 'hero-passive.v2';

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

/** trigger 可寫成字串（無參數）或物件。 */
const R = (heroId, sourceName, tier, trigger, icd, effects, extra = {}) => deepFreeze({
  version: 2, heroId, sourceName, tier,
  trigger: typeof trigger === 'string' ? { kind: trigger } : trigger,
  icd, effects, levelScale: 0, mods: [], release: null, note: null, ...extra,
});
/** 沒有觸發、只有常駐修正的被動。 */
const M = (heroId, sourceName, tier, mods, extra = {}) => R(heroId, sourceName, tier, null, 0, [], { mods, ...extra });
/** 純資訊類：不影響戰鬥。 */
const I = (heroId, sourceName, note) => R(heroId, sourceName, 'info', null, 0, [], { note });

const LV = { levelScale: 0.04 };

export const HERO_PASSIVE_RULES = deepFreeze(Object.fromEntries([
  // ── 上路 ────────────────────────────────────────────────────────────────
  R('ironclad', '鑄鐵誓約', 'full', { kind: 'damage-accum', pctMaxHp: 0.25 }, 1,
    [{ kind: 'shield', pctMaxHp: 0.06, duration: 8, layers: 3 }], LV),
  R('thornwall', '荊棘鎧甲', 'full', { kind: 'burst-damage', pctMaxHp: 0.12 }, 1,
    [{ kind: 'reflect', pct: 0.25 }]),
  R('ravager', '屠城之志', 'full', 'takedown', 0,
    [{ kind: 'stack', add: 1, max: 30 }], { mods: [{ kind: 'dmg', mult: 0.004, when: { perStack: true } }] }),
  R('cinderfist', '燃燒烙印', 'full', 'skill-hit', 2,
    [{ kind: 'burn', beatsPerSec: 0.35, duration: 3, to: 'target' }, { kind: 'mark', amp: 0.2, duration: 3, to: 'target' }]),
  R('suishan', '山嶽之軀', 'approx', { kind: 'damage-accum', pctMaxHp: 0.28 }, 0,
    [{ kind: 'stack', add: 1, max: 4, duration: 10 }],
    { mods: [{ kind: 'taken', mult: -0.03, when: { perStack: true } }], note: '岩甲層以每層 −3% 承傷近似' }),
  R('tixue', '鐵壁意志', 'full', { kind: 'low-hp', below: 0.3 }, 2,
    [{ kind: 'guard', reduction: 0.22, duration: 2.2, healPctMaxHp: 0.02 }], { note: '雙抗 +40% 以減傷近似' }),
  R('kuangfeng', '風刃之舞', 'full', { kind: 'moving', secs: 3 }, 0,
    [{ kind: 'arm' }], { release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 2, to: 'target' }] } }),
  R('rongyan', '熔岩沸騰', 'full', { kind: 'periodic', inCombat: true }, 4,
    [{ kind: 'stack', add: 1, max: 6, duration: 5 }], { mods: [{ kind: 'dmg', mult: 0.02, when: { perStack: true } }] }),
  R('longji', '龍之傳承', 'approx', { kind: 'periodic' }, 2,
    [{ kind: 'team-guard', reduction: 0.06, duration: 2.2, radius: 12 }], { note: '雙抗 +12% 光環以隊伍減傷近似' }),
  R('xueyue', '血月之力', 'full', { kind: 'periodic', inCombat: false }, 5,
    [{ kind: 'heal', pctMaxHp: 0.015 }], { mods: [{ kind: 'dmg', mult: 0.025, when: { selfMissingPer: { per: 0.1, cap: 10 } } }] }),
  R('tiemu', '鐵壁不摧', 'full', { kind: 'burst-damage', pctMaxHp: 0.08 }, 8,
    [{ kind: 'shield', pctMaxHp: 0.1, duration: 3 }]),
  R('dushe', '劇毒血液', 'full', 'skill-hit', 0,
    [{ kind: 'burn', beatsPerSec: 0.25, duration: 5, stacks: 2, to: 'target' }]),
  R('xukong', '虛空感知', 'approx', 'skill-hit', 3,
    [{ kind: 'slow', factor: 0.88, duration: 3, to: 'target' }], { note: '感知位置為資訊類；只實作「被標記者移速 −12%」' }),
  R('longyi', '龍之血脈', 'full', { kind: 'damage-accum', pctMaxHp: 0.12 }, 0,
    [{ kind: 'stack', add: 1, max: 30, onDeath: 0.5 }], { mods: [{ kind: 'dmg', mult: 0.004, when: { perStack: true } }] }),
  R('tielian', '鐵鏈磨礪', 'full', { kind: 'skill-hit', every: 5 }, 0,
    [{ kind: 'arm' }], { release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 2, radius: 6, max: 2, to: 'target' }] } }),
  R('shengdun', '聖盾積累', 'full', 'damaged', 6,
    [{ kind: 'shield', pctMaxHp: 0.09, duration: 4 }], LV),
  R('tiankong', '天空護翼', 'full', { kind: 'damage-accum', pctMaxHp: 0.25, every: 5 }, 0,
    [{ kind: 'arm' }], { release: { on: 'skill-hit', effects: [{ kind: 'strike', beats: 2, to: 'target' }, { kind: 'stun', duration: 0.8, to: 'target' }] } }),
  R('ronggang', '熔鋼之體', 'full', { kind: 'damaged', every: 8 }, 6,
    [{ kind: 'guard', reduction: 0.25, duration: 6 }], { note: '護甲 +50% 以減傷近似' }),
  R('bingshouweis', '冰霜護甲', 'full', { kind: 'damaged', every: 6 }, 8,
    [{ kind: 'stun', duration: 0.8, to: 'attacker' }], { mods: [{ kind: 'taken', mult: -0.06 }] }),
  R('jufeng', '颶風之刃', 'full', { kind: 'moving', secs: 2 }, 0,
    [{ kind: 'arm' }], {
      mods: [{ kind: 'dmg', mult: 0.12, when: { moving: true } }],
      release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 1.5, radius: 6, max: 3, to: 'target' }] },
    }),

  // ── 打野 ────────────────────────────────────────────────────────────────
  R('sting', '獵影輕步', 'full', { kind: 'out-of-combat', secs: 4 }, 2,
    [{ kind: 'haste', factor: 1.25, duration: 6 }, { kind: 'shield', pctMaxHp: 0.06, duration: 6 }], LV),
  M('duskblade', '暮光連擊', 'full', [{ kind: 'dmg', mult: 1, when: { chain: { per: 0.03, max: 5 } } }]),
  M('greymantle', '捕食者', 'full', [{ kind: 'dmg', mult: 0.08, when: { targetHpAboveSelf: 1.2 } }]),
  R('embercoil', '熔岩鱗甲', 'approx', { kind: 'burst-damage', pctMaxHp: 0.12 }, 3,
    [{ kind: 'reflect', pct: 0.3 }, { kind: 'burn', beatsPerSec: 0.3, duration: 2, to: 'attacker' }], { note: '引擎沒有暴擊；以單次重傷代替' }),
  R('yueying', '月影潛行', 'full', { kind: 'stationary', secs: 2 }, 0,
    [{ kind: 'stealth', duration: 1.5 }, { kind: 'arm' }], { release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 1, to: 'target' }] } }),
  R('dianguang', '靜電積累', 'full', { kind: 'skill-cast', every: 5 }, 0,
    [{ kind: 'arm' }], { release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 2, chain: 1, to: 'target' }] } }),
  R('langwang', '野性直覺', 'full', { kind: 'in-zone', zone: 'bush' }, 2,
    [{ kind: 'haste', factor: 1.2, duration: 2.2 }], { mods: [{ kind: 'dmg', mult: 0.15, when: { targetHpBelow: 0.4 } }] }),
  R('fengbao', '鐵甲反擊', 'approx', { kind: 'burst-damage', pctMaxHp: 0.12 }, 8,
    [{ kind: 'reflect', pct: 0.35 }, { kind: 'stun', duration: 0.5, to: 'attacker' }], { note: '引擎沒有暴擊；以單次重傷代替' }),
  R('yingsi', '影絲感應', 'approx', 'skill-hit', 4,
    [{ kind: 'mark', amp: 0.08, duration: 4, to: 'target' }], { note: '穿牆感知為資訊類；只實作影絲標記的增傷' }),
  R('chichuan', '赤炎燃燒', 'full', 'skill-hit', 0,
    [{ kind: 'burn', beatsPerSec: 0.35, duration: 3, to: 'target' }]),
  R('binghe', '冰霜之身', 'full', { kind: 'skill-hit', every: 4 }, 4,
    [{ kind: 'stun', duration: 1, to: 'target' }], { mods: [{ kind: 'speed', mult: 0.2, when: { zone: 'river' } }] }),
  R('hunpo', '靈魂感知', 'approx', 'kill', 0,
    [{ kind: 'heal', pctMaxHp: 0.08 }], { note: '看見隱形輪廓為資訊類；只實作擊殺回血' }),
  R('yeiren', '夜刃之怒', 'full', { kind: 'in-zone', zone: 'bush' }, 6,
    [{ kind: 'haste', factor: 1.25, duration: 3 }, { kind: 'arm' }],
    { release: { on: 'attack-or-skill', effects: [{ kind: 'strike', beats: 1.3, to: 'target' }] } }),
  R('leisuhunter', '雷速追蹤', 'full', 'kill', 0,
    [{ kind: 'heal', pctMaxHp: 0.1 }], { mods: [{ kind: 'speed', mult: 0.2, when: { targetHpBelow: 0.5 } }] }),
  R('jingci', '荊棘之皮', 'approx', 'damaged', 1,
    [{ kind: 'reflect', pct: 0.2 }], { note: '引擎不分近戰／遠程來源；所有普攻受擊都反彈' }),
  R('anliuyouXia', '暗流感知', 'approx', null, 0, [],
    { mods: [{ kind: 'speed', mult: 0.2, when: { zone: 'river' } }], note: '感知水域為資訊類；只實作水域移速' }),
  R('youming', '幽冥之力', 'full', 'kill', 0,
    [{ kind: 'stack', add: 1, max: 3 }],
    { mods: [{ kind: 'speed', mult: 0.05, when: { perStack: true } }, { kind: 'dmg', mult: 0.04, when: { perStack: true } }], note: '攻速以傷害近似' }),
  R('shanying', '閃影殘像', 'approx', 'hit-by-skill', 18,
    [{ kind: 'shield', pctMaxHp: 0.12, duration: 2 }], { note: '殘像擋刀以受技能命中時的短護盾近似' }),
  R('dadi2', '大地連接', 'full', { kind: 'moving', secs: 0 }, 3,
    [{ kind: 'heal', pctMaxHp: 0.02 }]),
  R('leimingcf', '雷鳴積蓄', 'full', { kind: 'skill-cast', every: 5 }, 0,
    [{ kind: 'arm' }], { release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 1.5, radius: 7, max: 3, to: 'target' }] } }),

  // ── 中路 ────────────────────────────────────────────────────────────────
  R('gambler', '賭徒直覺', 'full', { kind: 'skill-hit', every: 5 }, 0,
    [{ kind: 'arm' }], { release: { on: 'skill-hit', effects: [{ kind: 'strike', beats: 2.5, to: 'target' }] } }),
  R('auralith', '冰霜護盾', 'full', 'damaged', 3,
    [{ kind: 'slow', factor: 0.8, duration: 2, to: 'attacker' }]),
  R('voidrift', '虛空之觸', 'full', 'skill-hit', 0,
    [{ kind: 'arm' }], { release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 1.5, to: 'target' }] } }),
  R('razorwing', '翼刃加速', 'full', 'takedown', 0,
    [{ kind: 'stack', add: 1, max: 10 }], { mods: [{ kind: 'speed', mult: 0.02, when: { perStack: true } }] }),
  R('shikong', '時間加速', 'full', 'periodic', 10,
    [{ kind: 'cdr', secs: 2 }]),
  R('bingshuang', '冰霜積累', 'full', { kind: 'skill-hit', every: 3 }, 6,
    [{ kind: 'stun', duration: 1.2, to: 'target' }]),
  R('anye', '暗夜之觸', 'full', 'skill-hit', 0,
    [{ kind: 'arm' }], { release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 1.2, to: 'target' }] } }),
  R('jiansheng', '劍氣磨礪', 'full', 'takedown', 0,
    [{ kind: 'stack', add: 1, max: 10 }], { mods: [{ kind: 'dmg', mult: 0.012, when: { perStack: true } }] }),
  R('leiming', '雷霆感知', 'full', 'skill-hit', 3,
    [{ kind: 'mark', amp: 0.15, duration: 3, to: 'target' }]),
  R('ronghuo', '熔火標記', 'full', 'skill-hit', 5,
    [{ kind: 'mark', amp: 0.2, duration: 5, to: 'target' }]),
  R('miwu', '迷霧潛行', 'approx', { kind: 'out-of-combat', secs: 3 }, 6,
    [{ kind: 'stealth', duration: 1 }, { kind: 'arm' }],
    { release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 1.45, to: 'target' }] }, note: '自身迷霧以脫戰隱形近似' }),
  R('jingxiang', '鏡像閃避', 'approx', { kind: 'low-hp', below: 0.15 }, 15,
    [{ kind: 'shield', pctMaxHp: 0.12, duration: 1.5 }, { kind: 'stealth', duration: 0.75 }], { note: '致命一擊由鏡像承受，以瀕死護盾＋隱形近似' }),
  R('xingjie', '星界感知', 'approx', { kind: 'skill-hit', slot: 'R' }, 0,
    [{ kind: 'cdr', secs: 2 }], { note: '看見敵方大絕 CD 為資訊類；只實作大絕命中縮短冷卻' }),
  M('lieyan', '先知之眼', 'approx', [{ kind: 'dmg', mult: 0.12, when: { targetBurning: true } }],
    { note: '偵查草叢／隱身為資訊類；只實作對燃燒目標增傷' }),
  R('wuxing', '無形之刃', 'full', 'skill-hit', 6,
    [{ kind: 'stealth', duration: 1 }, { kind: 'power', factor: 1.15, duration: 2 }], { note: '攻速以傷害近似' }),
  R('hundun', '混沌能量', 'full', 'hit-by-skill', 0,
    [{ kind: 'stack', add: 1, max: 5, duration: 8 }], { mods: [{ kind: 'dmg', mult: 0.03, when: { perStack: true } }] }),
  M('mingyun2', '命運之眼2', 'approx', [{ kind: 'dmg', mult: 0.08, when: { targetSlowed: true } }],
    { note: '預知路徑為資訊類；以「對被減速／控制的目標增傷」近似' }),
  R('haixiao', '海洋之心', 'full', { kind: 'in-zone', zone: 'river' }, 3,
    [{ kind: 'heal', pctMaxHp: 0.02 }],
    { mods: [{ kind: 'speed', mult: 0.15, when: { zone: 'river' } }, { kind: 'dmg', mult: 0.2, when: { zone: 'river' } }] }),
  R('jueying', '絕影步', 'full', { kind: 'out-of-combat', secs: 3 }, 2,
    [{ kind: 'haste', factor: 1.35, duration: 4 }]),
  R('guihuo', '鬼火引路', 'approx', { kind: 'in-zone', zone: 'bush' }, 4,
    [{ kind: 'strike', beats: 1, radius: 6, max: 3, to: 'self-area' }, { kind: 'slow', factor: 0.7, duration: 0.5, to: 'self-area', radius: 6 }],
    { note: '鬼火留在草叢，以站在草叢時對附近敵人造成傷害＋迷失（短減速）近似' }),

  // ── 下路 ────────────────────────────────────────────────────────────────
  R('maestro', '第四擊', 'full', { kind: 'attack-beat', every: 4 }, 0,
    [{ kind: 'strike', beats: 1, missingPct: 0.04, true: true, to: 'target' }]),
  R('phantom', '虛影殘影', 'full', 'attack-beat', 10,
    [{ kind: 'strike', beats: 0.6, to: 'target' }]),
  M('dawnstrike', '黎明增幅', 'full', [
    { kind: 'dmg', mult: 0.1, when: { targetHpBelow: 0.5 } },
    { kind: 'dmg', mult: 0.1, when: { targetHpBelow: 0.25 } },
  ]),
  R('mirrorshot', '鏡面折射', 'full', { kind: 'attack-beat', cond: { targetShielded: true } }, 1,
    [{ kind: 'strike', beats: 0.4, radius: 8, max: 1, excludeTarget: true, to: 'target' }]),
  R('xingchen', '星光瞄準', 'full', { kind: 'stationary', secs: 1.5 }, 0,
    [{ kind: 'arm' }], { release: { on: 'attack-or-skill', effects: [{ kind: 'strike', beats: 1.5, to: 'target' }] } }),
  R('leiting', '雷霆積累', 'full', 'skill-cast', 0,
    [{ kind: 'arm', charges: 3 }], { release: { on: 'attack-beat', effects: [{ kind: 'strike', beats: 0.6, to: 'target' }] } }),
  R('liuxing', '流星速度', 'full', { kind: 'attack-beat', every: 5 }, 0,
    [{ kind: 'strike', beats: 2, to: 'target' }]),
  R('huanying', '幻影殘影', 'full', 'attack-beat', 12,
    [{ kind: 'strike', beats: 1.5, to: 'target' }]),
  R('yanfeng', '炎鳳羽翼', 'full', 'kill', 0,
    [{ kind: 'heal', pctMaxHp: 0.05 }], { mods: [{ kind: 'dmg', mult: 0.1, when: { selfHpAbove: 0.7 } }] }),
  R('hanbing', '寒冰穿透', 'full', 'attack-beat', 0,
    [{ kind: 'slow', factor: 0.9, duration: 2, floor: 0.6, to: 'target' }]),
  R('dujian', '毒素精通', 'full', 'attack-beat', 0,
    [{ kind: 'burn', beatsPerSec: 0.08, duration: 4, stacks: 4, to: 'target' }]),
  R('liangzi', '量子精準', 'full', { kind: 'attack-beat', every: 5 }, 0,
    [{ kind: 'strike', beats: 1.5, radius: 6, max: 3, to: 'target' }]),
  M('shensheng', '神聖之力', 'approx', [{ kind: 'dmg', mult: 0.08 }], { note: '神聖（無視護甲）傷害以常駐增傷近似' }),
  R('guangsu', '光速增幅', 'approx', 'attack-beat', 0,
    [{ kind: 'stack', add: 1, max: 8, duration: 3 }], { mods: [{ kind: 'dmg', mult: 0.02, when: { perStack: true } }], note: '滿層雙擊以每層 +2% 傷害近似' }),
  R('siwang', '死亡凝視', 'full', 'kill', 0,
    [{ kind: 'heal', pctMaxHp: 0.08 }], { mods: [{ kind: 'dmg', mult: 0.2, when: { targetHpBelow: 0.4 } }] }),
  R('xuanfeng', '旋風積累', 'full', { kind: 'attack-beat', every: 6 }, 0,
    [{ kind: 'strike', beats: 1.2, radius: 6, max: 4, to: 'target' }]),
  R('tianfa', '天罰積蓄', 'full', 'kill', 0,
    [{ kind: 'stack', add: 1, max: 5 }], { mods: [{ kind: 'dmg', mult: 0.02, when: { perStack: true } }] }),
  R('shengyan', '聖焰之力', 'full', 'skill-hit', 0,
    [{ kind: 'burn', beatsPerSec: 0.3, duration: 3, to: 'target' }]),
  R('liangzicz', '量子穿透', 'full', 'attack-beat', 10,
    [{ kind: 'strike', beats: 1, true: true, to: 'target' }]),
  R('mori', '末日積蓄', 'full', 'kill', 0,
    [{ kind: 'stack', add: 1, max: 10, onDeath: 0 }], { mods: [{ kind: 'dmg', mult: 0.02, when: { perStack: true } }] }),

  // ── 輔助 ────────────────────────────────────────────────────────────────
  R('mantra', '聖潔回響', 'approx', 'ally-cast', 3,
    [{ kind: 'heal', pctMaxHp: 0.03, to: 'target' }], { ...LV, note: '治療增幅以對隊友施法時的直接治療近似' }),
  R('luminary', '星光庇護', 'full', 'periodic', 8,
    [{ kind: 'team-shield', pctMaxHp: 0.05, duration: 3, radius: 10 }], LV),
  R('stoneguard', '岩石之皮', 'full', 'hit-by-skill', 2,
    [{ kind: 'strike', beats: 0.5, true: true, to: 'target' }], { mods: [{ kind: 'taken', mult: -0.07 }], note: '護甲 +15% 以常駐減傷近似；反擊不限刺客' }),
  R('hexweave', '命運之絲', 'approx', 'skill-hit', 3,
    [{ kind: 'mark', amp: 0.12, duration: 3, to: 'target' }], { note: '友方技能引爆以「絲線期間目標承傷提高」近似' }),
  R('shengguang', '聖光感召', 'approx', 'ally-cast', 4,
    [{ kind: 'heal', pctMaxHp: 0.025, to: 'target' }], { ...LV, note: '治療量疊層以對隊友施法時的直接治療近似' }),
  M('dadi', '大地之力', 'full', [{ kind: 'taken', mult: -0.025, when: { selfMissingPer: { per: 0.1, cap: 10 } } }],
    { note: '雙抗 +5%／每 10% 已損血以承傷 −2.5% 近似' }),
  R('tianshi', '天使恩典', 'approx', { kind: 'ally-low-hp', below: 0.15, radius: 12 }, 12,
    [{ kind: 'shield', pctMaxHp: 0.1, duration: 2, to: 'target' }, { kind: 'heal', pctMaxHp: 0.08 }],
    { ...LV, note: '「護盾吸收致命一擊」以隊友瀕死時給護盾＋自身回血近似' }),
  R('fuwenbianzhi', '符文共鳴', 'full', 'ally-cast', 2,
    [{ kind: 'cdr', secs: 1, to: 'target' }]),
  R('zhanchang', '急救反應', 'full', { kind: 'ally-low-hp', below: 0.25, radius: 12 }, 8,
    [{ kind: 'shield', pctMaxHp: 0.12, duration: 3, to: 'target' }], LV),
  R('shiqiang', '石盾護身', 'full', { kind: 'damage-accum', pctMaxHp: 0.33 }, 0,
    [{ kind: 'shield', pctMaxHp: 0.1, duration: 4, to: 'lowest-ally', radius: 14 }], LV),
  R('fengshen', '風神庇佑', 'full', 'ally-cast', 0,
    [{ kind: 'haste', factor: 1.15, duration: 2, to: 'target' }]),
  I('mingyun', '命運之眼', '看見敵方最長 CD 的倒數——資訊類，不影響戰鬥'),
  I('shiguang', '時光感知', '預判友方移動軌跡——資訊類，不影響戰鬥'),
  R('tiebi', '鐵壁守護', 'approx', { kind: 'ally-low-hp', below: 0.3, radius: 12 }, 10,
    [{ kind: 'shield', pctMaxHp: 0.12, duration: 3, to: 'target' }], { ...LV, note: '拉近自身未實作' }),
  I('huanjing', '夢境感知', '看見隱形輪廓——資訊類，不影響戰鬥'),
  R('xuemai', '血脈感知', 'full', { kind: 'ally-burst', pctMaxHp: 0.1, radius: 14 }, 5,
    [{ kind: 'shield', pctMaxHp: 0.06, duration: 3, to: 'target' }], LV),
  R('shengming', '生命共享', 'full', { kind: 'ally-low-hp', below: 0.2, radius: 10 }, 12,
    [{ kind: 'transfer', pctCurrentHp: 0.1, to: 'target' }]),
  R('tieshixin', '鐵石防護', 'approx', { kind: 'ally-burst', pctMaxHp: 0.2, radius: 14 }, 10,
    [{ kind: 'shield', pctMaxHp: 0.12, duration: 3, to: 'target' }], { ...LV, note: '跳至目標未實作' }),
  R('mingyunyindao', '命運加速', 'full', 'ally-cast', 0,
    [{ kind: 'cdr', secs: 0.5, to: 'target' }], { note: 'CD 速度 +15%／3 秒 ≈ 0.45 秒' }),
  I('linghun', '靈魂感知2', '感知友方血量與冷卻——資訊類，不影響戰鬥'),
].map((rule) => [rule.heroId, rule])));

export const passiveRuleOf = (heroId) => HERO_PASSIVE_RULES[heroId] ?? null;

/** 有戰鬥效果的規則（info 類不進引擎）。 */
export const isCombatPassive = (rule) => !!rule && rule.tier !== 'info' && (rule.trigger || rule.mods.length);

export function passiveCoverage(heroIds) {
  const out = { total: 0, full: 0, approx: 0, info: 0, missing: [] };
  for (const id of heroIds) {
    out.total += 1;
    const rule = passiveRuleOf(id);
    if (!rule) out.missing.push(id);
    else out[rule.tier] += 1;
  }
  return out;
}

/** 名單 → engine.configureHeroPassives 入參；沒有任何戰鬥被動 ⇒ null（不呼叫 ⇒ 逐位元不變）。 */
export function toEngineHeroPassives(roster = {}) {
  const players = {};
  for (const [seat, row] of Object.entries(roster ?? {})) {
    const heroId = row?.heroId ?? row?.hero?.id ?? null;
    const rule = passiveRuleOf(heroId);
    if (isCombatPassive(rule)) players[seat] = rule;
  }
  return Object.keys(players).length ? { version: HERO_PASSIVE_CONTRACT, players } : null;
}
