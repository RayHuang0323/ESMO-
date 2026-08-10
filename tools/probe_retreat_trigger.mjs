//  撤退「觸發條件 vs 離開條件」不對稱的證據探針。
//
//  ── 假說 ──────────────────────────────────────────────────────────────────
//  進入撤退用的 `retreatAt` 是**動態**的，會被暫時性條件灌高
//  （`LogicEngine.js:3346-3401`）：
//      baseRetreatBonus      +0.06（恆常）
//      outnumberRetreatBonus +0.12（敵人多於友軍 +1，隨位置變動）
//      repeatDeathRetreatBonus +0.08（180 秒窗）
//      teamBehind            +0.05
//      burstRetreatBonus     +0.16（**4 秒窗**：最近 4 秒掉血比例 ≥ 0.22）
//      − supportRetreatRelief 0.05 / − escapeRetreatRelief 0.03
//
//  離開撤退用的是**固定**門檻：`returnAt`（0.60）、到泉水附近變 `0.88`。
//
//  ⇒ 一個 45% 血的英雄吃了一次爆發 ⇒ retreatAt 被灌到 ~0.50 ⇒ 觸發撤退。
//     4 秒後爆發窗過期、retreatAt 掉回 ~0.36 ⇒ **他的血量已經高於當下的撤退門檻**，
//     照理不該再撤——但引擎沒有任何重新評估，他會一路跑回泉水補到 88%。
//
//  ── 本探針量什麼 ──────────────────────────────────────────────────────────
//  `p.dbgRetreatAt` 是引擎每 tick 實際採用的門檻（`:3375`，撤退中也照樣更新），
//  所以可以逐 tick 問一個精確的問題：
//
//      「這一 tick 如果他**沒有**在撤退，會不會被觸發撤退？」
//       = (hp/maxHp) >= dbgRetreatAt  ⇒ 不會觸發 ⇒ 稱為「門檻已解除」
//
//  於是把每一段撤退拆成兩截：
//      危險段  = 觸發 → 門檻首次解除
//      僵硬段  = 門檻解除 → 實際離開撤退狀態   ← **這段就是浪費掉的時間**
//
//  ⚠ 純觀測：只讀 hp / dbgRetreatAt / retreatReason / pos / retreating，
//     不呼叫任何會擲骰的方法、不改狀態 ⇒ 對比賽逐位元無影響。
//
//  用法：node tools/probe_retreat_trigger.mjs [--seeds=10] [--stat=decision] [--value=70]

import fs from "fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { toEnginePlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { STAT_DEF } from "../src/data/playerModel.js";
import { FOUNTAIN } from "../src/gameData.js";

const argv = process.argv.slice(2);
const arg = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SEEDS_N = Number(arg("seeds", 10));
const STAT = arg("stat", "decision");
const VALUE = Number(arg("value", 70));
const TAG = arg("out", "retreat_trigger");

const SEED_POOL = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242];
const SEEDS = SEED_POOL.slice(0, SEEDS_N);
const KEYS = STAT_DEF.map((s) => s.key);
const BLUE = ["b1", "b2", "b3", "b4", "b5"];
const RED = ["r1", "r2", "r3", "r4", "r5"];
const MAX_TICKS = 4200, DT = 0.5;
const statsWith = (v) => Object.fromEntries(KEYS.map((k) => [k, k === STAT ? v : 70]));
const spellsFor = (ids) =>
  Object.fromEntries(ids.map((id) => [id, (id === "b2" || id === "r2") ? ["flash", "smite"] : ["flash", "ignite"]]));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const STANDARD = (e) => ({ ...e._neutralKnobs(), joinFight: 0.6, dragonJoin: 0.65, baronJoin: 0.65,
  retreatAt: 0.25, splitPush: 0.1, splitLane: null, gankInterval: 45,
  invadeChance: 0.1, invadeWithMid: false, roamRate: 0.3 });

function runOne(seed, testSide) {
  const e = new LogicEngine(seed);
  const test = statsWith(VALUE), base = statsWith(70);
  e.configurePlayers(toEnginePlayerMods({
    blue: BLUE.map((id) => ({ id, stats: testSide === "blue" ? test : base })),
    red: RED.map((id) => ({ id, stats: testSide === "red" ? test : base })),
  }));
  e.configureHeroes({ blue: null, red: null, meta: null });
  e.configureSpells({ blue: spellsFor(BLUE), red: spellsFor(RED), meta: { version: "rt" } });
  const k = STANDARD(e);
  e.configureMatch({ blue: k, red: k, meta: { tacticId: "standard" } });

  const mine = e.players.filter((p) => p.side === testSide);
  const fountain = FOUNTAIN[testSide];
  const cur = new Map();
  const eps = [];

  for (let i = 0; i < MAX_TICKS && !e.over; i++) {
    e.tick(DT);
    const t = e.t;
    for (const p of mine) {
      if (p.dead) { const c = cur.get(p.id); if (c) { c.died = true; c.tEnd = t; eps.push(c); cur.delete(p.id); } continue; }
      const hpR = p.hp / p.maxHp;
      const thr = p.dbgRetreatAt;                    // 這一 tick 引擎實際採用的撤退門檻
      const foesNear = e.players.filter((q) => q.side !== p.side && !q.dead && d2(q.pos, p.pos) < 10).length;
      const c = cur.get(p.id);

      if (p.retreating && !c) {
        cur.set(p.id, {
          tStart: t, hpStart: hpR, thrStart: thr, reason: p.retreatReason ?? null,
          foesAtStart: foesNear,
          tThrClear: null, tFoesClear: null, died: false,
          //  觸發當下血量是否**已經**高於門檻？（＝這次撤退是被暫時性條件推出來的）
          aboveThrAtStart: thr != null ? hpR >= thr : null,
        });
      } else if (p.retreating && c) {
        //  門檻已解除：這一 tick 若沒在撤退，不會被觸發
        if (c.tThrClear == null && thr != null && hpR >= thr) c.tThrClear = t;
        if (c.tFoesClear == null && foesNear === 0) c.tFoesClear = t;
      } else if (!p.retreating && c) {
        c.tEnd = t;
        c.durSec = t - c.tStart;
        c.hpEnd = hpR;
        c.atFountain = d2(p.pos, fountain) < 12;
        eps.push(c); cur.delete(p.id);
      }
    }
  }
  for (const [, c] of cur) { c.tEnd = e.t; c.durSec = c.tEnd - c.tStart; c.unfinished = true; eps.push(c); }
  return eps;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, f) => (a.length ? (a.filter(f).length / a.length) * 100 : null);
const f2 = (x, n = 1) => (x == null ? "—" : x.toFixed(n));

const all = [];
for (const seed of SEEDS) for (const side of ["blue", "red"]) all.push(...runOne(seed, side));
const done = all.filter((x) => !x.unfinished && !x.died);

//  僵硬段：門檻解除 → 實際離開
const rigid = done.filter((x) => x.tThrClear != null).map((x) => x.tEnd - x.tThrClear);
const rigidFoes = done.filter((x) => x.tFoesClear != null).map((x) => x.tEnd - x.tFoesClear);

console.log(`# 撤退觸發 vs 離開 不對稱探針｜${SEEDS.length} seeds × 鏡像｜${STAT}=${VALUE}｜情境 standard`);
console.log(`# 純觀測，對比賽逐位元無影響\n`);
console.log(`撤退段落總數 ${all.length}｜完成且未死亡 ${done.length}\n`);

console.log(`## 觸發當下`);
console.log(`  平均血量 ${f2(mean(done.map((x) => x.hpStart)) * 100)}%｜平均採用門檻 ${f2(mean(done.map((x) => x.thrStart)) * 100)}%`);
console.log(`  **觸發當下血量就已高於門檻的比例 ${f2(pct(done, (x) => x.aboveThrAtStart))}%**（＝被暫時性條件推出來的）`);
console.log(`  觸發當下身邊無敵人的比例 ${f2(pct(done, (x) => x.foesAtStart === 0))}%`);
const reasons = {};
for (const x of done) reasons[x.reason ?? "(無)"] = (reasons[x.reason ?? "(無)"] ?? 0) + 1;
console.log(`  觸發理由分布：${Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / done.length * 100).toFixed(0)}%`).join("｜")}`);

console.log(`\n## 段落結構`);
console.log(`  總時長 平均 ${f2(mean(done.map((x) => x.durSec)))} 秒／中位 ${f2(med(done.map((x) => x.durSec)))} 秒`);
console.log(`  結束血量 ${f2(mean(done.map((x) => x.hpEnd)) * 100)}%｜在泉水結束 ${f2(pct(done, (x) => x.atFountain))}%`);
console.log(`  門檻在撤退期間解除過的比例 ${f2(pct(done, (x) => x.tThrClear != null))}%`);
console.log(`  身邊敵人在撤退期間清空過的比例 ${f2(pct(done, (x) => x.tFoesClear != null))}%`);

console.log(`\n## 僵硬段（本探針的核心數字）`);
console.log(`  **門檻解除 → 實際離開：平均 ${f2(mean(rigid))} 秒／中位 ${f2(med(rigid))} 秒**`);
console.log(`  敵人清空 → 實際離開：平均 ${f2(mean(rigidFoes))} 秒／中位 ${f2(med(rigidFoes))} 秒`);
const totDur = mean(done.map((x) => x.durSec));
console.log(`  ⇒ 僵硬段佔整段撤退的 ${f2(mean(rigid) / totDur * 100)}%`);

fs.mkdirSync("review/moba-combat", { recursive: true });
fs.writeFileSync(`review/moba-combat/${TAG}.json`, JSON.stringify({
  generatedBy: "tools/probe_retreat_trigger.mjs", seeds: SEEDS, stat: STAT, value: VALUE,
  episodes: all.length, done: done.length,
  hpStart: mean(done.map((x) => x.hpStart)), thrStart: mean(done.map((x) => x.thrStart)),
  aboveThrAtStartPct: pct(done, (x) => x.aboveThrAtStart),
  noFoeAtStartPct: pct(done, (x) => x.foesAtStart === 0),
  durSec: totDur, hpEnd: mean(done.map((x) => x.hpEnd)),
  atFountainPct: pct(done, (x) => x.atFountain),
  thrClearedPct: pct(done, (x) => x.tThrClear != null),
  rigidSec: mean(rigid), rigidMed: med(rigid), rigidFoesSec: mean(rigidFoes),
  reasons,
}, null, 2), "utf8");
console.log(`\n⇒ review/moba-combat/${TAG}.json`);
