#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/pin_v13_baseline_v24.mjs — 改 v24 語意之前，在 910792ac（v24 規則集＝adaptive.v1.3）錄 v1.3 的整場串流雜湊（2026-11-20）
//
//  check_tactic_exec_v24 T7 用這些值證明 v1.4 上線後 adaptive.v1.3 仍逐 tick 可重現（工具覆寫 ESMO_BALANCE_TACTICEXEC=adaptive.v1.3；生涯第一個 tick 前切換）。
//  --env=noskills（預設，與 T7 其他釘點同一個環境）｜parity（Career-Parity：另開一個子行程錄）
//  用法：node tools/owner_preview/pin_v13_baseline_v24.mjs --env=noskills --out=<json>
// ============================================================================
import fs from "node:fs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const L = await import("./lib_parity_env_v24.mjs");
const ENV = arg("env", "noskills");
L.applyEnv(ENV);
const P = await import("./pin_v20_v23_stream.mjs");
const CASES = ENV === "noskills"
  ? [["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null], ["balanceTool.v24", "v2.jungle_invasion", "classic.m7", 13, null], ["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 120159, null], ["career.v24", "v2.jungle_invasion", null, 93001, "mid"]]
  : [["balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 11, null], ["balanceTool.v24", "classic.m7", "v2.jungle_invasion", 17, null]];
const out = { env: ENV, recordedAt: new Date().toISOString(), pins: {} };
for (const c of CASES) {
  const e = P.build(...c);
  if (e._tacExecVariant !== "adaptive.v1.3" || e.t !== 0) throw new Error(`expected a fresh adaptive.v1.3 engine for ${P.caseKey(c)}, got ${e._tacExecVariant}`);
  L.assertEnv(L.describeEngine(e, c[0]), ENV, c[0].startsWith("career") ? "career" : "tool");
  out.pins[P.caseKey(c)] = P.streamHash(e).hash;
}
if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
