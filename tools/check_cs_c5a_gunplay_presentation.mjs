#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const renderer = read("src/battle/fps/EsportsFPS3D.jsx");
const fx = read("src/battle/fps/presentation/fpsGunplayPresentation.js");
const animation = read("src/battle/fps/presentation/FpsCharacterRenderer.js");
const animationState = read("src/battle/fps/presentation/fpsAnimationState.js");
const checks = [];
const pass = (label, ok, detail = "") => checks.push({ label, ok: Boolean(ok), detail });
const includes = (source, needle) => source.includes(needle);

pass("C5A presentation module is wired into the FPS renderer", includes(renderer, 'createGunplayPresentation') && includes(renderer, "st.c5aGunplayFx"));
pass("five weapon-family profiles are explicit", ["pistol", "smg", "rifle", "sniper", "shotgun"].every((key) => includes(fx, `${key}: Object.freeze`)));
pass("fire events retain authoritative attacker and weapon metadata", includes(renderer, "attackerId:at.id") && (includes(renderer, "weaponFamily:") || includes(renderer, ",weaponFamily,")) && includes(renderer, "gun:at.gun"));
pass("hit events remain frame-derived and material-aware", (includes(renderer, 'surface:"player"') || includes(renderer, 'surface:hit?"player":"concrete"')) && includes(fx, "surfaceFor(event)") && includes(fx, "C5A_SURFACE_FX"));
pass("character hit and death remain authoritative animation inputs", includes(animationState, "current.hp < previous.hp") && includes(animationState, "current.dead === true") && includes(animation, "FPS_CHARACTER_ASSET_MANIFEST.clips.death"));
pass("muzzle, tracer, shell, hit, and death effects use bounded pools", ["flash: createPool", "flashBeam: createPool", "tracer: createPool", "shell: createPool", "hitRing: createPool", "deathRing: createPool"].every((needle) => includes(fx, needle)));
pass("review-only weapon and material showcases are isolated from battle state", includes(fx, "c5aReviewOnly") && includes(fx, 'get("fpsC5aReview")') && includes(fx, "createWeaponShowcase") && includes(fx, "reviewMode"));
pass("effect variation is deterministic and does not use Math.random", includes(fx, "function hash") && !includes(fx, "Math.random"));
pass("P0 identity and frame-coherence diagnostics remain wired", includes(renderer, "checkFpsRendererIdentity") && includes(renderer, "lastAuthoritativeFidx") && includes(renderer, "staleMismatch"));
pass("C5A does not add combat authority or stat mutation", !/applyDamage|finalizeKill|fireRate|weaponStats|MatchSession/.test(fx));
pass("FX teardown is explicit on map lifecycle and unmount", includes(renderer, "st.c5aGunplayFx?.dispose?.()") && includes(fx, "const dispose = ()"));

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}${check.detail ? ` — ${check.detail}` : ""}`));
console.log(`CS-C5A gunplay presentation gate: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exitCode = 1;
