#!/usr/bin/env node
// ============================================================================
//  tools/measure_challenge_ladder_3aB.mjs — Phase 3a-B 修正規劃：Challenge 層級階梯診斷（登記 tools/fixtures/challenge_ladder_registration_3aB.json）
//
//  node tools/measure_challenge_ladder_3aB.mjs --plan
//  node tools/measure_challenge_ladder_3aB.mjs --validate --vdir=<repo 外新資料夾>     V1–V5（約 480 場）
//  node tools/measure_challenge_ladder_3aB.mjs --run --dir=<repo 外新資料夾> --vdir=<同上> [--workers=3]   要 review.reviewedAt＋validation 通過
//  node tools/measure_challenge_ladder_3aB.mjs --report --dir=<同一個>               寫 tools/fixtures/challenge_ladder_result_3aB.json
//  node tools/measure_challenge_ladder_3aB.mjs --selftest
//  端點資料夾：--fwddir（side bias challenge，預設下方常數）、--revdir（雙向研究，預設下方常數）
//
//  診斷用：src/ 不動。每個臂＝同一 seed、同一方向的正式 challenge.v20 setup，把 v21 setup 的整組層（ruleset.layers 與對應的
//  effectiveLayers／objectiveLayout）複製過去，再走正式 assembleMatch 與 runChallenge 的 tick 迴圈。不改 side bias 判定（仍 STOP）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, pairedStats, meanSd, insideRepo, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/challenge_ladder_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const FWD = val("fwddir", "C:/Users/ifikn/esmo-measure/sidebias-challenge-3aB-final");
const REV = val("revdir", "C:/Users/ifikn/esmo-measure/challenge-bidir-3aB");
const VERS = ["challenge.v20", "challenge.v21"];
const verOf = (rs) => (rs === "challenge.v21" ? "moba-sim.v21" : "moba-sim.v20");
const winOf = (w) => (w === "blue" ? 1 : w === "red" ? 0 : 0.5);

//  層群組（登記 layerGroups）：每組要從 v21 setup 複製的 ruleset 層鍵；skills／growth 另外帶 effectiveLayers，layout 帶 objectiveLayout。
export const GROUPS = Object.freeze({
  frame: ["tacticalDirector", "laneFrame"], order: ["assemblyOrder"], skills: ["heroSkills"], growth: ["heroPassives", "heroPowerCurve"], layout: ["objectiveLayout"],
});
export const ARM_GROUPS = Object.freeze({
  L1_frame: ["frame"], L3a_skills: ["frame", "order", "skills"], L3_growth: ["frame", "order", "skills", "growth"], R_noFrame: ["order", "skills", "growth", "layout"],
  //  審查 #2：layout 在下端也量一次（challengeV20 順序不支援 layout ⇒ 搭 order；order 在 L1 上已由 V2 證明是 no-op）。只跑 SWAPPED seeds。
  Lx_layout: ["frame", "order", "layout"],
  //  驗證用（不是正式臂）
  L0_built: [], L4_built: ["frame", "order", "skills", "growth", "layout"], L2_order: ["frame", "order"], L1_static: ["frame"],
});
export const NEW_ARMS = Object.freeze(["L1_frame", "L3a_skills", "L3_growth", "R_noFrame", "Lx_layout"]);
export const SWAPPED_ONLY = Object.freeze(["Lx_layout"]);
//  審查 #4／#5：步驟檢定 11 個（5 步 × 2 層＋下端 layout 只有 SWAPPED）⇒ Bonferroni z＝2.84；標籤只在達到這條線時給，未校正的命中只算提示。
export const BONF_Z = 2.84;
/** 步驟 → 詮釋標籤（純函式；selftest 涵蓋）。steps：{ stratum: { stepName: {mean, lo, hi, z} } }；total：{ stratum: {lo, hi} }（L4−L0）。 */
export function stepLabels(steps, total) {
  const LABEL = { "frame@v20": "FRAME", "frame@v21": "FRAME", "skills (incl. order)": "SKILLS_OR_GROWTH", growth: "SKILLS_OR_GROWTH", "layout@v21": "MAP_LAYOUT", "layout@low": "MAP_LAYOUT" };
  const labels = [], hints = [];
  for (const [stratum, byStep] of Object.entries(steps)) for (const [name, c] of Object.entries(byStep)) {
    if (!c || c.n === 0) continue;
    if (Math.abs(c.z ?? 0) >= BONF_Z) labels.push({ stratum, step: name, label: LABEL[name] });
    else if (c.lo > 0 || c.hi < 0) hints.push({ stratum, step: name, label: LABEL[name] });
  }
  const totalMoves = Object.entries(total).filter(([, t]) => t.lo > 0 || t.hi < 0).map(([k]) => k);
  const diffuse = totalMoves.filter((k) => !labels.some((l) => l.stratum === k));
  return { labels, hints, outcome: labels.length ? "ATTRIBUTED" : totalMoves.length ? "DIFFUSE_OR_UNDERPOWERED" : "NO_SIDE_CHANGE", diffuseStrata: diffuse };
}

/** v20 setup 的副本＋從 v21 setup 複製的層群組（純函式；selftest 涵蓋）。L1_static：frame 但 Director 留 static（拿掉鍵）。 */
export function ladderSetup(s20, s21, arm) {
  const s = structuredClone(s20);
  for (const g of ARM_GROUPS[arm]) {
    for (const k of GROUPS[g]) s.ruleset.layers[k] = s21.ruleset.layers[k];
    if (g === "skills" || g === "growth") for (const k of GROUPS[g]) s.effectiveLayers[k] = s21.effectiveLayers[k];
    if (g === "layout") { s.effectiveLayers.layoutConfigured = s21.effectiveLayers.layoutConfigured; s.objectiveLayout = s21.objectiveLayout; }
  }
  if (arm === "L1_static") delete s.ruleset.layers.tacticalDirector;
  return s;
}
/** 每個 seed：s＝(正向藍勝＋反向藍勝)/2（側別）；t＝(正向藍勝＋(1−反向藍勝))/2（挑戰隊強弱）。 */
export const sideOf = (bf, br) => (bf + br) / 2;
export const strengthOf = (bf, br) => (bf + (1 - br)) / 2;

// ── 組裝（worker 與 --validate 共用；與雙向研究逐字相同的輸入）──────────────────
let LIB = null;
async function lib() {
  LIB ??= {
    G: await imp("tools/lib/challengeGolden.mjs"), F: await imp("src/platform/challenge/fixtureOpponents.js"), H: await imp("src/data/heroDatabase.js"),
    S: await imp("src/platform/challenge/challengeMatchSetup.js"), R: await imp("src/platform/challenge/challengeRunner.js"),
    A: await imp("src/battle/moba/matchAssembler.js"), D: await imp("src/battle/moba/matchAssemblerDepsCore.js"),
    RS: await imp("src/platform/contracts/matchRuleset.js"),
  };
  return LIB;
}
async function inputsOf(seed, rs) {
  const { G, F } = await lib();
  const keys = G.FIXTURE_KEYS, defs = F.FIXTURE_OPPONENTS;
  const a = defs.find((d) => d.key === keys[seed % keys.length]), d = defs.find((x) => x.key === keys[(seed + 2) % keys.length]);
  const v = G.challengeGoldenInputs({ id: `sb-${seed}`, params: { index: seed % keys.length, seed, draft: true, tacticIds: [a.tacticId, d.tacticId] } }, { simulationVersion: verOf(rs) });
  return { v, pairing: `${a.key}>${d.key}` };
}
export function mirrorAssignment(asg) {
  const out = {};
  for (const [seat, hero] of Object.entries(asg)) out[seat[0] === "b" ? `r${seat.slice(1)}` : `b${seat.slice(1)}`] = hero;
  return out;
}
async function setupOf(seed, rs, reverse) {
  const { G, RS, S } = await lib();
  const { v, pairing } = await inputsOf(seed, rs);
  const fwd = { ...G.challengeBuilderArgs(v, true), rulesetId: RS.challengeRulesetForVersion(verOf(rs)).rulesetId };
  const ba = !reverse ? fwd : { ...fwd, challengerSnapshot: fwd.defenderSnapshot, defenderSnapshot: fwd.challengerSnapshot,
    tactics: fwd.tactics ? { blue: fwd.tactics.red, red: fwd.tactics.blue } : null,
    draftResult: { ...fwd.draftResult, assignment: mirrorAssignment(fwd.draftResult.assignment) } };
  const b = S.buildChallengeMatchSetup(ba);
  if (!b.ok) throw new Error(`setup: ${JSON.stringify(b.errors).slice(0, 200)}`);
  return { setup: b.setup, pairing };
}
async function armSetup(seed, arm, reverse) {
  const a = await setupOf(seed, "challenge.v20", reverse), b = await setupOf(seed, "challenge.v21", reverse);
  return { setup: ladderSetup(a.setup, b.setup, arm), s20: a.setup, s21: b.setup, pairing: a.pairing };
}
async function play(setup) {
  const { A, D, H, S, R } = await lib();
  const r = A.assembleMatch(setup, D.buildMatchAssemblerDepsFrom({ heroLookup: H.heroById, heroLookupLabel: S.CHALLENGE_HERO_LOOKUP_LABEL }));
  if (!r.ok) throw new Error(`assemble: ${JSON.stringify(r.errors).slice(0, 200)}`);
  const e = r.engine;
  for (let t = R.CHALLENGE_DT; t <= R.CHALLENGE_MAX_T && !e.over; t += R.CHALLENGE_DT) e.tick(R.CHALLENGE_DT);
  //  審查 #9：層是否真的接上，從引擎讀（不是從 setup 讀）。
  return { winner: e.over && (e.winner === "blue" || e.winner === "red") ? e.winner : null, duration: Math.round(e.t), director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null,
    engine: { skills: e.heroSkillsOn === true, passives: e.heroPassivesOn === true, curve: e.powerCurveOn === true, layout: e.objectiveLayout ?? null } };
}
const expectFrame = (arm) => (ARM_GROUPS[arm].includes("frame") ? { director: arm === "L1_static" ? "static" : "core.v1", laneFrame: "teamRelative" } : { director: "static", laneFrame: "legacyMirror" });

if (flag("ladder-worker")) {
  process.on("message", async (t) => {
    try {
      const { setup, pairing } = await armSetup(t.seed, t.arm, t.orientation === "reverse");
      const g = await play(setup);
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, engineSeed: setup.seed, arm: t.arm, orientation: t.orientation, pairing, layers: setup.ruleset.layers, ...g } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── selftest ────────────────────────────────────────────────────────────────
if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const s20 = { ruleset: { layers: { heroSkills: false, heroPassives: false, heroPowerCurve: false, objectiveLayout: "standard", assemblyOrder: "challengeV20" } }, effectiveLayers: { heroSkills: false, heroPassives: false, heroPowerCurve: false, layoutConfigured: false }, objectiveLayout: "STANDARD" };
  const s21 = { ruleset: { layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, objectiveLayout: "bySeed", assemblyOrder: "live", tacticalDirector: "core.v1", laneFrame: "teamRelative" } }, effectiveLayers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, layoutConfigured: true }, objectiveLayout: "SWAPPED" };
  ck("S1 所有群組 ⇒ 與 v21 的層／effectiveLayers／objectiveLayout 相同", JSON.stringify(ladderSetup(s20, s21, "L4_built")) === JSON.stringify(s21));
  ck("S2 沒有群組 ⇒ 與 v20 相同（而且是副本）", (() => { const x = ladderSetup(s20, s21, "L0_built"); return JSON.stringify(x) === JSON.stringify(s20) && x !== s20; })());
  ck("S3 L3a 只開 heroSkills，passives／powerCurve 仍關；layout 仍 standard", (() => { const x = ladderSetup(s20, s21, "L3a_skills"); return x.effectiveLayers.heroSkills && !x.effectiveLayers.heroPassives && !x.effectiveLayers.heroPowerCurve && x.ruleset.layers.objectiveLayout === "standard" && x.ruleset.layers.assemblyOrder === "live"; })());
  ck("S4 R_noFrame：v21 但沒有 tacticalDirector／laneFrame 鍵", (() => { const x = ladderSetup(s20, s21, "R_noFrame"); return !("laneFrame" in x.ruleset.layers) && !("tacticalDirector" in x.ruleset.layers) && x.objectiveLayout === "SWAPPED" && x.effectiveLayers.heroPowerCurve; })());
  ck("S5 L1_static：laneFrame teamRelative、沒有 tacticalDirector", (() => { const x = ladderSetup(s20, s21, "L1_static"); return x.ruleset.layers.laneFrame === "teamRelative" && !("tacticalDirector" in x.ruleset.layers); })());
  ck("S6 s／t：強隊兩邊都贏 ⇒ s 0.5、t 1；藍方兩次都贏 ⇒ s 1、t 0.5", sideOf(1, 0) === 0.5 && strengthOf(1, 0) === 1 && sideOf(1, 1) === 1 && strengthOf(1, 1) === 0.5);
  const st = (z, lo, hi) => ({ mean: 0, z, lo, hi, n: 100 });
  ck("S7 標籤：|z| ≥ 2.84 才給標籤；未校正命中只算提示", (() => { const r = stepLabels({ SWAPPED: { "layout@v21": st(3.0, 0.01, 0.05), growth: st(2.2, 0.001, 0.04) } }, { SWAPPED: { lo: 0.01, hi: 0.06 } }); return r.labels.length === 1 && r.labels[0].label === "MAP_LAYOUT" && r.hints.length === 1 && r.hints[0].label === "SKILLS_OR_GROWTH" && r.outcome === "ATTRIBUTED"; })());
  ck("S8 總變化顯著但沒有步驟達標 ⇒ DIFFUSE_OR_UNDERPOWERED；總變化也不顯著 ⇒ NO_SIDE_CHANGE", stepLabels({ SWAPPED: { growth: st(2.0, 0.001, 0.04) } }, { SWAPPED: { lo: 0.01, hi: 0.07 } }).outcome === "DIFFUSE_OR_UNDERPOWERED" && stepLabels({ SWAPPED: { growth: st(1.0, -0.01, 0.03) } }, { SWAPPED: { lo: -0.01, hi: 0.05 } }).outcome === "NO_SIDE_CHANGE");
  ck("S9 Lx_layout：frame＋order＋layout，沒有技能", (() => { const x = ladderSetup(s20, s21, "Lx_layout"); return x.objectiveLayout === "SWAPPED" && !x.effectiveLayers.heroSkills && x.ruleset.layers.assemblyOrder === "live" && x.ruleset.layers.laneFrame === "teamRelative"; })());
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── seeds 與端點 ──────────────────────────────────────────────────────────────
const SV = await imp("src/platform/contracts/simulationVersion.js");
const FP = SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION];
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: FP };
const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/side_bias_result_challenge_3aB.json"), "utf8"));
const SEEDS = [];
for (let s = 33001; s <= committed.lastSeed; s += 2) SEEDS.push(s);
const ORIENTS = ["forward", "reverse"];
const taskOf = (arm, seed, orientation) => ({ id: `${arm}#${seed}#${orientation}`, key: arm, seed, arm, orientation });
const seedsOfArm = (arm) => (SWAPPED_ONLY.includes(arm) ? SEEDS.filter((s) => objectiveLayoutForSeed(s) === "SWAPPED") : SEEDS);
const tasks = NEW_ARMS.flatMap((arm) => seedsOfArm(arm).flatMap((seed) => ORIENTS.map((o) => taskOf(arm, seed, o))));
if (flag("plan")) { console.log(`${NEW_ARMS.length} 臂 × ${SEEDS.length} seeds × 2 方向 ＝ ${tasks.length} 場；端點 L0／L4 沿用已提交資料`); for (const a of NEW_ARMS) console.log(`  ${a.padEnd(12)} ${ARM_GROUPS[a].join(" + ")}`); process.exit(0); }
if (!REG.fingerprint.startsWith(FP)) { console.error(`登記的指紋與目前不同（目前 ${FP}）：拒絕`); process.exit(2); }

const recCheck = (r, t) => {
  const p = [], arm = t?.arm ?? r.arm, x = expectFrame(arm);
  if (r.arm !== arm || (t && (r.seed !== t.seed || r.orientation !== t.orientation)) || r.engineSeed !== r.seed) p.push("identity mismatch");
  if (r.director !== x.director || r.laneFrame !== x.laneFrame) p.push(`frame mismatch ${r.director}/${r.laneFrame}`);
  const g = ARM_GROUPS[arm] ?? [], en = r.engine ?? {};
  //  審查 #9：技能／成長／佈局從引擎讀；佈局：有 layout 群組且 seed 是 SWAPPED ⇒ 引擎必須是 SWAPPED，否則不得是 SWAPPED。
  const wantSwapped = g.includes("layout") && objectiveLayoutForSeed(r.seed) === "SWAPPED";
  if (en.skills !== g.includes("skills") || en.passives !== g.includes("growth") || en.curve !== g.includes("growth") || (en.layout === "SWAPPED") !== wantSwapped) p.push("engine layer mismatch");
  if (r.layers && (r.layers.assemblyOrder === "live") !== g.includes("order")) p.push("order mismatch");
  return p;
};
/** 端點：L0／L4 的正向（side bias challenge）與反向（雙向研究），每個 seed 兩版都要有（V4）。 */
function endpoints() {
  const fm = JSON.parse(fs.readFileSync(path.join(FWD, "meta.json"), "utf8")).meta, rm = JSON.parse(fs.readFileSync(path.join(REV, "meta.json"), "utf8")).meta;
  const fwd = Object.fromEntries(VERS.map((a) => [a, readKey(FWD, a)])), rev = Object.fromEntries(VERS.map((a) => [a, readKey(REV, a)]));
  const bad = [];
  for (const a of VERS) for (const s of SEEDS) { const f = fwd[a].get(`${a}#${s}`), r = rev[a].get(`${a}#${s}`); if (!f || !r || f.engineSeed !== s || r.engineSeed !== s) bad.push(`${a}#${s}`); }
  return { fm, rm, bad, get: (ver, seed, o) => (o === "forward" ? fwd : rev)[ver].get(`${ver}#${seed}`) };
}
const envBad = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));

if (flag("validate")) {
  if (envBad.length) { console.error(`環境有 ${envBad.join(",")}：拒絕`); process.exit(2); }
  const VDIR = val("vdir");
  if (!VDIR || insideRepo(VDIR)) { console.error("需要 repo 外的 --vdir"); process.exit(2); }
  let pass = 0, fail = 0;
  const ck = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${ok || !d ? "" : `　${d}`}`); };
  const E = endpoints();
  ck(`V4 端點資料完整（${SEEDS.length} seeds × 2 版 × 2 方向）、meta 指紋＝凍結指紋`, SEEDS.length === committed.seedsWalked && E.bad.length === 0 && E.fm?.fingerprint === FP && E.rm?.fingerprint === FP, `缺 ${E.bad.length}（${E.bad.slice(0, 3).join("、")}）`);
  const pick = (L) => SEEDS.filter((s) => objectiveLayoutForSeed(s) === L).slice(0, 20);
  const sample = [...pick("STANDARD"), ...pick("SWAPPED")];
  // V5：setup 只在宣告的鍵不同（設定層，不跑對局）
  const allowed = (arm) => new Set(ARM_GROUPS[arm].flatMap((g) => GROUPS[g].map((k) => `ruleset.layers.${k}`).concat(g === "skills" || g === "growth" ? GROUPS[g].map((k) => `effectiveLayers.${k}`) : g === "layout" ? ["effectiveLayers.layoutConfigured", "objectiveLayout"] : [])));
  const deepDiff = (a, b, p = "") => (a && b && typeof a === "object" && typeof b === "object" ? [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => deepDiff(a[k], b[k], p ? `${p}.${k}` : k)) : JSON.stringify(a) === JSON.stringify(b) ? [] : [p]);
  const v5bad = [];
  //  審查 #8：所有樣本 seed × 兩個方向（含 SWAPPED，layout 的差異才會被檢到）；只比設定，不跑對局。
  for (const arm of [...NEW_ARMS, "L2_order"]) for (const s of sample) for (const o of ORIENTS) {
    const { setup, s20 } = await armSetup(s, arm, o === "reverse");
    const d = deepDiff(s20, setup).filter((k) => !allowed(arm).has(k));
    if (d.length) v5bad.push(`${arm}#${s}/${o}: ${d.join(",")}`);
  }
  ck(`V5 每個臂的 setup 只在宣告的層鍵與對應欄位與 L0 不同（${sample.length} seeds × 2 方向）`, v5bad.length === 0, v5bad.slice(0, 3).join(" | "));
  const vTasks = ["L0_built", "L4_built", "L1_frame", "L2_order", "L1_static", "L3a_skills"].flatMap((arm) => sample.flatMap((s) => ORIENTS.map((o) => taskOf(arm, s, o))));
  const res = await runStudy({ dir: VDIR, tasks: vTasks, workerFile: SELF, workerArgs: ["--ladder-worker"], meta: { ...META, validation: true }, workers: Number(val("workers", 3)), label: "challenge 階梯 validate", check: recCheck });
  if (res.halted || res.failed || res.lost) ck("驗證批次跑完", false, JSON.stringify(res));
  const R = (arm, s, o) => readKey(VDIR, arm).get(`${arm}#${s}#${o}`);
  const same = (x, y) => x && y && x.winner === y.winner && x.duration === y.duration;
  const v1 = [];
  for (const s of sample) for (const o of ORIENTS) {
    const a = R("L0_built", s, o), b = R("L4_built", s, o);
    if (!same(a, E.get("challenge.v20", s, o)) || a.engineSeed !== E.get("challenge.v20", s, o).engineSeed) v1.push(`L0#${s}#${o}`);
    if (!same(b, E.get("challenge.v21", s, o)) || b.engineSeed !== E.get("challenge.v21", s, o).engineSeed) v1.push(`L4#${s}#${o}`);
  }
  ck(`V1 階梯兩端＝已提交紀錄（${sample.length * 4} 場：win、duration、engine seed）`, v1.length === 0, v1.slice(0, 5).join(","));
  //  審查 #6：L3a（技能開、成長關）從未有規則集出貨過 ⇒ 確認能跑、引擎上技能有接、被動與成長曲線沒接（即時檢查已逐場比對引擎）。
  const v6 = sample.flatMap((s) => ORIENTS.filter((o) => { const r = R("L3a_skills", s, o); return !r || !r.engine?.skills || r.engine?.passives || r.engine?.curve; }).map((o) => `${s}#${o}`));
  ck(`V6 L3a（技能開、成長關）可跑且引擎狀態正確（${sample.length * 2} 場，0 錯誤）`, v6.length === 0 && !(res.failed > 0), v6.slice(0, 5).join(","));
  const v2 = sample.flatMap((s) => ORIENTS.filter((o) => !same(R("L2_order", s, o), R("L1_frame", s, o))).map((o) => `${s}#${o}`));
  ck(`V2 L2（frame＋order）＝L1_frame（${sample.length * 2} 場）`, v2.length === 0, `不同 ${v2.length}：${v2.slice(0, 5).join(",")}（登記：擋下 run，L2 改成正式臂後重審）`);
  const v3 = sample.flatMap((s) => ORIENTS.filter((o) => !same(R("L1_static", s, o), R("L1_frame", s, o))).map((o) => `${s}#${o}`));
  ck(`V3 frame 下 Director static＝core.v1（${sample.length * 2} 場）`, v3.length === 0, v3.slice(0, 5).join(","));
  const out = { at: new Date().toISOString(), gitHead: provenance().gitHead, registrationHash: META.registration, pass, fail };
  fs.writeFileSync(path.join(VDIR, "VALIDATION.json"), JSON.stringify(out, null, 1));
  console.log(`\nvalidate：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}（${VDIR}/VALIDATION.json）`);
  process.exit(fail ? 1 : 0);
}

const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }

if (flag("run")) {
  if (!/^registered/.test(REG.status) || !REG.review?.reviewedAt || !/^APPROVE( WITH CHANGES)?\b/.test(REG.review?.verdict ?? "")) { console.error("登記未經審查通過"); process.exit(2); }
  if (envBad.length) { console.error(`環境有 ${envBad.join(",")}：拒絕`); process.exit(2); }
  if (insideRepo(DIR)) { console.error("--dir 必須在 repo 外"); process.exit(2); }
  const VDIR = val("vdir");
  const vj = VDIR && fs.existsSync(path.join(VDIR, "VALIDATION.json")) ? JSON.parse(fs.readFileSync(path.join(VDIR, "VALIDATION.json"), "utf8")) : null;
  if (!vj || vj.fail !== 0 || vj.registrationHash !== META.registration) { console.error("需要 --vdir 指向本登記通過的 --validate 結果"); process.exit(2); }
  if (provenance().dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--ladder-worker"], meta: META, workers: Number(val("workers", 3)), label: "challenge 階梯", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}（不判定，交 Owner）`); process.exit(5); }
  //  審查 #3：即時檢查不合格的紀錄不得進分析。
  if (audit.instrument.length) { console.error(`⛔ 儀器檢查不合格 ${audit.instrument.length} 筆（不判定，交 Owner）：${JSON.stringify(audit.instrument.slice(0, 3))}`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const E = endpoints();
  if (E.bad.length) { console.error(`端點資料缺 ${E.bad.length}`); process.exit(2); }
  const dropped = new Set(audit.errored.map((x) => x.seed));
  const data = Object.fromEntries(NEW_ARMS.map((a) => [a, readKey(DIR, a)]));
  const win = (arm, s, o) => winOf((arm === "L0" ? E.get("challenge.v20", s, o) : arm === "L4" ? E.get("challenge.v21", s, o) : data[arm].get(`${arm}#${s}#${o}`)).winner);
  const LADDER = ["L0", "L1_frame", "L3a_skills", "L3_growth", "L4", "R_noFrame", "Lx_layout"];
  const STEPS = [["frame@v20", "L1_frame", "L0"], ["skills (incl. order)", "L3a_skills", "L1_frame"], ["growth", "L3_growth", "L3a_skills"], ["layout@v21", "L4", "L3_growth"], ["frame@v21", "L4", "R_noFrame"], ["layout@low", "Lx_layout", "L1_frame"]];
  const { G } = await lib();
  const keys = G.FIXTURE_KEYS;
  const pairingOf = (s) => `${keys[s % keys.length]}>${keys[(s + 2) % keys.length]}`;
  const rows = SEEDS.filter((s) => !dropped.has(s)).map((s) => {
    const r = { seed: s, layout: objectiveLayoutForSeed(s), pairing: pairingOf(s) };
    for (const a of LADDER) {
      if (SWAPPED_ONLY.includes(a) && r.layout !== "SWAPPED") continue;
      const bf = win(a, s, "forward"), br = win(a, s, "reverse"); r[`s_${a}`] = sideOf(bf, br); r[`t_${a}`] = strengthOf(bf, br);
    }
    return r;
  });
  const has = (r, a) => r[`s_${a}`] !== undefined;
  const ci = (xs) => { if (!xs.length) return { mean: null, lo: null, hi: null, z: null, n: 0 }; const p = pairedStats(xs); return { mean: p.mean, lo: p.lo, hi: p.hi, z: p.z, n: xs.length }; };
  const strata = { STANDARD: rows.filter((r) => r.layout === "STANDARD"), SWAPPED: rows.filter((r) => r.layout === "SWAPPED"), ALL: rows };
  const levels = Object.fromEntries(Object.entries(strata).map(([k, rs]) => [k, Object.fromEntries(LADDER.map((a) => [a, ci(rs.filter((r) => has(r, a)).map((r) => r[`s_${a}`] - 0.5))]))]));
  const stepOf = (rs, b, a, key = "s") => ci(rs.filter((r) => has(r, a) && has(r, b)).map((r) => r[`${key}_${b}`] - r[`${key}_${a}`]));
  //  標籤只用 STANDARD／SWAPPED 兩層（ALL 只是描述）；layout@low 只有 SWAPPED。
  const steps = Object.fromEntries(Object.entries(strata).map(([k, rs]) => [k, Object.fromEntries(STEPS.filter(([n]) => !(n === "layout@low" && k === "STANDARD")).map(([n, b, a]) => { const c = stepOf(rs, b, a); return [n, { ...c, moves: c.n > 0 && (c.lo > 0 || c.hi < 0), bonferroni: Math.abs(c.z ?? 0) >= BONF_Z }]; }))]));
  const total = Object.fromEntries(["STANDARD", "SWAPPED"].map((k) => [k, stepOf(strata[k], "L4", "L0")]));
  const labelled = stepLabels({ STANDARD: steps.STANDARD, SWAPPED: steps.SWAPPED }, total);
  const MAIN = ["frame@v20", "skills (incl. order)", "growth", "layout@v21"];
  const sumCheck = Object.fromEntries(Object.entries(strata).map(([k, rs]) => { const tot = meanSd(rs.map((r) => r.s_L4 - r.s_L0)).mean, sum = MAIN.reduce((acc, n) => acc + steps[k][n].mean, 0); return [k, Math.abs(tot - sum) < 1e-9]; }));
  const interaction = { frame: { STANDARD: stepOf(strata.STANDARD, "L4", "R_noFrame").mean - stepOf(strata.STANDARD, "L1_frame", "L0").mean, SWAPPED: stepOf(strata.SWAPPED, "L4", "R_noFrame").mean - stepOf(strata.SWAPPED, "L1_frame", "L0").mean },
    layoutSWAPPED: steps.SWAPPED["layout@v21"].mean - steps.SWAPPED["layout@low"].mean };
  const pairings = [...new Set(rows.map((r) => r.pairing))].sort();
  const byPairing = Object.fromEntries(pairings.map((p) => {
    const rs = rows.filter((r) => r.pairing === p);
    return [p, { n: rs.length, T: Object.fromEntries(LADDER.map((a) => [a, ci(rs.filter((r) => has(r, a)).map((r) => r[`t_${a}`]))])),
      stepsT: Object.fromEntries(STEPS.map(([n, b, a]) => { const c = stepOf(rs, b, a, "t"); return [n, { ...c, moves: c.n > 0 && (c.lo > 0 || c.hi < 0) }]; })),
      stepsS: Object.fromEntries(STEPS.map(([n, b, a]) => [n, stepOf(rs, b, a)])) }];
  }));
  const layoutCheckStandard = rows.filter((r) => r.layout === "STANDARD").every((r) => ["forward", "reverse"].every((o) => win("L4", r.seed, o) === win("L3_growth", r.seed, o)));
  const er = errorRule(audit.errored.length, tasks.length);
  const out = { schema: "esmo.challenge-ladder-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    sideBiasVerdict: "STOP (unchanged; diagnostic only; no fix, no compensation authorised)",
    seeds: rows.length, dropped: [...dropped], errored: audit.errored,
    outcome: er === "STOP" ? "INSTRUMENT" : er === "INCONCLUSIVE" ? "INCONCLUSIVE" : labelled.outcome,
    labels: labelled.labels, hints: labelled.hints, diffuseStrata: labelled.diffuseStrata, bonferroniZ: BONF_Z, mdeNote: REG.power,
    levelsS: levels, totalS: total, stepsS: steps, sumCheck, interaction, layoutStepZeroOnStandard: layoutCheckStandard, byPairing,
    notes: [
      "S in fractions of a win (x100 = pp); steps are paired per-seed differences of s; sequential attribution depends on the ladder order (frame and layout measured at both ends)",
      "'skills (incl. order)' bundles the assembly-order change: order is a no-op only without skills (V2); its effect with skills on cannot be separated (the challengeV20 order rejects skills)",
      "'growth' is growth given skills; the order skills -> growth is fixed by dependency (passives / power curve require skills)",
      "per-pairing steps are descriptive (no multiplicity correction)",
    ] };
  const OUT = path.join(ROOT, "tools/fixtures/challenge_ladder_result_3aB.json");
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  const pp = (x) => (x == null ? "—" : (x * 100).toFixed(1)), c = (s) => `${pp(s.mean)}（${pp(s.lo)}..${pp(s.hi)}）`;
  for (const k of ["STANDARD", "SWAPPED"]) {
    console.log(`${k}：S ${LADDER.map((a) => `${a} ${pp(levels[k][a].mean)}`).join("｜")}｜總變化 ${c(total[k])}`);
    for (const [n] of STEPS) if (steps[k][n]) console.log(`   ${n.padEnd(22)} ΔS ${c(steps[k][n])}${steps[k][n].bonferroni ? " ←←" : steps[k][n].moves ? " ←" : ""}`);
  }
  for (const p of pairings) { const b = byPairing[p]; console.log(`${p.padEnd(32)} T ${LADDER.slice(0, 6).map((a) => `${a} ${pp(b.T[a].mean)}`).join(" ")}｜${STEPS.slice(0, 5).map(([n]) => `${n} ${c(b.stepsT[n])}`).join("；")}`); }
  console.log(`標籤 ${JSON.stringify(labelled.labels)}；提示 ${JSON.stringify(labelled.hints)}`);
  console.log(`加總檢查 ${JSON.stringify(sumCheck)}；STANDARD 上 layout 步驟為 0：${layoutCheckStandard}；結果 ${out.outcome}（side bias STOP 不變）`);
}
