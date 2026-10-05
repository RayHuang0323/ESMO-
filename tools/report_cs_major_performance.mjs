// 只比較既有量測，不啟動遊戲、不改原始證據，也不把非等條件比較宣稱成PASS。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const FORMAL_SHA='1cf6472961528eeb3acfeb2558deadb4b425372d';
const metricPaths={fps:['fps'],frameP95Ms:['frameMs','p95'],frameP99Ms:['frameMs','p99'],frameMaxMs:['frameMs','max'],drawCallsP95:['render','callsP95'],trianglesP95:['render','trianglesP95'],textureEstimateMB:['textureMemoryEstimateMB'],jsHeapMB:['jsHeapMB'],coldReadyMs:['coldReadyMs'],players:['players'],rigged:['rigged']};
const value=(row,keys)=>keys.reduce((v,key)=>v?.[key],row);
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function compareRows(before,after){
  assert.equal(before.map,after.map,'地圖必須相同');
  assert.equal(before.viewport?.width,after.viewport?.width,'viewport必須相同');
  const metrics={};
  for(const [name,keys] of Object.entries(metricPaths)){
    const a=value(before,keys),b=value(after,keys);
    assert.ok(finite(a)&&finite(b),`${name}缺少有限的量測值，不以0代填`);
    metrics[name]={before:a,after:b,delta:b-a,percent:a===0?null:(b/a-1)*100};
  }
  const differences=[];
  for(const key of ['viewport','canvas','quality','gpu','seed','state','build'])if(!equal(before[key],after[key]))differences.push(key);
  const warnings=[];
  if(metrics.fps.percent<-5)warnings.push('FPS下降超過5%，須重測／診斷，不得忽略');
  if(metrics.frameP95Ms.percent>10)warnings.push('p95 frame-time上升超過10%，先停止新增畫質並診斷');
  if(metrics.frameP99Ms.percent>50&&metrics.frameP99Ms.delta>8)warnings.push('p99尖峰明顯增加，即使p95持平也須排查卡頓');
  if(metrics.drawCallsP95.percent>10)warnings.push('draw calls增加超過10%，檢查合批／可見物件');
  return {map:after.map,width:after.viewport.width,metrics,differences,warnings,
    verdict:'DESCRIPTIVE_ONLY',
    caveats:['即使欄位相同，未驗證同一battle frame／鏡頭／熱狀態，不能當成受控A/B。',
      'JS heap單次讀值不等於GPU記憶體或生命週期洩漏；texture為估算。',
      'coldReadyMs包含DEV模擬與資產就緒，非純地圖載入或production載入。',
      '390px仍是桌機GPU模擬，並非手機真機。']};
}

function selfTest(){
  const row={map:'mirage',viewport:{width:390,height:844},fps:60,frameMs:{p95:16.8,p99:17,max:17.5},render:{callsP95:600,trianglesP95:50000},textureMemoryEstimateMB:28,jsHeapMB:200,coldReadyMs:10000,players:10,rigged:10};
  assert.equal(compareRows(row,row).metrics.fps.percent,0);
  assert.equal(compareRows(row,row).verdict,'DESCRIPTIVE_ONLY');
  const changed={...row,fps:50,frameMs:{p95:33.3,p99:66.6,max:83.4},canvas:{width:500,height:500}};
  assert.equal(compareRows(row,changed).warnings.length,3);
  assert.deepEqual(compareRows(row,changed).differences,['canvas']);
  assert.throws(()=>compareRows(row,{...row,jsHeapMB:undefined}));
  assert.throws(()=>compareRows(row,{...row,map:'dust2'}));
  assert.throws(()=>compareRows(row,{...row,viewport:{width:1366}}));
  assert.equal(compareRows({...row,jsHeapMB:0},row).metrics.jsHeapMB.percent,null);
  console.log('CS performance report self-test: 8/8 PASS');
}

function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  const phase=process.argv.find(a=>a.startsWith('--phase='))?.slice(8);
  const previous=process.argv.find(a=>a.startsWith('--previous='))?.slice(11);
  assert.match(phase||'',/^phase-[a-zA-Z0-9_-]+$/,'需提供安全的--phase=名稱');
  if(previous)assert.match(previous,/^phase-[a-zA-Z0-9_-]+$/,'previous必須是安全的phase名稱');
  const root=path.resolve('review/cs-major-upgrade/evidence'),rows=[],fingerprints=new Set();
  for(const width of [1366,390]){
    const base=width===1366?'baseline-a13-verified-combat':'baseline-a14-verified-combat';
    const before=JSON.parse(fs.readFileSync(path.join(root,base,String(width),'metrics.json'),'utf8'));
    const after=JSON.parse(fs.readFileSync(path.join(root,phase,String(width),'metrics.json'),'utf8'));
    const prior=previous?JSON.parse(fs.readFileSync(path.join(root,previous,String(width),'metrics.json'),'utf8')):null;
    assert.ok(Array.isArray(before)&&Array.isArray(after)&&after.length>0,'量測必須為非空array');
    assert.equal(new Set(after.map(r=>r.map)).size,after.length,'地圖列不可重複');
    for(const current of after){
      const baseline=before.find(r=>r.map===current.map);
      assert.equal(baseline?.sourceSha,FORMAL_SHA,'不得使用錯誤formal baseline');
      assert.equal(current.viewport.width,width);
      assert.match(current.sourceFingerprint?.sha256||'',/^[a-f0-9]{64}$/);
      fingerprints.add(current.sourceFingerprint.sha256);
      const comparison=compareRows(baseline,current);
      if(prior){
        const priorRow=prior.find(r=>r.map===current.map);
        assert.ok(priorRow,'上一輪缺少同圖量測，不能以其他圖代替');
        comparison.previousPhase={phase:previous,...compareRows(priorRow,current)};
      }
      rows.push(comparison);
    }
  }
  assert.equal(fingerprints.size,1,'兩尺寸候選程式來源不一致');
  const coverage=Object.fromEntries([1366,390].map(width=>[width,rows.filter(r=>r.width===width).map(r=>r.map)]));
  assert.deepEqual([...coverage[1366]].sort(),[...coverage[390]].sort(),'兩尺寸地圖覆蓋不同');
  console.log(JSON.stringify({phase,baselineSha:FORMAL_SHA,candidateSha256:[...fingerprints][0],coverage,rows},null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
