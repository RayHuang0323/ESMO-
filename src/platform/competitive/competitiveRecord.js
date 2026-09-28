// ============================================================================
//  platform/competitive/competitiveRecord.js
//    CompetitiveResult.v1 ＋ CompetitiveRecord.v1（Competitive Enablement v1）
//
//  ── 資料責任（誰擁有什麼）─────────────────────────────────────────────────
//  | 帳本 | 擁有者 | 寫入點 |
//  |---|---|---|
//  | 選手能力／XP／經濟／粉絲／體力 | 生涯存檔（profileStore） | `applyMatchProgress`（**拒收 ranked**） |
//  | 賽季名次／巡迴積分／冠軍 | Season / Competition | 賽程結算（**ranked 沒有賽事欄位，進不去**） |
//  | **Competitive 戰績／LadderRating／歷史** | **ranked authority** | **本檔 `applyCompetitiveResult`** |
//
//  ⚠ CompetitiveRecord **不進生涯存檔**。它屬於未來的後端：
//    存在玩家自己的 localStorage，等於讓玩家可以直接改自己的評分。
//    目前沒有後端 ⇒ 本檔只提供純 reducer，**沒有任何持久化**。
//  ⚠ 反方向同樣成立：本檔輸出的東西沒有任何一個欄位能被生涯讀成能力、金錢或時間。
//
//  ── 冪等 ──────────────────────────────────────────────────────────────────
//  冪等鍵 = `resultId`，**每個模式一本帳**（I9）。歷史有上限，
//  但冪等帳不跟著裁（裁掉的舊結果重送一樣被擋）。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store。
// ============================================================================
import { UNRATED_POLICY } from "./cbrPipeline.js";
import { findCareerTimeKeys } from "../time/serverClock.js";
import { SEASON_LEDGER_KEYS, findSeasonLedgerKeys, findCareerWriteKeys } from "./competitiveMode.js";

export const COMPETITIVE_RESULT_VERSION = "CompetitiveResult.v1";
export const COMPETITIVE_RECORD_VERSION = "CompetitiveRecord.v1";
export const RECORD_MODES = Object.freeze(["moba", "cs"]);
export const OUTCOMES = Object.freeze(["win", "loss", "draw"]);
/** 每個模式保留幾場歷史。⚠ 唯一的容量常數。 */
export const HISTORY_LIMIT = 50;

/** 擁有權宣告：讓消費端無法誤以為這份帳本可信或已落盤。 */
export const COMPETITIVE_RECORD_OWNER = Object.freeze({
  owner: "ranked-authority",
  persistedInCareerSave: false,
  trusted: false,          // ⚠ 接上真後端之前一律 false
});

const emptyModeRecord = () => ({
  ladderRating: null,          // null = 未評分（不是 0，也不是 1500）
  ratingPolicy: UNRATED_POLICY.id,
  played: 0, wins: 0, losses: 0, draws: 0,
  history: [],
  processed: {},               // resultId → true（冪等帳，不隨歷史裁切）
});

export function emptyCompetitiveRecord() {
  return {
    schema: COMPETITIVE_RECORD_VERSION,
    byMode: Object.fromEntries(RECORD_MODES.map((m) => [m, emptyModeRecord()])),
  };
}

/**
 * 驗證一份結果。**只收線上自己的東西**：
 * 誰、哪個模式、哪個伺服器日、輸贏、雙方戰力雜湊、級別。
 */
export function validateCompetitiveResult(r) {
  const errors = [];
  if (!r || typeof r !== "object") return { ok: false, errors: [{ code: "invalid", message: "結果不是物件" }] };
  if (r.schema !== COMPETITIVE_RESULT_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${COMPETITIVE_RESULT_VERSION}` });
  if (!r.resultId) errors.push({ code: "result_id", message: "缺少 resultId" });
  if (!RECORD_MODES.includes(r.mode)) errors.push({ code: "mode", message: `mode 必須為 moba/cs，收到 ${r.mode}` });
  if (!Number.isInteger(r.serverDay)) errors.push({ code: "server_day", message: "結果必須帶伺服器日" });
  if (!OUTCOMES.includes(r.outcome)) errors.push({ code: "outcome", message: `未知的結果 ${r.outcome}` });
  if (typeof r.rated !== "boolean") errors.push({ code: "rated", message: "必須明確標記 rated" });
  if (!r.entryPowerHash) errors.push({ code: "entry", message: "缺少我方戰力雜湊" });
  if (!r.opponent?.teamId || !r.opponent?.powerHash) errors.push({ code: "opponent", message: "缺少對手身分或戰力雜湊" });

  const season = findSeasonLedgerKeys(r);
  if (season.length) errors.push({ code: "season_leak", message: `競技排位結果不得帶賽季帳本欄位：${season.join(", ")}` });
  const career = findCareerWriteKeys(r);
  if (career.length) errors.push({ code: "career_leak", message: `競技排位結果不得帶生涯寫回欄位：${career.join(", ")}` });
  const time = findCareerTimeKeys(r);
  if (time.length) errors.push({ code: "career_time_leak", message: `競技排位結果不得帶生涯時間：${time.join(", ")}` });
  return { ok: errors.length === 0, errors };
}

/** 工廠：補齊欄位並驗證。 */
export function createCompetitiveResult({
  resultId, mode, serverDay, outcome, rated = true,
  entryPowerHash, opponent = {}, bracketId = null,
} = {}) {
  const result = {
    schema: COMPETITIVE_RESULT_VERSION,
    resultId: resultId ? String(resultId) : null,
    mode, serverDay, outcome, rated,
    entryPowerHash: entryPowerHash ?? null,
    opponent: { teamId: opponent.teamId ?? null, powerHash: opponent.powerHash ?? null },
    bracketId: bracketId ?? null,
  };
  const v = validateCompetitiveResult(result);
  return { ok: v.ok, result: v.ok ? result : null, errors: v.errors };
}

/**
 * 純 reducer：record + result → 下一份 record。
 *
 * @param {object} record
 * @param {object} result  CompetitiveResult.v1
 * @param {{ratingPolicy?:object}} opts  評分政策（預設未評分）。見 `cbrPipeline.js`。
 * @returns {{ record:object, applied:boolean, alreadyApplied:boolean, errors:Array }}
 */
export function applyCompetitiveResult(record, result, { ratingPolicy = UNRATED_POLICY } = {}) {
  const cur = record?.schema === COMPETITIVE_RECORD_VERSION ? record : emptyCompetitiveRecord();
  const v = validateCompetitiveResult(result);
  if (!v.ok) return { record: cur, applied: false, alreadyApplied: false, errors: v.errors };
  const mode = cur.byMode[result.mode] ?? emptyModeRecord();
  if (mode.processed[result.resultId]) return { record: cur, applied: false, alreadyApplied: true, errors: [] };

  const rated = result.rated === true;
  const ladderBefore = mode.ladderRating;
  const ladderAfter = rated ? (ratingPolicy.rate({ ladderRating: ladderBefore, outcome: result.outcome }) ?? null) : ladderBefore;
  const entry = {
    resultId: result.resultId, serverDay: result.serverDay, outcome: result.outcome, rated,
    bracketId: result.bracketId, opponentTeamId: result.opponent.teamId,
    ladderBefore, ladderAfter,
  };
  const nextMode = {
    ...mode,
    ladderRating: ladderAfter,
    ratingPolicy: rated ? ratingPolicy.id : mode.ratingPolicy,
    played: mode.played + (rated ? 1 : 0),
    wins: mode.wins + (rated && result.outcome === "win" ? 1 : 0),
    losses: mode.losses + (rated && result.outcome === "loss" ? 1 : 0),
    draws: mode.draws + (rated && result.outcome === "draw" ? 1 : 0),
    history: [entry, ...mode.history].slice(0, HISTORY_LIMIT),
    processed: { ...mode.processed, [result.resultId]: true },
  };
  return {
    record: { ...cur, byMode: { ...cur.byMode, [result.mode]: nextMode } },
    applied: true, alreadyApplied: false, errors: [],
  };
}

export { SEASON_LEDGER_KEYS };
