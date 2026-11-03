#!/usr/bin/env node
// ============================================================================
//  tools/measure_challenge_bidir_3aB.mjs — Phase 3a-B P2-5b：Challenge 雙向配對（登記 tools/fixtures/challenge_bidir_registration_3aB.json）
//
//  node tools/measure_challenge_bidir_3aB.mjs --validate --fwddir=<side bias challenge 資料夾>        V1–V4（約 80 場，2–3 分鐘）
//  node tools/measure_challenge_bidir_3aB.mjs --run --dir=<repo 外新資料夾> --fwddir=<同上> [--workers=3]   要 review.reviewedAt＋owner.confirmedAt
//  node tools/measure_challenge_bidir_3aB.mjs --report --dir=<同一個> --fwddir=<同上>                寫 tools/fixtures/challenge_bidir_result_3aB.json
//  node tools/measure_challenge_bidir_3aB.mjs --selftest
//
//  正向＝已 commit 的 side bias challenge 紀錄（唯讀，挑戰方在藍方）；反向＝同一份 challengeGoldenInputs（同快照、同 Draft、
//  同戰術、同 matchSeed），防守方快照當藍方、挑戰方當紅方、戰術對調、Draft 指派逐席鏡像（b_i↔r_i），走正式的
//  buildChallengeMatchSetup → assembleMatch → 與 runChallenge 相同的 tick 迴圈。兩隊所有條件不變，只交換邊。
//  ⚠ 不改 side bias 的判定（仍 STOP）；結果只交 Owner 判讀，不是放行。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, pairedStats, meanSd, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/challenge_bidir_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const SB_REG_TEXT = fs.readFileSync(path.join(ROOT, "tools/fixtures/side_bias_registration_3aB.json"), "utf8"), SB_REG = JSON.parse(SB_REG_TEXT);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const ARMS = ["challenge.v20", "challenge.v21"];
const verOf = (arm) => (arm === "challenge.v21" ? "moba-sim.v21" : "moba-sim.v20");
const winOf = (w) => (w === "blue" ? 1 : w === "red" ? 0 : 0.5);

// ── 組裝（worker 與 --validate 共用）─────────────────────────────────────────
let LIB = null;
async function lib() {
  LIB ??= {
    G: await imp("tools/lib/challengeGolden.mjs"), F: await imp("src/platform/challenge/fixtureOpponents.js"), H: await imp("src/data/heroDatabase.js"),
    S: await imp("src/platform/challenge/challengeMatchSetup.js"), R: await imp("src/platform/challenge/challengeRunner.js"),
    A: await imp("src/battle/moba/matchAssembler.js"), D: await imp("src/battle/moba/matchAssemblerDepsCore.js"),
    RS: await imp("src/platform/contracts/matchRuleset.js"), Q: await imp("src/platform/contracts/squadSnapshot.js"),
  };
  return LIB;
}
/** 與 side bias worker 逐字相同的輸入（同一份 challengeGoldenInputs 呼叫）。 */
async function inputsOf(seed, arm) {
  const { G, F } = await lib();
  const keys = G.FIXTURE_KEYS, defs = F.FIXTURE_OPPONENTS;
  const a = defs.find((d) => d.key === keys[seed % keys.length]), d = defs.find((x) => x.key === keys[(seed + 2) % keys.length]);
  const v = G.challengeGoldenInputs({ id: `sb-${seed}`, params: { index: seed % keys.length, seed, draft: true, tacticIds: [a.tacticId, d.tacticId] } }, { simulationVersion: verOf(arm) });
  return { v, pairing: `${a.key}>${d.key}` };
}
/** Draft 指派逐席鏡像：b_i ↔ r_i（每隊的英雄留在同一個席位編號）。 */
export function mirrorAssignment(asg) {
  const out = {};
  for (const [seat, hero] of Object.entries(asg)) out[seat[0] === "b" ? `r${seat.slice(1)}` : `b${seat.slice(1)}`] = hero;
  return out;
}
/** 正向或反向的 builder 引數。 */
async function builderArgs(v, arm, reverse) {
  const { G, RS } = await lib();
  const fwd = { ...G.challengeBuilderArgs(v, true), rulesetId: RS.challengeRulesetForVersion(verOf(arm)).rulesetId };
  if (!reverse) return fwd;
  return { ...fwd, challengerSnapshot: fwd.defenderSnapshot, defenderSnapshot: fwd.challengerSnapshot,
    tactics: fwd.tactics ? { blue: fwd.tactics.red, red: fwd.tactics.blue } : null,
    draftResult: { ...fwd.draftResult, assignment: mirrorAssignment(fwd.draftResult.assignment) } };
}
async function buildSetup(ba) {
  const { S } = await lib();
  const b = S.buildChallengeMatchSetup(ba);
  if (!b.ok) throw new Error(`setup: ${JSON.stringify(b.errors).slice(0, 200)}`);
  return b.setup;
}
/** 與 runChallenge 相同的 deps 與 tick 迴圈。 */
async function play(setup) {
  const { A, D, H, S, R } = await lib();
  const r = A.assembleMatch(setup, D.buildMatchAssemblerDepsFrom({ heroLookup: H.heroById, heroLookupLabel: S.CHALLENGE_HERO_LOOKUP_LABEL }));
  if (!r.ok) throw new Error(`assemble: ${JSON.stringify(r.errors).slice(0, 200)}`);
  const e = r.engine;
  for (let t = R.CHALLENGE_DT; t <= R.CHALLENGE_MAX_T && !e.over; t += R.CHALLENGE_DT) e.tick(R.CHALLENGE_DT);
  return { winner: e.over && (e.winner === "blue" || e.winner === "red") ? e.winner : null, duration: Math.round(e.t), director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null };
}

if (flag("bidir-worker")) {
  process.on("message", async (t) => {
    try {
      const { v, pairing } = await inputsOf(t.seed, t.arm);
      const setup = await buildSetup(await builderArgs(v, t.arm, true));
      const g = await play(setup);
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, engineSeed: setup.seed, ruleset: setup.ruleset.rulesetId, orientation: "reverse", pairing, ...g } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 判定（純函式）────────────────────────────────────────────────────────────
/** 每個 seed：s＝(正向藍勝＋反向藍勝)/2（兩隊各站一次藍方 ⇒ 強弱在 seed 內抵消）；t＝挑戰隊兩邊平均勝率。 */
export const sideOf = (bf, br) => (bf + br) / 2;
export const strengthOf = (bf, br) => (bf + (1 - br)) / 2;
/** 分層判定：與已登記的 side bias 規則相同，只是套在去除強弱後的量。rows：[{ s20, s21 }]。 */
export function stratumVerdict(rows) {
  const S20 = meanSd(rows.map((r) => r.s20)).mean - 0.5, S21 = meanSd(rows.map((r) => r.s21)).mean - 0.5;
  const g = (Math.abs(S21) > Math.abs(S20) ? Math.sign(S21) : Math.sign(S20)) || Math.sign(S21) || 1;
  const z = pairedStats(rows.map((r) => (r.s21 - r.s20) * g)).z ?? 0;
  const worsePp = (Math.abs(S21) - Math.abs(S20)) * 100, winChangePp = (S21 - S20) * 100;
  const ci = (k) => { const p = pairedStats(rows.map((r) => r[k] - 0.5)); return [p.lo, p.hi]; };
  //  審查 M2：worse_pp 的 95% 上界（登記的近似）＝ worse_pp ＋ 1.96 × se(g 方向的配對差) × 100。
  const pd = pairedStats(rows.map((r) => (r.s21 - r.s20) * g));
  const worseUpperPp = worsePp + (pd.se ?? 0) * 1.96 * 100;
  return { n: rows.length, S20, S21, S20ci: ci("s20"), S21ci: ci("s21"), worsePp, worseUpperPp, winChangePp, z, stop: worsePp >= 5 || (worsePp > 0 && z >= 3), warnPp: worsePp >= 3 };
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  ck("S1 鏡像：b1→r1、r3→b3，兩次＝原樣", (() => { const a = { b1: "x", b3: "y", r1: "p", r3: "q" }, m = mirrorAssignment(a); return m.r1 === "x" && m.b3 === "q" && JSON.stringify(mirrorAssignment(m)) === JSON.stringify(a); })());
  ck("S2 強隊兩邊都贏 ⇒ s＝0.5（無側別）、t＝1", sideOf(1, 0) === 0.5 && strengthOf(1, 0) === 1);
  ck("S3 藍方兩次都贏 ⇒ s＝1、t＝0.5", sideOf(1, 1) === 1 && strengthOf(1, 1) === 0.5);
  const mk = (n, p20, p21) => Array.from({ length: n }, (_, i) => ({ s20: (i % 100) < p20 * 100 ? 1 : 0, s21: (i % 100) < p21 * 100 ? 1 : 0 }));
  ck("S4 規則同 side bias：52%→58% STOP；同值不 STOP；56%→51% 不 STOP 且 worse<0", stratumVerdict(mk(1000, 0.52, 0.58)).stop && !stratumVerdict(mk(1000, 0.52, 0.52)).stop && !stratumVerdict(mk(1000, 0.56, 0.51)).stop && stratumVerdict(mk(1000, 0.56, 0.51)).worsePp < 0);
  ck("S5 worse 與勝率變動分開：49%→54% ⇒ worse 3pp、勝率變動 +5pp", (() => { const v = stratumVerdict(mk(1000, 0.49, 0.54)); return Math.abs(v.worsePp - 3) < 1e-9 && Math.abs(v.winChangePp - 5) < 1e-9; })());
  ck("S6 worse 上界 ≥ worse，且樣本越大越窄", (() => { const a = stratumVerdict(mk(200, 0.5, 0.52)), b = stratumVerdict(mk(2000, 0.5, 0.52)); return a.worseUpperPp > a.worsePp && b.worseUpperPp < a.worseUpperPp; })());
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

const envBad = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));
if ((flag("run") || flag("validate")) && envBad.length) { console.error(`環境有 ${envBad.join(", ")}：先移除`); process.exit(2); }
const FWD = val("fwddir");
if (!FWD) { console.error("需要 --fwddir"); process.exit(2); }
const SV = await imp("src/platform/contracts/simulationVersion.js");
const FP = SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION];
const SB_META = { study: `${SB_REG.studyId}/challenge`, registration: sha16(SB_REG_TEXT), fingerprint: FP };
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: FP };
const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/side_bias_result_challenge_3aB.json"), "utf8"));

/** 正向資料：meta＝side bias challenge、每個 walk 過的 seed 兩版都有且有效（V4）。 */
function forwardData() {
  const m = JSON.parse(fs.readFileSync(path.join(FWD, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(SB_META)) return { err: `正向資料夾 meta 不是 side bias challenge：${JSON.stringify(m.meta)}` };
  const P = SB_REG.paths.challenge, [S0] = P.seeds.range.split("-").map(Number);
  const seeds = [];
  for (let s = S0; s <= committed.lastSeed; s += P.seeds.step) seeds.push(s);
  if (seeds.length !== committed.seedsWalked || committed.invalidSeeds.length) return { err: `seed 清單與已 commit 結果不符（${seeds.length} vs ${committed.seedsWalked}）` };
  const data = Object.fromEntries(ARMS.map((a) => [a, readKey(FWD, a)]));
  const bad = [];
  for (const a of ARMS) for (const s of seeds) { const r = data[a].get(`${a}#${s}`); if (!r || r.engineSeed !== s || r.simulationVersion !== verOf(a)) bad.push(`${a}#${s}`); }
  return bad.length ? { err: `正向資料缺漏或無效 ${bad.length}（${bad.slice(0, 3).join("、")}）` } : { seeds, data };
}

if (flag("validate")) {
  let pass = 0, fail = 0;
  const ck = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${ok || !d ? "" : `　${d}`}`); };
  const fd = forwardData();
  ck(`V4 正向資料完整有效（${committed.seedsWalked} seeds × 2 版）`, !fd.err, fd.err ?? "");
  if (fd.err) { console.log(`\nvalidate：${pass}/${pass + fail} FAIL`); process.exit(1); }
  const { Q } = await lib();
  const ss = (x) => Q.stableStringify(x);
  const pick = (L) => fd.seeds.filter((s) => objectiveLayoutForSeed(s) === L).slice(0, 20);
  const sample = [...pick("STANDARD"), ...pick("SWAPPED")];
  const v1bad = [], v2bad = [], v3bad = [];
  let moved = 0;
  for (const arm of ARMS) for (const seed of sample) {
    const { v } = await inputsOf(seed, arm);
    const fa = await builderArgs(v, arm, false), ra = await builderArgs(v, arm, true);
    const F = await buildSetup(fa), Rv = await buildSetup(ra);
    // V1：工具路徑的正向＝已 commit 的 runChallenge 紀錄
    const g = await play(F), c = fd.data[arm].get(`${arm}#${seed}`);
    if (g.winner !== c.winner || g.duration !== c.duration || F.seed !== c.engineSeed) v1bad.push(`${arm}#${seed}`);
    // V2：鏡像逐欄正確
    const okSeat = [1, 2, 3, 4, 5].every((i) => ss(Rv.roster[`b${i}`]) === ss(F.roster[`r${i}`]) && ss(Rv.roster[`r${i}`]) === ss(F.roster[`b${i}`])
      && ss(Rv.loadout?.[`b${i}`]) === ss(F.loadout?.[`r${i}`]) && ss(Rv.loadout?.[`r${i}`]) === ss(F.loadout?.[`b${i}`]));
    const slot = (arr, i) => { const x = arr?.[i]; return x ? { playerId: x.playerId, stats: x.stats } : null; };
    const okSlots = [0, 1, 2, 3, 4].every((i) => ss(slot(Rv.playerSlots?.blue, i)) === ss(slot(F.playerSlots?.red, i)) && ss(slot(Rv.playerSlots?.red, i)) === ss(slot(F.playerSlots?.blue, i)));
    const okTac = ss(Rv.tactic?.blue) === ss(F.tactic?.red) && ss(Rv.tactic?.red) === ss(F.tactic?.blue);
    const rest = Object.keys({ ...F, ...Rv }).filter((k) => !["roster", "loadout", "playerSlots", "tactic"].includes(k) && !/hash/i.test(k) && ss(F[k]) !== ss(Rv[k]));
    if (!(okSeat && okSlots && okTac && rest.length === 0)) v2bad.push(`${arm}#${seed}${rest.length ? `(${rest.join(",")})` : ""}`);
    if (ss(F.roster) !== ss(Rv.roster) && ss(F.playerSlots) !== ss(Rv.playerSlots) && ss(F.tactic) !== ss(Rv.tactic)) moved++;
    // V3：再鏡像一次＝正向
    const rra = { ...ra, challengerSnapshot: ra.defenderSnapshot, defenderSnapshot: ra.challengerSnapshot, tactics: ra.tactics ? { blue: ra.tactics.red, red: ra.tactics.blue } : null,
      draftResult: { ...ra.draftResult, assignment: mirrorAssignment(ra.draftResult.assignment) } };
    if (ss(await buildSetup(rra)) !== ss(F)) v3bad.push(`${arm}#${seed}`);
  }
  ck(`V1 工具路徑的正向＝已 commit 的 runChallenge 紀錄（勝方、時長、matchSeed；${sample.length} seeds × 2 版）`, v1bad.length === 0, v1bad.slice(0, 5).join("、"));
  ck("V2 鏡像逐欄正確（陣容、技能、配裝、選手數值、戰術對調；其餘欄位相同）", v2bad.length === 0, v2bad.slice(0, 5).join("、"));
  ck("V2 不是空的：陣容、數值、戰術三者都真的換了邊", moved === sample.length * ARMS.length, `${moved}/${sample.length * ARMS.length}`);
  ck("V3 再鏡像一次＝正向 setup", v3bad.length === 0, v3bad.slice(0, 5).join("、"));
  console.log(`\nvalidate：${pass}/${pass + fail} ${fail ? "FAIL ⇒ 不跑、交 Owner" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

const fdata = forwardData();
if (fdata.err) { console.error(fdata.err); process.exit(2); }
const SEEDS = fdata.seeds;
const tasks = ARMS.flatMap((arm) => SEEDS.map((seed) => ({ id: `${arm}#${seed}`, key: arm, seed, arm })));
if (flag("plan")) { console.log(`反向：${SEEDS.length} seeds × 2 版 ＝ ${tasks.length} 場（正向沿用 side bias 資料）`); process.exit(0); }
const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }
const recOk = (arm) => (r) => r.engineSeed === r.seed && r.ruleset === arm && r.orientation === "reverse" && (arm === "challenge.v21" ? r.director === "core.v1" && r.laneFrame === "teamRelative" : true);

if (flag("run")) {
  if (!REG.review?.reviewedAt || !REG.owner?.confirmedAt || !/^registered/.test(REG.status)) { console.error("登記未經審查或 Owner 尚未確認正式開跑"); process.exit(2); }
  if (provenance().dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--bidir-worker"], meta: META, workers: Number(val("workers", 3)), label: "challenge 雙向",
    check: (r, t) => (recOk(t.arm)(r) ? [] : ["instrument mismatch"]) });   // 審查 M3：用任務的 arm，不用紀錄自填的 ruleset
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  if (fs.existsSync(path.join(DIR, "HALT"))) { console.error("資料夾有 HALT：不判定，交 Owner"); process.exit(5); }
  const rev = Object.fromEntries(ARMS.map((a) => [a, readKey(DIR, a)])), errs = Object.fromEntries(ARMS.map((a) => [a, readKey(DIR, a, ".errors")]));
  const errored = ARMS.flatMap((a) => [...errs[a].keys()]);
  const invalid = ARMS.flatMap((a) => [...rev[a].entries()].filter(([, r]) => !recOk(a)(r)).map(([id]) => id));
  const missing = tasks.filter((t) => !rev[t.arm].has(t.id) && !errs[t.arm].has(t.id)).length;
  if (missing) { console.log(`資料未完整：還有 ${missing} 場（不判定）`); process.exit(6); }
  const dropped = new Set(errored.map((id) => Number(id.split("#")[1])));
  const rows = SEEDS.filter((s) => !dropped.has(s)).map((s) => {
    const o = { seed: s, stratum: objectiveLayoutForSeed(s) };
    for (const a of ARMS) {
      const k = a === "challenge.v21" ? "21" : "20", f = fdata.data[a].get(`${a}#${s}`), r = rev[a].get(`${a}#${s}`);
      o[`bf${k}`] = winOf(f.winner); o[`br${k}`] = winOf(r.winner); o[`s${k}`] = sideOf(o[`bf${k}`], o[`br${k}`]); o[`t${k}`] = strengthOf(o[`bf${k}`], o[`br${k}`]);
      o[`df${k}`] = f.duration; o[`dr${k}`] = r.duration; o.pairing = r.pairing;
    }
    return o;
  });
  const per = {};
  for (const L of ["STANDARD", "SWAPPED"]) per[L] = stratumVerdict(rows.filter((r) => r.stratum === L));
  //  審查 m2：時長比與 side bias 相同——各層分開、偶數取中間兩值平均；這裡正反向合併成一個樣本（登記檔宣告）。
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const durRatioBy = Object.fromEntries(["STANDARD", "SWAPPED"].map((L) => { const rs = rows.filter((r) => r.stratum === L); return [L, med(rs.flatMap((r) => [r.df21, r.dr21])) / med(rs.flatMap((r) => [r.df20, r.dr20]))]; }));
  const durWarn = Object.values(durRatioBy).some((x) => Math.abs(x - 1) > 0.10);
  const pooled20 = meanSd(rows.map((r) => r.s20)).mean - 0.5;
  const pure21 = (per.STANDARD.S21 + per.SWAPPED.S21) / 2, dragon21 = (per.STANDARD.S21 - per.SWAPPED.S21) / 2;
  const byPairing = {};
  for (const p of [...new Set(rows.map((r) => r.pairing))]) {
    const rs = rows.filter((r) => r.pairing === p), d = pairedStats(rs.map((r) => r.t21 - r.t20));
    byPairing[p] = { n: rs.length, challengerTeamWin20: meanSd(rs.map((r) => r.t20)).mean, challengerTeamWin21: meanSd(rs.map((r) => r.t21)).mean, change: d.mean, changeCi: [d.lo, d.hi],
      side20: meanSd(rs.map((r) => r.s20)).mean - 0.5, side21: meanSd(rs.map((r) => r.s21)).mean - 0.5 };
  }
  //  對照表：單向藍勝（已 commit 的 STOP 用的量）＝ 0.5 ＋ S ＋ 強弱項（＝正向藍勝 − s）。
  //  ⚠ 這裡用的是剔除 errored seed 之後的資料，與已 commit 的數字可能有微小差距（審查 m4）。
  const reconcile = {};
  for (const L of ["STANDARD", "SWAPPED"]) for (const k of ["20", "21"]) {
    const rs = rows.filter((r) => r.stratum === L), bf = meanSd(rs.map((r) => r[`bf${k}`])).mean, s = meanSd(rs.map((r) => r[`s${k}`])).mean;
    reconcile[`${L}.v${k}`] = { oneDirectionalBlueWin: bf, sideAdvantage: s - 0.5, strengthTerm: bf - s };
  }
  //  已 commit 的單向 STOP，兩種單位並列（審查 m1／Owner 第 4 項）。
  const committedUnits = Object.fromEntries(Object.entries(committed.perLayout).map(([L, v]) => [L, { worsePp: v.worsePp, winChangePp: (v.blueWin21 - v.blueWin20) * 100 }]));
  const instrument = invalid.length > 0 || errored.length / tasks.length > 0.01;
  const stop = per.STANDARD.stop || per.SWAPPED.stop, warn = per.STANDARD.warnPp || per.SWAPPED.warnPp || durWarn;
  const powered = per.STANDARD.worseUpperPp < 5 && per.SWAPPED.worseUpperPp < 5;
  const verdict = instrument ? "INSTRUMENT" : errored.length ? "INCONCLUSIVE" : stop ? "STOP" : warn ? "WARN" : "PASS";
  const outcome = { INSTRUMENT: "INSTRUMENT", INCONCLUSIVE: "INCONCLUSIVE", STOP: "SIDE_CONFIRMED", WARN: "SIDE_WARN", PASS: powered ? "SIDE_NOT_REPRODUCED" : "INCONCLUSIVE_POWER" }[verdict];
  const out = { schema: "esmo.challenge-bidir-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    sideBiasVerdict: "STOP (unchanged; this study never changes it)", seeds: SEEDS.length, errored, invalid, perStratum: per, durationRatioByStratum: durRatioBy,
    v20PooledSideAdvantage: pooled20, v21PureBlueAdvantage: pure21, v21DragonSideAdvantage: dragon21, byPairing, reconcile, committedOneDirectionalUnits: committedUnits, verdict, outcome,
    outcomeNote: "no label is a release PASS; SIDE_NOT_REPRODUCED means no evidence of a side worsening at this power, not proof of its absence; challenge side bias stays STOP and challenge.v21 stays flag-gated (Owner decides)",
    definitions: { worsePp: "(|S_v21| - |S_v20|) x 100: change in the size of the side advantage (distance from 50%)", winChangePp: "(S_v21 - S_v20) x 100: change of the strength-cancelled blue win rate" } };
  const OUT = path.join(ROOT, "tools/fixtures/challenge_bidir_result_3aB.json");
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  const pc = (x) => (x * 100).toFixed(1);
  for (const L of ["STANDARD", "SWAPPED"]) { const v = per[L], c = committedUnits[L]; console.log(`${L}：n ${v.n}，去除強弱後的藍方優勢 v20 ${pc(v.S20)}pp → v21 ${pc(v.S21)}pp（勝率變動 ${v.winChangePp.toFixed(2)}pp；惡化 ${v.worsePp.toFixed(2)}pp，上界 ${v.worseUpperPp.toFixed(2)}），z ${v.z.toFixed(2)}，時長比 ${durRatioBy[L].toFixed(3)}${v.stop ? " STOP" : v.warnPp ? " WARN" : ""}｜單向（已 commit）勝率變動 ${c.winChangePp.toFixed(2)}pp、惡化 ${c.worsePp.toFixed(2)}pp`); }
  for (const [p, b] of Object.entries(byPairing)) console.log(`  ${p.padEnd(32)} 挑戰隊勝率 v20 ${pc(b.challengerTeamWin20)}% → v21 ${pc(b.challengerTeamWin21)}%（${pc(b.change)}pp，CI ${pc(b.changeCi[0])}..${pc(b.changeCi[1])}）；側別 v20 ${pc(b.side20)} → v21 ${pc(b.side21)}pp`);
  console.log(`v21 純藍方 ${pc(pure21)}pp、巨龍側 ${pc(dragon21)}pp；判定 ${verdict} ⇒ ${outcome}（side bias STOP 不變；任何標籤都不是放行）`);
  process.exit(verdict === "STOP" || verdict === "INSTRUMENT" ? 5 : 0);
}
console.error("用法見檔頭"); process.exit(2);
