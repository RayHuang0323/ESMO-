import { runGate, finishGate } from "./browser/harness.mjs";

const MAPS = { mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" };
const TARGET_MAPS = (process.env.OWNER_MAPS || Object.keys(MAPS).join(","))
  .split(",").map((key) => key.trim()).filter((key) => MAPS[key]);
const WIDTH = Number(process.env.OWNER_WIDTH || 390);
const HEIGHT = Number(process.env.OWNER_HEIGHT || 844);
const MOBILE = WIDTH <= 600;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(chrome, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return; } catch {}
    await sleep(120);
  }
  throw new Error(`${label} timeout`);
}

async function realClick(chrome, selector) {
  const point = await chrome.evaluate(`return (()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,disabled:Boolean(node.disabled)};})()`);
  if (!point || point.disabled) return false;
  await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  return true;
}

async function domClick(chrome, selector) {
  return chrome.evaluate(`return (()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)return false;node.click();return true;})()`);
}

async function pauseBattle(chrome) {
  await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;`);
  await sleep(160);
  await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;`);
}

async function readCamera(chrome) {
  return chrome.evaluate(`return (()=>{const s=window.__ESMO_FPS_SCENE__;const c=s?.camera,p=s?.cam,live=s?.liveRef?.current;return {camera:c?{x:c.position.x,y:c.position.y,z:c.position.z}:null,cam:p?{autoFollow:p.autoFollow,viewPreset:p.viewPreset,transition:p.presetTransition?{elapsedMs:p.presetTransition.elapsedMs,durationMs:p.presetTransition.durationMs}:null,chaseYaw:p.chaseYaw,chasePitch:p.chasePitch,povFov:p.povFov}:null,selected:live?.selected||null,cameraMode:live?.cameraMode||null,chaseId:s?._chaseId||null};})()`);
}

async function seekFrame(chrome, frameIndex) {
  const ok = await chrome.evaluate(`return (()=>{const input=document.querySelector('input[type="range"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;if(!input||!setter)return false;setter.call(input,String(${frameIndex}));input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;})()`);
  if (!ok) throw new Error(`seek ${frameIndex} failed`);
  await sleep(180);
}

async function readFrames(chrome) {
  return chrome.evaluate(`return (()=>{const frames=window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames||[];const at=(predicate)=>frames.findIndex(predicate);const eventTypes={};frames.forEach(f=>(f.events||[]).forEach(e=>{eventTypes[e.type]=(eventTypes[e.type]||0)+1;}));return {count:frames.length,carrier:at(f=>f.players?.some(p=>p.side==="t"&&!p.dead&&p.hasBomb)),dropped:at(f=>Boolean(f.droppedBomb)),planted:at(f=>Boolean(f.planted)),eventTypes,combatAudit:window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.combatAudit||null,movementAudit:window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.movementAudit||null,navigationAudit:window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.navigationAudit||null};})()`);
}

async function readBombPresentation(chrome) {
  return chrome.evaluate(`return (()=>{const scene=window.__ESMO_FPS_SCENE__;const state=document.querySelector("[data-cs-bomb-state]");const carrier=scene?.players?.filter(p=>p.bombBag?.visible).length||0;return {hud:state?.dataset.csBombState||null,text:state?.textContent||"",modelVisible:Boolean(scene?.bomb?.grp?.visible),modelParts:Number(scene?.bomb?.box?.parent?.children?.length||0),carrierModels:carrier};})()`);
}

async function testMap(chrome, base, mapKey, seed, ck) {
  const url = `${base}?c5c=battle&map=${mapKey}&seed=${seed}`;
  await chrome.navigate(url);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')&&document.querySelector('canvas')&&document.querySelector('[data-testid="cs-c5c-presentation-hud"]')`, 90_000, `${mapKey} mount`);
  await pauseBattle(chrome);

  const text = await chrome.evaluate(`return document.body.innerText||""`);
  const engineeringCopy = text.match(/.{0,24}(?:Three\.js|WebGL|simulation|snapshot|render|engine).{0,48}/i);
  if (engineeringCopy) console.log(`INFO ${MAPS[mapKey]} engineering-copy-match=${JSON.stringify(engineeringCopy[0])}`);
  ck(`${MAPS[mapKey]} HUD 無工程文字`, !engineeringCopy, "engineering copy detected");
  ck(`${MAPS[mapKey]} player controls`, Boolean(await chrome.evaluate(`return Boolean(document.querySelector('[data-testid="cs-player-controls"]'));`)));
  ck(`${MAPS[mapKey]} tactical presets`, await chrome.evaluate(`return document.querySelectorAll('[data-testid^="cs-camera-preset-"]:not([data-testid="cs-camera-preset-pov"])').length===3;`));
  ck(`${MAPS[mapKey]} route helper hidden in owner preview`, await chrome.evaluate(`return ![...document.querySelectorAll("button")].some(node=>node.textContent.includes("路線"));`));
  ck(`${MAPS[mapKey]} no horizontal overflow`, await chrome.evaluate(`return document.documentElement.scrollWidth<=document.documentElement.clientWidth&&document.body.scrollWidth<=document.body.clientWidth;`));

  const start = await readCamera(chrome);
  ck(`${MAPS[mapKey]} high preset click`, await domClick(chrome, '[data-testid="cs-camera-preset-high"]'));
  await sleep(140);
  const mid = await readCamera(chrome);
  await sleep(1_100);
  const end = await readCamera(chrome);
  console.log(`INFO ${MAPS[mapKey]} preset-samples=${JSON.stringify({start,mid,end})}`);
  const movedMid = start.camera && mid.camera && Math.hypot(mid.camera.x-start.camera.x, mid.camera.y-start.camera.y, mid.camera.z-start.camera.z)>0.01;
  const movedFinal = start.camera && end.camera && Math.hypot(end.camera.x-start.camera.x, end.camera.y-start.camera.y, end.camera.z-start.camera.z)>0.01;
  ck(`${MAPS[mapKey]} preset 有 transition 中間狀態`, Boolean(movedMid&&mid.cam?.transition));
  ck(`${MAPS[mapKey]} preset transition 完成且鏡頭已移動`, Boolean(movedFinal&&!end.cam?.transition&&end.camera));

  const cardIds = await chrome.evaluate(`return [...document.querySelectorAll('[data-esmo-fps-player-card]')].map(n=>n.getAttribute('data-esmo-fps-player-card'))`);
  ck(`${MAPS[mapKey]} player card 5v5`, cardIds.length===10);
  const cardSemantics = await chrome.evaluate(`return [...document.querySelectorAll('[data-esmo-fps-player-card]')].filter(n=>n.querySelector('svg')&&n.querySelector('[title]')).length`);
  ck(`${MAPS[mapKey]} player card 使用語意 icon`, cardSemantics>=10, `cards=${cardSemantics}`);
  ck(`${MAPS[mapKey]} card icon title`, await chrome.evaluate(`return ![...document.querySelectorAll('[data-esmo-fps-player-card] [title]')].some(n=>/^[⚡💥🔫🛡️]$/.test(n.textContent.trim()));`));

  const firstId = cardIds[0];
  const secondId = cardIds[1];
  ck(`${MAPS[mapKey]} first player POV select`, await domClick(chrome, `[data-esmo-fps-player-card="${firstId}"]`));
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.cameraMode==="pov"&&window.__ESMO_FPS_SCENE__?._chaseId===${JSON.stringify(firstId)}`, 4_000, `${mapKey} first POV`);
  const pov = await readCamera(chrome);
  ck(`${MAPS[mapKey]} Player POV camera`, pov.cameraMode==="pov"&&pov.chaseId===firstId&&pov.cam?.povFov>=36, JSON.stringify(pov));
  ck(`${MAPS[mapKey]} POV preset control enabled`, await chrome.evaluate(`return Boolean(document.querySelector('[data-testid="cs-camera-preset-pov"]')&&!document.querySelector('[data-testid="cs-camera-preset-pov"]').disabled);`));
  const yawBefore = pov.cam?.chaseYaw;
  const rect = await chrome.evaluate(`return (()=>{const r=document.querySelector("canvas")?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:null;})()`);
  if (rect) {
    await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x-30, y: rect.y, button: "left", clickCount: 1 });
    await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x+50, y: rect.y+8, button: "left" });
    await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x+50, y: rect.y+8, button: "left", clickCount: 1 });
    await sleep(160);
  }
  const povManual = await readCamera(chrome);
  ck(`${MAPS[mapKey]} POV 可手動調整`, Boolean(povManual.cam&&Math.abs((povManual.cam.chaseYaw||0)-(yawBefore||0))>0.001)||povManual.cam?.autoFollow===false);
  ck(`${MAPS[mapKey]} switch second player POV`, await domClick(chrome, `[data-esmo-fps-player-card="${secondId}"]`));
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.cameraMode==="pov"&&window.__ESMO_FPS_SCENE__?._chaseId===${JSON.stringify(secondId)}`, 4_000, `${mapKey} second POV`);
  const secondPov = await readCamera(chrome);
  ck(`${MAPS[mapKey]} player switching POV`, secondPov.chaseId===secondId, JSON.stringify(secondPov));
  ck(`${MAPS[mapKey]} return tactical camera`, await domClick(chrome, '[data-testid="cs-camera-preset-overview"]'));
  await sleep(1_200);
  const tactical = await readCamera(chrome);
  ck(`${MAPS[mapKey]} tactical camera unlocked after POV`, tactical.cameraMode==="tactical"&&tactical.selected===null&&!tactical.cam?.transition, JSON.stringify(tactical));

  const markers = await chrome.evaluate(`return (()=>{const s=window.__ESMO_FPS_SCENE__;return {rings:s?.players?.filter(p=>p.ring?.visible||p.disc?.visible).length||0,routes:s?.routeGroup?.children?.length||0};})()`);
  ck(`${MAPS[mapKey]} production selection marker restrained`, markers.rings===0);
  ck(`${MAPS[mapKey]} production route markers removed`, markers.routes===0);

  const frames = await readFrames(chrome);
  ck(`${MAPS[mapKey]} combat route interrupt`, Number(frames.combatAudit?.routeInterruptFirstShots||0)>0&&Number(frames.combatAudit?.routeInterruptPermissions||0)>0, JSON.stringify(frames.combatAudit));
  ck(`${MAPS[mapKey]} locomotion / cover audit`, Number(frames.movementAudit?.nonFinitePositions||0)===0&&Number(frames.movementAudit?.blockedPositions||0)===0&&Number(frames.movementAudit?.teleportViolations||0)===0&&Number(frames.movementAudit?.wallSegmentCrossings||0)===0, JSON.stringify(frames.movementAudit));
  ck(`${MAPS[mapKey]} navigation stuck audit`, Number(frames.navigationAudit?.unresolvedStuckEpisodes||0)===0);

  ck(`${MAPS[mapKey]} carrier frame exists`, frames.carrier>=0);
  if (frames.carrier>=0) {
    await seekFrame(chrome, frames.carrier);
    const carrier = await readBombPresentation(chrome);
    ck(`${MAPS[mapKey]} bomb carrier presentation`, carrier.hud==="carried"&&carrier.carrierModels>=1, JSON.stringify(carrier));
  }
  ck(`${MAPS[mapKey]} dropped frame exists`, frames.dropped>=0);
  if (frames.dropped>=0) {
    await seekFrame(chrome, frames.dropped);
    const dropped = await readBombPresentation(chrome);
    ck(`${MAPS[mapKey]} dropped C4 presentation`, dropped.hud==="dropped"&&dropped.modelVisible&&dropped.modelParts>=6, JSON.stringify(dropped));
  }
  ck(`${MAPS[mapKey]} planted frame exists`, frames.planted>=0);
  if (frames.planted>=0) {
    await seekFrame(chrome, frames.planted);
    const planted = await readBombPresentation(chrome);
    ck(`${MAPS[mapKey]} planting feedback / C4 model`, planted.hud==="planted"&&planted.modelVisible&&/C4/.test(planted.text), JSON.stringify(planted));
  }

  const audioButton = await chrome.evaluate(`return Boolean(document.querySelector('button[title="音效關"]'));`);
  if (audioButton) {
    await realClick(chrome, 'button[title="音效關"]');
    await waitFor(chrome, `window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.loadedProfiles===5&&window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.loadedPresentationProfiles>=8`, 30_000, `${mapKey} utility audio preload`);
  }
  const audio = await chrome.evaluate(`return window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||null`);
  ck(`${MAPS[mapKey]} CC0 utility audio loaded`, Boolean(audio&&audio.presentationAssetLicense==="CC0-1.0"&&audio.loadedPresentationProfiles>=8&&Object.keys(audio.presentationLoadErrors||{}).length===0), audio?JSON.stringify({loaded:audio.loadedPresentationProfiles,errors:audio.presentationLoadErrors,license:audio.presentationAssetLicense}):"audio diagnostics missing");

  return { mapKey, frameCount: frames.count, combat: frames.combatAudit, movement: frames.movementAudit, markers, audio: audio?{loadedPresentationProfiles:audio.loadedPresentationProfiles,presentationLoadErrors:audio.presentationLoadErrors}:null };
}

const result = await runGate({
  name: `CS Android Owner Review V2 (${MOBILE ? "390px" : "desktop"})`,
  base: "/ESMO-/",
  run: async ({ chrome, url, ck }) => {
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: MOBILE });
    const maps = [];
    for (const [index, mapKey] of TARGET_MAPS.entries()) maps.push(await testMap(chrome, url, mapKey, 505001 + index * 17, ck));
    ck("browser console errors = 0", chrome.consoleLines.filter((line) => line.startsWith("[error]")).length===0, JSON.stringify(chrome.consoleLines.filter((line) => line.startsWith("[error]"))));
    ck("browser page errors = 0", chrome.pageErrors.length===0, JSON.stringify(chrome.pageErrors));
    console.log(`INFO OWNER_REVIEW_V2 ${JSON.stringify({width:WIDTH,height:HEIGHT,maps})}`);
  },
});

await finishGate(result);
