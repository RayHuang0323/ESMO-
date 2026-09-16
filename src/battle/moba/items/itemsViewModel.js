// ============================================================================
//  battle/moba/items/itemsViewModel.js — M3 Item UI 的唯一資料出口（純函式，M2 先備好）
//
//  輸入：LogicEngine.snapshot().items（MobaItemsSnapshot.v1）；輸出：UI 可以直接畫的形狀。
//  契約：docs/architecture/MOBA_裝備UI資料契約_v1.md。
//  ⚠ UI 不得自己重算金錢、合成差價、出裝決策——一律讀這裡。
//  純函式：不改輸入、不讀時間、不用亂數。
// ============================================================================
import { ITEM_CATALOG, ITEM_FAMILIES, getItem } from "./itemCatalog.js";

export const ITEMS_VIEW_VERSION = "moba-items.view.v1";

export const STRATEGY_LABELS = Object.freeze({
  standard: "標準", early: "前期壓制", scaling: "後期成型", counter: "反制優先", survival: "保命優先",
});

export const WINDOW_LABELS = Object.freeze({ spawn: "出生", respawn: "復活", recallArrive: "回城" });
export const ACTION_LABELS = Object.freeze({ buy: "購買", combine: "合成", dropStarter: "丟棄起始裝" });

const itemCard = (id, catalog) => {
  const it = getItem(id, catalog);
  if (!it) return null;
  return { itemId: id, name: it.name, tier: it.tier, family: it.family, familyLabel: it.family ? ITEM_FAMILIES[it.family] : null, price: it.price };
};

/** 決策理由 → 中文（未知格式原樣保留，不猜）。 */
export function reasonText(reason) {
  const [key, ...rest] = String(reason).split(":");
  const value = rest.join(":");
  switch (key) {
    case "arch": return `定位：${value}`;
    case "strategy": return `策略：${STRATEGY_LABELS[value] ?? value}`;
    case "adShare": return `敵方物理占比 ${Math.round(Number(value) * 100)}%`;
    case "enemyHeal": return `敵方治療 ${value.replace(">=", " 人，門檻 ")}`;
    case "enemyBurst": return `敵方爆發 ${value.replace(">=", " 人，門檻 ")}`;
    case "enemyTanks": return `敵方坦克 ${value.replace(">=", " 人，門檻 ").replace("→", " ⇒ ")}`;
    case "counter": return "反制優先：情境裝提前到第 2 件";
    //  M4d：明確偵測到威脅而把情境裝提前（hard ⇒ 第 2 件、normal ⇒ 第 3 件）。
    case "counterPromote": {
      const [id, slot] = value.split("→");
      return `反制成立：${getItem(id)?.name ?? id} 提前到第 ${String(slot).replace("core", "")} 件`;
    }
    case "survival": return "保命優先：保命裝提前到第 2 件";
    case "scaling": return "後期成型：奢侈裝提前到第 1 件";
    case "lock": return `繼續合成：${getItem(value)?.name ?? value}`;
    case "insufficient": return `存錢中：${getItem(value)?.name ?? value}`;
    case "complete": return "出裝已完成";
    case "deathsRecent": return `近期陣亡 ${value.split("→")[0]} 次 ⇒ 優先保命裝`;
    case "behindGold": return "經濟落後 ⇒ 先補最便宜的核心裝";
    case "lateKd": return `後期表現佳（KD ${value.split("→")[0]}）⇒ 優先奢侈裝`;
    case "skip": return `略過 ${getItem(value.split(":")[0])?.name ?? value}`;
    case "rejected": return `購買被拒：${value}`;
    default: return String(reason);
  }
}

/** 合成樹：標記哪些組件已持有（以格位消耗，與 itemRecipes.purchaseCost 同一規則）。 */
export function recipeTree(itemId, slots, catalog = ITEM_CATALOG) {
  const used = new Set();
  const take = (id) => {
    for (let i = 0; i < slots.length; i++) if (!used.has(i) && slots[i] === id) { used.add(i); return true; }
    return false;
  };
  const node = (id) => {
    const card = itemCard(id, catalog);
    if (!card) return null;
    const owned = take(id);
    const components = owned ? [] : getItem(id, catalog).components.map(node).filter(Boolean);
    return { ...card, owned, components };
  };
  const root = itemCard(itemId, catalog);
  if (!root) return null;
  return { ...root, owned: false, components: getItem(itemId, catalog).components.map(node).filter(Boolean) };
}

/**
 * 單一英雄的裝備畫面資料。
 * @returns null ⇒ 這場沒有啟用裝備（UI 應整塊不顯示，不得造假）
 */
export function selectPlayerItemsView(snapshot, playerId, { catalog = ITEM_CATALOG, purchaseLimit = 8 } = {}) {
  const items = snapshot?.items;
  const p = items?.players?.[playerId];
  if (!p) return null;
  const slots = p.inventory.map((id, index) => (id ? { index, ...itemCard(id, catalog) } : { index, itemId: null }));
  const owned = new Set(p.inventory.filter(Boolean));
  const target = p.plan?.targetId ?? null;
  return {
    version: ITEMS_VIEW_VERSION,
    playerId,
    side: p.side,
    arch: p.arch,
    strategy: p.strategy,
    strategyLabel: STRATEGY_LABELS[p.strategy] ?? p.strategy,
    gold: { ...p.gold },
    slots,
    currentItems: slots.filter((s) => s.itemId),
    nextItem: target ? {
      ...itemCard(target, catalog),
      remainingCost: p.plan.targetRemainingCost,
      affordable: p.plan.targetRemainingCost !== null && p.plan.targetRemainingCost <= p.gold.unspent,
      recipe: recipeTree(target, p.inventory, catalog),
    } : null,
    buildPath: (p.plan?.buildPath ?? []).map((id) => ({ ...itemCard(id, catalog), owned: owned.has(id), isNext: id === target })),
    buildComplete: !!p.plan?.complete,
    decision: { reasons: p.reasons.slice(), text: p.reasons.map(reasonText), lastWindow: p.lastWindow ? { ...p.lastWindow, label: WINDOW_LABELS[p.lastWindow.kind] ?? p.lastWindow.kind } : null },
    purchases: selectPurchaseFeed(snapshot, { playerId, limit: purchaseLimit, catalog }),
    stats: { ...p.stats, effects: p.stats.effects.slice() },
    status: { ...p.status, aura: { ...p.status.aura } },
  };
}

/** 購買事件流（新到舊）。 */
export function selectPurchaseFeed(snapshot, { playerId = null, limit = 20, catalog = ITEM_CATALOG } = {}) {
  const list = snapshot?.items?.purchases ?? [];
  return list.filter((e) => !playerId || e.playerId === playerId)
    .slice(-limit).reverse()
    .map((e) => ({
      ...e,
      name: getItem(e.itemId, catalog)?.name ?? e.itemId,
      actionLabel: ACTION_LABELS[e.action] ?? e.action,
      windowLabel: WINDOW_LABELS[e.window] ?? e.window,
      consumedNames: (e.consumed ?? []).map((id) => getItem(id, catalog)?.name ?? id),
    }));
}

/** 全隊摘要（記分板／賽後用）。 */
export function selectTeamItemsSummary(snapshot, side, { catalog = ITEM_CATALOG } = {}) {
  const players = snapshot?.items?.players;
  if (!players) return null;
  return Object.entries(players).filter(([, p]) => p.side === side).map(([id, p]) => ({
    playerId: id, arch: p.arch, gold: { ...p.gold },
    completed: p.inventory.filter((x) => getItem(x, catalog)?.tier === "T3").length,
    items: p.inventory.map((x) => (x ? itemCard(x, catalog) : null)),
  }));
}
