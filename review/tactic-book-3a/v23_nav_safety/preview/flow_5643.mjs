// Owner preview smoke on 5643: home -> draft -> tactic -> battle (4x ~60s) -> quick finish -> result -> continue; read stored ruleset.
import { launchChrome } from "file:///D:/OneDrive/%E6%96%87%E4%BB%B6/GitHub/ESMO/.sprints/moba-v21-sprint0/tools/owner_preview/lib_cdp_chrome.mjs";
import { flowOf, VIS } from "file:///D:/OneDrive/%E6%96%87%E4%BB%B6/GitHub/ESMO/.sprints/moba-v21-sprint0/tools/owner_preview/lib_battle_flow.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = "http://127.0.0.1:5643/ESMO-/";
const out = { url, steps: {} };
const chrome = await launchChrome({});
try {
  const F = flowOf({ chrome, url, sleep });
  out.steps.toBattle = await F.toBattle();
  out.steps.banner = await F.ev("const b=document.querySelector('[data-owner-preview]'); return JSON.stringify(b?b.innerText:null);");
  if (out.steps.toBattle) {
    out.steps.speed4 = await F.click('[data-testid="match-speed-4"]');
    await sleep(60000);
    out.steps.hud = await F.ev(VIS + "const h=q('[data-testid=\"battle-hud\"]'); return JSON.stringify(h?(h.innerText||'').slice(0,160):null);");
    await chrome.evaluate("window.confirm=()=>true; return 1;");
    out.steps.quickFinish = await F.click('[data-testid="quick-finish-match"]');
    out.steps.endScreen = await F.wait("q('[data-testid=\"battle-end-screen\"]')", 180000);
    out.steps.endText = await F.ev(VIS + "const e=q('[data-testid=\"battle-end-screen\"]'); return JSON.stringify(e?(e.innerText||'').replace(/\\s+/g,' ').slice(0,300):null);");
    out.steps.continueVisible = await F.wait("q('[data-testid=\"battle-result-continue\"]')", 15000);
    out.steps.continue = await F.click('[data-testid="battle-result-continue"]');
    out.steps.leftBattle = await F.wait("!document.querySelector('[data-testid=\"battle-end-screen\"]') && !document.querySelector('[data-testid=\"battle-hud\"]')", 30000);
    await sleep(2000);
    out.steps.afterContinue = await F.ev("return JSON.stringify((document.body.innerText||'').replace(/\\s+/g,' ').slice(0,200));");
  }
  out.stored = await F.ev("const hits=[]; for (let i=0;i<localStorage.length;i++){const k=localStorage.key(i); const v=localStorage.getItem(k)||''; const re=/\"(rulesetId|simVersion|simulationVersion|safeRoute|jungleCamp|invasion)\":\"([^\"]+)\"/g; let m; const seen={}; while((m=re.exec(v))){const key=m[1]+'='+m[2]; seen[key]=(seen[key]||0)+1;} if(Object.keys(seen).length) hits.push({k, size:v.length, seen});} return JSON.stringify(hits);");
  out.pageErrors = chrome.pageErrors ?? [];
} catch (e) { out.error = String(e?.stack ?? e); }
finally { try { await chrome.close?.(); } catch { /* */ } }
console.log(JSON.stringify(out, null, 1));
