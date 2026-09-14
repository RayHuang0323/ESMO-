// ============================================================================
//  battle/moba/items/offlinePurchaseSim.js — 離線購買時間線（M1）
//
//  用途：在**不碰 LogicEngine** 的前提下，把目錄、合成、帳本、背包、出裝 AI 串成一整場的
//  購買時間線，給 M1 verifier 驗證守恆、合法性與決定性。
//
//  ⚠ 情境收入是**合成資料**：用 legacy 收入常數排出的固定腳本，不是真實對局，
//    也不是平衡依據。M1 不做平衡。
//  純函式：不讀時間、不用亂數、不改輸入。
// ============================================================================
import { ITEM_CATALOG, LAUNCH_BATCH } from "./itemCatalog.js";
import { emptyInventory, inventoryIds, validateInventory } from "./itemInventory.js";
import { INCOME_V1, MILLI, checkConservation, createLedger, earn, purchase, splitMilli } from "./itemEconomy.js";
import { nextStep } from "./buildPolicy.js";
import { computeCombatStats } from "./combatStatsV1.js";

export const OFFLINE_SIM_VERSION = "moba-items.offline-sim.v1";
const EVENT_ORDER = Object.freeze({ income: 0, state: 1, window: 2 });
const MAX_STEPS_PER_WINDOW = 16;

const seatKey = (id) => [id[0] === "b" ? 0 : 1, Number(id.slice(1))];
const bySeat = (a, b) => { const [sa, na] = seatKey(a); const [sb, nb] = seatKey(b); return sa - sb || na - nb; };

/**
 * @param scenario {
 *   batch, players: [{ id, side, arch, seatRole, strategy, healer }],
 *   incomes: [{ t, playerId, source, milli }],
 *   windows: [{ t, playerId, kind }],
 *   states:  [{ t, playerId, deathsRecent, kd, teamGoldDiff }],
 * }
 * @returns {{ version, events, players, violations }}
 */
export function simulatePurchaseTimeline(scenario, { catalog = ITEM_CATALOG } = {}) {
  const batch = scenario.batch ?? LAUNCH_BATCH;
  const players = [...scenario.players].sort((a, b) => bySeat(a.id, b.id));
  const book = Object.fromEntries(players.map((p) => [p.id, {
    ledger: createLedger(), inventory: emptyInventory(), lock: null,
    history: { starterPurchased: false }, state: { deathsRecent: 0, kd: 0, teamGoldDiff: 0 },
    purchases: [],
  }]));
  const timeline = [
    ...scenario.incomes.map((e, i) => ({ ...e, type: "income", i })),
    ...(scenario.states ?? []).map((e, i) => ({ ...e, type: "state", i })),
    ...scenario.windows.map((e, i) => ({ ...e, type: "window", i })),
  ].sort((a, b) => a.t - b.t || EVENT_ORDER[a.type] - EVENT_ORDER[b.type] || bySeat(a.playerId, b.playerId) || a.i - b.i);

  const events = [];
  const violations = [];
  let seq = 0;
  for (const ev of timeline) {
    const pb = book[ev.playerId];
    if (!pb) { violations.push(`未知席位 ${ev.playerId}`); continue; }
    if (ev.type === "income") {
      pb.ledger = earn(pb.ledger, ev.source, ev.milli);
    } else if (ev.type === "state") {
      pb.state = { deathsRecent: ev.deathsRecent ?? 0, kd: ev.kd ?? 0, teamGoldDiff: ev.teamGoldDiff ?? 0 };
    } else {
      const me = players.find((p) => p.id === ev.playerId);
      const enemies = players.filter((p) => p.side !== me.side)
        .map((p) => ({ arch: p.arch, healer: !!p.healer, items: inventoryIds(book[p.id].inventory) }));
      for (let step = 0; step < MAX_STEPS_PER_WINDOW; step++) {
        const decision = nextStep({
          arch: me.arch, seatRole: me.seatRole, strategy: me.strategy, enemies,
          inventory: pb.inventory, unspentMilli: pb.ledger.unspentMilli, lock: pb.lock,
          history: pb.history, state: pb.state, t: ev.t, batch, catalog,
        });
        pb.lock = decision.lock;
        if (decision.action !== "buy") break;
        const res = purchase({
          ledger: pb.ledger, inventory: pb.inventory, itemId: decision.itemId, window: ev.kind,
          batch, seatRole: me.seatRole, t: ev.t, playerId: me.id, catalog,
        });
        if (!res.ok) { violations.push(`${me.id}@${ev.t}: AI 決策 ${decision.itemId} 被帳本拒絕（${res.reason}）`); break; }
        pb.ledger = res.ledger;
        pb.inventory = res.inventory;
        if (decision.itemId.startsWith("st_")) pb.history = { ...pb.history, starterPurchased: true };
        for (const e of res.events) {
          const row = { seq: seq++, window: ev.kind, targetId: decision.targetId, ...e };
          events.push(row);
          pb.purchases.push(row);
        }
      }
    }
    const cons = checkConservation(pb.ledger);
    if (!cons.ok) violations.push(`${ev.playerId}@${ev.t}: 守恆失敗 ${cons.lhs} != ${cons.rhs}`);
    const inv = validateInventory(pb.inventory, catalog);
    if (!inv.ok) violations.push(`${ev.playerId}@${ev.t}: 背包不合法 ${inv.errors.join("；")}`);
  }

  return {
    version: OFFLINE_SIM_VERSION,
    batch,
    events,
    violations,
    players: Object.fromEntries(players.map((p) => {
      const pb = book[p.id];
      return [p.id, {
        arch: p.arch, seatRole: p.seatRole, strategy: p.strategy,
        inventory: pb.inventory.slots.slice(),
        ledger: pb.ledger,
        purchases: pb.purchases.length,
        stats: computeCombatStats(pb.inventory.slots, { catalog, batch }),
      }];
    })),
  };
}

const SEATS = Object.freeze(["top", "jungle", "mid", "adc", "sup"]);

/**
 * 產生一場固定的合成情境（legacy 收入常數；非平衡資料）。
 * @param comps  { blue: [arch×5], red: [arch×5] }（依 top/jungle/mid/adc/sup）
 * @param strategies { [playerId]: strategy }（未指定 ⇒ standard）
 * @param healers    { [playerId]: boolean }
 */
export function buildStandardScenario({ comps, strategies = {}, healers = {}, durationSec = 1800, batch = LAUNCH_BATCH }) {
  const players = [];
  for (const side of ["blue", "red"]) {
    comps[side].forEach((arch, i) => {
      const id = `${side[0]}${i + 1}`;
      players.push({ id, side, arch, seatRole: SEATS[i], strategy: strategies[id] ?? "standard", healer: !!healers[id] });
    });
  }
  const ids = players.map((p) => p.id);
  const team = (side) => players.filter((p) => p.side === side).map((p) => p.id);
  const incomes = [];
  const add = (t, playerId, source, gold) => incomes.push({ t, playerId, source, milli: Math.round(gold * MILLI) });

  //  被動：每 10 秒入帳一次（2.8／秒）
  for (let t = INCOME_V1.passiveStartSec + 10; t <= durationSec; t += 10) for (const id of ids) add(t, id, "passive", INCOME_V1.passivePerSec * 10);
  //  小兵：每 30 秒一波；線上席位吃 4 隻，輔助與線上共享時各拿 2 隻，打野不吃線
  for (let t = 85; t <= durationSec; t += 30) {
    for (const p of players) {
      const n = p.seatRole === "jungle" ? 0 : p.seatRole === "sup" ? 2 : (p.seatRole === "adc" ? 2 : 4);
      if (n) add(t, p.id, "minion", n * INCOME_V1.minion);
    }
  }
  //  營地：打野每 60 秒兩座小營地
  for (let t = 60; t <= durationSec; t += 60) for (const p of players) if (p.seatRole === "jungle") add(t, p.id, "camp", 2 * INCOME_V1.camp);
  //  擊殺：每 150 秒由固定輪替的席位擊殺，另兩名隊友分助攻池
  let rot = 0;
  for (let t = 180; t <= durationSec; t += 150) {
    for (const side of ["blue", "red"]) {
      const mates = team(side);
      const killer = mates[rot % 5];
      add(t, killer, "kill", INCOME_V1.kill);
      const assists = [mates[(rot + 1) % 5], mates[(rot + 2) % 5]].sort(bySeat);
      for (const [id, milli] of splitMilli(INCOME_V1.assistPool * MILLI, assists)) incomes.push({ t, playerId: id, source: "assist", milli });
    }
    rot++;
  }
  //  塔：每 360 秒雙方各一座，由該路席位（輪替 top/mid/adc）與輔助均分
  const laneSeats = [0, 2, 3];
  let laneRot = 0;
  for (let t = 420; t <= durationSec; t += 360) {
    for (const side of ["blue", "red"]) {
      const mates = team(side);
      const recipients = [mates[laneSeats[laneRot % 3]], mates[4]].sort(bySeat);
      for (const [id, milli] of splitMilli(INCOME_V1.tower * MILLI, recipients)) incomes.push({ t, playerId: id, source: "tower", milli });
    }
    laneRot++;
  }
  //  龍：300 秒起每 300 秒，雙方輪流拿，存活成員均分
  let dragonSide = 0;
  for (let t = 300; t <= durationSec; t += 300) {
    const side = dragonSide++ % 2 === 0 ? "blue" : "red";
    for (const [id, milli] of splitMilli(INCOME_V1.dragon * MILLI, team(side))) incomes.push({ t, playerId: id, source: "dragon", milli });
  }

  //  開窗：出生；回城每 240 秒（依席位錯開）；每名英雄在固定時間死亡並於 30 秒後復活
  const windows = [];
  const states = [];
  players.forEach((p, idx) => {
    windows.push({ t: 0, playerId: p.id, kind: "spawn" });
    for (let t = 300 + idx * 7; t <= durationSec; t += 240) windows.push({ t, playerId: p.id, kind: "recallArrive" });
    const deaths = [];
    for (let t = 420 + idx * 53; t <= durationSec; t += 390) {
      deaths.push(t);
      const recent = deaths.filter((d) => t - d <= 180).length;
      states.push({ t: t + 30, playerId: p.id, deathsRecent: recent, kd: Math.round((deaths.length % 4) * 10) / 10, teamGoldDiff: (idx % 2 === 0 ? -1 : 1) * 1500 * (deaths.length % 3) });
      windows.push({ t: t + 30, playerId: p.id, kind: "respawn" });
    }
  });

  return { batch, players, incomes, windows, states };
}
