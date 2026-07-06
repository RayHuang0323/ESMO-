// 標準回歸 driver：每階段重跑，輸出核心指標。用法：node regress.mjs [engineFile]
import { NEXUS_HP, PITS, dist } from "./src/gameData.js";
const file = process.argv[2] || "./src/LogicEngine.js";
const { LogicEngine } = await import(file);
const DT = 0.5, SEEDS = [1,2,3,7,42,99,123,777,2024,5555,314,271,1618,8080,4242];
const rows = [];
for (const seed of SEEDS) {
  const e = new LogicEngine(seed);
  let fb=null, ace=[], hotF=0, F=0, retreatLock=null, minNexus=NEXUS_HP;
  let dB=0,dR=0,bB=0,bR=0,pd=false,pb=false, lead=[];
  for (let t=DT; t<=1800 && !e.over; t+=DT){
    e.tick(DT); F++;
    minNexus=Math.min(minNexus, e.towers.blue_nexus.hp, e.towers.red_nexus.hp);
    if(fb===null&&(e.bK+e.rK)>0) fb=t;
    const alive=e.players.filter(p=>!p.dead);
    for(const s of ["blue","red"]){const sq=e.players.filter(p=>p.side===s);if(sq.length&&sq.every(p=>p.dead)&&!ace.includes(s+"@"+Math.floor(t))){/*count aces*/}}
    // ACE 次數（進入全滅瞬間）
    let hot=e.dragon.alive||e.baron.alive;
    if(!hot)for(const a of alive){const n=alive.filter(b=>dist(a.pos,b.pos)<14);if(n.filter(b=>b.side!==a.side).length>=1&&n.length>=3){hot=true;break;}}
    if(hot)hotF++;
    const ret=e.players.filter(p=>p.state==="撤退").length;
    if(retreatLock===null&&ret>=8)retreatLock=t;
    if(pd&&!e.dragon.alive){const b=alive.filter(p=>p.side==="blue"&&dist(p.pos,PITS.dragon)<9).length,r=alive.filter(p=>p.side==="red"&&dist(p.pos,PITS.dragon)<9).length;b>=r?dB++:dR++;}
    if(pb&&!e.baron.alive){const b=alive.filter(p=>p.side==="blue"&&dist(p.pos,PITS.baron)<9).length,r=alive.filter(p=>p.side==="red"&&dist(p.pos,PITS.baron)<9).length;b>=r?bB++:bR++;}
    pd=e.dragon.alive;pb=e.baron.alive;
  }
  const towersBroke=Object.values(e.towers).filter(t=>t.lane!=="nexus"&&t.hp<=0).length;
  rows.push({seed,min:(e.t/60).toFixed(1),over:e.over?"✅":"✗",win:e.winner??"—",K:e.bK+e.rK,
    tw:towersBroke,fb:fb?Math.round(fb):"—",hot:(hotF/F*100).toFixed(0)+"%",
    lock:retreatLock?Math.round(retreatLock):"無",D:`${dB}/${dR}`,B:`${bB}/${bR}`});
}
console.table(rows);
const n=rows.length, num=(f)=>rows.reduce((a,x)=>a+(typeof x[f]==="number"?x[f]:parseFloat(x[f])||0),0);
console.log(`結束率 ${rows.filter(x=>x.over==="✅").length}/${n} | 平均時長 ${(num("min")/n).toFixed(1)}分 | 平均擊殺 ${(num("K")/n).toFixed(1)} | 0殺場 ${rows.filter(x=>x.K===0).length} | 撤退鎖死 ${rows.filter(x=>x.lock!=="無").length} | 平均hot ${(rows.reduce((a,x)=>a+parseFloat(x.hot),0)/n).toFixed(0)}% | 平均破塔 ${(num("tw")/n).toFixed(1)}/12`);
