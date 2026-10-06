// P0-C TDD invariant: a lane/structure intent must not be overwritten by a
// formation anchor when there is no local combat target.
//
// History: this started as an observational fixed-seed guard that failed on the
// pre-fix engine at seed 129 / t=1800, where one side had a 6-2 structure lead
// but a targetless LANE player was anchored to a nearby cross-lane enemy instead
// of preserving the lane push target. The invariant is side-agnostic.
//
// 2026-10-06（moba-sim.v18 Map Topology Final，Owner 決策「不要只挑一顆剛好會過的 seed」）：
// 單一 seed＋單一時間點的 fixture 會隨任何地圖／尋路改動重洗軌跡而漂移（v18 上 seed 129 在 1800 秒
// 已經沒有帶 ≥4 塔差的進行中對局）——那是 fixture drift，不是 invariant 失敗，但「重新挑一顆會過的 seed」
// 沒有說服力。改為決定性的多 seed 掃描：
//   · 固定 seed 清單（含原本的 129 與 base-assault 的 80），每場跑到結束或 3600 秒；
//   · 從 600 秒起每 30 秒一個檢查點；凡是「對局進行中且塔差 ≥4」的檢查點都檢查 invariant；
//   · 前置條件要有檢定力：符合條件的檢查點 ≥ MIN_STATES、且分布在 ≥ MIN_SEEDS 場 ⇒ 否則判 fixture drift（紅）；
//   · 任何一個檢查點出現 offender ⇒ 紅。
// Base-assault guard（原 seed 80）同樣套到每一場的終局。

import * as LE from "../src/LogicEngine.js";
import * as heroes from "../src/data/heroDatabase.js";
import * as profile from "../src/battle/moba/mobaHeroProfile.js";
import * as arche from "../src/data/heroCombatArchetypes.js";
import * as loadout from "../src/battle/moba/mobaHeroLoadout.js";
import * as tactic from "../src/platform/contracts/MobaTacticConfig.js";
import * as adapter from "../src/battle/moba/items/itemsEngineAdapter.js";
import * as catalog from "../src/battle/moba/items/itemCatalog.js";
import * as economy from "../src/battle/moba/items/itemEconomy.js";
import * as inventory from "../src/battle/moba/items/itemInventory.js";
import * as gameData from "../src/gameData.js";
import { configure } from "./balance/moba_items_balance_runner.mjs";

const M = { LE, heroes, profile, arche, loadout, tactic, adapter, catalog, economy, inventory, gameData };
const SEEDS = [80, ...Array.from({ length: 40 }, (_, i) => 120 + i)];   // 80 + 120..159（含原 fixture 129）
const CAP_S = 3600;
const FIRST_CHECK_S = 600;
const CHECK_EVERY_S = 30;
const MIN_LEAD = 4;
const MIN_STATES = 20;
const MIN_SEEDS = 8;

const towersDown = (e, side) => Object.values(e.towers)
  .filter((tower) => tower.side === side && tower.lane !== "nexus" && tower.hp <= 0).length;

const laneOffenders = (e) => e.players
  .filter((p) => {
    const foe = e.players.find((q) => q.id === p._archFoe);
    return !p.dead && p.fsm === "LANE" && p.decisionAction === "LANE"
      && !p.decisionTargetId && p._archFoe && foe?.lane !== p.lane;
  })
  .map((p) => {
    const foe = e.players.find((q) => q.id === p._archFoe);
    return {
      id: p.id,
      foe: foe?.id ?? null,
      lane: p.lane,
      foeLane: foe?.lane ?? null,
      distance: foe ? Math.hypot(p.pos.x - foe.pos.x, p.pos.y - foe.pos.y) : null,
      front: e.frontStructure(p.side, p.lane)?.lane ?? null,
    };
  });

const states = [];        // 每個符合前置條件的檢查點
const offenders = [];     // { seed, t, ...offender }
const baseAssault = [];   // 每場終局
for (const seed of SEEDS) {
  const { e } = configure(seed, "off", M, 1);
  const initialNexusHp = { blue: e.towers.blue_nexus.hp, red: e.towers.red_nexus.hp };
  let nextCheck = FIRST_CHECK_S;
  while (e.t < CAP_S && !e.over) {
    e.tick(0.5);
    if (e.over || e.t < nextCheck) continue;
    nextCheck += CHECK_EVERY_S;
    const lead = towersDown(e, "blue") - towersDown(e, "red");
    if (Math.abs(lead) < MIN_LEAD) continue;
    const off = laneOffenders(e);
    states.push({ seed, t: e.t, lead, offenders: off.length });
    for (const o of off) offenders.push({ seed, t: e.t, ...o });
  }
  const blueDown = towersDown(e, "blue"), redDown = towersDown(e, "red");
  const allNonNexusDown = blueDown >= 11 && redDown >= 11;
  const nexusProgress = e.towers.blue_nexus.hp < initialNexusHp.blue || e.towers.red_nexus.hp < initialNexusHp.red;
  baseAssault.push({ seed, t: e.t, over: e.over, allNonNexusDown, nexusProgress,
    stalled: allNonNexusDown && !e.over && !nexusProgress });
}

const seedsWithStates = new Set(states.map((s) => s.seed));
const stalled = baseAssault.filter((b) => b.stalled);
const summary = {
  seeds: SEEDS.length,
  pushStates: states.length,
  pushSeeds: seedsWithStates.size,
  maxLead: Math.max(0, ...states.map((s) => Math.abs(s.lead))),
  offenders: offenders.length,
  offenderSample: offenders.slice(0, 5),
  baseAssault: {
    gamesOver: baseAssault.filter((b) => b.over).length,
    reachedAllNonNexusDown: baseAssault.filter((b) => b.allNonNexusDown).length,
    stalled: stalled.map((b) => b.seed),
  },
};
console.log(JSON.stringify(summary, null, 2));

const errors = [];
if (states.length < MIN_STATES || seedsWithStates.size < MIN_SEEDS) {
  errors.push(`fixture drift: only ${states.length} push states across ${seedsWithStates.size} seeds (need >= ${MIN_STATES} across >= ${MIN_SEEDS})`);
}
if (offenders.length) {
  errors.push(`P0-C invariant failed: ${offenders.length} targetless LANE player state(s) are formation-anchored during a structure push`);
}
if (stalled.length) {
  errors.push(`P0-C base-assault invariant failed: seeds ${stalled.map((b) => b.seed).join(",")} keep both waves unable to progress to either nexus`);
}
if (errors.length) {
  for (const m of errors) console.error(m);
  process.exit(1);
}
console.log(`P0-C invariant: PASS (${states.length} push states / ${seedsWithStates.size} seeds, 0 offenders; base-assault ${SEEDS.length} games, 0 stalled)`);
