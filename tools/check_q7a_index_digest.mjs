#!/usr/bin/env node
// ============================================================================
//  tools/check_q7a_index_digest.mjs — B3：推導索引的決定性摘要
//
//  執行：repo 根目錄 `node tools/check_q7a_index_digest.mjs`；失敗時 exit 1。
//
//  ── 為什麼要有這一支 ────────────────────────────────────────────────────
//  v2 刻意**不落盤反向索引**，全部靠 `fixture.stageId → competition → event →
//  circuit` 即時推導。好處是不會有第二份真相；代價是「推導錯了」沒有東西擋——
//  存檔往返或形狀升級之後若某一段指歪了，畫面照樣渲染，只是內容悄悄變了。
//
//  本檔把整組推導壓成一個摘要，然後要求：**同一份狀態、往返、升級之後
//  摘要必須逐字元相同**；而且**真的改了東西時摘要必須改變**（否則摘要是廢的）。
//
//  ⚠ 摘要**算在驗證器裡，不加進 production**——不為了測試方便改被測對象。
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const S = await import("../src/platform/competition/seasonState.js");
const { createCircuit, createEvent, competitionIdForEvent } = await import("../src/platform/contracts/circuit.js");
const { createCompetition, createStage, createFixture, STAGE_FORMATS } = await import("../src/platform/contracts/competition.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const store = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

//  FNV-1a（與專案其他地方同一套手法；只在驗證器內使用）
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * 把整組推導索引壓成一份**與鍵順序無關**的字串，再取摘要。
 * 每一段都排序，才不會因為 `Object.keys` 的插入順序不同而摘要不同。
 */
function indexLines(state) {
  const comps = S.competitionEntries(state).map((e) => e.competition.id).sort();
  const events = Object.keys(state.events ?? {}).sort();
  const circuits = Object.keys(state.circuits ?? {}).sort();

  //  fixture → competition
  const fx = (state.fixtures ?? [])
    .map((f) => `${f.id}=>${S.competitionIdOfFixture(state, f) ?? "(none)"}`).sort();
  //  competition → event
  const ce = S.competitionEntries(state)
    .map((e) => `${e.competition.id}=>${e.competition.eventId ?? "(none)"}`).sort();
  //  event → circuit
  const ec = Object.entries(state.events ?? {})
    .map(([id, ev]) => `${id}=>${ev.circuitId ?? "(none)"}`).sort();
  //  standings scope：每個賽制的 stageId ＋ 參賽者
  const scope = S.competitionEntries(state).map((e) => {
    const cid = e.competition.id;
    const st = S.tryStandingsOf(state, cid);
    const teams = (st?.rows ?? []).map((r) => r.teamId).sort().join(",");
    return `${cid}|stage=${e.stage?.id ?? "(none)"}|playoff=${e.playoff?.stage?.id ?? "(none)"}|teams=${teams}`;
  }).sort();

  return [
    `comps:${comps.join(",")}`,
    `events:${events.join(",")}`,
    `circuits:${circuits.join(",")}`,
    `fx:${fx.join(";")}`,
    `ce:${ce.join(";")}`,
    `ec:${ec.join(";")}`,
    `scope:${scope.join(";")}`,
  ];
}
const digestOf = (state) => fnv1a(indexLines(state).join("\n"));

/** 在既有賽季上合成第二個 Event（與 3b 驗證器同一套做法）。 */
function addSecondEvent(state) {
  const all = S.activeStageOf(state).participants;
  const me = all.find((p) => p.id === state.playerTeamId) ?? all[0];
  const other = all.find((p) => p.id !== me.id);
  const parts = [me, other];
  const circuit = createCircuit({ gameMode: "moba", season: state.season, circuitKey: "cup" }).circuit;
  const event = createEvent({ circuit, eventKey: "spring-cup", tier: "cup" }).event;
  const c0 = createCompetition({ gameMode: "moba", season: state.season, organizerId: "cup", tier: "cup" }).competition;
  const comp = { ...c0, id: competitionIdForEvent(event, "cup"), eventId: event.id, circuitId: circuit.id, idScheme: "event-v2" };
  const stage = createStage({ competition: comp, format: STAGE_FORMATS.round_robin, participants: parts, dayRange: { from: 1, to: 3 }, key: "cup", legs: 1 }).stage;
  const fx = createFixture({ stage, round: 1, day: 2, sideA: parts[0].id, sideB: parts[1].id }).fixture;
  return {
    ...state,
    circuits: { ...state.circuits, [circuit.id]: { ...circuit, eventIds: [event.id] } },
    events: { ...state.events, [event.id]: { ...event, competitionIds: [comp.id], rankingCompetitionId: comp.id, prizePolicy: null, final: null } },
    competitions: { ...state.competitions, [comp.id]: { competition: { ...comp, stageIds: [stage.id] }, stage, playoff: null, expectsPlayoff: false } },
    fixtures: [...state.fixtures, fx],
  };
}

console.log("══ B3：推導索引的決定性摘要 ══\n");

// ── 1) 同一份狀態重算必須相同 ─────────────────────────────────────────
const base = S.createSeasonState({ playerTeam: { id: "team:aaaaaaaa", name: "白貓戰隊", tag: "GSEAL" }, season: 1, seasonSeed: 12345 }).state;
const two = addSecondEvent(base);
const d0 = digestOf(two);
ck("1) 摘要算得出來", /^[0-9a-f]{8}$/.test(d0), d0);
ck("1b) **同一份狀態重算兩次逐字元相同**", digestOf(two) === d0 && digestOf(two) === d0);
ck("1c) 摘要涵蓋七段索引", indexLines(two).length === 7,
  indexLines(two).map((l) => l.split(":")[0]).join(" / "));

// ── 2) 與鍵順序無關 ───────────────────────────────────────────────────
{
  const rev = (obj) => Object.fromEntries(Object.entries(obj).reverse());
  const shuffled = { ...two, competitions: rev(two.competitions), events: rev(two.events), circuits: rev(two.circuits) };
  ck("2) **鍵插入順序不同，摘要仍相同**（索引不依賴物件順序）",
    digestOf(shuffled) === d0, digestOf(shuffled));
}

// ── 3) JSON 往返 ──────────────────────────────────────────────────────
ck("3) **JSON 往返後摘要相同**", digestOf(JSON.parse(JSON.stringify(two))) === d0);

// ── 4) 存檔 → 重載 ────────────────────────────────────────────────────
{
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  useProfileStore.setState({ competition: addSecondEvent(store().competition) });
  store().save();
  const dBefore = digestOf(store().competition);
  const fresh = (await import("../src/platform/profileStore.js?b3reload=1")).useProfileStore;
  ck("4) **存檔 → 重載後摘要相同**", digestOf(fresh.getState().competition) === dBefore, dBefore);
}

// ── 5) legacy v1 → 升級後摘要相同 ─────────────────────────────────────
{
  const dV2 = digestOf(base);
  const entry = S.activeEntryOf(base);
  const { circuitId, eventId, idScheme, ...legacyComp } = entry.competition;
  const v1 = { ...base, schema: "SeasonState.v1", competition: legacyComp, stage: entry.stage, playoff: entry.playoff ?? null };
  delete v1.competitions; delete v1.events; delete v1.circuits; delete v1.activeEventId;
  const upped = S.upgradeSeasonShape(v1);
  ck("5) **legacy v1 升級後摘要與原本的 v2 相同**（升級沒有動到任何推導）",
    digestOf(upped) === dV2, dV2);
  ck("5b) 升級冪等：再升一次摘要仍相同", digestOf(S.upgradeSeasonShape(upped)) === dV2);
}

// ── 6) 檢定力：真的改了東西，摘要必須改變 ─────────────────────────────
{
  const cid = S.activeCompetitionOf(two).id;
  const eid = two.activeEventId;

  //  ① 把賽制改綁到另一個 Event
  const otherEid = Object.keys(two.events).find((e) => e !== eid);
  const rebound = { ...two, competitions: { ...two.competitions,
    [cid]: { ...two.competitions[cid], competition: { ...two.competitions[cid].competition, eventId: otherEid } } } };
  ck("6) **賽制改綁到別的 Event ⇒ 摘要改變**", digestOf(rebound) !== d0);

  //  ② Event 改指到別的 Circuit
  const otherCircuit = Object.keys(two.circuits).find((c) => c !== two.events[eid].circuitId);
  const recircuit = { ...two, events: { ...two.events, [eid]: { ...two.events[eid], circuitId: otherCircuit } } };
  ck("6b) **Event 改指到別的 Circuit ⇒ 摘要改變**", digestOf(recircuit) !== d0);

  //  ③ 多一場 fixture
  const extra = { ...two, fixtures: [...two.fixtures, { ...two.fixtures[0], id: "fx:moba:extra" }] };
  ck("6c) **多一場 fixture ⇒ 摘要改變**", digestOf(extra) !== d0);

  //  ④ 參賽者變動（standings scope）
  const st = S.activeStageOf(two);
  const fewer = { ...two, competitions: { ...two.competitions,
    [cid]: { ...two.competitions[cid], stage: { ...st, participants: st.participants.slice(0, 4) } } } };
  ck("6d) **參賽者變動 ⇒ 摘要改變**（scope 有被涵蓋）", digestOf(fewer) !== d0);

  //  ⑤ 對照組：只改與索引無關的欄位 ⇒ 摘要不該變
  const cosmetic = { ...two, events: { ...two.events, [eid]: { ...two.events[eid], name: "改個名字而已" } } };
  ck("6e) 只改顯示名稱 ⇒ 摘要**不變**（摘要沒有過度敏感）", digestOf(cosmetic) === d0);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
