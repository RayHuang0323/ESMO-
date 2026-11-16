import fs from 'node:fs';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('Unique output required');
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const roster=['t','ct'].flatMap(side=>api.ROSTER.filter(p=>p.side==='t').slice(0,5).map((p,i)=>({...structuredClone(p),id:`${side}${i+1}`,side,name:`${side}-${i}-${p.role}`,stats:Object.fromEntries(Object.keys(p.stats).map(k=>[k,70]))})));
const tactic=api.TACTICS_DB.dust2.t.find(t=>t.type==='default');
const sim=api.simulateFps('dust2',tactic,tactic,61001,roster,null,'major.v4');
const rounds=sim.roundHist.map((r,i)=>({r,i})).filter(({r})=>r.how==='time').slice(0,3).map(({r,i})=>({round:i+1,result:{winnerSide:r.winnerSide,how:r.how},samples:[60,85,100,114].map(sec=>{const f=sim.frames.filter(f=>f.rnd===i&&f.roundSec<=sec).at(-1);return {sec:f.roundSec,target:f.target,planted:f.planted,players:f.players.filter(p=>p.side==='t').map(p=>({id:p.id,dead:p.dead,pos:p.pos,state:p.state,hasBomb:p.hasBomb,stage:p.tacticalStage,attackStage:p.attackStage,intent:p.tacticalIntent,routeTail:p.route?.slice(-2)}))};})}));
fs.writeFileSync(out,JSON.stringify({seed:61001,tactic:tactic.id,method:'One extra canonical trace, first 3 timeout rounds, four bounded samples each; no full frames written',rounds},null,2),{flag:'wx'});console.log('CS_DUNE_TIMEOUT_TRACE RESULT=PASS rounds='+rounds.length);
