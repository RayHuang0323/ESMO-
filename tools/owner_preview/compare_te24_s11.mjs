#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/compare_te24_s11.mjs — v24 Sprint 1.1 three-arm comparison (offline, read-only)
//  Arms: off (= v23), s1 (= original Sprint 1, adaptive.v1), adaptive (= Sprint 1.1, adaptive.v1.1).
//  For each adaptive arm vs off (paired by path|tier|cfg|seed, per side): deaths, tower deaths, own camps, enemy camps,
//  own+enemy camps (S6 quantity), plus S2 (at least one leader arrival per intent side x match) and the execution metrics
//  Owner asked to track: arrival over all starts, 1/2 party mix, partner arrival, steal rate, defend counts,
//  decline reasons, end reasons, re-start interval after an early retreat.
//  --files=<a.json,b.json,...> | --dir=<folder>   [--out=<json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const files = arg("files") ? arg("files").split(",") : fs.readdirSync(arg("dir")).filter((x) => x.endsWith(".json")).sort().map((f) => path.join(arg("dir"), f));
const OUT = arg("out");
const rows = [];
for (const f of files) for (const r of JSON.parse(fs.readFileSync(f, "utf8")).rows ?? []) rows.push(r);
const key = (r) => `${r.path}|${r.tier ?? "-"}|${r.cfg}|${r.seed}`;
const P = new Map();
for (const r of rows) { const k = key(r); if (!P.has(k)) P.set(k, {}); P.get(k)[r.arm] = r; }
const r3 = (x) => Math.round(x * 1000) / 1000;
const ci = (d) => { const n = d.length; if (n < 2) return { mean: n ? r3(d[0]) : null, ci: [null, null], n }; const m = d.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)); const hw = 1.96 * sd / Math.sqrt(n); return { mean: r3(m), ci: [r3(m - hw), r3(m + hw)], n }; };
const inc = (o, k, v = 1) => { o[k] = (o[k] ?? 0) + v; };
const SIDES = ["blue", "red"];

function execOf(arm) {
  const A = { matches: 0, intentSides: 0, sidesWithArrival: 0, starts: 0, arrived: 0, steals: 0, party: { 1: 0, 2: 0 }, partnerEnds: 0, partnerArrived: 0,
    defTriggers: 0, defStarts: 0, defArrived: 0, declined: {}, ends: {}, restartAfterRetreat: [], earlyRetreats: 0 };
  for (const p of P.values()) {
    const r = p[arm]; if (!r || !r.te) continue;
    A.matches++;
    for (const S of SIDES) {
      const O = r.te[S]; if (!O) continue;
      A.defTriggers += O.defend.triggers; A.defStarts += O.defend.starts; A.defArrived += O.defend.arrived;
      if (!O.posture) continue;
      A.intentSides++; if (O.arrived > 0) A.sidesWithArrival++;
      A.starts += O.starts; A.arrived += O.arrived; A.steals += O.steals;
      A.party[1] += O.partySize[1] ?? 0; A.party[2] += O.partySize[2] ?? 0;
      for (const [k, v] of Object.entries(O.declined)) inc(A.declined, k, v);
      for (const [k, v] of Object.entries(O.ends)) inc(A.ends, k, v);
    }
    const lastEarly = { blue: null, red: null };
    for (const e of r.events ?? []) {
      if (e.kind === "partner_end") { A.partnerEnds++; if (e.arrived) A.partnerArrived++; }
      if (e.kind === "invade_end" && /^(retreat_|partner_|hp$|outnumbered$)/.test(e.reason)) { A.earlyRetreats++; lastEarly[e.side] = e.t; }
      if (e.kind === "invade" && e.d === "go" && lastEarly[e.side] != null) { A.restartAfterRetreat.push(e.t - lastEarly[e.side]); lastEarly[e.side] = null; }
    }
  }
  //  S2 拆解（Owner 2026-11-17 第 7 點）：有意圖、但整場沒有任何一次到場的邊×場 ⇒ 沒出發／出發了都在途中中止（依原因）／到了目標卻失敗
  const s2 = { noArrival: 0, noStart: 0, abortedEnRoute: 0, targetFailed: 0, enRouteReasons: {} };
  for (const p of P.values()) {
    const r = p[arm]; if (!r || !r.te) continue;
    for (const S of SIDES) {
      const O = r.te[S]; if (!O?.posture || O.arrived > 0) continue;
      s2.noArrival++;
      if (O.starts === 0) { s2.noStart++; continue; }
      const ends = (r.events ?? []).filter((e) => e.kind === "invade_end" && e.side === S);
      if (ends.some((e) => e.reason === "lost_race")) s2.targetFailed++;
      else { s2.abortedEnRoute++; for (const e of ends) inc(s2.enRouteReasons, e.reason); }
    }
  }
  A.s2 = s2;
  const rs = A.restartAfterRetreat.slice().sort((a, b) => a - b);
  return { matches: A.matches, S2: { ok: A.sidesWithArrival, n: A.intentSides, rate: r3(A.sidesWithArrival / Math.max(1, A.intentSides)) },
    startsPerSide: r3(A.starts / Math.max(1, A.intentSides)), arrivalOverStarts: r3(A.arrived / Math.max(1, A.starts)), stealRate: r3(A.steals / Math.max(1, A.starts)),
    party: { solo: A.party[1], duo: A.party[2], duoShare: r3(A.party[2] / Math.max(1, A.party[1] + A.party[2])) },
    partnerArrival: A.partnerEnds ? r3(A.partnerArrived / A.partnerEnds) : null,
    defend: { triggersPerSide: r3(A.defTriggers / Math.max(1, 2 * A.matches)), startsPerSide: r3(A.defStarts / Math.max(1, 2 * A.matches)), arrivedPerSide: r3(A.defArrived / Math.max(1, 2 * A.matches)) },
    declined: Object.fromEntries(Object.entries(A.declined).sort((a, b) => b[1] - a[1])), ends: Object.fromEntries(Object.entries(A.ends).sort((a, b) => b[1] - a[1])),
    s2NoArrival: A.s2, earlyRetreats: A.earlyRetreats, restartAfterRetreatSec: rs.length ? { n: rs.length, min: rs[0], p50: rs[Math.floor(rs.length / 2)] } : null };
}
function vsOff(arm) {
  const d = { deaths: [], towerDeaths: [], ownCamp: [], enemyCamp: [], camps: [], duration: [], gold: [] };
  const lvl = { off: { deaths: 0, ownCamp: 0, enemyCamp: 0, n: 0 }, arm: { deaths: 0, ownCamp: 0, enemyCamp: 0, n: 0 } };
  for (const p of P.values()) {
    if (!p.off || !p[arm]) continue;
    d.duration.push((p[arm].duration - p.off.duration) / 60);
    for (const S of SIDES) {
      const a = p[arm].stats[S], o = p.off.stats[S];
      d.deaths.push(a.deaths - o.deaths); d.towerDeaths.push(a.towerDeaths - o.towerDeaths);
      d.ownCamp.push(a.ownCampKills - o.ownCampKills); d.enemyCamp.push(a.enemyCampKills - o.enemyCampKills);
      d.camps.push(a.ownCampKills + a.enemyCampKills - o.ownCampKills - o.enemyCampKills);
      d.gold.push(p[arm].goldEnd[S] - p.off.goldEnd[S]);
      lvl.off.deaths += o.deaths; lvl.off.ownCamp += o.ownCampKills; lvl.off.enemyCamp += o.enemyCampKills; lvl.off.n++;
      lvl.arm.deaths += a.deaths; lvl.arm.ownCamp += a.ownCampKills; lvl.arm.enemyCamp += a.enemyCampKills; lvl.arm.n++;
    }
  }
  const L = (o) => ({ deaths: r3(o.deaths / Math.max(1, o.n)), ownCamp: r3(o.ownCamp / Math.max(1, o.n)), enemyCamp: r3(o.enemyCamp / Math.max(1, o.n)) });
  return { levels: { off: L(lvl.off), [arm]: L(lvl.arm) }, diff: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, ci(v)])) };
}
const arms = [...new Set(rows.map((r) => r.arm))].filter((a) => a !== "off");
const out = { files: files.map((f) => path.basename(f)), pairs: [...P.values()].filter((p) => p.off).length, arms: {} };
for (const a of arms) out.arms[a] = { exec: execOf(a), vsOff: vsOff(a) };
for (const a of arms) {
  const X = out.arms[a], V = X.vsOff.diff;
  console.log(`== ${a}  S2 ${X.exec.S2.ok}/${X.exec.S2.n}=${X.exec.S2.rate}  starts/side ${X.exec.startsPerSide}  arrival/starts ${X.exec.arrivalOverStarts}  steal ${X.exec.stealRate}  duo ${X.exec.party.duoShare} (${X.exec.party.solo}/${X.exec.party.duo})  partnerArr ${X.exec.partnerArrival}`);
  console.log(`   deaths Δ${V.deaths.mean} [${V.deaths.ci}]  towerDeaths Δ${V.towerDeaths.mean} [${V.towerDeaths.ci}]  camps Δ${V.camps.mean} [${V.camps.ci}] (own Δ${V.ownCamp.mean}, enemy Δ${V.enemyCamp.mean})  dur Δ${V.duration.mean}min  gold Δ${V.gold.mean}`);
  console.log(`   ends ${JSON.stringify(X.exec.ends)}`);
  console.log(`   declined ${JSON.stringify(X.exec.declined)}`);
  console.log(`   defend ${JSON.stringify(X.exec.defend)}  earlyRetreats ${X.exec.earlyRetreats}  restart ${JSON.stringify(X.exec.restartAfterRetreatSec)}`);
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
