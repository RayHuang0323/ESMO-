// ============================================================================
//  battle/moba/items/buildPolicy.js — AI 出裝（決定性，M1）
//
//  規格：docs/design/MOBA_裝備系統_v1.md §7、docs/design/MOBA_裝備矩陣_v1.md §6。
//
//  【硬規則】
//   · 純函式、不使用任何亂數、不讀時間（t 由呼叫端傳入）、不改輸入。
//   · 出裝依英雄主定位（坦克／戰士／刺客／法師／射手／輔助）；starter 依席位。
//   · 只在開窗時被呼叫；一格路線開始合成就鎖定到完成（lock）。
//   · 目前批次以外的物品一律不會出現在決策裡（v1.0 不會買 v1.1-only 物品）。
//   · 平手一律以清單順序／目錄順序裁決。
// ============================================================================
import { ITEM_CATALOG, ITEM_IDS, LAUNCH_BATCH, batchAllows, getItem } from "./itemCatalog.js";
import { purchaseCost } from "./itemRecipes.js";
import { applyPurchase, inventoryIds } from "./itemInventory.js";
import { ARCHETYPES, DAMAGE_PROFILE_BY_ARCH, computeCombatStats } from "./combatStatsV1.js";
import { MILLI } from "./itemEconomy.js";

export const BUILD_POLICY_VERSION = "moba-build-policy.v1";
export const BUILD_STRATEGIES = Object.freeze(["standard", "early", "scaling", "counter", "survival"]);

export const PROFILE_THRESHOLDS = Object.freeze({
  adHeavyShare: 0.62,
  apHeavyShare: 0.45,       // adShare ≤ 0.45 ⇒ AP 重
  standardCount: 2,
  counterCount: 1,
  assassinBootsCount: 3,

  //  ── M4d：counter 偵測門檻 ────────────────────────────────────────────────
  //  全部取自實測分布 reports/moba-items-m4d/capability-distribution.json
  //  （tools/audit/moba_counter_thresholds.mjs）。
  //  【硬規則】門檻不得高於 v1 實際可達上限，否則就是死碼 —— 舊的 sustain 0.08
  //  正是踩到這點：v1 續航可達上限只有 0.07，該訊號從未成立過。
  tankArmor: 70,            // 坦克 3 件 80／滿裝 165；戰士 60、刺客 60、輔助 50 ⇒ 70 乾淨分離真前排
  tankMr: 60,               // 坦克 3 件 60／滿裝 85；法師滿裝 40、輔助 3 件 25
  //  ⚠ 不用 0.07：v1 續航分布是 {0, 0.07}，而 0.07 正是**每個法師的核心裝**生命法泉 ——
  //    普遍存在 ⇒ 毫無鑑別度，counter 策略（門檻 1 人）會在完全沒有治療陣容時誤觸發（實測）。
  //    0.10 對應 v1.1 的血誓長弓；v1 因此「無法單靠裝備構成回復威脅」，
  //    heal 訊號改由 healShieldPower（救贖之環 0.15）與 healer 標籤維持 —— 不是死碼。
  healSustain: 0.10,
  healShieldPower: 0.15,    // v1 分布 {0, 0.08(T2 組件), 0.15(救贖之環)} ⇒ 只認完成品
  //  ⚠ 這個門檻曾被我訂成 250（＝完成 3 件核心的法師），結果讓 M3 G11 變紅。
  //    differential debug（seed 42 / b1 / t=1092）證實：舊規則是「法師持有 ≥1 件 E 族 T3」，
  //    單件星隕法冠 ap = 110 × 1.2(apAmp) = 132（實測含組件 146）⇒ 第 1 件就觸發；
  //    250 等於把觸發點推遲到第 3 件，改變了雙方 situational.burst 的出裝並級聯成購買分岔。
  //    同一組 items 代入兩種規則：HEAD=1、250 版=0、130 版=1 ⇒ 130 才是原語意的忠實翻譯。
  burstAp: 130,
  //  ⚠ v1 暴擊可達上限 0.20。反暴擊 reduction 0.25 對 0.15／0.20 只減 6.2%／8.0% 攻擊通道傷害，
  //    要到約 0.40 才有 15% 減傷 ⇒ 本門檻在 v1 預期永不觸發，而那正是正確結果：
  //    收益不足就不該買，不為了觸發率去 buff 反暴擊數值。
  critChance: 0.40,
});

/**
 * 六定位路線（v1.0 可用裝備；`alt` 為 v1.1，批次過濾後自然消失）。
 * core 內的物件是「依局勢決定」的選位。
 */
export const BUILD_PATHS = Object.freeze({
  坦克: Object.freeze({
    starter: "st_blade",
    early: "t2_mail",
    core: Object.freeze([{ pick: "resistFirst" }, "t3_wardaltar", { pick: "resistSecond" }]),
    alt: Object.freeze(["t3_statue", "t3_colossus"]),
    boots: Object.freeze({ adHeavy: "bt_iron", apHeavy: "bt_quiet", default: "bt_focus" }),
    situational: Object.freeze({ heal: "t3_thornmail", burst: "t3_calmveil" }),
    lifeline: "t3_calmveil",
    fallback: Object.freeze(["t3_thornmail", "t3_bulwark", "t3_calmveil", "t3_wardaltar", "t3_vowshield", "t3_bloodplate"]),
  }),
  戰士: Object.freeze({
    starter: "st_blade",
    early: "t2_belt",
    core: Object.freeze(["t3_warbringer", "t3_unbroken", { pick: "fighterResist" }]),
    alt: Object.freeze(["t3_bloodforge", "t3_twinaxe", "t3_ragemaul"]),
    boots: Object.freeze({ adHeavy: "bt_iron", apHeavy: "bt_quiet", default: "bt_swift" }),
    situational: Object.freeze({ tanks: "t3_finalstring", heal: "t2_scythe" }),
    lifeline: "t3_unbroken",
    fallback: Object.freeze(["t3_bloodplate", "t3_shieldbreaker", "t3_finalstring", "t3_wardaltar", "t3_bulwark", "t3_stormfork"]),
  }),
  刺客: Object.freeze({
    starter: "st_blade",
    early: "t2_rend",
    core: Object.freeze(["t3_shadowblade", "t3_nightscythe", "t3_unbroken"]),
    alt: Object.freeze(["t3_headsman", "t3_ghostcloak"]),
    boots: Object.freeze({ adHeavy: "bt_iron", apHeavy: "bt_swift", default: "bt_swift" }),
    situational: Object.freeze({ tanks: "t3_finalstring", heal: "t2_scythe" }),
    tanksReplacesCore: 1,
    lifeline: "t3_unbroken",
    fallback: Object.freeze(["t3_finalstring", "t3_bloodplate", "t3_nightscythe", "t3_stormfork", "t3_bulwark"]),
  }),
  法師: Object.freeze({
    starter: "st_tome",
    early: "t2_core",
    core: Object.freeze(["t3_starcrown", "t3_voidstaff", "t3_lifespring"]),
    alt: Object.freeze(["t3_scorchtome", "t3_thunderorb"]),
    boots: Object.freeze({ adHeavy: "bt_arcane", apHeavy: "bt_quiet", default: "bt_arcane" }),
    situational: Object.freeze({ heal: "t3_soulrend", burst: "t3_psyward" }),
    lifeline: "t3_psyward",
    fallback: Object.freeze(["t3_frostcrown", "t3_psyward", "t3_soulrend", "t3_torrent", "t3_calmveil"]),
  }),
  射手: Object.freeze({
    starter: "st_blade",
    early: "t2_gale",
    core: Object.freeze(["t3_dawnbow", "t3_stormfork", "t3_pierce"]),
    alt: Object.freeze(["t3_hunter", "t3_reaper"]),
    boots: Object.freeze({ adHeavy: "bt_swift", apHeavy: "bt_swift", default: "bt_swift", assassinDive: "bt_iron" }),
    situational: Object.freeze({ heal: "t3_rendspear", tanks: "t3_shieldbreaker" }),
    tanksReplacesCore: 1,
    lifeline: "t3_unbroken",
    fallback: Object.freeze(["t3_shieldbreaker", "t3_rendspear", "t3_torrent", "t3_unbroken", "t3_bulwark"]),
  }),
  輔助: Object.freeze({
    starter: "st_tithe",
    early: "t2_halo",
    core: Object.freeze(["t3_vowshield", "t3_wardaltar", "t3_redemption"]),
    alt: Object.freeze(["t3_warhorn"]),
    boots: Object.freeze({ adHeavy: "bt_iron", apHeavy: "bt_focus", default: "bt_focus" }),
    situational: Object.freeze({ heal: "t3_thornmail", burst: "t3_calmveil" }),
    lifeline: "t3_vowshield",
    fallback: Object.freeze(["t3_frostcrown", "t3_calmveil", "t3_bulwark", "t3_thornmail", "t3_lifespring"]),
  }),
});

const LUXURY = Object.freeze({ 射手: "t3_dawnbow", 法師: "t3_starcrown" });

/**
 * 敵方陣容 profile（全部由呼叫端傳入的凍結資料計算）。
 * @param enemies [{ arch, healer: boolean, items: string[] }]
 */
export function enemyProfile(enemies, catalog = ITEM_CATALOG, batch = LAUNCH_BATCH) {
  const n = Math.max(1, enemies.length);
  const adShare = enemies.reduce((s, e) => s + (DAMAGE_PROFILE_BY_ARCH[e.arch]?.phys ?? 0.5), 0) / n;
  const T = PROFILE_THRESHOLDS;

  //  M4d：威脅一律先讀敵方的**真實 capability**（CombatStatsV1 ＋ effects）。
  //  arch／healer 標籤只保留為 fallback —— 敵方還沒買裝備時（開局第一個購買窗、
  //  空背包 fixture）capability 全為 0，這時才靠標籤判斷，否則開局會完全看不到威脅。
  const caps = enemies.map((e) => computeCombatStats(e.items ?? [], { catalog, batch }));
  //  ⚠ 只看護甲：tanks 情境裝買的是**穿甲**，用魔抗判定就是張冠李戴 ——
  //    實測魔抗 85 的輔助會被算成前排，害穿甲裝打在脆皮身上，還會吃掉唯一的提前額度。
  //    魔抗另計於 mrCount（對應法穿，v1 只有法師的虛空裂杖，且它本來就是核心裝）。
  const isTank = (c) => c.armor >= T.tankArmor;
  const isHeal = (c) => c.lifesteal + c.omnivamp >= T.healSustain || c.healShieldPower >= T.healShieldPower;
  //  物理爆發仍只用 刺客 標籤 fallback：舊規則就是如此，而我一度自行加上
  //  armorPenFlat >= 15 的偵測 —— 那是超出「最小修正」的擴張面，已移除（列為 v1.1 候選）。
  const isBurst = (c) => c.ap >= T.burstAp;

  //  *Real 系列＝只由 capability 判定（不含標籤）。嚴重度用它，避免標籤把 normal 灌成 hard。
  const tankReal = caps.filter(isTank).length;
  const healReal = caps.filter(isHeal).length;
  const tankCount = enemies.filter((e, i) => isTank(caps[i]) || e.arch === "坦克").length;
  const healCount = enemies.filter((e, i) => isHeal(caps[i]) || e.healer).length;
  const burstCount = enemies.filter((e, i) => isBurst(caps[i]) || e.arch === "刺客").length;
  const assassinCount = enemies.filter((e) => e.arch === "刺客").length;
  const critMax = caps.reduce((m, c) => Math.max(m, c.critChance), 0);
  const shieldCount = caps.filter((c) => c.effects.some((x) => x.type === "LOW_HP_SHIELD")).length;
  const mrCount = caps.filter((c) => c.mr >= T.tankMr).length;

  return {
    adShare: Math.round(adShare * 1000) / 1000,
    adHeavy: adShare >= T.adHeavyShare,
    apHeavy: adShare <= T.apHeavyShare,
    tankCount, healCount, burstCount, assassinCount,
    //  ── M4d 新增欄位（純增量，既有欄位語意不變）──
    //  hard ⇒ 威脅明確（capability 判定達 standardCount），允許提前到最早第 2 件。
    tankHard: tankReal >= T.standardCount,
    healHard: healReal >= T.standardCount,
    //  暴擊：偵測是真的，但 v1 打不到門檻 ⇒ critCount 恆為 0，AI 正確地不買反暴擊裝。
    critMax: Math.round(critMax * 1000) / 1000,
    critCount: caps.filter((c) => c.critChance >= T.critChance).length,
    //  魔抗：對應法穿。v1 只有法師的虛空裂杖，而它本來就在核心序列裡 ⇒ 只記錄，不另外提前。
    mrCount,
    //  低血護盾：v1 沒有任何反制手段（無削盾屬性、無反護盾 primitive）⇒ 只記錄，留給 v1.1。
    shieldCount,
  };
}

const allowed = (id, batch, catalog) => !!getItem(id, catalog) && batchAllows(getItem(id, catalog).batch, batch);

function resolvePick(pick, prof) {
  switch (pick) {
    case "resistFirst": return prof.adHeavy ? "t3_bulwark" : "t3_calmveil";
    case "resistSecond": return prof.adHeavy ? "t3_calmveil" : "t3_bulwark";
    case "fighterResist": return prof.apHeavy ? "t3_calmveil" : "t3_bloodplate";
    default: return null;
  }
}

function starterFor(path, seatRole) {
  if (seatRole === "jungle") return "st_hunter";
  if (seatRole === "sup") return "st_tithe";
  return path.starter === "st_tithe" ? "st_blade" : path.starter;
}

function bootsFor(path, prof) {
  if (path.boots.assassinDive && prof.assassinCount >= PROFILE_THRESHOLDS.assassinBootsCount) return path.boots.assassinDive;
  if (prof.adHeavy) return path.boots.adHeavy;
  if (prof.apHeavy) return path.boots.apHeavy;
  return path.boots.default;
}

/**
 * 依定位／策略／陣容排出完整目標順序（不看金錢）。
 * @returns {{ targets: string[], reasons: string[] }}
 */
export function buildTargets({ arch, seatRole, strategy = "standard", enemies = [], batch = LAUNCH_BATCH, catalog = ITEM_CATALOG }) {
  const path = BUILD_PATHS[arch];
  if (!path) throw new Error(`buildPolicy：未知定位 ${arch}`);
  if (!BUILD_STRATEGIES.includes(strategy)) throw new Error(`buildPolicy：未知策略 ${strategy}`);
  //  batch 要一路傳下去：enemyProfile 現在會算敵方 CombatStats，而批次不符的物品會 throw。
  const prof = enemyProfile(enemies, catalog, batch);
  const reasons = [`arch:${arch}`, `strategy:${strategy}`, `adShare:${prof.adShare}`];
  const need = strategy === "counter" ? PROFILE_THRESHOLDS.counterCount : PROFILE_THRESHOLDS.standardCount;

  const core = path.core.map((c) => (typeof c === "string" ? c : resolvePick(c.pick, prof)));
  //  情境（固定優先序：治療 > 爆發 > 坦克）
  const situ = [];
  //  severity 與 situ 同序：hard ⇒ 最早可到第 2 件；normal ⇒ 最早第 3 件。
  const severity = [];
  //  M4d：每位玩家最多只提前 1 件情境裝，避免多個 counter 吃掉整套 core build。
  let promoted = false;
  if (path.situational.heal && prof.healCount >= need) {
    situ.push(path.situational.heal); severity.push(prof.healHard ? "hard" : "normal");
    reasons.push(`enemyHeal:${prof.healCount}>=${need}`);
  }
  if (path.situational.burst && prof.burstCount >= need) {
    situ.push(path.situational.burst); severity.push("normal");
    reasons.push(`enemyBurst:${prof.burstCount}>=${need}`);
  }
  if (path.situational.tanks && prof.tankCount >= need) {
    if (path.tanksReplacesCore !== undefined) {
      core.splice(path.tanksReplacesCore, 0, path.situational.tanks);
      reasons.push(`enemyTanks:${prof.tankCount}>=${need}→core${path.tanksReplacesCore + 1}`);
      promoted = true;
    } else {
      situ.push(path.situational.tanks); severity.push(prof.tankHard ? "hard" : "normal");
      reasons.push(`enemyTanks:${prof.tankCount}>=${need}`);
    }
  }
  //  ⚠ 已試過並回退：把 counter 提到 core index 0（想與 standard 的 hard 提前拉開差距）。
  //    實測 M3 G11 完全沒有改善（purchasesSame=counter 的 detail 一字未變），
  //    因為兩者的差異落在「2400 tick 內還沒買到的尾段」，與插入索引無關；
  //    而改動連帶的文案修改又打破 G9 的教練分析斷言。⇒ counter 維持 core index 1。
  if (strategy === "counter" && situ.length) {
    core.splice(1, 0, ...situ.splice(0, 1)); severity.shift(); promoted = true;
    reasons.push("counter:situational→core2");
  }
  //  M4d 可達性：明確 counter 成立時，把優先序最高的情境裝提前進 core。
  //  在此之前，情境裝一律排在 core ＋ 靴之後（第 4 順位起），而 v1 每人平均只完成
  //  2.4–3 件 T3 ⇒ 等同買不到。hard ⇒ core index 1（最早第 2 件）、normal ⇒ index 2（最早第 3 件）。
  //  已由 tanksReplacesCore 或 counter 策略提前過就不再提前（每人上限 1 件）。
  if (!promoted && situ.length) {
    const at = Math.min(severity[0] === "hard" ? 1 : 2, core.length);
    const id = situ.shift(); severity.shift();
    core.splice(at, 0, id);
    promoted = true;
    reasons.push(`counterPromote:${id}→core${at + 1}`);
  }
  if (strategy === "survival" && path.lifeline) {
    const i = core.indexOf(path.lifeline);
    if (i !== 1) { if (i >= 0) core.splice(i, 1); core.splice(1, 0, path.lifeline); }
    reasons.push("survival:lifeline→core2");
  }
  if (strategy === "scaling" && LUXURY[arch]) {
    const i = core.indexOf(LUXURY[arch]);
    if (i > 0) { core.splice(i, 1); core.unshift(LUXURY[arch]); }
    reasons.push("scaling:luxury→core1");
  }

  const bootsUp = bootsFor(path, prof);
  const seq = [starterFor(path, seatRole)];
  if (strategy === "early") seq.push(path.early);
  seq.push("bt_base");
  core.forEach((id, i) => {
    seq.push(id);
    if ((strategy === "scaling" ? i === 1 : i === 0)) seq.push(bootsUp);
  });
  seq.push(...situ, ...path.alt, ...path.fallback);

  //  過濾：批次、去重、unique group 衝突（依清單順序保留先出現者）
  const earlyComponent = strategy === "early" && allowed(path.early, batch, catalog) ? path.early : null;
  const targets = [];
  const groups = new Set();
  let finals = 0;
  for (const id of seq) {
    if (!id || targets.includes(id) || !allowed(id, batch, catalog)) continue;
    const it = getItem(id, catalog);
    if (it.unique && groups.has(it.unique)) continue;
    //  前期組件會被核心裝消耗，不是最終物品 ⇒ 不佔 5 件最終物品的額度。
    if ((it.tier === "T3" || it.tier === "T2") && id !== earlyComponent) {
      if (finals >= 5) continue;   // 6 格 = 1 雙靴 ＋ 5 件最終物品（starter 會被丟棄）
      finals++;
    }
    if (it.unique) groups.add(it.unique);
    targets.push(id);
  }
  return { targets, reasons, profile: prof, earlyComponent };
}

/** 物品的整棵合成樹是否包含 compId。 */
function treeContains(itemId, compId, catalog) {
  return getItem(itemId, catalog).components.some((c) => c === compId || treeContains(c, compId, catalog));
}

/** 目標是否已滿足。 */
function satisfied(id, inv, history, catalog, earlyComponent = null) {
  const owned = inventoryIds(inv);
  if (owned.includes(id)) return true;
  const it = getItem(id, catalog);
  if (it.tier === "STARTER") return !!history.starterPurchased;
  if (id === "bt_base") return owned.some((o) => getItem(o, catalog)?.tier === "BOOTS");
  //  前期組件一旦被合成進身上的物品，就算已完成，不會再買一次。
  if (id === earlyComponent) return owned.some((o) => treeContains(o, id, catalog));
  return false;
}

/** 目標缺的組件（遞迴、依合成順序），不含已擁有者。 */
function missingComponents(id, inv, catalog) {
  const owned = [...inventoryIds(inv)];
  const out = [];
  const walk = (itemId) => {
    for (const c of getItem(itemId, catalog).components) {
      const k = owned.indexOf(c);
      if (k >= 0) { owned.splice(k, 1); continue; }
      out.push(c);
      walk(c);
    }
  };
  walk(id);
  return out;
}

/**
 * 下一步要買什麼（一次只回一步；呼叫端在開窗內反覆呼叫直到 stop）。
 * @param input.unspentMilli  可用金錢（milli）
 * @param input.lock          上一步留下的鎖定 { targetId } 或 null
 * @param input.history       { starterPurchased }
 * @param input.state         { deathsRecent, kd, teamGoldDiff }
 * @returns {{ action: "buy"|"stop", itemId, targetId, lock, reasons }}
 */
export function nextStep(input) {
  const {
    arch, seatRole, strategy = "standard", enemies = [], inventory, unspentMilli,
    lock = null, history = {}, state = {}, t = 0, batch = LAUNCH_BATCH, catalog = ITEM_CATALOG,
  } = input;
  const { targets, reasons: base, earlyComponent } = buildTargets({ arch, seatRole, strategy, enemies, batch, catalog });
  const reasons = [...base];
  const gold = Math.floor(unspentMilli / MILLI);
  let pending = targets.filter((id) => !satisfied(id, inventory, history, catalog, earlyComponent));

  //  狀態調整（只在沒有鎖定時改變下一個目標）
  const locked = lock?.targetId && pending.includes(lock.targetId) ? lock.targetId : null;
  if (!locked) {
    const path = BUILD_PATHS[arch];
    const promote = (id, why) => {
      const i = pending.indexOf(id);
      if (i > 0) { pending.splice(i, 1); pending.unshift(id); reasons.push(why); }
    };
    if ((arch === "戰士" || arch === "刺客") && (state.deathsRecent ?? 0) >= 2 && path.lifeline) promote(path.lifeline, `deathsRecent:${state.deathsRecent}→lifeline`);
    if ((state.teamGoldDiff ?? 0) <= -3000 && t >= 600 && t <= 1200) {
      const coreLeft = pending.filter((id) => getItem(id, catalog).tier === "T3").slice(0, 3);
      const cheapest = [...coreLeft].sort((a, b) => getItem(a, catalog).price - getItem(b, catalog).price || ITEM_IDS.indexOf(a) - ITEM_IDS.indexOf(b))[0];
      if (cheapest) promote(cheapest, "behindGold→cheapestCore");
    }
    if (t > 1200 && (state.kd ?? 0) >= 3 && LUXURY[arch]) promote(LUXURY[arch], `lateKd:${state.kd}→luxury`);
  } else {
    pending = [locked, ...pending.filter((id) => id !== locked)];
    reasons.push(`lock:${locked}`);
  }

  for (const target of pending) {
    //  目標本身買得起、放得下 ⇒ 直接買（含合成）
    const direct = purchaseCost(target, inventory.slots, catalog);
    const directFits = applyPurchase(inventory, target, direct.consumedSlots, catalog);
    if (!directFits.ok && directFits.reason !== "slot_full") { reasons.push(`skip:${target}:${directFits.reason}`); continue; }
    if (directFits.ok && direct.cost <= gold) {
      return { action: "buy", itemId: target, targetId: target, lock: null, reasons };
    }
    //  否則買最貴且買得起、放得下的缺件（同價依合成順序）
    const candidates = missingComponents(target, inventory, catalog)
      .map((id, order) => ({ id, order, price: getItem(id, catalog).price }))
      .sort((a, b) => b.price - a.price || a.order - b.order);
    for (const c of candidates) {
      const cost = purchaseCost(c.id, inventory.slots, catalog);
      if (cost.cost > gold) continue;
      if (!applyPurchase(inventory, c.id, cost.consumedSlots, catalog).ok) continue;
      return { action: "buy", itemId: c.id, targetId: target, lock: { targetId: target }, reasons };
    }
    //  買不起任何一步 ⇒ 停在這個目標（不跳買後面的東西）。
    //  身上已經有這個目標的組件 ⇒ 保持鎖定，下次開窗繼續同一條路線。
    const started = inventoryIds(inventory).some((id) => treeContains(target, id, catalog));
    return { action: "stop", itemId: null, targetId: target, lock: started ? { targetId: target } : null, reasons: [...reasons, `insufficient:${target}`] };
  }
  return { action: "stop", itemId: null, targetId: null, lock: null, reasons: [...reasons, "complete"] };
}

export { ARCHETYPES };
