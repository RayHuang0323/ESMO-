#!/usr/bin/env node
// R27: CS Decision Semantic Audit / Minimal Correction.
// Production behavior is observed through exact, reversible Vite memory hooks.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  CS_R26_DECISION_SOURCE_SHA256,
  CS_R27_DECISION_SOURCE_SHA256,
  csR27R26Source,
} from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const PLAYER_MODEL_FILE = resolve(ROOT, "src/data/playerModel.js");
const PREP_FILE = resolve(ROOT, "src/battle/fps/csPrepData.js");
const EVENT_SCHEMA = "CsDecisionSemanticAuditEvent.v1";
const SUITE_SCHEMA = "CsDecisionSemanticAuditSuite.v1";
const EXPECTED_SUITE_DIGEST = "fd93059811d17401bc66b7a5421e18bcc15aec564a6b28068dd45536a8fcd324";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const MAP_KEY = "inferno";
const T_TACTIC_ID = "t_aexec";
const CT_TACTIC_ID = "c_std";
const EXPECTED_RAND_CALLS = 21;

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const DEFUSE_OPPORTUNITY_MARKER = "        const contested=defuser&&defuseAliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));";
const DEFUSE_OPPORTUNITY_REPLACEMENT = [
  DEFUSE_OPPORTUNITY_MARKER,
  '        __measure?.record("defuse_opportunity",{round:rnd+1,sec,c4t,progressBefore:defuseProg,proximity:Boolean(defuser),defuserId:defuser?.id||"",defuserRole:defuser?.role||"",personality:defuser?.personality||"",rawDecision:defuser?.stats?Number(defuser.stats.dec):null,contested:Boolean(contested),progressGate:Boolean(defuser&&!contested)});',
].join("\n");
const R26_RAW_DEFUSE_MARKER = '          defuseProg+=defuser.stats?(0.45+defuser.stats.foc/250+defuser.stats.dec/300):0.7;';
const R27_EFFECTIVE_DEFUSE_MARKER = '          defuseProg+=defuser.stats?(0.45+defuser.stats.foc/250+persStat(defuser,"dec")/300):0.7;';
const R26_RAW_DEFUSE_REPLACEMENT = [
  '          const __r27Before=defuseProg,__r27RawFocus=defuser.stats?Number(defuser.stats.foc):null,__r27RawDecision=defuser.stats?Number(defuser.stats.dec):null,__r27EffectiveDecision=defuser.stats?persStat(defuser,"dec"):null;',
  R26_RAW_DEFUSE_MARKER,
  '          __measure?.record("defuse_progress",{round:rnd+1,sec,playerId:defuser.id,role:defuser.role,personality:defuser.personality||"",rawFocus:__r27RawFocus,rawDecision:__r27RawDecision,effectiveDecision:__r27EffectiveDecision,appliedDecision:__r27RawDecision,before:__r27Before,delta:defuseProg-__r27Before,after:defuseProg,c4t});',
].join("\n");
const R27_EFFECTIVE_DEFUSE_REPLACEMENT = [
  '          const __r27Before=defuseProg,__r27RawFocus=defuser.stats?Number(defuser.stats.foc):null,__r27RawDecision=defuser.stats?Number(defuser.stats.dec):null,__r27EffectiveDecision=defuser.stats?persStat(defuser,"dec"):null;',
  R27_EFFECTIVE_DEFUSE_MARKER,
  '          __measure?.record("defuse_progress",{round:rnd+1,sec,playerId:defuser.id,role:defuser.role,personality:defuser.personality||"",rawFocus:__r27RawFocus,rawDecision:__r27RawDecision,effectiveDecision:__r27EffectiveDecision,appliedDecision:__r27EffectiveDecision,before:__r27Before,delta:defuseProg-__r27Before,after:defuseProg,c4t});',
].join("\n");
const DEFUSE_COMPLETE_MARKER = '        if(defuseProg>=3.5)roundEnd={winner:"ct",how:"defuse"};';
const DEFUSE_COMPLETE_REPLACEMENT = [
  DEFUSE_COMPLETE_MARKER,
  '        if(__measure&&roundEnd?.how==="defuse")__measure.record("defuse_complete",{round:rnd+1,sec,playerId:defuser?.id||"",role:defuser?.role||"",progress:defuseProg,c4t});',
].join("\n");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_DECISION_R27_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB, persStat: __FPS3D_MODULE.persStat,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_DECISION_R27_TEST_API__ };",
].join("\n");

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return JSON.stringify(value); }
function occurrences(text, needle) { return text.split(needle).length - 1; }
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) || []; }
function close(a, b) { return Math.abs(a - b) <= 1e-12; }
function clone(value) { return structuredClone(value); }
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value); Object.freeze(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return value;
}
function sourceSlice(source, start, end, label) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  gate(from >= 0 && to > from, "SOURCE_SLICE", label);
  return source.slice(from, to);
}

function transformsFor(view) {
  const progress = view === "live"
    ? ["effective Decision defuse", R27_EFFECTIVE_DEFUSE_MARKER, R27_EFFECTIVE_DEFUSE_REPLACEMENT]
    : ["raw Decision defuse", R26_RAW_DEFUSE_MARKER, R26_RAW_DEFUSE_REPLACEMENT];
  return Object.freeze([
    ["simulate signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
    ["defuse opportunity", DEFUSE_OPPORTUNITY_MARKER, DEFUSE_OPPORTUNITY_REPLACEMENT],
    progress,
    ["defuse completion", DEFUSE_COMPLETE_MARKER, DEFUSE_COMPLETE_REPLACEMENT],
    ["module return", RETURN_MARKER, RETURN_REPLACEMENT],
    ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
  ]);
}

async function loadApi(currentSource, evidenceSource, view) {
  const transforms = transformsFor(view);
  let transformSeen = 0, restored = false, rngSame = false, vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), `esmo-cs-decision-r27-${view}-`));
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true }, plugins: [{
        name: `cs-decision-r27-${view}-memory-hooks`, enforce: "pre", transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1; gate(code === currentSource, "VITE_SOURCE_MISMATCH", view);
          let transformed = evidenceSource;
          for (const [name, marker, replacement] of transforms) {
            gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", `${view}:${name}`);
            transformed = transformed.replace(marker, replacement);
          }
          let roundTrip = transformed;
          for (const [name, marker, replacement] of [...transforms].reverse()) {
            gate(occurrences(roundTrip, replacement) === 1, "TRANSFORM_REPLACEMENT_COUNT", `${view}:${name}`);
            roundTrip = roundTrip.replace(replacement, marker);
          }
          restored = roundTrip === evidenceSource;
          rngSame = json(randTokens(transformed)) === json(randTokens(evidenceSource));
          gate(restored, "TRANSFORM_NOT_REVERSIBLE", view);
          gate(rngSame, "RNG_TOKEN_SEQUENCE_CHANGED", view);
          return { code: transformed, map: null };
        },
      }],
    });
    const module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r27=${view}-${Date.now()}`);
    gate(transformSeen === 1 && restored && rngSame, "TRANSFORM_LOAD_GATE", view);
    return module.__CS_DECISION_R27_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function collector() {
  const events = [];
  return { events, record(type, payload) { events.push({ schema: EVENT_SCHEMA, type, ...payload }); } };
}

function inputDigest(args) {
  return sha256(json({ mapKey: args.mapKey, tTactic: args.tTactic, ctTactic: args.ctTactic, roster: args.roster }));
}

function expectedEffective(api, player) {
  return api.persStat(player, "dec");
}

function validateEvents(api, events, sim, roster, view, seed) {
  const byId = new Map(roster.map((player) => [player.id, player]));
  const opportunities = new Map(), progress = [], completes = new Map();
  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA, "EVENT_SCHEMA", `${view}:${event.type}`);
    if (event.type === "defuse_opportunity") {
      const key = `${event.round}|${event.sec}`;
      gate(!opportunities.has(key) && event.c4t >= 0 && event.c4t <= 19, "OPPORTUNITY_SHAPE", `${view}:${key}`);
      gate(event.progressGate === (event.proximity && !event.contested), "OPPORTUNITY_GATE", `${view}:${key}`);
      if (event.proximity) {
        const player = byId.get(event.defuserId);
        gate(player?.side === "ct" && player.role === event.defuserRole && player.personality === event.personality,
          "OPPORTUNITY_PLAYER", `${view}:${key}`);
        gate(event.rawDecision === Number(player.stats.dec), "OPPORTUNITY_RAW_DECISION", `${view}:${key}`);
      } else gate(event.defuserId === "" && event.rawDecision === null, "OPPORTUNITY_NO_PLAYER", `${view}:${key}`);
      opportunities.set(key, event);
    } else if (event.type === "defuse_progress") {
      const key = `${event.round}|${event.sec}`, opportunity = opportunities.get(key), player = byId.get(event.playerId);
      gate(opportunity?.progressGate && opportunity.defuserId === event.playerId && player?.side === "ct",
        "PROGRESS_WITHOUT_GATE", `${view}:${key}`);
      const rawDecision = Number(player.stats.dec), effectiveDecision = expectedEffective(api, player);
      const appliedDecision = view === "live" ? effectiveDecision : rawDecision;
      const expectedDelta = 0.45 + Number(player.stats.foc) / 250 + appliedDecision / 300;
      gate(event.rawFocus === Number(player.stats.foc) && event.rawDecision === rawDecision
        && event.effectiveDecision === effectiveDecision && event.appliedDecision === appliedDecision,
      "PROGRESS_DECISION_SOURCE", `${view}:${key}`);
      gate(close(event.delta, expectedDelta) && close(event.after, event.before + event.delta),
        "PROGRESS_FORMULA", `${view}:${key}`);
      progress.push(event);
    } else if (event.type === "defuse_complete") {
      gate(!completes.has(event.round) && event.progress >= 3.5 && byId.get(event.playerId)?.side === "ct",
        "COMPLETE_SHAPE", `${view}:${event.round}`);
      gate(sim.roundHist[event.round - 1]?.how === "defuse", "COMPLETE_RESULT_LINK", `${view}:${event.round}`);
      completes.set(event.round, event);
    } else gate(false, "UNKNOWN_EVENT", event.type);
  }
  return { opportunities: opportunities.size, progress, completes: completes.size };
}

function runArm(api, args, view) {
  const before = inputDigest(args);
  const first = collector(), second = collector();
  const off = api.simulateFps(args.mapKey, args.tTactic, args.ctTactic, args.seed, args.roster);
  const on1 = api.simulateFps(args.mapKey, args.tTactic, args.ctTactic, args.seed, args.roster, first);
  const on2 = api.simulateFps(args.mapKey, args.tTactic, args.ctTactic, args.seed, args.roster, second);
  gate(json(off) === json(on1) && json(on1) === json(on2), "INSTRUMENTATION_CHANGED_SIM", `${view}:${args.seed}`);
  gate(json(first.events) === json(second.events), "AUDIT_NON_DETERMINISTIC", `${view}:${args.seed}`);
  gate(before === inputDigest(args), "SIM_MUTATED_INPUT", `${view}:${args.seed}`);
  const validation = validateEvents(api, first.events, on1, args.roster, view, args.seed);
  return { sim: on1, events: first.events, validation };
}

function progressContext(event) {
  return [event.round, event.sec, event.playerId, event.role, event.personality,
    event.rawFocus, event.rawDecision, event.effectiveDecision, event.c4t];
}

function compareViews(liveArm, historicalArm, seed) {
  const live = liveArm.validation.progress, historical = historicalArm.validation.progress;
  const limit = Math.min(live.length, historical.length);
  let boundary = null;
  for (let index = 0; index < limit; index += 1) {
    gate(json(progressContext(live[index])) === json(progressContext(historical[index])),
      "PRE_BOUNDARY_CONTEXT_DRIFT", `${seed}:${index}`);
    if (live[index].appliedDecision !== historical[index].appliedDecision) {
      gate(close(live[index].before, historical[index].before), "FIRST_BOUNDARY_PROGRESS_DRIFT", `${seed}:${index}`);
      const direction = live[index].effectiveDecision > live[index].rawDecision ? "effective-gain" : "effective-penalty";
      gate((direction === "effective-gain" && live[index].delta > historical[index].delta)
        || (direction === "effective-penalty" && live[index].delta < historical[index].delta),
      "BOUNDARY_DIRECTION", `${seed}:${index}`);
      boundary = Object.freeze({ index, playerId: live[index].playerId, personality: live[index].personality, direction });
      break;
    }
    gate(close(live[index].delta, historical[index].delta) && close(live[index].before, historical[index].before),
      "NEUTRAL_PROGRESS_DRIFT", `${seed}:${index}`);
  }
  if (!boundary) {
    gate(live.length === historical.length, "ZERO_BOUNDARY_PROGRESS_COUNT", String(seed));
    gate(json(liveArm.sim) === json(historicalArm.sim), "ZERO_BOUNDARY_SIM_DRIFT", String(seed));
  }
  return boundary;
}

function verifyStaticSemantics(liveSource, historicalSource) {
  gate(sha256(liveSource) === CS_R27_DECISION_SOURCE_SHA256, "LIVE_SOURCE_SHA256", sha256(liveSource));
  gate(sha256(historicalSource) === CS_R26_DECISION_SOURCE_SHA256, "R26_VIEW_SHA256", sha256(historicalSource));
  gate(json(randTokens(liveSource)) === json(randTokens(historicalSource))
    && randTokens(liveSource).length === EXPECTED_RAND_CALLS, "RNG_CALL_SITES");
  const liveLines = liveSource.split("\n"), historicalLines = historicalSource.split("\n");
  gate(liveLines.length === historicalLines.length, "SOURCE_LINE_COUNT");
  const changedLines = liveLines.map((line, index) => line === historicalLines[index] ? null : index + 1).filter(Boolean);
  gate(json(changedLines) === json([592]), "MINIMAL_PATCH_LINES", json(changedLines));
  gate(occurrences(liveSource, R27_EFFECTIVE_DEFUSE_MARKER) === 1
    && occurrences(liveSource, R26_RAW_DEFUSE_MARKER) === 0, "EFFECTIVE_DEFUSE_SOURCE_GATE");
  gate(occurrences(historicalSource, R26_RAW_DEFUSE_MARKER) === 1
    && occurrences(historicalSource, R27_EFFECTIVE_DEFUSE_MARKER) === 0, "RAW_DEFUSE_HISTORY_GATE");
  gate(liveSource.includes('const role=posSkill(p,rawReflex);') && liveSource.includes('S("dec")*0.04'),
    "ROLE_COMBAT_BOUNDARY");
  const roleFit = sourceSlice(liveSource, "function posSkill", "// 對槍實力", "role fit");
  gate(roleFit.includes("(s[k]||50)") && !roleFit.includes("persStat"), "RAW_ROLE_FIT_GATE");
  const defuserChoice = sourceSlice(liveSource, "const defuser=", "if(defuser&&!contested)", "defuser choice");
  gate(!defuserChoice.includes(".dec") && !defuserChoice.includes("persStat"), "DEFUSER_CHOICE_NON_CONSUMER");

  const playerModel = readFileSync(PLAYER_MODEL_FILE, "utf8"), prep = readFileSync(PREP_FILE, "utf8");
  gate(playerModel.includes('{ key: "decision",     zh: "決策力",   cat: "戰術" }')
    && playerModel.includes('{ key: "tacticalIQ",   zh: "戰術理解", cat: "戰術" }')
    && playerModel.includes('{ key: "focus",        zh: "專注力",   cat: "心理" }')
    && playerModel.includes('{ key: "comms",        zh: "溝通",     cat: "團隊" }'), "PRODUCT_STAT_BOUNDARY");
  gate(playerModel.includes('nerf: ["decision", "focus"]') && playerModel.includes('desc: "敢衝敢打，但容易衝動"')
    && playerModel.includes('boost: ["clutch", "decision"]') && playerModel.includes('desc: "關鍵時刻穩定，但節奏偏慢"'),
  "PRODUCT_PERSONALITY_DECISION_GATE");
  gate(playerModel.includes('name: "戰術研討"') && playerModel.includes('stats: ["tacticalIQ", "decision"]'),
    "PRODUCT_TRAINING_GATE");
  gate(prep.includes('name: "誘敵fake"') && prep.includes('boost: ["decision", "adaptability"]')
    && prep.includes('name: "經濟壓制"') && prep.includes('boost: ["decision", "tacticalIQ"]'),
  "PRODUCT_TACTIC_INTENT_GATE");
  return changedLines;
}

function directProbes(api, roster) {
  const cases = [
    { playerId: "ct4", expectedAdjustment: -4, expectedDirection: "effective-penalty" },
    { playerId: "ct5", expectedAdjustment: 6, expectedDirection: "effective-gain" },
    { playerId: "ct2", expectedAdjustment: 0, expectedDirection: "neutral" },
  ];
  return cases.map((item) => {
    const player = roster.find((candidate) => candidate.id === item.playerId);
    gate(player, "PROBE_PLAYER", item.playerId);
    const rawDecision = Number(player.stats.dec), effectiveDecision = api.persStat(player, "dec");
    const lowMorale = clone(player); lowMorale.morale = 40;
    gate(effectiveDecision - rawDecision === item.expectedAdjustment, "PROBE_ADJUSTMENT", item.playerId);
    gate(api.persStat(lowMorale, "dec") === effectiveDecision, "STATE_DOES_NOT_ADJUST_DECISION", item.playerId);
    const rawDelta = 0.45 + Number(player.stats.foc) / 250 + rawDecision / 300;
    const effectiveDelta = 0.45 + Number(player.stats.foc) / 250 + effectiveDecision / 300;
    const direction = effectiveDelta > rawDelta ? "effective-gain" : effectiveDelta < rawDelta ? "effective-penalty" : "neutral";
    gate(direction === item.expectedDirection, "PROBE_DIRECTION", item.playerId);
    return Object.freeze({ playerId: player.id, role: player.role, personality: player.personality,
      rawDecision, effectiveDecision, adjustment: effectiveDecision - rawDecision,
      rawFocus: Number(player.stats.foc), rawDelta, effectiveDelta, direction });
  });
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN");
  const liveSource = readFileSync(FPS_FILE, "utf8"), historicalSource = csR27R26Source(liveSource);
  const changedLines = verifyStaticSemantics(liveSource, historicalSource);
  const liveApi = await loadApi(liveSource, liveSource, "live");
  const historicalApi = await loadApi(liveSource, historicalSource, "historical");
  for (const api of [liveApi, historicalApi]) {
    gate(typeof api?.simulateFps === "function" && Array.isArray(api?.ROSTER)
      && api?.TACTICS_DB && typeof api?.persStat === "function", "TEST_API_SHAPE");
  }
  const map = liveApi.TACTICS_DB[MAP_KEY];
  const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID)));
  const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID)));
  const roster = freeze(clone(liveApi.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID && roster.length === 10, "SCENARIO_SHAPE");
  const probes = directProbes(liveApi, roster);

  const rows = [], coverage = {
    bombTicks: 0, liveProgressTicks: 0, historicalProgressTicks: 0,
    liveCompletions: 0, historicalCompletions: 0,
    neutralProgress: 0, effectiveGainProgress: 0, effectivePenaltyProgress: 0,
    gainBoundarySeeds: 0, penaltyBoundarySeeds: 0, changedSimulationSeeds: 0,
  };
  for (const seed of FIXED_SEEDS) {
    const args = { mapKey: MAP_KEY, tTactic, ctTactic, seed, roster };
    const liveArm = runArm(liveApi, args, "live"), historicalArm = runArm(historicalApi, args, "historical");
    const boundary = compareViews(liveArm, historicalArm, seed);
    coverage.bombTicks += liveArm.validation.opportunities;
    coverage.liveProgressTicks += liveArm.validation.progress.length;
    coverage.historicalProgressTicks += historicalArm.validation.progress.length;
    coverage.liveCompletions += liveArm.validation.completes;
    coverage.historicalCompletions += historicalArm.validation.completes;
    for (const event of liveArm.validation.progress) {
      if (event.effectiveDecision > event.rawDecision) coverage.effectiveGainProgress += 1;
      else if (event.effectiveDecision < event.rawDecision) coverage.effectivePenaltyProgress += 1;
      else coverage.neutralProgress += 1;
    }
    if (boundary?.direction === "effective-gain") coverage.gainBoundarySeeds += 1;
    if (boundary?.direction === "effective-penalty") coverage.penaltyBoundarySeeds += 1;
    if (json(liveArm.sim) !== json(historicalArm.sim)) coverage.changedSimulationSeeds += 1;
    rows.push({ seed, boundary,
      liveProgressTicks: liveArm.validation.progress.length,
      historicalProgressTicks: historicalArm.validation.progress.length,
      liveSimDigest: sha256(json(liveArm.sim)), historicalSimDigest: sha256(json(historicalArm.sim)),
      liveEventDigest: sha256(json(liveArm.events)), historicalEventDigest: sha256(json(historicalArm.events)) });
  }
  gate(coverage.bombTicks > 0 && coverage.liveProgressTicks > 0 && coverage.liveCompletions > 0,
    "SUITE_DEFUSE_COVERAGE", json(coverage));
  gate(coverage.neutralProgress > 0 && coverage.effectiveGainProgress > 0 && coverage.gainBoundarySeeds > 0,
    "SUITE_SEMANTIC_BOUNDARY", json(coverage));
  const suite = {
    schema: SUITE_SCHEMA, eventSchema: EVENT_SCHEMA,
    liveSourceSha256: CS_R27_DECISION_SOURCE_SHA256,
    historicalSourceSha256: CS_R26_DECISION_SOURCE_SHA256,
    changedLines, rngCallSites: EXPECTED_RAND_CALLS,
    semanticBoundary: {
      raw: "stable roster input and IGL/lurker role-fit aptitude",
      effective: "personality-adjusted live combat and abstract defuse execution",
      state: "morale/condition adjust final combat output, not Decision",
      ownership: "Decision remains a coarse defuse-execution contributor; no new start/stick/abort decision branch",
    },
    overlapBoundary: {
      tacticalIQ: "plan and situation understanding; not current defuse progress",
      focus: "sustained execution; remains an independent raw defuse contributor outside R27 scope",
      comms: "team information and cover coordination; not individual defuse progress",
    },
    scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID },
    seeds: FIXED_SEEDS, probes, coverage, rows,
  };
  const suiteDigest = sha256(json(suite));
  console.log(`schema: ${SUITE_SCHEMA}`);
  console.log(`liveSourceSha256: ${CS_R27_DECISION_SOURCE_SHA256}`);
  console.log(`historicalSourceSha256: ${CS_R26_DECISION_SOURCE_SHA256}`);
  console.log(`minimal patch lines: ${changedLines.join(",")}`);
  console.log(`rand() call sites: ${EXPECTED_RAND_CALLS}`);
  console.log(`simulations: ${FIXED_SEEDS.length * 2 * 3}`);
  console.log(`direct probes: ${json(probes)}`);
  console.log(`coverage: ${json(coverage)}`);
  console.log(`suiteDigest: ${suiteDigest}`);
  gate(EXPECTED_SUITE_DIGEST !== "__CAPTURE_MANUALLY__", "SUITE_NOT_LOCKED", `candidate=${suiteDigest}`);
  gate(suiteDigest === EXPECTED_SUITE_DIGEST, "SUITE_DIGEST", `expected=${EXPECTED_SUITE_DIGEST} actual=${suiteDigest}`);
  console.log("claim boundary: Decision semantics/minimal defuse raw-effective correction only; no balance or new gameplay feature");
  console.log("CS Decision Semantic Audit / Minimal Correction R27: PASS");
}

main().catch((error) => {
  console.error(`CS Decision Semantic Audit / Minimal Correction R27: FAIL ${error?.stack || error}`);
  process.exitCode = 1;
});
