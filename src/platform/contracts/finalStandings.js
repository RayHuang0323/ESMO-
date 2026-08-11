// ============================================================================
//  platform/contracts/finalStandings.js — 賽季最終名次（Milestone Q4）
//
//  ── 為什麼需要「凍結」這一步 ────────────────────────────────────────────────
//  賽季進行中，Standings 是對 `FixtureOutcome[]` 的**純推導**（Q2b）——
//  儲存它等於製造第二份真相，與 outcomes 不一致時沒人說得出該聽誰的。
//  但賽季**結束後**情況相反：名次獎金、歷史紀錄、日後的升降級，需要的是
//  「**當時**判定出來的那份名次」。而 tiebreaker 規則日後可能修正——
//  修正 tiebreaker 不該讓三年前的冠軍換人（設計文件 D11／§7）。
//
//  所以：**進行中推導、結算後凍結一次**。凍結的那一份就是 `FinalStandings.v1`。
//
//  ── 這份快照為什麼要自帶 tiebreaker 順序 ──────────────────────────────────
//  只存名次不存判定依據，等於把「為什麼是這個名次」丟掉。
//  日後 `standings.js` 的 `TIEBREAKERS` 改版，舊賽季仍能說明自己當時是怎麼排的。
//  ⚠ 這**不是**第二份排序規則——本檔不排序，只把 `computeStandings()` 當下用的
//    順序原樣抄一份存證。排序永遠只有 `standings.js` 那一套。
//
//  純資料契約：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const FINAL_STANDINGS_VERSION = "FinalStandings.v1";

/** 快照裡每一列允許出現的欄位。多出來的一律不收（避免把戰鬥資料夾帶進來）。 */
const ROW_FIELDS = Object.freeze([
  "rank", "teamId", "name", "tag", "isAi",
  "played", "wins", "losses", "points",
  "scoreFor", "scoreAgainst", "scoreDiff",
  "engineGames", "simulatedGames", "forfeitedGames",
]);

/**
 * 這些欄位一旦出現在快照裡，就代表有人把「一場比賽的細節」塞進了賽季名次。
 * 與 `contracts/competition.js` 的 `leakedKeys` 同一個立場：
 * Competition 層只認勝敗與名次，不認 KDA／傷害／英雄。
 */
const FORBIDDEN_ROW_KEYS = Object.freeze(["k", "d", "a", "kda", "dmg", "gold", "heroId", "players", "timeline"]);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const int = (v) => Math.trunc(num(v));

/** 只留白名單欄位，並把數值正規化（快照不得帶 undefined / NaN）。 */
function normalizeRow(r) {
  const out = {};
  for (const k of ROW_FIELDS) {
    const v = r?.[k];
    if (k === "teamId" || k === "name" || k === "tag") out[k] = v ?? null;
    else if (k === "isAi") out[k] = !!v;
    else out[k] = int(v);
  }
  return out;
}

/**
 * 把一份**當下推導出來的** standings 凍結成不可變的最終名次。
 *
 * @param {object} p
 * @param {object} p.standings    `computeStandings()` 的輸出（{rows, played, rule}）
 * @param {object} p.competition  Competition.v1
 * @param {string} p.stageId
 * @param {number} p.sealedAtDay  封存當下的遊戲日（`meta.days`）
 * @param {Array}  p.tiebreakers  當下生效的 tiebreaker 順序（`standings.TIEBREAKERS`）
 * @param {object} [p.sourceMix]  `outcomeSourceMix()` 的輸出（誠實標示模擬／棄權比重）
 * @param {string} [p.playerTeamId]
 * @returns {{ok:boolean, final:object|null, errors:Array}}
 */
export function createFinalStandings({
  standings, competition, stageId, sealedAtDay, tiebreakers = [],
  sourceMix = null, playerTeamId = null,
} = {}) {
  const errors = [];
  const rows = standings?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push({ code: "rows", message: "最終名次至少要有一列" });
  }
  if (!competition?.id) errors.push({ code: "competition", message: "缺少賽事識別碼" });
  if (!stageId) errors.push({ code: "stage", message: "缺少賽段識別碼" });
  if (!Number.isFinite(Number(sealedAtDay)) || Number(sealedAtDay) < 1) {
    errors.push({ code: "day", message: "封存日必須是 1 以上的數字" });
  }
  if (errors.length) return { ok: false, final: null, errors };

  const normalized = rows.map(normalizeRow);
  //  名次必須是 1..n 的全序（`computeStandings` 保證了，這裡是防呆：
  //  若哪天有人手動塞一份 rows 進來，這道會擋住）
  const ranks = normalized.map((r) => r.rank).sort((a, b) => a - b);
  const fullOrder = ranks.every((r, i) => r === i + 1);
  if (!fullOrder) {
    return { ok: false, final: null, errors: [{ code: "rank", message: "名次必須是 1..n 的連續全序" }] };
  }

  const mine = playerTeamId ? normalized.find((r) => r.teamId === playerTeamId) ?? null : null;

  return {
    ok: true,
    errors: [],
    final: {
      schema: FINAL_STANDINGS_VERSION,
      //  由賽事識別碼推導 ⇒ 同一個賽事永遠同一個 id（冪等鍵的來源）
      id: `final:${competition.id}`,
      competitionId: competition.id,
      stageId,
      gameMode: competition.gameMode ?? null,
      season: int(competition.season),
      sealedAtDay: int(sealedAtDay),
      rule: standings?.rule?.id ?? null,
      //  存證用：當時是照什麼順序排的
      tiebreakers: tiebreakers.map((t) => t.key ?? String(t)),
      rows: normalized,
      played: int(standings?.played),
      sourceMix: sourceMix
        ? { total: int(sourceMix.total), engine: int(sourceMix.engine), simulated: int(sourceMix.simulated), forfeited: int(sourceMix.forfeited) }
        : null,
      playerTeamId: playerTeamId ?? null,
      playerRank: mine ? mine.rank : null,
    },
  };
}

/** 驗證一份最終名次。 */
export function validateFinalStandings(f) {
  const errors = [];
  if (!f || typeof f !== "object") return { ok: false, errors: [{ code: "invalid", message: "最終名次不是物件" }] };
  if (f.schema !== FINAL_STANDINGS_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${FINAL_STANDINGS_VERSION}` });
  if (!f.id) errors.push({ code: "id", message: "最終名次缺少識別碼" });
  if (!f.competitionId) errors.push({ code: "competition", message: "最終名次缺少賽事識別碼" });
  if (!Array.isArray(f.rows) || f.rows.length === 0) errors.push({ code: "rows", message: "最終名次至少要有一列" });

  if (Array.isArray(f.rows)) {
    const ranks = f.rows.map((r) => r.rank).sort((a, b) => a - b);
    if (!ranks.every((r, i) => r === i + 1)) errors.push({ code: "rank", message: "名次必須是 1..n 的連續全序" });
    const ids = new Set(f.rows.map((r) => r.teamId));
    if (ids.size !== f.rows.length) errors.push({ code: "duplicate", message: "同一支隊伍不得出現兩列" });
    for (const r of f.rows) {
      const leak = FORBIDDEN_ROW_KEYS.filter((k) => r && r[k] !== undefined);
      if (leak.length) { errors.push({ code: "result_leak", message: `最終名次不得夾帶戰鬥資料：${leak.join(", ")}` }); break; }
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 名次 → 那一列（查獎金用）。 */
export const rowAtRank = (final, rank) => (final?.rows ?? []).find((r) => r.rank === rank) ?? null;

/** 某隊的最終名次列。 */
export const rowOfTeam = (final, teamId) => (final?.rows ?? []).find((r) => r.teamId === teamId) ?? null;
