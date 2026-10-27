#!/usr/bin/env node
// ============================================================================
//  tools/measure_ga8_knob_3aB.mjs — Phase 3a-B P2-4c：G-A8 修正方案 A 旋鈕診斷（登記 tools/fixtures/ga8_knob_registration_3aB.json）
//
//  node tools/measure_ga8_knob_3aB.mjs --plan
//  node tools/measure_ga8_knob_3aB.mjs --validate --vdir=<repo 外新資料夾> [--ga8dir=<G-A8 資料夾>]   V1–V4
//  node tools/measure_ga8_knob_3aB.mjs --run --dir=<repo 外新資料夾> [--workers=3]   要 review.reviewedAt＋validation 通過紀錄
//  node tools/measure_ga8_knob_3aB.mjs --report --dir=<同一個> [--ga8dir=<G-A8 資料夾>]
//  node tools/measure_ga8_knob_3aB.mjs --selftest
//
//  診斷用：不改 G-A8 判定、門檻、係數、模板或 Registry。每個臂都是完整 MobaTacticConfig 走 legacy 輸入，
//  只換 macro.aggression／macro.riskTolerance；src/ 不動。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, pairedStats, meanSd, insideRepo, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/ga8_knob_registration_3aB.json";
const GA8_REG_REL = "tools/fixtures/ga8_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const GA8DIR_DEFAULT = "C:/Users/ifikn/esmo-measure/ga8-3aB-final";
const RULESET = "balanceTool.v21";
const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-12;

/** t＝0 時臂那一方的 Director 數值（V3 與即時檢查共用）。 */
function knobProbe(e, side) {
  const K = e.director.knobs(side), I = e.director.identity(side);
  return { retreatAt: K.retreatAt, laneOffsetValues: Object.values(K.laneOffset ?? {}).sort((a, b) => a - b), engageBias: I?.engageBias ?? 0, retreatFloorShift: I?.retreatFloorShift ?? 0, commitShift: I?.commitShift ?? 0 };
}

if (flag("knob-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const { tacticInputOf } = await imp("tools/lib/tacticTruthSim.mjs");
  const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
  const M = await modules();
  process.on("message", async (t) => {
    try {
      const plan = { kind: "legacy", config: structuredClone(t.config) }, std = tacticInputOf({ templateId: "std", choices: {} });
      const blueIsArm = t.seed % 2 === 1, side = blueIsArm ? "blue" : "red", sgn = blueIsArm ? 1 : -1;
      const { e } = configure(t.seed, "standard", M, 1, null, { blue: blueIsArm ? plan : std, red: blueIsArm ? std : plan }, RULESET);
      const probe = knobProbe(e, side);
      let gold600 = null, gold1200 = null;
      for (let i = 1; i * 0.5 <= 3600 && !e.over; i++) {
        e.tick(0.5);
        if (gold600 === null && e.t >= 600) gold600 = sgn * (e.bGold - e.rGold);
        if (gold1200 === null && e.t >= 1200) gold1200 = sgn * (e.bGold - e.rGold);
      }
      const win = e.over && (e.winner === "blue" || e.winner === "red") ? (e.winner === side ? 1 : 0) : 0.5;
      const foe = side === "blue" ? "red" : "blue";
      //  主堡不算（贏了就一定倒主堡，會跟勝負重疊）。
      const dead = (s) => Object.entries(e.towers).filter(([k, x]) => x.side === s && x.hp <= 0 && x.lane !== "nexus" && !k.includes("nexus")).length;
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, arm: t.arm, side, layout: objectiveLayoutForSeed(t.seed), ruleset: RULESET,
        layers: { heroSkills: !!M.skills, heroPassives: !!M.passives, heroPowerCurve: !!M.curves, battleTalents: !!M.talents }, director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null,
        probe, win, duration: e.t, killsFor: side === "blue" ? e.bK : e.rK, killsAgainst: side === "blue" ? e.rK : e.bK, gold600, gold1200, towersTaken: dead(foe), towersLost: dead(side) } });
    } catch (err) { process.send({ type: "error", id: t.id, error: String(err?.stack ?? err) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 純函式（selftest 涵蓋）────────────────────────────────────────────────
export function rateCI(wins) {
  const n = wins.length, p = wins.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const sd = Math.sqrt(wins.reduce((a, b) => a + (b - p) ** 2, 0) / Math.max(1, n - 1)), se = sd / Math.sqrt(Math.max(1, n));
  const lo = p - 1.96 * se, hi = p + 1.96 * se;
  const label = p >= 0.6 && lo > 0.55 ? "STOP" : p >= 0.57 ? "WARN strong" : p <= 0.43 ? "WARN weak" : null;
  return { n, rate: p, lo, hi, label };
}
/** 每個 seed 的最小平方斜率（每 +0.1）。points＝[{x, wins: Map seed→win}]。 */
export function seedSlopes(points, seeds) {
  const xs = points.map((p) => p.x), xbar = xs.reduce((a, b) => a + b, 0) / xs.length, sxx = xs.reduce((a, x) => a + (x - xbar) ** 2, 0);
  return seeds.map((s) => { const ys = points.map((p) => p.wins.get(s)); const ybar = ys.reduce((a, b) => a + b, 0) / ys.length; return (0.1 * xs.reduce((a, x, i) => a + (x - xbar) * (ys[i] - ybar), 0)) / sxx; });
}
export function templateLabel(kind, fullRate, neutralRate, K) {
  if (kind === "strong") {
    if (K.lo > 0 && neutralRate < 0.57) return "KNOB_DRIVEN";
    if (K.lo > 0 && neutralRate >= 0.57) return "MIXED";
    if (neutralRate >= 0.57 && K.lo <= 0) return "CONTENT_DRIVEN";
    return "UNRESOLVED";
  }
  if (K.hi < 0 && neutralRate > 0.43) return "KNOB_DRIVEN";
  if (K.hi < 0 && neutralRate <= 0.43) return "MIXED";
  if (neutralRate <= 0.43 && K.hi >= 0) return "CONTENT_DRIVEN";
  return "UNRESOLVED";
}
export function knobAttribution(direction, Kagg, Krisk) {
  if (!Krisk) return "AGGRESSION_ONLY_VARIED";
  const ex = (s) => (direction > 0 ? s.lo > 0 : s.hi < 0);
  return ex(Kagg) && ex(Krisk) ? "BOTH" : ex(Kagg) ? "AGGRESSION" : ex(Krisk) ? "RISK" : "NONE";
}
/** 反方向旗標：某個旋鈕的部分在 K 的反方向上排除 0。 */
export function oppositeFlags(direction, Kagg, Krisk) {
  const against = (s) => s && (direction > 0 ? s.hi < 0 : s.lo > 0);
  return [against(Kagg) ? "OPPOSITE_AGGRESSION" : null, against(Krisk) ? "OPPOSITE_RISK" : null].filter(Boolean);
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const ws = (n, p) => Array.from({ length: n }, (_, i) => ((i * 37) % 100 < p * 100 ? 1 : 0));
  ck("S1 rateCI 標籤：0.65 STOP、0.58 WARN strong、0.42 WARN weak、0.50 無", rateCI(ws(400, 0.65)).label === "STOP" && rateCI(ws(400, 0.58)).label === "WARN strong" && rateCI(ws(400, 0.42)).label === "WARN weak" && rateCI(ws(400, 0.5)).label === null);
  const sd = [2, 4, 6].map((s) => s);
  const pts = [0.2, 0.5, 0.8].map((x, i) => ({ x, wins: new Map(sd.map((s) => [s, i === 2 ? 1 : 0])) }));
  ck("S2 seedSlopes：0／0／1 在 0.2／0.5／0.8 ⇒ 每 +0.1 斜率 1/6", seedSlopes(pts, sd).every((v) => near(v, 1 / 6)));
  ck("S3 templateLabel 強：K>0 且中性 0.52 ⇒ KNOB_DRIVEN；中性 0.6 ⇒ MIXED；K 含 0 且中性 0.6 ⇒ CONTENT_DRIVEN；K 含 0 且中性 0.5 ⇒ UNRESOLVED",
    templateLabel("strong", 0.68, 0.52, { lo: 0.05, hi: 0.2 }) === "KNOB_DRIVEN" && templateLabel("strong", 0.68, 0.6, { lo: 0.02, hi: 0.1 }) === "MIXED" && templateLabel("strong", 0.62, 0.6, { lo: -0.03, hi: 0.07 }) === "CONTENT_DRIVEN" && templateLabel("strong", 0.6, 0.5, { lo: -0.01, hi: 0.2 }) === "UNRESOLVED");
  ck("S4 templateLabel 弱（鏡像）", templateLabel("weak", 0.3, 0.48, { lo: -0.3, hi: -0.1 }) === "KNOB_DRIVEN" && templateLabel("weak", 0.3, 0.4, { lo: -0.2, hi: -0.01 }) === "MIXED" && templateLabel("weak", 0.3, 0.4, { lo: -0.1, hi: 0.02 }) === "CONTENT_DRIVEN");
  ck("S5 knobAttribution", knobAttribution(1, { lo: 0.01 }, { lo: -0.01 }) === "AGGRESSION" && knobAttribution(1, { lo: -0.01 }, { lo: 0.02 }) === "RISK" && knobAttribution(-1, { hi: -0.01 }, { hi: -0.02 }) === "BOTH" && knobAttribution(1, { lo: -0.1 }, null) === "AGGRESSION_ONLY_VARIED");
  ck("S6 反方向旗標", oppositeFlags(1, { lo: -0.2, hi: -0.01 }, { lo: 0.01, hi: 0.1 }).join() === "OPPOSITE_AGGRESSION" && oppositeFlags(-1, { lo: -0.2, hi: -0.01 }, { lo: 0.01, hi: 0.1 }).join() === "OPPOSITE_RISK" && oppositeFlags(1, { lo: 0.01, hi: 0.2 }, null).length === 0);
  ck("S7 登記：seeds 25001–25400、46 臂、指紋 0578fa882d74b205", REG.seeds.range === "25001-25400" && /^46 arms/.test(REG.arms.total) && REG.fingerprint.startsWith("0578fa882d74b205"));
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── 臂 ─────────────────────────────────────────────────────────────────────
const { TACTIC_TEMPLATE_LIST } = await imp("src/platform/tactics/tacticTemplates.js");
const MTC = await imp("src/platform/contracts/MobaTacticConfig.js");
const cfgOf = (id) => { const t = TACTIC_TEMPLATE_LIST.find((x) => x.templateId === id); if (!t) throw new Error(`no template ${id}`); return structuredClone(t.config); };
const withKnobs = (c, a, r) => { const x = structuredClone(c); if (a != null) x.macro.aggression = a; if (r != null) x.macro.riskTolerance = r; return x; };
const FOCAL = { ...REG.focalTemplates["strong (G-A8 STOP)"], ...REG.focalTemplates["weak (G-A8 WARN weak)"] };
const KIND = Object.fromEntries([...Object.keys(REG.focalTemplates["strong (G-A8 STOP)"]).map((k) => [k, "strong"]), ...Object.keys(REG.focalTemplates["weak (G-A8 WARN weak)"]).map((k) => [k, "weak"])]);
for (const [tpl, [a, r]] of Object.entries(FOCAL)) { const m = cfgOf(tpl).macro; if (m.aggression !== a || m.riskTolerance !== r) { console.error(`登記的旋鈕與模板不符：${tpl} ${m.aggression}/${m.riskTolerance}`); process.exit(2); } }
const STD_CFG = cfgOf("std");
const pairKey = (a, r) => `STDKNOBS_${a}_${r}`;
const ARMS = [];
const add = (arm, base, config) => ARMS.push({ arm, base, config });
add("STD", null, STD_CFG);
for (const tpl of Object.keys(FOCAL)) add(`FULL_${tpl}`, null, cfgOf(tpl));
for (const tpl of Object.keys(FOCAL)) add(`NEUTRAL_${tpl}`, `FULL_${tpl}`, withKnobs(cfgOf(tpl), 0.5, 0.5));
for (const [tpl, [, r]] of Object.entries(FOCAL)) if (r !== 0.5) add(`AGGNEUTRAL_${tpl}`, `FULL_${tpl}`, withKnobs(cfgOf(tpl), 0.5, null));
for (const [tpl, [, r]] of Object.entries(FOCAL)) if (r !== 0.5) add(`RISKNEUTRAL_${tpl}`, `FULL_${tpl}`, withKnobs(cfgOf(tpl), null, 0.5));
for (const [a, r] of [...new Map(Object.values(FOCAL).map(([a, r]) => [`${a}_${r}`, [a, r]])).values()]) add(pairKey(a, r), "STD", withKnobs(STD_CFG, a, r));
for (const v of [0.2, 0.25, 0.35, 0.65, 0.8, 0.85]) add(`SCAN_A_${v}`, "STD", withKnobs(STD_CFG, v, null));
for (const v of [0.2, 0.35, 0.65, 0.8]) add(`SCAN_R_${v}`, "STD", withKnobs(STD_CFG, null, v));
const ARM = Object.fromEntries(ARMS.map((x) => [x.arm, x]));
/** 臂設定預期的 Director 數值（純量；laneOffset 取值的多重集合，紅方換路名不影響）。 */
const expectOf = (config) => { const K = MTC.toEngineTactic(config), I = MTC.toEngineTacticIdentity(config); return { retreatAt: K.retreatAt, laneOffsetValues: Object.values(K.laneOffset).sort((a, b) => a - b), engageBias: I.engageBias, retreatFloorShift: I.retreatFloorShift, commitShift: I.commitShift }; };
const probeEq = (p, q) => ["retreatAt", "engageBias", "retreatFloorShift", "commitShift"].every((k) => near(p[k], q[k])) && p.laneOffsetValues.length === q.laneOffsetValues.length && p.laneOffsetValues.every((v, i) => near(v, q.laneOffsetValues[i]));
for (const x of ARMS) x.expect = expectOf(x.config);
//  玩家選得到嗎：從程式讀（CHOICE_MAPPING 的數值＋tacticBookOptions 在 core.v1 下提供的選項＋模板自己的值）。
const { CHOICE_MAPPING } = await imp("src/platform/tactics/tacticChoiceMapping.js");
const { tacticBookOptions } = await imp("src/battle/moba/tactics/tacticResolver.js");
const templateOfArm = (arm) => { const m = /^(FULL|NEUTRAL|AGGNEUTRAL|RISKNEUTRAL)_(.+)$/.exec(arm); return m ? m[2] : "std"; };
const offeredValues = (tpl, dim, own) => { const row = tacticBookOptions(tpl, [], {}, { tacticalDirector: "core.v1" }).find((r) => r.dimension === dim); return [...new Set([own, ...(row?.offered ?? []).map((c) => CHOICE_MAPPING.rows[dim].values[c])])].sort((a, b) => a - b); };
const REACH = {};
for (const x of ARMS) {
  const tpl = templateOfArm(x.arm), own = cfgOf(tpl).macro;
  const agg = (REACH[`${tpl}|a`] ??= offeredValues(tpl, "teamfight.posture", own.aggression)), risk = (REACH[`${tpl}|r`] ??= offeredValues(tpl, "risk.tolerance", own.riskTolerance));
  x.playerReachable = agg.includes(x.config.macro.aggression) && risk.includes(x.config.macro.riskTolerance);
}

const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: S1 - S0 + 1 }, (_, i) => S0 + i);
const taskOf = (x, seed) => ({ id: `${x.arm}#${seed}`, key: x.arm, seed, arm: x.arm, config: x.config });
const tasks = ARMS.flatMap((x) => SEEDS.map((seed) => taskOf(x, seed)));
if (flag("plan")) { console.log(`${ARMS.length} 臂 × ${SEEDS.length} seeds ＝ ${tasks.length} 場`); for (const x of ARMS) console.log(`  ${x.arm.padEnd(36)} a ${x.config.macro.aggression} r ${x.config.macro.riskTolerance}${x.base ? `（基準 ${x.base}）` : ""}${x.playerReachable ? "　玩家選得到" : ""}`); console.log(`玩家可選值：${Object.entries(REACH).map(([k, v]) => `${k} ${v.join("/")}`).join("；")}`); process.exit(0); }

const recCheck = (r, t) => {
  const p = [];
  if (!(r.ruleset === RULESET && r.director === "core.v1" && r.laneFrame === "teamRelative" && r.layers?.heroSkills && !r.layers?.battleTalents)) p.push("instrument mismatch");
  const x = ARM[t?.arm ?? r.arm];
  if (!x || r.arm !== x.arm || !r.probe || !probeEq(r.probe, x.expect)) p.push("knob probe mismatch");
  return p;
};
const envBad = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));
const SV = await imp("src/platform/contracts/simulationVersion.js");
const FP = SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION];
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: FP };
const GA8DIR = val("ga8dir", GA8DIR_DEFAULT);
if ((flag("validate") || flag("run")) && !REG.fingerprint.startsWith(FP)) { console.error(`登記的指紋與目前不同（目前 ${FP}）：拒絕`); process.exit(2); }
const ga8Rec = (arm, seed) => { const tpl = arm === "STD" ? "std" : arm.slice("FULL_".length); return readKey(GA8DIR, tpl).get(`${tpl}#${seed}`); };

if (flag("validate")) {
  if (envBad.length) { console.error(`環境有 ${envBad.join(",")}：拒絕`); process.exit(2); }
  const VDIR = val("vdir");
  if (!VDIR || insideRepo(VDIR)) { console.error("需要 repo 外的 --vdir"); process.exit(2); }
  let pass = 0, fail = 0;
  const ck = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${d ? `　${d}` : ""}`); };
  // V4
  const gm = JSON.parse(fs.readFileSync(path.join(GA8DIR, "meta.json"), "utf8"));
  const ga8RegHash = sha16(fs.readFileSync(path.join(ROOT, GA8_REG_REL), "utf8"));
  const ga8Tasks = [...TACTIC_TEMPLATE_LIST.map((t) => t.templateId)].flatMap((tpl) => SEEDS.map((seed) => ({ id: `${tpl}#${seed}`, key: tpl, seed })));
  const ga8Audit = auditStudy(GA8DIR, ga8Tasks);
  ck("V4 G-A8 資料夾完整、meta＝G-A8 登記與指紋", gm.meta?.registration === ga8RegHash && gm.meta?.fingerprint === FP && !ga8Audit.halt && ga8Audit.missing === 0 && ga8Audit.errored.length === 0, `missing ${ga8Audit.missing} errored ${ga8Audit.errored.length}`);
  // V2
  const deepDiff = (a, b, p = "") => (a && b && typeof a === "object" && typeof b === "object" ? [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => deepDiff(a[k], b[k], p ? `${p}.${k}` : k)) : JSON.stringify(a) === JSON.stringify(b) ? [] : [p]);
  const v2 = ARMS.map((x) => {
    const okValid = MTC.validateMobaTacticConfig(x.config).ok;
    const ref = cfgOf(templateOfArm(x.arm));
    const d = deepDiff(ref, x.config);
    const allowed = x.arm.startsWith("FULL_") || x.arm === "STD" ? d.length === 0 : d.length > 0 && d.every((k) => k === "macro.aggression" || k === "macro.riskTolerance");
    return okValid && allowed ? null : `${x.arm} valid=${okValid} diff=${d.join(",")}`;
  }).filter(Boolean);
  ck(`V2 ${ARMS.length} 臂設定合法、只改宣告的欄位、FULL 與模板相同、登記指紋＝目前`, v2.length === 0 && ARMS.length === 46 && REG.fingerprint.startsWith(FP), v2.slice(0, 3).join(" | "));
  // V3 non-vacuous（設定層；實際引擎值由 V1 的探針與即時檢查比對）
  const v3 = ARMS.filter((x) => x.base).filter((x) => probeEq(x.expect, ARM[x.base].expect)).map((x) => x.arm);
  ck("V3a 每個改過旋鈕的臂，預期 Director 數值至少一項與基準臂不同", v3.length === 0, v3.join(","));
  // V1＋V3b：跑 FULL／STD 前 20 seeds，與 G-A8 紀錄逐場相同；探針等於預期
  const vSeeds = SEEDS.slice(0, 20);
  const vTasks = ARMS.filter((x) => x.arm === "STD" || x.arm.startsWith("FULL_")).flatMap((x) => vSeeds.map((s) => taskOf(x, s)));
  // 另加每個改過旋鈕的臂 2 個 seeds（一藍一紅）驗探針
  const pTasks = ARMS.filter((x) => x.base).flatMap((x) => [vSeeds[0], vSeeds[1]].map((s) => taskOf(x, s)));
  const res = await runStudy({ dir: VDIR, tasks: [...vTasks, ...pTasks], workerFile: SELF, workerArgs: ["--knob-worker"], meta: { ...META, validation: true }, workers: Number(val("workers", 3)), label: "旋鈕診斷 validate", check: recCheck });
  if (res.halted || res.failed || res.lost) { ck("V1 驗證批次跑完", false, JSON.stringify(res)); }
  const diffs = [];
  for (const t of vTasks) { const r = readKey(VDIR, t.key).get(t.id), g = ga8Rec(t.arm, t.seed); if (!r || !g || r.win !== g.win || r.duration !== g.duration) diffs.push(t.id); }
  ck(`V1 legacy 路徑＝G-A8 紀錄（${vTasks.length} 場：win、duration）`, diffs.length === 0, diffs.slice(0, 5).join(","));
  const probeBad = [...vTasks, ...pTasks].filter((t) => { const r = readKey(VDIR, t.key).get(t.id); return !r || recCheck(r, t).length; }).map((t) => t.id);
  ck(`V3b 引擎 t＝0 的 Director 數值＝臂設定的預期（${vTasks.length + pTasks.length} 場，藍紅各有）`, probeBad.length === 0, probeBad.slice(0, 5).join(","));
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
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--knob-worker"], meta: META, workers: Number(val("workers", 3)), label: "G-A8 旋鈕診斷", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}（不判定，交 Owner）`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const errSeeds = new Set(audit.errored.map((x) => x.seed));
  const S = SEEDS.filter((s) => !errSeeds.has(s));
  const recs = Object.fromEntries(ARMS.map((x) => [x.arm, readKey(DIR, x.arm)]));
  const R = (arm, s) => recs[arm].get(`${arm}#${s}`);
  const W = (arm) => new Map(S.map((s) => [s, R(arm, s).win]));
  // 複製性：FULL／STD 400/400＝G-A8
  const replication = ARMS.filter((x) => x.arm === "STD" || x.arm.startsWith("FULL_")).map((x) => { const d = S.filter((s) => { const r = R(x.arm, s), g = ga8Rec(x.arm, s); return !g || r.win !== g.win || r.duration !== g.duration; }); return { arm: x.arm, n: S.length, different: d.length, seeds: d.slice(0, 10) }; });
  const replicationOk = replication.every((x) => x.different === 0);
  const mech = (arm) => { const rs = S.map((s) => R(arm, s)), ms = (f) => meanSd(rs.map(f).filter((v) => v != null)).mean; return { killDiff: ms((r) => r.killsFor - r.killsAgainst), gold600: ms((r) => r.gold600), gold1200: ms((r) => r.gold1200), towersTaken: ms((r) => r.towersTaken), towersLost: ms((r) => r.towersLost), durationMin: ms((r) => r.duration) / 60 }; };
  const arms = ARMS.map((x) => ({ arm: x.arm, aggression: x.config.macro.aggression, riskTolerance: x.config.macro.riskTolerance, playerReachable: x.playerReachable, ...rateCI(S.map((s) => R(x.arm, s).win)), mechanism: mech(x.arm) }));
  const A = Object.fromEntries(arms.map((x) => [x.arm, x]));
  const per = (f) => pairedStats(S.map(f));
  const diff = (a, b, f = (r) => r.win) => per((s) => f(R(a, s)) - f(R(b, s)));
  const goldDiff = (a, b, k) => pairedStats(S.filter((s) => R(a, s)[k] != null && R(b, s)[k] != null).map((s) => R(a, s)[k] - R(b, s)[k])).mean;
  const mechDiff = (a, b) => ({ killDiff: diff(a, b, (r) => r.killsFor - r.killsAgainst).mean, gold600: goldDiff(a, b, "gold600"), gold1200: goldDiff(a, b, "gold1200"), towersTaken: diff(a, b, (r) => r.towersTaken).mean, towersLost: diff(a, b, (r) => r.towersLost).mean, durationMin: diff(a, b, (r) => r.duration).mean / 60 });
  const w = (arm, s) => R(arm, s).win;
  const BONF_Z = 2.73;
  const templates = Object.entries(FOCAL).map(([tpl, [a, r]]) => {
    const F = `FULL_${tpl}`, N = `NEUTRAL_${tpl}`, G = `AGGNEUTRAL_${tpl}`, Q = `RISKNEUTRAL_${tpl}`, SK = pairKey(a, r);
    const kind = KIND[tpl], dir = kind === "strong" ? 1 : -1;
    const K = diff(F, N), C = diff(N, "STD"), Kstd = diff(SK, "STD");
    const Kbonf = pairedStats(S.map((s) => w(F, s) - w(N, s)), BONF_Z);
    const I = per((s) => (w(F, s) - w(N, s)) - (w(SK, s) - w("STD", s)));
    const both = !!(ARM[G] && ARM[Q]);
    const KaggA = both ? diff(F, G) : null, KriskA = both ? diff(G, N) : null, KriskB = both ? diff(F, Q) : null, KaggB = both ? diff(Q, N) : null;
    const Kagg = both ? per((s) => ((w(F, s) - w(G, s)) + (w(Q, s) - w(N, s))) / 2) : null;
    const Krisk = both ? per((s) => ((w(F, s) - w(Q, s)) + (w(G, s) - w(N, s))) / 2) : null;
    const Iknob = both ? per((s) => w(F, s) - w(G, s) - w(Q, s) + w(N, s)) : null;
    const attribution = knobAttribution(dir, Kagg ?? K, Krisk);
    const orderDependent = both && knobAttribution(dir, KaggA, KriskA) !== knobAttribution(dir, KaggB, KriskB);
    const cut = kind === "strong" ? 0.57 : 0.43;
    const borderline = A[N].lo <= cut && cut <= A[N].hi;
    const label = templateLabel(kind, A[F].rate, A[N].rate, K);
    const exDir = (s) => (dir > 0 ? s.lo > 0 : s.hi < 0);
    //  interpretationMap（登記；只是描述，不授權任何修正）
    const reachableStdHit = ["SCAN_A_0.25", "SCAN_A_0.85"].some((x) => A[x].playerReachable && (A[x].label === "STOP" || A[x].label === (dir > 0 ? "WARN strong" : "WARN weak")));
    const hints = [];
    if (label === "CONTENT_DRIVEN") hints.push("CONTENT: neither B nor C on the knobs is indicated; look at the template content (stances share the engage channel)");
    if ((label === "KNOB_DRIVEN" || label === "MIXED") && exDir(Kstd) && reachableStdHit) hints.push("FAVOURS_B: the knob value is strong on a neutral base and players reach it through the tactic book; C alone cannot remove it");
    if ((label === "KNOB_DRIVEN" || label === "MIXED") && !exDir(Kstd) && (I.lo > 0 || I.hi < 0)) hints.push("FAVOURS_C: the knob value is strong only with this template content");
    if (label === "MIXED") hints.push("C_ALONE_INSUFFICIENT");
    return { template: tpl, kind, aggression: a, riskTolerance: r, full: A[F].rate, neutral: A[N].rate, neutralCI: [A[N].lo, A[N].hi], aggNeutral: ARM[G] ? A[G].rate : null, riskNeutral: ARM[Q] ? A[Q].rate : null, stdKnobs: A[SK].rate, std: A.STD.rate,
      K, mdeK: 2.8 * K.se, Kbonferroni: { lo: Kbonf.lo, hi: Kbonf.hi, z: BONF_Z }, orderA: { Kagg: KaggA, Krisk: KriskA }, orderB: { Kagg: KaggB, Krisk: KriskB }, Kagg, Krisk, Iknob, C, Kstd, I,
      arithmeticSelfCheck: Math.abs(diff(F, "STD").mean - (K.mean + C.mean)) < 1e-9,
      label, borderline, attribution, flags: [...(orderDependent ? ["ORDER_DEPENDENT"] : []), ...oppositeFlags(dir, Kagg ?? K, Krisk)], interpretationHints: hints,
      mechanismK: mechDiff(F, N), mechanismKstd: mechDiff(SK, "STD") };
  });
  const scanPts = (knob) => (knob === "aggression"
    ? [["SCAN_A_0.2", 0.2], ["SCAN_A_0.25", 0.25], ["SCAN_A_0.35", 0.35], [pairKey(0.45, 0.5), 0.45], ["STD", 0.5], [pairKey(0.6, 0.5), 0.6], ["SCAN_A_0.65", 0.65], ["SCAN_A_0.8", 0.8], ["SCAN_A_0.85", 0.85]]
    : [["SCAN_R_0.2", 0.2], ["SCAN_R_0.35", 0.35], ["STD", 0.5], ["SCAN_R_0.65", 0.65], ["SCAN_R_0.8", 0.8]]);
  const scans = Object.fromEntries(["aggression", "riskTolerance"].map((knob) => {
    const pts = scanPts(knob);
    const slope = pairedStats(seedSlopes(pts.map(([arm, x]) => ({ x, wins: W(arm) })), S));
    const curve = pts.map(([arm, x]) => ({ x, arm, rate: A[arm].rate, lo: A[arm].lo, hi: A[arm].hi, label: A[arm].label, playerReachable: A[arm].playerReachable, mechanism: A[arm].mechanism }));
    const monotone = curve.every((p, i) => i === 0 || p.rate - curve[i - 1].rate >= -0.02);
    return [knob, { slopePer01: slope, curve, monotone, flaggedPoints: curve.filter((p) => p.label).map((p) => ({ x: p.x, label: p.label, playerReachable: p.playerReachable })) }];
  }));
  const joint = per((s) => (w(pairKey(0.8, 0.8), s) - w("STD", s)) - ((w("SCAN_A_0.8", s) - w("STD", s)) + (w("SCAN_R_0.8", s) - w("STD", s))));
  const er = errorRule(audit.errored.length, tasks.length);
  const outcome = audit.instrument.length || !replicationOk || er === "STOP" ? "INSTRUMENT" : er === "INCONCLUSIVE" ? "INCONCLUSIVE" : "DIAGNOSED";
  const out = { schema: "esmo.ga8-knob-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    ga8Verdict: "STOP (unchanged; diagnostic only, never a PASS; plans B and C not authorised; this study authorises nothing)",
    seedNote: "every per-arm label is computed on the reused G-A8 seeds; it is not a G-A8 re-run and cannot release anything; any fix must be re-checked by G-A8 on fresh seeds with the original thresholds",
    statsNote: "all intervals are unadjusted 95% (normal approximation on paired differences); descriptive, no family-wise error control; Kbonferroni is a reference for the 8 label contrasts",
    contentCaveat: REG.contentCaveat, playerReachableValues: REACH,
    matches: tasks.length, errored: audit.errored, instrument: audit.instrument.slice(0, 20), replication, outcome,
    templates, scans, jointHighHigh: joint, arms };
  const OUT = path.join(ROOT, "tools/fixtures/ga8_knob_result_3aB.json");
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  const pp = (x) => (x == null ? "  —  " : `${(x * 100).toFixed(1)}`), ci = (s) => (s ? `${pp(s.mean)}（${pp(s.lo)}..${pp(s.hi)}）` : "—");
  console.log(`複製性：${replication.map((x) => `${x.arm} ${x.n - x.different}/${x.n}`).join("、")}`);
  for (const t of templates) console.log(`${t.template.padEnd(24)} 全 ${pp(t.full)} 中性 ${pp(t.neutral)} 侵略回中 ${pp(t.aggNeutral)} 風險回中 ${pp(t.riskNeutral)} std＋旋鈕 ${pp(t.stdKnobs)}｜K ${ci(t.K)} MDE ${pp(t.mdeK)} Kagg ${ci(t.Kagg)} Krisk ${ci(t.Krisk)} Iknob ${ci(t.Iknob)} C ${ci(t.C)} Kstd ${ci(t.Kstd)} I ${ci(t.I)}｜${t.label}${t.borderline ? "(borderline)" : ""}／${t.attribution} ${t.flags.join(",")} ${t.interpretationHints.map((h) => h.split(":")[0]).join(",")}`);
  for (const [k, s] of Object.entries(scans)) console.log(`掃描 ${k}：斜率每 +0.1 ${ci(s.slopePer01)}；${s.curve.map((p) => `${p.x}${p.playerReachable ? "*" : ""}:${pp(p.rate)}`).join(" ")}；單調 ${s.monotone}；標記點 ${s.flaggedPoints.map((p) => `${p.x}${p.playerReachable ? "*" : ""} ${p.label}`).join(",") || "無"}`);
  console.log(`0.8/0.8 聯合交互 ${ci(joint)}（* ＝玩家選得到）`);
  console.log(`結果：${outcome}（G-A8 維持 STOP）`);
  process.exit(outcome === "INSTRUMENT" ? 5 : 0);
}
console.error("用法見檔頭"); process.exit(2);
