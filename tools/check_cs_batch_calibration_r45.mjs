#!/usr/bin/env node
// R45: CS Focus / Decision / Clutch(str) / Resilience(res) batch local calibration.
// This verifier only uses reversible Vite memory transforms. It never changes
// production source, RNG, scenarios, contracts, or historical baselines.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const SCHEMA = "CsBatchCalibrationR45.v1";
const SEEDS = Object.freeze([3978742910,4200255727,541349949,1011896540,44863398,1878380147,638784133,2852978760,1789562418,3820910912,3991584863,2186970694,951543597,2082574495,474649321,3950420867]);
const LEVELS = Object.freeze([60,70,80,90,100]);
const T_ROLES = Object.freeze(["entry","rifler","awp","lurker","igl"]);
const CT_ROLES = Object.freeze(["igl","awp","rifler","entry","support"]);
const TARGET_STATS = Object.freeze(["foc","dec","str","res"]);
const DEFUSE_STATS = new Set(["foc","dec"]);
const MAP_KEY = "inferno";
const T_TACTIC_ID = "t_aexec";
const CT_TACTIC_ID = "c_std";
const PROFILE = Object.freeze({
  rifler:["acc","rxn","pos","foc","str"], entry:["cou","rxn","apm","acc","str"],
  awp:["acc","foc","pos","str","rxn"], igl:["led","com","dec","tac","adp"],
  support:["coo","tac","com","pos","vis"], lurker:["vis","dec","pos","adp","str"],
});
const PERSONALITY_DELTAS = Object.freeze({
  aggressive:{cou:6,rxn:6,dec:-4,foc:-4}, defensive:{pos:6,foc:6,cou:-4,apm:-4},
  calm:{str:6,dec:6,cou:-4,apm:-4}, passionate:{cou:6}, genius:{rxn:6,lrn:6,coo:-4,res:-4},
  grinder:{acc:6,foc:6,adp:-4,lrn:-4}, shotcaller:{com:6,led:6,acc:-4,apm:-4},
  lonewolf:{apm:6,rxn:6,com:-4,coo:-4}, steady:{res:6,pos:6,cou:-4,rxn:-4},
  creative:{adp:6,lrn:6,foc:-4,res:-4},
});
const SOURCE = readFileSync(FPS_FILE, "utf8");
const MARK = {
  signature: "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){",
  pers: "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}",
  pos: "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}",
  s: "const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);",
  combatReturn: "return v*formMul(p);",
  pair: "          if(rand()>=fireChance)continue;",
  exchange: "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;",
  defuse: "          defuseProg+=defuser.stats?(0.45+persStat(defuser,\"foc\")/250+persStat(defuser,\"dec\")/300):0.7;",
  retreat: "         if(near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&aggr(p)<0.82&&mates>1){",
  round: "      const wn=roundEnd.winner;",
  return: "return { EsportsFPS3D, buildMatchResult };",
  export: "export { EsportsFPS3D, buildMatchResult };",
};
const REP = {
  signature: "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){",
  pers: 'function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}const adjusted=v,effective=clamp(adjusted,1,99);if(["foc","dec","str","res"].includes(key))globalThis.__CS_R45_AUDIT__?.record("effective_read",{playerId:p.id,role:p.role,personality:p.personality,stat:key,raw:Number(p.stats?.[key]??50),adjusted,effective,clamped:effective!==adjusted});return effective;}',
  pos: 'function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k==="rxn"?rawReflex:(s[k]||50))*(5-i));const result=t/15;for(const __r45Stat of ["foc","dec","str","res"]){const __r45Index=prof.indexOf(__r45Stat);globalThis.__CS_R45_AUDIT__?.record("role_fit_read",{playerId:p.id,role:p.role,stat:__r45Stat,raw:Number(s[__r45Stat]??50),weight:__r45Index<0?0:5-__r45Index,result});}return result;}',
  s: 'let __r45Reads=0;const S=k=>{const value=k==="rxn"?effectiveReflex:persStat(p,k);if(["foc","dec","str","res"].includes(k)){__r45Reads++;globalThis.__CS_R45_AUDIT__?.record("combat_read",{playerId:p.id,role:p.role,stat:k,effective:value,holding:Boolean(opts?.holding),lastAlive:Boolean(opts?.lastAlive),lowHP:Boolean(opts?.lowHP)});}return value;};',
  combatReturn: 'const __r45Form=formMul(p),__r45Result=v*__r45Form;globalThis.__CS_R45_AUDIT__?.record("combat_skill",{playerId:p.id,role:p.role,statReads:__r45Reads,baseBeforeForm:v,formMul:__r45Form,result:__r45Result,holding:Boolean(opts?.holding),lastAlive:Boolean(opts?.lastAlive),lowHP:Boolean(opts?.lowHP),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk)});return __r45Result;',
  pair: '          __measure?.record("opportunity",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,tLastAlive:aliveT.length===1,cLastAlive:aliveCT.length===1,tLowHP:tp.hp<40,cLowHP:cp.hp<40});\n          if(rand()>=fireChance){__measure?.record("opportunity_rejected",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id});continue;}\n          __measure?.record("opportunity_admitted",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id});',
  exchange: '          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;\n          __measure?.record("local_conversion",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,pt:Pt,attackerId:at.id,attackerSide:at.side,tLastAlive:aliveT.length===1,cLastAlive:aliveCT.length===1,tLowHP:tp.hp<40,cLowHP:cp.hp<40});',
  defuse: '          const __r45DefuseFocus=persStat(defuser,"foc"),__r45DefuseDecision=persStat(defuser,"dec");defuseProg+=defuser.stats?(0.45+__r45DefuseFocus/250+__r45DefuseDecision/300):0.7;__measure?.record("defuse_progress",{round:rnd+1,sec,playerId:defuser.id,role:defuser.role,rawFocus:Number(defuser.stats?.foc??50),effectiveFocus:__r45DefuseFocus,rawDecision:Number(defuser.stats?.dec??50),effectiveDecision:__r45DefuseDecision,delta:0.45+__r45DefuseFocus/250+__r45DefuseDecision/300,progress:defuseProg,c4t});',
  retreat: '         if(near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&aggr(p)<0.82&&mates>1){__measure?.record("retreat_trigger",{round:rnd+1,sec,playerId:p.id,role:p.role,aggr:aggr(p),threshold:0.82});',
  round: '      const wn=roundEnd.winner;__measure?.record("round_summary",{round:rnd+1,winner:wn,how:roundEnd.how});__measure?.record("round_player_result",{round:rnd+1,playerId:ps[0]?.id||"",survived:Boolean(ps[0]&&!ps[0].dead),won:wn===ps[0]?.side});',
  return: "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat, posSkill, combatSkill, aggr, formMul, tacticEdge, MAP_EDGE, clamp };",
  export: ["const __CS_BATCH_R45_TEST_API__ = Object.freeze({", "  simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER, TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,", "  persStat: __FPS3D_MODULE.persStat, posSkill: __FPS3D_MODULE.posSkill, combatSkill: __FPS3D_MODULE.combatSkill, aggr: __FPS3D_MODULE.aggr,", "  formMul: __FPS3D_MODULE.formMul, tacticEdge: __FPS3D_MODULE.tacticEdge, MAP_EDGE: __FPS3D_MODULE.MAP_EDGE, clamp: __FPS3D_MODULE.clamp,", "});", "export { EsportsFPS3D, buildMatchResult, __CS_BATCH_R45_TEST_API__ };"] .join("\n"),
};
const TRANSFORMS = Object.freeze(Object.keys(MARK).map((key) => [key, MARK[key], REP[key]]));

function gate(ok, code, detail = "") { if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`); }
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return JSON.stringify(value, Object.keys(value || {}).sort()); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])])); return value; }
function cj(value) { return JSON.stringify(canonical(value)); }
function clone(value) { return structuredClone(value); }
function occurrences(text, needle) { return text.split(needle).length - 1; }
function mean(values) { return values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0; }
function round4(value) { return Number(Number(value || 0).toFixed(4)); }
function expectedEffective(player, stat, level = null) { const raw = level == null ? Number(player.stats?.[stat] ?? 50) : level; return Math.max(1, Math.min(99, raw + (PERSONALITY_DELTAS[player.personality]?.[stat] || 0))); }
function roleWeight(player, stat) { const p = PROFILE[player.role] || PROFILE.rifler; const i = p.indexOf(stat); return i < 0 ? 0 : 5 - i; }
function monotonicSeries(rows, key) { const pass = SEEDS.map((_, i) => { const values = rows.map((row) => row.values[i][key]); return values.every((v,j)=>j===0||v>=values[j-1]) && values.some((v,j)=>j>0&&v>values[j-1]); }); return { passingSeeds: pass.filter(Boolean).length, totalSeeds: pass.length, strictMajority: pass.filter(Boolean).length > pass.length/2 }; }
function effect(rows, key, a=0, b=4) { const diffs = rows.values[b].map((v,i)=>v[key]-rows.values[a][i][key]); return { meanDiff:round4(mean(diffs)), positiveSeeds:diffs.filter(v=>v>0).length, negativeSeeds:diffs.filter(v=>v<0).length, zeroSeeds:diffs.filter(v=>v===0).length }; }
function makeCollector() { const events=[]; return { events, record(type,payload){gate(payload&&typeof payload==="object"&&!Array.isArray(payload),"EVENT_PAYLOAD",type); for(const v of Object.values(payload)) gate(v==null||["string","number","boolean"].includes(typeof v),"EVENT_FIELD",type); events.push(Object.freeze({schema:SCHEMA,type,...payload}));} }; }

async function loadApi() {
  let seen=0, restored=false, rngSame=false, vite=null; const tmp=mkdtempSync(join(tmpdir(),"esmo-cs-r45-"));
  try { vite=await createServer({root:ROOT,configFile:false,envFile:false,appType:"custom",logLevel:"error",cacheDir:join(tmp,"vite-cache"),optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},plugins:[{name:"cs-batch-r45-memory-hooks",enforce:"pre",transform(code,id){if(resolve(id.split("?")[0]).toLowerCase()!==FPS_FILE.toLowerCase())return null;seen++;gate(code===SOURCE,"SOURCE_DRIFT");let out=SOURCE;for(const [name,marker,replacement] of TRANSFORMS){gate(occurrences(out,marker)===1,"MARKER",name);out=out.replace(marker,replacement);}let back=out;for(const [name,marker,replacement] of [...TRANSFORMS].reverse()){gate(occurrences(back,replacement)===1,"REPLACEMENT",name);back=back.replace(replacement,marker);}restored=back===SOURCE;rngSame=(SOURCE.match(/\brand\s*\(\s*\)/g)||[]).length===(out.match(/\brand\s*\(\s*\)/g)||[]).length;gate(restored,"NON_REVERSIBLE");gate(rngSame,"RNG_CHANGED");return {code:out,map:null};}}]});const mod=await vite.ssrLoadModule(FPS_MODULE_ID+"?r45="+Date.now());gate(seen===1&&restored&&rngSame,"LOAD_GATE",JSON.stringify({seen,restored,rngSame}));return mod.__CS_BATCH_R45_TEST_API__;}
  finally {if(vite)await vite.close();rmSync(tmp,{recursive:true,force:true});}
}
function inputDigest(map,t,ct,roster){return sha(cj({map,t,ct,roster}));}
function treatment(roster,id,stat,value){const next=clone(roster),base=roster.find(p=>p.id===id),target=next.find(p=>p.id===id);gate(base&&target,"TARGET",id);target.stats[stat]=value;for(const p of next){const o=roster.find(x=>x.id===p.id);if(p.id===id){const a=clone(p),b=clone(o);delete a.stats[stat];delete b.stats[stat];gate(cj(a)===cj(b),"TREATMENT_DRIFT",`${id}:${stat}`);}else gate(cj(p)===cj(o),"OTHER_DRIFT",p.id);}return Object.freeze(next);}
function direct(api,player,opponent,stat,value){const p=clone(player);p.stats[stat]=value;p.gun=player.role==="awp"?"awp":"ak";const c=clone(opponent);c.gun="m4";const normal=api.combatSkill(p,{holding:false,entry:false,lurk:false,lastAlive:false,lowHP:false});const hold=api.combatSkill(p,{holding:true,entry:false,lurk:false,lastAlive:false,lowHP:false});const clutch=api.combatSkill(p,{holding:false,entry:false,lurk:false,lastAlive:true,lowHP:false});const low=api.combatSkill(p,{holding:false,entry:false,lurk:false,lastAlive:false,lowHP:true});const control=api.combatSkill(c,{holding:false,entry:false,lurk:false,lastAlive:false,lowHP:false});const aggr=api.aggr(p);return {raw:value,effective:expectedEffective(p,stat,value),roleFit:api.posSkill(p,Number(p.stats.rxn??50)),normal,hold,clutch,low,control,pt:api.clamp(0.5+(normal-control)*0.013+(api.MAP_EDGE[MAP_KEY]??0.02)+api.tacticEdge({type:"execute",site:"a"},{type:"default",site:"a"}),0.07,0.93),aggr};}
function runArm(api,input){const before=inputDigest(input.mapKey,input.tTactic,input.ctTactic,input.roster);const c1=makeCollector();globalThis.__CS_R45_AUDIT__=c1;const on=api.simulateFps(input.mapKey,input.tTactic,input.ctTactic,input.seed,input.roster,c1);globalThis.__CS_R45_AUDIT__=null;gate(before===inputDigest(input.mapKey,input.tTactic,input.ctTactic,input.roster),"INPUT_MUTATED");return {seed:input.seed,events:c1.events,strictDigest:sha(cj(on))};}
function summarize(arm,targetId){const e=arm.events;const combat=e.filter(x=>x.type==="combat_skill"&&x.playerId===targetId);const reads=e.filter(x=>x.type==="effective_read"&&x.playerId===targetId);const fits=e.filter(x=>x.type==="role_fit_read"&&x.playerId===targetId);const opp=e.filter(x=>x.type==="opportunity"&&(x.tPlayerId===targetId||x.cPlayerId===targetId));const conv=e.filter(x=>x.type==="local_conversion"&&(x.tPlayerId===targetId||x.cPlayerId===targetId));const def=e.filter(x=>x.type==="defuse_progress"&&x.playerId===targetId);const retreats=e.filter(x=>x.type==="retreat_trigger"&&x.playerId===targetId);const round=e.filter(x=>x.type==="round_player_result"&&x.playerId===targetId);const readStat=(stat)=>reads.filter(x=>x.stat===stat);const statRead=(stat)=>readStat(stat).length;const combatFor=(flag)=>combat.filter(x=>x[flag]);return {seed:arm.seed,effectiveReads:{foc:statRead("foc"),dec:statRead("dec"),str:statRead("str"),res:statRead("res")},roleFits:fits,combatCalls:combat.length,holdingCalls:combatFor("holding").length,lastAliveCalls:combatFor("lastAlive").length,lowHPCalls:combatFor("lowHP").length,opportunities:opp.length,lastAliveOpportunities:opp.filter(x=>x.tLastAlive||x.cLastAlive).length,lowHPOpportunities:opp.filter(x=>x.tLowHP||x.cLowHP).length,localConversions:conv.length,targetAttacks:conv.filter(x=>x.attackerId===targetId).length,targetPt:conv.filter(x=>x.tPlayerId===targetId).map(x=>x.pt),defuseTicks:def.length,defuseDelta:def.reduce((a,x)=>a+x.delta,0),retreatTriggers:retreats.length,rounds:round.length,survived:round.filter(x=>x.survived).length};}
function aggregate(rows){const sum=(k)=>rows.reduce((a,r)=>a+r[k],0);return {seeds:rows.length,combatCalls:sum("combatCalls"),holdingCalls:sum("holdingCalls"),lastAliveCalls:sum("lastAliveCalls"),lowHPCalls:sum("lowHPCalls"),opportunities:sum("opportunities"),lastAliveOpportunities:sum("lastAliveOpportunities"),lowHPOpportunities:sum("lowHPOpportunities"),localConversions:sum("localConversions"),targetAttacks:sum("targetAttacks"),defuseTicks:sum("defuseTicks"),defuseDelta:round4(sum("defuseDelta")),retreatTriggers:sum("retreatTriggers"),survived:sum("survived"),rounds:sum("rounds")};}
function repeatGate(api,input){const off=api.simulateFps(input.mapKey,input.tTactic,input.ctTactic,input.seed,input.roster);const a=makeCollector();globalThis.__CS_R45_AUDIT__=a;const on=api.simulateFps(input.mapKey,input.tTactic,input.ctTactic,input.seed,input.roster,a);globalThis.__CS_R45_AUDIT__=null;const b=makeCollector();globalThis.__CS_R45_AUDIT__=b;api.simulateFps(input.mapKey,input.tTactic,input.ctTactic,input.seed,input.roster,b);globalThis.__CS_R45_AUDIT__=null;gate(cj(off)===cj(on),"INSTRUMENTATION_SIM_DRIFT",String(input.seed));gate(cj(a.events)===cj(b.events),"REPEAT_EVENT_DRIFT",String(input.seed));return sha(cj(a.events));}

async function main(){
  gate(SOURCE.includes('const POS_PROFILE={')&&SOURCE.includes('S("str")-76')&&SOURCE.includes('S("res")-76'),"SOURCE_READ_CHAIN");
  gate(SOURCE.includes('persStat(defuser,"foc")')&&SOURCE.includes('persStat(defuser,"dec")'),"EFFECTIVE_DEFUSE_READ_CHAIN");
  gate(!SOURCE.includes('defuser.stats.foc/250')&&!SOURCE.includes('defuser.stats.dec/300'),"RAW_DEFUSE_READ_CHAIN");
  gate(SOURCE.includes('if(opts.lastAlive)v+=(S("str")-76)*0.22;'),"CLUTCH_LAST_ALIVE_OWNER");
  gate(SOURCE.includes('if(opts.lowHP)v-=(100-S("str"))*0.05-(S("res")-76)*0.12;'),"RESILIENCE_LOW_HP_OWNER");
  const api=await loadApi();gate(api&&typeof api.simulateFps==="function","API_MISSING");const map=api.TACTICS_DB[MAP_KEY],t=structuredClone(map.t.find(x=>x.id===T_TACTIC_ID)),ct=structuredClone(map.ct.find(x=>x.id===CT_TACTIC_ID)),roster=structuredClone(api.ROSTER);gate(t&&ct&&roster.length===10,"FIXED_INPUTS");
  const inputBefore=inputDigest(MAP_KEY,t,ct,roster);const all={};const runSummaries=[];
  for(const stat of TARGET_STATS){const targetPlayers=roster.filter(p=>p.side==="t"&&T_ROLES.includes(p.role));all[stat]={};for(const target of targetPlayers){const levelRows=[];for(const value of LEVELS){const tr=treatment(roster,target.id,stat,value);const arms=SEEDS.map(seed=>runArm(api,{mapKey:MAP_KEY,tTactic:t,ctTactic:ct,roster:tr,seed}));const summaries=arms.map(a=>summarize(a,target.id));const directRow=direct(api,target,roster.find(p=>p.id==="ct3"),stat,value);levelRows.push({value,values:summaries,direct:directRow});}const aggrValues=levelRows.map(row=>mean(row.values.map(v=>v.opportunities)));const directMetrics={roleFit:levelRows.map(r=>r.direct.roleFit),normal:levelRows.map(r=>r.direct.normal),holding:levelRows.map(r=>r.direct.hold),lastAlive:levelRows.map(r=>r.direct.clutch),lowHP:levelRows.map(r=>r.direct.low),pt:levelRows.map(r=>r.direct.pt),aggr:levelRows.map(r=>r.direct.aggr)};const opportunity=levelRows.reduce((a,r)=>a+r.values.reduce((s,v)=>s+v.opportunities,0),0);const lowHp=levelRows.reduce((a,r)=>a+r.values.reduce((s,v)=>s+v.lowHPOpportunities,0),0);const lastAlive=levelRows.reduce((a,r)=>a+r.values.reduce((s,v)=>s+v.lastAliveOpportunities,0),0);const clamp=levelRows.map(r=>r.direct.effective===99).filter(Boolean).length;const threshold=directMetrics.aggr.some(v=>v<0.82)&&directMetrics.aggr.some(v=>v>=0.82);const result={targetId:target.id,role:target.role,personality:target.personality,rawBaseline:target.stats[stat],roleFitWeight:roleWeight(target,stat),levels:LEVELS,rows:levelRows.map(r=>({value:r.value,aggregate:aggregate(r.values),direct:r.direct})),directMonotonic:{normal:directMetrics.normal.every((v,i)=>i===0||v>=directMetrics.normal[i-1]),holding:directMetrics.holding.every((v,i)=>i===0||v>=directMetrics.holding[i-1]),lastAlive:directMetrics.lastAlive.every((v,i)=>i===0||v>=directMetrics.lastAlive[i-1]),lowHP:directMetrics.lowHP.every((v,i)=>i===0||v>=directMetrics.lowHP[i-1]),pt:directMetrics.pt.every((v,i)=>i===0||v>=directMetrics.pt[i-1])},opportunity:{total:opportunity,lastAlive,lowHP:lowHp},clampReads:clamp,thresholdCrossing:threshold,aggrSeries:directMetrics.aggr.map(round4),roleFitDelta:round4(directMetrics.roleFit[4]-directMetrics.roleFit[0]),combatDeltaPer10:round4((directMetrics.normal[4]-directMetrics.normal[0])/4),holdingDeltaPer10:round4((directMetrics.holding[4]-directMetrics.holding[0])/4),lastAliveDeltaPer10:round4((directMetrics.lastAlive[4]-directMetrics.lastAlive[0])/4),lowHPDeltaPer10:round4((directMetrics.lowHP[4]-directMetrics.lowHP[0])/4),ptDeltaPer10:round4((directMetrics.pt[4]-directMetrics.pt[0])/4)};all[stat][target.role]=result;runSummaries.push(result);}
  }
  // Focus/Decision must also prove their CT-only defuse consumer. This is a
  // separate arm; the T-role arms intentionally remain the role comparison.
  const defuse={};for(const stat of ["foc","dec"]){defuse[stat]={};for(const target of roster.filter(p=>p.side==="ct")){const rows=[];for(const value of LEVELS){const tr=treatment(roster,target.id,stat,value);const arms=SEEDS.map(seed=>runArm(api,{mapKey:MAP_KEY,tTactic:t,ctTactic:ct,roster:tr,seed}));const summaries=arms.map(a=>summarize(a,target.id));rows.push({value,aggregate:aggregate(summaries),defuseTicks:summaries.reduce((s,x)=>s+x.defuseTicks,0),defuseDelta:summaries.reduce((s,x)=>s+x.defuseDelta,0)});}defuse[stat][target.role]={targetId:target.id,personality:target.personality,rows,progressSeries:rows.map(r=>round4(r.defuseDelta)),tickSeries:rows.map(r=>r.defuseTicks)};}}
  gate(inputBefore===inputDigest(MAP_KEY,t,ct,roster),"INPUT_DRIFT");
  const repeatDigest=repeatGate(api,{mapKey:MAP_KEY,tTactic:t,ctTactic:ct,roster:treatment(roster,"t1","foc",60),seed:SEEDS[0]});
  const suite={schema:SCHEMA,sourceSha256:sha(SOURCE),seedSetSha256:sha(cj(SEEDS)),seeds:SEEDS,levels:LEVELS,roles:T_ROLES,repeatDigest,statCanonical:{str:"抗壓（產品 Clutch／殘局能力沿用 legacy str）",res:"韌性",foc:"專注力",dec:"決策力"},readChain:{focus:"effective combat/holding/defuse; raw role-fit",decision:"effective combat/defuse; raw role-fit",clutch:"effective mechanics/lastAlive/lowHP/aggr; raw role-fit",resilience:"effective lowHP stability; no lastAlive direct bonus; no role-fit"},cases:all,defuse,productionChanged:false,rngChanged:false,scenarioChanged:false};
  const digest=sha(cj(suite));const repeat=sha(cj(suite));gate(digest===repeat,"DIGEST_REPEAT");
  const statuses={};for(const stat of TARGET_STATS){const cases=Object.values(all[stat]);const directOk=cases.every(c=>c.directMonotonic.normal&&c.directMonotonic.pt);const coverage=cases.reduce((s,c)=>s+c.opportunity.total,0);const statLast=cases.reduce((s,c)=>s+c.opportunity.lastAlive,0);const statLow=cases.reduce((s,c)=>s+c.opportunity.lowHP,0);statuses[stat]=stat==="res"?(directOk&&statLow>0?"Calibration Ready - Limited":"Deferred"):stat==="str"?(directOk&&statLast>0?"Calibration Ready - Limited":"Deferred"):(directOk?"Calibration Ready - Limited":"Deferred");}
  for(const stat of TARGET_STATS){
    const compact=Object.values(all[stat]).map(c=>({role:c.role,personality:c.personality,roleFitWeight:c.roleFitWeight,combatDeltaPer10:c.combatDeltaPer10,holdingDeltaPer10:c.holdingDeltaPer10,lastAliveDeltaPer10:c.lastAliveDeltaPer10,lowHPDeltaPer10:c.lowHPDeltaPer10,ptDeltaPer10:c.ptDeltaPer10,opportunity:c.opportunity,clampReads:c.clampReads,thresholdCrossing:c.thresholdCrossing,aggrSeries:c.aggrSeries}));
    console.log(`${stat} cases: `+JSON.stringify(compact));
  }
  /*
  console.log("defuse cases: "+JSON.stringify(defuse));console.log("statuses: "+JSON.stringify(statuses));console.log(`sweep simulations: ${TARGET_STATS.length*T_ROLES.length*LEVELS.length*SEEDS.length + 2*CT_ROLES.length*LEVELS.length*SEEDS.length}`);console.log(`suiteDigest: ${digest}`);console.log(`sourceSha256: ${sha(SOURCE)}`);console.log("canonical str: 抗壓 (legacy product Clutch/殘局能力); canonical res: 韌性");console.log("production source modified: no; RNG/scenario/historical evidence unchanged");console.log("CS Batch Calibration R45: PASS");
}
  */
  console.log("defuse cases: "+JSON.stringify(defuse));
  console.log("statuses: "+JSON.stringify(statuses));
  console.log(`sweep simulations: ${TARGET_STATS.length*T_ROLES.length*LEVELS.length*SEEDS.length + 2*CT_ROLES.length*LEVELS.length*SEEDS.length}`);
  console.log(`suiteDigest: ${digest}`);
  console.log(`sourceSha256: ${sha(SOURCE)}`);
  console.log("canonical source labels: str and res; product mapping Clutch/殘局能力 uses legacy str, Resilience/韌性 uses res");
  console.log("production source modified: no; RNG/scenario/historical evidence unchanged");
  console.log("CS Batch Calibration R45: PASS");
}
main().catch(error=>{console.error("CS Batch Calibration R45: FAIL "+(error?.stack||error));process.exitCode=1;});
