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
    desc: "上、中、下三路同時壓線，打野照常抓人，輔助留在下路保護。目標是在前十分鐘讓對手每一路都不敢補刀，把人頭與推塔差距堆出來。適合前期陣容明顯比對手強、你想在對手成型之前結束比賽的時候。",
    cons: "三路都往前壓，哪一路被反蹲都沒有人救；對手只要撐過前期，你的陣容優勢就開始縮水。不入侵野區，所以拿不到野怪資源的額外優勢。",
    patch: {
      lanePlan: { top: "aggressive", mid: "aggressive", adc: "aggressive", support: "protect" },
      macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.7, riskTolerance: 0.6, splitPush: 0.05 },
      objectives: { towerPriority: 0.6, dragonPriority: 0.45, baronPriority: 0.4, invadePriority: 0.15 },
    },
  }),
  v2Template({
    slug: "jungle_invasion", legacyTacticId: "m7", category: V2_CATEGORY.EARLY, name: "野區入侵", risk: "高",
    desc: "打野把重心放在入侵對方野區，中路跟進、輔助遊走接應。目標是搶走對手的野怪資源，讓對手打野前期發育不起來。適合對手打野依賴固定刷野路線、或你的打野與中單有強力先手的時候。",
    cons: "入侵一旦被蹲就是白送人頭，而且上、下路只剩標準站位，沒有壓制力。把節奏押在野區，對手若反入侵或早早回防，你就是自己把前期優勢丟掉。",
    patch: {
      lanePlan: { mid: "aggressive", jungle: "invade", support: "roam" },
      macro: { earlyGame: "aggressive", tempo: "fast", aggression: 0.65, riskTolerance: 0.7, grouping: 0.6, splitPush: 0.05 },
      objectives: { towerPriority: 0.5, dragonPriority: 0.45, baronPriority: 0.4, invadePriority: 0.35 },
      economy: { supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "bot_duo_pressure", legacyTacticId: "m5", category: V2_CATEGORY.EARLY, name: "下路雙人壓制", risk: "中",
    desc: "射手前壓、輔助貼身保護，打野優先來下路，上路主動讓出一點線權換下路的滾雪球。目標是讓射手最快拿到關鍵裝備，並用下路的優勢推第一座塔與拿第一條龍。適合射手與輔助默契好、對手下路偏弱的時候。",
    cons: "上路被放養：對面上單可以安心發育，甚至反過來帶線。射手一旦被抓崩，整個計畫就沒有後路；而且資源集中在一側，容易被預判。",
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
    desc: "中單與打野一起行動，輔助跟著遊走，以中路為核心在河道製造區域人數優勢。進入中期後主動換成積極的團戰姿態，用人數差拿龍與推塔。適合中單、打野的地圖意識與反應都夠高，而且對手中單比你容易被抓的時候。",
    cons: "中單必須長期吃線與位移，一旦遊走撲空就虧線；上、下路沒有支援，對面可以直接換塔。比全圖游走保守，但仍要靠中單與打野的操作品質。",
    patch: {
      lanePlan: { mid: "aggressive", support: "roam" },
      macro: { midGame: "aggressive", aggression: 0.6, grouping: 0.6 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.55 },
      economy: { carryPriority: "mid", supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "support_river_control", legacyTacticId: "m6", category: V2_CATEGORY.MID, name: "輔助遊走控河道", risk: "中",
    desc: "輔助高頻率離開下路，到河道與野區入口接應打野與中單。下路射手改為保守站位，不靠輔助也能安全補兵。目標是用輔助的機動與接應速度，讓龍的爭奪每次都比對手早到一步。適合想用低風險取得地圖主導權的隊伍。",
    cons: "輔助不在身邊，射手被對面下路二打二壓制時沒有人解圍，只能退塔下；遊走也不保證每次都有收益，頻繁撲空會讓下路發育變慢。",
    patch: {
      lanePlan: { adc: "defensive", support: "roam" },
      macro: { aggression: 0.45, grouping: 0.65 },
      objectives: { dragonPriority: 0.7, baronPriority: 0.55, towerPriority: 0.4 },
      economy: { supportRoamRate: 0.7 },
    },
  }),
  v2Template({
    slug: "dragon_pit_macro", legacyTacticId: "m4", category: V2_CATEGORY.MID, name: "龍坑運營", risk: "低",
    desc: "把龍當成每一波行動的中心：打野持續抓人建立優勢，隊伍在龍刷新前提早集結到龍坑附近，輔助貼身保護。目標是連續拿龍、用龍的增益滾出中後期優勢。適合陣容有穩定打團能力、希望用資源差而不是人頭差贏比賽的時候。",
    cons: "推塔很慢，對手可以趁你守龍的時候換塔；前期被壓時也不太願意主動還手。若對手同樣強攻龍區，會變成一場消耗戰，雙方都吃不到便宜。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { aggression: 0.45, riskTolerance: 0.45, grouping: 0.7 },
      objectives: { dragonPriority: 0.95, baronPriority: 0.55, towerPriority: 0.4, invadePriority: 0.05 },
    },
  }),
  //  ── 分推牽制 ─────────────────────────────────────────────────────────────
  v2Template({
    slug: "top_solo_split", legacyTacticId: "m2", category: V2_CATEGORY.SPLIT, name: "上路單帶（四一分推）", risk: "中",
    desc: "上路單獨帶線，其餘四人在中路與龍區抱團。中路改為防守姿態不主動消耗，輔助貼身保護。目標是逼對手二選一：派人去抓上路，就少一個人守龍與中路；不理上路，塔就一座一座被拆。適合上單單挑與逃生能力強的隊伍。",
    cons: "上路缺席團戰，真的開打是四打五；帶線的人被抓到就是白送。中路不積極，所以對手若不理上路、直接打你四人，你沒有優勢可言。",
    patch: {
      lanePlan: { top: "split", mid: "defensive", support: "protect" },
      macro: { aggression: 0.4, riskTolerance: 0.45, grouping: 0.7, splitPush: 0.85 },
      objectives: { dragonPriority: 0.7, baronPriority: 0.55, towerPriority: 0.6, invadePriority: 0.05 },
      economy: { supportRoamRate: 0.15 },
    },
  }),
  v2Template({
    slug: "mid_solo_split", legacyTacticId: "m2", category: V2_CATEGORY.SPLIT, name: "中路單帶", risk: "中",
    desc: "由中單負責單帶與牽制，下路射手改為防守站位，輔助保護射手。中單同時是團隊的核心資源位，帶線的同時保有支援兩側的機動性。適合中單清線快、位移強，而且你想讓對手中路與上、下路都被拖著走的時候。",
    cons: "中路是全圖距離最短的位置，中單一旦離開，對手可以直接推你的中塔；帶線與支援同時要求太多，操作失誤會兩頭落空。下路防守也代表那一側不會有太多主動性。",
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
    desc: "五人高度集結，輔助與坦克留在隊伍中央準備先手，打團的投入門檻放低，中期起主動找團。目標是以一波團戰決定巴龍或高地的歸屬。適合陣容有強力先手控制與後排輸出、而且隊員溝通與配合度高的時候。",
    cons: "撤退門檻低，這波團輸了就是整局崩盤；全員抱團意味著各路兵線與野區沒有人管，對手可以轉點換塔。很吃先手品質，沒有好的開團手就等於白白衝進去。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { midGame: "aggressive", aggression: 0.7, riskTolerance: 0.7, grouping: 0.9, splitPush: 0.05 },
      objectives: { baronPriority: 0.7 },
      economy: { supportRoamRate: 0.5 },
    },
  }),
  v2Template({
    slug: "protect_core_scaling", legacyTacticId: "m8", category: V2_CATEGORY.FIGHT, name: "保核心拖後期", risk: "低",
    desc: "上路與中路放棄主動，所有資源往射手傾斜，輔助貼身保護核心。前期安全發育，進入後期用核心輸出打贏團戰。目標是讓射手撐到關鍵裝備成型再開打。適合你的射手後期爆發強、而且隊伍有足夠的保護與控場的時候。",
    cons: "前期的塔與資源讓得多，若對手是速推或強攻型，在你的核心成型之前比賽可能就結束了；整隊都繞著射手轉，射手被針對就沒有第二個傷害來源。",
    patch: {
      lanePlan: { top: "defensive", mid: "defensive", support: "protect" },
      macro: { earlyGame: "defensive", lateGame: "scaling", tempo: "slow", aggression: 0.4, riskTolerance: 0.3, grouping: 0.75, splitPush: 0.05 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.7, towerPriority: 0.4, invadePriority: 0.05 },
      economy: { carryPriority: "adc", supportRoamRate: 0.15 },
    },
  }),
  //  ── 穩健運營 ─────────────────────────────────────────────────────────────
  v2Template({
    slug: "standard_macro", legacyTacticId: "std", category: V2_CATEGORY.STEADY, name: "標準運營", risk: "中",
    desc: "三路維持標準站位，輔助以保護為主，龍、巴龍與推塔的優先順序都取中等偏上，集結程度略高於一般。沒有特別的偏好，隨比賽狀況自己判斷。適合還不確定對手風格、想先看一輪再決定打法的時候。",
    cons: "沒有任何一個強項：打不出前期優勢，也沒有後期保證。如果對手有明確的戰術重心，你的標準運營會被對方的強項逐步壓過。",
    patch: {
      lanePlan: { support: "protect" },
      macro: { grouping: 0.6 },
      objectives: { dragonPriority: 0.65, baronPriority: 0.55, towerPriority: 0.55 },
    },
  }),
  v2Template({
    slug: "defensive_hold", legacyTacticId: "m8", category: V2_CATEGORY.STEADY, name: "劣勢穩守", risk: "低",
    desc: "已經落後的時候用的收縮打法：三路全部防守、打野專心發育、輔助保護，前期與中期都不主動接戰，也不爭龍與巴龍，等對手露出破綻或自己的後期陣容成型。目標是先活下來，把失誤率降到最低。",
    cons: "龍、巴龍與外塔幾乎全部讓出，對手的優勢會持續擴大；這套只換到時間，不保證翻盤。如果後期陣容本身沒有優勢，守得再穩也只是輸得慢一點。",
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
