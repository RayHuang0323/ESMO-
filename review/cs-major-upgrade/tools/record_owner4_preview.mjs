import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const phase=process.argv[2]||'owner4-pristine-20261013';
assert.ok(['owner4-pristine-20261013','owner4-pristine-lod-20261014','owner4-pristine-final-20261014'].includes(phase));
const root='review/cs-major-upgrade/profile-builds/'+phase;
const out='review/cs-major-upgrade/evidence/owner4-review-20261013/'+(phase==='owner4-pristine-20261013'?'preview-proof.json':phase==='owner4-pristine-lod-20261014'?'preview-lod-final-proof.json':'preview-complete-proof.json');
assert.ok(!fs.existsSync(out),'Do not overwrite preview evidence');
const sha=x=>createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(fs.readFileSync(root+'/build-manifest.json','utf8'));
assert.equal(manifest.probeVersion,null);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();
const source=createHash('sha256');for(const f of files){source.update(f+'\0');source.update(fs.readFileSync(f));source.update('\0');}
assert.equal(source.digest('hex'),manifest.sourceFingerprint.sha256);assert.equal(files.length,manifest.sourceFingerprint.files);
const url='http://localhost:5183/ESMO-/';
const response=await fetch(url,{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);
const html=Buffer.from(await response.arrayBuffer());assert.deepEqual(html,fs.readFileSync(root+'/index.html'));
const bundle=createHash('sha256'),scripts=[];
for(const name of fs.readdirSync(root+'/assets').filter(f=>f.endsWith('.js')).sort()){
 const bytes=fs.readFileSync(path.join(root,'assets',name));bundle.update(name+'\0');bundle.update(bytes);
 const r=await fetch(url+'assets/'+name,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);
 assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);scripts.push({name,bytes:bytes.length,sha256:sha(bytes),http:200,exactArchiveBytes:true});
}
assert.equal(bundle.digest('hex'),manifest.bundleSha256);
const report={status:'VERIFIED_PRISTINE_PREVIEW',checkedAt:new Date().toISOString(),url,session:Number(process.argv[3])||null,http:200,htmlSha256:sha(html),htmlExactArchiveBytes:true,sourceFingerprint:manifest.sourceFingerprint,bundleSha256:manifest.bundleSha256,probeVersion:null,scripts,realDevice:'NOT_RUN',ownerFeel:'OWNER_REVIEW_REQUIRED'};
fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
