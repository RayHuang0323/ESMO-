import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('Unique output required');
const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'),api=await loadFpsMajorTestApi(source);
const roster=['t','ct'].flatMap(side=>api.ROSTER.filter(p=>p.side==='t').slice(0,5).map((p,i)=>({...structuredClone(p),id:`${side}${i+1}`,side,name:`${side}-${i}-${p.role}`,stats:Object.fromEntries(Object.keys(p.stats).map(k=>[k,70]))})));
const sim=api.simulateFps('dust2',api.TACTICS_DB.dust2.t.find(t=>t.type==='default'),api.TACTICS_DB.dust2.t.find(t=>t.type==='default'),61001,roster,null,'major.v4');
const violations=[];let eligible=0;
for(let i=1;i<sim.frames.length;i++){
 const prev=sim.frames[i-1],f=sim.frames[i];if(f.rnd!==prev.rnd||f.planted||f.target!==prev.target)continue;
 for(const p of f.players){
  const a=prev.players.find(a=>a.id===p.id);
  if(!a||a.dead||p.dead||p.side!=='t'||!p.hasBomb||!a.hasBomb||!p.attackStage?.canAdvance||p.fakeStage==='approach'||a._routePlan?.kind!=='site-execute')continue;
  eligible++;
  if(p._routePlan?.routeRebuildReason==='phase-transition'&&p._routePlan?.kind!=='site-execute')violations.push({round:f.rnd+1,sec:f.roundSec,playerId:p.id,from:a._routePlan.kind,to:p._routePlan.kind,pos:p.pos,route:p.routePoints});
 }
}
const report={engineSha256:createHash('sha256').update(source).digest('hex'),seed:61001,eligible,violations,rounds:sim.roundHist.map((r,i)=>({round:i+1,winnerSide:r.winnerSide,how:r.how})),plants:sim.bombAudit.plantEvents,recoveries:sim.frames.flatMap(f=>f.events||[]).filter((e,i,a)=>e.type==='bomb-recovered'&&a.findIndex(x=>x.id===e.id)===i)};
fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});
console.log(`CS_C4_OBJECTIVE_ROUTE RESULT=${eligible>0&&!violations.length?'PASS':'PRODUCT_FAIL'} eligible=${eligible} violations=${violations.length}`);
process.exitCode=eligible>0&&!violations.length?0:1;
