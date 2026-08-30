#!/usr/bin/env node
// C5V owner acceptance fixes: no-query C2C Battle, MOBA hero-grid wheel, loading resume, Chinese tactic copy.
import { launchChrome } from "./browser/cdp.mjs";

const APP = process.env.C5V_PREVIEW_URL ?? "http://127.0.0.1:5187/ESMO-/";
const CDP_PORT = 9492;
const KEY = "esmo.profile.v1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (chrome, expression, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return; } catch {}
    await sleep(200);
  }
  throw new Error(`${label} timeout`);
};
const click = async (chrome, selector, label) => {
  const result = await chrome.evaluate(`
    const node=document.querySelector(${JSON.stringify(selector)});
    if(!node||node.disabled)return {ok:false,text:document.body.innerText.slice(0,1200)};
    node.click();return {ok:true,text:node.innerText};
  `);
  if (!result?.ok) throw new Error(`${label}: ${JSON.stringify(result)}`);
};

let LS = null;
globalThis.localStorage = {
  getItem: (key) => (key === KEY ? LS : null),
  setItem: (key, value) => { if (key === KEY) LS = value; },
  removeItem: () => { LS = null; },
};
const { useProfileStore } = await import("../src/platform/profileStore.js");
const st = () => useProfileStore.getState();

let clock = Date.now();
const freshSave = (mode) => {
  st().startNewGame("standard");
  st().autoFillLineup(mode);
  st().save();
  return JSON.parse(LS);
};
const launchPractice = (mode) => {
  freshSave(mode);
  clock += 10_000;
  const started = st().startPracticeMatch(mode, clock);
  if (!started.ok) throw new Error(`${mode} practice start failed: ${started.reason}`);
  for (let i = 0; i < 30; i += 1) {
    clock += 1_500;
    st().pollMatchRoom(clock);
    const room = st().matchmaking?.room;
    if (room?.state === "ready_check" && !room.confirmations?.us) st().confirmMatchReady(clock + 1);
    if (st().matchmaking?.room?.state === "confirmed") break;
  }
  const made = st().createMatchSession(clock + 10);
  if (!made.ok) throw new Error(`${mode} session failed: ${JSON.stringify(made.errors)}`);
  const launched = st().launchMatchSession(clock + 20);
  if (!launched.ok) throw new Error(`${mode} launch failed: ${JSON.stringify(launched.errors)}`);
};
const mobaBanpickSave = () => {
  launchPractice("moba");
  st().setActiveMatchContext({ phase: "banpick", now: clock + 30 });
  st().save();
  return JSON.parse(LS);
};
const csLoadingSave = () => {
  launchPractice("cs");
  const view = st().activeMatchView(clock + 30);
  st().setActiveMatchContext({
    phase: "loading",
    config: { csConfig: { ...(view?.config?.csConfig ?? {}), tactic: "default", tacticalLayout: {} } },
    now: clock + 40,
  });
  st().save();
  return JSON.parse(LS);
};

const saves = { general: freshSave("cs"), moba: mobaBanpickSave(), loading: csLoadingSave() };
const inject = async (chrome, save, viewport = { width: 1280, height: 900, mobile: false }) => {
  await chrome.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
  await chrome.navigate(APP);
  await chrome.evaluate(`localStorage.setItem(${JSON.stringify(KEY)},${JSON.stringify(JSON.stringify(save))});sessionStorage.clear();return true;`);
  await chrome.reload();
  await waitFor(chrome, `document.querySelector('[data-testid="home-mode-cs"]')||document.querySelector('[data-testid="resume-active-match"]')`, 30_000, "dashboard");
};

let pass = 0;
let fail = 0;
const evidence = {};
const ck = (name, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`PASS ${name}${detail ? ` ${detail}` : ""}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? ` ${detail}` : ""}`); }
};

let chrome = null;
try {
  chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });

  // Real general-match flow all the way to Battle, intentionally without fpsRigged/fpsC2cHero query params.
  await inject(chrome, saves.general);
  await click(chrome, '[data-testid="home-mode-cs"]', "CS entry");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "CS prep");
  await click(chrome, '[data-testid="prep-primary-action"]', "general enqueue");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action==="confirm"`, 60_000, "ready check");
  await click(chrome, '[data-testid="prep-primary-action"]', "ready confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-map-confirm"]')`, 45_000, "map select");
  await click(chrome, '[data-testid="cs-map-confirm"]', "map confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-tactic-confirm"]')`, 30_000, "tactic select");
  const tacticCopy = await chrome.evaluate(`return document.body.innerText`);
  await click(chrome, '[data-testid="cs-tactic-confirm"]', "tactic confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')`, 45_000, "Battle");
  await waitFor(chrome, `window.__ESMO_FPS_C2A__&&Object.keys(window.__ESMO_FPS_C2A__.players||{}).length===10&&Object.values(window.__ESMO_FPS_C2A__.players).every(p=>p.mode!=="loading")`, 45_000, "C2 diagnostics");
  evidence.c2c = await chrome.evaluate(`return window.__ESMO_FPS_C2A__`);
  ck("一般對戰 no-query 10/10 正式 rigged", evidence.c2c.rigged === 10 && evidence.c2c.fallback === 0, JSON.stringify({ rigged: evidence.c2c.rigged, fallback: evidence.c2c.fallback, failed: evidence.c2c.failed }));
  ck("一般對戰 no-query 10/10 C2C art", Object.values(evidence.c2c.players).every((player) => player.c2cHero === true));
  ck("戰術中文不再顯示『下包』", !tacticCopy.includes("下包"));

  // Restore a real MOBA ActiveMatch directly to BanPick, then use an actual CDP wheel event.
  await inject(chrome, saves.moba);
  await click(chrome, '[data-testid="resume-active-match"]', "MOBA resume");
  await waitFor(chrome, `document.querySelector('[data-testid="hero-grid-scroll"]')`, 60_000, "MOBA hero picker");
  const before = await chrome.evaluate(`
    const n=document.querySelector('[data-testid="hero-grid-scroll"]');
    const r=n.getBoundingClientRect();
    return {scrollTop:n.scrollTop,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,x:r.left+r.width/2,y:r.top+r.height/2,count:document.querySelectorAll('[data-testid="hero-card"]').length};
  `);
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: before.x, y: before.y });
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.x, y: before.y, deltaX: 0, deltaY: 640 });
  await sleep(500);
  const after = await chrome.evaluate(`
    const n=document.querySelector('[data-testid="hero-grid-scroll"]');
    return {scrollTop:n.scrollTop,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,lastVisible:[...document.querySelectorAll('[data-testid="hero-card"]')].at(-1)?.getBoundingClientRect().bottom<=n.getBoundingClientRect().bottom+1};
  `);
  evidence.mobaScroll = { before, after };
  ck("MOBA 英雄列表具有多列可捲內容", before.count > 5 && before.scrollHeight > before.clientHeight, JSON.stringify(before));
  ck("MOBA 滑鼠滾輪可向下捲", after.scrollTop > before.scrollTop, JSON.stringify({ before: before.scrollTop, after: after.scrollTop }));
  await chrome.evaluate(`const n=document.querySelector('[data-testid="hero-grid-scroll"]');n.scrollTop=n.scrollHeight;return true;`);
  await sleep(200);
  ck("MOBA 可瀏覽到最後一排", await chrome.evaluate(`
    const n=document.querySelector('[data-testid="hero-grid-scroll"]');
    const last=[...document.querySelectorAll('[data-testid="hero-card"]')].at(-1);
    return last.getBoundingClientRect().bottom<=n.getBoundingClientRect().bottom+2;
  `));

  // Reproduce leaving during the loading phase: reload, return through the canonical resume action.
  await inject(chrome, saves.loading);
  await click(chrome, '[data-testid="resume-active-match"]', "CS loading resume");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')`, 45_000, "resumed Battle");
  evidence.resume = await chrome.evaluate(`return {overlay:document.body.innerText.includes("正在載入比賽狀況"),phase:JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).matchmaking.session.activeMatch.phase}`);
  ck("CS loading 離開再回來不會無限遮罩", !evidence.resume.overlay && evidence.resume.phase === "battle", JSON.stringify(evidence.resume));

  const errors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
  evidence.errors = errors;
  ck("browser console/page errors = 0", errors.console.length === 0 && errors.page.length === 0, JSON.stringify(errors));
} catch (error) {
  fail += 1;
  console.error(error?.stack ?? error);
} finally {
  if (chrome) await chrome.close();
}

console.log(`\nC5V acceptance fixes browser: ${pass}/${pass + fail} PASS`);
console.log(`C5V_FIX_EVIDENCE ${JSON.stringify(evidence)}`);
if (fail) process.exit(1);
