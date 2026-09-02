#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const renderer = read("src/battle/fps/EsportsFPS3D.jsx");
const adapter = read("src/battle/fps/presentation/fpsMatchPresentation.js");
const checks = [];
const check = (label, condition, detail = "") => {
  const ok = Boolean(condition);
  checks.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};

check("single read-only presentation adapter is exported and wired", /export function createFpsMatchPresentation/.test(adapter) && /createFpsMatchPresentation/.test(renderer) && /presentation\?\.update/.test(renderer));
check("event contract is authoritative and one-way", /authoritative FPS frame\.events/.test(adapter) && /direction: "simulation -> presentation"/.test(adapter) && /frame\.events/.test(adapter) && !/setFIdx|requestAnimationFrame|MatchSession|damage/.test(adapter));
check("kill feed uses stable IDs, bounded lifetime and dedup", /eventId\(/.test(adapter) && /state\.seen\.has\(id\)/.test(adapter) && /maxFeedItems: 5/.test(adapter) && /feedLifetimeSec: 3\.6/.test(adapter) && /state\.feed = \[\.\.\.state\.feed, entry\]\.slice\(-C5C_PRESENTATION_EVENT_CONTRACT\.maxFeedItems\)/.test(adapter));
check("resume and same-frame re-render do not replay historical events", /resumePolicy: "do not replay events before the first resumed frame"/.test(adapter) && /const sameFrame/.test(adapter) && /const rewound = !firstFrame && frameIndex < state\.lastFrameIndex/.test(adapter) && /skippedHistoricalEvents/.test(adapter));
check("round / bomb / clutch events are structured at simulation authority", ["round-end", "bomb-planted", "defuse-start", "bomb-defused", "bomb-exploded", "clutch"].every((type) => renderer.includes(`type:"${type}"`) || renderer.includes(`type: "${type}"`)) && /type: "round-start"/.test(adapter));
check("presentation HUD is Chinese, bounded and mobile-safe", /data-testid="cs-c5c-presentation-hud"/.test(renderer) && /data-testid="cs-c5c-kill-feed"/.test(renderer) && /data-testid="cs-c5c-bomb-status"/.test(renderer) && /data-testid="cs-c5c-round-history"/.test(renderer) && /maxWidth:"68%"/.test(renderer));
check("audio cues are separated from C5A recorded gunfire", /presentationCue\(/.test(renderer) && /cue:presentationCue/.test(renderer) && /one-recorded-buffer-per-shot/.test(renderer) && /recorded-prepared-direct/.test(renderer) && /AudioBufferSourceNode/.test(renderer) && /cueEventIds/.test(renderer));
check("audio cue voices are bounded and spatially attenuated", /activeVoices>=96/.test(renderer) && /distanceGain/.test(renderer) && /presentationCueStarts/.test(renderer) && /duplicateCueDispatches/.test(renderer));
check("footstep cues require displacement and never idle", /distance2\(player\.pos, player\.prevPos\) >= 0\.55/.test(adapter) && /!player\.dead/.test(adapter) && /state === "ROTATE" \|\| player\.state === "EXECUTE"/.test(adapter));
check("director uses cooldown / expiry and preserves manual camera", /directorCooldownSec: 0\.8/.test(adapter) && /expiresAt/.test(adapter) && /matchPresentationDirector/.test(renderer) && /cam\.autoFollow/.test(renderer) && /cameraPresetRef/.test(renderer));
check("P0 / C2C / RAF / StableCanvas guards remain wired", /data-esmo-fps-stable-canvas-region/.test(renderer) && /evaluateFpsCameraRecovery/.test(renderer) && /liveRef\.current\.fIdx/.test(renderer) && /createFpsCharacterRenderer/.test(renderer) && /requestAnimationFrame/.test(renderer));

const loadJson = (file) => {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return null;
  try { return JSON.parse(fs.readFileSync(full, "utf8")); } catch { return null; }
};

function checkRuntime(label, payload, expectedWidth) {
  check(`${label} runtime evidence has three maps`, Array.isArray(payload?.results) && payload.results.length === 3);
  const results = payload?.results || [];
  check(`${label} Mirage / Dust II / Inferno completed`, results.length === 3 && results.every((result) => ["mirage", "dust2", "inferno"].includes(result.mapKey) && result.completed === true));
  check(`${label} kill feed and presentation events are deduplicated`, results.length === 3 && results.every((result) => Number(result.presentation?.processedEvents) > 0 && Number(result.presentation?.duplicateEvents || 0) === 0 && Number(result.presentation?.feedCount || 0) <= 5));
  check(`${label} round / bomb / clutch presentation evidence`, results.length === 3 && results.every((result) => Number(result.presentation?.roundStartEvents) > 0 && Number(result.presentation?.roundEndEvents) > 0 && Number(result.presentation?.clutchEvents) >= 0) && results.some((result) => Number(result.presentation?.bombEvents) > 0));
  check(`${label} audio and recorded gunfire diagnostics`, results.length === 3 && results.every((result) => result.audio?.assetSource === "CC0 real firearm recordings" && Number(result.audio?.presentationCueStarts || 0) > 0 && Number(result.audio?.recordedSourceStarts || 0) >= 0 && Number(result.audio?.activeVoices || 0) <= 96 && !(result.audio?.loadErrors && Object.keys(result.audio.loadErrors).length)));
  check(`${label} auto director and manual camera evidence`, results.length === 3 && results.every((result) => Number(result.camera?.directorSwitches || 0) > 0 && Number(result.camera?.manualOverrideSamples || 0) > 0 && Number(result.camera?.rapidSwitches || 0) === 0));
  check(`${label} P0 / C2C / browser diagnostics`, results.length === 3 && results.every((result) => result.c2c?.rigged === 10 && result.c2c?.fallback === 0 && Number(result.p0?.staleMismatch || 0) === 0 && Number(result.p0?.duplicateRaf || 0) === 0 && Number(result.p0?.geometryShift || 0) === 0 && !(result.browserErrors?.console?.length || result.browserErrors?.page?.length)));
  check(`${label} viewport contract`, Number(payload?.viewport?.width) === expectedWidth && results.every((result) => Number(result.canvas?.width) >= 320 && Number(result.canvas?.width) <= 430));
}

const desktop = loadJson("artifacts/cs-c5c/owner-review/runtime-evidence-desktop.json");
const mobile = loadJson("artifacts/cs-c5c/owner-review/runtime-evidence-mobile.json");
check("desktop runtime evidence file exists", Boolean(desktop));
check("390px runtime evidence file exists", Boolean(mobile));
if (desktop) checkRuntime("desktop", desktop, 1366);
if (mobile) checkRuntime("390px", mobile, 390);

if (checks.some((item) => !item.ok)) process.exitCode = 1;
console.log(`CS-C5C match presentation gate: ${checks.filter((item) => item.ok).length}/${checks.length} PASS`);
