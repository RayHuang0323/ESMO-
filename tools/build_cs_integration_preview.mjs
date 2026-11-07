import fs from 'node:fs';import {build}from'vite';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const rev=process.argv[2]||'r1';if(!/^r\d+$/.test(rev))throw Error('明確封存版本');const out='review/cs-integration-20261107/preview-'+rev;if(fs.existsSync(out))throw Error('不得覆寫封存');
for(const k of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_REDIRECT_URL'])process.env[k]='';
await build({build:{outDir:out,emptyOutDir:false}});
const h=createHash('sha256');for(const f of fs.readdirSync(out+'/assets').filter(f=>f.endsWith('.js')).sort()){h.update(f+'\0');h.update(fs.readFileSync(out+'/assets/'+f));}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','src','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean).sort();files.push('vite.config.js');const source=createHash('sha256');for(const f of files){source.update(f+'\0');source.update(fs.readFileSync(f));source.update('\0');}
fs.writeFileSync(out+'/integration-manifest.json',JSON.stringify({builtAt:new Date().toISOString(),sourceFingerprint:{files:files.length,sha256:source.digest('hex')},bundleSha256:h.digest('hex'),publicScope:'主幹完整public素材',cloudEnvironment:'三個公開雲端設定在建置時明確留空',release:'HOLD'},null,2));console.log('RESULT=PASS');
