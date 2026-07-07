import { xpNeed, attrs, grantXp, xpFromResult, applyMatchResult, createInitialProgress, buildLoadout, LEVEL_CAP } from "./src/hero/heroProgress.js";
// ① 升級曲線單調 + 屬性表
let mono = true; for (let L=1; L<LEVEL_CAP; L++) if (xpNeed(L+1) <= xpNeed(L)) mono = false;
console.log("① xpNeed 單調遞增:", mono?"✅":"❌", "| L1→2:", xpNeed(1), "L10→11:", xpNeed(10), "L19→20:", xpNeed(19));
const a1=attrs(1), a10=attrs(10), a20=attrs(20);
console.log("   attrs L1:", JSON.stringify(a1), "\n   attrs L20: tough×"+a20.toughMult.toFixed(3), "power×"+a20.powerMult.toFixed(3));
console.log("   L1 基準為 1.0:", a1.toughMult===1&&a1.powerMult===1?"✅":"❌");
// ② 連續升級 + 封頂
let h={xp:0,level:1,mastery:{}}; const g=grantXp(h, 10000);
console.log("② 大量XP連續升級: level", g.level, "溢流封頂:", g.level<=LEVEL_CAP && g.xp<=xpNeed(LEVEL_CAP)?"✅":"❌");
// ③ 純函數性 + mastery 守恆
const prog = createInitialProgress(["hero_a","hero_b"]);
const br = { winner:"blue", duration:1000, score:{blue:10,red:5}, gold:{blue:1,red:1}, mvpId:"b1",
  players:[{id:"b1",side:"blue",role:"mid",k:8,d:2,a:5,gold:3000,dmg:20000,heal:5000,twrDmg:2000,participation:0.8,rating:30,won:true,mvp:true},
           {id:"r1",side:"red",role:"top",k:2,d:6,a:1,gold:1500,dmg:9000,heal:8000,twrDmg:500,participation:0.5,rating:5,won:false,mvp:false}]};
const snap0 = JSON.stringify(prog);
const { progress: p2, detail } = applyMatchResult(prog, br, { b1:"hero_a", r1:"hero_b" });
console.log("③ 純函數(入參不變):", JSON.stringify(prog)===snap0?"✅":"❌");
const ha = p2.hero_a;
console.log("   hero_a XP=", detail[0].xpGain, "(=90+64+20+48+80+60 cap400)", detail[0].xpGain===Math.min(400,90+64+20+48+80+60)?"✅":"❌",
  "| mastery k守恆:", ha.mastery.k===8?"✅":"❌", "| 升級明細:", detail[0].levelBefore+"→"+detail[0].levelAfter);
// ④ loadout
const lo = buildLoadout(p2, { b1:"hero_a" });
console.log("④ buildLoadout:", JSON.stringify(lo.b1), lo.b1.level===p2.hero_a.level?"✅":"❌");
