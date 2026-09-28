// ============================================================================
//  tools/lib/localRankedAuthority.mjs — **測試用** mock ranked authority（不在 src/，不會進正式 bundle）
//
//  Online Backend Foundation v1：mock 與正式 Online authority 分離。
//  原本放在 `src/platform/online/rankedAuthorityGateway.js`，與正式契約同檔、可被任何畫面 import。
//  搬到 tools/ 之後，正式程式碼**不可能**把它當成後端接上（見 check_online_foundation_v1 的原始碼掃描）。
//
//  它用**同一批伺服器側純函式**（ratedQuota／competitiveRecord）在記憶體裡模擬後端：
//  `kind:"mock-authority"`、`trusted:false`、`persisted:false`。
//  ⚠ 不是 remote E2E：真後端（Edge Function＋Postgres）尚未存在，報告一律標 REMOTE_E2E_NOT_RUN。
//  ⚠ 任何文件與 UI 不得宣稱它有防作弊能力。
// ============================================================================
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { serverDayOf } = await load("src/platform/time/serverClock.js");
const { ratedQuotaOf, consumeRatedQuota } = await load("src/platform/competitive/ratedQuota.js");
const { emptyCompetitiveRecord, createCompetitiveResult, applyCompetitiveResult } = await load("src/platform/competitive/competitiveRecord.js");
const { UNRATED_POLICY } = await load("src/platform/competitive/cbrPipeline.js");

const copy = (v) => JSON.parse(JSON.stringify(v));

/**
 * 本機 mock authority。
 * @param {{serverNowMs:() => number, ratingPolicy?:object}} p
 *   `serverNowMs`：**伺服器**時刻來源（真後端是資料庫 now()；測試注入固定值）。
 */
export function createLocalRankedAuthority({ serverNowMs, ratingPolicy = UNRATED_POLICY } = {}) {
  if (typeof serverNowMs !== "function") throw new Error("createLocalRankedAuthority 需要伺服器時刻來源");
  let quotaState = null;
  let record = emptyCompetitiveRecord();
  const tickets = new Map();      // ticketId → { ticket, settled }
  let seq = 0;
  const today = () => serverDayOf(serverNowMs());

  const descriptor = Object.freeze({ id: "esmo.local-ranked-authority.v1", kind: "mock-authority", trusted: false, persisted: false });

  //  ── 客戶端看得到的：只有讀與請求 ─────────────────────────────────────
  const client = Object.freeze({
    async getServerTimeSample() {
      return { ok: true, serverEpochMs: serverNowMs(), issuedBy: descriptor.id };
    },
    async getQuota(mode) {
      const q = ratedQuotaOf(quotaState, today(), mode);
      return q.available ? { ok: true, quota: q } : { ok: false, quota: q, error: { code: "unavailable", message: "無法取得配額" } };
    },
    async getRecord(mode) {
      const m = record.byMode[mode];
      return m ? { ok: true, record: copy(m) } : { ok: false, record: null, error: { code: "mode", message: `未知的模式 ${mode}` } };
    },
    async requestRatedEntry({ mode, entryPowerHash } = {}) {
      if (!entryPowerHash) return { ok: false, ticket: null, error: { code: "entry", message: "缺少出賽戰力雜湊" } };
      const day = today();                       // ⚠ 伺服器自己的日期，不收客戶端送的
      const c = consumeRatedQuota(quotaState, day, mode);
      if (!c.ok) return { ok: false, ticket: null, error: c.error };
      quotaState = c.next;
      seq += 1;
      const ticket = Object.freeze({
        ticketId: `rk:${mode}:${day}:${seq}`, mode, serverDay: day, entryPowerHash, issuedBy: descriptor.id,
      });
      tickets.set(ticket.ticketId, { ticket, settled: false });
      return { ok: true, ticket, quota: c.quota };
    },
  });

  //  ── 只有伺服器有的：結算 ─────────────────────────────────────────────
  const server = Object.freeze({
    settleRatedMatch({ ticketId, outcome, opponent, bracketId = null } = {}) {
      const t = tickets.get(ticketId);
      if (!t) return { ok: false, errors: [{ code: "ticket", message: "票券不是本 authority 簽發的" }] };
      if (t.settled) return { ok: false, errors: [{ code: "settled", message: "這張票券已經結算過" }] };
      const made = createCompetitiveResult({
        resultId: t.ticket.ticketId, mode: t.ticket.mode, serverDay: t.ticket.serverDay, outcome,
        rated: true, entryPowerHash: t.ticket.entryPowerHash, opponent, bracketId,
      });
      if (!made.ok) return { ok: false, errors: made.errors };
      const applied = applyCompetitiveResult(record, made.result, { ratingPolicy });
      if (!applied.applied) return { ok: false, errors: applied.errors.length ? applied.errors : [{ code: "duplicate", message: "重複結算" }] };
      record = applied.record;
      t.settled = true;
      return { ok: true, errors: [], result: made.result };
    },
  });

  return { descriptor, client, server };
}
