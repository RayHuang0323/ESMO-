import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkFpsDeathVisibility,
  checkFpsRendererIdentity,
  fpsRosterIdentityKey,
} from "../src/battle/fps/fpsIdentity.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererSource = fs.readFileSync(path.join(ROOT, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");

const checks = [];
function check(name, fn) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail: detail ?? "" });
  } catch (error) {
    checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function makeRoster(tPrefix = "t", ctPrefix = "ct") {
  return [
    ...Array.from({ length: 5 }, (_, index) => ({ id: `${tPrefix}${index + 1}`, side: "t" })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `${ctPrefix}${index + 1}`, side: "ct" })),
  ];
}

function makeFrame(roster, deadIds = new Set()) {
  return roster.map((player) => ({ ...player, dead: deadIds.has(player.id) }));
}

function makeRenderer(roster, mapKey = "map-1") {
  return roster.map((player) => ({ id: player.id, side: player.side, mapKey, bodyVisible: true }));
}

const baseRoster = makeRoster();
const baseFrame = makeFrame(baseRoster);
const baseRenderer = makeRenderer(baseRoster);

check("baseline: 10 frame identities map to 10 renderer entities", () => {
  const result = checkFpsRendererIdentity({ framePlayers: baseFrame, rendererEntities: baseRenderer });
  expect(result.ok, JSON.stringify(result));
  expect(result.frameIds.length === 10 && result.rendererIds.length === 10, "expected 10 ids on both sides");
  expect(result.frameSides.t === 5 && result.frameSides.ct === 5, "frame is not 5v5");
  expect(result.rendererSides.t === 5 && result.rendererSides.ct === 5, "renderer is not 5v5");
  return "10/10, T 5 + CT 5";
});

check("player ids are unique and roster key is deterministic", () => {
  const result = checkFpsRendererIdentity({ framePlayers: baseFrame, rendererEntities: baseRenderer });
  expect(result.duplicateFrameIds.length === 0 && result.duplicateRendererIds.length === 0, "duplicate id");
  expect(fpsRosterIdentityKey(baseRoster) === fpsRosterIdentityKey([...baseRoster]), "roster key is not stable");
  return fpsRosterIdentityKey(baseRoster);
});

check("substitution rebuild has no missing or stale identity", () => {
  const substituted = baseRoster.map((player, index) => index === 2 ? { ...player, id: "sub_t3" } : player);
  const result = checkFpsRendererIdentity({
    framePlayers: makeFrame(substituted),
    rendererEntities: makeRenderer(substituted),
  });
  expect(result.ok, JSON.stringify(result));
  const stalePool = checkFpsRendererIdentity({
    framePlayers: makeFrame(substituted),
    rendererEntities: makeRenderer(baseRoster),
  });
  expect(!stalePool.ok && stalePool.missingRenderer.includes("sub_t3") && stalePool.missingFrame.includes("t3"), "stale pool was not detected");
  return "replacement id mapped; old t3 rejected";
});

check("rematch starts with a fresh identity set", () => {
  const rematchRoster = makeRoster("rematch-t", "rematch-ct");
  const result = checkFpsRendererIdentity({
    framePlayers: makeFrame(rematchRoster),
    rendererEntities: makeRenderer(rematchRoster, "rematch"),
  });
  expect(result.ok, JSON.stringify(result));
  expect(fpsRosterIdentityKey(rematchRoster) !== fpsRosterIdentityKey(baseRoster), "rematch reused old roster key");
  return "10/10 rematch ids";
});

check("map change rebuild preserves the same 10 identities", () => {
  for (const mapKey of ["map-1", "map-2", "map-3"]) {
    const result = checkFpsRendererIdentity({
      framePlayers: makeFrame(baseRoster),
      rendererEntities: makeRenderer(baseRoster, mapKey),
    });
    expect(result.ok, `${mapKey}: ${JSON.stringify(result)}`);
  }
  return "Map 1 → Map 2 → Map 3: 10/10 each";
});

check("BO3 map transition rejects stale map-generation entities", () => {
  const map1 = makeRenderer(baseRoster, "map-1");
  const map2 = makeRenderer(baseRoster, "map-2");
  const map3 = makeRenderer(baseRoster, "map-3");
  for (const [mapKey, renderer] of [["map-1", map1], ["map-2", map2], ["map-3", map3]]) {
    expect(renderer.every((entity) => entity.mapKey === mapKey), `${mapKey} contains stale generation`);
    const result = checkFpsRendererIdentity({ framePlayers: makeFrame(baseRoster), rendererEntities: renderer });
    expect(result.ok, `${mapKey}: ${JSON.stringify(result)}`);
  }
  expect(map2.every((entity) => entity.mapKey !== "map-1"), "Map 2 retained Map 1 entity");
  expect(map3.every((entity) => entity.mapKey !== "map-2"), "Map 3 retained Map 2 entity");
  return "Map 1 → Map 2 → Map 3: no stale generation";
});

check("authoritative death is separate from identity mapping", () => {
  const deadFrame = makeFrame(baseRoster, new Set(["t1"]));
  const deadRenderer = makeRenderer(baseRoster).map((entity) => entity.id === "t1" ? { ...entity, bodyVisible: false } : entity);
  const identity = checkFpsRendererIdentity({ framePlayers: deadFrame, rendererEntities: deadRenderer });
  const death = checkFpsDeathVisibility({ framePlayers: deadFrame, rendererEntities: deadRenderer });
  expect(identity.ok, JSON.stringify(identity));
  expect(death.ok, JSON.stringify(death));
  return "dead t1 remains present; body hidden from authoritative state";
});

check("identity miss is a contract violation, not death", () => {
  const missingEntity = baseRenderer.filter((entity) => entity.id !== "t1");
  const identity = checkFpsRendererIdentity({ framePlayers: baseFrame, rendererEntities: missingEntity });
  const death = checkFpsDeathVisibility({ framePlayers: baseFrame, rendererEntities: missingEntity });
  expect(!identity.ok && identity.identityMiss, JSON.stringify(identity));
  expect(identity.missingRenderer.includes("t1"), "missing t1 was not reported");
  expect(death.ok, "missing entity was incorrectly interpreted as death mismatch");
  return "missing t1 reported separately from death";
});

check("duplicate player id is rejected", () => {
  const duplicate = [...baseFrame.slice(0, 9), { ...baseFrame[0], side: "ct" }];
  const result = checkFpsRendererIdentity({ framePlayers: duplicate, rendererEntities: baseRenderer });
  expect(!result.ok && result.duplicateFrameIds.includes("t1"), JSON.stringify(result));
  return "duplicate t1 rejected";
});

check("renderer source has one explicit roster lifecycle", () => {
  expect(!rendererSource.includes("ACTIVE_ROSTER"), "ACTIVE_ROSTER still exists");
  expect(/function FpsScene3D\(\{[^}]*roster/.test(rendererSource), "FpsScene3D does not accept roster");
  expect(rendererSource.includes("st.players=roster.map"), "player pool is not built from explicit roster");
  expect(rendererSource.includes("},[mapKey,roster]);"), "pool effect does not depend on roster identity");
  expect(rendererSource.includes("roster={effectiveRoster}"), "renderer does not receive effectiveRoster");
  expect(rendererSource.includes("checkFpsRendererIdentity"), "renderer identity check is not wired");
  expect(!rendererSource.includes("if(!p){P.g.visible=false;return;}"), "identity miss still silently hides entity");
  return "simulation and renderer share effectiveRoster";
});

for (const result of checks) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}

const passed = checks.filter((result) => result.ok).length;
console.log(`CS-A2 renderer identity: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;
