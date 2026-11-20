#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/stress_endgame_v24.mjs — 終局壓力測試（v24 Sprint 1.3，2026-11-19；量測工具，不改引擎）
//
//  自然對局很少走到僵局（開發 Seed 約 1／200），只看自然對局驗不出修法。這支工具在對局中途把雙方「主堡以外的建築」全部拆掉，
//  製造雙方都只剩主堡的局面，再讓對局自己打完，比較有無終局護線的完賽率、收尾時間與紅藍勝率。
//  注入時間依 Seed 輪流取 14／16／18／20 分鐘。注入前已結束的對局記為 injected:false，照實計入。
//  閘門稽核：注入之後，主堡每一次掉血的 tick，引擎當下都必須判定有攻方小兵在主堡（包裝 _minionAtBase，同一個 tick 內到場又陣亡的兵線也算到場）。
//
//  單場：--path=tool --cfg=inv|AB|BA 或 --path=career --tier=low|mid|high；--arm=s12|s13；--seeds=<逗號分隔>；--out=<jsonl，附加>
//  批次：--run --seedsTool=130001 --nTool=100 --seedsCareer=130201 --nCareer=30 --dir=<repo 外資料夾>（嚴格單線，每 10 個 Seed 一個子行程，可續跑）
// ============================================================================
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SELF = fileURLToPath(import.meta.url), CAP = 3000, INJECT = [840, 960, 1080, 1200];

if (process.argv.includes("--run")) {
  const DIR = arg("dir"), T0 = Number(arg("seedsTool")), NT = Number(arg("nTool", "100")), C0 = Number(arg("seedsCareer")), NC = Number(arg("nCareer", "30"));
  fs.mkdirSync(DIR, { recursive: true });
  const jobs = [];
  for (const arm of ["s12", "s13"]) {
    for (const cfg of ["inv", "AB", "BA"]) jobs.push({ name: `tool_${cfg}_${arm}`, a: ["--path=tool", `--cfg=${cfg}`, `--arm=${arm}`], seeds: Array.from({ length: NT }, (_, i) => T0 + 2 * i) });
    for (const tier of ["low", "mid", "high"]) jobs.push({ name: `career_${tier}_${arm}`, a: ["--path=career", `--tier=${tier}`, `--arm=${arm}`], seeds: Array.from({ length: NC }, (_, i) => C0 + 2 * i) });
  }
  const count = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).length : 0);
  const total = jobs.reduce((s, j) => s + j.seeds.length, 0), t0 = Date.now();
  for (const j of jobs) {
    const f = `${DIR}/${j.name}.jsonl`;
    for (let d = count(f); d < j.seeds.length; d = count(f)) {
      const r = spawnSync(process.execPath, ["--max-old-space-size=1536", SELF, ...j.a, `--seeds=${j.seeds.slice(d, d + 10).join(",")}`, `--out=${f}`], { stdio: ["ignore", "ignore", "inherit"] });
      if (r.status !== 0) { console.log(`[stop] ${j.name} exit=${r.status}`); process.exit(1); }
      const done = jobs.reduce((s, x) => s + count(`${DIR}/${x.name}.jsonl`), 0), el = (Date.now() - t0) / 60000, fill = Math.round(20 * done / total);
      console.log(`[${"█".repeat(fill)}${"░".repeat(20 - fill)}] ${done}/${total} ${j.name}  ${el.toFixed(1)} min`);
    }
  }
  console.log("[all-done]");
  process.exit(0);
}

const P = await import("./pin_v20_v23_stream.mjs");
const PATH = arg("path", "tool"), CFG = arg("cfg", "inv"), TIER = arg("tier", "mid"), ARM = arg("arm", "s13"), OUT = arg("out"), SEEDS = arg("seeds", "").split(",").filter(Boolean).map(Number);
const T = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
function build(seed) {
  if (PATH === "career") {
    const e = P.build("career.v24", "v2.jungle_invasion", null, seed, TIER);
    if (ARM === "s12") { e._tacExecVariant = "adaptive.v1.2"; e.tacExec.v13 = false; }
    return e;
  }
  if (ARM === "s12") process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.2";
  try { return P.build("balanceTool.v24", T[CFG][0], T[CFG][1], seed, null); } finally { delete process.env.ESMO_BALANCE_TACTICEXEC; }
}
for (const seed of SEEDS) {
  const tInject = INJECT[Math.floor((seed - 1) / 2) % INJECT.length], e = build(seed), base = { seed, path: PATH, cfg: PATH === "career" ? TIER : CFG, arm: ARM, tInject };
  while (!e.over && e.t < tInject) e.tick(0.5);
  if (e.over) { fs.appendFileSync(OUT, JSON.stringify({ ...base, injected: false, over: true, winner: e.winner, end: e.t }) + "\n"); continue; }
  for (const t of Object.values(e.towers)) if (t.lane !== "nexus") t.hp = 0;
  const touched = { blue: false, red: false }, atBase = e._minionAtBase.bind(e);
  e._minionAtBase = (a, tw, l, m) => { const r = atBase(a, tw, l, m); if (r && tw?.lane === "nexus") touched[a] = true; return r; };
  const hp = { blue: e.towers.blue_nexus.hp, red: e.towers.red_nexus.hp };
  let noWaveHits = 0, nexusHits = 0;
  while (!e.over && e.t < CAP) {
    touched.blue = false; touched.red = false;
    e.tick(0.5);
    for (const [v, a] of [["blue", "red"], ["red", "blue"]]) { const now = e.towers[`${v}_nexus`].hp; if (now < hp[v]) { nexusHits++; if (!touched[a]) noWaveHits++; } hp[v] = now; }
  }
  fs.appendFileSync(OUT, JSON.stringify({ ...base, injected: true, over: e.over, winner: e.winner, end: e.t, afterInject: e.t - tInject, nexusHits, noWaveHits, escortOn: { blue: e.tacExec?.eg?.blue?.onAt ?? null, red: e.tacExec?.eg?.red?.onAt ?? null } }) + "\n");
}
