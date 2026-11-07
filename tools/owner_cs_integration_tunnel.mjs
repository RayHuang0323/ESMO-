import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import readline from 'node:readline';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const [revision,previewText='5207',controlText='61048']=process.argv.slice(2);if(!/^r\d+$/.test(revision||''))throw Error('需要明確Foundry tunnel版本');
const previewPort=Number(previewText),controlPort=Number(controlText);if(![[5207,61048]].some(([p,c])=>p===previewPort&&c===controlPort))throw Error('僅允許Foundry已保留的三組埠');
const root=path.resolve('review/cs-major-upgrade/tmp/cs-integration-tunnel-'+revision);fs.mkdirSync(root,{recursive:true});
const meta=root+'/controller.json',config=root+'/empty.yml',log=root+'/redacted.log';if(fs.existsSync(meta)||fs.existsSync(config))throw Error('此版本已存在；先核對Foundry專用行程');
// 沿用已安裝且目前Dune正使用的portable client，只讀取，不安裝或修改。
const client='D:/OneDrive/文件/GitHub/ESMO/worktrees/cs-map-v2-ai/review/cs-major-upgrade/tmp/cloudflared-portable/cloudflared-windows-amd64.exe';if(!fs.existsSync(client))throw Error('既有portable client不存在，未進行安裝');
const clientSha256=createHash('sha256').update(fs.readFileSync(client)).digest('hex');fs.writeFileSync(config,'{}\n',{flag:'wx'});let url=null,connected=false,child=null,stopping=false;
const redact=s=>s.replace(/(?:https?:\/\/)?[a-z0-9-]+\.trycloudflare\.com/g,'<Foundry-Owner-URL-redacted>');
const stop=()=>{if(stopping)return;stopping=true;child?.kill();server.close();setTimeout(()=>process.exit(0),500);};
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/status')res.end(JSON.stringify({url,connected,controllerPid:process.pid,cloudflaredPid:child?.pid,previewPort}));else if(req.url==='/stop'){res.end('{"stopping":true}');stop();}else{res.statusCode=404;res.end('{}');}});
server.on('error',e=>{fs.appendFileSync(log,redact(e.message)+'\n');stop();process.exitCode=1;});
server.listen(controlPort,'127.0.0.1',()=>{
 child=spawn(client,['tunnel','--config',config,'--no-autoupdate','--url','http://127.0.0.1:'+previewPort,'--http-host-header','localhost:'+previewPort,'--protocol','http2','--edge-ip-version','4'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const metadata={controllerPid:process.pid,cloudflaredPid:child.pid,controlPort,previewPort,clientSha256,startedAt:new Date().toISOString(),cwd:process.cwd(),role:'Foundry專用臨時Owner Review；URL僅記憶體，不接管其他服務'};fs.writeFileSync(meta,JSON.stringify(metadata,null,2),{flag:'wx'});
 fs.writeFileSync('review/cs-major-upgrade/tmp/cs-integration-active-controller.json',JSON.stringify({revision,meta,controlPort,previewPort},null,2));
 for(const stream of [child.stdout,child.stderr])readline.createInterface({input:stream}).on('line',line=>{const match=line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match)url=match[0];if(line.includes('Registered tunnel connection'))connected=true;else if(line.includes('Connection terminated')||line.includes('Unauthorized: Tunnel not found'))connected=false;fs.appendFileSync(log,redact(line)+'\n');});
 child.on('error',e=>{fs.appendFileSync(log,redact(e.message)+'\n');stop();});child.on('close',code=>{fs.appendFileSync(log,'client exited '+code+'\n');if(!stopping){server.close();process.exitCode=code||0;}});
});
process.on('SIGTERM',stop);process.on('SIGINT',stop);
