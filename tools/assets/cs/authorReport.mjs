import fs from 'node:fs';
import {createHash} from 'node:crypto';

// 完整診斷只保存一次；stdout 保留結果、來源與完整報表 hash，避免複製大型 cases。
export function saveAuthorReport(outputPath,report){
 const bytes=JSON.stringify(report,null,2);
 fs.writeFileSync(outputPath,bytes,{flag:'wx'});
 const summary={status:report.status,report:outputPath,reportBytes:Buffer.byteLength(bytes),reportSha256:createHash('sha256').update(bytes).digest('hex')};
 for(const [key,value] of Object.entries(report))if(value===null||['string','number','boolean'].includes(typeof value))summary[key]=value;
 if(Array.isArray(report.cases))summary.caseCount=report.cases.length;
 if(Array.isArray(report.results))summary.resultCount=report.results.length;
 if(report.constraints)summary.constraints=report.constraints;
 console.log(JSON.stringify(summary));
 return summary;
}
