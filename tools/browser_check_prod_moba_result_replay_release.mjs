#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_moba_result_replay_release.mjs — 正式站 smoke：MOBA Battle → Result → Replay
//
//  執行：node tools/browser_check_prod_moba_result_replay_release.mjs（ESMO_PROD_URL 可覆寫）
//  走 ?debug=moba-runtime-battle（正式 GameView），390 與 1366 各一次：
//    B  戰鬥推進 → 按「快速完成」（先把 window.confirm 換成回傳 true，避免原生對話框卡住 CDP）
//    R  BattleEndScreen 出現、有勝方文字、「▶ 觀看重播」可點 → MobaReplayScreen 陣容 10 列、可播放、可關閉
//    E  page／console／shader error 0
//  ⚠ 正式站讀不到 `/src/`（TD-31），全程只走 DOM。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-mobile-hud/prod-smoke";
mkdirSync(OUT, { recursive: true });
const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";

const result = await runGate({
  name: "正式站 MOBA Battle → Result → Replay",
  externalUrl: PROD,
  timeoutMs: 1500000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const wait = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev("return JSON.stringify(!!(" + expr + "));")) return true; await sleep(600); } return false; };
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const btnText = (re) => "[...document.querySelectorAll('button')].find(b=>" + re + ".test(b.innerText||''))";

    for (const [label, w, h, mob] of [["390", 390, 844, true], ["1366", 1366, 900, false]]) {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
      await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=hud&waitTs=${mob ? 60 : 150}&quality=low`);
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("hud"); }
      ck(`B0[${label}] 戰鬥開始並推進到 ts ≥ ${mob ? 60 : 150}`, ready);
      if (!ready) continue;
      if (!mob) {
        //  小兵輪廓近景：鏡頭對準兩位存活英雄（對線期身邊多半有兵），dist 60（預設 175）。
        const heroes = await ev("const d=window.__ESMO_RUNTIME_DIAG(); return JSON.stringify(d.heroRenderDiagnostics.filter(h=>h.alive!==false&&h.position).map(h=>({id:h.id,x:h.position.x,z:h.position.z,act:h.actionState})));");
        for (const hh of (heroes ?? []).filter((x) => /^(b3|b4|r3)$/.test(x.id)).slice(0, 2)) {
          await ev("window.__ESMO_RUNTIME_SETCAM({dist:40, panX:" + hh.x + ", panZ:" + hh.z + "}); return JSON.stringify(1);"); await sleep(1500);
          await shot(`minion-closeup-${hh.id}`);
        }
        console.log("closeup heroes:", JSON.stringify(heroes));
      }
      await chrome.evaluate("window.confirm = () => true; return JSON.stringify(1);");
      const qf = await ev("const b=document.querySelector('[data-testid=\"quick-finish-match\"]'); if(!b) return JSON.stringify(null); const r=b.getBoundingClientRect(); const ok=r.width>0&&r.right<=innerWidth; b.click(); return JSON.stringify({inView:ok, disabled:b.disabled});");
      ck(`B1[${label}] 「快速完成」按鈕可見可按`, qf && qf.inView && !qf.disabled, JSON.stringify(qf));
      const ended = await wait(btnText("/觀看重播|無法重播/") + " || [...document.querySelectorAll('span')].some(s=>/無法重播/.test(s.innerText||''))", 240000);
      await sleep(2500);
      const end = await ev("const t=document.body.innerText||''; return JSON.stringify({win:/勝利|敗北|VICTORY|DEFEAT|獲勝/.test(t), replay:!!" + btnText("/觀看重播/") + ", over:document.documentElement.scrollWidth-innerWidth, text:t.replace(/\\s+/g,' ').slice(0,160)});");
      ck(`R1[${label}] 快速完成後出現結算畫面（有勝負文字）`, ended && end?.win, JSON.stringify(end));
      ck(`R2[${label}] 結算畫面無橫向溢出`, end && end.over <= 0, String(end?.over));
      await shot(`result-${label}`);
      ck(`R3[${label}] 「▶ 觀看重播」可用`, !!end?.replay);
      if (!end?.replay) continue;
      await chrome.evaluate("(" + btnText("/觀看重播/") + ").click(); return JSON.stringify(1);");
      const opened = await wait("document.querySelector('[data-testid=\"replay-play-toggle\"]')", 30000);
      const lineupRows = await ev("const t=document.querySelector('[data-testid=\"replay-lineup-toggle\"]'); if(t&&t.getAttribute('aria-pressed')!=='true') t.click(); return new Promise(r=>setTimeout(()=>r(JSON.stringify(document.querySelectorAll('[data-testid=\"replay-lineup-row\"]').length)),600));");
      ck(`R4[${label}] 重播畫面開啟、陣容 10 列`, opened && lineupRows === 10, `opened=${opened} rows=${lineupRows}`);
      //  ⚠ 重播開啟即自動播放（MobaReplayScreen `useState(true)`）⇒ 先驗時間軸在走，再驗暫停／繼續。
      const rp = () => ev("const s=document.querySelector('input[aria-label=\"重播時間軸\"]'); return JSON.stringify({t:s?Number(s.value):null, btn:document.querySelector('[data-testid=\"replay-play-toggle\"]')?.innerText||''});");
      const p0 = await rp(); await sleep(3000); const p1 = await rp();
      ck(`R5[${label}] 重播開啟即自動播放、時間軸前進`, /暫停/.test(p1?.btn ?? "") && p1?.t > p0?.t, `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);
      await chrome.evaluate("document.querySelector('[data-testid=\"replay-play-toggle\"]').click(); return JSON.stringify(1);");
      await sleep(600); const p2 = await rp(); await sleep(2000); const p3 = await rp();
      ck(`R5b[${label}] 按暫停 ⇒ 時間軸停住`, /播放/.test(p2?.btn ?? "") && p3?.t === p2?.t, `${JSON.stringify(p2)} → ${JSON.stringify(p3)}`);
      await chrome.evaluate("document.querySelector('[data-testid=\"replay-play-toggle\"]').click(); return JSON.stringify(1);");
      await sleep(2500); const p4 = await rp();
      ck(`R5c[${label}] 再按播放 ⇒ 時間軸繼續前進`, /暫停/.test(p4?.btn ?? "") && p4?.t > p3?.t, JSON.stringify(p4));
      await shot(`replay-${label}`);
      const closed = await ev("const b=" + btnText("/關閉|返回|✕|×/") + "; if(b) b.click(); return new Promise(r=>setTimeout(()=>r(JSON.stringify(!document.querySelector('[data-testid=\"replay-play-toggle\"]'))),800));");
      ck(`R6[${label}] 重播可關閉回到結算`, closed === true);
    }

    const errs = chrome.pageErrors ?? [];
    const lines = chrome.consoleLines ?? [];
    const consoleErr = lines.filter((l) => l.startsWith("[error]"));
    const shader = lines.filter((l) => /shader|WebGLProgram|GL_INVALID|CONTEXT_LOST/i.test(l));
    writeFileSync(`${OUT}/console-result-replay.txt`, lines.join("\n"));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0", consoleErr.length === 0, consoleErr.slice(0, 3).join(" ¦ "));
    ck("E3 shader／WebGL error 0", shader.length === 0, shader.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
