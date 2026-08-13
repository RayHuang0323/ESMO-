#!/usr/bin/env node
// ============================================================================
//  tools/check_q7a_3f1_career_final.mjs — 生涯主要賽事成績相容層（Q7a-3f.1）
//
//  執行：repo 根目錄 `node tools/check_q7a_3f1_career_final.mjs`；失敗 exit 1。
//
//  ── 這一支在證明什麼 ────────────────────────────────────────────────────
//  架構決策：**Season-level 的 `state.final` 與 Event-level 的 FinalStandings
//  不得再混在一起。** 單 Event 時 `state.final` 是 FinalStandings，
//  多 Event 時是 `SeasonSeal.v1`——這一點**不改**。
//
//  於是「我這一季在官方聯賽第幾名」需要一條**明確的**路：`careerEventId`
//  ＋ `careerFinalStandingsOf()`。本檔要證明這條路：
//    ① 指標是**寫下來的**，不是從 organizer／tier／名稱／順序推斷的
//    ② 舊存檔只有一個 Event ⇒ 無歧義回填；多個 Event ⇒ **留 null，不猜**
//    ③ 取不到時 **fail-closed**（strict throw／optional 回 null），不退而求其次
//    ④ `state.final` 的語意一個字都沒動，Event.final 仍是唯一 Event 真相
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
globalThis.window = { location: { search: "" } };
const setFlag = (on) => { globalThis.window.location.search = on == null ? "" : `?asiaCircuit=${on ? 1 : 0}`; };
import { readFileSync } from "node:fs";

const S = await import("../src/platform/competition/seasonState.js");
const A = await import("../src/platform/competition/asiaCircuit.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const st = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const readCode = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const J = (x) => JSON.stringify(x);

/** 把整季打完並封存（玩家的場次一律棄權，快速而決定性）。 */
function finishSeason(limit = 500) {
  for (let i = 0; i < limit; i++) {
    const v = st().competitionView();
    if (v.final) return v;
    const pend = v.todayPending ?? [];
    if (pend.length) { for (const f of pend) st().forfeitFixture(f.id); continue; }
    const b = st().meta.days;
    st().advanceDay(7);
    if (st().meta.days === b) break;
  }
  return st().competitionView();
}

console.log("══ Q7a-3f.1：生涯主要賽事成績相容層 ══\n");

// ── §1 建立時就寫下指標 ─────────────────────────────────────────────────
{
  console.log("── §1 careerEventId 是寫下來的 ──");
  setFlag(false);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  const off = st().competition;
  setFlag(true);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  const on = st().competition;

  ck("1a) 旗標關著：新賽季有 careerEventId", !!off.careerEventId, off.careerEventId);
  ck("1b) 旗標開著：新賽季**一樣**有 careerEventId（不因多賽事而消失）",
    !!on.careerEventId, on.careerEventId);
  ck("1c) **指向官方聯賽那個 Event**（與主賽制的 eventId 相同）",
    on.careerEventId === S.activeCompetitionOf(on).eventId,
    `${on.careerEventId} vs ${S.activeCompetitionOf(on).eventId}`);
  ck("1d) 兩種組態指到同一個 Event（巡迴賽沒有把生涯主線換掉）",
    on.careerEventId === off.careerEventId);
  ck("1e) **與 `activeEventId` 是兩件事**：切換畫面聚焦不動生涯指標", (() => {
    const other = Object.keys(on.events).find((e) => e !== on.careerEventId);
    st().setActiveEvent(other);
    return st().competition.activeEventId === other && st().competition.careerEventId === on.careerEventId;
  })());
  ck("1f) 巡迴賽三站都**不是**生涯主賽事",
    Object.entries(on.events).filter(([, e]) => e.circuitId === A.asiaCircuitIdFor("moba", on.season))
      .every(([id]) => id !== on.careerEventId));
}

// ── §2 accessor：取得與 fail-closed ─────────────────────────────────────
{
  console.log("\n── §2 accessor ──");
  setFlag(true);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  finishSeason();
  const c = st().competition;

  ck("2a) **`state.final` 仍是 `SeasonSeal.v1`**（Season-level 語意未被改動）",
    c.final?.schema === "SeasonSeal.v1", c.final?.schema);
  const career = S.careerFinalStandingsOf(c);
  ck("2b) 生涯成績取得到，而且是 `FinalStandings.v1`",
    career?.schema === "FinalStandings.v1", `${career?.rows?.length} 列`);
  ck("2c) **名次 / 冠軍 / rows 都正確**（不是 undefined）",
    typeof career.playerRank === "number" && !!career.championTeamId &&
    Array.isArray(career.rows) && career.rows.length === 8,
    `我第 ${career.playerRank} 名，冠軍 ${career.championTeamId.slice(5, 9)}`);
  ck("2d) **就是那個 Event 的 final，不是另一份複本**（同一個物件參考）",
    career === S.eventFinalOf(c, c.careerEventId));
  ck("2e) `careerEventOf` 取得到那個 Event", S.careerEventOf(c)?.id === c.careerEventId);

  //  fail-closed
  const noPointer = { ...c, careerEventId: null };
  let threw = false;
  try { S.careerFinalStandingsOf(noPointer); } catch { threw = true; }
  ck("2f) **沒有指標 ⇒ strict 版本明確失敗**（不退而求其次挑別的 Event）", threw);
  ck("2g) optional 版本回 `null`", S.tryCareerFinalStandingsOf(noPointer) === null);

  const badPointer = { ...c, careerEventId: "event:不存在" };
  let threw2 = false;
  try { S.careerFinalStandingsOf(badPointer); } catch { threw2 = true; }
  ck("2h) **指標壞掉 ⇒ 也明確失敗**（與「還沒封存」分得開）", threw2);
  ck("2i) optional 版本對壞指標也回 `null`，**不猜**",
    S.tryCareerFinalStandingsOf(badPointer) === null);
  ck("2j) 還沒封存 ⇒ optional 回 null（不是丟例外）", (() => {
    setFlag(true); st().startNewGame("standard"); st().ensureCompetitionSeason();
    return S.tryCareerFinalStandingsOf(st().competition) === null;
  })());
}

// ── §3 legacy 逐值一致 ──────────────────────────────────────────────────
{
  console.log("\n── §3 單一 Event：逐值一致 ──");
  setFlag(false);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  finishSeason();
  const c = st().competition;
  ck("3a) `state.final` 仍是 `FinalStandings.v1`（單 Event 語意未變）",
    c.final?.schema === "FinalStandings.v1");
  ck("3b) **生涯成績與 `state.final` 是同一個物件**（沒有第二份真相）",
    S.careerFinalStandingsOf(c) === c.final);
  ck("3c) 畫面拿到的生涯成績與賽季封存逐字相同",
    J(st().competitionView().careerFinal) === J(c.final));
}

// ── §4 migration ────────────────────────────────────────────────────────
{
  console.log("\n── §4 舊存檔回填 ──");
  //  ① 單一 Event 的舊存檔（沒有 careerEventId）⇒ 無歧義回填
  setFlag(false);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  st().advanceDay(15); st().save();
  {
    const raw = JSON.parse(LS);
    delete raw.competition.careerEventId;
    LS = JSON.stringify(raw);
  }
  const one = (await import("../src/platform/profileStore.js?f1a=1")).useProfileStore;
  ck("4a) **單一 Event 舊存檔：回填成那一個 Event**",
    one.getState().competition.careerEventId === Object.keys(one.getState().competition.events)[0],
    one.getState().competition.careerEventId);

  //  ② 多 Event 的舊存檔（沒有 careerEventId）⇒ 留 null，不猜
  setFlag(true);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  st().save();
  {
    const raw = JSON.parse(LS);
    delete raw.competition.careerEventId;
    LS = JSON.stringify(raw);
  }
  const many = (await import("../src/platform/profileStore.js?f1b=1")).useProfileStore;
  const m = many.getState().competition;
  ck("4b) **多 Event 舊存檔：careerEventId 留 null**（不用 organizer／tier／順序猜）",
    m.careerEventId === null, `${Object.keys(m.events).length} 個賽事 ⇒ ${m.careerEventId}`);
  ck("4c) 此時 optional accessor 回 null、畫面拿到 null（不 crash）",
    S.tryCareerFinalStandingsOf(m) === null && many.getState().competitionView().careerFinal === null);
  ck("4d) 而且**範圍驗證仍然通過**（null 不是錯，指錯才是錯）",
    S.validateSeasonScope(m).ok, J(S.validateSeasonScope(m).errors));

  //  ③ v1 形狀升級也要回填
  setFlag(false);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  const v2 = st().competition;
  const entry = S.activeEntryOf(v2);
  //  ⚠ 真正的 v1 存檔是 3a **之前**的，賽事上沒有 circuitId／eventId／idScheme。
  //    第一版只刪了容器卻留著那三個欄位，於是身分升級判成「已升級」而不重建
  //    容器，events 一直是空的——那是測試造了一份現實不存在的存檔。
  const { circuitId, eventId, idScheme, ...legacyComp } = entry.competition;
  const v1 = { ...v2, schema: "SeasonState.v1", competition: legacyComp, stage: entry.stage, playoff: null };
  delete v1.competitions; delete v1.events; delete v1.circuits; delete v1.activeEventId; delete v1.careerEventId;
  const upped = S.upgradeSeasonShape(v1);
  ck("4e) **v1 → v2 升級同時回填 careerEventId**",
    upped.careerEventId === Object.keys(upped.events)[0], upped.careerEventId);
  ck("4f) 升級冪等：再升一次**回傳同一個參考**（不會每次載入都換物件）",
    S.upgradeSeasonShape(upped) === upped);
}

// ── §5 validation ───────────────────────────────────────────────────────
{
  console.log("\n── §5 範圍驗證 ──");
  setFlag(true);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  const c = st().competition;
  ck("5a) 正式建立的賽季通過驗證，且有指標",
    S.validateSeasonScope(c).ok && !!c.careerEventId);
  const bad = { ...c, careerEventId: "event:不存在" };
  const v = S.validateSeasonScope(bad);
  ck("5b) **指到不存在的 Event ⇒ `career_event` 錯誤**",
    !v.ok && v.errors.some((e) => e.code === "career_event"), J(v.errors.map((e) => e.code)));
  ck("5c) `null` 不算錯（舊存檔的曖昧情形）",
    S.validateSeasonScope({ ...c, careerEventId: null }).ok);
}

// ── §6 rollover 與歷屆成績 ──────────────────────────────────────────────
{
  console.log("\n── §6 換季與歷屆成績 ──");
  setFlag(true);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  finishSeason();
  const before = st().competition;
  const careerBefore = S.careerFinalStandingsOf(before);
  const rolled = st().rollToNextCompetitionSeason();
  ck("6a) 換得了季", rolled.ok, rolled.reason ?? `第 ${rolled.season} 季`);
  ck("6b) **新賽季有正確的 careerEventId**（指向新賽季的官方聯賽）",
    !!st().competition.careerEventId &&
    st().competition.careerEventId === S.activeCompetitionOf(st().competition).eventId &&
    st().competition.careerEventId !== before.careerEventId,
    st().competition.careerEventId);
  const hist = st().competitionHistory ?? [];
  ck("6c) **歷屆成績存的是生涯成績**（完整 FinalStandings，不是 SeasonSeal）",
    hist[0]?.schema === "FinalStandings.v1" && Array.isArray(hist[0]?.rows) &&
    typeof hist[0]?.playerRank === "number", hist[0]?.schema);
  ck("6d) 而且就是換季前那一份（沒有重算）", J(hist[0]) === J(careerBefore));
  ck("6e) 新賽季的 `state.final` 是空的、生涯成績也還沒有",
    !st().competition.final && S.tryCareerFinalStandingsOf(st().competition) === null);

  //  legacy 對照：單 Event 換季後歷史應與**現況逐位元相同**
  setFlag(false);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  finishSeason();
  const seasonFinal = st().competition.final;
  st().rollToNextCompetitionSeason();
  ck("6f) 單 Event 換季：歷史那一筆**就是賽季封存物件本身**（legacy 逐位元不變）",
    (st().competitionHistory ?? [])[0] === seasonFinal);
}

// ── §7 紅線 ─────────────────────────────────────────────────────────────
{
  console.log("\n── §7 紅線 ──");
  const ss = readCode("src/platform/competition/seasonState.js");
  const screen = readCode("src/screens/manage/CompetitionScreen.jsx");

  ck("7a) **畫面不再直讀賽季封存物件的名次欄位**",
    !/final\.(playerRank|rows|championTeamId)/.test(screen) && /careerFinal/.test(screen));
  ck("7b) **畫面不用 `activeEventId` 推生涯成績**",
    !/activeEventId[\s\S]{0,80}career/i.test(screen));
  ck("7c) accessor **不從 organizer／tier／idScheme／名稱／順序推斷**", (() => {
    const block = ss.split("export function careerFinalStandingsOf")[1]?.split("export function eventViewsOf")[0] ?? "";
    return block.length > 100 &&
      !/organizerId|idScheme|expectsPlayoff|prizePolicy|\.name|\[0\]/.test(block);
  })());
  ck("7d) **沒有把 Event.final 複製一份**（accessor 只是指過去）",
    !/careerFinal[^\n]*=\s*\{[\s\S]{0,40}\.\.\./.test(ss));
  ck("7e) **沒有新增落盤鏡像**：賽季狀態裡只多了一個 id 欄位",
    (ss.match(/careerEventId/g) ?? []).length > 0 && !/careerFinal:\s*made|careerFinal:\s*final/.test(ss));
  ck("7f) **沒有新增 Season Award**", !/seasonAward|SeasonAward/i.test(ss + screen));
  ck("7g) Q5 §7d 仍然成立：賽季層沒有積分玩法", !/circuitPoints/i.test(ss));
  ck("7h) `SeasonSeal.v1` 仍然存在且是多 Event 的賽季真相", /SeasonSeal\.v1/.test(ss));
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
