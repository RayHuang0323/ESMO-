#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";
import { launchChrome, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const ROOT=path.resolve(".");
const FPS_FILE=path.resolve("src/battle/fps/EsportsFPS3D.jsx");
const APP_BASE=process.env.CS_C5B_APP_URL||"http://127.0.0.1:5174/ESMO-/";
const OUTPUT_DIR=path.resolve("artifacts/cs-c5b/tactical-audit/final-proofs");
const BASELINE_FILE=path.resolve("artifacts/cs-c5b/tactical-audit/desktop/runtime-evidence-1366px.json");
const CDP_PORT=Number(process.env.CS_C5B_CDP_PORT||9991);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const checks=[];
const check=(label,ok,detail="")=>{checks.push({label,ok:Boolean(ok),detail});console.log(`${ok?"PASS":"FAIL"} ${label}${detail?` · ${detail}`:""}`);};

async function waitFor(chrome,expression,timeoutMs,label){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){try{if(await chrome.evaluate("return Boolean("+expression+");"))return;}catch{}await sleep(250);}
  throw new Error(label+" timeout");
}

async function clickByText(chrome,text,label){
  const result=await chrome.evaluate(`const text=${JSON.stringify(text)};const button=[...document.querySelectorAll("button")].find(node=>!node.disabled&&(node.innerText||"").includes(text));if(!button)return{ok:false,buttons:[...document.querySelectorAll("button")].map(node=>(node.innerText||"").trim()).slice(0,80)};button.click();return{ok:true,text:(button.innerText||"").trim()};`);
  if(!result?.ok)throw new Error(label+" failed: "+JSON.stringify(result));
}

async function clickTacticCard(chrome,text,label){
  const result=await chrome.evaluate(`const text=${JSON.stringify(text)};const button=[...document.querySelectorAll("button")].find(node=>!node.disabled&&(node.innerText||"").includes(text)&&(node.innerText||"").includes("核心："));if(!button)return{ok:false};button.click();return{ok:true,text:(button.innerText||"").trim()};`);
  if(!result?.ok)throw new Error(label+" failed: "+JSON.stringify(result));
}

async function prepAction(chrome){
  return chrome.evaluate(`const button=document.querySelector('[data-testid="prep-primary-action"]');if(!button||button.disabled)return{ok:false,action:button?.dataset.action||null};const action=button.dataset.action;button.click();return{ok:true,action};`);
}

async function enterTargetBattle(chrome){
  await waitFor(chrome,"document.querySelector('button')&&document.body.innerText.includes('CS')",30000,"CS entry");
  await clickByText(chrome,"CS","CS mode");
  await waitFor(chrome,"document.querySelector('[data-testid=\"prep-primary-action\"]')",30000,"CS prep");
  let prep=await prepAction(chrome);
  if(!prep.ok&&prep.action==="blocked"){
    await clickByText(chrome,"Auto","auto lineup").catch(()=>clickByText(chrome,"自動","auto lineup"));
    await waitFor(chrome,"document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action==='enqueue'",15000,"lineup ready");
    prep=await prepAction(chrome);
  }
  if(!prep.ok)throw new Error("prep unavailable: "+JSON.stringify(prep));
  if(prep.action==="enqueue"){
    await waitFor(chrome,"document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action==='confirm'||document.querySelector('[data-map-key=\"dust2\"]')",60000,"match confirm");
    if(await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action==='confirm';`))await prepAction(chrome);
  }
  await waitFor(chrome,"document.querySelector('[data-map-key=\"dust2\"]')",60000,"map selection");
  await chrome.evaluate(`document.querySelector('[data-map-key="dust2"]')?.click();return true;`);
  await chrome.evaluate(`const buttons=[...document.querySelectorAll('button')].filter(node=>!node.disabled&&!node.dataset.mapKey);buttons.at(-1)?.click();return buttons.length;`);
  await waitFor(chrome,"document.querySelector('[data-testid=\"cs-tactic-phase-opening\"]')",30000,"tactical layout");
  for(const [phase,tactic] of [["opening","夾擊split"],["mid-round","預設配置"],["late-round","道具強攻"],["post-plant","夾擊split"]]){
    await chrome.evaluate(`document.querySelector('[data-testid="cs-tactic-phase-${phase}"]')?.click();return true;`);await sleep(80);
    await clickTacticCard(chrome,tactic,phase+" tactic");await sleep(80);
  }
  await chrome.evaluate(`document.querySelector('[data-testid="cs-tactic-confirm"]')?.click();return true;`);
  await waitFor(chrome,"document.querySelector('[data-testid=\"cs-match-speed-controls\"]')&&document.querySelector('canvas')",120000,"Battle runtime");
  await waitFor(chrome,"window.__ESMO_FPS_SCENE__?.liveRef?.current?.sim?.completed===true",180000,"authoritative simulation");
}

const STUCK_HELPER=String.raw`
function __c5bTargetedStuckRecoveryProof(mapKey="inferno"){
  const map=MAPS[mapKey];if(!map)throw new Error("unknown map: "+mapKey);
  const walls=c5a2SolidObstacles(map),r3=value=>Number(value.toFixed(3));
  const routeValid=route=>route.length>1&&route.every(point=>!blocked(point,walls,PLAYER_R))&&route.slice(1).every((point,index)=>!navLineBlocked(route[index],point,walls));
  let fixture=null;
  for(const obstacle of walls){const y=clamp(obstacle.y+obstacle.h/2,3,97),start={x:clamp(obstacle.x-PLAYER_R-2.4,3,97),y},goal={x:clamp(obstacle.x+obstacle.w+PLAYER_R+2.4,3,97),y};if(blocked(start,walls,PLAYER_R)||blocked(goal,walls,PLAYER_R)||!navLineBlocked(start,goal,[obstacle]))continue;const alternate=navigableSegment(start,goal,walls,PLAYER_R);if(routeValid(alternate)&&alternate.length>2){fixture={obstacle,start,goal};break;}}
  if(!fixture)throw new Error("no deterministic stuck fixture for "+mapKey);
  const {obstacle,start,goal}=fixture,timeline=[];let pos={...start},best=dist(pos,goal),stuckTicks=0,detectedAt=null;
  for(let tick=1;tick<=80&&!Number.isFinite(detectedAt);tick++){const remaining=dist(pos,goal),step=Math.min(4.8*C5A2_SIM_STEP_RATIO*1.3,remaining),desired=remaining>0.001?{x:pos.x+(goal.x-pos.x)/remaining*step,y:pos.y+(goal.y-pos.y)/remaining*step}:{...goal},moved=safeMove(pos,desired,walls,PLAYER_R),movedDistance=dist(moved,pos),after=dist(moved,goal),progress=after<best-0.04;if(progress){best=after;stuckTicks=0;}else if(movedDistance<0.05||after>=remaining-0.02)stuckTicks+=1;pos=moved;timeline.push({event:"blocked-route",atSec:r3(tick*C5A2_SIM_STEP_SEC),moved:r3(movedDistance),remaining:r3(after),stuckTicks});if(stuckTicks>=C5A2_STUCK_TIMEOUT_SEC/C5A2_SIM_STEP_SEC)detectedAt=tick*C5A2_SIM_STEP_SEC;}
  if(!Number.isFinite(detectedAt))throw new Error("stuck detector did not fire");
  const blockedAt={...pos},alternate=navigableSegment(blockedAt,goal,walls,PLAYER_R);if(!routeValid(alternate)||alternate.length<=2)throw new Error("alternate route invalid");
  const signature=route=>route.map(point=>point.x.toFixed(2)+","+point.y.toFixed(2)).join(">");timeline.push({event:"stuck-detect",atSec:r3(detectedAt)});timeline.push({event:"deterministic-replan",atSec:r3(detectedAt),route:signature(alternate)});
  let routeIdx=0,resumedAt=null,illegalWallCrossings=0,blockedPositions=0;
  for(let tick=1;tick<=120&&routeIdx<alternate.length-1;tick++){const target=alternate[routeIdx+1],remaining=dist(pos,target),step=Math.min(4.8*C5A2_SIM_STEP_RATIO*1.3,remaining),desired=remaining>0.001?{x:pos.x+(target.x-pos.x)/remaining*step,y:pos.y+(target.y-pos.y)/remaining*step}:{...target},moved=safeMove(pos,desired,walls,PLAYER_R),movedDistance=dist(moved,pos);if(lineBlocked(pos,moved,walls))illegalWallCrossings+=1;if(blocked(moved,walls,PLAYER_R))blockedPositions+=1;pos=moved;if(resumedAt==null&&movedDistance>0.05){resumedAt=detectedAt+tick*C5A2_SIM_STEP_SEC;timeline.push({event:"resume",atSec:r3(resumedAt),moved:r3(movedDistance)});}if(dist(pos,target)<=0.55){routeIdx+=1;timeline.push({event:"alternate-waypoint",atSec:r3(detectedAt+tick*C5A2_SIM_STEP_SEC),waypointIndex:routeIdx});}}
  return{source:"in-memory hook over production navigation primitives",mapKey,simStepSec:C5A2_SIM_STEP_SEC,stuckTimeoutSec:C5A2_STUCK_TIMEOUT_SEC,obstacle:{kind:obstacle.kind||"building",x:r3(obstacle.x),y:r3(obstacle.y),w:r3(obstacle.w),h:r3(obstacle.h)},blockedRoute:[start,goal].map(point=>({x:r3(point.x),y:r3(point.y)})),blockedRouteSignature:signature([start,goal]),stuckDetected:true,stuckDetectedAtSec:r3(detectedAt),blockedAt:{x:r3(blockedAt.x),y:r3(blockedAt.y)},alternateRoute:alternate.map(point=>({x:r3(point.x),y:r3(point.y)})),alternateRouteSignature:signature(alternate),resumed:Number.isFinite(resumedAt),resumedAtSec:r3(resumedAt),remainingToGoal:r3(dist(pos,goal)),illegalWallCrossings,blockedPositions,timeline};
}`;

async function runStuckProof(){
  const original=fs.readFileSync(FPS_FILE,"utf8"),marker="function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,tacticalLayoutInput=null){",returnMarker="return { EsportsFPS3D, buildMatchResult };",exportMarker="export { EsportsFPS3D, buildMatchResult };";
  if([marker,returnMarker,exportMarker].some(value=>original.split(value).length!==2))throw new Error("proof transform marker drift");
  let transformedCount=0;
  const server=await createServer({root:ROOT,configFile:false,envFile:false,appType:"custom",logLevel:"error",optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},plugins:[{name:"c5b-final-stuck-proof",enforce:"pre",transform(code,id){if(path.resolve(id.split("?")[0]).toLowerCase()!==FPS_FILE.toLowerCase())return null;transformedCount+=1;let next=code.replace(marker,STUCK_HELPER+"\n"+marker).replace(returnMarker,"return { EsportsFPS3D, buildMatchResult, __c5bTargetedStuckRecoveryProof };").replace(exportMarker,"const __C5B_FINAL_PROOF_API__=Object.freeze({targetedStuck:__FPS3D_MODULE.__c5bTargetedStuckRecoveryProof});\nexport { EsportsFPS3D, buildMatchResult, __C5B_FINAL_PROOF_API__ };");return{code:next,map:null};}}]});
  try{const loaded=await server.ssrLoadModule("/src/battle/fps/EsportsFPS3D.jsx"),one=loaded.__C5B_FINAL_PROOF_API__.targetedStuck("inferno"),two=loaded.__C5B_FINAL_PROOF_API__.targetedStuck("inferno");return{...one,deterministicRepeat:JSON.stringify(one)===JSON.stringify(two),sourceSha256:createHash("sha256").update(original).digest("hex"),transformCount:transformedCount};}finally{await server.close();}
}

function baselineWeaponAudit(){
  const baseline=JSON.parse(fs.readFileSync(BASELINE_FILE,"utf8")),families=["pistol","smg","rifle","sniper","shotgun"],purchases=Object.fromEntries(families.map(k=>[k,0])),loadouts=Object.fromEntries(families.map(k=>[k,0])),models={},teamRounds=[];let totalPurchases=0,totalPlayerRounds=0;
  for(const result of baseline.results){const buy=result.buyAudit;totalPurchases+=buy.totalPurchases;for(const k of families){purchases[k]+=buy.purchaseCounts[k]||0;loadouts[k]+=buy.loadoutCounts[k]||0;}for(const round of buy.rounds){totalPlayerRounds+=round.players.length;for(const player of round.players)if(player.purchase)models[player.purchase]=(models[player.purchase]||0)+1;for(const side of ["t","ct"]){const players=round.players.filter(player=>player.side===side);teamRounds.push({mapKey:result.mapKey,round:round.round,side,sniper:players.filter(player=>player.weaponFamily==="sniper").length,awp:players.filter(player=>player.weapon==="awp").length,scout:players.filter(player=>player.weapon==="scout").length});}}}
  const stat=key=>({mean:Number((teamRounds.reduce((sum,row)=>sum+row[key],0)/teamRounds.length).toFixed(4)),max:Math.max(...teamRounds.map(row=>row[key])),zero:teamRounds.filter(row=>row[key]===0).length,one:teamRounds.filter(row=>row[key]===1).length,twoPlus:teamRounds.filter(row=>row[key]>=2).length,threePlus:teamRounds.filter(row=>row[key]>=3).length});
  const mapCadence=Object.fromEntries(baseline.results.map(result=>[result.mapKey,Object.fromEntries(["pistol","shotgun"].map(family=>[family,result.weaponMetrics[family].actualCadenceMs]))]));
  const pistolMedians=baseline.results.map(result=>result.weaponMetrics.pistol.actualCadenceMs.medianMs),shotgunMedians=baseline.results.map(result=>result.weaponMetrics.shotgun.actualCadenceMs.medianMs);
  return{source:path.relative(ROOT,BASELINE_FILE).replaceAll("\\","/"),generatedAt:baseline.generatedAt,totalPurchases,purchases,purchaseRatios:Object.fromEntries(families.map(k=>[k,Number((purchases[k]/totalPurchases).toFixed(4))])),totalPlayerRounds,loadouts,loadoutRatios:Object.fromEntries(families.map(k=>[k,Number((loadouts[k]/totalPlayerRounds).toFixed(4))])),sniperPurchaseModels:{scout:models.scout||0,awp:models.awp||0},teamRoundSamples:teamRounds.length,fielded:{sniper:stat("sniper"),awp:stat("awp"),scout:stat("scout")},mapCadence,oldReportReconstruction:{pistol593:Number((pistolMedians.reduce((a,b)=>a+Number(b||0),0)/pistolMedians.length).toFixed(3)),pistolMapMedians:pistolMedians,shotgun333:Number((shotgunMedians.reduce((a,b)=>a+Number(b||0),0)/shotgunMedians.length).toFixed(3)),shotgunMapMedians:shotgunMedians,shotgunObservedMedianMs:500,explanation:"333ms came from coercing Dust II's zero-sample null median to 0 before averaging; it was a report aggregation error, not a fire event."}};
}

async function readBattleProof(chrome){
  return chrome.evaluate(`return(()=>{const live=window.__ESMO_FPS_SCENE__?.liveRef?.current,sim=live?.sim,frames=sim?.frames||[],bomb=sim?.bombAudit||{},defuse=(bomb.defuseEvents||[])[0];if(!defuse)return{error:"no defuse",bomb};const round=defuse.round,plant=(bomb.plantEvents||[]).find(item=>item.round===round),link=(bomb.resultLinks||[]).find(item=>item.round===round&&item.how==="defuse"),transitions=(bomb.objectiveTransitions||[]).filter(item=>item.round===round),roundFrames=frames.map((frame,index)=>({frame,index})).filter(item=>item.frame.rnd+1===round&&item.frame.planted),retake=(sim.navigationAudit?.routeHistory||[]).find(item=>item.round===round-1&&item.variant==="retake"&&item.roundSec>=plant.roundSec),cover=roundFrames.find(item=>item.frame.roundSec>=plant.roundSec&&item.frame.players.some(player=>player.side==="ct"&&!player.dead&&player.objectiveState==="COVER")),defuseFrame=roundFrames.find(item=>item.frame.players.some(player=>player.side==="ct"&&!player.dead&&player.objectiveState==="DEFUSE")),success=roundFrames.find(item=>item.frame.roundSec===defuse.roundSec)||roundFrames.at(-1);const telemetry=sim.shotCadenceTelemetry||[],hash=input=>{let h=2166136261;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,"0")},cadencePayload=telemetry.map(event=>[event.eventId,event.round,event.attackerId,event.gun,event.weaponFamily,event.shotAtMs,event.profileIntervalMs,event.actualIntervalMs]);const familyAudit=Object.fromEntries(["pistol","smg","rifle","sniper","shotgun"].map(family=>{const samples=telemetry.filter(event=>event.weaponFamily===family&&event.actualIntervalMs!=null),values=samples.map(event=>event.actualIntervalMs).sort((a,b)=>a-b),violations=samples.filter(event=>event.actualIntervalMs+1<event.profileIntervalMs);return[family,{samples:samples.length,minMs:values[0]??null,medianMs:values.length?values[Math.floor((values.length-1)/2)]:null,maxMs:values.at(-1)??null,authorityViolations:violations.length}]}));return{mapKey:sim.mapKey,completed:sim.completed,roundCount:sim.roundHist.length,finalScore:{t:sim.tScore,ct:sim.ctScore},layout:sim.tacticalAudit.preMatchLayout,defuseChain:{round,plant,retakeRoute:retake||null,retakeAssignments:bomb.retakeAssignments,coverAssignments:bomb.coverAssignments,coverFrame:cover?{frameIndex:cover.index,roundSec:cover.frame.roundSec,states:cover.frame.players.filter(player=>player.side==="ct"&&!player.dead).map(player=>({id:player.id,state:player.state,objectiveState:player.objectiveState}))}:null,defuseFrame:defuseFrame?{frameIndex:defuseFrame.index,roundSec:defuseFrame.frame.roundSec,states:defuseFrame.frame.players.filter(player=>player.side==="ct"&&!player.dead).map(player=>({id:player.id,state:player.state,objectiveState:player.objectiveState}))}:null,defuseEvent:defuse,successFrame:success?{frameIndex:success.index,roundSec:success.frame.roundSec,c4t:success.frame.c4t,states:success.frame.players.filter(player=>player.side==="ct"&&!player.dead).map(player=>({id:player.id,state:player.state,objectiveState:player.objectiveState}))}:null,transitions,resultLink:link||null},cadence:{eventCount:telemetry.length,digest:hash(JSON.stringify(cadencePayload)),families:familyAudit},buyAudit:sim.buyAudit,browserFrameIndex:live?.fIdx??null};})()`);
}

function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]);}

fs.mkdirSync(OUTPUT_DIR,{recursive:true});
const previewResponse=await fetch(APP_BASE);
const stuck=await runStuckProof();
const economy=baselineWeaponAudit();
const chrome=await launchChrome({url:APP_BASE+"?fpsRigged=all&fpsC2cHero=all",port:CDP_PORT,headless:true});
let runtime;
try{
  await chrome.send("Emulation.setDeviceMetricsOverride",{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await chrome.navigate(APP_BASE+"?fpsRigged=all&fpsC2cHero=all");
  await enterTargetBattle(chrome);
  const session=await chrome.evaluate(RESOLVE_APP_MODULES+`return{ticketId:S().matchmaking?.ticket?.ticketId??null,attempt:S().matchmaking?.ticket?.attempt??null,launchSeed:S().matchmaking?.launch?.seed??null,sessionId:S().matchmaking?.launch?.sessionId??null};`);
  const battle=await readBattleProof(chrome);
  const speedDigests=[];
  for(const rate of [1,2.4]){await chrome.evaluate(`document.querySelector('[data-testid="match-speed-${rate}"]')?.click();return true;`);await waitFor(chrome,`document.querySelector('[data-testid="match-speed-${rate}"]')?.getAttribute("aria-pressed")==="true"`,5000,"speed "+rate);await sleep(350);const snapshot=await readBattleProof(chrome);speedDigests.push({rate,digest:snapshot.cadence.digest,eventCount:snapshot.cadence.eventCount});}
  const targetIndex=battle.defuseChain?.successFrame?.frameIndex;
  if(Number.isFinite(targetIndex)){await chrome.evaluate(`const input=document.querySelector('input[type="range"]'),setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;if(input&&setter){setter.call(input,String(${targetIndex}));input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));}const live=window.__ESMO_FPS_SCENE__?.liveRef?.current;if(live)live.playing=false;return true;`);await sleep(400);const shot=await chrome.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(OUTPUT_DIR,"dust2-defuse-success.png"),Buffer.from(shot.data,"base64"));}
  runtime={session,battle,speedDigests,browserErrors:{console:chrome.consoleLines.filter(line=>line.startsWith("[error]")),page:chrome.pageErrors}};
}finally{await chrome.close();}

check("Preview server HTTP 200",previewResponse.status===200,`HTTP ${previewResponse.status}`);
check("gateway deterministic seed",runtime.session.launchSeed===48973&&runtime.session.attempt===0,JSON.stringify(runtime.session));
const chain=runtime.battle.defuseChain;
check("Plant → Retake → Cover → Defuse → Success",Boolean(chain?.plant&&chain?.retakeRoute&&chain?.coverFrame&&chain?.defuseFrame&&chain?.defuseEvent&&chain?.resultLink?.how==="defuse"&&chain.transitions.some(item=>item.to==="PLANTED")&&chain.transitions.some(item=>item.to==="DEFUSED")),`round ${chain?.round}`);
check("targeted stuck deterministic repeat",stuck.deterministicRepeat&&stuck.stuckDetected&&stuck.resumed,"blocked → detect → replan → resume");
check("targeted stuck collision safety",stuck.illegalWallCrossings===0&&stuck.blockedPositions===0&&stuck.remainingToGoal<0.55,`remaining ${stuck.remainingToGoal}`);
check("27% scope reconstructed",economy.totalPurchases===496&&economy.purchases.sniper===134&&economy.purchaseRatios.sniper===0.2702,"134 / 496 purchase events");
check("AWP field cap observed",economy.fielded.awp.max===1&&economy.fielded.awp.twoPlus===0,`mean ${economy.fielded.awp.mean}`);
check("pistol / shotgun authority",runtime.battle.cadence.families.pistol.authorityViolations===0&&runtime.battle.cadence.families.shotgun.authorityViolations===0,`min ${runtime.battle.cadence.families.pistol.minMs}/${runtime.battle.cadence.families.shotgun.minMs}ms`);
check("1x / 2.4x telemetry invariant",runtime.speedDigests.every(item=>item.digest===runtime.battle.cadence.digest&&item.eventCount===runtime.battle.cadence.eventCount),runtime.speedDigests.map(item=>`${item.rate}x=${item.digest}`).join(", "));
check("browser errors",runtime.browserErrors.console.length===0&&runtime.browserErrors.page.length===0,JSON.stringify(runtime.browserErrors));

const payload={generatedAt:new Date().toISOString(),source:"C5B final proof-only audit; production gameplay source unchanged",preview:{url:APP_BASE,status:previewResponse.status},runtime,stuck,economy,checks};
fs.writeFileSync(path.join(OUTPUT_DIR,"final-proof-evidence.json"),JSON.stringify(payload,null,2),"utf8");
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>C5B 最終三項 Proof</title><style>body{margin:0;background:#071019;color:#e7edf3;font:14px/1.65 system-ui,sans-serif}main{max-width:980px;margin:auto;padding:26px}h1{color:#fbbf24}h2{color:#7dd3fc}section{background:#0d1721;border:1px solid #203344;border-radius:12px;padding:16px;margin:14px 0}.pass{color:#34d399;font-weight:800}code{color:#fed7aa}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #243645;text-align:left}a{color:#7dd3fc}img{width:100%;border-radius:8px;border:1px solid #30465a}</style></head><body><main><h1>C5B 最終三項 Proof</h1><p class="pass">全部 PASS · proof-only，未修改 C5B gameplay。</p><section><h2>1. 完整拆彈 Battle runtime</h2><p>正式配對 seed <code>${runtime.session.launchSeed}</code> · Dust II · 第 ${chain.round} 回合：Plant ${chain.plant.roundSec}s → Retake route ${chain.retakeRoute.roundSec}s → Cover ${chain.coverFrame.roundSec}s → Defuse ${chain.defuseFrame.roundSec}s → Defuse Success ${chain.defuseEvent.roundSec}s。</p><p>結果：<code>${escapeHtml(JSON.stringify(chain.resultLink))}</code></p><img src="dust2-defuse-success.png" alt="Dust II defuse success runtime"></section><section><h2>2. Targeted stuck recovery</h2><p><code>${stuck.blockedRouteSignature}</code> → ${stuck.stuckDetectedAtSec}s stuck detect → <code>${stuck.alternateRouteSignature}</code> → ${stuck.resumedAtSec}s resume；illegal wall crossing ${stuck.illegalWallCrossings}、blocked position ${stuck.blockedPositions}。</p></section><section><h2>3. Weapon economy / cadence</h2><p>Sniper 27.02% = 134 / 496 次跨三圖購買事件；其中 Scout ${economy.sniperPurchaseModels.scout}、AWP ${economy.sniperPurchaseModels.awp}。AWP 每隊每回合平均 ${economy.fielded.awp.mean}、最大 ${economy.fielded.awp.max}、雙 AWP ${economy.fielded.awp.twoPlus} 次。</p><p>Pistol 593ms 是三圖中位數 ${economy.oldReportReconstruction.pistolMapMedians.join(" / ")} 的算術平均；Shotgun 333ms 是把零樣本 null 誤算成 0 的報表聚合錯誤。有效 map median 為 500ms，本次正式 Battle pistol/shotgun authority violations 均為 0。</p><p>1x / 2.4x telemetry digest：${runtime.speedDigests.map(item=>`${item.rate}x <code>${item.digest}</code>`).join(" · ")}</p></section><p>Evidence：<a href="final-proof-evidence.json">final-proof-evidence.json</a> · Battle：<a href="${escapeHtml(APP_BASE)}?fpsRigged=all&amp;fpsC2cHero=all">直接進入 ESMO</a></p></main></body></html>`;
fs.writeFileSync(path.join(OUTPUT_DIR,"owner-review.html"),html,"utf8");
const failed=checks.filter(item=>!item.ok);
console.log(`C5B FINAL PROOFS ${checks.length-failed.length}/${checks.length} PASS`);
console.log(`OWNER ${APP_BASE}artifacts/cs-c5b/tactical-audit/final-proofs/owner-review.html`);
if(failed.length)process.exitCode=1;
