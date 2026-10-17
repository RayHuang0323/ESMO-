// 保存本輪人工判讀及既有 evidence 的確切來源；不新增產品或 Browser 驗證。
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root='review/cs-major-upgrade/evidence/authenticity-closure-20261012',dir=path.join(root,'owner7-temporal-v8-after');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const gate=read(path.join(dir,'gate.json')),metrics=read(path.join(root,'owner7-temporal-v8-analysis.json')),native=read(dir+'.exit.json'),before=read(path.join(root,'owner7-v6-visual-product-fail.json')),depth=read(path.join(root,'owner7-v8-dust2-road-join-depth.json'));
const series=gate.series.map(s=>({map:s.map,mode:s.cameraMode,movie:path.join(dir,s.movie.path),movieSha256:sha(path.join(dir,s.movie.path)),rawRgbSha256:s.movie.rawRgbSha256,observedIndices:s.cameraMode==='pov-live'?[0,3,6,9,12,15,17,18,19]:[0,1,7,8,16,31,32,35,39],visualFinding:s.map==='dust2'&&s.cameraMode==='overview'?'包點B周圍可見放射狀亮暗片段交替；After未關閉問題。':'已看抽樣未見與Dust II同型態的明顯跳閃；非全圖／全樣本無閃爍證明。',metrics:metrics.series.find(r=>r.map===s.map&&r.mode===s.cameraMode)}));
const dust=gate.series.find(s=>s.map==='dust2'&&s.cameraMode==='overview'),sample=dust.samples[0];
const report={schema:'cs-owner7-human-v8-visual-review.v1',checkedAt:new Date().toISOString(),classification:'VISUAL_PRODUCT_FAIL',visualClosure:'NOT_CLOSED',collection:{pass:gate.result.pass,fail:gate.result.fail,result:gate.status,nativeExitCode:native.nativeExitCode,signal:native.signal,wrapperElapsedMs:native.elapsedMs,unchangedOriginalGate:true},evidence:{movies:12,all420SampleShaVerified:true,manuallyViewedAll420:false,savedPngs:0,display:'原RGB／3×nearest-neighbor記憶體contact sheets；沒有改色、增強或寫PNG。',gateSha256:sha(path.join(dir,'gate.json')),nativeSha256:sha(dir+'.exit.json'),metricsSha256:sha(path.join(root,'owner7-temporal-v8-analysis.json')),geometrySha256:sha(path.join(root,'owner7-v8-dust2-road-join-depth.json'))},archive:gate.archive,before:{classification:before.classification,movie:before.evidence.movie,movieSha256:before.evidence.movieSha256,rawRgbSha256:before.evidence.rawRgbSha256,indices:[0,1,2,32,35,39],old35PassNativeUnknownPreserved:true},after:{map:'dust2',site:'B (26,58), elevation=0',indices:[0,1,2,32,35,39],frame:sample.frame,roundSec:sample.roundSec,playing:sample.playing,pose:sample.pose,quaternion:sample.quaternion,clip:sample.clip,markers:sample.objectiveMarkers,lighting:sample.lighting},series,geometry:{site:depth.site,fans:depth.fans,overlapCount:depth.overlapCount,overlapPairSum:depth.overlapPairSum,findings:depth.findings,sourceFiles:depth.sourceFiles},console:gate.browserErrors,limits:['微幅相機收斂仍存在；不同像素不能單靠mean差值判定閃爍。','fixed POV三圖40sample各只有一pixelSHA；只代表實際crop固定，不能代表全地圖。','live POV由原生play真正前進，10–12m移動與人物腿部、牆體透視、物件遮擋是合法畫面變化；未把這些當成閃爍。','影像局部未涵蓋海水／全部Utility、事件與長時間運鏡；沒有以water/Utility推測豁免Bsite frozen-frame缺陷。','shader console未見compile/link錯誤不證明每個shader正確；program diagnostics若null不得當編譯驗證。','1366px桌機96×64局部crop；沒有真手機FPS／觸控／完整視覺驗收。'],next:'Owner以真正Bsite共面道路接點／路段重疊為最小隔離方向；同一shader atlasCell與world投影使rawUV差異不足證明唯一根因。不得以提高marker層序或改shadow bias推定已修。若修此真缺陷，再僅必要同視角After，不重B7或不相關PASS。',cleanup:gate.result.evidence.cleanup};
const out=path.join(root,'owner7-temporal-v8-visual-review.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const md=`# Owner7 v8 真時序影像判讀

**VISUAL_PRODUCT_FAIL；可見閃爍尚未關閉。** v8 的 Dust II overview 同幀包點B附近仍有放射狀亮暗片段交替，與 v6 的實際finding相符。38/38 collection PASS、true native 0（191084ms）保留原樣；不可升格視覺PASS。

v6／v8對照原RGB樣本 [0,1,2] 及 [32,35,39]，同frame24、roundSec12、paused。v8 baseline最大adjacent mean5.33219、return2.56234；baseline pose span0.00421285m，return0.00123703m。數值是診斷而非自訂閃爍門檻。environment材料版本／opacity未變、light／shadow參數固定，不能以人物移動或water／Utility說明這段 frozen-frame 差异。

v8真marker readout已是depthWrite=false、depthTest=true、fill/zone/letter層序10/11/12，故原「marker共面＋預設depthWrite」的修補不足關閉視覺問題。這圈位於Bsite(26,58)，terrain elevation=0，不能歸咎平台坡面。

真環境mesh的B附近12三角Circle join中心(29.6200008,58.6199999)，半徑3.6、高度0.0320000015，與roadquads同高。局部另有(25.27,67.27)fan；共112個fan/road重疊pairs，pair-sum203.576m²（非union）。radial形狀及位置吻合可見圈內片段，證實真幾何重疊是待隔離問題。舊CPU「samepaint無害」不能作無閃爍放行。

**不能過度宣稱唯一根因。** 原UV確實不同，然而shader只用vMapUv選atlas cell；112對全部同[.5,0]、normal同+Y，albedo採majorWorldPosition.xz世界投影。因此原UV不同本身沒有證明最終texel不同；必須保留此界線。未改產品，未新開Browser／GPU。

已判讀12個movie各9個代表樣本，Dust II另看上述Before/After六樣本；全420sample僅逐一核SHA，沒有聲稱人工看完全部。overview/spectator/fixedPOV抽樣索引[0,1,7,8,16,31,32,35,39]；livePOV索引[0,3,6,9,12,15,17,18,19]。其餘11crop未見同型明顯跳閃。固定POV每圖40sample只有1個pixelSHA；livePOV實際frame24→32/33、位移12.021/10.707/10.664m，腿部／地坪透視變化屬真運動。這不是全圖或所有事件驗收。

三則既有.outputEncoding移除警告保留；page/console error與compile/link log無錯不能代表視覺正確，null program diagnostics不當PASS。手機FPS／觸控／視覺仍未真機實測。自有Chrome關閉/profileRemoved、CIM before/after0；0PNG，既有目錄16143811 bytes<16MiB。

完整來源SHA、每movie及rawRGB SHA、sample pose/material/lighting、真幾何及console在owner7-temporal-v8-visual-review.json。真mesh audit SHA ${report.evidence.geometrySha256}；420sample分析SHA ${report.evidence.metricsSha256}；本判讀JSON SHA ${sha(out)}。

工具修正：analyze_cs_temporal_stability.mjs 原native UNKNOWN文字只適用v6外PowerShell null，本次改為讀既有.exit.json真close記錄。沒有改斷言、門檻或舊v6 evidence；請Owner在Sprint新增工具理由。
`;
const mdOut=path.join(root,'OWNER7_TEMPORAL_V8_REVIEW.md');fs.writeFileSync(mdOut,md,{flag:'wx'});console.log(JSON.stringify({out,sha256:sha(out),markdown:mdOut,markdownSha256:sha(mdOut),classification:report.classification,collection:report.collection,console:gate.browserErrors,markerCount:sample.objectiveMarkers.length,archive:gate.archive}));
