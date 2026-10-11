// ============================================================================
//  platform/tactics/tacticTemplates.js — 模板資料 tacticTemplates.v1（Phase 3a T8）
//
//  數值只存在「有版本號的模板／覆蓋層資料」與 Resolver（規格 §4.2）；玩家的 TacticPlan.v2 只引用 templateId。
//
//  三種模板：
//   · classic.m1 … classic.m8：經典模板。**由程式從 MobaTacticConfig.js 匯入建立，不手抄**——
//     所以「逐欄等於 mobaTacticById」由構造保證，而不是靠人記得同步。這一段**不得出現任何數字字面值**
//     （tools/check_tactic_plan_3a.mjs 會掃 `@classic:begin`～`@classic:end` 之間剝註解後的原始碼）。
//   · std：標準運營（STANDARD_OPP_TACTIC）。中性基準，也是 v2 模板的底（沒被覆寫的欄位 ＝ 中性值）。
//   · v2.*：模板 v2（12 個）。新內容，是「現有八套沒有的 knob 組合」——屬新的輸入、不是語意變化。
//     規則（由 gate 守住）：
//       ① 每個欄位值落在八套經典＋三個覆蓋層已涵蓋的 [min, max] 範圍內（不發明新量級）；
//       ② 列舉欄位只用 3a live 的選擇可表達的組合（capabilityRegistry.js）；
//       ③ 任兩個模板解析出的引擎旋鈕組不相同，也不等於任何經典；
//       ④ 設定本身是合法的 MobaTacticConfig.v1。
//     `legacyTacticId`＝熟練度計數與賽果證據（evidence／fit）借用的經典 id。
//
//  模板物件一律 deep-frozen；`config` 是自己的深拷貝，不是 MOBA_TACTICS 的共用物件。
//  Task 9 的 Resolver 讀 `config` 當起點，再套覆蓋層與選擇對照表。
// ============================================================================
import { MOBA_TACTICS, STANDARD_OPP_TACTIC, mobaTacticById } from "../contracts/MobaTacticConfig.js";

export const TACTIC_TEMPLATES_VERSION = "tacticTemplates.v1";

const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

//@classic:begin
const classicTemplate = (t) => deepFreeze({
  templateId: `classic.${t.tacticId}`,
  kind: "classic",
  category: "classic",
  name: t.name,
  desc: t.desc,
  cons: t.cons ?? null,
  legacyTacticId: t.tacticId,
  config: structuredClone(t),
});
const CLASSIC_TEMPLATES = MOBA_TACTICS.map(classicTemplate);
const STD_TEMPLATE = deepFreeze({
  templateId: STANDARD_OPP_TACTIC.tacticId,
  kind: "std",
  category: "std",
  name: STANDARD_OPP_TACTIC.name,
  desc: STANDARD_OPP_TACTIC.desc,
  cons: null,
  legacyTacticId: STANDARD_OPP_TACTIC.tacticId,
  config: structuredClone(STANDARD_OPP_TACTIC),
});
//@classic:end

//  ── 模板 v2 ───────────────────────────────────────────────────────────────
//  patch 只寫「和中性 std 不同的欄位」。risk＝UI 風險標籤（中／高／低），與 MobaTacticConfig 的 `risk` 同義。
const V2_CATEGORY = Object.freeze({
  EARLY: "前期節奏", MID: "中期控圖", SPLIT: "分推牽制", FIGHT: "團戰決勝", STEADY: "穩健運營",
});

function v2Template({ slug, legacyTacticId, category, name, desc, cons, risk, patch }) {
  const std = structuredClone(STANDARD_OPP_TACTIC);
  const donor = legacyTacticId === STANDARD_OPP_TACTIC.tacticId ? std : mobaTacticById(legacyTacticId);
  const config = {
    ...std,
    tacticId: legacyTacticId, name, archetype: category, risk, desc, detail: desc, cons,
    fit: structuredClone(donor.fit), evidence: structuredClone(donor.evidence),
    lanePlan: { ...std.lanePlan, ...patch.lanePlan },
    macro: { ...std.macro, ...patch.macro },
    objectives: { ...std.objectives, ...patch.objectives },
    economy: { ...std.economy, ...patch.economy },
  };
  return deepFreeze({ templateId: `v2.${slug}`, kind: "v2", category, name, desc, cons, legacyTacticId, config });
}

const V2_TEMPLATES = [
  //  ── 前期節奏 ─────────────────────────────────────────────────────────────
  v2Template({
    slug: "three_lane_pressure", legacyTacticId: "m7", category: V2_CATEGORY.EARLY, name: "三路壓制", risk: "高",
    desc: "上、中、下三路的站位都推得比平常更前面，打野出來抓人的次數也比平常多。前期隊伍更敢主動接戰。輔助比較少離開下路，出手救人的時機也比較早。適合前期陣容就比對手強的時候。",
    cons: "三路的站位都比平常更靠前。",
    patch: {
      lanePlan: { top: "aggressive", mid: "aggressive", adc: "aggressive", support: "protect" },
      macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.7, riskTolerance: 0.6, splitPush: 0.05 },
      objectives: { towerPriority: 0.6, dragonPriority: 0.45, baronPriority: 0.4, invadePriority: 0.15 },
    },
  }),
  v2Template({
    slug: "jungle_invasion", legacyTacticId: "m7", category: V2_CATEGORY.EARLY, name: "野區入侵", risk: "高",
    desc: "開局很可能先往對方的野區入侵，中單也會跟著上去，只維持開局那一小段時間。之後打野抓人比平常更勤快，抓人也較偏向中路；中路的站位推得比平常更前面，輔助比較常離開下路。前期隊伍比較敢主動接戰。適合打野和中單都很能打的時候。",
    cons: "撤退的時機比平常稍微晚一點，投入團戰的門檻也稍微比較低。打野稍微比較少去上路和下路抓人，輔助也比較常離開下路。",
    patch: {
      lanePlan: { mid: "aggressive", jungle: "invade", support: "roam" },
      macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.65, riskTolerance: 0.7, grouping: 0.6, splitPush: 0.05 },
      objectives: { towerPriority: 0.5, dragonPriority: 0.45, baronPriority: 0.4, invadePriority: 0.35 },
      economy: { supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "bot_duo_pressure", legacyTacticId: "m5", category: V2_CATEGORY.EARLY, name: "下路雙人壓制", risk: "中",
    desc: "下路的站位推得比平常更前面，上路的站位則稍微靠後。打野抓人的次數比平常多，抓人也較偏向下路。輔助比較少離開下路，隊友有危險時優先救射手，出手救人的時機也比較早。前期隊伍比較敢主動接戰，前期對龍的爭奪也更願意參與；中期和後期對龍的爭奪稍微更願意參與。適合射手和輔助配合得好的時候。",
    cons: "下路的站位比平常靠前，打野稍微比較少去上路和中路抓人。",
    patch: {
      lanePlan: { top: "defensive", adc: "aggressive", support: "protect" },
      macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.65, riskTolerance: 0.55, grouping: 0.55 },
      objectives: { towerPriority: 0.65, dragonPriority: 0.65, baronPriority: 0.45 },
      economy: { carryPriority: "adc", supportRoamRate: 0.15 },
    },
  }),
  //  ── 中期控圖 ─────────────────────────────────────────────────────────────
  v2Template({
    slug: "mid_jungle_sync", legacyTacticId: "m6", category: V2_CATEGORY.MID, name: "中野聯動", risk: "中",
    desc: "中路的站位推得比平常更前面，打野抓人較偏向中路。輔助比較常離開下路，隊友有危險時優先救中單。中期隊伍更敢主動接戰。中期對龍的爭奪更願意參與，前期和後期對龍的爭奪也稍微更願意參與。適合中單和打野反應快的組合。",
    cons: "打野稍微比較少去上路和下路抓人。輔助離開下路的次數比平常多，中路的站位也比平常靠前。",
    patch: {
      lanePlan: { mid: "aggressive", support: "roam" },
      macro: { midGame: "aggressive", aggression: 0.6, grouping: 0.6 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.55 },
      economy: { carryPriority: "mid", supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "support_roamer", legacyTacticId: "m6", category: V2_CATEGORY.MID, name: "輔助遊走流", risk: "中",
    desc: "輔助離開下路去遊走的次數比平常多很多，下路射手的站位則比平常靠後。對龍的爭奪也稍微更願意參與。適合輔助個人能力強的時候。",
    cons: "輔助比較常離開下路。",
    patch: {
      lanePlan: { adc: "defensive", support: "roam" },
      macro: { aggression: 0.45, grouping: 0.65 },
      objectives: { dragonPriority: 0.7, baronPriority: 0.55, towerPriority: 0.4 },
      economy: { supportRoamRate: 0.7 },
    },
  }),
  v2Template({
    slug: "dragon_pit_macro", legacyTacticId: "m4", category: V2_CATEGORY.MID, name: "龍坑運營", risk: "低",
    desc: "隊伍對龍的爭奪遠比平常更願意參與，也稍微更願意加入團戰。輔助比較少離開下路，隊友有危險時出手救人的時機也比較早。適合陣容本身就很穩的時候。",
    cons: "這套打法沒有特別明顯的短處，但也不代表比較強。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { aggression: 0.45, riskTolerance: 0.45, grouping: 0.7 },
      objectives: { dragonPriority: 0.95, baronPriority: 0.55, towerPriority: 0.4, invadePriority: 0.05 },
    },
  }),
  //  ── 分推牽制 ─────────────────────────────────────────────────────────────
  v2Template({
    slug: "top_solo_split", legacyTacticId: "m2", category: V2_CATEGORY.SPLIT, name: "上路單帶（四一分推）", risk: "中",
    desc: "上路多半留在自己的線上，通常不參加團戰。上路的站位推得比平常更前面，中路的站位則比平常靠後。隊伍稍微更願意加入團戰，輔助出手救人的時機也比較早。適合上單單打能力強的時候。",
    cons: "帶線的人多半不參加團戰，打團時隊伍常常少一個人。上路的站位也比平常靠前。",
    patch: {
      lanePlan: { top: "split", mid: "defensive", support: "protect" },
      macro: { aggression: 0.4, riskTolerance: 0.45, grouping: 0.7, splitPush: 0.85 },
      objectives: { dragonPriority: 0.7, baronPriority: 0.55, towerPriority: 0.6, invadePriority: 0.05 },
      economy: { supportRoamRate: 0.15 },
    },
  }),
  v2Template({
    slug: "mid_solo_split", legacyTacticId: "m2", category: V2_CATEGORY.SPLIT, name: "中路單帶", risk: "中",
    desc: "隊友有危險時輔助優先救中單，出手救人的時機也比較早。中單多半會留在中路線上，打團時通常不參加團戰；中路的站位比平常更靠前，下路射手的站位則靠後。對龍的爭奪也稍微更願意參與。適合中單個人實力突出的時候。",
    cons: "中單多半不參加團戰，打團時隊伍通常少一個人。中路的站位也比平常靠前。",
    patch: {
      lanePlan: { mid: "split", adc: "defensive", support: "protect" },
      macro: { aggression: 0.45, grouping: 0.65, splitPush: 0.85 },
      objectives: { dragonPriority: 0.65, towerPriority: 0.55 },
      economy: { carryPriority: "mid", supportRoamRate: 0.2 },
    },
  }),
  //  ── 團戰決勝 ─────────────────────────────────────────────────────────────
  v2Template({
    slug: "hard_engage_stack", legacyTacticId: "m3", category: V2_CATEGORY.FIGHT, name: "抱團強開", risk: "高",
    desc: "隊伍加入團戰的程度比平常高很多，投入團戰的門檻也稍微比較低。中期隊伍更敢主動接戰。中期對巴龍的爭奪更願意參與，後期對巴龍的爭奪也稍微更願意參與。輔助出手救人的時機也比較早。適合陣容有強力控制和後排輸出、隊員默契好的時候。",
    cons: "隊伍撤退的時機比平常稍微晚一點，投入團戰的門檻也比平常稍微低一些。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { midGame: "aggressive", aggression: 0.7, riskTolerance: 0.7, grouping: 0.9, splitPush: 0.05 },
      objectives: { baronPriority: 0.7 },
      economy: { supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "protect_core_scaling", legacyTacticId: "m8", category: V2_CATEGORY.FIGHT, name: "保核心拖後期", risk: "低",
    desc: "上路和中路的站位比平常靠後，打野抓人的次數比平常少一些，前期不太主動接戰。隊友有危險時輔助優先救射手，出手救人的時機也比較早；撤退的時機也比平常稍微早一點。中期隊伍稍微更願意加入團戰，後期更願意加入團戰。中期對龍和巴龍的爭奪稍微更願意參與，後期對龍和巴龍的爭奪更願意參與。後期隊伍也稍微更敢主動接戰。適合射手後期輸出強的時候。",
    cons: "前期不太主動接戰，打野抓人的次數也比平常少一些。",
    patch: {
      lanePlan: { top: "defensive", mid: "defensive", support: "protect" },
      macro: { earlyGame: "defensive", lateGame: "scaling", tempo: "slow", aggression: 0.4, riskTolerance: 0.3, grouping: 0.75, splitPush: 0.05 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.7, towerPriority: 0.4, invadePriority: 0.05 },
      economy: { carryPriority: "adc", supportRoamRate: 0.15 },
    },
  }),
  //  ── 穩健運營 ─────────────────────────────────────────────────────────────
  v2Template({
    slug: "standard_macro", legacyTacticId: "std", category: V2_CATEGORY.STEADY, name: "均衡運營", risk: "中",
    desc: "只在少數地方和標準打法不同：輔助比較少離開下路，出手救人的時機也比較早，對龍的爭奪也稍微更願意參與。適合還不確定對手風格的時候。",
    cons: "這套打法沒有特別明顯的短處，但也不代表比較強。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { grouping: 0.6 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.55, towerPriority: 0.55 },
    },
  }),
  v2Template({
    slug: "defensive_hold", legacyTacticId: "m8", category: V2_CATEGORY.STEADY, name: "劣勢穩守", risk: "低",
    desc: "上、中、下三路的站位全部往後退，打野抓人的次數明顯比平常少。前期和中期不太主動接戰，後期接戰的傾向和平常差不多。前期和中期對龍的爭奪也比較少參與。撤退的時機比平常稍微早一點，投入團戰的門檻也比較高。輔助比較少離開下路，出手救人的時機也比較早。適合陣容比對手弱的時候。",
    cons: "前期和中期不太主動接戰。前期和中期對龍的爭奪比較少參與，打野抓人的次數也明顯比平常少。",
    patch: {
      lanePlan: { top: "defensive", mid: "defensive", adc: "defensive", jungle: "farm", support: "protect" },
      macro: { earlyGame: "defensive", midGame: "defensive", lateGame: "scaling", tempo: "slow", aggression: 0.25, riskTolerance: 0.2, grouping: 0.75, splitPush: 0.05 },
      objectives: { dragonPriority: 0.35, baronPriority: 0.45, towerPriority: 0.35, invadePriority: 0.02 },
    },
  }),
];

const ALL = [...CLASSIC_TEMPLATES, STD_TEMPLATE, ...V2_TEMPLATES];

/** 全部模板（穩定順序：classic.m1…m8、std、v2.*）。 */
export const TACTIC_TEMPLATE_LIST = Object.freeze(ALL);
/** templateId → 模板（frozen map）。 */
export const TACTIC_TEMPLATES = Object.freeze(Object.fromEntries(ALL.map((t) => [t.templateId, t])));
export const V2_TEMPLATE_CATEGORIES = V2_CATEGORY;

export const templateById = (id) => (typeof id === "string" && Object.hasOwn(TACTIC_TEMPLATES, id) ? TACTIC_TEMPLATES[id] : null);
/** 經典戰術 id（m1…m8／std）→ 對應的模板 id；不是經典 id 回 null。 */
export const templateIdOfLegacyTactic = (tacticId) =>
  ALL.find((t) => (t.kind === "classic" || t.kind === "std") && t.legacyTacticId === tacticId)?.templateId ?? null;
