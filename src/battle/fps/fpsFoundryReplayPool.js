// Foundry新增的重複規劃資料僅在wire去重；還原所有欄位後才進既有驗證器。
export const CS_FOUNDRY_POOL_ENCODING='round-prefix-foundry-pool.v1';
const FIELDS=['utilityPlans','holdCoverPlan','_foundryEarnedLanes'],MARKER='$fpsFoundryValue';
export function packFoundryReplayExtras(frames){
 const texts=new WeakMap(),counts=new Map(),text=v=>{let s=texts.get(v);if(s===undefined){s=JSON.stringify(v);texts.set(v,s);}return s;};
 for(const f of frames)for(const p of f.players)for(const k of FIELDS){const v=p[k];if(v&&typeof v==='object'){const s=text(v);if(s.length>=80)counts.set(s,(counts.get(s)||0)+1);}}
 const pool=[],ids=new Map();
  const packed=frames.map(f=>({...f,players:f.players.map(p=>{const row={...p};for(const k of FIELDS){const v=p[k];if(!v||typeof v!=='object')continue;const s=text(v),escaped=Array.isArray(v)&&v[0]===MARKER;if(!escaped&&(counts.get(s)||0)<2)continue;let id=ids.get(s);if(id===undefined){id=pool.length;ids.set(s,id);pool.push(v);}row[k]=[MARKER,id];}return row;})}));
 return {frames:packed,pool};
}
export function unpackFoundryReplayExtras(simulation,pool){
 if(!Array.isArray(pool)||pool.length>200000||pool.some(v=>!v||typeof v!=='object')||!Array.isArray(simulation?.frames)||simulation.frames.length>200000)throw Error('鑄造廠重播共用資料不完整');
 for(const f of simulation.frames){if(!Array.isArray(f?.players)||f.players.length!==10)throw Error('保存選手資料不完整');for(const p of f.players)for(const k of FIELDS){const v=p?.[k];if(!Array.isArray(v)||v[0]!==MARKER)continue;if(v.length!==2||!Number.isSafeInteger(v[1])||v[1]<0||v[1]>=pool.length)throw Error('鑄造廠重播引用不合法');p[k]=pool[v[1]];}}
}
