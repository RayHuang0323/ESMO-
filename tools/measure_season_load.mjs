#!/usr/bin/env node
// ============================================================================
//  tools/measure_season_load.mjs — 賽季負擔量測（Q7a-3f）
//
//  執行：`node tools/measure_season_load.mjs [重複次數]`（預設 3 次取中位數）
//
//  ── 為什麼要量 ──────────────────────────────────────────────────────────
//  打開 `asiaCircuit` 之後一季從 56 場變成 140 場，AI 對 AI 的場次要在推進
//  天數時全部模擬完。**沒有量過就打開旗標，等於拿玩家的裝置當測試機。**
//
//  ⚠ 這一支**只量，不最佳化**。量出來慢就回報數字，不自行改模擬。
//  ⚠ 兩個組態跑的是**同一條 production 路徑**（`advanceDay` → `_advanceCompetition`
//    → `simulateAiFixturesOn`），差別只有旗標。不另外寫一套「模擬用」的迴圈——
//    那量到的會是驗證器自己的速度。
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
//  旗標由網址參數控制（與 production 同一條路徑）
globalThis.window = { location: { search: "" } };
const setFlag = (on) => { globalThis.window.location.search = `?asiaCircuit=${on ? 1 : 0}`; };

const { useProfileStore } = await import("../src/platform/profileStore.js");
const st = () => useProfileStore.getState();

const REPEATS = Math.max(1, Number(process.argv[2]) || 3);
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;   // ms，微秒解析度
const mb = (b) => Math.round((b / 1048576) * 10) / 10;
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const pct = (xs, p) => { const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))] ?? 0; };
const r2 = (x) => Math.round(x * 100) / 100;

/** 跑完一整季，回傳耗時剖面。 */
function runSeason(flagOn) {
  setFlag(flagOn);
  LS = null;
  if (global.gc) global.gc();
  const heap0 = process.memoryUsage().heapUsed;

  st().startNewGame("standard");
  //  ── ① 建立賽季 ──────────────────────────────────────────────────────
  const tCreate0 = now();
  st().ensureCompetitionSeason();
  const createMs = now() - tCreate0;

  const c0 = st().competition;
  const fixtures = c0.fixtures.length;
  const events = Object.keys(c0.events).length;

  //  ── ② 整季推進 ──────────────────────────────────────────────────────
  const dayMs = [];        // 每次 advanceDay(1) 的耗時
  const forfeitMs = [];    // 棄權（玩家場次）的耗時，與推進分開記
  let peakHeap = heap0;
  const tAll0 = now();
  let guard = 0;
  while (guard++ < 600) {
    const v = st().competitionView();
    if (v.final) break;
    const pending = v.todayPending ?? [];
    if (pending.length) {
      for (const f of pending) {
        const t = now(); st().forfeitFixture(f.id); forfeitMs.push(now() - t);
      }
      continue;
    }
    const before = st().meta.days;
    const t = now();
    st().advanceDay(1);
    dayMs.push(now() - t);
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    if (st().meta.days === before) break;
  }
  const totalMs = now() - tAll0;

  const c1 = st().competition;
  const simulated = (c1.outcomes ?? []).filter((o) => o.resultSource === "simulated").length;
  const forfeited = (c1.outcomes ?? []).filter((o) => o.resultSource === "forfeit" || o.resultSource === "forfeited").length;

  //  ── ③ 存檔大小（換季前）────────────────────────────────────────────
  st().save();
  const saveKB = Math.round((LS?.length ?? 0) / 1024);

  //  ── ④ 換季 ──────────────────────────────────────────────────────────
  const tRoll = now();
  const rolled = st().rollToNextCompetitionSeason();
  const rollMs = now() - tRoll;

  return {
    fixtures, events, createMs, totalMs, rollMs, saveKB,
    days: dayMs.length, dayMs, forfeitMs,
    outcomes: (c1.outcomes ?? []).length, simulated, forfeited,
    sealed: !!c1.final, rolledOk: !!rolled.ok,
    heapPeakMB: mb(peakHeap), heapDeltaMB: mb(peakHeap - heap0),
  };
}

/** 把 N 次的結果收成一份摘要（時間取中位數，避免單次 GC 尖峰主導）。 */
function summarize(runs) {
  const allDays = runs.flatMap((r) => r.dayMs);
  return {
    fixtures: runs[0].fixtures,
    events: runs[0].events,
    createMs: r2(median(runs.map((r) => r.createMs))),
    totalMs: r2(median(runs.map((r) => r.totalMs))),
    rollMs: r2(median(runs.map((r) => r.rollMs))),
    saveKB: Math.round(median(runs.map((r) => r.saveKB))),
    days: Math.round(median(runs.map((r) => r.days))),
    dayAvgMs: r2(allDays.reduce((a, b) => a + b, 0) / Math.max(1, allDays.length)),
    dayP95Ms: r2(pct(allDays, 95)),
    dayMaxMs: r2(Math.max(...allDays)),
    forfeitAvgMs: r2(runs.flatMap((r) => r.forfeitMs).reduce((a, b) => a + b, 0) /
      Math.max(1, runs.flatMap((r) => r.forfeitMs).length)),
    outcomes: runs[0].outcomes,
    simulated: runs[0].simulated,
    heapPeakMB: r2(median(runs.map((r) => r.heapPeakMB))),
    heapDeltaMB: r2(median(runs.map((r) => r.heapDeltaMB))),
    sealed: runs.every((r) => r.sealed),
    rolledOk: runs.every((r) => r.rolledOk),
  };
}

console.log(`══ 賽季負擔量測（每個組態跑 ${REPEATS} 次，時間取中位數）══`);
console.log(`   Node ${process.version} · ${process.platform} ${process.arch}\n`);

const off = summarize(Array.from({ length: REPEATS }, () => runSeason(false)));
const on = summarize(Array.from({ length: REPEATS }, () => runSeason(true)));

const ratio = (a, b) => (b === 0 ? "—" : `${r2(a / b)}×`);
const rows = [
  ["賽程場次", off.fixtures, on.fixtures, ratio(on.fixtures, off.fixtures)],
  ["賽事數", off.events, on.events, ratio(on.events, off.events)],
  ["賽果總數", off.outcomes, on.outcomes, ratio(on.outcomes, off.outcomes)],
  ["其中 AI 模擬", off.simulated, on.simulated, ratio(on.simulated, off.simulated)],
  ["建立賽季 (ms)", off.createMs, on.createMs, ratio(on.createMs, off.createMs)],
  ["整季跑完 (ms)", off.totalMs, on.totalMs, ratio(on.totalMs, off.totalMs)],
  ["推進天數次數", off.days, on.days, ratio(on.days, off.days)],
  ["每日推進 平均 (ms)", off.dayAvgMs, on.dayAvgMs, ratio(on.dayAvgMs, off.dayAvgMs)],
  ["每日推進 P95 (ms)", off.dayP95Ms, on.dayP95Ms, ratio(on.dayP95Ms, off.dayP95Ms)],
  ["每日推進 最大 (ms)", off.dayMaxMs, on.dayMaxMs, ratio(on.dayMaxMs, off.dayMaxMs)],
  ["棄權一場 平均 (ms)", off.forfeitAvgMs, on.forfeitAvgMs, ratio(on.forfeitAvgMs, off.forfeitAvgMs)],
  ["換季 (ms)", off.rollMs, on.rollMs, ratio(on.rollMs, off.rollMs)],
  ["存檔大小 (KB)", off.saveKB, on.saveKB, ratio(on.saveKB, off.saveKB)],
  ["heap 峰值 (MB)", off.heapPeakMB, on.heapPeakMB, ratio(on.heapPeakMB, off.heapPeakMB)],
  ["heap 增量 (MB)", off.heapDeltaMB, on.heapDeltaMB, ratio(on.heapDeltaMB, off.heapDeltaMB)],
];
const w = [22, 12, 12, 8];
const line = (cs) => "│ " + cs.map((c, i) => String(c).padEnd(w[i] - (/[一-鿿]/.test(String(c)) ? String(c).match(/[一-鿿]/g).length : 0))).join("│ ") + "│";
console.log(line(["項目", "56 場基線", "140 場新制", "倍率"]));
console.log("├" + w.map((x) => "─".repeat(x + 1)).join("┼") + "┤");
for (const r of rows) console.log(line(r));

console.log(`\n封存成功：基線 ${off.sealed ? "✔" : "✘"} / 新制 ${on.sealed ? "✔" : "✘"}`);
console.log(`換季成功：基線 ${off.rolledOk ? "✔" : "✘"} / 新制 ${on.rolledOk ? "✔" : "✘"}`);
console.log(`\n⚠ 只量測，不最佳化。判讀標準：每日推進是玩家會等的互動，`);
console.log(`   P95 超過 100ms 就會有感、超過 300ms 算明顯卡頓。`);
