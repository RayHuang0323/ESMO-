#!/usr/bin/env node
// v11 projection 唯讀精確逆轉證據；保留 v9 原報告，不 simulate/build/Browser。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {parse} from '@babel/parser';
const sha=b=>createHash('sha256').update(b).digest('hex');
const prefix=process.argv[2],root='review/cs-major-upgrade/evidence/authenticity-closure-20261012';
if(!prefix||process.argv.length!==3)throw Error('需要唯一新 CS evidence prefix');
const rel=path.relative(path.resolve('review/cs-major-upgrade/evidence'),path.resolve(prefix));
if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('只可寫 CS evidence');
const suffixes=['.json','.md','.v9-main-recovered.jsx.gz'];
if(suffixes.some(s=>fs.existsSync(prefix+s)))throw Error('拒覆寫舊證據');
const baselinePath=root+'/owner234-v9-consumer-provenance-20261013.json',baselineBytes=fs.readFileSync(baselinePath),baseline=JSON.parse(baselineBytes);
if(baseline.verdict!=='OWNER234_SCOPED_SOURCE_PROVENANCE_ALIAS'||!Object.values(baseline.checks).every(Boolean))throw Error('v9 baseline 前提不成立');
const main=baseline.main.path,currentBytes=fs.readFileSync(main),source=currentBytes.toString('utf8');
const before='  const desiredNear=pov?0.18:0.1;';
const after='  // A 100m map needs depth precision at the overview distance. Keep the\n  // close weapon plane in POV and preserve the Legacy projection.\n  const desiredNear=pov?0.18:st.sceneVersion==="legacy"?0.1:1;';
if(source.split(after).length!==2)throw Error('完整 projection hunk 不唯一，拒猜 inverse');
const restored=source.replace(after,before),restoredSha=sha(restored),inverseExact=restoredSha===baseline.main.currentSha256;
const nodes=[];const ast=parse(source,{sourceType:'module',plugins:['jsx']});
function walk(n){if(!n||typeof n!=='object')return;if(['FunctionDeclaration','VariableDeclarator','CallExpression'].includes(n.type))nodes.push(n);for(const [k,v]of Object.entries(n)){if(['loc','extra','comments','tokens'].includes(k))continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(ast);
function pick(kind,key){const list=nodes.filter(n=>kind==='function'?n.type==='FunctionDeclaration'&&n.id?.name===key:kind==='variable'?n.type==='VariableDeclarator'&&n.id?.name===key:n.type==='CallExpression'&&n.callee?.name==='useEffect'&&source.slice(n.start,n.end).includes(key));if(list.length!==1)throw Error('唯一 consumer 範圍前提不成立：'+key);const n=list[0],text=source.slice(n.start,n.end);return{text,lineStart:n.loc.start.line,lineEnd:n.loc.end.line,bytes:Buffer.byteLength(text),sha256:sha(text)};}
const descriptors=[['function','makeAudio'],['variable','W'],['variable','onMove'],['variable','animate'],['function','updateDynamic'],['function','updateCamera'],['effect','const presentation=presentationRef.current;'],['effect','if(!playing||!soundOn)audioRef.current?.stopAll?.();']];
const consumers=descriptors.map(([kind,key],index)=>{const now=pick(kind,key),old=baseline.consumers[index],camera=key==='updateCamera',normalized=camera?now.text.replace(after.trimStart(),before.trimStart()):now.text;return{name:old.name,path:main,key,current:{lineStart:now.lineStart,lineEnd:now.lineEnd,bytes:now.bytes,sha256:now.sha256},v9:old.current,byteEqual:now.sha256===old.current.sha256,projectionInverseByteEqual:camera?sha(normalized)===old.current.sha256:undefined};});
const moduleBytes=Object.fromEntries(baseline.modules.map(m=>[m.path,fs.readFileSync(m.path)]));
const modules=baseline.modules.map(m=>({path:m.path,bytes:moduleBytes[m.path].length,currentSha256:sha(moduleBytes[m.path]),v9Sha256:m.currentSha256,unchanged:sha(moduleBytes[m.path])===m.currentSha256,baselineKind:m.baselineKind}));
const camera=consumers.find(c=>c.key==='updateCamera'),other=consumers.filter(c=>c.key!=='updateCamera');
const checks={v9BaselineValid:true,wholeMainExactV11ToV9Inverse:inverseExact,otherSevenFullConsumersByteEqual:other.length===7&&other.every(c=>c.byteEqual),cameraChangedReported:!camera.byteEqual,cameraOnlyExactProjectionHunk:camera.projectionInverseByteEqual,povNearStillPoint18:source.includes('const desiredNear=pov?0.18:st.sceneVersion==="legacy"?0.1:1;'),allOtherCameraAimMathExact:camera.projectionInverseByteEqual,nativeDragInputBlockExact:consumers.find(c=>c.key==='onMove').byteEqual,fourModulesUnchanged:modules.every(m=>m.unchanged),noSourceDrift:sha(fs.readFileSync(main))===sha(currentBytes)&&Object.entries(moduleBytes).every(([f,b])=>sha(fs.readFileSync(f))===sha(b))};
const ok=Object.values(checks).every(Boolean),verdict=ok?'OWNER234_V11_SCOPED_PROJECTION_PROVENANCE':'SOURCE_PROVENANCE_FINDING';
const recoveredGzip=inverseExact?gzipSync(Buffer.from(restored)):null;
if(recoveredGzip&&sha(gunzipSync(recoveredGzip))!==baseline.main.currentSha256)throw Error('recovered gzip roundtrip 不符');
const report={schema:'cs-owner234-v11-projection-provenance.v1',at:new Date().toISOString(),verdict,checks,baseline:{path:baselinePath,sha256:sha(baselineBytes),v9MainSHA256:baseline.main.currentSha256},main:{path:main,currentBytes:currentBytes.length,currentSHA256:sha(currentBytes),inverseBytes:Buffer.byteLength(restored),inverseSHA256:restoredSha},projectionDelta:{before,after,beforeSHA256:sha(before),afterSHA256:sha(after),field:'camera.near',v9:{pov:.18,normal:.1},v11:{pov:.18,legacyNormal:.1,majorNormal:1},call:'updateProjectionMatrix 僅 near 變更時；原呼叫 byte 未變'},consumers,modules,recoveredArtifact:recoveredGzip?{path:prefix+'.v9-main-recovered.jsx.gz',gzipBytes:recoveredGzip.length,gzipSHA256:sha(recoveredGzip),rawSHA256:restoredSha,roundtripVerified:true}:null,scope:'保留 v9 限定 consumer 原結論。v11 updateCamera 完整 block 已變，唯一差異是 normal Major near .1→1 與兩行註解；POV .18、aim數學、drag/input 與其他七個完整 consumer source 精確不變。不能將 v6/9 camera 完整 block PASS 原封套到 v11；新 projection 的三圖真 Browser 結果須由 E 新來源 gate 收件。',limitations:baseline.limitations,simulationRun:false,browserRun:false,buildRun:false,productModified:false};
fs.mkdirSync(path.dirname(prefix),{recursive:true});if(recoveredGzip)fs.writeFileSync(prefix+'.v9-main-recovered.jsx.gz',recoveredGzip,{flag:'wx'});fs.writeFileSync(prefix+'.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const md=`# Owner234 v11 projection 限定來源核對\n\n結果：${verdict}；來源工具 native ${ok?0:1}，不是新 Browser PASS。\n\n目前 main SHA \`${sha(currentBytes)}\`。僅記憶體逆轉兩行註解及完整 desiredNear 片段後，SHA \`${restoredSha}\` 與 v9 原報告記錄${inverseExact?'完全相同':'不同'}，恢復 ${Buffer.byteLength(restored)} bytes。恢復 gzip 已 roundtrip 核對；產品未改。\n\n七個其餘完整 consumer byte 相同；四個呈現模組完整 SHA 與 v9 相同。updateCamera 的完整 block **已變**，唯一完整差異是：\n\n\`const desiredNear=pov?0.18:0.1;\`\n\n→ 兩行說明註解及 \`const desiredNear=pov?0.18:st.sceneVersion===\"legacy\"?0.1:1;\`。\n\nPOV near 維持 .18，Legacy normal .1，Major normal 改為 1。移除這唯一精確片段後，完整 updateCamera byte SHA 等於 v9；因此其餘 authoritative aim 數學／POV 跟隨／原生 drag input 數學精確不變。v9 原報告與其 scope 保留，不覆写。\n\n本報告不能把 v6/9 完整 camera block 的舊 PASS 原封套在 v11。新的三圖 near=1／POV=.18 與原生 aim/drag 動態結果由 E 新來源 gate 收件；本工具未 simulate、build 或 Browser。\n`;
fs.writeFileSync(prefix+'.md',md,{flag:'wx'});console.log(JSON.stringify({verdict,checks,report:prefix+'.json',reportSHA256:sha(fs.readFileSync(prefix+'.json')),main:report.main,recoveredArtifact:report.recoveredArtifact},null,2));process.exitCode=ok?0:1;
