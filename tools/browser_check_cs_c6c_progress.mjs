#!/usr/bin/env node
// C6C browser evidence：以正式流程檢查長對局進度摘要、倍率控制、
// Practice BO1、BO3 map transition 與 reload/resume。
//
// Quick Finish 仍呼叫正式 simulation 完成剩餘對局；它不是寫入假結果。
// C6B 已保存自然完整 BO1/BO3 wall-clock evidence，本支不重跑數十分鐘級自然播放。
import { launchChrome, startDevServer } from "./browser/cdp.mjs";

const VITE_PORT = 5426;
const CDP_PORT = 9426;
const APP = `http://localhost:${VITE_PORT}/ESMO-/`;
const KEY = "esmo.profile.v1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (chrome, expression, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await chrome.evaluate(`return Boolean(${expression});`)) return true;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`${label} timeout${lastError ? `: ${lastError.message}` : ""}`);
};

const clickSelector = async (chrome, selector, label) => {
  const result = await chrome.evaluate(`
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node || node.disabled) return { ok: false, text: node?.innerText ?? null };
    node.click();
    return { ok: true, text: (node.innerText || "").replace(/\\s+/g, " ").trim() };
  `);
  if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  return result.text;
};

const clickText = async (chrome, needle, label) => {
  const result = await chrome.evaluate(`
    const target = ${JSON.stringify(needle)};
    const node = [...document.querySelectorAll("button")]
      .find((button) => !button.disabled && (button.innerText || "").replace(/\\s+/g, " ").includes(target));
    if (!node) return { ok: false, buttons: [...document.querySelectorAll("button")].map((button) => ({ text: button.innerText, disabled: button.disabled })).slice(0, 25) };
    node.click();
    return { ok: true, text: (node.innerText || "").replace(/\\s+/g, " ").trim() };
  `);
  if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  return result.text;
};

const readBrowserSave = (chrome) => chrome.evaluate(`return JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || "null");`);

const readProgress = (chrome) => chrome.evaluate(`
  const root = document.querySelector('[data-testid="cs-long-match-progress"]');
  const body = document.body;
  const speed = document.querySelector('[data-testid="match-speed-2.4"]');
  const bar = document.querySelector('[data-testid="cs-match-frame-progress"] [role="progressbar"]');
  return {
    present: Boolean(root),
    text: root?.innerText ?? "",
    map: document.querySelector('[data-testid="cs-match-map-progress"]')?.innerText ?? "",
    round: document.querySelector('[data-testid="cs-match-round-progress"]')?.innerText ?? "",
    score: document.querySelector('[data-testid="cs-match-live-score"]')?.innerText ?? "",
    sync: document.querySelector('[data-testid="cs-match-sync"]')?.innerText ?? "",
    series: document.querySelector('[data-testid="cs-match-series-progress"]')?.innerText ?? "",
    hint: document.querySelector('[data-testid="cs-long-match-hint"]')?.innerText ?? "",
    speed24Pressed: speed?.getAttribute("aria-pressed") ?? null,
    frameValue: bar?.getAttribute("aria-valuenow") ?? null,
    frameMax: bar?.getAttribute("aria-valuemax") ?? null,
    width: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth + 1 || body.scrollWidth > innerWidth + 1,
  };
`);

const injectSave = async (chrome, save, viewport) => {
  await chrome.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
  await chrome.navigate(APP);
  const serialized = JSON.stringify(save);
  await chrome.evaluate(`
    localStorage.clear();
    localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(serialized)});
    sessionStorage.clear();
    return true;
  `);
  await chrome.reload();
  await waitFor(chrome, `document.querySelector('[data-testid="home-mode-cs"]') || document.querySelector('[data-testid="resume-active-match"]')`, 30_000, "dashboard");
};

const enterPrep = async (chrome) => {
  await clickSelector(chrome, '[data-testid="home-mode-cs"]', "CS entry");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "CS prep");
  const action = await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action ?? null;`);
  if (action === "blocked") {
    await clickText(chrome, "自動", "CS auto-fill");
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action !== "blocked"`, 15_000, "CS lineup ready");
  }
};

const enterPracticeBattle = async (chrome) => {
  await enterPrep(chrome);
  await clickSelector(chrome, '[data-testid="prep-start-practice"]', "Practice start");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-testid="cs-map-confirm"]')`, 30_000, "Practice ready check");
  const practiceAction = await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action ?? null;`);
  if (practiceAction === "confirm") await clickSelector(chrome, '[data-testid="prep-primary-action"]', "Practice ready confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-map-confirm"]')`, 45_000, "Practice map");
  const mapConfirmDisabled = await chrome.evaluate(`return Boolean(document.querySelector('[data-testid="cs-map-confirm"]')?.disabled);`);
  if (mapConfirmDisabled) throw new Error("Practice map selection did not resolve");
  await clickSelector(chrome, '[data-testid="cs-map-confirm"]', "Practice map confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-tactic-confirm"]')`, 30_000, "Practice tactic");
  await clickSelector(chrome, '[data-testid="cs-tactic-confirm"]', "Practice tactic confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')`, 60_000, "Practice Battle");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-long-match-progress"]')`, 60_000, "Practice progress");
};

const resumeActive = async (chrome, label) => {
  await waitFor(chrome, `document.querySelector('[data-testid="resume-active-match"]')`, 30_000, `${label} resume button`);
  await clickSelector(chrome, '[data-testid="resume-active-match"]', `${label} resume`);
};

const resolveVeto = async (chrome, label) => {
  await waitFor(chrome, `document.querySelector('[data-testid="cs-veto-progress"]')`, 45_000, `${label} veto UI`);
  for (let i = 0; i < 6; i += 1) {
    const resolved = await chrome.evaluate(`return !document.querySelector('[data-testid="cs-map-confirm"]')?.disabled;`);
    if (resolved) return;
    const clicked = await chrome.evaluate(`
      const node = [...document.querySelectorAll('[data-map-key]')]
        .find((button) => !button.disabled && button.dataset.vetoState !== "banned");
      if (!node) return false;
      node.click();
      return true;
    `);
    if (!clicked) throw new Error(`${label} has no actionable veto map`);
    await sleep(250);
  }
  await waitFor(chrome, `!document.querySelector('[data-testid="cs-map-confirm"]')?.disabled`, 10_000, `${label} veto resolved`);
};

const enterOfficialBattle = async (chrome, label) => {
  await resolveVeto(chrome, label);
  await clickSelector(chrome, '[data-testid="cs-map-confirm"]', `${label} map confirm`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-tactic-confirm"]')`, 30_000, `${label} tactic`);
  await clickSelector(chrome, '[data-testid="cs-tactic-confirm"]', `${label} tactic confirm`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')`, 60_000, `${label} Battle`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-long-match-progress"]')`, 60_000, `${label} progress`);
};

const quickFinish = async (chrome, label) => {
  await chrome.evaluate(`window.confirm = () => true; return true;`);
  await clickSelector(chrome, '[data-testid="quick-finish-match"]', `${label} Quick Finish`);
  await waitFor(chrome, `[...document.querySelectorAll("button")].some((node) => (node.innerText || "").includes("查看賽後戰報"))`, 90_000, `${label} result action`);
};

const openResult = async (chrome, label) => {
  await clickText(chrome, "查看賽後戰報", `${label} open result`);
  await waitFor(chrome, `[...document.querySelectorAll("button")].some((node) => (node.innerText || "").includes("返回 Dashboard"))`, 20_000, `${label} result screen`);
};

const returnFromResult = async (chrome, label) => {
  await clickText(chrome, "返回 Dashboard", `${label} result continue`);
};

let savedJson = null;
globalThis.localStorage = {
  getItem: (key) => (key === KEY ? savedJson : null),
  setItem: (key, value) => { if (key === KEY) savedJson = String(value); },
  removeItem: (key) => { if (key === KEY) savedJson = null; },
  clear: () => { savedJson = null; },
};

const { useProfileStore } = await import("../src/platform/profileStore.js");
const state = () => useProfileStore.getState();

const freshSave = ({ practiceMapKey = "dust2", acceptedPool = ["dust2", "mirage", "inferno"] } = {}) => {
  state().startNewGame("standard");
  state().autoFillLineup("cs");
  state().setCsPracticeMap(practiceMapKey);
  state().setCsAcceptedMapPool(acceptedPool);
  state().save();
  return JSON.parse(savedJson);
};

let fixtureClock = 1_000;
const driveFixtureToLaunch = () => {
  for (let i = 0; i < 20; i += 1) {
    fixtureClock += 1500;
    state().pollMatchRoom(fixtureClock);
    const room = state().matchmaking?.room;
    if (room?.state === "ready_check" && !room.confirmations?.us) state().confirmMatchReady(fixtureClock + 1);
    if (state().matchmaking?.room?.state === "confirmed") break;
  }
  state().createMatchSession(fixtureClock + 10);
  state().launchMatchSession(fixtureClock + 20);
};

const officialBo3Save = () => {
  freshSave();
  state().ensureCompetitionSeason("cs");
  const myId = state().competitionByMode.cs.playerTeamId;
  let target = null;
  for (let day = 0; day < 500 && !target; day += 1) {
    const cs = state().competitionByMode.cs;
    if (cs?.final) break;
    const view = state().competitionView("cs");
    const today = view.today;
    if (today) {
      const isBo3 = today.matchFormat?.series === "bo3" || today.matchFormat?.mapsToWin === 2;
      if (isBo3) {
        target = { id: today.id, format: today.matchFormat };
        break;
      }
      const started = state().startFixtureMatch(today.id, Date.now());
      if (!started.ok) throw new Error(`BO3 setup start failed: ${started.reason}`);
      const completed = state().completeFixtureMatch({
        fixtureId: today.id,
        winner: myId,
        score: { a: today.sideA === myId ? 1 : 0, b: today.sideB === myId ? 1 : 0 },
        duration: 1800,
        seed: 7,
      });
      if (!completed.ok) throw new Error(`BO3 setup completion failed: ${JSON.stringify(completed.errors)}`);
    } else if ((state().advanceDay(1).daysAdvanced ?? 0) <= 0) break;
  }
  if (!target) throw new Error("Deterministic BO3 fixture missing");
  fixtureClock = Date.now();
  const started = state().startFixtureMatch(target.id, fixtureClock);
  if (!started.ok) throw new Error(`BO3 fixture start failed: ${started.reason}`);
  driveFixtureToLaunch();
  state().save();
  return { fixtureId: target.id, seed: state().matchmaking?.launch?.seed ?? null, save: JSON.parse(savedJson) };
};

let pass = 0;
let fail = 0;
const ck = (label, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`PASS ${label}${detail ? `　${detail}` : ""}`); }
  else { fail += 1; console.log(`FAIL ${label}${detail ? `　${detail}` : ""}`); }
};

let dev = null;
let chrome = null;
try {
  dev = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });

  const practice = freshSave({ practiceMapKey: "dust2" });
  await injectSave(chrome, practice, { width: 390, height: 844, mobile: true });
  await enterPracticeBattle(chrome);
  await sleep(1800);
  let progress = await readProgress(chrome);
  ck("Practice BO1 progress card rendered", progress.present, JSON.stringify(progress));
  ck("Practice BO1 shows Map 1 / 1, round and live score", progress.map.includes("Map 1 / 1") && progress.round.includes("回合") && progress.score.includes("即時比分"), JSON.stringify(progress));
  ck("Practice progress uses authoritative frame bar", Number(progress.frameMax) > 0 && Number(progress.frameValue) >= 1, JSON.stringify(progress));
  await clickSelector(chrome, '[data-testid="match-speed-2.4"]', "Practice 2.4x");
  await waitFor(chrome, `document.querySelector('[data-testid="match-speed-2.4"]')?.getAttribute("aria-pressed") === "true"`, 5_000, "Practice 2.4x selected");
  progress = await readProgress(chrome);
  ck("Practice exposes real 2.4x selection", progress.speed24Pressed === "true", JSON.stringify(progress));
  ck("Practice 390px has no horizontal overflow", progress.width === 390 && !progress.overflow, JSON.stringify(progress));

  const beforeLeave = Number(progress.frameValue) || 0;
  await clickSelector(chrome, '[data-testid="leave-active-match"]', "Practice leave");
  await waitFor(chrome, `document.querySelector('[data-testid="resume-active-match"]')`, 30_000, "Practice paused dashboard");
  const pausedSave = await readBrowserSave(chrome);
  const pausedFrame = Number(pausedSave?.matchmaking?.session?.activeMatch?.simulation?.snapshot?.frameIndex) || 0;
  // UI 顯示是 1-based frame number；snapshot.frameIndex 是 0-based。
  ck("Practice leave persists paused ActiveMatch", pausedSave?.matchmaking?.session?.activeMatch?.status === "paused" && pausedFrame + 1 >= beforeLeave, JSON.stringify({ beforeLeave, pausedFrame, active: pausedSave?.matchmaking?.session?.activeMatch }));
  await clickSelector(chrome, '[data-testid="resume-active-match"]', "Practice resume");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-long-match-progress"]')`, 60_000, "Practice resumed progress");
  await sleep(700);
  const resumedSave = await readBrowserSave(chrome);
  const resumed = await readProgress(chrome);
  const resumedFrame = Number(resumedSave?.matchmaking?.session?.activeMatch?.simulation?.snapshot?.frameIndex) || 0;
  ck("Practice resume returns to active same map", resumedSave?.matchmaking?.session?.activeMatch?.status === "active" && resumed.map.includes("Map 1 / 1"), JSON.stringify({ resumedFrame, resumed }));
  ck("Practice resume keeps the persisted playback cursor", resumedFrame >= pausedFrame && (Number(resumed.frameValue) || 0) >= pausedFrame, JSON.stringify({ pausedFrame, resumedFrame, resumed }));
  await quickFinish(chrome, "Practice");
  await openResult(chrome, "Practice");
  ck("Practice Result screen reached", (await chrome.evaluate(`return document.body.innerText.includes("返回 Dashboard");`)) === true);
  await returnFromResult(chrome, "Practice");

  const bo3 = officialBo3Save();
  console.log(`BO3 browser fixture=${bo3.fixtureId} seed=${bo3.seed}`);
  await injectSave(chrome, bo3.save, { width: 1280, height: 900, mobile: false });
  await resumeActive(chrome, "BO3");
  await enterOfficialBattle(chrome, "BO3 Map 1");
  await sleep(1800);
  progress = await readProgress(chrome);
  ck("BO3 Map 1 progress card rendered", progress.present && progress.map.includes("Map 1 / 3") && progress.series.includes("BO3 系列賽"), JSON.stringify(progress));
  await quickFinish(chrome, "BO3 Map 1");
  await openResult(chrome, "BO3 Map 1");
  await returnFromResult(chrome, "BO3 Map 1");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-veto-progress"]') || document.querySelector('[data-testid="cs-map-confirm"]')`, 30_000, "BO3 Map 2 selection");
  await enterOfficialBattle(chrome, "BO3 Map 2");
  await sleep(1800);
  progress = await readProgress(chrome);
  ck("BO3 Map 2 shows series progress", progress.map.includes("Map 2 / 3") && progress.series.includes("已完成 1 / 3"), JSON.stringify(progress));

  const map2BeforeReload = await readBrowserSave(chrome);
  const map2FrameBeforeReload = Number(map2BeforeReload?.matchmaking?.session?.activeMatch?.simulation?.snapshot?.frameIndex) || 0;
  await chrome.reload();
  await resumeActive(chrome, "BO3 Map 2 reload");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-long-match-progress"]')`, 60_000, "BO3 Map 2 resumed progress");
  await sleep(700);
  progress = await readProgress(chrome);
  const map2AfterReload = await readBrowserSave(chrome);
  const map2FrameAfterReload = Number(map2AfterReload?.matchmaking?.session?.activeMatch?.simulation?.snapshot?.frameIndex) || 0;
  ck("BO3 Map 2 reload / resume keeps map and snapshot", progress.map.includes("Map 2 / 3") && map2FrameAfterReload >= map2FrameBeforeReload && (Number(progress.frameValue) || 0) >= map2FrameBeforeReload, JSON.stringify({ map2FrameBeforeReload, map2FrameAfterReload, progress }));
  await quickFinish(chrome, "BO3 Map 2");
  await openResult(chrome, "BO3 Map 2");
  await returnFromResult(chrome, "BO3 Map 2");
  const afterMap2 = await readBrowserSave(chrome);
  const seriesAfterMap2 = afterMap2?.matchmaking?.session?.series;
  ck("BO3 Map 1 → Map 2 transition is persisted", seriesAfterMap2?.maps?.length === 2, JSON.stringify(seriesAfterMap2));

  if (seriesAfterMap2?.status === "in_progress") {
    await waitFor(chrome, `document.querySelector('[data-testid="cs-map-confirm"]')`, 30_000, "BO3 Map 3 selection");
    await enterOfficialBattle(chrome, "BO3 Map 3");
    await sleep(1800);
    progress = await readProgress(chrome);
    ck("BO3 Map 3 progress card rendered", progress.map.includes("Map 3 / 3") && progress.series.includes("已完成 2 / 3"), JSON.stringify(progress));
    await quickFinish(chrome, "BO3 Map 3");
    await openResult(chrome, "BO3 Map 3");
    await returnFromResult(chrome, "BO3 Map 3");
  } else {
    ck("BO3 natural 2:0 correctly skips unnecessary Map 3", seriesAfterMap2?.status === "decided" && Math.max(seriesAfterMap2?.wins?.us ?? 0, seriesAfterMap2?.wins?.opponent ?? 0) === 2, JSON.stringify(seriesAfterMap2));
  }

  await waitFor(chrome, `document.querySelector('[data-testid="home-mode-cs"]')`, 30_000, "BO3 series completion dashboard");
  const finalSave = await readBrowserSave(chrome);
  const finalSession = finalSave?.matchmaking?.session;
  const finalFixture = finalSave?.competitionByMode?.cs?.fixtures?.find((item) => item.id === bo3.fixtureId) ?? null;
  ck("BO3 Series Result / Competition handoff", finalSession?.series?.status === "decided" && [2, 3].includes(finalSession?.series?.maps?.length) && finalSession.state === "completed" && finalFixture?.status === "completed", JSON.stringify({ session: finalSession, fixture: finalFixture }));

  const errors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
  ck("C6C browser console / page errors = 0", errors.console.length === 0 && errors.page.length === 0, JSON.stringify(errors));
} catch (error) {
  fail += 1;
  console.error(error?.stack ?? error);
  if (chrome) {
    try {
      const diagnostic = await chrome.evaluate(`return { url: location.href, body: (document.body.innerText || "").slice(0, 2200), buttons: [...document.querySelectorAll("button")].map((node) => ({ text: (node.innerText || "").replace(/\\s+/g, " ").trim(), disabled: node.disabled, testId: node.dataset.testid, action: node.dataset.action })).slice(-30), save: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || "null")?.matchmaking ?? null };`);
      console.error(`C6C browser diagnostic ${JSON.stringify(diagnostic)}`);
    } catch (diagnosticError) {
      console.error(`C6C browser diagnostic failed: ${diagnosticError.message}`);
    }
  }
} finally {
  if (chrome) await chrome.close();
  if (dev) await dev.stop();
}

console.log(`\nC6C browser progress: ${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);
