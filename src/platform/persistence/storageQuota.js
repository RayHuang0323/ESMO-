// ============================================================================
//  persistence/storageQuota.js — BP-9 P0-A：存檔是不是因為瀏覽器配額寫不進去
//
//  ⚠ 只用來決定提示怎麼說，不用來決定能不能存：能不能存只看真的寫入結果。
//  ⚠ 各瀏覽器的配額不一樣（Chrome 實測 5,242,880 字元），所以不能只靠字元數，
//    寫入時遇到配額錯誤就記下來。記到重新整理為止，重新整理後下一次寫入失敗會再記。
//  ⚠ 本檔不 import 任何東西：寫入的地方都要能用它，不能繞出循環 import。
// ============================================================================

let hit = false;

/** 各瀏覽器的配額錯誤：Chrome／Safari `QuotaExceededError`（code 22），舊版 Firefox `NS_ERROR_DOM_QUOTA_REACHED`（code 1014）。 */
export function isQuotaError(e) {
  if (!e) return false;
  if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (e.code === 22 || e.code === 1014) return true;
  return /quota/i.test(String(e.message ?? ""));
}

/** 寫入失敗時呼叫。不是配額錯誤就不記。 */
export function noteWriteError(e) {
  if (isQuotaError(e)) hit = true;
}

export const quotaHit = () => hit;

/** 開新局或讀入另一份存檔時清掉。 */
export function resetQuotaHit() {
  hit = false;
}
