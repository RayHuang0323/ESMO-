import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateFpsCameraRecovery } from "../src/battle/fps/fpsVisibilityDiagnostics.js";

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

function player(id, side, inCameraViewport, alive = true) {
  return { id, side, alive, inCameraViewport };
}

const visibleFiveVsFive = () => [
  ...Array.from({ length: 5 }, (_, index) => player(`t${index + 1}`, "t", true)),
  ...Array.from({ length: 5 }, (_, index) => player(`ct${index + 1}`, "ct", true)),
];

check("individual offscreen players do not trigger recovery", () => {
  const players = visibleFiveVsFive();
  players[0].inCameraViewport = false;
  players[5].inCameraViewport = false;
  const result = evaluateFpsCameraRecovery(players);
  expect(result.shouldRecover === false, JSON.stringify(result));
  expect(result.aliveOffCamera.length === 2, JSON.stringify(result));
  return "two individuals offscreen; no recovery";
});

check("whole T team offscreen triggers recovery", () => {
  const players = visibleFiveVsFive().map((entry) => entry.side === "t" ? { ...entry, inCameraViewport: false } : entry);
  const result = evaluateFpsCameraRecovery(players);
  expect(result.shouldRecover === true, JSON.stringify(result));
  expect(result.wholeTeamOffCamera.join(",") === "t", JSON.stringify(result));
  return "T fully offscreen; recovery required";
});

check("whole CT team offscreen triggers recovery", () => {
  const players = visibleFiveVsFive().map((entry) => entry.side === "ct" ? { ...entry, inCameraViewport: false } : entry);
  const result = evaluateFpsCameraRecovery(players);
  expect(result.shouldRecover === true, JSON.stringify(result));
  expect(result.wholeTeamOffCamera.join(",") === "ct", JSON.stringify(result));
  return "CT fully offscreen; recovery required";
});

check("dead offscreen players do not qualify as an alive team", () => {
  const players = visibleFiveVsFive().map((entry) => entry.side === "t" ? { ...entry, alive: false, inCameraViewport: false } : entry);
  const result = evaluateFpsCameraRecovery(players);
  expect(result.shouldRecover === false, JSON.stringify(result));
  expect(result.aliveByTeam.t === 0, JSON.stringify(result));
  return "eliminated team ignored";
});

check("empty frames do not trigger recovery", () => {
  const result = evaluateFpsCameraRecovery([]);
  expect(result.shouldRecover === false, JSON.stringify(result));
  return "empty frame ignored";
});

check("renderer consumes the team-scoped recovery contract", () => {
  for (const token of ["evaluateFpsCameraRecovery", "inspectAliveCameraViewport", "recovery?.shouldRecover"]) {
    expect(rendererSource.includes(token), `missing renderer integration token: ${token}`);
  }
  return "pure contract drives the runtime safety snap";
});

check("runtime recovery remains bounded without debug-only event plumbing", () => {
  expect(rendererSource.includes("cameraRecoveryCount"), "missing recovery counter");
  expect(rendererSource.includes("rapidCameraRecoveryCount"), "missing rapid-loop counter");
  expect(!rendererSource.includes("__ESMO_FPS_MOBILE_DIAGNOSTICS__"), "temporary mobile diagnostics must be removed");
  return "runtime keeps bounded recovery counters; capture overlay is absent";
});

check("recenter and touch camera controls remain wired", () => {
  for (const token of ["onRecenterRef.current", 'addEventListener("touchstart"', 'addEventListener("touchmove"', 'addEventListener("touchend"', "cam.autoFollow=false"]) {
    expect(rendererSource.includes(token), `missing camera control token: ${token}`);
  }
  return "recenter plus touch rotate/pan/pinch input paths retained";
});

for (const result of checks) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
const failed = checks.filter((result) => !result.ok);
console.log(`CS camera recovery: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
