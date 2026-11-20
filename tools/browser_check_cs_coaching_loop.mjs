import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative} from './browser/fpsReplayUiProbe.mjs';
import {buildCsCoachingAdvice} from '../src/battle/fps/csCoachingAdvice.js';
import {calculateCourse} from '../src/data/playerModel.js';
import {toFpsRoster} from '../src/battle/fps/fpsRoster.js';
const APP=process.env.CS_COACH_PREVIEW??'http://127.0.0.1:5192/ESMO-/',input=process.env.CS_COACH_SAVE,out=process.env.CS_COACH_OUT;
if(!input||!out||!fs.existsSync(out)||fs.existsSync(path.join(out,'loop-summary.json')))throw Error('Unique output and genuine save required');
const save=JSON.parse(fs.readFileSync(input,'utf8')),report=save.csHistory.find(result=>buildCsCoachingAdvice({result,history:save.csHistory,players:save.players}).cards.some(c=>!c.capped&&!c.alreadyTraining));
if(!report)throw Error('Genuine report precondition missing');
const card=buildCsCoachingAdvice({result:report,history:save.csHistory,players:save.players}).cards[0],hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let result;const evidence={reportId:report.matchId,playerId:card.playerId,courseId:card.course.id};
try{result=await runGate({name:'CS real report coaching training next battle',externalUrl:APP,workspaceOnly:true,headless:true,timeoutMs:360000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
 const wait=async(expr,ms,label)=>{const end=Date.now()+ms;while(Date.now()<end){if(await chrome.evaluate(`return Boolean(${expr});`))return;await sleep(200);}throw new HarnessError(label+' timeout');};
 const native=selector=>clickFpsDNative({chrome,sleep,selector}),read=()=>chrome.evaluate(`return JSON.parse(localStorage.getItem('esmo.profile.v1'));`),shape=s=>({players:s.players.map(p=>({id:p.id,stats:p.stats,training:p.training,growthLog:p.growthLog})),tx:s.processedMatchTransactions,history:(s.csHistory||[]).map(r=>r.matchId)});
 const screenshot=async name=>{const shot=await chrome.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name),Buffer.from(shot.data,'base64'),{flag:'wx'});};
 await chrome.navigate(APP);await chrome.evaluate(`localStorage.setItem('esmo.profile.v1',${JSON.stringify(JSON.stringify(save))});return true;`);await chrome.navigate(APP);
 await wait(`document.querySelector('[data-testid="home-mode-cs"]')`,30000,'normal dashboard');
 await native('[data-testid="home-mode-cs"]');
 await wait(`document.querySelector('[data-testid="prep-start-practice"]')`,30000,'normal CS prep');
 await chrome.evaluate(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('歷史')).click();return true;`);
 await wait(`document.querySelector('[data-testid="cs-history-open-report"]')`,10000,'normal CS history');
 await native('[data-testid="cs-history-open-report"][data-match-id="'+report.matchId+'"]');
 await wait(`document.querySelector('[data-testid="cs-professional-report"]')`,30000,'real saved report');
 ck('首頁CS歷史可開啟真戰報，無須手動開發網址',await chrome.evaluate(`return new URL(location.href).searchParams.get('csMatchId')===${JSON.stringify(report.matchId)};`));
 const before=await read(),playerBefore=before.players.find(p=>p.id===card.playerId),preview=calculateCourse(playerBefore,card.course.id);
 evidence.before={player:playerBefore,day:before.meta.days};fs.writeFileSync(path.join(out,'before-training.save.json'),JSON.stringify(before),{flag:'wx'});
 ck('真戰報比分與五個分頁存在',await chrome.evaluate(`return ['overview','team','player','round','coaching'].every(k=>document.querySelector('[data-testid="cs-report-tab-'+k+'"]'))&&document.body.innerText.includes(${JSON.stringify(report.teamName)});`));
 for(const [tab,selector] of [['team',null],['player','[data-testid="cs-report-player-select"]'],['round','[data-testid="cs-report-round-select"]'],['overview','[data-testid="cs-ten-player-table"]']]){await native('[data-testid="cs-report-tab-'+tab+'"]');ck('既有戰報分頁 '+tab+' 仍可操作',await chrome.evaluate(tab==='team'?`return [...document.querySelectorAll('h2')].some(h=>h.innerText==='首殺後的回合掌握');`:`return Boolean(document.querySelector(${JSON.stringify(selector)}));`));}
 await native('[data-testid="cs-report-tab-coaching"]');await wait(`document.querySelector('[data-testid="cs-coaching-go-training"]')`,10000,'real supported coaching');
 ck('建議顯示真實選手課程體力成本與資料來源',await chrome.evaluate(`const p=document.querySelector('[data-testid="cs-coaching-panel"]');return p.innerText.includes(${JSON.stringify(card.playerName)})&&p.innerText.includes(${JSON.stringify(card.course.name)})&&p.innerText.includes('體力')&&p.innerText.includes('$0.0萬')&&p.querySelectorAll('[data-player-id]').length<=3;`));
 await screenshot('coaching-desktop.png');
 ck('桌機保留原網格導覽與觸控尺寸',await chrome.evaluate(`const n=document.querySelector('.cs-report-tabs');return n.dataset.mobile==='false'&&getComputedStyle(n).display==='grid'&&[...n.children].every(b=>b.getBoundingClientRect().height>=44);`));
 for(const width of [320,360,430,390]){await chrome.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});ck(width+'px培養建議無水平溢出且新操作至少44px',await chrome.evaluate(`const b=document.querySelector('[data-testid="cs-coaching-go-training"]').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&b.height>=44;`));}
 for(const width of [320,390,430]){
  await chrome.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(250);
  ck(width+'px五分頁同列且只在導覽內橫向滑動',await chrome.evaluate(`const nav=document.querySelector('.cs-report-tabs'),buttons=[...nav.children],ys=buttons.map(b=>b.getBoundingClientRect().top);return nav.dataset.mobile==='true'&&Math.max(...ys)-Math.min(...ys)<1&&buttons.every(b=>b.getBoundingClientRect().height>=44)&&nav.scrollWidth>nav.clientWidth&&document.documentElement.scrollWidth<=innerWidth+1;`));
  ck(width+'px縮放後選中分頁完整可見',await chrome.evaluate(`const n=document.querySelector('.cs-report-tabs'),a=n.querySelector('[aria-pressed="true"]'),r=a.getBoundingClientRect(),b=n.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1;`));
  ck(width+'px獎勵資訊完整且沒有超出戰報',await chrome.evaluate(`const p=document.querySelector('[data-testid="reward-receipt-summary"]'),r=p?.getBoundingClientRect();return !!r&&r.left>=0&&r.right<=innerWidth&&p.innerText.includes('獎金')&&p.innerText.includes('選手 XP');`));
  ck(width+'px長選手名稱可換行且不撐開卡片',await chrome.evaluate(`const name=document.querySelector('.cs-coaching-person strong'),old=name.textContent;name.textContent='ExtremelyLongPlayerName_測試長選手名稱_012345678901234567890';const card=name.closest('.cs-coaching-card'),ok=document.documentElement.scrollWidth<=innerWidth+1&&name.getBoundingClientRect().right<=card.getBoundingClientRect().right;name.textContent=old;return ok;`));
  await screenshot('report-tabs-'+width+'.png');
 }
 await chrome.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await chrome.evaluate(`const nav=document.querySelector('.cs-report-tabs');nav.scrollIntoView({block:'center'});nav.scrollLeft=0;return true;`);await sleep(150);
 const strip=await chrome.evaluate(`const r=document.querySelector('.cs-report-tabs').getBoundingClientRect();return {x:r.right-25,y:r.top+22};`);
 await chrome.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:strip.x,y:strip.y}]});
 for(let i=1;i<=5;i++)await chrome.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:strip.x-i*35,y:strip.y}]});
 await chrome.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(300);
 ck('原生觸控滑動可揭露培養分頁',await chrome.evaluate(`return document.querySelector('.cs-report-tabs').scrollLeft>0;`));
 await native('[data-testid="cs-report-tab-overview"]');await native('[data-testid="cs-report-tab-coaching"]');
 ck('選中分頁會保持可見且唯一選取狀態',await chrome.evaluate(`const nav=document.querySelector('.cs-report-tabs'),a=nav.querySelector('[aria-pressed="true"]'),r=a.getBoundingClientRect(),n=nav.getBoundingClientRect();return nav.querySelectorAll('[aria-pressed="true"]').length===1&&a.dataset.testid==='cs-report-tab-coaching'&&r.left>=n.left-1&&r.right<=n.right+1;`));
 await screenshot('coaching-390.png');
 await chrome.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 ck('減少動態時保留資訊並停止卡片進場',await chrome.evaluate(`return getComputedStyle(document.querySelector('.cs-coaching-card')).animationName==='none'&&document.querySelector('[data-testid="cs-coaching-gains"]').innerText.includes('→');`));await chrome.send('Emulation.setEmulatedMedia',{features:[]});
 ck('只看建議未改能力或發獎',hash(shape(before))===hash(shape(await read())));
 await native('[data-testid="cs-coaching-go-training"]');await wait(`document.querySelector('[data-testid="cs-training-review"]')`,10000,'existing training prefill');
 ck('既有Training預選同一選手與課程',await chrome.evaluate(`const p=document.querySelector('[data-testid="cs-training-review"]');return p.dataset.playerId===${JSON.stringify(card.playerId)}&&p.dataset.courseId===${JSON.stringify(card.course.id)};`));
 ck('跳轉不會自動安排課程',!(await read()).players.find(p=>p.id===card.playerId).training);
 await chrome.reload();await wait(`document.querySelector('[data-testid="cs-training-confirm"]')`,30000,'prefill reload');
 ck('預選重新整理仍待玩家確認',!(await read()).players.find(p=>p.id===card.playerId).training);
 ck('390pxTraining確認無水平溢出',await chrome.evaluate(`return document.documentElement.scrollWidth<=innerWidth+1;`));
 // Two clicks exercise the real existing action's duplicate scheduling guard.
 const clicks=await chrome.evaluate(`const read=()=>{const s=JSON.parse(localStorage.getItem('esmo.profile.v1'));return s;};const b=document.querySelector('[data-testid="cs-training-confirm"]');b.click();const once=read();b.click();return {once,twice:read()};`);
 ck('重複確認不重扣費用體力或改寫正式戰績',hash(clicks.once)===hash(clicks.twice));
 await wait(`document.querySelector('[data-testid="cs-training-active"]')`,10000,'legitimate scheduled course');
 const scheduled=await read(),scheduledPlayer=scheduled.players.find(p=>p.id===card.playerId),days=scheduledPlayer.training.totalDays;
 ck('重複確認只安排一次且未提前成長',scheduledPlayer.training.courseId===card.course.id&&hash(scheduledPlayer.stats)===hash(playerBefore.stats)&&hash(scheduledPlayer.growthLog)===hash(playerBefore.growthLog));
 ck('安排課程沒有新增比賽獎勵',hash(scheduled.processedMatchTransactions)===hash(before.processedMatchTransactions));
 await chrome.reload();await wait(`document.querySelector('[data-testid="cs-training-active"]')`,30000,'active training restore');
 ck('訓練進度由合法存檔恢復',(await read()).players.find(p=>p.id===card.playerId).training.daysLeft===days);
 for(let i=0;i<days;i++)await native('[data-testid="training-advance-day"]');
 const after=await read(),trained=after.players.find(p=>p.id===card.playerId),entry=trained.growthLog.find(e=>e.source==='training'&&e.courseId===card.course.id);
 ck('正常推進訓練日完成',!trained.training&&after.meta.days===before.meta.days+days);
 ck('真實能力變化與既有calculator一致',Object.entries(preview.statChanges).every(([k,c])=>trained.stats[k]===c.after));
 ck('唯一合法成長紀錄保留後值',Boolean(entry)&&Object.entries(preview.gains).every(([k,v])=>entry.gains[k]===v&&entry.after[k]===trained.stats[k])&&trained.growthLog.filter(e=>e.id===entry.id).length===1);
 evidence.after={player:trained,day:after.meta.days,entry,preview};fs.writeFileSync(path.join(out,'after-training.save.json'),JSON.stringify(after),{flag:'wx'});
 await screenshot('training-complete-390.png');
 await chrome.reload();await wait(`document.querySelector('[data-testid="cs-training-saved-growth"]')`,30000,'saved growth restore');
 const restored=await read();ck('成長重整不重複且前後值可見',hash(restored.players.find(p=>p.id===card.playerId))===hash(trained)&&await chrome.evaluate(`return document.querySelector('[data-testid="cs-training-saved-growth"]').innerText.includes('→');`));
 // Return via the existing ManageFrame button, then the original report action.
 await native('[aria-label="返回"]');
 await wait(`document.querySelector('[data-testid="cs-professional-report"]')`,10000,'back real report');
 await chrome.evaluate(`[...document.querySelectorAll('button')].find(b=>b.innerText==='返回 Dashboard').click();return true;`);
 await wait(`document.querySelector('[data-testid="home-mode-cs"]')`,30000,'dashboard');await native('[data-testid="home-mode-cs"]');
 await wait(`document.querySelector('[data-testid="prep-start-practice"]')`,30000,'CS prep');await native('[data-testid="cs-practice-map-inferno"]');await native('[data-testid="prep-start-practice"]');
 await wait(`document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action==='confirm'||document.querySelector('[data-testid="cs-map-confirm"]')`,60000,'practice room');
 if(await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action==='confirm';`))await native('[data-testid="prep-primary-action"]');
 await wait(`document.querySelector('[data-testid="cs-map-confirm"]')`,30000,'practice map');await native('[data-testid="cs-original-map-prototype"]');
 // Observe real Worker input only; never replace simulation or result values.
 await chrome.evaluate(`window.__csCoachWorkerArgs=null;const original=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){if(Array.isArray(message?.args))window.__csCoachWorkerArgs=structuredClone(message.args);return original.call(this,message,...rest);};return true;`);
 await native('[data-testid="cs-map-confirm"]');await wait(`document.querySelector('[data-testid="cs-tactic-confirm"]')`,30000,'next tactic');await native('[data-testid="cs-tactic-confirm"]');
 await wait(`document.querySelector('[data-testid="cs-match-speed-controls"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,90000,'actual next original simulation');
 const args=await chrome.evaluate(`return window.__csCoachWorkerArgs;`),next=await read(),expected=toFpsRoster(next.players,next.csLineup).find(p=>p._gid===card.playerId),actual=args?.[4]?.find(p=>p._gid===card.playerId);
 ck('下一場真Worker消費更新後能力',Boolean(actual)&&hash(actual.stats)===hash(expected.stats));
 ck('下一場原創場景完成模擬就緒',args?.[6]==='major.v5'&&await chrome.evaluate(`const c=document.querySelector('canvas');return !!c&&getComputedStyle(c).visibility==='visible'&&Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]').max)>1000;`));
 evidence.nextSimulation={args,expected,actual,scope:'real next quick-practice Worker; formal BO1/BO3 regressions separate'};fs.writeFileSync(path.join(out,'next-worker-input.json'),JSON.stringify(evidence.nextSimulation,null,2),{flag:'wx'});
 ck('整段未重複發正式獎勵',hash(next.processedMatchTransactions)===hash(before.processedMatchTransactions));
 // Use the actual just-launched session, rather than fabricate a series state.
 await chrome.navigate(APP+'?csCoach=report&csMatchId='+encodeURIComponent(report.matchId));
 await wait(`document.querySelector('[data-testid="cs-professional-report"]')`,30000,'active match report');await native('[data-testid="cs-report-tab-coaching"]');
 ck('真實未完成場次阻擋戰報安排訓練',await chrome.evaluate(`return document.querySelector('[data-testid="cs-coaching-go-training"]').disabled&&document.body.innerText.includes('請先完成目前比賽或系列賽');`));
 await chrome.navigate(APP+'?csCoach=training&csMatchId='+encodeURIComponent(report.matchId)+'&csPlayerId='+encodeURIComponent(card.playerId)+'&csCourseId='+encodeURIComponent(card.course.id));
 await wait(`document.querySelector('[data-testid="cs-training-confirm"]')`,30000,'active match training');
 ck('重新整理直達訓練仍阻擋未完成場次',await chrome.evaluate(`return document.querySelector('[data-testid="cs-training-confirm"]').disabled&&document.body.innerText.includes('請先完成目前比賽或系列賽');`));
 // Compatibility counterexample: remove optional analytics/identity from an
 // actual history row; scores/results are never fabricated or replaced.
 const compatibility=structuredClone(next),old=compatibility.csHistory.find(r=>r.matchId===report.matchId);delete old.analytics;delete old.mapIdentity;
 await chrome.navigate(APP);await chrome.evaluate(`localStorage.setItem('esmo.profile.v1',${JSON.stringify(JSON.stringify(compatibility))});return true;`);await chrome.navigate(APP+'?csCoach=report&csMatchId='+encodeURIComponent(report.matchId));
 await wait(`document.querySelector('[data-testid="cs-professional-report"]')`,30000,'old optional fields report');await native('[data-testid="cs-report-tab-coaching"]');
 ck('舊戰報缺選用資料顯示不足且不猜建議',await chrome.evaluate(`return document.querySelector('[data-testid="cs-coaching-insufficient"]').innerText.includes('資料不足')&&!document.querySelector('[data-testid="cs-coaching-go-training"]');`));
 evidence.compatibility='Actual historical row with optional analytics/mapIdentity removed only; no altered match scores or winner';
 ck('Browser零產品例外',chrome.pageErrors.length===0&&chrome.consoleLines.filter(l=>l.startsWith('[error]')).length===0,JSON.stringify({page:chrome.pageErrors,console:chrome.consoleLines.filter(l=>l.startsWith('[error]'))}));
}});}catch(error){console.error(error.stack);result={verdict:'HARNESS_FAIL',failurePhase:error.stack};}
fs.writeFileSync(path.join(out,'loop-summary.json'),JSON.stringify({result,evidence},null,2),{flag:'wx'});finishGate(result);
