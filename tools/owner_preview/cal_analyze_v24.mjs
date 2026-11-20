#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/cal_analyze_v24.mjs — v24 Calibration Sprint：已用過 Seeds 上的離線校準分析（只讀 diag_te24_cal_invade 的輸出；2026-11-20）
//
//  ① 存活信念：決策當下每座「相信活著」的敵方營，到場時（現在＋直線到場秒數）是否真的活著（離線標籤），依合法特徵分組：
//     情報種類（seen／memory 看過活著／memory 重生推定／prior 從沒看過）、記憶秒數、我方清營速度比 ρ（λ ÷ λmax）、敵方打野最後位置離營地的距離與秒數
//  ② 成功率：每次出發依目標類型 × 情況 × 人數，到營地、60 秒內搶到、45 秒內帶隊者陣亡；另外依「到場時真的活著」分開
//  ③ 清營速度：我方 λ（合法）與對方實際清營速度（離線）的關係 ⇒ 「對手和我們一樣會刷野」這個假設成不成立
//  用法：node tools/owner_preview/cal_analyze_v24.mjs --dir=<資料夾> --cells=a,b,c --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out"), CELLS = arg("cells", "").split(",").filter(Boolean);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const LMAX = 3 / 90;   // 我方 3 座營、重生 90 秒的理論上限（座／秒）
const aliveAt = (tl, t) => { let a = 0; for (const [tt, s] of tl) { if (tt > t) break; a = s; } return a === 1; };
const bucket = (x, edges, labels) => { if (x == null || !Number.isFinite(x)) return "na"; for (let i = 0; i < edges.length; i++) if (x < edges[i]) return labels[i]; return labels.at(-1); };
const add = (o, k, hit) => { const a = (o[k] ??= [0, 0]); a[1]++; if (hit) a[0]++; };
const view = (o) => Object.fromEntries(Object.entries(o).sort().map(([k, [a, n]]) => [k, { n, rate: r3(a / n) }]));
const out = {};
for (const cell of CELLS) {
  const f = path.join(DIR, `${cell}.jsonl`);
  if (!fs.existsSync(f)) continue;
  const B = { byIntel: {}, byIntelRho: {}, byMemAge: {}, byRespawnAge: {}, byPriorT: {}, byEj: {}, byEjRho: {} }, Sx = { byTypeCond: {}, byTypeCondN: {} }, FARM = [];
  const succ = { all: [], aliveAtArrival: [] };
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line) continue;
    const r = JSON.parse(line);
    for (const S of ["blue", "red"]) {
      const foe = S === "blue" ? "red" : "blue";
      if (r.obs?.[S]?.posture) FARM.push({ lam: r.stats[S].ownCampKills / Math.max(1, r.duration - 30), foeLam: r.stats[foe].ownCampKills / Math.max(1, r.duration - 30) });
      for (const v of r.evals?.[S] ?? []) {
        if (!v.camps || v.lam == null) continue;
        const rho = v.lam / LMAX, rb = bucket(rho, [0.35, 0.5, 0.65], ["rho<.35", "rho<.50", "rho<.65", "rho>=.65"]);
        for (const c of v.camps) {
          if (!c.bAlive) continue;
          const hit = aliveAt(r.truth[c.id] ?? [], v.t + (c.eta ?? 0));
          const kind = c.intel === "memory" ? (c.memAlive ? "memAlive" : "memRespawn") : c.intel;
          add(B.byIntel, `${c.type}|${kind}`, hit);
          add(B.byIntelRho, `${c.type}|${kind}|${rb}`, hit);
          if (kind === "memAlive") add(B.byMemAge, `${c.type}|${bucket(v.t - c.memT, [20, 45, 90, 180], ["<20", "<45", "<90", "<180", ">=180"])}`, hit);
          if (kind === "memRespawn") add(B.byRespawnAge, `${c.type}|${bucket(v.t + (c.eta ?? 0) - c.memRespawnAt, [0, 20, 40, 80], ["<0", "<20", "<40", "<80", ">=80"])}`, hit);
          if (kind === "prior") add(B.byPriorT, `${c.type}|${bucket(v.t, [150, 300, 600, 900], ["<150", "<300", "<600", "<900", ">=900"])}`, hit);
          const ejAge = c.ejLastT == null ? null : v.t - c.ejLastT;
          const ejk = c.ejDead ? "ejDead" : ejAge == null ? "ejNever" : ejAge > 30 ? "ejOld" : c.ejLastD < 25 ? "ejNear<25" : c.ejLastD < 60 ? "ejMid<60" : "ejFar";
          add(B.byEj, `${c.type}|${kind === "seen" ? "seen" : "unseen"}|${ejk}`, hit);
          if (kind !== "seen") add(B.byEjRho, `${c.type}|${ejk}|${rb}`, hit);
        }
      }
    }
    for (const s of r.starts ?? []) {
      const alive = s.eta != null ? aliveAt(r.truth[s.target] ?? [], s.t + s.eta) : null;
      const rec = { type: s.type, cond: s.cond, n: s.n, arrived: s.arrived, captured: s.captured, died: s.leaderDied, alive, end: s.endReason };
      succ.all.push(rec); if (alive) succ.aliveAtArrival.push(rec);
    }
  }
  const agg = (l, key) => { const o = {}; for (const s of l) { const k = key(s); const a = (o[k] ??= { n: 0, arrived: 0, captured: 0, died: 0 }); a.n++; if (s.arrived) a.arrived++; if (s.captured) a.captured++; if (s.died) a.died++; } return Object.fromEntries(Object.entries(o).sort().map(([k, a]) => [k, { n: a.n, arrived: r3(a.arrived / a.n), captured: r3(a.captured / a.n), died: r3(a.died / a.n) }])); };
  const ends = {}; for (const s of succ.all) ends[s.end] = (ends[s.end] ?? 0) + 1;
  out[cell] = { belief: Object.fromEntries(Object.entries(B).map(([k, v]) => [k, view(v)])),
    success: { starts: succ.all.length, aliveAtArrival: r3(succ.aliveAtArrival.length / Math.max(1, succ.all.length)), ends,
      all: agg(succ.all, (s) => `${s.type}|${s.cond}|n${s.n}`), givenAlive: agg(succ.aliveAtArrival, (s) => `${s.type}|${s.cond}|n${s.n}`), givenAliveByType: agg(succ.aliveAtArrival, (s) => s.type), allByType: agg(succ.all, (s) => s.type) },
    farm: { sides: FARM.length, ownClearsPerMin: r3((60 * FARM.reduce((a, x) => a + x.lam, 0)) / Math.max(1, FARM.length)), foeClearsPerMin: r3((60 * FARM.reduce((a, x) => a + x.foeLam, 0)) / Math.max(1, FARM.length)), ownRho: r3(FARM.reduce((a, x) => a + x.lam, 0) / Math.max(1, FARM.length) / LMAX), foeRho: r3(FARM.reduce((a, x) => a + x.foeLam, 0) / Math.max(1, FARM.length) / LMAX) } };
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
