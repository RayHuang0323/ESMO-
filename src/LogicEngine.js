// ============================================================================
//  LogicEngine.js  —  對戰大腦（純邏輯，無 React / 無 three）
//  - tick(dt) 推進一個模擬步；snapshot() 產生可序列化狀態
//  - 不依賴任何渲染層 → 可直接搬到 Node.js 當作多人伺服器的權威模擬
//  注意：此檔行為與沙盒 App.jsx 內聯引擎逐行一致，數值未更動。
// ============================================================================

import {
  clamp, dist, posOnLane, WALLS, PITS, BASE, FOUNTAIN, TOWER_T,
  ROLES, ROLE_LANE, TOWER_HP, NEXUS_HP, SIDE,
} from "./gameData.js";

// ── Sprint 03：英雄 arch → 戰鬥屬性 profile ──
//   CHAMPIONS_100 無戰鬥數值，此表由「定位」衍生（延續 Sprint 02 calcMobaPower
//   的推導模式，非假資料）。dmgMul 乘 player.power；hpMul 已由 calcMobaTough 反映
//   於 maxHp，這裡的 hpMul 僅作無 champion 時的後備。armor＝減傷率、range＝交戰
//   距離、aspd＝攻速（縮短 atkCd）、role 行為由 behavior 決定。
export const ARCH_COMBAT = {
  "坦克":  { dmgMul: 0.75, armor: 0.42, range: 6,  aspd: 0.85, behavior: "tank",     heal: 0 },
  "戰士":  { dmgMul: 1.00, armor: 0.28, range: 7,  aspd: 1.00, behavior: "fighter",  heal: 0 },
  "刺客":  { dmgMul: 1.40, armor: 0.12, range: 6,  aspd: 1.20, behavior: "assassin", heal: 0 },
  "法師":  { dmgMul: 1.28, armor: 0.14, range: 11, aspd: 0.90, behavior: "mage",     heal: 0 },
  "射手":  { dmgMul: 1.32, armor: 0.10, range: 13, aspd: 1.35, behavior: "marksman", heal: 0 },
  "輔助":  { dmgMul: 0.60, armor: 0.26, range: 8,  aspd: 0.90, behavior: "support",  heal: 22 },
};
const DEFAULT_COMBAT = { dmgMul: 1.0, armor: 0.20, range: 8, aspd: 1.0, behavior: "fighter", heal: 0 };

export class LogicEngine {
  constructor(seed = 1) {
    let x = seed | 0; this.rng = () => ((x = (x * 1664525 + 1013904223) & 0xffffffff) >>> 0) / 0xffffffff;
    this.t = 0; this.over = false; this.winner = null;
    this.bK = 0; this.rK = 0; this.bGold = 500; this.rGold = 500;
    this.mid = 0; this.fx = []; this.waveTimer = 0; this.feed = [];
    this.timeline = []; this._firstBlood = false; // Sprint 03：Battle Timeline

    this.players = [];
    ["blue", "red"].forEach((side) => {
      ROLES.forEach((role, i) => {
        const tough = [1.6, 1.15, 0.9, 0.8, 1.25][i];
        const power = [30, 34, 36, 42, 18][i];
        const f = FOUNTAIN[side];
        this.players.push({
          id: side[0] + (i + 1), side, role, lane: ROLE_LANE[role],
          pos: { x: f.x + (this.rng() - 0.5) * 6, y: f.y + (this.rng() - 0.5) * 6 },
          maxHp: 600 * tough, hp: 600 * tough, power, tough,
          dead: false, respawn: 0, state: "對線", atkCd: 0, gold: 0,
          // Sprint 03：戰鬥屬性（無 champion 時用中性後備；applyRoster 後 setupCombat 覆蓋）
          armor: DEFAULT_COMBAT.armor, range: DEFAULT_COMBAT.range, aspd: DEFAULT_COMBAT.aspd,
          atk: power, behavior: DEFAULT_COMBAT.behavior, healPow: 0,
          // Sprint 03：逐英雄統計
          k: 0, d: 0, a: 0, dmg: 0, heal: 0, twr: 0, tf: 0,
        });
      });
    });
    this._setupCombat();

    this.towers = {};
    for (const lane of ["top", "mid", "bot"]) {
      ["blue", "red"].forEach((side) =>
        TOWER_T[side].forEach((t, tier) => {
          this.towers[`${side}_${lane}_${tier}`] = { side, lane, tier, t, pos: posOnLane(lane, t), hp: TOWER_HP, atkCd: 0 };
        }));
    }
    this.towers["blue_nexus"] = { side: "blue", lane: "nexus", tier: 9, pos: BASE.blue, hp: NEXUS_HP, atkCd: 0 };
    this.towers["red_nexus"] = { side: "red", lane: "nexus", tier: 9, pos: BASE.red, hp: NEXUS_HP, atkCd: 0 };

    this.lanes = { top: { bm: [], rm: [] }, mid: { bm: [], rm: [] }, bot: { bm: [], rm: [] } };
    this.dragon = { alive: false, hp: 100, respawn: 90, contested: false };
    this.baron = { alive: false, hp: 100, respawn: 300, contested: false };
    this._mid = 1;
  }

  // ── Phase 10：平台 roster 正式注入口（不影響 tick / AI / Battle Flow）──
  //   將 buildEngineSlots 產出的 slots 覆蓋到「我方（blue）」玩家物件。
  //   slot.power / slot.tough 為 null 時保持 constructor 預設值（向下相容）；
  //   身份欄位 champion / playerName 供 UI 與結算讀取，tick/AI 完全不讀取，
  //   故不影響任何模擬行為。slots 為空 → 直接返回，等同未呼叫。
  applyRoster(slots) {
    if (!Array.isArray(slots) || slots.length === 0) return this;
    // 依 (side|role) 對位，Blue / Red 完全對稱；slot 未帶 side 時預設 "blue"
    // （＝ Phase 10/13 的 blue-only slots 行為不變，向下相容）。
    const byKey = {};
    for (const s of slots) if (s && s.role) byKey[(s.side || "blue") + "|" + s.role] = s;
    for (const p of this.players) {
      const s = byKey[p.side + "|" + p.role];
      if (!s) continue;
      if (s.champion) p.champion = s.champion;   // 身份（tick/AI 不讀，不影響模擬）
      if (s.playerName != null) p.playerName = s.playerName;
      if (s.power != null) p.power = s.power;     // null＝保持預設（向下相容）
      if (s.tough != null) {                      // 覆蓋體質時，沿用 constructor 同一公式重算血量
        p.tough = s.tough;
        p.maxHp = 600 * s.tough;
        p.hp = p.maxHp;                           // 開戰前滿血（與 constructor 一致）
      }
    }
    this._setupCombat();                          // Sprint 03：依注入的 champion.arch 重設戰鬥屬性
    return this;
  }

  // Sprint 03：依 champion.arch 設定每位英雄的戰鬥屬性與行為（無 champion → 中性後備）
  _setupCombat() {
    for (const p of this.players) {
      const arch = p.champion && p.champion.arch;
      const c = (arch && ARCH_COMBAT[arch]) || DEFAULT_COMBAT;
      p.armor = c.armor; p.range = c.range; p.aspd = c.aspd; p.behavior = c.behavior;
      p.atk = p.power * c.dmgMul;   // 實際攻擊力＝角色/英雄 power × arch 攻擊定位
      p.healPow = c.heal || 0;      // 輔助的每秒治療量
    }
  }

  // Sprint 03：Battle Timeline 事件記錄
  _logEvent(type, side, text, detail) {
    this.timeline.push({ t: Math.round(this.t), type, side: side || null, text, detail: detail || null });
    if (this.timeline.length > 200) this.timeline.shift();
  }

  frontTower(attacker, lane) {
    const def = attacker === "blue" ? "red" : "blue";
    const arr = [0, 1, 2].map((tier) => this.towers[`${def}_${lane}_${tier}`]).filter(Boolean);
    arr.sort((a, b) => (attacker === "blue" ? a.t - b.t : b.t - a.t));
    return arr.find((tw) => tw.hp > 0) || null;
  }
  laneCleared(side) {
    const def = side === "blue" ? "red" : "blue";
    return ["top", "mid", "bot"].some((ln) => [0, 1, 2].every((tr) => this.towers[`${def}_${ln}_${tr}`].hp <= 0));
  }
  pushFx(f) { this.fx.push({ ...f, exp: f.exp ?? 0.35 }); if (this.fx.length > 60) this.fx.shift(); }

  tick(dt) {
    if (this.over) return;
    this.t += dt;
    const lateFactor = 1 + Math.max(0, this.t - 240) / 240;

    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer = 16;
      for (const ln of ["top", "mid", "bot"]) {
        for (let i = 0; i < 4; i++) {
          if (this.lanes[ln].bm.length < 16) this.lanes[ln].bm.push({ id: "b" + this._mid++, t: 0.06, hp: 130 });
          if (this.lanes[ln].rm.length < 16) this.lanes[ln].rm.push({ id: "r" + this._mid++, t: 0.94, hp: 130 });
        }
      }
    }
    for (const ln of ["top", "mid", "bot"]) {
      this.lanes[ln].bm.forEach((m) => (m.t = Math.min(1, m.t + 0.018 * dt)));
      this.lanes[ln].rm.forEach((m) => (m.t = Math.max(0, m.t - 0.018 * dt)));
      this.lanes[ln].bm.forEach((b) => {
        const foe = this.lanes[ln].rm.find((r) => Math.abs(r.t - b.t) < 0.035);
        if (foe) { b.hp -= 70 * dt; foe.hp -= 70 * dt; }
      });
      [["blue", "bm"], ["red", "rm"]].forEach(([side, key]) => {
        const arr = this.lanes[ln][key]; if (!arr.length) return;
        const lead = side === "blue" ? Math.max(...arr.map((m) => m.t)) : Math.min(...arr.map((m) => m.t));
        let tw = this.frontTower(side, ln);
        if (!tw && this.laneCleared(side)) tw = this.towers[(side === "blue" ? "red" : "blue") + "_nexus"];
        if (tw) {
          const reach = side === "blue" ? lead >= tw.t - 0.04 : lead <= tw.t + 0.04;
          if (reach) { tw.hp -= 26 * arr.length * dt * lateFactor; this._dmgGold(side, 0); }
        }
      });
      ["blue", "red"].forEach((side) => {
        for (const tr of [0, 1, 2]) {
          const tw = this.towers[`${side}_${ln}_${tr}`]; if (tw.hp <= 0) continue;
          const enemyKey = side === "blue" ? "rm" : "bm";
          const m = this.lanes[ln][enemyKey].find((mm) => Math.abs(mm.t - tw.t) < 0.05);
          if (m) { m.hp -= 120 * dt; if (this.rng() < dt * 1.5) this.pushFx({ type: "tower", pos: tw.pos, target: posOnLane(ln, m.t), color: SIDE[side] }); }
        }
      });
      ["bm", "rm"].forEach((key) => {
        const dead = this.lanes[ln][key].filter((m) => m.hp <= 0).length;
        if (dead) this._dmgGold(key === "bm" ? "red" : "blue", dead * 20);
        this.lanes[ln][key] = this.lanes[ln][key].filter((m) => m.hp > 0);
      });
    }

    const alive = this.players.filter((p) => !p.dead);
    let hot = null;
    if (this.dragon.alive) hot = PITS.dragon;
    if (this.baron.alive) hot = PITS.baron;
    if (!hot) {
      for (const a of alive) {
        const near = alive.filter((b) => dist(a.pos, b.pos) < 14);
        if (near.filter((b) => b.side !== a.side).length >= 1 && near.length >= 3) {
          hot = { x: near.reduce((s, p) => s + p.pos.x, 0) / near.length, y: near.reduce((s, p) => s + p.pos.y, 0) / near.length };
          break;
        }
      }
    }

    for (const p of this.players) {
      if (p.dead) { p.respawn -= dt; if (p.respawn <= 0) { p.dead = false; p.hp = p.maxHp; const f = FOUNTAIN[p.side]; p.pos = { x: f.x, y: f.y }; p.state = "回防"; } continue; }
      p.atkCd -= dt;
      const enemies = alive.filter((q) => q.side !== p.side && !q.dead);
      const allies = alive.filter((q) => q.side === p.side && q.id !== p.id && !q.dead);
      let tgt, st, engageR = p.range;

      // ── Sprint 03：六種 arch AI 行為 ──
      if (p.hp < p.maxHp * 0.22) { tgt = FOUNTAIN[p.side]; st = "撤退"; }
      else if (p.behavior === "support") {
        // 輔助：跟隨最近的我方非輔助隊友（保護 C 位），不主動突前
        const carry = allies.filter((q) => q.behavior !== "support").sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || allies[0];
        if (carry) { tgt = { x: carry.pos.x + 3, y: carry.pos.y + 3 }; st = "護衛"; }
        else if (hot) { tgt = hot; st = "團戰!"; }
        else { tgt = posOnLane(p.lane, p.side === "blue" ? 0.4 : 0.6); st = "游走"; }
      }
      else if (p.behavior === "assassin") {
        // 刺客：切後排——找敵方 range 最大（射手/法師）或最脆的目標繞後
        const backline = enemies.slice().sort((a, b) => (b.range - a.range) || (a.hp - b.hp))[0];
        if (backline && (hot || dist(p.pos, backline.pos) < 40)) { tgt = backline.pos; st = "突襲!"; engageR = p.range; }
        else if (hot) { tgt = hot; st = "團戰!"; }
        else { const adv = p.side === "blue" ? clamp(0.4 + this.t / 900, 0.3, 0.72) : clamp(0.6 - this.t / 900, 0.28, 0.7); tgt = posOnLane(p.lane, adv); st = "游走"; }
      }
      else if (p.behavior === "marksman" || p.behavior === "mage") {
        // 射手/法師：保持距離風箏——有近敵則後退到 range 邊緣輸出
        const near = enemies.filter((q) => dist(p.pos, q.pos) < p.range).sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0];
        if (near) {
          const dd = dist(p.pos, near.pos) || 1;
          if (dd < p.range * 0.6) { tgt = { x: p.pos.x + (p.pos.x - near.pos.x) / dd * 6, y: p.pos.y + (p.pos.y - near.pos.y) / dd * 6 }; st = "風箏"; }
          else { tgt = p.pos; st = "輸出"; }
        }
        else if (hot) { tgt = hot; st = "團戰!"; }
        else { const adv = p.side === "blue" ? clamp(0.34 + this.t / 900, 0.3, 0.68) : clamp(0.66 - this.t / 900, 0.32, 0.7); tgt = posOnLane(p.lane, adv); st = "對線"; }
      }
      else if (p.behavior === "tank") {
        // 坦克：前壓開團——推進到最前線 / 撲向敵人集群
        if (hot) { tgt = hot; st = "開團!"; }
        else if (enemies.length) { const front = enemies.sort((a, b) => dist(p.pos, a.pos) - dist(p.pos, b.pos))[0]; tgt = front.pos; st = "壓制"; }
        else { const adv = p.side === "blue" ? clamp(0.45 + this.t / 700, 0.35, 0.8) : clamp(0.55 - this.t / 700, 0.2, 0.65); tgt = posOnLane(p.lane, adv); st = "推進"; }
      }
      else {
        // 戰士：均衡——優先團戰，否則推線交戰
        if (hot && (p.role === "jungle" || this.rng() < 0.7)) { tgt = hot; st = "團戰!"; }
        else { const adv = p.side === "blue" ? clamp(0.4 + this.t / 850, 0.3, 0.74) : clamp(0.6 - this.t / 850, 0.26, 0.7); tgt = posOnLane(p.lane, adv); st = p.role === "jungle" ? "游走" : "對線"; }
      }

      const d = dist(p.pos, tgt), spd = (st === "團戰!" || st === "突襲!" || st === "開團!" ? 16 : 13) * dt;
      if (d > 0.6) { p.pos.x += ((tgt.x - p.pos.x) / d) * Math.min(spd, d); p.pos.y += ((tgt.y - p.pos.y) / d) * Math.min(spd, d); }
      for (const o of WALLS) { const dd = dist(p.pos, o); if (dd < o.r + 1.4) { p.pos.x += ((p.pos.x - o.x) / (dd || 1)) * (o.r + 1.4 - dd); p.pos.y += ((p.pos.y - o.y) / (dd || 1)) * (o.r + 1.4 - dd); } }
      p.pos.x = clamp(p.pos.x, 3, 97); p.pos.y = clamp(p.pos.y, 3, 97);
      p.state = st;

      // ── 輔助治療：range 內最缺血隊友 ──
      if (p.healPow > 0) {
        const wounded = allies.filter((q) => q.hp < q.maxHp && dist(p.pos, q.pos) < p.range).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (wounded) { const h = p.healPow * dt; wounded.hp = Math.min(wounded.maxHp, wounded.hp + h); p.heal += h; }
      }

      // ── 交戰：range 內敵人，傷害＝atk×(1-armor)×攻速，累計統計 ──
      const foe = enemies.filter((q) => dist(p.pos, q.pos) < engageR).sort((a, b) => a.hp - b.hp)[0];
      if (foe) {
        const dmg = p.atk * dt * 1.15 * p.aspd * lateFactor * (1 - foe.armor);
        foe.hp -= dmg; p.dmg += dmg;
        if (p.atkCd <= 0) { this.pushFx({ type: this.rng() < 0.2 ? "ult" : "line", pos: { ...p.pos }, target: { ...foe.pos }, color: SIDE[p.side] }); p.atkCd = 0.5 / p.aspd; }
        if (foe.hp <= 0 && !foe.dead) {
          foe.dead = true; foe.respawn = 6 + Math.min(this.t / 30, 20); foe.hp = 0;
          p.k++; foe.d++;
          // 助攻：range 內同隊其他英雄
          for (const mate of allies) if (dist(mate.pos, foe.pos) < 16) { mate.a++; mate.tf++; }
          p.tf++;
          if (p.side === "blue") this.bK++; else this.rK++;
          this._dmgGold(p.side, 300); p.gold += 300;
          this.feed.unshift({ id: this._mid++, killer: p.id, victim: foe.id, side: p.side, vpos: { x: foe.pos.x, y: foe.pos.y } }); this.feed = this.feed.slice(0, 5);
          this.pushFx({ type: "ult", pos: { ...foe.pos }, color: 0xfbbf24, exp: 0.6 });
          // Timeline：首殺 / 一般擊殺
          const kn = (p.champion && p.champion.zh) || p.id, vn = (foe.champion && foe.champion.zh) || foe.id;
          if (!this._firstBlood) { this._firstBlood = true; this._logEvent("firstblood", p.side, `一血！${kn} 擊殺 ${vn}`, { killer: p.id, victim: foe.id }); }
          else this._logEvent("kill", p.side, `${kn} 擊殺 ${vn}`, { killer: p.id, victim: foe.id });
        }
      }
      const tw = this.frontTower(p.side, p.lane);
      if (tw && dist(p.pos, tw.pos) < 6 && !alive.some((q) => q.side !== p.side && dist(q.pos, tw.pos) < 9)) { const td = 40 * dt * lateFactor; tw.hp -= td; p.twr += td; }
    }

    for (const k in this.towers) { const tw = this.towers[k]; if (tw.hp <= 0 && !tw._dead) { tw._dead = true; this._dmgGold(tw.side === "blue" ? "red" : "blue", tw.lane === "nexus" ? 0 : 250); if (tw.lane !== "nexus") this._logEvent("tower", tw.side === "blue" ? "red" : "blue", `摧毀 ${tw.side === "blue" ? "紅" : "藍"}方 ${tw.lane} 防禦塔`, { tower: k }); } }

    const upd = (o, key, gold) => {
      if (!o.alive) { o.respawn -= dt; if (o.respawn <= 0) { o.alive = true; o.hp = 100; } return; }
      const pit = PITS[key]; const b = alive.filter((p) => p.side === "blue" && dist(p.pos, pit) < 9).length;
      const r = alive.filter((p) => p.side === "red" && dist(p.pos, pit) < 9).length;
      o.contested = b > 0 && r > 0;
      const objName = key === "dragon" ? "巨龍" : "大龍";
      if (b > r) { o.hp -= 28 * dt; if (o.hp <= 0) { o.alive = false; o.respawn = 150; this._dmgGold("blue", gold); this._logEvent("objective", "blue", `藍方擊殺${objName}`, { obj: key }); } }
      else if (r > b) { o.hp -= 28 * dt; if (o.hp <= 0) { o.alive = false; o.respawn = 150; this._dmgGold("red", gold); this._logEvent("objective", "red", `紅方擊殺${objName}`, { obj: key }); } }
    };
    if (this.t > 90) upd(this.dragon, "dragon", 200);
    if (this.t > 300) upd(this.baron, "baron", 400);

    this.bGold += 14 * dt; this.rGold += 14 * dt;
    this.fx = this.fx.filter((f) => (f.exp -= dt) > 0);

    if (this.towers.blue_nexus.hp <= 0) { this.over = true; this.winner = "red"; this._logEvent("end", "red", "紅方摧毀主堡，紅方勝利"); }
    if (this.towers.red_nexus.hp <= 0) { this.over = true; this.winner = "blue"; this._logEvent("end", "blue", "藍方摧毀主堡，藍方勝利"); }
    // Sprint 03：時間上限保底（機制完整性，非數值平衡）——確保每場必然收斂出結果，
    //   供 Result 使用。逾時依「主堡殘血 → 推塔數 → 經濟」綜合判定。
    if (!this.over && this.t >= 900) {
      const bNexus = this.towers.blue_nexus.hp, rNexus = this.towers.red_nexus.hp;
      const bDownTw = Object.values(this.towers).filter((t) => t.side === "red" && t.lane !== "nexus" && t.hp <= 0).length; // 藍方推掉的紅塔
      const rDownTw = Object.values(this.towers).filter((t) => t.side === "blue" && t.lane !== "nexus" && t.hp <= 0).length;
      const bScore = (rNexus <= bNexus ? 1 : 0) + bDownTw * 0.3 + (this.bGold - this.rGold) / 5000;
      this.winner = bScore >= 0 ? "blue" : "red";
      this.over = true;
      this._logEvent("end", this.winner, "達時間上限，依戰局綜合判定勝負");
    }
  }
  _dmgGold(side, g) { if (side === "blue") this.bGold += g; else this.rGold += g; }

  snapshot() {
    const gd = this.bGold - this.rGold;
    const tw = (s) => Object.values(this.towers).filter((t) => t.side === s && t.lane !== "nexus" && t.hp <= 0).length;
    const winProb = clamp(0.5 + gd / 14000 + (tw("red") - tw("blue")) * 0.05, 0.05, 0.95);
    const totalK = { blue: this.bK, red: this.rK };
    return {
      ts: this.t,
      // 既有欄位（R3F 渲染依賴）完全保留；Sprint 03 新增 k/d/a/dmg/heal/twr/tf/gold/champion/playerName
      players: this.players.map((p) => ({
        id: p.id, side: p.side, role: p.role, pos: { ...p.pos }, hp: clamp(p.hp / p.maxHp, 0, 1), dead: p.dead, respawn: p.respawn, state: p.state,
        k: p.k, d: p.d, a: p.a, dmg: Math.round(p.dmg), heal: Math.round(p.heal), twr: Math.round(p.twr), gold: Math.round(p.gold),
        tf: p.tf, participation: totalK[p.side] > 0 ? Math.round((p.tf / totalK[p.side]) * 100) : 0,
        champion: p.champion || null, playerName: p.playerName || null, behavior: p.behavior,
      })),
      towers: Object.fromEntries(Object.entries(this.towers).map(([k, t]) => [k, { side: t.side, lane: t.lane, tier: t.tier, pos: t.pos, hp: clamp(t.hp / (t.lane === "nexus" ? NEXUS_HP : TOWER_HP), 0, 1) }])),
      lanes: { top: this._snapLane("top"), mid: this._snapLane("mid"), bot: this._snapLane("bot") },
      dragon: { ...this.dragon }, baron: { ...this.baron },
      fx: this.fx.map((f) => ({ ...f })), feed: this.feed.slice(),
      timeline: this.timeline.slice(), // Sprint 03：Battle Timeline
      bK: this.bK, rK: this.rK, bGold: this.bGold, rGold: this.rGold, winProb, over: this.over, winner: this.winner,
    };
  }
  _snapLane(ln) {
    return { bm: this.lanes[ln].bm.map((m) => ({ id: m.id, t: m.t })), rm: this.lanes[ln].rm.map((m) => ({ id: m.id, t: m.t })) };
  }
}
