// ============================================================================
//  platform/contracts/matchResult.js — MatchResult.v1（Milestone O7）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  O6 的場次負責「能不能開打」；比賽打完之後還有兩個問題沒有形狀：
//    ① 這份結果**屬於哪一場**？（沒有綁定就無法防止把 A 場的結果拿去 B 場結算）
//    ② 同一場**送兩次**、或送**兩份不同的結果**，該怎麼辦？
//
//  本檔定義結果契約：
//    · 綁定 sessionId / matchId / 雙方隊伍版本 / seed。
//    · `resultId` 由**內容雜湊**決定性推導 ⇒ 同一份結果重送得到同一個 id
//      （＝同一張 receipt）；**同一場送不同結果 ⇒ 內容雜湊不同 ⇒ 立即偵測衝突**。
//    · `resultSource` 必須是可信來源（引擎模擬）。客戶端自行宣稱的結果
//      （`client` / `manual`）一律拒絕。
//
//  ⚠ 這不是第二套 BattleResult：`BattleResult.v2` / `CsMatchResult.v1` 仍是
//    對戰結果的唯一來源，本檔只是把它**綁到場次**並加上防重送／防衝突。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { SESSION_VERSION } from "./matchSession.js";

export const MATCH_RESULT_VERSION = "MatchResult.v1";

/** 可信的結果來源。客戶端自稱的結果不在其中。 */
export const RESULT_SOURCES = Object.freeze({
  engine: "engine",           // 本機決定性模擬（目前的來源）
  server: "server",           // 未來由伺服器裁決
});
const TRUSTED = Object.freeze(Object.values(RESULT_SOURCES));

function hash8(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** 結果內容的正規化雜湊——**只取會影響結算的欄位**，避免時間戳造成假衝突。 */
export function resultContentHash({ sessionId, matchId, winner, score, durationSec, seed }) {
  return hash8([
    sessionId, matchId, winner,
    `${score?.us ?? 0}-${score?.opponent ?? 0}`,
    Math.round(Number(durationSec) || 0),
    seed,
  ].join("|"));
}

/**
 * 由場次與對戰結果建立 MatchResult。
 *
 * @param {object} p
 * @param {object} p.session   MatchSession.v1（必須是進行中／已啟動）
 * @param {object} p.outcome   { matchId, winner:"us"|"opponent", score:{us,opponent}, durationSec }
 * @param {string} p.source    RESULT_SOURCES 之一
 */
export function createMatchResult({ session, outcome, source = RESULT_SOURCES.engine, now = 0 }) {
  const errors = [];
  if (!session || session.schema !== SESSION_VERSION) errors.push({ code: "session", message: "比賽場次無效" });
  if (!TRUSTED.includes(source)) errors.push({ code: "source", message: `結果來源不可信：${source}` });
  if (!outcome || typeof outcome !== "object") errors.push({ code: "outcome", message: "缺少比賽結果" });
  else {
    if (outcome.winner !== "us" && outcome.winner !== "opponent") errors.push({ code: "winner", message: `勝負必須為 us/opponent，收到 ${outcome.winner}` });
    if (!outcome.matchId) errors.push({ code: "match_id", message: "缺少 matchId" });
    if (typeof outcome.durationSec !== "number" || !Number.isFinite(outcome.durationSec) || outcome.durationSec < 0) {
      errors.push({ code: "duration", message: "比賽時長無效" });
    }
    const sc = outcome.score ?? {};
    if (typeof sc.us !== "number" || typeof sc.opponent !== "number") errors.push({ code: "score", message: "比分無效" });
  }
  if (errors.length) return { ok: false, result: null, errors };

  const contentHash = resultContentHash({
    sessionId: session.sessionId,
    matchId: outcome.matchId,
    winner: outcome.winner,
    score: outcome.score,
    durationSec: outcome.durationSec,
    seed: session.seed,
  });
  return {
    ok: true,
    errors: [],
    result: {
      schema: MATCH_RESULT_VERSION,
      //  resultId 由內容推導 ⇒ 重送同一份 = 同一個 id；不同內容 = 不同 id（可偵測衝突）
      resultId: `result:${session.mode}:${contentHash}`,
      contentHash,
      sessionId: session.sessionId,
      matchId: outcome.matchId,
      mode: session.mode,
      rosterVersions: { ...session.rosterVersions },
      seed: session.seed,
      winner: outcome.winner,
      score: { us: outcome.score.us, opponent: outcome.score.opponent },
      durationSec: Math.round(outcome.durationSec),
      resultSource: source,
      reportedAt: now,
    },
  };
}

/**
 * 驗證結果與場次是否一致，並確認來源可信。
 *
 * @param {object} result
 * @param {object} opts.session
 * @param {object} [opts.known]  已知的同場結果（用來偵測衝突）
 */
export function validateMatchResult(result, { session = null, known = null } = {}) {
  const errors = [];
  if (!result || result.schema !== MATCH_RESULT_VERSION) {
    return { ok: false, errors: [{ code: "invalid", message: "比賽結果無效" }] };
  }
  if (!TRUSTED.includes(result.resultSource)) {
    errors.push({ code: "source", message: `結果來源不可信：${result.resultSource}（客戶端不得自行指定勝負）` });
  }
  //  resultId 必須可由內容重算 ⇒ 竄改勝負或比分會立刻被抓
  const expect = resultContentHash({
    sessionId: result.sessionId, matchId: result.matchId, winner: result.winner,
    score: result.score, durationSec: result.durationSec, seed: result.seed,
  });
  if (result.contentHash !== expect || result.resultId !== `result:${result.mode}:${expect}`) {
    errors.push({ code: "tampered", message: "比賽結果與其識別碼不一致（內容遭竄改）" });
  }
  if (session) {
    if (result.sessionId !== session.sessionId) errors.push({ code: "session_mismatch", message: "結果與目前場次不符" });
    if (result.seed !== session.seed) errors.push({ code: "seed_mismatch", message: "結果的對戰種子與場次不符" });
    if (result.mode !== session.mode) errors.push({ code: "mode_mismatch", message: "結果的模式與場次不符" });
    if (JSON.stringify(result.rosterVersions) !== JSON.stringify(session.rosterVersions)) {
      errors.push({ code: "roster_mismatch", message: "結果的隊伍版本與場次不符" });
    }
  }
  //  ── 同一場送不同結果 ⇒ 衝突 ──────────────────────────────────────────
  //  ⚠ CS Season M4-A：一個 **series** 的場次會**正當地**回報多份不同的結果——
  //    一個 BO3 有三張地圖，每張是獨立的一場對戰，各自有 matchId。
  //    對 series 而言，「衝突」的正確定義是**同一張地圖**被回報了兩種結果。
  //
  //  ⚠ 非 series 的場次**規則一個字都沒放寬**：一個場次仍然只准有一份結果，
  //    第二份不同內容的一律拒絕（MOBA 與 CS 聯賽走的都是這條）。
  //  ⚠ 這裡刻意讀 `session?.series` 而不是看結果自己帶了什麼：
  //    「這是不是一個 series」是**場次**的性質。讓送進來的結果自己宣稱的話，
  //    偽造一個 series 欄位就能繞過衝突偵測。
  const seriesScoped = !!session?.series;
  const sameTarget = seriesScoped
    ? (known?.sessionId === result.sessionId && known?.matchId === result.matchId)
    : (known?.sessionId === result.sessionId);
  if (known && sameTarget && known.contentHash !== result.contentHash) {
    errors.push({
      code: "conflict",
      message: seriesScoped
        ? `本 series 的這張地圖已回報過不同的結果（既有 ${known.resultId}，新收到 ${result.resultId}），拒絕受理`
        : `本場已回報過不同的結果（既有 ${known.resultId}，新收到 ${result.resultId}），拒絕受理`,
    });
  }
  return { ok: errors.length === 0, errors };
}

/** 同一份結果重送？（內容相同 ⇒ 應回同一張 receipt） */
export const isSameResult = (a, b) =>
  !!a && !!b && a.sessionId === b.sessionId && a.contentHash === b.contentHash;
