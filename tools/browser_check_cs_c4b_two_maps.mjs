#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { launchChrome, startDevServer } from "./browser/cdp.mjs";

const VITE_PORT = Number(process.env.CS_C4B_VITE_PORT || 5412);
const CDP_PORT = Number(process.env.CS_C4B_CDP_PORT || 9412);
const WIDTH = Number(process.env.CS_C4B_VIEWPORT_WIDTH || 1366);
const HEIGHT = Number(process.env.CS_C4B_VIEWPORT_HEIGHT || 768);
const APP = process.env.CS_C4B_APP_URL || `http://127.0.0.1:${VITE_PORT}/ESMO-/?fpsRigged=all&fpsC2cHero=all`;
const OUTPUT_DIR = process.env.CS_C4B_CAPTURE_DIR || path.resolve("artifacts/cs-c4b/two-maps");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAPS = {
  mirage: {
    title: "Mirage",
    root: "C3_Mirage_Environment_VSlice",
    zones: ["C3_Mirage_A_Site", "C3_Mirage_Mid", "C3_Mirage_Connector", "C4A_Mirage_B_Site", "C4A_Mirage_T_Spawn", "C4A_Mirage_CT_Spawn", "C4A_Mirage_Apartments", "C4A_Mirage_Palace", "C4A_Mirage_A_Ramp", "C4A_Mirage_Underpass", "C4A_Mirage_Catwalk_Short", "C4A_Mirage_Connectors"],
  },
  dust2: {
    title: "Dust II",
    root: "C4B_Dust2_FullMap",
    zones: ["C4B_Dust2_A_Site", "C4B_Dust2_B_Site", "C4B_Dust2_T_Spawn", "C4B_Dust2_CT_Spawn", "C4B_Dust2_Mid", "C4B_Dust2_Long", "C4B_Dust2_Short_Catwalk", "C4B_Dust2_B_Tunnel", "C4B_Dust2_Connectors"],
  },
  inferno: {
    title: "Inferno",
    root: "C4B_Inferno_FullMap",
    zones: ["C4B_Inferno_A_Site", "C4B_Inferno_B_Site", "C4B_Inferno_T_Spawn", "C4B_Inferno_CT_Spawn", "C4B_Inferno_Banana", "C4B_Inferno_Mid_SecondMid", "C4B_Inferno_A_Connector_Arch", "C4B_Inferno_Apartments", "C4B_Inferno_B_Top", "C4B_Inferno_Pit_Cemetery", "C4B_Inferno_Connectors"],
  },
};

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
    const button = [...document.querySelectorAll("button")].find((node) => (${predicate})(node, (node.innerText || "").replace(/\\s+/g, " ").trim()));
    if (!button || button.disabled) return { ok: false, buttons: [...document.querySelectorAll("button")].map((node) => (node.innerText || "").replace(/\\s+/g, " ").trim()).slice(0, 60) };
    const text = (button.innerText || "").replace(/\\s+/g, " ").trim(); button.click(); return { ok: true, text };
  `);
  if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`);
  return result;
}

async function clickPrepAction(chrome) {
  return chrome.evaluate(`
    const button = document.querySelector('[data-testid="prep-primary-action"]');
    if (!button || button.disabled) return { ok: false, action: button?.dataset.action ?? null };
    const action = button.dataset.action; button.click(); return { ok: true, action };
  `);
}

async function enterBattle(chrome, mapKey) {
  await waitFor(chrome, `document.querySelector("button") && document.body.innerText.includes("CS")`, 30_000, "首頁");
  await clickByText(chrome, `(node, text) => text.includes("CS")`, "CS 入口");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "CS 準備頁");
  let prep = await clickPrepAction(chrome);
  if (!prep.ok && prep.action === "blocked") {
    await clickByText(chrome, `(node, text) => text.includes("Auto") || text.includes("自動")`, "自動補齊陣容");
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 15_000, "陣容完成");
    prep = await clickPrepAction(chrome);
  }
  if (!prep.ok) throw new Error(`preparation action unavailable: ${JSON.stringify(prep)}`);
  if (prep.action === "enqueue") {
    await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "對戰準備完成");
    if (await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm";`)) await clickPrepAction(chrome);
  }
  await waitFor(chrome, `document.querySelector('[data-map-key="${mapKey}"]')`, 45_000, "地圖選擇");
  await chrome.evaluate(`document.querySelector('[data-map-key="${mapKey}"]')?.click(); return true;`);
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled&&!node.dataset.mapKey); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `!document.querySelector('[data-map-key="${mapKey}"]') && document.body.innerText.includes("${MAPS[mapKey].title}")`, 30_000, "戰術選擇");
  await clickByText(chrome, `(node, text) => text.length > 20 && !text.includes("Cancel") && !text.includes("取消")`, "戰術方案");
  await chrome.evaluate(`const buttons=[...document.querySelectorAll("button")].filter((node)=>!node.disabled); buttons.at(-1)?.click(); return buttons.length;`);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`, 45_000, "Battle 畫布");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-camera-presets"]') && document.querySelector('[data-testid="cs-camera-preset-high"]') && document.querySelector('[data-testid="cs-camera-preset-overview"]') && document.querySelector('[data-testid="cs-camera-preset-tactical"]')`, 10_000, "戰術視角按鈕");
}

async function captureCanvas(chrome, name) {
  await chrome.evaluate(`document.querySelector("canvas")?.scrollIntoView({block:"start",inline:"nearest"}); return true;`);
  await sleep(120);
  const rect = await chrome.evaluate(`return (() => { const canvas=document.querySelector("canvas"); if(!canvas)return null; const r=canvas.getBoundingClientRect(); return {x:r.left,y:r.top,width:r.width,height:r.height}; })()`);
  if (!rect || rect.width < 1 || rect.height < 1) throw new Error(`canvas unavailable: ${name}`);
  const shot = await chrome.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false, clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 } });
  if (!shot?.data) throw new Error(`screenshot unavailable: ${name}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filename = path.join(OUTPUT_DIR, `${name}.png`);
  fs.writeFileSync(filename, Buffer.from(shot.data, "base64"));
  return filename;
}

async function setCamera(chrome, preset) {
  return chrome.evaluate(`return (() => { const button=document.querySelector('[data-testid="cs-camera-preset-${preset}"]'); if(!button||button.disabled)return false; button.click(); return true; })()`);
}

async function pauseFrame(chrome) {
  return chrome.evaluate(`return (() => { const live=window.__ESMO_FPS_SCENE__?.liveRef?.current; if(!live)return false; live.playing=false; live.fIdx=0; return true; })()`);
}

async function readEvidence(chrome, mapKey) {
  const config = MAPS[mapKey];
  return chrome.evaluate(`return (() => {
    const st=window.__ESMO_FPS_SCENE__; const env=st?.c3Environment?.group||st?.worldGroup?.getObjectByName?.(${JSON.stringify(config.root)})||null;
    const zones=${JSON.stringify(config.zones)}.map((name)=>{const zone=env?.getObjectByName?.(name)||null;let meshes=0,visibleMeshes=0;zone?.traverse?.((o)=>{if(o.isMesh){meshes+=1;if(o.visible)visibleMeshes+=1;}});return {name,found:Boolean(zone),visible:Boolean(zone?.visible),meshes,visibleMeshes};});
    let environmentMeshes=0,c4bMeshes=0,c4aMeshes=0;env?.traverse?.((o)=>{if(o.isMesh&&o.userData?.c3Environment)environmentMeshes+=1;if(o.isMesh&&o.userData?.c4bEnvironment)c4bMeshes+=1;if(o.isMesh&&o.userData?.c4aEnvironment)c4aMeshes+=1;});
    const canvas=document.querySelector("canvas"), visibility=window.__ESMO_FPS_VISIBILITY__||null, players=st?.players||[];
    return {mapKey:${JSON.stringify(mapKey)},environment:{found:Boolean(env),visible:Boolean(env?.visible),zones,environmentMeshes,c4bMeshes,c4aMeshes,summary:st?.c3Environment?.summary||null},mapContract:{wallRects:st?.wallRects?.length||0,mapWalls:st?.mapWalls?.length||0,raycastTargets:st?.raycastTargets?.length||0},players:{total:players.length,rigged:players.filter((p)=>p.rigged?.mode==="rigged").length,visible:players.filter((p)=>p.g?.visible!==false).length},canvas:canvas?{width:canvas.clientWidth,height:canvas.clientHeight,bufferWidth:canvas.width,bufferHeight:canvas.height}:null,renderer:canvas?{calls:Number(canvas.dataset.esmoFpsRenderCalls||0),triangles:Number(canvas.dataset.esmoFpsTriangles||0),geometries:Number(canvas.dataset.esmoFpsGeometries||0),textures:Number(canvas.dataset.esmoFpsTextures||0),players:Number(canvas.dataset.esmoFpsPlayers||0),rigged:Number(canvas.dataset.esmoFpsRigged||0),mixers:Number(canvas.dataset.esmoFpsMixers||0)}:null,visibility,camera:st?{preset:st.cam?.viewPreset||null,recovery:st.cameraRecoveryCount||0,rapid:st.rapidCameraRecoveryCount||0,position:st.camera?.position?.toArray?.()||null}:null};
  })()`);
}

function writeOwnerReview(results) {
  const mapSections = results.map((result) => {
    const map = MAPS[result.mapKey]; const s = result.live.environment.summary || {}; const identity = s.mapIdentity || { style: "明亮沙漠市集戰術地圖", palette: "沙岩／混凝土／藍綠導視" }; const zoneList = s.fullMapZones || s.zones || [];
    const image = (view) => { const caption = view === "battle" ? "Battle runtime 實際畫面" : `${view === "high" ? "高位上帝視角" : view === "overview" ? "中高位全場總覽" : "側上方戰術總覽"}；角色可見性與路線辨識證據。`; return `<figure><img src="./${result.mapKey}-${view}.png" alt="${map.title} ${view}"><figcaption>${caption}</figcaption></figure>`; };
    return `<section><h2>${map.title}｜${identity.style}</h2><p><b>地圖特色：</b>${identity.palette}。<br><b>區域：</b>${zoneList.map((z) => z.label).join("、") || "主要站點與路線"}。<br><b>環境統計：</b>${s.environmentMeshes || s.decorationMeshes || 0} 個環境 mesh、約 ${s.estimatedTriangles || 0} triangles、${s.materialFamilies || 0} 個材質家族。<br><b>遮擋：</b>沿用高位視角智慧淡化／隱藏，未修改碰撞與玩法。</p><div class="shots">${image("battle")}${image("high")}${image("overview")}${image("tactical")}</div></section>`;
  }).join("");
  const comparison = results.map((result) => {
    const s = result.live.environment.summary || {}; const map = MAPS[result.mapKey];
    const identity = s.mapIdentity || { style: "明亮沙漠市集戰術地圖", palette: "沙岩／混凝土／藍綠導視" }; return `<tr><td>${map.title}</td><td>${identity.style}</td><td>${identity.palette}</td><td>${s.environmentMeshes || s.decorationMeshes || 0}</td><td>${s.estimatedTriangles || 0}</td><td>高位／總覽／戰術</td><td>PASS</td></tr>`;
  }).join("");
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESMO CS-C4B 兩張地圖 Owner Review</title><style>:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0e171b;color:#edf5f2}body{max-width:1240px;margin:0 auto;padding:28px}h1{margin:0 0 8px;font-size:28px}h2{margin-top:32px;color:#f4cf8a}p{color:#bdccca;line-height:1.7}.status{display:inline-block;padding:6px 11px;border:1px solid #62c9b5;border-radius:999px;color:#a8efdf;font-weight:800}.scope{padding:16px;border-left:3px solid #62c9b5;background:#16262c;border-radius:5px}.shots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.shots figure{margin:0;padding:10px;border:1px solid #30454d;border-radius:12px;background:#15232a}.shots img{display:block;width:100%;height:auto;border-radius:8px;background:#091014}.shots figcaption{padding:8px 2px 2px;color:#b9c8c8;font-size:13px}table{width:100%;border-collapse:collapse;background:#15232a}th,td{border:1px solid #30454d;padding:10px;text-align:left;font-size:13px}th{color:#f4cf8a}a{color:#8ed9e2}@media(max-width:760px){body{padding:16px}.shots{grid-template-columns:1fr}table{font-size:11px}}</style></head><body><span class="status">C4B_TWO_MAPS_READY_FOR_OWNER_ACCEPTANCE</span><h1>ESMO CS-C4B｜兩張地圖環境 Owner 驗收</h1><p>本頁以中文呈現第二張與第三張地圖的完整環境、三種戰術視角與 Battle runtime 證據。三張地圖共用 environment production framework，但保留各自的建築、材質、地標、路線與光影 identity。</p><div class="scope"><b>驗收重點：</b>站點與出生點可辨識、主要 route／choke point 清楚、10 位角色在高位視角仍可見、建築只在真正遮擋時淡化／隱藏；Player identity、Camera recovery、StableCanvasRegion、RAF coherence、C2C 角色動畫均維持原契約。<br><a href="./runtime-evidence.json">查看完整 runtime evidence</a></div>${mapSections}<h2>三張地圖比較</h2><table><thead><tr><th>地圖</th><th>場景特色</th><th>主色系</th><th>環境 mesh</th><th>估算 triangles</th><th>視角</th><th>遮擋</th></tr></thead><tbody>${comparison}</tbody></table><h2>驗收結論</h2><p>Dust II 使用日照沙岩、塵土、長道／隧道與藍綠導視；Inferno 使用陶土、紅瓦、拱門、橄欖綠與地中海街巷。Mirage 維持原有的明亮沙漠市集語言。三者共享 production framework，但沒有共用同一套建築造型或 placement。</p></body></html>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, "owner-review.html"), html, "utf8");
}

let dev = null;
try {
  if (process.env.CS_C4B_START_DEV === "1") dev = await startDevServer({ port: VITE_PORT });
  const results = [];
  for (const [mapIndex, mapKey] of ["mirage", "dust2", "inferno"].entries()) {
    let chrome = null;
    try {
      chrome = await launchChrome({ url: APP, port: CDP_PORT + mapIndex, headless: true });
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 600 });
    await chrome.navigate(APP);
    await enterBattle(chrome, mapKey);
    await chrome.evaluate(`document.querySelector('[data-testid="match-speed-4"]')?.click(); return true;`);
    await sleep(4_000);
    const live = await readEvidence(chrome, mapKey);
    const result = { mapKey, live, captures: {} };
    result.live.browserErrors = { console: chrome.consoleLines.filter((line) => line.startsWith("[error]")), page: chrome.pageErrors };
    result.captures.battle = await captureCanvas(chrome, `${mapKey}-battle`);
    if (!await pauseFrame(chrome)) throw new Error(`${mapKey} owner frame pause failed`);
    for (const preset of ["high", "overview", "tactical"]) {
      if (!await setCamera(chrome, preset)) throw new Error(`${mapKey} camera preset setup failed: ${preset}`);
      await sleep(850);
      const view = await readEvidence(chrome, mapKey);
      if (view.camera?.preset !== preset) throw new Error(`${mapKey} camera preset did not stick: ${preset}`);
      if (!view.visibility?.check?.ok) throw new Error(`${mapKey} visibility failed in ${preset}: ${JSON.stringify(view.visibility)}`);
      result.captures[preset] = await captureCanvas(chrome, `${mapKey}-${preset}`);
      result[`${preset}Evidence`] = view;
    }
    const missing = live.environment.zones.filter((zone) => !zone.found || zone.meshes < 8);
    if (!live.environment.found || !live.environment.visible || missing.length) throw new Error(`${mapKey} zones failed: ${JSON.stringify(missing)}`);
    const summaryOk = mapKey === "mirage"
      ? live.environment.summary?.fullMap && live.environment.summary?.c4aVersion === "c4a-mirage-full-v1"
      : live.environment.summary?.fullMap && live.environment.summary?.mapKey === mapKey && live.environment.summary?.c4bVersion === "c4b-two-map-v1";
    if (!summaryOk) throw new Error(`${mapKey} summary contract failed: ${JSON.stringify(live.environment.summary)}`);
    if (!live.environment.summary?.noCollisionMutation || !live.environment.summary?.noGameplayMutation) throw new Error(`${mapKey} scope contract failed`);
    if (live.environment.summary.estimatedTriangles > 5000 || live.environment.summary.materialFamilies > 32) throw new Error(`${mapKey} environment budget failed: ${JSON.stringify(live.environment.summary)}`);
    if (!live.canvas || live.canvas.width < 1 || live.canvas.height < 1) throw new Error(`${mapKey} invalid canvas`);
    if (live.players.total !== 10 || live.players.rigged !== 10 || live.players.visible < 10) throw new Error(`${mapKey} player visibility failed: ${JSON.stringify(live.players)}`);
    if (!live.visibility?.check?.ok || live.visibility.teams?.blue?.authoritative !== 5 || live.visibility.teams?.red?.authoritative !== 5) throw new Error(`${mapKey} P0 visibility failed: ${JSON.stringify(live.visibility)}`);
    if (live.camera?.rapid) throw new Error(`${mapKey} camera recovery loop observed`);
    if (live.browserErrors.console.length || live.browserErrors.page.length) throw new Error(`${mapKey} browser errors: ${JSON.stringify(live.browserErrors)}`);
    console.log(`PASS ${mapKey} environment=${live.environment.summary.environmentMeshes || live.environment.summary.decorationMeshes} meshes triangles=${live.environment.summary.estimatedTriangles} players=10/10 cameras=3/3`);
    results.push(result);
    } finally {
      await chrome?.close?.().catch?.(() => {});
    }
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "runtime-evidence.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
  writeOwnerReview(results);
  console.log(`CS-C4B map coverage: ${results.length}/3 PASS`);
  console.log(`CS-C4B owner review: ${path.join(OUTPUT_DIR, "owner-review.html")}`);
} finally {
  await dev?.stop?.().catch?.(() => {});
}
