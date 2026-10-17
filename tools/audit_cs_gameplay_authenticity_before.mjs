#!/usr/bin/env node
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { loadFpsMajorTestApi } from "./lib/fpsMajorTestApi.mjs";
import { auditFpsAuthenticity, summarizeFpsAuthenticityAudit, authenticityHeatmapHtml } from "./lib/fpsAuthenticityAudit.mjs";

const prefix = process.env.ESMO_CS_AUTHENTICITY_BEFORE_PREFIX || "tools/.cs-major-verifier-recovery/authenticity-before-20261012";
for (const suffix of [".json", ".heatmap.html", ".coverage-plan.json"]) assert.ok(!fs.existsSync(prefix + suffix), `拒覆寫既有audit ${prefix + suffix}`);
const fixturePath = "review/cs-major-upgrade/evidence/retention-policy-20261011/c-runtime-phase-route-fixed-source.json.gz";
const manifest = JSON.parse(fs.readFileSync("review/cs-major-upgrade/evidence/retention-policy-20261011/d-canonical-replay.manifest.json", "utf8"));
const gzip = fs.readFileSync(fixturePath), json = gunzipSync(gzip);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(hash(gzip), manifest.input.gzipSHA); assert.equal(hash(json), manifest.input.jsonSHA);
const simulation = JSON.parse(json.toString("utf8")); // one canonical read/parse
const mapSource = fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8");
const api = await loadFpsMajorTestApi(mapSource); // map/official tactic data only
const audit = summarizeFpsAuthenticityAudit(auditFpsAuthenticity(simulation, api.MAPS[simulation.mapKey], manifest.derivation));
audit.provenance = { fixturePath, gzipBytes: gzip.length, jsonBytes: json.length, gzipSHA256: hash(gzip), jsonSHA256: hash(json), canonicalSourceHash: manifest.input.sourceHash, mapDefinitionSourceSHA256: hash(mapSource), mapProvenanceCaveat: "node/site座標讀目前正式MAPS；Before生成sourceHash另保留，不宣稱不同source全文等價" };
audit.referenceLedger = [
  "threejs-gameplay-systems/SKILL.md", "threejs-gameplay-systems/references/gameplay-workflows.md", "threejs-gameplay-systems/references/game-design-level-design.md", "threejs-gameplay-systems/references/checklists/game-design-level-design.md", "threejs-debug-profiler/SKILL.md", "threejs-debug-profiler/references/debug-profile-checklists.md", "threejs-debug-profiler/references/checklists/scene-debugging.md",
].map(path => ({ loaded: true, path: `C:/Users/ifikn/.agents/skills/${path}`, failureReason: null }));
const matches = [];
for (const [mapKey, tactics] of Object.entries(api.TACTICS_DB)) for (const t of tactics.t) for (const ct of tactics.ct) matches.push({ id: `${mapKey}-${t.id}-${ct.id}`, mapKey, tacticT: t.id, tacticCT: ct.id, seed: 505001, layout: { postPlantMode: "crossfire" }, sceneVersion: "major.v1", kind: "official-full-match" });
for (const [mapKey, tactics] of Object.entries(api.TACTICS_DB)) matches.push({ id: `${mapKey}-fake-f6-${tactics.ct[0].id}`, mapKey, tacticT: tactics.t[0].id, tacticCT: tactics.ct[0].id, seed: 505001, layout: { postPlantMode: "crossfire", phases: { opening: "f6" } }, sceneVersion: "major.v1", kind: "legal-fake-full-match" });
const plan = { schema: "cs-authenticity-coverage-plan.v1", status: "PLANNED_NOT_RUN", beforeFixture: fixturePath, existingBeforeMatch: manifest.derivation, inventory: Object.fromEntries(Object.entries(api.TACTICS_DB).map(([map, tactics]) => [map, Object.fromEntries(["t", "ct"].map(side => [side, tactics[side].map(t => ({ id: t.id, site: t.site, type: t.type, roleRoutes: Object.keys(t.routes), smokeNodes: t.smokes || [], mollyNodes: t.mollys || [] }))]))])), matchCount: matches.length, matches, execution: "scoped runner only; one child match at a time; complete stdout/stderr/native exit and compact audit; never save/copy giant sim; missing scenarios UNKNOWN/NOT_TRIGGERED, not PASS", assertionPolicy: "complete canonical match + movement invariants; actual result/plant/util usage is measured, never fixed; P0 acceptance thresholds must remain explicit and unmet scenarios cannot be softened", limitations: audit.unknown };
fs.writeFileSync(prefix + ".json", JSON.stringify(audit, null, 2), { flag: "wx" });
fs.writeFileSync(prefix + ".heatmap.html", authenticityHeatmapHtml(audit), { flag: "wx" });
fs.writeFileSync(prefix + ".coverage-plan.json", JSON.stringify(plan, null, 2), { flag: "wx" });
console.log(JSON.stringify({ result: "AUDIT_SAVED", prefix, frames: audit.frameCount, rounds: audit.roundCount, summary: audit.summary, proposedMatches: plan.matchCount, unknown: audit.unknown }));
