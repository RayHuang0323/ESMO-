#!/usr/bin/env node
// 僅計畫：驗證舊 CS archive 與私有不可變cache的bytes，完全不改舊檔。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),builds=path.join(root,'profile-builds'),cache=path.join(builds,'.cs-public-cache-v1');
const out=path.join(root,'evidence','retention-policy-20261011','cs-archive-content-link-plan.json');
if(fs.existsSync(out))throw Error('計畫已存在，不覆寫');
const rel=f=>path.relative(root,f).replaceAll('\\','/'),digest=async f=>{const h=createHash('sha256');for await(const chunk of fs.createReadStream(f))h.update(chunk);return h.digest('hex');};
const sizes=new Set(),validCache=new Set();
for(const entry of fs.readdirSync(cache,{withFileTypes:true})){
 if(!entry.isFile()||! /^[a-f0-9]{64}$/.test(entry.name))throw Error('cache內容不合法');
 const file=path.join(cache,entry.name);if(await digest(file)!==entry.name)throw Error('私有cache SHA失敗');
 sizes.add(fs.statSync(file).size);validCache.add(entry.name);
}
const candidates=[],counts={archives:0,files:0,alreadyLinked:0,differentSize:0,differentContent:0},identities=new Set();
async function walk(dir){
 if(!fs.existsSync(dir))return;
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('舊archive有symlink，停止計畫：'+rel(file));
  if(entry.isDirectory()){await walk(file);continue;}
  if(!entry.isFile())throw Error('非一般archive檔');
  counts.files++;const stat=fs.statSync(file,{bigint:true}),bytes=Number(stat.size);
  if(stat.nlink>1n){counts.alreadyLinked++;continue;}
  if(!sizes.has(bytes)){counts.differentSize++;continue;}
  const hash=await digest(file);if(!validCache.has(hash)){counts.differentContent++;continue;}
  const key=`${stat.dev}:${stat.ino}`;if(stat.ino===0n||identities.has(key))throw Error('file identity未知／重複，不估回收量');identities.add(key);
  candidates.push({file:rel(file),cache:rel(path.join(cache,hash)),sha256:hash,bytes,identity:key});
 }
}
for(const entry of fs.readdirSync(builds,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name!=='.cs-public-cache-v1')){
 const directory=path.join(builds,entry.name);for(const scope of ['assets/fps','audio/cs'])await walk(path.join(directory,scope));
 counts.archives++;if(counts.archives%40===0)console.log(JSON.stringify({status:'PLAN_SCAN_PROGRESS',archives:counts.archives,candidateFiles:candidates.length}));
}
const result={version:'cs-archive-content-link-plan.v1',status:'DRY_RUN_ONLY_NO_FILE_CHANGES',checkedAt:new Date().toISOString(),scope:'僅本CS worktree profile-builds的assets/fps、audio/cs；不包含MOBA worktree／英雄素材／使用者資料',counts,identicalIndependentFileBytes:candidates.reduce((n,c)=>n+c.bytes,0),candidates,caveat:'SHA確認各路徑內容與已存在私有cache相同；可保留所有原路徑／bytes改為硬連結。尚未操作，未回收；file size不是NTFS配置或OneDrive雲端占用。執行前須再驗SHA、identity、活躍程序／權限与保留點；不删圖片、logs或archive目錄。'};
fs.writeFileSync(out,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({status:result.status,counts,candidateFiles:candidates.length,identicalIndependentFileBytes:result.identicalIndependentFileBytes,report:rel(out)}));
