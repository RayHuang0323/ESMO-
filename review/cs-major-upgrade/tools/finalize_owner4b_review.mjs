import fs from 'node:fs';
import {createHash} from 'node:crypto';
const base='review/cs-major-upgrade/evidence/owner4b-review-20261014/';
const receipt=JSON.parse(fs.readFileSync(base+'owner4b-engineering-complete.json'));
receipt.preview.pid=134264;receipt.reviewBoundary='Owner Review; no background CS tests; only owned pristine preview remains';
const out=base+'owner4b-engineering-final.json';fs.writeFileSync(out,JSON.stringify(receipt,null,2),{flag:'wx'});
for(const file of ['review/cs-major-upgrade/RESUME_CHECKPOINT.md','review/cs-major-upgrade/OWNER4_CLOSURE.md','review/cs-major-upgrade/OWNER_REVIEW.md','review/cs-major-upgrade/AUTHENTICITY_CLOSURE.md','review/cs-major-upgrade/OWNER4B_CLOSURE.md']){
 let s=fs.readFileSync(file,'utf8');if(file.endsWith('RESUME_CHECKPOINT.md'))s=s.replace(/^#.*\n/,'# ESMO CS Gameplay Authenticity：Owner4B工程完成，Owner Review\n');
 const n=s.indexOf('\n');s=s.slice(0,n+1)+'\n最新實際停點：Owner4B已完成，Preview session11892／PID134264；每週usage最新剩12%，5%（含以下）停工。最終收件 evidence/owner4b-review-20261014/owner4b-engineering-final.json。工程剩餘0，Owner／手機真機驗收待Owner安排。\n'+s.slice(n+1);fs.writeFileSync(file,s);
}
for(const file of ['docs/handoff/00_目前專案狀態.md','docs/handoff/05_Sprint紀錄.md','docs/handoff/08_目前待辦與風險.md']){
 const b=fs.readFileSync(file);let end=b.length;while(end&&[10,13].includes(b[end-1]))end--;fs.writeFileSync(file,Buffer.concat([b.subarray(0,end),Buffer.from('\n')]));
}
console.log(JSON.stringify({status:receipt.status,url:receipt.preview.url,pid:134264,receipt:out,sha256:createHash('sha256').update(fs.readFileSync(out)).digest('hex')}));
