// ============================================================================
//  battle/moba/items/itemsUiSelectors.js — M3 Item UI 的呈現用純函式（M3a）
//
//  與 itemsViewModel 的分工：
//   · itemsViewModel      ＝ snapshot.items 的完整資料出口（金錢、背包、計畫、理由、事件）
//   · itemsUiSelectors    ＝ 畫面需要的「視覺語彙」與精簡形狀（圖紋、格子狀態、HUD 精簡列、
//                           教練筆記挑句、戰術卡的靜態描述與預覽）
//  ⚠ UI 元件只讀這兩支，不 import 規則模組、不自己算金錢／屬性／決策
//    （tools/check_moba_items_m3.mjs G3 掃描）。
//  純函式：不改輸入、不讀時間、不用亂數。
// ============================================================================
import { ITEM_CATALOG, LAUNCH_BATCH, getItem } from "./itemCatalog.js";
import { BUILD_STRATEGIES, buildTargets } from "./buildPolicy.js";
import { ACTION_LABELS, STRATEGY_LABELS } from "./itemsViewModel.js";

export const ITEMS_UI_SELECTORS_VERSION = "moba-items.ui-selectors.v1";

/** 格子狀態語彙（外框材質由它決定）。 */
export const SLOT_STATES = Object.freeze(["empty", "starter", "component", "boots", "completed"]);

/** T1／T2 組件以「主屬性」決定圖紋；可辨識的屬性集合。 */
const STAT_GLYPHS = Object.freeze([
  "ad", "ap", "attackSpeed", "critChance", "armor", "mr", "hp",
  "abilityHaste", "lifesteal", "healShieldPower", "regenPctPerSec", "moveSpeed",
]);

/** 圖紋語彙：T3 依流派、鞋、起始裝、組件依主屬性。 */
export const GLYPH_KEYS = Object.freeze([
  ..."ABCDEFGH".split("").map((f) => `family:${f}`),
  "boots", "starter",
  ...STAT_GLYPHS.map((k) => `stat:${k}`),
]);

const stateOfTier = (tier) => (tier === "T3" ? "completed" : tier === "BOOTS" ? "boots" : tier === "STARTER" ? "starter" : "component");

/**
 * 單件裝備的視覺描述（圖示與格子的唯一輸入）。
 * 組件圖紋＝該物品自己的屬性列中第一個可辨識的屬性（守護聖徽 → 治療強度，而不是生命）。
 */
export function itemVisual(itemId, catalog = ITEM_CATALOG) {
  const it = itemId ? getItem(itemId, catalog) : null;
  if (!it) return null;
  let glyph;
  if (it.tier === "T3") glyph = `family:${it.family}`;
  else if (it.tier === "BOOTS") glyph = "boots";
  else if (it.tier === "STARTER") glyph = "starter";
  else glyph = `stat:${Object.keys(it.stats).find((k) => STAT_GLYPHS.includes(k)) ?? "ad"}`;
  return { itemId, name: it.name, tier: it.tier, family: it.family, price: it.price, state: stateOfTier(it.tier), glyph };
}

/**
 * HUD／十人列的精簡資料。
 * @returns null ⇒ 本場沒有裝備系統（UI 整塊不顯示）
 */
export function selectHudItems(snapshot, { catalog = ITEM_CATALOG } = {}) {
  const players = snapshot?.items?.players;
  if (!players) return null;
  const out = {};
  for (const [id, p] of Object.entries(players)) {
    const slots = p.inventory.map((itemId, index) => ({
      index, itemId: itemId ?? null, state: itemId ? itemVisual(itemId, catalog).state : "empty",
    }));
    const nextItemId = p.plan?.targetId ?? null;
    const cost = nextItemId ? p.plan.targetRemainingCost : null;
    out[id] = {
      side: p.side,
      unspent: p.gold.unspent,
      completedCount: slots.filter((s) => s.state === "completed").length,
      slots,
      nextItemId,
      nextRemainingCost: cost,
      //  還差多少才買得起（0 ⇒ 下次開窗就能買）；UI 直接顯示，不自己相減。
      nextShortfall: nextItemId ? Math.max(0, (cost ?? 0) - p.gold.unspent) : null,
      nextProgress: nextItemId ? (cost > 0 ? Math.round(Math.min(1, p.gold.unspent / cost) * 100) / 100 : 1) : null,
    };
  }
  return out;
}

/**
 * 戰鬥 HUD 的購買回饋（M3b）：只挑「完成 T3」與「鞋子升級」，且 seq 大於 afterSeq。
 * 一般組件、基礎鞋、起始裝與「丟棄起始裝」都不跳通知（戰鬥中太吵）。
 * @param afterSeq 已經看過的最後一筆 seq（HUD 掛載當下用 snapshot.items.lastSeq，開局的出生購買不會補跳）
 * @returns null ⇒ 本場沒有裝備系統；否則依 seq 由舊到新
 */
export function selectPurchaseToasts(snapshot, { afterSeq = -1, catalog = ITEM_CATALOG } = {}) {
  const list = snapshot?.items?.purchases;
  if (!list) return null;
  return list
    .filter((e) => e.seq > afterSeq && e.action !== "dropStarter")
    .filter((e) => {
      const v = itemVisual(e.itemId, catalog);
      return !!v && (v.state === "completed" || (v.state === "boots" && e.itemId !== "bt_base"));
    })
    .map((e) => ({ ...e, consumed: (e.consumed ?? []).slice(), actionLabel: ACTION_LABELS[e.action] ?? e.action }));
}

/** 裝備效果 type → 玩家看得懂的名稱與一句說明（M3c）。未知 type 原樣顯示，不猜。 */
export const EFFECT_LABELS = Object.freeze({
  ON_HIT: Object.freeze({ label: "攻擊附加傷害", hint: "普攻額外造成傷害" }),
  GRIEVOUS_WOUNDS: Object.freeze({ label: "重傷", hint: "讓對手的回復降低" }),
  LOW_HP_SHIELD: Object.freeze({ label: "低血護盾", hint: "生命過低時自動獲得護盾" }),
  EXECUTE: Object.freeze({ label: "斬殺", hint: "對殘血目標傷害提高" }),
  ANTI_CRIT: Object.freeze({ label: "減免暴擊", hint: "受到的暴擊傷害降低" }),
  AURA: Object.freeze({ label: "團隊光環", hint: "身旁友軍獲得加成" }),
  SLOW_ON_HIT: Object.freeze({ label: "緩速", hint: "技能命中時緩速對手" }),
  ROLE_CAMP_DAMAGE: Object.freeze({ label: "打野加成", hint: "對野怪傷害提高" }),
  ROLE_INCOME_TITHE: Object.freeze({ label: "輔助收入", hint: "額外收入並分給隊友" }),
  BURN: Object.freeze({ label: "燃燒", hint: "持續造成魔法傷害" }),
  RAMPING_STAT: Object.freeze({ label: "越打越強", hint: "持續戰鬥時屬性疊加" }),
  RAMPING_RESIST: Object.freeze({ label: "越打越硬", hint: "持續戰鬥時抗性疊加" }),
  SUSTAIN_REGEN: Object.freeze({ label: "持續回復", hint: "脫戰回復提高" }),
});

/**
 * 英雄詳情的「裝備特效＋目前狀態」（M3c）。
 * @param view selectPlayerItemsView 的輸出
 * @returns null ⇒ 沒有裝備系統；status.tone：bad＝對自己不利、good＝有利
 */
export function selectActiveEffects(view) {
  if (!view?.stats) return null;
  const effects = [...new Set(view.stats.effects ?? [])]
    .map((type) => ({ type, ...(EFFECT_LABELS[type] ?? { label: type, hint: "" }) }));
  const s = view.status ?? {};
  const aura = s.aura ?? {};
  const status = [];
  if (s.grievous > 0) status.push({ kind: "grievous", label: "被重傷", value: `${Math.ceil(s.grievous)} 秒`, tone: "bad" });
  if (s.slow > 0) status.push({ kind: "slow", label: "被緩速", value: `${Math.ceil(s.slow)} 秒`, tone: "bad" });
  if (s.magicShield > 0) status.push({ kind: "magicShield", label: "法傷護盾", value: String(s.magicShield), tone: "good" });
  if (aura.armor > 0 || aura.mr > 0) status.push({ kind: "auraResist", label: "光環抗性", value: `+${aura.armor} 甲／+${aura.mr} 魔抗`, tone: "good" });
  if (aura.moveSpeed > 0) status.push({ kind: "auraSpeed", label: "光環移速", value: `+${Math.round(aura.moveSpeed * 100)}%`, tone: "good" });
  return { effects, status };
}

const COACH_KIND_ORDER = Object.freeze({ economy: 0, threat: 1, adjust: 2, info: 3 });

/**
 * 教練戰術分析（M3c）：AI 決策理由碼 → 「原因 → 行動」。
 * 數字只來自理由碼本身與 hud.nextShortfall（selectHudItems），不另外計算。
 * 行動文字對照 buildPolicy 的情境裝：前排＝穿甲／破甲、回復型＝重傷、爆發型＝魔抗保命。
 * @returns [{ code, kind, cause, action, text }]，依 經濟→敵情→調整→局勢 排序
 */
export function coachAnalysis(view, hud = null) {
  const reasons = view?.decision?.reasons;
  if (!reasons) return [];
  const valueOf = (code) => String(code).slice(String(code).indexOf(":") + 1);
  const countOf = (code) => Number(valueOf(code).split(">=")[0]);
  const nameOf = (id) => itemVisual(id)?.name ?? id;
  const saving = new Set(reasons.filter((c) => String(c).startsWith("insufficient:")).map(valueOf));
  const rows = [];
  const push = (code, kind, cause, action = null) => rows.push({ code, kind, cause, action, text: action ? `${cause} → ${action}` : cause });
  for (const raw of reasons) {
    const code = String(raw);
    switch (code.match(/^[a-zA-Z]+/)?.[0] ?? "") {
      case "insufficient": {
        const id = valueOf(code);
        const short = hud && hud.nextItemId === id ? hud.nextShortfall : null;
        push(code, "economy", short > 0 ? `還差 ${short.toLocaleString("en-US")} Gold` : "存錢中", nameOf(id));
        break;
      }
      case "lock":
        if (!saving.has(valueOf(code))) push(code, "economy", "繼續合成", nameOf(valueOf(code)));
        break;
      case "complete": push(code, "economy", "六件出裝已完成"); break;
      case "enemyTanks": {
        const n = countOf(code);
        push(code, "threat", n === 2 ? "敵方雙前排" : `敵方 ${n} 名前排`, "優先穿甲");
        break;
      }
      case "enemyHeal": push(code, "threat", `敵方 ${countOf(code)} 名回復型`, "補重傷"); break;
      case "enemyBurst": push(code, "threat", `敵方 ${countOf(code)} 名爆發型`, "補魔抗保命"); break;
      case "counter": push(code, "adjust", "反制策略", "情境裝提前到第 2 件"); break;
      case "survival": push(code, "adjust", "保命策略", "保命裝提前到第 2 件"); break;
      case "scaling": push(code, "adjust", "後期策略", "奢侈核心提前到第 1 件"); break;
      case "deathsRecent": push(code, "adjust", `近期陣亡 ${valueOf(code).split("→")[0]} 次`, "保命裝提前"); break;
      case "behindGold": push(code, "adjust", "經濟落後", "先補最便宜的核心"); break;
      case "lateKd": push(code, "adjust", `表現領先（KD ${valueOf(code).split("→")[0]}）`, "衝奢侈裝"); break;
      case "adShare": {
        const x = Number(valueOf(code));
        if (x >= 0.62) push(code, "info", `敵方物理傷害 ${Math.round(x * 100)}%`);
        else if (x <= 0.45) push(code, "info", `敵方魔法傷害 ${Math.round((1 - x) * 100)}%`);
        break;
      }
      default: break;   // arch／strategy／skip／rejected 等背景或除錯句不列
    }
  }
  return rows.map((r, i) => ({ r, i }))
    .sort((a, b) => COACH_KIND_ORDER[a.r.kind] - COACH_KIND_ORDER[b.r.kind] || a.i - b.i)
    .map(({ r }) => r);
}

/** 教練筆記挑句的優先序：先說「現在在做什麼」，再說「為什麼改路線」，最後才是陣容判斷。 */
const NOTE_RANK = Object.freeze({
  insufficient: 0, lock: 0, complete: 0,
  deathsRecent: 1, behindGold: 1, lateKd: 1,
  counter: 2, survival: 2, scaling: 2,
  enemyHeal: 3, enemyBurst: 3, enemyTanks: 3,
  rejected: 4,
});

/**
 * AI 決策理由 → 教練筆記（最多 max 句）。
 * 背景句（定位、策略、物理占比）與略過紀錄不列；什麼都沒有時才退回策略那句。
 * @param view selectPlayerItemsView 的輸出
 */
export function coachNotes(view, max = 2) {
  const reasons = view?.decision?.reasons ?? [];
  const texts = view?.decision?.text ?? [];
  const rows = reasons.map((code, i) => ({ code, text: texts[i], key: String(code).match(/^[a-zA-Z]+/)?.[0] ?? "" }));
  //  同一個目標同時有「繼續合成 X」與「存錢中 X」⇒ 只留存錢那句（同一件事不講兩次）。
  const saving = new Set(rows.filter((r) => r.key === "insufficient").map((r) => String(r.code).slice("insufficient:".length)));
  const seen = new Set();
  const picked = rows
    .filter((r) => !(r.key === "lock" && saving.has(String(r.code).slice("lock:".length))))
    .filter((r) => r.key in NOTE_RANK && !seen.has(r.text) && seen.add(r.text))
    .map((r, i) => ({ ...r, order: i }))
    .sort((a, b) => NOTE_RANK[a.key] - NOTE_RANK[b.key] || a.order - b.order)
    .slice(0, max)
    .map(({ code, text }) => ({ code, text }));
  if (picked.length) return picked;
  return rows.filter((r) => r.key === "strategy").slice(0, 1).map(({ code, text }) => ({ code, text }));
}

/**
 * 出裝策略戰術卡的靜態描述。
 * pitch 與 traits 是 buildPolicy 行為的白話說明（逐條對應，改規則時要一起改）：
 *   standard：定位核心順序，第一件核心後補升級鞋
 *   early   ：目標序列最前面插入定位的前期組件
 *   scaling ：射手／法師把奢侈核心移到第一件；升級鞋延到第二件核心之後
 *   counter ：情境裝門檻從 2 名降為 1 名，並把第一件情境裝提前到核心第 2 件
 *   survival：保命裝提前到核心第 2 件
 */
export const BUILD_STRATEGY_META = Object.freeze(Object.fromEntries([
  ["standard", "照定位核心順序出裝，第一件核心後補升級鞋", { early: 3, late: 3, survive: 3, counter: 2 }],
  ["early", "先做前期組件，前十分鐘就打得動", { early: 5, late: 2, survive: 2, counter: 2 }],
  ["scaling", "射手、法師先衝奢侈核心，鞋子延後", { early: 1, late: 5, survive: 2, counter: 2 }],
  ["counter", "敵方有一名治療、爆發或坦克就出反制裝", { early: 2, late: 3, survive: 3, counter: 5 }],
  ["survival", "保命裝提前到第二件，先求不被秒", { early: 2, late: 2, survive: 5, counter: 3 }],
].map(([id, pitch, traits]) => [id, Object.freeze({ id, label: STRATEGY_LABELS[id], pitch, traits: Object.freeze(traits), emblem: id })])));

if (Object.keys(BUILD_STRATEGY_META).join() !== BUILD_STRATEGIES.join()) {
  throw new Error("itemsUiSelectors：BUILD_STRATEGY_META 與 BUILD_STRATEGIES 不一致");
}

/**
 * 戰術卡預覽：這套策略對某定位會怎麼出（直接呼叫 buildTargets，不另寫規則）。
 * @returns {{ strategy, arch, early: string|null, boots: string|null, core: string[] }}
 */
export function previewStrategy({ arch, seatRole, strategy = "standard", enemies = [], batch = LAUNCH_BATCH, catalog = ITEM_CATALOG }) {
  const t = buildTargets({ arch, seatRole, strategy, enemies, batch, catalog });
  return {
    strategy,
    arch,
    early: t.earlyComponent,
    boots: t.targets.find((id) => getItem(id, catalog).tier === "BOOTS" && id !== "bt_base") ?? null,
    core: t.targets.filter((id) => getItem(id, catalog).tier === "T3").slice(0, 3),
  };
}
