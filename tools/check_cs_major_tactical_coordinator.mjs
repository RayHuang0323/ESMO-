import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadFpsMajorTestApi } from './lib/fpsMajorTestApi.mjs';
import { fpsTacticalPlanningTarget, collectFpsTeamIntel, decideFpsTacticalIntent, selectFpsCrossfireAnchor, getFpsRoundOutcomeMetrics } from '../src/battle/fps/fpsTacticalCoordinator.js';

// Pure intent/data boundary checks. Canonical routes, real simulation and GPU
// verification belong to the combined Phase C acceptance gate.
let pass=0,fail=0;
function ck(name,fn){try{fn();pass++;console.log(`PASS ${name}`);}catch(error){fail++;console.error(`FAIL ${name}: ${error.stack}`);}}
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const actor=(id,side,pos={x:0,y:0},extra={})=>({id,side,teamId:side==='ct'?'team1':'team2',pos,hp:100,blindSec:0,dead:false,role:'entry',...extra});
const players=[actor('ct1','ct'),actor('ct2','ct',{x:3,y:0}),actor('t1','t',{x:12,y:0})];
const observation=(extra={})=>({side:'ct',targetId:'t1',pos:{x:8,y:0},observedAtSec:10,observerId:'ct2',...extra});
const collect=extra=>collectFpsTeamIntel({players,roundSec:12,walls:[],canSee:()=>false,...extra});
const intent=extra=>decideFpsTacticalIntent({player:players[0],intel:[],roundSec:12,planted:false,bombPos:{x:48,y:0},bombTimeSec:45,spawn:{x:-20,y:0},...extra});
const metrics=extra=>getFpsRoundOutcomeMetrics({players,kills:[],clutchEpisodes:[],winnerTeam:'team1',...extra});
const loss={roundSec:10,killerId:'t1',victimId:'ct2',killerSide:'t',victimSide:'ct'};
const revenge={roundSec:12,killerId:'ct1',victimId:'t1',killerSide:'ct',victimSide:'t'};

ck('Major CT安包前只用自己部署，秘密攻點變化不影響',()=>{
  for(const site of ['a','b'])for(const hiddenTarget of ['a','b',null,undefined]){
    const input=freeze({player:actor('ct1','ct'),tactic:{site},planted:false,target:hiddenTarget,sceneVersion:'major.v1'}),before=JSON.stringify(input);
    assert.equal(fpsTacticalPlanningTarget(input),site);
    assert.equal(JSON.stringify(input),before);
  }
});
ck('Major CT中路或未選部署不臆測對手包點',()=>{
  for(const tactic of [{site:'mid'},{},null])for(const hiddenTarget of ['a','b'])assert.equal(fpsTacticalPlanningTarget({player:actor('ct1','ct'),tactic,planted:false,target:hiddenTarget,sceneVersion:'major.v1'}),null);
});
ck('已安包、攻方與legacy保留真原target',()=>{
  for(const target of ['a','b',null])for(const patch of [
    {player:actor('ct1','ct'),planted:true,sceneVersion:'major.v1'},
    {player:actor('t1','t'),planted:false,sceneVersion:'major.v1'},
    {player:actor('ct1','ct'),planted:false,sceneVersion:'legacy'},
  ])assert.equal(fpsTacticalPlanningTarget({tactic:{site:target==='a'?'b':'a'},target,...patch}),target);
});

ck('不可視對手不生成情報、同隊不當敵人',()=>assert.deepEqual(collect(),[]));
ck('真可視對手保存來源與觀察當時位置',()=>{
  const input=freeze(structuredClone(players)),before=JSON.stringify(input);
  const result=collect({players:input,canSee:(observer,target)=>observer.id==='ct1'&&target.id==='t1'});
  assert.deepEqual(result,[observation({observerId:'ct1',pos:{x:12,y:0},observerPos:{x:0,y:0},observedAtSec:12})]);
  assert.notEqual(result[0].pos,input[2].pos);assert.notEqual(result[0].observerPos,input[0].pos);
  result[0].pos.x=999;result[0].observerPos.x=999;
  assert.equal(JSON.stringify(input),before);
});
ck('CT／T 各自只取得可見敵方情報',()=>{
  const result=collect({canSee:()=>true});
  assert.ok(result.some(i=>i.side==='ct'&&i.targetId==='t1'));
  assert.ok(result.some(i=>i.side==='t'&&i.targetId==='ct1'));
  assert.ok(result.every(i=>players.find(p=>p.id===i.targetId).side!==i.side));
});
ck('不可視時只保留舊坐標、不偷讀敵人現在位置',()=>{
  const prior=observation();const result=collect({previous:[prior]});
  assert.equal(result.length,1);assert.deepEqual(result[0].pos,{x:8,y:0});assert.equal(result[0].observedAtSec,10);assert.notEqual(result[0].pos,prior.pos);
});
ck('TTL 到界仍保留、過界立即清除',()=>{
  assert.equal(collect({previous:[observation()],roundSec:13}).length,1);
  assert.deepEqual(collect({previous:[observation()],roundSec:13.5}),[]);
});
ck('未來／未知／已死目標不留下記憶',()=>{
  assert.deepEqual(collect({previous:[observation({observedAtSec:13}),observation({targetId:'unknown'})]}),[]);
  assert.deepEqual(collect({players:players.map(p=>p.id==='t1'?{...p,dead:true}:p),previous:[observation()]}),[]);
});
ck('死亡角色不觀察或成為可視目標',()=>{
  const result=collect({players:players.map(p=>({...p,dead:true})),canSee:()=>true});assert.deepEqual(result,[]);
});
ck('同目標重見更新舊記憶而不累積重複',()=>{
  const result=collect({previous:[observation()],canSee:(a,b)=>a.id==='ct1'&&b.id==='t1'});
  assert.equal(result.length,1);assert.equal(result[0].observedAtSec,12);assert.deepEqual(result[0].pos,players[2].pos);
});
ck('情報收集不改 frozen 選手與舊記憶並傳同源牆體',()=>{
  const input=freeze({players:structuredClone(players),previous:[observation()],walls:[{x:5,y:0,w:1,h:2}],roundSec:12});const before=JSON.stringify(input);let calls=0;
  collectFpsTeamIntel({...input,canSee:(a,b,walls)=>{assert.equal(walls,input.walls);calls++;return false;}});
  assert.ok(calls>0);assert.equal(JSON.stringify(input),before);
});
ck('無情報保持 hold、沒有虛構 aim 或 route',()=>{
  const result=intent();assert.equal(result.kind,'hold');assert.equal(result.aim,null);assert.equal(result.routeTarget,null);assert.equal(result.targetId,null);assert.equal(result.source,'none');
});
ck('entry 使用真隊友情報產生 peek 意圖',()=>{
  const result=intent({intel:[observation()]});assert.equal(result.kind,'peek');assert.equal(result.source,'team-intel');assert.equal(result.targetId,'t1');assert.deepEqual(result.aim,{x:8,y:0});assert.equal(result.observedAtSec,10);assert.equal(result.routeTarget,null);
});
ck('自身可見來源與非 entry hold 有明確區別',()=>{
  const result=intent({player:{...players[0],role:'support'},intel:[observation({observerId:'ct1',observedAtSec:12})]});assert.equal(result.kind,'hold');assert.equal(result.source,'visible');assert.equal(result.pace,0);assert.equal(result.stopMovement,true);
  assert.equal(intent({intel:[observation({observerId:'ct1'})]}).source,'memory');
});
ck('過期／未來／另一隊情報不產追蹤',()=>{
  for(const data of [observation({observedAtSec:8}),observation({observedAtSec:13}),observation({side:'t'})])assert.equal(intent({intel:[data]}).targetId,null);
});
ck('殘血撤離已知威脅、只輸出意圖不移動選手',()=>{
  const player=freeze(actor('ct1','ct',{x:0,y:0},{hp:20})),result=intent({player,intel:[observation()]});assert.equal(result.kind,'retreat');assert.ok(result.routeTarget.x<player.pos.x);assert.deepEqual(player.pos,{x:0,y:0});
});
ck('致盲有可靠情報時撤退、無情報不猜牆後敵人',()=>{
  const player={...players[0],blindSec:2};assert.equal(intent({player,intel:[observation()]}).kind,'retreat');assert.equal(intent({player}).kind,'hold');
});
ck('CT 時間明顯不足時走出生點保槍意圖',()=>{
  const result=intent({planted:true,bombTimeSec:1});assert.equal(result.kind,'save');assert.deepEqual(result.routeTarget,{x:-20,y:0});
});
ck('充足拆彈時間、T方、缺包點不被錯標 save',()=>{
  assert.notEqual(intent({planted:true,bombTimeSec:45}).kind,'save');
  assert.notEqual(intent({player:players[2],planted:true,bombTimeSec:1}).kind,'save');
  assert.notEqual(intent({planted:true,bombTimeSec:1,bombPos:null}).kind,'save');
  assert.equal(intent({planted:true,bombTimeSec:20,travelDurationSec:15,defuseDurationSec:10}).kind,'save');
  assert.notEqual(intent({planted:true,bombTimeSec:25,travelDurationSec:15,defuseDurationSec:10}).kind,'save');
});
ck('死亡角色不瞄準／移動／偽造進攻',()=>{
  const result=intent({player:{...players[0],dead:true},intel:[observation()]});assert.equal(result.kind,'hold');assert.equal(result.aim,null);assert.equal(result.routeTarget,null);assert.equal(result.targetId,null);assert.equal(result.pace,0);
});
ck('意圖輸出獨立且 frozen 輸入完全不變',()=>{
  const input=freeze({player:structuredClone(players[0]),intel:[observation()],roundSec:12,planted:false,bombPos:{x:48,y:0},bombTimeSec:45,spawn:{x:-20,y:0}});const before=JSON.stringify(input),a=decideFpsTacticalIntent(input),b=decideFpsTacticalIntent(input);
  assert.deepEqual(a,b);a.aim.x=999;assert.equal(input.intel[0].pos.x,8);assert.equal(JSON.stringify(input),before);
});
ck('真隊友剛被擊殺且有可靠情報才走 trade 路線意圖',()=>{
  const input=freeze({player:structuredClone(players[0]),intel:[observation()],roundSec:12,planted:false,bombPos:{x:48,y:0},bombTimeSec:45,spawn:{x:-20,y:0},recentKills:[structuredClone(loss)]});
  const before=JSON.stringify(input),result=decideFpsTacticalIntent(input);
  assert.equal(result.kind,'trade');assert.equal(result.targetId,'t1');assert.equal(result.source,'team-intel');assert.equal(result.observedAtSec,10);
  assert.deepEqual(result.aim,{x:8,y:0});assert.deepEqual(result.routeTarget,{x:8,y:0});
  assert.notEqual(result.aim,input.intel[0].pos);assert.notEqual(result.routeTarget,input.intel[0].pos);assert.notEqual(result.aim,result.routeTarget);
  result.aim.x=998;result.routeTarget.x=999;assert.equal(JSON.stringify(input),before);
});
ck('過期／未來／友殺／無可靠情報均不產 trade',()=>{
  for(const kill of [{...loss,roundSec:6},{...loss,roundSec:13},{...loss,killerSide:'ct'},{...loss,victimSide:'t'}])assert.notEqual(intent({intel:[observation()],recentKills:[kill]}).kind,'trade');
  assert.notEqual(intent({recentKills:[loss]}).kind,'trade');
  assert.notEqual(intent({intel:[observation({observedAtSec:8})],recentKills:[loss]}).kind,'trade');
  assert.notEqual(intent({intel:[observation({targetId:'t2'})],recentKills:[loss]}).kind,'trade');
});
ck('致盲／殘血撤退與時間不足保槍優先於 trade',()=>{
  const data={intel:[observation()],recentKills:[loss]};
  for(const patch of [{blindSec:2},{hp:20}])assert.equal(intent({...data,player:{...players[0],...patch}}).kind,'retreat');
  const result=intent({...data,player:{...players[0],hp:20,blindSec:2},planted:true,bombTimeSec:1});
  assert.equal(result.kind,'save');assert.deepEqual(result.routeTarget,{x:-20,y:0});
});

const nodes={ASite:{x:10,y:10},aCover:{x:16,y:10},bCover:{x:10,y:18},cNear:{x:12,y:10},dFar:{x:43,y:10},ctSpawn:{x:10,y:20}};
const anchor=(player,extra={})=>selectFpsCrossfireAnchor({player,players,nodes,target:'A',...extra});
ck('crossfire 分配不同現有 site 鄰近節點',()=>{
  const a=anchor(players[0]),b=anchor(players[1]);assert.deepEqual(a,nodes.aCover);assert.deepEqual(b,nodes.bCover);assert.notDeepEqual(a,b);assert.notEqual(a,nodes.aCover);
  assert.deepEqual(anchor(players[0],{nodes:{ASite:nodes.ASite,aFarther:{x:30,y:10},zNearest:{x:15,y:10}}}),{x:15,y:10});
});
ck('節點不足／未知包點／未知選手回 null',()=>{
  assert.equal(anchor(players[1],{nodes:{ASite:nodes.ASite,aCover:nodes.aCover}}),null);
  assert.equal(anchor(players[0],{target:'unknown'}),null);assert.equal(anchor(actor('missing','ct')),null);
});
ck('crossfire 不使用spawn／過近／過遠節點，死亡隊友不佔位',()=>{
  const result=anchor(players[1],{players:players.map(p=>p.id==='ct1'?{...p,dead:true}:p)});assert.deepEqual(result,nodes.aCover);
  assert.equal(anchor(players[0],{nodes:{ASite:nodes.ASite,cNear:nodes.cNear,dFar:nodes.dFar,ctSpawn:nodes.ctSpawn}}),null);
  assert.deepEqual(anchor(players[0],{nodes:{ASite:nodes.ASite,atBoundary:{x:42,y:10}}}),{x:42,y:10});
  assert.equal(anchor(players[0],{nodes:{ASite:nodes.ASite,tooNear:{x:14,y:10}}}),null);
});
ck('crossfire 不修改 frozen 節點／選手，輸入順序不影響身份分配',()=>{
  const input=freeze({player:structuredClone(players[0]),players:structuredClone(players),nodes:structuredClone(nodes),target:'A'}),before=JSON.stringify(input);
  assert.deepEqual(selectFpsCrossfireAnchor(input),anchor(players[0],{players:[...players].reverse()}));assert.equal(JSON.stringify(input),before);
});
ck('真隊友死亡後敵方兇手被復仇才記 traded victim',()=>assert.deepEqual(metrics({kills:[loss,revenge]}).tradedIds,['ct2']));
ck('同 tick／超時／兇手未死亡不算 trade',()=>{
  for(const r of [{...revenge,roundSec:10},{...revenge,roundSec:15.5},{...revenge,victimId:'t2'}])assert.deepEqual(metrics({kills:[loss,r]}).tradedIds,[]);
});
ck('友殺不算 trade，重複證據不重複計 traded',()=>{
  assert.deepEqual(metrics({kills:[{...loss,killerSide:'ct'},revenge]}).tradedIds,[]);
  assert.deepEqual(metrics({kills:[loss,loss,revenge,revenge]}).tradedIds,['ct2']);
});
ck('末幀一人存活本身不虛構 clutch',()=>assert.equal(metrics({players:[players[0]]}).clutchId,null));
ck('真記錄1vN勝方存活才記 clutch，1v1也合法',()=>{
  for(const opponentCount of [1,3])assert.equal(metrics({clutchEpisodes:[{playerId:'ct1',side:'ct',opponentCount,startedAtSec:10}]}).clutchId,'ct1');
});
ck('無對手／敗方／死亡 episode 不記 clutch',()=>{
  for(const episode of [{playerId:'ct1',side:'ct',opponentCount:0,startedAtSec:10},{playerId:'t1',side:'t',opponentCount:2,startedAtSec:10}])assert.equal(metrics({clutchEpisodes:[episode]}).clutchId,null);
  assert.equal(metrics({players:players.map(p=>p.id==='ct1'?{...p,dead:true}:p),clutchEpisodes:[{playerId:'ct1',side:'ct',opponentCount:2,startedAtSec:10}]}).clutchId,null);
});
ck('outcome 指標只讀 frozen 真事件且不改 winner／kill',()=>{
  const input=freeze({players:structuredClone(players),kills:[loss,revenge],clutchEpisodes:[{playerId:'ct1',side:'ct',opponentCount:2,startedAtSec:10}],winnerTeam:'team1'}),before=JSON.stringify(input);
  assert.deepEqual(getFpsRoundOutcomeMetrics(input),{tradedIds:['ct2'],clutchId:'ct1'});assert.equal(JSON.stringify(input),before);
});

// Authored-map allocation checks only; no match simulation and no claimed
// gameplay coverage. The product design now includes nearby lanes out to 32
// units because the former 20-unit set cannot supply two distinct anchors.
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
for(const mapKey of ['mirage','dust2','inferno'])for(const target of ['a','b'])ck(`${mapKey}/${target} 正式節點至少兩個候選且不同actor不共anchor`,()=>{
  const mapNodes=api.MAPS[mapKey].nodes,site=mapNodes[`${target}Site`];
  assert.ok(site);
  const distance=point=>Math.hypot(point.x-site.x,point.y-site.y);
  const candidates=Object.entries(mapNodes).filter(([key,point])=>!key.endsWith('Spawn')&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&distance(point)>4&&distance(point)<=32)
    .sort(([a,ap],[b,bp])=>distance(ap)-distance(bp)||a.localeCompare(b));
  assert.ok(candidates.length>=2,`${mapKey}/${target} candidates=${JSON.stringify(candidates)}`);
  const team=[actor('t1','t'),actor('t2','t')];
  const assigned=team.map(player=>selectFpsCrossfireAnchor({player,players:team,nodes:mapNodes,target}));
  assert.deepEqual(assigned,candidates.slice(0,2).map(([,point])=>point));
  assert.notDeepEqual(assigned[0],assigned[1]);
  assert.ok(assigned.every(point=>distance(point)>4&&distance(point)<=32));
});

console.log(`CS Major Tactical Coordinator: ${pass}/${pass+fail} PASS`);
if(fail)process.exitCode=1;
