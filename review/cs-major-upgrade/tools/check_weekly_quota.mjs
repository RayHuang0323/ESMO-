import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';

// 官方唯讀 account/rateLimits/read；絕不開始 thread／turn、重置額度或購買積分。
// 登入由既有 Codex CLI 管理；本程式不讀取、不輸出憑證或帳號識別資訊。
const cli=path.join(process.env.APPDATA,'npm/node_modules/@openai/codex/bin/codex.js');
const proc=spawn(process.execPath,[cli,'app-server'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
const lines=readline.createInterface({input:proc.stdout});
proc.stderr.resume();
const exit=new Promise(resolve=>proc.once('exit',(code,signal)=>resolve({code,signal})));
const send=message=>proc.stdin.write(JSON.stringify(message)+'\n');
let timer;
try{
  const result=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(new Error('官方用量唯讀查詢逾時')),25000);
    proc.once('error',()=>reject(new Error('無法啟動現有 Codex CLI')));
    proc.once('exit',()=>reject(new Error('Codex CLI 在回傳用量前結束')));
    lines.on('line',line=>{
      let message;try{message=JSON.parse(line);}catch{return;}
      if(message.id!==0&&message.id!==1)return;
      if(message.error){reject(new Error(`官方用量查詢未成功（RPC ${message.error.code}）`));return;}
      if(message.id===0){send({method:'initialized',params:{}});send({method:'account/rateLimits/read',id:1});}
      if(message.id===1)resolve(message.result);
    });
    send({method:'initialize',id:0,params:{clientInfo:{name:'esmo_quota_guard',title:'ESMO 唯讀用量守門',version:'0.1.0'}}});
  });
  clearTimeout(timer);
  const limits=result?.rateLimitsByLimitId??(result?.rateLimits?{[result.rateLimits.limitId||'unknown']:result.rateLimits}:{});
  const buckets=[];
  for(const [id,limit] of Object.entries(limits))for(const window of [limit.primary,limit.secondary]){
    if(window?.windowDurationMins!==10080||!Number.isFinite(window.usedPercent)||window.usedPercent<0||window.usedPercent>100)continue;
    buckets.push({id,usedPercent:window.usedPercent,remainingPercent:100-window.usedPercent,resetsAt:new Date(window.resetsAt*1000).toISOString()});
  }
  console.log(JSON.stringify({version:'esmo-weekly-quota-guard.v1',source:'account/rateLimits/read',checkedAt:new Date().toISOString(),status:buckets.length?'MEASURED':'UNKNOWN',buckets,pauseRequired:buckets.some(b=>b.remainingPercent===0)}));
  proc.stdin.end();
  const shutdown=setTimeout(()=>proc.kill(),1200);
  await exit;clearTimeout(shutdown);
}catch(error){
  clearTimeout(timer);proc.kill();await exit;
  console.log(JSON.stringify({version:'esmo-weekly-quota-guard.v1',status:'UNKNOWN',pauseRequired:false,error:error.message}));
  process.exitCode=1;
}finally{lines.close();}
