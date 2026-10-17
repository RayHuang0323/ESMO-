#!/usr/bin/env node
// labels-only pristine 正式 UI；停在選圖頁，不進Battle、不QuickFinish、不發獎。
// supervisor: node tools/browser/run-gate.mjs <this> --timeout 240000 -- --buildDir=<dist> --outDir=<new> --bundleSha256=<owner SHA>
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preview} from 'vite';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative,clickFpsFormalButtonByText} from './browser/fpsReplayUiProbe.mjs';
const name='CS Canonical Map Labels Only',args={},sha=b=>createHash('sha256').update(b).digest('hex');
const expected={mirage:'Mirage',dust2:'Dust II',inferno:'Inferno'};
const inside=(a,b)=>{const r=path.relative(a,b);return Boolean(r)&&!r.startsWith('..')&&!path.isAbsolute(r);};
let out,server,result;
const evidence={schema:'cs-canonical-map-labels-browser.v1',scope:'正式選圖三卡名稱與選圖確認文字；不證明Battle／Result舊中文name優先情境。',battleLabels:'NOT_OBSERVED',resultLabels:'NOT_OBSERVED',staleConfigOrResultName:'NOT_OBSERVED',simulationRequested:false,localStorageCleared:false,localStorageSeeded:false,domPatched:false,completionRequested:false,screenshots:[],checks:[],nativeClicks:[],maps:[]};
try{
 for(const a of process.argv.slice(2)){const m=/^--(buildDir|outDir|bundleSha256)=(.+)$/.exec(a);if(!m||args[m[1]])throw new HarnessError('只接受唯一buildDir/outDir/bundleSha256');args[m[1]]=m[2];}
 if(!args.buildDir||!args.outDir||!/^[a-f0-9]{64}$/.test(args.bundleSha256||''))throw new HarnessError('必須指定已完成pristine build、新evidence與owner固定bundle SHA');
 const workspace=fs.realpathSync(process.cwd()),buildDir=fs.realpathSync(path.resolve(args.buildDir)),evidenceRoot=fs.realpathSync('review/cs-major-upgrade/evidence');out=path.resolve(args.outDir);
 if(!inside(workspace,buildDir)||!fs.existsSync(path.join(buildDir,'index.html'))||!inside(evidenceRoot,out)||fs.existsSync(out))throw new HarnessError('只用工作區既有build與新CS evidence，不覆寫');
 const assetDir=path.join(buildDir,'assets'),scripts=fs.readdirSync(assetDir).filter(f=>f.endsWith('.js')).sort(),hash=createHash('sha256');let hasProbe=false;
 if(!scripts.some(f=>f.startsWith('index-'))||!scripts.some(f=>f.startsWith('fpsSim.worker-')))throw new HarnessError('缺正式app/worker artifact');
 // Teardown legitimately compares the DEV scene handle with ===. Reject an
 // injected assignment, without mistaking that comparison for an injection.
 for(const f of scripts){const b=fs.readFileSync(path.join(assetDir,f));hash.update(f+'\0');hash.update(b);hasProbe ||= b.includes(Buffer.from('__ESMO_CS_D_CALLBACK_PROBE__'))||/window\.__ESMO_FPS_SCENE__=(?!=)/.test(b.toString('utf8'));}
 const actual=hash.digest('hex');if(actual!==args.bundleSha256||hasProbe)throw new HarnessError('pristine或owner bundle SHA前提不成立；不改source或build');
 fs.mkdirSync(out,{recursive:true});if(!inside(evidenceRoot,fs.realpathSync(out)))throw new HarnessError('evidence resolved path越界');
 evidence.archive={buildDir,bundleSha256:actual,indexSha256:sha(fs.readFileSync(path.join(buildDir,'index.html'))),jsFiles:scripts.length,hasProbe,sourceAssociation:'owner固定pristine bundle SHA；fresh source由owner build紀錄綁定'};
 server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false}});const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
 result=await runGate({name,externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:210000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
  const check=(label,ok,detail=null)=>{ck(label,Boolean(ok),JSON.stringify(detail));evidence.checks.push({label,ok:Boolean(ok),detail});return Boolean(ok);};
  const poll=async(expr,ms,label)=>{const end=Date.now()+ms;while(Date.now()<end){if(await chrome.evaluate(`return Boolean(${expr});`))return;await sleep(200);}evidence.failureUI=await chrome.evaluate('return {url:location.href,text:document.body.innerText.slice(0,1800),buttons:[...document.querySelectorAll("button")].slice(0,30).map(e=>({text:e.innerText.slice(0,60),testid:e.dataset.testid}))};');throw new HarnessError(label+' 前置UI未成立，不借其他畫面PASS');};
  const click=async selector=>evidence.nativeClicks.push(await clickFpsDNative({chrome,sleep,selector}));
  await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await chrome.navigate(url);
  await poll('document.querySelector("[data-testid=home-mode-cs]")',30000,'Dashboard');
  if(!check('正式Dashboard CS入口，不走query捷徑',await chrome.evaluate('return !!document.querySelector("[data-testid=home-mode-cs]")&&location.search==="";')))return;
  await click('[data-testid="home-mode-cs"]');
  await poll('document.querySelector("[data-testid=prep-primary-action]")&&document.body.innerText.includes("CS 賽前準備")',20000,'CS prep');
  if(await chrome.evaluate('return document.querySelector("[data-testid=prep-primary-action]")?.dataset.action==="blocked";'))await clickFpsFormalButtonByText({chrome,sleep,text:'自動填入',exact:false});
  await poll('document.querySelector("[data-testid=prep-primary-action]")?.dataset.action==="enqueue"',15000,'原生五人補位');
  const prep=await chrome.evaluate('const e=document.querySelector("[data-testid=prep-primary-action]");return {tier:document.querySelector("[data-testid=prep-tier-banner]")?.dataset.tier,action:e.dataset.action,disabled:e.disabled};');
  if(!check('真一般配對prep入口可用',prep.tier==='competitive'&&prep.action==='enqueue'&&!prep.disabled,prep))return;
  await click('[data-testid="prep-primary-action"]');
  await poll('document.querySelector("[data-testid=cs-map-confirm]")||document.querySelector("[data-testid=prep-primary-action]")?.dataset.action==="confirm"',90000,'ready-check／map');
  if(await chrome.evaluate('return document.querySelector("[data-testid=prep-primary-action]")?.dataset.action==="confirm";'))await click('[data-testid="prep-primary-action"]');
  await poll('document.querySelector("[data-testid=cs-map-confirm]")',25000,'正式選圖');
  const map=await chrome.evaluate('return {title:document.querySelector("h2")?.innerText,kind:document.querySelector("[data-testid=cs-map-selection-kind]")?.innerText,keys:[...document.querySelectorAll("button[data-map-key]")].map(e=>e.dataset.mapKey),battle:!!document.querySelector("[data-testid=cs-match-speed-controls]"),url:location.href};');
  if(!check('真正式選圖UI有三個canonical key且尚未進Battle',map.title==='選擇地圖'&&map.kind?.includes('一般對戰')&&map.keys.length===3&&Object.keys(expected).every(k=>map.keys.includes(k))&&!map.battle&&!new URL(map.url).search, map))return;
  for(const [key,label]of Object.entries(expected)){
   const row=await chrome.evaluate(`const e=document.querySelector('button[data-map-key="${key}"]');if(!e)return null;e.scrollIntoView({block:'center'});const title=e.querySelector('div > span'),r=title?.getBoundingClientRect(),style=title?getComputedStyle(title):null,hit=r?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2):null;return {key:e.dataset.mapKey,label:title?.innerText||null,text:e.innerText,selected:e.dataset.vetoState==='selected',visible:!!r&&r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&style.visibility==='visible'&&style.display!=='none'&&!!hit&&e.contains(hit)};`);
   evidence.maps.push(row);check(`${key}可見真UI名稱為${label}`,row?.key===key&&row.visible&&row.label===label,row);
  }
  const confirmation=await chrome.evaluate('const e=document.querySelector("[data-testid=cs-map-confirm]");e.scrollIntoView({block:"center"});return {text:e.innerText,disabled:e.disabled,selected:[...document.querySelectorAll("button[data-map-key][data-veto-state=selected]")].map(e=>e.dataset.mapKey)};');
  const selected=confirmation.selected[0];check('選圖確認文字由真selected key顯示canonical name',confirmation.selected.length===1&&expected[selected]&&confirmation.text===`確認地圖「${expected[selected]}」· 部署戰術`,confirmation);
  // 停在選圖頁；不按確認、不讀/寫store、不點QuickFinish/Result，不重發獎。
  const errors={page:chrome.pageErrors,console:chrome.consoleLines.filter(s=>s.startsWith('[error]'))};check('labels-only page／console error零',errors.page.length===0&&errors.console.length===0,errors);
 }});
 const cleanup=result.evidence?.cleanup?.chromeClose;if(cleanup&&(!cleanup.confirmed||cleanup.profileRemoved===false))result={...result,verdict:'HARNESS_FAIL',failurePhase:'Chrome/profile cleanup未確認'};
}catch(e){console.error(e.stack);result={verdict:'HARNESS_FAIL',pass:0,fail:0,elapsedMs:0,failurePhase:String(e.stack||e)};}
finally{
 if(server)try{await Promise.race([new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve())),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('preview close timeout')),6000);t.unref();})]);}catch(e){result={...result,verdict:'HARNESS_FAIL',failurePhase:String(e)};}
 evidence.result=result;if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(evidence,null,2));
}
console.log(`${name} final: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict||'HARNESS_FAIL'}`);await finishGate(result);
