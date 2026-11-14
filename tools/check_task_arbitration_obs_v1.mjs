#!/usr/bin/env node
// ============================================================================
//  tools/check_task_arbitration_obs_v1.mjs — gate for TaskArbitration.v1 step A (record only).
//  Observer: tools/lib/taskArbitrationObs.mjs. Runner: tools/owner_preview/task_arbitration_v1.mjs.
//  One process, no fan-out, one paired match (seed 93001, career mid, observer off / on).
//   ① on/off per-tick stream hash equal (players id/pos/hp/dead/state/gold, e.t; end: winner, exec)
//   ② every record: winner ∈ TASKS, reason ∈ REASONS, rewrites ⊂ REWRITES, suppressed ⊂ SUPPRESSED_KEYS
//   ③ every living hero (alive at tick start) has exactly one record per tick; no unseen turns, no observer errors
//   ④ no own-enumerable key added to any player / to the engine beyond the wrapped methods; detach() restores identity
//   ⑤ source scan of the lib: no assignment to p./e./engine. fields other than the method wrapping
//   ⑥ git diff --quiet HEAD -- src
//  Run: node tools/check_task_arbitration_obs_v1.mjs
// ============================================================================
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TASKS, REASONS, REWRITES, SUPPRESSED_KEYS, DEFAULT_KINDS } from "./lib/taskArbitrationObs.mjs";
import { selfcheck } from "./owner_preview/task_arbitration_v1.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;
const t0 = Date.now();

const SEED = 93001;
const R = await selfcheck(SEED, "mid", { keep: true });
console.log(J(R.result));
ck("① observer on/off per-tick hash equal (seed 93001 career mid)", R.result.ok,
  `ticks=${R.result.ticks}${R.firstDiff != null ? ` firstDiffTick=${R.firstDiff}` : ""}`);

// ②
const T = new Set(TASKS), RS = new Set(REASONS), RW = new Set(REWRITES), SK = new Set(SUPPRESSED_KEYS), DK = new Set(DEFAULT_KINDS);
let bad2 = 0, ex2 = null;
for (const r of R.records) {
  const ok = T.has(r.winner) && RS.has(r.reason) && Array.isArray(r.rewrites) && r.rewrites.every((x) => RW.has(x)) &&
    Array.isArray(r.suppressed) && r.suppressed.every((x) => SK.has(x)) && (r.winner !== "default" || DK.has(r.kind)) &&
    new Set(r.rewrites).size === r.rewrites.length;
  if (!ok) { bad2++; ex2 ??= r; }
}
ck("② winner ∈ TASKS, reason ∈ REASONS, rewrites ⊂ REWRITES, suppressed ⊂ SUPPRESSED_KEYS", R.records.length > 0 && bad2 === 0,
  `records=${R.records.length} bad=${bad2}${ex2 ? " e.g. " + J(ex2) : ""}`);

// ③
const S = R.summary;
ck("③ exactly one record per living hero per tick", R.perTickBad === 0 && S.unseen === 0 && S.errors === 0 && S.records === R.records.length,
  `badTicks=${R.perTickBad} unseen=${S.unseen} observerErrors=${S.errors}${S.firstError ? " " + S.firstError.split("\n")[0] : ""}${R.perTickFirstBad ? " first=" + J(R.perTickFirstBad) : ""}`);

// ④
const wrappedSet = new Set(R.wrapped);
const eqArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const engineAddedBeyondWrap = R.engineKeysObserved.filter((k) => !wrappedSet.has(k) && !R.plainEngineKeys.includes(k));
const engineMissing = R.plainEngineKeys.filter((k) => !R.engineKeysObserved.includes(k));
const playerDiff = Object.keys(R.plainPlayerKeys).filter((id) => !eqArr(R.plainPlayerKeys[id], R.observedPlayerKeys[id] ?? []));
const notRestored = R.restored.filter((x) => !x.ok).map((x) => x.name);
ck("④ no own key added to players/engine beyond wrapped methods; detach() restores originals",
  engineAddedBeyondWrap.length === 0 && engineMissing.length === 0 && playerDiff.length === 0 && notRestored.length === 0 &&
  eqArr(R.engineKeysAfterDetach, R.plainEngineKeys) && R.wrapped.length > 0,
  `wrapped=${R.wrapped.length} engineAdded=${J(engineAddedBeyondWrap)} engineMissing=${J(engineMissing)} playerDiff=${J(playerDiff)} notRestored=${J(notRestored)} missingMethods=${J(S.missingMethods)}`);

// ⑤ source scan (comments and string literals stripped)
const src = fs.readFileSync(path.join(HERE, "lib", "taskArbitrationObs.mjs"), "utf8");
const stripped = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:\\])\/\/.*$/gm, "$1")
  .replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``")
  .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
  .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
const fieldAssign = /\b(?:p|q|e|engine|tw|tq|lt)\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]]*\])+\s*(?:\*\*|<<|>>>?|\?\?|&&|\|\||[+\-*/%&|^])?=(?!=)|\b(?:p|q|e|engine)\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]]*\])+\s*(?:\+\+|--)|(?:\+\+|--)\s*(?:p|q|e|engine)\s*[.[]/g;
const hits = [...stripped.matchAll(fieldAssign)].map((m) => m[0].trim());
const allowed = (h) => /^engine\[name\]\s*=$/.test(h);
const illegal = hits.filter((h) => !allowed(h));
const defineProp = /(?:Object\.(?:defineProperty|defineProperties|assign|setPrototypeOf)|Reflect\.(?:set|defineProperty))\s*\(/.test(stripped);
const deletes = [...stripped.matchAll(/\bdelete\s+([^;\n]+)/g)].map((m) => m[1].trim()).filter((x) => x !== "engine[name]");
ck("⑤ lib has no field assignment on p./e./engine. except the method wrapping", illegal.length === 0 && !defineProp && deletes.length === 0 && hits.some(allowed),
  `wrapAssignments=${hits.filter(allowed).length} illegal=${J(illegal)} defineProperty=${defineProp} otherDeletes=${J(deletes)}`);

// ⑥
let srcClean = false, gitErr = "";
try { execFileSync("git", ["diff", "--quiet", "HEAD", "--", "src"], { cwd: ROOT, stdio: "pipe" }); srcClean = true; }
catch (err) { gitErr = err.status != null ? `exit ${err.status}` : String(err.message); }
ck("⑥ git diff --quiet HEAD -- src", srcClean, gitErr);

const top5 = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(J({ rules: S.rules, winners: S.winners, reasons: S.reasons, approx: S.approx, overridden: S.overridden,
  topSuppressed: top5(S.suppressed), topRewrites: top5(S.rewrites) }));
const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_task_arbitration_obs_v1：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(pass === results.length ? 0 : 1);
