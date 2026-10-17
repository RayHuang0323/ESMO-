// Read-only baseline modules and original verifiers in a private evidence tree.
// Never checks out, replaces or executes a second copy of the product simulation.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
const dir=path.resolve('review/cs-major-upgrade/evidence/owner4d-review-20261015/baseline-gates-r2');if(fs.existsSync(dir))throw Error('Refuse overwrite');fs.mkdirSync(dir,{recursive:true});
const baseline=['src/battle/fps/presentation/FpsCharacterRenderer.js','src/battle/fps/presentation/fpsWeaponPoseLayers.js','src/battle/fps/fpsWeaponHandling.js','src/battle/fps/presentation/fpsMatchPresentation.js'];
const mirror=new Map(baseline.map((f,i)=>[path.resolve(f),path.join(dir,'baseline-'+i+'.mjs')]));mirror.set(path.resolve('tools/lib/fpsRigTestAssets.mjs'),path.join(dir,'baseline-rig-assets.mjs'));
function imports(source,original){return source.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(original).href)).replace(/from\s+(['"])(\.[^'"]+)\1/g,(all,quote,spec)=>{const absolute=path.resolve(path.dirname(original),spec);return 'from '+quote+pathToFileURL(mirror.get(absolute)||absolute).href+quote;});}
for(const f of baseline){const source=execFileSync('git',['show','4f168947:'+f],{encoding:'utf8',windowsHide:true});fs.writeFileSync(mirror.get(path.resolve(f)),imports(source,path.resolve(f)));}
const fixture=path.resolve('tools/lib/fpsRigTestAssets.mjs');fs.writeFileSync(mirror.get(fixture),imports(fs.readFileSync(fixture,'utf8'),fixture));
const results=[];
for(const name of ['cs_major_animation_lifecycle','cs_major_weapon_pose_layers','cs_major_audio_playback']){
 const original=path.resolve('tools/check_'+name+'.mjs');let source=imports(fs.readFileSync(original,'utf8'),original);
 for(const [f,local]of mirror){const relative=path.relative(process.cwd(),f).split(path.sep).join('/');source=source.replaceAll('"'+relative+'"',JSON.stringify(local)).replaceAll("'"+relative+"'",JSON.stringify(local));}
 const file=path.join(dir,name+'.mjs');fs.writeFileSync(file,source);const r=spawnSync(process.execPath,[file],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024,env:{...process.env,ESMO_VERIFY_FLAT:'1'}});
 fs.writeFileSync(path.join(dir,name+'.stdout.log'),r.stdout||'');fs.writeFileSync(path.join(dir,name+'.stderr.log'),r.stderr||'');const row={name,nativeExitCode:r.status,signal:r.signal,error:r.error?.message,failLines:(r.stdout||'').split(/\r?\n/).filter(l=>l.startsWith('FAIL ')),tail:(r.stdout||'').trim().split(/\r?\n/).slice(-1)};results.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({baseline:'4f168947',purpose:'Distinguish existing stale-verifier assumptions from new product regressions; no thresholds changed',results},null,2));
