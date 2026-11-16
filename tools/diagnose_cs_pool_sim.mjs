import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
const [input,out]=process.argv.slice(2);
if(!input||!out||fs.existsSync(out))throw Error('Existing input and unique output required');
const args=JSON.parse(fs.readFileSync(input,'utf8'));
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const started=performance.now();
try{
 const sim=api.simulateFps(...args);
 const report={completed:sim.completed,rounds:sim.roundHist.length,score:[sim.tScore,sim.ctScore],ms:performance.now()-started,frames:sim.frames.length,inputSha:createHash('sha256').update(JSON.stringify(args)).digest('hex')};
 fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});console.log(report);
}catch(error){fs.writeFileSync(out,JSON.stringify({error:error.stack,ms:performance.now()-started},null,2),{flag:'wx'});throw error;}
