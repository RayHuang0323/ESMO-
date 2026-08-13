#!/usr/bin/env node
// ============================================================================
//  tools/measure_season_load_browser.mjs — 瀏覽器實測換日（Q7a-3f）
//
//  執行：`node tools/measure_season_load_browser.mjs`（自己起 vite／Chrome）。
//
//  Node 的量測（`measure_season_load.mjs`）已經說明 140 場不慢，但玩家是在
//  瀏覽器裡按下推進的。這一支在**真實 Chrome** 裡跑同一條 `advanceDay` 路徑，
//  確認 Node 的結論在瀏覽器 JS 引擎上也成立。
//
//  ⚠ 只量，不最佳化。
//  ⚠ 兩種組態都在**同一個分頁、同一次 session** 裡量，避免拿不同啟動狀態相比。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5323;
const CDP_PORT = 9345;

const MEASURE = (flagOn) => `
  ${RESOLVE_APP_MODULES}
  const AC = await import(B + "/src/platform/competition/asiaCircuit.js");
  const st = () => profile.useProfileStore.getState();

  st().startNewGame("standard");
  const t0 = performance.now();
  st().ensureCompetitionSeason();
  ${flagOn ? `
  const r = AC.applyAsiaCircuit(st().competition, { playerTeam: st().team, seasonSeed: st().meta.seasonSeed });
  profile.useProfileStore.setState({ competition: r.state });` : ""}
  const createMs = performance.now() - t0;

  const fixtures = st().competition.fixtures.length;
  const events = Object.keys(st().competition.events).length;

  const days = [];
  const tAll = performance.now();
  let guard = 0;
  while (guard++ < 600) {
    const v = st().competitionView();
    if (v.final) break;
    const pend = v.todayPending || [];
    if (pend.length) { for (const f of pend) st().forfeitFixture(f.id); continue; }
    const before = st().meta.days;
    const t = performance.now();
    st().advanceDay(1);
    days.push(performance.now() - t);
    if (st().meta.days === before) break;
  }
  const totalMs = performance.now() - tAll;
  const sorted = [...days].sort((a, b) => a - b);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q / 100 * sorted.length) - 1))] || 0;
  const outcomes = (st().competition.outcomes || []).length;
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    fixtures, events, outcomes,
    createMs: r2(createMs), totalMs: r2(totalMs), calls: days.length,
    avg: r2(days.reduce((a, b) => a + b, 0) / Math.max(1, days.length)),
    p95: r2(p(95)), max: r2(Math.max(...days)),
    sealed: !!st().competition.final,
  };
`;

console.log("══ 瀏覽器實測換日（Q7a-3f）══\n");
const dev = await startDevServer({ port: VITE_PORT });
const chrome = await launchChrome({ url: dev.url, port: CDP_PORT, headless: true });
try {
  await chrome.navigate(dev.url);
  await new Promise((r) => setTimeout(r, 4000));
  const ua = await chrome.evaluate(`return navigator.userAgent;`);
  console.log("   " + (ua.match(/Chrome\/[\d.]+/) ?? ["Chrome"])[0] + "\n");

  const off = await chrome.evaluate(MEASURE(false));
  const on = await chrome.evaluate(MEASURE(true));

  const ratio = (a, b) => (b === 0 ? "—" : `${Math.round((a / b) * 100) / 100}×`);
  const rows = [
    ["賽程場次", off.fixtures, on.fixtures, ratio(on.fixtures, off.fixtures)],
    ["賽事數", off.events, on.events, ratio(on.events, off.events)],
    ["賽果總數", off.outcomes, on.outcomes, ratio(on.outcomes, off.outcomes)],
    ["建立賽季 (ms)", off.createMs, on.createMs, ratio(on.createMs, off.createMs)],
    ["整季跑完 (ms)", off.totalMs, on.totalMs, ratio(on.totalMs, off.totalMs)],
    ["換日 平均 (ms)", off.avg, on.avg, ratio(on.avg, off.avg)],
    ["換日 P95 (ms)", off.p95, on.p95, ratio(on.p95, off.p95)],
    ["換日 最大 (ms)", off.max, on.max, ratio(on.max, off.max)],
  ];
  const pad = (s, n) => { const w = String(s).replace(/[^\x00-\xff]/g, "xx").length; return String(s) + " ".repeat(Math.max(0, n - w)); };
  console.log("│ " + pad("項目", 20) + "│ " + pad("56 場", 11) + "│ " + pad("140 場", 11) + "│ " + pad("倍率", 7) + "│");
  console.log("├" + "─".repeat(21) + "┼" + "─".repeat(12) + "┼" + "─".repeat(12) + "┼" + "─".repeat(8) + "┤");
  for (const r of rows) console.log("│ " + pad(r[0], 20) + "│ " + pad(r[1], 11) + "│ " + pad(r[2], 11) + "│ " + pad(r[3], 7) + "│");
  console.log(`\n封存成功：56 場 ${off.sealed ? "✔" : "✘"} / 140 場 ${on.sealed ? "✔" : "✘"}`);
  console.log(`頁面例外：${chrome.pageErrors.length === 0 ? "無" : chrome.pageErrors.slice(0, 2).join(" | ")}`);
} finally {
  await chrome.close();
  await dev.stop();
}
