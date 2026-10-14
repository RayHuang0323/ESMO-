#!/usr/bin/env node
// 正式建置的真實 Worker 對同瀏覽器 canonical 模擬；不以 fallback 冒充成功。
// Node／Chrome的Math最後位元不同；保留Node hash供診斷，精確SHA gate比較同一JS環境。
// 執行前須先完成 production build；不修改玩家資料、不部署、不改模擬輸入。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
import { runGate, finishGate } from './browser/harness.mjs';
import { loadFpsMajorTestApi } from './lib/fpsMajorTestApi.mjs';

const hash=v=>createHash('sha256').update(JSON.stringify(v,(_k,x)=>x instanceof Map?{__map:[...x]}:x instanceof Set?{__set:[...x]}:x)).digest('hex');
// 可直接驗證已有的隔離 production archive，避免為同一來源重複建置。
const buildArg=process.argv.find(x=>x.startsWith('--buildDir='));
const angleArg=process.argv.find(x=>x.startsWith('--angleBackend='));
const angleBackend=angleArg?angleArg.slice('--angleBackend='.length):null;
if(angleBackend!==null&&!['gl','d3d11'].includes(angleBackend))throw new Error('Worker gate ANGLE只允許gl／d3d11，不改產品或輸出斷言');
const headlessArg=process.argv.find(x=>x.startsWith('--headless='));
if(headlessArg&&!['--headless=true','--headless=false'].includes(headlessArg))throw new Error('Worker headless參數必須明確true或false');
const headless=headlessArg==='--headless=true';
if(headless&&angleBackend)throw new Error('headless Worker是CPU／回應驗證，不可指定或聲稱實際GPU後端');
const buildDir=path.resolve(buildArg?buildArg.slice('--buildDir='.length):'dist');
const archiveRoot=path.resolve('review/cs-major-upgrade/profile-builds');
const relative=path.relative(archiveRoot,buildDir);
if(buildArg&&(relative.startsWith('..')||path.isAbsolute(relative)||!relative))throw new Error('buildDir 必須是任務隔離 archive');
const manifest=buildArg?JSON.parse(fs.readFileSync(path.join(buildDir,'build-manifest.json'),'utf8')):null;
if(manifest){
  if(manifest.version!==1||!manifest.sourceFingerprint?.sha256)throw new Error('隔離建置缺少有效來源 manifest');
  const bundle=createHash('sha256');
  for(const file of fs.readdirSync(path.join(buildDir,'assets')).filter(x=>x.endsWith('.js')).sort()){
    bundle.update(file+'\0');bundle.update(fs.readFileSync(path.join(buildDir,'assets',file)));
  }
  if(bundle.digest('hex')!==manifest.bundleSha256)throw new Error('archive bundle 已變更，拒絕借用來源紀錄');
}
const files=fs.readdirSync(path.join(buildDir,'assets')).filter(f=>/^fpsSim\.worker-.*\.js$/.test(f));
if(files.length!==1)throw new Error('需要唯一且已驗證的 production Worker 建置');
const workerFile=files[0],workerSha=createHash('sha256').update(fs.readFileSync(path.join(buildDir,'assets',workerFile))).digest('hex');
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const cases=[];
for(const [map,version] of [['mirage','major.v1'],['dust2','major.v1'],['inferno','major.v1'],['mirage','legacy']]){
  const args=[map,api.TACTICS_DB[map].t[0],api.TACTICS_DB[map].ct[0],505001,api.ROSTER,null,version];
  console.log(`準備主執行緒對照：${map}/${version}`);
  const sim=api.simulateFps(...args);cases.push({map,version,args,expected:hash(sim),frames:sim.frames.length});
}
const server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false},plugins:[{
  name:'cs-worker-test-page',
  configurePreviewServer(server){server.middlewares.use((req,res,next)=>{
    if(req.url!=='/ESMO-/__esmo_worker_gate.html')return next();
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>ESMO Worker 驗證</title></head><body>正式 Worker 驗證頁</body></html>');
  });}
}]});
const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
// This verifies the real compiled Worker and same-browser canonical output.
// App bootstrap/rendering is covered by the GPU gate; avoid loading it twice
// into the CPU transport test, which otherwise competes for renderer memory.
const testPage=url+'__esmo_worker_gate.html';
let result;
try{
  result=await runGate({name:'CS Major production Worker',externalUrl:testPage,headless,workspaceOnly:true,angleBackend,timeoutMs:600000,async run({chrome,ck}){
    await chrome.navigate(testPage);
    const page=await chrome.evaluate('return {title:document.title,scripts:document.scripts.length};');
    if(page?.title!=='ESMO Worker 驗證'||page.scripts!==0)throw new Error('Worker隔離頁precondition未成立，不可默默改跑app bootstrap');
    for(const c of cases){
      console.log(`執行瀏覽器真Worker／canonical：${c.map}/${c.version}，模式=${headless?'headless-CPU（非GPU證據）':'headed'}`);
      const value=await chrome.evaluate(`
        const args=${JSON.stringify(c.args)},started=performance.now();let ticks=0,maxGap=0,last=started;
        const interval=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;ticks++;},25);
        let worker,timer;
        try{
          const response=await new Promise((resolve,reject)=>{
            worker=new Worker(${JSON.stringify(url+'assets/'+workerFile)},{type:'module'});
            timer=setTimeout(()=>reject(new Error('正式Worker等待超過180秒')),180000);
            worker.onerror=e=>reject(new Error(e.message+' '+e.filename+':'+e.lineno));
            worker.onmessage=e=>e.data?.ok?resolve(e.data):reject(new Error(e.data?.error||'Worker未回傳成功結果'));
            worker.postMessage({id:1,args});
          });
          clearInterval(interval);
          const digestSim=async sim=>{
            const bytes=new TextEncoder().encode(JSON.stringify(sim,(_k,x)=>x instanceof Map?{__map:[...x]}:x instanceof Set?{__set:[...x]}:x));
            const digest=await crypto.subtle.digest('SHA-256',bytes);
            return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
          };
          const hash=await digestSim(response.sim);
          // 本機驗證頁執行同一production bundle；只攔截該次同步回覆，立即還原DOM事件API。
          // 不依賴額外export、不另寫模擬、不把Node的數值誤差放進Worker等價斷言。
          const oldMessage=self.onmessage,oldPost=self.postMessage;let mainResponse;
          try{
            await import(${JSON.stringify(url+'assets/'+workerFile+'?oracle='+c.map+'-'+c.version)});
            self.postMessage=value=>{mainResponse=value;};
            self.onmessage({data:{id:2,args}});
          }finally{self.onmessage=oldMessage;self.postMessage=oldPost;}
          if(!mainResponse?.ok)throw new Error(mainResponse?.error||'瀏覽器主執行緒canonical未回傳結果');
          const mainHash=await digestSim(mainResponse.sim);
          return {ok:true,hash,mainHash,nodeHash:${JSON.stringify(c.expected)},frames:response.sim.frames.length,completed:response.sim.completed,workerMs:response.ms,browserMainMs:mainResponse.ms,elapsedMs:performance.now()-started,ticks,maxGap};
        }catch(error){return {ok:false,error:String(error?.message||error),ticks,maxGap};}
        finally{clearInterval(interval);clearTimeout(timer);worker?.terminate();}
      `);
      ck(`${c.map}/${c.version} 正式Worker成功完成`,value.ok&&value.completed,JSON.stringify(value));
      ck(`${c.map}/${c.version} 與同瀏覽器canonical完整輸出SHA一致`,value.ok&&value.hash===value.mainHash&&value.frames===c.frames);
      ck(`${c.map}/${c.version} 等待期間主執行緒持續回應`,value.ok&&value.ticks>=3&&value.maxGap<1000,JSON.stringify({ticks:value.ticks,maxGap:value.maxGap}));
    }
  }});
  const out='review/cs-major-upgrade/evidence/worker-production';fs.mkdirSync(out,{recursive:true});
  const file=path.join(out,`gate-${Date.now()}.json`);
  fs.writeFileSync(file,JSON.stringify({buildDir,manifest,workerFile,workerSha,browserMode:headless?'headless-CPU':'headed',result},null,2),{flag:'wx'});console.log(`證據：${file}`);
}finally{await new Promise(resolve=>server.httpServer.close(resolve));}
await finishGate(result);
