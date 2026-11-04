#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_cs_lineup_required_bp1.mjs — Season E2E BP-1：玩家實際走一次
//
//  執行：先 build，再 node tools/browser/run-gate.mjs tools/browser_check_cs_lineup_required_bp1.mjs --timeout 1500000
//  打打包結果（vite preview），1366 與 390 各一次，每個寬度都是全新 profile 狀態：
//    N  開新局 → 賽事中心 CS 分頁 → 開始 CS 賽季 → 真 UI 走到 CS 比賽日
//    P  比賽日：沒有出戰按鈕、沒有內部錯誤，有看得懂的提示與賽前頁入口；**存檔裡先發仍是 0 人**
//    Q  進賽前頁：先發仍是 0 人（不得偷偷填）；返回會回到賽事中心 CS 分頁，提示還在
//    A  玩家自己按「自動填入」：5 人，存檔有；回賽事中心提示消失；重整後仍是 5 人
//    F  出戰：進「生涯季賽」賽前流程、選圖、戰術、真比賽、快速完成、結算
//       賽程寫入一筆賽果、入帳恰好一筆、CS 歷史恰好一筆、積分榜有這一場；重整後相同，不會再出現出戰
//    E  page／console error 0，全程沒有水平溢出
//  ⚠ 打包結果沒有 /src/，只走 DOM 與 localStorage。chrome.evaluate 字串裡不能有反引號。
// ============================================================================
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { runGate, finishGate, killProcessTree } from "./browser/harness.mjs";
import { clickFpsDNative } from "./browser/fpsReplayUiProbe.mjs";

if (!existsSync("dist/index.html")) { console.error("找不到 dist/index.html，要先 build"); process.exit(2); }
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const port = await freePort();
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore" });
const url = `http://127.0.0.1:${port}/ESMO-/`;
const t0 = Date.now();
let up = false;
while (Date.now() - t0 < 60000 && !up) { try { up = (await fetch(url)).ok; } catch { /* not yet */ } if (!up) await new Promise((r) => setTimeout(r, 500)); }
if (!up) { killProcessTree?.(preview.pid); console.error("vite preview 沒有起來"); process.exit(2); }

const J = (raw) => { const s = String(raw); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
const tid = (id) => "[data-testid=\"" + id + "\"]";

const result = await runGate({
  name: "CS 先發不足提示 BP-1",
  externalUrl: url,
  timeoutMs: 1400000,
  async run({ chrome, ck, sleep }) {
    const ev = async (body) => J(await chrome.evaluate(body));
    const has = (id) => ev("return JSON.stringify(!!document.querySelector('" + tid(id) + "'));");
    const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await ev("return JSON.stringify(Boolean(" + expr + "));"))) return true; await sleep(300); } return false; };
    const waitId = (id, ms = 30000) => waitFor("document.querySelector('" + tid(id) + "')", ms);
    const click = (id) => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};const el=[...document.querySelectorAll('" + tid(id) + "')].find(vis);if(el)el.click();return JSON.stringify(!!el);");
    const clickText = (needle) => ev("const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};const el=[...document.querySelectorAll('button')].filter(vis).find((b)=>(b.innerText||'').includes(" + JSON.stringify(needle) + "));if(el)el.click();return JSON.stringify(!!el);");
    const text = () => ev("return JSON.stringify(document.body.innerText||'');");
    const overflow = () => ev("return JSON.stringify(Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);");
    const prof = async () => J(await ev("return JSON.stringify(localStorage.getItem('esmo.profile.v1'));"));
    const seats = (p) => Object.values(p?.csLineup ?? {}).filter(Boolean).length;
    const home = async () => { await chrome.navigate(url); await waitId("home-mode-moba", 90000); await sleep(600); };
    const toCsTab = async () => { await click("home-mode-bracket"); await waitId("competition-hub-tabs"); await sleep(600); await click("competition-hub-tab-cs"); await sleep(800); };
    chrome.on("Page.javascriptDialogOpening", (p) => { chrome.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); console.log("dialog:", p.type, String(p.message).slice(0, 40)); });

    for (const [label, w, h, mob] of [["1366", 1366, 900, false], ["390", 390, 844, true]]) {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
      await chrome.navigate(url); await sleep(1500);
      await ev("localStorage.clear(); return JSON.stringify(1);");

      // ── N ──
      await home();
      await toCsTab();
      ck(`N1[${label}] 有開季按鈕`, await has("cs-hub-no-season"));
      await ev("const b=document.querySelector('" + tid("cs-hub-no-season") + " button'); if(b) b.click(); return JSON.stringify(!!b);");
      await sleep(900);
      ck(`N2[${label}] 開季不會順便填人`, seats(await prof()) === 0);
      // 走到 CS 比賽日：MOBA 擋路時用既有的棄權鈕，這裡要驗的是 CS。
      let onDay = false;
      for (let i = 0; i < 30 && !onDay; i++) {
        await home();
        const before = (await prof())?.meta?.days;
        await click("home-advance-next");
        await sleep(900);
        const after = (await prof())?.meta?.days;
        if (after !== before) continue;
        await toCsTab();
        if (await has("cs-league-today")) { onDay = true; break; }
        await click("competition-hub-tab-moba");
        await sleep(900);
        await ev("window.confirm = () => true; const b=[...document.querySelectorAll('" + tid("competition-hub-panel") + " button')].find((x)=>(x.innerText||'').trim()==='棄權'); if(b) b.click(); return JSON.stringify(!!b);");
        await sleep(1000);
      }
      ck(`N3[${label}] 真 UI 走到 CS 比賽日`, onDay, `第 ${(await prof())?.meta?.days} 天`);
      if (!onDay) continue;

      // ── P ──
      const txBefore = Object.keys((await prof())?.processedMatchTransactions ?? {}).length;
      ck(`P1[${label}] 先發全空時沒有出戰按鈕`, !(await has("cs-league-play")));
      ck(`P2[${label}] 有提示`, await has("cs-hub-lineup-required"));
      ck(`P3[${label}] 看不到內部錯誤文字`, !(await text()).includes("申請單"));
      ck(`P4[${label}] 提示講得出目前人數與下一步`, /CS 先發還沒排好（目前 0 \/ 5 人）/.test(await text()) && (await text()).includes("自動填入"));
      const btn = await ev("const r=document.querySelector('" + tid("cs-hub-open-prep") + "').getBoundingClientRect();return JSON.stringify({w:r.width,h:r.height});");
      ck(`P5[${label}] 入口按鈕至少 44px 高`, btn?.h >= 44, JSON.stringify(btn));
      ck(`P6[${label}] 沒有水平溢出`, (await overflow()) <= 1, String(await overflow()));
      ck(`P7[${label}] 存檔裡先發仍是 0 人`, seats(await prof()) === 0);

      // ── Q ──
      await click("cs-hub-open-prep");
      ck(`Q1[${label}] 進 CS 賽前頁`, await waitId("prep-primary-action"));
      ck(`Q2[${label}] 賽前頁有回賽事中心的說明`, await has("cs-prep-from-hub"));
      ck(`Q3[${label}] 進賽前頁也沒有偷偷填人`, seats(await prof()) === 0);
      ck(`Q4[${label}] 賽前頁沒有水平溢出`, (await overflow()) <= 1, String(await overflow()));
      await click("cs-prep-return-hub");
      ck(`Q5[${label}] 返回賽事中心，停在 CS 分頁`, await waitFor("document.querySelector('" + tid("competition-hub-panel") + "')?.dataset.mode==='cs'", 15000));
      ck(`Q6[${label}] 沒排人回來，提示還在`, await has("cs-hub-lineup-required"));

      // ── A ──
      await click("cs-hub-open-prep");
      await waitId("prep-primary-action");
      await sleep(500);
      ck(`A1[${label}] 按得到自動填入`, await clickText("自動填入"));
      await sleep(800);
      ck(`A2[${label}] 玩家按下去之後才有 5 人，存檔有`, seats(await prof()) === 5, `${seats(await prof())} 人`);
      await click("cs-prep-return-hub");
      await waitFor("document.querySelector('" + tid("competition-hub-panel") + "')?.dataset.mode==='cs'", 15000);
      await sleep(500);
      ck(`A3[${label}] 提示消失`, !(await has("cs-hub-lineup-required")));
      ck(`A4[${label}] 出戰按鈕回來了`, await has("cs-league-play"));
      await home();
      ck(`A5[${label}] 重整後仍是 5 人`, seats(await prof()) === 5);
      await toCsTab();
      ck(`A6[${label}] 重整後可以出戰`, await has("cs-league-play"));

      // ── F ──
      const p0 = await prof();
      const fixtureIdBefore = (p0?.competitionByMode?.cs?.fixtures ?? []).filter((f) => f.status === "launched").length;
      await click("cs-league-play");
      ck(`F1[${label}] 出戰進賽前頁`, await waitId("prep-primary-action"));
      ck(`F2[${label}] 是「生涯季賽」，不是一般對戰`, (await text()).includes("生涯季賽"));
      ck(`F3[${label}] 從出戰進來不顯示排先發的說明`, !(await has("cs-prep-from-hub")));
      const launched = (await prof())?.competitionByMode?.cs?.fixtures?.find((f) => f.status === "launched");
      ck(`F4[${label}] 賽程進入 launched`, !!launched && fixtureIdBefore === 0, launched?.id);
      // 賽前 → 配對 → 確認 → 選圖
      const pressed = new Set();
      for (let i = 0; i < 40; i++) {
        if (await has("cs-map-confirm")) break;
        const a = await ev("const b=document.querySelector('" + tid("prep-primary-action") + "');return JSON.stringify({a:b?b.dataset.action:null,d:b?b.disabled:true});");
        if (a?.a && !a.d && !pressed.has(a.a)) { pressed.add(a.a); await clickFpsDNative({ chrome, sleep, selector: tid("prep-primary-action") }); }
        await sleep(1200);
      }
      ck(`F5[${label}] 進入選圖`, await waitId("cs-map-confirm", 60000), [...pressed].join("→"));
      // 官方 veto：輪到玩家就按第一張可按的地圖，直到可以確認
      for (let i = 0; i < 12; i++) {
        if (await ev("const b=document.querySelector('" + tid("cs-map-confirm") + "');return JSON.stringify(!!b&&!b.disabled);")) break;
        await ev("const b=[...document.querySelectorAll('button')].find((x)=>!x.disabled&&/^(Dust II|Mirage|Inferno)/.test((x.innerText||'').trim())); if(b) b.click(); return JSON.stringify(!!b);");
        await sleep(1100);
      }
      await clickFpsDNative({ chrome, sleep, selector: tid("cs-map-confirm") });
      ck(`F6[${label}] 進入戰術`, await waitId("cs-tactic-confirm", 30000));
      await clickFpsDNative({ chrome, sleep, selector: tid("cs-tactic-confirm") });
      ck(`F7[${label}] 真比賽開始`, await waitFor("document.querySelector('canvas')&&document.querySelector('[data-testid=\"cs-playback-controls\"] input[type=\"range\"]')", 240000));
      await sleep(1200);
      await clickFpsDNative({ chrome, sleep, selector: tid("quick-finish-match") });
      const finished = await waitFor("[...document.querySelectorAll('button')].some((b)=>b.textContent.includes('查看賽後戰報'))", 60000);
      ck(`F8[${label}] 快速完成到終局`, finished);
      if (!finished) continue;
      await clickText("查看賽後戰報");
      ck(`F9[${label}] 結算頁`, await waitFor("[...document.querySelectorAll('button')].some((b)=>b.textContent.trim().startsWith('返回'))", 30000));
      await sleep(1500);
      const after = await prof();
      const fx = (after?.competitionByMode?.cs?.fixtures ?? []).find((f) => f.id === launched?.id);
      const outcomes = Object.values(after?.competitionByMode?.cs?.outcomes ?? {}).filter((o) => o?.fixtureId === launched?.id);
      ck(`F10[${label}] 賽程收尾、賽果恰好一筆`, ["completed", "forfeited"].includes(fx?.status) && outcomes.length === 1, `${fx?.status} ${outcomes.length} 筆 來源 ${outcomes[0]?.resultSource}`);
      ck(`F11[${label}] 賽果來自引擎，不是棄權`, outcomes[0]?.resultSource === "engine", outcomes[0]?.resultSource);
      ck(`F12[${label}] 入帳恰好多一筆`, Object.keys(after?.processedMatchTransactions ?? {}).length === txBefore + 1, `${txBefore} → ${Object.keys(after?.processedMatchTransactions ?? {}).length}`);
      ck(`F13[${label}] CS 歷史恰好一筆`, (after?.csHistory ?? []).length === 1);
      await home();
      const reloaded = await prof();
      ck(`F14[${label}] 重整後賽果、入帳、歷史都沒變`, JSON.stringify(reloaded?.competitionByMode?.cs?.outcomes) === JSON.stringify(after?.competitionByMode?.cs?.outcomes) && JSON.stringify(reloaded?.processedMatchTransactions) === JSON.stringify(after?.processedMatchTransactions) && (reloaded?.csHistory ?? []).length === 1);
      await toCsTab();
      ck(`F15[${label}] 這場不會再出現出戰`, !(await has("cs-league-play")));
      ck(`F16[${label}] 積分榜讀得到這一場`, await has("cs-hub-my-record"), (await ev("const e=document.querySelector('" + tid("cs-hub-my-record") + "');return JSON.stringify(e?e.innerText.replace(/\\s+/g,' ').slice(0,60):null);")) ?? "");
    }
    const errs = chrome.consoleLines.filter((l) => l.startsWith("[error]"));
    ck("E1 page error 0", chrome.pageErrors.length === 0, chrome.pageErrors.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0", errs.length === 0, errs.slice(0, 4).join(" ¦ ").slice(0, 500));
  },
});
killProcessTree?.(preview.pid);
try { preview.kill(); } catch { /* best effort */ }
await finishGate(result);
