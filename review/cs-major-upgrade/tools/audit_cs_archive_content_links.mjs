#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),run=path.join(root,'evidence','retention-policy-20261011'),raw=fs.readFileSync(path.join(run,'cs-archive-content-link-plan.json')),plan=JSON.parse(raw),result=JSON.parse(fs.readFileSync(path.join(run,'cs-archive-content-link-result.json')));
if(result.status!=='PATHS_AND_CONTENT_PRESERVED_COMPLETE'||result.planSha256!==createHash('sha256').update(raw).digest('hex'))throw Error('同內容去重沒有完整完成');
const digest=async f=>{const h=createHash('sha256');for await(const chunk of fs.createReadStream(f))h.update(chunk);return h.digest('hex');};
const verifiedCache=new Map();let files=0,bytes=0;
for(const c of plan.candidates){
 const cached=path.resolve(root,c.cache),file=path.resolve(root,c.file);
 if(!file.startsWith(path.join(root,'profile-builds')+path.sep)||!cached.startsWith(path.join(root,'profile-builds','.cs-public-cache-v1')+path.sep))throw Error('驗證路徑越界');
 if(!verifiedCache.has(cached)){if(await digest(cached)!==c.sha256)throw Error('cache內容漂移');verifiedCache.set(cached,fs.statSync(cached,{bigint:true}));}
 const a=fs.lstatSync(file,{bigint:true}),b=verifiedCache.get(cached);
 if(!a.isFile()||a.isSymbolicLink()||a.dev!==b.dev||a.ino!==b.ino||a.size!==b.size||Number(a.size)!==c.bytes||a.nlink<2n)throw Error('原路徑／file identity驗證失敗：'+c.file);
 if(fs.readdirSync(path.dirname(file)).some(n=>n.startsWith(path.basename(file)+'.cs-link-original-')))throw Error('仍有未收尾單檔暫存');
 files++;bytes+=c.bytes;
}
const report={status:'ALL_ORIGINAL_PATHS_SAME_VERIFIED_CACHE_BYTES',files,bytes,uniqueCacheFilesHashed:verifiedCache.size,nativeResult:'PASS',method:'逐檔核原路徑、bytes、dev/ino與nlink；每個共享cache重新SHA，所有link與cache為同file identity，沒有再讀相同7.49GB內容。',temporaryBackups:0,productFilesChanged:0,cloudSpaceClaim:false};
fs.writeFileSync(path.join(run,'cs-archive-content-link-audit.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
