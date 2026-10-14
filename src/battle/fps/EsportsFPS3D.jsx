import { createFpsFloorSampler } from "./presentation/fpsFloorSampler.js";
// ============================================================================
//  EsportsFPS3D.jsx — 3D CS 對戰引擎（自 EsportsGame.jsx 原封抽離，Phase 4）
//  ⚠ 引擎主體 = 原內聯 __FPS3D_MODULE，逐位元組未改；IIFE 保留（改動最小化）。
//  介面不變：props in（見 BattleConfig / toEngineProps）→ onComplete(result) out。
// ============================================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";
import MatchSpeedControls from "../ui/MatchSpeedControls.jsx";
import FpsTeamRadio from "./FpsTeamRadio.jsx";
import { checkFpsRendererIdentity } from "./fpsIdentity.js";
import { FPS_ROLE_ZH } from "./fpsRoster.js";
import { checkFpsRuntimeVisibility, evaluateFpsCameraRecovery, isFpsBodyScreenReadable, resolveFpsPresentationVisibility, summarizeFpsTeamVisibility } from "./fpsVisibilityDiagnostics.js";
import { createFpsCharacterRenderer } from "./presentation/FpsCharacterRenderer.js";
import { setFpsBoundsFromUpdatedObject } from "./presentation/fpsBoundsSampler.js";
import { getRiggedCharacterLimit } from "./presentation/fpsCharacterAssets.js";
import { createMajorMapEnvironment } from "./presentation/fpsMajorMapEnvironment.js";
import { createFpsMajorRoofShaderWarmup } from "./presentation/fpsMajorShaderWarmup.js";
import { fpsMajorElevation } from "./fpsMajorTerrain.js";
import { createFpsWeaponHandling, advanceFpsWeaponHandling, consumeFpsWeaponShot, fpsWeaponReadyAtMs, resolveFpsWeaponStance } from "./fpsWeaponHandling.js";
import { fpsFlashDurationSec, fpsDecayBlind, chooseFpsUtilityThrow, advanceFpsDefuse } from "./fpsMajorUtilityRules.js";
import { collectFpsTeamIntel, decideFpsTacticalIntent, selectFpsCrossfireAnchor, getFpsRoundOutcomeMetrics, fpsTacticalPlanningTarget } from "./fpsTacticalCoordinator.js";
import { createCsReplay, readCsReplay } from "./fpsReplay.js";
import { groupFpsTeams, getFpsFrameMessages, fmtFpsMoney } from "./fpsMatchUi.js";
import { downloadCsReplay, loadCsReplayFile } from "./fpsReplayFiles.js";
import FpsSavedFrameHud from "./FpsSavedFrameHud.jsx";
import { planFpsBombRoute, chooseFpsContextUtility, fpsAssignTacticalDuties, fpsAttackStage, planFpsUtilityLoadout } from "./fpsBombObjectivePlanning.js";
import {createFpsDirectedShotQueue} from './fpsDirectedShotQueue.js';
import {fpsAwarenessLook,planFpsCoverPeek} from './fpsAwarenessSteering.js';
import { FPS_MAJOR_MAP_ART } from "./fpsMapIdentity.js";
import { useIsMobile } from "../../ui/useViewport.js";
import { GC } from "../../ui/theme.js";
import { FPS_LEGACY_MAPS } from "./fpsLegacyMapData.js";
import { FPS_MAJOR_AUTHORED_ROOMS, majorRoomWalls } from "./fpsMajorArchitecture.js";
import { createFpsMajorSegmentCache } from "./fpsMajorNavigationCache.js";
import { fitFpsCombatCamera, fpsChaseMinimumRadius, fpsChaseForwardOffset } from "./fpsCameraFraming.js";
import { createGunplayPresentation } from "./presentation/fpsGunplayPresentation.js";
import { createUtilityPresentation } from "./presentation/fpsUtilityPresentation.js";
import { createFpsMatchPresentation } from "./presentation/fpsMatchPresentation.js";
import { createFpsAudioVoicePool } from "./presentation/fpsAudioVoicePool.js";
import { createFpsAudioPlaybackGate, resolveFpsAudioSpatial } from "./presentation/fpsAudioPlayback.js";
import { createFpsAmbientAudio } from "./presentation/fpsAmbientAudio.js";
import { createMajorFpsPovWeapon } from "./presentation/fpsPovWeapon.js";
import { csLoadMark, csLoadSpan, csLoadTime, csSimCacheEvent } from "./csLoadTiming.js";

// EsportsFPS3D 已內聯於本檔（見下方 __FPS3D_MODULE），以符合單一檔案 artifact 限制
/* ═══════════════════════════════════════════════════════════════
   EsportsFPS3D（3D CS 對戰引擎）— 內聯模組，封裝於 IIFE 以隔離作用域
   （避免與主遊戲的 PERSONALITY / MAPS / C 等同名衝突），只對外暴露
   EsportsFPS3D 元件與 buildMatchResult。
   ═══════════════════════════════════════════════════════════════ */
// hotfix/cs-resume-worker：讓 Web Worker 拿到**同一個** simulateFps（不另建第二套模擬）。
//   runner 由主執行緒端的 fpsSimClient.js 註冊；Worker 端只讀 simulateFps。
//   ⚠ 刻意不改下方 IIFE 的 return／export 兩行（多支 gate 以它們為字串 marker 做 transform）。
const __FPS3D_SIM_PORT = { simulateFps: null, runner: null };
const __FPS3D_MODULE = (function(){

/* ═══════════════════════════════════════════════════════════════════════
   CS 戰術轉播 · 3D WebGL 引擎版
   ──────────────────────────────────────────────────────────────────────
   • 同一套模擬引擎（simulateFps）產出逐格資料：選手座標 / 視角 / 血量 /
     擊殺 / 彈道 / 煙霧 / 燃燒彈 / 投擲物 / C4 / 比分 — 全部與畫面對接。
   • 渲染層改用 Three.js：打光 + 陰影的立體建築、低面數 3D 選手（依視角
     轉向）、發光曳光彈、體積煙、火焰、會自動追焦的運鏡相機。
   • 可直接替換既有遊戲的 FpsModule 渲染層（資料結構完全相同）。
   ═══════════════════════════════════════════════════════════════════════ */

// ─── 數學/工具 ───────────────────────────────────────────────────────────
const lerp=(a,b,t)=>a+(b-a)*t;
const vl=(a,b,t)=>({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=t=>t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const mkRng=s=>{let x=s|0;return()=>{x=(x*1664525+1013904223)&0xffffffff;return(x>>>0)/0xffffffff;};};
// C3 第二輪的全場視角：只改相機目標，不改模擬座標、碰撞或玩家身份。
const FPS_CAMERA_PRESETS=Object.freeze({
  high:{label:"高位上帝視角",radius:132,phi:0.39,theta:-0.76,target:[0,2.8,0]},
  overview:{label:"中高位全場總覽",radius:116,phi:0.60,theta:-0.72,target:[0,2.8,0]},
  tactical:{label:"側上方戰術總覽",radius:104,phi:0.82,theta:-1.03,target:[-4,2.6,2]},
});
const FPS_CAMERA_PRESET_TRANSITION_MS=900;
// Debug overlays are opt-in even on the Vite dev server so the owner preview
// stays player-facing. Append ?fpsDebug=1 when inspecting navigation helpers.
const FPS_DEBUG_ENABLED=Boolean(import.meta.env?.DEV&&typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("fpsDebug")==="1");
function setFpsCameraPreset(st,name){
  const preset=FPS_CAMERA_PRESETS[name];const cam=st?.cam;
  if(!preset||!cam)return false;
  st._cameraPresetIntent=name;
  const from={theta:cam.theta,phi:cam.phi,radius:cam.radius,tgt:cam.tgt.clone()};
  // A preset defines camera style only. The target is supplied by the
  // authoritative combat/presentation hotspot and may already be moving.
  const target=cam._directorTarget?.clone?.()||cam.dTgt.clone();
  const to={theta:preset.theta,phi:preset.phi,radius:preset.radius,tgt:target};
  cam.viewPreset=name;cam.autoFollow=true;cam.overview=true;cam._ovBase=null;cam.chaseYaw=0;cam.chasePitch=0;
  cam.dTheta=to.theta;cam.dPhi=to.phi;cam.manualRadius=null;cam.dRadius=to.radius;cam.dTgt.copy(to.tgt);
  cam.presetTransition={from,to,elapsedMs:0,durationMs:FPS_CAMERA_PRESET_TRANSITION_MS};
  return true;
}

function finiteFpsPoint(point){return Boolean(point)&&Number.isFinite(Number(point.x))&&Number.isFinite(Number(point.y));}

// Camera target authority is presentation-only: event positions, authoritative
// muzzle/player states, and the objective facts already present in a frame.
// It never chooses a winner, damage result, or combat target.
function resolveFpsCombatHotspot(frame,director){
  const frameTime=Number(frame?.ts??frame?.roundSec??0);
  if(finiteFpsPoint(director?.position)&&Number(director.expiresAt)>frameTime){
    return {x:Number(director.position.x),y:Number(director.position.y),kind:director.kind||"director-event",score:Number(director.score)||140,key:`director:${director.kind||"event"}`,source:"fps-match-presentation-director"};
  }
  const alive=(frame?.players||[]).filter(player=>player&&!player.dead&&finiteFpsPoint(player.pos));
  if(!alive.length)return null;
  const candidates=[];
  const muzzles=(frame?.muzzles||[]).filter(event=>finiteFpsPoint(event?.pos));
  if(muzzles.length){
    const position=muzzles.reduce((sum,event)=>({x:sum.x+Number(event.pos.x),y:sum.y+Number(event.pos.y)}),{x:0,y:0});
    position.x/=muzzles.length;position.y/=muzzles.length;
    candidates.push({x:position.x,y:position.y,kind:"combat-fire",score:132,key:`fire:${muzzles.map(event=>event.eventId||event.id||"").sort().join(",")}`,source:"frame.muzzles"});
  }
  for(const actor of alive){
    for(const target of alive){
      if(actor.side===target.side)continue;
      const distance=dist(actor.pos,target.pos);
      if(distance>46)continue;
      const active=actor.state==="ENGAGE"||target.state==="ENGAGE"||actor.state==="架槍"||target.state==="架槍";
      if(!active)continue;
      const stateWeight=actor.state==="ENGAGE"||target.state==="ENGAGE"?30:12;
      candidates.push({x:(Number(actor.pos.x)+Number(target.pos.x))/2,y:(Number(actor.pos.y)+Number(target.pos.y))/2,kind:"combat-duel",score:118-distance+stateWeight,key:`duel:${[actor.id,target.id].sort().join(":")}`,source:"frame.player-combat-state"});
    }
  }
  if(frame.planted&&finiteFpsPoint(frame.c4pos))candidates.push({x:Number(frame.c4pos.x),y:Number(frame.c4pos.y),kind:"objective-bomb",score:150,key:"objective:c4",source:"frame.planted-c4"});
  const carrier=alive.find(player=>player.hasBomb);
  if(carrier)candidates.push({x:Number(carrier.pos.x),y:Number(carrier.pos.y),kind:"objective-carrier",score:112,key:`carrier:${carrier.id}`,source:"frame.player-hasBomb"});
  if(!candidates.length){
    const center=alive.reduce((sum,player)=>({x:sum.x+Number(player.pos.x),y:sum.y+Number(player.pos.y)}),{x:0,y:0});
    candidates.push({x:center.x/alive.length,y:center.y/alive.length,kind:"combat-centroid",score:8,key:"alive-centroid",source:"frame.alive-players"});
  }
  candidates.sort((a,b)=>b.score-a.score||String(a.key).localeCompare(String(b.key)));
  return candidates[0];
}

function updateFpsCombatHotspot(cam,candidate,dt,frameTime){
  if(!candidate)return cam?._directorHotspot||null;
  const previous=cam._directorHotspot;
  const sameKey=Boolean(previous&&previous.key===candidate.key);
  const missingFor=sameKey?0:Math.max(0,Number(frameTime)-Number(previous?.lastSeenAt??frameTime));
  const stale=Boolean(previous&&!sameKey&&missingFor>1.6);
  const keepPrevious=Boolean(previous&&!sameKey&&!stale&&Number(candidate.score)<Number(previous.score||0)+16);
  const chosen=keepPrevious?previous:candidate;
  const k=previous&&!stale?1-Math.pow(0.0008,Math.max(0,Number(dt)||0)):1;
  const next={...chosen,x:previous&&!stale?lerp(previous.x,chosen.x,k):chosen.x,y:previous&&!stale?lerp(previous.y,chosen.y,k):chosen.y,lastSeenAt:sameKey?Number(frameTime):previous?.lastSeenAt??Number(frameTime),lastCandidateAt:Number(frameTime)};
  cam._directorHotspot=next;
  return next;
}
const fmtT=s=>`${Math.floor(s/60).toString().padStart(2,"0")}:${(Math.floor(Math.max(0,s))%60).toString().padStart(2,"0")}`;
function getFpsP0Contract(){
  if(!import.meta.env?.DEV||typeof window==="undefined")return null;
  return window.__ESMO_FPS_P0_CONTRACT__||(window.__ESMO_FPS_P0_CONTRACT__={version:1,fidxTransitions:0,staleMismatch:0,rafFrames:0,duplicateRaf:0,duplicateRender:0,lastAuthoritativeFidx:null});
}
// 角度插值（取最短路徑，輸入/輸出皆為度）
function lerpAngle(a,b,t){let d=((b-a)%360+540)%360-180;return a+d*t;}
// 穩定雜湊（用於平滑的待機微動，避免亂數造成瞬移）
const hsh=s=>{s=String(s);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0);};
// 2D 線段是否被矩形阻擋（給相機遮擋判斷用；世界座標）
function segHitsRect(ax,az,bx,bz,r){
  const steps=14;for(let i=1;i<steps;i++){const t=i/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
    if(x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1)return true;}return false;
}
// ─── 程序生成對戰音效（Web Audio；掛載時 preload，手勢時 resume）─────────────
function makeAudio({pooled=false,mobile=false,getListener=()=>null}={}){
  const AC=typeof window!=="undefined"&&(window.AudioContext||window.webkitAudioContext);if(!AC)return null;
  const ctx=new AC();const master=ctx.createGain();master.gain.value=0.48;master.connect(ctx.destination);
  // Gunfire uses only one direct recorded CC0 sample per authoritative shot.
  // Procedural helpers remain exclusively for non-gunfire match-state cues.
  const nb=ctx.createBuffer(1,Math.floor(ctx.sampleRate*0.5),ctx.sampleRate),nd=nb.getChannelData(0);let noiseSeed=0x7f4a7c15;
  for(let i=0;i<nd.length;i++){noiseSeed=(Math.imul(noiseSeed,1664525)+1013904223)>>>0;nd[i]=(noiseSeed/0xffffffff)*2-1;}
  const C5A1_AUDIO_PROFILES=Object.freeze({
    pistol:{label:"手槍",sample:"pistol-prepared.wav",sourceRecording:"1911 .45 A_42P",offset:0.92,duration:1.45,gain:0.94},
    smg:{label:"衝鋒槍",sample:"smg-prepared.wav",sourceRecording:"Carl Gustav M45 G_31P",offset:0.288,duration:1.0,gain:0.72},
    rifle:{label:"步槍",sample:"rifle-prepared.wav",sourceRecording:"AK-47 C_28P",offset:0.589,duration:1.35,gain:0.92},
    sniper:{label:"狙擊槍",sample:"sniper-prepared.wav",sourceRecording:"Mosin Nagant M_21P",offset:1.01,duration:2.2,gain:1.0},
    shotgun:{label:"霰彈槍",sample:"shotgun-prepared.wav",sourceRecording:"Benelli Nova O_21P",offset:0.408,duration:1.8,gain:1.0},
  });
  // Utility presentation uses one clean CC0 recording per cue. These assets
  // stay separate from authoritative gunfire and never use synth fallback.
  const C5A2_UTILITY_AUDIO_PROFILES=Object.freeze({
    footstep:{sample:"utility-footstep.wav",source:"Spring Spring / OpenGameArt",gain:pooled?0.18:0.34,duration:0.72},
    "utility-throw":{sample:"utility-throw.wav",source:"Spring Spring / OpenGameArt",gain:0.46,duration:0.9},
    "utility-bounce":{sample:"utility-bounce.wav",source:"Spring Spring / OpenGameArt",gain:0.42,duration:0.9},
    "smoke-deploy":{sample:"utility-smoke.ogg",source:"0new4y / OpenGameArt",gain:0.4,duration:1.4},
    "flash-deploy":{sample:"utility-flash.wav",source:"teeeece / OpenGameArt",gain:0.46,duration:1.2},
    "he-deploy":{sample:"utility-he.wav",source:"Spring Spring / OpenGameArt",gain:0.56,duration:1.4},
    "bomb-exploded":{sample:"utility-he.wav",source:"Spring Spring / OpenGameArt",gain:0.62,duration:1.4},
    "bomb-planted":{sample:"utility-click.wav",source:"Spring Spring / OpenGameArt",gain:0.42,duration:0.9},
    "bomb-dropped":{sample:"utility-bounce.wav",source:"Spring Spring / OpenGameArt",gain:0.36,duration:0.9},
    "defuse-start":{sample:"utility-click.wav",source:"Spring Spring / OpenGameArt",gain:0.42,duration:0.9},
    "bomb-defused":{sample:"utility-click.wav",source:"Spring Spring / OpenGameArt",gain:0.42,duration:0.9},
    "bomb-tick":{sample:"utility-tick.wav",source:"Spring Spring / OpenGameArt",gain:0.3,duration:0.35},
  });
  const timers=new Set();let activeVoices=0,droppedVoices=0,disposed=false,voicePool=null,ambient=null;const firedEventIds=new Set(),cueEventIds=new Set();
  const audioBuffers=new Map(),presentationBuffers=new Map(),loadErrors={},presentationLoadErrors={};
  const audioBase=`${import.meta.env?.BASE_URL||"/"}audio/cs/c5a2/`;
  const audioDiag={version:pooled?4:3,assetSource:"CC0 real firearm recordings",assetLicense:"CC0-1.0",assetBase:audioBase,gunfireSourcePolicy:"one-recorded-buffer-per-shot",presentationAssetSource:"CC0 recorded utility samples from OpenGameArt",presentationAssetLicense:"CC0-1.0",presentationSourcePolicy:"one-recorded-buffer-per-cue with stereo spatialisation",presentationProfiles:C5A2_UTILITY_AUDIO_PROFILES,synthesizedToneStarts:0,
    profiles:Object.fromEntries(Object.entries(C5A1_AUDIO_PROFILES).map(([key,p])=>[key,{label:p.label,sample:p.sample,source:"recorded-prepared-direct",sourceRecording:p.sourceRecording,layers:["prepared-direct"],offset:p.offset,duration:p.duration}])),
    loadedProfiles:0,loadingProfiles:5,loadErrors:{},events:[],playbackEvents:[],recordedSourceStarts:0,recordedSourceStartsByFamily:{},playedFamilies:[],activeVoices:0,droppedVoices:0,missedAssets:0,dispatchCalls:0,duplicateDispatches:0,shotCalls:0,throttledShots:0,
    contextState:ctx.state,contextStateBeforeResume:null,resumeCalls:0,destination:ctx.destination?.constructor?.name||"AudioDestinationNode",masterGain:master.gain.value,loadedPresentationProfiles:0,loadingPresentationProfiles:Object.keys(C5A2_UTILITY_AUDIO_PROFILES).length,presentationLoadErrors:{},recordedPresentationSourceStarts:0,missedPresentationAssets:0};
  audioDiag.presentationCueCalls=0;audioDiag.presentationCueStarts=0;audioDiag.duplicateCueDispatches=0;audioDiag.cueTypes={};
  audioDiag.preloadStarts=0;audioDiag.preloadStartedAt=null;audioDiag.preloadReadyAt=null;audioDiag.unmuteRequestedAt=null;audioDiag.resumeResolvedAt=null;audioDiag.firstSourceStartAt=null;
  const publish=()=>{if(pooled&&disposed)return;audioDiag.activeVoices=activeVoices;audioDiag.droppedVoices=droppedVoices;audioDiag.contextState=ctx.state;audioDiag.destination=ctx.destination?.constructor?.name||"AudioDestinationNode";audioDiag.masterGain=master.gain.value;if(voicePool)audioDiag.voicePool=voicePool.diagnostics();if(typeof window!=="undefined")window.__ESMO_FPS_AUDIO_DIAGNOSTICS__=audioDiag;};
  if(pooled)voicePool=createFpsAudioVoicePool({context:ctx,destination:master,limit:mobile?32:64,onChange:data=>{activeVoices=data.active;droppedVoices=data.dropped;publish();}});
  if(pooled)ambient=createFpsAmbientAudio({context:ctx,destination:master,url:`${import.meta.env?.BASE_URL||"/"}audio/cs/major-v1/wind-loop.ogg`,onChange:data=>{audioDiag.ambient=data;publish();}});
  const spatial=(position,distance)=>pooled?resolveFpsAudioSpatial(position,getListener(),distance):{distance,pan:0};
  const remember=(set,id)=>{set.add(id);if(pooled&&set.size>4096)set.delete(set.values().next().value);};
  const schedule=(fn,delay)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},delay);timers.add(timer);return timer;};
  const voice=(duration,create)=>{if(activeVoices>=96){droppedVoices+=1;publish();return false;}activeVoices+=1;publish();create();schedule(()=>{activeVoices=Math.max(0,activeVoices-1);publish();},Math.ceil(duration*1000)+35);return true;};
  const now=()=>ctx.currentTime;
  const distanceGain=distance=>clamp(1/(1+Math.max(0,Number(distance)||0)/28),0.34,1);
  let preloadPromise=null;
  const preload=()=>{if(preloadPromise)return preloadPromise;
    audioDiag.preloadStarts+=1;audioDiag.preloadStartedAt=Date.now();publish();
    const load=async({key,profile,target,utility=false})=>{try{const endFetch=csLoadSpan("audio:fetch");const res=await fetch(`${audioBase}${profile.sample}`,{cache:"force-cache"});if(!res.ok)throw new Error(`HTTP ${res.status}`);const bytes=await res.arrayBuffer();endFetch({sample:profile.sample,bytes:bytes.byteLength});if(pooled&&disposed)return false;const endDecode=csLoadSpan("audio:decode");const buffer=await ctx.decodeAudioData(bytes.slice(0));endDecode({sample:profile.sample,bytes:bytes.byteLength});if(pooled&&disposed)return false;target.set(utility?profile.sample:key,buffer);if(utility)audioDiag.loadedPresentationProfiles=target.size;else audioDiag.loadedProfiles=target.size;publish();return true;}
      catch(error){if(utility){presentationLoadErrors[key]=String(error?.message||error);audioDiag.presentationLoadErrors={...presentationLoadErrors};}else{loadErrors[key]=String(error?.message||error);audioDiag.loadErrors={...loadErrors};}publish();return false;}};
    const gunLoads=Object.entries(C5A1_AUDIO_PROFILES).map(([key,profile])=>load({key,profile,target:audioBuffers}));
    const utilitySamples=[...new Map(Object.entries(C5A2_UTILITY_AUDIO_PROFILES).map(([key,profile])=>[profile.sample,{key,profile}])).values()];
    const utilityLoads=utilitySamples.map(({key,profile})=>load({key,profile,target:presentationBuffers,utility:true}));
    const endAudioAll=csLoadSpan("audio:preload-all");preloadPromise=Promise.all([...gunLoads,...utilityLoads]).then(results=>{endAudioAll({assets:results.length});audioDiag.preloadReadyAt=Date.now();publish();return results;});return preloadPromise;};
  function noise(dur,freq,q,gain,type,attenuation=1){voice(dur,()=>{const s=ctx.createBufferSource();s.buffer=nb;const f=ctx.createBiquadFilter();f.type=type||"lowpass";f.frequency.value=freq;f.Q.value=q||1;const g=ctx.createGain();const t=now();g.gain.setValueAtTime(gain*attenuation,t);g.gain.exponentialRampToValueAtTime(0.0008,t+dur);s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+dur);});}
  function normalizeFamily(family){const key=String(family||"").toLowerCase();return C5A1_AUDIO_PROFILES[key]?key:key==="狙擊"?"sniper":key==="衝鋒"?"smg":key==="手槍"?"pistol":"rifle";}
  function recordedOneShot(key,buffer,{delay,offset,duration,pitch,attenuation,gain,pan=0}){
    if(voicePool){const played=voicePool.playBuffer({buffer,delay,offset,duration,pitch,gain:gain*attenuation,pan,priority:3});if(!played)return false;
      if(audioDiag.firstSourceStartAt==null)audioDiag.firstSourceStartAt=Date.now();audioDiag.recordedSourceStarts+=1;audioDiag.recordedSourceStartsByFamily[key]=(audioDiag.recordedSourceStartsByFamily[key]||0)+1;if(!audioDiag.playedFamilies.includes(key))audioDiag.playedFamilies.push(key);
      audioDiag.playbackEvents.push({family:key,sample:C5A1_AUDIO_PROFILES[key]?.sample||null,layer:"prepared-direct",sourceNode:played.source.constructor?.name||"AudioBufferSourceNode",spatialNode:"StereoPannerNode",bufferDuration:Number(buffer.duration.toFixed(4)),offset:Number(offset.toFixed(4)),duration:Number(played.bufferDuration.toFixed(4)),playableDuration:Number(played.playableDuration.toFixed(4)),playbackRate:Number(pitch.toFixed(4)),attenuation:Number(attenuation.toFixed(3)),pan:Number(pan.toFixed(3)),contextState:ctx.state,atContextTime:Number(played.atContextTime.toFixed(4))});if(audioDiag.playbackEvents.length>48)audioDiag.playbackEvents.shift();publish();return true;}
    const playable=Math.min(duration,Math.max(0.001,buffer.duration-offset));if(playable<=0)return;
    voice(delay+playable,()=>{if(audioDiag.firstSourceStartAt==null)audioDiag.firstSourceStartAt=Date.now();const s=ctx.createBufferSource();s.buffer=buffer;s.playbackRate.value=pitch;const g=ctx.createGain();const t=now()+delay;g.gain.setValueAtTime(Math.max(0.0001,gain*attenuation),t);s.connect(g);g.connect(master);s.start(t,offset,playable);s.stop(t+playable);
      audioDiag.recordedSourceStarts+=1;audioDiag.recordedSourceStartsByFamily[key]=(audioDiag.recordedSourceStartsByFamily[key]||0)+1;if(!audioDiag.playedFamilies.includes(key))audioDiag.playedFamilies.push(key);audioDiag.playbackEvents.push({family:key,sample:C5A1_AUDIO_PROFILES[key]?.sample||null,layer:"prepared-direct",sourceNode:s.constructor?.name||"AudioBufferSourceNode",bufferDuration:Number(buffer.duration.toFixed(4)),offset:Number(offset.toFixed(4)),duration:Number(playable.toFixed(4)),playbackRate:Number(pitch.toFixed(4)),attenuation:Number(attenuation.toFixed(3)),contextState:ctx.state,destination:ctx.destination?.constructor?.name||"AudioDestinationNode",masterGain:master.gain.value,atContextTime:Number(t.toFixed(4))});if(audioDiag.playbackEvents.length>48)audioDiag.playbackEvents.shift();publish();});
  }
  function recordedCue(type,buffer,{distance,eventId,delay=0,gain=0.4,duration=0.8,position=null}){
    if(voicePool){const location=spatial(position,distance),attenuation=type==="footstep"?1/(1+Math.pow(Math.max(0,location.distance)/8,2)):distanceGain(location.distance),pitch=1+((hsh(eventId||type)%11)-5)*0.006;const played=voicePool.playBuffer({buffer,delay,duration,pitch,gain:gain*attenuation,pan:location.pan,fadeOut:true,priority:type==="footstep"?0:type==="bomb-exploded"?3:2});if(!played)return false;
      audioDiag.recordedPresentationSourceStarts+=1;audioDiag.playbackEvents.push({type,sample:C5A2_UTILITY_AUDIO_PROFILES[type]?.sample||null,layer:"recorded-single",sourceNode:played.source.constructor?.name||"AudioBufferSourceNode",spatialNode:"StereoPannerNode",playbackRate:Number(pitch.toFixed(4)),attenuation:Number(attenuation.toFixed(3)),pan:Number(location.pan.toFixed(3)),position:position?{x:position.x,y:position.y}:null,contextState:ctx.state,atContextTime:Number(played.atContextTime.toFixed(4))});if(audioDiag.playbackEvents.length>48)audioDiag.playbackEvents.shift();publish();return true;}
    const playable=Math.min(duration,Math.max(0.001,buffer.duration));if(playable<=0)return;
    const attenuation=distanceGain(distance),pitch=1+((hsh(eventId||type)%11)-5)*0.006,lateral=((hsh(`${eventId||type}:pan`)%101)/50)-1;
    voice(delay+playable,()=>{const s=ctx.createBufferSource();s.buffer=buffer;s.playbackRate.value=pitch;const g=ctx.createGain();const p=ctx.createStereoPanner();const t=now()+delay;g.gain.setValueAtTime(Math.max(0.0001,gain*attenuation),t);g.gain.exponentialRampToValueAtTime(0.0008,t+playable);p.pan.value=clamp(lateral*0.5,-0.5,0.5);s.connect(g);g.connect(p);p.connect(master);s.start(t,0,playable);s.stop(t+playable);
      audioDiag.recordedPresentationSourceStarts+=1;audioDiag.playbackEvents.push({type,sample:C5A2_UTILITY_AUDIO_PROFILES[type]?.sample||null,layer:"recorded-single",sourceNode:s.constructor?.name||"AudioBufferSourceNode",spatialNode:p.constructor?.name||"StereoPannerNode",playbackRate:Number(pitch.toFixed(4)),attenuation:Number(attenuation.toFixed(3)),pan:Number(p.pan.value.toFixed(3)),contextState:ctx.state,atContextTime:Number(t.toFixed(4))});if(audioDiag.playbackEvents.length>48)audioDiag.playbackEvents.shift();publish();});
  }
  function shot(family,kill=false,distance=20,eventId="",scheduleDelaySec=0,shotAtMs=null,position=null){if(pooled&&(disposed||ctx.state!=="running"))return;audioDiag.dispatchCalls+=1;if(eventId&&firedEventIds.has(eventId)){audioDiag.duplicateDispatches+=1;publish();return;}if(eventId)remember(firedEventIds,eventId);audioDiag.shotCalls+=1;const key=normalizeFamily(family),p=C5A1_AUDIO_PROFILES[key],buffer=audioBuffers.get(key);
    if(!buffer){audioDiag.missedAssets+=1;publish();return;}
    const location=spatial(position,distance),attenuation=distanceGain(location.distance),pitch=1+((hsh(eventId||key)%9)-4)*0.004,baseDelay=Math.max(0,Number(scheduleDelaySec)||0);
    recordedOneShot(key,buffer,{delay:baseDelay,offset:p.offset,duration:p.duration,pitch,attenuation,gain:p.gain,pan:location.pan});
    audioDiag.events.push({eventId,family:key,source:"recorded-prepared-direct",sourceRecording:p.sourceRecording,sample:p.sample,layers:["prepared-direct"],shotAtMs:Number.isFinite(Number(shotAtMs))?Number(shotAtMs):null,scheduledDelaySec:Number(baseDelay.toFixed(4)),distance:Number(Number(distance).toFixed(2)),attenuation:Number(attenuation.toFixed(3)),kill:Boolean(kill)});if(audioDiag.events.length>96)audioDiag.events.shift();publish();
  }
  function tone(freq,dur,gain,attenuation=1){if(voicePool){if(voicePool.playTone({frequency:freq,duration:dur,gain:gain*attenuation,priority:1}))audioDiag.synthesizedToneStarts+=1;publish();return;}voice(dur,()=>{const o=ctx.createOscillator();o.type="triangle";o.frequency.value=freq;const g=ctx.createGain();const t=now();g.gain.setValueAtTime(Math.max(0.0001,gain*attenuation),t);g.gain.exponentialRampToValueAtTime(0.0008,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur);audioDiag.synthesizedToneStarts+=1;publish();});}
  function presentationCue(type,{eventId="",distance=20,position=null,scheduleDelaySec=0}={}){if(pooled&&(disposed||ctx.state!=="running"))return;audioDiag.presentationCueCalls+=1;if(eventId&&cueEventIds.has(eventId)){audioDiag.duplicateCueDispatches+=1;publish();return;}if(eventId)remember(cueEventIds,eventId);audioDiag.presentationCueStarts+=1;audioDiag.cueTypes[type]=(audioDiag.cueTypes[type]||0)+1;const a=distanceGain(distance),profile=C5A2_UTILITY_AUDIO_PROFILES[type],buffer=profile&&presentationBuffers.get(profile.sample);
    if(profile){if(buffer)recordedCue(type,buffer,{distance,eventId,gain:profile.gain,duration:profile.duration,position,delay:pooled?Math.max(0,Number(scheduleDelaySec)||0):0});else{audioDiag.missedPresentationAssets+=1;publish();}}
    else if(type==="round-start"){tone(420,0.16,0.1,a);tone(620,0.22,0.08,a);}
    else if(type==="round-end"||type==="clutch"||type==="multikill"){tone(type==="clutch"?760:type==="multikill"?680:520,0.14,0.1,a);tone(type==="round-end"?320:980,0.18,0.07,a);}
    else if(type==="kill"){tone(180,0.045,0.035,a);}
    publish();}
  const api={ctx,async resume(){audioDiag.resumeCalls+=1;audioDiag.resumeRequestedAt=Date.now();audioDiag.contextStateBeforeResume=ctx.state;if(ctx.state!=="running")await ctx.resume();audioDiag.resumeResolvedAt=Date.now();publish();return ctx.state;},markUnmuteRequest(){audioDiag.unmuteRequestedAt=Date.now();publish();},preload,ready:preload(),assetProfiles:C5A1_AUDIO_PROFILES,setVol(v){master.gain.value=v;publish();},shot,shoot(sniper){shot(sniper?"sniper":"rifle");},cue:presentationCue,
    // 一個 authoritative muzzle event = 一個聲音事件；連發差異由實際 frame 事件頻率表現。
    burst(family,kill,distance,eventId,scheduleDelaySec,shotAtMs,position){shot(family,kill,distance,eventId,scheduleDelaySec,shotAtMs,position);},
    syncAmbient(state){ambient?.sync(state);},
    stopAll(){voicePool?.stopAll();ambient?.stop();},
    resetGunfireEvents(){firedEventIds.clear();if(voicePool){voicePool.stopAll();cueEventIds.clear();ambient?.stop();}},
    boom(){presentationCue("bomb-exploded",{distance:10});},
    dispose(){disposed=true;ambient?.dispose();voicePool?.dispose();timers.forEach((timer)=>clearTimeout(timer));timers.clear();if(pooled){audioBuffers.clear();presentationBuffers.clear();master.disconnect();}try{ctx.close();}catch{};if(typeof window!=="undefined"&&window.__ESMO_FPS_AUDIO_DIAGNOSTICS__===audioDiag){delete window.__ESMO_FPS_AUDIO_DIAGNOSTICS__;if(import.meta.env?.DEV)delete window.__ESMO_FPS_AUDIO_API__; }},
  };
  if(typeof window!=="undefined"&&import.meta.env?.DEV)window.__ESMO_FPS_AUDIO_API__=api;
  preload();publish();return api;
}

// ─── 碰撞 / 視線（半徑感知滑動 + 穿透回推，杜絕穿牆）─────────────────────
const PLAYER_R=1.35; // 選手碰撞半徑（地圖單位）
const PLAYER_MIN_SEPARATION=PLAYER_R*2; // 兩名存活選手的最小中心距離（等同兩個碰撞半徑）
const inWall=(p,walls)=>{for(const w of walls){if(p.x>=w.x-1&&p.x<=w.x+w.w+1&&p.y>=w.y-1&&p.y<=w.y+w.h+1)return w;}return null;};
function blocked(p,walls,R){for(const w of walls){if(p.x>w.x-R&&p.x<w.x+w.w+R&&p.y>w.y-R&&p.y<w.y+w.h+R)return true;}return false;}
// 穿透回推：把點推出所有重疊牆體（取最小穿透軸）
function collideResolve(p,walls,R){
  for(let it=0;it<4;it++){let hit=false;
    for(const w of walls){const minX=w.x-R,maxX=w.x+w.w+R,minY=w.y-R,maxY=w.y+w.h+R;
      if(p.x>minX&&p.x<maxX&&p.y>minY&&p.y<maxY){const dl=p.x-minX,dr=maxX-p.x,dt=p.y-minY,db=maxY-p.y;const m=Math.min(dl,dr,dt,db);
        if(m===dl)p.x=minX;else if(m===dr)p.x=maxX;else if(m===dt)p.y=minY;else p.y=maxY;hit=true;}}
    if(!hit)break;}
  p.x=clamp(p.x,1.5,98.5);p.y=clamp(p.y,1.5,98.5);return p;
}
// 角色碰撞是移動後的第二道幾何約束。它只處理存活角色，並以
// safeMove() 回寫，確保 separation 修正不會把角色推穿建築或 cover。
function separateFpsPlayers(players,walls,audit){
  (players||[]).forEach(player=>{if(player){player._preSeparationPos=null;player._separationMoved=false;}});
  const active=(players||[]).filter(player=>player&&!player.dead&&Number.isFinite(player.pos?.x)&&Number.isFinite(player.pos?.y));
  active.forEach(player=>{player._preSeparationPos={...player.pos};});
  let corrections=0;
  for(let pass=0;pass<64;pass++){
    let changed=false;
    for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
      const a=active[i],b=active[j];
      let dx=a.pos.x-b.pos.x,dy=a.pos.y-b.pos.y,d=Math.hypot(dx,dy);
      if(d>=PLAYER_MIN_SEPARATION)continue;
      const angle=d>0.0001?Math.atan2(dy,dx):(hsh(`${a.id}:${b.id}`)%360)*Math.PI/180;
      const push=(PLAYER_MIN_SEPARATION-Math.max(0,d))/2;
      const aTarget={x:a.pos.x+Math.cos(angle)*push,y:a.pos.y+Math.sin(angle)*push};
      const bTarget={x:b.pos.x-Math.cos(angle)*push,y:b.pos.y-Math.sin(angle)*push};
      const directA=safeMove(a.pos,aTarget,walls,PLAYER_R),directB=safeMove(b.pos,bTarget,walls,PLAYER_R);
      // 直線推開若貼到 cover 邊界，兩名角色可能仍卡在同一條窄通道。
      // 這裡同時評估整個小群組的 overlap penalty，避免解掉 A/B 後又
      // 把 A 推回 C；所有候選仍走 safeMove，不會繞過牆體或大步瞬移。
      const overlapPenalty=(pointA,pointB)=>{
        let penalty=0;
        for(let left=0;left<active.length;left++){
          const first=active[left],firstPos=first===a?pointA:first===b?pointB:first.pos;
          for(let right=left+1;right<active.length;right++){
            const second=active[right],secondPos=second===a?pointA:second===b?pointB:second.pos;
            const gap=PLAYER_MIN_SEPARATION-dist(firstPos,secondPos);
            if(gap>0)penalty+=gap*gap;
          }
        }
        return penalty;
      };
      let nextA=a.pos,nextB=b.pos,bestDistance=d,bestPenalty=overlapPenalty(a.pos,b.pos);
      const consider=(candidateA,candidateB)=>{
        const candidateDistance=dist(candidateA,candidateB),candidatePenalty=overlapPenalty(candidateA,candidateB);
        if(candidatePenalty<bestPenalty-0.000001||(candidatePenalty<=bestPenalty+0.000001&&candidateDistance>bestDistance+0.0001)){
          nextA=candidateA;nextB=candidateB;bestDistance=candidateDistance;bestPenalty=candidatePenalty;
        }
      };
      consider(directA,directB);
      if(bestDistance<PLAYER_MIN_SEPARATION-0.0001){
        const step=Math.min(1.6,Math.max(0.25,PLAYER_MIN_SEPARATION-d));
        for(let direction=0;direction<16;direction++){
          const candidateAngle=direction*Math.PI/8;
          const c=Math.cos(candidateAngle),s=Math.sin(candidateAngle);
          const candidateA=safeMove(a.pos,{x:a.pos.x+c*step,y:a.pos.y+s*step},walls,PLAYER_R);
          consider(candidateA,b.pos);
          const candidateB=safeMove(b.pos,{x:b.pos.x-c*step,y:b.pos.y-s*step},walls,PLAYER_R);
          consider(a.pos,candidateB);
        }
      }
      const aMoved=dist(a.pos,nextA),bMoved=dist(b.pos,nextB);
      if(aMoved>0.0001){a.pos=nextA;a._separationMoved=true;corrections+=1;changed=true;}
      if(bMoved>0.0001){b.pos=nextB;b._separationMoved=true;corrections+=1;changed=true;}
    }
    if(!changed)break;
  }
  let minDistance=Infinity,overlaps=0;const overlapExamples=[];
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
    const d=dist(active[i].pos,active[j].pos);minDistance=Math.min(minDistance,d);
    if(d<PLAYER_MIN_SEPARATION-0.01){overlaps+=1;if(overlapExamples.length<8)overlapExamples.push({a:active[i].id,b:active[j].id,distance:Number(d.toFixed(4)),aPos:{...active[i].pos},bPos:{...active[j].pos}});}
  }
  if(audit){
    audit.playerSeparationCorrections+=corrections;
    audit.playerOverlapViolations+=overlaps;
    if(overlaps>0)audit.playerOverlapSamples+=1;
    if(overlapExamples.length&&audit.playerOverlapExamples.length<8)audit.playerOverlapExamples.push(...overlapExamples.slice(0,8-audit.playerOverlapExamples.length));
    if(Number.isFinite(minDistance))audit.minPlayerSeparation=audit.minPlayerSeparation==null?minDistance:Math.min(audit.minPlayerSeparation,minDistance);
  }
}
// 逐軸滑動：撞牆時沿牆面滑行（而非穿入或卡死）
function slideMove(from,des,walls,R){
  let x=from.x,y=from.y;
  if(!blocked({x:des.x,y},walls,R))x=des.x;
  if(!blocked({x,y:des.y},walls,R))y=des.y;
  if(x===from.x&&y===from.y){if(!blocked({x:des.x,y:from.y},walls,R))x=des.x;else if(!blocked({x:from.x,y:des.y},walls,R))y=des.y;}
  return collideResolve({x,y},walls,R);
}
// 子步進移動：把一次大位移拆成 ≤1.2 單位的小步，避免高速穿牆
function safeMove(from,des,walls,R){
  const d=dist(from,des);const n=Math.max(1,Math.ceil(d/1.2));let cur={x:from.x,y:from.y};
  for(let i=1;i<=n;i++){const t=i/n;cur=slideMove(cur,{x:lerp(from.x,des.x,t),y:lerp(from.y,des.y,t)},walls,R);}
  return cur;
}
// 把點推到最近的可走位置（供節點/出生點落在牆內時校正）
function snapOut(pt,walls,R){const p={x:pt.x,y:pt.y};if(!blocked(p,walls,R))return p;
  for(let r=1;r<=20;r++){for(let a=0;a<16;a++){const ang=a*Math.PI/8;const c={x:pt.x+Math.cos(ang)*r,y:pt.y+Math.sin(ang)*r};if(!blocked(c,walls,R)&&c.x>2&&c.x<98&&c.y>2&&c.y<98)return c;}}
  return collideResolve(p,walls,R);
}
function lineBlocked(a,b,walls){
  const steps=Math.ceil(dist(a,b)/0.7);
  for(let i=1;i<steps;i++){const t=i/steps;const p={x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t)};for(const w of walls){if(p.x>=w.x&&p.x<=w.x+w.w&&p.y>=w.y&&p.y<=w.y+w.h)return true;}}
  return false;
}
// Route planning is authoritative movement input, not a visual overlay. The
// hand-authored tactic nodes remain the intent; this small visibility graph
// inserts deterministic clearance waypoints around buildings/cars when a
// node-to-node segment is blocked. Movement still goes through safeMove().
function navLineBlocked(a,b,walls){
  // CS Loading v2（沿用 TD-54 / 51aebee 的寫法）：謂詞不變——a→b 每 0.7 單位取樣，任一點落在任一牆內即為 true。
  // 只把牆移到外圈，用「取樣點的實際外框」一次排除碰不到的牆，而不是每個取樣點重測所有牆。
  // ⚠ 外框取自第 1 與第 steps-1 個取樣點（lerp 對 t 單調，端點樣本就是極值），不用 a／b 本身：
  //   用 a／b 的話，浮點誤差可能讓極端樣本落在外框外一個 ulp，排除就不再精確。
  // 這是 simulateFps 最熱的呼叫；CS 進場時整場比賽是在 main thread 上一次模擬完的。
  const steps=Math.ceil(dist(a,b)/0.7);if(steps<2)return false;
  const t1=1/steps,tn=(steps-1)/steps;
  const x1=lerp(a.x,b.x,t1),xn=lerp(a.x,b.x,tn),y1=lerp(a.y,b.y,t1),yn=lerp(a.y,b.y,tn);
  const minX=Math.min(x1,xn),maxX=Math.max(x1,xn),minY=Math.min(y1,yn),maxY=Math.max(y1,yn);
  for(let k=0;k<walls.length;k++){const w=walls[k];const wx2=w.x+w.w,wy2=w.y+w.h;
    if(w.x>maxX||wx2<minX||w.y>maxY||wy2<minY)continue;
    for(let i=1;i<steps;i++){const t=i/steps;const px=lerp(a.x,b.x,t);if(px<w.x||px>wx2)continue;const py=lerp(a.y,b.y,t);if(py>=w.y&&py<=wy2)return true;}}
  return false;
}
function plannerSafePoint(point,walls,R){
  const safe=snapOut(point,walls,R+0.65);
  return blocked(safe,walls,R+0.65)?collideResolve({...safe},walls,R):safe;
}
function gridNavigableSegment(start,goal,walls,R){
  const margin=R+0.8,step=3;
  const expanded=walls.map(w=>({x:w.x-margin,y:w.y-margin,w:w.w+margin*2,h:w.h+margin*2}));
  const clear=(a,b)=>!navLineBlocked(a,b,expanded);
  if(clear(start,goal))return[{x:start.x,y:start.y},{x:goal.x,y:goal.y}];
  const grid=[];
  for(let x=2;x<=98;x+=step)for(let y=2;y<=98;y+=step){const point={x,y};if(!expanded.some(w=>point.x>=w.x&&point.x<=w.x+w.w&&point.y>=w.y&&point.y<=w.y+w.h))grid.push(point);}
  const nodes=[{x:start.x,y:start.y},{x:goal.x,y:goal.y},...grid];
  const startIndex=0,goalIndex=1,gScore=Array(nodes.length).fill(Infinity),fScore=Array(nodes.length).fill(Infinity),came=Array(nodes.length).fill(-1),open=[startIndex],closed=new Set();
  gScore[startIndex]=0;fScore[startIndex]=dist(nodes[startIndex],nodes[goalIndex]);
  const adjacent=(index)=>{
    const node=nodes[index],result=[];
    if(index<2){for(let i=2;i<nodes.length;i++)if(dist(node,nodes[i])<=step*2.4&&clear(node,nodes[i]))result.push(i);if(clear(node,nodes[index===0?goalIndex:startIndex]))result.push(index===0?goalIndex:startIndex);return result;}
    const gx=Math.round((node.x-2)/step),gy=Math.round((node.y-2)/step);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const nx=nodes.findIndex((candidate,i)=>i>=2&&Math.round((candidate.x-2)/step)===gx+dx&&Math.round((candidate.y-2)/step)===gy+dy);if(nx>=2&&clear(node,nodes[nx]))result.push(nx);}
    for(const endpoint of [startIndex,goalIndex])if(dist(node,nodes[endpoint])<=step*2.4&&clear(node,nodes[endpoint]))result.push(endpoint);
    return result;
  };
  while(open.length){let best=0;for(let i=1;i<open.length;i++)if(fScore[open[i]]<fScore[open[best]])best=i;const current=open.splice(best,1)[0];if(current===goalIndex){const path=[];for(let at=goalIndex;at>=0;at=came[at]){path.push(nodes[at]);if(at===startIndex)break;}return path.reverse();}closed.add(current);for(const next of adjacent(current)){if(closed.has(next))continue;const tentative=gScore[current]+dist(nodes[current],nodes[next]);if(tentative<gScore[next]){came[next]=current;gScore[next]=tentative;fScore[next]=tentative+dist(nodes[next],nodes[goalIndex]);if(!open.includes(next))open.push(next);}}}
  return[];
}
function navigableSegment(start,goal,walls,R){
  // Match the authoritative collision radius closely. The previous extra
  // 0.45 clearance classified a player legally sliding at R from a wall as
  // already inside the planner obstacle, so replans fell back to the same
  // blocked direct segment. Keep only a numeric/navigation epsilon here.
  const plannerStart=plannerSafePoint(start,walls,R),plannerGoal=plannerSafePoint(goal,walls,R);
  const margin=R+0.65,cornerGap=0.38;
  const obstacles=walls.map(w=>({x:w.x-margin,y:w.y-margin,w:w.w+margin*2,h:w.h+margin*2}));
  // A direct line through a solid obstacle must never be returned as a route.
  // Try the deterministic occupancy grid first; the visibility graph below is
  // still useful for sparse geometry, but it must not hide a blocked segment.
  if(navLineBlocked(plannerStart,plannerGoal,obstacles)){
    const gridRoute=gridNavigableSegment(plannerStart,plannerGoal,walls,R);
    if(gridRoute.length>1)return gridRoute;
  }
  const cornerVertices=[];
  obstacles.forEach(w=>{
    cornerVertices.push({x:clamp(w.x-cornerGap,1.5,98.5),y:clamp(w.y-cornerGap,1.5,98.5)});
    cornerVertices.push({x:clamp(w.x+w.w+cornerGap,1.5,98.5),y:clamp(w.y-cornerGap,1.5,98.5)});
    cornerVertices.push({x:clamp(w.x+w.w+cornerGap,1.5,98.5),y:clamp(w.y+w.h+cornerGap,1.5,98.5)});
    cornerVertices.push({x:clamp(w.x-cornerGap,1.5,98.5),y:clamp(w.y+w.h+cornerGap,1.5,98.5)});
  });
  const insideObstacle=p=>obstacles.some(w=>p.x>w.x&&p.x<w.x+w.w&&p.y>w.y&&p.y<w.y+w.h);
  const vertices=[{x:plannerStart.x,y:plannerStart.y},{x:plannerGoal.x,y:plannerGoal.y},...cornerVertices.filter(p=>!insideObstacle(p))];
  const clear=(a,b)=>!navLineBlocked(a,b,obstacles);
  const n=vertices.length,ds=Array(n).fill(Infinity),prev=Array(n).fill(-1),used=Array(n).fill(false);ds[0]=0;
  for(let iter=0;iter<n;iter++){
    let u=-1;for(let i=0;i<n;i++)if(!used[i]&&(u<0||ds[i]<ds[u]))u=i;if(u<0||!Number.isFinite(ds[u]))break;used[u]=true;
    if(u===1)break;
    for(let v=0;v<n;v++){if(used[v]||u===v||!clear(vertices[u],vertices[v]))continue;const nd=ds[u]+dist(vertices[u],vertices[v]);if(nd<ds[v]){ds[v]=nd;prev[v]=u;}}
  }
  if(!Number.isFinite(ds[1])){
    const detourCorners=obstacles.flatMap(w=>[
      {x:w.x-1.10,y:w.y-1.10},{x:w.x+w.w+1.10,y:w.y-1.10},
      {x:w.x+w.w+1.10,y:w.y+w.h+1.10},{x:w.x-1.10,y:w.y+w.h+1.10},
    ]).filter(p=>p.x>1.5&&p.x<98.5&&p.y>1.5&&p.y<98.5&&!blocked(p,walls,R+0.1));
    const clearSegment=(a,b)=>!navLineBlocked(a,b,obstacles);
    const direct=clearSegment(plannerStart,plannerGoal);
    if(direct)return[{x:plannerStart.x,y:plannerStart.y},{x:plannerGoal.x,y:plannerGoal.y}];
    // CS Loading v2（沿用 TD-54 / 51aebee）：同一個搜尋、同一個接受順序——第一個讓 start→a、a→b、b→goal
    // 全部暢通的 (i,j) 仍然勝出。clearSegment 是純函式：start→a 對 j 不變，提到外層
    // （start 走不到的角落直接跳過整個內圈）；corner→goal 每個角落最多算一次。
    const goalClear=new Array(detourCorners.length).fill(null);
    const cornerReachesGoal=k=>(goalClear[k]===null?(goalClear[k]=clearSegment(detourCorners[k],plannerGoal)):goalClear[k]);
    for(let i=0;i<detourCorners.length;i++){
      const a=detourCorners[i];
      const startReachesA=clearSegment(plannerStart,a);
      if(startReachesA&&cornerReachesGoal(i))return[{x:plannerStart.x,y:plannerStart.y},a,{x:plannerGoal.x,y:plannerGoal.y}];
      if(!startReachesA)continue;
      for(let j=i+1;j<detourCorners.length;j++){
        const b=detourCorners[j];
        if(clearSegment(a,b)&&cornerReachesGoal(j))return[{x:plannerStart.x,y:plannerStart.y},a,b,{x:plannerGoal.x,y:plannerGoal.y}];
      }
    }
    const gridRoute=gridNavigableSegment(plannerStart,plannerGoal,walls,R);if(gridRoute.length>1)return gridRoute;
    return navLineBlocked(plannerStart,plannerGoal,obstacles)?[{x:plannerStart.x,y:plannerStart.y}]:[{x:plannerStart.x,y:plannerStart.y},{x:plannerGoal.x,y:plannerGoal.y}];
  }
  const path=[];for(let at=1;at>=0;at=prev[at]){path.push(vertices[at]);if(at===0)break;}path.reverse();return path;
}
function buildNavigableRoute(points,walls,R,memo,segmentCache=null){
  // Route intents may be authored on a site marker or beside newly-solid
  // cover. Normalize waypoints to walkable space before path search; this
  // moves only the route target, never the authoritative player position.
  const base=(points||[]).filter(Boolean).map(p=>plannerSafePoint({x:Number(p.x),y:Number(p.y)},walls,R));if(base.length<2)return base;
  const key=base.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("|");if(memo?.has(key))return memo.get(key).map(p=>({...p}));
  const route=[base[0]];for(let i=1;i<base.length;i++){
    const start=route[route.length-1],goal=base[i];
    let segment=segmentCache?.getSegment(start,goal,walls,R);
    if(!segment){segment=navigableSegment(start,goal,walls,R);segmentCache?.setSegment(start,goal,segment,walls,R);}
    route.push(...segment.slice(1));
  }
  memo?.set(key,route.map(p=>({...p})));return route;
}
// 沿 a→方向(dir) 到第一道牆的距離（地圖單位）；找不到回傳 max
function rayWallDist(ax,ay,dx,dy,walls,max){
  const n=Math.ceil(max/0.7);for(let i=1;i<=n;i++){const t=(i/n)*max;const x=ax+dx*t,y=ay+dy*t;for(const w of walls){if(x>=w.x&&x<=w.x+w.w&&y>=w.y&&y<=w.y+w.h)return t;}}
  return max;
}
function segPtDist(ax,ay,bx,by,px,py){const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;if(l2<1e-6)return Math.hypot(px-ax,py-ay);let t=((px-ax)*dx+(py-ay)*dy)/l2;t=Math.max(0,Math.min(1,t));return Math.hypot(px-(ax+dx*t),py-(ay+dy*t));}
// 煙霧阻斷視線：對槍連線若穿過煙團則無法交火
const SMOKE_R=6;
// R14 functional baseline only; balance calibration requires a separate Sprint.
const HE_R=12,HE_MAX_DAMAGE=80,HE_ARMOR_SCALE=0.72;
// R15 functional baseline only; balance calibration requires a separate Sprint.
const MOLLY_R=4,MOLLY_TL=8,MOLLY_DAMAGE_PER_TICK=10;
function smokeBlocks(a,b,smokes){if(!smokes||!smokes.length)return false;for(const s of smokes){if((s.tl??1)<=0)continue;if(segPtDist(a.x,a.y,b.x,b.y,s.pos.x,s.pos.y)<SMOKE_R)return true;}return false;}
function canEngage(observer,target,walls,smokes,prog){
  // Locomotion interruption must use the same legal-contact authority as the
  // combat scheduler. A separate distance/FOV gate made an actor walk through
  // a route anchor before the scheduler accepted the same contact.
  if(!observer||!target||observer.dead||target.dead||prog<=0)return false;
  if(observer.state==="BUY"||observer.state==="撤退"||!observer.gun||observer.picking>0)return false;
  const d=dist(observer.pos,target.pos),auth=weaponAuthority(observer.gun);
  const lineOfSight=!lineBlocked(observer.pos,target.pos,walls);
  const smokeBlocked=smokeBlocks(observer.pos,target.pos,smokes);
  const fov=csTargetInFov(observer,target);
  return csEngagementPermission(observer,target,d,auth,{lineOfSight,fov,smokeBlocked});
}

// ─── 地圖資料（walls = 碰撞 + 3D 建築）───────────────────────────────────
const MAPS={
  mirage:{name:FPS_MAJOR_MAP_ART.mirage.name,floor:"#89918b",accent:"#d5c6ab",accent2:"#688d8b",
    walls:[
      {x:2,y:2,w:5,h:93,hgt:5},{x:93,y:2,w:5,h:93,hgt:5},
      {x:7,y:2,w:35,h:5,hgt:6},{x:58,y:2,w:35,h:5,hgt:6},{x:7,y:95,w:86,h:3,hgt:4},
      {x:7,y:42,w:8,h:25,hgt:8},{x:26,y:45,w:14,h:18,hgt:4.5,win:1,art:"water-tower"},
      {x:84,y:42,w:9,h:24,hgt:7},
      {x:22,y:78,w:14,h:12,hgt:7,win:1},{x:64,y:78,w:14,h:12,hgt:7,win:1},
      // An opaque spawn screen breaks the otherwise open 80-unit spawn-to-spawn
      // sniper axis. Both flanking exits remain navigable; the same wall owns LOS.
      {x:43,y:78,w:14,h:3,hgt:4},
      {x:41,y:38,w:22,h:3,hgt:4},
      {x:14,y:10,w:10,h:8,hgt:8},...FPS_MAJOR_AUTHORED_ROOMS.mirage.flatMap(majorRoomWalls),
      {x:12,y:30,w:10,h:8,hgt:5},{x:32,y:32,w:10,h:8,hgt:5},
      {x:86,y:17,w:7,h:20,hgt:8},{x:65,y:28,w:8,h:10,hgt:7},
    ],
    crates:[{x:71,y:22},{x:83,y:28},{x:18,y:24},{x:27,y:20},{x:46,y:44},{x:55,y:62},{x:80,y:69},{x:18,y:69}],
    props:[{t:"barrel",x:60,y:39},{t:"barrel",x:43,y:66},{t:"sandbag",x:80,y:34,a:0},{t:"sandbag",x:24,y:39,a:0},{t:"crate",x:58,y:24}],
    rooms:[{x:40,y:45,w:22,h:18,height:7,label:"水務檢修廊",roof:"vault"},...FPS_MAJOR_AUTHORED_ROOMS.mirage],
    doors:[{x:46,y:40,w:8,h:2,dir:"h",label:"調壓門"},{x:17,y:40,w:7,h:2,dir:"h",label:"檢修門"},{x:76,y:40,w:7,h:2,dir:"h",label:"東側門"}],
    sites:{a:{x:78,y:24},b:{x:26,y:26}},spawns:{ct:{x:50,y:10},t:{x:50,y:90}},
    nodes:{tSpawn:{x:50,y:90},palace:{x:82,y:76},ramp:{x:78,y:60},topMid:{x:50,y:36},aRamp:{x:78,y:39},aSite:{x:78,y:24},mid:{x:50,y:55},window:{x:58,y:34},apps:{x:20,y:60},connector:{x:25,y:43},bSite:{x:26,y:26},ctSpawn:{x:50,y:10}},
    callouts:[{x:50,y:92,l:"進攻集結"},{x:50,y:10,l:"勤務入口"},{x:78,y:24,l:"A 調壓站"},{x:26,y:26,l:"B 濾水庭院"},{x:50,y:55,l:"檢修中庭"},{x:20,y:60,l:"西側廊道"},{x:78,y:60,l:"東側回廊"},{x:82,y:76,l:"泵房外側"}]},
  dust2:{name:FPS_MAJOR_MAP_ART.dust2.name,floor:"#758389",accent:"#b2c3bf",accent2:"#436f79",
    walls:[
      {x:2,y:2,w:5,h:93,hgt:5},{x:93,y:2,w:5,h:93,hgt:5},{x:7,y:2,w:86,h:5,hgt:6},{x:7,y:95,w:86,h:3,hgt:4},
      {x:7,y:15,w:14,h:23,hgt:6.5,win:1,art:"loading-hall"},{x:30,y:10,w:12,h:25,hgt:10.5,win:1,art:"loading-hall"},
      {x:63,y:8,w:20,h:9,hgt:11,win:1,art:"cold-store"},{x:54,y:23,w:5,h:11,hgt:6},{x:69,y:32,w:7,h:10,hgt:7},
      {x:82,y:18,w:11,h:20,hgt:8},{x:7,y:45,w:10,h:20,hgt:7},{x:32,y:42,w:8,h:6,hgt:5},
      ...FPS_MAJOR_AUTHORED_ROOMS.dust2.flatMap(majorRoomWalls),
      {x:64,y:58,w:9,h:9,hgt:6},{x:61,y:78,w:10,h:12,hgt:4.5},
      {x:29,y:80,w:9,h:10,hgt:7},{x:7,y:76,w:4,h:14,hgt:6},{x:78,y:78,w:10,h:12,hgt:8},
    ],
    crates:[{x:73,y:20},{x:80,y:30},{x:24,y:50},{x:29,y:71},{x:45,y:55},{x:83,y:65},{x:47,y:77},{x:14,y:70}],
    props:[{t:"barrel",x:62,y:46},{t:"barrel",x:43,y:39},{t:"sandbag",x:64,y:35,a:0},{t:"car",x:85,y:73,a:0},{t:"crate",x:21,y:43}],
    rooms:[{x:42,y:61,w:10,h:7,height:7,label:"海關檢查廊",roof:"sawtooth"},...FPS_MAJOR_AUTHORED_ROOMS.dust2],
    doors:[{x:44,y:46,w:7,h:2,dir:"h",label:"海關門"},{x:22,y:40,w:7,h:2,dir:"h",label:"貨運門"},{x:77,y:44,w:2,h:7,dir:"v",label:"冷鏈側門"}],
    sites:{a:{x:76,y:25},b:{x:26,y:58}},spawns:{ct:{x:52,y:15},t:{x:22,y:89}},
    nodes:{tSpawn:{x:22,y:89},longEntry:{x:48,y:85},long:{x:78,y:75},longCorner:{x:84,y:53},aRamp:{x:78,y:39},aSite:{x:76,y:25},pit:{x:87,y:44},shortA:{x:64,y:28},catwalk:{x:54,y:41},mid:{x:48,y:62},midDoors:{x:46,y:48},xbox:{x:43,y:48},lower:{x:16,y:78},bTunnel:{x:20,y:68},bDoors:{x:36,y:54},bSite:{x:26,y:58},ctSpawn:{x:52,y:15},ctMid:{x:50,y:30}},
    callouts:[{x:22,y:92,l:"貨運入口"},{x:52,y:15,l:"海關入口"},{x:76,y:25,l:"A 冷鏈裝卸"},{x:26,y:58,l:"B 維修庫"},{x:48,y:62,l:"海關通道"},{x:78,y:75,l:"碼頭長廊"},{x:20,y:68,l:"西側貨道"},{x:64,y:28,l:"短程維修道"}]},
  inferno:{name:FPS_MAJOR_MAP_ART.inferno.name,floor:"#85756b",accent:"#c3a68c",accent2:"#895541",
    walls:[
      {x:2,y:2,w:5,h:93,hgt:5},{x:95,y:2,w:3,h:93,hgt:5},{x:7,y:2,w:88,h:5,hgt:6},{x:7,y:95,w:88,h:3,hgt:4},
      {x:15,y:10,w:9,h:18,hgt:4.2,win:1,art:"cooling"},{x:34,y:10,w:10,h:18,hgt:4.2,win:1,art:"cooling"},
      {x:54,y:10,w:15,h:17,hgt:4.5,win:1,art:"furnace"},{x:72,y:8,w:12,h:7,hgt:7},
      ...FPS_MAJOR_AUTHORED_ROOMS.inferno.flatMap(majorRoomWalls),
      {x:66,y:28,w:3,h:25,hgt:7},
      {x:74,y:28,w:1.8,h:22,hgt:7},{x:88.2,y:28,w:1.8,h:22,hgt:7},
      {x:74,y:26,w:16,h:1.8,hgt:7},{x:74,y:49,w:5,h:1.8,hgt:7},{x:85,y:49,w:5,h:1.8,hgt:7},
      {x:7,y:67,w:11,h:10,hgt:7},{x:22,y:71,w:8,h:7,hgt:6},
      {x:48,y:82,w:13,h:9,hgt:10.5,art:"press-hall"},
      {x:65,y:72,w:7,h:17,hgt:8},{x:83,y:80,w:8,h:10,hgt:6},
    ],
    rooms:[{x:74,y:28,w:16,h:22,height:6.8,label:"機控室"},...FPS_MAJOR_AUTHORED_ROOMS.inferno],
    crates:[{x:28,y:16},{x:30,y:30},{x:85,y:72},{x:75,y:80},{x:46,y:60},{x:76,y:33},{x:86,y:44},{x:35,y:81}],
    props:[{t:"barrel",x:24,y:35},{t:"barrel",x:60,y:44},{t:"sandbag",x:74,y:57,a:0},{t:"crate",x:46,y:76},{t:"car",x:83,y:88,a:0}],
    doors:[{x:23,y:31,w:8,h:2,dir:"h",label:"冷卻門"},{x:79,y:50,w:6,h:2,dir:"h",label:"機控入口"},{x:45,y:57,w:7,h:2,dir:"h",label:"輸送門"}],
    sites:{a:{x:80,y:74},b:{x:30,y:23}},spawns:{ct:{x:85,y:18},t:{x:12,y:86}},
    nodes:{tSpawn:{x:12,y:86},tRamp:{x:26,y:56},banana:{x:26,y:43},car:{x:32,y:36},bSite:{x:30,y:23},bTop:{x:50,y:25},apps:{x:32,y:86},boiler:{x:52,y:76},mid:{x:48,y:65},sewer:{x:26,y:64},secondMid:{x:60,y:54},aConn:{x:72,y:63},aRamp:{x:82,y:62},aSite:{x:80,y:74},arch:{x:64,y:40},library:{x:80,y:42},libIn:{x:80,y:34},pit:{x:88,y:77},ctSpawn:{x:85,y:18}},
    callouts:[{x:12,y:89,l:"進攻貨梯"},{x:85,y:18,l:"防守勤務場"},{x:80,y:74,l:"A 壓機庭院"},{x:30,y:23,l:"B 冷卻站"},{x:26,y:43,l:"西側管廊"},{x:48,y:65,l:"輸送中道"},{x:80,y:42,l:"機控室"},{x:32,y:86,l:"外側貨道"}]},
};
// 選手 16 項素質（與 MOBA 共用的同一套；分四類）— 直接沿用遊戲的素質欄位
const STAT_GROUPS=[
  ["操作",[["rxn","反應速度"],["acc","精準度"],["apm","操作速度"],["pos","走位"]]],
  ["戰術",[["vis","視野意識"],["tac","戰術理解"],["dec","決策力"],["adp","應變力"]]],
  ["心理",[["cou","勇氣"],["str","抗壓"],["foc","專注力"],["res","韌性"]]],
  ["團隊",[["com","溝通"],["led","領導力"],["coo","配合度"],["lrn","學習力"]]],
];
const STAT_KEYS=STAT_GROUPS.flatMap(g=>g[1]);
// ── 個性系統（短鍵版，對應遊戲 EsportsGame 的 PERSONALITY；boost/nerf 用 3D 短鍵）──
// 個性會在對戰中影響：素質的有效值（boost +6 / nerf −4）、進攻性 aggr、以及殘局心態。
const PERSONALITY={
  aggressive:{zh:"進攻型",boost:["cou","rxn"],nerf:["dec","foc"],aggro:0.10},   // 敢衝，決策/專注略降
  defensive: {zh:"防守型",boost:["pos","foc"],nerf:["cou","apm"],aggro:-0.10},  // 穩守，侵略性低
  calm:      {zh:"冷靜型",boost:["str","dec"],nerf:["cou","apm"],aggro:-0.05},  // 殘局穩、節奏慢
  passionate:{zh:"熱血型",boost:["cou","led"],nerf:["foc","coo"],aggro:0.08},   // 帶動氣氛、情緒大
  genius:    {zh:"天才型",boost:["rxn","lrn"],nerf:["coo","res"],aggro:0.04},   // 天賦高、不合群
  grinder:   {zh:"苦練型",boost:["acc","foc"],nerf:["adp","lrn"],aggro:0.0},    // 勤奮可靠、靈活差
  shotcaller:{zh:"指揮型",boost:["com","led"],nerf:["acc","apm"],aggro:0.0},    // 戰術腦、個人操作普
  lonewolf:  {zh:"孤狼型",boost:["apm","rxn"],nerf:["com","coo"],aggro:0.06},   // 個人強、團隊配合差
  steady:    {zh:"穩健型",boost:["res","pos"],nerf:["cou","rxn"],aggro:-0.06},  // 不犯錯、少高光
  creative:  {zh:"創意型",boost:["adp","lrn"],nerf:["foc","res"],aggro:0.03},   // 出其不意、不穩定
};
const PERS_BOOST=6,PERS_NERF=4;
// 套用個性到單一素質值（對戰時的有效值）
function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}
// 士氣 / 狀態 對發揮的整體倍率（對應遊戲 MORALE_EFFECT / CONDITION_EFFECT）
const moraleMul=m=>m==null?1:(m>=85?1.06:m>=65?1.0:m>=45?0.93:0.83);
const condMul=c=>({"精神飽滿":1.05,"正常":1.0,"疲勞":0.92,"低潮":0.82}[c]||1);
const formMul=p=>moraleMul(p.morale)*condMul(p.condition);
// 戰隊（主隊 = 你的名單）：FPS 職業由 MOBA 定位/戰力對應；fps=FPS戰力, moba=MOBA戰力, sta=體力
const ROSTER=[
  // 我方戰隊（T 德國海豹）— 取自你的選手名單
  {id:"t1",name:"Kratos",side:"t",role:"entry",fpsRole:"突破手",moba:85,fps:86,sta:85,personality:"aggressive",stats:{rxn:78,acc:72,apm:80,pos:85,vis:74,tac:70,dec:68,adp:72,cou:88,str:75,foc:70,res:76,com:65,led:72,coo:70,lrn:68}},
  {id:"t2",name:"Chad",side:"t",role:"rifler",fpsRole:"步槍手",moba:91,fps:92,sta:86,personality:"genius",stats:{rxn:84,acc:88,apm:87,pos:85,vis:80,tac:82,dec:80,adp:82,cou:84,str:86,foc:85,res:84,com:78,led:80,coo:82,lrn:80}},
  {id:"t3",name:"Pinata",side:"t",role:"awp",fpsRole:"狙擊手",moba:81,fps:82,sta:82,personality:"calm",stats:{rxn:82,acc:86,apm:78,pos:80,vis:82,tac:78,dec:78,adp:80,cou:74,str:84,foc:88,res:82,com:74,led:72,coo:80,lrn:76}},
  {id:"t4",name:"Craby",side:"t",role:"lurker",fpsRole:"游走手",moba:79,fps:80,sta:82,personality:"lonewolf",stats:{rxn:79,acc:78,apm:84,pos:86,vis:84,tac:80,dec:78,adp:83,cou:80,str:78,foc:82,res:80,com:76,led:74,coo:78,lrn:80}},
  {id:"t5",name:"Lego",side:"t",role:"igl",fpsRole:"指揮",moba:83,fps:82,sta:80,personality:"shotcaller",stats:{rxn:74,acc:73,apm:72,pos:76,vis:86,tac:88,dec:85,adp:84,cou:78,str:85,foc:83,res:86,com:90,led:92,coo:88,lrn:82}},
  // 對手戰隊（CT Compulsary）
  {id:"ct1",name:"orgaNick",side:"ct",role:"igl",fpsRole:"指揮",moba:84,fps:83,sta:82,personality:"shotcaller",stats:{rxn:76,acc:73,apm:76,pos:79,vis:88,tac:90,dec:86,adp:84,cou:76,str:86,foc:82,res:84,com:88,led:90,coo:86,lrn:80}},
  {id:"ct2",name:"Oniheavy",side:"ct",role:"awp",fpsRole:"狙擊手",moba:84,fps:85,sta:80,personality:"grinder",stats:{rxn:83,acc:84,apm:78,pos:81,vis:84,tac:80,dec:80,adp:82,cou:76,str:84,foc:88,res:82,com:74,led:76,coo:80,lrn:78}},
  {id:"ct3",name:"purPeEsw",side:"ct",role:"rifler",fpsRole:"步槍手",moba:85,fps:85,sta:85,personality:"steady",stats:{rxn:84,acc:85,apm:85,pos:82,vis:80,tac:80,dec:79,adp:81,cou:82,str:82,foc:83,res:82,com:78,led:78,coo:82,lrn:80}},
  {id:"ct4",name:"b3autiFul",side:"ct",role:"entry",fpsRole:"突破手",moba:83,fps:84,sta:90,personality:"aggressive",stats:{rxn:87,acc:82,apm:83,pos:86,vis:82,tac:78,dec:76,adp:80,cou:90,str:80,foc:78,res:80,com:76,led:74,coo:80,lrn:78}},
  {id:"ct5",name:"GolDenous",side:"ct",role:"support",fpsRole:"輔助",moba:82,fps:82,sta:83,personality:"calm",stats:{rxn:78,acc:77,apm:79,pos:80,vis:86,tac:84,dec:82,adp:82,cou:78,str:84,foc:82,res:82,com:90,led:84,coo:90,lrn:80}},
];
// roster identity is passed explicitly from the component wrapper to both
// simulation and renderer; do not keep a mutable module-level roster here.
const ovr=p=>p.fps||Math.round(((p.stats?(p.stats.acc+p.stats.rxn+p.stats.apm+p.stats.pos)/4:80)));
// 各 FPS 定位的 5 項關鍵素質（取自 esmo 遊戲的 POSITION_PROFILE，權重 5→1）
const POS_PROFILE={
  rifler:["acc","rxn","pos","foc","str"],   // 步槍手
  entry:["cou","rxn","apm","acc","str"],    // 突破手
  awp:["acc","foc","pos","str","rxn"],      // 狙擊手
  igl:["led","com","dec","tac","adp"],      // 指揮
  support:["coo","tac","com","pos","vis"],  // 道具手/輔助
  lurker:["vis","dec","pos","adp","str"],   // 自由人/游走
};
// FPS 全域素質權重（取自遊戲 FPS_WEIGHTS）
const FPS_W={acc:1.4,rxn:1.3,str:1.3,pos:1.2,cou:1.1,vis:1.1,apm:1.0,tac:1.0,foc:1.0,dec:0.9,com:0.9,adp:0.8,res:0.8,coo:0.8,led:0.7,lrn:0.5};
const _mechKeys=["acc","rxn","apm","pos","foc","str"],_mechW=_mechKeys.reduce((a,k)=>a+FPS_W[k],0);
function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k==="rxn"?rawReflex:(s[k]||50))*(5-i));return t/15;} // role-fit / positioning aptitude；rxn 保留 rawReflex
// 對槍實力：機械對槍核心（FPS 權重）+ 武器契合 + 角色定位契合（5 項關鍵素質）+ 情境（呼應 fpsRoles 戰術）
function combatSkill(p,opts){const s=p.stats;if(!s)return 80;const cls=GUNS[p.gun]?.cls;
  const rawReflex=Number(s.rxn??50),effectiveReflex=persStat(p,"rxn");
  const S=k=>k==="rxn"?effectiveReflex:persStat(p,k); // live combat 使用 effectiveReflex；其他素質維持既有 effective read
  let mech=0;_mechKeys.forEach(k=>mech+=S(k)*FPS_W[k]);mech/=_mechW;
  const wpn=cls==="狙擊"?(S("acc")*0.45+S("foc")*0.3+S("pos")*0.25):cls==="手槍"?(S("acc")*0.55+effectiveReflex*0.45):(S("acc")*0.42+S("apm")*0.3+effectiveReflex*0.28);
  const role=posSkill(p,rawReflex); // raw role-fit；live combat 另用 effectiveReflex
  let v=mech*0.5+wpn*0.28+role*0.14+S("vis")*0.04+S("dec")*0.04;
  if(opts){
    if(opts.holding)v+=S("pos")*0.05+S("foc")*0.05;            // 狙擊手/防守：主動架點
    if(opts.entry)v+=S("cou")*0.06+effectiveReflex*0.02;        // 突破手：首發突進；effectiveReflex
    if(opts.lastAlive)v+=(S("str")-76)*0.22;                      // 殘局主動勝負：由 Clutch 負責
    if(opts.lurk)v+=(S("vis")-76)*0.05+(S("pos")-76)*0.04;     // 自由人：埋伏陰人
    if(opts.lowHP)v-=(100-S("str"))*0.05-(S("res")-76)*0.12;   // 低血量穩定執行：Resilience 減少衰退
  }
  return v*formMul(p); // 士氣 / 體能狀態 影響整體發揮
}
// 進攻性（0–1）：勇氣為主＋抗壓/操作速度/走位＋FPS 職業。低 → 較龜縮、開火保守、殘血易撤退
const ROLE_AGGR={entry:0.14,rifler:0.05,igl:0,support:-0.03,awp:-0.05,lurker:-0.07};
function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,"cou")*0.5+persStat(p,"str")*0.22+persStat(p,"apm")*0.16+persStat(p,"pos")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}
const MAPAWARE_BASE_RANGE=28,MAPAWARE_VIS_RANGE=0.28;
function mapAwareCanReadVisibleCandidate(p,distance,visibleCandidate,auth=null){
  if(!visibleCandidate)return false;
  const awarenessRange=MAPAWARE_BASE_RANGE+persStat(p,"vis")*MAPAWARE_VIS_RANGE;
  // Scoped weapons have a longer authoritative acquisition envelope. The
  // weapon range remains the hard ceiling; non-sniper awareness is unchanged.
  const effectiveAwarenessRange=auth?.family==="sniper"?auth.range:awarenessRange;
  return distance<=effectiveAwarenessRange;
}
const ADAPT_ROUTE_THRESHOLD=80;
function adaptiveRouteGoal(p,target,N){
  if(persStat(p,"adp")<ADAPT_ROUTE_THRESHOLD)return null;
  const goal=p.side==="t"?N[target==="a"?"aConn":"car"]:N[target==="a"?"aSite":"bSite"];
  return goal&&dist(p.pos,goal)>6?goal:null;
}
const TACTICAL_EXECUTION_THRESHOLD=90;
function tacticalRouteKeys(p,tactic,tr,RKF){
  const direct=tr[p.role];
  const spawnKey=p.side==="ct"?"ctSpawn":"tSpawn";
  const fallback=tr[RKF[p.role]]||tr.rifler||tr.entry||Object.values(tr)[0]||[spawnKey];
  return p.role==="igl"&&persStat(p,"tac")>=TACTICAL_EXECUTION_THRESHOLD&&direct?direct:tr[p.role]||fallback;
}
function adaptivePostPlantGoal(p,planted,c4pos){
  if(!planted||p.side!=="t"||p.hp<48||p._adaptivePostPlant||persStat(p,"adp")<ADAPT_ROUTE_THRESHOLD)return null;
  return c4pos&&dist(p.pos,c4pos)>10?c4pos:null;
}
function tacticalRetakeRoute(p,tactic,N,c4pos){
  if(p.side!=="ct"||!c4pos||persStat(p,"tac")<TACTICAL_EXECUTION_THRESHOLD)return null;
  const keys=tactic?.routes?.[p.role]||tactic?.routes?.rifler||tactic?.routes?.entry;if(!Array.isArray(keys)||keys.length<3)return null;
  const staging=keys.slice(1,-1).map(key=>N[key]).find(node=>node&&dist(node,c4pos)>8);
  return staging?[{...p.pos},{...staging},{...c4pos}]:null;
}
const COMMS_HANDOFF_THRESHOLD=88;
function applyCommsHandoff(spotter,enemy,players,walls){
  if(persStat(spotter,"com")<COMMS_HANDOFF_THRESHOLD)return null;
  const candidates=players.filter(p=>p!==spotter&&!p.dead&&!p.reassigned&&p.side===spotter.side&&(dist(p.pos,enemy.pos)<50||dist(p.pos,spotter.pos)<45));
  candidates.sort((a,b)=>((b.role==="support"?1:0)-(a.role==="support"?1:0))||dist(a.pos,enemy.pos)-dist(b.pos,enemy.pos));
  const receiver=candidates[0];if(!receiver)return null;
  receiver.route=[{...receiver.pos},{...enemy.pos}];receiver.routeIdx=0;receiver.routeT=0;receiver.state="ROTATE";
  receiver.va=Math.atan2(enemy.pos.y-receiver.pos.y,enemy.pos.x-receiver.pos.x)*180/Math.PI;
  return receiver;
}
const LEADERSHIP_EXECUTION_THRESHOLD=90;
function leadershipRouteKeys(p,tactic,tr,RKF,roster){
  const base=tacticalRouteKeys(p,tactic,tr,RKF);
  if(p.role==="igl")return base;
  const leader=roster.find(q=>q.side===p.side&&q.role==="igl"&&!q.dead);
  return leader&&persStat(leader,"led")>=LEADERSHIP_EXECUTION_THRESHOLD&&tr[leader.role]?tr[leader.role]:base;
}
const SYNERGY_TRADE_THRESHOLD=90;
function synergyTradeCandidate(attacker,victim,players,walls){
  const candidates=players.filter(p=>p!==attacker&&!p.dead&&!p.reassigned&&p.side===attacker.side&&dist(p.pos,attacker.pos)<24&&dist(p.pos,victim.pos)<38&&!lineBlocked(p.pos,victim.pos,walls));
  candidates.sort((a,b)=>((b.role==="support"?1:0)-(a.role==="support"?1:0))||dist(a.pos,attacker.pos)-dist(b.pos,attacker.pos));
  return candidates[0]||null;
}
function leadershipFollowUpRoute(leader,teammate,goal){
  if(!leader||!teammate||leader===teammate||leader.dead||teammate.dead||leader.side!==teammate.side||leader.role!=="igl"||persStat(leader,"led")<LEADERSHIP_EXECUTION_THRESHOLD||!goal)return null;
  const next=Array.isArray(leader.route)&&leader.route.length>1?leader.route[Math.min(leader.routeIdx+1,leader.route.length-1)]:null;
  const via=next&&dist(next,goal)>4?next:null;
  if(dist(teammate.pos,goal)<=4)return null;
  return via?[{...teammate.pos},{...via},{...goal}]:[{...teammate.pos},{...goal}];
}
function leadershipFollowUpAfterKill(victim,players,target,N){
  const goal=victim.side==="t"?N[target==="a"?"aSite":"bSite"]:victim.pos;
  const leader=players.find(p=>p.side===victim.side&&p.role==="igl"&&!p.dead&&!p.reassigned);
  const teammates=players.filter(p=>p.side===victim.side&&p!==leader&&!p.dead&&!p.reassigned);
  const teammate=teammates[teammates.length-1]||null;
  const opportunity=Boolean(leader&&teammate&&goal);
  const route=leadershipFollowUpRoute(leader,teammate,goal);
  if(route){teammate.reassigned=true;teammate.route=route;teammate.routeIdx=0;teammate.routeT=0;teammate.state="ROTATE";}
  return {opportunity,action:Boolean(route),leaderId:leader?.id??null,playerId:teammate?.id??null,leaderRole:leader?.role??null,role:teammate?.role??null,led:leader?persStat(leader,"led"):null};
}
function synergyCoverFollowUpRoute(attacker,partner,victim){
  if(!attacker||!partner||!victim||attacker===partner||attacker.dead||partner.dead||victim.dead)return null;
  const dx=victim.pos.x-partner.pos.x,dy=victim.pos.y-partner.pos.y,L=Math.hypot(dx,dy)||1;
  const cover={x:clamp(partner.pos.x-dx/L*7,5,95),y:clamp(partner.pos.y-dy/L*7,5,95)};
  return dist(attacker.pos,cover)>4?[{...attacker.pos},cover]:null;
}
function applyCommsBombAwareness(carrier,sitePos,players){
  const candidates=players.filter(p=>p!==carrier&&!p.dead&&!p.reassigned&&dist(p.pos,carrier.pos)<50&&persStat(p,"com")>=COMMS_HANDOFF_THRESHOLD);
  candidates.sort((a,b)=>((b.role==="support"?1:0)-(a.role==="support"?1:0))||persStat(b,"com")-persStat(a,"com")||dist(a.pos,sitePos)-dist(b.pos,sitePos));
  const receiver=candidates[0];if(!receiver||!sitePos)return null;
  receiver.route=[{...receiver.pos},{...sitePos}];receiver.routeIdx=0;receiver.routeT=0;receiver.state="ROTATE";
  receiver.va=Math.atan2(sitePos.y-receiver.pos.y,sitePos.x-receiver.pos.x)*180/Math.PI;
  return receiver;
}
// ── 戰術剋制關係（剪刀石頭布 + 站點對位）──────────────────────────────
// 回傳「對 T 方有利」的對槍機率偏移（+ 利攻方 / − 利守方）。一回合內固定。
// 類型剋制：T(rush/execute/default) × CT(default/stack/aggro)
const TAC_MATRIX={
  rush:    {default:0.00, stack:-0.03, aggro:+0.04},  // 快攻碾壓前壓、但撞上堆點吃虧
  execute: {default:+0.01, stack:+0.03, aggro:-0.03}, // 道具執行破堆點、但被前壓抓節奏
  default: {default:0.00, stack:-0.01, aggro:+0.03},  // 中路控制懲罰過度前壓
};
function tacticEdge(tT,tCT){
  let e=0;
  const tType=tT.type||"default",cType=tCT.type||"default";
  e+=(TAC_MATRIX[tType]&&TAC_MATRIX[tType][cType])||0;
  // 站點對位：CT 是否守在 T 進攻的點
  if(tT.site&&tCT.site&&tT.site!=="mid"){
    if(tCT.site===tT.site) e-=0.05;                          // CT 正面堆在 T 要打的點 → 守方優勢
    else if(cType==="stack") e+=0.06;                        // CT 堆錯點、T 打空點 → 攻方巨大優勢
    else if(tCT.site!=="mid") e+=0.02;                       // CT 預設守錯邊 → 攻方小優勢
  }
  return clamp(e,-0.10,0.10);
}
const GUNS={
  ak:{name:"AK-47",dmg:36,hs:0.45,cls:"步槍",rof:9},m4:{name:"M4A1-S",dmg:33,hs:0.4,cls:"步槍",rof:10},m4a4:{name:"M4A4",dmg:33,hs:0.4,cls:"步槍",rof:11},
  galil:{name:"Galil",dmg:30,hs:0.38,cls:"步槍",rof:10},famas:{name:"FAMAS",dmg:30,hs:0.36,cls:"步槍",rof:11},aug:{name:"AUG",dmg:35,hs:0.42,cls:"步槍",rof:10},sg:{name:"SG 553",dmg:39,hs:0.44,cls:"步槍",rof:9},
  awp:{name:"AWP",dmg:115,hs:0.3,cls:"狙擊",rof:1},scout:{name:"SSG 08",dmg:88,hs:0.35,cls:"狙擊",rof:2},
  mp9:{name:"MP9",dmg:26,hs:0.3,cls:"衝鋒",rof:14},mac10:{name:"MAC-10",dmg:29,hs:0.28,cls:"衝鋒",rof:15},ump:{name:"UMP-45",dmg:35,hs:0.32,cls:"衝鋒",rof:12},p90:{name:"P90",dmg:26,hs:0.26,cls:"衝鋒",rof:16},
  deagle:{name:"Deagle",dmg:53,hs:0.5,cls:"手槍",rof:4},glock:{name:"Glock",dmg:28,hs:0.3,cls:"手槍",rof:8},usp:{name:"USP-S",dmg:35,hs:0.35,cls:"手槍",rof:7},p250:{name:"P250",dmg:38,hs:0.4,cls:"手槍",rof:8},tec9:{name:"Tec-9",dmg:33,hs:0.38,cls:"手槍",rof:11},
  nova:{name:"Nova",dmg:72,hs:0.18,cls:"霰彈",rof:3},xm1014:{name:"XM1014",dmg:62,hs:0.16,cls:"霰彈",rof:4},mag7:{name:"MAG-7",dmg:78,hs:0.2,cls:"霰彈",rof:5},sawedoff:{name:"Sawed-Off",dmg:86,hs:0.17,cls:"霰彈",rof:2},
};
// C5A.1 reaction model：沿用既有選手反應、視野、專注與武器家族，將清楚
// LoS 的反應延遲拆成可觀測的多因素模型。reaction telemetry 只記錄
// visible → acquired → permission → shot，不改既有勝負、damage 或 route。
const C5A2_SIM_STEP_SEC=0.5;
const C5A2_SIM_STEP_MS=C5A2_SIM_STEP_SEC*1000;
// The stable eeda26883 simulation emitted one snapshot every two simulated
// seconds. C5A2 increases snapshot resolution to 0.5s, so legacy per-snapshot
// values must be converted through this ratio, while playback advances using
// the actual frame duration below.
const C5A2_LEGACY_SNAPSHOT_SEC=2;
const C5A2_SIM_STEP_RATIO=C5A2_SIM_STEP_SEC/C5A2_LEGACY_SNAPSHOT_SEC;
const C5A2_PLAYBACK_FRAME_SEC=C5A2_SIM_STEP_SEC;
const C5A2_PROJECTILE_FLIGHT_SEC=1.6;
const C5A2_STUCK_TIMEOUT_SEC=2;
const C5A2_PROJECTILE_SPEED=Object.freeze({flash:15,he:14,smoke:12.5,molly:11.5});
const C5A2_LOCOMOTION=Object.freeze({idleMax:0.22,runMin:2.4});
function c5a2ProjectileProfile(type,distance){
  const velocity=C5A2_PROJECTILE_SPEED[type]||C5A2_PROJECTILE_SPEED.smoke;
  const duration=clamp(distance/velocity,0.55,2.4);
  return{flightDurationSec:Number(duration.toFixed(4)),velocityUnitsPerSec:Number((distance/duration).toFixed(4)),arcHeightUnits:Number(clamp(2.4+distance*0.22,2.8,6.8).toFixed(3))};
}
function c5a2LocomotionFor(player){
  const movementEnd=player._preSeparationPos||player.pos;
  const dx=(movementEnd?.x??0)-(player.prevPos?.x??movementEnd?.x??0),dy=(movementEnd?.y??0)-(player.prevPos?.y??movementEnd?.y??0);
  const speed=Math.hypot(dx,dy)/C5A2_SIM_STEP_SEC,velocityUnitsPerSec=Number(speed.toFixed(4));
  const locomotion=player.dead?"death":velocityUnitsPerSec<=C5A2_LOCOMOTION.idleMax?"idle":velocityUnitsPerSec<C5A2_LOCOMOTION.runMin?"walk":"run";
  return{velocityUnitsPerSec,velocity:{x:Number((dx/C5A2_SIM_STEP_SEC).toFixed(4)),y:Number((dy/C5A2_SIM_STEP_SEC).toFixed(4))},locomotion};
}
const C5A1_REACTION_MODEL=Object.freeze({
  baseMs:180,
  reflexMs:2.8,
  distanceMs:2.1,
  focusMs:1.2,
  sniperHandlingMs:55,
  lowConfidenceFloor:0.56,
  simTickMs:C5A2_SIM_STEP_MS,
});
function c5a1ReactionProfile(player,distance,gun){
  const reflex=persStat(player,"rxn"),focus=persStat(player,"foc");
  const cls=GUNS[gun]?.cls;
  const delay=C5A1_REACTION_MODEL.baseMs
    +(99-reflex)*C5A1_REACTION_MODEL.reflexMs
    +Math.max(0,distance-18)*C5A1_REACTION_MODEL.distanceMs
    +(80-focus)*C5A1_REACTION_MODEL.focusMs
    +(cls==="狙擊"?C5A1_REACTION_MODEL.sniperHandlingMs:0);
  const confidence=clamp(
    C5A1_REACTION_MODEL.lowConfidenceFloor
      +reflex/260
      +focus/420
      +clamp(1-distance/55,0,1)*0.12,
    C5A1_REACTION_MODEL.lowConfidenceFloor,
    0.97,
  );
  return{delayMs:Math.round(clamp(delay,160,680)),confidence};
}
const C5A2_GUN_FAMILY_BY_ID=Object.freeze({
  glock:"pistol",usp:"pistol",p250:"pistol",tec9:"pistol",deagle:"pistol",
  mp9:"smg",mac10:"smg",ump:"smg",p90:"smg",
  ak:"rifle",m4:"rifle",m4a4:"rifle",galil:"rifle",famas:"rifle",aug:"rifle",sg:"rifle",
  awp:"sniper",scout:"sniper",
  nova:"shotgun",xm1014:"shotgun",mag7:"shotgun",sawedoff:"shotgun",
});
function c5a1WeaponFamily(gun){
  if(C5A2_GUN_FAMILY_BY_ID[gun])return C5A2_GUN_FAMILY_BY_ID[gun];
  const cls=GUNS[gun]?.cls;
  return cls==="手槍"?"pistol":cls==="衝鋒"?"smg":cls==="狙擊"?"sniper":cls==="霰彈"?"shotgun":"rifle";
}
const C5A2_WEAPON_AUTHORITY=Object.freeze({
  pistol:{range:38,accuracy:1.00,fireMode:"single",triggerIntervalMs:500,maxShotsPerTrigger:1},
  smg:{range:42,accuracy:0.96,fireMode:"automatic",triggerIntervalMs:0,maxShotsPerTrigger:10},
  rifle:{range:55,accuracy:1.00,fireMode:"automatic",triggerIntervalMs:0,maxShotsPerTrigger:10},
  sniper:{range:88,accuracy:0.94,fireMode:"single",triggerIntervalMs:900,maxShotsPerTrigger:1},
  shotgun:{range:25,accuracy:0.78,fireMode:"single",triggerIntervalMs:500,maxShotsPerTrigger:1},
});
const weaponAuthority=gun=>{const g=GUNS[gun];const family=c5a1WeaponFamily(gun);const profile=C5A2_WEAPON_AUTHORITY[family]||C5A2_WEAPON_AUTHORITY.rifle;return{...profile,family,intervalMs:Math.max(1000/(g?.rof||1),profile.triggerIntervalMs||0),damage:g?.dmg||0,headshot:g?.hs||0,gun};};
const weaponInRange=(d,auth)=>!(d>auth.range);
const ROLE_GUNS={awp:["awp","scout"],igl:["ak","m4","famas"],entry:["ak","galil","m4a4"],rifler:["ak","m4","aug","sg"],support:["ak","m4","ump"],lurker:["ak","m4","p90"]};
const ECO_GUNS=["glock","usp","p250","tec9","deagle","mp9","mac10"];
const shotgunSlot=["nova","xm1014","mag7","sawedoff"];
const AWP_PRIMARY_RIFLE={t:"galil",ct:"famas"};
function c5bFullBuyWeapon(player,{side,money,mapKey,round,tactic,target,scoreDiff=0}={}){
  const legal=(ROLE_GUNS[player.role]||["ak"]).filter(g=>side==="t"?g!=="m4"&&g!=="m4a4":g!=="ak");
  const closeMap=mapKey==="inferno"||target==="b"||tactic?.type==="rush";
  const focus=persStat(player,"foc"),accuracy=persStat(player,"acc"),positioning=persStat(player,"pos");
  const sniperScore=focus+accuracy+positioning+(player.role==="awp"?36:0)+(target==="mid"?10:0)+(scoreDiff<0?8:0);
  const sniperRoll=hsh(`${mapKey}:${round}:${player.id}:sniper`)%100;
  const premiumAwp=player.role==="awp"&&ovr(player)>=90;
  // Keep the existing C5B AWP selection authority intact. The formal
  // role-wide correction is applied at the round eco fallback below, where
  // personal money decides whether this same authority is consulted.
  if(money>=COST.awp&&sniperScore>=245&&(premiumAwp||(player.role==="awp"?sniperRoll<70:sniperRoll<12)))return"awp";
  if(money>=COST.scout&&sniperScore>=220&&sniperRoll<(player.role==="awp"?86:20))return"scout";
  // A premium AWP slot keeps a side-legal rifle fallback before the existing
  // situational shotgun/SMG branches; standard C5B AWP behavior is unchanged.
  if(premiumAwp){
    const rifle=AWP_PRIMARY_RIFLE[side];
    if(rifle&&money>=COST[rifle])return rifle;
  }
  const shotgunRoll=hsh(`${mapKey}:${round}:${player.id}:shotgun`)%100;
  const shotgunThreshold=closeMap?14:6;
  if(money>=COST.nova&&shotgunRoll<shotgunThreshold){
    const shotguns=shotgunSlot.filter(g=>COST[g]<=money);
    if(shotguns.length)return shotguns[hsh(`${player.id}:${round}:${mapKey}:shotgun-model`)%shotguns.length];
  }
  const smgRoll=hsh(`${mapKey}:${round}:${player.id}:smg`)%100;
  const smgThreshold=closeMap?20:9;
  if(smgRoll<smgThreshold){
    const smgs=["mp9","mac10","ump","p90"].filter(g=>COST[g]<=money);
    if(smgs.length)return smgs[hsh(`${mapKey}:${round}:${player.id}:smg-model`)%smgs.length];
  }
  const preferred=legal.slice().sort((a,b)=>{
    const aScore=(a==="ak"||a==="m4"||a==="m4a4"?4:0)+(a==="galil"||a==="famas"?2:0)+(a==="aug"||a==="sg"?positioning/40:0);
    const bScore=(b==="ak"||b==="m4"||b==="m4a4"?4:0)+(b==="galil"||b==="famas"?2:0)+(b==="aug"||b==="sg"?positioning/40:0);
    return bScore-aScore;
  });
  const fallbackPool=premiumAwp
    ?(side==="t"?["galil","mp9","mac10","ump","p90"]:["famas","mp9","mac10","ump","p90"])
    :["galil","famas","mp9","tec9"];
  return preferred.find(g=>(COST[g]??2700)<=money)||fallbackPool.find(g=>(COST[g]??0)<=money)||null;
}
// 武器價格與擊殺獎勵（仿 CS 經濟）
const COST={ak:2700,m4:2900,m4a4:3100,galil:1800,famas:2050,aug:3300,sg:3000,awp:4750,scout:1700,mp9:1250,mac10:1050,ump:1200,p90:2350,deagle:700,glock:0,usp:0,p250:300,tec9:500,nova:1050,xm1014:2000,mag7:1300,sawedoff:1100};
const killReward=gun=>{const g=GUNS[gun];if(!g)return 300;if(gun==="awp")return 100;if(g.cls==="衝鋒")return 600;return 300;};
const ROLE_ZH={igl:"指揮",awp:"狙擊",rifler:"步槍",entry:"突破",support:"輔助",lurker:"埋伏"};
const STATE_ZH={BUY:"購買",ROTATE:"轉移",EXECUTE:"執行",HOLD:"駐守",架槍:"架槍",RETAKE:"回防",ANCHOR:"鎮守",ENGAGE:"交火",安裝中:"安裝中"};
const NAVIGATION_STABLE_STATES=Object.freeze(["ENGAGE","HOLD","COVER","POST_PLANT","ANCHOR","撤退"]);
const stZh=s=>STATE_ZH[s]||s;
const buyZh=b=>({pistol:"手槍局",eco:"省槍",force:"強起",full:"全買"}[b]||"—");

const TACTICS_DB={
  dust2:{
    t:[
      {id:"t_long",name:"A 長衝",type:"execute",site:"a",desc:"長道架槍快攻 A",routes:{entry:["tSpawn","longEntry","long","longCorner","aRamp","aSite"],awp:["tSpawn","longEntry","long","longCorner","aRamp","aSite"],rifler:["tSpawn","longEntry","long","aRamp","aSite"],support:["tSpawn","longEntry","catwalk","shortA","aSite"],lurker:["tSpawn","mid","midDoors","catwalk"]},smokes:["aSite","longCorner"],mollys:["pit"]},
      {id:"t_bsplit",name:"B 隧道執行",type:"execute",site:"b",desc:"隧道煙包夾 B",routes:{entry:["tSpawn","lower","bTunnel","bSite"],awp:["tSpawn","mid","midDoors","bDoors","bSite"],rifler:["tSpawn","lower","bTunnel","bDoors","bSite"],support:["tSpawn","lower","bTunnel","bSite"],lurker:["tSpawn","mid","xbox"]},smokes:["bSite","bTunnel"],mollys:["bSite"]},
      {id:"t_midctrl",name:"中路控制",type:"default",site:"mid",desc:"先拿中路再轉點",routes:{entry:["tSpawn","mid","midDoors","catwalk"],awp:["tSpawn","mid","midDoors"],rifler:["tSpawn","mid","xbox"],support:["tSpawn","mid","catwalk","shortA"],lurker:["tSpawn","lower","bTunnel"]},smokes:["mid","catwalk"],mollys:[]},
      {id:"t_rush",name:"全員 B 衝",type:"rush",site:"b",desc:"無煙快速壓制",routes:{entry:["tSpawn","lower","bTunnel","bSite"],awp:["tSpawn","lower","bTunnel","bDoors","bSite"],rifler:["tSpawn","lower","bTunnel","bDoors","bSite"],support:["tSpawn","lower","bTunnel","bSite"],lurker:["tSpawn","lower","bDoors","bSite"]},smokes:[],mollys:[]},
    ],
    ct:[
      {id:"c_std",name:"標準 2-1-2",type:"default",site:"a",desc:"雙線防守留中路",routes:{igl:["ctSpawn","ctMid","catwalk"],awp:["ctSpawn","ctMid","mid"],rifler:["ctSpawn","aRamp","aSite"],entry:["ctSpawn","ctMid","bDoors"],support:["ctSpawn","bDoors","bSite"]},smokes:[]},
      {id:"c_astack",name:"A 點堆人",type:"stack",site:"a",desc:"預判 A 集火",routes:{igl:["ctSpawn","aSite"],awp:["ctSpawn","aRamp"],rifler:["ctSpawn","aSite","pit"],entry:["ctSpawn","aSite"],support:["ctSpawn","catwalk"]},smokes:[]},
      {id:"c_bstack",name:"B 點堆人",type:"stack",site:"b",desc:"預判 B 集火",routes:{igl:["ctSpawn","bSite"],awp:["ctSpawn","mid"],rifler:["ctSpawn","bSite"],entry:["ctSpawn","bTunnel","bSite"],support:["ctSpawn","bSite"]},smokes:[]},
      {id:"c_aggro",name:"中路前壓",type:"aggro",site:"mid",desc:"搶中路資訊",routes:{igl:["ctSpawn","mid"],awp:["ctSpawn","mid","midDoors"],rifler:["ctSpawn","catwalk"],entry:["ctSpawn","aSite"],support:["ctSpawn","bSite"]},smokes:[]},
    ],
  },
  mirage:{
    t:[
      {id:"t_apalace",name:"A 跳台執行",type:"execute",site:"a",desc:"跳台坡道夾擊",routes:{entry:["tSpawn","palace","aSite"],awp:["tSpawn","ramp","aRamp","aSite"],rifler:["tSpawn","ramp","aSite"],support:["tSpawn","palace","aSite"],lurker:["tSpawn","mid","topMid"]},smokes:["aSite","window"],mollys:[]},
      {id:"t_bapps",name:"B 公寓快攻",type:"execute",site:"b",desc:"公寓煙快下 B",routes:{entry:["tSpawn","apps","bSite"],awp:["tSpawn","mid","connector","bSite"],rifler:["tSpawn","apps","bSite"],support:["tSpawn","apps","bSite"],lurker:["tSpawn","mid","connector"]},smokes:["bSite","apps"],mollys:["bSite"]},
      {id:"t_midsplit",name:"中路分推 A",type:"execute",site:"a",desc:"中門坡道分推",routes:{entry:["tSpawn","mid","topMid","aSite"],awp:["tSpawn","mid","window","aRamp","aSite"],rifler:["tSpawn","ramp","aSite"],support:["tSpawn","mid"],lurker:["tSpawn","palace"]},smokes:["window","aSite"],mollys:[]},
    ],
    ct:[
      {id:"c_std",name:"標準防守",type:"default",site:"a",desc:"中路架槍雙線",routes:{igl:["ctSpawn","aSite"],awp:["ctSpawn","window","mid"],rifler:["ctSpawn","aSite","ramp"],entry:["ctSpawn","connector","bSite"],support:["ctSpawn","apps","bSite"]},smokes:[]},
      {id:"c_window",name:"窗口控制",type:"aggro",site:"mid",desc:"窗口中路壓制",routes:{igl:["ctSpawn","window"],awp:["ctSpawn","window","mid"],rifler:["ctSpawn","mid","topMid"],entry:["ctSpawn","aSite"],support:["ctSpawn","bSite"]},smokes:[]},
      {id:"c_bstack",name:"B 公寓堆人",type:"stack",site:"b",desc:"公寓口封鎖",routes:{igl:["ctSpawn","bSite"],awp:["ctSpawn","mid"],rifler:["ctSpawn","apps"],entry:["ctSpawn","connector","bSite"],support:["ctSpawn","bSite"]},smokes:[]},
    ],
  },
  inferno:{
    t:[
      {id:"t_banana",name:"香蕉道強攻",type:"execute",site:"b",desc:"火力封香蕉拿 B",routes:{entry:["tSpawn","tRamp","banana","car","bSite"],awp:["tSpawn","tRamp","banana","car","bSite"],rifler:["tSpawn","tRamp","banana","car","bSite"],support:["tSpawn","apps","boiler","mid"],lurker:["tSpawn","mid","sewer"]},smokes:["bSite","banana"],mollys:["banana"]},
      {id:"t_aexec",name:"A 連接執行",type:"execute",site:"a",desc:"中路連接夾擊 A",routes:{entry:["tSpawn","tRamp","mid","secondMid","aConn","aSite"],awp:["tSpawn","tRamp","mid","secondMid","aConn","aSite"],rifler:["tSpawn","apps","boiler","mid","aConn","aSite"],support:["tSpawn","apps","boiler","mid","aConn","aSite"],lurker:["tSpawn","tRamp","banana"]},smokes:["aSite","arch"],mollys:["pit"]},
      {id:"t_midctrl",name:"中路控制",type:"default",site:"a",desc:"先拿中路再轉點",routes:{entry:["tSpawn","tRamp","mid","secondMid","aConn","aSite"],awp:["tSpawn","tRamp","mid","aConn","aSite"],rifler:["tSpawn","tRamp","banana","car"],support:["tSpawn","apps","boiler","mid"],lurker:["tSpawn","mid","sewer"]},smokes:["mid","aConn"],mollys:[]},
    ],
    ct:[
      {id:"c_std",name:"標準防守",type:"default",site:"a",desc:"A 留守 B 鏈接",routes:{igl:["ctSpawn","arch","aConn"],awp:["ctSpawn","library","libIn"],rifler:["ctSpawn","aRamp","aSite"],entry:["ctSpawn","arch","secondMid","mid"],support:["ctSpawn","bTop","bSite"]},smokes:[]},
      {id:"c_astack",name:"A 點堆人",type:"stack",site:"a",desc:"預判 A 集火",routes:{igl:["ctSpawn","aSite","pit"],awp:["ctSpawn","library","aSite"],rifler:["ctSpawn","aRamp","aSite"],entry:["ctSpawn","arch","aConn"],support:["ctSpawn","arch","aConn","mid"]},smokes:[]},
      {id:"c_btop",name:"B 頂前壓",type:"aggro",site:"b",desc:"頂部封鎖 B",routes:{igl:["ctSpawn","arch","aConn"],awp:["ctSpawn","aRamp","aSite"],rifler:["ctSpawn","bTop","bSite"],entry:["ctSpawn","arch","secondMid","mid"],support:["ctSpawn","bTop","bSite"]},smokes:[]},
    ],
  },
};
// A team's selected tactic is a stable strategy owner, but its route schema is
// side-specific. Project the owner's strategic intent onto the current-side
// library at the half/OT boundary so CT never receives T-only route nodes (or
// vice versa). The projection is deterministic and does not add a balance
// modifier or a second tactic authority.
function projectCsTacticToSide(ownerTactic,{mapKey,side,phase="opening"}={}){
  const library=TACTICS_DB[mapKey]?.[side]||[];
  if(!ownerTactic||!library.length)return ownerTactic;
  const exact=library.find(candidate=>candidate.id===ownerTactic.id);
  if(exact)return exact;
  const sameSiteType=library.filter(candidate=>candidate.site===ownerTactic.site&&candidate.type===ownerTactic.type);
  const sameType=library.filter(candidate=>candidate.type===ownerTactic.type);
  const sameSite=library.filter(candidate=>candidate.site===ownerTactic.site);
  const pool=sameSiteType.length?sameSiteType:sameType.length?sameType:sameSite.length?sameSite:library;
  return pool[hsh(`${mapKey}:${side}:${phase}:${ownerTactic.id||ownerTactic.name||ownerTactic.type||"tactic"}`)%pool.length]||pool[0];
}
const CS_TACTICAL_PHASES=Object.freeze({OPENING:"opening",MID_ROUND:"mid-round",LATE_ROUND:"late-round",POST_PLANT:"post-plant"});
const CS_PREMATCH_PHASE_KEYS=Object.freeze([CS_TACTICAL_PHASES.OPENING,CS_TACTICAL_PHASES.MID_ROUND,CS_TACTICAL_PHASES.LATE_ROUND,CS_TACTICAL_PHASES.POST_PLANT]);
const CS_TACTICAL_CONTROL_KEYS=Object.freeze(["mid","midDoors","topMid","catwalk","connector","secondMid","banana","bTunnel","long","shortA","aConn","bTop","apps","palace"]);
function tacticalPhaseFor(sec,planted){
  if(planted)return CS_TACTICAL_PHASES.POST_PLANT;
  if(sec<26)return CS_TACTICAL_PHASES.OPENING;
  if(sec<70)return CS_TACTICAL_PHASES.MID_ROUND;
  return CS_TACTICAL_PHASES.LATE_ROUND;
}
function normalizeCsTacticalLayout(input,library,fallback){
  const source=input&&typeof input==="object"?input:{};
  const rawPhases=source.phases&&typeof source.phases==="object"?source.phases:source;
  const rawFor=phase=>rawPhases[phase]??(phase===CS_TACTICAL_PHASES.MID_ROUND?rawPhases.mid:phase===CS_TACTICAL_PHASES.LATE_ROUND?rawPhases.late:phase===CS_TACTICAL_PHASES.POST_PLANT?rawPhases.postPlant:rawPhases.opening);
  const fallbackTactic=fallback||library[0]||null;
  const resolve=(phase,raw)=>{
    const selectionId=typeof raw==="string"?raw:raw?.id??raw?.tacticId??null;
    const selectionType=typeof raw==="object"?raw?.type??raw?.tacticType:null;
    const exact=selectionId&&library.find(t=>t.id===selectionId||t.name===selectionId);
    const typed=selectionType?library.filter(t=>t.type===selectionType):[];
    const tactic=exact||typed[(hsh(`${selectionId||phase}:${selectionType||""}`)%(typed.length||1))]||fallbackTactic;
    return{phase,selectionId:selectionId||tactic?.id||null,selectionType:selectionType||tactic?.type||"default",tactic};
  };
  const phases=Object.fromEntries(CS_PREMATCH_PHASE_KEYS.map(phase=>[phase,resolve(phase,rawFor(phase))]));
  const openness=["structured","adaptive","open"].includes(source.openness)?source.openness:"adaptive";
  const requestedPostPlantMode=source.postPlantMode??source.postPlant?.mode;
  const postPlantMode=["hold-angle","crossfire","deny-defuse"].includes(requestedPostPlantMode)?requestedPostPlantMode:"hold-angle";
  return{version:1,openness,postPlantMode,phases};
}
function tacticalControlSnapshot(players,side,N){
  const alive=(players||[]).filter(p=>!p.dead&&p.side===side);
  const keys=CS_TACTICAL_CONTROL_KEYS.filter(key=>N?.[key]);
  const controlled=keys.filter(key=>alive.some(p=>dist(p.pos,N[key])<=10));
  const siteControl={a:0,b:0};
  ["a","b"].forEach(site=>{const node=N?.[`${site}Site`];if(node)siteControl[site]=alive.filter(p=>dist(p.pos,node)<=14).length;});
  return{controlledKeys:controlled,controlledCount:controlled.length,totalKeys:keys.length,ratio:keys.length?controlled.length/keys.length:0,siteControl,survival:alive.length};
}
function tacticalWeaponMix(players,side){
  const mix={pistol:0,smg:0,rifle:0,sniper:0,shotgun:0,unknown:0};
  (players||[]).filter(p=>!p.dead&&p.side===side).forEach(p=>{const family=c5a1WeaponFamily(p.gun);mix[family]=(mix[family]||0)+1;});
  return mix;
}
function chooseRoundTacticalSite(tactic,{round=0,scoreFor=0,scoreAgainst=0,buyType="eco",previousControl=0}={}){
  const preferred=tactic?.site==="a"||tactic?.site==="b"?tactic.site:(round%2===0?"a":"b");
  if(tactic?.site==="a"||tactic?.site==="b")return preferred;
  const pressure=scoreFor<scoreAgainst?2:scoreFor>scoreAgainst?-1:0;
  const economy=buyType==="eco"||buyType==="pistol"?2:0;
  const controlBias=previousControl>0.55?-1:previousControl<0.25?1:0;
  const alternateWeight=Math.max(0,3+pressure+economy+controlBias);
  return hsh(`${tactic?.id||"tactic"}:${round}:${scoreFor}:${scoreAgainst}:${buyType}`)%10<alternateWeight?preferred==="a"?"b":"a":preferred;
}
function weightedTacticalPick(candidates,key){
  const total=candidates.reduce((sum,candidate)=>sum+Math.max(1,Number(candidate.weight)||1),0);
  if(!total)return candidates[0]||null;
  let cursor=hsh(key)%total;
  for(const candidate of candidates){cursor-=Math.max(1,Number(candidate.weight)||1);if(cursor<0)return candidate;}
  return candidates.at(-1)||null;
}
function tacticalRoutePlan({player,tactic,routeLibrary=[],RKF={},context={},round=0,mapKey=""}){
  const routes=tactic?.routes||{};
  const openness=context.openness||"adaptive";
  const spawnKey=player?.side==="ct"?"ctSpawn":"tSpawn";
  const fallback=routes[RKF[player.role]]||routes.rifler||routes.entry||Object.values(routes).find(Array.isArray)||[spawnKey];
  const candidates=[];const seen=new Set();
  const add=(kind,keys,weight)=>{
    if(!Array.isArray(keys)||keys.length<2)return;
    const normalized=keys.filter(Boolean);if(normalized.length<2)return;
    const signature=normalized.join(">");if(seen.has(signature))return;seen.add(signature);candidates.push({kind,keys:normalized,weight});
  };
  add("primary",routes[player.role]||fallback,openness==="structured"?8:6);
  for(const other of routeLibrary){
    const keys=other?.routes?.[player.role]||other?.routes?.[RKF[player.role]]||other?.routes?.rifler||other?.routes?.entry;
    const sameSite=!context.target||other?.site===context.target;
    const hasControl=keys?.some(key=>CS_TACTICAL_CONTROL_KEYS.includes(key));
    if(sameSite&&hasControl)add("control",keys,context.phase===CS_TACTICAL_PHASES.OPENING?4:context.controlRatio<0.45?6:2);
    if(sameSite&&keys?.some(key=>key===`${context.target}Site`))add("site-execute",keys,context.phase===CS_TACTICAL_PHASES.LATE_ROUND?8:context.controlRatio>=0.45?5:2);
    // 開放布局增加同一目標的可行路線權重；跨站點轉移仍須由 mid-round
    // 的 map-control 判斷觸發，避免把 CT 架槍路線誤變成跨牆直奔另一點。
    if(!sameSite&&context.phase===CS_TACTICAL_PHASES.MID_ROUND&&hasControl)add("rotate",keys,context.scoreDiff<0||context.survival<=3?4:1);
  }
  const selected=weightedTacticalPick(candidates,`${mapKey}:${round}:${player.id}:${player.side}:${context.phase}:${context.target}:${context.scoreDiff}:${context.buyType}:${context.survival}:${Math.round((context.controlRatio||0)*100)}:${context.replanOrdinal||0}`)||{kind:"fallback",keys:fallback,weight:1};
  return{...selected,phase:context.phase||CS_TACTICAL_PHASES.OPENING,target:context.target||null,scoreDiff:Number(context.scoreDiff||0),buyType:context.buyType||"unknown",survival:Number(context.survival||0),controlRatio:Number((context.controlRatio||0).toFixed(3)),weaponMix:context.weaponMix||{},objective:context.phase===CS_TACTICAL_PHASES.POST_PLANT?(player.side==="ct"?"retake":"post-plant-hold"):context.phase===CS_TACTICAL_PHASES.OPENING?"opening":context.phase===CS_TACTICAL_PHASES.MID_ROUND?"mid-round":"late-round"};
}
function tacticalPostPlantAnchor(player,tactic,N,target,mode="hold-angle"){
  const keys=tactic?.routes?.[player.role]||tactic?.routes?.rifler||tactic?.routes?.entry||[];
  const offset=mode==="crossfire"?-3:mode==="deny-defuse"?-1:-2;
  const anchorKey=keys[Math.max(0,keys.length+offset)]||keys.find(key=>key===`${target}Site`)||`${target}Site`;
  const anchor=N?.[anchorKey]||N?.[`${target}Site`];
  return anchor?{...anchor}:null;
}
function csAngleDelta(a,b){return Math.abs(((Number(a)-Number(b)+540)%360)-180);}
function csTargetInFov(actor,target,halfFov=82){
  if(!actor||!target)return false;
  const bearing=Math.atan2(target.pos.y-actor.pos.y,target.pos.x-actor.pos.x)*180/Math.PI;
  return csAngleDelta(actor.va??0,bearing)<=halfFov;
}
function csFlankGeometry(actor,target){
  if(!actor||!target)return false;
  const bearing=Math.atan2(actor.pos.y-target.pos.y,actor.pos.x-target.pos.x)*180/Math.PI;
  return csAngleDelta(target.va??0,bearing)>=112;
}
function csEngagementPermission(actor,target,distance,auth,{lineOfSight=false,fov=false,smokeBlocked=false}={}){
  return Boolean(actor&&!actor.dead&&target&&!target.dead&&lineOfSight&&fov&&!smokeBlocked&&weaponInRange(distance,auth));
}
const TAC_TYPE={execute:{label:"執行",color:"#ef4444"},default:{label:"標準",color:"#5b7fb0"},stack:{label:"堆人",color:"#fbbf24"},aggro:{label:"前壓",color:"#f59e0b"},retake:{label:"回防",color:"#a78bfa"},rush:{label:"強攻",color:"#ec4899"}};

// ─── 模擬引擎（資料/策略核心；已修正曳光彈生命週期）─────────────────────
const CS_TEAM_US="us",CS_TEAM_ENEMY="enemy";
const CS_REGULATION_ROUNDS_PER_HALF=12;
const CS_REGULATION_ROUNDS=CS_REGULATION_ROUNDS_PER_HALF*2;
const CS_REGULATION_WIN_SCORE=13;
const CS_REGULATION_START_MONEY=800;
const CS_OT_GROUP_ROUNDS=6;
const CS_OT_HALF_ROUNDS=3;
const CS_OT_GROUP_WIN_ROUNDS=4;
const CS_OT_START_MONEY=12500;

function csEconomyResetMoney(reason){return reason?.startsWith("ot-group-")?CS_OT_START_MONEY:CS_REGULATION_START_MONEY;}
function csIsPistolReset(reason){return reason==="match-start"||reason==="halftime";}

function csRosterTeamId(player){
  return player?.teamId??player?.teamIdentity??(player?.side==="t"?CS_TEAM_US:CS_TEAM_ENEMY);
}
function csTeamAtSide(sideByTeam,side){return sideByTeam[CS_TEAM_US]===side?CS_TEAM_US:CS_TEAM_ENEMY;}
function cloneCsSides(sideByTeam){return{[CS_TEAM_US]:sideByTeam[CS_TEAM_US],[CS_TEAM_ENEMY]:sideByTeam[CS_TEAM_ENEMY]};}
function swapCsSides(state,reason,afterRound){
  const before=cloneCsSides(state.currentSideByTeam);
  state.currentSideByTeam={
    [CS_TEAM_US]:before[CS_TEAM_US]==="t"?"ct":"t",
    [CS_TEAM_ENEMY]:before[CS_TEAM_ENEMY]==="t"?"ct":"t",
  };
  state.sideChanges.push({reason,afterRound,before,after:cloneCsSides(state.currentSideByTeam)});
}
function createCsRuleState(){
  return{
    phase:"regulation",roundsPlayed:0,regulationRounds:0,otGroup:0,otRound:0,
    score:{[CS_TEAM_US]:0,[CS_TEAM_ENEMY]:0},
    otScore:{[CS_TEAM_US]:0,[CS_TEAM_ENEMY]:0},
    currentSideByTeam:{[CS_TEAM_US]:"t",[CS_TEAM_ENEMY]:"ct"},
    completed:false,winner:null,halftimeApplied:false,pendingEconomyReset:"match-start",
    sideChanges:[],economyResets:[],
  };
}
function beginCsRound(state){
  if(state.completed)return{legal:false};
  if(state.phase==="regulation"&&state.regulationRounds===CS_REGULATION_ROUNDS_PER_HALF&&!state.halftimeApplied){
    swapCsSides(state,"halftime",state.regulationRounds);
    state.halftimeApplied=true;state.pendingEconomyReset="halftime";
  }
  if(state.phase==="regulation"&&state.regulationRounds===CS_REGULATION_ROUNDS){
    state.phase="overtime";state.otGroup=1;state.otRound=0;
    state.otScore={[CS_TEAM_US]:0,[CS_TEAM_ENEMY]:0};state.pendingEconomyReset="ot-group-1";
  }
  const economyResetReason=state.pendingEconomyReset;state.pendingEconomyReset=null;
  const roundInPhase=state.phase==="regulation"?state.regulationRounds+1:state.otRound+1;
  const roundInHalf=state.phase==="regulation"
    ?(state.regulationRounds%CS_REGULATION_ROUNDS_PER_HALF)+1
    :(state.otRound%CS_OT_HALF_ROUNDS)+1;
  const half=state.phase==="regulation"
    ?(state.regulationRounds<CS_REGULATION_ROUNDS_PER_HALF?"first":"second")
    :(state.otRound<CS_OT_HALF_ROUNDS?"first":"second");
  if(economyResetReason)state.economyResets.push({reason:economyResetReason,round:state.roundsPlayed+1,phase:state.phase,otGroup:state.otGroup,currentSideByTeam:cloneCsSides(state.currentSideByTeam)});
  return{
    legal:true,phase:state.phase,half,roundInPhase,roundInHalf,otGroup:state.otGroup,
    currentSideByTeam:cloneCsSides(state.currentSideByTeam),economyResetReason,
  };
}
function finishCsRound(state,winnerTeam){
  if(![CS_TEAM_US,CS_TEAM_ENEMY].includes(winnerTeam))throw new Error(`CS winner team 無效：${winnerTeam}`);
  if(state.completed)throw new Error("CS match 已完成，不能再結算回合");
  state.roundsPlayed++;
  state.score[winnerTeam]++;
  if(state.phase==="regulation"){
    state.regulationRounds++;
    if(state.score[winnerTeam]>=CS_REGULATION_WIN_SCORE){state.completed=true;state.winner=winnerTeam;}
    return state;
  }
  state.otRound++;state.otScore[winnerTeam]++;
  if(state.otRound%CS_OT_HALF_ROUNDS===0)swapCsSides(state,"overtime-side-swap",state.roundsPlayed);
  if(state.otScore[winnerTeam]>=CS_OT_GROUP_WIN_ROUNDS){state.completed=true;state.winner=winnerTeam;return state;}
  if(state.otRound>=CS_OT_GROUP_ROUNDS){
    if(state.otScore[CS_TEAM_US]!==state.otScore[CS_TEAM_ENEMY])throw new Error("CS OT group 非平手卻未完成");
    state.otGroup++;state.otRound=0;state.otScore={[CS_TEAM_US]:0,[CS_TEAM_ENEMY]:0};state.pendingEconomyReset=`ot-group-${state.otGroup}`;
  }
  return state;
}

function centeredSolidObstacle(x,y,width,depth,kind,angle=0){
  const c=Math.abs(Math.cos(angle||0)),s=Math.abs(Math.sin(angle||0));
  const w=width*c+depth*s,h=width*s+depth*c;
  return{x:x-w/2,y:y-h/2,w,h,hgt:kind==="building"?5:2,deco:kind!=="building",kind};
}
function c5a2SolidObstacles(map){
  const obstacles=(map.walls||[]).map(w=>({...w,kind:"building"}));
  (map.crates||[]).forEach(crate=>obstacles.push(centeredSolidObstacle(crate.x,crate.y,2.7,2.7,"crate")));
  (map.props||[]).forEach(prop=>{
    const angle=Number(prop.a)||0;
    if(prop.t==="car")obstacles.push(centeredSolidObstacle(prop.x,prop.y,6,2.9,"car",angle));
    else if(prop.t==="sandbag")obstacles.push(centeredSolidObstacle(prop.x,prop.y,3.4,1.9,"sandbag",angle));
    else if(prop.t==="barrel")obstacles.push(centeredSolidObstacle(prop.x,prop.y,2.2,2.2,"barrel"));
    // "plat" is a walkable bomb-site presentation slab, not a blocking prop.
    // Treating it as a 7x7 solid put Inferno A's authoritative destination
    // inside an obstacle and caused an endless replan loop.
    else if(prop.t==="plat")return;
    else obstacles.push(centeredSolidObstacle(prop.x,prop.y,2.7,2.7,"crate",angle));
  });
  // major 房間的工位是真 cover：同一 bounds 服務導航、角色 separation、
  // LOS 與呈現；legacy rooms 沒有 fixtures，保留原輸出與搜尋順序。
  for(const room of map.rooms||[])for(const fixture of room.fixtures||[]){
    obstacles.push({...fixture,roomId:room.id,kind:"room-fixture",deco:true});
  }
  return obstacles;
}

function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,tacticalLayoutInput=null,sceneVersion="major.v1"){
  const RS=(roster||ROSTER).map(c=>({...c})); // 可注入即時名單（複製後套用每回合 currentSide，不回寫輸入）
  const originalTacticCT=tacticCT;
  const map=(sceneVersion==="legacy"?FPS_LEGACY_MAPS:MAPS)[mapKey];const rand=mkRng(seed);
  const preMatchLayout=normalizeCsTacticalLayout(tacticalLayoutInput,TACTICS_DB[mapKey]?.t||[],tacticT);
  const preMatchTacticForPhase=phase=>preMatchLayout.phases[phase]?.tactic||tacticT;
  // Keep one deterministic stream for the whole authoritative match. C5A.1
  // split combat RNG from route/economy RNG, which created a repeating 3:3
  // overtime cycle for some tactics and could materialize hundreds of OT
  // groups. The fire clock is temporal bookkeeping; it must not change the
  // established round-outcome distribution.
  const combatRand=rand;
  // 這份清單同時服務路線、移動、角色 separation 與射線；建築和可躲藏的
  // 木箱／油桶／沙包都是正式實體，只有可行走的 site 平台保留為展示物。
  const walls=c5a2SolidObstacles(map);
  // 把節點與出生點校正到可走區域（避免路線指向牆內導致卡牆）
  const N={};for(const k in map.nodes)N[k]=snapOut(map.nodes[k],walls,PLAYER_R);
  const SPAWN={ct:snapOut(map.spawns.ct,walls,PLAYER_R),t:snapOut(map.spawns.t,walls,PLAYER_R)};
  const spawnPointFor=player=>SPAWN[player?.side==="ct"?"ct":"t"];
  const SPAWN_ANCHOR_EPSILON=4.5;
  const callouts=map.callouts||[];
  const routeMemo=new Map();
  const segmentCache=sceneVersion==="legacy"?null:createFpsMajorSegmentCache(walls,PLAYER_R);
  const navigableRoute=points=>buildNavigableRoute(points,walls,PLAYER_R,routeMemo,segmentCache);
  const nearCO=pos=>{let best=null,bd=1e9;for(const c of callouts){const d=Math.hypot(c.x-pos.x,c.y-pos.y);if(d<bd){bd=d;best=c;}}return best?best.l:(pos.x<35?"左路":pos.x>65?"右路":"中路");};
  const frames=[],highlights=[],roundHist=[];
  // C5A.1：只記錄 authoritative simulation 已觀察到的反應鏈，不參與勝負、
  // 傷害或射速計算。每個 visibility episode 只產生一筆 first-shot sample，
  // 讓 target visible → acquired → permission → shot 可以用真實 sim time 對照。
  const reactionTelemetry=[];
  const shotCadenceTelemetry=[];
  const obstacleCounts=walls.reduce((counts,wall)=>{counts[wall.kind||"building"]=(counts[wall.kind||"building"]||0)+1;return counts;},{});
  const routeLibraryBySide={t:TACTICS_DB[mapKey]?.t||[],ct:TACTICS_DB[mapKey]?.ct||[]};
  const navigationAudit={solidObstacleCount:walls.length,obstacleCounts,obstacles:walls.map(({x,y,w,h,kind})=>({x,y,w,h,kind})),replanCount:0,stuckDetections:0,stuckResolved:0,replanAbortedByRoundEnd:0,routeAssignments:0,waypointTransitions:0,routeDeadlocks:0,illegalWallCrossings:0,spawnAnchorViolations:0,routeHistory:[],waypointHistory:[],stuckEpisodes:[],replanHistory:[],routeBuilds:[],spawnDistanceRegressions:[],returnToSpawnEvents:[],maxStuckDurationSec:0,unresolvedStuckEpisodes:0};
  const tacticalAudit={phases:Object.fromEntries(Object.values(CS_TACTICAL_PHASES).map(phase=>[phase,0])),preMatchLayout:{version:preMatchLayout.version,openness:preMatchLayout.openness,postPlantMode:preMatchLayout.postPlantMode,phases:Object.fromEntries(CS_PREMATCH_PHASE_KEYS.map(phase=>{const entry=preMatchLayout.phases[phase];return[phase,{selectionId:entry.selectionId,tacticId:entry.tactic?.id??null,tacticName:entry.tactic?.name??null,tacticType:entry.tactic?.type??entry.selectionType??null,site:entry.tactic?.site??null}];}))},phaseSelections:[],decisions:[],routeVariants:{},targetChanges:[],mapControlSamples:[]};
  const buyAudit={rounds:[],totalPurchases:0,purchaseCounts:{pistol:0,smg:0,rifle:0,sniper:0,shotgun:0,unknown:0},loadoutCounts:{pistol:0,smg:0,rifle:0,sniper:0,shotgun:0,unknown:0},spendByFamily:{pistol:0,smg:0,rifle:0,sniper:0,shotgun:0,unknown:0}};
  const bombAudit={plantEvents:[],timerSamples:0,objectiveTransitions:[],retakeAssignments:0,coverAssignments:0,defuseEvents:[],explosionEvents:[],resultLinks:[]};
  const previousTacticalControl={t:0,ct:0};
  const assignRoute=(player,points,meta={})=>{
    const rawIntent=(points||[]).filter(Boolean);
    const spawn=spawnPointFor(player);
    const leadingIntentIsCurrent=Boolean(player?.pos&&rawIntent[0]&&dist(rawIntent[0],player.pos)<=0.75);
    const hasLeadingSpawn=Boolean(!leadingIntentIsCurrent&&rawIntent[0]&&spawn&&dist(rawIntent[0],spawn)<=SPAWN_ANCHOR_EPSILON);
    const intent=meta.allowSpawnAnchor===true||!hasLeadingSpawn?rawIntent:rawIntent.slice(1);
    const routePoints=player?.pos&&(!intent[0]||dist(player.pos,intent[0])>0.75)?[{...player.pos},...intent]:intent;
    const route=navigableRoute(routePoints);
    const routeIndexBefore=Number.isFinite(player.routeIdx)?player.routeIdx:null;
    const routeId=`r${rnd}-${player.id}-${navigationAudit.routeAssignments}`;
    const routeSource=meta.routeSource||meta.kind||meta.variant||"direct";
    const routeRebuildReason=meta.routeRebuildReason||null;
    const spawnSensitiveRebuild=meta.routeRebuildReason==="phase-transition"||meta.routeRebuildReason==="stuck-recovery"||meta.separationRebase===true;
    // A legal detour can briefly pass near spawn (Dust II's lower path is one
    // example). Only call it stale when the rebuilt route still retains the
    // exact leading intent that should have been stripped, rather than using
    // proximity to the spawn as a proxy for route identity.
    const retainsLeadingIntent=Boolean(route[1]&&rawIntent[0]&&dist(route[1],rawIntent[0])<=0.75);
    const staleSpawnAnchor=Boolean(meta.allowSpawnAnchor!==true&&spawnSensitiveRebuild&&retainsLeadingIntent&&spawn&&rawIntent[0]&&dist(rawIntent[0],spawn)<=SPAWN_ANCHOR_EPSILON);
    if(staleSpawnAnchor)navigationAudit.spawnAnchorViolations+=1;
    player.route=route;player.routeIdx=0;player.routeT=0;player._routeProgressKey=null;player._routeBestRemaining=null;player._stuckN=0;
    player._routePlan={...meta,routeId};
    player._lastRouteBuild={routeId,routeSource,routeRebuildReason,routeIndexBefore,routeIndexAfter:player.routeIdx,tactic:player._activeTacticId||null,separationRebase:Boolean(meta.separationRebase),stuckRecovery:Boolean(meta.stuckRecovery),allowSpawnAnchor:meta.allowSpawnAnchor===true,rawLeadingSpawn:hasLeadingSpawn,removedLeadingSpawn:Boolean(hasLeadingSpawn&&meta.allowSpawnAnchor!==true),staleSpawnAnchor};
    navigationAudit.routeAssignments+=1;
    if(navigationAudit.routeBuilds.length<2400)navigationAudit.routeBuilds.push({round:rnd+1,roundSec:meta.roundSec??0,playerId:player.id,routeId,routeSource,routeRebuildReason,tactic:player._activeTacticId||null,routeIndexBefore,routeIndexAfter:player.routeIdx,rawLeadingSpawn:hasLeadingSpawn,removedLeadingSpawn:Boolean(hasLeadingSpawn&&meta.allowSpawnAnchor!==true),separationRebase:Boolean(meta.separationRebase),stuckRecovery:Boolean(meta.stuckRecovery),staleSpawnAnchor,routeStartsAtSpawn:Boolean(route[0]&&spawn&&dist(route[0],spawn)<=SPAWN_ANCHOR_EPSILON),routePoints:route.slice(0,4).map(point=>({x:Number(point.x.toFixed(3)),y:Number(point.y.toFixed(3))}))});
    if(navigationAudit.routeHistory.length<1200)navigationAudit.routeHistory.push({round:rnd,roundSec:meta.roundSec??0,id:player.id,side:player.side,phase:meta.phase||null,variant:meta.kind||meta.variant||"direct",objective:meta.objective||null,routeId:player._routePlan.routeId,routeSignature:meta.routeSignature||null,waypoints:route.length});
    const variant=meta.kind||meta.variant||"direct";tacticalAudit.routeVariants[variant]=(tacticalAudit.routeVariants[variant]||0)+1;
    return route;
  };
  const obstacleContext=(from,to)=>walls.filter(w=>blocked(to,[w],PLAYER_R)||navLineBlocked(from,to,[w])).map(w=>({kind:w.kind||"building",x:w.x,y:w.y,w:w.w,h:w.h}));
  const resolveStuckEpisode=(player,sec)=>{
    const episode=player._activeStuckEpisode;
    if(episode&&episode.status!=="resolved"){
      episode.status="resolved";episode.resolvedAtSec=sec;episode.durationSec=Number((sec-episode.startedAtSec).toFixed(3));
      navigationAudit.maxStuckDurationSec=Math.max(navigationAudit.maxStuckDurationSec,episode.durationSec);
      navigationAudit.stuckResolved+=1;movementAudit.stuckResolved+=1;
    }
    player._activeStuckEpisode=null;player._stuckSinceSec=null;player._awaitingReplanProgress=false;
  };
  const movementAudit={positionSamples:0,nonFinitePositions:0,blockedPositions:0,teleportViolations:0,maxStep:0,wallSegmentCrossings:0,wallCrossingSamples:[],playerSeparationCorrections:0,playerOverlapSamples:0,playerOverlapViolations:0,playerOverlapExamples:[],minPlayerSeparation:null,replanCount:0,stuckDetections:0,stuckResolved:0,replanAbortedByRoundEnd:0,stuckSamples:[],locomotionSamples:{idle:0,walk:0,run:0}};
  const combatAudit={candidatePairs:0,losChecks:0,fovChecks:0,targetAcquisitions:0,targetLocks:0,engagementPermissions:0,fireRolls:0,scheduledSkips:0,shotEvents:0,damageEvents:0,flankCandidates:0,flankEngagements:0,routeBlockedEngagements:0,routeInterruptAcquisitions:0,routeInterruptPermissions:0,routeInterruptFirstShots:0,routeInterruptMovementStops:0};
  const activeReactionEpisodes=new Map();
  let reactionSequence=0;
  const reactionKey=(actor,target)=>`${actor?.id ?? "?"}->${target?.id ?? "?"}`;
  const ensureReactionEpisode=(actor,target,sec,distance,weapon,los,mapAware,fov,flank)=>{
    const key=reactionKey(actor,target);
    let episode=activeReactionEpisodes.get(key);
    if(!episode){
      const weaponId=weapon||actor.gun||null;
      const profile=c5a1ReactionProfile(actor,distance,weaponId);
      const routeActive=Array.isArray(actor.route)&&actor.routeIdx<actor.route.length-1;
      episode={id:`rx${++reactionSequence}`,actorId:actor.id,targetId:target.id,weaponId,
        weapon:GUNS[weaponId]?.name||weaponId,
        visibleAtMs:Math.round(sec*1000),targetAcquiredAtMs:null,firePermissionAtMs:null,
        firstAuthoritativeShotAtMs:null,latencyMs:null,distance:Math.round(distance*100)/100,
        reactionDelayMs:profile.delayMs,reactionConfidence:Number(profile.confidence.toFixed(3)),
        reactionReadyAtMs:null,lineOfSight:Boolean(los),fov:Boolean(fov),targetAcquired:Boolean(mapAware),targetLock:Boolean(mapAware),engagementPermission:false,flank:Boolean(flank),mapAware:Boolean(mapAware),shot:false,
        routeActiveAtAcquisition:routeActive,routeWaypointIndex:actor.routeIdx,routeWaypointCount:Array.isArray(actor.route)?actor.route.length:0,
        routeKind:actor._routePlan?.kind||null,tacticalPhase:actor._routePlan?.phase||null,movementState:actor.state||null,objectiveState:actor.objectiveState||null,
        routeInterrupted:false,routePreservedAfterEngage:false};
      activeReactionEpisodes.set(key,episode);reactionTelemetry.push(episode);
    }
    return episode;
  };
  // 正式 CS 單張地圖：MR12、先到 13；OT 為每組 MR3（6 局，先到 4）。
  // team identity 永遠由 rosterTeamById 決定；p.side 只代表該回合 currentSide。
  const ROUNDS=CS_REGULATION_ROUNDS;let ctScore=0,tScore=0,fi=0,rnd=0,majorMatchTimeSec=0;
  const rosterTeamById=new Map(RS.map(c=>[c.id,csRosterTeamId(c)]));
  const teamOfRosterId=id=>rosterTeamById.get(id)??CS_TEAM_US;
  const ruleState=createCsRuleState();
  const econ={};RS.forEach(c=>econ[c.id]={money:CS_REGULATION_START_MONEY,gun:null,armor:false,helmet:false});
  const economyEvents=[];
  const resetEconomy=reason=>{
    const resetMoney=csEconomyResetMoney(reason);
    RS.forEach(c=>{econ[c.id]={money:resetMoney,gun:null,armor:false,helmet:false};});
    lossStreak[CS_TEAM_US]=0;lossStreak[CS_TEAM_ENEMY]=0;
    economyEvents.push({reason,round:ruleState.roundsPlayed+1,phase:ruleState.phase,otGroup:ruleState.otGroup,resetMoney,pistolRound:csIsPistolReset(reason),startMoneyByPlayer:Object.fromEntries(RS.map(c=>[c.id,resetMoney]))});
  };
  const lossStreak={[CS_TEAM_US]:0,[CS_TEAM_ENEMY]:0};
  // 跨回合累計的每位選手數據（給賽後 MatchResult / 成長機制 / 數據面板使用）
  const agg={};RS.forEach(c=>agg[c.id]={id:c.id,name:c.name,teamId:teamOfRosterId(c.id),side:c.side,role:c.fpsRole||c.role,roleKey:c.role,personality:c.personality,k:0,d:0,a:0,dmg:0,utilDmg:0,hs:0,entry:0,clutch:0,kastR:0,mvpR:0});
  while(!ruleState.completed){
    const roundPlan=beginCsRound(ruleState);if(!roundPlan.legal)break;
    if(roundPlan.economyResetReason)resetEconomy(roundPlan.economyResetReason);
    tScore=ruleState.score[CS_TEAM_US];ctScore=ruleState.score[CS_TEAM_ENEMY];
    const sideByTeam=roundPlan.currentSideByTeam;
    RS.forEach(c=>{const teamId=teamOfRosterId(c.id);c.teamId=teamId;c.teamIdentity=teamId;c.side=sideByTeam[teamId];});
    const attackTeam=csTeamAtSide(sideByTeam,"t"),defenseTeam=csTeamAtSide(sideByTeam,"ct");
    const opponentTactic=originalTacticCT;
    const tacticForTeamPhase=phase=>preMatchTacticForPhase(phase);
    const tacticForSidePhase=(side,phase)=>{
      const ownerTeam=({t:attackTeam,ct:defenseTeam}[side]);
      const ownerTactic=ownerTeam===CS_TEAM_US?tacticForTeamPhase(phase):opponentTactic;
      return projectCsTacticToSide(ownerTactic,{mapKey,side,phase});
    };
    const attackTactic=tacticForSidePhase("t",CS_TACTICAL_PHASES.OPENING);
    const defenseTactic=tacticForSidePhase("ct",CS_TACTICAL_PHASES.OPENING);
    const tacticCT=defenseTactic;
    const tac={t:attackTactic,ct:defenseTactic};
    const tacEdge=tacticEdge(attackTactic,defenseTactic); // 戰術 ownership 隨 stable team，攻守角色由 currentSide 決定
    // ── 賽前經濟決策（全買 / 強起 / 省錢 / 手槍局）──
    const teamAvg=side=>RS.filter(c=>sideByTeam[teamOfRosterId(c.id)]===side).reduce((s,c)=>s+econ[c.id].money,0)/5;
    const pistolRound=csIsPistolReset(roundPlan.economyResetReason);
    const decideBuy=(side,my,en)=>{if(pistolRound)return"pistol";const m=teamAvg(side),behind=en-my;if(m>=4200)return"full";if(m<2200)return"eco";if(behind>=2&&m>=2700)return"force";if(m>=3700)return"full";return"eco";};
    const attackScore=attackTeam===CS_TEAM_US?tScore:ctScore,defenseScore=attackTeam===CS_TEAM_US?ctScore:tScore;
    const buyT=decideBuy("t",sceneVersion==="legacy"?tScore:attackScore,sceneVersion==="legacy"?ctScore:defenseScore),buyCT=decideBuy("ct",sceneVersion==="legacy"?ctScore:defenseScore,sceneVersion==="legacy"?tScore:attackScore);
    const target=chooseRoundTacticalSite(attackTactic,{round:rnd,scoreFor:attackScore,scoreAgainst:defenseScore,buyType:buyT,previousControl:previousTacticalControl.t});
    if(target!==attackTactic.site)tacticalAudit.targetChanges.push({round:rnd+1,from:attackTactic.site||null,to:target,scoreFor:attackScore,scoreAgainst:defenseScore,buyType:buyT,previousControl:previousTacticalControl.t});
    const ecoT=buyT==="eco"||buyT==="pistol",ecoCT=buyCT==="eco"||buyCT==="pistol";
    const ARMOR=1000,NADE={flash:200,smoke:300,he:300,molly:400},sidePistol=s=>s==="t"?"glock":"usp";
    const roundRoster=RS.map(c=>({...c,teamId:teamOfRosterId(c.id),teamIdentity:teamOfRosterId(c.id),side:sideByTeam[teamOfRosterId(c.id)]}));
    const roundDuties=sceneVersion!=="legacy"?fpsAssignTacticalDuties({players:roundRoster}):null;
    const startMoneyByPlayer=Object.fromEntries(RS.map(c=>[c.id,econ[c.id].money]));
    const buyTypeByTeam={[attackTeam]:buyT,[defenseTeam]:buyCT};
    const roundFrameStart=fi;
    const economyResetMoney=roundPlan.economyResetReason?csEconomyResetMoney(roundPlan.economyResetReason):null;
    const roundMeta={id:`round-start-${rnd+1}`,round:rnd+1,phase:roundPlan.phase,half:roundPlan.half,roundInPhase:roundPlan.roundInPhase,roundInHalf:roundPlan.roundInHalf,otGroup:roundPlan.otGroup,
      currentSideByTeam:cloneCsSides(sideByTeam),economyReset:Boolean(roundPlan.economyResetReason),economyResetReason:roundPlan.economyResetReason,
      economyResetMoney,pistolRound,startMoneyByPlayer,buyTypeByTeam,
      teamIdentityByPlayer:Object.fromEntries(RS.map(c=>[c.id,teamOfRosterId(c.id)])),
      tacticOwnerByTeam:{[CS_TEAM_US]:tacticT?.id??tacticT?.name??null,[CS_TEAM_ENEMY]:originalTacticCT?.id??originalTacticCT?.name??null},
      tacticBySide:{t:attackTactic?.id??attackTactic?.name??null,ct:defenseTactic?.id??defenseTactic?.name??null},tacticalTarget:target,
      preMatchLayout:{version:preMatchLayout.version,openness:preMatchLayout.openness,postPlantMode:preMatchLayout.postPlantMode,phaseSelections:tacticalAudit.preMatchLayout.phases}};
    let planted=false,c4t=null,c4pos=null,smokes=[],tracers=[],muzzles=[];
    let mollys=[],throwables=[],droppedGuns=[],droppedBomb=null;
    let roundEnd=null,firstKill=false,openKill=null,roundKills={},roundDmg={},roundUtilDmg={},roundDeaths={},roundAst={},throwerByNadeId={},doorStates={};
    // Weapon cooldown belongs to the shooter, not the current target.  Keeping
    // this target-scoped lets a semi-auto weapon bypass its cadence simply by
    // switching opponents between simulation windows.
    const fireClockByActor=new Map();
    const lastShotAtByActor=new Map();
    let shotSequence=0;
    let contactCalled=false,defuseCalled=false,defuseProg=0,bombResultRecorded=false,bombPlantEventEmitted=false,defuseStartEventEmitted=false,defuseResultEventEmitted=false,explosionEventEmitted=false;
    let majorDefuse={defuserId:null,progress:0};
    let majorIntel=[];
    const majorKills=[],clutchEpisodes=[];
    map.doors.forEach((d,i)=>doorStates[i]=false);
    const ps=RS.map(rosterPlayer=>{
      const teamId=teamOfRosterId(rosterPlayer.id),side=sideByTeam[teamId];
      const c={...rosterPlayer,teamId,teamIdentity:teamId,side};
      const e=econ[c.id];const buy=side==="t"?buyT:buyCT;const tactic=tac[side];const sp=sidePistol(side);
      let gun=e.gun,armor=e.armor,helmet=e.helmet,money=e.money,nades=sceneVersion!=="legacy"?[...(e.nades||[])]:[],boughtWeapon=null;
      const utilityCarried=[...nades],utilityPurchased=[];
      if(buy==="pistol"){
        gun=sp;boughtWeapon=gun;
        if(money>=ARMOR){armor=true;helmet=true;money-=ARMOR;}
        if((c.role==="awp"||c.role==="entry")&&money>=700){gun="deagle";boughtWeapon=gun;money-=700;}
        else if(money>=300&&rand()<0.5){gun="p250";boughtWeapon=gun;money-=300;}
        if(sceneVersion==="legacy"&&money>=NADE.flash&&rand()<0.6){nades.push("flash");money-=NADE.flash;}
        if(sceneVersion==="legacy"&&money>=NADE.smoke&&rand()<0.45){nades.push("smoke");money-=NADE.smoke;}
      }else if(buy==="eco"){
        // Team-level eco remains authoritative.  An AWP player who has enough
        // personal money for a primary plus armor may keep a viable loadout
        // through the same buy authority; only a true personal eco falls back
        // to the sidearm.
        if(!gun&&c.role==="awp"&&money>=COST.mp9+ARMOR){
          const fallback=c5bFullBuyWeapon(c,{side,money,mapKey,round:rnd,tactic,target,scoreDiff:sceneVersion!=="legacy"&&side==="ct"?defenseScore-attackScore:attackScore-defenseScore});
          if(fallback&&c5a1WeaponFamily(fallback)!=="pistol"){gun=fallback;boughtWeapon=fallback;money-=COST[fallback]??0;}
        }
        if(!gun)gun=sp;
        if(!armor&&money>=ARMOR&&rand()<0.25){armor=true;helmet=true;money-=ARMOR;}
        if(gun===sp&&money>=300&&rand()<0.35){gun="p250";boughtWeapon=gun;money-=300;}
      }else{ // full / force：負擔得起就買最好的，否則退階
        const legal=(ROLE_GUNS[c.role]||["ak"]).filter(g=>side==="t"?g!=="m4"&&g!=="m4a4":g!=="ak");
        const bought=c5bFullBuyWeapon(c,{side,money,mapKey,round:rnd,tactic,target,scoreDiff:sceneVersion!=="legacy"&&side==="ct"?defenseScore-attackScore:attackScore-defenseScore});
        if(bought){gun=bought;boughtWeapon=bought;money-=COST[bought]??0;}else if(!gun)gun=sp;
        if(!armor&&money>=ARMOR){armor=true;helmet=true;money-=ARMOR;}
        for(const n of sceneVersion==="legacy"?["flash","smoke","he","molly"]:[]){if(money>=NADE[n]&&rand()<0.7){nades.push(n);money-=NADE[n];}}
      }
      const utilityPlans=sceneVersion!=="legacy"?planFpsUtilityLoadout({player:c,duty:roundDuties[c.id],nodes:N,target,tactic,round:rnd+1,buyType:buy}):null;
      if(utilityPlans)for(const plan of utilityPlans)if(plan.purchaseEligible&&!nades.includes(plan.type)&&money>=NADE[plan.type]&&nades.length<4){nades.push(plan.type);utilityPurchased.push(plan.type);money-=NADE[plan.type];}
      e.money=money;
      // 路線指派：戰術未定義該角色時，退回相近角色路線（避免指揮/輔助等留在出生點不參戰）
      const RKF={igl:"rifler",support:"rifler",lurker:"rifler",awp:"rifler",rifler:"entry",entry:"rifler"};
      const tr=tactic.routes||{};
      const routeKeys=leadershipRouteKeys(c,tactic,tr,RKF,RS);
      const route=navigableRoute(routeKeys.map(nk=>N[nk]).filter(Boolean));
      const carrierId=roundRoster.filter(p=>p.side==="t").sort((a,b)=>
        (a.role==="support"?0:a.role==="igl"?1:a.role==="rifler"?2:3)-(b.role==="support"?0:b.role==="igl"?1:b.role==="rifler"?2:3)||String(a.id).localeCompare(String(b.id)))[0]?.id;
      const hasBomb=side==="t"&&(sceneVersion==="legacy"?c.role==="entry":c.id===carrierId);
      return{...c,teamId,teamIdentity:teamId,side,pos:{...SPAWN[side==="ct"?"ct":"t"]},prevPos:{...SPAWN[side==="ct"?"ct":"t"]},
        hp:100,armor,helmet,money,gun,k:0,d:0,a:0,hsCount:0,dmgDealt:0,dead:false,state:"BUY",va:side==="ct"?225:45,flash:0,...(utilityPlans?{utilityPlans}:{}),
        route:[],routeIdx:0,routeT:0,hasBomb,reassigned:false,picking:0,shooting:0,nades,...(sceneVersion!=="legacy"?{utilityCarried,utilityPurchased,utilityCost:utilityPurchased.reduce((sum,type)=>sum+NADE[type],0)}:{}),pistol:sp,buyType:buy,purchase:boughtWeapon,purchaseMoney:boughtWeapon?(COST[boughtWeapon]??0):0,
        _activeTacticId:null,_lastRouteBuild:null,_spawnDistance:0,_spawnPeakDistance:0,_leftSpawn:false,_spawnRegressionRouteId:null,
        ...(sceneVersion!=="legacy"?{...createFpsWeaponHandling(gun),stance:"standing"}:{})};
    });
    if(sceneVersion!=="legacy"){
      const duties=fpsAssignTacticalDuties({players:ps});
      for(const side of ["t","ct"])ps.filter(p=>p.side===side).sort((a,b)=>String(a.id).localeCompare(String(b.id))).forEach((p,index)=>{
        const sp=SPAWN[side];p.pos=collideResolve({x:sp.x+(index%3-1)*3,y:sp.y+(Math.floor(index/3)-.5)*3},walls,PLAYER_R);
        p.tacticalDuty=duties[p.id];p.engagementRange=weaponAuthority(p.gun).range;
      });
      separateFpsPlayers(ps,walls,movementAudit);
      ps.forEach(p=>{p.prevPos={...p.pos};p._freezePos={...p.pos};});
    }
    const roundRKF={igl:"rifler",support:"rifler",lurker:"rifler",awp:"rifler",rifler:"entry",entry:"rifler"};
    const majorRoutePlan=(p,plan,phase,phaseTactic)=>{
      if(sceneVersion==="legacy")return plan;
      return {...plan,...planFpsBombRoute({player:p,players:ps,tactic:phaseTactic,library:routeLibraryBySide[p.side],target,phase,
        selectionId:p.teamId===CS_TEAM_US?preMatchLayout.phases[phase]?.selectionId:null,nodes:N})};
    };
    ps.forEach(p=>{
      const sideScore=p.side==="t"?attackScore:defenseScore,opponentScore=p.side==="t"?defenseScore:attackScore;
      const phase=CS_TACTICAL_PHASES.OPENING,weaponMix=tacticalWeaponMix(ps,p.side);
      const phaseTactic=tacticForSidePhase(p.side,phase);
      let plan=tacticalRoutePlan({player:p,tactic:phaseTactic,routeLibrary:routeLibraryBySide[p.side],RKF:roundRKF,
        context:{phase,target:fpsTacticalPlanningTarget({player:p,tactic:phaseTactic,planted,target,sceneVersion}),scoreDiff:sideScore-opponentScore,buyType:p.buyType,survival:5,controlRatio:0,weaponMix,openness:preMatchLayout.openness},round:rnd,mapKey});
      plan=majorRoutePlan(p,plan,phase,phaseTactic);
      p._activeTacticId=phaseTactic?.id??phaseTactic?.name??null;
      assignRoute(p,plan.keys.map(key=>N[key]).filter(Boolean),{...plan,roundSec:0,routeSignature:plan.keys.join(">"),routeRebuildReason:"round-reset",allowSpawnAnchor:true});
      p.tacticalPhase=phase;p._tacticalPhase=phase;p.objectiveState="OPENING";
      tacticalAudit.phases[phase]+=1;
      tacticalAudit.phaseSelections.push({round:rnd+1,roundSec:0,playerId:p.id,side:p.side,phase,selectionId:preMatchLayout.phases[phase]?.selectionId??null,tacticId:phaseTactic?.id??null,tacticType:phaseTactic?.type??null,ownerTeamId:({t:attackTeam,ct:defenseTeam}[p.side]),currentSideTacticId:phaseTactic?.id??null,currentSideTacticType:phaseTactic?.type??null,source:"pre-match-layout"});
      tacticalAudit.decisions.push({round:rnd+1,roundSec:0,playerId:p.id,side:p.side,phase,target,buyType:p.buyType,scoreDiff:sideScore-opponentScore,survival:5,controlRatio:0,weaponMix,variant:plan.kind,routeSignature:plan.keys.join(">"),objective:plan.objective,selectionId:preMatchLayout.phases[phase]?.selectionId??null,tacticId:phaseTactic?.id??null,ownerTeamId:({t:attackTeam,ct:defenseTeam}[p.side]),currentSideTacticId:phaseTactic?.id??null,currentSideTacticType:phaseTactic?.type??null,openness:preMatchLayout.openness});
    });
    previousTacticalControl.t=tacticalControlSnapshot(ps,"t",N).ratio;
    previousTacticalControl.ct=tacticalControlSnapshot(ps,"ct",N).ratio;
    buyAudit.rounds.push({round:rnd+1,phase:roundPlan.phase,target,buyTypeByTeam,score:{t:tScore,ct:ctScore},players:ps.map(p=>({id:p.id,side:p.side,teamId:p.teamId,buyType:p.buyType,startMoney:startMoneyByPlayer[p.id],endMoney:p.money,spent:Math.max(0,(startMoneyByPlayer[p.id]??0)-p.money),weapon:p.gun,weaponFamily:c5a1WeaponFamily(p.gun),purchase:p.purchase,purchaseCost:p.purchaseMoney,...(sceneVersion!=="legacy"?{utilityPurchased:[...p.utilityPurchased],utilityCarried:[...p.utilityCarried],utilityCost:p.utilityCost,utilityPlans:p.utilityPlans.map(plan=>({...plan})),utilityPurchases:p.utilityPurchased.map(type=>({...p.utilityPlans.find(plan=>plan.type===type),cost:NADE[type],round:rnd+1})),utilityWindows:{}}:{}),authority:weaponAuthority(p.gun)}))});
    ps.forEach(p=>{const loadoutFamily=c5a1WeaponFamily(p.gun);buyAudit.loadoutCounts[loadoutFamily]=(buyAudit.loadoutCounts[loadoutFamily]||0)+1;if(p.purchase){const family=c5a1WeaponFamily(p.purchase);buyAudit.totalPurchases+=1;buyAudit.purchaseCounts[family]=(buyAudit.purchaseCounts[family]||0)+1;buyAudit.spendByFamily[family]=(buyAudit.spendByFamily[family]||0)+(p.purchaseMoney||0);}});
    for(let sec=0;sec<115||(sceneVersion!=="legacy"&&planted&&c4t>0);sec+=C5A2_SIM_STEP_SEC){
      const telemetryStart=reactionTelemetry.length;
      const visibleReactionKeys=new Set();
      const events=[],casts=[],comms=[],buyP=sec<12;const prog=buyP?0:clamp((sec-12)/90,0,1);
      const utilityThrownIds=new Set();
      const throwMajorUtility=(player,type,land,intent,planId=null,purchasePurpose=null)=>{
        const index=player?.nades?.indexOf(type)??-1;
        if(index<0||player.dead||utilityThrownIds.has(player.id)||!Number.isFinite(land?.x)||!Number.isFinite(land?.y))return false;
        player.nades=player.nades.filter((_,i)=>i!==index);utilityThrownIds.add(player.id);player.lastUtilityAtSec=sec;player.lastUtilityType=type;player.lastUtilityIntent=intent;
        const id=`nd${fi}${player.id}`,flightDistance=dist(player.pos,land),flight=c5a2ProjectileProfile(type,flightDistance);
        throwables.push({id,type,side:player.side,throwerId:player.id,thrownAtRoundSec:sec,intent,planId,purchasePurpose,from:{...player.pos},to:{...land},t:0,flightElapsedSec:0,flightDistance:Number(flightDistance.toFixed(4)),...flight,flying:true,detonate:false});
        throwerByNadeId[id]=player.id;
        events.push({id:`utility-throw-${id}`,type:"utility-throw",round:rnd+1,roundSec:sec,playerId:player.id,throwableId:id,utility:type,intent,planId,purchasePurpose,pos:{...player.pos},to:{...land}});
        return true;
      };
      const aliveT=ps.filter(p=>p.side==="t"&&!p.dead),aliveCT=ps.filter(p=>p.side==="ct"&&!p.dead);
      if(sceneVersion!=="legacy"&&!buyP)majorIntel=collectFpsTeamIntel({players:ps,previous:majorIntel,roundSec:sec,walls,canSee:(actor,target)=>!(actor.blindSec>0)&&canEngage(actor,target,walls,smokes,prog)});
      const applyDamage=(at,df,damage,source="firearm",sourceId=null)=>{
        if(!df._hitters)df._hitters=[];if(!df._hitters.includes(at.id))df._hitters.push(at.id);
        const hpBefore=df.hp,effectiveDamage=Math.min(damage,hpBefore);
        df.hp-=damage;if(sceneVersion!=="legacy"&&effectiveDamage>0)df.plantProgressSec=0;at.dmgDealt=(at.dmgDealt||0)+effectiveDamage;roundDmg[at.id]=(roundDmg[at.id]||0)+effectiveDamage;
        if(source==="he"||source==="molly")roundUtilDmg[at.id]=(roundUtilDmg[at.id]||0)+effectiveDamage;
        return{hpBefore,effectiveDamage,killed:df.hp<=0};
      };
      const finalizeKill=(at,df,{weapon=at.gun,isHS=false,distance=Infinity,sourceId=null,killAtSec=sec}={})=>{
        df.dead=true;df.hp=0;at.k++;df.d++;if(isHS)at.hsCount++;at.money+=killReward(weapon);roundKills[at.id]=(roundKills[at.id]||0)+1;roundDeaths[df.id]=1;
        if(sceneVersion!=="legacy"){
          // Publish the causal death before its trade/clutch consequences.
          events.push({id:`kill-${rnd+1}-${shotSequence}-${at.id}-${df.id}`,type:"kill",killerId:at.id,killer:at.name,killerSide:at.side,victim:df.name,victimId:df.id,victimSide:df.side,roundSec:killAtSec,gun:weapon,weaponFamily:c5a1WeaponFamily(weapon),hs:isHS,pos:{...df.pos},firstKill:!firstKill});
          const loss=majorKills.find(k=>k.killerId===df.id&&k.victimSide===at.side&&killAtSec>k.roundSec&&killAtSec-k.roundSec<=5);
          if(loss)events.push({id:`trade-${rnd+1}-${at.id}-${df.id}`,type:"trade",round:rnd+1,roundSec:killAtSec,playerId:at.id,victimId:df.id,tradedPlayerId:loss.victimId,deathAtSec:loss.roundSec});
          majorKills.push({roundSec:killAtSec,killerId:at.id,victimId:df.id,killerSide:at.side,victimSide:df.side});
          for(const side of ["t","ct"]){const survivors=ps.filter(p=>!p.dead&&p.side===side),opponents=ps.filter(p=>!p.dead&&p.side!==side);if(survivors.length===1&&opponents.length&&!clutchEpisodes.some(e=>e.playerId===survivors[0].id)){const episode={playerId:survivors[0].id,side,opponentCount:opponents.length,startedAtSec:killAtSec};clutchEpisodes.push(episode);events.push({id:`clutch-start-${rnd+1}-${episode.playerId}`,type:"clutch-start",round:rnd+1,roundSec:killAtSec,...episode});}}
        }
        const leadershipSecond=sceneVersion==="legacy"?leadershipFollowUpAfterKill(df,ps,target,N):{action:false};
        if(leadershipSecond.action){const followUp=ps.find(player=>player.id===leadershipSecond.playerId);if(followUp&&followUp.route)assignRoute(followUp,followUp.route,{kind:"leadership-followup",phase:tacticalPhaseFor(sec,planted),objective:"follow-up",roundSec:sec,routeSignature:"leadership-follow-up"});}
        (df._hitters||[]).forEach(id=>{if(id!==at.id){const ap=ps.find(x=>x.id===id);if(ap){ap.a++;roundAst[id]=(roundAst[id]||0)+1;}}});
        if(!["glock","usp"].includes(df.gun))droppedGuns.push({id:`dg${fi}${df.id}`,gun:df.gun,pos:{...df.pos},...(sceneVersion!=="legacy"?{ammo:df.ammo,reserveAmmo:df.reserveAmmo}:{})});
        if(sceneVersion!=="legacy")Object.assign(df,advanceFpsWeaponHandling(df,Math.round(sec*1000),true));
        if(df.hasBomb&&!planted){df.hasBomb=false;droppedBomb={pos:{...df.pos}};casts.push(`💣 炸彈掉落！`);}
        const isFirst=!firstKill;firstKill=true;if(isFirst)openKill={id:at.id,side:at.side};
        if(sceneVersion==="legacy")events.push({id:`kill-${rnd+1}-${shotSequence}-${at.id}-${df.id}`,type:"kill",killerId:at.id,killer:at.name,killerSide:at.side,victim:df.name,gun:weapon,weaponFamily:c5a1WeaponFamily(weapon),hs:isHS,pos:{...df.pos},firstKill:isFirst});
        const rk=roundKills[at.id];
        if(rk>=2){const ml={2:"雙殺",3:"三殺",4:"四殺",5:"團滅"};events.push({id:`multikill-${rnd+1}-${at.id}-${rk}`,type:"multikill",player:at.name,playerId:at.id,side:at.side,count:rk,label:ml[Math.min(rk,5)]});highlights.push({fi,label:`${at.name} ${ml[Math.min(rk,5)]}`});}
        if(weapon==="molly")casts.push(`🔥 ${at.name} 燃燒彈擊殺 ${df.name}`);else if(weapon==="he")casts.push(`💥 ${at.name} 高爆彈擊殺 ${df.name}！`);else if(isHS)casts.push(`💀 ${at.name} 爆頭擊殺 ${df.name}！`);else if(isFirst)casts.push(`🔫 ${at.name} 取得首殺，拿下開局優勢`);else if(distance<12)casts.push(`${at.name} 近距離擊殺 ${df.name}`);else if(GUNS[weapon]?.cls==="狙擊")casts.push(`🎯 ${at.name} 一槍狙掉 ${df.name}`);else if(rand()<0.4)casts.push(`${at.name} 擊殺 ${df.name}`);
        if(rand()<0.4)comms.push({side:at.side,name:at.name,text:rk>=2?"清掉了，跟上！":isHS?"爆頭收掉":`收一個，剩 ${df.side==="t"?aliveT.length-1:aliveCT.length-1} 個`});
        const sameTeam=ps.filter(x=>x.side===df.side&&!x.dead&&!x.reassigned);
        if(sceneVersion==="legacy"&&sameTeam.length&&rand()<0.6){const taker=sameTeam[0];taker.reassigned=true;const goal=df.side==="t"?N[target==="a"?"aSite":"bSite"]:df.pos;if(goal){assignRoute(taker,[taker.pos,goal],{kind:"death-follow-up",phase:tacticalPhaseFor(sec,planted),objective:"follow-up",roundSec:sec,routeSignature:"death-follow-up"});casts.push(`🔄 ${taker.name} 接管 ${df.name} 的位置`);}}
      };
      if(sec===12){
        const tIgl=ps.find(p=>p.side==="t"&&p.role==="igl")||aliveT[0];
        const cIgl=ps.find(p=>p.side==="ct"&&p.role==="igl")||aliveCT[0];
        if(tIgl)comms.push({side:"t",...(sceneVersion!=="legacy"?{senderId:tIgl.id}:{}),name:tIgl.name,text:sceneVersion==="legacy"?(attackTactic.site==="a"?"預設打 A，控好中路跟我節奏":"下 B！香蕉壓上，記得丟煙"):`${attackTactic.name}，${attackTactic.type==="rush"?"直接進點，後排跟上":attackTactic.type==="pick"?"先架槍找機會，不急著壓上":"分頭控圖，集結後掩護進點"}`});
        if(cIgl)comms.push({side:"ct",...(sceneVersion!=="legacy"?{senderId:cIgl.id}:{}),name:cIgl.name,text:sceneVersion==="legacy"?(defenseTactic.site==="a"?"A 雙人守，注意中路 timing":"B 留一個，其餘抓資訊"):`${defenseTactic.name}，${defenseTactic.type==="stack"?"守住部署點，留意側線":defenseTactic.type==="aggro"?"前排探資訊，其餘守好兩點":"兩點留守，看到人再叫支援"}`});
      }
      // 先老化上一 tick 的槍火，讓本 tick 新生的曳光彈/槍口閃光能存入快照
      tracers=tracers.map(t=>({...t,tl:t.tl-C5A2_SIM_STEP_RATIO})).filter(t=>t.tl>0);
      muzzles=muzzles.map(m=>({...m,tl:m.tl-C5A2_SIM_STEP_RATIO})).filter(m=>m.tl>0);
      ps.forEach(p=>{
        if(sceneVersion!=="legacy")Object.assign(p,advanceFpsWeaponHandling(p,Math.round(sec*1000)));
        if(sceneVersion!=="legacy"){p.blindSec=fpsDecayBlind(p.blindSec,C5A2_SIM_STEP_SEC);p.flash=0;}else p.flash=Math.max(0,p.flash-C5A2_SIM_STEP_RATIO);
        p.shooting=Math.max(0,p.shooting-C5A2_SIM_STEP_RATIO);p.prevPos={...p.pos};p.picking=Math.max(0,p.picking-C5A2_SIM_STEP_RATIO);
        const separationMoved=Boolean(p._separationMoved);p._separationMoved=false;
        if(p.dead)return;
        if(buyP){const sp=SPAWN[p.side==="ct"?"ct":"t"];const h=hsh(p.id);
          if(!p._off)p._off={x:((h%5)-2)*1.7,y:(((h>>4)%5)-2)*1.7};
          p.pos=sceneVersion==="legacy"?collideResolve({x:sp.x+p._off.x+Math.sin(sec*0.55+h*0.11)*0.6,y:sp.y+p._off.y+Math.cos(sec*0.5+h*0.13)*0.6},walls,PLAYER_R):{...p._freezePos};p.state="BUY";return;}
        const currentPhase=tacticalPhaseFor(sec,planted),control=tacticalControlSnapshot(ps,p.side,N);
        if(sceneVersion!=="legacy"&&p.side==="t"&&!planted){
          const phaseTactic=tacticForSidePhase(p.side,currentPhase),selection=p.teamId===CS_TEAM_US?preMatchLayout.phases[currentPhase]?.selectionId:null;
          const mode=({f1:"default",f2:"rush",f3:"split",f4:"pick",f5:"execute",f6:"fake",f8:"default"})[selection]||phaseTactic.type;
          if(p._attackMode!==mode||p._attackTarget!==target){p.tacticalStage=null;p.controlledSinceSec=undefined;p.utilityStageSinceSec=undefined;p._attackMode=mode;p._attackTarget=target;}
          if(['control','pick'].includes(p.tacticalStage)&&p.route.length>1&&p.routeIdx>=p.route.length-1&&!Number.isFinite(p.controlledSinceSec))p.controlledSinceSec=sec;
          const stage=fpsAttackStage({player:p,players:ps,mode,roundSec:sec,planted,sites:{a:N.aSite,b:N.bSite},target,intel:majorIntel});
          if(p.tacticalStage!==stage.stage){if(stage.stage==="utility")p.utilityStageSinceSec=sec;p.tacticalStage=stage.stage;p._tacticalPhase=null;
            events.push({id:`stage-${rnd+1}-${p.id}-${fi}`,type:"tactical-stage",playerId:p.id,side:p.side,roundSec:sec,stage:stage.stage,reason:stage.reason,pos:{...p.pos}});}
          p.attackStage=stage;
        }
        if(sceneVersion!=="legacy"&&p.fakeStage==="approach"&&p.fakeGoal&&dist(p.pos,p.fakeGoal)<6){
          p.fakeStage="complete";p.fakeReachedAtSec=sec;p._tacticalPhase=null;
          events.push({id:`fake-reached-${rnd+1}-${p.id}`,type:"fake-reached",round:rnd+1,roundSec:sec,playerId:p.id,pos:{...p.pos},fakeGoal:{...p.fakeGoal},fakeNodeKey:p.fakeNodeKey,fakeSite:p.fakeSite,target});
        }
        if(p._tacticalPhase!==currentPhase&&(!(sceneVersion!=="legacy"&&p.fakeStage==="approach")||p._tacticalPhase===null)){
          const sideScore=p.side==="t"?attackScore:defenseScore,opponentScore=p.side==="t"?defenseScore:attackScore;
          const phaseTactic=tacticForSidePhase(p.side,currentPhase);
          let plan=null,objective=currentPhase===CS_TACTICAL_PHASES.POST_PLANT?(p.side==="t"?"post-plant-hold":"retake"):currentPhase;
          if(currentPhase===CS_TACTICAL_PHASES.POST_PLANT&&c4pos){
            if(p.side==="t"){
              const anchor=sceneVersion!=="legacy"&&preMatchLayout.postPlantMode==="crossfire"?selectFpsCrossfireAnchor({player:p,players:ps,nodes:N,target}):tacticalPostPlantAnchor(p,phaseTactic,N,target,preMatchLayout.postPlantMode);if(anchor)plan={kind:"post-plant-cover",keys:["position","anchor"],points:[p.pos,anchor],objective:"post-plant-hold"};
              p.objectiveState="HOLD_ANGLE";p.state="POST_PLANT";
            }else{
              const retake=tacticalRetakeRoute(p,phaseTactic,N,c4pos)||[p.pos,c4pos];plan={kind:"retake",keys:["position","retake","c4"],points:retake,objective:"retake"};
              p.objectiveState="RETAKE";p.state="RETAKE";bombAudit.retakeAssignments+=1;
            }
          }else{
            const weaponMix=tacticalWeaponMix(ps,p.side);
            plan=tacticalRoutePlan({player:p,tactic:phaseTactic,routeLibrary:routeLibraryBySide[p.side],RKF:roundRKF,
              context:{phase:currentPhase,target:fpsTacticalPlanningTarget({player:p,tactic:phaseTactic,planted,target,sceneVersion}),scoreDiff:sideScore-opponentScore,buyType:p.buyType,survival:control.survival,controlRatio:control.ratio,weaponMix,openness:preMatchLayout.openness},round:rnd,mapKey});
            plan=majorRoutePlan(p,plan,currentPhase,phaseTactic);plan.points=plan.keys.map(key=>N[key]).filter(Boolean);
          }
          p._activeTacticId=phaseTactic?.id??phaseTactic?.name??null;
          if(plan?.points?.length>1){
            const signature=(plan.keys||[]).join(">");
            // An unchanged entry/lurk lane continues from its real cursor.
            // Rebuilding its full spawn route at 26/70 seconds sent the actor
            // backwards through already traversed waypoints.
            const keepRoleRoute=sceneVersion!=="legacy"&&["entry","lurk","execute","rush-entry","split-mid","route-control","pick-angle","regroup","utility-stage","hold-a","hold-b","information","information-peek"].includes(plan.kind)&&!p._coordinatorKind&&p._routePlan?.routeSignature===signature&&p._routePlan?.kind===plan.kind;
            if(keepRoleRoute)p._routePlan={...p._routePlan,phase:currentPhase,objective:plan.objective};
            else assignRoute(p,plan.points,{...plan,roundSec:sec,routeRebuildReason:"phase-transition",routeSignature:signature});
          }
          p._tacticalPhase=currentPhase;p.tacticalPhase=currentPhase;
          tacticalAudit.phases[currentPhase]+=1;
          tacticalAudit.phaseSelections.push({round:rnd+1,roundSec:sec,playerId:p.id,side:p.side,phase:currentPhase,selectionId:preMatchLayout.phases[currentPhase]?.selectionId??null,tacticId:phaseTactic?.id??null,tacticType:phaseTactic?.type??null,ownerTeamId:({t:attackTeam,ct:defenseTeam}[p.side]),currentSideTacticId:phaseTactic?.id??null,currentSideTacticType:phaseTactic?.type??null,source:"pre-match-layout"});
          tacticalAudit.decisions.push({round:rnd+1,roundSec:sec,playerId:p.id,side:p.side,phase:currentPhase,target,buyType:p.buyType,scoreDiff:sideScore-opponentScore,survival:control.survival,controlRatio:Number(control.ratio.toFixed(3)),weaponMix:tacticalWeaponMix(ps,p.side),variant:plan?.kind||"hold",routeSignature:(plan?.keys||[]).join(">"),objective,selectionId:preMatchLayout.phases[currentPhase]?.selectionId??null,tacticId:phaseTactic?.id??null,ownerTeamId:({t:attackTeam,ct:defenseTeam}[p.side]),currentSideTacticId:phaseTactic?.id??null,currentSideTacticType:phaseTactic?.type??null,openness:preMatchLayout.openness});
        }
        if(sceneVersion!=="legacy"){
          let travelDurationSec;
          if(planted&&p.side==="ct"&&c4pos){
            const retakePath=p.route?.length&&dist(p.route.at(-1),c4pos)<3?[p.pos,...p.route.slice(p.routeIdx+1)]:navigableRoute([p.pos,c4pos]);
            const pathLength=retakePath.slice(1).reduce((sum,point,index)=>sum+dist(retakePath[index],point),0);
            const movementPerSec=(4.8+(p.sta?(p.sta-82)*0.025:0))*C5A2_SIM_STEP_RATIO*1.3/C5A2_SIM_STEP_SEC;
            travelDurationSec=pathLength/Math.max(0.1,movementPerSec);
          }
          p.engagementRange=weaponAuthority(p.gun).range;
          const intent=decideFpsTacticalIntent({player:p,intel:majorIntel,recentKills:majorKills,roundSec:sec,planted,sites:{a:N.aSite,b:N.bSite},bombPos:c4pos,bombTimeSec:c4t*C5A2_LEGACY_SNAPSHOT_SEC,travelDurationSec,defuseDurationSec:3.5/((p.stats?(0.45+persStat(p,"foc")/250+persStat(p,"dec")/300):0.7)/C5A2_LEGACY_SNAPSHOT_SEC),spawn:spawnPointFor(p)});
          p.tacticalIntent={...intent,roundSec:sec};
          p.awareness=fpsAwarenessLook({player:p,nodes:N,intel:majorIntel,roundSec:sec,dtSec:C5A2_SIM_STEP_SEC,walls,lineBlocked});p.va=p.awareness.va;
          if(intent.routeTarget&&dist(p.pos,intent.routeTarget)>3&&p._coordinatorKind!==intent.kind){assignRoute(p,[p.pos,intent.routeTarget],{kind:intent.kind,phase:currentPhase,objective:intent.kind,roundSec:sec,routeSignature:intent.kind,informationSource:intent.source,targetId:intent.targetId,observedAtSec:intent.observedAtSec});p._coordinatorKind=intent.kind;}
          else if(!intent.routeTarget){if(p._coordinatorKind)p._tacticalPhase=null;p._coordinatorKind=null;}
        }
        if(sec%8===0&&tacticalAudit.mapControlSamples.length<1200)tacticalAudit.mapControlSamples.push({round:rnd+1,roundSec:sec,side:p.side,phase:currentPhase,controlRatio:Number(control.ratio.toFixed(3)),controlledKeys:control.controlledKeys,survival:control.survival,siteControl:control.siteControl});
        // 龜縮/撤退：素質保守（進攻性低）且殘血者，遇敵會後撤而非硬拚
        {const en=sceneVersion==="legacy"?ps.filter(e=>!e.dead&&e.side!==p.side):majorIntel.filter(i=>i.side===p.side).map(i=>({id:i.targetId,pos:i.pos}));
         const near=en.length?en.reduce((a,b)=>dist(b.pos,p.pos)<dist(a.pos,p.pos)?b:a):null;
         const mates=(p.side==="t"?aliveT:aliveCT).length;
         if(near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&aggr(p)<0.82&&mates>1&&(sceneVersion==="legacy"||!p.tacticalIntent?.routeTarget)){
            const adaptiveGoal=sceneVersion==="legacy"?adaptiveRouteGoal(p,target,N):null;
            if(adaptiveGoal){assignRoute(p,[p.pos,adaptiveGoal],{kind:"low-hp-rotate",phase:tacticalPhaseFor(sec,planted),objective:"retreat",roundSec:sec,routeSignature:"low-hp-rotate"});p.state="ROTATE";return;}
           const dx=p.pos.x-near.pos.x,dy=p.pos.y-near.pos.y,L=Math.hypot(dx,dy)||1;
           const retreatStep=3.2*C5A2_SIM_STEP_RATIO;
           p.pos=safeMove(p.pos,{x:p.pos.x+dx/L*retreatStep,y:p.pos.y+dy/L*retreatStep},walls,PLAYER_R);
           p.va=Math.atan2(near.pos.y-p.pos.y,near.pos.x-p.pos.x)*180/Math.PI;p.state="撤退";return;
         }}
        // A visible, legal contact interrupts locomotion before the next waypoint;
        // the reaction/combat system below still owns hit resolution and damage.
        const withdrawing=sceneVersion!=="legacy"&&["save","retreat"].includes(p.tacticalIntent?.kind);
        const contact=withdrawing?null:ps.filter(e=>e.side!==p.side&&(sceneVersion==="legacy"||!(p.blindSec>0))&&canEngage(p,e,walls,smokes,prog)).sort((a,b)=>dist(p.pos,a.pos)-dist(p.pos,b.pos))[0];
        // An entry may stop to fire briefly, but a distant contact cannot freeze
        // the entire execute indefinitely. Retreat/save still use their own route.
        if(sceneVersion!=="legacy"){if(contact){if(p._contactId!==contact.id){p._contactId=contact.id;p._contactSinceSec=sec;}}else{p._contactId=null;p._contactSinceSec=null;}}
        const stopForContact=contact&&(sceneVersion==="legacy"||p.tacticalIntent?.stopMovement||dist(p.pos,contact.pos)<12||
          (p.side==="ct"&&!planted&&p.routeIdx>=p.route.length-1)||sec-(p._contactSinceSec??sec)<1);
        if(sceneVersion!=="legacy"&&p.hasBomb&&(p.plantProgressSec||0)>0&&!stopForContact){p.state="安裝中";}else if(stopForContact){
          const routeActive=p.routeIdx<p.route.length-1;
          const routeInterruptKey=routeActive?`${rnd}:${p.id}:${p.routeIdx}:${contact.id}`:null;
          if(routeActive&&p._routeInterruptKey!==routeInterruptKey){
            p._routeInterruptKey=routeInterruptKey;
            combatAudit.routeInterruptMovementStops+=1;
          }
          p.va=Math.atan2(contact.pos.y-p.pos.y,contact.pos.x-p.pos.x)*180/Math.PI;
          p.state="架槍";
        }else if(p.routeIdx<p.route.length-1){
          // Pairwise separation can legally move a player off the old route
          // segment. Rebase the remaining route from that corrected position
          // so the next tick does not pull the player back into the crowd.
          if(separationMoved){
            const routeIndexBefore=p.routeIdx,routeId=p._routePlan?.routeId||null;
            const remainingIntent=(p.route||[]).slice(p.routeIdx+1),spawn=spawnPointFor(p);
            const remainingRoutePoints=remainingIntent[0]&&spawn&&dist(remainingIntent[0],spawn)<=SPAWN_ANCHOR_EPSILON?remainingIntent.slice(1):remainingIntent;
            if(remainingRoutePoints.length){
              const rebased=navigableRoute([p.pos,...remainingRoutePoints]);
              if(rebased.length>1){
                p.route=rebased;p.routeIdx=0;p.routeT=0;p._routeProgressKey=null;p._routeBestRemaining=null;
                p._stuckN=0;p._stuckSinceSec=null;p._awaitingReplanProgress=false;
                p._lastRouteBuild={routeId,routeSource:"separation-rebase",routeRebuildReason:"separation-rebase",routeIndexBefore,routeIndexAfter:p.routeIdx,tactic:p._activeTacticId||null,separationRebase:true,stuckRecovery:false,allowSpawnAnchor:false,rawLeadingSpawn:false,removedLeadingSpawn:Boolean(remainingIntent.length!==remainingRoutePoints.length),staleSpawnAnchor:false};
                if(navigationAudit.routeBuilds.length<2400)navigationAudit.routeBuilds.push({round:rnd+1,roundSec:sec,playerId:p.id,routeId,routeSource:"separation-rebase",routeRebuildReason:"separation-rebase",tactic:p._activeTacticId||null,routeIndexBefore,routeIndexAfter:p.routeIdx,rawLeadingSpawn:false,removedLeadingSpawn:Boolean(remainingIntent.length!==remainingRoutePoints.length),separationRebase:true,stuckRecovery:false,staleSpawnAnchor:false,routeStartsAtSpawn:Boolean(rebased[0]&&spawnPointFor(p)&&dist(rebased[0],spawnPointFor(p))<=SPAWN_ANCHOR_EPSILON),routePoints:rebased.slice(0,4).map(point=>({x:Number(point.x.toFixed(3)),y:Number(point.y.toFixed(3))}))});
                movementAudit.replanCount+=1;navigationAudit.replanCount+=1;
              }
            }
          }
          p._routeInterruptKey=null;
          const wp=p.route[p.routeIdx],tgt=p.route[p.routeIdx+1];
          const segLen=Math.max(2,dist(wp,tgt));
          const spd=4.8+(p.sta?(p.sta-82)*0.025:0);
          const maxStep=spd*C5A2_SIM_STEP_RATIO*1.3*(sceneVersion!=="legacy"?(p.tacticalIntent?.pace??1)*(p.awareness?.pace??1):1);
          const dx=tgt.x-p.pos.x,dy=tgt.y-p.pos.y,remaining=Math.hypot(dx,dy);
          const step=Math.min(maxStep,remaining);
          const des=remaining>0.001?{x:p.pos.x+dx/remaining*step,y:p.pos.y+dy/remaining*step}:{...tgt};
          const moved=safeMove(p.pos,des,walls,PLAYER_R),movedDistance=dist(moved,p.pos),remainingAfter=dist(moved,tgt);
          const routeProgressKey=`${p.routeIdx}:${Number(tgt.x).toFixed(2)}:${Number(tgt.y).toFixed(2)}`;
           if(p._routeProgressKey!==routeProgressKey){p._routeProgressKey=routeProgressKey;p._routeBestRemaining=remaining;p._stuckN=0;p._stuckSinceSec=null;}
           if(remainingAfter<=0.55||remainingAfter<=maxStep*0.18){
             if(p._activeStuckEpisode||p._awaitingReplanProgress)resolveStuckEpisode(p,sec);
             navigationAudit.waypointTransitions+=1;
             if(navigationAudit.waypointHistory.length<1600)navigationAudit.waypointHistory.push({round:rnd,roundSec:sec,playerId:p.id,routeId:p._routePlan?.routeId||null,waypointIndex:p.routeIdx,from:{...wp},to:{...tgt},obstacles:obstacleContext(wp,tgt)});
             p.pos=moved;p.routeIdx++;p.routeT=0;p._stuckN=0;p._routeProgressKey=null;p._routeBestRemaining=null;
           }else{
            p.pos=moved;p.routeT=clamp(1-remainingAfter/segLen,0,0.99);
             const madeProgress=remainingAfter<Number(p._routeBestRemaining)-0.04;
             if(madeProgress){
               p._routeBestRemaining=remainingAfter;p._stuckN=0;
               if(p._activeStuckEpisode||p._awaitingReplanProgress)resolveStuckEpisode(p,sec);
            }else if(!NAVIGATION_STABLE_STATES.includes(p.state)&&(movedDistance<0.05||remainingAfter>=remaining-0.02)){
               if(!p._stuckSinceSec)p._stuckSinceSec=sec;
               p._stuckN=(p._stuckN||0)+1;
               if(p._stuckN>=C5A2_STUCK_TIMEOUT_SEC/C5A2_SIM_STEP_SEC){
                 movementAudit.stuckDetections+=1;navigationAudit.stuckDetections+=1;
                 const blockers=obstacleContext(p.pos,tgt),episode={id:`stuck-${rnd}-${p.id}-${navigationAudit.stuckDetections}`,playerId:p.id,round:rnd,startedAtSec:p._stuckSinceSec??Math.max(0,sec-C5A2_STUCK_TIMEOUT_SEC),detectedAtSec:sec,durationSec:Number((sec-(p._stuckSinceSec??sec)).toFixed(3)),routeId:p._routePlan?.routeId||null,waypointIndex:p.routeIdx,routePoints:p.route.slice(Math.max(0,p.routeIdx),Math.min(p.route.length,p.routeIdx+5)).map(point=>({x:Number(point.x.toFixed(3)),y:Number(point.y.toFixed(3))})),obstacles:blockers,status:"detected"};
                 p._activeStuckEpisode=episode;if(navigationAudit.stuckEpisodes.length<1200)navigationAudit.stuckEpisodes.push(episode);
                 if(movementAudit.stuckSamples.length<32)movementAudit.stuckSamples.push({id:p.id,round:rnd,roundSec:sec,state:p.state,pos:{...p.pos},target:{...tgt},remaining:Number(remainingAfter.toFixed(3)),moved:Number(movedDistance.toFixed(3)),routeLength:p.route.length,routeIdx:p.routeIdx,targetBlocked:blocked(tgt,walls,PLAYER_R),segmentBlocked:navLineBlocked(p.pos,tgt,walls),obstacles:blockers});
                 const beforeSignature=p.route.map(point=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(">");
                 const remainingRoute=navigableRoute([p.pos,...p.route.slice(p.routeIdx+1)]);
                 let alternate=remainingRoute,planMeta={kind:"replan",phase:tacticalPhaseFor(sec,planted),objective:p.objectiveState||null,replanOrdinal:navigationAudit.replanCount+1};
                 const validRoute=route=>route.length>1&&route.every(point=>!blocked(point,walls,PLAYER_R))&&route.slice(1).every((point,index)=>!navLineBlocked(route[index],point,walls));
                 if(!validRoute(alternate)||alternate.map(point=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(">")===beforeSignature){
                   const controlNow=tacticalControlSnapshot(ps,p.side,N),sideScore=p.side==="t"?attackScore:defenseScore,opponentScore=p.side==="t"?defenseScore:attackScore;
                   const recoveryPhase=tacticalPhaseFor(sec,planted),recoveryTactic=tacticForSidePhase(p.side,recoveryPhase);p._activeTacticId=recoveryTactic?.id??recoveryTactic?.name??null;
                   let replPlan=tacticalRoutePlan({player:p,tactic:recoveryTactic,routeLibrary:routeLibraryBySide[p.side],RKF:roundRKF,context:{phase:recoveryPhase,target:fpsTacticalPlanningTarget({player:p,tactic:recoveryTactic,planted,target,sceneVersion}),scoreDiff:sideScore-opponentScore,buyType:p.buyType,survival:controlNow.survival,controlRatio:controlNow.ratio,weaponMix:tacticalWeaponMix(ps,p.side),openness:preMatchLayout.openness,replanOrdinal:navigationAudit.replanCount+1},round:rnd,mapKey});replPlan=majorRoutePlan(p,replPlan,recoveryPhase,recoveryTactic);
                   const replPoints=replPlan.keys.map(key=>N[key]).filter(Boolean);if(validRoute(navigableRoute([p.pos,...replPoints])))alternate=navigableRoute([p.pos,...replPoints]);planMeta={...replPlan,...planMeta,routeSignature:replPlan.keys.join(">")};
                 }
                 if(validRoute(alternate)&&alternate.length>1){assignRoute(p,alternate,{...planMeta,roundSec:sec,routeRebuildReason:"stuck-recovery",stuckRecovery:true,routeSignature:planMeta.routeSignature||alternate.map(point=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(">")});p._awaitingReplanProgress=true;movementAudit.replanCount+=1;navigationAudit.replanCount+=1;navigationAudit.replanHistory.push({round:rnd,roundSec:sec,playerId:p.id,fromRoute:beforeSignature,toRoute:alternate.map(point=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(">"),obstacles:blockers,waypointIndex:p.routeIdx});}
                 else{navigationAudit.routeDeadlocks+=1;episode.status="deadlock";navigationAudit.unresolvedStuckEpisodes+=1;}
                 p._stuckN=0;
               }
            }
          }
          const faceTarget=p.route[Math.min(p.routeIdx+1,p.route.length-1)]||tgt;
          const fdx=faceTarget.x-p.pos.x,fdy=faceTarget.y-p.pos.y;if(sceneVersion==="legacy"&&Math.hypot(fdx,fdy)>0.5)p.va=Math.atan2(fdy,fdx)*180/Math.PI;
          p.state=p.routeIdx<p.route.length-2?"ROTATE":"EXECUTE";
        }else{
          // 路線走完仍無接觸：T 方推進至炸彈點/包點匯入戰鬥（避免狙擊/指揮在後方空轉整局）
          const threatNear=sceneVersion==="legacy"?ps.find(e=>!e.dead&&e.side!==p.side&&dist(e.pos,p.pos)<40):majorIntel.filter(i=>i.side===p.side).map(i=>({id:i.targetId,pos:i.pos})).find(e=>dist(e.pos,p.pos)<40);
          if(p.side==="t"&&(sceneVersion==="legacy"?!threatNear&&prog>0.4:!planted&&p.attackStage?.stage==="entry"&&p.attackStage.canAdvance)&&!p._pushed&&(sceneVersion==="legacy"||p.fakeStage!=="approach")){
            const goal=(planted&&c4pos)?c4pos:N[target==="a"?"aSite":"bSite"];
            if(goal&&dist(p.pos,goal)>10){p._pushed=true;const via=N[target==="a"?"aConn":"car"];assignRoute(p,via&&dist(p.pos,via)>8&&!planted?[p.pos,via,goal]:[p.pos,goal],{kind:planted?"post-plant-push":"site-execute",phase:tacticalPhaseFor(sec,planted),objective:planted?"post-plant-hold":"execute",roundSec:sec,routeSignature:planted?"post-plant-push":"site-execute"});p.state="EXECUTE";}
          }
           if(planted){p.state=p.side==="ct"?"COVER":"POST_PLANT";p.objectiveState=p.side==="ct"?"COVER":"HOLD_ANGLE";}else{p.state="HOLD";p.objectiveState="HOLD";}
          if(!p._hold)p._hold={x:p.pos.x,y:p.pos.y};
          const threat=threatNear;
          if(threat){const dx=threat.pos.x-p.pos.x,dy=threat.pos.y-p.pos.y;if(sceneVersion==="legacy")p.va=Math.atan2(dy,dx)*180/Math.PI;p.state="架槍";}
          else if(sceneVersion==="legacy"&&rand()<0.25){p.va+=(rand()-0.5)*30;}
          const h=hsh(p.id);const hx=p._hold.x+Math.sin(sec*0.5+h*0.1)*1.1,hy=p._hold.y+Math.cos(sec*0.45+h*0.17)*1.1;
          let hp2=vl(p.pos,{x:hx,y:hy},0.3*C5A2_SIM_STEP_RATIO);const hst=dist(hp2,p.pos);if(hst>2.0*C5A2_SIM_STEP_RATIO)hp2=vl(p.pos,hp2,2.0*C5A2_SIM_STEP_RATIO/hst);
          if(sceneVersion==="legacy")p.pos=collideResolve(hp2,walls,PLAYER_R); // 平滑且受限的待機微動
          if(sceneVersion!=="legacy"&&!planted){const peek=planFpsCoverPeek({player:p,nodes:N,walls,roundSec:sec,blocked,navLineBlocked,lineBlocked,radius:PLAYER_R});
            if(peek){p.lastPeekAtSec=sec;p.coverPeek={...peek,startedAtSec:sec,cover:{...p.pos}};assignRoute(p,peek.points,{kind:'cover-peek',phase:currentPhase,objective:'information-peek',roundSec:sec,routeSignature:`peek:${peek.approachKey}`});events.push({id:`peek-${rnd}-${p.id}-${sec}`,type:'cover-peek',playerId:p.id,round:rnd+1,roundSec:sec,source:peek.source,points:peek.points,approachKey:peek.approachKey});}}
        }
        map.doors.forEach((d,i)=>{if(!doorStates[i]&&dist(p.pos,{x:d.x,y:d.y})<6){doorStates[i]=true;events.push({type:"door",idx:i,label:d.label});}});
        if(p.picking<=0&&["glock","usp"].includes(p.gun)){const near=droppedGuns.find(g=>dist(g.pos,p.pos)<5);if(near){p.gun=near.gun;if(sceneVersion!=="legacy"){Object.assign(p,createFpsWeaponHandling(near.gun,near));fireClockByActor.delete(p.id);}p.picking=20;droppedGuns=droppedGuns.filter(g=>g.id!==near.id);casts.push(`🔫 ${p.name} 撿起 ${GUNS[near.gun].name}`);}}
        if(droppedBomb&&p.side==="t"&&dist(droppedBomb.pos,p.pos)<5){p.hasBomb=true;droppedBomb=null;casts.push(`💣 ${p.name} 撿起炸彈，繼續執行`);}
        if(sceneVersion==="legacy"&&p.state==="EXECUTE"&&p.nades?.length>0&&rand()<0.06){
          const nt=p.nades[0];if(sceneVersion==="legacy")p.nades=p.nades.slice(1);
          const enemy=sceneVersion==="legacy"?ps.find(e=>!e.dead&&e.side!==p.side&&dist(e.pos,p.pos)<30):majorIntel.filter(i=>i.side===p.side).map(i=>({id:i.targetId,pos:i.pos})).find(e=>dist(e.pos,p.pos)<30);
          const land=enemy?{x:lerp(p.pos.x,enemy.pos.x,0.85),y:lerp(p.pos.y,enemy.pos.y,0.85)}:{x:clamp(p.pos.x+(rand()-0.5)*14,5,95),y:clamp(p.pos.y+(rand()-0.5)*14,5,95)};
          if(sceneVersion!=="legacy")throwMajorUtility(p,nt,land,"opportunistic");else{
          const nadeId=`nd${fi}${p.id}`;
          const flightDistance=dist(p.pos,land);
          const flight=c5a2ProjectileProfile(nt,flightDistance);
          throwables.push({id:nadeId,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flightElapsedSec:0,flightDistance:Number(flightDistance.toFixed(4)),...flight,flying:true,detonate:false});throwerByNadeId[nadeId]=p.id;
          if(nt==="flash"&&enemy)enemy.flash=Math.max(enemy.flash,4);
          }
          if(nt==="flash")casts.push(`⚡ ${p.name} 丟出閃光彈`);else if(nt==="he")casts.push(`💥 ${p.name} 高爆彈攻擊`);
        }
      });
      // 所有移動分支完成後再做一次 pairwise separation，避免路線／待機／撤退
      // 各自合法卻在同一 tick 把兩名角色推到同一個位置。
      if(sceneVersion==="legacy"||!buyP)separateFpsPlayers(ps,walls,movementAudit);
      if(sceneVersion!=="legacy")ps.forEach(p=>{p.elevation=fpsMajorElevation(mapKey,p.pos);});
      ps.forEach(p=>{
        const locomotion=c5a2LocomotionFor(p);p.velocityUnitsPerSec=locomotion.velocityUnitsPerSec;p.velocity=locomotion.velocity;p.locomotion=locomotion.locomotion;
        if(!p.dead&&movementAudit.locomotionSamples[p.locomotion]!=null)movementAudit.locomotionSamples[p.locomotion]+=1;
        movementAudit.positionSamples+=1;
        const finite=Number.isFinite(p.pos?.x)&&Number.isFinite(p.pos?.y);
        if(!finite){movementAudit.nonFinitePositions+=1;return;}
        const spawn=spawnPointFor(p),spawnDistance=spawn?dist(p.pos,spawn):null,previousSpawnDistance=Number.isFinite(p._spawnDistance)?p._spawnDistance:null;
        if(!buyP&&Number.isFinite(spawnDistance)){
          if(spawnDistance>=10){p._leftSpawn=true;p._spawnPeakDistance=Math.max(Number(p._spawnPeakDistance)||0,spawnDistance);}
          const spawnRegression=Boolean(p._leftSpawn&&Number(p._spawnPeakDistance)>=12&&spawnDistance<=Number(p._spawnPeakDistance)-6);
          const routeId=p._routePlan?.routeId||null;
          const build=p._lastRouteBuild||{};
          if(spawnRegression&&p._spawnRegressionRouteId!==routeId){
            const regression={playerId:p.id,round:rnd+1,roundSec:sec,phase:tacticalPhaseFor(sec,planted),spawnDistanceBefore:previousSpawnDistance==null?null:Number(previousSpawnDistance.toFixed(3)),spawnDistanceAfter:Number(spawnDistance.toFixed(3)),spawnPeakDistance:Number(p._spawnPeakDistance.toFixed(3)),routeId,routeSource:build.routeSource||p._routePlan?.kind||null,routeIndexBefore:build.routeIndexBefore??null,routeIndexAfter:p.routeIdx,tactic:build.tactic||p._activeTacticId||null,currentTarget:target,separationRebase:Boolean(build.separationRebase),stuckRecovery:Boolean(build.stuckRecovery),routeRebuildReason:build.routeRebuildReason||null,staleSpawnAnchor:Boolean(build.staleSpawnAnchor)};
            if(navigationAudit.spawnDistanceRegressions.length<128)navigationAudit.spawnDistanceRegressions.push(regression);
            if(build.staleSpawnAnchor&&navigationAudit.returnToSpawnEvents.length<128)navigationAudit.returnToSpawnEvents.push(regression);
            p._spawnRegressionRouteId=routeId;
          }
        }
        if(Number.isFinite(spawnDistance))p._spawnDistance=spawnDistance;
        if(!p.dead&&blocked(p.pos,walls,PLAYER_R))movementAudit.blockedPositions+=1;
        // Separation is a legal post-move correction. Audit route movement
        // against the pre-separation endpoint so a crowded contact is not
        // misclassified as a teleport or a direct wall crossing.
        const movementEnd=p._preSeparationPos||p.pos,step=dist(p.prevPos||movementEnd,movementEnd);if(!buyP){movementAudit.maxStep=Math.max(movementAudit.maxStep,step);if(step>6.5*C5A2_SIM_STEP_RATIO*1.1)movementAudit.teleportViolations+=1;if(step>0.05&&lineBlocked(p.prevPos||movementEnd,movementEnd,walls)){movementAudit.wallSegmentCrossings+=1;if(movementAudit.wallCrossingSamples.length<24)movementAudit.wallCrossingSamples.push({id:p.id,round:rnd,roundSec:sec,state:p.state,from:{...p.prevPos},to:{...movementEnd},step:Number(step.toFixed(3))});}}
      });
      if(sceneVersion==="legacy"){
        if(sec===18)(attackTactic.smokes||[]).forEach(sk=>{const n=N[sk];if(n)smokes.push({id:`s${rnd}${sk}`,pos:{...n},tl:18,age:0});});
        if(sec===24)(attackTactic.mollys||[]).forEach(mk=>{const n=N[mk];if(n)mollys.push({id:`m${rnd}${mk}`,pos:{...n},tl:8});});
      }else{
        for(const player of ps){const utility=chooseFpsContextUtility({player,players:ps,intel:majorIntel,nodes:N,target,planted,bombPos:c4pos,roundSec:sec,smokes,throwables,walls,lineBlocked,onSkip:(reason,type)=>{
          const audit=buyAudit.rounds.at(-1).players.find(p=>p.id===player.id);
          audit.utilityNoUseReasons??={};
          const counts=audit.utilityNoUseReasons[type]??={};counts[reason]=(counts[reason]??0)+1;
        },onWindow:(type,reason,plan)=>{
          const audit=buyAudit.rounds.at(-1).players.find(p=>p.id===player.id),window=audit.utilityWindows[type]??={planId:plan?.id||null,observations:{},firstEligibleSec:null};
          window.observations[reason]=(window.observations[reason]??0)+1;if(reason==='eligible'&&window.firstEligibleSec===null)window.firstEligibleSec=sec;
        }});
          if(utility)throwMajorUtility(player,utility.type,utility.to,utility.intent,utility.planId,utility.purchasePurpose);}

      }
      // Buy phase is the only global combat lock. Once the round is live, route
      // execution is tactical intent and must never suppress legal acquisition.
      if(!buyP&&aliveT.length&&aliveCT.length){
        let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);const tAuth=weaponAuthority(tp.gun),cAuth=weaponAuthority(cp.gun);const rangeVisible=weaponInRange(d,tAuth)||weaponInRange(d,cAuth);const lineOfSight=!lineBlocked(tp.pos,cp.pos,walls);const smokeBlocked=smokeBlocks(tp.pos,cp.pos,smokes);const visibilityRange=Math.max(55,tAuth.range,cAuth.range);const visibleCandidate=d<visibilityRange&&rangeVisible&&lineOfSight&&!smokeBlocked;const fovT=csTargetInFov(tp,cp),fovCT=csTargetInFov(cp,tp);const flankT=csFlankGeometry(tp,cp),flankCT=csFlankGeometry(cp,tp);const mapAwareT=mapAwareCanReadVisibleCandidate(tp,d,visibleCandidate,tAuth)&&fovT;const mapAwareCT=mapAwareCanReadVisibleCandidate(cp,d,visibleCandidate,cAuth)&&fovCT;combatAudit.losChecks+=1;combatAudit.fovChecks+=2;if(flankT)combatAudit.flankCandidates+=1;if(flankCT)combatAudit.flankCandidates+=1;
          if(visibleCandidate&&(mapAwareT||mapAwareCT)){
            const freshPair=!activeReactionEpisodes.has(reactionKey(tp,cp))||!activeReactionEpisodes.has(reactionKey(cp,tp));
            if(mapAwareT){const episode=ensureReactionEpisode(tp,cp,sec,d,tp.gun,lineOfSight,mapAwareT,fovT,flankT);visibleReactionKeys.add(reactionKey(tp,cp));episode.distance=Math.round(d*100)/100;combatAudit.targetAcquisitions+=1;combatAudit.targetLocks+=1;}
            if(mapAwareCT){const episode=ensureReactionEpisode(cp,tp,sec,d,cp.gun,lineOfSight,mapAwareCT,fovCT,flankCT);visibleReactionKeys.add(reactionKey(cp,tp));episode.distance=Math.round(d*100)/100;combatAudit.targetAcquisitions+=1;combatAudit.targetLocks+=1;}
            pairs.push([tp,cp,d,mapAwareT,mapAwareCT,freshPair,{lineOfSight,smokeBlocked,fovT,fovCT,flankT,flankCT}]);
            combatAudit.candidatePairs+=1;
          }
        }));
        const contactNowMs=Math.round(sec*1000);
        const combatWindowEndMs=contactNowMs+C5A2_SIM_STEP_MS;
        // 排序用「有效距離」：狙擊架點專長遠距 → 加權使其搶得到交火名額（避免狙擊整局零參與）
        const effD=pr=>pr[2]*((GUNS[pr[0].gun]?.cls==="狙擊"||GUNS[pr[1].gun]?.cls==="狙擊")?0.45:1);
        pairs.sort((a,b)=>effD(a)-effD(b));
        // 狙擊 pair 優先且不佔一般交火名額 → 確保狙擊架點先手能開火（避免狙擊整局零參與）
        const isSniperPair=pr=>GUNS[pr[0].gun]?.cls==="狙擊"||GUNS[pr[1].gun]?.cls==="狙擊";
        // Pair ordering is part of the stable authoritative outcome. Reaction
        // telemetry records visibility/acquisition, but it must not reorder
        // targets or starve an otherwise legal pair.
        const readyAtForPair=pr=>{
          const [tp,cp,,mapAwareT,mapAwareCT]=pr;
          const tReady=mapAwareT&&activeReactionEpisodes.get(reactionKey(tp,cp))?.reactionReadyAtMs;
          const cReady=mapAwareCT&&activeReactionEpisodes.get(reactionKey(cp,tp))?.reactionReadyAtMs;
          return Math.min(Number.isFinite(tReady)?tReady:Infinity,Number.isFinite(cReady)?cReady:Infinity);
        };
        const ordered=[...pairs].sort((a,b)=>{const ra=readyAtForPair(a),rb=readyAtForPair(b);const aReady=Number.isFinite(ra)&&ra<=combatWindowEndMs,bReady=Number.isFinite(rb)&&rb<=combatWindowEndMs;if(aReady!==bReady)return aReady?-1:1;if(aReady&&ra!==rb)return ra-rb;if(a[5]!==b[5])return a[5]?-1:1;const sa=isSniperPair(a),sb=isSniperPair(b);if(sa!==sb)return sa?-1:1;return effD(a)-effD(b);});
        const usedT=new Set(),usedCT=new Set();
        // Preserve the stable C4 pairing budget. The C5A fire clock gives a
        // pair its real cadence inside this budget; it must not let a single
        // actor/target reservation reshape round outcomes.
        const maxEngage=Math.min(pairs.length,Math.max(2,Math.ceil((aliveT.length+aliveCT.length)/3)));
        let done=0;
        const pendingShotKills=new Map();
        const flushShotKills=()=>{for(const {at,df,meta}of pendingShotKills.values())if(!df.dead)finalizeKill(at,df,meta);pendingShotKills.clear();};
        let shotQueue=null;
        if(sceneVersion!=="legacy"){
          const candidates=[];
          for(const pair of ordered){const [tp,cp,d,canT,canCT]=pair;for(const [actor,target,visible,forcedTw]of [[tp,cp,canT,true],[cp,tp,canCT,false]]){
            if(!visible||actor.dead||target.dead||actor.blindSec>0||actor.hasBomb&&(actor.plantProgressSec||0)>0)continue;
            const episode=activeReactionEpisodes.get(reactionKey(actor,target));if(!episode)continue;
            if(episode.targetAcquiredAtMs==null){episode.targetAcquiredAtMs=contactNowMs;episode.reactionReadyAtMs=contactNowMs+episode.reactionDelayMs;if(episode.routeActiveAtAcquisition)combatAudit.routeInterruptAcquisitions+=1;}
            candidates.push({actor,target,pair,forcedTw,reactionReadyAtMs:episode.firstAuthoritativeShotAtMs==null?episode.reactionReadyAtMs:contactNowMs,distance:d,priority:actor._combatTargetId===target.id?1:0});
          }}
          shotQueue=createFpsDirectedShotQueue({candidates,windowStartMs:contactNowMs,windowEndMs:combatWindowEndMs,
            getWeaponReadyAtMs:(actor,t)=>fpsWeaponReadyAtMs(actor,t),getIntervalMs:actor=>weaponAuthority(actor.gun).intervalMs,
            getCadenceReadyAtMs:actor=>Math.max(contactNowMs,fireClockByActor.get(actor.id)||contactNowMs,(lastShotAtByActor.get(actor.id)??-Infinity)+weaponAuthority(actor.gun).intervalMs),
            isActorAvailable:actor=>!actor.dead&&!(actor.blindSec>0)&&!(actor.hasBomb&&(actor.plantProgressSec||0)>0),
            isCandidateVisible:c=>canEngage(c.actor,c.target,walls,smokes,prog)});
        }
        const engagements=sceneVersion==="legacy"?ordered:{[Symbol.iterator]:function*(){let time=null,op;try{while((op=shotQueue.next())){if(time!==null&&op.shotAtMs>time)flushShotKills();time=op.shotAtMs;yield [...op.pair,op.forcedTw,op.shotAtMs,op];}}finally{flushShotKills();}}};
        for(const[tp,cp,d,mapAwareT,mapAwareCT,freshPair,pairMeta,forcedTw,opportunityAtMs,queueOp] of engagements){
          let queueFired=false,queueShotAtMs=opportunityAtMs;
          try{
          const sniperInvolved=isSniperPair([tp,cp]);
          if(sceneVersion==="legacy"&&!sniperInvolved&&done>=maxEngage)break;
          if(tp.dead||cp.dead||sceneVersion==="legacy"&&(usedT.has(tp.id)||usedCT.has(cp.id)))continue;
          if(mapAwareT){const episode=activeReactionEpisodes.get(reactionKey(tp,cp));if(episode&&episode.targetAcquiredAtMs==null){episode.targetAcquiredAtMs=Math.round(sec*1000);episode.reactionReadyAtMs=episode.targetAcquiredAtMs+episode.reactionDelayMs;if(episode.routeActiveAtAcquisition)combatAudit.routeInterruptAcquisitions+=1;}}
          if(mapAwareCT){const episode=activeReactionEpisodes.get(reactionKey(cp,tp));if(episode&&episode.targetAcquiredAtMs==null){episode.targetAcquiredAtMs=Math.round(sec*1000);episode.reactionReadyAtMs=episode.targetAcquiredAtMs+episode.reactionDelayMs;if(episode.routeActiveAtAcquisition)combatAudit.routeInterruptAcquisitions+=1;}}
          let fireChance=d<15?0.85:d<30?0.55:(sniperInvolved?0.55:0.3);
          fireChance*=(0.55+0.5*Math.max(aggr(tp),aggr(cp))); // 進攻性影響交火意願（雙方都龜縮→少對槍）
          if(!contactCalled){contactCalled=true;const spotter=sceneVersion==="legacy"||canEngage(cp,tp,walls,smokes,prog)?cp:tp,observed=spotter===cp?tp:cp;
            const visibleCount=sceneVersion==="legacy"?aliveT.length:ps.filter(e=>e.side!==spotter.side&&canEngage(spotter,e,walls,smokes,prog)).length;
            comms.push({side:spotter.side,...(sceneVersion!=="legacy"?{senderId:spotter.id}:{}),name:spotter.name,text:sceneVersion==="legacy"?`${nearCO(tp.pos)} 有人，${aliveT.length} 個！`:`${nearCO(observed.pos)} 看到 ${visibleCount} 人！`});
            const handoffReceiver=applyCommsHandoff(spotter,observed,ps,walls);if(handoffReceiver&&handoffReceiver.route){assignRoute(handoffReceiver,handoffReceiver.route,{kind:"comms-handoff",phase:tacticalPhaseFor(sec,planted),objective:"handoff",roundSec:sec,routeSignature:"comms-handoff"});
              if(sceneVersion!=="legacy")comms.push({side:handoffReceiver.side,senderId:handoffReceiver.id,name:handoffReceiver.name,text:"收到報點，我來補位"});}}
          // 對槍勝負由雙方 16 項素質 + 武器 + 情境決定（非隨機）
          const tHold=(tp.state==="架槍"||tp.state==="HOLD"),cHold=(cp.state==="架槍"||cp.state==="HOLD");
          const tSk=combatSkill(tp,{holding:tHold,entry:tp.role==="entry"&&!tHold,lurk:tp.role==="lurker"&&tHold,lastAlive:aliveT.length===1,lowHP:tp.hp<40});
          const cSk=combatSkill(cp,{holding:cHold,entry:cp.role==="entry"&&!cHold,lurk:cp.role==="lurker"&&cHold,lastAlive:aliveCT.length===1,lowHP:cp.hp<40});
          const ecoEdge=(ecoCT&&!ecoT)?0.16:(ecoT&&!ecoCT)?-0.16:0;
          const flashPen=((sceneVersion==="legacy"?tp.flash:tp.blindSec)>0?-0.12:0)+((sceneVersion==="legacy"?cp.flash:cp.blindSec)>0?0.12:0);
          // Side is not a player-team handicap.  Keep the engagement contest
          // symmetric and let roster, weapon authority, economy, utility,
          // tactics, and geometry provide the actual evidence.
          const Pt=clamp(0.5+(tSk-cSk)*0.013+ecoEdge+flashPen+tacEdge,0.07,0.93);
          let tw=sceneVersion==="legacy"?combatRand()<Pt:forcedTw;
          if(sceneVersion!=="legacy"){
            const tReady=mapAwareT&&fpsWeaponReadyAtMs(tp,contactNowMs)<combatWindowEndMs,cReady=mapAwareCT&&fpsWeaponReadyAtMs(cp,contactNowMs)<combatWindowEndMs;
            if(!tReady&&!cReady)continue;
            if(tReady!==cReady)tw=tReady;
          }
          const at=tw?tp:cp,df=tw?cp:tp;
          if(sceneVersion!=="legacy"&&at.hasBomb&&(at.plantProgressSec||0)>0)continue;
          const attackerMapAware=tw?mapAwareT:mapAwareCT;if(!attackerMapAware)continue;
          const attackerFov=tw?pairMeta?.fovT:pairMeta?.fovCT;
          const attackerFlank=tw?pairMeta?.flankT:pairMeta?.flankCT;
          const permission=csEngagementPermission(tw?tp:cp,tw?cp:tp,d,weaponAuthority((tw?tp:cp).gun),{lineOfSight:pairMeta?.lineOfSight,fov:attackerFov,smokeBlocked:pairMeta?.smokeBlocked});
          if(!permission){combatAudit.routeBlockedEngagements+=0;continue;}
          combatAudit.engagementPermissions+=1;
          const actorEpisode=activeReactionEpisodes.get(reactionKey(at,df));
          if(actorEpisode){actorEpisode.engagementPermission=true;if(actorEpisode.routeActiveAtAcquisition&&!actorEpisode.routeInterrupted){actorEpisode.routeInterrupted=true;actorEpisode.routePreservedAfterEngage=Array.isArray(at.route)&&at.route.length>0;combatAudit.routeInterruptPermissions+=1;}}
          const engagementKey=reactionKey(at,df);
          const fireKey=at.id;
          combatAudit.fireRolls+=1;
          const scheduledShotAtMs=fireClockByActor.get(fireKey);
          const hasCadenceClock=Number.isFinite(scheduledShotAtMs);
          const reactionShotAtMs=actorEpisode?.firstAuthoritativeShotAtMs==null&&Number.isFinite(actorEpisode?.reactionReadyAtMs)?actorEpisode.reactionReadyAtMs:null;
          const firstContactReady=Boolean(Number.isFinite(reactionShotAtMs)&&!hasCadenceClock);
          if(sceneVersion==="legacy"&&!firstContactReady&&!hasCadenceClock&&combatRand()>=fireChance)continue;
          const synergyPartner=synergyTradeCandidate(at,df,ps,walls);
          const synergyReady=Boolean(synergyPartner&&Math.max(persStat(at,"coo"),persStat(synergyPartner,"coo"))>=SYNERGY_TRADE_THRESHOLD&&(sceneVersion==="legacy"||at._synergyTargetId!==df.id||sec-(at._lastSynergyAtSec??-Infinity)>=3));
          const synergySecond=synergyReady?synergyCoverFollowUpRoute(at,synergyPartner,df):null;
          if(synergyReady){
            if(sceneVersion!=="legacy"){at._synergyTargetId=df.id;at._lastSynergyAtSec=sec;}
            synergyPartner.va=Math.atan2(df.pos.y-synergyPartner.pos.y,df.pos.x-synergyPartner.pos.x)*180/Math.PI;synergyPartner.state="ENGAGE";if(sceneVersion==="legacy")synergyPartner.shooting=Math.max(synergyPartner.shooting,1);
            if(synergySecond){assignRoute(at,synergySecond,{kind:"trade-cover",phase:tacticalPhaseFor(sec,planted),objective:"trade-cover",roundSec:sec,routeSignature:"trade-cover"});at.state="ROTATE";}
          }
          const g=GUNS[at.gun],auth=weaponAuthority(at.gun);if(!g)continue;
          const reactionEpisode=activeReactionEpisodes.get(reactionKey(at,df));
          if((Number.isFinite(scheduledShotAtMs)&&scheduledShotAtMs>combatWindowEndMs)||(Number.isFinite(reactionShotAtMs)&&reactionShotAtMs>=combatWindowEndMs)){combatAudit.scheduledSkips+=1;continue;}
          const handlingReadyAtMs=sceneVersion!=="legacy"?fpsWeaponReadyAtMs(at,contactNowMs):contactNowMs;
          if(handlingReadyAtMs>=combatWindowEndMs)continue;
          // Do not consume the per-tick pair reservation until this pair is
          // actually ready to emit. A deferred cadence clock must not starve
          // another legal target for multiple snapshots.
          if(sceneVersion==="legacy"){usedT.add(tp.id);usedCT.add(cp.id);if(!sniperInvolved)done++;}
          const rawAccuracy=at.stats?.acc||80,effectiveAccuracy=at.stats?.acc!=null?persStat(at,"acc"):rawAccuracy;
          const automatic=auth.fireMode==="automatic";
          const actorPreviousShotAtMs=lastShotAtByActor.get(fireKey);
          // A weapon swap must not inherit a shorter ready time from the old
          // weapon (for example Glock 500ms -> Scout 900ms).
          const authorityReadyAtMs=Number.isFinite(actorPreviousShotAtMs)?actorPreviousShotAtMs+auth.intervalMs:contactNowMs;
          let authoritativeShotAtMs=Math.max(contactNowMs,authorityReadyAtMs,handlingReadyAtMs,Number.isFinite(scheduledShotAtMs)?scheduledShotAtMs:contactNowMs,Number.isFinite(reactionShotAtMs)?reactionShotAtMs:contactNowMs);
          if(queueOp)authoritativeShotAtMs=Math.max(authoritativeShotAtMs,opportunityAtMs);
          let emittedShots=0;
          while(authoritativeShotAtMs<combatWindowEndMs&&emittedShots<(queueOp?1:automatic?auth.maxShotsPerTrigger:1)&&!df.dead){
            const roundedShotAtMs=Math.round(authoritativeShotAtMs);
            let ammoBeforeShot=null;
            if(sceneVersion!=="legacy"){
              const consumed=consumeFpsWeaponShot(at,roundedShotAtMs);Object.assign(at,consumed.state);
              if(!consumed.fired){authoritativeShotAtMs=fpsWeaponReadyAtMs(at,roundedShotAtMs);break;}
              ammoBeforeShot=consumed.ammoBefore;
            }
            const previousShotAtMs=lastShotAtByActor.get(fireKey);
            const rangeFactor=clamp(1-(d/Math.max(1,auth.range))*0.35,0.58,1);
            const skillFactor=sceneVersion==="legacy"?1:clamp(1+(tw?tSk-cSk:cSk-tSk)*.004,.75,1.2);
            const hitChance=clamp(auth.accuracy*(0.46+effectiveAccuracy/210)*rangeFactor*skillFactor,0.32,0.92)*(sceneVersion!=="legacy"&&at.blindSec>0?.55:1);
            const hit=combatRand()<hitChance;
            const isHS=hit&&combatRand()<g.hs*(0.72+0.55*(effectiveAccuracy/100))*auth.accuracy;
            let killed=false,damage=0;
            if(hit&&(sceneVersion==="legacy"||df.hp>0)){
              let dmg=(g.dmg+Math.floor(combatRand()*40))*(isHS?2:1);
              if(df.armor&&!isHS)dmg*=0.72;
              ({killed,effectiveDamage:damage}=applyDamage(at,df,Math.round(dmg)));
              if(queueOp&&killed&&pendingShotKills.has(df.id))killed=false;
              combatAudit.damageEvents+=1;
            }
            combatAudit.shotEvents+=1;
            if(reactionEpisode){
              if(reactionEpisode.firePermissionAtMs==null)reactionEpisode.firePermissionAtMs=reactionEpisode.reactionReadyAtMs??roundedShotAtMs;
              if(reactionEpisode.firstAuthoritativeShotAtMs==null){
                reactionEpisode.firstAuthoritativeShotAtMs=roundedShotAtMs;
                reactionEpisode.latencyMs=Math.max(0,reactionEpisode.firstAuthoritativeShotAtMs-reactionEpisode.visibleAtMs);
                reactionEpisode.shot=true;
                if(reactionEpisode.routeActiveAtAcquisition){reactionEpisode.routePreservedAfterEngage=reactionEpisode.routePreservedAfterEngage||(Array.isArray(at.route)&&at.route.length>0);combatAudit.routeInterruptFirstShots+=1;}
              }
            }
            const eventId=`shot-${rnd}-${fi}-${++shotSequence}`;
            shotCadenceTelemetry.push({eventId,attackerId:at.id,targetId:df.id,gun:at.gun,weaponFamily:auth.family,shotAtMs:roundedShotAtMs,profileIntervalMs:Math.round(auth.intervalMs),actualIntervalMs:Number.isFinite(previousShotAtMs)?roundedShotAtMs-previousShotAtMs:null,round:rnd,hit,damage:Number(damage||0),fov:Boolean(attackerFov),lineOfSight:Boolean(pairMeta?.lineOfSight),targetLock:true,engagementPermission:true,flank:Boolean(attackerFlank),...(sceneVersion!=="legacy"?{ammoBefore:ammoBeforeShot,ammoAfter:at.ammo}:{})});
            lastShotAtByActor.set(fireKey,roundedShotAtMs);
            if(queueOp){queueFired=true;queueShotAtMs=roundedShotAtMs;at._combatTargetId=df.id;}
            const missAngle=(combatRand()-0.5)*0.36,missDistance=hit?0:Math.max(1.5,d*0.08);
            const tracerTo=hit?{x:df.pos.x,y:df.pos.y}:{x:df.pos.x+Math.cos(missAngle+at.va*Math.PI/180)*missDistance,y:df.pos.y+Math.sin(missAngle+at.va*Math.PI/180)*missDistance};
            tracers.push({id:`tr-${eventId}`,eventId,from:{...at.pos},to:tracerTo,tl:1,visualLifetimeMs:95,shotAtMs:roundedShotAtMs,color:at.side==="ct"?"#7dd3fc":"#fdba74",hit,sniper:auth.family==="sniper",attackerId:at.id,gun:at.gun,weaponFamily:auth.family,surface:hit?"player":"concrete",reactionId:reactionEpisode?.id||null});
            muzzles.push({id:`mz-${eventId}`,eventId,pos:{...at.pos},side:at.side,va:at.va,attackerId:at.id,gun:at.gun,weaponFamily:auth.family,tl:1,visualLifetimeMs:110,shotAtMs:roundedShotAtMs,big:auth.family==="sniper",cls:g.cls,kill:killed,distance:d,...(sceneVersion!=="legacy"?{hit,damage:Number(damage||0),targetId:df.id}:{}),reactionId:reactionEpisode?.id||null});
            emittedShots+=1;authoritativeShotAtMs+=auth.intervalMs;
            if(killed){const meta={weapon:at.gun,isHS,distance:d,killAtSec:roundedShotAtMs/1000};if(queueOp)pendingShotKills.set(df.id,{at,df,meta});else finalizeKill(at,df,meta);}
          }
          fireClockByActor.set(fireKey,authoritativeShotAtMs);
          if(emittedShots>0){if(sceneVersion==="legacy"){at.flash=3;df.flash=3;}at.state="ENGAGE";df.state="ENGAGE";at.shooting=df.dead?1:2;if(attackerFlank)combatAudit.flankEngagements+=1;}
          if(df.dead){}
          else if(df.hp<35&&combatRand()<0.25){comms.push({side:df.side,name:df.name,text:"我殘血，先撤一下"});}
          }finally{if(queueOp)shotQueue.afterShot(queueOp,{fired:queueFired,shotAtMs:queueShotAtMs,nextReadyAtMs:queueFired?fpsWeaponReadyAtMs(queueOp.actor,queueShotAtMs):Math.max(fpsWeaponReadyAtMs(queueOp.actor,queueShotAtMs),queueShotAtMs+1)});}
        }
      }
      if(!planted&&(sceneVersion==="legacy"?prog>0.4:!buyP)){
        const sitePos=N[target==="a"?"aSite":"bSite"];const carrier=ps.find(p=>p.side==="t"&&!p.dead&&p.hasBomb);
        if(carrier){
          if(sceneVersion!=="legacy"&&dist(carrier.pos,sitePos)>=9)carrier.plantProgressSec=0;
          const endsNear=carrier.route.length&&dist(carrier.route[carrier.route.length-1],sitePos)<10;
          if(!endsNear&&dist(carrier.pos,sitePos)>8&&(sceneVersion==="legacy"||carrier.attackStage?.canAdvance)&&carrier.fakeStage!=="approach"){const ap=N[target==="a"?"aConn":"car"];assignRoute(carrier,ap?[carrier.pos,ap,sitePos]:[carrier.pos,sitePos],{kind:"site-execute",phase:tacticalPhaseFor(sec,planted),objective:"plant",roundSec:sec,routeSignature:ap?`${target}Approach>${target}Site`:`${target}Site`});}
          if(dist(carrier.pos,sitePos)<9&&(sceneVersion==="legacy"||carrier.fakeStage!=="approach")){const ctNear=aliveCT.filter(cp=>dist(cp.pos,sitePos)<13&&!lineBlocked(carrier.pos,cp.pos,walls)).length;const safeToPlant=ctNear===0;
            if(sceneVersion!=="legacy")carrier.plantProgressSec=safeToPlant?(carrier.plantProgressSec||0)+C5A2_SIM_STEP_SEC:0;
            const canPlant=sceneVersion==="legacy"?((ctNear===0&&rand()<0.55)||(ctNear<=1&&aliveT.length>aliveCT.length&&rand()<0.18)):carrier.plantProgressSec>=3;
            if(canPlant){planted=true;c4pos={...sitePos};c4t=20;carrier.hasBomb=false;carrier.state="安裝中";carrier.money+=300;casts.push(`💣 ${carrier.name} 安裝炸彈！`);highlights.push({fi,label:`R${rnd+1} 炸彈安裝`});
            bombAudit.plantEvents.push({round:rnd+1,roundSec:sec,site:target,position:{...c4pos},carrierId:carrier.id,carrierName:carrier.name,...(sceneVersion!=="legacy"?{carrierPosition:{...carrier.pos}}:{}),score:{t:tScore,ct:ctScore},aliveT:aliveT.length,aliveCT:aliveCT.length});
            bombAudit.objectiveTransitions.push({round:rnd+1,roundSec:sec,from:"PLANTING",to:"PLANTED",side:"t",site:target});
            aliveT.filter(p=>p.id!==carrier.id&&!p.dead&&!p.reassigned).forEach(p=>{const anchor=sceneVersion!=="legacy"&&preMatchLayout.postPlantMode==="crossfire"?selectFpsCrossfireAnchor({player:p,players:ps,nodes:N,target}):tacticalPostPlantAnchor(p,tacticForSidePhase("t",CS_TACTICAL_PHASES.POST_PLANT),N,target,preMatchLayout.postPlantMode);if(anchor){p._adaptivePostPlant=true;assignRoute(p,[p.pos,anchor],{kind:"post-plant-cover",phase:CS_TACTICAL_PHASES.POST_PLANT,objective:"post-plant-hold",roundSec:sec,routeSignature:`post-plant>${target}`});p.objectiveState="HOLD_ANGLE";p.state="POST_PLANT";}});
            comms.push({side:"t",name:carrier.name,text:`包下了，${target==="a"?"A":"B"} 點，全員交叉！`});const bombAwareReceiver=applyCommsBombAwareness(carrier,c4pos,aliveT);if(bombAwareReceiver){assignRoute(bombAwareReceiver,bombAwareReceiver.route,{kind:"bomb-awareness",phase:CS_TACTICAL_PHASES.POST_PLANT,objective:"post-plant-hold",roundSec:sec,routeSignature:"bomb-awareness"});comms.push({side:"t",name:bombAwareReceiver.name,text:"收到包點資訊，調整路線"});}
            const cd=aliveCT[0];if(cd)comms.push({side:"ct",name:cd.name,text:`${target==="a"?"A":"B"} 響了，全員回防拆彈！`});
            // 炸彈安裝後：所有存活警察立刻往包點移動（回防 / 拆彈）
            const appr=target==="a"?N.aConn:N.bTop;
            aliveCT.forEach(cp=>{const tacticalRoute=tacticalRetakeRoute(cp,tacticForSidePhase("ct",CS_TACTICAL_PHASES.POST_PLANT),N,c4pos);cp.reassigned=false;assignRoute(cp,tacticalRoute||(appr&&dist(cp.pos,appr)>6?[cp.pos,appr,c4pos]:[cp.pos,c4pos]),{kind:"retake",phase:CS_TACTICAL_PHASES.POST_PLANT,objective:"retake",roundSec:sec,routeSignature:`retake>${target}>c4`});cp.objectiveState="RETAKE";cp.state="RETAKE";bombAudit.retakeAssignments+=1;});}}
        }
      }
      smokes=smokes.map(s=>({...s,tl:s.tl-C5A2_SIM_STEP_RATIO,age:(s.age||0)+C5A2_SIM_STEP_RATIO})).filter(s=>s.tl>0);
      mollys.forEach((m,zoneIndex)=>{
        const sourceId=String(m.id).startsWith("mnd")?String(m.id).slice(1):null;if(!sourceId)return;
        const at=ps.find(pl=>pl.id===throwerByNadeId[sourceId]);if(!at)return;
        ps.forEach(df=>{if(df.dead||df.side===at.side)return;const d=dist(df.pos,m.pos);if(d>=MOLLY_R||lineBlocked(m.pos,df.pos,walls))return;const {killed}=applyDamage(at,df,MOLLY_DAMAGE_PER_TICK,"molly",sourceId);if(killed)finalizeKill(at,df,{weapon:"molly",distance:d,sourceId});});
      });
      mollys=mollys.map(m=>({...m,tl:m.tl-C5A2_SIM_STEP_RATIO})).filter(m=>m.tl>0);
      if(planted&&!bombPlantEventEmitted&&c4pos){bombPlantEventEmitted=true;const plantEvent=bombAudit.plantEvents.at(-1);events.push({id:`bomb-planted-${rnd+1}`,type:"bomb-planted",round:rnd+1,roundSec:sec,site:target,playerId:plantEvent?.carrierId||null,playerName:plantEvent?.carrierName||null,position:{...c4pos},pos:{...c4pos}});}
      throwables=throwables.map(tw=>{if(tw.flying){if(sceneVersion!=="legacy"&&tw.thrownAtRoundSec===sec)return tw;tw.flightElapsedSec=(tw.flightElapsedSec||0)+C5A2_SIM_STEP_SEC;tw.t=clamp(tw.flightElapsedSec/Math.max(0.1,tw.flightDurationSec||C5A2_PROJECTILE_FLIGHT_SEC),0,1);if(tw.t>=1){tw.flying=false;tw.detonate=true;tw.boom=3;
        if(sceneVersion!=="legacy"){tw.detonatedAtRoundSec=sec;events.push({id:`utility-detonate-${tw.id}`,type:"utility-detonate",round:rnd+1,roundSec:sec,playerId:tw.throwerId,throwableId:tw.id,utility:tw.type,pos:{...tw.to}});}
        if(tw.type==="flash"){ps.forEach(pl=>{if(sceneVersion!=="legacy"){pl.blindSec=Math.max(pl.blindSec||0,fpsFlashDurationSec({player:pl,throwable:tw,walls,lineBlocked}));return;}if(pl.dead)return;const d=dist(pl.pos,tw.to);if(d<24&&!lineBlocked(pl.pos,tw.to,walls)){const enemy=pl.side!==tw.side;pl.flash=Math.max(pl.flash,enemy?(d<12?6:4):(d<8?3:0));}});}
        if(tw.type==="he"){const at=ps.find(pl=>pl.id===throwerByNadeId[tw.id]);if(at)ps.forEach(df=>{if(df.dead||df.side===tw.side)return;const d=dist(df.pos,tw.to);if(d>=HE_R||lineBlocked(tw.to,df.pos,walls))return;const rawDamage=Math.max(0,Math.round(HE_MAX_DAMAGE*(1-d/HE_R)));const damage=Math.round(rawDamage*(df.armor?HE_ARMOR_SCALE:1));if(damage<=0)return;const {killed}=applyDamage(at,df,damage,"he",tw.id);if(killed)finalizeKill(at,df,{weapon:"he",distance:d,sourceId:tw.id});});}
        if(tw.type==="smoke")smokes.push({id:`s${tw.id}`,pos:{...tw.to},tl:18,age:0});
        if(tw.type==="molly")mollys.push({id:`m${tw.id}`,pos:{...tw.to},tl:MOLLY_TL});
      }}else if(tw.detonate){tw.boom--;}return tw;}).filter(tw=>tw.flying||tw.boom>0);
      if(sceneVersion!=="legacy"&&planted&&c4t!==null){
        majorDefuse=advanceFpsDefuse({previous:majorDefuse,players:ps,bombPos:c4pos,walls,lineBlocked,dtSec:C5A2_SIM_STEP_SEC,timerSec:c4t*C5A2_LEGACY_SNAPSHOT_SEC,rateFor:p=>p.stats?(0.45+persStat(p,"foc")/250+persStat(p,"dec")/300)/C5A2_LEGACY_SNAPSHOT_SEC:0.35});
        defuseProg=majorDefuse.progress;c4t-=C5A2_SIM_STEP_RATIO;bombAudit.timerSamples+=1;
        ps.filter(p=>!p.dead&&p.side==="ct").forEach(p=>{p.objectiveState=p.id===majorDefuse.defuserId?"DEFUSE":"COVER";if(p.id===majorDefuse.defuserId){p.state="拆彈中";p.va=Math.atan2(c4pos.y-p.pos.y,c4pos.x-p.pos.x)*180/Math.PI;}});
        for(const [type,id] of [["defuse-interrupt",majorDefuse.interrupted?majorDefuse.interruptedId:null],["defuse-start",majorDefuse.started?majorDefuse.defuserId:null]])if(id!==null)events.push({id:`${type}-${rnd+1}-${fi}`,type,round:rnd+1,roundSec:sec,playerId:id,pos:{...c4pos},position:{...c4pos}});
        if(majorDefuse.completed){roundEnd={winner:"ct",how:"defuse"};bombResultRecorded=true;defuseResultEventEmitted=true;bombAudit.defuseEvents.push({round:rnd+1,roundSec:sec,defuserId:majorDefuse.defuserId,progress:Number(defuseProg.toFixed(3))});bombAudit.objectiveTransitions.push({round:rnd+1,roundSec:sec,from:"DEFUSE",to:"DEFUSED",side:"ct",playerId:majorDefuse.defuserId});events.push({id:`bomb-defused-${rnd+1}`,type:"bomb-defused",round:rnd+1,roundSec:sec,playerId:majorDefuse.defuserId,pos:{...c4pos},position:{...c4pos}});}
        else if(majorDefuse.exploded){roundEnd={winner:"t",how:"bomb"};bombResultRecorded=true;bombAudit.explosionEvents.push({round:rnd+1,roundSec:sec,position:{...c4pos},timer:0});bombAudit.objectiveTransitions.push({round:rnd+1,roundSec:sec,from:"PLANTED",to:"EXPLODED",side:"t",site:target});}
      }
      if(sceneVersion==="legacy"&&planted&&c4t!==null){c4t-=C5A2_SIM_STEP_RATIO;bombAudit.timerSamples+=1;
        // 警察必須真的抵達包點且無匪徒壓制，才會累積拆彈進度（受專注力/決策影響）
        const defuseAliveCT=ps.filter(p=>p.side==="ct"&&!p.dead),defuseAliveT=ps.filter(p=>p.side==="t"&&!p.dead);
        const defuser=defuseAliveCT.find(cp=>dist(cp.pos,c4pos)<6);
        const contested=defuser&&defuseAliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));
        defuseAliveCT.filter(cp=>cp!==defuser).forEach(cp=>{cp.objectiveState="COVER";cp.state="COVER";});
        defuseAliveT.forEach(tp=>{tp.objectiveState="DENY_DEFUSE";tp.state="POST_PLANT";});
        bombAudit.coverAssignments+=defuseAliveCT.filter(cp=>cp!==defuser).length;
        if(defuser&&!contested){defuser.state="拆彈中";defuser.va=Math.atan2(c4pos.y-defuser.pos.y,c4pos.x-defuser.pos.x)*180/Math.PI;
          defuser.objectiveState="DEFUSE";
          defuseProg+=(defuser.stats?(0.45+persStat(defuser,"foc")/250+persStat(defuser,"dec")/300):0.7)*C5A2_SIM_STEP_RATIO;
          if(!defuseCalled){defuseCalled=true;comms.push({side:"ct",name:defuser.name,text:"我拆，掩護我！"});}}
        if(defuseProg>=3.5){roundEnd={winner:"ct",how:"defuse"};if(!bombResultRecorded){bombResultRecorded=true;bombAudit.defuseEvents.push({round:rnd+1,roundSec:sec,defuserId:defuser?.id||null,progress:Number(defuseProg.toFixed(3))});bombAudit.objectiveTransitions.push({round:rnd+1,roundSec:sec,from:"DEFUSE",to:"DEFUSED",side:"ct",playerId:defuser?.id||null});}}
        else if(c4t<=0){roundEnd={winner:"t",how:"bomb"};if(!bombResultRecorded){bombResultRecorded=true;bombAudit.explosionEvents.push({round:rnd+1,roundSec:sec,position:{...c4pos},timer:0});bombAudit.objectiveTransitions.push({round:rnd+1,roundSec:sec,from:"PLANTED",to:"EXPLODED",side:"t",site:target});}}
      }
      if(defuseCalled&&!defuseStartEventEmitted){const defuser=aliveCT.find(player=>player.objectiveState==="DEFUSE")||aliveCT.find(player=>player.state==="拆彈中");defuseStartEventEmitted=true;events.push({id:`defuse-start-${rnd+1}`,type:"defuse-start",round:rnd+1,roundSec:sec,playerId:defuser?.id||null,playerName:defuser?.name||null,position:c4pos?{...c4pos}:null,pos:c4pos?{...c4pos}:null});}
      if(defuseProg>=3.5&&!defuseResultEventEmitted){defuseResultEventEmitted=true;events.push({id:`bomb-defused-${rnd+1}`,type:"bomb-defused",round:rnd+1,roundSec:sec,playerId:aliveCT.find(player=>player.objectiveState==="DEFUSE")?.id||null,position:c4pos?{...c4pos}:null,pos:c4pos?{...c4pos}:null});}
      if(planted&&c4t<=0&&!explosionEventEmitted&&(sceneVersion==="legacy"||roundEnd?.how==="bomb")){explosionEventEmitted=true;events.push({id:`bomb-exploded-${rnd+1}`,type:"bomb-exploded",round:rnd+1,roundSec:sec,site:target,position:c4pos?{...c4pos}:null,pos:c4pos?{...c4pos}:null});}
      if(!roundEnd){
        if(aliveT.length===0&&!planted)roundEnd={winner:"ct",how:"elim"};
        else if(aliveCT.length===0)roundEnd={winner:"t",how:"elim"};
        else if(sec>=114&&(sceneVersion==="legacy"||!planted))roundEnd={winner:planted?"t":"ct",how:"time"};
      }
      for(const[key] of activeReactionEpisodes){if(!visibleReactionKeys.has(key))activeReactionEpisodes.delete(key);}
      // roundHist is append-only. Keep one shared immutable-by-prefix array and
      // record the visible prefix length instead of cloning the growing array
      // on every 0.5s snapshot. The old `[...roundHist]` made C5A.2 long maps
      // quadratic in both allocation and GC pressure (especially Inferno).
      if(sceneVersion!=="legacy")ps.forEach(p=>{p.stance=resolveFpsWeaponStance(p);});
      frames.push({fi,ts:sceneVersion==="legacy"?rnd*120+sec:majorMatchTimeSec+sec,rnd,roundSec:sec,roundHistCount:rnd, target,planted,tacticalPhase:tacticalPhaseFor(sec,planted),bombState:planted?(sceneVersion!=="legacy"&&roundEnd?.how==="defuse"?"defused":c4t<=0?"exploded":"planted"):"carried",buyP,c4t:c4t!==null?Math.ceil(c4t):null,c4pos:c4pos?{...c4pos}:null,
        ...(sceneVersion!=="legacy"?{bombTimeRemainingSec:c4t===null?null:Math.max(0,c4t*C5A2_LEGACY_SNAPSHOT_SEC),teamIntel:majorIntel.map(i=>({...i,pos:{...i.pos}})),defuse:{defuserId:majorDefuse.defuserId,progress:majorDefuse.progress}}:{}),
        players:ps.map(p=>({...p,pos:{...p.pos},prevPos:{...p.prevPos},...(sceneVersion!=="legacy"?{...(p._hitters?{_hitters:[...p._hitters]}:{}),...(p._activeStuckEpisode?{_activeStuckEpisode:{...p._activeStuckEpisode}}:{})}:{}),routePoints:(p.route||[]).map(point=>({x:Number(point.x.toFixed(3)),y:Number(point.y.toFixed(3))}))})),
        smokes:smokes.map(s=>({...s})),mollys:mollys.map(m=>({...m})),tracers:tracers.map(t=>({...t})),muzzles:muzzles.map(m=>({...m})),
        throwables:throwables.map(tw=>({...tw,from:{...tw.from},to:{...tw.to}})),droppedGuns:droppedGuns.map(g=>({...g})),droppedBomb:droppedBomb?{...droppedBomb}:null,doorStates:{...doorStates},
        events,casts,comms,reactionEvents:reactionTelemetry.slice(telemetryStart).map(episode=>({...episode})),ctScore,tScore,roundHist,ecoT,ecoCT,phase:roundPlan.phase,half:roundPlan.half,otGroup:roundPlan.otGroup,
        roundInPhase:roundPlan.roundInPhase,currentSideByTeam:cloneCsSides(sideByTeam),roundStart:fi===roundFrameStart?roundMeta:null});
      fi++;if(roundEnd)break;
    }
    if(sceneVersion!=="legacy")majorMatchTimeSec=(frames.at(-1)?.ts||0)+C5A2_SIM_STEP_SEC;
    if(!roundEnd)roundEnd={winner:"ct",how:"time"};
    ps.forEach(player=>{
      const episode=player._activeStuckEpisode;
      if(episode&&episode.status!=="resolved"){
        episode.status="round-end-unresolved";
        episode.resolvedAtSec=115;
        episode.durationSec=Number((115-episode.startedAtSec).toFixed(3));
        navigationAudit.maxStuckDurationSec=Math.max(navigationAudit.maxStuckDurationSec,episode.durationSec);
        player._activeStuckEpisode=null;
      }
    });
    const abortedReplans=ps.filter(p=>p._awaitingReplanProgress).length;
    movementAudit.replanAbortedByRoundEnd+=abortedReplans;navigationAudit.replanAbortedByRoundEnd+=abortedReplans;
    const winnerSide=roundEnd.winner;
    const winnerTeam=csTeamAtSide(sideByTeam,winnerSide);
    finishCsRound(ruleState,winnerTeam);
    ctScore=ruleState.score[CS_TEAM_ENEMY];tScore=ruleState.score[CS_TEAM_US];
    const _rnds=rnd+1;
    const majorOutcome=sceneVersion!=="legacy"?getFpsRoundOutcomeMetrics({players:ps,kills:majorKills,clutchEpisodes,winnerTeam}):null;
    const _rs=ps.map(p=>({name:p.name,side:p.side,teamId:p.teamId,role:p.fpsRole||p.role,k:roundKills[p.id]||0,d:roundDeaths[p.id]||0,a:roundAst[p.id]||0,dmg:Math.round(roundDmg[p.id]||0),adr:Math.round((sceneVersion==="legacy"?(p.dmgDealt||0):(agg[p.id].dmg+(roundDmg[p.id]||0)))/_rnds),tk:p.k,td:p.d,ta:p.a,...(sceneVersion!=="legacy"?{id:p.id,utilDmg:Math.round(roundUtilDmg[p.id]||0),traded:majorOutcome.tradedIds.includes(p.id),clutch:p.id===majorOutcome.clutchId,survived:!p.dead}:{})})).sort((a,b)=>(b.k*100+b.dmg)-(a.k*100+a.dmg));
    roundHist.push({...roundMeta,winner:winnerTeam===CS_TEAM_US?"t":"ct",winnerTeam,winnerSide,how:roundEnd.how,
      mvp:_rs[0]&&(_rs[0].k>0||_rs[0].dmg>0)?_rs[0]:null,top:_rs.slice(0,4),tS:tScore,cS:ctScore,
      ...(sceneVersion!=="legacy"?{roundStats:_rs,clutchEpisodes:clutchEpisodes.map(e=>({...e}))}:{}),
      nextCurrentSideByTeam:cloneCsSides(ruleState.currentSideByTeam),completed:ruleState.completed});
    bombAudit.resultLinks.push({round:rnd+1,winnerSide,winnerTeam,how:roundEnd.how,planted,plantCount:bombAudit.plantEvents.filter(event=>event.round===rnd+1).length,defuseCount:bombAudit.defuseEvents.filter(event=>event.round===rnd+1).length,explosionCount:bombAudit.explosionEvents.filter(event=>event.round===rnd+1).length,timerSamples:bombAudit.timerSamples});
    const finalFrame=frames[frames.length-1];
    if(finalFrame){finalFrame.ctScore=ctScore;finalFrame.tScore=tScore;finalFrame.roundHist=roundHist;finalFrame.roundHistCount=roundHist.length;finalFrame.completed=ruleState.completed;finalFrame.winner=ruleState.winner;finalFrame.roundEnd={id:`round-end-${rnd+1}`,type:"round-end",round:rnd+1,winnerSide,winnerTeam,how:roundEnd.how,tS:tScore,cS:ctScore,ts:Number(finalFrame.ts)||0};finalFrame.events=[...(finalFrame.events||[]),finalFrame.roundEnd];}
    // ── 跨回合累計每位選手數據 ──
    {
      const wn=winnerSide;
      const mvpName=_rs[0]&&(_rs[0].k>0||_rs[0].dmg>0)?_rs[0].name:null;
       const winSurv=ps.filter(x=>x.teamId===winnerTeam&&!x.dead); // 勝方殘存者（stable team）
      const clutchId=sceneVersion!=="legacy"?majorOutcome.clutchId:(winSurv.length===1&&(roundKills[winSurv[0].id]||0)>=1)?winSurv[0].id:null;
      if(openKill)agg[openKill.id].entry++;                        // 開局擊殺
      RS.forEach(c=>{const p=ps.find(x=>x.id===c.id);const A=agg[c.id];
        A.k+=roundKills[c.id]||0;A.d+=roundDeaths[c.id]||0;A.a+=roundAst[c.id]||0;
        A.dmg+=Math.round(roundDmg[c.id]||0);A.utilDmg+=Math.round(roundUtilDmg[c.id]||0);A.hs+=p?(p.hsCount||0):0;
        // KAST：本回合有 擊殺/助攻/存活 之一即算
        if((roundKills[c.id]||0)>0||(roundAst[c.id]||0)>0||!roundDeaths[c.id]||(sceneVersion!=="legacy"&&majorOutcome.tradedIds.includes(c.id)))A.kastR++;
        if(c.id===clutchId){A.clutch++;if(finalFrame){finalFrame.events=[...(finalFrame.events||[]),{id:`clutch-${rnd+1}-${c.id}`,type:"clutch",round:rnd+1,playerId:c.id,player:c.name,side:c.side,label:"關鍵殘局",pos:finalFrame.players.find(player=>player.id===c.id)?.pos||null}];}}
        if(c.name===mvpName)A.mvpR++;
      });
    }
    // ── 回合經濟結算（勝負獎金、連敗補助、種包補助、存活保留武器）──
    const winner=winnerSide;
    if(winnerTeam===CS_TEAM_US){lossStreak[CS_TEAM_US]=0;lossStreak[CS_TEAM_ENEMY]=Math.min(lossStreak[CS_TEAM_ENEMY]+1,5);}
    else{lossStreak[CS_TEAM_ENEMY]=0;lossStreak[CS_TEAM_US]=Math.min(lossStreak[CS_TEAM_US]+1,5);}
    const LB=[1400,1900,2400,2900,3400];
    RS.forEach(c=>{const e=econ[c.id];const p=ps.find(x=>x.id===c.id);
      e.money=p?p.money:e.money;                       // 帶入本回合剩餘（含擊殺獎勵）
      const teamId=teamOfRosterId(c.id),won=teamId===winnerTeam;
      e.money+= won?3250:(LB[Math.min(lossStreak[teamId],5)-1]||1400);
      if(c.side==="t"&&planted&&!won)e.money+=800; // 種包補助歸屬當回合攻方 team
      e.money=clamp(Math.round(e.money),0,16000);
      if(sceneVersion!=="legacy")e.nades=p&&!p.dead?[...p.nades]:[];
      if(p&&!p.dead){e.gun=p.gun;e.armor=p.armor;e.helmet=p.helmet;} // 存活保留
      else{e.gun=null;e.armor=false;e.helmet=false;}
    });
    rnd++;
  }
  // ── 賽後每位選手綜合數據 ──
  const _R=Math.max(1,ctScore+tScore);
  const players=RS.map(c=>{const A=agg[c.id];
    const kpr=A.k/_R,dpr=A.d/_R,apr=A.a/_R,adr=A.dmg/_R,kast=A.kastR/_R*100;
    const rating=Math.max(0,+(0.4+0.7*kpr+0.2*apr+0.0045*adr+0.003*kast-0.55*dpr).toFixed(3));
     return{id:A.id,name:A.name,side:ruleState.currentSideByTeam[A.teamId],teamId:A.teamId,teamIdentity:A.teamId,role:A.role,roleKey:A.roleKey,personality:A.personality,
      k:A.k,d:A.d,a:A.a,adr:Math.round(adr),hs:A.hs,hsPct:A.k?Math.round(A.hs/A.k*100):0,
      kast:Math.round(kast),mvpRounds:A.mvpR,clutches:A.clutch,entryKills:A.entry,utilDmg:Math.round(A.utilDmg),rating};
  });
  const mvp=[...players].sort((a,b)=>b.rating-a.rating||b.k-a.k)[0]||null;
  const reactionSamples=reactionTelemetry.filter(episode=>Number.isFinite(episode.firstAuthoritativeShotAtMs)&&Number.isFinite(episode.latencyMs));
  const reactionLatencies=reactionSamples.map(episode=>episode.latencyMs).sort((a,b)=>a-b);
  const reactionSummary={sampleCount:reactionSamples.length,visibleEpisodes:reactionTelemetry.length,
    minMs:reactionLatencies[0]??null,maxMs:reactionLatencies.at(-1)??null,
    medianMs:reactionLatencies.length?reactionLatencies[Math.floor((reactionLatencies.length-1)/2)]:null,
    p90Ms:reactionLatencies.length?reactionLatencies[Math.min(reactionLatencies.length-1,Math.floor(reactionLatencies.length*0.9))]:null,
    timeResolutionMs:C5A2_SIM_STEP_MS,source:"authoritative-simulation"};
  const cadenceByFamily={};shotCadenceTelemetry.forEach(event=>{if(event.actualIntervalMs!=null)(cadenceByFamily[event.weaponFamily]??=[]).push(event.actualIntervalMs);});
  const cadenceSummary=Object.fromEntries(Object.entries(cadenceByFamily).map(([family,values])=>{const sorted=[...values].sort((a,b)=>a-b);return[family,{samples:sorted.length,minMs:sorted[0]??null,medianMs:sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null,maxMs:sorted.at(-1)??null}];}));
  const weaponAuthoritySummary=Object.fromEntries(Object.keys(GUNS).map(gun=>{const profile=weaponAuthority(gun);return[gun,{...profile,bodyShotsToKill:Math.max(1,Math.ceil(100/profile.damage)),actualCadenceSamples:shotCadenceTelemetry.filter(event=>event.gun===gun).length}];}));
  const weaponFamilies=["pistol","smg","rifle","sniper","shotgun"];
  const summarizeCadence=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return{samples:sorted.length,minMs:sorted[0]??null,medianMs:sorted.length?(sorted[Math.floor((sorted.length-1)/2)]??null):null,maxMs:sorted.at(-1)??null};};
  const weaponMetrics=Object.fromEntries(weaponFamilies.map(family=>{
    const events=shotCadenceTelemetry.filter(event=>event.weaponFamily===family),hits=events.filter(event=>event.hit),damage=events.reduce((sum,event)=>sum+(Number(event.damage)||0),0);
    return[family,{shots:events.length,hits:hits.length,damage,avgDamagePerHit:hits.length?Number((damage/hits.length).toFixed(2)):0,profileIntervalMs:summarizeCadence(events.map(event=>Number(event.profileIntervalMs))),actualCadenceMs:summarizeCadence(events.map(event=>event.actualIntervalMs==null?NaN:Number(event.actualIntervalMs)))}];
  }));
  navigationAudit.unresolvedStuckEpisodes=navigationAudit.stuckEpisodes.filter(episode=>episode.status!=="resolved").length;
  buyAudit.purchaseRatios=Object.fromEntries(weaponFamilies.map(family=>[family,buyAudit.totalPurchases?Number((buyAudit.purchaseCounts[family]/buyAudit.totalPurchases).toFixed(4)):0]));
  return{frames,highlights,roundHist,ctScore,tScore,mapKey,sceneVersion,players,mvp,rounds:_R,reactionTelemetry,reactionSummary,
       shotCadenceTelemetry,cadenceSummary,weaponAuthority:weaponAuthoritySummary,weaponMetrics,movementAudit,navigationAudit,combatAudit,tacticalAudit,buyAudit,bombAudit,
    completed:ruleState.completed,winner:ruleState.winner,phase:ruleState.phase,regulationRounds:ruleState.regulationRounds,
    overtimeGroups:ruleState.otGroup,sideChanges:ruleState.sideChanges,economyEvents,halftime:ruleState.sideChanges.find(x=>x.reason==="halftime")??null,
    currentSideByTeam:cloneCsSides(ruleState.currentSideByTeam)};
}

// ── 組裝賽後結果（給主遊戲的 recordMatch / 賽後成長 / 數據面板）──────────
// T = 我方（德國海豹）視角。fanGain/prizeGain/xpGain 由主遊戲填入。
function stableResultId(sim, seed, tacticT, tacticCT) {
  const input = JSON.stringify([
    ...(sim.sceneVersion&&sim.sceneVersion!=="legacy"?[sim.sceneVersion]:[]),
    seed, sim.mapKey, tacticT?.id ?? tacticT?.name ?? null, tacticCT?.id ?? tacticCT?.name ?? null,
    sim.completed, sim.winner, sim.ctScore, sim.tScore, sim.roundHist,
    sim.players.map((p) => [p.id, p.teamId ?? csRosterTeamId(p), p.side, p.k, p.d, p.dmg, p.rating]),
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `cs_${h.toString(16).padStart(8, "0")}`;
}
// ── CS Loading v2：返回同一場時沿用上一次的模擬結果 ─────────────────────────
// simulateFps 是輸入的純函式（seeded RNG、不讀時鐘、不回寫輸入；播放端不改寫 frames），
// 同一組輸入必定得到同一份輸出（tools/check_cs_loading_v2_sim_equivalence.mjs 驗同一實例重跑；
// tools/browser_measure_cs_loading.mjs 驗返回後的 sim hash 與首次進場相同）。
// 所以「離開 → 返回同一場」時整場重算，只是讓玩家在 main thread 上再等一次。
// ⚠ 只留**一份**、只存模擬資料（不含任何 three／DOM 物件）：換一組輸入先放掉舊的，
//   比賽播完交出結果時放掉（completeOnce）。
let lastMountSimulation=null;
function simulateFpsForMount(mapKey,tacticT,tacticCT,seed,roster,tacticalLayout,sceneVersion="major.v1"){
  let key=null;
  try{key=JSON.stringify([mapKey,tacticT,tacticCT,seed,roster,tacticalLayout,sceneVersion]);}catch(e){key=null;}
  if(key&&lastMountSimulation&&lastMountSimulation.key===key){csLoadMark("sim:reuse",{mapKey,seed});csSimCacheEvent("reuse",{mapKey,seed});return lastMountSimulation.sim;}
  if(lastMountSimulation)csSimCacheEvent("replace",{mapKey:lastMountSimulation.mapKey,seed:lastMountSimulation.seed});
  lastMountSimulation=null;
  const sim=csLoadTime("sim:simulateFps",()=>simulateFps(mapKey,tacticT,tacticCT,seed,roster,tacticalLayout,sceneVersion),{mapKey,seed});
  if(key){lastMountSimulation={key,sim,mapKey,seed};csSimCacheEvent("store",{mapKey,seed,frames:sim.frames.length});}
  return sim;
}
__FPS3D_SIM_PORT.simulateFps = simulateFps;
// hotfix/cs-resume-worker：快取沒命中時，把 simulateFps 交給 Web Worker 算，並以 React Suspense 等待
//   （拋出 promise）。主執行緒不再被整場模擬佔住；結果回來後寫進同一份 lastMountSimulation，
//   重新 render 時走既有的 reuse 路徑 ⇒ 與同步版拿到的是同一個輸入的同一份輸出。
//   沒有 runner（Worker 不支援／非 CS 正式畫面）⇒ 退回原本的同步計算，行為完全不變。
const pendingMountSimulation=new Map();
function simulateFpsForMountAsync(mapKey,tacticT,tacticCT,seed,roster,tacticalLayout,sceneVersion="major.v1"){
  let key=null;
  try{key=JSON.stringify([mapKey,tacticT,tacticCT,seed,roster,tacticalLayout,sceneVersion]);}catch(e){key=null;}
  const runner=__FPS3D_SIM_PORT.runner;
  if(!key||!runner||(lastMountSimulation&&lastMountSimulation.key===key))return simulateFpsForMount(mapKey,tacticT,tacticCT,seed,roster,tacticalLayout,sceneVersion);
  if(!pendingMountSimulation.has(key)){
    csLoadMark("sim:worker-start",{mapKey,seed});
    const args=[mapKey,tacticT,tacticCT,seed,roster,tacticalLayout,sceneVersion];
    const job=Promise.resolve()
      .then(()=>runner(args))
      .catch(error=>{csLoadMark("sim:worker-fallback",{mapKey,seed,reason:String(error?.message||error).slice(0,240)});return simulateFps(...args);})
      .then((sim)=>{
        if(lastMountSimulation)csSimCacheEvent("replace",{mapKey:lastMountSimulation.mapKey,seed:lastMountSimulation.seed});
        lastMountSimulation={key,sim,mapKey,seed};
        csSimCacheEvent("store",{mapKey,seed,frames:sim.frames.length});
        csLoadMark("sim:worker-done",{mapKey,seed});
      })
      .finally(()=>pendingMountSimulation.delete(key));
    pendingMountSimulation.set(key,job);
  }
  throw pendingMountSimulation.get(key);
}
function releaseMountSimulation(sim){if(lastMountSimulation&&lastMountSimulation.sim===sim){lastMountSimulation=null;csSimCacheEvent("release-complete",{});}}
function buildMatchResult(sim,opts={}){
  const{tacticT,tacticCT,tName="德國海豹",ctName="Compulsary",date=null,seed=0,matchId=null}=opts;
  const win=sim.winner===CS_TEAM_US||(sim.winner==null&&sim.tScore>sim.ctScore);
  const ourPlayers=sim.players.filter(p=>(p.teamId??csRosterTeamId(p))===CS_TEAM_US);
  const theirPlayers=sim.players.filter(p=>(p.teamId??csRosterTeamId(p))===CS_TEAM_ENEMY);
  const ourMvp=[...ourPlayers].sort((a,b)=>b.rating-a.rating||b.k-a.k)[0]||null;
  const topFraggers=[...sim.players].sort((a,b)=>b.k-a.k).slice(0,3);
  return{
    id:matchId ?? stableResultId(sim, seed, tacticT, tacticCT),mode:"CS",map:sim.mapKey,date,
    ...(sim.sceneVersion&&sim.sceneVersion!=="legacy"?{sceneVersion:sim.sceneVersion}:{}),
    completed:sim.completed,winner:sim.winner,win,scoreT:sim.tScore,scoreCT:sim.ctScore,tName,ctName,
    tactic:{ours:tacticT?.name||null,theirs:tacticCT?.name||null,ourType:tacticT?.type||null,theirType:tacticCT?.type||null},
    players:sim.players,ourPlayers,theirPlayers,
    mvp:sim.mvp,ourMvp,topFraggers,
    rounds:sim.roundHist,roundCount:sim.rounds,regulationRounds:sim.regulationRounds,overtimeGroups:sim.overtimeGroups,
    sideChanges:sim.sideChanges,economyEvents:sim.economyEvents,halftime:sim.halftime,
    fanGain:0,prizeGain:0,xpGain:0,
  };
}

// ─── 色彩 ────────────────────────────────────────────────────────────────
const C={bg:"#070a10",panel:"#0d1119",panel2:"#141a26",ct:"#38bdf8",ctL:"#a7e0ff",ctD:"#0b2942",t:"#fb923c",tL:"#fed7aa",tD:"#3a2410",gold:"#fbbf24",green:"#34d399",red:"#f87171",gray:"#8a8f9c",gray2:"#5a606e",line:"rgba(255,255,255,0.08)"};
let T_NAME="德國海豹",CT_NAME="Compulsary"; // 嵌入時可由元件依 props 覆寫
const sideColor=s=>s==="ct"?C.ct:C.t;

// ─── Canvas 紋理產生器（一次性建立，供 Three 使用）───────────────────────
function makeFloorTexture(map){
  const S=1024,cv=document.createElement("canvas");cv.width=cv.height=S;const x=cv.getContext("2d");
  x.fillStyle=map.floor;x.fillRect(0,0,S,S);
  // 砂地噪點
  const img=x.getImageData(0,0,S,S),d=img.data;
  for(let i=0;i<d.length;i+=4){const n=(Math.random()-0.5)*22;d[i]=clamp(d[i]+n,0,255);d[i+1]=clamp(d[i+1]+n,0,255);d[i+2]=clamp(d[i+2]+n*0.8,0,255);}
  x.putImageData(img,0,0);
  // 細格線
  x.strokeStyle="rgba(255,255,255,0.035)";x.lineWidth=1;
  for(let i=0;i<=S;i+=S/20){x.beginPath();x.moveTo(i,0);x.lineTo(i,S);x.moveTo(0,i);x.lineTo(S,i);x.stroke();}
  // 邊緣暗角
  const vignette=Number.isFinite(Number(map.floorVignette))?Number(map.floorVignette):0.55;
  const g=x.createRadialGradient(S/2,S/2,S*0.32,S/2,S/2,S*0.72);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,`rgba(0,0,0,${vignette})`);
  x.fillStyle=g;x.fillRect(0,0,S,S);
  const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=4;return tex;
}
function makeRadialSprite(stops,size=128){
  const cv=document.createElement("canvas");cv.width=cv.height=size;const x=cv.getContext("2d");
  const g=x.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);stops.forEach(([o,c])=>g.addColorStop(o,c));
  x.fillStyle=g;x.fillRect(0,0,size,size);
  const tex=new THREE.CanvasTexture(cv);return tex;
}
function makeStarSprite(size=128){
  const cv=document.createElement("canvas");cv.width=cv.height=size;const x=cv.getContext("2d");const c=size/2;
  const g=x.createRadialGradient(c,c,0,c,c,c);g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(0.25,"rgba(255,244,200,0.95)");g.addColorStop(0.55,"rgba(251,191,36,0.5)");g.addColorStop(1,"rgba(251,146,60,0)");
  x.fillStyle=g;x.fillRect(0,0,size,size);
  x.strokeStyle="rgba(255,250,220,0.9)";x.lineWidth=size*0.035;x.lineCap="round";
  for(let i=0;i<4;i++){const a=i*Math.PI/2;x.beginPath();x.moveTo(c,c);x.lineTo(c+Math.cos(a)*c*0.92,c+Math.sin(a)*c*0.92);x.stroke();}
  const tex=new THREE.CanvasTexture(cv);return tex;
}
function makeLabelSprite(text,color="rgba(235,235,225,0.85)",font=44,bg=null){
  const pad=14,f=`700 ${font}px system-ui,-apple-system,sans-serif`;
  const m=document.createElement("canvas").getContext("2d");m.font=f;const w=Math.ceil(m.measureText(text).width)+pad*2,h=font+pad*1.4;
  const cv=document.createElement("canvas");cv.width=w;cv.height=h;const x=cv.getContext("2d");
  if(bg){x.fillStyle=bg;const r=10;x.beginPath();x.moveTo(r,0);x.arcTo(w,0,w,h,r);x.arcTo(w,h,0,h,r);x.arcTo(0,h,0,0,r);x.arcTo(0,0,w,0,r);x.fill();}
  x.font=f;x.textBaseline="middle";x.textAlign="center";
  x.shadowColor="rgba(0,0,0,0.9)";x.shadowBlur=6;x.fillStyle=color;x.fillText(text,w/2,h/2);
  const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;return{tex,w,h};
}
function makeBigLetter(letter,color){
  const S=256,cv=document.createElement("canvas");cv.width=cv.height=S;const x=cv.getContext("2d");
  x.font=`900 200px system-ui`;x.textAlign="center";x.textBaseline="middle";
  x.fillStyle=color;x.fillText(letter,S/2,S/2+8);
  const tex=new THREE.CanvasTexture(cv);tex.encoding=THREE.sRGBEncoding;return tex;
}

function createFpsPovWeapon(camera){
  const group=new THREE.Group();group.name="ESMO_FPS_POV_Weapon";group.renderOrder=20;
  const metal=new THREE.MeshStandardMaterial({color:0x252b35,roughness:0.42,metalness:0.68});
  const dark=new THREE.MeshStandardMaterial({color:0x10151d,roughness:0.72,metalness:0.18});
  const accent=new THREE.MeshBasicMaterial({color:0xf5b94c});
  const glove=new THREE.MeshStandardMaterial({color:0x303a48,roughness:0.86,metalness:0.05});
  const skin=new THREE.MeshStandardMaterial({color:0xb87755,roughness:0.9,metalness:0});
  const receiver=new THREE.Mesh(new THREE.BoxGeometry(0.25,0.15,0.5),metal);receiver.position.set(0.42,-0.29,-0.82);group.add(receiver);
  const upper=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.07,0.28),dark);upper.position.set(0.42,-0.18,-0.83);group.add(upper);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.043,0.42,8),metal);barrel.rotation.x=Math.PI/2;barrel.position.set(0.42,-0.28,-1.27);group.add(barrel);
  const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.08,8),accent);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0.42,-0.28,-1.51);group.add(muzzle);
  const grip=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.3,0.16),dark);grip.position.set(0.42,-0.51,-0.73);grip.rotation.x=-0.14;group.add(grip);
  const magazine=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.25,0.14),dark);magazine.position.set(0.42,-0.49,-0.92);magazine.rotation.x=-0.18;group.add(magazine);
  const sleeve=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.2,0.34),glove);sleeve.position.set(0.38,-0.58,-0.48);sleeve.rotation.x=-0.2;group.add(sleeve);
  const hand=new THREE.Mesh(new THREE.SphereGeometry(0.105,12,8),skin);hand.position.set(0.42,-0.42,-0.92);group.add(hand);
  const supportSleeve=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.17,0.3),glove);supportSleeve.position.set(0.58,-0.44,-0.66);supportSleeve.rotation.x=-0.2;group.add(supportSleeve);
  const supportHand=new THREE.Mesh(new THREE.SphereGeometry(0.095,12,8),skin);supportHand.position.set(0.53,-0.35,-0.92);group.add(supportHand);
  const sight=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.06,0.11),accent);sight.position.set(0.42,-0.18,-0.84);group.add(sight);
  const flash=new THREE.Mesh(new THREE.OctahedronGeometry(0.14,0),new THREE.MeshBasicMaterial({color:0xfff0a6,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));flash.position.set(0.42,-0.28,-1.58);group.add(flash);
  group.visible=false;camera.add(group);
  group.traverse(object=>{object.frustumCulled=false;});
  return {group,receiver,barrel,muzzle,grip,magazine,sleeve,hand,supportSleeve,supportHand,sight,flash,materials:[metal,dark,accent,glove,skin,flash.material],family:null,gun:null,lastFireKey:null,fireAt:0,fireCount:0};
}

function updateFpsPovWeapon(st,frame,ch,pov,dt){
  const weapon=st.povWeapon;if(!weapon)return;
  if(weapon.major){const live=st.liveRef.current,actor=pov&&ch?.alive?st.players.find(player=>player.id===ch.id):null;
    // Camera chase data contains only framing fields; handling belongs to the saved player.
    const savedPlayer=frame.players?.find(player=>player.id===ch?.id);
    weapon.update({feedbackRoot:st.renderer.domElement.closest(".fps-major-battle"),nextFrame:live.sim?.frames?.[live.fIdx+1],frame,chase:savedPlayer?{...ch,...savedPlayer}:ch,pov,live,family:c5a1WeaponFamily(ch?.gun),dt,weaponGroups:actor?.rigged?.c2c?.weaponGroups,handGeometries:actor?.rigged?.c2c?.povHandGeometries,textiles:actor?.rigged?.c2c?.povTextiles,clothColor:actor?.rigged?.c2c?.materials?.fabric?.color,frameAgeSec:Math.max(0,Number(st.subT)||0)*(Number(live.playbackFrameSec)||C5A2_PLAYBACK_FRAME_SEC)});st.povWeaponDiagnostics=weapon.diagnostics;return;}
  weapon.group.visible=Boolean(pov&&ch?.alive);
  if(!weapon.group.visible){weapon.flash.visible=false;weapon.diagnostics={visible:false,gun:weapon.gun||null,family:weapon.family||null,weaponParts:12,fireCount:weapon.fireCount,authority:"frame.muzzles + player.shooting"};st.povWeaponDiagnostics=weapon.diagnostics;return;}
  const family=c5a1WeaponFamily(ch.gun),profile={pistol:{scale:0.86,x:0.02,y:0.04,z:0.02,color:0xb9c2cf},smg:{scale:0.96,x:0,y:0,z:0,color:0x9ca8b6},rifle:{scale:1.04,x:-0.01,y:0,z:0,color:0x7f8b98},sniper:{scale:1.18,x:-0.03,y:0.01,z:0.01,color:0x9dc4d4},shotgun:{scale:1.08,x:-0.01,y:-0.01,z:0,color:0xb68e72}}[family]||{scale:1,x:0,y:0,z:0,color:0x9ca8b6};
  if(weapon.family!==family||weapon.gun!==ch.gun){weapon.family=family;weapon.gun=ch.gun;weapon.group.userData.weaponFamily=family;weapon.group.userData.gun=ch.gun;weapon.receiver.material.color.setHex(profile.color);weapon.barrel.material.color.setHex(profile.color);weapon.muzzle.material.color.setHex(profile.color);}
  weapon.group.scale.setScalar(profile.scale);weapon.group.position.set(profile.x,profile.y,profile.z);
  const muzzleEvents=(frame?.muzzles||[]).filter(event=>event?.attackerId===ch.id);
  const latest=muzzleEvents[muzzleEvents.length-1];const fireKey=latest?.eventId||latest?.id||null;
  if(fireKey&&weapon.lastFireKey!==fireKey){weapon.lastFireKey=fireKey;weapon.fireAt=st.time;weapon.fireCount+=1;weapon.lastAuthoritativeFire={eventId:fireKey,frameIndex:frame?.fi??null,shotAtMs:latest.shotAtMs??null};}
  const age=Math.max(0,st.time-(weapon.fireAt||-Infinity)),recoil=clamp(1-age/0.14,0,1);
  const activeShot=Boolean(fireKey&&age<0.12);
  weapon.flash.visible=activeShot;weapon.flash.material.opacity=activeShot?0.78*(1-age/0.12):0;weapon.flash.scale.setScalar(activeShot?1+recoil*0.55:0.01);
  // Recoil is a presentation envelope keyed by the authoritative muzzle event;
  // it never schedules a shot or changes the simulation.
  weapon.group.rotation.x=-0.025-recoil*0.055;weapon.group.rotation.y=recoil*0.012;
  weapon.group.position.y=profile.y-recoil*0.018;
  weapon.diagnostics={visible:true,gun:ch.gun,family,weaponParts:12,fireCount:weapon.fireCount,lastAuthoritativeFire:weapon.lastAuthoritativeFire||null,authority:"frame.muzzles + player.shooting",recoil:Number(recoil.toFixed(3))};st.povWeaponDiagnostics=weapon.diagnostics;
}

/* ═══════════════════════════════════════════════════════════════════════
   FpsScene3D — Three.js 渲染層
   ═══════════════════════════════════════════════════════════════════════ */
function FpsScene3D({mapKey,sceneVersion="major.v1",roster=[],liveRef,onSelectPlayer,onRecenterRef,onCameraPresetRef}){
  const mobile=useIsMobile();
  const mountRef=useRef(null);
  const stateRef=useRef(null); // 保存 three 物件，跨 effect 共用

  // 世界座標轉換：地圖 (x,y)∈[0,100] → 世界 (x-50, z=y-50)，高度 z*H
  const HSCALE=0.92;
  const W=useMemo(()=>({
    vx:x=>x-50, vz:y=>y-50, vy:z=>z*HSCALE,
  }),[]);

  // ── 初始化 renderer / scene / camera（只做一次）──
  useEffect(()=>{
    const mount=mountRef.current;if(!mount)return;
    const endRendererInit=csLoadSpan("scene:renderer-init");
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1.5:2));
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.08;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x05070c,1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display="block";renderer.domElement.style.width="100%";renderer.domElement.style.height="100%";renderer.domElement.style.cursor="grab";renderer.domElement.style.touchAction="none";

    // 真機驗證用的 DEV-only overlay。它只讀 renderer / visibility diagnostics，
    // 不參與 simulation，也不會在 production 或未帶 query flag 時建立。
    const scene=new THREE.Scene();
    scene.fog=new THREE.Fog(0x070b12,150,360);

    const camera=new THREE.PerspectiveCamera(42,1,0.1,600);
    // Camera-attached POV meshes are rendered only when this subtree belongs
    // to the scene. Keep legacy traversal unchanged; major owns this camera.
    if(sceneVersion!=="legacy")scene.add(camera);
    // 球座標運鏡（phi 自天頂、theta 方位）
    const cam={theta:-Math.PI*0.62,phi:Math.PI*0.30,radius:88,tgt:new THREE.Vector3(0,3,0),
               dTheta:-Math.PI*0.62,dPhi:Math.PI*0.30,dRadius:88,dTgt:new THREE.Vector3(0,3,0),autoFollow:true,overview:true,viewPreset:null,manualRadius:null,presetTransition:null,povFov:sceneVersion==="legacy"?42:72,povPosition:new THREE.Vector3(),povLookAt:new THREE.Vector3()};

    // ── 光照 ──
    const ambient=new THREE.AmbientLight(0x718394,0.68);scene.add(ambient);
    const hemi=new THREE.HemisphereLight(0xc6d9e4,0x4c463d,0.88);scene.add(hemi);
    const sun=new THREE.DirectionalLight(0xfff4dc,1.72);
    sun.position.set(46,80,30);sun.castShadow=true;
    sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);
    const sc=sun.shadow.camera;sc.left=-70;sc.right=70;sc.top=70;sc.bottom=-70;sc.near=10;sc.far=220;sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.5;
    scene.add(sun);
    const rim=new THREE.DirectionalLight(0x6390b0,0.5);rim.position.set(-40,30,-50);scene.add(rim);

    // ── 共用幾何/紋理 ──
    const tex={
      flash:makeStarSprite(),
      smoke:makeRadialSprite([[0,"rgba(225,228,235,0.9)"],[0.45,"rgba(200,205,214,0.55)"],[1,"rgba(180,186,196,0)"]]),
      fire:makeRadialSprite([[0,"rgba(255,246,180,0.95)"],[0.35,"rgba(255,150,40,0.8)"],[0.7,"rgba(220,60,20,0.35)"],[1,"rgba(120,20,0,0)"]]),
      glow:makeRadialSprite([[0,"rgba(255,255,255,0.9)"],[1,"rgba(255,255,255,0)"]]),
    };
    const sphereGeo=new THREE.SphereGeometry(1,16,12);
    const beamGeo=new THREE.BoxGeometry(1,1,1); // 沿 +X 的單位盒，縮放為光束

    // 群組
    const worldGroup=new THREE.Group();scene.add(worldGroup);   // 靜態：地板/建築/箱/招牌
    const routeGroup=new THREE.Group();scene.add(routeGroup);   // 路線疊加
    const playerGroup=new THREE.Group();scene.add(playerGroup); // 10 名選手
    const fxGroup=new THREE.Group();scene.add(fxGroup);         // 槍火/煙/火/投擲/炸彈

    stateRef.current={renderer,scene,camera,cam,ambient,hemi,sun,rim,tex,sphereGeo,beamGeo,worldGroup,routeGroup,playerGroup,fxGroup,liveRef,
      players:[],pools:{},raycastTargets:[],povWeapon:null,povWeaponDiagnostics:null,running:true,lastT:0,time:0,cameraRecoveryCount:0,rapidCameraRecoveryCount:0,lastCameraRecoveryAt:null,
      c5a1HitDriftMax:0,c5a1HitDriftSamples:0,c5a1AuthoritativeDriftMax:0,clock:{wallClockSec:0,lastFrameIndex:null,frameTransitions:0,samples:[]},disposables:[]};
    //  ── 單一清理路徑（`disposables`）────────────────────────────────────
    //  ⚠ 這個陣列本來就宣告在 state 裡，但從來沒有被寫入也沒有被排乾。
    //    現在把它接成**唯一**的擁有權登記簿：凡是這次掛載自己建立、
    //    離場就該收掉的東西，都在建立當下登記，卸載時一次排乾。
    //  ⚠ 只登記**自己擁有**的資源。跨 mount 共用的（例如 GLTF 快取）不登記，
    //    它們由自己的 dispose 契約負責（rigged.dispose()）。
    const own=(label,fn)=>{stateRef.current.disposables.push({label,fn});};
    //  共用幾何與貼圖是這次建立的，離場要收。
    own("tex",()=>{for(const t of Object.values(tex))t?.dispose?.();});
    own("sphereGeo",()=>sphereGeo.dispose?.());
    own("beamGeo",()=>beamGeo.dispose?.());
    own("lights",()=>{for(const l of [ambient,hemi,sun,rim]){l.parent?.remove?.(l);l.dispose?.();}});
    own("groups",()=>{for(const g of [worldGroup,routeGroup,playerGroup,fxGroup]){g.parent?.remove?.(g);g.clear?.();}});
    stateRef.current.own=own;

    stateRef.current.povWeapon=sceneVersion==="legacy"?createFpsPovWeapon(camera):createMajorFpsPovWeapon(camera);
    stateRef.current.setCameraPreset=(name)=>setFpsCameraPreset(stateRef.current,name);

    // ── 互動：拖曳旋轉 / 滾輪縮放 / 觸控 ──
    const el=renderer.domElement;let drag=null,pinch=null;
    const panBy=(dx,dy,s,th,tx,tz)=>{const sinT=Math.sin(th),cosT=Math.cos(th),rx=cosT,rz=-sinT,fx=-sinT,fz=-cosT;cam.dTgt.x=clamp(tx-dx*s*rx-dy*s*fx,-74,74);cam.dTgt.z=clamp(tz-dx*s*rz-dy*s*fz,-74,74);};
    const cancelPresetTransition=()=>{cam.presetTransition=null;};
    const onDown=e=>{const p=e.touches?e.touches[0]:e;const wantPan=(!e.touches)&&(e.button===2||e.shiftKey);
      cancelPresetTransition();
      const chasing=!!(stateRef.current._chase&&stateRef.current._chase.alive);
      if(!chasing){cam.autoFollow=false;cam.overview=false;cam.viewPreset=null;}
      drag=wantPan?{pan:true,x:p.clientX,y:p.clientY,tx:cam.dTgt.x,tz:cam.dTgt.z,th:cam.dTheta,r:cam.dRadius}:{pan:false,x:p.clientX,y:p.clientY,th:cam.dTheta,ph:cam.dPhi,chasing,cy:cam.chaseYaw||0,cp:cam.chasePitch||0};
      el.style.cursor=wantPan?"move":"grabbing";};
    const onMove=e=>{if(!drag)return;const p=e.touches?e.touches[0]:e;
      if(drag.pan)panBy(p.clientX-drag.x,p.clientY-drag.y,drag.r*0.0018,drag.th,drag.tx,drag.tz);
      else if(drag.chasing){if(stateRef.current.sceneVersion!=="legacy"&&liveRef.current?.cameraMode==="pov")return;cam.chaseYaw=drag.cy-(p.clientX-drag.x)*0.006;cam.chasePitch=clamp(drag.cp-(p.clientY-drag.y)*0.005,-0.55,0.78);} // 觀戰追焦環繞；Major POV由選手aim控制
      else{cam.dTheta=drag.th-(p.clientX-drag.x)*0.0055;cam.dPhi=clamp(drag.ph-(p.clientY-drag.y)*0.0055,0.1,1.5);}};
    const onUp=()=>{drag=null;pinch=null;el.style.cursor="grab";};
    const onWheel=e=>{e.preventDefault();cancelPresetTransition();const chasing=!!(stateRef.current._chase&&stateRef.current._chase.alive);const pov=chasing&&liveRef.current?.cameraMode==="pov";cam.autoFollow=false;cam.viewPreset=null;
      if(pov){const legacy=stateRef.current.sceneVersion==="legacy";cam.povFov=clamp((cam.povFov||(legacy?42:72))+(e.deltaY>0?3:-3),legacy?36:50,legacy?72:92);camera.fov=cam.povFov;camera.updateProjectionMatrix();return;}
      const min=chasing?fpsChaseMinimumRadius(stateRef.current.sceneVersion):18,max=chasing?55:200;cam.manualRadius=clamp((cam.manualRadius??cam.dRadius)*(e.deltaY>0?1.1:0.9),min,max);cam.dRadius=cam.manualRadius;};
    const onTouchStart=e=>{cancelPresetTransition();cam.autoFollow=false;cam.viewPreset=null;if(e.touches.length===2){drag=null;const[a,b]=e.touches;pinch={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),r:cam.dRadius,cx:(a.clientX+b.clientX)/2,cy:(a.clientY+b.clientY)/2,tx:cam.dTgt.x,tz:cam.dTgt.z,th:cam.dTheta};}else onDown(e);};
    const onTouchMove=e=>{e.preventDefault();
      if(e.touches.length===2&&pinch){const[a,b]=e.touches;const d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);const pov=stateRef.current._chase?.alive&&liveRef.current?.cameraMode==="pov";
        if(pov){const legacy=stateRef.current.sceneVersion==="legacy";cam.povFov=clamp((cam.povFov||(legacy?42:72))*pinch.d/Math.max(1,d),legacy?36:50,legacy?72:92);camera.fov=cam.povFov;camera.updateProjectionMatrix();return;}
        const min=stateRef.current._chase?.alive?fpsChaseMinimumRadius(stateRef.current.sceneVersion):18;cam.dRadius=clamp(pinch.r*pinch.d/Math.max(1,d),min,200);cam.manualRadius=cam.dRadius;
        const cx=(a.clientX+b.clientX)/2,cy=(a.clientY+b.clientY)/2;panBy(cx-pinch.cx,cy-pinch.cy,cam.dRadius*0.0018,pinch.th,pinch.tx,pinch.tz);}
      else onMove(e);};
    //  ⚠ 監聽一律具名並登記，卸載時逐一移除。
    //    實測（離場後快照）：`window.mouseup` 仍掛著 —— 它閉包持有整份 CS 狀態，
    //    所以光是它一個就足以讓整個場景無法被回收。
    const onContextMenu=e=>e.preventDefault();
    el.addEventListener("contextmenu",onContextMenu);
    // 點擊選取選手
    const ray=new THREE.Raycaster();const ndc=new THREE.Vector2();let downPt=null;let clickTarget=null;
    const onClickDown=e=>{if(e.target!==el)return;const p=e.touches?e.touches[0]:e;clickTarget=el;downPt={x:p.clientX,y:p.clientY};};
    const onClickUp=e=>{
      if(!downPt||e.target!==clickTarget){downPt=null;clickTarget=null;return;}const p=e.changedTouches?e.changedTouches[0]:e;
      if(Math.hypot(p.clientX-downPt.x,p.clientY-downPt.y)>6){downPt=null;clickTarget=null;return;}
      const r=el.getBoundingClientRect();ndc.x=((p.clientX-r.left)/r.width)*2-1;ndc.y=-((p.clientY-r.top)/r.height)*2+1;
      ray.setFromCamera(ndc,camera);
      const hits=ray.intersectObjects(stateRef.current.raycastTargets,true);
      if(hits.length){let o=hits[0].object;while(o&&!o.userData.pid)o=o.parent;if(o&&o.userData.pid){onSelectPlayer&&onSelectPlayer(o.userData.pid);}}
      else onSelectPlayer&&onSelectPlayer(null);
      downPt=null;clickTarget=null;
    };
    const onMouseDown=e=>{onDown(e);onClickDown(e);};
    const onMouseUp=e=>{onUp();onClickUp(e);};
    const onTouchStartAll=e=>{onTouchStart(e);onClickDown(e);};
    const onTouchEndAll=e=>{onUp();onClickUp(e);};
    el.addEventListener("mousedown",onMouseDown);
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onMouseUp);
    el.addEventListener("wheel",onWheel,{passive:false});
    el.addEventListener("touchstart",onTouchStartAll,{passive:false});
    el.addEventListener("touchmove",onTouchMove,{passive:false});
    el.addEventListener("touchend",onTouchEndAll);
    el.addEventListener("touchcancel",onUp);
    own("listeners",()=>{
      window.removeEventListener("mousemove",onMove);
      window.removeEventListener("mouseup",onMouseUp);
      el.removeEventListener("contextmenu",onContextMenu);
      el.removeEventListener("mousedown",onMouseDown);
      el.removeEventListener("wheel",onWheel);
      el.removeEventListener("touchstart",onTouchStartAll);
      el.removeEventListener("touchmove",onTouchMove);
      el.removeEventListener("touchend",onTouchEndAll);
      el.removeEventListener("touchcancel",onUp);
    });

    if(onRecenterRef)onRecenterRef.current=()=>{cancelPresetTransition();cam.autoFollow=true;cam.overview=true;cam.viewPreset=null;cam._ovBase=null;cam.manualRadius=null;cam._directorHotspot=null;cam._directorTarget=null;cam._directorTelemetry=null;cam.chaseYaw=0;cam.chasePitch=0;cam.povFov=stateRef.current.sceneVersion==="legacy"?42:72;camera.fov=42;camera.updateProjectionMatrix();};
    if(onCameraPresetRef)onCameraPresetRef.current=(name)=>setFpsCameraPreset(stateRef.current,name);

    // ── 尺寸自適應 ──
    const resize=()=>{const w=mount.clientWidth||1,h=mount.clientHeight||1;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
    resize();const ro=new ResizeObserver(resize);ro.observe(mount);
    endRendererInit();

      // ── 主迴圈：播放時鐘 + 插值 + 渲染 ──
    const animate=t=>{
      const st=stateRef.current;if(!st||!st.running)return;
      st.raf=requestAnimationFrame(animate);
      const wallDt=st.lastT?Math.min(0.25,Math.max(0,(t-st.lastT)/1000)):0,dt=Math.min(0.05,wallDt);st.lastT=t;st.time+=wallDt;
      const live=liveRef.current;if(!live||!live.sim){renderer.render(scene,camera);return;}
      // React owns the player-facing preset selection. The ref callback below
      // is the fast path; this frame-bound intent sync keeps a preset reliable
      // across a mount/re-render race without creating a second camera source.
      if(live.cameraMode==="tactical"&&live.cameraPreset&&st._cameraPresetIntent!==live.cameraPreset)setFpsCameraPreset(st,live.cameraPreset);
      if(live.cameraMode!=="tactical"||!live.cameraPreset)st._cameraPresetIntent=null;
      // 播放時鐘（在渲染迴圈推進，避免每幀觸發 React 重繪）
      const sim=live.sim,total=sim.frames.length;
      if(live.seekNonce!==st.seekNonce){st.seekNonce=live.seekNonce;st.subT=0;}
      if(st.subT==null)st.subT=0;
      // subT is a frame fraction, so convert wall time using the actual
      // authoritative snapshot duration. C4's 2s snapshots used 0.5 here;
      // C5A2's 0.5s snapshots require 2 frames/sec at 1x.
      if(live.playing){const frameSec=Number(live.playbackFrameSec)||C5A2_PLAYBACK_FRAME_SEC;st.subT+=wallDt*live.speed/frameSec;while(st.subT>=1){st.subT-=1;live.advance&&live.advance();}}
      const fIdx=Math.min(live.fIdx,total-1);
      const p0Contract=getFpsP0Contract();
      if(p0Contract){p0Contract.rafFrames+=1;if(p0Contract.lastAuthoritativeFidx!=null&&p0Contract.lastAuthoritativeFidx!==fIdx)p0Contract.staleMismatch+=1;}
      const frame=sim.frames[fIdx];const nf=sim.frames[Math.min(fIdx+1,total-1)];const pf=sim.frames[Math.max(0,fIdx-1)];
      st.matchPresentationDirector=live.presentationDirector||null;
      if(frame&&import.meta.env?.DEV&&typeof window!=="undefined"){
        const clock=st.clock||{wallClockSec:0,lastFrameIndex:null,frameTransitions:0,samples:[]};clock.wallClockSec=st.time;clock.simulationTimeSec=Number(frame.ts)||0;clock.playbackFrame=fIdx;clock.displayedTimerSec=frame.buyP?null:(frame.planted?Number((frame.c4t??0)*2):Math.max(0,115-Number(frame.roundSec)||0));if(clock.lastFrameIndex!==fIdx){if(clock.lastFrameIndex!=null)clock.frameTransitions+=1;clock.lastFrameIndex=fIdx;}if(clock.samples.length<240)clock.samples.push({wallClockSec:Number(st.time.toFixed(4)),simulationTimeSec:Number((frame.ts||0).toFixed(4)),playbackFrame:fIdx,displayedTimerSec:clock.displayedTimerSec});st.clock=clock;window.__ESMO_FPS_CLOCK__={...clock,samples:clock.samples.slice(-240)};
      }
      const sub=live.playing?clamp(st.subT,0,1):0;
      if(frame){updateDynamic(st,frame,nf,pf,sub,live,W,dt,fIdx,wallDt);}
      updateCamera(st,frame,sub,dt,W,live.cameraMode);
      if(st.sceneVersion!=="legacy"){
        // 觀戰聽音位置在鏡頭焦點；POV 在眼睛，不以高空相機距離壓低整場音量。
        const right=st.audioRight||(st.audioRight=new THREE.Vector3());right.set(1,0,0).applyQuaternion(st.camera.quaternion);
        const listener=live.audioListener||(live.audioListener={x:0,y:0,rightX:1,rightY:0});
        const focus=live.cameraMode==="pov"&&st._chase?.alive?st.camera.position:st.cam.tgt;
        listener.x=focus.x+50;listener.y=focus.z+50;listener.rightX=right.x;listener.rightY=right.z;
      }
      if(frame)layoutFpsWorldLabels(st,frame,live);
      updateFpsPovWeapon(st,frame,st._chase,Boolean(live.cameraMode==="pov"),dt);
      if(frame&&import.meta.env?.DEV){publishFpsVisibilityDiagnostics(st,frame,fIdx);}
      //  量測用：進場後只看到「第一個戰鬥 frame」與「rigged 角色全部就位後的第一個 frame」，
      //  兩個都記到就不再進入（之後每幀只剩一個布林判斷）。
      const loadWatch=st.loadWatch;
      const riggedPending=loadWatch&&!loadWatch.riggedReady&&frame&&st.mapReady?st.players.filter((player)=>player.rigged?.mode==="loading").length:-1;
      //  CS Mobile Stability closure：記「正式 rigged 還在載入時，舊 primitive 身體被畫出來」的格數（只有數字）。
      if(riggedPending>0){loadWatch.pendingFrames+=1;if(st.players.some((player)=>player.rigged?.mode==="loading"&&player.body.visible))loadWatch.primitiveLeakFrames+=1;}
      const watchName=riggedPending<0?null:!loadWatch.firstFrame?"gpu:first-render":riggedPending===0?"gpu:first-rigged-render":null;
      const endWatchRender=watchName?csLoadSpan(watchName):null;
      renderer.render(scene,camera);
      if(endWatchRender){
        endWatchRender({programs:renderer.info.programs?.length??0,calls:renderer.info.render.calls,textures:renderer.info.memory.textures});
        if(!loadWatch.firstFrame){loadWatch.firstFrame=true;csLoadMark("battle:first-frame",{riggedPending});}
        if(riggedPending===0){loadWatch.riggedReady=true;csLoadMark("battle:rigged-ready",{rigged:st.players.filter((player)=>player.rigged?.mode==="rigged").length,primitiveLeakFrames:loadWatch.primitiveLeakFrames,pendingFrames:loadWatch.pendingFrames});}
      }
      if(import.meta.env?.DEV&&typeof document!=="undefined"){
        const canvas=renderer.domElement;
        canvas.dataset.esmoFpsVisibilityFrame=String(fIdx);
        canvas.dataset.esmoFpsVisibility=st.visibilitySnapshot?.check?.ok?"ok":"violation";
        canvas.dataset.esmoFpsPlayers=String(st.players.length);
        canvas.dataset.esmoFpsRigged=String(st.players.filter((player)=>player.rigged?.mode==="rigged").length);
        canvas.dataset.esmoFpsFallback=String(st.players.filter((player)=>!player.rigged||player.rigged.mode!=="rigged").length);
        canvas.dataset.esmoFpsMixers=String(st.players.filter((player)=>player.rigged?.mixer).length);
        canvas.dataset.esmoFpsRenderCalls=String(renderer.info.render.calls);
        canvas.dataset.esmoFpsTriangles=String(renderer.info.render.triangles);
        canvas.dataset.esmoFpsGeometries=String(renderer.info.memory.geometries);
        canvas.dataset.esmoFpsTextures=String(renderer.info.memory.textures);
        const c5a=st.c5aFxEvidence||{};
        canvas.dataset.esmoFpsC5aGunfire=String(c5a.gunfire||0);
        canvas.dataset.esmoFpsC5aHits=String(c5a.hits||0);
        canvas.dataset.esmoFpsC5aImpacts=String(c5a.impacts||0);
        canvas.dataset.esmoFpsC5aDeaths=String(c5a.deaths||0);
        canvas.dataset.esmoFpsC5aFamilies=JSON.stringify(c5a.families||{});
        canvas.dataset.esmoFpsC5aSurfaces=JSON.stringify(c5a.surfaces||{});
        canvas.dataset.esmoFpsC5a1HitDriftMax=String(st.c5a1HitDriftMax||0);
        canvas.dataset.esmoFpsC5a1HitDriftSamples=String(st.c5a1HitDriftSamples||0);
        canvas.dataset.esmoFpsC5a1AuthoritativeDriftMax=String(st.c5a1AuthoritativeDriftMax||0);
        const c5b=st.utilityFxEvidence||{};
        canvas.dataset.esmoFpsC5bSmoke=String(c5b.activeSmoke||0);
        canvas.dataset.esmoFpsC5bSmokeStages=JSON.stringify(c5b.smokeStages||{});
        canvas.dataset.esmoFpsC5bTrajectory=String(c5b.trajectorySamples||0);
        canvas.dataset.esmoFpsC5bHe=String(c5b.heBursts||0);
        canvas.dataset.esmoFpsC5bFlash=String(c5b.flashBursts||0);
        canvas.dataset.esmoFpsC5bFlashRecovery=String(c5b.flashRecoverySamples||0);
        canvas.dataset.esmoFpsC5bMolly=String(c5b.mollyZones||0);
        canvas.dataset.esmoFpsC5bMarkers=String(c5b.visibleMarkers||0);
      }
    };
    st_start();
    function st_start(){const st=stateRef.current;st.running=true;st.raf=requestAnimationFrame(animate);}

    return()=>{
      const st=stateRef.current;if(st)st.running=false;
      cancelAnimationFrame(st?.raf);
      st?.c5aGunplayFx?.dispose?.();
      st?.utilityFx?.dispose?.();
      st?.players?.forEach((player)=>player.rigged?.dispose?.());
      st?.roofShaderWarmup?.dispose?.();
      if(st?.povWeapon?.major)st.povWeapon.dispose();
      else st?.povWeapon?.group?.traverse((object)=>{object.geometry?.dispose?.();const materials=Array.isArray(object.material)?object.material:[object.material];materials.filter(Boolean).forEach(material=>material.dispose?.());});
      st?.camera?.remove?.(st?.povWeapon?.group);
      ro.disconnect();
      //  ⚠ 地圖環境（857 行的幾何與材質）以前完全沒有被收 —— 實測離場後
      //    仍有 561 geometries、55 textures、19 programs 留著。
      st?.c3Environment?.dispose?.();
      //  ── 排乾單一清理路徑 ──────────────────────────────────────────
      //  ⚠ 逐項 try/catch：一項失敗不可以讓後面的清理整串停掉，
      //    否則一個小錯誤就會退回「什麼都沒收」的狀態。
      for(const d of (st?.disposables??[])){try{d.fn();}catch(e){console.warn("[cs-cleanup]",d.label,e);}}
      if(st)st.disposables=[];
      scene.clear?.();
      if(onRecenterRef)onRecenterRef.current=null;
      if(onCameraPresetRef)onCameraPresetRef.current=null;
      if(typeof window!=="undefined")delete window.__ESMO_FPS_P0_CONTRACT__;
      //  ⚠ 這個全域參照是**主要**的洩漏：它在卸載後仍指著整份 state，
      //    於是 renderer、canvas、場景圖、所有閉包都無法被回收 —— 連已經
      //    dispose 過的東西也還被 hold 著。必須清掉。
      //    只有在它仍指向**這一次**的 state 時才清，避免把下一次掛載的踩掉。
      if(typeof window!=="undefined"&&window.__ESMO_FPS_SCENE__===st)delete window.__ESMO_FPS_SCENE__;
      try{mount.removeChild(renderer.domElement);}catch(e){}
      //  ⚠ 留下**卸載後**的資源數字給量測／regression 用。
      //    只寫數字：寫物件參照的話，等於把剛修掉的洩漏原封不動放回來。
      try{
        const info=renderer.info;
        if(typeof window!=="undefined")window.__ESMO_FPS_TEARDOWN__={
          geometries:info?.memory?.geometries??null,textures:info?.memory?.textures??null,
          programs:info?.programs?.length??null,sceneChildren:scene?.children?.length??null,
          at:Date.now(),
        };
      }catch(e){}
      renderer.dispose();
      //  ⚠ WebGL context 數量有上限（約 16）。只 dispose renderer 不保證
      //    context 立刻釋放；明確要求 context loss 才不會在多次進出後耗盡。
      try{renderer.forceContextLoss?.();}catch(e){}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── 依地圖重建靜態世界 + 重置選手/特效池 ──
  useEffect(()=>{
    const st=stateRef.current;if(!st)return;
    const endMapBuild=csLoadSpan("scene:map-build");
    st.cam.autoFollow=true;st.cam.overview=true;st.cam.viewPreset=null;st.cam._ovBase=null;st.cameraRecoveryCount=0;
    st.c5a1HitDriftMax=0;st.c5a1HitDriftSamples=0;st.c5a1AuthoritativeDriftMax=0;st.objectiveSiteCount=0;
    const {scene,worldGroup,playerGroup,fxGroup,routeGroup,tex,sphereGeo}=st;
    const map=(sceneVersion==="legacy"?FPS_LEGACY_MAPS:MAPS)[mapKey];
    const isMirage=mapKey==="mirage";
    const isDust=mapKey==="dust2";
    // Dust II / Inferno use darker floor palettes, so give them a restrained
    // map-specific fill and exposure lift. This improves moving-player
    // silhouette readability without changing camera, simulation, or routes.
    st.renderer.toneMappingExposure=isMirage?1.18:isDust?1.24:1.2;
    st.renderer.setClearColor(isMirage?0x1b252a:isDust?0x151718:0x1a110e,1);
    scene.fog.color.set(isMirage?0x46504d:isDust?0x34302a:0x3b281d);
    scene.fog.near=isMirage?190:isDust?175:165;scene.fog.far=isMirage?390:isDust?380:370;
    st.ambient.color.set(isMirage?0x8093a0:isDust?0xa6b1b5:0xb78f72);st.ambient.intensity=isMirage?0.78:isDust?0.78:0.82;
    st.hemi.color.set(isMirage?0xd3e5e7:isDust?0xd7e0e0:0xe2bd99);st.hemi.groundColor.set(isMirage?0x5a554b:isDust?0x655443:0x55311f);st.hemi.intensity=isMirage?1.02:isDust?0.9:0.92;
    st.sun.intensity=isMirage?1.82:isDust?1.86:1.8;st.rim.intensity=isMirage?0.58:isDust?0.52:0.5;
    if(sceneVersion!=="legacy"){
      st.ambient.intensity=1.04;st.hemi.intensity=1.15;
      st.hemi.groundColor.set(isMirage?0x89938a:isDust?0x899399:0x98887a);
      st.sun.intensity=1.62;
      if(!isMirage&&!isDust){
        // 鑄造材質本身提供暖色；天空補光保持中性，避免整片灰地也染褐色。
        st.ambient.color.set(0xb8cbd4);st.ambient.intensity=.82;
        st.hemi.color.set(0xd1e5ed);st.hemi.groundColor.set(0x89938b);st.hemi.intensity=1.1;
        st.sun.intensity=1.95;st.renderer.toneMappingExposure=1.28;
        scene.fog.color.set(0x7b8586);
      }
    }
    // Renderer-side ray tests must use the same solid obstacle source as the
    // authoritative simulator. Keep tall buildings for camera fading, while
    // retaining low cover for tracer / line-of-sight blocking.
    const solidObstacles=c5a2SolidObstacles(map);
    st.wallRects=solidObstacles.filter(w=>(w.hgt||7)>=5).map(w=>({x0:W.vx(w.x),z0:W.vz(w.y),x1:W.vx(w.x+w.w),z1:W.vz(w.y+w.h)}));
    st.mapWalls=solidObstacles;
    st.collisionRects=solidObstacles;

    // 清空既有（保留共用紋理/幾何，其餘釋放）
    const SHARED=new Set([sphereGeo,st.beamGeo,tex.flash,tex.smoke,tex.fire,tex.glow]);
    const disp=o=>{
      if(o.geometry&&!SHARED.has(o.geometry))o.geometry.dispose?.();
      const mm=Array.isArray(o.material)?o.material:(o.material?[o.material]:[]);
      mm.forEach(m=>{if(!m)return;if(m.map&&!SHARED.has(m.map))m.map.dispose?.();m.dispose?.();});
    };
    const clear=g=>{for(let i=g.children.length-1;i>=0;i--){const c=g.children[i];c.traverse(disp);g.remove(c);}};
    st.c5aGunplayFx?.dispose?.();
    st.c5aGunplayFx=null;
    st.utilityFx?.dispose?.();
    st.utilityFx=null;
    st.players.forEach((player)=>player.rigged?.dispose?.());
    st.roofShaderWarmup?.dispose?.();st.roofShaderWarmup=null;
    st.c3Environment?.dispose?.();
    clear(worldGroup);clear(playerGroup);clear(fxGroup);clear(routeGroup);
    st.raycastTargets=[];
    //  ⚠ 換地圖會重建環境 ⇒ 先收掉上一份，否則每換一次就多留一整張地圖。
    st.c3Environment?.dispose?.();
    st.sceneVersion=sceneVersion;st.mapKey=mapKey;
    const streetMemo=new Map();
    const streetSegments=sceneVersion==="legacy"?null:createFpsMajorSegmentCache(solidObstacles,PLAYER_R);
    const streets=[map.sites.a,map.sites.b,map.nodes.mid,map.spawns.ct].filter(Boolean).map(p=>buildNavigableRoute([map.spawns.t,p],solidObstacles,PLAYER_R,streetMemo,streetSegments));
    st.c3Environment=csLoadTime("scene:map-environment",()=>createMajorMapEnvironment({group:worldGroup,mapKey,map,obstacles:solidObstacles,W,mobile,streets,terrain:sceneVersion!=="legacy"}),{mapKey});
    if(sceneVersion!=="legacy")st.sampleGroundHeight=createFpsFloorSampler(st.c3Environment.group,(x,z)=>fpsMajorElevation(mapKey,{x:x+50,y:z+50}));

    // 地板
    if(st.floorTex)st.floorTex.dispose?.();
    st.floorTex=null;
    // major 地表與周邊由同一場景工廠／atlas持有，不再疊一張白色方形底板。
    if(sceneVersion==="legacy"){
      st.floorTex=csLoadTime("scene:floor-texture",()=>makeFloorTexture({...map,floor:mapKey==="mirage"?"#89918b":mapKey==="dust2"?"#758389":"#85756b",floorVignette:0.12}));
      const floorGeo=new THREE.PlaneGeometry(100,100,mobile?24:40,mobile?24:40);floorGeo.rotateX(-Math.PI/2);
      const floor=new THREE.Mesh(floorGeo,new THREE.MeshStandardMaterial({map:st.floorTex,roughness:.97,metalness:0}));floor.receiveShadow=true;worldGroup.add(floor);
    }
    // 地板外框光帶

    // 建物與掩體由同源 collider 的 Major kit 負責；不另造裝飾牆。
    const endStaticWorld=csLoadSpan("scene:static-world");
    st.fadeWalls=st.c3Environment.fadeWalls;
    // 炸彈點 A/B 標記（地面紅環 + 大字）
    ["a","b"].forEach(k=>{const s=map.sites[k];if(!s)return;
      const major=sceneVersion!=="legacy";
      const zone=new THREE.Mesh(new THREE.RingGeometry(5.2,major?5.48:7.2,40),new THREE.MeshBasicMaterial({color:major?0xdcb96a:0xef4444,transparent:true,opacity:major?.42:.32,side:THREE.DoubleSide,depthWrite:!major}));
      const elevation=sceneVersion==="legacy"?0:fpsMajorElevation(mapKey,s);
      const conformMarker=(geometry,lift=.06)=>{geometry.rotateX(-Math.PI/2);const pos=geometry.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,(sceneVersion==="legacy"?0:fpsMajorElevation(mapKey,{x:s.x+pos.getX(i),y:s.y+pos.getZ(i)}))+lift);geometry.computeVertexNormals();};
      conformMarker(zone.geometry,major?.12:.06);zone.position.set(W.vx(s.x),0,W.vz(s.y));zone.renderOrder=major?11:0;zone.visible=!major;worldGroup.add(zone);
      const fill=new THREE.Mesh(new THREE.CircleGeometry(5.2,40),new THREE.MeshBasicMaterial({color:major?0xdcb96a:0xef4444,transparent:true,opacity:major?.025:.08,side:THREE.DoubleSide,depthWrite:!major}));
      conformMarker(fill.geometry,major?.115:.06);fill.position.set(W.vx(s.x),0,W.vz(s.y));fill.renderOrder=major?10:0;fill.visible=!major;worldGroup.add(fill);
      const letTex=makeBigLetter(k.toUpperCase(),major?"rgba(238,219,166,0.8)":"rgba(248,113,113,0.55)");letTex.__keep=false;
      const let3=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshBasicMaterial({map:letTex,transparent:true,depthWrite:!major}));
      let3.rotation.x=-Math.PI/2;let3.position.set(W.vx(s.x),elevation+(major?.14:.06),W.vz(s.y));let3.renderOrder=major?12:0;let3.userData.fpsMarkerType="objective-site";worldGroup.add(let3);
      zone.userData.fpsMarkerType="objective-site";fill.userData.fpsMarkerType="objective-site";
      st.objectiveSiteCount=(st.objectiveSiteCount||0)+1;
    });
    // 地名（平貼地面，可由 HUD 開關）
    st.calloutSprites=[];
    (map.callouts||[]).forEach(c=>{
      const {tex:lt,w,h}=makeLabelSprite(c.l,"rgba(220,224,214,0.6)",36);
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w/14,h/14),new THREE.MeshBasicMaterial({map:lt,transparent:true,depthWrite:false}));
      m.rotation.x=-Math.PI/2;m.position.set(W.vx(c.x),0.07,W.vz(c.y));m.userData.fpsMarkerType="map-callout";m.visible=FPS_DEBUG_ENABLED;worldGroup.add(m);st.calloutSprites.push(m);
    });

    endStaticWorld({walls:map.walls.length});
    const endPlayers=csLoadSpan("scene:players");
    // ── 選手（10 名，固定池）──
    const riggedLimit=getRiggedCharacterLimit(roster);
    st.players=roster.map((p,playerIndex)=>{
      const col=new THREE.Color(p.side==="ct"?0x39a9e6:0xf08a3c);
      const g=new THREE.Group();g.userData.pid=p.id;g.userData.side=p.side;
      // 地面光環
      const ringMat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.85,side:THREE.DoubleSide});ringMat.__keep=true;
      const ring=new THREE.Mesh(new THREE.RingGeometry(0.62,0.92,28),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=0.05;ring.visible=false;g.add(ring);
      const discMat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.18,side:THREE.DoubleSide});discMat.__keep=true;
      const disc=new THREE.Mesh(new THREE.CircleGeometry(0.62,24),discMat);disc.rotation.x=-Math.PI/2;disc.position.y=0.045;disc.visible=false;g.add(disc);
      // 身體（會依視角轉向的子群；+X 為瞄準方向）
      const body=new THREE.Group();
      const torsoMat=new THREE.MeshStandardMaterial({color:col,roughness:0.55,metalness:0.1,emissive:col,emissiveIntensity:0.18});torsoMat.__keep=true;
      const torso=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.4,1.0,14),torsoMat);torso.position.y=0.62;torso.castShadow=true;body.add(torso);
      const headMat=new THREE.MeshStandardMaterial({color:0xd8b48a,roughness:0.7});headMat.__keep=true;
      const head=new THREE.Mesh(new THREE.SphereGeometry(0.26,16,12),headMat);head.position.y=1.26;head.castShadow=true;body.add(head);
      const helmMat=new THREE.MeshStandardMaterial({color:col.clone().offsetHSL(0,0,-0.12),roughness:0.5,metalness:0.2});helmMat.__keep=true;
      const helm=new THREE.Mesh(new THREE.SphereGeometry(0.29,14,10,0,Math.PI*2,0,Math.PI*0.55),helmMat);helm.position.y=1.32;body.add(helm);
      // 手臂（袖子同隊色）+ 手（膚色），擺出持槍前伸姿態
      const limb=(p0,p1,r,m)=>{const a=new THREE.Vector3(p0[0],p0[1],p0[2]),b=new THREE.Vector3(p1[0],p1[1],p1[2]),d=new THREE.Vector3().subVectors(b,a),len=Math.max(0.01,d.length());const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,8),m);mesh.position.copy(a).add(b).multiplyScalar(0.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());mesh.castShadow=true;return mesh;};
      const sleeveMat=new THREE.MeshStandardMaterial({color:col.clone().offsetHSL(0,0,-0.05),roughness:0.6,metalness:0.08});sleeveMat.__keep=true;
      const handMat=new THREE.MeshStandardMaterial({color:0xcaa078,roughness:0.7});handMat.__keep=true;
      body.add(limb([0.04,1.0,-0.16],[0.46,0.86,0.02],0.075,sleeveMat)); // 右臂（扳機手）
      body.add(limb([0.04,1.0,0.16],[0.82,0.92,0.05],0.075,sleeveMat));  // 左臂（前護木）
      const hR=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),handMat);hR.position.set(0.48,0.86,0.02);body.add(hR);
      const hL=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),handMat);hL.position.set(0.84,0.92,0.05);body.add(hL);
      // 步槍（前方持握，多部件）
      const gun=new THREE.Group();
      const metalMat=new THREE.MeshStandardMaterial({color:0x23262e,roughness:0.45,metalness:0.55});metalMat.__keep=true;
      const polyMat=new THREE.MeshStandardMaterial({color:0x15171c,roughness:0.7,metalness:0.2});polyMat.__keep=true;
      const recv=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.13,0.13),metalMat);recv.position.set(0.6,0.92,0.04);gun.add(recv);
      const barrel=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.06,0.06),metalMat);barrel.position.set(1.02,0.93,0.04);gun.add(barrel);
      const guard=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.1,0.1),polyMat);guard.position.set(0.8,0.89,0.04);gun.add(guard);
      const stock=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.13,0.1),polyMat);stock.position.set(0.3,0.9,0.04);gun.add(stock);
      const mag=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.3,0.12),polyMat);mag.position.set(0.56,0.74,0.04);mag.rotation.z=0.18;gun.add(mag);
      const sight=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.09,0.05),metalMat);sight.position.set(0.62,1.0,0.04);gun.add(sight);
      body.add(gun);
      // Read-only carrier marker driven by the authoritative frame hasBomb state.
      const bagMat=new THREE.MeshStandardMaterial({color:0x24252a,roughness:0.82,metalness:0.12});bagMat.__keep=true;
      const bombBag=new THREE.Group();
      const bag=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.42,0.28),bagMat);bag.position.set(-0.22,0.68,0);bombBag.add(bag);
      const bagMarkMat=new THREE.MeshStandardMaterial({color:0xfbbf24,emissive:0x5a3500,emissiveIntensity:0.65,roughness:0.45});bagMarkMat.__keep=true;
      const bagMark=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.13,0.035),bagMarkMat);bagMark.position.set(-0.22,0.75,-0.15);bombBag.add(bagMark);
      const carrierC4=makeLabelSprite("C4","rgba(255,244,190,0.98)",22,"rgba(45,20,18,0.92)");
      const carrierC4Icon=new THREE.Sprite(new THREE.SpriteMaterial({map:carrierC4.tex,transparent:true,depthTest:false}));carrierC4Icon.scale.set(0.38,0.18,1);carrierC4Icon.position.set(-0.22,1.03,-0.2);bombBag.add(carrierC4Icon);
      bombBag.visible=false;body.add(bombBag);
      const bodyParts={torso,head,helm,limbs:body.children.slice(3,7),weapon:gun};
      // 架槍視線（沿瞄準方向的細光線，顯示選手正在架住的角度）
      const aimMat=new THREE.MeshBasicMaterial({color:p.side==="ct"?0x7dd3fc:0xfdba74,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});aimMat.__keep=true;
      const aimLine=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.02,9,6),aimMat);aimLine.rotation.z=Math.PI/2;aimLine.position.set(1.1+4.5,0.95,0.04);aimLine.visible=false;body.add(aimLine);
      g.add(body);
      const rigged=createFpsCharacterRenderer({parent:g,player:p,enabled:playerIndex<riggedLimit,optimized:sceneVersion!=="legacy",mobile});
      // 選中柱
      const beamMat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.0,blending:THREE.AdditiveBlending,depthWrite:false});beamMat.__keep=true;
      const selBeam=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,7,8),beamMat);selBeam.position.y=3.5;g.add(selBeam);
      // 血條（實體 3D 長條，billboard 面向相機，量條會明顯縮短）
      const hpBg=new THREE.Mesh(new THREE.BoxGeometry(1.42,0.24,0.09),new THREE.MeshBasicMaterial({color:0x080b12,depthTest:false}));
      const hpFill=new THREE.Mesh(new THREE.BoxGeometry(1.3,0.16,0.12),new THREE.MeshBasicMaterial({color:0x34d399,depthTest:false}));
      hpBg.renderOrder=10;hpFill.renderOrder=11;hpFill.position.z=0.03;
      const hpGroup=new THREE.Group();hpGroup.add(hpBg);hpGroup.add(hpFill);hpGroup.position.y=2.02;g.add(hpGroup);
      // 名牌（billboard，靜態紋理）
      const {tex:nt,w:nw,h:nh}=makeLabelSprite(p.name,p.side==="ct"?"rgba(190,228,255,0.95)":"rgba(255,214,170,0.95)",34,"rgba(8,11,18,0.6)");
      const nameSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:nt,transparent:true,depthTest:false}));
      nameSpr.scale.set(nw/30,nh/30,1);nameSpr.position.y=2.5;nameSpr.userData.base={x:nw/30,y:nh/30};g.add(nameSpr);
      // 死亡地面標記（隊色 X，方便縱觀戰場）
      const deadMat=new THREE.MeshBasicMaterial({color:p.side==="ct"?0x2f6f96:0x9c5a2a,transparent:true,opacity:0.0,side:THREE.DoubleSide,depthWrite:false});deadMat.__keep=true;
      const dead=new THREE.Group();
      [-1,1].forEach(s=>{const bar=new THREE.Mesh(new THREE.PlaneGeometry(1.7,0.26),deadMat);bar.rotation.x=-Math.PI/2;bar.rotation.z=s*Math.PI/4;dead.add(bar);});
      dead.position.y=0.06;g.add(dead);

      playerGroup.add(g);
      g.traverse(o=>{o.frustumCulled=false;if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(mm=>{mm.fog=false;});}}); // 選手不受霧/視錐裁切影響，避免拉遠/縮放/邊緣時消失
      return {id:p.id,side:p.side,role:p.role,col,g,body,bodyParts,torso,torsoMat,head,gun,bombBag,ring,ringMat,disc,selBeam,beamMat,hpGroup,hpFill,nameSpr,dead,deadMat,aimLine,aimMat,rigged};
    });
    st.raycastTargets=st.players.map(p=>p.g);
    const weaponSocketPlayers=new Map(st.players.map(p=>[p.id,p]));
    st.resolveWeaponMuzzle=sceneVersion!=="legacy"?(id,family,target)=>weaponSocketPlayers.get(id)?.rigged?.getMuzzleWorldPosition?.(target,family)||null:null;
    st.resolveWeaponMuzzleDirection=sceneVersion!=="legacy"?(id,family,target)=>weaponSocketPlayers.get(id)?.rigged?.getMuzzleWorldDirection?.(target,family)||null:null;
    endPlayers({players:st.players.length});
    const endFxPools=csLoadSpan("scene:fx-pools");

    // ── 特效池 ──
    const mkPool=(n,make)=>{const arr=[];for(let i=0;i<n;i++){const o=make();o.visible=false;fxGroup.add(o);arr.push(o);}return arr;};
    st.pools={
      tracer:mkPool(80,()=>new THREE.Mesh(st.beamGeo,new THREE.MeshBasicMaterial({color:0xfde047,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}))),
      muzzle:mkPool(16,()=>new THREE.Sprite(new THREE.SpriteMaterial({map:tex.flash,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}))),
      drop:mkPool(12,()=>new THREE.Mesh(new THREE.BoxGeometry(0.7,0.16,0.16),new THREE.MeshStandardMaterial({color:0xc9a24a,emissive:0x3a2c10,emissiveIntensity:0.6,roughness:0.5}))),
      spark:mkPool(24,()=>new THREE.Sprite(new THREE.SpriteMaterial({map:tex.glow,color:0xfff1c0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}))),
    };
    st.c5aGunplayFx=createGunplayPresentation({group:fxGroup,scene,tex,beamGeometry:st.beamGeo,mapKey,sceneVersion});
    st.utilityFx=createUtilityPresentation({group:fxGroup,textures:tex,sphereGeometry:sphereGeo,sampleGroundHeight:st.sampleGroundHeight,major:sceneVersion!=="legacy"});
    // 槍口閃光點光（共用，循環）
    st.flashLights=[0,1,2].map(()=>{const l=new THREE.PointLight(0xffe6a0,0,14,2);l.visible=false;scene.add(l);return l;});
    st.flashIdx=0;
    // 炸彈信標
    const bombMat=new THREE.MeshStandardMaterial({color:0x252a33,emissive:0x4d1d1d,emissiveIntensity:1.2,roughness:0.4,metalness:0.22});bombMat.__keep=true;
    const bomb=new THREE.Group();
    const bombCase=new THREE.Mesh(new THREE.BoxGeometry(0.95,0.28,0.62),bombMat);bombCase.position.y=0.28;bomb.add(bombCase);
    const bombPanelMat=new THREE.MeshStandardMaterial({color:0x11151c,emissive:0x4f2600,emissiveIntensity:0.5,roughness:0.55,metalness:0.32});bombPanelMat.__keep=true;
    const bombPanel=new THREE.Mesh(new THREE.BoxGeometry(0.54,0.035,0.38),bombPanelMat);bombPanel.position.set(0,0.44,0);bomb.add(bombPanel);
    const bombKeyMat=new THREE.MeshStandardMaterial({color:0xfbbf24,emissive:0x6b3f00,emissiveIntensity:0.75,roughness:0.38,metalness:0.25});bombKeyMat.__keep=true;
    for(let i=0;i<4;i++){const key=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.045,0.075),bombKeyMat);key.position.set(-0.18+(i%2)*0.24,0.49,-0.08+Math.floor(i/2)*0.16);bomb.add(key);}
    const bombCableMat=new THREE.MeshStandardMaterial({color:0xb33a35,roughness:0.7,metalness:0.1});bombCableMat.__keep=true;
    const bombCable=new THREE.Mesh(new THREE.TorusGeometry(0.24,0.025,6,18,Math.PI),bombCableMat);bombCable.rotation.x=Math.PI/2;bombCable.position.set(0,0.45,0.05);bomb.add(bombCable);
    const c4Label=makeLabelSprite("C4","rgba(255,244,190,0.98)",30,"rgba(45,20,18,0.9)");
    const bombLabel=new THREE.Sprite(new THREE.SpriteMaterial({map:c4Label.tex,transparent:true,depthTest:false}));bombLabel.scale.set(0.95,0.43,1);bombLabel.position.y=1.15;bomb.add(bombLabel);
    const bombGrp=new THREE.Group();bomb.position.y=0.05;bombGrp.add(bomb);bombGrp.visible=false;fxGroup.add(bombGrp);
    // Major 的炸彈用 emissive／信標讀狀態，不在首次掉包時新增動態燈。
    // CPU profile：首次 PointLight 改變整場 Standard shader 的燈數，
    // getProgramInfoLog 等待約790ms；legacy 保留原呈現以供正式版本對照。
    const bombLight=sceneVersion==="legacy"?new THREE.PointLight(0xff3030,0,18,2):null;
    if(bombLight)bombGrp.add(bombLight);
    st.bomb={grp:bombGrp,mat:bombMat,light:bombLight,box:bombCase,label:bombLabel};

    endFxPools();
    st.mapReady=true;st.seekNonce=-1;st.subT=0;
    //  量測用：只記「第一個戰鬥 frame」與「rigged 角色全部就位」兩個時間點，記完即停。
    st.loadWatch={firstFrame:false,riggedReady:false,primitiveLeakFrames:0,pendingFrames:0};
    st.riggedRevealDeadline=(typeof performance!=="undefined"?performance.now():0)+RIGGED_REVEAL_TIMEOUT_MS;
    if(sceneVersion!=="legacy"){
      const endWarmup=csLoadSpan("scene:roof-shader-warmup");
      const warmup=createFpsMajorRoofShaderWarmup({renderer:st.renderer,scene,camera:st.camera,environment:st.c3Environment,effectGroups:[fxGroup]});
      st.roofShaderWarmup=warmup;
      void warmup.ready.then(result=>{endWarmup(result);if(result.status==='failed'&&import.meta.env?.DEV)console.warn('[FPS] 屋頂shader預熱失敗',result.error);});
    }
    endMapBuild({mapKey});
  // roster reference is useMemo-stable in the wrapper and changes on identity change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mapKey,sceneVersion,roster]);

  return <div ref={mountRef} style={{position:"absolute",inset:0,touchAction:"none"}}/>;
}

// ── 每幀更新：選手 + 特效（插值）──
const _q=new THREE.Quaternion(),_vA=new THREE.Vector3(),_vB=new THREE.Vector3(),_dir=new THREE.Vector3(),_xAxis=new THREE.Vector3(1,0,0);

// ── CS Mobile Stability closure：正式 rigged 角色就位前不露出舊 primitive ────────
// 根因：每幀以 `P.body.visible=!riggedActive` 決定 primitive 身體，而 rigged controller 在
// GLB 下載／parse 期間是 mode "loading"（不是 "rigged"）⇒ 首次進場那段時間畫出舊的 primitive
// （俯瞰鏡頭下還會被放大），GLB 就位後才切成正式角色。返回同一場因資產已快取而沒有這個空窗。
// 修法只改「loading」這一種狀態：先不畫 primitive，就位後一次顯示正式角色。
// ⚠ fallback safety 不變：載入失敗（"failed"）與關閉 rigged（"fallback"）照舊顯示 primitive；
//   資產卡住超過期限也退回 primitive，不讓選手永遠不見。
//  ⚠ 這個期限只給「資產真的卡死」用，不是一般慢網路：CPU 4×＋4G 模擬低階手機時，
//    rigged 資產在 map build 後約 30 秒以上才就位，20 秒的期限會讓舊 primitive 又冒出來。
//    載入失敗仍會立刻變成 "failed" 而退回 primitive，不受這個期限影響。
const RIGGED_REVEAL_TIMEOUT_MS=60000;
function primitiveBodyAllowed(st,P){
  const mode=P.rigged?.mode;
  if(mode==="rigged")return false;
  if(mode!=="loading")return true;
  return Number.isFinite(st.riggedRevealDeadline)&&typeof performance!=="undefined"&&performance.now()>=st.riggedRevealDeadline;
}

function allFinite(values){return values.every((value)=>Number.isFinite(Number(value)));}
function nodeVisibleThroughParents(node){
  let current=node?.parent;
  while(current){if(current.visible===false)return false;current=current.parent;}
  return true;
}
function materialSnapshot(node){
  let renderable=0,visibleRenderable=0,materialVisible=0,minOpacity=1,maxOpacity=0,frustumCulled=0;
  node?.traverse?.((object)=>{
    if(!object.isMesh&&!object.isLine&&!object.isSprite)return;
    renderable+=1;if(object.visible)visibleRenderable+=1;if(object.frustumCulled)frustumCulled+=1;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    materials.filter(Boolean).forEach((material)=>{
      const opacity=Number.isFinite(Number(material.opacity))?Number(material.opacity):1;
      minOpacity=Math.min(minOpacity,opacity);maxOpacity=Math.max(maxOpacity,opacity);
      if(object.visible&&opacity>0)materialVisible+=1;
    });
  });
  return {renderable,visibleRenderable,materialVisible,minOpacity,maxOpacity,frustumCulled};
}
function bodyPartSnapshot(nodes){
  const list=(Array.isArray(nodes)?nodes:[nodes]).filter(Boolean);
  const renderables=list.map(materialSnapshot);
  return {
    exists:list.length>0,
    visible:list.length>0&&list.every((node)=>node.visible!==false&&nodeVisibleThroughParents(node)),
    renderable:renderables.reduce((sum,snapshot)=>sum+snapshot.renderable,0),
    visibleRenderable:renderables.reduce((sum,snapshot)=>sum+snapshot.visibleRenderable,0),
    materialVisible:renderables.reduce((sum,snapshot)=>sum+snapshot.materialVisible,0),
  };
}
function nodeTransformSnapshot(node,updatedBounds=null){
  if(!node)return {exists:false,visible:false,matrixFinite:false,position:null,rotation:null,scale:null,bounds:null};
  if(!updatedBounds)node.updateWorldMatrix?.(true,true);
  const matrix=node.matrixWorld?.elements||[];
  const bounds=updatedBounds||new THREE.Box3().setFromObject(node);
  const finiteBounds=!bounds.isEmpty()&&allFinite([bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z]);
  return {
    exists:true,visible:node.visible!==false,matrixFinite:allFinite(matrix),
    position:{x:diagRound(node.position.x),y:diagRound(node.position.y),z:diagRound(node.position.z)},
    rotation:{x:diagRound(node.rotation.x),y:diagRound(node.rotation.y),z:diagRound(node.rotation.z)},
    scale:{x:diagRound(node.scale.x),y:diagRound(node.scale.y),z:diagRound(node.scale.z)},
    bounds:finiteBounds?{min:{x:diagRound(bounds.min.x),y:diagRound(bounds.min.y),z:diagRound(bounds.min.z)},max:{x:diagRound(bounds.max.x),y:diagRound(bounds.max.y),z:diagRound(bounds.max.z)}}:null,
    boundsFinite:finiteBounds,
  };
}
function projectBodyScreenFootprint(node,camera,canvas,worldMatricesCurrent=false){
  const bounds=new THREE.Box3(),objectBounds=new THREE.Box3(),part=new THREE.Box3();let renderables=0;
  node?.traverse?.((object)=>{
    if(!object.isMesh&&!object.isLine&&!object.isSprite)return;
    if(object.visible===false||!nodeVisibleThroughParents(object))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(!materials.some((material)=>material&&Number(material.opacity??1)>0))return;
    if(worldMatricesCurrent)setFpsBoundsFromUpdatedObject(object,objectBounds,part);
    else objectBounds.setFromObject(object);
    if(objectBounds.isEmpty())return;
    bounds.union(objectBounds);renderables+=1;
  });
  if(!renderables||bounds.isEmpty())return {present:false,widthPx:0,heightPx:0,inViewport:false,readable:false,depthVisible:false,ndcBounds:null};
  const {min,max}=bounds;
  const corners=[];
  for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z])corners.push(new THREE.Vector3(x,y,z).project(camera));
  const finite=corners.filter((point)=>allFinite([point.x,point.y,point.z]));
  if(!finite.length)return {present:true,widthPx:0,heightPx:0,inViewport:false,readable:false,depthVisible:false,ndcBounds:null};
  const canvasWidth=canvas?.clientWidth||1,canvasHeight=canvas?.clientHeight||1;
  const xs=finite.map((point)=>(point.x+1)*0.5*canvasWidth),ys=finite.map((point)=>(1-point.y)*0.5*canvasHeight);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const widthPx=Math.max(0,maxX-minX),heightPx=Math.max(0,maxY-minY);
  const depthVisible=finite.some((point)=>point.z>=-1&&point.z<=1);
  const inViewport=depthVisible&&maxX>=0&&minX<=canvasWidth&&maxY>=0&&minY<=canvasHeight;
  const footprint={present:true,widthPx:diagRound(widthPx),heightPx:diagRound(heightPx),inViewport,depthVisible,ndcBounds:{x0:diagRound(Math.min(...finite.map((point)=>point.x))),x1:diagRound(Math.max(...finite.map((point)=>point.x))),y0:diagRound(Math.min(...finite.map((point)=>point.y))),y1:diagRound(Math.max(...finite.map((point)=>point.y))),z0:diagRound(Math.min(...finite.map((point)=>point.z))),z1:diagRound(Math.max(...finite.map((point)=>point.z)))}};
  return {...footprint,readable:isFpsBodyScreenReadable(footprint)};
}
function diagRound(value){return Number.isFinite(Number(value))?Number(Number(value).toFixed(3)):null;}
function buildFpsVisibilitySnapshot(st,frame,frameIndex){
  const optimizedBounds=st.sceneVersion!=="legacy";
  const frameById=new Map((frame?.players||[]).map((player)=>[player.id,player]));
  const sceneVisible=st.scene?.visible!==false,playerGroupVisible=st.playerGroup?.visible!==false;
  st.camera.updateMatrixWorld();
  const cameraMatrix=new THREE.Matrix4().multiplyMatrices(st.camera.projectionMatrix,st.camera.matrixWorldInverse);
  const frustum=new THREE.Frustum().setFromProjectionMatrix(cameraMatrix);
  const players=st.players.map((P)=>{
    const authoritative=frameById.get(P.id)||null,riggedActive=P.rigged?.mode==="rigged",activeRoot=riggedActive?P.rigged?.root:P.body;
    P.g.updateWorldMatrix(true,true);if(!optimizedBounds)activeRoot?.updateWorldMatrix?.(true,true);
    const worldPosition=new THREE.Vector3();if(optimizedBounds)worldPosition.setFromMatrixPosition(P.g.matrixWorld);else P.g.getWorldPosition(worldPosition);
    const primitiveBody=materialSnapshot(P.body),activeBody=materialSnapshot(activeRoot),sceneBodyPresent=activeBody.renderable>0,sceneBodyVisibleFlag=Boolean(activeRoot&&activeRoot.visible!==false),bodyVisible=Boolean(activeRoot&&activeRoot.visible!==false&&nodeVisibleThroughParents(activeRoot)&&activeBody.visibleRenderable>0&&activeBody.materialVisible>0),primitiveBodyVisible=Boolean(P.body&&P.body.visible!==false&&nodeVisibleThroughParents(P.body)&&primitiveBody.visibleRenderable>0&&primitiveBody.materialVisible>0),bodyParts={torso:bodyPartSnapshot(P.bodyParts?.torso),head:bodyPartSnapshot(P.bodyParts?.head),limbs:bodyPartSnapshot(P.bodyParts?.limbs),weapon:bodyPartSnapshot(P.bodyParts?.weapon)},screenBodyFootprint=projectBodyScreenFootprint(activeRoot,st.camera,st.renderer?.domElement,optimizedBounds),bounds=activeRoot?(optimizedBounds?setFpsBoundsFromUpdatedObject(activeRoot):new THREE.Box3().setFromObject(activeRoot)):new THREE.Box3();
    const sphere=bounds.isEmpty()?null:bounds.getBoundingSphere(new THREE.Sphere()),inCameraFrustum=Boolean(sphere&&frustum.intersectsSphere(sphere));
    const projected=worldPosition.clone().project(st.camera);
    const inCameraViewport=allFinite([projected.x,projected.y,projected.z])&&projected.x>=-1&&projected.x<=1&&projected.y>=-1&&projected.y<=1&&projected.z>=-1&&projected.z<=1;
    const occludedByWall=Boolean(st.wallRects?.some((rect)=>segHitsRect(st.camera.position.x,st.camera.position.z,worldPosition.x,worldPosition.z,rect)));
    const bodyTransform=nodeTransformSnapshot(activeRoot,optimizedBounds?bounds:null),primitiveTransform=nodeTransformSnapshot(P.body,optimizedBounds?setFpsBoundsFromUpdatedObject(P.body):null),matrixFinite=allFinite(P.g.matrixWorld.elements),transform={
      position:{x:P.g.position.x,y:P.g.position.y,z:P.g.position.z},rotation:{x:P.g.rotation.x,y:P.g.rotation.y,z:P.g.rotation.z},
      scale:{x:P.g.scale.x,y:P.g.scale.y,z:P.g.scale.z},
    };
    const identityMiss=Boolean(P.identityMiss||!authoritative);
    const resolved=resolveFpsPresentationVisibility({entityExists:true,identityMiss,rootVisible:P.g.visible!==false,parentVisible:nodeVisibleThroughParents(P.g),sceneVisible,playerGroupVisible,primitiveBodyVisible,riggedRootVisible:P.rigged?.root?.visible===true,riggedActive,presentationPending:P.rigged?.mode==="loading"&&!primitiveBodyAllowed(st,P),transform});
    return {
      id:P.id,team:authoritative?.side||P.side,authoritativePresent:Boolean(authoritative),authoritativeAlive:authoritative?!authoritative.dead:null,
      framePosition:authoritative?.pos?{x:authoritative.pos.x,y:authoritative.pos.y}:null,entityExists:true,entityType:riggedActive?"rigged":"primitive",
      rootVisible:P.g.visible!==false,parentVisible:nodeVisibleThroughParents(P.g),bodyVisible,sceneBodyPresent,sceneBodyVisibleFlag,screenBodyReadable:screenBodyFootprint.readable,screenBodyFootprint,bodyTransform,primitiveTransform,bodyTransformFinite:bodyTransform.matrixFinite&&bodyTransform.boundsFinite,bodyFacingDegrees:authoritative?.va??null,bodyRenderable:activeBody.renderable>0,primitiveBodyVisible,primitiveBodyRenderable:primitiveBody.renderable>0,bodyRenderableCount:activeBody.renderable,visibleBodyRenderableCount:activeBody.visibleRenderable,bodyMaterialVisible:activeBody.materialVisible>0,bodyParts,riggedRootVisible:P.rigged?.root?.visible===true,
      presentationVisible:resolved.presentationVisible,visibilityReason:resolved.reason,povSelfHidden:Boolean(P.povSelfHidden),identityMiss,scale:transform.scale,worldPosition:{x:worldPosition.x,y:worldPosition.y,z:worldPosition.z},
      transformFinite:matrixFinite&&resolved.transformOk&&allFinite([worldPosition.x,worldPosition.y,worldPosition.z]),matrixWorldFinite:matrixFinite,
      frustumCulled:activeBody.frustumCulled,inCameraFrustum,inCameraViewport,screenNdc:{x:projected.x,y:projected.y,z:projected.z},occludedByWall,
      renderableCount:activeBody.renderable,visibleRenderableCount:activeBody.visibleRenderable,materialVisible:activeBody.materialVisible>0,materialOpacity:{min:activeBody.minOpacity,max:activeBody.maxOpacity},
      deathPresentation:Boolean(authoritative?.dead),animationState:null,fallbackMode:"primitive",riggedActive,occlusion:{mode:"wall-fade-only",wallFadeActive:Boolean(st.fadeWalls?.some((wall)=>wall.cur<0.99)),playerFadeApplied:false},
    };
  });
  const teams=summarizeFpsTeamVisibility(players),check=checkFpsRuntimeVisibility({players,requireCameraViewport:true});
  const markers={production:!FPS_DEBUG_ENABLED,objectiveSiteCount:Number(st.objectiveSiteCount||0),mapCalloutsVisible:Number(st.calloutSprites?.filter(sprite=>sprite.visible).length||0),routeHelpersVisible:Number(st.routeGroup?.children?.length||0),selectedGroundHelpers:st.players.filter(P=>P.g.visible!==false&&(P.ring?.visible||P.disc?.visible)).length,selectionBeams:st.players.filter(P=>P.g.visible!==false&&P.selBeam?.visible).length,aimHelpers:st.players.filter(P=>P.g.visible!==false&&P.aimLine?.visible).length,utilityEffectMarkers:Number(st.utilityFxEvidence?.visibleMarkers||0)};
  return {frameIndex,round:frame?.rnd??null,identity:st.identity||null,scene:{visible:sceneVisible,playerGroupVisible},camera:{position:{x:st.camera.position.x,y:st.camera.position.y,z:st.camera.position.z},near:st.camera.near,far:st.camera.far,recoveryCount:st.cameraRecoveryCount||0,mode:st.liveRef?.current?.cameraMode||null,selected:st.liveRef?.current?.selected||null,autoFollow:Boolean(st.cam?.autoFollow),viewPreset:st.cam?.viewPreset||null,directorTarget:st.cam?._directorTelemetry||null},povWeapon:st.povWeaponDiagnostics||null,markers,teams,check,players};
}
function publishFpsVisibilityDiagnostics(st,frame,frameIndex){
  if(!import.meta.env?.DEV||typeof document==="undefined")return;
  const snapshot=buildFpsVisibilitySnapshot(st,frame,frameIndex);st.visibilitySnapshot=snapshot;
  if(typeof window!=="undefined")window.__ESMO_FPS_SCENE__=st;
  const canvas=st.renderer.domElement;canvas.dataset.esmoFpsVisibility=snapshot.check.ok?"ok":"violation";
  canvas.dataset.esmoFpsBlueAuthoritative=String(snapshot.teams.blue.authoritative);canvas.dataset.esmoFpsBlueEntities=String(snapshot.teams.blue.entities);canvas.dataset.esmoFpsBlueVisible=String(snapshot.teams.blue.visiblePresentation);canvas.dataset.esmoFpsBlueBody=String(snapshot.teams.blue.visibleBodies);canvas.dataset.esmoFpsBlueAlive=String(snapshot.teams.blue.alive);
  canvas.dataset.esmoFpsBlueSceneBodies=String(snapshot.teams.blue.sceneBodies);canvas.dataset.esmoFpsBlueReadableBodies=String(snapshot.teams.blue.readableBodies);
  canvas.dataset.esmoFpsRedAuthoritative=String(snapshot.teams.red.authoritative);canvas.dataset.esmoFpsRedEntities=String(snapshot.teams.red.entities);canvas.dataset.esmoFpsRedVisible=String(snapshot.teams.red.visiblePresentation);canvas.dataset.esmoFpsRedBody=String(snapshot.teams.red.visibleBodies);canvas.dataset.esmoFpsRedAlive=String(snapshot.teams.red.alive);
  canvas.dataset.esmoFpsRedSceneBodies=String(snapshot.teams.red.sceneBodies);canvas.dataset.esmoFpsRedReadableBodies=String(snapshot.teams.red.readableBodies);
  canvas.dataset.esmoFpsVisibilityFrame=String(frameIndex);canvas.dataset.esmoFpsVisibilityJson=JSON.stringify(snapshot);
  if(typeof window!=="undefined")window.__ESMO_FPS_VISIBILITY__=snapshot;
}
function updateDynamic(st,frame,nf,pf,sub,live,W,dt=0,frameIndex=null,playbackDeltaSec=dt){
  const time=st.time;const showLabels=live.showLabels!==false;
  // 地名顯隱
  if(st.calloutSprites)st.calloutSprites.forEach(s=>{s.visible=Boolean(FPS_DEBUG_ENABLED&&showLabels);});

  // 選手
  const fmap={};frame.players.forEach(p=>fmap[p.id]=p);
  const nmap={};(nf?nf.players:[]).forEach(p=>nmap[p.id]=p);
  const pmap={};(pf?pf.players:[]).forEach(p=>pmap[p.id]=p);
  const identity=checkFpsRendererIdentity({
    framePlayers:frame.players,
    rendererEntities:st.players.map(P=>({id:P.id,side:P.side})),
  });
  st.identity=identity;
  if(!identity.ok&&st.identityDiagnosticKey!==JSON.stringify(identity.missingRenderer)+JSON.stringify(identity.missingFrame)){
    st.identityDiagnosticKey=JSON.stringify(identity.missingRenderer)+JSON.stringify(identity.missingFrame);
    if(import.meta.env?.DEV)console.warn("[FPS] renderer identity contract violation",identity);
  }
  st.players.forEach(P=>{
    const p=fmap[P.id];
    if(!p){
      // Identity miss is not authoritative death. Keep the last presentation
      // state visible as a recoverable diagnostic instead of silently hiding it.
      P.identityMiss=true;P.povSelfHidden=false;P.g.userData.identityMiss=true;P.g.visible=true;
      P.body.visible=primitiveBodyAllowed(st,P);P.disc.visible=false;P.ring.visible=false;P.deadMat.opacity=0;P.selBeam.visible=false;
      P.nameSpr.visible=showLabels;
      P.rigged?.setIdentityMiss?.();
      return;
    }
    P.identityMiss=false;P.g.userData.identityMiss=false;
    const povSelfHidden=Boolean(live.cameraMode==="pov"&&live.selected===P.id&&!p.dead);
    P.povSelfHidden=povSelfHidden;P.g.visible=!povSelfHidden;
    const pp=pmap[P.id];
    const np=nmap[P.id];const sameRound=nf&&frame&&nf.rnd===frame.rnd;
    let x=p.pos.x,y=p.pos.y,va=p.va;
    if(np&&sameRound&&!p.dead&&!np.dead){x=lerp(p.pos.x,np.pos.x,sub);y=lerp(p.pos.y,np.pos.y,sub);va=lerpAngle(p.va,np.va,sub);}
    const elevation=np&&sameRound?lerp(p.elevation||0,np.elevation||0,sub):(p.elevation||0);
    P.g.position.set(W.vx(x),elevation,W.vz(y));
    st.c5a1AuthoritativeDriftMax=Math.max(st.c5a1AuthoritativeDriftMax,Math.hypot(P.g.position.x-W.vx(x),P.g.position.z-W.vz(y)));
    const outgoingSec=sameRound?Number(nf.roundSec)-Number(frame.roundSec):0;
    const presentationVelocity=np&&sameRound&&!p.dead&&!np.dead&&outgoingSec>0?{x:(np.pos.x-p.pos.x)/outgoingSec,y:(np.pos.y-p.pos.y)/outgoingSec}:{x:0,y:0};
    P.rigged?.setFacingDegrees?.(va);
    P.rigged?.update?.({sampleGroundHeight:st.sampleGroundHeight,events:frame.events,nextEvents:sameRound?nf?.events:[],defuse:frame.defuse,player:p,previousPlayer:pp,nextPlayer:np,frameRound:frame.rnd,previousFrameRound:pf?.rnd,frameIndex,dt,playbackDeltaSec,playbackSpeed:live.speed,presentationVelocity:st.sceneVersion!=="legacy"?presentationVelocity:undefined,playbackActive:Boolean(live.playing),seekNonce:live.seekNonce,roundTimeMs:(frame.roundSec+(sameRound?sub*C5A2_SIM_STEP_SEC:0))*1000});
    if(P.rigged){st.c5a1HitDriftMax=Math.max(st.c5a1HitDriftMax,P.rigged.maxHitPositionDrift||0);st.c5a1HitDriftSamples=st.players.reduce((sum,player)=>sum+(player.rigged?.hitPositionDriftSamples||0),0);}
    const riggedActive=P.rigged?.mode==="rigged";
    const riggedMode=P.rigged?.mode||"fallback";
    P.body.visible=primitiveBodyAllowed(st,P);
    // Primitive characters keep a fixed world-space size. The P0 overview
    // camera can legitimately move farther out to protect whole-team framing,
    // which made the fallback silhouette unreadably small while labels/rings
    // remained distance-scaled overlays. This is presentation-only scaling;
    // it does not affect simulation positions, collision, or identity.
    const primitiveReadabilityScale=!riggedActive&&st.cam.overview
      ?clamp(st.camera.position.distanceTo(P.g.position)/44,1,3.0):1;
    P.body.scale.setScalar(primitiveReadabilityScale);
    // Keep billboard overlays above the enlarged fallback silhouette. Their
    // original fixed heights were correct at scale 1, but overlapped the
    // torso/head once overview readability scaling was enabled.
    P.hpGroup.position.y=2.8*primitiveReadabilityScale;
    P.nameSpr.position.y=3.4*primitiveReadabilityScale;
    // The fallback character is a spectator presentation, not a gameplay
    // collider. In the overview camera, blockout roofs/props can occlude an
    // otherwise valid player body while its ring/label remains visible. Only
    // the actually occluded primitive body gets a reversible depth override;
    // rigged characters and non-occluded/manual views keep normal depth.
    const primitiveOccludedByWall=Boolean(!riggedActive&&st.cam.overview&&st.wallRects?.some((rect)=>segHitsRect(st.camera.position.x,st.camera.position.z,P.g.position.x,P.g.position.z,rect)));
    const primitiveDepthMode=primitiveOccludedByWall?"spectator-readable":"world-depth";
    const desiredPlayerGroupOrder=st.cam.overview?100:0;
    if(st.playerGroup.renderOrder!==desiredPlayerGroupOrder)st.playerGroup.renderOrder=desiredPlayerGroupOrder;
    if(P._primitiveDepthMode!==primitiveDepthMode){
      P._primitiveDepthMode=primitiveDepthMode;
      P.body.traverse((object)=>{
        if(!object.isMesh)return;
        object.renderOrder=primitiveOccludedByWall?100:0;
        const materials=Array.isArray(object.material)?object.material:[object.material];
        materials.filter(Boolean).forEach((material)=>{material.depthTest=!primitiveOccludedByWall;material.depthWrite=true;});
      });
      const overlayMaterials=[P.nameSpr?.material,...(P.hpGroup?.children||[]).flatMap((child)=>Array.isArray(child.material)?child.material:[child.material])].filter(Boolean);
      overlayMaterials.forEach((material)=>{material.depthTest=primitiveOccludedByWall;material.depthWrite=false;});
    }
    P.rigged?.setFacingDegrees?.(va);
    const sel=live.selected===P.id;
    if(p.dead){
      P.body.visible=primitiveBodyAllowed(st,P);P.bombBag.visible=false;P.hpGroup.visible=false;P.nameSpr.visible=false;P.selBeam.visible=false;
      P.deadMat.opacity=0.8;P.ringMat.opacity=0.0;P.ring.visible=false;P.disc.visible=false;
      P.dead.scale.setScalar(clamp(st.cam.radius/55,0.85,2.0)); // 死亡地面 X，遠看清楚
    }else{
      P.body.visible=primitiveBodyAllowed(st,P);P.disc.visible=Boolean(FPS_DEBUG_ENABLED);P.deadMat.opacity=0;
      // 轉向（+X 對齊視角方向）
      P.body.rotation.y=-va*Math.PI/180;
      // 移動/掃視微動（呼吸感）
      const moving=p.state==="ROTATE"||p.state==="EXECUTE";
      // Use a hash-derived phase: legal short IDs such as "t1" have no
      // character at index 2, and charCodeAt(2) would poison the body matrix.
      const motionSeed=hsh(P.id)%997;
      const bob=Math.sin(time*(moving?9:3)+motionSeed)*0.025*(moving?1.4:0.6);
      // 架槍：靜止持槍狀態下身體微蹲、視線光束顯現（看得出在架住角度）
      const aiming=p.state==="架槍"||p.state==="ENGAGE"||(!moving&&p.state==="HOLD");
      P.body.position.y=bob-(aiming?0.12:0);
      if(P.aimMat){const fire=p.shooting>0;P.aimMat.opacity=FPS_DEBUG_ENABLED&&aiming?(fire?0.85:0.34+0.12*Math.sin(time*6+motionSeed)):0;P.aimLine.visible=Boolean(FPS_DEBUG_ENABLED&&aiming);}
      // 血量 → 環/身體色 + 血條
      const hpR=clamp(p.hp/100,0,1);
      // A ground indicator is useful only for the selected operator. The old
      // all-player rings read as unexplained navigation/range markers on a
      // phone-sized battlefield.
      P.ring.visible=Boolean(FPS_DEBUG_ENABLED&&sel);P.disc.visible=Boolean(FPS_DEBUG_ENABLED&&sel);
      P.ringMat.color.setHex(0xfde68a);P.ringMat.opacity=FPS_DEBUG_ENABLED&&sel?0.92:0;
      P.hpGroup.visible=true;P.nameSpr.visible=showLabels;
      P.hpGroup.quaternion.copy(st.camera.quaternion); // billboard 面向相機
      const dCam=st.camera.position.distanceTo(P.g.position); // 依與相機距離維持固定螢幕大小
      // 受擊掉血：偵測血量下降 → 白條閃 + 身體泛紅 + 血條彈一下
      if(P._prevHp==null)P._prevHp=p.hp;
      if(p.hp<P._prevHp-0.5)P._dmg=1;P._prevHp=p.hp;
      const dmg=P._dmg||0;
      const fallbackOverlayScale=riggedActive?0.45:0.35;
      P.hpGroup.scale.setScalar(clamp(dCam/26,1.0,4.2)*(1+0.4*dmg)*fallbackOverlayScale); // 近看也夠大、遠看放大
      if(P.nameSpr.userData.base){const ns=clamp(dCam/46,0.5,3.2)*fallbackOverlayScale,b=P.nameSpr.userData.base;P.nameSpr.scale.set(b.x*ns,b.y*ns,1);} // 名牌不再近看爆大
      P.hpFill.scale.x=Math.max(0.02,hpR);P.hpFill.position.x=-(1.3*(1-hpR))/2;
      P.hpFill.material.color.setHex(dmg>0.12?0xffffff:(hpR>0.5?0x34d399:hpR>0.25?0xfbbf24:0xf87171));
      if(!P._emBase&&P.torsoMat.emissive)P._emBase=P.torsoMat.emissive.clone();
      if(P.torsoMat.emissive){if(dmg>0.12){P.torsoMat.emissive.setRGB(0.95*dmg,0.04,0.04);P.torsoMat.emissiveIntensity=0.95;}
        else{P._emBase&&P.torsoMat.emissive.copy(P._emBase);P.torsoMat.emissiveIntensity=p.shooting>0?0.6:0.18;}}
      P._dmg=Math.max(0,dmg-0.06);
      // 持包/接管 環脈動
      // Carrier presentation is driven only by the authoritative hasBomb bit;
      // it must not leak into a second ground-marker state.
      P.bombBag.visible=Boolean(p.hasBomb);
      // 選中：放大環 + 光柱
      P.selBeam.visible=Boolean(FPS_DEBUG_ENABLED&&sel);P.beamMat.opacity=FPS_DEBUG_ENABLED&&sel?(0.25+0.15*Math.sin(time*4)):0;
      P.ring.scale.setScalar(sel?1.35:1);
    }
    // Re-assert the POV contract after primitive / rigged presentation updates;
    // no later branch may make the selected body visible through the camera.
    P.g.visible=!povSelfHidden;
  });

  // 特效池工具
  const usePool=(arr)=>{let i=0;return{next:()=>arr[i++],done:()=>{for(;i<arr.length;i++)arr[i].visible=false;}};};

  // 曳光彈：快速竄出的子彈光條（自槍口高速射出並衝出畫面）+ 彈著火花
  if(!st.c5aGunplayFx){const it=usePool(st.pools.tracer);const sp=usePool(st.pools.spark);
   (frame.tracers||[]).forEach(tr=>{const m=it.next();if(!m)return;
     _vA.set(W.vx(tr.from.x),0.95,W.vz(tr.from.y));_vB.set(W.vx(tr.to.x),0.95,W.vz(tr.to.y));
     const len=_vA.distanceTo(_vB);if(len<0.1){m.visible=false;return;}
     _dir.copy(_vB).sub(_vA).normalize();_q.setFromUnitVectors(_xAxis,_dir);
     const mdx=tr.to.x-tr.from.x,mdy=tr.to.y-tr.from.y,mlen=Math.hypot(mdx,mdy)||1; // 地圖座標與世界 X/Z 為 1:1
     const cap=Math.min(mlen*2.4,95);
     const pathLen=st.mapWalls?Math.min(rayWallDist(tr.from.x,tr.from.y,mdx/mlen,mdy/mlen,st.mapWalls,cap),cap):cap; // 子彈到牆面即止，不穿建築
     const hash=((parseInt((tr.id||"0").replace(/\D/g,"").slice(-5)||"1",10))%101)/101;
     const streak=Math.min(pathLen*0.42,15);                   // 光條長度（細而快的單一彈道）
     const s=((time*3.4+hash)%1)*(pathLen+streak);             // 沿路徑高速前進（更快）
     const head=clamp(s,0,pathLen),tail=clamp(s-streak,0,pathLen),segLen=head-tail;
     if(segLen<1.2){m.visible=false;return;}
     m.position.copy(_dir).multiplyScalar((head+tail)/2).add(_vA);m.quaternion.copy(_q);
     const th=tr.hit?0.12:0.08;m.scale.set(segLen,th,th);
     m.material.color.set(tr.color);m.material.opacity=tr.hit?1.0:0.82;m.visible=true;
     if(tr.hit){const k=sp.next();if(k){k.position.set(W.vx(tr.to.x),1.0,W.vz(tr.to.y));const pf=0.5+0.5*Math.sin(time*38+hash*9);k.scale.setScalar(1.1+0.8*pf);k.material.opacity=0.5+0.45*pf;k.visible=true;}}
   });it.done();sp.done();}

  // 槍口閃光（sprite + 循環點光）
  if(!st.c5aGunplayFx){const it=usePool(st.pools.muzzle);let lit=0;
   (frame.muzzles||[]).forEach(mz=>{const s=it.next();if(!s)return;
     s.position.set(W.vx(mz.pos.x),0.95,W.vz(mz.pos.y));
     // One authoritative muzzle event can be presented for several render
     // frames. Randomising every render frame made the sprite and point light
     // intensity jump independently, which appeared as periodic mobile
     // flicker. Derive a stable variation from the event identity instead.
     const muzzleSeed=(hsh(mz.id||`${mz.side}:${mz.pos.x}:${mz.pos.y}`)%1000)/1000;
     const sc=(mz.big?1.7:1.0)*(0.95+0.2*muzzleSeed);s.scale.set(sc,sc,1);
     s.material.opacity=0.9*(0.82+0.14*muzzleSeed);s.material.color.setHex(mz.side==="ct"?0xbfe6ff:0xffd9a0);s.visible=true;
     if(lit<st.flashLights.length){const L=st.flashLights[lit++];L.position.set(W.vx(mz.pos.x),1.2,W.vz(mz.pos.y));L.intensity=3.5*(0.88+0.18*muzzleSeed);L.visible=true;}
   });it.done();
   for(let k=lit;k<st.flashLights.length;k++)st.flashLights[k].visible=false;}

  if(st.c5aGunplayFx){
    st.c5aFxEvidence=st.c5aGunplayFx.update({frame,previousFrame:pf,time,W,frameIndex,sub,resolveMuzzle:st.resolveWeaponMuzzle,resolveMuzzleDirection:st.resolveWeaponMuzzleDirection});
  }

  if(st.utilityFx){
    st.utilityFxEvidence=st.utilityFx.update({frame,nextFrame:nf,time,W,frameIndex,sub});
  }

  // 掉落武器
  {const it=usePool(st.pools.drop);
   (frame.droppedGuns||[]).forEach(g=>{const m=it.next();if(!m)return;m.position.set(W.vx(g.pos.x),0.25+Math.sin(time*3)*0.05,W.vz(g.pos.y));m.rotation.y=time*0.8;m.visible=true;});it.done();}

  // 炸彈信標
  if(st.bomb){const B=st.bomb;
    if(frame.planted&&frame.c4pos){B.grp.visible=true;B.grp.position.set(W.vx(frame.c4pos.x),st.sceneVersion==="legacy"?0:fpsMajorElevation(st.mapKey,frame.c4pos),W.vz(frame.c4pos.y));
      const blink=0.5+0.5*Math.abs(Math.sin(time*(frame.c4t&&frame.c4t<5?12:5)));
      B.mat.emissiveIntensity=0.6+blink*1.4;B.label.material.opacity=0.82+blink*0.18;if(B.light)B.light.intensity=blink*4;
    }else if(frame.droppedBomb){B.grp.visible=true;B.grp.position.set(W.vx(frame.droppedBomb.pos.x),st.sceneVersion==="legacy"?0:fpsMajorElevation(st.mapKey,frame.droppedBomb.pos),W.vz(frame.droppedBomb.pos.y));
      B.mat.emissiveIntensity=0.5+0.4*Math.abs(Math.sin(time*4));B.label.material.opacity=0.94;if(B.light)B.light.intensity=1.2;
    }else B.grp.visible=false;
  }

  // 追焦資料：擷取被選中選手的內插位置與視角 + 最近敵人（供戰鬥感 chase 相機）
  const selId=live.selected;
  if(selId){const a=frame.players.find(p=>p.id===selId);const b=nf?.players.find(p=>p.id===selId);
    if(a){const interpolate=b&&(st.sceneVersion==="legacy"||(nf?.rnd===frame.rnd&&!a.dead&&!b.dead)),px=interpolate?lerp(a.pos.x,b.pos.x,sub):a.pos.x,py=interpolate?lerp(a.pos.y,b.pos.y,sub):a.pos.y,povVa=st.sceneVersion!=="legacy"&&interpolate?lerpAngle(a.va,b.va,sub):a.va;
      let ne=null,nd=1e9;for(const e of frame.players){if(e.dead||e.side===a.side)continue;const d=Math.hypot(e.pos.x-px,e.pos.y-py);if(d<nd){nd=d;ne=e;}}
      st._chase={id:a.id,x:px,y:py,elevation:st.sceneVersion==="legacy"?0:fpsMajorElevation(st.mapKey,{x:px,y:py}),va:povVa,gun:a.gun,alive:!a.dead,side:a.side,state:a.state,shooting:a.shooting>0,shootingValue:a.shooting||0,shootingFamily:c5a1WeaponFamily(a.gun),enemy:ne&&nd<55?{x:ne.pos.x,y:ne.pos.y,d:nd}:null};}else st._chase=null;}
  else st._chase=null;

  // 路線疊加（顯示全部路線 或 僅高亮選中選手）
  const rg=st.routeGroup;
  // Navigation helpers are development-only. Selection uses the restrained
  // player ring/beam above and does not expose route geometry in production.
  const needRoutes=Boolean(FPS_DEBUG_ENABLED&&live.showRoutes);
  while(rg.children.length){const c=rg.children.pop();c.geometry?.dispose?.();c.material?.dispose?.();}
  if(needRoutes){
    frame.players.forEach(p=>{if(p.dead)return;const isSel=p.id===selId;if(!live.showRoutes&&!isSel)return;
      const pts=(p.route||[]).slice(p.routeIdx);
      const v=[new THREE.Vector3(W.vx(p.pos.x),0.18,W.vz(p.pos.y))];pts.slice(1).forEach(q=>v.push(new THREE.Vector3(W.vx(q.x),0.18,W.vz(q.y))));
      if(v.length>=2){const base=p.side==="ct"?0x38bdf8:0xfb923c;
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(v),new THREE.LineBasicMaterial({color:isSel?0xfde047:base,transparent:true,opacity:isSel?0.95:0.3}));rg.add(line);
        if(isSel){v.forEach((pt,idx)=>{const last=idx===v.length-1;const dot=new THREE.Mesh(new THREE.SphereGeometry(last?0.75:0.42,10,8),new THREE.MeshBasicMaterial({color:last?0xfca5a5:0xfde047,transparent:true,opacity:0.92}));dot.position.set(pt.x,0.32,pt.z);rg.add(dot);});}}
    });
  }
}

// ── 相機更新：選中→過肩追焦；否則自動導播（取激戰/對槍最佳角度，並閃避建物遮擋）──
function camBlocked(rects,tgt,radius,phi,theta){
  const sx=radius*Math.sin(phi)*Math.sin(theta)+tgt.x;
  const sz=radius*Math.sin(phi)*Math.cos(theta)+tgt.z;
  for(const r of rects){if(segHitsRect(sx,sz,tgt.x,tgt.z,r))return true;}return false;
}
function inspectAliveCameraViewport(st,frame,W){
  const alive=(frame?.players||[]).filter((player)=>!player.dead);
  return evaluateFpsCameraRecovery(alive.map((player)=>{
    const point=new THREE.Vector3(W.vx(player.pos.x),0,W.vz(player.pos.y)).project(st.camera);
    const inCameraViewport=allFinite([point.x,point.y,point.z])&&point.x>=-1&&point.x<=1&&point.y>=-1&&point.y<=1&&point.z>=-1&&point.z<=1;
    return {id:player.id,side:player.side,alive:true,inCameraViewport};
  }));
}
function allAliveOutsideCameraViewport(st,frame,W){
  return inspectAliveCameraViewport(st,frame,W).shouldRecover;
}
function layoutFpsWorldLabels(st,frame,live){
  if(st.sceneVersion==="legacy"||live.showLabels===false)return;
  const canvas=st.renderer.domElement,w=canvas.clientWidth,h=canvas.clientHeight;
  const point=st._labelProjection||(st._labelProjection=new THREE.Vector3()),rects=[];
  const shooting=new Set((frame.muzzles||[]).map(e=>e.attackerId));
  const actors=st.players.filter(P=>P.g.visible&&P.nameSpr.visible).map(P=>{
    const p=frame.players.find(a=>a.id===P.id);
    return{P,priority:(live.selected===P.id?100:0)+(shooting.has(P.id)?20:0)+(p?.hasBomb?10:0)};
  }).sort((a,b)=>b.priority-a.priority||a.P.id.localeCompare(b.P.id));
  st.camera.updateMatrixWorld();
  for(const {P} of actors){
    point.copy(P.g.position);point.y+=P.nameSpr.position.y;point.project(st.camera);
    const x=(point.x+1)*w*.5,y=(1-point.y)*h*.5;
    const distance=Math.max(1,st.camera.position.distanceTo(P.g.position));
    const labelWidth=Math.max(28,P.nameSpr.scale.x*h/(2*distance*Math.tan(st.camera.fov*Math.PI/360)));
    const rect={left:x-labelWidth*.5,right:x+labelWidth*.5,top:y-8,bottom:y+8};
    const clipped=point.z<-1||point.z>1||rect.left<6||rect.right>w-6||rect.top<6||rect.bottom>h-6;
    const overlaps=rects.some(r=>rect.left<r.right+3&&rect.right>r.left-3&&rect.top<r.bottom+3&&rect.bottom>r.top-3);
    P.nameSpr.visible=!clipped&&!overlaps;
    if(P.nameSpr.visible)rects.push(rect);
  }
}
function snapOverviewToAlive(st,frame,W){
  const alive=(frame?.players||[]).filter((player)=>!player.dead);if(!alive.length)return;
  const cx=alive.reduce((sum,player)=>sum+player.pos.x,0)/alive.length,cy=alive.reduce((sum,player)=>sum+player.pos.y,0)/alive.length;
  const wcx=W.vx(cx),wcz=W.vz(cy);let maxd=0;
  alive.forEach((player)=>{maxd=Math.max(maxd,Math.hypot(W.vx(player.pos.x)-wcx,W.vz(player.pos.y)-wcz));});
  const cam=st.cam;cam.autoFollow=true;cam.overview=true;cam.viewPreset=null;cam.manualRadius=null;cam.dTgt.set(wcx,3,wcz);cam.dRadius=clamp(maxd*2.1+48,78,160);cam.dPhi=0.82;
  if(cam._ovBase==null)cam._ovBase=cam.dTheta;cam.dTheta=cam._ovBase;cam.tgt.copy(cam.dTgt);cam.radius=cam.dRadius;cam.phi=cam.dPhi;cam.theta=cam.dTheta;
  _vA.setFromSphericalCoords(cam.radius,cam.phi,cam.theta).add(cam.tgt);st.camera.position.copy(_vA);st.camera.lookAt(cam.tgt);st.camera.updateMatrixWorld();
}
function updateCamera(st,frame,sub,dt,W,cameraMode="tactical"){
  const cam=st.cam;const ch=st._chase;const rects=st.wallRects||[];
  const chasing=ch&&ch.alive;
  const pov=Boolean(chasing&&cameraMode==="pov");
  // A 100m map needs depth precision at the overview distance. Keep the
  // close weapon plane in POV and preserve the Legacy projection.
  const desiredNear=pov?0.18:st.sceneVersion==="legacy"?0.1:1;
  if(st.camera.near!==desiredNear){st.camera.near=desiredNear;st.camera.updateProjectionMatrix();}
  // 取消選取（按 ✕ 或點空白）時，凍結在目前的對戰視角，不跳回大視角
  if(st._wasChasing&&!chasing&&!cam.overview){cam.autoFollow=false;cam.dTheta=cam.theta;cam.dPhi=cam.phi;cam.dRadius=cam.radius;cam.dTgt.copy(cam.tgt);}
  if(!st._wasChasing&&chasing){cam.chaseYaw=0;cam.chasePitch=0;cam.manualRadius=null;} // 新選取 → 回到過肩預設
  if(st._chaseId!==ch?.id&&chasing){cam.chaseYaw=0;cam.chasePitch=0;cam.manualRadius=null;cam.povFov=st.sceneVersion==="legacy"?42:72;cam.povPosition.set(0,0,0);cam.povLookAt.set(0,0,0);}
  st._chaseId=ch?.id||null;
  st._wasChasing=chasing;
  if(chasing){
    // 戰鬥中朝最近敵人方向，否則朝選手面向；目標前移看向下槍線（看得更遠）；可單指環繞
    const faceDeg=ch.enemy?Math.atan2(ch.enemy.y-ch.y,ch.enemy.x-ch.x)*180/Math.PI:ch.va;
    const va=faceDeg*Math.PI/180;
    cam.dTheta=Math.atan2(-Math.cos(va),-Math.sin(va))+(cam.chaseYaw||0);
    const close=ch.enemy&&ch.enemy.d<24;
    cam.dPhi=clamp((close?1.16:1.10)+(cam.chasePitch||0),0.2,1.45);
    // Player selection is spectator focus, not a face-mounted POV. Keep a
    // readable operator-sized shot with enough shoulder/world context; the
    // explicit POV control below is the only path to eye-level camera.
    cam.dRadius=cam.manualRadius??(close?14:18);
    const fwd=fpsChaseForwardOffset({sceneVersion:st.sceneVersion,manualRadius:cam.manualRadius,close});
    cam.dTgt.set(W.vx(ch.x+Math.cos(va)*fwd),(ch.elevation||0)+1.08,W.vz(ch.y+Math.sin(va)*fwd));
  }else if(cam.autoFollow&&frame){
    const alive=frame.players.filter(p=>!p.dead);
    const director=st.matchPresentationDirector;
    const hotspotCandidate=resolveFpsCombatHotspot(frame,director);
    if(st.sceneVersion!=="legacy"&&hotspotCandidate?.kind==="objective-carrier"&&alive.length){
      // 開局沒有交戰時展示兩隊部署，不追持包者而把另一隊整隊丟到畫外。
      hotspotCandidate.x=alive.reduce((s,p)=>s+p.pos.x,0)/alive.length;
      hotspotCandidate.y=alive.reduce((s,p)=>s+p.pos.y,0)/alive.length;
      hotspotCandidate.kind="deployment-centroid";hotspotCandidate.key="deployment-centroid";
    }
    const hotspot=updateFpsCombatHotspot(cam,hotspotCandidate,dt,Number(frame.ts??frame.roundSec??0));
    if(cam.viewPreset==="overview"){
      // 玩家指定的全場總覽固定在地圖；自動導播／其他 preset 才追交戰熱點。
      const preset=FPS_CAMERA_PRESETS.overview;
      cam.dTgt.set(0,2.8,0);cam.dRadius=Math.max(185,185/Math.max(.5,st.camera.aspect));cam.dPhi=preset.phi;cam.dTheta=preset.theta;
      cam._directorTelemetry={kind:"map-overview",source:"player-camera-preset"};
    }else if((cam.viewPreset&&FPS_CAMERA_PRESETS[cam.viewPreset])||hotspot){
      const preset=cam.viewPreset?FPS_CAMERA_PRESETS[cam.viewPreset]:null;
      let fittedCombat=null;
      if(preset){
        // Preset is a composition style. Never replace its target with a map
        // center; the target below remains owned by combat/objective evidence.
        cam.dRadius=preset.radius;cam.dPhi=preset.phi;cam.dTheta=preset.theta;
      }else if(st.sceneVersion!=="legacy"&&hotspot&&alive.length){
        // 自動導播框住真實熱點附近角色；不以全員跨度配熱點中心造成半幅空白。
        const focused=alive.filter(p=>Math.hypot(p.pos.x-hotspot.x,p.pos.y-hotspot.y)<=30);
        const hasBothSides=focused.some(p=>p.side==='t')&&focused.some(p=>p.side==='ct');
        const actors=hasBothSides?focused:alive;
        if(cam._ovBase==null)cam._ovBase=cam.dTheta;cam.dTheta=cam._ovBase;
        const bombAnchor=frame.planted&&finiteFpsPoint(frame.c4pos)?{x:W.vx(frame.c4pos.x),z:W.vz(frame.c4pos.y),elevation:fpsMajorElevation(st.mapKey,frame.c4pos)}:null;
        const objectiveView=String(hotspot.kind||"").includes("objective")||String(hotspot.kind||"").includes("bomb")||String(director?.kind||"").includes("bomb")||director?.kind==="defuse-start";
        fittedCombat=fitFpsCombatCamera({points:actors.map(p=>({x:W.vx(p.pos.x),z:W.vz(p.pos.y),elevation:p.elevation||0})),focus:{x:W.vx(hotspot.x),z:W.vz(hotspot.y)},objective:bombAnchor,targetY:objectiveView?3.8:3,aspect:st.camera.aspect,theta:cam.dTheta,phi:.86});
        cam.dRadius=lerp(cam.dRadius,fittedCombat.radius,.08);cam.dPhi=lerp(cam.dPhi,.86,.06);
      }else if(cam.overview&&alive.length){
        let maxd=0;const cx=alive.reduce((sum,player)=>sum+player.pos.x,0)/alive.length,cy=alive.reduce((sum,player)=>sum+player.pos.y,0)/alive.length;
        alive.forEach(player=>{maxd=Math.max(maxd,Math.hypot(W.vx(player.pos.x)-W.vx(cx),W.vz(player.pos.y)-W.vz(cy)));});
        cam.dRadius=lerp(cam.dRadius,clamp(maxd*2.1+48,78,160),0.03);cam.dPhi=lerp(cam.dPhi,0.82,0.03);
        if(cam._ovBase==null)cam._ovBase=cam.dTheta;cam.dTheta=cam._ovBase+Math.sin((st.time||0)*0.06)*0.5;
      }
      if(hotspot){
        const objective=String(hotspot.kind||"").includes("objective")||String(hotspot.kind||"").includes("bomb")||String(director?.kind||"").includes("bomb")||director?.kind==="defuse-start";
        cam._directorTarget=new THREE.Vector3(fittedCombat?.target.x??W.vx(hotspot.x),fittedCombat?.target.y??(objective?3.8:3.0),fittedCombat?.target.z??W.vz(hotspot.y));cam.dTgt.copy(cam._directorTarget);
        cam._directorTelemetry={key:hotspot.key,kind:hotspot.kind,source:hotspot.source,score:hotspot.score,position:{x:hotspot.x,y:hotspot.y},objective};
      }
    }else if(!cam.viewPreset&&director?.position&&Number(director.expiresAt)>Number(frame.ts??0)){
      const focus=director.position;
      cam.dTgt.set(W.vx(focus.x),director.kind?.includes("bomb")||director.kind==="defuse-start"?3.8:3.0,W.vz(focus.y));
      cam.dRadius=lerp(cam.dRadius,director.kind?.includes("bomb")||director.kind==="defuse-start"?72:78,0.06);
      cam.dPhi=lerp(cam.dPhi,director.kind?.includes("bomb")||director.kind==="defuse-start"?0.9:0.82,0.06);
    }else if(cam.viewPreset&&FPS_CAMERA_PRESETS[cam.viewPreset]){
      // Preset 以地圖中心為錨點，讓高位視角穩定展示區域層次；若真的失去
      // 全部存活選手，下面既有 recovery 會清掉 preset 並回到存活質心。
      const preset=FPS_CAMERA_PRESETS[cam.viewPreset];
      cam.dTgt.set(...preset.target);cam.dRadius=preset.radius;cam.dPhi=preset.phi;cam.dTheta=preset.theta;
    }else if(cam.overview&&alive.length){
      // 全景追蹤：以存活質心為中心框住全部選手，鏡頭緩和擺動換角度（穩定不晃）
      const cx=alive.reduce((s,p)=>s+p.pos.x,0)/alive.length,cy=alive.reduce((s,p)=>s+p.pos.y,0)/alive.length;
      const wcx=W.vx(cx),wcz=W.vz(cy);
      let maxd=0;for(const p of alive)maxd=Math.max(maxd,Math.hypot(W.vx(p.pos.x)-wcx,W.vz(p.pos.y)-wcz));
      cam.dTgt.set(wcx,3,wcz);
      // Frame the full character footprint, not only the ground-point
      // centroid. The old margin kept labels/rings in view while bodies at
      // the edge slipped out of the mobile viewport or behind the map.
      cam.dRadius=lerp(cam.dRadius,clamp(maxd*2.1+48,78,160),0.03);
      // Keep the tactical overview high enough to see character bodies over
      // blockout rooftops. The previous low angle kept ground markers and
      // labels readable but visually occluded the primitive silhouettes.
      cam.dPhi=lerp(cam.dPhi,0.82,0.03);
      if(cam._ovBase==null)cam._ovBase=cam.dTheta;
      cam.dTheta=cam._ovBase+Math.sin((st.time||0)*0.06)*0.5; // 緩和左右換角度，不追單一對槍避免晃動
    }else{
    // 1) 找最近的「對槍中」敵對雙人 → 以側面角度入鏡
    let duel=null,bd=1e9;
    for(const a of alive){if(a.state!=="ENGAGE"&&a.state!=="架槍")continue;
      for(const b of alive){if(b.side===a.side)continue;const d=dist(a.pos,b.pos);if(d<bd){bd=d;duel=[a,b];}}}
    if(duel&&bd<46){
      const ax=W.vx(duel[0].pos.x),az=W.vz(duel[0].pos.y),bx=W.vx(duel[1].pos.x),bz=W.vz(duel[1].pos.y);
      const mx=(ax+bx)/2,mz=(az+bz)/2;const ang=Math.atan2(bz-az,bx-ax);
      cam.dTheta=ang+Math.PI/2;                       // 垂直對槍連線，雙方同時入鏡
      cam.dPhi=0.92; cam.dRadius=lerp(cam.dRadius,clamp(bd*1.5+18,34,58),0.06);
      cam.dTgt.set(mx,3,mz);
    }else{
      // 2) 團戰熱點 → 否則炸彈點 → 否則存活質心（全景）
      let hot=null,best=0;
      for(const a of alive){const near=alive.filter(b=>dist(a.pos,b.pos)<16);const en=near.filter(b=>b.side!==a.side);if(near.length>=3&&en.length>=1){const sc=near.length*10+en.length*5;if(sc>best){best=sc;const cx=near.reduce((s,p)=>s+p.pos.x,0)/near.length,cy=near.reduce((s,p)=>s+p.pos.y,0)/near.length;hot={x:cx,y:cy};}}}
      if(!hot&&frame.planted&&frame.c4pos)hot={...frame.c4pos,kind:"bomb"};
      if(!hot&&alive.length){const cx=alive.reduce((s,p)=>s+p.pos.x,0)/alive.length,cy=alive.reduce((s,p)=>s+p.pos.y,0)/alive.length;hot={x:cx,y:cy,kind:"centroid"};}
      if(hot){cam.dTgt.set(W.vx(hot.x),3,W.vz(hot.y));cam.dRadius=lerp(cam.dRadius,best>0?60:80,0.04);cam.dPhi=lerp(cam.dPhi,best>0?1.0:1.18,0.04);}
    }
    }
  }
  // 3) 遮擋處理：完全交給建物半透明（fadeOccluders），不再旋轉鏡頭閃避（會在密集建築區來回擺動造成晃動）
  // 平滑插值
  if(pov){
    const authoritativePov=st.sceneVersion!=="legacy",va=(ch.va||0)*Math.PI/180+(authoritativePov?0:(cam.chaseYaw||0)),pitch=authoritativePov?0:(cam.chasePitch||0);
    // The eye is a stable head anchor, slightly forward of the body center.
    // The old 0.12 offset put the camera inside the fallback/rigger envelope
    // during interpolation and made the selected operator enter the view.
    const eyeOffset=0.38,eyeHeight=(ch.elevation||0)+1.56+Math.sin(pitch)*0.04;
    const eye=new THREE.Vector3(W.vx(ch.x+Math.cos(va)*eyeOffset),eyeHeight,W.vz(ch.y+Math.sin(va)*eyeOffset));
    const look=new THREE.Vector3(W.vx(ch.x+Math.cos(va)*12),eyeHeight+Math.sin(pitch)*4.5,W.vz(ch.y+Math.sin(va)*12));
    const k=1-Math.pow(0.0015,Math.max(0,dt));
    if(authoritativePov||cam.povPosition.lengthSq()===0){cam.povPosition.copy(eye);cam.povLookAt.copy(look);}else{cam.povPosition.lerp(eye,k);cam.povLookAt.lerp(look,k);}
    st.camera.fov=cam.povFov||(st.sceneVersion==="legacy"?42:72);st.camera.updateProjectionMatrix();st.camera.position.copy(cam.povPosition);st.camera.lookAt(cam.povLookAt);
  }else{
    st.camera.fov=42;st.camera.updateProjectionMatrix();
    const k=1-Math.pow(0.0015,dt);
    const transition=cam.presetTransition;
    if(transition&&cam._directorTarget){
      const targetK=1-Math.pow(0.0008,Math.max(0,Number(dt)||0));
      transition.to.tgt.lerp(cam._directorTarget,targetK);
    }
    if(transition){
      transition.elapsedMs=Math.min(transition.durationMs,transition.elapsedMs+Math.max(0,dt)*1000);
      const t=ease(transition.elapsedMs/transition.durationMs);
      cam.theta=lerpAngle(transition.from.theta*180/Math.PI,transition.to.theta*180/Math.PI,t)*Math.PI/180;
      cam.phi=lerp(transition.from.phi,transition.to.phi,t);cam.radius=lerp(transition.from.radius,transition.to.radius,t);cam.tgt.lerpVectors(transition.from.tgt,transition.to.tgt,t);
      if(transition.elapsedMs>=transition.durationMs)cam.presetTransition=null;
    }else{
      cam.theta=lerpAngle(cam.theta*180/Math.PI,cam.dTheta*180/Math.PI,k)*Math.PI/180;
      cam.phi=lerp(cam.phi,cam.dPhi,k);cam.radius=lerp(cam.radius,cam.dRadius,k);cam.tgt.lerp(cam.dTgt,k);
    }
    _vA.setFromSphericalCoords(cam.radius,cam.phi,cam.theta).add(cam.tgt);st.camera.position.copy(_vA);st.camera.lookAt(cam.tgt);
  }
  // Presentation-only recoil：以 authoritative frame / shooting edge 建立
  // 一次事件，使用固定 hash + 衰減 envelope，不在 RAF 內抽亂數，避免
  // 後座變成週期性 camera jitter，也不建立第二套 camera authority。
  if(chasing&&ch.shooting){
    const recoilToken=`${ch.id}:${frame?.fi??"?"}:${ch.shootingValue??1}`;
    if(st.lastRecoilToken!==recoilToken){st.lastRecoilToken=recoilToken;st.recoilStartedAt=st.time;st.recoilSeed=hsh(recoilToken);}
    const recoilAge=clamp((st.time-(st.recoilStartedAt??st.time))/0.14,0,1),envelope=1-recoilAge;
    const seed=st.recoilSeed||1;
    const familyKick={pistol:0.045,smg:0.032,rifle:0.064,sniper:0.11,shotgun:0.095}[ch.shootingFamily]||0.055;
    const kick=familyKick*envelope;
    st.camera.position.x+=Math.sin(seed*0.017)*kick;
    st.camera.position.y+=Math.cos(seed*0.013)*kick*0.72;
    st.camera.position.z+=Math.sin(seed*0.011+1.2)*kick*0.82;
  }
  fadeOccluders(st,frame,W,pov);
  // An explicit camera preset owns its composition. Do not let the generic
  // all-alive recovery clear that preset when a deliberate hotspot framing
  // temporarily leaves a distant player outside the viewport.
  const recovery=cam.autoFollow&&!chasing&&!cam.viewPreset?inspectAliveCameraViewport(st,frame,W):null;
  if(recovery?.shouldRecover){
    // A recovery snap can take one or two rendered frames to settle. Do not
    // re-snap the same off-camera condition in a tight loop; repeated snaps
    // made the long-run camera guard report a recovery loop even though the
    // first snap had already restored the overview framing.
    const now=typeof performance!=="undefined"?performance.now():null;
    const recoveringRecently=now!=null&&st.lastCameraRecoveryAt!=null&&now-st.lastCameraRecoveryAt<=2500;
    if(!recoveringRecently){
      st.cameraRecoveryCount=(st.cameraRecoveryCount||0)+1;
      if(now!=null)st.lastCameraRecoveryAt=now;
      snapOverviewToAlive(st,frame,W);
      fadeOccluders(st,frame,W,pov);
    }
  }
}
// 建物擋住視線時自動半透明，方便縱觀對戰全局
function fadeOccluders(st,frame,W,pov=false){
  if(!st.fadeWalls||!st.fadeWalls.length||!frame)return;
  // r160 的 OPAQUE define 依 material version 更新；只改 opacity／transparent
  // 會留下強制 alpha=1 的舊 program。僅在 major 狀態切換時更新，不逐幀編譯。
  const setTransparency=(material,next)=>{if(st.sceneVersion!=="legacy"&&material.transparent!==next)material.needsUpdate=true;material.transparent=next;};
  // 第一人稱必須看見真實掩體；俯瞰用的全場選手遮擋淡出不能沿用。
  // 立即恢復上一個觀戰鏡頭留下的透明度，避免切換時短暫看穿牆壁。
  if(pov&&st.sceneVersion!=="legacy"){
    for(const wall of [...st.fadeWalls,...(st.c3Environment?.fadeDetails||[])]){
      wall.cur=1;
      for(const {m,base} of wall.mats){m.opacity=base;setTransparency(m,base<1);m.depthWrite=base>=1;m.depthTest=true;}
    }
    for(const roof of st.c3Environment?.fadeRoofs||[]){roof.cur=1;roof.material.opacity=1;setTransparency(roof.material,false);roof.material.depthWrite=true;}
    st.c3Environment?.group?.traverse(object=>{if(object.userData?.c3Environment&&object.userData.c3Occluder==="structure")object.visible=true;});
    return;
  }
  const cam=st.camera.position,tgt=st.cam.tgt;const ch=st._chase;const chasing=ch&&ch.alive;
  const preset=st.cam.viewPreset;
  const elevated=preset==="high"||preset==="overview"||preset==="tactical";
  const foci=[[tgt.x,tgt.z,tgt.y]];
  if(chasing){
    foci.push([W.vx(ch.x),W.vz(ch.y),(ch.elevation||0)+1.2]);
    if(st.sceneVersion==="legacy"){
      const dx=tgt.x-cam.x,dz=tgt.z-cam.z,l=Math.hypot(dx,dz)||1;foci.push([tgt.x+dx/l*24,tgt.z+dz/l*24]);
    }
  }
  const alive=frame.players.filter(p=>!p.dead);
  // 近景只揭露選取選手與鏡頭目標；遠方選手不應使背景廠房消失。
  // 全景導播及legacy保留全場焦點，以保持原有選手可讀性。
  if(!chasing||st.sceneVersion==="legacy")for(const p of alive){const wx=W.vx(p.pos.x),wz=W.vz(p.pos.y);foci.push([wx,wz,(p.elevation||0)+1.2]);}
  const margin=chasing?5:0;
  // major房間牆片共用合批材質；先收集所有引用的最小fade，再只套用一次。
  // 避免未遮擋的最後一片牆把整個房間重新變成不透明；legacy原寫入順序不變。
  const sharedFades=st.sceneVersion!=="legacy"?new Map():null;
  for(const fw of [...st.fadeWalls,...(st.c3Environment?.fadeDetails||[])]){
    const r=fw.rect;let occ=false;
    // 相機緊貼或位於建物範圍內 → 直接淡出（進屋/貼牆時不擋畫面）
    if(cam.x>r.x0-margin&&cam.x<r.x1+margin&&cam.z>r.z0-margin&&cam.z<r.z1+margin&&cam.y>=(fw.minHeight??0)&&cam.y<=(fw.height??Infinity))occ=true;
    if(!occ)for(const f of foci){
      if(!segHitsRect(cam.x,cam.z,f[0],f[1],r))continue;
      // 3D slab：高空鏡頭的視線若從屋頂上方經過，不把整張圖淡成玻璃。
      let entry=0,exit=1,intersects=true;
      for(const [start,end,min,max] of [[cam.x,f[0],r.x0,r.x1],[cam.z,f[1],r.z0,r.z1]]){
        const delta=end-start;if(Math.abs(delta)<1e-6){if(start<min||start>max)intersects=false;continue;}
        const a=(min-start)/delta,b=(max-start)/delta;entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
      }
      const focusHeight=f[2]??1.2,entryY=cam.y+(focusHeight-cam.y)*entry,exitY=cam.y+(focusHeight-cam.y)*exit;
      if(intersects&&entry<=exit&&Math.min(entryY,exitY)<=(fw.height??Infinity)&&Math.max(entryY,exitY)>=(fw.minHeight??0)){occ=true;break;}
    }
    // 高位 preset 讓建築保留輪廓，但把玩家與交戰線放到可讀層；
    // 一般導播／追焦仍沿用原本的遮擋契約。
    const target=occ?(elevated?.16:.14):1;
    fw.cur+=(target-fw.cur)*0.18;
    const fade=fw.cur,tr=fade<0.985;
    for(const mm of fw.mats){
      if(sharedFades){
        const previous=sharedFades.get(mm.m);
        sharedFades.set(mm.m,{opacity:Math.min(previous?.opacity??Infinity,mm.base*fade),fade:Math.min(previous?.fade??1,fade),base:Math.min(previous?.base??Infinity,mm.base)});
      }else{mm.m.opacity=mm.base*fade;setTransparency(mm.m,tr||mm.base<1);mm.m.depthWrite=!tr;mm.m.depthTest=true;}
    }
  }
  if(sharedFades)for(const [material,state] of sharedFades){const transparent=state.fade<.985;material.opacity=state.opacity;setTransparency(material,transparent||state.base<1);material.depthWrite=!transparent;material.depthTest=true;}
  // C3 façade 是裝飾層，不是碰撞牆。高位上帝視角隱藏會遮住全場的薄 façade
  // 結構，保留地面、標誌、掩體與燈具；離開高位後立即恢復。
  const env=st.c3Environment?.group;
  for(const roof of st.c3Environment?.fadeRoofs||[]){
    const occupied=alive.some(p=>{const x=W.vx(p.pos.x),z=W.vz(p.pos.y);return x>roof.rect.x0&&x<roof.rect.x1&&z>roof.rect.z0&&z<roof.rect.z1;});
    roof.cur+=((occupied?(roof.occupiedOpacity??.16):1)-roof.cur)*.18;roof.material.opacity=roof.cur;setTransparency(roof.material,roof.cur<.985);roof.material.depthWrite=roof.cur>=.985;
  }
  if(env){
    const hideStructure=preset==="high";
    env.traverse((object)=>{
      if(!object.userData?.c3Environment||object.userData.c3Occluder!=="structure")return;
      object.visible=!hideStructure;
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   HUD 子元件
   ═══════════════════════════════════════════════════════════════════════ */
function ScoreBar({frame,sim,fIdx}){
  const ct=frame.ctScore,t=frame.tScore;
  const timer=frame.buyP?"購買":(frame.planted?`💣 ${(frame.c4t??0)*2}s`:fmtT(115-frame.roundSec));
  const pip=(r,i)=>{const side=r?.winnerSide??(r?.winner==="ct"?"ct":"t");return(<div key={i} style={{width:9,height:11,borderRadius:2,background:r?(side==="ct"?"rgba(56,189,248,0.7)":"rgba(251,146,60,0.7)"):"rgba(255,255,255,0.07)",border:`0.5px solid ${r?(side==="ct"?C.ct:C.t):"transparent"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:6}}>{r?(r.how==="bomb"?"💣":r.how==="defuse"?"✂":r.how==="time"?"⏱":""):""}</div>);};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:7,justifyContent:"flex-end"}}>
          <span style={{color:C.tL,fontSize:13,fontWeight:800,letterSpacing:"0.02em"}}>{T_NAME}</span>
          <div style={{width:22,height:22,borderRadius:6,background:`${C.t}22`,border:`1px solid ${C.t}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🐺</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(0,0,0,0.4)",borderRadius:9,padding:"3px 10px"}}>
          <span style={{color:C.t,fontSize:20,fontWeight:900,minWidth:18,textAlign:"center"}}>{t}</span>
          <div style={{textAlign:"center",minWidth:46}}>
            <div data-testid="cs-match-timer" style={{color:frame.planted?C.gold:"#e6e9ef",fontSize:12,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{timer}</div>
            <div style={{color:C.gray2,fontSize:7,fontWeight:700,letterSpacing:"0.1em"}}>R{frame.rnd+1}</div>
          </div>
          <span style={{color:C.ct,fontSize:20,fontWeight:900,minWidth:18,textAlign:"center"}}>{ct}</span>
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:7}}>
          <div style={{width:22,height:22,borderRadius:6,background:`${C.ct}22`,border:`1px solid ${C.ct}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🛡️</div>
          <span style={{color:C.ctL,fontSize:13,fontWeight:800,letterSpacing:"0.02em"}}>{CT_NAME}</span>
        </div>
      </div>
      <div style={{display:"flex",gap:2,rowGap:2,justifyContent:"center",flexWrap:"wrap",maxWidth:310,margin:"0 auto"}}>{Array.from({length:Math.max(24,Number(frame.roundHistCount??frame.roundHist.length))}).map((_,i)=>pip(i<Number(frame.roundHistCount??frame.roundHist.length)?frame.roundHist[i]:null,i))}</div>
    </div>
  );
}

const CS_PLAYER_CARD_ICON_HELP=Object.freeze({
  armor:{label:"防彈衣",description:"減少身體子彈與高爆手榴彈的傷害。"},
  helmet:{label:"頭盔",description:"降低頭部被子彈命中時的傷害。"},
  grenade:{label:"高爆手榴彈",description:"爆炸後對範圍內敵人造成傷害。"},
  flash:{label:"閃光彈",description:"使範圍內敵人短暫失去視線。"},
  smoke:{label:"煙霧彈",description:"在指定位置形成煙霧，遮擋視線。"},
  molly:{label:"燃燒彈",description:"在地面留下持續傷害區域。"},
  c4:{label:"C4",description:"此選手目前攜帶炸彈。"},
  weapon:{label:"武器",description:"此選手目前持有的主要武器。"},
  hp:{label:"生命值",description:"目前生命值；血條越長代表越健康。"},
  money:{label:"金錢",description:"可用於下一回合購買武器與裝備。"},
});
const GAME_ICON_CONTRACT=Object.freeze({version:1,source:"CS_PLAYER_CARD_ICON_HELP",interaction:["desktop-hover","desktop-focus","mobile-tap","mobile-long-press"],statePolicy:"canonical-gameplay-state"});
function GameIcon({type,count=1,detail=""}){
  const [open,setOpen]=useState(false);const timer=useRef(null);const longPress=useRef(false);const touchHandled=useRef(false);const pointerType=useRef("");const meta=CS_PLAYER_CARD_ICON_HELP[type]||CS_PLAYER_CARD_ICON_HELP.weapon;
  const label=detail?`${meta.label}：${detail}`:meta.label;
  const paths={
    armor:<><path d="M5 7 8 4h8l3 3v9l-3 4H8l-3-4Z"/><path d="M8 8h8M8 12h8"/></>,
    helmet:<><path d="M4 14a8 8 0 0 1 16 0v3H4Z"/><path d="M3 17h18"/></>,
    grenade:<><path d="M9 7h6l2 3-1 9H8l-1-9Z"/><path d="M10 7V4h4v3M12 2v2"/></>,
    flash:<><path d="m13 2-7 11h5l-1 9 7-12h-5Z"/></>,
    smoke:<><path d="M7 18h10M6 15a3 3 0 0 1 1-5 5 5 0 0 1 9-1 3 3 0 0 1 1 6"/></>,
    molly:<><path d="M9 7h6l2 3-1 9H8l-1-9Z"/><path d="M10 7V4h4v3M12 2v2"/></>,
    c4:<><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M8 10h2m2 0h2m2 0h2M8 14h2m2 0h2m2 0h2"/></>,
    weapon:<><path d="M3 14h10l3-3h5v3h-3l-2 3H9l-2-2H3Z"/><path d="M6 17v3"/></>,
    hp:<><path d="M12 20S4 15.5 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.5 12 20 12 20Z"/><path d="M8 12h8"/></>,
    money:<><circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.4-.8-1.2-1.2-2.5-1.2-1.4 0-2.3.7-2.3 1.6 0 2.5 5.1 1 5.1 3.5 0 1-.9 1.7-2.4 1.7-1.3 0-2.2-.4-2.8-1.2M12 7v10"/></>,
  };
  const clearTimer=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}};
  const beginPointer=event=>{clearTimer();longPress.current=false;pointerType.current=event.pointerType||"";if(event.pointerType==="touch"||event.pointerType==="pen"){timer.current=setTimeout(()=>{longPress.current=true;setOpen(true);},420);}};
  const endPointer=event=>{clearTimer();const touch=pointerType.current==="touch"||pointerType.current==="pen"||event?.pointerType==="touch"||event?.pointerType==="pen";if(!touch)return;if(longPress.current){longPress.current=false;touchHandled.current=true;return;}touchHandled.current=true;setOpen(value=>!value);};
  const beginTouch=()=>beginPointer({pointerType:"touch"});
  const endTouch=()=>endPointer({pointerType:"touch"});
  const handleClick=event=>{event.stopPropagation();clearTimer();if(touchHandled.current){touchHandled.current=false;return;}if(longPress.current){longPress.current=false;return;}setOpen(value=>!value);};
  return <span title={label} aria-label={label} data-cs-icon-type={type} aria-expanded={open} role="button" tabIndex={0} onMouseEnter={()=>{if(pointerType.current!=="touch"&&pointerType.current!=="pen")setOpen(true);}} onMouseLeave={()=>{clearTimer();if(pointerType.current!=="touch"&&pointerType.current!=="pen")setOpen(false);}} onPointerEnter={event=>{if(event.pointerType==="mouse")setOpen(true);}} onPointerLeave={event=>{if(event.pointerType==="mouse"){clearTimer();setOpen(false);}}} onFocus={()=>{if(pointerType.current!=="touch"&&pointerType.current!=="pen")setOpen(true);}} onBlur={()=>{clearTimer();pointerType.current="";setOpen(false);}} onPointerDown={event=>{if(event.pointerType!=="touch")beginPointer(event);}} onPointerUp={event=>{if(event.pointerType!=="touch")endPointer(event);}} onPointerCancel={event=>{if(event.pointerType!=="touch")endPointer(event);}} onTouchStart={beginTouch} onTouchEnd={endTouch} onTouchCancel={endTouch} onClick={handleClick} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();setOpen(value=>!value);}}} style={{display:"inline-flex",alignItems:"center",gap:2,color:"#d8dee8",verticalAlign:"middle",position:"relative",cursor:"help",outline:"none",flexShrink:0}}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]||paths.weapon}</svg>{count>1&&<small style={{fontSize:7,fontWeight:900}}>{count}</small>}
    {open&&<span role="tooltip" style={{position:"absolute",left:"50%",bottom:"calc(100% + 6px)",transform:"translateX(-50%)",zIndex:80,width:148,maxWidth:"calc(100vw - 24px)",boxSizing:"border-box",padding:"6px 7px",borderRadius:7,background:"rgba(8,11,18,0.98)",border:"1px solid rgba(255,255,255,0.2)",boxShadow:"0 8px 20px rgba(0,0,0,0.45)",color:"#f4f7fb",fontSize:9,lineHeight:1.35,fontWeight:800,textAlign:"left",pointerEvents:"none",whiteSpace:"normal"}}><span style={{display:"block",color:C.gold,marginBottom:2}}>{label}</span><span style={{display:"block",color:"#c5ccd7",fontWeight:600}}>{meta.description}</span></span>}
  </span>;
}
function IconHelp(props){return <GameIcon {...props}/>;}
function SemanticIcon({type,title,count=1}){return <IconHelp type={type} count={count} detail={type==="weapon"?title:""}/>;}

function PlayerRow({p,selected,onClick,major=false}){
  const col=sideColor(p.side);const hp=clamp(p.hp,0,100);
  const g=GUNS[p.gun]||{name:p.gun,cls:""};
  const nf=p.nades||[];const flashN=nf.filter(n=>n==="flash").length;
  const roleLabel=FPS_ROLE_ZH[p.bestFpsRole]||p.fpsRole||ROLE_ZH[p.role]||p.role;
  const weaponTitle=g.name||"武器";
  return(
    <button data-esmo-fps-player-card={p.id} onClick={()=>onClick(p.id)} aria-label={`${p.name} ${roleLabel}`} style={{display:"flex",alignItems:"center",gap:6,width:"100%",minWidth:0,maxWidth:"100%",boxSizing:"border-box",textAlign:"left",
      background:selected?`${col}1f`:"rgba(255,255,255,0.025)",border:`1px solid ${selected?col+"99":"transparent"}`,borderRadius:8,padding:"5px 7px",cursor:"pointer",opacity:p.dead?0.45:1,position:"relative",overflow:"visible"}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:col}}/>
      <div title={roleLabel} style={{width:30,height:18,borderRadius:5,background:`${col}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,flexShrink:0,color:"#edf2f7"}}>{p.dead?"陣亡":roleLabel}</div>
      <div style={{flex:1,minWidth:0,maxWidth:"100%"}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{color:"#e8ebf0",fontSize:10,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}{p.hasBomb&&<span style={{marginLeft:4}}><SemanticIcon type="c4" title="C4"/></span>}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:1,minWidth:0,flexWrap:"wrap",rowGap:2,overflow:"visible"}}>
          <span title={weaponTitle} style={{color:p.dead?C.gray2:"#aeb4be",fontSize:8,fontWeight:700,display:"inline-flex",alignItems:"center",gap:3,flex:"1 1 72px",minWidth:0,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><SemanticIcon type="weapon" title={weaponTitle}/>{g.name}</span>
          <span style={{fontSize:8,opacity:p.dead?0.4:0.95,display:"inline-flex",alignItems:"center",gap:3,flex:"0 1 auto",minWidth:0,flexWrap:"wrap"}}>
            {p.armor&&<SemanticIcon type="armor" title="防彈衣"/>}{p.helmet&&<SemanticIcon type="helmet" title="頭盔"/>}{flashN>0&&<SemanticIcon type="flash" title="閃光彈" count={flashN}/>} {nf.includes("he")&&<SemanticIcon type="grenade" title="高爆手榴彈"/>}{nf.includes("smoke")&&<SemanticIcon type="smoke" title="煙霧彈"/>}{nf.includes("molly")&&<SemanticIcon type="molly" title="燃燒彈"/>}
          </span>
          <span style={{color:C.green,fontSize:7.5,fontWeight:700,marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:2,flex:"0 0 auto"}}><SemanticIcon type="money" title="金錢"/>{major?fmtFpsMoney(p.money):`$${p.money}`}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:3,marginTop:2}}><SemanticIcon type="hp" title="生命值"/><div style={{height:3,flex:1,background:"rgba(255,255,255,0.1)",borderRadius:9,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${hp}%`,background:hp>50?C.green:hp>25?C.gold:C.red,transition:"width 0.2s"}}/>
        </div></div>
        </div>
      <div style={{textAlign:"right",flexShrink:0,minWidth:46}}>
        <div style={{color:"#e8ebf0",fontSize:10,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{p.k}<span style={{color:C.gray2}}>/</span>{p.d}<span style={{color:C.gray2}}>/</span><span style={{color:C.gold}}>{p.a||0}</span></div>
        <div style={{color:C.gray2,fontSize:6.5,fontWeight:700,letterSpacing:"0.08em"}}>K / D / A</div>
      </div>
    </button>
  );
}

function RoundOverlay({result,frame,onClose}){
  const winSide=result.winnerSide??(result.winner==="ct"?"ct":"t");
  const winTeam=result.winnerTeam??(result.winner==="t"?CS_TEAM_US:CS_TEAM_ENEMY);
  return(
    <div style={{position:"absolute",inset:0,zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(4,6,12,0.55)",backdropFilter:"blur(3px)",animation:"fadeIn 0.25s"}} onClick={onClose}>
      <div style={{background:"rgba(13,17,25,0.96)",border:`1px solid ${winSide==="ct"?C.ct:C.t}66`,borderRadius:14,padding:"16px 20px",minWidth:260,boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
        <div style={{textAlign:"center",marginBottom:10}}>
          <div style={{color:winSide==="ct"?C.ctL:C.tL,fontSize:22,fontWeight:900,letterSpacing:"0.05em"}}>{winTeam===CS_TEAM_US?T_NAME:CT_NAME} 拿下回合</div>
          <div style={{color:C.gray,fontSize:10,marginTop:2}}>{result.how==="bomb"?"💣 炸彈引爆":result.how==="defuse"?"✂️ 成功拆彈":result.how==="elim"?"☠️ 全員淘汰":"⏱️ 時間結束"} · R{frame.rnd+1}</div>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center",alignItems:"center"}}>
          <span style={{color:C.t,fontSize:30,fontWeight:900}}>{frame.tScore}</span>
          <span style={{color:C.gray2,fontSize:14}}>:</span>
          <span style={{color:C.ct,fontSize:30,fontWeight:900}}>{frame.ctScore}</span>
        </div>
        {result.mvp&&(
          <div style={{marginTop:10,paddingTop:9,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:8}}>
              <span style={{fontSize:12}}>⭐</span>
              <span style={{color:C.gold,fontSize:11,fontWeight:900}}>本回合 MVP</span>
              <span style={{color:result.mvp.side==="ct"?C.ctL:C.tL,fontSize:13,fontWeight:800}}>{result.mvp.name}</span>
              <span style={{color:C.gray2,fontSize:9}}>{result.mvp.role}</span>
              <span style={{color:C.gray,fontSize:10}}>{result.mvp.k}/{result.mvp.d}/{result.mvp.a} · {result.mvp.dmg} 傷</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:8,color:C.gray2,fontWeight:700,padding:"0 2px 3px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
              <span style={{width:14}}>#</span><span style={{flex:1}}>選手</span>
              <span style={{width:46,textAlign:"center"}}>K/D/A</span><span style={{width:40,textAlign:"right"}}>本局傷</span><span style={{width:38,textAlign:"right"}}>ADR</span>
            </div>
            <div style={{display:"flex",flexDirection:"column"}}>
              {result.top.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,padding:"3px 2px",borderBottom:i<result.top.length-1?"1px solid rgba(255,255,255,0.04)":"none"}}>
                  <span style={{color:i===0?C.gold:C.gray2,width:14,fontWeight:800}}>{i+1}</span>
                  <span style={{flex:1,display:"flex",alignItems:"baseline",gap:4,minWidth:0}}>
                    <span style={{color:s.side==="ct"?C.ctL:C.tL,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</span>
                    <span style={{color:C.gray2,fontSize:7.5}}>{s.role}</span>
                  </span>
                  <span style={{width:46,textAlign:"center",color:"#e8ebf0",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{s.k}/{s.d}/<span style={{color:C.gold}}>{s.a}</span></span>
                  <span style={{width:40,textAlign:"right",color:"#cbd5e1",fontWeight:700}}>{s.dmg}</span>
                  <span style={{width:38,textAlign:"right",color:C.gray}}>{s.adr}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function C5CPresentationHUD({view,frame=null,revision=0}){
  if(!view)return null;
  const banner=view.banner;
  const objective=view.objective||{};
  const feed=view.feed||[];
  const multi=view.multiKill;
  const carrier=frame?.players?.find(player=>player.side==="t"&&!player.dead&&player.hasBomb);
  const dropped=Boolean(frame?.droppedBomb);
  const accent=objective.planted?C.gold:C.ctL;
  const timer=objective.timer==null?null:Math.max(0,Math.ceil(Number(objective.timer)*2));
  return(<>
    <div data-testid="cs-c5c-presentation-hud" data-c5c-presentation-revision={revision} style={{position:"absolute",inset:0,zIndex:22,pointerEvents:"none"}}>
      <div data-testid="cs-c5c-bomb-status" data-cs-bomb-state={objective.planted?"planted":dropped?"dropped":carrier?"carried":"unassigned"} style={{position:"absolute",top:32,left:8,maxWidth:"58%",padding:"4px 7px",borderRadius:6,background:objective.planted?"rgba(73,48,5,0.9)":dropped?"rgba(57,31,20,0.9)":"rgba(6,9,15,0.72)",border:`1px solid ${objective.planted||dropped?C.gold:"rgba(255,255,255,0.12)"}`,color:objective.planted||dropped?C.gold:"rgba(255,255,255,0.72)",fontSize:9,fontWeight:800,boxShadow:objective.planted?`0 0 16px ${C.gold}33`:"none"}}>
        {objective.planted?<>C4 已安裝{objective.position&&<span style={{marginLeft:5,color:"#fff"}}>· {objective.state==="defusing"?"拆除中":String(objective.state||"安裝")}</span>}{timer!=null&&<span style={{marginLeft:6,fontVariantNumeric:"tabular-nums"}}>{timer}s</span>}{objective.defuse&&<span style={{marginLeft:6,color:"#fff"}}>· {objective.defuse} 拆除中</span>}</>:dropped?<>C4 已掉落 · 可拾取</>:carrier?<>C4 由 {carrier.name} 攜帶</>:<>C4 未交付</>}
      </div>
      <div data-testid="cs-c5c-kill-feed" style={{position:"absolute",top:42,right:8,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,maxWidth:"68%"}}>
        {feed.map((entry)=><div key={entry.id} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 7px",borderRadius:6,background:entry.critical?"rgba(61,45,5,0.92)":"rgba(0,0,0,0.82)",border:`1px solid ${entry.critical?C.gold:sideColor(entry.killerSide)}88`,fontSize:9,whiteSpace:"nowrap",animation:"slideL 0.25s"}}>
          <span style={{color:entry.killerSide==="ct"?C.ctL:C.tL,fontWeight:900}}>{entry.killer}</span>
          <span style={{color:C.gray2}}>→</span>
          <span style={{color:entry.killerSide==="ct"?C.tL:C.ctL,fontWeight:700}}>{entry.victim}</span>
          <span style={{color:C.gray2,fontSize:8}}>{entry.weaponLabel}</span>
          {entry.hs&&<span title="爆頭" style={{color:C.gold,fontSize:9}}>爆頭</span>}
          {entry.firstKill&&<span style={{color:C.gold,fontSize:7,fontWeight:900}}>首殺</span>}
          {entry.finalKill&&<span style={{color:C.gold,fontSize:7,fontWeight:900}}>關鍵</span>}
        </div>)}
      </div>
      {(banner||multi)&&<div data-testid="cs-c5c-presentation-banner" style={{position:"absolute",top:"28%",left:"50%",transform:"translateX(-50%)",minWidth:150,maxWidth:"76%",textAlign:"center",padding:"8px 14px",borderRadius:9,background:"rgba(7,10,16,0.84)",border:`1px solid ${banner?.kind==="objective"?accent:C.gold}88`,boxShadow:"0 8px 28px rgba(0,0,0,0.32)",animation:"c5cBannerIn 0.24s"}}>
        <div style={{color:banner?.kind==="objective"?accent:C.gold,fontSize:banner?.kind==="round-end"?16:14,fontWeight:900,letterSpacing:"0.04em"}}>{banner?.title||multi?.label}</div>
        <div style={{color:"rgba(255,255,255,0.82)",fontSize:9,fontWeight:700,marginTop:3}}>{banner?.detail||multi?.player||""}</div>
      </div>}
    </div>
  </>);
}

function C5CRoundHistory({view}){
  const history=view?.history||[];
  if(!history.length)return null;
  return(<div data-testid="cs-c5c-round-history" style={{display:"flex",alignItems:"center",gap:5,overflowX:"auto",padding:"5px 7px",marginTop:6,borderRadius:8,background:"rgba(13,17,25,0.9)",border:`1px solid ${C.line}`,fontSize:8,color:C.gray2,whiteSpace:"nowrap"}}>
    <span style={{fontWeight:800,color:C.gray}}>回合紀錄</span>
    {history.map((result,index)=>{const ct=result?.winnerSide==="ct"||result?.winner==="ct";const reason=result?.how==="bomb"?"炸彈爆炸":result?.how==="defuse"?"炸彈拆除":result?.how==="time"?"時間到":"全隊淘汰";return <span key={`${result?.round??index}-${index}`} title={reason} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 5px",borderRadius:4,background:ct?`${C.ct}22`:`${C.t}22`,color:ct?C.ctL:C.tL,fontWeight:800}}>{index+1} {result?.how==="bomb"?"💣":result?.how==="defuse"?"✂":result?.how==="time"?"⏱":"☠"}</span>;})}
  </div>);
}

/* ═══════════════════════════════════════════════════════════════════════
   主元件
   ═══════════════════════════════════════════════════════════════════════ */
function EsportsFPS3D({
  roster:rosterProp,          // 我方 5 名（3D 形狀，side:"t"）
  opponent:oppProp,           // 對手 5 名（3D 形狀，side:"ct"）
  tactic:tacticProp,          // 我方 T 戰術（id 字串或物件）
  tacticType:tacticTypeProp,  // 我方 T 戰術類型（execute/rush/default）；id 對不到時用此挑選
  tacticalLayout:tacticalLayoutProp, // 賽前四階段布局：opening/mid-round/late-round/post-plant
  ctTactic:ctTacticProp,      // 對手 CT 戰術 id（可選；未給則 AI 預設）
  mapKey:mapKeyProp,          // 指定地圖
  sceneVersion:sceneVersionProp="major.v1", // 舊進行中比賽保留 legacy 空間
  seed:seedProp,              // 指定亂數種子
  teamName:teamNameProp,      // 我方隊名
  oppName:oppNameProp,        // 對手隊名
  onComplete,                 // (matchResult)=>void：播放結束時觸發一次
  resumeFrameIndex=0,         // R63：由 ActiveMatch snapshot 恢復同一份正式 frames
  onProgress=null,             // R63：回報目前 frame，外層負責節流保存
  replayData=null,             // CsReplay.v1：只播放保存幀
  onReplayModeChange=null,
  embedded=false,             // 嵌入主遊戲：隱藏內建選圖/選戰術面板
  asyncSimulation=false,      // hotfix/cs-resume-worker：快取沒命中時改在 Worker 算（外層必須有 <Suspense>）
}={}){
  const mobile=useIsMobile();
  const [importedReplay,setImportedReplay]=useState(null);
  const externalReplay=useMemo(()=>replayData?readCsReplay(replayData):null,[replayData]);
  const replayEnvelope=importedReplay||externalReplay;
  const replayMode=Boolean(replayEnvelope);
  const sceneVersion=replayEnvelope?.metadata.sceneVersion||sceneVersionProp;
  const [replayBusy,setReplayBusy]=useState(false);
  const [replayError,setReplayError]=useState("");
  const normalSimulationRef=useRef(null);
  const normalCursorRef=useRef(Number(resumeFrameIndex)||0);
  useEffect(()=>{onReplayModeChange?.(replayMode,replayEnvelope?.metadata||null);},[replayMode,replayEnvelope,onReplayModeChange]);
  // 名稱覆寫（嵌入時）
  T_NAME=replayEnvelope?.metadata.teamName||teamNameProp||"德國海豹";CT_NAME=replayEnvelope?.metadata.opponentName||oppNameProp||"Compulsary";
  const loadMountMarked=useRef(false);
  if(!loadMountMarked.current){loadMountMarked.current=true;csLoadMark("fps:component-first-render");}
  const [normalMapKey,setMapKey]=useState(mapKeyProp||"inferno");
  const mapKey=replayEnvelope?.metadata.mapKey||normalMapKey;
  useEffect(()=>{if(mapKeyProp&&mapKeyProp!==normalMapKey)setMapKey(mapKeyProp);},[mapKeyProp]);
  const lib=useMemo(()=>TACTICS_DB[normalMapKey],[normalMapKey]);
  // 即時名單：同一份有效名單同時提供模擬與 renderer。
  const normalRoster=useMemo(()=>{
    const bt=ROSTER.filter(p=>p.side==="t"),bc=ROSTER.filter(p=>p.side==="ct");
    const tSide=(rosterProp&&rosterProp.length)?rosterProp.map(p=>({...p,side:"t"})):bt;
    const ctSide=(oppProp&&oppProp.length)?oppProp.map(p=>({...p,side:"ct"})):bc;
    const rs=[...tSide,...ctSide];
    return rs;
  },[rosterProp,oppProp]);
  const effectiveRoster=replayEnvelope?replayEnvelope.simulation.frames[0].players:normalRoster;
  // 解析我方戰術索引（id 字串 / 物件 / 數字）
  const resolveTIdx=()=>{
    if(tacticProp!=null){const id=typeof tacticProp==="object"?tacticProp.id:tacticProp;const i=lib.t.findIndex(t=>t.id===id||t.name===id);if(i>=0)return i;if(typeof tacticProp==="number")return tacticProp;}
    if(tacticTypeProp){const i=lib.t.findIndex(t=>t.type===tacticTypeProp);if(i>=0)return i;}
    return 0;
  };
  const [tIdx,setTIdx]=useState(resolveTIdx());
  useEffect(()=>{setTIdx(resolveTIdx());},[tacticProp,tacticTypeProp,normalMapKey]);
  const baseTactic=lib.t[Math.min(tIdx,lib.t.length-1)];
  const preMatchLayout=useMemo(()=>normalizeCsTacticalLayout(tacticalLayoutProp,lib.t,baseTactic),[tacticalLayoutProp,lib,baseTactic]);
  // CT 戰術：有指定用指定；否則 AI 依我方站點挑一個合理防守（堆同點），增添對抗性
  const aiCtIdx=useMemo(()=>{
    if(ctTacticProp!=null){const i=lib.ct.findIndex(t=>t.id===ctTacticProp||t.name===ctTacticProp);if(i>=0)return i;}
    const tSite=preMatchLayout.phases[CS_TACTICAL_PHASES.OPENING]?.tactic?.site;
    // 50% 機率守對點（堆/標準），否則隨機 — 避免 AI 過強破壞平衡
    const rng=mkRng((seedProp||42)+7);
    if(tSite&&tSite!=="mid"&&rng()<0.5){const i=lib.ct.findIndex(t=>t.site===tSite);if(i>=0)return i;}
    return Math.floor(rng()*lib.ct.length);
  },[ctTacticProp,tIdx,normalMapKey,seedProp,preMatchLayout]);
  const [ctIdx,setCtIdx]=useState(aiCtIdx);
  useEffect(()=>{if(embedded)setCtIdx(aiCtIdx);},[aiCtIdx,embedded]);
  const [seed,setSeed]=useState(seedProp||42);
  useEffect(()=>{if(seedProp!=null&&seedProp!==seed)setSeed(seedProp);},[seedProp]);
  const tacticT=preMatchLayout.phases[CS_TACTICAL_PHASES.OPENING]?.tactic||baseTactic,tacticCT=lib.ct[Math.min(ctIdx,lib.ct.length-1)];
  const sim=useMemo(()=>{
    if(replayEnvelope)return replayEnvelope.simulation;
    const signature=[mapKey,tacticT,tacticCT,seed,effectiveRoster,tacticalLayoutProp,sceneVersion,asyncSimulation];
    const saved=normalSimulationRef.current;
    if(saved&&signature.every((value,index)=>value===saved.signature[index]))return saved.sim;
    const simulation=(asyncSimulation?simulateFpsForMountAsync:simulateFpsForMount)(mapKey,tacticT,tacticCT,seed,effectiveRoster,tacticalLayoutProp,sceneVersion);
    normalSimulationRef.current={signature,sim:simulation};normalCursorRef.current=Number(resumeFrameIndex)||0;
    return simulation;
  },[mapKey,sceneVersion,tIdx,ctIdx,seed,effectiveRoster,tacticalLayoutProp,tacticT,tacticCT,asyncSimulation,replayEnvelope]);
  // 賽後結果（給主遊戲）；播放到最後一格時透過 onComplete 回傳一次
  const matchResult=useMemo(()=>replayEnvelope?.rawResult||csLoadTime("sim:buildMatchResult",()=>buildMatchResult(sim,{tacticT,tacticCT,tName:T_NAME,ctName:CT_NAME,seed})),[sim,seed,replayEnvelope]);
  const completedRef=useRef(null);
  useEffect(()=>{if(!replayMode&&completedRef.current!==matchResult.id)completedRef.current=null;},[matchResult,replayMode]); // 只有新的正常比賽重置；返回原比賽保留已交付旗標

  const [fIdx,setFIdx]=useState(0);
  const [playing,setPlaying]=useState(true);
  const [speed,setSpeed]=useState(1);
  const [quickFinishing,setQuickFinishing]=useState(false);
  const [quickCompleted,setQuickCompleted]=useState(false);
  const [selected,setSelected]=useState(null);
  const [cameraMode,setCameraMode]=useState("tactical");
  const [showLabels,setShowLabels]=useState(true);
  const [showRoutes,setShowRoutes]=useState(false);
  const [showSetup,setShowSetup]=useState(false);
  const [casts,setCasts]=useState([]);
  const [comms,setComms]=useState([]);
  const [soundOn,setSoundOn]=useState(false);
  const [showStats,setShowStats]=useState(false);
  const presentationRef=useRef(null);
  const presentationMajorRef=useRef(null);
  if(!presentationRef.current||presentationMajorRef.current!==(sceneVersion!=="legacy")){presentationRef.current=createFpsMatchPresentation({major:sceneVersion!=="legacy"});presentationMajorRef.current=sceneVersion!=="legacy";}
  const [presentationRevision,setPresentationRevision]=useState(0);
  const audioRef=useRef(null);
  const audioGateRef=useRef(null);
  if(!audioGateRef.current)audioGateRef.current=createFpsAudioPlaybackGate();
  // Start the small CC0 asset preload at mount. The gesture still owns
  // AudioContext.resume(), but enabling sound no longer starts the network
  // and decode critical path.
  useEffect(()=>{const audio=makeAudio({pooled:sceneVersion!=="legacy",mobile,getListener:()=>liveRef.current.audioListener});audioRef.current=audio;if(sceneVersion!=="legacy")setSoundOn(false);return()=>{audio?.dispose?.();if(audioRef.current===audio)audioRef.current=null;}},[sceneVersion,sceneVersion==="legacy"?false:mobile]);
  const fidc=useRef(0);
  const seekNonce=useRef(0);
  const recenter=useRef(null);
  const cameraPresetRef=useRef(null);
  const [cameraPreset,setCameraPreset]=useState(null);
  const selectPlayer=useCallback((id)=>{setSelected(id);setCameraMode(mode=>id&&mode==="pov"?"pov":"tactical");if(id)setCameraPreset(null);},[]);

  const total=sim.frames.length;
  const frame=sim.frames[Math.min(fIdx,total-1)];
  const presentationView=presentationRef.current?.getView?.()||null;

  // liveRef：傳給 3D 場景的即時資料（避免每幀 React 重繪）
  const liveRef=useRef({});
  const publishFpsFrame=(next,reason)=>{
    liveRef.current.fIdx=next;
    if(!replayMode)normalCursorRef.current=next;
    const p0Contract=getFpsP0Contract();
    if(p0Contract){p0Contract.fidxTransitions+=1;p0Contract.lastAuthoritativeFidx=next;p0Contract.lastReason=reason;}
    setFIdx(next);
  };
  const publishedFidx=liveRef.current?.sim===sim&&Number.isFinite(liveRef.current?.fIdx)?liveRef.current.fIdx:fIdx;
  const beginFpsSeek=(next,reason)=>{
    seekNonce.current++;liveRef.current.seekNonce=seekNonce.current;
    if(sceneVersion!=="legacy"){
      audioRef.current?.resetGunfireEvents?.();audioGateRef.current.seek({simulation:sim,frameIndex:next,seekNonce:seekNonce.current});
      const presentation=presentationRef.current;const start=Math.max(0,next-10);presentation.reset({resumeFrameIndex:start});
      presentation.update({frame:sim.frames[Math.max(0,start-1)],frameIndex:Math.max(0,start-1)});
      for(let index=start;index<=next;index++)presentation.update({frame:sim.frames[index],previousFrame:sim.frames[Math.max(0,index-1)],frameIndex:index});
      presentation.drainAudio();
      setPresentationRevision(value=>value+1);
    }
    publishFpsFrame(next,reason);
  };
  liveRef.current={...liveRef.current,sim,fIdx:publishedFidx,playing,speed,playbackFrameSec:C5A2_PLAYBACK_FRAME_SEC,selected,cameraMode,cameraPreset,showLabels,showRoutes:FPS_DEBUG_ENABLED&&showRoutes,seekNonce:seekNonce.current,seekFrame:value=>{const next=clamp(Math.floor(Number(value)||0),0,total-1);beginFpsSeek(next,"diagnostic-seek");},
    advance:()=>{const from=liveRef.current.fIdx;if(from>=total-1){liveRef.current.playing=false;setPlaying(false);return from;}const next=from+1;publishFpsFrame(next,"playback");return next;}};

  // 切換比賽/地圖 → 重置
  // A persisted active-match snapshot updates resumeFrameIndex while Battle is
  // running. That is progress persistence, not a new Battle mount: rerunning
  // this initializer on every snapshot used to clear PlayerRow selection and
  // tear down the close-up chase roughly once per save interval. Initialize
  // only when the authoritative simulation changes; the initial prop value is
  // still used to resume the newly entered simulation.
  useEffect(()=>{const startFrame=clamp(replayMode?0:normalCursorRef.current,0,Math.max(0,sim.frames.length-1));audioRef.current?.resetGunfireEvents?.();audioGateRef.current.reset();presentationRef.current?.reset?.({resumeFrameIndex:startFrame});publishFpsFrame(startFrame,"reset");setSelected(null);setCameraMode("tactical");setCameraPreset(null);setCasts([]);setComms([]);setPresentationRevision(value=>value+1);seekNonce.current++;setQuickFinishing(false);setQuickCompleted(false);setPlaying(!replayMode);},[sim]);
  useEffect(()=>{if(sceneVersion!=="legacy"){if(!playing||!soundOn)audioRef.current?.stopAll?.();audioGateRef.current.seek({simulation:sim,frameIndex:liveRef.current.fIdx,seekNonce:seekNonce.current});}},[playing,soundOn,sim,sceneVersion]);
  useEffect(()=>{if(sceneVersion!=="legacy")audioRef.current?.syncAmbient?.({playing,soundOn,simulation:sim,
    seekNonce:seekNonce.current,mapKey,frameTimeSec:sim.frames[publishedFidx]?.ts||0});},[playing,soundOn,sim,publishedFidx,sceneVersion,mapKey,seekNonce.current]);

  // R63：只保存可重建的 frame 游標與該 frame 的真實比分／時間，不複製 simulator。
  useEffect(()=>{
    if(replayMode||!frame||!onProgress)return;
    onProgress({
      frameIndex:fIdx,
      totalFrames:total,
      simulationTimeSec:Number(frame.ts)||0,
      snapshot:{sceneVersion,frameIndex:fIdx,totalFrames:total,simulationTimeSec:Number(frame.ts)||0,rnd:frame.rnd,ctScore:frame.ctScore,tScore:frame.tScore},
    });
  },[fIdx,frame,total,onProgress,replayMode]);

  // 依 fIdx 觸發擊殺播報 / 多殺 / 回合結算
  useEffect(()=>{
    if(!frame)return;
    const presentation=presentationRef.current;
    const previousFrame=sim.frames[Math.max(0,fIdx-1)];
    const presentationView=presentation?.update({frame,previousFrame,nextFrame:sim.frames[fIdx+1]||null,frameIndex:fIdx})||null;
    if(presentationView){
      liveRef.current.presentationDirector=presentation.getDirectorIntent();
      if(import.meta.env?.DEV&&typeof window!=="undefined")window.__ESMO_C5C_PRESENTATION__={contract:presentation.contract,view:presentationView,diagnostics:presentation.diagnostics()};
      setPresentationRevision(value=>value+1);
    }
    if(sceneVersion!=="legacy"||replayMode){
      const messages=getFpsFrameMessages(sim.frames,fIdx);setCasts(messages.casts);setComms(messages.comms);
    }else{
      frame.casts?.forEach(c=>{const id=++fidc.current;setCasts(cs=>[...cs.slice(-3),{id,text:c}]);setTimeout(()=>setCasts(cs=>cs.filter(x=>x.id!==id)),3600);});
      frame.comms?.forEach(c=>{const id=++fidc.current;setComms(cs=>[...cs.slice(-4),{id,...c}]);setTimeout(()=>setComms(cs=>cs.filter(x=>x.id!==id)),4200);});
    }
    // ── 音效 ──
    const A=audioRef.current;
    const dispatchAudio=sceneVersion==="legacy"&&!replayMode?soundOn:audioGateRef.current.update({simulation:sim,frameIndex:fIdx,seekNonce:seekNonce.current,playing,soundOn});
    if(dispatchAudio&&A){
      const frameStartMs=(Number(frame.roundSec)||0)*1000,frameEndMs=frameStartMs+C5A2_SIM_STEP_MS,playbackRate=Math.max(0.1,Number(speed)||1);
      (frame.muzzles||[]).filter(mz=>Number(mz.shotAtMs)>=frameStartMs&&Number(mz.shotAtMs)<frameEndMs).forEach(mz=>{
        const delaySec=Math.max(0,(Number(mz.shotAtMs)-frameStartMs)/1000/playbackRate);
        A.burst(mz.weaponFamily||mz.cls,mz.kill,mz.distance,mz.eventId||mz.id,delaySec,mz.shotAtMs,mz.pos);
      });
    }
    const presentationAudio=presentation?.drainAudio?.()||[];
    if(dispatchAudio&&A){presentationAudio.forEach(cue=>A.cue?.(cue.type,{eventId:cue.eventId,distance:cue.distance,position:cue.position,scheduleDelaySec:Math.max(0,Number(cue.delaySec)||0)/Math.max(.1,Number(speed)||1)}));if(frame.droppedBomb&&!previousFrame?.droppedBomb)A.cue?.("bomb-dropped",{eventId:`bomb-dropped-${frame.rnd}-${fIdx}`,distance:12,position:frame.c4pos});}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[fIdx,sim]);

  const seek=useCallback(v=>{beginFpsSeek(clamp(Math.floor(Number(v)||0),0,total-1),"seek");},[total,beginFpsSeek]);
  const selP=selected?frame?.players.find(p=>p.id===selected):null;
  const povShotActive=Boolean(cameraMode==="pov"&&selP&&!selP.dead&&frame?.muzzles?.some(muzzle=>muzzle.attackerId===selP.id));
  const matchOver=Boolean(sim.completed)&&fIdx>=total-1;
  const completeOnce=useCallback(()=>{
    if(replayMode||!onComplete||completedRef.current===matchResult.id)return false;
    completedRef.current=matchResult.id;onComplete(matchResult);releaseMountSimulation(sim);return true;
  },[matchResult,onComplete,sim,replayMode]);
  // Quick Finish 直接交付 simulator 已計算好的 MatchResult；不把 completion 綁在 final frame seek/render。
  const quickFinish=useCallback(()=>{
    if(replayMode||matchOver||quickCompleted||completedRef.current===matchResult.id)return;
    setQuickFinishing(true);setPlaying(false);setQuickCompleted(true);
    completeOnce();setQuickFinishing(false);
  },[matchOver,quickCompleted,matchResult,completeOnce,replayMode]);
  // Natural playback 到達合法終局時沿用同一個 exactly-once completion gate。
  useEffect(()=>{
    if(matchOver&&!replayMode){completeOnce();setQuickFinishing(false);}
  },[matchOver,completeOnce]);

  const exportReplay=async()=>{
    if(replayBusy)return;setReplayBusy(true);setReplayError("");
    try{await downloadCsReplay(replayEnvelope||createCsReplay(sim,{seed,mapKey,sceneVersion,teamName:T_NAME,opponentName:CT_NAME,rawResult:matchResult}));}
    catch(error){setReplayError(error.message||"無法匯出重播，請稍後重試。");}
    finally{setReplayBusy(false);}
  };
  const importReplay=async event=>{
    const file=event.target.files?.[0];event.target.value="";if(!file||replayBusy)return;
    setReplayBusy(true);setReplayError("");
    try{const saved=await loadCsReplayFile(file);onReplayModeChange?.(true,saved.metadata);setImportedReplay(saved);}
    catch(error){setReplayError(error.message||"無法讀取重播檔，原比賽仍可繼續。");}
    finally{setReplayBusy(false);}
  };
  const seekBySeconds=delta=>{
    const desired=Math.max(0,frame.roundSec+delta);
    const candidates=sim.frames.map((f,index)=>({f,index})).filter(({f})=>f.rnd===frame.rnd);
    const closest=candidates.reduce((a,b)=>Math.abs(b.f.roundSec-desired)<Math.abs(a.f.roundSec-desired)?b:a);
    seek(closest.index);
  };

  if(!frame)return null;
  const teamGroups=sceneVersion==="legacy"?{us:frame.players.filter(p=>p.side==="t"),enemy:frame.players.filter(p=>p.side==="ct")}:groupFpsTeams(frame);
  const viewportTools=(<>
{/* 音效開關（畫面內小按鈕） */}
          <button data-testid="cs-audio-toggle" data-cs-audio-state={soundOn?"on":"off"} onClick={()=>{const A=audioRef.current||(audioRef.current=makeAudio({pooled:sceneVersion!=="legacy",mobile,getListener:()=>liveRef.current.audioListener}));const enabling=!soundOn;if(!A)return;if(!enabling){if(sceneVersion!=="legacy")A.stopAll?.();setSoundOn(false);return;}A.markUnmuteRequest?.();A.resume().then(state=>{if(state==="running"){setSoundOn(true);void A.ready?.catch?.(error=>{if(import.meta.env?.DEV)console.warn("[FPS audio] preload failed",error);});}else setSoundOn(false);}).catch(error=>{setSoundOn(false);if(import.meta.env?.DEV)console.warn("[FPS audio] resume failed",error);});}} title={soundOn?"關閉音效":"開啟音效"} aria-label={soundOn?"關閉音效":"開啟音效"} style={{position:sceneVersion==="legacy"?"absolute":"static",top:8,right:8,zIndex:25,width:sceneVersion==="legacy"?34:44,height:sceneVersion==="legacy"?34:44,display:"flex",alignItems:"center",justifyContent:"center",background:soundOn?"rgba(56,189,248,0.22)":"rgba(13,17,25,0.85)",border:`1px solid ${soundOn?C.ct+"88":C.line}`,borderRadius:"50%",cursor:"pointer",fontSize:15,backdropFilter:"blur(6px)"}}>{soundOn?"🔊":"🔇"}</button>

          {/* 重新置中 */}
          <button data-testid="cs-camera-auto-director" onClick={()=>{selectPlayer(null);setCameraPreset(null);recenter.current&&recenter.current();}} style={{position:sceneVersion==="legacy"?"absolute":"static",minHeight:sceneVersion==="legacy"?undefined:44,bottom:8,right:8,zIndex:25,display:"flex",alignItems:"center",gap:4,background:"rgba(13,17,25,0.85)",border:`1px solid ${C.line}`,borderRadius:20,padding:"6px 12px",cursor:"pointer",color:"#cfd4dc",fontSize:10,fontWeight:700,backdropFilter:"blur(6px)"}}>
            <span style={{fontSize:11}}>◎</span> 重新置中
          </button>
  </>);
  const tType=TAC_TYPE[tacticT.type]||TAC_TYPE.default,cType=TAC_TYPE[tacticCT.type]||TAC_TYPE.default;

  return(
    <div className={sceneVersion!=="legacy"||replayMode?"fps-major-battle":undefined} style={{minHeight:"100vh",background:`radial-gradient(120% 80% at 50% 0%, #0c1018 0%, ${C.bg} 60%)`,fontFamily:"system-ui,-apple-system,sans-serif",color:"#e8ebf0",padding:"10px 10px 18px",userSelect:"none",overflowX:"hidden"}}>
      <div style={{maxWidth:mobile?430:1120,margin:"0 auto"}}>

        {/* 頂部比分列 */}
        <div style={{position:sceneVersion==="legacy"?"sticky":"relative",top:0,zIndex:40,background:"rgba(7,10,16,0.92)",backdropFilter:"blur(10px)",borderRadius:12,border:`1px solid ${C.line}`,padding:"8px 10px",marginBottom:8}}>
          <ScoreBar frame={frame} sim={sim} fIdx={fIdx}/>
        </div>

        {(sceneVersion!=="legacy"||replayMode)&&(
          <div className="fps-major-viewport-tools" data-testid="cs-major-viewport-tools" style={{color:GC.blueL,borderColor:GC.line}}>
            {sceneVersion!=="legacy"?<FpsTeamRadio messages={comms} side={cameraMode==="pov"?selP?.side:null} playing={playing} soundOn={soundOn} simulation={sim} seekNonce={seekNonce.current}/>:<details className="fps-major-radio" data-testid="cs-major-radio">
              <summary><span>📻 隊伍通訊</span><span className="fps-major-radio-latest">{comms.length?comms.at(-1).name+'：'+comms.at(-1).text:'目前沒有通訊'}</span></summary>
              <ol>{comms.map(c=><li key={c.id}><b style={{color:sideColor(c.side)}}>{c.name}</b>：{c.text}</li>)}</ol>
            </details>}
            {viewportTools}
          </div>
        )}
        {(sceneVersion!=="legacy"||replayMode)&&<FpsSavedFrameHud frame={frame} view={presentationView} casts={casts} revision={presentationRevision} replayMode={replayMode} playing={playing} matchOver={matchOver}/>}

        {/* 3D 戰術畫面 */}
        <div style={{position:"relative",width:"100%",paddingBottom:mobile?"118%":"56.25%",overflow:"visible",background:"#05070c"}}>
          <div data-esmo-fps-stable-canvas-region="1" style={{position:"absolute",inset:0,zIndex:0,contain:"layout paint",isolation:"isolate",overflow:"visible"}}>
            <div data-esmo-fps-canvas-layer="1" style={{position:"absolute",inset:0,zIndex:0}}>
              <FpsScene3D mapKey={mapKey} sceneVersion={sceneVersion} roster={effectiveRoster} liveRef={liveRef} onSelectPlayer={selectPlayer} onRecenterRef={recenter} onCameraPresetRef={cameraPresetRef}/>
            </div>
            <div data-esmo-fps-frame-decoration="1" aria-hidden="true" style={{position:"absolute",inset:0,zIndex:10,pointerEvents:"none",borderRadius:14,border:`1px solid ${C.line}`,boxShadow:"0 10px 50px rgba(0,0,0,0.7)"}} />
          </div>

          {/* LIVE */}
          {sceneVersion==="legacy"&&!replayMode&&<div style={{position:"absolute",top:9,left:"50%",transform:"translateX(-50%)",zIndex:20,display:"flex",alignItems:"center",gap:4,pointerEvents:"none"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:C.red,animation:"pls 1.1s infinite"}}/>
            <span style={{color:C.red,fontSize:9,fontWeight:900,letterSpacing:"0.12em",textShadow:"0 1px 3px black"}}>直播中</span>
          </div>}

          {/* 地圖名 + 戰術籤 */}
          <div style={{position:"absolute",top:8,left:8,zIndex:20,pointerEvents:"none"}}>
            <div style={{color:"rgba(255,255,255,0.55)",fontSize:9,fontWeight:800,letterSpacing:"0.08em",textShadow:"0 1px 2px black"}}>{MAPS[mapKey].name.toUpperCase()}</div>
          </div>

          {sceneVersion==="legacy"&&!replayMode&&<C5CPresentationHUD view={presentationView} frame={frame} revision={presentationRevision}/>}

          <div className="fps-pov-feedback" data-fps-pov-feedback aria-hidden="true"><div className="fps-pov-flash" /><div className="fps-pov-hit" /><span className="fps-pov-blind-label">視線受閃光影響</span></div>
          {cameraMode==="pov"&&selP&&!selP.dead&&(
            <div data-testid="cs-pov-reticle" data-cs-pov-shot-state={povShotActive?"active":"idle"} aria-label="第一人稱瞄準準星" style={{position:"absolute",left:"50%",top:"50%",width:36,height:36,transform:"translate(-50%,-50%)",zIndex:24,pointerEvents:"none",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.9))"}}>
              <span style={{position:"absolute",left:"50%",top:0,width:2,height:10,transform:"translateX(-50%)",borderRadius:2,background:povShotActive?C.gold:"#f8fafc"}} />
              <span style={{position:"absolute",left:"50%",bottom:0,width:2,height:10,transform:"translateX(-50%)",borderRadius:2,background:povShotActive?C.gold:"#f8fafc"}} />
              <span style={{position:"absolute",left:0,top:"50%",width:10,height:2,transform:"translateY(-50%)",borderRadius:2,background:povShotActive?C.gold:"#f8fafc"}} />
              <span style={{position:"absolute",right:0,top:"50%",width:10,height:2,transform:"translateY(-50%)",borderRadius:2,background:povShotActive?C.gold:"#f8fafc"}} />
              <span style={{position:"absolute",left:"50%",top:"50%",width:4,height:4,transform:"translate(-50%,-50%)",borderRadius:"50%",background:povShotActive?C.gold:"#ffffff",boxShadow:povShotActive?`0 0 12px ${C.gold}`:"0 0 4px rgba(255,255,255,0.8)"}} />
              {povShotActive&&<span data-testid="cs-pov-shot-feedback" aria-label="射擊視覺回饋" style={{position:"absolute",inset:-8,border:`2px solid ${C.gold}`,borderRadius:"50%",opacity:0.9,boxShadow:`0 0 18px ${C.gold}aa`}} />}
            </div>
          )}

          {/* 隊伍無線電（同隊溝通，配合實際戰況） */}
          {sceneVersion==="legacy"&&!replayMode&&comms.length>0&&(
            <div style={{position:"absolute",left:8,top:"36%",zIndex:21,display:"flex",flexDirection:"column",gap:3,pointerEvents:"none",maxWidth:"60%"}}>
              {comms.map(c=>{const col=sideColor(c.side);return(
                <div key={c.id} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(6,9,15,0.82)",borderLeft:`3px solid ${col}`,borderRadius:"0 6px 6px 0",padding:"2px 7px",fontSize:9,animation:"slideR 0.3s",alignSelf:"flex-start"}}>
                  <span style={{fontSize:8,opacity:0.8}}>📻</span>
                  <span style={{color:c.side==="ct"?C.ctL:C.tL,fontWeight:800,whiteSpace:"nowrap"}}>{c.name}</span>
                  <span style={{color:"rgba(255,255,255,0.9)"}}>{c.text}</span>
                </div>);})}
            </div>
          )}

          {/* 主播台 */}
          {!selP&&sceneVersion==="legacy"&&!replayMode&&(
            <div style={{position:"absolute",bottom:8,left:8,zIndex:20,display:"flex",flexDirection:"column",gap:3,pointerEvents:"none",maxWidth:"66%"}}>
              {casts.map(c=>(<div key={c.id} style={{background:"rgba(0,0,0,0.78)",borderLeft:`2px solid ${C.gold}`,borderRadius:"0 6px 6px 0",padding:"3px 8px",fontSize:9,color:"rgba(255,255,255,0.9)",animation:"slideR 0.3s",alignSelf:"flex-start"}}>{c.text}</div>))}
            </div>
          )}

          {sceneVersion==="legacy"&&viewportTools}

          {/* 選手詳情（精簡卡片，不擋畫面） */}
          {selP&&sceneVersion==="legacy"&&(
            <div style={{position:"absolute",bottom:8,left:8,width:"calc(100% - 16px)",maxWidth:290,minWidth:0,zIndex:30,background:"rgba(8,11,18,0.82)",border:`1px solid ${sideColor(selP.side)}77`,borderRadius:10,padding:"7px 9px",animation:"slideU 0.25s",backdropFilter:"blur(8px)"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0,flexWrap:"wrap"}}>
                <div style={{width:24,height:24,borderRadius:7,background:`${sideColor(selP.side)}2a`,border:`1px solid ${sideColor(selP.side)}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{selP.dead?"💀":"🎯"}</div>
                <div style={{flex:"1 1 120px",minWidth:0,maxWidth:"100%"}}>
                  <div style={{color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",gap:5}}>{selP.name}{selP.hasBomb?" 💣":""}{selP.stats&&<span style={{background:`linear-gradient(135deg,${C.gold},#d97706)`,color:"#1a1205",fontSize:8,fontWeight:900,borderRadius:4,padding:"0px 4px"}}>OVR {ovr(selP)}</span>}</div>
                  <div style={{color:C.gray2,fontSize:8,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>最擅長：{FPS_ROLE_ZH[selP.bestFpsRole]||selP.fpsRole||ROLE_ZH[selP.role]||selP.role}{selP.taskFpsRole&&` · 本場定位：${FPS_ROLE_ZH[selP.taskFpsRole]}`} · {selP.dead?"陣亡":stZh(selP.state)} · {GUNS[selP.gun]?.name}{!selP.dead&&" · 🎥"}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flex:"0 1 auto",minWidth:0,flexWrap:"wrap",justifyContent:"flex-end",marginLeft:"auto"}}>
                  <span style={{fontSize:9.5,fontWeight:800,color:"#e8ebf0",fontVariantNumeric:"tabular-nums"}}>{selP.k}<span style={{color:C.gray2}}>/</span>{selP.d}<span style={{color:C.gray2}}>/</span><span style={{color:C.gold}}>{selP.a||0}</span></span>
                  <span style={{fontSize:9,fontWeight:800,color:selP.hp>50?C.green:selP.hp>25?C.gold:C.red}}>{selP.dead?0:selP.hp}❤</span>
                  <span style={{fontSize:8.5,fontWeight:700,color:C.green}}>${selP.money}</span>
                  {selP.stats&&<button onClick={e=>{e.stopPropagation();setShowStats(s=>!s);}} style={{background:"rgba(255,255,255,0.08)",border:"none",borderRadius:5,padding:"1px 5px",cursor:"pointer",color:"#cfd4dc",fontSize:8,fontWeight:700}}>素質{showStats?"▴":"▾"}</button>}
                  <button onClick={e=>{e.stopPropagation();selectPlayer(null);}} style={{width:18,height:18,borderRadius:"50%",background:"rgba(255,255,255,0.08)",border:"none",cursor:"pointer",color:"#a1a1aa",fontSize:10,flexShrink:0}}>✕</button>
                </div>
              </div>
              {selP.stats&&showStats&&(
                <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:3}}>
                  {STAT_GROUPS.map(([gname,keys])=>(
                    <div key={gname} style={{display:"flex",alignItems:"center",gap:4}}>
                      <div style={{width:24,color:C.gold,fontSize:7,fontWeight:800,flexShrink:0}}>{gname}</div>
                      <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3}}>
                        {keys.map(([k,zh])=>{const v=selP.stats[k];const col=v>=85?"#34d399":v>=78?"#a3e635":v>=72?"#fbbf24":"#f87171";return(
                          <div key={k} style={{background:"rgba(255,255,255,0.04)",borderRadius:4,padding:"2px 4px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{color:C.gray2,fontSize:6.5,whiteSpace:"nowrap"}}>{zh}</span><span style={{color:col,fontSize:8.5,fontWeight:900,marginLeft:2}}>{v}</span>
                          </div>);})}
                      </div>
                    </div>
                  ))}
                  <div style={{color:C.gray2,fontSize:7,marginTop:1}}>FPS戰力 <b style={{color:"#e8ebf0"}}>{selP.fps}</b> · MOBA {selP.moba} · 體力 {selP.energy??selP.sta} · {selP.fpsRole}</div>
                </div>
              )}
              {cameraMode==="pov"&&<button data-testid="cs-exit-pov" onClick={event=>{event.stopPropagation();setCameraMode("tactical");setCameraPreset(null);}} style={{marginTop:6,width:"100%",padding:"5px 8px",borderRadius:6,border:`1px solid ${C.gold}66`,background:`${C.gold}16`,color:C.gold,fontSize:9,fontWeight:800,cursor:"pointer"}}>返回觀戰視角</button>}
            </div>
          )}

          {/* 賽末 */}
          {matchOver&&(
            <div style={{position:"absolute",inset:0,zIndex:55,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(4,6,12,0.7)",backdropFilter:"blur(4px)"}}>
              <div style={{textAlign:"center"}}>
                <div style={{color:sim.ctScore>sim.tScore?C.ctL:C.tL,fontSize:14,fontWeight:700,letterSpacing:"0.1em"}}>勝者</div>
                <div style={{color:"#fff",fontSize:26,fontWeight:900,margin:"4px 0"}}>{sim.ctScore>sim.tScore?CT_NAME:T_NAME}</div>
                <div style={{color:C.gray,fontSize:16,fontWeight:800}}><span style={{color:C.t}}>{sim.tScore}</span> : <span style={{color:C.ct}}>{sim.ctScore}</span></div>
                <button onClick={()=>{seek(0);setPlaying(true);}} style={{marginTop:12,background:`linear-gradient(135deg,${C.ct},#2563eb)`,border:"none",borderRadius:9,padding:"8px 20px",cursor:"pointer",color:"#fff",fontSize:12,fontWeight:800}}>↺ 重播</button>
              </div>
            </div>
          )}

        </div>

        {sceneVersion!=="legacy"&&selP&&(
          <div data-testid={cameraMode==="pov"?"cs-pov-player-panel":"cs-major-player-panel"} style={{marginTop:8,padding:10,border:`1px solid ${GC.line}`,borderRadius:10,background:GC.card,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:GC.blueL,fontWeight:800,fontSize:12,overflowWrap:"anywhere"}}>{selP.name}{selP.hasBomb?" 💣":""}</div>
                <div style={{color:GC.blueL,fontSize:10}}>{GUNS[selP.gun]?.name} · {selP.dead?"陣亡":`${selP.hp} HP`}{selP.weaponHandlingVersion===1&&` · ${selP.ammo} / ${selP.reserveAmmo}`}</div>
              </div>
              {cameraMode==="pov"&&<button data-testid="cs-exit-pov" onClick={()=>{setCameraMode("tactical");setCameraPreset(null);}} style={{minHeight:44,padding:"8px 12px",borderRadius:8,border:`1px solid ${C.gold}66`,background:`${C.gold}16`,color:C.gold,fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0}}>返回觀戰</button>}
              <button aria-label="關閉選手視角" onClick={()=>selectPlayer(null)} style={{width:44,height:44,borderRadius:8,border:`1px solid ${GC.line}`,background:"transparent",color:GC.blueL,cursor:"pointer",flexShrink:0}}>✕</button>
            </div>
            <details style={{marginTop:6,color:GC.blueL,fontSize:10}}>
              <summary style={{minHeight:44,display:"flex",alignItems:"center",cursor:"pointer"}}>選手資訊 · {selP.k}/{selP.d}/{selP.a||0}</summary>
              <div style={{overflowWrap:"anywhere"}}>最擅長：{FPS_ROLE_ZH[selP.bestFpsRole]||selP.fpsRole||ROLE_ZH[selP.role]||selP.role}{selP.taskFpsRole&&` · 本場定位：${FPS_ROLE_ZH[selP.taskFpsRole]}`} · {selP.dead?"陣亡":stZh(selP.state)}</div>
              {selP.stats&&<div>綜合能力 {ovr(selP)} · FPS戰力 {selP.fps} · 體力 {selP.energy??selP.sta}</div>}
              <div style={{padding:"4px 0",color:GC.green}}>現金 {fmtFpsMoney(selP.money)}</div>
              {selP.stats&&STAT_GROUPS.map(([gname,keys])=>(
                <div key={gname} style={{marginTop:6}}><b style={{color:C.gold}}>{gname}</b>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:6,marginTop:4}}>{keys.map(([key,label])=><span key={key}>{label} <b style={{color:GC.blueL}}>{selP.stats[key]}</b></span>)}</div>
                </div>
              ))}
            </details>
          </div>
        )}

        {sceneVersion==="legacy"?<C5CRoundHistory view={presentationView}/>:<div data-testid="cs-c5c-round-history" className="fps-major-rounds">{(frame.roundHist||[]).slice(0,frame.roundHistCount??frame.roundHist?.length??0).map((round,index)=><button key={index} title={`第 ${index+1} 回合 · ${round.winnerTeam==="us"?T_NAME:CT_NAME} 勝利`} onClick={()=>{seek(sim.frames.findIndex(f=>f.rnd===index));setPlaying(false);}} style={{border:`1px solid ${GC.line}`,borderRadius:6,background:GC.card,color:round.winnerTeam==="us"?GC.green:GC.red,fontSize:10}}>R{index+1} {round.winnerTeam==="us"?"勝":"負"}</button>)}</div>}
        {sceneVersion!=="legacy"&&frame.roundHistCount>0&&<details className="fps-major-round-details"><summary>逐回合十人數據</summary>{(frame.roundHist||[]).slice(0,frame.roundHistCount).map((round,index)=><details key={index}><summary>第 {index+1} 回合 · {round.winnerTeam==="us"?T_NAME:CT_NAME} 勝利</summary>{(round.roundStats||[]).map(row=><div key={row.id} className="fps-major-round-player"><span>{row.name} · {row.side==="ct"?"防守":"進攻"}</span><span>{row.k}/{row.d}/{row.a} · ADR {row.adr} · 道具傷害 {row.utilDmg}</span></div>)}</details>)}</details>}

        {/* 播放控制 */}
        <div data-testid="cs-playback-controls" style={{display:"flex",alignItems:"center",gap:5,marginTop:8,background:C.panel,borderRadius:11,border:`1px solid ${C.line}`,padding:"8px 9px",minWidth:0,flexWrap:"wrap"}}>
          {(()=>{const tb={width:28,height:30,borderRadius:7,background:"rgba(255,255,255,0.06)",border:"none",cursor:"pointer",color:"#cfd4dc",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0};
            const prevRound=()=>{const t=sim.frames.findIndex(f=>f.rnd===Math.max(0,frame.rnd-1));seek(t<0?0:t);};
            const nextRound=()=>{const t=sim.frames.findIndex(f=>f.rnd===frame.rnd+1);seek(t<0?total-1:t);};
            return(<>
              <button onClick={prevRound} title="上一局" style={tb}>⏮</button>
              <button onClick={()=>sceneVersion==="legacy"?seek(fIdx-5):seekBySeconds(-10)} title="倒退10秒" style={tb}>⏪</button>
              <button aria-label={playing?"暫停比賽播放":"播放比賽"} onClick={()=>{if(matchOver)seek(0);setPlaying(p=>!p);}} style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${C.ct},#2563eb)`,border:"none",cursor:"pointer",color:"#fff",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 3px 12px ${C.ct}55`}}>{playing?"❚❚":"▶"}</button>
              <button onClick={()=>sceneVersion==="legacy"?seek(fIdx+5):seekBySeconds(10)} title="快進10秒" style={tb}>⏩</button>
              <button onClick={nextRound} title="下一局" style={tb}>⏭</button>
            </>);})()}
          <div style={{flex:"1 1 130px",minWidth:120,maxWidth:"100%"}}>
            <input type="range" aria-label="比賽保存畫面時間軸" min={0} max={total-1} value={fIdx} onChange={e=>seek(+e.target.value)} style={{width:"100%",accentColor:C.ct,height:4}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:1}}>
              <span style={{color:C.gray2,fontSize:8}}>回合 {frame.rnd+1}</span>
              <span style={{color:C.gray2,fontSize:8}}>{fIdx+1}/{total} 格</span>
            </div>
          </div>
          <MatchSpeedControls rates={[1,2.4,4]} rate={speed} onRate={setSpeed} onQuickFinish={replayMode?null:quickFinish}
            quickFinishPending={quickFinishing} compact accent={C.ct} testId="cs-match-speed-controls" />
        </div>
        {(sceneVersion!=="legacy"||replayMode)&&<details className="fps-major-replay" style={{color:GC.blueL}}>
          <summary>保存與開啟重播{replayMode&&<span data-testid="cs-replay-mode" style={{marginLeft:8,color:GC.gold}}>保存重播 · 不影響比賽進度</span>}</summary>
          <div className="fps-major-replay-actions">
            <button data-testid="cs-replay-export" disabled={replayBusy} onClick={exportReplay} style={{background:GC.card,color:GC.blueL,border:`1px solid ${GC.line}`,borderRadius:8,padding:"6px 12px"}}>匯出本場重播</button>
            <label className="fps-major-replay-file" style={{borderColor:GC.line}}>開啟重播檔<input data-testid="cs-replay-import" aria-label="開啟保存重播檔" type="file" accept=".json,.gz,application/json,application/gzip" disabled={replayBusy} onChange={importReplay}/></label>
            {importedReplay&&!externalReplay&&<button data-testid="cs-replay-exit" onClick={()=>{onReplayModeChange?.(false);setImportedReplay(null);setReplayError("");}} style={{background:GC.card,color:GC.blueL,border:`1px solid ${GC.line}`,borderRadius:8,padding:"6px 12px"}}>返回原比賽</button>}
          </div>
          {replayBusy&&<div role="status">正在處理重播檔…</div>}
          {replayError&&<div data-testid="cs-replay-error" role="alert" style={{color:GC.red,overflowWrap:"anywhere"}}>{replayError}</div>}
        </details>}
        {quickCompleted&&!matchOver&&(
          <button data-testid="cs-quick-finish-terminal-seek" onClick={()=>seek(total-1)} style={{width:"100%",marginTop:5,padding:"7px 10px",borderRadius:8,border:`1px solid ${C.ct}66`,background:`${C.ct}18`,color:C.ctL,fontSize:10,fontWeight:800,cursor:"pointer"}}>
            查看終局畫面（最後一格）
          </button>
        )}

        {/* 工具列（賽前戰術已設定；地名常駐顯示；地圖隨機進入） */}
        <div style={{display:"flex",gap:6,marginTop:7,minWidth:0,flexWrap:"wrap"}}>
          {FPS_DEBUG_ENABLED&&<button onClick={()=>setShowRoutes(r=>!r)} style={toolBtn(showRoutes)}>🧭 路線</button>}
          <div style={{flex:"1 1 180px",minWidth:0,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",padding:"0 4px",color:C.gray2,fontSize:8.5,lineHeight:1.35}}>
            <span style={{color:C.t,fontWeight:800}}>{replayEnvelope?.rawResult.tactic?.ours||tacticT?.name}</span><span style={{opacity:0.5}}>vs</span><span style={{color:C.ct,fontWeight:800}}>{replayEnvelope?.rawResult.tactic?.theirs||lib.ct[ctIdx]?.name}</span>{!replayMode&&<span style={{opacity:0.55}}>· 四階段{preMatchLayout.openness==="open"?"開放布局":preMatchLayout.openness==="structured"?"固定布局":"自適應布局"}</span>}
          </div>
        </div>
        {/* C3 全場導播視角：切換只改相機，不改戰鬥資料或幾何契約 */}
        <div data-testid="cs-camera-presets" data-esmo-fps-camera-presets="1" style={{display:"flex",alignItems:"center",gap:5,marginTop:6,padding:"5px 6px",background:"rgba(13,17,25,0.78)",border:`1px solid ${C.line}`,borderRadius:9,minWidth:0,flexWrap:"wrap"}}>
          <span style={{color:C.gray2,fontSize:8,fontWeight:800,whiteSpace:"nowrap",flex:"0 0 auto"}}>戰場視角</span>
          {[['high','高位上帝'],['overview','全場總覽'],['tactical','側上方戰術']].map(([mode,label])=>(
            <button key={mode} data-testid={`cs-camera-preset-${mode}`} onClick={()=>{selectPlayer(null);setCameraMode("tactical");setCameraPreset(mode);cameraPresetRef.current?.(mode);}} style={{flex:"1 1 72px",minWidth:0,padding:"5px 4px",borderRadius:6,border:`1px solid ${cameraPreset===mode?C.ct+"99":C.line}`,background:cameraPreset===mode?`${C.ct}22`:"rgba(255,255,255,0.04)",color:cameraPreset===mode?C.ctL:"#cfd4dc",fontSize:8,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>{label}</button>
          ))}
          <button data-testid="cs-camera-preset-pov" disabled={!selP||selP.dead} onClick={()=>{if(!selP||selP.dead)return;setCameraPreset(null);setCameraMode("pov");}} style={{flex:"1 1 72px",minWidth:0,padding:"5px 4px",borderRadius:6,border:`1px solid ${cameraMode==="pov"?C.gold+"99":C.line}`,background:cameraMode==="pov"?`${C.gold}22`:"rgba(255,255,255,0.04)",color:cameraMode==="pov"?C.gold:selP&&!selP.dead?"#cfd4dc":C.gray,fontSize:8,fontWeight:800,cursor:selP&&!selP.dead?"pointer":"not-allowed",whiteSpace:"nowrap",opacity:selP&&!selP.dead?1:0.55}}>第一人稱</button>
        </div>

        {/* 雙隊名單 */}
        <div data-esmo-fps-team-roster="1" style={{display:"flex",gap:8,marginTop:8,minWidth:0}}>
          <div style={{flex:"1 1 0",minWidth:0,background:C.panel,borderRadius:11,border:`1px solid ${C.t}22`,padding:"8px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,padding:"0 2px"}}>
              <span style={{color:C.tL,fontSize:9,fontWeight:800}}>🟠 {T_NAME} · {teamGroups.us[0]?.side==="ct"?"防守":"進攻"}</span>
              <span style={{color:C.green,fontSize:8,fontWeight:700}}>💰 {sceneVersion==="legacy"?`$${teamGroups.us.reduce((s,p)=>s+(p.money||0),0)}`:fmtFpsMoney(teamGroups.us.reduce((s,p)=>s+(p.money||0),0))} · {buyZh(teamGroups.us[0]?.buyType)}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {teamGroups.us.map(p=><PlayerRow key={p.id} p={p} selected={selected===p.id} onClick={selectPlayer} major={sceneVersion!=="legacy"}/>)}
            </div>
          </div>
          <div style={{flex:"1 1 0",minWidth:0,background:C.panel,borderRadius:11,border:`1px solid ${C.ct}22`,padding:"8px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,padding:"0 2px"}}>
              <span style={{color:C.ctL,fontSize:9,fontWeight:800}}>🔵 {CT_NAME} · {teamGroups.enemy[0]?.side==="ct"?"防守":"進攻"}</span>
              <span style={{color:C.green,fontSize:8,fontWeight:700}}>💰 {sceneVersion==="legacy"?`$${teamGroups.enemy.reduce((s,p)=>s+(p.money||0),0)}`:fmtFpsMoney(teamGroups.enemy.reduce((s,p)=>s+(p.money||0),0))} · {buyZh(teamGroups.enemy[0]?.buyType)}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {teamGroups.enemy.map(p=><PlayerRow key={p.id} p={p} selected={selected===p.id} onClick={selectPlayer} major={sceneVersion!=="legacy"}/>)}
            </div>
          </div>
        </div>

        <div data-testid="cs-player-controls" data-cs-icon-contract={Object.keys(CS_PLAYER_CARD_ICON_HELP).join(",")} style={{textAlign:"center",color:C.gray2,fontSize:8,marginTop:10,lineHeight:1.5}}>
          拖曳旋轉 · 雙指拖移平移 · 雙指縮放 · 點選手聚焦 · 按「第一人稱」進入 POV · ⊕ 自動導播
        </div>
      </div>

      <style>{`
        @keyframes pls{0%,100%{opacity:1}50%{opacity:0.25}}
        @keyframes slideL{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideR{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideU{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pop{0%{opacity:0;transform:translateX(-50%) scale(0.6)}60%{transform:translateX(-50%) scale(1.08)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
        @keyframes c5cBannerIn{from{opacity:0;transform:translateX(-50%) translateY(-6px) scale(0.98)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        *{box-sizing:border-box}
        input[type=range]{-webkit-appearance:none;appearance:none;background:rgba(255,255,255,0.12);border-radius:9px;outline:none}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:${C.ct};cursor:pointer;box-shadow:0 0 8px ${C.ct}}
        input[type=range]::-moz-range-thumb{width:13px;height:13px;border:none;border-radius:50%;background:${C.ct};cursor:pointer}
        button{font-family:inherit}
        @media (max-width:420px){
          [data-esmo-fps-camera-presets] > span{flex:0 0 100%}
          [data-esmo-fps-camera-presets] > button{min-height:30px}
        }
        @media (max-width:360px){
          [data-esmo-fps-team-roster]{flex-direction:column}
        }
      `}</style>
    </div>
  );
}

function toolBtn(active){
  return {flex:1,padding:"7px 4px",borderRadius:8,border:`1px solid ${active?C.ct+"66":"transparent"}`,cursor:"pointer",background:active?`${C.ct}1c`:"rgba(255,255,255,0.04)",color:active?C.ctL:C.gray,fontSize:9.5,fontWeight:700};
}

return { EsportsFPS3D, buildMatchResult };
})();
const EsportsFPS3D = __FPS3D_MODULE.EsportsFPS3D;
const buildMatchResult = __FPS3D_MODULE.buildMatchResult;

export { EsportsFPS3D, buildMatchResult };
export { __FPS3D_SIM_PORT };
export default EsportsFPS3D;
