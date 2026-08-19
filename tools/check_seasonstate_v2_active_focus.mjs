#!/usr/bin/env node
// ============================================================================
//  SeasonState v2 — Active Focus & Event-scoped Index Gate
//
//  執行：repo 根目錄 `node tools/check_seasonstate_v2_active_focus.mjs`；
//        **失敗時 exit 1**。純 Node，不需瀏覽器。
//
//  ── 為什麼要多這一支（v2_runtime 已經有 27 條了）────────────────────────
//  `check_seasonstate_v2_runtime` 驗的是「**載入當下**投影對不對」：新遊戲、
//  既有存檔、封存存檔各載一次，斷言 v2 與 legacy 對得上。它每一條都從
//  **乾淨載入**開始 ⇒ 只要 wrap 是對的就會綠。
//
//  但 runtime 真正會動的兩件事，它一條都沒碰：
//
//    ① 玩家**在遊戲中切換聚焦 Event**（`setActiveEvent`）。
//       legacy 的 `activeEventId` 是唯一權威，v2 的 `active` 是它的投影。
//       實測（2026-08-19）：切到 Event B 之後 legacy 指到 B，
//       **v2 `active.eventId` 與 `activeCompetitionEvent().event` 都還停在 A**，
//       存檔重載之後仍然是 A ⇒ 畫面的積分榜是 B、`activeEvent` 是 A。
//
//    ② legacy 玩法**事後追加** fixture／outcome（季後賽開打等）之後的
//       index refresh。`refreshLegacyIndexes` 當時仍以
//       `legacyState.competition.id` 比對 scope——那個屬性自 Q7a-3b 起
//       **在多 Event 形狀下根本不存在** ⇒ 比對永遠不成立、index 永遠凍結；
//       而且它拿的是**全季 fixtures**，比對一旦成立反而會把別的 Event 的
//       場次灌進同一個 Event。
//
//  這兩件事都只有在「**載入之後又發生了什麼**」才看得到，所以放在獨立一支，
//  不去動 v2_runtime 的 9/27 分組計數。
//
//  ⚠ 本檔**不驗**封存語意（那是 M2 / Multi-Event sealing 的範圍），
//    只驗聚焦指標一致性與 index 的 Event scope。
// ============================================================================
import { readFileSync } from "node:fs";

const KEY = "esmo.profile.v1";
let raw = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? raw : null),
  setItem: (k, v) => { if (k === KEY) raw = String(v); },
  removeItem: (k) => { if (k === KEY) raw = null; },
};
//  ⚠ 明確關掉亞洲巡迴賽：本檔要的是**自己合成的兩個 Event**，
//    讓「A 有沒有被污染」是一個可以逐值數的問題。旗標預設值變動不得改變本檔測的東西。
globalThis.window = { location: { search: "?asiaCircuit=0" } };

const SEA = await import("../src/platform/competition/seasonState.js");
const { createCircuit, createEvent, competitionIdForEvent } = await import("../src/platform/contracts/circuit.js");
const { createCompetition, createStage, createFixture, STAGE_FORMATS } = await import("../src/platform/contracts/competition.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const store = () => useProfileStore.getState();
const fresh = async (label) => (await import(`../src/platform/profileStore.js?${label}`)).useProfileStore;

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `　${detail}` : ""}`);
};
const j = (v) => JSON.stringify(v);
const eventsOfV2 = (v2) => (v2?.gameModes ?? []).flatMap((m) => (m.circuits ?? []).flatMap((c) => c.events ?? []));
const v2EventOf = (v2, id) => eventsOfV2(v2).find((e) => e.id === id) ?? null;

/** legacy 側「這個 Event 自己的」fixture／outcome id —— 期望值不從 v2 推 v2。 */
function legacyScopeOf(state, eventId) {
  const legacyEvent = state.events?.[eventId] ?? null;
  const competitionId = legacyEvent?.rankingCompetitionId ?? (legacyEvent?.competitionIds ?? [])[0] ?? null;
  const entry = competitionId ? state.competitions?.[competitionId] ?? null : null;
  const stageIds = [entry?.stage?.id, entry?.playoff?.stage?.id, entry?.playoff?.qualification?.id].filter((id) => id != null);
  const stageSet = new Set(stageIds);
  const fixtureIds = (state.fixtures ?? []).filter((f) => stageSet.has(f?.stageId)).map((f) => f.id);
  const fixtureSet = new Set(fixtureIds);
  const outcomeIds = (state.outcomes ?? []).filter((o) => fixtureSet.has(o?.fixtureId)).map((o) => o.id ?? o.fixtureId);
  return { competitionId, stageIds, fixtureIds, outcomeIds };
}

const TEAM = { id: "team:aaaaaaaa", name: "白貓戰隊", tag: "GFOCUS" };

/** 合成第二個 Event（兩隊單循環的小盃賽），與 3b verifier 同一套手法。 */
function addSecondEvent(state) {
  const all = SEA.activeStageOf(state).participants;
  const me = all.find((p) => p.id === state.playerTeamId) ?? all[0];
  const other = all.find((p) => p.id !== me.id);
  const parts = [me, other];
  const circuit = createCircuit({ gameMode: "moba", season: state.season, circuitKey: "cup" }).circuit;
  const event = createEvent({ circuit, eventKey: "spring-cup", tier: "cup" }).event;
  const comp = createCompetition({ gameMode: "moba", season: state.season, organizerId: "cup", tier: "cup" }).competition;
  const comp2 = { ...comp, id: competitionIdForEvent(event, "cup"), eventId: event.id, circuitId: circuit.id, idScheme: "event-v2" };
  const stage = createStage({
    competition: comp2, format: STAGE_FORMATS.round_robin, participants: parts,
    dayRange: { from: 1, to: 3 }, key: "cup", legs: 1,
  }).stage;
  const fx = createFixture({ stage, round: 1, day: 2, sideA: parts[0].id, sideB: parts[1].id }).fixture;
  return {
    ...state,
    circuits: { ...state.circuits, [circuit.id]: { ...circuit, eventIds: [event.id] } },
    events: {
      ...state.events,
      [event.id]: { ...event, competitionIds: [comp2.id], rankingCompetitionId: comp2.id, prizePolicy: null, final: null },
    },
    competitions: {
      ...state.competitions,
      [comp2.id]: { competition: { ...comp2, stageIds: [stage.id] }, stage, playoff: null },
    },
    fixtures: [...state.fixtures, fx],
  };
}

/** legacy 玩法事後追加一場 fixture ＋ 它的 outcome（模擬季後賽開打／補賽）。 */
function appendLegacyPlay(state, eventId, tag) {
  const { competitionId } = legacyScopeOf(state, eventId);
  const entry = state.competitions[competitionId];
  const sample = state.fixtures.find((f) => f.stageId === entry.stage.id);
  const fixture = { ...sample, id: `fx:__${tag}__`, day: 90, status: "scheduled" };
  const outcome = {
    schema: "FixtureOutcome.v1", fixtureId: fixture.id, stageId: fixture.stageId,
    gameMode: "moba", seed: 7, simulatorVersion: null, resultSource: "engine",
    sideA: fixture.sideA, sideB: fixture.sideB, winner: fixture.sideA,
    score: { a: 2, b: 0 }, duration: 1800, highlights: [], reason: null,
  };
  return { ...state, fixtures: [...state.fixtures, fixture], outcomes: [...state.outcomes, outcome] };
}

console.log("══ SeasonState v2：聚焦指標一致性 ＋ Event-scoped index ══\n");

// ── 1) 多 Event 賽季：每個 v2 Event 只索引自己的場次 ─────────────────────
raw = null;
store().startNewGame("standard");
store().ensureCompetitionSeason();
const EVENT_A = store().competition.activeEventId;
store()._setCompetitionState(addSecondEvent(store().competition));
const EVENT_B = Object.keys(store().competition.events).find((id) => id !== EVENT_A);

ck("1) 同一賽季有兩個 Event，v2 逐一映射",
  Object.keys(store().competition.events).length === 2 && eventsOfV2(store().seasonStateV2).length === 2,
  j({ legacy: Object.keys(store().competition.events).length, v2: eventsOfV2(store().seasonStateV2).length }));

ck("2) 每個 v2 Event 的 fixture／outcome index 只含**自己賽制**的場次（不吃鄰居）",
  [EVENT_A, EVENT_B].every((id) => {
    const scope = legacyScopeOf(store().competition, id);
    const ev = v2EventOf(store().seasonStateV2, id);
    return !!ev && j(ev.fixtureIds) === j(scope.fixtureIds) && j(ev.outcomeIds) === j(scope.outcomeIds);
  }),
  j([EVENT_A, EVENT_B].map((id) => v2EventOf(store().seasonStateV2, id)?.fixtureIds.length ?? null)));

// ── 2) setActiveEvent A → B：三方指標必須在 save 補救前一起動 ─────────────
//  `save()` 本身會重建／刷新 v2 sidecar。因此只看 setActiveEvent 返回後，抓不到
//  「先裸 set legacy、再靠 save 修好」的錯誤路徑。這裡暫時包住同一個 runtime
//  action，在 original save 尚未執行前取樣；不檢查 source 字串，也不阻止真正存檔。
const originalSave = store().save;
let saveEntry = null;
useProfileStore.setState({
  save: (...args) => {
    const beforeSave = store();
    saveEntry = {
      legacyEventId: beforeSave.competition?.activeEventId ?? null,
      v2EventId: beforeSave.seasonStateV2?.active?.eventId ?? null,
      adapterEventId: beforeSave.activeCompetitionEvent()?.event?.id ?? null,
    };
    return originalSave(...args);
  },
});
let sw;
try {
  sw = store().setActiveEvent(EVENT_B);
} finally {
  useProfileStore.setState({ save: originalSave });
}
ck("3) setActiveEvent(A → B) 成功", sw.ok === true, j({ errors: sw.errors }));
ck("4) legacy activeEventId === B", store().competition.activeEventId === EVENT_B,
  store().competition.activeEventId);
ck("4a) **進入 save() 當下** legacy／v2／adapter 已全數對位 B（不是靠 save 補救）",
  saveEntry?.legacyEventId === EVENT_B
  && saveEntry?.v2EventId === EVENT_B
  && saveEntry?.adapterEventId === EVENT_B,
  j(saveEntry));
ck("5) **v2 active.eventId === legacy activeEventId**（B）",
  store().seasonStateV2?.active?.eventId === EVENT_B,
  j({ v2: store().seasonStateV2?.active?.eventId ?? null, legacy: store().competition.activeEventId }));
ck("6) **activeCompetitionEvent().event.id === B**",
  store().activeCompetitionEvent()?.event?.id === EVENT_B,
  j({ adapter: store().activeCompetitionEvent()?.event?.id ?? null }));
ck("7) adapter 沒有 fail closed（legacyState 仍交得出來）",
  store().activeCompetitionEvent()?.legacyState != null);
ck("8) v2 active.circuitId 跟著 B 的 circuit（不是留在 A 的）",
  store().seasonStateV2?.active?.circuitId === v2EventOf(store().seasonStateV2, EVENT_B)?.circuitId,
  j({ active: store().seasonStateV2?.active?.circuitId ?? null }));

// ── 3) 畫面層：adapter／competitionView／standings 落在同一個 Event ───────
{
  const view = store().competitionView();
  ck("9) competitionView().activeEvent 就是 B（畫面聚焦與 adapter 同一個）",
    view.activeEvent?.id === EVENT_B, j({ activeEvent: view.activeEvent?.id ?? null }));
  ck("10) competitionView().standings 逐值等於 B 的 Event 積分榜",
    j(view.standings) === j(SEA.eventStandingsOf(store().competition, EVENT_B)),
    j({ rows: view.standings?.rows?.length ?? null }));
  ck("11) view.activeEventId 與 v2 active、adapter event 三者同值",
    view.activeEventId === EVENT_B
    && store().seasonStateV2?.active?.eventId === EVENT_B
    && store().activeCompetitionEvent()?.event?.id === EVENT_B);
}

// ── 4) save → reload：指標一致性必須存活 ────────────────────────────────
store().save();
const savedRaw = raw;
const v2BeforeReload = j(store().seasonStateV2);
const R = await fresh("focus-reload");
ck("12) reload 後 legacy activeEventId 仍是 B", R.getState().competition.activeEventId === EVENT_B,
  R.getState().competition.activeEventId);
ck("13) **reload 後 v2 active.eventId 仍是 B**", R.getState().seasonStateV2?.active?.eventId === EVENT_B,
  j({ v2: R.getState().seasonStateV2?.active?.eventId ?? null }));
ck("14) **reload 後 adapter 仍落在 B**", R.getState().activeCompetitionEvent()?.event?.id === EVENT_B,
  j({ adapter: R.getState().activeCompetitionEvent()?.event?.id ?? null }));
ck("15) reload 後 v2 逐值等於存檔前（deterministic，沒有第二種投影）",
  j(R.getState().seasonStateV2) === v2BeforeReload);
ck("16) reload 後 competitionView 也還在 B",
  R.getState().competitionView().activeEvent?.id === EVENT_B);

// ── 5) Event-scoped index refresh：只更新該 Event，鄰居零污染 ────────────
raw = savedRaw;
const W = await fresh("focus-refresh");
const w = () => W.getState();
const aBefore = { ...v2EventOf(w().seasonStateV2, EVENT_A) };
const bBefore = { ...v2EventOf(w().seasonStateV2, EVENT_B) };

//  聚焦在 B，對 **B** 追加一場 fixture ＋ outcome
w()._setCompetitionState(appendLegacyPlay(w().competition, EVENT_B, "b_new"));
w().save();
const aAfterB = v2EventOf(w().seasonStateV2, EVENT_A);
const bAfterB = v2EventOf(w().seasonStateV2, EVENT_B);

ck("17) legacy 端確實多了一場（變異若沒落地，這條會先紅）",
  w().competition.fixtures.some((f) => f.id === "fx:__b_new__")
  && w().competition.outcomes.some((o) => o.fixtureId === "fx:__b_new__"));
ck("18) **B 的 v2 fixture index 跟上了新場次**",
  bAfterB.fixtureIds.includes("fx:__b_new__")
  && bAfterB.fixtureIds.length === bBefore.fixtureIds.length + 1,
  j({ before: bBefore.fixtureIds.length, after: bAfterB.fixtureIds.length }));
ck("19) **B 的 v2 outcome index 也跟上了**",
  bAfterB.outcomeIds.includes("fx:__b_new__")
  && bAfterB.outcomeIds.length === bBefore.outcomeIds.length + 1,
  j({ before: bBefore.outcomeIds.length, after: bAfterB.outcomeIds.length }));
ck("20) **A 完全沒被污染**（fixture／outcome index 逐值不變）",
  j(aAfterB.fixtureIds) === j(aBefore.fixtureIds) && j(aAfterB.outcomeIds) === j(aBefore.outcomeIds),
  j({ aFixtures: aAfterB.fixtureIds.length, aOutcomes: aAfterB.outcomeIds.length }));
ck("21) B 的 index 仍逐值等於 legacy 側 B 的 scope（不是全季集合）",
  j(bAfterB.fixtureIds) === j(legacyScopeOf(w().competition, EVENT_B).fixtureIds)
  && bAfterB.fixtureIds.length < w().competition.fixtures.length,
  j({ eventScoped: bAfterB.fixtureIds.length, seasonTotal: w().competition.fixtures.length }));

//  再對 **沒有被聚焦的 A** 追加一場：index 新鮮度不得綁在畫面焦點上
w()._setCompetitionState(appendLegacyPlay(w().competition, EVENT_A, "a_new"));
w().save();
const aAfterA = v2EventOf(w().seasonStateV2, EVENT_A);
const bAfterA = v2EventOf(w().seasonStateV2, EVENT_B);
ck("22) **非聚焦的 A 追加場次後，A 的 index 也會更新**（refresh 不綁畫面焦點）",
  aAfterA.fixtureIds.includes("fx:__a_new__")
  && aAfterA.fixtureIds.length === aBefore.fixtureIds.length + 1,
  j({ before: aBefore.fixtureIds.length, after: aAfterA.fixtureIds.length }));
ck("23) 而 B 這次一點都沒動（反向零污染）",
  j(bAfterA.fixtureIds) === j(bAfterB.fixtureIds) && j(bAfterA.outcomeIds) === j(bAfterB.outcomeIds));
ck("24) 聚焦指標在兩次 index refresh 之後仍在 B",
  w().seasonStateV2?.active?.eventId === EVENT_B
  && w().activeCompetitionEvent()?.event?.id === EVENT_B);

// ── 6) 切回去 ／ 非法 Event ────────────────────────────────────────────
ck("25) 切回 A 之後三方再次一致",
  w().setActiveEvent(EVENT_A).ok === true
  && w().competition.activeEventId === EVENT_A
  && w().seasonStateV2?.active?.eventId === EVENT_A
  && w().activeCompetitionEvent()?.event?.id === EVENT_A,
  j({ v2: w().seasonStateV2?.active?.eventId ?? null }));
ck("26) 切到不存在的 Event 被擋，且三方指標一個都沒動",
  w().setActiveEvent("event:__nope__").ok === false
  && w().competition.activeEventId === EVENT_A
  && w().seasonStateV2?.active?.eventId === EVENT_A
  && w().activeCompetitionEvent()?.event?.id === EVENT_A);

// ── 7) 真實多 Event 存檔（5 Event）：同一組性質必須成立 ──────────────────
const FIXTURES = new URL("../review/fixtures/competition/", import.meta.url);
let multiSave = null;
try { multiSave = JSON.parse(readFileSync(new URL("s7e_player_one.json", FIXTURES), "utf8")); } catch { multiSave = null; }
if (!multiSave) {
  ck("27) 5 Event 既有存檔 fixture 可讀", false, "找不到 s7e_player_one.json");
} else {
  raw = JSON.stringify(multiSave);
  const F = await fresh("focus-fixture");
  const f = () => F.getState();
  const realA = f().competition.activeEventId;
  const realB = Object.keys(f().competition.events).find((id) => id !== realA);

  ck("27) 5 Event 存檔：每個 v2 Event 的 index 逐值等於自己賽制的 scope",
    Object.keys(f().competition.events).length === 5
    && Object.keys(f().competition.events).every((id) => {
      const scope = legacyScopeOf(f().competition, id);
      const ev = v2EventOf(f().seasonStateV2, id);
      return !!ev && j(ev.fixtureIds) === j(scope.fixtureIds) && j(ev.outcomeIds) === j(scope.outcomeIds);
    }),
    j({ events: Object.keys(f().competition.events).length }));

  f().setActiveEvent(realB);
  ck("28) 5 Event 存檔：切換後 legacy／v2／adapter 三方一致",
    f().competition.activeEventId === realB
    && f().seasonStateV2?.active?.eventId === realB
    && f().activeCompetitionEvent()?.event?.id === realB,
    j({ legacy: f().competition.activeEventId, v2: f().seasonStateV2?.active?.eventId ?? null,
        adapter: f().activeCompetitionEvent()?.event?.id ?? null }));

  f().save();
  const F2 = await fresh("focus-fixture-reload");
  ck("29) 5 Event 存檔：reload 之後三方仍一致",
    F2.getState().competition.activeEventId === realB
    && F2.getState().seasonStateV2?.active?.eventId === realB
    && F2.getState().activeCompetitionEvent()?.event?.id === realB,
    j({ v2: F2.getState().seasonStateV2?.active?.eventId ?? null }));

  ck("30) 5 Event 存檔：切換聚焦沒有改動任何 Event 的 index（純畫面）",
    Object.keys(F2.getState().competition.events).every((id) => {
      const scope = legacyScopeOf(F2.getState().competition, id);
      const ev = v2EventOf(F2.getState().seasonStateV2, id);
      return !!ev && j(ev.fixtureIds) === j(scope.fixtureIds);
    }));
}

console.log("");
console.log(`SeasonState v2 active focus: ${pass}/${pass + fail} PASS`);
process.exit(fail === 0 ? 0 : 1);
