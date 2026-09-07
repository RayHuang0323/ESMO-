import { runGate, finishGate } from "./browser/harness.mjs";

const MAPS = { mirage: "Mirage", dust2: "Dust II", inferno: "Inferno" };
const WIDTHS = [
  { label: "Desktop", width: 1440, height: 900, mobile: false },
  { label: "390px", width: 390, height: 844, mobile: true },
];
const TARGET_MAPS = (process.env.OWNER_MAPS || Object.keys(MAPS).join(","))
  .split(",").map((key) => key.trim()).filter((key) => MAPS[key]);
const TARGET_WIDTHS = (process.env.OWNER_VIEWPORTS || WIDTHS.map((item) => item.label).join(","))
  .split(",").map((label) => label.trim()).map((label) => WIDTHS.find((item) => item.label === label)).filter(Boolean);
const SEED_BASE = Number(process.env.OWNER_SEED_BASE || 505001);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(chrome, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return; } catch {}
    await sleep(120);
  }
  throw new Error(`${label} timeout`);
}

async function domClick(chrome, selector) {
  return chrome.evaluate(`return (()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)return false;node.click();return true;})()`);
}

async function realClick(chrome, selector) {
  const point = await chrome.evaluate(`return (()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,disabled:Boolean(node.disabled)};})()`);
  if (!point || point.disabled) return false;
  await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  return true;
}

async function realHover(chrome, selector) {
  const point = await chrome.evaluate(`return (()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;node.scrollIntoView({block:"center",inline:"nearest"});const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  if (!point) return false;
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  return true;
}

async function realTouch(chrome, selector, holdMs = 0) {
  const point = await chrome.evaluate(`return (()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;node.scrollIntoView({block:"center",inline:"nearest"});const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  if (!point) return false;
  await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x: point.x, y: point.y }] });
  if (holdMs > 0) await sleep(holdMs);
  await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return true;
}

async function pauseBattle(chrome) {
  await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;`);
  await sleep(180);
  await chrome.evaluate(`const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;`);
}

async function readScene(chrome, id = null) {
  return chrome.evaluate(`return (()=>{
    const s=window.__ESMO_FPS_SCENE__,live=s?.liveRef?.current,c=s?.camera,p=s?.cam;
    const snapshot=s?.visibilitySnapshot,playerId=${JSON.stringify(id)};
    const player=snapshot?.players?.find(item=>item.id===playerId)||null;
    return {
      fIdx:live?.fIdx??null,
      selected:live?.selected??null,
      cameraMode:live?.cameraMode??null,
      chaseId:s?._chaseId??null,
      camera:c?{x:c.position.x,y:c.position.y,z:c.position.z,fov:c.fov}:null,
      cam:p?{radius:p.radius,phi:p.phi,theta:p.theta,autoFollow:Boolean(p.autoFollow),overview:Boolean(p.overview),viewPreset:p.viewPreset||null,
        target:p.tgt?{x:p.tgt.x,y:p.tgt.y,z:p.tgt.z}:null,
        desiredTarget:p.dTgt?{x:p.dTgt.x,y:p.dTgt.y,z:p.dTgt.z}:null,
        transition:p.presetTransition?{elapsedMs:p.presetTransition.elapsedMs,durationMs:p.presetTransition.durationMs}:null,
        directorTarget:p._directorTelemetry||null,
        hotspot:p._directorHotspot?{key:p._directorHotspot.key,x:p._directorHotspot.x,y:p._directorHotspot.y}:null,
        chaseYaw:p.chaseYaw,chasePitch:p.chasePitch,povFov:p.povFov}:null,
      povWeapon:s?.povWeaponDiagnostics||null,
      povWeaponGroupVisible:Boolean(s?.povWeapon?.group?.visible),
      player:player?{id:player.id,authoritativeAlive:player.authoritativeAlive,presentationVisible:player.presentationVisible,povSelfHidden:Boolean(player.povSelfHidden)}:null,
    };
  })()`);
}

async function readAudio(chrome) {
  return chrome.evaluate(`return window.__ESMO_FPS_AUDIO_DIAGNOSTICS__||null`);
}

async function seekFrame(chrome, frameIndex) {
  const ok = await chrome.evaluate(`return (()=>{
    const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;
    if(live&&typeof live.seekFrame==="function"){live.seekFrame(${frameIndex});live.playing=false;return true;}
    const input=document.querySelector('input[type="range"]');
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    if(!input||!setter)return false;
    setter.call(input,String(${frameIndex}));
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    const fallbackLive=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(fallbackLive)fallbackLive.playing=false;
    return true;
  })()`);
  if (!ok) throw new Error(`seek ${frameIndex} failed`);
  await sleep(240);
}

async function readHotspotPair(chrome) {
  return chrome.evaluate(`return (()=>{
    const frames=window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames||[];
    const point=(frame)=>{
      const muzzles=(frame?.muzzles||[]).filter(event=>Number.isFinite(Number(event?.pos?.x))&&Number.isFinite(Number(event?.pos?.y)));
      if(muzzles.length)return {x:muzzles.reduce((sum,event)=>sum+Number(event.pos.x),0)/muzzles.length,y:muzzles.reduce((sum,event)=>sum+Number(event.pos.y),0)/muzzles.length,kind:"muzzles"};
      if(frame?.planted&&frame?.c4pos)return {x:Number(frame.c4pos.x),y:Number(frame.c4pos.y),kind:"c4"};
      const alive=(frame?.players||[]).filter(player=>!player.dead&&player.pos);
      if(!alive.length)return null;
      return {x:alive.reduce((sum,player)=>sum+Number(player.pos.x),0)/alive.length,y:alive.reduce((sum,player)=>sum+Number(player.pos.y),0)/alive.length,kind:"centroid"};
    };
    const candidates=[];
    for(let i=0;i<frames.length;i+=Math.max(1,Math.floor(frames.length/180))) { const p=point(frames[i]); if(p)candidates.push({i,p}); }
    if(candidates.length<2)return {first:0,second:Math.max(0,frames.length-1),distance:0,count:candidates.length};
    const first=candidates[0];let second=candidates[candidates.length-1],best=-1;
    for(const item of candidates.slice(1)){
      const distance=Math.hypot(item.p.x-first.p.x,item.p.y-first.p.y);
      if(distance>best){best=distance;second=item;}
    }
    return {first:first.i,second:second.i,distance:best,count:candidates.length,firstPoint:first.p,secondPoint:second.p};
  })()`);
}

async function canvasPoint(chrome) {
  return chrome.evaluate(`return (()=>{const r=document.querySelector("canvas")?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height}:null;})()`);
}

async function realDrag(chrome, selector = "canvas", dx = 80, dy = 10) {
  const point = await chrome.evaluate(`return (()=>{const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:null;})()`);
  if (!point) return false;
  await chrome.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x-30, y: point.y, button: "left", clickCount: 1 });
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x-30+dx, y: point.y+dy, button: "left" });
  await chrome.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x-30+dx, y: point.y+dy, button: "left", clickCount: 1 });
  return true;
}

async function realPinch(chrome, scale = 1.65) {
  const point = await canvasPoint(chrome);
  if (!point) return false;
  const y = point.y;
  await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
    { id: 1, x: point.x-32, y }, { id: 2, x: point.x+32, y },
  ] });
  await sleep(80);
  await chrome.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
    { id: 1, x: point.x-32*scale, y }, { id: 2, x: point.x+32*scale, y },
  ] });
  await sleep(80);
  await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  // Keep touch emulation enabled for the whole browser session. Toggling it
  // off between map navigations can make later CDP touch sequences disappear
  // even though the canvas remains the hit-tested target.
  return true;
}

async function testIcons(chrome, widthLabel, ck) {
  const iconState = await chrome.evaluate(`return (()=>{
    const icons=[...document.querySelectorAll('[data-esmo-fps-player-card] span[role="button"][data-cs-icon-type][aria-label]')];
    const contract=(document.querySelector('[data-testid="cs-player-controls"]')?.dataset.csIconContract||"").split(",").filter(Boolean);
    return {count:icons.length,labels:icons.map(node=>node.getAttribute("aria-label")||""),types:[...new Set(icons.map(node=>node.getAttribute("data-cs-icon-type")||""))],contract};
  })()`);
  const expected={armor:"防彈衣",helmet:"頭盔",grenade:"高爆手榴彈",flash:"閃光彈",smoke:"煙霧彈",molly:"燃燒彈",c4:"C4",weapon:"武器",hp:"生命值",money:"金錢"};
  const abstract = iconState.labels.filter(label => /^[⚡💥🔫🛡️]$/.test(label.trim()));
  const missingContract=Object.keys(expected).filter(type=>!iconState.contract.includes(type));
  ck(`${widthLabel} player-card icons have canonical labels`, iconState.count>=10 && abstract.length===0, JSON.stringify({count:iconState.count,abstract}));
  ck(`${widthLabel} icon contract exposes gameplay types`, missingContract.length===0, JSON.stringify({contract:iconState.contract,missing:missingContract}));

  const readTip=async(selector)=>chrome.evaluate(`return (()=>{const node=document.querySelector(${JSON.stringify(selector)});const tip=node?.querySelector('[role="tooltip"]');return {open:Boolean(tip),text:tip?.textContent||"",label:node?.getAttribute("aria-label")||""};})()`);
  const moveAway=async()=>{await chrome.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:4,y:4});await sleep(90);};
  const availableTypes=Object.keys(expected).filter(type=>iconState.types.includes(type));
  ck(`${widthLabel} rendered player-card icons expose semantic labels`, availableTypes.length>=3, JSON.stringify({rendered:availableTypes}));
  for(const type of availableTypes){
    const selector=`[data-esmo-fps-player-card] span[data-cs-icon-type="${type}"]`;
    if(widthLabel==="Desktop"){
      await moveAway();
      ck(`${widthLabel} ${type} hover target`, await realHover(chrome,selector));
      await sleep(110);
      const hovered=await readTip(selector);
      ck(`${widthLabel} ${type} hover tooltip`, Boolean(hovered.open&&hovered.text.includes(expected[type])&&/[\u4e00-\u9fff]/.test(hovered.text)), JSON.stringify(hovered));
      await moveAway();
      ck(`${widthLabel} ${type} hover tooltip closes`, !(await readTip(selector)).open);
      const focused=await chrome.evaluate(`return (()=>{const node=document.querySelector(${JSON.stringify(selector)});node?.focus();return Boolean(node);})()`);
      await sleep(90);
      const focusedTip=await readTip(selector);
      ck(`${widthLabel} ${type} focus tooltip`, Boolean(focused&&focusedTip.open&&focusedTip.text.includes(expected[type])), JSON.stringify(focusedTip));
      await chrome.evaluate(`document.querySelector(${JSON.stringify(selector)})?.blur();`);
      await sleep(90);
      ck(`${widthLabel} ${type} focus tooltip closes`, !(await readTip(selector)).open);
    }else{
      ck(`${widthLabel} ${type} tap target`, await realTouch(chrome,selector));
      await sleep(110);
      const tapped=await readTip(selector);
      ck(`${widthLabel} ${type} tap tooltip`, Boolean(tapped.open&&tapped.text.includes(expected[type])&&/[\u4e00-\u9fff]/.test(tapped.text)), JSON.stringify(tapped));
      ck(`${widthLabel} ${type} second tap target`, await realTouch(chrome,selector));
      await sleep(90);
      ck(`${widthLabel} ${type} tap tooltip closes`, !(await readTip(selector)).open);
    }
  }
  const longPressType=iconState.types.find(type=>type!=="hp")||iconState.types[0];
  if(widthLabel==="390px"&&longPressType){
    const selector=`[data-esmo-fps-player-card] span[data-cs-icon-type="${longPressType}"]`;
    ck(`${widthLabel} ${longPressType} long-press target`, await realTouch(chrome,selector,560));
    await sleep(100);
    const longPressed=await readTip(selector);
    ck(`${widthLabel} ${longPressType} long-press tooltip`, Boolean(longPressed.open&&longPressed.text.includes(expected[longPressType])), JSON.stringify(longPressed));
    ck(`${widthLabel} ${longPressType} long-press close`, await realTouch(chrome,selector));
    await sleep(90);
    ck(`${widthLabel} ${longPressType} long-press tooltip closes`, !(await readTip(selector)).open);
  }
}

async function testAudio(chrome, widthLabel, ck) {
  await sleep(350);
  const before = await readAudio(chrome);
  ck(`${widthLabel} audio preload starts before gesture`, Boolean(before&&Number(before.preloadStarts)>=1&&Number(before.preloadStartedAt)>0), before?JSON.stringify({preloadStarts:before.preloadStarts,preloadStartedAt:before.preloadStartedAt,preloadReadyAt:before.preloadReadyAt}):"diagnostics missing");
  await chrome.evaluate(`return (()=>{const node=document.querySelector('[data-testid="cs-audio-toggle"]');node?.scrollIntoView({block:"center",inline:"center"});return Boolean(node);})()`);
  await sleep(80);
  const clicked = await realClick(chrome, '[data-testid="cs-audio-toggle"]');
  ck(`${widthLabel} audio toggle receives real gesture`, clicked);
  let audioOn = false;
  const audioDeadline = Date.now() + 5_000;
  while (Date.now() < audioDeadline) {
    audioOn = Boolean(await chrome.evaluate(`return document.querySelector('[data-testid="cs-audio-toggle"]')?.dataset.csAudioState==='on'`).catch(() => false));
    if (audioOn) break;
    await sleep(120);
  }
  const after = await readAudio(chrome);
  const latency = Number(after?.resumeResolvedAt)-Number(after?.unmuteRequestedAt);
  ck(`${widthLabel} audio context running immediately after unmute`, Boolean(audioOn&&after&&after.contextState==="running"&&after.unmuteRequestedAt&&after.resumeResolvedAt), after?JSON.stringify({uiState:audioOn?"on":"off",state:after.contextState,request:after.unmuteRequestedAt,resolved:after.resumeResolvedAt,resumeCalls:after.resumeCalls}):"diagnostics missing");
  ck(`${widthLabel} audio resume latency <= 1500ms`, Number.isFinite(latency)&&latency>=0&&latency<=1500, `latencyMs=${latency}`);
  ck(`${widthLabel} unmute does not start preload`, Boolean(after&&Number(after.preloadStartedAt)<=Number(after.unmuteRequestedAt)&&Number(after.preloadStarts)===Number(before?.preloadStarts||0)), after?JSON.stringify({preloadStarts:after.preloadStarts,preloadStartedAt:after.preloadStartedAt,unmuteRequestedAt:after.unmuteRequestedAt}):"diagnostics missing");
}

async function testCameraAndFocus(chrome, mapKey, widthLabel, ck) {
  const cardIds = await chrome.evaluate(`return [...document.querySelectorAll('[data-esmo-fps-player-card]')].map(node=>node.getAttribute('data-esmo-fps-player-card')).filter(Boolean)`);
  ck(`${MAPS[mapKey]} ${widthLabel} 5v5 player cards`, cardIds.length===10, `cards=${cardIds.length}`);
  const firstId = cardIds[0], secondId = cardIds[1];
  ck(`${MAPS[mapKey]} ${widthLabel} player card selectable`, Boolean(firstId&&await domClick(chrome, `[data-esmo-fps-player-card="${firstId}"]`)));
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.selected===${JSON.stringify(firstId)}&&window.__ESMO_FPS_SCENE__?.liveRef?.current?.cameraMode==='tactical'&&window.__ESMO_FPS_SCENE__?._chaseId===${JSON.stringify(firstId)}`, 5_000, `${mapKey} spectator focus`);
  await sleep(180);
  const spectator = await readScene(chrome, firstId);
  ck(`${MAPS[mapKey]} ${widthLabel} card click stays spectator focus`, Boolean(spectator.cameraMode==="tactical"&&spectator.chaseId===firstId&&spectator.cam?.radius>8&&spectator.povWeapon?.visible!==true), JSON.stringify({mode:spectator.cameraMode,chaseId:spectator.chaseId,radius:spectator.cam?.radius,povWeapon:spectator.povWeapon}));
  ck(`${MAPS[mapKey]} ${widthLabel} spectator focus keeps self mesh visible`, spectator.player?.povSelfHidden===false, JSON.stringify(spectator.player));

  if(widthLabel==="390px"){
    const radiusBefore = Number(spectator.cam?.radius);
    await realPinch(chrome, 1.65);
    await sleep(180);
    let spectatorPinch = await readScene(chrome, firstId);
    const pinchPass = (scene) => Boolean(scene.cam?.autoFollow===false&&scene.cam?.viewPreset===null&&Math.abs(Number(scene.cam?.radius)-radiusBefore)>0.05);
    let pinchAttempts = 1;
    while (!pinchPass(spectatorPinch) && pinchAttempts < 3) {
      await realPinch(chrome, 1.65);
      await sleep(180);
      spectatorPinch = await readScene(chrome, firstId);
      pinchAttempts += 1;
    }
    ck(`${MAPS[mapKey]} ${widthLabel} player focus pinch zoom`, pinchPass(spectatorPinch), JSON.stringify({before:radiusBefore,after:spectatorPinch.cam?.radius,autoFollow:spectatorPinch.cam?.autoFollow,attempts:pinchAttempts}));
  }

  ck(`${MAPS[mapKey]} ${widthLabel} explicit Player POV control`, await domClick(chrome, '[data-testid="cs-camera-preset-pov"]'));
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.cameraMode==='pov'&&window.__ESMO_FPS_SCENE__?._chaseId===${JSON.stringify(firstId)}`, 5_000, `${mapKey} POV`);
  await sleep(180);
  const pov = await readScene(chrome, firstId);
  ck(`${MAPS[mapKey]} ${widthLabel} real FPS eye POV`, Boolean(pov.cameraMode==="pov"&&pov.chaseId===firstId&&pov.camera?.fov>=36&&pov.player?.povSelfHidden===true), JSON.stringify({mode:pov.cameraMode,chaseId:pov.chaseId,fov:pov.camera?.fov,player:pov.player}));
  ck(`${MAPS[mapKey]} ${widthLabel} POV weapon presentation`, Boolean(pov.povWeapon?.visible===true&&pov.povWeapon?.weaponParts>=10&&pov.povWeapon?.gun&&pov.povWeapon?.family&&pov.povWeaponGroupVisible), JSON.stringify(pov.povWeapon));
  const reticle = await chrome.evaluate(`return (()=>{const node=document.querySelector('[data-testid="cs-pov-reticle"]');return {visible:Boolean(node),shotState:node?.dataset.csPovShotState||null,box:node?(()=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})():null};})()`);
  ck(`${MAPS[mapKey]} ${widthLabel} POV reticle stays in viewport`, Boolean(reticle.visible&&reticle.box?.width>0&&reticle.box?.height>0&&reticle.box.left>=0&&reticle.box.top>=0&&reticle.box.left+reticle.box.width<=await chrome.evaluate(`return innerWidth`)+1&&reticle.box.top+reticle.box.height<=await chrome.evaluate(`return innerHeight`)+1), JSON.stringify(reticle));
  const shotFrame = await chrome.evaluate(`return (()=>{const id=${JSON.stringify(firstId)},frames=window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames||[];return frames.findIndex(frame=>frame.muzzles?.some(muzzle=>muzzle.attackerId===id)&&frame.players?.some(player=>player.id===id&&!player.dead));})()`);
  if(shotFrame>=0){
    await seekFrame(chrome,shotFrame);
    const shotReticle=await chrome.evaluate(`return (()=>{const node=document.querySelector('[data-testid="cs-pov-reticle"]');const feedback=node?.querySelector('[data-testid="cs-pov-shot-feedback"]');return {reticleState:node?.dataset.csPovShotState||null,feedback:Boolean(feedback),weaponFireCount:Number(window.__ESMO_FPS_SCENE__?.povWeaponDiagnostics?.fireCount||0)};})()`);
    ck(`${MAPS[mapKey]} ${widthLabel} POV authoritative shot feedback`, Boolean(shotReticle.reticleState==="active"&&shotReticle.feedback&&shotReticle.weaponFireCount>0), JSON.stringify({shotFrame,shotReticle}));
    await seekFrame(chrome,0);
  }else ck(`${MAPS[mapKey]} ${widthLabel} POV authoritative shot feedback`, false, "no alive shooter frame found");

  ck(`${MAPS[mapKey]} ${widthLabel} switch selected player while POV`, await domClick(chrome, `[data-esmo-fps-player-card="${secondId}"]`));
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.cameraMode==='pov'&&window.__ESMO_FPS_SCENE__?._chaseId===${JSON.stringify(secondId)}`, 5_000, `${mapKey} second POV`);
  await sleep(120);
  const secondPov = await readScene(chrome, secondId);
  ck(`${MAPS[mapKey]} ${widthLabel} POV follows selected player`, Boolean(secondPov.cameraMode==="pov"&&secondPov.chaseId===secondId&&secondPov.player?.povSelfHidden===true), JSON.stringify({mode:secondPov.cameraMode,chaseId:secondPov.chaseId,player:secondPov.player}));

  ck(`${MAPS[mapKey]} ${widthLabel} exit POV returns spectator focus`, await domClick(chrome, '[data-testid="cs-exit-pov"]'));
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.cameraMode==='tactical'&&window.__ESMO_FPS_SCENE__?.liveRef?.current?.selected===${JSON.stringify(secondId)}`, 5_000, `${mapKey} exit POV`);
  await sleep(180);
  const exited = await readScene(chrome, secondId);
  ck(`${MAPS[mapKey]} ${widthLabel} exit POV restores spectator body`, Boolean(exited.cameraMode==="tactical"&&exited.selected===secondId&&exited.player?.povSelfHidden===false&&exited.povWeapon?.visible!==true), JSON.stringify({mode:exited.cameraMode,selected:exited.selected,player:exited.player,povWeapon:exited.povWeapon}));
}

async function testAutoDirector(chrome, mapKey, widthLabel, ck) {
  ck(`${MAPS[mapKey]} ${widthLabel} auto director reset`, await domClick(chrome, '[data-testid="cs-camera-auto-director"]'));
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.liveRef?.current?.selected===null&&window.__ESMO_FPS_SCENE__?.cam?.autoFollow===true`, 5_000, `${mapKey} auto director`);
  await sleep(240);
  const initial = await readScene(chrome);
  ck(`${MAPS[mapKey]} ${widthLabel} hotspot target has combat/objective authority`, Boolean(initial.cam?.directorTarget&&initial.cam.directorTarget.source&&initial.cam.directorTarget.source!=="map-center"&&Number.isFinite(Number(initial.cam.directorTarget.position?.x))), JSON.stringify(initial.cam?.directorTarget));

  const presetSamples = {};
  for (const preset of ["high", "overview", "tactical"]) {
    ck(`${MAPS[mapKey]} ${widthLabel} ${preset} preset click`, await domClick(chrome, `[data-testid="cs-camera-preset-${preset}"]`));
    await sleep(150);
    const mid = await readScene(chrome);
    await sleep(1_050);
    const end = await readScene(chrome);
    presetSamples[preset] = { mid, end };
    ck(`${MAPS[mapKey]} ${widthLabel} ${preset} smooth transition`, Boolean(mid.cam?.viewPreset===preset&&mid.cam?.transition&&Number(mid.cam.transition.elapsedMs)<Number(mid.cam.transition.durationMs)), JSON.stringify(mid.cam?.transition));
    ck(`${MAPS[mapKey]} ${widthLabel} ${preset} completes on hotspot`, Boolean(end.cam?.viewPreset===preset&&!end.cam?.transition&&end.cam?.directorTarget?.source), JSON.stringify({preset:end.cam?.viewPreset,target:end.cam?.directorTarget}));
  }

  const pair = await readHotspotPair(chrome);
  let followDelta = 0;
  if (pair.second>pair.first) {
    await seekFrame(chrome, pair.first);
    const first = await readScene(chrome);
    await seekFrame(chrome, pair.second);
    const second = await readScene(chrome);
    const a=first.cam?.directorTarget?.position,b=second.cam?.directorTarget?.position;
    if(a&&b)followDelta=Math.hypot(Number(a.x)-Number(b.x),Number(a.y)-Number(b.y));
    console.log(`INFO ${MAPS[mapKey]} ${widthLabel} hotspot-follow=${JSON.stringify({pair,first:a,second:b,delta:followDelta})}`);
  }
  ck(`${MAPS[mapKey]} ${widthLabel} director target follows combat hotspot`, Boolean(pair.distance>1&&followDelta>0.5), JSON.stringify({pairDistance:pair.distance,followDelta}));

  await realDrag(chrome, "canvas", 90, 8);
  await sleep(180);
  const manual = await readScene(chrome);
  ck(`${MAPS[mapKey]} ${widthLabel} manual camera override pauses director`, Boolean(manual.cam?.autoFollow===false&&manual.cam?.viewPreset===null), JSON.stringify({autoFollow:manual.cam?.autoFollow,viewPreset:manual.cam?.viewPreset}));
  ck(`${MAPS[mapKey]} ${widthLabel} auto director restores after manual override`, await domClick(chrome, '[data-testid="cs-camera-auto-director"]'));
  await waitFor(chrome, `window.__ESMO_FPS_SCENE__?.cam?.autoFollow===true&&window.__ESMO_FPS_SCENE__?.cam?.viewPreset===null`, 5_000, `${mapKey} director restore`);
  return presetSamples;
}

async function testRegressionAudits(chrome, mapKey, widthLabel, ck) {
  const audits = await chrome.evaluate(`return (()=>{const sim=window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim||{};const markers=window.__ESMO_FPS_SCENE__?.visibilitySnapshot?.markers||null;return {combat:sim.combatAudit||null,movement:sim.movementAudit||null,navigation:sim.navigationAudit||null,markers,frames:sim.frames?.length||0};})()`);
  const navigationSummary=audits.navigation?{solidObstacleCount:audits.navigation.solidObstacleCount,routeAssignments:audits.navigation.routeAssignments,waypointTransitions:audits.navigation.waypointTransitions,routeDeadlocks:audits.navigation.routeDeadlocks,illegalWallCrossings:audits.navigation.illegalWallCrossings,replanCount:audits.navigation.replanCount,stuckDetections:audits.navigation.stuckDetections,stuckResolved:audits.navigation.stuckResolved,unresolvedStuckEpisodes:audits.navigation.unresolvedStuckEpisodes}:null;
  ck(`${MAPS[mapKey]} ${widthLabel} production marker cleanup`, Boolean(audits.markers?.production&&Number(audits.markers.mapCalloutsVisible)===0&&Number(audits.markers.routeHelpersVisible)===0&&Number(audits.markers.selectedGroundHelpers)===0&&Number(audits.markers.selectionBeams)===0&&Number(audits.markers.aimHelpers)===0&&Number(audits.markers.objectiveSiteCount)===2), JSON.stringify(audits.markers));
  ck(`${MAPS[mapKey]} ${widthLabel} combat route interrupt retained`, Number(audits.combat?.routeInterruptFirstShots||0)>0&&Number(audits.combat?.routeInterruptPermissions||0)>0&&Number(audits.combat?.routeInterruptMovementStops||0)>0, JSON.stringify(audits.combat));
  ck(`${MAPS[mapKey]} ${widthLabel} locomotion audit clean`, Number(audits.movement?.nonFinitePositions||0)===0&&Number(audits.movement?.blockedPositions||0)===0&&Number(audits.movement?.teleportViolations||0)===0&&Number(audits.movement?.wallSegmentCrossings||0)===0, JSON.stringify(audits.movement));
  ck(`${MAPS[mapKey]} ${widthLabel} player separation audit clean`, Number(audits.movement?.playerSeparationCorrections||0)>0&&Number(audits.movement?.playerOverlapViolations||0)===0&&Number(audits.movement?.minPlayerSeparation||0)>=2.69, JSON.stringify({corrections:audits.movement?.playerSeparationCorrections,overlapSamples:audits.movement?.playerOverlapSamples,overlapViolations:audits.movement?.playerOverlapViolations,minDistance:audits.movement?.minPlayerSeparation,examples:audits.movement?.playerOverlapExamples||[]}));
  const obstacleKinds=Object.keys(audits.navigation?.obstacleCounts||{});
  ck(`${MAPS[mapKey]} ${widthLabel} building and cover blocking audit`, obstacleKinds.includes("building")&&obstacleKinds.some(kind=>["crate","barrel","sandbag","car"].includes(kind))&&Number(audits.movement?.blockedPositions||0)===0&&Number(audits.movement?.wallSegmentCrossings||0)===0, JSON.stringify({obstacleKinds,obstacleCounts:audits.navigation?.obstacleCounts,blockedPositions:audits.movement?.blockedPositions,wallSegmentCrossings:audits.movement?.wallSegmentCrossings}));
  ck(`${MAPS[mapKey]} ${widthLabel} navigation stuck audit clean`, Number(audits.navigation?.unresolvedStuckEpisodes||0)===0, JSON.stringify(navigationSummary));
  ck(`${MAPS[mapKey]} ${widthLabel} authoritative frame stream exists`, Number(audits.frames)>0, `frames=${audits.frames}`);
}

async function testMap(chrome, base, mapKey, seed, viewport, ck) {
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
  // Reset the compositor touch source at each navigation; otherwise a prior
  // multi-touch sequence can remain active across Page.navigate and swallow
  // the next map's first touch sequence.
  await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 5 });
  await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: viewport.mobile, maxTouchPoints: 5 });
  const url = `${base}?c5c=battle&map=${mapKey}&seed=${seed}`;
  await chrome.navigate(url);
  await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')&&document.querySelector('[data-testid="cs-c5c-presentation-hud"]')&&document.querySelector('canvas')`, 90_000, `${mapKey} ${viewport.label} mount`);
  await pauseBattle(chrome);
  const widthLabel = viewport.label;
  const text = await chrome.evaluate(`return document.body.innerText||""`);
  ck(`${MAPS[mapKey]} ${widthLabel} HUD contains no engineering copy`, !/(?:Three\.js|WebGL|simulation|snapshot|render|engine)/i.test(text));
  ck(`${MAPS[mapKey]} ${widthLabel} tactical preset controls`, await chrome.evaluate(`return document.querySelectorAll('[data-testid^="cs-camera-preset-"]:not([data-testid="cs-camera-preset-pov"])').length===3;`));
  ck(`${MAPS[mapKey]} ${widthLabel} player controls`, await chrome.evaluate(`return Boolean(document.querySelector('[data-testid="cs-player-controls"]'));`));
  ck(`${MAPS[mapKey]} ${widthLabel} route helper hidden`, await chrome.evaluate(`return ![...document.querySelectorAll("button")].some(node=>node.textContent.includes("路線"));`));
  ck(`${MAPS[mapKey]} ${widthLabel} no horizontal overflow`, await chrome.evaluate(`return document.documentElement.scrollWidth<=document.documentElement.clientWidth&&document.body.scrollWidth<=document.body.clientWidth;`));
  const layout=await chrome.evaluate(`return (()=>{const selectors=['[data-testid="cs-playback-controls"]','[data-testid="cs-camera-presets"]','[data-esmo-fps-team-roster]','[data-testid="cs-player-controls"]','[data-esmo-fps-player-card]'];const nodes=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]);const bad=nodes.map(node=>{const r=node.getBoundingClientRect();return {selector:node.matches('[data-esmo-fps-player-card]')?'player-card':node.dataset.testid||node.dataset.esmoFpsTeamRoster||'control',left:r.left,right:r.right,width:r.width};}).filter(item=>item.width<=0||item.left<-0.5||item.right>innerWidth+0.5);return {viewport:innerWidth,scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),bad};})()`);
  ck(`${MAPS[mapKey]} ${widthLabel} controls and player cards stay within viewport`, layout.bad.length===0, JSON.stringify(layout));

  await testCameraAndFocus(chrome, mapKey, widthLabel, ck);
  await testAutoDirector(chrome, mapKey, widthLabel, ck);
  await testIcons(chrome, widthLabel, ck);
  await testAudio(chrome, widthLabel, ck);
  await testRegressionAudits(chrome, mapKey, widthLabel, ck);
  return { mapKey, viewport: widthLabel, frameCount: await chrome.evaluate(`return window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.frames?.length||0`) };
}

const result = await runGate({
  name: "CS Android Owner Review V3 (Desktop + 390px)",
  base: "/ESMO-/",
  timeoutMs: 1_200_000,
  run: async ({ chrome, url, ck }) => {
    const maps = [];
    for (const viewport of TARGET_WIDTHS) {
      for (const [index, mapKey] of TARGET_MAPS.map((key, i) => [i, key])) {
        maps.push(await testMap(chrome, url, mapKey, SEED_BASE + index * 17, viewport, ck));
      }
    }
    ck("browser console errors = 0", chrome.consoleLines.filter((line) => line.startsWith("[error]")).length===0, JSON.stringify(chrome.consoleLines.filter((line) => line.startsWith("[error]"))));
    ck("browser page errors = 0", chrome.pageErrors.length===0, JSON.stringify(chrome.pageErrors));
    console.log(`INFO OWNER_REVIEW_V3 ${JSON.stringify({maps})}`);
  },
});

await finishGate(result);
