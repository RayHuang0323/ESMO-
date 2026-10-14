#!/usr/bin/env node
// 唯讀規劃：只產出小型 manifest；不存在 delete / move / build / browser 入口。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const review=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=path.resolve(review,'../..');
const evidence=path.join(review,'evidence'), builds=path.join(review,'profile-builds');
const run=path.join(evidence,'retention-policy-20261011');
const output=path.join(run,'e-owner-cleanup-dry-run.manifest.json');
const rel=p=>path.relative(workspace,p).replaceAll('\\','/');
const sha=b=>createHash('sha256').update(b).digest('hex');
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const oldPath=path.join(evidence,'build-cleanup-candidates-20261008.json');
const old=readJson(oldPath), prior=readJson(path.join(evidence,'retention-audit-latest.json'));
const pinnedBuild='diagnostic-b7-glove-leather-joints-20261011-1366';
const priorBuilds=new Map(prior.summary.find(x=>x.name==='profile-builds').children.map(x=>[x.name,x]));
const priorSources=new Map();
for(const group of prior.repeatedBuildBundles)for(const row of group)priorSources.set(path.basename(row.path),row);
for(const row of prior.buildsWithoutManifest)priorSources.set(path.basename(row.path),row);
const priorPng=new Map();
for(const group of prior.exactPngDuplicates)for(const row of group.items)priorPng.set(row.path,row.sha256||group.sha256);
for(const group of prior.repeatedCaptureScenarios)for(const row of group.captures)priorPng.set(row.path,row.sha256);

const refs=[],documents=[];
const docPaths=fs.readdirSync(review).filter(n=>n.endsWith('.md')).map(n=>path.join(review,n));
for(const n of ['checkpoint-history-before-compact-20261008.md','checkpoint-history-before-growth-policy-20261011.md'])if(fs.existsSync(path.join(evidence,n)))docPaths.push(path.join(evidence,n));
for(const n of ['docs/design/CS_FPS_Major_Upgrade.md','docs/handoff/00_目前專案狀態.md','docs/handoff/05_Sprint紀錄.md','docs/handoff/08_目前待辦與風險.md'])docPaths.push(path.join(workspace,n));
for(const file of docPaths){
 const text=fs.readFileSync(file,'utf8'),lines=text.split(/\r?\n/);
 documents.push({path:rel(file),sha256:sha(Buffer.from(text)),lines});
}
function references(name,exactFile=null){
 const ids=[];
 for(const doc of documents)for(let i=0;i<doc.lines.length;i++){
  const line=doc.lines[i];
  if(!(line.includes(name)||(exactFile&&line.includes(exactFile))))continue;
  const key=doc.path+':'+(i+1);
  let id=refs.findIndex(x=>x.key===key);
  if(id<0){id=refs.length;refs.push({key,path:doc.path,line:i+1,excerpt:line.length<=220?line:line.slice(Math.max(0,line.indexOf(name)-50),line.indexOf(name)+170),documentSha256:doc.sha256});}
  ids.push(id);
 }
 return ids;
}
const allRecords=[],skippedLinks=[];
function walk(dir){
 const rows=[];
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name),stat=fs.lstatSync(file,{bigint:true});
  if(stat.isSymbolicLink()){skippedLinks.push({path:rel(file),resolvedTarget:fs.realpathSync(file)});continue;}
  if(entry.isDirectory())rows.push(...walk(file));
  else if(entry.isFile()){const row={file,bytes:Number(stat.size),identity:stat.ino?`${stat.dev}:${stat.ino}`:null,nlink:Number(stat.nlink)};allRecords.push(row);rows.push(row);}
 }
 return rows;
}
const buildRows=new Map();
for(const entry of fs.readdirSync(builds,{withFileTypes:true}).filter(x=>x.isDirectory()))buildRows.set(entry.name,walk(path.join(builds,entry.name)));
// evidence metadata 是限定本 CS 根目錄；不重讀圖片 bytes，也不掃其他工作區。
const evidenceRows=walk(evidence);
function totals(rows){const ids=new Map();for(const r of rows)if(r.identity)ids.set(r.identity,r.bytes);return {files:rows.length,logicalBytes:rows.reduce((n,r)=>n+r.bytes,0),uniqueFileIdentityBytes:rows.every(r=>r.identity)?[...ids.values()].reduce((n,b)=>n+b,0):null,uniqueFileIdentities:rows.every(r=>r.identity)?ids.size:null,hardlinkedPaths:rows.filter(x=>x.nlink>1).length};}
function resolved(file){const real=fs.realpathSync(file);if(!real.startsWith(review+path.sep))throw Error('Resolved path escapes CS review scope');return real;}
const processScript="$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains('cs-fps-major-upgrade') -or $_.CommandLine.Contains('cs-major-upgrade')) } | ForEach-Object { [pscustomobject]@{pid=$_.ProcessId;name=$_.Name;archiveNames=@([regex]::Matches($_.CommandLine,'(?:phase|diagnostic)-[A-Za-z0-9_-]+') | ForEach-Object { $_.Value });workingScopeMention=$true} }) | ConvertTo-Json -Depth 4 -Compress";
const proc=spawnSync('powershell.exe',['-NoProfile','-Command',processScript],{encoding:'utf8',windowsHide:true,timeout:20000});
let processes=[];if(proc.status===0&&proc.stdout.trim()){const parsed=JSON.parse(proc.stdout);processes=Array.isArray(parsed)?parsed:[parsed];}
const processSnapshot={checkedAt:new Date().toISOString(),nativeExit:proc.status,scopeOnly:true,rawCommandLinesStored:false,processes,limit:'只證明命令列明示本 CS 工作區的程序；serve 相對 cwd、開啟檔案 handle 及未明示路徑者不能由此排除。刪除前 Owner 必須再核對實際 preview/active gate。'};

const proposals=[],pngProposals=[],representatives=[];
for(const candidate of old.candidates){
 const folder=path.join(builds,candidate.name);if(!fs.existsSync(folder))continue;
 if(candidate.name===pinnedBuild)throw Error('Pinned B archive appeared in old candidates');
 const rows=buildRows.get(candidate.name),phase=candidate.name.replace(/-(1366|390)$/,''),phaseRoot=path.join(evidence,phase);
 const related=evidenceRows.filter(r=>r.file.startsWith(phaseRoot+path.sep));
 const pngs=related.filter(r=>/\.png$/i.test(r.file));
 const refIds=references(candidate.name),phaseRefIds=references(phase);
 const uniqueRefs=[...new Set([...refIds,...phaseRefIds])];
 const explicitPngRefs=pngs.filter(r=>documents.some(d=>d.lines.some(l=>l.includes(phase)&&l.includes(path.basename(r.file)))));
 // 每個被淘汰 phase 留兩隊正面／support，以及overview或active的少量代表圖。
 const rep=new Set(explicitPngRefs.map(r=>r.file));
 for(const side of ['ct','t']){
  const pick=pngs.find(r=>new RegExp(`(?:^|[/_-])${side}(?:[/_-]|$)`,'i').test(rel(r.file))&&/support/i.test(r.file)&&/front/i.test(r.file))
    ||pngs.find(r=>new RegExp(`(?:^|[/_-])${side}(?:[/_-]|$)`,'i').test(rel(r.file))&&/front/i.test(r.file));
  if(pick)rep.add(pick.file);
 }
 const overview=pngs.find(r=>/overview|active-play|battle-active/i.test(r.file));if(overview)rep.add(overview.file);
 if(pngs.length&&!rep.size)rep.add(pngs[0].file);
 const reps=pngs.filter(r=>rep.has(r.file)).map(r=>({path:rel(r.file),bytes:r.bytes,reason:explicitPngRefs.some(e=>e.file===r.file)?'文件明示 PNG 連結':'淘汰 phase 必留代表圖；非新 PASS'}));
 representatives.push(...reps);
 const original=priorSources.get(candidate.name),manifest=path.join(folder,'build-manifest.json');
 const plan={name:candidate.name,path:rel(folder),resolvedPath:resolved(folder),withinScope:true,kind:'superseded-CS-production-archive',...totals(rows),manifestSha256:fs.existsSync(manifest)?sha(fs.readFileSync(manifest)):null,sourceHash:original?.source||candidate.source||null,bundleHash:original?.bundle||null,bundleHashCheckedAt:prior.checkedAt,linkRef:{symlinkOrJunction:false,hardlinkedPaths:rows.filter(x=>x.nlink>1).length,sharedCacheKeep:'review/cs-major-upgrade/profile-builds/.cs-public-cache-v1',reverseExternalLinkAudit:'NOT_SCANNED_OUTSIDE_SCOPE'},procedureInUse:{observedArchivePids:processes.filter(p=>p.archiveNames?.includes(candidate.name)).map(p=>p.pid),finalCheckRequired:true},historicalReferences:uniqueRefs,retainedEvidence:{phase:fs.existsSync(phaseRoot)?rel(phaseRoot):null,textAndNonPng:'全部保留；不刪 evidence 資料夾',...totals(related.filter(r=>!r.file.endsWith('.png'))),representativePngs:reps.map(r=>r.path)},historyConversion:{status:uniqueRefs.length?'PENDING_DOCUMENT_LINK_REVIEW':'NO_EXPLICIT_DOCUMENT_REFERENCE_FOUND_IN_SCOPED_DOCS',targetManifest:rel(output),required:'Owner 將原 archive 用途轉為歷史 source/bundle/原生結果連結，明列不可重建該淘汰版本；保留現有review正文及原分數。'},deletionStatus:'PROPOSED_ONLY_AFTER_E_FINAL_OWNER_CHECK'};
 proposals.push(plan);
 for(const p of pngs.filter(r=>!rep.has(r.file))){const rrel=path.relative(review,p.file).replaceAll('\\','/');pngProposals.push({path:rel(p.file),resolvedPath:resolved(p.file),bytes:p.bytes,identity:p.identity,nlink:p.nlink,sha256FromPriorAudit:priorPng.get(rrel)||null,archive:candidate.name,historicalReferences:uniqueRefs,representatives:reps.map(r=>r.path),status:'PENDING_OWNER_VISUAL_RELEVANCE_AND_HISTORY_CONVERSION'});}
}
const proposedPaths=new Set(proposals.flatMap(p=>buildRows.get(p.name).map(r=>r.file)).concat(pngProposals.map(p=>path.join(workspace,p.path))));
const proposedRecords=allRecords.filter(r=>proposedPaths.has(r.file));
const identityGroups=new Map();for(const r of allRecords){if(!r.identity)continue;const g=identityGroups.get(r.identity)||{bytes:r.bytes,paths:[],nlink:r.nlink};g.paths.push(r.file);g.nlink=Math.max(g.nlink,r.nlink);identityGroups.set(r.identity,g);}
let exclusivelyProposedIdentityBytes=0,externalOrRetainedLinkedIdentityBytes=0;
for(const g of identityGroups.values())if(g.paths.some(p=>proposedPaths.has(p))){if(g.paths.every(p=>proposedPaths.has(p))&&g.nlink<=g.paths.length)exclusivelyProposedIdentityBytes+=g.bytes;else externalOrRetainedLinkedIdentityBytes+=g.bytes;}
const retainedPolicies=[
 {path:rel(run),resolvedPath:resolved(run),reason:'新C完整成功/失敗、小report、原生exit、state、stdout/stderr、source/fixture及D準備均必留',...totals(evidenceRows.filter(r=>r.file.startsWith(run+path.sep)))},
 {path:rel(path.join(builds,pinnedBuild)),resolvedPath:resolved(path.join(builds,pinnedBuild)),reason:'final B 唯一恢復 archive，全部保留',...totals(buildRows.get(pinnedBuild))},
 {path:'review/cs-major-upgrade/profile-builds/.cs-public-cache-v1',reason:'保留共享內容地址 cache；不可將 unlink logical bytes 當回收量'},
 {path:'review/cs-major-upgrade/assets-source',reason:'所有來源素材、license、ledger、preview、作者patch/packet保留；未列任何刪除候選'},
 {path:'public/assets/fps; public/audio/cs; src/battle/fps',reason:'產品資產/授權/來源及程式不在刪除範圍'},
 {path:'evidence 中所有非 PNG，及非舊66候選關聯 PNG',reason:'完整logs/native exit/metrics/state、art scorecard、ledger、before-after、原生診斷必留'},
 {path:'任何新 D / E archive 與 Owner preview',reason:'尚未完成／可能尚未產生，預設全保留；不因缺manifest或日期視為可刪'},
 {path:'其他未列出的 profile-builds',reason:'保守保留；包含baseline/before-after/必要性能對照，未擴張舊候選清單'}
];
const result={schema:'cs-major-owner-cleanup-plan.v1',checkedAt:new Date().toISOString(),status:'DRY_RUN_NO_DELETION_E_NOT_FINISHED',scope:review,workspace,authority:'EVIDENCE_RETENTION.md Owner 2026-10-11清理授權；先等E完成，再逐份Owner核對；此工具只讀與產manifest。',originalCandidateList:{path:rel(oldPath),sha256:sha(fs.readFileSync(oldPath)),originalCount:old.count,originalLogicalBytes:old.bytes},accounting:'logicalBytes依路徑加總；uniqueFileIdentityBytes按本scope dev/ino去重。exclusivelyProposedIdentityBytes只是本scope現有nlink資料估計內容，非NTFS配置或OneDrive回收量；刪除前重新量測。',summary:{archiveCandidates:proposals.length,archiveTotals:totals(proposals.flatMap(p=>buildRows.get(p.name))),pngCandidates:pngProposals.length,pngLogicalBytes:pngProposals.reduce((n,p)=>n+p.bytes,0),representativesKept:representatives.length,combinedProposed:totals(proposedRecords),exclusivelyProposedIdentityBytes,externalOrRetainedLinkedIdentityBytes,readyToDeleteNow:0,deleted:0},processSnapshot,retainedPolicies,historicalReferenceIndex:refs,archiveCandidates:proposals,pngCandidates:pngProposals,representativesKept:representatives,skippedLinks,finalProcedure:['E完成後保留最終C/D/Eproduction與Ownerpreview（新增項一律保留），不更改本歷史候選native結果。','核每個候選resolvedPath仍在本CSreview且無junction/symlink；不得使用萬用字元或跨shell刪除。','重新核target不在preview、gate或其他程序使用；未知handle或cwd須停止該候選的清理，不能關使用者Blender／一般Chrome。','逐份檢視historicalReferenceIndex並完成歷史連結轉換；保留review原分數、source/bundle、完整logs/state/native與必要代表圖。','Owner確認每一PNG代表性、before-after與具體失敗案例；未完成或缺hash時保留，不能把近似PNG說成exactduplicate。','若最終執行，Owner只按此明確resolvedPath用PowerShell LiteralPath逐份操作並保存before/after與native結果；此planner無刪除入口。'],excluded:'MOBA live source/assets/evidence、其他worktree、使用者Blender/普通Chrome/保存資料、任何未明列路徑；不push/deploy。'};
// 圖片共用 archive 的引用與前置条件，以列格式避免重複數百次相同 metadata。
result.pngColumns=['resolvedPath','bytes','devIno','nlink','sha256FromPriorAudit','archiveCandidateIndex'];
result.pngRowPolicy='每列 resolvedPath 為現場 realpath。引用／代表圖／歷史轉換與程序前置條件由 archiveCandidateIndex 指向；全部仍待 Owner 視覺用途檢視，不能立即刪除。';
result.pngCandidates=pngProposals.map(p=>[p.resolvedPath,p.bytes,p.identity,p.nlink,p.sha256FromPriorAudit,proposals.findIndex(a=>a.name===p.archive)]);
for(const p of result.archiveCandidates)p.originalHistoryReference={path:rel(oldPath),jsonPointer:`/candidates/${old.candidates.findIndex(c=>c.name===p.name)}`,status:p.historicalReferences.length?'SCOPED_MARKDOWN_REFERENCES_RECORDED':'EXPLICIT_MARKDOWN_REFERENCE_GAP_REQUIRES_OWNER_REVIEW'};
for(const p of result.archiveCandidates){
 const file=path.join(workspace,p.path,'build-manifest.json');if(!fs.existsSync(file))continue;
 const m=readJson(file);
 p.recordedManifest={sourceHash:m.sourceFingerprint?.sha256||null,bundleHash:m.bundleSha256||null,trace:m.trace??null,probeVersion:m.probeVersion||null,publicStorage:m.publicStorage?{linkedFiles:m.publicStorage.linkedFiles,copiedFiles:m.publicStorage.copiedFiles,newCacheBytes:m.publicStorage.newCacheBytes}:null};
 if(!p.sourceHash)p.sourceHash=p.recordedManifest.sourceHash;
 if(!p.bundleHash){p.bundleHash=p.recordedManifest.bundleHash;p.bundleHashCheckedAt=null;p.bundleHashAuthority='archive manifest記錄，沒有本輪重hash；Owner刪除前核保留metrics/log中的來源關聯。';}
}
fs.writeFileSync(output,JSON.stringify(result)+'\n',{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({output:rel(output),bytes:fs.statSync(output).size,sha256:sha(fs.readFileSync(output)),summary:result.summary,processSnapshot:{checkedAt:processSnapshot.checkedAt,nativeExit:proc.status,scopedProcesses:processes.length},skippedLinks:skippedLinks.length}));
