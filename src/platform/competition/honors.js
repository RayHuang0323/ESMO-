// ============================================================================
//  platform/competition/honors.js — 生涯榮耀（Milestone Q7d）
//
//  產品語意：`Event.final` → 年度冠軍 → **Career Honors** → 歷屆紀錄與累積成就
//
//  ── 為什麼榮耀需要自己一層 ──────────────────────────────────────────────
//  audit 過既有三個候選，沒有一個承載得了：
//    · `competitionHistory` 存的是 `FinalStandings`（官方聯賽最終名次）。
//      Q5／Q6 對它的形狀有斷言，塞進別種東西會讓「歷屆成績」變成兩種型別。
//    · `circuitHistory` 存的是巡迴賽積分摘要。年度總決賽**刻意不在巡迴賽那條
//      circuit 裡**（Q7b：它自己一條、沒有積分政策），所以 `summarizeCircuitSeason`
//      對它回 null——它本來就不該出現在那裡。
//    · `processedCompetitionAwards` 是**錢**的冪等帳本。榮耀不是錢。
//  而且上面兩個 history **都只在換季時寫入、上限 20 季**。年度冠軍是在
//  `_sealSeasonIfFinished` 就產生的，等到換季才記等於：玩家不換季就沒有榮耀。
//
//  ⇒ 榮耀是**世界歷史**，自己一層、封存當下就寫、不隨換季而失去。
//
//  ── 三條界線 ────────────────────────────────────────────────────────────
//  ① **年度冠軍的唯一來源是年度總決賽的 `Event.final`。**
//     不從 bracket 勝方、SeasonSeal、careerFinal、巡迴積分榜重新推導。
//     每一筆榮耀都帶 `sourceFinalId`，來源可回溯。
//  ② **一季一項榮耀只有一筆。** id 由「類型＋遊戲項目＋賽季」決定性推導，
//     重跑封存／重載／換季／重送結算都不會多出第二筆。
//  ③ **這是世界歷史，不是玩家的獎盃櫃。** 冠軍是 AI 隊伍照樣寫。
//     玩家自己拿過幾次是**推導**出來的（`teamHonorCount`），不另存一份。
//
//  ⚠ 本檔**不落盤任何可推導的索引**：真相是那一份 `honors[]`，
//    「玩家拿過幾次」「最近一季是誰」全部即時算。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { asiaFinalsEventOf } from "./asiaFinals.js";
import { CS_MAJOR_EVENT_KEY } from "./csMajor.js";

export const HONOR_VERSION = "Honor.v1";

/**
 * 榮耀類型。**仍然刻意不做泛化的 Award 系統**——每一種榮耀都明文列舉，
 * 因為「這筆榮耀從哪個賽事來」必須看得出來，不能靠欄位組合去猜。
 */
export const HONOR_TYPES = Object.freeze({
  asiaAnnualChampion: "asia_annual_champion",
  //  CS Season M3-3：CS 的年度冠軍。**刻意是另一個類型**，不是把上面那個
  //  參數化成「某某年度冠軍」——兩者的來源賽事不同（亞洲總決賽 vs 年度 Major）。
  //  合成一個類型之後，「這筆榮耀是怎麼來的」就只剩 gameMode 可以猜。
  csAnnualChampion: "cs_annual_champion",
});

export const HONOR_LABELS = Object.freeze({
  [HONOR_TYPES.asiaAnnualChampion]: "亞洲年度冠軍",
  [HONOR_TYPES.csAnnualChampion]: "CS 年度冠軍",
});

/**
 * 榮耀的決定性 id：**類型 ＋ 遊戲項目 ＋ 賽季**。
 *
 * ⚠ 刻意**不含 eventId 或隊伍**：一季一個項目就只有一個年度冠軍，
 *   id 綁死這件事，重複寫入在 id 這一層就被擋住，不必靠比對內容。
 */
export const honorIdFor = (honorType, gameMode, season) => `honor:${honorType}:${gameMode}:s${season}`;

/** 榮耀清單（唯一真相，只 append）。 */
export const honorsOf = (honors) => (Array.isArray(honors) ? honors : []);

// ── 產生 ────────────────────────────────────────────────────────────────────

/**
 * 從**已封存的**年度總決賽產生一筆年度冠軍榮耀。
 *
 * @param {object} p.state     賽季狀態
 * @param {function} p.finalOf `seasonState.eventFinalOf`（注入，不反向依賴賽季層）
 * @returns {object|null} 榮耀紀錄；還不該產生就回 `null`
 */
export function annualChampionHonorOf(state, finalOf) {
  return honorFromEvent(state, asiaFinalsEventOf(state), HONOR_TYPES.asiaAnnualChampion, finalOf);
}

/**
 * CS 年度冠軍榮耀（CS Season M3-3）。來源是**年度 Major 的 `Event.final`**。
 *
 * ⚠ 與亞洲總決賽那條走**同一支** `honorFromEvent`：界線 ①（唯一來源是
 *   Event.final、不從 bracket 勝方重新推導）對兩者是同一份規則，不是兩份。
 * ⚠ Major 沒封存就沒有冠軍——打完決賽但 Event 還沒封存也不算。
 */
export function csAnnualChampionHonorOf(state, finalOf) {
  if (state?.schema && gameModeOfState(state) !== "cs") return null;
  const ev = Object.values(state?.events ?? {}).find((e) => e?.eventKey === CS_MAJOR_EVENT_KEY) ?? null;
  return honorFromEvent(state, ev, HONOR_TYPES.csAnnualChampion, finalOf);
}

/** 這一份賽季狀態是哪個項目的（不 import 賽季層，就地推導）。 */
const gameModeOfState = (state) =>
  Object.values(state?.competitions ?? {})[0]?.competition?.gameMode ?? "moba";

/** 由一個**已封存的** Event 產生一筆年度冠軍榮耀。兩種榮耀共用這一份規則。 */
function honorFromEvent(state, ev, honorType, finalOf) {
  if (!ev) return null;                                  // 這一季沒有這個賽事
  const final = typeof finalOf === "function" ? finalOf(state, ev.id) : (ev.final ?? null);
  //  ⚠ **沒有封存就沒有冠軍。** 打完決賽但 Event 還沒封存也不算——
  //    與畫面同一條線（Q7c 的 gate #8 守的就是這件事）。
  if (!final?.championTeamId) return null;

  const row = (final.rows ?? []).find((r) => r.teamId === final.championTeamId) ?? null;
  const gameMode = ev.gameMode ?? "moba";
  const season = ev.season ?? state?.season ?? null;
  if (season == null) return null;

  return {
    schema: HONOR_VERSION,
    id: honorIdFor(honorType, gameMode, season),
    honorType,
    label: HONOR_LABELS[honorType],
    season,
    gameMode,
    eventId: ev.id,
    eventName: ev.name ?? ev.id,
    championTeamId: final.championTeamId,
    //  ⚠ 隊名是**當下的顯示名稱快照**。日後改隊名不影響這筆榮耀的身分
    //    （身分是 id 與 teamId），但歷史頁要顯示得出當年叫什麼。
    championTeamName: row?.name ?? null,
    finalRank: row?.rank ?? 1,
    earnedAtDay: final.sealedAtDay ?? null,
    //  **來源存證**：這份榮耀是哪一份不可變封存名次給的
    sourceFinalId: final.id ?? null,
  };
}

/**
 * 把「該有但還沒有」的榮耀補齊。**冪等、可重複呼叫。**
 *
 * ⚠ 判定看的是 **id 是否已存在**，不是內容比對——id 已經把
 *   「一季一個項目一筆」編碼進去了。
 * ⚠ 已存在就**原樣回傳同一個陣列參考**，不產生新物件
 *   （否則每次結算都會讓畫面白重繪）。
 */
export function recordPendingHonors(state, honors, finalOf) {
  let list = honorsOf(honors);
  const added = [];
  //  ⚠ 逐個產生器跑一遍。同一份賽季狀態只會命中其中一個（MOBA 沒有 Major、
  //    CS 沒有亞洲總決賽），但**不靠這件事**——每一筆都各自查 id 是否已存在。
  for (const produce of [annualChampionHonorOf, csAnnualChampionHonorOf]) {
    const made = produce(state, finalOf);
    if (!made) continue;
    if (list.some((h) => h?.id === made.id)) continue;
    //  新的在前（與其他歷史一致的閱讀順序）
    list = [made, ...list];
    added.push(made);
  }
  return { honors: list, added };
}

// ── 查詢（全部即時推導，不落盤索引）──────────────────────────────────────

/** 某個類型的所有榮耀，賽季由新到舊。 */
export function honorsByType(honors, honorType, { gameMode = null } = {}) {
  return honorsOf(honors)
    .filter((h) => h?.honorType === honorType && (gameMode == null || h.gameMode === gameMode))
    .slice()
    .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
}

/** 歷屆亞洲年度冠軍（新到舊）。 */
export const annualChampionsOf = (honors, opts = {}) =>
  honorsByType(honors, HONOR_TYPES.asiaAnnualChampion, opts);

/** 最近一季的亞洲年度冠軍（沒有 ⇒ null）。 */
export const latestAnnualChampion = (honors, opts = {}) => annualChampionsOf(honors, opts)[0] ?? null;

/**
 * 某支隊伍拿過幾次榮耀。
 * ⚠ **推導**出來的，不另存計數——存了就會與 `honors[]` 漂移。
 */
export function teamHonorCount(honors, teamId, { honorType = null, gameMode = null } = {}) {
  if (!teamId) return 0;
  return honorsOf(honors).filter((h) =>
    h?.championTeamId === teamId &&
    (honorType == null || h.honorType === honorType) &&
    (gameMode == null || h.gameMode === gameMode)).length;
}

/** 某一季的榮耀。 */
export const honorsOfSeason = (honors, season) =>
  honorsOf(honors).filter((h) => h?.season === season);

/** 這一季的年度冠軍榮耀是否已經記過（冪等查詢用）。 */
export const hasAnnualChampionHonor = (honors, gameMode, season) =>
  honorsOf(honors).some((h) => h?.id === honorIdFor(HONOR_TYPES.asiaAnnualChampion, gameMode, season));

/**
 * 榮耀清單的一致性驗證。
 *
 * ⚠ 與 `validateSeasonScope` 同一條紀律：檢查**結構**，不是「有沒有資料」。
 */
export function validateHonors(honors) {
  const errors = [];
  const list = honorsOf(honors);
  const seen = new Set();
  for (const h of list) {
    if (h?.schema !== HONOR_VERSION) {
      errors.push({ code: "schema", message: `榮耀 ${h?.id ?? "(無 id)"} 的 schema 必須是 ${HONOR_VERSION}` });
      continue;
    }
    if (!h.id) { errors.push({ code: "id", message: "榮耀缺少識別碼" }); continue; }
    if (seen.has(h.id)) {
      errors.push({ code: "duplicate", message: `同一份榮耀出現兩次：${h.id}` });
    }
    seen.add(h.id);
    if (h.id !== honorIdFor(h.honorType, h.gameMode, h.season)) {
      errors.push({ code: "id_shape", message: `榮耀 ${h.id} 的 id 與其類型／項目／賽季不一致` });
    }
    if (!h.championTeamId) {
      errors.push({ code: "champion", message: `榮耀 ${h.id} 沒有冠軍隊伍` });
    }
    //  ⚠ 沒有來源存證的榮耀 = 不知道從哪來的榮耀
    if (!h.sourceFinalId) {
      errors.push({ code: "source", message: `榮耀 ${h.id} 缺少來源封存名次（sourceFinalId）` });
    }
  }
  return { ok: errors.length === 0, errors };
}
