import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'vite';
const phase=process.argv[2]||'owner5-pristine-20261013';if(!/^(owner5|utility-plan)-pristine-20261013$/.test(phase))throw Error('Explicit bounded CS pristine archive name required');
const dir=path.resolve('review/cs-major-upgrade/profile-builds',phase);
if(fs.existsSync(dir))throw Error('Refuse archive overwrite');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();
const source=createHash('sha256');for(const f of files){source.update(f+'\0');source.update(fs.readFileSync(f));source.update('\0');}
// Actual configured production build, full public assets, no probe plugins.
await build({build:{outDir:dir,emptyOutDir:false}});
const bundle=createHash('sha256');for(const f of fs.readdirSync(path.join(dir,'assets')).filter(f=>f.endsWith('.js')).sort()){const bytes=fs.readFileSync(path.join(dir,'assets',f));if(/window\.__ESMO_FPS_SCENE__=(?!=)/.test(bytes.toString()))throw Error('Unexpected diagnostic assignment');bundle.update(f+'\0');bundle.update(bytes);}
const manifest={version:1,probeVersion:null,publicScope:'FULL_CONFIGURED_PUBLIC',sourceFingerprint:{kind:'worktree-fps-source-and-assets',sha256:source.digest('hex'),files:files.length},bundleSha256:bundle.digest('hex'),builtAt:new Date().toISOString()};
fs.writeFileSync(path.join(dir,'build-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});console.log(JSON.stringify({dir,...manifest}));
