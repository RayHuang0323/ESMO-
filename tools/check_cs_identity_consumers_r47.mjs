#!/usr/bin/env node
// R47：CS MapAware / Adaptability / TacticalIQ 最小 live consumer。
// verifier-first：以 memory transform 觀測既有 simulator hook；不另造 RNG、scenario 或 AI。
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

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
const EVENT_TYPES = new Set([
  "mapaware_opportunity", "mapaware_action", "adaptability_response", "tactical_route",
]);
const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const PAIR_MARKER = "let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);const visibleCandidate=d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes);const mapAwareT=mapAwareCanReadVisibleCandidate(tp,d,visibleCandidate);const mapAwareCT=mapAwareCanReadVisibleCandidate(cp,d,visibleCandidate);if(visibleCandidate&&(mapAwareT||mapAwareCT))pairs.push([tp,cp,d,mapAwareT,mapAwareCT]);}));";
const PAIR_REPLACEMENT = [
  "let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{",
  "const d=dist(tp.pos,cp.pos);",
  "const visibleCandidate=d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes);",
  "const mapAwareT=mapAwareCanReadVisibleCandidate(tp,d,visibleCandidate);",
  "const mapAwareCT=mapAwareCanReadVisibleCandidate(cp,d,visibleCandidate);",
  "__measure?.record(\"mapaware_opportunity\",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,visibleCandidate,tRead:mapAwareT,ctRead:mapAwareCT,tVis:persStat(tp,\"vis\"),ctVis:persStat(cp,\"vis\"),tReadLimit:MAPAWARE_BASE_RANGE+persStat(tp,\"vis\")*MAPAWARE_VIS_RANGE,ctReadLimit:MAPAWARE_BASE_RANGE+persStat(cp,\"vis\")*MAPAWARE_VIS_RANGE});",
  "if(visibleCandidate&&(mapAwareT||mapAwareCT))pairs.push([tp,cp,d,mapAwareT,mapAwareCT]);}));",
].join("");
const ADAPT_MARKER = "const adaptiveGoal=adaptiveRouteGoal(p,target,N);";
const ADAPT_REPLACEMENT = `${ADAPT_MARKER}__measure?.record("adaptability_response",{round:rnd+1,sec,playerId:p.id,hp:p.hp,adp:persStat(p,"adp"),opportunity:true,action:Boolean(adaptiveGoal)});`;
const TACTIC_MARKER = "const routeKeys=tacticalRouteKeys(c,tactic,tr,RKF);";
const TACTIC_REPLACEMENT = `${TACTIC_MARKER}__measure?.record("tactical_route",{round:rnd+1,sec:0,playerId:c.id,side:c.side,role:c.role,tac:persStat(c,"tac"),site:tactic.site,route:routeKeys.join("|"),direct:Boolean(tr[c.role]),executed:c.role==="igl"&&persStat(c,"tac")>=TACTICAL_EXECUTION_THRESHOLD&&Boolean(tr[c.role])});`;
const ACTION_MARKER = "const attackerMapAware=tw?mapAwareT:mapAwareCT;if(!attackerMapAware)continue;";
const ACTION_REPLACEMENT = `${ACTION_MARKER}__measure?.record("mapaware_action",{round:rnd+1,sec,attackerId:at.id,attackerRole:at.role,attackerVis:persStat(at,"vis"),distance:d,action:true});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_R47_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_R47_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["pair admission", PAIR_MARKER, PAIR_REPLACEMENT],
  ["adaptability hook", ADAPT_MARKER, ADAPT_REPLACEMENT],
  ["tactical route hook", TACTIC_MARKER, TACTIC_REPLACEMENT],
  ["mapaware action", ACTION_MARKER, ACTION_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
}
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return JSON.stringify(value); }
function clone(value) { return structuredClone(value); }
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }
function inputDigest(mapKey, tTactic, ctTactic, roster) {
  return sha(json({ mapKey, tTactic, ctTactic, roster }));
}
function createCollector() {
  const events = [];
  return {
    events,
    record(type, payload) {
      gate(EVENT_TYPES.has(type), "UNKNOWN_EVENT", type);
      gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD");
      for (const [key, value] of Object.entries(payload)) {
        gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", `${type}:${key}`);
      }
      events.push(Object.freeze({ schema: "CsIdentityConsumerEvent.v1", type, ...payload }));
    },
  };
}
function validateEvents(events) {
  for (const event of events) {
    gate(event.schema === "CsIdentityConsumerEvent.v1", "EVENT_SCHEMA");
    gate(EVENT_TYPES.has(event.type), "EVENT_TYPE", event.type);
    if (event.type === "mapaware_opportunity") {
      gate(typeof event.visibleCandidate === "boolean", "MAPAWARE_VISIBLE");
      gate(typeof event.tRead === "boolean" && typeof event.ctRead === "boolean", "MAPAWARE_READ");
      gate(Number.isFinite(event.distance) && event.distance >= 0, "MAPAWARE_DISTANCE");
    }
    if (event.type === "adaptability_response") {
      gate(event.opportunity === true && typeof event.action === "boolean", "ADAPT_ACTION_SHAPE");
      gate(Number.isFinite(event.adp) && Number.isFinite(event.hp), "ADAPT_VALUE_SHAPE");
    }
    if (event.type === "tactical_route") {
      gate(typeof event.route === "string" && typeof event.executed === "boolean", "TACTIC_ROUTE_SHAPE");
    }
  }
  return events;
}
function summarize(events, targetId) {
  const mapOpp = events.filter((event) => event.type === "mapaware_opportunity"
    && (event.tPlayerId === targetId || event.cPlayerId === targetId));
  const mapRead = mapOpp.filter((event) => event.visibleCandidate
    && ((event.tPlayerId === targetId && event.tRead) || (event.cPlayerId === targetId && event.ctRead)));
  const mapActions = events.filter((event) => event.type === "mapaware_action" && event.attackerId === targetId);
  const adapt = events.filter((event) => event.type === "adaptability_response" && event.playerId === targetId);
  const routes = events.filter((event) => event.type === "tactical_route" && event.playerId === targetId);
  return {
    mapOpportunities: mapOpp.length,
    mapReads: mapRead.length,
    mapActions: mapActions.length,
    mapActionRate: mapRead.length ? mapActions.length / mapRead.length : 0,
    mapReadMaxLimit: mapOpp.length ? Math.max(...mapOpp.map((event) => event.tPlayerId === targetId ? event.tReadLimit : event.ctReadLimit)) : 0,
    mapReadMaxDistance: mapRead.length ? Math.max(...mapRead.map((event) => event.distance)) : 0,
    mapActionMaxDistance: mapActions.length ? Math.max(...mapActions.map((event) => event.distance)) : 0,
    adaptOpportunities: adapt.length,
    adaptActions: adapt.filter((event) => event.action).length,
    tacticalRoutes: routes.length,
    tacticalActions: routes.filter((event) => event.executed).length,
    tacticalRouteDigest: sha(json(routes.map((event) => ({ round: event.round, route: event.route, executed: event.executed })))),
  };
}
function add(left, right) {
  for (const key of ["mapOpportunities", "mapReads", "mapActions", "adaptOpportunities", "adaptActions", "tacticalRoutes", "tacticalActions"]) left[key] += right[key];
  return left;
}
function runArm(api, mapKey, tTactic, ctTactic, seed, roster, targetId) {
  const before = inputDigest(mapKey, tTactic, ctTactic, roster);
  const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const collector1 = createCollector();
  const on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector1);
  const collector2 = createCollector();
  const on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector2);
  gate(json(off) === json(on1) && json(off) === json(on2), "INSTRUMENTATION_CHANGED_SIM", String(seed));
  const events1 = validateEvents(collector1.events), events2 = validateEvents(collector2.events);
  gate(json(events1) === json(events2), "EVENT_NON_DETERMINISTIC", String(seed));
  gate(before === inputDigest(mapKey, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", String(seed));
  return {
    seed,
    strictSimDigest: sha(json(off)),
    eventDigest: sha(json(events1)),
    metrics: summarize(events1, targetId),
  };
}
async function loadApi(currentSource) {
  let seen = 0;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-identity-r47-"));
  let vite = null;
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      plugins: [{
        name: "cs-identity-r47-memory-hooks", enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          seen += 1;
          gate(code === currentSource, "VITE_SOURCE_MISMATCH");
          let transformed = currentSource;
          for (const [name, marker, replacement] of TRANSFORMS) {
            gate(transformed.split(marker).length - 1 === 1, "TRANSFORM_MARKER_COUNT", name);
            transformed = transformed.replace(marker, replacement);
          }
          let roundTrip = transformed;
          for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) {
            gate(roundTrip.split(replacement).length - 1 === 1, "TRANSFORM_REPLACEMENT_COUNT", name);
            roundTrip = roundTrip.replace(replacement, marker);
          }
          gate(roundTrip === currentSource, "TRANSFORM_NOT_REVERSIBLE");
          gate(randTokens(transformed).length === randTokens(currentSource).length, "RNG_TOKEN_COUNT_CHANGED");
          return { code: transformed, map: null };
        },
      }],
    });
    const loaded = await vite.ssrLoadModule(FPS_MODULE_ID);
    gate(seen === 1, "TRANSFORM_LOAD_COUNT", String(seen));
    return loaded.__CS_R47_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
function treatmentRoster(baseline, targetId, key, level) {
  const next = clone(baseline);
  const original = baseline.find((player) => player.id === targetId);
  const target = next.find((player) => player.id === targetId);
  gate(original && target, "TARGET_MISSING", targetId);
  const delta = key === "tac" ? 8 : 10;
  const value = { low: original.stats[key] - delta, baseline: original.stats[key], high: original.stats[key] + delta }[level];
  gate(value >= 1 && value <= 99, "TREATMENT_CLAMPED", `${targetId}:${key}:${level}`);
  target.stats[key] = value;
  for (const candidate of next) {
    const before = baseline.find((player) => player.id === candidate.id);
    gate(before, "ROSTER_PLAYER_MISSING", candidate.id);
    if (candidate.id === targetId) {
      const a = { ...before, stats: { ...before.stats } }, b = { ...candidate, stats: { ...candidate.stats } };
      delete a.stats[key]; delete b.stats[key];
      gate(json(a) === json(b), "TREATMENT_NON_TARGET_MUTATION", `${targetId}:${key}`);
    } else gate(json(candidate) === json(before), "TREATMENT_OTHER_MUTATION", candidate.id);
  }
  return freeze(next);
}
function levelRows(api, mapKey, tTactic, ctTactic, baseline, targetId, key) {
  const rows = {};
  for (const level of ["low", "baseline", "high"]) {
    const roster = level === "baseline" ? baseline : treatmentRoster(baseline, targetId, key, level);
    rows[level] = FIXED_SEEDS.map((seed) => runArm(api, mapKey, tTactic, ctTactic, seed, roster, targetId));
  }
  return rows;
}
function sumRows(rows) {
  const total = { mapOpportunities: 0, mapReads: 0, mapActions: 0, mapActionRate: 0, mapReadMaxLimit: 0, mapReadMaxDistance: 0, mapActionMaxDistance: 0, adaptOpportunities: 0, adaptActions: 0, tacticalRoutes: 0, tacticalActions: 0 };
  for (const row of rows) {
    add(total, row.metrics);
    total.mapActionRate = total.mapReads ? total.mapActions / total.mapReads : 0;
    total.mapReadMaxLimit = Math.max(total.mapReadMaxLimit, row.metrics.mapReadMaxLimit);
    total.mapReadMaxDistance = Math.max(total.mapReadMaxDistance, row.metrics.mapReadMaxDistance);
    total.mapActionMaxDistance = Math.max(total.mapActionMaxDistance, row.metrics.mapActionMaxDistance);
  }
  return total;
}
function digestRows(rows) {
  return sha(json(Object.fromEntries(Object.entries(rows).map(([level, levelRows]) => [
    level, levelRows.map((row) => ({ seed: row.seed, sim: row.strictSimDigest, event: row.eventDigest })),
  ]))));
}

async function main() {
  const source = readFileSync(FPS_FILE, "utf8");
  gate(randTokens(source).length === 21, "BASELINE_RNG_CALL_SITES", String(randTokens(source).length));
  gate(source.includes("mapAwareCanReadVisibleCandidate") && source.includes("adaptiveRouteGoal") && source.includes("tacticalRouteKeys"), "PRODUCTION_CONSUMERS_MISSING");
  gate(source.includes("mapAwareT||mapAwareCT") && source.includes("attackerMapAware"), "MAPAWARE_PAIR_CONSUMER_MISSING");
  gate(source.includes("ADAPT_ROUTE_THRESHOLD") && source.includes('p.state="ROTATE"'), "ADAPTABILITY_ROUTE_CONSUMER_MISSING");
  gate(source.includes("TACTICAL_EXECUTION_THRESHOLD") && source.includes('p.role==="igl"'), "TACTICAL_ROUTE_CONSUMER_MISSING");
  const api = await loadApi(source);
  gate(typeof api?.simulateFps === "function" && Array.isArray(api?.ROSTER), "SIMULATOR_API_MISSING");
  const map = api.TACTICS_DB[MAP_KEY];
  const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID)));
  const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID)));
  const baseline = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID, "FIXED_TACTICS_MISSING");
  gate(baseline.length === 10, "BASELINE_ROSTER_SIZE", String(baseline.length));

  const mapTarget = "t3";
  const adaptTarget = "t4";
  const tacticalTarget = "ct1";
  const mapRows = levelRows(api, MAP_KEY, tTactic, ctTactic, baseline, mapTarget, "vis");
  const adaptRows = levelRows(api, MAP_KEY, tTactic, ctTactic, baseline, adaptTarget, "adp");
  const tacticalRows = levelRows(api, MAP_KEY, tTactic, ctTactic, baseline, tacticalTarget, "tac");
  const mapTotals = Object.fromEntries(Object.entries(mapRows).map(([level, rows]) => [level, sumRows(rows)]));
  const adaptTotals = Object.fromEntries(Object.entries(adaptRows).map(([level, rows]) => [level, sumRows(rows)]));
  const tacticalTotals = Object.fromEntries(Object.entries(tacticalRows).map(([level, rows]) => [level, sumRows(rows)]));

  // Total reads/actions can fall after a target survives fewer ticks; verify the causal
  // read limit and the immediate-action rate instead of treating downstream volume as linear.
  gate(mapTotals.low.mapReadMaxLimit < mapTotals.baseline.mapReadMaxLimit && mapTotals.baseline.mapReadMaxLimit < mapTotals.high.mapReadMaxLimit, "MAPAWARE_READ_DIRECTION", JSON.stringify(mapTotals));
  gate(mapTotals.baseline.mapActions > 0 && mapTotals.high.mapActions > 0 && mapTotals.high.mapActionRate > mapTotals.baseline.mapActionRate, "MAPAWARE_ACTION_DIRECTION", JSON.stringify(mapTotals));
  gate(mapTotals.baseline.mapOpportunities > 0 && mapTotals.baseline.mapReads > 0 && mapTotals.baseline.mapActions > 0, "MAPAWARE_COVERAGE", JSON.stringify(mapTotals.baseline));
  gate(adaptTotals.low.adaptOpportunities > 0 && adaptTotals.baseline.adaptOpportunities > 0, "ADAPTABILITY_OPPORTUNITY_COVERAGE", JSON.stringify(adaptTotals));
  gate(adaptTotals.low.adaptActions === 0 && adaptTotals.baseline.adaptActions > 0 && adaptTotals.high.adaptActions >= adaptTotals.baseline.adaptActions, "ADAPTABILITY_ACTION_DIRECTION", JSON.stringify(adaptTotals));
  gate(tacticalTotals.low.tacticalRoutes > 0 && tacticalTotals.baseline.tacticalRoutes > 0, "TACTICAL_ROUTE_COVERAGE", JSON.stringify(tacticalTotals));
  gate(tacticalTotals.low.tacticalActions === 0 && tacticalTotals.baseline.tacticalActions > 0 && tacticalTotals.high.tacticalActions >= tacticalTotals.baseline.tacticalActions, "TACTICAL_ACTION_DIRECTION", JSON.stringify(tacticalTotals));

  const suite = {
    schema: "CsIdentityConsumerSuite.v1",
    mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID,
    seeds: FIXED_SEEDS, rngCallSites: randTokens(source).length,
    targets: { mapAware: mapTarget, adaptability: adaptTarget, tacticalIQ: tacticalTarget },
    levels: { vis: { low: -10, baseline: 0, high: 10 }, adp: { low: -10, baseline: 0, high: 10 }, tac: { low: -8, baseline: 0, high: 8 } },
    mapAware: { totals: mapTotals, rows: mapRows, digest: digestRows(mapRows) },
    adaptability: { totals: adaptTotals, rows: adaptRows, digest: digestRows(adaptRows) },
    tacticalIQ: { totals: tacticalTotals, rows: tacticalRows, digest: digestRows(tacticalRows) },
    productionChanged: true, newRng: false, scenarioChanged: false,
    nineCalibrationChanged: false,
    evidenceBoundary: {
      mapAware: "LOS/smoke/visible candidate pair admission -> aware attacker immediate engage",
      adaptability: "low-HP near-enemy opportunity -> existing retreat route adjustment",
      tacticalIQ: "IGL tactic/site route assignment -> direct route execution",
    },
  };
  const digest = sha(json(suite));
  console.log(`schema: ${suite.schema}`);
  console.log(`fixed seeds: ${FIXED_SEEDS.length}; scenario: ${MAP_KEY}/${T_TACTIC_ID}/${CT_TACTIC_ID}`);
  console.log(`RNG call sites: ${randTokens(source).length}; new RNG: false`);
  console.log(`MapAware totals: ${json(mapTotals)}`);
  console.log(`Adaptability totals: ${json(adaptTotals)}`);
  console.log(`TacticalIQ totals: ${json(tacticalTotals)}`);
  console.log(`evidence digests: ${json({ mapAware: suite.mapAware.digest, adaptability: suite.adaptability.digest, tacticalIQ: suite.tacticalIQ.digest })}`);
  console.log(`suiteDigest: ${digest}`);
  console.log("R18/R34/R35/R38 evidence boundary: preserved; R47 adds only focused live consumers");
  console.log("CS Identity Consumers R47: PASS");
}

main().catch((error) => {
  console.error(`CS Identity Consumers R47: FAIL ${error?.stack || error}`);
  process.exitCode = 1;
});
