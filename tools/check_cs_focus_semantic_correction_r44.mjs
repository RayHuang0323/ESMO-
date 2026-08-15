#!/usr/bin/env node
// R44 Focus raw/effective semantic audit.  Current and historical views are
// loaded through reversible in-memory Vite transforms; production is touched
// only by the one explicit defuse read committed by this Sprint.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  CS_R43_ACCURACY_SOURCE_SHA256,
  CS_R44_FOCUS_SOURCE_SHA256,
  csR44R43Source,
} from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const SCHEMA = "CsFocusSemanticCorrectionR44.v1";
const MAP_KEY = "inferno", T_TACTIC_ID = "t_aexec", CT_TACTIC_ID = "c_std";
const FIXED_SEEDS = Object.freeze([3978742910,4200255727,541349949,1011896540,44863398,1878380147,638784133,2852978760,1789562418,3820910912,3991584863,2186970694,951543597,2082574495,474649321,3950420867]);
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21;
const EXPECTED_SUITE_DIGEST = "e82c27c9182879f089e0baf6bf36ee8aad2cbebab494285829f88e145da724b5";
const CURRENT_FOCUS = '          defuseProg+=defuser.stats?(0.45+persStat(defuser,"foc")/250+persStat(defuser,"dec")/300):0.7;';
const HISTORICAL_FOCUS = '          defuseProg+=defuser.stats?(0.45+defuser.stats.foc/250+persStat(defuser,"dec")/300):0.7;';
const SIGNATURE = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_R = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const POS = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_R = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));const result=t/15,focusIndex=prof.indexOf(\"foc\"),focusWeight=focusIndex<0?0:5-focusIndex;globalThis.__CS_R44_AUDIT__?.record(\"roleFit\",{playerId:p.id,role:p.role,rawFocus:Number(s.foc??50),focusWeight,result});return result;}";
const S = "  const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);";
const S_R = "  let __r44FocusReads=0;const S=k=>{const value=k===\"rxn\"?effectiveReflex:persStat(p,k);if(k===\"foc\"){__r44FocusReads++;globalThis.__CS_R44_AUDIT__?.record(\"combatFocusRead\",{playerId:p.id,role:p.role,rawFocus:Number(p.stats?.foc??50),effectiveFocus:value});}return value;};";
const COMBAT = "  return v*formMul(p);";
const COMBAT_R = "  const __r44Form=formMul(p),__r44Result=v*__r44Form;globalThis.__CS_R44_AUDIT__?.record(\"combat\",{playerId:p.id,role:p.role,gun:p.gun||\"\",focusReads:__r44FocusReads,result:__r44Result,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lastAlive:Boolean(opts?.lastAlive),lowHP:Boolean(opts?.lowHP)});return __r44Result;";
const DEFUSE = "        const contested=defuser&&defuseAliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));";
const DEFUSE_R = `${DEFUSE}__measure?.record("defuse_opportunity",{round:rnd+1,sec,defuserId:defuser?.id||"",defuserRole:defuser?.role||"",contested:Boolean(contested),progressBefore:defuseProg});`;
const RETURN = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_R = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat };";
const EXPORT = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_R = "const __CS_FOCUS_R44_TEST_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB,persStat:__FPS3D_MODULE.persStat});export { EsportsFPS3D, buildMatchResult, __CS_FOCUS_R44_TEST_API__ };";

function gate(ok, code, detail = "") { if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function occurrences(text, needle) { return text.split(needle).length - 1; }
function clone(value) { return structuredClone(value); }
function json(value) { return JSON.stringify(value); }
function canonical(value) { if (value === null || typeof value === "string" || typeof value === "boolean") return value; if (typeof value === "number") { gate(Number.isFinite(value), "NON_FINITE"); return Object.is(value, -0) ? 0 : value; } if (Array.isArray(value)) return value.map(canonical); if (typeof value === "object") { const out = {}; for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]); return out; } return null; }
function cjson(value) { return JSON.stringify(canonical(value)); }
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function round(value) { return +Number(value || 0).toFixed(8); }
function expectedEffective(player, key) { const raw = Number(player.stats?.[key] ?? 50), pr = player.personality && ({aggressive:{foc:-4,dec:-4},defensive:{foc:6},calm:{dec:6},grinder:{foc:6},passionate:{foc:-4},creative:{foc:-4}}[player.personality] || {}); return Math.max(1, Math.min(99, raw + Number(pr[key] || 0))); }
function freeze(value, seen = new Set()) { if (!value || typeof value !== "object" || seen.has(value)) return value; seen.add(value); for (const child of Object.values(value)) freeze(child, seen); return Object.freeze(value); }
function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha256(cjson({ mapKey, tTactic, ctTactic, roster })); }
function sourceSlices(source) {
  const slice = (start, end, label) => { const a = source.indexOf(start), b = source.indexOf(end, a + start.length); gate(a >= 0 && b > a, "SOURCE_SLICE", label); return source.slice(a, b); };
  return { target: slice("let pairs=[];", "const tHold=", "target"), retreat: slice("const near=en.length?", "if(p.routeIdx<p.route.length-1)", "retreat"), utility: slice('if(p.state==="EXECUTE"', "if(sec===18)", "utility"), bomb: slice("if(!planted&&prog>0.4)", "smokes=smokes.map", "bomb"), tactic: slice("const tac={t:tacticT,ct:tacticCT};", "const teamAvg=", "tactic"), aggr: slice("function aggr", "// ── 戰術剋制", "aggr") };
}
function collector() { const events = []; return { events, record(type, payload) { events.push({ schema: SCHEMA, type, ...payload }); } }; }

async function loadApi(source, view) {
  let seen = 0, vite = null; const liveSource = readFileSync(FPS_FILE, "utf8"); const temp = mkdtempSync(join(tmpdir(), `esmo-r44-${view}-`));
  const transforms = [["signature", SIGNATURE, SIGNATURE_R], ["role-fit", POS, POS_R], ["combat focus", S, S_R], ["combat", COMBAT, COMBAT_R], ["defuse opportunity", DEFUSE, DEFUSE_R], ["defuse progress", source.includes(CURRENT_FOCUS) ? CURRENT_FOCUS : HISTORICAL_FOCUS, `${source.includes(CURRENT_FOCUS) ? CURRENT_FOCUS : HISTORICAL_FOCUS}__measure?.record("defuse_progress",{round:rnd+1,sec,playerId:defuser.id,role:defuser.role,rawFocus:Number(defuser.stats.foc),effectiveFocus:persStat(defuser,"foc"),effectiveDecision:persStat(defuser,"dec"),appliedFocus:${source.includes(CURRENT_FOCUS) ? 'persStat(defuser,"foc")' : 'defuser.stats.foc'},before:__r44Before,delta:defuseProg-__r44Before,after:defuseProg});`], ["return", RETURN, RETURN_R], ["export", EXPORT, EXPORT_R]];
  try {
    vite = await createServer({ root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error", cacheDir: join(temp, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, plugins: [{ name: `cs-focus-r44-${view}`, enforce: "pre", transform(code, id) {
      if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null; seen++; gate(code === liveSource, "VITE_SOURCE_MISMATCH", view); let transformed = source;
      const progressReplacement = source.includes(CURRENT_FOCUS)
        ? `const __r44Before=defuseProg;${CURRENT_FOCUS}__measure?.record("defuse_progress",{round:rnd+1,sec,playerId:defuser.id,role:defuser.role,rawFocus:Number(defuser.stats.foc),effectiveFocus:persStat(defuser,"foc"),effectiveDecision:persStat(defuser,"dec"),appliedFocus:persStat(defuser,"foc"),before:__r44Before,delta:defuseProg-__r44Before,after:defuseProg});`
        : `const __r44Before=defuseProg;${HISTORICAL_FOCUS}__measure?.record("defuse_progress",{round:rnd+1,sec,playerId:defuser.id,role:defuser.role,rawFocus:Number(defuser.stats.foc),effectiveFocus:persStat(defuser,"foc"),effectiveDecision:persStat(defuser,"dec"),appliedFocus:defuser.stats.foc,before:__r44Before,delta:defuseProg-__r44Before,after:defuseProg});`;
      const runtimeTransforms = transforms.map(([name, marker, replacement]) => name === "defuse progress" ? [name, marker, progressReplacement] : [name, marker, replacement]);
      for (const [name, marker, replacement] of runtimeTransforms) { gate(occurrences(transformed, marker) === 1, "MARKER_COUNT", `${view}:${name}:${occurrences(transformed, marker)}`); transformed = transformed.replace(marker, replacement); }
      let back = transformed; for (const [name, marker, replacement] of [...runtimeTransforms].reverse()) { gate(occurrences(back, replacement) === 1, "REPLACEMENT_COUNT", `${view}:${name}`); back = back.replace(replacement, marker); } gate(back === source, "NON_REVERSIBLE", view); gate(json(randTokens(transformed)) === json(randTokens(source)), "RNG_TOKEN_SEQUENCE_CHANGED", view); return { code: transformed, map: null };
    } }] });
    const mod = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r44=${view}-${Date.now()}`); gate(seen === 1, "TRANSFORM_LOAD", `${view}:${seen}`); return mod.__CS_FOCUS_R44_TEST_API__;
  } finally { if (vite) await vite.close(); rmSync(temp, { recursive: true, force: true }); }
}

function treatmentRoster(base, targetId, level) { const roster = clone(base), original = base.find((p) => p.id === targetId), target = roster.find((p) => p.id === targetId); gate(original && target, "TARGET_MISSING", targetId); const values = { low: Number(original.stats.foc) - 10, baseline: Number(original.stats.foc), high: Number(original.stats.foc) + 10 }; gate(values.low >= 1 && values.high <= 99, "FOCUS_RANGE", targetId); target.stats.foc = values[level]; return { roster: freeze(roster), value: values[level] }; }
function validateEvents(events, sim, roster, view) {
  const byId = new Map(roster.map((p) => [p.id, p])), progress = events.filter((e) => e.type === "defuse_progress");
  for (const event of progress) { const player = byId.get(event.playerId); gate(player?.side === "ct", "DEFUSE_OWNER", `${view}:${event.playerId}`); const raw = Number(player.stats.foc), effective = expectedEffective(player, "foc"), decision = expectedEffective(player, "dec"), applied = view === "current" ? effective : raw, delta = 0.45 + applied / 250 + decision / 300; gate(event.rawFocus === raw && event.effectiveFocus === effective && event.effectiveDecision === decision && event.appliedFocus === applied, "DEFUSE_READ_PROVENANCE", `${view}:${event.playerId} event=${cjson(event)} expected=${cjson({ raw, effective, decision, applied })}`); gate(Math.abs(event.delta - delta) < 1e-12 && Math.abs(event.after - event.before - event.delta) < 1e-12, "DEFUSE_FORMULA", `${view}:${event.playerId}`); }
  return { progress, completions: (sim.roundHist || []).filter((r) => r.how === "defuse").length };
}
function runArm(api, input, view) { const before = inputDigest(input.mapKey, input.tTactic, input.ctTactic, input.roster); globalThis.__CS_R44_AUDIT__ = null; const off = api.simulateFps(input.mapKey, input.tTactic, input.ctTactic, input.seed, input.roster); const c1 = collector(); globalThis.__CS_R44_AUDIT__ = c1; const on1 = api.simulateFps(input.mapKey, input.tTactic, input.ctTactic, input.seed, input.roster, c1); const c2 = collector(); globalThis.__CS_R44_AUDIT__ = c2; const on2 = api.simulateFps(input.mapKey, input.tTactic, input.ctTactic, input.seed, input.roster, c2); globalThis.__CS_R44_AUDIT__ = null; gate(cjson(off) === cjson(on1) && cjson(on1) === cjson(on2), "INSTRUMENTATION_CHANGED", `${view}:${input.seed}`); gate(cjson(c1.events) === cjson(c2.events), "REPEATED_EVENT_DIGEST", `${view}:${input.seed}`); gate(before === inputDigest(input.mapKey, input.tTactic, input.ctTactic, input.roster), "INPUT_MUTATED", `${view}:${input.seed}`); return { sim: on1, events: c1.events, validation: validateEvents(c1.events, on1, input.roster, view), eventDigest: sha256(cjson(c1.events)), simDigest: sha256(cjson(off)) }; }

async function main() {
  const production = readFileSync(FPS_FILE, "utf8"), historical = csR44R43Source(production), productionHash = sha256(production), historicalHash = sha256(historical);
  gate(productionHash === CS_R44_FOCUS_SOURCE_SHA256, "R44_SOURCE_SHA256", productionHash); gate(historicalHash === CS_R43_ACCURACY_SOURCE_SHA256, "R43_HISTORICAL_SHA256", historicalHash); gate(randTokens(production).length === EXPECTED_RAND_CALLS && json(randTokens(production)) === json(randTokens(historical)), "RNG_PROVENANCE"); gate(occurrences(production, CURRENT_FOCUS) === 1 && occurrences(production, HISTORICAL_FOCUS) === 0, "CURRENT_EFFECTIVE_DEFUSE_READ"); gate(occurrences(historical, HISTORICAL_FOCUS) === 1 && occurrences(historical, CURRENT_FOCUS) === 0, "HISTORICAL_RAW_DEFUSE_READ");
  const changedLines = production.split("\n").map((line, i) => line === historical.split("\n")[i] ? null : i + 1).filter(Boolean); gate(changedLines.length === 1, "PATCH_SCOPE", changedLines.join(",")); gate(production.includes('S("foc")') && production.includes('if(opts.holding)v+=S("pos")*0.05+S("foc")*0.05;'), "EFFECTIVE_COMBAT_HOLDING_READS"); gate(production.includes('persStat(defuser,"dec")'), "EFFECTIVE_DECISION_READ");
  for (const [label, part] of Object.entries(sourceSlices(production))) gate(!["target","retreat","utility","bomb","tactic","aggr"].includes(label) || !part.includes("foc"), "FOCUS_FALSE_CONSUMER", label);
  const currentApi = await loadApi(production, "current"), historicalApi = await loadApi(historical, "historical"), map = currentApi.TACTICS_DB[MAP_KEY], tTactic = freeze(clone(map?.t?.find((x) => x.id === T_TACTIC_ID))), ctTactic = freeze(clone(map?.ct?.find((x) => x.id === CT_TACTIC_ID))), baseline = freeze(clone(currentApi.ROSTER)); gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID && baseline.length === 10, "FIXED_INPUTS"); const targets = baseline.filter((p) => p.side === "ct"); gate(targets.length === 5, "CT_COVERAGE");
  const baselineRows = FIXED_SEEDS.map((seed) => { const input = { mapKey: MAP_KEY, tTactic, ctTactic, roster: baseline, seed }; return { seed, current: runArm(currentApi, input, "current"), historical: runArm(historicalApi, input, "historical") }; });
  const currentProgress = baselineRows.flatMap((row) => row.current.validation.progress), historicalProgress = baselineRows.flatMap((row) => row.historical.validation.progress); gate(currentProgress.length > 0 && historicalProgress.length > 0, "DEFUSE_COVERAGE"); const mismatch = currentProgress.filter((e) => e.effectiveFocus !== e.rawFocus); gate(mismatch.length > 0, "PERSONALITY_MISMATCH_COVERAGE");
  const exposure = Object.fromEntries(targets.map((target) => { const events = baselineRows.flatMap((row) => row.current.events); const combat = events.filter((e) => e.type === "combat" && e.playerId === target.id), holding = combat.filter((e) => e.holding), roleFit = events.filter((e) => e.type === "roleFit" && e.playerId === target.id); return [target.role, { playerId: target.id, combatReads: events.filter((e) => e.type === "combatFocusRead" && e.playerId === target.id).length, combatCalls: combat.length, holdingCalls: holding.length, roleFitReads: roleFit.length, rawRoleFitWeight: roleFit[0]?.focusWeight ?? 0 }]; }));
  const cases = targets.map((target) => { const levels = {}; for (const level of ["low","baseline","high"]) { const treatment = treatmentRoster(baseline, target.id, level), inputBase = { mapKey: MAP_KEY, tTactic, ctTactic, roster: treatment.roster }; const rows = FIXED_SEEDS.map((seed) => ({ seed, current: runArm(currentApi, { ...inputBase, seed }, "current"), historical: runArm(historicalApi, { ...inputBase, seed }, "historical") })); const player = treatment.roster.find((p) => p.id === target.id), effective = currentApi.persStat(player, "foc"), decision = currentApi.persStat(player, "dec"); levels[level] = { rawFocus: treatment.value, effectiveFocus: effective, effectiveDelta: round(0.45 + effective / 250 + decision / 300), rawDelta: round(0.45 + treatment.value / 250 + decision / 300), currentProgress: rows.reduce((n, r) => n + r.current.validation.progress.filter((e) => e.playerId === target.id).reduce((s, e) => s + e.delta, 0), 0), historicalProgress: rows.reduce((n, r) => n + r.historical.validation.progress.filter((e) => e.playerId === target.id).reduce((s, e) => s + e.delta, 0), 0) }; } gate(levels.low.effectiveFocus < levels.baseline.effectiveFocus && levels.baseline.effectiveFocus < levels.high.effectiveFocus, "EFFECTIVE_FOCUS_MONOTONIC", target.role); gate(levels.low.effectiveDelta < levels.baseline.effectiveDelta && levels.baseline.effectiveDelta < levels.high.effectiveDelta, "DEFUSE_DELTA_MONOTONIC", target.role); return { role: target.role, playerId: target.id, personality: target.personality, levels }; });
  const currentByKey = new Map(currentProgress.map((e) => [`${e.round}|${e.sec}|${e.playerId}`, e])), cross = { comparable: 0, changed: 0, positive: 0, negative: 0, neutral: 0 }; for (const old of historicalProgress) { const cur = currentByKey.get(`${old.round}|${old.sec}|${old.playerId}`); if (!cur) continue; cross.comparable++; const d = cur.delta - old.delta; if (Math.abs(d) < 1e-12) cross.neutral++; else if (d > 0) { cross.changed++; cross.positive++; } else { cross.changed++; cross.negative++; } if (cur.effectiveFocus > cur.rawFocus) gate(d > 0, "EFFECTIVE_DIRECTION", cur.playerId); if (cur.effectiveFocus < cur.rawFocus) gate(d < 0, "EFFECTIVE_DIRECTION", cur.playerId); }
  gate(cross.comparable > 0 && cross.changed > 0, "SEMANTIC_PATCH_EFFECT", cjson(cross));
  const suite = { schema: SCHEMA, framework: "R22-local-causal-v1", productionHash, historicalHash, seedSetSha256: SEED_SET_SHA256, rngCallSites: EXPECTED_RAND_CALLS, changedLines, semantic: { raw: "role-fit source stat", effective: "personality-adjusted live execution", holding: "effective Focus", defuse: "effective Focus after proximity/uncontested gate", decision: "effective Decision cofactor", newBranches: false }, exposure, cases, baselineCoverage: { currentProgress: currentProgress.length, historicalProgress: historicalProgress.length, cross }, deterministic: true, historicalRebaseline: false };
  const digest = sha256(cjson(suite)); console.log(`schema: ${SCHEMA}`); console.log(`productionSourceSha256: ${productionHash}`); console.log(`historicalR43SourceSha256: ${historicalHash}`); console.log(`changedLines: ${changedLines.join(",")}`); console.log(`baseline defuse progress current/historical: ${currentProgress.length}/${historicalProgress.length}`); console.log(`crossView: ${cjson(cross)}`); console.log(`exposure: ${cjson(exposure)}`); console.log(`suiteDigest: ${digest}`); console.log("semantic patch: one live defuse raw Focus -> effective Focus read; coefficient/RNG/role mapping unchanged"); console.log("Focus calibration: deferred until semantic ownership is consumed by a separate pilot"); console.log("CS Focus Semantic Correction Readiness R44: PASS"); gate(digest === EXPECTED_SUITE_DIGEST, "SUITE_DIGEST", `expected=${EXPECTED_SUITE_DIGEST} actual=${digest}`);
}
main().catch((error) => { console.error(`CS Focus Semantic Correction Readiness R44: FAIL ${error?.stack || error}`); process.exitCode = 1; });
