#!/usr/bin/env node
// CS Flash Attribution Instrumentation R12
//
// Production stays untouched. Two Vite memory views expose the real simulator:
// an RNG-only collector (off) and a flash-attribution collector (on). Their
// complete gameplay trajectories and seeded RNG streams must remain identical.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { CS_R11_REPAIRED_SOURCE_SHA256 } from "./cs_r11_legacy_source.mjs";
import { CS_R13_PLAYER_SMOKE_SOURCE_SHA256, csR13R12Source } from "./cs_r13_legacy_source.mjs";
import { csR15EvidenceSources as csR14EvidenceSources } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";

const EVIDENCE_SCHEMA = "CsFlashAttribution.v1";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const EXPECTED_SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21;
// No capture/update CLI exists. Initial implementation prints the computed
// value and fails until this literal is reviewed and locked manually.
const EXPECTED_ATTRIBUTION_SUITE_SHA256 = "265c9f3b79324e395004a726f996772bbba2b4033979ac6ec91600cfb68702a0";

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const RNG_MARKER = "const map=MAPS[mapKey];const rand=mkRng(seed);";
const RNG_REPLACEMENT = "const map=MAPS[mapKey];const __r12RawRand=mkRng(seed);let __r12RngCount=0;const rand=()=>{const value=__r12RawRand();__r12RngCount++;__measure?.recordRng(__r12RngCount,value);return value;};";
const ROUND_START_MARKER = [
  "    });",
  "    for(let sec=0;sec<115;sec+=2){",
].join("\n");
const ROUND_START_REPLACEMENT = [
  "    });",
  "    __measure?.recordRoundStart({round:rnd+1,players:ps.map(__p=>({id:__p.id,side:__p.side,actualFlash:__p.flash,flashNades:__p.nades.filter(__n=>__n===\"flash\").length}))});",
  "    for(let sec=0;sec<115;sec+=2){",
].join("\n");
const DECAY_MARKER = "        p.flash=Math.max(0,p.flash-1);p.shooting=Math.max(0,p.shooting-1);p.prevPos={...p.pos};p.picking=Math.max(0,p.picking-1);";
const DECAY_REPLACEMENT = `${DECAY_MARKER}__measure?.recordFlashDecay({round:rnd+1,sec,playerId:p.id,actualFlash:p.flash});`;
const THROW_MARKER = [
  "          throwables.push({id:`nd${fi}${p.id}`,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flying:true,detonate:false});",
  "          if(nt===\"flash\"&&enemy)enemy.flash=Math.max(enemy.flash,4);",
].join("\n");
const THROW_REPLACEMENT = [
  "          throwables.push({id:`nd${fi}${p.id}`,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flying:true,detonate:false});",
  "          if(nt===\"flash\")__measure?.recordFlashThrow({round:rnd+1,sec,throwableId:`nd${fi}${p.id}`,throwerId:p.id,throwerSide:p.side,fromX:p.pos.x,fromY:p.pos.y,toX:land.x,toY:land.y,immediateTargetId:enemy?enemy.id:null});",
  "          if(nt===\"flash\"&&enemy){enemy.flash=Math.max(enemy.flash,4);__measure?.recordFlashWrite({round:rnd+1,sec,source:\"immediate\",throwableId:`nd${fi}${p.id}`,targetId:enemy.id,targetSide:enemy.side,distance:dist(enemy.pos,p.pos),duration:4,actualFlash:enemy.flash});}",
].join("\n");
const DETONATION_MARKER = "        if(tw.type===\"flash\"){ps.forEach(pl=>{if(pl.dead)return;const d=dist(pl.pos,tw.to);if(d<24&&!lineBlocked(pl.pos,tw.to,walls)){const enemy=pl.side!==tw.side;pl.flash=Math.max(pl.flash,enemy?(d<12?6:4):(d<8?3:0));}});}";
const DETONATION_REPLACEMENT = "        if(tw.type===\"flash\"){ps.forEach(pl=>{if(pl.dead)return;const d=dist(pl.pos,tw.to);if(d<24&&!lineBlocked(pl.pos,tw.to,walls)){const enemy=pl.side!==tw.side;const __r12Duration=enemy?(d<12?6:4):(d<8?3:0);pl.flash=Math.max(pl.flash,__r12Duration);__measure?.recordFlashWrite({round:rnd+1,sec,source:\"detonation\",throwableId:tw.id,targetId:pl.id,targetSide:pl.side,distance:d,duration:__r12Duration,actualFlash:pl.flash});}});}";
const DUEL_ROLL_MARKER = [
  "          const flashPen=(tp.flash>0?-0.12:0)+(cp.flash>0?0.12:0);",
  "          const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93); // 結構平衡 + 戰術剋制",
  "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;",
].join("\n");
const DUEL_ROLL_REPLACEMENT = [
  "          const flashPen=(tp.flash>0?-0.12:0)+(cp.flash>0?0.12:0);",
  "          const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93); // 結構平衡 + 戰術剋制",
  "          const __r12DuelRoll=rand();const tw=__r12DuelRoll<Pt;const at=tw?tp:cp,df=tw?cp:tp;",
].join("\n");
const DUEL_EVENT_MARKER = "          const hpBefore=df.hp,effectiveDamage=Math.min(dmg,hpBefore);";
const DUEL_EVENT_REPLACEMENT = `${DUEL_EVENT_MARKER}__measure?.recordDuel({round:rnd+1,sec,tId:tp.id,cId:cp.id,tFlash:tp.flash,cFlash:cp.flash,flashPen,basePt:0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+tacEdge,pt:Pt,roll:__r12DuelRoll,actualTWin:tw,attackerId:at.id,defenderId:df.id,rolledDamage:dmg,effectiveDamage,lethal:dmg>=hpBefore});`;
const GUN_FLASH_MARKER = "          df.hp-=dmg;at.dmgDealt=(at.dmgDealt||0)+effectiveDamage;roundDmg[at.id]=(roundDmg[at.id]||0)+effectiveDamage;at.flash=3;df.flash=3;at.state=\"ENGAGE\";df.state=\"ENGAGE\";at.shooting=df.hp<=0?1:2;";
const GUN_FLASH_REPLACEMENT = `${GUN_FLASH_MARKER}__measure?.recordGunFlashWrite({round:rnd+1,sec,playerIds:[at.id,df.id],actualFlashes:[at.flash,df.flash]});`;
const ROUND_END_MARKER = [
  "      if(!roundEnd){",
  "        if(aliveT.length===0&&!planted)roundEnd={winner:\"ct\",how:\"elim\"};",
  "        else if(aliveCT.length===0)roundEnd={winner:\"t\",how:\"elim\"};",
  "        else if(sec>=114)roundEnd={winner:planted?\"t\":\"ct\",how:\"time\"};",
  "      }",
].join("\n");
const ROUND_END_REPLACEMENT = `${ROUND_END_MARKER}\n      if(roundEnd)__measure?.recordRoundEnd({round:rnd+1,sec,winner:roundEnd.winner,how:roundEnd.how,rngCount:__r12RngCount});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = `const __CS_FLASH_ATTRIBUTION_R12_TEST_API__ = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
});
export { EsportsFPS3D, buildMatchResult, __CS_FLASH_ATTRIBUTION_R12_TEST_API__ };`;

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

const ROUNDED_KEYS = new Set([
  "fromX", "fromY", "toX", "toY", "distance", "basePt", "pt",
  "ptWithoutGrenade", "roll", "flashPen", "flashPenWithoutGrenade",
]);

function canonicalValue(value, key = "") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", key);
    if (Object.is(value, -0)) return 0;
    return ROUNDED_KEYS.has(key) ? Math.round(value * 1e9) / 1e9 : value;
  }
  gate(value && typeof value === "object", "UNSUPPORTED_VALUE", `${key}:${typeof value}`);
  if (Array.isArray(value)) return value.map((item, index) => canonicalValue(item, `${key}[${index}]`));
  const out = {};
  for (const childKey of Object.keys(value).sort()) {
    gate(typeof value[childKey] !== "undefined", "UNDEFINED_VALUE", childKey);
    out[childKey] = canonicalValue(value[childKey], childKey);
  }
  return out;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function clonePlain(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function generatedSeeds() {
  return Array.from({ length: FIXED_SEEDS.length }, (_, index) => {
    const digest = createHash("sha256").update(`${SEED_NAMESPACE}${index}`).digest();
    return digest.readUInt32BE(0) || 1;
  });
}

function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}

function transformSource(source, variant) {
  let transformed = source.replace(/\r\n/g, "\n");
  const commonMarkers = [SIGNATURE_MARKER, RNG_MARKER, RETURN_MARKER, EXPORT_MARKER];
  for (const marker of commonMarkers) {
    gate(occurrences(transformed, marker) === 1, "COMMON_TRANSFORM_MARKER_COUNT", marker.slice(0, 100));
  }
  transformed = transformed
    .replace(SIGNATURE_MARKER, SIGNATURE_REPLACEMENT)
    .replace(RNG_MARKER, RNG_REPLACEMENT)
    .replace(RETURN_MARKER, RETURN_REPLACEMENT)
    .replace(EXPORT_MARKER, EXPORT_REPLACEMENT);
  if (variant === "on") {
    const markers = [
      ROUND_START_MARKER, DECAY_MARKER, THROW_MARKER, DETONATION_MARKER,
      DUEL_ROLL_MARKER, DUEL_EVENT_MARKER, GUN_FLASH_MARKER, ROUND_END_MARKER,
    ];
    for (const marker of markers) {
      gate(occurrences(transformed, marker) === 1, "ATTRIBUTION_TRANSFORM_MARKER_COUNT", marker.slice(0, 120));
    }
    transformed = transformed
      .replace(ROUND_START_MARKER, ROUND_START_REPLACEMENT)
      .replace(DECAY_MARKER, DECAY_REPLACEMENT)
      .replace(THROW_MARKER, THROW_REPLACEMENT)
      .replace(DETONATION_MARKER, DETONATION_REPLACEMENT)
      .replace(DUEL_ROLL_MARKER, DUEL_ROLL_REPLACEMENT)
      .replace(DUEL_EVENT_MARKER, DUEL_EVENT_REPLACEMENT)
      .replace(GUN_FLASH_MARKER, GUN_FLASH_REPLACEMENT)
      .replace(ROUND_END_MARKER, ROUND_END_REPLACEMENT);
  }
  gate(randTokens(transformed).length === EXPECTED_RAND_CALLS, "TRANSFORM_RAND_COUNT",
    `variant=${variant} expected=${EXPECTED_RAND_CALLS} actual=${randTokens(transformed).length}`);
  return transformed;
}

function createOffCollector() {
  const rng = [];
  return {
    rng,
    recordRng(index, value) { rng.push({ index, value }); },
  };
}

function createOnCollector() {
  const rng = [];
  const purchases = [];
  const throws = [];
  const writes = [];
  const duels = [];
  const roundEnds = [];
  const flashState = new Map();
  const throwById = new Map();

  function playerState(playerId) {
    const state = flashState.get(playerId);
    gate(state, "FLASH_STATE_MISSING", playerId);
    return state;
  }

  function sourceMax(state) {
    return Math.max(0, ...state.sources.values());
  }

  function assertState(playerId, actualFlash, stage) {
    const state = playerState(playerId);
    gate(state.actual === actualFlash, "FLASH_SHADOW_IDENTITY",
      `stage=${stage} player=${playerId} shadow=${state.actual} production=${actualFlash}`);
    gate(sourceMax(state) === state.actual, "FLASH_SOURCE_MAX_IDENTITY",
      `stage=${stage} player=${playerId} sourceMax=${sourceMax(state)} shadow=${state.actual}`);
    gate(state.withoutGrenade <= state.actual, "FLASH_COUNTERFACTUAL_EXCEEDS_ACTUAL",
      `stage=${stage} player=${playerId} without=${state.withoutGrenade} actual=${state.actual}`);
  }

  function sourceClass(state) {
    if (state.actual <= 0) return "none";
    const tags = [...state.sources.keys()];
    const hasGrenade = tags.some((tag) => tag.startsWith("grenade:"));
    const hasGun = tags.some((tag) => tag.startsWith("gun:"));
    if (state.withoutGrenade <= 0) {
      gate(hasGrenade, "GRENADE_ONLY_WITHOUT_GRENADE_SOURCE", canonicalJson(tags));
      return "grenade-only";
    }
    if (hasGrenade && hasGun) return "mixed";
    if (hasGrenade) return "mixed";
    gate(hasGun, "GUN_ONLY_WITHOUT_GUN_SOURCE", canonicalJson(tags));
    return "gun-only";
  }

  function decaySourceMap(state) {
    for (const [tag, duration] of state.sources) {
      const next = Math.max(0, duration - 1);
      if (next > 0) state.sources.set(tag, next);
      else state.sources.delete(tag);
    }
  }

  return {
    rng,
    purchases,
    throws,
    writes,
    duels,
    roundEnds,
    recordRng(index, value) { rng.push({ index, value }); },
    recordRoundStart(event) {
      flashState.clear();
      for (const player of event.players) {
        gate(player.actualFlash === 0, "ROUND_START_FLASH_NOT_ZERO", canonicalJson({ round: event.round, player }));
        flashState.set(player.id, { actual: 0, withoutGrenade: 0, sources: new Map() });
        purchases.push({ round: event.round, playerId: player.id, side: player.side, flashNades: player.flashNades });
      }
    },
    recordFlashDecay(event) {
      const state = playerState(event.playerId);
      state.actual = Math.max(0, state.actual - 1);
      state.withoutGrenade = Math.max(0, state.withoutGrenade - 1);
      decaySourceMap(state);
      assertState(event.playerId, event.actualFlash, "decay");
    },
    recordFlashThrow(event) {
      gate(!throwById.has(event.throwableId), "DUPLICATE_FLASH_THROWABLE_ID", event.throwableId);
      throwById.set(event.throwableId, event);
      throws.push(event);
    },
    recordFlashWrite(event) {
      const throwEvent = throwById.get(event.throwableId);
      gate(throwEvent, "FLASH_WRITE_WITHOUT_THROW", canonicalJson(event));
      const state = playerState(event.targetId);
      const before = state.actual;
      if (event.duration > 0) {
        const tag = `grenade:${event.throwableId}:${event.source}`;
        state.sources.set(tag, Math.max(state.sources.get(tag) ?? 0, event.duration));
        state.actual = Math.max(state.actual, event.duration);
      }
      assertState(event.targetId, event.actualFlash, event.source);
      writes.push({
        ...event,
        throwerId: throwEvent.throwerId,
        throwerSide: throwEvent.throwerSide,
        beforeFlash: before,
        changedFlash: state.actual !== before,
        sourceClassAfter: sourceClass(state),
        withoutGrenadeFlash: state.withoutGrenade,
      });
    },
    recordDuel(event) {
      assertState(event.tId, event.tFlash, "duel:t");
      assertState(event.cId, event.cFlash, "duel:ct");
      const tState = playerState(event.tId);
      const cState = playerState(event.cId);
      const tSourceClass = sourceClass(tState);
      const cSourceClass = sourceClass(cState);
      const reconstructedFlashPen = (tState.actual > 0 ? -0.12 : 0) + (cState.actual > 0 ? 0.12 : 0);
      const flashPenWithoutGrenade = (tState.withoutGrenade > 0 ? -0.12 : 0)
        + (cState.withoutGrenade > 0 ? 0.12 : 0);
      gate(Math.abs(reconstructedFlashPen - event.flashPen) < 1e-12, "FLASH_PEN_IDENTITY", canonicalJson(event));
      const reconstructedPt = Math.max(0.07, Math.min(0.93, event.basePt + event.flashPen));
      const ptWithoutGrenade = Math.max(0.07, Math.min(0.93, event.basePt + flashPenWithoutGrenade));
      gate(Math.abs(reconstructedPt - event.pt) < 1e-12, "DUEL_PT_IDENTITY", canonicalJson(event));
      const actualTWin = event.roll < event.pt;
      const counterfactualTWin = event.roll < ptWithoutGrenade;
      gate(actualTWin === event.actualTWin, "DUEL_ROLL_IDENTITY", canonicalJson(event));
      const grenadeOnlyOpportunity = tSourceClass === "grenade-only" || cSourceClass === "grenade-only";
      duels.push({
        ...event,
        tSourceClass,
        cSourceClass,
        flashPenWithoutGrenade,
        ptWithoutGrenade,
        grenadeOnlyOpportunity,
        grenadeMarginalOpportunity: Math.abs(event.flashPen - flashPenWithoutGrenade) > 1e-12,
        counterfactualTWin,
        sameRollOutcomeFlip: actualTWin !== counterfactualTWin,
      });
    },
    recordGunFlashWrite(event) {
      gate(event.playerIds.length === 2 && event.actualFlashes.length === 2, "GUN_FLASH_WRITE_SHAPE");
      event.playerIds.forEach((playerId, index) => {
        const state = playerState(playerId);
        state.actual = 3;
        state.withoutGrenade = 3;
        state.sources.clear();
        state.sources.set(`gun:${event.round}:${event.sec}:${playerId}`, 3);
        assertState(playerId, event.actualFlashes[index], "gun-overwrite");
      });
    },
    recordRoundEnd(event) { roundEnds.push(event); },
  };
}

function runOff(api, scenario) {
  const collector = createOffCollector();
  const sim = api.simulateFps(scenario.mapKey, scenario.tTactic, scenario.ctTactic, scenario.seed, scenario.roster, collector);
  return { sim, collector };
}

function runOn(api, scenario) {
  const collector = createOnCollector();
  const sim = api.simulateFps(scenario.mapKey, scenario.tTactic, scenario.ctTactic, scenario.seed, scenario.roster, collector);
  return { sim, collector };
}

function attributionDocument(scenario, collector) {
  return {
    schema: EVIDENCE_SCHEMA,
    scenario: {
      seed: scenario.seed,
      mapKey: scenario.mapKey,
      tTacticId: scenario.tTactic.id,
      ctTacticId: scenario.ctTactic.id,
    },
    purchases: collector.purchases,
    throws: collector.throws,
    writes: collector.writes,
    duels: collector.duels,
    roundEnds: collector.roundEnds,
  };
}

function validateScenario(offApi, onApi, scenario) {
  const off1 = runOff(offApi, scenario);
  const off2 = runOff(offApi, scenario);
  const on1 = runOn(onApi, scenario);
  const on2 = runOn(onApi, scenario);
  const simJson = canonicalJson(off1.sim);
  const rngJson = canonicalJson(off1.collector.rng);
  const eventJson = canonicalJson(attributionDocument(scenario, on1.collector));
  gate(simJson === canonicalJson(off2.sim), "OFF_SIM_NON_DETERMINISTIC", `seed=${scenario.seed}`);
  gate(rngJson === canonicalJson(off2.collector.rng), "OFF_RNG_NON_DETERMINISTIC", `seed=${scenario.seed}`);
  gate(canonicalJson(on1.sim) === canonicalJson(on2.sim), "ON_SIM_NON_DETERMINISTIC", `seed=${scenario.seed}`);
  gate(canonicalJson(on1.collector.rng) === canonicalJson(on2.collector.rng), "ON_RNG_NON_DETERMINISTIC", `seed=${scenario.seed}`);
  gate(eventJson === canonicalJson(attributionDocument(scenario, on2.collector)), "ATTRIBUTION_NON_DETERMINISTIC", `seed=${scenario.seed}`);
  gate(simJson === canonicalJson(on1.sim), "COLLECTOR_CHANGED_TRAJECTORY", `seed=${scenario.seed}`);
  gate(rngJson === canonicalJson(on1.collector.rng), "COLLECTOR_CHANGED_RNG", `seed=${scenario.seed}`);
  gate(on1.collector.roundEnds.length === on1.sim.roundHist.length, "ROUND_END_COUNT", `seed=${scenario.seed}`);

  const duels = on1.collector.duels;
  return {
    seed: scenario.seed,
    trajectorySha256: sha256(simJson),
    rngCount: on1.collector.rng.length,
    rngSha256: sha256(rngJson),
    attributionSha256: sha256(eventJson),
    flashPurchased: on1.collector.purchases.reduce((sum, item) => sum + item.flashNades, 0),
    flashThrows: on1.collector.throws.length,
    flashWrites: on1.collector.writes.length,
    effectiveFlashWrites: on1.collector.writes.filter((item) => item.changedFlash).length,
    duelOpportunities: duels.length,
    grenadeOnlyOpportunities: duels.filter((item) => item.grenadeOnlyOpportunity).length,
    grenadeMarginalOpportunities: duels.filter((item) => item.grenadeMarginalOpportunity).length,
    sameRollOutcomeFlips: duels.filter((item) => item.sameRollOutcomeFlip).length,
  };
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN",
    "R12 has no capture, update, rebaseline, seed, treatment, or calibration flags.");
  gate(canonicalJson(generatedSeeds()) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  gate(sha256(canonicalJson(FIXED_SEEDS)) === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");

  const originalSource = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(originalSource);
  const r14Sources = csR14EvidenceSources(originalSource);
  gate(r14Sources || [CS_R11_REPAIRED_SOURCE_SHA256, CS_R13_PLAYER_SMOKE_SOURCE_SHA256].includes(sourceSha256),
    "SOURCE_PROVENANCE_MISMATCH",
    `expected=${CS_R11_REPAIRED_SOURCE_SHA256} or ${CS_R13_PLAYER_SMOKE_SOURCE_SHA256}\nactual=${sourceSha256}`);
  const r12EvidenceSource = r14Sources?.r12 ?? (sourceSha256 === CS_R13_PLAYER_SMOKE_SOURCE_SHA256
    ? csR13R12Source(originalSource) : originalSource);
  if (sourceSha256 === CS_R13_PLAYER_SMOKE_SOURCE_SHA256) {
    gate(sha256(r12EvidenceSource) === CS_R11_REPAIRED_SOURCE_SHA256, "R13_R12_ADAPTER_MISMATCH");
  }
  gate(randTokens(originalSource).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(originalSource).length}`);
  gate(occurrences(r12EvidenceSource, "utilDmg:0") === 1, "UTIL_DMG_UNAVAILABLE_MARKER");
  gate(occurrences(r12EvidenceSource, "if(tw.type===\"flash\")") === 1, "FLASH_GAMEPLAY_BRANCH_COUNT");

  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-flash-attribution-r12-"));
  let vite = null;
  let transformSeen = 0;
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
        name: "cs-flash-attribution-r12-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          const query = id.split("?")[1] ?? "";
          const variant = query.includes("cs-r12=off") ? "off" : query.includes("cs-r12=on") ? "on" : null;
          if (!variant) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          return { code: transformSource(r12EvidenceSource, variant), map: null };
        },
      }],
    });

    const offModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r12=off`);
    const onModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r12=on`);
    gate(transformSeen === 2, "TRANSFORM_COUNT", String(transformSeen));
    const offApi = offModule.__CS_FLASH_ATTRIBUTION_R12_TEST_API__;
    const onApi = onModule.__CS_FLASH_ATTRIBUTION_R12_TEST_API__;
    for (const api of [offApi, onApi]) {
      gate(typeof api?.simulateFps === "function", "SIMULATOR_EXPORT_MISSING");
      gate(Array.isArray(api?.ROSTER), "ROSTER_EXPORT_MISSING");
      gate(api?.TACTICS_DB?.inferno, "TACTICS_EXPORT_MISSING");
    }

    const mapKey = "inferno";
    const tTactic = clonePlain(onApi.TACTICS_DB.inferno.t.find((item) => item.id === "t_aexec"));
    const ctTactic = clonePlain(onApi.TACTICS_DB.inferno.ct.find((item) => item.id === "c_std"));
    const roster = clonePlain(onApi.ROSTER);
    gate(tTactic?.id === "t_aexec" && ctTactic?.id === "c_std", "TACTIC_MISSING");
    deepFreeze(tTactic);
    deepFreeze(ctTactic);
    deepFreeze(roster);
    const inputBefore = sha256(canonicalJson({ mapKey, tTactic, ctTactic, roster }));

    const records = FIXED_SEEDS.map((seed) => validateScenario(offApi, onApi, {
      seed, mapKey, tTactic, ctTactic, roster,
    }));
    gate(inputBefore === sha256(canonicalJson({ mapKey, tTactic, ctTactic, roster })), "SIM_MUTATED_INPUT");

    const totals = records.reduce((out, record) => {
      for (const key of [
        "flashPurchased", "flashThrows", "flashWrites", "effectiveFlashWrites",
        "duelOpportunities", "grenadeOnlyOpportunities", "grenadeMarginalOpportunities",
        "sameRollOutcomeFlips",
      ]) out[key] += record[key];
      return out;
    }, {
      flashPurchased: 0,
      flashThrows: 0,
      flashWrites: 0,
      effectiveFlashWrites: 0,
      duelOpportunities: 0,
      grenadeOnlyOpportunities: 0,
      grenadeMarginalOpportunities: 0,
      sameRollOutcomeFlips: 0,
    });
    gate(totals.grenadeOnlyOpportunities > 0, "ZERO_GRENADE_ONLY_COVERAGE",
      "Fixed 16-seed suite has no grenade-only flash duel opportunity. R12 must Revise without changing gameplay.");
    gate(records.every((record) => record.flashThrows > 0), "PER_SEED_FLASH_THROW_COVERAGE", canonicalJson(records));

    const suiteSha256 = sha256(canonicalJson({
      schema: EVIDENCE_SCHEMA,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256: EXPECTED_SEED_SET_SHA256,
      records,
    }));
    console.log(`sourceStage: ${r14Sources ? "r14-he via canonical R12" : "historical"}`);
    console.log(`sourceSha256: ${sourceSha256}`);
    console.log(`fixed seeds: ${FIXED_SEEDS.length}`);
    console.log(`collector off/on trajectory equality: ${records.length}/${records.length}`);
    console.log(`collector off/on RNG equality: ${records.length}/${records.length}`);
    console.log(`flash coverage: ${canonicalJson(totals)}`);
    console.log(`${EVIDENCE_SCHEMA}: ${suiteSha256}`);
    if (EXPECTED_ATTRIBUTION_SUITE_SHA256 === "__CAPTURE_MANUALLY__") {
      throw new Error(`[R12_BASELINE_NOT_LOCKED]\nactual=${suiteSha256}\ncoverage=${canonicalJson(totals)}`);
    }
    gate(suiteSha256 === EXPECTED_ATTRIBUTION_SUITE_SHA256, "ATTRIBUTION_EVIDENCE_REGRESSION",
      `expected=${EXPECTED_ATTRIBUTION_SUITE_SHA256}\nactual=${suiteSha256}`);
    console.log("utilDmg: unavailable; smoke prevented-kill claims: forbidden");
    console.log("production gameplay / CsMatchResult.v1 / Store / Progress / runtime contract: unchanged");
    console.log("CS Flash Attribution R12: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
