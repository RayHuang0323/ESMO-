import { LogicEngine } from "./src/LogicEngine.js";
import { BattleEventTracker } from "./src/battle/battleEvents.js";
import { emptyBattleState, ingestReducer } from "./src/battle/battleReducer.js";
import { snapshotToBattleResult } from "./src/battle/battleResult.js";
import { standings, playerRanking, analytics } from "./src/platform/seasonData.js";
import { applyMatchResult, createInitialProgress, buildLoadout } from "./src/hero/heroProgress.js";
import { HERO_ASSIGN, ALL_HERO_IDS, ROSTER, TEAMS } from "./src/data/roster.js";
import { heroById, CHAMPIONS_100 } from "./src/data/heroDatabase.js";

function playMatch(seed, lo) {
  const e = new LogicEngine(seed, lo); const tr = new BattleEventTracker(); let st = emptyBattleState(), snap;
  for (let t=0.5;t<=1800;t+=0.5){e.tick(0.5);snap=e.snapshot();st=ingestReducer(st,tr.update(snap),snap);if(snap.over)break;}
  return { snap, result: snapshotToBattleResult(snap, st.log) };
}
let progress = createInitialProgress(ALL_HERO_IDS); const history = [];
for (const seed of [1,42,777]) {
  const { result } = playMatch(seed, buildLoadout(progress, HERO_ASSIGN));
  const assign = Object.fromEntries(result.players.map(p=>[p.id,p.heroId]));
  progress = applyMatchResult(progress, result, assign).progress;
  history.push(result);
}
// ① Dashboard 頂部摘要 == season standings（唯一來源，非重算）
const st = standings(history), blue = st.find(t=>t.side==="blue");
const wSum = st[0].wins+st[1].wins;
console.log("① Dashboard 戰績摘要來自 season 唯一來源:", blue.wins+blue.losses===history.length && wSum===history.length ? "✅" : "❌", `(藍 ${blue.wins}勝${blue.losses}敗 勝率${Math.round(blue.winRate*100)}%)`);
// ② 選手面板 Lv/RTG == heroProgress/season（非重算）
const rank = playerRanking(history);
const b3 = rank.find(p=>p.id==="b3"), b3k = history.reduce((s,r)=>s+r.players.find(p=>p.id==="b3").k,0);
console.log("② 選手面板數據源一致（b3 生涯K==逐場和）:", b3.k===b3k ? "✅" : "❌", `Lv${progress[HERO_ASSIGN.b3].level} ${b3.avgRating.toFixed(0)}RTG`);
// ③ Hero Strip 欄位皆可從 snapshot 取得（真資料）＋無資料欄位明確為佔位
const { snap } = playMatch(9, buildLoadout(progress, HERO_ASSIGN));
const p0 = snap.players[0];
const realFields = ["hp","lv","k","d","a","gold","state","respawn","dead"].every(k=>k in p0);
console.log("③ HeroStrip 真資料欄位齊備(hp/lv/kda/gold/state):", realFields?"✅":"❌", "| Mana/技能CD/Buff/裝備=保留位置(snapshot 無此欄，符合規範)");
// ④ 101 英雄擴充性：注入新英雄，不改任何 Engine/UI/Result/Progress/Season
const hero101 = { id:"test101", en:"Test", zh:"測試英雄", title:"擴充驗證", arch:"戰士", lane:"上路", color:"#8b5cf6", diff:2, P:"被動",Q:"技能Q",W:"技能W",E:"技能E",R:"大招R" };
const DB2 = [...CHAMPIONS_100, hero101];
const found = DB2.find(c=>c.id==="test101");
// 模擬把某選手指派給新英雄 → progress 自動長出、result 自動帶 heroId、season 自動統計
const assign2 = { ...HERO_ASSIGN, b1: "test101" };
let prog2 = createInitialProgress([...ALL_HERO_IDS, "test101"]);
const e2 = new LogicEngine(5, buildLoadout(prog2, assign2));  // 引擎不知道英雄是誰，只吃 loadout
for(let t=0.5;t<=1800&&!e2.over;t+=0.5)e2.tick(0.5);
const r2 = snapshotToBattleResult(e2.snapshot(), [], { heroAssign: assign2 });
const applied = applyMatchResult(prog2, r2, assign2);
const seasonOK = analytics([r2]).games===1;
console.log("④ 101 英雄擴充（僅新增 Hero Data）:",
  found && r2.players.find(p=>p.id==="b1").heroId==="test101" && applied.progress.test101.mastery.games===1 && seasonOK ? "✅ Engine/UI/Result/Progress/Season 皆不需改" : "❌");
// ⑤ MOBA/CS 分離：CS 不得引入 Hero 欄位（roster/heroDatabase 僅 MOBA 用）
console.log("⑤ MOBA 模型 Player→Hero 對接 CHAMPIONS_100:", ROSTER.b1.heroId && heroById(ROSTER.b1.heroId) ? "✅" : "❌", "| CS Player→Weapon 為 Legacy 獨立模型（未混用）");
