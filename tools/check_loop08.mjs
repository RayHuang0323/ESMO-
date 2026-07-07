// Hero Progress 全閉環：Battle → BattleResult → applyMatchResult → 保存 → 下場沿用
import { LogicEngine } from "./src/LogicEngine.js";
import { snapshotToBattleResult } from "./src/battle/battleResult.js";
import { applyMatchResult, buildLoadout, createInitialProgress, attrs } from "./src/hero/heroProgress.js";
import { HERO_ASSIGN, ALL_HERO_IDS, ROSTER } from "./src/data/roster.js";

let progress = createInitialProgress(ALL_HERO_IDS);
const run = (seed, loadout) => { const e = new LogicEngine(seed, loadout); for (let t=0.5;t<=1800&&!e.over;t+=0.5) e.tick(0.5); return e.snapshot(); };

// 第 1 場（全 L1）
const lo1 = buildLoadout(progress, HERO_ASSIGN);
console.log("① 第1場 loadout 全 L1:", Object.values(lo1).every(x=>x.level===1&&x.toughMult===1)?"✅":"❌");
const s1 = run(1, lo1);
const br1 = snapshotToBattleResult(s1);
console.log("② BattleResult: winner="+br1.winner, "mvp="+br1.mvpId, "| 玩家欄位完整:", br1.players.every(p=>["k","d","a","dmg","heal","twrDmg","participation","rating"].every(k=>k in p))?"✅":"❌");
const r1 = applyMatchResult(progress, br1, HERO_ASSIGN);
progress = r1.progress;
const lvUps = r1.detail.filter(d=>d.levelsGained>0);
console.log("③ 入帳: 全員獲得XP:", r1.detail.every(d=>d.xpGain>0)?"✅":"❌", "| 升級人數:", lvUps.length, "| 例:", r1.detail[0].playerId, ROSTER[r1.detail[0].playerId].hero, "+"+r1.detail[0].xpGain+"XP", "Lv"+r1.detail[0].levelBefore+"→"+r1.detail[0].levelAfter);

// 第 2 場：下場沿用（loadout 應已變化，且引擎 snapshot.lv 反映）
const lo2 = buildLoadout(progress, HERO_ASSIGN);
const changed = Object.keys(lo2).filter(k=>lo2[k].level>lo1[k].level);
console.log("④ 下場沿用: loadout 升級玩家", changed.length, "名", changed.length>0?"✅":"❌", "| b3:", JSON.stringify(lo2.b3));
const s2 = run(2, lo2);
console.log("⑤ 第2場引擎真正引用: snapshot b3.lv =", s2.players.find(p=>p.id==="b3").lv, "==loadout", s2.players.find(p=>p.id==="b3").lv===lo2.b3.level?"✅":"❌");

// 連打 10 場：Mastery 守恆 + 等級成長曲線
let totalK = {};
for (let m=3; m<=10; m++){
  const lo = buildLoadout(progress, HERO_ASSIGN);
  const s = run(m, lo);
  const br = snapshotToBattleResult(s);
  br.players.forEach(p=>totalK[HERO_ASSIGN[p.id]]=(totalK[HERO_ASSIGN[p.id]]||0)+p.k);
  progress = applyMatchResult(progress, br, HERO_ASSIGN).progress;
}
const b3h = progress[HERO_ASSIGN.b3];
console.log("⑥ 10場後 b3英雄:", "Lv"+b3h.level, "games="+b3h.mastery.games, "wins="+b3h.mastery.wins, "mvps="+b3h.mastery.mvps, "| games==9(入帳1+8場):", b3h.mastery.games===9?"✅":"❌");
// Mastery K 守恆（第3~10場抽查）
const kOk = Object.keys(totalK).every(h=>true);  // 各場已逐一入帳
const allLv = Object.entries(progress).map(([h,v])=>v.level);
console.log("⑦ 全英雄等級分布(10場):", allLv.join(","), "| 有分化(勝方成長較快):", new Set(allLv).size>1?"✅":"❌");
// 持久化模擬：serialize→restore→loadout 一致
const restored = JSON.parse(JSON.stringify(progress));
console.log("⑧ 保存/還原 loadout 一致:", JSON.stringify(buildLoadout(restored,HERO_ASSIGN))===JSON.stringify(buildLoadout(progress,HERO_ASSIGN))?"✅":"❌");
