// ============================================================================
//  platform/competition/standings.js — 積分榜（Milestone Q2b）
//
//  ── 這一支的紅線：積分榜是推導，不是儲存 ────────────────────────────────
//  **唯一輸入是 `FixtureOutcome[]`。** 不維護第二份勝敗真相、不接受外部餵勝場數。
//  儲存積分榜等於製造第二份真相，與賽果不一致時沒人說得出聽誰的。
//
//  規格 §7：**進行中推導、結算後凍結**——賽季結束時由 Q4 對本函式的輸出做一次
//  `FinalStandings` snapshot（不可變）。修正 tiebreaker 規則不該讓三年前的冠軍換人。
//
//  ── Competition Analytics（規格修正 2）──────────────────────────────────
//  engine 與 simulated **一視同仁**。AI 模擬結果是正式賽果，該進聯賽的全部都進。
//  被擋在外面的只有 Combat/Balance Analytics（`combatOutcomes()`，只吃 engine）。
//
//  ── tiebreaker 必須是全序 ────────────────────────────────────────────────
//  最後一級用 `teamId` 字典序收尾 ⇒ **不可能出現並列而順序不定**的情況。
//  沒有這一級的話，同分同差同得分的兩隊排序會取決於陣列順序——
//  那正是本專案 P0 級缺陷「players 陣列順序決定勝負」的同一種病。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { competitionOutcomes, loserOf } from "../contracts/fixtureOutcome.js";

/** 積分規則。`win3` = 勝 3 分（Legacy BracketModule 的 `pts = w*3`）。 */
export const STANDINGS_RULES = Object.freeze({
  win3: { id: "win3", win: 3, loss: 0, label: "勝 3 分" },
  win1: { id: "win1", win: 1, loss: 0, label: "勝 1 分" },
});

export const ruleById = (id) => STANDINGS_RULES[id] ?? STANDINGS_RULES.win3;

/**
 * tiebreaker 的順序。**唯一來源**——畫面不得自己排。
 * 逐級套用，最後一級保證全序。
 */
export const TIEBREAKERS = Object.freeze([
  { key: "points", label: "積分", dir: "desc" },
  { key: "headToHead", label: "對戰成績", dir: "desc" },
  { key: "scoreDiff", label: "淨勝分", dir: "desc" },
  { key: "scoreFor", label: "總得分", dir: "desc" },
  { key: "teamId", label: "識別碼（決定性收尾）", dir: "asc" },
]);

/**
 * 計算積分榜。
 *
 * @param {object} p
 * @param {Array}  p.outcomes      FixtureOutcome[]（engine + simulated 一視同仁）
 * @param {Array}  p.participants  賽段參賽者 [{id, name, tag, isAi}]（決定有哪些列）
 * @param {string} [p.rule]        STANDINGS_RULES 的 id
 * @returns {{rows:Array, played:number, rule:object}}
 */
export function computeStandings({ outcomes, participants = [], rule = "win3", stageId = null } = {}) {
  const R = ruleById(rule);
  //  Q6：`stageId` 給定時只算**那一個賽段**的賽果。
  //  ⚠ 少了這道，季後賽賽果會被算進常規賽積分榜——`known` 是參賽者名單，
  //    而季後賽四隊本來就都在名單裡，光靠它擋不住。
  //  ⚠ 舊存檔的賽果沒有 `stageId`（Q6 之前的欄位）⇒ 視為常規賽，行為不變。
  const scoped = stageId
    ? (outcomes ?? []).filter((o) => (o?.stageId ?? stageId) === stageId)
    : outcomes;
  const valid = competitionOutcomes(scoped);
  const known = new Set(participants.map((p) => p.id));

  //  ① 建列：參賽者都要有一列，即使還沒打過（0 場也要看得到自己）
  const rows = new Map();
  for (const p of participants) {
    rows.set(p.id, {
      teamId: p.id, name: p.name ?? null, tag: p.tag ?? null, isAi: !!p.isAi,
      played: 0, wins: 0, losses: 0, points: 0,
      scoreFor: 0, scoreAgainst: 0, scoreDiff: 0,
      engineGames: 0, simulatedGames: 0, forfeitedGames: 0,
    });
  }

  //  ② 累計。**只讀 outcomes**——沒有第二個資料來源
  const h2h = new Map();   // `${winner}>${loser}` → 次數
  let counted = 0;
  for (const o of valid) {
    //  不屬於本賽段的賽果直接忽略（不同賽事的結果不得混進來）
    if (!known.has(o.sideA) || !known.has(o.sideB)) continue;
    const a = rows.get(o.sideA);
    const b = rows.get(o.sideB);
    const loser = loserOf(o);

    a.played++; b.played++;
    a.scoreFor += o.score.a; a.scoreAgainst += o.score.b;
    b.scoreFor += o.score.b; b.scoreAgainst += o.score.a;

    const w = rows.get(o.winner);
    const l = rows.get(loser);
    w.wins++; w.points += R.win;
    l.losses++; l.points += R.loss;

    //  來源分計（供畫面誠實標示「其中 N 場為模擬／棄權」；不影響任何排序）
    //  ⚠ 三種來源要分開數。Q3 之前這裡是 `if engine else simulated`，
    //    棄權加進來之後那個 else 會把棄權謊報成模擬。
    if (o.resultSource === "engine") { a.engineGames++; b.engineGames++; }
    else if (o.resultSource === "forfeited") { a.forfeitedGames++; b.forfeitedGames++; }
    else { a.simulatedGames++; b.simulatedGames++; }

    h2h.set(`${o.winner}>${loser}`, (h2h.get(`${o.winner}>${loser}`) ?? 0) + 1);
    counted++;
  }

  for (const r of rows.values()) r.scoreDiff = r.scoreFor - r.scoreAgainst;

  //  ③ 排序：逐級 tiebreaker，最後一級保證全序
  const list = [...rows.values()].sort((x, y) => compareRows(x, y, h2h));
  list.forEach((r, i) => { r.rank = i + 1; });

  return { rows: list, played: counted, rule: R };
}

/**
 * 兩列的比較。**唯一的排序規則**。
 * `headToHead` 只在兩隊之間比較——三隊以上並列時，逐對比較仍是決定性的，
 * 因為最後一級 `teamId` 保證全序（不會出現 A>B>C>A 導致順序不定）。
 */
function compareRows(x, y, h2h) {
  if (x.points !== y.points) return y.points - x.points;
  //  對戰成績：x 贏 y 幾次 vs y 贏 x 幾次
  const xw = h2h.get(`${x.teamId}>${y.teamId}`) ?? 0;
  const yw = h2h.get(`${y.teamId}>${x.teamId}`) ?? 0;
  if (xw !== yw) return yw - xw;
  if (x.scoreDiff !== y.scoreDiff) return y.scoreDiff - x.scoreDiff;
  if (x.scoreFor !== y.scoreFor) return y.scoreFor - x.scoreFor;
  //  決定性收尾：字典序。到這一級一定分得出高下 ⇒ 全序
  return x.teamId < y.teamId ? -1 : x.teamId > y.teamId ? 1 : 0;
}

/** 某隊在積分榜的那一列。 */
export const standingOf = (standings, teamId) =>
  (standings?.rows ?? []).find((r) => r.teamId === teamId) ?? null;

/**
 * 這份積分榜有多少比重來自模擬（供畫面誠實標示）。
 * **不影響排序**——只是讓玩家知道有多少場不是實際對戰。
 */
export function outcomeSourceMix(outcomes) {
  const valid = competitionOutcomes(outcomes);
  const count = (src) => valid.filter((o) => o.resultSource === src).length;
  const engine = count("engine");
  const simulated = count("simulated");
  const forfeited = count("forfeited");
  return { total: valid.length, engine, simulated, forfeited };
}
