#!/usr/bin/env node
// ============================================================================
//  tools/measure_laneframe_c3.mjs — C3-1 laneFrame（TD-3A-23）的兩項量測：行為鏡像 gate（B1–B3＋負對照）與 D-20 side bias
//
//  設計、seeds、n、配對、公式、門檻全部讀自事前登記檔 tools/fixtures/laneframe_registration_c3.json（commit 166ade7，不得改）。
//  本檔不寫任何門檻數字；看了結果之後也不得改判準（登記檔 stopRule）。
//
//  用法（長任務，一律單線；workers ≤ 3；批次寫在 repo 之外，可中斷續跑；建立 <dir>/<study>/STOP 檔即在下一場前停下）：
//    node tools/measure_laneframe_c3.mjs --study=behavioural [--workers=3] [--dir=C:/Users/ifikn/esmo-measure/laneframe-c3]
//    node tools/measure_laneframe_c3.mjs --study=sidebias    [--workers=3] [--dir=...]   （career；sidebias-twin＝補充診斷）
//    node tools/measure_laneframe_c3.mjs --report            讀兩個 study 的批次 ⇒ 每個 gate 的判定、STOP／WARN 旗標，
//                                                            寫 tools/fixtures/laneframe_result_c3.json（含 gitHead＋v21 指紋）
//    node tools/measure_laneframe_c3.mjs --diagnostic --dir=<scratch>   ≤ 10 場的自我測試（**診斷用，結果丟棄**；不寫 result fixture）
//
//  ── behavioural（登記 gates.behavioural）──────────────────────────────────────────
//   規則集 balanceTool.v21（laneFrame teamRelative）；每個 seed（9001–9100）跑 STANDARD 與 SWAPPED（ESMO_BALANCE_LAYOUT 強制配置）。
//   臂：對照 std vs std；每個計畫 P 兩臂——P 在藍（紅 std）、P 在紅（藍 std）。負對照：std+top-split 在紅、laneFrame 覆寫成 legacyMirror。
//   指標（全部己方視角）：
//    B1 帶線 tick 裡屬於「己方路名＝計畫帶線路」那名選手的比例（每場、每個帶線計畫的那一側）；只有計畫有 splitLane 時適用。
//    B2 gankShare.<lane>：exec.{top,mid,bot}Ganks 以 worldLaneForSide 轉回己方路名（execInTeamFrame），佔該側抓人總數的比例。
//    B3 laneForward.<lane>：對線期（60–480 秒）該路職業（top／mid／adc）與己方主堡的平均距離（tacticTruthSim 同一個定義）。
//   差中差：effect_side(s,L) = m(P 在該側) − m(對照，同側、同 s、同 L)；D(s) = 兩個配置的 [effect_red − effect_blue] 平均；
//   z_diff = mean(D)/(sd(D)/√n)。只計四個值（兩配置 × 兩臂）都有值的 seed（事前定的納入規則）。
//  ── sidebias（Owner D-20；2026-10-20 修訂登記 tools/fixtures/laneframe_registration_c3_d20rev.json）──────────────
//   正式：career.v20 vs career.v21，走 Live 組裝路徑（prepareLiveMatch），配置由 seed 推導（不覆寫）；seeds 依固定順序
//   5001–6000 再接 9101 起，走到兩個配置都 ≥ 1000 個有效 seed 為止；同 seed 配對。整體與 m4 分層各套原登記的 STOP／WARN，
//   非 m4 對手必須逐場相同。  --study=sidebias-twin＝舊的工具孿生（balanceTool.v20/v21 強制配置），**只當補充診斷**。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fork, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const DEFAULT_DIR = "C:/Users/ifikn/esmo-measure/laneframe-c3";
const RESULT_FIXTURE = path.join(ROOT, "tools", "fixtures", "laneframe_result_c3.json");
const DT = 0.5, CAP_S = 3600, LANE_WINDOW = [60, 480];
const LANES = ["top", "mid", "bot"];
const LANE_ROLE = { top: "top", mid: "mid", bot: "adc" };

// ════════════════════════════════════════════════════════════════════════════
//   worker：單場模擬（只讀引擎狀態；不改引擎）
// ════════════════════════════════════════════════════════════════════════════
if (flag("lf-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  process.env.ESMO_BALANCE_TALENTS = "on";
  const { modules, configure, mirroredRoster } = await import("./balance/moba_items_balance_runner.mjs");
  const { tacticInputOf } = await import("./lib/tacticTruthSim.mjs");
  const M = await modules();
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  //  D-20 修訂（Owner 2026-10-20）：正式 career 規則集＝Live 的同一條組裝路徑（prepareLiveMatch），配置由 seed 推導、不覆寫。
  //  輸入骨架＝v20 golden 的 Live 輸入（選手素質／陣容／熟練 loadout＝tools/fixtures/match_golden_v20.json 的 inputs，旗標＝它的 featureFlags；
  //  v21 另開 mobaTacticalDirectorV21），名單＝runner 的 mirroredRoster(seed)（兩側同英雄），藍方＝戰術書 std binding、出裝 standard、無天賦選擇，
  //  對手＝AI_TEAMS[seed % 7]（固定指派，與勝負無關）→ Live 的紅方來源 mobaTacticForTeamStyle。
  let careerCtx = null;
  const careerOne = async (t) => {
    if (!careerCtx) {
      const [{ prepareLiveMatch }, { resolveLiveRuleset }, { aiTeamById, AI_TEAMS }, { appRoster }, { createTacticPlan }, { bindTacticPlanToCurrentVersions }] = await Promise.all([
        import("../src/useLocalServer.js"), import("../src/battle/moba/liveMatchSetup.js"),
        import("../src/platform/competition/aiTeams.js"), import("./lib/liveGolden.mjs"),
        import("../src/platform/tactics/tacticPlan.js"), import("../src/battle/moba/tactics/tacticResolver.js")]);
      const G = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "fixtures", "match_golden_v20.json"), "utf8"));
      //  藍方＝戰術書 std 模板的 binding（新開局的正式路徑）。⚠ 藍方完全不帶戰術時 Live 不呼叫 configureMatch，紅方風格也不會套用
      //  （2026-10-20 實測）⇒ v20／v21 必然逐場相同，量了等於沒量。
      const blueBinding = bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: "std", choices: {} }).plan);
      careerCtx = { prepareLiveMatch, resolveLiveRuleset, aiTeamById, AI_TEAMS, appRoster, G, blueBinding };
    }
    const C = careerCtx, G = C.G;
    const flags = Object.freeze({ ...G.featureFlags, ...(t.ruleset === "career.v21" ? { mobaTacticalDirectorV21: true } : {}) });
    const ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
    if (ruleset?.rulesetId !== t.ruleset) throw new Error(`career: flags resolved ${ruleset?.rulesetId}, wanted ${t.ruleset}`);
    const team = C.AI_TEAMS[t.seed % C.AI_TEAMS.length];
    const opts = { seed: t.seed, roster: C.appRoster(M.mirrored(t.seed)), buildStrategy: "standard", opponentId: team.id, sessionId: `laneframe-d20-${t.seed}`, mode: "moba", tacticPlanBinding: C.blueBinding };
    const out = C.prepareLiveMatch({ opts, seed: t.seed, seedSource: "session", ruleset,
      profile: { players: G.inputs.players, lineup: G.inputs.lineup }, heroProgress: { loadout: G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
    if (!out.ok) throw new Error(`career: prepareLiveMatch rejected (${out.stage}): ${JSON.stringify(out.errors).slice(0, 300)}`);
    const e = out.engine;
    //  開打前就檢查（不白跑 3600 秒）：沒有 Director ⇒ 紅方風格沒套上 ⇒ 該 seed 失敗。
    if (!e.director) throw new Error("career: no tactical director (configureMatch not called) — the red style would not apply");
    const redTacticId = e.director.knobs("red")?.tacticId ?? null;
    for (let i = 1; i * DT <= CAP_S && !e.over; i++) e.tick(DT);
    return { seed: t.seed, engineSeed: out.setup?.seed ?? null, layout: t.layout, layoutApplied: out.setup?.objectiveLayout ?? e.objectiveLayout ?? null, ruleset: out.setup?.rulesetId ?? null,
      laneFrame: e.director.laneFrame ?? null, directorMode: e.director.mode ?? null, opponentId: team.id, opponentStyle: team.style, redTacticId,
      duration: e.t, over: e.over ? 1 : 0, winner: e.winner ?? null };
  };
  const runOne = (t) => {
    //  runner 在呼叫當下讀這三個環境變數（layout／規則集／laneFrame 覆寫）；每場重設，不殘留。
    process.env.ESMO_BALANCE_LAYOUT = t.layout;
    process.env.ESMO_BALANCE_RULESET = t.ruleset;
    if (t.laneFrame) process.env.ESMO_BALANCE_LANEFRAME = t.laneFrame; else delete process.env.ESMO_BALANCE_LANEFRAME;
    const tactic = { blue: t.blueInput ?? tacticInputOf(t.blue), red: t.redInput ?? tacticInputOf(t.red) };
    const { e } = configure(t.seed, "standard", M, 1, null, tactic);
    const layoutApplied = e.objectiveLayout ?? null;
    const nexus = { blue: e.towers.blue_nexus.pos, red: e.towers.red_nexus.pos };
    const zero = () => ({ split: { top: 0, jungle: 0, mid: 0, adc: 0, sup: 0 }, fwdSum: { top: 0, mid: 0, adc: 0 }, fwdN: { top: 0, mid: 0, adc: 0 } });
    const S = { blue: zero(), red: zero() };
    for (let i = 1; i * DT <= CAP_S && !e.over; i++) {
      e.tick(DT);
      for (const p of e.players) {
        const s = S[p.side];
        if (p.state === "帶線") s.split[p.role]++;
        if (!p.dead && p.state === "對線" && e.t >= LANE_WINDOW[0] && e.t < LANE_WINDOW[1] && s.fwdSum[p.role] !== undefined) { s.fwdSum[p.role] += dist(p.pos, nexus[p.side]); s.fwdN[p.role]++; }
      }
    }
    const ex = e.snapshot().tacticExec;
    const side = (sd) => ({ ...S[sd], ganks: { top: ex[sd].topGanks, mid: ex[sd].midGanks, bot: ex[sd].botGanks } });
    return { seed: t.seed, layout: t.layout, layoutApplied, laneFrame: e.director?.laneFrame ?? null, duration: e.t, over: e.over ? 1 : 0, winner: e.winner ?? null, blue: side("blue"), red: side("red") };
  };
  M.mirrored = (seed) => mirroredRoster(seed, M);
  process.on("message", async (t) => {
    if (t?.type !== "run") return;
    try { process.send({ type: "done", id: t.id, rec: t.career ? await careerOne(t) : runOne(t) }); } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
} else {
  await main();
}

async function main() {
  //  環境守門（同 tools/lib/matchGoldenV21a.mjs）：workers 繼承整份 process.env；外面殘留的 ESMO_BALANCE_ROOT／RULES／
  //  LAYOUT／RULESET… 會默默污染每一場（ROOT 只在 teamRelative 臂會報錯，v20 臂會靜靜跑別棵樹）⇒ 開跑前一律拒絕。
  const envDirty = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));
  if (envDirty.length) { console.error(`環境裡有 ${envDirty.join(", ")}：量測必須在乾淨環境執行（請先清除）。`); process.exit(2); }
  const LF = await import("./lib/laneFrameC3.mjs");
  const REG = LF.REGISTRATION;
  const BEH = REG.gates.behavioural, SB = REG.gates.sideBias;
  const { worldLaneForSide } = await import("../src/gameData.js");
  const { nestedOf } = await import("../src/platform/tactics/tacticChoiceMapping.js");
  const { resolveTactic } = await import("../src/battle/moba/tactics/tacticResolver.js");
  const { tacticInputOf } = await import("./lib/tacticTruthSim.mjs");
  const { mobaTacticForTeamStyle } = await import("../src/platform/contracts/MobaTacticConfig.js");
  const { AI_TEAMS } = await import("../src/platform/competition/aiTeams.js");
  const SV = await import("../src/platform/contracts/simulationVersion.js");

  const range = (s) => { const [a, b] = String(s).split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); };
  const LAYOUTS = ["STANDARD", "SWAPPED"];

  // ── 設計（全部由登記檔推導）────────────────────────────────────────────────
  //  計畫：base std ＋ registryChoice "lanes.top.stance=split"；或 template。
  const armOf = (p) => {
    if (p.template) return { templateId: p.template, choices: {} };
    const [dim, choice] = p.registryChoice.split("=");
    return { templateId: p.base, choices: nestedOf([[dim, choice]]) };
  };
  const PLANS = BEH.plans.map((p) => ({ name: p.name, arm: armOf(p) }));
  const STD = { templateId: "std", choices: {} };
  //  計畫在己方視角的帶線路（B1 只對有 splitLane 的計畫適用）。
  const splitLaneOf = (arm) => { const r = resolveTactic(tacticInputOf(arm), {}, { identity: true }); if (!r?.ok) throw new Error(`plan rejected ${JSON.stringify(arm)}`); return r.knobs.splitLane ?? null; };
  for (const p of PLANS) p.splitLane = splitLaneOf(p.arm);
  const NEG_PLAN = PLANS.find((p) => p.name === "std+top-split");
  const BEH_SEEDS = range(BEH.seeds.range);
  const behaviouralArms = () => {
    const arms = [{ key: "control", blue: STD, red: STD, laneFrame: null }];
    for (const p of PLANS) {
      arms.push({ key: `${p.name}@blue`, plan: p.name, side: "blue", blue: p.arm, red: STD, laneFrame: null });
      arms.push({ key: `${p.name}@red`, plan: p.name, side: "red", blue: STD, red: p.arm, laneFrame: null });
    }
    //  負對照：同一設計、laneFrame 覆寫成 legacyMirror，帶線計畫在紅方（登記：B1 必須對紅方失敗）。
    arms.push({ key: `neg:${NEG_PLAN.name}@red`, plan: NEG_PLAN.name, side: "red", blue: STD, red: NEG_PLAN.arm, laneFrame: "legacyMirror", negative: true });
    return arms;
  };
  //  side bias：登記比較 career.v21 vs career.v20、STANDARD／SWAPPED 每個配置 n=1000 個 seed。
  //  ⚠ 正式規則集（career.*）的 objectiveLayout 是 bySeed 且被 matchSetup 鎖定（production 不收 tool.forcedLayout、
  //    explicit layout 必須等於 seed 推導值，src/platform/contracts/matchSetup.js），無法「同一個 seed 各跑兩個配置」。
  //    因此以工具孿生量測：balanceTool.v20 ≡ career.v20、balanceTool.v21 ≡ career.v21 的引擎面（同一 simVersion、
  //    同一組 heroSkills／passives／curve／talents／items／tacticIdentity、同一 tacticalDirector 與 laneFrame）；
  //    紅方戰術＝生涯 AI 對手的風格模板（AI_TEAMS[seed % 7].style → mobaTacticForTeamStyle，即 Live 的紅方來源），藍方 std。
  //    差別（不影響兩規則集之間的配對比較）：沒有選手素質（playerStatSides）、出裝走工具的 toEngineItems standard。
  //    這是設計上的偏離，結果檔兩個名字都記（requested／measuredWith），開跑前須由 controller／Owner 接受。
  const SIDEBIAS_DESIGN = {
    requested: SB.comparison, measuredWith: { "career.v20": "balanceTool.v20", "career.v21": "balanceTool.v21" },
    why: "production career rulesets cannot force STANDARD/SWAPPED (matchSetup: bySeed production layouts are pinned to the seed-derived layout); tool twins carry the same engine-facing layers",
    red: "AI_TEAMS[seed % AI_TEAMS.length].style -> mobaTacticForTeamStyle (legacy config; the career opponent source)", blue: "std",
  };
  const SB_SEEDS = range(SB.seeds);
  const redForSeed = (s) => ({ kind: "legacy", config: JSON.parse(JSON.stringify(mobaTacticForTeamStyle(AI_TEAMS[s % AI_TEAMS.length].style))) });
  const sidebiasArms = () => ["balanceTool.v20", "balanceTool.v21"].map((rid) => ({ key: rid, ruleset: rid, blue: STD, redOfSeed: true }));

  //  ── D-20 修訂（Owner 2026-10-20；tools/fixtures/laneframe_registration_c3_d20rev.json）：正式 career 規則集 ──────────
  //  上面的工具孿生（sidebias-twin）只當補充診斷，永遠不當 career 驗收。
  const REV = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "fixtures", "laneframe_registration_c3_d20rev.json"), "utf8")).sideBias;
  const { objectiveLayoutForSeed } = await import("../src/platform/contracts/objectiveLayout.js");
  const { normalizeLiveSeed } = await import("../src/battle/moba/liveMatchSetup.js");
  const SO = REV.seedOrder;
  const CAREER_TARGET = SO.targetPerLayout, CAREER_SEED_LIMIT = SO.walkLimit;
  const careerArms = () => ["career.v20", "career.v21"].map((rid) => ({ key: rid, ruleset: rid, career: true }));
  //  計數單位＝Live 正規化後的 effectiveSeed（normalizeLiveSeed(s, "session") = (s>>>0)|1）。只走奇數 ⇒ effectiveSeed＝s，
  //  每個樣本的引擎種子都不同；走 seed 時再驗一次（不是奇數、或 effectiveSeed 重複 ⇒ 工具直接丟錯，不默默計數）。
  const effectiveSeedOf = (s) => normalizeLiveSeed(s, "session");
  const layoutOf = (s) => objectiveLayoutForSeed(effectiveSeedOf(s));
  const careerSequence = function* () {
    const seen = new Set();
    for (const [a, b] of SO.segments) for (let s = a; b === null ? s <= CAREER_SEED_LIMIT : s <= b; s += SO.step) {
      const eff = effectiveSeedOf(s);
      if (eff !== s || seen.has(eff)) throw new Error(`career seed order: seed ${s} -> effectiveSeed ${eff} is not unique/identity (registration requires odd seeds)`);
      seen.add(eff);
      yield s;
    }
  };
  const tacticIdOfSeed = (s) => mobaTacticForTeamStyle(AI_TEAMS[s % AI_TEAMS.length].style).tacticId;
  /** 依固定順序走 seed：已知無效的跳過但列出；兩個配置都 ≥ 目標個有效 seed 就停。 */
  const careerPlan = (invalid) => {
    const seeds = [], n = { STANDARD: 0, SWAPPED: 0 };
    for (const s of careerSequence()) {
      seeds.push(s);
      if (!invalid.has(s)) n[layoutOf(s)]++;
      if (n.STANDARD >= CAREER_TARGET && n.SWAPPED >= CAREER_TARGET) return { seeds, n, reached: true };
    }
    return { seeds, n, reached: false };
  };
  const readErrors = (dir, key) => { const f = fileOf(dir, `${key}.errors`); if (!fs.existsSync(f)) return new Map(); const m = new Map(); for (const l of fs.readFileSync(f, "utf8").split("\n")) { if (!l.trim()) continue; try { const o = JSON.parse(l); m.set(o.seed, o.error); } catch { /* 半行 */ } } return m; };
  //  每筆紀錄的臂身分（登記 validSeed）：v20 ⇒ static／legacyMirror；v21 ⇒ core.v1／teamRelative；紅方戰術＝該 seed 指派的風格。
  const ARM_IDENTITY = { "career.v20": { directorMode: "static", laneFrame: "legacyMirror" }, "career.v21": { directorMode: "core.v1", laneFrame: "teamRelative" } };
  const recordProblem = (a, r) => {
    const want = ARM_IDENTITY[a];
    if (r.ruleset !== a) return `ran ruleset ${r.ruleset}`;
    if (r.engineSeed !== effectiveSeedOf(r.seed)) return `engine seed ${r.engineSeed} ≠ effectiveSeed ${effectiveSeedOf(r.seed)}`;
    if (r.layoutApplied !== layoutOf(r.seed)) return `ran layout ${r.layoutApplied} ≠ ${layoutOf(r.seed)}`;
    if (r.directorMode !== want.directorMode || r.laneFrame !== want.laneFrame) return `director ${r.directorMode}/${r.laneFrame} ≠ ${want.directorMode}/${want.laneFrame}`;
    if (r.redTacticId !== tacticIdOfSeed(r.seed)) return `red tactic ${r.redTacticId} ≠ ${tacticIdOfSeed(r.seed)}`;
    return null;
  };
  const careerState = (dir) => {
    const recs = Object.fromEntries(careerArms().map((a) => [a.key, readBatch(dir, a.key)]));
    const errs = Object.fromEntries(careerArms().map((a) => [a.key, readErrors(dir, a.key)]));
    const invalid = new Map();
    for (const a of careerArms()) {
      for (const [s, e] of errs[a.key]) invalid.set(s, `${a.key}: ${String(e).slice(0, 200)}`);
      for (const r of recs[a.key].values()) { const p = recordProblem(a.key, r); if (p) invalid.set(r.seed, `${a.key}: ${p}`); }
    }
    return { recs, errs, invalid };
  };
  //  斷路器（登記 seedOrder.circuitBreaker）：無效 seed 超過上限 ⇒ 停止排程、STOP 交 Owner（不默默一路走到上限）。
  const breakerTripped = (invalidCount, walked) => invalidCount > SO.circuitBreaker.maxInvalidSeeds
    || (walked >= SO.circuitBreaker.minWalkedForShare && invalidCount / walked > SO.circuitBreaker.maxInvalidShare);

  // ── 批次檔 ──────────────────────────────────────────────────────────────
  const baseDir = path.resolve(val("dir", DEFAULT_DIR));
  if (baseDir.toLowerCase().startsWith(ROOT.toLowerCase())) { console.error(`--dir 必須在 repo 之外：${baseDir}`); process.exit(2); }
  const fileOf = (dir, key) => path.join(dir, `${key.replace(/[^A-Za-z0-9._@-]+/g, "_")}.jsonl`);
  const readBatch = (dir, key) => {
    const m = new Map();
    const f = fileOf(dir, key);
    if (!fs.existsSync(f)) return m;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const o = JSON.parse(line); m.set(`${o.seed}|${o.layout}`, o.rec); } catch { /* 中斷時寫了一半的最後一行：當作沒做 */ }
    }
    return m;
  };
  const gitHead = () => { try { return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch (e) { return `unknown (${String(e?.message ?? e).slice(0, 60)})`; } };
  const gitDirty = () => { try { return execSync("git status --porcelain -- src tools", { cwd: ROOT }).toString().trim().split("\n").filter(Boolean).length; } catch { return null; } };
  const provenance = () => ({ gitHead: gitHead(), dirtyFilesUnderSrcTools: gitDirty(), simulationVersion: SV.MOBA_SIMULATION_VERSION,
    fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] });

  // ── 執行（workers ≤ 3）─────────────────────────────────────────────────────
  async function runTasks(dir, tasks, totalKeys) {
    const MAX = Math.min(3, BEH.workers ?? 3);
    const workers = Math.max(1, Math.min(MAX, Number(val("workers", MAX))));
    const t0 = Date.now();
    let next = 0, finished = 0, failed = 0, stopped = false, lastPct = -1;
    const bar = (x, n) => { const k = Math.round((x / n) * 20); return `[${"█".repeat(k)}${"░".repeat(20 - k)}]`; };
    console.log(`待跑 ${tasks.length} 場（${totalKeys} 臂），workers=${workers}，資料夾 ${dir}`);
    if (!tasks.length) return { finished, failed, stopped };
    await new Promise((done) => {
      let alive = 0;
      const spawn = () => {
        const child = fork(SELF, ["--lf-worker"], { env: { ...process.env }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
        alive++;
        const feed = () => {
          if (fs.existsSync(path.join(dir, "STOP"))) stopped = true;
          if (stopped || next >= tasks.length) { child.kill(); return; }
          child.send({ type: "run", ...tasks[next++] });
        };
        child.on("message", (m) => {
          if (m.type === "ready") return feed();
          const t = tasks.find((x) => x.id === m.id);
          if (m.type === "done") {
            fs.appendFileSync(fileOf(dir, t.key), `${JSON.stringify({ seed: t.seed, layout: t.layout, rec: m.rec })}\n`);
            finished++;
            const pct = Math.floor((finished / tasks.length) * 20);
            if (pct !== lastPct) {
              lastPct = pct;
              const el = (Date.now() - t0) / 1000, per = el / finished, left = (tasks.length - finished) * per;
              console.log(`${bar(finished, tasks.length)} ${String(Math.round((finished / tasks.length) * 100)).padStart(3)}%  ${finished}/${tasks.length} 場  已 ${(el / 60).toFixed(1)} 分，預估剩 ${(left / 60).toFixed(1)} 分（${per.toFixed(2)} 秒/場，${workers} workers）`);
            }
          } else if (m.type === "error") {
            failed++; console.log(`✗ ${m.id}: ${String(m.error).slice(0, 300)}`);
            //  career：失敗就是該 seed 無效（決定性，重跑也一樣）⇒ 記下來，走 seed 時跳過並列在結果裡。
            if (t.career) fs.appendFileSync(fileOf(dir, `${t.key}.errors`), `${JSON.stringify({ seed: t.seed, error: String(m.error).slice(0, 2000) })}\n`);
          }
          feed();
        });
        child.on("exit", () => { alive--; if (alive === 0) done(); });
      };
      for (let i = 0; i < Math.min(workers, tasks.length); i++) spawn();
    });
    const el = (Date.now() - t0) / 1000;
    console.log(`本輪 ${finished} 場、失敗 ${failed}，${(el / 60).toFixed(1)} 分（${(el / Math.max(1, finished)).toFixed(2)} 秒/場）${stopped ? "；依 STOP 停止（再執行同一指令會續跑）" : ""}`);
    return { finished, failed, stopped };
  }
  const taskFor = (study, arm, seed, layout) => {
    if (study === "sidebias-career") return { id: `${arm.key}#${seed}#${layout}`, key: arm.key, seed, layout, ruleset: arm.ruleset, career: true };
    if (study === "sidebias") return { id: `${arm.key}#${seed}#${layout}`, key: arm.key, seed, layout, ruleset: arm.ruleset, laneFrame: null, blue: arm.blue, redInput: redForSeed(seed) };
    return { id: `${arm.key}#${seed}#${layout}`, key: arm.key, seed, layout, ruleset: BEH.ruleset, laneFrame: arm.laneFrame, blue: arm.blue, red: arm.red };
  };
  async function runStudy(study, dir, { seeds, layouts, arms, diagnostic = false }) {
    const prov = provenance();
    //  來源可追溯：gitHead 只在工作區乾淨時才代表「量的是哪份程式」；指紋是 simulationVersion.js 的常數，改檔不會自己變。
    //  ⇒ 正式研究在 src／tools 有未提交變更時拒絕開跑或續跑（先 commit 再量）。診斷模式不受限（結果本來就丟棄）。
    if (!diagnostic && prov.dirtyFilesUnderSrcTools !== 0) { console.error(`src／tools 有 ${prov.dirtyFilesUnderSrcTools ?? "?"} 個未提交變更：正式研究必須在已 commit 的程式上跑（gitHead 才可追溯）。`); process.exit(2); }
    fs.mkdirSync(dir, { recursive: true });
    const metaFile = path.join(dir, "meta.json");
    if (!fs.existsSync(metaFile)) fs.writeFileSync(metaFile, JSON.stringify({ study, startedAt: new Date().toISOString(), ...prov,
      design: study === "sidebias" ? { ...SIDEBIAS_DESIGN, role: "supplementary diagnostic only (Owner 2026-10-20)" } : study === "sidebias-career" ? REV : { plans: PLANS } }, null, 2));
    else {
      const m = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      if (m.fingerprint !== prov.fingerprint || m.gitHead !== prov.gitHead) { console.error(`⚠ 這個資料夾的批次是在 ${m.gitHead}／指紋 ${m.fingerprint} 下開始的，目前是 ${prov.gitHead}／${prov.fingerprint}：不得混跑。換一個 --dir 或刪掉舊批次（由 Owner／controller 決定）。`); process.exit(2); }
    }
    const tasks = [];
    for (const arm of arms) {
      const have = readBatch(dir, arm.key);
      const failedBefore = study === "sidebias-career" ? readErrors(dir, arm.key) : new Map();
      for (const s of seeds) for (const L of layouts ?? [layoutOf(s)]) if (!have.has(`${s}|${L}`) && !failedBefore.has(s)) tasks.push(taskFor(study, arm, s, L));
    }
    return runTasks(dir, tasks, arms.length);
  }
  /** career：每個 seed 只跑它自己推導出的配置；依固定順序、每輪最多 SO.chunkSeeds 個 seed，補到兩個配置都 ≥ 目標個有效 seed；
   *  每輪之間檢查斷路器（無效 seed 讓計畫走得更遠，但超過上限就停）。 */
  async function runCareer(dir) {
    let total = { finished: 0, failed: 0, stopped: false, breaker: false };
    for (let round = 0; round < 1000; round++) {
      fs.mkdirSync(dir, { recursive: true });
      const st = careerState(dir), plan = careerPlan(st.invalid);
      const walked = plan.seeds.filter((s) => careerArms().every((a) => st.recs[a.key].has(`${s}|${layoutOf(s)}`) || st.errs[a.key].has(s))).length;
      if (breakerTripped(st.invalid.size, walked)) { console.error(`⛔ 斷路器：無效 seed ${st.invalid.size}／已走 ${walked}，超過登記上限 ⇒ 停止排程，STOP 交 Owner。`); return { ...total, breaker: true }; }
      const todo = plan.seeds.filter((s) => careerArms().some((a) => !st.recs[a.key].has(`${s}|${layoutOf(s)}`) && !st.errs[a.key].has(s)));
      console.log(`career 第 ${round + 1} 輪：計畫 ${plan.seeds.length} 個 seed（${plan.seeds[0]}…${plan.seeds.at(-1)}；有效 STANDARD ${plan.n.STANDARD}／SWAPPED ${plan.n.SWAPPED}${plan.reached ? "" : "，尚未達標"}；已知無效 ${st.invalid.size}），尚缺 ${todo.length} 個 seed`);
      if (!todo.length) return total;
      const r = await runStudy("sidebias-career", dir, { seeds: todo.slice(0, SO.chunkSeeds), layouts: null, arms: careerArms() });
      total = { ...total, finished: total.finished + r.finished, failed: total.failed + r.failed, stopped: r.stopped };
      if (r.stopped) return total;
    }
    return total;
  }

  // ── 統計（純函式）──────────────────────────────────────────────────────────
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sdOf = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
  const zOf = (xs) => { if (xs.length < 2) return null; const m = mean(xs), sd = sdOf(xs); return sd === 0 ? (m === 0 ? 0 : Math.sign(m) * 99) : m / (sd / Math.sqrt(xs.length)); };
  const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
  const r6 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(6)));
  /** execInTeamFrame（TD-3A-23 §2.7 的 helper；本工具內的實作，只用 gameData.js 的 worldLaneForSide）：世界路計數 → 己方路名。 */
  const ganksInTeamFrame = (side, g) => Object.fromEntries(LANES.map((L) => [L, g[worldLaneForSide(side, L)]]));
  const metricOf = (rec, side, id) => {
    const [name, lane] = id.split(".");
    const s = rec[side];
    if (name === "gankShare") { const tf = ganksInTeamFrame(side, s.ganks); const tot = tf.top + tf.mid + tf.bot; return tot > 0 ? tf[lane] / tot : null; }
    if (name === "laneForward") { const role = LANE_ROLE[lane]; return s.fwdN[role] >= 20 ? s.fwdSum[role] / s.fwdN[role] : null; }
    throw new Error(`unknown metric ${id}`);
  };
  const B2_METRICS = LANES.map((L) => `gankShare.${L}`), B3_METRICS = LANES.map((L) => `laneForward.${L}`);
  const isShare = (id) => id.startsWith("gankShare.");
  /** B1：一場一側的己方帶線路選手比例（沒有任何帶線 tick ⇒ null）。 */
  const b1Share = (rec, side, teamLane) => { const sp = rec[side].split; const tot = Object.values(sp).reduce((a, b) => a + b, 0); return tot > 0 ? { share: sp[LANE_ROLE[teamLane]] / tot, own: sp[LANE_ROLE[teamLane]], tot } : null; };

  function behaviouralVerdict(dir, seeds, { full }) {
    const B = Object.fromEntries(behaviouralArms().map((a) => [a.key, readBatch(dir, a.key)]));
    const complete = Object.entries(B).every(([, m]) => seeds.every((s) => LAYOUTS.every((L) => m.has(`${s}|${L}`))));
    const flags = [];
    const layoutMismatch = Object.values(B).flatMap((m) => [...m.values()]).filter((r) => r.layoutApplied && r.layoutApplied !== r.layout).length;
    const frameMismatch = Object.entries(B).flatMap(([k, m]) => [...m.values()].map((r) => ({ k, r }))).filter(({ k, r }) => r.laneFrame !== (k.startsWith("neg:") ? "legacyMirror" : BEH.laneFrame)).length;
    // B1
    const b1 = [];
    for (const p of PLANS.filter((x) => x.splitLane)) for (const side of ["blue", "red"]) {
      const m = B[`${p.name}@${side}`];
      const shares = [...m.values()].map((r) => b1Share(r, side, p.splitLane));
      const measured = shares.filter(Boolean);
      const minShare = measured.length ? Math.min(...measured.map((x) => x.share)) : null;
      const pass = measured.length > 0 && measured.every((x) => x.share >= 0.99);
      //  登記是「每一場」：有場次沒有任何帶線 tick ⇒ 該臂不得判 pass（n_reduced，Owner 決定）；量到的場次有 < 0.99 仍判 fail。
      const noSplit = shares.length - measured.length;
      b1.push({ arm: `${p.name}@${side}`, splitLane: p.splitLane, matches: shares.length, withSplitTicks: measured.length, noSplitTicks: noSplit, minShare: r6(minShare),
        verdict: !measured.length ? "unmeasurable" : !pass ? "fail" : noSplit ? "n_reduced" : "pass" });
    }
    const negM = [...B[`neg:${NEG_PLAN.name}@red`].values()].map((r) => b1Share(r, "red", NEG_PLAN.splitLane)).filter(Boolean);
    const negOwn = negM.reduce((a, x) => a + x.own, 0), negTot = negM.reduce((a, x) => a + x.tot, 0);
    const negPooled = negTot ? negOwn / negTot : null;
    const negative = { arm: `neg:${NEG_PLAN.name}@red`, laneFrame: "legacyMirror", withSplitTicks: negM.length, pooledOwnLaneShare: r6(negPooled),
      maxMatchShare: r6(negM.length ? Math.max(...negM.map((x) => x.share)) : null),
      verdict: negPooled === null ? "unmeasurable" : negPooled < 0.5 ? "fails-as-required" : "did-not-fail" };
    // B2／B3（差中差）
    const rows = [];
    for (const p of PLANS) for (const id of [...B2_METRICS, ...B3_METRICS]) {
      const D = [], effB = [], effR = [];
      for (const s of seeds) {
        const per = LAYOUTS.map((L) => {
          const c = B.control.get(`${s}|${L}`), pb = B[`${p.name}@blue`].get(`${s}|${L}`), pr = B[`${p.name}@red`].get(`${s}|${L}`);
          if (!c || !pb || !pr) return null;
          const v = [metricOf(pb, "blue", id), metricOf(c, "blue", id), metricOf(pr, "red", id), metricOf(c, "red", id)];
          if (v.some((x) => x === null)) return null;
          return { eb: v[0] - v[1], er: v[2] - v[3] };
        });
        if (per.some((x) => x === null)) continue;
        effB.push(mean(per.map((x) => x.eb))); effR.push(mean(per.map((x) => x.er)));
        D.push(mean(per.map((x) => x.er - x.eb)));
      }
      const n = D.length;
      const mD = n ? mean(D) : null, zD = zOf(D), mB = n ? mean(effB) : null, mR = n ? mean(effR) : null, zB = zOf(effB), zR = zOf(effR);
      const tol = isShare(id) ? 0.05 : mB === null ? null : 0.05 * Math.abs(mB);
      const tolOk = mD !== null && tol !== null && Math.abs(mD) <= tol;
      const zOk = zD !== null && Math.abs(zD) < 2;
      const sameSignApplies = zB !== null && Math.abs(zB) >= 2;
      const sameSignOk = !sameSignApplies || Math.sign(mB) === Math.sign(mR);
      //  缺值規則（2026-10-20 在看到任何正式資料之前定下，之後不改）：某 seed 任一配置的 8 個值有 null
      //  （該側整場 0 次 gank，或對線樣本 fwdN < 20）⇒ 該 seed 排除並計數；登記要求 n = 全部 seed ⇒
      //  n < nSeeds 的列**不得判 pass**，判 n_reduced 交 Owner 決定；量到的部分已經不符合仍判 fail。
      const verdict = n < 2 ? "unmeasurable" : !(zOk && tolOk && sameSignOk) ? "fail" : n < seeds.length ? "n_reduced" : "pass";
      rows.push({ gate: isShare(id) ? "B2" : "B3", plan: p.name, metric: id, metricType: isShare(id) ? "share" : "non-share", n, nSeeds: seeds.length,
        meanEffectBlue: r6(mB), zEffectBlue: r6(zB), meanEffectRed: r6(mR), zEffectRed: r6(zR), meanD: r6(mD), sdD: r6(n > 1 ? sdOf(D) : null), zDiff: r6(zD),
        tolerance: r6(tol), zDiffOk: zOk, toleranceOk: tolOk, sameSignApplies, sameSignOk, verdict });
    }
    //  gate 狀態：任何一列 fail／unmeasurable ⇒ fail；其餘有 n_reduced ⇒ n_reduced（不是 pass，也不是 STOP 的「不符合」）；全 pass ⇒ pass。
    const gateOf = (xs) => (xs.length && xs.every((x) => x.verdict === "pass") ? "pass" : xs.length && xs.every((x) => x.verdict === "pass" || x.verdict === "n_reduced") ? "n_reduced" : "fail");
    const g = { B1: gateOf(b1), B2: gateOf(rows.filter((r) => r.gate === "B2")), B3: gateOf(rows.filter((r) => r.gate === "B3")) };
    const B1ok = g.B1 === "pass", B2ok = g.B2 === "pass", B3ok = g.B3 === "pass";
    const negOk = negative.verdict === "fails-as-required";
    const anyFail = Object.values(g).includes("fail") || !negOk;
    const anyReduced = Object.values(g).includes("n_reduced");
    if (!complete) flags.push("INCOMPLETE: not every arm × seed × layout is present");
    if (complete && full && anyReduced) flags.push(`N_REDUCED: ${b1.filter((x) => x.verdict === "n_reduced").length} B1 arms with no-split matches, ${rows.filter((r) => r.verdict === "n_reduced").length} B2/B3 rows with n < ${seeds.length} — registration requires full n; Owner decides (not a pass)`);
    if (!full) flags.push("DIAGNOSTIC: reduced n — not a gate result (registration fullN)");
    if (layoutMismatch) flags.push(`LAYOUT_MISMATCH: ${layoutMismatch} records did not run the forced layout`);
    if (frameMismatch) flags.push(`LANEFRAME_MISMATCH: ${frameMismatch} records ran a different laneFrame than their arm`);
    if (complete && full && (anyFail || anyReduced)) flags.push(anyFail ? "STOP: a registered behavioural gate failed — keep the checkpoint, Owner decides (tolerances are never changed)" : "STOP: reduced n (see N_REDUCED) — keep the checkpoint, Owner decides");
    const verdict = !complete || !full ? "incomplete" : layoutMismatch || frameMismatch || anyFail ? "fail" : anyReduced ? "n_reduced" : "pass";
    const interpretation = {
      negativeControl: "run on the red top-split arm only (the plan with a splitLane), legacyMirror override; criterion = pooled own-lane split share over all its matches < 0.5 (registered falsifiable criterion)",
      missingValues: "B1: matches with no split tick are counted (noSplitTicks) and make the arm n_reduced; B2/B3: a seed with any null among its 8 values is excluded and counted; any n < nSeeds ⇒ n_reduced (never pass). Rule fixed 2026-10-20 before any full-study data.",
    };
    return { verdict, complete, full, gates: { ...g, negativeControl: negOk ? "pass" : "fail" }, b1, negative, rows, flags, interpretation };
  }

  function sidebiasVerdict(dir, seeds, { full }) {
    const B = Object.fromEntries(sidebiasArms().map((a) => [a.key, readBatch(dir, a.key)]));
    const complete = Object.values(B).every((m) => seeds.every((s) => LAYOUTS.every((L) => m.has(`${s}|${L}`))));
    const blueWin = (r) => (r.winner === "blue" ? 1 : r.winner === "red" ? 0 : 0.5);
    const out = { layouts: {}, flags: [] };
    let stop = false, warn = false;
    for (const L of LAYOUTS) {
      const pairs = seeds.map((s) => [B["balanceTool.v20"].get(`${s}|${L}`), B["balanceTool.v21"].get(`${s}|${L}`)]).filter(([a, b]) => a && b);
      if (!pairs.length) { out.layouts[L] = { n: 0 }; continue; }
      const w20 = pairs.map(([a]) => blueWin(a)), w21 = pairs.map(([, b]) => blueWin(b));
      const bias20 = mean(w20) - 0.5, bias21 = mean(w21) - 0.5;
      const worsePp = (Math.abs(bias21) - Math.abs(bias20)) * 100;
      const sgn = Math.sign(bias20) !== 0 ? Math.sign(bias20) : Math.sign(bias21);
      const d = pairs.map((_, i) => (w21[i] - w20[i]) * sgn);
      const z = zOf(d);
      const med20 = median(pairs.map(([a]) => a.duration)), med21 = median(pairs.map(([, b]) => b.duration));
      const durRatioChange = med20 ? med21 / med20 - 1 : null;
      const noWinner = pairs.filter(([a, b]) => !a.winner || !b.winner).length;
      const layoutMismatch = pairs.filter(([a, b]) => (a.layoutApplied && a.layoutApplied !== L) || (b.layoutApplied && b.layoutApplied !== L)).length;
      const lStop = worsePp >= SB.stop.sideBiasWorseByAtLeastPp || (z !== null && z >= SB.stop.orAbsZAtLeastInWorseningDirection);
      const lWarn = worsePp >= SB.warning.sideBiasWorseByAtLeastPp || (durRatioChange !== null && Math.abs(durRatioChange) > SB.warning.orMedianDurationRatioChangeOver);
      stop ||= lStop; warn ||= lWarn;
      out.layouts[L] = { n: pairs.length, blueWinRate20: r6(mean(w20)), blueWinRate21: r6(mean(w21)), bias20: r6(bias20), bias21: r6(bias21), worsePp: r6(worsePp),
        meanD: r6(mean(d)), zWorsening: r6(z), medianDuration20: r6(med20), medianDuration21: r6(med21), medianDurationRatioChange: r6(durRatioChange),
        noWinnerPairs: noWinner, layoutMismatch, stop: lStop, warn: lWarn };
      if (layoutMismatch) out.flags.push(`LAYOUT_MISMATCH(${L}): ${layoutMismatch}`);
    }
    if (!complete) out.flags.push("INCOMPLETE: not every ruleset × seed × layout is present");
    if (!full) out.flags.push("DIAGNOSTIC: reduced n — not a gate result");
    if (complete && full && stop) out.flags.push("STOP: side bias worse ≥ registered pp or z ≥ registered threshold — ask Owner");
    if (complete && full && warn) out.flags.push("WARN: side bias worse ≥ warning pp or median duration change > 10 %");
    out.flags.push("NEW_REGRESSION: not measured here — the controller checks clarifications.newRegressionGates separately (any newly red gate = STOP)");
    out.verdict = !complete || !full ? "incomplete" : stop ? "stop" : warn ? "warn" : "pass";
    out.interpretation = { draws: "a match with no winner counts 0.5 in the blue win rate (not registered; noWinnerPairs reported per layout)" };
    out.design = SIDEBIAS_DESIGN;
    return out;
  }

  /** D-20 修訂的判定（登記 laneframe_registration_c3_d20rev.json）：整體依配置套原登記的 STOP／WARN；m4 分層只有配對 z ≥ 門檻才 STOP，
   *  worse_pp ≥ 門檻標 OWNER_REVIEW（一定回報、不自動放行）；非 m4 必須逐場相同。門檻旗標只在資料完整時發（避免中途偷看）。 */
  function careerVerdict(dir) {
    const st = careerState(dir), plan = careerPlan(st.invalid);
    const blueWin = (r) => (r.winner === "blue" ? 1 : r.winner === "red" ? 0 : 0.5);
    const missing = plan.seeds.filter((s) => !st.invalid.has(s) && careerArms().some((a) => !st.recs[a.key].has(`${s}|${layoutOf(s)}`)));
    const walked = plan.seeds.filter((s) => careerArms().every((a) => st.recs[a.key].has(`${s}|${layoutOf(s)}`) || st.errs[a.key].has(s))).length;
    const breaker = breakerTripped(st.invalid.size, walked);
    const complete = plan.reached && missing.length === 0 && !breaker;
    const pairsOf = (L, pred) => plan.seeds.filter((s) => !st.invalid.has(s) && layoutOf(s) === L && pred(s))
      .map((s) => [st.recs["career.v20"].get(`${s}|${L}`), st.recs["career.v21"].get(`${s}|${L}`)]).filter(([a, b]) => a && b);
    const stat = (pairs) => {
      if (!pairs.length) return { n: 0 };
      const w20 = pairs.map(([a]) => blueWin(a)), w21 = pairs.map(([, b]) => blueWin(b));
      const bias20 = mean(w20) - 0.5, bias21 = mean(w21) - 0.5;
      const worsePp = (Math.abs(bias21) - Math.abs(bias20)) * 100;
      const sgn = Math.sign(bias20) !== 0 ? Math.sign(bias20) : Math.sign(bias21);
      const d = pairs.map((_, i) => (w21[i] - w20[i]) * sgn);
      const z = zOf(d);
      const med20 = median(pairs.map(([a]) => a.duration)), med21 = median(pairs.map(([, b]) => b.duration));
      const durRatioChange = med20 ? med21 / med20 - 1 : null;
      const stop = worsePp >= SB.stop.sideBiasWorseByAtLeastPp || (z !== null && z >= SB.stop.orAbsZAtLeastInWorseningDirection);
      const warn = worsePp >= SB.warning.sideBiasWorseByAtLeastPp || (durRatioChange !== null && Math.abs(durRatioChange) > SB.warning.orMedianDurationRatioChangeOver);
      return { n: pairs.length, blueWinRate20: r6(mean(w20)), blueWinRate21: r6(mean(w21)), bias20: r6(bias20), bias21: r6(bias21), worsePp: r6(worsePp),
        meanD: r6(mean(d)), zWorsening: r6(z), pairsChangedOutcome: pairs.filter(([a, b]) => blueWin(a) !== blueWin(b)).length,
        medianDuration20: r6(med20), medianDuration21: r6(med21), medianDurationRatioChange: r6(durRatioChange),
        noWinnerPairs: pairs.filter(([a, b]) => !a.winner || !b.winner).length, stop, warn };
    };
    const isM4 = (s) => tacticIdOfSeed(s) === "m4";
    const out = { overall: {}, m4: {}, nonM4Identity: {}, flags: [] };
    let stop = false, warn = false, anomalies = 0;
    for (const L of LAYOUTS) {
      out.overall[L] = stat(pairsOf(L, () => true));
      out.m4[L] = stat(pairsOf(L, isM4));
      const sym = pairsOf(L, (s) => !isM4(s));
      const diff = sym.filter(([a, b]) => a.winner !== b.winner || a.duration !== b.duration);
      anomalies += diff.length;
      out.nonM4Identity[L] = { n: sym.length, differing: diff.length, examples: diff.slice(0, 5).map(([a, b]) => ({ seed: a.seed, v20: [a.winner, a.duration], v21: [b.winner, b.duration] })) };
      const o = out.overall[L], m = out.m4[L];
      //  m4（Owner 2026-10-20）：STOP 只看配對 z；worse_pp 只當「需 Owner 判讀」的旗標；不套 WARN。
      m.stop = m.zWorsening !== null && m.zWorsening >= SB.stop.orAbsZAtLeastInWorseningDirection;
      m.ownerReview = m.worsePp !== null && m.worsePp >= SB.stop.sideBiasWorseByAtLeastPp;
      delete m.warn;
      if (complete) {
        if (o.stop) { stop = true; out.flags.push(`STOP(overall, ${L}): worse_pp ${o.worsePp} / z ${o.zWorsening} — ask Owner`); }
        if (o.warn) { warn = true; out.flags.push(`WARN(overall, ${L}): worse_pp ${o.worsePp} / median duration change ${o.medianDurationRatioChange}`); }
        if (m.stop) { stop = true; out.flags.push(`STOP(m4, ${L}): paired z ${m.zWorsening} ≥ ${SB.stop.orAbsZAtLeastInWorseningDirection} — ask Owner`); }
        if (m.ownerReview) out.flags.push(`OWNER_REVIEW(m4, ${L}): worse_pp ${m.worsePp} ≥ ${SB.stop.sideBiasWorseByAtLeastPp} (z ${m.zWorsening}) — reported for Owner judgement, not an automatic pass`);
      }
    }
    //  ANOMALY 不受完整性限制：只要出現就是程式行為與預期不符。
    if (anomalies) { stop = true; out.flags.push(`STOP(ANOMALY): ${anomalies} non-m4 pairs differ between career.v20 and career.v21 (expected identical) — ask Owner`); }
    if (breaker) { stop = true; out.flags.push(`STOP(CIRCUIT_BREAKER): ${st.invalid.size} invalid seeds of ${walked} walked exceed the registered limit — ask Owner`); }
    if (!complete && !breaker) out.flags.push(`INCOMPLETE: ${plan.reached ? `${missing.length} planned seeds not yet run` : `walk reached ${plan.seeds.at(-1)} without ${CAREER_TARGET} valid seeds per layout`}`);
    out.flags.push("NEW_REGRESSION: not measured here — the controller checks clarifications.newRegressionGates separately (any newly red gate = STOP)");
    out.sample = { seedOrder: { segments: SO.segments, step: SO.step, unit: "effectiveSeed = normalizeLiveSeed(seed, 'session')" }, firstSeed: plan.seeds[0], lastSeed: plan.seeds.at(-1),
      seedsPlanned: plan.seeds.length, seedsWalked: walked, validPerLayout: plan.n, invalidSeeds: [...st.invalid].map(([seed, why]) => ({ seed, why })),
      m4PerLayout: Object.fromEntries(LAYOUTS.map((L) => [L, out.m4[L].n])) };
    out.ownerReview = LAYOUTS.some((L) => out.m4[L].ownerReview) && complete;
    out.verdict = breaker || (anomalies > 0) ? "stop" : !complete ? "incomplete" : stop ? "stop" : warn ? "warn" : out.ownerReview ? "owner_review" : "pass";
    out.interpretation = { draws: "no winner at 3600 s counts 0.5 (new rule registered in the addendum; the original d was in {-1,0,1})", strata: REV.strata, statisticalLimits: REV.statisticalLimits };
    return out;
  }

  // ── 指令 ────────────────────────────────────────────────────────────────
  if (flag("diagnostic")) {
    //  ≤ 10 場的自我測試：行為 7 場（seed 9001、STANDARD；對照＋top-split 兩臂＋負對照＋m4 兩臂＋bot-aggressive 紅）＋side bias 2 場（seed 5001、STANDARD）。
    //  結果丟棄：只寫到 --dir（必須另給，不得是正式資料夾），永遠不寫 result fixture。
    if (!val("dir") || path.resolve(val("dir")).toLowerCase() === path.resolve(DEFAULT_DIR).toLowerCase()) { console.error("--diagnostic 需要另給 --dir（不得用正式資料夾）"); process.exit(2); }
    const dBeh = path.join(baseDir, `diagnostic-${Date.now()}`, "behavioural"), dSb = path.join(path.dirname(dBeh), "sidebias");
    const pick = new Set(["control", `${NEG_PLAN.name}@blue`, `${NEG_PLAN.name}@red`, `neg:${NEG_PLAN.name}@red`, "classic.m4@blue", "classic.m4@red", "std+bot-aggressive@red"]);
    console.log("⚠ DIAGNOSTIC（診斷用，≤ 10 場，結果丟棄、不是 gate 結果）");
    await runStudy("behavioural", dBeh, { seeds: [BEH_SEEDS[0]], layouts: ["STANDARD"], arms: behaviouralArms().filter((a) => pick.has(a.key)), diagnostic: true });
    //  career 診斷取順序上第一個 m4 對手的 seed（唯一會因 laneFrame 不同的風格），兩個規則集各一場。
    await runStudy("sidebias-career", dSb, { seeds: [[...careerSequence()].find((s) => tacticIdOfSeed(s) === "m4")], layouts: null, arms: careerArms(), diagnostic: true });
    const recs = (d, k) => [...readBatch(d, k).values()];
    for (const k of pick) for (const r of recs(dBeh, k)) console.log(`  ${k.padEnd(28)} layout=${r.layout}/${r.layoutApplied} laneFrame=${r.laneFrame} winner=${r.winner} dur=${r.duration} split(blue)=${JSON.stringify(r.blue.split)} split(red)=${JSON.stringify(r.red.split)} ganks(red,world)=${JSON.stringify(r.red.ganks)} ganks(red,team)=${JSON.stringify(ganksInTeamFrame("red", r.red.ganks))}`);
    for (const k of ["career.v20", "career.v21"]) for (const r of recs(dSb, k)) console.log(`  sidebias(career) ${k} seed=${r.seed} layout=${r.layout}/${r.layoutApplied} ruleset=${r.ruleset} laneFrame=${r.laneFrame} opp=${r.opponentId}(${r.opponentStyle}) winner=${r.winner} dur=${r.duration}`);
    const tr = recs(dBeh, `${NEG_PLAN.name}@red`)[0], ng = recs(dBeh, `neg:${NEG_PLAN.name}@red`)[0], tb = recs(dBeh, `${NEG_PLAN.name}@blue`)[0];
    console.log(`  B1（診斷）top-split 藍方 own share=${JSON.stringify(b1Share(tb, "blue", NEG_PLAN.splitLane))}；紅方 teamRelative=${JSON.stringify(b1Share(tr, "red", NEG_PLAN.splitLane))}；紅方 legacyMirror（負對照）=${JSON.stringify(b1Share(ng, "red", NEG_PLAN.splitLane))}`);
    const cv = careerVerdict(dSb);
    console.log(`  統計管線（診斷，n=1，不是結果）：behavioural=${behaviouralVerdict(dBeh, [BEH_SEEDS[0]], { full: false }).verdict}、sidebias(career)=${cv.verdict}（n STANDARD ${cv.overall.STANDARD.n}／SWAPPED ${cv.overall.SWAPPED.n}）`);
    console.log(`DIAGNOSTIC 資料夾（可刪）：${path.dirname(dBeh)}`);
    return;
  }
  const study = val("study");
  if (study === "behavioural") {
    const r = await runStudy("behavioural", path.join(baseDir, "behavioural"), { seeds: BEH_SEEDS, layouts: LAYOUTS, arms: behaviouralArms() });
    process.exit(r.failed ? 1 : r.stopped ? 3 : 0);
  }
  if (study === "sidebias") {
    //  正式 D-20（修訂登記）：career.v20 vs career.v21。無效 seed 是資料（列在結果裡），不是工具失敗 ⇒ 不以 exit 1 表示。
    const r = await runCareer(path.join(baseDir, "sidebias-career"));
    process.exit(r.breaker ? 4 : r.stopped ? 3 : 0);
  }
  if (study === "sidebias-twin") {
    //  補充診斷（Owner 2026-10-20）：工具孿生，永遠不當 career 驗收、不決定 gate。
    const r = await runStudy("sidebias", path.join(baseDir, "sidebias-twin"), { seeds: SB_SEEDS, layouts: SB.layouts, arms: sidebiasArms() });
    process.exit(r.failed ? 1 : r.stopped ? 3 : 0);
  }
  if (flag("report")) {
    const dB = path.join(baseDir, "behavioural"), dS = path.join(baseDir, "sidebias-career"), dT = path.join(baseDir, "sidebias-twin");
    const metaOf = (d) => { const f = path.join(d, "meta.json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
    const prov = provenance();
    const beh = behaviouralVerdict(dB, BEH_SEEDS, { full: true });
    const sb = careerVerdict(dS);
    const twin = metaOf(dT) ? { role: "supplementary diagnostic only — not the career acceptance, never decides the gate (Owner 2026-10-20)", ...sidebiasVerdict(dT, SB_SEEDS, { full: true }) } : null;
    //  過期判定：被量測的是 src（模擬語意）。批次開跑時的 gitHead 與目前 HEAD 之間 src 有任何差異、或 v21 指紋不同 ⇒ STALE。
    //  只有 tools（量測工具本身）不同時不算過期，但把兩個 head 與期間改過的 tools 檔案照實列出（例：D-20 修訂登記的 commit 落在行為研究執行期間）。
    const changedBetween = (from, scope) => { try { return execSync(`git diff --name-only ${from} HEAD -- ${scope}`, { cwd: ROOT }).toString().trim().split("\n").filter(Boolean); } catch (e) { return [`<git diff failed: ${String(e?.message ?? e).slice(0, 80)}>`]; } };
    const headDelta = [metaOf(dB), metaOf(dS)].filter(Boolean).map((m) => ({ study: m.study, startedAt: m.gitHead, reportedAt: prov.gitHead,
      srcChanged: m.gitHead === prov.gitHead ? [] : changedBetween(m.gitHead, "src"), toolsChanged: m.gitHead === prov.gitHead ? [] : changedBetween(m.gitHead, "tools"), fingerprint: m.fingerprint }));
    const stale = headDelta.filter((d) => d.fingerprint !== prov.fingerprint || d.srcChanged.length).map((d) => `${d.study}@${d.startedAt}/${d.fingerprint} (src changed: ${d.srcChanged.length})`);
    const result = {
      schema: "esmo.laneframe-result.v1", registration: path.relative(ROOT, LF.REGISTRATION_FILE).replace(/\\/g, "/"), registeredAt: REG.registeredAt,
      reportedAt: new Date().toISOString(), ...prov, batchesStartedUnder: { behavioural: metaOf(dB), sidebias: metaOf(dS) },
      stale, behavioural: { ruleset: BEH.ruleset, laneFrame: BEH.laneFrame, seeds: BEH.seeds.range, layouts: LAYOUTS, plans: PLANS, ...beh },
      sideBias: { registration: "tools/fixtures/laneframe_registration_c3_d20rev.json (amends gates.sideBias; Owner 2026-10-20)", comparison: REV.comparison, ...sb },
      ...(twin ? { sideBiasTwinDiagnostic: twin } : {}),
      stop: beh.flags.some((f) => f.startsWith("STOP")) || sb.flags.some((f) => f.startsWith("STOP")),
      warn: sb.flags.some((f) => f.startsWith("WARN")),
      ownerReview: sb.ownerReview === true,
      sideBiasVerdictNote: "sideBias.verdict is the formal D-20 result (career); sideBiasTwinDiagnostic never decides it",
    };
    result.headDelta = headDelta;
    if (stale.length) result.flags = [`STALE: batches were started under different simulation code (src) or fingerprint: ${stale.join(", ")}`];
    fs.writeFileSync(RESULT_FIXTURE, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`behavioural：${beh.verdict}（B1 ${beh.gates.B1}、負對照 ${beh.gates.negativeControl}、B2 ${beh.gates.B2}、B3 ${beh.gates.B3}）`);
    for (const f of beh.flags) console.log(`  ${f}`);
    console.log(`sideBias：${sb.verdict}`);
    for (const g of ["overall", "m4"]) for (const [L, x] of Object.entries(sb[g])) console.log(`  ${g} ${L}: n=${x.n} bias20=${x.bias20} bias21=${x.bias21} worse_pp=${x.worsePp} z=${x.zWorsening} 勝負改變 ${x.pairsChangedOutcome} durRatio=${x.medianDurationRatioChange}`);
    for (const [L, x] of Object.entries(sb.nonM4Identity)) console.log(`  非 m4 逐場相同 ${L}: n=${x.n} 不同 ${x.differing}`);
    for (const f of sb.flags) console.log(`  ${f}`);
    console.log(`寫入 ${path.relative(ROOT, RESULT_FIXTURE)}（gitHead ${prov.gitHead}、指紋 ${prov.fingerprint}${stale.length ? "、STALE" : ""}）`);
    return;
  }
  console.error("用法：--study=behavioural|sidebias|sidebias-twin ｜ --report ｜ --diagnostic --dir=<scratch>");
  process.exit(2);
}
