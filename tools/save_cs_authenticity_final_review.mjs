// Review saved evidence only: no simulation, browser, outcome thresholds or product mutation.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fpsAuthenticitySourceDomain} from './lib/fpsAuthenticitySourceDomain.mjs';
const root='review/cs-major-upgrade/evidence/authenticity-closure-20261012';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const acceptancePath='tools/.cs-major-verifier-recovery/authenticity-final55-v11-acceptance-corrected-review-20261013.json';
const acceptance=read(acceptancePath),dir=root+'/owner7-temporal-v11-inferno-clean-retry-20261013';
const gate=read(dir+'/gate.json'),analysis=read(root+'/owner7-temporal-v11-inferno-clean-retry-analysis.json');
const native=read(dir+'.exit.json'),build=read(root+'/final-v11-pristine-build-20261013.exit.json');
const labels=read(root+'/final-v11-canonical-labels-guard-fixed-20261013/gate.json');
const labelNative=read(root+'/final-v11-canonical-labels-guard-fixed-20261013.exit.json');
if(native.nativeExitCode!==0||gate.result.pass!==16||analysis.evidence.samples!==140||build.nativeExitCode!==0||labelNative.nativeExitCode!==0||labels.result.pass!==8)throw Error('Actual completed evidence preconditions missing');
const current=fpsAuthenticitySourceDomain();
if(current.hashes['src/battle/fps/EsportsFPS3D.jsx']!=='d435c4bdeb422c8f1eb36f5ac22970b6181eb70900c034a0c379ae50b023c2fe')throw Error('Product changed since v11 evidence');
const rows=acceptance.unused.filter(r=>r.purchasedAcrossMatch>=2).map(r=>{
 const rounds=r.roundContexts;
 return {match:r.matchId,player:r.playerId,role:r.role,type:r.type,purchased:r.purchasedAcrossMatch,
  inventoryRoundObservations:rounds.length,tSideObservations:rounds.filter(c=>c.actualSide==='t').length,ctSideObservations:rounds.filter(c=>c.actualSide==='ct').length,
  reachedTargetObservations:rounds.filter(c=>c.reachedTargetSite).length,deathObservations:rounds.filter(c=>c.deaths.length).length,
  liveReasons:r.liveNoUseReasons,decision:'OPEN_REVIEW',
  explanation:'真購入與零投擲均保留；換邊按actualSide判讀。死亡／未抵點／用途受限是事實，不能證明每次購買合理；purchase purpose未保存，仍UNKNOWN。'};
});
if(rows.length!==45)throw Error('Unexpected unused row count');
const visual={schema:'cs-inferno-v11-sampled-visual-review.v1',savedAt:new Date().toISOString(),
 classification:'SAMPLED_NO_SAME_FLICKER_OBSERVED',native,gateSha256:sha(dir+'/gate.json'),analysisSha256:sha(root+'/owner7-temporal-v11-inferno-clean-retry-analysis.json'),
 series:gate.series.map(s=>({mode:s.cameraMode,movie:s.movie,viewedIndices:s.cameraMode==='pov-live'?[0,1,2,10,15,19]:[0,1,2,32,35,39],reviewer:'root',observation:'保存的原RGB樣本未見同型放射明暗跳閃；人物遮擋與真移動不當成閃爍。'})),
 all140SampleShaVerified:true,newDiskPngs:0,near:gate.nearClipChecks,console:gate.browserErrors,cleanup:gate.result.evidence.cleanup,
 limitations:['只看四序列各6代表影格，共24；不是全部140影格的人工動態驗收。','96×64 ROI不涵蓋全圖、所有事件／角度或真手機。','原Inferno timeout及Mirage清理HARNESS_FAIL保留，不升格原gate PASS。']};
const report={schema:'cs-authenticity-v11-final-owner-review.v1',savedAt:new Date().toISOString(),
 status:'OWNER_REVIEW_WITH_OPEN_ITEMS',fullGameplayClosure:'NOT_CLOSED_UTILITY_PURCHASE_PURPOSE_OPEN',
 acceptance:{path:acceptancePath,sha256:sha(acceptancePath),assessment:acceptance.assessment,accounting:acceptance.executionAccounting},
 source:current,build,pristineBundle:labels.archive,labels:{native:labelNative,result:labels.result,scope:labels.scope,battleLabels:labels.battleLabels,resultLabels:labels.resultLabels,staleConfigOrResultName:labels.staleConfigOrResultName},
 tactical:{families:acceptance.tacticalFamilies,routes:acceptance.routeDifferences,causalErrors:acceptance.causalErrorKinds,coverageMissing:acceptance.coverageMissing},
 utility:{rows,sourceSafety:'T lurker full/force kit只smoke/flash；本表所有lurker HE/molly的庫存觀測均在CT換邊。Pistol flash保留。',counterMethod:acceptance.noUseCounterMethod,
 decision:'未證明有合法投擲窗口而不投，不以率或死亡次數判bug；同時未證明所有反覆購入合理。保留45列OPEN_REVIEW，不刪道具／隨機投擲／放寬斷言。'},
 visualReview:root+'/final-v11-inferno-visual-review-20261013.json',
 boundaries:['本輪產品source未修改；只修pristine gate的assignment辨識，原失敗保存。','沒有重跑55對局、三圖temporal、B7或MOBA。','手機FPS／觸控／safe-area／實際光影與音效未經真機實測。','無commit／push／deploy；goal工具本次回null。']};
for(const [p,data]of [[root+'/final-v11-inferno-visual-review-20261013.json',visual],[root+'/final-v11-owner-review-20261013.json',report]])fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const table=['| 對局／角色 | 道具／新買 | 庫存回合觀測 T/CT | 抵目標點／死亡 | 判讀 |','|---|---|---:|---:|---|',...rows.map(r=>`| ${r.match}／${r.player} ${r.role} | ${r.type}／${r.purchased} | ${r.tSideObservations}/${r.ctSideObservations} | ${r.reachedTargetObservations}/${r.deathObservations} | OPEN_REVIEW |`)];
fs.writeFileSync(root+'/final-v11-utility-review-20261013.md','# Utility 反覆購入零投擲：45列逐份審核\n\n來源：`'+acceptancePath+'`，SHA256 `'+sha(acceptancePath)+'`。沒有重跑simulation。\n\n'+report.utility.decision+'\n\n'+report.utility.sourceSafety+'\n\n庫存回合觀測包含carry，不是新買次數；死亡是該玩家該回合有保存死亡事件，不是策略動機。CT的target是隊伍當前目標，未抵該點不代表未到自己的守點。個別trueLiveNoUseReasons及全部roundContexts保留在原檔，counter是呼叫觀測數，非秒／道具個數。\n\n'+table.join('\n')+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,fullGameplayClosure:report.fullGameplayClosure,reviewedRows:rows.length,infernoSamples:24,buildNative:build.nativeExitCode,labelsPass:labels.result.pass,newSimulation:false}));
