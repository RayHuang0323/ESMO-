#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchChrome } from "./browser/cdp.mjs";

const APP_BASE = process.env.CS_C5A_APP_URL || "http://127.0.0.1:5470/ESMO-/";
const CDP_PORT = Number(process.env.CS_C5A2_CDP_PORT || 9470);
const WIDTH = Number(process.env.CS_C5A2_VIEWPORT_WIDTH || 1366);
const HEIGHT = Number(process.env.CS_C5A2_VIEWPORT_HEIGHT || 768);
const OUTPUT_DIR = process.env.CS_C5A2_CAPTURE_DIR || path.resolve("artifacts/cs-c5a2/baseline-audit");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (!button || button.disabled) return { ok: false, buttons: [...document.querySelectorAll("button")].map((node) => (node.innerText || "").replace(/\\s+/g, " ").trim()).slice(0, 60) };
    const text = (button.innerText || "").replace(/\\s+/g, " ").trim(); button.click(); return { ok: true, text };
  `);
  if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  return result;
}

async function prepAction(chrome) {
  return chrome.evaluate(`
    const button = document.querySelector('[data-testid="prep-primary-action"]');
    if (!button || button.disabled) return { ok: false, action: button?.dataset.action ?? null };
    const action = button.dataset.action; button.click(); return { ok: true, action };
  `);
}

async function enterBattle(chrome, mapKey, mapTitle) {
  await waitFor(chrome, `document.querySelector("button") && document.body.innerText.includes("CS")`, 30_000, "CS 入口");
  await clickByText(chrome, `(node, text) => text.includes("CS")`, "CS 模式");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "CS 準備頁");
  let prep = await prepAction(chrome);
  if (!prep.ok && prep.action === "blocked") {
    await clickByText(chrome, `(node, text) => text.includes("Auto") || text.includes("自動")`, "自動準備");
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 15_000, "佇列確認");
    prep = await prepAction(chrome);
  }
  if (!prep.ok) throw new Error(`準備流程不可用: ${JSON.stringify(prep)}`);
  if (prep.action === "enqueue") {
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "進入地圖選擇");
    if (await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm";`)) await prepAction(chrome);
  }
  await waitFor(chrome, `document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "地圖選擇");
  await chrome.evaluate(`document.querySelector('[data-map-key="${mapKey}"]')?.click(); return true;`);
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled&&!node.dataset.mapKey); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `!document.querySelector('[data-map-key="${mapKey}"]') && document.body.innerText.includes(${JSON.stringify(mapTitle)})`, 30_000, "地圖確認");
  await clickByText(chrome, `(node, text) => text.length > 20 && !text.includes("Cancel") && !text.includes("取消")`, "戰術確認");
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 45_000, "Battle runtime");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-camera-presets"]')`, 10_000, "鏡頭控制");
}

function readGunAuthority() {
  const source = fs.readFileSync(path.resolve("src/battle/fps/EsportsFPS3D.jsx"), "utf8");
  const block = source.match(/const GUNS=\{([\s\S]*?)\n\};/)?.[1] || "";
  const guns = [...block.matchAll(/(\w+):\{name:"([^"]+)",dmg:(\d+),hs:([\d.]+),cls:"([^"]+)",rof:(\d+)/g)].map((m) => ({
    id: m[1], name: m[2], damage: Number(m[3]), headshot: Number(m[4]), cls: m[5], profileCadenceHz: Number(m[6]), profileIntervalMs: Math.round(1000 / Number(m[6])),
  }));
  const family = (cls) => cls === "手槍" ? "pistol" : cls === "衝鋒" ? "smg" : cls === "狙擊" ? "sniper" : "rifle";
  return { guns: guns.map((gun) => ({ ...gun, family: family(gun.cls) })), shotgunEntries: guns.filter((gun) => gun.cls === "霰彈").length };
}

async function readRuntime(chrome, mapKey) {
  return chrome.evaluate(`return (() => {
    const st=window.__ESMO_FPS_SCENE__, live=st?.liveRef?.current, sim=live?.sim, frames=sim?.frames||[];
    const shots=[];
    const stateCounts={};
    const routeSamples=[];
    const stepSamples=[];
    const teleportSamples=[];
    const authoritativeIds=new Set((sim?.shotCadenceTelemetry||[]).map((event)=>event.eventId));
    const muzzleCounts=new Map(),tracerCounts=new Map(),singleTriggerFrameViolations=[];let locomotionMismatches=0,locomotionChecks=0;
    frames.forEach((frame, frameIndex) => {
      const frameStart=Number(frame.roundSec)*1000,frameEnd=frameStart+500;
      (frame.muzzles||[]).filter((event)=>Number(event.shotAtMs)>=frameStart&&Number(event.shotAtMs)<frameEnd).forEach((event)=>shots.push({frameIndex,ts:Number(event.shotAtMs)/1000,round:Number(frame.rnd),roundSec:Number(frame.roundSec),attackerId:event.attackerId,gun:event.gun,family:event.weaponFamily||"unknown"}));
      (frame.muzzles||[]).filter((event)=>Number(event.shotAtMs)>=frameStart&&Number(event.shotAtMs)<frameEnd).forEach((event)=>muzzleCounts.set(event.eventId,(muzzleCounts.get(event.eventId)||0)+1));
      (frame.tracers||[]).filter((event)=>Number(event.shotAtMs)>=frameStart&&Number(event.shotAtMs)<frameEnd).forEach((event)=>tracerCounts.set(event.eventId,(tracerCounts.get(event.eventId)||0)+1));
      const singleTriggerCounts=new Map();
      (frame.muzzles||[]).filter((event)=>(event.weaponFamily==="pistol"||event.weaponFamily==="sniper")&&Number(event.shotAtMs)>=frameStart&&Number(event.shotAtMs)<frameEnd).forEach((event)=>{const key=String(event.attackerId)+":"+event.weaponFamily;singleTriggerCounts.set(key,(singleTriggerCounts.get(key)||0)+1);});
      singleTriggerCounts.forEach((count,key)=>{if(count>1)singleTriggerFrameViolations.push({frameIndex,key,count});});
      (frame.players||[]).forEach((player)=>{
        stateCounts[player.state]=(stateCounts[player.state]||0)+1;
        if(Array.isArray(player.route)&&player.route.length>1)routeSamples.push({id:player.id,state:player.state,routeLength:player.route.length,routeIdx:player.routeIdx,round:Number(frame.rnd),roundSec:Number(frame.roundSec)});
        const previous=player.prevPos||player.pos;
        const dx=Number(player.pos?.x)-Number(previous?.x),dy=Number(player.pos?.y)-Number(previous?.y);
        const step=Math.hypot(dx,dy); if(Number.isFinite(step)){stepSamples.push(step);if(step>1.5&&teleportSamples.length<40)teleportSamples.push({id:player.id,round:Number(frame.rnd),roundSec:Number(frame.roundSec),state:player.state,from:previous,to:player.pos,step:Number(step.toFixed(3))});}
        if(!frame.buyP&&!player.dead){const speed=Number(player.velocityUnitsPerSec);if(Number.isFinite(speed)){locomotionChecks+=1;const expected=speed<=0.22?"idle":speed<2.4?"walk":"run";if(player.locomotion!==expected)locomotionMismatches+=1;}}
      });
    });
    const byActor=new Map(); shots.forEach((shot)=>{const key=shot.attackerId+"|"+shot.round+"|"+shot.gun;const list=byActor.get(key)||[];list.push(shot);byActor.set(key,list);});
    const intervals=[]; byActor.forEach((list)=>{list.sort((a,b)=>a.ts-b.ts);for(let i=1;i<list.length;i++)intervals.push({family:list[i].family,gun:list[i].gun,intervalMs:Math.round((list[i].ts-list[i-1].ts)*1000),attackerId:list[i].attackerId,round:list[i].round});});
    const familyIntervals={}; intervals.forEach((item)=>{(familyIntervals[item.family]??=[]).push(item.intervalMs);});
    const summarize=(values)=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:sorted.length,minMs:sorted[0]??null,medianMs:sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null,maxMs:sorted.at(-1)??null};};
    const reaction=sim?.reactionTelemetry||[];
    const reactionSamples=reaction.filter((episode)=>Number.isFinite(episode.latencyMs));
    const lowHpStates={}; frames.forEach((frame)=>{(frame.players||[]).filter((player)=>Number(player.hp)<48&&!player.dead).forEach((player)=>{lowHpStates[player.state]=(lowHpStates[player.state]||0)+1;});});
    const stepSummary=summarize(stepSamples.map((v)=>Math.round(v*100)/100));
    const maxStep=stepSamples.reduce((max,value)=>Math.max(max,value),0);
    const eventParity={authoritative:authoritativeIds.size,muzzle:muzzleCounts.size,tracer:tracerCounts.size,muzzleExact:[...authoritativeIds].every((id)=>muzzleCounts.get(id)===1),tracerExact:[...authoritativeIds].every((id)=>tracerCounts.get(id)===1),sameIds:[...authoritativeIds].every((id)=>muzzleCounts.has(id)&&tracerCounts.has(id))&&[...muzzleCounts.keys()].every((id)=>authoritativeIds.has(id))&&[...tracerCounts.keys()].every((id)=>authoritativeIds.has(id))};
    const env=st?.c3Environment?.summary||null,c2c=window.__ESMO_FPS_C2A__||null;
    return {mapKey:${JSON.stringify(mapKey)},frameCount:frames.length,roundCount:sim?.roundHist?.length||0,finalScore:{t:sim?.tScore,ct:sim?.ctScore,winner:sim?.winner,phase:sim?.phase},roundTail:(sim?.roundHist||[]).slice(-8).map((round)=>({round:round.round,winner:round.winner,how:round.how,tS:round.tS,cS:round.cS,phase:round.phase,otGroup:round.otGroup})),completed:Boolean(sim?.completed),shots,shotCount:shots.length,uniqueShotCount:authoritativeIds.size,eventParity,singleTriggerFrameViolations,cadenceTelemetry:sim?.shotCadenceTelemetry||[],actualCadence:{intervals,familyIntervals:Object.fromEntries(Object.entries(familyIntervals).map(([key,values])=>[key,summarize(values)]))},reactionSummary:sim?.reactionSummary||null,reactionSamples:reaction.slice(0,160),stateCounts,lowHpStates,routeSamples:routeSamples.slice(0,120),movementAudit:sim?.movementAudit||null,navigationAudit:sim?.navigationAudit||null,locomotion:{checks:locomotionChecks,mismatches:locomotionMismatches},movement:{stepSummary,maxStep,nonFinite:stepSamples.length===0&&frames.length>0,teleportSamples},environment:env,c2c,audio:window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||null,visibility:window.__ESMO_FPS_VISIBILITY__||null,canvas:(()=>{const c=document.querySelector("canvas");return c?{width:c.clientWidth,height:c.clientHeight}:null;})(),browserErrors:{console:[],page:[]}};
  })()`);
}

const maps = process.env.CS_C5A2_ONLY_MAP ? [[process.env.CS_C5A2_ONLY_MAP, process.env.CS_C5A2_ONLY_MAP === "dust2" ? "Dust II" : process.env.CS_C5A2_ONLY_MAP === "inferno" ? "Inferno" : "Mirage"]] : [["mirage", "Mirage"], ["dust2", "Dust II"], ["inferno", "Inferno"]];
const results = [];
const authority = readGunAuthority();
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
for (const [index, [mapKey, mapTitle]] of maps.entries()) {
  const chrome = await launchChrome({ url: `${APP_BASE}?fpsRigged=all&fpsC2cHero=all`, port: CDP_PORT + index, headless: true });
  try {
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 600 });
    await chrome.navigate(`${APP_BASE}?fpsRigged=all&fpsC2cHero=all`);
    await enterBattle(chrome, mapKey, mapTitle);
    await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);
    await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames?.some((frame)=>Boolean(frame.muzzles?.length))`, 15_000, `${mapKey} fire evidence`);
    await waitFor(chrome, `window.__ESMO_FPS_C2A__?.rigged === 10`, 15_000, `${mapKey} C2C rigged roster`);
    await sleep(500);
    const runtime = await readRuntime(chrome, mapKey);
    runtime.browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
    results.push(runtime);
    const intervalValues = runtime.actualCadence.intervals.map((item) => item.intervalMs);
    const cadence = intervalValues.length ? `${Math.min(...intervalValues)}-${Math.max(...intervalValues)}ms` : "無後續射擊樣本";
    console.log(`BASELINE ${mapKey} shots=${runtime.shotCount} reactionMedian=${runtime.reactionSummary?.medianMs ?? "—"}ms actualCadence=${cadence} states=${Object.keys(runtime.stateCounts).join(",")}`);
  } finally { await chrome.close().catch(() => {}); }
}
const payload = { generatedAt: new Date().toISOString(), source: "C5A.2 deterministic browser audit baseline", authority, results };
fs.writeFileSync(path.join(OUTPUT_DIR, "runtime-evidence.json"), JSON.stringify(payload, null, 2), "utf8");
console.log(`C5A.2 baseline audit: ${path.join(OUTPUT_DIR, "runtime-evidence.json")}`);
const checks=[];const check=(label,condition)=>{const ok=Boolean(condition);checks.push({label,ok});console.log(`${ok?"PASS":"FAIL"} ${label}`);};
for(const result of results){
  const burst=(family)=>result.cadenceTelemetry.filter((event)=>event.weaponFamily===family&&Number.isFinite(event.actualIntervalMs)&&event.actualIntervalMs<=event.profileIntervalMs*1.25).map((event)=>event.actualIntervalMs).sort((a,b)=>a-b);
  const rifle=burst("rifle"),smg=burst("smg");
  check(`${result.mapKey} authoritative shot/muzzle/tracer 1:1`,result.eventParity.authoritative>0&&result.eventParity.sameIds&&result.eventParity.muzzleExact&&result.eventParity.tracerExact);
  check(`${result.mapKey} first-shot reaction permission`,Number(result.reactionSummary?.medianMs)>=150&&Number(result.reactionSummary?.medianMs)<=680&&result.reactionSamples.filter((episode)=>Number.isFinite(episode.firstAuthoritativeShotAtMs)).every((episode)=>episode.firstAuthoritativeShotAtMs>=episode.firePermissionAtMs));
  check(`${result.mapKey} automatic cadence`,rifle.length>0&&rifle[Math.floor((rifle.length-1)/2)]<=120&&(!result.cadenceTelemetry.some((event)=>event.weaponFamily==="smg")||(smg.length>0&&smg[Math.floor((smg.length-1)/2)]<=100)));
  check(`${result.mapKey} pistol/sniper single-trigger cadence`,result.singleTriggerFrameViolations.length===0&&result.cadenceTelemetry.filter((event)=>event.weaponFamily==="pistol"&&Number.isFinite(event.actualIntervalMs)).every((event)=>event.actualIntervalMs>=500)&&result.cadenceTelemetry.filter((event)=>event.weaponFamily==="sniper"&&Number.isFinite(event.actualIntervalMs)).every((event)=>event.actualIntervalMs>=900));
  check(`${result.mapKey} solid crates/buildings and zero crossing`,Number(result.navigationAudit?.obstacleCounts?.building)>0&&Number(result.navigationAudit?.obstacleCounts?.crate)>0&&Number(result.movementAudit?.blockedPositions||0)===0&&Number(result.movementAudit?.wallSegmentCrossings||0)===0&&Number(result.movementAudit?.teleportViolations||0)===0);
  check(`${result.mapKey} stuck replan resolves`,Number(result.movementAudit?.stuckDetections||0)===Number(result.movementAudit?.replanCount||0)&&Number(result.movementAudit?.stuckResolved||0)+Number(result.movementAudit?.replanAbortedByRoundEnd||0)===Number(result.movementAudit?.stuckDetections||0));
  check(`${result.mapKey} authoritative idle/walk/run`,result.locomotion.checks>0&&result.locomotion.mismatches===0&&["idle","walk","run"].every((state)=>Number(result.movementAudit?.locomotionSamples?.[state]||0)>0));
  check(`${result.mapKey} building/player scale`,result.environment?.scaleContract?.playerHeight===1.8&&result.environment?.scaleContract?.minBuildingHeight>=3.35&&result.environment?.scaleContract?.buildingToPlayerMinRatio>=1.8);
  check(`${result.mapKey} C2C rounded limb presentation`,result.c2c?.rigged===10&&result.c2c?.fallback===0&&Object.values(result.c2c?.players||{}).every((player)=>player.limbPresentation?.segmentShape==="12-sided-tapered-cylinder"&&player.limbPresentation?.jointShape==="rounded-box"&&player.limbPresentation?.skeletonMutation===false));
}
if(checks.some((entry)=>!entry.ok))process.exitCode=1;
