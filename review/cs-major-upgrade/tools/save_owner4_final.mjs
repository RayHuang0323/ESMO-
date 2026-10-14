import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='review/cs-major-upgrade/evidence/owner4-review-20261013';
const prefix='review/cs-major-upgrade/evidence/authenticity-closure-20261012/';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const preview=read(dir+'/preview-lod-final-proof.json');
assert.equal(preview.status,'VERIFIED_PRISTINE_PREVIEW');
const executions=[];
for(const [name,stem,shape] of [
 ['action-browser','owner4-action-browser-lod-final-20261014',/29\/29.*RESULT=PASS/],
 ['utility-browser','owner4-utility-browser-lod-final-20261014',/29\/29.*RESULT=PASS/],
 ['formal-browser','owner4-formal-browser-lod-final-20261014',/26\/26.*RESULT=PASS/],
 ['pristine-build','owner4-pristine-build-lod-final-20261014',/built in/],
 ['preview-http','owner4-preview-proof-lod-final-20261014',/VERIFIED_PRISTINE_PREVIEW/],
 ]){
 const native=read(prefix+stem+'.exit.json');assert.equal(native.nativeExitCode,0);
 assert.match(fs.readFileSync(prefix+stem+'.stdout.log','utf8'),shape);
 executions.push({name,prefix:prefix+stem,native,stdoutSha256:sha(prefix+stem+'.stdout.log'),stderrSha256:sha(prefix+stem+'.stderr.log')});
}
for(const folder of ['action-browser-lod-final','utility-browser-lod-final','formal-browser-lod-final']){
 const gate=read(dir+'/'+folder+'/gate.json');assert.equal(gate.result.verdict,'PASS');
 assert.ok(gate.result.evidence.cleanup.chromeClose.confirmed&&gate.result.evidence.cleanup.chromeClose.profileRemoved);
}
assert.equal(Number(fs.readFileSync(dir+'/pov-weapon-contract-lod-final.runner.exit.txt','utf8')),0);
assert.match(fs.readFileSync(dir+'/pov-weapon-contract-lod-final.segment.log','utf8'),/41\/41 PASS/);
const utility=read('review/cs-major-upgrade/evidence/owner4-utility-audit-20261013/actual-fx-models-cache-final-20261014.native.json');assert.equal(utility.nativeExitCode,0);
const contact=read(dir+'/contact-runtime-v1.json'),tactical=read(dir+'/tactical-runtime-final.json'),legacy=read(dir+'/legacy-exact-after.json');
assert.equal(contact.summary.pass,12);assert.equal(contact.summary.fail,0);assert.equal(tactical.pass,34);assert.equal(tactical.fail,0);
const visual={scope:'Actual native saved-frame screenshots; no image edits; no whole-time RGB/FPS/professional-quality claim',
 inspected:['action-browser-lod-final/plant.png','action-browser-lod-final/utility-release.png'].map(file=>({file,sha256:sha(dir+'/'+file)})),
 findings:['最終LOD安包雙手不交叉且持C4；投擲前臂接到上臂，袖口沒有浮在半空。','真1× Browser已觀測draw/R2fire/positivehit/blind；短窗draw/R2 PNG缺失保留NOT_TRIGGERED，不冒稱已拍到。','前版三張道具部署PNG已人工看；後續只有cache接點更改，部署Sprite/authority參數未變。這些PNG不證明爆炸峰值或全時間效果。'],realDevice:'NOT_RUN',ownerFeel:'OWNER_REVIEW_REQUIRED'};
const output=dir+'/owner4-engineering-final.json';assert.ok(!fs.existsSync(output));
const report={status:'ENGINEERING_READY_OWNER_REVIEW',completedAt:new Date().toISOString(),preview,executions,
 sourceScope:'Final Browser/build/HTTP share latest source. Existing contact/tactical simulations retained: subsequent changes only presentation null guard, hand poses, LOD and model cache, no simulation logic change.',
 validations:{contact:'12/12',tactical:'34/34',pov:'41/41',utility:'27/27',renderer:'13/13',arm:'23/23',awareness:'15/15',queue:'9/9',povClock:'9/9',utilityRules:'37/37',weaponHandling:'21/21',heArmor:'14/14',actionBrowser:'29/29',utilityBrowser:'29/29',formalBrowser:'26/26'},
 legacy:{report:dir+'/legacy-exact-after.json',gate:'2/3 native1 NOT_TRIGGERED',reason:'原seed真安包0；完整JSON SHA同c9，不改seed或放寬斷言'},visual,
 preservedFailures:['scheduler fractional cadence','negative modulo scan','null.dead PRODUCT_FAIL 28/29','POV old catalogue 39/40; then real 5200 budget fail 39/40; corrected without increasing limit','supervisor missing --: HARNESS_FAIL 0/0'],
 limitations:['Owner實際體感、所有位置閃爍、完整移動/戰術行為仍需驗收；不宣稱專業CS水準。','手機真機FPS/觸控/窄畫面姿態/音效未實測；cloudflared不在環境，未自行安裝或給無法用的區網位址。','保留Legacy NOT_TRIGGERED與所有完整失敗logs；未commit/push/deploy，未開始下一Sprint。'],previewPid:175048,noBackgroundCsTest:true,existingOlderPreviewsRetained:true};
fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});
const source=preview.sourceFingerprint.sha256,bundle=preview.bundleSha256;
const shared=`最新桌機 [Owner Preview](http://localhost:5183/ESMO-/)，pristine \`owner4-pristine-lod-20261014\`、session51662／PID175048。source \`${source}\`；bundle \`${bundle}\`。HTTP200、HTML與全部JS逐byte同archive；最終動作Browser29/29、utility Browser29/29、pristine正式Dashboard→CS→Battle→Result26/26，全部native0與自有Chrome cleanup confirmed。主閱：\`review/cs-major-upgrade/OWNER4_CLOSURE.md\`、\`evidence/owner4-review-20261013/owner4-engineering-final.json\`。`;
const sections={
 'docs/handoff/00_目前專案狀態.md':`## 2026-10-14：Owner四項Gameplay修正工程收件\n\n${shared}\n\nMajor獨立actor射擊、同毫秒雙向射擊、權威POV槍火與命中、原創真比例道具／安包／受閃屏、無utility圈／球尾、公開情報的轉角預瞄／減速／真peek已接入。三圖contact12/12、tactical34/34；後續只改呈現，保留有效對局不重跑。POV嚴格成本41/41、最大flash5096tri低於原5200；utility27/27。Legacy完整JSON同c9，但原安包0仍2/3/native1 NOT_TRIGGERED。\n\n■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner體感／真機驗收。工程剩餘0；Owner驗收時間由Owner安排。無CS背景測試仍跑，僅保留Preview服務；未commit/push/deploy，不開始下一Sprint。`,
 'docs/handoff/05_Sprint紀錄.md':`## 2026-10-14：Owner四項Gameplay與成本守門修復\n\n${shared}\n\n明顯敵人3–5秒不射的pair reservation／勝者排程改為Major actor chronological queue，保留真reaction/ammo/cadence與16素質；same-ms可雙向成立。POV shotAt改roundSec同時間域，真hit/damage metadata驅動命中回饋。C4蹲姿互動／四型手持物／事件姿態、煙0.9秒grow、HE dust與自身blindSec白屏可讀；utility地面圈及球尾依Owner要求移除，smoke LOS與HE/MOLLY傷害未改，HE防彈衣14/14。導航scan/corner只自身route與TTL情報，真safe out/back；normal Mirage返回32／Dust5，Inferno本seed peek未觸發，不把啟動當成功。\n\n驗證：contact12/12、tactical34/34、awareness15/15、queue9/9、POVclock9/9、arm23/23、renderer13/13、utility規則37/37、weapon21/21、continuity9/9、最終POV41/41與utility27/27。完整streams/native/checkpoint已存；原Legacy2/3 NOT_TRIGGERED、first scheduler fractional cadence、angle負%、Browser28/29 null.dead及所有初輪fixture紅燈不覆寫。\n\nVerifier同步原因：frame.ts舊fixture補真roundSec並保留跨回合ts反例；woven mesh2→3為真投擲上臂，bridge共享geometry/material且兩端／袖口守門；新增nullActor、四type×3cycle，shape37→40→41。舊5200全樹成本真紅6458，沒有放寬門檻：同原cloth bake離線LOD780→202（原檔不變、bounds exact、UV/normal/color保留、最大原vertex→LODsurface10.96mm），factory只掛當前四parts／保留boundedcache，最壞flash5096<5200。四type循環與dispose仍嚴格驗證。C5B.2 Group picker替代球材質／固定204objects，原軌跡／落點／展開連續斷言保留，新增pause旋轉與圈/尾跡0，growth fixture在真grow窗口取樣。\n\n■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner體感／真機驗收；工程剩餘0。`,
 'docs/handoff/06_目前主幹架構.md':`## 2026-10-14：CS Major四項修正接點\n\nMajor \`fpsDirectedShotQueue.js\`以actor取得reaction/cadence/weapon ready機會，沒有victim reservation；同ms death延後至該ms機會結束。Legacy保留原排程與全JSON對照。 \`fpsAwarenessSteering.js\`只讀自己的route、公用node與TTL隊伍intel，產生有界view angle/corner pace；peek透過既有safe導航改真route，沒有renderer假移動。\n\n\`fpsActionPose.js\`由saved utility events/lastUtility及真plant/defuse progress求有限姿態；renderer在mixer前restore，再解真骨長arm pose，暫時釋放weapon grip，最後sync衣料anchors。POV同event/roundSec時計，nullActor fail closed，confirmed-hit只真positive damage，盲屏只blindSec。原創 \`fpsUtilityModels.js\`共用不可變幾何／材質、每slot只掛四個當前型parts，其他型私有mesh留boundedcache，factory末一釋放；world/POV使用同metre-scale定義。POV cloth增加離線LOD檔，無runtime簡化或cloth solver，原bake與人物GLB不改。\n\n${shared}\n\nMOBA/Store/Reward/Router本輪未改；未push/deploy。■ 接點實作｜■ 必要驗證｜□ Owner實際體感／真機驗收。`,
 'docs/handoff/08_目前待辦與風險.md':`## 2026-10-14：四項修正後Owner Review邊界\n\n${shared}\n\n工程收件完成；Owner仍需驗收近敵反應、戰術合理性、整段投擲／爆炸／煙／閃光、第一人稱命中與走位體感，不能由Node或數張PNG宣布專業CS水準。最終LOD人工看安包／投擲兩張；draw/R2短窗PNG未拍到即NOT_TRIGGERED，真1×telemetry已非空。三圖微操有完整／被中斷／未觀測完整返回的不同結果，Inferno peek本seed未觸發；每frame的scan/corner樣本不是戰術強度KPI。手機FPS/觸控/窄畫面姿態與音效未實測；cloudflared缺，沒有自行全域安裝。\n\nLegacy原seed安包0保留NOT_TRIGGERED，2/3/native1；全JSON同c9。原39/40私有模型6458tri真紅已修成41/41最壞5096tri，5200門檻未放寬；完整紅燈與修正理由具名保存。沒有CS背景測試仍跑，僅保留各版Preview；未commit/push/deploy，不開始下一Sprint。■ 工程修正｜■ 必要驗證｜■ 收件｜□ Owner／真機驗收；工程剩餘0。`,
};
for(const [file,body]of Object.entries(sections))fs.appendFileSync(file,'\n\n'+body+'\n');
const checkpoint='review/cs-major-upgrade/RESUME_CHECKPOINT.md',previous=fs.readFileSync(checkpoint,'utf8');
const top=`# ESMO CS Gameplay Authenticity：Owner四項工程完成，Owner Review\n\n## 最終最新停點：2026-10-14台北（本節優先）\n\n${shared}\n\n本輪四項修正與必要檢查完成，修過null actor例外／手臂交叉／浮動袖口與原5200成本紅燈。最終POV41/41最高5096tri、utility27/27；contact12/12與tactical34/34保留有效結果，後續只呈現更改，未重舊30/55/B7。詳細native/streams/checkpoint與局部未觸發情境見owner4-engineering-final.json與OWNER4_CLOSURE.md。Legacy仍2/3/native1 NOT_TRIGGERED，但全JSON同c9。\n\n現只留Preview服務，新5183=session51662/PID175048，5182/5181/5180舊版保留；已核對自有舊5183=PID182708並停止替換，未動foreign/MOBA／未知行程。無CS背景測試仍執行。root goal仍未新建；Owner體感與手機真機未驗收。未commit/push/deploy，不開始下一Sprint；一般後續細節仍依AGENTS.md授權自主處理。■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner／真機驗收；工程剩餘0，Owner驗收時間由Owner安排。\n\n`;
fs.writeFileSync(checkpoint,top+previous.replace(/^# .*\r?\n/,''));
fs.appendFileSync('review/cs-major-upgrade/OWNER4_CLOSURE.md',`\n\n## 最終LOD收件（優先於上方pre-LOD收件）\n\n${shared}\n\n私有tree原6458真紅→離線cloth LOD與四part slot修正後，四型HE4724／flash5096／smoke4448／molly4634，strict5200與全部41條原斷言/新反例通過；utility27條含cache/resource檢查。最終source Browser兩支29/29與pristine26/26。root人工看LOD最終plant/release兩張，R2fire/draw短窗PNG未捕獲則NOT_TRIGGERED，真Browser同情境已觀測。源bake與人物GLB未改；LOD最大表面取樣偏差10.96mm、bounds/UV/normal/color保留；沒有宣稱完全相同皺摺。上方舊pristine/preview/source/hash只作pre-LOD對照，不是最新After。\n\n■ 修正｜■ 必要驗證｜■ Preview/文件｜□ Owner／真機驗收；工程剩餘0。\n`);
console.log(JSON.stringify({status:report.status,report:output,sha256:sha(output),preview:preview.url,source,bundle,documents:Object.keys(sections)}));
