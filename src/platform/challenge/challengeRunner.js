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

  //  ⚠ Slice 1 **刻意不呼叫** configureHeroes / configureArchetypes /
  //    configureSpells：快照沒有凍結英雄選角，用了就無法重播。
  //    等 Slice 2 把選角納入快照並 bump `capturedInputs` 之後才會啟用。

  for (let t = CHALLENGE_DT; t <= CHALLENGE_MAX_T && !eng.over; t += CHALLENGE_DT) eng.tick(CHALLENGE_DT);

  return {
    ok: true, errors: [],
    result: {
      schema: "ChallengeResult.v1",
      challengeId: challenge.challengeId,
      simulationVersion: challenge.simulationVersion,
      matchSeed: seed,
      //  ⚠ `outcome` 以**挑戰方**視角記錄，不用引擎的 blue/red——
      //    日後若允許挑戰方站紅方，blue/red 的意義會反過來，而這個欄位不會。
      outcome: eng.winner === "blue" ? "challengerWin" : eng.winner === "red" ? "defenderWin" : "unresolved",
      finished: !!eng.over,
      durationSec: Math.round(eng.t),
      score: { challenger: eng.bK, defender: eng.rK },
      usedInputs: [
        ...(useStats ? [SNAPSHOT_INPUTS.playerStats] : []),
        ...(useLoadout ? [SNAPSHOT_INPUTS.heroLoadout] : []),
        ...(useTactic ? [SNAPSHOT_INPUTS.tactic] : []),
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
