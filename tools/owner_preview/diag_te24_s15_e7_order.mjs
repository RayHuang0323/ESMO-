#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s15_e7_order.mjs — Sprint 2 Preflight B：終局的英雄處理順序測試（決定性；2026-11-20）
//
//  問題：終局護線讓兩邊的兵線常在同一段時間壓主堡；引擎逐英雄依陣列順序（藍先）處理，這個順序會不會讓藍方先拆掉主堡？
//  做法：已用過的壓力 Seeds（140001 起，本輪兩臂都有注入的 inv 組）上，v1.3 原樣一次、注入當下把英雄陣列反轉（紅先；同一批物件，
//  只換擺放順序，與 runtime29 §29 同一種做法）一次，其餘注入規則與 closure_stress_v24 相同。不是驗證，不產生 PASS／FAIL。
//  原樣那一臂的結果必須與已記錄的壓力列逐值相同（勝方、結束時間），否則整份不採用。
//  用法：node tools/owner_preview/diag_te24_s15_e7_order.mjs --stress=<140001 stress 資料夾> --cfg=inv --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const P = await import(pathToFileURL(path.join(ROOT, "tools/owner_preview/pin_v20_v23_stream.mjs")).href);
const STRESS = arg("stress"), CFG = arg("cfg", "inv"), OUT = arg("out"), INJECT = [840, 960, 1080, 1200], CAP = 3000;
const T = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
const jsonl = (f) => fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const s12 = new Map(jsonl(path.join(STRESS, `tool_${CFG}_s12.jsonl`)).map((r) => [r.seed, r]));
const refs = jsonl(path.join(STRESS, `tool_${CFG}_s13.jsonl`)).filter((r) => r.injected && s12.get(r.seed)?.injected);
function run(seed, reverse) {
  const tInject = INJECT[Math.floor((seed - 1) / 2) % INJECT.length], e = P.build("balanceTool.v24", T[CFG][0], T[CFG][1], seed, null);
  while (!e.over && e.t < tInject) e.tick(0.5);
  if (e.over) return { injected: false, over: true, winner: e.winner, end: e.t };
  for (const t of Object.values(e.towers)) if (t.lane !== "nexus") t.hp = 0;
  //  注入當下才反轉 ⇒ 注入前兩臂逐 tick 相同，差別只在終局階段的處理順序
  if (reverse) e.players.reverse();
  const first = { blue: null, red: null }, atBase = e._minionAtBase.bind(e);
  e._minionAtBase = (a, tw, l, m) => { const r = atBase(a, tw, l, m); if (r && tw?.lane === "nexus") first[a] ??= e.t; return r; };
  while (!e.over && e.t < CAP) e.tick(0.5);
  return { injected: true, over: e.over, winner: e.winner, end: e.t, firstWaveAt: first, nexusHp: { blue: e.towers.blue_nexus.hp, red: e.towers.red_nexus.hp } };
}
const rows = [];
for (const ref of refs) {
  const a = run(ref.seed, false), b = run(ref.seed, true);
  rows.push({ seed: ref.seed, refSame: a.over === ref.over && a.winner === ref.winner && a.end === ref.end, a, b });
  console.log(`${CFG} ${ref.seed} normal ${a.winner}@${a.end} reversed ${b.winner}@${b.end} ref ${ref.winner}@${ref.end}`);
}
const both = rows.filter((r) => r.a.injected && r.b.injected && r.a.over && r.b.over);
const bb = both.filter((r) => r.a.winner === "blue" && r.b.winner === "blue").length, br = both.filter((r) => r.a.winner === "blue" && r.b.winner === "red").length;
const rb = both.filter((r) => r.a.winner === "red" && r.b.winner === "blue").length, rr = both.filter((r) => r.a.winner === "red" && r.b.winner === "red").length;
const firstBlue = (x) => (x.firstWaveAt?.blue ?? Infinity) < (x.firstWaveAt?.red ?? Infinity);
const S = { cfg: CFG, seeds: rows.length, normalMatchesRecorded: rows.filter((r) => r.refSame).length, bothInjectedFinished: both.length,
  blueWins: { normal: bb + br, reversed: bb + rb }, transitions: { bb, br, rb, rr }, mcnemarZ: br + rb ? Math.round(((rb - br) / Math.sqrt(br + rb)) * 1000) / 1000 : 0,
  firstWaveBlue: { normal: both.filter((r) => firstBlue(r.a)).length, reversed: both.filter((r) => firstBlue(r.b)).length },
  reversedNotInjected: rows.filter((r) => !r.b.injected).length };
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary: S, rows }, null, 1));
console.log(JSON.stringify(S, null, 1));
