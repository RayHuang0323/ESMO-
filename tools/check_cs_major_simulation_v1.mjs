#!/usr/bin/env node
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { loadFpsMajorTestApi } from "./lib/fpsMajorTestApi.mjs";
import { fpsMajorElevation } from "../src/battle/fps/fpsMajorTerrain.js";
import { majorRoomPassage } from "../src/battle/fps/fpsMajorArchitecture.js";

const BASE="1cf6472961528eeb3acfeb2558deadb4b425372d";
const source=fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx","utf8");
const baselineSource=execFileSync("git",["show",`${BASE}:src/battle/fps/EsportsFPS3D.jsx`],{encoding:"utf8",maxBuffer:4*1024*1024,timeout:15000,windowsHide:true});
const api=await loadFpsMajorTestApi(source),baseline=await loadFpsMajorTestApi(baselineSource);
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
let pass=0,fail=0;
const ck=(name,ok,detail="")=>{ok?pass++:fail++;console.log(`${ok?"PASS":"FAIL"} ${name} ${detail}`);};
for(const key of Object.keys(api.MAPS)){
  const map=api.MAPS[key],walls=api.c5a2SolidObstacles(map);
  ck(`${key} 節點與 Bombsite／spawn 不在碰撞體內`,[...Object.values(map.nodes),...Object.values(map.sites),...Object.values(map.spawns)].every(p=>!api.blocked(p,walls,api.PLAYER_R)));
  const routes=Object.entries(map.nodes).map(([name,target])=>{const route=api.buildNavigableRoute([map.spawns.t,target],walls,api.PLAYER_R,new Map());if(route.length<2)console.log("無法抵達節點",key,name,target);return route;});
  ck(`${key} 路線可達且沿線不穿牆`,routes.every(route=>{
    if(route.length<2)return false;
    for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.5);for(let n=0;n<=steps;n++){const t=n/Math.max(1,steps);if(api.blocked({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},walls,api.PLAYER_R-.001))return false;}}
    return true;
  }));
  const rooms=map.rooms.filter(r=>r.authored);
  ck(`${key} 真實廠房雙入口可通行且路線穿過室內`,rooms.length>0&&rooms.every(room=>{
    const passage=majorRoomPassage(room),route=api.buildNavigableRoute(passage,walls,api.PLAYER_R,new Map());
    return room.doorWidth>=api.PLAYER_R*2+.5&&route.length>=3&&passage.every(p=>!api.blocked(p,walls,api.PLAYER_R))&&route.some(p=>p.x>room.x+1&&p.x<room.x+room.w-1&&p.y>room.y+1&&p.y<room.y+room.h-1);
  }));
  const t=api.TACTICS_DB[key].t[0],ct=api.TACTICS_DB[key].ct[0],seed=505001;
  console.log(`RUN ${key} original／legacy／same-seed`);
  const legacy=api.simulateFps(key,t,ct,seed,api.ROSTER,null,"legacy");
  const before=baseline.simulateFps(key,baseline.TACTICS_DB[key].t[0],baseline.TACTICS_DB[key].ct[0],seed,baseline.ROSTER);
  ck(`${key} 舊比賽逐格／選手／回合與正式 baseline 相同`,hash([legacy.frames,legacy.players,legacy.roundHist])===hash([before.frames,before.players,before.roundHist]));
  const current=api.simulateFps(key,t,ct,seed,api.ROSTER,null,"major.v1");
  const repeat=api.simulateFps(key,t,ct,seed,api.ROSTER,null,"major.v1");
  ck(`${key} 新場景同 seed 決定性`,hash(current)===hash(repeat));
  ck(`${key} 新場景正式完成且非舊布局`,current.completed===true&&current.sceneVersion==="major.v1"&&hash(current.frames)!==hash(legacy.frames),`score=${current.tScore}:${current.ctScore}, frames=${current.frames.length}`);
  ck(`${key} 10 人位置／地形高度同源且無幾何穿牆`,current.frames.every(f=>f.players.length===10&&f.players.every(p=>Number.isFinite(p.pos.x)&&Number.isFinite(p.pos.y)&&p.elevation===fpsMajorElevation(key,p.pos)))&&["blockedPositions","wallSegmentCrossings","nonFinitePositions","teleportViolations"].every(field=>current.movementAudit[field]===0));
  const oldResult=api.buildMatchResult(legacy,{seed,tacticT:t,tacticCT:ct}),oldBaseline=baseline.buildMatchResult(before,{seed,tacticT:baseline.TACTICS_DB[key].t[0],tacticCT:baseline.TACTICS_DB[key].ct[0]});
  ck(`${key} 舊結果 id 與資料保持相容`,hash(oldResult)===hash(oldBaseline));
}
console.log(`CS Major Simulation v1: ${pass}/${pass+fail} PASS`);
if(fail)process.exitCode=1;
