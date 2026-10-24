#!/usr/bin/env node
// ============================================================================
//  tools/check_career_v21_tactics_c6.mjs — career.v21 正式組裝路徑載入新戰術能力（Phase 3a-C5／C6，秒級）
//
//  執行：node tools/check_career_v21_tactics_c6.mjs
//  走 Live 的正式入口：resolveLiveRuleset（旗標）→ buildLiveMatchSetup（bindingForRuleset）→ assembleMatch（configureMatch）→
//  引擎的 Director（e.director），不 tick。比的是 Director 在 0／600／1200 秒（前／中／後期）交給引擎的 knobs 與 identity。
//    V1 旗標開 ⇒ career.v21、Director core.v1；旗標關 ⇒ career.v20、static
//    V2 勝利條件「前期滾雪球」：Director 每個時期的方針＝玩家直接選展開後那幾格（前期／中期積極、前期巨龍）的方針（沒有隱藏加成），
//       且與不選時不同（真的載入）
//    V3 強邊（快速模式：前＋中期下路）：前期、中期的 knobs 帶 gankFocusLane（己方路名）／gankFocusAdd，後期沒有（R-4）；
//       與積極姿態、勝利條件同時選用 ⇒ 組裝成功，Director 方針＝逐格手選的方針
//    V4 旗標關（career.v20）：同一份計畫的 v21 專用選擇從本場拿掉（notes 記下）；中期積極也拿掉＝跨版本證據隔離（v20 的 n=40 沒過，
//       只在 static 排除，Owner 2026-10-23）；前期積極保留；Director 是 static
//    V5 被撤下的勝利條件（控圖運營）的舊計畫：v21 仍能組裝（已存計畫不失效），結果＝手選展開後的格
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleMatch } from "../src/battle/moba/matchAssembler.js";
import { sharedMatchAssemblerDeps } from "../src/battle/moba/matchAssemblerDeps.js";
import { buildLiveMatchSetup, resolveLiveRuleset } from "../src/battle/moba/liveMatchSetup.js";
import { tacticalDirectorModeOf } from "../src/platform/contracts/matchRuleset.js";
import { createTacticPlan } from "../src/platform/tactics/tacticPlan.js";
import { bindTacticPlanToCurrentVersions, effectiveTacticChoices } from "../src/battle/moba/tactics/tacticResolver.js";
import { withChoice, QUICK_STRONG_SIDE } from "../src/screens/moba/tacticBook/tacticBookOptions.js";
import { aiTeamById } from "../src/platform/competition/aiTeams.js";
import { hookSeed, appRoster } from "./lib/liveGolden.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
const G = golden.inputs;
const FLAGS_V20 = Object.freeze({ ...golden.featureFlags });
const FLAGS_V21 = Object.freeze({ ...golden.featureFlags, mobaTacticalDirectorV21: true });
const DEPS = sharedMatchAssemblerDeps();
const SEED = 3;
const TIMES = [0, 600, 1200];

const bindingOf = (choices, templateId = "std") => {
  const c = createTacticPlan({ templateId, choices });
  if (!c.ok) throw new Error(`plan rejected ${J(choices)}: ${c.errors.map((e) => e.code).join(",")}`);
  return bindTacticPlanToCurrentVersions(c.plan);
};
/** 正式 Live 組裝；回傳 { rs, built, asm, plan }，plan＝Director 在三個時刻的 [knobs, identity]。 */
function assemble(binding, flags) {
  const opts = { seed: SEED, roster: appRoster(G.liveRosters[String(SEED)]), tacticPlanBinding: binding, sessionId: "career-v21-c6", mode: "moba" };
  const { seed, seedSource } = hookSeed(opts);
  const rs = resolveLiveRuleset({ flags }).ruleset;
  const built = buildLiveMatchSetup({ opts, ruleset: rs, flags, seed, seedSource, profile: { players: G.players, lineup: G.lineup }, heroProgress: { loadout: G.defaultLoadout }, opponentTeam: null });
  if (!built.ok) return { rs, built, asm: null, plan: null };
  const asm = assembleMatch(built.setup, DEPS);
  if (!asm.ok) return { rs, built, asm, plan: null };
  const e = asm.engine, saved = e.t;
  const plan = TIMES.map((t) => { e.t = t; return J([e.director.knobs("blue"), e.director.identity("blue")]); });
  e.t = saved;
  return { rs, built, asm, plan };
}

// ── V1 規則集 ────────────────────────────────────────────────────────────
const base21 = assemble(bindingOf({}), FLAGS_V21), base20 = assemble(bindingOf({}), FLAGS_V20);
ck("V1 旗標開 ⇒ career.v21、Director core.v1；旗標關 ⇒ career.v20、static（兩者都組裝成功）",
  base21.rs.rulesetId === "career.v21" && tacticalDirectorModeOf(base21.rs) === "core.v1" && base21.asm?.engine.director.mode === "core.v1"
  && base20.rs.rulesetId === "career.v20" && base20.asm?.engine.director.mode === "static",
  `${base21.rs.rulesetId}/${base21.asm?.engine.director.mode} ${base20.rs.rulesetId}/${base20.asm?.engine.director.mode}`);

// ── V2 前期滾雪球 ─────────────────────────────────────────────────────────
const wc = { winCondition: "earlySnowball" };
const wcRun = assemble(bindingOf(wc), FLAGS_V21);
const wcManual = assemble(bindingOf(effectiveTacticChoices("std", [], wc)), FLAGS_V21);
const eff = effectiveTacticChoices("std", [], wc);
ck("V2 勝利條件「前期滾雪球」走 career.v21 組裝：Director 前／中／後期的方針＝玩家直接選展開後那幾格（逐字元相同，沒有隱藏加成），且與不選時不同",
  wcRun.plan !== null && J(wcRun.plan) === J(wcManual.plan) && J(wcRun.plan) !== J(base21.plan)
  && eff.phases?.early?.stance === "aggressive" && eff.phases?.mid?.stance === "aggressive" && eff.phases?.early?.objectiveOrder === "dragon",
  `${J(eff)}；不同的時期：${TIMES.filter((_, i) => wcRun.plan?.[i] !== base21.plan?.[i]).join(",")}`);

// ── V3 強邊（快速模式）＋積極＋勝利條件 ─────────────────────────────────────
const quick = withChoice({}, QUICK_STRONG_SIDE, "bot", null);
const qRun = assemble(bindingOf(quick), FLAGS_V21);
const qK = qRun.asm ? TIMES.map((t) => { const e = qRun.asm.engine; e.t = t; const k = e.director.knobs("blue"); return { lane: k.gankFocusLane, add: k.gankFocusAdd }; }) : null;
ck("V3 快速強邊（下路）走 career.v21 組裝：前期、中期 knobs 帶 gankFocusLane＝bot（己方路名）與正的 gankFocusAdd，後期沒有（沒選的時期不出現，R-4）",
  !!qK && qK[0].lane === "bot" && qK[1].lane === "bot" && qK[0].add > 0 && qK[1].add > 0 && qK[2].lane === undefined && qK[2].add === undefined, J(qK));
const combo = { ...withChoice(withChoice(quick, "phases.early.stance", "aggressive", "standard"), "phases.mid.stance", "aggressive", "standard"), winCondition: "earlySnowball" };
const comboRun = assemble(bindingOf(combo), FLAGS_V21);
const comboManual = assemble(bindingOf(effectiveTacticChoices("std", [], combo)), FLAGS_V21);
ck("V3b 強邊＋前期／中期積極＋前期滾雪球同時選用 ⇒ 組裝成功、沒有任何選擇被拿掉；Director 方針＝逐格手選的方針",
  comboRun.plan !== null && comboRun.built.notes.every((n) => !/dropped/.test(n)) && J(comboRun.plan) === J(comboManual.plan), comboRun.built.notes.join(" | "));

// ── V4 旗標關：v21 專用選擇從本場拿掉 ───────────────────────────────────────
const offRun = assemble(bindingOf(combo), FLAGS_V20);
const dropNote = offRun.built.notes.find((n) => /^tactic\.blue: dropped/.test(n)) ?? "";
ck("V4 旗標關（career.v20）：同一份計畫的 v21 專用選擇（勝利條件、強邊）從本場拿掉並記在 notes；中期積極因跨版本證據隔離（static 排除）也拿掉；前期積極保留；Director 是 static",
  offRun.asm?.ok === true && offRun.asm.engine.director.mode === "static" && /winCondition=earlySnowball/.test(dropNote) && /phases\.early\.focusLane=bot/.test(dropNote)
  && /phases\.mid\.focusLane=bot/.test(dropNote) && /phases\.mid\.stance=aggressive/.test(dropNote) && !/phases\.early\.stance/.test(dropNote), dropNote);

// ── V5 被撤下的勝利條件：舊計畫不失效 ───────────────────────────────────────
const oc = { winCondition: "objectiveControl" };
const ocRun = assemble(bindingOf(oc), FLAGS_V21);
const ocManual = assemble(bindingOf(effectiveTacticChoices("std", [], oc)), FLAGS_V21);
ck("V5 被撤下的勝利條件（控圖運營）的已存計畫：career.v21 仍組裝成功，Director 方針＝手選展開後那幾格（只是不再提供挑選）",
  ocRun.plan !== null && J(ocRun.plan) === J(ocManual.plan) && J(ocRun.plan) !== J(base21.plan));

console.log(`\nCareer v21 Tactics C6：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
