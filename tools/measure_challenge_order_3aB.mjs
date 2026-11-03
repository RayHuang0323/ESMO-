#!/usr/bin/env node
// ============================================================================
//  tools/measure_challenge_order_3aB.mjs — Phase 3a-B D5：Challenge 結算順序診斷（工具層把 players 陣列改成紅方在前）
//  （登記 tools/fixtures/challenge_order_registration_3aB.json；Owner 2026-10-30 核准 D5）
//
//  node tools/measure_challenge_order_3aB.mjs --plan
//  node tools/measure_challenge_order_3aB.mjs --selftest
//  node tools/measure_challenge_order_3aB.mjs --validate --vdir=<repo 外新資料夾>
//  node tools/measure_challenge_order_3aB.mjs --run --dir=<repo 外新資料夾> --vdir=<同上> [--workers=3]   要 review.reviewedAt＋validation 通過
//  node tools/measure_challenge_order_3aB.mjs --report --dir=<同一個>        寫 tools/fixtures/challenge_order_result_3aB.json
//  V1 對照：--c2dir（C2 已提交的鏡像紀錄，預設 C:/Users/ifikn/esmo-measure/challenge-c2-3aB；只用來證明管線＝C2，不進分析）
//
//  診斷用：src/ 不動、不加旗標、不換指紋。對局與 C2 完全相同（buildChallengeMatchSetup → 階梯 ladderSetup → 鏡像 → assembleMatch →
//  runChallenge 的 tick 迴圈）；唯一的介入是組裝完成後、第一個 tick 之前，把 e.players **原地**重排成紅方在前（同一方內順序不變）。
//  引擎內沒有依索引切隊伍或快取玩家子清單的寫法（審計 §2.1）；建構時的出生點亂數、平手裁決 hash（建構索引）都在重排之前就定了。
//  審查 D5 #1：藍方在前與紅方在前**都在同一批新 seeds 上實跑**（不重用 C2 已被篩選出來的 dB），O／P 拆解才不帶贏家詛咒。
//  沒有被換掉的（至少；審查 D5 #4）：固定 ["blue","red"] 的迴圈（LogicEngine.js 129／233／249／412／1029／3241／6081／6378／7249／7439）、
//  tuple 迴圈 5437／5828、成對呼叫 5973-5974（advance）／6038-6039（strike）、以 id localeCompare 的平手裁決（約 14 處，如 4483 偏向 b*）、
//  塔的 Object.entries 順序、兵清單；亂數的取用順序會跟著英雄順序改變（鏡像下對兩方對稱，只增加雜訊）。
//  以下 GROUPS／ladderSetup／EXPECT／mirrorSetup／directiveSymmetric／setupOf／play 與 measure_challenge_c2_3aB.mjs 逐字相同
//  （那支工具 import 時會執行頂層程式）；V1 用 C2 已提交紀錄逐場核對。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, pairedStats, insideRepo, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/challenge_order_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const C2REG = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/challenge_c2_registration_3aB.json"), "utf8"));
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const C2DIR = val("c2dir", "C:/Users/ifikn/esmo-measure/challenge-c2-3aB");
const verOf = (rs) => (rs === "challenge.v21" ? "moba-sim.v21" : "moba-sim.v20");
const winOf = (w) => (w === "blue" ? 1 : w === "red" ? 0 : 0.5);
export const SEATS = Object.freeze(["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"]);

const GROUPS = Object.freeze({ frame: ["tacticalDirector", "laneFrame"], order: ["assemblyOrder"], skills: ["heroSkills"], growth: ["heroPassives", "heroPowerCurve"], layout: ["objectiveLayout"] });
//  L1o（本研究新增）：L1 加組裝順序，不開技能；用來把 C2 的技能步驟（L1 → L3a，含組裝順序）拆成「組裝順序」與「技能」兩段。
export const CONTEXT_GROUPS = Object.freeze({ L0: [], L1: ["frame"], L1o: ["frame", "order"], L3a: ["frame", "order", "skills"], L3: ["frame", "order", "skills", "growth"] });
export function ladderSetup(s20, s21, groups) {
  const s = structuredClone(s20);
  for (const g of groups) {
    for (const k of GROUPS[g]) s.ruleset.layers[k] = s21.ruleset.layers[k];
    if (g === "skills" || g === "growth") for (const k of GROUPS[g]) s.effectiveLayers[k] = s21.effectiveLayers[k];
    if (g === "layout") { s.effectiveLayers.layoutConfigured = s21.effectiveLayers.layoutConfigured; s.objectiveLayout = s21.objectiveLayout; }
  }
  return s;
}
export const EXPECT = Object.freeze({
  L1: { director: "core.v1", laneFrame: "teamRelative", skills: false, growth: false },
  L1o: { director: "core.v1", laneFrame: "teamRelative", skills: false, growth: false },
  L3a: { director: "core.v1", laneFrame: "teamRelative", skills: true, growth: false },
});
export function mirrorSetup(setup, from) {
  const s = structuredClone(setup), to = from === "blue" ? "red" : "blue", fp = from[0], tp = to[0];
  for (let k = 1; k <= 5; k++) { s.roster[`${tp}${k}`] = structuredClone(setup.roster[`${fp}${k}`]); s.loadout[`${tp}${k}`] = structuredClone(setup.loadout[`${fp}${k}`]); }
  s.playerSlots[to] = setup.playerSlots[from].map((x) => ({ ...structuredClone(x), id: `${tp}${x.id.slice(1)}`, playerId: `${x.playerId}#mirror` }));
  s.tactic[to] = structuredClone(setup.tactic[from]);
  return s;
}
export function directiveSymmetric(e, ts = [0, 600, 1200]) {
  if (e.director?.laneFrame !== "teamRelative") return JSON.stringify(e.director.knobs("blue")) === JSON.stringify(e.director.knobs("red"));
  const strip = (d) => { const { side, ...rest } = d ?? {}; return JSON.stringify(rest); };
  return ts.every((t) => strip(e.director.directive("blue", t)) === strip(e.director.directive("red", t)));
}

// ── 純函式（selftest 涵蓋）────────────────────────────────────────────────
/** 原地重排：first 那一方的英雄全部移到陣列前段，同一方內的相對順序不變；回傳同一個陣列物件。 */
export function reorderPlayers(arr, first) {
  const a = arr.filter((p) => p.side === first), b = arr.filter((p) => p.side !== first);
  arr.splice(0, arr.length, ...a, ...b);
  return arr;
}
export const Z80 = 0.8416;
export const ZC = 2.81; // 審查 D5 #6：O、P × (4 陣容＋合併) ＝ 10 個檢定（0.05／10）
export const labelOf = (st, zCrit = ZC) => (!st || !st.n ? "NONE" : st.z == null ? (st.mean === 0 ? "NONE" : "MATERIAL") : Math.abs(st.z) >= zCrit ? "MATERIAL" : st.lo > 0 || st.hi < 0 ? "HINT" : "NONE");
export const mdeOf = (st, zCrit = ZC) => (st?.se != null ? (zCrit + Z80) * st.se : null);
/**
 * 拆解（逐 seed）：藍方在前的技能步驟 dB＝W_B(L3a) − W_B(L1)，紅方在前 dR＝W_R(L3a) − W_R(L1)。
 * 若技能層的側別效應全由「先處理的一方占優」造成，重排後效應換邊 ⇒ dR ≈ −dB。
 *   順序成分 O＝(dB − dR) / 2；位置成分 P＝(dB ＋ dR) / 2（換了順序仍留在藍方的部分）。
 */
export const decompose = (dB, dR) => ({ order: (dB - dR) / 2, position: (dB + dR) / 2 });
/** 合併判定（事前登記）：O、P 是否 MATERIAL（|z| ≥ 2.58）。 */
export function orderVerdict(O, P, perLineup = {}) {
  const o = labelOf(O) === "MATERIAL", p = labelOf(P) === "MATERIAL";
  if (o && p) return "MIXED";
  if (o) return "ORDER_DRIVEN";
  if (p) return "POSITION_DRIVEN";
  if (Object.values(perLineup).some((x) => labelOf(x.order) === "MATERIAL" || labelOf(x.position) === "MATERIAL")) return "LINEUP_SPECIFIC";
  return "INCONCLUSIVE";
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const mkP = () => ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"].map((id) => ({ id, side: id[0] === "b" ? "blue" : "red" }));
  ck("S1 reorderPlayers：紅方在前、同方順序不變、原地（同一個陣列物件）、元素不增減", (() => { const a = mkP(), ref = a, x = reorderPlayers(a, "red"); return x === ref && x.map((p) => p.id).join(",") === "r1,r2,r3,r4,r5,b1,b2,b3,b4,b5" && x.length === 10; })());
  ck("S2 reorderPlayers：藍方在前＝不變（冪等）", (() => { const a = mkP(); return reorderPlayers(a, "blue").map((p) => p.id).join(",") === "b1,b2,b3,b4,b5,r1,r2,r3,r4,r5"; })());
  ck("S3 decompose：dB 0.1、dR −0.1 ⇒ 順序 0.1、位置 0；dB 0.1、dR 0.1 ⇒ 順序 0、位置 0.1", (() => { const a = decompose(0.1, -0.1), b = decompose(0.1, 0.1); return Math.abs(a.order - 0.1) < 1e-12 && Math.abs(a.position) < 1e-12 && Math.abs(b.order) < 1e-12 && Math.abs(b.position - 0.1) < 1e-12; })());
  const M = { n: 9, z: 3, lo: 0.01, hi: 0.1 }, N = { n: 9, z: 1, lo: -0.01, hi: 0.1 };
  ck("S4 orderVerdict：O 達標 ⇒ ORDER_DRIVEN；P 達標 ⇒ POSITION_DRIVEN；兩者 ⇒ MIXED；都沒有但某陣容有 ⇒ LINEUP_SPECIFIC；否則 INCONCLUSIVE",
    orderVerdict(M, N) === "ORDER_DRIVEN" && orderVerdict(N, M) === "POSITION_DRIVEN" && orderVerdict(M, M) === "MIXED" && orderVerdict(N, N, { a: { order: M, position: N } }) === "LINEUP_SPECIFIC" && orderVerdict(N, N, { a: { order: N, position: N } }) === "INCONCLUSIVE");
  ck("S5 labelOf／mdeOf：z 2.81 門檻；se 0.02 ⇒ MDE (2.81＋0.8416)×0.02", labelOf({ n: 9, z: 2.82, lo: 0.01, hi: 0.1 }) === "MATERIAL" && labelOf({ n: 9, z: 2.7, lo: 0.01, hi: 0.1 }) === "HINT" && Math.abs(mdeOf({ se: 0.02 }) - 0.073032) < 1e-6);
  ck("S6 ladderSetup：L1o＝L1 加 assemblyOrder、不開技能", (() => { const s20 = { ruleset: { layers: { heroSkills: false, assemblyOrder: "challengeV20" } }, effectiveLayers: { heroSkills: false } };
    const s21 = { ruleset: { layers: { heroSkills: true, assemblyOrder: "live", tacticalDirector: "core.v1", laneFrame: "teamRelative" } }, effectiveLayers: { heroSkills: true } };
    const x = ladderSetup(s20, s21, CONTEXT_GROUPS.L1o), y = ladderSetup(s20, s21, CONTEXT_GROUPS.L1); return x.ruleset.layers.assemblyOrder === "live" && !x.effectiveLayers.heroSkills && x.ruleset.layers.laneFrame === "teamRelative" && y.ruleset.layers.assemblyOrder === "challengeV20"; })());
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── 組裝（worker 與 --validate 共用）──────────────────────────────────────────
let LIB = null;
async function lib() {
  LIB ??= {
    G: await imp("tools/lib/challengeGolden.mjs"), F: await imp("src/platform/challenge/fixtureOpponents.js"), H: await imp("src/data/heroDatabase.js"),
    S: await imp("src/platform/challenge/challengeMatchSetup.js"), R: await imp("src/platform/challenge/challengeRunner.js"),
    A: await imp("src/battle/moba/matchAssembler.js"), D: await imp("src/battle/moba/matchAssemblerDepsCore.js"), RS: await imp("src/platform/contracts/matchRuleset.js"),
  };
  return LIB;
}
async function setupOf(seed, rs) {
  const { G, F, RS, S } = await lib();
  const keys = G.FIXTURE_KEYS, defs = F.FIXTURE_OPPONENTS;
  const a = defs.find((d) => d.key === keys[seed % keys.length]), d = defs.find((x) => x.key === keys[(seed + 2) % keys.length]);
  const v = G.challengeGoldenInputs({ id: `sb-${seed}`, params: { index: seed % keys.length, seed, draft: true, tacticIds: [a.tacticId, d.tacticId] } }, { simulationVersion: verOf(rs) });
  const b = S.buildChallengeMatchSetup({ ...G.challengeBuilderArgs(v, true), rulesetId: RS.challengeRulesetForVersion(verOf(rs)).rulesetId });
  if (!b.ok) throw new Error(`setup: ${JSON.stringify(b.errors).slice(0, 200)}`);
  return { setup: b.setup, pairing: `${a.key}>${d.key}` };
}
export async function armSetup(spec, seed) {
  const { D, H, S } = await lib();
  const a = await setupOf(seed, "challenge.v20"), b = await setupOf(seed, "challenge.v21");
  let setup = ladderSetup(a.setup, b.setup, CONTEXT_GROUPS[spec.context]);
  setup = mirrorSetup(setup, spec.mirror);
  const deps = D.buildMatchAssemblerDepsFrom({ heroLookup: H.heroById, heroLookupLabel: S.CHALLENGE_HERO_LOOKUP_LABEL });
  return { setup, deps, pairing: a.pairing };
}
async function play(setup, deps, first) {
  const { A, R } = await lib();
  const r = A.assembleMatch(setup, deps);
  if (!r.ok) throw new Error(`assemble: ${JSON.stringify(r.errors).slice(0, 200)}`);
  const e = r.engine;
  const orderBuilt = e.players.map((p) => p.id).join(",");
  if (first === "red") reorderPlayers(e.players, "red");
  const t0 = { skillSeats: Object.keys(e.heroSkills ?? {}).sort(), passiveSeats: Object.keys(e.heroPassives ?? {}).sort(), curveSeats: Object.keys(e.powerCurve ?? {}).sort(),
    power: Object.fromEntries(e.players.map((p) => [p.id, Math.round(p.power * 1e6) / 1e6])), maxHp: Object.fromEntries(e.players.map((p) => [p.id, Math.round(p.maxHp * 1e6) / 1e6])),
    directiveSymmetric: directiveSymmetric(e), identityEqual: JSON.stringify(e.director.identity("blue")) === JSON.stringify(e.director.identity("red")),
    orderBuilt, orderPlayed: e.players.map((p) => p.id).join(",") };
  for (let t = R.CHALLENGE_DT; t <= R.CHALLENGE_MAX_T && !e.over; t += R.CHALLENGE_DT) e.tick(R.CHALLENGE_DT);
  const kills = (side) => e.players.filter((p) => p.side === side).reduce((n, p) => n + (p.k ?? 0), 0);
  return { winner: e.over && (e.winner === "blue" || e.winner === "red") ? e.winner : null, duration: Math.round(e.t), director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null,
    engine: { skills: e.heroSkillsOn === true, passives: e.heroPassivesOn === true, curve: e.powerCurveOn === true, layout: e.objectiveLayout ?? null }, t0, kills: { blue: kills("blue"), red: kills("red") },
    orderEnd: e.players.map((p) => p.id).join(",") };
}

if (flag("order-worker")) {
  process.on("message", async (t) => {
    try {
      const { setup, deps, pairing } = await armSetup(t.spec, t.seed);
      const g = await play(setup, deps, t.spec.first);
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, engineSeed: setup.seed, arm: t.arm, pairing, roster: Object.fromEntries(SEATS.map((s) => [s, setup.roster[s]?.heroId ?? null])), ...g } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 臂與 seeds ──────────────────────────────────────────────────────────────
//  重建臂（V1）：C2 的鏡像 seeds（已提交 side bias 走訪的奇數 seeds）前 rebuildRerun 個。
//  量測臂（審查 D5 #1）：新區塊 REG.seeds.fresh（奇數），每個陣容依 seed % 5 取前 n 個；藍方在前與紅方在前同一批 seeds。
const SV = await imp("src/platform/contracts/simulationVersion.js");
const FP = SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION];
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: FP };
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/side_bias_result_challenge_3aB.json"), "utf8"));
const WALK_C2 = []; for (let s = 33001; s <= committed.lastSeed; s += 2) WALK_C2.push(s);
const [F0, F1] = REG.seeds.fresh.range.split("-").map(Number);
const WALK_FRESH = []; for (let s = F0 | 1; s <= F1; s += 2) WALK_FRESH.push(s);
const seedsOf = (walk, residue, n) => walk.filter((s) => s % 5 === residue).slice(0, n);
const ARMS = Object.entries(REG.arms).map(([arm, d]) => {
  const src = C2REG.arms[d.source];
  if (!src || src.group !== "MIR") throw new Error(`${arm}: source ${d.source} 不是 C2 鏡像臂`);
  const spec = { source: d.source, lineup: src.lineup, mirror: src.mirror, residue: src.residue, context: d.context ?? src.context, first: d.first, kind: d.kind };
  const seeds = d.kind === "rebuild" ? seedsOf(WALK_C2, src.residue, REG.seeds.rebuildRerun) : seedsOf(WALK_FRESH, src.residue, REG.seeds.fresh.perArm);
  return { arm, spec, seeds, runSeeds: seeds };
});
if (ARMS.some((x) => x.spec.kind !== "rebuild" && x.seeds.length !== REG.seeds.fresh.perArm)) throw new Error("新區塊的 seeds 不夠");
const ARM = Object.fromEntries(ARMS.map((x) => [x.arm, x]));
const LINEUPS = [...new Set(ARMS.map((x) => x.spec.lineup))];
const taskOf = (x, seed) => ({ id: `${x.arm}#${seed}`, key: x.arm, seed, arm: x.arm, spec: x.spec });
const tasks = ARMS.flatMap((x) => x.runSeeds.map((s) => taskOf(x, s)));
if (flag("plan")) {
  console.log(`${ARMS.length} 臂，實跑 ${tasks.length} 場（重建臂＝C2 鏡像 seeds 前 ${REG.seeds.rebuildRerun} 個；量測臂＝新區塊 ${REG.seeds.fresh.range} 奇數，每臂 ${REG.seeds.fresh.perArm}）`);
  for (const x of ARMS) console.log(`  ${x.arm.padEnd(20)} 分析 ${String(x.seeds.length).padStart(4)}／實跑 ${String(x.runSeeds.length).padStart(4)}　${JSON.stringify(x.spec)}`);
  process.exit(0);
}
if (!REG.fingerprint.startsWith(FP)) { console.error(`登記的指紋與目前不同（目前 ${FP}）：拒絕`); process.exit(2); }
const BUILT = "b1,b2,b3,b4,b5,r1,r2,r3,r4,r5", REDFIRST = "r1,r2,r3,r4,r5,b1,b2,b3,b4,b5";

/** 即時檢查：層、席位、鏡像對稱、英雄順序都從引擎讀。 */
const recCheck = (r, t) => {
  const p = [], spec = (t ?? ARM[r.arm])?.spec ?? ARM[r.arm]?.spec;
  if (!spec) return ["unknown arm"];
  if (t && (r.arm !== t.arm || r.seed !== t.seed)) p.push("identity mismatch");
  if (r.engineSeed !== r.seed) p.push("engine seed");
  const x = EXPECT[spec.context];
  if (r.director !== x.director || r.laneFrame !== x.laneFrame) p.push(`frame ${r.director}/${r.laneFrame}`);
  const en = r.engine ?? {};
  if (en.skills !== x.skills || en.passives !== x.growth || en.curve !== x.growth || en.layout === "SWAPPED") p.push("engine layer mismatch");
  if (JSON.stringify(r.t0?.skillSeats ?? []) !== JSON.stringify(x.skills ? [...SEATS].sort() : [])) p.push("skill seats");
  if (r.t0?.orderBuilt !== BUILT) p.push(`built order ${r.t0?.orderBuilt}`);
  if (r.t0?.orderPlayed !== (spec.first === "red" ? REDFIRST : BUILT)) p.push(`played order ${r.t0?.orderPlayed}`);
  if (r.orderEnd !== (spec.first === "red" ? REDFIRST : BUILT)) p.push(`end order ${r.orderEnd}`);
  const same = [1, 2, 3, 4, 5].every((k) => r.roster[`b${k}`] === r.roster[`r${k}`] && r.t0.power[`b${k}`] === r.t0.power[`r${k}`] && r.t0.maxHp[`b${k}`] === r.t0.maxHp[`r${k}`]);
  if (!same || !r.t0.directiveSymmetric || !r.t0.identityEqual) p.push("mirror not symmetric at t=0");
  return p;
};
const envBad = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));
const C2REC = new Map();
const c2Rec = (source, seed) => { if (!C2REC.has(source)) C2REC.set(source, readKey(C2DIR, source)); return C2REC.get(source).get(`${source}#${seed}`); };
const REBUILD = ARMS.filter((x) => x.spec.kind === "rebuild").map((x) => x.arm);

if (flag("validate")) {
  if (envBad.length) { console.error(`環境有 ${envBad.join(",")}：拒絕`); process.exit(2); }
  const VDIR = val("vdir");
  if (!VDIR || insideRepo(VDIR)) { console.error("需要 repo 外的 --vdir"); process.exit(2); }
  let pass = 0, fail = 0;
  const ck = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${ok || !d ? "" : `　${d}`}`); };
  ck(`V0 臂數＝登記（${REG.expectedArms}）、實跑場數＝登記（${REG.expectedMatches}）`, ARMS.length === REG.expectedArms && tasks.length === REG.expectedMatches, `${ARMS.length}／${tasks.length}`);
  const missing = REBUILD.flatMap((arm) => ARM[arm].seeds.filter((s) => !c2Rec(ARM[arm].spec.source, s)).map((s) => `${arm}#${s}`));
  ck(`V1a 重建臂的每個 seed 都有 C2 已提交紀錄（${REBUILD.length} 臂）`, missing.length === 0, missing.slice(0, 5).join(","));
  const vTasks = ARMS.flatMap((x) => x.runSeeds.slice(0, x.spec.kind === "rebuild" ? 5 : 2).map((s) => taskOf(x, s)));
  const res = await runStudy({ dir: VDIR, tasks: vTasks, workerFile: SELF, workerArgs: ["--order-worker"], meta: { ...META, validation: true }, workers: Number(val("workers", 3)), label: "order validate", check: recCheck });
  if (res.halted || res.failed || res.lost) ck("驗證批次跑完", false, JSON.stringify(res));
  const diffs = [];
  for (const arm of REBUILD) for (const s of ARM[arm].runSeeds.slice(0, 5)) { const a = readKey(VDIR, arm).get(`${arm}#${s}`), b = c2Rec(ARM[arm].spec.source, s); if (!a || !b || a.winner !== b.winner || a.duration !== b.duration || JSON.stringify(a.kills) !== JSON.stringify(b.kills)) diffs.push(`${arm}#${s}`); }
  ck(`V1 藍方在前的重建臂（${REBUILD.length} 臂 × 5 seeds）與 C2 已提交紀錄逐場相同（winner、duration、kills）`, diffs.length === 0, diffs.slice(0, 5).join(","));
  const bad = vTasks.map((t) => { const r = readKey(VDIR, t.key).get(t.id); return r ? (recCheck(r, t).length ? `${t.id}:${recCheck(r, t).join("|")}` : null) : `${t.id}:missing`; }).filter(Boolean);
  ck(`V2 每場的層、技能席位、鏡像對稱、建構順序（藍方在前）與實際順序（紅方在前臂＝r1..r5,b1..b5）從引擎讀都符合（${vTasks.length} 場）`, bad.length === 0, bad.slice(0, 4).join(" ; "));
  //  V3：重排不改 t＝0 狀態（同 seed、同情境：紅方在前與藍方在前的每席 power／maxHp 相同）
  const t0Bad = [];
  for (const x of ARMS.filter((y) => y.spec.first === "red")) {
    const twin = ARMS.find((y) => y.spec.kind === "measure" && y.spec.first === "blue" && y.spec.lineup === x.spec.lineup && y.spec.context === x.spec.context);
    for (const s of x.runSeeds.slice(0, 2)) { const a = readKey(VDIR, x.arm).get(`${x.arm}#${s}`); if (!twin || !a) { t0Bad.push(`${x.arm}#${s}`); continue; }
      const { setup, deps } = await armSetup(twin.spec, s); const { A } = await lib(); const e = A.assembleMatch(setup, deps).engine;
      const pw = Object.fromEntries(e.players.map((p) => [p.id, Math.round(p.power * 1e6) / 1e6])), hp = Object.fromEntries(e.players.map((p) => [p.id, Math.round(p.maxHp * 1e6) / 1e6]));
      if (SEATS.some((k) => pw[k] !== a.t0.power[k] || hp[k] !== a.t0.maxHp[k])) t0Bad.push(`${x.arm}#${s}`); }
  }
  ck("V3 重排不改 t＝0 狀態：紅方在前的每席 power／maxHp 與同 seed 藍方在前的建構結果相同", t0Bad.length === 0, t0Bad.join(","));
  //  V4：紅方在前的對局決定性（同一場在本行程內重跑兩次，winner／duration／kills 相同）
  const x = ARMS.find((y) => y.spec.first === "red" && y.spec.context === "L3a"), s0 = x.runSeeds[0];
  const once = async () => { const { setup, deps } = await armSetup(x.spec, s0); return play(setup, deps, "red"); };
  const [g1, g2] = [await once(), await once()];
  ck(`V4 紅方在前的對局決定性（${x.arm}#${s0} 重跑兩次相同）`, g1.winner === g2.winner && g1.duration === g2.duration && JSON.stringify(g1.kills) === JSON.stringify(g2.kills));
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
  const ordered = REG.runOrder.flatMap((k) => tasks.filter((t) => ARM[t.arm].spec.kind === k));
  const res = await runStudy({ dir: DIR, tasks: ordered, workerFile: SELF, workerArgs: ["--order-worker"], meta: META, workers: Number(val("workers", 3)), label: "結算順序診斷", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}（不判定，交 Owner）`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const errSeeds = new Set(audit.errored.map((x) => x.seed));
  const recs = Object.fromEntries(ARMS.map((x) => [x.arm, readKey(DIR, x.arm)]));
  //  V1（審查 D5 #2／#8）：重建臂與 C2 逐場相同（winner、duration、kills）；C2 紀錄缺漏也算不符 ⇒ INSTRUMENT。
  const v1 = REBUILD.flatMap((arm) => ARM[arm].runSeeds.filter((s) => { const a = recs[arm].get(`${arm}#${s}`), b = c2Rec(ARM[arm].spec.source, s); return !a || !b || a.winner !== b.winner || a.duration !== b.duration || JSON.stringify(a.kills) !== JSON.stringify(b.kills); }).map((s) => `${arm}#${s}`));
  const armOf = (lu, ctx, first, kind = "measure") => ARMS.find((x) => x.spec.lineup === lu && x.spec.context === ctx && x.spec.first === first && x.spec.kind === kind)?.arm ?? null;
  //  分析只用本資料夾的量測臂（新 seeds）；紀錄缺漏 ⇒ 丟例外（auditStudy 已保證齊全，這裡是第二道防線）。
  const W = (arm, s) => { const r = recs[arm].get(`${arm}#${s}`); if (!r) throw new Error(`缺紀錄 ${arm}#${s}`); return winOf(r.winner); };
  const WB = (lu, ctx, s) => W(armOf(lu, ctx, "blue"), s);
  const WR = (lu, ctx, s) => W(armOf(lu, ctx, "red"), s);
  const WO = (lu, s) => W(armOf(lu, "L1o", "blue"), s);
  const seedsOfLu = (lu) => ARM[armOf(lu, "L3a", "red")].seeds.filter((s) => !errSeeds.has(s));
  const rowOf = (S, f) => pairedStats(S.map(f));
  const per = {}, poolO = [], poolP = [], poolA1 = [], poolA3 = [], poolAO = [], poolSk = [], poolDB = [], poolDR = [];
  for (const lu of LINEUPS) {
    const S = seedsOfLu(lu);
    const dB = (s) => WB(lu, "L3a", s) - WB(lu, "L1", s), dR = (s) => WR(lu, "L3a", s) - WR(lu, "L1", s);
    const O = (s) => decompose(dB(s), dR(s)).order, P = (s) => decompose(dB(s), dR(s)).position;
    //  各情境的「先處理者優勢」A＝(W_B − W_R)/2（鏡像：藍在前時藍多勝 A、紅在前時紅多勝 A）
    const A1 = (s) => (WB(lu, "L1", s) - WR(lu, "L1", s)) / 2, A3 = (s) => (WB(lu, "L3a", s) - WR(lu, "L3a", s)) / 2;
    const AO = (s) => WO(lu, s) - WB(lu, "L1", s), SK = (s) => WB(lu, "L3a", s) - WO(lu, s);
    for (const s of S) { poolO.push(O(s)); poolP.push(P(s)); poolA1.push(A1(s)); poolA3.push(A3(s)); poolAO.push(AO(s)); poolSk.push(SK(s)); poolDB.push(dB(s)); poolDR.push(dR(s)); }
    const st = { n: S.length, sideB: { L1: rowOf(S, (s) => WB(lu, "L1", s) - 0.5), L3a: rowOf(S, (s) => WB(lu, "L3a", s) - 0.5) }, sideR: { L1: rowOf(S, (s) => WR(lu, "L1", s) - 0.5), L3a: rowOf(S, (s) => WR(lu, "L3a", s) - 0.5) },
      skillStepBlueFirst: rowOf(S, dB), skillStepRedFirst: rowOf(S, dR), order: rowOf(S, O), position: rowOf(S, P), firstMoverL1: rowOf(S, A1), firstMoverL3a: rowOf(S, A3),
      assemblyOrderStep: rowOf(S, AO), skillsOnlyStep: rowOf(S, SK) };
    for (const k of ["order", "position", "firstMoverL1", "firstMoverL3a", "assemblyOrderStep", "skillsOnlyStep"]) st[`${k}Label`] = labelOf(st[k]);
    per[lu] = st;
  }
  const pooled = { n: poolO.length, skillStepBlueFirst: pairedStats(poolDB), skillStepRedFirst: pairedStats(poolDR), order: pairedStats(poolO), position: pairedStats(poolP), firstMoverL1: pairedStats(poolA1), firstMoverL3a: pairedStats(poolA3), assemblyOrderStep: pairedStats(poolAO), skillsOnlyStep: pairedStats(poolSk) };
  for (const k of ["order", "position", "firstMoverL1", "firstMoverL3a", "assemblyOrderStep", "skillsOnlyStep"]) { pooled[`${k}Label`] = labelOf(pooled[k]); pooled[`${k}Mde`] = mdeOf(pooled[k]); }
  pooled.skillStepBlueFirstLabel = labelOf(pooled.skillStepBlueFirst); pooled.skillStepBlueFirstMde = mdeOf(pooled.skillStepBlueFirst);
  //  重現（描述性）：新 seeds 上藍方在前的技能步驟 vs C2 已提交的 +6.9（C2 是篩選後的值，帶贏家詛咒）
  const c2res = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/challenge_c2_result_3aB.json"), "utf8"));
  const replication = { c2Pooled: c2res.mirror?.skillStep?.pooled?.mean ?? null, c2PerLineup: Object.fromEntries(LINEUPS.map((lu) => [lu, c2res.mirror?.skillStep?.perLineup?.[lu]?.delta?.mean ?? null])),
    freshPooled: pooled.skillStepBlueFirst.mean, freshLabel: pooled.skillStepBlueFirstLabel, note: "descriptive; the C2 value was selected for being significant (winner's curse)" };
  const er = errorRule(audit.errored.length, tasks.length);
  const instrument = audit.instrument.length > 0 || v1.length > 0 || er === "STOP";
  const verdict = instrument || audit.errored.length ? null : orderVerdict(pooled.order, pooled.position, Object.fromEntries(LINEUPS.map((lu) => [lu, per[lu]])));
  const outcome = instrument ? "INSTRUMENT" : audit.errored.length ? "INCONCLUSIVE" : "DIAGNOSED";
  const pp = (x) => (x == null ? "—" : (x * 100).toFixed(1)), ci = (st) => (st ? `${pp(st.mean)}（${pp(st.lo)}..${pp(st.hi)}，z ${st.z == null ? "—" : st.z.toFixed(2)}）` : "—");
  const result = { schema: "esmo.challengeOrder.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    sideBiasVerdict: "STOP (unchanged; diagnosis only, no engine change, no flag)", matches: tasks.length, errored: audit.errored, instrument: audit.instrument.slice(0, 20), v1Mismatch: v1, outcome,
    verdict, errorRule: er, replication, statsNote: "blue-first and red-first both run on the same fresh seeds (review D5 #1), paired per seed; O = (dB - dR)/2, P = (dB + dR)/2; label MATERIAL at |z| >= 2.81 (O and P x (4 lineups + pooled) = 10 tests, review D5 #6), HINT if the unadjusted 95% interval excludes 0; MDE = (2.81 + 0.84) x se; reordering changes the random-draw order, so blue-first and red-first matches on one seed are not the same match (noise, symmetric in a mirror); verdict null when any match errored (at most INCONCLUSIVE)",
    pooled, perLineup: per };
  if (instrument) { console.error(`⛔ INSTRUMENT：${JSON.stringify({ instrument: audit.instrument.slice(0, 3), v1: v1.slice(0, 3), errorRule: er })}（不寫結果檔）`); process.exit(5); }
  fs.writeFileSync(path.join(ROOT, "tools/fixtures/challenge_order_result_3aB.json"), JSON.stringify(result, null, 1) + "\n");
  console.log(`V1 重建臂逐場相同：${v1.length ? "❌ " + v1.slice(0, 3).join(",") : "✅"}`);
  for (const lu of LINEUPS) { const x = per[lu];
    console.log(`${lu.padEnd(12)} n ${x.n}　技能步驟 藍在前 ${ci(x.skillStepBlueFirst)}／紅在前 ${ci(x.skillStepRedFirst)}`);
    console.log(`             順序成分 O ${ci(x.order)} ${x.orderLabel}　位置成分 P ${ci(x.position)} ${x.positionLabel}`);
    console.log(`             先處理者優勢 L1 ${ci(x.firstMoverL1)} ${x.firstMoverL1Label}／L3a ${ci(x.firstMoverL3a)} ${x.firstMoverL3aLabel}　組裝順序步驟 ${ci(x.assemblyOrderStep)} ${x.assemblyOrderStepLabel}　純技能步驟 ${ci(x.skillsOnlyStep)} ${x.skillsOnlyStepLabel}`); }
  const P = pooled;
  console.log(`合併 n ${P.n}　技能步驟 藍在前 ${ci(P.skillStepBlueFirst)} ${P.skillStepBlueFirstLabel}（C2 篩選值 ${pp(replication.c2Pooled)}）／紅在前 ${ci(P.skillStepRedFirst)}`);
  console.log(`  順序成分 O ${ci(P.order)} ${P.orderLabel}（MDE ${pp(P.orderMde)}）　位置成分 P ${ci(P.position)} ${P.positionLabel}（MDE ${pp(P.positionMde)}）`);
  console.log(`  先處理者優勢 L1 ${ci(P.firstMoverL1)} ${P.firstMoverL1Label}／L3a ${ci(P.firstMoverL3a)} ${P.firstMoverL3aLabel}`);
  console.log(`  組裝順序步驟 ${ci(P.assemblyOrderStep)} ${P.assemblyOrderStepLabel}　純技能步驟 ${ci(P.skillsOnlyStep)} ${P.skillsOnlyStepLabel}`);
  console.log(`⇒ ${verdict ?? "（有錯誤場次，不判定）"}　結果 ${outcome}；錯誤規則 ${er}（side bias 維持 STOP）`);
  process.exit(0);
}
