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
import { createMatchSetup, matchSetupHash } from "../src/platform/contracts/matchSetup.js";
import { rulesetById, resolveRulesetForMode, MATCH_RULESETS } from "../src/platform/contracts/matchRuleset.js";
import { mobaTacticById } from "../src/platform/contracts/MobaTacticConfig.js";
import { stableStringify, stableHash, snapshotHashOf, SNAPSHOT_INPUTS, SNAPSHOT_SEATS, snapshotCovers } from "../src/platform/contracts/squadSnapshot.js";
import { LogicEngine } from "../src/LogicEngine.js";
import { CHAMPIONS_100, heroById } from "../src/data/heroDatabase.js";
import { toEngineHeroSkills } from "../src/battle/moba/skills/heroSkillGameplay.js";
import { selectBattleTalents, battleTalentOptions } from "../src/battle/moba/talents/heroBattleTalents.js";
import { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } from "../src/data/heroCombatArchetypes.js";
import { applyFatigueToLoadout, buildPlayerStatSlots } from "../src/battle/moba/mobaRosterAdapter.js";
import { buildLoadout as buildHeroLoadout } from "../src/battle/moba/mobaHeroLoadout.js";
import { fixtureSnapshot, FIXTURE_OPPONENTS } from "../src/platform/challenge/fixtureOpponents.js";
import { createDraftResult, draftResultToRoster } from "../src/platform/challenge/draftResult.js";
import { assignDraft } from "../src/battle/moba/mobaDraftAssignment.js";
import { heroTags } from "../src/data/heroClassification.js";
import { createChallengeInstance } from "../src/platform/contracts/challengeInstance.js";
import { SNAPSHOT_AUTHORITY } from "../src/platform/challenge/snapshotAuthority.js";
import { runAndHash } from "./lib/matchGolden.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argOf = (name) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : null; };
const ONLY = argOf("only") ? new Set(argOf("only").split(",")) : null;

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const codes = (r) => (r?.errors ?? []).map((e) => e.code);

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
const G = golden.inputs;

const DEPS = Object.freeze({
  LogicEngine,
  heroLookup: heroById,
  heroAdapters: Object.freeze({ toEngineHeroSkills, selectBattleTalents, battleTalentOptions, toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION }),
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
const career = resolveRulesetForMode({ mode: "career", flags: golden.featureFlags });
const challengeRs = rulesetById("challenge.v20");
const toolRs = rulesetById("balanceTool.v20");
const OFF_SKILLS = { heroSkills: false, heroPassives: false, heroPowerCurve: false, battleTalents: false, items: false };
const legacy = (id) => ({ kind: "legacy", config: mobaTacticById(id) });
const plainRoster = (r) => Object.fromEntries(Object.entries(r).map(([s, row]) => [s, { heroId: row.heroId, ...(Array.isArray(row.spells) ? { spells: row.spells } : {}) }]));

// Challenge 輸入重建（與 capture 的 challengeInputs 相同步驟）
const POOL = CHAMPIONS_100.map((h) => h.id).sort();
const laneOf = (id) => heroById(id)?.lane ?? null;
const FIXTURE_KEYS = FIXTURE_OPPONENTS.map((o) => o.key);
const withTactic = (snap, tacticId) => { const s = { ...snap, standingOrders: { ...snap.standingOrders, tacticId } }; s.hash = snapshotHashOf(s); return s; };
const withoutDraftPolicy = (snap) => { const s = { ...snap, capturedInputs: snap.capturedInputs.filter((x) => x !== SNAPSHOT_INPUTS.draftPolicy) }; s.hash = snapshotHashOf(s); return s; };
const toRedSeat = (seat) => `r${seat.slice(1)}`;
const sideInputs = (snapshot, side) => {
  const slots = [], loadout = {};
  for (const seat of SNAPSHOT_SEATS) {
    const engineSeat = side === "red" ? toRedSeat(seat) : seat;
    slots.push({ id: engineSeat, playerId: snapshot.seats.find((s) => s.seat === seat)?.playerId ?? null, stats: snapshot.combat.stats[seat] });
    loadout[engineSeat] = { ...snapshot.combat.loadout[seat] };
  }
  return { slots, loadout };
};
function challengeSetupInput(c) {
  const p = c.params;
  const keyA = FIXTURE_KEYS[p.index % FIXTURE_KEYS.length], keyB = FIXTURE_KEYS[(p.index + 2) % FIXTURE_KEYS.length];
  let a = withTactic(fixtureSnapshot(keyA, { playerMasteryLevel: 1 }).snapshot, p.tacticIds[0]);
  let d = withTactic(fixtureSnapshot(keyB, { playerMasteryLevel: 1 }).snapshot, p.tacticIds[1]);
  if (!p.draft) { a = withoutDraftPolicy(a); d = withoutDraftPolicy(d); }
  let draftResult = null;
  if (p.draft) {
    const r = createDraftResult({ challengerActions: [], defenderPolicy: d.standingOrders.draftPolicy, challengerPolicy: a.standingOrders.draftPolicy,
      pool: POOL, challengerSnapshot: a, defenderSnapshot: d, assign: assignDraft, tagsOf: heroTags, heroOf: heroById, laneOf });
    if (!r.ok) throw new Error(`draft failed for ${c.id}`);
    draftResult = r.draft;
  }
  const inst = createChallengeInstance({ challenger: a, defender: d, challengerTacticId: p.tacticIds[0], seedSource: p.seed, createdAt: 1757000000000,
    issuedBy: SNAPSHOT_AUTHORITY.id, nonce: `golden-${c.id}`, opponentKey: keyB, draftResult });
  if (!inst.ok) throw new Error(`challenge instance failed for ${c.id}`);
  const ch = inst.challenge;
  const covers = (inp) => snapshotCovers(a, inp) && snapshotCovers(d, inp);
  const blue = sideInputs(a, "blue"), red = sideInputs(d, "red");
  let roster = null;
  if (draftResult) {
    const withHero = Object.fromEntries(Object.entries(draftResultToRoster(draftResult)).map(([s, v]) => [s, { ...v, hero: heroById(v.heroId) ?? null }]));
    const spells = buildHeroLoadout(withHero, heroById);
    roster = Object.fromEntries(Object.keys(withHero).map((s) => [s, { heroId: withHero[s].heroId, spells: spells[s].spells }]));
  }
  return {
    ruleset: challengeRs, seed: ch.matchSeed,
    loadout: covers(SNAPSHOT_INPUTS.heroLoadout) ? { ...blue.loadout, ...red.loadout } : null,
    playerSlots: covers(SNAPSHOT_INPUTS.playerStats) ? { blue: blue.slots, red: red.slots } : null,
    roster,
    tactic: covers(SNAPSHOT_INPUTS.tactic) ? { blue: legacy(ch.challengerTacticId), red: legacy(ch.defenderTacticId) } : null,
    meta: { sessionId: null, mode: "challenge", opponentId: keyB, seedSource: "challenge" },
  };
}

function encodeCase(c) {
  const p = c.params;
  if (c.path === "live") {
    const players = p.noPlayers ? [] : G.players, lineup = p.noPlayers ? null : G.lineup;
    return {
      ruleset: career, seed: c.ctor.seed,
      loadout: applyFatigueToLoadout(G.defaultLoadout, players, lineup),
      playerSlots: { blue: buildPlayerStatSlots(players, "blue", lineup), red: [] },
      roster: p.noRoster ? null : plainRoster(G.liveRosters[String(c.seed)]),
      talentSelections: c.liveOpts.talentSelections, buildStrategy: c.live.buildStrategy,
      tactic: { blue: p.tacticId ? legacy(p.tacticId) : null, red: c.live.redTacticId === "std" ? { kind: "std" } : legacy(c.live.redTacticId) },
      meta: { sessionId: null, mode: "career", opponentId: c.liveOpts.opponentId, seedSource: "session" },
    };
  }
  if (c.path === "challenge") return challengeSetupInput(c);
  //  runner：策略側由 params 推導（runner:146-151），不讀 golden features（避免自我驗證）
  let itemsStrategies;
  if (p.config !== "off") {
    const side = p.seed % 2 === 0 ? "blue" : "red";
    itemsStrategies = p.config === "standard" ? { blue: "standard", red: "standard" }
      : { blue: side === "blue" ? p.config : "standard", red: side === "red" ? p.config : "standard" };
  }
  const ruleset = p.skills === false ? Object.freeze({ ...toolRs, layers: Object.freeze({ ...toolRs.layers, ...OFF_SKILLS }) }) : toolRs;
  return { ruleset, seed: c.seed, roster: plainRoster(G.runnerRosters[String(c.seed)]),
    tactic: { blue: { kind: "std" }, red: { kind: "std" } }, ...(itemsStrategies ? { tool: { itemsStrategies } } : {}),
    meta: { sessionId: null, mode: "balance", opponentId: null, seedSource: "tool" } };
}

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
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
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

console.log(`\nMatch Assembler 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
