#!/usr/bin/env node
// R49: separate local-causal measurement for the six R47/R48 CS gameplay consumers.
// Memory-only instrumentation; no production write, RNG, scenario, or second consumer.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { changedSeedSummary, clampSummary, monotonicity, pairedEffect, thresholdCrossing } from "./cs_calibration_measurement.mjs";
import { CS_R47_IDENTITY_SOURCE_SHA256, csR48R47Source } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const MAP_KEY = "inferno";
const T_TACTIC_ID = "t_aexec";
const CT_TACTIC_ID = "c_std";
const EVENT_TYPES = new Set(["mapaware", "mapaware_action", "adaptability", "tactical", "comms", "leadership", "synergy"]);
const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const PAIR_MARKER = "let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);const visibleCandidate=d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes);const mapAwareT=mapAwareCanReadVisibleCandidate(tp,d,visibleCandidate);const mapAwareCT=mapAwareCanReadVisibleCandidate(cp,d,visibleCandidate);if(visibleCandidate&&(mapAwareT||mapAwareCT))pairs.push([tp,cp,d,mapAwareT,mapAwareCT]);}));";
const PAIR_REPLACEMENT = [
  "let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{",
  "const d=dist(tp.pos,cp.pos);",
  "const visibleCandidate=d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes);",
  "const mapAwareT=mapAwareCanReadVisibleCandidate(tp,d,visibleCandidate);",
  "const mapAwareCT=mapAwareCanReadVisibleCandidate(cp,d,visibleCandidate);",
  "__measure?.record(\"mapaware\",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,visibleCandidate,tRead:mapAwareT,ctRead:mapAwareCT,tVis:persStat(tp,\"vis\"),ctVis:persStat(cp,\"vis\"),tReadLimit:MAPAWARE_BASE_RANGE+persStat(tp,\"vis\")*MAPAWARE_VIS_RANGE,ctReadLimit:MAPAWARE_BASE_RANGE+persStat(cp,\"vis\")*MAPAWARE_VIS_RANGE});",
  "if(visibleCandidate&&(mapAwareT||mapAwareCT))pairs.push([tp,cp,d,mapAwareT,mapAwareCT]);}));",
].join("");
const ADAPT_MARKER = "const adaptiveGoal=adaptiveRouteGoal(p,target,N);";
const ADAPT_REPLACEMENT = `${ADAPT_MARKER}__measure?.record("adaptability",{round:rnd+1,sec,playerId:p.id,role:p.role,hp:p.hp,adp:persStat(p,"adp"),opportunity:true,action:Boolean(adaptiveGoal)});`;
const ROUTE_MARKER = "const routeKeys=leadershipRouteKeys(c,tactic,tr,RKF,RS);";
const ROUTE_REPLACEMENT = `${ROUTE_MARKER}const __r49Leader=RS.find(q=>q.side===c.side&&q.role==="igl"&&!q.dead);__measure?.record("tactical",{round:rnd+1,sec:0,playerId:c.id,side:c.side,role:c.role,tac:persStat(c,"tac"),site:tactic.site,route:routeKeys.join("|"),opportunity:Boolean(c.role==="igl"&&tr[c.role]),action:Boolean(c.role==="igl"&&persStat(c,"tac")>=TACTICAL_EXECUTION_THRESHOLD&&tr[c.role])});__measure?.record("leadership",{round:rnd+1,sec:0,playerId:c.id,side:c.side,role:c.role,leaderId:__r49Leader?.id??null,leaderRole:__r49Leader?.role??null,leaderLed:__r49Leader?persStat(__r49Leader,"led"):null,opportunity:Boolean(c.role!=="igl"&&__r49Leader&&tr[__r49Leader.role]),action:Boolean(c.role!=="igl"&&__r49Leader&&persStat(__r49Leader,"led")>=LEADERSHIP_EXECUTION_THRESHOLD&&tr[__r49Leader.role]&&routeKeys.join("|")===tr[__r49Leader.role].join("|"))});`;
const COMMS_MARKER = "const handoffReceiver=applyCommsHandoff(spotter,tp,ps,walls);";
const COMMS_REPLACEMENT = `${COMMS_MARKER}__measure?.record("comms",{round:rnd+1,sec,senderId:spotter.id,senderRole:spotter.role,senderCom:persStat(spotter,"com"),receiverId:handoffReceiver?.id??null,receiverRole:handoffReceiver?.role??null,opportunity:true,action:Boolean(handoffReceiver)});`;
const MAP_ACTION_MARKER = "const attackerMapAware=tw?mapAwareT:mapAwareCT;if(!attackerMapAware)continue;";
const MAP_ACTION_REPLACEMENT = `${MAP_ACTION_MARKER}__measure?.record("mapaware_action",{round:rnd+1,sec,attackerId:at.id,attackerRole:at.role,attackerVis:persStat(at,"vis"),distance:d,action:true});`;
const SYNERGY_MARKER = "const synergyReady=Boolean(synergyPartner&&Math.max(persStat(at,\"coo\"),persStat(synergyPartner,\"coo\"))>=SYNERGY_TRADE_THRESHOLD);";
const SYNERGY_REPLACEMENT = `${SYNERGY_MARKER}__measure?.record("synergy",{round:rnd+1,sec,attackerId:at.id,attackerRole:at.role,partnerId:synergyPartner?.id??null,partnerRole:synergyPartner?.role??null,attackerCoo:persStat(at,"coo"),partnerCoo:synergyPartner?persStat(synergyPartner,"coo"):null,opportunity:Boolean(synergyPartner),action:synergyReady});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_R49_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER, TACTICS_DB: __FPS3D_MODULE.TACTICS_DB, persStat: __FPS3D_MODULE.persStat,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_R49_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["mapaware opportunity", PAIR_MARKER, PAIR_REPLACEMENT],
  ["adaptability opportunity", ADAPT_MARKER, ADAPT_REPLACEMENT],
  ["route measurements", ROUTE_MARKER, ROUTE_REPLACEMENT],
  ["comms handoff", COMMS_MARKER, COMMS_REPLACEMENT],
  ["mapaware action", MAP_ACTION_MARKER, MAP_ACTION_REPLACEMENT],
  ["synergy conversion", SYNERGY_MARKER, SYNERGY_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

const TARGETS = Object.freeze({
  mapAware: Object.freeze({ key: "vis", primary: "t3", targets: ["t1", "t2", "t3", "t4", "t5"], roles: ["entry", "rifler", "awp", "lurker", "igl"], delta: 10, threshold: null }),
  adaptability: Object.freeze({ key: "adp", primary: "t4", targets: ["t1", "t2", "t3", "t4", "t5"], roles: ["entry", "rifler", "awp", "lurker", "igl"], delta: 10, threshold: 80 }),
  tactical: Object.freeze({ key: "tac", primary: "ct1", targets: ["ct1"], roles: ["igl"], delta: 8, threshold: 90 }),
  comms: Object.freeze({ key: "com", primary: "ct5", targets: ["ct1", "ct2", "ct3", "ct4", "ct5"], roles: ["igl", "awp", "rifler", "entry", "support"], delta: 8, threshold: 88 }),
  leadership: Object.freeze({ key: "led", primary: "ct1", targets: ["ct1"], roles: ["igl"], delta: 8, threshold: 90 }),
  synergy: Object.freeze({ key: "coo", primary: "ct5", targets: ["ct5"], roles: ["support"], delta: 8, threshold: 90 }),
});

function gate(ok, code, detail = "") { if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`); }
function itemArg() {
  const args = process.argv.filter((item) => item.startsWith("--item="));
  gate(args.length === 1, "ITEM_ARG_REQUIRED", "run one R49 item at a time");
  const item = args[0].slice("--item=".length);
  gate(Object.prototype.hasOwnProperty.call(TARGETS, item), "UNKNOWN_ITEM", item);
  return item;
}
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return JSON.stringify(value); }
function clone(value) { return structuredClone(value); }
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value); for (const child of Object.values(value)) freeze(child, seen); return Object.freeze(value);
}
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }
function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha(json({ mapKey, tTactic, ctTactic, roster })); }
function createCollector() {
  const events = [];
  return { events, record(type, payload) {
    gate(EVENT_TYPES.has(type), "UNKNOWN_EVENT", type);
    gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD", type);
    for (const [key, value] of Object.entries(payload)) gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", `${type}:${key}`);
    events.push(Object.freeze({ schema: "CsGameplayMeasurementEvent.v1", type, ...payload }));
  } };
}
function validateEvents(events) {
  for (const event of events) {
    gate(event.schema === "CsGameplayMeasurementEvent.v1", "EVENT_SCHEMA");
    gate(EVENT_TYPES.has(event.type), "EVENT_TYPE", event.type);
    if (event.type === "mapaware") gate(typeof event.visibleCandidate === "boolean" && typeof event.tRead === "boolean" && typeof event.ctRead === "boolean" && Number.isFinite(event.distance), "MAPAWARE_SHAPE");
    if (event.type === "mapaware_action") gate(typeof event.attackerId === "string" && typeof event.action === "boolean" && Number.isFinite(event.distance), "MAPAWARE_ACTION_SHAPE");
    if (event.type === "adaptability") gate(event.opportunity === true && typeof event.action === "boolean" && Number.isFinite(event.hp) && Number.isFinite(event.adp), "ADAPTABILITY_SHAPE");
    if (event.type === "tactical") gate(typeof event.route === "string" && typeof event.opportunity === "boolean" && typeof event.action === "boolean", "TACTICAL_SHAPE");
    if (event.type === "comms") gate(typeof event.senderId === "string" && typeof event.action === "boolean" && event.opportunity === true, "COMMS_SHAPE");
    if (event.type === "leadership") gate(typeof event.playerId === "string" && typeof event.action === "boolean" && typeof event.opportunity === "boolean", "LEADERSHIP_SHAPE");
    if (event.type === "synergy") gate(typeof event.attackerId === "string" && typeof event.opportunity === "boolean" && typeof event.action === "boolean", "SYNERGY_SHAPE");
  }
  return events;
}
function targetMapEvent(event, targetId) { return event.tPlayerId === targetId || event.cPlayerId === targetId; }
function summarize(events, item, targetId) {
  if (item === "mapAware") {
    const all = events.filter((event) => event.type === "mapaware" && targetMapEvent(event, targetId));
    const reads = all.filter((event) => event.visibleCandidate && ((event.tPlayerId === targetId && event.tRead) || (event.cPlayerId === targetId && event.ctRead)));
    const admissions = all.filter((event) => event.visibleCandidate && (event.tRead || event.ctRead));
    const actions = events.filter((event) => event.type === "mapaware_action" && event.attackerId === targetId);
    const limits = all.map((event) => event.tPlayerId === targetId ? event.tReadLimit : event.ctReadLimit);
    return { opportunity: all.filter((event) => event.visibleCandidate).length, reads: reads.length, admissions: admissions.length, readLimit: limits.length ? Math.max(...limits) : 0, actions: actions.length, conversion: reads.length ? actions.length / reads.length : 0, role: [...new Set(actions.map((event) => event.attackerRole))].sort() };
  }
  if (item === "adaptability") {
    const rows = events.filter((event) => event.type === "adaptability" && event.playerId === targetId);
    return { opportunity: rows.length, actions: rows.filter((event) => event.action).length, conversion: rows.length ? rows.filter((event) => event.action).length / rows.length : 0, role: [...new Set(rows.map((event) => event.role))].sort() };
  }
  if (item === "tactical") {
    const rows = events.filter((event) => event.type === "tactical" && event.playerId === targetId && event.role === "igl");
    return { opportunity: rows.filter((event) => event.opportunity).length, actions: rows.filter((event) => event.action).length, conversion: rows.filter((event) => event.opportunity).length ? rows.filter((event) => event.action).length / rows.filter((event) => event.opportunity).length : 0, role: [...new Set(rows.map((event) => event.role))].sort() };
  }
  if (item === "comms") {
    const rows = events.filter((event) => event.type === "comms" && event.senderId === targetId);
    return { opportunity: rows.length, actions: rows.filter((event) => event.action).length, conversion: rows.length ? rows.filter((event) => event.action).length / rows.length : 0, role: [...new Set(rows.flatMap((event) => [event.senderRole, event.receiverRole].filter(Boolean)))].sort(), receiverRoles: [...new Set(rows.map((event) => event.receiverRole).filter(Boolean))].sort() };
  }
  if (item === "leadership") {
    const rows = events.filter((event) => event.type === "leadership" && event.leaderId === targetId && event.playerId !== targetId);
    return { opportunity: rows.filter((event) => event.opportunity).length, actions: rows.filter((event) => event.action).length, conversion: rows.filter((event) => event.opportunity).length ? rows.filter((event) => event.action).length / rows.filter((event) => event.opportunity).length : 0, role: [...new Set(rows.map((event) => event.role))].sort() };
  }
  const rows = events.filter((event) => event.type === "synergy" && (event.attackerId === targetId || event.partnerId === targetId));
  return { opportunity: rows.filter((event) => event.opportunity).length, actions: rows.filter((event) => event.action).length, conversion: rows.filter((event) => event.opportunity).length ? rows.filter((event) => event.action).length / rows.filter((event) => event.opportunity).length : 0, role: [...new Set(rows.flatMap((event) => [event.attackerRole, event.partnerRole].filter(Boolean)))].sort(), partnerRoles: [...new Set(rows.map((event) => event.partnerRole).filter(Boolean))].sort() };
}
function directLevels(api, baseline, targetId, key, delta) {
  const original = baseline.find((player) => player.id === targetId);
  gate(original, "TARGET_MISSING", targetId);
  const values = { low: original.stats[key] - delta, baseline: original.stats[key], high: original.stats[key] + delta };
  for (const value of Object.values(values)) gate(value >= 1 && value <= 99, "TREATMENT_CLAMPED", `${targetId}/${key}/${value}`);
  return Object.fromEntries(Object.entries(values).map(([level, raw]) => [level, { raw, effective: api.persStat({ ...original, stats: { ...original.stats, [key]: raw } }, key) }]));
}
function treatmentRoster(baseline, targetId, key, level, delta) {
  const next = clone(baseline), original = baseline.find((player) => player.id === targetId), target = next.find((player) => player.id === targetId);
  gate(original && target, "TARGET_MISSING", targetId);
  const value = { low: original.stats[key] - delta, baseline: original.stats[key], high: original.stats[key] + delta }[level];
  gate(value >= 1 && value <= 99, "TREATMENT_CLAMPED", `${targetId}/${key}/${level}`); target.stats[key] = value;
  for (const candidate of next) {
    const before = baseline.find((player) => player.id === candidate.id); gate(before, "ROSTER_PLAYER_MISSING", candidate.id);
    if (candidate.id === targetId) {
      const a = { ...before, stats: { ...before.stats } }, b = { ...candidate, stats: { ...candidate.stats } }; delete a.stats[key]; delete b.stats[key]; gate(json(a) === json(b), "TREATMENT_NON_TARGET_MUTATION", `${targetId}/${key}`);
    } else gate(json(candidate) === json(before), "TREATMENT_OTHER_MUTATION", candidate.id);
  }
  return freeze(next);
}
function metric(rows, key) {
  const values = level => rows[level].map((row) => row.metrics[key]);
  return { monotonicity: monotonicity(values("low"), values("baseline"), values("high")), lowBaseline: pairedEffect(values("low"), values("baseline")), highBaseline: pairedEffect(values("high"), values("baseline")), lowHigh: pairedEffect(values("low"), values("high")) };
}
function digestRows(rows) { return sha(json(Object.fromEntries(Object.entries(rows).map(([level, levelRows]) => [level, levelRows.map((row) => ({ seed: row.seed, sim: row.strictSimDigest, event: row.eventDigest }))])))); }
function digestRoleRows(rows) { return sha(json(Object.fromEntries(Object.entries(rows).map(([targetId, targetRows]) => [targetId, targetRows.map((row) => ({ seed: row.seed, event: row.eventDigest }))])))); }
async function loadApi(currentSource, liveSource) {
  let seen = 0; const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-r49-measurement-")); let vite = null;
  try {
    vite = await createServer({ root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error", cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, plugins: [{ name: "cs-gameplay-r49-memory", enforce: "pre", transform(code, id) {
      if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
      seen += 1; gate(code === liveSource, "VITE_SOURCE_MISMATCH"); let transformed = currentSource;
      for (const [name, marker, replacement] of TRANSFORMS) { gate(transformed.split(marker).length - 1 === 1, "TRANSFORM_MARKER_COUNT", name); transformed = transformed.replace(marker, replacement); }
      let roundTrip = transformed; for (const [, marker, replacement] of [...TRANSFORMS].reverse()) { gate(roundTrip.split(replacement).length - 1 === 1, "TRANSFORM_REPLACEMENT_COUNT"); roundTrip = roundTrip.replace(replacement, marker); }
      gate(roundTrip === currentSource, "TRANSFORM_NOT_REVERSIBLE"); gate(randTokens(transformed).length === randTokens(currentSource).length, "RNG_TOKEN_COUNT_CHANGED"); return { code: transformed, map: null };
    } }] });
    const loaded = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r49=measurement`); gate(seen === 1, "TRANSFORM_LOAD_COUNT", String(seen)); return loaded.__CS_R49_TEST_API__;
  } finally { if (vite) await vite.close(); rmSync(tempRoot, { recursive: true, force: true }); }
}
function runArm(api, mapKey, tTactic, ctTactic, seed, roster, item, targetId, key) {
  const before = inputDigest(mapKey, tTactic, ctTactic, roster), target = roster.find((player) => player.id === targetId);
  const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const collector1 = createCollector(), on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector1);
  const collector2 = createCollector(), on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector2);
  gate(json(off) === json(on1) && json(off) === json(on2), "INSTRUMENTATION_CHANGED_SIM", `${item}/${targetId}/${seed}`);
  const events1 = validateEvents(collector1.events), events2 = validateEvents(collector2.events); gate(json(events1) === json(events2), "EVENT_NON_DETERMINISTIC", `${item}/${targetId}/${seed}`); gate(before === inputDigest(mapKey, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", `${item}/${targetId}/${seed}`);
  return { seed, strictSimDigest: sha(json(off)), eventDigest: sha(json(events1)), raw: target.stats[key], effective: api.persStat(target, key), metrics: summarize(events1, item, targetId) };
}
function primaryRows(api, map, tTactic, ctTactic, baseline, item, spec) {
  return Object.fromEntries(["low", "baseline", "high"].map((level) => [level, FIXED_SEEDS.map((seed) => runArm(api, MAP_KEY, tTactic, ctTactic, seed, level === "baseline" ? baseline : treatmentRoster(baseline, spec.primary, spec.key, level, spec.delta), item, spec.primary, spec.key))]));
}
function roleBaselineRows(api, map, tTactic, ctTactic, baseline, item, spec, primary) {
  return Object.fromEntries(spec.targets.map((targetId) => [targetId, targetId === spec.primary
    ? primary.baseline
    : FIXED_SEEDS.map((seed) => runArm(api, MAP_KEY, tTactic, ctTactic, seed, baseline, item, targetId, spec.key))]));
}
function summarizeRoleCoverage(rows) {
  return Object.fromEntries(Object.entries(rows).map(([targetId, targetRows]) => {
    const totals = targetRows.reduce((acc, row) => { acc.opportunity += row.metrics.opportunity; acc.actions += row.metrics.actions; for (const role of row.metrics.role || []) acc.roles.add(role); for (const role of row.metrics.receiverRoles || []) acc.receiverRoles.add(role); for (const role of row.metrics.partnerRoles || []) acc.partnerRoles.add(role); return acc; }, { opportunity: 0, actions: 0, roles: new Set(), receiverRoles: new Set(), partnerRoles: new Set() });
    return [targetId, { opportunity: totals.opportunity, actions: totals.actions, conversion: totals.opportunity ? totals.actions / totals.opportunity : 0, observedRoles: [...totals.roles].sort(), receiverRoles: [...totals.receiverRoles].sort(), partnerRoles: [...totals.partnerRoles].sort() }];
  }));
}
function readiness(item, primary, roleCoverage, spec, direct, localMetric, threshold) {
  const primaryOpportunity = primary.baseline.reduce((sum, row) => sum + row.metrics.opportunity, 0);
  const primaryActions = primary.baseline.reduce((sum, row) => sum + row.metrics.actions, 0);
  const coveredTargets = Object.values(roleCoverage).filter((row) => row.opportunity > 0).length;
  const fullRoleCoverage = coveredTargets >= spec.targets.length;
  const directPass = direct.effective.monotonicity.strictMajority, localPass = localMetric.monotonicity.strictMajority;
  const conversionPass = primary.baseline.some((row) => row.metrics.opportunity > 0 && row.metrics.actions > 0);
  if (!primaryOpportunity || !primaryActions || !directPass) return { status: "Deferred", reason: "insufficient primary Level 2/3 or direct monotonic evidence", coveredTargets, requiredTargets: spec.targets.length };
  const boundaries = [];
  if (!fullRoleCoverage) boundaries.push("applicable-role coverage incomplete");
  if (!localPass) boundaries.push(item === "mapAware" ? "Level 2 read-limit/local seed direction is path amplified" : "immediate conversion seed direction is not strict-majority");
  if (threshold?.crossed) boundaries.push("threshold dominated; second consumer or threshold-aware pilot required");
  if (boundaries.length) return { status: threshold?.crossed || !localPass ? "Measurement Ready / Deferred" : "Measurement Ready", reason: boundaries.join("; "), coveredTargets, requiredTargets: spec.targets.length };
  return { status: "Calibration Ready - Limited", reason: conversionPass ? "Level 1-3 local causal evidence with role coverage" : "conversion evidence is sparse", coveredTargets, requiredTargets: spec.targets.length };
}
async function main() {
  const selectedItem = itemArg();
  const liveSource = readFileSync(FPS_FILE, "utf8"), historicalR47 = csR48R47Source(liveSource);
  gate(sha(historicalR47) === CS_R47_IDENTITY_SOURCE_SHA256, "R47_HISTORICAL_SOURCE", sha(historicalR47)); gate(randTokens(liveSource).length === 21, "BASELINE_RNG_CALL_SITES", String(randTokens(liveSource).length));
  for (const marker of ["mapAwareCanReadVisibleCandidate", "adaptiveRouteGoal", "leadershipRouteKeys", "applyCommsHandoff", "synergyTradeCandidate"]) gate(liveSource.includes(marker), "PRODUCTION_CONSUMER_MISSING", marker);
  const api = await loadApi(liveSource, liveSource); gate(typeof api?.simulateFps === "function" && Array.isArray(api.ROSTER) && typeof api.persStat === "function", "SIMULATOR_API_MISSING");
  const map = api.TACTICS_DB[MAP_KEY], tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID))), ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID))), baseline = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID && baseline.length === 10, "FIXED_INPUTS");
  const results = {};
  for (const [item, spec] of Object.entries(TARGETS).filter(([name]) => name === selectedItem)) {
    const primary = primaryRows(api, map, tTactic, ctTactic, baseline, item, spec), roleRows = roleBaselineRows(api, map, tTactic, ctTactic, baseline, item, spec, primary), direct = { raw: metric({ low: primary.low.map((row) => ({ metrics: { value: row.raw } })), baseline: primary.baseline.map((row) => ({ metrics: { value: row.raw } })), high: primary.high.map((row) => ({ metrics: { value: row.raw } })) }, "value"), effective: metric({ low: primary.low.map((row) => ({ metrics: { value: row.effective } })), baseline: primary.baseline.map((row) => ({ metrics: { value: row.effective } })), high: primary.high.map((row) => ({ metrics: { value: row.effective } })) }, "value") };
    const consumerMetric = metric(primary, "conversion"), opportunityMetric = metric(primary, "opportunity"), actionMetric = metric(primary, "actions"), localMetric = item === "mapAware" ? metric(primary, "readLimit") : consumerMetric;
    const threshold = spec.threshold === null ? null : thresholdCrossing([primary.low[0].raw, primary.baseline[0].raw, primary.high[0].raw], spec.threshold, "up");
    const levels = { low: primary.low[0].raw, baseline: primary.baseline[0].raw, high: primary.high[0].raw }, effectiveLevels = { low: primary.low[0].effective, baseline: primary.baseline[0].effective, high: primary.high[0].effective };
    const roleCoverage = summarizeRoleCoverage(roleRows);
    const changed = changedSeedSummary(primary.low.filter((row, index) => row.strictSimDigest !== primary.baseline[index].strictSimDigest).length + primary.high.filter((row, index) => row.strictSimDigest !== primary.baseline[index].strictSimDigest).length, FIXED_SEEDS.length * 2);
    results[item] = { key: spec.key, primaryTarget: spec.primary, primaryRole: baseline.find((player) => player.id === spec.primary)?.role, levels, effectiveLevels, direct, opportunity: opportunityMetric, action: actionMetric, conversion: consumerMetric, local: localMetric, threshold, clamp: { raw: clampSummary(Object.values(levels), 1, 99), effective: clampSummary(Object.values(effectiveLevels), 1, 99) }, roleCoverage, roleDigest: digestRoleRows(roleRows), primaryDigest: digestRows(primary), changedSeeds: changed, readiness: readiness(item, primary, roleCoverage, spec, direct, localMetric, threshold), baselineTotals: { opportunity: primary.baseline.reduce((sum, row) => sum + row.metrics.opportunity, 0), actions: primary.baseline.reduce((sum, row) => sum + row.metrics.actions, 0), conversion: primary.baseline.reduce((sum, row) => sum + row.metrics.actions, 0) / Math.max(1, primary.baseline.reduce((sum, row) => sum + row.metrics.opportunity, 0)), roleEvidence: [...new Set(primary.baseline.flatMap((row) => row.metrics.role || []))].sort() } };
    gate(results[item].baselineTotals.opportunity > 0, "OPPORTUNITY_COVERAGE", item);
    gate(results[item].baselineTotals.actions > 0, "ACTION_COVERAGE", item);
  }
  const suite = { schema: "CsGameplayMeasurementSuite.v1", mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID, seeds: FIXED_SEEDS, rngCallSites: randTokens(liveSource).length, productionChanged: false, newRng: false, scenarioChanged: false, nineCalibrationChanged: false, items: results, evidenceBoundary: "six separate R47/R48 consumers; Level 4 is secondary" };
  const suiteDigest = sha(json(suite)); gate(suiteDigest === sha(json(suite)), "REPEATED_SUITE_DIGEST");
  console.log(`schema: ${suite.schema}`); console.log(`item: ${selectedItem}; fixed seeds: ${FIXED_SEEDS.length}; scenario: ${MAP_KEY}/${T_TACTIC_ID}/${CT_TACTIC_ID}`); console.log(`RNG call sites: ${suite.rngCallSites}; new RNG: false`);
  for (const [item, result] of Object.entries(results)) console.log(`${item}: ${json({ primaryTarget: result.primaryTarget, primaryRole: result.primaryRole, levels: result.levels, effectiveLevels: result.effectiveLevels, baseline: result.baselineTotals, direct: result.direct, opportunity: result.opportunity, action: result.action, conversion: result.conversion, local: result.local, threshold: result.threshold, clamp: result.clamp, changedSeeds: result.changedSeeds, roleCoverage: result.roleCoverage, primaryDigest: result.primaryDigest, roleDigest: result.roleDigest, readiness: result.readiness })}`);
  console.log(`suiteDigest: ${suiteDigest}`); console.log("R47/R48 consumers measured separately; R22 Level 1/2/3/4 boundary preserved"); console.log("CS Gameplay Measurement R49: PASS");
}
main().catch((error) => { console.error(`CS Gameplay Measurement R49: FAIL ${error?.stack || error}`); process.exitCode = 1; });
