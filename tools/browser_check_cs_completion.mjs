#!/usr/bin/env node
/**
 * CS completion browser smoke.
 *
 * This drives the real Dashboard -> CS prep -> map -> tactic -> loading ->
 * battle -> result flow. The natural scenario uses the live speed control
 * (4x) and does not call Quick Finish; the other scenarios exercise the
 * official Quick Finish path at desktop and 390px mobile widths.
 *
 * Usage:
 *   node tools/browser_check_cs_completion.mjs
 */
import { launchChrome, startDevServer } from "./browser/cdp.mjs";

const VITE_PORT = 5362;
const CDP_PORT = 9382;
const APP = `http://localhost:${VITE_PORT}/ESMO-/`;
const onlyScenario = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7) ?? null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (chrome, expression, timeoutMs, what) => {
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
  throw new Error(`${what} timeout${lastError ? `: ${lastError.message}` : ""}`);
};

const clickByText = async (chrome, predicate, label) => {
  const result = await chrome.evaluate(`
    const button = [...document.querySelectorAll("button")]
      .find((node) => (${predicate})(node, (node.innerText || "").replace(/\\s+/g, " ").trim()));
    if (!button || button.disabled) {
      return {
        ok: false,
        buttons: [...document.querySelectorAll("button")]
          .map((node) => ({ text: (node.innerText || "").replace(/\\s+/g, " ").trim(), disabled: node.disabled }))
          .slice(0, 30),
      };
    }
    const text = (button.innerText || "").replace(/\\s+/g, " ").trim();
    button.click();
    return { ok: true, text };
  `);
  if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  return result.text;
};

const clearIsolatedState = (chrome) => chrome.evaluate(`
  localStorage.removeItem("esmo.profile.v1");
  sessionStorage.clear();
  return true;
`);

const clickPrepAction = (chrome) => chrome.evaluate(`
  const button = document.querySelector('[data-testid="prep-primary-action"]');
  if (!button || button.disabled) return { ok: false, action: button?.dataset.action ?? null };
  const action = button.dataset.action;
  button.click();
  return { ok: true, action };
`);

const readViewport = (chrome) => chrome.evaluate(`return {
  width: window.innerWidth,
  height: window.innerHeight,
  documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  bodyOverflow: document.body.scrollWidth > window.innerWidth + 1,
  controls: Boolean(document.querySelector('[data-testid="cs-match-speed-controls"]')),
  quickFinish: Boolean(document.querySelector('[data-testid="quick-finish-match"]')),
  resultAction: [...document.querySelectorAll("button")].some((node) =>
    (node.innerText || "").includes("查看賽後戰報")),
  reportAction: [...document.querySelectorAll("button")].some((node) =>
    (node.innerText || "").includes("返回 Dashboard")),
  frameText: (document.body.innerText || "").match(/\\d+\\/\\d+ 格/)?.[0] ?? null,
};`);

const browserErrorSummary = (chrome, consoleStart, pageErrorStart) => ({
  console: chrome.consoleLines.slice(consoleStart).filter((line) => line.startsWith("[error]")),
  page: chrome.pageErrors.slice(pageErrorStart),
});

const enterCsFlow = async (chrome, label) => {
  await waitFor(chrome, `document.querySelector("button") && document.body.innerText.includes("CS")`, 30_000, `${label} Dashboard`);
  await clickByText(chrome, `(node, text) => text === "🎯 CS 0 訓練賽" || (text.includes("CS") && text.includes("訓練賽"))`, `${label} CS entry`);
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, `${label} CS prep`);

  const initial = await clickPrepAction(chrome);
  if (!initial.ok && initial.action === "blocked") {
    await clickByText(chrome, `(node, text) => text.includes("自動") && text.includes("填")`, `${label} auto-fill CS lineup`);
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 15_000, `${label} CS lineup ready`);
  } else if (!initial.ok) {
    throw new Error(`${label} initial prep action unavailable: ${JSON.stringify(initial)}`);
  }
  const ready = initial.action === "blocked" ? await clickPrepAction(chrome) : initial;
  if (!ready.ok) throw new Error(`${label} ready prep action unavailable: ${JSON.stringify(ready)}`);
  if (ready.action === "enqueue") {
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.body.innerText.includes("選擇地圖")`, 45_000, `${label} matchmaking/ready check`);
    const action = await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action ?? null;`);
    if (action === "confirm") {
      const confirm = await clickPrepAction(chrome);
      if (!confirm.ok) throw new Error(`${label} ready confirmation unavailable: ${JSON.stringify(confirm)}`);
    }
  }

  await waitFor(chrome, `document.querySelector("h2")?.innerText.includes("選擇地圖")`, 45_000, `${label} map selection`);
  await clickByText(chrome, `(node, text) => text.startsWith("Dust II")`, `${label} map selection`);
  await clickByText(chrome, `(node, text) => text.includes("確認地圖")`, `${label} map confirmation`);
  await waitFor(chrome, `document.querySelector("h2")?.innerText.includes("戰術部署")`, 30_000, `${label} tactic selection`);
  await clickByText(chrome, `(node, text) => !text.includes("返回") && !text.includes("確認") && text.length > 20`, `${label} tactic selection`);
  await clickByText(chrome, `(node, text) => text.includes("開始對戰")`, `${label} tactic confirmation`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')`, 45_000, `${label} battle screen`);
};

const runScenario = async (dev, scenario) => {
  let chrome = null;
  try {
    chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });
    const consoleStart = chrome.consoleLines.length;
    const pageErrorStart = chrome.pageErrors.length;
    await chrome.send("Emulation.setDeviceMetricsOverride", {
      width: scenario.width,
      height: scenario.height,
      deviceScaleFactor: 1,
      mobile: scenario.mobile,
    });
    await chrome.navigate(APP);
    await clearIsolatedState(chrome);
    await chrome.reload();
    await enterCsFlow(chrome, scenario.label);

    const battle = await readViewport(chrome);
    if (!battle.controls || !battle.quickFinish) throw new Error(`${scenario.label} battle controls missing: ${JSON.stringify(battle)}`);
    if (scenario.natural) {
      await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);
      await waitFor(chrome, `![...document.querySelectorAll("button")].some((node) => (node.innerText || "").includes("查看賽後戰報"))`, 3_000, `${scenario.label} natural playback started`);
      // At 4x the engine intentionally advances about two frames/second;
      // a 400+ frame match therefore needs more than three minutes in CPU
      // headless Chrome. This is a harness timeout, not a product shortcut.
      await waitFor(chrome, `[...document.querySelectorAll("button")].some((node) => (node.innerText || "").includes("查看賽後戰報"))`, 300_000, `${scenario.label} natural playback result`);
    } else {
      await chrome.evaluate(`window.confirm = () => true; return true;`);
      await chrome.evaluate(`document.querySelector('[data-testid="quick-finish-match"]')?.click(); return true;`);
      await waitFor(chrome, `[...document.querySelectorAll("button")].some((node) => (node.innerText || "").includes("查看賽後戰報"))`, 20_000, `${scenario.label} Quick Finish result`);
    }

    const result = await readViewport(chrome);
    if (!result.resultAction) throw new Error(`${scenario.label} result action missing: ${JSON.stringify(result)}`);
    if (scenario.mobile && (result.documentOverflow || result.bodyOverflow)) {
      throw new Error(`${scenario.label} horizontal overflow: ${JSON.stringify(result)}`);
    }
    await clickByText(chrome, `(node, text) => text.includes("查看賽後戰報")`, `${scenario.label} result transition`);
    await waitFor(chrome, `[...document.querySelectorAll("button")].some((node) => (node.innerText || "").includes("返回 Dashboard"))`, 15_000, `${scenario.label} CS report`);
    const report = await readViewport(chrome);
    if (!report.reportAction) throw new Error(`${scenario.label} report action missing: ${JSON.stringify(report)}`);
    if (scenario.mobile && (report.documentOverflow || report.bodyOverflow)) {
      throw new Error(`${scenario.label} report horizontal overflow: ${JSON.stringify(report)}`);
    }
    const errors = browserErrorSummary(chrome, consoleStart, pageErrorStart);
    if (errors.console.length || errors.page.length) throw new Error(`${scenario.label} console errors: ${JSON.stringify(errors)}`);
    console.log(`PASS ${scenario.label} :: battle=${JSON.stringify(battle)} result=${JSON.stringify(result)} report=${JSON.stringify(report)}`);
    return true;
  } finally {
    if (chrome) await chrome.close();
  }
};

let dev = null;
let failures = 0;
let scenarioCount = 0;
try {
  dev = await startDevServer({ port: VITE_PORT });
  const scenarios = [
    { label: "desktop-1920x1080-natural", width: 1920, height: 1080, mobile: false, natural: true },
    { label: "desktop-1366x768-quick-finish", width: 1366, height: 768, mobile: false, natural: false },
    { label: "mobile-390x844-quick-finish", width: 390, height: 844, mobile: true, natural: false },
  ].filter((scenario) => !onlyScenario || scenario.label === onlyScenario);
  scenarioCount = scenarios.length;
  if (!scenarios.length) throw new Error(`Unknown scenario: ${onlyScenario}`);
  for (const scenario of scenarios) {
    try {
      await runScenario(dev, scenario);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${scenario.label}: ${error.stack || error.message}`);
    }
  }
} finally {
  if (dev) await dev.stop();
}

if (failures) {
  console.error(`CS browser completion: ${failures} scenario(s) failed`);
  process.exitCode = 1;
} else {
  console.log(`CS browser completion: ${scenarioCount}/${scenarioCount} PASS`);
}
