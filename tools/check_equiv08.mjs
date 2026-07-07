import { LogicEngine as S07 } from "./src/LogicEngine.s07.js";
import { LogicEngine as S08 } from "./src/LogicEngine.js";
import { attrs } from "./src/hero/heroProgress.js";
const norm = (s0)=>{const s=JSON.parse(JSON.stringify(s0));s.players.forEach(p=>{delete p.lv;});return JSON.stringify(s);};
// ① 預設(無loadout)逐幀等價
let ok=true;
for(const seed of [1,42,777,2024,9999]){
  const a=new S07(seed), b=new S08(seed); let t;
  for(t=0.5;t<=1800;t+=0.5){a.tick(0.5);b.tick(0.5);
    if((t*2)%40===0||a.over){if(norm(a.snapshot())!==norm(b.snapshot())){ok=false;break;}}
    if(a.over&&b.over)break;}
  if(a.winner!==b.winner)ok=false;
}
console.log("① 無 loadout 逐幀等價（Battle Balance 零改變）:", ok?"✅":"❌");
// ② 對稱等級（雙方全 L10 / L20）：節奏是否仍在 15-25 分
for(const L of [10,20]){
  const A=attrs(L); const lo={};
  for(const s of ["b","r"])for(let i=1;i<=5;i++)lo[s+i]={level:L,toughMult:A.toughMult,powerMult:A.powerMult};
  let durs=[],ends=0,bw=0,ks=0;
  for(const seed of [1,2,3,7,42,99,123,777,2024,5555]){
    const e=new S08(seed,lo);
    for(let t=0.5;t<=1800&&!e.over;t+=0.5)e.tick(0.5);
    if(e.over)ends++; if(e.winner==="blue")bw++; durs.push(e.t/60); ks+=e.bK+e.rK;
  }
  console.log(`② 對稱 L${L}: 結束${ends}/10 藍勝${bw} 平均${(durs.reduce((a,b)=>a+b,0)/10).toFixed(1)}分 均殺${(ks/10).toFixed(0)} 15-25達標${durs.filter(d=>d>=15&&d<=25).length}/10`);
}
// ③ 不對稱理智：藍 L15 vs 紅 L1 → 藍應顯著較常勝
const A15=attrs(15),A1=attrs(1); const lo={};
for(let i=1;i<=5;i++){lo["b"+i]={level:15,toughMult:A15.toughMult,powerMult:A15.powerMult};lo["r"+i]={level:1,toughMult:1,powerMult:1};}
let bw=0,ends=0;
for(const seed of [1,2,3,7,42,99,123,777,2024,5555]){const e=new S08(seed,lo);for(let t=0.5;t<=1800&&!e.over;t+=0.5)e.tick(0.5);if(e.over){ends++;if(e.winner==="blue")bw++;}}
console.log(`③ 不對稱 L15vsL1: 藍勝 ${bw}/${ends}`, bw>=8?"✅ 等級真實影響戰局":"❌");
// ④ snapshot 帶 lv
const e=new S08(1,lo);e.tick(0.5);console.log("④ snapshot.players.lv:", e.snapshot().players[0].lv===15?"✅":"❌");
