import { LogicEngine } from "./src/LogicEngine.js";
import { BattleEventTracker } from "./src/battle/battleEvents.js";
import { ingestReducer, emptyBattleState } from "./src/battle/battleReducer.js";
import { computeSpectatorFocus, computeFocus } from "./src/battle/battleFocus.js";

// (1) 全場：結構化 data、series 取樣、單調性
const e = new LogicEngine(1), tr = new BattleEventTracker();
let st = emptyBattleState(), sn;
for (let t = 0.5; t <= 1800 && !e.over; t += 0.5) { e.tick(0.5); sn = e.snapshot(); st = ingestReducer(st, tr.update(sn), sn); }
const kills = st.events.filter(x=>x.type==="KILL"||x.type==="FIRST_BLOOD");
const structOk = kills.every(x=>x.data&&x.data.killer&&x.data.victim&&Array.isArray(x.data.assists));
const tw = st.events.find(x=>x.type==="TOWER_DESTROYED");
console.log("① 擊殺事件結構化(killer/victim/assists):", structOk?"✅":"❌", "| 塔事件 data:", JSON.stringify(tw?.data));
const mono = st.series.every((p,i)=>i===0||p.t>st.series[i-1].t);
const lastS = st.series[st.series.length-1];
console.log("② series 取樣:", st.series.length, "點 | 單調遞增:", mono?"✅":"❌", "| 終局點含 over 時刻:", Math.abs(lastS.t-sn.ts)<1e-9?"✅":"❌", "| 末點:", JSON.stringify(lastS));

// (2) 導播焦點：VICTORY 鎖主堡
const fV = computeSpectatorFocus(sn, st.events);
const nex = Object.values(sn.towers).find(t=>t.lane==="nexus"&&t.hp<=0);
console.log("③ VICTORY 聚焦被毀主堡:", Math.abs(fV.x-nex.pos.x)<0.01&&Math.abs(fV.y-nex.pos.y)<0.01?"✅":"❌", `(${fV.x},${fV.y}) intensity=${fV.intensity}`);

// (3) 事件過期回退 computeFocus（人工：塔事件 5 秒前→應回退）
const fOld = computeSpectatorFocus({...sn, ts: sn.ts+999, over:false, towers: sn.towers, players: sn.players, dragon: sn.dragon, baron: sn.baron}, st.events.filter(x=>x.type!=="VICTORY"));
const fBase = computeFocus({...sn, ts: sn.ts+999, over:false});
console.log("④ 事件過期回退基礎焦點:", fOld.x===fBase.x&&fOld.y===fBase.y?"✅":"❌");

// (4) 呈現層升級後單向流動再證（3 seed 快檢）
let oneWay = true;
for (const seed of [1,42,777]) {
  const a=new LogicEngine(seed); for(let t=0.5;t<=1800&&!a.over;t+=0.5)a.tick(0.5);
  const b=new LogicEngine(seed); const tb=new BattleEventTracker(); let sb=emptyBattleState();
  for(let t=0.5;t<=1800&&!b.over;t+=0.5){b.tick(0.5);const s=b.snapshot();sb=ingestReducer(sb,tb.update(s),s);computeSpectatorFocus(s,sb.events);}
  if(a.winner!==b.winner||a.bK!==b.bK)oneWay=false;
}
console.log("⑤ 單向流動維持:", oneWay?"✅":"❌");
