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
// ============================================================================
import { LogicEngine } from "../../LogicEngine.js";
import { toEnginePlayerMods } from "../../battle/moba/mobaPlayerStats.js";
import { toEngineTactic, mobaTacticById, MOBA_TACTIC_VERSION } from "../contracts/MobaTacticConfig.js";
import { SNAPSHOT_SEATS, SNAPSHOT_INPUTS, snapshotCovers } from "../contracts/squadSnapshot.js";
import { assertSeedFrozen, challengeReplayability } from "../contracts/challengeInstance.js";
import { MOBA_SIMULATION_VERSION } from "../contracts/simulationVersion.js";
//  Slice 5：Draft 成為戰鬥輸入。⚠ 三支都是**既有**的引擎轉換點，不是新寫的。
import { toEngineHeroMods } from "../../battle/moba/mobaHeroProfile.js";
import { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } from "../../data/heroCombatArchetypes.js";
import { buildLoadout as buildHeroLoadout, toEngineSpells } from "../../battle/moba/mobaHeroLoadout.js";
import { draftResultToRoster, validateDraftResult } from "./draftResult.js";

/** 模擬步長與上限。⚠ 與 `useLocalServer.js` 的 `DT_SIM` 對齊；改這裡等於改模擬語意。 */
export const CHALLENGE_DT = 0.5;
export const CHALLENGE_MAX_T = 1800;

/** 藍方席位 → 紅方席位（b3 → r3）。 */
export const toRedSeat = (seat) => `r${seat.slice(1)}`;

/**
 * 把一份快照攤成引擎要的 slots / loadout。
 * @param {object} snapshot
 * @param {"blue"|"red"} side
 */
function sideInputs(snapshot, side) {
  const slots = [];
  const loadout = {};
  for (const seat of SNAPSHOT_SEATS) {
    const engineSeat = side === "red" ? toRedSeat(seat) : seat;
    slots.push({ id: engineSeat, playerId: snapshot.seats.find((s) => s.seat === seat)?.playerId ?? null, stats: snapshot.combat.stats[seat] });
    loadout[engineSeat] = { ...snapshot.combat.loadout[seat] };
  }
  return { slots, loadout };
}

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
  currentSimulationVersion = MOBA_SIMULATION_VERSION,
  //  Slice 5：這一場凍結的 Draft，以及英雄查表。
  //  ⚠ 查表**注入**，本檔不 import 英雄庫（396KB data URI，Node verifier 會吃到）。
  draftResult = null, heroOf = null,
} = {}) {
  //  ── 可重播性：版本 ＋ 兩份快照雜湊都要對得上 ──────────────────────────
  const rep = challengeReplayability(challenge, {
    challengerSnapshot, defenderSnapshot, currentSimulationVersion,
  });
  if (!rep.ok) return { ok: false, result: null, errors: [{ code: "replay", message: rep.reason }] };

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

  const blue = sideInputs(challengerSnapshot, "blue");
  const red = sideInputs(defenderSnapshot, "red");

  //  ── 紅線②：只用宣告過的輸入 ───────────────────────────────────────────
  const useLoadout = snapshotCovers(challengerSnapshot, SNAPSHOT_INPUTS.heroLoadout)
    && snapshotCovers(defenderSnapshot, SNAPSHOT_INPUTS.heroLoadout);
  const useStats = snapshotCovers(challengerSnapshot, SNAPSHOT_INPUTS.playerStats)
    && snapshotCovers(defenderSnapshot, SNAPSHOT_INPUTS.playerStats);
  const useTactic = snapshotCovers(challengerSnapshot, SNAPSHOT_INPUTS.tactic)
    && snapshotCovers(defenderSnapshot, SNAPSHOT_INPUTS.tactic);

  const loadout = useLoadout ? { ...blue.loadout, ...red.loadout } : null;
  const eng = new LogicEngine(seed, loadout);

  if (useStats) {
    const mods = toEnginePlayerMods({ blue: blue.slots, red: red.slots });
    if (mods) eng.configurePlayers(mods);
  }

  if (useTactic) {
    const bt = mobaTacticById(challenge.challengerTacticId);
    const rt = mobaTacticById(challenge.defenderTacticId);
    if (!bt || !rt) {
      return {
        ok: false, result: null,
        errors: [{ code: "tactic", message: `查不到戰術（挑戰方 ${challenge.challengerTacticId} / 防守方 ${challenge.defenderTacticId}）` }],
      };
    }
    eng.configureMatch({
      blue: toEngineTactic(bt),
      red: toEngineTactic(rt),
      meta: {
        tacticId: bt.tacticId, tacticName: bt.name,
        version: MOBA_TACTIC_VERSION, opponentTacticId: rt.tacticId,
      },
    });
  }

  //  ── Slice 5：選角真的進引擎 ──────────────────────────────────────────
  //  ⚠ 三支都是**既有**的轉換點（`useLocalServer.start()` 用的同一組），
  //    不是為 Challenge 另寫的第二套。差別只在資料來源：
  //    正式生涯走 Ban/Pick 畫面，這裡走**凍結的 DraftResult**。
  let draftUsed = null;
  if (draftDeclared) {
    const roster = draftResultToRoster(draftResult);
    //  英雄物件（含 arch）與召喚師技能都由既有函式算出，不自己拼資料。
    const withHero = Object.fromEntries(Object.entries(roster)
      .map(([seat, v]) => [seat, { ...v, hero: heroOf(v.heroId) ?? null }]));
    const spellRoster = buildHeroLoadout(withHero, heroOf);

    const heroMods = toEngineHeroMods(withHero, heroOf);
    if (heroMods) eng.configureHeroes(heroMods);

    const archMods = toEngineArchetypes(withHero);
    if (archMods && Object.keys(archMods).length) {
      const b = {}, r = {};
      for (const [pid, mod] of Object.entries(archMods)) (String(pid)[0] === "r" ? r : b)[pid] = mod;
      eng.configureArchetypes({ blue: b, red: r,
        meta: { version: COMBAT_ARCHETYPE_CONTRACT_VERSION, seats: Object.keys(archMods).length } });
    }

    const spellMods = toEngineSpells(spellRoster);
    if (spellMods) eng.configureSpells(spellMods);

    draftUsed = { hash: draftResult.hash, heroes: { ...draftResult.assignment } };
  }

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
