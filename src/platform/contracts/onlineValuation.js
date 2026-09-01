// ============================================================================
//  platform/contracts/onlineValuation.js — OnlineValuation.v1（V7-2.9 邊界）
//
//  ── 這一層為什麼要存在 ────────────────────────────────────────────────────
//  V7-2.8 的 TD-52 大樣本量到一件事：`squadCostOf()` 只吃 stats，
//  而**同一組 stats 換一個席位，真實引擎的勝率可以從 0% 變成 90%**
//  （mirage `t_apalace`：星星在 entry 90.8%、在 awp 1.7%；
//   inferno `t_banana`：在 entry 0.0%、在 support 88.3%，各 n=120）。
//  ⇒ 這**不是參數問題**（沒有任何 `starExcess` 純量能表達 0%↔90%），
//    是**模型形狀問題**。
//
//  但「定價」不能因此變成兩套——那會直接違反 `squadSnapshot.js` 的紅線
//  「定價與模擬吃同一份快照」。所以這一層做的是**分離**而不是取代：
//
//    · `squadCostOf()`（`onlineCbr.js`）維持原樣，繼續是**唯一定價來源**。
//    · 本檔是**估值邊界**：把「這支隊伍會打得多好」與「這支隊伍要收多少錢」
//      分成兩個概念，讓未來的 role / context 資訊有地方可放。
//
//  ── 本版**刻意什麼都不定價** ─────────────────────────────────────────────
//  `OnlineValuation.v1` 的 `estimatedPower` **就是 `squadCostOf()` 的值**，
//  一個數字都沒有變。本版唯一的工作是：
//    ① 把那個純量拆成**可解釋的 components**（且必須能還原成同一個數字）；
//    ② **接受**但**不定價** role assignment 與 match context；
//    ③ 用 `confidence` 誠實說出「哪些已知會影響勝負的因素沒有被定價」。
//
//  ⚠ 為什麼要接受卻不定價：AWP slot 崩潰（mirage 1.7% / inferno 0.0%）
//    尚未 triage。若現在就把 role 權重校準到引擎，而該行為其實是缺陷，
//    等於把缺陷編進定價——這與先前差點拿「被戰術擁有權汙染的數字」
//    去定 `starExcess` 是同一個陷阱。見 `cbrDecisionGate.js`。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { snapshotPowersOf, snapshotStrengthOf, validateSquadSnapshot } from "./squadSnapshot.js";
import { COST_WEIGHTS, ONLINE_CBR_VERSION, squadCostOf } from "./onlineCbr.js";

export const ONLINE_VALUATION_VERSION = "OnlineValuation.v1";

/** 估值的校準狀態。**沒有「已校準」以外的狀態可以被當成可信。** */
export const VALUATION_STATUS = Object.freeze({
  /** 從未對真實引擎校準過。V7-2.9 的所有估值都是這個。 */
  UNCALIBRATED: "uncalibrated",
  /** 已對真實引擎校準，但證據不完整（樣本／context 覆蓋不足）。 */
  PROVISIONAL: "provisional",
  /** 已對真實引擎校準且證據符合 `CalibrationEvidence.v1`。 */
  CALIBRATED: "calibrated",
});

/**
 * **已知會顯著影響勝負、但本版沒有定價**的因素。
 *
 * 這張表不是待辦清單，是**估值的免責聲明**：任何拿 `estimatedPower`
 * 去做配對決策的人，都必須知道這些東西沒有被算進去。
 * 數字全部來自 V7-2.8 的實測（`artifacts/cbr-fairness/`）。
 */
export const UNMODELLED_FACTORS = Object.freeze([
  Object.freeze({
    id: "slot_role",
    label: "星星所在的席位／角色",
    observedSwingPp: 89,
    evidence: "td52_slotrot_{mirage,inferno}.json：同圖同戰術同成本，星星從 entry 換到 awp，90.8% → 1.7%",
  }),
  Object.freeze({
    id: "tactic",
    label: "戰術選擇（決定哪個角色是關鍵位）",
    observedSwingPp: 70,
    evidence: "td52_alt_inferno_*.json：inferno 圖內 t_banana 0.5% → t_aexec 70.8%",
  }),
  Object.freeze({
    id: "tactic_ownership",
    label: "戰術擁有權綁隊伍身分、中場換邊不交換",
    observedSwingPp: 19,
    evidence: "td52_diag.json：同陣容 t_apalace vs c_std 69.3%，兩隊同戰術 49.8%",
  }),
]);

/**
 * 把 `squadCostOf()` 拆成可解釋的組成。
 *
 * ⚠ **這裡不得出現第二套權重。** 用的是 `onlineCbr.js` 匯出的同一份
 * `COST_WEIGHTS`，而且拆出來的 components **必須能還原成 `squadCostOf()`
 * 的同一個數字**——還原不了就代表這裡偷偷變成了第二個模型，直接拋錯。
 */
function componentsOf(snapshot) {
  const strength = snapshotStrengthOf(snapshot);
  const powers = snapshotPowersOf(snapshot);
  if (strength == null || !powers.length) return null;
  const mean = powers.reduce((a, b) => a + b, 0) / powers.length;
  const starExcess = Math.max(0, powers[0] - mean);
  return [
    Object.freeze({
      id: "team", label: "整隊實力",
      raw: strength, weight: COST_WEIGHTS.team, value: strength * COST_WEIGHTS.team,
      source: "squadSnapshot.strength（teamStrength）",
    }),
    Object.freeze({
      id: "starExcess", label: "最強一人超出隊均的溢價",
      raw: starExcess, weight: COST_WEIGHTS.starExcess, value: starExcess * COST_WEIGHTS.starExcess,
      source: "squadSnapshot.seats[].power",
    }),
  ];
}

/**
 * 驗證（但不定價）一份 role assignment。
 *
 * 形狀是 `{ [seat]: roleId }`，席位必須是快照裡真的有的席位。
 * ⚠ 本版**只檢查形狀、只記錄**，不讓它影響 `estimatedPower` 一分一毫。
 */
function acceptRoleAssignment(snapshot, roleAssignment) {
  if (roleAssignment == null) return { received: false, seats: null, errors: [] };
  if (typeof roleAssignment !== "object" || Array.isArray(roleAssignment)) {
    return { received: true, seats: null, errors: [{ code: "role_shape", message: "roleAssignment 必須是 { seat: roleId } 物件" }] };
  }
  const known = new Set(Object.keys(snapshot?.seats ?? {}));
  const errors = [];
  for (const [seat, role] of Object.entries(roleAssignment)) {
    if (!known.has(seat)) errors.push({ code: "role_seat", message: `快照沒有這個席位：${seat}` });
    else if (typeof role !== "string" || !role) errors.push({ code: "role_value", message: `席位 ${seat} 的 role 必須是非空字串` });
  }
  return { received: true, seats: Object.keys(roleAssignment).sort(), errors };
}

/**
 * 驗證（但不定價）一份 match context。
 *
 * 目前只認得 `{ mapKey, tacticId }`，兩個都是 optional。
 * ⚠ 同樣**只記錄不定價**——理由見檔頭與 `cbrDecisionGate.js`。
 */
function acceptMatchContext(matchContext) {
  if (matchContext == null) return { received: false, keys: null, errors: [] };
  if (typeof matchContext !== "object" || Array.isArray(matchContext)) {
    return { received: true, keys: null, errors: [{ code: "context_shape", message: "matchContext 必須是物件" }] };
  }
  const errors = [];
  for (const k of ["mapKey", "tacticId"]) {
    if (matchContext[k] != null && typeof matchContext[k] !== "string") {
      errors.push({ code: "context_value", message: `${k} 必須是字串` });
    }
  }
  return { received: true, keys: Object.keys(matchContext).sort(), errors };
}

/**
 * 估一份快照的戰力。
 *
 * @param {object}  p
 * @param {object}  p.snapshot        `SquadSnapshot.v1`（唯一數值來源）
 * @param {object=} p.roleAssignment  `{ [seat]: roleId }`，**接受但不定價**
 * @param {object=} p.matchContext    `{ mapKey?, tacticId? }`，**接受但不定價**
 * @returns {{ok:boolean, errors:Array, valuation:object|null}}
 */
export function valuateSquad({ snapshot, roleAssignment = null, matchContext = null } = {}) {
  const v = validateSquadSnapshot(snapshot);
  if (!v.ok) return { ok: false, errors: v.errors, valuation: null };

  const cost = squadCostOf(snapshot);
  const components = componentsOf(snapshot);
  if (cost == null || !components) {
    return { ok: false, errors: [{ code: "no_cost", message: "這份快照算不出成本" }], valuation: null };
  }

  //  ⚠ 守門：components 必須還原成權威的那一個數字。還原不了 ⇒ 這裡已經
  //    變成第二個成本模型，那是 squadSnapshot.js 明文禁止的事。
  const rebuilt = round2(components.reduce((a, c) => a + c.value, 0));
  if (rebuilt !== cost) {
    throw new Error(`[VALUATION_SECOND_MODEL] components ${rebuilt} !== squadCostOf ${cost}`);
  }

  const role = acceptRoleAssignment(snapshot, roleAssignment);
  const ctx = acceptMatchContext(matchContext);
  const inputErrors = [...role.errors, ...ctx.errors];
  if (inputErrors.length) return { ok: false, errors: inputErrors, valuation: null };

  return {
    ok: true,
    errors: [],
    valuation: Object.freeze({
      schema: ONLINE_VALUATION_VERSION,
      valuationVersion: ONLINE_VALUATION_VERSION,
      cbrVersion: ONLINE_CBR_VERSION,
      snapshotId: snapshot.snapshotId,
      gameMode: snapshot.mode,

      //  本版就是成本本身——一個數字都沒有變。
      estimatedPower: cost,

      components: Object.freeze(components),

      diagnostics: Object.freeze({
        //  收到了什麼、有沒有拿去定價。後者永遠是 false，直到 decision gate 開啟。
        roleAssignment: Object.freeze({ received: role.received, seats: role.seats, priced: false }),
        matchContext: Object.freeze({ received: ctx.received, keys: ctx.keys, priced: false }),
        pricedInputs: Object.freeze(["snapshot.strength", "snapshot.seats[].power"]),
      }),

      confidence: Object.freeze({
        status: VALUATION_STATUS.UNCALIBRATED,
        //  ⚠ 不編一個看起來像信心的數字。沒校準就是沒有。
        level: null,
        evidenceId: null,
        unmodelledFactors: UNMODELLED_FACTORS,
        note: "estimatedPower 未對真實引擎校準；已知 slot/role 與 tactic 可造成 70–89pp 擺盪，兩者皆未定價",
      }),
    }),
  };
}

/** 驗證一筆估值（權威側收到之後也跑一次）。 */
export function validateValuation(valuation) {
  const errors = [];
  if (!valuation || typeof valuation !== "object") {
    return { ok: false, errors: [{ code: "invalid", message: "估值不是物件" }] };
  }
  if (valuation.schema !== ONLINE_VALUATION_VERSION) {
    errors.push({ code: "schema", message: `schema 必須為 ${ONLINE_VALUATION_VERSION}` });
  }
  if (!Number.isFinite(valuation.estimatedPower)) {
    errors.push({ code: "power", message: "estimatedPower 必須是數字" });
  }
  if (!Array.isArray(valuation.components) || valuation.components.length === 0) {
    errors.push({ code: "components", message: "估值必須帶可解釋的 components——配對不得只依賴一個無法解釋的純量" });
  }
  if (!Object.values(VALUATION_STATUS).includes(valuation.confidence?.status)) {
    errors.push({ code: "confidence", message: "估值必須帶 confidence.status" });
  }
  if (valuation.confidence?.status === VALUATION_STATUS.UNCALIBRATED && valuation.confidence?.level != null) {
    errors.push({ code: "confidence_level", message: "未校準的估值不得帶 confidence.level" });
  }
  return { ok: errors.length === 0, errors };
}

function round2(x) { return Math.round(x * 100) / 100; }
