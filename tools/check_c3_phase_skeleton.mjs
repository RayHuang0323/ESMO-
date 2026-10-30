#!/usr/bin/env node
// ============================================================================
//  tools/check_c3_phase_skeleton.mjs — Phase 3a-C3-1：時期骨架（Director core.v1）＋ career.v21／balanceTool.v21 ＋ RS-1 擴充
//
//  執行：node tools/check_c3_phase_skeleton.mjs（G 段重跑 golden 的 live＋runner 案，約 5–7 分鐘；一律走 tools/verify.mjs 的 c3_phase_skeleton 段）
//
//   D  Director 決定性檢查（合成的三時期方針，不跑模擬）：t＝0／479.9 ⇒ 第 0 份、480／959.9 ⇒ 第 1 份、960／2000 ⇒ 第 2 份（同參照）；
//      跨 479.9→480、959.9→960 時 directive 的差異**恰好**是宣告會變的欄位，同時期內零差異；identityOfKnobs 依目前時期反查；
//      三份相同 ⇒ 任意 t 都是同一個參照（R-4，G-AC1 ③）；static 模式不變；形狀錯誤在建立時就丟錯；不擲骰。
//   E  引擎接線：configureMatch 帶 phases ⇒ core.v1、clock 讀 e.t；不帶 ⇒ static；三份相同時跑一段模擬與 static 逐位元相同、rng 不多耗。
//   R  Resolver：預設輸出沒有 phases 鍵（與之前逐字相同）；phases:true ⇒ 三份就是整場的 knobs／identity 物件（不是複本）。
//   A  組裝器：v20 規則集 ⇒ configureMatch 引數沒有 phases 鍵；v21 ⇒ 有，且每時期物件與 blue／red／identity 同參照；
//      注入的 resolver 在 core.v1 下沒給 phases ⇒ 開局前拒絕（resolver_bad_shape）。
//   RS RS-1 擴充：v21 規則集需要 mobaTacticalDirectorV21；旗標關 ⇒ resolveRulesetForMode 與之前逐字相同（career.v20）；
//      DEV 旗標不得進正式規則集；v20 規則集拒絕 tacticalDirector 鍵；正式站旗標預設關。
//   G  G-AC1 ②：tools/fixtures/match_golden_v21a.json 的每一個 live 與 runner 案（challenge 案不在內：沒有 challenge.v21，D-16），
//      用 fixture 內存的 params 在 v21 規則集下重跑（live：旗標加 mobaTacticalDirectorV21:true 走真實的 Live 解析；
//      runner：ESMO_BALANCE_RULESET=balanceTool.v21）。
//      ⚠ C3-1 laneFrame（TD-3A-23，D-1 = A）起 v21 規則集帶 laneFrame "teamRelative"：紅方上下路不對稱的案例**預期改變**。
//      改變的集合必須**恰好**＝事前登記檔 tools/fixtures/laneframe_registration_c3.json 的 C3 清單（9 個 id；多一個、少一個都紅），
//      其餘每一案 digest／streamHash／resultHash 仍與 fixture 逐位元相同（＝C3-1 骨架本身仍是零行為變化）。
//      configureMatch 的引數雜湊與 setup 雜湊**預期不同**（規則集不同、多了 phases／laneFrame 鍵）⇒ 只報數量。
//      另在每一場真實對局的 configureMatch 之後驗 G-AC1 ③（R-4，TD-3A-23 §1.4-7 更新後的形式）：
//      legacyMirror ⇒ 任意 t 的 knobs／identity 與設定物件同參照；teamRelative ⇒ 藍方同參照、紅方＝設定物件的世界路名轉換、
//      每次同一參照且凍結，identity 照舊（不變成 null）。
// ============================================================================
import fs from "node:fs";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const progress = (s) => process.stderr.write(`  ${s}\n`);
const J = (x) => JSON.stringify(x);

//  golden 共用庫要先載入（它檢查 ESMO_BALANCE_* 沒被外部設定，並設好 runner 的技能／天賦開關）。
const L = await import("./lib/matchGoldenV21a.mjs");
const LF = await import("./lib/laneFrameC3.mjs");
const { LogicEngine } = await import("../src/LogicEngine.js");
const Dir = await import("../src/battle/moba/tactics/tacticalDirector.js");
const TD = await import("../src/platform/contracts/tacticalDirective.js");
const TC = await import("../src/platform/contracts/MobaTacticConfig.js");
const RS = await import("../src/platform/contracts/matchRuleset.js");
const { createMatchSetup, matchSetupHash } = await import("../src/platform/contracts/matchSetup.js");
const { FEATURE_FLAGS } = await import("../src/featureFlags.js");
const { resolveTactic, bindTacticPlanToCurrentVersions } = await import("../src/battle/moba/tactics/tacticResolver.js");
const { createTacticPlan } = await import("../src/platform/tactics/tacticPlan.js");
const { assembleMatch } = await import("../src/battle/moba/matchAssembler.js");
const { sharedMatchAssemblerDeps } = await import("../src/battle/moba/matchAssemblerDeps.js");
const { resolveLiveRuleset, buildLiveMatchSetup } = await import("../src/battle/moba/liveMatchSetup.js");
const { goldenLiveInputs } = await import("./lib/liveGolden.mjs");
const { tacticInputOf } = await import("./lib/tacticTruthSim.mjs");
const runner = await import("./balance/moba_items_balance_runner.mjs");
const M_ON = await runner.modules();
const M_OFF = { ...M_ON, skills: null, talents: null, passives: null, curves: null };

// ── configureMatch 觀測（只讀；G-AC1 ③ 與 A 段用）─────────────────────────────────
//  包在 golden 探針外面：探針照常記錄方法名＋引數雜湊。這裡只記「有沒有 phases 鍵」、Director 模式，
//  並在 configure 之後把 e.t 暫時設到各時期、問 Director，再還原（Director 不擲骰，見 D／E 段）。
const CM = { log: null };
const R4_TIMES = [0, 479.9, 480, 959.9, 960, 2000, 3600];
//  teamRelative 下紅方「應該」拿到的物件內容：gameData.js 的映射（世界路 L 的值＝己方路 sideRelativeLane("red", L) 的值；
//  splitLane 用 worldLaneForSide）。獨立於 Director 的實作重算，用來核對 Director 的轉換結果。
const { worldLaneForSide, sideRelativeLane } = await import("../src/gameData.js");
//  Phase 3a-B：補上 C5 加進 LANE_KEYED_KNOBS 的 gankFocusLane（值型，同 splitLane）。以前紅方從不帶強邊，漏了也看不出來；
//  AI 教練的紅方計畫會帶 ⇒ 模型必須與 Director 宣告的欄位完全相同（下面 G5b 檢查，防止再漂移）。
const EXPECTED_RED_FIELDS = ["laneOffset", "gankWeights", "splitLane", "gankFocusLane"];
const expectedWorldRed = (k) => {
  const keyed = (o) => Object.fromEntries(["top", "mid", "bot"].map((L) => [L, o[sideRelativeLane("red", L)]]));
  const value = (v) => (v == null ? v : worldLaneForSide("red", v));
  return { ...k, laneOffset: keyed(k.laneOffset), gankWeights: keyed(k.gankWeights), splitLane: value(k.splitLane),
    ...(Object.prototype.hasOwnProperty.call(k, "gankFocusLane") ? { gankFocusLane: value(k.gankFocusLane) } : {}) };
};
{
  const orig = LogicEngine.prototype.configureMatch;
  LogicEngine.prototype.configureMatch = function observedConfigureMatch(...args) {
    const r = orig.apply(this, args);
    if (CM.log && this.director) {
      const a = args[0] ?? {};
      const D = this.director, saved = this.t;
      const teamRelative = D.laneFrame === "teamRelative";
      //  Phase 3a-B T15：career.v21 的紅方改由 AI 教練排計畫，可能帶每時期選擇（例：前期滾雪球、前期強邊）⇒ 紅方的方針隨時期不同。
      //  R-4 對紅方改成「逐時期」比對：時期 p 的旋鈕＝a.phases.red[p].knobs 的世界路名轉換、凍結、同一時期內每次同一參照、identity＝該時期的；
      //  紅方三個時期是同一份（靜態模板，T15 之前的所有案例）時，這就退化成原本的「整場同一參照」，嚴格度不變。
      const redRefByPhase = new Map();
      let sameRef = true;
      for (const t of R4_TIMES) {
        this.t = t;
        for (const s of ["blue", "red"]) {
          const wantI = D.hasIdentity() ? (a.identity?.[s] ?? null) : null;
          if (s === "red" && teamRelative) {
            //  R-4（teamRelative）：紅方＝轉換結果、同一時期每次同一參照、凍結；identity 以交給引擎的那一份反查仍是紅方的。
            const ph = D.phase(t), redPh = a.phases?.red?.[ph] ?? null;
            const wantRedI = D.hasIdentity() ? (redPh ? (redPh.identity ?? null) : wantI) : null;
            const ref = D.knobs(s);
            if (!redRefByPhase.has(ph)) redRefByPhase.set(ph, ref);
            if (ref !== redRefByPhase.get(ph) || !Object.isFrozen(ref) || J(ref) !== J(expectedWorldRed(redPh ? redPh.knobs : a[s]))
              || D.identity(s) !== wantRedI || D.identityOfKnobs(ref) !== wantRedI) sameRef = false;
          } else if (D.knobs(s) !== a[s] || D.identity(s) !== wantI || D.identityOfKnobs(a[s]) !== wantI) sameRef = false;
        }
      }
      this.t = saved;
      CM.log.push({ hasPhases: Object.prototype.hasOwnProperty.call(a, "phases"), mode: D.mode, laneFrame: D.laneFrame,
        hasLaneFrameKey: Object.prototype.hasOwnProperty.call(a, "laneFrame"), sameRef, arg: a });
    }
    return r;
  };
}
const withLog = (fn) => { CM.log = []; try { const out = fn(); return { out, log: CM.log }; } finally { CM.log = null; } };

// ════ D：Director 決定性檢查 ════════════════════════════════════════════════════
const tA = TC.mobaTacticById("m2"), tB = TC.STANDARD_OPP_TACTIC;
const baseObjs = () => ({
  blue: TC.toEngineTactic(tA), red: TC.toEngineTactic(tB),
  identity: { blue: TC.toEngineTacticIdentity(tA), red: TC.toEngineTacticIdentity(tB) },
});
//  合成的三時期方針。宣告：藍 0→1 改 knobs.joinFight；藍 1→2 改 knobs.dragonJoin 與 identity.siegeBias；
//  紅 0→1 改 knobs.gankWeights；紅 1→2 不變（同一個物件）。
const synth = () => {
  const b = baseObjs();
  const bK1 = { ...b.blue, joinFight: b.blue.joinFight + 0.1 };
  const bK2 = { ...bK1, dragonJoin: bK1.dragonJoin + 0.1 };
  const bI2 = { ...b.identity.blue, siegeBias: b.identity.blue.siegeBias + 0.1 };
  const rK1 = { ...b.red, gankWeights: { ...b.red.gankWeights, top: b.red.gankWeights.top + 1 } };
  const phases = {
    blue: [{ knobs: b.blue, identity: b.identity.blue }, { knobs: bK1, identity: b.identity.blue }, { knobs: bK2, identity: bI2 }],
    red: [{ knobs: b.red, identity: b.identity.red }, { knobs: rK1, identity: b.identity.red }, { knobs: rK1, identity: b.identity.red }],
  };
  return { ...b, phases };
};
const DECLARED = {
  blue: { "479.9>480": ["knobs.joinFight"], "959.9>960": ["identity.siegeBias", "knobs.dragonJoin"] },
  red: { "479.9>480": ["knobs.gankWeights"], "959.9>960": [] },
};
const diffFields = (a, b) => {
  const out = [];
  for (const part of ["knobs", "identity"]) {
    const x = a[part] ?? {}, y = b[part] ?? {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (J(x[k]) !== J(y[k])) out.push(`${part}.${k}`);
  }
  return out.sort();
};
const realRandom = Math.random;
let randomCalls = 0;
Math.random = () => { randomCalls++; return realRandom(); };
try {
  const S = synth();
  let now = 0;
  const d = Dir.createTacticalDirector({ blue: S.blue, red: S.red, identity: S.identity, phases: S.phases, clock: () => now });
  ck("D0 有 phases ⇒ mode＝core.v1、Director 凍結、hasIdentity；TACTICAL_DIRECTOR_MODES＝契約那一份", d.mode === "core.v1" && Object.isFrozen(d) && d.hasIdentity() === true && Dir.TACTICAL_DIRECTOR_MODES === RS.TACTICAL_DIRECTOR_MODES && J(RS.TACTICAL_DIRECTOR_MODES) === J(["static", "core.v1"]));
  const EXPECT = [[0, 0], [479.9, 0], [480, 1], [959.9, 1], [960, 2], [2000, 2]];
  for (const [t, p] of EXPECT) {
    now = t;
    ck(`D1 t=${t} ⇒ 第 ${p} 份（knobs／identity 都是預先建好的同一個物件；兩側）`,
      ["blue", "red"].every((s) => d.knobs(s) === S.phases[s][p].knobs && d.identity(s) === S.phases[s][p].identity) && d.phase(t) === p);
  }
  for (const side of ["blue", "red"]) {
    for (const [a, b] of [[479.9, 480], [959.9, 960]]) {
      const got = diffFields(d.directive(side, a), d.directive(side, b));
      const want = DECLARED[side][`${a}>${b}`].slice().sort();
      ck(`D2 ${side} ${a}→${b}：directive 差異恰好＝宣告的欄位 [${want.join(", ")}]`, J(got) === J(want), `實際 [${got.join(", ")}]`);
    }
    for (const [a, b] of [[0, 479.9], [480, 959.9], [960, 2000]])
      ck(`D2b ${side} ${a}→${b}（同時期內）：directive 零差異`, diffFields(d.directive(side, a), d.directive(side, b)).length === 0);
  }
  ck("D2c directive 有效（validateTacticalDirective）、phase 欄位＝時期、深拷貝（不與預先建好的物件共用參照）",
    [[0, 0], [480, 1], [960, 2]].every(([t, p]) => { const x = d.directive("blue", t); return TD.validateTacticalDirective(x).ok && x.phase === p && x.knobs !== S.phases.blue[p].knobs; }));
  {
    const at = (t, fn) => { now = t; return fn(); };
    ck("D3 identityOfKnobs 依目前時期反查：本時期的 knobs ⇒ 本時期的 identity（兩側、三個時期）",
      [0, 500, 1000].every((t) => at(t, () => ["blue", "red"].every((s) => d.identityOfKnobs(d.knobs(s)) === d.identity(s)))));
    //  C3-2 前置（Owner 2026-10-21；C3-1 T2 審查）：別的時期的物件改為回「建立它的那個時期」的 identity（建立時的對照表），不再是 null。
    //  原本的 D3b／D3c 釘的是 null；這是刻意的契約變更（tacticalDirector.js identityOfKnobs；check_tactical_director_3c C1–C4）。
    ck("D3b 別的時期的（不同）物件 ⇒ 建立它的那個時期的 identity（C3-2 對照表）；複本 ⇒ null；null ⇒ null",
      at(500, () => d.identityOfKnobs(S.phases.blue[0].knobs) === S.phases.blue[0].identity && d.identityOfKnobs(S.phases.blue[2].knobs) === S.phases.blue[2].identity
        && d.identityOfKnobs({ ...d.knobs("blue") }) === null && d.identityOfKnobs(null) === null));
    ck("D3c 紅方第 1、2 時期共用同一個 knobs 物件 ⇒ t=1000 時以它反查得到紅方 identity；t=0 時（目前時期沒有它）⇒ 對照表的紅方 identity",
      at(1000, () => d.identityOfKnobs(S.phases.red[1].knobs) === S.identity.red) && at(0, () => d.identityOfKnobs(S.phases.red[1].knobs) === S.phases.red[1].identity));
    ck("D3d 藍方第 2 時期的 identity 是另一份物件（siegeBias 不同），第 0／1 時期共用整場那一份",
      at(1000, () => d.identity("blue") === S.phases.blue[2].identity && d.identity("blue") !== S.identity.blue) && at(500, () => d.identity("blue") === S.identity.blue));
  }
  //  R-4：三份相同 ⇒ 任意 t 同參照，答案＝static。
  {
    const B = baseObjs();
    const same = { blue: [0, 1, 2].map(() => ({ knobs: B.blue, identity: B.identity.blue })), red: [0, 1, 2].map(() => ({ knobs: B.red, identity: B.identity.red })) };
    let t = 0;
    const core = Dir.createTacticalDirector({ blue: B.blue, red: B.red, identity: B.identity, phases: same, clock: () => t });
    const st = Dir.createTacticalDirector({ blue: B.blue, red: B.red, identity: B.identity });
    const Ks = [B.blue, B.red, { ...B.blue }, null, undefined];
    const ts = [0, 1, 479.9, 480, 720, 959.9, 960, 1500, 3600];
    ck(`D4 R-4：三份相同 ⇒ t∈{${ts.join(",")}} 的 knobs／identity 都是設定的同一個物件；identityOfKnobs（5 種 K）＝static 的答案`,
      ts.every((x) => { t = x; return ["blue", "red"].every((s) => core.knobs(s) === B[s] && core.identity(s) === B.identity[s] && core.knobs(s) === st.knobs(s) && core.identity(s) === st.identity(s))
        && Ks.every((K) => core.identityOfKnobs(K) === st.identityOfKnobs(K)); }));
    ck("D4b R-4：三份相同 ⇒ 每個 t 的 directive 與 static 的 directive 內容相同", ts.every((x) => { t = x; return ["blue", "red"].every((s) => J(core.directive(s, x)) === J(st.directive(s, x))); }));
    const noId = Dir.createTacticalDirector({ blue: B.blue, red: B.red, identity: null, phases: same, clock: () => t });
    ck("D4c identity 未接線（null）⇒ core.v1 的 identity／identityOfKnobs 一律 null（即使每時期帶了 identity），hasIdentity＝false",
      noId.identity("blue") === null && noId.identity("red") === null && noId.identityOfKnobs(B.blue) === null && noId.hasIdentity() === false);
  }
  {
    const B = baseObjs();
    const st = Dir.createTacticalDirector({ blue: B.blue, red: B.red, identity: B.identity });
    const stClock = Dir.createTacticalDirector({ blue: B.blue, red: B.red, identity: B.identity, clock: () => 9999 });
    ck("D5 static 不變：沒有 phases ⇒ mode static、knobs／identity 同參照、phase 邊界同舊式；只給 clock 不給 phases 仍是 static",
      st.mode === "static" && st.knobs("blue") === B.blue && st.identity("red") === B.identity.red && stClock.mode === "static" && stClock.knobs("red") === B.red
      && [[0, 0], [479.9, 0], [480, 1], [959.9, 1], [960, 2], [3000, 2]].every(([x, p]) => st.phase(x) === p));
  }
  {
    const B = baseObjs();
    const one = (o) => [0, 1, 2].map(() => o);
    const ok = { blue: one({ knobs: B.blue, identity: null }), red: one({ knobs: B.red, identity: null }) };
    const throws = (args) => { try { Dir.createTacticalDirector(args); return false; } catch (e) { return e instanceof TypeError; } };
    ck("D6 形狀錯誤在建立時就丟錯：phases 沒有 clock／某側只有 2 份／某份 knobs 為 null／缺一側",
      throws({ blue: B.blue, red: B.red, identity: null, phases: ok })
      && throws({ blue: B.blue, red: B.red, identity: null, phases: { ...ok, blue: ok.blue.slice(0, 2) }, clock: () => 0 })
      && throws({ blue: B.blue, red: B.red, identity: null, phases: { ...ok, red: [ok.red[0], { knobs: null, identity: null }, ok.red[2]] }, clock: () => 0 })
      && throws({ blue: B.blue, red: B.red, identity: null, phases: { blue: ok.blue }, clock: () => 0 })
      && !throws({ blue: B.blue, red: B.red, identity: null, phases: ok, clock: () => 0 }));
  }
  {
    const answers = (D, setT) => J([0, 479.9, 480, 960, 2000].map((t) => { setT(t); return [D.knobs("blue"), D.knobs("red"), D.identity("blue"), D.identity("red"), D.directive("red", t)]; }));
    let t1 = 0, t2 = 0;
    const S1 = synth(), S2 = synth();
    ck("D7 同樣的輸入建兩次 ⇒ 回答完全相同（沒有模組層級狀態）",
      answers(Dir.createTacticalDirector({ ...S1, clock: () => t1 }), (t) => { t1 = t; }) === answers(Dir.createTacticalDirector({ ...S2, clock: () => t2 }), (t) => { t2 = t; }));
  }
  ck("D8 Director（static 與 core.v1）從建立到所有回答都沒有呼叫 Math.random", randomCalls === 0, `${randomCalls} 次`);
} finally { Math.random = realRandom; }

// ════ E：引擎接線 ════════════════════════════════════════════════════════════
{
  const mkEngine = (withPhases, phasesOf = null) => {
    const e = new LogicEngine(11);
    const B = baseObjs();
    const arg = { blue: B.blue, red: B.red, meta: null, identity: B.identity };
    if (withPhases) arg.phases = phasesOf ? phasesOf(B) : { blue: [0, 1, 2].map(() => ({ knobs: B.blue, identity: B.identity.blue })), red: [0, 1, 2].map(() => ({ knobs: B.red, identity: B.identity.red })) };
    e.configureMatch(arg);
    return { e, B, arg };
  };
  const st = mkEngine(false), co = mkEngine(true);
  ck("E1 不帶 phases ⇒ static；帶 ⇒ core.v1（Director 由 configureMatch 建）", st.e.director.mode === "static" && co.e.director.mode === "core.v1");
  ck("E2 core.v1 的 clock 讀引擎的 e.t：三份相同時任意 e.t 都回傳傳入的同一個物件（R-4）",
    R4_TIMES.every((t) => { co.e.t = t; return co.e.director.knobs("blue") === co.B.blue && co.e.director.knobs("red") === co.B.red && co.e.director.identity("blue") === co.B.identity.blue && co.e._tidOf("red") === co.B.identity.red; }));
  co.e.t = 0;
  const seq = (e) => J([...Array(6)].map(() => [e.rng(), e.rng2()]));
  const st2 = mkEngine(false), co2 = mkEngine(true);
  ck("E3 帶 phases（三份相同）的 configureMatch 消耗的 rng／rng2 與不帶時相同", seq(st2.e) === seq(co2.e));
  const S = synth();
  const di = mkEngine(true, () => S.phases);
  ck("E4 三份不同時，e.t 跨 480／960 ⇒ Director 回傳該時期的物件（引擎不看 phases 內容，只轉交）",
    [[0, 0], [479.9, 0], [480, 1], [959.9, 1], [960, 2], [2000, 2]].every(([t, p]) => { di.e.t = t; return di.e.director.knobs("blue") === S.phases.blue[p].knobs && di.e.director.knobs("red") === S.phases.red[p].knobs; }));
  //  三份相同 ⇒ 跑一段模擬（無名單的預設對局）與 static 逐位元相同。
  const run = (e) => { while (!e.over && e.t < 1200) e.tick(0.5); return L.stableHash(L.stableStringify(e.snapshot())); };
  const hs = run(mkEngine(false).e), hc = run(mkEngine(true).e);
  ck("E5 三份相同 ⇒ 模擬到 t=1200（跨過 480／960）的 snapshot 雜湊與 static 相同", hs === hc, `${hs} / ${hc}`);
}

// ════ R：Resolver ═══════════════════════════════════════════════════════════
{
  const binding = (() => { const c = createTacticPlan({ templateId: "v2.top_solo_split", choices: {} }); return bindTacticPlanToCurrentVersions(c.plan); })();
  const inputs = [["std", { kind: "std" }], ["legacy m2", { kind: "legacy", config: TC.mobaTacticById("m2") }], ["binding top_solo_split", { kind: "binding", binding }]];
  for (const [label, input] of inputs) {
    const def = resolveTactic(input, {}, { identity: true });
    const ph = resolveTactic(input, {}, { identity: true, phases: true });
    const { phases, ...rest } = ph;
    ck(`R1 ${label}：預設輸出沒有 phases 鍵；要求 phases 時其餘欄位與預設逐字相同`, def.ok && ph.ok && !("phases" in def) && J(Object.keys(def)) === J(Object.keys(rest)) && L.stableStringify(def) === L.stableStringify(rest));
    ck(`R2 ${label}：phases＝3 份，每份的 knobs／identity 就是整場的那一個物件（不是複本）；整份深凍結`,
      Array.isArray(phases) && phases.length === 3 && phases.every((p) => p.knobs === ph.knobs && p.identity === ph.identity) && Object.isFrozen(phases) && phases.every((p) => Object.isFrozen(p)));
  }
  const noId = resolveTactic({ kind: "std" }, {}, { identity: false, phases: true });
  ck("R3 identity:false＋phases:true ⇒ 每時期 identity＝null、knobs 同參照", noId.ok && noId.identity === null && noId.phases.every((p) => p.identity === null && p.knobs === noId.knobs));
  ck("R4 phases 不是 true（\"true\"／1）⇒ 不加鍵", !("phases" in resolveTactic({ kind: "std" }, {}, { phases: "true" })) && !("phases" in resolveTactic({ kind: "std" }, {}, { phases: 1 })));
}

// ════ A：組裝器 ═════════════════════════════════════════════════════════════
{
  const seed = 7;
  const roster = runner.mirroredRoster(seed, M_ON);
  const setupOf = (rid) => runner.buildBalanceMatchSetup(seed, "standard", M_ON, 1, roster, null, rid).setup;
  const deps = sharedMatchAssemblerDeps();
  const v20 = withLog(() => assembleMatch(setupOf("balanceTool.v20"), deps));
  const v21 = withLog(() => assembleMatch(setupOf("balanceTool.v21"), deps));
  ck("A1 balanceTool.v20 ⇒ configureMatch 引數沒有 phases 鍵、Director static", v20.out.ok && v20.log.length === 1 && v20.log[0].hasPhases === false && v20.log[0].mode === "static");
  const a = v21.log[0]?.arg;
  ck("A2 balanceTool.v21 ⇒ 有 phases 鍵、Director core.v1；每時期的 knobs／identity 與 blue／red／identity 是同一個物件（單次 structuredClone 保留共用）",
    v21.out.ok && v21.log.length === 1 && v21.log[0].hasPhases === true && v21.log[0].mode === "core.v1"
    && ["blue", "red"].every((s) => a.phases[s].length === 3 && a.phases[s].every((p) => p.knobs === a[s] && p.identity === a.identity[s])));
  ck("A3 v21 的 knobs 物件不是 resolver 的輸出（仍是組裝器的副本，不凍結）", !Object.isFrozen(a.blue) && !Object.isFrozen(a.phases.blue[0].knobs));
  ck("A4 v20／v21 交給引擎的 blue／red／identity 內容相同（差別只有 phases 鍵）",
    L.stableStringify({ blue: v20.log[0].arg.blue, red: v20.log[0].arg.red, identity: v20.log[0].arg.identity, meta: v20.log[0].arg.meta })
    === L.stableStringify({ blue: a.blue, red: a.red, identity: a.identity, meta: a.meta }));
  ck("A5 G-AC1 ③（組裝器路徑；R-4 的 laneFrame 形式）：v21 的 configureMatch 之後任意 t：藍方 knobs／identity 與設定物件同參照；紅方＝世界路名轉換、同一參照、凍結、identity 不變",
    v21.log[0].sameRef === true && v21.log[0].laneFrame === "teamRelative");
  ck("A5b laneFrame 鍵：balanceTool.v20 的 configureMatch 引數沒有 laneFrame 鍵（Director legacyMirror）；balanceTool.v21 有（teamRelative）",
    v20.log[0].hasLaneFrameKey === false && v20.log[0].laneFrame === "legacyMirror" && v21.log[0].hasLaneFrameKey === true && v21.log[0].arg.laneFrame === "teamRelative");
  const dropPhases = { ...deps, engineAdapters: { ...deps.engineAdapters, resolveTactic: function noPhases(t, A, o) { const { phases: _p, ...rest } = deps.engineAdapters.resolveTactic(t, A, o); return rest; } } };
  const bad21 = assembleMatch(setupOf("balanceTool.v21"), dropPhases), ok20 = assembleMatch(setupOf("balanceTool.v20"), dropPhases);
  ck("A6 core.v1 下注入的 resolver 沒給 phases ⇒ 開局前拒絕（resolver_bad_shape）；v20 下同一個 resolver 照常",
    !bad21.ok && bad21.errors.some((e) => e.code === "tactic_rejected" && e.message.includes("[resolver_bad_shape]") && e.message.includes("phases")) && ok20.ok, J(bad21.errors?.map((e) => e.message)));
}

// ════ RS：RS-1 擴充 ═══════════════════════════════════════════════════════════
{
  const c21 = RS.MATCH_RULESETS["career.v21"], b21 = RS.MATCH_RULESETS["balanceTool.v21"];
  const c20 = RS.MATCH_RULESETS["career.v20"], b20 = RS.MATCH_RULESETS["balanceTool.v20"];
  const omit = (o, ...ks) => { const rest = { ...o }; for (const k of ks) delete rest[k]; return rest; };
  //  C3-1 laneFrame 起 v21 的層另帶 laneFrame "teamRelative"（只有這兩個 v21 新鍵；其餘層與 v20 逐字相同）。
  //  Phase 3a-B 第一階段（RS1'／RS2'／RS7'，事前登記 stage1_release_registration_3aB）：v21 另帶 templateBalance "v21.b1"。
  const V21_KEYS = ["tacticalDirector", "laneFrame", "templateBalance"];
  //  Phase 3a-B T15（事前登記 tools/fixtures/ai_coach_registration_3aB.json）：career.v21 的 redTactic 改成 aiCoachV1（career.v20 仍是 styleTemplate）；
  //  其餘層與 v20 逐字相同的要求不變。balanceTool.v21 的 redTactic 仍是 std（RS2 原樣）。
  const C21_KEYS = [...V21_KEYS, "redTactic"];
  ck("RS1' career.v21＝career.v20 的層＋tacticalDirector core.v1＋laneFrame teamRelative＋redTactic aiCoachV1（T15）＋templateBalance v21.b1（第一階段）、simVersion moba-sim.v21、正式；releaseRequirements＝v20 的＋mobaTacticalDirectorV21",
    c21.kind === "production" && c21.simVersion === "moba-sim.v21" && c21.layers.tacticalDirector === "core.v1" && c21.layers.laneFrame === "teamRelative" && c21.layers.templateBalance === "v21.b1"
    && c21.layers.redTactic === "aiCoachV1" && c20.layers.redTactic === "styleTemplate"
    && L.stableStringify(omit(c21.layers, ...C21_KEYS)) === L.stableStringify(omit(c20.layers, "redTactic"))
    && J(c21.releaseRequirements) === J([...c20.releaseRequirements, "mobaTacticalDirectorV21"]) && RS.validateRuleset(c21).ok);
  ck("RS2' balanceTool.v21＝balanceTool.v20 的層＋tacticalDirector core.v1＋laneFrame teamRelative＋templateBalance v21.b1（第一階段）、工具、不需旗標",
    b21.kind === "tool" && b21.layers.templateBalance === "v21.b1" && b21.layers.tacticalDirector === "core.v1" && b21.layers.laneFrame === "teamRelative" && L.stableStringify(omit(b21.layers, ...V21_KEYS)) === L.stableStringify(b20.layers)
    && b21.releaseRequirements.length === 0 && RS.validateRuleset(b21).ok);
  const v = (r) => RS.validateRuleset(r);
  const noFlag = { ...c21, releaseRequirements: c21.releaseRequirements.filter((f) => f !== "mobaTacticalDirectorV21") };
  ck("RS3 正式規則集 tacticalDirector 非 static 卻沒列 mobaTacticalDirectorV21 ⇒ 拒絕（只因這一條）",
    !v(noFlag).ok && J(v(noFlag).errors) === J(["tacticalDirector core.v1 requires mobaTacticalDirectorV21"]), J(v(noFlag).errors));
  ck("RS3b 同一份改成 tacticalDirector static ⇒ 不需要該旗標（但列著不算違規）", v({ ...noFlag, layers: { ...noFlag.layers, tacticalDirector: "static" } }).ok && v({ ...c21, layers: { ...c21.layers, tacticalDirector: "static" } }).ok);
  const devFlags = Object.keys(FEATURE_FLAGS).filter((f) => /^dev/i.test(f));
  ck(`RS4 DEV 旗標（${devFlags.join("、")}）與 DEV 網址開關名不得出現在正式規則集：加進 releaseRequirements ⇒ 拒絕`,
    devFlags.length > 0 && [...devFlags, "heroSkillsDev", "itemsDev"].every((f) => { const r = v({ ...c21, releaseRequirements: [...c21.releaseRequirements, f] }); return !r.ok && r.errors.some((e) => e.includes(f)); }));
  ck("RS4b 正式旗標清單（RELEASE_FLAGS）＝布林層旗標＋mobaTacticalDirectorV21，沒有任何 dev 旗標；每個都在 FEATURE_FLAGS 登錄",
    J([...RS.RELEASE_FLAGS].sort()) === J(["heroBattleTalentsV1", "heroSkillsV1", "itemsV1", "mobaTacticalDirectorV21"]) && RS.RELEASE_FLAGS.every((f) => f in FEATURE_FLAGS && !/^dev/i.test(f)));
  ck("RS4c 每一個登錄的正式規則集都通過驗證，且 releaseRequirements ⊆ 正式旗標", Object.values(RS.MATCH_RULESETS).filter((r) => r.kind === "production").every((r) => v(r).ok && r.releaseRequirements.every((f) => RS.RELEASE_FLAGS.includes(f))));
  ck("RS5 正式站旗標 mobaTacticalDirectorV21 預設 false；用正式旗標解析 career ⇒ career.v20（正式站照舊）",
    FEATURE_FLAGS.mobaTacticalDirectorV21 === false && RS.resolveRulesetForMode({ mode: "career", flags: FEATURE_FLAGS }).rulesetId === "career.v20"
    && resolveLiveRuleset({ flags: FEATURE_FLAGS }).ruleset.rulesetId === "career.v20");
  //  旗標關（缺、false、非 true 的值）⇒ 與 C3-1 之前逐字相同：8 種布林層旗標組合 × 5 種「關」的寫法，輸出都等於不帶這個鍵的輸出，
  //  且整串與 check_match_ruleset_3a R17 釘的雜湊相同。
  const combos = [...Array(8)].map((_, m) => ({ heroSkillsV1: !!(m & 1), heroBattleTalentsV1: !!(m & 2), itemsV1: !!(m & 4) }));
  const OFFS = [undefined, false, "true", 1, null];
  ck(`RS6 旗標不是 true（${OFFS.map((x) => J(x) ?? "缺").join("／")}）⇒ resolveRulesetForMode 與不帶此鍵的輸出逐字相同（8 種層旗標組合；career.v20）`,
    combos.every((f) => OFFS.every((x) => { const g = x === undefined ? f : { ...f, mobaTacticalDirectorV21: x }; const r = RS.resolveRulesetForMode({ mode: "career", flags: g }); return r.rulesetId === "career.v20" && L.stableStringify(r) === L.stableStringify(RS.resolveRulesetForMode({ mode: "career", flags: f })) && !("tacticalDirector" in r.layers); })));
  {
    const { createHash } = await import("node:crypto");
    const outs = combos.map((f) => L.stableStringify(RS.resolveRulesetForMode({ mode: "career", flags: { ...f, mobaTacticalDirectorV21: false } })));
    outs.push(L.stableStringify(RS.resolveRulesetForMode({ mode: "challenge", flags: { mobaTacticalDirectorV21: true } })));
    outs.push(L.stableStringify(RS.resolveRulesetForMode({ mode: "career", flags: undefined })));
    ck("RS6b 旗標關（＋challenge 旗標開）的輸出串雜湊＝check_match_ruleset_3a R17 釘的 11093581c4605dae（C3-1 之前的值）",
      createHash("sha256").update(outs.join("\n")).digest("hex").slice(0, 16) === "11093581c4605dae");
  }
  ck("RS7' 旗標開 ⇒ career.v21（帶 templateBalance v21.b1；其餘層照旗標關閉；releaseRequirements 末尾多列 mobaTacticalDirectorV21），每一種都通過 validateRuleset 與 createMatchSetup",
    combos.every((f) => { const r = RS.resolveRulesetForMode({ mode: "career", flags: { ...f, mobaTacticalDirectorV21: true } });
      const r20 = RS.resolveRulesetForMode({ mode: "career", flags: f });
      return r.rulesetId === "career.v21" && r.layers.tacticalDirector === "core.v1" && r.layers.laneFrame === "teamRelative" && r.layers.redTactic === "aiCoachV1" && r.layers.templateBalance === "v21.b1"
        && L.stableStringify(omit(r.layers, ...C21_KEYS)) === L.stableStringify(omit(r20.layers, "redTactic"))
        && J(r.releaseRequirements) === J([...r20.releaseRequirements, "mobaTacticalDirectorV21"]) && Object.isFrozen(r) && v(r).ok
        && createMatchSetup({ ruleset: r, seed: 1, meta: { seedSource: "local" } }).ok; }));
  //  Phase 3a-B T16（Owner 2026-10-25 決策 6）：challenge.v21 出現了（D-16 結案）。旗標關 ⇒ 仍是 challenge.v20（正式站照舊，RS6b 雜湊不變）；
  //  旗標開＋技能旗標開 ⇒ challenge.v21；只開 Director、技能關 ⇒ challenge.v20（challenge.v21 的技能層是固定的，不能被關成半套）。
  //  RS8'（第一階段，Owner 2026-10-30 第 5 點）：challenge.v21 另外要求 mobaChallengeV21；只開 Director（第一階段）⇒ 仍是 challenge.v20。
  ck("RS8' challenge 模式：正式旗標 ⇒ challenge.v20；只開 Director（第一階段）⇒ challenge.v20；Director＋技能＋Challenge 旗標都開 ⇒ challenge.v21；技能關 ⇒ challenge.v20",
    RS.resolveRulesetForMode({ mode: "challenge", flags: FEATURE_FLAGS }).rulesetId === "challenge.v20"
    && RS.resolveRulesetForMode({ mode: "challenge", flags: { ...FEATURE_FLAGS, mobaTacticalDirectorV21: true } }).rulesetId === "challenge.v20"
    && RS.resolveRulesetForMode({ mode: "challenge", flags: { ...FEATURE_FLAGS, mobaTacticalDirectorV21: true, mobaChallengeV21: true } }).rulesetId === (FEATURE_FLAGS.heroSkillsV1 === true ? "challenge.v21" : "challenge.v20")
    && RS.resolveRulesetForMode({ mode: "challenge", flags: { ...FEATURE_FLAGS, mobaTacticalDirectorV21: true, mobaChallengeV21: true, heroSkillsV1: false } }).rulesetId === "challenge.v20");
  const setupCodes = (r) => { const x = createMatchSetup({ ruleset: r, seed: 1, meta: { seedSource: "local" } }); return x.ok ? [] : x.errors.map((e) => `${e.code}@${e.field}`); };
  //  career.v20＋core.v1 沒列旗標時先被 RS-1 擋（ruleset_invalid@ruleset）；補上旗標後仍被層鍵鎖定擋下。
  const c20With = (m, reqs = c20.releaseRequirements) => ({ ...c20, layers: { ...c20.layers, tacticalDirector: m }, releaseRequirements: reqs });
  ck("RS9 v20 規則集拒絕 tacticalDirector 鍵（static 與 core.v1 都拒絕）：career.v20 ⇒ production_layer_mismatch（core.v1 未列旗標時先被 RS-1 擋）、balanceTool.v20 ⇒ ruleset_invalid",
    J(setupCodes(c20With("static"))) === J(["production_layer_mismatch@ruleset.layers.tacticalDirector"])
    && J(setupCodes(c20With("core.v1"))) === J(["ruleset_invalid@ruleset"])
    && J(setupCodes(c20With("core.v1", [...c20.releaseRequirements, "mobaTacticalDirectorV21"]))) === J(["production_layer_mismatch@ruleset.layers.tacticalDirector"])
    && ["static", "core.v1"].every((m) => J(setupCodes({ ...b20, layers: { ...b20.layers, tacticalDirector: m } })) === J(["ruleset_invalid@ruleset.layers.tacticalDirector"])));
  ck("RS10 v21 規則集缺 tacticalDirector 鍵 ⇒ 拒絕；career.v21 改成 static ⇒ 拒絕（正式規則集的值釘在 core.v1）",
    setupCodes({ ...c21, layers: omit(c21.layers, "tacticalDirector") }).includes("production_layer_mismatch@ruleset.layers.tacticalDirector")
    && setupCodes({ ...b21, layers: omit(b21.layers, "tacticalDirector") }).includes("ruleset_invalid@ruleset.layers.tacticalDirector")
    && setupCodes({ ...c21, layers: { ...c21.layers, tacticalDirector: "static" } }).includes("production_layer_mismatch@ruleset.layers.tacticalDirector"));
  ck("RS11 v20 三份規則集仍沒有 tacticalDirector 鍵；TACTIC_KINDS_BY_RULESET 每個登錄規則集各一列（v21＝legacy／std／binding）",
    ["career.v20", "challenge.v20", "balanceTool.v20"].every((id) => !("tacticalDirector" in RS.MATCH_RULESETS[id].layers))
    && J(Object.keys(RS.TACTIC_KINDS_BY_RULESET).sort()) === J(Object.keys(RS.MATCH_RULESETS).sort())
    && ["career.v21", "balanceTool.v21"].every((id) => J(RS.TACTIC_KINDS_BY_RULESET[id]) === J(["legacy", "std", "binding"])));
}

// ════ G：G-AC1 ②（golden live＋runner 案在 v21 規則集下重跑）══════════════════════════
{
  ck("G0 runner 載入的引擎類別＝src/LogicEngine.js 的同一個類別（觀測包裝量得到 runner 案）", L.PROBE_SHARES_RUNNER_ENGINE);
  const fixture = JSON.parse(fs.readFileSync(L.FIXTURE_V21A, "utf8"));
  const v20 = JSON.parse(fs.readFileSync(L.V20_FIXTURE, "utf8"));
  const v20On = { ...v20, featureFlags: { ...v20.featureFlags, mobaTacticalDirectorV21: true } };
  const specs = L.specsFromFixture(fixture).filter((s) => s.path === "live" || s.path === "runner");
  const nLive = specs.filter((s) => s.path === "live").length, nRunner = specs.filter((s) => s.path === "runner").length;
  ck("G1 案例＝fixture 的 live 與 runner 案（challenge 案除外：沒有 challenge.v21，D-16）", specs.length === fixture.cases.length - fixture.cases.filter((c) => c.path === "challenge").length && nLive > 0 && nRunner > 0,
    `live ${nLive}、runner ${nRunner}、排除 challenge ${fixture.cases.filter((c) => c.path === "challenge").length}`);

  //  setup 雜湊（不跑模擬）：同一份輸入在 v20／v21 規則集下各建一次，並確認 v21 那份真的是 v21 規則集。
  const bindingOf = (templateId, choices) => bindTacticPlanToCurrentVersions(createTacticPlan({ templateId, choices }).plan);
  const liveInputsOf = (spec, G) => {
    if (spec.group === "v20") return goldenLiveInputs(G.cases.find((x) => x.id === spec.params.v20Id), G);
    const synthetic = { id: spec.id, seed: spec.seed, params: { noRoster: false, noPlayers: false, tacticId: null, buildStrategy: "standard" }, liveOpts: { talentSelections: null, opponentId: null } };
    const inputs = goldenLiveInputs(synthetic, G);
    inputs.opts = { ...inputs.opts, tacticPlanBinding: bindingOf(spec.params.templateId, spec.params.choices) };
    return inputs;
  };
  const runnerSetupOf = (spec, rid) => {
    if (spec.group === "v20") {
      const c = v20.cases.find((x) => x.id === spec.params.v20Id);
      const M = c.params.skills ? M_ON : M_OFF;
      return runner.buildBalanceMatchSetup(c.seed, c.params.config, M, 1, runner.mirroredRoster(c.seed, M), null, rid).setup;
    }
    const tactic = { blue: tacticInputOf(spec.params.blue), red: tacticInputOf(spec.params.red) };
    return runner.buildBalanceMatchSetup(spec.seed, spec.params.config, M_ON, 1, runner.mirroredRoster(spec.seed, M_ON), tactic, rid).setup;
  };
  let setupDiff = 0, setupRulesetOk = 0, bindingProvOk = 0, bindingCases = 0;
  for (const spec of specs) {
    let a, b;
    if (spec.path === "live") {
      a = buildLiveMatchSetup(liveInputsOf(spec, v20)).setup; b = buildLiveMatchSetup(liveInputsOf(spec, v20On)).setup;
      if (a?.rulesetId === "career.v20" && b?.rulesetId === "career.v21") setupRulesetOk++;
      if (spec.group !== "v20") { bindingCases++; if (L.stableHash(L.stableStringify(bindingOf(spec.params.templateId, spec.params.choices))) === fixture.cases.find((c) => c.id === spec.id).bindingHash) bindingProvOk++; }
    } else {
      a = runnerSetupOf(spec, "balanceTool.v20"); b = runnerSetupOf(spec, "balanceTool.v21");
      if (a?.rulesetId === "balanceTool.v20" && b?.rulesetId === "balanceTool.v21") setupRulesetOk++;
    }
    if (a && b && matchSetupHash(a) !== matchSetupHash(b)) setupDiff++;
  }
  ck(`G2 每一案的 setup 在 v20 輸入下是 v20 規則集、加旗標／選 balanceTool.v21 後是 v21 規則集（${setupRulesetOk}/${specs.length}）`, setupRulesetOk === specs.length);
  ck(`G3 binding 案的輸入出處＝fixture（bindingHash 逐案相同 ${bindingProvOk}/${bindingCases}）`, bindingProvOk === bindingCases && bindingCases > 0);

  //  重跑（真實包裝：live＝prepareLiveMatch、runner＝runner.configure；與 check_match_golden_v21a 同一個 runCase）
  process.env.ESMO_BALANCE_RULESET = "balanceTool.v21";
  const observed = [], failedRun = new Map(), cmLogs = new Map();
  const t0 = Date.now();
  try {
    for (const [n, spec] of specs.entries()) {
      try { const { out, log } = withLog(() => L.recordOf(spec, v20On)); observed.push(out); cmLogs.set(spec.id, log); }
      catch (e) { failedRun.set(spec.id, String(e?.message ?? e)); }
      progress(`${n + 1}/${specs.length} ${spec.id} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  } finally { delete process.env.ESMO_BALANCE_RULESET; }
  const want = new Map(fixture.cases.map((c) => [c.id, c]));
  //  C3-1 laneFrame：預期改變的 id 只來自事前登記檔（不在這裡另寫一份清單）。
  //  Phase 3a-B T15：再加上 AI 教練的事前登記（tools/fixtures/ai_coach_registration_3aB.json）——比對用兩份的聯集。
  const EXPECTED_CHANGED = new Set(LF.V21_EXPECTED_CHANGED);
  ck(`G1b 事前登記的改變清單：laneFrame ${LF.C3_EXPECTED_CHANGED.length} 個（登記總數 ${LF.C3_TOTAL_EXPECTED}）＋ AI 教練 ${LF.AI_COACH_EXPECTED_CHANGED.length} 個 ＋ 模板修正表 ${LF.TEMPLATE_BALANCE_EXPECTED_CHANGED.length} 個（由修正表推導，第一階段登記）＝ 聯集 ${EXPECTED_CHANGED.size} 個 id，全部是本段重跑的 live／runner 案`,
    LF.C3_EXPECTED_CHANGED.length === LF.C3_TOTAL_EXPECTED && [...EXPECTED_CHANGED].every((id) => specs.some((s) => s.id === id)));
  let callsDiff = 0, withMatch = 0, coreOk = 0, r4Ok = 0;
  for (const spec of specs) {
    const w = want.get(spec.id), g = observed.find((o) => o.id === spec.id), run = failedRun.get(spec.id);
    const diffs = run ? [run] : ["digest", "streamHash", "resultHash"].filter((k) => (w[k] ?? null) !== (g[k] ?? null)).map((k) => `${k} ${w[k]} -> ${g[k]}`);
    const inputDiffs = run ? [] : [...(((w.bindingHash ?? null) !== (g.bindingHash ?? null)) ? [`bindingHash ${w.bindingHash} -> ${g.bindingHash}`] : []),
      ...(L.stableStringify(w.params) !== L.stableStringify(g.params) ? ["params differ"] : [])];
    if (EXPECTED_CHANGED.has(spec.id))
      ck(`G ${spec.id}　登記的改變案（${LF.C3_EXPECTED_CHANGED.includes(spec.id) ? "紅方不對稱 teamRelative" : ""}${LF.C3_EXPECTED_CHANGED.includes(spec.id) && LF.AI_COACH_EXPECTED_CHANGED.includes(spec.id) ? "＋" : ""}${LF.AI_COACH_EXPECTED_CHANGED.includes(spec.id) ? "AI 教練紅方" : ""}${LF.TEMPLATE_BALANCE_EXPECTED_CHANGED.includes(spec.id) ? "模板修正表 v21.b1" : ""}）：v21 規則集下 digest／streamHash／resultHash 至少一欄改變；輸入（params／bindingHash）不變`,
        !run && diffs.length > 0 && inputDiffs.length === 0, run ?? (diffs.length ? diffs.join("; ") : "三欄都沒變") + (inputDiffs.length ? `; ${inputDiffs.join("; ")}` : ""));
    else
      ck(`G ${spec.id}　v21 規則集下 digest＋streamHash＋resultHash＝fixture`, !run && diffs.length === 0 && inputDiffs.length === 0, [...(run ? [run] : diffs), ...inputDiffs].join("; "));
    if (run) continue;
    if (L.stableStringify(w.calls) !== L.stableStringify(g.calls)) callsDiff++;
    const log = cmLogs.get(spec.id) ?? [];
    if (w.calls.some((c) => c.m === "configureMatch")) {
      withMatch++;
      if (log.length === 1 && log[0].hasPhases && log[0].mode === "core.v1" && log[0].hasLaneFrameKey && log[0].laneFrame === "teamRelative") coreOk++;
      if (log.length === 1 && log[0].sameRef) r4Ok++;
    } else if (log.length === 0) { coreOk++; r4Ok++; }
  }
  {
    const scope = specs.map((s) => want.get(s.id));
    const cmp = LF.compareChangedSet(scope, observed, LF.V21_EXPECTED_CHANGED);
    ck(`G1c 改變集合**恰好**＝登記的 ${EXPECTED_CHANGED.size} 個（多出 ${cmp.unexpected.length}、缺少 ${cmp.missing.length}、未跑 ${cmp.notRun.length}）；其餘 ${cmp.identical} 案逐位元相同`,
      cmp.ok && cmp.identical === specs.length - EXPECTED_CHANGED.size, `多出 [${cmp.unexpected.join(", ")}] 缺少 [${cmp.missing.join(", ")}]`);
  }
  ck(`G4 有 configureMatch 的案（${withMatch}）全部以 core.v1、帶 phases 鍵與 laneFrame:"teamRelative" 執行；沒有的案也沒有被多呼叫（${coreOk}/${specs.length}）`, coreOk === specs.length && failedRun.size === 0);
  {
    const { LANE_KEYED_KNOBS } = await import("../src/battle/moba/tactics/tacticalDirector.js");
    ck("G5b 本檔的紅方世界路名模型涵蓋的欄位＝Director 的 LANE_KEYED_KNOBS（不多不少）", JSON.stringify([...EXPECTED_RED_FIELDS].sort()) === JSON.stringify(Object.keys(LANE_KEYED_KNOBS).sort()), Object.keys(LANE_KEYED_KNOBS).join(","));
  }
  ck(`G5 G-AC1 ③（真實對局；R-4 的 laneFrame 形式）：configureMatch 之後 t∈{${R4_TIMES.join(",")}}：藍方 knobs／identity／identityOfKnobs 與設定物件同參照；紅方＝世界路名轉換、同一參照、凍結、identity 不變（${r4Ok}/${specs.length}）`, r4Ok === specs.length);
  console.log(`ℹ G-AC1 ② 計數（資訊；預期不同）：configure 序列雜湊不同 ${callsDiff}/${specs.length} 案（＝有 configureMatch 的 ${withMatch} 案）；setup 雜湊不同 ${setupDiff}/${specs.length} 案（規則集不同）`);
  ck(`G6 configure 序列只在有 configureMatch 的案不同（差異來自 phases／laneFrame 鍵與規則集，不多不少：${callsDiff}＝${withMatch}）；setup 雜湊每案都不同（${setupDiff}/${specs.length}）`,
    callsDiff === withMatch && setupDiff === specs.length);
  console.log(`ℹ G 段耗時 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

console.log(`\nC3 Phase Skeleton：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
