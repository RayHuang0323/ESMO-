#!/usr/bin/env node
// ============================================================================
//  tools/check_match_assembler_3a.mjs — Phase 3a Task 3：唯一組裝器 assembleMatch 的 parity gate
//
//  執行：node tools/check_match_assembler_3a.mjs            （39 場完整對局，約數分鐘）
//        node tools/check_match_assembler_3a.mjs --only=a,b （只跑指定 golden case）
//
//  核心斷言（每一個 golden case）：
//   (a) MatchSetup → assembleMatch 實際呼叫的 configure* 序列與每次引數的 8 位雜湊
//       ＝ golden `calls`（v20 三條路徑各自錄下的順序與內容）
//   (b) runAndHash 的 digest 與 streamHash ＝ golden（逐位元）
//   (c) 組裝與整場模擬後 setup 雜湊不變、仍深度凍結（組裝器不得改 setup）
//  另外：import-graph（組裝器不得碰到 heroDatabase.js）、語彙拒絕（buildStrategy／天賦）、
//        binding 戰術拒絕（Task 9 才接）、缺 deps 拒絕、assemblyOrder 支援範圍。
//
//  Setup 編碼沿用 check_match_setup_contract_3a.mjs 的 encodeCase 結構（同樣的 ruleset、
//  同樣的欄位對應），但欄位值改為「v20 實際送進引擎的值」，因為本檔要逐位元重現：
//   · playerSlots 是引擎席位 slot（{ id, playerId, stats }）：Live 由 buildPlayerStatSlots
//     （含疲勞）產生；Challenge 由兩份快照攤平（同 challengeRunner.sideInputs）。
//   · loadout 是最終 loadout：Live 為 applyFatigueToLoadout 之後的值（以 golden ctor.loadoutHash 驗證）；
//     Challenge 為兩份快照 loadout 合併。
//   · Challenge 的 roster 是凍結 DraftResult 的席位英雄＋由英雄推導的召喚師技能（同 challengeRunner）。
//   這些「v20 輸入怎麼變成 setup」是 Task 4–6 builder 的工作；這裡只為重建 golden 輸入。
//
//  英雄資料（heroDatabase）只在本測試載入，經 deps 注入組裝器——組裝器本身不 import 它（A1 驗證）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleMatch } from "../src/battle/moba/matchAssembler.js";
import { buildMatchAssemblerDepsFrom } from "../src/battle/moba/matchAssemblerDepsCore.js";
import { createMatchSetup, matchSetupHash } from "../src/platform/contracts/matchSetup.js";
import { MATCH_RULESETS } from "../src/platform/contracts/matchRuleset.js";
import { mobaTacticById } from "../src/platform/contracts/MobaTacticConfig.js";
import { stableStringify, stableHash } from "../src/platform/contracts/squadSnapshot.js";
import { LogicEngine } from "../src/LogicEngine.js";
import { heroById } from "../src/data/heroDatabase.js";
import { toEngineHeroSkills } from "../src/battle/moba/skills/heroSkillGameplay.js";
import { selectBattleTalents, battleTalentOptions } from "../src/battle/moba/talents/heroBattleTalents.js";
import { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } from "../src/data/heroCombatArchetypes.js";
import { runAndHash } from "./lib/matchGolden.mjs";
import { makeGoldenEncoder } from "./lib/matchGoldenSetup.mjs";
import { stripComments } from "./lib/stripComments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argOf = (name) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : null; };
const ONLY = argOf("only") ? new Set(argOf("only").split(",")) : null;

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const codes = (r) => (r?.errors ?? []).map((e) => e.code);

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
const G = golden.inputs;

//  Phase 3a T6 fix：組裝器不再 import 任何 adapter ⇒ 引擎側 adapter 也要經 deps。這裡用共用 core 的預設接線（唯一一份），
//  英雄側 adapter 與 LogicEngine／heroLookup 仍由本測試明示注入（保持原本的注入面）。
const DEPS = buildMatchAssemblerDepsFrom({
  LogicEngine, heroLookup: heroById,
  heroAdapters: { toEngineHeroSkills, selectBattleTalents, battleTalentOptions, toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION },
});

// ── Probe（與 capture_match_golden_v20.mjs 相同：prototype 上的 pass-through 包裝）──────────
const PROBE = { calls: null };
for (const name of Object.getOwnPropertyNames(LogicEngine.prototype)) {
  if (!/^configure|^enable/.test(name) || typeof LogicEngine.prototype[name] !== "function") continue;
  const orig = LogicEngine.prototype[name];
  LogicEngine.prototype[name] = function probed(...args) {
    if (PROBE.calls) PROBE.calls.push({ m: name, h: stableHash(stableStringify(args.length <= 1 ? args[0] : args)) });
    return orig.apply(this, args);
  };
}
const probedAssemble = (setup, deps = DEPS) => {
  PROBE.calls = [];
  try { return { r: assembleMatch(setup, deps), calls: PROBE.calls }; } finally { PROBE.calls = null; }
};

// ── Setup 編碼（結構同 Task 2 encodeCase；值為 v20 實際引擎輸入）──────────────────────
//  Phase 3a T7：編碼抽到 tools/lib/matchGoldenSetup.mjs（check_match_setup_3a 的「手編 setup」吃同一份）。
const { encodeCase, career, toolRs, legacy, plainRoster } = makeGoldenEncoder(golden);

const deepFrozen = (o) => !o || typeof o !== "object" || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
const firstDiff = (got, want) => {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) if (got[i]?.m !== want[i]?.m || got[i]?.h !== want[i]?.h) return `#${i}: got ${got[i] ? `${got[i].m}/${got[i].h}` : "∅"} want ${want[i] ? `${want[i].m}/${want[i].h}` : "∅"}`;
  return "";
};

// ── A0 ruleset assemblyOrder ────────────────────────────────────────────────
ck("A0 已登錄 ruleset 的 assemblyOrder：career／balanceTool＝live，challenge＝challengeV20",
  MATCH_RULESETS["career.v20"].layers.assemblyOrder === "live" && MATCH_RULESETS["balanceTool.v20"].layers.assemblyOrder === "live"
  && MATCH_RULESETS["challenge.v20"].layers.assemblyOrder === "challengeV20" && career.layers.assemblyOrder === "live");

// ── G：39 golden cases ──────────────────────────────────────────────────────
const cases = golden.cases.filter((c) => !ONLY || ONLY.has(c.id));
const t0 = Date.now();
const summary = { live: [0, 0], challenge: [0, 0], runner: [0, 0] };
for (const [n, c] of cases.entries()) {
  const built = createMatchSetup(encodeCase(c));
  if (!built.ok) { ck(`G ${c.id} setup 建立`, false, built.errors.map((e) => `${e.code}@${e.field}`).join(",")); summary[c.path][1]++; continue; }
  const setup = built.setup;
  const h0 = matchSetupHash(setup), j0 = JSON.stringify(setup);
  if (c.path === "live") ck(`G ${c.id} 輸入重建：loadout 雜湊＝golden ctor.loadoutHash`, stableHash(stableStringify(setup.loadout)) === c.ctor.loadoutHash, `${stableHash(stableStringify(setup.loadout))} vs ${c.ctor.loadoutHash}`);
  if (c.path === "challenge") ck(`G ${c.id} 輸入重建：matchSeed＝golden ctor.seed`, setup.seed === c.ctor.seed);
  const { r, calls } = probedAssemble(setup);
  if (!r.ok) { ck(`G ${c.id} assembleMatch ok`, false, r.errors.map((e) => `${e.code}@${e.field}: ${e.message}`).join(" | ")); summary[c.path][1]++; continue; }
  const diff = firstDiff(calls, c.calls);
  ck(`G ${c.id} (a) configure 序列與引數雜湊＝golden（${c.calls.length} 呼叫）`, diff === "", diff);
  const res = runAndHash(r.engine, { dt: golden.dt, maxT: golden.maxT[c.path], every: golden.streamEvery });
  const same = res.digest === c.digest && res.streamHash === c.streamHash;
  ck(`G ${c.id} (b) digest＋streamHash＝golden`, same, same ? res.digest : `got ${res.digest}/${res.streamHash} want ${c.digest}/${c.streamHash}`);
  ck(`G ${c.id} (c) setup 未被改動（雜湊、內容、深度凍結）`, matchSetupHash(setup) === h0 && JSON.stringify(setup) === j0 && deepFrozen(setup));
  summary[c.path][diff === "" && same ? 0 : 1]++;
  process.stderr.write(`  ${n + 1}/${cases.length} ${c.id} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
console.log(`  逐位元重現：live ${summary.live[0]}/${summary.live[0] + summary.live[1]}、challenge ${summary.challenge[0]}/${summary.challenge[0] + summary.challenge[1]}、runner ${summary.runner[0]}/${summary.runner[0] + summary.runner[1]}`);

// ── A1 import graph：heroDatabase.js 不得出現在組裝器的靜態 import 圖 ─────────────────
//  剝註解用 tools/lib/stripComments.mjs（唯一實作）。原本這裡的正則會把行註解裡的「斜線＋兩個星號」
//  當成區塊註解開頭，把後面的程式碼（包括 import）一起刪掉 ⇒ import 圖可能少走幾條邊、「不得 import X」假綠。
function importGraph(entry) {
  const seen = new Map(), stack = [[path.resolve(ROOT, entry), null]];
  while (stack.length) {
    const [p, from] = stack.pop();
    if (seen.has(p)) continue;
    seen.set(p, from);
    if (!fs.existsSync(p)) continue;
    const src = stripComments(fs.readFileSync(p, "utf8"));
    for (const m of src.matchAll(/\b(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith(".")) stack.push([path.resolve(path.dirname(p), spec), p]);
    }
  }
  return seen;
}
const chainTo = (graph, target) => { const hit = [...graph.keys()].find((p) => p.endsWith(target)); if (!hit) return null; const out = []; for (let x = hit; x; x = graph.get(x)) out.unshift(path.relative(ROOT, x)); return out.join(" → "); };
const asmGraph = importGraph("src/battle/moba/matchAssembler.js");
const ctrl = importGraph("src/data/heroCombatArchetypes.js");
ck("A1 walker 有檢定力：heroCombatArchetypes.js 的圖確實含 heroDatabase.js（正對照）", !!chainTo(ctrl, path.join("src", "data", "heroDatabase.js")));
ck(`A1 組裝器 import 圖不含 heroDatabase.js／heroImages.js（${asmGraph.size} 個模組）`,
  !chainTo(asmGraph, path.join("src", "data", "heroDatabase.js")) && !chainTo(asmGraph, path.join("src", "data", "heroImages.js")),
  chainTo(asmGraph, path.join("src", "data", "heroDatabase.js")) ?? "");
ck("A1b 組裝器不 import LogicEngine／React／zustand（引擎由 deps 注入）",
  !chainTo(asmGraph, path.join("src", "LogicEngine.js")) && !/\b(react|zustand|localStorage|Date\.now|Math\.random)\b/.test(stripComments(fs.readFileSync(path.join(ROOT, "src/battle/moba/matchAssembler.js"), "utf8"))));

// ── A2–A6 拒絕路徑（全在建構引擎之前，零 configure 呼叫）────────────────────────────────
const liveCase = golden.cases.find((c) => c.id === "live-m4-3");
const liveIn = (over = {}) => ({ ...encodeCase(liveCase), ...over });
const mk = (inp) => { const r = createMatchSetup(inp); if (!r.ok) throw new Error(`fixture setup failed: ${codes(r)}`); return r.setup; };
const rejects = (setup, code, field = null, deps = DEPS) => {
  const { r, calls } = probedAssemble(setup, deps);
  return !r.ok && r.engine === null && calls.length === 0 && r.errors.some((e) => e.code === code && (field === null || e.field === field) && e.message);
};
ck("A2 未知的 production buildStrategy ⇒ build_strategy_unknown（不默默改成 standard）", rejects(mk(liveIn({ buildStrategy: "aggressive" })), "build_strategy_unknown", "buildStrategy"));
ck("A2b 大小寫不同也拒絕（正規化屬於 Task 4 builder）", rejects(mk(liveIn({ buildStrategy: "Early" })), "build_strategy_unknown"));
const b1Hero = G.liveRosters["3"].b1.heroId, b2Hero = G.liveRosters["3"].b2.heroId;
const otherHeroTalent = battleTalentOptions(b2Hero)[0].id;
ck("A3 未知天賦 id ⇒ talent_unknown（逐席位）", rejects(mk(liveIn({ talentSelections: { b1: "nope:battle-form" } })), "talent_unknown", "talentSelections.b1"));
ck("A3b 別的英雄的天賦（b1 選了 b2 英雄的天賦）⇒ talent_unknown", rejects(mk(liveIn({ talentSelections: { b1: otherHeroTalent } })), "talent_unknown", "talentSelections.b1"), `${b1Hero} ← ${otherHeroTalent}`);
ck("A3c 該席位英雄自己的天賦 ⇒ 接受；null ⇒ 交給 AI", (() => { const r = assembleMatch(mk(liveIn({ talentSelections: { b1: battleTalentOptions(b1Hero)[0].id, b2: null } })), DEPS); return r.ok && r.applied.talentSelection.players.b1.source === "player" && r.applied.talentSelection.players.b2.source === "ai"; })());
ck("A3d 有天賦選擇但沒有 roster ⇒ talent_without_roster", rejects(mk(liveIn({ roster: null, buildStrategy: null })), "talent_without_roster"));
ck("A4 binding 戰術（藍方）⇒ tactic_binding_unsupported（Task 9）", rejects(mk(liveIn({ tactic: { blue: { kind: "binding", binding: { id: "x" } }, red: { kind: "std" } } })), "tactic_binding_unsupported", "tactic.blue"));
ck("A4b binding 戰術（紅方）⇒ tactic_binding_unsupported", rejects(mk(liveIn({ tactic: { blue: legacy("m4"), red: { kind: "binding", binding: { id: "y" } } } })), "tactic_binding_unsupported", "tactic.red"));
ck("A4c 錯誤訊息點名 Task 9", (() => { const r = assembleMatch(mk(liveIn({ tactic: { blue: { kind: "binding", binding: { id: "x" } }, red: { kind: "std" } } })), DEPS); return /Task 9/.test(r.errors.find((e) => e.code === "tactic_binding_unsupported")?.message ?? ""); })());
ck("A4d 有藍方戰術但沒有紅方 ⇒ tactic_red_missing（不隱含補 std）", rejects(mk(liveIn({ tactic: { blue: legacy("m4"), red: null } })), "tactic_red_missing"));
ck("A5 缺 deps.LogicEngine ⇒ deps_missing", rejects(mk(liveIn()), "deps_missing", "deps.LogicEngine", { ...DEPS, LogicEngine: undefined }));
ck("A5b 有 roster 但缺 heroLookup ⇒ deps_missing", rejects(mk(liveIn()), "deps_missing", "deps.heroLookup", { ...DEPS, heroLookup: undefined }));
ck("A5c 技能層生效但缺 heroAdapters.toEngineHeroSkills ⇒ deps_missing", rejects(mk(liveIn()), "deps_missing", "deps.heroAdapters.toEngineHeroSkills", { ...DEPS, heroAdapters: { ...DEPS.heroAdapters, toEngineHeroSkills: undefined } }));
ck("A5d 查不到的英雄 ⇒ hero_unknown", rejects(mk(liveIn({ roster: { ...plainRoster(G.liveRosters["3"]), r5: { heroId: "no_such_hero", spells: ["flash", "heal"] } }, talentSelections: null })), "hero_unknown", "roster.r5.heroId"));
ck("A5e playerSlots 不是引擎席位形狀（缺 id）⇒ player_slot_invalid", rejects(mk(liveIn({ playerSlots: { blue: [{ seat: "b1", stats: {} }], red: [] } })), "player_slot_invalid"));
const runnerCase = golden.cases.find((c) => c.id === "runner-early-3");
const toolIn = (over = {}) => { const e = encodeCase(runnerCase); return { ...e, ...over, tool: { ...e.tool, ...(over.tool ?? {}) } }; };
ck("A6 tool 的未知 itemsStrategies ⇒ build_strategy_unknown", rejects(mk(toolIn({ tool: { itemsStrategies: { blue: "standard", red: "yolo" } } })), "build_strategy_unknown", "tool.itemsStrategies.red"));
ck("A6b tool.incomeK 但裝備層未生效 ⇒ income_k_without_items", rejects(mk({ ...encodeCase(golden.cases.find((c) => c.id === "runner-off-3")), tool: { incomeK: 1.2 } }), "income_k_without_items"));
const challengeV20Tool = Object.freeze({ ...toolRs, layers: Object.freeze({ ...toolRs.layers, assemblyOrder: "challengeV20" }) });
ck("A6c challengeV20 順序不支援 layout／技能／裝備（v20 Challenge 沒有這些層）⇒ assembly_order_layer_unsupported",
  rejects(mk(toolIn({ ruleset: challengeV20Tool })), "assembly_order_layer_unsupported"));

// ── A7 tool 專屬：ruleOverrides 建構後立即套用、incomeK 寫入裝備 runtime ───────────────
{
  const s = mk(toolIn({ tool: { ruleOverrides: { towerHp: 1234 }, incomeK: 1.25 } }));
  const r = assembleMatch(s, DEPS);
  ck("A7 tool.ruleOverrides 寫進這一場的 engine.rules；incomeK 寫進 engine.items", r.ok && r.engine.rules.towerHp === 1234 && r.engine.items?.incomeK === 1.25,
    r.ok ? `towerHp=${r.engine.rules.towerHp} incomeK=${r.engine.items?.incomeK}` : codes(r).join(","));
  const fresh = new LogicEngine(3);
  ck("A7b ruleOverrides 只影響這個實例（不改共享規則表）", fresh.rules.towerHp !== 1234);
}

// ── A9 引擎側 adapter 全部經 deps（Phase 3a T6 fix）─────────────────────────────────────────────
//  缺哪個、哪一層生效 ⇒ 對應的 deps_missing（零 configure 呼叫、不建引擎）。
{
  const withoutEngine = (name) => ({ ...DEPS, engineAdapters: { ...DEPS.engineAdapters, [name]: undefined } });
  const liveS = mk(liveIn()), toolS = mk(toolIn());
  for (const [name, setup] of [["toEnginePlayerMods", liveS], ["toEngineHeroMods", liveS], ["toEngineHeroPassives", liveS], ["toEngineHeroPowerCurve", liveS],
    ["toEngineSpells", liveS], ["toEngineTactic", liveS], ["toEngineTacticIdentity", liveS], ["matchItemsConfig", liveS], ["MOBA_TACTIC_VERSION", liveS],
    ["STANDARD_OPP_TACTIC", liveS], ["toEngineItems", toolS], ["toEngineHeroMods", toolS]])
    ck(`A9 缺 deps.engineAdapters.${name}（${setup === liveS ? "career" : "tool"}）⇒ deps_missing，零 configure 呼叫`, rejects(setup, "deps_missing", `deps.engineAdapters.${name}`, withoutEngine(name)));
  ck("A9b 沒有 engineAdapters 區塊的手拼 deps ⇒ deps_missing（組裝器沒有私下的預設）",
    rejects(liveS, "deps_missing", "deps.engineAdapters.toEnginePlayerMods", { LogicEngine, heroLookup: heroById, heroAdapters: DEPS.heroAdapters }));
  //  關掉的層不要求該 adapter（tool 不套選手素質、不走 matchItemsConfig）
  ck("A9c 層沒生效就不要求它的 adapter：tool 缺 toEnginePlayerMods／matchItemsConfig 仍可組裝",
    assembleMatch(toolS, { ...DEPS, engineAdapters: { ...DEPS.engineAdapters, toEnginePlayerMods: undefined, matchItemsConfig: undefined } }).ok);
  //  注入的函式真的被用（每個都能失敗）：包一層計數
  const hits = {};
  const counted = Object.fromEntries(Object.entries(DEPS.engineAdapters).map(([k, v]) => [k, typeof v === "function" ? (...a) => { hits[k] = (hits[k] ?? 0) + 1; return v(...a); } : v]));
  const rl = assembleMatch(liveS, { ...DEPS, engineAdapters: counted }), rt = assembleMatch(toolS, { ...DEPS, engineAdapters: counted });
  ck("A9d 注入的每個引擎側 adapter 都被呼叫到（career＋tool 兩條路徑合計）",
    rl.ok && rt.ok && ["toEnginePlayerMods", "toEngineHeroMods", "toEngineHeroPassives", "toEngineHeroPowerCurve", "toEngineSpells", "toEngineTactic", "toEngineTacticIdentity", "matchItemsConfig", "toEngineItems"].every((k) => hits[k] > 0),
    JSON.stringify(hits));
}

// ── A10 舊樹引擎缺方法：tool 略過、production 照原樣失敗 ─────────────────────────────────────────
{
  class OldTree extends LogicEngine {}
  const MISS = ["configureHeroPassives", "configureHeroPowerCurve", "configureObjectiveLayout"];
  for (const m of MISS) OldTree.prototype[m] = undefined;
  const oldDeps = { ...DEPS, LogicEngine: OldTree };
  const t = assembleMatch(mk(toolIn()), oldDeps);
  ck("A10 tool 規則集：引擎缺 configureObjectiveLayout／HeroPassives／HeroPowerCurve ⇒ 略過（ok、configured 不含這三個）",
    t.ok && MISS.every((m) => !t.applied.configured.includes(m)) && t.applied.configured.includes("configureHeroSkills"), t.ok ? t.applied.configured.join(",") : codes(t).join(","));
  let threw = null;
  try { assembleMatch(mk(liveIn()), oldDeps); } catch (e) { threw = e; }
  ck("A10b production 規則集：同樣缺方法 ⇒ 照原樣失敗（丟 TypeError，不被容忍）", threw instanceof TypeError, threw ? String(threw.message).slice(0, 80) : "no throw");
}

{
  //  只有 v20 有護欄的三個方法可缺；其餘六個缺席 ⇒ tool 規則集也要丟 TypeError（每個方法一條）
  const { TOOL_TOLERATED_ENGINE_METHODS } = await import("../src/battle/moba/matchAssembler.js");
  ck("A10c 容忍清單恰為 v20 runner 的三個護欄（configureObjectiveLayout／HeroPassives／HeroPowerCurve）",
    JSON.stringify([...TOOL_TOLERATED_ENGINE_METHODS].sort()) === JSON.stringify(["configureHeroPassives", "configureHeroPowerCurve", "configureObjectiveLayout"]));
  const toolS = mk(toolIn());
  for (const m of ["configureHeroes", "configureHeroSkills", "configureArchetypes", "configureSpells", "configureMatch", "configureItems"]) {
    class Lacking extends LogicEngine {}
    Lacking.prototype[m] = undefined;
    let t = null;
    try { assembleMatch(toolS, { ...DEPS, LogicEngine: Lacking }); } catch (e) { t = e; }
    ck(`A10d tool 規則集：引擎缺 ${m} ⇒ 丟 TypeError（不默默組出半套引擎）`, t instanceof TypeError, t ? String(t.message).slice(0, 60) : "no throw");
  }
  //  C：天賦選擇交給 toEngineHeroSkills 的第二個引數——production 空選擇 ⇒ null（useLocalServer:176）；tool 原樣（v20 runner）
  const emptySel = Object.freeze({ version: "x", players: Object.freeze({}) });
  const seen = [];
  const depsWith = (sel) => ({ ...DEPS, heroAdapters: { ...DEPS.heroAdapters, selectBattleTalents: () => sel, toEngineHeroSkills: (r, t) => { seen.push(t); return DEPS.heroAdapters.toEngineHeroSkills(r, t); } } });
  assembleMatch(toolS, depsWith(emptySel));
  ck("A12 tool：空 players 的選擇物件原樣交給 toEngineHeroSkills（v20 runner 不收斂成 null）", seen[0] === emptySel);
  assembleMatch(mk(liveIn()), depsWith(emptySel));
  ck("A12b production：空 players 的選擇 ⇒ null（useLocalServer:176）", seen[1] === null);
  assembleMatch(toolS, depsWith(null));
  ck("A12c tool：selectBattleTalents 回 null ⇒ 交 null", seen[2] === null);
}

// ── A11 原始碼：組裝器不 import 任何它所呼叫的 adapter 模組（只經 deps）──────────────────────────────
{
  const ADAPTER_NAMES = ["toEnginePlayerMods", "toEngineHeroMods", "toEngineHeroPassives", "toEngineHeroPowerCurve", "toEngineSpells", "matchItemsConfig", "toEngineItems",
    "toEngineTactic", "toEngineTacticIdentity", "STANDARD_OPP_TACTIC", "MOBA_TACTIC_VERSION", "toEngineHeroSkills", "selectBattleTalents", "toEngineArchetypes"];
  const ADAPTER_MODULES = /mobaPlayerStats|mobaHeroProfile|heroPassiveGameplay|heroPowerCurve|mobaHeroLoadout|buildStrategyPrep|itemsEngineAdapter|MobaTacticConfig|heroSkillGameplay|heroBattleTalents|heroCombatArchetypes|LogicEngine/;
  const scan = (text) => {
    const code = stripComments(text);
    const imports = [...code.matchAll(/\bimport\s[^;]*?from\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const badImports = imports.filter((sp) => ADAPTER_MODULES.test(sp));
    const bareCalls = ADAPTER_NAMES.filter((n) => new RegExp(`(?<![.\\w])${n}\\s*\\(`).test(code));
    const importedNames = ADAPTER_NAMES.filter((n) => new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from`).test(code));
    return { badImports, bareCalls, importedNames, imports };
  };
  const real = scan(fs.readFileSync(path.join(ROOT, "src/battle/moba/matchAssembler.js"), "utf8"));
  ck("A11 matchAssembler.js 沒有 import 任何 adapter 模組、沒有裸呼叫任何 adapter、沒有 import 任何 adapter 名稱",
    real.badImports.length === 0 && real.bareCalls.length === 0 && real.importedNames.length === 0, JSON.stringify(real));
  const ctl = scan('import { toEngineItems } from "./items/itemsEngineAdapter.js";\nconst c = toEngineItems({});\n');
  ck("A11b 掃描器有檢定力：對含 adapter import＋裸呼叫的樣本必須各自命中", ctl.badImports.length === 1 && ctl.bareCalls.includes("toEngineItems") && ctl.importedNames.includes("toEngineItems"));
  const ctl2 = scan('// import { toEngineItems } from "./items/itemsEngineAdapter.js"\n/* toEngineItems( */\nconst c = A.toEngineItems({});\n');
  ck("A11c 掃描器不被註解／A. 前綴騙：註解裡的 import／呼叫與 A.toEngineItems( 都不算違規", ctl2.badImports.length === 0 && ctl2.bareCalls.length === 0 && ctl2.importedNames.length === 0);
}

// ── A8 applied：Live 需要的回傳值 ───────────────────────────────────────────────
{
  const r = assembleMatch(mk(encodeCase(liveCase)), DEPS);
  const a = r.applied ?? {};
  const srcs = a.talentSelection ? Object.fromEntries(Object.entries(a.talentSelection.players).map(([s, x]) => [s, x.source])) : null;
  ck("A8 applied.objectiveLayout／buildStrategy／tacticMeta 與 v20 Live 相同", r.ok && a.objectiveLayout === liveCase.live.objectiveLayout && a.buildStrategy === "early"
    && a.tacticMeta?.tacticId === "m4" && a.tacticMeta?.opponentTacticId === "std" && a.tacticMeta?.version === "MobaTacticConfig.v1");
  ck("A8b applied.talentSelection 的來源＝golden live.talentSources", JSON.stringify(srcs) === JSON.stringify(liveCase.live.talentSources));
  ck("A8c applied.replayConfig＝{ tacticId, tacticName, battleTalentIds }（同 useLocalServer beginReplayCapture.config）",
    a.replayConfig?.tacticId === "m4" && a.replayConfig?.tacticName === mobaTacticById("m4").name
    && JSON.stringify(a.replayConfig?.battleTalentIds) === JSON.stringify(Object.fromEntries(Object.entries(a.talentSelection.players).map(([s, x]) => [s, x.id]))));
  const nt = assembleMatch(mk({ ...encodeCase(golden.cases.find((c) => c.id === "live-notactic-13")) }), DEPS);
  ck("A8d 無藍方戰術 ⇒ tacticMeta null、replayConfig 無 tacticId", nt.ok && nt.applied.tacticMeta === null && !("tacticId" in nt.applied.replayConfig));
}

// ── A9 席位順序正規化：roster／talentSelections 鍵順序打亂 ⇒ setup 雜湊、呼叫、引數雜湊、結果全部相同 ────
//  setup 雜湊對鍵排序 ⇒ 若組裝器依插入順序走訪，「同雜湊 ⇒ 同模擬」只是經驗成立。組裝器依 CANONICAL_SEATS 重建。
{
  const SHUFFLE_IDS = ["live-m4-3", "live-m8-23", "runner-standard-3", "runner-early-10", "runner-counter-15", "challenge-draft-7"];
  //  決定性的打亂：反轉後再旋轉 3 格（對 10 個席位一定與原順序、正規順序都不同）
  const shuffleKeys = (o) => { if (!o) return o; const k = Object.keys(o).reverse(); const r = [...k.slice(3), ...k.slice(0, 3)]; return Object.fromEntries(r.map((x) => [x, o[x]])); };
  for (const id of SHUFFLE_IDS) {
    const c = golden.cases.find((x) => x.id === id);
    if (!c || (ONLY && !ONLY.has(id))) { if (!c) ck(`A9 ${id} 存在於 golden`, false); continue; }
    const base = encodeCase(c);
    const shuffled = { ...base, roster: shuffleKeys(base.roster), talentSelections: shuffleKeys(base.talentSelections ?? null) };
    const a = createMatchSetup(base), b = createMatchSetup(shuffled);
    const orderChanged = JSON.stringify(Object.keys(b.setup.roster)) !== JSON.stringify(Object.keys(a.setup.roster))
      && (!a.setup.talentSelections || Object.keys(a.setup.talentSelections).length < 2 || JSON.stringify(Object.keys(b.setup.talentSelections)) !== JSON.stringify(Object.keys(a.setup.talentSelections)));
    ck(`A9 ${id} 前提：打亂後 setup 內的鍵順序確實不同，但雜湊相同`, a.ok && b.ok && orderChanged && matchSetupHash(a.setup) === matchSetupHash(b.setup),
      a.ok && b.ok ? `roster ${Object.keys(b.setup.roster).join(",")}` : "setup failed");
    const { r, calls } = probedAssemble(b.setup);
    const diff = r.ok ? firstDiff(calls, c.calls) : "assemble failed";
    const res = r.ok ? runAndHash(r.engine, { dt: golden.dt, maxT: golden.maxT[c.path], every: golden.streamEvery }) : {};
    ck(`A9 ${id} 打亂鍵順序 ⇒ 呼叫序列＋引數雜湊＋digest＋streamHash 仍＝golden`, diff === "" && res.digest === c.digest && res.streamHash === c.streamHash,
      diff || `${res.digest}/${res.streamHash} vs ${c.digest}/${c.streamHash}`);
    ck(`A9 ${id} 交給 adapter 的天賦選擇依正規席位順序（applied.talentSelection.players 的鍵序；無天賦的案為空真）`, r.ok && (!r.applied.talentSelection
      || JSON.stringify(Object.keys(r.applied.talentSelection.players)) === JSON.stringify(["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"].filter((x) => x in r.applied.talentSelection.players))));
  }
  //  未知席位（setup 契約本身就擋；這裡用偽造的未凍結 setup 驗組裝器自己也擋）
  const forged = JSON.parse(JSON.stringify(createMatchSetup(encodeCase(golden.cases.find((x) => x.id === "runner-off-3"))).setup));
  forged.roster.b6 = { ...forged.roster.b1 };
  ck("A9b 未知席位 id ⇒ seat_unknown（不默默略過）", rejects(forged, "seat_unknown", "roster.b6"));
}

console.log(`\nMatch Assembler 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
