import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const base='1d0e219aae20a946bbc04d36349cb988e6e5ba7b',out=process.argv[2];
if(!out?.startsWith('review/cs-major-upgrade/evidence/')||fs.existsSync(out))throw Error('Unique report required');
const paths=['src/LogicEngine.js','src/gameData.js','src/GameView.jsx','src/MobaView3D.jsx','src/battle/battleResult.js','src/platform/contracts/battleResultVersion.js','tools/check_progress25.mjs','tools/check_moba_controls29b3.mjs'];
const baseline={},current={},files=[];
for(const p of paths){
 baseline[p]=execFileSync('git',['show',base+':'+p],{encoding:'utf8',maxBuffer:8*1024*1024});current[p]=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
 const identical=baseline[p]===current[p];assert.ok(identical,p+' changed');files.push({path:p,identicalToMain:identical,sha256:createHash('sha256').update(baseline[p]).digest('hex')});
}
const code=t=>t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/.*$/gm,'$1');
const inspect=source=>({progress25LiteralV2:source['src/battle/battleResult.js'].includes('schema: "BattleResult.v2"'),actualVersion:source['src/platform/contracts/battleResultVersion.js'].match(/export const BATTLE_RESULT_VERSION\s*=\s*"([^"]+)"/)?.[1],controls16SourcePredicates:{fountain:/FOUNTAIN\.blue/.test(code(source['src/GameView.jsx'])),pit:/PITS\.dragon/.test(code(source['src/GameView.jsx'])),objectives:/snap\.objectives/.test(code(source['src/GameView.jsx']))}});
const before=inspect(baseline),after=inspect(current);assert.deepEqual(after,before);assert.equal(after.progress25LiteralV2,false);assert.equal(after.actualVersion,'BattleResult.v3');
assert.ok(Object.values(after.controls16SourcePredicates).some(value=>!value));
const report={base,files,before,after,conclusion:'既有 main 的舊契約／內聯來源守門不符，產品來源相同；不修改 MOBA 或放寬斷言。整合版 progress25 32/33、controls29b3 16/18，原紅燈保留。'};
fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
