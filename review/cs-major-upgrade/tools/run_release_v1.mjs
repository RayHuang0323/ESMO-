import fs from 'node:fs';
import {spawn} from 'node:child_process';
const phase=process.argv[2];
const root='review/cs-major-upgrade/evidence/release-v1-20261018/';
const h='review/cs-major-upgrade/evidence/owner4h-review-20261018/';
fs.mkdirSync(root,{recursive:true});fs.mkdirSync(h,{recursive:true});
const phases={
 cs:[
  ...['mirage','dust2','inferno'].flatMap(map=>['505001','505002'].map(seed=>({id:`match-${map}-${seed}`,script:'review/cs-major-upgrade/tools/audit_owner4h_match.mjs',args:['after-final-r2',map,seed]}))),
  {id:'cs-cpu',script:'tools/verify.mjs',args:['--only=cs_owner4f_rules,cs_owner4d_closure,cs_owner4e_pure,cs_major_tactical_coordinator,cs_major_animation_lifecycle,cs_major_weapon_handling,cs_major_weapon_pose_layers,cs_major_audio_pool,cs_major_audio_playback,cs_major_utility_rules,cs_major_tactical_runtime,r63_competition_integration'],env:{ESMO_CS_RUNTIME_FIXTURE:h+'runtime-final-r2-sim.json.gz',ESMO_CS_TACTICAL_REPORT:h+'runtime-final-r2.json',ESMO_CS_OWNER4F_RULES_REPORT:root+'f-rules.json',ESMO_CS_OWNER4D_REPORT:root+'d-rules.json'}},
  ...['perception','causal_vision','hit','pov_visibility','reservations'].map(name=>({id:name,script:`tools/check_cs_owner4h_${name}.mjs`,args:[root+name+'.json']})),
  {id:'saved-replay',script:'review/cs-major-upgrade/tools/check_owner4h_saved_replay.mjs',args:['r2']},
  {id:'replay-result',script:'tools/verify.mjs',args:['--only=cs_major_replay_ui,cs_major_replay_input'],env:{ESMO_CS_D_FIXTURE:h+'saved-full-mirage-r2.replay.json.gz',ESMO_CS_D_RAW_RESULT:h+'saved-full-mirage-r2.raw-result.json'}},
 ],
 moba:[{id:'roster',script:'tools/verify.mjs',args:['--only=cs_roster_v1_r56,roster_ui_r58,roster_ui_r581,roster_ui_r582']},{id:'moba-basic',script:'tools/verify.mjs',args:['--only=progress25,experience26,regress,regress2,runtime29,presentation29b2,controls29b3']}],
 build:[{id:'build',script:'node_modules/vite/bin/vite.js',args:['build']}],
};
// 保留首次缺少工具必要 report 參數的 HARNESS_FAIL，只重跑該段；其餘 CPU 段落不重做。
phases['cs-rest']=[{id:'cs-pure-env-retry',script:'tools/verify.mjs',args:['--only=cs_owner4e_pure'],env:{ESMO_CS_OWNER4E_REPORT:root+'e-pure.json'}},...phases.cs.slice(7)];
if(!phases[phase])throw Error('Explicit phase required: cs/cs-rest/moba/build');
const stateFile=root+phase+'-steps.json';
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):[];
function preserveVerifier(label){
 const file='tools/.verify-state.json';if(!fs.existsSync(file))return;
 const target=root+label+'-verify-state.json';if(fs.existsSync(target))return;
 fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);
 for(const name of fs.readdirSync('tmp/verify-logs').filter(n=>n.endsWith('.log')))fs.copyFileSync('tmp/verify-logs/'+name,root+label+'-'+name,fs.constants.COPYFILE_EXCL);
}
if(phase==='cs-rest')preserveVerifier('cs-cpu-original');
for(const step of phases[phase]){
 if(state.some(r=>r.id===step.id&&r.code===0))continue;
 const base=root+step.id;if(fs.existsSync(base+'.stdout.log'))throw Error('Refuse previous failed evidence overwrite: '+step.id);
 const started=new Date().toISOString();console.log(started+' START '+step.id);
 const stdout=fs.openSync(base+'.stdout.log','wx'),stderr=fs.openSync(base+'.stderr.log','wx');
 const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[step.script,...(step.args||[])],{env:{...process.env,...step.env},stdio:['ignore',stdout,stderr],windowsHide:true});p.on('error',reject);p.on('close',(code,signal)=>resolve({code,signal}));});
 fs.closeSync(stdout);fs.closeSync(stderr);if(step.script==='tools/verify.mjs')preserveVerifier(step.id);state.push({id:step.id,script:step.script,args:step.args||[],started,finished:new Date().toISOString(),...result});fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
 console.log(JSON.stringify(state.at(-1)));if(result.code!==0){process.exitCode=result.code??2;break;}
}
