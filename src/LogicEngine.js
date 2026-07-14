// ============================================================================
//  LogicEngine.js  —  對戰大腦（純邏輯，無 React / 無 three）
//  - tick(dt) 推進一個模擬步；snapshot() 產生可序列化狀態
//  - 不依賴任何渲染層 → 可直接搬到 Node.js 當作多人伺服器的權威模擬
//  注意：此檔行為與沙盒 App.jsx 內聯引擎逐行一致，數值未更動。
//
//  Sprint24：戰術層（configureMatch）——嚴格附加，不重構：
//  - 不呼叫 configureMatch ⇒ 行為與 rng 序列與舊版完全一致（regress 基準不變）。
//  - 呼叫後啟用行為權重：團戰/龍/巴龍參與率、撤退門檻、推線深度、打野 Gank
//    路線、開局入侵、輔助遊走、帶線分推。knobs 形狀由呼叫端準備
//    （platform/contracts/MobaTacticConfig.toEngineTactic），本檔不 import 契約。
//  - 戰術只改「行為權重 / 傾向 / 時機 / 路線 / 風險」；沒有任何傷害、勝率、
//    金錢係數，勝負仍由陣容 loadout、比分、經濟、地圖事件與 seed 決定。
//  - 戰術層用獨立 rng2 流（同 seed + 同戰術 ⇒ 同結果；不污染主 rng 序列）。
//  - tacticExec 統計 = 引擎真實計數（Gank/入侵/會戰/分推/龍巴龍/推塔波次），
//    只在啟用戰術時出現在 snapshot（舊消費者零影響）。
// ============================================================================

import {
  clamp, dist, posOnLane, WALLS, PITS, BASE, FOUNTAIN, TOWER_T,
  ROLES, ROLE_LANE, TOWER_HP, NEXUS_HP, SIDE,
} from "./gameData.js";

export class LogicEngine {
  constructor(seed = 1, loadout = null) {
    let x = seed | 0; this.rng = () => ((x = (x * 1664525 + 1013904223) & 0xffffffff) >>> 0) / 0xffffffff;
    this.seed = seed | 0;          // S24：保留 seed 供戰術層 rng2 派生
    this.tacticOn = false;         // S24：未 configureMatch ⇒ 全部戰術程式碼不生效
    this.playerStatsOn = false;    // S28：未 configurePlayers ⇒ 全部能力程式碼不生效
    this.t = 0; this.over = false; this.winner = null;
    this.bK = 0; this.rK = 0; this.bGold = 500; this.rGold = 500;
    this.mid = 0; this.fx = []; this.waveTimer = 0; this.feed = [];

    this.players = [];
    ["blue", "red"].forEach((side) => {
      ROLES.forEach((role, i) => {
        const baseTough = [1.6, 1.15, 0.9, 0.8, 1.25][i];
        const basePower = [30, 34, 36, 42, 18][i];
        // Sprint08：Hero Progress loadout（等級屬性；無 loadout 時 = 原基準值）
        const lo = loadout?.[side[0] + (i + 1)] ?? null;
        const tough = lo ? baseTough * lo.toughMult : baseTough;
        const power = lo ? basePower * lo.powerMult : basePower;
        const lv = lo?.level ?? 1;
        const f = FOUNTAIN[side];
        this.players.push({
          id: side[0] + (i + 1), side, role, lane: ROLE_LANE[role],
          pos: { x: f.x + (this.rng() - 0.5) * 6, y: f.y + (this.rng() - 0.5) * 6 },
          maxHp: 600 * tough, hp: 600 * tough, power, tough,
          dead: false, respawn: 0, state: "對線", atkCd: 0, gold: 0,
          k: 0, d: 0, // Sprint04：個人擊殺/死亡累計（純附加儀器化，供呈現層讀取）
          a: 0, dmg: 0, heal: 0, hitBy: new Map(), // Sprint06：助攻/傷害/治療儀器化（純附加）
          twrDmg: 0, // Sprint07：個人推塔傷害（純附加）
          lv, // Sprint08：英雄等級（來自 Hero Progress loadout）
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
    this.towers["blue_nexus"] = { side: "blue", lane: "nexus", tier: 9, t: 0.02, pos: BASE.blue, hp: NEXUS_HP, atkCd: 0 };
    this.towers["red_nexus"] = { side: "red", lane: "nexus", tier: 9, t: 0.98, pos: BASE.red, hp: NEXUS_HP, atkCd: 0 };

    this.lanes = { top: { bm: [], rm: [] }, mid: { bm: [], rm: [] }, bot: { bm: [], rm: [] } };
    this.dragon = { alive: false, hp: 100, respawn: 90, contested: false };
    this.baron = { alive: false, hp: 100, respawn: 300, contested: false };
    this._mid = 1;
  }

  // ── S24 戰術層 ────────────────────────────────────────────────────────────
  /** 中性 knobs = 舊版行為常數（joinFight 0.6 / retreatAt 0.25 / 偏移 0），新行為關閉 */
  _neutralKnobs() {
    return { tacticId: "neutral", joinFight: 0.6, dragonJoin: 0.6, baronJoin: 0.6, retreatAt: 0.25,
      laneOffset: { top: 0, mid: 0, bot: 0 }, splitLane: null, splitPush: 0,
      gankInterval: 45, gankWeights: { top: 1, mid: 1, bot: 1 }, invadeChance: 0, invadeWithMid: false, roamRate: 0 };
  }
  /**
   * 啟用戰術（最小改動入口；不呼叫 = 舊行為位元不變）。
   * @param {object} blue/red  行為權重 knobs（toEngineTactic 輸出形狀）
   * @param {object} meta      { tacticId, tacticName, version, opponentTacticId } → snapshot / BattleResult
   */
  configureMatch({ blue = null, red = null, meta = null } = {}) {
    if (!blue && !red) return;
    this.tacticOn = true;
    this.tacticMeta = meta;
    this.tk = { blue: blue ?? this._neutralKnobs(), red: red ?? this._neutralKnobs() };
    let y = (this.seed ^ 0x9e3779b9) | 0;
    this.rng2 = () => ((y = (y * 1103515245 + 12345) & 0x7fffffff) >>> 0) / 0x7fffffff;
    const E = () => ({ invadeAttempts: 0, invadeKills: 0, topGanks: 0, midGanks: 0, botGanks: 0, gankKills: 0,
      dragonContests: 0, baronContests: 0, groupedFights: 0, splitPushActions: 0, towerPushes: 0, supportRoams: 0 });
    this.exec = { blue: E(), red: E() };
    this._tac = {};
    for (const side of ["blue", "red"]) {
      const K = this.tk[side];
      const st = { gankLane: null, gankUntil: 0, gankNext: 25 + this.rng2() * 15, invadeUntil: 0,
        splitEvalT: -1, splitGo: false, splitTick: -99, pushTick: -99,
        roamUntil: 0, roamNext: 35 + this.rng2() * 15, inFight: false, dragonSeen: false, baronSeen: false };
      // 開局入侵決策。S28：入侵率吃該側**打野**（席位 b2/r2）的 invadeAdj；
      //   無能力層 ⇒ 原值。無論如何 rng2 都抽一次 ⇒ 序列不變。
      const jg = this._modById(side[0] + "2");
      const invadeChance = jg ? clamp(K.invadeChance + jg.invadeAdj, 0, 1) : K.invadeChance;
      if (this.rng2() < invadeChance) { st.invadeUntil = 50; this.exec[side].invadeAttempts++; }
      this._tac[side] = st;
    }
  }
  /**
   * 團戰參與率：依 hot 是否為龍/巴龍坑取對應 knob（原固定 0.6）。
   * S28：M（選手能力 mods）存在時再疊加 joinAdj / objAdj。
   * ⚠ M 為 null ⇒ **原封不動回傳原值**（不 clamp）：確保無論戰術 knob 落在什麼
   *   範圍，S24 baseline 都逐位元不變。
   */
  _joinChance(K, hot, M = null) {
    const pit = hot === PITS.dragon ? "dragonJoin" : hot === PITS.baron ? "baronJoin" : null;
    const base = K ? (pit ? K[pit] : K.joinFight) : 0.6;
    if (!M) return base;
    return clamp(base + (pit ? M.objAdj : M.joinAdj), 0.05, 0.98);
  }

  // ── S28 選手能力層（configurePlayers）───────────────────────────────────
  /**
   * 啟用選手能力（最小改動入口；不呼叫 = 舊行為位元不變）。
   *
   * 與 S24 戰術層同構：**mods 形狀由呼叫端準備**（battle/moba/mobaPlayerStats
   * .toEnginePlayerMods），本檔不 import 契約、不認得 16 項能力的鍵名，只吃
   * 算好的行為偏移量。能力只改「門檻 / 機率 / 節奏 / 深度」——
   * **沒有任何傷害、勝率、金錢係數**（power / tough 一律不受能力影響）。
   *
   * rng 保證：本層**不新增任何 rng 抽樣**，只把既有抽樣要比對的門檻平移。
   *   ⇒ rng / rng2 序列完全不變，中性能力（mods 全 0 / 倍率 1）⇒ 逐位元 baseline。
   *
   * 呼叫順序：configurePlayers **應在 configureMatch 之前**呼叫——開局野區入侵
   *   在 configureMatch 當下擲骰，需要打野的 invadeAdj。順序反了不會壞，只是
   *   該場入侵率不吃能力（其餘作用點仍生效）。
   *
   * @param {object} blue/red  { [engineId]: mods }（engineId = b1–b5 / r1–r5）
   * @param {object} meta      { version, neutralStat, blueIds, redIds } → snapshot
   */
  configurePlayers({ blue = null, red = null, meta = null } = {}) {
    if (!blue && !red) return;
    this.playerStatsOn = true;
    this.playerStatsMeta = meta;
    this.pmod = { ...(blue ?? {}), ...(red ?? {}) };   // 以 engineId 為鍵（兩側 id 不重疊）
    // 每位選手的真實行為計數（純儀器化；只在啟用能力層時出現在 snapshot）
    this.pexec = {};
    for (const p of this.players) this.pexec[p.id] = { retreats: 0, fights: 0, objTicks: 0 };
  }
  /** 依 engineId 取 mods；未啟用 / 該席位無資料 ⇒ null（＝走原始路徑）。 */
  _modById(id) { return this.playerStatsOn ? (this.pmod[id] ?? null) : null; }
  /** 該選手的能力 mods；未啟用 / 該席位無資料 ⇒ null（＝走原始路徑）。 */
  _mod(p) { return this._modById(p.id); }

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
    const lateFactor = 1 + Math.max(0, this.t - 360) / 600;

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
      if (p.dead) { p.respawn -= dt; if (p.respawn <= 0) { p.dead = false; p.hp = p.maxHp; p.retreating = false; p.hitBy.clear(); const f = FOUNTAIN[p.side]; p.pos = { x: f.x, y: f.y }; p.state = "回防"; } continue; }
      p.atkCd -= dt;
      // S24：K/S 只在啟用戰術時存在；未啟用 ⇒ 下方全部走原始路徑（含原 rng 序列）
      const K = this.tacticOn ? this.tk[p.side] : null;
      const S = this.tacticOn ? this._tac[p.side] : null;
      // S28：M＝該選手能力 mods（未啟用/該席位無資料 ⇒ null ⇒ 下方全部走原始路徑）
      const M = this._mod(p);
      // 撤退遲滯：<25% 進入撤退，回到 60% 才重返戰場（避免在門檻抖動→全隊永久卡撤退）
      // S24：撤退門檻改由 riskTolerance 派生（K.retreatAt ∈ 0.15–0.34；預設 0.25 不變）
      // S28：能力再疊加——走位/決策/專注 → 早撤；勇氣/抗壓/韌性 → 硬撐；韌性/反應 → 更快回場
      const retreatAt0 = K ? K.retreatAt : 0.25;
      const retreatAt = M ? clamp(retreatAt0 + M.retreatAdj, 0.10, 0.45) : retreatAt0;
      const returnAt = M ? clamp(0.60 + M.returnAdj, 0.45, 0.80) : 0.60;
      if (p.hp < p.maxHp * retreatAt) {
        if (this.playerStatsOn && !p.retreating) this.pexec[p.id].retreats++;   // 真實計數
        p.retreating = true;
      } else if (p.hp >= p.maxHp * returnAt) p.retreating = false;
      let tgt, st, effLane = p.lane, stOv = null;
      // S24：帶線分推 —— 指定分推路的選手在會戰熱點出現時仍留線推進（黏性決策，6 秒重評一次）
      let skipFight = false;
      if (K && hot && K.splitLane === p.lane && p.role !== "jungle" && p.role !== "sup") {
        // S28：分推承諾度 += splitAdj（應變/決策/勇氣/專注）
        if (this.t > S.splitEvalT) { S.splitEvalT = this.t + 6; S.splitGo = this.rng2() < (M ? clamp(K.splitPush + M.splitAdj, 0, 1) : K.splitPush); }
        if (S.splitGo) {
          skipFight = true; stOv = "帶線";
          if (this.t - S.splitTick > 8) { S.splitTick = this.t; this.exec[p.side].splitPushActions++; }
        }
      }
      // S24：開局野區入侵（configureMatch 時擲骰；打野＋跟進中路在前 50 秒壓入敵方野區）
      let tacTgt = null;
      if (K && !p.retreating && this.t < (S.invadeUntil || 0) && (p.role === "jungle" || (K.invadeWithMid && p.role === "mid"))) {
        tacTgt = p.side === "blue" ? { x: 62, y: 30 } : { x: 38, y: 70 }; stOv = "入侵";
      }
      // S24：打野 Gank 節奏機（依 tempo 週期、依權重挑路；到點後 9 秒壓該路前線）
      if (K && !tacTgt && p.role === "jungle" && !p.retreating) {
        if (this.t >= S.gankNext && !hot) {
          const w = K.gankWeights, tot = w.top + w.mid + w.bot;
          const r = this.rng2() * tot;
          S.gankLane = r < w.top ? "top" : r < w.top + w.mid ? "mid" : "bot";
          // S28：Gank 節奏吃打野能力——視野/手速/決策 → 週期變短（更常抓）、停留窗變長
          S.gankUntil = this.t + 9 * (M ? M.gankWindowScale : 1);
          S.gankNext = this.t + K.gankInterval * (M ? M.gankIntervalScale : 1) + this.rng2() * 12;
          this.exec[p.side][S.gankLane + "Ganks"]++;
        }
        if (this.t < S.gankUntil) { effLane = S.gankLane; stOv = "抓人"; }
      }
      // S24：輔助遊走（無會戰時依 roamRate 週期性走中路製造人數差）
      if (K && !tacTgt && p.role === "sup" && !p.retreating && !hot) {
        // S28：遊走率 += roamAdj（視野/溝通/手速/領導）——輔助的主要作用點
        if (this.t >= S.roamNext) { S.roamNext = this.t + 40 + this.rng2() * 15; if (this.rng2() < (M ? clamp(K.roamRate + M.roamAdj, 0, 1) : K.roamRate)) { S.roamUntil = this.t + 8; this.exec[p.side].supportRoams++; } }
        if (this.t < S.roamUntil) { effLane = "mid"; stOv = "遊走"; }
      }
      if (p.retreating) { tgt = FOUNTAIN[p.side]; st = "撤退"; }
      else if (tacTgt) { tgt = tacTgt; st = stOv; }
      // S28：團戰/目標集結門檻 += joinAdj（勇氣/戰術/配合/溝通/反應＋隊伍領導平均）
      //   或 objAdj（龍/巴龍坑：視野/戰術/專注/溝通＋隊伍領導平均）。
      //   ⚠ 抽樣次數與來源流不變（K ⇒ rng2、無 K ⇒ rng）；只平移門檻。
      else if (!skipFight && hot && (p.role === "jungle" || p.role === "sup" || (K ? this.rng2() < this._joinChance(K, hot, M) : this.rng() < this._joinChance(null, hot, M)))) { tgt = hot; st = "團戰!"; }
      else {
        const ftw = this.frontTower(p.side, effLane);
        if (!ftw) { tgt = BASE[p.side === "blue" ? "red" : "blue"]; st = "圍攻"; }   // 該路已清 → 圍攻主堡
        else {
          // 壓向該路敵方前線塔（塔破 frontTower 前移 → 自然逐塔推進）
          // S24：推線深度偏移（lanePlan/aggression/towerPriority 派生，±0.09；未啟用 = 0）
          let base = p.side === "blue" ? 0.30 + this.t / 600 : 0.70 - this.t / 600;
          if (K) base += (p.side === "blue" ? 1 : -1) * (K.laneOffset[effLane] || 0);
          // S28：推線深度 += laneAdj（勇氣/手速/抗壓 → 壓得更深；走位/決策 → 站得更安全）
          if (M) base += (p.side === "blue" ? 1 : -1) * M.laneAdj;
          const adv = p.side === "blue" ? clamp(Math.min(base, ftw.t + 0.02), 0.3, 0.98) : clamp(Math.max(base, ftw.t - 0.02), 0.02, 0.7);
          tgt = posOnLane(effLane, adv); st = stOv ?? (p.role === "jungle" ? "游走" : "對線");
        }
      }
      const d = dist(p.pos, tgt), spd = (st === "團戰!" ? 16 : 13) * dt;
      if (d > 0.6) { p.pos.x += ((tgt.x - p.pos.x) / d) * Math.min(spd, d); p.pos.y += ((tgt.y - p.pos.y) / d) * Math.min(spd, d); }
      for (const o of WALLS) { const dd = dist(p.pos, o); if (dd < o.r + 1.4) { p.pos.x += ((p.pos.x - o.x) / (dd || 1)) * (o.r + 1.4 - dd); p.pos.y += ((p.pos.y - o.y) / (dd || 1)) * (o.r + 1.4 - dd); } }
      p.pos.x = clamp(p.pos.x, 3, 97); p.pos.y = clamp(p.pos.y, 3, 97);
      // S28：個人行為計數（真實觀測，非編造）——進入團戰的次數、貼在存活目標坑的 tick 數。
      //   紅方（無能力資料）同樣計數 ⇒ 天然對照組：藍方隨天賦變、紅方不變。
      if (this.playerStatsOn) {
        if (st === "團戰!" && p.state !== "團戰!") this.pexec[p.id].fights++;
        if (this.dragon.alive && dist(p.pos, PITS.dragon) < 9) this.pexec[p.id].objTicks++;
        if (this.baron.alive && dist(p.pos, PITS.baron) < 9) this.pexec[p.id].objTicks++;
      }
      p.state = st;
      // 回血：靠泉水快速回、脫離戰鬥緩慢回（下方交戰若成立會覆寫 inCombat）
      const nearFountain = dist(p.pos, FOUNTAIN[p.side]) < 10;
      const foe = alive.find((q) => q.side !== p.side && !q.dead && dist(p.pos, q.pos) < 8);
      if (nearFountain) { const h = Math.min(p.maxHp, p.hp + p.maxHp * 0.20 * dt) - p.hp; p.hp += h; p.heal += h; }
      else if (!foe) { const h = Math.min(p.maxHp, p.hp + p.maxHp * 0.02 * dt) - p.hp; p.hp += h; p.heal += h; }
      if (foe) {
        const dmgAmt = p.power * dt * 0.92 * lateFactor;
        foe.hp -= dmgAmt; p.dmg += dmgAmt; foe.hitBy.set(p.id, this.t); // Sprint06：傷害/助攻追蹤（附加）
        if (p.atkCd <= 0) { this.pushFx({ type: this.rng() < 0.2 ? "ult" : "line", pos: { ...p.pos }, target: { ...foe.pos }, color: SIDE[p.side] }); p.atkCd = 0.5; }
        if (foe.hp <= 0 && !foe.dead) {
          foe.dead = true; foe.respawn = 6 + Math.min(this.t / 30, 20); foe.hp = 0;
          if (p.side === "blue") this.bK++; else this.rK++;
          p.k += 1; foe.d += 1; // Sprint04：個人統計（附加）
          const assists = []; // Sprint06：助攻結算（8 秒窗，附加）
          for (const [aid, at] of foe.hitBy) { if (aid !== p.id && this.t - at <= 8) { const q = this.players.find((x) => x.id === aid && x.side === p.side); if (q) { q.a += 1; assists.push(aid); } } }
          foe.hitBy.clear();
          this._dmgGold(p.side, 300); p.gold += 300;
          this.feed.unshift({ id: this._mid++, killer: p.id, victim: foe.id, side: p.side, assists, vpos: { x: foe.pos.x, y: foe.pos.y } }); this.feed = this.feed.slice(0, 5);
          this.pushFx({ type: "ult", pos: { ...foe.pos }, color: 0xfbbf24, exp: 0.6 });
          // S24：擊殺歸因（真實計數，非編造）——Gank 窗內打野擊殺 / 入侵窗內中野擊殺
          if (this.tacticOn) {
            const S2 = this._tac[p.side];
            if (p.role === "jungle" && this.t < S2.gankUntil) this.exec[p.side].gankKills++;
            if (this.t < (S2.invadeUntil || 0) && (p.role === "jungle" || p.role === "mid")) this.exec[p.side].invadeKills++;
          }
        }
      }
      let tw = this.frontTower(p.side, effLane);
      if (!tw && this.laneCleared(p.side)) tw = this.towers[(p.side === "blue" ? "red" : "blue") + "_nexus"];
      if (tw && dist(p.pos, tw.pos) < 6 && !alive.some((q) => q.side !== p.side && dist(q.pos, tw.pos) < 9)) {
        const td = 40 * dt * lateFactor; tw.hp -= td; p.twrDmg += td;
        // S24：推塔波次（同隊 10 秒節流一次的真實計數）
        if (K && this.t - S.pushTick > 10) { S.pushTick = this.t; this.exec[p.side].towerPushes++; }
      }
    }
    // S24：會戰/目標戰觀測（真實狀態計數；only when tacticOn）
    if (this.tacticOn) {
      for (const side of ["blue", "red"]) {
        const S3 = this._tac[side];
        const fighters = this.players.filter((q) => q.side === side && !q.dead && q.state === "團戰!").length;
        if (fighters >= 3 && !S3.inFight) { S3.inFight = true; this.exec[side].groupedFights++; }
        else if (fighters < 2) S3.inFight = false;
        for (const [obj, key] of [[this.dragon, "dragon"], [this.baron, "baron"]]) {
          if (obj.alive) {
            if (!S3[key + "Seen"] && this.players.some((q) => q.side === side && !q.dead && dist(q.pos, PITS[key]) < 9)) {
              S3[key + "Seen"] = true; this.exec[side][key + "Contests"]++;
            }
          } else S3[key + "Seen"] = false;
        }
      }
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
      players: this.players.map((p) => ({ id: p.id, side: p.side, role: p.role, pos: { ...p.pos }, hp: clamp(p.hp / p.maxHp, 0, 1), dead: p.dead, respawn: p.respawn, state: p.state, k: p.k, d: p.d, a: p.a, gold: Math.round(p.gold), dmg: Math.round(p.dmg), heal: Math.round(p.heal), twrDmg: Math.round(p.twrDmg), lv: p.lv })),
      towers: Object.fromEntries(Object.entries(this.towers).map(([k, t]) => [k, { side: t.side, lane: t.lane, tier: t.tier, pos: t.pos, hp: clamp(t.hp / (t.lane === "nexus" ? NEXUS_HP : TOWER_HP), 0, 1) }])),
      lanes: { top: this._snapLane("top"), mid: this._snapLane("mid"), bot: this._snapLane("bot") },
      dragon: { ...this.dragon }, baron: { ...this.baron },
      fx: this.fx.map((f) => ({ ...f })), feed: this.feed.slice(),
      bK: this.bK, rK: this.rK, bGold: this.bGold, rGold: this.rGold, winProb, over: this.over, winner: this.winner,
      // S24：戰術中繼資料與執行統計（只在啟用戰術時出現 → 舊快照形狀不變）
      ...(this.tacticOn ? {
        tacticMeta: this.tacticMeta ? { ...this.tacticMeta } : null,
        tacticExec: { blue: { ...this.exec.blue }, red: { ...this.exec.red } },
      } : {}),
      // S28：能力層中繼資料與個人行為統計（同樣只在啟用時出現 → 舊快照形狀不變；
      //   BattleResult.v2 逐欄挑選、不 spread snapshot ⇒ 契約不受影響）
      ...(this.playerStatsOn ? {
        playerStatsMeta: this.playerStatsMeta ? { ...this.playerStatsMeta } : null,
        playerStatsExec: Object.fromEntries(Object.entries(this.pexec).map(([id, e]) => [id, { ...e }])),
      } : {}),
    };
  }
  _snapLane(ln) {
    return { bm: this.lanes[ln].bm.map((m) => ({ id: m.id, t: m.t })), rm: this.lanes[ln].rm.map((m) => ({ id: m.id, t: m.t })) };
  }
}
