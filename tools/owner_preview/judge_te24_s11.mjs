#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/judge_te24_s11.mjs — v24 Sprint 1.1 three-arm judgement wrapper (offline, read-only; 2026-11-18)
//  Per S11_REGISTRATION.md section 3: the unchanged Sprint 1 analyzer/judge run on two views of the same fresh-seed data:
//    view "v11" = off + adaptive (Sprint 1.1, the acceptance view)    view "s1" = off + s1 renamed to adaptive (report only)
//  plus compare_te24_s11 on all arms (main batches) and on the posture report batches.
//  --dir=<validation folder with batches/ and posture/>   writes <dir>/views/*, <dir>/analysis_*.json, <dir>/judgement_*.json, <dir>/compare_*.json
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DIR = arg("dir");
const run = (args) => { const r = spawnSync(process.execPath, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }); if (r.status !== 0) { console.error(r.stderr); process.exit(1); } return r.stdout; };
const B = path.join(DIR, "batches");
const files = fs.readdirSync(B).filter((x) => x.endsWith(".json")).sort();
for (const [view, keep] of [["v11", { off: "off", adaptive: "adaptive" }], ["s1", { off: "off", s1: "adaptive" }]]) {
  const vd = path.join(DIR, "views", view);
  fs.mkdirSync(vd, { recursive: true });
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(B, f), "utf8"));
    j.rows = j.rows.filter((r) => keep[r.arm]).map((r) => ({ ...r, arm: keep[r.arm] }));
    j.view = view;
    fs.writeFileSync(path.join(vd, f), JSON.stringify(j));
  }
  const an = path.join(DIR, `analysis_${view}.json`), jd = path.join(DIR, `judgement_${view}.json`);
  run(["tools/owner_preview/analyze_tactic_exec_v24.mjs", `--dir=${vd}`, `--out=${an}`]);
  console.log(`==== view ${view} ====`);
  process.stdout.write(run(["tools/owner_preview/judge_tactic_exec_v24.mjs", `--dir=${vd}`, `--analysis=${an}`, `--out=${jd}`]));
}
console.log("==== compare (all arms, main batches) ====");
process.stdout.write(run(["tools/owner_preview/compare_te24_s11.mjs", `--dir=${B}`, `--out=${path.join(DIR, "compare_main.json")}`]));
const PD = path.join(DIR, "posture");
if (fs.existsSync(PD) && fs.readdirSync(PD).some((x) => x.endsWith(".json"))) {
  //  posture arms are inv-config only; pair them with the off rows (and the auto=adaptive rows) of the same seeds from the main batches
  const seeds = new Set();
  const prow = [];
  for (const f of fs.readdirSync(PD).filter((x) => x.endsWith(".json"))) for (const r of JSON.parse(fs.readFileSync(path.join(PD, f), "utf8")).rows) { prow.push(r); seeds.add(r.seed); }
  for (const f of files) for (const r of JSON.parse(fs.readFileSync(path.join(B, f), "utf8")).rows) if (r.path === "tool" && r.cfg === "inv" && seeds.has(r.seed) && (r.arm === "off" || r.arm === "adaptive")) prow.push(r.arm === "adaptive" ? { ...r, arm: "pa" } : r);
  const pf = path.join(DIR, "views", "posture_merged.json");
  fs.writeFileSync(pf, JSON.stringify({ rows: prow }));
  console.log("==== compare (postures: pc=conservative pa=auto pg=aggressive pl=allin; tool inv, same seeds) ====");
  process.stdout.write(run(["tools/owner_preview/compare_te24_s11.mjs", `--files=${pf}`, `--out=${path.join(DIR, "compare_posture.json")}`]));
}
