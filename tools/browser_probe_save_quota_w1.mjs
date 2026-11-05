#!/usr/bin/env node
// ============================================================================
//  tools/browser_probe_save_quota_w1.mjs — Season E2E W1：真 Chrome 的 localStorage 配額
//
//  執行：先 build，再 node tools/browser_probe_save_quota_w1.mjs --checkpoints=<W1 的 checkpoints 資料夾> [--out=<json>]
//
//  ⚠ 盤點工具，不是 gate：不判定放行，永遠 exit 0。打本機 preview，獨立 profile。
//
//  W1 的 Node 驅動用記憶體假 localStorage，**沒有配額**，所以看不到這件事。這支回答：
//    Q1 這台 Chrome 的實際上限是多少？（一路填到丟例外）
//    Q2 W1 真 checkpoint 灌得進去嗎？從第幾天開始灌不進去？
//    Q3 把最接近上限、還灌得進去的存檔讀回來，真 UI 打一場：進度有沒有存到磁碟？玩家看得到失敗嗎？
//       存不進去的是哪一把鍵？重新整理之後剩下什麼？
//    Q4（--q4=<checkpoint 檔名>，**故障注入**）：用一把假鍵把剩餘空間填到只剩一點點，真 UI 打一場，
//       看真的超過上限時玩家看到什麼、磁碟留下什麼、重新整理後剩下什麼。Q4 不跑 Q1–Q3。
//  只測桌機 Chrome。**手機瀏覽器（特別是 iOS Safari）的上限可能不同，這裡沒有驗。**
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { runGate, finishGate, killProcessTree } from "./browser/harness.mjs";
import { clickFpsDNative } from "./browser/fpsReplayUiProbe.mjs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const CKDIR = arg("checkpoints");
if (!CKDIR || !fs.existsSync("dist/index.html")) { console.error("需要 --checkpoints，且要先 build"); process.exit(2); }
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const port = await freePort();
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore" });
const url = `http://127.0.0.1:${port}/ESMO-/`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }

const J = (raw) => { const s = String(raw); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
const tid = (id) => "[data-testid=\"" + id + "\"]";
const report = { url, checkpoints: [] };

const result = await runGate({
  name: "Save quota W1",
  externalUrl: url,
  timeoutMs: 1200000,
  async run({ chrome, ck, sleep }) {
    const ev = async (body) => J(await chrome.evaluate(body));
    const has = (id) => ev("return JSON.stringify(!!document.querySelector('" + tid(id) + "'));");
    const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev("return JSON.stringify(Boolean(" + expr + "));")) return true; await sleep(350); } return false; };
    const click = (id) => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};const el=[...document.querySelectorAll('" + tid(id) + "')].find(vis);if(el)el.click();return JSON.stringify(!!el);");
    const clickText = (s) => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};const el=[...document.querySelectorAll('button')].filter(vis).find((b)=>(b.innerText||'').includes(" + JSON.stringify(s) + "));if(el)el.click();return JSON.stringify(!!el);");
    const sizes = () => ev("const o={};let t=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);const v=localStorage.getItem(k);o[k]=v.length;t+=k.length+v.length;}return JSON.stringify({keys:o,total:t});");
    const summary = () => ev("const r=localStorage.getItem('esmo.profile.v1');if(!r)return JSON.stringify(null);const p=JSON.parse(r);return JSON.stringify({day:p.meta&&p.meta.days,tx:Object.keys(p.processedMatchTransactions||{}).length,funds:p.finance&&p.finance.funds,cs:(p.csHistory||[]).length});");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await sleep(1500);

    // ── Q4 故障注入 ──
    if (arg("q4")) {
      const c = JSON.parse(fs.readFileSync(path.join(CKDIR, arg("q4")), "utf8"));
      const q4 = report.q4 = { file: arg("q4"), day: c.day, faultInjection: true };
      q4.quota = await ev("localStorage.clear();let lo=0,hi=20000000;while(hi-lo>256){const mid=(lo+hi)>>1;try{localStorage.setItem('q','x'.repeat(mid));lo=mid;}catch(e){hi=mid;}}localStorage.clear();return JSON.stringify(lo+1);");
      await ev("const d=JSON.parse(" + JSON.stringify(JSON.stringify(c.storage)) + ");for(const k of Object.keys(d))localStorage.setItem(k,d[k]);let t=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);t+=k.length+localStorage.getItem(k).length;}const room=" + q4.quota + "-t-300;if(room>0)localStorage.setItem('w1.filler','f'.repeat(room));return JSON.stringify(t);");
      await chrome.navigate(url);
      await waitFor("document.querySelector('" + tid("home-mode-moba") + "')", 90000);
      await sleep(1500);
      q4.afterLoad = { sizes: await sizes(), summary: await summary() };
      const before = await summary();
      //  --q4-mode=cs：真 UI 打一場一般 CS。超過上限的 checkpoint 都在 CS 賽後。
      if (arg("q4-mode") === "cs") {
        chrome.on("Page.javascriptDialogOpening", () => { chrome.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); });
        q4.mode = "cs";
        const notice = async () => ({ on: await has("save-status-notice"), text: await ev("const e=document.querySelector('" + tid("save-status-notice") + "');return JSON.stringify(e?e.innerText.replace(/\\s+/g,' ').slice(0,160):null);") });
        const stageRow = async (name) => { (q4.stages ||= []).push({ name, total: (await sizes())?.total, notice: await notice(), summary: await summary() }); };
        await click("home-mode-cs");
        await waitFor("document.querySelector('" + tid("prep-primary-action") + "')", 30000);
        await sleep(700);
        await stageRow("prep");
        const pressed = new Set();
        for (let i = 0; i < 50; i++) {
          if (await has("cs-map-confirm")) break;
          const a = await ev("const b=document.querySelector('" + tid("prep-primary-action") + "');return JSON.stringify({a:b?b.dataset.action:null,d:b?b.disabled:true});");
          if (a?.a === "blocked") { await clickText("自動填入"); await sleep(700); continue; }
          if (a?.a && !a.d && !pressed.has(a.a)) { pressed.add(a.a); await clickFpsDNative({ chrome, sleep, selector: tid("prep-primary-action") }); }
          await sleep(1200);
        }
        q4.pressed = [...pressed];
        q4.reachedMap = await waitFor("document.querySelector('" + tid("cs-map-confirm") + "')", 60000);
        await stageRow("map");
        for (let i = 0; i < 12 && q4.reachedMap; i++) {
          if (await ev("const b=document.querySelector('" + tid("cs-map-confirm") + "');return JSON.stringify(!!b&&!b.disabled);")) break;
          await ev("const b=[...document.querySelectorAll('button')].find((x)=>!x.disabled&&/^(Dust II|Mirage|Inferno)/.test((x.innerText||'').trim())); if(b) b.click(); return JSON.stringify(!!b);");
          await sleep(1100);
        }
        if (q4.reachedMap) {
          await clickFpsDNative({ chrome, sleep, selector: tid("cs-map-confirm") });
          await waitFor("document.querySelector('" + tid("cs-tactic-confirm") + "')", 30000);
          await clickFpsDNative({ chrome, sleep, selector: tid("cs-tactic-confirm") });
          q4.battle = await waitFor("document.querySelector('canvas')&&document.querySelector('[data-testid=\"cs-playback-controls\"] input[type=\"range\"]')", 240000);
          await sleep(1500);
          await stageRow("battle");
          if (q4.battle) {
            await clickFpsDNative({ chrome, sleep, selector: tid("quick-finish-match") });
            q4.ended = await waitFor("[...document.querySelectorAll('button')].some((b)=>b.textContent.includes('查看賽後戰報'))", 60000);
            await clickText("查看賽後戰報");
            await sleep(3500);
            await stageRow("result");
            q4.afterMatch = { sizes: await sizes(), summary: await summary() };
            q4.resultText = await ev("const t=document.body.innerText||'';const m=t.match(/[^\\n]*(已儲存|已入帳|不重複|儲存失敗|沒有保存|沒有存)[^\\n]*/g);return JSON.stringify(m?m.slice(0,8):[]);");
            const retry = await has("save-status-retry");
            q4.retryOffered = retry;
            if (retry) { await click("save-status-retry"); await sleep(1500); q4.afterRetry = await notice(); }
          }
        }
        q4.memoryFunds = null;
        q4.before = before;
        await chrome.navigate(url);
        await waitFor("document.querySelector('" + tid("home-mode-moba") + "')", 90000);
        await sleep(1500);
        q4.afterReload = { sizes: await sizes(), summary: await summary() };
        q4.corrupt = await ev("const k=[];for(let i=0;i<localStorage.length;i++)k.push(localStorage.key(i));return JSON.stringify(k.filter((x)=>x.endsWith('.corrupt')));");
        q4.consoleErrors = chrome.consoleLines.filter((l) => l.startsWith("[error]")).slice(0, 8).map((l) => l.slice(0, 220));
        q4.pageErrors = chrome.pageErrors.slice(0, 6).map((l) => String(l).slice(0, 220));
        if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(report, null, 1));
        console.log(JSON.stringify(q4, null, 1));
        ck("Q4 量測跑完", true);
        return;
      }
      await click("home-mode-moba");
      await sleep(1000);
      const deadline = Date.now() + 150000;
      while (Date.now() < deadline) {
        if (await has("hero-grid-scroll")) break;
        if (await ev("const b=document.querySelector('" + tid("matchmaking-enter-banpick") + "');return JSON.stringify(!!b&&!b.disabled);")) { await click("matchmaking-enter-banpick"); await sleep(800); continue; }
        const a = await ev("const el=document.querySelector('" + tid("prep-primary-action") + "');return JSON.stringify({a:el?el.dataset.action:null,d:!!(el&&el.disabled)});");
        if (a?.a === "blocked") { await clickText("自動"); await sleep(700); continue; }
        if (a?.a && !a.d) { await click("prep-primary-action"); await sleep(800); continue; }
        await sleep(500);
      }
      q4.reachedDraft = await has("hero-grid-scroll");
      q4.prepNotice = await ev("const e=document.querySelector('[data-testid=\"save-status-notice\"]');return JSON.stringify(e?e.innerText.slice(0,200):null);");
      if (q4.reachedDraft) {
        for (let i = 0; i < 60; i++) {
          if (await ev("const b=document.querySelector('" + tid("confirm-draft") + "');return JSON.stringify(!!b&&!b.disabled);")) break;
          await click("hero-choose");
          await sleep(1000);
        }
        await click("confirm-draft");
        await waitFor("[...document.querySelectorAll('button')].some((b)=>(b.innerText||'').includes('開始載入'))", 60000);
        await clickText("開始載入");
        q4.battle = await waitFor("document.querySelector('" + tid("battle-hud") + "')", 240000);
        if (q4.battle) {
          await sleep(2500);
          await ev("window.confirm=()=>true;return JSON.stringify(1);");
          await click("quick-finish-match");
          q4.ended = await waitFor("[...document.querySelectorAll('button')].some((b)=>/觀看重播|無法重播/.test(b.innerText||''))||[...document.querySelectorAll('span')].some((s)=>/無法重播/.test(s.innerText||''))", 300000);
          await sleep(3000);
          q4.afterMatch = { sizes: await sizes(), summary: await summary() };
          q4.resultText = await ev("const t=document.body.innerText||'';const m=t.match(/[^\\n]*(存檔|進度|儲存|空間|沒有存)[^\\n]*/g);return JSON.stringify(m?m.slice(0,8):[]);");
        }
      }
      q4.before = before;
      await chrome.navigate(url);
      await waitFor("document.querySelector('" + tid("home-mode-moba") + "')", 90000);
      await sleep(1500);
      q4.afterReload = { sizes: await sizes(), summary: await summary() };
      q4.corrupt = await ev("const k=[];for(let i=0;i<localStorage.length;i++)k.push(localStorage.key(i));return JSON.stringify(k.filter((x)=>x.endsWith('.corrupt')));");
      q4.homeText = await ev("const t=document.body.innerText||'';const m=t.match(/[^\\n]*(存檔|進度|儲存|空間|沒有存)[^\\n]*/g);return JSON.stringify(m?m.slice(0,8):[]);");
      q4.consoleErrors = chrome.consoleLines.filter((l) => l.startsWith("[error]")).slice(0, 8).map((l) => l.slice(0, 220));
      q4.pageErrors = chrome.pageErrors.slice(0, 6).map((l) => String(l).slice(0, 220));
      if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(report, null, 1));
      console.log(JSON.stringify(q4, null, 1));
      ck("Q4 量測跑完", true);
      return;
    }

    // ── Q1 實際上限 ──
    report.quota = await ev("localStorage.clear();let lo=0,hi=20000000;const k='q';while(hi-lo>2048){const mid=(lo+hi)>>1;try{localStorage.setItem(k,'x'.repeat(mid));lo=mid;}catch(e){hi=mid;}}localStorage.clear();return JSON.stringify({chars:lo+k.length});");
    console.log("Q1 上限（字元）", JSON.stringify(report.quota));

    // ── Q2 真 checkpoint 灌不灌得進去 ──
    const files = fs.readdirSync(CKDIR).filter((f) => f.endsWith(".json")).sort();
    const picks = files.filter((f) => /every10|final|offseason-open|end|new-game/.test(f));
    let best = null;
    for (const f of picks) {
      const c = JSON.parse(fs.readFileSync(path.join(CKDIR, f), "utf8"));
      const payload = JSON.stringify(c.storage);
      const r = await ev("localStorage.clear();const d=JSON.parse(" + JSON.stringify(payload) + ");const out={ok:true,failed:null,msg:null};for(const k of ['esmo.heroProgress.v2','esmo.season.v1','esmo.profile.v1']){if(d[k]==null)continue;try{localStorage.setItem(k,d[k]);}catch(e){out.ok=false;out.failed=k;out.msg=e.name;break;}}let t=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);t+=k.length+localStorage.getItem(k).length;}out.total=t;return JSON.stringify(out);");
      const total = Object.entries(c.storage).reduce((a, [k, v]) => a + k.length + v.length, 0);
      const row = { file: f, day: c.day, total, ok: !!r?.ok, failed: r?.failed ?? null, error: r?.msg ?? null };
      report.checkpoints.push(row);
      console.log(`Q2 第 ${c.day} 天 ${total} 字元 ${row.ok ? "灌得進去" : "❌ 灌不進去：" + row.failed + " " + row.error}`);
      if (row.ok && (!best || total >= best.total)) best = { file: f, total, storage: c.storage, day: c.day };
    }
    report.firstFailure = report.checkpoints.find((x) => !x.ok) ?? null;

    // ── Q3 最接近上限的存檔，真 UI 打一場 ──
    if (best) {
      const q3 = report.q3 = { file: best.file, day: best.day, total: best.total };
      await ev("localStorage.clear();const d=JSON.parse(" + JSON.stringify(JSON.stringify(best.storage)) + ");for(const k of Object.keys(d))localStorage.setItem(k,d[k]);return JSON.stringify(1);");
      await chrome.navigate(url);
      await waitFor("document.querySelector('" + tid("home-mode-moba") + "')", 90000);
      await sleep(1500);
      q3.afterLoad = { sizes: await sizes(), summary: await summary() };
      q3.homeSaveText = await ev("const t=document.body.innerText||'';const m=t.match(/[^\\n]*(存檔|進度沒有|未儲存|儲存失敗)[^\\n]*/g);return JSON.stringify(m?m.slice(0,6):[]);");
      const before = await summary();
      await click("home-mode-moba");
      await sleep(1000);
      const deadline = Date.now() + 150000;
      while (Date.now() < deadline) {
        if (await has("hero-grid-scroll")) break;
        if (await ev("const b=document.querySelector('" + tid("matchmaking-enter-banpick") + "');return JSON.stringify(!!b&&!b.disabled);")) { await click("matchmaking-enter-banpick"); await sleep(800); continue; }
        const a = await ev("const el=document.querySelector('" + tid("prep-primary-action") + "');return JSON.stringify({a:el?el.dataset.action:null,d:!!(el&&el.disabled)});");
        if (a?.a === "blocked") { await clickText("自動"); await sleep(700); continue; }
        if (a?.a && !a.d) { await click("prep-primary-action"); await sleep(800); continue; }
        await sleep(500);
      }
      q3.reachedDraft = await has("hero-grid-scroll");
      if (q3.reachedDraft) {
        for (let i = 0; i < 60; i++) {
          if (await ev("const b=document.querySelector('" + tid("confirm-draft") + "');return JSON.stringify(!!b&&!b.disabled);")) break;
          await click("hero-choose");
          await sleep(1000);
        }
        await click("confirm-draft");
        await waitFor("[...document.querySelectorAll('button')].some((b)=>(b.innerText||'').includes('開始載入'))", 60000);
        await clickText("開始載入");
        q3.battle = await waitFor("document.querySelector('" + tid("battle-hud") + "')", 240000);
        if (q3.battle) {
          await sleep(2500);
          await ev("window.confirm=()=>true;return JSON.stringify(1);");
          await click("quick-finish-match");
          q3.ended = await waitFor("[...document.querySelectorAll('button')].some((b)=>/觀看重播|無法重播/.test(b.innerText||''))||[...document.querySelectorAll('span')].some((s)=>/無法重播/.test(s.innerText||''))", 300000);
          await sleep(2500);
          q3.afterMatch = { sizes: await sizes(), summary: await summary() };
          q3.resultSaveText = await ev("const t=document.body.innerText||'';const m=t.match(/[^\\n]*(存檔|進度沒有|未儲存|儲存失敗|空間)[^\\n]*/g);return JSON.stringify(m?m.slice(0,8):[]);");
          q3.txMovedOnDisk = q3.afterMatch.summary?.tx === (before?.tx ?? -1) + 1;
        }
      }
      q3.before = before;
      await chrome.navigate(url);
      await waitFor("document.querySelector('" + tid("home-mode-moba") + "')", 90000);
      await sleep(1500);
      q3.afterReload = { sizes: await sizes(), summary: await summary() };
      q3.corrupt = await ev("const k=[];for(let i=0;i<localStorage.length;i++)k.push(localStorage.key(i));return JSON.stringify(k.filter((x)=>x.endsWith('.corrupt')));");
      q3.homeTextAfterReload = await ev("const t=document.body.innerText||'';const m=t.match(/[^\\n]*(存檔|進度沒有|未儲存|儲存失敗|空間)[^\\n]*/g);return JSON.stringify(m?m.slice(0,8):[]);");
    }
    report.consoleErrors = chrome.consoleLines.filter((l) => l.startsWith("[error]")).slice(0, 8).map((l) => l.slice(0, 220));
    report.pageErrors = chrome.pageErrors.slice(0, 6).map((l) => String(l).slice(0, 220));
    if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(report, null, 1));
    console.log(JSON.stringify({ quota: report.quota, firstFailure: report.firstFailure, q3: report.q3, consoleErrors: report.consoleErrors, pageErrors: report.pageErrors }, null, 1));
    ck("Q 量測跑完", true);
  },
});
killProcessTree?.(preview.pid);
try { preview.kill(); } catch { /* best effort */ }
await finishGate(result);
process.exit(0);
