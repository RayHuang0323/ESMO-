#!/usr/bin/env node
// 輕量 metadata 盤點；不重讀所有 PNG、不刪除、不搬移、不建立 build。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reportPath=path.join(root,'evidence','growth-audit-latest.json');
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const summaries=[],packets=[],storage=[],skipped=[];
for(const name of ['evidence','profile-builds']){
 const base=path.join(root,name),types=new Map(),identities=new Map(),largest=[],children=new Map();
 let files=0,folders=0,logicalBytes=0,identityKnown=true,rootFiles=0;
 function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name);
   if(entry.isSymbolicLink()){skipped.push(relative(file));continue;}
   if(entry.isDirectory()){folders++;walk(file);continue;}
   if(!entry.isFile()||file===reportPath)continue;
   const stat=fs.statSync(file,{bigint:true}),bytes=Number(stat.size),rel=path.relative(base,file),top=rel.includes(path.sep)?rel.split(path.sep)[0]:'(根目錄散檔)';
   const ext=path.extname(file).toLowerCase()||'(無副檔名)',type=types.get(ext)||{extension:ext,files:0,bytes:0};
   type.files++;type.bytes+=bytes;types.set(ext,type);files++;logicalBytes+=bytes;
   const child=children.get(top)||{name:top,files:0,bytes:0};child.files++;child.bytes+=bytes;children.set(top,child);
   if(top==='(根目錄散檔)')rootFiles++;
   if(stat.ino===0n)identityKnown=false;
   else identities.set(`${stat.dev}:${stat.ino}`,bytes);
   largest.push({path:relative(file),bytes});largest.sort((a,b)=>b.bytes-a.bytes);if(largest.length>20)largest.pop();
   if(name==='profile-builds'&&entry.name==='build-manifest.json'){
    try{const m=JSON.parse(fs.readFileSync(file,'utf8'));storage.push({path:relative(dir),source:m.sourceFingerprint?.sha256,publicStorage:m.publicStorage||null});}catch{skipped.push(relative(file));}
   }
   if(name==='evidence'&&/runtime-authoring\.json$/.test(entry.name)){
    const row={path:relative(file),bytes};
    if(bytes<=12*1024*1024)try{const p=JSON.parse(fs.readFileSync(file,'utf8'));row.version=p.version;row.source=p.sourceFingerprint?.sha256||null;row.meshes=p.meshes?.length;row.posedPositionBytes=Buffer.byteLength(JSON.stringify(p.meshes?.map(m=>m.positions)));row.staticBindAndSkinBytes=Buffer.byteLength(JSON.stringify(p.meshes?.map(({bindPositions,indices,uv,skinIndex,skinWeight,boneInverses})=>({bindPositions,indices,uv,skinIndex,skinWeight,boneInverses}))));}catch{row.parseStatus='UNREADABLE';}
    packets.push(row);
   }
  }
 }
 if(!fs.existsSync(base))continue;walk(base);
 summaries.push({name,files,folders,rootFiles,logicalBytes,uniqueFileIdentityBytes:identityKnown?[...identities.values()].reduce((a,b)=>a+b,0):null,uniqueFileIdentities:identityKnown?identities.size:null,extensions:[...types.values()].sort((a,b)=>b.bytes-a.bytes),largestFiles:largest,largestDirectories:[...children.values()].sort((a,b)=>b.bytes-a.bytes).slice(0,20)});
}
const result={version:'cs-evidence-growth-audit.v1',checkedAt:new Date().toISOString(),status:'READ_ONLY_NO_CLEANUP',accounting:'logicalBytes 按路徑加總；uniqueFileIdentityBytes 按 dev/ino 去除硬連結，不是磁碟配置／OneDrive 雲端容量或刪除可回收量。兩個根目錄分開去重。',summaries,runtimePackets:{files:packets.length,bytes:packets.reduce((n,p)=>n+p.bytes,0),largest:packets.sort((a,b)=>b.bytes-a.bytes).slice(0,12)},publicStorage:{manifests:storage.length,withStorage:storage.filter(s=>s.publicStorage).length,linkedFilePaths:storage.reduce((n,s)=>n+(s.publicStorage?.linkedFiles||0),0),copiedFilePaths:storage.reduce((n,s)=>n+(s.publicStorage?.copiedFiles||0),0),recordedNewCacheBytes:storage.reduce((n,s)=>n+(s.publicStorage?.newCacheBytes||0),0)},skipped};
fs.writeFileSync(reportPath,JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,summaries:summaries.map(({largestFiles,largestDirectories,extensions,...s})=>s),runtimePackets:{files:result.runtimePackets.files,bytes:result.runtimePackets.bytes},publicStorage:result.publicStorage,report:relative(reportPath)}));
