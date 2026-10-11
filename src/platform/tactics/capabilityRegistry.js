// ============================================================================
//  platform/tactics/capabilityRegistry.js — Capability Registry（Phase 3a T8：只有資料列）
//
//  身分：玩家「戰術書」每一個可選維度的唯一清單。TacticPlan.v2 的 `choices` 只接受這裡
//  `status === "live"` 的鍵與列舉值（createTacticPlan 驗證）；`design` 的鍵是「已規劃、尚未
//  接上引擎」——存在於表中只是為了能回出明確錯誤碼，**不會被提供給玩家**。
//
//  ── 列的形狀（一個維度一列，frozen）──────────────────────────────────────
//    dimension     "phases.early.stance" 這種點分路徑（對應 TacticPlan.v2.choices 的巢狀物件）
//    choices       允許的列舉值（字串識別字；永遠不是數字，也不是用字串假裝的數字）。
//                  design 列為空陣列＝列舉內容尚未定稿（規格未給），不是「沒有選項」。
//    status        "live" | "design"
//                  live＝「現行引擎的戰術設定已經有一個旋鈕，這個選擇可以解析成它」。
//                  design＝規格列了，但目前沒有可對應的旋鈕（或旋鈕是整場共用、無法依此鍵細分）。
//    minSimVersion live 列＝這個選擇最早可用的模擬版本（Phase 3a 隨 moba-sim.v21 發布）；design 列＝null。
//    basis         live 列＝解析目標：現行 `MobaTacticConfig.v1` 的欄位路徑（資訊用；Task 9 的
//                  Resolver 才是權威映射）。design 列＝null。
//    note          design 列＝為什麼還不能 live（一句話）；live 列＝null。
//
//  Task 10 會在同一批列上再加 resolverFields／engineReads／gate 欄位與真實性 gate；
//  這裡刻意保持「一列一個 frozen 物件」，加欄位不需要改動既有欄位。
//
//  純資料＋查詢，不 import 任何東西。
// ============================================================================

export const CAPABILITY_REGISTRY_VERSION = "CapabilityRegistry.v1";
export const CAPABILITY_STATUS = Object.freeze({ LIVE: "live", DESIGN: "design" });
export const CAPABILITY_SIM_VERSION_3A = "moba-sim.v21";

const STANCE = ["aggressive", "standard", "defensive", "scaling"];
const STANCE_LATE = ["standard", "defensive", "scaling"];
const LANE_STANCE =["aggressive", "standard", "defensive"];
const SPLITTABLE_LANE_STANCE = ["aggressive", "standard", "defensive", "split"];

const live = (dimension, choices, basis) => Object.freeze({
  dimension, choices: Object.freeze([...choices]), status: CAPABILITY_STATUS.LIVE,
  minSimVersion: CAPABILITY_SIM_VERSION_3A, basis, note: null,
});
const design = (dimension, note, choices = []) => Object.freeze({
  dimension, choices: Object.freeze([...choices]), status: CAPABILITY_STATUS.DESIGN,
  minSimVersion: null, basis: null, note,
});

const PHASES = ["early", "mid", "late"];
const PHASE_BASIS = { early: "macro.earlyGame", mid: "macro.midGame", late: "macro.lateGame" };
const LANES = ["top", "mid", "bot"];
const SEATS_WITH_LANE_CORE = { b1: "top", b3: "mid", b4: "adc" };   // 引擎 carryPriority 只認得 top／mid／adc
const WHOLE_MATCH = "引擎的對應旋鈕是整場共用的單一值，無法依此鍵（每個時期各自）細分；要 live 需要引擎先支援";

const ROWS = [
  //  ── live：現行 MobaTacticConfig 已有對應欄位 ───────────────────────────────
  //  時期姿態：macro.earlyGame／midGame／lateGame → toEngineTacticIdentity.phaseEngage／phaseJoin
  //  ⚠ 後期不提供 aggressive：引擎的後期偏移表（PHASE_ENGAGE_LATE）裡 aggressive 與 scaling 同值，
  //    兩個選項會解析成逐位元相同的旋鈕＝假選擇；留 scaling（語意較接近「後期」）。tools 的 gate 守住「同維度的每個選項旋鈕都不同」。
  ...PHASES.map((p) => live(`phases.${p}.stance`, p === "late" ? STANCE_LATE : STANCE, PHASE_BASIS[p])),
  //  打野節奏：macro.tempo → toEngineTactic.gankInterval（與 invadeWithMid）
  live("jungle.tempo", ["slow", "standard", "fast"], "macro.tempo"),
  //  打野重心：lanePlan.jungle → gankWeights／invadeChance／gankIntervalK
  live("jungle.focus", ["gank", "farm", "invade"], "lanePlan.jungle"),
  //  三路姿態與「帶線（單一路）」：lanePlan.top／mid／adc → laneOffset／gankWeights／splitLane。
  //  上、中路多一個 split（＝帶線）；下路沒有（引擎契約 LANE_PLAN_ENUM.adc 不含 split）。
  live("lanes.top.stance", SPLITTABLE_LANE_STANCE, "lanePlan.top"),
  live("lanes.mid.stance", SPLITTABLE_LANE_STANCE, "lanePlan.mid"),
  live("lanes.bot.stance", LANE_STANCE, "lanePlan.adc"),
  //  輔助任務（b5 是輔助席）：lanePlan.support → roamK／protectHp
  live("seats.b5.mission", ["roam", "protect", "standard"], "lanePlan.support"),
  //  核心是誰：economy.carryPriority（top／mid／adc）→ protectRole。只有 b1／b3／b4 對得到。
  ...Object.entries(SEATS_WITH_LANE_CORE).map(([seat, lane]) =>
    live(`seats.${seat}.priority`, ["core", "normal"], `economy.carryPriority(${lane})`)),
  //  風險：macro.riskTolerance → retreatAt／retreatFloorShift／commitShift
  live("risk.tolerance", ["cautious", "balanced", "bold"], "macro.riskTolerance"),

  //  ── design：規格列了，但現行引擎沒有可解析的旋鈕 ────────────────────────────
  design("winCondition", "勝利路徑沒有對應的引擎旋鈕，列舉內容規格尚未定稿"),
  ...PHASES.flatMap((p) => [
    design(`phases.${p}.focusLane`, "引擎沒有「依時期指定主攻路」的旋鈕（Gank 路線權重由路姿態推導，整場共用）"),
    design(`phases.${p}.grouping`, WHOLE_MATCH + "（macro.grouping）"),
    design(`phases.${p}.objectiveOrder`, WHOLE_MATCH + "（objectives.dragon／baron／towerPriority）"),
    design(`phases.${p}.tradePolicy`, "資源交換屬 3b（規格標 *）；引擎沒有對應旋鈕"),
  ]),
  ...LANES.map((l) => design(`lanes.${l}.wave`, "兵線處理屬 3b（規格標 *）；引擎沒有對應旋鈕")),
  design("jungle.route", "打野路線屬 3b（規格標 *）；引擎沒有可指定的路線"),
  //  b1／b3／b4／b5 的任務與 b2／b5 的優先：引擎只讀 lanePlan（依路位，不依席位）與 carryPriority（只認上／中／下）
  ...["b1", "b2", "b3", "b4"].map((s) => design(`seats.${s}.mission`, "引擎只有輔助席的任務旋鈕（lanePlan.support），其餘席位沒有")),
  ...["b2", "b5"].map((s) => design(`seats.${s}.priority`, "引擎的核心旋鈕（economy.carryPriority）只認得上／中／下路，打野與輔助無法成為核心")),
  design("teamfight.style", "團戰風格屬 3b（規格標 *）"),
  design("teamfight.engager", "開團手屬 3b（規格標 *）"),
  design("teamfight.focusTarget", "集火目標屬 3b（規格標 *）"),
  design("teamfight.peelFor", "保護對象屬 3b（規格標 *）"),
  design("risk.comeback", "翻盤策略屬 3b（規格標 *）"),
  design("comms.shotcaller", "主 Call 屬 3b（規格標 *）"),
  design("comms.secondCaller", "副 Call 屬 3b（規格標 *）"),
];

export const CAPABILITY_ROWS = Object.freeze(ROWS);
const BY_KEY = new Map(ROWS.map((r) => [r.dimension, r]));

/** 查一個維度的列；沒有這個鍵回 null（呼叫端把它當 unknown key）。 */
export const registryRow = (key) => (typeof key === "string" ? BY_KEY.get(key) ?? null : null);
/** 所有 live 列（frozen 陣列，穩定順序＝表順序）。 */
export const liveRows = () => CAPABILITY_ROWS.filter((r) => r.status === CAPABILITY_STATUS.LIVE);
/** 這個鍵存在，而且是 design（只是還沒接上，不是打錯字）。 */
export const isDesignKey = (key) => registryRow(key)?.status === CAPABILITY_STATUS.DESIGN;
/** key 是 live 列，且 value 是它的列舉成員。型別不對（數字、物件）一律 false。 */
export function isLiveChoice(key, value) {
  const r = registryRow(key);
  return !!r && r.status === CAPABILITY_STATUS.LIVE && typeof value === "string" && r.choices.includes(value);
}
