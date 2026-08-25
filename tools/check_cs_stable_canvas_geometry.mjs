import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");
const checks = [];

function check(name, fn) {
  try { checks.push({ name, ok: true, detail: fn() ?? "" }); }
  catch (error) { checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) }); }
}
function expect(condition, message) { if (!condition) throw new Error(message); }

check("stable region is an explicit production boundary", () => {
  expect(source.includes('data-esmo-fps-stable-canvas-region="1"'), "missing StableCanvasRegion marker");
  expect(source.includes('data-esmo-fps-canvas-layer="1"'), "missing CanvasLayer marker");
  expect(source.includes('data-esmo-fps-frame-decoration="1"'), "missing FrameDecorationLayer marker");
  return "BattleViewport has stable canvas, canvas, and decoration layers";
});

check("HUD remains outside the canvas region", () => {
  const start = source.indexOf('data-esmo-fps-stable-canvas-region="1"');
  const end = source.indexOf('data-esmo-fps-frame-decoration="1"', start);
  const hud = source.indexOf("{/* LIVE */}", end);
  expect(start >= 0 && end > start && hud > end, "HUD placement cannot be proven");
  return "HUD siblings render after the stable region";
});

check("geometry isolation is layout-level", () => {
  expect(source.includes('contain:"layout paint"'), "missing layout/paint containment");
  expect(source.includes('isolation:"isolate"'), "missing isolation boundary");
  expect(source.includes('overflow:"visible"'), "canvas region must not be the clipping boundary");
  return "stable region owns geometry; decoration owns clipping visuals";
});

check("decoration retains visual frame without sizing canvas", () => {
  const decoration = source.slice(source.indexOf('data-esmo-fps-frame-decoration="1"'), source.indexOf("{/* LIVE */}"));
  expect(decoration.includes("borderRadius:14"), "frame radius moved out of decoration");
  expect(decoration.includes("boxShadow"), "frame shadow moved out of decoration");
  return "border/radius/shadow are decoration-only";
});

check("temporary DOM isolation experiments are absent", () => {
  for (const token of ["fpsDomExperiment", "StableCanvasReactRoot", "createRoot", "CANVAS_NO_CLIP_LAYER"]) {
    expect(!source.includes(token), `temporary isolation token remains: ${token}`);
  }
  return "one production layout contract remains";
});

for (const result of checks) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
const failed = checks.filter((result) => !result.ok);
console.log(`STABLE_CANVAS_GEOMETRY: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
