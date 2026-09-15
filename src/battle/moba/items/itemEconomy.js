// ============================================================================
//  battle/moba/items/itemEconomy.js — 個人金錢帳本與購買交易（M1）
//
//  規則（docs/design/MOBA_裝備系統_v1.md §6；Owner Q2／Q5 已核准）：
//   · 帳本是整數 milli-gold：startMilli + Σ earned == unspentMilli + spentMilli，unspent ≥ 0。
//   · 購買只在 SHOP_WINDOWS（出生／復活／回城抵達）；死亡中、隔空都不能買。
//   · 錢不夠就拒絕；不存在「錢夠就送裝」「先給後扣」「負債購買」。
//   · starter 被自動丟棄時不退款（已花費金額不變）。
//
//  ⚠ M1 不調收入：INCOME_V1 的數字鏡像 LogicEngine 現行值（隊伍被動 14／秒 ÷ 5、小兵 20、
//    擊殺 300、塔 250、龍 200、巴龍 400、營地 60／90），只改「歸屬到個人」這件事。
//    助攻 150 與開局每人 500 是 Owner Q5 核准的歸屬規則。任何數值校準屬 M2／M3，
//    而且只能在 itemsV1 規則集內進行。
//  純函式：不讀時間、不用亂數、不改輸入。
// ============================================================================
import { ITEM_CATALOG, LAUNCH_BATCH, batchAllows, getItem } from "./itemCatalog.js";
import { purchaseCost } from "./itemRecipes.js";
import { applyPurchase } from "./itemInventory.js";

export const MILLI = 1000;

/** 購買只在這三個事件開窗（Owner 核准；走路進泉水不在其中）。 */
//  M2：Q3 核准「走路進泉水也開窗」（與回城抵達同效果）⇒ 第四個窗 fountain。
export const SHOP_WINDOWS = Object.freeze(["spawn", "respawn", "recallArrive", "fountain"]);

export const INCOME_SOURCES = Object.freeze([
  "passive", "minion", "kill", "assist", "tower", "dragon", "baron", "camp", "tithe",
]);

/** 收入常數（鏡像 legacy，M1 不調）。 */
export const INCOME_V1 = Object.freeze({
  startGold: 500,
  legacyTeamPassivePerSec: 14,
  passivePerSec: 14 / 5,      // 2.8／秒／人（隊伍總量不變）
  passiveStartSec: 25,        // SIM_RULES.v3.waveFirst
  minion: 20,
  kill: 300,
  assistPool: 150,
  tower: 250,
  dragon: 200,
  baron: 400,
  camp: 60,
  buffCamp: 90,
});

export function createLedger({ startGold = INCOME_V1.startGold } = {}) {
  const startMilli = Math.round(startGold * MILLI);
  return { startMilli, earnedMilli: {}, spentMilli: 0, unspentMilli: startMilli };
}

const assertMilli = (m) => {
  if (!Number.isInteger(m) || m < 0) throw new Error(`金額必須是非負整數 milli-gold：${m}`);
};

/** 入帳（回傳新帳本）。 */
export function earn(ledger, source, milli) {
  if (!INCOME_SOURCES.includes(source)) throw new Error(`未知收入來源：${source}`);
  assertMilli(milli);
  return {
    ...ledger,
    earnedMilli: { ...ledger.earnedMilli, [source]: (ledger.earnedMilli[source] ?? 0) + milli },
    unspentMilli: ledger.unspentMilli + milli,
  };
}

/** 支出（錢不夠 ⇒ ok:false，帳本不變）。 */
export function spend(ledger, milli) {
  assertMilli(milli);
  if (milli > ledger.unspentMilli) return { ok: false, ledger };
  return { ok: true, ledger: { ...ledger, unspentMilli: ledger.unspentMilli - milli, spentMilli: ledger.spentMilli + milli } };
}

export const totalEarnedMilli = (ledger) => Object.values(ledger.earnedMilli).reduce((s, v) => s + v, 0);

/** 守恆檢查：整數精確相等。 */
export function checkConservation(ledger) {
  const lhs = ledger.startMilli + totalEarnedMilli(ledger);
  const rhs = ledger.unspentMilli + ledger.spentMilli;
  return { ok: lhs === rhs && ledger.unspentMilli >= 0, lhs, rhs };
}

/**
 * 決定性均分：floor 平分，餘數依 recipients 給定順序（呼叫端傳席位順序）逐一 +1。
 * @returns {Array<[string, number]>}
 */
export function splitMilli(totalMilli, recipients) {
  assertMilli(totalMilli);
  if (!recipients.length) return [];
  const base = Math.floor(totalMilli / recipients.length);
  let rest = totalMilli - base * recipients.length;
  return recipients.map((id) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return [id, base + extra];
  });
}

/**
 * 一次購買交易（合法性 ＋ 金錢 ＋ 背包）。
 * @returns {{ ok, reason, ledger, inventory, events: object[] }}
 */
export function purchase({
  ledger, inventory, itemId, window, batch = LAUNCH_BATCH, seatRole = null,
  t = 0, playerId = null, catalog = ITEM_CATALOG,
}) {
  const reject = (reason) => ({ ok: false, reason, ledger, inventory, events: [] });
  if (!SHOP_WINDOWS.includes(window)) return reject("not_in_shop_window");
  const it = getItem(itemId, catalog);
  if (!it) return reject("unknown_item");
  if (!batchAllows(it.batch, batch)) return reject("batch_locked");
  if (it.seat && it.seat !== seatRole) return reject("seat_restricted");
  const { cost, consumedSlots } = purchaseCost(itemId, inventory.slots, catalog);
  const placed = applyPurchase(inventory, itemId, consumedSlots, catalog);
  if (!placed.ok) return reject(placed.reason);
  const paid = spend(ledger, cost * MILLI);
  if (!paid.ok) return reject("insufficient_gold");
  const events = [];
  if (placed.droppedStarter) {
    events.push({ t, playerId, action: "dropStarter", itemId: placed.droppedStarter, cost: 0, unspentAfter: paid.ledger.unspentMilli });
  }
  events.push({
    t, playerId, action: consumedSlots.length ? "combine" : "buy", itemId, cost,
    consumed: consumedSlots.map((i) => inventory.slots[i]), unspentAfter: paid.ledger.unspentMilli,
  });
  return { ok: true, reason: null, ledger: paid.ledger, inventory: placed.inventory, events };
}
