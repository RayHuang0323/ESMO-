#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s15_e7.mjs — Sprint 2 Preflight B：E7 紅藍公平的唯讀診斷（2026-11-20）
//
//  只讀兩輪已完成的終局壓力資料（130001 起、140001 起；v1.2／v1.3 同 Seed 配對），不跑任何對局、不產生 PASS／FAIL。
//  三件事分開報：
//   ① 版本改動的因果效果：同 Seed 的 v1.2 → v1.3 勝方轉移（只看兩臂都打完的組；沒打完的另列）
//   ② 絕對勝率：依配置、物件佈局（objectiveLayoutForSeed，與引擎同一個函式）分層；AB／BA 同 Seed 換邊配對拆成「邊」與「模板」
//   ③ 時序：護線開啟、兵線第一次抵達主堡，紅藍誰先；勝方是不是先抵達的那一邊
//  用法：node tools/owner_preview/diag_te24_s15_e7.mjs --rounds=<130001 stress 資料夾>,<140001 stress 資料夾> --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { objectiveLayoutForSeed } from "../../src/platform/contracts/objectiveLayout.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROUNDS = arg("rounds", "").split(",").filter(Boolean), OUT = arg("out");
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
function wilson(k, n, z = 1.959963984540054) {
  if (!n) return [null, null];
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}
const rate = (k, n) => ({ k, n, rate: r3(k / n), ci95: wilson(k, n).map(r3) });

const pairs = [];
for (const [ri, dir] of ROUNDS.entries()) {
  for (const cfg of ["inv", "AB", "BA"]) {
    const a = jsonl(path.join(dir, `tool_${cfg}_s12.jsonl`)), b = jsonl(path.join(dir, `tool_${cfg}_s13.jsonl`));
    const m12 = new Map(a.map((r) => [r.seed, r]));
    for (const s13 of b) {
      const s12 = m12.get(s13.seed);
      if (!s12 || !s13.injected || !s12.injected) continue;
      pairs.push({ round: ri, cfg, seed: s13.seed, layout: objectiveLayoutForSeed(s13.seed), s12, s13 });
    }
  }
}
const J = { note: "read-only; the effective-pair rule is the one the registered judge used (both arms injected)", rounds: ROUNDS, pairs: pairs.length };

// ① 版本改動：同 Seed 勝方轉移
const trans = (l) => {
  const T = { bb: 0, br: 0, rb: 0, rr: 0, v12Unfinished_v13Blue: 0, v12Unfinished_v13Red: 0, v13Unfinished: 0 };
  for (const p of l) {
    if (!p.s13.over) { T.v13Unfinished++; continue; }
    const w13 = p.s13.winner === "blue" ? "b" : "r";
    if (!p.s12.over) { T[w13 === "b" ? "v12Unfinished_v13Blue" : "v12Unfinished_v13Red"]++; continue; }
    T[(p.s12.winner === "blue" ? "b" : "r") + w13]++;
  }
  const both = T.bb + T.br + T.rb + T.rr;
  //  McNemar（只看兩臂都打完、勝方改變的組）：藍→紅 vs 紅→藍
  const disc = T.br + T.rb, z = disc ? (T.rb - T.br) / Math.sqrt(disc) : 0;
  return { ...T, bothFinished: both, v12Blue: rate(T.bb + T.br, both), v13BlueSamePairs: rate(T.bb + T.rb, both), flipsToBlue: T.rb, flipsToRed: T.br, mcnemarZ: r3(z) };
};
J.version = { all: trans(pairs), ...Object.fromEntries(["inv", "AB", "BA"].map((c) => [c, trans(pairs.filter((p) => p.cfg === c))])), byRound: ROUNDS.map((_, i) => trans(pairs.filter((p) => p.round === i))) };

// ② 絕對勝率（v1.3 打完的組；E7 的母體）
const fin13 = pairs.filter((p) => p.s13.over);
const blueRate = (l) => rate(l.filter((p) => p.s13.winner === "blue").length, l.length);
J.absolute = {
  e7Population: blueRate(fin13),
  byCfg: Object.fromEntries(["inv", "AB", "BA"].map((c) => [c, blueRate(fin13.filter((p) => p.cfg === c))])),
  byLayout: Object.fromEntries(["STANDARD", "SWAPPED"].map((L) => [L, blueRate(fin13.filter((p) => p.layout === L))])),
  byCfgLayout: Object.fromEntries(["inv", "AB", "BA"].flatMap((c) => ["STANDARD", "SWAPPED"].map((L) => [`${c}|${L}`, blueRate(fin13.filter((p) => p.cfg === c && p.layout === L))]))),
  byCfgRound: Object.fromEntries(["inv", "AB", "BA"].flatMap((c) => ROUNDS.map((_, i) => [`${c}|round${i}`, blueRate(fin13.filter((p) => p.cfg === c && p.round === i))]))),
  v12FinishedBlue: blueRate(pairs.filter((p) => p.s12.over).map((p) => ({ ...p, s13: p.s12 }))),
};
//  AB／BA 換邊配對：同 Seed、同陣容，模板互換邊。藍勝(AB)＝入侵模板贏；藍勝(BA)＝m7 贏。
//  邊效果＝(P_AB(藍)＋P_BA(藍))／2 − 0.5；模板效果（入侵模板）＝(P_AB(藍) − P_BA(藍))／2
const ab = new Map(fin13.filter((p) => p.cfg === "AB").map((p) => [`${p.round}|${p.seed}`, p]));
const swapPairs = fin13.filter((p) => p.cfg === "BA" && ab.has(`${p.round}|${p.seed}`)).map((p) => ({ AB: ab.get(`${p.round}|${p.seed}`), BA: p }));
const pAB = swapPairs.filter((x) => x.AB.s13.winner === "blue").length / Math.max(1, swapPairs.length), pBA = swapPairs.filter((x) => x.BA.s13.winner === "blue").length / Math.max(1, swapPairs.length);
const sameTeamWins = swapPairs.filter((x) => (x.AB.s13.winner === "blue") === (x.BA.s13.winner === "red")).length;   // 同一個模板兩邊都贏或都輸
J.swap = { pairs: swapPairs.length, blueAB: r3(pAB), blueBA: r3(pBA), sideEffect: r3((pAB + pBA) / 2 - 0.5), invasionTemplateEffect: r3((pAB - pBA) / 2),
  sideWinsBoth: swapPairs.filter((x) => x.AB.s13.winner === "blue" && x.BA.s13.winner === "blue").length, sideLosesBoth: swapPairs.filter((x) => x.AB.s13.winner === "red" && x.BA.s13.winner === "red").length, templateConsistent: sameTeamWins };

// ③ 時序：護線開啟與兵線抵達
const timing = (l) => {
  const o = { n: l.length, escortBoth: 0, escortSameTick: 0, escortBlueFirst: 0, escortRedFirst: 0, escortOnlyBlue: 0, escortOnlyRed: 0, escortNone: 0,
    waveBlueFirst: 0, waveRedFirst: 0, waveSameTick: 0, waveNone: 0, winnerIsFirstWave: 0, winnerNotFirstWave: 0, blueWinsBlueFirst: 0, blueFirst: 0, redWinsRedFirst: 0, redFirst: 0 };
  for (const p of l) {
    const e = p.s13.escortOn ?? {}, w = p.s13.firstWaveAt ?? {};
    if (e.blue != null && e.red != null) { o.escortBoth++; if (e.blue === e.red) o.escortSameTick++; else if (e.blue < e.red) o.escortBlueFirst++; else o.escortRedFirst++; }
    else if (e.blue != null) o.escortOnlyBlue++; else if (e.red != null) o.escortOnlyRed++; else o.escortNone++;
    const wb = w.blue ?? Infinity, wr = w.red ?? Infinity;
    let first = null;
    if (!Number.isFinite(wb) && !Number.isFinite(wr)) o.waveNone++;
    else if (wb === wr) o.waveSameTick++;
    else if (wb < wr) { o.waveBlueFirst++; first = "blue"; } else { o.waveRedFirst++; first = "red"; }
    if (first && p.s13.over) { if (p.s13.winner === first) o.winnerIsFirstWave++; else o.winnerNotFirstWave++; }
    if (first === "blue" && p.s13.over) { o.blueFirst++; if (p.s13.winner === "blue") o.blueWinsBlueFirst++; }
    if (first === "red" && p.s13.over) { o.redFirst++; if (p.s13.winner === "red") o.redWinsRedFirst++; }
  }
  o.firstWaveBlueShare = rate(o.waveBlueFirst, o.waveBlueFirst + o.waveRedFirst);
  o.convertBlue = rate(o.blueWinsBlueFirst, o.blueFirst); o.convertRed = rate(o.redWinsRedFirst, o.redFirst);
  return o;
};
//  firstWaveAt 只有第二輪（140001 起）才記錄 ⇒ 時序只用有這個欄位的列
const withWave = fin13.filter((p) => p.s13.firstWaveAt !== undefined);
J.timing = { note: "firstWaveAt exists only in the 140001 round; escortOn exists in both", rowsWithWave: withWave.length,
  all: timing(withWave), ...Object.fromEntries(["inv", "AB", "BA"].map((c) => [c, timing(withWave.filter((p) => p.cfg === c))])),
  escortByRound: ROUNDS.map((_, i) => timing(fin13.filter((p) => p.round === i))) };
//  護線有沒有開，與勝方的關係（兩輪都有 escortOn）
const esc = (l) => ({ escortOn: blueRate(l.filter((p) => p.s13.escortOn?.blue != null || p.s13.escortOn?.red != null)), escortOff: blueRate(l.filter((p) => p.s13.escortOn?.blue == null && p.s13.escortOn?.red == null)) });
J.escortSplit = { all: esc(fin13), ...Object.fromEntries(["inv", "AB", "BA"].map((c) => [c, esc(fin13.filter((p) => p.cfg === c))])) };
//  注入時刻（決定性；兩臂相同）
J.injectTime = Object.fromEntries([840, 960, 1080, 1200].map((t) => [t, blueRate(fin13.filter((p) => p.s13.tInject === t))]));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(J, null, 1));
const brief = (x) => `${x.k}/${x.n}=${x.rate} ${JSON.stringify(x.ci95)}`;
console.log(`pairs ${J.pairs}`);
console.log(`version: v1.2 blue ${brief(J.version.all.v12Blue)} -> v1.3 ${brief(J.version.all.v13BlueSamePairs)}; flips toBlue ${J.version.all.flipsToBlue} toRed ${J.version.all.flipsToRed} z=${J.version.all.mcnemarZ}`);
for (const c of ["inv", "AB", "BA"]) console.log(`  ${c}: v1.2 ${brief(J.version[c].v12Blue)} -> v1.3 ${brief(J.version[c].v13BlueSamePairs)} flips +${J.version[c].flipsToBlue}/-${J.version[c].flipsToRed} z=${J.version[c].mcnemarZ}`);
console.log(`E7 population ${brief(J.absolute.e7Population)}; layout STANDARD ${brief(J.absolute.byLayout.STANDARD)} SWAPPED ${brief(J.absolute.byLayout.SWAPPED)}`);
console.log(`swap pairs ${J.swap.pairs}: side ${J.swap.sideEffect} template ${J.swap.invasionTemplateEffect}`);
console.log(`escort on ${brief(J.escortSplit.all.escortOn)} off ${brief(J.escortSplit.all.escortOff)}`);
console.log(`timing(140001 round): firstWave blue share ${brief(J.timing.all.firstWaveBlueShare)}; winner=firstWave ${J.timing.all.winnerIsFirstWave}/${J.timing.all.winnerIsFirstWave + J.timing.all.winnerNotFirstWave}; escort same tick ${J.timing.all.escortSameTick}/${J.timing.all.escortBoth}`);
