#!/usr/bin/env node
// ============================================================================
//  tools/measure_challenge_c2_3aB.mjs — Phase 3a-B 修正規劃 C2：Challenge 逐英雄／逐陣容診斷＋技能紅藍對稱檢查＋TD-3A-23 鏡像重查
//  （登記 tools/fixtures/challenge_c2_registration_3aB.json）
//
//  node tools/measure_challenge_c2_3aB.mjs --plan
//  node tools/measure_challenge_c2_3aB.mjs --selftest
//  node tools/measure_challenge_c2_3aB.mjs --validate --vdir=<repo 外新資料夾>
//  node tools/measure_challenge_c2_3aB.mjs --run --dir=<repo 外新資料夾> --vdir=<同上> [--workers=3]   要 review.reviewedAt＋validation 通過
//  node tools/measure_challenge_c2_3aB.mjs --report --dir=<同一個>        寫 tools/fixtures/challenge_c2_result_3aB.json
//  端點資料夾（基準臂讀已提交資料；V1 對照）：--fwddir（side bias challenge 正向）、--ladderdir（層級階梯）
//
//  診斷用：src/ 不動。對局一律走正式 buildChallengeMatchSetup → assembleMatch → runChallenge 的 tick 迴圈（與階梯工具相同）。
//  介入只在工具層：① 情境＝階梯的 ladderSetup（v20 setup 複製 v21 的層群組）② 單席技能關閉／成長關閉＝組裝器 deps 的
//  adapter 包一層、刪掉那一席的輸出（adapter 本來就以席位為鍵、缺席位合法）③ 拉平＝改寫 setup 的 playerSlots／loadout
//  ④ 鏡像＝把一方的 roster／loadout／playerSlots／tactic 複製到另一方。不改 side bias 判定（仍 STOP）。
//  基準臂（v21／L1 情境、無介入）只重跑前 REG.seeds.baselineRerun 個 seed 做 V1；分析用的是已提交紀錄（審查 #5：省預算）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, pairedStats, insideRepo, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/challenge_c2_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const FWD = val("fwddir", "C:/Users/ifikn/esmo-measure/sidebias-challenge-3aB-final");
const LAD = val("ladderdir", "C:/Users/ifikn/esmo-measure/challenge-ladder-3aB");
const verOf = (rs) => (rs === "challenge.v21" ? "moba-sim.v21" : "moba-sim.v20");
const winOf = (w) => (w === "blue" ? 1 : w === "red" ? 0 : 0.5);
export const SEATS = Object.freeze(["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"]);

//  與 measure_challenge_ladder_3aB.mjs 的 GROUPS／ladderSetup 逐字相同（那支工具 import 時會執行頂層程式，不能直接 import）；
//  V1 用階梯的 L1_frame 紀錄逐場核對。
const GROUPS = Object.freeze({ frame: ["tacticalDirector", "laneFrame"], order: ["assemblyOrder"], skills: ["heroSkills"], growth: ["heroPassives", "heroPowerCurve"], layout: ["objectiveLayout"] });
export const CONTEXT_GROUPS = Object.freeze({ L0: [], L1: ["frame"], L3a: ["frame", "order", "skills"], L3: ["frame", "order", "skills", "growth"] });
export function ladderSetup(s20, s21, groups) {
  const s = structuredClone(s20);
  for (const g of groups) {
    for (const k of GROUPS[g]) s.ruleset.layers[k] = s21.ruleset.layers[k];
    if (g === "skills" || g === "growth") for (const k of GROUPS[g]) s.effectiveLayers[k] = s21.effectiveLayers[k];
    if (g === "layout") { s.effectiveLayers.layoutConfigured = s21.effectiveLayers.layoutConfigured; s.objectiveLayout = s21.objectiveLayout; }
  }
  return s;
}
/** 每個情境從引擎讀到的層（即時檢查用）。 */
export const EXPECT = Object.freeze({
  L0: { director: "static", laneFrame: "legacyMirror", skills: false, growth: false },
  L1: { director: "core.v1", laneFrame: "teamRelative", skills: false, growth: false },
  L3a: { director: "core.v1", laneFrame: "teamRelative", skills: true, growth: false },
  L3: { director: "core.v1", laneFrame: "teamRelative", skills: true, growth: true },
  v21: { director: "core.v1", laneFrame: "teamRelative", skills: true, growth: true },
});

// ── 純函式（selftest 涵蓋）────────────────────────────────────────────────
/** 拉平：每一席的能力值與熟練（loadout）改成兩隊同席位的平均（能力值四捨五入；等級四捨五入、倍率取平均）。英雄與戰術不動。 */
export function equalizeSetup(setup) {
  const s = structuredClone(setup);
  for (let k = 0; k < 5; k++) {
    const b = s.playerSlots.blue[k], r = s.playerSlots.red[k];
    const stats = Object.fromEntries(Object.keys(b.stats).map((key) => [key, Math.round((b.stats[key] + r.stats[key]) / 2)]));
    b.stats = { ...stats }; r.stats = { ...stats };
    const lb = s.loadout[`b${k + 1}`], lr = s.loadout[`r${k + 1}`];
    const lo = { ...lb, level: Math.round((lb.level + lr.level) / 2), powerMult: (lb.powerMult + lr.powerMult) / 2, toughMult: (lb.toughMult + lr.toughMult) / 2 };
    s.loadout[`b${k + 1}`] = { ...lo }; s.loadout[`r${k + 1}`] = { ...lo };
  }
  return s;
}
/** 鏡像：from 方（"blue"／"red"）的英雄（含召喚師技能）、熟練、能力值與戰術複製到另一方（同席位）。 */
export function mirrorSetup(setup, from) {
  const s = structuredClone(setup), to = from === "blue" ? "red" : "blue", fp = from[0], tp = to[0];
  for (let k = 1; k <= 5; k++) { s.roster[`${tp}${k}`] = structuredClone(setup.roster[`${fp}${k}`]); s.loadout[`${tp}${k}`] = structuredClone(setup.loadout[`${fp}${k}`]); }
  s.playerSlots[to] = setup.playerSlots[from].map((x) => ({ ...structuredClone(x), id: `${tp}${x.id.slice(1)}`, playerId: `${x.playerId}#mirror` }));
  s.tactic[to] = structuredClone(setup.tactic[from]);
  return s;
}
/** adapter 包一層：刪掉指定席位的輸出。 */
export const dropSeats = (seats) => (f) => (...a) => { const o = f(...a); if (!o) return o; const players = { ...o.players }; for (const k of seats) delete players[k]; return { ...o, players }; };
/** 英雄對自己隊伍的貢獻（機率尺度）：藍席＝基準藍勝 − 關閉後藍勝；紅席＝關閉後藍勝 − 基準藍勝。 */
export const contributionOf = (seat, dKoMinusBase) => (seat[0] === "b" ? -dKoMinusBase : dKoMinusBase);
/** 審查 #2：機率尺度上這一席貢獻的理論上限（藍席＝基準藍勝；紅席＝1 − 基準藍勝）。 */
export const ceilingOf = (seat, baseBlueWin) => (seat[0] === "b" ? baseBlueWin : 1 - baseBlueWin);
export const BONF = Object.freeze({ hero: 2.81, eq: 2.24, mirrorSkill: 2.58, mirrorGrowth: 2.39, frame: 2.5 });
export const Z80 = 0.8416;
/** 標籤：|z| ≥ 門檻 ⇒ MATERIAL；未校正 95% 不含 0 ⇒ HINT；否則 NONE。z 為 null（se＝0）時：平均 0 ⇒ NONE，否則 MATERIAL（審查 #7）。 */
export const labelOf = (st, zCrit) => (!st || !st.n ? "NONE" : st.z == null ? (st.mean === 0 ? "NONE" : "MATERIAL") : Math.abs(st.z) >= zCrit ? "MATERIAL" : st.lo > 0 || st.hi < 0 ? "HINT" : "NONE");
/** 審查 #4：在 zCrit 下 80% 檢定力的最小可偵測差（同一 se）。 */
export const mdeOf = (st, zCrit) => (st?.se != null ? (zCrit + Z80) * st.se : null);
/** 鏡像判定：pooled 達標 ⇒ SKILL_LAYER_SIDE_EFFECT；只有個別陣容達標 ⇒ LINEUP_SPECIFIC；否則 NOT_DETECTED。 */
export function mirrorVerdict(pooled, perLineup, zCrit = BONF.mirrorSkill) {
  if (labelOf(pooled, zCrit) === "MATERIAL") return "SKILL_LAYER_SIDE_EFFECT";
  if (Object.values(perLineup).some((st) => labelOf(st, zCrit) === "MATERIAL")) return "LINEUP_SPECIFIC";
  return "NOT_DETECTED";
}
const clampP = (p) => Math.min(1 - 1e-3, Math.max(1e-3, p));
export const logit = (p) => Math.log(clampP(p) / (1 - clampP(p)));
/** 決定性的配對 bootstrap（mulberry32）：f(索引陣列) → 數值；回傳點估計與 2.5／97.5 百分位。 */
export function bootstrap(n, f, B = 2000, seed = 0xc2) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const all = Array.from({ length: n }, (_, i) => i), est = f(all), xs = [];
  for (let b = 0; b < B; b++) xs.push(f(Array.from({ length: n }, () => Math.floor(rnd() * n))));
  xs.sort((p, q) => p - q);
  return { est, lo: xs[Math.floor(0.025 * B)], hi: xs[Math.ceil(0.975 * B) - 1] };
}
/** 審查 #3：機率尺度與 logit 尺度的判定是否一致（一邊 MATERIAL／HINT、另一邊區間含 0 ⇒ SCALE_DEPENDENT）。 */
export const scaleAgreement = (probLabel, logitCI) => {
  const logitMoves = logitCI.lo > 0 || logitCI.hi < 0, probMoves = probLabel !== "NONE";
  return probMoves === logitMoves ? "CONSISTENT" : "SCALE_DEPENDENT";
};
/** 審查 #1：鏡像在 t＝0 的對稱：teamRelative 下比 directive(side, t)（去掉 side）；legacyMirror 下比世界路名的旋鈕。 */
export function directiveSymmetric(e, ts = [0, 600, 1200]) {
  if (e.director?.laneFrame !== "teamRelative") return JSON.stringify(e.director.knobs("blue")) === JSON.stringify(e.director.knobs("red"));
  const strip = (d) => { const { side, ...rest } = d ?? {}; return JSON.stringify(rest); };
  return ts.every((t) => strip(e.director.directive("blue", t)) === strip(e.director.directive("red", t)));
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const slot = (id, v) => ({ id, playerId: `p${id}`, stats: { a: v, b: v + 1 } });
  const mk = () => ({ playerSlots: { blue: [1, 2, 3, 4, 5].map((k) => slot(`b${k}`, 60)), red: [1, 2, 3, 4, 5].map((k) => slot(`r${k}`, 71)) },
    loadout: Object.fromEntries(SEATS.map((s) => [s, { level: s[0] === "b" ? 1 : 4, powerMult: s[0] === "b" ? 1 : 1.08, toughMult: s[0] === "b" ? 1 : 1.1 }])),
    roster: Object.fromEntries(SEATS.map((s) => [s, { heroId: `h_${s}`, spells: [`f_${s}`] }])), tactic: { blue: { kind: "legacy", config: { tacticId: "m1" } }, red: { kind: "legacy", config: { tacticId: "m4" } } } });
  ck("S1 拉平：兩隊同席位能力值相同（66／67）、熟練與倍率取平均、英雄與戰術不動、原物件不變", (() => { const o = mk(), x = equalizeSetup(o); return x.playerSlots.blue[2].stats.a === 66 && x.playerSlots.red[2].stats.b === 67 && x.loadout.b3.level === 3 && x.loadout.r3.level === 3 && Math.abs(x.loadout.b3.powerMult - 1.04) < 1e-12 && Math.abs(x.loadout.r3.toughMult - 1.05) < 1e-12 && x.roster.r3.heroId === "h_r3" && x.tactic.red.config.tacticId === "m4" && o.playerSlots.blue[2].stats.a === 60; })());
  ck("S2 鏡像（藍 → 紅）：紅方英雄（含召喚師技能）／熟練／能力值／戰術＝藍方同席位，席位 id 是 r*，藍方不變", (() => { const x = mirrorSetup(mk(), "blue"); return x.roster.r2.heroId === "h_b2" && x.roster.r2.spells[0] === "f_b2" && x.loadout.r2.level === 1 && x.playerSlots.red[1].id === "r2" && x.playerSlots.red[1].stats.a === 60 && x.tactic.red.config.tacticId === "m1" && x.roster.b2.heroId === "h_b2"; })());
  ck("S3 鏡像（紅 → 藍）：藍方＝紅方", (() => { const x = mirrorSetup(mk(), "red"); return x.roster.b4.heroId === "h_r4" && x.playerSlots.blue[3].id === "b4" && x.playerSlots.blue[3].stats.a === 71 && x.tactic.blue.config.tacticId === "m4"; })());
  ck("S4 dropSeats 只刪指定席位、null 原樣回傳", (() => { const f = dropSeats(["r2"])(() => ({ v: 1, players: { b1: 1, r2: 2 } })); const g = dropSeats(["r2"])(() => null); const o = f(); return o.v === 1 && o.players.b1 === 1 && !("r2" in o.players) && g() === null; })());
  ck("S5 貢獻方向與上限：藍席關閉後藍勝 −0.2 ⇒ +0.2、上限＝基準；紅席 +0.1 ⇒ +0.1、上限＝1 − 基準", contributionOf("b3", -0.2) === 0.2 && contributionOf("r1", 0.1) === 0.1 && ceilingOf("b1", 0.965) === 0.965 && Math.abs(ceilingOf("r1", 0.965) - 0.035) < 1e-12);
  ck("S6 標籤：z 3 MATERIAL、z 2 且不含 0 HINT、含 0 NONE、z null 且平均 ≠ 0 MATERIAL", labelOf({ n: 9, z: 3, lo: 0.1, hi: 0.3 }, 2.81) === "MATERIAL" && labelOf({ n: 9, z: 2, lo: 0.01, hi: 0.2 }, 2.81) === "HINT" && labelOf({ n: 9, z: 1, lo: -0.01, hi: 0.2 }, 2.81) === "NONE" && labelOf({ n: 9, z: null, mean: 0.1 }, 2.81) === "MATERIAL" && labelOf({ n: 9, z: null, mean: 0 }, 2.81) === "NONE");
  ck("S7 鏡像判定：pooled 達標 ⇒ SKILL_LAYER_SIDE_EFFECT；只有一個陣容 ⇒ LINEUP_SPECIFIC；都沒有 ⇒ NOT_DETECTED", mirrorVerdict({ n: 9, z: 3, lo: 1, hi: 2 }, {}) === "SKILL_LAYER_SIDE_EFFECT" && mirrorVerdict({ n: 9, z: 1, lo: -1, hi: 2 }, { a: { n: 9, z: -2.9, lo: -2, hi: -1 } }) === "LINEUP_SPECIFIC" && mirrorVerdict({ n: 9, z: 1, lo: -1, hi: 2 }, { a: { n: 9, z: 2.5, lo: 0.1, hi: 1 } }) === "NOT_DETECTED");
  ck("S8 ladderSetup：L3a 只開 heroSkills、L3 加 passives／curve、L1 只複製 frame、L0＝v20 副本", (() => { const s20 = { ruleset: { layers: { heroSkills: false, heroPassives: false, heroPowerCurve: false, assemblyOrder: "challengeV20" } }, effectiveLayers: { heroSkills: false, heroPassives: false, heroPowerCurve: false } };
    const s21 = { ruleset: { layers: { heroSkills: true, heroPassives: true, heroPowerCurve: true, assemblyOrder: "live", tacticalDirector: "core.v1", laneFrame: "teamRelative" } }, effectiveLayers: { heroSkills: true, heroPassives: true, heroPowerCurve: true } };
    const a = ladderSetup(s20, s21, CONTEXT_GROUPS.L3a), b = ladderSetup(s20, s21, CONTEXT_GROUPS.L1), c = ladderSetup(s20, s21, CONTEXT_GROUPS.L3), z = ladderSetup(s20, s21, CONTEXT_GROUPS.L0);
    return a.effectiveLayers.heroSkills && !a.effectiveLayers.heroPassives && a.ruleset.layers.assemblyOrder === "live" && b.ruleset.layers.laneFrame === "teamRelative" && !b.effectiveLayers.heroSkills && c.effectiveLayers.heroPowerCurve && JSON.stringify(z) === JSON.stringify(s20) && z !== s20; })());
  ck("S9 MDE：se 0.05、z 2.81 ⇒ (2.81＋0.8416)×0.05 ≈ 0.1826", Math.abs(mdeOf({ se: 0.05 }, 2.81) - 0.18258) < 1e-4);
  ck("S10 bootstrap 決定性、點估計＝全樣本；logit(0.5)＝0；尺度一致性", (() => { const xs = [0, 1, 1, 0, 1, 1, 1, 0]; const f = (I) => I.reduce((a, i) => a + xs[i], 0) / I.length; const a = bootstrap(xs.length, f, 500), b = bootstrap(xs.length, f, 500);
    return a.est === 0.625 && a.lo === b.lo && a.hi === b.hi && a.lo <= a.est && a.est <= a.hi && logit(0.5) === 0 && scaleAgreement("MATERIAL", { lo: -0.1, hi: 0.2 }) === "SCALE_DEPENDENT" && scaleAgreement("NONE", { lo: -0.1, hi: 0.2 }) === "CONSISTENT"; })());
  ck("S11 directiveSymmetric：legacyMirror 比旋鈕；teamRelative 比去掉 side 的 directive", (() => {
    const leg = { director: { laneFrame: "legacyMirror", knobs: (s) => ({ a: 1 }) } }, legBad = { director: { laneFrame: "legacyMirror", knobs: (s) => ({ a: s === "blue" ? 1 : 2 }) } };
    const tr = { director: { laneFrame: "teamRelative", knobs: (s) => ({ lane: s }), directive: (s, t) => ({ side: s, t, x: 1 }) } }, trBad = { director: { laneFrame: "teamRelative", directive: (s, t) => ({ side: s, x: s === "blue" ? 1 : 2 }) } };
    return directiveSymmetric(leg) && !directiveSymmetric(legBad) && directiveSymmetric(tr) && !directiveSymmetric(trBad); })());
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
/** 一個臂在一個 seed 的 setup 與 deps。 */
export async function armSetup(spec, seed) {
  const { D, H, S } = await lib();
  const a = await setupOf(seed, "challenge.v20"), b = await setupOf(seed, "challenge.v21");
  let setup = spec.context === "v21" ? structuredClone(b.setup) : ladderSetup(a.setup, b.setup, CONTEXT_GROUPS[spec.context]);
  if (spec.equalize) setup = equalizeSetup(setup);
  if (spec.mirror) setup = mirrorSetup(setup, spec.mirror);
  const base = D.buildMatchAssemblerDepsFrom({ heroLookup: H.heroById, heroLookupLabel: S.CHALLENGE_HERO_LOOKUP_LABEL });
  const deps = spec.koSkills || spec.koGrowth
    ? D.buildMatchAssemblerDepsFrom({ heroLookup: H.heroById, heroLookupLabel: S.CHALLENGE_HERO_LOOKUP_LABEL,
      heroAdapters: spec.koSkills ? { toEngineHeroSkills: dropSeats([spec.koSkills])(base.heroAdapters.toEngineHeroSkills) } : {},
      engineAdapters: spec.koGrowth ? { toEngineHeroPassives: dropSeats([spec.koGrowth])(base.engineAdapters.toEngineHeroPassives), toEngineHeroPowerCurve: dropSeats([spec.koGrowth])(base.engineAdapters.toEngineHeroPowerCurve) } : {} })
    : base;
  return { setup, deps, pairing: a.pairing };
}
async function play(setup, deps) {
  const { A, R } = await lib();
  const r = A.assembleMatch(setup, deps);
  if (!r.ok) throw new Error(`assemble: ${JSON.stringify(r.errors).slice(0, 200)}`);
  const e = r.engine;
  //  t＝0 探針（從引擎讀）：席位清單、每席 power／maxHp、鏡像對稱（directiveSymmetric）、兩方 identity 是否相同。
  const t0 = { skillSeats: Object.keys(e.heroSkills ?? {}).sort(), passiveSeats: Object.keys(e.heroPassives ?? {}).sort(), curveSeats: Object.keys(e.powerCurve ?? {}).sort(),
    power: Object.fromEntries(e.players.map((p) => [p.id, Math.round(p.power * 1e6) / 1e6])), maxHp: Object.fromEntries(e.players.map((p) => [p.id, Math.round(p.maxHp * 1e6) / 1e6])),
    directiveSymmetric: directiveSymmetric(e), identityEqual: JSON.stringify(e.director.identity("blue")) === JSON.stringify(e.director.identity("red")) };
  for (let t = R.CHALLENGE_DT; t <= R.CHALLENGE_MAX_T && !e.over; t += R.CHALLENGE_DT) e.tick(R.CHALLENGE_DT);
  const kills = (side) => e.players.filter((p) => p.side === side).reduce((n, p) => n + (p.k ?? 0), 0);
  return { winner: e.over && (e.winner === "blue" || e.winner === "red") ? e.winner : null, duration: Math.round(e.t), director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null,
    engine: { skills: e.heroSkillsOn === true, passives: e.heroPassivesOn === true, curve: e.powerCurveOn === true, layout: e.objectiveLayout ?? null }, t0, kills: { blue: kills("blue"), red: kills("red") } };
}

if (flag("c2-worker")) {
  process.on("message", async (t) => {
    try {
      const { setup, deps, pairing } = await armSetup(t.spec, t.seed);
      const g = await play(setup, deps);
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, engineSeed: setup.seed, arm: t.arm, pairing, roster: Object.fromEntries(SEATS.map((s) => [s, setup.roster[s]?.heroId ?? null])), ...g } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 臂與 seeds ────────────────────────────────────────────────────────────────
const SV = await imp("src/platform/contracts/simulationVersion.js");
const FP = SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION];
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: FP };
const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/side_bias_result_challenge_3aB.json"), "utf8"));
const WALK = []; for (let s = 33001; s <= committed.lastSeed; s += 2) WALK.push(s);
/** 某個配對（seed % 5）在走訪區段裡的前 n 個 seed。 */
const seedsOf = (residue, n) => WALK.filter((s) => s % 5 === residue).slice(0, n);
const ARMS = Object.entries(REG.arms).map(([arm, spec]) => {
  const seeds = seedsOf(spec.residue, spec.n ?? REG.seeds[spec.group].perArm);
  return { arm, spec, seeds, runSeeds: spec.baseline ? seeds.slice(0, REG.seeds.baselineRerun) : seeds };
});
const ARM = Object.fromEntries(ARMS.map((x) => [x.arm, x]));
const taskOf = (x, seed) => ({ id: `${x.arm}#${seed}`, key: x.arm, seed, arm: x.arm, spec: x.spec });
const tasks = ARMS.flatMap((x) => x.runSeeds.map((s) => taskOf(x, s)));
if (flag("plan")) {
  console.log(`${ARMS.length} 臂，實跑 ${tasks.length} 場（基準臂只重跑 ${REG.seeds.baselineRerun} 個 seed；走訪 ${WALK[0]}–${WALK.at(-1)} 奇數 seeds，依 seed % 5 取配對）`);
  for (const x of ARMS) console.log(`  ${x.arm.padEnd(24)} 分析 ${String(x.seeds.length).padStart(4)}／實跑 ${String(x.runSeeds.length).padStart(4)}　${JSON.stringify(x.spec)}`);
  process.exit(0);
}
if (!REG.fingerprint.startsWith(FP)) { console.error(`登記的指紋與目前不同（目前 ${FP}）：拒絕`); process.exit(2); }

/** 即時檢查：層、席位清單、鏡像對稱都從引擎讀。 */
const recCheck = (r, t) => {
  const p = [], spec = (t ?? ARM[r.arm])?.spec ?? ARM[r.arm]?.spec;
  if (!spec) return ["unknown arm"];
  if (t && (r.arm !== t.arm || r.seed !== t.seed)) p.push("identity mismatch");
  if (r.engineSeed !== r.seed) p.push("engine seed");
  const x = EXPECT[spec.context];
  if (r.director !== x.director || r.laneFrame !== x.laneFrame) p.push(`frame ${r.director}/${r.laneFrame}`);
  const en = r.engine ?? {};
  const wantSwapped = spec.context === "v21" && objectiveLayoutForSeed(r.seed) === "SWAPPED";
  if (en.skills !== x.skills || en.passives !== x.growth || en.curve !== x.growth || (en.layout === "SWAPPED") !== wantSwapped) p.push("engine layer mismatch");
  const all = x.skills ? SEATS : [], allG = x.growth ? SEATS : [];
  const want = { skillSeats: all.filter((s) => s !== spec.koSkills), passiveSeats: allG.filter((s) => s !== spec.koGrowth), curveSeats: allG.filter((s) => s !== spec.koGrowth) };
  for (const k of Object.keys(want)) if (JSON.stringify(r.t0?.[k] ?? []) !== JSON.stringify([...want[k]].sort())) p.push(`${k} ${JSON.stringify(r.t0?.[k])}`);
  if (spec.mirror) {
    const same = [1, 2, 3, 4, 5].every((k) => r.roster[`b${k}`] === r.roster[`r${k}`] && r.t0.power[`b${k}`] === r.t0.power[`r${k}`] && r.t0.maxHp[`b${k}`] === r.t0.maxHp[`r${k}`]);
    if (!same || !r.t0.directiveSymmetric || !r.t0.identityEqual) p.push("mirror not symmetric at t=0");
  }
  return p;
};
const envBad = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));

//  端點：v21 ⇐ side bias challenge 正向；L1 ⇐ 階梯 L1_frame 正向。
const RK = new Map();
const readKeyCached = (dir, key) => { const k = `${dir}|${key}`; if (!RK.has(k)) RK.set(k, readKey(dir, key)); return RK.get(k); };
function endpointOf(arm, seed) {
  const spec = ARM[arm].spec;
  if (spec.context === "v21") return readKeyCached(FWD, "challenge.v21").get(`challenge.v21#${seed}`);
  if (spec.context === "L1") return readKeyCached(LAD, "L1_frame").get(`L1_frame#${seed}#forward`);
  return null;
}
const BASELINES = ARMS.filter((x) => x.spec.baseline).map((x) => x.arm);

if (flag("validate")) {
  if (envBad.length) { console.error(`環境有 ${envBad.join(",")}：拒絕`); process.exit(2); }
  const VDIR = val("vdir");
  if (!VDIR || insideRepo(VDIR)) { console.error("需要 repo 外的 --vdir"); process.exit(2); }
  let pass = 0, fail = 0;
  const ck = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${ok || !d ? "" : `　${d}`}`); };
  ck(`V0 臂數＝登記（${REG.expectedArms}）、實跑場數＝登記（${REG.expectedMatches}）`, ARMS.length === REG.expectedArms && tasks.length === REG.expectedMatches, `${ARMS.length}／${tasks.length}`);
  const missingEnd = BASELINES.flatMap((arm) => ARM[arm].seeds.filter((s) => !endpointOf(arm, s)).map((s) => `${arm}#${s}`));
  ck(`V1a 基準臂分析用的每個 seed 都有已提交紀錄（${BASELINES.length} 臂）`, missingEnd.length === 0, missingEnd.slice(0, 5).join(","));
  const vTasks = ARMS.flatMap((x) => x.runSeeds.slice(0, x.spec.baseline ? 5 : 2).map((s) => taskOf(x, s)));
  const res = await runStudy({ dir: VDIR, tasks: vTasks, workerFile: SELF, workerArgs: ["--c2-worker"], meta: { ...META, validation: true }, workers: Number(val("workers", 3)), label: "C2 validate", check: recCheck });
  if (res.halted || res.failed || res.lost) ck("驗證批次跑完", false, JSON.stringify(res));
  const diffs = [];
  for (const arm of BASELINES) for (const s of ARM[arm].runSeeds.slice(0, 5)) { const a = readKey(VDIR, arm).get(`${arm}#${s}`), b = endpointOf(arm, s); if (!a || !b || a.winner !== b.winner || a.duration !== b.duration) diffs.push(`${arm}#${s}`); }
  ck(`V1 基準臂（${BASELINES.join("、")}）× 5 seeds 與已提交資料逐場相同（winner、duration）`, diffs.length === 0, diffs.slice(0, 5).join(","));
  const bad = vTasks.map((t) => { const r = readKey(VDIR, t.key).get(t.id); return r ? (recCheck(r, t).length ? `${t.id}:${recCheck(r, t).join("|")}` : null) : `${t.id}:missing`; }).filter(Boolean);
  ck(`V2–V4 每場的層、席位清單（單席關閉恰好少那一席）、鏡像對稱（teamRelative 比 directive、legacyMirror 比旋鈕；identity、power、maxHp）從引擎讀都符合（${vTasks.length} 場）`, bad.length === 0, bad.slice(0, 4).join(" ; "));
  const eqBad = [];
  for (const x of ARMS.filter((y) => y.spec.equalize)) { const { setup } = await armSetup(x.spec, x.seeds[0]); for (let k = 0; k < 5; k++) { const lb = setup.loadout[`b${k + 1}`], lr = setup.loadout[`r${k + 1}`]; if (JSON.stringify(setup.playerSlots.blue[k].stats) !== JSON.stringify(setup.playerSlots.red[k].stats) || lb.level !== lr.level || lb.powerMult !== lr.powerMult || lb.toughMult !== lr.toughMult) eqBad.push(`${x.arm}#${k}`); } }
  ck("V5 拉平臂：兩隊同席位能力值、熟練等級與 powerMult／toughMult 相同（setup 層）", eqBad.length === 0, eqBad.join(","));
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
  const ordered = REG.runOrder.flatMap((g) => tasks.filter((t) => ARM[t.arm].spec.group === g));
  const res = await runStudy({ dir: DIR, tasks: ordered, workerFile: SELF, workerArgs: ["--c2-worker"], meta: META, workers: Number(val("workers", 3)), label: "C2 診斷", check: recCheck });
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
  //  基準臂：分析用已提交紀錄（V1 已證明重跑的 seed 逐場相同）；其他臂用本資料夾。
  const recOf = (arm, s) => (ARM[arm].spec.baseline ? endpointOf(arm, s) : recs[arm].get(`${arm}#${s}`));
  const W = (arm, s) => winOf(recOf(arm, s)?.winner);
  const rateOn = (arm, S) => S.reduce((a, s) => a + W(arm, s), 0) / Math.max(1, S.length);
  const seedsFor = (arm) => ARM[arm].seeds.filter((s) => !errSeeds.has(s));
  const v1 = BASELINES.flatMap((arm) => ARM[arm].runSeeds.filter((s) => { const a = recs[arm].get(`${arm}#${s}`), b = endpointOf(arm, s); return !a || !b || a.winner !== b.winner || a.duration !== b.duration; }).map((s) => `${arm}#${s}`));
  const pp = (x) => (x == null ? "—" : (x * 100).toFixed(1)), z2 = (z) => (z == null ? "—" : z.toFixed(2));
  const ci = (st) => (st ? `${pp(st.mean)}（${pp(st.lo)}..${pp(st.hi)}，z ${z2(st.z)}）` : "—");
  const mdeTxt = (st, zc, label) => (label === "NONE" || label === "HINT" ? `　MDE ${pp(mdeOf(st, zc))}` : "");
  // ① 單席關閉
  const koBlock = (group, key) => {
    const base = ARMS.find((x) => x.spec.group === group && x.spec.baseline && x.spec.context === "v21").arm;
    const rows = ARMS.filter((x) => x.spec.group === group && x.spec[key]).map((x) => {
      const S = seedsFor(x.arm), seat = x.spec[key], d = pairedStats(S.map((s) => W(x.arm, s) - W(base, s)));
      const sg = seat[0] === "b" ? -1 : 1;
      const c = { ...d, mean: sg * d.mean, lo: sg > 0 ? d.lo : -d.hi, hi: sg > 0 ? d.hi : -d.lo, z: d.z == null ? null : sg * d.z };
      const lg = bootstrap(S.length, (I) => sg * (logit(I.reduce((a, i) => a + W(x.arm, S[i]), 0) / I.length) - logit(I.reduce((a, i) => a + W(base, S[i]), 0) / I.length)));
      const label = labelOf(c, BONF.hero), baseWin = rateOn(base, S);
      return { arm: x.arm, seat, hero: recs[x.arm].get(`${x.arm}#${S[0]}`)?.roster?.[seat] ?? null, blueWin: rateOn(x.arm, S), baseBlueWin: baseWin, contribution: c, label,
        mde: mdeOf(c, BONF.hero), ceiling: ceilingOf(seat, baseWin), logitContribution: lg, scale: scaleAgreement(label, lg) };
    });
    //  審查 #6：隊伍合計＝逐 seed 的 Σ(KO_i − base)（乘上方向），仍假設可加
    const S = seedsFor(base), teamSum = (side) => pairedStats(S.map((s) => rows.filter((r) => r.seat[0] === side[0]).reduce((a, r) => a + (side === "blue" ? -1 : 1) * (W(r.arm, s) - W(base, s)), 0)));
    return { base, baseBlueWin: rateOn(base, S), rows, teamSum: { blue: teamSum("blue"), red: teamSum("red") } };
  };
  const koSkills = koBlock("RB", "koSkills"), koGrowth = koBlock("MT", "koGrowth");
  // ② 拉平：I＝(EQ_v21 − EQ_L1) − (v21 − L1)，機率與 logit 兩種尺度
  const eq = ["RB", "MT"].map((g) => {
    const a = (ctx, e) => ARMS.find((x) => x.spec.group === g && x.spec.context === ctx && !!x.spec.equalize === e && !x.spec.koSkills && !x.spec.koGrowth).arm;
    const S = seedsFor(a("v21", true)), [V, L, EV, EL] = [a("v21", false), a("L1", false), a("v21", true), a("L1", true)];
    const I = pairedStats(S.map((s) => (W(EV, s) - W(EL, s)) - (W(V, s) - W(L, s))));
    const r = (arm, I2) => I2.reduce((acc, i) => acc + W(arm, S[i]), 0) / I2.length;
    const lg = bootstrap(S.length, (I2) => (logit(r(EV, I2)) - logit(r(EL, I2))) - (logit(r(V, I2)) - logit(r(L, I2))));
    const label = labelOf(I, BONF.eq);
    return { group: g, pairing: recs[EV].get(`${EV}#${S[0]}`)?.pairing, n: S.length, v21: rateOn(V, S), L1: rateOn(L, S), eqV21: rateOn(EV, S), eqL1: rateOn(EL, S),
      flip: pairedStats(S.map((s) => W(V, s) - W(L, s))), flipEq: pairedStats(S.map((s) => W(EV, s) - W(EL, s))), interaction: I, label, mde: mdeOf(I, BONF.eq), logitInteraction: lg, scale: scaleAgreement(label, lg) };
  });
  // ③ 鏡像：S＝藍勝 − 0.5
  const mirArm = (lu, ctx) => ARMS.find((x) => x.spec.group === "MIR" && x.spec.lineup === lu && x.spec.context === ctx)?.arm ?? null;
  const lineups = [...new Set(ARMS.filter((x) => x.spec.group === "MIR").map((x) => x.spec.lineup))];
  const step = (lu, from, to) => { const a = mirArm(lu, from), b = mirArm(lu, to); if (!a || !b) return null; const S = seedsFor(b).filter((s) => ARM[a].seeds.includes(s)); return { n: S.length, from: rateOn(a, S) - 0.5, to: rateOn(b, S) - 0.5, delta: pairedStats(S.map((s) => W(b, s) - W(a, s))), seeds: S, a, b }; };
  const pooledOf = (steps) => pairedStats(steps.filter(Boolean).flatMap((st) => st.seeds.map((s) => W(st.b, s) - W(st.a, s))));
  const skillSteps = Object.fromEntries(lineups.map((lu) => [lu, step(lu, "L1", "L3a")]).filter(([, v]) => v));
  const growthSteps = Object.fromEntries(lineups.map((lu) => [lu, step(lu, "L3a", "L3")]).filter(([, v]) => v));
  const frameSteps = Object.fromEntries(lineups.map((lu) => [lu, step(lu, "L0", "L1")]).filter(([, v]) => v));
  const pooledSkill = pooledOf(Object.values(skillSteps)), pooledGrowth = pooledOf(Object.values(growthSteps));
  const sideAt = (ctx) => pairedStats(lineups.flatMap((lu) => { const a = mirArm(lu, ctx); return a ? seedsFor(a).map((s) => W(a, s) - 0.5) : []; }));
  //  TD-3A-23：對稱戰術的陣容在 L0 與 L1 應逐場相同（frame 對 legacy 對稱戰術空轉，階梯已見）；不對稱戰術的陣容描述 Δ。
  const identicalFrame = (lu) => { const st = frameSteps[lu]; return st ? st.seeds.every((s) => { const p = recOf(st.a, s), q = recOf(st.b, s); return p && q && p.winner === q.winner && p.duration === q.duration; }) : null; };
  const td = Object.fromEntries(Object.entries(frameSteps).map(([lu, st]) => { const spec = ARM[st.a].spec; return [lu, { tacticAsymmetric: !!spec.laneAsymmetric, n: st.n, sL0: st.from, sL1: st.to, delta: st.delta, label: labelOf(st.delta, BONF.frame), mde: mdeOf(st.delta, BONF.frame), identicalMatchByMatch: identicalFrame(lu) }]; }));
  const tdVerdict = Object.values(td).filter((x) => !x.tacticAsymmetric).every((x) => x.identicalMatchByMatch) ? "TD3A23_CONSISTENT" : "TD3A23_RECHECK";
  const mirror = {
    skillStep: { perLineup: Object.fromEntries(Object.entries(skillSteps).map(([k, v]) => [k, { n: v.n, sL1: v.from, sL3a: v.to, delta: v.delta, label: labelOf(v.delta, BONF.mirrorSkill), mde: mdeOf(v.delta, BONF.mirrorSkill) }])), pooled: pooledSkill, pooledLabel: labelOf(pooledSkill, BONF.mirrorSkill), pooledMde: mdeOf(pooledSkill, BONF.mirrorSkill),
      verdict: mirrorVerdict(pooledSkill, Object.fromEntries(Object.entries(skillSteps).map(([k, v]) => [k, v.delta])), BONF.mirrorSkill) },
    growthStep: { perLineup: Object.fromEntries(Object.entries(growthSteps).map(([k, v]) => [k, { n: v.n, sL3a: v.from, sL3: v.to, delta: v.delta, label: labelOf(v.delta, BONF.mirrorGrowth), mde: mdeOf(v.delta, BONF.mirrorGrowth) }])), pooled: pooledGrowth, pooledLabel: labelOf(pooledGrowth, BONF.mirrorGrowth), pooledMde: mdeOf(pooledGrowth, BONF.mirrorGrowth) },
    sideByContext: Object.fromEntries(["L0", "L1", "L3a", "L3"].map((c) => [c, sideAt(c)])),
    td3a23: { perLineup: td, verdict: tdVerdict },
  };
  const er = errorRule(audit.errored.length, tasks.length);
  const outcome = audit.instrument.length || v1.length || er === "STOP" ? "INSTRUMENT" : er === "INCONCLUSIVE" ? "INCONCLUSIVE" : "DIAGNOSED";
  const out = { schema: "esmo.challenge-c2-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    sideBiasVerdict: "STOP (unchanged; diagnosis only, src/ untouched)",
    statsNote: "paired differences on the same seeds; Bonferroni z: hero 2.81 (10 per pairing), equalization 2.24 (2), mirror skill step 2.58 (4 lineups + pooled), mirror growth step 2.39 (2 + pooled), TD-3A-23 frame step 2.50 (4); MDE = (z + 0.84) x se; logit-scale values by paired bootstrap (2000, deterministic); forward orientation only: effects are conditional on the forward seating (the challenger is blue); logit values clamp probabilities to [0.001, 0.999], so near-ceiling rows (RB red seats, base about 96.5%) are dominated by the clamp and are for reference only",
    matches: tasks.length, errored: audit.errored, instrument: audit.instrument.slice(0, 20), v1Mismatch: v1.slice(0, 20), outcome,
    koSkills: { pairing: "drill_rotation>drill_balanced (v21 skills step +33.2pp)", ...koSkills }, koGrowth: { pairing: "drill_mirror>drill_topheavy (v21 growth step -19.3pp)", ...koGrowth }, equalize: eq, mirror,
    arms: ARMS.map((x) => ({ arm: x.arm, spec: x.spec, n: seedsFor(x.arm).length, ran: x.runSeeds.length, blueWin: rateOn(x.arm, seedsFor(x.arm)), roster: (recs[x.arm].get(`${x.arm}#${x.runSeeds[0]}`) ?? recOf(x.arm, x.seeds[0]))?.roster ?? null })) };
  const OUT = path.join(ROOT, "tools/fixtures/challenge_c2_result_3aB.json");
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`V1 基準臂逐場相同：${v1.length ? `❌ ${v1.length} 場不同` : "✅"}`);
  for (const [lab, blk] of [["單席技能關閉（rotation 藍 > balanced 紅）", koSkills], ["單席成長關閉（mirror 藍 > topheavy 紅）", koGrowth]]) {
    console.log(`\n${lab}　基準藍勝 ${pp(blk.baseBlueWin)}`);
    for (const r of [...blk.rows].sort((a, b) => b.contribution.mean - a.contribution.mean)) console.log(`  ${r.seat} ${String(r.hero).padEnd(14)} 貢獻 ${ci(r.contribution)} ${r.label}${mdeTxt(r.contribution, BONF.hero, r.label)}　上限 ${pp(r.ceiling)}　logit ${r.logitContribution.est.toFixed(2)}（${r.logitContribution.lo.toFixed(2)}..${r.logitContribution.hi.toFixed(2)}）${r.scale === "SCALE_DEPENDENT" ? " SCALE_DEPENDENT" : ""}`);
    console.log(`  隊伍合計（假設可加）：藍隊 ${ci(blk.teamSum.blue)}、紅隊 ${ci(blk.teamSum.red)}`);
  }
  console.log("\n拉平（能力值＋熟練）");
  for (const e of eq) console.log(`  ${e.pairing}　v21 ${pp(e.v21)}／L1 ${pp(e.L1)}　拉平後 v21 ${pp(e.eqV21)}／L1 ${pp(e.eqL1)}　交互作用 ${ci(e.interaction)} ${e.label}${mdeTxt(e.interaction, BONF.eq, e.label)}　logit ${e.logitInteraction.est.toFixed(2)}（${e.logitInteraction.lo.toFixed(2)}..${e.logitInteraction.hi.toFixed(2)}）${e.scale}`);
  console.log("\n鏡像（兩方同隊；S＝藍勝 − 50%）");
  for (const [c, st] of Object.entries(mirror.sideByContext)) if (st.n) console.log(`  合併 S(${c}) ${ci(st)}`);
  for (const [lu, v] of Object.entries(mirror.skillStep.perLineup)) console.log(`  技能層 ${lu.padEnd(13)} n ${v.n}　S(L1) ${pp(v.sL1)} → S(L3a) ${pp(v.sL3a)}　Δ ${ci(v.delta)} ${v.label}${mdeTxt(v.delta, BONF.mirrorSkill, v.label)}`);
  console.log(`  技能層合併 Δ ${ci(pooledSkill)} ${mirror.skillStep.pooledLabel}${mdeTxt(pooledSkill, BONF.mirrorSkill, mirror.skillStep.pooledLabel)} ⇒ ${mirror.skillStep.verdict}`);
  for (const [lu, v] of Object.entries(mirror.growthStep.perLineup)) console.log(`  成長層 ${lu.padEnd(13)} n ${v.n}　S(L3a) ${pp(v.sL3a)} → S(L3) ${pp(v.sL3)}　Δ ${ci(v.delta)} ${v.label}${mdeTxt(v.delta, BONF.mirrorGrowth, v.label)}`);
  console.log(`  成長層合併 Δ ${ci(pooledGrowth)} ${mirror.growthStep.pooledLabel}`);
  for (const [lu, v] of Object.entries(td)) console.log(`  TD-3A-23 ${lu.padEnd(13)}（${v.tacticAsymmetric ? "上下路不對稱戰術" : "對稱戰術"}）S(L0) ${pp(v.sL0)} → S(L1) ${pp(v.sL1)}　Δ ${ci(v.delta)} ${v.label}　逐場相同 ${v.identicalMatchByMatch}`);
  console.log(`  ⇒ ${tdVerdict}`);
  console.log(`\n結果 ${outcome}（side bias 維持 STOP）`);
}
