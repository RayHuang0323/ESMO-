// ============================================================================
//  heroPassiveGameplay.js — Hero Passive P v1（framework + representative pilot）
//
//  為什麼 P 以前只有資料與圖示：heroDatabase 的 P 只有「截斷的散文」，沒有任何機器可讀欄位；
//  toEngineHeroSkills 只編譯 Q/W/E/R（主動、冷卻、射程），引擎也沒有「受傷／擊殺／脫戰」之類的
//  觸發點可以訂閱。這支檔案補上**機器契約**，引擎端用「每 tick 輪詢既有狀態」判定觸發
//  （血量差、K+A 差、計時、血量門檻），效果只走既有的護盾／減傷／加速路徑：
//    · 不新增傷害公式、不消耗 rng、固定玩家順序 ⇒ 決定性、Replay 可重現；
//    · 規則寫在這裡（受 simulationVersion 語意指紋保護），**不**寫進未受指紋保護的 heroDatabase。
//
//  觸發（trigger.kind）：
//    burst-damage  本 tick 受到 ≥ pctMaxHp × 最大血量 的傷害（淨值；同 tick 的治療會抵銷）
//    low-hp        血量比例 < below
//    periodic      每 icd 秒一次
//    out-of-combat 連續 secs 秒沒有掉血（一次脫戰只觸發一次；受擊後重新上膛）
//    takedown      擊殺或助攻數增加
//  效果（effect.kind，可為陣列）：shield / team-shield / guard(+heal) / haste
//  levelScale：數值 × (1 + levelScale × (本場等級 − 1))——對應散文裡的「依等級增強」。
//
//  擴到 100/100 的方式見 docs/design/Passive_P_Framework_v1.md。
// ============================================================================

export const HERO_PASSIVE_CONTRACT = 'hero-passive.v1';

const R = (heroId, sourceName, trigger, icd, effects, extra = {}) => Object.freeze({
  version: 1, heroId, sourceName, trigger: Object.freeze(trigger), icd,
  effects: Object.freeze(effects.map((e) => Object.freeze(e))), levelScale: 0, ...extra,
});

/** Pilot：散文能乾淨對應到既有效果路徑的 4 名英雄（坦克×2、輔助、刺客）。 */
export const HERO_PASSIVE_RULES = Object.freeze({
  // 「每次受到超過最大血量 8% 的單次傷害，立刻生成一個小型護盾（8 秒 CD）」
  tiemu: R('tiemu', '鐵壁不摧', { kind: 'burst-damage', pctMaxHp: 0.08 }, 8,
    [{ kind: 'shield', pctMaxHp: 0.1, duration: 3 }]),
  // 「血量低於 30% 時，護甲和魔抗各提升 40%，同時每 2 秒回復 2% 最大生命」⇒ 雙抗以減傷近似
  tixue: R('tixue', '鐵壁意志', { kind: 'low-hp', below: 0.3 }, 2,
    [{ kind: 'guard', reduction: 0.22, duration: 2.2, healPctMaxHp: 0.02 }]),
  // 「周圍友方每 8 秒自動獲得一個小型護盾（依等級增強）」
  luminary: R('luminary', '星光庇護', { kind: 'periodic' }, 8,
    [{ kind: 'team-shield', pctMaxHp: 0.05, duration: 3, radius: 10 }], { levelScale: 0.04 }),
  // 「脫戰 4 秒後移速 +25%，下次受攻擊前自動生成護盾（依等級強化）」
  sting: R('sting', '獵影輕步', { kind: 'out-of-combat', secs: 4 }, 2,
    [{ kind: 'haste', factor: 1.25, duration: 6 }, { kind: 'shield', pctMaxHp: 0.06, duration: 6 }], { levelScale: 0.04 }),
});

export const passiveRuleOf = (heroId) => HERO_PASSIVE_RULES[heroId] ?? null;

/** 名單 → engine.configureHeroPassives 入參；沒有任何 pilot 英雄 ⇒ null（不呼叫 ⇒ 逐位元不變）。 */
export function toEngineHeroPassives(roster = {}) {
  const players = {};
  for (const [seat, row] of Object.entries(roster ?? {})) {
    const heroId = row?.heroId ?? row?.hero?.id ?? null;
    const rule = passiveRuleOf(heroId);
    if (rule) players[seat] = rule;
  }
  return Object.keys(players).length ? { version: HERO_PASSIVE_CONTRACT, players } : null;
}
