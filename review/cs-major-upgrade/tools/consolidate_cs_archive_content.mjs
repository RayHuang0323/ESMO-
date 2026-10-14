#!/usr/bin/env node
// 可逆同內容去重：每個原路徑保留，cache永不連結mutable public；不刪歷史證據內容。
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),builds=path.join(root,'profile-builds'),cacheRoot=path.join(builds,'.cs-public-cache-v1'),run=path.join(root,'evidence','retention-policy-20261011');
const planPath=path.join(run,'cs-archive-content-link-plan.json'),journalPath=path.join(run,'cs-archive-content-link-journal.jsonl'),reportPath=path.join(run,'cs-archive-content-link-result.json');
if(process.argv[2]!=='--apply-preserving-paths')throw Error('必須明確指定可逆同內容去重，不提供刪目錄入口');
if(fs.existsSync(journalPath)||fs.existsSync(reportPath))throw Error('本輪紀錄已存在，先核對既有結果，不重做');
const digest=async f=>{const h=createHash('sha256');for await(const chunk of fs.createReadStream(f))h.update(chunk);return h.digest('hex');};
const raw=fs.readFileSync(planPath),plan=JSON.parse(raw);if(plan.status!=='DRY_RUN_ONLY_NO_FILE_CHANGES')throw Error('不是已完成的唯讀計畫');
const within=(base,file)=>file.startsWith(base+path.sep);
function resolved(relative,kind){
 const target=path.resolve(root,relative);
 if(kind==='cache'){if(!within(cacheRoot,target)||path.dirname(target)!==cacheRoot)throw Error('cache必須位於本工作區私有內容庫');}
 else{
  const parts=path.relative(builds,target).split(path.sep);
  if(!within(builds,target)||parts.length<4||parts[0].startsWith('.')||!((parts[1]==='assets'&&parts[2]==='fps')||(parts[1]==='audio'&&parts[2]==='cs')))throw Error('僅能修改本CS archive的CS資產');
 }
 for(let p=target;p!==root;p=path.dirname(p))if(fs.lstatSync(p).isSymbolicLink())throw Error('路徑不能經由symlink');
 return target;
}
// 計畫全體路徑先核對；不動任何MOBA worktree或現行public來源。
const items=plan.candidates.map(c=>({...c,target:resolved(c.file,'archive'),cached:resolved(c.cache,'cache')}));
const cacheStats=new Map();for(const c of items)if(!cacheStats.has(c.cached)){
 if(path.basename(c.cached)!==c.sha256||await digest(c.cached)!==c.sha256)throw Error('cache SHA不一致');
 fs.chmodSync(c.cached,0o444);cacheStats.set(c.cached,fs.statSync(c.cached,{bigint:true}));
}
const fd=fs.openSync(journalPath,'wx'),result={version:'cs-content-link-consolidation.v1',status:'RUNNING',planSha256:createHash('sha256').update(raw).digest('hex'),linkedFiles:0,independentFileBytesRemoved:0,originalPathsPreserved:true,contentVerified:true,cacheNewBytes:0,temporaryBackupPending:[],failure:null,caveat:'每個原路徑／bytes保留；此數字是移除獨立同bytes副本的file size，不是NTFS配置或OneDrive雲端回收量。可將每個link複製為獨立檔還原，原來源與所有logs／PNG／manifest保持。'};
const write=row=>{fs.writeSync(fd,JSON.stringify(row)+'\n');fs.fsyncSync(fd);};
try{
 for(const [index,c] of items.entries()){
  const stat=fs.statSync(c.target,{bigint:true});
  if(stat.nlink!==1n||`${stat.dev}:${stat.ino}`!==c.identity||Number(stat.size)!==c.bytes||await digest(c.target)!==c.sha256)throw Error('舊檔已變更，不替換：'+c.file);
  const backup=c.target+'.cs-link-original-'+randomUUID();if(!within(builds,backup))throw Error('暫存還原路徑越界');
  write({stage:'INTENT',index,original:c.file,backup:path.relative(root,backup).replaceAll('\\','/'),sha256:c.sha256});
  fs.renameSync(c.target,backup);
  try{
   fs.linkSync(c.cached,c.target);
   const after=fs.statSync(c.target,{bigint:true}),expected=cacheStats.get(c.cached);
   if(after.dev!==expected.dev||after.ino!==expected.ino||after.size!==stat.size)throw Error('link file identity不一致');
  }catch(error){
   // 只移除本步剛建立的link，原檔復位；不能刪除其他來源。
   if(fs.existsSync(c.target)){const a=fs.statSync(c.target,{bigint:true}),b=cacheStats.get(c.cached);if(a.dev!==b.dev||a.ino!==b.ino)throw Error('還原時目標不屬於本步，保留backup停止');fs.unlinkSync(c.target);}
   fs.renameSync(backup,c.target);throw error;
  }
  write({stage:'VERIFIED_LINK',index});
  // 原內容已由cache與原path保留；只有這個單一相同bytes暫存副本可移除。
  try{const b=fs.statSync(backup,{bigint:true});if(`${b.dev}:${b.ino}`!==c.identity||b.nlink!==1n)throw Error('原副本identity漂移');fs.chmodSync(backup,0o666);fs.unlinkSync(backup);result.independentFileBytesRemoved+=c.bytes;}
  catch(error){result.temporaryBackupPending.push({index,backup,error:error.message});}
  result.linkedFiles++;write({stage:'DONE',index,backupPending:result.temporaryBackupPending.some(b=>b.index===index)});
  if(result.linkedFiles%500===0)console.log(JSON.stringify({status:'LINK_PROGRESS',linkedFiles:result.linkedFiles,independentFileBytesRemoved:result.independentFileBytesRemoved}));
 }
 result.status=result.temporaryBackupPending.length?'PATHS_AND_CONTENT_PRESERVED_BACKUP_CLEANUP_PENDING':'PATHS_AND_CONTENT_PRESERVED_COMPLETE';
}catch(error){result.status='STOPPED_WITH_CONTENT_PRESERVED_REVIEW_JOURNAL';result.failure=error.message;process.exitCode=2;}
finally{fs.closeSync(fd);result.completedAt=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));}
