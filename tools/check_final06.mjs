import { LogicEngine } from "./src/LogicEngine.js";
import { BattleEventTracker, mvpCandidate, playerRating, participation } from "./src/battle/battleEvents.js";
import { ingestReducer, emptyBattleState } from "./src/battle/battleReducer.js";
import { computeFocus } from "./src/battle/battleFocus.js";

// (1) 單向流動：掛呈現層(tracker+reducer+focus) vs 不掛，引擎結果必須完全一致（20 seed）
const SEEDS=[1,2,3,7,42,99,123,777,2024,5555,314,271,1618,8080,4242,11,88,256,1000,9999];
let oneWay=true;
for(const seed of SEEDS){
  const eA=new LogicEngine(seed);                    // 純引擎
  for(let t=0.5;t<=1800&&!eA.over;t+=0.5)eA.tick(0.5);
  const eB=new LogicEngine(seed);                    // 引擎+完整呈現層消費
  const tr=new BattleEventTracker(); let st=emptyBattleState();
  for(let t=0.5;t<=1800&&!eB.over;t+=0.5){eB.tick(0.5);const s=eB.snapshot();st=ingestReducer(st,tr.update(s),s);computeFocus(s);mvpCandidate(s);}
  if(eA.winner!==eB.winner||eA.bK!==eB.bK||eA.rK!==eB.rK||Math.abs(eA.t-eB.t)>1e-9)oneWay=false;
}
console.log("① 單向流動（呈現層不影響 Battle，20 seed）:", oneWay?"✅":"❌");

// (2) Snapshot 契約（Sprint06 版）
const e=new LogicEngine(1); e.tick(0.5); const s=e.snapshot();
const pNeed=["id","side","role","pos","hp","dead","respawn","state","k","d","a","gold","dmg","heal"];
console.log("② Snapshot 契約（players 含", pNeed.join("/"), "）:", pNeed.every(k=>k in s.players[0])?"✅":"❌");

// (3) 全鏈路一場：助攻文字、MVP、參與率、Rating、終局
const e3=new LogicEngine(1), tr3=new BattleEventTracker(); let st3=emptyBattleState(), sn;
for(let t=0.5;t<=1800&&!e3.over;t+=0.5){e3.tick(0.5);sn=e3.snapshot();st3=ingestReducer(st3,tr3.update(sn),sn);}
const killWithAst=st3.events.find(ev=>ev.text.includes("助攻"));
console.log("③ 擊殺事件含助攻:", killWithAst?"✅ 例:"+killWithAst.text:"（本場無多人參與擊殺）");
console.log("   終局 VICTORY:", st3.events.some(ev=>ev.type==="VICTORY")?"✅":"❌", "| MVP:", JSON.stringify(st3.mvp));
const mvpP=sn.players.find(p=>p.id===st3.mvp.id);
console.log("   MVP 參與率:", (participation(mvpP,sn)*100).toFixed(0)+"%", "Rating:", playerRating(mvpP).toFixed(1));
console.log("   復活倒數資料樣本:", JSON.stringify(sn.players.filter(p=>p.dead).slice(0,1).map(p=>({id:p.id,respawn:+p.respawn.toFixed(1)}))));
