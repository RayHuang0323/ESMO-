// ============================================================================
//  platform/mastery/tacticVariant.js — TacticVariant.v1（V7-2.9 / Task 4）
//
//  ── Variant 不是新戰術 ────────────────────────────────────────────────────
//  它是**既有戰術的特化**：同一個 `tacticId`、同一份 `MobaTacticConfig` 契約、
//  同一支 `toEngineTactic()`。所以沒有第二套 tactic system，
//  BASIC 的 m1–m8 也一個都不會被鎖住。
//
//  ── 為什麼不用「delta 加總 = 0」證明 sidegrade ────────────────────────────
//  那個數字只是看起來嚴謹。`macro.aggression` 動 0.1 與
//  `objectives.dragonPriority` 動 0.1 對勝負的影響**不等權，也不線性**，
//  加起來等於零證明不了任何事。
//
//  改成**宣告式的取捨契約**：變體必須自己說出「這個改動買到什麼、付出什麼」，
//  而且**每一個被改的欄位都要被某條軸認領**。verifier 能鎖的是**結構**：
//    · benefit 與 cost 必須同時存在
//    · 不得所有改動都朝同一個方向
//    · 沒有任何欄位是「沒人認領」的（那就是偷偷加強）
//    · 位移不得超出安全 envelope
//    · FORBIDDEN 欄位零修改、`tacticId` 不可改
//
//  ⚠ **這只證明「結構上不是純升級」，不證明勝率公平。**
//    真正的 gameplay sidegrade 需要大樣本實測證據。那套 evidence 契約
//    （`CalibrationEvidence.v1`）住在 `v7/fast-calibration` 的 Online CBR 線上，
//    **不在本 release**。在證據回來之前任何變體都**不得標為已平衡**——
//    這一點寫在這裡，是為了不讓下一個人誤讀 verifier 全綠。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { mobaTacticById, validateMobaTacticConfig } from "../contracts/MobaTacticConfig.js";
import { DOCTRINE, doctrineOfTactic } from "./doctrine.js";

export const TACTIC_VARIANT_VERSION = "TacticVariant.v1";

/**
 * 可以被變體調整的欄位。**清單來自 `toEngineTactic()` 的實際讀取**——
 * 只有真的會進引擎的欄位才准動。
 */
export const ALLOWED_VARIANT_FIELDS = Object.freeze([
  "macro.aggression", "macro.riskTolerance", "macro.grouping", "macro.splitPush", "macro.tempo",
  "objectives.dragonPriority", "objectives.baronPriority", "objectives.towerPriority", "objectives.invadePriority",
  "economy.supportRoamRate",
  "lanePlan.top", "lanePlan.jungle", "lanePlan.mid", "lanePlan.adc", "lanePlan.support",
]);

/**
 * 禁止變體修改的欄位。
 *
 * ⚠ 後面那一段（未映射欄位）是本檔最重要的一條規則：`toEngineTactic()`
 *   **根本不讀** `macro.earlyGame/midGame/lateGame`、`heraldPriority`、
 *   `carryPriority`、`jungleResourceShare`、`vision.*`。讓變體去動它們，
 *   玩家會看到一個「不一樣」的戰術，而引擎的行為一模一樣——
 *   那是**假選擇**，是這種系統最容易犯、也最難被發現的謊。
 */
export const FORBIDDEN_VARIANT_FIELDS = Object.freeze([
  //  身分與判準
  "tacticId", "evidence", "fit",
  //  未映射到引擎的欄位（改了玩家也感覺不到）
  "macro.earlyGame", "macro.midGame", "macro.lateGame",
  "objectives.heraldPriority",
  "economy.carryPriority", "economy.jungleResourceShare",
  "vision.river", "vision.enemyJungle", "vision.objectiveSetup",
]);

/**
 * 單一數值欄位相對 base 的最大位移。
 * ⚠ **這不是平衡保證**，只是防止一個變體把某個旋鈕轉到底。
 */
export const FIELD_ENVELOPE = 0.2;

/** enum 欄位：換就是換，不佔位移預算，但每個變體最多換兩項（避免變成另一個戰術）。 */
export const ENUM_FIELDS = Object.freeze([
  "macro.tempo", "lanePlan.top", "lanePlan.jungle", "lanePlan.mid", "lanePlan.adc", "lanePlan.support",
]);
export const MAX_ENUM_SWAPS = 2;

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

/**
 * 第一批變體。**刻意只有三個**——在「宣告式取捨」這套規則好不好玩還沒被
 * 驗證之前做九個，是在放大一個未驗證的假設。三條 doctrine 各一個，
 * 讓每一條都有東西可解鎖，不會出現「選了流派卻沒東西拿」。
 */
export const TACTIC_VARIANTS = Object.freeze([
  Object.freeze({
    variantId: "m1_measured_siege",
    baseTacticId: "m1",
    doctrine: DOCTRINE.TEMPO,
    name: "穩健速推",
    desc: "一樣快，但留得住撤退空間——代價是推塔壓力鬆掉一截",
    benefitAxes: Object.freeze([
      Object.freeze({ id: "retreat_room", label: "撤退容錯", fields: Object.freeze(["macro.riskTolerance"]) }),
    ]),
    costAxes: Object.freeze([
      Object.freeze({ id: "siege_pressure", label: "推塔壓力", fields: Object.freeze(["objectives.towerPriority"]) }),
    ]),
    //  riskTolerance 0.6 → 0.45（撤退門檻變寬）；towerPriority 0.9 → 0.75（推塔權重下降）
    changedFields: Object.freeze({ "macro.riskTolerance": 0.45, "objectives.towerPriority": 0.75 }),
    rationale: "速推流輸掉的局多半是壓過頭被反打；這個變體把那條線往回收，換來的是滾雪球慢一點。",
  }),
  Object.freeze({
    variantId: "m4_contested_stack",
    baseTacticId: "m4",
    doctrine: DOCTRINE.CONTROL,
    name: "爭奪型龍堆",
    desc: "願意為龍開戰，換來的是野區更容易被入侵",
    benefitAxes: Object.freeze([
      Object.freeze({ id: "dragon_contest", label: "龍區爭奪", fields: Object.freeze(["macro.aggression"]) }),
    ]),
    costAxes: Object.freeze([
      Object.freeze({ id: "team_cohesion", label: "抱團程度", fields: Object.freeze(["macro.grouping"]) }),
    ]),
    //  aggression 0.4 → 0.55（更敢打）；grouping 0.7 → 0.55（陣型更散）
    changedFields: Object.freeze({ "macro.aggression": 0.55, "macro.grouping": 0.55 }),
    rationale: "龍堆運營怕的是對手不給龍；這個變體讓你搶得起來，代價是隊伍不再永遠站在一起。",
  }),
  Object.freeze({
    variantId: "m8_early_footing",
    baseTacticId: "m8",
    doctrine: DOCTRINE.ADAPTIVE,
    name: "穩健起手",
    desc: "打野改為 Gank 建立前期立足點，代價是巴龍節奏被推遲",
    benefitAxes: Object.freeze([
      Object.freeze({ id: "early_footing", label: "前期立足", fields: Object.freeze(["lanePlan.jungle"]) }),
    ]),
    costAxes: Object.freeze([
      Object.freeze({ id: "baron_tempo", label: "巴龍節奏", fields: Object.freeze(["objectives.baronPriority"]) }),
    ]),
    //  jungle farm → gank（enum 換一項）；baronPriority 0.75 → 0.6
    changedFields: Object.freeze({ "lanePlan.jungle": "gank", "objectives.baronPriority": 0.6 }),
    rationale: "後期決戰最痛的是前期被打崩就沒有後期；這個變體買前期，賣掉一部分巴龍主動權。",
  }),
]);

/**
 * 驗證一個變體。**結構性檢查**，不宣稱平衡。
 *
 * @returns {{ok:boolean, errors:Array<{code:string,message:string}>}}
 */
export function validateVariant(v) {
  const errors = [];
  const bad = (code, message) => errors.push({ code, message });

  if (!v || typeof v !== "object") return { ok: false, errors: [{ code: "invalid", message: "變體不是物件" }] };
  if (typeof v.variantId !== "string" || !v.variantId) bad("variantId", "缺 variantId");

  const base = mobaTacticById(v.baseTacticId);
  if (!base) bad("base", `沒有這個基礎戰術：${v.baseTacticId}`);

  //  變體必須屬於它 base 的流派——否則「選了流派卻拿到別派的變體」。
  const baseDoctrine = doctrineOfTactic("moba", v.baseTacticId);
  if (base && v.doctrine !== baseDoctrine) {
    bad("doctrine", `變體流派 ${v.doctrine} 與基礎戰術的流派 ${baseDoctrine} 不符`);
  }

  const benefits = Array.isArray(v.benefitAxes) ? v.benefitAxes : [];
  const costs = Array.isArray(v.costAxes) ? v.costAxes : [];
  //  ⚠ 核心規則：買到什麼、付出什麼，兩邊都要有。缺一邊就是純升級或純削弱。
  if (benefits.length === 0) bad("benefit", "變體必須宣告至少一條 benefitAxes");
  if (costs.length === 0) bad("cost", "變體必須宣告至少一條 costAxes——沒有代價的不是 sidegrade");

  const changed = (v.changedFields && typeof v.changedFields === "object" && !Array.isArray(v.changedFields))
    ? v.changedFields : null;
  if (!changed || Object.keys(changed).length === 0) {
    bad("changed", "變體必須實際改動至少一個欄位");
    return { ok: false, errors };
  }

  //  每個被改的欄位都要被某條軸認領 —— 沒人認領的改動就是偷偷加強。
  const claimed = new Map();
  for (const [kind, axes] of [["benefit", benefits], ["cost", costs]]) {
    for (const ax of axes) {
      for (const f of (Array.isArray(ax?.fields) ? ax.fields : [])) {
        if (claimed.has(f)) bad("double_claim", `欄位 ${f} 同時被兩條軸認領`);
        claimed.set(f, kind);
      }
    }
  }
  for (const f of Object.keys(changed)) {
    if (!claimed.has(f)) bad("unclaimed", `欄位 ${f} 被改動但沒有任何軸認領它`);
  }
  for (const f of claimed.keys()) {
    if (!(f in changed)) bad("axis_no_change", `軸宣告了 ${f}，但 changedFields 沒有動它`);
  }
  //  ⚠ 不得所有改動都在同一個方向：至少一個欄位服務 benefit、至少一個服務 cost。
  const kinds = new Set([...Object.keys(changed)].map((f) => claimed.get(f)).filter(Boolean));
  if (!(kinds.has("benefit") && kinds.has("cost"))) {
    bad("one_direction", "所有改動都朝同一個方向——這是升級或削弱，不是 sidegrade");
  }

  for (const [field, value] of Object.entries(changed)) {
    if (FORBIDDEN_VARIANT_FIELDS.includes(field)) {
      bad("forbidden", `${field} 不得被變體修改（未映射到引擎或屬於戰術身分）`);
      continue;
    }
    if (!ALLOWED_VARIANT_FIELDS.includes(field)) {
      bad("not_allowed", `${field} 不在 ALLOWED_VARIANT_FIELDS 之內`);
      continue;
    }
    if (!base) continue;
    const before = get(base, field);
    if (ENUM_FIELDS.includes(field)) {
      if (typeof value !== "string" || !value) bad("enum_value", `${field} 必須是非空字串`);
      if (value === before) bad("no_op", `${field} 與基礎戰術相同，這個改動沒有意義`);
    } else {
      if (!Number.isFinite(value)) bad("numeric_value", `${field} 必須是數字`);
      else if (Math.abs(value - Number(before)) > FIELD_ENVELOPE + 1e-9) {
        bad("envelope", `${field} 位移 ${Math.abs(value - Number(before)).toFixed(3)} 超出上限 ${FIELD_ENVELOPE}`);
      } else if (value === Number(before)) bad("no_op", `${field} 與基礎戰術相同，這個改動沒有意義`);
    }
  }

  const enumSwaps = Object.keys(changed).filter((f) => ENUM_FIELDS.includes(f)).length;
  if (enumSwaps > MAX_ENUM_SWAPS) bad("enum_swaps", `enum 欄位換了 ${enumSwaps} 項，超過上限 ${MAX_ENUM_SWAPS}——再多就是另一個戰術了`);

  //  套用之後仍必須是一份合法的 MobaTacticConfig。
  if (base && errors.length === 0) {
    const applied = applyVariant(base, v);
    const mv = validateMobaTacticConfig(applied);
    if (!mv.ok) bad("applied_invalid", `套用後不是合法戰術：${mv.errors.join("; ")}`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 把變體套到基礎戰術上，回傳**新的** config。
 * ⚠ 深拷貝後才改——絕不修改傳入的 base（那是 `MOBA_TACTICS` 的共用物件）。
 */
export function applyVariant(baseConfig, v) {
  const out = structuredClone(baseConfig);
  for (const [field, value] of Object.entries(v?.changedFields ?? {})) {
    if (FORBIDDEN_VARIANT_FIELDS.includes(field) || !ALLOWED_VARIANT_FIELDS.includes(field)) continue;
    const [group, key] = field.split(".");
    if (!group || !key || out[group] == null) continue;
    out[group] = { ...out[group], [key]: value };
  }
  //  變體有自己的顯示名稱，但**沿用 base 的 tacticId**——引擎與賽果看到的
  //  仍然是同一個戰術，所以 `evidence` 判定、`mobaTacticById` 與所有既有
  //  消費端都不需要知道變體存在。
  out.variantId = v?.variantId ?? null;
  out.variantName = v?.name ?? null;
  return out;
}

export const variantById = (id) => TACTIC_VARIANTS.find((v) => v.variantId === id) ?? null;
export const variantsOfDoctrine = (doctrineId) => TACTIC_VARIANTS.filter((v) => v.doctrine === doctrineId);
export const variantsOfBaseTactic = (tacticId) => TACTIC_VARIANTS.filter((v) => v.baseTacticId === tacticId);
