import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',windowsHide:true});
const status=run('git',['-c','core.quotepath=false','status','--short']),stat=run('git',['diff','--stat']),check=run('git',['diff','--check']),log=run('git',['log','-3','--oneline']);
const processes=run('powershell.exe',['-NoProfile','-Command',"Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'owner5|utility-plan|check_cs_utility|run-gate|518[012]' } | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json"]);
const memory=run('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory | Select-Object AvailableMBytes,CommittedBytes,CommitLimit | ConvertTo-Json']);
const state={at:new Date().toISOString(),status:'READY_TO_OWNER_REVIEW',goal:'get_goal=null; no new goal created',git:{status,stat,check,log},processes:JSON.parse(processes),memory:JSON.parse(memory),ownedTestsRunning:false,preview:'5182 current / 5181 prior / 5180 old v11',foreignProcessesUntouched:true,commit:false,push:false,deploy:false};
if(state.processes.some(p=>/run-gate|check_cs_utility/.test(p.CommandLine)))throw Error('Actual tests still running; refuse false completion');
fs.writeFileSync('review/cs-major-upgrade/evidence/owner5-review-20261013/final-resume-state.json',JSON.stringify(state,null,2),{flag:'wx'});
const note=`\n## 最新狀態：${state.at}（本節優先）\n\nREADY_TO_OWNER_REVIEW：本輪五項與道具用途技術驗證已收件，桌機使用 http://localhost:5182/ESMO-/。完整來源／結果／限制見OWNER5_CLOSURE.md文末及evidence/owner5-review-20261013/gameplay-owner-review-final.json；舊停止／OPEN_REVIEW段落屬歷史Before。本root get_goal=null，沒有假造goal完成。未commit/push/deploy，手機真機與Owner體感待驗；沒有CS測試仍在跑，僅保留Review Preview。最後實際Git／程序／RAM／Commit見final-resume-state.json。\n\n`;
for(const file of ['review/cs-major-upgrade/OWNER_REVIEW.md','review/cs-major-upgrade/AUTHENTICITY_CLOSURE.md']){const old=fs.readFileSync(file,'utf8'),at=old.indexOf('\n');fs.writeFileSync(file,old.slice(0,at+1)+note+old.slice(at+1));}
fs.appendFileSync('review/cs-major-upgrade/RESUME_CHECKPOINT.md','\n最後程序/Git/資源已核對保存：evidence/owner5-review-20261013/final-resume-state.json；無CS背景測試，保留Owner preview。\n');
console.log(JSON.stringify({status:state.status,memory:state.memory,previews:state.processes.map(p=>p.ProcessId)}));
