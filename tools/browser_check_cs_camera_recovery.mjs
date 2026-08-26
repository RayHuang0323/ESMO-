#!/usr/bin/env node
import { launchChrome, startDevServer } from "./browser/cdp.mjs";

const VITE_PORT = 5373;
const CDP_PORT = 9393;
const EXTERNAL_APP = process.env.CS_P0_APP_URL || null;
const PRODUCTION_SMOKE = process.env.CS_P0_PRODUCTION_SMOKE === "1";
const APP = EXTERNAL_APP || `http://localhost:${VITE_PORT}/ESMO-/`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(chrome, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await chrome.evaluate(`return Boolean(${expression});`)) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`${label} timeout`);
}

async function clickByText(chrome, predicate, label) {
  const result = await chrome.evaluate(`
    const button = [...document.querySelectorAll("button")]
      .find((node) => (${predicate})(node, (node.innerText || "").replace(/\\s+/g, " ").trim()));
    if (!button || button.disabled) return { ok: false, buttons: [...document.querySelectorAll("button")].map((node) => (node.innerText || "").replace(/\\s+/g, " ").trim()).slice(0, 30) };
    const text = (button.innerText || "").replace(/\\s+/g, " ").trim();
    button.click();
    return { ok: true, text };
  `);
  if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
}

async function clickPrepAction(chrome) {
  return chrome.evaluate(`
    const button = document.querySelector('[data-testid="prep-primary-action"]');
    if (!button || button.disabled) return { ok: false, action: button?.dataset.action ?? null };
    const action = button.dataset.action;
    button.click();
    return { ok: true, action };
  `);
}

async function enterMirageBattle(chrome) {
  await waitFor(chrome, `document.querySelector("button") && document.body.innerText.includes("CS")`, 30_000, "Home");
  await clickByText(chrome, `(node, text) => text.includes("CS")`, "Practice CS entry");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "Practice prep");

  const initial = await clickPrepAction(chrome);
  if (!initial.ok && initial.action === "blocked") {
    await clickByText(chrome, `(node, text) => text.includes("自動填入") || text.includes("Auto")`, "auto-fill lineup");
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 15_000, "lineup ready");
  } else if (!initial.ok) {
    throw new Error(`initial prep action unavailable: ${JSON.stringify(initial)}`);
  }
  const ready = initial.action === "blocked" ? await clickPrepAction(chrome) : initial;
  if (ready.action === "enqueue") {
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key="mirage"]')`, 45_000, "ready check");
    if (await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm";`)) await clickPrepAction(chrome);
  }

  await waitFor(chrome, `document.querySelector('[data-map-key="mirage"]')`, 45_000, "map selection");
  await chrome.evaluate(`document.querySelector('[data-map-key="mirage"]')?.click(); return true;`);
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled&&!node.dataset.mapKey); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `!document.querySelector('[data-map-key="mirage"]') && document.body.innerText.includes("Mirage")`, 30_000, "tactic selection");
  await clickByText(chrome, `(node, text) => !text.includes("Cancel") && !text.includes("取消") && text.length > 20`, "tactic");
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 45_000, "Battle canvas");
}

let dev = null;
let chrome = null;
try {
  if (!EXTERNAL_APP) dev = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(APP);
  await enterMirageBattle(chrome);
  await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);
  const longRunMs = Number(process.env.CS_P0_LONG_RUN_MS || 180_000);
  await chrome.evaluate(`(() => {
    const read = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const sample = () => {
      const stable = document.querySelector('[data-esmo-fps-stable-canvas-region]');
      const canvas = document.querySelector('canvas');
      (window.__ESMO_CS_P0_SAMPLES__ ||= []).push({
        timestamp: performance.now(),
        stable: read(stable),
        canvas: read(canvas),
      });
    };
    sample();
    window.__ESMO_CS_P0_SAMPLE_TIMER__ = setInterval(sample, 100);
    return true;
  })();`);
  await sleep(longRunMs);

  const evidence = await chrome.evaluate(`
    clearInterval(window.__ESMO_CS_P0_SAMPLE_TIMER__);
    const canvas = document.querySelector("canvas");
    return {
      contract: window.__ESMO_FPS_P0_CONTRACT__ || null,
      scene: window.__ESMO_FPS_SCENE__ ? {
        cameraRecoveryCount: window.__ESMO_FPS_SCENE__.cameraRecoveryCount || 0,
        rapidCameraRecoveryCount: window.__ESMO_FPS_SCENE__.rapidCameraRecoveryCount || 0,
      } : null,
      samples: window.__ESMO_CS_P0_SAMPLES__ || [],
      canvas: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight, bufferWidth: canvas.width, bufferHeight: canvas.height } : null,
      visibility: window.__ESMO_FPS_VISIBILITY__ || null,
    };
  `);
  if (!evidence?.canvas || evidence.canvas.width < 1 || evidence.canvas.height < 1) throw new Error(`Battle canvas invalid: ${JSON.stringify(evidence?.canvas)}`);
  if (!PRODUCTION_SMOKE) {
    if (!evidence.contract || evidence.contract.fidxTransitions < 1) throw new Error(`RAF contract missing transitions: ${JSON.stringify(evidence.contract)}`);
    if (evidence.contract.staleMismatch !== 0) throw new Error(`RAF_FIDX_COHERENCE mismatch: ${JSON.stringify(evidence.contract)}`);
    if (evidence.contract.duplicateRaf !== 0 || evidence.contract.duplicateRender !== 0) throw new Error(`duplicate RAF/render: ${JSON.stringify(evidence.contract)}`);
    if (!evidence.scene || evidence.scene.rapidCameraRecoveryCount !== 0) throw new Error(`CAMERA_RECOVERY loop: ${JSON.stringify(evidence.scene)}`);
  }
  if (evidence.samples.length < Math.max(100, Math.floor(longRunMs / 200))) throw new Error(`insufficient geometry samples: ${evidence.samples.length}`);
  const base = evidence.samples[0]?.stable;
  const geometryShifts = evidence.samples.filter((sample) => !base || !sample.stable || ["x", "y", "width", "height"].some((key) => Math.abs(sample.stable[key] - base[key]) > 0.01));
  if (geometryShifts.length) throw new Error(`STABLE_CANVAS_GEOMETRY shift: ${JSON.stringify(geometryShifts.slice(0, 3))}`);
  if (!PRODUCTION_SMOKE) {
    const visibility = evidence.visibility;
    if (!visibility?.check?.ok || visibility.teams?.blue?.authoritative !== 5 || visibility.teams?.red?.authoritative !== 5) throw new Error(`visibility contract failed: ${JSON.stringify(visibility)}`);
  }
  const errors = {
    console: chrome.consoleLines.filter((line) => line.startsWith("[error]")),
    page: chrome.pageErrors,
  };
  if (errors.console.length || errors.page.length) throw new Error(`blocking browser errors: ${JSON.stringify(errors)}`);
  if (PRODUCTION_SMOKE) {
    console.log(`PASS production smoke Home -> Practice -> Mirage -> Battle canvas=${JSON.stringify(evidence.canvas)}`);
    console.log(`PASS production geometry samples=${evidence.samples.length} stableGeometryShifts=${geometryShifts.length} browserErrors=0`);
  } else {
    console.log(`PASS Home -> Practice -> Mirage -> Battle canvas=${JSON.stringify(evidence.canvas)}`);
    console.log(`PASS CS P0 long-run=${longRunMs}ms samples=${evidence.samples.length} stableGeometryShifts=${geometryShifts.length}`);
    console.log(`PASS fIdx transitions=${evidence.contract.fidxTransitions} staleMismatch=${evidence.contract.staleMismatch} duplicateRaf=${evidence.contract.duplicateRaf} duplicateRender=${evidence.contract.duplicateRender}`);
    console.log(`PASS cameraRecovery=${evidence.scene.cameraRecoveryCount} rapidRecovery=${evidence.scene.rapidCameraRecoveryCount} browserErrors=${errors.console.length + errors.page.length}`);
  }
} finally {
  if (chrome) await chrome.close();
  if (dev) await dev.stop();
}
