// Advisory prototype only: derive from current analytics, preview with current
// Training calculator. Never imports Store, settles XP or writes player stats.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {calculateCourse,courseById} from '../src/data/playerModel.js';
const [input,output]=process.argv.slice(2);if(!input||!output||fs.existsSync(output))throw Error('Unique output required');
const save=JSON.parse(fs.readFileSync(input,'utf8')),before=JSON.stringify(save),proposals=[];
for(const player of save.players||[]){
 const samples=[];
 for(const result of (save.csHistory||[]).slice(0,10)){
  if(!result.mapIdentity||result.analytics?.version!==1)continue;
  const ours=(result.players||[]).filter(p=>p.playerId===player.id);if(ours.length!==1)continue;
  const sameNames=(result.players||[]).filter(p=>p.playerName===ours[0].playerName);if(sameNames.length!==1)continue;
  const analytics=(result.analytics.players||[]).filter(p=>p.teamId==='us'&&p.name===ours[0].playerName);if(analytics.length!==1)continue;
  const a=analytics[0];samples.push({matchId:result.matchId,mapIdentity:result.mapIdentity,role:a.role,shots:a.shots,hits:a.hits,openingKills:a.openingKills,openingDeaths:a.openingDeaths});
 }
 if(samples.length<3)continue;
 const shots=samples.reduce((s,r)=>s+r.shots,0),hits=samples.reduce((s,r)=>s+r.hits,0),firstKills=samples.reduce((s,r)=>s+r.openingKills,0),firstDeaths=samples.reduce((s,r)=>s+r.openingDeaths,0);
 const rule=player.energy<60?{course:'rest',reason:'目前體能不足，先用既有休息流程；不把疲勞誤判成永久能力不足'}:shots>=100&&hits/shots<.55?{course:'aim',reason:'最近正式戰報有至少100發射擊且命中比低於55%；是覆核線索，並非已證明槍法是唯一原因'}:firstDeaths-firstKills>=3?{course:'positioning',reason:'首死多於首殺至少3次；先覆核角色任務與交火位置，再考慮走位／視野訓練'}:null;
 if(!rule)continue;
 const preview=calculateCourse(player,rule.course);assert.ok(courseById(rule.course));
 proposals.push({playerId:player.id,playerName:player.name,courseId:rule.course,reason:rule.reason,alreadyTraining:Boolean(player.training),sampleCount:samples.length,evidence:samples,preview,followup:{matchCount:3,groupBy:['competitionMapId','layoutId','role','opponent roster strength','energy'],metrics:['hitPct with shots','openingDeaths / openingKills','role duty / actual events'],causality:'重新比較匹配情境；不宣稱勝率增加必由訓練造成'},authority:'Only Owner choosing existing Training action may create growthLog; this proposal has no settlement or persistence authority'});
}
assert.equal(JSON.stringify(save),before,'No player/progress/save mutation');
const result={status:'PASS',scope:'executable design prototype, not connected player-facing UI; thresholds proposed for review',source:'CsMatchResult.analytics v1 and calculateCourse; no second stats source',identity:'persistent playerId via result players; unique-name bridge for old analytics; duplicate names excluded',proposals};
fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});console.log(`CS_TRAINING_FOLLOWUP RESULT=PASS proposals=${proposals.length} inputUnchanged=true`);
