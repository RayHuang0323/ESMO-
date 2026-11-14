#!/usr/bin/env node
// ============================================================================
//  tools/audit_semantics_deps.mjs — read-only audit (NOT a gate; changes nothing)
//
//  Compares the static import closure of the simulation against the two lists in
//  src/platform/contracts/simulationVersion.js:
//    · SIMULATION_SEMANTICS_FILES  (fingerprinted)
//    · KNOWN_TRANSITIVE_GAPS       (acknowledged, not fingerprinted)
//
//  Roots: src/LogicEngine.js + every entry of SIMULATION_SEMANTICS_FILES.
//  Imports are found by regex (static `import ... from "x"`, `export ... from "x"`,
//  bare `import "x"`, and `import("x")` with a string literal). Relative specifiers only.
//  File contents are never printed; only specifiers are extracted.
//
//    node tools/audit_semantics_deps.mjs           readable report
//    node tools/audit_semantics_deps.mjs --json    JSON
//    node tools/audit_semantics_deps.mjs --strict  exit 1 if any uncovered file
// ============================================================================
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const strict = argv.includes("--strict");

const rel = (abs) => relative(ROOT, abs).split(sep).join("/");
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

const sv = await import(pathToFileURL(resolve(ROOT, "src/platform/contracts/simulationVersion.js")).href);
const SEM = [...sv.SIMULATION_SEMANTICS_FILES];
const GAPS = [...sv.KNOWN_TRANSITIVE_GAPS];

const IMPORT_RES = [
  /\bimport\s+[^'"`;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bexport\s+[^'"`;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];
const EXTS = ["", ".js", ".mjs", ".jsx"];
const INDEX = ["index.js", "index.mjs", "index.jsx"];

function resolveSpec(fromAbs, spec) {
  if (!spec.startsWith(".")) return null; // relative only
  const base = resolve(dirname(fromAbs), spec.split("?")[0]);
  for (const e of EXTS) if (isFile(base + e)) return base + e;
  for (const i of INDEX) if (isFile(resolve(base, i))) return resolve(base, i);
  return { unresolved: rel(base) };
}

const depCache = new Map();
function depsOf(abs) {
  if (depCache.has(abs)) return depCache.get(abs);
  let text = "";
  try { text = readFileSync(abs, "utf8"); } catch { text = ""; }
  const specs = new Set();
  for (const re of IMPORT_RES) { re.lastIndex = 0; let m; while ((m = re.exec(text))) specs.add(m[1]); }
  const out = [], unresolved = [];
  for (const s of specs) {
    const r = resolveSpec(abs, s);
    if (r === null) continue;
    if (typeof r === "object") unresolved.push(r.unresolved); else out.push(r);
  }
  const res = { deps: out, unresolved };
  depCache.set(abs, res);
  return res;
}

/** BFS from roots; returns Map(relPath -> parent relPath | null) giving one chain back to a root. */
function closure(rootsRel) {
  const parent = new Map();
  const queue = [];
  for (const r of rootsRel) {
    const abs = resolve(ROOT, r);
    if (!isFile(abs) || parent.has(r)) continue;
    parent.set(r, null); queue.push(abs);
  }
  const unresolved = new Set();
  while (queue.length) {
    const abs = queue.shift();
    const { deps, unresolved: un } = depsOf(abs);
    for (const u of un) unresolved.add(`${rel(abs)} -> ${u}`);
    for (const d of deps) {
      const dr = rel(d);
      if (parent.has(dr)) continue;
      parent.set(dr, rel(abs)); queue.push(d);
    }
  }
  return { parent, unresolved: [...unresolved].sort() };
}
const chainOf = (parent, f) => { const c = []; for (let x = f; x != null; x = parent.get(x)) c.unshift(x); return c; };
const tagOf = (f) => {
  if (/\.jsx$/.test(f) || /(^|\/)(components|screens)\//.test(f)) return "ui";
  if (/(^|\/)data\//.test(f)) return "data";
  return "engine";
};

const ENGINE = "src/LogicEngine.js";
const all = closure([ENGINE, ...SEM]);
const eng = closure([ENGINE]);
const semSet = new Set(SEM), gapSet = new Set(GAPS);

const uncovered = [...all.parent.keys()]
  .filter((f) => !semSet.has(f) && !gapSet.has(f) && f !== ENGINE)
  .sort()
  .map((f) => ({ file: f, tag: tagOf(f), inEngineClosure: eng.parent.has(f), chain: chainOf(all.parent, f) }));
const staleGaps = GAPS.map((g) => ({ file: g, exists: existsSync(resolve(ROOT, g)), inClosure: all.parent.has(g) }))
  .filter((g) => !g.exists || !g.inClosure)
  .map((g) => ({ file: g.file, reason: !g.exists ? "missing on disk" : "not in closure" }));
const missingSem = SEM.filter((f) => !isFile(resolve(ROOT, f)));
const semNotInEngineClosure = SEM.filter((f) => isFile(resolve(ROOT, f)) && !eng.parent.has(f));

const tagCounts = uncovered.reduce((a, u) => ((a[u.tag] = (a[u.tag] ?? 0) + 1), a), {});
const report = {
  schema: "SemanticsDepsAudit.v1",
  simVersion: sv.MOBA_SIMULATION_VERSION ?? null,
  counts: {
    semanticsFiles: SEM.length,
    knownTransitiveGaps: GAPS.length,
    closureAllRoots: all.parent.size,
    closureLogicEngineOnly: eng.parent.size,
    uncovered: uncovered.length,
    uncoveredInEngineClosure: uncovered.filter((u) => u.inEngineClosure).length,
    uncoveredByTag: tagCounts,
    staleGaps: staleGaps.length,
    missingSemanticsFiles: missingSem.length,
    semanticsFilesNotReachedFromLogicEngine: semNotInEngineClosure.length,
    unresolvedRelativeImports: all.unresolved.length,
  },
  uncovered,
  staleGaps,
  missingSemanticsFiles: missingSem,
  semanticsFilesNotReachedFromLogicEngine: semNotInEngineClosure,
  unresolvedRelativeImports: all.unresolved,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const c = report.counts;
  console.log(`Semantics deps audit (${report.simVersion}) — read-only, not a gate\n`);
  console.log(`SIMULATION_SEMANTICS_FILES: ${c.semanticsFiles}   KNOWN_TRANSITIVE_GAPS: ${c.knownTransitiveGaps}`);
  console.log(`closure (LogicEngine + semantics files): ${c.closureAllRoots}   closure (LogicEngine only): ${c.closureLogicEngineOnly}`);
  console.log(`\n(a) uncovered: ${c.uncovered}  (in LogicEngine closure: ${c.uncoveredInEngineClosure})  by tag: ${JSON.stringify(c.uncoveredByTag)}`);
  for (const u of uncovered) {
    console.log(`  [${u.tag.padEnd(6)}] ${u.inEngineClosure ? "E" : " "} ${u.file}`);
    console.log(`             via ${u.chain.join(" -> ")}`);
  }
  console.log(`\n(b) stale KNOWN_TRANSITIVE_GAPS: ${c.staleGaps}`);
  for (const g of staleGaps) console.log(`  ${g.file}  (${g.reason})`);
  console.log(`\n(c) SIMULATION_SEMANTICS_FILES missing on disk: ${c.missingSemanticsFiles}`);
  for (const f of missingSem) console.log(`  ${f}`);
  console.log(`\n(info) semantics files not reached from LogicEngine: ${c.semanticsFilesNotReachedFromLogicEngine}`);
  for (const f of semNotInEngineClosure) console.log(`  ${f}`);
  if (all.unresolved.length) {
    console.log(`\n(info) unresolved relative imports: ${all.unresolved.length}`);
    for (const u of all.unresolved) console.log(`  ${u}`);
  }
  console.log(`\nE = also reachable from src/LogicEngine.js alone. Tags are path-based only (no judgement).`);
}

process.exit(strict && uncovered.length ? 1 : 0);
