import assert from "node:assert/strict";
import { checkFpsRendererIdentity } from "../src/battle/fps/fpsIdentity.js";
import { checkFpsRuntimeVisibility, resolveFpsPresentationVisibility, summarizeFpsTeamVisibility } from "../src/battle/fps/fpsVisibilityDiagnostics.js";

const checks = [];
function pass(label, condition) { assert.equal(Boolean(condition), true, label); checks.push(label); console.log(`PASS ${label}`); }
const transform = { position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
function player(id, team, overrides = {}) {
  const resolved = resolveFpsPresentationVisibility({ entityExists: true, identityMiss: false, rootVisible: true, parentVisible: true, sceneVisible: true, playerGroupVisible: true, primitiveBodyVisible: true, riggedRootVisible: false, riggedActive: false, transform, ...overrides });
  return { id, team, authoritativePresent: true, authoritativeAlive: true, entityExists: true, entityType: "fallback", rootVisible: true, parentVisible: true, bodyVisible: true, riggedRootVisible: false, identityMiss: false, transformFinite: true, inCameraFrustum: true, inCameraViewport: true, presentationVisible: resolved.presentationVisible, visibilityReason: resolved.reason, ...overrides };
}
function roster() { return [...Array.from({ length: 5 }, (_, index) => player(`t${index + 1}`, "t")), ...Array.from({ length: 5 }, (_, index) => player(`ct${index + 1}`, "ct"))]; }
function runtime(players, options = {}) { return checkFpsRuntimeVisibility({ players, requireCameraViewport: true, ...options }); }

const initial = roster();
const identity = checkFpsRendererIdentity({ framePlayers: initial.map(({ id, team }) => ({ id, side: team })), rendererEntities: initial.map(({ id, team }) => ({ id, side: team })) });
pass("authoritative 10 players map to 10 renderer entities", identity.ok);
pass("BLUE and RED each contain five entities", summarizeFpsTeamVisibility(initial).blue.entities === 5 && summarizeFpsTeamVisibility(initial).red.entities === 5);
pass("all alive players have visible presentation", runtime(initial).ok);

const deadPresentation = initial.map((entry, index) => index === 0 ? { ...entry, authoritativeAlive: false, presentationVisible: false, visibilityReason: "death-presentation" } : entry);
const deadCheck = runtime(deadPresentation);
pass("dead presentation is legal and distinct from identity miss", deadCheck.ok && deadCheck.identityMisses.length === 0 && deadCheck.aliveHidden.length === 0);
const nextRound = deadPresentation.map((entry) => entry.authoritativeAlive === false ? { ...entry, authoritativeAlive: true, presentationVisible: true, visibilityReason: "visible" } : entry);
pass("dead to alive next-round reset restores visible presentation", runtime(nextRound).ok);

const wholeTeamWipe = initial.map((entry) => entry.team === "ct" ? { ...entry, authoritativeAlive: false, presentationVisible: false, visibilityReason: "death-presentation" } : entry);
pass("whole-team wipe can enter legal death presentation", runtime(wholeTeamWipe).ok);
const wholeTeamRevive = wholeTeamWipe.map((entry) => entry.team === "ct" ? { ...entry, authoritativeAlive: true, presentationVisible: true, visibilityReason: "visible" } : entry);
const reviveSummary = summarizeFpsTeamVisibility(wholeTeamRevive);
pass("whole-team wipe followed by next round restores 5v5 visibility", runtime(wholeTeamRevive).ok && reviveSummary.blue.visiblePresentation === 5 && reviveSummary.red.visiblePresentation === 5);

for (const lifecycle of ["restart", "rematch", "map-change", "bo3-map-2", "bo3-map-3"]) {
  const result = runtime(roster());
  pass(`${lifecycle} has no stale renderer visibility state`, result.ok && result.identityMisses.length === 0 && result.nonFiniteTransforms.length === 0);
}

const rigged = player("t1", "t", { bodyVisible: false, riggedRootVisible: true, entityType: "rigged", riggedActive: true });
pass("rigged late-load presentation is visible through the rigged root", rigged.presentationVisible === true);
const fallback = player("t1", "t", { bodyVisible: true, riggedRootVisible: false, entityType: "fallback", riggedActive: false });
pass("primitive fallback presentation remains visible", fallback.presentationVisible === true);

const identityMiss = resolveFpsPresentationVisibility({ entityExists: true, identityMiss: true, rootVisible: true, parentVisible: true, sceneVisible: true, playerGroupVisible: true, primitiveBodyVisible: true, transform });
pass("identity miss is not classified as authoritative death", identityMiss.reason === "identity-miss" && identityMiss.presentationVisible === false);
const parentHidden = player("t1", "t", { parentVisible: false });
pass("hidden shared parent is reported as presentation visibility failure", parentHidden.presentationVisible === false && parentHidden.visibilityReason === "parent-hidden");
const nonFinite = player("t1", "t", { transformFinite: false, presentationVisible: false, visibilityReason: "non-finite-or-zero-transform" });
const finiteCheck = runtime([...initial.slice(1), nonFinite]);
pass("non-finite transform is rejected", finiteCheck.ok === false && finiteCheck.nonFiniteTransforms.includes("t1"));
const cameraOffscreen = initial.map((entry) => entry.team === "t" ? { ...entry, inCameraViewport: false } : entry);
const cameraCheck = runtime(cameraOffscreen);
pass("alive players outside camera viewport are caught separately", cameraCheck.ok === false && cameraCheck.aliveOffCamera.length === 5 && cameraCheck.identityMisses.length === 0);

console.log(`CS renderer visibility verifier: ${checks.length}/${checks.length} PASS`);
