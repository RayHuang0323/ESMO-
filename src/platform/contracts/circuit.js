// ============================================================================
//  platform/contracts/circuit.js — Circuit.v1 / Event.v1（Milestone Q7a-3a）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  現行 `competition.id = comp:{mode}:s{season}:{organizerId}:{tier}` 只有四個
//  鑑別欄位，**沒有賽事身分**。同季只要辦兩個 mode/organizer/tier 相同的賽事，
//  就會是同一個 competition.id ⇒ 同一個 stageId ⇒ 同輪次同對戰組合即同一個
//  fixtureId ⇒ 同 seed ⇒ 同 sessionId。整條鏈都是它的函數。
//
//  Q7a 的產品層級：
//      賽季 Season → 遊戲項目 Game Mode → 巡迴賽體系 Circuit → 單一賽事 Event
//        → 賽事階段 Competition / Stage → 晉級資格 Qualification → 對戰 Fixture
//
//  本檔補的是 **Circuit 與 Event 兩層**，讓 `competition.id` 之後能由賽事身分
//  推導，而不是由「賽季＋主辦方＋層級」湊出來。
//
//  ── 3a 的範圍（刻意很小）─────────────────────────────────────────────────
//  只有契約、`idScheme`、legacy 升級。**不改任何既有 id**，也還沒有人用新的
//  推導產生賽事——那是 3b/3c。因此本檔提供 `competitionIdForEvent()`，
//  但這一輪沒有呼叫端，是給下一輪用的。
//
//  ── 為什麼 legacy 存檔不重算 id ─────────────────────────────────────────
//  `competition.id` 是 stage → fixture → seed → session 的上游。改它等於讓
//  **所有既有 fixture 與已封存賽果全部對不上**。所以升級只做一件事：
//  **補上層欄位（circuitId / eventId / idScheme），一個既有欄位都不動。**
//  合成出來的 legacy circuit/event 是「事後補的容器」，不是重寫身分。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================

export const CIRCUIT_VERSION = "Circuit.v1";
export const EVENT_VERSION = "Event.v1";

/**
 * 賽事身分的推導版本。
 *   legacy-v1  Q7a 之前建立的：`comp:{mode}:s{season}:{org}:{tier}`，**原樣保留**
 *   event-v2   由 Event 推導：`comp:{event.id}:{tier}`
 */
export const ID_SCHEMES = Object.freeze({ legacy: "legacy-v1", event: "event-v2" });

/** 合成 legacy 容器時用的 key（保留字，新賽事不得使用）。 */
export const LEGACY_KEY = "legacy";

const slug = (s) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

// ── Circuit ─────────────────────────────────────────────────────────────────

/**
 * 建立巡迴賽體系。**一個 Season 內、某個遊戲項目的一條競賽路線。**
 *
 * ⚠ Season 仍是第一級的時間／生涯週期，Circuit 掛在 Season 底下，
 *   不是反過來（產品定案 2026-08-13）。
 */
export function createCircuit({ gameMode = "moba", season = 1, circuitKey = "", name = "" } = {}) {
  const errors = [];
  if (gameMode !== "moba" && gameMode !== "cs") errors.push({ code: "mode", message: `gameMode 必須為 moba/cs，收到 ${gameMode}` });
  if (!Number.isInteger(season) || season < 1) errors.push({ code: "season", message: "賽季編號必須是 1 以上的整數" });
  const key = slug(circuitKey);
  if (!key) errors.push({ code: "key", message: "巡迴賽體系必須有 circuitKey" });
  if (errors.length) return { ok: false, circuit: null, errors };

  return {
    ok: true,
    errors: [],
    circuit: {
      schema: CIRCUIT_VERSION,
      id: `circuit:${gameMode}:s${season}:${key}`,
      gameMode,
      season,
      circuitKey: key,
      name: name || `第 ${season} 賽季 ${key}`,
      //  ⚠ 只存身分，不存積分。Circuit Points 是 3c 的事，而且來源必須是
      //    各 Event 封存後的**最終名次**，不是 FixtureOutcome——否則會出現
      //    第二份晉級真相（與 competitionOutcomes 是唯一出口的立場衝突）。
      eventIds: [],
    },
  };
}

export function validateCircuit(c) {
  const errors = [];
  if (!c || typeof c !== "object") return { ok: false, errors: [{ code: "invalid", message: "巡迴賽體系不是物件" }] };
  if (c.schema !== CIRCUIT_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${CIRCUIT_VERSION}` });
  if (!c.id) errors.push({ code: "id", message: "缺少識別碼" });
  if (c.gameMode !== "moba" && c.gameMode !== "cs") errors.push({ code: "mode", message: "gameMode 不合法" });
  if (!Number.isInteger(c.season) || c.season < 1) errors.push({ code: "season", message: "賽季編號不合法" });
  if (!Array.isArray(c.eventIds)) errors.push({ code: "events", message: "eventIds 必須是陣列" });
  return { ok: errors.length === 0, errors };
}

// ── Event ───────────────────────────────────────────────────────────────────

/**
 * 建立單一賽事（Circuit 裡的一站）。
 *
 * @param {object} p.circuit   Circuit.v1
 * @param {string} p.eventKey  這一站的 key（同一個 Circuit 內唯一）
 * @param {string} p.tier      層級標籤（沿用 competition 的語意，共用層不解讀）
 */
export function createEvent({ circuit, eventKey = "", name = "", tier = "regular" } = {}) {
  const errors = [];
  if (!validateCircuit(circuit).ok) errors.push({ code: "circuit", message: "缺少有效的巡迴賽體系" });
  const key = slug(eventKey);
  if (!key) errors.push({ code: "key", message: "賽事必須有 eventKey" });
  if (errors.length) return { ok: false, event: null, errors };

  return {
    ok: true,
    errors: [],
    event: {
      schema: EVENT_VERSION,
      id: `event:${circuit.id}:${key}`,
      circuitId: circuit.id,
      gameMode: circuit.gameMode,
      season: circuit.season,
      eventKey: key,
      tier,
      name: name || `${circuit.name} ${key}`,
      //  一個 Event 底下可以有多個 Competition（例如資格賽與正賽）。
      //  3a 只帶身分，實際並存是 3b。
      competitionIds: [],
      //  封存後的最終名次（3c 才會寫；Circuit Points 只吃這裡，不吃 outcomes）
      final: null,
    },
  };
}

export function validateEvent(e) {
  const errors = [];
  if (!e || typeof e !== "object") return { ok: false, errors: [{ code: "invalid", message: "賽事不是物件" }] };
  if (e.schema !== EVENT_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${EVENT_VERSION}` });
  if (!e.id) errors.push({ code: "id", message: "缺少識別碼" });
  if (!e.circuitId) errors.push({ code: "circuit_id", message: "賽事必須屬於一個巡迴賽體系" });
  if (e.gameMode !== "moba" && e.gameMode !== "cs") errors.push({ code: "mode", message: "gameMode 不合法" });
  if (!Array.isArray(e.competitionIds)) errors.push({ code: "comps", message: "competitionIds 必須是陣列" });
  return { ok: errors.length === 0, errors };
}

/**
 * **v2 的 competition.id 推導。3a 尚無呼叫端**——先定義好，3b 產生新賽事時才用。
 * 定義在這裡而不是 competition.js，是為了讓「id 由賽事身分推導」這件事
 * 跟 Circuit/Event 待在同一個檔，改的時候不會漏掉另一半。
 */
export const competitionIdForEvent = (event, tier = "regular") => `comp:${event?.id}:${tier}`;

// ── legacy 升級 ─────────────────────────────────────────────────────────────

/** 這個賽事是不是還沒有身分資訊（Q7a 之前建立的）。 */
export const needsIdentityUpgrade = (competition) => !!competition && !competition.idScheme;

/** 合成 legacy 容器：既有賽事「事後」被歸進去的那一條 Circuit 與那一站 Event。 */
export function legacyContainersFor(competition) {
  const gameMode = competition?.gameMode ?? "moba";
  const season = Number.isInteger(competition?.season) ? competition.season : 1;
  const circuit = createCircuit({
    gameMode, season, circuitKey: LEGACY_KEY,
    name: `第 ${season} 賽季（既有）`,
  }).circuit;
  const event = createEvent({
    circuit, eventKey: slug(competition?.tier) || "regular",
    tier: competition?.tier ?? "regular",
    name: competition?.name ?? `第 ${season} 賽季`,
  }).event;
  return { circuit, event };
}

/**
 * 把既有賽事補上身分資訊。
 *
 * ⚠ **`id` 以及所有既有欄位一個都不動**，只增加 `circuitId` / `eventId` /
 *   `idScheme`。這是整個 3a 唯一的紅線：改了 id，既有 fixture 與已封存賽果
 *   就全部對不上。
 * ⚠ **冪等**：已經有 `idScheme` 就原樣回傳（連物件參考都不換），
 *   否則每次載入都會產生新物件，害畫面白重繪、也害 JSON 比對失準。
 */
export function upgradeCompetitionIdentity(competition) {
  if (!competition || typeof competition !== "object") {
    return { ok: false, competition, circuit: null, event: null, errors: [{ code: "invalid", message: "賽事不是物件" }] };
  }
  if (!needsIdentityUpgrade(competition)) {
    return { ok: true, competition, circuit: null, event: null, errors: [], alreadyUpgraded: true };
  }
  const { circuit, event } = legacyContainersFor(competition);
  return {
    ok: true,
    errors: [],
    alreadyUpgraded: false,
    circuit: { ...circuit, eventIds: [event.id] },
    event: { ...event, competitionIds: [competition.id] },
    competition: {
      ...competition,
      circuitId: circuit.id,
      eventId: event.id,
      idScheme: ID_SCHEMES.legacy,
    },
  };
}

/** 賽事身分是不是 legacy 推導出來的。 */
export const isLegacyIdentity = (competition) => competition?.idScheme === ID_SCHEMES.legacy;
