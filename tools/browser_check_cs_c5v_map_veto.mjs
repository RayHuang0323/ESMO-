#!/usr/bin/env node
// CS-C5V browser smoke：中文 UI、Practice 三圖、matchmaking intersection、BO1/BO3、390px、Battle handoff。
import { launchChrome } from "./browser/cdp.mjs";

const APP = process.env.C5V_PREVIEW_URL ?? "http://127.0.0.1:5187/ESMO-/";
const CDP_PORT = 9487;
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
    if(!node||node.disabled)return {ok:false,html:document.body.innerText.slice(0,1200)};
    node.click(); return {ok:true,text:node.innerText};
  `);
  if (!result?.ok) throw new Error(`${label}: ${JSON.stringify(result)}`);
};
const readSaved = (chrome) => chrome.evaluate(`return JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})||"null")`);

let LS = null;
globalThis.localStorage = {
  getItem: (key) => (key === KEY ? LS : null),
  setItem: (key, value) => { if (key === KEY) LS = value; },
  removeItem: () => { LS = null; },
};
const { useProfileStore } = await import("../src/platform/profileStore.js");
const { csMajorFixturesOf, regularFixturesOf } = await import("../src/platform/competition/seasonState.js");
const { isFixtureTerminal } = await import("../src/platform/contracts/competition.js");
const st = () => useProfileStore.getState();

const freshSave = ({ practiceMapKey = "mirage", acceptedPool = ["dust2", "mirage", "inferno"] } = {}) => {
  st().startNewGame("standard");
  st().autoFillLineup("cs");
  st().setCsPracticeMap(practiceMapKey);
  st().setCsAcceptedMapPool(acceptedPool);
  st().save();
  return JSON.parse(LS);
};

let fixtureClock = 1_000;
const driveFixtureToLaunch = () => {
  for (let i = 0; i < 20; i += 1) {
    fixtureClock += 1500;
    st().pollMatchRoom(fixtureClock);
    const room = st().matchmaking?.room;
    if (room?.state === "ready_check" && !room.confirmations?.us) st().confirmMatchReady(fixtureClock + 1);
    if (st().matchmaking?.room?.state === "confirmed") break;
  }
  st().createMatchSession(fixtureClock + 10);
  st().launchMatchSession(fixtureClock + 20);
};

const officialSave = (format) => {
  freshSave();
  st().ensureCompetitionSeason("cs");
  let fixture = null;
  if (format === "bo1") {
    for (let i = 0; i < 120 && !fixture; i += 1) {
      fixture = st().competitionView("cs").today;
      if (!fixture) st().advanceDay(1);
    }
  } else {
    for (let i = 0; i < 400; i += 1) {
      const cs = st().competitionByMode.cs;
      if (regularFixturesOf(cs).length && regularFixturesOf(cs).every(isFixtureTerminal)) break;
      const view = st().competitionView("cs");
      if (view.today) st().forfeitFixture(view.today.id);
      else if ((st().advanceDay(1).daysAdvanced ?? 0) <= 0) break;
    }
    const cs = st().competitionByMode.cs;
    const semifinal = csMajorFixturesOf(cs).find((item) => item.playoffKey === "sf1");
    const swap = (stage) => ({ ...stage, participants: [
      { id: cs.playerTeamId, name: "我的戰隊", tag: "ME", isAi: false },
      ...stage.participants.slice(1),
    ] });
    const patched = {
      ...cs,
      fixtures: cs.fixtures.map((item) => (item.id === semifinal.id ? { ...item, sideA: cs.playerTeamId } : item)),
      competitions: Object.fromEntries(Object.entries(cs.competitions).map(([key, entry]) => [key,
        entry.stage?.id === semifinal.stageId
          ? { ...entry, stage: swap(entry.stage), playoff: { ...entry.playoff, stage: swap(entry.playoff.stage) } }
          : entry])),
    };
    st()._setCompetitionStateFor("cs", patched);
    fixture = patched.fixtures.find((item) => item.id === semifinal.id);
  }
  fixtureClock += 10_000;
  const started = st().startFixtureMatch(fixture.id, fixtureClock);
  if (!started.ok) throw new Error(`fixture ${format} start failed: ${started.reason}`);
  driveFixtureToLaunch();
  st().save();
  return { fixtureId: fixture.id, save: JSON.parse(LS) };
};

const baseSaves = {
  dust2: freshSave({ practiceMapKey: "dust2" }),
  mirage: freshSave({ practiceMapKey: "mirage" }),
  inferno: freshSave({ practiceMapKey: "inferno" }),
  general: freshSave(),
  bo1: officialSave("bo1"),
  bo3: officialSave("bo3"),
};

let pass = 0;
let fail = 0;
const evidence = { practice: [], general: null, bo1: null, bo3: null, errors: [] };
const ck = (name, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`PASS ${name}${detail ? `　${detail}` : ""}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? `　${detail}` : ""}`); }
};

const inject = async (chrome, save, viewport = { width: 1280, height: 900, mobile: false }) => {
  await chrome.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
  await chrome.navigate(APP);
  await chrome.evaluate(`localStorage.setItem(${JSON.stringify(KEY)},${JSON.stringify(JSON.stringify(save))});sessionStorage.clear();return true;`);
  await chrome.reload();
  await waitFor(chrome, `document.querySelector('[data-testid="home-mode-cs"]')||document.querySelector('[data-testid="resume-active-match"]')`, 30_000, "dashboard");
};

const enterCsPrep = async (chrome) => {
  await click(chrome, '[data-testid="home-mode-cs"]', "CS entry");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "CS prep");
};

const waitReadyAndConfirm = async (chrome) => {
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action==="confirm"||document.querySelector('[data-testid="cs-map-selection-kind"]')`, 60_000, "ready check");
  const action = await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action||null`);
  if (action === "confirm") await click(chrome, '[data-testid="prep-primary-action"]', "ready confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-map-selection-kind"]')`, 45_000, "map screen");
};

const enterBattleFromMap = async (chrome) => {
  await click(chrome, '[data-testid="cs-map-confirm"]', "map confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-tactic-confirm"]')`, 30_000, "tactic screen");
  await click(chrome, '[data-testid="cs-tactic-confirm"]', "tactic confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')`, 45_000, "Battle");
};

let chrome = null;
try {
  chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });
  for (const mapKey of ["dust2", "mirage", "inferno"]) {
    const mobile = mapKey === "inferno";
    await inject(chrome, baseSaves[mapKey], mobile
      ? { width: 390, height: 844, mobile: true }
      : { width: 1280, height: 900, mobile: false });
    await enterCsPrep(chrome);
    ck(`Practice ${mapKey} 賽前直選按鈕存在`, await chrome.evaluate(`return document.querySelector('[data-testid="cs-practice-map-${mapKey}"]')?.getAttribute('aria-pressed')==="true"`));
    await click(chrome, '[data-testid="prep-start-practice"]', `start ${mapKey} practice`);
    await waitReadyAndConfirm(chrome);
    ck(`Practice ${mapKey} Session selection 呈現正確`, await chrome.evaluate(`return document.querySelector('[data-map-key="${mapKey}"]')?.dataset.vetoState==="selected"`));
    await enterBattleFromMap(chrome);
    const saved = await readSaved(chrome);
    const viewport = await chrome.evaluate(`return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,text:document.body.innerText.slice(0,500)}`);
    ck(`Practice ${mapKey} 正確傳入 Battle`, saved.matchmaking.session.activeMatch.config.csConfig.mapKey === mapKey
      && viewport.text.toLowerCase().includes(mapKey === "dust2" ? "dust ii" : mapKey));
    if (mobile) ck("390px 選圖到 Battle 無頁面橫向溢出", viewport.width === 390 && !viewport.overflow);
    evidence.practice.push({ mapKey, viewport, config: saved.matchmaking.session.activeMatch.config.csConfig });
  }

  await inject(chrome, baseSaves.general);
  await enterCsPrep(chrome);
  ck("一般對戰三圖 pool checkbox 中文 UI 可見", await chrome.evaluate(`return ["dust2","mirage","inferno"].every(k=>document.querySelector('[data-testid="cs-map-pool-' + k + '"]'))`));
  await click(chrome, '[data-testid="prep-primary-action"]', "general enqueue");
  await waitReadyAndConfirm(chrome);
  ck("一般配對顯示雙方地圖池交集", await chrome.evaluate(`return Boolean(document.querySelector('[data-testid="cs-matchmaking-map-intersection"]'))`));
  const generalSaved = await readSaved(chrome);
  const generalSelection = generalSaved.matchmaking.session.mapSelection;
  ck("一般配對 final map 屬於雙方交集", generalSelection.commonPool.includes(generalSelection.finalMapKey)
    && generalSelection.playerPool.includes(generalSelection.finalMapKey)
    && generalSelection.opponentPool.includes(generalSelection.finalMapKey));
  evidence.general = generalSelection;

  for (const format of ["bo1", "bo3"]) {
    await inject(chrome, baseSaves[format].save, format === "bo1"
      ? { width: 390, height: 844, mobile: true }
      : { width: 1280, height: 900, mobile: false });
    await click(chrome, '[data-testid="resume-active-match"]', `${format} resume`);
    await waitFor(chrome, `document.querySelector('[data-testid="cs-veto-progress"]')`, 30_000, `${format} veto UI`);
    ck(`${format.toUpperCase()} 中文 Veto UI 可見`, await chrome.evaluate(`return document.body.innerText.includes("地圖 Veto")&&document.body.innerText.includes("Ban")`));
    for (let guard = 0; guard < 4; guard += 1) {
      const resolved = await chrome.evaluate(`return !document.querySelector('[data-testid="cs-map-confirm"]')?.disabled`);
      if (resolved) break;
      const result = await chrome.evaluate(`
        const node=[...document.querySelectorAll('[data-map-key]')].find(x=>!x.disabled);
        if(!node)return false;node.click();return true;
      `);
      if (!result) break;
      await sleep(200);
    }
    await waitFor(chrome, `!document.querySelector('[data-testid="cs-map-confirm"]')?.disabled`, 10_000, `${format} resolved`);
    let saved = await readSaved(chrome);
    const selection = saved.matchmaking.session.mapSelection;
    ck(`${format.toUpperCase()} Veto resolved 寫入同一 Session`, selection.status === "resolved"
      && saved.matchmaking.session.activeMatch.config.csConfig.mapKey);
    if (format === "bo1") {
      ck("BO1 雙方輪流 Ban，最後剩餘地圖為比賽地圖", selection.banned.length === 2
        && new Set(selection.banned.map((entry) => entry.side)).size === 2
        && selection.finalMapKey === selection.remaining[0]);
      ck("390px BO1 Veto 無頁面橫向溢出", await chrome.evaluate(`return innerWidth===390&&document.documentElement.scrollWidth<=innerWidth+1`));
    } else {
      ck("BO3 顯示 Pick → Pick → Decider 順序", await chrome.evaluate(`return Boolean(document.querySelector('[data-testid="cs-bo3-map-order"]'))`)
        && selection.mapOrder.length === 3 && new Set(selection.mapOrder).size === 3);
      ck("BO3 三圖池明確說明 Ban 自動略過", selection.notes.some((note) => note.includes("Ban")));
    }
    const signature = JSON.stringify({ log: selection.log, finalMapKey: selection.finalMapKey, mapOrder: selection.mapOrder });
    await chrome.reload();
    await waitFor(chrome, `document.querySelector('[data-testid="resume-active-match"]')`, 30_000, `${format} reload resume`);
    await click(chrome, '[data-testid="resume-active-match"]', `${format} reload resume click`);
    await waitFor(chrome, `document.querySelector('[data-testid="cs-map-confirm"]')`, 30_000, `${format} restored map`);
    saved = await readSaved(chrome);
    const restored = saved.matchmaking.session.mapSelection;
    ck(`${format.toUpperCase()} reload / resume 不重擲 Veto`, signature === JSON.stringify({ log: restored.log, finalMapKey: restored.finalMapKey, mapOrder: restored.mapOrder }));
    evidence[format] = restored;
  }

  evidence.errors = {
    console: chrome.consoleLines.filter((line) => line.startsWith("[error]")),
    page: chrome.pageErrors,
  };
  ck("Browser console / page errors = 0", evidence.errors.console.length === 0 && evidence.errors.page.length === 0,
    JSON.stringify(evidence.errors));
} catch (error) {
  fail += 1;
  console.error(error?.stack ?? error);
} finally {
  if (chrome) await chrome.close();
}

console.log(`\nCS-C5V browser: ${pass}/${pass + fail} PASS`);
console.log(`C5V_EVIDENCE ${JSON.stringify(evidence)}`);
if (fail) process.exit(1);
