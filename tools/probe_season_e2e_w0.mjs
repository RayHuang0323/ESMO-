#!/usr/bin/env node
// ============================================================================
//  tools/probe_season_e2e_w0.mjs — Season End-to-End Audit v1 W0：雙賽制日曆與邊界盤點
//
//  執行：node tools/probe_season_e2e_w0.mjs [--out=<json>]
//
//  ⚠ 這支是**盤點工具，不是 gate**：不做放行判定、不改產品碼，永遠 exit 0。
//  ⚠ **賽果是腳本寫的，不是真模擬。** 賽程走既有的 `completeFixtureMatch`／`forfeitFixture`，
//    所以這裡只能回答「日曆、邊界、結算走不走得通」，不能回答戰力或平衡。真模擬是 W1 的事。
//  ⚠ 只呼叫既有 Store Action，不建第二套賽程或時間規則。localStorage 是記憶體假物件。
//
//  情境：
//    moba_only    只打 MOBA（只開一個賽季的玩家）
//    both_day1    開局當天就開 MOBA 與 CS
//    cs_later     MOBA 開局，第 30 天才開 CS（CS 只在玩家按下才開季）
//    forfeit_all  兩邊都開，玩家全部棄權（最差的路徑，要走得出去）
//    each 記錄：每季場次與起訖日、同日雙賽、年度邊界、休賽期、封存、換季、存讀、卡住點。
// ============================================================================
import fs from "node:fs";

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  key: (i) => [...storage.keys()][i] ?? null,
  get length() { return storage.size; },
};

const { useProfileStore } = await import("../src/platform/profileStore.js");
const SS = await import("../src/platform/competition/seasonState.js");
const { careerYearOf, CAREER_YEAR } = await import("../src/platform/time/worldClock.js");

const st = () => useProfileStore.getState();
const MAX_STEPS = 2000;
const STOP_DAY = 420;
const modes = ["moba", "cs"];

function freshGame() {
  storage.clear();
  st().reset?.();
  st().startNewGame("elite");
}

const seasonOf = (m) => st().competitionByMode?.[m] ?? null;
const myFixtures = (m) => { const s = seasonOf(m); return s?.schema ? (s.fixtures ?? []).filter((f) => f.sideA === st().team?.id || f.sideB === st().team?.id) : []; };
const terminal = (f) => ["completed", "forfeited"].includes(f.status);
const dayOf = (m, f) => SS.absoluteDayOf(seasonOf(m), f);

function snapshotSeason(m) {
  const s = seasonOf(m);
  if (!s?.schema) return null;
  const mine = myFixtures(m);
  const days = mine.map((f) => dayOf(m, f)).filter(Number.isFinite).sort((a, b) => a - b);
  const all = (s.fixtures ?? []).map((f) => dayOf(m, f)).filter(Number.isFinite).sort((a, b) => a - b);
  return { season: s.season, total: (s.fixtures ?? []).length, mine: mine.length, myFirst: days[0] ?? null, myLast: days[days.length - 1] ?? null, lastAny: all[all.length - 1] ?? null };
}

/** 存讀恆等：重新建 store 太重，這裡比對「存檔寫下去的內容」與目前 state 的核心欄位。 */
function saveRoundTrip() {
  st().save();
  const raw = storage.get("esmo.profile.v1");
  if (!raw) return { ok: false, why: "no profile" };
  const p = JSON.parse(raw);
  const bad = ["team", "meta", "players", "finance", "competitionByMode", "processedCompetitionAwards"].filter((k) => JSON.stringify(p[k]) !== JSON.stringify(st()[k]));
  return { ok: !bad.length, bad, bytes: raw.length };
}

function run(name, { startCs = 1, startMoba = 1, result = "win", maxSeasons = 3 } = {}) {
  freshGame();
  const log = [];
  const breaks = [];
  const note = (kind, data = {}) => log.push({ day: Number(st().meta?.days) || 1, kind, ...data });
  const startDay = Number(st().meta?.days) || 1;
  const seen = { offSeasonOpened: [], yearsAtFinal: {}, sameDayDouble: 0, finals: {}, rolled: {}, nextStopMismatch: 0, saves: 0, saveFailures: [] };
  const started = { moba: false, cs: false };
  const ensure = (m) => { if (started[m]) return; const r = st().ensureCompetitionSeason(m); started[m] = !!r.ok; note("season_open", { mode: m, ok: r.ok, ...snapshotSeason(m) }); };
  const checkSave = (node) => { const r = saveRoundTrip(); seen.saves++; if (!r.ok) seen.saveFailures.push({ node, ...r }); };

  if (startMoba !== null && startDay >= startMoba) ensure("moba");
  if (startCs !== null && startDay >= startCs) ensure("cs");

  let steps = 0, stuck = 0, lastDay = -1;
  const done = () => modes.filter((m) => (m === "cs" ? startCs : startMoba) !== null).every((m) => (seasonOf(m)?.season ?? 0) >= maxSeasons && myFixtures(m).some(terminal));

  while (steps++ < MAX_STEPS) {
    const day = Number(st().meta?.days) || 1;
    if (day > STOP_DAY) { breaks.push({ kind: "reached_stop_day", day }); break; }
    if (done()) break;
    if (startCs !== null && !started.cs && day >= startCs) ensure("cs");
    if (startMoba !== null && !started.moba && day >= startMoba) ensure("moba");

    //  換季：封存之後，玩家要自己按（兩個項目各自決定，不必同步）
    for (const m of modes) {
      const s = seasonOf(m);
      if (s?.schema && s.final && !seen.finals[`${m}:${s.season}`]) {
        seen.finals[`${m}:${s.season}`] = { day, careerYear: careerYearOf(day).year, dayOfYear: careerYearOf(day).dayOfYear };
        note("season_final", { mode: m, season: s.season });
        checkSave(`final:${m}:${s.season}`);
      }
      if (s?.schema && s.final && (s.season < maxSeasons)) {
        const r = m === "moba" ? st().rollToNextCompetitionSeason() : st().rollToNextCsSeason();
        seen.rolled[`${m}:${s.season}`] = { day, ok: r.ok, reason: r.reason ?? null };
        note("season_roll", { mode: m, from: s.season, ok: r.ok, reason: r.reason ?? null, ...snapshotSeason(m) });
        if (!r.ok) breaks.push({ kind: "roll_failed", mode: m, day, reason: r.reason });
        checkSave(`roll:${m}:${s.season}`);
      }
    }

    //  今天玩家要收尾的賽程
    const today = modes.flatMap((m) => myFixtures(m).filter((f) => !terminal(f) && dayOf(m, f) <= day).map((f) => ({ m, f })));
    const byMode = new Set(today.filter((x) => dayOf(x.m, x.f) === day).map((x) => x.m));
    if (byMode.size > 1) seen.sameDayDouble++;
    if (today.length) {
      for (const { m, f } of today) {
        //  ⚠ 狀態機要求 scheduled → launched → completed，所以先走 `startFixtureMatch`（與真流程同一個入口）。
        let startedFx = result === "forfeit" ? { ok: true } : st().startFixtureMatch(f.id, 1700000000000 + steps);
        //  新局的 csLineup 是全空的：照實記下玩家會看到什麼，再走玩家按「自動填入」的同一支 action。
        if (!startedFx.ok && m === "cs" && !Object.values(st().csLineup ?? {}).some(Boolean)) {
          seen.emptyCsLineup = seen.emptyCsLineup ?? { day, shownToPlayer: startedFx.reason };
          st().autoFillLineup("cs");
          startedFx = st().startFixtureMatch(f.id, 1700000000000 + steps);
        }
        if (!startedFx.ok) { breaks.push({ kind: "fixture_start_failed", mode: m, fixture: f.id, day, reason: startedFx.reason }); continue; }
        const me = st().team.id;
        const r = result === "forfeit" ? st().forfeitFixture(f.id)
          : st().completeFixtureMatch({ fixtureId: f.id, winner: me, score: { a: f.sideA === me ? 1 : 0, b: f.sideB === me ? 1 : 0 }, duration: 1200, seed: st().matchmaking?.session?.seed ?? 7 });
        if (!r.ok) { breaks.push({ kind: "fixture_write_failed", mode: m, fixture: f.id, day, errors: r.errors }); }
      }
      if (!today.every(({ m, f }) => terminal(SS.fixtureById(seasonOf(m), f.id) ?? {}))) { stuck++; if (stuck > 3) { breaks.push({ kind: "fixture_not_terminal", day, ids: today.map((x) => x.f.id) }); break; } } else stuck = 0;
      continue;
    }

    //  休賽期會擋住世界時間 ⇒ 一定要出得去
    const view = st().offSeasonView();
    const session = view?.session ?? view?.open ?? null;
    const planned = st().worldTimeView().nextFixtureDay;
    const res = st().advanceToNextStop();
    if (!res.ok || !res.daysAdvanced) {
      const reason = res.reason ?? res.stoppedBy?.code ?? "unknown";
      if (/休賽期/.test(String(reason))) {
        const pending = modes.flatMap((m) => myFixtures(m).filter((f) => !terminal(f)).map(() => m));
        seen.offSeasonOpened.push({ day, careerYear: careerYearOf(day).year, dayOfYear: careerYearOf(day).dayOfYear, pendingMoba: pending.filter((m) => m === "moba").length, pendingCs: pending.filter((m) => m === "cs").length, session: !!session });
        note("offseason_blocks", { reason });
        checkSave(`offseason:${day}`);
        const c = st().completeOffSeason();
        note("offseason_complete", { ok: c.ok });
        if (!c.ok) { breaks.push({ kind: "offseason_cannot_complete", day }); break; }
        continue;
      }
      //  兩邊都打完、封存了也沒有下一場：往前推一天，世界時間不能停
      const one = st().advanceDay(1);
      if (!(one.daysAdvanced > 0)) { breaks.push({ kind: "calendar_stuck", day, reason: String(reason), stoppedBy: one.stoppedBy ?? null }); break; }
      continue;
    }
    const after = Number(st().meta?.days) || 1;
    if (planned && after !== planned && res.stop !== "year" && after < planned) seen.nextStopMismatch++;
    if (after === lastDay) { stuck++; if (stuck > 5) { breaks.push({ kind: "no_progress", day: after }); break; } } else stuck = 0;
    lastDay = after;
  }
  if (steps >= MAX_STEPS) breaks.push({ kind: "max_steps" });
  checkSave("end");
  return {
    name, startDay, endDay: Number(st().meta?.days) || 1,
    seasons: Object.fromEntries(modes.map((m) => [m, snapshotSeason(m)])),
    history: { moba: (st().competitionHistoryByMode?.moba ?? st().competitionHistory ?? []).length, cs: (st().competitionHistoryByMode?.cs ?? []).length },
    ...seen, breaks, log,
  };
}

const out = {
  schema: "season-e2e-w0.v1",
  note: "scripted results, not real simulation; calendar and boundaries only",
  careerYearDays: CAREER_YEAR.daysPerYear,
  runs: [
    run("moba_only", { startCs: null }),
    run("both_day1", {}),
    run("cs_later", { startCs: 30 }),
    run("forfeit_all", { result: "forfeit" }),
  ],
};
for (const r of out.runs) {
  console.log(`\n── ${r.name}：第 ${r.startDay} 天 → 第 ${r.endDay} 天`);
  console.log("  賽季", JSON.stringify(r.seasons));
  console.log("  封存", JSON.stringify(r.finals));
  console.log("  換季", JSON.stringify(r.rolled));
  console.log("  休賽期", JSON.stringify(r.offSeasonOpened));
  console.log(`  同日雙賽 ${r.sameDayDouble} 天；下一站預告與實際不符 ${r.nextStopMismatch} 次；存檔節點 ${r.saves}，存讀不符 ${r.saveFailures.length}`);
  if (r.saveFailures.length) console.log("  存讀不符", JSON.stringify(r.saveFailures.slice(0, 4)));
  if (r.emptyCsLineup) console.log("  CS 先發全空時出賽", JSON.stringify(r.emptyCsLineup));
  console.log("  斷點", JSON.stringify(r.breaks));
}
const file = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (file) fs.writeFileSync(file, JSON.stringify(out, null, 1));
