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
    desc: "上、中、下三路都採積極站位，線位推得比標準更深；打野的抓人週期縮短，前期接戰意願提高，輔助以保護隊友為主。適合前期陣容明顯占優、想趁對手成型之前累積人頭與推塔差距的時候。",
    cons: "三路同時前壓，撤退時機只比標準略晚一點，被反蹲時沒有哪一路特別有人接應；前期之後接戰意願回到標準，沒在前期拉開差距，優勢不會自己延續。野區入侵只是偶爾發生（約一成半機率），不要指望靠入侵拿到資源優勢。",
    patch: {
      lanePlan: { top: "aggressive", mid: "aggressive", adc: "aggressive", support: "protect" },
      macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.7, riskTolerance: 0.6, splitPush: 0.05 },
      objectives: { towerPriority: 0.6, dragonPriority: 0.45, baronPriority: 0.4, invadePriority: 0.15 },
    },
  }),
  v2Template({
    slug: "jungle_invasion", legacyTacticId: "m7", category: V2_CATEGORY.EARLY, name: "野區入侵", risk: "高",
    desc: "打野把重心放在入侵對方野區（入侵機率高），中路會跟進，輔助遊走率提高、去接應。前期接戰意願較高、抓人週期較短。目標是壓縮對手打野的野怪資源與發育空間。適合打野與中單有強力先手、對手打野路線固定的時候。",
    cons: "入侵一旦被蹲就是白送人頭，而且撤退時機偏晚，翻車的損失更大；上、下路只有標準站位，沒有額外的壓制力。把節奏押在野區，對手若早早回防，前期優勢就丟掉了。",
    patch: {
      lanePlan: { mid: "aggressive", jungle: "invade", support: "roam" },
      macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.65, riskTolerance: 0.7, grouping: 0.6, splitPush: 0.05 },
      objectives: { towerPriority: 0.5, dragonPriority: 0.45, baronPriority: 0.4, invadePriority: 0.35 },
      economy: { supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "bot_duo_pressure", legacyTacticId: "m5", category: V2_CATEGORY.EARLY, name: "下路雙人壓制", risk: "中",
    desc: "下路站位積極，打野抓人時下路的權重較高，輔助以射手為優先保護對象；上路改為保守站位，讓出一點線權。前期接戰意願與推塔、參龍意願略高於標準。目標是讓射手最快滾出優勢，用下路優勢推塔與爭龍。適合射手與輔助默契好、對手下路偏弱的時候。",
    cons: "上路站位偏保守，對面上單可以安心發育；資源偏向下路一側，射手被抓崩整套計畫就失去重心，也容易被預判。前期之後接戰意願回到標準。",
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
    desc: "打野的抓人路線偏向中路，中路站位積極，輔助遊走率提高並優先照看中單；進入中期後接戰意願提高。目標是在中路與河道附近製造人數優勢，再轉去爭龍、推塔。適合中單、打野反應都夠快，而且對手中單容易被抓的時候。",
    cons: "中路要長期壓線與配合遊走，撲空就虧線；上、下路只有標準站位，沒有額外支援。抓人週期沒有縮短，節奏比全圖游走慢。",
    patch: {
      lanePlan: { mid: "aggressive", support: "roam" },
      macro: { midGame: "aggressive", aggression: 0.6, grouping: 0.6 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.55 },
      economy: { carryPriority: "mid", supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "support_river_control", legacyTacticId: "m6", category: V2_CATEGORY.MID, name: "輔助遊走控河道", risk: "中",
    desc: "輔助的遊走率明顯高於標準，常離開下路去支援其他路；下路射手改守勢，不主動壓線。隊伍參龍意願與抱團意願略高於標準，推塔意願低於標準。目標是靠輔助的機動性，在龍的爭奪上更常有人到場。適合想用低風險換取地圖主導權的隊伍。",
    cons: "輔助常不在下路，射手被壓制時較少人解圍，只能退守；遊走不保證有收益，頻繁撲空會拖慢下路發育。推塔意願偏低，拆塔速度會比較慢。",
    patch: {
      lanePlan: { adc: "defensive", support: "roam" },
      macro: { aggression: 0.45, grouping: 0.65 },
      objectives: { dragonPriority: 0.7, baronPriority: 0.55, towerPriority: 0.4 },
      economy: { supportRoamRate: 0.7 },
    },
  }),
  v2Template({
    slug: "dragon_pit_macro", legacyTacticId: "m4", category: V2_CATEGORY.MID, name: "龍坑運營", risk: "低",
    desc: "龍出現之後，隊伍參與爭龍的意願很高（約八成機率，與龍堆運營並列最高），抱團意願略高，輔助以保護隊友為主，撤退時機略早；推塔意願低於標準。目標是比對手更常出現在龍的爭奪上，累積龍的增益。適合陣容有穩定打團能力、想靠資源差而不是人頭差贏的時候。",
    cons: "推塔意願低，對手可以趁你爭龍的時候換塔；接戰意願略低於標準，前期被壓時不會特別積極還手。參龍意願高不代表一定拿到龍，對手同樣強攻龍區時會變成互相消耗。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { aggression: 0.45, riskTolerance: 0.45, grouping: 0.7 },
      objectives: { dragonPriority: 0.95, baronPriority: 0.55, towerPriority: 0.4, invadePriority: 0.05 },
    },
  }),
  //  ── 分推牽制 ─────────────────────────────────────────────────────────────
  v2Template({
    slug: "top_solo_split", legacyTacticId: "m2", category: V2_CATEGORY.SPLIT, name: "上路單帶（四一分推）", risk: "中",
    desc: "上路負責單獨帶線（帶線機率高），中路改為守勢，輔助以保護隊友為主，其餘隊員抱團意願略高於標準。目標是逼對手選擇：派人處理上路就少一個人守龍與中路，不理上路塔就一座座被拆。適合上單單挑與逃生能力強的隊伍。",
    cons: "帶線期間上路不在團戰現場，真的開打會吃人數虧；帶線的人被抓到就是白送。中路站位保守、不主動壓線，對手若不理上路、直接打你的主力，你沒有額外優勢。",
    patch: {
      lanePlan: { top: "split", mid: "defensive", support: "protect" },
      macro: { aggression: 0.4, riskTolerance: 0.45, grouping: 0.7, splitPush: 0.85 },
      objectives: { dragonPriority: 0.7, baronPriority: 0.55, towerPriority: 0.6, invadePriority: 0.05 },
      economy: { supportRoamRate: 0.15 },
    },
  }),
  v2Template({
    slug: "mid_solo_split", legacyTacticId: "m2", category: V2_CATEGORY.SPLIT, name: "中路單帶", risk: "中",
    desc: "由中路負責帶線（帶線機率高），下路射手改為守勢，輔助以保護隊友為主，並優先照看中單。中單同時是隊伍優先保護的對象。適合中單清線快、位移強，想用帶線牽制對手的時候。",
    cons: "中路離開時中塔就暴露給對手；帶線與支援兩邊都要顧，操作失誤會兩頭落空。下路守勢也代表那一側不會有太多主動性。",
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
    desc: "隊伍的參團意願是所有模板中最高的（約七成二，與強開團並列），中期起接戰意願提高，撤退門檻偏低、較晚撤退，對巴龍的參戰意願較高；輔助以保護隊友為主，遊走率提高。目標是以一波團戰決定巴龍或高地的歸屬。適合陣容有強力控制與後排輸出、隊員溝通配合度高的時候。",
    cons: "撤退偏晚，這波團輸了損失就特別大；隊員較常被拉去參團，各路的兵線與野區相對沒人顧，對手可以轉點換塔。這套不會幫你決定誰先手，沒有好的開團時機就只是衝進去。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { midGame: "aggressive", aggression: 0.7, riskTolerance: 0.7, grouping: 0.9, splitPush: 0.05 },
      objectives: { baronPriority: 0.7 },
      economy: { supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "protect_core_scaling", legacyTacticId: "m8", category: V2_CATEGORY.FIGHT, name: "保核心拖後期", risk: "低",
    desc: "上、中路改為守勢，前期接戰意願低、打野抓人週期拉長；輔助優先保護射手，後期接戰意願才提高。隊伍抱團意願高，參龍與參巴龍的意願略高於標準，撤退時機較早。目標是讓射手安全度過前期，後期再靠輸出打團。適合射手後期爆發強、隊伍有足夠保護的時候。",
    cons: "前期線位後退，塔與資源讓得多；推塔意願低，若對手是速推或強攻型，在核心成型之前比賽可能就結束了。保護的重心在射手一人，射手被針對就沒有第二個核心。",
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
    desc: "三路維持標準站位，輔助以保護隊友為主；龍、巴龍與推塔的參與意願比標準略高，抱團意願略高。沒有特別的偏好，隨比賽狀況自己判斷。適合還不確定對手風格、想先看一輪再決定打法的時候。",
    cons: "沒有任何一個強項：前期沒有額外的接戰意願，後期也沒有額外保證。對手若有明確的戰術重心，你的均衡打法會被對方的強項逐步壓過。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { grouping: 0.6 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.55, towerPriority: 0.55 },
    },
  }),
  v2Template({
    slug: "defensive_hold", legacyTacticId: "m8", category: V2_CATEGORY.STEADY, name: "劣勢穩守", risk: "低",
    desc: "已經落後時用的收縮打法：三路站位比標準更靠後，打野以發育為主、很少出來抓人，前期與中期接戰意願低、撤退時機較早，後期才恢復積極。隊伍仍維持較高的抱團意願，輔助以保護隊友為主；爭龍與巴龍的意願只略低於標準，並沒有放棄。目標是先活下來、把失誤降到最低。",
    cons: "線位後退代表外塔承受壓力、兵線被推進；爭龍與巴龍的意願只是略低，劣勢時硬去仍可能被團滅。這套只換到時間，不保證翻盤，後期陣容本身沒有優勢的話，守得再穩也只是輸得慢一點。",
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
