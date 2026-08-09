//  撤退生命週期探針 —— 回答「撤退之後到底發生什麼」。
//
//  為什麼需要：`analyze_retreat_chain.mjs` 證明了收益鏈斷掉（撤退越多、
//  推塔/作戰分越低），但它是**每場一個值**的統計，看不到單次撤退的內部過程。
//  這支逐 tick 追蹤每一段撤退，把生命週期拆成可量測的階段：
//
//     retreat trigger → disengage → safety reached → recovery
//     → re-evaluate → re-engage → lane/objective reinsertion → push
//
//  ⚠ 純觀測：只讀 p.pos / p.hp / p.retreating / p.twrDmg / p.atkTicks / p.fsm，
//     不呼叫任何會擲骰的引擎方法、不改任何狀態 ⇒ 加不加這支，比賽逐位元相同。
//
//  用法：node tools/probe_retreat_lifecycle.mjs [--seeds=N] [--stat=decision] [--value=90]
//        node tools/probe_retreat_lifecycle.mjs --seeds=10 --stat=decision --value=40,70,90

import fs from "fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { toEnginePlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { STAT_DEF } from "../src/data/playerModel.js";
import { FOUNTAIN } from "../src/gameData.js";

const argv = process.argv.slice(2);
const arg = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SEEDS_N = Number(arg("seeds", 10));
const STAT = arg("stat", "decision");
const VALUES = (arg("value", "40,70,90")).split(",").map(Number);
const TAG = arg("out", `retreat_probe_${STAT}`);

const SEED_POOL = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242,
  31337, 65535, 1024, 2048, 4096, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
if (SEEDS_N > SEED_POOL.length) { console.error(`seed 池只有 ${SEED_POOL.length} 個`); process.exit(1); }
const SEEDS = SEED_POOL.slice(0, SEEDS_N);

const KEYS = STAT_DEF.map((s) => s.key);
const BLUE = ["b1", "b2", "b3", "b4", "b5"];
const RED = ["r1", "r2", "r3", "r4", "r5"];
const MAX_TICKS = 4200;
const DT = 0.5;

const statsWith = (key, v) => Object.fromEntries(KEYS.map((k) => [k, k === key ? v : 70]));
const spellsFor = (ids) =>
  Object.fromEntries(ids.map((id) => [id, (id === "b2" || id === "r2") ? ["flash", "smite"] : ["flash", "ignite"]]));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

//  正式對局條件（逐鍵＝ toEngineTactic(STANDARD_OPP_TACTIC)，見 METHOD_CAVEAT.md）
const STANDARD = (e) => ({ ...e._neutralKnobs(), joinFight: 0.6, dragonJoin: 0.65, baronJoin: 0.65,
  retreatAt: 0.25, splitPush: 0.1, splitLane: null, gankInterval: 45,
  invadeChance: 0.1, invadeWithMid: false, roamRate: 0.3 });

/** 跑一場，回傳受測方每一段撤退的生命週期紀錄。 */
function runOne(seed, value, testSide) {
  const e = new LogicEngine(seed);
  const test = statsWith(STAT, value);
  const base = statsWith(STAT, 70);
  e.configurePlayers(toEnginePlayerMods({
    blue: BLUE.map((id) => ({ id, stats: testSide === "blue" ? test : base })),
    red: RED.map((id) => ({ id, stats: testSide === "red" ? test : base })),
  }));
  e.configureHeroes({ blue: null, red: null, meta: null });
  e.configureSpells({ blue: spellsFor(BLUE), red: spellsFor(RED), meta: { version: "probe" } });
  const knobs = STANDARD(e);
  e.configureMatch({ blue: knobs, red: knobs, meta: { tacticId: "standard" } });

  const mine = e.players.filter((p) => p.side === testSide);
  const fountain = FOUNTAIN[testSide];
  //  敵方塔：用來量「離推進目標多遠」
  const foeTowers = () => Object.values(e.towers).filter((t) => t.hp > 0 && t.side !== testSide);
  const nearestFoeTower = (pos) => {
    let best = Infinity;
    for (const t of foeTowers()) { const d = d2(pos, t.pos); if (d < best) best = d; }
    return Number.isFinite(best) ? best : null;
  };

  const st = new Map();     // 每個 player 的當前撤退段落
  const post = new Map();   // 撤退結束後的「歸位追蹤」
  const eps = [];
  let ticks = 0;
  //  ── 關鍵反證指標：`fightUptime = 1 − retreatingTicks/aliveTicks`
  //  （`measure_stat_sensitivity.mjs:361`）把「已經 retreating=false、但人還在自家
  //  後場走路」算成**在場**。這裡直接量那段時間：活著、沒在撤退、卻站在自家泉水
  //  30 單位內 ⇒ 定義上不可能對任何敵方建築施壓。
  let aliveTicks = 0, retreatingTicks = 0, homeIdleTicks = 0;

  for (let i = 0; i < MAX_TICKS && !e.over; i++) {
    e.tick(DT);
    ticks++;
    const t = e.t;
    for (const p of mine) {
      if (p.dead) {
        //  死亡結束一切追蹤：死掉的撤退不算「撤退成功」，歸位追蹤也作廢
        const cur = st.get(p.id);
        if (cur) { cur.diedDuring = true; cur.tEnd = t; cur.hpEnd = 0; eps.push(cur); st.delete(p.id); }
        post.delete(p.id);
        continue;
      }
      aliveTicks++;
      if (p.retreating) retreatingTicks++;
      else if (d2(p.pos, fountain) < 30) homeIdleTicks++;
      const cur = st.get(p.id);
      if (p.retreating && !cur) {
        //  ⚠ 必須在 `post.delete` **之前**把「又撤了」記回上一段——第一版寫反了，
        //     導致 tToReRetreat 恆為 null、「反覆退進」永遠是 0.0%。
        const prevPv = post.get(p.id);
        if (prevPv) {
          prevPv.ep.tToReRetreat = t - prevPv.tReturn;
          prevPv.ep.tToAtk = prevPv.tFirstAtk;
          prevPv.ep.tToTwr = prevPv.tFirstTwr;
        }
        //  ── 階段 1：retreat trigger
        st.set(p.id, {
          seed, value, side: testSide, id: p.id, role: p.role,
          tStart: t, hpStart: p.hp / p.maxHp,
          fdistStart: d2(p.pos, fountain),
          towerDistStart: nearestFoeTower(p.pos),
          minFdist: d2(p.pos, fountain),
          recalled: false, reachedFountain: false,
          ticksRetreating: 0, diedDuring: false,
        });
        post.delete(p.id);
      } else if (p.retreating && cur) {
        cur.ticksRetreating++;
        const fd = d2(p.pos, fountain);
        if (fd < cur.minFdist) cur.minFdist = fd;
        //  ── 階段 2/3：disengage → safety reached
        if (fd < 12) cur.reachedFountain = true;
        if (p.fsm === "RECALL" || p.recallT > 0) cur.recalled = true;
      } else if (!p.retreating && cur) {
        //  ── 階段 4/5：recovery 完成 → re-evaluate
        cur.tEnd = t;
        cur.hpEnd = p.hp / p.maxHp;
        cur.fdistEnd = d2(p.pos, fountain);
        cur.towerDistEnd = nearestFoeTower(p.pos);
        cur.durSec = cur.tEnd - cur.tStart;
        eps.push(cur);
        st.delete(p.id);
        //  ── 階段 6/7/8：開始追蹤「多久才真的重新投入 / 推到塔」
        post.set(p.id, {
          ep: cur, tReturn: t,
          atk0: p.atkTicks ?? 0, twr0: p.twrDmg ?? 0,
          tFirstAtk: null, tFirstTwr: null, reRetreatT: null,
        });
      }
      //  歸位追蹤（撤退結束之後）
      const pv = post.get(p.id);
      if (pv) {
        if (pv.tFirstAtk == null && (p.atkTicks ?? 0) > pv.atk0) pv.tFirstAtk = t - pv.tReturn;
        if (pv.tFirstTwr == null && (p.twrDmg ?? 0) > pv.twr0 + 1e-9) pv.tFirstTwr = t - pv.tReturn;
        if (p.retreating && pv.reRetreatT == null) pv.reRetreatT = t - pv.tReturn;
        //  兩者都拿到、或已再次撤退 ⇒ 收掉
        if ((pv.tFirstAtk != null && pv.tFirstTwr != null) || pv.reRetreatT != null) {
          pv.ep.tToAtk = pv.tFirstAtk; pv.ep.tToTwr = pv.tFirstTwr; pv.ep.tToReRetreat = pv.reRetreatT;
          post.delete(p.id);
        }
      }
    }
  }
  //  收尾：仍在追蹤中的補上（未觀測到 ⇒ null，代表「到比賽結束都沒發生」）
  for (const [id, pv] of post) { pv.ep.tToAtk = pv.tFirstAtk; pv.ep.tToTwr = pv.tFirstTwr; pv.ep.tToReRetreat = pv.reRetreatT; }
  for (const [id, cur] of st) { cur.tEnd = e.t; cur.durSec = cur.tEnd - cur.tStart; cur.unfinished = true; eps.push(cur); }

  return { eps, minutes: e.t / 60, ticks, aliveTicks, retreatingTicks, homeIdleTicks };
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, f) => (a.length ? (a.filter(f).length / a.length) * 100 : null);
const f2 = (x, n = 2) => (x == null ? "—" : x.toFixed(n));

console.log(`# 撤退生命週期探針｜素質 ${STAT}｜${SEEDS.length} seeds × 藍紅鏡像｜情境 standard（正式對局條件）`);
console.log(`# 純觀測：不呼叫擲骰方法、不改狀態 ⇒ 對比賽逐位元無影響\n`);

const out = [];
for (const value of VALUES) {
  const all = [];
  let totMin = 0, n = 0, tAlive = 0, tRetreat = 0, tHome = 0;
  for (const seed of SEEDS) {
    for (const side of ["blue", "red"]) {
      const r = runOne(seed, value, side);
      all.push(...r.eps); totMin += r.minutes; n++;
      tAlive += r.aliveTicks; tRetreat += r.retreatingTicks; tHome += r.homeIdleTicks;
    }
  }
  const done = all.filter((x) => !x.unfinished);
  const survived = done.filter((x) => !x.diedDuring);
  const row = {
    value, matches: n, minutes: totMin / n,
    episodes: all.length, episodesPerMatch: all.length / n,
    diedDuringPct: pct(done, (x) => x.diedDuring),
    //  階段 1
    hpStart: mean(all.map((x) => x.hpStart)) * 100,
    towerDistStart: mean(all.map((x) => x.towerDistStart).filter((v) => v != null)),
    //  階段 2/3：撤到哪裡才算安全
    reachedFountainPct: pct(survived, (x) => x.reachedFountain),
    recalledPct: pct(survived, (x) => x.recalled),
    minFdist: mean(survived.map((x) => x.minFdist)),
    //  階段 4：恢復
    durSec: mean(survived.map((x) => x.durSec)),
    durSecMed: med(survived.map((x) => x.durSec)),
    hpEnd: mean(survived.map((x) => x.hpEnd)) * 100,
    //  階段 5/6：重新投入
    fdistEnd: mean(survived.map((x) => x.fdistEnd)),
    towerDistEnd: mean(survived.map((x) => x.towerDistEnd).filter((v) => v != null)),
    tToAtk: mean(survived.map((x) => x.tToAtk).filter((v) => v != null)),
    tToAtkNullPct: pct(survived, (x) => x.tToAtk == null),
    //  階段 7/8：推進歸位
    tToTwr: mean(survived.map((x) => x.tToTwr).filter((v) => v != null)),
    tToTwrNullPct: pct(survived, (x) => x.tToTwr == null),
    //  反覆退進
    tToReRetreat: mean(survived.map((x) => x.tToReRetreat).filter((v) => v != null)),
    reRetreatPct: pct(survived, (x) => x.tToReRetreat != null && x.tToReRetreat < 15),
    //  完整往返成本：撤退開始 → 撤退結束 → 首次推塔
    cycleToTwr: mean(survived.filter((x) => x.tToTwr != null).map((x) => x.durSec + x.tToTwr)),
    //  時間會計：fightUptime 認定的「在場」裡，有多少其實是站在自家後場
    fightUptime: 1 - tRetreat / tAlive,
    homeIdlePct: (tHome / tAlive) * 100,
    retreatPct: (tRetreat / tAlive) * 100,
    trueUptime: 1 - (tRetreat + tHome) / tAlive,
  };
  out.push(row);

  console.log(`## ${STAT} = ${value}｜${n} 場｜平均 ${f2(row.minutes)} 分｜撤退段落 ${f2(row.episodesPerMatch, 1)}/場`);
  console.log(`  【1 觸發】 起始血量 ${f2(row.hpStart, 1)}%｜離最近敵塔 ${f2(row.towerDistStart, 1)}`);
  console.log(`  【2 脫離】 回城使用率 ${f2(row.recalledPct, 1)}%｜**撤到泉水的比例 ${f2(row.reachedFountainPct, 1)}%**｜最近點離泉水 ${f2(row.minFdist, 1)}`);
  console.log(`  【3 恢復】 段落時長 平均 ${f2(row.durSec, 1)} 秒／中位 ${f2(row.durSecMed, 1)} 秒｜結束血量 ${f2(row.hpEnd, 1)}%`);
  console.log(`  【4 歸位】 結束時離泉水 ${f2(row.fdistEnd, 1)}｜**離最近敵塔 ${f2(row.towerDistEnd, 1)}**`);
  console.log(`  【5 再投入】結束→首次攻擊 ${f2(row.tToAtk, 1)} 秒（沒再攻擊 ${f2(row.tToAtkNullPct, 1)}%）`);
  console.log(`  【6 推進】  **結束→首次推塔 ${f2(row.tToTwr, 1)} 秒**（沒再推塔 ${f2(row.tToTwrNullPct, 1)}%）`);
  console.log(`  【7 反覆】  15 秒內再次撤退 ${f2(row.reRetreatPct, 1)}%｜平均間隔 ${f2(row.tToReRetreat, 1)} 秒`);
  console.log(`  【8 往返】  撤退開始→再次推塔的完整成本 ${f2(row.cycleToTwr, 1)} 秒`);
  console.log(`  【死亡】   撤退途中死亡 ${f2(row.diedDuringPct, 1)}%`);
  console.log(`  【時間會計】fightUptime 認定在場 ${f2(row.fightUptime * 100, 1)}%｜其中站在自家後場 ${f2(row.homeIdlePct, 1)}%｜**扣掉後真實在場 ${f2(row.trueUptime * 100, 1)}%**\n`);
}

const DIR = "review/moba-combat";
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(`${DIR}/${TAG}.json`, JSON.stringify({
  generatedBy: "tools/probe_retreat_lifecycle.mjs", stat: STAT, values: VALUES,
  seeds: SEEDS, scenario: "standard", rows: out,
}, null, 2), "utf8");
console.log(`⇒ ${DIR}/${TAG}.json`);
