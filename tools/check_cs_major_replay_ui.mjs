#!/usr/bin/env node
// D scoped Node gate：合成反例與來源接線守門不代替 browser／真機驗收。
// --fixture=<path[.gz]> 可讀真CsReplay，或owner canonical sim.gz。
// 純sim必須搭配 --raw-result=<small.json>（原buildMatchResult(sim)，不重模擬）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createCsReplay, validateCsReplay, readCsReplay, serializeCsReplay } from '../src/battle/fps/fpsReplay.js';
import { groupFpsTeams, getFpsFrameMessages, fmtFpsMoney } from '../src/battle/fps/fpsMatchUi.js';
import { toCsMatchResult } from '../src/platform/contracts/CsMatchResult.js';

const fixtureArg=process.argv.find(arg=>arg.startsWith('--fixture='));
const rawResultArg=process.argv.find(arg=>arg.startsWith('--raw-result='));
const fixturePath=fixtureArg?.slice('--fixture='.length)||process.env.ESMO_CS_D_FIXTURE;
const rawResultPath=rawResultArg?.slice('--raw-result='.length)||process.env.ESMO_CS_D_RAW_RESULT;
if(process.env.ESMO_VERIFY_FLAT==='1'&&!fixturePath){console.error('CS Major Replay UI D runner需真fixture：設定 ESMO_CS_D_FIXTURE 或 --fixture');process.exit(2);}

let pass=0,fail=0;
function ck(name,fn){try{fn();pass++;console.log(`PASS ${name}`);}catch(error){fail++;console.error(`FAIL ${name}: ${error.stack}`);}}
const clone=value=>JSON.parse(JSON.stringify(value));
const players=Array.from({length:10},(_,i)=>({id:`p${i}`,name:`選手${i}`,teamId:i<5?'us':'enemy',teamIdentity:i<5?'us':'enemy',side:i<5?'t':'ct',pos:{x:10+i,y:20},hp:100,dead:false,money:800+i*100,buyType:'eco',gun:'glock',k:0,d:0,a:0}));
const history=[{round:1,winner:'t',winnerTeam:'us',winnerSide:'t',how:'elim',tS:1,cS:0}];
const frames=Array.from({length:4},(_,i)=>({fi:i,ts:i*2,rnd:0,roundSec:i*2,players:clone(players),ctScore:i===3?0:0,tScore:i===3?1:0,roundHist:history,roundHistCount:i===3?1:0,completed:i===3,events:[],casts:i===0?['首句']:i===2?['後句']:[],comms:i===1?[{name:'選手0',side:'t',text:'先報點'}]:i===3?[{name:'選手1',side:'t',text:'後報點'}]:[]}));
const sim={sceneVersion:'major.v1',mapKey:'mirage',frames,players:clone(players),roundHist:history,rounds:1,regulationRounds:1,overtimeGroups:0,completed:true,winner:'us',tScore:1,ctScore:0};
const rawResult={id:'mock-d-only',mode:'CS',map:'mirage',completed:true,winner:'us',win:true,scoreT:1,scoreCT:0,tName:'我方',ctName:'對手',players:clone(players),ourPlayers:clone(players.slice(0,5)),theirPlayers:clone(players.slice(5)),rounds:history,roundCount:1};
const options={seed:505001,mapKey:'mirage',sceneVersion:'major.v1',teamName:'我方',opponentName:'對手',rawResult};
let envelope;
ck('合成fixture明確標示、匯出不改來源',()=>{const before=JSON.stringify(sim);envelope=createCsReplay(sim,options);assert.equal(JSON.stringify(sim),before);assert.equal(envelope.schema,'CsReplay.v1');assert.equal(envelope.simulation.frames.length,4);});
ck('合法保存幀通過驗證',()=>{const result=validateCsReplay(envelope);assert.equal(result.ok,true,JSON.stringify(result.errors));});
ck('JSON roundtrip讀回完整保存simulation',()=>{const loaded=readCsReplay(JSON.stringify(envelope));assert.deepEqual(loaded,envelope);assert.deepEqual(loaded.simulation.frames.map(f=>f.players),frames.map(f=>f.players));});
ck('匯出深拷貝，不回寫canonical選手與位置',()=>{const exported=createCsReplay(sim,options);exported.simulation.frames[0].players[0].pos.x=999;exported.simulation.players[0].money=999;assert.equal(sim.frames[0].players[0].pos.x,10);assert.equal(sim.players[0].money,800);});
ck('保存frame截斷未來roundHist別名',()=>{assert.equal(envelope.simulation.frames[0].roundHist.length,0);assert.equal(envelope.simulation.frames[3].roundHist.length,1);assert.equal(sim.frames[0].roundHist.length,1);});
ck('compact round-prefix.v1不重複保存frame roundHist',()=>{const wire=JSON.parse(serializeCsReplay(envelope));assert.equal(wire.encoding,'round-prefix-player-pool.v1');assert.ok(Array.isArray(wire.playerValuePool));const old={...clone(envelope),encoding:'round-prefix.v1',simulation:{...clone(envelope.simulation),frames:envelope.simulation.frames.map(({roundHist,...f})=>f)}};assert.deepEqual(readCsReplay(old),envelope);assert.deepEqual(wire.simulation.roundHist,envelope.simulation.roundHist);assert.ok(wire.simulation.frames.every(frame=>!Object.hasOwn(frame,'roundHist')));});
ck('compact讀回逐frame可見歷史prefix及完整10人',()=>{const restored=readCsReplay(serializeCsReplay(envelope));assert.deepEqual(restored,envelope);assert.ok(restored.simulation.frames.every(frame=>frame.players.length===10&&frame.roundHist.length===frame.roundHistCount));});
ck('compact序列化不改來源完整欄位',()=>{const before=JSON.stringify(envelope);serializeCsReplay(envelope);assert.equal(JSON.stringify(envelope),before);});
ck('compact保留真事件位置／識別與全部額外保存欄位',()=>{const value=clone(envelope);value.simulation.frames[1].events=[{id:'mock-shot-only',type:'shot',playerId:'p0',round:1,roundSec:2,pos:{x:11,y:20},shotAtMs:2050,nested:{weaponHandlingVersion:1,ammoAfter:19}}];value.simulation.frames[1].players[0].weaponHandlingVersion=1;value.simulation.frames[1].players[0].ammo=19;value.simulation.frames[1].players[0].customSavedField={roundMs:2050};assert.deepEqual(readCsReplay(serializeCsReplay(value)),value);});
ck('compact拒絕未知wire encoding',()=>{const wire=JSON.parse(serializeCsReplay(envelope));wire.encoding='unknown';assert.throws(()=>readCsReplay(wire));});
ck('compact拒絕roundHistCount超出唯一歷史',()=>{const wire=JSON.parse(serializeCsReplay(envelope));wire.simulation.frames[0].roundHistCount=wire.simulation.roundHist.length+1;assert.throws(()=>readCsReplay(wire));});
ck('compact拒絕負值／小數可見歷史count',()=>{for(const count of [-1,.5]){const wire=JSON.parse(serializeCsReplay(envelope));wire.simulation.frames[0].roundHistCount=count;assert.throws(()=>readCsReplay(wire));}});
ck('compact拒絕真frame少一位選手',()=>{const wire=JSON.parse(serializeCsReplay(envelope));wire.simulation.frames[0].players.pop();assert.throws(()=>readCsReplay(wire));});

const invalid=(name,mutate)=>ck(name,()=>{const value=clone(envelope);mutate(value);const result=validateCsReplay(value);assert.equal(result.ok,false);assert.ok(Array.isArray(result.errors)&&result.errors.length>0);assert.throws(()=>readCsReplay(value));});
invalid('拒絕未知schema',value=>{value.schema='Unknown.v1';});
invalid('拒絕未知地圖',value=>{value.metadata.mapKey='unknown';value.simulation.mapKey='unknown';});
invalid('拒絕未知sceneVersion',value=>{value.metadata.sceneVersion='unknown';value.simulation.sceneVersion='unknown';});
invalid('拒絕空frames',value=>{value.simulation.frames=[];});
invalid('拒絕非有限frame時間',value=>{value.simulation.frames[0].ts=Infinity;});
invalid('拒絕非有限選手座標',value=>{value.simulation.frames[0].players[0].pos.x=NaN;});
invalid('拒絕重複playerId',value=>{value.simulation.frames[0].players[1].id=value.simulation.frames[0].players[0].id;});
invalid('拒絕缺rawResult',value=>{delete value.rawResult;});
invalid('拒絕result與保存比分不一致',value=>{value.rawResult.scoreT+=1;});
ck('損壞JSON提供可讀錯誤',()=>{assert.throws(()=>readCsReplay('{broken'));assert.equal(validateCsReplay(null).ok,false);});

ck('stable team分組與攻守不同概念',()=>{const grouped=groupFpsTeams(frames[0]);assert.deepEqual(grouped.us.map(p=>p.id),players.slice(0,5).map(p=>p.id));assert.deepEqual(grouped.enemy.map(p=>p.id),players.slice(5).map(p=>p.id));});
ck('換邊仍保持隊伍名單與真經濟',()=>{const switched=clone(frames[0]);switched.players.forEach(p=>{p.side=p.side==='t'?'ct':'t';});const before=groupFpsTeams(frames[0]),after=groupFpsTeams(switched);assert.deepEqual(after,before.us[0].side==='t'?{us:switched.players.slice(0,5),enemy:switched.players.slice(5)}:before);assert.equal(after.us.reduce((n,p)=>n+p.money,0),before.us.reduce((n,p)=>n+p.money,0));assert.ok(after.us.every(p=>p.side==='ct'));});
ck('金額顯示統一萬單位',()=>{assert.equal(fmtFpsMoney(0),'$0.0萬');assert.equal(fmtFpsMoney(12345),'$1.2萬');assert.equal(fmtFpsMoney(100000),'$10.0萬');});
ck('通訊使用真frame且不借未來',()=>{const view=getFpsFrameMessages(frames,1);assert.ok(view.comms.some(c=>c.text==='先報點'));assert.ok(view.comms.every(c=>c.text!=='後報點'));assert.ok(view.casts.every(c=>c.text!=='後句'));});
ck('倒帶重建不殘留未來通訊',()=>{assert.ok(getFpsFrameMessages(frames,3).comms.some(c=>c.text==='後報點'));assert.equal(getFpsFrameMessages(frames,0).comms.length,0);assert.deepEqual(getFpsFrameMessages(frames,0).casts.map(c=>c.text),['首句']);});
ck('相同frame暫停／重複publish不增殖訊息',()=>{assert.deepEqual(getFpsFrameMessages(frames,2),getFpsFrameMessages(frames,2));});
ck('真roundSec窗口淘汰舊訊息',()=>{const view=getFpsFrameMessages(frames,3,{windowSec:1});assert.ok(view.comms.every(c=>c.text!=='先報點'));assert.ok(view.casts.every(c=>c.text!=='首句'));});
ck('換回合不顯示前局訊息',()=>{const other=clone(frames);other[3].rnd=1;other[3].roundSec=0;assert.equal(getFpsFrameMessages(other,3).casts.length,0);assert.deepEqual(getFpsFrameMessages(other,3).comms.map(c=>c.text),['後報點']);});
ck('casts／comms有界且輸入不變',()=>{const before=JSON.stringify(frames),view=getFpsFrameMessages(frames,3,{maxCasts:1,maxComms:1});assert.ok(view.casts.length<=1&&view.comms.length<=1);assert.equal(JSON.stringify(frames),before);});

const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8');
const hudCss=fs.readFileSync('src/battle/fps/fpsBattleHud.css','utf8');
const replaySource=fs.readFileSync('src/battle/fps/fpsReplay.js','utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,`找不到接點 ${start}/${end}`);return source.slice(a,b);};
ck('保存幀helper不匯入／呼叫simulator',()=>{assert.ok(!/simulateFps|simulateFpsForMount|fpsSim\.worker/.test(replaySource));});
ck('重播simulation優先，略過同步與Worker模擬',()=>{const simSection=section('const sim=useMemo(()=>{','const matchResult=');assert.ok(/if\(replayEnvelope\)return replayEnvelope\.simulation;/.test(simSection));assert.ok(/simulateFpsForMount/.test(simSection));assert.ok(simSection.indexOf('return replayEnvelope.simulation')<simSection.indexOf('simulateFpsForMount'));});
ck('重播阻擋Progress寫入',()=>{const progress=section('// R63：','// 依 fIdx');assert.ok(/replay(?:Mode|Data|Envelope)/.test(progress)&&/return/.test(progress));});
ck('重播阻擋completion與QuickFinish',()=>{const end=section('const completeOnce=','const tType=');assert.ok(/replay(?:Mode|Data|Envelope)/.test(end));assert.ok((end.match(/replay(?:Mode|Data|Envelope)/g)||[]).length>=2);});
ck('Major訊息由保存frame重建',()=>{assert.ok(source.includes('getFpsFrameMessages'));assert.ok(source.includes('setCasts')&&source.includes('setComms'));});
ck('Major roster使用stable team helper',()=>{assert.ok(source.includes('groupFpsTeams'));const roster=section('{/* 雙隊名單 */}','data-testid="cs-player-controls"');assert.ok(/\.us|\["us"\]|\['us'\]/.test(roster));assert.ok(/\.enemy|\["enemy"\]|\['enemy'\]/.test(roster));});
ck('逐回合統計保存真roundStats與累計ADR',()=>{assert.ok(/roundStats/.test(source));const stats=section('const _rnds=','// ── 回合經濟結算');assert.ok(/agg\[p\.id\]\.dmg|agg\[.*?\].*?dmg|cumulativeDamage/.test(stats));assert.ok(/roundDmg/.test(stats));});
ck('Major KAST與Clutch接真事件來源',()=>{assert.ok(/traded|trade(?:dPlayer|Victim|Events|Audit|Kills)|wasTraded|kast/.test(source));assert.ok(/clutch(?:Candidate|Candidates|Audit|Opportunit|Situation|State|Episodes)|trueClutch/.test(source));});
ck('CS有保存幀匯出與匯入入口',()=>{assert.ok(/createCsReplay/.test(source)&&/readCsReplay/.test(source));assert.ok(/type=["']file["']/.test(source));assert.ok(/application\/json|\.json/.test(source));});
ck('D CSS支援safe-area與reduced-motion',()=>{assert.ok(/safe-area-inset/.test(hudCss));assert.ok(/prefers-reduced-motion/.test(hudCss));});
ck('D CSS控制至少44px及窄版防溢出',()=>{assert.ok(/min-(?:height|width)\s*:\s*44px|(?:height|width)\s*:\s*44px/.test(hudCss));assert.ok(/min-width\s*:\s*0/.test(hudCss));assert.ok(/overflow-wrap|text-overflow/.test(hudCss));});
console.log('MOBILE_BROWSER=NOT_RUN；320/360/390/430實際排版、FPS、觸控、safe area不由Node證明');

if(fixturePath){
  let recorded;
  ck('Owner真canonical Replay fixture讀取與完整驗證',()=>{
    const bytes=fs.readFileSync(fixturePath),json=fixturePath.endsWith('.gz')?gunzipSync(bytes).toString('utf8'):bytes.toString('utf8'),saved=JSON.parse(json);
    if(saved.schema)recorded=readCsReplay(saved);
    else{
      assert.ok(rawResultPath,'純sim fixture必須提供原buildMatchResult輸出的 --raw-result 或 ESMO_CS_D_RAW_RESULT，不另造結果');
      const raw=JSON.parse(fs.readFileSync(rawResultPath,'utf8'));
      assert.equal(raw.mode,'CS');assert.equal(saved.mapKey,'mirage');
      recorded=createCsReplay(saved,{seed:505001,mapKey:saved.mapKey,sceneVersion:saved.sceneVersion,teamName:raw.tName,opponentName:raw.ctName,rawResult:raw});
      assert.deepEqual(recorded.rawResult,raw);
    }
    assert.equal(validateCsReplay(recorded).ok,true);assert.equal(recorded.simulation.completed,true);assert.equal(recorded.simulation.sceneVersion,'major.v1');assert.ok(recorded.simulation.frames.length>4);
    console.log(`REAL_CANONICAL_FIXTURE=${fixturePath} compressed=${fixturePath.endsWith('.gz')} frames=${recorded.simulation.frames.length}`);
  });
  ck('真保存幀JSON roundtrip逐欄位完全一致',()=>{
    // A complete long replay's expanded JSON exceeds V8's single-string
    // ceiling. Roundtrip every frame and every remaining field instead; verify
    // repeated history values before restoring their exact shared references.
    const {simulation,...header}=recorded,{frames,...tail}=simulation;
    const savedTail=clone(tail),savedFrames=frames.map(frame=>{const saved=clone(frame),history=savedTail.roundHist.slice(0,saved.roundHistCount??saved.roundHist.length);assert.deepEqual(saved.roundHist,history);saved.roundHist=history;return saved;});
    const restored=readCsReplay({...clone(header),simulation:{...savedTail,frames:savedFrames}});assert.deepEqual(restored,recorded);
  });
  ck('真保存幀compact roundtrip所有欄位／10人／事件完全一致',()=>{const restored=readCsReplay(serializeCsReplay(recorded));assert.deepEqual(restored,recorded);assert.ok(restored.simulation.frames.every(frame=>frame.players.length===10));for(let i=0;i<recorded.simulation.frames.length;i++)assert.deepEqual(restored.simulation.frames[i].events,recorded.simulation.frames[i].events);});
  ck('真frame及結果隊伍一致，不重算勝負',()=>{const simulation=recorded.simulation,last=simulation.frames.at(-1),result=recorded.rawResult;assert.equal(simulation.tScore,result.scoreT);assert.equal(simulation.ctScore,result.scoreCT);assert.equal(simulation.winner,result.winner);assert.equal(last.tScore,simulation.tScore);assert.equal(last.ctScore,simulation.ctScore);assert.ok(simulation.frames.every(f=>groupFpsTeams(f).us.length===5&&groupFpsTeams(f).enemy.length===5));});
  ck('真roundStats ADR由逐回合有效傷害累計',()=>{const totals=new Map(),rounds=recorded.simulation.roundHist;assert.ok(rounds.length>0);for(let i=0;i<rounds.length;i++){assert.ok(Array.isArray(rounds[i].roundStats)&&rounds[i].roundStats.length===10);for(const row of rounds[i].roundStats){assert.ok(row.id);const damage=(totals.get(row.id)||0)+row.dmg;totals.set(row.id,damage);assert.equal(row.adr,Math.round(damage/(i+1)));}}});
  ck('真raw轉v1攜帶全十人逐回合資料與同源道具傷害',()=>{const raw=recorded.rawResult,result=toCsMatchResult(raw,{seed:recorded.metadata.seed});assert.equal(raw.sceneVersion,'major.v1');assert.equal(result.schema,'CsMatchResult.v1');assert.equal(result.sceneVersion,raw.sceneVersion);assert.deepEqual(result.roundDetails,raw.rounds.map((round,index)=>({round:index+1,players:round.roundStats})));assert.ok(result.roundDetails.every(round=>round.players.length===10));assert.equal(result.players.length+result.opponents.length,10);for(const [actual,truth] of [[result.players,raw.ourPlayers],[result.opponents,raw.theirPlayers]])for(let i=0;i<truth.length;i++){assert.equal(actual[i].playerName,truth[i].name);assert.equal(actual[i].adr,truth[i].adr);assert.equal(actual[i].kast,truth[i].kast);assert.equal(actual[i].clutches,truth[i].clutches);assert.ok(Number.isFinite(truth[i].utilDmg));assert.equal(actual[i].utilityDamage,truth[i].utilDmg);}});
  ck('移除sceneVersion的legacy raw轉換維持原欄位形狀',()=>{const legacy={...recorded.rawResult};delete legacy.sceneVersion;const result=toCsMatchResult(legacy);assert.equal(Object.hasOwn(result,'sceneVersion'),false);assert.equal(Object.hasOwn(result,'roundDetails'),false);assert.ok([...result.players,...result.opponents].every(player=>!Object.hasOwn(player,'utilityDamage')));assert.equal(result.players.length+result.opponents.length,10);assert.equal(result.ourScore,legacy.scoreT);assert.equal(result.enemyScore,legacy.scoreCT);});
  ck('Major與legacy轉換均不預填獎勵或入史時間',()=>{const before=JSON.stringify(recorded.rawResult),legacy={...recorded.rawResult};delete legacy.sceneVersion;for(const raw of [recorded.rawResult,legacy]){const result=toCsMatchResult(raw);assert.deepEqual(result.rewards,{money:null,fans:null,xp:null});assert.equal(result.recordedAt,null);}assert.equal(JSON.stringify(recorded.rawResult),before);});
}else console.log('REAL_CANONICAL_FIXTURE=NOT_RUN（需owner final C/D scoped輸出 --fixture=<path>）');
console.log(`CS Major Replay UI D: ${pass}/${pass+fail} PASS`);
if(fail)process.exitCode=1;
