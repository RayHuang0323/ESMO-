// ============================================================================
//  platform/competition/playoffs.js — 季後賽（Milestone Q6）
//
//  ── 為什麼不是第二套賽事流程 ──────────────────────────────────────────────
//  `Fixture.v1` 本來就帶 `stageId`（Q2a 就有），所以季後賽場次可以**直接放進
//  同一個 `state.fixtures`**：出賽閘道、房間、場次、日曆推進、AI 模擬、棄權、
//  賽果回寫——一行都不用改。本檔只做兩件既有架構沒有的事：
//    ① 常規賽結束 → 依 Standings 產生 **Qualification**（Top 4 晉級）
//    ② 依晉級名單排出 **single_elim** 的對戰表
//
//  ── 為什麼分兩輪產生 ──────────────────────────────────────────────────────
//  決賽與季軍戰的對手，要等準決賽打完才知道。契約 `createFixture` 要求
//  `sideA` / `sideB` 是**真的隊伍識別碼**，不接受佔位字串——這是對的：
//  一個「對手未定」的 Fixture 沒辦法被出賽閘道簽發，硬塞佔位只會讓下游多一套
//  「這是不是假隊伍」的判斷。所以本檔的產生器是**冪等、可重複呼叫**的：
//  每次呼叫只補出「現在資料足夠、而且還沒排過」的那些場次。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { createStage, createFixture, STAGE_FORMATS, isFixtureTerminal } from "../contracts/competition.js";

/** 季後賽賽段的 key（`stage.id` 由它推導，與常規賽的 `regular` 並列）。 */
export const PLAYOFF_STAGE_KEY = "playoffs";

/** 晉級名額。MVP 固定 Top 4——賽制與名額一起改才有意義，不做成參數化半套。 */
export const PLAYOFF_SLOTS = 4;

/** 對戰表的三個輪次。順序即產生順序。 */
export const PLAYOFF_ROUNDS = Object.freeze({ semi: 1, bronze: 2, final: 2 });

/** 季後賽場次的 key（`fixture.id` 由 stage + round + 雙方推導，決定性）。 */
export const PLAYOFF_MATCHES = Object.freeze(["sf1", "sf2", "bronze", "final"]);

/**
 * 依常規賽積分榜產生晉級資格。
 *
 * ⚠ **本檔不排名次**——`standings.rows` 已經是排好的（`standings.js` 是唯一排序點）。
 *   這裡只是把前 N 列取出來，附上「第幾種子」。
 *
 * @param {object} p.standings  `computeStandings()` 的輸出（**必須是常規賽的**）
 * @param {object} p.stage      常規賽賽段（晉級邊的來源）
 * @param {string} p.toStageId  晉級到哪一個賽段
 * @returns {{ok:boolean, qualification:object|null, errors:Array}}
 */
export function createQualification({ standings, stage, toStageId, slots = PLAYOFF_SLOTS } = {}) {
  const rows = standings?.rows ?? [];
  if (rows.length < slots) {
    return { ok: false, qualification: null, errors: [{ code: "not_enough", message: `晉級需要至少 ${slots} 支隊伍，只有 ${rows.length} 支` }] };
  }
  if (!stage?.id || !toStageId) {
    return { ok: false, qualification: null, errors: [{ code: "stage", message: "晉級邊缺少來源或目的賽段" }] };
  }
  return {
    ok: true,
    errors: [],
    qualification: {
      schema: "Qualification.v1",
      id: `qual:${stage.id}:top${slots}`,
      fromStageId: stage.id,
      toStageId,
      rule: `top${slots}`,
      slots,
      //  只存身分與種子，不存任何戰力／積分——與 Stage.participants 同一條界線
      qualified: rows.slice(0, slots).map((r, i) => ({
        seed: i + 1, teamId: r.teamId, name: r.name ?? null, tag: r.tag ?? null, isAi: !!r.isAi,
      })),
    },
  };
}

/**
 * 建立季後賽賽段（4 隊單淘汰）。
 *
 * @param {object} p.competition
 * @param {object} p.qualification  `createQualification()` 的輸出
 * @param {object} p.dayRange       { from, to } 賽季日區間（接在常規賽之後）
 * @param {string} [p.key]         賽段 key（`stage.id` 由它推導）。
 *   預設 `playoffs` ⇒ **MOBA 既有存檔的 stage.id 逐字不變**。
 *   CS 年度 Major 傳 `major`：那個賽制**整個就是**這張對戰表，不是某個聯賽的
 *   季後賽，叫 `stage:comp:cs:s1:official:major:playoffs` 會讓 id 自己說謊。
 *   ⚠ 只有 id 與可讀性受影響——對戰表的產生規則一個字都沒有分岔。
 */
export function createPlayoffStage({ competition, qualification, dayRange, key = PLAYOFF_STAGE_KEY } = {}) {
  const q = qualification?.qualified ?? [];
  if (q.length !== PLAYOFF_SLOTS) {
    return { ok: false, stage: null, errors: [{ code: "qualified", message: `季後賽需要正好 ${PLAYOFF_SLOTS} 支晉級隊伍` }] };
  }
  const made = createStage({
    competition,
    format: STAGE_FORMATS.single_elim,
    participants: q.map(({ teamId, name, tag, isAi }) => ({ id: teamId, name, tag, isAi })),
    legs: 1,
    key,
    dayRange,
  });
  if (!made.ok) return { ok: false, stage: null, errors: made.errors };
  //  晉級邊掛在賽段上（Stage Graph 的邊，Q2a 就備好的欄位）
  return { ok: true, stage: { ...made.stage, qualifications: [qualification.id] }, errors: [] };
}

/** 這一場季後賽的勝方（沒打完回 null）。 */
const winnerOf = (fixtures, outcomes, key) => {
  const f = fixtures.find((x) => x.playoffKey === key);
  if (!f || !isFixtureTerminal(f)) return null;
  return outcomes.find((o) => o.fixtureId === f.id)?.winner ?? null;
};

/** 這一場季後賽的敗方（沒打完回 null）。 */
const loserOfMatch = (fixtures, outcomes, key) => {
  const f = fixtures.find((x) => x.playoffKey === key);
  if (!f || !isFixtureTerminal(f)) return null;
  const w = outcomes.find((o) => o.fixtureId === f.id)?.winner ?? null;
  if (!w) return null;
  return w === f.sideA ? f.sideB : f.sideA;
};

/**
 * 補出「現在排得出來、而且還沒排過」的季後賽場次。**冪等、可重複呼叫。**
 *
 * 第一次呼叫排兩場準決賽（1v4、2v3——標準單淘汰種子配對）；
 * 兩場準決賽都收尾之後再呼叫，才排得出季軍戰與決賽。
 *
 * @param {object} p.stage        季後賽賽段
 * @param {object} p.qualification
 * @param {Array}  p.fixtures     **季後賽既有的**場次（不含常規賽）
 * @param {Array}  p.outcomes     全部賽果（用來查準決賽勝敗）
 * @param {number} p.baseDay      季後賽第一天（賽季日）
 * @param {object} [p.matchFormat] 項目專屬設定，原樣掛到每一場（共用層不解讀）。
 *   預設 `null` ⇒ **MOBA 季後賽的場次逐值不變**。CS 年度 Major 傳
 *   `CS_MAJOR_MATCH_FORMAT`（bo3），讓對戰表的每一場都是一個 series。
 * @returns {{ok:boolean, added:Array, errors:Array}}
 */
export function ensurePlayoffFixtures({ stage, qualification, fixtures = [], outcomes = [], baseDay, matchFormat = null } = {}) {
  const q = qualification?.qualified ?? [];
  if (q.length !== PLAYOFF_SLOTS) return { ok: false, added: [], errors: [{ code: "qualified", message: "晉級名單不完整" }] };
  const seed = (n) => q.find((x) => x.seed === n)?.teamId ?? null;
  const has = (key) => fixtures.some((f) => f.playoffKey === key);
  const added = [];

  const make = (key, round, day, sideA, sideB) => {
    const made = createFixture({ stage, round, day, sideA, sideB, matchFormat });
    if (!made.ok) return made.errors;
    //  `playoffKey` 是本檔自己的標記（sf1／sf2／bronze／final），
    //  讓「這是哪一場」不必靠日期或順序去猜。
    added.push({ ...made.fixture, playoffKey: key });
    return null;
  };

  //  ── 第一輪：兩場準決賽 ──
  if (!has("sf1")) { const e = make("sf1", PLAYOFF_ROUNDS.semi, baseDay, seed(1), seed(4)); if (e) return { ok: false, added: [], errors: e }; }
  if (!has("sf2")) { const e = make("sf2", PLAYOFF_ROUNDS.semi, baseDay, seed(2), seed(3)); if (e) return { ok: false, added: [], errors: e }; }

  //  ── 第二輪：要兩場準決賽都收尾才排得出來 ──
  const all = [...fixtures, ...added];
  const w1 = winnerOf(all, outcomes, "sf1"), w2 = winnerOf(all, outcomes, "sf2");
  const l1 = loserOfMatch(all, outcomes, "sf1"), l2 = loserOfMatch(all, outcomes, "sf2");
  if (w1 && w2) {
    const day2 = baseDay + 2;
    //  季軍戰排在決賽之前（真實賽事慣例；也讓「輸了還要打」先打完）
    if (!has("bronze")) { const e = make("bronze", PLAYOFF_ROUNDS.bronze, day2, l1, l2); if (e) return { ok: false, added: [], errors: e }; }
    if (!has("final")) { const e = make("final", PLAYOFF_ROUNDS.final, day2, w1, w2); if (e) return { ok: false, added: [], errors: e }; }
  }
  return { ok: true, added, errors: [] };
}

/**
 * 季後賽打完之後的**前四名順序**。
 *
 * 冠 = 決賽勝方、亞 = 決賽敗方、季 = 季軍戰勝方、殿 = 季軍戰敗方。
 * 任何一場沒打完就回 null——**不猜、不用常規賽名次補**。
 *
 * @returns {{ok:boolean, order:string[]|null, championTeamId:string|null}}
 */
export function playoffOrder({ fixtures = [], outcomes = [] } = {}) {
  const champion = winnerOf(fixtures, outcomes, "final");
  const runnerUp = loserOfMatch(fixtures, outcomes, "final");
  const third = winnerOf(fixtures, outcomes, "bronze");
  const fourth = loserOfMatch(fixtures, outcomes, "bronze");
  if (!champion || !runnerUp || !third || !fourth) {
    return { ok: false, order: null, championTeamId: null };
  }
  return { ok: true, order: [champion, runnerUp, third, fourth], championTeamId: champion };
}

/** 對戰表的可讀摘要（畫面用；不含任何判斷）。 */
export function playoffBracket({ fixtures = [], outcomes = [], participants = [] } = {}) {
  const nameOf = (id) => participants.find((p) => p.id === id)?.name ?? id ?? "—";
  return PLAYOFF_MATCHES.map((key) => {
    const f = fixtures.find((x) => x.playoffKey === key);
    if (!f) return { key, exists: false };
    const o = outcomes.find((x) => x.fixtureId === f.id) ?? null;
    return {
      key, exists: true, fixtureId: f.id, day: f.day,
      sideA: f.sideA, sideB: f.sideB, nameA: nameOf(f.sideA), nameB: nameOf(f.sideB),
      done: isFixtureTerminal(f),
      winner: o?.winner ?? null,
      winnerName: o?.winner ? nameOf(o.winner) : null,
      score: o?.score ?? null,
    };
  });
}
