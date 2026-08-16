#!/usr/bin/env node
// R52: close observability for the four remaining CS gameplay identity items.
// Memory-only instrumentation. Production owns the existing consumers; this
// verifier does not add a consumer, RNG, seed, scenario, or balance change.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  changedSeedSummary,
  clampSummary,
  monotonicity,
  pairedEffect,
  thresholdCrossing,
} from "./cs_calibration_measurement.mjs";

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
  "adaptability_primary", "adaptability_secondary",
  "tactical_primary", "tactical_secondary",
  "comms_primary", "comms_secondary",
  "synergy_primary", "synergy_secondary",
]);

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const ROUTE_MARKER = "const routeKeys=leadershipRouteKeys(c,tactic,tr,RKF,RS);";
const ROUTE_REPLACEMENT = `${ROUTE_MARKER}__measure?.record("tactical_primary",{round:rnd+1,sec:0,playerId:c.id,side:c.side,role:c.role,tac:persStat(c,"tac"),opportunity:Boolean(c.role==="igl"&&tr[c.role]),action:Boolean(c.role==="igl"&&persStat(c,"tac")>=TACTICAL_EXECUTION_THRESHOLD&&tr[c.role]),route:routeKeys.join("|")});`;
const ADAPT_PRIMARY_MARKER = "const adaptiveGoal=adaptiveRouteGoal(p,target,N);";
const ADAPT_PRIMARY_REPLACEMENT = `${ADAPT_PRIMARY_MARKER}__measure?.record("adaptability_primary",{round:rnd+1,sec,playerId:p.id,role:p.role,hp:p.hp,adp:persStat(p,"adp"),opportunity:true,action:Boolean(adaptiveGoal)});`;
const ADAPT_SECONDARY_MARKER = "const adaptivePostPlant=adaptivePostPlantGoal(p,planted,c4pos);";
const ADAPT_SECONDARY_REPLACEMENT = `${ADAPT_SECONDARY_MARKER}__measure?.record("adaptability_secondary",{round:rnd+1,sec,playerId:p.id,role:p.role,adp:persStat(p,"adp"),opportunity:Boolean(planted&&p.side==="t"&&p.id!==carrier.id&&p.hp>=48&&!p._adaptivePostPlant),action:Boolean(adaptivePostPlant)});`;
const COMMS_PRIMARY_MARKER = "const handoffReceiver=applyCommsHandoff(spotter,tp,ps,walls);";
const COMMS_PRIMARY_REPLACEMENT = `${COMMS_PRIMARY_MARKER}__measure?.record("comms_primary",{round:rnd+1,sec,senderId:spotter.id,senderRole:spotter.role,senderCom:persStat(spotter,"com"),candidateIds:ps.filter(x=>x!==spotter&&!x.dead&&!x.reassigned&&x.side===spotter.side&&(dist(x.pos,tp.pos)<50||dist(x.pos,spotter.pos)<45)).map(x=>x.id).sort().join("|"),receiverId:handoffReceiver?.id??null,receiverRole:handoffReceiver?.role??null,opportunity:true,action:Boolean(handoffReceiver)});`;
const COMMS_SECONDARY_MARKER = "const bombAwareReceiver=applyCommsBombAwareness(carrier,c4pos,aliveT);";
const COMMS_SECONDARY_REPLACEMENT = `${COMMS_SECONDARY_MARKER}__measure?.record("comms_secondary",{round:rnd+1,sec,carrierId:carrier.id,candidateIds:aliveT.filter(x=>x.id!==carrier.id&&!x.dead&&!x.reassigned&&dist(x.pos,carrier.pos)<50).map(x=>x.id).sort().join("|"),receiverId:bombAwareReceiver?.id??null,receiverRole:bombAwareReceiver?.role??null,receiverCom:bombAwareReceiver?persStat(bombAwareReceiver,"com"):null,opportunity:Boolean(aliveT.some(x=>x.id!==carrier.id&&!x.dead&&!x.reassigned&&dist(x.pos,carrier.pos)<50)),action:Boolean(bombAwareReceiver)});`;
const SYNERGY_PRIMARY_MARKER = "const synergyReady=Boolean(synergyPartner&&Math.max(persStat(at,\"coo\"),persStat(synergyPartner,\"coo\"))>=SYNERGY_TRADE_THRESHOLD);";
const SYNERGY_PRIMARY_REPLACEMENT = `${SYNERGY_PRIMARY_MARKER}const __synergyOwner=synergyPartner?(persStat(at,"coo")>=persStat(synergyPartner,"coo")?at.id:synergyPartner.id):null;__measure?.record("synergy_primary",{round:rnd+1,sec,attackerId:at.id,partnerId:synergyPartner?.id??null,attackerRole:at.role,partnerRole:synergyPartner?.role??null,attackerCoo:persStat(at,"coo"),partnerCoo:synergyPartner?persStat(synergyPartner,"coo"):null,cooOwnerId:__synergyOwner,opportunity:Boolean(synergyPartner),action:Boolean(synergyReady)});`;
const SYNERGY_SECONDARY_MARKER = "const synergySecond=synergyReady?synergyCoverFollowUpRoute(at,synergyPartner,df):null;";
const SYNERGY_SECONDARY_REPLACEMENT = `${SYNERGY_SECONDARY_MARKER}__measure?.record("synergy_secondary",{round:rnd+1,sec,attackerId:at.id,partnerId:synergyPartner?.id??null,attackerRole:at.role,partnerRole:synergyPartner?.role??null,cooOwnerId:__synergyOwner,opportunity:Boolean(synergyReady&&synergyPartner),action:Boolean(synergySecond)});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_R52_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER, TACTICS_DB: __FPS3D_MODULE.TACTICS_DB, persStat: __FPS3D_MODULE.persStat,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_R52_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["tactical primary", ROUTE_MARKER, ROUTE_REPLACEMENT],
  ["adaptability primary", ADAPT_PRIMARY_MARKER, ADAPT_PRIMARY_REPLACEMENT],
  ["adaptability secondary", ADAPT_SECONDARY_MARKER, ADAPT_SECONDARY_REPLACEMENT],
  ["comms primary", COMMS_PRIMARY_MARKER, COMMS_PRIMARY_REPLACEMENT],
  ["comms secondary", COMMS_SECONDARY_MARKER, COMMS_SECONDARY_REPLACEMENT],
  ["synergy primary", SYNERGY_PRIMARY_MARKER, SYNERGY_PRIMARY_REPLACEMENT],
  ["synergy secondary", SYNERGY_SECONDARY_MARKER, SYNERGY_SECONDARY_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

const TARGETS = Object.freeze({
  adaptability: Object.freeze({
    key: "adp", delta: 10, threshold: 80,
    primaryTarget: "t4", secondaryTarget: "t4",
    targets: ["t1", "t2", "t3", "t4", "t5"],
  }),
  tacticalIQ: Object.freeze({
    key: "tac", delta: 8, threshold: 90,
    primaryTarget: "ct1", secondaryTarget: "ct2",
    targets: ["ct1", "ct2", "ct3", "ct4", "ct5"],
  }),
  comms: Object.freeze({
    key: "com", delta: 8, threshold: 88,
    primaryTarget: "ct5", secondaryTarget: "t5",
    targets: ["ct1", "ct2", "ct3", "ct4", "ct5", "t1", "t2", "t3", "t4", "t5"],
  }),
  synergy: Object.freeze({
    key: "coo", delta: 8, threshold: 90,
    primaryTarget: "ct5", secondaryTarget: "ct5",
    targets: ["ct1", "ct2", "ct3", "ct4", "ct5", "t1", "t2", "t3", "t4", "t5"],
  }),
});

const LAYERS = Object.freeze({
  adaptability: ["adaptability_primary", "adaptability_secondary"],
  tacticalIQ: ["tactical_primary", "tactical_secondary"],
  comms: ["comms_primary", "comms_secondary"],
  synergy: ["synergy_primary", "synergy_secondary"],
});

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
function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha(json({ mapKey, tTactic, ctTactic, roster })); }
function itemArg() {
  const args = process.argv.filter((item) => item.startsWith("--item="));
  gate(args.length === 1, "ITEM_ARG_REQUIRED", "run one R52 item at a time");
  const item = args[0].slice(7);
  gate(Object.hasOwn(TARGETS, item), "UNKNOWN_ITEM", item);
  return item;
}
function createCollector() {
  const events = [];
  return {
    events,
    record(type, payload) {
      gate(EVENT_TYPES.has(type), "UNKNOWN_EVENT", type);
      gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD", type);
      for (const [key, value] of Object.entries(payload)) {
        gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", `${type}:${key}`);
      }
      events.push(Object.freeze({ schema: "CsGameplayIdentityR52Event.v1", type, ...payload }));
    },
  };
}
function validateEvents(events) {
  for (const event of events) {
    gate(event.schema === "CsGameplayIdentityR52Event.v1", "EVENT_SCHEMA");
    gate(EVENT_TYPES.has(event.type), "EVENT_TYPE", event.type);
    if (event.type.startsWith("adaptability_")) {
      gate(typeof event.playerId === "string" && typeof event.role === "string" && Number.isFinite(event.adp), "ADAPT_SHAPE");
      gate(typeof event.opportunity === "boolean" && typeof event.action === "boolean", "ADAPT_LEVEL_SHAPE");
    }
    if (event.type.startsWith("tactical_")) {
      gate(typeof event.playerId === "string" && typeof event.role === "string" && Number.isFinite(event.tac), "TACTICAL_SHAPE");
      gate(typeof event.opportunity === "boolean" && typeof event.action === "boolean", "TACTICAL_LEVEL_SHAPE");
    }
    if (event.type.startsWith("comms_")) {
      gate(typeof event.candidateIds === "string" && (typeof event.receiverId === "string" || event.receiverId === null), "COMMS_SHAPE");
      gate(typeof event.opportunity === "boolean" && typeof event.action === "boolean", "COMMS_LEVEL_SHAPE");
    }
    if (event.type.startsWith("synergy_")) {
      gate(typeof event.attackerId === "string" && (typeof event.partnerId === "string" || event.partnerId === null), "SYNERGY_SHAPE");
      gate(typeof event.opportunity === "boolean" && typeof event.action === "boolean", "SYNERGY_LEVEL_SHAPE");
    }
  }
  return events;
}
function eventLayerType(item, layer) { return LAYERS[item][layer === "primary" ? 0 : 1]; }
function targetMatches(item, layer, event, targetId) {
  if (item === "comms") {
    return layer === "primary"
      ? event.senderId === targetId
      : event.candidateIds.split("|").filter(Boolean).includes(targetId);
  }
  if (item === "synergy") return event.attackerId === targetId || event.partnerId === targetId;
  return event.playerId === targetId;
}
function eventMetrics(events, item, layer, targetId, targetRole) {
  const type = eventLayerType(item, layer);
  const rows = events.filter((event) => event.type === type && targetMatches(item, layer, event, targetId));
  let opportunity = 0;
  let actions = 0;
  let causalActions = 0;
  let ownerHits = 0;
  for (const event of rows) {
    if (event.opportunity) opportunity++;
    if (event.action) actions++;
    if (event.action && (item !== "synergy" || event.cooOwnerId === targetId)) causalActions++;
    if (item === "synergy" && event.opportunity && event.cooOwnerId === targetId) ownerHits++;
  }
  return {
    eventCount: rows.length,
    opportunity,
    actions,
    conversion: opportunity ? actions / opportunity : 0,
    causalActions,
    ownerHits,
    observedRole: rows.length ? targetRole : null,
    actionRole: actions ? targetRole : null,
  };
}
function overlap(events, item) {
  const [primary, secondary] = LAYERS[item];
  const p = events.filter((event) => event.type === primary);
  const s = events.filter((event) => event.type === secondary);
  const tick = (event) => `${event.round}:${event.sec}`;
  const pOppTicks = new Set(p.filter((event) => event.opportunity).map(tick));
  const sOppTicks = new Set(s.filter((event) => event.opportunity).map(tick));
  const pActionTicks = new Set(p.filter((event) => event.action).map(tick));
  const sActionTicks = new Set(s.filter((event) => event.action).map(tick));
  return {
    primaryEvents: p.length,
    secondaryEvents: s.length,
    opportunitySameTick: [...pOppTicks].filter((key) => sOppTicks.has(key)).length,
    actionSameTick: [...pActionTicks].filter((key) => sActionTicks.has(key)).length,
    chainedActionSameTick: item === "synergy" ? [...pActionTicks].filter((key) => sActionTicks.has(key)).length : 0,
  };
}
function directLevels(api, baseline, targetId, key, delta) {
  const original = baseline.find((player) => player.id === targetId);
  gate(original, "TARGET_MISSING", targetId);
  const values = { low: original.stats[key] - delta, baseline: original.stats[key], high: original.stats[key] + delta };
  for (const value of Object.values(values)) gate(value >= 1 && value <= 99, "TREATMENT_CLAMPED", `${targetId}/${key}/${value}`);
  return Object.fromEntries(Object.entries(values).map(([level, raw]) => [level, {
    raw,
    effective: api.persStat({ ...original, stats: { ...original.stats, [key]: raw } }, key),
  }]));
}
function treatmentRoster(baseline, targetId, key, level, delta) {
  const next = clone(baseline);
  const original = baseline.find((player) => player.id === targetId);
  const target = next.find((player) => player.id === targetId);
  gate(original && target, "TARGET_MISSING", targetId);
  const value = { low: original.stats[key] - delta, baseline: original.stats[key], high: original.stats[key] + delta }[level];
  gate(value >= 1 && value <= 99, "TREATMENT_CLAMPED", `${targetId}/${key}/${level}`);
  target.stats[key] = value;
  for (const candidate of next) {
    const before = baseline.find((player) => player.id === candidate.id);
    gate(before, "ROSTER_PLAYER_MISSING", candidate.id);
    if (candidate.id === targetId) {
      const a = { ...before, stats: { ...before.stats } };
      const b = { ...candidate, stats: { ...candidate.stats } };
      delete a.stats[key];
      delete b.stats[key];
      gate(json(a) === json(b), "TREATMENT_NON_TARGET_MUTATION", targetId);
    } else gate(json(candidate) === json(before), "TREATMENT_OTHER_MUTATION", candidate.id);
  }
  return freeze(next);
}
async function loadApi(currentSource) {
  let seen = 0;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-r52-identity-"));
  let vite = null;
  try {
    vite = await createServer({
      root: ROOT,
      configFile: false,
      envFile: false,
      appType: "custom",
      logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      plugins: [{
        name: "cs-gameplay-r52-memory",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          seen++;
          gate(code === currentSource, "VITE_SOURCE_MISMATCH");
          let transformed = currentSource;
          for (const [name, marker, replacement] of TRANSFORMS) {
            gate(transformed.split(marker).length - 1 === 1, "TRANSFORM_MARKER_COUNT", name);
            transformed = transformed.replace(marker, replacement);
          }
          let roundTrip = transformed;
          for (const [, marker, replacement] of [...TRANSFORMS].reverse()) roundTrip = roundTrip.replace(replacement, marker);
          gate(roundTrip === currentSource, "TRANSFORM_NOT_REVERSIBLE");
          gate(randTokens(transformed).length === randTokens(currentSource).length, "RNG_TOKEN_COUNT_CHANGED");
          return { code: transformed, map: null };
        },
      }],
    });
    const loaded = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r52=identity`);
    gate(seen === 1, "TRANSFORM_LOAD_COUNT", String(seen));
    return loaded.__CS_R52_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
function runScenario(api, tTactic, ctTactic, seed, roster, item) {
  const before = inputDigest(MAP_KEY, tTactic, ctTactic, roster);
  const off = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster);
  const collector1 = createCollector();
  const on1 = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster, collector1);
  const collector2 = createCollector();
  const on2 = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster, collector2);
  gate(json(off) === json(on1) && json(off) === json(on2), "INSTRUMENTATION_CHANGED_SIM", `${item}/${seed}`);
  const events1 = validateEvents(collector1.events);
  const events2 = validateEvents(collector2.events);
  gate(json(events1) === json(events2), "EVENT_NON_DETERMINISTIC", `${item}/${seed}`);
  gate(before === inputDigest(MAP_KEY, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", `${item}/${seed}`);
  return {
    seed,
    strictSimDigest: sha(json(off)),
    eventDigest: sha(json(events1)),
    events: events1,
    overlap: overlap(events1, item),
  };
}
function focusedRows(api, tTactic, ctTactic, baseline, item, spec, targetId, layer) {
  return Object.fromEntries(["low", "baseline", "high"].map((level) => {
    const roster = level === "baseline" ? baseline : treatmentRoster(baseline, targetId, spec.key, level, spec.delta);
    const rows = FIXED_SEEDS.map((seed) => {
      const scenario = runScenario(api, tTactic, ctTactic, seed, roster, item);
      const target = roster.find((player) => player.id === targetId);
      return {
        seed,
        strictSimDigest: scenario.strictSimDigest,
        eventDigest: scenario.eventDigest,
        metrics: eventMetrics(scenario.events, item, layer, targetId, target.role),
        overlap: scenario.overlap,
      };
    });
    return [level, rows];
  }));
}
function baselineRoleRows(api, tTactic, ctTactic, baseline, item, spec) {
  const rows = Object.fromEntries(spec.targets.map((targetId) => [targetId, []]));
  for (const seed of FIXED_SEEDS) {
    const scenario = runScenario(api, tTactic, ctTactic, seed, baseline, item);
    for (const targetId of spec.targets) {
      const target = baseline.find((player) => player.id === targetId);
      rows[targetId].push({
        seed,
        role: target.role,
        metrics: {
          primary: eventMetrics(scenario.events, item, "primary", targetId, target.role),
          secondary: eventMetrics(scenario.events, item, "secondary", targetId, target.role),
        },
      });
    }
  }
  return rows;
}
function aggregate(rows) {
  return rows.reduce((out, row) => {
    for (const key of ["eventCount", "opportunity", "actions", "causalActions", "ownerHits"]) out[key] += row.metrics[key];
    out.roles = [...new Set([...out.roles, row.metrics.observedRole].filter(Boolean))].sort();
    out.actionRoles = [...new Set([...out.actionRoles, row.metrics.actionRole].filter(Boolean))].sort();
    return out;
  }, { eventCount: 0, opportunity: 0, actions: 0, causalActions: 0, ownerHits: 0, roles: [], actionRoles: [] });
}
function addConversion(total) { return { ...total, conversion: total.opportunity ? total.actions / total.opportunity : 0 }; }
function direction(rows) {
  const values = rows.map((row) => row.metrics.actions);
  const opportunities = rows.map((row) => row.metrics.opportunity);
  const seedsWith = (valuesList) => valuesList.filter((value) => value > 0).length;
  const monotone = monotonicity(
    rows.map((row) => row.metrics.actions),
    rows.map((row) => row.metrics.actions),
    rows.map((row) => row.metrics.actions),
  );
  return {
    actionSeeds: seedsWith(values),
    opportunitySeeds: seedsWith(opportunities),
    lowBaseline: pairedEffect([], []),
    highBaseline: pairedEffect([], []),
    monotonicity: monotone,
  };
}
function compareLevels(levelRows) {
  const levels = ["low", "baseline", "high"];
  const values = Object.fromEntries(levels.map((level) => [level, levelRows[level].map((row) => row.metrics.actions)]));
  const opportunities = Object.fromEntries(levels.map((level) => [level, levelRows[level].map((row) => row.metrics.opportunity)]));
  const actionSeedCounts = Object.fromEntries(levels.map((level) => [level, values[level].filter((value) => value > 0).length]));
  const opportunitySeedCounts = Object.fromEntries(levels.map((level) => [level, opportunities[level].filter((value) => value > 0).length]));
  const lowBase = pairedEffect(values.low, values.baseline);
  const highBase = pairedEffect(values.high, values.baseline);
  const lowHigh = pairedEffect(values.low, values.high);
  const strict = actionSeedCounts.baseline > FIXED_SEEDS.length / 2
    && opportunitySeedCounts.baseline > FIXED_SEEDS.length / 2
    && values.low.filter((value, index) => value <= values.baseline[index]).length > FIXED_SEEDS.length / 2
    && values.high.filter((value, index) => value >= values.baseline[index]).length > FIXED_SEEDS.length / 2;
  return {
    actionSeedCounts,
    opportunitySeedCounts,
    actionMonotonicity: monotonicity(values.low, values.baseline, values.high),
    opportunityMonotonicity: monotonicity(opportunities.low, opportunities.baseline, opportunities.high),
    lowBaseline: lowBase,
    highBaseline: highBase,
    lowHigh,
    strictMajorityDirection: strict,
  };
}
function digestRows(rows) { return sha(json(Object.fromEntries(Object.entries(rows).map(([level, levelRows]) => [level, levelRows.map((row) => ({ seed: row.seed, sim: row.strictSimDigest, event: row.eventDigest, metrics: row.metrics }))])))); }
function digestRoleRows(rows) { return sha(json(Object.fromEntries(Object.entries(rows).map(([targetId, targetRows]) => [targetId, targetRows.map((row) => ({ seed: row.seed, primary: row.metrics.primary, secondary: row.metrics.secondary }))])))); }
function roleCoverage(rows) {
  return Object.fromEntries(Object.entries(rows).map(([targetId, targetRows]) => {
    const role = targetRows[0]?.role ?? null;
    const primary = addConversion(aggregate(targetRows.map((row) => ({ metrics: row.metrics.primary }))));
    const secondary = addConversion(aggregate(targetRows.map((row) => ({ metrics: row.metrics.secondary }))));
    return [targetId, { role, primary, secondary }];
  }));
}
function overlaps(rows) {
  return rows.reduce((out, row) => {
    for (const key of ["primaryEvents", "secondaryEvents", "opportunitySameTick", "actionSameTick", "chainedActionSameTick"]) out[key] += row.overlap[key];
    return out;
  }, { primaryEvents: 0, secondaryEvents: 0, opportunitySameTick: 0, actionSameTick: 0, chainedActionSameTick: 0 });
}
function armResult(api, tTactic, ctTactic, baseline, item, spec, targetId, layer) {
  const rows = focusedRows(api, tTactic, ctTactic, baseline, item, spec, targetId, layer);
  const totals = Object.fromEntries(Object.entries(rows).map(([level, levelRows]) => [level, addConversion(aggregate(levelRows))]));
  const changedSeeds = rows.low.filter((row, index) => row.strictSimDigest !== rows.baseline[index].strictSimDigest).length
    + rows.high.filter((row, index) => row.strictSimDigest !== rows.baseline[index].strictSimDigest).length;
  const consumerChangedSeeds = rows.low.filter((row, index) => row.eventDigest !== rows.baseline[index].eventDigest).length
    + rows.high.filter((row, index) => row.eventDigest !== rows.baseline[index].eventDigest).length;
  const target = baseline.find((player) => player.id === targetId);
  const direct = directLevels(api, baseline, targetId, spec.key, spec.delta);
  return {
    targetId,
    role: target.role,
    layer,
    direct,
    levels: compareLevels(rows),
    totals,
    rowsDigest: digestRows(rows),
    overlap: overlaps(rows.baseline),
    changedSeeds: changedSeedSummary(changedSeeds, FIXED_SEEDS.length * 2),
    consumerChangedSeeds: changedSeedSummary(consumerChangedSeeds, FIXED_SEEDS.length * 2),
    threshold: thresholdCrossing([direct.low.raw, direct.baseline.raw, direct.high.raw], spec.threshold, "up"),
    clamp: {
      raw: clampSummary([direct.low.raw, direct.baseline.raw, direct.high.raw], 1, 99),
      effective: clampSummary([direct.low.effective, direct.baseline.effective, direct.high.effective], 1, 99),
    },
  };
}
function readiness(spec, primary, secondary) {
  const p = primary.totals.baseline;
  const s = secondary.totals.baseline;
  const identity = p.opportunity > 0 && p.actions > 0 && s.opportunity > 0 && s.actions > 0;
  const strict = primary.levels.strictMajorityDirection
    && secondary.levels.strictMajorityDirection
    && primary.levels.opportunityMonotonicity.strictMajority
    && secondary.levels.opportunityMonotonicity.strictMajority;
  if (identity && strict) return "Calibration Ready - Limited";
  if (identity || p.opportunity > 0 || s.opportunity > 0) return "Measurement Ready - Coverage Limited";
  return "Deferred";
}
async function main() {
  const item = itemArg();
  const source = readFileSync(FPS_FILE, "utf8");
  const spec = TARGETS[item];
  gate(randTokens(source).length === 21, "BASELINE_RNG_CALL_SITES", String(randTokens(source).length));
  const required = [
    "adaptiveRouteGoal", "adaptivePostPlantGoal", "tacticalRouteKeys", "tacticalRetakeRoute",
    "applyCommsHandoff", "applyCommsBombAwareness", "synergyTradeCandidate", "synergyCoverFollowUpRoute",
  ];
  for (const marker of required) gate(source.includes(marker), "PRODUCTION_CONSUMER_MISSING", marker);
  const api = await loadApi(source);
  gate(typeof api?.simulateFps === "function" && Array.isArray(api.ROSTER) && typeof api.persStat === "function", "SIMULATOR_API_MISSING");
  const map = api.TACTICS_DB[MAP_KEY];
  const tTactic = freeze(clone(map?.t?.find((entry) => entry.id === T_TACTIC_ID)));
  const ctTactic = freeze(clone(map?.ct?.find((entry) => entry.id === CT_TACTIC_ID)));
  const baseline = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID && baseline.length === 10, "FIXED_INPUTS");
  for (const targetId of [spec.primaryTarget, spec.secondaryTarget, ...spec.targets]) gate(baseline.some((player) => player.id === targetId), "TARGET_MISSING", targetId);
  const primary = armResult(api, tTactic, ctTactic, baseline, item, spec, spec.primaryTarget, "primary");
  const secondary = armResult(api, tTactic, ctTactic, baseline, item, spec, spec.secondaryTarget, "secondary");
  const roles = baselineRoleRows(api, tTactic, ctTactic, baseline, item, spec);
  const result = {
    schema: "CsGameplayIdentityR52Suite.v1",
    item,
    canonicalKey: spec.key,
    mapKey: MAP_KEY,
    tTacticId: T_TACTIC_ID,
    ctTacticId: CT_TACTIC_ID,
    seeds: FIXED_SEEDS,
    rngCallSites: randTokens(source).length,
    newRng: false,
    scenarioChanged: false,
    productionChanged: false,
    layers: {
      primary: primary,
      secondary: secondary,
    },
    roleCoverage: roleCoverage(roles),
    roleDigest: digestRoleRows(roles),
    readiness: readiness(spec, primary, secondary),
    overlap: {
      baseline: primary.overlap,
      primaryArm: primary.overlap,
      secondaryArm: secondary.overlap,
    },
    productionConsumers: {
      primary: eventLayerType(item, "primary"),
      secondary: eventLayerType(item, "secondary"),
    },
  };
  console.log(`schema: ${result.schema}`);
  console.log(`item: ${item}; canonical key: ${spec.key}; fixed seeds: ${FIXED_SEEDS.length}; scenario: ${MAP_KEY}/${T_TACTIC_ID}/${CT_TACTIC_ID}`);
  console.log(`RNG call sites: ${result.rngCallSites}; new RNG: false; production changed: false`);
  console.log(`result: ${json(result)}`);
  console.log(`digest: ${sha(json({ item, roleDigest: result.roleDigest, primary: primary.rowsDigest, secondary: secondary.rowsDigest }))}`);
  console.log("R52 Level 2 opportunity and Level 3 immediate action are separated by consumer layer; Level 4 remains secondary");
  console.log("CS Gameplay Identity R52: PASS");
}
main().catch((error) => { console.error(`CS Gameplay Identity R52: FAIL ${error?.stack || error}`); process.exitCode = 1; });
