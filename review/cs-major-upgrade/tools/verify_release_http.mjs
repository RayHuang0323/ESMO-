import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base='https://rayhuang0323.github.io/ESMO-/';
const [dist='dist',output]=process.argv.slice(2);
if(!output||!output.startsWith('review/cs-major-upgrade/evidence/')||fs.existsSync(output))throw Error('Unique release evidence output required');
const hash=b=>createHash('sha256').update(b).digest('hex');
const assets=fs.readdirSync(path.join(dist,'assets')).filter(p=>/\.(js|css)$/.test(p)).map(p=>'assets/'+p);
const publicFiles=execFileSync('git',['ls-files','--','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean);
const files=[{url:'index.html',file:path.join(dist,'index.html')},...assets.map(p=>({url:p,file:path.join(dist,p)})),...publicFiles.map(p=>({url:p.slice(7),file:p}))];
const report={schema:'cs-release-http.v1',started:new Date().toISOString(),base,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks:[],pass:false};
try{
 for(const item of files){
  const expected=fs.readFileSync(item.file),response=await fetch(new URL(item.url,base),{signal:AbortSignal.timeout(90000),cache:'no-store'}),bytes=Buffer.from(await response.arrayBuffer());
  const check={path:item.url,status:response.status,bytes:bytes.length,expectedSha256:hash(expected),actualSha256:hash(bytes),ok:response.status===200&&bytes.equals(expected)};
  report.checks.push(check);console.log(JSON.stringify(check));if(!check.ok)throw Error('Deployed bytes mismatch: '+item.url);
 }
 report.pass=true;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{report.finished=new Date().toISOString();fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:report.pass,checked:report.checks.length,expected:files.length}));}
