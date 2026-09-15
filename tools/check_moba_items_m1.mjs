#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_items_m1.mjs — MOBA Item System v1 M1 Pure Foundation 驗證
//
//    node tools/check_moba_items_m1.mjs
//
//  只驗純資料與純函式；不啟動引擎、不開瀏覽器、不跑對局。
//  13 道 gate（Owner M1 指令的編號）：
//   G1 88 件目錄數量與版本合法（含與矩陣文件逐件一致、不沿用 legacy 名稱）
//   G2 v1.0 只能使用首發 68 件
//   G3 合成樹無循環、價格守恆
//   G4 金錢守恆
//   G5 6 格背包合法
//   G6 靴子／starter 限制
//   G7 金錢不足不可購買
//   G8 AI 六定位 × 五策略決定性
//   G9 同輸入同輸出（凍結輸入、不改輸入）
//   G10 AI 不會買 v1.1-only 物品
//   G11 CombatStatsV1 是純函式（含效果 primitive 計算）
//   G12 離線購買時間線決定性
//   G13 隔離：未改 LogicEngine／Battle runtime／HUD／Replay runtime，未新增亂數
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ITEM_CATALOG, ITEM_CATALOG_VERSION, ITEM_IDS, ITEM_BATCHES, ITEM_TIERS, ITEM_FAMILIES, STAT_KEYS, LAUNCH_BATCH,
  batchAllows, itemsForBatch, getItem,
} from "../src/battle/moba/items/itemCatalog.js";
import { validateRecipeGraph, flattenedCost, purchaseCost, recipeFee } from "../src/battle/moba/items/itemRecipes.js";
import { emptyInventory, applyPurchase, validateInventory, INVENTORY_SLOTS } from "../src/battle/moba/items/itemInventory.js";
import {
  MILLI, SHOP_WINDOWS, INCOME_V1, createLedger, earn, spend, checkConservation, splitMilli, purchase, totalEarnedMilli,
} from "../src/battle/moba/items/itemEconomy.js";
import { computeCombatStats, COMBAT_CONSTANTS, DAMAGE_PROFILE_BY_ARCH, ARCHETYPES } from "../src/battle/moba/items/combatStatsV1.js";
import {
  PRIMITIVES, DEFERRED_PRIMITIVES, outgoingDamage, mitigate, executeMultiplier, antiCritOf, healCutOf,
  lifestealHeal, omnivampHeal, lowHpShield, auraTotals, slowMultiplier,
} from "../src/battle/moba/items/itemEffects.js";
import { BUILD_STRATEGIES, BUILD_PATHS, buildTargets, nextStep, enemyProfile } from "../src/battle/moba/items/buildPolicy.js";
import { simulatePurchaseTimeline, buildStandardScenario } from "../src/battle/moba/items/offlinePurchaseSim.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const results = [];
const ck = (gate, name, pass, detail = "") => results.push({ gate, name, pass: !!pass, detail });
const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
const deepFreeze = (v) => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); } return v; };
const clone = (v) => JSON.parse(JSON.stringify(v));
const safe = (fn) => { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: e.message }; } };

// ── G1 目錄 ─────────────────────────────────────────────────────────────────
{
  const byTier = Object.fromEntries(ITEM_TIERS.map((t) => [t, ITEM_IDS.filter((id) => ITEM_CATALOG[id].tier === t).length]));
  ck("G1", "總數 88、T1 18／T2 16／T3 44／Boots 6／Starter 4",
    ITEM_IDS.length === 88 && byTier.T1 === 18 && byTier.T2 === 16 && byTier.T3 === 44 && byTier.BOOTS === 6 && byTier.STARTER === 4,
    JSON.stringify(byTier));
  ck("G1", "id 唯一、目錄版本字串與批次值域合法",
    new Set(ITEM_IDS).size === ITEM_IDS.length && ITEM_CATALOG_VERSION === "moba-items.catalog.v1"
    && ITEM_IDS.every((id) => ITEM_BATCHES.includes(ITEM_CATALOG[id].batch)));
  const fieldErrors = [];
  for (const id of ITEM_IDS) {
    const it = ITEM_CATALOG[id];
    if (it.id !== id || !it.name || !Number.isInteger(it.price)) fieldErrors.push(`${id}:basic`);
    for (const k of Object.keys(it.stats)) if (!STAT_KEYS.includes(k)) fieldErrors.push(`${id}:stat:${k}`);
    for (const e of it.effects) {
      if (!PRIMITIVES[e.type] || PRIMITIVES[e.type].statBased) fieldErrors.push(`${id}:effect:${e.type}`);
      if (DEFERRED_PRIMITIVES.includes(e.type)) fieldErrors.push(`${id}:deferred:${e.type}`);
      if (!batchAllows(PRIMITIVES[e.type]?.batch, e.batch ?? it.batch)) fieldErrors.push(`${id}:effectBatch:${e.type}`);
    }
    if (it.tier === "T3" && !ITEM_FAMILIES[it.family]) fieldErrors.push(`${id}:family`);
  }
  ck("G1", "每件欄位完整：屬性鍵合法、效果屬已登記 primitive、效果批次不早於 primitive、完成裝有家族", fieldErrors.length === 0, fieldErrors.slice(0, 5).join(", "));
  const famCount = {};
  for (const id of ITEM_IDS) if (ITEM_CATALOG[id].tier === "T3") famCount[ITEM_CATALOG[id].family] = (famCount[ITEM_CATALOG[id].family] ?? 0) + 1;
  ck("G1", "八大家族完成裝分配 A6 B5 C6 D6 E6 F5 G6 H4",
    JSON.stringify(famCount) === JSON.stringify({ A: 6, B: 5, C: 6, D: 6, E: 6, F: 5, G: 6, H: 4 }), JSON.stringify(famCount));
  ck("G1", "目錄深度凍結（執行期不可修改）", Object.isFrozen(ITEM_CATALOG) && Object.isFrozen(ITEM_CATALOG.t3_dawnbow.stats)
    && Object.isFrozen(ITEM_CATALOG.t3_stormfork.effects) && Object.isFrozen(ITEM_CATALOG.t3_stormfork.effects[0].params)
    && !safe(() => { ITEM_CATALOG.t3_dawnbow.stats.ad = 999; }).ok && ITEM_CATALOG.t3_dawnbow.stats.ad === 45);
  //  與矩陣文件逐件一致（名稱、價格、批次）
  const md = read("docs/design/MOBA_裝備矩陣_v1.md");
  const mismatches = [];
  const docIds = new Set();
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const idx = cells.findIndex((c) => /^`(t1|t2|t3|bt|st)_[a-z_]+`$/.test(c));
    if (idx < 0 || !/^\d+$/.test(cells[idx + 2] ?? "")) continue;
    const id = cells[idx].replace(/`/g, "");
    docIds.add(id);
    const it = getItem(id);
    const batch = cells[cells.length - 1];
    if (!it) { mismatches.push(`${id}:missing`); continue; }
    if (it.name !== cells[idx + 1]) mismatches.push(`${id}:name`);
    if (it.price !== Number(cells[idx + 2])) mismatches.push(`${id}:price`);
    if (it.batch !== batch) mismatches.push(`${id}:batch`);
  }
  ck("G1", "與 docs/design/MOBA_裝備矩陣_v1.md 逐件一致（88 件名稱、價格、批次）", docIds.size === 88 && mismatches.length === 0, mismatches.slice(0, 5).join(", "));
  //  不沿用 legacy 名稱
  const legacy = read("src/EsportsGame.jsx");
  const start = legacy.indexOf("const ITEMS={");
  const block = legacy.slice(start, legacy.indexOf("};", start));
  const legacyNames = [...block.matchAll(/name:"([^"]+)"/g)].map((m) => m[1]);
  const reused = ITEM_IDS.filter((id) => legacyNames.includes(ITEM_CATALOG[id].name));
  ck("G1", "不沿用 legacy（外部遊戲）裝備名稱", legacyNames.length >= 30 && reused.length === 0, `legacy ${legacyNames.length}、重複 ${reused.join(",")}`);
}

// ── G2 v1.0 首發 68 件 ────────────────────────────────────────────────────────
{
  const v10 = itemsForBatch("1.0");
  const t3v10 = v10.filter((id) => ITEM_CATALOG[id].tier === "T3");
  const fam10 = {};
  for (const id of t3v10) fam10[ITEM_CATALOG[id].family] = (fam10[ITEM_CATALOG[id].family] ?? 0) + 1;
  ck("G2", "v1.0 可用 68 件、其中完成裝 24 件、八大家族各 3 件",
    v10.length === 68 && t3v10.length === 24 && Object.values(fam10).every((n) => n === 3) && Object.keys(fam10).length === 8,
    `${v10.length}/${t3v10.length} ${JSON.stringify(fam10)}`);
  const leak = [];
  const walk = (id, root) => { for (const c of ITEM_CATALOG[id].components) { if (ITEM_CATALOG[c].batch !== "1.0") leak.push(`${root}←${c}`); walk(c, root); } };
  for (const id of v10) walk(id, id);
  ck("G2", "v1.0 物品的整棵合成樹只含 v1.0 物品", leak.length === 0, leak.join(","));
  const v11only = ITEM_IDS.filter((id) => ITEM_CATALOG[id].batch === "1.1");
  const rejected = v11only.every((id) => purchase({
    ledger: createLedger({ startGold: 99999 }), inventory: emptyInventory(), itemId: id, window: "spawn", batch: "1.0", seatRole: "mid",
  }).reason === "batch_locked");
  ck("G2", `v1.1-only 物品（${v11only.length} 件）在 v1.0 下一律被拒絕 batch_locked`, v11only.length === 20 && rejected);
  const threw = v11only.every((id) => !safe(() => computeCombatStats([id], { batch: "1.0" })).ok);
  const burnInactive = computeCombatStats(["t2_ember"], { batch: "1.0" }).effects.length === 0
    && computeCombatStats(["t2_ember"], { batch: "1.1" }).effects.some((e) => e.type === "BURN");
  ck("G2", "CombatStatsV1 在 v1.0 拒收 v1.1 物品；v1.0 物品上的 v1.1 效果（灼痕燃石 BURN）不啟用", threw && burnInactive);
  ck("G2", "LAUNCH_BATCH 為 1.0", LAUNCH_BATCH === "1.0");
}

// ── G3 合成樹 ─────────────────────────────────────────────────────────────────
{
  const graph = validateRecipeGraph();
  ck("G3", "合成樹合法：組件存在、階層遞增、無循環、合成費為正整數", graph.ok, graph.errors.slice(0, 5).join("；"));
  const badFlat = ITEM_IDS.filter((id) => flattenedCost(id) !== ITEM_CATALOG[id].price);
  const badEmpty = ITEM_IDS.filter((id) => purchaseCost(id, Array(6).fill(null)).cost !== ITEM_CATALOG[id].price);
  ck("G3", "價格守恆：從零買起的遞迴總價 = 成品價（88/88）", badFlat.length === 0 && badEmpty.length === 0, [...badFlat, ...badEmpty].join(","));
  const fees = ITEM_IDS.filter((id) => ITEM_CATALOG[id].components.length).map((id) => recipeFee(id));
  ck("G3", "所有合成費 > 0", fees.every((f) => Number.isInteger(f) && f > 0), `${fees.length} 件`);
  //  負向：人工造出循環 ⇒ 必須被抓到
  const cyc = { a: { id: "a", tier: "T2", price: 900, components: ["b", "c"], stats: {}, effects: [] }, b: { id: "b", tier: "T2", price: 500, components: ["a", "c"], stats: {}, effects: [] }, c: { id: "c", tier: "T1", price: 100, components: [], stats: {}, effects: [] } };
  const bad = validateRecipeGraph(cyc, ["a", "b", "c"]);
  ck("G3", "負向測試：人工循環與階層錯誤會被抓到", !bad.ok && bad.errors.some((e) => e.startsWith("循環")), bad.errors.slice(0, 2).join("；"));
  //  差價：已有組件以原價抵扣
  const slots = ["t2_scope", "t1_ad_l", null, null, null, null];
  const pc = purchaseCost("t3_dawnbow", slots);
  ck("G3", "差價：破曉長弓持有精準瞄鏡＋重鍛刀胚 ⇒ 付 3100 − 950 − 480 = 1670，消耗格 0、1", pc.cost === 1670 && JSON.stringify(pc.consumedSlots) === "[0,1]", JSON.stringify(pc));
  const deep = purchaseCost("t3_dawnbow", ["t1_crit", "t1_as", null, null, null, null]);
  ck("G3", "差價：缺中階組件時遞迴以子組件抵扣（準星石＋輕羽匕首 ⇒ 付 3100 − 620）", deep.cost === 2480 && deep.consumedSlots.length === 2, JSON.stringify(deep));
}

// ── G4 金錢守恆 ───────────────────────────────────────────────────────────────
{
  let l = createLedger();
  l = earn(l, "passive", 2800); l = earn(l, "kill", 300 * MILLI);
  const s1 = spend(l, 450 * MILLI);
  const c1 = checkConservation(s1.ledger);
  ck("G4", "帳本單元：入帳／支出後 start + Σearned == unspent + spent（整數）", s1.ok && c1.ok && c1.lhs === 802800, JSON.stringify(c1));
  ck("G4", "非整數或負數金額被拒絕", !safe(() => earn(l, "passive", 1.5)).ok && !safe(() => earn(l, "passive", -1)).ok && !safe(() => earn(l, "unknownSource", 1)).ok);
  const parts = splitMilli(150001, ["b1", "b3", "b2"]);
  ck("G4", "決定性均分：總和精確、餘數依給定順序分配", parts.reduce((s, [, v]) => s + v, 0) === 150001 && parts[0][1] === 50001 && parts[1][1] === 50000
    && JSON.stringify(parts) === JSON.stringify(splitMilli(150001, ["b1", "b3", "b2"])), JSON.stringify(parts));
  ck("G4", "被動收入與隊伍總量一致（2.8 × 5 = 14，legacy 未調整）", INCOME_V1.passivePerSec * 5 === INCOME_V1.legacyTeamPassivePerSec && INCOME_V1.kill === 300 && INCOME_V1.minion === 20 && INCOME_V1.tower === 250);

  const scenario = buildStandardScenario({ comps: { blue: ["戰士", "刺客", "法師", "射手", "輔助"], red: ["坦克", "戰士", "法師", "射手", "輔助"] } });
  const sim = simulatePurchaseTimeline(scenario);
  ck("G4", "整場離線模擬：每個事件後守恆與背包合法（0 違規）", sim.violations.length === 0, sim.violations.slice(0, 3).join("；"));
  const perSource = {};
  for (const e of scenario.incomes) perSource[`${e.playerId}:${e.source}`] = (perSource[`${e.playerId}:${e.source}`] ?? 0) + e.milli;
  let sourceOk = true, spentOk = true, eqOk = true;
  for (const [id, p] of Object.entries(sim.players)) {
    for (const [src, v] of Object.entries(p.ledger.earnedMilli)) if (perSource[`${id}:${src}`] !== v) sourceOk = false;
    const costs = sim.events.filter((e) => e.playerId === id).reduce((s, e) => s + e.cost * MILLI, 0);
    if (costs !== p.ledger.spentMilli) spentOk = false;
    if (p.ledger.startMilli + totalEarnedMilli(p.ledger) !== p.ledger.unspentMilli + p.ledger.spentMilli) eqOk = false;
  }
  ck("G4", "終局：各來源入帳 = 情境收入逐項相加；已花 = 購買事件成本總和；四條等式成立", sourceOk && spentOk && eqOk, JSON.stringify({ sourceOk, spentOk, eqOk }));
  const unspentAfterOk = (() => {
    const run = {};
    for (const e of sim.events) { run[e.playerId] = e.unspentAfter; }
    return Object.entries(sim.players).every(([id, p]) => run[id] === undefined || run[id] >= 0);
  })();
  ck("G4", "購買事件的 unspentAfter 永不為負", unspentAfterOk && sim.events.every((e) => e.unspentAfter >= 0));
}

// ── G5 背包 ───────────────────────────────────────────────────────────────────
{
  let inv = emptyInventory();
  for (const id of ["t1_ad_s", "t1_ap_s", "t1_hp_s", "t1_ar_s", "t1_mr_s", "t1_as"]) inv = applyPurchase(inv, id).inventory;
  const full = applyPurchase(inv, "t1_crit");
  ck("G5", "6 格上限：滿格再買被拒絕 slot_full", INVENTORY_SLOTS === 6 && inv.slots.every(Boolean) && !full.ok && full.reason === "slot_full");
  const combineInv = { slots: ["t1_as", "t1_ad_s", "t1_hp_s", "t1_hp_s", "t1_ar_s", "t1_mr_s"] };
  const cost = purchaseCost("t2_gale", combineInv.slots);
  const combined = applyPurchase(combineInv, "t2_gale", cost.consumedSlots);
  ck("G5", "滿格仍可合成：先移除被消耗組件再放入成品（放在最小空格 0）", combined.ok && combined.inventory.slots[0] === "t2_gale" && combined.inventory.slots[1] === null && cost.cost === 300,
    JSON.stringify(combined.inventory.slots));
  ck("G5", "applyPurchase 不修改輸入", JSON.stringify(combineInv.slots) === JSON.stringify(["t1_as", "t1_ad_s", "t1_hp_s", "t1_hp_s", "t1_ar_s", "t1_mr_s"]));
  ck("G5", "validateInventory 抓出非法狀態（7 格、2 雙靴、unique 重複）",
    !validateInventory({ slots: Array(7).fill(null) }).ok
    && !validateInventory({ slots: ["bt_iron", "bt_quiet", null, null, null, null] }).ok
    && !validateInventory({ slots: ["t3_unbroken", "t3_calmveil", null, null, null, null] }).ok);
}

// ── G6 靴子／starter ─────────────────────────────────────────────────────────
{
  const rich = createLedger({ startGold: 10000 });
  const b1 = purchase({ ledger: rich, inventory: emptyInventory(), itemId: "bt_base", window: "spawn" });
  const b2 = purchase({ ledger: b1.ledger, inventory: b1.inventory, itemId: "bt_base", window: "recallArrive" });
  const up = purchase({ ledger: b1.ledger, inventory: b1.inventory, itemId: "bt_iron", window: "recallArrive" });
  const up2 = purchase({ ledger: up.ledger, inventory: up.inventory, itemId: "bt_swift", window: "recallArrive" });
  ck("G6", "靴子最多 1 雙：第二雙基礎靴被拒絕；升級消耗基礎靴只付合成費 700；已有升級靴再買另一雙被拒絕",
    b1.ok && !b2.ok && b2.reason === "boots_limit" && up.ok && up.events[0].cost === 700 && up.inventory.slots.filter(Boolean).length === 1 && !up2.ok && up2.reason === "boots_limit");
  const s1 = purchase({ ledger: rich, inventory: emptyInventory(), itemId: "st_blade", window: "spawn", seatRole: "top" });
  const s2 = purchase({ ledger: s1.ledger, inventory: s1.inventory, itemId: "st_tome", window: "spawn", seatRole: "top" });
  ck("G6", "starter 最多 1 件", s1.ok && !s2.ok && s2.reason === "starter_limit");
  const jg = purchase({ ledger: rich, inventory: emptyInventory(), itemId: "st_hunter", window: "spawn", seatRole: "mid" });
  const sup = purchase({ ledger: rich, inventory: emptyInventory(), itemId: "st_tithe", window: "spawn", seatRole: "sup" });
  ck("G6", "席位限制：獵人護符只限打野、守護徽章只限輔助", !jg.ok && jg.reason === "seat_restricted" && sup.ok);
  let inv = { slots: ["st_blade", "t3_dawnbow", "t3_stormfork", "t3_pierce", "bt_swift", "t3_rendspear"] };
  const led = createLedger({ startGold: 3000 });
  const drop = purchase({ ledger: led, inventory: inv, itemId: "t3_unbroken", window: "respawn" });
  ck("G6", "滿格時自動丟棄 starter（不退款：已花費只增加新物品成本）",
    drop.ok && drop.events[0].action === "dropStarter" && drop.events[0].cost === 0 && drop.ledger.spentMilli === 3000 * MILLI && !drop.inventory.slots.includes("st_blade"), JSON.stringify(drop.events));
  const nowin = purchase({ ledger: rich, inventory: emptyInventory(), itemId: "t1_ad_s", window: "walkIn" });
  //  M2：Q3 核准走路進泉水開窗 ⇒ 第四個窗 fountain；其他任何時點仍一律拒絕。
  const walk = purchase({ ledger: rich, inventory: emptyInventory(), itemId: "t1_ad_s", window: "fountain" });
  ck("G6", `只能在 ${SHOP_WINDOWS.join("／")} 購買（非購買窗被拒絕）`, !nowin.ok && nowin.reason === "not_in_shop_window" && walk.ok
    && JSON.stringify(SHOP_WINDOWS) === JSON.stringify(["spawn", "respawn", "recallArrive", "fountain"]));
}

// ── G7 金錢不足 ───────────────────────────────────────────────────────────────
{
  const poor = createLedger({ startGold: 299 });
  const inv = emptyInventory();
  const r = purchase({ ledger: poor, inventory: inv, itemId: "t1_ad_s", window: "spawn" });
  ck("G7", "金錢不足（299 買 300）被拒絕 insufficient_gold，帳本與背包原封不動", !r.ok && r.reason === "insufficient_gold" && r.ledger === poor && r.inventory === inv && r.events.length === 0);
  const exact = purchase({ ledger: createLedger({ startGold: 300 }), inventory: inv, itemId: "t1_ad_s", window: "spawn" });
  ck("G7", "剛好足額可以買，買完未花為 0", exact.ok && exact.ledger.unspentMilli === 0);
  const combine = purchase({ ledger: createLedger({ startGold: 699 }), inventory: { slots: ["t1_as", null, null, null, null, null] }, itemId: "t2_gale", window: "respawn" });
  ck("G7", "合成依差價判定：持有輕羽匕首時疾風弩機只付 600（持有 699 可買）", combine.ok && combine.events[0].cost === 600,
    JSON.stringify(combine.events[0] ?? combine.reason));
  const combinePoor = purchase({ ledger: createLedger({ startGold: 599 }), inventory: { slots: ["t1_as", null, null, null, null, null] }, itemId: "t2_gale", window: "respawn" });
  ck("G7", "合成差價 600、持有 599 ⇒ 拒絕", !combinePoor.ok && combinePoor.reason === "insufficient_gold");
}

// ── G8／G10 AI 決定性、不買 v1.1 ─────────────────────────────────────────────
const COMPS = {
  mixed: [{ arch: "坦克" }, { arch: "戰士" }, { arch: "法師" }, { arch: "射手" }, { arch: "輔助" }],
  adTanks: [{ arch: "坦克" }, { arch: "坦克" }, { arch: "刺客" }, { arch: "射手" }, { arch: "戰士" }],
  apHeal: [{ arch: "法師" }, { arch: "輔助", healer: true }, { arch: "法師" }, { arch: "輔助", healer: true }, { arch: "坦克" }],
  divers: [{ arch: "刺客" }, { arch: "刺客" }, { arch: "刺客" }, { arch: "射手" }, { arch: "戰士" }],
};
{
  const seats = ["top", "jungle", "mid", "adc", "sup"];
  let combos = 0, deterministic = true, legal = true, noV11 = true, capOk = true, noUniqueDup = true;
  const v11 = new Set(ITEM_IDS.filter((id) => ITEM_CATALOG[id].batch === "1.1"));
  for (const arch of ARCHETYPES) for (const strategy of BUILD_STRATEGIES) for (const [cname, comp] of Object.entries(COMPS)) for (const seatRole of seats) {
    combos++;
    const input = deepFreeze({ arch, seatRole, strategy, enemies: comp.map((e) => ({ ...e, items: [] })) });
    const a = buildTargets(input), b = buildTargets(clone(input));
    if (hash(a) !== hash(b)) deterministic = false;
    if (a.targets.some((id) => !getItem(id) || ITEM_CATALOG[id].batch !== "1.0")) legal = false;
    if (a.targets.some((id) => v11.has(id))) noV11 = false;
    const finals = a.targets.filter((id) => ["T2", "T3"].includes(ITEM_CATALOG[id].tier) && id !== a.earlyComponent).length;
    if (finals > 5) capOk = false;
    const groups = a.targets.map((id) => ITEM_CATALOG[id].unique).filter(Boolean);
    if (new Set(groups).size !== groups.length) noUniqueDup = false;
  }
  ck("G8", `buildTargets：6 定位 × 5 策略 × 4 陣容 × 5 席位（${combos} 組）兩次輸出逐字相同`, combos === 600 && deterministic);
  ck("G8", "全部目標皆為 v1.0 合法物品、最終物品 ≤ 5、unique group 不重複", legal && capOk && noUniqueDup, JSON.stringify({ legal, capOk, noUniqueDup }));
  ck("G10", "buildTargets 在 600 組輸入中從未出現 v1.1-only 物品", noV11);

  //  情境規則有真的生效（固定輸入 → 固定結果）
  const heal = buildTargets({ arch: "法師", seatRole: "mid", strategy: "standard", enemies: COMPS.apHeal.map((e) => ({ ...e, items: [] })) });
  const tanks = buildTargets({ arch: "射手", seatRole: "adc", strategy: "standard", enemies: COMPS.adTanks.map((e) => ({ ...e, items: [] })) });
  const counter = buildTargets({ arch: "坦克", seatRole: "top", strategy: "counter", enemies: COMPS.apHeal.map((e) => ({ ...e, items: [] })) });
  const divers = buildTargets({ arch: "射手", seatRole: "adc", strategy: "standard", enemies: COMPS.divers.map((e) => ({ ...e, items: [] })) });
  ck("G8", "情境規則：法師對治療陣容出裂魂法杖；射手對雙坦克把碎盾重錘提到核心 2；坦克 counter 把反治療提到核心 2；射手對三刺客換鐵步靴",
    heal.targets.includes("t3_soulrend")
    && tanks.targets.indexOf("t3_shieldbreaker") < tanks.targets.indexOf("t3_stormfork")
    && counter.targets.indexOf("t3_thornmail") < counter.targets.indexOf("t3_wardaltar")
    && divers.targets.includes("bt_iron") && !divers.targets.includes("bt_swift"),
    JSON.stringify({ heal: heal.targets, tanks: tanks.targets.slice(0, 6), counter: counter.targets.slice(0, 5), divers: divers.targets.slice(0, 5) }));
  const surv = buildTargets({ arch: "法師", seatRole: "mid", strategy: "survival", enemies: [] });
  const scal = buildTargets({ arch: "射手", seatRole: "adc", strategy: "scaling", enemies: [] });
  const early = buildTargets({ arch: "刺客", seatRole: "mid", strategy: "early", enemies: [] });
  const t3Order = (targets) => targets.filter((id) => ITEM_CATALOG[id].tier === "T3");
  ck("G8", "策略：survival 把靈能護符提到核心 2；scaling 升級靴延到核心 2 之後；early 先買裂鋒刃",
    t3Order(surv.targets)[1] === "t3_psyward"
    && scal.targets.indexOf("bt_swift") > scal.targets.indexOf("t3_stormfork")
    && early.targets.indexOf("t2_rend") < early.targets.indexOf("bt_base"),
    JSON.stringify({ surv: surv.targets.slice(0, 5), scal: scal.targets.slice(0, 6), early: early.targets.slice(0, 4) }));
  const prof = enemyProfile(COMPS.adTanks.map((e) => ({ ...e, items: [] })));
  //  (0.70 + 0.70 + 0.80 + 0.90 + 0.85) ÷ 5 = 0.79
  ck("G8", "敵方 profile 決定性：雙坦克陣容 adShare 0.79、AD 重、坦克 2、刺客 1", prof.adShare === 0.79 && prof.adHeavy && prof.tankCount === 2 && prof.assassinCount === 1, JSON.stringify(prof));

  //  nextStep：固定狀態逐步推演兩次一致
  const stepRun = () => {
    let led = createLedger(); let inv = emptyInventory(); let lock = null; let history = { starterPurchased: false };
    const log = [];
    for (const [gold, win] of [[0, "spawn"], [1200, "recallArrive"], [1500, "recallArrive"], [2600, "respawn"], [3000, "recallArrive"]]) {
      if (gold) led = earn(led, "passive", gold * MILLI);
      for (let i = 0; i < 16; i++) {
        const d = nextStep(deepFreeze({ arch: "射手", seatRole: "adc", strategy: "standard", enemies: COMPS.mixed.map((e) => ({ ...e, items: [] })), inventory: inv, unspentMilli: led.unspentMilli, lock, history, state: {}, t: 0 }));
        lock = d.lock;
        if (d.action !== "buy") break;
        const r = purchase({ ledger: led, inventory: inv, itemId: d.itemId, window: win, seatRole: "adc" });
        if (!r.ok) { log.push(`REJECT:${d.itemId}:${r.reason}`); break; }
        led = r.ledger; inv = r.inventory;
        if (d.itemId.startsWith("st_")) history = { starterPurchased: true };
        log.push(r.events.map((e) => `${e.action}:${e.itemId}`).join("+"));
      }
    }
    return { log, inv: inv.slots };
  };
  const r1 = stepRun(), r2 = stepRun();
  ck("G8", "nextStep 逐步推演（射手 5 次開窗）兩次逐步相同、無被帳本拒絕的決策", hash(r1) === hash(r2) && !r1.log.some((l) => l.startsWith("REJECT")), r1.log.join(" | "));
}

// ── G9／G10／G12 離線模擬 ─────────────────────────────────────────────────────
{
  const v11 = new Set(ITEM_IDS.filter((id) => ITEM_CATALOG[id].batch === "1.1"));
  const scenarios = [];
  for (const strategy of BUILD_STRATEGIES) {
    for (const [name, red] of [["mixed", ["坦克", "戰士", "法師", "射手", "輔助"]], ["adTanks", ["坦克", "坦克", "刺客", "射手", "戰士"]], ["apHeal", ["法師", "輔助", "法師", "輔助", "坦克"]]]) {
      const strategies = Object.fromEntries(["b1", "b2", "b3", "b4", "b5", "r1", "r2", "r3", "r4", "r5"].map((id) => [id, strategy]));
      const healers = name === "apHeal" ? { r2: true, r4: true } : {};
      scenarios.push({ key: `${strategy}:${name}`, scenario: buildStandardScenario({ comps: { blue: ["戰士", "刺客", "法師", "射手", "輔助"], red }, strategies, healers }) });
    }
  }
  let violations = 0, v11Bought = 0, deterministic = true, orderIndependent = true, frozenOk = true, allBought = true;
  const summary = {};
  for (const { key, scenario } of scenarios) {
    const frozen = deepFreeze(clone(scenario));
    const a = safe(() => simulatePurchaseTimeline(frozen));
    if (!a.ok) { frozenOk = false; continue; }
    const b = simulatePurchaseTimeline(clone(scenario));
    if (hash(a.value) !== hash(b)) deterministic = false;
    //  打亂輸入陣列順序（同時間事件的排序由模擬器自己決定）
    const shuffled = { ...clone(scenario), players: clone(scenario.players).reverse(), incomes: clone(scenario.incomes).reverse(), windows: clone(scenario.windows).reverse(), states: clone(scenario.states).reverse() };
    if (hash(simulatePurchaseTimeline(shuffled).players) !== hash(a.value.players)) orderIndependent = false;
    violations += a.value.violations.length;
    v11Bought += a.value.events.filter((e) => v11.has(e.itemId)).length;
    for (const p of Object.values(a.value.players)) if (p.inventory.filter(Boolean).length < 4) allBought = false;
    summary[key] = hash(a.value.events);
  }
  ck("G9", `同輸入同輸出：${scenarios.length} 場（5 策略 × 3 陣容）以深度凍結輸入執行不丟例外，兩次結果雜湊相同`, frozenOk && deterministic);
  ck("G12", "離線時間線決定性：反轉 players／incomes／windows／states 輸入順序，結果完全相同", orderIndependent);
  ck("G4", `${scenarios.length} 場離線模擬守恆與背包合法違規 0`, violations === 0, `violations ${violations}`);
  ck("G10", `${scenarios.length} 場完整模擬中 AI 購買 v1.1-only 物品 0 次`, v11Bought === 0, `bought ${v11Bought}`);
  ck("G12", "每場每名英雄終局至少持有 4 格（確認模擬真的有在買，不是空跑）", allBought);
  const once = simulatePurchaseTimeline(scenarios[0].scenario);
  const seqOk = once.events.every((e, i) => e.seq === i) && once.events.every((e, i, arr) => i === 0 || arr[i - 1].t <= e.t);
  ck("G12", "購買事件序號連續、時間單調不減", seqOk, `events ${once.events.length}`);
}

// ── G11 CombatStatsV1 純函式與效果計算 ───────────────────────────────────────
{
  const inv = deepFreeze(["t3_dawnbow", "t2_scythe", "t3_rendspear", "bt_swift", null, "st_blade"]);
  const a = safe(() => computeCombatStats(inv));
  const b = computeCombatStats(clone(inv));
  ck("G11", "凍結輸入可計算、兩次輸出逐字相同、輸出深度凍結", a.ok && hash(a.value) === hash(b) && Object.isFrozen(b) && Object.isFrozen(b.effects));
  ck("G11", "屬性加總正確：AD 45+15+30+7=97、暴擊 0.45、暴擊倍率 2.10、攻速 0.25", b.ad === 97 && Math.abs(b.critChance - 0.45) < 1e-12 && Math.abs(b.critDamage - 2.10) < 1e-12 && Math.abs(b.attackSpeed - 0.25) < 1e-12,
    JSON.stringify({ ad: b.ad, cr: b.critChance, cd: b.critDamage, as: b.attackSpeed }));
  const griev = b.effects.filter((e) => e.type === "GRIEVOUS_WOUNDS");
  ck("G11", "效果去重：重創鐮與裂傷刺矛的攻擊通道重傷只保留一個", griev.length === 1, JSON.stringify(b.effects.map((e) => e.type)));
  const onHits = computeCombatStats(["t3_stormfork", "t3_shieldbreaker", "t3_torrent"]).effects.filter((e) => e.type === "ON_HIT");
  const mixedGrievous = computeCombatStats(["t2_vial", "t3_thornmail"]).effects.filter((e) => e.type === "GRIEVOUS_WOUNDS").map((e) => e.params.trigger);
  ck("G11", "不同變體不被誤去重：三種 on-hit 並存；技能通道重傷與被擊中重傷並存",
    onHits.length === 3 && JSON.stringify(mixedGrievous) === JSON.stringify(["ability", "struck"]), JSON.stringify({ onHits: onHits.length, mixedGrievous }));
  const empty = computeCombatStats([null, null, null, null, null, null]);
  ck("G11", "空背包：isEmpty、所有屬性 0、暴擊倍率 1.75", empty.isEmpty && empty.ad === 0 && empty.hp === 0 && empty.critDamage === COMBAT_CONSTANTS.CRIT_BASE && empty.effects.length === 0);
  const ap = computeCombatStats(["t3_starcrown", "t2_core"]);
  ck("G11", "法強放大：(110 + 50) × 1.2 = 192", Math.abs(ap.ap - 192) < 1e-9, String(ap.ap));

  //  效果 primitive 純計算
  const prof = DAMAGE_PROFILE_BY_ARCH["射手"];
  const zero = outgoingDamage({ D0: 100, cs: empty, profile: prof });
  ck("G11", "輸出零屬性短路：D0 依物理／法術占比拆分（不經乘法鏈）", zero.phys === 100 * prof.phys && zero.magic === 100 * prof.magic);
  const out1 = outgoingDamage({ D0: 100, cs: b, profile: prof, foe: { hp: 500, maxHp: 1000, antiCrit: 0 }, dt: 0.5, lateFactor: 1 });
  const out2 = outgoingDamage({ D0: 100, cs: b, profile: prof, foe: { hp: 500, maxHp: 1000, antiCrit: 0.25 }, dt: 0.5, lateFactor: 1 });
  ck("G11", "裝備讓輸出上升；防守方反暴擊讓輸出下降", out1.phys > zero.phys && out2.phys < out1.phys, JSON.stringify({ out1, out2 }));
  const mit = mitigate({ phys: 100, magic: 100, attackerCs: { armorPenPct: 0.3, armorPenFlat: 10, magicPenPct: 0, magicPenFlat: 0 }, defenderCs: { armor: 100, mr: 50 } });
  ck("G11", "減傷：護甲 100 × 0.7 − 10 = 60 ⇒ 100×100/160；魔抗 50 ⇒ 100×100/150", Math.abs(mit.physTaken - 62.5) < 1e-9 && Math.abs(mit.magicTaken - 100 * 100 / 150) < 1e-9, JSON.stringify(mit));
  const ex = executeMultiplier(computeCombatStats(["t3_shadowblade"]), { hp: 390, maxHp: 1000 });
  const exNo = executeMultiplier(computeCombatStats(["t3_shadowblade"]), { hp: 400, maxHp: 1000 });
  ck("G11", "斬殺：< 40% 才 +10%（39% ⇒ 1.10；40% ⇒ 1）", Math.abs(ex - 1.1) < 1e-12 && exNo === 1);
  ck("G11", "反暴擊取最強、減療取最強不相加、緩速取最強不相乘",
    antiCritOf(computeCombatStats(["t3_bulwark"])) === 0.25 && healCutOf([0.4, 0.4, 0.25]) === 0.4 && Math.abs(slowMultiplier([0.08, 0.15]) - 0.85) < 1e-12);
  ck("G11", "吸血只算物理攻擊通道承傷、全能吸血算全部，都受減療",
    Math.abs(lifestealHeal({ physAttackTaken: 100, cs: { lifesteal: 0.1 }, healCut: 0.4 }) - 6) < 1e-12
    && Math.abs(omnivampHeal({ totalTaken: 200, cs: { omnivamp: 0.07 }, healCut: 0 }) - 14) < 1e-12);
  const shieldEff = computeCombatStats(["t3_unbroken"]).effects.find((e) => e.type === "LOW_HP_SHIELD");
  const s1 = lowHpShield({ effect: shieldEff, hp: 290, maxHp: 1000, t: 100, readyAt: -Infinity });
  const s2 = lowHpShield({ effect: shieldEff, hp: 200, maxHp: 1000, t: 120, readyAt: s1.readyAt });
  const s3 = lowHpShield({ effect: shieldEff, hp: 200, maxHp: 1000, t: 160, readyAt: s1.readyAt });
  ck("G11", "低血護盾：< 30% 觸發 200 護盾、冷卻 60 秒內不再觸發、到期後可再觸發", s1.triggered && s1.amount === 200 && s1.readyAt === 160 && !s2.triggered && s3.triggered);
  const aura = auraTotals([
    { effect: getItem("t3_wardaltar").effects[0], group: "aura:resist" },
    { effect: getItem("t3_wardaltar").effects[0], group: "aura:resist" },
  ]);
  ck("G11", "光環同 group 不疊加（兩座守望聖壇仍是 +8／+8）", aura.armor === 8 && aura.mr === 8);

  //  靜態掃描：items 模組沒有時間、亂數、瀏覽器或引擎依賴
  const dir = "src/battle/moba/items";
  const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".js"));
  const offenders = [];
  for (const f of files) {
    const code = read(`${dir}/${f}`).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    if (/Math\.random|Date\.now|new Date|performance\.now|crypto\.|\brng\d?\s*\(|window\.|localStorage|document\./.test(code)) offenders.push(`${f}:runtime`);
    if (/from\s+["'][^"']*(LogicEngine|react|zustand|profileStore|useGameStore|three)["']/.test(code)) offenders.push(`${f}:import`);
  }
  //  M1 9 支純模組 ＋ M2 三支（itemsEngineRuntime／itemsEngineAdapter／itemsViewModel）＋ M3a 一支（itemsUiSelectors）＋ M3d 一支（buildStrategyPrep）
  ck("G11", `items 模組（${files.length} 支）不使用時間／亂數／瀏覽器 API，不 import 引擎、React、store、three`, files.length === 14 && offenders.length === 0, offenders.join(","));
}

// ── G13 隔離 ──────────────────────────────────────────────────────────────────
//  M1 時代的「LogicEngine 相對 HEAD 無改動」已由 M2 接手：引擎改動後 itemsV1 OFF 的逐位元不變
//  改由 tools/check_moba_items_m2.mjs G1（對 M1 基準 commit 逐場比對指紋）證明。
//  這裡只保留仍然成立的隔離：誰可以 import items 模組、正式流程沒有啟用、模擬版本沒動。
{
  const importers = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) { if (rel !== "src/battle/moba/items") walk(rel); }
      else if (/\.(jsx?|mjs)$/.test(e.name) && /moba\/items\/|from\s+["']\.\/items\//.test(read(rel))) importers.push(rel);
    }
  };
  walk("src");
  //  M3a：useLocalServer（受 itemsV1 開關保護）、DEV 工具、裝備 UI 元件也可以讀 items 模組。
  //  M3b：戰鬥底層 BattleObserverHUD 只讀 itemsUiSelectors（replay 與 OFF 時回 null）。
  //  M3c：戰鬥英雄面板 BattleHeroSheet 只讀 itemsViewModel／itemsUiSelectors（OFF 時回 null）。
  //  M3d：戰術頁 TacticScreen 只讀 buildStrategyPrep 的預覽 selector（itemsV1 閘門內才呼叫）。
  const allowedImporter = (f) => f === "src/LogicEngine.js" || f === "src/useLocalServer.js" || f === "src/battle/ui/BattleObserverHUD.jsx" || f === "src/battle/ui/BattleHeroSheet.jsx"
    || f === "src/screens/moba/TacticScreen.jsx"
    || f.startsWith("src/debug/") || f.startsWith("src/battle/ui/items/");
  ck("G13", "只有 LogicEngine（opt-in）、useLocalServer（開關保護）、DEV 工具與裝備 UI import items 模組", importers.every(allowedImporter) && importers.includes("src/LogicEngine.js"), importers.join(","));
  const callers = [];
  const walkCalls = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) { if (!["src/battle/moba/items", "src/debug"].includes(rel)) walkCalls(rel); }
      //  註解行不算呼叫（例如 simulationVersion.js 的版本判定說明）
      else if (/\.(jsx?|mjs)$/.test(e.name) && rel !== "src/LogicEngine.js"
        && /configureItems\s*\(|toEngineItems\s*\(/.test(read(rel).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n"))) callers.push(rel);
    }
  };
  walkCalls("src");
  //  M3a（Owner D1）：只允許 useLocalServer 在 itemsV1 開關保護下呼叫（正式開關預設 false）。
  const ulsCode = read("src/useLocalServer.js");
  const ulsGuarded = /itemsV1: false/.test(read("src/featureFlags.js"))
    && /featureEnabled\("itemsV1"\)\s*\|\|\s*\(import\.meta\.env\.DEV && itemsDevRequested\(\)\)/.test(ulsCode);
  const unguardedCallers = callers.filter((f) => !(f === "src/useLocalServer.js" && ulsGuarded));
  ck("G13", "正式流程只有 useLocalServer 在 itemsV1 開關保護下呼叫 configureItems（正式站預設 OFF）", unguardedCallers.length === 0, unguardedCallers.join(","));
  const simVer = read("src/platform/contracts/simulationVersion.js");
  const semanticsList = simVer.slice(simVer.indexOf("export const SIMULATION_SEMANTICS_FILES"), simVer.indexOf("]);", simVer.indexOf("export const SIMULATION_SEMANTICS_FILES")));
  ck("G13", "模擬版本仍是 moba-sim.v4，items 模組未列入語意清單（正式輸入到不了它們）", /MOBA_SIMULATION_VERSION = "moba-sim\.v4"/.test(simVer) && !/moba\/items/.test(semanticsList));
}

const byGate = {};
for (const r of results) {
  byGate[r.gate] ??= { pass: 0, total: 0 };
  byGate[r.gate].total++; if (r.pass) byGate[r.gate].pass++;
  console.log(`${r.pass ? "✅" : "❌"} [${r.gate}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
const passed = results.filter((r) => r.pass).length;
console.log("\n" + Object.entries(byGate).sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1))).map(([g, v]) => `${g} ${v.pass}/${v.total}`).join("  "));
const ok = passed === results.length;
console.log(`MOBA Items M1: ${passed}/${results.length} ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
