import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='review/cs-major-upgrade/profile-builds/owner4b-pristine-20261014',out='review/cs-major-upgrade/evidence/owner4b-review-20261014/preview-proof.json',base='http://localhost:5183/ESMO-/',sha=b=>createHash('sha256').update(b).digest('hex');
if(fs.existsSync(out))throw Error('Refuse evidence overwrite');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'build-manifest.json'))),rows=[];
for(const file of ['index.html',...fs.readdirSync(path.join(dir,'assets')).filter(f=>f.endsWith('.js')).map(f=>'assets/'+f)]){
 const r=await fetch(new URL(file==='index.html'?'':file,base)),bytes=Buffer.from(await r.arrayBuffer()),saved=fs.readFileSync(path.join(dir,file));if(r.status!==200||!bytes.equals(saved))throw Error('Preview byte mismatch: '+file);rows.push({file,http:r.status,bytes:bytes.length,sha256:sha(bytes),exactArchiveBytes:true});
}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort(),h=createHash('sha256');for(const file of files){h.update(file+'\0');h.update(fs.readFileSync(file));h.update('\0');}
if(h.digest('hex')!==manifest.sourceFingerprint.sha256||manifest.probeVersion!==null)throw Error('Pristine source/probe mismatch');
const proof={status:'VERIFIED_PRISTINE_PREVIEW',checkedAt:new Date().toISOString(),url:base,manifest,rows,sourceMatchesCurrent:true};fs.writeFileSync(out,JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({status:proof.status,url:base,scripts:rows.length-1,source:manifest.sourceFingerprint,bundle:manifest.bundleSha256}));
