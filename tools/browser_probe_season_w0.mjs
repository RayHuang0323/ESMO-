#!/usr/bin/env node
// ============================================================================
//  tools/browser_probe_season_w0.mjs — Season End-to-End Audit v1 W0：玩家實際看到什麼
//
//  執行：node tools/browser_probe_season_w0.mjs [--url=<網址>] [--out=<json>]（預設正式站）
//
//  ⚠ 盤點工具，不是 gate：只記錄畫面與存檔，不判定放行，永遠 exit 0。獨立 profile，碰不到玩家存檔。
//  ⚠ 打包結果沒有 /src/，全程只走 DOM 與 localStorage。
//
//  只回答 W0 三個從 Node 看不到的問題（1366 與 390 各走一次）：
//    Q1 開新局什麼都不做時，賽季存在嗎？「前往下一站」會去哪裡？
//    Q2 開了 CS 聯賽、CS 先發還是空的，走到比賽日按「出戰」，玩家看到什麼？有沒有路走？
//    Q3 比賽日當天的棄權與自動填入入口，MOBA 與 CS 分頁各有什麼？
// ============================================================================
import fs from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const PROD = arg("url") ?? "https://rayhuang0323.github.io/ESMO-/";
const OUT = arg("out");
const J = (raw) => { const s = String(raw); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
const tid = (id) => "[data-testid=\"" + id + "\"]";
const report = { url: PROD, widths: {} };

const result = await runGate({
  name: "Season W0 UI audit",
  externalUrl: PROD,
  timeoutMs: 900000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => J(await chrome.evaluate(body));
    const click = (id) => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};const el=[...document.querySelectorAll('" + tid(id) + "')].find(vis);if(el)el.click();return JSON.stringify(!!el);");
    const exists = (id) => ev("return JSON.stringify(!!document.querySelector('" + tid(id) + "'));");
    const text = (id) => ev("const e=document.querySelector('" + tid(id) + "');return JSON.stringify(e?e.innerText.replace(/\\n/g,' ｜ ').slice(0,240):null);");
    const prof = async () => J(await ev("return JSON.stringify(localStorage.getItem('esmo.profile.v1'));"));
    const waitFor = async (id, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await exists(id)) return true; await sleep(400); } return false; };
    const summary = (p) => ({ day: p?.meta?.days ?? null, moba: !!p?.competitionByMode?.moba?.schema, cs: !!p?.competitionByMode?.cs?.schema, csSeats: Object.values(p?.csLineup ?? {}).filter(Boolean).length, funds: p?.finance?.funds ?? null });
    const home = async () => { await chrome.navigate(url); await waitFor("home-mode-moba", 90000); await sleep(800); };

    for (const [label, w, h, mob] of [["1366", 1366, 900, false], ["390", 390, 844, true]]) {
      const r = report.widths[label] = {};
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
      await chrome.navigate(url); await sleep(1500);
      await ev("localStorage.clear(); return JSON.stringify(1);");
      await home();

      // ── Q1 ──
      await ev("return JSON.stringify(document.querySelector('" + tid("home-advance-next") + "') ? 1 : 0);");
      r.q1 = { fresh: summary(await prof()), nextStopText: await text("home-next-stop") };
      const hadAdvance = await click("home-advance-next");
      await sleep(1200);
      r.q1.advanceButton = hadAdvance;
      r.q1.afterFirstAdvance = summary(await prof());

      // ── Q2 ──
      await home();
      await click("home-mode-bracket");
      await waitFor("competition-hub-tabs", 30000);
      await sleep(800);
      r.q2 = { afterOpeningHub: summary(await prof()) };
      await click("competition-hub-tab-cs");
      await sleep(900);
      r.q2.noSeasonText = await text("cs-hub-no-season");
      const opened = await ev("const b=[...document.querySelectorAll('" + tid("cs-hub-no-season") + " button')][0]; if(b) b.click(); return JSON.stringify(b ? b.innerText : null);");
      await sleep(1000);
      r.q2.openButton = opened;
      r.q2.afterOpenCs = summary(await prof());

      // 走到有比賽的日子：MOBA 與 CS 都可能擋住；只用「前往下一站」
      await home();
      r.q2.nextStopWithBoth = await text("home-next-stop");
      const seen = [];
      for (let i = 0; i < 12; i++) {
        const before = (await prof())?.meta?.days;
        await click("home-advance-next");
        await sleep(900);
        const after = (await prof())?.meta?.days;
        seen.push(`${before}→${after}`);
        if (after === before) break;
      }
      r.q2.advanceSteps = seen;
      r.q2.blockedAt = summary(await prof());
      r.q2.nextStopWhenBlocked = await text("home-next-stop");

      // ── Q3 ──
      await click("home-mode-bracket");
      await waitFor("competition-hub-tabs", 30000);
      await sleep(800);
      const tabButtons = () => ev("return JSON.stringify([...document.querySelectorAll('" + tid("competition-hub-panel") + " button')].map((b)=>(b.innerText||'').replace(/\\s+/g,' ').slice(0,28)).filter(Boolean).slice(0,24));");
      await click("competition-hub-tab-moba");
      await sleep(900);
      r.q3 = { mobaButtons: await tabButtons() };
      await click("competition-hub-tab-cs");
      await sleep(900);
      r.q3.csButtons = await tabButtons();
      r.q3.csToday = await text("cs-league-today");
      const canPlay = await exists("cs-league-play");
      r.q3.csPlayButton = canPlay;
      if (canPlay) {
        await click("cs-league-play");
        await sleep(1500);
        r.q3.csPlayError = await text("cs-hub-error");
        r.q3.stillOnHub = await exists("cs-league-play");
        r.q3.afterPlay = summary(await prof());
      }
      // ── Q4：卡在 CS 比賽日，玩家有沒有路走 ──
      r.q4 = {};
      await ev("window.confirm = () => true; return JSON.stringify(1);");
      await click("competition-hub-tab-moba");
      await sleep(900);
      const forfeited = await ev("const b=[...document.querySelectorAll('" + tid("competition-hub-panel") + " button')].find((x)=>(x.innerText||'').trim()==='棄權'); if(b) b.click(); return JSON.stringify(!!b);");
      await sleep(1200);
      r.q4.mobaForfeitClicked = forfeited;
      await home();
      const before = (await prof())?.meta?.days;
      await click("home-advance-next");
      await sleep(1000);
      r.q4.afterMobaForfeit = { before, after: (await prof())?.meta?.days, nextStop: await text("home-next-stop") };
      await click("home-mode-cs");
      await sleep(1500);
      r.q4.prepOpened = await ev("return JSON.stringify((document.body.innerText||'').replace(/\\s+/g,' ').slice(0,160));");
      const auto = await ev("const b=[...document.querySelectorAll('button')].find((x)=>(x.innerText||'').includes('自動')); if(b) b.click(); return JSON.stringify(b ? b.innerText : null);");
      await sleep(1000);
      r.q4.autoFillButton = auto;
      r.q4.afterAutoFill = summary(await prof());
      await home();
      await click("home-mode-bracket");
      await waitFor("competition-hub-tabs", 30000);
      await sleep(800);
      await click("competition-hub-tab-cs");
      await sleep(900);
      await click("cs-league-play");
      await sleep(1800);
      r.q4.retryError = await text("cs-hub-error");
      r.q4.retryLeftHub = !(await exists("cs-league-play"));
      r.q4.retryScreen = await ev("return JSON.stringify((document.body.innerText||'').replace(/\\s+/g,' ').slice(0,160));");
      const errs = chrome.pageErrors.length;
      r.pageErrorsSoFar = errs;
    }
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    ck("W0 UI 盤點跑完", true);
  },
});
await finishGate(result);
process.exit(0);
