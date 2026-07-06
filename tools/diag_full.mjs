import { LogicEngine } from "./src/LogicEngine.original.js";
import { NEXUS_HP, TOWER_HP, PITS, dist } from "./src/gameData.js";
const DT = 0.5, SEEDS = [1,2,3,7,42,99,123,777,2024,5555];

const agg = { games: [], nexusEverDamaged: 0, retreatLockGames: 0 };
for (const seed of SEEDS) {
  const e = new LogicEngine(seed);
  let firstTowerT = null, towerBreakTs = [], firstBloodT = null;
  let hotFrames = 0, frames = 0, retreatLockAt = null;
  let minNexusB = NEXUS_HP, minNexusR = NEXUS_HP;
  let dragonB=0,dragonR=0,baronB=0,baronR=0, prevDragon=false, prevBaron=false;
  let deadTowerSeen = new Set();
  for (let t = DT; t <= 900; t += DT) {
    e.tick(DT); frames++;
    // 主堡是否曾受傷
    minNexusB = Math.min(minNexusB, e.towers.blue_nexus.hp);
    minNexusR = Math.min(minNexusR, e.towers.red_nexus.hp);
    // 外塔破壞時間
    for (const [k,tw] of Object.entries(e.towers)) {
      if (tw.lane!=="nexus" && tw.hp<=0 && !deadTowerSeen.has(k)) { deadTowerSeen.add(k); towerBreakTs.push(t); if(firstTowerT===null) firstTowerT=t; }
    }
    // First Blood
    if (firstBloodT===null && (e.bK+e.rK)>0) firstBloodT = t;
    // 團戰幀（用引擎 hot 同規則近似：有≥3人含敵方聚類 或 資源坑爭奪）
    const alive = e.players.filter(p=>!p.dead);
    let hot = e.dragon.alive||e.baron.alive;
    if(!hot) for(const a of alive){const near=alive.filter(b=>dist(a.pos,b.pos)<14);if(near.filter(b=>b.side!==a.side).length>=1&&near.length>=3){hot=true;break;}}
    if(hot) hotFrames++;
    // 撤退卡死偵測：≥8人撤退且持續
    const retreating = e.players.filter(p=>p.state==="撤退").length;
    if (retreatLockAt===null && retreating>=8) retreatLockAt = t;
    // 龍/巴龍歸屬（respawn 觸發判定歸屬方：坑邊多者）
    if(prevDragon&&!e.dragon.alive){const b=alive.filter(p=>p.side==="blue"&&dist(p.pos,PITS.dragon)<9).length,r=alive.filter(p=>p.side==="red"&&dist(p.pos,PITS.dragon)<9).length;if(b>=r)dragonB++;else dragonR++;}
    if(prevBaron&&!e.baron.alive){const b=alive.filter(p=>p.side==="blue"&&dist(p.pos,PITS.baron)<9).length,r=alive.filter(p=>p.side==="red"&&dist(p.pos,PITS.baron)<9).length;if(b>=r)baronB++;else baronR++;}
    prevDragon=e.dragon.alive; prevBaron=e.baron.alive;
    if (e.over) break;
  }
  const nexusDmg = (minNexusB<NEXUS_HP)||(minNexusR<NEXUS_HP);
  if (nexusDmg) agg.nexusEverDamaged++;
  if (retreatLockAt!==null) agg.retreatLockGames++;
  agg.games.push({ seed, dur:e.t.toFixed(0), over:e.over, winner:e.winner??"—", kills:e.bK+e.rK,
    towersBroke:deadTowerSeen.size, firstTower:firstTowerT?.toFixed(0)??"—", firstBlood:firstBloodT?.toFixed(0)??"—",
    retreatLock:retreatLockAt?.toFixed(0)??"無", hotPct:(hotFrames/frames*100).toFixed(0)+"%",
    minNexus:Math.min(minNexusB,minNexusR).toFixed(0), dragons:`${dragonB}/${dragonR}`, barons:`${baronB}/${baronR}` });
}
console.table(agg.games);
const g=agg.games;
const avg=(f)=>(g.reduce((a,x)=>a+Number(x[f]),0)/g.length);
console.log(`\n=== 10 問量化 ===`);
console.log(`① 擊殺率：平均 ${avg("kills").toFixed(1)} kills/場（含 0 殺場 ${g.filter(x=>x.kills===0).length}/10）`);
console.log(`② 推塔終局率：分出勝負 ${g.filter(x=>x.over).length}/10；主堡「曾受任何傷害」的場次 ${agg.nexusEverDamaged}/10（最小主堡血 ${Math.min(...g.map(x=>+x.minNexus))} / ${NEXUS_HP}）`);
console.log(`③ AI 卡撤退：≥8人撤退鎖死場次 ${agg.retreatLockGames}/10，平均發生於 ${(g.filter(x=>x.retreatLock!=="無").reduce((a,x)=>a+Number(x.retreatLock),0)/Math.max(1,agg.retreatLockGames)).toFixed(0)}s`);
console.log(`④ 外塔破壞：平均首塔 ${(g.filter(x=>x.firstTower!=="—").reduce((a,x)=>a+ +x.firstTower,0)/g.length).toFixed(0)}s 破，平均破 ${avg("towersBroke").toFixed(1)}/12 座`);
console.log(`⑤ 團戰發生率：平均 hot 幀占比 ${(g.reduce((a,x)=>a+parseFloat(x.hotPct),0)/g.length).toFixed(0)}%`);
console.log(`⑥ Dragon/Baron 參與：${g.map(x=>x.dragons).join(",")} / barons ${g.map(x=>x.barons).join(",")}（常見單方刷）`);
