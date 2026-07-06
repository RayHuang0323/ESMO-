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

export class LogicEngine {
  constructor(seed = 1) {
    let x = seed | 0; this.rng = () => ((x = (x * 1664525 + 1013904223) & 0xffffffff) >>> 0) / 0xffffffff;
    this.t = 0; this.over = false; this.winner = null;
    this.bK = 0; this.rK = 0; this.bGold = 500; this.rGold = 500;
    this.mid = 0; this.fx = []; this.waveTimer = 0; this.feed = [];

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
          k: 0, d: 0, // Sprint04：個人擊殺/死亡累計（純附加儀器化，供呈現層讀取）
        });
      });
    });

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
      let tgt, st;
      if (p.hp < p.maxHp * 0.25) { tgt = FOUNTAIN[p.side]; st = "撤退"; }
      else if (hot && (p.role === "jungle" || p.role === "sup" || this.rng() < 0.6)) { tgt = hot; st = "團戰!"; }
      else {
        const lane = p.lane;
        const adv = p.side === "blue" ? clamp(0.35 + this.t / 900, 0.3, 0.7) : clamp(0.65 - this.t / 900, 0.3, 0.7);
        tgt = posOnLane(lane, adv); st = p.role === "jungle" ? "游走" : "對線";
      }
      const d = dist(p.pos, tgt), spd = (st === "團戰!" ? 16 : 13) * dt;
      if (d > 0.6) { p.pos.x += ((tgt.x - p.pos.x) / d) * Math.min(spd, d); p.pos.y += ((tgt.y - p.pos.y) / d) * Math.min(spd, d); }
      for (const o of WALLS) { const dd = dist(p.pos, o); if (dd < o.r + 1.4) { p.pos.x += ((p.pos.x - o.x) / (dd || 1)) * (o.r + 1.4 - dd); p.pos.y += ((p.pos.y - o.y) / (dd || 1)) * (o.r + 1.4 - dd); } }
      p.pos.x = clamp(p.pos.x, 3, 97); p.pos.y = clamp(p.pos.y, 3, 97);
      p.state = st;
      const foe = alive.find((q) => q.side !== p.side && !q.dead && dist(p.pos, q.pos) < 8);
      if (foe) {
        foe.hp -= p.power * dt * 1.1 * lateFactor;
        if (p.atkCd <= 0) { this.pushFx({ type: this.rng() < 0.2 ? "ult" : "line", pos: { ...p.pos }, target: { ...foe.pos }, color: SIDE[p.side] }); p.atkCd = 0.5; }
        if (foe.hp <= 0 && !foe.dead) {
          foe.dead = true; foe.respawn = 6 + Math.min(this.t / 30, 20); foe.hp = 0;
          if (p.side === "blue") this.bK++; else this.rK++;
          p.k += 1; foe.d += 1; // Sprint04：個人統計（附加）
          this._dmgGold(p.side, 300); p.gold += 300;
          this.feed.unshift({ id: this._mid++, killer: p.id, victim: foe.id, side: p.side, vpos: { x: foe.pos.x, y: foe.pos.y } }); this.feed = this.feed.slice(0, 5);
          this.pushFx({ type: "ult", pos: { ...foe.pos }, color: 0xfbbf24, exp: 0.6 });
        }
      }
      const tw = this.frontTower(p.side, p.lane);
      if (tw && dist(p.pos, tw.pos) < 6 && !alive.some((q) => q.side !== p.side && dist(q.pos, tw.pos) < 9)) tw.hp -= 40 * dt * lateFactor;
    }

    for (const k in this.towers) { const tw = this.towers[k]; if (tw.hp <= 0 && !tw._dead) { tw._dead = true; this._dmgGold(tw.side === "blue" ? "red" : "blue", tw.lane === "nexus" ? 0 : 250); } }

    const upd = (o, key, gold) => {
      if (!o.alive) { o.respawn -= dt; if (o.respawn <= 0) { o.alive = true; o.hp = 100; } return; }
      const pit = PITS[key]; const b = alive.filter((p) => p.side === "blue" && dist(p.pos, pit) < 9).length;
      const r = alive.filter((p) => p.side === "red" && dist(p.pos, pit) < 9).length;
      o.contested = b > 0 && r > 0;
      if (b > r) { o.hp -= 28 * dt; if (o.hp <= 0) { o.alive = false; o.respawn = 150; this._dmgGold("blue", gold); } }
      else if (r > b) { o.hp -= 28 * dt; if (o.hp <= 0) { o.alive = false; o.respawn = 150; this._dmgGold("red", gold); } }
    };
    if (this.t > 90) upd(this.dragon, "dragon", 200);
    if (this.t > 300) upd(this.baron, "baron", 400);

    this.bGold += 14 * dt; this.rGold += 14 * dt;
    this.fx = this.fx.filter((f) => (f.exp -= dt) > 0);

    if (this.towers.blue_nexus.hp <= 0) { this.over = true; this.winner = "red"; }
    if (this.towers.red_nexus.hp <= 0) { this.over = true; this.winner = "blue"; }
  }
  _dmgGold(side, g) { if (side === "blue") this.bGold += g; else this.rGold += g; }

  snapshot() {
    const gd = this.bGold - this.rGold;
    const tw = (s) => Object.values(this.towers).filter((t) => t.side === s && t.lane !== "nexus" && t.hp <= 0).length;
    const winProb = clamp(0.5 + gd / 14000 + (tw("red") - tw("blue")) * 0.05, 0.05, 0.95);
    return {
      ts: this.t,
      players: this.players.map((p) => ({ id: p.id, side: p.side, role: p.role, pos: { ...p.pos }, hp: clamp(p.hp / p.maxHp, 0, 1), dead: p.dead, respawn: p.respawn, state: p.state, k: p.k, d: p.d, gold: Math.round(p.gold) })),
      towers: Object.fromEntries(Object.entries(this.towers).map(([k, t]) => [k, { side: t.side, lane: t.lane, tier: t.tier, pos: t.pos, hp: clamp(t.hp / (t.lane === "nexus" ? NEXUS_HP : TOWER_HP), 0, 1) }])),
      lanes: { top: this._snapLane("top"), mid: this._snapLane("mid"), bot: this._snapLane("bot") },
      dragon: { ...this.dragon }, baron: { ...this.baron },
      fx: this.fx.map((f) => ({ ...f })), feed: this.feed.slice(),
      bK: this.bK, rK: this.rK, bGold: this.bGold, rGold: this.rGold, winProb, over: this.over, winner: this.winner,
    };
  }
  _snapLane(ln) {
    return { bm: this.lanes[ln].bm.map((m) => ({ id: m.id, t: m.t })), rm: this.lanes[ln].rm.map((m) => ({ id: m.id, t: m.t })) };
  }
}
