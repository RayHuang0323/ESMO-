import { LogicEngine } from "./src/LogicEngine.js";
import { BattleEventTracker, towersDestroyedBy } from "./src/battle/battleEvents.js";
import { emptyBattleState, ingestReducer } from "./src/battle/battleReducer.js";
import { snapshotToBattleResult } from "./src/battle/battleResult.js";
import { applyMatchResult, createInitialProgress, buildLoadout } from "./src/hero/heroProgress.js";
import { standings, playerRanking, analytics } from "./src/platform/seasonData.js";
import { HERO_ASSIGN, ALL_HERO_IDS, ROSTER } from "./src/data/roster.js";
import { heroById } from "./src/data/heroDatabase.js";

// 模擬 useBattleFeed 管線（Node 版）：每幀 tracker+reducer，終局產出 result
function playMatch(seed, loadout) {
  const e = new LogicEngine(seed, loadout);
  const tracker = new BattleEventTracker();
  let state = emptyBattleState();
  let snap = null;
  for (let t = 0.5; t <= 1800; t += 0.5) {
    e.tick(0.5);
    snap = e.snapshot();
    state = ingestReducer(state, tracker.update(snap), snap);
    if (snap.over) break;
  }
  return { snap, log: state.log, result: snapshotToBattleResult(snap, state.log) };
}

let progress = createInitialProgress(ALL_HERO_IDS);
const history = [];
const REQ = ["teams","winner","duration","timeline","mvpId","score","gold","towers","dragon","baron"];
const PREQ = ["id","side","role","heroId","lv","k","d","a","gold","dmg","heal","twrDmg","participation","rating","won","mvp"];

for (const seed of [1, 42, 777]) {
  const lo = buildLoadout(progress, HERO_ASSIGN);
  const { snap, log, result } = playMatch(seed, lo);

  // ① 欄位完整性（第六節要求全欄位）
  const missing = REQ.filter((k) => !(k in result));
  const pMissing = PREQ.filter((k) => !(k in result.players[0]));
  console.log(`seed ${seed} ① BattleResult 欄位完整:`, missing.length + pMissing.length === 0 ? "✅" : "❌ " + missing + pMissing);

  // ② 一致性：Battle 中看到的數據 == BattleResult（同一來源推導）
  const killEvents = log.filter((x) => x.type === "KILL" || x.type === "FIRST_BLOOD").length;
  const cons = result.score.blue === snap.bK && result.score.red === snap.rK
    && result.gold.blue === snap.bGold
    && result.towers.blue === towersDestroyedBy(snap, "blue")
    && result.duration === snap.ts
    && result.timeline.length === log.length
    && killEvents === snap.bK + snap.rK;
  console.log(`  ② 快照↔Result↔Timeline 一致（含擊殺事件數=${killEvents}=比分和）:`, cons ? "✅" : "❌");

  // ③ heroId 全對接 CHAMPIONS_100
  const heroOk = result.players.every((p) => heroById(p.heroId));
  console.log(`  ③ players.heroId 全在英雄資料庫:`, heroOk ? "✅" : "❌");

  // ④ Hero Progress 只消費 BattleResult
  const assign = Object.fromEntries(result.players.map((p) => [p.id, p.heroId]));
  const r = applyMatchResult(progress, result, assign);
  progress = r.progress;
  history.push(result);
}

// ⑤ Season 三 selector 只讀 BattleResult，且與逐場累加一致
const st = standings(history), pr = playerRanking(history), an = analytics(history);
const wSum = st[0].wins + st[1].wins;
const kAgg = history.reduce((s, r) => s + r.score.blue + r.score.red, 0);
const prB3 = pr.find((p) => p.id === "b3");
const kB3 = history.reduce((s, r) => s + r.players.find((p) => p.id === "b3").k, 0);
console.log("⑤ standings 勝場和==場數:", wSum === history.length ? "✅" : "❌",
  "| analytics 場均殺×場數==總殺:", Math.abs(an.avgKills * an.games - kAgg) < 1e-9 ? "✅" : "❌",
  "| ranking b3 生涯K==逐場和:", prB3.k === kB3 ? "✅" : "❌");
console.log("   榜首:", st[0].name, st[0].wins + "勝 | 選手榜首:", pr[0].id, ROSTER[pr[0].id].player, "avgRating", pr[0].avgRating.toFixed(1));
console.log("⑥ Hero Progress 等級（3 場後）:", Object.entries(progress).slice(0,3).map(([h,v])=>h+":Lv"+v.level).join(" "));
