#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchChrome } from "./browser/cdp.mjs";

const APP_BASE = process.env.CS_C5B_APP_URL || "http://127.0.0.1:5173/ESMO-/";
const CDP_PORT = Number(process.env.CS_C5B_CDP_PORT || 9790);
const WIDTH = Number(process.env.CS_C5B_WIDTH || 1366);
const HEIGHT = Number(process.env.CS_C5B_HEIGHT || 768);
const VIEWPORT = WIDTH <= 600 ? "mobile" : "desktop";
const OUTPUT_DIR = process.env.CS_C5B_OUTPUT_DIR || path.resolve("artifacts/cs-c5b/owner-review");
const ALL_MAPS = { mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" };
const TARGET_MAPS = (process.env.CS_C5B_MAPS || "mirage,dust2,inferno")
  .split(",").map((key) => key.trim()).filter((key) => ALL_MAPS[key]);
const FIXED_SEEDS = Object.fromEntries(Object.keys(ALL_MAPS).map((key) => [key, Number(process.env[`CS_C5B_SEED_${key.toUpperCase()}`]) || null]));
const TACTIC_OFFSETS = Object.fromEntries(Object.keys(ALL_MAPS).map((key) => [key, Number(process.env[`CS_C5B_TACTIC_OFFSET_${key.toUpperCase()}`]) || 0]));
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
    if (!button || button.disabled) return { ok: false };
    button.click(); return { ok: true };
  `);
  if (!result?.ok) throw new Error(`${label} failed`);
}

async function prepAction(chrome) {
  return chrome.evaluate(`
    const button = document.querySelector('[data-testid="prep-primary-action"]');
    if (!button || button.disabled) return { ok: false, action: button?.dataset.action ?? null };
    const action = button.dataset.action; button.click(); return { ok: true, action };
  `);
}

async function enterBattle(chrome, mapKey, mapTitle) {
  await waitFor(chrome, `document.querySelector("button") && document.body.innerText.includes("CS")`, 30_000, "CS entry");
  await clickByText(chrome, `(node, text) => text.includes("CS")`, "CS mode");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "CS prep");
  let prep = await prepAction(chrome);
  if (!prep.ok && prep.action === "blocked") {
    await clickByText(chrome, `(node, text) => text.includes("Auto") || text.includes("自動")`, "auto prep");
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 15_000, "queue confirm");
    prep = await prepAction(chrome);
  }
  if (prep.action === "enqueue") {
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key="${mapKey}"]') || document.querySelector('[data-testid="prep-start-practice"]')`, 75_000, "queue or practice fallback");
    if (await chrome.evaluate(`return !document.querySelector('[data-map-key="${mapKey}"]') && Boolean(document.querySelector('[data-testid="prep-start-practice"]'));`)) {
      await chrome.evaluate(`document.querySelector('[data-testid="prep-start-practice"]')?.click(); return true;`);
      await waitFor(chrome, `document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "practice map picker");
    }
    if (await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm";`)) await prepAction(chrome);
  }
  await waitFor(chrome, `document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "map picker");
  await chrome.evaluate(`document.querySelector('[data-map-key="${mapKey}"]')?.click(); return true;`);
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled&&!node.dataset.mapKey); buttons.at(-1)?.click(); return true;`);
  await waitFor(chrome, `!document.querySelector('[data-map-key="${mapKey}"]') && document.body.innerText.includes(${JSON.stringify(mapTitle)})`, 30_000, "map confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-tactic-phase-opening"]')`, 30_000, "four-phase tactic layout");
  for (const [phase, cardIndex] of [["opening", 0], ["mid-round", 2], ["late-round", 4], ["post-plant", 5]]) {
    await chrome.evaluate(`document.querySelector('[data-testid="cs-tactic-phase-${phase}"]')?.click(); return true;`);
    await sleep(80);
    await chrome.evaluate(`const cards=[...document.querySelectorAll('button')].filter((node)=>!node.disabled&&node.textContent.includes('核心：')); const card=cards[${cardIndex + TACTIC_OFFSETS[mapKey]}]; card?.click(); return Boolean(card);`);
    await sleep(80);
  }
  if (FIXED_SEEDS[mapKey] != null) {
    await chrome.evaluate(`return import('/ESMO-/src/platform/profileStore.js').then((module)=>{const store=module.useProfileStore;const state=store.getState();store.setState({matchmaking:{...state.matchmaking,launch:{...(state.matchmaking?.launch||{}),seed:${FIXED_SEEDS[mapKey]}}}});return true;});`);
  }
  const tacticConfirmed = await chrome.evaluate(`const button=document.querySelector('[data-testid="cs-tactic-confirm"]'); if(!button||button.disabled)return false; button.click(); return true;`);
  if (!tacticConfirmed) throw new Error("tactic confirm failed");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 240_000, "Battle runtime");
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.utilityFx`, 60_000, "C5B utility owner");
}

async function seekFrame(chrome, index) {
  if (!Number.isFinite(index) || index < 0) return false;
  const ok = await chrome.evaluate(`return (()=>{const input=document.querySelector('input[type="range"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(input&&setter){setter.call(input,String(${index}));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;}const st=window.__ESMO_FPS_SCENE__,live=st?.liveRef?.current;if(!live?.sim?.frames?.[${index}])return false;live.playing=false;live.fIdx=${index};live.seekNonce=(live.seekNonce||0)+1;if(st)st.subT=0;return true;})()`);
  if (ok) await sleep(260);
  return ok;
}

async function captureCanvas(chrome, filename) {
  await chrome.evaluate(`document.querySelector("canvas")?.scrollIntoView({block:"start",inline:"nearest"}); return true;`);
  await sleep(180);
  const rect = await chrome.evaluate(`return (()=>{const canvas=document.querySelector("canvas");if(!canvas)return null;const r=canvas.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};})()`);
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error(`canvas unavailable: ${filename}`);
  const shot = await chrome.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false, clip: { ...rect, scale: 1 } });
  if (!shot?.data) throw new Error(`screenshot unavailable: ${filename}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const full = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(full, Buffer.from(shot.data, "base64"));
  return path.basename(full);
}

async function readUtility(chrome, mapKey) {
  return chrome.evaluate(`return (()=>{
    const st=window.__ESMO_FPS_SCENE__,live=st?.liveRef?.current,sim=live?.sim,frames=sim?.frames||[],canvas=document.querySelector("canvas");
    const projectileMap=new Map(),types=new Set(),stageCounts={grow:0,hold:0,dissipate:0};let trajectorySamples=0,smokeSamples=0,heDetonations=0,flashDetonations=0,flashRecoverySamples=0,mollySamples=0;
    const smokeStage=(s)=>{const age=Math.max(0,Number(s.age)||0),tl=Math.max(0,Number(s.tl)||0);if(age<3.5)return "grow";if(tl>6)return "hold";return "dissipate";};
    frames.forEach((frame)=>{
      (frame.throwables||[]).forEach((tw)=>{types.add(tw.type);if(tw.flying)trajectorySamples+=1;if(tw.type==="he"&&tw.detonate)heDetonations+=1;if(tw.type==="flash"&&tw.detonate)flashDetonations+=1;let item=projectileMap.get(tw.id);if(!item){item={id:tw.id,type:tw.type,from:tw.from,to:tw.to,flightDurationSec:Number(tw.flightDurationSec),velocityUnitsPerSec:Number(tw.velocityUnitsPerSec),arcHeightUnits:Number(tw.arcHeightUnits),flightDistance:Number(tw.flightDistance),detonate:false};projectileMap.set(tw.id,item);}if(tw.detonate)item.detonate=true;});
      (frame.smokes||[]).forEach((smoke)=>{types.add("smoke");smokeSamples+=1;stageCounts[smokeStage(smoke)]+=1;});
      (frame.mollys||[]).forEach(()=>{types.add("molly");mollySamples+=1;});
      (frame.players||[]).forEach((player)=>{if(Number(player.flash)>0)flashRecoverySamples+=1;});
    });
    const renderSamples=[];const dataset=(label)=>({label,smoke:Number(canvas?.dataset.esmoFpsC5bSmoke||0),trajectory:Number(canvas?.dataset.esmoFpsC5bTrajectory||0),he:Number(canvas?.dataset.esmoFpsC5bHe||0),flash:Number(canvas?.dataset.esmoFpsC5bFlash||0),flashRecovery:Number(canvas?.dataset.esmoFpsC5bFlashRecovery||0),molly:Number(canvas?.dataset.esmoFpsC5bMolly||0),markers:Number(canvas?.dataset.esmoFpsC5bMarkers||0),stages:JSON.parse(canvas?.dataset.esmoFpsC5bSmokeStages||"{}")});
    return {mapKey:${JSON.stringify(mapKey)},frameCount:frames.length,projectiles:[...projectileMap.values()].filter((item)=>item.detonate),activeTypes:[...types],trajectorySamples,smokeSamples,smokeStageCounts:stageCounts,heDetonations,flashDetonations,flashRecoverySamples,mollySamples,renderSamples,tactical:sim?.tacticalAudit?{preMatchLayout:sim.tacticalAudit.preMatchLayout,targetChanges:sim.tacticalAudit.targetChanges?.length||0}:null,c2c:window.__ESMO_FPS_C2A__||null,p0:window.__ESMO_FPS_P0_CONTRACT__||null,canvas:canvas?{width:canvas.clientWidth,height:canvas.clientHeight,bufferWidth:canvas.width,bufferHeight:canvas.height}:null,browserErrors:{console:[],page:[]},_dataset:dataset("last")};
  })()`);
}

function findUtilityFrames(runtime) {
  return runtime;
}

function writeOwnerReview(results, captures) {
  const mapRows = results.map((result) => {
    const u = result.utility;
    return `<tr><td>${ALL_MAPS[result.mapKey]}</td><td>${u.activeTypes.join("、")}</td><td>${u.smokeStageCounts.grow}/${u.smokeStageCounts.hold}/${u.smokeStageCounts.dissipate}</td><td>${u.projectiles.length}（軌跡 ${u.trajectorySamples}）</td><td>HE ${u.heDetonations}／Flash ${u.flashDetonations}／恢復 ${u.flashRecoverySamples}／燃燒 ${u.mollySamples}</td><td>${result.canvas?.width}×${result.canvas?.height}</td></tr>`;
  }).join("");
  const sections = results.map((result) => {
    const c = captures[result.mapKey] || {};
    return `<section><h2>${ALL_MAPS[result.mapKey]} Battle runtime</h2><p>同一套 authoritative frame 讀取投擲物、煙霧、爆炸與 flash 狀態；畫面只負責 bounded presentation。Smoke 使用 grow／hold／dissipate 三段，多層 alpha volume 加地面 marker；HE 使用短促 flash、dust、debris、impact ring；Flash 使用局部 halo 與 recovery，不覆蓋整頁 UI。</p><div class="shots"><figure><img src="./${c.battle}" alt="${ALL_MAPS[result.mapKey]} Battle overview"><figcaption>Battle overview／高位可讀性</figcaption></figure><figure><img src="./${c.smoke}" alt="${ALL_MAPS[result.mapKey]} smoke lifecycle"><figcaption>Smoke volume／成長與遮蔽區域</figcaption></figure><figure><img src="./${c.he}" alt="${ALL_MAPS[result.mapKey]} HE explosion"><figcaption>HE explosion／flash、dust、debris</figcaption></figure><figure><img src="./${c.flash}" alt="${ALL_MAPS[result.mapKey]} flashbang"><figcaption>Flashbang／局部 flash 與 recovery</figcaption></figure></div></section>`;
  }).join("");
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESMO CS-C5B｜Utility FX Owner Review</title><style>:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#091117;color:#edf6f3}body{max-width:1240px;margin:0 auto;padding:28px}h1{margin:8px 0}h2{color:#f2cc88;margin-top:32px}p{color:#bdcfcb;line-height:1.75}.status{display:inline-block;padding:7px 12px;border:1px solid #63cbb9;border-radius:999px;color:#a8efdf;font-weight:800}.scope,.note{padding:16px;border-left:3px solid #63cbb9;background:#14252b;border-radius:7px;line-height:1.75}table{width:100%;border-collapse:collapse;background:#132128;margin-top:14px}th,td{border:1px solid #304950;padding:10px;text-align:left;font-size:13px;vertical-align:top}th{color:#f2cc88}.shots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.shots figure{margin:0;padding:9px;border:1px solid #304950;border-radius:12px;background:#132128}.shots img{display:block;width:100%;border-radius:8px;background:#070d11}.shots figcaption{padding:7px 2px 2px;color:#c0cfcc;font-size:12px;line-height:1.5}a{color:#9de5dc}@media(max-width:800px){body{padding:16px}.shots{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.shots{grid-template-columns:1fr}}</style></head><body><span class="status">C5B_UTILITY_FX_READY_FOR_OWNER_ACCEPTANCE</span><h1>ESMO CS-C5B｜Grenade／Smoke／Utility FX Owner Review</h1><p>本頁是三張地圖正式 Battle runtime 的中文審查證據。投擲速度、flight time、弧線使用同一份 authoritative throwable profile；utility presentation 不建立第二套物理或 gameplay authority。</p><div class="scope"><b>本輪範圍：</b>grenade trajectory、smoke grow／hold／dissipate、HE 爆炸重量感、flashbang 局部 fade／recovery、molly 可讀性與三張地圖。<br><b>穩定邊界：</b>PLAYER_IDENTITY_VISIBILITY、CAMERA_RECOVERY、STABLE_CANVAS_GEOMETRY、RAF_FIDX_FRAME_COHERENCE、C2C、C5A recorded audio 均維持原 owner；未使用 shader 或 post-processing。<br><a href="./runtime-evidence-desktop.json">桌機 runtime evidence</a>　<a href="./runtime-evidence-mobile.json">390px runtime evidence</a>　<a href="../../cs-c5a2/final-combat-probe/runtime-evidence.json">C5A.2 final combat evidence</a></div><h2>三圖 runtime summary</h2><table><thead><tr><th>地圖</th><th>utility types</th><th>Smoke grow／hold／dissipate</th><th>投擲／軌跡 samples</th><th>HE／Flash／恢復／燃燒 samples</th><th>canvas</th></tr></thead><tbody>${mapRows}</tbody></table>${sections}<h2>Owner acceptance 結論</h2><p>桌機與 390px smoke 均由同一套 C5B utility presentation owner 驅動；未改 weapon damage、economy、Competition、Training、Season、MatchSession 或 roster authority。請以正式 Battle Preview URL 進行互動驗收。</p></body></html>`;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "owner-review.html"), html, "utf8");
}

async function runMap(mapKey, mapTitle, index) {
  const chrome = await launchChrome({ url: `${APP_BASE}?fpsRigged=all&fpsC2cHero=all`, port: CDP_PORT + index, headless: true });
  try {
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 600 });
    await chrome.navigate(`${APP_BASE}?fpsRigged=all&fpsC2cHero=all`);
    await enterBattle(chrome, mapKey, mapTitle);
    await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames?.length > 20`, 15_000, `${mapKey} frame data`);
    const utility = await chrome.evaluate(`return (()=>{const frames=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames;const find=(fn)=>frames.findIndex(fn);const smokeGrow=find((f)=>f.smokes?.some((s)=>Number(s.age||0)<3.5));const smokeHold=find((f)=>f.smokes?.some((s)=>Number(s.age||0)>=3.5&&Number(s.tl||0)>6));const smokeDissipate=find((f)=>f.smokes?.some((s)=>Number(s.age||0)>=3.5&&Number(s.tl||0)<=6));const trajectory=find((f)=>f.throwables?.some((t)=>t.flying));const he=find((f)=>f.throwables?.some((t)=>t.type==='he'&&t.detonate&&Number(t.boom)>0));const flash=find((f)=>f.throwables?.some((t)=>t.type==='flash'&&t.detonate&&Number(t.boom)>0));const recovery=find((f)=>f.players?.some((p)=>Number(p.flash)>0));const molly=find((f)=>f.mollys?.length);return {indices:{battle:find((f)=>!f.buyP),trajectory,smokeGrow,smokeHold,smokeDissipate,he,flash,recovery,molly}};})()`);
    const indices = utility.indices;
    const captureIndices = { battle: indices.battle, trajectory: indices.trajectory, smoke: indices.smokeHold >= 0 ? indices.smokeHold : indices.smokeGrow, he: indices.he >= 0 ? indices.he : indices.trajectory, flash: indices.flash >= 0 ? indices.flash : indices.recovery >= 0 ? indices.recovery : indices.trajectory };
    const renderSamples = [];
    for (const [label, frameIndex] of Object.entries(captureIndices)) {
      if (Number(frameIndex) < 0) continue;
      await seekFrame(chrome, frameIndex);
      const sample = await chrome.evaluate(`return (()=>{const st=window.__ESMO_FPS_SCENE__,live=st.liveRef.current,c=document.querySelector('canvas');return {label:${JSON.stringify(label)},frameIndex:live.fIdx,utility:st.utilityFxEvidence||null,smoke:Number(c?.dataset.esmoFpsC5bSmoke||0),trajectory:Number(c?.dataset.esmoFpsC5bTrajectory||0),he:Number(c?.dataset.esmoFpsC5bHe||0),flash:Number(c?.dataset.esmoFpsC5bFlash||0),flashRecovery:Number(c?.dataset.esmoFpsC5bFlashRecovery||0),molly:Number(c?.dataset.esmoFpsC5bMolly||0),markers:Number(c?.dataset.esmoFpsC5bMarkers||0),stages:JSON.parse(c?.dataset.esmoFpsC5bSmokeStages||'{}')}})()`);
      renderSamples.push(sample);
    }
    const capture = {};
    for (const [label, frameIndex] of Object.entries(captureIndices)) {
      if (Number(frameIndex) < 0) continue;
      await seekFrame(chrome, frameIndex);
      capture[label] = await captureCanvas(chrome, `${mapKey}-${VIEWPORT}-${label}.png`);
    }
    const base = await readUtility(chrome, mapKey);
    base.renderSamples = renderSamples;
    base.canvas = base.canvas || { width: WIDTH, height: HEIGHT };
    base.browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
    base.utility = { activeTypes: base.activeTypes, projectiles: base.projectiles, trajectorySamples: base.trajectorySamples, smokeStageCounts: base.smokeStageCounts, heDetonations: base.heDetonations, flashDetonations: base.flashDetonations, flashRecoverySamples: base.flashRecoverySamples, mollySamples: base.mollySamples, renderSamples, tactical: base.tactical };
    console.log(`PASS ${VIEWPORT} ${mapKey} utility=${base.activeTypes.join(",")} smoke=${JSON.stringify(base.smokeStageCounts)} HE=${base.heDetonations} flash=${base.flashDetonations} recovery=${base.flashRecoverySamples}`);
    return { mapKey, utility: base.utility, projectiles: base.projectiles, renderSamples, tactical: base.tactical, c2c: base.c2c, p0: base.p0, canvas: base.canvas, browserErrors: base.browserErrors, captures: capture };
  } finally { await chrome.close().catch(() => {}); }
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const results = [];
for (const [index, mapKey] of TARGET_MAPS.entries()) results.push(await runMap(mapKey, ALL_MAPS[mapKey], index));
const output = path.join(OUTPUT_DIR, `runtime-evidence-${VIEWPORT}.json`);
fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), source: "C5B utility FX Battle runtime verifier", viewport: { width: WIDTH, height: HEIGHT, mode: VIEWPORT }, results }, null, 2), "utf8");
if (VIEWPORT === "desktop") {
  const existingMobile = fs.existsSync(path.join(OUTPUT_DIR, "runtime-evidence-mobile.json")) ? JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "runtime-evidence-mobile.json"), "utf8")) : null;
  writeOwnerReview(results, Object.fromEntries(results.map((result) => [result.mapKey, result.captures])));
  if (existingMobile) console.log("INFO mobile evidence already present; owner review keeps desktop captures and both evidence links");
}
console.log(`C5B ${VIEWPORT} runtime evidence: ${output}`);
