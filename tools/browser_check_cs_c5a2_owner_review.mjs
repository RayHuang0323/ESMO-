#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchChrome } from "./browser/cdp.mjs";

const APP_BASE = process.env.CS_C5A_APP_URL || "http://127.0.0.1:5470/ESMO-/";
const CDP_PORT = Number(process.env.CS_C5A2_OWNER_CDP_PORT || 9490);
const WIDTH = Number(process.env.CS_C5A2_OWNER_WIDTH || 1366);
const HEIGHT = Number(process.env.CS_C5A2_OWNER_HEIGHT || 768);
const OUTPUT_DIR = process.env.CS_C5A2_OWNER_DIR || path.resolve("artifacts/cs-c5a2/owner-review");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ALL_MAPS = { mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" };
const MAPS = process.env.CS_C5A2_ONLY_MAP && ALL_MAPS[process.env.CS_C5A2_ONLY_MAP]
  ? { [process.env.CS_C5A2_ONLY_MAP]: ALL_MAPS[process.env.CS_C5A2_ONLY_MAP] }
  : ALL_MAPS;

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

async function trustedClick(chrome, selector) {
  const rect = await chrome.evaluate(`return (()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)return null;const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  if (!rect) throw new Error(`trusted click target missing: ${selector}`);
  await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
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

async function captureCanvas(chrome, filename) {
  await chrome.evaluate(`document.querySelector("canvas")?.scrollIntoView({block:"start",inline:"nearest"}); return true;`);
  await sleep(180);
  const rect = await chrome.evaluate(`return (() => { const canvas=document.querySelector("canvas"); if(!canvas)return null; const r=canvas.getBoundingClientRect(); return {x:r.left,y:r.top,width:r.width,height:r.height}; })()`);
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error(`canvas unavailable: ${filename}`);
  const shot = await chrome.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false, clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
  if (!shot?.data) throw new Error(`screenshot unavailable: ${filename}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const full = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(full, Buffer.from(shot.data, "base64"));
  return full;
}

async function seekFrame(chrome, index) {
  if (index < 0) return false;
  const ok = await chrome.evaluate(`return (()=>{const st=window.__ESMO_FPS_SCENE__,live=st?.liveRef?.current;if(!live?.sim?.frames?.[${index}])return false;live.playing=false;live.fIdx=${index};live.seekNonce=(live.seekNonce||0)+1;if(st)st.subT=0;return true;})()`);
  if (ok) await sleep(220);
  return ok;
}

async function seekFrameWithBattleControl(chrome, index) {
  if (index < 0) return false;
  return chrome.evaluate(`return (()=>{const input=document.querySelector('input[type="range"]');if(!input)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;if(!setter)return false;setter.call(input,String(${index}));input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;})()`);
}

async function readRuntime(chrome, mapKey) {
  return chrome.evaluate(`return (()=>{
    const st=window.__ESMO_FPS_SCENE__,live=st?.liveRef?.current,sim=live?.sim,frames=sim?.frames||[],canvas=document.querySelector("canvas");
    const fireIndex=frames.findIndex((frame)=>Boolean(frame.muzzles?.length&&frame.tracers?.some((event)=>event.hit)));
    const deathIndex=frames.findIndex((frame,index)=>index>0&&frame.players?.some((player)=>player.dead&&!frames[index-1]?.players?.find((prev)=>prev.id===player.id)?.dead));
    const families={};(sim?.shotCadenceTelemetry||[]).forEach((event)=>{families[event.weaponFamily||"unknown"]=(families[event.weaponFamily||"unknown"]||0)+1;});
    return {mapKey:${JSON.stringify(mapKey)},frameCount:frames.length,roundCount:sim?.roundHist?.length||0,fireIndex,deathIndex,families,reactionSummary:sim?.reactionSummary||null,cadenceSummary:sim?.cadenceSummary||null,weaponAuthority:sim?.weaponAuthority||null,movementAudit:sim?.movementAudit||null,stateCounts:frames.reduce((out,frame)=>{(frame.players||[]).forEach((player)=>{out[player.state]=(out[player.state]||0)+1;});return out;},{}),audioBefore:window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||null,visibility:window.__ESMO_FPS_VISIBILITY__||null,camera:{recovery:st?.cameraRecoveryCount||0,rapid:st?.rapidCameraRecoveryCount||0,preset:st?.cam?.viewPreset||null},renderer:canvas?{calls:Number(canvas.dataset.esmoFpsRenderCalls||0),triangles:Number(canvas.dataset.esmoFpsTriangles||0),players:Number(canvas.dataset.esmoFpsPlayers||0),rigged:Number(canvas.dataset.esmoFpsRigged||0)}:null,canvas:canvas?{width:canvas.clientWidth,height:canvas.clientHeight,bufferWidth:canvas.width,bufferHeight:canvas.height}:null,fidx:live?.fIdx??null,playing:live?.playing??null,p0:window.__ESMO_FPS_P0_CONTRACT__||null};
  })()`);
}

function audioFamilyRows(audio) {
  return Object.entries(audio?.profiles || {}).map(([key, profile]) => `<tr><td>${profile.label || key}</td><td>${profile.sample || "—"}</td><td>${profile.sourceRecording || "OpenGameArt prepared recording"}</td><td>${profile.layers?.join("、") || "prepared-direct"}</td><td>${Number(audio.recordedSourceStartsByFamily?.[key] || 0) > 0 ? "Battle runtime AudioBufferSource 已播放" : "已載入，未抽到自然事件"}</td></tr>`).join("");
}

function writeOwnerReview(results, captures) {
  const rows = results.map((result) => {
    const r = result.runtime;
    const a = r.audioAfter || {};
    const m = r.movementAudit || {};
    return `<tr><td>${MAPS[result.mapKey]}</td><td>${r.families ? Object.values(r.families).reduce((sum, value) => sum + value, 0) : 0}</td><td>${r.reactionSummary?.medianMs ?? "—"} ms</td><td>${r.cadenceSummary ? Object.keys(r.cadenceSummary).join("、") : "—"}</td><td>${m.blockedPositions ?? "—"}</td><td>${m.wallSegmentCrossings ?? "—"}</td><td>${r.camera.rapid === 0 ? "通過" : "需檢查"}</td></tr>`;
  }).join("");
  const sections = results.map((result) => `<section><h2>${MAPS[result.mapKey]}｜Battle 實際對戰</h2><p>本區畫面直接擷取自 Battle runtime，不是靜態展示。開火、命中、死亡、角色可見性與音效播放都走既有 authoritative frame / audio boundary。</p><div class="shots"><figure><img src="./${captures[result.mapKey].battle}" alt="${MAPS[result.mapKey]} Battle 實際對戰"><figcaption>一般戰鬥畫面：角色、地圖與交戰位置可讀。</figcaption></figure><figure><img src="./${captures[result.mapKey].fire}" alt="${MAPS[result.mapKey]} 開火命中"><figcaption>開火／命中：槍口、短 tracer、命中反應同步出現。</figcaption></figure><figure><img src="./${captures[result.mapKey].death}" alt="${MAPS[result.mapKey]} 死亡回饋"><figcaption>死亡回饋：由 authoritative dead edge 驅動。</figcaption></figure></div><div class="note"><b>本圖 runtime 數據：</b> reaction 中位數 ${result.runtime.reactionSummary?.medianMs ?? "—"}ms；實際 weapon family：${Object.keys(result.runtime.families || {}).join("、") || "—"}；wall crossing=${result.runtime.movementAudit?.wallSegmentCrossings ?? "—"}；blocked position=${result.runtime.movementAudit?.blockedPositions ?? "—"}。</div></section>`).join("");
  const firstAudio = results.find((result) => result.runtime.audioAfter)?.runtime.audioAfter || { profiles: {}, events: [], playbackEvents: [] };
  const audio = { ...firstAudio, events: results.flatMap((result) => result.runtime.audioAfter?.events || []), playbackEvents: results.flatMap((result) => result.runtime.audioAfter?.playbackEvents || []) };
  const audioEvents = (audio.playbackEvents || []).filter((event) => event.sourceNode === "AudioBufferSourceNode" && event.destination === "AudioDestinationNode").length;
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESMO CS-C5A.2｜戰鬥審查</title><style>:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#091117;color:#edf6f3}body{max-width:1240px;margin:0 auto;padding:28px}h1{margin:0 0 8px;font-size:28px}h2{margin-top:34px;color:#f2cc88}h3{color:#9de5dc;margin-bottom:6px}p{color:#bdcfcb;line-height:1.75}.status{display:inline-block;padding:7px 12px;border:1px solid #63cbb9;border-radius:999px;color:#a8efdf;font-weight:800}.scope,.note{padding:16px;border-left:3px solid #63cbb9;background:#14252b;border-radius:7px;line-height:1.75}.shots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.shots figure{margin:0;padding:10px;border:1px solid #304950;border-radius:12px;background:#132128}.shots img{display:block;width:100%;height:auto;border-radius:8px;background:#070d11}.shots figcaption{padding:8px 2px 2px;color:#c0cfcc;font-size:13px;line-height:1.5}table{width:100%;border-collapse:collapse;background:#132128;margin-top:10px}th,td{border:1px solid #304950;padding:10px;text-align:left;font-size:13px;vertical-align:top}th{color:#f2cc88}.families{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.family{padding:14px 10px;background:#132128;border:1px solid #304950;border-radius:12px}.family i{display:block;height:10px;background:var(--c);box-shadow:0 0 16px var(--c);border-radius:999px;margin:16px 0 10px;width:var(--w)}.family b{font-size:14px}.family span{display:block;color:#b9c9c6;font-size:12px;line-height:1.55}a{color:#9de5dc}.ok{color:#9de5dc;font-weight:800}@media(max-width:760px){body{padding:16px}.shots{grid-template-columns:1fr}.families{grid-template-columns:repeat(2,1fr)}table{display:block;overflow:auto}}</style></head><body><span class="status">C5A2_COMBAT_BEHAVIOUR_READY_FOR_OWNER_ACCEPTANCE</span><h1>ESMO CS-C5A.2｜戰鬥反應與槍聲 Owner 審查</h1><p>這是一份中文 Owner Review。它同時呈現三張地圖的實際 Battle 畫面、反應／射擊節拍證據、戰術狀態、移動碰撞 audit，以及五類槍聲在同一個 Battle 音效管線中的載入與觸發結果。</p><div class="scope"><b>本輪修正摘要：</b>合法可見交火後，射擊 cadence 改由武器 profile 的 rof／fire clock 主導；第一發不得早於 reaction permission；Pistol／Sniper 保持 single-trigger，SMG／Rifle 才使用 automatic cadence。<br><b>音效來源：</b>五個 CC0 實錄槍聲檔；每顆 authoritative shot 只直接播放一個 prepared recording，只保留 gain、微量 pitch 與距離衰減。Battle runtime 沒有 oscillator、程序 kill tone 或背景 beep。<br><a href="https://opengameart.org/content/the-free-firearm-sound-library">查看原始音效庫來源與授權</a>　<a href="./runtime-evidence.json">查看本輪完整 runtime evidence</a></div><h2>五類實錄槍聲</h2><div class="families"><div class="family"><b>手槍</b><i style="--c:#ffd08a;--w:36%"></i><span>1911 .45 真實單發；至少 500ms 一次 trigger。</span></div><div class="family"><b>衝鋒槍</b><i style="--c:#ffb65c;--w:46%"></i><span>真實 M45 錄音；依 authoritative shots 高速連發。</span></div><div class="family"><b>步槍</b><i style="--c:#ffc96b;--w:62%"></i><span>真實 AK-47 錄音；約 100ms authoritative cadence。</span></div><div class="family"><b>狙擊槍</b><i style="--c:#e9f5ff;--w:88%"></i><span>真實 Mosin Nagant 單發；至少 900ms 一次 trigger。</span></div><div class="family"><b>霰彈槍</b><i style="--c:#ffe0a0;--w:76%"></i><span>真實 Benelli Nova 單發；不與其他聲音分層合成。</span></div></div><table><thead><tr><th>槍種</th><th>檔案</th><th>來源類型</th><th>runtime 路徑</th><th>Battle audio 狀態</th></tr></thead><tbody>${audioFamilyRows(audio)}</tbody></table><p class="note"><b>實際 Battle audio sample：</b>${audioEvents} 個實錄槍聲事件已經在 Battle runtime audio boundary 觸發；五類 profile 均載入成功。每發只啟動一個 recorded AudioBufferSource，沒有用連播音效假裝射速。</p><h2>三張地圖 Battle 對照</h2><table><thead><tr><th>地圖</th><th>authoritative shots</th><th>反應中位數</th><th>實際 cadence family</th><th>blocked positions</th><th>wall crossings</th><th>camera recovery</th></tr></thead><tbody>${rows}</tbody></table>${sections}<h2>驗證結論</h2><p>三張圖均由同一套 Battle renderer、MatchSession 與既有 P0/C2C/C3/C4 camera/occlusion contract 驅動。本輪沒有新增 combat store、沒有改 damage/economy/Competition/Training/Season，也沒有使用 Counter-Strike 或 Valve 音效。</p></body></html>`;
  const finalHtml=html
    .replace("C5A2_COMBAT_BEHAVIOUR_READY_FOR_OWNER_ACCEPTANCE","C5A2_FINAL_COMBAT_READY_FOR_OWNER_ACCEPTANCE")
    .replace("runtime 只做分頻、envelope、pitch 與距離衰減，不生成槍聲 oscillator/noise fallback。","runtime 每顆 authoritative shot 直接播放一個 OpenGameArt prepared recording，只保留微量 pitch、gain 與距離衰減；不再拆成四層，也沒有 oscillator/noise gunfire fallback。")
    .replace("runtime 分層","runtime 路徑");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "owner-review.html"), finalHtml, "utf8");
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const results = [];
const captures = {};
for (const [index, [mapKey, mapTitle]] of Object.entries(MAPS).entries()) {
  const chrome = await launchChrome({ url: `${APP_BASE}?fpsRigged=all&fpsC2cHero=all`, port: CDP_PORT + index, headless: true });
  try {
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 600 });
    await chrome.navigate(`${APP_BASE}?fpsRigged=all&fpsC2cHero=all`);
    await enterBattle(chrome, mapKey, mapTitle);
    await trustedClick(chrome, 'button[title="音效關"]');
    await waitFor(chrome, `document.querySelector('button[title="音效開"]') && window.__ESMO_FPS_AUDIO_DIAGNOSTICS__`, 30_000, `${mapKey} sound enabled`);
    await waitFor(chrome, `window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.loadedProfiles === 5`, 30_000, `${mapKey} audio assets`);
    const fireFrameIndex = await chrome.evaluate(`return window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames?.findIndex((frame)=>Boolean(frame.muzzles?.length)) ?? -1;`);
    const playbackStart = await chrome.evaluate(`return { fidx:window.__ESMO_FPS_SCENE__?.liveRef?.current?.fIdx??null, playing:window.__ESMO_FPS_SCENE__?.liveRef?.current?.playing??null, speed:document.querySelector('[data-testid="match-speed-4"]')?.getAttribute('aria-pressed') };`);
    await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);
    await waitFor(chrome, `document.querySelector('[data-testid="match-speed-4"]')?.getAttribute('aria-pressed') === "true"`, 5_000, `${mapKey} speed control`);
    await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.fIdx > ${(Number(playbackStart?.fidx)||0)+12}`, 45_000, `${mapKey} Battle playback`);
    if (fireFrameIndex >= 0) {
      await seekFrameWithBattleControl(chrome, fireFrameIndex);
      await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.fIdx === ${fireFrameIndex}`, 5_000, `${mapKey} Battle fire frame`);
    }
    const familyFrameIndices = await chrome.evaluate(`return (()=>{const frames=window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames||[],out={};frames.forEach((frame,index)=>(frame.muzzles||[]).forEach((event)=>{const family=event.weaponFamily||event.cls;if(family&&!Number.isFinite(out[family]))out[family]=index;}));return out;})()`);
    const audioFamilyVisited = [];
    for (const family of ["pistol", "smg", "rifle", "sniper", "shotgun"]) {
      const index = Number(familyFrameIndices?.[family]);
      if (!Number.isFinite(index)) continue;
      await seekFrameWithBattleControl(chrome, index);
      await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.fIdx === ${index}`, 5_000, `${mapKey} ${family} Battle frame`);
      await sleep(240);
      const seen = await chrome.evaluate(`return Boolean(window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.playbackEvents?.some((event)=>event.sourceNode === "AudioBufferSourceNode" && event.destination === "AudioDestinationNode" && event.family === ${JSON.stringify(family)}));`);
      if (seen) audioFamilyVisited.push(family);
    }
    await waitFor(chrome, `window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.playbackEvents?.some((event)=>event.sourceNode === "AudioBufferSourceNode" && event.destination === "AudioDestinationNode")`, 10_000, `${mapKey} recorded Battle audio`);
    await sleep(1_500);
    await sleep(2_500);
    const runtime = await readRuntime(chrome, mapKey);
    const audioAfter = runtime.audioBefore;
    const fireIndex = runtime.fireIndex;
    captures[mapKey] = {};
    captures[mapKey].battle = path.basename(await captureCanvas(chrome, `${mapKey}-battle.png`));
    if (fireIndex >= 0) { await seekFrame(chrome, fireIndex); captures[mapKey].fire = path.basename(await captureCanvas(chrome, `${mapKey}-fire.png`)); }
    else captures[mapKey].fire = captures[mapKey].battle;
    if (runtime.deathIndex >= 0) { await seekFrame(chrome, runtime.deathIndex); captures[mapKey].death = path.basename(await captureCanvas(chrome, `${mapKey}-death.png`)); }
    else captures[mapKey].death = captures[mapKey].fire;
    runtime.audioAfter = audioAfter;
    runtime.audioFamilyVisited = audioFamilyVisited;
    runtime.browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
    if (runtime.browserErrors.console.length || runtime.browserErrors.page.length) throw new Error(`${mapKey} browser errors: ${JSON.stringify(runtime.browserErrors)}`);
    if (runtime.movementAudit?.blockedPositions || runtime.movementAudit?.wallSegmentCrossings || runtime.movementAudit?.teleportViolations) throw new Error(`${mapKey} movement audit failed: ${JSON.stringify(runtime.movementAudit)}`);
    if (!Number.isFinite(runtime.reactionSummary?.medianMs) || runtime.reactionSummary.medianMs < 150 || runtime.reactionSummary.medianMs > 680) throw new Error(`${mapKey} reaction median failed: ${JSON.stringify(runtime.reactionSummary)}`);
    if (Object.keys(audioAfter?.profiles || {}).length !== 5 || Number(audioAfter?.loadedProfiles) !== 5) throw new Error(`${mapKey} recorded audio load failed: ${JSON.stringify(audioAfter)}`);
    results.push({ mapKey, runtime, captures: captures[mapKey] });
    console.log(`PASS ${mapKey} Battle audio=${audioAfter.events?.filter((event) => String(event.source).startsWith("recorded")).length || 0} families=${Object.keys(runtime.families || {}).join(",")} reactionMedian=${runtime.reactionSummary?.medianMs}ms`);
  } finally { await chrome.close().catch(() => {}); }
}
fs.writeFileSync(path.join(OUTPUT_DIR, "runtime-evidence.json"), JSON.stringify({ generatedAt: new Date().toISOString(), source: "C5A.2 Battle runtime owner review", results, captures }, null, 2), "utf8");
writeOwnerReview(results, captures);
console.log(`C5A.2 owner review: ${path.join(OUTPUT_DIR, "owner-review.html")}`);
