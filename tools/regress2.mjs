// 進階回歸：加 ACE 統計 + 逆轉偵測（勝率曾落後 40% 後翻盤）+ 時長分布
import { NEXUS_HP, PITS, dist, clamp } from "./src/gameData.js";
const { LogicEngine } = await import("./src/LogicEngine.js");
const DT = 0.5, SEEDS = [1,2,3,7,42,99,123,777,2024,5555,314,271,1618,8080,4242,11,88,256,1000,9999];
let ends=0, blueW=0, aceGames=0, comebacks=0, totK=0, totMin=0, fbSum=0, fbN=0, baronGames=0;
const durs=[];
for (const seed of SEEDS) {
  const e = new LogicEngine(seed);
  let aces=0, pAll={blue:false,red:false}, minWinProb=1, maxWinProb=0, baronKilled=0, pb=false;
  for (let t=DT; t<=1800 && !e.over; t+=DT){
    e.tick(DT);
    for(const s of ["blue","red"]){const sq=e.players.filter(p=>p.side===s);const all=sq.length&&sq.every(p=>p.dead);if(all&&!pAll[s])aces++;pAll[s]=all;}
    const wp=e.snapshot().winProb; minWinProb=Math.min(minWinProb,wp); maxWinProb=Math.max(maxWinProb,wp);
    if(pb&&!e.baron.alive)baronKilled++; pb=e.baron.alive;
  }
  ends+=e.over?1:0; if(e.winner==="blue")blueW++;
  if(aces>0)aceGames++; totK+=e.bK+e.rK; totMin+=e.t/60; durs.push(e.t/60);
  if(baronKilled>0)baronGames++;
  // 逆轉：最終勝方在過程中 winProb 曾對其不利（<0.4 或 >0.6 反向）
  const finalBlue=e.winner==="blue";
  if((finalBlue&&minWinProb<0.4)||(!finalBlue&&maxWinProb>0.6))comebacks++;
}
const n=SEEDS.length;
durs.sort((a,b)=>a-b);
console.log(`結束率 ${ends}/${n} | 藍勝 ${blueW} 紅勝 ${ends-blueW}（平衡度 ${Math.abs(blueW/ends-0.5).toFixed(2)}）`);
console.log(`時長 平均${(totMin/n).toFixed(1)}分 中位${durs[Math.floor(n/2)].toFixed(1)} 範圍${durs[0].toFixed(1)}~${durs[n-1].toFixed(1)}分`);
console.log(`平均擊殺 ${(totK/n).toFixed(1)} | ACE場次 ${aceGames}/${n} | Baron場次 ${baronGames}/${n} | 逆轉場次 ${comebacks}/${n}`);
console.log(`15-25分達標 ${durs.filter(d=>d>=15&&d<=25).length}/${n} | <15分 ${durs.filter(d=>d<15).length} | >25分 ${durs.filter(d=>d>25).length}`);
