#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/stress_parity_e7_v24.mjs — v24 Calibration Sprint：Career-Parity 下的 E7 平衡設計（人工終局壓力；量測工具，不改引擎；2026-11-20）
//
//  事前登記：review/tactic-book-3a/v24_calibration/S16_REGISTRATION.md §4。
//  每個 Seed 跑 8 場：配置 AB／BA（同 Seed、同陣容、模板換邊）× 佈局 STANDARD／SWAPPED（ESMO_BALANCE_LAYOUT 強制）× 版本 v1.2／v1.3。
//  注入規則與 closure_stress_v24 相同（時刻改成 Career-Parity 的 INJECT）：注入時刻＝INJECT[floor((seed−1)/2) % 4]，所有非主堡建築 hp＝0，上限 3000 秒。
//  有效 Seed＝8 場都有注入（注入前的局面只由 Seed／配置／佈局決定，與結果無關）。湊滿登記的有效 Seed 數就停，不多跑。
//  每場都驗證實際生效的環境（lib_parity_env_v24.assertEnv：技能／被動／成長開、天賦關、佈局＝指定值、版本＝指定值），不符就丟錯。
//  單段：--seeds=<逗號分隔> --out=<jsonl>（每場一列）；批次：--run --dir=<repo 外資料夾> --target=<有效 Seed 數> --from=<起始奇數 Seed> --cap=<最多走幾個 Seed>
// ============================================================================
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
//  注入時刻（Career-Parity 專用；S16_REGISTRATION.md §4）：開了英雄技能之後對局較短（已用過的 Seeds 上自然對局 P05 809.5 秒、最短 725.5 秒），
//  上一輪的 840／960／1080／1200 秒在 1080／1200 秒時只剩 37%／21% 還在打 ⇒ 8 場都注入的機率 2%／0.2%。改成全部早於最短對局的 600／640／680／720 秒。
export const INJECT = Object.freeze([600, 640, 680, 720]);
const SELF = fileURLToPath(import.meta.url), CAP = 3000;
export const COMBOS = Object.freeze(["AB", "BA"].flatMap((cfg) => ["STANDARD", "SWAPPED"].flatMap((layout) => [["s12", "adaptive.v1.2"], ["s13", "adaptive.v1.3"]].map(([arm, variant]) => ({ cfg, layout, arm, variant })))));
const TPL = { AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
const key = (r) => `${r.cfg}|${r.layout}|${r.arm}`;
/** 一個 Seed 的 8 列都齊、而且都有注入 ⇒ 有效 */
export function effectiveSeeds(rows) {
  const by = new Map(); for (const r of rows) { if (!by.has(r.seed)) by.set(r.seed, new Map()); by.get(r.seed).set(key(r), r); }
  return [...by.entries()].filter(([, m]) => COMBOS.every((c) => m.get(key(c))?.injected)).map(([seed]) => seed).sort((a, b) => a - b);
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].replace(/\//g, "\\").toLowerCase();
if (isMain && process.argv.includes("--run")) {
  const DIR = arg("dir"), TARGET = Number(arg("target")), FROM = Number(arg("from")), MAXN = Number(arg("cap"));
  fs.mkdirSync(DIR, { recursive: true });
  const f = `${DIR}/stress.jsonl`, stamp = () => new Date().toISOString(), note = (n, rec) => fs.appendFileSync(`${DIR}/${n}`, JSON.stringify({ at: stamp(), ...rec }) + "\n");
  const load = () => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const seeds = Array.from({ length: MAXN }, (_, i) => FROM + 2 * i), t0 = Date.now();
  let rows = load(); if (rows.length) note("interruptions.jsonl", { kind: "resume", rows: rows.length });
  //  只完整跑完的 Seed 算數（8 列都在）；續跑時從第一個不完整的 Seed 開始（不完整的列刪掉重跑）
  const complete = new Set([...new Set(rows.map((r) => r.seed))].filter((s) => rows.filter((r) => r.seed === s).length === COMBOS.length));
  if (rows.some((r) => !complete.has(r.seed))) { rows = rows.filter((r) => complete.has(r.seed)); fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")); note("interruptions.jsonl", { kind: "partial_seed_dropped" }); }
  for (;;) {
    if (fs.existsSync(`${DIR}/STOP`)) { note("interruptions.jsonl", { kind: "stop_file" }); process.exit(0); }
    const eff = effectiveSeeds(rows).length, walked = new Set(rows.map((r) => r.seed));
    if (eff >= TARGET) break;
    const next = seeds.filter((s) => !walked.has(s)).slice(0, Math.min(5, TARGET - eff));
    if (!next.length) { note("interruptions.jsonl", { kind: "cap_reached", effective: eff }); break; }
    const startedAt = stamp(), r = spawnSync(process.execPath, ["--max-old-space-size=1536", SELF, `--seeds=${next.join(",")}`, `--out=${f}`], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
    if (r.stderr) fs.appendFileSync(`${DIR}/stderr.log`, r.stderr);
    note("batches.jsonl", { from: next[0], to: next.at(-1), n: next.length, exit: r.status, startedAt });
    if (r.status !== 0) { note("interruptions.jsonl", { kind: "child_failed", exit: r.status, from: next[0], stderr: (r.stderr ?? "").slice(0, 400) }); process.exit(1); }
    rows = load();
    const e2 = effectiveSeeds(rows).length, el = (Date.now() - t0) / 60000, fill = Math.round((20 * Math.min(e2, TARGET)) / TARGET);
    const line = `[${"█".repeat(fill)}${"░".repeat(20 - fill)}] 有效 ${e2}/${TARGET} 個 Seed（走過 ${new Set(rows.map((x) => x.seed)).size}）已花 ${el.toFixed(1)} 分，預估剩 ${e2 > 0 ? ((el / e2) * (TARGET - e2)).toFixed(0) : "?"} 分`;
    fs.appendFileSync(`${DIR}/progress.log`, line + "\n"); console.log(line);
  }
  fs.appendFileSync(`${DIR}/progress.log`, "[all-done]\n"); console.log("[all-done]");
  process.exit(0);
}
if (isMain) {
  const L = await import("./lib_parity_env_v24.mjs");
  L.applyEnv("parity");
  const P = await import("./pin_v20_v23_stream.mjs");
  for (const seed of arg("seeds", "").split(",").filter(Boolean).map(Number)) {
    const tInject = INJECT[Math.floor((seed - 1) / 2) % INJECT.length];
    for (const c of COMBOS) {
      process.env.ESMO_BALANCE_LAYOUT = c.layout; process.env.ESMO_BALANCE_TACTICEXEC = c.variant;
      let e; try { e = P.build("balanceTool.v24", TPL[c.cfg][0], TPL[c.cfg][1], seed, null); } finally { delete process.env.ESMO_BALANCE_LAYOUT; delete process.env.ESMO_BALANCE_TACTICEXEC; }
      const desc = L.assertEnv(L.describeEngine(e, "balanceTool.v24"), "parity", "tool", { layout: c.layout, variant: c.variant });
      const base = { seed, ...c, tInject, desc };
      const was = new Map(), deaths = { blue: 0, red: 0 };
      const countDeaths = () => { for (const p of e.players) { if (p.dead && !was.get(p.id)) deaths[p.side]++; was.set(p.id, !!p.dead); } };
      while (!e.over && e.t < tInject) { e.tick(0.5); countDeaths(); }
      if (e.over) { fs.appendFileSync(arg("out"), JSON.stringify({ ...base, injected: false, over: true, winner: e.winner, end: e.t, deaths }) + "\n"); continue; }
      const at = { ...deaths };
      for (const t of Object.values(e.towers)) if (t.lane !== "nexus") t.hp = 0;
      const touched = { blue: false, red: false }, firstWaveAt = { blue: null, red: null }, atBase = e._minionAtBase.bind(e);
      e._minionAtBase = (a, tw, l, m) => { const r = atBase(a, tw, l, m); if (r && tw?.lane === "nexus") { touched[a] = true; firstWaveAt[a] ??= e.t; } return r; };
      const hp = { blue: e.towers.blue_nexus.hp, red: e.towers.red_nexus.hp };
      let noWaveHits = 0, nexusHits = 0;
      while (!e.over && e.t < CAP) {
        touched.blue = false; touched.red = false; e.tick(0.5); countDeaths();
        for (const [v, a] of [["blue", "red"], ["red", "blue"]]) { const now = e.towers[`${v}_nexus`].hp; if (now < hp[v]) { nexusHits++; if (!touched[a]) noWaveHits++; } hp[v] = now; }
      }
      fs.appendFileSync(arg("out"), JSON.stringify({ ...base, injected: true, over: e.over, winner: e.winner, end: e.t, afterInject: e.t - tInject, nexusHits, noWaveHits,
        escortOn: { blue: e.tacExec?.eg?.blue?.onAt ?? null, red: e.tacExec?.eg?.red?.onAt ?? null }, deaths, deathsAfter: { blue: deaths.blue - at.blue, red: deaths.red - at.red }, firstWaveAt }) + "\n");
    }
  }
}
