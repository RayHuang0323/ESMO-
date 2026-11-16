import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
const output=process.argv[2];
if(!output||fs.existsSync(output))throw Error('Unique output required');
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rows=[];
for(const [map,scene] of [['mirage','major.v3'],['dust2','major.v4'],['inferno','major.v5']]){
 const roster=structuredClone(api.ROSTER);
 const target=roster[0];
 for(const reflex of [30,90]){
  const changed=structuredClone(roster);changed[0].stats={...target.stats,rxn:reflex};
  const sim=api.simulateFps(map,api.TACTICS_DB[map].t[0],api.TACTICS_DB[map].ct[0],61001,changed,null,scene);
  const episodes=(sim.reactionTelemetry||[]).filter(e=>e.actorId===target.id);
  rows.push({map,scene,seed:61001,actorId:target.id,reflex,rounds:sim.roundHist.length,roundDigest:digest(sim.roundHist),episodes:episodes.length,meanReactionDelayMs:episodes.length?episodes.reduce((s,e)=>s+e.reactionDelayMs,0)/episodes.length:null});
  console.log(JSON.stringify(rows.at(-1)));
 }
}
fs.writeFileSync(output,JSON.stringify({scope:'one seed, paired reflex change only; descriptive, no win-rate claim',rows},null,2),{flag:'wx'});
