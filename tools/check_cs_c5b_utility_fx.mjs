#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(".");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const renderer = read("src/battle/fps/EsportsFPS3D.jsx");
const utility = read("src/battle/fps/presentation/fpsUtilityPresentation.js");
const checks = [];
const check = (label, condition) => {
  const ok = Boolean(condition);
  checks.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};

check("C5B utility owner exists and is wired", /createUtilityPresentation/.test(renderer) && /export function createUtilityPresentation/.test(utility));
check("utility contract declares trajectory and smoke lifecycle", /authoritative from\/to\/t\/flightDurationSec\/arcHeightUnits/.test(utility) && ["grow", "hold", "dissipate"].every((stage) => utility.includes(`"${stage}"`)));
check("utility presentation is frame-only", /frame\.throwables/.test(utility) && /frame\.smokes/.test(utility) && /frame\.mollys/.test(utility) && /frame\.players/.test(utility) && !/setFIdx|requestAnimationFrame|MatchSession|winner|damage/.test(utility));
check("smoke is a bounded multi-sprite volume with marker", /SMOKE_CLOUDS_PER_EVENT = 8/.test(utility) && /smokeCloud/.test(utility) && /smokeMarker/.test(utility) && /smokeOcclusion: "depth-tested-alpha-volume"/.test(utility));
check("HE has short flash dust debris impact", /heBursts/.test(utility) && /blastRing/.test(utility) && /dust/.test(utility) && /debris/.test(utility));
check("flashbang uses localized fade/recovery presentation", /flashBurst/.test(utility) && /flashHalo/.test(utility) && /flashRecoverySamples/.test(utility) && !/document\.body|fullPage|white screen/i.test(utility));
check("all pools are capped and dispose is idempotent", /MAX_(SMOKE_EVENTS|THROWABLE_EVENTS|HE_BURSTS|FLASH_BURSTS|MOLLY_EVENTS)/.test(utility) && /if \(disposed\) return/.test(utility) && /const dispose = \(\) =>/.test(utility));
check("reduced motion retains utility markers", /prefers-reduced-motion/.test(utility) && /if \(!reducedMotion\)/.test(utility) && /visibleMarkers/.test(utility));
check("no shader or post-processing expansion", !/ShaderMaterial|EffectComposer|RenderPass|UnrealBloomPass/.test(utility) && /postprocessing: "none"/.test(utility));
check("C5A recorded gunfire boundary remains intact", /one-recorded-buffer-per-shot/.test(renderer) && /AudioBufferSourceNode/.test(renderer) && /prepared-direct/.test(renderer) && !/createOscillator/.test(renderer));
check("P0/C2C/camera/RAF ownership remains in renderer", /StableCanvasRegion|data-esmo-fps-stable-canvas-region/.test(renderer) && /evaluateFpsCameraRecovery/.test(renderer) && /liveRef\.current\.fIdx/.test(renderer) && /createFpsCharacterRenderer/.test(renderer));
check("legacy utility pools were replaced, not duplicated", !/st\.pools\.smoke|st\.pools\.fire|st\.pools\.nade|st\.pools\.boom/.test(renderer) && /st\.utilityFxEvidence=st\.utilityFx\.update/.test(renderer));

function loadEvidence(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function checkRuntime(label, payload, expectedWidth) {
  check(`${label} has three map results`, Array.isArray(payload?.results) && payload.results.length === 3);
  for (const result of payload?.results || []) {
    const utilityEvidence = result.utility || {};
    const stages = utilityEvidence.smokeStageCounts || {};
    check(`${label} ${result.mapKey} trajectory uses authoritative profile`, (result.projectiles || []).length > 0 && result.projectiles.every((item) => item.flightDurationSec >= 0.55 && item.flightDurationSec <= 2.4 && item.velocityUnitsPerSec > 0 && item.arcHeightUnits >= 2.8 && item.arcHeightUnits <= 6.8));
    check(`${label} ${result.mapKey} smoke grow/hold/dissipate`, Number(stages.grow) > 0 && Number(stages.hold) > 0 && Number(stages.dissipate) > 0);
    check(`${label} ${result.mapKey} HE/flash/recovery runtime evidence`, Number(utilityEvidence.heDetonations) > 0 && Number(utilityEvidence.flashDetonations) > 0 && Number(utilityEvidence.flashRecoverySamples) > 0);
    check(`${label} ${result.mapKey} render diagnostics and no browser errors`, (result.renderSamples || []).some((sample) => Number(sample.smoke) > 0 && Number(sample.markers) > 0) && !(result.browserErrors?.console?.length || result.browserErrors?.page?.length));
    check(`${label} ${result.mapKey} P0/C2C runtime remains healthy`, result.c2c?.rigged === 10 && result.c2c?.fallback === 0 && result.p0?.staleMismatch === 0 && result.p0?.duplicateRaf === 0);
    const canvasWidthOk = label === "desktop"
      ? Number(result.canvas?.width) >= 320 && Number(result.canvas?.width) <= 430
      : Number(result.canvas?.width) >= expectedWidth - 24 && Number(result.canvas?.width) <= expectedWidth;
    check(`${label} ${result.mapKey} viewport/canvas width contract`, canvasWidthOk && Number(payload.viewport?.width) === expectedWidth);
  }
  check(`${label} utility set includes active molly zone evidence`, (payload.results || []).some((result) => Number(result.utility?.mollySamples) > 0));
}

const desktop = loadEvidence("artifacts/cs-c5b/owner-review/runtime-evidence-desktop.json");
const mobile = loadEvidence("artifacts/cs-c5b/owner-review/runtime-evidence-mobile.json");
if (!desktop) console.log("INFO desktop runtime evidence not present yet");
if (!mobile) console.log("INFO mobile runtime evidence not present yet");
if (desktop) checkRuntime("desktop", desktop, 1366);
if (mobile) checkRuntime("390px", mobile, 390);
check("C5B runtime evidence files are present", Boolean(desktop && mobile));

if (checks.some((item) => !item.ok)) process.exitCode = 1;
console.log(`CS-C5B utility FX gate: ${checks.filter((item) => item.ok).length}/${checks.length} PASS`);
