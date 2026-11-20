import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
// 有界診斷：只保存 timeout 回合持包者每五秒及路線／交接事件，不保存完整 Replay。
const out=process.argv[2];
if(!out||fs.existsSync(out))throw Error('Unique output required');
const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8');
const api=await loadFpsMajorTestApi(source);
const roster=['t','ct'].flatMap(side=>api.ROSTER.filter(p=>p.side==='t').slice(0,5).map((p,i)=>({...structuredClone(p),id:`${side}${i+1}`,side,name:`${side}-${i}-${p.role}`,stats:Object.fromEntries(Object.keys(p.stats).map(k=>[k,70]))})));
const tactic=api.TACTICS_DB.dust2.t.find(t=>t.type==='default');
const sim=api.simulateFps('dust2',tactic,tactic,61001,roster,null,'major.v4');
const rounds=sim.roundHist.flatMap((r,i)=>{
 if(r.how!=='time')return [];
 const frames=sim.frames.filter(f=>f.rnd===i),samples=[];let previous='',bucket=-1;
 for(const f of frames){
  const carrier=f.players.find(p=>p.side==='t'&&!p.dead&&p.hasBomb);
  const state=JSON.stringify([carrier?.id,f.droppedBomb?.id,carrier?._routeSource,carrier?._routeKind,carrier?.attackStage?.stage,carrier?.routePoints?.at(-1)]);
  if(state===previous&&Math.floor(f.roundSec/5)===bucket)continue;
  previous=state;bucket=Math.floor(f.roundSec/5);
  samples.push({sec:f.roundSec,target:f.target,carrier:carrier?{id:carrier.id,pos:carrier.pos,state:carrier.state,stage:carrier.attackStage,kind:carrier._routeKind,source:carrier._routeSource,idx:carrier.routeIdx,route:carrier.routePoints,pushed:carrier._pushed}:null,drop:f.droppedBomb,aliveT:f.players.filter(p=>p.side==='t'&&!p.dead).length});
 }
 const events=frames.flatMap(f=>f.events||[]).filter(e=>String(e.type).startsWith('bomb-'));
 return [{round:i+1,result:r,samples,events:[...new Map(events.map(e=>[e.id,e])).values()],routes:(sim.navigationAudit?.routeBuilds||[]).filter(e=>e.round===i+1)}];
});
fs.writeFileSync(out,JSON.stringify({seed:61001,engineSha256:createHash('sha256').update(source).digest('hex'),score:sim.score,navigationKeys:Object.keys(sim.navigationAudit||{}),rounds},null,2),{flag:'wx'});
console.log('CS_DUNE_C4_TRACE RESULT=PASS timeoutRounds='+rounds.length);
