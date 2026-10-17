// One post-match pass over authoritative events/roundStats. No result, rating,
// reward or simulation mutation. Compact enough for the existing result history.
export function buildFpsMatchAnalytics(sim){
 if(sim.sceneVersion!=='major.v1')return null;
 const n=sim.roundHist.length,byId=new Map(sim.players.map(p=>[p.id,{id:p.id,name:p.name,teamId:p.teamId,role:p.roleKey||p.role,kills:p.k,deaths:p.d,assists:p.a,adr:p.adr,kast:p.kast,rating:p.rating,hsPct:p.hsPct,utilityDamage:p.utilDmg,shots:0,hits:0,damage:0,openingKills:0,openingDeaths:0,plants:0,defuses:0,flashEnemies:0,flashSecondsAdded:0,friendlyFlashSeconds:0,tradedDeaths:0,survived:0,clutches:0,multiKills:[0,0,0,0,0,0],rounds:[],roleSamples:{},dutySamples:{}}]));
 for(const shot of sim.shotCadenceTelemetry||[]){const p=byId.get(shot.attackerId);if(p){p.shots++;p.hits+=shot.hit?1:0;p.damage+=shot.damage||0;}}
 const rounds=sim.roundHist.map((r,i)=>{
  const stats=r.roundStats||[];
  for(const s of stats){const p=byId.get(s.id);if(!p)continue;p.tradedDeaths+=s.traded?1:0;p.survived+=s.survived?1:0;p.clutches+=s.clutch?1:0;p.multiKills[Math.min(5,s.k)]++;p.rounds.push({round:i+1,k:s.k,d:s.d,a:s.a,damage:s.dmg,utilityDamage:s.utilDmg||0,traded:Boolean(s.traded),survived:Boolean(s.survived),clutch:Boolean(s.clutch)});}
  const money=team=>{const rows=Object.entries(r.startMoneyByPlayer||{}).filter(([id])=>r.teamIdentityByPlayer?.[id]===team);return rows.length?Math.round(rows.reduce((s,[,v])=>s+v,0)/rows.length):null;};
  return{round:i+1,winner:r.winnerTeam||(r.winner==='t'?'us':'enemy'),winnerSide:r.winnerSide,how:r.how,scoreUs:r.tS,scoreEnemy:r.cS,sides:r.currentSideByTeam||null,moneyUs:money('us'),moneyEnemy:money('enemy'),buyUs:r.buyTypeByTeam?.us||null,buyEnemy:r.buyTypeByTeam?.enemy||null,damageUs:stats.filter(p=>p.teamId==='us').reduce((s,p)=>s+p.dmg,0),damageEnemy:stats.filter(p=>p.teamId==='enemy').reduce((s,p)=>s+p.dmg,0)};
 });
 const seen=new Set(),engagements=[],utility={smokePairSeconds:0,blindPlayerSeconds:0};
 for(let i=0;i<sim.frames.length;i++){
  const f=sim.frames[i],next=sim.frames[i+1],dt=next?.rnd===f.rnd?Math.max(0,next.roundSec-f.roundSec):0;
  utility.smokePairSeconds+=(f.utilityImpact?.smokeDeniedPairs||0)*dt;
  utility.blindPlayerSeconds+=f.players.filter(p=>!p.dead).reduce((s,p)=>s+Math.min(dt,p.blindSec||0),0);
  for(const p of f.players){if(p.dead||f.buyP)continue;const row=byId.get(p.id);if(row){row.roleSamples[p.role]=(row.roleSamples[p.role]||0)+dt;const duty=p.side==='t'?p.tacticalDuty?.attackDuty:p.tacticalDuty?.defenseDuty;if(duty)row.dutySamples[duty]=(row.dutySamples[duty]||0)+dt;}}
  for(const e of f.events||[]){if(!e.id||seen.has(e.id))continue;seen.add(e.id);
   if(e.type==='kill'){const a=byId.get(e.killerId),v=byId.get(e.victimId);if(e.pos)engagements.push({round:f.rnd+1,sec:e.roundSec,killerId:e.killerId,victimId:e.victimId,teamId:a?.teamId||null,x:e.pos.x,y:e.pos.y,gun:e.gun,hs:Boolean(e.hs)});if(e.firstKill){if(a)a.openingKills++;if(v)v.openingDeaths++;}}
   if(e.type==='bomb-planted'){const p=byId.get(e.playerId);if(p)p.plants++;}
   if(e.type==='bomb-defused'){const p=byId.get(e.playerId);if(p)p.defuses++;}
   if(e.type==='flash-effect'){const p=byId.get(e.playerId);if(p){if(e.friendly)p.friendlyFlashSeconds+=e.addedSec;else{p.flashEnemies++;p.flashSecondsAdded+=e.addedSec;}}}
  }
 }
 const players=[...byId.values()].map(p=>({...p,hitPct:p.shots?Math.round(p.hits/p.shots*100):null,damageShare:null}));
 const teams=['us','enemy'].map(id=>{const ps=players.filter(p=>p.teamId===id),sum=k=>ps.reduce((s,p)=>s+(Number(p[k])||0),0),damage=sum('damage');for(const p of ps)p.damageShare=damage?Math.round(p.damage/damage*100):0;const attack=rounds.filter(r=>r.sides?.[id]==='t'),defense=rounds.filter(r=>r.sides?.[id]==='ct');return{id,kills:sum('kills'),deaths:sum('deaths'),assists:sum('assists'),damage,utilityDamage:sum('utilityDamage'),shots:sum('shots'),hits:sum('hits'),openingKills:sum('openingKills'),openingDeaths:sum('openingDeaths'),plants:sum('plants'),defuses:sum('defuses'),flashSecondsAdded:sum('flashSecondsAdded'),attack:{played:attack.length,won:attack.filter(r=>r.winner===id).length},defense:{played:defense.length,won:defense.filter(r=>r.winner===id).length}};});
 return{version:1,source:'saved-roundStats-shotCadence-events.v1',roundCount:n,players,teams,rounds,engagements,utility,coverage:{shots:Array.isArray(sim.shotCadenceTelemetry),flashEvents:sim.frames.some(f=>f.utilityImpact!==undefined),smokeLines:sim.frames.some(f=>f.utilityImpact!==undefined)},definitions:{hitPct:'命中子彈數／射擊子彈數，非官方評級',flashSecondsAdded:'新增致盲秒數；重疊延長只計增量，不等於擊殺貢獻',smokePairSeconds:'被煙霧阻擋的可見範圍敵對交戰線×秒，逐pair累計，非阻擋擊殺或隊伍時間',rating:'ESMO引擎評分，非HLTV／Valve官方評級'}};
}
