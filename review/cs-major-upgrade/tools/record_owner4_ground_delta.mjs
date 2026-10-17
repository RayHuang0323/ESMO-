import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const old=JSON.parse(fs.readFileSync('review/cs-major-upgrade/profile-builds/owner4-pristine-lod-20261014/build-manifest.json','utf8'));
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();
assert.equal(files.length,old.sourceFingerprint.files);
const reversed=createHash('sha256'),current=createHash('sha256');let count=0;
for(const file of files){
 const bytes=fs.readFileSync(file);let prior=bytes;
 if(file==='src/battle/fps/EsportsFPS3D.jsx'){
  let text=bytes.toString('utf8');for(const exact of ['zone.visible=!major;','fill.visible=!major;']){assert.equal(text.split(exact).length,2);text=text.replace(exact,'');count++;}prior=Buffer.from(text);
 }
 reversed.update(file+'\0');reversed.update(prior);reversed.update('\0');current.update(file+'\0');current.update(bytes);current.update('\0');
}
const reverseSHA=reversed.digest('hex');assert.equal(reverseSHA,old.sourceFingerprint.sha256);assert.equal(count,2);
const report={scope:'All 105 FPS source/asset bytes equal the already verified LOD source after reversing exactly two Major-only marker visibility assignments; no simulation, pose, utility, asset, shader or control change',changedAssignments:['zone.visible=!major;','fill.visible=!major;'],priorSource:old.sourceFingerprint.sha256,reversedSource:reverseSHA,currentSource:current.digest('hex'),files:files.length,exactReverseMatches:true,reuse:'Prior valid contact/tactical/POV/action evidence retained; new actual site-circle/A-B-letter Browser, final build/formal/HTTP only'};
fs.writeFileSync('review/cs-major-upgrade/evidence/owner4-review-20261013/ground-only-source-delta.json',JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
