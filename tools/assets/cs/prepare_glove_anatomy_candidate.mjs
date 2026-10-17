import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const [out,reportPath,rejectedStatesPath]=process.argv.slice(2),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));assert(reportPath?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(reportPath));
const sourcePath='src/battle/fps/presentation/fpsGloveSurface.js',raw=fs.readFileSync(sourcePath),original=raw.toString('utf8');let code=original;
function replace(a,b){assert(code.includes(a),'作者入口已變：'+a);code=code.replace(a,b);}
replace('export function applyFpsGloveSurface(geometry, source) {',"export function applyFpsGloveSurface(geometry, source) {\n  if(geometry.userData.esmoGloveSurface?.version!=='fps-glove-surface.v1')throw new Error('手部作者候選必須以當前v1可見皮面為基線，不能重複雕塑');");
replace('(.0008*pad-.001*crease)','(.0015*pad-.0018*crease)');
replace('.47+.035*pad-.095*crease,.34,.51','.46+.08*pad-.16*crease,.28,.56');
replace('maximumDelta>.001001','maximumDelta>.001801');
replace("version:'fps-glove-surface.v1'","version:'fps-glove-anatomy-candidate.v2',referenceStage:'fps-glove-surface.v1'");
const header='// 當前可見v1手皮上的第二階段私有作者候選；未整合／未藝術通過。\n';
let protectedFailureVertices=[],rejectedStatesSha256=null;
if(rejectedStatesPath){
 const rejectedRaw=fs.readFileSync(rejectedStatesPath),rejected=JSON.parse(rejectedRaw);
 assert.equal(rejected.status,'REJECTED_AUTHOR_GLOVE_GEOMETRY');
 assert.equal(rejected.geometryModuleSha256,sha(header+code),'拒絕資料必須來自同一作者候選');
 assert(rejected.cases.every(c=>c.posedDegenerates===0),'新增退化必須另查原因，不以固定點掩蓋');
 protectedFailureVertices=[...new Set(rejected.cases.flatMap(c=>c.posedFailures).flatMap(f=>f.ids))].sort((a,b)=>a-b);
 assert(protectedFailureVertices.length>0&&protectedFailureVertices.length<=12,'僅保護已取證的少量收窄面，不大範圍還原候選');
 replace('[5891,5787,5786,4718,4717,4630]',JSON.stringify([...new Set([5891,5787,5786,4718,4717,4630,...protectedFailureVertices])]));
 replace("version:'fps-glove-anatomy-candidate.v2'","version:'fps-glove-anatomy-candidate.v3'");
 rejectedStatesSha256=sha(rejectedRaw);
}
fs.writeFileSync(out,header+code,{flag:'wx'});
const report={status:'PRIVATE_GLOVE_ANATOMY_CANDIDATE_NOT_INTEGRATED_NOT_ART_PASS',sourcePath,sourceSha256:sha(raw),candidateSha256:sha(fs.readFileSync(out)),rejectedStatesSha256,protectedFailureVertices,maximumAdditionalJointCreaseMetres:.0018,maximumAdditionalPadMetres:.0015,extraTriangles:0,extraDraws:0,runtimeUpdates:0,caveat:'較明確真指節截面與原皮革色層；須可見皮面原門檻、全動作與新GPU，不以作者參數當視覺通過。'};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
