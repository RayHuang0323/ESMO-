// ============================================================================
//  platform/online/matchAdjudication.js — 伺服器裁決的最小介面（Online Foundation v2A）
//
//  ── 現況盤點（詳見 docs/design/Online_Foundation_v2A.md §4）─────────────────
//    MatchSession.v1   場次／launchToken —— launchToken 是決定性 hash，客戶端算得出來 ⇒ 不是秘密
//    MatchResult.v1    綁場次＋防重送／防衝突 —— `resultSource:"engine"`，本機模擬
//    MobaReplay.v1     客戶端擷取的畫面紀錄 —— 是**呈現**，不是裁決依據
//  三者都是生涯（Career／Challenge／一般對戰）在用的，**本檔不改它們的行為**。
//
//  ── 這一層 ──────────────────────────────────────────────────────────────────
//  Ranked 的結果只能由伺服器產生：伺服器用**自己**的 seed、票券綁的陣容與天賦、
//  票券登記的模擬版本跑一次，簽出 `AdjudicatedMatchResult.v1`。客戶端只驗。
//
//    MatchAdjudicationInputs.v1 —— 伺服器裁決的輸入（決定性、可重算 inputsHash）
//    AdjudicatedMatchResult.v1  —— 伺服器簽章的結果；ticketId 是冪等鍵
//    SERVER_AUTHORITY_INTERFACE —— 只有伺服器有的方法（客戶端閘道出現任何一個 ⇒ 拒）
//
//  ⚠ `MatchResult.v1` 的 `resultSource:"server"` 從 v2A 起**不能由客戶端組出**
//    （matchResult.js 直接拒）：伺服器的結果只走本檔的簽章信封。
//  ⚠ Replay 不是裁決依據：結果簽章不涵蓋 replay，replay 被改不影響勝負，勝負被改一定驗不過。
//  ⚠ 結果**不帶**任何生涯／賽季欄位（CAREER_WRITE_KEYS／SEASON_LEDGER_KEYS）⇒ 不可能被當成生涯寫回。
//  純函式：不 import React / zustand / localStorage / Supabase SDK，不讀時鐘，沒有私鑰。
// ============================================================================
import { SIGNATURE_ALGS, verifyEnvelopeSignature } from "./signedSnapshot.js";
import { validateTicketShape, CS_TICKET_DEFERRED } from "./matchTicket.js";
import { validateBattleTalentBinding } from "./battleTalentBinding.js";
import { stableHash, stableStringify } from "../contracts/squadSnapshot.js";
import { findCareerWriteKeys, findSeasonLedgerKeys } from "../competitive/competitiveMode.js";

export const ADJUDICATION_INPUTS_VERSION = "MatchAdjudicationInputs.v1";
export const ADJUDICATED_RESULT_VERSION = "AdjudicatedMatchResult.v1";

/**
 * 伺服器權威面。`serverOnly` 的每一個方法**只存在於 Edge Function**，
 * 客戶端閘道（`RankedAuthorityGateway.v1`）上出現任何一個 ⇒ `validateRankedGateway` 拒。
 */
export const SERVER_AUTHORITY_INTERFACE = Object.freeze({
  version: "ServerMatchAuthority.v1",
  serverOnly: Object.freeze([
    "issueMatchTicket",     // 驗請求 → server_day → 原子扣配額 → nonce → 簽票
    "signSquadSnapshot",    // 權威取值 → SignedSquadSnapshot.v1
    "adjudicateMatch",      // 票券＋雙方快照＋天賦＋伺服器 seed → 模擬 → 簽結果
    "settleRatedMatch",     // 以 ticketId 冪等地寫 ranked_records
  ]),
  seedPolicy: "server-at-adjudication",   // 客戶端永遠不提供 seed
  idempotencyKey: "ticketId",
  defenderTalentPolicy: "engine-ai",       // 防守方離線：與 Player Challenge 相同，由引擎決定性補位
});

const fin = (v) => typeof v === "number" && Number.isFinite(v);
const isHash = (v) => typeof v === "string" && /^[0-9a-f]{8,64}$/.test(v);
const OUTCOMES = Object.freeze(["attacker", "defender", "draw"]);

/** 裁決輸入的雜湊：只涵蓋會影響模擬的欄位。 */
export function adjudicationInputsHashOf(inputs) {
  const { inputsHash: _drop, ...rest } = inputs ?? {};
  return stableHash(stableStringify(rest));
}

/**
 * 伺服器組裁決輸入。
 * @param {object} p
 * @param {object} p.ticket      已驗過簽章的 OnlineMatchTicket.v1（攻方）
 * @param {object} p.defender    { snapshotHash, powerHash }（防守方的簽章快照）
 * @param {number} p.seed        **伺服器**產生的 seed
 */
export function createAdjudicationInputs({ ticket, defender = null, seed } = {}) {
  const errors = [];
  const tv = validateTicketShape(ticket);
  if (!tv.ok) errors.push(...tv.errors);
  if (!isHash(defender?.snapshotHash) || !isHash(defender?.powerHash)) errors.push({ code: "defender", message: "缺少防守方陣容雜湊" });
  if (!Number.isInteger(seed) || seed < 0) errors.push({ code: "seed", message: "seed 必須由伺服器提供（非負整數）" });
  if (errors.length) return { ok: false, inputs: null, errors };
  const body = {
    schema: ADJUDICATION_INPUTS_VERSION,
    ticketId: ticket.ticketId,
    mode: ticket.mode,
    simulationVersion: ticket.simulationVersion,
    seed,
    attacker: {
      snapshotHash: ticket.entry.snapshotHash,
      powerHash: ticket.entry.powerHash,
      battleTalentsHash: ticket.battleTalents.bindingHash,
      battleTalents: ticket.battleTalents.seats,
    },
    defender: {
      snapshotHash: defender.snapshotHash,
      powerHash: defender.powerHash,
      battleTalentPolicy: SERVER_AUTHORITY_INTERFACE.defenderTalentPolicy,
    },
  };
  return { ok: true, errors: [], inputs: { ...body, inputsHash: adjudicationInputsHashOf(body) } };
}

/** 結果形狀（不含簽章）。 */
export function validateAdjudicatedShape(r) {
  const errors = [];
  if (!r || typeof r !== "object") return { ok: false, errors: [{ code: "invalid", message: "結果不是物件" }] };
  if (r.schema !== ADJUDICATED_RESULT_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${ADJUDICATED_RESULT_VERSION}` });
  if (r.mode === "cs") return { ok: false, errors: [{ ...CS_TICKET_DEFERRED }] };
  if (r.resultSource !== "server") errors.push({ code: "source", message: "裁決結果的來源必須是 server" });
  if (!r.ticketId) errors.push({ code: "ticket_id", message: "缺少票券識別碼（冪等鍵）" });
  if (!isHash(r.inputsHash)) errors.push({ code: "inputs_hash", message: "缺少裁決輸入雜湊" });
  if (!isHash(r.battleTalentsHash)) errors.push({ code: "talents_hash", message: "缺少本場天賦雜湊" });
  if (!OUTCOMES.includes(r.outcome?.winner)) errors.push({ code: "winner", message: `勝負必須為 ${OUTCOMES.join("/")}` });
  if (!fin(r.outcome?.score?.attacker) || !fin(r.outcome?.score?.defender)) errors.push({ code: "score", message: "比分無效" });
  if (!fin(r.outcome?.durationSec) || r.outcome.durationSec < 0) errors.push({ code: "duration", message: "比賽時長無效" });
  if (!fin(r.adjudicatedAtServerMs)) errors.push({ code: "adjudicated_at", message: "缺少伺服器裁決時刻" });
  if (!r.issuedBy) errors.push({ code: "issuer", message: "缺少簽發者" });
  if (!r.signature || !SIGNATURE_ALGS.includes(r.signature.alg) || !r.signature.keyId) errors.push({ code: "signature", message: "缺少簽章或演算法不允許" });
  const career = findCareerWriteKeys(r);
  const season = findSeasonLedgerKeys(r);
  if (career.length || season.length) errors.push({ code: "career_leak", message: `裁決結果不得帶生涯／賽季欄位：${[...career, ...season].join(", ")}` });
  return { ok: !errors.length, errors };
}

/** 伺服器組出**待簽**結果。沒有私鑰就沒有權威。 */
export function createUnsignedAdjudication({ inputs, outcome, battleResultVersion = null, adjudicatedAtServerMs, issuedBy, keyId } = {}) {
  if (!inputs || inputs.schema !== ADJUDICATION_INPUTS_VERSION || inputs.inputsHash !== adjudicationInputsHashOf(inputs)) {
    return { ok: false, result: null, errors: [{ code: "inputs", message: "裁決輸入無效或雜湊不符" }] };
  }
  const result = {
    schema: ADJUDICATED_RESULT_VERSION,
    ticketId: inputs.ticketId,
    mode: inputs.mode,
    simulationVersion: inputs.simulationVersion,
    inputsHash: inputs.inputsHash,
    battleTalentsHash: inputs.attacker.battleTalentsHash,
    outcome: {
      winner: outcome?.winner,
      score: { attacker: outcome?.score?.attacker, defender: outcome?.score?.defender },
      durationSec: Math.round(Number(outcome?.durationSec)),
    },
    battleResultVersion,
    resultSource: "server",
    adjudicatedAtServerMs,
    issuedBy: issuedBy ?? null,
    signature: { alg: SIGNATURE_ALGS[0], keyId: keyId ?? null, value: null },
  };
  const v = validateAdjudicatedShape(result);
  return { ok: v.ok, result: v.ok ? result : null, errors: v.errors };
}

/**
 * 客戶端驗裁決結果。
 * 必須同時成立：形狀、簽章（同一條驗章路徑）、綁的是**我的那張票**（ticketId／模式／模擬版本／天賦雜湊）。
 */
export async function verifyAdjudicatedResult(result, { trustedKeys = null, verify = null, ticket = null } = {}) {
  const shape = validateAdjudicatedShape(result);
  if (!shape.ok) return { ok: false, errors: shape.errors };
  const sig = await verifyEnvelopeSignature(result, { trustedKeys, verify });
  if (!sig.ok) return sig;
  const errors = [];
  if (!ticket) errors.push({ code: "ticket", message: "沒有對應的票券，無法確認結果屬於哪一場" });
  else {
    if (result.ticketId !== ticket.ticketId) errors.push({ code: "ticket_mismatch", message: "結果不屬於這張票券" });
    if (result.mode !== ticket.mode) errors.push({ code: "mode_mismatch", message: "結果的模式與票券不符" });
    if (result.simulationVersion !== ticket.simulationVersion) errors.push({ code: "simulation_version_mismatch", message: "結果的模擬版本與票券不符" });
    if (result.battleTalentsHash !== ticket.battleTalents?.bindingHash) errors.push({ code: "talents_mismatch", message: "結果用的天賦與票券綁定的不同" });
  }
  return { ok: !errors.length, errors };
}

/** 裁決結果 → ranked 帳本的 outcome（從票券持有者＝攻方的角度）。 */
export const competitiveOutcomeOf = (result) => ({ attacker: "win", defender: "loss", draw: "draw" })[result?.outcome?.winner] ?? null;

/** 伺服器裁決前重驗天賦（以本場名單重算必須一致）。 */
export const revalidateTicketTalents = (ticket, roster) => validateBattleTalentBinding(ticket?.battleTalents, { roster });
