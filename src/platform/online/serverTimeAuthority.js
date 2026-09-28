// ============================================================================
//  platform/online/serverTimeAuthority.js — 權威 ServerTime（Online Foundation v1）
//
//  ── 權威在哪裡（先講清楚，這是整份檔案的前提）────────────────────────────────
//  **真正的權威是「伺服器在寫入當下用自己的時鐘重驗」**，不是客戶端這份時鐘。
//  例：扣 Rated 配額時，伺服器用資料庫 `now()` 算伺服器日，不收客戶端送的日期。
//  客戶端同步出來的時鐘只用來**顯示與預判**（入口開不開、今天還剩幾場）；
//  就算玩家改了前端程式，也只能騙過自己的畫面，騙不過寫入。
//  ⇒ `SERVER_TIME_POLICY.clientClockIsAdvisory = true`。
//
//  ── 客戶端怎麼同步（NTP 中點）──────────────────────────────────────────────
//    t0 = 單調時鐘（送出）  →  伺服器回 serverEpochMs  →  t1 = 單調時鐘（收到）
//    伺服器時刻 ≈ serverEpochMs + (現在單調 − (t0+t1)/2)
//  ⚠ 用**單調時鐘**（瀏覽器是 `performance.now()`），**不用 `Date.now()`**：
//    改手機日期不會改變單調時鐘，所以不能拿來重置配額。
//  ⚠ RTT 過大 ⇒ 量測不可信 ⇒ 拒收；同步超過 `maxAgeMs` ⇒ unavailable（要重新同步），
//    不無限外推；單調時鐘倒退 ⇒ unavailable。
//  ⚠ `createServerDayGuard`：重新同步到較早的時刻時，伺服器日**不得倒退**
//    （否則「倒回昨天 → 配額變回昨天那格」）。
//
//  輸出的 `provider` 形狀與 `time/serverClock.js` 的 `createServerClock(provider)` 相容。
//  純函式：不 import React / zustand / localStorage / 任何 Store / 生涯時鐘，不讀裝置時間。
// ============================================================================

export const SERVER_TIME_SAMPLE_VERSION = "ServerTimeSample.v1";

export const SERVER_TIME_POLICY = Object.freeze({
  /** 往返超過這個值，量測誤差可能大過容忍範圍 ⇒ 拒收。 */
  maxRttMs: 5000,
  /** 同步多久之後必須重新同步。過期 ⇒ unavailable，不外推。 */
  maxAgeMs: 6 * 60 * 60 * 1000,
  clientClockIsAdvisory: true,
  authoritativeCheck: "server-side-at-write",
});

const fin = (v) => (typeof v === "number" && Number.isFinite(v));

/**
 * 一次同步取樣。
 * @param {object} p
 * @param {number} p.serverEpochMs   伺服器回傳的時刻（例如 `select public.server_time()`）
 * @param {number} p.sentAtMono      送出請求時的單調時鐘
 * @param {number} p.receivedAtMono  收到回應時的單調時鐘
 * @param {string} p.issuedBy        時間來源（例如 "db:now()"）
 */
export function createServerTimeSample({ serverEpochMs, sentAtMono, receivedAtMono, issuedBy } = {}) {
  const errors = [];
  if (!fin(serverEpochMs)) errors.push({ code: "server_epoch", message: "缺少伺服器時刻" });
  if (!fin(sentAtMono) || !fin(receivedAtMono)) errors.push({ code: "mono", message: "缺少單調時鐘量測" });
  else if (receivedAtMono < sentAtMono) errors.push({ code: "mono_order", message: "收到時刻早於送出時刻" });
  else if (receivedAtMono - sentAtMono > SERVER_TIME_POLICY.maxRttMs) {
    errors.push({ code: "rtt", message: `往返 ${receivedAtMono - sentAtMono}ms 超過上限，量測不可信` });
  }
  if (!issuedBy || typeof issuedBy !== "string") errors.push({ code: "issuer", message: "缺少時間來源" });
  if (errors.length) return { ok: false, sample: null, errors };
  return {
    ok: true,
    errors: [],
    sample: Object.freeze({
      schema: SERVER_TIME_SAMPLE_VERSION,
      serverEpochMs, sentAtMono, receivedAtMono,
      rttMs: receivedAtMono - sentAtMono,
      issuedBy,
    }),
  };
}

/**
 * 由一次取樣建出同步時鐘。
 * @param {{sample:object|null, monotonicNow:() => number}} p
 * @returns {{ available:boolean, sample:object|null, provider:{kind:string, now:() => number|null}|null }}
 */
export function createSyncedServerClock({ sample = null, monotonicNow = null } = {}) {
  if (!sample || sample.schema !== SERVER_TIME_SAMPLE_VERSION || typeof monotonicNow !== "function") {
    return { available: false, sample: null, provider: null };
  }
  const anchorMono = (sample.sentAtMono + sample.receivedAtMono) / 2;
  const now = () => {
    const m = monotonicNow();
    if (!fin(m)) return null;
    if (m < sample.receivedAtMono) return null;                       // 單調時鐘倒退 ⇒ 不信任
    if (m - sample.receivedAtMono > SERVER_TIME_POLICY.maxAgeMs) return null;   // 過期 ⇒ 要重新同步
    return sample.serverEpochMs + (m - anchorMono);
  };
  return {
    available: true,
    sample,
    provider: Object.freeze({ kind: `synced:${sample.issuedBy}`, now }),
  };
}

/**
 * 伺服器日守衛：只准前進。重新同步到較早時刻時，回報的伺服器日夾在已觀測到的最大值。
 * ⚠ 這只擋客戶端的顯示／預判；伺服器寫入時用自己的時鐘，本來就不會倒退。
 */
export function createServerDayGuard() {
  let max = null;
  let rejected = 0;
  return {
    observe(day) {
      if (!Number.isInteger(day)) return max;
      if (max === null || day >= max) { max = day; return max; }
      rejected += 1;
      return max;
    },
    get max() { return max; },
    get rejectedRegressions() { return rejected; },
  };
}
