// ============================================================================
//  platform/contracts/calibrationEvidence.js — CalibrationEvidence.v1（V7-2.9）
//
//  ── 這份契約在防什麼 ──────────────────────────────────────────────────────
//  V7 這條線上被「用錯的證據調參數」咬過三次，每次的成因都是**證據沒有
//  記錄自己是在什麼條件下產生的**：
//
//    ① `starExcess = 0.05` 是對 `simulateFixture` 校準的，但那份證據沒有寫
//       「校準對象不是真實引擎」⇒ 後來被當成已校準值沿用。
//    ② TD-53 宣稱槽位偏差已歸零，證據是 n=30／CI ±17.9pp，但那份證據沒有
//       記 CI ⇒ 「50.0%」被讀成定論，實際上它連 69% 都排除不掉。
//    ③ TD-52 第一版 cost delta 疊著 +19.25pp 的戰術擁有權優勢，因為證據沒有
//       記 tactic ⇒ 看不出兩隊拿的是不同戰術。
//
//  ⇒ 一份證據若少了下面任何一個欄位，就**無法判斷它能不能用來調參數**。
//    所以這裡把它們列成硬性必填，缺一即 invalid。
//
//  ⚠ 本檔**不驗證數字對不對**——那是 verifier 的事。它只保證
//    「這份證據描述得夠清楚，讓人能判斷它適不適用」。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const CALIBRATION_EVIDENCE_VERSION = "CalibrationEvidence.v1";

/**
 * 必填欄位。**每一個都對應一次真實的踩坑**，不是為了完整而完整。
 */
export const REQUIRED_FIELDS = Object.freeze([
  //  ── 這份證據是拿什麼跑出來的 ──
  Object.freeze({ key: "runtimeSha", why: "舊 runtime 的證據不得用來調新 runtime 的參數" }),
  Object.freeze({ key: "valuationVersion", why: "估值版本換了，效應量就不可比" }),
  Object.freeze({ key: "harnessVersion", why: "harness 修過三個對齊 bug，版本決定證據可信度" }),
  //  ── 在什麼條件下跑的 ──
  Object.freeze({ key: "gameMode", why: "CS 與 MOBA 的成本敏感度差一個量級" }),
  Object.freeze({ key: "map", why: "校準格必須具名；並非所有 map/tactic 組合都 bounded" }),
  Object.freeze({ key: "tactic", why: "戰術擁有權可造成 19pp 偏差；不記就看不出兩隊是否同戰術" }),
  Object.freeze({ key: "lineup", why: "role/席位配置可造成 89pp 擺盪，是目前最大的單一因素" }),
  Object.freeze({ key: "seedPolicy", why: "換 seed 讓結果變好看是最容易的作弊；seed 規則必須固定且寫明" }),
  //  ── 量到什麼 ──
  Object.freeze({ key: "sampleN", why: "n=30 與 n=800 的結論強度差一個級別" }),
  Object.freeze({ key: "winRate", why: "點估" }),
  Object.freeze({ key: "ci95", why: "沒有 CI 的點估會被讀成定論——TD-53 就是這樣結錯案" }),
  Object.freeze({ key: "effectSizePp", why: "與 50% 的距離，配對政策真正在意的量" }),
  Object.freeze({ key: "significant", why: "顯著性必須是證據自己宣告的，不由讀者事後判斷" }),
  //  ── 這份證據是誰、什麼時候 ──
  Object.freeze({ key: "evidenceId", why: "參數變更必須能指回具體某一份證據" }),
  Object.freeze({ key: "timestamp", why: "與 runtimeSha 交叉比對，抓出「跑在舊碼上的新證據」" }),
]);

export const REQUIRED_KEYS = Object.freeze(REQUIRED_FIELDS.map((f) => f.key));

/**
 * 驗證一份 calibration evidence。
 *
 * @param {object} evidence
 * @returns {{ok:boolean, errors:Array, missing:Array<string>}}
 */
export function validateCalibrationEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { ok: false, missing: [...REQUIRED_KEYS], errors: [{ code: "invalid", message: "證據不是物件" }] };
  }
  const errors = [];
  if (evidence.schema !== CALIBRATION_EVIDENCE_VERSION) {
    errors.push({ code: "schema", message: `schema 必須為 ${CALIBRATION_EVIDENCE_VERSION}` });
  }
  const missing = REQUIRED_KEYS.filter((k) => evidence[k] == null);
  for (const k of missing) {
    const why = REQUIRED_FIELDS.find((f) => f.key === k)?.why ?? "";
    errors.push({ code: "missing", message: `缺少必填欄位 ${k}——${why}` });
  }
  //  型別只做最低限度的檢查：這一層要擋的是「沒記」，不是「記錯」。
  if (evidence.sampleN != null && !(Number.isInteger(evidence.sampleN) && evidence.sampleN > 0)) {
    errors.push({ code: "sampleN", message: "sampleN 必須是正整數" });
  }
  for (const k of ["winRate", "ci95"]) {
    if (evidence[k] != null && !(Number.isFinite(evidence[k]) && evidence[k] >= 0 && evidence[k] <= 1)) {
      errors.push({ code: k, message: `${k} 必須是 0–1 的比例` });
    }
  }
  if (evidence.significant != null && typeof evidence.significant !== "boolean") {
    errors.push({ code: "significant", message: "significant 必須是布林值" });
  }
  return { ok: errors.length === 0, errors, missing };
}

/**
 * 一份證據能不能拿來調參數。
 *
 * ⚠ 「格式合法」與「可以用來調參」是兩回事：格式合法只代表它描述清楚了。
 *   還要再過三關——不顯著、樣本太小、或 runtime 對不上，都不能用。
 *
 * @param {object} evidence
 * @param {{runtimeSha?:string, minSampleN?:number}} expectation
 */
export function usableForTuning(evidence, { runtimeSha = null, minSampleN = 385 } = {}) {
  const v = validateCalibrationEvidence(evidence);
  if (!v.ok) return { usable: false, reasons: ["證據格式不完整：" + v.missing.join(", ")] };
  const reasons = [];
  if (runtimeSha && evidence.runtimeSha !== runtimeSha) {
    reasons.push(`證據跑在 ${evidence.runtimeSha}，目前 runtime 是 ${runtimeSha}`);
  }
  //  385 ≈ p=0.5 時 ±5pp 所需的樣本量。低於它，效應量分不開 5pp 的差距。
  if (evidence.sampleN < minSampleN) {
    reasons.push(`樣本 ${evidence.sampleN} 不足（±5pp 需 ${minSampleN}）`);
  }
  if (evidence.significant !== true) {
    reasons.push("效應未達顯著");
  }
  return { usable: reasons.length === 0, reasons };
}
