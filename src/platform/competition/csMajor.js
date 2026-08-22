// ============================================================================
//  platform/competition/csMajor.js — CS 年度 Major（CS Season M3-1）
//
//  ── 這一支做什麼 ──────────────────────────────────────────────────────────
//  CS 官方聯賽打完之後，把**積分榜前四**組成一個獨立的年度 Major：
//  自己的 Event、自己的 Competition（`comp:cs:s1:official:major`）、
//  自己的 single_elim 賽段與四場對戰表，最後產生自己的 FinalStandings。
//
//  ── 為什麼不是第二套季後賽 ────────────────────────────────────────────────
//  `playoffs.js` 已經是一台「4 隊單淘汰」的機器：晉級資格、種子配對、
//  分兩輪產生（決賽對手要等準決賽打完）、冠亞季殿順序，全部都在裡面而且
//  MOBA 用了一整個 Q6 驗過。Major 與它**在賽制上是同一件事**，
//  所以本檔一條配對規則都不重寫，只負責三件 `playoffs.js` 不該知道的事：
//    ① 席位從**哪一張榜**來（CS 的規則寫在 `csSeasonConfig.js`）
//    ② 它是一個**獨立的 Event / Competition**，不是聯賽的附屬階段
//    ③ 它接在聯賽之後的哪幾天
//
//  ── 為什麼 Major 的 `stage` 與 `playoff` 是同一個賽段 ──────────────────────
//  賽制條目（`competitions[id]`）有兩個賽段欄位：`stage` 是這個賽制的正賽，
//  `playoff` 是它的季後賽。聯賽是「循環賽 ＋ 季後賽」⇒ 兩個不同的賽段。
//  **Major 整個賽制就是一張對戰表**，沒有正賽與季後賽之分 ⇒ 兩個欄位指向
//  同一個賽段。這不是把資料存兩份，是照實說「這個賽制從頭到尾都是淘汰賽」。
//
//  它同時讓封存判定**免費拿到正確的行為**：`canSealEvent` 對宣告
//  `expectsPlayoff` 的賽制會要求 `isPlayoffDoneOf`（四場都在、且都收尾）。
//  少了它，只排出兩場準決賽、兩場都打完的當下 `remaining` 就是 0，
//  Major 會**用半張對戰表封存**——季軍戰與決賽還沒打就先發冠軍。
//
//  ── ⛔ ownership lock ─────────────────────────────────────────────────────
//  本檔（以及整個 Season 層）**只認 series 的結果**。一個 Fixture ＝ 一個
//  series ＝ 一筆 FixtureOutcome，`score` 記**地圖數**。單張地圖的
//  round / half / overtime / 比分是 Codex 的責任區（`EsportsFPS3D.jsx`），
//  本檔不讀、不推導、不覆寫。見 `docs/ai/跨模型交接流程.md` 的 CS round-system lock。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { createCompetition } from "../contracts/competition.js";
import { createEvent, ID_SCHEMES } from "../contracts/circuit.js";
import { createQualification, createPlayoffStage, PLAYOFF_SLOTS } from "./playoffs.js";
import { csMajorQualifiers, CS_MAJOR_QUALIFICATION } from "./csSeasonConfig.js";
//  ⚠ 只取現役地圖的 key 清單。`csPrepData.js` 是純資料（沒有任何 import），
//    所以平台層引用它不會把賽前畫面的相依性拖進賽季狀態。
import { CS_MAPS } from "../../battle/fps/csPrepData.js";

/** Major 的層級標籤（`competition.id` 的最後一段）。 */
export const CS_MAJOR_TIER = "major";
/** Major 的 Event key（`event.id` 的最後一段）。 */
export const CS_MAJOR_EVENT_KEY = "major";
/** Major 的賽段 key（`stage.id` 的最後一段）。 */
export const CS_MAJOR_STAGE_KEY = "major";
/** 四強。與 `playoffs.js` 的 `PLAYOFF_SLOTS` 同一個數，這裡只是取個 CS 的名字。 */
export const CS_MAJOR_SLOTS = PLAYOFF_SLOTS;

/** Major 接在最後一場聯賽之後的第幾天（＋2 留一天喘息，與 MOBA 季後賽同慣例）。 */
export const CS_MAJOR_DAY_GAP = 2;

// ── CS Season M3-2：BO3 series ──────────────────────────────────────────────
//
//  規格 D4：**一個 Fixture ＝ 一個 series ＝ 一個 FixtureOutcome**，
//  `FixtureOutcome.score` 記**地圖數**（2:0 / 2:1）。
//
//  ⚠ **誠實揭露（規格 D4 已寫明）**：引擎現役地圖只有三張，所以三張池下的
//    BO3 就是「打滿三張、先拿兩張者勝」，veto 近乎裝飾（ban 一張、剩兩張選一張）。
//    因此 `veto` 明文寫 `null`，**不假裝有 ban/pick 博弈**。要做真正的 veto，
//    前置是把引擎地圖池擴到 7 張——那是另一條工作線，不綁在 CS Season MVP 裡。

/**
 * Major 的名次獎金政策（CS Season M3-3）。
 * `table` 由 `economy/economyConfig.js` 的 `prizeTableFor()` 解析成實際的表。
 */
export const CS_MAJOR_PRIZE_POLICY = Object.freeze({ kind: "rank_table", table: "cs_major" });

/** Major 的 BO 制。 */
export const CS_MAJOR_SERIES = "bo3";

/** BO3 ＝ 先拿兩張地圖。`ceil(3 / 2)`，寫成常數是為了讓斷言有東西可指。 */
export const CS_MAJOR_MAPS_TO_WIN = 2;

/**
 * Major 場次的 `matchFormat`。**共用層原樣攜帶、不解讀**（契約 Q2a 就這樣寫的）——
 * 唯一會讀它的是 CS 自己的模擬投影與賽前流程。
 *
 * ⚠ `mapPool` 直接取引擎的現役地圖 key，**不另抄一份清單**。抄一份的話，
 *   哪天引擎加了地圖，賽制設定會安靜地停在舊的三張。
 */
export const CS_MAJOR_MATCH_FORMAT = Object.freeze({
  series: CS_MAJOR_SERIES,
  mapPool: Object.freeze(CS_MAPS.map((m) => m.key)),
  veto: null,
});

/** 規格 §5 明文的 id：`comp:cs:s{season}:official:major`。 */
export const csMajorCompetitionId = (season = 1) => `comp:cs:s${season}:official:${CS_MAJOR_TIER}`;

/** 這個賽制條目是不是年度 Major。 */
export const isCsMajorEntry = (entry) => entry?.competition?.tier === CS_MAJOR_TIER
  && entry?.competition?.gameMode === "cs";

/**
 * 依聯賽積分榜組出年度 Major 的 Event / Competition / Stage / 晉級名單。
 *
 * ⚠ **席位規則只有一份**：`csMajorQualifiers()`（`csSeasonConfig.js`）。
 *   本檔用 `createQualification()` 產生 `Qualification.v1` 的**形狀**，
 *   然後與 `csMajorQualifiers()` 逐值比對——兩者不一致就**失敗**，不挑一個信。
 *   這樣「誰進得了 Major」永遠是設定檔說了算，而不是這裡剛好也切了前四。
 *
 * @param {object} p.circuit        聯賽所在的巡迴賽體系（Major 掛同一條）
 * @param {object} p.leagueStage    聯賽賽段（晉級邊的來源）
 * @param {object} p.standings      **聯賽的**積分榜（`seasonStandings()` 的輸出）
 * @param {number} p.season
 * @param {number} p.lastLeagueDay  最後一場聯賽的賽季日
 * @returns {{ok, competition, event, stage, qualification, baseDay, errors}}
 */
export function buildCsMajor({ circuit, leagueStage, standings, season = 1, lastLeagueDay = 84 } = {}) {
  const fail = (errors) => ({ ok: false, competition: null, event: null, stage: null, qualification: null, baseDay: null, errors });

  if (!circuit?.id) return fail([{ code: "circuit", message: "缺少巡迴賽體系，Major 無處可掛" }]);
  if (!leagueStage?.id) return fail([{ code: "league_stage", message: "缺少聯賽賽段，晉級邊沒有來源" }]);

  const comp = createCompetition({
    gameMode: "cs", season, organizerId: "official", tier: CS_MAJOR_TIER,
    name: `CS 第 ${season} 賽季 年度 Major`,
  });
  if (!comp.ok) return fail(comp.errors);

  const ev = createEvent({
    circuit, eventKey: CS_MAJOR_EVENT_KEY, tier: CS_MAJOR_TIER,
    name: `CS 第 ${season} 賽季 年度 Major`,
  });
  if (!ev.ok) return fail(ev.errors);

  //  ── 晉級：形狀走共用的產生器，規則走 CS 自己的設定 ──────────────────
  const q = createQualification({
    standings,
    stage: leagueStage,
    toStageId: `stage:${comp.competition.id}:${CS_MAJOR_STAGE_KEY}`,
    slots: CS_MAJOR_QUALIFICATION.topN,
  });
  if (!q.ok) return fail(q.errors);

  const byRule = csMajorQualifiers(standings);
  const bySlice = q.qualification.qualified.map(({ seed, teamId }) => ({ seed, teamId }));
  if (JSON.stringify(byRule) !== JSON.stringify(bySlice)) {
    //  ⚠ 走到這裡代表兩份規則對「誰進 Major」意見不同。**不得挑一個信**：
    //    靜默採用其中一份，日後改了設定卻沒生效會完全無聲。
    return fail([{
      code: "qualification_mismatch",
      message: "Major 晉級名單兩份規則不一致："
        + `設定=${byRule.map((x) => `${x.seed}.${x.teamId}`).join(",")}`
        + ` / 積分榜前四=${bySlice.map((x) => `${x.seed}.${x.teamId}`).join(",")}`,
    }]);
  }

  const baseDay = lastLeagueDay + CS_MAJOR_DAY_GAP;
  const st = createPlayoffStage({
    competition: comp.competition,
    qualification: q.qualification,
    dayRange: { from: baseDay, to: baseDay + 2 },
    key: CS_MAJOR_STAGE_KEY,
  });
  if (!st.ok) return fail(st.errors);

  return {
    ok: true,
    errors: [],
    baseDay,
    qualification: q.qualification,
    stage: st.stage,
    //  ⚠ `idScheme` 標 legacy 是**照實說**：這個 id 是
    //    `comp:{mode}:s{n}:{org}:{tier}` 的推導形狀（規格 §5 明文要求），
    //    不是由 Event 推導的 event-v2。標錯會讓日後的 id 遷移挑錯對象。
    competition: {
      ...comp.competition,
      circuitId: circuit.id,
      eventId: ev.event.id,
      idScheme: ID_SCHEMES.legacy,
      stageIds: [st.stage.id],
      qualifications: [q.qualification.id],
    },
    event: {
      ...ev.event,
      competitionIds: [comp.competition.id],
      //  Event 只有一個 Competition ⇒ 名次來源可以自動指定
      rankingCompetitionId: comp.competition.id,
      //  ── CS Season M3-3：Major 是 CS **唯一**發名次獎金的賽事 ─────────────
      //  M1 起 CS 一毛都不發，就是在等這個決定被真正做出來（見 `CS_MAJOR_PRIZE`
      //  的產品說明）。用的是 CS 自己的表，**不是** MOBA 那一份。
      //  ⚠ CS 聯賽仍然 `prizePolicy: null` —— 它是通往 Major 的資格賽，
      //    而玩家同一條日曆上還跑著 MOBA 賽季，兩個項目都按聯賽發會讓一季的
      //    名次收入直接翻倍。那是經濟平衡的變更，不由賽事結構這一層決定。
      prizePolicy: CS_MAJOR_PRIZE_POLICY,
    },
  };
}
