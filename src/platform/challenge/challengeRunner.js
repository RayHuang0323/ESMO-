// ============================================================================
//  platform/challenge/challengeRunner.js — 由兩份快照重建並跑一場 Challenge
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  Challenge **不存回放、不存結果畫面**，只存輸入
//  （`ChallengeInstance.v1` ＋ 兩份 `SquadSnapshot.v1`）。
//  要看的時候重算。所以「怎麼從輸入組回引擎」必須**只有一個地方**——
//  第一次跑與日後重播若各組一次，兩者遲早會分歧，
//  而分歧的症狀會是「重播對不上」，看起來像快照漏欄位。
//
//  ⇒ 本檔是那個唯一的組裝點。第一次跑與重播**呼叫的是同一支函式**。
//
//  ── 三條紅線 ─────────────────────────────────────────────────────────────
//  ① **seed 只讀不生。** `matchSeed` 由 `ChallengeInstance` 凍結，
//     本檔絕不呼叫任何亂數。`assertSeedFrozen` 在組裝前先擋一次。
//  ② **只使用快照宣告過的輸入。** `capturedInputs` 沒宣告的（Slice 1：
//     英雄選角 / 戰鬥原型 / 召喚師技能）**一律不呼叫對應的 configure**。
//     偷偷用一個沒被凍結的輸入 ⇒ 重播必然對不上。
//  ③ **完全不碰生涯。** 本檔不 import profileStore、不 import
//     `applyMatchProgress`、不寫任何 Store。它是純計算。
//
//  ── 為什麼防守方要做 b→r 的席位對映 ──────────────────────────────────────
//  快照一律以藍方語彙（b1–b5）記錄，因為它描述的是「這支隊伍」，
//  不是「這支隊伍在某一場站哪一邊」。站哪邊是**這一場**的事，
//  所以對映發生在這裡，不在快照裡。
//  ⇒ 同一份防守快照可以在不同場次站不同邊，雜湊不變。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
//
//  ── Phase 3a Task 5：組裝改走唯一組裝器 ───────────────────────────────────
//  本檔不再自己 new LogicEngine、不再自己呼叫任何 configure*。引擎只有一個組裝點：
//  `battle/moba/matchAssembler.js` 的 assembleMatch，規則集 `challenge.v20`
//  （順序 Players → Match → Heroes → Archetypes → Spells；沒有技能／被動／曲線／天賦／裝備／版面層）。
//  這裡只剩：護欄 → 決定快照宣告了哪些輸入 → buildChallengeMatchSetup（challengeMatchSetup.js）
//  → assembleMatch → tick 迴圈 → 建結果。結果與 v20 逐位元相同（tools/check_challenge_setup_3a.mjs）。
// ============================================================================
import { mobaTacticById } from "../contracts/MobaTacticConfig.js";
import { SNAPSHOT_INPUTS, snapshotCovers } from "../contracts/squadSnapshot.js";
import { assertSeedFrozen, challengeReplayability } from "../contracts/challengeInstance.js";
//  T16：目前版本＝本 build 在正式旗標下的 Challenge 版本；每一場的規則集由它記下的版本凍結（challengeRulesetForVersion）。
import { CHALLENGE_SIMULATION_VERSION } from "./challengeVersion.js";
import { challengeRulesetForVersion } from "../contracts/matchRuleset.js";
import { validateDraftResult } from "./draftResult.js";
//  Phase 3a Task 5：唯一組裝器與它的 deps（查表是注入的 heroOf，所以用 core 的 builder；見 matchAssemblerDepsCore.js 檔頭）。
import { assembleMatch } from "../../battle/moba/matchAssembler.js";
import { buildMatchAssemblerDepsFrom } from "../../battle/moba/matchAssemblerDepsCore.js";
import { buildChallengeMatchSetup, CHALLENGE_HERO_LOOKUP_LABEL, toRedSeat } from "./challengeMatchSetup.js";

/** 模擬步長與上限。⚠ 與 `useLocalServer.js` 的 `DT_SIM` 對齊；改這裡等於改模擬語意。 */
export const CHALLENGE_DT = 0.5;
export const CHALLENGE_MAX_T = 1800;

/** 藍方席位 → 紅方席位（b3 → r3）。定義在 challengeMatchSetup.js（builder 需要它），這裡原樣轉出。 */
export { toRedSeat };

/** 組裝階段的錯誤 → runChallenge 的錯誤項（`{ code, message }`）。stage 是 "setup"（MatchSetup）或 "assemble"（組裝器）。 */
const stageErrors = (stage, errors) => errors.map((e) => ({ code: `${stage}_${e.code}`, message: `${e.field}: ${e.message}` }));

/**
 * 跑一場 Challenge。**第一次跑與重播都走這一支。**
 *
 * @param {object} p
 * @param {object} p.challenge            ChallengeInstance.v1（提供凍結的 matchSeed）
 * @param {object} p.challengerSnapshot   SquadSnapshot.v1（藍方）
 * @param {object} p.defenderSnapshot     SquadSnapshot.v1（紅方）
 * @param {string} [p.currentSimulationVersion]
 * @returns {{ ok:boolean, result:object|null, errors:Array }}
 */
export function runChallenge({
  challenge = null, challengerSnapshot = null, defenderSnapshot = null,
  currentSimulationVersion = CHALLENGE_SIMULATION_VERSION,
  //  Slice 5：這一場凍結的 Draft，以及英雄查表。
  //  ⚠ 查表**注入**，本檔不 import 英雄庫（396KB data URI，Node verifier 會吃到）。
  draftResult = null, heroOf = null,
} = {}) {
  //  ── 可重播性：版本 ＋ 兩份快照雜湊都要對得上 ──────────────────────────
  const rep = challengeReplayability(challenge, {
    challengerSnapshot, defenderSnapshot, currentSimulationVersion,
  });
  if (!rep.ok) return { ok: false, result: null, errors: [{ code: "replay", message: rep.reason }] };

  //  ── T16：規則集由這一場記下的模擬版本決定（第一次跑與重播相同；旗標日後改動不影響）──
  const ruleset = challengeRulesetForVersion(challenge.simulationVersion);
  if (!ruleset) return { ok: false, result: null, errors: [{ code: "replay", message: `這場使用 ${challenge.simulationVersion} 的模擬語意，沒有對應的挑戰規則集，不可重播` }] };

  //  ── 紅線①：seed 只讀不生 ──────────────────────────────────────────────
  const seed = challenge.matchSeed;
  const frozen = assertSeedFrozen(challenge, seed);
  if (!frozen.ok) return { ok: false, result: null, errors: [{ code: "seed", message: frozen.message }] };

  //  ── Slice 5：Draft 成為戰鬥輸入 ────────────────────────────────────────
  //  ⚠ 只要**任一方**的快照宣告了 `draftPolicy` 是戰鬥輸入，這一場就**必須**
  //    拿得到凍結的 `DraftResult` 與英雄查表，否則拒跑。宣告了卻沒接上，
  //    會跑出一場「宣告用了選角、實際沒用」的比賽——那種比賽重播不出來，
  //    而且沒有人會發現。
  const draftDeclared = snapshotCovers(challengerSnapshot, SNAPSHOT_INPUTS.draftPolicy)
    || snapshotCovers(defenderSnapshot, SNAPSHOT_INPUTS.draftPolicy);
  if (draftDeclared) {
    if (!draftResult) {
      return {
        ok: false, result: null,
        errors: [{ code: "draft_missing", message: "快照宣告 draftPolicy 是戰鬥輸入，但這一場沒有凍結的 DraftResult" }],
      };
    }
    const dv = validateDraftResult(draftResult);
    if (!dv.ok) return { ok: false, result: null, errors: dv.errors.map((e) => ({ ...e, code: `draft_${e.code}` })) };
    //  ⚠ DraftResult 必須綁在**這兩份快照**上，不得把別場的結果套進來。
    if (draftResult.challengerSnapshotHash !== challengerSnapshot.hash
      || draftResult.defenderSnapshotHash !== defenderSnapshot.hash) {
      return {
        ok: false, result: null,
        errors: [{ code: "draft_snapshot_mismatch", message: "DraftResult 綁的快照與這一場的不符" }],
      };
    }
    if (typeof heroOf !== "function") {
      return {
        ok: false, result: null,
        errors: [{ code: "draft_no_lookup", message: "選角要進引擎需要英雄查表（heroOf），呼叫端未注入" }],
      };
    }
  }

  //  ── 紅線②：只用宣告過的輸入 ───────────────────────────────────────────
  //  ⚠ 這三個判斷與 draftDeclared 原樣保留在這裡（Phase 3a Task 5 只換「怎麼組」，不換「組哪些」）。
  const useLoadout = snapshotCovers(challengerSnapshot, SNAPSHOT_INPUTS.heroLoadout)
    && snapshotCovers(defenderSnapshot, SNAPSHOT_INPUTS.heroLoadout);
  const useStats = snapshotCovers(challengerSnapshot, SNAPSHOT_INPUTS.playerStats)
    && snapshotCovers(defenderSnapshot, SNAPSHOT_INPUTS.playerStats);
  const useTactic = snapshotCovers(challengerSnapshot, SNAPSHOT_INPUTS.tactic)
    && snapshotCovers(defenderSnapshot, SNAPSHOT_INPUTS.tactic);

  let tactics = null;
  if (useTactic) {
    const bt = mobaTacticById(challenge.challengerTacticId);
    const rt = mobaTacticById(challenge.defenderTacticId);
    if (!bt || !rt) {
      return {
        ok: false, result: null,
        errors: [{ code: "tactic", message: `查不到戰術（挑戰方 ${challenge.challengerTacticId} / 防守方 ${challenge.defenderTacticId}）` }],
      };
    }
    tactics = { blue: bt, red: rt };
  }

  //  ── 組裝：快照 → MatchSetup（challenge.v20）→ 唯一組裝器 ────────────────
  //  Slice 5 的「選角真的進引擎」也在這條路上：draftDeclared 時 setup 帶 roster，
  //  組裝器照規則集的順序呼叫 Heroes → Archetypes → Spells（三支都是既有的轉換點，不是為 Challenge 另寫）。
  //  ⚠ 被拒絕的 setup／組裝（或 builder／adapter 丟出的例外）一律回錯誤結果，不外洩例外。
  let assembled;
  try {
    const built = buildChallengeMatchSetup({
      rulesetId: ruleset.rulesetId,
      seed, opponentKey: challenge.opponentKey ?? null,
      challengerSnapshot, defenderSnapshot,
      use: { loadout: useLoadout, stats: useStats, tactic: useTactic },
      tactics, draftResult: draftDeclared ? draftResult : null, heroOf,
    });
    if (!built.ok) return { ok: false, result: null, errors: stageErrors("setup", built.errors) };
    const deps = buildMatchAssemblerDepsFrom({ heroLookup: heroOf, heroLookupLabel: CHALLENGE_HERO_LOOKUP_LABEL });
    assembled = assembleMatch(built.setup, deps);
  } catch (e) {
    return { ok: false, result: null, errors: [{ code: "assembly_exception", message: String(e?.message ?? e) }] };
  }
  if (!assembled.ok) return { ok: false, result: null, errors: stageErrors("assemble", assembled.errors) };
  const eng = assembled.engine;

  //  ⚠ 這一場實際用了哪一份 Draft（雜湊 ＋ 席位英雄），讓重播可逐值比對。
  const draftUsed = draftDeclared ? { hash: draftResult.hash, heroes: { ...draftResult.assignment } } : null;

  for (let t = CHALLENGE_DT; t <= CHALLENGE_MAX_T && !eng.over; t += CHALLENGE_DT) eng.tick(CHALLENGE_DT);

  //  ── Slice 3：戰術執行證據（賽後「宣告 vs 實際」的唯一資料來源）──────────
  //  ⚠ 這是**引擎自己的真實計數**（`snapshot().tacticExec`，Sprint24 起就有），
  //    不是事後推論，也不是「AI 教練結論」。賽後畫面只被允許把這些數字
  //    與戰術自己宣告的 `evidence.goal` 並排，讓玩家自己判斷。
  //  ⚠ 只讀一次 snapshot：它會複製整份狀態，放進迴圈會很慢。
  //  ⚠ 這**不改變模擬語意**（只是多讀一次既有輸出），但它改了本檔的程式碼，
  //    所以 `SIMULATION_SEMANTICS_FINGERPRINTS` 仍必須重新登記（同版本）。
  const exec = eng.snapshot()?.tacticExec ?? null;

  return {
    ok: true, errors: [],
    result: {
      schema: "ChallengeResult.v1",
      challengeId: challenge.challengeId,
      simulationVersion: challenge.simulationVersion,
      matchSeed: seed,
      //  ⚠ 以**挑戰方／防守方**記錄，不用引擎的 blue/red（同下面 `outcome` 的理由）。
      tacticExec: exec ? { challenger: { ...exec.blue }, defender: { ...exec.red } } : null,
      //  ⚠ `outcome` 以**挑戰方**視角記錄，不用引擎的 blue/red——
      //    日後若允許挑戰方站紅方，blue/red 的意義會反過來，而這個欄位不會。
      outcome: eng.winner === "blue" ? "challengerWin" : eng.winner === "red" ? "defenderWin" : "unresolved",
      finished: !!eng.over,
      durationSec: Math.round(eng.t),
      score: { challenger: eng.bK, defender: eng.rK },
      //  ⚠ 這一場實際用了哪一份 Draft（雜湊 ＋ 席位英雄），讓重播可逐值比對。
      draft: draftUsed,
      usedInputs: [
        ...(useStats ? [SNAPSHOT_INPUTS.playerStats] : []),
        ...(useLoadout ? [SNAPSHOT_INPUTS.heroLoadout] : []),
        ...(useTactic ? [SNAPSHOT_INPUTS.tactic] : []),
        ...(draftDeclared ? [SNAPSHOT_INPUTS.draftPolicy] : []),
      ],
    },
  };
}

/**
 * 兩次結果是否逐值相同。重播驗證用。
 *
 * ⚠ 比對整個 result（含 `usedInputs`）而不是只比勝負：
 *   只比勝負的話，一個「少注入了一組能力」的錯誤有一半機率驗得過。
 */
export const sameChallengeResult = (a, b) => JSON.stringify(a) === JSON.stringify(b);
