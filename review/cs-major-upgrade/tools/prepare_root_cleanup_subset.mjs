#!/usr/bin/env node
// 只核對歷史archive與生成root執行清單；沒有刪除入口、不讀PNG內容。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const review=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),workspace=path.resolve(review,'../..');
const run=path.join(review,'evidence/retention-policy-20261011'),base=JSON.parse(fs.readFileSync(path.join(run,'e-owner-cleanup-dry-run.manifest.json'),'utf8'));
const output=path.join(run,'e-approved-root-review-subset-v2.manifest.json');
if(fs.existsSync(output))throw Error('Subset manifest exists; never overwrite evidence');
const sha=async file=>{const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');};
const relative=file=>path.relative(workspace,file).replaceAll('\\','/');
const retained=[],candidates=[];
const evidenceNames=fs.readdirSync(path.join(review,'evidence'));
function walk(directory){let rows=[];for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name),s=fs.lstatSync(file,{bigint:true});if(s.isSymbolicLink())throw Error('Link in candidate archive: '+file);if(s.isDirectory())rows.push(...walk(file));else if(s.isFile())rows.push({file,bytes:Number(s.size),devIno:`${s.dev}:${s.ino}`,nlink:Number(s.nlink)});}return rows;}
for(const old of base.archiveCandidates){
 const reasons=[];
 if(!old.sourceHash)reasons.push('UNKNOWN_SOURCE_HASH');
 if(!old.historicalReferences.length)reasons.push('NO_SCOPED_MARKDOWN_HISTORICAL_REFERENCE');
 if(!old.manifestSha256)reasons.push('NO_ARCHIVE_MANIFEST');
 if(/recovered|recovery|resume|owner-weapon-preview/.test(old.name))reasons.push('POTENTIAL_UNIQUE_RECOVERY_OR_PREVIEW');
 const phase=old.name.replace(/-(1366|390)$/,''),width=old.name.match(/-(1366|390)$/)?.[1];
 const metrics=path.join(review,'evidence',phase,width||'1366','metrics.json'),gate=path.join(path.dirname(metrics),'gate.json');
 const logNames=evidenceNames.filter(n=>n.endsWith('.log')&&n.includes(phase.replace('phase-','')));
 if(!fs.existsSync(metrics)||!fs.existsSync(gate)||!logNames.length)reasons.push('NO_LINKED_FULL_RUNTIME_METRICS_GATE_AND_LOG');
 if(reasons.length){retained.push({name:old.name,reasons});continue;}
 const rows=JSON.parse(fs.readFileSync(metrics,'utf8')),result=JSON.parse(fs.readFileSync(gate,'utf8'));
 if(!rows.length||!rows.every(r=>r.sourceFingerprint?.sha256===old.sourceHash&&r.build?.startsWith('production preview')&&r.frames>0&&r.fps>0)){retained.push({name:old.name,reasons:['RUNTIME_SOURCE_OR_MEASUREMENT_NOT_PROVEN']});continue;}
 const folder=fs.realpathSync(old.resolvedPath),manifestFile=path.join(folder,'build-manifest.json'),m=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 if(await sha(manifestFile)!==old.manifestSha256||m.sourceFingerprint?.sha256!==old.sourceHash){retained.push({name:old.name,reasons:['ARCHIVE_MANIFEST_DRIFT']});continue;}
 const bundle=createHash('sha256'),jsNames=fs.readdirSync(path.join(folder,'assets')).filter(n=>n.endsWith('.js')).sort();
 for(const name of jsNames){bundle.update(name+'\0');for await(const chunk of fs.createReadStream(path.join(folder,'assets',name)))bundle.update(chunk);}
 const bundleSha256=bundle.digest('hex');
 if(bundleSha256!==m.bundleSha256){retained.push({name:old.name,reasons:['ACTUAL_JS_BUNDLE_DIFFERS_FROM_ARCHIVE_MANIFEST']});continue;}
 const originalExitNames=evidenceNames.filter(n=>n.endsWith('.exit.txt')&&n.includes(phase.replace('phase-','')));
 const isolation=path.join(review,'evidence',`${phase}-${width}-isolation.json`);
 let native=null,nativePath=null;
 if(fs.existsSync(isolation)){const i=JSON.parse(fs.readFileSync(isolation,'utf8'));if(Number.isInteger(i.gateNativeExit)){native=i.gateNativeExit;nativePath=isolation;}}
 if(native===null&&originalExitNames.length){nativePath=path.join(review,'evidence',originalExitNames[0]);const bytes=fs.readFileSync(nativePath);const text=bytes[0]===255&&bytes[1]===254?bytes.toString('utf16le').replace(/^\uFEFF/,''):bytes.toString('utf8');if(/^[012]\s*$/.test(text))native=Number(text.trim());}
 if(native===null){retained.push({name:old.name,reasons:['NO_RELIABLE_NATIVE_EXIT_RECORD']});continue;}
 const files=walk(folder),identities=new Map(files.map(f=>[f.devIno,f.bytes]));
 candidates.push({name:old.name,resolvedPath:folder,sourceHash:old.sourceHash,manifestSha256:old.manifestSha256,bundleSha256,jsFiles:jsNames.length,manifestRecord:{...m,publicStorage:m.publicStorage?{files:m.publicStorage.files,logicalBytes:m.publicStorage.logicalBytes,linkedFiles:m.publicStorage.linkedFiles,copiedFiles:m.publicStorage.copiedFiles,newCacheBytes:m.publicStorage.newCacheBytes}:null},logicalBytes:files.reduce((n,f)=>n+f.bytes,0),uniqueFileIdentityBytes:[...identities.values()].reduce((n,b)=>n+b,0),files:files.length,metrics:{path:relative(metrics),sha256:await sha(metrics),rows:rows.length},gate:{path:relative(gate),sha256:await sha(gate),verdict:result.verdict,pass:result.pass,fail:result.fail},fullLogs:await Promise.all(logNames.map(async n=>({path:relative(path.join(review,'evidence',n)),sha256:await sha(path.join(review,'evidence',n))}))),native:{path:relative(nativePath),sha256:await sha(nativePath),exit:native},historicalReferences:old.historicalReferences,representativePngs:old.retainedEvidence.representativePngs,keepEntireEvidence:true,_files:files});
}
const tempRoot=path.join(review,'tmp');fs.mkdirSync(tempRoot,{recursive:true});
const nativeReports=[];
for(const candidate of candidates){
 const resourceList=path.join(tempRoot,`e-resource-files-${candidate.name}.json`);
 const expectedResources=JSON.stringify(candidate._files.map(f=>f.file));
 if(fs.existsSync(resourceList)){if(fs.readFileSync(resourceList,'utf8')!==expectedResources)throw Error('Resource inventory changed: '+candidate.name);}else fs.writeFileSync(resourceList,expectedResources,{flag:'wx'});
 const proc=spawnSync('powershell.exe',['-NoProfile','-File',path.join(review,'tools/read_archive_resource_use.ps1'),'-FileListPath',resourceList],{encoding:'utf8',windowsHide:true,timeout:60000});
 let report;try{report=proc.status===0?JSON.parse(proc.stdout):null;}catch{report=null;}
 const unknown=report?.processes?.filter(p=>p.scopeMention&&p.cwdStatus!=='READ')||[];
 const observed=report?.processes?.filter(p=>p.cwd&&path.resolve(p.cwd).startsWith(candidate.resolvedPath))||[];
 const named=report?.processes?.filter(p=>p.archiveNames?.includes(candidate.name))||[];
 const pids=(report?.resourcePids||[]).filter(Number.isInteger);
 const blocked=!report||report.files!==candidate._files.length||report.resourceFailures?.length||unknown.length||observed.length||named.length||pids.length;
 candidate.procedureInUse={status:blocked?'UNKNOWN_OR_IN_USE_KEEP':'READ_ONLY_SNAPSHOT_NO_AFFECTED_RESOURCE_OR_CWD',nativeExit:proc.status,resourcePids:pids,scopeUnknownCwdPids:unknown.map(p=>p.pid),candidateCwdPids:observed.map(p=>p.pid),candidateNamedPids:named.map(p=>p.pid),checkedAt:report?.checkedAt||null,executionRecheckRequired:true};
 nativeReports.push({candidate:candidate.name,nativeExit:proc.status,resourceFiles:candidate._files.length,resourcePids:pids,unknownScopedCwd:unknown.map(p=>({pid:p.pid,name:p.name,error:p.error})),scopeCwd:report?.processes?.filter(p=>p.scopeMention).map(p=>({pid:p.pid,name:p.name,cwd:p.cwd,cwdStatus:p.cwdStatus}))||[],error:report?null:proc.stderr.slice(-1400),status:candidate.procedureInUse.status});
 delete candidate._files;
}
const approved=candidates.filter(c=>c.procedureInUse.status==='READ_ONLY_SNAPSHOT_NO_AFFECTED_RESOURCE_OR_CWD');
for(const c of candidates.filter(c=>c.procedureInUse.status!=='READ_ONLY_SNAPSHOT_NO_AFFECTED_RESOURCE_OR_CWD'))retained.push({name:c.name,reasons:['PROCEDURE_HANDLE_OR_CWD_UNKNOWN_OR_IN_USE'],procedureInUse:c.procedureInUse});
const historyPath=path.join(run,'e-approved-root-review-history-v2.md');
const history=['# CS 舊 archive 歷史追溯（root 清理子集）','','本文件僅保留淘汰archive的來源／實bundle、原生結果與原完整evidence入口。原圖片分數／失敗、完整logs／metrics／state／native、全部非PNG與代表圖維持原路徑。root最後E完成才可按已授權明確清單停用下列舊compiled archive；停用後不再提供該舊版本直接preview，不改寫原結果。','','| 舊archive | 來源／實JS bundle | 原gate／native | 必留evidence |','| --- | --- | --- | --- |',...approved.map(c=>`| ${c.name} | ${c.sourceHash} / ${c.bundleSha256} | ${c.gate.verdict} ${c.gate.pass}/${c.gate.pass+c.gate.fail}; native ${c.native.exit} | [metrics](../../../..//${c.metrics.path})；[完整log](../../../..//${c.fullLogs[0].path}) |`)];
history.push('','## 必留歷史連結索引',...base.historicalReferenceIndex.map(r=>typeof r==='string'?`- ${r}`:`- ${JSON.stringify(r)}`));
fs.writeFileSync(historyPath,history.join('\n')+'\n',{encoding:'utf8',flag:'wx'});
const result={schema:'cs-major-root-reviewed-cleanup-subset.v1',status:'PREPARED_ONLY_AWAIT_E_COMPLETE_ROOT_FINAL_CHECK',checkedAt:new Date().toISOString(),scope:fs.realpathSync(path.join(review,'profile-builds')),sourceCandidateManifest:{path:relative(path.join(run,'e-owner-cleanup-dry-run.manifest.json')),sha256:await sha(path.join(run,'e-owner-cleanup-dry-run.manifest.json'))},policy:{path:relative(path.join(review,'EVIDENCE_RETENTION.md')),sha256:await sha(path.join(review,'EVIDENCE_RETENTION.md')),authority:'Owner2026-10-11已授權；root核對E完成／用途／程序後可直接操作，不再徵詢一般同意。'},historicalReferenceIndex:base.historicalReferenceIndex,historicalManifest:{path:relative(historyPath),sha256:await sha(historyPath)},rootReview:{eComplete:false,finalPreviewPreserved:false,historicalLinksConverted:false,currentSourceRecoveryPreserved:false},approvedArchives:approved,retainedCandidates:retained,pngDeletion:[],protectedPaths:[path.join(review,'profile-builds/diagnostic-b7-glove-leather-joints-20261011-1366'),run,path.join(review,'profile-builds/.cs-public-cache-v1'),path.join(review,'assets-source')],excluded:'All evidence PNG/nonPNG retained in this subset; unknown, author-only, recovery, current B, new D/E, preview, MOBA, other worktrees and user processes excluded.',nativeResourceReports:nativeReports,summary:{oldCandidates:base.archiveCandidates.length,metadataAndRuntimeCandidates:candidates.length,approvedForRootFinalReview:approved.length,kept:retained.length,archiveLogicalBytes:approved.reduce((n,c)=>n+c.logicalBytes,0),archiveIdentityBytesPerArchiveSum:approved.reduce((n,c)=>n+c.uniqueFileIdentityBytes,0),deleted:0,readyNow:0},caveat:'identity bytes are not physical allocation or actual recoverable disk/OneDrive size. Resource/cwd snapshot is read-only and must be repeated at execution; unknown scope-relevant cwd blocks that item.'};
result.pendingProcedureArchives=candidates.filter(c=>!approved.includes(c));
result.nativeResourceTool={path:relative(path.join(review,'tools/read_archive_resource_use.ps1')),sha256:await sha(path.join(review,'tools/read_archive_resource_use.ps1')),arrayCountGuard:true};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({output:relative(output),bytes:fs.statSync(output).size,summary:result.summary,nativeResourceFailures:nativeReports.filter(r=>r.nativeExit!==0).length,history:relative(historyPath)}));
