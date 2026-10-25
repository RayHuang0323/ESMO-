#!/usr/bin/env node
// ============================================================================
//  tools/measure_side_bias_3aB.mjs — Phase 3a-B P2-5：紅藍側偏（登記 tools/fixtures/side_bias_registration_3aB.json）
//
//  node tools/measure_side_bias_3aB.mjs --path=career|challenge --plan
//  node tools/measure_side_bias_3aB.mjs --path=career|challenge --run --dir=<repo 外> [--workers=3]   可續跑；無效 seed 會自動往後補
//  node tools/measure_side_bias_3aB.mjs --path=career|challenge --report --dir=<同一個>               寫 tools/fixtures/side_bias_result_<path>_3aB.json
//  node tools/measure_side_bias_3aB.mjs --selftest
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, pairedStats, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/side_bias_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const DT = 0.5;

// ── worker ──────────────────────────────────────────────────────────────────
if (flag("sb-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
  let career = null, chal = null;
  async function runCareer(t) {
    career ??= { L: await imp("tools/lib/careerLiveInputs.mjs"), U: await imp("src/useLocalServer.js") };
    const { liveInputs, team } = await career.L.careerLiveInputs({ seed: t.seed, rulesetId: t.arm });
    const out = career.U.prepareLiveMatch(liveInputs);
    if (!out.ok) throw new Error(`prepareLiveMatch ${out.stage}: ${JSON.stringify(out.errors).slice(0, 200)}`);
    const e = out.engine;
    for (let i = 1; i * DT <= 3600 && !e.over; i++) e.tick(DT);
    return { seed: t.seed, engineSeed: out.setup.seed, ruleset: out.setup.rulesetId, layout: out.setup.objectiveLayout, director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null,
      opponent: team.id, style: team.style, redKind: out.setup.tactic?.red?.kind ?? null, winner: e.over ? e.winner : null, duration: e.t };
  }
  async function runChal(t) {
    chal ??= { G: await imp("tools/lib/challengeGolden.mjs"), R: await imp("src/platform/challenge/challengeRunner.js"), H: await imp("src/data/heroDatabase.js"), F: await imp("src/platform/challenge/fixtureOpponents.js") };
    const keys = chal.G.FIXTURE_KEYS, defs = chal.F.FIXTURE_OPPONENTS;
    const a = defs.find((d) => d.key === keys[t.seed % keys.length]), d = defs.find((x) => x.key === keys[(t.seed + 2) % keys.length]);
    const ver = t.arm === "challenge.v21" ? "moba-sim.v21" : "moba-sim.v20";
    //  challengeGoldenInputs 以 params.index 決定兩個 fixture key（index、index+2）⇒ index＝seed % 5 就是登記的配對。
    const v = chal.G.challengeGoldenInputs({ id: `sb-${t.seed}`, params: { index: t.seed % keys.length, seed: t.seed, draft: true, tacticIds: [a.tacticId, d.tacticId] } }, { simulationVersion: ver });
    const r = chal.R.runChallenge({ challenge: v.challenge, challengerSnapshot: v.challenger, defenderSnapshot: v.defender, draftResult: v.draftResult, heroOf: chal.H.heroById, currentSimulationVersion: ver });
    if (!r.ok) throw new Error(`runChallenge: ${JSON.stringify(r.errors).slice(0, 200)}`);
    //  審查 M5：layout＝由規則集與 seed 推得的佈局（challenge.v20 規則集固定 STANDARD、v21 依 seed；runChallenge 不回傳佈局，不是從引擎讀回）；分層用 seed 的 bySeed 標記（stratum）。
    return { seed: t.seed, engineSeed: r.result.matchSeed, ruleset: t.arm, layout: t.arm === "challenge.v20" ? "STANDARD" : objectiveLayoutForSeed(r.result.matchSeed), stratum: objectiveLayoutForSeed(r.result.matchSeed), opponent: `${a.key}>${d.key}`,
      winner: r.result.outcome === "challengerWin" ? "blue" : r.result.outcome === "defenderWin" ? "red" : null, duration: r.result.durationSec, simulationVersion: r.result.simulationVersion };
  }
  process.on("message", async (t) => {
    try { process.send({ type: "done", id: t.id, rec: t.path === "career" ? await runCareer(t) : await runChal(t) }); }
    catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 判定（純函式）────────────────────────────────────────────────────────────
const winOf = (r) => (r.winner === "blue" ? 1 : r.winner === "red" ? 0 : 0.5);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export function layoutVerdict(pairs) {
  //  pairs：[{ v20, v21 }]（同一 seed 兩臂的紀錄）
  const w20 = pairs.map((p) => winOf(p.v20)), w21 = pairs.map((p) => winOf(p.v21));
  const m = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const bias20 = m(w20) - 0.5, bias21 = m(w21) - 0.5;
  //  審查 minor：「變糟」的方向取偏差較大的那一臂（v21 把偏差翻到另一邊而且變大時，z 也要在變糟的方向上）。
  const sg = (Math.abs(bias21) > Math.abs(bias20) ? Math.sign(bias21) : Math.sign(bias20)) || Math.sign(bias21) || 1;
  const z = pairedStats(pairs.map((p, i) => (w21[i] - w20[i]) * sg)).z ?? 0;
  const worsePp = (Math.abs(bias21) - Math.abs(bias20)) * 100;
  const durRatio = median(pairs.map((p) => p.v21.duration)) / median(pairs.map((p) => p.v20.duration));
  const stop = worsePp >= 5 || (worsePp > 0 && z >= 3);
  const warn = !stop && (worsePp >= 3 || Math.abs(durRatio - 1) > 0.10);
  return { n: pairs.length, blueWin20: m(w20), blueWin21: m(w21), bias20, bias21, worsePp, z, durRatio, stop, warn };
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const mk = (n, p20, p21, dur21 = 1000) => Array.from({ length: n }, (_, i) => ({ v20: { winner: (i % 100) < p20 * 100 ? "blue" : "red", duration: 1000 }, v21: { winner: (i % 100) < p21 * 100 ? "blue" : "red", duration: dur21 } }));
  ck("S1 一樣 ⇒ 不 STOP 不 WARN", (() => { const v = layoutVerdict(mk(1000, 0.52, 0.52)); return !v.stop && !v.warn && Math.abs(v.worsePp) < 1e-9; })());
  ck("S2 偏差從 2pp 變 8pp（worse 6pp）⇒ STOP", layoutVerdict(mk(1000, 0.52, 0.58)).stop);
  ck("S3 偏差從 2pp 變 5.5pp（worse 3.5pp）⇒ WARN（z 未達 3 時）或 STOP（z ≥ 3）", (() => { const v = layoutVerdict(mk(1000, 0.52, 0.555)); return v.warn || v.stop; })());
  ck("S4 偏差變小（v20 6pp → v21 1pp）⇒ 不 STOP 不 WARN", (() => { const v = layoutVerdict(mk(1000, 0.56, 0.51)); return !v.stop && !v.warn && v.worsePp < 0; })());
  ck("S5 時長中位數變 +12% ⇒ WARN", layoutVerdict(mk(1000, 0.52, 0.52, 1120)).warn);
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

const PATH = val("path");
if (!["career", "challenge"].includes(PATH)) { console.error("需要 --path=career|challenge"); process.exit(2); }
const P = REG.paths[PATH];
const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
const [S0, S1] = P.seeds.range.split("-").map(Number);
/** 依序走奇數 seed，直到兩種配置的「有效」seed 都達標；invalid＝已知無效的 seed（補上同配置的下一個）。 */
function walk(invalid = new Set()) {
  const cnt = { STANDARD: 0, SWAPPED: 0 }, seeds = [];
  for (let s = S0; s <= S1; s += P.seeds.step) {
    seeds.push(s);
    if (!invalid.has(s)) cnt[objectiveLayoutForSeed(s)]++;
    if (cnt.STANDARD >= P.seeds.targetPerLayout && cnt.SWAPPED >= P.seeds.targetPerLayout) return { seeds, complete: true, cnt };
  }
  return { seeds, complete: false, cnt };
}
const tasksFor = (seeds) => seeds.flatMap((seed) => P.arms.map((arm) => ({ id: `${arm}#${seed}`, key: arm, seed, arm, path: PATH })));
if (flag("plan")) { const w = walk(); console.log(`${PATH}：走到 ${w.seeds[w.seeds.length - 1]}，${w.seeds.length} 個 seed × ${P.arms.length} 臂 ＝ ${w.seeds.length * P.arms.length} 場`, JSON.stringify(w.cnt)); process.exit(0); }
const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }
const SV = await imp("src/platform/contracts/simulationVersion.js");
const META = { study: `${REG.studyId}/${PATH}`, registration: sha16(REG_TEXT), fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] };
const invalidSeeds = () => {
  const bad = new Set();
  for (const arm of P.arms) for (const [id] of readKey(DIR, arm, ".errors")) bad.add(Number(id.split("#")[1]));
  //  有效性：career 比對規則集與 Director；challenge 比對結果裡記下的模擬版本（審查 M5：worker 自己填的 ruleset 不能當證據）。
  const verOf = (arm) => (arm === "challenge.v21" ? "moba-sim.v21" : "moba-sim.v20");
  for (const arm of P.arms) for (const [, r] of readKey(DIR, arm)) if (r.engineSeed !== r.seed
    || (PATH === "career" && (r.ruleset !== arm || (arm === "career.v21" && (r.director !== "core.v1" || r.laneFrame !== "teamRelative"))))
    || (PATH === "challenge" && r.simulationVersion !== verOf(arm))) bad.add(r.seed);
  return bad;
};

if (flag("run")) {
  if (!/^registered/.test(REG.status)) { console.error("登記檔不是 registered"); process.exit(2); }
  if (fs.existsSync(path.join(DIR, "HALT"))) { console.error("資料夾有 HALT：不得續跑"); process.exit(5); }
  const prov = provenance();
  if (prov.dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  for (let round = 0; round < 5; round++) {
    const w = walk(invalidSeeds());
    const res = await runStudy({ dir: DIR, tasks: tasksFor(w.seeds), workerFile: SELF, workerArgs: ["--sb-worker"], meta: META, workers: Number(val("workers", 3)), label: `side bias ${PATH}` });
    if (res.stopped) process.exit(3);
    if (res.lost) continue;
    const bad = invalidSeeds(), walked = walk(bad).seeds.length;
    if (walked >= 100 && bad.size / walked > 0.02) { console.error(`⛔ STOP(CIRCUIT_BREAKER)：無效 seed ${bad.size}／${walked}`); process.exit(5); }
    if (walk(bad).seeds.length === w.seeds.length) break;   // 沒有新的無效 seed ⇒ 計畫已涵蓋
  }
  process.exit(0);
}

if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  if (fs.existsSync(path.join(DIR, "HALT"))) { console.error("資料夾有 HALT：不判定，交 Owner"); process.exit(5); }
  const bad = invalidSeeds(), w = walk(bad);
  const data = Object.fromEntries(P.arms.map((a) => [a, readKey(DIR, a)]));
  const missing = w.seeds.filter((s) => !bad.has(s) && P.arms.some((a) => !data[a].has(`${a}#${s}`)));
  if (missing.length) { console.log(`資料未完整：還有 ${missing.length} 個 seed（不判定）`); process.exit(6); }
  const [a20, a21] = P.arms;
  const per = {};
  for (const L of ["STANDARD", "SWAPPED"]) {
    const pairs = w.seeds.filter((s) => !bad.has(s) && objectiveLayoutForSeed(s) === L).map((s) => ({ v20: data[a20].get(`${a20}#${s}`), v21: data[a21].get(`${a21}#${s}`) }));
    per[L] = layoutVerdict(pairs);
  }
  const breaker = w.seeds.length >= 100 && bad.size / w.seeds.length > 0.02;
  const verdict = breaker ? "STOP" : !w.complete ? "INCONCLUSIVE" : (per.STANDARD.stop || per.SWAPPED.stop) ? "STOP" : (per.STANDARD.warn || per.SWAPPED.warn) ? "WARN" : "PASS";
  const pure = (v) => (per.STANDARD[v] + per.SWAPPED[v]) / 2, dragon = (v) => (per.STANDARD[v] - per.SWAPPED[v]) / 2;
  //  各對手明細（登記檔 report）。
  const byOpp = {};
  for (const s of w.seeds.filter((x) => !bad.has(x))) {
    const r20 = data[a20].get(`${a20}#${s}`), r21 = data[a21].get(`${a21}#${s}`), k = r21.opponent;
    (byOpp[k] ??= { n: 0, blueWin20: 0, blueWin21: 0 }); byOpp[k].n++; byOpp[k].blueWin20 += winOf(r20); byOpp[k].blueWin21 += winOf(r21);
  }
  for (const v of Object.values(byOpp)) { v.blueWin20 /= v.n; v.blueWin21 /= v.n; }
  //  challenge.v20 一律在 STANDARD 打（seed 的分層只是標記）⇒ v20 只能報「STANDARD 下的藍方勝率」，不拆純藍方／巨龍側（審查 M5）。
  const sideSplit = PATH === "career"
    ? { pureBlueAdvantage: { v20: pure("bias20"), v21: pure("bias21") }, dragonSideAdvantage: { v20: dragon("bias20"), v21: dragon("bias21") } }
    : { v20StandardOnlyBlueRate: (per.STANDARD.blueWin20 * per.STANDARD.n + per.SWAPPED.blueWin20 * per.SWAPPED.n) / (per.STANDARD.n + per.SWAPPED.n),
        pureBlueAdvantage: { v21: pure("bias21") }, dragonSideAdvantage: { v21: dragon("bias21") },
        pairingNote: "challenger = FIXTURE_KEYS[seed % 5], defender = FIXTURE_KEYS[(seed + 2) % 5]: every fixture is challenger and defender equally often, but each pairing is one-directional, so blue (challenger) strength is not fully separated from the side" };
  const out = { schema: "esmo.side-bias-result.v1", path: PATH, registration: REG_REL, registrationHash: META.registration, fingerprint: META.fingerprint, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    seedsWalked: w.seeds.length, lastSeed: w.seeds[w.seeds.length - 1], invalidSeeds: [...bad], perLayout: per, ...sideSplit, byOpponent: byOpp, verdict };
  const OUT = path.join(ROOT, `tools/fixtures/side_bias_result_${PATH}_3aB.json`);
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  for (const L of ["STANDARD", "SWAPPED"]) { const v = per[L]; console.log(`${L}：n ${v.n}，藍勝 ${a20} ${(v.blueWin20 * 100).toFixed(1)}% → ${a21} ${(v.blueWin21 * 100).toFixed(1)}%，worse ${v.worsePp.toFixed(2)}pp，z ${v.z.toFixed(2)}，時長比 ${v.durRatio.toFixed(3)}${v.stop ? " STOP" : v.warn ? " WARN" : ""}`); }
  if (PATH === "career") console.log(`純藍方優勢 ${(out.pureBlueAdvantage.v20 * 100).toFixed(1)} → ${(out.pureBlueAdvantage.v21 * 100).toFixed(1)}pp；巨龍側優勢 ${(out.dragonSideAdvantage.v20 * 100).toFixed(1)} → ${(out.dragonSideAdvantage.v21 * 100).toFixed(1)}pp`);
  else console.log(`challenge.v20（一律 STANDARD）藍方勝率 ${(out.v20StandardOnlyBlueRate * 100).toFixed(1)}%；challenge.v21 純藍方 ${(out.pureBlueAdvantage.v21 * 100).toFixed(1)}pp、巨龍側 ${(out.dragonSideAdvantage.v21 * 100).toFixed(1)}pp`);
  console.log(`side bias ${PATH} 判定：${verdict}`);
  process.exit(verdict === "STOP" ? 5 : 0);
}
console.error("用法見檔頭"); process.exit(2);
