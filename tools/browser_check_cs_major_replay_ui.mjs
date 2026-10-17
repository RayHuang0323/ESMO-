#!/usr/bin/env node
// D production只讀probe。真UI／保存幀回看；不算正式Dashboard流程、不算真手機。
// 不建置、不模擬fixture、不清localStorage；archive須先由owner準備v2 callback probe。
// node tools/browser/run-gate.mjs tools/browser_check_cs_major_replay_ui.mjs --timeout 720000 -- --buildDir=<archive> --fixture=<compact-CsReplay.json.gz> --outDir=<new-evidence-directory>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { preview } from 'vite';
import { runGate, finishGate, HarnessError } from './browser/harness.mjs';
import { readCsReplay } from '../src/battle/fps/fpsReplay.js';
import { getFpsFrameMessages, groupFpsTeams, fmtFpsMoney } from '../src/battle/fps/fpsMatchUi.js';
import { readFpsDLayout, verifyFpsDLayout, clickFpsDNative, uploadFpsDNativeFile, seekFpsDAndRead, readFpsDReplayCounters } from './browser/fpsReplayUiProbe.mjs';

const started=Date.now(),args={};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalizeSimulation=sim=>({...sim,frames:sim.frames.map(({roundHist,...frame})=>({...frame,roundHist:sim.roundHist.slice(0,frame.roundHistCount??roundHist?.length??0)}))});
const browserSimulationDigest=`const s=window.__ESMO_FPS_SCENE__.liveRef.current.sim,normalized={...s,frames:s.frames.map(({roundHist,...frame})=>({...frame,roundHist:s.roundHist.slice(0,frame.roundHistCount??roundHist?.length??0)}))},digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(normalized)));return {sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join(''),frames:s.frames.length,players:s.players.length,map:s.mapKey,index:window.__ESMO_FPS_SCENE__.liveRef.current.fIdx,playing:window.__ESMO_FPS_SCENE__.liveRef.current.playing};`;
const within=(root,target)=>{const relative=path.relative(path.resolve(root),path.resolve(target));return Boolean(relative)&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
const counterEquality=(a,b)=>a.timingAvailable&&b.timingAvailable&&a.completionCalls!==null&&a.progressCalls!==null&&a.simulationCalls===b.simulationCalls&&a.completionCalls===b.completionCalls&&a.progressCalls===b.progressCalls;
let server,result,out,downloadDir,gateName='CS Major Replay UI D production';
const evidence={schema:'cs-major-replay-ui-browser.v1',status:'PREPARING',formalDashboardFlow:'NOT_RUN',realDevice:'NOT_RUN',screenshots:[],checks:[]};
try{
  for(const arg of process.argv.slice(2)){if(!arg.startsWith('--')||!arg.includes('='))throw new HarnessError('D參數必須--name=value');const at=arg.indexOf('=');args[arg.slice(2,at)]=arg.slice(at+1);}
  if(args.layoutOnly!==undefined&&!['true','false'].includes(args.layoutOnly))throw new HarnessError('layoutOnly只能true或false');
  const layoutOnly=args.layoutOnly==='true';evidence.layoutOnly=layoutOnly;
  if((args.layoutWidths!==undefined||args.skipReplayLayout!==undefined)&&!layoutOnly)throw new HarnessError('layoutWidths／skipReplayLayout只允許layoutOnly=true');
  if(args.layoutWidths!==undefined&&args.layoutWidths!=='320,360,390')throw new HarnessError('局部layoutWidths只允許已失敗三幅320,360,390');
  if(args.skipReplayLayout!==undefined&&args.skipReplayLayout!=='true')throw new HarnessError('skipReplayLayout只允許明確true');
  if((args.layoutWidths!==undefined)!==(args.skipReplayLayout==='true'))throw new HarnessError('三幅補驗必須同時指定layoutWidths=320,360,390與skipReplayLayout=true');
  const layoutWidths=args.layoutWidths?[320,360,390]:[320,360,390,430],skipReplayLayout=args.skipReplayLayout==='true';
  evidence.layoutWidths=layoutWidths;evidence.skipReplayLayout=skipReplayLayout;
  if(layoutOnly)gateName='CS Major Replay UI D layout scoped';
  if(!args.buildDir||!args.fixture||!args.outDir)throw new HarnessError('D gate必須提供buildDir、compact fixture及新的outDir');
  const buildDir=path.resolve(args.buildDir),archiveRoot=path.resolve('review/cs-major-upgrade/profile-builds');
  if(!within(archiveRoot,buildDir))throw new HarnessError('buildDir必須是本任務隔離archive子目錄');
  out=path.resolve(args.outDir);
  if(!within('review/cs-major-upgrade/evidence',out)||fs.existsSync(out)&&fs.readdirSync(out).length)throw new HarnessError('outDir必須是新的CS evidence子目錄，不覆寫既有證據');
  fs.mkdirSync(out,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(buildDir,'build-manifest.json'),'utf8'));
  if(manifest.version!==1||manifest.probeVersion!=='cs-major-readonly-scene.v2'||!manifest.sourceFingerprint?.sha256)throw new HarnessError('D gate需要同版v2 readonly scene＋callback production archive');
  const sourceFiles=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();
  const sourceHash=createHash('sha256');for(const file of sourceFiles){sourceHash.update(file+'\0');sourceHash.update(fs.readFileSync(file));sourceHash.update('\0');}
  if(sourceHash.digest('hex')!==manifest.sourceFingerprint.sha256||sourceFiles.length!==manifest.sourceFingerprint.files)throw new HarnessError('目前D產品與archive來源不同，不能借舊PASS／fixture接線');
  const bundleHash=createHash('sha256');let callbacks=false;
  for(const file of fs.readdirSync(path.join(buildDir,'assets')).filter(file=>file.endsWith('.js')).sort()){const bytes=fs.readFileSync(path.join(buildDir,'assets',file));bundleHash.update(file+'\0');bundleHash.update(bytes);if(bytes.includes(Buffer.from('__ESMO_CS_D_CALLBACK_PROBE__')))callbacks=true;}
  if(bundleHash.digest('hex')!==manifest.bundleSha256||!callbacks)throw new HarnessError('archive bundle不一致或未含D callback唯讀probe');
  const fixtureBytes=fs.readFileSync(args.fixture),fixture=readCsReplay((args.fixture.endsWith('.gz')?gunzipSync(fixtureBytes):fixtureBytes).toString('utf8'));
  evidence.archive={buildDir,sourceFingerprint:manifest.sourceFingerprint,bundleSha256:manifest.bundleSha256,probeVersion:manifest.probeVersion};
  evidence.fixture={path:args.fixture,fileSHA256:sha(fixtureBytes),metadata:fixture.metadata,frames:fixture.simulation.frames.length};
  const fixtureMetadata=fixture.metadata,fixtureFrameCount=fixture.simulation.frames.length;
  // 掛載前釋放Node fixture大物件；browser oracle只比較同一Chrome的export/import。
  fixture.simulation.frames=[];fixture.simulation.roundHist=[];
  let brokenFile;
  if(!layoutOnly){const tempRoot=path.resolve('review/cs-major-upgrade/tmp');fs.mkdirSync(tempRoot,{recursive:true});downloadDir=fs.mkdtempSync(path.join(tempRoot,'d-browser-download-'));brokenFile=path.join(downloadDir,'broken-replay.json');fs.writeFileSync(brokenFile,'{not a replay}\n',{flag:'wx'});}
  server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false}});
  const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
  result=await runGate({name:gateName,externalUrl:url,headless:false,workspaceOnly:true,timeoutMs:650000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
    const check=(label,ok,detail)=>{ck(label,Boolean(ok),detail?JSON.stringify(detail):'');evidence.checks.push({label,ok:Boolean(ok),detail:detail??null});};
    const poll=async(fn,ms=6000)=>{const end=Date.now()+ms;do{const value=await fn();if(value)return value;await sleep(150);}while(Date.now()<end);return null;};
    const scopedLayout=async label=>{const measured=await readFpsDLayout(chrome);check(`${label} 真canvas／range／radio前提`,Object.values(measured.precondition).every(Boolean),measured.precondition);check(`${label} 主要播放／鏡頭／離開觸控至少44px`,measured.controls.length>0&&measured.controls.every(control=>control.width>=44&&control.height>=44),measured.controls);check(`${label} 文件與主要HUD無水平overflow`,!measured.documentOverflow&&!measured.bodyOverflow&&measured.clipped.length===0,{width:measured.width,clipped:measured.clipped});return{status:'LAYOUT_SCOPED',measured};};
    await chrome.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
    await chrome.navigate(`${url}?c5c=battle&map=${encodeURIComponent(fixtureMetadata.mapKey)}&seed=${fixtureMetadata.seed}`);
    const mounted=await poll(()=>chrome.evaluate(`return Boolean(document.querySelector('canvas')&&document.querySelector('[data-testid="cs-playback-controls"]')&&window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==='rigged'));`),150000);
    if(!mounted)throw new HarnessError('D Battle啟動／十人rigged等待逾時，未進入產品情境');
    const ready=await chrome.evaluate(`return {range:!!document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]'),radio:!!document.querySelector('[data-testid="cs-major-radio"]'),export:!!document.querySelector('[data-testid="cs-replay-export"]'),import:document.querySelector('[data-testid="cs-replay-import"]')?.type==='file',map:window.__ESMO_FPS_SCENE__.liveRef.current.sim.mapKey,scene:window.__ESMO_FPS_SCENE__.liveRef.current.sim.sceneVersion,frameText:document.body.innerText.match(/\\d+\\/\\d+ 格/)?.[0]||null};`);
    const precondition=ready.range&&ready.radio&&ready.export&&ready.import&&ready.frameText&&ready.map===fixtureMetadata.mapKey&&ready.scene===fixtureMetadata.sceneVersion;
    check('正式D元件真UI／場景前提',precondition,ready);if(!precondition)return;
    const toggleSelector=await chrome.evaluate(`const button=[...document.querySelectorAll('[data-testid="cs-playback-controls"] button')].find(node=>['❚❚','▶'].includes(node.textContent.trim()));if(!button)return null;return '[data-testid="cs-playback-controls"] button:nth-of-type('+([...button.parentElement.children].filter(n=>n.tagName==='BUTTON').indexOf(button)+1)+')';`);
    check('原生暫停播放入口存在',Boolean(toggleSelector));if(!toggleSelector)return;
    if(await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.liveRef.current.playing;`))await clickFpsDNative({chrome,sleep,selector:toggleSelector});
    const paused=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__.liveRef.current;return {playing:s.playing,index:s.fIdx,ui:Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]').value)};`);
    check('UI暫停與權威游標一致',!paused.playing&&paused.index===paused.ui,paused);if(paused.playing)return;
    const screenshot=async name=>{if(evidence.screenshots.length>=2)throw new HarnessError('D最多兩張代表UI screenshot');await chrome.evaluate(`document.querySelector('[data-testid="cs-playback-controls"]')?.scrollIntoView({block:'center',behavior:'instant'});return true;`);await sleep(100);const shot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name),Buffer.from(shot.data,'base64'));evidence.screenshots.push({file:name,scope:'UI_VIEWPORT_ONLY',viewport:await chrome.evaluate('return {width:innerWidth,height:innerHeight};')});};
    const radioOpen=await chrome.evaluate(`return document.querySelector('[data-testid="cs-major-radio"]').open;`);
    if(!radioOpen)await clickFpsDNative({chrome,sleep,selector:'[data-testid="cs-major-radio"] summary'});
    const replayDetails=await chrome.evaluate(`const button=document.querySelector('[data-testid="cs-replay-export"]'),details=button?.closest('details');return details?{open:details.open,summary:!!details.querySelector('summary')}:null;`);
    if(replayDetails&&!replayDetails.open)await clickFpsDNative({chrome,sleep,selector:'.fps-major-replay > summary'});
    for(const width of layoutWidths){
      await chrome.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:2,mobile:true});await sleep(180);
      const layout=layoutOnly?await scopedLayout(`D ${width}px`):await verifyFpsDLayout({chrome,ck:check,label:`D ${width}px`});
      (evidence.layouts??=[]).push(layout);if(!layoutOnly&&width===390)await screenshot('d-battle-390-ui.png');
    }
    if(layoutOnly){
      if(skipReplayLayout){evidence.skippedPreviouslyPassedLayouts=['430px normal','430px replay'];evidence.alreadyPassedFullBehavior='NOT_REPEATED：430px兩種layout及原full48個PASS行為';return;}
      await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:path.resolve(args.fixture)});
      const imported=await poll(()=>chrome.evaluate(`const e=document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]'),s=window.__ESMO_FPS_SCENE__.liveRef.current;return document.querySelector('[data-testid="cs-replay-mode"]')?.textContent?.includes('重播')&&Number(e?.value)===0&&Number(e?.max)===${fixtureFrameCount-1}&&!s.playing;`),30000);
      check('原生fixture匯入真重播起點／保存幀數／暫停前提',Boolean(imported),{fixture:args.fixture,frames:fixtureFrameCount});if(!imported)return;
      evidence.replayLayout=await scopedLayout('D 430px匯入重播');
      evidence.alreadyPassedFullBehavior='NOT_REPEATED：export／SHA／換邊／訊息／seek／終局／callback／normal exit';
      return;
    }
    const baseline=await readFpsDReplayCounters(chrome);
    check('正式callback與模擬計數probe前提',baseline.timingAvailable&&baseline.progressCalls!==null&&baseline.completionCalls!==null,baseline);
    if(!baseline.timingAvailable||baseline.progressCalls===null||baseline.completionCalls===null)return;
    const downloadEvents=[];chrome.on('Browser.downloadProgress',value=>downloadEvents.push(value));
    await chrome.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir,eventsEnabled:true});
    const originalDigest=await chrome.evaluate(browserSimulationDigest);
    await clickFpsDNative({chrome,sleep,selector:'[data-testid="cs-replay-export"]'});
    const downloaded=await poll(()=>{const files=fs.readdirSync(downloadDir).filter(file=>/\.json(?:\.gz)?$/.test(file)&&file!=='broken-replay.json');return files.length===1&&downloadEvents.some(event=>event.state==='completed')?path.join(downloadDir,files[0]):null;},30000);
    check('原生匯出完成且下載唯一真JSON／gzip',Boolean(downloaded),{downloads:downloadEvents.map(e=>({state:e.state,bytes:e.receivedBytes}))});if(!downloaded)return;
    const downloadedBytes=fs.readFileSync(downloaded),downloadIsGzip=downloaded.endsWith('.gz');let exportedBytes,exported,exportError;
    try{exportedBytes=downloadIsGzip?gunzipSync(downloadedBytes):downloadedBytes;exported=readCsReplay(exportedBytes.toString('utf8'));}catch(error){exportError=error.message;}
    check('原生匯出檔可解壓及通過完整Replay驗證',Boolean(exported),{error:exportError??null});if(!exported)return;
    const exportedDigest=sha(JSON.stringify(normalizeSimulation(exported.simulation)));
    check('匯出保存同Chrome完整simulation與frames',exportedDigest===originalDigest.sha256&&exported.simulation.frames.length===originalDigest.frames,{originalDigest,exportedDigest});
    check('匯出不模擬／不寫Progress／不completion',counterEquality(baseline,await readFpsDReplayCounters(chrome)));
    fs.writeFileSync(path.join(out,'exported-cs-replay.json.gz'),downloadIsGzip?downloadedBytes:gzipSync(exportedBytes,{level:6}),{flag:'wx'});
    evidence.export={file:'exported-cs-replay.json.gz',nativeDownloadGzip:downloadIsGzip,downloadBytes:downloadedBytes.length,jsonBytes:exportedBytes.length,jsonSHA256:sha(exportedBytes),simulationSHA256:exportedDigest,digestPolicy:'all-fields; move-roundHist-property-last-only'};
    await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:downloaded});
    const imported=await poll(()=>chrome.evaluate(`return document.querySelector('[data-testid="cs-replay-mode"]')?.textContent?.includes('重播')&&Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]')?.value)===0;`),30000);
    check('原生匯入建立可見重播模式與起點',Boolean(imported));if(!imported)return;
    const importedDigest=await chrome.evaluate(browserSimulationDigest);
    check('匯入完整欄位未變且預設暫停',importedDigest.sha256===exportedDigest&&importedDigest.frames===originalDigest.frames&&!importedDigest.playing,importedDigest);
    check('匯入不模擬／不寫Progress／不completion',counterEquality(baseline,await readFpsDReplayCounters(chrome)));
    evidence.replayLayout=await verifyFpsDLayout({chrome,ck:check,label:'D 430px匯入重播'});
    const saved=exported.simulation,firstTeam=groupFpsTeams(saved.frames[0]),switchIndex=saved.frames.findIndex(frame=>frame.players.find(player=>player.id===firstTeam.us[0].id)?.side!==firstTeam.us[0].side);
    const messageIndex=saved.frames.findIndex((frame,index)=>index>0&&frame.comms?.length>0&&getFpsFrameMessages(saved.frames,index).comms.length>0);
    check('保存幀具有真換邊／通訊場景前提',switchIndex>0&&messageIndex>0,{switchIndex,messageIndex});if(switchIndex<=0||messageIndex<=0)return;
    const switched=await seekFpsDAndRead({chrome,sleep,index:switchIndex}),expectedTeams=groupFpsTeams(saved.frames[switchIndex]);
    check('原生seek到真换邊frame且UI回合成立',switched.ui.index===switchIndex&&Boolean(switched.ui.frameText),switched.ui);
    check('换邊後UI仍為原隊伍五人／真金額',switched.ui.teams.length===2&&['us','enemy'].every((team,index)=>JSON.stringify(switched.ui.teams[index].playerIds)===JSON.stringify(expectedTeams[team].map(p=>p.id))&&switched.ui.teams[index].text.includes(fmtFpsMoney(expectedTeams[team].reduce((sum,p)=>sum+(p.money||0),0)))),{ui:switched.ui.teams,expected:expectedTeams.us.map(p=>p.id)});
    const message=await seekFpsDAndRead({chrome,sleep,index:messageIndex}),expectedMessages=getFpsFrameMessages(saved.frames,messageIndex);
    check('原生seek真通訊窗口與UI完全一致',message.ui.radioRows.length===expectedMessages.comms.length&&expectedMessages.comms.every((comm,index)=>message.ui.radioRows[index]?.includes(comm.name)&&message.ui.radioRows[index]?.includes(comm.text)),message.ui.radioRows);
    await sleep(500);const still=await chrome.evaluate(`return {index:Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]').value),rows:[...document.querySelectorAll('[data-testid="cs-major-radio"] li')].map(node=>node.textContent)};`);
    check('暫停保持游標與通訊不增殖',still.index===messageIndex&&JSON.stringify(still.rows)===JSON.stringify(message.ui.radioRows),still);
    const rewind=await seekFpsDAndRead({chrome,sleep,index:0}),startMessages=getFpsFrameMessages(saved.frames,0);
    check('倒帶清除未來通訊、只顯示起點真窗口',rewind.ui.radioRows.length===startMessages.comms.length&&startMessages.comms.every((comm,index)=>rewind.ui.radioRows[index]?.includes(comm.text)),rewind.ui.radioRows);
    await seekFpsDAndRead({chrome,sleep,index:saved.frames.length-2});
    await clickFpsDNative({chrome,sleep,selector:toggleSelector});
    const terminal=await poll(()=>chrome.evaluate(`const e=document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]');return Number(e?.value)===Number(e?.max)&&!window.__ESMO_FPS_SCENE__.liveRef.current.playing;`),10000);
    check('重播真播放進最後保存幀並停止',Boolean(terminal));
    check('seek／倒帶／重播終局不模擬／不Progress／不completion',counterEquality(baseline,await readFpsDReplayCounters(chrome)));
    await seekFpsDAndRead({chrome,sleep,index:messageIndex});
    const beforeBroken=await readFpsDReplayCounters(chrome);
    await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:brokenFile});
    const readableError=await poll(()=>chrome.evaluate(`const node=document.querySelector('[data-testid="cs-replay-error"]');return node&&/[\\u3400-\\u9fff]/.test(node.textContent)?node.textContent:null;`));
    check('損壞JSON提供可讀中文錯誤',Boolean(readableError)&&!/SyntaxError|Unexpected token|stack|schema/i.test(readableError),{error:readableError});
    const afterBroken=await chrome.evaluate(`return {index:Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]').value),mode:document.querySelector('[data-testid="cs-replay-mode"]')?.textContent||null};`);
    check('壞檔保留原重播游標與模式',afterBroken.index===messageIndex&&afterBroken.mode?.includes('重播'),afterBroken);
    const afterBrokenDigest=await chrome.evaluate(browserSimulationDigest);
    check('壞檔保留完整保存simulation內容',afterBrokenDigest.sha256===exportedDigest,{afterBrokenDigest,exportedDigest});
    await seekFpsDAndRead({chrome,sleep,index:0});
    check('壞檔後仍可原生seek且無副作用',counterEquality(beforeBroken,await readFpsDReplayCounters(chrome)));
    await screenshot('d-replay-430-ui.png');
    await chrome.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const reduced=await chrome.evaluate(`const nodes=[...document.querySelectorAll('.fps-major-battle *')],visible=nodes.filter(n=>n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0);return {enabled:matchMedia('(prefers-reduced-motion: reduce)').matches,animated:visible.filter(n=>{const s=getComputedStyle(n);return s.animationName!=='none'&&s.animationDuration!=='0s';}).length,mode:document.querySelector('[data-testid="cs-replay-mode"]')?.textContent};`);
    check('reduced-motion停動態且保留重播文字',reduced.enabled&&reduced.animated===0&&reduced.mode?.includes('重播'),reduced);
    evidence.counters={before:baseline,after:await readFpsDReplayCounters(chrome)};
    const beforeExit=await readFpsDReplayCounters(chrome),exitVisible=await chrome.evaluate(`return Boolean(document.querySelector('[data-testid="cs-replay-exit"]'));`);
    check('重播返回原比賽入口存在',exitVisible);if(!exitVisible)return;
    await clickFpsDNative({chrome,sleep,selector:'[data-testid="cs-replay-exit"]'});
    const restoredCursor=await poll(()=>chrome.evaluate(`return !document.querySelector('[data-testid="cs-replay-mode"]')?.textContent?.includes('重播')&&Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]')?.value)===${originalDigest.index};`),6000);
    check('返回原比賽即時還原先前保存游標',Boolean(restoredCursor),{expectedCursor:originalDigest.index});
    if(await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.liveRef.current.playing;`))await clickFpsDNative({chrome,sleep,selector:toggleSelector});
    const afterExit=await readFpsDReplayCounters(chrome),normalDigest=await chrome.evaluate(browserSimulationDigest);
    check('返回原比賽沿用完整原sim、不重新模擬',afterExit.simulationCalls===beforeExit.simulationCalls&&normalDigest.sha256===originalDigest.sha256,{beforeExit,afterExit,normalDigest});
    evidence.normalExit={restoredCursor:Boolean(restoredCursor),beforeExit,afterExit,digest:normalDigest};
    check('D scope console／page error零',chrome.pageErrors.length===0&&chrome.consoleLines.filter(line=>line.startsWith('[error]')).length===0,{page:chrome.pageErrors,console:chrome.consoleLines.filter(line=>line.startsWith('[error]'))});
  }});
}catch(error){
  result={verdict:'HARNESS_FAIL',pass:0,fail:0,elapsedMs:Date.now()-started,failurePhase:String(error.stack||error)};
  console.error(`${gateName}：0/0 RESULT=HARNESS_FAIL ${error.message}`);
}finally{
  if(server)try{await Promise.race([new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve())),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('D preview close timeout')),6000);timer.unref();})]);}catch(error){result={...result,verdict:'HARNESS_FAIL',failurePhase:'D preview cleanup: '+error.message};}
  if(downloadDir){const root=path.resolve('review/cs-major-upgrade/tmp');if(within(root,downloadDir)&&path.basename(downloadDir).startsWith('d-browser-download-')){try{fs.rmSync(downloadDir,{recursive:true,force:true});evidence.downloadCleanup='CONFIRMED_OWN_TMP_ONLY';}catch(error){evidence.downloadCleanup=error.message;}}else evidence.downloadCleanup='REFUSED_SCOPE';}
  evidence.status=result?.verdict||'HARNESS_FAIL';evidence.result=result;
  if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(evidence,null,2));
}
console.log(`${gateName} final: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict||'HARNESS_FAIL'}`);
await finishGate(result);
