import assert from 'node:assert/strict';
import {evaluateMobaIntegrationScope as evaluate,inspectMobaIntegrationScope,CS_INTEGRATION_SOURCE_PATHS as cs} from './lib/mobaIntegrationScope.mjs';
import {inspectVersionedScope} from './lib/mobaVersionedScope.mjs';
let pass=0;const ck=(name,fn)=>{fn();pass++;console.log('PASS '+name);};
const cka=async(name,fn)=>{await fn();pass++;console.log('PASS '+name);};
ck('無差異通過',()=>assert(evaluate({changedPaths:[]}).ok));
ck('明確24檔CS面可整合且不與語意清單重疊',()=>{assert.equal(cs.length,24);assert(evaluate({changedPaths:cs}).ok);});
for(const p of ['src/LogicEngine.js','src/featureFlags.js','src/platform/contracts/simulationVersion.js','src/platform/contracts/matchRuleset.js','src/battle/fps/unreviewed.js'])ck('拒絕非核准變更 '+p,()=>assert(!evaluate({changedPaths:[p]}).ok));
ck('CS面若進入語意權威亦拒絕，不能以白名單遮掉',()=>assert(!evaluate({changedPaths:[cs[0]],semanticPaths:[cs[0]]}).ok));
ck('任何dirty src拒絕',()=>assert(!evaluate({changedPaths:[],dirtyPaths:['?? src/new.js']}).ok));
//  2026-11-24（C1＋C2 本機整合）：src 與原始基準相同 ⇒ 照原規則通過。不同 ⇒ 只有在目前版本是登記後繼版本、而且版本化範圍整體通過時才接受
//  （tools/lib/mobaVersionedScope.mjs 的 A1／A2／B1–B6：登記指紋、只動登記檔案、v20～v24 與祖先版本逐 tick Golden）。這和三支歷史 Gate
//  （s2 T13b／preflight P5／cal_parity C3，C1 起）用的是同一套判定，不是放寬成只看 CS 白名單；上面的拒絕反例全部保留。
for(const sha of ['541721dd','feed38c1','910792ac'])await cka('保留原始基準 '+sha,async()=>{const direct=inspectMobaIntegrationScope(sha);if(direct.ok)return;const v=await inspectVersionedScope(sha);assert(v.ok&&v.mode==='registeredSuccessor',JSON.stringify({direct,versioned:v}));});
await cka('沒有登記後繼版本時，src 不同不得以版本化範圍放行',async()=>{const direct=inspectMobaIntegrationScope('541721dd');const v=await inspectVersionedScope('541721dd',process.cwd(),{successors:{},runGolden:false});assert(direct.ok||!v.ok,JSON.stringify(v));});
console.log(`MOBA_INTEGRATION_SCOPE RESULT=PASS assertions=${pass}`);
