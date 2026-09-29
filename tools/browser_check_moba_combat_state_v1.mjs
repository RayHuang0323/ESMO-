#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_combat_state_v1.mjs — Persistent Combat State v1（瀏覽器）
//
//  執行：node tools/browser_check_moba_combat_state_v1.mjs          （本地 dev server）
//        node tools/browser_check_moba_combat_state_v1.mjs --prod   （正式站；ESMO_PROD_URL 可覆寫）
//  正式站模式只用 DOM ＋ `?shot=` 診斷掛勾（TD-31），並先證明線上 bundle 含 CombatState.v1（P0）。
//  本地 dev server、?debug=moba-runtime-battle&shot=（正式 GameView／引擎／HUD），1366 桌機＋390 手機：
//    L1 現場：出現過領域，且每次取樣「CombatZones 這一幀讀到的權威領域數 ＝ 畫面可見領域 mesh 數」（逐幀必須相等）
//       ⚠ 3D 畫面整體落後 frameRef 一幀（資料餵送器掛在所有渲染元件之後，英雄也一樣），所以不和最新 frameRef 比；
//         落後一幀的情況另列資訊。
//    L2 現場：底欄狀態列出現（statusEffects，含秒數）
//    R1 快速完成 → 結算 → 觀看重播：重播地圖載入完成
//    R2 重播：底欄狀態列出現（重播沒有引擎，狀態只能來自 replay.combatStates 區間表）
//    R3 重播：出現過領域，且權威＝可見
//    E  page error 0
//  ⚠ 取樣先證明前置條件成立（有領域／有狀態才判一致），不以「沒看到」當通過。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const PROD = process.env.ESMO_PROD_URL || (process.argv.includes("--prod") ? "https://rayhuang0323.github.io/ESMO-/" : null);
const OUT = process.env.ESMO_REVIEW_OUT ?? (PROD ? "review/moba-combat-state-v1/prod-smoke" : "review/moba-combat-state-v1/gate");
mkdirSync(OUT, { recursive: true });

const result = await runGate({
  name: PROD ? "正式站 MOBA Persistent Combat State v1" : "MOBA Persistent Combat State v1",
  ...(PROD ? { externalUrl: PROD } : {}),
  timeoutMs: 1500000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const wait = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev("return JSON.stringify(!!(" + expr + "));")) return true; await sleep(600); } return false; };
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const btnText = (re) => "[...document.querySelectorAll('button')].find(b=>" + re + ".test(b.innerText||''))";
    const zoneProbe = () => ev("const d=window.__ESMO_RUNTIME_DIAG&&window.__ESMO_RUNTIME_DIAG(); const s=[...document.querySelectorAll('.observer-status')].map(e=>e.getAttribute('data-status')); return JSON.stringify({z:d?d.combatZones:null, s});");
    //  取樣 n 次：領域一致率、看過的狀態
    const sample = async (n, tag) => {
      let withZone = 0, mismatch = 0, maxZ = 0, lag = 0; const kinds = new Set(), statuses = new Set(); let shotDone = false;
      for (let i = 0; i < n; i++) {
        const r = await zoneProbe();
        const z = r?.z;
        if (z && (z.authority > 0 || z.consumed > 0)) {
          withZone++; maxZ = Math.max(maxZ, z.authority); z.kinds.forEach((k) => kinds.add(k));
          if (z.consumed !== z.visibleMeshes) mismatch++;
          if (z.consumed !== z.authority) lag++;
          if (!shotDone) { await shot(`${tag}-zone`); shotDone = true; }
        }
        (r?.s ?? []).forEach((x) => statuses.add(x));
        await sleep(400);
      }
      return { withZone, mismatch, lag, maxZ, kinds: [...kinds], statuses: [...statuses] };
    };

    if (PROD) {
      await chrome.navigate(url); await sleep(2000);
      const bundle = await ev("const s=[...document.scripts].map(x=>x.src).find(x=>x.includes('/assets/index-')); return fetch(s).then(r=>r.text()).then(t=>JSON.stringify({src:s, v15:t.includes('moba-sim.v15'), cs:t.includes('CombatState.v1'), csr:t.includes('CombatStateReplay.v1'), zones:t.includes('moba-combat-zones')}));");
      ck("P0 線上 bundle 含 moba-sim.v15、CombatState.v1、CombatStateReplay.v1、領域元件", bundle?.v15 && bundle?.cs && bundle?.csr && bundle?.zones, JSON.stringify(bundle));
    }
    for (const [label, w, h, mob] of [["1366", 1366, 900, false], ["390", 390, 844, true]]) {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
      await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=hud&waitTs=90&quality=low`);
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("hud"); }
      ck(`B0[${label}] 戰鬥開始並推進到 ts ≥ 90`, ready);
      if (!ready) continue;
      const live = await sample(mob ? 120 : 220, `live-${label}`);
      ck(`L1[${label}] 現場出現過領域（前置），且讀到的權威領域＝可見 mesh（${live.withZone} 次取樣，逐幀相等）`,
        live.withZone > 0 && live.mismatch === 0, JSON.stringify({ ...live, statuses: undefined }));
      ck(`L2[${label}] 現場底欄狀態列出現`, live.statuses.length > 0, live.statuses.join(","));

      await chrome.evaluate("window.confirm = () => true; return JSON.stringify(1);");
      await ev("const b=document.querySelector('[data-testid=\"quick-finish-match\"]'); if(b) b.click(); return JSON.stringify(!!b);");
      const ended = await wait(btnText("/觀看重播/"), 240000);
      if (!ended) { ck(`R1[${label}] 快速完成後可開重播`, false); continue; }
      await chrome.evaluate("(" + btnText("/觀看重播/") + ").click(); return JSON.stringify(1);");
      const opened = await wait("document.querySelector('[data-testid=\"replay-play-toggle\"]')", 30000);
      const mapReady = opened && await wait("!document.querySelector('[data-testid=\"rift-entry-loading\"]')", 70000);
      ck(`R1[${label}] 重播開啟且戰場地圖載入完成`, opened && mapReady);
      //  重播 4× 播放一段
      await ev("const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').trim()==='4×'); if(b) b.click(); return JSON.stringify(!!b);");
      const rep = await sample(mob ? 120 : 200, `replay-${label}`);
      await shot(`replay-${label}`);
      ck(`R2[${label}] 重播底欄狀態列出現（來自 replay.combatStates）`, rep.statuses.length > 0, rep.statuses.join(","));
      ck(`R3[${label}] 重播出現過領域，且讀到的權威領域＝可見 mesh（${rep.withZone} 次取樣，逐幀相等）`,
        rep.withZone > 0 && rep.mismatch === 0, JSON.stringify({ ...rep, statuses: undefined }));
    }
    const errs = chrome.pageErrors ?? [];
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
