// 本機RC服務恢復；不建置、不部署、不碰其他工作樹，不保存臨時HTTPS host。
import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import assert from 'node:assert/strict';import{spawn,execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const artifact=process.argv.find(a=>a.startsWith('--artifact='))?.slice(11)||'preview-r3';assert.match(artifact,/^preview-r\d+$/);
const cwd=process.cwd(),root='review/cs-integration-20261107',out=root+'/'+artifact,stateFile=root+'/evidence/rc-preview-service.json';
assert.equal(path.basename(cwd),'cs-map-v2-integration-20261107');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ps=command=>execFileSync('powershell.exe',['-NoProfile','-Command',command],{encoding:'utf8',windowsHide:true}).trim();
const pidInfo=pid=>{assert(Number.isSafeInteger(pid)&&pid>0);const s=ps(`Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`);return s?JSON.parse(s):null;};
const free=port=>new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});
const stopOwnPreview=async()=>{
 const f=fs.existsSync(stateFile)?stateFile:root+'/evidence/preview-process-r2.json';assert(fs.existsSync(f),'找不到本RC預覽PID記錄');const m=read(f);assert(m.port===5207);const p=pidInfo(m.pid);if(!p)return;
 assert(/vite[\\/]bin[\\/]vite\.js preview/.test(p.CommandLine)&&/--port 5207/.test(p.CommandLine)&&/--outDir review[\\/]cs-integration-20261107[\\/]preview-r\d+/.test(p.CommandLine),'PID不是本RC服務，不停止');
 ps(`Stop-Process -Id ${m.pid}`);for(let i=0;i<30&&!await free(5207);i++)await sleep(100);assert(await free(5207),'本RC預覽埠尚未釋放');
};
const status=async()=>{try{return await(await fetch('http://127.0.0.1:61048/status',{signal:AbortSignal.timeout(2000)})).json();}catch{return null;}};
const verifyController=s=>{const a=read('review/cs-major-upgrade/tmp/cs-integration-active-controller.json'),metaPath=path.resolve(a.meta);assert(metaPath.startsWith(path.resolve('review/cs-major-upgrade/tmp')+path.sep));const m=read(metaPath);assert.equal(m.cwd,cwd);assert.equal(m.controllerPid,s.controllerPid);assert.equal(m.previewPort,5207);const p=pidInfo(s.controllerPid);assert(p&&/tools[\\/]owner_cs_integration_tunnel\.mjs r\d+ 5207 61048/.test(p.CommandLine),'不是本RC controller');};
const stopController=async s=>{if(!s){assert(await free(61048),'控制埠被不明服務占用');return;}verifyController(s);const r=await fetch('http://127.0.0.1:61048/stop');await r.arrayBuffer();for(let i=0;i<30&&!await free(61048);i++)await sleep(100);assert(await free(61048),'控制埠尚未釋放');};
const launch=(args,label)=>{const stamp=Date.now(),stdout=fs.openSync(root+'/evidence/'+label+'-'+stamp+'.stdout.log','wx'),stderr=fs.openSync(root+'/evidence/'+label+'-'+stamp+'.stderr.log','wx');const child=spawn(process.execPath,args,{cwd,windowsHide:true,detached:true,stdio:['ignore',stdout,stderr]});child.unref();fs.closeSync(stdout);fs.closeSync(stderr);return child.pid;};
if(process.argv.includes('--stop')){await stopController(await status());if(!await free(5207))await stopOwnPreview();console.log('本RC預覽與tunnel已停止；其他服務未處理');process.exit(0);}
assert(fs.existsSync(out+'/integration-manifest.json'),'先恢復封存preview-r3，禁止本工具偷偷重建');
const manifest=read(out+'/integration-manifest.json'),h=createHash('sha256');for(const f of fs.readdirSync(out+'/assets').filter(f=>f.endsWith('.js')).sort()){h.update(f+'\0');h.update(fs.readFileSync(out+'/assets/'+f));}assert.equal(h.digest('hex'),manifest.bundleSha256,'封存包SHA不符');assert.equal(manifest.bundleSha256,'b27a69e972c487422268aab421ad6d82194959999828732126c7cc87b815e370','不是本RC受測bundle');
let previewOk=false;if(!await free(5207)){const f=fs.existsSync(stateFile)?stateFile:root+'/evidence/preview-process-r2.json';const m=read(f),p=pidInfo(m.pid);previewOk=!!p&&p.CommandLine.includes('--outDir '+out)&&/--port 5207/.test(p.CommandLine);if(!previewOk)await stopOwnPreview();}
if(!previewOk){assert(await free(5207),'預覽埠被不明服務占用');const pid=launch(['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5207','--strictPort','--outDir',out],'rc-preview');fs.writeFileSync(stateFile,JSON.stringify({pid,port:5207,cwd,outDir:out,at:new Date().toISOString()},null,2));}
let ready=false;for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:5207/ESMO-/integration-manifest.json');if(r.ok&&(await r.json()).bundleSha256===manifest.bundleSha256){ready=true;break;}}catch{}await sleep(250);}assert(ready,'本RC桌機預覽未就緒');
let s=await status();if(s)verifyController(s);
if(!s?.connected){await stopController(s);const prefix='cs-integration-tunnel-r',dirs=fs.readdirSync('review/cs-major-upgrade/tmp').filter(n=>new RegExp('^'+prefix+'\\d+$').test(n)),rev='r'+(Math.max(0,...dirs.map(n=>Number(n.slice(prefix.length))))+1);launch(['tools/owner_cs_integration_tunnel.mjs',rev,'5207','61048'],'rc-controller');for(let i=0;i<90;i++){await sleep(500);s=await status();if(s?.connected&&s.url)break;}}
assert(s?.connected&&s.url,'tunnel未就緒；保留本機預覽，請讀redacted log');verifyController(s);
console.log(JSON.stringify({desktop:'http://localhost:5207/ESMO-/',https:s.url+'/ESMO-/',review:s.url+'/ESMO-/owner-review/',controllerPid:s.controllerPid,previewPort:5207,releaseGate:'HOLD'}));
