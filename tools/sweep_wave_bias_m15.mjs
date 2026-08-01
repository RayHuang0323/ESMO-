#!/usr/bin/env node
// ============================================================================
//  tools/sweep_wave_bias_m15.mjs — M1.5：waveFrontBias 候選值 30 seeds 掃描
//
//  ⚠ 全部**實測**：每個候選值跑同一組 30 seeds 的完整對局，量真實結果。
//     選值不看 regress 綠不綠，看下面這些分布。
//     baseline = 不設 waveFrontBias（= M1.5 修正前的兵線行為）。
// ============================================================================
import { LogicEngine } from "../src/LogicEngine.js";
import { SIM_RULES } from "../src/battle/moba/matchProgression.js";
import { dist } from "../src/gameData.js";

const SEEDS = Array.from({ length: 30 }, (_, i) => [1, 2, 3, 7, 11, 42, 88, 99, 123, 256,
  271, 314, 777, 999, 1000, 1618, 2024, 4242, 5555, 8080, 9999, 31, 57, 63, 101,
  202, 303, 404, 505, 606][i]);
const CANDIDATES = [null, 0.018, 0.022, 0.026, 0.030];
const MAX_TICKS = 6000;

const pct = (n, d) => (d ? (n / d) * 100 : 0);
const f = (x, n = 1) => Number(x.toFixed(n));
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function runOne(seed, bias) {
  //  只改這一個常數；其餘規則集完全不動（改完立刻還原，避免污染同 process 的後續跑）
  const prev = SIM_RULES.v3.waveFrontBias;
  if (bias == null) delete SIM_RULES.v3.waveFrontBias; else SIM_RULES.v3.waveFrontBias = bias;

  const e = new LogicEngine(seed);
  let guardFirstHit = null, nexusFirstHit = null, noWaveAttacks = 0;
  const guardHp = {}, nexusHp = {};
  for (const s of ["blue", "red"]) {
    for (const i of [0, 1]) guardHp[`${s}_nexus_${i}`] = e.towers[`${s}_nexus_${i}`].hp;
    nexusHp[s] = e.towers[`${s}_nexus`].hp;
  }
  let highGroundGone = null, waveEnteredBase = false;

  for (let i = 0; i < MAX_TICKS && !e.over; i++) {
    e.tick(0.5);
    for (const s of ["blue", "red"]) {
      const foe = s === "blue" ? "red" : "blue";
      for (const gi of [0, 1]) {
        const k = `${s}_nexus_${gi}`; const tw = e.towers[k];
        if (tw.hp < guardHp[k] - 1e-9) {
          if (guardFirstHit == null) guardFirstHit = e.t;
          //  受擊當下是否存在合法兵線（_hasWaveAtStructure 的兵線條件）
          if (!e._hasWaveAtStructure(foe, tw)) noWaveAttacks++;
          guardHp[k] = tw.hp;
        }
      }
      const nx = e.towers[`${s}_nexus`];
      if (nx.hp < nexusHp[s] - 1e-9) {
        if (nexusFirstHit == null) nexusFirstHit = e.t;
        if (!e._hasWaveAtStructure(foe, nx)) noWaveAttacks++;
        nexusHp[s] = nx.hp;
      }
    }
    //  高地塔（tier 2）全倒的時間點，以及之後兵線有沒有真的進到門牙塔 13 單位內
    if (highGroundGone == null) {
      const gone = ["blue", "red"].some((s) =>
        ["top", "mid", "bot"].every((ln) => e.towers[`${s}_${ln}_2`].hp <= 0));
      if (gone) highGroundGone = e.t;
    } else if (!waveEnteredBase) {
      for (const s of ["blue", "red"]) {
        const foe = s === "blue" ? "red" : "blue";
        const g = [0, 1].map((i) => e.towers[`${s}_nexus_${i}`]).find((t) => t.hp > 0);
        if (g && e._hasWaveAtStructure(foe, g)) waveEnteredBase = true;
      }
    }
  }
  const finalT = { top: 0, mid: 0, bot: 0 };
  for (const ln of ["top", "mid", "bot"]) {
    const all = [...e.lanes[ln].bm, ...e.lanes[ln].rm];
    finalT[ln] = all.length ? mean(all.map((m) => m.t)) : 0.5;
  }
  const towersDown = Object.values(e.towers).filter((t) => t.lane !== "nexus" && t.hp <= 0).length;

  if (prev === undefined) delete SIM_RULES.v3.waveFrontBias; else SIM_RULES.v3.waveFrontBias = prev;
  return {
    over: e.over, min: e.t / 60, winner: e.winner,
    kills: e.players.reduce((s, p) => s + p.k, 0),
    towersDown, finalT,
    guardFirstHit, nexusFirstHit, noWaveAttacks,
    highGroundGone, waveEnteredBase,
  };
}

console.log(`══ waveFrontBias 掃描：${SEEDS.length} seeds × ${CANDIDATES.length} 候選值 ══\n`);
const rows = [];
for (const bias of CANDIDATES) {
  const rs = SEEDS.map((s) => runOne(s, bias));
  const mins = rs.map((r) => r.min);
  //  決定性：每個候選值重跑前 5 個 seed，比對逐值結果
  const det = SEEDS.slice(0, 5).every((s, i) => {
    const a = runOne(s, bias);
    return JSON.stringify(a) === JSON.stringify(rs[i]);
  });
  const hg = rs.filter((r) => r.highGroundGone != null);
  const row = {
    bias: bias == null ? "baseline" : bias,
    done: pct(rs.filter((r) => r.over).length, rs.length),
    unfinished: rs.filter((r) => !r.over).length,
    mean: f(mean(mins)), median: f(quant(mins, 0.5)), p95: f(quant(mins, 0.95)), max: f(Math.max(...mins)),
    inBand: f(pct(mins.filter((m) => m >= 15 && m <= 32).length, mins.length)),
    blueWin: f(pct(rs.filter((r) => r.winner === "blue").length, rs.length)),
    kills: f(mean(rs.map((r) => r.kills))),
    towers: f(mean(rs.map((r) => r.towersDown))),
    waveT: ["top", "mid", "bot"].map((ln) => f(mean(rs.map((r) => r.finalT[ln])), 2)).join("/"),
    baseEntry: hg.length ? f(pct(hg.filter((r) => r.waveEnteredBase).length, hg.length)) : 0,
    guardHit: f(mean(rs.filter((r) => r.guardFirstHit != null).map((r) => r.guardFirstHit / 60))),
    nexusHit: f(mean(rs.filter((r) => r.nexusFirstHit != null).map((r) => r.nexusFirstHit / 60))),
    noWave: rs.reduce((s, r) => s + r.noWaveAttacks, 0),
    det: det ? "100%" : "❌",
  };
  rows.push(row);
  console.log(`bias=${String(row.bias).padEnd(9)} 完成${row.done}% 未結束${row.unfinished} | 平均${row.mean} 中位${row.median} p95 ${row.p95} 最長${row.max} | 15-32分 ${row.inBand}%`);
  console.log(`${" ".repeat(14)}藍勝${row.blueWin}% 擊殺${row.kills} 破塔${row.towers} | 終局waveT ${row.waveT} | 高地倒後兵線進基地 ${row.baseEntry}%`);
  console.log(`${" ".repeat(14)}門牙首擊${row.guardHit}分 主堡首擊${row.nexusHit}分 | 無兵線攻擊 ${row.noWave} | 決定性 ${row.det}\n`);
}
console.log("── 判準：解決卡中線（waveT 不再鎖 0.5、兵線進基地 > 0%）＋ 不滾雪球（平均時長貼近 24、擊殺貼近 32）──");
