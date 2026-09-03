#!/usr/bin/env node
// C5C browser evidence：三圖 Battle、presentation adapter、音效、導播、手動鏡頭、390px。
//
// 執行：`node tools/browser_check_cs_c5c_presentation.mjs`
// 或走 supervisor（硬總時限，見 Browser Harness v1）：
//   `node tools/browser/run-gate.mjs tools/browser_check_cs_c5c_presentation.mjs --timeout 300000`
//
// ── Browser Harness v1 migration（2026-09-04）──────────────────────────────
// 這支是 2026-09-03 那次「終止上一個卡住行程的瞬間，以 `mirage Battle mount
// timeout` 失敗；乾淨環境隔離重跑後 completed:true / exit=0」的當事 gate。
// 原本的寫法：`runMap()` 裡任何 timeout／canvas 拿不到／seek 沒 commit
// 都直接 `throw`，外層 `catch` 接住後一律 `process.exitCode = 1`——跟兩行
// HTTP 狀態檢查失敗**用的是同一個訊號**，事後完全分不出「這次紅是環境問題
// 還是產品真的壞了」。改用 `runGate()`：任何從 `run()` 逃出的例外（包含
// `${mapKey} Battle mount timeout` 這類）自動分類成 `HARNESS_FAIL`，不會被
// 誤讀成產品 regression；HTTP 狀態與 console/page error 檢查則改用 `ck()`
// 明確表達成產品斷言（判斷條件與原本完全相同，只是從靜默的
// `process.exitCode=1` 變成看得到、算得出來的一條）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runGate, finishGate } from "./browser/harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "artifacts/cs-c5c/owner-review");
const MAPS = { mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" };
const TARGET_MAPS = (process.env.C5C_MAPS || Object.keys(MAPS).join(",")).split(",").map((key) => key.trim()).filter((key) => MAPS[key]);
const WIDTH = Number(process.env.C5C_WIDTH || 1366);
const HEIGHT = Number(process.env.C5C_HEIGHT || 900);
const mobile = WIDTH <= 600;

const waitFor = async (chrome, expression, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${label} timeout`);
};

async function pauseBattle(chrome) {
  await chrome.evaluate(`const button=[...document.querySelectorAll('button')].find((node)=>node.textContent.includes('❚❚'));if(button)button.click();return true;`);
  await new Promise((r) => setTimeout(r, 150));
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
    await new Promise((r) => setTimeout(r, 80));
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

async function runMap(chrome, base, mapKey, seed) {
  const url = `${base}?c5c=battle&map=${mapKey}&seed=${seed}`;
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
  await new Promise((r) => setTimeout(r, 220));
  const manualAfterFocus = await chrome.evaluate(`return Boolean((window.__ESMO_FPS_SCENE__?.cam&&!window.__ESMO_FPS_SCENE__.cam.autoFollow)||window.__ESMO_FPS_SCENE__?.liveRef?.current?.selected)`);
  await chrome.evaluate(`const button=[...document.querySelectorAll('button')].find((node)=>node.textContent.includes('重新置中'));if(button)button.click();return true;`);
  await new Promise((r) => setTimeout(r, 160));
  const sample = await chrome.evaluate(`return (()=>{const presentation=window.__ESMO_C5C_PRESENTATION__||{};const diagnostics=presentation.diagnostics||{};const audio=window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||{};const scene=window.__ESMO_FPS_SCENE__||{};const canvas=document.querySelector('canvas');const text=document.body.innerText||'';return {mapKey:${JSON.stringify(mapKey)},completed:Boolean(scene.liveRef?.current?.sim?.completed),frameCount:Number(scene.liveRef?.current?.sim?.frames?.length||0),presentation:{...diagnostics,roundStartEvents:Number(diagnostics.roundStartEvents||0),roundEndEvents:Number(diagnostics.roundEndEvents||0),bombEvents:Number(diagnostics.objectiveEvents||0),clutchEvents:Number(diagnostics.clutchEvents||0),feedCount:Number(diagnostics.feedCount||0),eventFrameCount:${frames.eventFrames.length},eventTypes:${JSON.stringify(frames.eventTypes)}},audio:{assetSource:audio.assetSource||null,presentationCueStarts:Number(audio.presentationCueStarts||0),recordedSourceStarts:Number(audio.recordedSourceStarts||0),activeVoices:Number(audio.activeVoices||0),loadErrors:audio.loadErrors||{}},camera:{directorSwitches:Number(diagnostics.directorSwitches||0),manualOverrideSamples:${manualAfterFocus ? 1 : 0},rapidSwitches:Number(diagnostics.rapidDirectorSwitches||0)},c2c:window.__ESMO_FPS_C2A__||null,p0:window.__ESMO_FPS_P0_CONTRACT__||null,canvas:canvas?{width:canvas.clientWidth,height:canvas.clientHeight,bufferWidth:canvas.width,bufferHeight:canvas.height}:null,browserErrors:{console:[],page:[]},hud:{killFeed:Boolean(document.querySelector('[data-testid="cs-c5c-kill-feed"]')),bomb:Boolean(document.querySelector('[data-testid="cs-c5c-bomb-status"]')),history:Boolean(document.querySelector('[data-testid="cs-c5c-round-history"]')),textIncludesChinese:/[一-鿿]/.test(text)},manualFocusAttempt:Boolean(${manual?.ok ? "true" : "false"}),firstShot:${JSON.stringify(firstShot)}};})()`);
  sample.browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
  return sample;
}

const result = await runGate({
  name: "CS-C5C match presentation",
  base: "/ESMO-/",
  run: async ({ chrome, url, ck }) => {
    chrome.__c5cBase = url;
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile });
    const results = [];
    for (const [index, mapKey] of TARGET_MAPS.entries()) results.push(await runMap(chrome, url, mapKey, 505001 + index * 17));

    //  ⚠ 排空 body（`.arrayBuffer()`）——不排空的話 undici 不會回收這個
    //    keep-alive socket，process 會多等它自己的 idle timeout 才真的退出。
    const drain = async (u) => { const r = await fetch(u); await r.arrayBuffer().catch(() => {}); return r.status; };
    const ownerStatus = await drain(`${url}artifacts/cs-c5c/owner-review.html`);
    const battleStatus = await drain(`${url}?c5c=battle&map=mirage&seed=505001`);
    const payload = {
      generatedAt: new Date().toISOString(), source: "C5C Battle runtime browser evidence",
      viewport: { width: WIDTH, height: HEIGHT, mode: mobile ? "mobile" : "desktop" },
      http: { ownerReview: ownerStatus, battle: battleStatus }, results,
    };
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, `runtime-evidence-${mobile ? "mobile" : "desktop"}.json`), JSON.stringify(payload, null, 2), "utf8");
    console.log(JSON.stringify(payload, null, 2));

    //  ⚠ 這兩條與原本的 `process.exitCode = 1` 判斷條件逐字相同——只是從
    //    靜默旗標改成看得到、算得出來的 `ck()`。沒有放寬也沒有收緊任何斷言。
    for (const r of results) {
      ck(`${r.mapKey} console/page errors = 0`,
        r.browserErrors.console.length === 0 && r.browserErrors.page.length === 0,
        JSON.stringify(r.browserErrors));
    }
    ck("owner-review.html 可連得到（HTTP 200）", ownerStatus === 200, `status=${ownerStatus}`);
    ck("battle 路由可連得到（HTTP 200）", battleStatus === 200, `status=${battleStatus}`);
  },
});

await finishGate(result);
