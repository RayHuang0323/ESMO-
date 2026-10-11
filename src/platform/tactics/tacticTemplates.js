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
    desc: "三路一起壓上去，線站得比平常更深，打野也跑得勤；整場比賽隊伍都比較敢主動接戰，前期最兇。輔助留在隊友身邊，誰被追殺就先去救。適合陣容前期明顯比對手強、想在對手長出來之前把差距拉開的時候。",
    cons: "三路同時往前頂，哪一路被對手蹲到都不容易有人及時支援；撤退的時機只比平常晚一點，又整場都偏好硬碰，前期沒打出差距的話，這份主動只會一路換來高風險。對龍和巴龍我們也不特別積極。開局偶爾會試著入侵，但別指望靠它拿到什麼。",
    patch: {
      lanePlan: { top: "aggressive", mid: "aggressive", adc: "aggressive", support: "protect" },
      macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.7, riskTolerance: 0.6, splitPush: 0.05 },
      objectives: { towerPriority: 0.6, dragonPriority: 0.45, baronPriority: 0.4, invadePriority: 0.15 },
    },
  }),
  v2Template({
    slug: "jungle_invasion", legacyTacticId: "m7", category: V2_CATEGORY.EARLY, name: "野區入侵", risk: "高",
    desc: "開局就賭一把：打野很可能一開場就衝進對方野區，中單跟著壓上去，在前面不到一分鐘的時間裡跟對手打一場小型遭遇戰。輔助常常離開下路去接應有隊友的那一路，中路的站位也比較前面。適合打野和中單都有強力先手，而且你想靠開局的混戰撕開局面的時候。",
    cons: "這純粹是開局的賭博：衝進去被對手看穿、反蹲，一開場就送人頭。入侵只發生在開局那一小段，打完就回到正常的打法，並不會讓對手的野區長期發育不起來。上路和下路只有普通站位，沒有額外的壓力；撤退又比較晚，翻車時虧得更多。",
    patch: {
      lanePlan: { mid: "aggressive", jungle: "invade", support: "roam" },
      macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.65, riskTolerance: 0.7, grouping: 0.6, splitPush: 0.05 },
      objectives: { towerPriority: 0.5, dragonPriority: 0.45, baronPriority: 0.4, invadePriority: 0.35 },
      economy: { supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "bot_duo_pressure", legacyTacticId: "m5", category: V2_CATEGORY.EARLY, name: "下路雙人壓制", risk: "中",
    desc: "把重心壓在下路：射手站位積極，打野抓人時比較常選下路，輔助專心照顧射手，隊友一起被追殺時先救射手。上路則讓一步，站位保守。對龍的爭奪也比平常積極一點。適合射手和輔助默契好、對手下路比較弱的時候。",
    cons: "資源集中在單側，上路等於放養，對面上單可以安心補刀，甚至反過來帶節奏；射手要是被對手抓崩，整套計畫就沒有後路。隊伍整場也都偏好主動接戰，下路沒打出優勢的時候，這份主動只會變成多送人頭。",
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
    desc: "中路是這套的軸心：中單站位積極，打野抓人最常挑中路，輔助常離開下路去找有隊友的那一路幫忙，誰受傷就先顧中單。打到中期，大家更敢主動找團，趁著人數優勢去搶龍。適合中單和打野反應快、對手中單容易被抓的時候。",
    cons: "中單要長期前壓又要配合，打空了就是白白丟線；上路和下路只有普通的站位，沒有額外的支援。打野抓人的節奏跟標準打法差不多，並不算快，想靠節奏壓過對手不容易。",
    patch: {
      lanePlan: { mid: "aggressive", support: "roam" },
      macro: { midGame: "aggressive", aggression: 0.6, grouping: 0.6 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.55 },
      economy: { carryPriority: "mid", supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "support_river_control", legacyTacticId: "m6", category: V2_CATEGORY.MID, name: "輔助遊走控河道", risk: "中",
    desc: "輔助是這套的主角：只要輪到遊走，就常離開下路去支援有隊友的那一路；射手在下路改守勢，不主動壓線。隊伍整體也比較願意集結，龍一出現就更常發起爭奪。適合想用低風險換取地圖主導權的隊伍。",
    cons: "輔助不在下路的時候，射手被壓制就只能退守，沒人幫忙；遊走也不保證有收益，常撲空的話下路會發育得很慢。另外整隊趁勢推塔時比較保守，拆塔的速度會慢一些。",
    patch: {
      lanePlan: { adc: "defensive", support: "roam" },
      macro: { aggression: 0.45, grouping: 0.65 },
      objectives: { dragonPriority: 0.7, baronPriority: 0.55, towerPriority: 0.4 },
      economy: { supportRoamRate: 0.7 },
    },
  }),
  v2Template({
    slug: "dragon_pit_macro", legacyTacticId: "m4", category: V2_CATEGORY.MID, name: "龍坑運營", risk: "低",
    desc: "整套打法圍著龍轉：龍一出現，隊伍就比一般打法更常發起爭奪，而且一旦決定要打，那一波爭奪的時間窗也拉得更長。平常輔助跟著隊友、誰殘血就先救，撤退也稍微早一點，不拿人頭去賭。適合陣容打團穩，想靠資源差而不是人頭差贏比賽的時候。",
    cons: "推塔不積極，對手趁你在龍坑的時候換塔，你就得拿龍的好處去補；前期被壓時也不會特別拚命還手。想搶龍不代表一定拿得到，遇到同樣想搶龍的對手，常常變成雙方互相消耗。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { aggression: 0.45, riskTolerance: 0.45, grouping: 0.7 },
      objectives: { dragonPriority: 0.95, baronPriority: 0.55, towerPriority: 0.4, invadePriority: 0.05 },
    },
  }),
  //  ── 分推牽制 ─────────────────────────────────────────────────────────────
  v2Template({
    slug: "top_solo_split", legacyTacticId: "m2", category: V2_CATEGORY.SPLIT, name: "上路單帶（四一分推）", risk: "中",
    desc: "上路單獨守在自己那條線上推進，團戰一爆發也多半繼續留在線上，其餘四個人比較靠在一起行動，輔助顧著隊友。目的是讓對手得分神處理上路，少一個人可以專心對付我們的主力。適合上單單挑強、被抓也跑得掉的時候。",
    cons: "只要打起團戰，我們多半就是四打五，上路也來不及趕回來；帶線的人若被抓到，就是白白送人頭。中路為了配合改成守勢，整隊也偏保守，對手不理上路、直接硬打那四個人的時候，我們沒有額外的優勢。",
    patch: {
      lanePlan: { top: "split", mid: "defensive", support: "protect" },
      macro: { aggression: 0.4, riskTolerance: 0.45, grouping: 0.7, splitPush: 0.85 },
      objectives: { dragonPriority: 0.7, baronPriority: 0.55, towerPriority: 0.6, invadePriority: 0.05 },
      economy: { supportRoamRate: 0.15 },
    },
  }),
  v2Template({
    slug: "mid_solo_split", legacyTacticId: "m2", category: V2_CATEGORY.SPLIT, name: "中路單帶", risk: "中",
    desc: "由中單留在中路單獨推進，團戰爆發時也多半不離開線；下路射手改守勢，不主動壓線。輔助跟著隊友，隊友殘血時優先救中單。適合中單清線快、單打強，想用一個人牽制對手的時候。",
    cons: "中單留在線上的時候，團戰就變成四打五，隊伍的核心在關鍵的一戰缺席。下路改守勢，那一側也不會有什麼主動性。",
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
    desc: "全隊靠在一起，團戰一爆發，大家都非常願意加入，進入中期之後更敢主動找團，也特別看重巴龍的爭奪。輔助留在隊友身邊，誰被追殺就先救誰。適合有強力控制和後排輸出、隊員默契好的陣容，想用一波團戰決定巴龍或高地的時候。",
    cons: "撤退比較晚，這一波團輸了，損失就特別大；大家都往團戰擠，各路的兵線和野區比較沒人管，對手可以轉點換塔。這套不會替你決定誰先開團，沒有好的開團時機，只是多送一波。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { midGame: "aggressive", aggression: 0.7, riskTolerance: 0.7, grouping: 0.9, splitPush: 0.05 },
      objectives: { baronPriority: 0.7 },
      economy: { supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "protect_core_scaling", legacyTacticId: "m8", category: V2_CATEGORY.FIGHT, name: "保核心拖後期", risk: "低",
    desc: "前期先求穩：上路、中路站位退後，隊伍前期不主動找架打，打野抓人的節奏也放慢，射手殘血時輔助先救射手。等到後期，大家再積極起來打團。隊伍偏好集結，撤退也比較早。適合射手後期爆發強、隊伍有足夠保護的時候。",
    cons: "前期線位後退，塔和資源讓得比較多；推塔也不積極，對手若是速推或強攻型，我們的核心還沒成型，比賽就可能結束了。保護的重心在射手一人，射手被針對就沒有第二個核心。",
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
    desc: "不押任何一條路：三路維持普通站位，輔助跟著隊友、誰殘血先救；龍、巴龍和推塔都比標準打法稍微積極一點，隊伍也略偏向集結。適合還不確定對手風格，想先看一輪再決定打法的時候。",
    cons: "沒有任何一項特別強：前期沒有額外的主動，後期也沒有額外的保證。對手如果有明確的戰術重心，我們的均衡會被對手的強項慢慢壓過。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { grouping: 0.6 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.55, towerPriority: 0.55 },
    },
  }),
  v2Template({
    slug: "defensive_hold", legacyTacticId: "m8", category: V2_CATEGORY.STEADY, name: "劣勢穩守", risk: "低",
    desc: "落後時的收縮打法：三路站位全部退後，打野改以發育為主，出手抓人的頻率明顯降低；前、中期不主動找架打，血量一低就比較早撤，等到後期才恢復積極。隊伍仍然維持集結，輔助也留在隊友身邊。龍和巴龍我們還是會去，只是沒那麼積極。目的是先活下來，把失誤降到最低。",
    cons: "站位退後，兵線推進的主動權就交給了對手；去爭龍和巴龍的時候，若人數或血量吃虧，仍然可能被團滅。這套換的是時間，不保證翻盤；後期陣容本身沒有優勢的話，守得再穩也只是輸得慢一點。",
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
