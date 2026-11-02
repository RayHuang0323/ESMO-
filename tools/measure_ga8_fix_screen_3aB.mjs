#!/usr/bin/env node
// ============================================================================
//  tools/measure_ga8_fix_screen_3aB.mjs — Phase 3a-B 修正規劃：G-A8 方案 C 候選篩選（登記 tools/fixtures/ga8_fix_screen_registration_3aB.json）
//
//  node tools/measure_ga8_fix_screen_3aB.mjs --plan
//  node tools/measure_ga8_fix_screen_3aB.mjs --validate --vdir=<repo 外新資料夾>     V1–V3
//  node tools/measure_ga8_fix_screen_3aB.mjs --run --dir=<repo 外新資料夾> --vdir=<同上> [--workers=3]   要 review.reviewedAt＋validation 通過
//  node tools/measure_ga8_fix_screen_3aB.mjs --report --dir=<同一個>        寫 tools/fixtures/ga8_fix_screen_result_3aB.json
//  node tools/measure_ga8_fix_screen_3aB.mjs --selftest
//  第六輪（Owner Review 2026-11-03）的登記多四個欄位，都只在登記有寫時才生效，舊登記行為不變：mechanism（紀錄機制數字）、identityLocks（V2c）、ga8Result（比較對象）、boundedOutcome（含 ownerDecisionArms、bonferroniZ、earlierReads）。
//  第二輪（Owner 2026-10-29）：上面每個指令加 --reg=tools/fixtures/ga8_fix_screen2_registration_3aB.json（臂數、模板種類、結果檔都由登記檔決定；不加 --reg＝第一輪，行為不變）
//
//  篩選用：src/ 不動、模板不改。候選設定只存在這支工具裡，走 legacy 輸入（旋鈕研究驗證過與 G-A8 的 binding 路徑逐場相同）。
//  G-A8 判定（STOP）不變；選出的候選只是給 Owner 的提案，必須在 Owner 核准、版本化修改模板之後，用保留的新 seeds 重跑 G-A8 確認。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, pairedStats, meanSd, insideRepo, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = val("reg", "tools/fixtures/ga8_fix_screen_registration_3aB.json");
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const RULESET = "balanceTool.v21";
const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-12;

function knobProbe(e, side, v2 = false) {
  const K = e.director.knobs(side), I = e.director.identity(side);
  //  第三輪（m7 內容篩選）：probe v3＝v2 再看節奏與入侵（引擎讀 K.gankInterval、K.invadeChance、K.invadeWithMid），否則只改 tempo／入侵的候選在探針上與 M7_D 相同。
  if (v2 === "v3") return { ...knobProbe(e, side, "v2"), gankInterval: K.gankInterval ?? null, invadeChance: K.invadeChance ?? null, invadeWithMid: K.invadeWithMid ?? null };
  //  第二輪審查 #2：probe v2 再看輔助遊走／護人與推塔傾向（引擎讀 I.roamK、I.protectHp、I.siegeBias）；第一輪紀錄沒有這三欄，不加。
  if (v2) return { ...knobProbe(e, side, false), roamK: I?.roamK ?? null, protectHp: I?.protectHp ?? null, siegeBias: I?.siegeBias ?? null };
  //  審查 #7：也看內容欄位會改到的旋鈕（打野抓人、時期接戰／參團、龍／巴龍參與），否則只改列舉欄位的候選在探針上看不出差別。
  return { retreatAt: K.retreatAt, laneOffsetValues: Object.values(K.laneOffset ?? {}).sort((a, b) => a - b), engageBias: I?.engageBias ?? 0, retreatFloorShift: I?.retreatFloorShift ?? 0, commitShift: I?.commitShift ?? 0,
    gankWeights: JSON.stringify(K.gankWeights ?? null), gankIntervalK: I?.gankIntervalK ?? null, phaseEngage: JSON.stringify(I?.phaseEngage ?? null), phaseJoin: JSON.stringify(I?.phaseJoin ?? null), dragonJoin: K.dragonJoin ?? null, baronJoin: K.baronJoin ?? null };
}

if (flag("screen-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const { tacticInputOf } = await imp("tools/lib/tacticTruthSim.mjs");
  const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
  const M = await modules();
  process.on("message", async (t) => {
    try {
      //  t.binding＝true（只用於 V1）：同一個模板走戰術書的 binding 路徑（沒有任何選擇）。
      const plan = t.binding ? tacticInputOf({ templateId: t.template, choices: {} }) : { kind: "legacy", config: structuredClone(t.config) };
      const std = tacticInputOf({ templateId: "std", choices: {} });
      const blueIsArm = t.seed % 2 === 1, side = blueIsArm ? "blue" : "red";
      const { e } = configure(t.seed, "standard", M, 1, null, { blue: blueIsArm ? plan : std, red: blueIsArm ? std : plan }, RULESET);
      const probe = knobProbe(e, side, t.probe === "v3" ? "v3" : t.probe === "v2");
      //  機制數字（登記 mechanism）：同 measure_ga8_knob_3aB，只讀引擎狀態、不消耗亂數，不改對局。
      const sgn = side === "blue" ? 1 : -1;
      let gold600 = null, gold1200 = null;
      for (let i = 1; i * 0.5 <= 3600 && !e.over; i++) {
        e.tick(0.5);
        if (t.mech) { if (gold600 === null && e.t >= 600) gold600 = sgn * (e.bGold - e.rGold); if (gold1200 === null && e.t >= 1200) gold1200 = sgn * (e.bGold - e.rGold); }
      }
      const mech = t.mech ? (() => { const foe = side === "blue" ? "red" : "blue", dead = (s) => Object.entries(e.towers).filter(([k, x]) => x.side === s && x.hp <= 0 && x.lane !== "nexus" && !k.includes("nexus")).length; return { killsFor: side === "blue" ? e.bK : e.rK, killsAgainst: side === "blue" ? e.rK : e.bK, gold600, gold1200, towersTaken: dead(foe), towersLost: dead(side) }; })() : null;
      const win = e.over && (e.winner === "blue" || e.winner === "red") ? (e.winner === side ? 1 : 0) : 0.5;
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, arm: t.arm, binding: !!t.binding, side, layout: objectiveLayoutForSeed(t.seed), ruleset: RULESET,
        layers: { heroSkills: !!M.skills, battleTalents: !!M.talents }, director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null, probe, win, duration: e.t, ...(mech ?? {}) } });
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
/** 登記的選擇規則：依列出的順序取第一個達標的候選；strong＝勝率 < 0.57，weak＝勝率 > 0.43。 */
//  審查 #1／#2：兩種方向都只認 0.43 < 勝率 < 0.57（不得矯枉過正到另一邊）；SELECTED 要落在 0.45–0.55（贏家詛咒的緩衝），否則 SELECTED_BORDERLINE。
//  kind 保留在簽名裡（呼叫端與登記一致），兩種方向用同一條帶。
export function selectCandidate(kind, candidates) {
  const inBand = (c) => c.rate > 0.43 && c.rate < 0.57, solid = (c) => c.rate >= 0.45 && c.rate <= 0.55;
  const firstSolid = candidates.find((c) => inBand(c) && solid(c));
  if (firstSolid) return { selected: firstSolid.arm, verdict: "SELECTED" };
  const pick = candidates.find(inBand);
  return pick ? { selected: pick.arm, verdict: "SELECTED_BORDERLINE" } : { selected: null, verdict: "NO_CANDIDATE" };
}
/** BASE 在篩選 seeds 上是否重現 G-A8 的旗標（strong：STOP 或 WARN strong；weak：WARN weak）。 */
export const reproduced = (kind, label) => (kind === "strong" ? label === "STOP" || label === "WARN strong" : label === "WARN weak");
/**
 * 第六輪登記的 boundedOutcome。每個模板一個狀態：
 *   REASONABLE               篩選出的候選對 BASE 上界 < 0，或第一個分得開的候選落在帶內
 *   REASONABLE_OWNER_DECISION 同上，但靠的是 ownerDecisionArms 裡的臂（玩法變動大）：要 Owner 明確決定，不算乾淨的通過
 *   IN_BAND_UNDISTINGUISHED  篩選出的候選在帶內，但與 BASE 分不開（統計力不足，不等於沒效果）
 *   NO_REASONABLE_CANDIDATE  其他（候選都還在帶外）
 */
export function boundedOutcomeOf(templates, stopTargets, ownerDecisionArms = [], bonferroniZ = Infinity) {
  const improves = (c) => !!c?.vsBase && c.vsBase.hi < 0, inBand = (c) => !!c && c.rate > 0.43 && c.rate < 0.57;
  const rows = templates.filter((t) => t.candidates.length).map((t) => {
    const screened = t.candidates.find((c) => c.arm === t.screenedCandidate) ?? null, first = t.candidates.find(improves) ?? null;
    const via = improves(screened) ? screened : inBand(first) ? first : null;
    const outcome = via ? (ownerDecisionArms.includes(via.arm) ? "REASONABLE_OWNER_DECISION" : "REASONABLE") : inBand(screened) ? "IN_BAND_UNDISTINGUISHED" : "NO_REASONABLE_CANDIDATE";
    return { template: t.template, baseRate: t.base.rate, screened: screened?.arm ?? null, screenedVerdict: t.screenedVerdict, screenedImproves: improves(screened), firstDistinguished: first?.arm ?? null, firstInBand: inBand(first), via: via?.arm ?? null, borderline: t.screenedVerdict === "SELECTED_BORDERLINE", outcome,
      candidates: t.candidates.map((c) => ({ arm: c.arm, rate: c.rate, vsBase: c.vsBase?.mean ?? null, lo: c.vsBase?.lo ?? null, hi: c.vsBase?.hi ?? null, z: c.vsBase?.z ?? null, bonferroni: Math.abs(c.vsBase?.z ?? 0) >= bonferroniZ, ownerDecision: ownerDecisionArms.includes(c.arm) })) };
  });
  const state = (t) => rows.find((r) => r.template === t)?.outcome;
  const lacking = stopTargets.filter((t) => !/^REASONABLE/.test(state(t) ?? ""));
  const ownerNeeded = stopTargets.filter((t) => state(t) === "REASONABLE_OWNER_DECISION");
  return { study: lacking.length ? "PRODUCT_DECISION_NEEDED" : ownerNeeded.length ? "CANDIDATES_WITH_OWNER_DECISION" : "CANDIDATES_FOR_ALL_STOPS", lacking, ownerNeeded, templates: rows };
}
/** 若真值是 p，n 場的 G-A8 判 STOP 的機率（常態近似；n=400 時勝率 ≥ 0.60 下界一定 > 0.55）。 */
export function stopChance(p, n = 400) { const se = Math.sqrt(Math.max(1e-9, p * (1 - p)) / n), z = (0.6 - p) / se; return 1 - 0.5 * (1 + erf(z / Math.SQRT2)); }
/** 把這個區段的 BASE 與先前各區段按 n 加權（描述性，不用於選擇）。 */
export function pooledReads(reads) { const n = reads.reduce((s, r) => s + r.n, 0), p = reads.reduce((s, r) => s + r.rate * r.n, 0) / n; return { pooled: p, n, blocks: reads.length, stopChanceN400: stopChance(p) }; }
/** 常態近似：若估計就是真值，n 場確認時落入 ≥0.57／≤0.43 的機率（第二輪審查 #7）。 */
export function confirmRisk(p, n = 400) {
  const se = Math.sqrt(Math.max(1e-9, p * (1 - p)) / n), Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  return { pStrong: 1 - Phi((0.57 - p) / se), pWeak: Phi((0.43 - p) / se) };
}
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
/** 只描述、不選擇的複驗（第二輪審查 #1）：≥0.57 ⇒ RISK_FOR_CONFIRMATORY；≤0.45 ⇒ OVERSHOOT；其餘 CONSISTENT。 */
export const replicationFlag = (rate) => (rate >= 0.57 ? "RISK_FOR_CONFIRMATORY" : rate <= 0.45 ? "OVERSHOOT" : "CONSISTENT");
const setPath = (o, p, v) => { const ks = p.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks.at(-1)] = v; };

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  ck("S1 rateCI 標籤＝G-A8 規則：0.62／n400 STOP、0.58 WARN strong、0.43 WARN weak、0.5 無", rateCI(Array.from({ length: 400 }, (_, i) => (i < 248 ? 1 : 0))).label === "STOP" && rateCI(Array.from({ length: 400 }, (_, i) => (i < 232 ? 1 : 0))).label === "WARN strong" && rateCI(Array.from({ length: 400 }, (_, i) => (i < 172 ? 1 : 0))).label === "WARN weak" && rateCI(Array.from({ length: 400 }, (_, i) => (i < 200 ? 1 : 0))).label === null);
  ck("S2 選擇：依序取第一個落在 0.45–0.55（A 0.58 不達標、B 0.55 ⇒ B SELECTED）", (() => { const r = selectCandidate("strong", [{ arm: "A", rate: 0.58 }, { arm: "B", rate: 0.55 }]); return r.selected === "B" && r.verdict === "SELECTED"; })());
  ck("S3 選擇：只有 0.56 ⇒ SELECTED_BORDERLINE；全 ≥ 0.57 ⇒ NO_CANDIDATE；後面的 0.50 優先於前面的 0.56", selectCandidate("strong", [{ arm: "A", rate: 0.56 }]).verdict === "SELECTED_BORDERLINE" && selectCandidate("strong", [{ arm: "A", rate: 0.6 }]).verdict === "NO_CANDIDATE" && selectCandidate("strong", [{ arm: "A", rate: 0.56 }, { arm: "B", rate: 0.5 }]).selected === "B");
  ck("S4 矯枉過正不算：strong 候選掉到 0.42、weak 候選升到 0.58 ⇒ NO_CANDIDATE；weak 0.44 ⇒ BORDERLINE", selectCandidate("strong", [{ arm: "A", rate: 0.42 }]).verdict === "NO_CANDIDATE" && selectCandidate("weak", [{ arm: "A", rate: 0.58 }]).verdict === "NO_CANDIDATE" && selectCandidate("weak", [{ arm: "A", rate: 0.44 }]).verdict === "SELECTED_BORDERLINE");
  ck("S5 重現：strong 認 STOP／WARN strong，weak 只認 WARN weak", reproduced("strong", "WARN strong") && !reproduced("strong", null) && reproduced("weak", "WARN weak") && !reproduced("weak", "WARN strong"));
  ck("S7 confirmRisk：真值 0.555 ⇒ 確認時 ≥0.57 約 0.27；0.50 ⇒ 兩邊都約 0.003", (() => { const a = confirmRisk(0.555), b = confirmRisk(0.5); return Math.abs(a.pStrong - 0.274) < 0.01 && b.pStrong < 0.005 && b.pWeak < 0.005; })());
  ck("S8 replicationFlag：0.58 RISK、0.44 OVERSHOOT、0.52 CONSISTENT", replicationFlag(0.58) === "RISK_FOR_CONFIRMATORY" && replicationFlag(0.44) === "OVERSHOOT" && replicationFlag(0.52) === "CONSISTENT");
  { const row = (arm, rate, hi, z = 0) => ({ arm, rate, vsBase: { hi, z, mean: 0, lo: 0 } }), T = (t, cands, sc, v) => ({ template: t, base: { rate: 0.6 }, candidates: cands, screenedCandidate: sc, screenedVerdict: v });
    const g = (cands, sc, v, od = []) => boundedOutcomeOf([T("x", cands, sc, v)], ["x"], od, 2.84);
    const a = g([row("A", 0.52, -0.01)], "A", "SELECTED"), b = g([row("A", 0.52, 0.03)], "A", "SELECTED"), c2 = g([row("A", 0.56, 0.02), row("B", 0.5, -0.02)], "A", "SELECTED_BORDERLINE"), d = g([row("A", 0.42, -0.1)], null, "NO_CANDIDATE"), o = g([row("A", 0.52, -0.01, -3)], "A", "SELECTED", ["A"]);
    const e = boundedOutcomeOf([T("x", [row("A", 0.52, -0.01)], "A", "SELECTED"), T("y", [], null, "NO_CANDIDATE_REGISTERED")], ["x"]);
    ck("S9 boundedOutcome：改善且在帶內 ⇒ REASONABLE；在帶內分不開 ⇒ IN_BAND_UNDISTINGUISHED 且研究要產品決策；第一個分得開的在帶內也算；過頭到帶外不算；沒有候選的模板不進結果",
      a.study === "CANDIDATES_FOR_ALL_STOPS" && b.templates[0].outcome === "IN_BAND_UNDISTINGUISHED" && b.study === "PRODUCT_DECISION_NEEDED" && b.lacking[0] === "x" && c2.templates[0].outcome === "REASONABLE" && c2.templates[0].via === "B" && c2.templates[0].borderline && d.templates[0].outcome === "NO_REASONABLE_CANDIDATE" && e.templates.length === 1);
    ck("S10 ownerDecisionArms：靠這些臂過關 ⇒ REASONABLE_OWNER_DECISION，研究結果不算乾淨的 CANDIDATES_FOR_ALL_STOPS；Bonferroni 標記看 |z|", o.templates[0].outcome === "REASONABLE_OWNER_DECISION" && o.study === "CANDIDATES_WITH_OWNER_DECISION" && o.ownerNeeded[0] === "x" && o.templates[0].candidates[0].bonferroni === true && a.templates[0].candidates[0].bonferroni === false);
    ck("S11 stopChance：0.60 ⇒ 0.5；0.55 ⇒ 約 0.022；pooledReads 依 n 加權", Math.abs(stopChance(0.6) - 0.5) < 1e-6 && Math.abs(stopChance(0.55) - 0.022) < 0.005 && Math.abs(pooledReads([{ rate: 0.6, n: 400 }, { rate: 0.5, n: 1200 }]).pooled - 0.525) < 1e-9); }
  ck("S6 setPath 只改指定欄位", (() => { const o = { a: { b: 1, c: 2 } }; setPath(o, "a.b", 5); return o.a.b === 5 && o.a.c === 2; })());
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── 臂 ─────────────────────────────────────────────────────────────────────
const { TACTIC_TEMPLATE_LIST } = await imp("src/platform/tactics/tacticTemplates.js");
const MTC = await imp("src/platform/contracts/MobaTacticConfig.js");
const OV = await imp("src/platform/tactics/tacticOverlays.js");
const cfgOf = (id) => { const t = TACTIC_TEMPLATE_LIST.find((x) => x.templateId === id); if (!t) throw new Error(`no template ${id}`); return structuredClone(t.config); };
const ARMS = Object.entries(REG.arms).map(([arm, d]) => { const c = cfgOf(d.template); for (const [p, v] of Object.entries(d.change)) setPath(c, p, v); return { arm, template: d.template, change: d.change, config: c, base: arm === "STD" || arm.startsWith("BASE_") ? null : `BASE_${d.template}` }; });
const ARM = Object.fromEntries(ARMS.map((x) => [x.arm, x]));
const expectOf = (config) => { const K = MTC.toEngineTactic(config), I = MTC.toEngineTacticIdentity(config); return { retreatAt: K.retreatAt, laneOffsetValues: Object.values(K.laneOffset).sort((a, b) => a - b), engageBias: I.engageBias, retreatFloorShift: I.retreatFloorShift, commitShift: I.commitShift,
  gankWeights: JSON.stringify(K.gankWeights ?? null), gankIntervalK: I.gankIntervalK ?? null, phaseEngage: JSON.stringify(I.phaseEngage ?? null), phaseJoin: JSON.stringify(I.phaseJoin ?? null), dragonJoin: K.dragonJoin ?? null, baronJoin: K.baronJoin ?? null }; };
const PROBE_V3 = REG.probe === "v3", PROBE_V2 = REG.probe === "v2" || PROBE_V3;
for (const x of ARMS) { x.expect = expectOf(x.config); if (PROBE_V2) { const I = MTC.toEngineTacticIdentity(x.config); Object.assign(x.expect, { roamK: I.roamK ?? null, protectHp: I.protectHp ?? null, siegeBias: I.siegeBias ?? null }); }
  if (PROBE_V3) { const K = MTC.toEngineTactic(x.config); Object.assign(x.expect, { gankInterval: K.gankInterval ?? null, invadeChance: K.invadeChance ?? null, invadeWithMid: K.invadeWithMid ?? null }); } }
const probeEq = (p, q) => ["retreatAt", "engageBias", "retreatFloorShift", "commitShift"].every((k) => near(p[k], q[k])) && p.laneOffsetValues.length === q.laneOffsetValues.length && p.laneOffsetValues.every((v, i) => near(v, q.laneOffsetValues[i]))
  && ["gankWeights", "phaseEngage", "phaseJoin"].every((k) => p[k] === q[k]) && ["gankIntervalK", "dragonJoin", "baronJoin"].every((k) => p[k] === q[k] || near(p[k], q[k]))
  && (!PROBE_V2 || ["roamK", "protectHp", "siegeBias"].every((k) => p[k] === q[k] || near(p[k], q[k])))
  && (!PROBE_V3 || ["gankInterval", "invadeChance", "invadeWithMid"].every((k) => p[k] === q[k] || near(p[k], q[k])));
const sigOf = (cfg) => { const a = MTC.toEngineTactic(cfg), b = MTC.toEngineTacticIdentity(cfg); delete a.tacticId; delete b.tacticId; return JSON.stringify([a, b]); };
const KIND = REG.kinds ?? { "classic.m3": "strong", "classic.m7": "strong", "classic.m1": "strong", "v2.three_lane_pressure": "strong", "v2.mid_jungle_sync": "strong", "v2.defensive_hold": "weak", "classic.m8": "weak", "v2.mid_solo_split": "weak" };
const EXPECTED_ARMS = REG.expectedArms ?? 23;
//  第三輪審查 #1：referenceOnly 的臂只當配對參照（報告列出、標記），不參與選擇；listedOrder＝登記的選擇順序（V2 斷言與臂的鍵順序相同）。
const REF = new Set(REG.referenceOnly ?? []);
const OUT_REL = REG.resultFile ?? "tools/fixtures/ga8_fix_screen_result_3aB.json";
const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: S1 - S0 + 1 }, (_, i) => S0 + i);
const taskOf = (x, seed, binding = false) => ({ id: `${x.arm}#${seed}${binding ? "#binding" : ""}`, key: binding ? `${x.arm}.binding` : x.arm, seed, arm: x.arm, template: x.template, config: x.config, binding, ...(PROBE_V3 ? { probe: "v3" } : PROBE_V2 ? { probe: "v2" } : {}), ...(REG.mechanism ? { mech: true } : {}) });
const tasks = ARMS.flatMap((x) => SEEDS.map((seed) => taskOf(x, seed)));
if (flag("plan")) { console.log(`${ARMS.length} 臂 × ${SEEDS.length} seeds ＝ ${tasks.length} 場`); for (const x of ARMS) console.log(`  ${x.arm.padEnd(30)} ${x.template.padEnd(24)} ${JSON.stringify(x.change)}`); process.exit(0); }

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
if ((flag("validate") || flag("run")) && !REG.fingerprint.startsWith(FP)) { console.error(`登記的指紋與目前不同（目前 ${FP}）：拒絕`); process.exit(2); }

if (flag("validate")) {
  if (envBad.length) { console.error(`環境有 ${envBad.join(",")}：拒絕`); process.exit(2); }
  const VDIR = val("vdir");
  if (!VDIR || insideRepo(VDIR)) { console.error("需要 repo 外的 --vdir"); process.exit(2); }
  let pass = 0, fail = 0;
  const ck = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${ok || !d ? "" : `　${d}`}`); };
  // V2：合法、範圍內、旋鈕組互異、只改宣告欄位
  const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
  const NUM_PATHS = ["macro.aggression", "macro.riskTolerance", "macro.grouping", "macro.splitPush", "objectives.dragonPriority", "objectives.heraldPriority", "objectives.baronPriority", "objectives.towerPriority", "objectives.invadePriority", "economy.supportRoamRate", "economy.jungleResourceShare"];
  const refs = [...MTC.MOBA_TACTICS, MTC.STANDARD_OPP_TACTIC];
  for (const o of OV.TACTIC_OVERLAYS) refs.push(OV.applyOverlayFields(MTC.mobaTacticById(o.baseTacticId), o.changedFields));
  const range = Object.fromEntries(NUM_PATHS.map((p) => { const xs = refs.map((c) => get(c, p)); return [p, [Math.min(...xs), Math.max(...xs)]]; }));
  const deepDiff = (a, b, p = "") => (a && b && typeof a === "object" && typeof b === "object" ? [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => deepDiff(a[k], b[k], p ? `${p}.${k}` : k)) : JSON.stringify(a) === JSON.stringify(b) ? [] : [p]);
  const otherSigs = new Map(TACTIC_TEMPLATE_LIST.map((t) => [sigOf(t.config), t.templateId]));
  const candSigs = new Map();
  const v2 = ARMS.map((x) => {
    const problems = [];
    if (!MTC.validateMobaTacticConfig(x.config).ok) problems.push("invalid");
    for (const p of NUM_PATHS) if (!(get(x.config, p) >= range[p][0] && get(x.config, p) <= range[p][1])) problems.push(`${p} out of range`);
    const d = deepDiff(cfgOf(x.template), x.config), declared = Object.keys(x.change);
    if (d.length !== declared.length || !d.every((k) => declared.includes(k))) problems.push(`diff ${d.join(",")}`);
    if (x.base) {
      const sg = sigOf(x.config);
      if (otherSigs.has(sg)) problems.push(`same knobs as ${otherSigs.get(sg)}`);
      if (candSigs.has(sg)) problems.push(`same knobs as ${candSigs.get(sg)}`);
      candSigs.set(sg, x.arm);
    }
    return problems.length ? `${x.arm}: ${problems.join(";")}` : null;
  }).filter(Boolean);
  for (const [a, b] of Object.entries(REG.compareTo ?? {})) if (!ARM[a] || !ARM[b] || ARM[a].template !== ARM[b].template) v2.push(`compareTo ${a}→${b} 無效`);
  if (REG.listedOrder) { const order = ARMS.filter((x) => x.base && !REF.has(x.arm)).map((x) => x.arm); if (JSON.stringify(order) !== JSON.stringify(REG.listedOrder)) v2.push(`候選順序 ${order.join(",")} ≠ listedOrder`); }
  for (const a of REF) if (!ARM[a] || !ARM[a].base) v2.push(`referenceOnly ${a} 不是候選臂`);
  if (REG.identityLocks) {
    const bad = ARMS.filter((x) => x.base).flatMap((x) => (REG.identityLocks[x.template] ?? []).filter((p) => Object.hasOwn(x.change, p)).map((p) => `${x.arm} 改了 ${p}`));
    const none = Object.keys(REG.identityLocks).filter((t) => !ARMS.some((x) => x.template === t && x.base));
    ck(`V2c 候選沒有改到鎖定的核心欄位（${Object.keys(REG.identityLocks).length} 個模板）`, bad.length === 0 && none.length === 0, [...bad, ...none].join(","));
    const { templateConfigFor } = await imp("src/platform/tactics/tacticTemplates.js");
    const tableBad = ARMS.filter((x) => !x.base && Object.keys(x.change).length).filter((x) => JSON.stringify(MTC.toEngineTactic(x.config)) !== JSON.stringify(MTC.toEngineTactic(templateConfigFor(x.template, "v21.b1"))) || JSON.stringify(MTC.toEngineTacticIdentity(x.config)) !== JSON.stringify(MTC.toEngineTacticIdentity(templateConfigFor(x.template, "v21.b1")))).map((x) => x.arm);
    ck("V2b 帶數值的 BASE 臂＝凍結修正表 v21.b1 下該模板的旋鈕", tableBad.length === 0, tableBad.join(","));
  }
  ck(`V2 ${ARMS.length} 臂：設定合法、數值在已出貨範圍內、候選旋鈕組與每個模板／其他候選都不同、只改宣告欄位`, v2.length === 0 && ARMS.length === EXPECTED_ARMS, v2.slice(0, 3).join(" | "));
  const v3a = ARMS.filter((x) => x.base && probeEq(x.expect, ARM[x.base].expect)).map((x) => x.arm);
  //  DH_A／DH_B／M8_B 只改列舉欄位：Director 數值可能與 BASE 相同；那就改用整份旋鈕組簽章判定非空轉。
  const v3aSig = v3a.filter((arm) => sigOf(ARM[arm].config) === sigOf(ARM[ARM[arm].base].config));
  ck("V3a 每個候選的引擎旋鈕組與自己的 BASE 不同（非空轉）", v3aSig.length === 0, v3aSig.join(","));
  if (PROBE_V2) {
    const vc = Object.entries(REG.compareTo ?? {}).filter(([a, b]) => ARM[a] && ARM[b] && (probeEq(ARM[a].expect, ARM[b].expect) || sigOf(ARM[a].config) === sigOf(ARM[b].config))).map(([a, b]) => `${a}=${b}`);
    ck(`V3a' 每個 compareTo 臂與它的比較對象在探針（${REG.probe ?? "v1"}）上也不同（增加的那一組確實進引擎）`, vc.length === 0, vc.join(","));
  }
  const vSeeds = SEEDS.slice(0, 10);
  const baseArms = ARMS.filter((x) => !x.base);
  const vTasks = baseArms.flatMap((x) => vSeeds.flatMap((s) => [taskOf(x, s), taskOf(x, s, true)]));
  const pTasks = ARMS.filter((x) => x.base).flatMap((x) => vSeeds.slice(0, 2).map((s) => taskOf(x, s)));
  const res = await runStudy({ dir: VDIR, tasks: [...vTasks, ...pTasks], workerFile: SELF, workerArgs: ["--screen-worker"], meta: { ...META, validation: true }, workers: Number(val("workers", 3)), label: "候選篩選 validate", check: recCheck });
  if (res.halted || res.failed || res.lost) ck("驗證批次跑完", false, JSON.stringify(res));
  const diffs = [];
  for (const x of baseArms) for (const s of vSeeds) { const a = readKey(VDIR, x.arm).get(`${x.arm}#${s}`), b = readKey(VDIR, `${x.arm}.binding`).get(`${x.arm}#${s}#binding`); if (!a || !b || a.win !== b.win || a.duration !== b.duration) diffs.push(`${x.arm}#${s}`); }
  ck(`V1 legacy 路徑＝binding 路徑（STD＋${baseArms.length - 1} BASE × ${vSeeds.length} seeds：win、duration）`, diffs.length === 0, diffs.slice(0, 5).join(","));
  const probeBad = [...vTasks, ...pTasks].filter((t) => { const r = readKey(VDIR, t.key).get(t.id); return !r || recCheck(r, t).length; }).map((t) => t.id);
  ck(`V3b 引擎 t＝0 的 Director 數值＝臂設定的預期（${vTasks.length + pTasks.length} 場）`, probeBad.length === 0, probeBad.slice(0, 5).join(","));
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
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--screen-worker"], meta: META, workers: Number(val("workers", 3)), label: "G-A8 候選篩選", check: recCheck });
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
  const med = (xs) => { const a = [...xs].sort((p, q) => p - q); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
  const half = (arm, f) => rateCI(S.filter(f).map((s) => R(arm, s).win)).rate;
  const arms = ARMS.map((x) => ({ arm: x.arm, template: x.template, change: x.change, ...rateCI(S.map((s) => R(x.arm, s).win)),
    asBlue: half(x.arm, (s) => s % 2 === 1), asRed: half(x.arm, (s) => s % 2 === 0), standard: half(x.arm, (s) => R(x.arm, s).layout === "STANDARD"), swapped: half(x.arm, (s) => R(x.arm, s).layout === "SWAPPED"),
    medianDurationMin: med(S.map((s) => R(x.arm, s).duration)) / 60,
    ...(REG.mechanism ? { mechanism: (() => { const m = (g) => meanSd(S.map((s) => g(R(x.arm, s))).filter((v) => v != null)).mean; return { killDiff: m((r) => r.killsFor - r.killsAgainst), gold600: m((r) => r.gold600), gold1200: m((r) => r.gold1200), towersTaken: m((r) => r.towersTaken), towersLost: m((r) => r.towersLost) }; })() } : {}),
    ...(x.base ? { vsBase: pairedStats(S.map((s) => R(x.arm, s).win - R(x.base, s).win)) } : {}),
    ...(x.arm !== "STD" ? { vsStd: pairedStats(S.map((s) => R(x.arm, s).win - R("STD", s).win)) } : {}),
    //  第二輪：登記的 compareTo（描述性：m8 內容份額、m7 姿態增量）
    ...(REG.compareTo?.[x.arm] ? { compareTo: REG.compareTo[x.arm], vsCompare: pairedStats(S.map((s) => R(x.arm, s).win - R(REG.compareTo[x.arm], s).win)) } : {}) }));
  const A = Object.fromEntries(arms.map((a) => [a.arm, a]));
  const ga8 = JSON.parse(fs.readFileSync(path.join(ROOT, REG.ga8Result ?? "tools/fixtures/ga8_result_3aB.json"), "utf8"));
  const ga8Label = (tpl) => { const row = ga8.rows.find((r) => r.template === tpl); return row ? { rate: row.rate, label: row.stop ? "STOP" : row.warn ? (row.rate >= 0.5 ? "WARN strong" : "WARN weak") : null } : null; };
  const templates = Object.entries(KIND).map(([tpl, kind]) => {
    const base = A[`BASE_${tpl}`], cands = ARMS.filter((x) => x.template === tpl && x.base).map((x) => A[x.arm]);
    const pool = cands.filter((c) => !REF.has(c.arm)), sel = pool.length ? selectCandidate(kind, pool) : { selected: null, verdict: "NO_CANDIDATE_REGISTERED" };
    const rep = reproduced(kind, base.label);
    if ((REG.descriptiveOnly ?? []).includes(tpl)) return { template: tpl, kind, ga8: ga8Label(tpl), base: { rate: base.rate, lo: base.lo, hi: base.hi, label: base.label, vsStd: base.vsStd }, reproduced: rep,
      candidates: cands.map((c) => ({ arm: c.arm, change: c.change, rate: c.rate, lo: c.lo, hi: c.hi, label: c.label, vsBase: c.vsBase, vsStd: c.vsStd, replicationFlag: replicationFlag(c.rate), confirmRisk: confirmRisk(c.rate) })),
      selected: null, verdict: "DESCRIPTIVE_REPLICATION" };
    //  審查 #8：BASE 沒重現 ⇒ 判定 NOT_REPRODUCED；篩選出的候選仍列在 screenedCandidate。
    return { template: tpl, kind, ga8: ga8Label(tpl), base: { rate: base.rate, lo: base.lo, hi: base.hi, label: base.label, vsStd: base.vsStd }, reproduced: rep,
      candidates: cands.map((c) => ({ arm: c.arm, change: c.change, rate: c.rate, lo: c.lo, hi: c.hi, label: c.label, vsBase: c.vsBase, ...(REF.has(c.arm) ? { referenceOnly: true } : {}), ...(REG.confirmRisk ? { confirmRisk: confirmRisk(c.rate) } : {}) })),
      selected: rep ? sel.selected : null, verdict: rep ? sel.verdict : "NOT_REPRODUCED", screenedCandidate: sel.selected, screenedVerdict: sel.verdict };
  });
  const control = A.STD, controlOk = Math.abs(control.rate - 0.5) <= 0.05;
  //  登記 boundedOutcome：正式 STOP 不因這個區段重現與否而改變，候選照評（第六輪）。
  const bounded = REG.boundedOutcome ? boundedOutcomeOf(templates, REG.stopTargets ?? [], REG.ownerDecisionArms ?? [], REG.bonferroniZ ?? Infinity) : null;
  const nearStop = REG.earlierReads ? Object.entries(REG.earlierReads).map(([tpl, reads]) => { const base = A[`BASE_${tpl}`]; return { template: tpl, thisBlock: base.rate, earlier: reads, ...pooledReads([...reads, { block: REG.seeds.range, rate: base.rate, n: base.n }]) }; }) : null;
  //  第二輪：與第一輪合併的描述性勝率（同 n ⇒ 平均；不用於選擇）
  const r1 = REG.pooledWith ? JSON.parse(fs.readFileSync(path.join(ROOT, REG.pooledWith), "utf8")) : null;
  const pooled = r1 ? ARMS.filter((x) => r1.arms.some((a) => a.arm === x.arm)).map((x) => { const a = r1.arms.find((y) => y.arm === x.arm); const n = a.n + A[x.arm].n, p = (a.rate * a.n + A[x.arm].rate * A[x.arm].n) / n, se = Math.sqrt(p * (1 - p) / n); return { arm: x.arm, round1: a.rate, round2: A[x.arm].rate, pooled: p, lo: p - 1.96 * se, hi: p + 1.96 * se, n }; }) : null;
  const er = errorRule(audit.errored.length, tasks.length);
  const outcome = audit.instrument.length || !controlOk || er === "STOP" ? "INSTRUMENT" : er === "INCONCLUSIVE" ? "INCONCLUSIVE" : "SCREENED";
  const out = { schema: "esmo.ga8-fix-screen-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    ga8Verdict: "STOP (unchanged; screening only, no template changed; a selection is a proposal that must be confirmed by G-A8 on the reserved fresh seeds after an Owner-approved versioned change)",
    statsNote: `unadjusted 95% intervals; ${ARMS.length} arms on one seed block`, matches: tasks.length, errored: audit.errored, instrument: audit.instrument.slice(0, 20), control: { rate: control.rate, ok: controlOk }, outcome, ...(bounded ? { boundedOutcome: bounded } : {}), ...(nearStop ? { nearStop, nearStopNoStopAll: nearStop.filter((x) => (REG.nearStopJoint ?? []).includes(x.template)).reduce((q, x) => q * (1 - x.stopChanceN400), 1) } : {}), templates, ...(pooled ? { pooledWithRound1: pooled } : {}), arms };
  const OUT = path.join(ROOT, OUT_REL);
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  const pp = (x) => (x == null ? "—" : (x * 100).toFixed(1)), ci = (s) => (s ? `${pp(s.mean)}（${pp(s.lo)}..${pp(s.hi)}）` : "—");
  console.log(`對照 std ${pp(control.rate)}%（${controlOk ? "OK" : "超出 0.50±0.05"}）`);
  for (const t of templates) {
    console.log(`${t.template.padEnd(24)} G-A8 ${t.ga8 ? `${pp(t.ga8.rate)} ${t.ga8.label ?? ""}` : "—"}｜篩選 BASE ${pp(t.base.rate)}（${pp(t.base.lo)}..${pp(t.base.hi)}）${t.base.label ?? ""}｜${t.reproduced ? "重現" : "未重現"}｜${t.verdict}${t.selected ? ` ${t.selected}` : ""}${!t.reproduced && t.screenedCandidate ? `（篩選候選 ${t.screenedCandidate} ${t.screenedVerdict}）` : ""}`);
    for (const c of t.candidates) { const a = A[c.arm]; console.log(`     ${c.arm.padEnd(8)} ${pp(c.rate)}（${pp(c.lo)}..${pp(c.hi)}）${c.label ?? ""}　對 BASE ${ci(c.vsBase)}${a.vsCompare ? `　對 ${a.compareTo} ${ci(a.vsCompare)}` : ""}${c.confirmRisk ? `　確認風險 ≥57 ${pp(c.confirmRisk.pStrong)}%／≤43 ${pp(c.confirmRisk.pWeak)}%` : ""}${c.replicationFlag ? `　複驗 ${c.replicationFlag}` : ""}${c.referenceOnly ? "　（參照，不參與選擇）" : ""}`); }
  }
  if (pooled) for (const p of pooled) console.log(`合併兩輪（描述性）${p.arm.padEnd(18)} 第一輪 ${pp(p.round1)}　第二輪 ${pp(p.round2)}　合併 ${pp(p.pooled)}（${pp(p.lo)}..${pp(p.hi)}，n ${p.n}）`);
  if (bounded) { for (const t of bounded.templates) { console.log(`${t.template.padEnd(24)} ${t.outcome}　screened ${t.screened ?? "—"}（${t.screenedVerdict}）${t.screenedImproves ? " SHOWS_IMPROVEMENT" : ""}　first distinguished ${t.firstDistinguished ?? "—"}${t.borderline ? "　BORDERLINE：交 Owner" : ""}`); for (const x of t.candidates) if (x.bonferroni) console.log(`     ${x.arm} 過 Bonferroni（描述性，z ${x.z?.toFixed(2)}）`); } console.log(`研究結果：${bounded.study}`); }
  if (nearStop) for (const x of nearStop) console.log(`${x.template.padEnd(24)} 本區段 ${pp(x.thisBlock)}　${x.blocks} 區段合併 ${pp(x.pooled)}（n ${x.n}）　n=400 判 STOP 機率 ${pp(x.stopChanceN400)}%`);
  console.log(`結果 ${outcome}（G-A8 維持 STOP）`);
}
