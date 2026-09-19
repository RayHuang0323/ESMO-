// P0-C TDD invariant: a lane/structure intent must not be overwritten by a
// formation anchor when there is no local combat target.
//
// This is an observational fixed-seed guard. It intentionally fails on the
// pre-fix engine at seed 129 / t=1800, where one side has a 6-2 structure
// lead but a targetless LANE player is anchored to a nearby cross-lane enemy
// instead of preserving the lane push target. The post-fix trajectory may end
// earlier or put the lead on the mirrored side, so the invariant is side-agnostic.

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
const SEED = 129;
const AT_S = 1800;
const BASE_ASSAULT_SEED = 80;
const BASE_ASSAULT_CAP_S = 3600;

const towersDown = (e, side) => Object.values(e.towers)
  .filter((tower) => tower.side === side && tower.lane !== "nexus" && tower.hp <= 0).length;

const run = () => {
  const { e } = configure(SEED, "off", M, 1);
  while (e.t < AT_S && !e.over) e.tick(0.5);
  const blueDown = towersDown(e, "blue");
  const redDown = towersDown(e, "red");
  // `towersDown(side)` counts towers owned by `side` that have fallen.
  const structureLead = blueDown - redDown;
  const structureAdvantage = Math.abs(structureLead);
  const offenders = e.players
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
        pos: p.pos,
        front: e.frontStructure(p.side, p.lane)?.lane ?? null,
      };
    });
  const result = { seed: SEED, t: e.t, blueDown, redDown, structureLead, structureAdvantage, offenders };
  console.log(JSON.stringify(result, null, 2));
  if (structureAdvantage < 4) throw new Error("fixture drift: seed 129 no longer has the required structure lead");
  if (offenders.length) {
    throw new Error(`P0-C invariant failed: ${offenders.length} targetless LANE player(s) are formation-anchored during a structure push`);
  }
};

// P0-C base-assault guard. Before H13, seed 80 reaches a state where every
// non-nexus structure is down on both sides, but the symmetric minion waves
// remain locked at mid-lane and neither nexus receives objective progress.
// This is structural: it does not require a particular winner or duration.
const runBaseAssault = () => {
  const { e } = configure(BASE_ASSAULT_SEED, "off", M, 1);
  const initialNexusHp = {
    blue: e.towers.blue_nexus.hp,
    red: e.towers.red_nexus.hp,
  };
  while (e.t < BASE_ASSAULT_CAP_S && !e.over) e.tick(0.5);
  const blueDown = towersDown(e, "blue");
  const redDown = towersDown(e, "red");
  const allNonNexusDown = blueDown >= 11 && redDown >= 11;
  const nexusProgress = e.towers.blue_nexus.hp < initialNexusHp.blue
    || e.towers.red_nexus.hp < initialNexusHp.red;
  const result = {
    seed: BASE_ASSAULT_SEED,
    t: e.t,
    over: e.over,
    blueDown,
    redDown,
    allNonNexusDown,
    blueNexusHp: e.towers.blue_nexus.hp,
    redNexusHp: e.towers.red_nexus.hp,
    nexusProgress,
  };
  console.log(JSON.stringify(result, null, 2));
  if (allNonNexusDown && !e.over && !nexusProgress) {
    throw new Error("P0-C base-assault invariant failed: both waves remain unable to progress to either nexus");
  }
};

try {
  run();
  runBaseAssault();
  console.log("P0-C invariant: PASS");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
