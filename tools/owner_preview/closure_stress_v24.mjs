#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/closure_stress_v24.mjs — v24 Sprint 1.3 Acceptance Closure 的終局壓力測試（量測工具，不改引擎）
//
//  事前登記：review/tactic-book-3a/v24_sprint1/S14_REGISTRATION.md §3。
//  注入方式、閘門稽核與 stress_endgame_v24.mjs 逐行相同（check_s2_contract_v24 的 T10 用舊資料驗證）；這裡多記陣亡與兵線第一次抵達主堡的時間。
//  【停止規則】每一格沿固定的 Seed 順序往下跑，v1.2、v1.3 兩臂都走到注入時間的 Seed 才算一組有效樣本，湊滿目標組數就停。
//    是否有效只取決於注入前的狀態，與注入後的結果無關。Seed 用完還不夠就照實回報，不再加。
//  單場：--path=tool --cfg=inv|AB|BA 或 --path=career --tier=low|mid|high；--arm=s12|s13；--seeds=<逗號分隔>；--out=<jsonl，附加>
//  批次：--run --dir=<repo 外資料夾>（嚴格單線；每段最多 10 個 Seed 一個子行程；可續跑；dir 裡放 STOP 檔就在下一段之前停止）
//  批次紀錄：batches.jsonl；中斷與續跑紀錄：interruptions.jsonl
// ============================================================================
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SELF = fileURLToPath(import.meta.url), CAP = 3000, INJECT = [840, 960, 1080, 1200];
const odd = (from, n) => Array.from({ length: n }, (_, i) => from + 2 * i);
export const STRESS_CELLS = Object.freeze([
  ...["inv", "AB", "BA"].map((cfg) => ({ name: `tool_${cfg}`, a: ["--path=tool", `--cfg=${cfg}`], seeds: odd(140001, 240), target: 67 })),
  ...["low", "mid", "high"].map((tier) => ({ name: `career_${tier}`, a: ["--path=career", `--tier=${tier}`], seeds: odd(141001, 160), target: 42 })),
]);
/** 依 Seed 順序數有效組數；回傳實際納入的 Seed（湊滿目標就截止）。 */
export function effectivePairs(cell, rows12, rows13) {
  const pairs = [], n = Math.min(rows12.length, rows13.length);
  for (let i = 0; i < n && pairs.length < cell.target; i++) {
    if (rows12[i].seed !== cell.seeds[i] || rows13[i].seed !== cell.seeds[i]) throw new Error(`${cell.name}: seed order mismatch at ${i}`);
    if (rows12[i].injected && rows13[i].injected) pairs.push({ seed: cell.seeds[i], s12: rows12[i], s13: rows13[i] });
  }
  return pairs;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].replace(/\//g, "\\").toLowerCase();
if (isMain && process.argv.includes("--run")) {
  const DIR = arg("dir");
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = () => new Date().toISOString(), note = (file, rec) => fs.appendFileSync(`${DIR}/${file}`, JSON.stringify({ at: stamp(), ...rec }) + "\n");
  const load = (f) => { if (!fs.existsSync(f)) return []; const lines = fs.readFileSync(f, "utf8").split("\n").filter(Boolean), out = []; for (const l of lines) { try { out.push(JSON.parse(l)); } catch { note("interruptions.jsonl", { kind: "partial_line_dropped", file: f, kept: out.length }); fs.writeFileSync(f, out.map((x) => JSON.stringify(x)).join("\n") + (out.length ? "\n" : "")); break; } } return out; };
  const fileOf = (c, arm) => `${DIR}/${c.name}_${arm}.jsonl`;
  const effOf = (c) => effectivePairs(c, load(fileOf(c, "s12")), load(fileOf(c, "s13"))).length;
  const totalTarget = STRESS_CELLS.reduce((s, c) => s + c.target, 0), t0 = Date.now(), first = STRESS_CELLS.reduce((s, c) => s + effOf(c), 0);
  if (first) note("interruptions.jsonl", { kind: "resume", effectivePairsAlreadyDone: first });
  for (const c of STRESS_CELLS) {
    for (;;) {
      const r12 = load(fileOf(c, "s12")), r13 = load(fileOf(c, "s13")), eff = effectivePairs(c, r12, r13).length, base = Math.min(r12.length, r13.length);
      if (eff >= c.target) break;
      if (base >= c.seeds.length) { note("interruptions.jsonl", { kind: "seeds_exhausted", cell: c.name, effective: eff, target: c.target }); console.log(`[seeds exhausted] ${c.name} ${eff}/${c.target}`); break; }
      if (fs.existsSync(`${DIR}/STOP`)) { note("interruptions.jsonl", { kind: "stop_file", cell: c.name, effective: eff }); console.log("[stopped by STOP file]"); process.exit(0); }
      //  每段最多跑「還缺的組數」個 Seed，所以不會超過目標
      const end = Math.min(c.seeds.length, base + Math.min(10, c.target - eff));
      for (const [arm, rows] of [["s12", r12], ["s13", r13]]) {
        const chunk = c.seeds.slice(rows.length, end);
        if (!chunk.length) continue;
        const startedAt = stamp(), r = spawnSync(process.execPath, ["--max-old-space-size=1536", SELF, ...c.a, `--arm=${arm}`, `--seeds=${chunk.join(",")}`, `--out=${fileOf(c, arm)}`], { stdio: ["ignore", "ignore", "inherit"] });
        note("batches.jsonl", { cell: c.name, arm, from: chunk[0], to: chunk.at(-1), n: chunk.length, exit: r.status, startedAt });
        if (r.status !== 0) { note("interruptions.jsonl", { kind: "child_failed", cell: c.name, arm, exit: r.status, signal: r.signal ?? null, from: chunk[0] }); console.log(`[stop] ${c.name} ${arm} exit=${r.status}`); process.exit(1); }
      }
      const done = STRESS_CELLS.reduce((s, x) => s + Math.min(x.target, effOf(x)), 0), el = (Date.now() - t0) / 60000, rate = (done - first) / Math.max(1e-6, el), fill = Math.round(20 * done / totalTarget);
      console.log(`[${"█".repeat(fill)}${"░".repeat(20 - fill)}] 有效 ${done}/${totalTarget} 組 ${c.name} ${effOf(c)}/${c.target} 已花 ${el.toFixed(1)} 分，預估剩 ${rate > 0 ? ((totalTarget - done) / rate).toFixed(0) : "?"} 分`);
    }
  }
  console.log("[all-done]");
  process.exit(0);
}

if (isMain) {
  const P = await import("./pin_v20_v23_stream.mjs");
  const PATH = arg("path", "tool"), CFG = arg("cfg", "inv"), TIER = arg("tier", "mid"), ARM = arg("arm", "s13"), OUT = arg("out"), SEEDS = arg("seeds", "").split(",").filter(Boolean).map(Number);
  const T = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
  const build = (seed) => {
    if (PATH === "career") { const e = P.build("career.v24", "v2.jungle_invasion", null, seed, TIER); if (ARM === "s12") { e._tacExecVariant = "adaptive.v1.2"; e.tacExec.v13 = false; } return e; }
    if (ARM === "s12") process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.2";
    try { return P.build("balanceTool.v24", T[CFG][0], T[CFG][1], seed, null); } finally { delete process.env.ESMO_BALANCE_TACTICEXEC; }
  };
  for (const seed of SEEDS) {
    const tInject = INJECT[Math.floor((seed - 1) / 2) % INJECT.length], e = build(seed), base = { seed, path: PATH, cfg: PATH === "career" ? TIER : CFG, arm: ARM, tInject };
    const was = new Map(), deaths = { blue: 0, red: 0 };
    const countDeaths = () => { for (const p of e.players) { if (p.dead && !was.get(p.id)) deaths[p.side]++; was.set(p.id, !!p.dead); } };
    while (!e.over && e.t < tInject) { e.tick(0.5); countDeaths(); }
    if (e.over) { fs.appendFileSync(OUT, JSON.stringify({ ...base, injected: false, over: true, winner: e.winner, end: e.t, deaths }) + "\n"); continue; }
    const deathsAtInject = { ...deaths };
    for (const t of Object.values(e.towers)) if (t.lane !== "nexus") t.hp = 0;
    const touched = { blue: false, red: false }, firstWaveAt = { blue: null, red: null }, atBase = e._minionAtBase.bind(e);
    e._minionAtBase = (a, tw, l, m) => { const r = atBase(a, tw, l, m); if (r && tw?.lane === "nexus") { touched[a] = true; firstWaveAt[a] ??= e.t; } return r; };
    const hp = { blue: e.towers.blue_nexus.hp, red: e.towers.red_nexus.hp };
    let noWaveHits = 0, nexusHits = 0;
    while (!e.over && e.t < CAP) {
      touched.blue = false; touched.red = false;
      e.tick(0.5); countDeaths();
      for (const [v, a] of [["blue", "red"], ["red", "blue"]]) { const now = e.towers[`${v}_nexus`].hp; if (now < hp[v]) { nexusHits++; if (!touched[a]) noWaveHits++; } hp[v] = now; }
    }
    fs.appendFileSync(OUT, JSON.stringify({ ...base, injected: true, over: e.over, winner: e.winner, end: e.t, afterInject: e.t - tInject, nexusHits, noWaveHits, escortOn: { blue: e.tacExec?.eg?.blue?.onAt ?? null, red: e.tacExec?.eg?.red?.onAt ?? null }, deaths, deathsAfter: { blue: deaths.blue - deathsAtInject.blue, red: deaths.red - deathsAtInject.red }, firstWaveAt }) + "\n");
  }
}
