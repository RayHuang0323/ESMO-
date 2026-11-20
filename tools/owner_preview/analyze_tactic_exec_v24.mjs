#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/analyze_tactic_exec_v24.mjs — v24 Sprint 1 量測的離線分析（2026-11-15；只讀 JSON）
//  輸入：--dir=<資料夾>（measure_tactic_exec_v24.mjs 的 *.json）  [--out=<json>]
//  配對鍵：(path, tier, cfg, seed)；臂 off／adaptive。每邊每場的量都報兩臂平均與配對差（t 分布 95% 區間）。
//  區塊：
//   A 入侵：評估、出發、到場（帶隊者走到營地旁）、搶到、結束原因、人數、拒絕原因
//   B 回防：觸發、出發、到場、結束原因、拒絕原因
//   C 收益與交戰：自家營、敵方營（搶到）、被搶、野區陣亡；陣亡、被塔擊殺、被拆的塔、金錢、時長、勝方
//   D 威脅校準：每筆有目標的評估，s05 與 s05reach 對 15 秒內實際到場人數的偏差／平均絕對誤差／召回（以人數，非位元）
//   E 8b 結果公平（工具路徑 AB／BA）：每個 Seed 兩臂各自的「藍方勝率」（兩種方向平均）與「藍方金錢差」；差中之差＝adaptive − off
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { summ, excludes0, r3 } from "../lib/shadowDecideV24.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir", null), OUT = arg("out", null);
if (!DIR) { console.error("need --dir"); process.exit(2); }
const rows = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  for (const r of j.rows ?? []) rows.push(r);
}
const SIDES = ["blue", "red"];
const groupOf = (r) => (r.path === "career" ? `career_${r.tier}` : r.cfg);
const GROUPS = [...new Set(rows.map(groupOf))].sort();
const key = (r) => `${r.path}|${r.tier ?? "-"}|${r.cfg}|${r.seed}`;
const pairs = new Map();
for (const r of rows) { const k = key(r); if (!pairs.has(k)) pairs.set(k, {}); pairs.get(k)[r.arm] = r; }
const P = [...pairs.values()].filter((p) => p.off && p.adaptive);
const add = (o, k, v = 1) => { o[k] = (o[k] ?? 0) + v; };

//  每場每邊的量（只在 adaptive 有 te；off 只有結果類的量）
function sideMetrics(r, S) {
  const st = r.stats[S], O = r.te?.[S] ?? null, foe = S === "blue" ? "red" : "blue";
  return {
    invEvals: O?.evals ?? 0, invGo: O?.go ?? 0, invStarts: O?.starts ?? 0, invArrived: O?.arrived ?? 0, invSteals: O?.steals ?? 0,
    defTriggers: O?.defend.triggers ?? 0, defStarts: O?.defend.starts ?? 0, defArrived: O?.defend.arrived ?? 0,
    ownCamp: st.ownCampKills, enemyCamp: st.enemyCampKills, campLost: st.enemyCampLost,
    deaths: st.deaths, towerDeaths: st.towerDeaths, jungleDeaths: st.jungleDeaths, towersLost: r.towersLost[S],
    gold: r.goldEnd[S], goldDiff: r.goldEnd[S] - r.goldEnd[foe], win: r.winner === S ? 1 : 0,
  };
}
const METRICS = ["invStarts", "invArrived", "invSteals", "defTriggers", "defStarts", "defArrived", "ownCamp", "enemyCamp", "campLost", "deaths", "towerDeaths", "jungleDeaths", "towersLost", "gold", "win"];
function compare(ps) {
  const out = { pairs: ps.length };
  for (const m of METRICS) {
    const off = [], ad = [], d = [];
    for (const p of ps) for (const S of SIDES) { const a = sideMetrics(p.off, S)[m], b = sideMetrics(p.adaptive, S)[m]; off.push(a); ad.push(b); d.push(b - a); }
    const s = summ(d);
    out[m] = { off: summ(off).mean, adaptive: summ(ad).mean, diff: { ...s, ciExcludes0: excludes0(s) } };
  }
  out.duration = { off: summ(ps.map((p) => p.off.duration / 60)).mean, adaptive: summ(ps.map((p) => p.adaptive.duration / 60)).mean, diff: summ(ps.map((p) => (p.adaptive.duration - p.off.duration) / 60)) };
  out.winnerChanged = ps.filter((p) => p.off.winner !== p.adaptive.winner).length;
  return out;
}
function invasionDetail(rs) {
  const ends = {}, partner = {}, decl = {}, size = { 1: 0, 2: 0 }, dEnds = {}, dDecl = {}, targets = {};
  let evals = 0, go = 0, starts = 0, arrived = 0, steals = 0, dTrig = 0, dGo = 0, dArr = 0, dDef = 0, matches = 0;
  const posture = {};
  for (const r of rs) {
    if (!r.te) continue; matches++;
    for (const S of SIDES) {
      const O = r.te[S];
      add(posture, String(O.posture));
      evals += O.evals; go += O.go; starts += O.starts; arrived += O.arrived; steals += O.steals;
      for (const [k, v] of Object.entries(O.ends)) add(ends, k, v);
      for (const [k, v] of Object.entries(O.partnerEnds)) add(partner, k, v);
      for (const [k, v] of Object.entries(O.declined)) add(decl, k, v);
      for (const [k, v] of Object.entries(O.targets)) add(targets, k, v);
      size[1] += O.partySize[1]; size[2] += O.partySize[2];
      dTrig += O.defend.triggers; dGo += O.defend.go; dArr += O.defend.arrived; dDef += O.defend.defenders;
      for (const [k, v] of Object.entries(O.defend.ends)) add(dEnds, k, v);
      for (const [k, v] of Object.entries(O.defend.declined)) add(dDecl, k, v);
    }
  }
  const per = (x) => (matches ? r3(x / matches) : null);
  return { matches, sidesByPosture: posture,
    invade: { evalsPerMatch: per(evals), startsPerMatch: per(starts), arrivedShare: starts ? r3(arrived / starts) : null, stealShare: starts ? r3(steals / starts) : null,
      partySize: size, targets, ends, partnerEnds: partner, declined: Object.fromEntries(Object.entries(decl).sort((a, b) => b[1] - a[1])) },
    defend: { triggersPerMatch: per(dTrig), goPerMatch: per(dGo), defendersPerGo: dGo ? r3(dDef / dGo) : null, arrivedShare: dDef ? r3(dArr / dDef) : null, ends: dEnds, declined: dDecl } };
}
function threatBlock(rs) {
  const recs = rs.filter((r) => r.arm === "adaptive").flatMap((r) => r.threat ?? []);
  const blk = (sel) => {
    const xs = recs.filter(sel); const n = xs.length;
    if (!n) return { n: 0 };
    const m = (i) => { let sp = 0, sa = 0, sae = 0, hit = 0, pos = 0; for (const x of xs) { sp += x[i]; sa += x[4]; sae += Math.abs(x[i] - x[4]); if (x[4] > 0) { pos++; if (x[i] >= x[4]) hit++; } } return { meanPred: r3(sp / n), meanActual: r3(sa / n), bias: r3((sp - sa) / n), mae: r3(sae / n), coverWhenArrivals: pos ? r3(hit / pos) : null }; };
    return { n, s05: m(2), s05reach: m(3) };
  };
  return { all: blk(() => true), goOnly: blk((x) => x[5] === 1), declinedOnly: blk((x) => x[5] === 0) };
}
function fairness8b(ps) {
  //  每個 Seed：AB 與 BA 兩場（同陣容換邊）。藍方勝率＝兩場的平均；金錢差＝藍 − 紅 的平均。
  const bySeed = new Map();
  for (const p of ps) { if (p.off.cfg !== "AB" && p.off.cfg !== "BA") continue; if (!bySeed.has(p.off.seed)) bySeed.set(p.off.seed, {}); bySeed.get(p.off.seed)[p.off.cfg] = p; }
  const did = [], didGold = [], offB = [], adB = [];
  for (const v of bySeed.values()) {
    if (!v.AB || !v.BA) continue;
    const bw = (arm) => ((v.AB[arm].winner === "blue" ? 1 : 0) + (v.BA[arm].winner === "blue" ? 1 : 0)) / 2;
    const gd = (arm) => ((v.AB[arm].goldEnd.blue - v.AB[arm].goldEnd.red) + (v.BA[arm].goldEnd.blue - v.BA[arm].goldEnd.red)) / 2;
    offB.push(bw("off")); adB.push(bw("adaptive"));
    did.push(bw("adaptive") - bw("off")); didGold.push(gd("adaptive") - gd("off"));
  }
  const s = summ(did), g = summ(didGold);
  return { seeds: did.length, blueWinOff: summ(offB).mean, blueWinAdaptive: summ(adB).mean, didBlueWin: { ...s, ciExcludes0: excludes0(s) }, didBlueGold: { ...g, ciExcludes0: excludes0(g) } };
}

const result = { tool: "analyze_tactic_exec_v24", dir: DIR, matches: rows.length, pairs: P.length, groups: GROUPS,
  compare: { all: compare(P), byGroup: Object.fromEntries(GROUPS.map((g) => [g, compare(P.filter((p) => groupOf(p.off) === g))])) },
  detail: { all: invasionDetail(rows.filter((r) => r.arm === "adaptive")), byGroup: Object.fromEntries(GROUPS.map((g) => [g, invasionDetail(rows.filter((r) => r.arm === "adaptive" && groupOf(r) === g))])) },
  threat: threatBlock(rows), fairness8b: fairness8b(P) };
const text = JSON.stringify(result);
if (OUT) fs.writeFileSync(OUT, text);
const D = result.detail.all, Cm = result.compare.all, f = (x) => `${x.off == null ? "-" : r3(x.off)}→${x.adaptive == null ? "-" : r3(x.adaptive)} Δ${x.diff.mean} [${x.diff.ci?.[0]},${x.diff.ci?.[1]}]${x.diff.ciExcludes0 ? "*" : ""}`;
process.stderr.write(`pairs=${P.length} groups=${GROUPS.join(",")} postures=${JSON.stringify(D.sidesByPosture)}\n`);
process.stderr.write(`invade: evals/m ${D.invade.evalsPerMatch} starts/m ${D.invade.startsPerMatch} arrived ${D.invade.arrivedShare} steal ${D.invade.stealShare} size ${JSON.stringify(D.invade.partySize)} ends ${JSON.stringify(D.invade.ends)}\n`);
process.stderr.write(`  declined ${JSON.stringify(D.invade.declined)}\n  partnerEnds ${JSON.stringify(D.invade.partnerEnds)}\n`);
process.stderr.write(`defend: trig/m ${D.defend.triggersPerMatch} go/m ${D.defend.goPerMatch} def/go ${D.defend.defendersPerGo} arrived ${D.defend.arrivedShare} ends ${JSON.stringify(D.defend.ends)} declined ${JSON.stringify(D.defend.declined)}\n`);
for (const m of METRICS) process.stderr.write(`  ${m.padEnd(13)} ${f(Cm[m])}\n`);
process.stderr.write(`threat(all) ${JSON.stringify(result.threat.all)}\n8b ${JSON.stringify(result.fairness8b)}\n`);
console.log(text.length > 3000 ? JSON.stringify({ ok: true, out: OUT, bytes: text.length }) : text);
