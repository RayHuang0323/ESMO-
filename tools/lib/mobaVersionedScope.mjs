// ============================================================================
//  tools/lib/mobaVersionedScope.mjs — versioned replacement for "MOBA protected scope must equal the historical baseline" (TD-TAC-60, 2026-11-23).
//
//  Three historical v24 gates (check_cal_parity_v24 C3, check_s15_preflight_v24 P5, check_s2_contract_v24 T13b) protect one fact: the MOBA source
//  their recorded measurements were made on has not silently changed. A registered successor version (moba-sim.v25, C1) legitimately changes that
//  source, so "identical to the baseline" can no longer be the only acceptable state. This module splits the question in two and checks both:
//
//   A  HISTORICAL SOURCE (unchanged truth about the past)
//      A1 the gate's baseline commit and the legacy-golden source commit (053fd582) have the same MOBA protected scope (only the explicit CS
//         integration paths may differ) — git objects only, the working tree is not consulted;
//      A2 the semantic fingerprint of 053fd582, recomputed from git objects with the same algorithm as check_simulation_version_gate, equals the
//         registered moba-sim.v24 value 9727c0b4ae8beb3d.
//   B  CURRENT ENGINE KEEPS THE OLD BEHAVIOUR
//      B1 the current version is a REGISTERED successor (table below) whose computed fingerprint equals both its registration and the version table;
//      B2 src differs from 053fd582 only in that successor's registered change set (plus the explicit CS paths), and src is clean;
//      B3 the version table still holds the frozen historical entries (v24 9727c0b4ae8beb3d, v23 69237cce78edf2be);
//      B4 legacy golden: v20–v24 matches replay tick for tick identical to 053fd582 (tools/check_c1_legacy_golden.mjs, run as a child process).
//  If the source is still identical to the baseline, the original rule applies unchanged (mode "identical").
//  Nothing is waived: an unregistered version, an extra changed file, a dirty tree, a fingerprint mismatch or any golden tick difference ⇒ ok=false.
//  Sprint 2A's research candidates (v1.5/v1.6) are NOT registered here.
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { evaluateMobaIntegrationScope, inspectMobaIntegrationScope, CS_INTEGRATION_SOURCE_PATHS } from "./mobaIntegrationScope.mjs";

export const LEGACY_GOLDEN_SOURCE = "053fd582";
export const FROZEN_HISTORICAL_FINGERPRINTS = Object.freeze({ "moba-sim.v24": "9727c0b4ae8beb3d", "moba-sim.v23": "69237cce78edf2be" });
/** Registered successors of the historical v24 source. Adding a row needs an Owner-approved version (and its own legacy-golden evidence). */
export const REGISTERED_SUCCESSORS = Object.freeze({
  "moba-sim.v25": Object.freeze({
    fingerprint: "15a8c67f3bcea44a", registeredAt: "948fb192", base: LEGACY_GOLDEN_SOURCE, approval: "Owner 2026-11-23（C1 決定性數學核心）",
    changedSrc: Object.freeze(["src/LogicEngine.js", "src/battle/moba/matchAssembler.js", "src/battle/moba/sim/detMath.js", "src/featureFlags.js",
      "src/platform/contracts/matchRuleset.js", "src/platform/contracts/simulationVersion.js"]),
  }),
});

const gitIn = (root) => (...args) => execFileSync("git", ["--no-optional-locks", ...args], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });

/** Same algorithm as tools/check_simulation_version_gate.mjs fingerprintOf (esbuild whitespace/comment normalisation, sha256 per file). */
export async function fingerprintOfSources(sources) {
  const esbuild = await import("esbuild");
  const h = createHash("sha256");
  for (const [f, text] of sources) {
    h.update(f); h.update("\0");
    h.update(createHash("sha256").update(esbuild.transformSync(text, { loader: "js", minifyWhitespace: true, minifyIdentifiers: false, minifySyntax: false, legalComments: "none" }).code).digest("hex"));
    h.update("\n");
  }
  return h.digest("hex").slice(0, 16);
}
/** Semantic file list + fingerprint of a commit, from git objects only. */
export async function commitFingerprint(root, commit) {
  const git = gitIn(root);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "esmo-vscope-")), "simulationVersion.mjs");
  fs.writeFileSync(tmp, git("show", `${commit}:src/platform/contracts/simulationVersion.js`));
  const SV = await import(pathToFileURL(tmp).href);
  const fp = await fingerprintOfSources(new Map(SV.SIMULATION_SEMANTICS_FILES.map((f) => [f, git("show", `${commit}:${f}`)])));
  return { commit, version: SV.MOBA_SIMULATION_VERSION, fingerprint: fp, registered: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION], files: SV.SIMULATION_SEMANTICS_FILES.length };
}

let goldenCache = null;
function runLegacyGolden(root) {
  if (goldenCache) return goldenCache;
  const r = spawnSync(process.execPath, [path.join(root, "tools/check_c1_legacy_golden.mjs"), "--json"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
  try { goldenCache = JSON.parse(r.stdout.trim().split("\n").pop()); } catch { goldenCache = { ok: false, error: `exit ${r.status}: ${String(r.stderr).slice(-400)}` }; }
  return goldenCache;
}

//  Options exist only for the negative self-test (tools/check_c1_versioned_scope.mjs): a stubbed golden result and replacement registries. The defaults
//  are the real registries and the real golden run; the three historical gates never pass options.
export async function inspectVersionedScope(baseline, root = process.cwd(), { runGolden = true, goldenResult = null, successors = REGISTERED_SUCCESSORS, frozen = FROZEN_HISTORICAL_FINGERPRINTS } = {}) {
  const direct = inspectMobaIntegrationScope(baseline, root);
  if (direct.ok) return { ok: true, mode: "identical", baseline, direct };
  const git = gitIn(root);
  // ── A ──
  const histChanged = git("diff", "--name-only", "-z", baseline, LEGACY_GOLDEN_SOURCE, "--", "src").split("\0").filter(Boolean);
  const A1 = evaluateMobaIntegrationScope({ changedPaths: histChanged });
  const hist = await commitFingerprint(root, LEGACY_GOLDEN_SOURCE);
  const A2 = hist.version === "moba-sim.v24" && hist.fingerprint === frozen["moba-sim.v24"] && hist.registered === hist.fingerprint;
  // ── B ──
  const SV = await import(pathToFileURL(path.join(root, "src/platform/contracts/simulationVersion.js")).href);
  const succ = successors[SV.MOBA_SIMULATION_VERSION] ?? null;
  const fpNow = await fingerprintOfSources(new Map(SV.SIMULATION_SEMANTICS_FILES.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")])));
  const B1 = !!succ && succ.base === LEGACY_GOLDEN_SOURCE && fpNow === succ.fingerprint && SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] === succ.fingerprint;
  const curChanged = git("diff", "--name-only", "-z", LEGACY_GOLDEN_SOURCE, "--", "src").split("\0").filter(Boolean);
  const dirty = git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "src").split("\0").filter(Boolean);
  const outside = curChanged.filter((p) => !(succ?.changedSrc ?? []).includes(p) && !CS_INTEGRATION_SOURCE_PATHS.includes(p));
  const B2 = !!succ && outside.length === 0 && dirty.length === 0;
  const B3 = Object.entries(frozen).every(([v, fp]) => SV.SIMULATION_SEMANTICS_FINGERPRINTS[v] === fp);
  const golden = goldenResult ?? (runGolden ? runLegacyGolden(root) : { ok: false, skipped: true });
  const B4 = golden.ok === true;
  const ok = A1.ok && A2 && B1 && B2 && B3 && B4;
  return { ok, mode: ok ? "registeredSuccessor" : "fail", baseline,
    historical: { A1: A1.ok, baselineVsGoldenSource: { semanticChanges: A1.semanticChanges, unexpected: A1.unexpected }, A2, goldenSource: hist },
    current: { version: SV.MOBA_SIMULATION_VERSION, fingerprint: fpNow, B1, B2, changedSinceGoldenSource: curChanged, outsideRegistered: outside, dirty, B3, B4,
      golden: { ok: golden.ok, ticksCompared: golden.ticksCompared, rows: golden.rows?.map((r) => `${r.id}:${r.identical ? "same" : "DIFF@" + r.firstDifferentTick}`), error: golden.error } },
    direct: { ok: direct.ok, semanticChanges: direct.semanticChanges } };
}

/** Does a patch still apply to the tree of `commit` (git objects only, temporary index; the working tree and real index are untouched)? */
export function patchAppliesAt(root, patchPath, commit) {
  const idx = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "esmo-vscope-idx-")), "index");
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  try {
    execFileSync("git", ["read-tree", commit], { cwd: root, env, stdio: "ignore" });
    execFileSync("git", ["apply", "--cached", "--check", patchPath], { cwd: root, env, stdio: "ignore" });
    return true;
  } catch { return false; }
}
