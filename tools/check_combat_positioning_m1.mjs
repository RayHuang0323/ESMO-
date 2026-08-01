#!/usr/bin/env node
// ============================================================================
//  tools/check_combat_positioning_m1.mjs — Milestone M1：接線後的行為驗證
//
//  M 基礎層驗的是「不呼叫時逐位元不變」；**本檔驗的是「呼叫之後真的不一樣」**，
//  而且是**量出來的行為差異**，不是 grep 程式碼：
//    · 近戰／遠程的實際交戰距離分布
//    · front / back / flank / support 四種站位的實際距離差異
//    · 角色重疊、卡死、打不到人的事件數
//  讀引擎內部狀態（snapshot 不是引擎狀態的全集）。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { dist } from "../src/gameData.js";
import { CHAMPIONS_100 } from "../src/data/heroDatabase.js";
import { toEngineArchetypes, getHeroCombatArchetype } from "../src/data/heroCombatArchetypes.js";

let pass = 0, fail = 0;
const ck = (l, c, e = null) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; console.log(`❌ ${l}${e != null ? `　→ ${JSON.stringify(e)}` : ""}`); } };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
/** 交戰窗：最近敵人在這個距離內才算「正在對峙」，才拿來量站位。 */
const FIGHT_WINDOW = 15;

//  兩隊都排成「前排 2 / 中 1 / 後排 2」，讓四種站位都出現在同一場
const LINEUP = {
  b1: "ironclad",   // tank      front
  b2: "duskblade",  // assassin  flank
  b3: "bingshuang", // mage      back
  b4: "leiting",    // marksman  back
  b5: "shengguang", // support   support（遠程輔助）
  r1: "cinderfist", // fighter   front
  r2: "chichuan",   // fighter   front
  r3: "lieyan",     // mage      back
  r4: "yanfeng",    // marksman  back
  r5: "dadi",       // tank      front（近戰輔助位）
};
const roster = Object.fromEntries(Object.entries(LINEUP).map(([k, v]) => [k, { heroId: v }]));
const mods = toEngineArchetypes(roster);
const blue = {}, red = {};
for (const [pid, m] of Object.entries(mods)) (pid[0] === "r" ? red : blue)[pid] = m;

/** 跑一場並收集行為觀測。 */
function observe(seed, ticks = 4200) {
  const e = new LogicEngine(seed);
  e.configureArchetypes({ blue, red, meta: null });
  const acc = {};
  for (const id of Object.keys(LINEUP)) {
    acc[id] = { engageDists: [], nearestFoe: [], overlapTicks: 0, ticksWithFoeInRange: 0, ticks: 0 };
  }
  let stuckTicks = 0;
  for (let i = 0; i < ticks && !e.over; i++) {
    e.tick(0.5);
    for (const p of e.players) {
      const a = acc[p.id]; if (!a || p.dead) continue;
      a.ticks++;
      //  最近敵人距離（站位的直接量測）
      let fd = Infinity, foe = null;
      for (const q of e.players) {
        if (q.side === p.side || q.dead) continue;
        const d = dist(p.pos, q.pos);
        if (d < fd) { fd = d; foe = q; }
      }
      //  ⚠ 只在**交戰窗內**（最近敵人 < FIGHT_WINDOW）才採計站位。
      //     整場平均會被對線地理主導——上路／打野天生離敵人遠、中路天生近——
      //     量出來的是地圖形狀，不是站位行為（第一版就這樣把 front/back 判反）。
      if (foe && Number.isFinite(fd) && fd < FIGHT_WINDOW) {
        a.nearestFoe.push(fd);
        //  真的在交戰距離內 ⇒ 記錄一次「有效攻擊距離」
        if (fd < e._engageRange(p)) { a.engageDists.push(fd); a.ticksWithFoeInRange++; }
      }
      //  重疊：和任一隊友距離 < 1.0（英雄半徑量級）⇒ 疊在同一點
      for (const q of e.players) {
        if (q.side !== p.side || q.id === p.id || q.dead) continue;
        if (dist(p.pos, q.pos) < 1.0) { a.overlapTicks++; break; }
      }
    }
    //  卡死：全隊都沒有任何人在交戰距離內，且比賽已過 5 分鐘
    if (e.t > 300 && e.players.every((p) => p.dead || !e.players.some((q) =>
      q.side !== p.side && !q.dead && dist(p.pos, q.pos) < e._engageRange(p)))) stuckTicks++;
  }
  return { acc, stuckTicks, over: e.over, min: e.t / 60 };
}

const SEEDS = [42, 7, 99, 123, 777];
const runs = SEEDS.map((s) => observe(s));
const agg = {};
for (const id of Object.keys(LINEUP)) {
  agg[id] = {
    hero: LINEUP[id],
    line: getHeroCombatArchetype(LINEUP[id]).formationLine,
    attackType: getHeroCombatArchetype(LINEUP[id]).attackType,
    engageRange: getHeroCombatArchetype(LINEUP[id]).baseAttackRange,
    samples: runs.reduce((s, r) => s + r.acc[id].nearestFoe.length, 0),
    meanNearestFoe: mean(runs.flatMap((r) => r.acc[id].nearestFoe)),
    meanEngageDist: mean(runs.flatMap((r) => r.acc[id].engageDists)),
    inRangeShare: runs.reduce((s, r) => s + r.acc[id].ticksWithFoeInRange, 0)
      / Math.max(1, runs.reduce((s, r) => s + r.acc[id].ticks, 0)),
    overlapShare: runs.reduce((s, r) => s + r.acc[id].overlapTicks, 0)
      / Math.max(1, runs.reduce((s, r) => s + r.acc[id].ticks, 0)),
  };
}

console.log(`── 實測站位（5 seeds，只採計最近敵人 < ${FIGHT_WINDOW} 的交戰窗）──`);
console.log("席位 英雄        線位     類型    契約射程  平均最近敵距  有效交戰距離  在射程內%  重疊%");
for (const [id, a] of Object.entries(agg)) {
  console.log(`${id}  ${a.hero.padEnd(11)} ${a.line.padEnd(8)} ${a.attackType.padEnd(7)} ${String(a.engageRange).padEnd(9)} ${a.meanNearestFoe.toFixed(2).padStart(11)} ${a.meanEngageDist.toFixed(2).padStart(13)} ${(a.inRangeShare * 100).toFixed(1).padStart(9)} ${(a.overlapShare * 100).toFixed(1).padStart(6)}`);
}

console.log("\n── §1 近戰 / 遠程 ──");
{
  const melee = Object.values(agg).filter((a) => a.attackType === "melee");
  const ranged = Object.values(agg).filter((a) => a.attackType === "ranged");
  const mE = mean(melee.map((a) => a.meanEngageDist));
  const rE = mean(ranged.map((a) => a.meanEngageDist));
  ck(`1) 近戰的有效交戰距離 ${mE.toFixed(2)} 明顯小於遠程 ${rE.toFixed(2)}`,
    mE < rE - 1.0, { melee: +mE.toFixed(2), ranged: +rE.toFixed(2) });
  ck("2) 每位近戰的有效交戰距離都在自己的契約射程內",
    melee.every((a) => a.meanEngageDist <= a.engageRange + 0.01),
    melee.map((a) => [a.hero, +a.meanEngageDist.toFixed(2), a.engageRange]));
  ck("3) 遠程不必貼身也能交戰（平均交戰距離 > 近戰契約射程上限 4.28）",
    rE > 4.28, +rE.toFixed(2));
  ck("4) 近戰仍打得到人（在射程內的 tick 佔比 > 3%）",
    melee.every((a) => a.inRangeShare > 0.03),
    melee.map((a) => [a.hero, +(a.inRangeShare * 100).toFixed(1)]));
}

console.log("\n── §2 四種站位差異 ──");
{
  const byLine = {};
  for (const a of Object.values(agg)) (byLine[a.line] ??= []).push(a.meanNearestFoe);
  const m = Object.fromEntries(Object.entries(byLine).map(([k, v]) => [k, mean(v)]));
  console.log("   線位平均最近敵距:", Object.entries(m).map(([k, v]) => `${k} ${v.toFixed(2)}`).join("  "));
  ck("5) front 比 back 更靠近敵人（前排真的在前排）",
    m.front < m.back, { front: +m.front.toFixed(2), back: +m.back.toFixed(2) });
  ck("6) back 不會主動貼到近戰核心內（平均距離 > 近戰契約射程 4.28）",
    m.back > 4.28, +m.back.toFixed(2));
  ck("7) flank 與 front / back 都不同（有自己的接敵距離）",
    Math.abs(m.flank - m.front) > 0.2 && Math.abs(m.flank - m.back) > 0.2,
    { flank: +m.flank.toFixed(2), front: +m.front.toFixed(2), back: +m.back.toFixed(2) });
  ck("8) support 保持在後方（比 front 遠）",
    m.support > m.front, { support: +m.support.toFixed(2), front: +m.front.toFixed(2) });
  ck("9) 四種線位的平均距離互不相同（不是同一個站位換名字）",
    new Set(Object.values(m).map((v) => v.toFixed(1))).size >= 3, m);
}

console.log("\n── §3 沒有卡死、沒有疊成一點 ──");
{
  ck("10) 沒有角色長時間疊在同一點（任一席位重疊佔比 < 25%）",
    Object.values(agg).every((a) => a.overlapShare < 0.25),
    Object.entries(agg).map(([id, a]) => [id, +(a.overlapShare * 100).toFixed(1)]).filter((x) => x[1] >= 25));
  ck("11) 沒有「全隊長時間打不到任何人」的卡死",
    runs.every((r) => r.stuckTicks / 2400 < 0.5),
    runs.map((r) => r.stuckTicks));
  ck("12) 所有觀測場次都收得掉",
    runs.every((r) => r.over), runs.map((r) => [r.over, +r.min.toFixed(1)]));
  ck("12a) 交戰窗內的站位樣本數足夠（每個席位 > 200 筆）",
    Object.values(agg).every((a) => a.samples > 200),
    Object.entries(agg).map(([id, a]) => [id, a.samples]));
}

console.log("\n── §4 決定性與邊界 ──");
{
  const a1 = observe(42, 600), a2 = observe(42, 600);
  ck("13) 同 seed 兩次跑出完全相同的站位觀測（無新增 RNG）",
    JSON.stringify(a1.acc) === JSON.stringify(a2.acc));
  const off = new LogicEngine(42);
  ck("14) 未呼叫 configureArchetypes ⇒ 交戰距離仍是硬編碼 8",
    off._engageRange(off.players[0]) === 8);
  ck("15) 100 位英雄都能產生引擎可吃的原型（Adapter 全覆蓋）",
    (() => {
      const all = toEngineArchetypes(Object.fromEntries(
        CHAMPIONS_100.map((c, i) => [`p${i}`, { heroId: c.id }])));
      return Object.keys(all).length === 100
        && Object.values(all).every((m) => m.engageRange > 0 && ["melee", "ranged"].includes(m.attackType));
    })());
  {
    //  塔／野怪／Boss 的距離規則不得被英雄契約覆蓋
    const src = (await import("node:fs")).readFileSync("src/LogicEngine.js", "utf8");
    ck("16) 塔與野怪仍讀自己的規則常數（沒有被英雄契約覆蓋）",
      src.includes("R.towerAggroRange") && src.includes("R.campAttackRange")
      && !/tower[\s\S]{0,40}_engageRange/.test(src) && !/camp[\s\S]{0,40}_engageRange/.test(src));
  }
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
