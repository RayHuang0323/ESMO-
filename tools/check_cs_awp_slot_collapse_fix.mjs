#!/usr/bin/env node
// Focused regression guard for the AWP slot-collapse hotfix.
//
// The simulator is loaded through a reversible in-memory Vite transform so the
// verifier can exercise the production runtime without exporting new gameplay
// APIs from the product file. The roster adapter intentionally recomputes fps
// metadata after synthetic stats are applied; it must not copy a stale slot
// template value into the evidence fixture.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const DEFAULT_OUT = "artifacts/cs-awp-slot-collapse/fix-evidence.json";

const SHORT_KEYS = Object.freeze([
  "rxn", "acc", "apm", "pos", "vis", "tac", "dec", "adp",
  "cou", "str", "foc", "res", "com", "led", "coo", "lrn",
]);
const COMMON_ROLES = Object.freeze(["entry", "rifler", "awp", "support", "rifler"]);
const ROLE_ZH = Object.freeze({ entry: "突破手", rifler: "步槍手", awp: "狙擊手", support: "輔助" });
const MAP_TACTICS = Object.freeze({ mirage: "t_apalace", inferno: "t_banana" });
const arg = (name, fallback) => {
  const prefix = "--" + name + "=";
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
};
const MAPS = (arg("maps", "mirage") || "").split(",").map((x) => x.trim()).filter(Boolean);
const SIDES = (arg("sides", "t") || "").split(",").map((x) => x.trim()).filter((x) => x === "t" || x === "ct");
const SEEDS = (arg("seeds", "13") || "").split(",").map((x) => Number(x.trim())).filter(Number.isFinite);
const ONLY = (arg("only", "cbr_entry_slot0,cbr_awp_slot2") || "").split(",").map((x) => x.trim()).filter(Boolean);
const OUT = resolve(ROOT, arg("out", DEFAULT_OUT));
const PARITY = arg("parity", "false") === "true";
const PHASE = arg("phase", "after");

const fail = (message) => { throw new Error("[AWP_FIX] " + message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const json = (value) => JSON.stringify(value);
const digest = (value) => createHash("sha256").update(json(value) ?? "undefined").digest("hex");
const round = (value, digits = 3) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const scale = 10 ** digits;
  return Math.round(n * scale) / scale;
};
const countBy = (values) => values.reduce((out, value) => {
  const key = value == null ? "null" : String(value);
  out[key] = (out[key] || 0) + 1;
  return out;
}, {});
const sum = (values) => values.reduce((total, value) => total + Number(value || 0), 0);
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const parityFingerprint = (row) => stable(JSON.parse(JSON.stringify({ ...row, elapsedMs: undefined })));

async function loadApi() {
  const source = PHASE === "before"
    ? execFileSync("git", ["show", "origin/main:src/battle/fps/EsportsFPS3D.jsx"], { cwd: ROOT, encoding: "utf8" })
    : readFileSync(FPS_FILE, "utf8");
  assert(source.split(RETURN_MARKER).length - 1 === 1, "return marker count changed");
  assert(source.split(EXPORT_MARKER).length - 1 === 1, "export marker count changed");
  const returned = source.replace(
    RETURN_MARKER,
    "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, c5bFullBuyWeapon, COST, weaponAuthority };",
  );
  const transformed = returned.replace(
    EXPORT_MARKER,
    `const __CS_AWP_FIX_API__ = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  buildMatchResult: __FPS3D_MODULE.buildMatchResult,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
  c5bFullBuyWeapon: __FPS3D_MODULE.c5bFullBuyWeapon,
  COST: __FPS3D_MODULE.COST,
  weaponAuthority: __FPS3D_MODULE.weaponAuthority,
});
export { EsportsFPS3D, buildMatchResult, __CS_AWP_FIX_API__ };`,
  );
  assert(transformed !== source, "runtime export transform did not apply");
  const restored = transformed
    .replace(/const __CS_AWP_FIX_API__ = Object\.freeze\(\{[\s\S]*?export \{ EsportsFPS3D, buildMatchResult, __CS_AWP_FIX_API__ \};/, EXPORT_MARKER)
    .replace(
      "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, c5bFullBuyWeapon, COST, weaponAuthority };",
      RETURN_MARKER,
    );
  assert(restored === source, "runtime API transform is not reversible");
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-awp-fix-"));
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
      server: { middlewareMode: true, hmr: false },
      plugins: [{
        name: "cs-awp-slot-collapse-fix-api",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          if (PHASE !== "before") assert(code === source, "Vite source differs from verifier source");
          return { code: transformed, map: null };
        },
      }],
    });
    const loaded = await vite.ssrLoadModule(FPS_MODULE_ID + "?awp-slot-collapse=fix");
    assert(loaded.__CS_AWP_FIX_API__, "focused verifier API missing");
    return {
      api: loaded.__CS_AWP_FIX_API__,
      source,
      sourceHash,
      async close() {
        if (vite) await vite.close();
        try { rmSync(tempRoot, { recursive: true, force: true }); } catch { /* verifier cleanup */ }
      },
    };
  } catch (error) {
    if (vite) await vite.close();
    try { rmSync(tempRoot, { recursive: true, force: true }); } catch { /* verifier cleanup */ }
    throw error;
  }
}

function uniformStats(value) {
  return Object.fromEntries(SHORT_KEYS.map((key) => [key, value]));
}

function makeRoster(api, { starSide, starSlot, starRole, flatRole, starValue = 90, lowValue = 46, flatValue = 64 }) {
  const base = api.ROSTER.map((player) => ({ ...player, stats: { ...(player.stats || {}) } }));
  const templates = base.filter((player) => /^t[1-5]$/.test(player.id));
  const starRoles = COMMON_ROLES.slice();
  const flatRoles = COMMON_ROLES.slice();
  starRoles[starSlot] = starRole;
  flatRoles[starSlot] = flatRole;
  const starValues = Array(5).fill(lowValue);
  starValues[starSlot] = starValue;
  const flatValues = Array(5).fill(flatValue);
  const patchSide = (rows, side, values, roles) => {
    let index = 0;
    return rows.map((player) => {
      const matches = side === "t" ? /^t[1-5]$/.test(player.id) : /^ct[1-5]$/.test(player.id);
      if (!matches) return { ...player, stats: { ...(player.stats || {}) } };
      const template = templates[index];
      const stats = uniformStats(values[index]);
      const output = {
        ...player,
        stats,
        role: roles[index],
        fpsRole: ROLE_ZH[roles[index]] || roles[index],
        // Evidence adapter fix: stats override must own the derived metadata.
        fps: Math.round((stats.acc + stats.rxn + stats.apm + stats.pos) / 4),
        moba: template?.moba,
        personality: template?.personality,
        sta: template?.sta,
      };
      index += 1;
      return output;
    });
  };
  let roster = patchSide(base, "t", starSide === "t" ? starValues : flatValues, starSide === "t" ? starRoles : flatRoles);
  roster = patchSide(roster, "ct", starSide === "ct" ? starValues : flatValues, starSide === "ct" ? starRoles : flatRoles);
  return { roster, starId: (starSide === "t" ? "t" : "ct") + String(starSlot + 1) };
}

function tacticFor(api, mapKey) {
  const tacticId = MAP_TACTICS[mapKey];
  const tactic = api.TACTICS_DB?.[mapKey]?.t?.find((candidate) => candidate.id === tacticId);
  assert(tactic, `missing tactic ${mapKey}/${tacticId}`);
  return JSON.parse(JSON.stringify(tactic));
}

function playerInFrame(frame, id) {
  return (frame?.players || []).find((player) => player.id === id) || null;
}

function compactResult(api, result, roster, starId, starSide, config, elapsedMs) {
  const star = result.players?.find((player) => player.id === starId) || null;
  const buyRows = (result.buyAudit?.rounds || []).flatMap((roundRow) => (roundRow.players || [])
    .filter((player) => player.id === starId)
    .map((player) => ({
      round: roundRow.round,
      ...player,
      target: roundRow.target,
      buyTypeByTeam: roundRow.buyTypeByTeam,
    })));
  const purchaseRows = buyRows.filter((row) => row.purchase);
  const shotRows = (result.shotCadenceTelemetry || []).filter((event) => event.attackerId === starId);
  const reactionRows = (result.reactionTelemetry || []).filter((event) => event.actorId === starId);
  const routeRows = (result.navigationAudit?.routeHistory || []).filter((entry) => entry.id === starId);
  const starSideScore = starSide === "t" ? result.tScore : result.ctScore;
  const opponentScore = starSide === "t" ? result.ctScore : result.tScore;
  const stats = roster.find((player) => player.id === starId)?.stats || {};
  const firstFrame = result.frames?.find((frame) => playerInFrame(frame, starId)?.stats);
  const firstPlayer = playerInFrame(firstFrame, starId);
  const weaponCounts = countBy(buyRows.map((row) => row.weapon).filter(Boolean));
  const familyCounts = countBy(buyRows.map((row) => row.weaponFamily).filter(Boolean));
  const nonEcoRows = buyRows.filter((row) => row.buyType === "full" || row.buyType === "force");
  const nonEcoPistols = nonEcoRows.filter((row) => row.weaponFamily === "pistol");
  const nonEcoPrimaryUnavailable = nonEcoRows.filter((row) => row.weaponFamily === "pistol" && Number(row.startMoney || 0) < 1050);
  const snapshot = {
    map: result.mapKey,
    seed: config.seed,
    starSide,
    starId,
    starSlot: config.starSlot,
    starRole: config.starRole,
    flatRole: config.flatRole,
    elapsedMs: round(elapsedMs, 1),
    completed: result.completed === true,
    winner: result.winner,
    score: { starTeam: starSideScore, opponent: opponentScore, t: result.tScore, ct: result.ctScore },
    starWon: starSideScore > opponentScore,
    rounds: result.rounds,
    star: {
      name: star?.name || firstPlayer?.name || null,
      runtimeOverall: {
        adapterFps: roster.find((player) => player.id === starId)?.fps ?? null,
        statsMean16: round(sum(SHORT_KEYS.map((key) => stats[key])) / SHORT_KEYS.length, 2),
        combatStatsAll90: SHORT_KEYS.every((key) => stats[key] === 90),
      },
      final: star ? { kills: star.k, deaths: star.d, assists: star.a, adr: star.adr, role: star.role, teamId: star.teamId } : null,
      purchases: {
        weaponCounts,
        familyCounts,
        purchaseCounts: countBy(purchaseRows.map((row) => row.purchase)),
        buyTypes: countBy(buyRows.map((row) => row.buyType)),
        totalSpent: sum(buyRows.map((row) => row.spent)),
        rows: buyRows,
        nonEcoRows: nonEcoRows.length,
        nonEcoPistolRows: nonEcoPistols.length,
        nonEcoPistolWithoutPrimaryBudget: nonEcoPrimaryUnavailable.length,
      },
      engagement: {
        visible: reactionRows.length,
        acquired: reactionRows.filter((event) => event.targetAcquired).length,
        firstShot: reactionRows.filter((event) => event.shot).length,
        shots: shotRows.length,
        hits: shotRows.filter((event) => event.hit).length,
        damage: sum(shotRows.map((event) => event.damage)),
      },
      movement: {
        routeAssignments: routeRows.length,
        routeVariants: countBy(routeRows.map((entry) => entry.variant)),
        distance: round((result.movementAudit?.distanceByPlayer?.[starId] ?? 0), 2),
        stuck: (result.navigationAudit?.stuckEpisodes || []).filter((entry) => entry.playerId === starId).length,
        unresolvedStuck: (result.navigationAudit?.unresolvedStuckEpisodes || []).filter((entry) => entry.playerId === starId).length,
      },
      bomb: {
        plants: (result.bombAudit?.plantEvents || []).filter((event) => event.carrierId === starId).length,
        defuses: (result.bombAudit?.defuseEvents || []).filter((event) => event.defuserId === starId).length,
      },
    },
    team: {
      roundWins: (result.roundHist || []).filter((row) => row.winnerTeam === (star?.teamId || (starSide === "t" ? "us" : "enemy"))).length,
      kills: (result.players || []).filter((player) => player.teamId === star?.teamId).reduce((total, player) => total + Number(player.k || 0), 0),
      deaths: (result.players || []).filter((player) => player.teamId === star?.teamId).reduce((total, player) => total + Number(player.d || 0), 0),
      plants: (result.bombAudit?.plantEvents || []).length,
      defuses: (result.bombAudit?.defuseEvents || []).length,
      explosions: (result.bombAudit?.explosionEvents || []).length,
    },
  };
  return snapshot;
}

function scenarioConfig(id) {
  const configs = {
    cbr_entry_slot0: { starSlot: 0, starRole: "entry", flatRole: "entry" },
    cbr_awp_slot2: { starSlot: 2, starRole: "awp", flatRole: "awp" },
    natural_entry_at_awp_slot: { starSlot: 2, starRole: "entry", flatRole: "awp" },
    natural_awp_at_awp_slot: { starSlot: 2, starRole: "awp", flatRole: "awp" },
  };
  assert(configs[id], "unknown scenario " + id);
  return { id, ...configs[id] };
}

async function runOne(api, mapKey, starSide, seed, config) {
  const prepared = makeRoster(api, { starSide, ...config });
  const before = json(prepared.roster);
  const tactic = tacticFor(api, mapKey);
  const t0 = performance.now();
  const result = api.simulateFps(mapKey, tactic, JSON.parse(JSON.stringify(tactic)), seed, prepared.roster);
  const elapsedMs = performance.now() - t0;
  assert(json(prepared.roster) === before, "simulate mutated synthetic roster");
  return compactResult(api, result, prepared.roster, prepared.starId, starSide, { ...config, seed }, elapsedMs);
}

function directBuyMatrix(api) {
  const player = { ...api.ROSTER.find((candidate) => candidate.id === "t3"), role: "awp", fps: 90, stats: uniformStats(90) };
  const tactic = { type: "default", site: "a" };
  const matrix = {};
  for (const side of ["t", "ct"]) {
    for (const money of [6000, 3000, 1500, 900]) {
      const choices = [];
      for (let round = 1; round <= 256; round += 1) {
        choices.push(api.c5bFullBuyWeapon(player, {
          side, money, mapKey: "mirage", round, tactic, target: "a", scoreDiff: 0,
        }));
      }
      matrix[`${side}:${money}`] = {
        counts: countBy(choices),
        nullChoices: choices.filter((choice) => choice == null).length,
        primaryChoices: choices.filter((choice) => choice != null && ["rifle", "sniper", "smg", "shotgun"].includes(api.weaponAuthority(choice)?.family)).length,
      };
    }
  }
  return matrix;
}

function printRow(row) {
  const s = row.star;
  console.log(`${row.map} seed=${row.seed} side=${row.starSide} ${row.starRole} score=${row.score.starTeam}:${row.score.opponent}`
    + ` win=${row.starWon} K/D=${s.final?.kills ?? "-"}/${s.final?.deaths ?? "-"}`
    + ` families=${json(s.purchases.familyCounts)} shots/hits=${s.engagement.shots}/${s.engagement.hits}`
    + ` nonEcoPistol=${s.purchases.nonEcoPistolRows} route=${s.movement.routeAssignments} stuck=${s.movement.stuck} ms=${row.elapsedMs}`);
}

async function main() {
  assert(MAPS.length > 0 && SIDES.length > 0 && SEEDS.length > 0, "maps/sides/seeds cannot be empty");
  const loaded = await loadApi();
  const rows = [];
  const configs = ONLY.map(scenarioConfig);
  try {
    console.log("AWP_SLOT_COLLAPSE minimal-fix verifier");
    console.log(`sourceHash=${loaded.sourceHash} maps=${MAPS.join(",")} sides=${SIDES.join(",")} seeds=${SEEDS.join(",")}`);
    console.log("CBR fixture: [90,46,46,46,46] vs [64x5]; stats-derived fps metadata adapter");
    for (const mapKey of MAPS) {
      for (const config of configs) {
        for (const seed of SEEDS) {
          for (const starSide of SIDES) {
            const row = await runOne(loaded.api, mapKey, starSide, seed, config);
            row.scenario = config.id;
            rows.push(row);
            printRow(row);
          }
        }
      }
    }
    const buyMatrix = directBuyMatrix(loaded.api);
    console.log("directBuyMatrix=" + json(buyMatrix));
    if (PHASE === "after") {
      for (const key of ["t:6000", "ct:6000", "t:3000", "ct:3000", "t:1500", "ct:1500"]) {
        assert(buyMatrix[key].nullChoices === 0 && buyMatrix[key].primaryChoices > 0, `AWP fallback has no primary path at ${key}`);
      }
      for (const key of ["t:6000", "ct:6000"]) {
        assert(buyMatrix[key].counts.awp === 256, `AWP role lost AWP preference at ${key}`);
      }
      for (const key of ["t:900", "ct:900"]) {
        assert(buyMatrix[key].nullChoices === 256 && buyMatrix[key].primaryChoices === 0, `pistol/eco boundary changed unexpectedly at ${key}`);
      }
      for (const row of rows) {
        assert(row.completed, `${row.map}/${row.starSide}/${row.scenario} did not complete`);
        assert(row.star.runtimeOverall.combatStatsAll90, `${row.map}/${row.starSide}/${row.scenario} lost 90 stats`);
        assert(row.star.runtimeOverall.adapterFps === 90, `${row.map}/${row.starSide}/${row.scenario} metadata overall is not 90`);
      }
    } else {
      console.log("phase=before; post-fix assertions skipped");
    }
    if (PARITY) {
      const parityRows = [];
      for (const row of rows.filter((candidate) => candidate.map === "mirage" && candidate.starSide === "t")) {
        const config = scenarioConfig(row.scenario);
        const replay = await runOne(loaded.api, row.map, row.starSide, row.seed, config);
        replay.scenario = row.scenario;
        const firstFingerprint = parityFingerprint(row);
        const secondFingerprint = parityFingerprint(replay);
        const first = digest(firstFingerprint);
        const second = digest(secondFingerprint);
        if (first !== second) {
          const fields = [...new Set([...Object.keys(firstFingerprint), ...Object.keys(secondFingerprint)])]
            .filter((key) => digest(firstFingerprint[key]) !== digest(secondFingerprint[key]));
          console.log("parity-diff-fields=" + json(fields));
        }
        parityRows.push({ scenario: row.scenario, first, second, equal: first === second });
      }
      console.log("parity=" + json(parityRows));
      assert(parityRows.every((entry) => entry.equal), "same-seed deterministic digest mismatch");
    }
    const artifact = {
      schema: "CsAwpslotCollapseMinimalFix.v1",
      generatedAt: new Date().toISOString(),
      source: { baseline: "origin/main @ e86ace1183cc28af16bf24a7df3a1e61c7b294eb", runtime: "src/battle/fps/EsportsFPS3D.jsx", sourceHash: loaded.sourceHash },
      methodology: { deterministic: true, currentFormalRuntime: true, runtimeSource: PHASE === "before" ? "origin/main" : "hotfix worktree", cbrFixture: "[90,46,46,46,46] vs [64x5]", adapterMetadata: "recomputed from overridden stats", noProductApiMutation: true, phase: PHASE },
      rows,
      directBuyMatrix: buyMatrix,
      digest: digest(rows.map((row) => ({ ...row, elapsedMs: undefined }))),
    };
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(artifact, null, 2), "utf8");
    console.log("artifact=" + OUT);
    console.log("artifactDigest=" + artifact.digest);
  } finally {
    await loaded.close();
  }
}

main().catch((error) => {
  console.error("AWP_SLOT_COLLAPSE FIX VERIFIER FAIL " + (error?.stack || error));
  process.exitCode = 1;
});

