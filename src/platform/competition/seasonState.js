// ============================================================================
//  platform/competition/seasonState.js — 賽季狀態純 reducer（Milestone Q3）
//
//  ── 為什麼要有這一層 ──────────────────────────────────────────────────────
//  Q3 要把賽事接上 `advanceDay`。如果那些規則直接寫進 `profileStore`，就只能
//  靠瀏覽器驗證，而本專案的驗收基礎是 Node 驗證器。所以規則全部放在這裡的
//  純函式，`profileStore` 只負責「讀狀態 → 呼叫本檔 → 寫回」。
//
//  ── 停在比賽日：本檔最重要的一條規則 ─────────────────────────────────────
//  規格 D15 明確否決了「照推並自動判棄權」——玩家會因為手滑丟掉整季。
//  所以推進的規則是：
//
//      **可以走進比賽日，但不能在比賽還沒打完時走出去。**
//
//  ⚠ 這與規格 §9 的算術舉例（「第 3 天有比賽 ⇒ 只推 2 天」）不同：那個算法
//    會停在比賽日的**前一天**，於是玩家永遠走不到比賽日，比賽也就永遠打不了。
//    採「走得進、走不出」＝ 推 3 天停在比賽日。這是刻意的偏離，已在 Q3 報告
//    與 handoff 標明。
//
//  棄權因此**不會自動發生**——要玩家自己按（`applyForfeit`）。唯一的例外是
//  `sweepOverdue`：任何「日期已過卻還沒收尾」的場次會被補判棄權，那是為了讓
//  「過去不存在未完成場次」這個不變式成立（例如舊存檔、或日後的賽季快進）。
//
//  純函式：不 import React / zustand / localStorage ⇒ 驗證器可直接 Node 測。
// ============================================================================
import {
  FIXTURE_STATES, isFixtureTerminal, transitionFixture, involvesTeam, opponentOf,
} from "../contracts/competition.js";
import {
  createFixtureOutcome, createForfeitOutcome, RESULT_SOURCES, validateFixtureOutcome,
} from "../contracts/fixtureOutcome.js";
import { upgradeCompetitionIdentity } from "../contracts/circuit.js";
import { buildRegularSeason, SEASON_DAYS } from "./regularSeason.js";
import { simulateFixture, simSeedFor } from "./simulateFixture.js";
import { AI_TEAMS } from "./aiTeams.js";
import { CS_AI_TEAMS } from "../../data/csAiTeams.js";
import { computeStandings, outcomeSourceMix, TIEBREAKERS } from "./standings.js";
import { createFinalStandings } from "../contracts/finalStandings.js";
import {
  createQualification, createPlayoffStage, ensurePlayoffFixtures,
  playoffOrder, playoffBracket, PLAYOFF_STAGE_KEY, PLAYOFF_MATCHES,
} from "./playoffs.js";
import { buildCsMajor, isCsMajorEntry } from "./csMajor.js";

export const SEASON_STATE_VERSION = "SeasonState.v2";
export const SEASON_STATE_VERSION_V1 = "SeasonState.v1";

// ── Q7a-3b：同季多賽事並存的存取層 ─────────────────────────────────────────
//
//  v2 把「賽制」從單數的 `competition` / `stage` / `playoff` 改成
//  `competitions: { [competitionId]: { competition, stage, playoff } }`。
//
//  ⚠ **`competitions{}` 是唯一真相**。頂層刻意**不留** stage / playoff 鏡像——
//    留鏡像就是兩個地方存同一份東西，遲早漂移。要拿就從這裡拿。
//  ⚠ `fixtures` / `outcomes` **維持頂層單一陣列，不拆進 competitions**：
//    ① `fixturesOn(day)` 必須跨賽事掃（同日多場的前提）
//    ② `fixture.stageId` 已經可以回推 competition → event → circuit
//    ③ 拆了就會每個 competition 一份副本 ⇒ 第二份真相

/**
 * Event 的獎金政策。**可以是 null**——不是每個 Event 都有獎金（產品規則），
 * 而且沒有獎金的 Event **不得被迫產生一筆 0 元的假獎金**。
 *
 * ⚠ 這裡只存**抽象政策**，不存金額、不算錢、**也不指名任何獎金表**。
 *   把表名寫在這裡會讓賽季層知道經濟層的東西——Q4 §4c／Q5 §7b 的守衛正是
 *   為了擋這件事，而且它抓到過（本輪第一版寫了表名，守衛立刻紅）。
 *   `table: "default"` 由經濟層自己對應到實際獎金表。
 * ⚠ legacy 的 MOBA 聯賽用 default 政策 ⇒ 舊存檔的發放時點與金額都不變。
 */
export const LEGACY_PRIZE_POLICY = Object.freeze({ kind: "rank_table", table: "default" });

/** 這個賽季裡的所有賽制條目（{competition, stage, playoff}）。 */
export const competitionEntries = (state) => Object.values(state?.competitions ?? {});

/** 用 id 取賽制條目。 */
export const competitionEntry = (state, competitionId) =>
  state?.competitions?.[competitionId] ?? null;

/**
 * **主賽制**條目——沿用 v1「那一個賽事」語意的地方（`seasonStandings`、
 * `participantsOf`、`ensurePlayoffs` 等）都指它。
 *
 * ⚠ **刻意不讀 `activeEventId`。** 那是畫面聚焦用的，讀了就會變成
 *   「玩家在看哪個賽事」會影響 `ensurePlayoffs` 對哪個賽制排季後賽、
 *   `seasonStandings` 回哪張榜——規則跟著畫面跑，那是災難。
 *   畫面要看某個 Event，請用帶 id 的 `standingsOf` / `eventStandingsOf`。
 * ⚠ 單一賽制時（所有既有存檔）此函式與讀 `activeEventId` 的版本結果相同，
 *   所以這次解耦對現況逐值無影響。
 */
export function activeEntryOf(state) {
  return competitionEntries(state)[0] ?? null;
}
export const activeCompetitionOf = (state) => activeEntryOf(state)?.competition ?? null;
export const activeStageOf = (state) => activeEntryOf(state)?.stage ?? null;
export const activePlayoffOf = (state) => activeEntryOf(state)?.playoff ?? null;

/** 把某個賽制條目換掉，回傳新的 state（不改原物件）。 */
function withEntry(state, competitionId, next) {
  return { ...state, competitions: { ...state.competitions, [competitionId]: next } };
}

// ── 反向查詢：全部用推導，**不存反向索引**（存了就會漂移）─────────────────
export const stageIdsOfCompetition = (state, cid) => {
  const e = competitionEntry(state, cid);
  return [e?.stage?.id, e?.playoff?.stage?.id].filter(Boolean);
};
export const competitionIdOfFixture = (state, fixture) =>
  competitionEntries(state).find((e) =>
    e.stage?.id === fixture?.stageId || e.playoff?.stage?.id === fixture?.stageId)?.competition?.id ?? null;
export const fixturesOfCompetition = (state, cid) => {
  const ids = new Set(stageIdsOfCompetition(state, cid));
  return (state?.fixtures ?? []).filter((f) => ids.has(f.stageId));
};
export const outcomesOfCompetition = (state, cid) => {
  const ids = new Set(fixturesOfCompetition(state, cid).map((f) => f.id));
  return (state?.outcomes ?? []).filter((o) => ids.has(o.fixtureId));
};
/**
 * ── 查詢層 fail-closed（Q7a-3c 前置）─────────────────────────────────────
 *
 * ⚠ 為什麼要有這一層：先前 `standingsOf(state, "comp:不存在")` 會**靜默回 0 列**，
 *   與「這個賽制真的一場都還沒打」長得一模一樣。畫面上就是一張空表，
 *   看不出是資料錯還是真的沒比賽；3c 的 Circuit Points 若照這樣撈名次，
 *   錯的 id 會被算成 0 分並寫進不可變的積分帳本。
 *
 * ⇒ **規則／結算用的 accessor 一律明確失敗（throw）**；
 *   畫面合理的 optional 查詢請用 `try*` 版本，語意是「可能沒有」，回 `null`。
 *   `null`（找不到）與 `rows: []`（真的 0 筆）從此不會混在一起。
 */
function requireEntry(state, competitionId, where) {
  const entry = competitionEntry(state, competitionId);
  if (!entry) {
    throw new TypeError(
      `${where}：找不到賽制 ${competitionId ?? "(未指定)"}。` +
      `這是呼叫端傳錯 id，不是「沒有資料」——要允許找不到請改用 try 版本。`);
  }
  return entry;
}

function requireEvent(state, eventId, where) {
  const ev = state?.events?.[eventId];
  if (!ev) {
    throw new TypeError(
      `${where}：找不到賽事 ${eventId ?? "(未指定)"}。` +
      `這是呼叫端傳錯 id，不是「沒有資料」——要允許找不到請改用 try 版本。`);
  }
  return ev;
}

/** 某個 Event 底下的賽制。**找不到該 Event ⇒ throw**（規則面用）。 */
export function competitionsOfEvent(state, eventId) {
  requireEvent(state, eventId, "competitionsOfEvent");
  return competitionEntries(state).filter((e) => e.competition?.eventId === eventId);
}

/** 同上，但允許「沒有這個 Event」⇒ 回 `null`（畫面 optional 查詢用）。 */
export function tryCompetitionsOfEvent(state, eventId) {
  if (!state?.events?.[eventId]) return null;
  return competitionEntries(state).filter((e) => e.competition?.eventId === eventId);
}
export const eventsOfCircuit = (state, circuitId) =>
  Object.values(state?.events ?? {}).filter((e) => e.circuitId === circuitId);
export { SEASON_DAYS };

/**
 * 建立賽季狀態。
 *
 * @param {object} p.playerTeam  profileStore.team（需要 Q1 的 `team.id`）
 * @param {number} p.season      meta.season
 * @param {number} p.seasonSeed  meta.seasonSeed
 */
export function createSeasonState({ playerTeam, season = 1, seasonSeed, gameMode = "moba", startDay = 1 } = {}) {
  const built = buildRegularSeason({ playerTeam, season, seasonSeed, gameMode });
  if (!built.ok) return { ok: false, state: null, errors: built.errors };
  //  Q7a-3a：新建的賽季也走同一條身分升級路徑，讓新舊存檔的形狀一致。
  //  ⚠ 這一輪仍然是 legacy 推導（`comp:{mode}:s{season}:{org}:{tier}`）——
  //    3a 只補身分欄位，**不改任何 id**。由 Event 推導 id 是 3b 的事。
  const up = upgradeCompetitionIdentity(built.competition);
  return {
    ok: true,
    errors: [],
    state: {
      schema: SEASON_STATE_VERSION,
      season,
      seed: built.summary.seed,
      //  ⚠ 賽季錨定在**建立當天**（Q3.5 修）。
      //  賽程產生器排的是「賽季第 1–84 天」，但存檔的時鐘不一定從第 1 天開始
      //  （預設新局就是第 8 天）。若直接把賽程日當成 meta.days 比對，
      //  第 1–7 天的場次一建立就是「過期」⇒ 下次推進會被補判棄權，
      //  玩家連看都沒看到就先輸幾場。實測在瀏覽器抓到的。
      startDay: Math.max(1, Math.floor(Number(startDay) || 1)),
      playerTeamId: playerTeam.id,
      //  Q7a-3b：賽制放進 map，頂層不再有單數的 competition / stage / playoff
      //  ⚠ `expectsPlayoff`：這個賽制**預期**有季後賽。常規賽聯賽有（Q6），
      //    盃賽／資格賽可能沒有。少了這個宣告，封存判定只能二選一：
      //    要嘛聯賽在季後賽排出來之前就封存，要嘛沒有季後賽的賽事永遠封不了。
      //  ⚠ CS Season M1：CS 聯賽 `expectsPlayoff: false`。CS 的年度 Major 是 M3
      //    的工作，M1 還沒有季後賽賽制——宣告 true 會讓 CS 賽季**永遠封不了**
      //    （封存判定會等一個不存在的季後賽，見 asiaCircuit.js:21 同一個坑）。
      //    MOBA 一個字都沒改。
      competitions: { [up.competition.id]: { competition: up.competition, stage: built.stage, playoff: null, expectsPlayoff: gameMode !== "cs" } },
      circuits: up.circuit ? { [up.circuit.id]: up.circuit } : {},
      events: up.event
        ? { [up.event.id]: {
            ...up.event,
            competitionIds: [up.competition.id],
            //  Event 只有一個 Competition ⇒ 可以自動指定（產品規則）
            rankingCompetitionId: up.competition.id,
            //  legacy 的 MOBA 聯賽沿用既有名次獎金；其他 Event 預設沒有獎金
            //  ⚠ CS 聯賽 M1 **刻意沒有獎金政策**：CS 的獎金級距、贊助連動與
            //    經濟平衡都還沒定義。給它 `LEGACY_PRIZE_POLICY` 等於讓 CS
            //    直接沿用 MOBA 的獎金表發錢——那是憑空發明經濟規則，
            //    比暫時不發錢糟得多（發錯的錢收不回來）。CS 獎金屬 M3 之後。
            prizePolicy: gameMode === "cs" ? null : LEGACY_PRIZE_POLICY,
          } }
        : {},
      activeEventId: up.event?.id ?? null,
      //  Q7a-3f.1：**生涯主要賽事**。建立者當下就知道是哪一個，直接寫下來——
      //  不由 organizer／tier／idScheme／名稱／陣列順序事後推斷（那些都不是角色）。
      //  ⚠ 這與 `activeEventId` 是**兩件事**：那是畫面聚焦、可被玩家切換；
      //    這是生涯主線，寫定之後不隨畫面改變。
      careerEventId: up.event?.id ?? null,
      fixtures: built.fixtures,
      //  賽果一經寫入即不可變（D11）——本檔只 append，永遠不改既有元素
      outcomes: [],
    },
  };
}

/**
 * 舊存檔的身分升級（Q7a-3a）。
 *
 * ⚠ **不改任何既有 id**：`competition.id`、`stage.id`、每一個 `fixture.id`、
 *   每一筆 `outcome.fixtureId` 都原樣保留。只補 `circuitId` / `eventId` /
 *   `idScheme`，並掛上合成的 legacy 容器。
 * ⚠ **冪等**：已升級過就**原樣回傳同一個物件參考**。不這樣的話每次載入都會
 *   產生新物件，害畫面白重繪，也會讓「重載後逐字未變」那類 JSON 比對失準。
 */
export function upgradeSeasonIdentity(state) {
  if (!state?.schema || !state.competition) return state;
  const up = upgradeCompetitionIdentity(state.competition);
  if (up.alreadyUpgraded) return state;
  return {
    ...state,
    competition: up.competition,
    circuits: { ...(state.circuits ?? {}), ...(up.circuit ? { [up.circuit.id]: up.circuit } : {}) },
    events: { ...(state.events ?? {}), ...(up.event ? { [up.event.id]: up.event } : {}) },
  };
}

/**
 * v1 → v2 形狀升級（Q7a-3b）。
 *
 * v1 的單數 `competition` / `stage` / `playoff` 包成 `competitions{}` 的一筆。
 *
 * ⚠ **`fixtures` / `outcomes` 用同一個參考**，不複製、不重建——它們是事實層，
 *   而且 Q1–Q6 有 25 處直接讀它們。
 * ⚠ **`state.final` 原樣保留不動**（Q6 是逐字比對）。legacy Event 的 `final`
 *   留 null，由 `eventFinalOf()` 在 legacy 情境回傳 `state.final` ⇒ 不產生
 *   兩份封存快照。
 * ⚠ **冪等**：已是 v2 就回傳同一個物件參考。
 */
/**
 * Q7a-3f.1：補上 `careerEventId`（**只在無歧義時**）。
 *
 * ⚠ 只有一個 Event ⇒ 那一個必然是生涯主線，回填無歧義。
 * ⚠ 多個 Event 卻沒有這個欄位 ⇒ **留 null，不猜**。組合出來的判據
 *   （organizer／tier／idScheme／expectsPlayoff／prizePolicy／名稱／順序）
 *   沒有一個真的表示「角色」，猜錯會把整季生涯成績記到別的賽事頭上。
 * ⚠ 冪等且**保參考**：欄位已經在就原樣回傳同一個物件——不然每次載入都產生
 *   新物件，會害畫面白重繪，也會讓「重載後逐字未變」那類比對失準。
 */
function withCareerEvent(state) {
  if (!state || typeof state !== "object") return state;
  if ("careerEventId" in state) return state;
  const ids = Object.keys(state.events ?? {});
  return { ...state, careerEventId: ids.length === 1 ? ids[0] : null };
}

export function upgradeSeasonShape(state) {
  if (!state?.schema) return state;
  if (state.competitions) return withCareerEvent(state);   // 已經是 v2
  const withId = upgradeSeasonIdentity(state);     // 先補 3a 的身分（冪等）
  const comp = withId.competition;
  if (!comp) return state;

  const eventId = comp.eventId ?? null;
  const events = { ...(withId.events ?? {}) };
  if (eventId && events[eventId]) {
    events[eventId] = {
      ...events[eventId],
      competitionIds: [comp.id],
      rankingCompetitionId: comp.id,               // 只有一個 ⇒ 可自動指定
      prizePolicy: LEGACY_PRIZE_POLICY,            // 舊聯賽沿用既有名次獎金
      final: events[eventId].final ?? null,        // 見上方說明：不複製 state.final
    };
  }

  const next = {
    ...withId,
    schema: SEASON_STATE_VERSION,
    competitions: { [comp.id]: { competition: comp, stage: withId.stage, playoff: withId.playoff ?? null, expectsPlayoff: true } },
    events,
    activeEventId: withId.activeEventId ?? eventId ?? null,
  };
  //  頂層的單數欄位到此退場——`competitions{}` 是唯一真相，不留鏡像
  delete next.competition; delete next.stage; delete next.playoff;
  return withCareerEvent(next);
}

/**
 * 取某個 Event 的封存名次。
 * legacy（只有一個 Event 且沿用舊語意）回傳 `state.final`，避免同一份快照存兩次。
 */
export function eventFinalOf(state, eventId) {
  const ev = state?.events?.[eventId] ?? null;
  if (!ev) return null;
  if (ev.final) return ev.final;
  const onlyOne = Object.keys(state?.events ?? {}).length === 1;
  return onlyOne ? (state?.final ?? null) : null;
}


// ── Q7a-3f.1：生涯主要賽事成績 ─────────────────────────────────────────────
//
//  ⚠ 為什麼需要這一層：`state.final` 在多 Event 時是 `SeasonSeal.v1`
//    （3b 的設計，賽季本身不再產生總名次），沒有 rows／playerRank／champion。
//    但「我這一季在**官方聯賽**拿第幾名」仍然是玩家的生涯成績，那份資料
//    活在 Event 的 `final` 裡。本層只是**指過去**——不複製、不鏡像，
//    `state.final` 的語意一個字都不動。

/** 這一季的生涯主要賽事（沒有指定 ⇒ null，不猜）。 */
export const careerEventOf = (state) => {
  const id = state?.careerEventId ?? null;
  return id && state?.events?.[id] ? state.events[id] : null;
};

/**
 * 生涯主要賽事的封存名次（規則／結算用，**找不到就明確失敗**）。
 *
 * ⚠ 這裡刻意 throw 而不是回 null：規則面拿不到生涯成績時，
 *   「沒有這個賽季」與「指標壞了」必須分得開（與 3c 前置那一層同一條紀律）。
 *   畫面請用 `tryCareerFinalStandingsOf`。
 */
export function careerFinalStandingsOf(state) {
  const id = state?.careerEventId ?? null;
  if (!id) {
    throw new TypeError(
      "careerFinalStandingsOf：這個賽季沒有指定生涯主要賽事（careerEventId）。" +
      "這不是「還沒封存」——要允許沒有請改用 tryCareerFinalStandingsOf。");
  }
  requireEvent(state, id, "careerFinalStandingsOf");
  return eventFinalOf(state, id);
}

/** 同上，但允許「沒有／還沒封存」⇒ 回 `null`（畫面用）。**不猜其他 Event。** */
export function tryCareerFinalStandingsOf(state) {
  const id = state?.careerEventId ?? null;
  if (!id || !state?.events?.[id]) return null;
  return eventFinalOf(state, id);
}

/**
 * 每個 Event 的畫面摘要（Q7a-3b.5）。
 *
 * ⚠ 這是**唯讀推導**：狀態、階段、名次全部從既有資料算出來，
 *   不新增任何「第二份真相」的欄位。畫面不得自己判這些。
 */
export function eventViewsOf(state, currentDay = 1) {
  return Object.entries(state?.events ?? {}).map(([id, ev]) => {
    const cid = ev.rankingCompetitionId;
    const entry = competitionEntry(state, cid);
    const final = eventFinalOf(state, id);
    const comps = competitionsOfEvent(state, id);
    const fixtures = comps.flatMap((e) => fixturesOfCompetition(state, e.competition.id));
    const done = fixtures.filter(isFixtureTerminal).length;
    const played = fixtures.some(isFixtureTerminal);
    //  狀態只有三種，且**由事實推導**：封存 → 已封存；有打過 → 進行中；否則未開始
    const status = final ? "sealed" : (played ? "running" : "upcoming");
    const mine = fixtures.filter((f) => isPlayerFixture(state, f));
    const nextMine = mine
      .filter((f) => !isFixtureTerminal(f))
      .sort((a, b) => a.day - b.day)[0] ?? null;
    const rows = final?.rows ?? standingsOf(state, cid)?.rows ?? [];
    const meRow = rows.find((r) => r.teamId === state?.playerTeamId) ?? null;
    return {
      id,
      name: ev.name ?? id,
      circuitId: ev.circuitId ?? null,
      status,
      statusLabel: ({ sealed: "已封存", running: "進行中", upcoming: "未開始" })[status],
      //  目前階段：封存後看季後賽有沒有排過，否則看常規賽/季後賽
      stageLabel: final ? "已結束"
        : (entry?.playoff && playoffFixturesOfCompetition(state, cid).length > 0 ? "季後賽" : "常規賽"),
      hasPrize: !!ev.prizePolicy,
      awardAmount: ev.award?.amount ?? null,
      playerRank: final?.playerRank ?? (meRow ? rows.indexOf(meRow) + 1 : null),
      playerRankIsFinal: !!final,
      total: fixtures.length,
      done,
      mineTotal: mine.length,
      mineDone: mine.filter(isFixtureTerminal).length,
      nextFixtureId: nextMine?.id ?? null,
      nextDay: nextMine ? absoluteDayOf(state, nextMine) : null,
      isToday: !!nextMine && absoluteDayOf(state, nextMine) === currentDay,
    };
  });
}

/**
 * 賽季範圍一致性驗證（Q7a-3c 前置）。
 *
 * ⚠ 這是**結構驗證**，不是「有沒有資料」的查詢：它檢查身分層彼此指得對不對。
 *   3c 的 Circuit Points 會沿著 circuit → event → competition 去撈名次，
 *   任何一段指錯都會讓積分算在錯的對象上，而且會寫進不可變帳本。
 *
 * 檢查五件事：
 *   ① 每個賽制的 `eventId` 指得到存在的 Event
 *   ② 每個 Event 的 `circuitId` 指得到存在的 Circuit
 *   ③ `rankingCompetitionId` 必須屬於該 Event（多賽制時尤其重要）
 *   ④ **同一個賽制不得綁在兩個 Event 底下**（duplicate binding）
 *   ⑤ Event 的 `competitionIds` 與實際綁定一致（不得漏列或多列）
 */
export function validateSeasonScope(state) {
  const errors = [];
  if (!state?.schema) return { ok: false, errors: [{ code: "no_season", message: "目前沒有賽季" }] };

  const events = state.events ?? {};
  const circuits = state.circuits ?? {};
  const entries = competitionEntries(state);
  const seen = new Map();   // competitionId → eventId（抓 duplicate binding）

  for (const e of entries) {
    const cid = e.competition?.id;
    const eid = e.competition?.eventId ?? null;
    if (!eid || !events[eid]) {
      errors.push({ code: "competition_event", message: `賽制 ${cid} 的 eventId ${eid ?? "(無)"} 指不到存在的賽事` });
      continue;
    }
    if (seen.has(cid)) {
      errors.push({ code: "duplicate_binding", message: `賽制 ${cid} 同時綁在 ${seen.get(cid)} 與 ${eid} 底下` });
    }
    seen.set(cid, eid);
  }

  for (const [eid, ev] of Object.entries(events)) {
    if (!ev.circuitId || !circuits[ev.circuitId]) {
      errors.push({ code: "event_circuit", message: `賽事 ${eid} 的 circuitId ${ev.circuitId ?? "(無)"} 指不到存在的巡迴賽體系` });
    }
    const mine = entries.filter((e) => e.competition?.eventId === eid).map((e) => e.competition.id);
    if (ev.rankingCompetitionId && !mine.includes(ev.rankingCompetitionId)) {
      errors.push({
        code: "ranking_scope",
        message: `賽事 ${eid} 的 rankingCompetitionId ${ev.rankingCompetitionId} 不屬於這個賽事`,
      });
    }
    if (mine.length > 1 && !ev.rankingCompetitionId) {
      errors.push({ code: "ranking_required", message: `賽事 ${eid} 有 ${mine.length} 個賽制，必須明確指定 rankingCompetitionId` });
    }
    const listed = [...(ev.competitionIds ?? [])].sort().join(",");
    if (listed !== [...mine].sort().join(",")) {
      errors.push({ code: "competition_list", message: `賽事 ${eid} 的 competitionIds 與實際綁定不一致（列出 [${listed}]，實際 [${mine.join(",")}]）` });
    }
  }

  //  Q7a-3f.1：生涯主要賽事的指標必須指得到。
  //  ⚠ `null` **不算錯**——多 Event 的舊存檔回填不了時就是 null（不猜），
  //    accessor 會 fail-closed。錯的是「指了一個不存在的 Event」。
  if (state.careerEventId != null && !events[state.careerEventId]) {
    errors.push({
      code: "career_event",
      message: `careerEventId ${state.careerEventId} 指不到存在的賽事`,
    });
  }

  return { ok: errors.length === 0, errors };
}

/** 參賽者（隊名查詢用）。 */
export const participantsOf = (state) => activeStageOf(state)?.participants ?? [];

/**
 * 模擬用的 roster 表。
 * 玩家隊的 roster 由呼叫端傳入（`profileStore.players`），AI 的來自 `AI_TEAMS`。
 * ⚠ 這是 Q2b 紅線的延續：實力一律由 roster 的 16 項能力推導，
 *   `AI_TEAMS[].strength` 不進模擬。
 */
export function rostersFor(state, playerRoster = []) {
  const out = {};
  //  CS Season M1：AI 名單依這個賽季的項目取。**兩個池都是既有內容資料**
  //  （`AI_TEAMS` / `CS_AI_TEAMS`），這裡不生成、不改寫任何 roster。
  //  ⚠ 只放這一季用得到的池：把兩個池都倒進來會讓某一季的模擬有機會
  //    抓到另一個項目的隊伍，那是靜默的跨項目污染。
  const pool = gameModeOf(state) === "cs" ? CS_AI_TEAMS : AI_TEAMS;
  for (const t of pool) out[t.id] = t.roster;
  if (state?.playerTeamId) out[state.playerTeamId] = playerRoster;
  return out;
}

/** 這個賽季是哪個項目的（讀主賽制，與 `activeEntryOf` 同一個來源）。 */
export const gameModeOf = (state) => activeCompetitionOf(state)?.gameMode ?? "moba";

export const fixtureById = (state, id) => (state?.fixtures ?? []).find((f) => f.id === id) ?? null;

/**
 * 賽程日 → 遊戲日（`meta.days`）。
 * **所有跟時鐘比對的地方都要用這一支**，不得直接讀 `fixture.day`。
 */
export const absoluteDayOf = (state, fixture) =>
  (Number(state?.startDay) || 1) + (Number(fixture?.day) || 1) - 1;

export const fixturesOn = (state, day) =>
  (state?.fixtures ?? []).filter((f) => absoluteDayOf(state, f) === day);
export const outcomeFor = (state, fixtureId) =>
  (state?.outcomes ?? []).find((o) => o.fixtureId === fixtureId) ?? null;

/** 這場是不是玩家的（而不是 AI vs AI）。 */
export const isPlayerFixture = (state, f) => involvesTeam(f, state?.playerTeamId);

/**
 * 這場是不是「已經開打但還沒收尾」。
 * Store 用它判斷要不要走重新進場，不必自己認得狀態字串。
 */
export const isFixtureLaunched = (f) => f?.status === FIXTURE_STATES.launched;

/**
 * 這一天**全部**還沒收尾的玩家場次（依既有順序，不重排）。
 *
 * ⚠ 同一天可以有多場：Q7a 的產品規則是「賽程與賽事可以並存、同一天也可以有
 *   多場玩家賽事」，只有**進行中的 battle session** 一次限一個。資料模型本來
 *   就放得下（`fixturesOn` 不限筆數），但先前只取第一場 ⇒ 第二場在畫面上
 *   看不見，玩家會卡在「今天走不出去、卻不知道還要打什麼」。
 */
export function pendingPlayerFixturesOn(state, day) {
  return fixturesOn(state, day).filter((f) => isPlayerFixture(state, f) && !isFixtureTerminal(f));
}

/**
 * 這一天有沒有「還沒收尾的玩家場次」——回傳**第一場**。
 * 有的話就是**推進的阻擋點**——走得進今天，但走不出去。
 *
 * ⚠ 一天多場時這裡只回第一場（沿用既有語意，避免動到既有呼叫端）。
 *   要列出全部請用 `pendingPlayerFixturesOn`。推進阻擋不受影響：
 *   只要當天還有任何一場沒收尾，這裡就仍然回傳非 null。
 */
export function pendingPlayerFixtureOn(state, day) {
  return pendingPlayerFixturesOn(state, day)[0] ?? null;
}

/**
 * 某個 Event 底下的下一場玩家賽事（含今天）。畫面用。
 *
 * ⚠ 只影響**畫面**：聚焦哪個 Event 就看哪個 Event 的下一場。
 *   規則面仍然走 `nextPlayerFixture`（全季）。
 */
export function nextPlayerFixtureOfEvent(state, eventId, fromDay = 1) {
  const ids = new Set(
    tryCompetitionsOfEvent(state, eventId)?.flatMap((e) => fixturesOfCompetition(state, e.competition.id).map((f) => f.id)) ?? [],
  );
  return (state?.fixtures ?? [])
    .filter((f) => ids.has(f.id) && isPlayerFixture(state, f) && !isFixtureTerminal(f) && absoluteDayOf(state, f) >= fromDay)
    .sort((a, b) => a.day - b.day)[0] ?? null;
}

/** 下一場玩家賽事（含今天）；沒有則 null。畫面用。 */
export function nextPlayerFixture(state, fromDay = 1) {
  return (state?.fixtures ?? [])
    .filter((f) => isPlayerFixture(state, f) && !isFixtureTerminal(f) && absoluteDayOf(state, f) >= fromDay)
    .sort((a, b) => a.day - b.day)[0] ?? null;
}

/** 內部：把一場 fixture 換掉，回傳新的 state（不改原物件）。 */
function withFixture(state, next) {
  return { ...state, fixtures: state.fixtures.map((f) => (f.id === next.id ? next : f)) };
}

/** 內部：append 一筆賽果（同一場只能有一筆）。 */
function withOutcome(state, outcome) {
  return { ...state, outcomes: [...state.outcomes, outcome] };
}

/**
 * 走進第 `day` 天：把當天所有 AI vs AI 的場次模擬掉。
 * 玩家的場次**不模擬**——那要玩家自己打（或自己棄權）。
 */
export function simulateAiFixturesOn(state, day, playerRoster = []) {
  const rosters = rostersFor(state, playerRoster);
  let next = state;
  const produced = [];
  for (const f of fixturesOn(state, day)) {
    if (isFixtureTerminal(f)) continue;
    if (isPlayerFixture(state, f)) continue;
    if (outcomeFor(next, f.id)) continue;                       // 防重（冪等）
    const sim = simulateFixture({
      fixture: f, rosters, seed: simSeedFor(state.seed, f.id),
    });
    if (!sim.ok) continue;
    //  scheduled → launched → completed：不跳過狀態機，否則轉移表形同虛設
    const lit = transitionFixture(f, FIXTURE_STATES.launched);
    const done = transitionFixture(lit.ok ? lit.fixture : f, FIXTURE_STATES.completed);
    next = withOutcome(withFixture(next, done.ok ? done.fixture : f), sim.outcome);
    produced.push(sim.outcome);
  }
  return { state: next, outcomes: produced };
}

/**
 * 補判棄權：所有「日期已過卻還沒收尾」的場次。
 *
 * 正常流程走不到這裡（推進會停在比賽日）。它的用途是讓
 * 「過去不存在未完成場次」這個不變式在任何情況下都成立——
 * 例如舊存檔、或日後的賽季快進。
 */
export function sweepOverdue(state, currentDay) {
  let next = state;
  const forfeited = [];
  for (const f of state.fixtures) {
    if (absoluteDayOf(state, f) >= currentDay || isFixtureTerminal(f)) continue;
    //  AI vs AI 逾期 ⇒ 主隊判負（沒有「誰缺席」可言，取一致規則即可）
    //  玩家場次逾期 ⇒ 玩家判負
    const loser = isPlayerFixture(next, f) ? next.playerTeamId : f.sideA;
    const made = createForfeitOutcome({ fixture: f, loser, reason: "逾期未出賽" });
    if (!made.ok) continue;
    const t = transitionFixture(f, FIXTURE_STATES.forfeited, { reason: "逾期未出賽" });
    next = withOutcome(withFixture(next, t.ok ? t.fixture : f), made.outcome);
    forfeited.push(made.outcome);
  }
  return { state: next, outcomes: forfeited };
}

/**
 * 推進賽季日曆。**唯一的推進規則**——`profileStore.advanceDay` 呼叫本函式，
 * 不自己判斷該不該停。
 *
 * @param {object} p.state
 * @param {number} p.fromDay  推進前的 `meta.days`
 * @param {number} p.days     想推進幾天
 * @param {Array}  [p.playerRoster]
 * @returns {{state, daysAdvanced:number, stoppedBy:object|null,
 *            simulated:Array, forfeited:Array}}
 */
export function advanceSeasonDays({ state, fromDay, days = 1, playerRoster = [] } = {}) {
  if (!state) return { state, daysAdvanced: days, stoppedBy: null, simulated: [], forfeited: [] };

  let next = state;
  const simulated = [];
  //  先補上任何過去遺留的未完成場次（不變式）
  const swept = sweepOverdue(next, fromDay);
  next = swept.state;

  let advanced = 0;
  let stoppedBy = null;

  for (let i = 0; i < days; i++) {
    const today = fromDay + advanced;
    //  ── 走不出去：今天還有沒打完的玩家賽事 ──
    const blocking = pendingPlayerFixtureOn(next, today);
    if (blocking) {
      stoppedBy = {
        code: "player_fixture",
        day: today,
        fixtureId: blocking.id,
        opponentId: opponentOf(blocking, next.playerTeamId),
        message: `第 ${today} 天有聯賽比賽，請先出賽或棄權`,
      };
      break;
    }
    //  ── 走進明天，把當天的 AI 場次模擬掉 ──
    const day = today + 1;
    const sim = simulateAiFixturesOn(next, day, playerRoster);
    next = sim.state;
    simulated.push(...sim.outcomes);
    advanced++;
  }

  return { state: next, daysAdvanced: advanced, stoppedBy, simulated, forfeited: swept.outcomes };
}

/**
 * 玩家出賽：`scheduled → launched`。
 * ⚠ 由 `competitionGateway.issueFor()` 簽發成功之後才呼叫——
 *   本函式不重複驗資格，那是 gateway 的責任，兩邊都驗會有兩份規則。
 */
export function applyLaunch(state, fixtureId) {
  const f = fixtureById(state, fixtureId);
  if (!f) return { ok: false, state, errors: [{ code: "fixture", message: "找不到這場賽程" }] };
  const t = transitionFixture(f, FIXTURE_STATES.launched);
  if (!t.ok) return { ok: false, state, errors: t.errors };
  return { ok: true, state: withFixture(state, t.fixture), errors: [] };
}

/**
 * 玩家打完：`launched → completed`，寫入 **engine** 賽果。
 *
 * @param {object} p.result { winner, score:{a,b}, duration, seed }
 *   —— 由 `BattleResult.v2` 換算而來（換算在呼叫端；本檔不解讀戰鬥資料）
 */
export function applyCompleted(state, { fixtureId, winner, score, duration, seed } = {}) {
  const f = fixtureById(state, fixtureId);
  if (!f) return { ok: false, state, errors: [{ code: "fixture", message: "找不到這場賽程" }] };
  if (outcomeFor(state, fixtureId)) {
    return { ok: false, state, errors: [{ code: "duplicate", message: "這場已經有賽果了，賽果不可覆寫" }] };
  }
  const made = createFixtureOutcome({
    fixture: f, resultSource: RESULT_SOURCES.engine, winner, score, duration, seed,
  });
  if (!made.ok) return { ok: false, state, errors: made.errors };
  const t = transitionFixture(f, FIXTURE_STATES.completed);
  if (!t.ok) return { ok: false, state, errors: t.errors };
  return { ok: true, state: withOutcome(withFixture(state, t.fixture), made.outcome), outcome: made.outcome, errors: [] };
}

/**
 * 棄權：`scheduled|launched → forfeited`，寫入 **forfeit** 賽果。
 * 預設棄權方是玩家（AI 不會自己棄權）。
 */
export function applyForfeit(state, { fixtureId, loser = null, reason = "玩家棄權" } = {}) {
  const f = fixtureById(state, fixtureId);
  if (!f) return { ok: false, state, errors: [{ code: "fixture", message: "找不到這場賽程" }] };
  if (outcomeFor(state, fixtureId)) {
    return { ok: false, state, errors: [{ code: "duplicate", message: "這場已經有賽果了，賽果不可覆寫" }] };
  }
  const made = createForfeitOutcome({ fixture: f, loser: loser ?? state.playerTeamId, reason });
  if (!made.ok) return { ok: false, state, errors: made.errors };
  const t = transitionFixture(f, FIXTURE_STATES.forfeited, { reason });
  if (!t.ok) return { ok: false, state, errors: t.errors };
  return { ok: true, state: withOutcome(withFixture(state, t.fixture), made.outcome), outcome: made.outcome, errors: [] };
}

// ── Milestone Q4：賽季封存 ────────────────────────────────────────────────

/**
 * 這個賽季可以封存了嗎。
 *
 * 條件只有一條：**每一場都收尾了**（completed / forfeited）。
 * 刻意**不用「第 84 天到了」**當條件——賽程日與 `meta.days` 之間隔著
 * `startDay` 錨點（Q3.5 修的那件事），拿天數判會在舊存檔上判錯；
 * 而「場次全部收尾」是賽季真正結束的定義，與時鐘怎麼走無關。
 *
 * @returns {{ok:boolean, sealed:boolean, remaining:number, reason:string|null}}
 */
// ── Q7a-3b：Event 封存（與 Season 封存分開）──────────────────────────────
//
//  ⚠ 這一層**只產生名次，不碰錢**（Q4 §4c／Q5 §7b 的紅線）。獎金由 Store 層
//    呼叫既有的 `economy/competitionAward.js`，而且**只有 Event 有 prizePolicy
//    才發**——沒有獎金的 Event 不得被迫生出一筆 0 元的假獎金。

/** 這個 Event 封存得了嗎（它底下每一個賽制的每一場都要收尾）。 */
export function canSealEvent(state, eventId) {
  const ev = state?.events?.[eventId] ?? null;
  if (!ev) return { ok: false, sealed: false, remaining: 0, reason: "找不到這個賽事" };
  if (eventFinalOf(state, eventId)) return { ok: false, sealed: true, remaining: 0, reason: "這個賽事已經封存過了" };

  const comps = competitionsOfEvent(state, eventId);
  if (comps.length === 0) return { ok: false, sealed: false, remaining: 0, reason: "這個賽事底下沒有賽制" };
  //  ⚠ 名次來源必須明確：Event 只有一個賽制時可以自動指定，兩個以上一定要
  //    明講是哪一個（資格賽只決定晉級／種子，不進 Event 最終名次）。
  if (!ev.rankingCompetitionId) {
    return { ok: false, sealed: false, remaining: 0, reason: "賽事沒有指定決定名次的賽制（rankingCompetitionId）" };
  }
  if (!comps.some((e) => e.competition.id === ev.rankingCompetitionId)) {
    return { ok: false, sealed: false, remaining: 0, reason: "rankingCompetitionId 指到的賽制不屬於這個賽事" };
  }

  const remaining = comps
    .flatMap((e) => fixturesOfCompetition(state, e.competition.id))
    .filter((f) => !isFixtureTerminal(f)).length;
  if (remaining > 0) {
    return { ok: false, sealed: false, remaining, reason: `還有 ${remaining} 場沒有結果，賽事還沒結束` };
  }
  //  ⚠ 只有**宣告有季後賽**的賽制才用季後賽當關卡。
  //    聯賽必須等季後賽打完（Q6：常規賽打完不等於賽季結束）；
  //    沒有季後賽的盃賽若也套這一條，就永遠封不了。
  const rankEntry = competitionEntry(state, ev.rankingCompetitionId);
  if (rankEntry?.expectsPlayoff && !isPlayoffDoneOf(state, ev.rankingCompetitionId)) {
    return {
      ok: false, sealed: false, remaining: 0,
      reason: rankEntry.playoff ? "季後賽還沒打完" : "季後賽還沒排定",
    };
  }
  return { ok: true, sealed: false, remaining: 0, reason: null };
}

/**
 * 封存一個 Event：把它 `rankingCompetitionId` 的名次凍成不可變快照。
 *
 * ⚠ 與 v1 的賽季封存用**完全同一組輸入**呼叫 `createFinalStandings`，
 *   所以 legacy 單 Event 存檔算出來的 final 逐欄與現況相同。
 */
export function applySealEvent(state, eventId, sealedAtDay) {
  const can = canSealEvent(state, eventId);
  if (!can.ok) {
    if (can.sealed) return { ok: true, state, final: eventFinalOf(state, eventId), alreadySealed: true, errors: [] };
    return { ok: false, state, final: null, alreadySealed: false, errors: [{ code: "not_finished", message: can.reason }] };
  }
  const ev = state.events[eventId];
  const cid = ev.rankingCompetitionId;
  const entry = competitionEntry(state, cid);
  const po = playoffOrder({ fixtures: playoffFixturesOfCompetition(state, cid), outcomes: state.outcomes ?? [] });
  const made = createFinalStandings({
    standings: standingsOf(state, cid),
    competition: entry.competition,
    stageId: entry.stage?.id ?? null,
    sealedAtDay,
    tiebreakers: TIEBREAKERS,
    sourceMix: outcomeSourceMix(state.outcomes ?? []),
    playerTeamId: state.playerTeamId ?? null,
    playoffOrder: po.order,
    championTeamId: po.championTeamId,
    playoffStageId: entry.playoff?.stage?.id ?? null,
  });
  if (!made.ok) return { ok: false, state, final: null, alreadySealed: false, errors: made.errors };
  return {
    ok: true,
    alreadySealed: false,
    errors: [],
    final: made.final,
    state: { ...state, events: { ...state.events, [eventId]: { ...ev, final: made.final } } },
  };
}

/** 還沒封存、但已經封得了的 Event。 */
export const sealableEventIds = (state) =>
  Object.keys(state?.events ?? {}).filter((id) => canSealEvent(state, id).ok);

export function canSealSeason(state) {
  if (!state?.schema) return { ok: false, sealed: false, remaining: 0, reason: "目前沒有賽季" };
  if (state.final) return { ok: false, sealed: true, remaining: 0, reason: "這個賽季已經封存過了" };
  const ids = Object.keys(state.events ?? {});
  if (ids.length === 0) return { ok: false, sealed: false, remaining: 0, reason: "這個賽季沒有賽事" };
  //  ⚠ Q7a-3b：賽季結束 ＝ **這一季每一個 Event 都封存了**，
  //    不再是「唯一那個賽事打完了」。legacy 只有一個 Event ⇒ 判定時機與 v1 相同。
  const pendingEvents = ids.filter((id) => !eventFinalOf(state, id));
  if (pendingEvents.length > 0) {
    const first = canSealEvent(state, pendingEvents[0]);
    return {
      ok: false, sealed: false, remaining: first.remaining ?? 0,
      reason: pendingEvents.length === 1 ? first.reason : `還有 ${pendingEvents.length} 個賽事沒有封存`,
    };
  }
  return { ok: true, sealed: false, remaining: 0, reason: null };
}

/**
 * 封存賽季：把**當下推導出來的** Standings 凍結成不可變的 `FinalStandings.v1`。
 *
 * ⚠ 一個賽季只能封存一次（D11）。已封存還再呼叫 ⇒ 回既有那一份、不覆寫。
 *   這與 `applyCompleted` 拒絕覆寫賽果是同一條紀律：**寫進去的就不會再變**。
 *
 * ⚠ 本檔**不發獎金**。獎金是經濟層的事（`economy/competitionAward.js`），
 *   賽季狀態不碰錢——否則錢就有第四個入口了。
 *
 * @param {object} state
 * @param {number} sealedAtDay  封存當下的遊戲日（`meta.days`）
 */
export function applySealSeason(state, sealedAtDay) {
  const can = canSealSeason(state);
  if (!can.ok) {
    //  已封存不算失敗——回既有那一份，讓呼叫端能安全重試
    if (can.sealed) return { ok: true, state, final: state.final, alreadySealed: true, errors: [] };
    return { ok: false, state, final: null, alreadySealed: false, errors: [{ code: "not_finished", message: can.reason }] };
  }
  const ids = Object.keys(state.events ?? {});
  //  ⚠ 單一 Event（legacy）：賽季封存 ＝ 那個 Event 的封存快照，**同一個物件**。
  //    這樣 `state.final` 與 v1 逐位元相同 ⇒ Q4／Q5／Q6 對它的逐字比對仍然成立。
  //    多 Event：賽季本身不再產生「總名次」——它只負責整季封存與換季，
  //    年度總排名獎金是未來的 Season Award，另立實體（產品規則 4、5）。
  const final = ids.length === 1
    ? eventFinalOf(state, ids[0])
    : {
        schema: "SeasonSeal.v1",
        season: state.season,
        sealedAtDay,
        eventIds: ids,
      };
  if (!final) return { ok: false, state, final: null, alreadySealed: false, errors: [{ code: "no_final", message: "賽事尚未封存" }] };
  return { ok: true, state: { ...state, final }, final, alreadySealed: false, errors: [] };
}

// ── Milestone Q5：跨賽季換季 ──────────────────────────────────────────────

/**
 * 可以換到下一季了嗎。
 *
 * 條件只有一條：**目前這一季已經封存**。封存本身已經保證「每一場都收尾」，
 * 所以這裡不再重數一次場次——那會變成第二份「賽季結束了沒」的規則。
 *
 * @returns {{ok:boolean, reason:string|null, nextSeason:number|null}}
 */
export function canRollSeason(state) {
  if (!state?.schema) return { ok: false, reason: "目前沒有賽季", nextSeason: null };
  if (!state.final) return { ok: false, reason: "這一季還沒結束，不能開下一季", nextSeason: null };
  return { ok: true, reason: null, nextSeason: (Number(state.season) || 1) + 1 };
}

/**
 * 換到下一個賽季。
 *
 * ── 這一支只做「換容器」──────────────────────────────────────────────────
 * 產生一個**全新的**賽季狀態（新 Competition／Stage／56 場賽程／空 outcomes），
 * 並把上一季**已封存的** `FinalStandings` 交給呼叫端存進歷史。
 * 選手、資金、成長、贊助合約**完全不碰**——那些不住在賽季狀態裡。
 *
 * ⚠ **賽季編號自己 +1，不讀 `meta.season`。**
 *   `meta.season` 是由 `meta.days` 導出的**經濟週期**（12 週一輪），
 *   而賽事賽季錨在「建立當天」（Q3.5 的 `startDay`），兩者本來就會逐季偏移。
 *   Q5 的決定：**賽季編號由賽事自己擁有**，畫面上的「賽季」只認這一個。
 *
 * ⚠ 新賽季的種子仍是 `seedForSeason(seasonSeed, 季號)`（Q1 就備好的派生函式）
 *   ⇒ 同一個存檔的 S2／S3／S4 賽程逐場決定性，重跑一模一樣。
 *
 * @param {object} p
 * @param {object} p.state       目前（已封存）的賽季狀態
 * @param {object} p.playerTeam  `profileStore.team`
 * @param {number} p.seasonSeed  `meta.seasonSeed`（不可變）
 * @param {number} p.startDay    新賽季錨在哪一天（＝換季當下的 `meta.days`）
 * @returns {{ok:boolean, state:object|null, archived:object|null, errors:Array}}
 *   `archived` = 上一季的 FinalStandings（呼叫端負責存進歷史）
 */
export function rollToNextSeason({ state, playerTeam, seasonSeed, startDay } = {}) {
  const can = canRollSeason(state);
  if (!can.ok) return { ok: false, state: null, archived: null, errors: [{ code: "cannot_roll", message: can.reason }] };

  const made = createSeasonState({
    playerTeam,
    season: can.nextSeason,
    seasonSeed,
    gameMode: activeCompetitionOf(state)?.gameMode ?? "moba",
    startDay,
  });
  if (!made.ok) return { ok: false, state: null, archived: null, errors: made.errors };

  //  新賽季不得繼承任何上一季的痕跡——這裡順手斷言一次，
  //  因為「歸零」是規格明列的驗收項，出錯要在這裡就爆，而不是三個畫面之後。
  if ((made.state.outcomes ?? []).length !== 0 || made.state.final) {
    return { ok: false, state: null, archived: null, errors: [{ code: "not_clean", message: "新賽季必須是乾淨的（無賽果、無封存）" }] };
  }
  //  Q7a-3f.1：歷屆成績存的是**生涯主要賽事的最終名次**，不是賽季封存物件。
  //  ⚠ 單一 Event（所有既有存檔）時，`careerFinal` 與 `state.final` 是
  //    **同一個物件**（`applySealSeason` 就是拿它當賽季 final）⇒ 逐位元不變。
  //  ⚠ 多 Event 時 `state.final` 是 SeasonSeal（沒有 rows），存進歷史等於
  //    讓「歷屆成績」那一頁失去內容。生涯成績才是玩家要看的東西。
  //  ⚠ 指不到生涯賽事（舊存檔的曖昧情形）⇒ 退回 `state.final`，不編一份假的。
  const careerFinal = tryCareerFinalStandingsOf(state);
  return { ok: true, state: made.state, archived: careerFinal ?? state.final, errors: [] };
}

/**
 * 賽季相對進度（Q5 修的顯示問題）。
 *
 * 舊版畫面拿**絕對遊戲日**去對 84 天，於是賽季末會顯示「第 95 / 84 天」——
 * 因為賽季錨在建立當天（`startDay`），不是遊戲的第 1 天。
 * 這一支回傳的是**本賽季第幾天**，畫面只顯示它。
 */
export function seasonDayOf(state, currentDay) {
  const start = Number(state?.startDay) || 1;
  const d = Math.max(1, Math.floor(Number(currentDay) || 1) - start + 1);
  return { seasonDay: Math.min(d, SEASON_DAYS), seasonDays: SEASON_DAYS, overrun: d > SEASON_DAYS };
}

/**
 * 常規賽積分榜（唯一入口；畫面不得自己算）。
 *
 * ⚠ Q6：**只吃常規賽的賽果**。季後賽場次住在同一個 `state.fixtures`／`outcomes`
 *   裡（那是刻意的——所有既有機制因此不用改），但它們**不能進常規賽積分榜**。
 */
export function standingsOf(state, competitionId, rule = "win3") {
  const entry = requireEntry(state, competitionId, "standingsOf");
  //  ⚠ 這裡刻意仍然把**整份 outcomes** 交給 computeStandings，由它用 stageId
  //    過濾（季後賽賽果不進常規賽榜，Q6 §那條）。先自己篩一次再交出去，
  //    等於把同一條過濾規則寫兩個地方。
  return computeStandings({
    outcomes: state?.outcomes ?? [],
    participants: entry?.stage?.participants ?? [],
    rule,
    stageId: entry?.stage?.id ?? null,
  });
}

/** 目前聚焦賽制的積分榜。legacy 只有一個賽制 ⇒ 與 v1 逐值相同。 */
export function seasonStandings(state, rule = "win3") {
  return standingsOf(state, activeEntryOf(state)?.competition?.id, rule);
}

/**
 * 某個 Event 的積分榜——由它的 `rankingCompetitionId` 決定（資格賽不算進去）。
 * **找不到該 Event ⇒ throw**；Event 存在但還沒指定名次賽制 ⇒ throw（那是設定缺失，
 * 不是「沒有資料」）。
 */
export function eventStandingsOf(state, eventId, rule = "win3") {
  const ev = requireEvent(state, eventId, "eventStandingsOf");
  if (!ev.rankingCompetitionId) {
    throw new TypeError(`eventStandingsOf：賽事 ${eventId} 沒有指定 rankingCompetitionId，無法決定名次來源`);
  }
  return standingsOf(state, ev.rankingCompetitionId, rule);
}

/** 同上，但允許「沒有這個 Event／還沒指定名次賽制」⇒ 回 `null`（畫面用）。 */
export function tryEventStandingsOf(state, eventId, rule = "win3") {
  const ev = state?.events?.[eventId];
  if (!ev?.rankingCompetitionId || !competitionEntry(state, ev.rankingCompetitionId)) return null;
  return standingsOf(state, ev.rankingCompetitionId, rule);
}

/** 同上，賽制版。 */
export function tryStandingsOf(state, competitionId, rule = "win3") {
  return competitionEntry(state, competitionId) ? standingsOf(state, competitionId, rule) : null;
}

// ── Milestone Q6：季後賽 ──────────────────────────────────────────────────

/** 季後賽的場次（沒有季後賽 ⇒ 空陣列）。 */
export const playoffFixturesOfCompetition = (state, cid) =>
  (state?.fixtures ?? []).filter((f) => f.stageId === competitionEntry(state, cid)?.playoff?.stage?.id);
export const regularFixturesOfCompetition = (state, cid) =>
  (state?.fixtures ?? []).filter((f) => f.stageId === competitionEntry(state, cid)?.stage?.id);

export const playoffFixturesOf = (state) =>
  (state?.fixtures ?? []).filter((f) => f.stageId === activePlayoffOf(state)?.stage?.id);

/** 常規賽的場次。 */
export const regularFixturesOf = (state) =>
  (state?.fixtures ?? []).filter((f) => f.stageId === activeStageOf(state)?.id);

/** 常規賽是不是每一場都收尾了。 */
export const isRegularSeasonDone = (state) =>
  regularFixturesOf(state).length > 0 && regularFixturesOf(state).every(isFixtureTerminal);

/**
 * 常規賽結束 ⇒ 產生晉級資格與季後賽對戰表。**冪等、可重複呼叫。**
 *
 * 第一次呼叫建立賽段與兩場準決賽；準決賽都收尾後再呼叫，才補得出季軍戰與決賽
 * （決賽對手要等準決賽打完才知道——見 `playoffs.js` 檔頭）。
 *
 * ⚠ 常規賽沒打完就呼叫 ⇒ 什麼都不做。季後賽的種子順序來自**常規賽**積分榜，
 *   還沒打完就排等於用不完整的名次決定晉級。
 */
export function ensurePlayoffs(state) {
  if (!state?.schema) return { ok: false, state, added: 0, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
  if (state.final) return { ok: true, state, added: 0, errors: [] };          // 已封存，不再動
  if (!isRegularSeasonDone(state)) return { ok: true, state, added: 0, errors: [] };

  let next = state;
  //  ① 還沒有季後賽賽段 ⇒ 依常規賽積分榜產生晉級資格與賽段
  if (!activePlayoffOf(next)) {
    const q = createQualification({
      standings: seasonStandings(next),
      stage: activeStageOf(next),
      toStageId: `stage:${activeCompetitionOf(next).id}:${PLAYOFF_STAGE_KEY}`,
    });
    if (!q.ok) return { ok: false, state, added: 0, errors: q.errors };
    //  季後賽接在**最後一場常規賽之後**。+2 是刻意留一天喘息，
    //  也讓「賽季第 N 天」讀起來像真的賽程表而不是連著打。
    const lastRegularDay = Math.max(...regularFixturesOf(next).map((f) => f.day), 1);
    const entry = activeEntryOf(next);
    const st2 = createPlayoffStage({
      competition: entry.competition,
      qualification: q.qualification,
      dayRange: { from: lastRegularDay + 2, to: lastRegularDay + 4 },
    });
    if (!st2.ok) return { ok: false, state, added: 0, errors: st2.errors };
    //  ⚠ Q7a-3b：季後賽住在**它自己那個賽制條目**裡，不是賽季頂層。
    next = withEntry(next, entry.competition.id, {
      ...entry,
      competition: { ...entry.competition, stageIds: [...(entry.competition.stageIds ?? []), st2.stage.id] },
      playoff: { stage: st2.stage, qualification: q.qualification, baseDay: lastRegularDay + 2 },
    });
  }

  //  ② 補出現在排得出來的場次
  const made = ensurePlayoffFixtures({
    stage: activePlayoffOf(next).stage,
    qualification: activePlayoffOf(next).qualification,
    fixtures: playoffFixturesOf(next),
    outcomes: next.outcomes ?? [],
    baseDay: activePlayoffOf(next).baseDay,
  });
  if (!made.ok) return { ok: false, state, added: 0, errors: made.errors };
  if (made.added.length) next = { ...next, fixtures: [...next.fixtures, ...made.added] };
  return { ok: true, state: next, added: made.added.length, errors: [] };
}

/** 季後賽是不是打完了（含季軍戰與決賽）。 */
export function isPlayoffDoneOf(state, cid) {
  if (!competitionEntry(state, cid)?.playoff) return false;
  const fx = playoffFixturesOfCompetition(state, cid);
  //  四場都要在（sf1／sf2／bronze／final），而且都收尾
  return fx.length === PLAYOFF_MATCHES.length && fx.every(isFixtureTerminal);
}

export function isPlayoffDone(state) {
  return isPlayoffDoneOf(state, activeEntryOf(state)?.competition?.id);
}

// ── CS Season M3-1：年度 Major ────────────────────────────────────────────
//
//  Major 與 MOBA 季後賽在**賽制上是同一件事**（4 隊單淘汰），所以對戰表的產生
//  完全共用 `playoffs.js`。差別只有三點，全部由 `csMajor.js` 決定：
//  席位來自哪一張榜、它是獨立的 Event、排在聯賽之後的哪幾天。
//
//  ⚠ 這裡刻意**不做成 `ensurePlayoffs` 的參數化版本**。那條路徑上掛的是
//    MOBA 的季後賽語意（季後賽是**聯賽自己的**後段，住在同一個賽制條目裡）；
//    Major 是**另一個 Competition**。硬塞成同一支只會讓兩邊都變難讀。
//    共用的是純函式（`createQualification` / `createPlayoffStage` /
//    `ensurePlayoffFixtures` / `playoffOrder`），不是編排。

/** 這一季的年度 Major 賽制條目（沒有就回 null）。 */
export const csMajorEntryOf = (state) => competitionEntries(state).find(isCsMajorEntry) ?? null;

/** Major 的對戰表場次。 */
export const csMajorFixturesOf = (state) =>
  (state?.fixtures ?? []).filter((f) => f.stageId === csMajorEntryOf(state)?.stage?.id);

/** Major 打完了嗎（四場都在、而且都收尾）。 */
export function isCsMajorDone(state) {
  const entry = csMajorEntryOf(state);
  if (!entry) return false;
  return isPlayoffDoneOf(state, entry.competition.id);
}

/**
 * CS 聯賽結束 ⇒ 產生年度 Major 與它的對戰表。**冪等、可重複呼叫。**
 *
 * 第一次呼叫建立 Event / Competition / 賽段與兩場準決賽；準決賽都收尾後再呼叫，
 * 才補得出季軍戰與決賽（決賽對手要等準決賽打完——見 `playoffs.js` 檔頭）。
 *
 * ⚠ 只對 **CS** 賽季作用。MOBA 傳進來原樣回傳（連物件參考都不換），
 *   所以 Q6 的季後賽路徑一個字都沒被動到。
 * ⚠ 聯賽沒打完就呼叫 ⇒ 什麼都不做。四強席位來自**完整的**聯賽積分榜，
 *   還沒打完就排等於用不完整的名次決定晉級。
 */
export function ensureCsMajor(state) {
  if (!state?.schema) return { ok: false, state, added: 0, errors: [{ code: "no_season", message: "目前沒有賽季" }] };
  if (gameModeOf(state) !== "cs") return { ok: true, state, added: 0, errors: [] };
  if (state.final) return { ok: true, state, added: 0, errors: [] };          // 已封存，不再動
  if (!isRegularSeasonDone(state)) return { ok: true, state, added: 0, errors: [] };

  let next = state;
  //  ① 還沒有 Major ⇒ 依聯賽積分榜建立它
  if (!csMajorEntryOf(next)) {
    const leagueEntry = activeEntryOf(next);
    const circuit = Object.values(next.circuits ?? {})[0] ?? null;
    const built = buildCsMajor({
      circuit,
      leagueStage: leagueEntry?.stage ?? null,
      standings: seasonStandings(next),
      season: next.season,
      lastLeagueDay: Math.max(...regularFixturesOf(next).map((f) => f.day), 1),
    });
    if (!built.ok) return { ok: false, state, added: 0, errors: built.errors };

    next = {
      ...next,
      competitions: {
        ...next.competitions,
        [built.competition.id]: {
          competition: built.competition,
          //  ⚠ `stage` 與 `playoff.stage` 是**同一個賽段**：Major 整個賽制就是
          //    這張對戰表。理由與後果（半張對戰表不得封存）見 `csMajor.js` 檔頭。
          stage: built.stage,
          playoff: { stage: built.stage, qualification: built.qualification, baseDay: built.baseDay },
          expectsPlayoff: true,
        },
      },
      circuits: circuit
        ? { ...next.circuits, [circuit.id]: { ...circuit, eventIds: [...(circuit.eventIds ?? []), built.event.id] } }
        : next.circuits,
      events: { ...next.events, [built.event.id]: built.event },
      //  ⚠ `activeEventId` / `careerEventId` **刻意不動**。前者是畫面聚焦，
      //    後者是生涯主線——兩個都不該因為多了一個賽事就被系統換掉。
    };
  }

  //  ② 補出現在排得出來的場次
  const entry = csMajorEntryOf(next);
  const made = ensurePlayoffFixtures({
    stage: entry.stage,
    qualification: entry.playoff.qualification,
    fixtures: csMajorFixturesOf(next),
    outcomes: next.outcomes ?? [],
    baseDay: entry.playoff.baseDay,
  });
  if (!made.ok) return { ok: false, state, added: 0, errors: made.errors };
  if (made.added.length) next = { ...next, fixtures: [...next.fixtures, ...made.added] };
  return { ok: true, state: next, added: made.added.length, errors: [] };
}

/** 季後賽對戰表（畫面用）。 */
export function playoffView(state) {
  if (!activePlayoffOf(state)) return null;
  const fixtures = playoffFixturesOf(state);
  return {
    stageId: activePlayoffOf(state).stage.id,
    qualified: activePlayoffOf(state).qualification.qualified,
    bracket: playoffBracket({
      fixtures, outcomes: state.outcomes ?? [], participants: participantsOf(state),
    }),
    done: isPlayoffDone(state),
    ...playoffOrder({ fixtures, outcomes: state.outcomes ?? [] }),
  };
}

/** 賽季進度摘要（畫面用）。 */
export function seasonProgress(state) {
  const fx = state?.fixtures ?? [];
  const done = fx.filter(isFixtureTerminal).length;
  const mine = fx.filter((f) => isPlayerFixture(state, f));
  return {
    total: fx.length,
    completed: done,
    remaining: fx.length - done,
    playerTotal: mine.length,
    playerCompleted: mine.filter(isFixtureTerminal).length,
    outcomes: (state?.outcomes ?? []).filter((o) => validateFixtureOutcome(o).ok).length,
    seasonDays: SEASON_DAYS,
  };
}
