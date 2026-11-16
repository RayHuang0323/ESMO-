import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
import {applyCourse} from '../src/data/playerModel.js';
import {STAT_L2S,toShortStats} from '../src/battle/fps/fpsRoster.js';
const output=process.argv[2];
if(!output||fs.existsSync(output))throw Error('Unique output required');
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rows=[];
const training=process.argv.includes('--training');
for(const [map,scene] of (training?[['mirage','major.v3']]:[['mirage','major.v3'],['dust2','major.v4'],['inferno','major.v5']])){
 const roster=structuredClone(api.ROSTER);
 const target=roster[0];
 const player={age:20,potential:99,energy:100,stats:Object.fromEntries(Object.entries(STAT_L2S).map(([long,short])=>[long,target.stats[short]??50]))};
 const trained=applyCourse(player,'aim');
 for(const reflex of (training?['before-training','after-training']:[30,90])){
  const changed=structuredClone(roster);changed[0].stats=training?toShortStats(reflex==='after-training'?trained.stats:player.stats):{...target.stats,rxn:reflex};
  const sim=api.simulateFps(map,api.TACTICS_DB[map].t[0],api.TACTICS_DB[map].ct[0],61001,changed,null,scene);
  const episodes=(sim.reactionTelemetry||[]).filter(e=>e.actorId===target.id);
  rows.push({map,scene,seed:61001,actorId:target.id,reflex,...(training?{training:{before:player,after:trained},scope:'training base stats only; energy/fatigue normalized input, not a live career settlement'}:{}),rounds:sim.roundHist.length,roundDigest:digest(sim.roundHist),episodes:episodes.length,meanReactionDelayMs:episodes.length?episodes.reduce((s,e)=>s+e.reactionDelayMs,0)/episodes.length:null});
  console.log(JSON.stringify(rows.at(-1)));
 }
}
fs.writeFileSync(output,JSON.stringify({scope:'one seed, paired reflex change only; descriptive, no win-rate claim',rows},null,2),{flag:'wx'});
