#!/usr/bin/env node
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createFpsMajorSegmentCache } from '../src/battle/fps/fpsMajorNavigationCache.js';
import { majorRoomPassage } from '../src/battle/fps/fpsMajorArchitecture.js';
import { loadFpsMajorTestApi } from './lib/fpsMajorTestApi.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let pass=0,fail=0;
const ck=(name,ok)=>{ok?pass++:fail++;console.log(`${ok?'PASS':'FAIL'} ${name}`);};
const walls=[{x:20,y:20,w:3,h:4}],R=1.35,a={x:10,y:10},b={x:30,y:30},route=[{...a},{x:15,y:35},{...b}];
const cache=createFpsMajorSegmentCache(walls,R);
cache.setSegment(a,b,route,walls,R);
const first=cache.getSegment(a,b,walls,R);
ck('精確端點命中且回傳獨立路線',hash(first)===hash(route)&&first!==route&&first[0]!==route[0]);
ck('浮點鄰近端點不量化合併',cache.getSegment({...a,x:10.000000000000002},b,walls,R)===undefined);
ck('反向路段不冒用正向結果',cache.getSegment(b,a,walls,R)===undefined);
first[1].x=999;
ck('使用端變更不污染快取',cache.getSegment(a,b,walls,R)[1].x===15);
route[1].x=888;
ck('輸入端變更不污染快取',cache.getSegment(a,b,walls,R)[1].x===15);
ck('另一場碰撞清單不能共用',cache.getSegment(a,b,[...walls],R)===undefined);
ck('不同碰撞半徑不能共用',cache.getSegment(a,b,walls,R+.01)===undefined);
cache.setSegment({...a,x:NaN},b,route,walls,R);
ck('非有限端點不寫入快取',cache.getStats().entries===1);
cache.setSegment({x:-0,y:10},b,[b],walls,R);
ck('正負零端點明確區分',cache.getSegment({x:0,y:10},b,walls,R)===undefined&&cache.getSegment({x:-0,y:10},b,walls,R)?.length===1);
const limited=createFpsMajorSegmentCache(walls,R,{maxEntries:2,maxPoints:8}),a2={x:11,y:10},a3={x:12,y:10};
limited.setSegment(a,b,[a,b],walls,R);limited.setSegment(a2,b,[a2,b],walls,R);limited.getSegment(a,b,walls,R);limited.setSegment(a3,b,[a3,b],walls,R);
ck('有界 LRU 保留近期命中',limited.getStats().entries===2&&limited.getSegment(a2,b,walls,R)===undefined&&limited.getSegment(a,b,walls,R)?.length===2);
const pointLimited=createFpsMajorSegmentCache(walls,R,{maxEntries:5,maxPoints:3});
pointLimited.setSegment(a,b,[a,b],walls,R);pointLimited.setSegment(a2,b,[a2,b],walls,R);
ck('路點總量上限會逐筆淘汰',pointLimited.getStats().points===2&&pointLimited.getStats().entries===1&&pointLimited.getSegment(a,b,walls,R)===undefined);
pointLimited.setSegment(a3,b,[a3,a3,a3,b],walls,R);
ck('單筆過大路段不占用快取',pointLimited.getStats().points===2&&pointLimited.getSegment(a3,b,walls,R)===undefined);
pointLimited.setSegment(a2,b,[b],walls,R);
ck('替換路段精確維護路點計數',pointLimited.getStats().points===1&&pointLimited.getStats().entries===1);
let invalid=0;for(const options of[{maxEntries:0},{maxPoints:0}])try{createFpsMajorSegmentCache(walls,R,options);}catch{invalid++;}
ck('非法容量明確拒絕',invalid===2);

const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8');
const marker='const segmentCache=sceneVersion==="legacy"?null:createFpsMajorSegmentCache(walls,PLAYER_R);';
if(source.split(marker).length!==2)throw new Error('major 快取入口格式變更，不能建立未快取的同源參照');
const api=await loadFpsMajorTestApi(source),reference=await loadFpsMajorTestApi(source.replace(marker,'const segmentCache=null;'));
for(const mapKey of Object.keys(api.MAPS)){
  const map=api.MAPS[mapKey],solid=api.c5a2SolidObstacles(map),oldSolid=reference.c5a2SolidObstacles(reference.MAPS[mapKey]);
  const segments=createFpsMajorSegmentCache(solid,api.PLAYER_R);
  const fixtures=Object.values(map.nodes).flatMap(target=>[[map.spawns.t,target],[map.spawns.ct,target]]);
  fixtures.push(...map.rooms.filter(room=>room.authored).map(majorRoomPassage));
  fixtures.push([map.spawns.t,map.nodes.mid,map.sites.a,map.sites.b]);
  const expected=fixtures.map(points=>reference.buildNavigableRoute(points,oldSolid,reference.PLAYER_R,new Map()));
  const run=()=>fixtures.map(points=>api.buildNavigableRoute(points,solid,api.PLAYER_R,new Map(),segments));
  ck(`${mapKey} 每個節點／雙入口／多段路線與未快取路點完全相同`,hash(run())===hash(expected));
  ck(`${mapKey} 重複路段命中且不改路線／不超容量`,hash(run())===hash(expected)&&segments.getStats().hits>0&&segments.getStats().points<=segments.getStats().maxPoints);
  if(!process.argv.includes('--quick')){
    const seed=505001,t=api.TACTICS_DB[mapKey].t[0],ct=api.TACTICS_DB[mapKey].ct[0];
    const current=api.simulateFps(mapKey,t,ct,seed,api.ROSTER,null,'major.v1');
    const before=reference.simulateFps(mapKey,reference.TACTICS_DB[mapKey].t[0],reference.TACTICS_DB[mapKey].ct[0],seed,reference.ROSTER,null,'major.v1');
    const resultOptions={seed,tacticT:t,tacticCT:ct};
    ck(`${mapKey} 完整 frames／roundHist／navigation／result 決定性保持`,current.completed===true&&hash(current)===hash(before)&&hash(api.buildMatchResult(current,resultOptions))===hash(reference.buildMatchResult(before,resultOptions)));
  }
}
console.log(`CS Major Navigation Cache: ${pass}/${pass+fail} PASS`);
if(fail)process.exitCode=1;
