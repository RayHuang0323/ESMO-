import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadFpsMajorTestApi} from '../../../tools/lib/fpsMajorTestApi.mjs';
const root='review/cs-major-upgrade/evidence/owner4h-review-20261018/';
fs.mkdirSync(root,{recursive:true});
if(process.argv[2]==='snapshot'){
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsPrepScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/screens/fps/CsProfessionalReport.jsx','src/screens/fps/csProfessionalReport.css','src/platform/contracts/CsMatchResult.js','src/data/playerModel.js','src/platform/contracts/matchSquad.js','src/screens/manage/RosterScreen.jsx','src/screens/manage/PlayerDetailScreen.jsx','public/assets/fps','public/audio/cs'],{encoding:'utf8'}).trim().split(/\r?\n/).sort();
 const hash=createHash('sha256');for(const f of files){hash.update(f+'\0');hash.update(fs.readFileSync(f));hash.update('\0');const dest=root+'before-source/'+f;fs.mkdirSync(dest.slice(0,dest.lastIndexOf('/')),{recursive:true});fs.writeFileSync(dest,fs.readFileSync(f),{flag:'wx'});}
 const sha=hash.digest('hex');if(sha!=='cf3d243e7f0f386fcd4bc79e44f3810b70aeea61e673d8db8754dca7021559d0')throw Error('Owner4G source changed');
 fs.writeFileSync(root+'before-source-proof.json',JSON.stringify({sha256:sha,files,exactOwner4G:true,at:new Date().toISOString()},null,2),{flag:'wx'});console.log(sha);process.exit(0);
}
