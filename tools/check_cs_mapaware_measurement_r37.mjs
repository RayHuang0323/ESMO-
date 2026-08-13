#!/usr/bin/env node
// R37 Map Awareness candidate measurement. Memory-only spatial read-point hook.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const MODULE = "/src/battle/fps/EsportsFPS3D.jsx";
const ROLES = ["entry", "rifler", "awp", "lurker", "igl"];
const LEVELS = ["low", "baseline", "high"];
const VIS = { low: 40, baseline: 70, high: 95 };
const SEEDS = Object.freeze([3978742910,4200255727,541349949,1011896540,44863398,1878380147,638784133,2852978760,1789562418,3820910912,3991584863,2186970694,951543597,2082574495,474649321,3950420867]);
const sha = (v) => createHash("sha256").update(v).digest("hex");
const canonical = (v) => JSON.stringify(v, Object.keys(v).sort());
function gate(ok, code, detail = "") { if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`); }
const SIGNATURE = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const PAIR = "let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);if(d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes))pairs.push([tp,cp,d]);}));";
const RETURN = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT = "export { EsportsFPS3D, buildMatchResult };";
const transformSource = (input) => {
  gate(input.includes(SIGNATURE) && input.includes(PAIR), "MARKERS_MISSING");
  let s = input.replace(SIGNATURE, "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){");
  s = s.replace(PAIR, "let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);const distanceEligible=d<55;const wallBlocked=lineBlocked(tp.pos,cp.pos,walls);const smokeBlocked=smokeBlocks(tp.pos,cp.pos,smokes);__measure?.record({round:rnd+1,sec,tRole:tp.role,cRole:cp.role,distanceEligible,wallBlocked,smokeBlocked,visibleCandidate:distanceEligible&&!wallBlocked&&!smokeBlocked});if(distanceEligible&&!wallBlocked&&!smokeBlocked)pairs.push([tp,cp,d]);}));");
  s = s.replace(RETURN, "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };");
  s = s.replace(EXPORT, "const __R37_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB}); export { EsportsFPS3D, buildMatchResult, __R37_API__ };");
  return s;
};
async function loadApi() {
  const original = readFileSync(FPS_FILE, "utf8"); let seen = 0; const temp = mkdtempSync(join(tmpdir(), "esmo-r37-mapaware-")); let server;
  try {
    server = await createServer({ root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error", cacheDir: join(temp, "vite"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, plugins: [{ name: "r37-mapaware", enforce: "pre", transform(code, id) { if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null; seen += 1; return { code: transformSource(original), map: null }; } }] });
    const loaded = await server.ssrLoadModule(MODULE); gate(seen === 1, "TRANSFORM_COUNT", String(seen)); return loaded.__R37_API__;
  } finally { if (server) await server.close(); rmSync(temp, { recursive: true, force: true }); }
}
function rosterWithVis(roster, role, level) { return roster.map((p) => p.role === role && p.side === "t" ? { ...p, stats: { ...p.stats, vis: VIS[level] } } : p); }
async function main() {
  gate(process.argv.length === 2, "CLI_FLAGS_FORBIDDEN");
  const source = readFileSync(FPS_FILE, "utf8");
  const lineBlock = source.slice(source.indexOf("function lineBlocked"), source.indexOf("// 瘝?a?", source.indexOf("function lineBlocked")));
  const smokeBlock = source.slice(source.indexOf("function smokeBlocks"), source.indexOf("function smokeBlocks") + source.slice(source.indexOf("function smokeBlocks")).indexOf("\n") + 1);
  gate(lineBlock.includes("lineBlocked") && smokeBlock.includes("smokeBlocks"), "SPATIAL_HELPERS_MISSING");
  gate(source.includes('S("vis")'), "GENERIC_COMBAT_VIS_READ_MISSING");
  const api = await loadApi(); const map = api.TACTICS_DB.inferno; const tTactic = structuredClone(map.t.find((x) => x.id === "t_aexec")); const ctTactic = structuredClone(map.ct.find((x) => x.id === "c_std")); const baseline = structuredClone(api.ROSTER); gate(baseline.length === 10, "ROSTER_SIZE");
  const arms = [], aggregate = { probes: 0, visibleCandidates: 0, wallBlocked: 0, smokeBlocked: 0, distanceEligible: 0 };
  for (const role of ROLES) for (const level of LEVELS) for (const seed of SEEDS) {
    const events1 = [], events2 = []; const r = rosterWithVis(baseline, role, level);
    const first = api.simulateFps("inferno", tTactic, ctTactic, seed, r, { record: (e) => events1.push(e) });
    const second = api.simulateFps("inferno", tTactic, ctTactic, seed, r, { record: (e) => events2.push(e) });
    gate(JSON.stringify(first) === JSON.stringify(second), "NON_DETERMINISTIC_SIM", `${role}/${level}/${seed}`);
    gate(canonical(events1) === canonical(events2), "NON_DETERMINISTIC_READ", `${role}/${level}/${seed}`);
    const metric = { probes: events1.length, visibleCandidates: events1.filter((e) => e.visibleCandidate).length, wallBlocked: events1.filter((e) => e.wallBlocked).length, smokeBlocked: events1.filter((e) => e.smokeBlocked).length, distanceEligible: events1.filter((e) => e.distanceEligible).length };
    gate(metric.probes > 0 && metric.distanceEligible > 0 && metric.visibleCandidates > 0, "OPPORTUNITY_COVERAGE", `${role}/${level}/${seed}`);
    for (const k of Object.keys(aggregate)) aggregate[k] += metric[k];
    arms.push({ role, level, seed, metric, digest: sha(JSON.stringify({ role, level, seed, metric })) });
  }
  const digest = sha(JSON.stringify(arms));
  console.log("schema: CsMapAwareMeasurement.v1");
  console.log(`coverage: roles=${ROLES.length} levels=${LEVELS.length} fixedSeeds=${SEEDS.length} arms=${arms.length} repeated=${arms.length * 2}`);
  console.log(`aggregate: ${JSON.stringify(aggregate)}`);
  console.log(`repeated digest: ${digest}`);
  console.log("consumer boundary: pair admission reads distance/wall/smoke only; vis has generic combatSkill read, no actor-awareness decision edge");
  console.log("production modified: no (memory transform only); RNG/scenario/history: unchanged");
  console.log("verdict: measurement=Go spatial-read evidence semantic=Design-gap calibration=Deferred/No-Go");
  console.log("CS Map Awareness Measurement / Calibration Readiness R37: PASS");
}
main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
