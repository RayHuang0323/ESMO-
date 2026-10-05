#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_moba_combat_feedback.mjs — 正式站 smoke：MOBA Combat Feedback Polish
//
//  執行：node tools/browser_check_prod_moba_combat_feedback.mjs（ESMO_PROD_URL 可覆寫）
//  走 ?debug=moba-runtime-battle&shot=…（正式 GameView），1366 與 390 各一段 4×：
//    F  浮動數字：英雄／中立／塔傷害、補血、護盾、+Gold 都有畫（驗收計數鉤子，?shot= 才存在）
//    R  回城：逐幀「畫出的引導數 ＝ snapshot 可見引導數」、有完成特效
//    O  截圖（每 40 秒一張）給人工審名牌／血條／數字
//    E  page／console／shader error 0
//  ⚠ 正式站讀不到 `/src/`（TD-31）⇒ 不能讀 store、不能讀引擎帳本：
//    「+Gold ＝ 正式帳本」只能由本地 check_moba_combat_feedback（G1，逐英雄精確相等）證明，這裡只驗有畫出來。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-combat-feedback/prod-smoke";
mkdirSync(OUT, { recursive: true });
const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";

const result = await runGate({
  name: "正式站 MOBA Combat Feedback",
  externalUrl: PROD,
  timeoutMs: 1500000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const clickText = (t) => ev("const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===" + JSON.stringify(t) + "); if(!b) return JSON.stringify(false); b.click(); return JSON.stringify(true);");
    const counters = () => ev("return JSON.stringify({fb:window.__ESMO_COMBAT_FEEDBACK?window.__ESMO_COMBAT_FEEDBACK():null, rc:window.__ESMO_RECALL_FX?window.__ESMO_RECALL_FX():null});");

    for (const [tag, w, h, mob, quality] of [["desktop", 1366, 768, false, "high"], ["m390", 390, 844, true, "low"]]) {
      if (mob) {
        await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
        await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      } else {
        await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
        await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      }
      await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=cfbp${tag}&waitTs=1&quality=${quality}`);
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) { await sleep(1000); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes(`cfbp${tag}`); }
      ck(`${tag} 正式站戰鬥開始`, ready);
      if (!ready) continue;
      await sleep(1500);
      await clickText("4×");
      const t0 = Date.now();
      let n = 0, c = null;
      while (Date.now() - t0 < 360000) {
        await sleep(2000);
        c = await counters();
        if (Date.now() - t0 > n * 40000) { await shot(`${tag}_${String(n).padStart(2, "0")}`); n++; }
        const fb = c?.fb, rc = c?.rc;
        if (fb && rc && fb.byTarget.hero > 0 && fb.byTarget.neutral > 0 && fb.byTarget.tower > 0 && fb.spawned.gold > 0 && fb.spawned.heal > 0 && fb.spawned.shield > 0 && rc.bursts.done > 0 && n >= 5) break;
      }
      const fb = c?.fb, rc = c?.rc;
      ck(`${tag} F1 正式 bundle 有驗收計數鉤子`, !!fb && !!rc);
      if (!fb || !rc) continue;
      ck(`${tag} F2 英雄／中立／塔傷害數字都有畫`, fb.byTarget.hero > 0 && fb.byTarget.neutral > 0 && fb.byTarget.tower > 0, JSON.stringify(fb.byTarget));
      ck(`${tag} F3 補血、護盾、+Gold、重要傷害都有畫`, fb.spawned.heal > 0 && fb.spawned.shield > 0 && fb.spawned.gold > 0 && fb.spawned.major > 0, JSON.stringify(fb.spawned));
      ck(`${tag} F4 同時存在的浮字 ≤ 28`, fb.peak <= 28, `peak ${fb.peak}`);
      ck(`${tag} R1 回城逐幀與 snapshot 一致、有完成特效`, rc.frames > 50 && rc.mismatchFrames === 0 && rc.bursts.done > 0, JSON.stringify(rc));
      ck(`${tag} O1 截圖 ≥ 5 張`, n >= 5, `${n}`);
    }
    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const shaderErrs = (chrome.consoleLines ?? []).filter((l) => /shader|WebGL.*error|THREE\.WebGLProgram/i.test(l));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0、shader error 0", consoleErrs.length === 0 && shaderErrs.length === 0, [...consoleErrs, ...shaderErrs].slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
