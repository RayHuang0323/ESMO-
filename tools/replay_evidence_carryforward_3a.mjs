// ============================================================================
//  tools/replay_evidence_carryforward_3a.mjs — Phase 3a-B P0-1：歷史複驗證據的延續重播（只讀，不改任何結果檔）
//
//  為什麼要有這支：六份 n=400 複驗證據（3a-A 追加複驗＋快速模式、C3-2rev1、C3-3、C4、C5R、C6）都是在舊的程式／指紋下量的，
//  之後每次重新登記 moba-sim.v21 指紋，simulationVersion.js 的註解都寫「既有輸入行為不變」，但沒有任何一份被機械驗證過
//  （3a-B 開工清單 §1）。這支用**現在的程式**把每一臂抽樣重跑，與 repo 外原始逐場紀錄（jsonl）**逐值**比對：
//  逐場完全相同 ⇒ 該臂的證據延續到現在的指紋；任何一場不同 ⇒ 證據失效，STOP 交 Owner（不得宣稱原驗收仍有效）。
//
//  用法（長任務一律單線；workers ≤ 3；重播紀錄寫在 repo 之外；建立 <dir>/STOP 檔即在下一場前停下，同一指令續跑）：
//    node tools/replay_evidence_carryforward_3a.mjs --plan [--raw=<原始紀錄根目錄>]
//    node tools/replay_evidence_carryforward_3a.mjs --run --dir=<repo 外的資料夾> [--workers=3] [--raw=...]
//        結束碼：0 完成且全部相同／3 依 STOP 暫停／5 有不同（STOP 交 Owner）／6 未完整（同一指令續跑）
//    node tools/replay_evidence_carryforward_3a.mjs --report --dir=<同一資料夾>   完整才寫 tools/fixtures/evidence_carryforward_3a.json
//    node tools/replay_evidence_carryforward_3a.mjs --selftest
//
//  ── 抽樣（事前寫死，執行前就決定，與重播結果無關）────────────────────────────────────
//   每一臂 20 個 seeds：先挑「原始紀錄裡該臂與對照組在宣稱指標上不同（A≠B）」的 seeds 10 個——|差|最大的 3 個＋其餘 A≠B seeds 中
//   等距取 7 個（不足 10 個就全取）；再從剩下的 seeds 等距補滿 20。罕見路徑（例：C5R 後期強邊，n=40 的 23 組配對全部 A＝B）
//   只有這樣才測得到真正走到新分支的場次。對照組：等距 20 個。
//   宣稱指標＝結果檔實際使用的指標（用了後備指標就取後備）。快速模式的指標由紀錄裡引擎自己的 exec 計數算出（同原工具）。
//
//  ── 比對 ──────────────────────────────────────────────────────────────────
//   原始紀錄的每一個欄位都必須出現在重播紀錄裡、而且值完全相同（JSON 來回後逐位元比）。重播紀錄可以多出欄位：
//   儀器後來的版本只**新增**欄位（tacticTruthSim v4–v6、phaseStudySim v2 的檔頭都寫明既有計數的算法沒動）。
//   另外核對「原始紀錄＝結果檔的來源」：用原始紀錄重算每一臂宣稱指標的配對平均，必須等於結果檔裡的 meanA／meanB。
//
//  儀器與原工具相同：3a-A＝tacticTruthSim.runTruthMatch（items standard、不指定規則集＝balanceTool.v20，同 measure_tactic_followup_3a）；
//  C3-2rev1＝phaseBucketSim.runPhaseMatch（balanceTool.v21，同 measure_phase_stance_c3）；C3-3／C4／C5R／C6＝phaseStudySim.runPhaseStudyMatch
//  （balanceTool.v21，指標清單由登記檔推出，同 measure_phase_options_3c）。三者都是 skills on、talents off。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fork, execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const insideRepo = (p) => { const a = path.resolve(p).toLowerCase(), r = ROOT.toLowerCase(); return a === r || a.startsWith(r + path.sep); };
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const nest = (dim, v) => { const o = {}; dim.split(".").reduce((n, k, i, a) => (n[k] = i === a.length - 1 ? v : {}, n[k]), o); return o; };
const r6 = (v) => (v === null || v === undefined ? null : Number(Number(v).toFixed(6)));
const RAW_ROOT = val("raw", "C:/Users/ifikn/esmo-measure");
const RESULT_FIXTURE = "tools/fixtures/evidence_carryforward_3a.json";
const PER_ARM = 20, DIFF_PICK = 10, DIFF_TOP = 3, CTRL_PICK = 20;
const SCHEMA = "esmo.evidence-carryforward.v1";

// ── 純函式（selftest 會測）──────────────────────────────────────────────────
/** 從 sorted 陣列等距取 k 個（含頭尾；k ≥ 長度 ⇒ 全取）。 */
export function evenly(sorted, k) {
  if (k <= 0) return [];
  if (sorted.length <= k) return [...sorted];
  if (k === 1) return [sorted[0]];
  const out = [];
  for (let i = 0; i < k; i++) out.push(sorted[Math.round((i * (sorted.length - 1)) / (k - 1))]);
  return [...new Set(out)];
}
/**
 * 抽樣：diffs＝[{seed, d}]（d＝|臂−對照|，A≠B 的 seed 才在裡面）、all＝該臂所有 seeds（升冪）。
 * 回傳升冪的 seeds（A≠B 優先、再等距補滿）。
 */
export function pickSeeds(all, diffs, perArm = PER_ARM, diffPick = DIFF_PICK, diffTop = DIFF_TOP) {
  const byD = [...diffs].sort((a, b) => b.d - a.d || a.seed - b.seed);
  const top = byD.slice(0, diffTop).map((x) => x.seed);
  const restD = diffs.map((x) => x.seed).filter((s) => !top.includes(s)).sort((a, b) => a - b);
  const chosen = new Set([...top, ...evenly(restD, Math.max(0, diffPick - top.length))]);
  const rest = all.filter((s) => !chosen.has(s));
  for (const s of evenly(rest, perArm - chosen.size)) chosen.add(s);
  //  等距去重後可能少一兩個：依序補。
  for (const s of rest) { if (chosen.size >= perArm) break; chosen.add(s); }
  return [...chosen].sort((a, b) => a - b);
}
/** 原始紀錄的每個欄位都要在重播紀錄裡且值相同；回傳不同之處（最多 limit 筆）。 */
export function subsetDiffs(oldRec, newRec, limit = 8) {
  const out = [];
  const walk = (a, b, p) => {
    if (out.length >= limit) return;
    if (a !== null && typeof a === "object") {
      if (b === null || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) { out.push(`${p}: shape`); return; }
      if (Array.isArray(a) && a.length !== b.length) { out.push(`${p}: length ${a.length}≠${b.length}`); return; }
      for (const k of Object.keys(a)) walk(a[k], b[k], p ? `${p}.${k}` : k);
    } else if (!Object.is(a, b)) out.push(`${p}: ${JSON.stringify(a)}≠${JSON.stringify(b)}`);
  };
  walk(oldRec, JSON.parse(JSON.stringify(newRec)), "");
  return out;
}
/** 快速模式的指標（同 measure_tactic_followup_3a.quickMetric：由紀錄裡引擎自己的 exec 計數算出）。 */
function quickMetric(rec, side, id) {
  const [name, param] = id.split("."), e = rec[side].exec;
  if (name === "contestsPerMin") return rec.duration >= 60 ? e[`${param}Contests`] / (rec.duration / 60) : null;
  if (name === "gankShare") { const tot = e.topGanks + e.midGanks + e.botGanks; return tot > 0 ? e[`${param}Ganks`] / tot : null; }
  throw new Error(`unknown quickmode metric ${id}`);
}
const finite = (v) => typeof v === "number" && Number.isFinite(v);

// ── 研究定義 ────────────────────────────────────────────────────────────────
//  每一臂：{ key（原始紀錄檔名，不含 .jsonl）、side（處理方；對照組 null）、metric、spec（worker 用）、link（結果檔裡的配對平均，用來核對原始紀錄＝來源）}
async function studies() {
  const T = await imp("tools/lib/tacticTruthSim.mjs");
  const PB = await imp("tools/lib/phaseBucketSim.mjs");
  const out = [];
  {
    //  3a-A：追加複驗 12 列＋快速模式 7 列，共用同一個對照組（rep|control）。
    const rep = readJson("tools/fixtures/tactic_followup_3a_replication.json"), qm = readJson("tools/fixtures/tactic_followup_3a_quickmode.json");
    const fileKey = (k) => k.replace(/[^A-Za-z0-9._-]+/g, "_");
    const arms = [{ key: "rep_control", side: null, spec: { kind: "truth", blue: null, red: null } }];
    for (const [fx, pre, metricFn] of [[rep, "rep", (m) => (rec, s) => T.metricValue(rec, s, m)], [qm, "qm", (m) => (rec, s) => quickMetric(rec, s, m)]]) {
      for (const row of fx.rows) for (const side of ["blue", "red"]) {
        const arm = { templateId: "std", choices: nest(row.dimension, row.choice) };
        arms.push({ key: fileKey(`${pre}|${side}|${row.dimension}|${row.choice}`), side, label: `${pre}:${row.dimension}=${row.choice}`, metric: row.metric, valueOf: metricFn(row.metric),
          spec: { kind: "truth", blue: side === "blue" ? arm : null, red: side === "red" ? arm : null }, link: { meanA: row[side].meanA, meanB: row[side].meanB, n: row[side].n, round: r6 } });
      }
    }
    out.push({ id: "3a-A", raw: "followup-3a-v3/rep", resultFixtures: ["tools/fixtures/tactic_followup_3a_replication.json", "tools/fixtures/tactic_followup_3a_quickmode.json"], arms });
  }
  {
    const fx = readJson("tools/fixtures/phase_stance_result_c3_2_rev1.json");
    const arms = [{ key: "ctrl", side: null, spec: { kind: "stance", dim: null, choice: null, armSide: null } }];
    for (const row of fx.rows) for (const side of ["blue", "red"]) {
      const cell = row.cells[side][0];
      arms.push({ key: `${side}_${row.dimension.replace(/\./g, "_")}_${row.choice}`, side, label: `${row.dimension}=${row.choice}`, metric: cell.metric, valueOf: (rec, s) => PB.phaseMetricValue(rec, s, cell.metric),
        spec: { kind: "stance", dim: row.dimension, choice: row.choice, armSide: side }, link: { meanA: cell.meanA, meanB: cell.meanB, n: cell.n } });
    }
    out.push({ id: "C3-2rev1", raw: "phase-stance-c3-2-rev1", resultFixtures: ["tools/fixtures/phase_stance_result_c3_2_rev1.json"], arms });
  }
  for (const [id, sfx] of [["C3-3", "c3_3"], ["C4", "c4"], ["C5R", "c5r"], ["C6", "c6"]]) {
    const regRel = `tools/fixtures/phase_options_registration_${sfx}.json`, resRel = `tools/fixtures/phase_options_result_${sfx}.json`;
    const reg = readJson(regRel), res = readJson(resRel);
    const arms = [{ key: "ctrl", side: null, spec: { kind: "options", reg: regRel, option: null, side: null } }];
    for (const o of reg.options) for (const side of ["blue", "red"]) {
      const row = res.rows.find((r) => r.id === o.id), claim = row.claims[0];
      arms.push({ key: `${o.id}_${side}`, side, label: `${o.dimension}=${o.choice}`, metric: claim.metric, valueOf: (rec, s) => rec.vals[s][claim.metric],
        spec: { kind: "options", reg: regRel, option: o.id, side }, link: { meanA: claim[side].meanA, meanB: claim[side].meanB, n: claim[side].n } });
    }
    out.push({ id, raw: `phase-options-${sfx}`, resultFixtures: [resRel], registration: regRel, arms });
  }
  return out;
}

const readRaw = (file) => {
  const m = new Map();
  if (!fs.existsSync(file)) return m;
  for (const l of fs.readFileSync(file, "utf8").split("\n")) { if (!l.trim()) continue; try { const o = JSON.parse(l); if (o.rec) m.set(o.seed, o.rec); } catch { /* 半行 */ } }
  return m;
};

/** 研究 → 計畫（每一臂的 seeds）＋原始紀錄＝結果檔來源的核對。全部只讀原始紀錄，不跑對局。 */
async function buildPlan() {
  const S = await studies();
  const plan = [], problems = [];
  for (const st of S) {
    const dir = path.join(RAW_ROOT, st.raw);
    const ctrl = readRaw(path.join(dir, `${st.arms[0].key}.jsonl`));
    if (!ctrl.size) { problems.push(`${st.id}: 找不到原始對照組 ${dir}`); continue; }
    const stPlan = { id: st.id, raw: st.raw, resultFixtures: st.resultFixtures, arms: [], linkProblems: [] };
    for (const arm of st.arms) {
      const recs = arm.side ? readRaw(path.join(dir, `${arm.key}.jsonl`)) : ctrl;
      if (!recs.size) { problems.push(`${st.id}: 找不到原始紀錄 ${arm.key}`); continue; }
      const all = [...recs.keys()].sort((a, b) => a - b);
      let seeds, nDiff = null;
      if (!arm.side) seeds = evenly(all, CTRL_PICK);
      else {
        const diffs = [], pairs = [];
        for (const s of all) {
          const c = ctrl.get(s); if (!c) continue;
          const a = arm.valueOf(c, arm.side), b = arm.valueOf(recs.get(s), arm.side);
          if (finite(a) && finite(b)) { pairs.push([a, b]); if (a !== b) diffs.push({ seed: s, d: Math.abs(b - a) }); }
        }
        nDiff = diffs.length;
        seeds = pickSeeds(all, diffs);
        //  原始紀錄＝結果檔來源：配對平均要等於結果檔（3a-A 的結果檔四捨五入到 6 位）。
        const mA = pairs.reduce((x, p) => x + p[0], 0) / pairs.length, mB = pairs.reduce((x, p) => x + p[1], 0) / pairs.length;
        const rd = arm.link.round ?? ((v) => v);
        const same = (x, y) => (arm.link.round ? rd(x) === y : Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y)));
        if (pairs.length !== arm.link.n || !same(mA, arm.link.meanA) || !same(mB, arm.link.meanB))
          stPlan.linkProblems.push(`${arm.key}: n ${pairs.length}/${arm.link.n} meanA ${mA}/${arm.link.meanA} meanB ${mB}/${arm.link.meanB}`);
      }
      stPlan.arms.push({ key: arm.key, side: arm.side, label: arm.label ?? "control", metric: arm.metric ?? null, rawSeeds: all.length, rawDiffering: nDiff,
        seeds, seedsDiffering: arm.side ? seeds.filter((s) => { const c = ctrl.get(s), r = recs.get(s); const a = arm.valueOf(c, arm.side), b = arm.valueOf(r, arm.side); return finite(a) && finite(b) && a !== b; }).length : null,
        spec: arm.spec });
    }
    plan.push(stPlan);
  }
  return { plan, problems };
}

// ── worker ──────────────────────────────────────────────────────────────────
if (flag("cf-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const T = await imp("tools/lib/tacticTruthSim.mjs");
  const PB = await imp("tools/lib/phaseBucketSim.mjs");
  const PS = await imp("tools/lib/phaseStudySim.mjs");
  const Mapping = await imp("src/platform/tactics/tacticChoiceMapping.js");
  const regCache = new Map();
  const regOf = (rel) => { if (!regCache.has(rel)) regCache.set(rel, readJson(rel)); return regCache.get(rel); };
  //  同 measure_phase_options_3c 的 worker：指標清單由登記檔推出（宣稱、後備、守門、報告、區分性、交互作用、衝突、上限、對照對稱）。
  const metricIdsOf = (REG) => [...new Set(REG.options.flatMap((o) => [...o.claims, ...(o.guards ?? [])].flatMap((c) => [c.metric, c.fallbackMetric].filter(Boolean))).concat(REG.reportedMetrics ?? [], REG.controlSymmetry?.metrics ?? [],
    (REG.contrasts ?? []).map((x) => x.metric), (REG.interactions ?? []).map((x) => x.metric), (REG.conflicts ?? []).map((x) => x.metric),
    (REG.ceilings ?? []).map((x) => x.metric), REG.controlSymmetry?.relative?.metrics ?? []))];
  const expansionProblems = (REG, o) => {
    const want = REG.winConditionExpected?.[o?.id];
    if (!want) return [];
    const got = Mapping.leavesOf(Mapping.effectiveTacticChoices("std", [], o.input?.choices ?? {}));
    return JSON.stringify(got) === JSON.stringify(want) ? [] : [`winCondition expansion ${JSON.stringify(got)} ≠ registered ${JSON.stringify(want)}`];
  };
  async function run(seed, spec) {
    if (spec.kind === "truth") return T.runTruthMatch(seed, { blue: spec.blue, red: spec.red, items: "standard" });
    if (spec.kind === "stance") {
      const ctrlArm = await PB.phaseStanceArm(null, null);
      const arm = spec.dim ? await PB.phaseStanceArm(spec.dim, spec.choice) : ctrlArm;
      const sides = spec.armSide === "red" ? { red: arm, blue: ctrlArm } : spec.armSide === "blue" ? { blue: arm, red: ctrlArm } : { blue: ctrlArm, red: ctrlArm };
      const r = await PB.runPhaseMatch(seed, { ...sides, ruleset: "balanceTool.v21" });
      const slim = (s) => ({ engages: s.engages, engageStarts: s.engageStarts });
      return { seed: r.seed, ruleset: r.ruleset, directorMode: r.directorMode, layers: r.layers, duration: r.duration, winner: r.winner, phaseSecs: r.phaseSecs, blue: slim(r.blue), red: slim(r.red), selfCheck: PB.selfCheck(r) };
    }
    const REG = regOf(spec.reg), metricIds = metricIdsOf(REG);
    const ctrl = await PS.studyInput();
    const o = spec.option ? REG.options.find((x) => x.id === spec.option) : null;
    const arm = o ? await PS.studyInput(o.input?.choices ?? {}, o.input?.phaseChoices ?? null) : ctrl;
    const r = await PS.runPhaseStudyMatch(seed, { blue: spec.side === "blue" ? arm : ctrl, red: spec.side === "red" ? arm : ctrl, ruleset: "balanceTool.v21" });
    const vals = Object.fromEntries(["blue", "red"].map((s) => [s, Object.fromEntries(metricIds.map((id) => [id, PS.studyMetricValue(r, s, id)]))]));
    return { seed: r.seed, ruleset: r.ruleset, directorMode: r.directorMode, laneFrame: r.laneFrame, layers: r.layers, duration: r.duration, winner: r.winner, selfCheck: [...PS.selfCheck(r), ...expansionProblems(REG, o)], vals };
  }
  process.on("message", async (t) => {
    try { process.send({ type: "done", id: t.id, rec: await run(t.seed, t.spec) }); } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── selftest ────────────────────────────────────────────────────────────────
if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
  const all = Array.from({ length: 400 }, (_, i) => 1001 + i);
  ck("S1 等距取樣含頭尾、不重複、數量正確", JSON.stringify(evenly(all, 3)) === "[1001,1201,1400]" && evenly(all, 20).length === 20 && new Set(evenly(all, 20)).size === 20);
  const rare = [{ seed: 1010, d: 0.1 }, { seed: 1200, d: 0.5 }, { seed: 1399, d: 0.2 }];
  const p = pickSeeds(all, rare);
  ck("S2 罕見路徑：A≠B 的 seeds 不足 10 個時全部入選，總數 20、升冪", rare.every((x) => p.includes(x.seed)) && p.length === 20 && p.every((s, i) => i === 0 || s > p[i - 1]), JSON.stringify(p));
  const many = all.map((s) => ({ seed: s, d: s === 1234 ? 9 : s === 1300 ? 8 : s === 1111 ? 7 : 0.01 }));
  const q = pickSeeds(all, many);
  ck("S3 A≠B 很多時：|差|最大的 3 個必選、總數 20", [1234, 1300, 1111].every((s) => q.includes(s)) && q.length === 20);
  ck("S4 抽樣是決定性的（同輸入兩次相同）", JSON.stringify(pickSeeds(all, rare)) === JSON.stringify(p));
  ck("S5 比對：完全相同 ⇒ 無差異；重播多出欄位 ⇒ 仍無差異", subsetDiffs({ a: 1, b: [1, 2], c: { d: 0.1 } }, { a: 1, b: [1, 2], c: { d: 0.1, e: 5 }, z: 1 }).length === 0);
  ck("S6 比對：值不同、缺欄位、陣列長度不同、null 變 0 ⇒ 都抓得到", subsetDiffs({ a: 1 }, { a: 1.0000001 }).length === 1 && subsetDiffs({ a: 1 }, {}).length === 1
    && subsetDiffs({ b: [1, 2] }, { b: [1] }).length === 1 && subsetDiffs({ c: null }, { c: 0 }).length === 1);
  ck("S7 比對：重播的 -0 經 JSON 來回後等於原始紀錄的 0（原始紀錄寫檔時同樣經過 JSON）", subsetDiffs({ a: 0 }, { a: -0 }).length === 0);
  const { plan, problems } = await buildPlan();
  ck("S8 六份研究的原始紀錄都找得到", problems.length === 0 && plan.length === 6, problems.slice(0, 3).join("；"));
  ck("S9 原始紀錄＝結果檔的來源（每一臂宣稱指標的配對平均＝結果檔的 meanA／meanB）", plan.every((s) => s.linkProblems.length === 0), plan.flatMap((s) => s.linkProblems.map((x) => `${s.id} ${x}`)).slice(0, 3).join("；"));
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── main ────────────────────────────────────────────────────────────────────
const SV = await imp("src/platform/contracts/simulationVersion.js");
const gitHead = () => { try { return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { return "unknown"; } };
const gitDirty = () => { try { return execSync("git status --porcelain -- src tools", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length; } catch { return null; } };
const provenance = () => ({ gitHead: gitHead(), dirtyFilesUnderSrcTools: gitDirty(), simulationVersion: SV.MOBA_SIMULATION_VERSION, fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] });
const outFile = (dir, study, key) => path.join(dir, study, `${key}.jsonl`);

const { plan, problems } = await buildPlan();
if (problems.length) { console.error(`原始紀錄不完整：${problems.join("；")}`); process.exit(2); }
const linkBad = plan.flatMap((s) => s.linkProblems.map((x) => `${s.id} ${x}`));
if (linkBad.length) { console.error(`⛔ 原始紀錄與結果檔對不上（不是那份證據的來源）：${linkBad.slice(0, 5).join("；")}`); process.exit(5); }
const tasksAll = plan.flatMap((s) => s.arms.flatMap((a) => a.seeds.map((seed) => ({ id: `${s.id}/${a.key}#${seed}`, study: s.id, key: a.key, seed, spec: a.spec }))));

if (flag("plan")) {
  for (const s of plan) console.log(`${s.id.padEnd(9)} ${s.arms.length} 臂（含對照）× ≤${PER_ARM} seeds；A≠B 最少的臂：${s.arms.filter((a) => a.side).sort((a, b) => a.rawDiffering - b.rawDiffering).slice(0, 2).map((a) => `${a.key} ${a.rawDiffering}/${a.rawSeeds}（抽中 ${a.seedsDiffering}）`).join("、")}`);
  console.log(`共 ${tasksAll.length} 場`);
  process.exit(0);
}

const DIR = val("dir");
if (!DIR) { console.error("需要 --dir=<repo 外的資料夾>"); process.exit(2); }
if (insideRepo(DIR)) { console.error("--dir 必須在 repo 之外"); process.exit(2); }
const readOut = (study, key) => { const m = new Map(), f = outFile(DIR, study, key); if (!fs.existsSync(f)) return m; for (const l of fs.readFileSync(f, "utf8").split("\n")) { if (!l.trim()) continue; try { const o = JSON.parse(l); m.set(o.seed, o); } catch { /* 半行 */ } } return m; };

function compareAll() {
  const res = [];
  for (const s of plan) {
    const dir = path.join(RAW_ROOT, s.raw);
    for (const a of s.arms) {
      const raw = readRaw(path.join(dir, `${a.key}.jsonl`)), got = readOut(s.id, a.key);
      for (const seed of a.seeds) {
        const o = got.get(seed);
        res.push({ study: s.id, key: a.key, seed, done: !!o, diffs: o ? subsetDiffs(raw.get(seed), o.rec) : null });
      }
    }
  }
  return res;
}

if (flag("run")) {
  const prov = provenance();
  if (prov.dirtyFilesUnderSrcTools !== 0) { console.error(`src／tools 有 ${prov.dirtyFilesUnderSrcTools} 個未提交變更：必須在已 commit 的程式上跑。`); process.exit(2); }
  fs.mkdirSync(DIR, { recursive: true });
  const metaF = path.join(DIR, "meta.json");
  if (fs.existsSync(metaF)) {
    const m = JSON.parse(fs.readFileSync(metaF, "utf8"));
    if (m.fingerprint !== prov.fingerprint || m.gitHead !== prov.gitHead) { console.error(`⚠ 這個資料夾在 ${m.gitHead}／${m.fingerprint} 下開始：不得混跑。`); process.exit(2); }
  } else fs.writeFileSync(metaF, JSON.stringify({ tool: "replay_evidence_carryforward_3a", startedAt: new Date().toISOString(), ...prov }, null, 2));
  const doneSet = new Set(compareAll().filter((r) => r.done).map((r) => `${r.study}/${r.key}#${r.seed}`));
  const tasks = tasksAll.filter((t) => !doneSet.has(t.id));
  const workers = Math.max(1, Math.min(3, Number(val("workers", 3))));
  console.log(`待跑 ${tasks.length}／${tasksAll.length} 場，workers=${workers}，資料夾 ${DIR}`);
  const t0 = Date.now();
  let next = 0, finished = 0, failed = 0, mismatched = 0, stopped = false, lost = 0;
  const bar = (x, n) => { const k = Math.round((x / n) * 20); return `[${"█".repeat(k)}${"░".repeat(20 - k)}]`; };
  const studyLeft = new Map(plan.map((s) => [s.id, tasks.filter((t) => t.study === s.id).length]));
  await new Promise((resolveAll) => {
    let alive = 0;
    const spawn = () => {
      const child = fork(SELF, ["--cf-worker", `--raw=${RAW_ROOT}`], { env: { ...process.env }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
      alive++;
      let busy = null;
      const feed = () => { busy = null; if (fs.existsSync(path.join(DIR, "STOP"))) stopped = true; if (stopped || next >= tasks.length) { child.kill(); return; } busy = tasks[next++]; child.send(busy); };
      child.on("message", (m) => {
        if (m.type === "ready") return feed();
        const t = busy;
        if (m.type === "done") {
          fs.mkdirSync(path.join(DIR, t.study), { recursive: true });
          fs.appendFileSync(outFile(DIR, t.study, t.key), `${JSON.stringify({ seed: t.seed, rec: m.rec })}\n`);
          const raw = readRaw(path.join(RAW_ROOT, plan.find((s) => s.id === t.study).raw, `${t.key}.jsonl`)).get(t.seed);
          const d = subsetDiffs(raw, m.rec);
          if (d.length) { mismatched++; console.error(`⛔ 不同 ${t.id}: ${d.slice(0, 3).join(" ｜ ")}`); }
          finished++;
          studyLeft.set(t.study, studyLeft.get(t.study) - 1);
          if (finished % 60 === 0 || finished === tasks.length || studyLeft.get(t.study) === 0) {
            const el = (Date.now() - t0) / 1000, per = el / finished, left = (tasks.length - finished) * per;
            console.log(`${bar(finished, tasks.length)} ${String(Math.round((finished / tasks.length) * 100)).padStart(3)}%  ${finished}/${tasks.length} 場  已 ${(el / 60).toFixed(1)} 分，預估剩 ${(left / 60).toFixed(1)} 分　不同 ${mismatched}${studyLeft.get(t.study) === 0 ? `　（${t.study} 完成）` : ""}`);
          }
        } else { failed++; console.error(`✗ ${t.id}: ${String(m.error).slice(0, 300)}`); }
        feed();
      });
      child.on("exit", () => { if (busy) { lost++; console.error(`⚠ worker 中途結束，遺失 ${busy.id}（續跑會補）`); busy = null; } alive--; if (alive === 0) resolveAll(); });
    };
    for (let i = 0; i < Math.min(workers, tasks.length); i++) spawn();
    if (!tasks.length) resolveAll();
  });
  const all = compareAll(), bad = all.filter((r) => r.done && r.diffs.length), pending = all.filter((r) => !r.done).length;
  console.log(`本輪 ${finished} 場、錯誤 ${failed}、遺失 ${lost}，${((Date.now() - t0) / 60000).toFixed(1)} 分；累計 ${all.length - pending}/${all.length} 場，不同 ${bad.length}`);
  if (bad.length) { console.error(`⛔ STOP：${bad.length} 場與原始紀錄不同 ⇒ 證據失效，交 Owner。${bad.slice(0, 5).map((r) => `${r.study}/${r.key}#${r.seed}: ${r.diffs[0]}`).join("；")}`); process.exit(5); }
  if (stopped) process.exit(3);
  process.exit(pending || failed ? 6 : 0);
}

if (flag("report")) {
  const all = compareAll(), pending = all.filter((r) => !r.done), bad = all.filter((r) => r.done && r.diffs.length);
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8")), prov = provenance();
  if (pending.length) { console.log(`未完整：還有 ${pending.length} 場，不寫結果檔`); process.exit(6); }
  if (meta.gitHead !== prov.gitHead || meta.fingerprint !== prov.fingerprint) { console.log(`資料夾在 ${meta.gitHead}／${meta.fingerprint} 下跑，現在是 ${prov.gitHead}／${prov.fingerprint}：不寫結果檔`); process.exit(2); }
  const out = {
    schema: SCHEMA, reportedAt: new Date().toISOString(), replayedUnder: meta, ...prov,
    rule: { perArm: PER_ARM, differingFirst: DIFF_PICK, differingTopByAbsDiff: DIFF_TOP, controlSeeds: CTRL_PICK, compare: "every field of the original record present and identical in the replay (JSON round trip); replay may add fields",
      rawRoot: RAW_ROOT, rawLink: "per arm, the paired means of the claimed metric recomputed from the raw records equal the result fixture's meanA/meanB (3a-A rounded to 6 places)" },
    studies: plan.map((s) => ({ id: s.id, raw: s.raw, resultFixtures: s.resultFixtures, rawLinkOk: s.linkProblems.length === 0,
      arms: s.arms.map((a) => ({ key: a.key, side: a.side, label: a.label, metric: a.metric, rawSeeds: a.rawSeeds, rawDiffering: a.rawDiffering, seeds: a.seeds, seedsDiffering: a.seedsDiffering,
        identical: all.filter((r) => r.study === s.id && r.key === a.key && r.diffs.length === 0).length })) })),
    totals: { matches: all.length, identical: all.length - bad.length, different: bad.length },
    different: bad.slice(0, 50).map((r) => ({ study: r.study, key: r.key, seed: r.seed, diffs: r.diffs })),
    verdict: bad.length ? "EVIDENCE_INVALIDATED" : "CARRIED_FORWARD",
  };
  fs.writeFileSync(path.join(ROOT, RESULT_FIXTURE), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`寫入 ${RESULT_FIXTURE}：${out.verdict}，${out.totals.identical}/${out.totals.matches} 場相同`);
  process.exit(bad.length ? 5 : 0);
}

console.error("用法見檔頭：--plan／--run／--report／--selftest");
process.exit(2);
