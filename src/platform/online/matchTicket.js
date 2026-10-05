// ============================================================================
//  platform/online/matchTicket.js — OnlineMatchTicket.v1（Online Foundation v2A）
//
//  ── 這一層回答什麼 ──────────────────────────────────────────────────────────
//  「這一場 Ranked 是伺服器准的嗎？准的是哪一份陣容、哪一組天賦？」
//  v1 的 `requestRatedEntry` 只回一個 `rk:moba:day:seq` 的流水號：它可以被客戶端照抄，
//  也沒有綁本場的天賦。v2A 把票券定成**伺服器簽發、客戶端只驗**的資料契約。
//
//  ── 流程（伺服器尚未存在；本檔只定形狀與驗證）──────────────────────────────────
//    客戶端                                   │  伺服器（Edge Function，持私鑰）
//    createTicketRequest(...)  只送選擇與雜湊 │  用自己的 now()／server_day 判斷、扣配額、
//    requestRatedEntry(request) ────────────▶│  產生隨機 nonce、ticketId、簽章
//    verifyMatchTicket(ticket)  ◀────────────│  回 OnlineMatchTicket.v1
//
//  ── 契約 ────────────────────────────────────────────────────────────────────
//    · 票券**只能由伺服器產生**：ticketId、nonce、serverDay、簽發／到期時刻、簽章，
//      客戶端請求單裡出現任何一個 ⇒ 拒（`FORBIDDEN_TICKET_REQUEST_KEYS`）。
//    · 簽章與 SignedSquadSnapshot.v1 **同一條驗章路徑**（`verifyEnvelopeSignature`）：
//      只准 Ed25519、同一份信任金鑰表、同一種正規化位元組。不另建第二套 authority。
//    · 票券綁：陣容（snapshotHash＋powerHash）＋本場天賦（BattleTalentBinding.v1 全文）
//      ＋模擬版本。裁決時伺服器用的就是這三樣。
//    · 到期判斷用**伺服器時刻**（呼叫端傳入同步後的 ServerTime）；沒有就拒，不退回 `Date.now()`。
//    · nonce 防重放的**權威**在伺服器（DB unique）；客戶端的 `seenNonces` 只是提早發現。
//    · **只開 MOBA**。CS 票券延後（TD-58：CS 模擬版本未登記）。
//
//  ⚠ 本檔沒有私鑰、沒有簽章函式。`COMPETITIVE_ENABLED` 仍為 false，票券不會開放入口。
//  純函式：不 import React / zustand / localStorage / Supabase SDK，不讀時鐘。
// ============================================================================
import { SIGNATURE_ALGS, verifyEnvelopeSignature } from "./signedSnapshot.js";
import { validateBattleTalentBinding, BATTLE_TALENT_BINDING_VERSION } from "./battleTalentBinding.js";
import { KNOWN_SIMULATION_VERSIONS } from "../contracts/simulationVersion.js";

export const MATCH_TICKET_VERSION = "OnlineMatchTicket.v1";
export const MATCH_TICKET_REQUEST_VERSION = "OnlineMatchTicketRequest.v1";
export const TICKET_MODES = Object.freeze(["moba"]);
export const CS_TICKET_DEFERRED = Object.freeze({
  code: "cs_ticket_deferred", message: "CS 線上票券尚未開放（需先登記 CS 模擬版本，TD-58）",
});

export const TICKET_POLICY = Object.freeze({
  matchSource: "ranked",
  /** 票券最長壽命：簽發到開打之間的窗口。超過 ⇒ 伺服器重新簽發，不延長。 */
  maxTtlMs: 15 * 60 * 1000,
  /** nonce：伺服器產生的 ≥128 bit 隨機值（base64url，至少 22 字元）。 */
  noncePattern: /^[A-Za-z0-9_-]{22,128}$/,
  ticketIdPattern: /^tk_[A-Za-z0-9_-]{16,64}$/,
  clientClockIsAdvisory: true,
});

/** 客戶端請求單上**不得**出現的鍵（全部是伺服器才給得出的東西，或勝負／數值）。 */
export const FORBIDDEN_TICKET_REQUEST_KEYS = Object.freeze([
  "ticketId", "nonce", "serverDay", "issuedAtServerMs", "expiresAtServerMs", "issuedBy", "signature",
  "subject", "userId", "seed", "trusted", "outcome", "winner", "score", "resultSource",
  "rating", "ladderRating", "careerDay", "days", "stats", "power", "effectivePower",
]);

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const isHash = (v) => typeof v === "string" && /^[0-9a-f]{8,64}$/.test(v);

function findKeys(node, keys, path = "", found = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return found;
  for (const [k, v] of Object.entries(node)) {
    const here = path ? `${path}.${k}` : k;
    if (keys.includes(k)) found.push(here);
    if (v && typeof v === "object") findKeys(v, keys, here, found, depth + 1);
  }
  return found;
}

/**
 * 客戶端組出票券請求。**只有選擇與雜湊**，伺服器會全部重驗。
 * @param {object} p
 * @param {"moba"|"cs"} p.mode
 * @param {object} p.entry    CompetitiveEntry.v1（取 snapshotHash／powerHash）
 * @param {object} p.battleTalents  BattleTalentBinding.v1
 */
export function createTicketRequest({ mode = "moba", entry = null, battleTalents = null, extra = null } = {}) {
  if (mode === "cs") return { ok: false, request: null, errors: [{ ...CS_TICKET_DEFERRED }] };
  const errors = [];
  if (!TICKET_MODES.includes(mode)) errors.push({ code: "mode", message: `未知的模式：${mode}` });
  const snapshotHash = entry?.provenance?.snapshotHash ?? entry?.snapshot?.hash ?? null;
  const powerHash = entry?.powerHash ?? null;
  if (!isHash(snapshotHash) || !isHash(powerHash)) errors.push({ code: "entry", message: "缺少出賽陣容的雜湊（請先建立 CompetitiveEntry）" });
  if (entry && entry.mode !== mode) errors.push({ code: "mode_mismatch", message: "出賽單模式與票券模式不符" });
  const tb = battleTalents ? validateBattleTalentBinding(battleTalents) : { ok: false, errors: [{ code: "talents", message: "缺少本場天賦綁定（Ranked 必須帶 Talent ID）" }] };
  if (!tb.ok) errors.push(...tb.errors);
  const leaked = extra ? findKeys(extra, FORBIDDEN_TICKET_REQUEST_KEYS) : [];
  if (leaked.length) errors.push({ code: "forbidden_key", message: `請求單不得帶伺服器欄位或數值：${leaked.join(", ")}` });
  if (errors.length) return { ok: false, request: null, errors };
  return {
    ok: true, errors: [],
    request: {
      schema: MATCH_TICKET_REQUEST_VERSION,
      mode,
      entry: { snapshotHash, powerHash },
      battleTalents: JSON.parse(JSON.stringify(battleTalents)),
    },
  };
}

/** 伺服器收到請求後的**第一道**檢查（伺服器與 gate 共用；客戶端送來的任何東西都先過這裡）。 */
export function validateTicketRequest(request) {
  const errors = [];
  if (!request || request.schema !== MATCH_TICKET_REQUEST_VERSION) return { ok: false, errors: [{ code: "schema", message: `schema 必須為 ${MATCH_TICKET_REQUEST_VERSION}` }] };
  if (request.mode === "cs") return { ok: false, errors: [{ ...CS_TICKET_DEFERRED }] };
  if (!TICKET_MODES.includes(request.mode)) errors.push({ code: "mode", message: `未知的模式：${request.mode}` });
  const leaked = findKeys(request, FORBIDDEN_TICKET_REQUEST_KEYS);
  if (leaked.length) errors.push({ code: "forbidden_key", message: `請求單不得帶伺服器欄位或數值：${leaked.join(", ")}` });
  if (!isHash(request.entry?.snapshotHash) || !isHash(request.entry?.powerHash)) errors.push({ code: "entry", message: "缺少出賽陣容的雜湊" });
  const tb = validateBattleTalentBinding(request.battleTalents);
  if (!tb.ok) errors.push(...tb.errors);
  else if (request.battleTalents.mode !== request.mode) errors.push({ code: "talent_mode", message: "天賦綁定模式與票券不符" });
  const extra = Object.keys(request).filter((k) => !["schema", "mode", "entry", "battleTalents"].includes(k));
  if (extra.length) errors.push({ code: "unknown_key", message: `請求單有契約外的欄位：${extra.join(", ")}` });
  return { ok: !errors.length, errors };
}

/** 票券形狀（不含簽章驗證）。 */
export function validateTicketShape(t) {
  const errors = [];
  if (!t || typeof t !== "object") return { ok: false, errors: [{ code: "invalid", message: "票券不是物件" }] };
  if (t.schema !== MATCH_TICKET_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${MATCH_TICKET_VERSION}` });
  if (t.mode === "cs") return { ok: false, errors: [{ ...CS_TICKET_DEFERRED }] };
  if (!TICKET_MODES.includes(t.mode)) errors.push({ code: "mode", message: `未知的模式：${t.mode}` });
  if (t.matchSource !== TICKET_POLICY.matchSource) errors.push({ code: "match_source", message: "票券只屬於 ranked" });
  if (!TICKET_POLICY.ticketIdPattern.test(String(t.ticketId ?? ""))) errors.push({ code: "ticket_id", message: "票券識別碼格式不符（必須由伺服器產生）" });
  if (!TICKET_POLICY.noncePattern.test(String(t.nonce ?? ""))) errors.push({ code: "nonce", message: "nonce 缺少或太短（必須是伺服器的隨機值）" });
  if (!t.subject) errors.push({ code: "subject", message: "票券缺少持有者" });
  if (!Number.isInteger(t.serverDay)) errors.push({ code: "server_day", message: "缺少伺服器日" });
  if (!fin(t.issuedAtServerMs) || !fin(t.expiresAtServerMs)) errors.push({ code: "times", message: "缺少伺服器簽發／到期時刻" });
  else if (t.expiresAtServerMs <= t.issuedAtServerMs || t.expiresAtServerMs - t.issuedAtServerMs > TICKET_POLICY.maxTtlMs) {
    errors.push({ code: "ttl", message: "票券效期不合法" });
  }
  if (!KNOWN_SIMULATION_VERSIONS.includes(t.simulationVersion)) errors.push({ code: "simulation_version", message: `未登記的模擬版本：${t.simulationVersion}` });
  if (!isHash(t.entry?.snapshotHash) || !isHash(t.entry?.powerHash)) errors.push({ code: "entry", message: "票券沒有綁定出賽陣容" });
  if (t.battleTalents?.schema !== BATTLE_TALENT_BINDING_VERSION) errors.push({ code: "talents", message: "票券沒有綁定本場天賦" });
  else {
    const tb = validateBattleTalentBinding(t.battleTalents);
    if (!tb.ok) errors.push(...tb.errors);
    else if (t.battleTalents.simulationVersion !== t.simulationVersion) errors.push({ code: "talent_sim_version", message: "天賦綁定的模擬版本與票券不符" });
  }
  if (!t.issuedBy) errors.push({ code: "issuer", message: "缺少簽發者" });
  if (!t.signature || !SIGNATURE_ALGS.includes(t.signature.alg) || !t.signature.keyId) errors.push({ code: "signature", message: "缺少簽章或演算法不允許" });
  return { ok: !errors.length, errors };
}

/**
 * 伺服器組出**待簽**票券（Edge Function 用；gate 也用它扮演伺服器）。
 * ⚠ 沒有私鑰就產不出有效簽章——這支函式在客戶端呼叫沒有任何權威。
 */
export function createUnsignedTicket({
  request, ticketId, nonce, subject, serverDay, issuedAtServerMs, ttlMs = TICKET_POLICY.maxTtlMs,
  simulationVersion, issuedBy, keyId,
} = {}) {
  const rv = validateTicketRequest(request);
  if (!rv.ok) return { ok: false, ticket: null, errors: rv.errors };
  const ticket = {
    schema: MATCH_TICKET_VERSION,
    ticketId, nonce, subject: subject ?? null,
    mode: request.mode,
    matchSource: TICKET_POLICY.matchSource,
    serverDay,
    issuedAtServerMs,
    expiresAtServerMs: fin(issuedAtServerMs) ? issuedAtServerMs + ttlMs : null,
    simulationVersion: simulationVersion ?? request.battleTalents.simulationVersion,
    entry: { ...request.entry },
    battleTalents: JSON.parse(JSON.stringify(request.battleTalents)),
    issuedBy: issuedBy ?? null,
    signature: { alg: SIGNATURE_ALGS[0], keyId: keyId ?? null, value: null },
  };
  const v = validateTicketShape(ticket);
  return { ok: v.ok, ticket: v.ok ? ticket : null, errors: v.errors };
}

/**
 * 客戶端驗票。
 * @param {object} ticket
 * @param {object} opts
 * @param {object} opts.trustedKeys   keyId → { alg, publicKeyJwkX }（與快照同一份表）
 * @param {Function} opts.verify      `webCryptoEd25519Verifier(crypto.subtle)`
 * @param {number|null} opts.serverNowMs  同步後的伺服器時刻；沒有 ⇒ 拒（不退回裝置時間）
 * @param {string} [opts.subject]     目前登入者；有給就必須等於票券持有者
 * @param {Set<string>} [opts.seenNonces]
 */
export async function verifyMatchTicket(ticket, { trustedKeys = null, verify = null, serverNowMs = null, subject = null, seenNonces = null } = {}) {
  const shape = validateTicketShape(ticket);
  if (!shape.ok) return { ok: false, errors: shape.errors };
  if (!fin(serverNowMs)) return { ok: false, errors: [{ code: "server_time_unavailable", message: "沒有伺服器時間，無法判斷票券效期" }] };
  const sig = await verifyEnvelopeSignature(ticket, { trustedKeys, verify });
  if (!sig.ok) return sig;
  const errors = [];
  if (serverNowMs > ticket.expiresAtServerMs) errors.push({ code: "expired", message: "票券已過期" });
  if (serverNowMs < ticket.issuedAtServerMs - 60_000) errors.push({ code: "not_yet_valid", message: "票券簽發時刻在未來（時鐘不一致）" });
  if (subject && subject !== ticket.subject) errors.push({ code: "subject_mismatch", message: "票券不屬於目前登入的帳號" });
  if (seenNonces?.has?.(ticket.nonce)) errors.push({ code: "replayed", message: "這張票券的 nonce 已經用過" });
  return { ok: !errors.length, errors };
}

/** 票券綁的是不是這一份出賽單？ */
export const ticketBindsEntry = (ticket, entry) => !!ticket && !!entry
  && ticket.mode === entry.mode
  && ticket.entry?.powerHash === entry.powerHash
  && ticket.entry?.snapshotHash === (entry.provenance?.snapshotHash ?? entry.snapshot?.hash);
