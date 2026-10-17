import fs from 'node:fs';
const [sha,out]=process.argv.slice(2);
if(!/^[a-f0-9]{40}$/.test(sha||'')||!out?.startsWith('review/cs-major-upgrade/evidence/')||fs.existsSync(out))throw Error('Exact SHA and unique evidence output required');
const root='https://api.github.com/repos/RayHuang0323/ESMO-';
const get=async path=>{const r=await fetch(root+path,{signal:AbortSignal.timeout(30000),headers:{Accept:'application/vnd.github+json'}});if(!r.ok)throw Error('GitHub public read HTTP '+r.status);return r.json();};
const report={schema:'cs-release-pages.v1',sha,started:new Date().toISOString(),observations:[],passed:false};
try{
 const end=Date.now()+20*60*1000;
 while(Date.now()<end){
  const data=await get('/actions/workflows/deploy.yml/runs?per_page=15'),run=data.workflow_runs.find(r=>r.head_sha===sha&&r.head_branch==='main'&&r.event==='push');
  const observation={at:new Date().toISOString(),runId:run?.id||null,status:run?.status||'NOT_FOUND',conclusion:run?.conclusion||null};report.observations.push(observation);console.log(JSON.stringify(observation));
  if(run?.status==='completed'){
   report.run=run;report.jobs=await get('/actions/runs/'+run.id+'/jobs');
   report.passed=run.conclusion==='success'&&report.jobs.jobs.some(j=>j.name==='deploy'&&j.conclusion==='success')&&report.jobs.jobs.every(j=>j.conclusion==='success');
   if(!report.passed)throw Error('Pages workflow did not pass');break;
  }
  await new Promise(r=>setTimeout(r,10000));
 }
 if(!report.passed)throw Error('Pages workflow TIMEOUT');
}catch(error){report.error=error.message;process.exitCode=1;}
finally{report.finished=new Date().toISOString();fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:report.passed,runId:report.run?.id,error:report.error}));}
