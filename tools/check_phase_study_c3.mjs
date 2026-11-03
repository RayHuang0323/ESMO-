// ============================================================================
//  tools/check_phase_study_c3.mjs — Phase 3a-C3-3／C4／C5 量測儀器（tools/lib/phaseStudySim.mjs）的自檢（約 1 分鐘，跑 5 場）
//
//   L  層：skills／passives／curves 開、talents 關；balanceTool.v21、core.v1、teamRelative。
//   W  _joinV3 的觀察包裝不改對局：同一場「包裝」與 runner 原樣跑（phaseBucketSim）的長度、勝方、擊殺、每時期接戰數逐欄相同。
//   X  跨儀器：每時期 engages／engageStarts＝phaseBucketSim（已驗證的分時期儀器）；秒數相同。
//      X2：每時期「一般熱點」參團擲骰成功（joinGoGeneralStarts）三桶相加＝c7DiagSim 的 goStarts.general（C7 §4-B 判讀用的同一定義），且每桶 ≤ joinGoStarts。
//      X3：G-A7 真實性儀器（tacticTruthSim v6）的每時期指標＝本儀器（同 seed、同輸入、balanceTool.v21）：集結、出現占比、圍塔窗口、
//          己方路名的抓人占比與每分鐘抓人——新 live 維度的冒煙層與 n=400 複驗量的是同一個東西。
//   S  自檢：爭奪三桶相加＝引擎 exec；抓人（己方路名）三路三桶相加＝引擎世界路總數；兩側物件出現次數相同；秒數＝長度。
//   G  己方路名：紅方的抓人以 sideRelativeLane 換算（紅方世界上路＝己方下路）——用一場紅方「中期強邊＝上路」的輸入，
//      引擎交給紅方的權重在世界下路，而儀器記到的是紅方**己方上路**比例上升的那一路（單場方向檢查，不是統計）。
//   P  每時期選擇真的有進引擎：中期巨龍第一的藍方，中期 dragonJoin 高於前期。
//   M  指標：合併桶（early+mid）＝分子分母各自相加；沒有分母 ⇒ null；未知指標 ⇒ 丟錯。
// ============================================================================
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const J = (x) => JSON.stringify(x);
process.env.ESMO_BALANCE_SKILLS = "on";
delete process.env.ESMO_BALANCE_TALENTS;
const RULESET = "balanceTool.v21";

const PS = await imp("tools/lib/phaseStudySim.mjs");
const PB = await imp("tools/lib/phaseBucketSim.mjs");
const ctrl = await PS.studyInput();
const SEEDS = [41, 42];
const recs = [];
for (const s of SEEDS) recs.push(await PS.runPhaseStudyMatch(s, { blue: ctrl, red: ctrl, ruleset: RULESET }));
ck("L1 層＝技能／被動／成長曲線開、天賦關；balanceTool.v21／core.v1／teamRelative",
  recs.every((r) => r.layers.heroSkills && r.layers.heroPassives && r.layers.heroPowerCurve && !r.layers.battleTalents && r.ruleset === RULESET && r.directorMode === "core.v1" && r.laneFrame === "teamRelative"), J(recs[0].layers));

const bad = [];
for (const r of recs) {
  const b = await PB.runPhaseMatch(r.seed, { ruleset: RULESET, blue: { legacyConfig: ctrl.config }, red: { legacyConfig: ctrl.config } });
  if (r.duration !== b.duration || r.winner !== b.winner || r.kills !== b.kills) bad.push(`${r.seed} match differs`);
  for (const s of ["blue", "red"]) if (J(r[s].engages) !== J(b[s].engages) || J(r[s].engageStarts) !== J(b[s].engageStarts)) bad.push(`${r.seed}.${s} engages`);
  if (J(r.phaseSecs) !== J(b.phaseSecs)) bad.push(`${r.seed} phaseSecs`);
}
ck("W1／X1 包裝不改對局；每時期接戰數與秒數＝phaseBucketSim（未包裝）", bad.length === 0, bad.slice(0, 3).join(" ｜ "));
{
  const CD = await imp("tools/lib/c7DiagSim.mjs");
  const arm = await CD.diagArm("teamfight.grouping", null);
  const bad2 = [];
  let generalTotal = 0;
  for (const r of recs) {
    const d = await CD.runDiagMatch(r.seed, { blue: arm, red: arm, ruleset: RULESET });
    if (d.duration !== r.duration || d.winner !== r.winner) bad2.push(`${r.seed} match differs`);
    for (const s of ["blue", "red"]) {
      const g = r[s].joinGoGeneralStarts, a = r[s].joinGoStarts, sum = g[0] + g[1] + g[2];
      generalTotal += sum;
      if (sum !== d[s].goStarts.general) bad2.push(`${r.seed}.${s} general ${sum}≠${d[s].goStarts.general}`);
      if (g.some((x, i) => x > a[i])) bad2.push(`${r.seed}.${s} general>all`);
    }
  }
  ck("X2 一般熱點擲骰成功：三桶相加＝c7DiagSim goStarts.general（同場、同定義），每桶 ≤ 全部", bad2.length === 0 && generalTotal > 0, bad2.length ? bad2.slice(0, 3).join(" ｜ ") : `general 總數 ${generalTotal}`);
}
{
  //  X3（Phase 3a-C 升級 live）：真實性儀器 v6 與本儀器逐值相同（v6 起含強邊 ganksOwnPerMin 與勝利條件的 seatFightEntriesPerMin.<seat>.<p+p>）。
  const TS = await imp("tools/lib/tacticTruthSim.mjs");
  const XM = ["joinGoGeneralStartsPerMin.early", "joinGoGeneralStartsPerMin.mid", "joinGoGeneralStartsPerMin.late",
    "contestShare.dragon.early", "contestShare.dragon.mid", "contestShare.dragon.late", "contestShare.dragon.early+mid+late",
    "contestShare.baron.mid", "contestShare.baron.late", "contestShare.baron.early+mid+late",
    "siegeWindowsPerMin.early", "siegeWindowsPerMin.mid", "siegeWindowsPerMin.late",
    ...["top", "mid", "bot"].flatMap((l) => ["early", "mid", "late"].map((p) => `gankShare.${l}.${p}`)), "ganksPerMin.early", "ganksPerMin.mid", "ganksPerMin.late",
    ...["top", "mid", "bot"].flatMap((l) => ["early", "mid", "late"].map((p) => `ganksOwnPerMin.${l}.${p}`)),
    ...["b1", "b3", "b4"].flatMap((b) => ["early", "mid", "late", "mid+late"].map((p) => `seatFightEntriesPerMin.${b}.${p}`))];
  const arm = { templateId: "std", choices: { phases: { mid: { grouping: "group", objectiveOrder: "dragon" } } } };
  const bad3 = [];
  let compared = 0;
  for (const seed of [3, 11]) {
    const rt = await TS.runTruthMatch(seed, { blue: arm, red: null, ruleset: "balanceTool.v21" });
    const rp = await PS.runPhaseStudyMatch(seed, { blue: TS.tacticInputOf(arm), red: TS.tacticInputOf(null), ruleset: "balanceTool.v21" });
    for (const side of ["blue", "red"]) for (const m of XM) { compared++; const a = TS.metricValue(rt, side, m), b = PS.studyMetricValue(rp, side, m); if (a !== b) bad3.push(`${seed}/${side}/${m}: ${a}≠${b}`); }
  }
  ck(`X3 真實性儀器 v6 的每時期指標＝本儀器（2 場 × 2 側 × ${XM.length} 個指標，同 seed、同輸入、balanceTool.v21）`, bad3.length === 0 && compared === 4 * XM.length && TS.TRUTH_SIM_VERSION === "tacticTruthSim.v6", bad3.slice(0, 3).join(" ｜ "));
}
const sc = recs.flatMap((r) => PS.selfCheck(r).map((x) => `${r.seed}: ${x}`));
ck("S1 爭奪／抓人三桶相加＝引擎整場值；兩側出現次數相同；秒數＝長度", sc.length === 0, sc.slice(0, 3).join(" ｜ "));
ck("S2 有東西可數：每場都有巨龍出現、兩側都有抓人、有一般熱點的參團擲骰成功", recs.every((r) => r.blue.objApps.dragon.some((x) => x > 0) && ["blue", "red"].every((s) => PS.studyMetricValue(r, s, "ganksPerMin.early") !== null) && (r.blue.joinGoStarts.some((x) => x > 0) || r.red.joinGoStarts.some((x) => x > 0))));

{
  //  G：紅方中期強邊＝上路（己方）⇒ 引擎權重在世界下路；儀器把世界下路的抓人記成紅方己方上路。
  const red = await PS.studyInput({}, { mid: { focusLane: "top" } });
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const M = await modules();
  const { e } = configure(43, "standard", M, 1, null, { blue: ctrl, red }, RULESET);
  e.t = 600; const g = e.director.knobs("red"); e.t = 0;
  const gd = await imp("src/gameData.js");
  ck("G1 紅方中期強邊＝上路：引擎的 gankFocusLane 是世界下路（C5R）；sideRelativeLane(red, bot)＝top（儀器的換算方向）", g.gankFocusLane === "bot" && g.gankFocusAdd > 0 && gd.sideRelativeLane("red", "bot") === "top", J({ lane: g.gankFocusLane, add: g.gankFocusAdd }));
  const r = await PS.runPhaseStudyMatch(43, { blue: ctrl, red, ruleset: RULESET });
  ck("G2 換算後的紅方抓人三路相加＝引擎世界三路相加（中期）", PS.selfCheck(r).length === 0);
}
{
  const b = await PS.studyInput({}, { mid: { objectiveOrder: "dragon" } });
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const M = await modules();
  const { e } = configure(44, "standard", M, 1, null, { blue: b, red: ctrl }, RULESET);
  const at = (t) => { e.t = t; return e.director.knobs("blue").dragonJoin; };
  ck("P1 每時期選擇真的進了引擎：中期巨龍第一的藍方 dragonJoin 中期 > 前期＝後期", at(600) > at(100) && at(100) === at(1200), `${at(100)}/${at(600)}/${at(1200)}`);
}
{
  const fake = { phaseSecs: [479.5, 480, 59.5], blue: { objApps: { dragon: [1, 2, 0], baron: [0, 0, 0] }, objContested: { dragon: [1, 1, 0], baron: [0, 0, 0] }, objCaptured: { dragon: [0, 1, 0], baron: [0, 0, 0] },
    siegeOpens: [0, 4, 1], joinGoStarts: [2, 0, 0], laneGeneralEntries: [0, 0, 0], engages: [0, 0, 0], engageStarts: [0, 0, 0], ganksOwn: { top: [1, 0, 0], mid: [1, 0, 0], bot: [2, 0, 0] } } };
  let threw = false; try { PS.studyMetricValue(fake, "blue", "nope.x"); } catch { threw = true; }
  ck("M1 合併桶 early+mid＝(1+1)/(1+2)；baron 沒出現 ⇒ null；後期不足 60 秒 ⇒ null；gankShare 己方比例；未知指標丟錯",
    Math.abs(PS.studyMetricValue(fake, "blue", "contestShare.dragon.early+mid") - 2 / 3) < 1e-12 && PS.studyMetricValue(fake, "blue", "contestShare.baron.mid") === null
    && PS.studyMetricValue(fake, "blue", "siegeWindowsPerMin.late") === null && PS.studyMetricValue(fake, "blue", "gankShare.bot.early") === 0.5 && threw);
}
console.log(`\nPhase Study C3：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
