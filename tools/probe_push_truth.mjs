//  真實推進 KPI 探針 —— 取代 `towerPushes` 作為推進強度主證據。
//
//  ── 為什麼需要這支 ────────────────────────────────────────────────────────
//  STAT_IMPACT_FINAL_R10.md §2 的全部推進結論都建立在 `exec[side].towerPushes`。
//  但那個計數器是（`LogicEngine.js:2389`）：
//
//      if (K && this.t - S.pushTick > 10) { S.pushTick = this.t; ...towerPushes++; }
//
//  `S = this._tac[p.side]` ⇒ **隊伍層級**、且**每 10 秒最多 +1**，上限 ≈ 場長秒數/10。
//  它量的是「有多少個 10 秒窗口，這隊至少有一個人碰到塔」——一個**責任週期 / presence**
//  指標，不是推進強度。五人猛拆與一人慢磨計數相同。
//  ⇒ 撤退變多 ⇒ 同時在塔邊的人變少 ⇒ 計數器掉，但**總推塔輸出未必掉**。
//
//  本檔同時輸出兩層，強制把「競技影響」與「行為品質」分開：
//
//   【A 競技影響】真實產出
//      twrDmg        該側五人 p.twrDmg 總和  ← **推進強度主 KPI**
//      towersKilled  敵方路上塔被推掉的數量
//      nexusDmg      敵方主堡被扣血量
//      objKills      龍/巴龍歸屬該側的擊殺數（引擎原生 killerTeam）
//      deaths/kills/assists、fightUptime、trueActive、winRate
//
//   【B 行為品質】撤退生命週期
//      retreatEpisodes / reachedFountainPct / returnToActionSec
//      postRetreatNoContribPct  撤退結束後、到下一次撤退或死亡前，
//                               完全沒有產生攻擊/推塔/目標貢獻的比例
//      repeatRetreat15sPct
//
//  ⚠ 純觀測：只讀狀態，不呼叫會擲骰的方法、不改任何欄位 ⇒ 對比賽逐位元無影響。
//  ⚠ 中性基準（全 70）只算一次——16 項在 70 分時完全相同。
//
//  用法：node tools/probe_push_truth.mjs [--seeds=30] [--stats=decision,positioning,courage,clutch]

import fs from "fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { toEnginePlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { STAT_DEF } from "../src/data/playerModel.js";
import { FOUNTAIN, PITS } from "../src/gameData.js";

const argv = process.argv.slice(2);
const arg = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SEEDS_N = Number(arg("seeds", 30));
const STATS = arg("stats", "decision,positioning,courage,clutch").split(",").filter(Boolean);
const TAG = arg("out", "push_truth");

const SEED_POOL = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242,
  31337, 65535, 1024, 2048, 4096, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43,
  47, 53, 59, 61, 67, 71, 73, 79, 83, 89];
if (SEEDS_N > SEED_POOL.length) { console.error(`seed 池只有 ${SEED_POOL.length} 個`); process.exit(1); }
const SEEDS = SEED_POOL.slice(0, SEEDS_N);

const KEYS = STAT_DEF.map((s) => s.key);
const BLUE = ["b1", "b2", "b3", "b4", "b5"];
const RED = ["r1", "r2", "r3", "r4", "r5"];
const MAX_TICKS = 4200, DT = 0.5;
const statsWith = (key, v) => Object.fromEntries(KEYS.map((k) => [k, k === key ? v : 70]));
const spellsFor = (ids) =>
  Object.fromEntries(ids.map((id) => [id, (id === "b2" || id === "r2") ? ["flash", "smite"] : ["flash", "ignite"]]));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

//  正式對局條件（逐鍵＝ toEngineTactic(STANDARD_OPP_TACTIC)，見 METHOD_CAVEAT.md）
const STANDARD = (e) => ({ ...e._neutralKnobs(), joinFight: 0.6, dragonJoin: 0.65, baronJoin: 0.65,
  retreatAt: 0.25, splitPush: 0.1, splitLane: null, gankInterval: 45,
  invadeChance: 0.1, invadeWithMid: false, roamRate: 0.3 });

const PIT_R = 9;

function run(seed, key, value, testSide) {
  const e = new LogicEngine(seed);
  const test = statsWith(key, value), base = statsWith(key, 70);
  e.configurePlayers(toEnginePlayerMods({
    blue: BLUE.map((id) => ({ id, stats: testSide === "blue" ? test : base })),
    red: RED.map((id) => ({ id, stats: testSide === "red" ? test : base })),
  }));
  e.configureHeroes({ blue: null, red: null, meta: null });
  e.configureSpells({ blue: spellsFor(BLUE), red: spellsFor(RED), meta: { version: "pt" } });
  const k = STANDARD(e);
  e.configureMatch({ blue: k, red: k, meta: { tacticId: "standard" } });

  const foe = testSide === "blue" ? "red" : "blue";
  //  ⚠ 主堡是 `towers["<side>_nexus"]`（`LogicEngine.js:210-211`），不是 `e.nexus`。
  const nexus0 = e.towers[`${foe}_nexus`]?.hp ?? null;
  const mine = e.players.filter((p) => p.side === testSide);
  const fountain = FOUNTAIN[testSide];

  let aliveT = 0, retreatT = 0, homeIdleT = 0;
  //  撤退段落追蹤
  const cur = new Map(), post = new Map();
  const eps = [];
  //  目標擊殺歸屬（引擎原生）
  //  ⚠ 目標物件在 `e.neutrals[key]`（見 measure_stat_sensitivity.mjs:277），
  //     **不是** `e.dragon` / `e.baron`——後者是舊規則集的欄位，V3 下不會被更新，
  //     用它偵測會讓 objKills 恆為 0（第一版就踩到）。
  let objKills = 0;
  const objLive = { dragon: false, baron: false };

  const contrib = (p) => ({ atk: p.atkTicks ?? 0, twr: p.twrDmg ?? 0, obj: p._probeObjT ?? 0 });

  for (let i = 0; i < MAX_TICKS && !e.over; i++) {
    e.tick(DT);
    const t = e.t;
    //  目標擊殺歸屬：以 alive 由 true→false 的邊緣讀 killerTeam（引擎原生歸屬）
    for (const nm of ["dragon", "baron"]) {
      const o = e.neutrals?.[nm];
      if (!o) continue;
      if (objLive[nm] && !o.alive && o.killerTeam === testSide) objKills++;
      objLive[nm] = o.alive;
    }
    for (const p of mine) {
      //  目標坑內 tick（純取樣的貢獻代理）
      if (!p.dead) {
        for (const nm of ["dragon", "baron"]) {
          const o = e.neutrals?.[nm];
          if (o?.alive && d2(p.pos, o.pos ?? PITS[nm]) < PIT_R) p._probeObjT = (p._probeObjT ?? 0) + 1;
        }
      }
      if (p.dead) {
        const c = cur.get(p.id);
        if (c) { c.diedDuring = true; c.tEnd = t; eps.push(c); cur.delete(p.id); }
        const pv = post.get(p.id);
        if (pv) { pv.ep.noContrib = !pv.contributed; post.delete(p.id); }
        continue;
      }
      aliveT++;
      if (p.retreating) retreatT++;
      else if (d2(p.pos, fountain) < 30) homeIdleT++;

      const c = cur.get(p.id);
      if (p.retreating && !c) {
        //  新撤退開始 ⇒ 先結算上一段的「有沒有重新產生貢獻」
        const pv = post.get(p.id);
        if (pv) {
          pv.ep.noContrib = !pv.contributed;
          pv.ep.repeatWithin15 = (t - pv.tReturn) < 15;
          post.delete(p.id);
        }
        cur.set(p.id, { seed, side: testSide, id: p.id, tStart: t, reachedFountain: false, diedDuring: false });
      } else if (p.retreating && c) {
        if (d2(p.pos, fountain) < 12) c.reachedFountain = true;
      } else if (!p.retreating && c) {
        c.tEnd = t; c.durSec = t - c.tStart;
        eps.push(c); cur.delete(p.id);
        post.set(p.id, { ep: c, tReturn: t, base: contrib(p), contributed: false });
      }
      const pv = post.get(p.id);
      if (pv) {
        const now = contrib(p);
        if (!pv.contributed && (now.atk > pv.base.atk || now.twr > pv.base.twr + 1e-9 || now.obj > pv.base.obj)) {
          pv.contributed = true;
          pv.ep.returnToAction = t - pv.tReturn;
        }
      }
    }
  }
  for (const [, pv] of post) pv.ep.noContrib = !pv.contributed;
  for (const [, c] of cur) { c.tEnd = e.t; c.durSec = c.tEnd - c.tStart; c.unfinished = true; eps.push(c); }

  const foeTowers = Object.values(e.towers).filter((t) => t.side === foe && t.lane !== "nexus");
  const done = eps.filter((x) => !x.unfinished && !x.diedDuring);
  const sum = (f) => mine.reduce((s, p) => s + (f(p) ?? 0), 0);
  const rta = done.map((x) => x.returnToAction).filter((v) => v != null);
  return {
    seed, side: testSide, value,
    minutes: e.t / 60, decided: e.over, win: e.winner === testSide,
    //  A 競技
    twrDmg: sum((p) => p.twrDmg),
    towersKilled: foeTowers.filter((t) => t.hp <= 0).length,
    nexusDmg: nexus0 != null ? nexus0 - (e.towers[`${foe}_nexus`]?.hp ?? nexus0) : 0,
    objKills,
    deaths: sum((p) => p.d), kills: sum((p) => p.k), assists: sum((p) => p.a),
    fightUptime: aliveT ? 1 - retreatT / aliveT : 0,
    trueActive: aliveT ? 1 - (retreatT + homeIdleT) / aliveT : 0,
    towerPushes: e.exec?.[testSide]?.towerPushes ?? 0,   // 保留，但**只當 presence 診斷**
    //  B 行為
    retreats: eps.length,
    reachedFountainPct: done.length ? done.filter((x) => x.reachedFountain).length / done.length * 100 : null,
    returnToActionSec: rta.length ? rta.reduce((s, x) => s + x, 0) / rta.length : null,
    noContribPct: done.length ? done.filter((x) => x.noContrib).length / done.length * 100 : null,
    repeat15Pct: done.length ? done.filter((x) => x.repeatWithin15).length / done.length * 100 : null,
  };
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const varS = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
function paired(A, B, f) {
  const key = (r) => `${r.seed}|${r.side}`;
  const m = new Map(A.map((r) => [key(r), r]));
  const d = [];
  for (const rb of B) { const ra = m.get(key(rb)); if (ra) { const x = f(rb), y = f(ra); if (x != null && y != null) d.push(x - y); } }
  if (d.length < 3) return null;
  const mu = mean(d), se = Math.sqrt(varS(d) / d.length);
  return { n: d.length, d: mu, lo: mu - 1.96 * se, hi: mu + 1.96 * se, sig: Math.abs(mu) > 1.96 * se };
}

const A_FIELDS = [
  ["twrDmg", "★推塔傷害（真實推進）", (r) => r.twrDmg],
  ["towersKilled", "推掉的塔", (r) => r.towersKilled],
  ["nexusDmg", "主堡傷害", (r) => r.nexusDmg],
  ["objKills", "目標擊殺", (r) => r.objKills],
  ["deaths", "死亡", (r) => r.deaths],
  ["kills", "擊殺", (r) => r.kills],
  ["assists", "助攻", (r) => r.assists],
  ["fightUptime", "作戰持續率", (r) => r.fightUptime],
  ["trueActive", "真實在場率", (r) => r.trueActive],
  ["minutes", "場長(分)", (r) => r.minutes],
  ["towerPushes", "（診斷）塔邊責任週期", (r) => r.towerPushes],
];
const B_FIELDS = [
  ["retreats", "撤退段落數", (r) => r.retreats],
  ["reachedFountainPct", "撤到泉水%", (r) => r.reachedFountainPct],
  ["returnToActionSec", "重新產生貢獻(秒)", (r) => r.returnToActionSec],
  ["noContribPct", "撤退後零貢獻%", (r) => r.noContribPct],
  ["repeat15Pct", "15秒內再撤%", (r) => r.repeat15Pct],
];

console.log(`# 真實推進 KPI｜${SEEDS.length} seeds × 藍紅鏡像 = 每格 ${SEEDS.length * 2} 場｜情境 standard`);
console.log(`# ⚠ towerPushes 已降級為 presence 診斷指標，不作推進強度證據\n`);

//  中性基準只算一次
const baseRows = [];
for (const seed of SEEDS) for (const side of ["blue", "red"]) baseRows.push(run(seed, STATS[0], 70, side));

const out = [];
const rawRows = baseRows.map((r) => ({ stat: "__baseline__", ...r }));
for (const stat of STATS) {
  const c40 = [], c90 = [];
  for (const seed of SEEDS) for (const side of ["blue", "red"]) c40.push(run(seed, stat, 40, side));
  for (const seed of SEEDS) for (const side of ["blue", "red"]) c90.push(run(seed, stat, 90, side));
  rawRows.push(...c40.map((r) => ({ stat, ...r })), ...c90.map((r) => ({ stat, ...r })));

  const rec = { stat };
  const show = (title, fields) => {
    console.log(`  ${title}`);
    console.log(`  ${"指標".padEnd(24)}${"40".padStart(11)}${"70".padStart(11)}${"90".padStart(11)}${"配對Δ".padStart(12)}${"95% CI".padStart(26)}  顯著   相對`);
    for (const [key, label, f] of fields) {
      const p = paired(c40, c90, f);
      if (!p) continue;
      const m40 = mean(c40.map(f).filter((v) => v != null));
      const m70 = mean(baseRows.map(f).filter((v) => v != null));
      const m90 = mean(c90.map(f).filter((v) => v != null));
      const rel = m40 ? (p.d / Math.abs(m40)) * 100 : NaN;
      rec[key] = { m40, m70, m90, d: p.d, lo: p.lo, hi: p.hi, sig: p.sig, rel };
      console.log("  " + label.padEnd(24) + m40.toFixed(2).padStart(11) + m70.toFixed(2).padStart(11) + m90.toFixed(2).padStart(11) +
        p.d.toFixed(2).padStart(12) + `[${p.lo.toFixed(2)}, ${p.hi.toFixed(2)}]`.padStart(26) +
        (p.sig ? "  ★  " : "  ·  ") + (Number.isFinite(rel) ? `${rel >= 0 ? "+" : ""}${rel.toFixed(1)}%` : "—").padStart(8));
    }
  };
  console.log(`## ${stat}`);
  show("【A 競技影響】", A_FIELDS);
  show("【B 行為品質】", B_FIELDS);
  const wr = (rows) => { const d = rows.filter((r) => r.decided); return d.length ? d.filter((r) => r.win).length / d.length * 100 : null; };
  const n = SEEDS.length * 2, ci = (1.96 * Math.sqrt(0.5 / n) * 100).toFixed(1);
  console.log(`  ${"勝率（次要參考）".padEnd(24)}${wr(c40).toFixed(1).padStart(10)}%${wr(baseRows).toFixed(1).padStart(10)}%${wr(c90).toFixed(1).padStart(10)}%   兩格相減 ±${ci}pp\n`);
  rec.winRate = { m40: wr(c40), m70: wr(baseRows), m90: wr(c90), ci: Number(ci) };
  out.push(rec);
}

const DIR = "review/moba-combat";
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(`${DIR}/${TAG}.json`, JSON.stringify({
  generatedBy: "tools/probe_push_truth.mjs", seeds: SEEDS, scenario: "standard",
  matchesPerCell: SEEDS.length * 2, stats: out,
}, null, 2), "utf8");
fs.writeFileSync(`${DIR}/${TAG}.raw.json`, JSON.stringify({
  generatedBy: "tools/probe_push_truth.mjs", seeds: SEEDS, scenario: "standard", rows: rawRows,
}), "utf8");
console.log(`⇒ ${DIR}/${TAG}.json + ${TAG}.raw.json`);
