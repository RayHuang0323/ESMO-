// Lossless wire-only interning. No frame omission, numeric rounding, simulation
// or playback. References are expanded before the ordinary Replay validator.
export const CS_PLAYER_POOL_ENCODING='round-prefix-player-pool.v1';
const FIELDS=new Set(['stats','route','routePoints','tacticalDuty','tacticalIntent','awareness','coverAssessment','postPlantPlan','retakeCoverPlan','_routePlan','_lastRouteBuild','_hitters','_activeStuckEpisode','nades']);
const MARKER='$fpsPlayer';
export function packCsReplayPlayers(frames) {
 const counts=new Map(),texts=new WeakMap();
 const text=value=>{let s=texts.get(value);if(s===undefined){s=JSON.stringify(value);texts.set(value,s);}return s;};
 for(const frame of frames)for(const p of frame.players)for(const k of FIELDS){const v=p[k];if(v&&typeof v==='object'){const s=text(v);if(s.length>=80)counts.set(s,(counts.get(s)||0)+1);}}
 const pool=[],ids=new Map();
 const packed=frames.map(frame=>({...frame,players:frame.players.map(p=>{const row={...p};for(const k of FIELDS){const v=p[k];if(!v||typeof v!=='object')continue;const s=text(v);if((counts.get(s)||0)<2)continue;let id=ids.get(s);if(id===undefined){id=pool.length;ids.set(s,id);pool.push(v);}row[k]=[MARKER,id];}return row;})}));
 return {frames:packed,pool};
}
export function unpackCsReplayPlayers(simulation,pool) {
 if(!Array.isArray(pool)||pool.length>200000||!Array.isArray(simulation?.frames)||simulation.frames.length>200000)throw Error('玩家共用資料表不合法');
 if(pool.some(v=>!v||typeof v!=='object'))throw Error('玩家共用資料內容不合法');
 for(const f of simulation.frames){
  if(!Array.isArray(f?.players)||f.players.length!==10)throw Error('保存選手資料不完整');
  for(const p of f.players)for(const k of FIELDS){
   const v=p?.[k];if(!Array.isArray(v)||v[0]!==MARKER)continue;
   if(v.length!==2||!Number.isSafeInteger(v[1])||v[1]<0||v[1]>=pool.length)throw Error('玩家共用資料引用不合法');
   p[k]=pool[v[1]];
  }
 }
}
