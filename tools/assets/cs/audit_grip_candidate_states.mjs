import fs from 'node:fs';
import {saveAuthorReport} from './authorReport.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
import {FPS_CHARACTER_ASSET_MANIFEST as manifest} from '../../../src/battle/fps/presentation/fpsCharacterAssets.js';
const [modulePath,out]=process.argv.slice(2);assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const {createFpsSupportGripPose}=await import(pathToFileURL(path.resolve(modulePath))),assets=await readFpsRigTestAssets(),cases=[];
try{
 for(const side of ['ct','t'])for(const state of ['HOLD','ROTATE','ENGAGE','RELOAD','HIT','DEAD']){
  const f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:side+'2',side,role:'support',gun:'scout'}),reference=assets.make({continuousClothing:true,importedWeapons:true,operatorId:side+'2',side,role:'support',gun:'scout'});
  const row={side,state,samples:0,failures:[],maximumReachMetres:0,minimumReachMarginMetres:Infinity};
  try{
   f.update({dt:0});f.c.gripPose.restore();f.c.gripPose=createFpsSupportGripPose({model:f.c.model,presentation:f.c.c2c});f.c.resetForRound(1);
   reference.update({dt:0});reference.c.gripPose.restore();reference.c.gripPose.apply=()=>{};reference.c.resetForRound(1);
   for(let i=0;i<24;i++){
    const p={...f.player,state:['RELOAD','HIT'].includes(state)?'HOLD':state,dead:state==='DEAD',hp:state==='DEAD'?0:state==='HIT'?80:100,shooting:state==='ENGAGE'&&i%8<4?1:0,weaponHandlingVersion:1,reloading:state==='RELOAD',reloadStartedAtMs:1000,reloadEndsAtMs:3000,velocityUnitsPerSec:state==='ROTATE'?3:0,velocity:{x:state==='ROTATE'?3:0,y:0}};
    const prev={...p,hp:i===0?100:p.hp,dead:i===0?false:p.dead,shooting:state==='ENGAGE'&&i>0&&(i-1)%8<4?1:0};
    const input={player:p,previousPlayer:prev,nextPlayer:p,roundTimeMs:1400+i*50,frameIndex:20+i,dt:i===0?0:.05,playbackActive:true};f.update(input);reference.update(input);row.samples++;
    const d=f.c.gripPose.diagnostics(),layers=f.c.poseLayers?.diagnostics();
    try{
     if(['HOLD','ROTATE','ENGAGE'].includes(state)){assert.equal(d.status,'contact');assert.equal(d.applied,true);assert(d.supportContactMetres<1e-4);row.maximumReachMetres=Math.max(row.maximumReachMetres,d.wristReachMetres);row.minimumReachMarginMetres=Math.min(row.minimumReachMarginMetres,d.armLengthMetres-d.wristReachMetres);}
     if(state==='HOLD')assert.equal(layers?.upperClip,manifest.clips.aim);
     if(state==='ROTATE')assert.equal(layers?.lowerClip,manifest.clips.run);
     if(state==='ENGAGE')assert.equal(layers?.upperClip,i%8<4?manifest.clips.fire:manifest.clips.aim);
     if(state==='RELOAD'){assert.equal(d.status,'animation-owned');assert.equal(layers?.upperClip,manifest.optionalClips.reload);}
     if(state==='HIT'&&i===0){assert.equal(d.status,'animation-owned');assert.equal(f.c.currentAction,manifest.clips.hit);}
     if(state==='DEAD'){assert.equal(d.status,'animation-owned');assert.equal(f.c.currentAction,manifest.clips.death);}
     for(const name of ['upperarm_r','lowerarm_r','hand_r','upperarm_l','lowerarm_l','hand_l']){
      const b=f.c.model.getObjectByName(name),r=reference.c.model.getObjectByName(name);assert.deepEqual(b.position.toArray(),r.position.toArray());assert.deepEqual(b.scale.toArray(),r.scale.toArray());assert(b.quaternion.toArray().every(Number.isFinite));
     }
     assert.deepEqual(f.c.c2c.weaponSockets.sniper.support.position.toArray(),[1.304199934,.0797999948,0]);
    }catch(e){row.failures.push({tick:i,diagnostics:d,poseLayers:layers,message:e.message});}
   }
  }finally{f.dispose();reference.dispose();}
  if(!Number.isFinite(row.minimumReachMarginMetres))row.minimumReachMarginMetres=null;cases.push(row);
 }
 assert(assets.unchanged());const failures=cases.reduce((n,c)=>n+c.failures.length,0),report={status:failures?'REJECTED_AUTHOR_CANDIDATE_NOT_PRODUCT_REGRESSION':'AUTHOR_SIX_STATE_REACH_AND_BONE_PASS_NOT_ART_GATE',candidateSha256:crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'),samples:cases.reduce((n,c)=>n+c.samples,0),sourceAssetsUnchanged:true,failures,cases};
 saveAuthorReport(out,report);process.exitCode=failures?1:0;
}finally{assets.dispose();}
