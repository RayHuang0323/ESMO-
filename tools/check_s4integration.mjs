// Sprint05 引擎 × Sprint04 呈現層 全鏈路回歸：證明不破壞 Sprint04，且事件豐富
import { LogicEngine } from "./src/LogicEngine.js";
import { BattleEventTracker } from "./src/battle/battleEvents.js";
import { ingestReducer, emptyBattleState } from "./src/battle/battleReducer.js";
import { computeFocus } from "./src/battle/battleFocus.js";
import { fmtT } from "./src/gameData.js";

// (1) 個人 KDA 守恆（Sprint04 儀器化）在新 AI 下仍成立
let allKd=true;
for(const seed of [1,42,777,2024,9999]){
  const e=new LogicEngine(seed);
  for(let t=0.5;t<=1800&&!e.over;t+=0.5)e.tick(0.5);
  const sumK=e.players.reduce((s,p)=>s+p.k,0), sumD=e.players.reduce((s,p)=>s+p.d,0);
  if(sumK!==e.bK+e.rK||sumD!==e.bK+e.rK)allKd=false;
}
console.log("① 個人KDA守恆(sumK==團隊K):", allKd?"✅":"❌");

// (2) snapshot 契約穩定：Sprint04 依賴的欄位皆在
const e2=new LogicEngine(1); e2.tick(0.5); const s=e2.snapshot();
const need=["ts","players","towers","lanes","dragon","baron","fx","feed","bK","rK","bGold","rGold","winProb","over","winner"];
const pNeed=["id","side","role","pos","hp","dead","k","d","gold","state"];
const ok2=need.every(k=>k in s)&&pNeed.every(k=>k in s.players[0]);
console.log("② snapshot 契約完整(Sprint04 呈現層依賴):", ok2?"✅":"❌");

// (3) 事件層全鏈路：一場完整 Timeline 事件類型統計
const e3=new LogicEngine(1), tr=new BattleEventTracker();
let st=emptyBattleState(), types={}, focusMove=0, pf=null, F=0;
for(let t=0.5;t<=1800&&!e3.over;t+=0.5){
  e3.tick(0.5); const snap=e3.snapshot();
  const evs=tr.update(snap); st=ingestReducer(st,evs,snap);
  for(const ev of evs)types[ev.type]=(types[ev.type]||0)+1;
  const f=computeFocus(snap); if(pf&&(Math.abs(f.x-pf.x)>1||Math.abs(f.y-pf.y)>1))focusMove++; pf=f; F++;
}
console.log("③ Timeline 事件類型(seed=1):", JSON.stringify(types));
console.log("   焦點移動幀占比:", (focusMove/F*100).toFixed(0)+"% | MVP:", JSON.stringify(st.mvp));

// (4) Timeline 豐富度：多 seed 每場事件類型覆蓋
let rich=0;
for(const seed of [2,3,7,42,99,777,2024,5555]){
  const e=new LogicEngine(seed), t=new BattleEventTracker(); const seen=new Set();
  for(let tt=0.5;tt<=1800&&!e.over;tt+=0.5){for(const ev of t.update(e.snapshot()))seen.add(ev.type);e.tick(0.5);}
  // 需含：擊殺類 + 塔 + 龍 + Victory
  if(seen.has("TOWER_DESTROYED")&&seen.has("DRAGON_SLAIN")&&seen.has("VICTORY")&&(seen.has("KILL")||seen.has("FIRST_BLOOD")))rich++;
}
console.log("④ Timeline 豐富(含擊殺+塔+龍+勝利)場次:", rich+"/8");
