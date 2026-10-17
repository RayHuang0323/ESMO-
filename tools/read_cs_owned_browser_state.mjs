// Existing owned CDP read only; never launches or modifies a Browser.
import fs from 'node:fs';
const [port,out]=process.argv.slice(2);if(!/^\d+$/.test(port)||!out||fs.existsSync(out))throw Error('Provide proven owned port and new evidence file');
const report={schema:'cs-owned-browser-readiness.v1',checkedAt:new Date().toISOString(),port:Number(port),readOnly:true};
const pages=await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(5000)}).then(r=>r.json());const page=pages.find(p=>p.type==='page'&&p.url.includes('c5c=battle'));
if(!page)throw Error('Owned gate battle target absent');report.target={url:page.url,id:page.id};
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
const expr=`(()=>{const st=window.__ESMO_FPS_SCENE__,live=st?.liveRef?.current;return {url:location.href,documentReady:document.readyState,map:st?.mapKey,version:st?.sceneVersion,playerCount:st?.players?.length,rigReady:st?.players?.map(p=>({id:p.id,mode:p.rigged?.mode})),atlasLoaded:st?.c3Environment?.summary?.atlasLoaded,playing:live?.playing,frame:live?.fIdx,frames:live?.sim?.frames?.length,simCompleted:live?.sim?.completed,hasCameraUi:Boolean(document.querySelector('[data-testid="cs-camera-presets"]')),bodyTail:document.body?.innerText?.slice(-600)};})()`;
try{report.evaluation=await new Promise(resolve=>{const timer=setTimeout(()=>resolve({status:'CDP_EVALUATION_TIMEOUT',timeoutMs:12000}),12000);ws.addEventListener('message',e=>{const data=JSON.parse(e.data);if(data.id!==1)return;clearTimeout(timer);resolve(data);});ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true}}));});}finally{ws.close();}
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
