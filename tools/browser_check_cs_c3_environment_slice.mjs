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
  await waitFor(chrome, `document.querySelector('[data-testid="cs-camera-presets"]') && document.querySelector('[data-testid="cs-camera-preset-high"]') && document.querySelector('[data-testid="cs-camera-preset-overview"]') && document.querySelector('[data-testid="cs-camera-preset-tactical"]')`, 10_000, "camera presets");
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

async function setOwnerCamera(chrome, preset) {
  return chrome.evaluate(`return (() => {
    const st = window.__ESMO_FPS_SCENE__;
    const button = document.querySelector('[data-testid="cs-camera-preset-${preset}"]');
    if (!button || button.disabled) return false;
    button.click();
    return Boolean(st?.cam?.viewPreset === ${JSON.stringify(preset)});
  })()`);
}

async function pauseOwnerFrame(chrome) {
  return chrome.evaluate(`return (() => {
    const st = window.__ESMO_FPS_SCENE__;
    const live = st?.liveRef?.current;
    if (!live) return false;
    live.playing = false;
    live.fIdx = 0;
    return true;
  })()`);
}

function writeOwnerReview() {
  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ESMO CS-C3 Mirage 地圖環境升級｜Owner 驗收</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#101820;color:#edf4f3}body{max-width:1120px;margin:0 auto;padding:28px}h1{margin:0 0 8px;font-size:27px}h2{font-size:18px;margin:26px 0 10px}p{color:#b8c5c6;line-height:1.65}.status{display:inline-block;padding:6px 10px;border:1px solid #62c9b5;border-radius:999px;color:#a8efdf;font-weight:800;letter-spacing:.04em}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{padding:15px;border:1px solid #30434b;border-radius:12px;background:#16242b}.card strong{display:block;color:#f3cf89;margin-bottom:5px}.views{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.views button{border:1px solid #38535d;background:#1a2b33;color:#c9e4e2;border-radius:8px;padding:8px 12px;cursor:pointer}.views button.active{border-color:#75d5c0;background:#214b4d;color:#fff}.view{display:none;margin:0;padding:16px;border:1px solid #30434b;border-radius:14px;background:#16242b}.view.active{display:block}.view img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:8px;background:#081116}.view figcaption{margin-top:12px;color:#b8c5c6;font-size:13px;line-height:1.55}a{color:#8ed9e2}@media(max-width:700px){body{padding:16px}.grid{grid-template-columns:1fr}}
</style></head><body>
<span class="status">C3_VERTICAL_SLICE_READY_FOR_OWNER_ACCEPTANCE</span>
<h1>Mirage 地圖環境升級｜A 區・中路・連接道</h1>
<p>本頁是 C3 第二輪垂直切片的 Owner 驗收預覽：場景已從單純方塊 blockout 提升為較完整的現代戰術街區，包含建築立面、門窗、屋頂設備、路面分層、區域地標、掩體細節與更明亮的光影。環境層只做視覺呈現，不改碰撞、路線、武器數值或對戰模擬。</p>
<h2>三種戰場視角</h2>
<p>以下按鈕可切換同一場 Battle runtime 的三個正式視角：高位上帝視角用於確認全場與 10 位角色；中高位全場總覽用於看區域結構；側上方戰術總覽用於看路線、掩體與交戰層次。</p>
<div class="views"><button class="active" data-view="high">高位上帝視角</button><button data-view="overview">中高位全場總覽</button><button data-view="tactical">側上方戰術總覽</button></div>
<figure class="view active" data-panel="high"><img src="./owner-high.png" alt="Mirage 高位上帝視角"><figcaption>高位上帝視角：建築淡化／薄 façade 智慧隱藏後，可檢查 10 位角色、隊伍分布與全圖區域關係。</figcaption></figure>
<figure class="view" data-panel="overview"><img src="./owner-overview.png" alt="Mirage 中高位全場總覽"><figcaption>中高位全場總覽：保留建築輪廓與場景層次，清楚展示 A 區、中路、連接道的地標關係。</figcaption></figure>
<figure class="view" data-panel="tactical"><img src="./owner-tactical.png" alt="Mirage 側上方戰術總覽"><figcaption>側上方戰術總覽：以較低角度呈現路線、掩體、街區立面與交戰空間。</figcaption></figure>
<h2>垂直切片範圍</h2><div class="grid"><div class="card"><strong>A 區</strong>明亮混凝土植台、地面分格、制式立面、門窗與遮棚、管線、屋頂設備、控制台、箱堆、棧板與路口框架。</div><div class="card"><strong>中路</strong>鋪面車道、路緣、車道標線、兩側市場立面、遮棚、門窗、街道框架、架空線、路障、箱堆與路燈。</div><div class="card"><strong>連接道</strong>清楚的門廊門框、左右立面、門窗、通道標線、管線、成對掩體、設備堆、門口框架與導引標誌。</div></div>
<h2>驗收說明</h2><p>請確認「這看起來是有材質、分層與地標的戰術地圖，而不是原本方塊地圖加小裝飾」。高位視角的淡化只作用於視覺層，離開 preset 會恢復建築；碰撞牆仍由既有 Mirage map walls 提供。</p>
<p>Battle runtime 證據：<a href="./runtime-evidence.json">runtime-evidence.json</a>　｜　一般 Battle 畫面：<a href="./battle-runtime-mirage-a-mid-connector.png">battle-runtime-mirage-a-mid-connector.png</a></p>
<script>document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(node=>node.classList.toggle('active',node===button));document.querySelectorAll('[data-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===button.dataset.view));}));</script>
</body></html>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, "owner-review.html"), html);
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
      camera: st ? { preset: st.cam?.viewPreset || null, recovery: st.cameraRecoveryCount || 0, rapid: st.rapidCameraRecoveryCount || 0, position: st.camera?.position?.toArray?.() || null } : null,
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
  if (!await pauseOwnerFrame(chrome)) throw new Error("owner frame pause failed");
  const viewCaptures = {};
  for (const [preset, filename] of [["high", "owner-high"], ["overview", "owner-overview"], ["tactical", "owner-tactical"]]) {
    if (!await setOwnerCamera(chrome, preset)) throw new Error(`owner camera setup failed: ${preset}`);
    await sleep(900);
    const viewEvidence = await readEvidence(chrome);
    if (!viewEvidence.visibility?.check?.ok) throw new Error(`owner view visibility failed: ${JSON.stringify(viewEvidence.camera)}`);
    viewCaptures[preset] = { capture: await captureCanvasSurface(chrome, filename), camera: viewEvidence.camera, visibility: viewEvidence.visibility };
  }
  evidence.viewCaptures = viewCaptures;
  fs.writeFileSync(path.join(OUTPUT_DIR, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));
  writeOwnerReview();
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
