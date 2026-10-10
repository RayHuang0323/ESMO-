import fs from "node:fs";
import { createMatchSetup, matchSetupHash, fnv1a64Hex, MATCH_SETUP_VERSION } from "../src/platform/contracts/matchSetup.js";
import { stableStringify } from "../src/platform/contracts/squadSnapshot.js";
import { resolveRulesetForMode, rulesetById, PRODUCTION_FORBIDDEN_KEYS } from "../src/platform/contracts/matchRuleset.js";
import { resolveObjectiveLayout, objectiveLayoutForSeed } from "../src/platform/contracts/objectiveLayout.js";
import { mobaTacticById } from "../src/platform/contracts/MobaTacticConfig.js";
import { SIMULATION_SEMANTICS_FILES } from "../src/platform/contracts/simulationVersion.js";
import { FEATURE_FLAGS } from "../src/featureFlags.js";

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const golden = JSON.parse(fs.readFileSync(new URL("./fixtures/match_golden_v20.json", import.meta.url), "utf8"));
const G = golden.inputs;

const career = resolveRulesetForMode({ mode: "career", flags: FEATURE_FLAGS });
const challengeRs = rulesetById("challenge.v20");
const toolRs = rulesetById("balanceTool.v20");
const SEATS = ["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"];
const blueSlots = G.players.map((p, i) => ({ seat: `b${i + 1}`, playerId: p.id, role: p.role, stats: p.stats, energy: p.energy }));
const redSlots = G.players.map((p, i) => ({ seat: `r${i + 1}`, playerId: `ch_${p.id}`, role: p.role, stats: p.stats, energy: 100 }));
const legacy = (id = "m4") => ({ kind: "legacy", config: mobaTacticById(id) });
const codes = (r) => r.errors.map((e) => e.code);

const careerInput = (over = {}) => ({
  ruleset: career, seed: 3,
  loadout: G.defaultLoadout, playerSlots: { blue: blueSlots, red: [] },
  roster: G.liveRosters["3"], talentSelections: { b1: "tieshixin:counter-form", b2: "tielian:counter-form" },
  buildStrategy: "early", tactic: { blue: legacy("m4"), red: { kind: "std" } },
  meta: { sessionId: "s-1", mode: "career", opponentId: null, seedSource: "session" }, ...over,
});

// S1 合法 career setup；ruleset 凍結進 setup
const s1 = createMatchSetup(careerInput());
ck("S1 career setup 建立成功", s1.ok && s1.setup.schema === MATCH_SETUP_VERSION && MATCH_SETUP_VERSION === "MatchSetup.v1", codes(s1).join(","));
ck("S1b ruleset 以解析後物件凍結進 setup（含 layers）", s1.ok && s1.setup.rulesetId === "career.v20" && Object.isFrozen(s1.setup.ruleset) && Object.isFrozen(s1.setup.ruleset.layers) && s1.setup.ruleset.layers.items === career.layers.items);
ck("S1c 只給 rulesetId 也行", createMatchSetup(careerInput({ ruleset: undefined, rulesetId: "career.v20" })).ok);
ck("S1d 未知 rulesetId ⇒ unknown_ruleset", codes(createMatchSetup(careerInput({ ruleset: undefined, rulesetId: "nope.v1" }))).includes("unknown_ruleset"));

// S2 production 帶 tool 欄位 ⇒ tool_field_in_production（逐鍵）
for (const k of PRODUCTION_FORBIDDEN_KEYS) {
  const top = createMatchSetup(careerInput({ [k]: k === "forcedLayout" ? "SWAPPED" : k === "incomeK" ? 1.2 : k === "itemsStrategies" ? { blue: "early", red: null } : {} }));
  const nested = createMatchSetup(careerInput({ tool: { [k]: k === "forcedLayout" ? "SWAPPED" : k === "incomeK" ? 1.2 : k === "itemsStrategies" ? { blue: "early", red: null } : {} } }));
  ck(`S2 production 拒絕 ${k}（頂層與 tool 區塊）`, !top.ok && top.errors.some((e) => e.code === "tool_field_in_production" && e.field === k) && !nested.ok && nested.errors.some((e) => e.code === "tool_field_in_production" && e.field === `tool.${k}`));
}
ck("S2b production 拒絕空 tool 區塊", codes(createMatchSetup(careerInput({ tool: {} }))).includes("tool_field_in_production"));
const chIn = (over = {}) => ({ ruleset: challengeRs, seed: 11, meta: { seedSource: "challenge" }, loadout: G.defaultLoadout, playerSlots: { blue: blueSlots, red: redSlots },
  tactic: { blue: legacy("m4"), red: legacy("m7") }, ...over });
ck("S2c challenge（production）同樣拒絕 tool", codes(createMatchSetup(chIn({ tool: { incomeK: 1 } }))).includes("tool_field_in_production"));
const toolIn = (over = {}) => ({ ruleset: toolRs, seed: 3, meta: { seedSource: "tool" }, roster: G.runnerRosters["3"], tactic: { blue: { kind: "std" }, red: { kind: "std" } }, ...over });
const tl = createMatchSetup(toolIn({ tool: { incomeK: 1.1, itemsStrategies: { blue: "standard", red: "early" }, forcedLayout: "SWAPPED", ruleOverrides: { towerHp: 2 } } }));
ck("S2d tool ruleset 接受 tool 區塊", tl.ok && tl.setup.tool.incomeK === 1.1 && tl.setup.tool.itemsStrategies.red === "early" && tl.setup.tool.forcedLayout === "SWAPPED", codes(tl).join(","));
ck("S2e tool ruleset 無 tool 區塊 ⇒ 全 null 的 tool", (() => { const r = createMatchSetup(toolIn()); return r.ok && Object.values(r.setup.tool).every((v) => v === null); })());
ck("S2f tool 區塊未知鍵 / 壞值被拒", codes(createMatchSetup(toolIn({ tool: { bogus: 1 } }))).includes("unknown_tool_field") && codes(createMatchSetup(toolIn({ tool: { incomeK: -1 } }))).includes("tool_invalid") && codes(createMatchSetup(toolIn({ tool: { forcedLayout: "X" } }))).includes("tool_invalid"));

// S3 雜湊：鍵順序無關；任一欄改變 ⇒ 不同
const reorder = (o) => Array.isArray(o) ? o.map(reorder) : o && typeof o === "object" && !Object.isFrozen(o) || (o && typeof o === "object") ? Object.fromEntries(Object.keys(o).reverse().map((k) => [k, reorder(o[k])])) : o;
const h1 = matchSetupHash(s1.setup);
const s3 = createMatchSetup(reorder(careerInput()));
ck("S3 鍵順序不同 ⇒ 雜湊相同", s3.ok && matchSetupHash(s3.setup) === h1 && /^[0-9a-f]{16}$/.test(h1), h1);
const variants = {
  seed: { seed: 5 }, loadout: { loadout: { ...G.defaultLoadout, b1: { level: 2, toughMult: 1, powerMult: 1 } } },
  playerSlots: { playerSlots: { blue: blueSlots.slice(1), red: [] } }, roster: { roster: G.liveRosters["7"] },
  talentSelections: { talentSelections: { b1: "tieshixin:counter-form" } }, buildStrategy: { buildStrategy: "standard" },
  tacticBlue: { tactic: { blue: legacy("m8"), red: { kind: "std" } } }, tacticRed: { tactic: { blue: legacy("m4"), red: legacy("m7") } },
};
for (const [name, v] of Object.entries(variants)) {
  const r = createMatchSetup(careerInput(v));
  ck(`S3 改 ${name} ⇒ 雜湊不同`, r.ok && matchSetupHash(r.setup) !== h1, codes(r).join(","));
}
ck("S3b meta 不影響雜湊", matchSetupHash(createMatchSetup(careerInput({ meta: { seedSource: "local", sessionId: "other", mode: "x", opponentId: "team:1", playbackRate: 4, quality: "low", debug: true } })).setup) === h1);
ck("S3b2 seedSource 只差一項 ⇒ 雜湊相同，且記錄在 meta", (() => { const a = createMatchSetup(careerInput({ meta: { seedSource: "session" } })), b = createMatchSetup(careerInput({ meta: { seedSource: "local" } })); return a.ok && b.ok && a.setup.meta.seedSource === "session" && b.setup.meta.seedSource === "local" && matchSetupHash(a.setup) === matchSetupHash(b.setup) && !("seedSource" in a.setup); })());
ck("S3b3 頂層 seedSource 已不再接受 ⇒ unknown_field；缺 meta.seedSource ⇒ seed_source_invalid", codes(createMatchSetup(careerInput({ seedSource: "session" }))).includes("unknown_field") && codes(createMatchSetup(careerInput({ meta: { sessionId: "x" } }))).includes("seed_source_invalid"));
ck("S3c 呈現層欄位出現在頂層 ⇒ unknown_field", ["playbackRate", "quality", "debug", "diag"].every((k) => codes(createMatchSetup(careerInput({ [k]: 1 }))).includes("unknown_field")));
ck("S3d meta 內的呈現欄位被丟棄", (() => { const m = createMatchSetup(careerInput({ meta: { seedSource: "session", sessionId: "a", playbackRate: 4 } })).setup.meta; return !("playbackRate" in m) && m.sessionId === "a"; })());

// 同為 career.v20、旗標不同 ⇒ layers 不同 ⇒ 雜湊不同
const careerNoItems = resolveRulesetForMode({ mode: "career", flags: { ...FEATURE_FLAGS, itemsV1: false } });
const noItems = createMatchSetup(careerInput({ ruleset: careerNoItems, buildStrategy: null }));
const withItemsNullBuild = createMatchSetup(careerInput({ buildStrategy: null }));
ck("S3e 旗標不同的兩份 career.v20 ⇒ rulesetId 相同但雜湊不同", noItems.ok && withItemsNullBuild.ok && noItems.setup.rulesetId === withItemsNullBuild.setup.rulesetId && matchSetupHash(noItems.setup) !== matchSetupHash(withItemsNullBuild.setup), codes(noItems).join(","));
ck("S3f 層關閉時帶該層輸入 ⇒ layer_off_input_present", codes(createMatchSetup(careerInput({ ruleset: careerNoItems }))).includes("layer_off_input_present"));
ck("S3g 旗標不能強制開層（ruleset 超出登錄值）", (() => { const forged = { ...challengeRs, layers: { ...challengeRs.layers, items: true }, releaseRequirements: ["itemsV1"] }; return codes(createMatchSetup(chIn({ ruleset: forged }))).includes("production_layer_mismatch"); })());

// S4 objectiveLayout
const sw = createMatchSetup(careerInput({ seed: 3 }));
ck("S4 bySeed 且未給 ⇒ 由 seed 推導（同 resolveObjectiveLayout）", [3, 5, 7, 11, 21, 99].every((seed) => createMatchSetup(careerInput({ seed })).setup.objectiveLayout === resolveObjectiveLayout({ explicit: null, seed })) && sw.setup.objectiveLayout === "SWAPPED");
ck("S4b bySeed 明確指定等於推導值時接受（衝突值見 L7）", createMatchSetup(careerInput({ seed: 3, objectiveLayout: objectiveLayoutForSeed(3) })).setup.objectiveLayout === objectiveLayoutForSeed(3));
ck("S4c standard ruleset ⇒ 固定 STANDARD（不管 seed）", [3, 7, 11, 13].every((seed) => createMatchSetup(chIn({ seed })).setup.objectiveLayout === "STANDARD"));
ck("S4d standard ruleset 要求 SWAPPED ⇒ conflict", codes(createMatchSetup(chIn({ objectiveLayout: "SWAPPED" }))).includes("objective_layout_conflict"));
ck("S4e tool.forcedLayout 覆蓋 seed 推導", (() => { const seed = [3, 5, 7, 11, 13, 17].find((x) => objectiveLayoutForSeed(x) === "STANDARD"); return createMatchSetup(toolIn({ seed, tool: { forcedLayout: "SWAPPED" } })).setup.objectiveLayout === "SWAPPED"; })());
ck("S4f 非法 layout 值被拒", codes(createMatchSetup(careerInput({ objectiveLayout: "WEIRD" }))).includes("objective_layout_invalid"));

// S5 tactic
const variantCfg = { ...mobaTacticById("m4"), macro: { ...mobaTacticById("m4").macro, aggression: 0.91 } };
const v5 = createMatchSetup(careerInput({ tactic: { blue: { kind: "legacy", config: variantCfg }, red: { kind: "std" } } }));
ck("S5 legacy 變體數值原樣保存", v5.ok && v5.setup.tactic.blue.config.macro.aggression === 0.91 && JSON.stringify(v5.setup.tactic.blue.config) === JSON.stringify(variantCfg));
ck("S5b 雜湊涵蓋 legacy 變體數值", matchSetupHash(v5.setup) !== h1);
ck("S5c binding 形狀可接受；std 可接受", createMatchSetup(careerInput({ tactic: { blue: { kind: "binding", binding: { id: "b1", slots: [1, 2] } }, red: { kind: "std" } } })).ok);
ck("S5d 未知 kind ⇒ tactic_kind_unknown", codes(createMatchSetup(careerInput({ tactic: { blue: { kind: "magic" }, red: null } }))).includes("tactic_kind_unknown"));
//  T4 ruling 3a：legacy 的接受條件＝v20 兩個投影實際解參考的形狀（tacticId＋macro／objectives／lanePlan／economy）；
//  投影不讀 version ⇒ 缺 version／舊 version 的存檔戰術必須接受（原本這條把 version 不符也當成 tactic_invalid）。
const legacyCodes = (config) => codes(createMatchSetup(careerInput({ tactic: { blue: { kind: "legacy", ...(config === undefined ? {} : { config }) }, red: null } })));
const without = (k) => { const { [k]: _drop, ...rest } = variantCfg; return rest; };
ck("S5e legacy 缺 config／缺 tacticId／缺任一投影群組（macro／objectives／lanePlan／economy）⇒ tactic_invalid", legacyCodes(undefined).includes("tactic_invalid")
  && ["tacticId", "macro", "objectives", "lanePlan", "economy"].every((k) => legacyCodes(without(k)).includes("tactic_invalid")) && legacyCodes({ ...variantCfg, macro: null }).includes("tactic_invalid"));
ck("S5e2 legacy 缺 version／舊 version ⇒ 接受（v20 投影不讀 version），config 原樣保存", (() => {
  const noV = createMatchSetup(careerInput({ tactic: { blue: { kind: "legacy", config: without("version") }, red: null } }));
  const oldV = createMatchSetup(careerInput({ tactic: { blue: { kind: "legacy", config: { ...variantCfg, version: "x" } }, red: null } }));
  return noV.ok && !("version" in noV.setup.tactic.blue.config) && noV.setup.tactic.blue.config.macro.aggression === 0.91 && oldV.ok && oldV.setup.tactic.blue.config.version === "x";
})());
ck("S5f std 帶多餘欄位 ⇒ tactic_invalid", codes(createMatchSetup(careerInput({ tactic: { blue: { kind: "std", config: {} }, red: null } }))).includes("tactic_invalid"));
ck("S5g 呼叫端事後改 variantCfg 不影響已建立的 setup（複製）", (() => { const cfg = JSON.parse(JSON.stringify(variantCfg)); const r = createMatchSetup(careerInput({ tactic: { blue: { kind: "legacy", config: cfg }, red: null } })); cfg.macro.aggression = 0; return r.setup.tactic.blue.config.macro.aggression === 0.91; })());

// S6 深度凍結
const deepFrozen = (o) => !o || typeof o !== "object" || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
ck("S6 setup 深度凍結", deepFrozen(s1.setup) && deepFrozen(tl.setup));
ck("S6b 嘗試竄改丟錯（strict）", (() => { "use strict"; try { s1.setup.tactic.blue.config.macro.aggression = 0; return false; } catch { return s1.setup.tactic.blue.config.macro.aggression !== 0; } })());
ck("S6c 輸入物件不被凍結／改動", (() => { const inp = careerInput(); const copy = JSON.stringify({ ...inp, ruleset: 0 }); createMatchSetup(inp); return JSON.stringify({ ...inp, ruleset: 0 }) === copy && !Object.isFrozen(inp.roster) && !Object.isFrozen(inp.loadout); })());

// 資料契約：roster 只能是純資料
ck("D1 roster 拒絕英雄物件（多餘欄位）", codes(createMatchSetup(careerInput({ roster: { ...G.liveRosters["3"], b1: { heroId: "tieshixin", name: "鐵…", skills: [] } } }))).includes("roster_invalid"));
ck("D2 roster 缺席位 ⇒ roster_invalid", codes(createMatchSetup(careerInput({ roster: { b1: { heroId: "x" } } }))).includes("roster_invalid"));
ck("D3 非純資料（函式 / class / NaN / undefined 巢狀）被拒", (() => { class H { } return [{ roster: { ...G.liveRosters["3"], b1: { heroId: "a", spells: [() => 1] } } }, { loadout: { b1: new H() } }, { seed: NaN }, { playerSlots: { blue: [{ seat: "b1", x: NaN }], red: [] } }].every((o) => !createMatchSetup(careerInput(o)).ok); })());
ck("H1 FNV-1a 64 已知向量（空字串 / a / foobar）", fnv1a64Hex("") === "cbf29ce484222325" && fnv1a64Hex("a") === "af63dc4c8601ec8c" && fnv1a64Hex("foobar") === "85944171f73967e8");
ck("H2 UTF-8 位元組（非 UTF-16 碼元）：中文字串向量由獨立實作比對", (() => { let h = 0xcbf29ce484222325n; for (const b of Buffer.from("鐵壁", "utf8")) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn; return fnv1a64Hex("鐵壁") === h.toString(16).padStart(16, "0"); })());
ck("H3 setup 雜湊為 stableStringify（去 meta）的 FNV-1a 64", (() => { const { meta, ...rest } = s1.setup; return h1 === fnv1a64Hex(stableStringify(rest)); })());
ck("D4 matchSetup.js 不 import heroDatabase", !/heroDatabase|heroImages/.test(fs.readFileSync(new URL("../src/platform/contracts/matchSetup.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "")));
ck("D5 matchSetup.js 無 React/zustand/localStorage/Date/Math.random", !/\b(react|zustand|localStorage|Date\.now|Math\.random|performance\.now)\b/.test(fs.readFileSync(new URL("../src/platform/contracts/matchSetup.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "")));
ck("D6 matchSetup.js 不在 SIMULATION_SEMANTICS_FILES（清單非空且不含它）", Array.isArray(SIMULATION_SEMANTICS_FILES) && SIMULATION_SEMANTICS_FILES.length > 5 && !SIMULATION_SEMANTICS_FILES.includes("src/platform/contracts/matchSetup.js") && !SIMULATION_SEMANTICS_FILES.some((f) => /matchSetup/.test(f)));

// 玩家素質邊與 ruleset 一致
ck("P1 career 可無 playerSlots（golden live-noplayers）；空 slots 正規化為 null", createMatchSetup(careerInput({ playerSlots: null })).ok && createMatchSetup(careerInput({ playerSlots: { blue: [], red: [] } })).setup.playerSlots === null);
ck("P2 career 給 red slots ⇒ mismatch", codes(createMatchSetup(careerInput({ playerSlots: { blue: blueSlots, red: redSlots } }))).includes("player_slots_mismatch"));
ck("P3 challenge 需雙方 slots", codes(createMatchSetup(chIn({ playerSlots: { blue: blueSlots, red: [] } }))).includes("player_slots_mismatch"));
ck("P3b challenge 可整組沒有 playerSlots（v20：任一方快照沒宣告 playerStats ⇒ 整個略過 configurePlayers）；effectiveLayers.players 兩邊都 false；只給一邊仍 mismatch", (() => { const r = createMatchSetup(chIn({ playerSlots: null })); return r.ok && r.setup.playerSlots === null && r.setup.effectiveLayers.players.blue === false && r.setup.effectiveLayers.players.red === false && codes(createMatchSetup(chIn({ playerSlots: { blue: [], red: redSlots } }))).includes("player_slots_mismatch"); })());
ck("P4 tool ruleset（none）給 slots ⇒ mismatch", codes(createMatchSetup(toolIn({ playerSlots: { blue: blueSlots, red: [] } }))).includes("player_slots_mismatch"));

// 覆蓋 golden 的三條路徑：39 案「全部」以正確的 ruleset 重建成 setup，並以 effectiveLayers 對照 golden features
const OFF_SKILLS = { heroSkills: false, heroPassives: false, heroPowerCurve: false, battleTalents: false, items: false };
const toolRulesetFor = (c) => (c.params.skills === false
  ? Object.freeze({ ...toolRs, layers: Object.freeze({ ...toolRs.layers, ...OFF_SKILLS }) })
  : toolRs);
const encodeCase = (c) => {
  if (c.path === "live") {
    return { ruleset: career, seed: c.seed, loadout: G.defaultLoadout,
      playerSlots: c.params.noPlayers ? null : { blue: blueSlots, red: [] },
      roster: c.params.noRoster ? null : G.liveRosters[String(c.seed)],
      talentSelections: c.liveOpts.talentSelections, buildStrategy: c.live.buildStrategy,
      tactic: { blue: c.params.tacticId ? legacy(c.params.tacticId) : null, red: c.live.redTacticId === "std" ? { kind: "std" } : legacy(c.live.redTacticId) },
      meta: { sessionId: null, mode: "career", opponentId: c.liveOpts.opponentId, seedSource: "session" } };
  }
  if (c.path === "challenge") {
    return chIn({ seed: c.seed, roster: c.params.draft ? (G.liveRosters[String(c.seed)] ?? G.liveRosters["3"]) : null,
      tactic: { blue: legacy(c.params.tacticIds[0]), red: legacy(c.params.tacticIds[1]) } });
  }
  const it = c.features.items;
  return toolIn({ ruleset: toolRulesetFor(c), seed: c.seed, roster: G.runnerRosters[String(c.seed)],
    tool: it.applied ? { itemsStrategies: { blue: it.blueStrategies[0], red: it.redStrategies[0] } } : undefined });
};
const featureMismatches = (c, setup) => {
  const e = setup.effectiveLayers, f = c.features, bad = [];
  const want = (name, a, b) => { if (a !== b) bad.push(`${name}: setup=${a} golden=${b}`); };
  want("layout", e.layoutConfigured ? setup.objectiveLayout : null, f.objectiveLayout);
  want("players.blue", e.players.blue, f.playerStatSides.includes("blue"));
  want("players.red", e.players.red, f.playerStatSides.includes("red"));
  for (const k of ["heroMods", "heroSkills", "heroPassives", "heroPowerCurve", "archetypes", "spells"]) want(k, e[k], f[k]);
  want("items", e.items, f.items.applied);
  want("match", e.match, f.tactic !== null);
  if (f.battleTalents.applied && !e.battleTalents) bad.push("battleTalents: golden applied but setup not effective");
  return bad;
};
const allCases = golden.cases;
const built = allCases.map((c) => ({ c, r: createMatchSetup(encodeCase(c)) }));
ck(`G1 golden ${allCases.length} 案全部可成 setup（live ${allCases.filter((c) => c.path === "live").length} / challenge ${allCases.filter((c) => c.path === "challenge").length} / runner ${allCases.filter((c) => c.path === "runner").length}）`, allCases.length === 39 && built.every((b) => b.r.ok), built.filter((b) => !b.r.ok).map((b) => `${b.c.id}:${codes(b.r)}`).join(" "));
const mism = built.filter((b) => b.r.ok).map((b) => [b.c.id, featureMismatches(b.c, b.r.setup)]).filter(([, m]) => m.length);
ck("G2 effectiveLayers 與 39 案 golden features 逐項一致（layout / players / heroMods / skills / passives / curve / archetypes / spells / items / match；talents applied ⊆ effective）", mism.length === 0, mism.slice(0, 3).map(([id, m]) => `${id}{${m.join(";")}}`).join(" "));
ck("G2b battleTalents effective 與 golden applied 在 39 案中完全相等（目前無「選擇器空手」案）", built.every((b) => b.r.setup.effectiveLayers.battleTalents === b.c.features.battleTalents.applied));
ck("G2c 設定層鏡像：live-noroster 只有 layout+players+match；runner-off 有 heroMods/archetypes/spells 但無技能／天賦／裝備；challenge-nodraft 只有 players+match", (() => {
  const E = (id) => built.find((b) => b.c.id === id).r.setup.effectiveLayers;
  const nr = E("live-noroster-21"), ro = E("runner-off-3"), nd = E("challenge-nodraft-3"), dr = E("challenge-draft-3");
  return nr.layoutConfigured && nr.players.blue && nr.match && !nr.heroMods && !nr.archetypes && !nr.spells && !nr.heroSkills && !nr.items
    && ro.heroMods && ro.archetypes && ro.spells && !ro.heroSkills && !ro.battleTalents && !ro.items && !ro.players.blue && ro.match
    && !nd.layoutConfigured && nd.players.blue && nd.players.red && nd.match && !nd.heroMods && !nd.spells
    && dr.heroMods && dr.archetypes && dr.spells && !dr.heroSkills && !dr.layoutConfigured;
})());
ck("G2d live-notactic 無 match；live-noplayers 無 players；effectiveLayers 為凍結物件", (() => {
  const E = (id) => built.find((b) => b.c.id === id).r.setup.effectiveLayers;
  return E("live-notactic-13").match === false && E("live-noplayers-17").players.blue === false && Object.isFrozen(E("live-m4-3")) && Object.isFrozen(E("live-m4-3").players);
})());
const hsh = (x) => matchSetupHash(x.r.setup);
ck("G3 39 案雜湊兩兩相異（同 seed 的 live/challenge/runner 也不同）", new Set(built.map(hsh)).size === built.length);
ck("G3b effectiveLayers 納入雜湊：只差 buildStrategy（items 有無）⇒ 雜湊不同且 items 旗標翻轉", (() => {
  const c = allCases.find((x) => x.id === "live-m4-3");
  const a = createMatchSetup(encodeCase(c)), b = createMatchSetup({ ...encodeCase(c), buildStrategy: null });
  return a.ok && b.ok && a.setup.effectiveLayers.items && !b.setup.effectiveLayers.items && matchSetupHash(a.setup) !== matchSetupHash(b.setup);
})());
ck("G3c tool items：{blue:early} 補 red=standard；全空 ⇒ null（裝備關）", (() => {
  const a = createMatchSetup(toolIn({ tool: { itemsStrategies: { blue: "early" } } })), b = createMatchSetup(toolIn({ tool: { itemsStrategies: {} } })), c = createMatchSetup(toolIn({ tool: { itemsStrategies: { blue: "standard", red: "standard" } } }));
  return a.setup.tool.itemsStrategies.red === "standard" && b.setup.tool.itemsStrategies === null && !b.setup.effectiveLayers.items && c.setup.effectiveLayers.items && matchSetupHash(b.setup) !== matchSetupHash(c.setup);
})());

// production ruleset 鎖定（review probes）
const withLayers = (rs, patch) => Object.freeze({ ...rs, layers: Object.freeze({ ...rs.layers, ...patch }) });
const hasCode = (r, code) => !r.ok && r.errors.some((e) => e.code === code);
ck("L1 challenge.v20 + objectiveLayout:'bySeed' ⇒ production_layer_mismatch", hasCode(createMatchSetup(chIn({ ruleset: withLayers(challengeRs, { objectiveLayout: "bySeed" }) })), "production_layer_mismatch"));
ck("L2 career.v20 + objectiveLayout:'explicit' ⇒ production_layer_mismatch", hasCode(createMatchSetup(careerInput({ ruleset: withLayers(career, { objectiveLayout: "explicit" }), objectiveLayout: "SWAPPED" })), "production_layer_mismatch"));
ck("L3 production playerStatSides / redTactic 改值 ⇒ mismatch", hasCode(createMatchSetup(chIn({ ruleset: withLayers(challengeRs, { playerStatSides: "blue" }) })), "production_layer_mismatch") && hasCode(createMatchSetup(careerInput({ ruleset: withLayers(career, { redTactic: "std" }) })), "production_layer_mismatch"));
ck("L3b production assemblyOrder 改值 ⇒ mismatch（challenge 不能改走 live 順序，career 不能改走 challengeV20）", hasCode(createMatchSetup(chIn({ ruleset: withLayers(challengeRs, { assemblyOrder: "live" }) })), "production_layer_mismatch") && hasCode(createMatchSetup(careerInput({ ruleset: withLayers(career, { assemblyOrder: "challengeV20" }) })), "production_layer_mismatch"));
ck("L3c tool 可自選 assemblyOrder（仍受 validateRuleset 列舉）：challengeV20 接受、未知值拒絕", createMatchSetup(toolIn({ ruleset: withLayers(toolRs, { assemblyOrder: "challengeV20" }) })).ok && !createMatchSetup(toolIn({ ruleset: withLayers(toolRs, { assemblyOrder: "fast" }) })).ok);
ck("L4 production 未知／缺少 layer 鍵、非布林值 ⇒ mismatch", hasCode(createMatchSetup(careerInput({ ruleset: withLayers(career, { sneaky: true }) })), "production_layer_mismatch")
  && hasCode(createMatchSetup(careerInput({ ruleset: Object.freeze({ ...career, layers: Object.freeze(Object.fromEntries(Object.entries(career.layers).filter(([k]) => k !== "redTactic"))) }) })), "production_layer_mismatch")
  && hasCode(createMatchSetup(careerInput({ ruleset: withLayers(career, { items: "yes" }) })), "production_layer_mismatch"));
ck("L5 production 布林層不能打開（challenge items:true）", !createMatchSetup(chIn({ ruleset: withLayers(challengeRs, { items: true }) })).ok);
ck("L6 production 布林層可關閉（career items:false 仍成立）", createMatchSetup(careerInput({ ruleset: withLayers(career, { items: false }), buildStrategy: null })).ok);
const derived3 = objectiveLayoutForSeed(3), other3 = derived3 === "SWAPPED" ? "STANDARD" : "SWAPPED";
ck("L7 career bySeed：與 seed 推導衝突的 explicit ⇒ objective_layout_conflict", hasCode(createMatchSetup(careerInput({ seed: 3, objectiveLayout: other3 })), "objective_layout_conflict"));
ck("L8 career bySeed：與推導一致的 explicit 仍接受（恢復路徑），結果相同雜湊", (() => { const a = createMatchSetup(careerInput({ seed: 3, objectiveLayout: derived3 })), b = createMatchSetup(careerInput({ seed: 3 })); return a.ok && matchSetupHash(a.setup) === matchSetupHash(b.setup); })());
ck("L9 tool 規則集：explicit 與 forcedLayout 不同 ⇒ conflict；forcedLayout 不同 ⇒ 雜湊不同", (() => {
  const c = createMatchSetup(toolIn({ objectiveLayout: "STANDARD", tool: { forcedLayout: "SWAPPED" } }));
  const a = createMatchSetup(toolIn({ tool: { forcedLayout: "STANDARD" } })), b = createMatchSetup(toolIn({ tool: { forcedLayout: "SWAPPED" } }));
  return hasCode(c, "objective_layout_conflict") && matchSetupHash(a.setup) !== matchSetupHash(b.setup);
})());
ck("L10 tool 規則集的布林層也不能超出登錄值", !createMatchSetup(toolIn({ ruleset: withLayers(toolRs, { heroSkills: 1 }) })).ok);

// 正規形
ck("N1 空物件 ⇒ null：loadout / talentSelections / roster / tool.ruleOverrides / 空 playerSlots，雜湊與省略相同", (() => {
  const a = createMatchSetup(careerInput({ loadout: {}, talentSelections: {}, roster: {}, playerSlots: { blue: [], red: [] }, buildStrategy: null }));
  const b = createMatchSetup(careerInput({ loadout: null, talentSelections: null, roster: null, playerSlots: null, buildStrategy: null }));
  const t1 = createMatchSetup(toolIn({ tool: { ruleOverrides: {} } })), t2 = createMatchSetup(toolIn());
  return a.ok && b.ok && a.setup.loadout === null && a.setup.talentSelections === null && a.setup.roster === null && a.setup.playerSlots === null
    && matchSetupHash(a.setup) === matchSetupHash(b.setup) && t1.setup.tool.ruleOverrides === null && matchSetupHash(t1.setup) === matchSetupHash(t2.setup);
})());
ck("N2 challenge 的空 playerSlots 對（blue／red 皆空）＝沒有素質：ok、正規化為 null，雜湊與省略相同", (() => { const a = createMatchSetup(chIn({ playerSlots: { blue: [], red: [] } })), b = createMatchSetup(chIn({ playerSlots: null })); return a.ok && b.ok && a.setup.playerSlots === null && matchSetupHash(a.setup) === matchSetupHash(b.setup); })());

// 錯誤形狀
ck("E1 失敗回傳 { ok:false, setup:null, errors[{code,field,message}] }", (() => { const r = createMatchSetup(careerInput({ seed: "x", meta: { seedSource: "?" } })); return !r.ok && r.setup === null && r.errors.length >= 2 && r.errors.every((e) => e.code && e.field && e.message); })());
ck("E2 非物件輸入", !createMatchSetup(null).ok && !createMatchSetup("x").ok);

console.log(`\nMatch Setup 契約 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`); process.exit(fail ? 1 : 0);
