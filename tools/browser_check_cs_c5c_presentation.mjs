#!/usr/bin/env node
// C5C browser evidence：三圖 Battle、presentation adapter、音效、導播、手動鏡頭、390px。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDevServer, launchChrome } from "./browser/cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "artifacts/cs-c5c/owner-review");
const MAPS = { mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" };
const TARGET_MAPS = (process.env.C5C_MAPS || Object.keys(MAPS).join(",")).split(",").map((key) => key.trim()).filter((key) => MAPS[key]);
const PORT = Number(process.env.C5C_PORT || 5188);
const CDP_PORT = Number(process.env.C5C_CDP_PORT || 9588);
const WIDTH = Number(process.env.C5C_WIDTH || 1366);
const HEIGHT = Number(process.env.C5C_HEIGHT || 900);
const mobile = WIDTH <= 600;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (chrome, expression, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return; } catch {}
    await sleep(200);
  }
  throw new Error(`${label} timeout`);
};

async function pauseBattle(chrome) {
  await chrome.evaluate(`const button=[...document.querySelectorAll('button')].find((node)=>node.textContent.includes('❚❚'));if(button)button.click();return true;`);
  await sleep(150);
  await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;`);
}
async function realClick(chrome, selector) {
  const rect = await chrome.evaluate(`return (()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  if (!rect) return false;
  await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  return true;
}

async function seekFrame(chrome, frameIndex) {
  const ok = await chrome.evaluate(`return (()=>{const input=document.querySelector('input[type="range"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!input||!setter)return false;setter.call(input,String(${frameIndex}));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;})()`);
  if (!ok) throw new Error(`seek frame ${frameIndex} failed`);
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const committed = await chrome.evaluate(`return window.__ESMO_C5C_PRESENTATION__?.diagnostics?.lastFrameIndex===${frameIndex}`);
    if (committed) return;
    await sleep(80);
  }
  throw new Error(`presentation did not commit frame ${frameIndex}`);
}

async function captureCanvas(chrome, fileName) {
  const rect = await chrome.evaluate(`return (()=>{const canvas=document.querySelector('canvas');if(!canvas)return null;const r=canvas.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};})()`);
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error("canvas unavailable");
  const shot = await chrome.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false, clip: { ...rect, scale: 1 } });
  if (!shot?.data) throw new Error("canvas screenshot unavailable");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), Buffer.from(shot.data, "base64"));
  return fileName;
}

async function readEventFrames(chrome) {
  return chrome.evaluate(`return (()=>{const frames=window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames||[];const eventFrames=[],muzzleFrames=[],eventTypes={};frames.forEach((frame,index)=>{if(frame.roundStart||(frame.events||[]).length){eventFrames.push(index);(frame.events||[]).forEach((event)=>{eventTypes[event.type]=(eventTypes[event.type]||0)+1;});}if((frame.muzzles||[]).length)muzzleFrames.push(index);});const selected=[0,...eventFrames,...muzzleFrames.slice(0,8)].filter((value,index,array)=>value>=0&&array.indexOf(value)===index).sort((a,b)=>a-b);return {frameCount:frames.length,eventFrames,muzzleFrames,selected,eventTypes};})()`);
}

async function runMap(chrome, mapKey, seed) {
  const url = `${chrome.__c5cBase}?c5c=battle&map=${mapKey}&seed=${seed}`;
  await chrome.navigate(url);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')&&document.querySelector('canvas')&&document.querySelector('[data-testid="cs-c5c-presentation-hud"]')`, 90_000, `${mapKey} Battle mount`);
  await pauseBattle(chrome);
  const audioButton = await chrome.evaluate(`return [...document.querySelectorAll('button')].find((node)=>node.title==='音效關')?.outerHTML||null`);
  if (!audioButton) throw new Error(`${mapKey} audio control missing`);
  await realClick(chrome, 'button[title="音效關"]');
  await waitFor(chrome, `window.__ESMO_FPS_AUDIO_DIAGNOSTICS__&&window.__ESMO_FPS_AUDIO_DIAGNOSTICS__.loadedProfiles===5`, 30_000, `${mapKey} recorded audio preload`);
  await waitFor(chrome, `document.querySelector('button[title="音效開"]')`, 5_000, `${mapKey} sound toggle commit`);
  const frames = await readEventFrames(chrome);
  console.log(`INFO ${mapKey} frames=${frames.frameCount} eventFrames=${frames.eventFrames.length} types=${JSON.stringify(frames.eventTypes)} seeks=${frames.selected.length}`);
  for (const frameIndex of frames.selected) await seekFrame(chrome, frameIndex);
  const firstShotFrame = frames.muzzleFrames[0] ?? frames.selected.at(-1) ?? 0;
  await seekFrame(chrome, firstShotFrame);
  const firstShot = await captureCanvas(chrome, `${mapKey}-${mobile ? "390px" : "desktop"}-battle.png`);
  const finalFrame = frames.eventFrames.at(-1) ?? frames.frameCount - 1;
  if (finalFrame >= 0) {
    if (frames.selected.at(-1) !== finalFrame) await seekFrame(chrome, finalFrame);
    await captureCanvas(chrome, `${mapKey}-${mobile ? "390px" : "desktop"}-event.png`);
  }
  const manual = await chrome.evaluate(`return (()=>{const card=document.querySelector('[data-esmo-fps-player-card]');if(!card)return {ok:false};card.click();return {ok:true};})()`);
  await sleep(220);
  const manualAfterFocus = await chrome.evaluate(`return Boolean((window.__ESMO_FPS_SCENE__?.cam&&!window.__ESMO_FPS_SCENE__.cam.autoFollow)||window.__ESMO_FPS_SCENE__?.liveRef?.current?.selected)`);
  await chrome.evaluate(`const button=[...document.querySelectorAll('button')].find((node)=>node.textContent.includes('重新置中'));if(button)button.click();return true;`);
  await sleep(160);
  const sample = await chrome.evaluate(`return (()=>{const presentation=window.__ESMO_C5C_PRESENTATION__||{};const diagnostics=presentation.diagnostics||{};const audio=window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||{};const scene=window.__ESMO_FPS_SCENE__||{};const canvas=document.querySelector('canvas');const text=document.body.innerText||'';return {mapKey:${JSON.stringify(mapKey)},completed:Boolean(scene.liveRef?.current?.sim?.completed),frameCount:Number(scene.liveRef?.current?.sim?.frames?.length||0),presentation:{...diagnostics,roundStartEvents:Number(diagnostics.roundStartEvents||0),roundEndEvents:Number(diagnostics.roundEndEvents||0),bombEvents:Number(diagnostics.objectiveEvents||0),clutchEvents:Number(diagnostics.clutchEvents||0),feedCount:Number(diagnostics.feedCount||0),eventFrameCount:${frames.eventFrames.length},eventTypes:${JSON.stringify(frames.eventTypes)}},audio:{assetSource:audio.assetSource||null,presentationCueStarts:Number(audio.presentationCueStarts||0),recordedSourceStarts:Number(audio.recordedSourceStarts||0),activeVoices:Number(audio.activeVoices||0),loadErrors:audio.loadErrors||{}},camera:{directorSwitches:Number(diagnostics.directorSwitches||0),manualOverrideSamples:${manualAfterFocus ? 1 : 0},rapidSwitches:Number(diagnostics.rapidDirectorSwitches||0)},c2c:window.__ESMO_FPS_C2A__||null,p0:window.__ESMO_FPS_P0_CONTRACT__||null,canvas:canvas?{width:canvas.clientWidth,height:canvas.clientHeight,bufferWidth:canvas.width,bufferHeight:canvas.height}:null,browserErrors:{console:[],page:[]},hud:{killFeed:Boolean(document.querySelector('[data-testid="cs-c5c-kill-feed"]')),bomb:Boolean(document.querySelector('[data-testid="cs-c5c-bomb-status"]')),history:Boolean(document.querySelector('[data-testid="cs-c5c-round-history"]')),textIncludesChinese:/[\u4e00-\u9fff]/.test(text)},manualFocusAttempt:Boolean(${manual?.ok ? "true" : "false"}),firstShot:${JSON.stringify(firstShot)}};})()`);
  sample.browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
  return sample;
}

const server = await startDevServer({ port: PORT });
let chrome = null;
try {
  chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: true });
  chrome.__c5cBase = server.url;
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile });
  const results = [];
  for (const [index, mapKey] of TARGET_MAPS.entries()) results.push(await runMap(chrome, mapKey, 505001 + index * 17));
  const ownerStatus = await fetch(`${server.url}artifacts/cs-c5c/owner-review.html`).then((response) => response.status);
  const battleStatus = await fetch(`${server.url}?c5c=battle&map=mirage&seed=505001`).then((response) => response.status);
  const payload = { generatedAt: new Date().toISOString(), source: "C5C Battle runtime browser evidence", viewport: { width: WIDTH, height: HEIGHT, mode: mobile ? "mobile" : "desktop" }, http: { ownerReview: ownerStatus, battle: battleStatus }, results };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, `runtime-evidence-${mobile ? "mobile" : "desktop"}.json`), JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify(payload, null, 2));
  if (results.some((result) => result.browserErrors.console.length || result.browserErrors.page.length)) process.exitCode = 1;
  if (ownerStatus !== 200 || battleStatus !== 200) process.exitCode = 1;
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  if (chrome) await chrome.close().catch(() => {});
  await server.stop().catch(() => {});
}
