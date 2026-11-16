// 自然取得席位的正式Major BO3＋本場新Replay。只操作隔離Chrome存檔。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {readCsReplay} from '../src/battle/fps/fpsReplay.js';
import {clickFpsDNative,uploadFpsDNativeFile} from './browser/fpsReplayUiProbe.mjs';
const APP=process.env.CS_QUALITY_PREVIEW??'http://127.0.0.1:5190/ESMO-/',out=process.env.CS_QUALITY_OUT,saveFile=process.env.CS_NATURAL_SAVE;
if(!out||!saveFile||!fs.existsSync(out)||fs.existsSync(path.join(out,'browser-summary.json')))throw Error('Unique output and natural save required');
const save=JSON.parse(fs.readFileSync(saveFile,'utf8')),KEY='esmo.profile.v1',files=[];
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let result;
try{result=await runGate({name:'CS natural Major and new official Replay',externalUrl:APP,workspaceOnly:true,headless:true,timeoutMs:660000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
 const wait=async(expr,ms,label)=>{const end=Date.now()+ms;while(Date.now()<end){if(await chrome.evaluate(`return Boolean(${expr});`))return;await sleep(200);}throw new HarnessError(label+' timeout');};
 const native=selector=>clickFpsDNative({chrome,sleep,selector}),read=()=>chrome.evaluate(`return JSON.parse(localStorage.getItem('${KEY}'));`);
 const dialogs=[];chrome.on('Page.javascriptDialogOpening',d=>{dialogs.push(d);if(d.type==='confirm'&&d.message.includes('快速完成本場'))void chrome.send('Page.handleJavaScriptDialog',{accept:true});});
 await chrome.navigate(APP);await chrome.evaluate(`localStorage.setItem('${KEY}',${JSON.stringify(JSON.stringify(save))});return true;`);await chrome.reload();
 await wait(`document.querySelector('[data-testid="resume-active-match"]')`,30000,'natural fixture resume');await native('[data-testid="resume-active-match"]');
 await wait(`document.querySelector('[data-testid="cs-original-competition-pool"]')`,30000,'official opt-in');
 ck('自然Major正式BO3畫面',await chrome.evaluate(`return document.body.innerText.includes('BO3')&&document.body.innerText.includes('地圖 Veto');`));
 await native('[data-testid="cs-original-competition-pool"]');
 for(let i=0;i<5;i++){if(await chrome.evaluate(`return !document.querySelector('[data-testid="cs-map-confirm"]').disabled;`))break;const key=await chrome.evaluate(`return [...document.querySelectorAll('[data-map-key]')].find(b=>!b.disabled)?.dataset.mapKey;`);if(!key)throw new HarnessError('veto choice missing');await native(`[data-map-key="${key}"]`);}
 const launched=await read(),fixtureId=launched.matchmaking.session.origin.fixtureId,sessionId=launched.matchmaking.session.sessionId;
 await chrome.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.resolve(out),eventsEnabled:true});
 for(let index=0;index<3;index++){
  await native('[data-testid="cs-map-confirm"]');await wait(`document.querySelector('[data-testid="cs-tactic-confirm"]')`,30000,'tactic');await native('[data-testid="cs-tactic-confirm"]');
  await wait(`document.querySelector('[data-testid="cs-match-speed-controls"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,90000,'real scene ready');
  const active=await read(),config=active.matchmaking.session.activeMatch.config.csConfig;
  const visible=await chrome.evaluate(`const c=document.querySelector('canvas'),range=document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]');return {canvas:!!c&&c.getBoundingClientRect().width>0&&getComputedStyle(c).visibility==='visible',frames:Number(range?.max)+1,header:document.querySelector('.fps-cs-match-header')?.innerText};`);
  const live={map:config.mapKey,scene:config.sceneVersion,layout:active.matchmaking.session.mapSelection.competitionPoolSnapshot[config.mapKey].layoutId,frames:visible.frames};
  ck('新正式模擬與真實Canvas已就緒',visible.canvas&&live.frames>1000&&visible.header.includes(config.mapName));
  if(!await chrome.evaluate(`return document.querySelector('.fps-major-replay').open;`))await native('.fps-major-replay > summary');
  if(process.env.CS_REPLAY_COUNTEREXAMPLE){
   await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:path.resolve(process.env.CS_REPLAY_COUNTEREXAMPLE)});
   await wait(`document.querySelector('[data-testid="cs-replay-error"]')||document.querySelector('[data-testid="cs-replay-mode"]')`,90000,'native counterexample outcome');
   const error=await chrome.evaluate(`return document.querySelector('[data-testid="cs-replay-error"]')?.innerText??'';`);
   ck('本場原生匯出的Replay可重新匯入',!error,error);return;
  }
  const prior=new Set(fs.readdirSync(out));await native('[data-testid="cs-replay-export"]');
  let name;for(let t=0;t<480;t++){name=fs.readdirSync(out).find(n=>!prior.has(n)&&n.endsWith('.json.gz'));if(name)break;await sleep(250);}if(!name)throw new HarnessError('new official native Replay download missing');
  const bytes=fs.readFileSync(path.join(out,name));if(bytes.length>64*1024*1024)throw new HarnessError('Replay file budget exceeded');
  let wire=gunzipSync(bytes,{maxOutputLength:256*1024*1024}),replay=readCsReplay(wire.toString('utf8'));
  const receipt={file:name,sha256:createHash('sha256').update(bytes).digest('hex'),gzipBytes:bytes.length,wireBytes:wire.length,map:replay.metadata.mapKey,scene:replay.metadata.sceneVersion,layout:replay.simulation.mapLayoutId,seed:replay.metadata.seed,matchId:replay.rawResult.id,score:[replay.simulation.tScore,replay.simulation.ctScore],frames:replay.simulation.frames.length,rounds:replay.simulation.roundHist.length};
  ck('本場新Replay保留完整結果及身分',replay.simulation.completed&&receipt.map===live.map&&receipt.scene===live.scene&&receipt.layout===live.layout&&receipt.seed===active.matchmaking.session.seed&&receipt.frames===live.frames);
  ck('新Replay保存真實正式對手',replay.metadata.opponentName===active.matchmaking.session.opponent.name&&replay.rawResult.theirPlayers.length===5&&replay.rawResult.theirPlayers.every(p=>config.opponentSnapshot.actors.some(a=>a.name===p.name)));
  replay=null;wire=null;globalThis.gc?.();
  const beforeImport=await read(),progressBefore=digest({tx:beforeImport.processedMatchTransactions,h:beforeImport.csHistory});
  await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:path.resolve(out,name)});
  await wait(`document.querySelector('[data-testid="cs-replay-mode"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,90000,'own exported Replay ready');
  if(await chrome.evaluate(`return Boolean(document.querySelector('[aria-label="暫停比賽播放"]'));`))await native('[aria-label="暫停比賽播放"]');
  const cursor=await chrome.evaluate(`return Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]').value);`);await sleep(700);
  ck('保存幀可暫停且游標不自行前進',cursor===await chrome.evaluate(`return Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]').value);`));
  await native('[aria-label="播放比賽"]');await sleep(1300);
  ck('保存幀真實播放前進',await chrome.evaluate(`return Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]').value)>${cursor};`));
  await native('[data-testid="cs-replay-exit"]');await wait(`!document.querySelector('[data-testid="cs-replay-mode"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,90000,'return official match');
  const back=await read();ck('Replay沒有結算或污染正式賽',progressBefore===digest({tx:back.processedMatchTransactions,h:back.csHistory})&&back.matchmaking.session.sessionId===sessionId);
  await chrome.reload();await wait(`document.querySelector('[data-testid="resume-active-match"]')`,30000,'restore original match');await native('[data-testid="resume-active-match"]');
  await wait(`document.querySelector('[data-testid="cs-match-speed-controls"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,90000,'original match restored');
  const resumed=await read();ck('新Replay返回後重新整理仍恢復原場景',resumed.matchmaking.session.activeMatch.config.csConfig.sceneVersion===live.scene&&await chrome.evaluate(`return document.querySelector('.fps-cs-match-header').innerText.includes(${JSON.stringify(config.mapName)});`));
  // In-memory Replay mode is deliberately not persisted. Re-open the same
  // native file after reload to prove recoverability without writing frames to saves.
  if(!await chrome.evaluate(`return document.querySelector('.fps-major-replay').open;`))await native('.fps-major-replay > summary');
  await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:path.resolve(out,name)});await wait(`document.querySelector('[data-testid="cs-replay-mode"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,90000,'Replay reopen after reload');
  ck('重新整理後同一新Replay可重新開啟',await chrome.evaluate(`return Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]').max)+1===${receipt.frames};`));
  await native('[data-testid="cs-replay-exit"]');await wait(`!document.querySelector('[data-testid="cs-replay-mode"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,90000,'back to same match again');
  await chrome.evaluate(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('快速完成')).click();return true;`);
  await wait(`[...document.querySelectorAll('button')].some(b=>b.innerText.includes('查看賽後戰報'))`,45000,'true result');await chrome.evaluate(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('查看賽後戰報')).click();return true;`);
  await wait(`document.querySelector('[data-testid="cs-professional-report"]')`,45000,'professional report');
  const after=await read(),last=after.csHistory[0];
  ck('新Replay與正式戰報入史完全同一戰果',last.matchId===receipt.matchId&&last.sceneVersion===receipt.scene&&last.mapIdentity.layoutId===receipt.layout&&digest([last.ourScore,last.enemyScore])===digest(receipt.score));
  if(index===0){const shot=await chrome.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'natural-major-report.png'),Buffer.from(shot.data,'base64'),{flag:'wx'});}
  files.push(receipt);fs.writeFileSync(path.join(out,'new-replay-receipts.json'),JSON.stringify(files,null,2));
  if(after.matchmaking.session.series.status==='decided')break;
  await chrome.evaluate(`const b=[...document.querySelectorAll('button')].find(b=>b.innerText==='返回 Dashboard');b.click();return true;`);await wait(`document.querySelector('[data-testid="cs-map-confirm"]')`,30000,'next real series map');
 }
 const final=await read(),series=final.matchmaking.session.series;
 ck('自然Major BO3真實完成且至少兩勝',series.status==='decided'&&Math.max(series.wins.us,series.wins.opponent)===2);
 ck('新正式BO3地圖與Replay唯一',new Set(files.map(f=>f.map)).size===files.length&&new Set(files.map(f=>f.matchId)).size===files.length);
 ck('自然Major只產生唯一正式結果',final.competitionByMode.cs.outcomes.filter(o=>o.fixtureId===fixtureId).length===1);
 ck('所有快速完成均走原生確認',dialogs.length===files.length);
 const finalDigest=digest({tx:final.processedMatchTransactions,h:final.csHistory,cs:final.competitionByMode.cs});
 await chrome.reload();await wait(`document.querySelector('[data-testid="home-mode-cs"]')||document.querySelector('[data-testid="resume-active-match"]')`,30000,'settlement reload');
 const restored=await read();ck('自然Major結算重載冪等',finalDigest===digest({tx:restored.processedMatchTransactions,h:restored.csHistory,cs:restored.competitionByMode.cs}));
 fs.writeFileSync(path.join(out,'natural-major-done.save.json'),JSON.stringify(restored),{flag:'wx'});
 ck('Browser零例外',chrome.pageErrors.length===0&&chrome.consoleLines.filter(l=>l.startsWith('[error]')).length===0,JSON.stringify({page:chrome.pageErrors,console:chrome.consoleLines.filter(l=>l.startsWith('[error]'))}));
}});}catch(error){console.error(error.stack);result={verdict:'HARNESS_FAIL',failurePhase:error.stack};}
fs.writeFileSync(path.join(out,'browser-summary.json'),JSON.stringify({result,files},null,2),{flag:'wx'});finishGate(result);
