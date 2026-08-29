#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchChrome } from "./browser/cdp.mjs";

const APP_BASE = process.env.CS_C5A_APP_URL || "http://127.0.0.1:5173/ESMO-/";
const CDP_PORT = Number(process.env.CS_C5A2_CLOCK_CDP_PORT || 9690);
const OUT = process.env.CS_C5A2_CLOCK_OUT || path.resolve("artifacts/cs-c5a2/runtime-clock-evidence.json");
const WIDTH = Number(process.env.CS_C5A2_CLOCK_WIDTH || 1366);
const HEIGHT = Number(process.env.CS_C5A2_CLOCK_HEIGHT || 768);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const allMaps = { mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" };
const onlyMap = process.env.CS_C5A2_ONLY_MAP;
const maps = onlyMap && allMaps[onlyMap] ? { [onlyMap]: allMaps[onlyMap] } : allMaps;

async function waitFor(chrome, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return true; } catch {}
    await sleep(250);
  }
  throw new Error(`${label} timeout`);
}

async function clickByText(chrome, predicate, label) {
  const result = await chrome.evaluate(`
    const button = [...document.querySelectorAll("button")].find((node) => (${predicate})(node, (node.innerText || "").replace(/\\s+/g, " ").trim()));
    if (!button || button.disabled) return { ok: false };
    button.click(); return { ok: true };
  `);
  if (!result?.ok) throw new Error(`${label} failed`);
}

async function enterBattle(chrome, mapKey, mapTitle) {
  await waitFor(chrome, `document.querySelector("button") && document.body.innerText.includes("CS")`, 30_000, "CS entry");
  console.log(`${mapKey} CS entry ready`);
  await clickByText(chrome, `(node, text) => text.includes("CS")`, "CS mode");
  console.log(`${mapKey} CS mode clicked`);
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "CS prep");
  console.log(`${mapKey} prep ready`);
  let prep = await chrome.evaluate(`const b=document.querySelector('[data-testid="prep-primary-action"]');return b&&!b.disabled?{ok:true,action:b.dataset.action}:{ok:false,action:b?.dataset.action};`);
  if (!prep.ok && prep.action === "blocked") {
    await clickByText(chrome, `(node, text) => text.includes("Auto") || text.includes("自動")`, "auto prep");
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 15_000, "queue confirm");
    prep = await chrome.evaluate(`const b=document.querySelector('[data-testid="prep-primary-action"]');b.click();return {ok:true,action:b.dataset.action};`);
  } else if (prep.ok) await chrome.evaluate(`document.querySelector('[data-testid="prep-primary-action"]')?.click();return true;`);
  if (prep.action === "enqueue") await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "queue");
  if (await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm";`)) await chrome.evaluate(`document.querySelector('[data-testid="prep-primary-action"]')?.click();return true;`);
  await waitFor(chrome, `document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "map picker");
  console.log(`${mapKey} map picker ready`);
  await chrome.evaluate(`document.querySelector('[data-map-key="${mapKey}"]')?.click();return true;`);
  console.log(`${mapKey} map selected`);
  await chrome.evaluate(`const bs=[...document.querySelectorAll("button")].filter((b)=>!b.disabled&&!b.dataset.mapKey);bs.at(-1)?.click();return true;`);
  await waitFor(chrome, `!document.querySelector('[data-map-key="${mapKey}"]') && document.body.innerText.includes(${JSON.stringify(mapTitle)})`, 30_000, "map confirm");
  console.log(`${mapKey} map confirmed`);
  await clickByText(chrome, `(node, text) => text.length > 20 && !text.includes("Cancel") && !text.includes("取消")`, "tactic confirm");
  console.log(`${mapKey} tactic clicked`);
  await chrome.evaluate(`const bs=[...document.querySelectorAll("button")].filter((b)=>!b.disabled);bs.at(-1)?.click();return true;`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 45_000, "Battle runtime");
  console.log(`${mapKey} Battle controls ready`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-camera-presets"]')`, 10_000, "camera controls");
}

async function setSpeed(chrome, rate) {
  await chrome.evaluate(`document.querySelector('[data-testid="match-speed-${rate}"]')?.click();return true;`);
  await waitFor(chrome, `document.querySelector('[data-testid="match-speed-${rate}"]')?.getAttribute("aria-pressed") === "true"`, 5_000, `speed ${rate}`);
}

async function trustedClick(chrome, selector) {
  const rect = await chrome.evaluate(`return (()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)return null;n.scrollIntoView({block:"center",inline:"center"});const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  if (!rect) throw new Error(`trusted click target missing: ${selector}`);
  await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
}

async function seekFrame(chrome, index) {
  await chrome.evaluate(`return (()=>{const input=document.querySelector('input[type="range"]');if(!input)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;if(!setter)return false;setter.call(input,String(${index}));input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;})()`);
  await sleep(220);
}

async function sampleClock(chrome, rate, count = 9, intervalMs = 500) {
  await setSpeed(chrome, rate);
  await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=true;return true;`);
  return chrome.evaluate(`
    const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms)); const out=[];
    for(let i=0;i<${count};i++){
      const st=window.__ESMO_FPS_SCENE__,live=st?.liveRef?.current,frame=live?.sim?.frames?.[live?.fIdx];
      out.push({wallClockMs:performance.now(),simulationTimeSec:Number(frame?.ts),roundSec:Number(frame?.roundSec),frameIndex:live?.fIdx,displayedTimerText:document.querySelector('[data-testid="cs-match-timer"]')?.textContent?.trim()||null,clock:window.__ESMO_FPS_CLOCK__||null});
      await wait(${intervalMs});
    } return out;
  `);
}

function summarizeClock(samples) {
  const rates = [];
  for (let i = 1; i < samples.length; i++) {
    const wall = (samples[i].wallClockMs - samples[i - 1].wallClockMs) / 1000;
    const sim = samples[i].simulationTimeSec - samples[i - 1].simulationTimeSec;
    if (wall > 0 && Number.isFinite(sim)) rates.push(sim / wall);
  }
  const timers = samples.map((s) => /^\d+:\d+$/.test(s.displayedTimerText || "") ? {
    text: s.displayedTimerText,
    sec: Number(s.displayedTimerText.split(":")[0]) * 60 + Number(s.displayedTimerText.split(":")[1]),
  } : null).filter(Boolean);
  const first=samples[0],last=samples.at(-1);const wallSec=first&&last?(last.wallClockMs-first.wallClockMs)/1000:0;
  return { samples, simulationRateSecPerWallSec: rates, overallSimulationRateSecPerWallSec:wallSec>0?(last.simulationTimeSec-first.simulationTimeSec)/wallSec:null, simulationMonotonic:samples.every((v,i)=>i===0||v.simulationTimeSec>=samples[i-1].simulationTimeSec), frameMonotonic:samples.every((v,i)=>i===0||v.frameIndex>=samples[i-1].frameIndex), timerMonotonic:timers.every((v, i) => i === 0 || v.sec <= timers[i - 1].sec), timerSamples: timers };
}

async function readRuntime(chrome, mapKey) {
  return chrome.evaluate(`return (()=>{
    const st=window.__ESMO_FPS_SCENE__,live=st?.liveRef?.current,sim=live?.sim,frames=sim?.frames||[];
    const moving=[],allSteps=[]; for(const frame of frames)for(const p of frame.players||[]){const q=p.prevPos||p.pos,step=Math.hypot(Number(p.pos?.x)-Number(q?.x),Number(p.pos?.y)-Number(q?.y));if(Number.isFinite(step)){allSteps.push(step);if(!frame.buyP&&step>0.05&&(p.state==="ROTATE"||p.state==="EXECUTE"||p.state==="撤退"))moving.push(step);}}
    const projectiles=new Map();for(const frame of frames)for(const tw of frame.throwables||[]){let item=projectiles.get(tw.id);if(!item){item={id:tw.id,type:tw.type,startTs:Number(frame.ts),startRoundSec:Number(frame.roundSec),from:tw.from,to:tw.to,flightDistance:tw.flightDistance??null,flightDurationSec:tw.flightDurationSec??null,velocityUnitsPerSec:tw.velocityUnitsPerSec??null,arcHeightUnits:tw.arcHeightUnits??null};projectiles.set(tw.id,item);}if(tw.detonate&&!item.detonateTs){item.detonateTs=Number(frame.ts);item.travelSec=Number((Number(frame.ts)-item.startTs).toFixed(3));}if(tw.velocityUnitsPerSec!=null)item.velocityUnitsPerSec=tw.velocityUnitsPerSec;}
    const projectileList=[...projectiles.values()].filter((item)=>item.detonateTs!=null).slice(0,40);
    const byType={};for(const item of projectileList)(byType[item.type]??=[]).push(item.travelSec);
    const median=(values)=>{const x=[...values].sort((a,b)=>a-b);return x.length?x[Math.floor((x.length-1)/2)]:null;};
    const deathIndex=frames.findIndex((frame,i)=>i>0&&(frame.players||[]).some((p)=>p.dead&&!frames[i-1].players?.find((q)=>q.id===p.id)?.dead));
    return {mapKey:${JSON.stringify(mapKey)},frameCount:frames.length,simStepSec:live?.playbackFrameSec??null,movement:{movingSamples:moving.length,medianStep:moving.length?median(moving):null,maxStep:allSteps.length?Math.max(...allSteps):null,medianSpeedUnitsPerSec:moving.length?Number((median(moving)/(live?.playbackFrameSec||0.5)).toFixed(4)):null,maxSpeedUnitsPerSec:allSteps.length?Number((Math.max(...allSteps)/(live?.playbackFrameSec||0.5)).toFixed(4)):null,movementAudit:sim?.movementAudit||null},projectiles:{count:projectileList.length,byType:Object.fromEntries(Object.entries(byType).map(([type,values])=>[type,{samples:values.length,medianTravelSec:median(values),minTravelSec:Math.min(...values),maxTravelSec:Math.max(...values)}])),samples:projectileList},deathIndex,c2c:window.__ESMO_FPS_C2A__||null,clock:window.__ESMO_FPS_CLOCK__||null,audio:window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||null,visibility:window.__ESMO_FPS_VISIBILITY__||null,camera:{focus:false,radius:st?.cam?.dRadius,manualRadius:st?.cam?.manualRadius,overview:st?.cam?.overview}};
  })()`);
}

async function cameraEvidence(chrome) {
  await chrome.evaluate(`document.querySelector('[data-esmo-fps-player-card]')?.click();return true;`);
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?._chase?.alive === true`, 5_000, "focus camera");
  const focusBefore = await chrome.evaluate(`return {radius:window.__ESMO_FPS_SCENE__.cam.dRadius,manual:window.__ESMO_FPS_SCENE__.cam.manualRadius,tracking:Boolean(window.__ESMO_FPS_SCENE__._chase?.alive)};`);
  const wheel = async (deltaY) => chrome.evaluate(`const c=document.querySelector("canvas");c?.dispatchEvent(new WheelEvent("wheel",{deltaY:${deltaY},bubbles:true,cancelable:true}));return true;`);
  await wheel(650); await sleep(260); const focusOut = await chrome.evaluate(`return {radius:window.__ESMO_FPS_SCENE__.cam.dRadius,manual:window.__ESMO_FPS_SCENE__.cam.manualRadius,tracking:Boolean(window.__ESMO_FPS_SCENE__._chase?.alive)};`);
  await wheel(-650); await sleep(260); const focusIn = await chrome.evaluate(`return {radius:window.__ESMO_FPS_SCENE__.cam.dRadius,manual:window.__ESMO_FPS_SCENE__.cam.manualRadius,tracking:Boolean(window.__ESMO_FPS_SCENE__._chase?.alive)};`);
  await chrome.evaluate(`document.querySelector('[data-testid="cs-camera-preset-overview"]')?.click();return true;`); await sleep(900);
  const overviewBefore = await chrome.evaluate(`return {radius:window.__ESMO_FPS_SCENE__.cam.dRadius,autoFollow:window.__ESMO_FPS_SCENE__.cam.autoFollow};`);
  await wheel(650); await sleep(260); const overviewAfter = await chrome.evaluate(`return {radius:window.__ESMO_FPS_SCENE__.cam.dRadius,manual:window.__ESMO_FPS_SCENE__.cam.manualRadius,autoFollow:window.__ESMO_FPS_SCENE__.cam.autoFollow};`);
  return {focusBefore,focusOut,focusIn,overviewBefore,overviewAfter,focusZoomOutChanged:focusOut.radius>focusBefore.radius,focusZoomInChanged:focusIn.radius<focusOut.radius,focusTracks:Boolean(focusOut.tracking&&focusIn.tracking),overviewZoomOutChanged:overviewAfter.radius>overviewBefore.radius};
}

async function runMap(mapKey, index) {
  console.log(`${mapKey} launch`);
  const chrome = await launchChrome({ url: `${APP_BASE}?fpsRigged=all&fpsC2cHero=all`, port: CDP_PORT + index, headless: true });
  try {
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 600 });
    await chrome.navigate(`${APP_BASE}?fpsRigged=all&fpsC2cHero=all`);
    if (process.env.CS_C5A2_TEST_SEED) {
      const fixedNow = Number(process.env.CS_C5A2_TEST_SEED);
      if (Number.isFinite(fixedNow)) await chrome.evaluate(`const __esmoSeedClockStart=performance.now();Date.now=()=>${Math.trunc(fixedNow)}+Math.floor(performance.now()-__esmoSeedClockStart);return true;`);
    }
    console.log(`${mapKey} navigated`);
    await enterBattle(chrome, mapKey, maps[mapKey]);
    console.log(`${mapKey} Battle entered`);
    const firstLive = await chrome.evaluate(`return {nonBuy:window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames?.findIndex((f)=>!f.buyP)??0,death:window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames?.findIndex((f,i)=>i>0&&f.players?.some((p)=>p.dead&&!window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames[i-1].players?.find((q)=>q.id===p.id)?.dead))??-1};`);
    await seekFrame(chrome, Math.max(0, firstLive.nonBuy));
    const clock1x = summarizeClock(await sampleClock(chrome, 1));
    await seekFrame(chrome, Math.max(0, firstLive.nonBuy));
    const clock24x = summarizeClock(await sampleClock(chrome, 2.4));
    await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live?.playing){const button=[...document.querySelectorAll("button")].find((node)=>(node.textContent||"").includes("❚❚"));button?.click();}return true;`);
    await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.playing === false`, 5_000, `${mapKey} camera evidence pause`);
    const camera = await cameraEvidence(chrome);
    if (firstLive.death >= 0) await seekFrame(chrome, firstLive.death);
    await sleep(700);
    const death = await chrome.evaluate(`return (()=>{const c=window.__ESMO_FPS_C2A__||{};return {rigged:c.rigged,fallback:c.fallback,dead:Object.entries(c.players||{}).filter(([,p])=>p.animation==="death"||p.deathGroundContactY!=null).map(([id,p])=>({id,minY:p.currentBounds?.min?.[1]??null,contactY:p.deathGroundContactY??null,correction:p.deathGroundCorrection??null}))};})()`);
    const soundAttempt = await chrome.evaluate(`return {button:Boolean(document.querySelector('button[title="音效關"]')),audioContext:Boolean(window.AudioContext||window.webkitAudioContext),before:window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||null};`);
    console.log(`${mapKey} audio preflight=${JSON.stringify(soundAttempt)}`);
    // Seeking across a round boundary can leave the dismissible round result
    // overlay above the in-canvas sound control. Clear that presentation layer
    // before issuing the trusted gesture; it is unrelated to audio loading.
    await chrome.evaluate(`const overlay=[...document.querySelectorAll("div")].find((node)=>getComputedStyle(node).zIndex==="60");overlay?.click();return Boolean(overlay);`);
    await trustedClick(chrome, 'button[title="音效關"]');
    await sleep(2500);
    console.log(`${mapKey} audio after click=${JSON.stringify(await chrome.evaluate(`const d=window.__ESMO_FPS_AUDIO_DIAGNOSTICS__;return {enabled:Boolean(document.querySelector('button[title="音效開"]')),loadedProfiles:d?.loadedProfiles||0,contextState:d?.contextState||null,loadErrors:d?.loadErrors||{}};`))} consoleErrors=${chrome.consoleLines.filter((line)=>line.startsWith("[error]")).length} pageErrors=${chrome.pageErrors.length}`);
    await waitFor(chrome, `document.querySelector('button[title="音效開"]') && window.__ESMO_FPS_AUDIO_DIAGNOSTICS__`, 30_000, `${mapKey} sound enabled`);
    await waitFor(chrome, `window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.loadedProfiles === 5`, 30_000, `${mapKey} audio assets`);
    const audioFrameTarget = await chrome.evaluate(`return (()=>{const frames=window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames||[];for(let i=0;i<frames.length;i++){const f=frames[i],start=Number(f.roundSec)*1000,end=start+500,events=(f.muzzles||[]).filter((m)=>Number(m.shotAtMs)>=start&&Number(m.shotAtMs)<end),automatic=events.filter((m)=>m.weaponFamily==="rifle"||m.weaponFamily==="smg");if(automatic.length>=2)return {index:i,eventIds:events.map((m)=>m.eventId),families:events.map((m)=>m.weaponFamily),automaticCount:automatic.length};}return null;})()`);
    await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live?.playing){[...document.querySelectorAll("button")].find((button)=>(button.textContent||"").includes("❚❚"))?.click();}return true;`);
    await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.playing === false`, 5_000, `${mapKey} audio parity pause`);
    if (audioFrameTarget) await seekFrame(chrome, Math.max(0, audioFrameTarget.index - 1));
    const audioBefore = await chrome.evaluate(`window.__ESMO_FPS_AUDIO_API__?.resetGunfireEvents?.();const d=window.__ESMO_FPS_AUDIO_DIAGNOSTICS__;return {dispatchCalls:d?.dispatchCalls||0,shotCalls:d?.shotCalls||0,duplicateDispatches:d?.duplicateDispatches||0,recordedSourceStarts:d?.recordedSourceStarts||0,eventCount:d?.events?.length||0};`);
    if (audioFrameTarget) await seekFrame(chrome, audioFrameTarget.index);
    await sleep(350);
    const audioAfterParity = await chrome.evaluate(`const d=window.__ESMO_FPS_AUDIO_DIAGNOSTICS__;return {dispatchCalls:d?.dispatchCalls||0,shotCalls:d?.shotCalls||0,duplicateDispatches:d?.duplicateDispatches||0,recordedSourceStarts:d?.recordedSourceStarts||0,eventIds:(d?.events||[]).slice(${Number(0)}).map((event)=>event.eventId)};`);
    const expectedAudioEvents = audioFrameTarget?.eventIds?.length || 0;
    const audioFrameParity = {target:audioFrameTarget,expected:expectedAudioEvents,dispatchDelta:audioAfterParity.dispatchCalls-audioBefore.dispatchCalls,shotDelta:audioAfterParity.shotCalls-audioBefore.shotCalls,duplicateDelta:audioAfterParity.duplicateDispatches-audioBefore.duplicateDispatches,recordedLayerDelta:audioAfterParity.recordedSourceStarts-audioBefore.recordedSourceStarts,matchedIds:(audioFrameTarget?.eventIds||[]).every((id)=>audioAfterParity.eventIds.includes(id))};
    await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live&&!live.playing){[...document.querySelectorAll("button")].find((button)=>(button.textContent||"").includes("▶"))?.click();}return true;`);
    await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.playing === true`, 5_000, `${mapKey} audio parity resume`);
    await setSpeed(chrome, 4);
    await waitFor(chrome, `window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.recordedSourceStarts > 0`, 30_000, `${mapKey} recorded Battle playback`);
    const familyIndices = await chrome.evaluate(`return (()=>{const frames=window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames||[],out={};frames.forEach((f,i)=>(f.muzzles||[]).forEach((m)=>{const key=m.weaponFamily||m.cls;if(key&&!Number.isFinite(out[key]))out[key]=i;}));return out;})()`);
    for (const family of ["pistol", "smg", "rifle", "sniper", "shotgun"]) {
      if (Number.isFinite(Number(familyIndices?.[family]))) { await seekFrame(chrome, Number(familyIndices[family])); await sleep(180); }
    }
    const runtime = await readRuntime(chrome, mapKey);
    runtime.clock1x = clock1x; runtime.clock24x = clock24x; runtime.camera = camera; runtime.death = death; runtime.audio = runtime.audio; runtime.audioFrameParity = audioFrameParity;
    runtime.audioFamiliesPlayed = [...new Set((runtime.audio?.playbackEvents||[]).map((event)=>event.family))];
    runtime.browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
    if (runtime.browserErrors.console.length || runtime.browserErrors.page.length) throw new Error(`${mapKey} browser errors: ${JSON.stringify(runtime.browserErrors)}`);
    console.log(`PASS ${mapKey} 1x=${clock1x.simulationRateSecPerWallSec.map((v)=>v.toFixed(2)).join(",")} 2.4x=${clock24x.simulationRateSecPerWallSec.map((v)=>v.toFixed(2)).join(",")} gunStarts=${runtime.audio?.recordedSourceStarts} families=${runtime.audioFamiliesPlayed.join(",")}`);
    return runtime;
  } finally { await chrome.close().catch(() => {}); }
}

const results = [];
for (const [index, mapKey] of Object.keys(maps).entries()) results.push(await runMap(mapKey, index));
const checks = [];
const check = (label, ok) => { checks.push({ label, ok: Boolean(ok) }); console.log(`${ok ? "PASS" : "FAIL"} ${label}`); };
results.forEach((result) => {
  check(`${result.mapKey} 1x simulation/frame/timer monotonic`, result.clock1x.simulationMonotonic && result.clock1x.frameMonotonic && result.clock1x.timerMonotonic && result.clock1x.overallSimulationRateSecPerWallSec > 0.7 && result.clock1x.overallSimulationRateSecPerWallSec < 1.3);
  check(`${result.mapKey} 2.4x simulation/frame/timer monotonic`, result.clock24x.simulationMonotonic && result.clock24x.frameMonotonic && result.clock24x.timerMonotonic && result.clock24x.overallSimulationRateSecPerWallSec > 1.8 && result.clock24x.overallSimulationRateSecPerWallSec < 2.8);
  check(`${result.mapKey} movement collision audit`, Number(result.movement.movementAudit?.blockedPositions || 0) === 0 && Number(result.movement.movementAudit?.wallSegmentCrossings || 0) === 0 && Number(result.movement.movementAudit?.teleportViolations || 0) === 0);
  check(`${result.mapKey} grenade/smoke authoritative travel`, result.projectiles.samples.length > 0 && result.projectiles.samples.every((item) => item.travelSec >= 0.5 && item.travelSec <= 2.5 && item.flightDurationSec >= 0.55 && item.flightDurationSec <= 2.4 && item.velocityUnitsPerSec > 0 && item.arcHeightUnits >= 2.8 && item.arcHeightUnits <= 6.8));
  check(`${result.mapKey} C2C 10/10 no fallback`, result.c2c?.rigged === 10 && result.c2c?.fallback === 0);
  check(`${result.mapKey} corpse ground contact`, result.death?.dead?.length > 0 && result.death.dead.every((item) => item.contactY == null || Math.abs(item.contactY) < 0.01));
  check(`${result.mapKey} focus/overview wheel zoom`, result.camera.focusZoomOutChanged && result.camera.focusZoomInChanged && result.camera.focusTracks && result.camera.overviewZoomOutChanged);
  check(`${result.mapKey} recorded Battle audio path`, result.audio?.loadedProfiles === 5 && result.audio?.contextState === "running" && result.audio?.recordedSourceStarts > 0 && result.audio?.gunfireSourcePolicy === "one-recorded-buffer-per-shot" && result.audio?.synthesizedToneStarts === 0 && (result.audio?.playbackEvents||[]).every((event)=>event.layer==="prepared-direct"&&event.sourceNode==="AudioBufferSourceNode") && !Object.keys(result.audio?.loadErrors || {}).length);
  check(`${result.mapKey} authoritative shot/audio 1:1`, result.audioFrameParity?.expected >= 2 && result.audioFrameParity.dispatchDelta === result.audioFrameParity.expected && result.audioFrameParity.shotDelta === result.audioFrameParity.expected && result.audioFrameParity.duplicateDelta === 0 && result.audioFrameParity.recordedLayerDelta === result.audioFrameParity.expected && result.audioFrameParity.matchedIds);
});
const audioFamilies = new Set(results.flatMap((result) => result.audioFamiliesPlayed || []));
if(results.length===3)check("Battle runtime played all five recorded families", audioFamilies.size === 5);
else check("selected-map Battle runtime played recorded gunfire", audioFamilies.size > 0);
const failed = checks.filter((item) => !item.ok);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), source: "C5A.2 runtime clock/projectile/audio/camera verifier", appBase: APP_BASE, results }, null, 2), "utf8");
console.log(`C5A.2 runtime verifier: ${OUT}`);
if (failed.length) process.exitCode = 1;
