#!/usr/bin/env node
// ============================================================================
//  hotfix/cs-loading-rest-ux 瀏覽器驗收（dev server；桌機 1366×900 ＋ 390×844）
//
//  執行：node tools/browser/run-gate.mjs tools/browser_check_hotfix_cs_loading_rest_ux.mjs --timeout 1500000
//
//  ⚠ 只走 UI ＋ localStorage（存檔在 Node 端用正式 profileStore 產生）。
//  ⚠ evaluate 字串不可含反引號。
//
//  情境（每個 viewport 都重注入）：5 名選手
//    p0 體力 0  沒課       p1 體力 12 沒課       p4 體力 35 沒課
//    p2 體力 20 訓練中：精準射擊訓練（剩 2 天）   p3 體力 30 已安排休息（剩 1 天）
//
//    D  首頁提醒只算可安排的 3 人（另 2 人已有安排）→ 面板：每列狀態講清楚、可安排的可以勾、
//       已安排的不能 double-book 但有「調整」；單選 1 人 → 多選 2 人 → 全部已安排 ⇒ 提醒消失。
//       全選只選可安排的 3 人；「調整」⇒ 訓練中心。體力不被直接改、遊戲日期不前進。
//    P  Player Detail：低體力沒課 ⇒ 明顯的「安排休息」→ 變成「已安排休息」＋調整；
//       訓練中的人 ⇒「訓練中：課名（剩 N 天）」＋調整 ⇒ 訓練中心。
//    C  CS 第一次進場：Loading 畫面等 rigged 角色就緒才放行；Battle 第一個 frame 就是 10 名 rigged（pending 0）。
//    X  page error 0、console error 0
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/hotfix-cs-loading-rest-ux";
mkdirSync(OUT, { recursive: true });
const KEY = "esmo.profile.v1";

let savedJson = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? savedJson : null),
  setItem: (k, v) => { if (k === KEY) savedJson = String(v); },
  removeItem: (k) => { if (k === KEY) savedJson = null; },
  clear: () => { savedJson = null; },
};
const { useProfileStore } = await import("../src/platform/profileStore.js");
const st = () => useProfileStore.getState();
st().startNewGame("standard");
st().autoFillLineup("moba");
st().autoFillLineup("cs");
st().setCsPracticeMap("dust2");
st().setCsAcceptedMapPool(["dust2", "mirage", "inferno"]);
st().save();
const SAVE = JSON.parse(savedJson);
const P = SAVE.players.slice(0, 5).map((p) => p.id);
const SETUP = [
  { energy: 0, training: null }, { energy: 12, training: null },
  { energy: 20, training: { courseId: "aim", daysLeft: 2, totalDays: 3 } },
  { energy: 30, training: { courseId: "rest", daysLeft: 1, totalDays: 1 } },
  { energy: 35, training: null },
];
SAVE.players.forEach((p) => {
  const i = P.indexOf(p.id);
  if (i >= 0) Object.assign(p, SETUP[i]);
  else p.energy = 90;
});
const SAVE_TEXT = JSON.stringify(SAVE);
const FREE = [P[0], P[1], P[4]];

const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

const result = await runGate({
  name: "Hotfix CS loading ＋ rest UX", timeoutMs: 1_450_000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); try { return JSON.parse(r); } catch { try { return JSON.parse(r.replace(/^"|"$/g, "")); } catch { return r; } } };
    const wait = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁中 */ } await sleep(250); } return false; };
    const click = (sel) => ev(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el&&!el.disabled) el.click(); return JSON.stringify(!!el&&!el.disabled);");
    const clickText = (t) => ev(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const readSave = async () => { const v = await ev("return localStorage.getItem(" + JSON.stringify(KEY) + ") || 'null';"); return typeof v === "string" ? JSON.parse(v) : v; };
    const bookingOf = (s, id) => s?.players?.find((p) => p.id === id)?.training?.courseId ?? null;
    const energies = (s) => P.map((id) => s?.players?.find((p) => p.id === id)?.energy).join("/");
    //  ⚠ 注入存檔要在 app script **之前**：上一頁離開時的保底 flush（pagehide）會把記憶體裡的舊狀態
    //    寫回 localStorage，先寫後 reload 會被蓋掉。改用 addScriptToEvaluateOnNewDocument，
    //    網址帶 nonce 才注入、sessionStorage 記住已注入（同網址 reload 不會重注）。
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source:
      "(function(){try{var m=/[?&]esmoInject=(\\d+)/.exec(location.search);" +
      "if(m&&sessionStorage.getItem('esmoInjected')!==m[1]){localStorage.clear();" +
      "localStorage.setItem(" + JSON.stringify(KEY) + "," + JSON.stringify(SAVE_TEXT) + ");sessionStorage.setItem('esmoInjected',m[1]);}}catch(e){}})();" });
    let nonce = 0;
    const inject = async () => {
      nonce += 1;
      await chrome.navigate(url + "?esmoInject=" + nonce);
      return wait("q('[data-testid=\"home-mode-moba\"]')", 90000);
    };
    const rows = () => ev("return JSON.stringify([...document.querySelectorAll('[data-testid=rest-player-row]')].map(r=>{const c=r.querySelector('[data-testid=rest-player-check]'); const s=r.querySelector('[data-testid=rest-player-status]'); return {id:r.dataset.player, booking:r.dataset.booking, checked:!!(c&&c.checked), disabled:!!(c&&c.disabled), status:s?s.textContent:null, adjust:!!r.querySelector('[data-testid=rest-player-adjust]')};}));");
    const checkRow = (id) => ev("const c=document.querySelector('[data-testid=rest-player-row][data-player=\"" + id + "\"] [data-testid=rest-player-check]'); if(!c||c.disabled) return JSON.stringify(false); c.click(); return JSON.stringify(true);");
    const openPanel = async () => { await clickText("安排選手休息"); return wait("q('[data-testid=\"rest-planner\"]')", 8000); };
    const todoText = () => ev(VIS + "const b=[...document.querySelectorAll('button')].filter(vis).find(x=>(x.innerText||'').includes('安排選手休息')); return JSON.stringify(b?b.innerText.replace(/\\s+/g,' '):null);");

    for (const vp of [
      { label: "Desktop", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false },
      { label: "390", width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    ]) {
      const L = vp.label;
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile });

      // ── D1：狀態、單選、多選 ─────────────────────────────────────────────
      ck(`${L}｜D0 首頁載入`, await inject());
      const s0 = await readSave();
      const todo = await todoText();
      ck(`${L}｜D1 首頁提醒只算可安排的 3 人（另 2 人已有安排）`, !!todo && /3 人體力偏低/.test(todo) && /另 2 人已有安排/.test(todo), String(todo));
      ck(`${L}｜D2 打開體力管理面板`, await openPanel());
      let r = await rows();
      const byId = Object.fromEntries(r.map((x) => [x.id, x]));
      ck(`${L}｜D3 五人都列出，狀態分類正確（可安排 3／休息 1／訓練 1）`,
        r.length === 5 && FREE.every((id) => byId[id]?.booking === "free") && byId[P[3]]?.booking === "rest" && byId[P[2]]?.booking === "training",
        r.map((x) => `${x.id}:${x.booking}`).join(" "));
      ck(`${L}｜D4 已安排的人講清楚是什麼（不是模糊的「已安排」）`,
        byId[P[3]]?.status === "已安排休息（剩 1 天）" && byId[P[2]]?.status === "訓練中：精準射擊訓練（剩 2 天）",
        `${byId[P[3]]?.status}／${byId[P[2]]?.status}`);
      ck(`${L}｜D5 可安排的人可以勾（預設已勾），已安排的人不能重複安排但有「調整」`,
        FREE.every((id) => !byId[id].disabled && byId[id].checked) && [P[2], P[3]].every((id) => byId[id].disabled && !byId[id].checked && byId[id].adjust));
      const summary = await ev("return JSON.stringify((document.querySelector('[data-testid=rest-planner-summary]')||{}).textContent||null);");
      ck(`${L}｜D6 面板摘要`, /可安排 3/.test(String(summary)) && /已安排休息 1/.test(String(summary)) && /訓練中 1/.test(String(summary)), String(summary));
      await shot(`${L}-rest-panel-initial`);
      //  全選是「只選可安排的人」：取消全選 → 0；再全選 → 3（已安排的不會被勾）
      await click('[data-testid="rest-select-all"]'); await sleep(200);
      r = await rows();
      ck(`${L}｜D7 取消全選 ⇒ 0 人`, r.every((x) => !x.checked));
      await click('[data-testid="rest-select-all"]'); await sleep(200);
      r = await rows();
      ck(`${L}｜D8 全選只選可安排的 3 人`, r.filter((x) => x.checked).map((x) => x.id).sort().join() === [...FREE].sort().join());
      //  單選：清空 → 勾 p0 → 安排
      await click('[data-testid="rest-select-all"]'); await sleep(200);
      ck(`${L}｜D9 單選 1 人`, await checkRow(P[0]));
      await click('[data-testid="rest-assign"]'); await sleep(400);
      let s1 = await readSave();
      const res1 = await ev("return JSON.stringify((document.querySelector('[data-testid=rest-planner-result]')||{}).textContent||null);");
      ck(`${L}｜D10 單選安排：只有 p0 變成休息`, bookingOf(s1, P[0]) === "rest" && bookingOf(s1, P[1]) === null && bookingOf(s1, P[4]) === null && /已安排 1 人/.test(String(res1)), String(res1));
      r = await rows();
      ck(`${L}｜D11 p0 那一列立刻變成「已安排休息」`, r.find((x) => x.id === P[0])?.booking === "rest");
      //  多選：勾 p1 ＋ p4 → 安排
      ck(`${L}｜D12 多選 2 人`, (await checkRow(P[1])) && (await checkRow(P[4])));
      await click('[data-testid="rest-assign"]'); await sleep(400);
      s1 = await readSave();
      ck(`${L}｜D13 多選安排：p1、p4 休息；訓練中的 p2 沒被改`, bookingOf(s1, P[1]) === "rest" && bookingOf(s1, P[4]) === "rest" && bookingOf(s1, P[2]) === "aim");
      ck(`${L}｜D14 全部都有安排 ⇒ 面板講清楚、全選與安排鈕停用`,
        await wait("q('[data-testid=\"rest-planner-all-booked\"]')", 3000)
        && await ev("return JSON.stringify(document.querySelector('[data-testid=rest-select-all]').disabled && document.querySelector('[data-testid=rest-assign]').disabled);"));
      ck(`${L}｜D15 體力沒有被直接改、遊戲日期沒前進`, energies(s1) === energies(s0) && s1?.meta?.days === s0?.meta?.days, `${energies(s1)}／day ${s0?.meta?.days}→${s1?.meta?.days}`);
      await shot(`${L}-rest-panel-all-booked`);
      await ev("const b=document.querySelector('.esmo-modal__close'); if(b) b.click(); return JSON.stringify(1);");
      await sleep(400);
      ck(`${L}｜D16 沒有可安排的人 ⇒ 首頁提醒消失`, (await todoText()) === null);

      // ── D2：預設全選一次安排 ＋ 調整入口 ─────────────────────────────────
      await inject();
      await openPanel();
      await click('[data-testid="rest-assign"]'); await sleep(400);
      const s2 = await readSave();
      ck(`${L}｜D17 預設全選 ⇒ 一次安排 3 人`, FREE.every((id) => bookingOf(s2, id) === "rest") && bookingOf(s2, P[2]) === "aim");
      await ev("const b=document.querySelector('[data-testid=rest-player-row][data-player=\"" + P[2] + "\"] [data-testid=rest-player-adjust]'); if(b) b.click(); return JSON.stringify(!!b);");
      ck(`${L}｜D18「調整」⇒ 訓練中心`, await wait("[...document.querySelectorAll('h1,h2,div,span')].some(e=>vis(e)&&(e.textContent||'').trim()==='訓練中心')", 8000));

      // ── P：Player Detail 快捷休息 ─────────────────────────────────────────
      await inject();
      const openProfile = async (id) => {
        await chrome.navigate(url);
        await wait("q('[data-testid=\"home-mode-moba\"]')", 60000);
        //  桌機：戰隊狀態卡「查看名單」；手機：底部「戰隊」→ sheet「選手名單」（都用 testid，不比對文字）
        if (vp.mobile) {
          await click('[data-testid="home-nav-team"]');
          await wait("q('[data-testid=\"home-sheet-roster\"]')", 5000);
          await click('[data-testid="home-sheet-roster"]');
        } else {
          //  桌機：戰隊狀態卡「查看名單」。⚠ 這張卡有 reveal 動畫，捲進畫面前文字是空的 ⇒ 用 textContent 找、先捲過去再點
          const hit = await ev("const b=[...document.querySelectorAll('button.esmo-status-card__link')].find(x=>(x.textContent||'').includes('查看名單')); if(b){b.scrollIntoView({block:'center'}); b.click();} return JSON.stringify(!!b);");
          if (!hit) console.log("[openProfile] 找不到「查看名單」：" + JSON.stringify(await ev(VIS + "return JSON.stringify([...document.querySelectorAll('button')].filter(vis).map(b=>(b.innerText||'').replace(/\s+/g,' ').slice(0,16)).slice(0,40));")));
        }
        if (!(await wait("q('[data-testid=\"roster-player-" + id + "\"]')", 15000))) { console.log("[openProfile] 名單列沒出現 " + id); return false; }
        await ev("document.querySelector('[data-testid=\"roster-player-" + id + "\"]').click(); return JSON.stringify(1);");
        await sleep(500);
        const opened = await clickText("開啟完整選手檔案");
        if (!opened) console.log("[openProfile] 找不到「開啟完整選手檔案」");
        return wait("document.querySelectorAll('[data-testid^=\"player-profile-tab-\"]').length === 4", 10000);
      };
      ck(`${L}｜P0 開啟低體力選手 p0 的完整檔案`, await openProfile(P[0]));
      const qr = await ev(VIS + "const b=q('[data-testid=player-quick-rest]'); if(!b) return JSON.stringify(null); const r=b.getBoundingClientRect(); return JSON.stringify({text:b.textContent, emphasis:b.dataset.emphasis, h:Math.round(r.height), fs:getComputedStyle(b).fontSize});");
      ck(`${L}｜P1 低體力 ⇒ 明顯的「安排休息」（強調樣式、字 ≥ 12px）`, qr?.text === "安排休息" && qr.emphasis === "low" && parseFloat(qr.fs) >= 12, JSON.stringify(qr));
      await shot(`${L}-player-detail-rest`);
      const sp0 = await readSave();
      await click('[data-testid="player-quick-rest"]');
      ck(`${L}｜P2 點下去 ⇒ 顯示「已安排休息（剩 1 天）」＋調整`,
        await wait("q('[data-testid=\"player-rest-status\"]') && q('[data-testid=\"player-rest-status\"]').textContent === '已安排休息（剩 1 天）' && q('[data-testid=\"player-rest-adjust\"]')", 5000));
      const sp1 = await readSave();
      ck(`${L}｜P3 走正式 assignTraining：p0 訓練槽＝rest、體力不變、日期不變`,
        bookingOf(sp1, P[0]) === "rest" && energies(sp1) === energies(sp0) && sp1?.meta?.days === sp0?.meta?.days);
      ck(`${L}｜P4 開啟訓練中選手 p2 的完整檔案`, await openProfile(P[2]));
      const ts = await ev(VIS + "const s=q('[data-testid=player-rest-status]'); return JSON.stringify(s?s.textContent:null);");
      ck(`${L}｜P5 訓練中 ⇒「訓練中：精準射擊訓練（剩 2 天）」、沒有安排休息鈕`,
        ts === "訓練中：精準射擊訓練（剩 2 天）" && !(await ev(VIS + "return JSON.stringify(!!q('[data-testid=player-quick-rest]'));")), String(ts));
      await shot(`${L}-player-detail-training`);
      await click('[data-testid="player-rest-adjust"]');
      ck(`${L}｜P6「調整」⇒ 訓練中心`, await wait("[...document.querySelectorAll('h1,h2,div,span')].some(e=>vis(e)&&(e.textContent||'').trim()==='訓練中心')", 8000));

      // ── C：CS 進場（Loading 等 rigged 就緒）─────────────────────────────
      await inject();
      await chrome.evaluate("window.__ESMO_CS_LOAD_TIMING__={version:1,entries:[]}; return 1;");
      await click('[data-testid="home-mode-cs"]');
      await wait("document.querySelector('[data-testid=\"prep-start-practice\"]')", 30000);
      await click('[data-testid="prep-start-practice"]');
      await wait("document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action === 'confirm' || document.querySelector('[data-testid=\"cs-map-confirm\"]')", 30000);
      if (await ev("return JSON.stringify(document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action === 'confirm');")) await click('[data-testid="prep-primary-action"]');
      await wait("document.querySelector('[data-testid=\"cs-map-confirm\"]') && !document.querySelector('[data-testid=\"cs-map-confirm\"]').disabled", 45000);
      await click('[data-testid="cs-map-confirm"]');
      await wait("document.querySelector('[data-testid=\"cs-tactic-confirm\"]')", 30000);
      await click('[data-testid="cs-tactic-confirm"]');
      const loadingSeen = await wait("document.querySelector('[data-testid=\"cs-loading-state\"]')", 15000);
      const loadingRig = await ev("const e=document.querySelector('[data-testid=\"cs-loading-state\"]'); return JSON.stringify(e?e.dataset.rigState:null);");
      ck(`${L}｜C1 Loading 畫面帶著 rigged 就緒狀態`, loadingSeen && ["loading", "ready"].includes(loadingRig), String(loadingRig));
      const ready = await wait("(window.__ESMO_CS_LOAD_TIMING__||{entries:[]}).entries.some(x=>x.name==='battle:rigged-ready')", 150000);
      const tl = await ev("return JSON.stringify((window.__ESMO_CS_LOAD_TIMING__||{entries:[]}).entries.filter(x=>/^(battle:|ui:cs-loading)/.test(x.name)).map(x=>({n:x.name,d:x.detail})));");
      const ff = tl.find((x) => x.n === "battle:first-frame");
      const gate = tl.find((x) => /^ui:cs-loading-rig-/.test(x.n));
      ck(`${L}｜C2 Loading 等到角色資產就緒才放行（rig-ready）`, gate?.n === "ui:cs-loading-rig-ready", JSON.stringify(gate));
      ck(`${L}｜C3 Battle 第一個 frame 就是 10 名 rigged（riggedPending 0）`, ready && ff?.d?.riggedPending === 0, JSON.stringify(ff));
      await sleep(1200);
      await shot(`${L}-cs-first-frame`);
    }

    const errs = chrome.consoleLines.filter((l) => /shader error|VALIDATE_STATUS|WebGL.*error|Uncaught|TypeError|ReferenceError/i.test(JSON.stringify(l)));
    ck("X1 page error = 0", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 400));
    ck("X2 console error = 0", errs.length === 0, JSON.stringify(errs).slice(0, 400));
  },
});
await finishGate(result);
