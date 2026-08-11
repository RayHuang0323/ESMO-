// ============================================================================
//  platform/contracts/competition.js — Competition / Stage / Fixture（Milestone Q2a）
//
//  ── 這一層在整條管線的位置 ────────────────────────────────────────────────
//    [本檔] Competition → Stage → Fixture ─┐
//                                          ↓ 產生 assignment（origin: fixture）
//    [O4–O7] Assignment → Room → Session → MatchResult
//                                          ↓ 消費結果
//    [Q2b/Q4] Standings / FinalStandings ──┘
//
//  **賽事系統是既有比賽管線的上游排程器與下游記分器，不是第二條比賽路徑。**
//  本檔只定義形狀與狀態機；產生賽程在 `competition/scheduleGenerator.js`。
//
//  ── 紅線 ──────────────────────────────────────────────────────────────────
//  · Competition **不產生比賽結果**。Fixture 上沒有任何勝負／比分欄位，
//    驗證會擋掉夾帶（與 O4 指派單同一條界線）。
//  · Stage Graph 的圖結構現在就存在（`stageIds[]` / Qualification 型別），
//    但 **Q2a 的圖只有一個節點、零條邊**。第二階段加季後賽是「加節點加邊」，
//    不是改模型。
//  · 項目差異（BO 制、換邊、Ban/Pick 順序、map veto）原樣掛在 `Fixture.matchFormat`，
//    **共用層不認得這些欄位**，只負責傳遞。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================

export const COMPETITION_VERSION = "Competition.v1";
export const STAGE_VERSION = "Stage.v1";
export const FIXTURE_VERSION = "Fixture.v1";

/** 賽制。**Q2a 只實作 `round_robin`**，其餘是第二階段的節點型別。 */
export const STAGE_FORMATS = Object.freeze({
  round_robin: "round_robin",
  swiss: "swiss",
  single_elim: "single_elim",
  double_elim: "double_elim",
});

/** Q2a 已實作的賽制（賽程產生器認得的）。 */
export const IMPLEMENTED_FORMATS = Object.freeze([STAGE_FORMATS.round_robin]);

export function stageFormatLabel(f) {
  return ({
    round_robin: "循環賽", swiss: "瑞士輪", single_elim: "單敗淘汰", double_elim: "雙敗淘汰",
  })[f] ?? f;
}

/**
 * 賽程場次狀態（規格 D12 / Q12）。
 *   scheduled  已排定，尚未開打
 *   launched   已進場（**不可回到 scheduled**，堵死「快輸時中離規避敗場」）
 *   completed  已完成，產生 FixtureOutcome（Q2b／Q3）
 *   forfeited  棄權判負（未出賽，或逾期未完成）
 */
export const FIXTURE_STATES = Object.freeze({
  scheduled: "scheduled",
  launched: "launched",
  completed: "completed",
  forfeited: "forfeited",
});

export const FIXTURE_TERMINAL = Object.freeze(["completed", "forfeited"]);

/** 合法轉移表。**唯一來源**——畫面與 Store 不得自己判斷。 */
const FIXTURE_TRANSITIONS = Object.freeze({
  scheduled: ["launched", "forfeited"],
  //  ⚠ launched 不得回到 scheduled（Q12 的核心不變式）
  launched: ["completed", "forfeited"],
  completed: [],
  forfeited: [],
});

export const canFixtureTransition = (from, to) => (FIXTURE_TRANSITIONS[from] ?? []).includes(to);
export const isFixtureTerminal = (f) => !!f && FIXTURE_TERMINAL.includes(f.status);

export function fixtureStatusLabel(s) {
  return ({ scheduled: "已排定", launched: "進行中", completed: "已完成", forfeited: "棄權判負" })[s] ?? s;
}

/** FNV-1a → 8 位十六進位（與 matchEntry / matchOrigin 同一套決定性雜湊）。 */
function hash8(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

//  ⛔ 賽事實體一律不得夾帶比賽結果（與 O4 指派單同一條紅線）
const RESULT_KEYS = Object.freeze([
  "winner", "result", "score", "rewards", "kills", "mvp", "outcome",
  "power", "stats", "rating",
]);
const leakedKeys = (obj) => Object.keys(obj ?? {}).filter((k) => RESULT_KEYS.includes(k));

// ── Competition ─────────────────────────────────────────────────────────────

/**
 * 建立賽事。
 *
 * @param {object} p
 * @param {"moba"|"cs"} p.gameMode
 * @param {number} p.season       賽季編號（來自 meta.season）
 * @param {string} p.organizerId  主辦方（官方／第三方；Q2a 固定官方）
 * @param {string} p.tier         層級標籤（純顯示，共用層不解讀）
 */
export function createCompetition({
  gameMode = "moba", season = 1, organizerId = "official", tier = "regular",
  name = "", prizeTable = [],
} = {}) {
  const errors = [];
  if (gameMode !== "moba" && gameMode !== "cs") errors.push({ code: "mode", message: `gameMode 必須為 moba/cs，收到 ${gameMode}` });
  if (!Number.isInteger(season) || season < 1) errors.push({ code: "season", message: "賽季編號必須是 1 以上的整數" });
  if (!organizerId) errors.push({ code: "organizer", message: "賽事必須有主辦方" });
  if (errors.length) return { ok: false, competition: null, errors };

  const id = `comp:${gameMode}:s${season}:${organizerId}:${tier}`;
  return {
    ok: true,
    errors: [],
    competition: {
      schema: COMPETITION_VERSION,
      id,
      gameMode,
      seasonId: `season:${gameMode}:s${season}`,
      season,
      organizerId,
      tier,
      name: name || `第 ${season} 賽季 常規賽`,
      //  名次獎金表（Q4 的 settleCompetitionAward 消費；Q2a 只攜帶）
      prizeTable,
      //  Stage Graph：Q2a 只有一個節點、零條邊
      stageIds: [],
      qualifications: [],
    },
  };
}

export function validateCompetition(c) {
  const errors = [];
  if (!c || typeof c !== "object") return { ok: false, errors: [{ code: "invalid", message: "賽事不是物件" }] };
  if (c.schema !== COMPETITION_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${COMPETITION_VERSION}` });
  if (!c.id) errors.push({ code: "id", message: "賽事缺少識別碼" });
  if (c.gameMode !== "moba" && c.gameMode !== "cs") errors.push({ code: "mode", message: "賽事的 gameMode 不合法" });
  if (!Array.isArray(c.stageIds)) errors.push({ code: "stages", message: "賽事的 stageIds 必須是陣列" });
  if (!Array.isArray(c.qualifications)) errors.push({ code: "quals", message: "賽事的 qualifications 必須是陣列" });
  const leak = leakedKeys(c);
  if (leak.length) errors.push({ code: "result_leak", message: `賽事不得夾帶比賽結果：${leak.join(", ")}` });
  return { ok: errors.length === 0, errors };
}

// ── Stage ───────────────────────────────────────────────────────────────────

/**
 * 建立賽段。
 *
 * @param {object} p
 * @param {object} p.competition
 * @param {string} p.format        STAGE_FORMATS 之一
 * @param {Array}  p.participants  參賽者（只有身分：{id, name, tag, isAi}）
 * @param {object} p.dayRange      { from, to } 賽季日區間
 */
export function createStage({
  competition, format = STAGE_FORMATS.round_robin, participants = [],
  dayRange = { from: 1, to: 84 }, legs = 2, key = "regular", standingsRule = "win3",
} = {}) {
  const errors = [];
  if (!competition || competition.schema !== COMPETITION_VERSION) {
    errors.push({ code: "competition", message: "賽段必須屬於一個合法的賽事" });
  }
  if (!STAGE_FORMATS[format]) errors.push({ code: "format", message: `未知的賽制：${format}` });
  if (!Array.isArray(participants) || participants.length < 2) {
    errors.push({ code: "participants", message: "賽段至少要有兩名參賽者" });
  }
  //  參賽者只能有身分，不得夾帶戰力（伺服器自己查——與 O3 申請單同一條界線）
  for (const p of participants ?? []) {
    if (!p?.id) { errors.push({ code: "participant_id", message: "參賽者缺少識別碼" }); break; }
    const leak = leakedKeys(p);
    if (leak.length) { errors.push({ code: "participant_values", message: `參賽者不得夾帶數值：${leak.join(", ")}` }); break; }
  }
  const ids = (participants ?? []).map((p) => p?.id);
  if (new Set(ids).size !== ids.length) errors.push({ code: "duplicate_participant", message: "同一個參賽者不得重複報名" });
  if (!Number.isInteger(legs) || legs < 1 || legs > 2) errors.push({ code: "legs", message: "循環數必須是 1（單循環）或 2（雙循環）" });
  if (errors.length) return { ok: false, stage: null, errors };

  return {
    ok: true,
    errors: [],
    stage: {
      schema: STAGE_VERSION,
      id: `stage:${competition.id}:${key}`,
      competitionId: competition.id,
      gameMode: competition.gameMode,
      key,
      format,
      legs,
      //  只存身分，不存戰力
      participants: participants.map((p) => ({ id: p.id, name: p.name ?? null, tag: p.tag ?? null, isAi: !!p.isAi })),
      standingsRule,
      dayRange: { from: dayRange.from, to: dayRange.to },
      //  Stage Graph：Q2a 沒有晉級邊
      qualifications: [],
    },
  };
}

export function validateStage(s) {
  const errors = [];
  if (!s || typeof s !== "object") return { ok: false, errors: [{ code: "invalid", message: "賽段不是物件" }] };
  if (s.schema !== STAGE_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${STAGE_VERSION}` });
  if (!s.id) errors.push({ code: "id", message: "賽段缺少識別碼" });
  if (!s.competitionId) errors.push({ code: "competition", message: "賽段必須屬於一個賽事" });
  if (!STAGE_FORMATS[s.format]) errors.push({ code: "format", message: "賽段的賽制不合法" });
  if (!Array.isArray(s.participants) || s.participants.length < 2) errors.push({ code: "participants", message: "賽段至少要有兩名參賽者" });
  const leak = leakedKeys(s);
  if (leak.length) errors.push({ code: "result_leak", message: `賽段不得夾帶比賽結果：${leak.join(", ")}` });
  return { ok: errors.length === 0, errors };
}

// ── Fixture ─────────────────────────────────────────────────────────────────

/**
 * 建立一場預定的對戰。
 *
 * `fixtureId` 由賽段 + 輪次 + 對戰雙方決定性推導 ⇒ 同一份賽程重排會得到同一批
 * id，且**主客場互換是不同的 id**（`sideA|sideB` 有序）。
 *
 * @param {object} p
 * @param {object} p.stage
 * @param {number} p.round     輪次（1 起算）
 * @param {number} p.day       賽季日
 * @param {string} p.sideA     主場隊伍 id
 * @param {string} p.sideB     客場隊伍 id
 * @param {object} p.matchFormat 項目專屬設定（BO 制等；共用層不解讀，原樣攜帶）
 */
export function createFixture({ stage, round, day, sideA, sideB, matchFormat = null } = {}) {
  const errors = [];
  if (!stage || stage.schema !== STAGE_VERSION) errors.push({ code: "stage", message: "賽程場次必須屬於一個合法的賽段" });
  if (!Number.isInteger(round) || round < 1) errors.push({ code: "round", message: "輪次必須是 1 以上的整數" });
  if (!Number.isInteger(day) || day < 1) errors.push({ code: "day", message: "賽季日必須是 1 以上的整數" });
  if (!sideA || !sideB) errors.push({ code: "sides", message: "賽程場次必須有對戰雙方" });
  if (sideA && sideA === sideB) errors.push({ code: "same_side", message: "同一支隊伍不能對上自己" });
  if (stage?.participants && sideA && sideB) {
    const ids = new Set(stage.participants.map((p) => p.id));
    if (!ids.has(sideA) || !ids.has(sideB)) errors.push({ code: "not_participant", message: "對戰雙方必須都是本賽段的參賽者" });
  }
  if (errors.length) return { ok: false, fixture: null, errors };

  return {
    ok: true,
    errors: [],
    fixture: {
      schema: FIXTURE_VERSION,
      //  有序：主客場互換 ⇒ 不同 id
      id: `fx:${stage.gameMode}:${hash8(`${stage.id}|r${round}|${sideA}|${sideB}`)}`,
      stageId: stage.id,
      competitionId: stage.competitionId,
      gameMode: stage.gameMode,
      round,
      day,
      sideA,
      sideB,
      //  項目專屬設定原樣攜帶，共用層不解讀
      matchFormat,
      status: FIXTURE_STATES.scheduled,
      //  ⚠ 這裡**沒有**勝負、比分、獎勵欄位——賽果是 FixtureOutcome 的事（Q2b）
    },
  };
}

export function validateFixture(f) {
  const errors = [];
  if (!f || typeof f !== "object") return { ok: false, errors: [{ code: "invalid", message: "賽程場次不是物件" }] };
  if (f.schema !== FIXTURE_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${FIXTURE_VERSION}` });
  if (!f.id) errors.push({ code: "id", message: "賽程場次缺少識別碼" });
  if (!f.stageId) errors.push({ code: "stage", message: "賽程場次必須屬於一個賽段" });
  if (!f.competitionId) errors.push({ code: "competition", message: "賽程場次必須屬於一個賽事" });
  if (!f.sideA || !f.sideB) errors.push({ code: "sides", message: "賽程場次缺少對戰雙方" });
  if (f.sideA && f.sideA === f.sideB) errors.push({ code: "same_side", message: "同一支隊伍不能對上自己" });
  if (!FIXTURE_STATES[f.status]) errors.push({ code: "status", message: `未知的場次狀態：${f.status}` });
  const leak = leakedKeys(f);
  if (leak.length) errors.push({ code: "result_leak", message: `賽程場次不得夾帶比賽結果：${leak.join(", ")}` });
  return { ok: errors.length === 0, errors };
}

/**
 * 場次狀態轉移。**唯一入口**——不合法的轉移一律拒絕，不會產生半套狀態。
 *
 * ⚠ `launched → scheduled` 一律拒絕（Q12：中離不得規避敗場）。
 */
export function transitionFixture(fixture, next, { reason = null } = {}) {
  if (!fixture || fixture.schema !== FIXTURE_VERSION) {
    return { ok: false, fixture: null, errors: [{ code: "invalid_fixture", message: "賽程場次無效" }] };
  }
  if (!FIXTURE_STATES[next]) {
    return { ok: false, fixture: null, errors: [{ code: "unknown_state", message: `未知場次狀態 ${next}` }] };
  }
  if (!canFixtureTransition(fixture.status, next)) {
    return {
      ok: false, fixture: null,
      errors: [{ code: "illegal_transition", message: `場次無法從「${fixtureStatusLabel(fixture.status)}」變更為「${fixtureStatusLabel(next)}」` }],
    };
  }
  if (next === FIXTURE_STATES.forfeited && !reason) {
    return { ok: false, fixture: null, errors: [{ code: "reason_required", message: "棄權判負必須附上原因" }] };
  }
  return {
    ok: true,
    errors: [],
    fixture: { ...fixture, status: next, reason: next === FIXTURE_STATES.forfeited ? reason : (fixture.reason ?? null) },
  };
}

/** 這場是不是玩家的比賽。 */
export const involvesTeam = (fixture, teamId) => !!fixture && (fixture.sideA === teamId || fixture.sideB === teamId);

/** 對手是誰（不是參賽者則回 null）。 */
export function opponentOf(fixture, teamId) {
  if (!involvesTeam(fixture, teamId)) return null;
  return fixture.sideA === teamId ? fixture.sideB : fixture.sideA;
}

/** 這場對某隊而言是主場還是客場。 */
export function sideOf(fixture, teamId) {
  if (!involvesTeam(fixture, teamId)) return null;
  return fixture.sideA === teamId ? "home" : "away";
}
