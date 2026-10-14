import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createFpsAmbientAudio,FPS_AMBIENT_PROFILES} from '../src/battle/fps/presentation/fpsAmbientAudio.js';
let pass=0,fail=0;
async function check(name,fn){try{await fn();pass++;console.log(`PASS ${name}`);}catch(e){fail++;console.log(`FAIL ${name}: ${e.stack||e.message}`);}}
function fixture({failStart=false,fetchAsset}={}) {
  const nodes=[],param=()=>({value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;}});
  const node=kind=>{const n={kind,gain:param(),frequency:param(),connections:[],disconnects:0,starts:[],stops:0,
    connect(d){this.connections.push(d);},disconnect(){this.disconnects++;},start(...args){if(failStart)throw new Error('start failed');this.starts.push(args);},stop(){this.stops++;}};nodes.push(n);return n;};
  const context={state:'running',currentTime:10,createGain:()=>node('gain'),createBiquadFilter:()=>node('filter'),
    createBufferSource:()=>node('source'),decodeAudioData:async()=>({duration:4,numberOfChannels:1,getChannelData:()=>new Float32Array([.1,-.1,.2,-.2])})};
  const fetcher=fetchAsset||(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(12)}));
  const destination={},audio=createFpsAmbientAudio({context,destination,url:'asset.ogg',fetchAsset:fetcher});
  return{audio,context,nodes,destination};
}
const simulation={},state={simulation,seekNonce:0,mapKey:'mirage',playing:true,soundOn:true,frameTimeSec:5.5};
try {
  await check('正式資產Ogg格式、大小與來源SHA完整',()=>{const b=fs.readFileSync('public/audio/cs/major-v1/wind-loop.ogg');assert.equal(b.length,251584);assert.equal(b.subarray(0,4).toString(),'OggS');assert.equal(createHash('sha256').update(b).digest('hex'),'0cfdbd3f21ed449689a9024264edf267d0037a6495813a7010827672ec191dac');});
  await check('來源授權與作者記錄存在且不是槍聲替代',()=>{const s=fs.readFileSync('public/audio/cs/major-v1/SOURCES.md','utf8');assert.ok(s.includes('CC0-1.0')&&s.includes('SketchMan3')&&s.includes('opengameart.org/content/wind-whoosh-loop'));});
  await check('非手勢running前不建立loop source',async()=>{const f=fixture();try{f.context.state='suspended';await f.audio.ready;f.audio.sync(state);assert.equal(f.audio.diagnostics().sourceStarts,0);}finally{f.audio.dispose();}});
  await check('暫停、靜音或缺simulation不開始loop',async()=>{for(const change of[{playing:false},{soundOn:false},{simulation:null}]){const f=fixture();try{await f.audio.ready;f.audio.sync({...state,...change});assert.equal(f.audio.diagnostics().active,false);assert.equal(f.audio.diagnostics().sourceStarts,0);}finally{f.audio.dispose();}}});
  await check('按保存時間modulo定位loop，讀真解碼PCM',async()=>{const f=fixture();try{await f.audio.ready;f.audio.sync(state);const d=f.audio.diagnostics(),s=f.nodes.find(n=>n.kind==='source');assert.equal(d.offsetSec,1.5);assert.deepEqual(s.starts,[[10,1.5]]);assert.equal(s.loop,true);assert.ok(d.rms>0&&d.peak>.19);assert.equal(d.status,'ready');}finally{f.audio.dispose();}});
  await check('正向frame不重建節點或重新start',async()=>{const f=fixture();try{await f.audio.ready;for(let i=0;i<100;i++)f.audio.sync({...state,frameTimeSec:5.5+i*.5});assert.equal(f.audio.diagnostics().sourceStarts,1);assert.equal(f.nodes.length,3);}finally{f.audio.dispose();}});
  await check('暫停停止並斷線，resume按新保存時間定位',async()=>{const f=fixture();try{await f.audio.ready;f.audio.sync(state);f.audio.sync({...state,playing:false});const first=f.nodes.find(n=>n.kind==='source');assert.equal(first.stops,1);assert.equal(first.disconnects,1);assert.equal(f.audio.diagnostics().active,false);f.audio.sync({...state,frameTimeSec:7});assert.equal(f.audio.diagnostics().offsetSec,3);}finally{f.audio.dispose();}});
  await check('seek／換simulation／地圖取消舊loop，各次只一條active來源',async()=>{const f=fixture();try{await f.audio.ready;f.audio.sync(state);for(const change of[{seekNonce:1,frameTimeSec:2},{simulation:{}},{mapKey:'dust2'}])f.audio.sync({...state,...change});const sources=f.nodes.filter(n=>n.kind==='source');assert.equal(sources.length,4);assert.ok(sources.slice(0,-1).every(n=>n.stops===1&&n.disconnects===1));assert.equal(sources.at(-1).stops,0);}finally{f.audio.dispose();}});
  await check('三圖profile低gain、有限filter且不改事件資料',async()=>{const f=fixture(),before=JSON.stringify(state);try{await f.audio.ready;for(const[mapKey,p]of Object.entries(FPS_AMBIENT_PROFILES)){f.audio.sync({...state,mapKey});assert.equal(f.audio.diagnostics().gain,p.gain);assert.ok(p.gain<=.07&&p.lowpassHz>=1000&&p.lowpassHz<=4000);}assert.equal(JSON.stringify(state),before);}finally{f.audio.dispose();}});
  await check('載入晚到但已stop時不補播',async()=>{let release;const f=fixture({fetchAsset:()=>new Promise(r=>release=r)});try{f.audio.sync(state);f.audio.stop();release({ok:true,arrayBuffer:async()=>new ArrayBuffer(12)});await f.audio.ready;assert.equal(f.audio.diagnostics().sourceStarts,0);}finally{f.audio.dispose();}});
  await check('HTTP失敗誠實failed且不造替代聲音',async()=>{const f=fixture({fetchAsset:async()=>({ok:false,status:404})});try{assert.equal(await f.audio.ready,false);f.audio.sync(state);assert.equal(f.audio.diagnostics().status,'failed');assert.equal(f.nodes.filter(n=>n.kind==='source').length,0);}finally{f.audio.dispose();}});
  await check('start異常不逃逸、無殘留source',async()=>{const f=fixture({failStart:true});try{await f.audio.ready;assert.doesNotThrow(()=>f.audio.sync(state));assert.equal(f.audio.diagnostics().active,false);assert.equal(f.audio.diagnostics().status,'failed');assert.equal(f.nodes.find(n=>n.kind==='source').disconnects,1);}finally{f.audio.dispose();}});
  await check('dispose冪等、pending fetch不建立source且graph只釋放一次',async()=>{let release;const f=fixture({fetchAsset:()=>new Promise(r=>release=r)});f.audio.sync(state);f.audio.dispose();f.audio.dispose();release({ok:true,arrayBuffer:async()=>new ArrayBuffer(12)});await f.audio.ready;f.audio.sync(state);assert.equal(f.nodes.length,2);assert.ok(f.nodes.every(n=>n.disconnects===1));assert.equal(f.audio.diagnostics().status,'disposed');});
  await check('產品僅major接線，使用同context、保存frame及既有停止生命週期',()=>{const s=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8');assert.ok(s.includes('if(pooled)ambient=createFpsAmbientAudio({context:ctx,destination:master'));assert.ok(s.includes('frameTimeSec:sim.frames[publishedFidx]?.ts||0'));assert.ok(s.includes('stopAll(){voicePool?.stopAll();ambient?.stop();}'));assert.ok(s.includes('disposed=true;ambient?.dispose();voicePool?.dispose()'));});
}finally{}
console.log(`CS Major Ambient Audio B7: ${pass}/${pass+fail} PASS`);if(fail)process.exitCode=1;
