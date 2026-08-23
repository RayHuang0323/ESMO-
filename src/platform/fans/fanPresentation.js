// ============================================================================
//  platform/fans/fanPresentation.js — 粉絲的呈現層 read-model（Fan System F4）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  F0–F2.1 把粉絲的規則做完了，但玩家在畫面上幾乎看不到它。F4 只做呈現：
//  把**已經存在的權威資料**整理成畫面好用的形狀。
//
//  ⚠ **本檔不計算任何粉絲數值。** 不算 fanGain、不查 seasonFanAward 表、
//    不判斷贊助資格（那是 `economy/sponsors.js → sponsorEligibility()` 的事）。
//    它只做兩件事：**相減**與**格式化**。
//    一旦這裡開始「算」，畫面就會有第二套規則，那正是 F1/F2 一路在避免的事。
//
//  ⚠ **本檔不寫任何狀態。** 純函式，不 import Store。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

//  ⚠ `null` / `undefined` / 布林**必須在 `Number()` 之前擋掉**：
//    `Number(null) === 0` 會把「沒有值」悄悄變成「0 粉絲起點」，
//    舊存檔的賽季總結就會顯示假的「本季 +143,000」。
//    （F0 的 `sanitizeFans()` 踩過同一個坑，這裡用同一條規則。）
const finite = (v) => {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  //  `Number("") === 0` 同樣是把「空的」變成 0 —— 空字串不是快照。
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * 粉絲數的顯示格式。萬以上用「N.N萬」，以下用千分位。
 *
 * ⚠ 全站共用同一支 ⇒ Home / 戰隊詳情 / 賽季總結不會出現三種寫法。
 *   需要精確值的地方（例如贊助門檻）直接用 `toLocaleString()`，不要走這裡。
 */
export function formatFans(value) {
  const n = finite(value);
  if (n === null) return "—";
  if (n >= 10000) {
    const wan = n / 10000;
    //  12.8萬 / 143.4萬；整數就不帶小數點（10萬 而不是 10.0萬）
    return `${wan % 1 === 0 ? wan : wan.toFixed(1)}萬`;
  }
  return n.toLocaleString();
}

/**
 * 本季粉絲成長。
 *
 * ── 舊存檔沒有基準是**合法狀態**，不是錯誤 ────────────────────────────────
 * `fansAtSeasonStart` 是 F2 才加的欄位，F2 之前開的賽季沒有它（`null`）。
 * 那代表「這一季沒有起點可比」，**不是 0 成長**。所以：
 *   · 有基準 ⇒ `hasBaseline: true`，畫面顯示「本季 +N」
 *   · 沒基準 ⇒ `hasBaseline: false`，畫面**只顯示總數**，
 *     不顯示 `+0`／`—`／`未知`，也**不得回填** snapshot（那等於編一個
 *     當時不存在的數字）。
 *
 * ── 為什麼不用 `Math.max(delta, 0)` ──────────────────────────────────────
 * Fan v1 不衰減 ⇒ `end < start` 在正確的系統裡不可能發生。
 * 用 `max()` 夾住只會讓那個 bug**永遠看不見**。這裡改成回報 `anomaly: true`，
 * 讓畫面 fail-soft（退回只顯示總數）而驗證器抓得到。
 *
 * @param {{fans:number, fansAtSeasonStart:number|null|undefined}} p
 * @returns {{hasBaseline:boolean, start:number|null, end:number|null,
 *            delta:number|null, anomaly:boolean}}
 */
export function seasonFanGrowth({ fans, fansAtSeasonStart } = {}) {
  const end = finite(fans);
  const start = finite(fansAtSeasonStart);
  if (end === null) return { hasBaseline: false, start: null, end: null, delta: null, anomaly: false };
  //  `null` / `undefined` / 非數字 ⇒ 舊存檔，沒有基準
  if (start === null) return { hasBaseline: false, start: null, end, delta: null, anomaly: false };
  const delta = end - start;
  if (delta < 0) {
    //  資料異常：粉絲不該變少。退回「只顯示總數」，但把旗標傳出去。
    return { hasBaseline: false, start, end, delta, anomaly: true };
  }
  return { hasBaseline: true, start, end, delta, anomaly: false };
}

/**
 * 一個贊助商的門檻呈現。
 *
 * ⚠ **資格判定完全交給 `sponsorEligibility()`**——本檔不重寫
 *   `fans >= reqFans && wins >= reqWins`。這裡只把它的結果排成畫面要的形狀，
 *   讓玩家看得出「差在哪」而不只是「鎖住」。
 *
 * @param {object} sponsor  SPONSORS 之一
 * @param {object} eligibility  `sponsorEligibility(sponsor, ctx)` 的回傳
 * @returns {{fansOk:boolean, winsOk:boolean, ok:boolean,
 *            reqFans:number, reqWins:number,
 *            fansShort:number, winsShort:number,
 *            blockedBy:"none"|"fans"|"wins"|"both"}}
 */
export function sponsorRequirementView(sponsor, eligibility) {
  const reqFans = finite(sponsor?.reqFans) ?? 0;
  const reqWins = finite(sponsor?.reqWins) ?? 0;
  const fansOk = !!eligibility?.fansOk;
  const winsOk = !!eligibility?.winsOk;
  const blockedBy = fansOk && winsOk ? "none" : (!fansOk && !winsOk ? "both" : (!fansOk ? "fans" : "wins"));
  return {
    ok: !!eligibility?.ok,
    fansOk, winsOk, reqFans, reqWins,
    fansShort: finite(eligibility?.fansShort) ?? 0,
    winsShort: finite(eligibility?.winsShort) ?? 0,
    blockedBy,
  };
}
