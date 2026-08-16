#!/usr/bin/env node
// R48：CS Comms / Leadership / Synergy 最小 team consumer verifier。
// memory-only instrumentation；不寫 production，不新增 RNG，不改 fixed scenario。

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
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
const EVENT_TYPES = new Set(["comms", "leadership", "synergy"]);
const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const COMMS_MARKER = "const handoffReceiver=applyCommsHandoff(spotter,tp,ps,walls);";
const COMMS_REPLACEMENT = `${COMMS_MARKER}__measure?.record("comms",{round:rnd+1,sec,senderId:spotter.id,senderRole:spotter.role,senderCom:persStat(spotter,"com"),receiverId:handoffReceiver?.id??null,receiverRole:handoffReceiver?.role??null,action:Boolean(handoffReceiver)});`;
const LEADERSHIP_MARKER = "const routeKeys=leadershipRouteKeys(c,tactic,tr,RKF,RS);";
const LEADERSHIP_REPLACEMENT = `${LEADERSHIP_MARKER}__measure?.record("leadership",{round:rnd+1,sec:0,playerId:c.id,side:c.side,role:c.role,leaderId:RS.find(q=>q.side===c.side&&q.role==="igl")?.id??null,leaderLed:RS.find(q=>q.side===c.side&&q.role==="igl")?persStat(RS.find(q=>q.side===c.side&&q.role==="igl"),"led"):null,route:routeKeys.join("|"),action:Boolean(c.role!=="igl"&&RS.find(q=>q.side===c.side&&q.role==="igl")&&persStat(RS.find(q=>q.side===c.side&&q.role==="igl"),"led")>=LEADERSHIP_EXECUTION_THRESHOLD&&tr[RS.find(q=>q.side===c.side&&q.role==="igl")?.role]&&routeKeys.join("|")===tr[RS.find(q=>q.side===c.side&&q.role==="igl")?.role].join("|"))});`;
const SYNERGY_MARKER = "const synergyReady=Boolean(synergyPartner&&Math.max(persStat(at,\"coo\"),persStat(synergyPartner,\"coo\"))>=SYNERGY_TRADE_THRESHOLD);";
const SYNERGY_REPLACEMENT = `${SYNERGY_MARKER}__measure?.record("synergy",{round:rnd+1,sec,attackerId:at.id,attackerRole:at.role,partnerId:synergyPartner?.id??null,partnerRole:synergyPartner?.role??null,attackerCoo:persStat(at,"coo"),partnerCoo:synergyPartner?persStat(synergyPartner,"coo"):null,opportunity:Boolean(synergyPartner),action:synergyReady});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_R48_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_R48_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["comms handoff", COMMS_MARKER, COMMS_REPLACEMENT],
  ["leadership route", LEADERSHIP_MARKER, LEADERSHIP_REPLACEMENT],
  ["synergy trade", SYNERGY_MARKER, SYNERGY_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
}
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return JSON.stringify(value); }
function clone(value) { return structuredClone(value); }
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }
function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha(json({ mapKey, tTactic, ctTactic, roster })); }
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
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
      events.push(Object.freeze({ schema: "CsTeamIdentityEvent.v1", type, ...payload }));
    },
  };
}
function validateEvents(events) {
  for (const event of events) {
    gate(event.schema === "CsTeamIdentityEvent.v1", "EVENT_SCHEMA");
    gate(EVENT_TYPES.has(event.type), "EVENT_TYPE", event.type);
    if (event.type === "comms") {
      gate(typeof event.senderId === "string" && typeof event.senderRole === "string", "COMMS_SENDER_SHAPE");
      gate(typeof event.senderCom === "number" && typeof event.action === "boolean", "COMMS_ACTION_SHAPE");
    }
    if (event.type === "leadership") {
      gate(typeof event.playerId === "string" && typeof event.role === "string", "LEADERSHIP_PLAYER_SHAPE");
      gate(typeof event.action === "boolean", "LEADERSHIP_ACTION_SHAPE");
    }
    if (event.type === "synergy") {
      gate(typeof event.attackerId === "string" && typeof event.opportunity === "boolean" && typeof event.action === "boolean", "SYNERGY_ACTION_SHAPE");
    }
  }
  return events;
}
function summarize(events, targets) {
  const comms = events.filter((event) => event.type === "comms" && event.senderId === targets.comms);
  const leadership = events.filter((event) => event.type === "leadership" && event.leaderId === targets.leadership && event.playerId !== targets.leadership);
  const synergy = events.filter((event) => event.type === "synergy" && (event.attackerId === targets.synergy || event.partnerId === targets.synergy));
  return {
    commsOpportunities: comms.length,
    commsActions: comms.filter((event) => event.action).length,
    commsRoles: [...new Set(comms.map((event) => event.senderRole))].sort(),
    leadershipOpportunities: leadership.length,
    leadershipActions: leadership.filter((event) => event.action).length,
    leadershipRoles: [...new Set(leadership.map((event) => event.role))].sort(),
    synergyOpportunities: synergy.filter((event) => event.opportunity).length,
    synergyActions: synergy.filter((event) => event.action).length,
    synergyPartnerRoles: [...new Set(synergy.filter((event) => event.partnerRole).map((event) => event.partnerRole))].sort(),
  };
}
function add(left, right) {
  for (const key of ["commsOpportunities", "commsActions", "leadershipOpportunities", "leadershipActions", "synergyOpportunities", "synergyActions"]) left[key] += right[key];
  return left;
}
function sumRows(rows) {
  const total = { commsOpportunities: 0, commsActions: 0, leadershipOpportunities: 0, leadershipActions: 0, synergyOpportunities: 0, synergyActions: 0 };
  rows.forEach((row) => add(total, row.metrics));
  return total;
}
function digestRows(rows) {
  return sha(json(Object.fromEntries(Object.entries(rows).map(([level, levelRows]) => [
    level, levelRows.map((row) => ({ seed: row.seed, sim: row.strictSimDigest, event: row.eventDigest })),
  ]))));
}
function treatmentRoster(baseline, targetId, key, level) {
  const next = clone(baseline);
  const original = baseline.find((player) => player.id === targetId);
  const target = next.find((player) => player.id === targetId);
  gate(original && target, "TARGET_MISSING", targetId);
  const delta = 8;
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
function runArm(api, mapKey, tTactic, ctTactic, seed, roster, targets) {
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
  const metrics = summarize(events1, targets);
  return { seed, strictSimDigest: sha(json(off)), eventDigest: sha(json(events1)), metrics };
}
async function loadApi(currentSource, liveSource) {
  let seen = 0;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-team-r48-"));
  let vite = null;
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      plugins: [{
        name: "cs-team-identity-r48-memory-hooks", enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          seen += 1;
          gate(code === liveSource, "VITE_SOURCE_MISMATCH");
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
    const loaded = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r48=memory`);
    gate(seen === 1, "TRANSFORM_LOAD_COUNT", String(seen));
    return loaded.__CS_R48_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
function levelRows(api, mapKey, tTactic, ctTactic, baseline, targetId, key, targets) {
  const rows = {};
  for (const level of ["low", "baseline", "high"]) {
    const roster = level === "baseline" ? baseline : treatmentRoster(baseline, targetId, key, level);
    rows[level] = FIXED_SEEDS.map((seed) => runArm(api, mapKey, tTactic, ctTactic, seed, roster, targets));
  }
  return rows;
}
async function main() {
  const liveSource = readFileSync(FPS_FILE, "utf8");
  const historicalR47 = csR48R47Source(liveSource);
  gate(sha(historicalR47) === CS_R47_IDENTITY_SOURCE_SHA256, "R47_HISTORICAL_SOURCE", sha(historicalR47));
  gate(randTokens(liveSource).length === 21, "BASELINE_RNG_CALL_SITES", String(randTokens(liveSource).length));
  gate(liveSource.includes("applyCommsHandoff") && liveSource.includes("leadershipRouteKeys") && liveSource.includes("synergyTradeCandidate"), "PRODUCTION_CONSUMERS_MISSING");
  gate(liveSource.includes("COMMS_HANDOFF_THRESHOLD") && liveSource.includes("LEADERSHIP_EXECUTION_THRESHOLD") && liveSource.includes("SYNERGY_TRADE_THRESHOLD"), "PRODUCTION_THRESHOLDS_MISSING");
  const api = await loadApi(liveSource, liveSource);
  gate(typeof api?.simulateFps === "function" && Array.isArray(api?.ROSTER), "SIMULATOR_API_MISSING");
  const map = api.TACTICS_DB[MAP_KEY];
  const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID)));
  const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID)));
  const baseline = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID, "FIXED_TACTICS_MISSING");
  gate(baseline.length === 10, "BASELINE_ROSTER_SIZE", String(baseline.length));
  const targets = { comms: "ct5", leadership: "ct1", synergy: "ct5" };
  const targetSpecs = [
    ["comms", "com", targets.comms],
    ["leadership", "led", targets.leadership],
    ["synergy", "coo", targets.synergy],
  ];
  for (const [name, key, targetId] of targetSpecs) gate(baseline.find((player) => player.id === targetId)?.stats?.[key] === 90, "TARGET_BASELINE", `${name}/${targetId} actual=${baseline.find((player) => player.id === targetId)?.stats?.[key]}`);
  const commsRows = levelRows(api, MAP_KEY, tTactic, ctTactic, baseline, targets.comms, "com", targets);
  const leadershipRows = levelRows(api, MAP_KEY, tTactic, ctTactic, baseline, targets.leadership, "led", targets);
  const synergyRows = levelRows(api, MAP_KEY, tTactic, ctTactic, baseline, targets.synergy, "coo", targets);
  const commsTotals = Object.fromEntries(Object.entries(commsRows).map(([level, rows]) => [level, sumRows(rows)]));
  const leadershipTotals = Object.fromEntries(Object.entries(leadershipRows).map(([level, rows]) => [level, sumRows(rows)]));
  const synergyTotals = Object.fromEntries(Object.entries(synergyRows).map(([level, rows]) => [level, sumRows(rows)]));

  gate(commsTotals.low.commsOpportunities > 0 && commsTotals.baseline.commsOpportunities > 0, "COMMS_OPPORTUNITY_COVERAGE", JSON.stringify(commsTotals));
  gate(commsTotals.low.commsActions === 0 && commsTotals.baseline.commsActions > 0 && commsTotals.high.commsActions / commsTotals.high.commsOpportunities >= commsTotals.baseline.commsActions / commsTotals.baseline.commsOpportunities, "COMMS_ACTION_DIRECTION", JSON.stringify(commsTotals));
  gate(commsRows.baseline.flatMap((row) => row.metrics.commsRoles).includes("support"), "COMMS_SUPPORT_ROLE_COVERAGE");
  gate(leadershipTotals.low.leadershipOpportunities > 0 && leadershipTotals.baseline.leadershipOpportunities > 0, "LEADERSHIP_OPPORTUNITY_COVERAGE", JSON.stringify(leadershipTotals));
  gate(leadershipTotals.low.leadershipActions === 0 && leadershipTotals.baseline.leadershipActions > 0 && leadershipTotals.high.leadershipActions / leadershipTotals.high.leadershipOpportunities >= leadershipTotals.baseline.leadershipActions / leadershipTotals.baseline.leadershipOpportunities, "LEADERSHIP_ACTION_DIRECTION", JSON.stringify(leadershipTotals));
  gate(leadershipRows.baseline.flatMap((row) => row.metrics.leadershipRoles).some((role) => role !== "igl"), "LEADERSHIP_TEAM_ROLE_COVERAGE");
  gate(synergyTotals.low.synergyOpportunities > 0 && synergyTotals.baseline.synergyOpportunities > 0, "SYNERGY_OPPORTUNITY_COVERAGE", JSON.stringify(synergyTotals));
  gate(synergyTotals.low.synergyActions === 0 && synergyTotals.baseline.synergyActions > 0 && synergyTotals.high.synergyActions / synergyTotals.high.synergyOpportunities >= synergyTotals.baseline.synergyActions / synergyTotals.baseline.synergyOpportunities, "SYNERGY_ACTION_DIRECTION", JSON.stringify(synergyTotals));
  gate(synergyRows.baseline.flatMap((row) => row.metrics.synergyPartnerRoles).length > 0, "SYNERGY_PARTNER_ROLE_COVERAGE");

  const suite = {
    schema: "CsTeamIdentityConsumerSuite.v1",
    mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID,
    seeds: FIXED_SEEDS, rngCallSites: randTokens(liveSource).length,
    targets, levels: { com: { low: -8, baseline: 0, high: 8 }, led: { low: -8, baseline: 0, high: 8 }, coo: { low: -8, baseline: 0, high: 8 } },
    comms: { totals: commsTotals, rows: commsRows, digest: digestRows(commsRows) },
    leadership: { totals: leadershipTotals, rows: leadershipRows, digest: digestRows(leadershipRows) },
    synergy: { totals: synergyTotals, rows: synergyRows, digest: digestRows(synergyRows) },
    productionChanged: true, newRng: false, scenarioChanged: false, nineCalibrationChanged: false,
    evidenceBoundary: {
      comms: "visible enemy contact + teammate/support context -> shared awareness route handoff",
      leadership: "IGL led threshold + existing tactic route -> teammate route consistency",
      synergy: "existing visible trade partner -> immediate teammate aim/engage response",
    },
  };
  const suiteDigest = sha(json(suite));
  console.log(`schema: ${suite.schema}`);
  console.log(`fixed seeds: ${FIXED_SEEDS.length}; scenario: ${MAP_KEY}/${T_TACTIC_ID}/${CT_TACTIC_ID}`);
  console.log(`RNG call sites: ${randTokens(liveSource).length}; new RNG: false`);
  console.log(`Comms totals: ${json(commsTotals)}`);
  console.log(`Leadership totals: ${json(leadershipTotals)}`);
  console.log(`Synergy totals: ${json(synergyTotals)}`);
  console.log(`evidence digests: ${json({ comms: suite.comms.digest, leadership: suite.leadership.digest, synergy: suite.synergy.digest })}`);
  console.log(`suiteDigest: ${suiteDigest}`);
  console.log("R16/R36/R38/R47 evidence boundary: preserved; R48 adds only focused team consumers");
  console.log("CS Team Identity Consumers R48: PASS");
}
main().catch((error) => {
  console.error(`CS Team Identity Consumers R48: FAIL ${error?.stack || error}`);
  process.exitCode = 1;
});
