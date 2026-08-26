#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchChrome, startDevServer } from "./browser/cdp.mjs";

const VITE_PORT = Number(process.env.CS_C3_VITE_PORT || 5396);
const CDP_PORT = Number(process.env.CS_C3_CDP_PORT || 9396);
const VIEWPORT_WIDTH = Number(process.env.CS_C3_VIEWPORT_WIDTH || 1366);
const VIEWPORT_HEIGHT = Number(process.env.CS_C3_VIEWPORT_HEIGHT || 768);
const VIEWPORT_DPR = Number(process.env.CS_C3_VIEWPORT_DPR || 1);
const APP = process.env.CS_C3_APP_URL || `http://127.0.0.1:${VITE_PORT}/ESMO-/?fpsRigged=all&fpsC2cHero=all`;
const OUTPUT_DIR = process.env.CS_C3_CAPTURE_DIR || path.resolve("artifacts/cs-c3/mirage-a-mid-connector");
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
    if (!button || button.disabled) return { ok: false, buttons: [...document.querySelectorAll("button")].map((node) => (node.innerText || "").replace(/\\s+/g, " ").trim()).slice(0, 40) };
    const text = (button.innerText || "").replace(/\\s+/g, " ").trim();
    button.click();
    return { ok: true, text };
  `);
  if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  return result;
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
    await clickByText(chrome, `(node, text) => text.includes("Auto") || text.includes("自動") || text.includes("?芸?憛怠")`, "auto-fill lineup");
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
  await clickByText(chrome, `(node, text) => !text.includes("Cancel") && !text.includes("??") && text.length > 20`, "tactic");
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 45_000, "Battle canvas");
}

async function captureCanvasSurface(chrome, name) {
  await chrome.evaluate(`return (() => { const canvas=document.querySelector("canvas"); canvas?.scrollIntoView({block:"start",inline:"nearest"}); return Boolean(canvas); })()`);
  await sleep(120);
  const rect = await chrome.evaluate(`return (() => { const canvas=document.querySelector("canvas"); if(!canvas)return null; const r=canvas.getBoundingClientRect(); return {x:r.left,y:r.top,width:r.width,height:r.height}; })()`);
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error(`canvas surface unavailable: ${name}`);
  const shot = await chrome.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
  });
  if (!shot?.data) throw new Error(`page screenshot unavailable: ${name}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = path.join(OUTPUT_DIR, `${name}.png`);
  fs.writeFileSync(filename, Buffer.from(shot.data, "base64"));
  return { filename, rect, source: "Page.captureScreenshot" };
}

async function setOwnerCamera(chrome, target, radius, theta = -1.1, phi = 0.95) {
  return chrome.evaluate(`return (() => {
    const st = window.__ESMO_FPS_SCENE__;
    if (!st?.cam || !st.camera) return false;
    st.cam.autoFollow = false;
    st.cam.overview = false;
    st.cam._ovBase = null;
    st.cam.dTgt.set(${target[0]}, ${target[1]}, ${target[2]});
    st.cam.dTheta = ${theta};
    st.cam.dPhi = ${phi};
    st.cam.dRadius = ${radius};
    st.cam.tgt.copy(st.cam.dTgt);
    st.cam.theta = st.cam.dTheta;
    st.cam.phi = st.cam.dPhi;
    st.cam.radius = st.cam.dRadius;
    st.camera.position.setFromSphericalCoords(st.cam.radius, st.cam.phi, st.cam.theta).add(st.cam.tgt);
    st.camera.lookAt(st.cam.tgt);
    st.camera.updateMatrixWorld();
    return true;
  })()`);
}

async function readEvidence(chrome) {
  return chrome.evaluate(`return (() => {
    const st = window.__ESMO_FPS_SCENE__;
    const env = st?.worldGroup?.getObjectByName?.("C3_Mirage_Environment_VSlice") || null;
    const zoneNames = ["C3_Mirage_A_Site", "C3_Mirage_Mid", "C3_Mirage_Connector"];
    const zones = zoneNames.map((name) => {
      const zone = env?.getObjectByName?.(name) || null;
      let meshes = 0;
      let visibleMeshes = 0;
      zone?.traverse?.((object) => { if (object.isMesh) { meshes += 1; if (object.visible) visibleMeshes += 1; } });
      return { name, found: Boolean(zone), visible: Boolean(zone?.visible), meshes, visibleMeshes };
    });
    let decorationMeshes = 0;
    env?.traverse?.((object) => { if (object.isMesh && object.userData?.c3Environment) decorationMeshes += 1; });
    const canvas = document.querySelector("canvas");
    const visibility = window.__ESMO_FPS_VISIBILITY__ || null;
    const players = st?.players || [];
    return {
      environment: {
        found: Boolean(env),
        visible: Boolean(env?.visible),
        zones,
        decorationMeshes,
        summary: st?.c3Environment?.summary || null,
      },
      mapContract: {
        wallRects: st?.wallRects?.length || 0,
        mapWalls: st?.mapWalls?.length || 0,
        raycastTargets: st?.raycastTargets?.length || 0,
      },
      players: {
        total: players.length,
        rigged: players.filter((candidate) => candidate.rigged?.mode === "rigged").length,
        visible: players.filter((candidate) => candidate.g?.visible !== false).length,
      },
      canvas: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight, bufferWidth: canvas.width, bufferHeight: canvas.height } : null,
      renderer: canvas ? {
        calls: Number(canvas.dataset.esmoFpsRenderCalls || 0),
        triangles: Number(canvas.dataset.esmoFpsTriangles || 0),
        geometries: Number(canvas.dataset.esmoFpsGeometries || 0),
        textures: Number(canvas.dataset.esmoFpsTextures || 0),
        players: Number(canvas.dataset.esmoFpsPlayers || 0),
        rigged: Number(canvas.dataset.esmoFpsRigged || 0),
        mixers: Number(canvas.dataset.esmoFpsMixers || 0),
      } : null,
      visibility,
      camera: st ? { recovery: st.cameraRecoveryCount || 0, rapid: st.rapidCameraRecoveryCount || 0, position: st.camera?.position?.toArray?.() || null } : null,
      browserErrors: { console: [], page: [] },
    };
  })()`);
}

let dev = null;
let chrome = null;
try {
  if (process.env.CS_C3_START_DEV === "1") dev = await startDevServer({ port: VITE_PORT });
  chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, deviceScaleFactor: VIEWPORT_DPR, mobile: VIEWPORT_WIDTH <= 600 });
  await chrome.navigate(APP);
  await enterMirageBattle(chrome);
  await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);
  await sleep(4_000);
  const evidence = await readEvidence(chrome);
  evidence.browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const capture = await captureCanvasSurface(chrome, "battle-runtime-mirage-a-mid-connector");
  evidence.capture = capture;
  const sliceCaptures = {};
  for (const [name, target, radius] of [
    ["owner-a-site", [32, 2.7, -34], 18],
    ["owner-mid", [-5, 2.7, 4], 18],
    ["owner-connector", [-27, 2.7, 18], 16],
  ]) {
    if (!await setOwnerCamera(chrome, target, radius)) throw new Error(`owner camera setup failed: ${name}`);
    await sleep(900);
    sliceCaptures[name] = await captureCanvasSurface(chrome, name);
  }
  evidence.sliceCaptures = sliceCaptures;
  fs.writeFileSync(path.join(OUTPUT_DIR, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(`INFO C3 runtime evidence=${JSON.stringify(evidence)}`);

  const zones = evidence.environment.zones;
  if (!evidence.environment.found || !evidence.environment.visible || zones.some((zone) => !zone.found || !zone.visible || zone.meshes < 8)) throw new Error(`environment zones failed: ${JSON.stringify(evidence.environment)}`);
  if (!evidence.environment.summary?.noCollisionMutation || !evidence.environment.summary?.noGameplayMutation) throw new Error(`environment scope contract failed: ${JSON.stringify(evidence.environment.summary)}`);
  if (evidence.environment.summary.estimatedTriangles > 5000) throw new Error(`environment triangle budget failed: ${JSON.stringify(evidence.environment.summary)}`);
  if (!evidence.canvas || evidence.canvas.width < 1 || evidence.canvas.height < 1) throw new Error(`invalid canvas: ${JSON.stringify(evidence.canvas)}`);
  if (evidence.players.total !== 10 || evidence.players.rigged !== 10 || evidence.players.visible < 10) throw new Error(`player runtime visibility failed: ${JSON.stringify(evidence.players)}`);
  if (!evidence.visibility?.check?.ok || evidence.visibility.teams?.blue?.authoritative !== 5 || evidence.visibility.teams?.red?.authoritative !== 5) throw new Error(`P0 visibility failed: ${JSON.stringify(evidence.visibility)}`);
  if (evidence.camera.rapid) throw new Error(`camera recovery loop observed: ${JSON.stringify(evidence.camera)}`);
  if (evidence.browserErrors.console.length || evidence.browserErrors.page.length) throw new Error(`browser errors: ${JSON.stringify(evidence.browserErrors)}`);
  console.log(`CS-C3 Battle runtime: PASS`);
  console.log(`CS-C3 owner capture: ${capture.filename}`);
} finally {
  await chrome?.close?.().catch?.(() => {});
  await dev?.stop?.().catch?.(() => {});
}
