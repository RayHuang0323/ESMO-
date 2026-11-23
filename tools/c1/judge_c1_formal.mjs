#!/usr/bin/env node
// ============================================================================
//  tools/c1/judge_c1_formal.mjs — judge the C1 formal run exactly as registered (review/tactic-book-3a/deterministic-math-c1/C1_事前登記.md §2).
//
//  X1: every det item — Node per-tick whole-state digests = Chrome per-tick digests, same tick count, winner, end time, final digest.
//  X2: all plan items have a det raw file and both sides ended (over) or reached the 3000 s cap.
//  Report only: native control (balanceTool.v24) divergence count and first divergent tick; det vs native Node outcome (ticks/winner/endT).
//  Usage: node tools/c1/judge_c1_formal.mjs --plan=<plan json> --data=<run dir> [--out=<json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const plan = JSON.parse(fs.readFileSync(arg("plan"), "utf8")), DATA = arg("data");
const load = (k, id) => { const f = path.join(DATA, k, `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
const det = plan.items.map((it) => load("det", it.id)), nat = plan.items.map((it) => load("native", it.id));
const ended = (s) => s && (s.over || s.endT >= 3000);
const recheck = (r) => { if (!r) return null; let first = -1; const n = Math.max(r.node.perTick.length, r.chrome.perTick.length);
  for (let k = 0; k < n; k++) if (r.node.perTick[k] !== r.chrome.perTick[k]) { first = k; break; }
  return first === -1 && r.node.ticks === r.chrome.ticks && r.node.winner === r.chrome.winner && r.node.endT === r.chrome.endT && r.node.final === r.chrome.final ? -1 : (first === -1 ? Infinity : first); };
const detFirst = det.map(recheck);
const X1 = { identical: detFirst.filter((f) => f === -1).length, of: plan.items.length, mismatches: plan.items.filter((_, i) => det[i] && detFirst[i] !== -1).map((it, i) => ({ id: it.id, firstDifferentTick: detFirst[i] })),
  ticksCompared: det.reduce((s, r) => s + (r ? r.node.perTick.length : 0), 0) };
const X2 = { detFiles: det.filter(Boolean).length, nativeFiles: nat.filter(Boolean).length, bothEnded: det.filter((r) => r && ended(r.node) && ended(r.chrome)).length };
const natFirst = nat.map(recheck);
const control = { files: nat.filter(Boolean).length, diverged: natFirst.filter((f) => f !== null && f !== -1).length,
  outcomeDiffers: nat.filter((r) => r && (r.node.winner !== r.chrome.winner || r.node.endT !== r.chrome.endT)).length,
  winnerDiffers: nat.filter((r) => r && r.node.winner !== r.chrome.winner).length,
  firstDivergentTick: (() => { const v = natFirst.filter((f) => f !== null && f !== -1 && Number.isFinite(f)).sort((a, b) => a - b); return v.length ? { min: v[0], median: v[Math.floor(v.length / 2)], max: v[v.length - 1] } : null; })() };
const detVsNativeNode = { comparable: 0, sameOutcome: 0, sameWinner: 0 };
plan.items.forEach((_, i) => { if (!det[i] || !nat[i]) return; detVsNativeNode.comparable++; const a = det[i].node, b = nat[i].node;
  if (a.ticks === b.ticks && a.winner === b.winner && a.endT === b.endT) detVsNativeNode.sameOutcome++; if (a.winner === b.winner) detVsNativeNode.sameWinner++; });
const env = det.find(Boolean)?.env ?? null, ua = det.find(Boolean)?.chromeUa ?? null;
const out = { planId: plan.planId, env, chrome: ua,
  verdict: { X1: X1.identical === plan.items.length ? "PASS" : "FAIL", X2: X2.detFiles === plan.items.length && X2.bothEnded === plan.items.length ? "PASS" : "FAIL" },
  X1, X2, control, detVsNativeNode,
  winners: { det: det.reduce((g, r) => (r ? ((g[r.node.winner] = (g[r.node.winner] ?? 0) + 1), g) : g), {}) },
  timing: { nodeMsMean: Math.round(det.filter(Boolean).reduce((s, r) => s + r.nodeMs, 0) / Math.max(1, X2.detFiles)), chromeMsMean: Math.round(det.filter(Boolean).reduce((s, r) => s + r.chromeMs, 0) / Math.max(1, X2.detFiles)) } };
console.log(JSON.stringify(out, null, 1));
if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(out, null, 1));
process.exit(out.verdict.X1 === "PASS" && out.verdict.X2 === "PASS" ? 0 : 1);
