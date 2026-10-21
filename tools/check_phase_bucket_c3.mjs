// ============================================================================
//  tools/check_phase_bucket_c3.mjs — Phase 3a-C3-2：分時期分桶儀器的自檢（D-19；C3 開工清單 §3.4）
//
//  執行：node tools/check_phase_bucket_c3.mjs（約 1–2 分鐘；跑 4 場真對局，每場兩種儀器各一次）
//
//   P  原始碼：儀器（tools/lib/phaseBucketSim.mjs）不寫時期界線（480／960 及等價寫法），時期一律問 e.director.phase；
//      tacticTruthSim.mjs 沒有被改（真實性表的過期判定靠它的雜湊）——只比對它被 import、沒有被本儀器 import 以外的方式動到。
//   B  邊界：Director 的 phase(479.5)=0、phase(480)=1、phase(959.5)=1、phase(960)=2（dt 0.5 的 tick 結束時刻）；
//      每場紀錄的 firstTick＝[0.5, 480, 960]（比賽夠長時），phaseSecs[0]＝min(長度, 479.5)、phaseSecs[1]＝min(max(長度−479.5, 0), 480)。
//   S  自檢（每場、每側）：三桶相加＝獨立累加的整場值（engages／engageStarts／fights）；exec 五項三桶相加＝引擎自己的整場累計；
//      phaseSecs 相加＝比賽長度。
//   X  跨儀器：同一 seed、同一規則集、同樣的輸入，用真實性表的儀器（tacticTruthSim.runTruthMatch，未改動）跑一次 ⇒
//      整場 engages／engageStarts＝本儀器三桶相加；fights 每一個時期逐桶相同（tacticTruthSim 本來就以 Director 分 fights）；
//      比賽長度、勝方、擊殺數相同（兩個儀器都只讀，不影響對局）。
//   R  比率重算：ratePerMin＝該桶事件數 ÷（該桶秒數 ÷ 60），不是整場比率；不足 60 秒 ⇒ null（人工紀錄）。
//   D  決定性：同一 seed 跑兩次 ⇒ 紀錄逐欄相同（對照組逐場可重算）；對照組的 legacy 路徑與 std 輸入的對局逐欄相同。
//   A  臂：8 個時期姿態選擇各自的引擎輸入（toEngineTactic＋toEngineTacticIdentity）與對照組相比，**只有** identity.phaseEngage／phaseJoin
//      在該時期的索引不同，值＝MobaTacticConfig 的表（不在這裡改任何係數）；對照組內容＝STANDARD_OPP_TACTIC。
//   N  負向自檢：把紀錄的一桶加一 ⇒ S 轉紅；把 480 植入儀器原始碼 ⇒ P 轉紅。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/stripComments.mjs";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const J = (x) => JSON.stringify(x);

const LIB = "tools/lib/phaseBucketSim.mjs";
const RULESET = "balanceTool.v21";
const SEEDS = [21, 22, 23];
process.env.ESMO_BALANCE_RULESET = RULESET;          // tacticTruthSim 走 runner 的預設規則集（呼叫當下讀）⇒ 兩個儀器同一規則集

// ── P 原始碼 ──
const libCode = stripComments(read(LIB));
const edgeRe = /(?<![\w.])(?:480|960)(?:\.0+)?(?![\w.])|\b(?:8|16)\s*\*\s*60\b|\b60\s*\*\s*(?:8|16)\b|4\.8e2|48e1|9\.6e2|96e1|0x1e0|0x3c0/i;
const edgeOk = (code) => !edgeRe.test(code) && /e\.director\.phase\(/.test(code);
ck("P1 儀器不寫時期界線（480／960 與等價寫法），時期一律問 e.director.phase", edgeOk(libCode));
ck("P2 儀器只 import tacticTruthSim 的 tacticInputOf（不複製一份輸入轉換），且不 import 引擎", /import\s*\{\s*tacticInputOf\s*\}\s*from\s*["']\.\/tacticTruthSim\.mjs["']/.test(libCode) && !/LogicEngine/.test(libCode));

const PB = await imp(LIB);
const TS = await imp("tools/lib/tacticTruthSim.mjs");

// ── B／S／X／D：真對局 ──
const recs = [];
for (const seed of SEEDS) recs.push(await PB.runPhaseMatch(seed, { ruleset: RULESET }));
//  第 4 場：有臂（藍方後期 scaling），確認 legacy 路徑也能跑、自檢也成立。
const armLate = await PB.phaseStanceArm("phases.late.stance", "scaling");
recs.push(await PB.runPhaseMatch(SEEDS[0], { ruleset: RULESET, blue: armLate }));
ck("B0 每場都是 balanceTool.v21／Director core.v1，且至少一場進入後期（≥ 960 秒）", recs.every((r) => r.ruleset === RULESET && r.directorMode === "core.v1") && recs.some((r) => r.duration >= 960),
  recs.map((r) => `${r.seed}:${r.duration}s`).join(" "));
{
  const D = (await imp("src/battle/moba/tactics/tacticalDirector.js")).createTacticalDirector({ blue: {}, red: {} });
  const P = [[0.5, 0], [479.5, 0], [480, 1], [959.5, 1], [960, 2], [3600, 2]];
  ck(`B1 Director 時期界線（tick 結束時刻）：${P.map(([t, p]) => `${t}→${p}`).join("、")}`, P.every(([t, p]) => D.phase(t) === p));
}
ck("B2 每場 firstTick＝[0.5, 480, 960]（未進入的時期為 null）", recs.every((r) => r.firstTick[0] === 0.5 && r.firstTick[1] === (r.duration >= 480 ? 480 : null) && r.firstTick[2] === (r.duration >= 960 ? 960 : null)),
  recs.map((r) => r.firstTick.join("/")).join(" ｜ "));
ck("B3 每場 phaseSecs＝[min(長度, 479.5), min(max(長度−479.5, 0), 480), 其餘]", recs.every((r) => {
  const a = Math.min(r.duration, 479.5), b = Math.min(Math.max(r.duration - 479.5, 0), 480);
  return r.phaseSecs[0] === a && r.phaseSecs[1] === b && Math.abs(r.phaseSecs[2] - (r.duration - a - b)) < 1e-9;
}), recs.map((r) => r.phaseSecs.join("/")).join(" ｜ "));
const probs = recs.flatMap((r) => PB.selfCheck(r).map((x) => `${r.seed}: ${x}`));
ck("S1 每場每側：engages／engageStarts／fights／exec 五項的三桶相加＝獨立的整場值；phaseSecs 相加＝長度", probs.length === 0, probs.slice(0, 3).join(" ｜ "));
ck("S2 有事件可數（不是全 0 的空檢查）：每場兩側整場 engages > 0、engageStarts > 0", recs.every((r) => ["blue", "red"].every((s) => r[s].whole.engages > 0 && r[s].whole.engageStarts > 0)));
const xs = [];
for (const seed of SEEDS) {
  const r = recs.find((x) => x.seed === seed && x === recs[SEEDS.indexOf(seed)]);
  const t = await TS.runTruthMatch(seed, {});
  for (const side of ["blue", "red"]) {
    const s = r[side], u = t[side], sum = (a) => a[0] + a[1] + a[2];
    if (sum(s.engages) !== u.engages) xs.push(`${seed}.${side} engages ${sum(s.engages)}≠${u.engages}`);
    if (sum(s.engageStarts) !== u.engageStarts) xs.push(`${seed}.${side} engageStarts ${sum(s.engageStarts)}≠${u.engageStarts}`);
    if (J(s.fights) !== J(u.fights)) xs.push(`${seed}.${side} fights ${s.fights}≠${u.fights}`);
    for (const k of PB.EXEC_KEYS) if (s.execFinal[k] !== u.exec[k]) xs.push(`${seed}.${side} exec.${k} ${s.execFinal[k]}≠${u.exec[k]}`);
  }
  if (r.duration !== t.duration || r.winner !== t.winner || r.kills !== t.kills || J(r.phaseSecs) !== J(t.phaseSecs)) xs.push(`${seed} 對局不同：${r.duration}/${r.winner}/${r.kills} vs ${t.duration}/${t.winner}/${t.kills}`);
}
ck("X1 跨儀器（tacticTruthSim，未改動）：整場 engages／engageStarts＝三桶相加、fights 逐桶相同、exec 整場相同、對局長度／勝方／擊殺／phaseSecs 相同", xs.length === 0, xs.slice(0, 3).join(" ｜ "));
const again = await PB.runPhaseMatch(SEEDS[1], { ruleset: RULESET });
ck("D1 同一 seed 跑兩次 ⇒ 紀錄逐欄相同", J(again) === J(recs[1]));
{
  const ctrlArm = await PB.phaseStanceArm(null, null);
  const viaLegacy = await PB.runPhaseMatch(SEEDS[1], { ruleset: RULESET, blue: ctrlArm, red: ctrlArm });
  ck("D2 對照組走 legacy 路徑（std 模板不加選擇）與 std 輸入的對局逐欄相同（路徑本身不影響結果）", J(viaLegacy) === J(recs[1]));
}

// ── R 比率重算 ──
{
  const r = recs.find((x) => x.duration >= 1100) ?? recs[0];
  const ok = ["blue", "red"].every((s) => PB.PHASE_NAMES.every((ph, p) => {
    const v = PB.phaseMetricValue(r, s, `engageDecisionsPerMin.${ph}`), w = PB.phaseMetricValue(r, s, `engageStartsPerMin.${ph}`);
    const exp = (n) => (r.phaseSecs[p] >= 60 ? n / (r.phaseSecs[p] / 60) : null);
    return v === exp(r[s].engages[p]) && w === exp(r[s].engageStarts[p]);
  }));
  ck("R1 每分鐘比率＝該桶事件數 ÷（該桶秒數 ÷ 60），逐時期重算", ok);
  const whole = r.blue.whole.engages / (r.duration / 60);
  const mean3 = PB.PHASE_NAMES.map((ph) => PB.phaseMetricValue(r, "blue", `engageDecisionsPerMin.${ph}`)).filter((x) => x !== null);
  ck("R2 時期比率不是整場比率（至少一個時期與整場比率不同）", mean3.some((x) => Math.abs(x - whole) > 1e-9));
  const fake = { phaseSecs: [479.5, 480, 59.5], blue: { engages: [10, 20, 3], engageStarts: [5, 6, 1], fights: [1, 1, 1] }, red: { engages: [0, 0, 0], engageStarts: [0, 0, 0], fights: [0, 0, 0] } };
  ck("R3 不足 60 秒的時期 ⇒ null；剛好 60 秒 ⇒ 有值；0 事件 ⇒ 0（不是 null）",
    PB.phaseMetricValue(fake, "blue", "engageDecisionsPerMin.late") === null
    && PB.phaseMetricValue({ ...fake, phaseSecs: [479.5, 480, 60] }, "blue", "engageStartsPerMin.late") === 1
    && PB.phaseMetricValue(fake, "red", "engageDecisionsPerMin.mid") === 0);
  let threw = 0;
  for (const id of ["engageDecisionsPerMin", "engageDecisionsPerMin.all", "fightEntriesPerMin.early"]) { try { PB.phaseMetricValue(fake, "blue", id); } catch { threw++; } }
  ck("R4 未登記的指標 id ⇒ 丟錯（不默默回 null）", threw === 3);
}

// ── A 臂 ──
{
  const TC = await imp("src/platform/contracts/MobaTacticConfig.js");
  const ctrl = await PB.phaseStanceArm(null, null);
  ck("A0 對照組（std 模板、不加選擇）內容＝STANDARD_OPP_TACTIC", J(ctrl.legacyConfig) === J(TC.STANDARD_OPP_TACTIC));
  const OPTIONS = [["early", "aggressive", 0.08], ["early", "defensive", -0.08], ["early", "scaling", -0.05],
    ["mid", "aggressive", 0.08], ["mid", "defensive", -0.08], ["mid", "scaling", -0.05], ["late", "defensive", -0.08], ["late", "scaling", 0.08]];
  const bad = [];
  const k0 = J(TC.toEngineTactic(ctrl.legacyConfig)), i0 = TC.toEngineTacticIdentity(ctrl.legacyConfig);
  for (const [ph, choice, v] of OPTIONS) {
    const arm = await PB.phaseStanceArm(`phases.${ph}.stance`, choice);
    const idx = PB.PHASE_NAMES.indexOf(ph);
    const k = J(TC.toEngineTactic(arm.legacyConfig)), i = TC.toEngineTacticIdentity(arm.legacyConfig);
    const expPE = i0.phaseEngage.map((x, j) => (j === idx ? v : x)), expPJ = expPE.map((x) => x * 0.5);
    const rest = (o) => J({ ...o, phaseEngage: null, phaseJoin: null });
    if (k !== k0) bad.push(`${ph}.${choice} knobs 不同`);
    if (J(i.phaseEngage) !== J(expPE) || J(i.phaseJoin) !== J(expPJ)) bad.push(`${ph}.${choice} phaseEngage ${J(i.phaseEngage)}`);
    if (rest(i) !== rest(i0)) bad.push(`${ph}.${choice} 其他 identity 欄位不同`);
  }
  ck("A1 8 個時期姿態：與對照組相比只有 identity.phaseEngage／phaseJoin 在該時期的索引不同，值＝MobaTacticConfig 的表（+0.08／−0.08／−0.05；後期 scaling +0.08）", bad.length === 0, bad.slice(0, 3).join(" ｜ "));
  let threw = false;
  try { await PB.phaseStanceArm("lanes.top.stance", "split"); } catch { threw = true; }
  ck("A2 非時期姿態的維度 ⇒ 丟錯", threw);
}

// ── N 負向自檢 ──
{
  const r = structuredClone(recs[0]);
  r.blue.engages[1]++;
  ck("N1 把一桶加一 ⇒ S1 轉紅", PB.selfCheck(r).length > 0);
  const r2 = structuredClone(recs[0]); r2.red.exec[2].dragonContests++;
  ck("N2 把 exec 一桶加一 ⇒ S1 轉紅", PB.selfCheck(r2).length > 0);
  ck("N3 把 `t < 480` 植入儀器原始碼 ⇒ P1 轉紅；`8 * 60` 亦同；只在註解裡 ⇒ 不紅",
    !edgeOk(libCode + "\nconst q = t < 480;") && !edgeOk(libCode + "\nconst q = t < 8 * 60;") && edgeOk(stripComments(read(LIB) + "\n// t < 480\n")));
}

console.log(`\nPhase Bucket C3：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
