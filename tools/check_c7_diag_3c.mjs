// ============================================================================
//  tools/check_c7_diag_3c.mjs — Phase 3a-C：C7 診斷儀器（tools/lib/c7DiagSim.mjs）的自檢（約 1–2 分鐘，跑 6 場真對局）
//
//   L  層：skills／passives／curves 開、talents 關；規則集 balanceTool.v21、Director core.v1。
//   W  §4-B 的 _joinV3 包裝只觀察：包裝與不包裝的對局逐欄相同（長度、勝方、擊殺、巴龍／巨龍爭奪、取得數）。
//   X  跨儀器（未改動的 tacticTruthSim，同 seed 同規則集）：
//      laneForward.top／mid＝tacticTruthSim 的 laneForward.top／mid；objectiveFightEntriesPerMin.baron＝其 objFights.baron ÷ 分；
//      一般＋物件窗的進入團戰次數＝其 fights 三桶總和；爭奪次數＝其 exec。
//   （2026-10-22 審查後：4-B 讀 joinGo 由 false 變 true 與上中下路的進入團戰；熱點以參照分類；4-D 距離取每一次進入團戰。）
//   C  取得數＝objectiveLog 中該側的大型物件擊殺數（獨立重讀快照的 objectiveLog 驗證：不超過 40 筆時逐筆相同）。
//   A  臂：4 個選項各自只改到該維度在 Registry 宣告的 resolverFields 範圍內的引擎欄位；中性抓人臂只把 gankWeights 換成 {1,1,1}。
//   N  負向自檢：竄改一個計數 ⇒ X 轉紅。
// ============================================================================
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const J = (x) => JSON.stringify(x);
const RULESET = "balanceTool.v21";
process.env.ESMO_BALANCE_RULESET = RULESET;
process.env.ESMO_BALANCE_SKILLS = "on";
delete process.env.ESMO_BALANCE_TALENTS;

const D = await imp("tools/lib/c7DiagSim.mjs");
const TS = await imp("tools/lib/tacticTruthSim.mjs");
const ctrl = await D.diagArm(null, null);
const SEEDS = [31, 32];
const recs = [];
for (const s of SEEDS) recs.push(await D.runDiagMatch(s, { blue: ctrl, red: ctrl, ruleset: RULESET }));
ck("L1 層＝技能／被動／成長曲線開、天賦關；balanceTool.v21／core.v1", recs.every((r) => r.layers.heroSkills && r.layers.heroPassives && r.layers.heroPowerCurve && !r.layers.battleTalents && r.ruleset === RULESET && r.directorMode === "core.v1"), J(recs[0].layers));

const unwrapped = await D.runDiagMatch(SEEDS[0], { blue: ctrl, red: ctrl, ruleset: RULESET, wrapJoin: false });
const sig = (r) => J([r.duration, r.winner, r.kills, ["blue", "red"].map((s) => [r[s].contests, r[s].captures, r[s].entries, r[s].baronEntries])]);
ck("W1 _joinV3 包裝只觀察：包裝與不包裝的對局逐欄相同", sig(unwrapped) === sig(recs[0]));
ck("W2 包裝真的有記到擲骰（不是空包）：兩側一般熱點擲骰 > 0", recs.every((r) => r.blue.rolls.general > 0 && r.red.rolls.general > 0), recs.map((r) => `${r.blue.rolls.general}/${r.red.rolls.general}`).join(" "));

const xs = [];
const cross = (r, t) => {
  const out = [];
  const near = (a, b) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) < 1e-9);
  for (const s of ["blue", "red"]) {
    for (const L of ["top", "mid"]) if (!near(D.diagMetricValue(r, s, `laneForward.${L}`), TS.metricValue(t, s, `laneForward.${L}`))) out.push(`${r.seed}.${s} laneForward.${L}`);
    if (!near(D.diagMetricValue(r, s, "objectiveFightEntriesPerMin.baron"), TS.metricValue(t, s, "objectiveFightEntriesPerMin.baron"))) out.push(`${r.seed}.${s} baron entries`);
    const fights = t[s].fights[0] + t[s].fights[1] + t[s].fights[2];
    if (r[s].entries.general + r[s].entries.objective !== fights) out.push(`${r.seed}.${s} entries ${r[s].entries.general}+${r[s].entries.objective}≠${fights}`);
    if (r[s].contests.baron !== t[s].exec.baronContests || r[s].contests.dragon !== t[s].exec.dragonContests) out.push(`${r.seed}.${s} contests`);
  }
  if (r.duration !== t.duration || r.winner !== t.winner) out.push(`${r.seed} match differs`);
  return out;
};
const truths = [];
for (const s of SEEDS) truths.push(await TS.runTruthMatch(s, {}));
recs.forEach((r, i) => xs.push(...cross(r, truths[i])));
ck("X1 跨儀器（tacticTruthSim，未改動）：laneForward、巴龍坑邊進入、進入團戰總數、爭奪次數、對局逐欄相同", xs.length === 0, xs.slice(0, 3).join(" ｜ "));

{
  //  取得數：獨立重跑一場，到結束時讀快照 objectiveLog（≤ 40 筆時就是全部）。
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const M = await modules();
  const { e } = configure(SEEDS[1], "standard", M, 1, null, { blue: TS.tacticInputOf(ctrl), red: TS.tacticInputOf(ctrl) }, RULESET);
  for (let i = 1; i * 0.5 <= 3600 && !e.over; i++) e.tick(0.5);
  const log = e.objectiveLog, full = (e._objLogSeq ?? 0) === log.length;
  const cnt = (side, key) => log.filter((x) => x.side === side && x.key === key).length;
  const r = recs[1];
  const sum3 = (a) => a[0] + a[1] + a[2];
  ck("C2 C4 觀測：每次出現的爭奪三桶相加＝引擎 exec 爭奪總數（每次重生最多一次）；取得三桶相加＝取得數；每側出現次數相同",
    recs.every((x) => ["blue", "red"].every((s) => ["dragon", "baron"].every((k) => sum3(x[s].objContested[k]) === x[s].contests[k] && sum3(x[s].objCaptured[k]) === x[s].captures[k]))
      && J(x.blue.objApps) === J(x.red.objApps)), recs.map((x) => `${J(x.blue.objApps)} c${J(x.blue.contests)}`).join(" ｜ "));
  ck("C1 取得數＝objectiveLog 該側的巨龍／巴龍擊殺數（獨立重跑、讀完整紀錄）", full && ["blue", "red"].every((s) => r[s].captures.dragon === cnt(s, "dragon") && r[s].captures.baron === cnt(s, "baron")),
    `${J(r.blue.captures)} ${J(r.red.captures)}${full ? "" : "（紀錄超過 40 筆，無法比對）"}`);
}

{
  const TC = await imp("src/platform/contracts/MobaTacticConfig.js");
  const REG = await imp("src/platform/tactics/capabilityRegistry.js");
  const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o ?? {})) { const q = p ? `${p}.${k}` : k; if (v && typeof v === "object" && !Array.isArray(v)) flat(v, q, out); else out[q] = J(v); } return out; };
  const engineOf = (cfg) => ({ knobs: flat(TC.toEngineTactic(cfg)), identity: flat(TC.toEngineTacticIdentity(cfg)) });
  const base = engineOf(ctrl.legacyConfig);
  const bad = [];
  for (const [dim, choice] of [["teamfight.grouping", "tight"], ["objectives.baron", "high"], ["lanes.top.stance", "defensive"], ["lanes.mid.stance", "aggressive"]]) {
    const arm = await D.diagArm(dim, choice), eng = engineOf(arm.legacyConfig);
    const changed = [...Object.keys(eng.knobs).filter((k) => eng.knobs[k] !== base.knobs[k]).map((k) => `knobs.${k}`), ...Object.keys(eng.identity).filter((k) => eng.identity[k] !== base.identity[k]).map((k) => `identity.${k}`)];
    const row = REG.registryRow(dim), allowed = row?.resolverFields ?? [];
    const okField = (f) => allowed.some((a) => f === a || f.startsWith(`${a}.`) || a.startsWith(`${f}.`));
    if (!changed.length) bad.push(`${dim}=${choice} 沒有改到任何引擎欄位`);
    for (const f of changed) if (!okField(f)) bad.push(`${dim}=${choice} 改到 ${f}（不在 resolverFields ${allowed.join(",")}）`);
  }
  ck("A1 4 個選項的臂都有改到引擎欄位，而且只在 Registry 宣告的 resolverFields 範圍內", bad.length === 0, bad.slice(0, 3).join(" ｜ "));
  const midArm = await D.diagArm("lanes.mid.stance", "aggressive");
  const ng = await D.runDiagMatch(SEEDS[0], { blue: midArm, red: ctrl, ruleset: RULESET, neutralGankSide: "blue" });
  const plain = await D.runDiagMatch(SEEDS[0], { blue: midArm, red: ctrl, ruleset: RULESET });
  //  直接看引擎：中性化之後，任何時期交給引擎的藍方 knobs 的 gankWeights 都是 {1,1,1}（三個時期同一個物件）。
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const Mm = await modules();
  const { e } = configure(SEEDS[0], "standard", Mm, 1, null, { blue: TS.tacticInputOf(midArm), red: TS.tacticInputOf(ctrl) }, RULESET);
  const before = J(e.director.knobs("blue").gankWeights);
  e.director.knobs("blue").gankWeights = { top: 1, mid: 1, bot: 1 };
  const atT = (t) => { e.t = t; const g = J(e.director.knobs("blue").gankWeights); e.t = 0; return g; };
  ck("A2 中性抓人臂：中路 aggressive 本來的 gankWeights 不是 {1,1,1}；換掉後 0／600／1200 秒交給引擎的都是 {1,1,1}；對局與未中性化不同",
    before !== J({ top: 1, mid: 1, bot: 1 }) && [0, 600, 1200].every((t) => atT(t) === J({ top: 1, mid: 1, bot: 1 })) && sig(ng) !== sig(plain), `本來 ${before}`);
}

{
  const t = structuredClone(truths[0]); t.blue.fights[1] += 1;
  ck("N1 竄改 tacticTruthSim 一個 fights 桶 ⇒ X1 轉紅", cross(recs[0], t).length > 0);
}
console.log(`\nC7 Diag 3c：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
