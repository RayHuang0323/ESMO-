// 原 ablation evidence 唯讀來源核對與已觀察結果保存，不重 Browser。
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {createHash} from 'node:crypto';
const root='review/cs-major-upgrade/evidence/authenticity-closure-20261012',dir=path.join(root,'owner7-dust2-v8-render-ablation'),sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const bytes=fs.readFileSync(path.join(dir,'gate.json')),gate=JSON.parse(bytes),native=read(dir+'.exit.json');
const stable=new Set(['road-hidden','paving-hidden']),series=gate.series.map(s=>{const movie=fs.readFileSync(path.join(dir,s.movie.path)),m=/,payload=("[A-Za-z0-9+/=]+");/.exec(movie.toString('utf8'));if(!m)throw Error('Movie marker drift');const rgb=zlib.gunzipSync(Buffer.from(JSON.parse(m[1]),'base64'));if(sha(movie)!==s.movie.sha256||sha(rgb)!==s.movie.rawRgbSha256||rgb.length!==s.samples.length*96*64*3||s.samples.some((p,i)=>sha(rgb.subarray(i*96*64*3,(i+1)*96*64*3))!==p.pixelSha256))throw Error('Actual movie SHA/shape mismatch');return{condition:s.condition,movie:s.movie,viewedIndices:[0,1,2,10,15,19],maxAdjacentMean:s.maxAdjacentMean,poseSpan:s.poseSpan,referencePoseError:s.referencePoseError,referenceQuaternionError:s.referenceQuaternionError,near:s.samples[0].near,far:s.samples[0].far,frame:s.samples[0].frame,frameSha256:s.samples[0].frameSha256,visualObservation:stable.has(s.condition.id)?'已觀察抽樣中原radial亮暗片段跳變消失；不是產品修復驗收。':'原radial亮暗片段切換仍可見。',allSampleShaVerified:true};});
const files=fs.readdirSync(dir),report={schema:'cs-dust2-render-ablation-human-review.v1',checkedAt:new Date().toISOString(),classification:'DIAGNOSTIC_CAUSAL_LOCALIZATION',productVisualStatus:'VISUAL_PRODUCT_FAIL_UNTIL_NECESSARY_AFTER',collection:{result:gate.status,pass:gate.result.pass,fail:gate.result.fail,nativeExitCode:native.nativeExitCode,elapsedMs:native.elapsedMs},archive:gate.archive,reference:gate.reference,original:gate.original,targetGeometry:gate.targetGeometry,series,allSamplesVerified:180,manuallyViewedAll180:false,png:files.filter(f=>f.endsWith('.png')).length,bytes:files.reduce((n,f)=>n+fs.statSync(path.join(dir,f)).size,0),gateSha256:sha(bytes),nativeSha256:sha(fs.readFileSync(dir+'.exit.json')),restored:gate.restored,cleanup:gate.result.evidence.cleanup,cim:gate.cim,console:gate.browserErrors,conclusion:'road/paving任一移除後局部跳變消失、恢復後重現；marker/shadow移除後仍存在，定位是road/paving渲染層互相干擾。真meshroad .032與paving .045、各opacity1/depthWrite=true/depthTest=true，材料shader/tile不同。局部depth precision競爭受實際隔離支持，非marker或shadow。',limits:['非修復／驗收；不得把21PASS或mean差當視覺PASS。','沒有改simulation、frame、位置、outcome或camera資料；只有render.visible與renderer.shadowMap.enabled暫改及原生操作。','僅原Bsite96×64crop，無全圖／手機／其他事件驗收。','透視depth量化是解釋機制；沒有讀GPU每片段depth值，因此不宣稱測得硬體depth tie。']};
const json=path.join(root,'owner7-dust2-v8-ablation-review.json');fs.writeFileSync(json,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const table=series.map(s=>`| ${s.condition.id} | ${s.maxAdjacentMean.toFixed(6)} | ${s.visualObservation} |`).join('\n');
const md=`# Dust II v8 道路／地坪渲染隔離

**已定位road/paving兩層相互干擾；仍需修正後正式時序判讀。** 同真v8 archive、paused frame24、roundSec12、原Bsite canvas ROI，9條件×20sample共180，21/21 collection PASS，true native0／${native.elapsedMs}ms。原生同20px微拖與settledsamples；各段frame SHA不變，每次restore再關唯一指定render層，結束全部恢復。

| 條件 | 最大相鄰mean（診斷值） | 原RGB人工觀察 |
| --- | ---: | --- |
${table}

每條件親看[0,1,2,10,15,19]，沒有聲稱人工180全看。全部movie／rawRGB／180sample SHA已逐一核對。road-hide與paving-hide各自消除原radial片段切換，恢復重現；markers-hide與shadows-disabled仍存在。因此先前包點marker層序修補沒有關閉此缺陷，shadow bias亦非此隔離支持的修正方向。

實際瀏覽器targetGeometry保存Bsite(26,58)及fan中心(29.62,58.62)命中三角形、世界高度、原UV、shader atlasCell與normal。road高度.032、paving .045，兩者真opacity1、depthWrite/depthTest皆true。samepaint roadfan可被不同shader/tile的paving干擾；舊CPU只排除exactcoplanar異paint不足檢出不同高度但遠鏡depth precision問題。資料記錄near=${series[0].near}、far=${series[0].far}，不代用其他版本參數。沒有讀GPU每fragmentdepth值，不把depth量化機制寫成直接硬體測量。

本次只暫改mesh.visibility與renderer.shadowMap.enabled，不改产品或authoritative domain。收尾Chromecloseconfirmed/profileRemoved，CIM before/after均保存；0PNG、${report.bytes}bytes<16MiB。完整原logs/native/harness/movies在owner7-dust2-v8-render-ablation*；判讀JSON SHA ${sha(fs.readFileSync(json))}，原gate SHA ${report.gateSha256}。
`;
const markdown=path.join(root,'OWNER7_DUST2_V8_ABLATION_REVIEW.md');fs.writeFileSync(markdown,md,{flag:'wx'});console.log(JSON.stringify({json,markdown,sha256:sha(fs.readFileSync(json)),collection:report.collection,cim:gate.cim,cleanup:report.cleanup,bytes:report.bytes,series:series.map(s=>({condition:s.condition.id,mean:s.maxAdjacentMean,near:s.near,far:s.far}))}));
