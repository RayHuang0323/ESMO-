#!/usr/bin/env node
// ============================================================================
//  tools/check_q7a_3b_multi_event.mjs — Q7a-3b：同季多賽事並存
//
//  執行：repo 根目錄 `node tools/check_q7a_3b_multi_event.mjs`；**失敗時 exit 1**。
//
//  ── 為什麼要造一個「兩個 Event」的狀態 ──────────────────────────────────
//  Q1–Q6 全綠只證明**legacy 沒壞**，不證明多賽事真的能用——legacy 永遠只有
//  一個 Event，所有分流程式碼在它身上都退化成「就是那一個」。所以本檔自己
//  合成第二個 Event＋Competition，去驗真正的分流、獨立封存與獎金閘門。
//
//  驗六件事：
//    ① Standings 依 competitionId 分流（A 的賽果不會算進 B 的榜）
//    ② Event 可以獨立封存（A 封存時 B 還沒打完，賽季不得封存）
//    ③ 有 prizePolicy 才發獎金；**沒有政策的 Event 不得生出 0 元假獎金**
//    ④ Event 封存與 Season 封存確實分開
//    ⑤ legacy 單 Event 與現況等價（state.final 就是那個 Event 的封存快照）
//    ⑥ 冪等：重複封存不改快照、不重發獎金
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
//  ── Q7a-3f.2：**明確指定旗標狀態，不吃全域預設值** ────────────────────────
//  ⚠ 本檔驗的是「同季多賽事並存」這個**形狀**，用的是它自己合成的盃賽 Event。
//    亞洲巡迴賽（3d）是另一個變數：它一開，這裡的「legacy 單一 Event」情境
//    就變成 5 個 Event，好幾條斷言會因為**測試意圖被預設值改掉**而紅。
//    所以這裡把它明確關掉——不是為了讓燈變綠，是為了讓這支測的還是原本那件事。
globalThis.window = { location: { search: "?asiaCircuit=0" } };

const {
  createSeasonState, standingsOf, eventStandingsOf, seasonStandings,
  canSealEvent, applySealEvent, sealableEventIds, eventFinalOf,
  canSealSeason, applySealSeason, activeCompetitionOf, activeStageOf,
  competitionEntry, competitionsOfEvent, fixturesOfCompetition, outcomesOfCompetition,
  applyLaunch, applyCompleted, LEGACY_PRIZE_POLICY,
  eventViewsOf, participantsOf, activeEntryOf, isPlayoffDone,
  tryStandingsOf, tryEventStandingsOf, tryCompetitionsOfEvent, validateSeasonScope,
} = await import("../src/platform/competition/seasonState.js");
const { createCircuit, createEvent, competitionIdForEvent } = await import("../src/platform/contracts/circuit.js");
const { createCompetition, createStage, createFixture, STAGE_FORMATS } = await import("../src/platform/contracts/competition.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const store = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const TEAM = { id: "team:aaaaaaaa", name: "白貓戰隊", tag: "GSEAL" };

/** 在既有賽季狀態上，合成第二個 Event（一個小型 2 隊單循環賽制）。 */
function addSecondEvent(state, { prizePolicy = null } = {}) {
  const base = activeCompetitionOf(state);
  //  ⚠ 盃賽一定要包含玩家隊伍：獎金是依**玩家名次**發的，玩家不在參賽者裡
  //    就永遠驗不到獎金那條。（第一版取前兩名，玩家剛好不在，applyCompleted
  //    被「勝方必須是對戰雙方之一」擋下 ⇒ 盃賽封不了。）
  const all = activeStageOf(state).participants;
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
      [event.id]: { ...event, competitionIds: [comp2.id], rankingCompetitionId: comp2.id, prizePolicy, final: null },
    },
    competitions: {
      ...state.competitions,
      [comp2.id]: { competition: { ...comp2, stageIds: [stage.id] }, stage, playoff: null },
    },
    fixtures: [...state.fixtures, fx],
  };
}

console.log("══ Q7a-3b：同季多賽事並存 ══\n");

// ── 1) Standings 依 competitionId 分流 ─────────────────────────────────
{
  const s0 = createSeasonState({ playerTeam: TEAM, season: 1, seasonSeed: 12345 }).state;
  const legacyId = activeCompetitionOf(s0).id;
  const s1 = addSecondEvent(s0);
  const cupId = Object.keys(s1.competitions).find((id) => id !== legacyId);
  ck("1) 同一個賽季裡有兩個賽制", Object.keys(s1.competitions).length === 2, `${legacyId} ＋ ${cupId}`);
  ck("1b) 兩個 Event 各自掛著自己的賽制",
    competitionsOfEvent(s1, Object.keys(s1.events).find((e) => e !== s1.activeEventId))[0].competition.id === cupId);

  const a = standingsOf(s1, legacyId);
  const b = standingsOf(s1, cupId);
  ck("1c) **積分榜依賽制分流**：參賽者數不同（8 vs 2）",
    a.rows.length === 8 && b.rows.length === 2, `${a.rows.length} vs ${b.rows.length}`);
  ck("1d) 聯賽的賽果不會算進盃賽的榜",
    b.rows.every((r) => r.played === 0), `盃賽已打 ${b.rows.reduce((n, r) => n + r.played, 0)} 場`);
  ck("1e) `seasonStandings` 仍等於聚焦賽制的榜（legacy 語意不變）",
    JSON.stringify(seasonStandings(s1)) === JSON.stringify(a));
  ck("1f) `eventStandingsOf` 由 rankingCompetitionId 決定",
    JSON.stringify(eventStandingsOf(s1, Object.keys(s1.events).find((e) => e !== s1.activeEventId))) === JSON.stringify(b));
  ck("1g) 賽制範圍的 fixtures／outcomes 查得出來，且**沒有複製成第二份**",
    fixturesOfCompetition(s1, cupId).length === 1 &&
    s1.fixtures.length === s0.fixtures.length + 1 &&
    outcomesOfCompetition(s1, cupId).length === 0);
}

// ── 2)(4) Event 獨立封存；賽季要等全部 Event 都封存 ────────────────────
{
  const s0 = createSeasonState({ playerTeam: TEAM, season: 1, seasonSeed: 12345 }).state;
  const legacyEventId = s0.activeEventId;
  let s = addSecondEvent(s0);
  const cupEventId = Object.keys(s.events).find((e) => e !== legacyEventId);
  const cupId = s.events[cupEventId].rankingCompetitionId;

  //  先把盃賽那一場打完 ⇒ 盃賽封得了，聯賽還沒
  const cupFx = fixturesOfCompetition(s, cupId)[0];
  s = applyLaunch(s, cupFx.id).state;
  s = applyCompleted(s, { fixtureId: cupFx.id, winner: cupFx.sideA, score: { a: 2, b: 1 }, duration: 1800, seed: 7 }).state;

  ck("2) 盃賽（Event B）封得了", canSealEvent(s, cupEventId).ok === true);
  ck("2b) 聯賽（Event A）還封不了", canSealEvent(s, legacyEventId).ok === false,
    canSealEvent(s, legacyEventId).reason);
  ck("2c) `sealableEventIds` 只列出封得了的那一個",
    JSON.stringify(sealableEventIds(s)) === JSON.stringify([cupEventId]));

  const sealed = applySealEvent(s, cupEventId, 10);
  s = sealed.state;
  ck("2d) **Event 可以獨立封存**", sealed.ok && !!eventFinalOf(s, cupEventId),
    eventFinalOf(s, cupEventId)?.championTeamId);
  ck("2e) 封存 B 不影響 A", eventFinalOf(s, legacyEventId) === null);

  //  ④ 賽季要等全部 Event 都封存
  ck("4) **賽季還不能封存**（還有一個 Event 沒封）", canSealSeason(s).ok === false, canSealSeason(s).reason);
  const trySeal = applySealSeason(s, 10);
  ck("4b) 硬要封存也會被擋，且不寫入", trySeal.ok === false && !trySeal.state.final);

  //  冪等：重複封存同一個 Event 不改快照
  const again = applySealEvent(s, cupEventId, 99);
  ck("6) 重複封存回既有快照、不覆寫", again.alreadySealed === true &&
    JSON.stringify(again.final) === JSON.stringify(eventFinalOf(s, cupEventId)));
}

// ── 3) 獎金閘門：有 prizePolicy 才發 ───────────────────────────────────
{
  const mk = (policy) => {
    store().startNewGame("standard");
    store().ensureCompetitionSeason();
    let s = addSecondEvent(store().competition, { prizePolicy: policy });
    const cupEventId = Object.keys(s.events).find((e) => e !== s.activeEventId);
    const cupId = s.events[cupEventId].rankingCompetitionId;
    const fx = fixturesOfCompetition(s, cupId)[0];
    s = applyLaunch(s, fx.id).state;
    const meId = store().competition.playerTeamId;
    s = applyCompleted(s, { fixtureId: fx.id, winner: meId, score: { a: 2, b: 0 }, duration: 1800, seed: 7 }).state;
    useProfileStore.setState({ competition: s });
    const fundsBefore = store().finance.funds;
    store()._sealSeasonIfFinished();
    return { cupEventId, fundsBefore, after: store() };
  };

  const noPrize = mk(null);
  const evNo = noPrize.after.competition.events[noPrize.cupEventId];
  ck("3) 沒有 prizePolicy 的 Event 仍然封存得了", !!eventFinalOf(noPrize.after.competition, noPrize.cupEventId));
  ck("3b) **沒有政策就完全沒有獎金**（不是 0 元的假收據）",
    !evNo.award, JSON.stringify(evNo.award ?? null));
  ck("3c) 錢一毛都沒動", noPrize.after.finance.funds === noPrize.fundsBefore,
    `$${noPrize.fundsBefore} → $${noPrize.after.finance.funds}`);

  const withPrize = mk(LEGACY_PRIZE_POLICY);
  const evYes = withPrize.after.competition.events[withPrize.cupEventId];
  ck("3d) **有 prizePolicy 就結算獎金**", !!evYes.award, JSON.stringify(evYes.award?.amount ?? null));
  ck("3e) 收據掛在 Event 上，**沒有寫進不可變的 final**",
    !("award" in (eventFinalOf(withPrize.after.competition, withPrize.cupEventId) ?? {})));
}

// ── 5) legacy 單 Event 與現況等價 ──────────────────────────────────────
{
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  const eid = store().competition.activeEventId;
  //  ⚠ 整季要用**既有路徑**跑完：AI vs AI 由 `advanceDay` 模擬，
  //    `forfeitFixture` 只棄得掉玩家自己的場次（棄權方必須是對戰雙方之一）。
  //    第一版直接對每一場 forfeit，第二場就被契約擋下來——那是契約對，驗證器錯。
  for (let i = 0; i < 400; i++) {
    if (store().competition.final) break;
    const today = store().competitionView().today;
    if (today) { store().forfeitFixture(today.id, "測試"); continue; }
    const before = store().meta.days;
    store().advanceDay(7);
    if (store().meta.days === before) break;
  }
  const c = store().competition;
  ck("5) legacy 賽季封存得起來", !!c.final, c.final?.schema ?? "");
  ck("5b) **`state.final` 就是那個 Event 的封存快照（同一份，沒有兩份真相）**",
    c.final === eventFinalOf(c, eid) || JSON.stringify(c.final) === JSON.stringify(eventFinalOf(c, eid)));
  ck("5c) legacy 有 prizePolicy ⇒ 獎金照發（與現況相同）",
    !!c.events[eid].prizePolicy && !!c.events[eid].award);

  const fundsAfter = store().finance.funds;
  for (let i = 0; i < 5; i++) store()._sealSeasonIfFinished();
  ck("6b) **重複封存不重發獎金**", store().finance.funds === fundsAfter, `$${fundsAfter}`);
  ck("6c) 重複封存不改 final", JSON.stringify(store().competition.final) === JSON.stringify(c.final));
}

// ── 7) 畫面聚焦（activeEventId）不得影響規則（Q7a-3b.5）─────────────────
{
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  const s7 = addSecondEvent(store().competition, { prizePolicy: null });
  useProfileStore.setState({ competition: s7 });
  const c0 = store().competition;
  const leagueEventId = c0.activeEventId;
  const cupEventId = Object.keys(c0.events).find((e) => e !== leagueEventId);

  const views = eventViewsOf(c0, store().meta.days);
  ck("7) `eventViewsOf` 每個 Event 都有狀態與階段",
    views.length === 2 && views.every((v) => !!v.statusLabel && !!v.stageLabel),
    views.map((v) => `${v.name}:${v.statusLabel}/${v.stageLabel}`).join("　"));
  ck("7b) 狀態只有三種，且由事實推導",
    views.every((v) => ["sealed", "running", "upcoming"].includes(v.status)));

  //  ⭐ 切換聚焦前後，**規則面**的推導必須逐值不變
  const snapshot = () => JSON.stringify({
    primary: activeEntryOf(store().competition).competition.id,
    standings: seasonStandings(store().competition),
    participants: participantsOf(store().competition).length,
    playoffDone: isPlayoffDone(store().competition),
    sealable: sealableEventIds(store().competition),
    canSeason: canSealSeason(store().competition),
  });
  const before = snapshot();
  const uiBefore = store().competitionView().standings.rows.length;

  const sw = store().setActiveEvent(cupEventId);
  ck("7c) 切換得到另一個 Event",
    sw.ok === true && store().competition.activeEventId === cupEventId);
  ck("7d) **切換聚焦後，規則面逐值不變**（主賽制／積分／參賽者／季後賽／封存判定）",
    snapshot() === before, `主賽制仍為 ${activeEntryOf(store().competition).competition.id}`);

  const uiAfter = store().competitionView().standings.rows.length;
  ck("7e) **但畫面的積分榜確實跟著換**", uiBefore === 8 && uiAfter === 2, `${uiBefore} → ${uiAfter}`);
  ck("7f) 切回去也一樣", store().setActiveEvent(leagueEventId).ok === true &&
    store().competitionView().standings.rows.length === 8);
  ck("7g) 切到不存在的 Event 會被擋", store().setActiveEvent("event:nope").ok === false);

  //  legacy：只有一個 Event ⇒ 畫面不出現切換列
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  ck("7h) legacy 單 Event：`eventViews` 只有一筆（切換列不渲染）",
    store().competitionView().eventViews.length === 1);
}


// ── 8) 查詢層 fail-closed（3c 前置）─────────────────────────────────────
//
//  ⚠ 先前 `standingsOf(state, "不存在")` 會靜默回 0 列，與「真的一場都沒打」
//    長得一樣。3c 的 Circuit Points 沿著 id 撈名次，撈錯會被算成 0 分並寫進
//    不可變帳本 —— 所以規則面一律明確失敗，畫面的 optional 查詢走 try 版本。
{
  const st8 = createSeasonState({ playerTeam: TEAM, season: 1, seasonSeed: 12345 }).state;
  const good = activeCompetitionOf(st8).id;
  const eid = st8.activeEventId;
  const threw = (fn) => { try { fn(); return false; } catch { return true; } };

  ck("8) 正確 id 照常回表", standingsOf(st8, good).rows.length === 8);
  ck("8b) **不存在的賽制 id ⇒ 明確 throw**（不再靜默回空表）",
    threw(() => standingsOf(st8, "comp:does-not-exist")));
  ck("8c) 未指定 id 也 throw（不把 undefined 當成「沒有資料」）",
    threw(() => standingsOf(st8, null)));
  ck("8d) **不存在的賽事 id ⇒ 明確 throw**",
    threw(() => eventStandingsOf(st8, "event:nope")) && threw(() => competitionsOfEvent(st8, "event:nope")));

  //  try 版本：語意是「可能沒有」，回 null，且與「真的 0 筆」分得開
  ck("8e) try 版本找不到 ⇒ 回 null（不是空表）",
    tryStandingsOf(st8, "comp:nope") === null &&
    tryEventStandingsOf(st8, "event:nope") === null &&
    tryCompetitionsOfEvent(st8, "event:nope") === null);
  ck("8f) try 版本找得到 ⇒ 回真正的結果（null 與 0 筆不混用）",
    tryStandingsOf(st8, good)?.rows.length === 8 &&
    tryCompetitionsOfEvent(st8, eid)?.length === 1);

  //  「真的 0 筆」仍然是合法結果：新賽季每隊都 0 場，但列數是 8
  ck("8g) **「找不到」與「真的 0 筆」分得開**",
    standingsOf(st8, good).rows.every((r) => r.played === 0) &&
    standingsOf(st8, good).rows.length === 8);
}

// ── 9) 範圍一致性驗證（duplicate binding / event→competition / circuit→event）──
{
  const base = createSeasonState({ playerTeam: TEAM, season: 1, seasonSeed: 12345 }).state;
  ck("9) 正常賽季通過範圍驗證", validateSeasonScope(base).ok === true,
    JSON.stringify(validateSeasonScope(base).errors));

  const two = addSecondEvent(base);
  ck("9b) 兩個 Event 也通過", validateSeasonScope(two).ok === true,
    JSON.stringify(validateSeasonScope(two).errors));

  const codesOf = (st) => validateSeasonScope(st).errors.map((e) => e.code);

  //  ① 賽制指到不存在的 Event
  const cid = activeCompetitionOf(base).id;
  const badEvent = { ...base, competitions: { ...base.competitions,
    [cid]: { ...base.competitions[cid], competition: { ...base.competitions[cid].competition, eventId: "event:ghost" } } } };
  ck("9c) 賽制的 eventId 指不到 ⇒ 抓得出來", codesOf(badEvent).includes("competition_event"));

  //  ② Event 指到不存在的 Circuit
  const eid = base.activeEventId;
  const badCircuit = { ...base, events: { ...base.events, [eid]: { ...base.events[eid], circuitId: "circuit:ghost" } } };
  ck("9d) Event 的 circuitId 指不到 ⇒ 抓得出來", codesOf(badCircuit).includes("event_circuit"));

  //  ③ rankingCompetitionId 不屬於該 Event
  const badRanking = { ...two, events: { ...two.events,
    [eid]: { ...two.events[eid], rankingCompetitionId: Object.keys(two.competitions).find((c) => c !== cid) } } };
  ck("9e) **rankingCompetitionId 指到別的 Event 的賽制 ⇒ 抓得出來**",
    codesOf(badRanking).includes("ranking_scope"));

  //  ④ duplicate binding：同一個賽制綁在兩個 Event
  const otherEid = Object.keys(two.events).find((e) => e !== eid);
  const dup = { ...two, events: { ...two.events,
    [otherEid]: { ...two.events[otherEid], competitionIds: [...two.events[otherEid].competitionIds, cid] } } };
  ck("9f) **competitionIds 與實際綁定不一致 ⇒ 抓得出來**", codesOf(dup).includes("competition_list"));

  //  ⑤ 多賽制卻沒指定名次來源
  const twoInOne = { ...two, competitions: { ...two.competitions } };
  const cupId = Object.keys(two.competitions).find((c) => c !== cid);
  twoInOne.competitions[cupId] = { ...two.competitions[cupId],
    competition: { ...two.competitions[cupId].competition, eventId: eid } };
  twoInOne.events = { ...two.events, [eid]: { ...two.events[eid], competitionIds: [cid, cupId], rankingCompetitionId: null } };
  ck("9g) **一個 Event 有兩個賽制卻沒指定名次來源 ⇒ 抓得出來**",
    codesOf(twoInOne).includes("ranking_required"));
}

// ── 10) UI 聚焦：標題與「下一場」跟著走，但仍不影響規則 ──────────────────
{
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  const s10 = addSecondEvent(store().competition, { prizePolicy: null });
  useProfileStore.setState({ competition: s10 });
  const leagueId = store().competition.activeEventId;
  const cupId = Object.keys(store().competition.events).find((e) => e !== leagueId);

  const v1 = store().competitionView();
  ck("10) 聚焦聯賽時，標題用聚焦 Event 名稱", !!v1.focusedEventName,
    v1.focusedEventName ?? "(null)");

  store().setActiveEvent(cupId);
  const v2 = store().competitionView();
  ck("10b) **切換後標題跟著換**", v2.focusedEventName !== v1.focusedEventName,
    `${v1.focusedEventName} → ${v2.focusedEventName}`);
  ck("10c) **「下一場」也跟著換到該 Event 的場次**",
    v1.next?.id !== v2.next?.id || (v1.next === null) !== (v2.next === null),
    `${v1.next?.id ?? "null"} → ${v2.next?.id ?? "null"}`);

  //  legacy：單一 Event ⇒ 標題不接管（畫面沿用「聯賽」）
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  ck("10d) legacy 單 Event：標題不接管、`next` 與全季一致",
    store().competitionView().focusedEventName === null);
}


console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
