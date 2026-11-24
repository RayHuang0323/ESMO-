//  C2 copy of C1 mk_c1.mjs (port 5648, banner c2). C2 browser step files:  node mk_c2.mjs <mode: watch|quick|mobile> <out.json> <tag>
//  watch:  career match at x4 until 05:00 game time (normal viewing), then quick-finish; quick: quick-finish right away; mobile: like quick at 390px.
//  Every mode saves the live match's MatchSetup JSON and, after the match, the UI engine's final state digest plus a fresh in-page headless run
//  of the same setup (window.__esmoC1), so Node can replay the same match and compare tick by tick.
import fs from "node:fs";
const [mode, out, tag] = process.argv.slice(2);
const SP = process.argv[5] ?? "C:/Users/ifikn/AppData/Local/Temp/claude/6ab21551ede7cdb5/ed52c22f-4e7c-485f-8479-8304226cf890/scratchpad/c2/browser";
const url = "http://127.0.0.1:5648/ESMO-/";
const hook = "window.__errs=[]; const oe=console.error; console.error=(...a)=>{window.__errs.push(a.map(String).join(' ').slice(0,300)); oe(...a)}; window.addEventListener('error',e=>window.__errs.push('ERR '+e.message)); window.addEventListener('unhandledrejection',e=>window.__errs.push('REJ '+String(e.reason).slice(0,300))); return 1;";
//  2026-11-23 fix (C1 closure): inside this JS string the regex needs \\d — a bare \d became "d", so the watch stop condition never fired.
//  Also: an optional 4th argument sets the engine-specific screenshot/save prefix directory (default SP).
const clockSec = "(()=>{const t=(document.querySelector('[data-testid=\"hud-clock\"]')?.innerText||'').match(/(\\d+):(\\d\\d)/); return t? +t[1]*60 + +t[2] : -1})()";
const steps = [
  ...(mode === "mobile" ? [{ vp: [390, 844, true] }] : []),
  { nav: url }, { js: hook }, { js: "return JSON.stringify({api:!!window.__esmoC1, sim:window.__esmoC1?.simVersion, banner:!!document.querySelector('[data-owner-preview=\"c2\"]')});" },
  { tap: "home-mode-moba" }, { wait: 2000 }, { tap: "prep-primary-action" },
  { until: "[...document.querySelectorAll('button')].some(b=>/確認進入對戰/.test(b.innerText))", ms: 40000 }, { tapText: "確認進入對戰" },
  { until: "document.querySelector('[data-testid=\"matchmaking-enter-banpick\"]') && !document.querySelector('[data-testid=\"matchmaking-enter-banpick\"]').disabled", ms: 40000 }, { wait: 800 }, { tap: "matchmaking-enter-banpick" },
  { until: "document.querySelector('[data-testid=\"hero-choose\"]')", ms: 30000 }, { shot: `${SP}/${tag}_1_banpick.png` },
  { js: fs.readFileSync(`${SP}/bp_loop.js`, "utf8") }, { tap: "confirm-draft" },
  { until: "document.querySelector('[data-testid=\"tb-step-confirm\"]')", ms: 30000 }, { tap: "tb-step-confirm" }, { wait: 1200 }, { shot: `${SP}/${tag}_2_tactic.png` },
  { tap: "tb-confirm-go" },
  { until: "window.__esmoC1 && window.__esmoC1.live && document.querySelector('[data-testid=\"hud-clock\"]')", ms: 180000 },
  { js: "const L=window.__esmoC1.live; return JSON.stringify({rulesetId:L.rulesetId, simVersion:L.simVersion, mathKernel:L.mathKernel, setupHash:L.setupHash});" },
  { save: { expr: "return window.__esmoC1.live.setupJson;", path: `${SP}/${tag}_setup.json` } },
  { wait: 3000 }, { shot: `${SP}/${tag}_3_battle.png` },
];
if (mode === "watch") steps.push({ tap: "match-speed-4" }, { until: clockSec + " >= 300", ms: 900000 }, { shot: `${SP}/${tag}_4_watch.png` },
  { js: "const s=window.__esmoC1.liveState(); return JSON.stringify({clock:document.querySelector('[data-testid=\"hud-clock\"]')?.innerText, t:s.t, digest:s.digest});" });
steps.push({ tap: "quick-finish-match" }, { wait: 1500 },
  { until: "document.querySelector('[data-testid=\"battle-end-screen\"]')", ms: 300000 }, { wait: 1500 }, { shot: `${SP}/${tag}_5_result.png` },
  { save: { expr: "const s=window.__esmoC1.liveState(); const h=window.__esmoC1.runLive(window.__esmoC1.live.setupJson, 3000); return JSON.stringify({ui:s, headless:{ticks:h.ticks, over:h.over, winner:h.winner, endT:h.endT, final:h.final, perTick:h.perTick}, text:document.body.innerText.split(String.fromCharCode(10)).filter(Boolean).slice(0,24).join(' | ')});", path: `${SP}/${tag}_result.json` } },
  { tapText: "觀看重播" }, { until: "document.querySelector('input[aria-label=\"重播時間軸\"]')", ms: 60000 }, { wait: 1500 },
  { js: fs.readFileSync(`${SP}/replay_scan.js`, "utf8").replace("__FROM__", "0").replace("__TO__", "3000") },
  { shot: `${SP}/${tag}_6_replay.png` }, { tapText: "關閉重播" }, { wait: 1500 },
  { until: "document.querySelector('[data-testid=\"battle-result-continue\"]')", ms: 30000 }, { tap: "battle-result-continue" }, { wait: 3000 },
  { shot: `${SP}/${tag}_7_settlement.png` },
  { until: "document.querySelector('[data-testid=\"home-mode-moba\"]')", ms: 30000 }, { shot: `${SP}/${tag}_8_home.png` },
  { js: "return JSON.stringify({home:!!document.querySelector('[data-testid=\"home-mode-moba\"]'), overflowX: document.documentElement.scrollWidth > window.innerWidth + 1, errs:window.__errs});" });
fs.writeFileSync(out, JSON.stringify(steps, null, 1));
console.log("steps", steps.length, out);
