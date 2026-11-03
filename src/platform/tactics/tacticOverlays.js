// ============================================================================
//  platform/tactics/tacticOverlays.js — 覆蓋層資料 tacticOverlays.v1（Phase 3a T8）
//
//  「覆蓋層」＝現行三個 TacticVariant 原樣遷移（id 不變、逐欄相同）。數值只存在這裡與模板資料裡
//  （規格 §4.2）；玩家的 TacticPlan.v2 只引用 `overlayId`，永遠不含數字。
//
//  宣告式取捨契約（benefitAxes／costAxes／rationale）一併保留：覆蓋層不是新戰術，它仍然必須
//  自己說出「買到什麼、付出什麼」。驗證規則仍住在 `mastery/tacticVariant.js` 的 `validateVariant`。
//
//  `doctrine` 在這裡是字面字串（"tempo"／"control"／"adaptive"）：資料檔不 import mastery 層；
//  與 `mastery/doctrine.js` 的 DOCTRINE 對照由 tools/check_tactic_plan_3a.mjs 守住。
//
//  ⚠ 這份資料現在是引擎輸入（`applyVariant` 讀它 → Live 戰術設定 → toEngineTactic），
//    已列入 SIMULATION_SEMANTICS_FILES。
// ============================================================================

export const TACTIC_OVERLAYS_VERSION = "tacticOverlays.v1";

const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

export const TACTIC_OVERLAYS = deepFreeze([
  {
    overlayId: "m1_measured_siege",
    baseTacticId: "m1",
    doctrine: "tempo",
    name: "穩健速推",
    desc: "一樣快，但留得住撤退空間——代價是推塔壓力鬆掉一截",
    benefitAxes: [{ id: "retreat_room", label: "撤退容錯", fields: ["macro.riskTolerance"] }],
    costAxes: [{ id: "siege_pressure", label: "推塔壓力", fields: ["objectives.towerPriority"] }],
    //  riskTolerance 0.6 → 0.45（撤退門檻變寬）；towerPriority 0.9 → 0.75（推塔權重下降）
    changedFields: { "macro.riskTolerance": 0.45, "objectives.towerPriority": 0.75 },
    rationale: "速推流輸掉的局多半是壓過頭被反打；這個變體把那條線往回收，換來的是滾雪球慢一點。",
  },
  {
    overlayId: "m4_contested_stack",
    baseTacticId: "m4",
    doctrine: "control",
    name: "爭奪型龍堆",
    desc: "願意為龍開戰，換來的是野區更容易被入侵",
    benefitAxes: [{ id: "dragon_contest", label: "龍區爭奪", fields: ["macro.aggression"] }],
    costAxes: [{ id: "team_cohesion", label: "抱團程度", fields: ["macro.grouping"] }],
    //  aggression 0.4 → 0.55（更敢打）；grouping 0.7 → 0.55（陣型更散）
    changedFields: { "macro.aggression": 0.55, "macro.grouping": 0.55 },
    rationale: "龍堆運營怕的是對手不給龍；這個變體讓你搶得起來，代價是隊伍不再永遠站在一起。",
  },
  {
    overlayId: "m8_early_footing",
    baseTacticId: "m8",
    doctrine: "adaptive",
    name: "穩健起手",
    desc: "打野改為 Gank 建立前期立足點，代價是巴龍節奏被推遲",
    benefitAxes: [{ id: "early_footing", label: "前期立足", fields: ["lanePlan.jungle"] }],
    costAxes: [{ id: "baron_tempo", label: "巴龍節奏", fields: ["objectives.baronPriority"] }],
    //  jungle farm → gank（enum 換一項）；baronPriority 0.75 → 0.6
    changedFields: { "lanePlan.jungle": "gank", "objectives.baronPriority": 0.6 },
    rationale: "後期決戰最痛的是前期被打崩就沒有後期；這個變體買前期，賣掉一部分巴龍主動權。",
  },
]);

export const overlayById = (id) => TACTIC_OVERLAYS.find((o) => o.overlayId === id) ?? null;

/**
 * 一組覆蓋層裡「兩個以上都要改同一個欄位」的衝突清單（空陣列＝可以任意順序套用，結果相同）。
 * @param {Array<{overlayId:string, changedFields:object}>} overlays
 */
export function findOverlayConflicts(overlays) {
  const seen = new Map();
  const out = [];
  for (const o of overlays) {
    for (const f of Object.keys(o.changedFields ?? {})) {
      if (seen.has(f)) out.push({ field: f, a: seen.get(f), b: o.overlayId });
      else seen.set(f, o.overlayId);
    }
  }
  return out;
}

/**
 * 把覆蓋層的 changedFields 套到一份戰術設定上，回傳**新的**設定（深拷貝後才改，絕不動傳入物）。
 * `isApplicable(field)` 決定哪些欄位准套用（呼叫端各有自己的 allowed／forbidden 規則）；
 * 預設全收。group 不存在或欄位路徑不是 `group.key` 的一律略過（與 applyVariant 的舊行為相同）。
 * 不寫 variantId／variantName——那是 TacticVariant 層的標記，不屬於覆蓋層資料。
 */
export function applyOverlayFields(baseConfig, changedFields, isApplicable = () => true) {
  const out = structuredClone(baseConfig);
  for (const [field, value] of Object.entries(changedFields ?? {})) {
    if (!isApplicable(field)) continue;
    const [group, key] = field.split(".");
    if (!group || !key || out[group] == null) continue;
    out[group] = { ...out[group], [key]: value };
  }
  return out;
}
