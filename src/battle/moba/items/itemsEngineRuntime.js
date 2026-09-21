// ============================================================================
//  battle/moba/items/itemsEngineRuntime.js — 裝備系統的引擎內狀態與規則（M2）
//
//  LogicEngine 只在 `this.itemsOn` 時呼叫本檔；不呼叫 configureItems ⇒ 本檔完全不會被執行。
//  契約：docs/architecture/MOBA_戰鬥屬性契約_v1.md、docs/architecture/MOBA_裝備UI資料契約_v1.md。
//
//  【硬規則】
//   · 決定性：不使用任何亂數、不讀時間（t 由引擎傳入）；多人處理一律依席位順序 b1→b5、r1→r5。
//   · 不 import LogicEngine：需要引擎動作時由引擎傳入 callback（例如 applyLevel）。
//   · 會修改的引擎欄位只有英雄的 hp、shield／shieldUntil、heal（治療統計）——與既有技能層同一組。
//   · 收入數值鏡像 legacy（itemEconomy.INCOME_V1），M2 不調收入、不調 dmgK。
// ============================================================================
import { ITEM_CATALOG, ITEM_CATALOG_VERSION, LAUNCH_BATCH, getItem } from "./itemCatalog.js";
import { emptyInventory, inventoryIds } from "./itemInventory.js";
import { INCOME_V1, MILLI, SHOP_WINDOWS, createLedger, earn, purchase, splitMilli, totalEarnedMilli } from "./itemEconomy.js";
import { BUILD_POLICY_VERSION, BUILD_STRATEGIES, buildTargets, nextStep } from "./buildPolicy.js";
import { COMBAT_STATS_SCHEMA, DAMAGE_PROFILE_BY_ARCH, computeCombatStats } from "./combatStatsV1.js";
import { antiCritOf, auraTotals, lifestealHeal, lowHpShield, mitigate, omnivampHeal, outgoingDamage } from "./itemEffects.js";
import { purchaseCost } from "./itemRecipes.js";

export const ITEMS_RUNTIME_VERSION = "moba-items.runtime.v1";
export const ITEMS_SNAPSHOT_SCHEMA = "MobaItemsSnapshot.v1";

const PURCHASE_RING = 40;
const MAX_STEPS_PER_WINDOW = 16;
/** 裝備護盾持續秒數（草案；M3 校準）。 */
export const ITEM_SHIELD_DURATION = 3;
/** 依席位補定位（roster 缺英雄資料時的決定性 fallback）。 */
const FALLBACK_ARCH_BY_ROLE = Object.freeze({ top: "戰士", jungle: "刺客", mid: "法師", adc: "射手", sup: "輔助" });

const seatRank = (id) => (String(id)[0] === "b" ? 0 : 10) + Number(String(id).slice(1));
const bySeat = (a, b) => seatRank(a.id) - seatRank(b.id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const effectsOf = (cs, type) => cs.effects.filter((e) => e.type === type);

export class ItemsEngineRuntime {
  /**
   * @param players 引擎英雄物件（只讀 id／side／role）
   * @param config  { [playerId]: { arch, healer, strategy, heroId } }
   * @param radii   { minion, tower, camp }（沿用引擎 XP 的歸屬半徑）
   */
  constructor({ players, config = {}, batch = LAUNCH_BATCH, catalog = ITEM_CATALOG, radii, meta = null, incomeMultiplier = 1 }) {
    //  M4b：個人收入統一倍率（所有收入來源同乘；開局金錢不乘）。預設 1 ⇒ 與 M4a 逐位元相同。
    this.incomeK = Number.isFinite(incomeMultiplier) && incomeMultiplier > 0 ? incomeMultiplier : 1;
    this.batch = batch;
    this.catalog = catalog;
    this.radii = radii;
    this.meta = meta;
    this.seq = 0;
    this.purchases = [];
    this.counters = {
      purchases: 0, rejected: 0, hits: 0, mitigatedHits: 0, lifestealHeal: 0, omnivampHeal: 0,
      grievousApplied: 0, slowsApplied: 0, lowHpShields: 0, allyShields: 0, magicShieldAbsorbed: 0, auraActive: 0,
    };
    this.ps = new Map();
    for (const p of [...players].sort(bySeat)) {
      const c = config[p.id] ?? {};
      const arch = DAMAGE_PROFILE_BY_ARCH[c.arch] ? c.arch : FALLBACK_ARCH_BY_ROLE[p.role];
      this.ps.set(p.id, {
        id: p.id, side: p.side, seatRole: p.role, arch, heroId: c.heroId ?? null,
        archSource: DAMAGE_PROFILE_BY_ARCH[c.arch] ? "hero" : "seatFallback",
        healer: !!c.healer,
        strategy: BUILD_STRATEGIES.includes(c.strategy) ? c.strategy : "standard",
        profile: DAMAGE_PROFILE_BY_ARCH[arch],
        ledger: createLedger(), inventory: emptyInventory(),
        lock: null, history: { starterPurchased: false },
        cs: computeCombatStats([], { catalog, batch }),
        plan: null, reasons: [], lastWindow: null,
        shieldReadyAt: {}, magicShield: { amount: 0, until: 0 },
        grievous: { cut: 0, until: 0 }, slow: { k: 0, until: 0 },
        aura: { armor: 0, mr: 0, moveSpeed: 0 },
        inFountain: false,
      });
    }
  }

  // ── 查詢 ─────────────────────────────────────────────────────────────────
  stateOf(id) { return this.ps.get(id) ?? null; }
  hpBonus(id) { return this.ps.get(id)?.cs.hp ?? 0; }
  regenBonus(p) { return this.ps.get(p.id)?.cs.regenPctPerSec ?? 0; }
  hspK(p) { return 1 + (this.ps.get(p.id)?.cs.healShieldPower ?? 0); }
  earnedGold(id) { const s = this.ps.get(id); return s ? totalEarnedMilli(s.ledger) / MILLI : 0; }
  teamGoldMilli(side) {
    let sum = 0;
    for (const s of this.ps.values()) if (s.side === side) sum += s.ledger.startMilli + totalEarnedMilli(s.ledger);
    return sum;
  }
  teamGold(side) { return this.teamGoldMilli(side) / MILLI; }
  campDamageK(p) {
    const e = effectsOf(this.ps.get(p.id)?.cs ?? { effects: [] }, "ROLE_CAMP_DAMAGE")[0];
    return e ? 1 + e.params.campDamageBonus : 1;
  }
  /** 回復倍率：與既有點燃減療取較強者（不相加）。 */
  healK(p, t, legacyHealK) {
    const g = this.ps.get(p.id)?.grievous;
    return g && t < g.until ? Math.min(legacyHealK, 1 - g.cut) : legacyHealK;
  }
  /** 移速倍率：裝備移速＋光環；緩速與紅 Buff 緩速取較強者（不相乘）。 */
  moveK(p, t, redSlowActive, redSlowK) {
    const s = this.ps.get(p.id);
    if (!s) return 1;
    let k = 1 + s.cs.moveSpeed + s.aura.moveSpeed;
    if (t < s.slow.until) {
      const itemK = 1 - s.slow.k;
      k *= redSlowActive ? Math.min(1, itemK / redSlowK) : itemK;
    }
    return k;
  }

  // ── 收入（整數 milli-gold；鏡像 legacy 數值）───────────────────────────────
  _earn(id, source, milli) {
    const s = this.ps.get(id);
    const m = this.incomeK === 1 ? milli : Math.round(milli * this.incomeK);
    if (s && m > 0) s.ledger = earn(s.ledger, source, m);
  }
  _split(ids, source, totalMilli) {
    for (const [id, milli] of splitMilli(totalMilli, ids)) this._earn(id, source, milli);
  }
  earnPassive(players, t, dt) {
    if (t < INCOME_V1.passiveStartSec) return;
    const base = Math.round(INCOME_V1.passivePerSec * dt * MILLI);
    for (const p of [...players].sort(bySeat)) {
      this._earn(p.id, "passive", base);
      const tithe = effectsOf(this.ps.get(p.id).cs, "ROLE_INCOME_TITHE")[0];
      if (tithe) this._earn(p.id, "tithe", Math.round(tithe.params.passivePerSec * dt * MILLI));
    }
  }
  earnMinion(side, pos, players) {
    const recipients = players.filter((q) => q.side === side && !q.dead && dist(q.pos, pos) < this.radii.minion).sort(bySeat);
    if (!recipients.length) return;
    for (const [id, milli] of splitMilli(INCOME_V1.minion * MILLI, recipients.map((q) => q.id))) {
      const tithe = effectsOf(this.ps.get(id).cs, "ROLE_INCOME_TITHE")[0];
      if (!tithe) { this._earn(id, "minion", milli); continue; }
      //  守護徽章：自己小兵分成的一部分轉給最近的己方英雄（同距離依席位）。
      const giveTo = players.filter((q) => q.side === side && q.id !== id && !q.dead)
        .sort((a, b) => dist(a.pos, pos) - dist(b.pos, pos) || seatRank(a.id) - seatRank(b.id))[0];
      const moved = giveTo ? Math.floor(milli * tithe.params.minionShareTransfer) : 0;
      this._earn(id, "minion", milli - moved);
      if (moved) this._earn(giveTo.id, "minion", moved);
    }
  }
  earnKill(killer, assistIds) {
    this._earn(killer.id, "kill", INCOME_V1.kill * MILLI);
    const ids = [...assistIds].sort((a, b) => seatRank(a) - seatRank(b));
    if (ids.length) this._split(ids, "assist", INCOME_V1.assistPool * MILLI);
  }
  earnTower(side, pos, players) {
    const team = players.filter((q) => q.side === side).sort(bySeat);
    const near = team.filter((q) => !q.dead && dist(q.pos, pos) < this.radii.tower);
    this._split((near.length ? near : team).map((q) => q.id), "tower", INCOME_V1.tower * MILLI);
  }
  earnObjective(side, key, players) {
    const team = players.filter((q) => q.side === side).sort(bySeat);
    const alive = team.filter((q) => !q.dead);
    const gold = key === "baron" ? INCOME_V1.baron : INCOME_V1.dragon;
    this._split((alive.length ? alive : team).map((q) => q.id), key, gold * MILLI);
  }
  earnCamp(side, pos, goldAmount, alive) {
    const recipients = alive.filter((q) => q.side === side && dist(q.pos, pos) <= this.radii.camp).sort(bySeat);
    if (recipients.length) this._split(recipients.map((q) => q.id), "camp", Math.round(goldAmount * MILLI));
  }

  // ── 購買窗 ───────────────────────────────────────────────────────────────
  _enemies(s) {
    return [...this.ps.values()].filter((o) => o.side !== s.side)
      .map((o) => ({ arch: o.arch, healer: o.healer, items: inventoryIds(o.inventory) }));
  }
  _aiState(p, s, t) {
    const other = s.side === "blue" ? "red" : "blue";
    return {
      deathsRecent: (p.deathsT ?? []).filter((d) => t - d <= 180).length,
      kd: r1(p.k / Math.max(1, p.d)),
      teamGoldDiff: Math.round((this.teamGoldMilli(s.side) - this.teamGoldMilli(other)) / MILLI),
    };
  }
  _pushEvent(e) {
    this.purchases.push(e);
    if (this.purchases.length > PURCHASE_RING) this.purchases.shift();
    this.counters.purchases++;
  }

  /**
   * 開窗：反覆「決策 → 交易」直到停止。
   * @param kind       "spawn" | "respawn" | "recallArrive" | "fountain"（Q3：走路進泉水）
   * @param applyLevel 引擎的 _applyMatchLevel（最大生命加上裝備生命、補上新增的那段血）
   */
  shopWindow(p, kind, t, applyLevel) {
    const s = this.ps.get(p.id);
    if (!s || p.dead || !SHOP_WINDOWS.includes(kind)) return;
    const enemies = this._enemies(s);
    const state = this._aiState(p, s, t);
    let changed = false, last = null;
    for (let i = 0; i < MAX_STEPS_PER_WINDOW; i++) {
      const d = nextStep({
        arch: s.arch, seatRole: s.seatRole, strategy: s.strategy, enemies, inventory: s.inventory,
        unspentMilli: s.ledger.unspentMilli, lock: s.lock, history: s.history, state, t,
        batch: this.batch, catalog: this.catalog,
      });
      s.lock = d.lock; last = d;
      if (d.action !== "buy") break;
      const r = purchase({
        ledger: s.ledger, inventory: s.inventory, itemId: d.itemId, window: kind,
        batch: this.batch, seatRole: s.seatRole, t, playerId: s.id, catalog: this.catalog,
      });
      if (!r.ok) { this.counters.rejected++; last = { ...d, reasons: [...d.reasons, `rejected:${r.reason}`] }; break; }
      s.ledger = r.ledger; s.inventory = r.inventory; changed = true;
      if (getItem(d.itemId, this.catalog).tier === "STARTER") s.history = { ...s.history, starterPurchased: true };
      for (const e of r.events) {
        this._pushEvent({
          seq: this.seq++, t: r1(t), playerId: s.id, window: kind, action: e.action, itemId: e.itemId,
          cost: e.cost, consumed: e.consumed ?? [], unspentAfter: Math.floor(e.unspentAfter / MILLI), targetId: d.targetId,
        });
      }
    }
    s.reasons = last?.reasons ?? [];
    s.lastWindow = { kind, t: r1(t) };
    //  復活／回城都落在泉水 ⇒ 標記「已在泉水」，下一 tick 的走路進泉水窗不會重複開。
    if (kind !== "spawn") s.inFountain = true;
    if (changed) {
      s.cs = computeCombatStats(s.inventory.slots, { catalog: this.catalog, batch: this.batch });
      applyLevel(p);
    }
    const { targets } = buildTargets({ arch: s.arch, seatRole: s.seatRole, strategy: s.strategy, enemies, batch: this.batch, catalog: this.catalog });
    const targetId = last?.targetId ?? null;
    s.plan = {
      targetId,
      targetRemainingCost: targetId ? purchaseCost(targetId, s.inventory.slots, this.catalog).cost : null,
      lockedTargetId: s.lock?.targetId ?? null,
      buildPath: targets,
      complete: last?.action === "stop" && targetId === null,
    };
  }

  /** Q3：走路進泉水（離開 → 進入的那一 tick）開窗；待在泉水裡不重複開。 */
  fountainEdge(p, inFountain, t, applyLevel) {
    const s = this.ps.get(p.id);
    if (!s) return;
    const entered = inFountain && !s.inFountain;
    s.inFountain = inFountain;
    if (entered) this.shopWindow(p, "fountain", t, applyLevel);
  }

  /**
   * 驗證器／DEV Inspector 專用：直接把背包設成指定裝備（不經帳本、不產生購買事件）。
   * ⚠ 正式流程不得呼叫（tools/check_moba_items_m2.mjs G8 掃描）。
   */
  debugSetInventory(p, itemIds, applyLevel) {
    const s = this.ps.get(p.id);
    s.inventory = { slots: [...itemIds, null, null, null, null, null, null].slice(0, 6) };
    s.cs = computeCombatStats(s.inventory.slots, { catalog: this.catalog, batch: this.batch });
    applyLevel(p);
  }

  /** 出生窗（configureItems 當下、第一個 tick 之前）。 */
  spawnAll(players, t, applyLevel) {
    for (const p of [...players].sort(bySeat)) this.shopWindow(p, "spawn", t, applyLevel);
  }

  // ── 戰鬥 ─────────────────────────────────────────────────────────────────
  /** 每 tick 開頭：光環（固定席位順序、同 group 不疊加）。 */
  beginTick(players) {
    for (const p of [...players].sort(bySeat)) {
      const s = this.ps.get(p.id);
      if (p.dead) { s.aura = { armor: 0, mr: 0, moveSpeed: 0 }; continue; }
      const sources = [];
      for (const q of players) {
        if (q.side !== p.side || q.dead) continue;
        for (const e of effectsOf(this.ps.get(q.id).cs, "AURA")) {
          if (dist(q.pos, p.pos) <= e.params.radius) sources.push({ effect: e, group: e.params.moveSpeed ? "AURA:moveSpeed" : "AURA:resist" });
        }
      }
      s.aura = sources.length ? auraTotals(sources) : { armor: 0, mr: 0, moveSpeed: 0 };
      if (sources.length) this.counters.auraActive++;
    }
  }

  /**
   * 英雄對英雄的一次傷害：D0 = LogicEngine 原本的 dmgAmt（一個係數都不改）。
   * @returns hit { phys, magic, physAttack, physTaken, magicTaken, physAttackTaken, total }
   */
  resolveHit(p, foe, D0, dt, lateFactor) {
    const a = this.ps.get(p.id), d = this.ps.get(foe.id);
    const out = outgoingDamage({
      D0, cs: a.cs, profile: a.profile,
      foe: { hp: foe.hp, maxHp: foe.maxHp, antiCrit: antiCritOf(d.cs) }, dt, lateFactor,
    });
    const m = mitigate({ phys: out.phys, magic: out.magic, attackerCs: a.cs, defenderCs: d.cs, aura: d.aura });
    this.counters.hits++;
    if (m.effArmor > 0 || m.effMr > 0) this.counters.mitigatedHits++;
    const physAttackTaken = out.phys > 0 ? m.physTaken * (out.physAttack / out.phys) : 0;
    return {
      attackerId: p.id, phys: out.phys, magic: out.magic, physAttack: out.physAttack,
      physTaken: m.physTaken, magicTaken: m.magicTaken, physAttackTaken, total: m.physTaken + m.magicTaken,
    };
  }

  /** Authored ability damage is already scaled by its gameplay rule; do not run the
   *  attack/profile multiplier a second time. Reuse Item resist, aura and shield
   *  channels so an ability hit participates in the same defensive contract. */
  resolveAbilityHit(p, foe, amount, damageType) {
    const a = this.ps.get(p.id), d = this.ps.get(foe.id);
    const phys = damageType === 'physical' ? amount : 0;
    const magic = damageType === 'magic' ? amount : 0;
    const trueTaken = damageType === 'true' ? amount : 0;
    const m = mitigate({ phys, magic, attackerCs: a.cs, defenderCs: d.cs, aura: d.aura });
    this.counters.hits++;
    if ((phys && m.effArmor > 0) || (magic && m.effMr > 0)) this.counters.mitigatedHits++;
    return {
      attackerId: p.id, phys, magic, trueDamage: trueTaken, physAttack: 0,
      physTaken: m.physTaken, magicTaken: m.magicTaken, trueTaken,
      physAttackTaken: 0, total: m.physTaken + m.magicTaken + trueTaken,
    };
  }

  /** 結算扣血：只擋法傷的護盾 → 一般護盾（與召喚師屏障共用）→ 血量。 */
  applyDamage(foe, hit, t) {
    const d = this.ps.get(foe.id);
    let magic = hit.magicTaken, phys = hit.physTaken;
    if (d.magicShield.amount > 0 && t < d.magicShield.until) {
      const absorbed = Math.min(d.magicShield.amount, magic);
      d.magicShield.amount -= absorbed; magic -= absorbed;
      this.counters.magicShieldAbsorbed += absorbed;
    }
    let rest = phys + magic;
    if (hit.trueTaken) rest += hit.trueTaken;
    if (foe.shield > 0 && t < foe.shieldUntil) {
      const absorbed = Math.min(foe.shield, rest);
      foe.shield -= absorbed; rest -= absorbed;
      if (foe.shield <= 0) { foe.shield = 0; foe.shieldUntil = 0; }
    }
    foe.hp -= rest;
  }

  /**
   * 全部傷害套用之後：吸血、重傷、緩速、低血護盾（依席位順序，與結算順序無關）。
   * @param igniteCut (p) => 既有點燃減療比例（未啟用技能層 ⇒ 0）；與重傷取較強者。
   */
  afterDamage(pendingHits, players, t, igniteCut = () => 0) {
    const rows = pendingHits.filter((h) => h[3]).map(([atk, foe, , hit]) => ({ atk, foe, hit }))
      .sort((x, y) => seatRank(x.atk.id) - seatRank(y.atk.id) || seatRank(x.foe.id) - seatRank(y.foe.id));
    for (const { atk, foe, hit } of rows) {
      const a = this.ps.get(atk.id), d = this.ps.get(foe.id);
      //  吸血：攻擊者本 tick 還活著才回復
      if (atk.hp > 0 && !atk.dead) {
        const cut = Math.max(t < a.grievous.until ? a.grievous.cut : 0, igniteCut(atk));
        const ls = lifestealHeal({ physAttackTaken: hit.physAttackTaken, cs: a.cs, healCut: cut });
        const ov = omnivampHeal({ totalTaken: hit.total, cs: a.cs, healCut: cut });
        if (ls + ov > 0) {
          const gain = Math.min(atk.maxHp, atk.hp + ls + ov) - atk.hp;
          atk.hp += gain; atk.heal += gain;
          this.counters.lifestealHeal += gain * (ls / (ls + ov));
          this.counters.omnivampHeal += gain * (ov / (ls + ov));
        }
      }
      for (const e of effectsOf(a.cs, "GRIEVOUS_WOUNDS")) {
        const channel = e.params.trigger === "attack" ? hit.physAttack > 0 : e.params.trigger === "ability" ? hit.phys + hit.magic + (hit.trueDamage ?? 0) > hit.physAttack : false;
        if (channel) { d.grievous = { cut: Math.max(e.params.cut, t < d.grievous.until ? d.grievous.cut : 0), until: t + e.params.duration }; this.counters.grievousApplied++; }
      }
      for (const e of effectsOf(d.cs, "GRIEVOUS_WOUNDS")) {
        if (e.params.trigger !== "struck" || !(hit.physAttack > 0)) continue;
        a.grievous = { cut: Math.max(e.params.cut, t < a.grievous.until ? a.grievous.cut : 0), until: t + e.params.duration };
        this.counters.grievousApplied++;
      }
      for (const e of effectsOf(a.cs, "SLOW_ON_HIT")) {
        if (hit.phys + hit.magic + (hit.trueDamage ?? 0) <= hit.physAttack) continue;
        d.slow = { k: Math.max(e.params.slow, t < d.slow.until ? d.slow.k : 0), until: t + e.params.duration };
        this.counters.slowsApplied++;
      }
    }
    //  低血護盾（自己）與守護型護盾（最近友軍）
    for (const p of [...players].sort(bySeat)) {
      if (p.dead || p.hp <= 0) continue;
      const s = this.ps.get(p.id);
      for (const e of effectsOf(s.cs, "LOW_HP_SHIELD")) {
        const key = `${e.params.target}:${e.params.blocks}`;
        if (e.params.target === "self") {
          const r = lowHpShield({ effect: e, hp: p.hp, maxHp: p.maxHp, t, readyAt: s.shieldReadyAt[key] ?? -Infinity, healShieldPower: s.cs.healShieldPower });
          if (!r.triggered) continue;
          s.shieldReadyAt[key] = r.readyAt;
          this._grantShield(p, s, r.amount, e.params.blocks, t);
          this.counters.lowHpShields++;
        } else if (e.params.target === "ally") {
          if (t < (s.shieldReadyAt[key] ?? -Infinity)) continue;
          const ally = players.filter((q) => q.side === p.side && q.id !== p.id && !q.dead && q.hp > 0 && dist(q.pos, p.pos) <= e.params.range && q.hp / q.maxHp < e.params.threshold)
            .sort((x, y) => dist(x.pos, p.pos) - dist(y.pos, p.pos) || seatRank(x.id) - seatRank(y.id))[0];
          if (!ally) continue;
          s.shieldReadyAt[key] = t + e.params.cooldown;
          this._grantShield(ally, this.ps.get(ally.id), ally.maxHp * e.params.shieldPctMaxHp * (1 + s.cs.healShieldPower), e.params.blocks, t);
          this.counters.allyShields++;
        }
      }
    }
  }
  _grantShield(p, s, amount, blocks, t) {
    const until = t + ITEM_SHIELD_DURATION;
    if (blocks === "magic") {
      s.magicShield = { amount: Math.max(amount, t < s.magicShield.until ? s.magicShield.amount : 0), until };
    } else {
      p.shield = Math.max(amount, t < (p.shieldUntil ?? 0) ? p.shield : 0);
      p.shieldUntil = Math.max(until, p.shieldUntil ?? 0);
    }
  }

  // ── snapshot（M3 UI 資料契約；見 docs/architecture/MOBA_裝備UI資料契約_v1.md）──
  snapshot(players, t) {
    const out = {};
    for (const p of [...players].sort(bySeat)) {
      const s = this.ps.get(p.id);
      const cs = s.cs;
      out[p.id] = {
        side: s.side, seatRole: s.seatRole, arch: s.arch, archSource: s.archSource, heroId: s.heroId, strategy: s.strategy,
        gold: {
          start: Math.floor(s.ledger.startMilli / MILLI),
          earned: Math.floor(totalEarnedMilli(s.ledger) / MILLI),
          spent: Math.floor(s.ledger.spentMilli / MILLI),
          unspent: Math.floor(s.ledger.unspentMilli / MILLI),
        },
        inventory: s.inventory.slots.slice(),
        plan: s.plan ? { ...s.plan, buildPath: s.plan.buildPath.slice() } : null,
        reasons: s.reasons.slice(),
        lastWindow: s.lastWindow ? { ...s.lastWindow } : null,
        stats: {
          schema: COMBAT_STATS_SCHEMA,
          hp: Math.round(cs.hp), ad: Math.round(cs.ad), ap: Math.round(cs.ap), armor: Math.round(cs.armor), mr: Math.round(cs.mr),
          attackSpeed: r2(cs.attackSpeed), critChance: r2(cs.critChance), critDamage: r2(cs.critDamage),
          abilityHaste: Math.round(cs.abilityHaste), moveSpeed: r2(cs.moveSpeed),
          armorPenFlat: Math.round(cs.armorPenFlat), armorPenPct: r2(cs.armorPenPct),
          magicPenFlat: Math.round(cs.magicPenFlat), magicPenPct: r2(cs.magicPenPct),
          lifesteal: r2(cs.lifesteal), omnivamp: r2(cs.omnivamp), healShieldPower: r2(cs.healShieldPower),
          effects: cs.effects.map((e) => e.type),
        },
        status: {
          grievous: t < s.grievous.until ? r1(s.grievous.until - t) : 0,
          slow: t < s.slow.until ? r1(s.slow.until - t) : 0,
          magicShield: t < s.magicShield.until && s.magicShield.amount > 0 ? Math.round(s.magicShield.amount) : 0,
          aura: { armor: s.aura.armor, mr: s.aura.mr, moveSpeed: r2(s.aura.moveSpeed) },
        },
      };
    }
    return {
      schema: ITEMS_SNAPSHOT_SCHEMA,
      runtimeVersion: ITEMS_RUNTIME_VERSION,
      catalogVersion: ITEM_CATALOG_VERSION,
      policyVersion: BUILD_POLICY_VERSION,
      batch: this.batch,
      lastSeq: this.seq - 1,
      purchases: this.purchases.map((e) => ({ ...e, consumed: e.consumed.slice() })),
      counters: { ...this.counters },
      players: out,
    };
  }
}
