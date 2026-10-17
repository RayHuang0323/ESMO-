#!/usr/bin/env node
// 僅盤點／輸出dry-run；沒有刪除、搬移或修改證據的入口。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const reviewRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reportPath=path.join(reviewRoot,'evidence','retention-audit-latest.json');
const relative=file=>path.relative(reviewRoot,file).replaceAll('\\','/');
const summary=[];
const screenshots=[];
const builds=[];
const skipped=[];
const malformed=[];
const digest=async file=>{const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');};
function scan(directory,collector){
  let bytes=0,files=0,png=0;
  for(const item of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name);
    if(item.isSymbolicLink()){skipped.push(relative(file));continue;}
    if(item.isDirectory()){
      const child=scan(file,collector);bytes+=child.bytes;files+=child.files;png+=child.png;
    }else if(item.isFile()){
      if(file===reportPath)continue;
      const size=fs.statSync(file).size;bytes+=size;files++;
      if(/\.png$/i.test(item.name)){png++;collector?.push({file,bytes:size});}
    }
  }
  return{bytes,files,png};
}
for(const name of ['evidence','profile-builds']){
  const root=path.join(reviewRoot,name);
  if(!fs.existsSync(root))continue;
  const children=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory())){
    const directory=path.join(root,entry.name);
    const totals=scan(directory,name==='evidence'?screenshots:null);
    children.push({name:entry.name,...totals});
    if(name==='profile-builds'&&entry.name!=='.cs-public-cache-v1'){
      const manifestPath=path.join(directory,'build-manifest.json');
      let manifest=null;
      if(fs.existsSync(manifestPath)){
        try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));}catch{malformed.push(relative(manifestPath));}
      }
      let source=manifest?.sourceFingerprint?.sha256||null;
      // 舊archive可由當次metrics關聯，但不借其他phase／新版source推定。
      const match=/^(.*)-(\d+)$/.exec(entry.name);
      if(!source&&match){
        const file=path.join(reviewRoot,'evidence',match[1],match[2],'metrics.json');
        if(fs.existsSync(file))try{
          const rows=JSON.parse(fs.readFileSync(file,'utf8')),hashes=new Set(rows.map(row=>row.sourceFingerprint?.sha256).filter(Boolean));
          if(hashes.size===1&&rows.every(row=>row.sourceFingerprint?.sha256===[...hashes][0]&&row.build?.startsWith('production preview')))source=[...hashes][0];
        }catch{malformed.push(relative(file));}
      }
      const assets=path.join(directory,'assets'),hash=createHash('sha256');let scripts=0;
      if(fs.existsSync(assets))for(const file of fs.readdirSync(assets).filter(file=>file.endsWith('.js')).sort()){
        hash.update(file+'\0');for await(const chunk of fs.createReadStream(path.join(assets,file)))hash.update(chunk);scripts++;
      }
      const bundle=scripts?hash.digest('hex'):null;
      builds.push({path:relative(directory),...totals,source,bundle,recordedBundle:manifest?.bundleSha256||null,bundleMatchesManifest:manifest?.bundleSha256?manifest.bundleSha256===bundle:null,trace:manifest?.trace??null,probeVersion:manifest?.probeVersion||'LEGACY_UNVERSIONED',hasManifest:Boolean(manifest)});
    }
  }
  // 子目錄已盤點，不再第二次走訪整個tree（OneDrive上成本很高）。
  const totals=children.reduce((sum,item)=>({bytes:sum.bytes+item.bytes,files:sum.files+item.files,png:sum.png+item.png}),{bytes:0,files:0,png:0});
  for(const item of fs.readdirSync(root,{withFileTypes:true}).filter(item=>item.isFile())){
    const file=path.join(root,item.name);if(file===reportPath)continue;
    const size=fs.statSync(file).size;totals.bytes+=size;totals.files++;
    if(/\.png$/i.test(item.name)){totals.png++;if(name==='evidence')screenshots.push({file,bytes:size});}
  }
  summary.push({name,folders:children.length,...totals,children});
}
// 串流逐張hash，不把整套PNG／建置讀進記憶體。不同版本近似圖不當重複。
const pngGroups=new Map();
const scenarioGroups=new Map();
for(const item of screenshots){
  const sha256=await digest(item.file);
  if(!pngGroups.has(sha256))pngGroups.set(sha256,[]);
  pngGroups.get(sha256).push({path:relative(item.file),bytes:item.bytes});
  const match=/^evidence\/([^/]+)\/(\d+)\/(.+)$/.exec(relative(item.file));
  if(match){
    const key=match[2]+':'+match[3];
    if(!scenarioGroups.has(key))scenarioGroups.set(key,{width:Number(match[2]),file:match[3],captures:[]});
    scenarioGroups.get(key).captures.push({phase:match[1],path:relative(item.file),sha256,bytes:item.bytes});
  }
}
const exactPngDuplicates=[...pngGroups].filter(([,items])=>items.length>1).map(([sha256,items])=>({sha256,items,repeatedBytes:items.slice(1).reduce((sum,item)=>sum+item.bytes,0)}));
const repeatedCaptureScenarios=[...scenarioGroups.values()].filter(group=>group.captures.length>2).map(group=>({...group,uniqueImageHashes:new Set(group.captures.map(x=>x.sha256)).size,bytes:group.captures.reduce((sum,x)=>sum+x.bytes,0)})).sort((a,b)=>b.captures.length-a.captures.length);
const bundleGroups=new Map();
for(const item of builds){
  if(!item.source||!item.bundle||item.bundleMatchesManifest===false)continue;
  const key=[item.source,item.bundle,item.trace,item.probeVersion].join(':');
  if(!bundleGroups.has(key))bundleGroups.set(key,[]);
  bundleGroups.get(key).push(item);
}
const repeatedBuildBundles=[...bundleGroups.values()].filter(items=>items.length>1);
const result={version:'cs-major-evidence-retention-audit.v1',checkedAt:new Date().toISOString(),status:'DRY_RUN_NO_DELETION',scope:reviewRoot,byteAccounting:'logical file sizes per path; hardlinks are not deduplicated physical allocation',summary,
  exactPngDuplicates,repeatedCaptureScenarios,repeatedBuildBundles,buildsWithoutManifest:builds.filter(item=>!item.hasManifest),skipped,malformed,
  caveat:'相同PNG hash只證明bytes重複；相同視窗／圖名只表示多輪產出，不保證場景姿勢／畫面相同或沒用。相同source/bundle只證明已記錄JS bundle重複，不證明整份public一致。清理前須核對用途、活躍程序、完整資產與唯一恢復點，不能直接按盤點結果刪除。'};
fs.writeFileSync(reportPath,JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,summary:summary.map(({children,...item})=>item),exactPngDuplicateGroups:exactPngDuplicates.length,repeatedPngBytes:exactPngDuplicates.reduce((sum,item)=>sum+item.repeatedBytes,0),repeatedCaptureScenarios:repeatedCaptureScenarios.length,mostRepeatedCaptureScenarios:repeatedCaptureScenarios.slice(0,8).map(({captures,...item})=>({...item,captures:captures.length})),repeatedBuildBundleGroups:repeatedBuildBundles.length,buildsWithoutManifest:result.buildsWithoutManifest.length,skipped:skipped.length,report:relative(reportPath)}));
