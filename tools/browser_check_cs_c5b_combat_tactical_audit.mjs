#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchChrome } from "./browser/cdp.mjs";

const APP_BASE = process.env.CS_C5B_APP_URL || "http://127.0.0.1:5174/ESMO-/";
const CDP_PORT = Number(process.env.CS_C5B_CDP_PORT || 9890);
const WIDTH = Number(process.env.CS_C5B_VIEWPORT_WIDTH || 1366);
const HEIGHT = Number(process.env.CS_C5B_VIEWPORT_HEIGHT || 768);
const OUTPUT_DIR = process.env.CS_C5B_OUTPUT_DIR || path.resolve("artifacts/cs-c5b/tactical-audit");
const SOURCE_PATH = path.resolve("src/battle/fps/EsportsFPS3D.jsx");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const allMaps = [["mirage", "Mirage"], ["dust2", "Dust II"], ["inferno", "Inferno"]];
const fixedSeedByMap = { mirage: 43, dust2: 43, inferno: 45 };
const requestedMap = process.argv.find((arg) => arg.startsWith("--map="))?.slice("--map=".length) || null;
const maps = requestedMap ? allMaps.filter(([mapKey]) => mapKey === requestedMap) : allMaps;
if (!maps.length) throw new Error("unknown --map value: " + requestedMap);

async function waitFor(chrome, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await chrome.evaluate("return Boolean(" + expression + ");")) return true;
    } catch {}
    await sleep(250);
  }
  throw new Error(label + " timeout");
}

async function clickByText(chrome, predicate, label) {
  const result = await chrome.evaluate(
    "const button=[...document.querySelectorAll('button')].find((node)=>(" + predicate + ")(node,(node.innerText||'').replace(/\\s+/g,' ').trim()));" +
    "if(!button||button.disabled)return{ok:false,buttons:[...document.querySelectorAll('button')].map((node)=>(node.innerText||'').replace(/\\s+/g,' ').trim()).slice(0,80)};" +
    "const text=(button.innerText||'').replace(/\\s+/g,' ').trim();button.click();return{ok:true,text};"
  );
  if (!result?.ok) throw new Error(label + " failed: " + JSON.stringify(result));
  return result;
}

async function prepAction(chrome) {
  return chrome.evaluate(
    "const button=document.querySelector('[data-testid=\"prep-primary-action\"]');" +
    "if(!button||button.disabled)return{ok:false,action:button?.dataset.action||null};" +
    "const action=button.dataset.action;button.click();return{ok:true,action};"
  );
}

async function trustedClick(chrome, selector) {
  const rect = await chrome.evaluate("return (()=>{const node=document.querySelector(" + JSON.stringify(selector) + ");if(!node)return null;const r=node.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()");
  if (!rect) throw new Error("trusted click target missing: " + selector);
  await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
}

async function enterBattle(chrome, mapKey, mapTitle) {
  await waitFor(chrome, "document.querySelector('button')&&document.body.innerText.includes('CS')", 30000, "CS 入口");
  await clickByText(chrome, "(node,text)=>text.includes('CS')", "CS 模式");
  await waitFor(chrome, "document.querySelector('[data-testid=\"prep-primary-action\"]')", 30000, "CS 準備頁");
  let prep = await prepAction(chrome);
  if (!prep.ok && prep.action === "blocked") {
    await clickByText(chrome, "(node,text)=>text.includes('Auto')||text.includes('自動')", "自動準備");
    await waitFor(chrome, "document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action==='enqueue'", 15000, "佇列確認");
    prep = await prepAction(chrome);
  }
  if (!prep.ok) throw new Error("準備流程不可用: " + JSON.stringify(prep));
  if (prep.action === "enqueue") {
    await waitFor(chrome, "document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action==='confirm'||document.querySelector('[data-map-key=\"" + mapKey + "\"]')", 60000, "進入地圖選擇");
    if (await chrome.evaluate("return document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action==='confirm';")) await prepAction(chrome);
  }
  await waitFor(chrome, "document.querySelector('[data-map-key=\"" + mapKey + "\"]')", 60000, "地圖選擇");
  await chrome.evaluate("document.querySelector('[data-map-key=\"" + mapKey + "\"]')?.click();return true;");
  await chrome.evaluate("const buttons=[...document.querySelectorAll('button')].filter((node)=>!node.disabled&&!node.dataset.mapKey);buttons.at(-1)?.click();return buttons.length;");
  await waitFor(chrome, "!document.querySelector('[data-map-key=\"" + mapKey + "\"]')&&document.body.innerText.includes(" + JSON.stringify(mapTitle) + ")", 30000, "地圖確認");
  await waitFor(chrome, "document.querySelector('[data-testid=\"cs-tactic-phase-opening\"]')", 30000, "四階段戰術頁");
  // Owner review uses an intentionally non-flat plan: each layer is selected
  // through the real UI, so evidence proves the pre-match layout reaches sim.
  for (const [phase, cardIndex] of [["opening", 0], ["mid-round", 2], ["late-round", 4], ["post-plant", 5]]) {
    await chrome.evaluate("document.querySelector('[data-testid=\"cs-tactic-phase-" + phase + "\"]')?.click();return true;");
    await sleep(80);
    await chrome.evaluate("const cards=[...document.querySelectorAll('button')].filter((node)=>!node.disabled&&node.textContent.includes('核心：'));const card=cards[" + cardIndex + "];card?.click();return Boolean(card);");
    await sleep(80);
  }
  await chrome.evaluate("return import('/ESMO-/src/platform/profileStore.js').then((module)=>{const store=module.useProfileStore,state=store.getState();store.setState({matchmaking:{...state.matchmaking,launch:{...(state.matchmaking?.launch||{}),seed:" + fixedSeedByMap[mapKey] + "}}});return store.getState().matchmaking?.launch?.seed;});");
  await chrome.evaluate("document.querySelector('[data-testid=\"cs-tactic-confirm\"]')?.click();return true;");
  await waitFor(chrome, "window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim&&document.querySelector('canvas')", 120000, "Battle runtime");
  await waitFor(chrome, "window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.completed===true", 120000, "authoritative simulation complete");
}

function readStaticDeterminism() {
  const source = fs.readFileSync(SOURCE_PATH, "utf8");
  const start = source.indexOf("function simulateFps(");
  const end = source.indexOf("function stableResultId(");
  const simBlock = start >= 0 && end > start ? source.slice(start, end) : "";
  return {
    hasSeededRng: simBlock.includes("const rand=mkRng(seed)"),
    hasHashVariation: simBlock.includes("hsh("),
    simBlockHasMathRandom: simBlock.includes("Math.random("),
    hasGridPlanner: source.includes("function gridNavigableSegment("),
    blocksDirectFallback: source.includes("navLineBlocked(plannerStart,plannerGoal,obstacles)?[{x:plannerStart.x,y:plannerStart.y}]"),
  };
}

async function readRuntime(chrome, mapKey) {
  const source = [
    "return (()=>{",
    "const st=window.__ESMO_FPS_SCENE__,live=st?.liveRef?.current,sim=live?.sim,frames=sim?.frames||[];",
    "const nav=sim?.navigationAudit||{},tactical=sim?.tacticalAudit||{},buy=sim?.buyAudit||{},bomb=sim?.bombAudit||{},combat=sim?.combatAudit||{};",
    "const phases={};frames.forEach((frame)=>{const phase=frame.tacticalPhase||'unknown';phases[phase]=(phases[phase]||0)+1;});",
    "const roundPhases={};frames.forEach((frame)=>{const key=String(frame.rnd)+':'+(frame.tacticalPhase||'unknown');roundPhases[key]=(roundPhases[key]||0)+1;});",
    "const routeHistory=nav.routeHistory||[],routeSignatures=[...new Set(routeHistory.map((item)=>item.routeSignature).filter(Boolean))];",
    "const routeVariants=Object.fromEntries(Object.entries(tactical.routeVariants||{}));",
    "const reaction=sim?.reactionTelemetry||[],flankEpisodes=reaction.filter((item)=>item.flank);",
    "const objectiveStates=[...new Set(frames.flatMap((frame)=>(frame.players||[]).map((player)=>player.objectiveState||player.state).filter(Boolean)))];",
    "const bombStates=[...new Set(frames.map((frame)=>frame.bombState).filter(Boolean))];",
    "const plantedFrames=frames.filter((frame)=>frame.planted===true).length,postPlantFrames=frames.filter((frame)=>frame.tacticalPhase==='post-plant').length;",
    "const utilityTypes=[...new Set(frames.flatMap((frame)=>(frame.throwables||[]).map((item)=>item.type)).filter(Boolean))];",
    "const canvas=document.querySelector('canvas'),dataset=(name)=>Number(canvas?.dataset?.[name]||0);",
    "return{mapKey,frameCount:frames.length,roundCount:sim?.roundHist?.length||0,completed:Boolean(sim?.completed),finalScore:{t:sim?.tScore,ct:sim?.ctScore,winner:sim?.winner,phase:sim?.phase},",
    "tacticalAudit:tactical,phaseFrames:phases,roundPhases,routeSignatures,routeVariants,",
    "navigationAudit:nav,movementAudit:sim?.movementAudit||null,",
    "buyAudit:buy,weaponMetrics:sim?.weaponMetrics||{},weaponAuthority:sim?.weaponAuthority||{},",
    "combatAudit:combat,reactionSummary:sim?.reactionSummary||null,reactionTelemetry:reaction.slice(0,400),flankEpisodes:flankEpisodes.slice(0,120),",
    "bombAudit:bomb,bombStates,plantedFrames,postPlantFrames,objectiveStates,utilityTypes,",
    "utilityFx:{smoke:dataset('esmoFpsC5bSmoke'),trajectory:dataset('esmoFpsC5bTrajectory'),he:dataset('esmoFpsC5bHe'),flash:dataset('esmoFpsC5bFlash'),flashRecovery:dataset('esmoFpsC5bFlashRecovery'),molly:dataset('esmoFpsC5bMolly'),markers:dataset('esmoFpsC5bMarkers'),smokeStages:JSON.parse(canvas?.dataset?.esmoFpsC5bSmokeStages||'{}')},",
    "c2c:window.__ESMO_FPS_C2A__||null,p0:window.__ESMO_FPS_P0_CONTRACT__||null,audio:window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||null,visibility:window.__ESMO_FPS_VISIBILITY__||null,",
    "canvas:canvas?{width:canvas.clientWidth,height:canvas.clientHeight,bufferWidth:canvas.width,bufferHeight:canvas.height}:null,",
    "framesWithBomb:frames.filter((frame)=>frame.planted||frame.bombState==='exploded').slice(0,120).map((frame)=>({round:frame.rnd,roundSec:frame.roundSec,state:frame.bombState,phase:frame.tacticalPhase,c4t:frame.c4t})),",
    "stateCounts:frames.reduce((out,frame)=>{(frame.players||[]).forEach((player)=>{out[player.state]=(out[player.state]||0)+1;});return out},{}),",
    "browserErrors:{console:[],page:[]}};",
    "})()",
  ].join("\n");
  return chrome.evaluate(source.replace("mapKey,", "mapKey:" + JSON.stringify(mapKey) + ","));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}

function resultSummary(result) {
  const nav = result.navigationAudit || {};
  const mov = result.movementAudit || {};
  const combat = result.combatAudit || {};
  const bomb = result.bombAudit || {};
  const families = result.weaponMetrics || {};
  return {
    mapKey: result.mapKey,
    rounds: result.roundCount,
    completed: result.completed,
    routes: result.routeSignatures.length,
    stuck: nav.stuckDetections || 0,
    replans: nav.replanCount || 0,
    resolved: nav.stuckResolved || 0,
    deadlocks: nav.routeDeadlocks || 0,
    illegalWallCrossings: nav.illegalWallCrossings || 0,
    aborts: nav.replanAbortedByRoundEnd || 0,
    maxStuckDurationSec: nav.maxStuckDurationSec || 0,
    wallCrossings: mov.wallSegmentCrossings || 0,
    teleports: mov.teleportViolations || 0,
    flankCandidates: combat.flankCandidates || 0,
    flankEngagements: combat.flankEngagements || 0,
    routeBlockedEngagements: combat.routeBlockedEngagements || 0,
    plantEvents: (bomb.plantEvents || []).length,
    timerSamples: bomb.timerSamples || 0,
    retakeAssignments: bomb.retakeAssignments || 0,
    coverAssignments: bomb.coverAssignments || 0,
    defuseEvents: (bomb.defuseEvents || []).length,
    explosionEvents: (bomb.explosionEvents || []).length,
    weapons: Object.fromEntries(["pistol", "smg", "rifle", "sniper", "shotgun"].map((family) => [family, {
      purchases: result.buyAudit?.purchaseCounts?.[family] || 0,
      ratio: result.buyAudit?.purchaseRatios?.[family] || 0,
      shots: families[family]?.shots || 0,
      damage: families[family]?.damage || 0,
      cadenceMs: families[family]?.actualCadenceMs?.medianMs ?? null,
    }])),
  };
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const results = [];
const staticDeterminism = readStaticDeterminism();
for (const [index, [mapKey, mapTitle]] of maps.entries()) {
  const chrome = await launchChrome({ url: APP_BASE + "?fpsRigged=all&fpsC2cHero=all", port: CDP_PORT + index, headless: true });
  try {
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 600 });
    await chrome.navigate(APP_BASE + "?fpsRigged=all&fpsC2cHero=all");
    await enterBattle(chrome, mapKey, mapTitle);
    if (await chrome.evaluate("return Boolean([...document.querySelectorAll('button[title]')].find((button)=>button.title.includes(String.fromCharCode(38899,25928))));")) {
      await trustedClick(chrome, 'button[title="音效關"]');
      await waitFor(chrome, "window.__ESMO_FPS_AUDIO_DIAGNOSTICS__", 30000, mapKey + " recorded audio enable");
      await waitFor(chrome, "window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.loadedProfiles===5", 30000, mapKey + " recorded audio preload");
    }
    await chrome.evaluate("document.querySelector('[data-testid=\"match-speed-4\"]')?.click();return true;");
    await waitFor(chrome, "window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames?.some((frame)=>Boolean(frame.muzzles?.length))", 30000, mapKey + " fire evidence");
    if (await chrome.evaluate("return Boolean(window.__ESMO_FPS_AUDIO_DIAGNOSTICS__);")) await waitFor(chrome, "window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.recordedSourceStarts>0", 30000, mapKey + " recorded Battle audio");
    await waitFor(chrome, "window.__ESMO_FPS_C2A__?.rigged===10", 30000, mapKey + " C2C roster");
    await sleep(750);
    const runtime = await readRuntime(chrome, mapKey);
    runtime.fixedSeed = fixedSeedByMap[mapKey];
    runtime.browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
    results.push(runtime);
    const summary = resultSummary(runtime);
    console.log("TACTICAL " + mapKey + " rounds=" + summary.rounds + " routes=" + summary.routes + " stuck=" + summary.stuck + " deadlocks=" + summary.deadlocks + " flank=" + summary.flankEngagements + " plant=" + summary.plantEvents);
  } catch (error) {
    const diagnostic = {
      mapKey,
      error: String(error?.stack || error),
      bodyText: await chrome.evaluate("return (document.body?.innerText||'').slice(0,12000);").catch(() => ""),
      console: chrome.consoleLines,
      page: chrome.pageErrors,
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, mapKey + "-failure.json"), JSON.stringify(diagnostic, null, 2), "utf8");
    throw error;
  } finally {
    await chrome.close().catch(() => {});
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: "C5B CS Combat Tactical Audit deterministic browser evidence",
  viewport: { width: WIDTH, height: HEIGHT, mobile: WIDTH <= 600 },
  staticDeterminism,
  maps: results.map(resultSummary),
  results,
};
const evidenceName = "runtime-evidence-" + (requestedMap ? requestedMap + "-" : "") + WIDTH + "px.json";
fs.writeFileSync(path.join(OUTPUT_DIR, evidenceName), JSON.stringify(payload, null, 2), "utf8");
const ownerDir = path.join(OUTPUT_DIR, "owner-review");
fs.mkdirSync(ownerDir, { recursive: true });
const cards = payload.maps.map((summary) => {
  const weaponRows = Object.entries(summary.weapons).map(([family, data]) =>
    "<tr><td>" + escapeHtml(family) + "</td><td>" + data.purchases + "</td><td>" + (data.ratio * 100).toFixed(1) + "%</td><td>" + data.shots + "</td><td>" + data.damage + "</td><td>" + (data.cadenceMs ?? "—") + "</td></tr>"
  ).join("");
  return "<section><h2>" + escapeHtml(summary.mapKey) + "</h2><p>完成 " + summary.completed + " · rounds " + summary.rounds + " · route variants " + summary.routes + " · stuck " + summary.stuck + " · replan " + summary.replans + " · deadlock " + summary.deadlocks + " · illegal wall crossing " + summary.illegalWallCrossings + "</p>" +
    "<p>flank candidates " + summary.flankCandidates + " · flank engagements " + summary.flankEngagements + " · route-blocked engagement " + summary.routeBlockedEngagements + "</p>" +
    "<p>plant " + summary.plantEvents + " · timer samples " + summary.timerSamples + " · retake " + summary.retakeAssignments + " · cover " + summary.coverAssignments + " · defuse " + summary.defuseEvents + " · explosion " + summary.explosionEvents + "</p>" +
    "<table><thead><tr><th>family</th><th>purchases</th><th>ratio</th><th>shots</th><th>damage</th><th>median cadence ms</th></tr></thead><tbody>" + weaponRows + "</tbody></table></section>";
}).join("");
const html = "<!doctype html><html lang=\"zh-Hant\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>C5B Combat Tactical Audit</title><style>body{margin:0;background:#071019;color:#e7edf3;font:14px/1.6 system-ui,sans-serif}main{max-width:1050px;margin:auto;padding:28px}h1{color:#fbbf24}h2{color:#7dd3fc;margin-bottom:4px}section{background:#0d1721;border:1px solid #203344;border-radius:12px;padding:18px;margin:16px 0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid #243645;padding:6px;text-align:left}th{color:#9fb4c5}code{color:#fed7aa}a{color:#7dd3fc}</style></head><body><main><h1>C5B CS Combat Tactical Audit</h1><p>中文 Owner Review · deterministic seeded route/economy/combat audit · viewport " + WIDTH + "px</p><p>正式 Battle：<a href=\"" + escapeHtml(APP_BASE) + "?fpsRigged=all&amp;fpsC2cHero=all\">" + escapeHtml(APP_BASE) + "?fpsRigged=all&amp;fpsC2cHero=all</a></p><p>本頁 evidence：<code>runtime-evidence-" + WIDTH + "px.json</code></p>" + cards + "</main></body></html>";
fs.writeFileSync(path.join(ownerDir, "owner-review.html"), html, "utf8");
console.log("C5B tactical audit: " + path.join(OUTPUT_DIR, evidenceName));
console.log("C5B owner review: " + path.join(ownerDir, "owner-review.html"));
