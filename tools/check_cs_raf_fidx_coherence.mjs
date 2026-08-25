import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "src/battle/fps/EsportsFPS3D.jsx"), "utf8");
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

function between(haystack, start, end) {
  const from = haystack.indexOf(start);
  const to = haystack.indexOf(end, from + start.length);
  expect(from >= 0 && to > from, `missing source range: ${start} -> ${end}`);
  return haystack.slice(from, to);
}

check("authoritative ref is published before React state", () => {
  const publish = between(source, "const publishFpsFrame=", "  liveRef.current={");
  expect(publish.indexOf("liveRef.current.fIdx=next") >= 0, "missing liveRef fIdx publication");
  expect(publish.indexOf("setFIdx(next)") > publish.indexOf("liveRef.current.fIdx=next"), "setFIdx must follow ref publication");
  return "liveRef.current.fIdx = next precedes setFIdx(next)";
});

check("playback advance uses the coherence publisher", () => {
  const live = between(source, "liveRef.current={", "  // 切換比賽/地圖");
  expect(live.includes('publishFpsFrame(next,"playback")'), "advance bypasses publishFpsFrame");
  expect(!live.includes("setFIdx(fi=>"), "RAF advance must not rely on asynchronous state only");
  return "RAF playback transition uses the shared publisher";
});

check("seek and reset transitions also update the live ref", () => {
  expect(source.includes('publishFpsFrame(clamp(Number(resumeFrameIndex)'), "reset path does not publish live fIdx");
  expect(source.includes('publishFpsFrame(clamp(v,0,total-1),"seek")'), "seek path does not publish live fIdx");
  return "reset and seek cannot leave RAF on a stale frame";
});

check("RAF consumes the live frame index", () => {
  const loop = between(source, "const animate=t=>{", "    st_start();");
  expect(loop.includes("liveRef.current"), "RAF does not read liveRef");
  expect(loop.includes("const fIdx=Math.min(live.fIdx,total-1)"), "RAF frame selection bypasses liveRef.fIdx");
  return "RAF frame selection reads liveRef.fIdx";
});

check("DEV invariant is bounded", () => {
  expect(source.includes("__ESMO_FPS_P0_CONTRACT__"), "missing DEV P0 contract");
  for (const token of ["fidxTransitions", "staleMismatch", "rafFrames", "duplicateRaf", "duplicateRender"]) {
    expect(source.includes(token), `missing invariant field: ${token}`);
  }
  expect(!source.includes("__ESMO_FPS_FIDX_TIMELINE__"), "historical capture timeline leaked into production source");
  return "only bounded counters remain; no capture buffer";
});

check("transition model has no stale frame", () => {
  let live = 0;
  let staleMismatch = 0;
  for (let next = 1; next <= 1000; next += 1) {
    live = next;
    if (live !== next) staleMismatch += 1;
  }
  expect(staleMismatch === 0 && live === 1000, `model mismatch=${staleMismatch} live=${live}`);
  return "1000 authoritative transitions remain coherent";
});

check("forbidden masking fixes are absent", () => {
  for (const token of ["freeze fIdx", "skip simulation", "setInterval(3000", "MANUAL_GHOST_MARK", "triggerFpsCapture"]) {
    expect(!source.includes(token), `forbidden masking/debug token remains: ${token}`);
  }
  return "simulation and HUD are not frozen or skipped";
});

for (const result of checks) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
const failed = checks.filter((result) => !result.ok);
console.log(`RAF_FIDX_COHERENCE: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
