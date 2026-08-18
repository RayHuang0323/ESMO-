#!/usr/bin/env node
// ============================================================================
//  SeasonState v2 Runtime Compatibility Gate
//
//  驗的是「v2 有沒有真的接上 runtime」，不是「legacy 還能不能跑」。
//  兩者必須分開看：P0 hotfix 之後 legacy runtime 是綠的，但 v2 契約仍是紅的。
//  ⇒ 本 gate 刻意把兩類斷言分開標示（[legacy] / [v2]），任何一類都不得放寬。
//
//  契約依據：review/mainline-defects/SEASONSTATE_V2_RUNTIME_CONTRACT.md（C1–C12）
//
//  ⚠ 純 Node，不需瀏覽器。localStorage 以 shim 提供（沿用既有 v2 verifier 手法）。
// ============================================================================
import { readFileSync } from "node:fs";

const KEY = "esmo.profile.v1";
let raw = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? raw : null),
  setItem: (k, v) => { if (k === KEY) raw = String(v); },
  removeItem: (k) => { if (k === KEY) raw = null; },
};

const V2 = await import("../src/platform/competition/seasonStateV2.js");
const SEA = await import("../src/platform/competition/seasonState.js");
const COMP = await import("../src/platform/contracts/competition.js");

let pass = 0, fail = 0;
const results = [];
const ck = (tag, name, ok, detail = "") => {
  ok ? pass++ : fail++;
  results.push({ tag, name, ok });
  console.log(`${ok ? "✅" : "❌"} ${tag} ${name}${detail ? `　${detail}` : ""}`);
};
const j = (v) => JSON.stringify(v);
const fresh = async (label) => (await import(`../src/platform/profileStore.js?${label}`)).useProfileStore;
const eventsOfV2 = (v2) => (v2?.gameModes ?? []).flatMap((m) => (m.circuits ?? []).flatMap((c) => c.events ?? []));

// 讀既有存檔（fixture 路徑集中在一處，方便後續改為 repo 內資產）
const FIXTURE_DIRS = [
  new URL("../review/fixtures/", import.meta.url),
  new URL("../../", import.meta.url),
];
const loadFixture = (name) => {
  for (const dir of FIXTURE_DIRS) {
    try { return JSON.parse(readFileSync(new URL(name, dir), "utf8")); } catch { /* 下一個 */ }
  }
  return null;
};

// ── A. 全新遊戲建立 Season ──────────────────────────────────────────────
raw = null;
const S1 = await fresh("v2rt-fresh");
const st1 = () => S1.getState();
st1().startNewGame("standard");
st1().ensureCompetitionSeason();
const freshLegacy = st1().competition;
const freshV2 = st1().seasonStateV2;

ck("[legacy]", "A1. 全新遊戲建立了 legacy season（competitions/events 非空）",
  !!freshLegacy?.schema && Object.keys(freshLegacy.competitions ?? {}).length > 0
  && Object.keys(freshLegacy.events ?? {}).length > 0,
  j({ competitions: Object.keys(freshLegacy?.competitions ?? {}).length, events: Object.keys(freshLegacy?.events ?? {}).length }));

ck("[v2]", "A2. 建立 Season 後 v2 有對應 Season 實體（C3）",
  freshV2?.schema === "SeasonState.v2" && (freshV2.gameModes ?? []).length > 0,
  j({ gameModes: (freshV2?.gameModes ?? []).length, events: eventsOfV2(freshV2).length }));

// ── C/D. Event 數量必須忠實映射 legacy（C4）────────────────────────────
const freshLegacyEventIds = Object.keys(freshLegacy?.events ?? {});
ck("[v2]", "C1. single/多 Event：v2 Event 數量 === legacy Event 數量（C4）",
  eventsOfV2(freshV2).length === freshLegacyEventIds.length,
  j({ legacy: freshLegacyEventIds.length, v2: eventsOfV2(freshV2).length }));

ck("[v2]", "C2. v2 Event 的 id 集合逐值等於 legacy Event id 集合（C4/C12）",
  j(eventsOfV2(freshV2).map((e) => e.id).sort()) === j(freshLegacyEventIds.slice().sort()),
  j({ v2: eventsOfV2(freshV2).map((e) => e.id).sort() }));

// ── E. activeEventId ────────────────────────────────────────────────────
ck("[v2]", "E1. v2 active.eventId === legacy activeEventId（C6）",
  freshV2?.active?.eventId === (freshLegacy?.activeEventId ?? null),
  j({ v2Active: freshV2?.active?.eventId ?? null, legacyActive: freshLegacy?.activeEventId ?? null }));

ck("[v2]", "E2. active 指向的 Event 存在於 v2 Event 集合中（C6）",
  !!freshV2?.active?.eventId && eventsOfV2(freshV2).some((e) => e.id === freshV2.active.eventId));

// ── F. careerEventId 必須與 activeEventId 分離（C7）─────────────────────
ck("[legacy]", "F1. legacy 同時保有 activeEventId 與 careerEventId（C7）",
  "activeEventId" in (freshLegacy ?? {}) && "careerEventId" in (freshLegacy ?? {}),
  j({ active: freshLegacy?.activeEventId, career: freshLegacy?.careerEventId }));

ck("[v2]", "F2. v2 不得把 careerEventId 當成 active（C7）",
  (() => {
    // 造一份 active 與 career 不同的 legacy state，v2 必須跟著 activeEventId
    const two = { ...freshLegacy, careerEventId: "event:__career_only__" };
    const w = V2.wrapLegacySeasonState({ legacyState: two, competitionHistory: [], awardLedger: {} });
    return w?.active?.eventId === two.activeEventId;
  })(),
  "以 careerEventId 改成不存在的值驗證 active 不受影響");

// ── G. adapter 必須交得出 legacyState（C6/C10）──────────────────────────
const adp1 = st1().activeCompetitionEvent();
ck("[v2]", "G1. activeCompetitionEvent().legacyState 非 null（C6）",
  adp1?.legacyState != null,
  j({ ok: adp1?.ok, hasEvent: !!adp1?.event, legacyStateIsNull: adp1?.legacyState == null }));

ck("[v2]", "G2. adapter 交回的就是同一份 legacy state（C1：不得另造）",
  adp1?.legacyState === st1().competition);

// ── H. wrong scope 必須 fail closed（C10）───────────────────────────────
ck("[v2]", "H1. Event competitionRef 與 legacy 不符時 legacyState 必須為 null（C10）",
  (() => {
    const v2 = V2.wrapLegacySeasonState({ legacyState: freshLegacy, competitionHistory: [], awardLedger: {} });
    const evs = eventsOfV2(v2);
    if (!evs.length) return false;                       // 建不出 Event 就無從談 scope
    const broken = JSON.parse(JSON.stringify(v2));
    for (const m of broken.gameModes ?? []) {
      for (const c of m.circuits ?? []) {
        for (const e of c.events ?? []) {
          if (e.competitionRef) e.competitionRef.id = "comp:__wrong_scope__";
        }
      }
    }
    const a = V2.activeEventAdapter({ seasonStateV2: broken, legacyState: freshLegacy });
    return a.legacyState == null;
  })(),
  "把 competitionRef.id 改錯後 adapter 必須拒絕");

ck("[v2]", "H2. active 指向不存在的 Event 時必須 fail closed（C6/C10）",
  (() => {
    const v2 = V2.wrapLegacySeasonState({ legacyState: freshLegacy, competitionHistory: [], awardLedger: {} });
    if (!eventsOfV2(v2).length) return false;
    const broken = { ...JSON.parse(JSON.stringify(v2)), active: { gameMode: "moba", circuitId: "circuit:__x__", eventId: "event:__x__" } };
    const a = V2.activeEventAdapter({ seasonStateV2: broken, legacyState: freshLegacy });
    return a.legacyState == null;
  })());

// ── B. save → reload（C11）──────────────────────────────────────────────
st1().save();
const savedRaw = raw;
const S2 = await fresh("v2rt-reload");
const st2 = () => S2.getState();
ck("[legacy]", "B1. reload 後 legacy season 完整（C11）",
  !!st2().competition?.schema
  && Object.keys(st2().competition.events ?? {}).length === freshLegacyEventIds.length);

//  ⚠ 空 v2 與空 v2 也會「相等」⇒ 先要求非空，否則這條在壞掉時會假綠。
ck("[v2]", "B2. reload 後 v2 重新推導且與存檔前一致（C11 deterministic）",
  eventsOfV2(st2().seasonStateV2).length > 0 && j(st2().seasonStateV2) === j(freshV2),
  `events=${eventsOfV2(st2().seasonStateV2).length}`);

ck("[v2]", "B3. 刪掉存檔中的 v2 後 reload 仍能重建（C11 不需破壞式 migration）",
  await (async () => {
    const obj = JSON.parse(savedRaw);
    delete obj.seasonStateV2;
    raw = JSON.stringify(obj);
    const S = await fresh("v2rt-nov2");
    const rebuilt = S.getState().seasonStateV2;
    raw = savedRaw;
    return eventsOfV2(rebuilt).length === freshLegacyEventIds.length && rebuilt?.active?.eventId === freshLegacy.activeEventId;
  })());

// ── D. multi Event（既有存檔）───────────────────────────────────────────
const multiSave = loadFixture("s7e_player_one.json");
const sealedSave = loadFixture("s7b_season_sealed.json");
if (!multiSave || !sealedSave) {
  ck("[v2]", "D0. 多 Event 既有存檔 fixture 可讀", false, "找不到 s7e_player_one.json / s7b_season_sealed.json");
} else {
  raw = JSON.stringify(multiSave);
  const S3 = await fresh("v2rt-multi");
  const st3 = () => S3.getState();
  const mLegacy = st3().competition;
  const mV2 = st3().seasonStateV2;
  const mLegacyIds = Object.keys(mLegacy?.events ?? {});

  ck("[legacy]", "D1. 多 Event 存檔載入後 legacy 完整（5 Event / 5 Competition）",
    mLegacyIds.length === 5 && Object.keys(mLegacy?.competitions ?? {}).length === 5,
    j({ events: mLegacyIds.length, competitions: Object.keys(mLegacy?.competitions ?? {}).length }));

  ck("[v2]", "D2. 多 Event：v2 Event 數量 === 5（C4）",
    eventsOfV2(mV2).length === mLegacyIds.length,
    j({ legacy: mLegacyIds.length, v2: eventsOfV2(mV2).length }));

  ck("[v2]", "D3. 每個 v2 Event 的 competitionRef.id === legacy rankingCompetitionId（C3）",
    eventsOfV2(mV2).length > 0 && eventsOfV2(mV2).every((e) => {
      const le = mLegacy.events?.[e.id];
      return le && e.competitionRef?.id === le.rankingCompetitionId;
    }));

  ck("[v2]", "D4. Event status 逐 Event 由 events[eid].final 決定，可混合（C5）",
    eventsOfV2(mV2).length > 0 && eventsOfV2(mV2).every((e) => {
      const le = mLegacy.events?.[e.id];
      const expect = le?.final ? V2.EVENT_STATUS.sealed : V2.EVENT_STATUS.active;
      return e.status === expect;
    }),
    j({ legacyMixed: mLegacyIds.map((id) => (mLegacy.events[id].final ? "sealed" : "active")) }));

  ck("[v2]", "D5. 多 Event 存檔的 adapter 交得出 legacyState（C6）",
    st3().activeCompetitionEvent()?.legacyState != null);

  ck("[legacy]", "O1. CompetitionScreen projection 有資料（competitionView）",
    st3().competitionView()?.hasSeason === true,
    j({ hasSeason: st3().competitionView()?.hasSeason }));

  // ── I / J. sealed season 與 sealed Event final reference ──────────────
  raw = JSON.stringify(sealedSave);
  const S4 = await fresh("v2rt-sealed");
  const st4 = () => S4.getState();
  const sLegacy = st4().competition;
  const sV2 = st4().seasonStateV2;

  ck("[legacy]", "I1. 已封存存檔的 legacy final 存在（SeasonSeal.v1）",
    sLegacy?.final?.schema === "SeasonSeal.v1",
    j({ schema: sLegacy?.final?.schema, hasId: sLegacy?.final?.id != null }));

  ck("[v2]", "I2. Season status 為 sealed（C9：只用 status 表達，不造 id）",
    sV2?.status === V2.SEASON_STATUS.sealed,
    j({ status: sV2?.status }));

  ck("[v2]", "J1. 每個 sealed Event 都有合法 final reference（C8，解 sealed_without_final）",
    (() => {
      const evs = eventsOfV2(sV2);
      if (!evs.length) return false;
      return evs.filter((e) => e.status === V2.EVENT_STATUS.sealed).every((e) => !!e.final);
    })(),
    j({ sealedEvents: eventsOfV2(sV2).filter((e) => e.status === "sealed").length,
        withFinal: eventsOfV2(sV2).filter((e) => e.status === "sealed" && e.final).length }));

  ck("[v2]", "J2. sealed Event 的 finalId === legacy eventFinalOf(...).id（C8）",
    (() => {
      const evs = eventsOfV2(sV2).filter((e) => e.status === V2.EVENT_STATUS.sealed);
      if (!evs.length) return false;
      return evs.every((e) => e.finalId === (SEA.eventFinalOf(sLegacy, e.id)?.id ?? null));
    })());

  //  ⚠ v2 為空時「沒有 rows」必然成立 ⇒ 先要求真的有 sealed Event，否則假綠。
  ck("[v2]", "J3. v2 未替 SeasonSeal 造 id，也未複製 rows（C1/C2/C9）",
    (() => {
      const evs = eventsOfV2(sV2).filter((e) => e.status === V2.EVENT_STATUS.sealed);
      if (!evs.length) return false;
      const txt = JSON.stringify(sV2);
      return sLegacy?.final?.id == null && !txt.includes('"rows"');
    })());

  ck("[v2]", "I3. 已封存存檔的 adapter 交得出 legacyState（C6）",
    st4().activeCompetitionEvent()?.legacyState != null);

  //  ⚠ 空骨架也會 validate 通過 ⇒ 先要求有 Event，這條才有檢定力。
  ck("[v2]", "J4. validateSeasonStateV2 通過（不得有 sealed_without_final）",
    eventsOfV2(sV2).length > 0 && V2.validateSeasonStateV2(sV2).ok === true,
    j({ events: eventsOfV2(sV2).length, errors: V2.validateSeasonStateV2(sV2).errors?.slice(0, 3) ?? [] }));

  // ── K / L / M / N. canRoll / rollover / history / S2 active ───────────
  const viewBefore = st4().competitionView();
  ck("[legacy]", "K1. canRoll.ok 為 true（已封存未換季）",
    viewBefore?.canRoll?.ok === true, j({ nextSeason: viewBefore?.canRoll?.nextSeason }));

  st4().rollToNextCompetitionSeason();
  const viewAfter = st4().competitionView();
  const rolledLegacy = st4().competition;
  const rolledV2 = st4().seasonStateV2;

  ck("[legacy]", "L1. rollover 後 season +1、final 清空、有新賽程",
    viewAfter?.season === (viewBefore?.season ?? 0) + 1 && rolledLegacy?.final == null
    && (rolledLegacy?.fixtures ?? []).length > 0,
    j({ before: viewBefore?.season, after: viewAfter?.season, fixtures: (rolledLegacy?.fixtures ?? []).length }));

  ck("[legacy]", "M1. S1 進入 competitionHistory",
    (st4().competitionHistory ?? []).length >= 1,
    j({ history: (st4().competitionHistory ?? []).length }));

  ck("[v2]", "N1. rollover 後 v2 active 指向新賽季的 Event（C6/C11）",
    !!rolledV2?.active?.eventId && rolledV2.active.eventId === rolledLegacy.activeEventId
    && eventsOfV2(rolledV2).some((e) => e.id === rolledV2.active.eventId),
    j({ v2Active: rolledV2?.active?.eventId ?? null, legacyActive: rolledLegacy?.activeEventId ?? null }));

  ck("[v2]", "N2. rollover 後 v2 Event 數量仍等於 legacy（C4）",
    eventsOfV2(rolledV2).length === Object.keys(rolledLegacy?.events ?? {}).length,
    j({ legacy: Object.keys(rolledLegacy?.events ?? {}).length, v2: eventsOfV2(rolledV2).length }));

  ck("[v2]", "M2. rollover 後 v2 history 保有上一季 reference（C11）",
    (rolledV2?.history ?? []).length >= 1,
    j({ v2History: (rolledV2?.history ?? []).length }));
}

// ── 摘要（legacy / v2 分開統計）────────────────────────────────────────
const legacyRows = results.filter((r) => r.tag === "[legacy]");
const v2Rows = results.filter((r) => r.tag === "[v2]");
const legacyPass = legacyRows.filter((r) => r.ok).length;
const v2Pass = v2Rows.filter((r) => r.ok).length;
console.log("");
console.log(`[legacy] ${legacyPass}/${legacyRows.length} 通過　（P0 hotfix 之後這一組應該全綠）`);
console.log(`[v2]     ${v2Pass}/${v2Rows.length} 通過　（v2 修好之前這一組應該大量紅）`);
console.log(`總計 ${pass}/${pass + fail} 通過`);

// 退出碼語意：只要有任何一條紅就非零；報告時請看上面兩組分開的數字。
process.exit(fail === 0 ? 0 : 1);
