// ============================================================================
//  battle/moba/items/itemReplay.js — 裝備的 Replay 紀錄與還原（Item System M3e）
//
//  MobaReplay.v1 附加 optional 欄位（版本不變；舊 Replay 沒有 ⇒ decode 回 null ⇒ 不顯示裝備）：
//    itemMeta  = { version, catalogVersion, itemIds[], strategyByPlayer[n], baseline: { t, seq, slots[n][6] }, gaps }
//    purchases = [[seq, t, seatIdx, actionCode, itemIdx, cost, unspentAfter], …]（seq 遞增）
//  · seatIdx＝playersMeta／frame.p 的順序；itemIdx＝itemMeta.itemIds 的索引（-1＝空格）。
//  · baseline＝擷取第一格 frame 當下的 6 格背包與 lastSeq。戰鬥中重新整理後恢復時，引擎先安靜重跑到保存時間，
//    之前的購買事件已不在環形緩衝裡 ⇒ 以 baseline 起算，只收 seq > baseline.seq 的事件。
//  · 還原（foldPurchasesAt）只套用實際購買事件，**不重跑 AI**；格位沿用引擎購買的同一規則
//    （itemRecipes.purchaseCost ＋ itemInventory.applyPurchase）⇒ 6 格順序與現場 snapshot 相同。
//  · 出裝策略＝引擎 snapshot 的 strategy 原值（不重算 previewStrategy）。
//  純函式：不讀時間、亂數、瀏覽器或 store。
// ============================================================================
import { ITEM_CATALOG, ITEM_CATALOG_VERSION, getItem } from "./itemCatalog.js";
import { purchaseCost } from "./itemRecipes.js";
import { INVENTORY_SLOTS, applyPurchase } from "./itemInventory.js";
import { BUILD_STRATEGY_META } from "./itemsUiSelectors.js";

export const ITEMS_REPLAY_VERSION = "moba-items.replay.v1";
export const REPLAY_PURCHASE_ACTIONS = Object.freeze(["buy", "combine", "dropStarter"]);

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
const emptyRow = () => Array(INVENTORY_SLOTS).fill(null);

/** 擷取端：第一格 frame 的 snapshot → baseline（沒有 items ⇒ null）。 */
export function itemsBaselineFromSnapshot(snap) {
  const items = snap?.items;
  if (!items?.players) return null;
  return {
    t: round2(snap.ts ?? 0),
    seq: Number.isInteger(items.lastSeq) ? items.lastSeq : -1,
    catalogVersion: items.catalogVersion ?? null,
    inventories: Object.fromEntries(Object.entries(items.players).map(([id, p]) => [id, (p.inventory ?? emptyRow()).slice()])),
    strategies: Object.fromEntries(Object.entries(items.players).map(([id, p]) => [id, p.strategy ?? null])),
  };
}

/**
 * 擷取端：baseline ＋ 收集到的事件 → { itemMeta, purchases }（replayBuffer.finalize 附加到 replay）。
 * @param events   以 seq 去重後的原始購買事件（只含 seq > baseline.seq）
 * @param playerIds playersMeta 的 id 順序
 */
export function encodeItemsReplay({ baseline, events, playerIds }) {
  const seatOf = new Map(playerIds.map((id, i) => [id, i]));
  const sorted = [...events]
    .filter((e) => e.seq > baseline.seq && seatOf.has(e.playerId) && REPLAY_PURCHASE_ACTIONS.includes(e.action) && getItem(e.itemId))
    .sort((a, b) => a.seq - b.seq);
  const ids = new Set();
  for (const id of playerIds) for (const x of baseline.inventories[id] ?? []) if (x) ids.add(x);
  for (const e of sorted) ids.add(e.itemId);
  const itemIds = [...ids].sort();
  const indexOf = new Map(itemIds.map((id, i) => [id, i]));
  //  seq 跳號＝擷取期間有事件沒收到（理論上不會：每個 snapshot 最多 40 筆環形緩衝、購買窗之間遠少於此）
  let gaps = 0, expect = baseline.seq + 1;
  for (const e of sorted) { if (e.seq > expect) gaps += e.seq - expect; expect = e.seq + 1; }
  return {
    itemMeta: {
      version: ITEMS_REPLAY_VERSION,
      catalogVersion: baseline.catalogVersion,
      itemIds,
      strategyByPlayer: playerIds.map((id) => baseline.strategies[id] ?? null),
      baseline: {
        t: baseline.t,
        seq: baseline.seq,
        slots: playerIds.map((id) => (baseline.inventories[id] ?? emptyRow()).map((x) => (x ? indexOf.get(x) : -1))),
      },
      gaps,
    },
    purchases: sorted.map((e) => [
      e.seq, round1(e.t), seatOf.get(e.playerId), REPLAY_PURCHASE_ACTIONS.indexOf(e.action),
      indexOf.get(e.itemId), Math.round(e.cost ?? 0), Math.round(e.unspentAfter ?? 0),
    ]),
  };
}

/** 播放端：replay → 解碼後的裝備紀錄；舊 Replay／格式不符 ⇒ null。 */
export function decodeItemsReplay(replay) {
  const m = replay?.itemMeta;
  const rows = replay?.purchases;
  const playersMeta = replay?.playersMeta;
  if (!m || m.version !== ITEMS_REPLAY_VERSION || !Array.isArray(rows) || !Array.isArray(m.itemIds) || !Array.isArray(playersMeta)) return null;
  if (!Array.isArray(m.baseline?.slots) || m.baseline.slots.length !== playersMeta.length) return null;
  const idOf = (i) => (Number.isInteger(i) && i >= 0 ? m.itemIds[i] ?? null : null);
  const seats = playersMeta.map((p) => ({ id: p.id, side: p.side, heroId: p.heroId ?? null, heroName: p.heroName ?? null, playerName: p.playerName ?? null }));
  return {
    version: m.version,
    catalogVersion: m.catalogVersion ?? null,
    catalogMatches: (m.catalogVersion ?? null) === ITEM_CATALOG_VERSION,
    seats,
    strategyByPlayer: Object.fromEntries(seats.map((s, i) => [s.id, m.strategyByPlayer?.[i] ?? null])),
    baseline: {
      t: m.baseline.t,
      seq: m.baseline.seq,
      slots: Object.fromEntries(seats.map((s, i) => [s.id, m.baseline.slots[i].map(idOf)])),
    },
    events: rows
      .map((r) => ({ seq: r[0], t: r[1], playerId: seats[r[2]]?.id ?? null, action: REPLAY_PURCHASE_ACTIONS[r[3]] ?? null, itemId: idOf(r[4]), cost: r[5], unspentAfter: r[6] }))
      .filter((e) => e.playerId && e.action && e.itemId),
    gaps: Number.isFinite(m.gaps) ? m.gaps : 0,
  };
}

/**
 * 還原時間 t 的 6 格背包（每位英雄）。事件依 seq（＝時間）遞增，t 之後的不套用。
 * dropStarter 不另外處理：緊接的購買由 applyPurchase 依同一規則丟棄起始裝。
 * @returns {{ slots: { [seat]: (string|null)[] }, applied, rejected }} 或 null
 */
export function foldPurchasesDetailed(items, t, catalog = ITEM_CATALOG) {
  if (!items) return null;
  const inv = Object.fromEntries(Object.entries(items.baseline.slots).map(([id, s]) => [id, { slots: s.slice() }]));
  let applied = 0, rejected = 0;
  for (const e of items.events) {
    if (e.t > t) break;
    if (e.action === "dropStarter") continue;
    const cur = inv[e.playerId];
    if (!cur) { rejected++; continue; }
    const cost = purchaseCost(e.itemId, cur.slots, catalog);
    const placed = cost ? applyPurchase(cur, e.itemId, cost.consumedSlots, catalog) : { ok: false };
    if (placed.ok) { inv[e.playerId] = placed.inventory; applied++; } else rejected++;
  }
  return { slots: Object.fromEntries(Object.entries(inv).map(([id, v]) => [id, v.slots])), applied, rejected };
}

/** foldPurchasesAt(items, t) ⇒ { [seat]: 6 格 itemId|null }（舊 Replay ⇒ null）。 */
export function foldPurchasesAt(items, t, catalog = ITEM_CATALOG) {
  return foldPurchasesDetailed(items, t, catalog)?.slots ?? null;
}

/** 購買標記的分類：T3 完成裝／升級鞋最顯眼，其餘（組件、基礎鞋、起始裝）是一般標記。 */
export function purchaseMarkerKind(itemId, catalog = ITEM_CATALOG) {
  const it = getItem(itemId, catalog);
  if (it?.tier === "T3") return "major";
  if (it?.tier === "BOOTS" && itemId !== "bt_base") return "boots";
  return "component";
}

/**
 * 時間軸購買標記。
 * @param seat  只看某位英雄（null ⇒ 全部英雄）
 * @param kinds 只要哪些種類（null ⇒ 全部）
 */
export function selectReplayPurchaseMarkers(items, { seat = null, kinds = null, from = -Infinity, to = Infinity } = {}, catalog = ITEM_CATALOG) {
  if (!items) return [];
  const sideOf = Object.fromEntries(items.seats.map((s) => [s.id, s.side]));
  return items.events
    .filter((e) => e.action !== "dropStarter" && (!seat || e.playerId === seat) && e.t >= from && e.t <= to)
    .map((e) => ({
      seq: e.seq, t: e.t, seat: e.playerId, side: sideOf[e.playerId] ?? null, itemId: e.itemId,
      name: getItem(e.itemId, catalog)?.name ?? e.itemId, kind: purchaseMarkerKind(e.itemId, catalog), action: e.action,
    }))
    .filter((mk) => !kinds || kinds.includes(mk.kind));
}

/** 某位英雄在時間 t 的裝備卡（InventoryBar 的 slots 形狀）＋本場策略。 */
export function selectReplayHeroItemsAt(items, t, seat, catalog = ITEM_CATALOG) {
  if (!items || !items.baseline.slots[seat]) return null;
  const slots = foldPurchasesAt(items, t, catalog)[seat];
  const strategy = items.strategyByPlayer[seat] ?? null;
  return {
    seat, t,
    slots: slots.map((itemId, index) => ({ index, itemId })),
    completedCount: slots.filter((id) => getItem(id, catalog)?.tier === "T3").length,
    strategy,
    strategyLabel: strategy ? BUILD_STRATEGY_META[strategy]?.label ?? strategy : null,
  };
}

/** 本場兩隊出裝策略（讀保存的引擎原值；同隊不一致時標「混合」）。 */
export function selectReplayStrategies(items) {
  if (!items) return null;
  const sideSummary = (side) => {
    const values = [...new Set(items.seats.filter((s) => s.side === side).map((s) => items.strategyByPlayer[s.id]).filter(Boolean))];
    if (!values.length) return null;
    if (values.length > 1) return { id: "mixed", label: "混合" };
    return { id: values[0], label: BUILD_STRATEGY_META[values[0]]?.label ?? values[0] };
  };
  return { blue: sideSummary("blue"), red: sideSummary("red") };
}
