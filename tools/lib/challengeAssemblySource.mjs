// ============================================================================
//  tools/lib/challengeAssemblySource.mjs — 「選角三層只在 draftDeclared 時進引擎」的證據（Phase 3a Task 5）
//
//  v20 的 challengeRunner 自己呼叫 eng.configureHeroes／Archetypes／Spells，並把它們關在 `if (draftDeclared) { … }`
//  裡；check_player_challenge_slice1 ⑦ 與 slice5 ②E 原本直接掃 runner 原始碼釘這兩件事。
//  Task 5 之後事實分散在四處（runner → builder → MatchSetup 契約 → 組裝器），所以兩支 verifier 改用這裡的同一份
//  證據（單一實作，不各寫一份正則）：
//   · 原始碼事實（一律先用 tools/lib/stripComments.mjs 剝註解再比對）
//   · 行為事實：在 LogicEngine.prototype 上裝探針，真的跑一場，看哪些 configure* 被呼叫
// ============================================================================
import { readFileSync } from "node:fs";
import { stripComments } from "./stripComments.mjs";

const ROOT = new URL("../../", import.meta.url);
const code = (rel) => stripComments(readFileSync(new URL(rel, ROOT), "utf8"));

/**
 * 原始碼事實。回傳 { assemblerRunsDraftSteps, draftStepsGated, details }。
 *  · assemblerRunsDraftSteps：runner 只經 assembleMatch 組裝（不自己 configure*）；組裝器真的有
 *    configureHeroes／Archetypes／Spells 三個呼叫，challengeV20 的步驟順序含 heroes→archetypes→spells；
 *    challenge.v20 規則集用的就是 challengeV20 順序。
 *  · draftStepsGated：三個步驟的唯一輸入是 roster，而 roster 只在 draftDeclared 時才進 builder
 *    （runner 傳 `draftResult: draftDeclared ? draftResult : null`；builder 只在 `if (draftResult)` 裡建 roster；
 *    MatchSetup 契約：heroMods／archetypes／spells ＝ 有 roster；組裝器三步驟各自以 E.* 短路）。
 */
export function challengeDraftSourceFacts() {
  const runner = code("src/platform/challenge/challengeRunner.js");
  const builder = code("src/platform/challenge/challengeMatchSetup.js");
  const asm = code("src/battle/moba/matchAssembler.js");
  const setup = code("src/platform/contracts/matchSetup.js");
  const ruleset = code("src/platform/contracts/matchRuleset.js");
  const details = {
    runnerViaAssembler: /assembleMatch\(/.test(runner) && !/\.configure[A-Z]\w*\s*\(/.test(runner) && !/new\s+LogicEngine/.test(runner),
    asmCalls: ["configureHeroes", "configureArchetypes", "configureSpells"].every((m) => asm.includes(`call("${m}",`)),
    stepOrder: /challengeV20:\s*Object\.freeze\(\[\s*"players",\s*"match",\s*"heroes",\s*"archetypes",\s*"spells"\s*\]\)/.test(asm),
    rulesetOrder: /"challenge\.v20"/.test(ruleset) && /assemblyOrder:\s*"challengeV20"/.test(ruleset),
    runnerGatesDraft: /draftResult:\s*draftDeclared\s*\?\s*draftResult\s*:\s*null/.test(runner),
    builderGatesRoster: /let roster = null;\s*if \(draftResult\) \{/.test(builder) && /\broster,\s*\n/.test(builder),
    contractRosterOnly: /heroMods:\s*hasRoster,\s*archetypes:\s*hasRoster,\s*spells:\s*hasRoster/.test(setup),
    asmShortCircuits: /heroes\(\)\s*\{\s*if \(!E\.heroMods\) return;/.test(asm) && /archetypes\(\)\s*\{\s*if \(!E\.archetypes\) return;/.test(asm)
      && /spells\(\)\s*\{\s*if \(!E\.spells\) return;/.test(asm),
  };
  return {
    assemblerRunsDraftSteps: details.runnerViaAssembler && details.asmCalls && details.stepOrder && details.rulesetOrder,
    draftStepsGated: details.runnerGatesDraft && details.builderGatesRoster && details.contractRosterOnly && details.asmShortCircuits,
    details,
  };
}

/**
 * 在 LogicEngine.prototype 上暫時裝探針，執行 fn()，回傳被呼叫的 configure*／enable* 方法名（依序）。
 * 一律還原，即使 fn 丟例外。
 */
export function recordConfigureCalls(LogicEngine, fn) {
  const calls = [], originals = [];
  for (const name of Object.getOwnPropertyNames(LogicEngine.prototype)) {
    if (!/^configure|^enable/.test(name) || typeof LogicEngine.prototype[name] !== "function") continue;
    const orig = LogicEngine.prototype[name];
    originals.push([name, orig]);
    LogicEngine.prototype[name] = function probed(...args) { calls.push(name); return orig.apply(this, args); };
  }
  let result, error = null;
  try { result = fn(); } catch (e) { error = e; } finally { for (const [name, orig] of originals) LogicEngine.prototype[name] = orig; }
  if (error) throw error;
  return { calls, result };
}
