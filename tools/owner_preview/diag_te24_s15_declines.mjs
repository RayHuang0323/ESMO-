#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s15_declines.mjs — Sprint 2 Preflight A §2.1：三輪既有驗證資料的入侵拒絕原因（只讀；2026-11-20）
//
//  讀 110001／120001／130001 三輪 batches 裡每邊的 te.declined（有入侵傾向的邊），依版本 × 路徑 × 配置／素質彙總：
//  每邊每場評估數、出發數、到營地比例，各拒絕原因佔全部評估的比例。不跑任何對局。
//  用法：node tools/owner_preview/diag_te24_s15_declines.mjs --root=<esmo-measure 資料夾> --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = arg("root"), OUT = arg("out");
const ROUNDS = [["v24-s11-val-110001", { s1: "v1", adaptive: "v1.1" }], ["v24-s12-val-120001", { s11: "v1.1", adaptive: "v1.2" }], ["v24-s13-val-130001", { s12: "v1.2", adaptive: "v1.3" }]];
const REASONS = ["cooldown", "in_progress", "busy", "hp", "own_farm", "too_far", "unreachable", "no_exit", "no_intel", "no_target", "objective_window", "objective_intent", "objective_soon", "threat_seen", "threat", "no_party", "lane_cost"];
const add = (o, k, v = 1) => { o[k] = (o[k] ?? 0) + v; };
const out = {};
for (const [dir, armMap] of ROUNDS) {
  const D = path.join(ROOT, dir, "batches");
  for (const f of fs.readdirSync(D).filter((x) => x.endsWith(".json"))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(D, f), "utf8")).rows) {
      const ver = armMap[r.arm]; if (!ver || !r.te) continue;
      for (const S of ["blue", "red"]) {
        const o = r.te[S]; if (!o?.posture) continue;
        const key = `${dir.slice(-6)}|${ver}|${r.path === "career" ? `career_${r.tier}` : `tool_${r.cfg}`}`;
        const A = (out[key] ??= { sideMatches: 0, evals: 0, starts: 0, arrived: 0, declined: {} });
        A.sideMatches++; A.evals += o.evals; A.starts += o.starts; A.arrived += o.arrived;
        for (const [k, v] of Object.entries(o.declined)) add(A.declined, k, v);
      }
    }
  }
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const view = Object.fromEntries(Object.entries(out).sort().map(([k, A]) => [k, { sideMatches: A.sideMatches, evalsPerSide: r3(A.evals / A.sideMatches), startsPerSide: r3(A.starts / A.sideMatches), arrivedPerStart: A.starts ? r3(A.arrived / A.starts) : null, shareOfEvals: Object.fromEntries(REASONS.map((x) => [x, r3((A.declined[x] ?? 0) / A.evals)])) }]));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(view, null, 1));
for (const [k, v] of Object.entries(view)) console.log(k.padEnd(26), "starts/sm", v.startsPerSide, "busy", v.shareOfEvals.busy, "too_far", v.shareOfEvals.too_far, "own_farm", v.shareOfEvals.own_farm, "cooldown", v.shareOfEvals.cooldown);
