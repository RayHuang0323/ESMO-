// ============================================================================
//  platform/contracts/matchSeries.js — MatchSeries.v1（CS Season M4-A）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  M3-2 讓年度 Major 成為 BO3，但玩家打不了：一場 `MatchResult.v1` 只代表
//  **一張地圖**，結算不了一個 series，所以兩條路徑都 fail-closed。
//  要讓它可玩，就必須有一個地方記著「這個 series 打到哪了」。
//
//  ── 這個地方**不是** SeasonState（規格 D4）───────────────────────────────
//  賽季層只認 series 的最終結果（一筆 FixtureOutcome，比分是地圖數）。
//  「第一張圖誰贏、下一張打哪張」是**對戰流程的狀態**，不是賽季的事實。
//  放進 SeasonState 會讓賽季狀態開始長出地圖層級的欄位——那正是 ownership lock
//  要擋的方向。所以 series 掛在 `MatchSession.series`，跟著場次生、跟著場次死。
//
//  ── ⛔ 這裡累積什麼、不累積什麼 ───────────────────────────────────────────
//  **累積**：已完成的地圖（第幾張、哪張圖、誰贏、對應的 matchId / resultId）、
//           雙方的地圖勝場數、下一張是第幾張／哪張圖。
//  **不累積**：回合數、半場、加時、單圖比分、任何 map runtime 細節。
//           那些是 Codex 的責任區（`EsportsFPS3D.jsx` / MR12），
//           它們的歸宿是每一張地圖自己的 `CsMatchResult` 與 ActiveMatch snapshot。
//
//  ⚠ 每一張地圖的 `winner` 是**直接抄** Codex 判好的單圖勝負，
//    本檔不從任何比分推導勝負。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================

export const MATCH_SERIES_VERSION = "MatchSeries.v1";

/** 支援的 BO 制 → 要拿幾張地圖才算贏。**沒列在這裡的一律不支援。** */
export const SERIES_MAPS_TO_WIN = Object.freeze({ bo3: 2 });

export const SERIES_STATUSES = Object.freeze({
  in_progress: "in_progress",
  decided: "decided",
});

/** 這個 `matchFormat` 是不是一個本檔支援的 series。 */
export const seriesFormatOf = (matchFormat) => {
  const f = matchFormat?.series ?? null;
  return f && SERIES_MAPS_TO_WIN[f] ? f : null;
};

/**
 * 由 fixture 的 `matchFormat` 開一個新的 series。
 *
 * @param {object} matchFormat  { series, mapPool, veto }
 * @returns {{ok:boolean, series:object|null, errors:Array}}
 */
export function createMatchSeries(matchFormat) {
  const format = seriesFormatOf(matchFormat);
  if (!format) {
    return { ok: false, series: null, errors: [{ code: "format", message: `不支援的 series 賽制：${matchFormat?.series ?? "(無)"}` }] };
  }
  const mapPool = Array.isArray(matchFormat.mapPool) ? [...matchFormat.mapPool] : [];
  if (mapPool.length === 0) {
    return { ok: false, series: null, errors: [{ code: "map_pool", message: "series 缺少地圖池" }] };
  }
  const mapsToWin = SERIES_MAPS_TO_WIN[format];
  //  ⚠ 三張池的 BO3 ＝ 打滿三張、先拿兩張者勝，**veto 是裝飾**（規格 D4）。
  //    所以「下一張打哪張」就照池子的順序走，不假裝有 ban/pick 博弈。
  //    真正的 veto 要等引擎地圖池擴到 7 張，那是另一條工作線。
  return {
    ok: true,
    errors: [],
    series: {
      schema: MATCH_SERIES_VERSION,
      format,
      mapsToWin,
      //  一個 series 最多打幾張（BO3 ⇒ 3）。用來擋「第四張」這種不可能的狀態。
      maxMaps: mapsToWin * 2 - 1,
      mapPool,
      maps: [],
      wins: { us: 0, opponent: 0 },
      nextMapIndex: 0,
      nextMapKey: mapPool[0] ?? null,
      status: SERIES_STATUSES.in_progress,
      winner: null,
    },
  };
}

/** 這個 series 打完了嗎。 */
export const isSeriesDecided = (series) => series?.status === SERIES_STATUSES.decided;

/** series 目前的地圖比分（玩家視角）。 */
export const seriesScore = (series) => ({
  us: Number(series?.wins?.us) || 0,
  opponent: Number(series?.wins?.opponent) || 0,
});

/** 這個 matchId 的地圖是不是已經記過了。 */
export const hasSeriesMap = (series, matchId) =>
  (series?.maps ?? []).some((m) => m.matchId === matchId);

/**
 * 記下一張打完的地圖。**以 `matchId` 冪等**——同一張圖記兩次不會變成兩勝。
 *
 * ⚠ 冪等是這一支最重要的性質，不是附帶的：賽後結算會在重整／重送時被重跑，
 *   而 `settleMatchResultInState` 對「已入帳」的結果仍然會走完整條路徑。
 *   少了這一道，重整一次 Result 畫面就可能讓一個 2:0 變成 3:0。
 *
 * @param {object} series
 * @param {object} p.matchId  這張地圖的 matchId（Codex 的 CsMatchResult 帶來的）
 * @param {"us"|"opponent"} p.winner  **直接抄**單圖勝負，不由比分推導
 * @param {string} [p.mapKey]
 * @param {string} [p.resultId]
 * @returns {{ok:boolean, series:object, recorded:boolean, decided:boolean, errors:Array}}
 */
export function recordSeriesMap(series, { matchId, winner, mapKey = null, resultId = null } = {}) {
  if (!series || series.schema !== MATCH_SERIES_VERSION) {
    return { ok: false, series, recorded: false, decided: false, errors: [{ code: "series", message: "series 狀態無效" }] };
  }
  if (winner !== "us" && winner !== "opponent") {
    return { ok: false, series, recorded: false, decided: false, errors: [{ code: "winner", message: `地圖勝負必須是 us/opponent，收到 ${winner}` }] };
  }
  if (!matchId) {
    return { ok: false, series, recorded: false, decided: false, errors: [{ code: "match_id", message: "地圖結果缺少 matchId" }] };
  }
  //  ── 冪等：同一張地圖記過就原樣回傳 ──────────────────────────────────
  if (hasSeriesMap(series, matchId)) {
    return { ok: true, series, recorded: false, decided: isSeriesDecided(series), errors: [] };
  }
  //  ── 打完的 series 不再收地圖 ────────────────────────────────────────
  //  ⚠ 這一道與上面的冪等**不是同一件事**：那道擋的是「同一張圖記兩次」，
  //    這道擋的是「2:0 之後又送來第三張圖」。少了它，一個已決勝的 series
  //    會被續寫成 2:1，而 FixtureOutcome 可能已經用 2:0 寫進賽季了。
  if (isSeriesDecided(series)) {
    return {
      ok: false, series, recorded: false, decided: true,
      errors: [{ code: "series_decided", message: "這個 series 已經分出勝負，不再接受新的地圖結果" }],
    };
  }

  const index = series.maps.length;
  const maps = [...series.maps, {
    index,
    mapKey: mapKey ?? series.mapPool[index] ?? null,
    winner,
    matchId,
    resultId: resultId ?? null,
  }];
  const wins = {
    us: maps.filter((m) => m.winner === "us").length,
    opponent: maps.filter((m) => m.winner === "opponent").length,
  };
  const decided = wins.us >= series.mapsToWin || wins.opponent >= series.mapsToWin;
  const nextIndex = maps.length;

  return {
    ok: true,
    recorded: true,
    decided,
    errors: [],
    series: {
      ...series,
      maps,
      wins,
      nextMapIndex: decided ? null : nextIndex,
      nextMapKey: decided ? null : (series.mapPool[nextIndex] ?? null),
      status: decided ? SERIES_STATUSES.decided : SERIES_STATUSES.in_progress,
      winner: decided ? (wins.us > wins.opponent ? "us" : "opponent") : null,
    },
  };
}

/** 畫面用的可讀摘要（不含任何判斷；也不含任何 map runtime 細節）。 */
export function seriesView(series) {
  if (!series || series.schema !== MATCH_SERIES_VERSION) return null;
  return {
    format: series.format,
    mapsToWin: series.mapsToWin,
    score: seriesScore(series),
    played: series.maps.length,
    maps: series.maps.map(({ index, mapKey, winner }) => ({ index, mapKey, winner })),
    nextMapIndex: series.nextMapIndex,
    nextMapKey: series.nextMapKey,
    decided: isSeriesDecided(series),
    winner: series.winner,
    label: `${series.format.toUpperCase()} ${seriesScore(series).us}:${seriesScore(series).opponent}`,
  };
}
