import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='review/cs-major-upgrade/evidence/owner4-review-20261013',prefix='review/cs-major-upgrade/evidence/authenticity-closure-20261012/';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8')),sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const prior=read(dir+'/owner4-engineering-final.json'),preview=read(dir+'/preview-complete-proof.json'),delta=read(dir+'/ground-only-source-delta.json');
assert.equal(preview.status,'VERIFIED_PRISTINE_PREVIEW');assert.ok(delta.exactReverseMatches);assert.equal(delta.priorSource,prior.preview.sourceFingerprint.sha256);assert.equal(delta.currentSource,preview.sourceFingerprint.sha256);
const added=[];
for(const [name,stem,shape]of [['utility-ground-browser','owner4-utility-browser-ground-final-v2-20261014',/31\/31.*RESULT=PASS/],['formal-browser-complete','owner4-formal-browser-complete-20261014',/26\/26.*RESULT=PASS/],['pristine-build-complete','owner4-pristine-build-complete-20261014',/built in/],['preview-complete','owner4-preview-proof-complete-20261014',/VERIFIED_PRISTINE_PREVIEW/]]){
 const native=read(prefix+stem+'.exit.json');assert.equal(native.nativeExitCode,0);assert.match(fs.readFileSync(prefix+stem+'.stdout.log','utf8'),shape);added.push({name,prefix:prefix+stem,native,stdoutSha256:sha(prefix+stem+'.stdout.log'),stderrSha256:sha(prefix+stem+'.stderr.log')});
}
for(const folder of ['utility-browser-ground-final-v2','formal-browser-complete']){const g=read(dir+'/'+folder+'/gate.json');assert.equal(g.result.verdict,'PASS');assert.ok(g.result.evidence.cleanup.chromeClose.confirmed&&g.result.evidence.cleanup.chromeClose.profileRemoved);}
const report={...prior,completedAt:new Date().toISOString(),preview,previewPid:147032,executions:[...prior.executions,...added],validations:{...prior.validations,utilityBrowser:'31/31 including real objective rings/fills removed and two A/B letter meshes retained'},sourceScope:delta,priorReview:{file:dir+'/owner4-engineering-final.json',sha256:sha(dir+'/owner4-engineering-final.json')},groundMarkers:{majorObjectiveRings:false,majorObjectiveRoundFills:false,objectiveLetters:2,legacyUnchanged:true,bombObjectiveLogicUnchanged:true,actualPng:dir+'/utility-browser-ground-final-v2/dust2-smoke-paused-deploy.png',sha256:sha(dir+'/utility-browser-ground-final-v2/dust2-smoke-paused-deploy.png'),manualReview:'Root inspected actual PNG: floor B letter remains, circular outline/fill removed'},fixtureCorrection:'First ground gate 30/31 retained: objective-site tag applies to ring/fill/letter, so letter picker falsely included six objects. Corrected to exact PlaneGeometry+CanvasTexture; two-letter/visibility assertion not weakened, product untouched for this correction.',noBackgroundCsTest:true};
const file=dir+'/owner4-engineering-complete.json';fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});
const text=[
 '## 2026-10-14 最終四項收件：工程完成，Owner Review（本節優先）','',
 '最新桌機 [Owner Preview](http://localhost:5183/ESMO-/)。正式獨立 owner4-pristine-final-20261014，session39140／PID147032；source '+preview.sourceFingerprint.sha256+'，bundle '+preview.bundleSha256+'。HTTP200、HTML與全部JS逐byte同archive。',
 '最後地面記號包含道具圈／球尾與A/B固定圓環／圓形填色均移除，保留A/B字母。實Browser31/31＋新pristine正式Dashboard→CS→Battle→Result26/26，native0與自有Chrome cleanup confirmed/profileRemoved；root人工看B點新PNG無圈。',
 '最後兩個Major-only visible旗標精確反轉後，全部105份source/asset的SHA回到已驗LOD版本：ground-only-source-delta.json。所有simulation、pose、utility、shader、素材與controls不變，原contact12/12、tactical34/34、POV41/41（最壞5096<5200）、utility27/27與動作Browser29/29證據繼續有效，沒有重跑舊對局／30／55／B7。',
 '最後工具首輪30/31把objective-site共用tag六個物件誤算為字母；保留原失敗與native1，再以實PlaneGeometry+CanvasTexture精確挑兩個字母，兩字母及visibility門檻未放寬。後續未改產品或scene/frame救測試。',
 '主閱：review/cs-major-upgrade/OWNER4_CLOSURE.md；完整收件與所有native/streams證據索引：evidence/owner4-review-20261013/owner4-engineering-complete.json（SHA '+sha(file)+'）。前版所有source/hash/Preview收件只作歷史對照，本節為最新After。',
 'Legacy完整JSON同c9，但原安包0仍2/3/native1 NOT_TRIGGERED；未改seed洗綠。Owner專業CS體感、所有位置／全時間視覺與手機真機FPS/觸控仍待驗收。進度條與剩餘時間偏好已保存在AGENTS.md。',
 '■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner／真機驗收。工程剩餘0；Owner驗收時間由Owner安排。沒有CS背景測試仍跑，僅保留Review Preview服務。僅停止核對過的自有舊5183／PID175048再替換，其他舊Preview與foreign/MOBA／未知程序保留。未commit/push/deploy，不開始下一Sprint。','',
 ].join('\n');
for(const target of ['docs/handoff/00_目前專案狀態.md','docs/handoff/05_Sprint紀錄.md','docs/handoff/06_目前主幹架構.md','docs/handoff/08_目前待辦與風險.md','docs/design/CS_FPS_Major_Upgrade.md','review/cs-major-upgrade/OWNER4_CLOSURE.md'])fs.appendFileSync(target,'\n\n'+text);
for(const target of ['review/cs-major-upgrade/OWNER_REVIEW.md','review/cs-major-upgrade/AUTHENTICITY_CLOSURE.md']){const old=fs.readFileSync(target,'utf8'),breakAt=old.indexOf('\n')+1;fs.writeFileSync(target,old.slice(0,breakAt)+'\n'+text+'\n## 以下為歷史收件；狀態以最上方最新四項收件為準\n\n'+old.slice(breakAt));}
const checkpoint='review/cs-major-upgrade/RESUME_CHECKPOINT.md',old=fs.readFileSync(checkpoint,'utf8');fs.writeFileSync(checkpoint,'# ESMO CS Gameplay Authenticity：四項工程完成，Owner Review\n\n'+text+'\n## 以下為歷史停點，已由最上方完整收件取代\n\n'+old.replace(/^# .*\r?\n/,''));
const closure='review/cs-major-upgrade/OWNER4_CLOSURE.md';fs.writeFileSync(closure,fs.readFileSync(closure,'utf8').replace(/^# .*\r?\n/,'# Owner四項Gameplay修正：2026-10-14（工程完成，Owner Review）\n'));
console.log(JSON.stringify({status:report.status,file,sha256:sha(file),source:preview.sourceFingerprint.sha256,bundle:preview.bundleSha256,preview:preview.url,session:39140,pid:147032}));
