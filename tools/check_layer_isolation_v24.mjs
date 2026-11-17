#!/usr/bin/env node
// ============================================================================
//  tools/check_layer_isolation_v24.mjs — moba-sim.v24 候選的層隔離守門（2026-11-15，交付點 A；約 5～8 分鐘，單線）
//
//  Owner 要求：建立 v24 之後，「v20～v23 所有既有釘點與逐 tick 結果完全相同」，不得為了通過而修改或重錄歷史 Golden。
//  這支只跟一份**改動前**錄下的基準比：review/tactic-book-3a/v24_base/pins_v20_v23_at_00382eda.json
//  （tools/owner_preview/pin_v20_v23_stream.mjs 在 v23 凍結點 00382eda 錄的 48 場整場逐 tick 雜湊）。
//
//   I1 v20～v23 的 48 場：目前的程式逐值等於基準（工具路徑 24、生涯路徑 24；低／中／高素質都有）
//   I2 v24 的層不改變對局（交付點 A）：balanceTool.v24／career.v24 與同輸入的 v23 逐 tick 相同（12 場）
//   I3 v20～v23 對局裡 v24 的程式完全不啟動：沒有仲裁帳、承諾推進旗標是 false
//   I4 v24 仲裁帳：每名存活英雄每 tick 恰好一筆；值都在契約清單裡；第一段贏的任務與引擎外的步驟 A 觀測器逐筆一致（精確項）
//   I5 規則集結構：v20～v23 物件沒有 v24 的層鍵；career.v24／balanceTool.v24＝v23 逐欄＋恰好兩個新鍵；旗標全關 ⇒ career.v20
//   I6 檔案：v23 凍結清單的語意檔，除了這次刻意改的 3 支（LogicEngine／matchRuleset／matchAssembler）之外逐檔不變；
//      這次補進清單的 21 支依賴檔＝凍結清單 engineClosureGaps 的內容（沒有被順手改）
//   I7 taskCommit "v19push"：只有工具規則集能開，而且開了真的改變對局；正式規則集被鎖在 "v19"
//  用法：node tools/check_layer_isolation_v24.mjs
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const P = await imp("tools/owner_preview/pin_v20_v23_stream.mjs");
const RS = await imp("src/platform/contracts/matchRuleset.js");
const SV = await imp("src/platform/contracts/simulationVersion.js");
const FF = await imp("src/featureFlags.js");
const LEDGER = await imp("src/battle/moba/tactics/taskArbitrationLedger.js");
const { attachTaskArbitration } = await imp("tools/lib/taskArbitrationObs.mjs");
const { createMatchSetup } = await imp("src/platform/contracts/matchSetup.js");

const results = [];
const ck = (name, ok, detail = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const J = JSON.stringify;
const t0 = Date.now();
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, "review/tactic-book-3a/v24_base/pins_v20_v23_at_00382eda.json"), "utf8"));
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, "review/tactic-book-3a/v23_freeze/FREEZE_MANIFEST.json"), "utf8"));

// ── I1 ──
{
  const want = new Map(BASE.rows.map((r) => [r.key, r.hash]));
  let same = 0, diffs = [], engines = [];
  for (const c of P.CASES) {
    const e = P.build(...c);
    const r = P.streamHash(e);
    engines.push(e);
    if (want.get(P.caseKey(c)) === r.hash) same++; else diffs.push(P.caseKey(c));
  }
  ck("I1 v20～v23 的 48 場整場逐 tick 雜湊＝改動前的基準（00382eda）", BASE.rows.length === 48 && same === 48, `same=${same}/48${diffs.length ? " diff=" + J(diffs.slice(0, 4)) : ""}`);
  // ── I3 ──（同一批引擎）
  const leaked = engines.filter((e) => e.arbLedger !== undefined || e._arbV24 === true || e._commitPushV24 === true).length;
  ck("I3 v20～v23 對局裡 v24 的程式不啟動（沒有仲裁帳、承諾推進旗標關）", leaked === 0, `engines=${engines.length} leaked=${leaked}`);
}

// ── I2 ──
const V24_CASES = [
  ["balanceTool", "v2.standard_macro", "v2.standard_macro", 11, null], ["balanceTool", "v2.jungle_invasion", "v2.jungle_invasion", 11, null],
  ["balanceTool", "v2.jungle_invasion", "classic.m7", 13, null], ["balanceTool", "classic.m7", "v2.jungle_invasion", 17, null],
  ["balanceTool", "classic.m1", "classic.m3", 17, null], ["balanceTool", "classic.m5", "v2.standard_macro", 19, null],
];
//  交付點 B（2026-11-17）：v24 規則集多了 tacticExec "adaptive.v1"，會改變對局（這是 Sprint 1 的目的）。
//  所以 I2 改成「v24 把 tacticExec 覆寫成 off ⇒ 與 v23 逐 tick 相同」（＝交付點 A 的保證仍成立）。
//  career.v24 是正式規則集、層值被 createMatchSetup 鎖住，不能覆寫成 off；生涯路徑的「v23 不變」由 I1 的 24 場生涯釘點涵蓋。
const withTacticExecOff = (fn) => { process.env.ESMO_BALANCE_TACTICEXEC = "off"; try { return fn(); } finally { delete process.env.ESMO_BALANCE_TACTICEXEC; } };
const C = await (await imp("tools/lib/careerLiveInputs.mjs")).careerContext();
const { prepareLiveMatch } = await imp("src/useLocalServer.js");
const bindingOf = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const V24_FLAGS = () => ({ ...C.G.featureFlags, mobaTacticalDirectorV21: true, mobaJungleV22: true, mobaSafeRouteV23: true, mobaTacticExecV24: true });
function buildV24(kind, tb, tr, seed, tier) {
  if (kind === "balanceTool") return P.build("balanceTool.v24", tb, tr, seed, tier);
  const flags = V24_FLAGS(), ruleset = C.resolveLiveRuleset({ flags, dev: null, allowTool: false }).ruleset;
  if (ruleset.rulesetId !== "career.v24") throw new Error(`resolved ${ruleset.rulesetId}`);
  const team = C.AI_TEAMS[seed % C.AI_TEAMS.length], v = { low: 30, mid: 60, high: 90 }[tier];
  const players = tier == null ? C.G.inputs.players : C.G.inputs.players.map((pl) => ({ ...pl, stats: Object.fromEntries(Object.keys(pl.stats).map((k) => [k, v])) }));
  const opts = { seed, roster: C.appRoster(C.Runner.mirroredRoster(seed, C.M)), buildStrategy: "standard", opponentId: team.id, sessionId: `pin-${seed}`, mode: "moba", tacticPlanBinding: bindingOf(tb) };
  const out = prepareLiveMatch({ opts, seed, seedSource: "session", ruleset, flags, profile: { players, lineup: C.G.inputs.lineup }, heroProgress: { loadout: C.G.inputs.defaultLoadout }, opponentTeam: C.aiTeamById(team.id) });
  if (!out.ok) throw new Error(`rejected career.v24 ${seed}`);
  return out.engine;
}
{
  const want = new Map(BASE.rows.map((r) => [r.key, r.hash]));
  let same = 0, ledgers = 0; const diffs = [];
  for (const [kind, tb, tr, seed, tier] of V24_CASES) {
    const e = withTacticExecOff(() => buildV24(kind, tb, tr, seed, tier));
    const r = P.streamHash(e);
    if (e.arbLedger && e.tacExec === undefined) ledgers++;
    const k23 = P.caseKey([`${kind}.v23`, tb, tr, seed, tier]);
    if (want.get(k23) === r.hash) same++; else diffs.push(k23);
  }
  ck("I2 v24（仲裁紀錄 v1＋承諾 v19，tacticExec 覆寫成 off）與同輸入的 v23 整場逐 tick 相同（工具 6）", same === V24_CASES.length && ledgers === V24_CASES.length,
    `same=${same}/${V24_CASES.length} ledgers=${ledgers}${diffs.length ? " diff=" + J(diffs) : ""}`);
}

// ── I4 ──
{
  //  交付點 B：外部觀測器（步驟 A）不認識 tacticExec 的回防與隊友任務 ⇒ 比對在 tacticExec off 的 v24 上做（仲裁帳本身照樣開著）。
  const e = withTacticExecOff(() => buildV24("balanceTool", "v2.jungle_invasion", "classic.m7", 13, null));
  const obs = attachTaskArbitration(e, { keep: false });
  let ticks = 0, badCount = 0, badEnum = 0, cmp = 0, agree = 0, ex = null;
  const conf = {};
  const T = new Set(LEDGER.TASKS), RN = new Set(LEDGER.REASONS), RW = new Set(LEDGER.REWRITES), SK = new Set(LEDGER.SUPPRESSED_KEYS), DK = new Set(LEDGER.DEFAULT_KINDS);
  while (!e.over && e.t < 3000) {
    const living = e.players.filter((p) => !p.dead).map((p) => p.id).sort();
    e.tick(0.5); ticks++;
    const L = e.arbLedger.lastTick, O = obs.afterTick();
    if (!O.length) continue;                       // 比賽在這個 tick 結束（沒有決策）
    const ids = L.map((r) => r.id).sort();
    if (J(ids) !== J(living)) badCount++;
    for (const r of L) {
      if (!(T.has(r.winner) && RN.has(r.reason) && r.rewrites.every((x) => RW.has(x)) && r.suppressed.every((x) => SK.has(x)) && (r.winner !== "default" || DK.has(r.kind)))) { badEnum++; ex ??= r; }
      const o = O.find((x) => x.id === r.id);
      if (!o || o.unseen) continue;
      cmp++;
      if (o.winner === r.winner) agree++; else { const k = `${o.winner}→${r.winner}`; conf[k] = (conf[k] ?? 0) + 1; }
    }
  }
  obs.detach();
  ck("I4a 仲裁帳：每名存活英雄每 tick 恰好一筆，值都在契約清單內", ticks > 1000 && badCount === 0 && badEnum === 0, `ticks=${ticks} badTicks=${badCount} badEnum=${badEnum}${ex ? " e.g. " + J(ex) : ""}`);
  ck("I4b 第一段贏的任務：引擎內的帳與引擎外的步驟 A 觀測器逐筆一致", cmp > 10000 && agree === cmp, `compared=${cmp} agree=${agree} confusion=${J(conf)}`);
}

// ── I5 ──
{
  const V24_KEYS = ["taskArbitration", "taskCommit", "tacticExec"];
  const old = Object.values(RS.MATCH_RULESETS).filter((r) => !r.rulesetId.endsWith(".v24"));
  const leaked = old.filter((r) => V24_KEYS.some((k) => k in r.layers)).map((r) => r.rulesetId);
  const pair = (a, b) => {
    const A = RS.MATCH_RULESETS[a], B = RS.MATCH_RULESETS[b];
    const extra = Object.keys(B.layers).filter((k) => !(k in A.layers));
    const same = Object.keys(A.layers).every((k) => A.layers[k] === B.layers[k]);
    return { extra, same, sim: B.simVersion, layers: V24_KEYS.map((k) => B.layers[k]) };
  };
  const c = pair("career.v23", "career.v24"), t = pair("balanceTool.v23", "balanceTool.v24");
  const off = RS.resolveRulesetForMode({ mode: "career", flags: { ...C.G.featureFlags } }).rulesetId;
  const three = RS.resolveRulesetForMode({ mode: "career", flags: { ...C.G.featureFlags, mobaTacticalDirectorV21: true, mobaJungleV22: true, mobaSafeRouteV23: true } }).rulesetId;
  const four = RS.resolveRulesetForMode({ mode: "career", flags: V24_FLAGS() }).rulesetId;
  const onlyV24 = RS.resolveRulesetForMode({ mode: "career", flags: { ...C.G.featureFlags, mobaTacticExecV24: true } }).rulesetId;
  const flagsOff = ["mobaTacticalDirectorV21", "mobaJungleV22", "mobaSafeRouteV23", "mobaTacticExecV24", "mobaChallengeV21"].every((f) => FF.FEATURE_FLAGS[f] === false);
  const v24Valid = ["career.v24", "balanceTool.v24"].every((id) => RS.validateRuleset(RS.MATCH_RULESETS[id]).ok);
  //  Sprint 1.1（2026-11-18）：v24 規則集的 tacticExec 改成 "adaptive.v1.1"（"adaptive.v1" 仍是合法值，只給工具重現 Sprint 1）。
  ck("I5 規則集：v20～v23 沒有 v24 的層；v24＝v23 逐欄＋恰好三個新鍵（v1／v19／adaptive.v1.1）；旗標全關 ⇒ career.v20、只開 v24 ⇒ 仍 career.v20",
    leaked.length === 0 && c.same && t.same && J(c.extra) === J(V24_KEYS) && J(t.extra) === J(V24_KEYS) && J(c.layers) === J(["v1", "v19", "adaptive.v1.1"]) && J(t.layers) === J(["v1", "v19", "adaptive.v1.1"])
    && RS.TACTIC_EXECS.includes("adaptive.v1")
    && c.sim === "moba-sim.v24" && off === "career.v20" && three === "career.v23" && four === "career.v24" && onlyV24 === "career.v20" && flagsOff && v24Valid
    && RS.MATCH_RULESETS["career.v24"].releaseRequirements.includes("mobaTacticExecV24"),
    `leaked=${J(leaked)} career=${J(c)} tool=${J(t)} resolve off/3/4/onlyV24=${off}/${three}/${four}/${onlyV24} flagsOff=${flagsOff} valid=${v24Valid}`);
}

// ── I6 ──
{
  const blob = (f) => { try { return execFileSync("git", ["hash-object", "--no-filters", f], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; } };
  const INTENDED = new Set(["src/LogicEngine.js", "src/platform/contracts/matchRuleset.js", "src/battle/moba/matchAssembler.js"]);
  const changed = Object.entries(MAN.semanticsFiles).filter(([f, h]) => !INTENDED.has(f) && blob(f) !== h).map(([f]) => f);
  const gaps = Object.entries(MAN.engineClosureGaps).filter(([f]) => f !== "src/platform/contracts/tacticalDirective.js");
  const gapChanged = gaps.filter(([f, h]) => blob(f) !== h).map(([f]) => f);
  const listed = gaps.filter(([f]) => SV.SIMULATION_SEMANTICS_FILES.includes(f)).length;
  const directiveSame = blob("src/platform/contracts/tacticalDirective.js") === MAN.engineClosureGaps["src/platform/contracts/tacticalDirective.js"];
  ck("I6 v23 凍結清單的語意檔只改了刻意的 3 支；補進清單的 21 支依賴檔內容＝凍結時的內容；tacticalDirective.js 不變",
    changed.length === 0 && gapChanged.length === 0 && listed === gaps.length && gaps.length === 21 && directiveSame && SV.SIMULATION_SEMANTICS_FILES.includes("src/battle/moba/tactics/taskArbitrationLedger.js"),
    `changed=${J(changed)} gapChanged=${J(gapChanged)} listed=${listed}/${gaps.length} directiveSame=${directiveSame}`);
}

// ── I7 ──
{
  //  工具路徑：runner 的 ESMO_BALANCE_TASKCOMMIT 覆寫（與 ESMO_BALANCE_SAFEROUTE 同一種做法）
  const a = P.streamHash(P.build("balanceTool.v24", "v2.standard_macro", "v2.standard_macro", 11, null)).hash;
  let b = null, err = null;
  process.env.ESMO_BALANCE_TASKCOMMIT = "v19push";
  try { const e = P.build("balanceTool.v24", "v2.standard_macro", "v2.standard_macro", 11, null); b = e._commitPushV24 === true ? P.streamHash(e).hash : "flag-not-set"; }
  catch (e2) { err = String(e2?.message ?? e2).slice(0, 220); }
  finally { delete process.env.ESMO_BALANCE_TASKCOMMIT; }
  //  正式規則集：createMatchSetup 把 production 的層值鎖在登錄值（matchSetup.js「production layer is pinned」）
  const prod = RS.MATCH_RULESETS["career.v24"];
  const r = createMatchSetup({ ruleset: { ...prod, layers: { ...prod.layers, taskCommit: "v19push" } }, seed: 11, roster: null, tactic: { blue: { kind: "std" }, red: { kind: "std" } }, meta: { sessionId: null, mode: "moba", opponentId: null, seedSource: "session" } });
  const prodPinned = r?.ok === false && (r.errors ?? []).some((x) => x.field === "ruleset.layers.taskCommit");
  ck("I7 taskCommit v19push：工具覆寫後對局真的改變；正式規則集被鎖在 v19", b != null && /^[0-9a-f]{20}$/.test(b) && a !== b && prodPinned,
    `v19=${a} v19push=${b}${err ? " err=" + err : ""} productionPinned=${prodPinned}${prodPinned ? "" : " errors=" + J(r?.errors ?? r).slice(0, 200)}`);
}

const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_layer_isolation_v24：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(pass === results.length ? 0 : 1);
