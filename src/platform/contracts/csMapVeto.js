// ============================================================================
//  platform/contracts/csMapVeto.js — CS Map Selection / Veto（CS-C5V）
//
//  Competition 的 Fixture.matchFormat 只宣告賽制；本檔管理一場 MatchSession
//  內的選圖進度。它不建立第二套 Competition / MatchSession / Battle authority。
//  純函式：不 import React / Zustand / localStorage / 時鐘。
// ============================================================================
import { CS_MAPS, mapFit } from "../../battle/fps/csPrepData.js";

export const CS_MAP_SELECTION_SCHEMA = "CsMapSelection.v1";
export const CS_MAP_VETO_RULES_SCHEMA = "CsMapVetoRules.v1";
export const CS_MAP_KEYS = Object.freeze(CS_MAPS.map((map) => map.key));

export const CS_MAP_SELECTION_KINDS = Object.freeze({
  practice: "practice",
  matchmaking: "matchmaking",
  bo1: "bo1",
  bo3: "bo3",
});

export const CS_MAP_SELECTION_STATUS = Object.freeze({
  pending: "pending",
  resolved: "resolved",
  invalid: "invalid",
});

const makeRules = (series) => Object.freeze({
  schema: CS_MAP_VETO_RULES_SCHEMA,
  series,
  flow: series === "bo3"
    ? Object.freeze(["ban", "pick", "pick", "decider"])
    : Object.freeze(["ban", "ban", "decider"]),
  requiredMaps: series === "bo3" ? 3 : 1,
  aiPolicy: "deterministic-weighted-v1",
});

export const CS_BO1_MATCH_FORMAT = Object.freeze({
  //  shared Competition 只把 truthy `series` 視為多地圖 series；BO1 不是 series。
  series: null,
  bestOf: 1,
  mapPool: CS_MAP_KEYS,
  veto: makeRules("bo1"),
});

export const CS_BO3_MATCH_FORMAT = Object.freeze({
  series: "bo3",
  mapPool: CS_MAP_KEYS,
  veto: makeRules("bo3"),
});

const hash32 = (input) => {
  const text = String(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const unique = (items) => [...new Set(items)];
const otherSide = (side) => (side === "us" ? "opponent" : "us");
const mapOf = (key) => CS_MAPS.find((map) => map.key === key) ?? null;

export function normalizeCsMapPool(pool, { fallback = CS_MAP_KEYS } = {}) {
  const legal = unique((Array.isArray(pool) ? pool : []).filter((key) => CS_MAP_KEYS.includes(key)));
  return legal.length ? legal : [...fallback];
}

export function normalizeCsMapPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    acceptedPool: normalizeCsMapPool(source.acceptedPool),
    practiceMapKey: CS_MAP_KEYS.includes(source.practiceMapKey) ? source.practiceMapKey : "mirage",
  };
}

const historyScore = (history, mapKey) => {
  const rows = (Array.isArray(history) ? history : []).filter((row) => row?.mapId === mapKey);
  if (!rows.length) return { score: 50, games: 0, wins: 0 };
  const wins = rows.filter((row) => row.winner === "us").length;
  return { score: Math.round((wins / rows.length) * 100), games: rows.length, wins };
};

const styleBonus = (style, mapKey) => {
  const table = {
    aggressive: { inferno: 8, dust2: 5, mirage: 2 },
    tactical: { mirage: 9, inferno: 5, dust2: 3 },
    awpCore: { dust2: 9, mirage: 6, inferno: 2 },
    synergy: { mirage: 8, inferno: 6, dust2: 3 },
    stable: { dust2: 7, mirage: 5, inferno: 4 },
    defensive: { inferno: 8, dust2: 6, mirage: 3 },
    elite: { mirage: 6, dust2: 6, inferno: 6 },
    highPotential: { dust2: 5, inferno: 5, mirage: 5 },
  };
  return table[style]?.[mapKey] ?? 0;
};

const tacticBonus = (tacticType, mapKey) => {
  if (tacticType === "rush") return mapKey === "inferno" ? 7 : mapKey === "dust2" ? 5 : 2;
  if (tacticType === "execute") return mapKey === "mirage" ? 7 : mapKey === "inferno" ? 5 : 3;
  return 0;
};

/**
 * 建立一方的 map score snapshot。分數只用既有 roster/mapFit、真實 csHistory、
 * AI team style 與已選 tactic；資料缺少時才加入很小的 deterministic fallback。
 */
export function csMapScorecard({ roster = [], history = [], style = null, tacticType = null, seed = 0, side = "us" } = {}) {
  const hasRoster = Array.isArray(roster) && roster.length > 0;
  const scores = {};
  const evidence = {};
  for (const mapKey of CS_MAP_KEYS) {
    const map = mapOf(mapKey);
    const fit = hasRoster ? mapFit(roster, map) : { score: null, grade: "未知" };
    const past = historyScore(history, mapKey);
    const fitScore = fit.score == null ? 50 : fit.score;
    const historyWeight = past.games > 0 ? Math.min(0.36, 0.12 + past.games * 0.06) : 0;
    const fallback = hash32(`${seed}:${side}:${mapKey}:fallback`) % 7;
    const score = Math.round(
      fitScore * (0.72 - historyWeight / 2)
      + past.score * historyWeight
      + styleBonus(style, mapKey)
      + tacticBonus(tacticType, mapKey)
      + fallback,
    );
    scores[mapKey] = score;
    evidence[mapKey] = {
      score,
      rosterFit: fit.score,
      rosterFitGrade: fit.grade,
      historyGames: past.games,
      historyWins: past.wins,
      style: style ?? null,
      tacticType: tacticType ?? null,
      fallback,
    };
  }
  return { scores, evidence };
}

const selectionId = ({ kind, seed, mapPool, playerPool = [], opponentPool = [] }) =>
  `csmap:${kind}:${hash32(`${seed}:${mapPool.join(",")}:${playerPool.join(",")}:${opponentPool.join(",")}`).toString(16)}`;

const resolvedSelection = ({ kind, seed, mapPool, playerPool, opponentPool, commonPool, finalMapKey, mapOrder = null, notes = [], scores = null, scoreEvidence = null }) => ({
  schema: CS_MAP_SELECTION_SCHEMA,
  selectionId: selectionId({ kind, seed, mapPool, playerPool, opponentPool }),
  kind,
  status: CS_MAP_SELECTION_STATUS.resolved,
  seed,
  format: kind,
  mapPool,
  playerPool,
  opponentPool,
  commonPool,
  remaining: finalMapKey ? [finalMapKey] : [],
  banned: [],
  picks: [],
  mapOrder: mapOrder ?? (finalMapKey ? [finalMapKey] : []),
  finalMapKey,
  phase: "complete",
  turn: null,
  firstSide: null,
  log: [],
  notes,
  scores,
  scoreEvidence,
});

export function createPracticeMapSelection({ mapKey, seed = 0 } = {}) {
  const selected = CS_MAP_KEYS.includes(mapKey) ? mapKey : null;
  if (!selected) {
    return { ok: false, selection: null, errors: [{ code: "practice_map", message: "請先選擇快速練習地圖" }] };
  }
  return {
    ok: true,
    errors: [],
    selection: resolvedSelection({
      kind: CS_MAP_SELECTION_KINDS.practice,
      seed,
      mapPool: [...CS_MAP_KEYS],
      playerPool: [selected],
      opponentPool: [...CS_MAP_KEYS],
      commonPool: [selected],
      finalMapKey: selected,
      notes: ["玩家直接選擇快速練習地圖"],
    }),
  };
}

const weightedChoice = (keys, weights, seedKey) => {
  if (!keys.length) return null;
  const normalized = keys.map((key) => Math.max(1, Number(weights[key]) || 1));
  const total = normalized.reduce((sum, value) => sum + value, 0);
  let roll = hash32(seedKey) % total;
  for (let i = 0; i < keys.length; i += 1) {
    if (roll < normalized[i]) return keys[i];
    roll -= normalized[i];
  }
  return keys[keys.length - 1];
};

export function createMatchmakingMapSelection({ playerPool, opponentPool, seed = 0 } = {}) {
  const ours = normalizeCsMapPool(playerPool);
  const theirs = normalizeCsMapPool(opponentPool);
  const common = CS_MAP_KEYS.filter((key) => ours.includes(key) && theirs.includes(key));
  if (!common.length) {
    return { ok: false, selection: null, errors: [{ code: "no_common_map", message: "雙方沒有共同可接受的地圖，請調整地圖池後重新配對" }] };
  }
  const weights = Object.fromEntries(common.map((key) => [key, 10 + (hash32(`${seed}:${key}:common`) % 11)]));
  const finalMapKey = weightedChoice(common, weights, `${seed}:matchmaking-map`);
  return {
    ok: true,
    errors: [],
    selection: resolvedSelection({
      kind: CS_MAP_SELECTION_KINDS.matchmaking,
      seed,
      mapPool: [...CS_MAP_KEYS],
      playerPool: ours,
      opponentPool: theirs,
      commonPool: common,
      finalMapKey,
      notes: ["比賽地圖只從雙方地圖池交集決定", "資料不足時使用 deterministic weighted fallback"],
      scores: { system: weights },
    }),
  };
}

const normalizeFormat = (matchFormat) => {
  const series = matchFormat?.series === "bo3" ? "bo3" : "bo1";
  const mapPool = normalizeCsMapPool(matchFormat?.mapPool);
  return { series, mapPool, veto: matchFormat?.veto ?? (series === "bo3" ? CS_BO3_MATCH_FORMAT.veto : CS_BO1_MATCH_FORMAT.veto) };
};

const settleAutomaticPhase = (selection) => {
  if (selection.kind === CS_MAP_SELECTION_KINDS.bo1 && selection.remaining.length === 1) {
    const finalMapKey = selection.remaining[0];
    return { ...selection, status: CS_MAP_SELECTION_STATUS.resolved, phase: "complete", turn: null, finalMapKey, mapOrder: [finalMapKey] };
  }
  if (selection.kind === CS_MAP_SELECTION_KINDS.bo3 && selection.phase === "ban" && selection.remaining.length <= 3) {
    return { ...selection, phase: "pick", turn: selection.firstSide };
  }
  return selection;
};

export function createCsMapVeto({ matchFormat, seed = 0, us = {}, opponent = {} } = {}) {
  const format = normalizeFormat(matchFormat);
  const kind = format.series === "bo3" ? CS_MAP_SELECTION_KINDS.bo3 : CS_MAP_SELECTION_KINDS.bo1;
  if (kind === CS_MAP_SELECTION_KINDS.bo3 && format.mapPool.length < 3) {
    return { ok: false, selection: null, errors: [{ code: "bo3_pool", message: "BO3 至少需要三張地圖" }] };
  }
  const usCard = csMapScorecard({ ...us, seed, side: "us" });
  const opponentCard = csMapScorecard({ ...opponent, seed, side: "opponent" });
  const firstSide = hash32(`${seed}:${format.series}:first-side`) % 2 === 0 ? "us" : "opponent";
  const notes = [];
  if (kind === CS_MAP_SELECTION_KINDS.bo3 && format.mapPool.length === 3) {
    notes.push("現役三圖池需保留三張供 BO3，淘汰式 Ban 階段自動略過");
  }
  let selection = {
    schema: CS_MAP_SELECTION_SCHEMA,
    selectionId: selectionId({ kind, seed, mapPool: format.mapPool }),
    kind,
    status: CS_MAP_SELECTION_STATUS.pending,
    seed,
    format: format.series,
    rules: format.veto,
    mapPool: format.mapPool,
    playerPool: [...format.mapPool],
    opponentPool: [...format.mapPool],
    commonPool: [...format.mapPool],
    remaining: [...format.mapPool],
    banned: [],
    picks: [],
    mapOrder: [],
    finalMapKey: null,
    phase: "ban",
    turn: firstSide,
    firstSide,
    log: [],
    notes,
    scores: { us: usCard.scores, opponent: opponentCard.scores },
    scoreEvidence: { us: usCard.evidence, opponent: opponentCard.evidence },
  };
  selection = settleAutomaticPhase(selection);
  return { ok: true, selection, errors: [] };
}

export function legalCsMapVetoActions(selection) {
  if (selection?.schema !== CS_MAP_SELECTION_SCHEMA || selection.status !== CS_MAP_SELECTION_STATUS.pending) return [];
  return [...(selection.remaining ?? [])];
}

export function applyCsMapVetoAction(selection, { side, mapKey, source = "player" } = {}) {
  if (selection?.schema !== CS_MAP_SELECTION_SCHEMA || selection.status !== CS_MAP_SELECTION_STATUS.pending) {
    return { ok: false, selection, errors: [{ code: "veto_state", message: "目前沒有可執行的選圖動作" }] };
  }
  if (side !== selection.turn) {
    return { ok: false, selection, errors: [{ code: "veto_turn", message: "目前不是這一方的選圖回合" }] };
  }
  if (!selection.remaining.includes(mapKey)) {
    return { ok: false, selection, errors: [{ code: "veto_map", message: "這張地圖已不在可選範圍內" }] };
  }
  const event = { index: selection.log.length, phase: selection.phase, side, mapKey, source };
  let next = { ...selection, log: [...selection.log, event] };

  if (selection.phase === "ban") {
    next = {
      ...next,
      remaining: selection.remaining.filter((key) => key !== mapKey),
      banned: [...selection.banned, { side, mapKey }],
      turn: otherSide(side),
    };
    next = settleAutomaticPhase(next);
    return { ok: true, selection: next, errors: [] };
  }

  if (selection.phase === "pick") {
    const remaining = selection.remaining.filter((key) => key !== mapKey);
    const picks = [...selection.picks, { side, mapKey }];
    const mapOrder = [...selection.mapOrder, mapKey];
    if (picks.length < 2) {
      return { ok: true, errors: [], selection: { ...next, remaining, picks, mapOrder, turn: otherSide(side) } };
    }
    const decider = remaining[0] ?? null;
    const finalOrder = decider ? [...mapOrder, decider] : mapOrder;
    return {
      ok: true,
      errors: [],
      selection: {
        ...next,
        remaining,
        picks,
        mapOrder: finalOrder,
        finalMapKey: finalOrder[0] ?? null,
        phase: "complete",
        turn: null,
        status: CS_MAP_SELECTION_STATUS.resolved,
        log: decider ? [...next.log, { index: next.log.length, phase: "decider", side: null, mapKey: decider, source: "rules" }] : next.log,
      },
    };
  }

  return { ok: false, selection, errors: [{ code: "veto_phase", message: "未知的選圖階段" }] };
}

export function chooseAiCsMapAction(selection) {
  if (selection?.status !== CS_MAP_SELECTION_STATUS.pending || selection.turn !== "opponent") return null;
  const keys = legalCsMapVetoActions(selection);
  const ours = selection.scores?.opponent ?? {};
  const theirs = selection.scores?.us ?? {};
  const weights = {};
  for (const key of keys) {
    weights[key] = selection.phase === "ban"
      ? Math.max(1, 80 + (theirs[key] ?? 50) - (ours[key] ?? 50))
      : Math.max(1, 80 + (ours[key] ?? 50) - Math.round((theirs[key] ?? 50) * 0.45));
  }
  const mapKey = weightedChoice(keys, weights, `${selection.selectionId}:${selection.log.length}:${selection.phase}:ai`);
  return mapKey ? { side: "opponent", mapKey, source: "deterministic-weighted-ai", weights } : null;
}

/** 將連續的 AI 回合跑到玩家回合或完成；不代替玩家做任何選擇。 */
export function advanceAiCsMapVeto(selection) {
  let current = selection;
  let guard = 0;
  while (current?.status === CS_MAP_SELECTION_STATUS.pending && current.turn === "opponent" && guard < 16) {
    const action = chooseAiCsMapAction(current);
    if (!action) break;
    const applied = applyCsMapVetoAction(current, action);
    if (!applied.ok) break;
    const last = applied.selection.log[applied.selection.log.length - 1];
    current = {
      ...applied.selection,
      log: applied.selection.log.map((entry, index) => (index === last.index ? { ...entry, weights: action.weights } : entry)),
    };
    guard += 1;
  }
  return current;
}

export const selectedCsMapKey = (selection, series = null) => {
  if (series?.status === "in_progress" && series.nextMapKey) return series.nextMapKey;
  return selection?.finalMapKey ?? selection?.mapOrder?.[0] ?? null;
};
