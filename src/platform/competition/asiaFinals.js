// ============================================================================
//  platform/competition/asiaFinals.js — 亞洲年度總決賽（Milestone Q7b）
//
//  產品流程：三站巡迴賽 → Circuit Points → Top 4 qualification
//            → **亞洲年度總決賽** → 年度冠軍
//
//  ── 這一層唯一的職責 ────────────────────────────────────────────────────
//  把**已核發的 Top 4 晉級資格**變成一個真的能打的賽事。
//
//  ⚠ **資格是唯一參賽門檻。** 本檔**不讀** `pointsLog`、**不讀** `circuitStandings`、
//    **不重算**任何名次——只讀 `state.qualifications` 裡那一份已核發的資格。
//    少了它就什麼都不做（fail-closed），不會拿「暫時排名」偷偷補隊伍。
//
//  ── 為什麼是懶建，而不是先放一個 locked 的空殼 ──────────────────────────
//  Q6 的季後賽已經示範過這個形狀：**資料夠了才建，冪等、可重複呼叫**
//  （`ensurePlayoffs`）。照抄它的語意 ⇒ **一個新狀態都不用加**。
//  先建一個「locked / not_ready」的空 Event 反而要多一個狀態、多一套判斷，
//  而且 `createStage` 本來就不接受沒有參賽者的賽段。
//
//  ── 為什麼重用 Q6 的淘汰賽，而不是寫第二套 ──────────────────────────────
//  `createPlayoffStage` 與 `ensurePlayoffFixtures` 本來就是**完全參數化**的：
//  吃任何 competition ＋ 任何「有四個 seed 的資格」，產出 1v4／2v3／季軍戰／決賽。
//  實測直接吃得下 `CircuitQualification.v1`（它的 `seed` 就是巡迴名次）。
//  ⇒ 本檔不含任何對戰表邏輯，只負責「造容器、接上去」。
//
//  ── 季軍戰 ──────────────────────────────────────────────────────────────
//  **有**。不是額外做的——`ensurePlayoffFixtures` 本來就會排，
//  而 `isPlayoffDoneOf` 要求四場都收尾才算結束。刻意拿掉反而要改共用程式碼。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { createCompetition, isFixtureTerminal } from "../contracts/competition.js";
import { createCircuit, createEvent, competitionIdForEvent, ID_SCHEMES } from "../contracts/circuit.js";
import { createPlayoffStage, ensurePlayoffFixtures, PLAYOFF_MATCHES, PLAYOFF_SLOTS } from "./playoffs.js";
//  ⚠ 只 import 資格查詢。**刻意不 import** `circuitStandings` / `pointsLogOf`——
//    那會讓「本檔不重算資格」變成一句口號而不是事實（§紅線有守衛掃這件事）。
import { circuitQualificationOf } from "./circuitPoints.js";
import { ASIA_CIRCUIT_KEY, asiaCircuitIdFor } from "./asiaCircuit.js";
import { FAN_AWARD_POLICY } from "./awardPolicy.js";

export const ASIA_FINALS_KEY = "asia-finals";
export const ASIA_FINALS_EVENT_KEY = "annual";
export const ASIA_FINALS_TIER = "championship";
export const ASIA_FINALS_NAME = "亞洲年度總決賽";

/**
 * 年度總決賽自己的巡迴賽容器 id。
 *
 * ⚠ **刻意不放進亞洲巡迴賽（`asia`）那一條**，兩個理由都是量出來的：
 *   ① `canGrantCircuitQualification` 要求該 circuit 底下**每一站都已結算**。
 *      年度總決賽沒有積分政策，封存後會是 `policy_required` ⇒ 永遠不算「已結算」。
 *      目前不會出事（資格早就核發完，`applyGrant` 會短路回 alreadyGranted），
 *      但那是**靠呼叫順序**才安全的耦合——換個容器就完全不存在。
 *   ② `summarizeCircuitSeason` 會把 circuit 底下每一個 Event 列進歷史摘要，
 *      放同一條的話歷史會多出一站「0 筆積分」的空紀錄。
 *
 * 產品語意上也更準：巡迴賽是**積分賽**，年度總決賽是它的**終點**，不是第四站。
 */
export const asiaFinalsCircuitIdFor = (gameMode, season) => `circuit:${gameMode}:s${season}:${ASIA_FINALS_KEY}`;

function gameModeOf(state) {
  const first = Object.values(state?.competitions ?? {})[0];
  return first?.competition?.gameMode ?? "moba";
}

/** 這個賽季有沒有年度總決賽（冪等判定用）。 */
export const hasAsiaFinals = (state) =>
  !!state?.circuits?.[asiaFinalsCircuitIdFor(gameModeOf(state), state?.season)];

/** 年度總決賽的 Event（沒有 ⇒ null）。 */
export function asiaFinalsEventOf(state) {
  const cid = asiaFinalsCircuitIdFor(gameModeOf(state), state?.season);
  return Object.values(state?.events ?? {}).find((e) => e.circuitId === cid) ?? null;
}

/**
 * 現在建得出年度總決賽了嗎。
 *
 * @returns {{ok:boolean, exists:boolean, reason:string|null, qualification:object|null}}
 */
export function canOpenAsiaFinals(state) {
  if (!state?.schema) return { ok: false, exists: false, reason: "目前沒有賽季", qualification: null };
  if (state.final) return { ok: false, exists: hasAsiaFinals(state), reason: "賽季已封存", qualification: null };
  if (hasAsiaFinals(state)) {
    return { ok: false, exists: true, reason: "年度總決賽已經建立過了", qualification: null };
  }
  const circuitId = asiaCircuitIdFor(gameModeOf(state), state.season);
  if (!state.circuits?.[circuitId]) {
    return { ok: false, exists: false, reason: "這個賽季沒有亞洲巡迴賽", qualification: null };
  }
  //  ⚠ **唯一的門檻**：已核發的晉級資格。沒有就沒有——不看積分榜、不看名次。
  const qualification = circuitQualificationOf(state, circuitId);
  if (!qualification) {
    return {
      ok: false, exists: false, qualification: null,
      reason: "巡迴賽的晉級資格尚未核發（要三站都結算完），年度總決賽還不能開始",
    };
  }
  const q = qualification.qualified ?? [];
  if (q.length !== PLAYOFF_SLOTS) {
    return {
      ok: false, exists: false, qualification: null,
      reason: `年度總決賽需要正好 ${PLAYOFF_SLOTS} 支晉級隊伍，資格上有 ${q.length} 支`,
    };
  }
  return { ok: true, exists: false, reason: null, qualification };
}

/**
 * 建立／補齊年度總決賽。**冪等、可重複呼叫**（與 `ensurePlayoffs` 同一形狀）。
 *
 * 第一次呼叫建立賽事與兩場準決賽；準決賽都收尾之後再呼叫，
 * 才補得出季軍戰與決賽（決賽對手要等準決賽打完才知道）。
 *
 * ⚠ 參賽者**逐隊來自資格名單**。`createPlayoffStage` 只取
 *   `{teamId, name, tag, isAi}`——積分與冠軍數不會跟著進賽段
 *   （賽段不得夾帶數值，`createStage` 會擋）。
 *
 * @param {object} p.participants  賽季的隊伍名單，只用來補 `tag`／`isAi` 這類
 *   **顯示欄位**。⚠ 不影響是誰參賽——那完全由資格決定。
 */
export function ensureAsiaFinals(state, { participants = [] } = {}) {
  if (!state?.schema) return { ok: false, state, added: 0, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
  if (state.final) return { ok: true, state, added: 0, errors: [] };      // 已封存，不再動

  let next = state;
  const gameMode = gameModeOf(state);
  const finalsCircuitId = asiaFinalsCircuitIdFor(gameMode, state.season);

  //  ── ① 還沒有 ⇒ 依**已核發的資格**建立 ────────────────────────────────
  if (!hasAsiaFinals(next)) {
    const can = canOpenAsiaFinals(next);
    //  ⚠ 開不了不是錯誤——資格還沒核發是正常狀態。原樣回傳，什麼都不做。
    if (!can.ok) return { ok: true, state, added: 0, notReady: can.reason, errors: [] };

    const circuit = createCircuit({
      gameMode, season: state.season, circuitKey: ASIA_FINALS_KEY, name: ASIA_FINALS_NAME,
      //  ⚠ **沒有積分政策**：用積分晉級之後又拿積分，會變成循環。
      pointsPolicy: null,
    });
    if (!circuit.ok) return { ok: false, state, added: 0, errors: circuit.errors };

    const event = createEvent({
      circuit: circuit.circuit, eventKey: ASIA_FINALS_EVENT_KEY,
      name: ASIA_FINALS_NAME, tier: ASIA_FINALS_TIER,
    });
    if (!event.ok) return { ok: false, state, added: 0, errors: event.errors };

    const base = createCompetition({
      gameMode, season: state.season, organizerId: ASIA_CIRCUIT_KEY, tier: ASIA_FINALS_TIER,
    });
    if (!base.ok) return { ok: false, state, added: 0, errors: base.errors };
    const competition = {
      ...base.competition,
      id: competitionIdForEvent(event.event, ASIA_FINALS_TIER),
      eventId: event.event.id,
      circuitId: circuit.circuit.id,
      idScheme: ID_SCHEMES.event,
    };

    //  ── 排程：排在**所有既有場次之後**，並且讓開官方聯賽季後賽的窗口 ──
    //  ⚠ 聯賽季後賽排在「最後一場常規賽 +2 / +4」。這裡用 **+6**，
    //    不論它排了沒有都不會撞在一起，也不必回頭去查它排在哪。
    const lastDay = Math.max(...(next.fixtures ?? []).map((f) => f.day), 1);
    const baseDay = lastDay + 6;

    //  ⚠ 顯示欄位（tag／isAi）從賽季名單補上。**參賽者是誰完全由資格決定**，
    //    這裡只是讓對戰表顯示得出隊伍標籤。
    const display = new Map((participants ?? []).map((p) => [p.id, p]));
    const enriched = {
      ...can.qualification,
      qualified: (can.qualification.qualified ?? []).map((x) => ({
        ...x,
        tag: display.get(x.teamId)?.tag ?? null,
        isAi: display.get(x.teamId)?.isAi ?? null,
      })),
    };

    const stage = createPlayoffStage({
      competition, qualification: enriched,
      dayRange: { from: baseDay, to: baseDay + 2 },
    });
    if (!stage.ok) return { ok: false, state, added: 0, errors: stage.errors };

    next = {
      ...next,
      circuits: { ...next.circuits, [finalsCircuitId]: { ...circuit.circuit, eventIds: [event.event.id] } },
      events: {
        ...next.events,
        [event.event.id]: {
          ...event.event,
          competitionIds: [competition.id],
          rankingCompetitionId: competition.id,
          //  ⚠ **沒有獎金**。沿用既有名次獎金表等於替年度總決賽訂一份金額，
          //    那是產品決定，本輪不做（三站巡迴賽同樣沒有獎金）。
          prizePolicy: null,
          //  F2.1：年度總決賽沒有獎金政策（本輪不訂金額），
          //  但它是全年最高舞台 ⇒ 給 fan-only 政策，名次才拿得到粉絲。
          fanPolicy: FAN_AWARD_POLICY,
          final: null,
        },
      },
      competitions: {
        ...next.competitions,
        [competition.id]: {
          competition: { ...competition, stageIds: [stage.stage.id] },
          //  ⚠ `stage` 與 `playoff.stage` **刻意是同一個賽段**：
          //    · `standingsOf` 讀 `stage` ⇒ 算得出四隊的成績（封存需要 rows）
          //    · `playoffOrder` 讀 `playoff.stage` ⇒ 冠軍由**決賽勝方**決定，
          //      而不是由勝場數推。兩者指同一個賽段，所以沒有第二份真相。
          stage: stage.stage,
          playoff: { stage: stage.stage, qualification: can.qualification, baseDay },
          //  ⚠ `true` ⇒ `canSealEvent` 會要求四場都收尾才准封存
          //    （只打完準決賽不能封存，否則會冒出一個沒有決賽的「年度冠軍」）
          expectsPlayoff: true,
        },
      },
    };
  }

  //  ── ② 補出現在排得出來的場次（冪等）──────────────────────────────────
  const ev = asiaFinalsEventOf(next);
  if (!ev) return { ok: true, state: next, added: 0, errors: [] };
  const entry = next.competitions[ev.rankingCompetitionId];
  const existing = (next.fixtures ?? []).filter((f) => f.stageId === entry.playoff.stage.id);
  const made = ensurePlayoffFixtures({
    stage: entry.playoff.stage,
    qualification: entry.playoff.qualification,
    fixtures: existing,
    outcomes: next.outcomes ?? [],
    baseDay: entry.playoff.baseDay,
  });
  if (!made.ok) return { ok: false, state, added: 0, errors: made.errors };
  if (made.added.length) next = { ...next, fixtures: [...next.fixtures, ...made.added] };

  return { ok: true, state: next, added: made.added.length, errors: [] };
}

/** 年度總決賽打完了嗎（四場都在且都收尾）。 */
export function isAsiaFinalsDone(state) {
  const ev = asiaFinalsEventOf(state);
  if (!ev) return false;
  const entry = state?.competitions?.[ev.rankingCompetitionId];
  const fx = (state?.fixtures ?? []).filter((f) => f.stageId === entry?.playoff?.stage?.id);
  return fx.length === PLAYOFF_MATCHES.length && fx.every(isFixtureTerminal);
}
