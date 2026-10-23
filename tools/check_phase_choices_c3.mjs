// ============================================================================
//  tools/check_phase_choices_c3.mjs — Phase 3a-C 每時期方針基礎建設（PHASE_CHOICE_MAPPING → Resolver → setup／組裝器 → Director）
//
//  執行：node tools/check_phase_choices_c3.mjs（秒級；只 configure，不跑 tick）
//
//   M  對照表：每個值都是 source 指名的既有模板在同一欄位上的值；前期沒有巴龍；集結沒有「分散」；強邊用己方路名。
//   R  Resolver：沒有每時期選擇 ⇒ 三份共用整場物件（R-4）；單一選擇 ⇒ 只有那一個時期是新物件，改到的引擎欄位恰好是宣稱的那幾個，
//      而且值＝整場選「高」時的投影值（不發明量級）；強邊不動站位；錯誤輸入回錯誤碼；沒允許 ⇒ 拒絕；同樣輸入兩次答案相同。
//   S  setup／組裝器：正式規則集拒絕 phaseChoices；static 規則集（balanceTool.v20）拒絕；balanceTool.v21 接受；沒帶 ⇒ setup 沒有這個鍵。
//   D  引擎接線（Director）：479.5／480／959.5／960 秒交給引擎的是對的那一份；各時期物件的 identity 反查正確；
//      紅方 teamRelative 下「強邊＝上路」加權的是紅方上路英雄所在的世界路（世界下路）。
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

const MAP = await imp("src/platform/tactics/tacticChoiceMapping.js");
const R = await imp("src/battle/moba/tactics/tacticResolver.js");
const T = await imp("src/platform/tactics/tacticTemplates.js");
const TC = await imp("src/platform/contracts/MobaTacticConfig.js");
const rows = MAP.PHASE_CHOICE_MAPPING.rows;

// ── M ──
{
  const bad = [];
  for (const [dim, row] of Object.entries(rows)) {
    if (row.kind !== "phaseConfig") continue;
    for (const [choice, patch] of Object.entries(row.values)) for (const [p, v] of Object.entries(patch)) {
      const src = row.source[choice], [tid, fpath] = src.split(" ");
      const tpl = tid === "std" ? T.TACTIC_TEMPLATES.std : Object.values(T.TACTIC_TEMPLATES).find((t) => t.id === tid || t.templateId === tid) ?? T.TACTIC_TEMPLATES[tid];
      const got = tpl ? MAP.getPath(tpl.config, fpath) : undefined;
      if (fpath !== p || got !== v) bad.push(`${dim}=${choice} ${p}=${v} vs ${src}=${got}`);
    }
  }
  ck("M1 每個 phaseConfig 的值＝source 指名模板在同一欄位上的值（不發明量級）", bad.length === 0, bad.slice(0, 3).join(" ｜ "));
  ck("M2 前期 objectiveOrder 不提供 baron；中後期提供；集結沒有「分散」；強邊值是 lanePlan 鍵（top／mid／adc）或 null",
    !("baron" in rows["phases.early.objectiveOrder"].values) && "baron" in rows["phases.mid.objectiveOrder"].values && "baron" in rows["phases.late.objectiveOrder"].values
    && Object.keys(rows["phases.mid.grouping"].values).join() === "standard,group" && J(rows["phases.mid.focusLane"].values) === J({ none: null, top: "top", mid: "mid", bot: "adc" }));
  ck("M3 對照表凍結、版本＝TACTIC_RESOLVER_VERSION、每時期 3 個維度 × 3 時期", Object.isFrozen(rows) && MAP.PHASE_CHOICE_MAPPING.version === MAP.TACTIC_RESOLVER_VERSION && Object.keys(rows).length === 9);
}

// ── R ──
const std = R.mergeTacticConfig(T.TACTIC_TEMPLATES.std, [], {});
const res = (pc, opts = {}) => R.resolveTactic({ kind: "legacy", config: std, ...(pc ? { phaseChoices: pc } : {}) }, {}, { phases: true, allowPhaseChoices: true, ...opts });
const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o ?? {})) { const q = p ? `${p}.${k}` : k; if (v && typeof v === "object" && !Array.isArray(v)) flat(v, q, out); else out[q] = J(v); } return out; };
const diffKeys = (a, b) => { const A = flat(a), B = flat(b); return [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((k) => A[k] !== B[k]).sort(); };
{
  const r0 = res(null);
  ck("R1 沒有每時期選擇 ⇒ 三份就是整場的 knobs／identity（同一個參照）", r0.ok && r0.phases.every((p) => p.knobs === r0.knobs && p.identity === r0.identity));
  //  對照：同一個欄位在「整場」選高（或該路 aggressive）時的投影。每時期選擇改到的欄位與值，必須恰好等於那個整場選擇改到的
  //  （強邊例外，C5R：不改 gankWeights，只多 gankFocusLane／gankFocusAdd，增量＝整場該路 aggressive 的 gankWeights 增量；站位不動——契約 C5-3）。
  const whole = (dim, choice) => R.resolveTactic({ kind: "legacy", config: R.mergeTacticConfig(T.TACTIC_TEMPLATES.std, [], MAP.nestedOf([[dim, choice]])) }, {}, {});
  const base = whole("objectives.dragon", "standard");
  const changedOf = (k, id, k0, id0) => [...diffKeys(k, k0).map((x) => `knobs.${x}`), ...diffKeys(id, id0).map((x) => `identity.${x}`)];
  const cases = [
    ["mid", "objectiveOrder", "dragon", "objectives.dragon", "high"], ["late", "objectiveOrder", "baron", "objectives.baron", "high"],
    ["early", "objectiveOrder", "towers", "objectives.tower", "high"], ["mid", "grouping", "group", "teamfight.grouping", "tight"],
    ["early", "focusLane", "top", "lanes.top.stance", "aggressive", "top"], ["late", "focusLane", "bot", "lanes.bot.stance", "aggressive", "bot"],
  ];
  const bad = [], seen = [];
  for (const [p, d, v, wdim, wchoice, only] of cases) {
    const r = res({ [p]: { [d]: v } }), i = ["early", "mid", "late"].indexOf(p);
    if (!r.ok) { bad.push(`${p}.${d}=${v} 被拒絕`); continue; }
    if (![0, 1, 2].filter((j) => j !== i).every((j) => r.phases[j].knobs === r.knobs && r.phases[j].identity === r.identity)) bad.push(`${p}.${d}=${v} 其他時期不是整場物件`);
    const w = whole(wdim, wchoice);
    const changed = changedOf(r.phases[i].knobs, r.phases[i].identity, r.knobs, r.identity);
    if (only) {
      const k = r.phases[i].knobs, bw = base.knobs.gankWeights, want = (w.knobs.gankWeights[only] - bw[only]) / Math.max(bw.top, bw.mid, bw.bot);
      if (J(changed) !== J(["knobs.gankFocusAdd", "knobs.gankFocusLane"]) || k.gankFocusLane !== only || k.gankFocusAdd !== want || !(want > 0))
        bad.push(`${p}.${d}=${v} 改到 [${changed}] lane=${k.gankFocusLane} add=${k.gankFocusAdd}（要 ${only}／${want}）`);
      seen.push(`${p}.${d}=${v}→[${changed}] add=${k.gankFocusAdd}`);
      continue;
    }
    const wantFields = changedOf(w.knobs, w.identity, base.knobs, base.identity);
    if (!changed.length || J(changed) !== J(wantFields)) bad.push(`${p}.${d}=${v} 改到 [${changed}]，整場 ${wdim}=${wchoice} 改到 [${wantFields}]`);
    const fK = flat(r.phases[i].knobs), fI = flat(r.phases[i].identity), wK = flat(w.knobs), wI = flat(w.identity);
    for (const f of changed) { const [grp, ...rest] = f.split("."), key = rest.join("."); if ((grp === "knobs" ? fK[key] : fI[key]) !== (grp === "knobs" ? wK[key] : wI[key])) bad.push(`${p}.${d}=${v} ${f} 值不等於整場`); }
    seen.push(`${p}.${d}=${v}→[${changed}]`);
  }
  ck("R2 單一選擇：只有那個時期是新物件；改到的引擎欄位與值恰好等於整場選「高」時改到的（強邊 C5R：只多 gankFocusLane／gankFocusAdd，增量＝整場該路 aggressive 的權重增量）", bad.length === 0, (bad.length ? bad : seen).slice(0, 6).join(" ｜ "));
  const rf = res({ mid: { focusLane: "top" } });
  ck("R3 強邊不動站位（laneOffset）、也不動任何一路的 gankWeights（C5R：舊作法覆寫 gankWeights，其他路被正規化壓低）", J(rf.phases[1].knobs.laneOffset) === J(rf.knobs.laneOffset) && J(rf.phases[1].knobs.gankWeights) === J(rf.knobs.gankWeights));
  //  R3b：該路本來就是 aggressive 的設定 ⇒ 增量 0 ⇒ 不帶 knob、不另建物件（與本來相同）；沒選強邊 ⇒ 沒有 gankFocus 欄位。
  const aggTop = R.mergeTacticConfig(T.TACTIC_TEMPLATES.std, [], MAP.nestedOf([["lanes.top.stance", "aggressive"]]));
  const ra = R.resolveTactic({ kind: "legacy", config: aggTop, phaseChoices: { mid: { focusLane: "top" } } }, {}, { phases: true, allowPhaseChoices: true });
  ck("R3b 該路本來就 aggressive ⇒ 增量 0、不帶 gankFocus、不另建物件；沒選強邊的 knobs 沒有 gankFocusLane／gankFocusAdd",
    ra.ok && ra.phases[1].knobs === ra.knobs && !("gankFocusLane" in ra.knobs) && !("gankFocusAdd" in res(null).knobs) && !("gankFocusLane" in rf.knobs));
  //  R3c（C5R 審查 #1）：增量與引擎權重項同尺度——farm（三路 ×0.4）與 std 一樣是 0.7；另一路已 aggressive（最大權重 1.7）⇒ 0.7÷1.7。
  const farm = R.mergeTacticConfig(T.TACTIC_TEMPLATES.std, [], MAP.nestedOf([["jungle.focus", "farm"]]));
  const aggMid = R.mergeTacticConfig(T.TACTIC_TEMPLATES.std, [], MAP.nestedOf([["lanes.mid.stance", "aggressive"]]));
  const addOf = (cfg) => R.resolveTactic({ kind: "legacy", config: cfg, phaseChoices: { mid: { focusLane: "top" } } }, {}, { phases: true, allowPhaseChoices: true }).phases[1].knobs.gankFocusAdd;
  const near = (a, b) => Math.abs(a - b) < 1e-12;
  ck("R3c gankFocusAdd 是正規化後的增量：std 0.7、farm 0.7、另一路已 aggressive 0.7÷1.7", near(rf.phases[1].knobs.gankFocusAdd, 0.7) && near(addOf(farm), 0.7) && near(addOf(aggMid), 0.7 / 1.7), J([rf.phases[1].knobs.gankFocusAdd, addOf(farm), addOf(aggMid)]));
  const rs = res({ mid: { grouping: "standard", focusLane: "none" } });
  ck("R4 standard／none ⇒ 不另建物件（同一個參照）", rs.ok && rs.phases[1].knobs === rs.knobs && rs.phases[1].identity === rs.identity);
  const codes = [
    [{ early: { objectiveOrder: "baron" } }, "phase_choice_unknown_value"], [{ mid: { stance: "aggressive" } }, "phase_choice_unknown_dimension"],
    [{ dawn: { grouping: "group" } }, "phase_choices_invalid"], [[1], "phase_choices_invalid"], [{ mid: { grouping: 3 } }, "phase_choice_unknown_value"],
  ];
  ck("R5 錯誤輸入回明確錯誤碼（前期巴龍、時期姿態不是每時期維度、未知時期、非物件、非字串）", codes.every(([pc, c]) => res(pc).errors?.[0]?.code === c), codes.map(([pc]) => res(pc).errors?.[0]?.code).join(","));
  ck("R6 沒有 allowPhaseChoices ⇒ phase_choices_not_allowed；binding／std 帶 phaseChoices ⇒ 拒絕",
    res({ mid: { grouping: "group" } }, { allowPhaseChoices: false }).errors?.[0]?.code === "phase_choices_not_allowed"
    && R.resolveTactic({ kind: "std", phaseChoices: {} }, {}, { phases: true, allowPhaseChoices: true }).errors?.[0]?.code === "phase_choices_not_allowed");
  ck("R7 同樣輸入解析兩次 ⇒ deep-equal；結果凍結", J(res({ late: { grouping: "group" } })) === J(res({ late: { grouping: "group" } })) && Object.isFrozen(res({ late: { grouping: "group" } }).phases[2].knobs));
  //  H1：沒有要求每時期方針卻帶每時期選擇 ⇒ 拒絕（不默默丟掉）。
  ck("R9 phases 沒有要求（static）＋phaseChoices ⇒ phase_choices_not_allowed",
    R.resolveTactic({ kind: "legacy", config: std, phaseChoices: { mid: { grouping: "group" } } }, {}, { allowPhaseChoices: true }).errors?.[0]?.code === "phase_choices_not_allowed");
  //  G1：binding 輸入帶 phaseChoices ⇒ 拒絕；計畫裡放每時期維度（design）⇒ createTacticPlan 拒絕（design_choice）。
  const PLAN = await imp("src/platform/tactics/tacticPlan.js");
  //  Phase 3a-C3-3／C4 起集結、物件優先已 live（R-10）；強邊（focusLane）自 C5R（2026-10-24 Owner 核准）起也 live。
  //  仍是 design 的時期維度：資源交換（tradePolicy，3b）⇒ 拒絕；勝利條件在組合複驗前也是 design。
  const planBad = PLAN.createTacticPlan({ templateId: "std", choices: { phases: { mid: { tradePolicy: "top" } } } });
  const planWc = PLAN.createTacticPlan({ templateId: "std", choices: { winCondition: "objectiveControl" } });
  const planLive = PLAN.createTacticPlan({ templateId: "std", choices: { phases: { mid: { grouping: "group" } } } });
  const planFocus = PLAN.createTacticPlan({ templateId: "std", choices: { phases: { mid: { focusLane: "top" } } } });
  ck("R10 binding 輸入帶 phaseChoices ⇒ 拒絕；玩家計畫選仍是 design 的時期維度（資源交換）或勝利條件 ⇒ createTacticPlan 拒絕；已 live 的（中期集結、中期強邊）⇒ 接受",
    R.resolveTactic({ kind: "binding", binding: {}, phaseChoices: {} }, {}, { phases: true, allowPhaseChoices: true }).errors?.[0]?.code === "phase_choices_not_allowed"
    && !planBad.ok && planBad.errors.some((x) => /design/.test(x.code)) && !planWc.ok && planWc.errors.some((x) => /design/.test(x.code)) && planLive.ok && planFocus.ok,
    [planBad, planWc, planFocus].map((x) => x.errors?.map((e) => e.code).join(",") || "ok").join(" | "));
  //  G4／C2：取較高者——模板本來就 ≥ 對照表的值 ⇒ 不改、同一個參照；手寫的更高值不被拉低。
  const m4 = R.mergeTacticConfig(T.TACTIC_TEMPLATES["classic.m4"], [], {});
  const rm4 = R.resolveTactic({ kind: "legacy", config: m4, phaseChoices: { mid: { objectiveOrder: "dragon" } } }, {}, { phases: true, allowPhaseChoices: true });
  const hi = structuredClone(std); hi.macro.grouping = 0.95;
  const rhi = R.resolveTactic({ kind: "legacy", config: hi, phaseChoices: { mid: { grouping: "group" } } }, {}, { phases: true, allowPhaseChoices: true });
  ck("R11 取較高者：m4（巨龍本來 0.95）＋中期巨龍第一 ⇒ 同一個參照；集結 0.95 的設定＋group ⇒ 不被拉低（同一個參照）",
    rm4.ok && rm4.phases[1].knobs === rm4.knobs && rhi.ok && rhi.phases[1].knobs === rhi.knobs && rhi.knobs.joinFight > 0.72, `m4 dragonPriority ${m4.objectives?.dragonPriority}`);
  const r2 = res({ mid: { objectiveOrder: "dragon" }, late: { objectiveOrder: "dragon" } });
  ck("R8 兩個時期同一個選擇 ⇒ 兩份內容相同、各自是新物件", J(r2.phases[1].knobs) === J(r2.phases[2].knobs) && r2.phases[1].knobs !== r2.knobs && r2.phases[2].knobs !== r2.knobs);
}

// ── S／D ──
{
  const run = await imp("tools/balance/moba_items_balance_runner.mjs");
  const M = await run.modules();
  const tryConf = (rid, blue) => { try { return { e: run.configure(101, "standard", M, 1, null, { blue, red: { kind: "std" } }, rid).e }; } catch (x) { return { error: String(x.message) }; } };
  const pc = { mid: { objectiveOrder: "dragon" } };
  const v20 = tryConf("balanceTool.v20", { kind: "legacy", config: std, phaseChoices: pc });
  const v21 = tryConf("balanceTool.v21", { kind: "legacy", config: std, phaseChoices: pc });
  const MS = await imp("src/platform/contracts/matchSetup.js");
  const RS = await imp("src/platform/contracts/matchRuleset.js");
  //  G2：同一份輸入「帶」與「不帶」phaseChoices 的錯誤集合，差別恰好是 tactic_phase_choices_not_allowed（其他錯誤與 phaseChoices 無關）。
  const codesOf = (rid, withPc) => (MS.createMatchSetup({ seed: 101, rulesetId: rid, ruleset: RS.rulesetById(rid), roster: null, meta: { mode: "career" },
    tactic: { blue: { kind: "legacy", config: std, ...(withPc ? { phaseChoices: pc } : {}) }, red: null } }).errors ?? []).map((x) => x.code).sort();
  const onlyCause = (rid) => { const a = codesOf(rid, true), b = codesOf(rid, false); const extraCodes = a.filter((c) => !b.includes(c)); return J(extraCodes) === J(["tactic_phase_choices_not_allowed"]) && b.every((c) => a.includes(c)); };
  ck("S1 正式規則集 career.v21／challenge.v20 拒絕 phaseChoices：帶與不帶的錯誤差別恰好是 tactic_phase_choices_not_allowed",
    onlyCause("career.v21") && onlyCause("challenge.v20"), `${codesOf("career.v21", true).join(",")} ｜ ${codesOf("challenge.v20", true).join(",")}`);
  ck("S2 static 規則集（balanceTool.v20）拒絕 phaseChoices（不默默忽略）", !!v20.error && /phaseChoices/.test(v20.error), (v20.error ?? "accepted").slice(0, 90));
  ck("S3 balanceTool.v21 接受", !!v21.e, v21.error ?? "");
  const plain = tryConf("balanceTool.v21", { kind: "legacy", config: std });
  ck("S4 沒帶 phaseChoices ⇒ 三個時期交給引擎的是同一個物件（與 C3-1 之前相同）", (() => { const e = plain.e, at = (t) => { e.t = t; return e.director.knobs("blue"); }; const k = at(0); return at(500) === k && at(1000) === k; })());
  const e = v21.e, at = (t) => { e.t = t; const k = e.director.knobs("blue"); return k; };
  const P = [[479.5, 0.65], [480, 0.83], [959.5, 0.83], [960, 0.65]];
  ck(`D1 中期巨龍第一：引擎的藍方 dragonJoin ${P.map(([t, v]) => `${t}→${v}`).join("、")}`, P.every(([t, v]) => Math.abs(at(t).dragonJoin - v) < 1e-9), P.map(([t]) => at(t).dragonJoin).join(","));
  ck("D2 各時期物件的 identity 反查＝藍方 identity（中期物件在前期問也拿得到）", (() => { const kMid = at(600); e.t = 100; const a = e.director.identityOfKnobs(kMid); e.t = 600; const b = e.director.identityOfKnobs(kMid); return !!a && a === b; })());
  e.t = 0;
  //  G3：推塔第一（該時期 identity 也是新物件）——前期物件在中期反查，藍紅兩側（紅方 teamRelative）都拿得到前期那一份 identity。
  const tw = (side) => { const other = side === "blue" ? "red" : "blue"; return run.configure(101, "standard", M, 1, null,
    { [side]: { kind: "legacy", config: std, phaseChoices: { early: { objectiveOrder: "towers" } } }, [other]: { kind: "std" } }, "balanceTool.v21").e; };
  const g3 = ["blue", "red"].map((side) => { const x = tw(side); x.t = 100; const kE = x.director.knobs(side), iE = x.director.identity(side); x.t = 600; const iM = x.director.identity(side);
    const back = x.director.identityOfKnobs(kE); x.t = 0; return !!iE && iE !== iM && back === iE && iE.siegeBias > iM.siegeBias; });
  ck("D2b 推塔第一（前期 identity 是另一份）：前期 knobs 在中期反查 ⇒ 前期 identity；藍紅兩側都成立", g3.every(Boolean), g3.join("/"));
  const red = tryConf("balanceTool.v21", { kind: "std" });
  const rr = (() => { try { return run.configure(101, "standard", M, 1, null, { blue: { kind: "std" }, red: { kind: "legacy", config: std, phaseChoices: { early: { focusLane: "top" } } } }, "balanceTool.v21").e; } catch (x) { return null; } })();
  ck("D3 紅方（teamRelative）前期強邊＝上路 ⇒ 交給引擎的 gankFocusLane＝世界下路（紅方上路英雄所在的路）、gankWeights 不變；中期沒有 gankFocus；藍方沒有",
    !!rr && (() => { rr.t = 0; const k = rr.director.knobs("red"), kb = rr.director.knobs("blue"); const ok0 = k.gankFocusLane === "bot" && k.gankFocusAdd > 0 && J(k.gankWeights) === J({ top: 1, mid: 1, bot: 1 }) && !("gankFocusLane" in kb);
      rr.t = 600; const ok1 = !("gankFocusLane" in rr.director.knobs("red")); rr.t = 0; return ok0 && ok1; })(), rr ? J({ lane: rr.director.knobs("red").gankFocusLane, add: rr.director.knobs("red").gankFocusAdd }) : "configure failed");
  void red;
}
console.log(`\nPhase Choices C3：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
