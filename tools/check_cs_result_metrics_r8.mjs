#!/usr/bin/env node
// CS ADR Overkill / Result Metrics Repair R8
// Two-stage, fail-closed verifier:
//   1) lock immutable CsGameplayDigest.v1 / trajectory / progress evidence on legacy source;
//   2) after the one-point production repair, prove every non-metric trajectory field and
//      every instrumentation event remains identical while all changed metrics are derived
//      from effective HP damage. No update/rebaseline CLI exists.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { toCsMatchResult } from "../src/platform/contracts/CsMatchResult.js";
import { csResultToTransaction } from "../src/platform/progress/adapters/csProgressAdapter.js";
import { csPerfFactor, playerXpFor } from "../src/platform/progress/rewardFormulas.js";
import { csR10LegacySource } from "./cs_r10_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const PROGRESS_SOURCE_PROVENANCE = Object.freeze({
  "src/platform/contracts/CsMatchResult.js": "6f0e526657b53690c858bf5f64af6788170a5a2c8627419d82e8735ab00612cf",
  "src/platform/progress/adapters/csProgressAdapter.js": "bf8f75ad79b73237f7ef9df74f7092c5d71df8585b8fa518df3490d5e4f497c2",
  "src/platform/progress/rewardFormulas.js": "06d0e401a98725aa0899b75854753f893832f2ad26036b8f20d5a7af845a7a3e",
  "src/platform/progress/playerLevel.js": "b954766eb26424f930fe8d23d90e765adc7f5e27991cb36ae5578c8b52580170",
});

const LEGACY_SOURCE_SHA256 = "5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d";
const REPAIRED_SOURCE_SHA256 = "870678267543c8e502fac55c7a91a656a135f31fdfb0d673adc30c91c4d8f47b";
const CURRENT_SOURCE_SHA256 = "ba3305ea6cd92fe06df5ee3fd4eb3ca47e1385910672b1ec111f804da0859b8d";
const LEGACY_BASELINE_SUITE_V1 = "546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2";
const EXPECTED_REPAIRED_BASELINE_SUITE_V2 = "5e39e463148d2cd43bbd30b97c485858d75a5edf7f42a035f8f49e1d473293e9";
const EXPECTED_RAND_CALLS = 21;

const DIGEST_SCHEMA_V1 = "CsGameplayDigest.v1";
const DIGEST_SCHEMA_V2 = "CsGameplayDigest.v2";
const TRAJECTORY_SCHEMA = "CsMetricNeutralTrajectory.v1";
const EVENT_SCHEMA = "CsResultMetricsRepairEvents.v1";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const EXPECTED_SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";

// Immutable legacy evidence. This is populated manually while the production source still
// has LEGACY_SOURCE_SHA256. It must never be replaced by repaired output.
const EXPECTED_LEGACY_EVIDENCE = Object.freeze({"sourceSha256":"5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d","baselineSuiteV1":"546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2","baseline":[{"seed":3978742910,"gameplayDigestV1":"6a62a2ac3eb5ad8912aed052042a1c09465b45ffd6e95d34a404cc449a7cd208","trajectoryDigest":"3c506e87d34a915ab65132354d325bac23058efebc286ef9f585b347c7732117"},{"seed":4200255727,"gameplayDigestV1":"1808b2badadd1dd011cede1e6b7020d29871000cd96d729ad452a323e024909d","trajectoryDigest":"25bfb1d0f242d2ec8e64bc24f10839241c6a9f977c1d3b7a493251e2c05223ad"},{"seed":541349949,"gameplayDigestV1":"561396ad3fea108872a07408c8a82166ef105743595651fca1ec54f83ec54052","trajectoryDigest":"ba3f77776c165b78a4e2602fab1b2b9b610fddabbc3590b839226486896a8fe8"},{"seed":1011896540,"gameplayDigestV1":"7c4a33d926effe5da8f94776b9f369a3848ec98c2bf297338e28f2d56ded668e","trajectoryDigest":"df37e751d871cd299dc146eb00b9c79516a6c9126750bc0ba90c23288b237b88"},{"seed":44863398,"gameplayDigestV1":"0b62560841fe56ca3c7140f7b7db5d8d54e807aec039a68d5521f388f1e15951","trajectoryDigest":"271515bdc0c7e1709a05dd4cf8a99f4b14de3098565ee9af860b4f2d34ecc886"},{"seed":1878380147,"gameplayDigestV1":"a138ce8ce663d1f41648443dffdac0cbe77d95308364dfc8e6405559f12249db","trajectoryDigest":"ff43a90dbc6d2e38516e166a96526936e4fe45e9d79a5c58889dd6536a268bc1"},{"seed":638784133,"gameplayDigestV1":"8ba42c38f2377c6659be701002551b06764da39ad796d720abf188c323151e33","trajectoryDigest":"05e3d48f128ad6d91805da223b41074b601ede1fdbf18ad61dba4c92f7a0df4b"},{"seed":2852978760,"gameplayDigestV1":"ce648000bfeea843a6334026633b8ef422eeb456f0ebbbd01568e6ffa0e2c6bb","trajectoryDigest":"8b3b9a43175d39bcafb4ba909b6ded4ad8ae800c5e2d1f43b1c4afa0f674efa3"},{"seed":1789562418,"gameplayDigestV1":"0a0e0d11e755dd72b24ff308751dec0f62d849b0185acfb77f4be5786597cea1","trajectoryDigest":"f75463c0eaf2549a1b3abd6f267ea4e4f98ef6b0824436e8136451393ae7e011"},{"seed":3820910912,"gameplayDigestV1":"1288576fd624313bcc7d36b3ce0c9ba414ef774b9861a74cbca9ea29cb03a6ba","trajectoryDigest":"0555c0eb5507ee61df74d84859f689be380e2573b27c10318ef7e62e30b0f16f"},{"seed":3991584863,"gameplayDigestV1":"8aa9c2a6235bf0098f7e518117091c1c031c33d1ccd1589e0a351e123150c2a8","trajectoryDigest":"e367d54908d0d93c6d8eac8a8b05ee55f239ae65c8f415abf6db9a226b196f90"},{"seed":2186970694,"gameplayDigestV1":"73d3fc924afbeeacfb2882213808e737247f7430f9e9e84812b2dd0215537cbc","trajectoryDigest":"3179dc17160155e9b4633ea6b5eb7f8c4fe290d65058867e2601ce7dbee0d1c5"},{"seed":951543597,"gameplayDigestV1":"295758782509b12c7968f46e5f74feb8502e680937d54b8ba274cc8ec0d69bf7","trajectoryDigest":"fdee46489dc6e770f06653e15a980702db1ab33522ec3bfff73e9ecd7c671a36"},{"seed":2082574495,"gameplayDigestV1":"60b4b5994ab6cc13e4dd6f1980847d19e6493fe4c4abd1186aeb2dccdd7705d6","trajectoryDigest":"b568779c27ec3b6ce6c433a212f38723170ebab64a4440993968314a20605015"},{"seed":474649321,"gameplayDigestV1":"6f46006565e58c4a99dbebde566399eb9cd0236c7463d778f33e6682e3972dbf","trajectoryDigest":"f33b7df595b49d9e1f4ece103e39110e40c1e9f1f00a07b541245aea9177cf96"},{"seed":3950420867,"gameplayDigestV1":"c1f2502302a1f9cf7115f8c455581b96f6cfa37136f7940dc485549547994ecb","trajectoryDigest":"cb6f0c9f64130fc7ca1204f60d5b7a6287729c2b9be973ec3f4ddf21d4519b1f"}],"treatment":[{"seed":3978742910,"trajectoryDigest":"0a67b647ffa41397f483a68e03a9cde23c9c064f576266de078dfb5953d7cc70"},{"seed":4200255727,"trajectoryDigest":"72201f075331d38f8912003f0ed46c2efd451a11cacb70397a4d27cea401fe2f"},{"seed":541349949,"trajectoryDigest":"0e7caa0d1ebe0f50d2cebf4242f50e00e8bdef251726de8089af05e8404e4905"},{"seed":1011896540,"trajectoryDigest":"4c3332752c5cdb9dd85b64c42bf5379ddd3d9c77767571b9718d89c68a242e72"},{"seed":44863398,"trajectoryDigest":"894136f4e6984afb997afe917b27d9cefc38751c8b81a7dc984d61d718998e69"},{"seed":1878380147,"trajectoryDigest":"4dc5b6ea895da45470c556c79fbd6233898364022ece961ef795cfe113ff65a4"},{"seed":638784133,"trajectoryDigest":"26e9a8c2775612d3e65dcf801596a016ed522e3e1f0c124f3cfd1576735ad0b4"},{"seed":2852978760,"trajectoryDigest":"92f3af2c87451d5d13ad2ee5e8d2cc2a045b0570dfafdb1617daf28f05657194"},{"seed":1789562418,"trajectoryDigest":"f09abf7badde364b42f8f50595cf484a47e9cf78111a4904b566ea7738f68ace"},{"seed":3820910912,"trajectoryDigest":"31861af9f548e7ebeb1eb2c9022f720afb4716bbe03e0c37817e517380e2c10d"},{"seed":3991584863,"trajectoryDigest":"acef5c4a2f75dd4959ad7a2a16a5ba99b90c73c1fb12e915530724b89aac7a15"},{"seed":2186970694,"trajectoryDigest":"49f4bb5df03724a871dd17428c48f26b953a07eb9fb90b2dc8f8802cb13e4b36"},{"seed":951543597,"trajectoryDigest":"6a933208a3476a5f81dd2e0aa9b9da7a7ad2a4c406d937b5fd38e063eb6ac026"},{"seed":2082574495,"trajectoryDigest":"6035c050224d3bbb02bd09e177caa1cda715f97ff8fa2b513ac326b6cf468176"},{"seed":474649321,"trajectoryDigest":"c8dda48c65fce77a11dc80bb0698544479945d6848d080756104a975223f6299"},{"seed":3950420867,"trajectoryDigest":"d4dddc357ca2aa57cdb894cee5c57d2645461121bed1562554d5fbde865f49c0"}],"eventSuiteDigest":"8784fa275001d7782c49b646e4fd3010378fda987a2fc89dadd43ccc99c7c25a","progressNeutralSuiteDigest":"3fa9eda398d984f61158defdb7c9f65382b29db3f72c3a7710f18f25d8b548ac","progressFullSuiteDigest":"5348318f1f0605ec9bfa0859a0b32fdef1b8509e764c2b73c5f640182dd9386a"});

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const LEGACY_DAMAGE_MARKER = '          df.hp-=dmg;at.dmgDealt=(at.dmgDealt||0)+dmg;roundDmg[at.id]=(roundDmg[at.id]||0)+dmg;at.flash=3;df.flash=3;at.state="ENGAGE";df.state="ENGAGE";at.shooting=df.hp<=0?1:2;';
const REPAIRED_DAMAGE_MARKER = '          const hpBefore=df.hp,effectiveDamage=Math.min(dmg,hpBefore);\n          df.hp-=dmg;at.dmgDealt=(at.dmgDealt||0)+effectiveDamage;roundDmg[at.id]=(roundDmg[at.id]||0)+effectiveDamage;at.flash=3;df.flash=3;at.state="ENGAGE";df.state="ENGAGE";at.shooting=df.hp<=0?1:2;';
const DAMAGE_EVENT_HOOK = '          __measure?.record("damage_conversion",{round:rnd+1,sec,attackerId:at.id,defenderId:df.id,rolledDamage:dmg,hpBefore:df.hp+dmg,effectiveDamage:Math.min(dmg,df.hp+dmg),overkillDamage:Math.max(0,-df.hp),kill:df.hp<=0});';
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = `const __CS_RESULT_METRICS_R8_TEST_API__ = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  buildMatchResult: __FPS3D_MODULE.buildMatchResult,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
});
export { EsportsFPS3D, buildMatchResult, __CS_RESULT_METRICS_R8_TEST_API__ };`;

const ALLOWED_GAMEPLAY_PATHS = Object.freeze([
  "/result/players/*/adr",
  "/result/players/*/mvpRounds",
  "/result/players/*/rating",
  "/frames/*/players/*/dmgDealt",
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function round6(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const GAMEPLAY_FLOAT_KEYS = new Set(["x", "y", "routeT", "t"]);

function canonicalValue(value, { gameplay = false, rejectUndefined = false } = {}, key = "") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", `key=${key} value=${String(value)}`);
    if (Object.is(value, -0)) return 0;
    return gameplay && GAMEPLAY_FLOAT_KEYS.has(key) ? round6(value) : value;
  }
  if (typeof value === "undefined") {
    gate(!rejectUndefined, "UNDEFINED_VALUE", `key=${key}`);
    return undefined;
  }
  gate(typeof value === "object", "UNSUPPORTED_CANONICAL_TYPE", `key=${key} type=${typeof value}`);
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalValue(item, { gameplay, rejectUndefined }, `${key}[${index}]`));
  }
  const out = {};
  for (const childKey of Object.keys(value).sort()) {
    const normalized = canonicalValue(value[childKey], { gameplay, rejectUndefined }, childKey);
    if (typeof normalized !== "undefined") out[childKey] = normalized;
  }
  return out;
}

function canonicalJson(value, options = {}) {
  return JSON.stringify(canonicalValue(value, options));
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
    const digest = createHash("sha256").update(SEED_NAMESPACE + index).digest();
    return digest.readUInt32BE(0) || 1;
  });
}

function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}

function normalizeLoose(value) {
  if (value === null || ["string", "boolean", "number"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(normalizeLoose);
  gate(value && typeof value === "object", "INVALID_LOOSE_VALUE", `type=${typeof value}`);
  const out = {};
  for (const key of Object.keys(value)) {
    if (typeof value[key] !== "undefined") out[key] = normalizeLoose(value[key]);
  }
  return out;
}

function normalizeFramePlayer(player) {
  gate(player?.id && player?.pos, "FRAME_PLAYER_SHAPE", JSON.stringify(player ?? null));
  return {
    id: player.id,
    x: player.pos.x,
    y: player.pos.y,
    hp: player.hp,
    dead: Boolean(player.dead),
    state: player.state,
    gun: player.gun ?? null,
    money: player.money,
    armor: Boolean(player.armor),
    helmet: Boolean(player.helmet),
    flash: player.flash,
    hasBomb: Boolean(player.hasBomb),
    nades: [...(player.nades ?? [])],
    routeIdx: player.routeIdx,
    routeT: player.routeT,
    reassigned: Boolean(player.reassigned),
    picking: player.picking,
    shooting: player.shooting,
    k: player.k,
    d: player.d,
    a: player.a,
    hsCount: player.hsCount,
    dmgDealt: player.dmgDealt,
    hitters: [...(player._hitters ?? [])].sort(),
  };
}

function normalizeSmoke(smoke) {
  return { id: smoke.id, x: smoke.pos.x, y: smoke.pos.y, tl: smoke.tl, age: smoke.age ?? null };
}

function normalizeMolly(molly) {
  return { id: molly.id, x: molly.pos.x, y: molly.pos.y, tl: molly.tl };
}

function normalizeThrowable(item) {
  return {
    id: item.id,
    type: item.type,
    side: item.side,
    from: { x: item.from.x, y: item.from.y },
    to: { x: item.to.x, y: item.to.y },
    t: item.t,
    flying: Boolean(item.flying),
    detonate: Boolean(item.detonate),
    boom: item.boom ?? null,
  };
}

function normalizeDroppedGun(item) {
  return { id: item.id, gun: item.gun, x: item.pos.x, y: item.pos.y };
}

function buildGameplayDocumentV1(sim, scenario) {
  gate(sim && Array.isArray(sim.frames) && Array.isArray(sim.players), "SIM_OUTPUT_SHAPE");
  gate(Array.isArray(sim.roundHist), "SIM_ROUND_HISTORY_SHAPE");
  return {
    schema: DIGEST_SCHEMA_V1,
    scenario: {
      seed: scenario.seed,
      mapKey: scenario.mapKey,
      tTacticId: scenario.tTactic.id,
      ctTacticId: scenario.ctTactic.id,
      inputSha256: scenario.inputSha256,
    },
    result: {
      tScore: sim.tScore,
      ctScore: sim.ctScore,
      roundCount: sim.rounds,
      players: [...sim.players].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((player) => ({
        id: player.id,
        side: player.side,
        roleKey: player.roleKey,
        k: player.k,
        d: player.d,
        a: player.a,
        adr: player.adr,
        hs: player.hs,
        hsPct: player.hsPct,
        kast: player.kast,
        mvpRounds: player.mvpRounds,
        clutches: player.clutches,
        entryKills: player.entryKills,
        rating: player.rating,
      })),
    },
    rounds: sim.roundHist.map((round, index) => ({
      round: index + 1,
      winner: round.winner,
      how: round.how,
      tScore: round.tS,
      ctScore: round.cS,
    })),
    frames: sim.frames.map((frame) => ({
      fi: frame.fi,
      rnd: frame.rnd,
      roundSec: frame.roundSec,
      buyP: Boolean(frame.buyP),
      target: frame.target,
      planted: Boolean(frame.planted),
      c4t: frame.c4t ?? null,
      ecoT: Boolean(frame.ecoT),
      ecoCT: Boolean(frame.ecoCT),
      players: [...frame.players].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(normalizeFramePlayer),
      events: (frame.events ?? []).map(normalizeLoose),
      smokes: (frame.smokes ?? []).map(normalizeSmoke),
      mollys: (frame.mollys ?? []).map(normalizeMolly),
      throwables: (frame.throwables ?? []).map(normalizeThrowable),
      droppedGuns: (frame.droppedGuns ?? []).map(normalizeDroppedGun),
      droppedBomb: frame.droppedBomb ? { x: frame.droppedBomb.pos.x, y: frame.droppedBomb.pos.y } : null,
      doorStates: normalizeLoose(frame.doorStates ?? {}),
    })),
  };
}

function buildTrajectoryDocument(gameplayDocument) {
  gate(gameplayDocument.schema === DIGEST_SCHEMA_V1, "TRAJECTORY_INPUT_SCHEMA");
  return {
    schema: TRAJECTORY_SCHEMA,
    allowlist: ALLOWED_GAMEPLAY_PATHS,
    scenario: gameplayDocument.scenario,
    result: {
      tScore: gameplayDocument.result.tScore,
      ctScore: gameplayDocument.result.ctScore,
      roundCount: gameplayDocument.result.roundCount,
      players: gameplayDocument.result.players.map(({ adr, mvpRounds, rating, ...player }) => player),
    },
    rounds: gameplayDocument.rounds,
    frames: gameplayDocument.frames.map((frame) => ({
      ...frame,
      players: frame.players.map(({ dmgDealt, ...player }) => player),
    })),
  };
}

function buildGameplayDocumentV2(gameplayDocumentV1) {
  return {
    ...gameplayDocumentV1,
    schema: DIGEST_SCHEMA_V2,
    metricSemantics: {
      damageAccounting: "effectiveHpDamage.v1",
      ratingFormula: "CsRating.v1",
    },
  };
}

function createCollector() {
  const events = [];
  return {
    events,
    record(type, payload) {
      gate(type === "damage_conversion", "UNKNOWN_EVENT_TYPE", type);
      const event = Object.freeze({ schema: EVENT_SCHEMA, type, ...payload });
      for (const [key, value] of Object.entries(event)) {
        gate(value === null || ["string", "number", "boolean"].includes(typeof value),
          "NON_PRIMITIVE_EVENT_FIELD", `key=${key}`);
      }
      events.push(event);
    },
  };
}

function scenarioInputSha256(seed, mapKey, tTactic, ctTactic, roster) {
  return sha256(canonicalJson({ seed, mapKey, tTactic, ctTactic, roster }, { rejectUndefined: true }));
}

function buildProgressProjection(api, sim, scenario, roster) {
  const raw = api.buildMatchResult(sim, {
    tacticT: scenario.tTactic,
    tacticCT: scenario.ctTactic,
    tName: "R8 T",
    ctName: "R8 CT",
    date: "R8-fixed",
  });
  raw.id = `cs_r8_${scenario.seed}`;
  const contractRoster = roster.filter((player) => player.side === "t")
    .map((player) => ({ ...player, _gid: `r8_${player.id}` }));
  const contract = toCsMatchResult(raw, {
    seed: scenario.seed,
    mapKey: scenario.mapKey,
    mapName: scenario.mapKey,
    tacticId: scenario.tTactic.id,
    tacticName: scenario.tTactic.name,
    tacticType: scenario.tTactic.type,
    roster: contractRoster,
  });
  gate(contract?.schema === "CsMatchResult.v1", "CONTRACT_ADAPTER_FAILED", `seed=${scenario.seed}`);
  const progressPlayers = contractRoster.map((player) => ({ id: player._gid, xp: 0 }));
  deepFreeze(contract);
  deepFreeze(progressPlayers);
  const before = sha256(canonicalJson({ contract, progressPlayers }, { rejectUndefined: true }));
  const transaction = csResultToTransaction(contract, { players: progressPlayers, streak: 2, fansNow: 1234 });
  const after = sha256(canonicalJson({ contract, progressPlayers }, { rejectUndefined: true }));
  gate(before === after, "PROGRESS_ADAPTER_MUTATED_INPUT", `seed=${scenario.seed}`);
  gate(transaction?.sourceResultVersion === "CsMatchResult.v1", "PROGRESS_TRANSACTION_MISSING");
  const progressById = new Map(transaction.playerProgress.map((item) => [item.playerId, item]));
  for (const player of contract.players) {
    const isMvp = player.playerId === (contract.mvp?.playerId ?? null);
    const expectedXp = playerXpFor({ win: contract.winner === "us", perf: csPerfFactor(player), isMvp });
    gate(progressById.get(player.playerId)?.xpGained === expectedXp, "PROGRESS_XP_FORMULA_DRIFT",
      `seed=${scenario.seed} player=${player.playerId}`);
  }
  return {
    winner: contract.winner,
    score: { us: contract.ourScore, enemy: contract.enemyScore },
    teamRewards: transaction.teamRewards,
    mvpId: contract.mvp?.playerId ?? null,
    players: [...contract.players].sort((a, b) => String(a.playerId).localeCompare(String(b.playerId))).map((player) => ({
      playerId: player.playerId,
      rating: player.rating,
      kast: player.kast,
      isMvp: player.playerId === (contract.mvp?.playerId ?? null),
      xpGained: progressById.get(player.playerId)?.xpGained ?? null,
    })),
  };
}

function validateDamageEvents(events, seed) {
  gate(events.length > 0, "NO_DAMAGE_EVENTS", `seed=${seed}`);
  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA && event.type === "damage_conversion", "EVENT_SHAPE", `seed=${seed}`);
    gate(Number.isInteger(event.round) && event.round >= 1, "EVENT_ROUND", `seed=${seed}`);
    gate(Number.isFinite(event.sec) && event.sec >= 0, "EVENT_SEC", `seed=${seed}`);
    gate(Number.isInteger(event.rolledDamage) && event.rolledDamage > 0, "ROLLED_DAMAGE", `seed=${seed}`);
    gate(Number.isInteger(event.hpBefore) && event.hpBefore > 0, "HP_BEFORE", `seed=${seed}`);
    const effective = Math.min(event.rolledDamage, event.hpBefore);
    const overkill = Math.max(0, event.rolledDamage - event.hpBefore);
    gate(event.effectiveDamage === effective, "EVENT_EFFECTIVE_DAMAGE", `seed=${seed}`);
    gate(event.overkillDamage === overkill, "EVENT_OVERKILL_DAMAGE", `seed=${seed}`);
    gate(event.kill === (event.rolledDamage >= event.hpBefore), "EVENT_KILL", `seed=${seed}`);
  }
}

function runScenario(api, { seed, mapKey, tTactic, ctTactic, roster, includeProgress }) {
  const inputSha256 = scenarioInputSha256(seed, mapKey, tTactic, ctTactic, roster);
  const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const collector1 = createCollector();
  const on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector1);
  const collector2 = createCollector();
  const on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector2);
  const offJson = JSON.stringify(off);
  gate(offJson === JSON.stringify(on1) && offJson === JSON.stringify(on2), "COLLECTOR_CHANGED_SIM", `seed=${seed}`);
  const eventJson1 = canonicalJson(collector1.events, { rejectUndefined: true });
  const eventJson2 = canonicalJson(collector2.events, { rejectUndefined: true });
  gate(eventJson1 === eventJson2, "EVENT_NON_DETERMINISTIC", `seed=${seed}`);
  validateDamageEvents(collector1.events, seed);
  gate(inputSha256 === scenarioInputSha256(seed, mapKey, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", `seed=${seed}`);
  const scenario = { seed, mapKey, tTactic, ctTactic, inputSha256 };
  const gameplayV1 = buildGameplayDocumentV1(off, scenario);
  const trajectory = buildTrajectoryDocument(gameplayV1);
  const gameplayV2 = buildGameplayDocumentV2(gameplayV1);
  return {
    seed,
    sim: off,
    events: collector1.events,
    gameplayDigestV1: sha256(canonicalJson(gameplayV1, { gameplay: true, rejectUndefined: true })),
    gameplayDigestV2: sha256(canonicalJson(gameplayV2, { gameplay: true, rejectUndefined: true })),
    trajectoryDigest: sha256(canonicalJson(trajectory, { gameplay: true, rejectUndefined: true })),
    eventDigest: sha256(eventJson1),
    progress: includeProgress ? buildProgressProjection(api, off, scenario, roster) : null,
  };
}

function evidenceProjection(baseline, treatment, seedSetSha256, sourceSha256) {
  const baselineSuitePayload = {
    schema: DIGEST_SCHEMA_V1,
    seedGenerationVersion: SEED_GENERATION_VERSION,
    seedSetSha256,
    baseline: baseline.map((record) => ({ seed: record.seed, gameplayDigest: record.gameplayDigestV1 })),
  };
  return {
    sourceSha256,
    baselineSuiteV1: sha256(canonicalJson(baselineSuitePayload, { rejectUndefined: true })),
    baseline: baseline.map((record) => ({
      seed: record.seed,
      gameplayDigestV1: record.gameplayDigestV1,
      trajectoryDigest: record.trajectoryDigest,
    })),
    treatment: treatment.map((record) => ({
      seed: record.seed,
      trajectoryDigest: record.trajectoryDigest,
    })),
    eventSuiteDigest: sha256(canonicalJson({
      schema: EVENT_SCHEMA,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256,
      baseline: baseline.map(({ seed, eventDigest }) => ({ seed, eventDigest })),
      treatment: treatment.map(({ seed, eventDigest }) => ({ seed, eventDigest })),
    }, { rejectUndefined: true })),
    progressNeutralSuiteDigest: sha256(canonicalJson(baseline.map((record) => ({
      seed: record.seed,
      winner: record.progress.winner,
      score: record.progress.score,
      teamRewards: record.progress.teamRewards,
      players: record.progress.players.map(({ playerId, kast }) => [playerId, kast]),
    })), { rejectUndefined: true })),
    progressFullSuiteDigest: sha256(canonicalJson(baseline.map((record) => ({
      seed: record.seed,
      progress: record.progress,
    })), { rejectUndefined: true })),
  };
}

function validateEffectiveAccounting(sim, events, seed) {
  const roundDamage = new Map();
  const key = (round, playerId) => `${round}|${playerId}`;
  for (const event of events) {
    const eventKey = key(event.round, event.attackerId);
    roundDamage.set(eventKey, (roundDamage.get(eventKey) ?? 0) + event.effectiveDamage);
  }

  for (const frame of sim.frames) {
    const round = frame.rnd + 1;
    for (const player of frame.players) {
      const expected = events
        .filter((event) => event.round === round && event.sec <= frame.roundSec && event.attackerId === player.id)
        .reduce((sum, event) => sum + event.effectiveDamage, 0);
      gate(player.dmgDealt === expected, "FRAME_EFFECTIVE_DAMAGE_MISMATCH",
        `seed=${seed} round=${round} sec=${frame.roundSec} player=${player.id} expected=${expected} actual=${player.dmgDealt}`);
    }
  }

  const mvpRoundCount = new Map();
  const kastRoundCount = new Map();
  for (let roundIndex = 0; roundIndex < sim.roundHist.length; roundIndex += 1) {
    const round = roundIndex + 1;
    const lastFrame = [...sim.frames].reverse().find((frame) => frame.rnd === roundIndex);
    gate(Boolean(lastFrame), "ROUND_LAST_FRAME_MISSING", `seed=${seed} round=${round}`);
    const frameById = new Map(lastFrame.players.map((player) => [player.id, player]));
    const rows = sim.players.map((resultPlayer) => {
      const framePlayer = frameById.get(resultPlayer.id);
      gate(Boolean(framePlayer), "ROUND_PLAYER_MISSING", `seed=${seed} round=${round} player=${resultPlayer.id}`);
      const damage = roundDamage.get(key(round, resultPlayer.id)) ?? 0;
      if (framePlayer.k > 0 || framePlayer.a > 0 || framePlayer.d === 0) {
        kastRoundCount.set(resultPlayer.id, (kastRoundCount.get(resultPlayer.id) ?? 0) + 1);
      }
      return {
        name: resultPlayer.name,
        side: resultPlayer.side,
        role: resultPlayer.role,
        k: framePlayer.k,
        d: framePlayer.d,
        a: framePlayer.a,
        dmg: Math.round(damage),
        adr: Math.round(damage / round),
        tk: framePlayer.k,
        td: framePlayer.d,
        ta: framePlayer.a,
      };
    }).sort((a, b) => (b.k * 100 + b.dmg) - (a.k * 100 + a.dmg));
    const expectedMvp = rows[0] && (rows[0].k > 0 || rows[0].dmg > 0) ? rows[0] : null;
    gate(canonicalJson(sim.roundHist[roundIndex].top) === canonicalJson(rows.slice(0, 4)),
      "ROUND_TOP_METRICS_MISMATCH", `seed=${seed} round=${round}`);
    gate(canonicalJson(sim.roundHist[roundIndex].mvp) === canonicalJson(expectedMvp),
      "ROUND_MVP_METRICS_MISMATCH", `seed=${seed} round=${round}`);
    if (expectedMvp) mvpRoundCount.set(expectedMvp.name, (mvpRoundCount.get(expectedMvp.name) ?? 0) + 1);
  }

  const rounds = Math.max(1, sim.tScore + sim.ctScore);
  for (const player of sim.players) {
    let totalDamage = 0;
    for (let round = 1; round <= sim.roundHist.length; round += 1) totalDamage += roundDamage.get(key(round, player.id)) ?? 0;
    const adr = totalDamage / rounds;
    const kast = (kastRoundCount.get(player.id) ?? 0) / rounds * 100;
    const expectedRating = Math.max(0, +(0.4 + 0.7 * (player.k / rounds) + 0.2 * (player.a / rounds)
      + 0.0045 * adr + 0.003 * kast - 0.55 * (player.d / rounds)).toFixed(3));
    gate(player.adr === Math.round(adr), "RESULT_ADR_MISMATCH", `seed=${seed} player=${player.id}`);
    gate(player.kast === Math.round(kast), "RESULT_KAST_MISMATCH", `seed=${seed} player=${player.id}`);
    gate(player.rating === expectedRating, "RESULT_RATING_MISMATCH",
      `seed=${seed} player=${player.id} expected=${expectedRating} actual=${player.rating}`);
    gate(player.mvpRounds === (mvpRoundCount.get(player.name) ?? 0), "RESULT_MVP_ROUNDS_MISMATCH",
      `seed=${seed} player=${player.id}`);
  }
  const expectedMvp = [...sim.players].sort((a, b) => b.rating - a.rating || b.k - a.k)[0] ?? null;
  gate(sim.mvp?.id === expectedMvp?.id, "FINAL_MVP_MISMATCH", `seed=${seed}`);
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN",
    "No update, rebaseline, seed, treatment, settlement, or migration flags are supported.");
  const originalSource = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(originalSource);
  const legacyStage = sourceSha256 === LEGACY_SOURCE_SHA256;
  const repairedStage = sourceSha256 === REPAIRED_SOURCE_SHA256 || sourceSha256 === CURRENT_SOURCE_SHA256;
  gate(legacyStage || repairedStage, "SOURCE_PROVENANCE_MISMATCH",
    `legacy=${LEGACY_SOURCE_SHA256}\nrepaired=${REPAIRED_SOURCE_SHA256}\nactual=${sourceSha256}`);
  const historicalSource = sourceSha256 === CURRENT_SOURCE_SHA256
    ? csR10LegacySource(originalSource) : originalSource;
  gate(randTokens(originalSource).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(originalSource).length}`);
  gate(canonicalJson(generatedSeeds()) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  const seedSetSha256 = sha256(canonicalJson(FIXED_SEEDS));
  gate(seedSetSha256 === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");
  for (const [relativePath, expectedSha256] of Object.entries(PROGRESS_SOURCE_PROVENANCE)) {
    const actualSha256 = sha256(readFileSync(resolve(ROOT, relativePath), "utf8"));
    gate(actualSha256 === expectedSha256, "PROGRESS_SOURCE_PROVENANCE_MISMATCH",
      `path=${relativePath}\nexpected=${expectedSha256}\nactual=${actualSha256}`);
  }

  const damageMarker = legacyStage ? LEGACY_DAMAGE_MARKER : REPAIRED_DAMAGE_MARKER;
  const damageReplacement = `${damageMarker}\n${DAMAGE_EVENT_HOOK}`;
  for (const marker of [SIGNATURE_MARKER, damageMarker, RETURN_MARKER, EXPORT_MARKER]) {
    gate(occurrences(historicalSource, marker) === 1, "MARKER_COUNT", marker);
  }

  let transformSeen = 0;
  let restoredExactly = false;
  let transformedRandIntegrity = false;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-result-r8-"));
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
        name: "cs-result-metrics-r8-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          const transformed = historicalSource
            .replace(SIGNATURE_MARKER, SIGNATURE_REPLACEMENT)
            .replace(damageMarker, damageReplacement)
            .replace(RETURN_MARKER, RETURN_REPLACEMENT)
            .replace(EXPORT_MARKER, EXPORT_REPLACEMENT);
          const restored = transformed
            .replace(EXPORT_REPLACEMENT, EXPORT_MARKER)
            .replace(RETURN_REPLACEMENT, RETURN_MARKER)
            .replace(damageReplacement, damageMarker)
            .replace(SIGNATURE_REPLACEMENT, SIGNATURE_MARKER);
          restoredExactly = restored === historicalSource;
          transformedRandIntegrity = canonicalJson(randTokens(transformed)) === canonicalJson(randTokens(historicalSource));
          gate(restoredExactly, "TRANSFORM_NOT_EXACTLY_REVERSIBLE");
          gate(transformedRandIntegrity, "TRANSFORM_CHANGED_RAND_TOKENS");
          return { code: transformed, map: null };
        },
      }],
    });

    const loaded = await vite.ssrLoadModule(FPS_MODULE_ID);
    gate(transformSeen === 1 && restoredExactly && transformedRandIntegrity, "TRANSFORM_INTEGRITY");
    const api = loaded.__CS_RESULT_METRICS_R8_TEST_API__;
    gate(typeof api?.simulateFps === "function", "TEST_SIMULATOR_EXPORT_MISSING");
    gate(typeof api?.buildMatchResult === "function", "TEST_RESULT_BUILDER_EXPORT_MISSING");
    gate(Array.isArray(api?.ROSTER), "TEST_ROSTER_EXPORT_MISSING");

    const mapKey = "inferno";
    const baselineRoster = clonePlain(api.ROSTER);
    const treatmentRoster = clonePlain(api.ROSTER);
    const baselineTarget = baselineRoster.find((player) => player.id === "t2");
    const treatmentTarget = treatmentRoster.find((player) => player.id === "t2");
    gate(baselineTarget?.side === "t" && baselineTarget?.role === "rifler" && baselineTarget?.stats?.acc === 88,
      "TARGET_BASELINE_MISMATCH");
    treatmentTarget.stats.acc = 68;
    const tTactic = clonePlain(api.TACTICS_DB?.inferno?.t?.find((item) => item.id === "t_aexec"));
    const ctTactic = clonePlain(api.TACTICS_DB?.inferno?.ct?.find((item) => item.id === "c_std"));
    gate(tTactic?.id === "t_aexec" && ctTactic?.id === "c_std", "TACTIC_MISSING");
    deepFreeze(baselineRoster);
    deepFreeze(treatmentRoster);
    deepFreeze(tTactic);
    deepFreeze(ctTactic);

    const baseline = [];
    const treatment = [];
    for (const seed of FIXED_SEEDS) {
      baseline.push(runScenario(api, { seed, mapKey, tTactic, ctTactic, roster: baselineRoster, includeProgress: true }));
      treatment.push(runScenario(api, { seed, mapKey, tTactic, ctTactic, roster: treatmentRoster, includeProgress: false }));
    }

    const evidence = evidenceProjection(baseline, treatment, seedSetSha256, sourceSha256);
    console.log(`stage: ${legacyStage ? "legacy-evidence" : "repaired"}`);
    console.log(`sourceSha256: ${sourceSha256}`);
    console.log(`seed generation version: ${SEED_GENERATION_VERSION}`);
    console.log(`seeds: ${JSON.stringify(FIXED_SEEDS)}`);
    console.log(`seedSetSha256: ${seedSetSha256}`);

    if (legacyStage) {
      gate(evidence.baselineSuiteV1 === LEGACY_BASELINE_SUITE_V1, "LEGACY_SUITE_RECONSTRUCTION_MISMATCH",
        `expected=${LEGACY_BASELINE_SUITE_V1}\nactual=${evidence.baselineSuiteV1}`);
      if (EXPECTED_LEGACY_EVIDENCE === null) console.log(`legacyEvidenceCandidate: ${JSON.stringify(evidence)}`);
      gate(EXPECTED_LEGACY_EVIDENCE !== null, "LEGACY_EVIDENCE_NOT_LOCKED");
      gate(canonicalJson(evidence, { rejectUndefined: true })
        === canonicalJson(EXPECTED_LEGACY_EVIDENCE, { rejectUndefined: true }), "LEGACY_EVIDENCE_REGRESSION");
      console.log(`legacyBaselineSuiteV1: ${evidence.baselineSuiteV1}`);
      console.log(`legacy per-seed gameplay digests: ${evidence.baseline.length}/${FIXED_SEEDS.length} locked`);
      console.log(`baseline/treatment trajectory digests: ${evidence.baseline.length}/${evidence.treatment.length} locked`);
      console.log(`eventSuiteDigest: ${evidence.eventSuiteDigest}`);
      console.log(`progressNeutralSuiteDigest: ${evidence.progressNeutralSuiteDigest}`);
      console.log("CS Result Metrics R8 Legacy Evidence: PASS");
      return;
    }

    gate(EXPECTED_LEGACY_EVIDENCE !== null, "LEGACY_EVIDENCE_MISSING_AFTER_REPAIR");
    const legacyBaselineBySeed = new Map(EXPECTED_LEGACY_EVIDENCE.baseline.map((record) => [record.seed, record]));
    const legacyTreatmentBySeed = new Map(EXPECTED_LEGACY_EVIDENCE.treatment.map((record) => [record.seed, record]));
    let changedGameplayDigests = 0;
    for (const record of baseline) {
      const old = legacyBaselineBySeed.get(record.seed);
      gate(Boolean(old), "LEGACY_BASELINE_SEED_MISSING", String(record.seed));
      gate(record.trajectoryDigest === old.trajectoryDigest, "NON_ALLOWLIST_GAMEPLAY_DIFF", `arm=baseline seed=${record.seed}`);
      validateEffectiveAccounting(record.sim, record.events, record.seed);
      if (record.gameplayDigestV1 !== old.gameplayDigestV1) changedGameplayDigests += 1;
    }
    for (const record of treatment) {
      const old = legacyTreatmentBySeed.get(record.seed);
      gate(Boolean(old), "LEGACY_TREATMENT_SEED_MISSING", String(record.seed));
      gate(record.trajectoryDigest === old.trajectoryDigest, "NON_ALLOWLIST_GAMEPLAY_DIFF", `arm=treatment seed=${record.seed}`);
      validateEffectiveAccounting(record.sim, record.events, record.seed);
    }
    gate(evidence.eventSuiteDigest === EXPECTED_LEGACY_EVIDENCE.eventSuiteDigest,
      "DAMAGE_EVENT_STREAM_REGRESSION");
    gate(evidence.progressNeutralSuiteDigest === EXPECTED_LEGACY_EVIDENCE.progressNeutralSuiteDigest,
      "PROGRESS_NON_METRIC_INPUT_CHANGED");
    gate(changedGameplayDigests > 0, "REPAIR_DID_NOT_CHANGE_V1_METRICS");

    const suiteV2 = sha256(canonicalJson({
      schema: DIGEST_SCHEMA_V2,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256,
      baseline: baseline.map((record) => ({ seed: record.seed, gameplayDigest: record.gameplayDigestV2 })),
    }, { rejectUndefined: true }));
    console.log(`legacyBaselineSuiteV1: ${LEGACY_BASELINE_SUITE_V1}`);
    console.log(`repairedBaselineSuiteV2: ${suiteV2}`);
    console.log(`changed v1 gameplay digests: ${changedGameplayDigests}/${FIXED_SEEDS.length}`);
    console.log(`allowed gameplay paths: ${JSON.stringify(ALLOWED_GAMEPLAY_PATHS)}`);
    gate(EXPECTED_REPAIRED_BASELINE_SUITE_V2 !== "__CAPTURE_MANUALLY__", "REPAIRED_V2_NOT_LOCKED",
      `candidate=${suiteV2}`);
    gate(suiteV2 === EXPECTED_REPAIRED_BASELINE_SUITE_V2, "REPAIRED_V2_REGRESSION",
      `expected=${EXPECTED_REPAIRED_BASELINE_SUITE_V2}\nactual=${suiteV2}`);
    console.log("history settlement/migration: not invoked (pure contract/progress adapters only)");
    console.log("CS Result Metrics R8: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
