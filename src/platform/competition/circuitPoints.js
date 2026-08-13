// ============================================================================
//  platform/competition/circuitPoints.js — 巡迴積分與晉級資格（Milestone Q7a-3c）
//
//  產品語意：賽季 → 巡迴賽體系 → 單一賽事 → 最終名次 → 巡迴積分 → 晉級資格
//
//  ── 為什麼是獨立的一支，而不是寫進 seasonState ────────────────────────────
//  ① Q5 §7d 那條紅線斷言：`seasonState.js` 內**不得出現 `circuitPoints`**。
//     3a 把它從「擋 circuit」收窄成「擋 circuitPoints」時講得很白：身分可以
//     進賽季層，**積分玩法擋在門外**。3c 沒有理由去改那條斷言——它要擋的事
//     現在依然對：賽季層負責「賽程與名次」，積分是另一個生命週期。
//  ② 積分結算與**獎金結算**是同一層的事，而獎金一直住在 Store
//     （`settleCompetitionAwardInState`），不在 seasonState 裡。積分放這裡，
//     兩者在 `_sealSeasonIfFinished` 並排，讀的人一眼看得出它們是兄弟。
//
//  ── 三條不能破的線 ────────────────────────────────────────────────────────
//  ① **積分只能從 Event 封存後的 `final` 產生**。不得從 FixtureOutcome 重算——
//     那會變成第二份晉級真相，而且 outcome 是可以持續追加的，名次不是。
//     每一筆積分都帶 `finalId`，來源可驗。
//  ② **fail-closed**：沒有 `pointsPolicy` ⇒ `policy_required`，
//     **不得默認 0 分、不得產生假結算**。「政策說這個名次 0 分」與
//     「沒有政策」是兩件完全不同的事，前者要記帳，後者要擋住。
//  ③ **`pointsLog` 是唯一的積分帳本**，只 append、不改既有元素；
//     `points` 一律由它推導（`circuitPointsOf`）。Event 只留
//     `pointsSettlementRef`（收據），**不複製任何分數**。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const CIRCUIT_POINTS_VERSION = "CircuitPoints.v1";
export const POINTS_POLICY_VERSION = "PointsPolicy.v1";
export const POINTS_ENTRY_VERSION = "CircuitPointsEntry.v1";
export const POINTS_SETTLEMENT_VERSION = "PointsSettlement.v1";
export const CIRCUIT_QUALIFICATION_VERSION = "CircuitQualification.v1";

/**
 * 積分狀態。**只有三種**，而且是 fail-closed 的三種：
 *   not_started     還沒有積分可算（Event 尚未封存，或封存後尚未結算）
 *   policy_required 有最終名次了，**但沒有政策** ⇒ 明確擋住，不是 0 分
 *   settled         已結算，帳本裡有這個 Event 的紀錄
 */
export const POINTS_STATUS = Object.freeze({
  not_started: "not_started",
  policy_required: "policy_required",
  settled: "settled",
});

/**
 * 層級倍率。MVP 只有三級；**數字集中在政策裡**，不散落在程式碼各處。
 * ⚠ 查不到對應倍率的層級 ⇒ **不是 1.0**，是擋下來（見 `multiplierFor`）。
 *   預設 1.0 會讓一個沒定義的層級悄悄照 regular 給分。
 */
export const TIER_MULTIPLIERS = Object.freeze({
  regular: 1.0,
  major: 1.5,
  championship: 2.0,
});

/**
 * MVP 的保守積分表。**之後要平衡就改這裡一處**，不必動任何規則程式碼。
 *
 * ⚠ `bands` 沒涵蓋到的名次 ⇒ 0 分。這是**政策明講的 0**，會照常記進帳本；
 *   與「沒有政策」（`policy_required`）是完全不同的兩件事。
 */
export const DEFAULT_POINTS_POLICY = Object.freeze({
  schema: POINTS_POLICY_VERSION,
  kind: "rank_table",
  key: "mvp-conservative-v1",
  bands: Object.freeze([
    Object.freeze({ from: 1, to: 1, points: 100 }),
    Object.freeze({ from: 2, to: 2, points: 70 }),
    Object.freeze({ from: 3, to: 3, points: 50 }),
    Object.freeze({ from: 4, to: 4, points: 35 }),
    Object.freeze({ from: 5, to: 8, points: 15 }),
  ]),
  tierMultipliers: TIER_MULTIPLIERS,
});

/** 晉級名額。MVP 固定 Top 4（與季後賽同一條理由：名額與賽制要一起改才有意義）。 */
export const CIRCUIT_QUAL_SLOTS = 4;

/** 晉級資格的種類。MVP 只有一種：年度總決賽。 */
export const QUALIFICATION_KINDS = Object.freeze({ championship: "championship" });

// ── 政策查詢 ────────────────────────────────────────────────────────────────

/** 這個名次依政策值幾分（未涵蓋 ⇒ 0）。 */
export function pointsForRank(policy, rank) {
  const r = Number(rank);
  if (!Number.isInteger(r) || r < 1) return 0;
  const band = (policy?.bands ?? []).find((b) => r >= b.from && r <= b.to);
  return band ? Number(band.points) || 0 : 0;
}

/**
 * 這個 Event 的層級倍率。
 * `event.tierMultiplier` 可覆寫（產品說 Event「可再帶」倍率），否則查政策的表。
 * **查不到 ⇒ 回 `null`**（不是 1.0），由呼叫端擋成 `policy_required`。
 */
export function multiplierFor(policy, event) {
  const override = event?.tierMultiplier;
  if (override != null) {
    const n = Number(override);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const m = (policy?.tierMultipliers ?? {})[event?.tier];
  return Number.isFinite(m) && m >= 0 ? m : null;
}

/** 這個 Event 所屬 Circuit 的積分政策（沒有 ⇒ `null`）。 */
export function policyForEvent(state, eventId) {
  const ev = state?.events?.[eventId] ?? null;
  if (!ev) return null;
  return state?.circuits?.[ev.circuitId]?.pointsPolicy ?? null;
}

// ── 帳本讀取（`points` 一律由這裡推導，不落盤）──────────────────────────────

/** 積分帳本。**唯一真相**，只 append。 */
export const pointsLogOf = (state) => state?.pointsLog ?? [];

/** 某個 Event 產生的所有積分紀錄。 */
export const pointsEntriesOfEvent = (state, eventId) =>
  pointsLogOf(state).filter((e) => e.eventId === eventId);

/** 某個 Circuit 底下的所有積分紀錄。 */
export const pointsEntriesOfCircuit = (state, circuitId) =>
  pointsLogOf(state).filter((e) => e.circuitId === circuitId);

// ── 狀態判定（fail-closed）──────────────────────────────────────────────────

/**
 * 這個 Event 的積分狀態。
 *
 * ⚠ 判斷順序刻意是「已結算 → 沒封存 → 沒政策」：
 *   已經結算過的東西，就算之後政策被拿掉，帳本仍然成立（帳本不可變）。
 */
export function pointsStatusOfEvent(state, eventId, finalOf) {
  const ev = state?.events?.[eventId] ?? null;
  if (!ev) return { status: POINTS_STATUS.not_started, reason: "找不到這個賽事", ref: null };

  if (pointsEntriesOfEvent(state, eventId).length > 0) {
    return { status: POINTS_STATUS.settled, reason: null, ref: ev.pointsSettlementRef ?? null };
  }
  const final = typeof finalOf === "function" ? finalOf(state, eventId) : (ev.final ?? null);
  if (!final) {
    return { status: POINTS_STATUS.not_started, reason: "賽事還沒封存，沒有最終名次", ref: null };
  }
  const policy = policyForEvent(state, eventId);
  if (!policy) {
    return {
      status: POINTS_STATUS.policy_required,
      reason: "這條巡迴賽體系沒有積分政策，不得給分（沒有政策 ≠ 0 分）",
      ref: null,
    };
  }
  if (multiplierFor(policy, ev) == null) {
    return {
      status: POINTS_STATUS.policy_required,
      reason: `層級 ${ev.tier ?? "(無)"} 沒有對應的積分倍率，不得給分`,
      ref: null,
    };
  }
  return { status: POINTS_STATUS.not_started, reason: "已封存、政策齊備，尚未結算", ref: null };
}

/** 現在結算得了嗎（`applySettleEventPoints` 的前置條件，可單獨查詢）。 */
export function canSettleEventPoints(state, eventId, finalOf) {
  const st = pointsStatusOfEvent(state, eventId, finalOf);
  if (st.status === POINTS_STATUS.settled) return { ok: false, settled: true, reason: "這個賽事的積分已經結算過了" };
  if (st.status === POINTS_STATUS.policy_required) return { ok: false, settled: false, reason: st.reason };
  const ev = state?.events?.[eventId] ?? null;
  const final = typeof finalOf === "function" ? finalOf(state, eventId) : (ev?.final ?? null);
  if (!final) return { ok: false, settled: false, reason: st.reason };
  if (!Array.isArray(final.rows) || final.rows.length === 0) {
    return { ok: false, settled: false, reason: "最終名次沒有任何一列" };
  }
  return { ok: true, settled: false, reason: null };
}

// ── 結算 ────────────────────────────────────────────────────────────────────

/**
 * 依 Event 的最終名次寫入積分。
 *
 * ⚠ **來源只有 `final.rows`**——不看 `state.outcomes` 一眼。
 * ⚠ **每一支排名內的隊伍都寫一筆**（含 0 分）：帳本要能回答「這一站誰參加了、
 *   拿了幾分」。少寫 0 分那些，一支只拿過第 9 名的隊伍就會整個從巡迴榜消失。
 * ⚠ **冪等**：帳本裡已經有這個 Event 的紀錄 ⇒ 原樣回傳，`alreadySettled: true`。
 *   判定看**帳本**而不是看收據——帳本才是真相，收據掉了也不能重發。
 *
 * @param {function} finalOf  取封存名次的函式（`seasonState.eventFinalOf`）。
 *   注入而不是 import，是為了不讓本檔反向依賴賽季層。
 */
export function applySettleEventPoints(state, eventId, finalOf) {
  const ev = state?.events?.[eventId] ?? null;
  if (!ev) {
    return { ok: false, state, entries: [], alreadySettled: false, errors: [{ code: "no_event", message: "找不到這個賽事" }] };
  }
  const can = canSettleEventPoints(state, eventId, finalOf);
  if (!can.ok) {
    if (can.settled) {
      return { ok: true, state, entries: pointsEntriesOfEvent(state, eventId), alreadySettled: true, errors: [] };
    }
    const status = pointsStatusOfEvent(state, eventId, finalOf).status;
    return { ok: false, state, entries: [], alreadySettled: false, errors: [{ code: status, message: can.reason }] };
  }

  const final = typeof finalOf === "function" ? finalOf(state, eventId) : ev.final;
  const policy = policyForEvent(state, eventId);
  const mult = multiplierFor(policy, ev);

  const entries = final.rows.map((row) => {
    const base = pointsForRank(policy, row.rank);
    return {
      schema: POINTS_ENTRY_VERSION,
      //  決定性 id：同一站同一隊只會有一筆
      id: `cpt:${eventId}:${row.teamId}`,
      circuitId: ev.circuitId ?? null,
      eventId,
      //  名次是哪一個賽制決定的（資格賽不進 Event 最終名次，見 3b）
      competitionId: ev.rankingCompetitionId ?? null,
      //  **來源存證**：這筆分數是哪一份封存名次算出來的
      finalId: final.id ?? null,
      teamId: row.teamId,
      teamName: row.name ?? null,
      rank: row.rank,
      policyKey: policy.key ?? null,
      basePoints: base,
      tier: ev.tier ?? null,
      tierMultiplier: mult,
      //  ⚠ 四捨五入是政策的一部分：35 × 1.5 = 52.5 一定要有明確去向。
      points: Math.round(base * mult),
      sealedAtDay: final.sealedAtDay ?? null,
    };
  });

  const ref = {
    schema: POINTS_SETTLEMENT_VERSION,
    id: `cps:${eventId}`,
    eventId,
    circuitId: ev.circuitId ?? null,
    finalId: final.id ?? null,
    policyKey: policy.key ?? null,
    entryCount: entries.length,
    settledAtDay: final.sealedAtDay ?? null,
    //  ⚠ 這裡**故意不放任何分數**。Event 只留收據，積分真相在帳本裡。
  };

  return {
    ok: true,
    alreadySettled: false,
    errors: [],
    entries,
    state: {
      ...state,
      //  只 append，既有元素一個都不動
      pointsLog: [...pointsLogOf(state), ...entries],
      events: { ...state.events, [eventId]: { ...ev, pointsSettlementRef: ref } },
    },
  };
}

/**
 * 把所有「結算得了」的 Event 一次結清。
 *
 * ⚠ 為什麼不是「剛封存的那個才結算」：那樣一來，**在 3c 之前就封存好的
 *   Event 永遠不會拿到積分**，而且重載之後也補不回來。改成每次都掃全部，
 *   結算就變成冪等的自我修復——跑幾次都一樣。
 */
export function settleAllPendingPoints(state, finalOf) {
  let next = state;
  const settled = [];
  for (const eventId of Object.keys(state?.events ?? {})) {
    const r = applySettleEventPoints(next, eventId, finalOf);
    if (r.ok && !r.alreadySettled) { next = r.state; settled.push(eventId); }
  }
  return { state: next, settled };
}

// ── 巡迴榜（全部由帳本推導）────────────────────────────────────────────────

/**
 * 一條巡迴賽體系的積分榜。
 *
 * 同分依序比：① 冠軍數 ② 前三名次數 ③ 最近一站的名次 ④ team.id
 *
 * ⚠ 第 ③ 條用的是**每支隊伍自己最近一筆**紀錄的名次，不是「兩隊在同一站的
 *   相對名次」。後者在排序裡是成對比較，遇到三隊互相牽制會不可遞移，排出來的
 *   順序會依輸入順序而變——那就不是決定性排名了。
 * ⚠ 第 ④ 條保證**全序**：team.id 唯一，所以永遠排得出唯一結果。
 */
export function circuitStandings(state, circuitId) {
  const entries = pointsEntriesOfCircuit(state, circuitId);
  const byTeam = new Map();
  for (const e of entries) {
    const cur = byTeam.get(e.teamId) ?? {
      teamId: e.teamId, name: e.teamName ?? null,
      points: 0, events: 0, championships: 0, podiums: 0, entries: [],
    };
    cur.points += Number(e.points) || 0;
    cur.events += 1;
    if (e.rank === 1) cur.championships += 1;
    if (e.rank <= 3) cur.podiums += 1;
    cur.name = cur.name ?? e.teamName ?? null;
    cur.entries.push(e);
    byTeam.set(e.teamId, cur);
  }

  const latestOf = (row) => {
    //  最近一站：先比封存日，同日再比 eventId（字典序）⇒ 決定性
    const sorted = [...row.entries].sort((a, b) =>
      (Number(b.sealedAtDay) || 0) - (Number(a.sealedAtDay) || 0) ||
      String(b.eventId).localeCompare(String(a.eventId)));
    return sorted[0] ?? null;
  };

  const rows = [...byTeam.values()].map((r) => {
    const latest = latestOf(r);
    return {
      teamId: r.teamId, name: r.name, points: r.points, events: r.events,
      championships: r.championships, podiums: r.podiums,
      latestEventId: latest?.eventId ?? null,
      latestRank: latest?.rank ?? null,
    };
  });

  rows.sort((a, b) =>
    b.points - a.points ||
    b.championships - a.championships ||
    b.podiums - a.podiums ||
    (a.latestRank ?? Number.MAX_SAFE_INTEGER) - (b.latestRank ?? Number.MAX_SAFE_INTEGER) ||
    String(a.teamId).localeCompare(String(b.teamId)));

  return {
    schema: CIRCUIT_POINTS_VERSION,
    circuitId,
    rule: "points/champs/podiums/latest/teamId",
    rows: rows.map((r, i) => ({ rank: i + 1, ...r })),
  };
}

/** 某一隊在某條巡迴賽體系的總積分（純推導，等同帳本加總）。 */
export const circuitPointsOf = (state, circuitId, teamId) =>
  pointsEntriesOfCircuit(state, circuitId)
    .filter((e) => e.teamId === teamId)
    .reduce((n, e) => n + (Number(e.points) || 0), 0);

// ── 晉級資格 ────────────────────────────────────────────────────────────────

/** 這條巡迴賽體系底下的所有 Event id。 */
const eventIdsOfCircuit = (state, circuitId) =>
  Object.entries(state?.events ?? {}).filter(([, ev]) => ev.circuitId === circuitId).map(([id]) => id);

export const qualificationsOf = (state) => Object.values(state?.qualifications ?? {});
export const circuitQualificationOf = (state, circuitId) =>
  qualificationsOf(state).find((q) => q.circuitId === circuitId) ?? null;

/**
 * 現在可以核發晉級資格了嗎。
 *
 * ⚠ **每一站都結算完才發**。少算一站，積分榜就是暫時的，據此發出去的資格會是錯的，
 *   而資格是正式資料、不是畫面標籤——發錯要收回比不發難得多。
 *   所以只要有任何一站是 `not_started` 或 `policy_required`，這裡就擋住。
 */
export function canGrantCircuitQualification(state, circuitId, finalOf) {
  if (!state?.circuits?.[circuitId]) return { ok: false, granted: false, reason: "找不到這條巡迴賽體系" };
  if (circuitQualificationOf(state, circuitId)) {
    return { ok: false, granted: true, reason: "這條巡迴賽體系的晉級資格已經核發過了" };
  }
  const ids = eventIdsOfCircuit(state, circuitId);
  if (ids.length === 0) return { ok: false, granted: false, reason: "這條巡迴賽體系底下沒有賽事" };

  const pending = ids.filter((id) => pointsStatusOfEvent(state, id, finalOf).status !== POINTS_STATUS.settled);
  if (pending.length > 0) {
    const first = pointsStatusOfEvent(state, pending[0], finalOf);
    return {
      ok: false, granted: false,
      reason: pending.length === 1
        ? `賽事 ${pending[0]} 的積分尚未結算（${first.status}）`
        : `還有 ${pending.length} 個賽事的積分尚未結算`,
    };
  }
  const rows = circuitStandings(state, circuitId).rows;
  if (rows.length < CIRCUIT_QUAL_SLOTS) {
    return { ok: false, granted: false, reason: `晉級需要至少 ${CIRCUIT_QUAL_SLOTS} 支隊伍，只有 ${rows.length} 支` };
  }
  return { ok: true, granted: false, reason: null };
}

/**
 * 核發年度總決賽的晉級資格（巡迴積分前 4）。
 *
 * ⚠ 這是**正式資料**：存進 `state.qualifications`，帶得走、驗得到、可被後續
 *   賽事當作參賽條件，不是畫面上的一個標籤。
 * ⚠ 一經核發即不可變（同 D11）：重複呼叫回既有那一份，不重算、不覆寫。
 */
export function applyGrantCircuitQualification(state, circuitId, grantedAtDay, finalOf) {
  const can = canGrantCircuitQualification(state, circuitId, finalOf);
  if (!can.ok) {
    if (can.granted) {
      return { ok: true, state, qualification: circuitQualificationOf(state, circuitId), alreadyGranted: true, errors: [] };
    }
    return { ok: false, state, qualification: null, alreadyGranted: false, errors: [{ code: "not_ready", message: can.reason }] };
  }
  const standings = circuitStandings(state, circuitId);
  const qualification = {
    schema: CIRCUIT_QUALIFICATION_VERSION,
    id: `qual:${circuitId}:${QUALIFICATION_KINDS.championship}:top${CIRCUIT_QUAL_SLOTS}`,
    circuitId,
    kind: QUALIFICATION_KINDS.championship,
    rule: `top${CIRCUIT_QUAL_SLOTS}`,
    slots: CIRCUIT_QUAL_SLOTS,
    grantedAtDay: Number(grantedAtDay) || null,
    //  結算依據的那幾站，讓「這份資格怎麼來的」可回溯
    sourceEventIds: eventIdsOfCircuit(state, circuitId).slice().sort(),
    qualified: standings.rows.slice(0, CIRCUIT_QUAL_SLOTS).map((r) => ({
      seed: r.rank, teamId: r.teamId, name: r.name ?? null,
      points: r.points, championships: r.championships, podiums: r.podiums,
    })),
  };
  return {
    ok: true,
    alreadyGranted: false,
    errors: [],
    qualification,
    state: { ...state, qualifications: { ...(state.qualifications ?? {}), [qualification.id]: qualification } },
  };
}

/** 把所有「發得了」的巡迴賽體系一次發完（冪等）。 */
export function grantAllReadyQualifications(state, grantedAtDay, finalOf) {
  let next = state;
  const granted = [];
  for (const circuitId of Object.keys(state?.circuits ?? {})) {
    const r = applyGrantCircuitQualification(next, circuitId, grantedAtDay, finalOf);
    if (r.ok && !r.alreadyGranted) { next = r.state; granted.push(r.qualification.id); }
  }
  return { state: next, granted };
}

// ── 賽季封存摘要（Q7a-3d）──────────────────────────────────────────────────

export const CIRCUIT_SUMMARY_VERSION = "CircuitSeasonSummary.v1";

/**
 * 把一整季的巡迴成果壓成一份**可以帶過換季**的摘要。
 *
 * ⚠ 為什麼需要這個：換季會換掉整個賽季狀態，`pointsLog` 跟著歸零——那是對的，
 *   積分本來就每季重來（Circuit id 綁賽季）。但玩家上一季拿了幾分、排第幾、
 *   有沒有晉級，**不能就這樣消失**。
 * ⚠ 只留結論，不留中間計算：每站保留最終名次與該站得分，加上總分、總排名、
 *   晉級名單。不保留 `finalId` 以外的推導細節——那些在當季已經驗過了，
 *   歷史頁需要的是「發生了什麼」，不是「怎麼算出來的」。
 */
export function summarizeCircuitSeason(state, circuitId, finalOf) {
  const circuit = state?.circuits?.[circuitId] ?? null;
  if (!circuit) return null;
  const entries = pointsEntriesOfCircuit(state, circuitId);
  if (entries.length === 0) return null;      // 沒有積分的巡迴賽不留空白紀錄

  const eventIds = eventIdsOfCircuit(state, circuitId);
  const standings = circuitStandings(state, circuitId);
  const mine = standings.rows.find((r) => r.teamId === state.playerTeamId) ?? null;

  return {
    schema: CIRCUIT_SUMMARY_VERSION,
    id: `csum:${circuitId}`,
    circuitId,
    circuitName: circuit.name ?? circuitId,
    season: circuit.season ?? state.season ?? null,
    playerTeamId: state.playerTeamId ?? null,
    playerRank: mine?.rank ?? null,
    playerPoints: mine?.points ?? 0,
    //  各站：最終名次 ＋ 該站取得的積分
    events: eventIds.map((id) => {
      const ev = state.events[id];
      const final = typeof finalOf === "function" ? finalOf(state, id) : (ev?.final ?? null);
      const mineHere = entries.filter((e) => e.eventId === id);
      return {
        eventId: id,
        name: ev?.name ?? id,
        tier: ev?.tier ?? null,
        tierMultiplier: mineHere[0]?.tierMultiplier ?? null,
        finalId: final?.id ?? null,
        sealedAtDay: final?.sealedAtDay ?? null,
        rows: [...mineHere]
          .sort((a, b) => a.rank - b.rank)
          .map((e) => ({ rank: e.rank, teamId: e.teamId, name: e.teamName ?? null, points: e.points })),
      };
    }),
    //  最終總分與巡迴排名
    standings: standings.rows.map((r) => ({
      rank: r.rank, teamId: r.teamId, name: r.name,
      points: r.points, events: r.events, championships: r.championships, podiums: r.podiums,
    })),
    //  晉級名單（沒發出來就是 null，不編一份假的）
    qualification: circuitQualificationOf(state, circuitId),
  };
}

/** 這一季所有有積分的巡迴賽摘要（換季前呼叫）。 */
export const summarizeAllCircuits = (state, finalOf) =>
  Object.keys(state?.circuits ?? {})
    .map((id) => summarizeCircuitSeason(state, id, finalOf))
    .filter(Boolean);

/** 這一隊拿到晉級資格了嗎（正式資料查詢，不是畫面標籤）。 */
export const isQualified = (state, teamId, circuitId = null) =>
  qualificationsOf(state).some((q) =>
    (circuitId == null || q.circuitId === circuitId) &&
    (q.qualified ?? []).some((x) => x.teamId === teamId));
