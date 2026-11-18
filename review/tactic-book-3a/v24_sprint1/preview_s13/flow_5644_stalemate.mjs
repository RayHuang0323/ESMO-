// Owner preview browser test on 5644 (moba-sim.v24 Sprint 1.3, 2026-11-19). Runs the real battle screen, end screen and return to HQ.
// Cases (argv[2], default all):
//   career   normal career match, no test hook (regression of the regular flow)
//   quick    stalemate seed 120159, adaptive.v1.3, watch 60 s at 4x, then the quick-finish button
//   live     stalemate seed 120159, adaptive.v1.3, watched at 4x all the way to the end screen, no quick finish
//   before   stalemate seed 120159, adaptive.v1.2 (the version before the fix), quick-finish button
// Every stalemate case first proves the page runs the same match as Node: a headless replay in the page must reproduce the exported state hash.
import fs from "node:fs";
import { launchChrome } from "file:///D:/OneDrive/%E6%96%87%E4%BB%B6/GitHub/ESMO/.sprints/moba-v21-sprint0/tools/owner_preview/lib_cdp_chrome.mjs";
import { flowOf, VIS } from "file:///D:/OneDrive/%E6%96%87%E4%BB%B6/GitHub/ESMO/.sprints/moba-v21-sprint0/tools/owner_preview/lib_battle_flow.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "http://127.0.0.1:5644/ESMO-/", OUT = process.argv[3] ?? "C:/Users/ifikn/esmo-measure/v24-s13-val-130001/flow_5644_result.json";
const CASES = { career: "", quick: "?stalemateSeed=120159", live: "?stalemateSeed=120159", before: "?stalemateSeed=120159&te=adaptive.v1.2" };
const pick = (process.argv[2] ?? "career,quick,live,before").split(",");
const ENG = "const f=window.__esmoPreviewForce; const e=f&&f.engine;";
const engineNow = (F) => F.ev(ENG + "return JSON.stringify(e?{variant:f.variant,t:e.t,over:!!e.over,winner:e.winner||null,nexus:{blue:Math.round(e.towers.blue_nexus.hp),red:Math.round(e.towers.red_nexus.hp)}}:null);");
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { base: BASE, cases: {} };
async function finishToHq(F, r) {
  r.endText = await F.ev(VIS + "const e=q('[data-testid=\"battle-end-screen\"]'); return JSON.stringify(e?(e.innerText||'').replace(/\\s+/g,' ').slice(0,300):null);");
  r.continueVisible = await F.wait("q('[data-testid=\"battle-result-continue\"]')", 20000);
  r.continueClicked = await F.click('[data-testid="battle-result-continue"]');
  r.leftBattle = await F.wait("!document.querySelector('[data-testid=\"battle-end-screen\"]') && !document.querySelector('[data-testid=\"battle-hud\"]')", 40000);
  await sleep(2000);
  r.afterContinue = await F.ev("return JSON.stringify((document.body.innerText||'').replace(/\\s+/g,' ').slice(0,160));");
}
for (const name of pick) {
  const url = BASE + CASES[name], r = { url, startedAt: new Date().toISOString() }, chrome = await launchChrome({});
  try {
    const F = flowOf({ chrome, url, sleep });
    r.toBattle = await F.toBattle();
    r.banner = await F.ev("const b=document.querySelector('[data-owner-preview]'); return JSON.stringify(b?b.innerText:null);");
    if (!r.toBattle) throw new Error("did not reach the battle screen");
    if (name !== "career") {
      r.engineAtStart = await engineNow(F);
      r.expected = await F.ev("return JSON.stringify(window.__esmoPreviewForce?window.__esmoPreviewForce.expected:null);");
      r.headlessReplay = await F.ev("return JSON.stringify(window.__esmoPreviewForce.headless());");
      r.sameMatchAsNode = !!r.expected && !!r.headlessReplay && r.headlessReplay.hash === r.expected.hash && r.headlessReplay.endT === r.expected.endT;
    }
    r.speed4 = await F.click('[data-testid="match-speed-4"]');
    if (name === "live") {
      const t0 = Date.now();
      r.endScreen = await F.wait("q('[data-testid=\"battle-end-screen\"]')", 900000);
      r.liveWatchSec = Math.round((Date.now() - t0) / 1000);
    } else {
      await sleep(60000);
      r.engineBeforeQuick = name === "career" ? null : await engineNow(F);
      await chrome.evaluate("window.confirm=()=>true; return 1;");
      r.quickFinish = await F.click('[data-testid="quick-finish-match"]');
      const t0 = Date.now();
      r.endScreen = await F.wait("q('[data-testid=\"battle-end-screen\"]')", name === "before" ? 420000 : 240000);
      r.quickFinishSec = Math.round((Date.now() - t0) / 1000);
    }
    r.engineAtEnd = name === "career" ? null : await engineNow(F);
    if (name !== "career" && r.expected) r.endMatchesNode = r.engineAtEnd?.over === r.expected.over && r.engineAtEnd?.winner === r.expected.winner && r.engineAtEnd?.t === r.expected.endT;
    if (r.endScreen) await finishToHq(F, r);
    else r.stuckScreen = await F.ev(VIS + "return JSON.stringify({hud:!!q('[data-testid=\"battle-hud\"]'),quickFinishVisible:!!q('[data-testid=\"quick-finish-match\"]'),text:(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,200)});");
    r.stored = await F.ev("const hits={}; for (let i=0;i<localStorage.length;i++){const v=localStorage.getItem(localStorage.key(i))||''; for(const m of v.matchAll(/\"(rulesetId|simVersion|tacticExec)\":\"([^\"]+)\"/g)) hits[m[1]+'='+m[2]]=1;} return JSON.stringify(Object.keys(hits));");
    r.pageErrors = chrome.pageErrors ?? [];
  } catch (e) { r.error = String(e?.stack ?? e); r.pageErrors = chrome.pageErrors ?? []; }
  finally { try { await chrome.close?.(); } catch { /* already closed */ } }
  out.cases[name] = r;
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(name, JSON.stringify({ toBattle: r.toBattle, sameMatchAsNode: r.sameMatchAsNode, endScreen: r.endScreen, endMatchesNode: r.endMatchesNode, leftBattle: r.leftBattle, errors: (r.pageErrors ?? []).length, error: r.error ?? null }));
}
