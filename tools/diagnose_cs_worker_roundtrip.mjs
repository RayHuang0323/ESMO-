import fs from 'node:fs';
import {launchChrome} from './browser/cdp.mjs';
const [input,out]=process.argv.slice(2);
if(!input||!out||fs.existsSync(out))throw Error('Unique output required');
const args=JSON.parse(fs.readFileSync(input,'utf8'));
let browser;
try{
 browser=await launchChrome({url:'http://127.0.0.1:5189/ESMO-/',port:9488,headless:true});
 await browser.navigate('http://127.0.0.1:5189/ESMO-/');
 await browser.evaluate(`window.__roundtrip={state:'pending',start:performance.now()};const worker=new Worker('/ESMO-/src/battle/fps/fpsSim.worker.js?worker_file&type=module',{type:'module'});worker.onmessage=e=>{window.__roundtrip={state:'done',elapsed:performance.now()-window.__roundtrip.start,ok:e.data.ok,ms:e.data.ms,frames:e.data.sim?.frames.length,error:e.data.error};worker.terminate();};worker.onerror=e=>{window.__roundtrip={state:'error',message:e.message,filename:e.filename,line:e.lineno,column:e.colno};worker.terminate();};worker.postMessage({id:1,args:${JSON.stringify(args)}});return true;`);
 const deadline=Date.now()+90000;let result;
 while(Date.now()<deadline){result=await browser.evaluate('return window.__roundtrip');if(result.state!=='pending')break;await new Promise(r=>setTimeout(r,500));}
 fs.writeFileSync(out,JSON.stringify({result,pageErrors:browser.pageErrors,console:browser.consoleLines},null,2),{flag:'wx'});console.log(result);if(result.state!=='done'||!result.ok)process.exitCode=1;
}finally{await browser?.close();}
