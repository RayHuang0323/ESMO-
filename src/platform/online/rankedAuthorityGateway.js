// ============================================================================
//  platform/online/rankedAuthorityGateway.js
//    RankedAuthorityGateway.v1 —— Ranked 戰績／每日配額的**後端權威持久化邊界**
//
//  ── 邊界長這樣 ────────────────────────────────────────────────────────────
//    客戶端（瀏覽器）                     │  ranked authority（未來的後端）
//    ─────────────────────────────────────┼──────────────────────────────────
//    getServerTimeSample()   讀           │  資料庫 now()
//    getQuota(mode)          讀           │  ranked_quota（RLS：只讀自己）
//    getRecord(mode)         讀           │  ranked_records（RLS：只讀自己）
//    requestRatedEntry(...)  **請求**     │  伺服器用**自己的**伺服器日判斷、原子扣配額、簽發票券
//                                         │  settleRatedMatch(...)  **只有伺服器有**
//
//  ⚠ 客戶端**沒有任何寫入面**：沒有 setRecord、沒有 submitResult、沒有 resetQuota。
//    勝負由伺服器跑模擬產生，不由客戶端回報 —— 回報勝負的 API 一旦存在，就一定會被偽造。
//  ⚠ `requestRatedEntry` 是請求不是寫入：客戶端只說「我要打一場」，
//    扣不扣、日期算哪天，全部由 authority 用自己的時鐘決定。
//  ⚠ 這些帳本**不進生涯存檔**（`saveBundle` 三份清單都沒有它們）。
//
//  ── 本機 mock authority ────────────────────────────────────────────────────
//  Online Backend Foundation v1 起**不在 src/**：搬到 `tools/lib/localRankedAuthority.mjs`（只給驗收用），
//  正式程式碼不可能把 mock 當成後端接上。真後端（Edge Function＋Postgres）尚未存在。
//
//  純函式／純物件：不 import React / zustand / localStorage / Supabase SDK / 生涯時鐘，不讀裝置時間。
// ============================================================================

export const RANKED_GATEWAY_VERSION = "RankedAuthorityGateway.v1";

/** 客戶端閘道**全部**的方法。多一個就是多一個寫入面。 */
export const RANKED_GATEWAY_METHODS = Object.freeze([
  "getServerTimeSample", "getQuota", "getRecord", "requestRatedEntry",
]);

/** 客戶端閘道上**不得存在**的方法名（出現即拒）。 */
export const FORBIDDEN_CLIENT_METHODS = Object.freeze([
  "setRecord", "putRecord", "writeRecord", "applyResult", "submitResult", "reportResult",
  "setQuota", "writeQuota", "resetQuota", "consumeQuota", "settleRatedMatch", "setLadderRating",
  //  Online Foundation v2A：伺服器權威面（`SERVER_AUTHORITY_INTERFACE.serverOnly`）
  "issueMatchTicket", "signSquadSnapshot", "adjudicateMatch",
]);

export function validateRankedGateway(gw) {
  const errors = [];
  if (!gw || typeof gw !== "object") return { ok: false, errors: [{ code: "invalid", message: "閘道不是物件" }] };
  for (const m of RANKED_GATEWAY_METHODS) {
    if (typeof gw[m] !== "function") errors.push({ code: "missing", message: `閘道缺少 ${m}()` });
  }
  const leaked = FORBIDDEN_CLIENT_METHODS.filter((m) => m in gw);
  if (leaked.length) errors.push({ code: "write_surface", message: `客戶端閘道不得有寫入方法：${leaked.join(", ")}` });
  const extra = Object.keys(gw).filter((k) => !RANKED_GATEWAY_METHODS.includes(k) && typeof gw[k] === "function" && !leaked.includes(k));
  if (extra.length) errors.push({ code: "unknown_method", message: `閘道有契約外的方法：${extra.join(", ")}` });
  return { ok: !errors.length, errors };
}
