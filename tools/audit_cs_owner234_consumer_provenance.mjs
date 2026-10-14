#!/usr/bin/env node
// 唯讀來源限定核對；不 simulate、不 build、不 Browser，不覆寫舊證據。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parse } from '@babel/parser';

const sha=b=>createHash('sha256').update(b).digest('hex');
const main='src/battle/fps/EsportsFPS3D.jsx';
const root='review/cs-major-upgrade/evidence/authenticity-closure-20261012';
const prefix=process.argv[2];
if(!prefix||process.argv.length!==3)throw Error('需要唯一新 CS evidence prefix');
const rel=path.relative(path.resolve('review/cs-major-upgrade/evidence'),path.resolve(prefix));
if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('只可保存 CS evidence');
const outputs=['.json','.md','.v6-main-recovered.jsx.gz'].map(s=>prefix+s);
if(outputs.some(f=>fs.existsSync(f)))throw Error('拒絕覆寫既有 evidence');
const files={fixtureManifest:'tools/.cs-major-verifier-recovery/authenticity-p0-v6-mirage-20261012.json.gz.manifest.json',archiveManifest:'review/cs-major-upgrade/profile-builds/diagnostic-authenticity-v6-20261012-1366/build-manifest.json',browser:root+'/owner234-browser-v6-selector-fixed.completion.json',prepared:root+'/owner234-tools-ready.state.json',oldMarkerRecovery:'review/cs-major-upgrade/evidence/retention-policy-20261011/e-final-source-recovery.json.gz'};
const bytes=Object.fromEntries(Object.entries(files).map(([k,f])=>[k,fs.readFileSync(f)]));
const fixture=JSON.parse(bytes.fixtureManifest),manifest=JSON.parse(bytes.archiveManifest),browser=JSON.parse(bytes.browser),prepared=JSON.parse(bytes.prepared);
const prior=JSON.parse(gunzipSync(bytes.oldMarkerRecovery)),old=prior.files.find(f=>f.path===main),oldBytes=Buffer.from(old.base64,'base64');
if(oldBytes.length!==old.bytes||sha(oldBytes)!==old.sha256)throw Error('舊 marker 參考 bytes/SHA 不符');
const currentBytes=fs.readFileSync(main),current=currentBytes.toString('utf8');let recovered=current;
const hunks=[];
const uniqueSpan=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);if(start<0||end<0||s.indexOf(a,start+1)>=0)throw Error('唯一 span 前提不成立：'+a);return s.slice(start,end);};
function undo(name,after,before){if(!after||recovered.split(after).length!==2)throw Error('唯一逆轉 hunk 前提不成立：'+name);recovered=recovered.replace(after,before);hunks.push({name,after,before,afterSha256:sha(after),beforeSha256:sha(before)});}
const markerStart='      const zone=new THREE.Mesh(new THREE.RingGeometry(5.2',markerEnd='      zone.userData.fpsMarkerType=';
undo('v8 Major 三個包點 marker depthWrite／lift／renderOrder',uniqueSpan(recovered,markerStart,markerEnd),uniqueSpan(oldBytes.toString('utf8'),markerStart,markerEnd));
undo('v8 CT informationOnly kit 宣告','        const informationOnly=side==="ct"&&tactic.type!=="stack"&&roundRoster.filter(p=>p.side===side).sort((a,b)=>String(a.id).localeCompare(String(b.id))).findIndex(p=>p.id===c.id)===4;\n','');
undo('v9 T lurker kit 註解','        // A T lurker controls the flank and escapes/joins through sightlines;\n        // its delayed lane has no planned close-range site-clearing HE window.\n','');
undo('v8 informationOnly smoke kit','buy==="eco"?[]:informationOnly?["smoke"]:','buy==="eco"?[]:');
undo('v9 T lurker smoke／flash kit',':side==="t"&&c.role==="lurker"?["smoke","flash"]:',':');
undo('v8 T lurker molly 排除 guard','type==="molly"&&(c.role==="lurker"||!attackTactic.mollys?.length)','type==="molly"&&!attackTactic.mollys?.length');
const expected=fixture.sourceDomain.hashes[main],recoveredSha=sha(recovered),restoredExact=recoveredSha===expected&&expected==='6a382ea022430a1e69806f32e147066df35b67c30c97b5ddf76c60dcb4515ee7';
// 原始 JSX AST 只定位完整來源範圍；不編譯、不忽略任一 consumer byte。
function sourceNodes(s){const ast=parse(s,{sourceType:'module',plugins:['jsx']});const nodes=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'||n.type==='VariableDeclarator'||n.type==='CallExpression')nodes.push(n);for(const [k,v]of Object.entries(n)){if(['loc','extra','comments','tokens'].includes(k))continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(ast);return nodes;}
const nowNodes=sourceNodes(current),oldNodes=sourceNodes(recovered);
const select=(nodes,s,kind,key)=>{const found=nodes.filter(n=>kind==='function'?n.type==='FunctionDeclaration'&&n.id?.name===key:kind==='variable'?n.type==='VariableDeclarator'&&n.id?.name===key:n.type==='CallExpression'&&n.callee?.name==='useEffect'&&s.slice(n.start,n.end).includes(key));if(found.length!==1)throw Error('consumer 範圍不唯一：'+key);const n=found[0];return{bytes:Buffer.byteLength(s.slice(n.start,n.end)),sha256:sha(s.slice(n.start,n.end)),lineStart:n.loc.start.line,lineEnd:n.loc.end.line,text:s.slice(n.start,n.end)};};
const descriptors=[['音訊 pool／footstep gain／attenuation／420/620 chime callback','function','makeAudio'],['map XY → world 1:1 定義','variable','W'],['POV 原生 pointer move／Legacy Orbit 分支','variable','onMove'],['wallDt RAF／current-next插值／playback speed','variable','animate'],['世界位置／outgoing presentationVelocity／rigged update','function','updateDynamic'],['authoritative POV aim／相機 Legacy guard','function','updateCamera'],['saved frame 呈現／audioGate／nextFrame／delay／cue callback','effect','const presentation=presentationRef.current;'],['pause／sound off stopAll／audioGate seek','effect','if(!playing||!soundOn)audioRef.current?.stopAll?.();']];
const consumers=descriptors.map(([name,kind,key])=>{const a=select(oldNodes,recovered,kind,key),b=select(nowNodes,current,kind,key);return{name,path:main,v6:{bytes:a.bytes,sha256:a.sha256,lineStart:a.lineStart,lineEnd:a.lineEnd},current:{bytes:b.bytes,sha256:b.sha256,lineStart:b.lineStart,lineEnd:b.lineEnd},byteEqual:a.text===b.text};});
const modulePaths=['src/battle/fps/presentation/fpsAnimationState.js','src/battle/fps/presentation/FpsCharacterRenderer.js','src/battle/fps/presentation/fpsWeaponPoseLayers.js','src/battle/fps/presentation/fpsMatchPresentation.js'];
const moduleBytes=Object.fromEntries(modulePaths.map(f=>[f,fs.readFileSync(f)]));
const modules=modulePaths.map(f=>({path:f,bytes:moduleBytes[f].length,currentSha256:sha(moduleBytes[f]),preparedSha256:prepared.source[f],byteHashEqualToPrepared:sha(moduleBytes[f])===prepared.source[f],baselineKind:'既有 Owner234 原始 consumer 準備 hash；不是 v6 raw module snapshot'}));
const checks={v6BrowserNativeZero:browser.result.nativeExitCode===0&&browser.result.wrapperNativeExit===0&&browser.result.pass===16&&browser.result.fail===0&&browser.result.verdict==='PASS',v6ArchiveSourceBinding:manifest.sourceFingerprint.sha256===browser.archive.sourceFingerprint.sha256&&manifest.bundleSha256===browser.archive.bundleSha256,v6RecoveredWholeMainExact:restoredExact,allEightConsumersByteEqual:consumers.every(c=>c.byteEqual),fourModulesEqualExistingPreparedHashes:modules.every(m=>m.byteHashEqualToPrepared),noSourceDrift:sha(fs.readFileSync(main))===sha(currentBytes)&&modulePaths.every(f=>sha(fs.readFileSync(f))===sha(moduleBytes[f]))};
const ok=Object.values(checks).every(Boolean),verdict=ok?'OWNER234_SCOPED_SOURCE_PROVENANCE_ALIAS':'SOURCE_PROVENANCE_FINDING';
const report={schema:'cs-owner234-consumer-provenance.v1',at:new Date().toISOString(),verdict,checks,main:{path:main,currentBytes:currentBytes.length,currentSha256:sha(currentBytes),recoveredBytes:Buffer.byteLength(recovered),recoveredSha256:recoveredSha,expectedV6Sha256:expected},hunks,consumers,modules,bindings:Object.fromEntries(Object.entries(files).map(([k,f])=>[k,{path:f,bytes:bytes[k].length,sha256:sha(bytes[k])}])),historicalBrowser:browser.result,historicalSourceFingerprint:manifest.sourceFingerprint,scope:'限定沿用 v6 Owner234 舊證據：八個主檔 consumer 完整 byte 相同，四個呈現模組與既有準備 hash 相同。沒有新執行16 checks；不宣稱 current gameplay／utility 成效、marker視覺、整bundle、效能或手機驗收 PASS。',limitations:['v6 archive 未保存四個模組 raw source；模組比對基線為既有 Owner234 tools-ready.state.json 的個別 source hashes，不能寫成 v6 raw module snapshot equality。','即使 consumer 實作相同，目前 gameplay 會產生不同 saved frames；本報告不驗新對局的運動／音訊輸入分布或新情境。'],simulationRun:false,browserRun:false,buildRun:false,productModified:false};
fs.mkdirSync(path.dirname(prefix),{recursive:true});
if(restoredExact)fs.writeFileSync(outputs[2],gzipSync(Buffer.from(recovered)),{flag:'wx'});
fs.writeFileSync(outputs[0],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const rows=consumers.map(c=>`| ${c.name} | ${c.current.lineStart}–${c.current.lineEnd} | ${c.current.sha256} | ${c.byteEqual?'完全相同':'不同'} |`).join('\n');
const md=`# Owner234 v6 → current 限定 consumer 來源核對\n\n結果：${verdict}。來源核對 native ${ok?0:1}；不是新 Browser PASS。\n\n將六個完整已知 hunk 僅在記憶體逆轉，恢復主檔 ${Buffer.byteLength(recovered)} bytes、SHA256 \`${recoveredSha}\`；與真 v6 fixture manifest 的整份主檔 SHA ${restoredExact?'完全相同':'不同'}。沒有修改產品。只在完全一致時保存 gzip 恢復 bytes。\n\n| consumer | 目前主檔行號 | 完整片段 SHA256 | v6恢復bytes 比對 |\n|---|---:|---|---|\n${rows}\n\n四個呈現模組個別完整 SHA 與既有 Owner234 準備來源 hash 均${checks.fourModulesEqualExistingPreparedHashes?'相同':'有不同'}；詳細值與來源 metadata 在同名 JSON。v6 archive 沒有 raw module snapshot，因此不將準備 hash 寫成 v6 模組 raw bytes。\n\n沿用的歷史 Browser 為 v6 16/16 PASS、native／wrapper0、38115ms；本輪没有重新執行。原始 completion、fixture manifest、archive manifest、準備 state、marker 參考 snapshot 各自的檔案 SHA 已保存。\n\n此 alias 僅限定 Owner234 實作與既有證據；不能借整bundle PASS，不能宣稱新 utility gameplay、marker 視覺、效能或真機驗收完成。新的 saved frames 分布仍由新來源的對局與必要 gate 負責。\n`;
fs.writeFileSync(outputs[1],md,{flag:'wx'});console.log(JSON.stringify({verdict,checks,report:outputs[0],reportSha256:sha(fs.readFileSync(outputs[0])),main:report.main,modules},null,2));process.exitCode=ok?0:1;
