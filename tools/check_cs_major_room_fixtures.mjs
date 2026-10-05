#!/usr/bin/env node
// 真工位的同源實體、中央直廊與導航；不 mock 碰撞、不修改模擬輸出。
import fs from 'node:fs';
import { loadFpsMajorTestApi } from './lib/fpsMajorTestApi.mjs';
import { majorRoomPassage } from '../src/battle/fps/fpsMajorArchitecture.js';

const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
let pass=0,fail=0;
const ck=(name,ok,detail='')=>{ok?pass++:fail++;console.log(`${ok?'PASS':'FAIL'} ${name} ${detail}`);};
const near=(a,b)=>Math.abs(a-b)<1e-6;
for(const [mapKey,map] of Object.entries(api.MAPS)){
  const rooms=map.rooms.filter(r=>r.fixtures?.length),fixtures=rooms.flatMap(room=>room.fixtures.map(f=>({room,f}))),walls=api.c5a2SolidObstacles(map);
  const solids=walls.filter(w=>w.kind==='room-fixture');
  ck(`${mapKey} 工位資料有限、唯一且位於真房間內`,fixtures.length>0&&new Set(fixtures.map(({f})=>f.id)).size===fixtures.length&&fixtures.every(({room:r,f})=>
    ['x','y','w','h','hgt'].every(k=>Number.isFinite(f[k]))&&f.w>0&&f.h>0&&f.hgt>0&&f.hgt<r.height&&
    f.x>=r.x+.8-1e-6&&f.y>=r.y+.8-1e-6&&f.x+f.w<=r.x+r.w-.8+1e-6&&f.y+f.h<=r.y+r.h-.8+1e-6&&Boolean(f.asset&&f.form)));
  ck(`${mapKey} 正式障礙直接採同一工位 bounds`,solids.length===fixtures.length&&fixtures.every(({room,f})=>{
    const o=solids.find(w=>w.id===f.id);return o?.roomId===room.id&&['x','y','w','h','hgt'].every(k=>near(o[k],f[k]));
  }));
  ck(`${mapKey} 工位確實阻擋移動與正式 LOS`,fixtures.every(({f})=>{
    const center={x:f.x+f.w/2,y:f.y+f.h/2},a={x:f.x+.01,y:center.y},b={x:f.x+f.w-.01,y:center.y};
    return api.blocked(center,solids,api.PLAYER_R)&&api.lineBlocked(a,b,solids)&&!api.lineBlocked(a,b,[]);
  }));
  ck(`${mapKey} 保留4.8m中央直廊與角色半徑`,rooms.every(r=>{
    const vertical=r.entryAxis==='y',center=vertical?r.x+r.w/2:r.y+r.h/2,lo=center-r.doorWidth/2,hi=center+r.doorWidth/2;
    if(!r.fixtures.every(f=>vertical?f.x+f.w<=lo-.099||f.x>=hi+.099:f.y+f.h<=lo-.099||f.y>=hi+.099))return false;
    const start=(vertical?r.y:r.x)+.8,end=(vertical?r.y+r.h:r.x+r.w)-.8,half=r.doorWidth/2-api.PLAYER_R-.02;
    for(let s=0;s<=Math.ceil((end-start)/.2);s++)for(const offset of [-half,0,half]){
      const along=Math.min(end,start+s*.2),p=vertical?{x:center+offset,y:along}:{x:along,y:center+offset};
      if(api.blocked(p,walls,api.PLAYER_R))return false;
    }
    return true;
  }));
  ck(`${mapKey} 工位房雙門路線可達且不穿實體`,rooms.every(r=>{
    const passage=majorRoomPassage(r),route=api.buildNavigableRoute(passage,walls,api.PLAYER_R,new Map());
    if(route.length<3||passage.some(p=>api.blocked(p,walls,api.PLAYER_R)))return false;
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.2));
      for(let n=0;n<=steps;n++)if(api.blocked({x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps},walls,api.PLAYER_R-.001))return false;
    }
    return true;
  }));
}
console.log(`CS Major Room Fixtures: ${pass}/${pass+fail} PASS`);
if(fail)process.exitCode=1;
