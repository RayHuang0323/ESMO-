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
  clamp, dist, posOnLane, laneLength, WALLS, PITS, BASE, FOUNTAIN, TOWER_T,
  ROLES, ROLE_LANE, TOWER_HP, NEXUS_HP, SIDE, BUSHES, CAMPS,
  WORLD_BOUNDS, INVASION_POINT,
} from "./gameData.js";
//  H.2：英雄碰撞與尋路的**唯一真實來源**。
//  ⚠ 這裡刻意**不再** import gameData.WALLS：那是 28 個手寫圓，和畫面上的真實牆體
//    對不起來（英雄會穿基地牆、穿岩壁、穿塔、穿主堡、穿坑壁）。H.2 起碰撞一律走
//    mobaNavigation（由地圖 wallItems 柵格化的距離場 + 動態結構圓）。
//    `gameData.WALLS` 只剩 legacy 畫面在用，不再是碰撞來源。
import {
  HERO_RADIUS, moveTowards, projectToWalkable, findPath, recenterToCorridor, lineWalkable,
} from "./battle/moba/nav/mobaNavigation.js";
//  H.2：塔位的單一真實來源（由地圖呈現座標推回 lane t），取代 posOnLane(lane, TOWER_T)。
import {
  towerPlacementById, nexusGuardPlacementById,
} from "./battle/moba/map/mobaTowerPlacement.js";
// S29：本場英雄等級/XP 與模擬節奏常數（純資料 + 純函式；引擎不自己定義曲線）
import {
  rulesFor, XP, addMatchXp, powerMultFor, hpMultFor, xpToNext,
} from "./battle/moba/matchProgression.js";

const MAP_EDGE_PAD = 3;
//  H.2 導航調參：近場預判距離與重算路徑的冷卻（tick）。
//  ⚠ 冷卻不能太長：20 tick（10 模擬秒）時英雄會抱著過期路徑繼續磨牆；8 tick 實測
//  把「泉水→中線」的行軍時間從 193s 拉回接近舊引擎的 146s，而 A* 只要 1.3ms。
const NAV_LOOKAHEAD = 25;
const NAV_REPATH_CD = 8;
const clampMapX = (x) => clamp(x, WORLD_BOUNDS.minX + MAP_EDGE_PAD, WORLD_BOUNDS.maxX - MAP_EDGE_PAD);
const clampMapY = (y) => clamp(y, WORLD_BOUNDS.minY + MAP_EDGE_PAD, WORLD_BOUNDS.maxY - MAP_EDGE_PAD);
//  Milestone J：召喚師技能的特效顏色。舊碼是「flash 黃、其餘綠」的三元式，
//  第二格能放八種技能之後，畫面上會分不出剛剛放的是治療還是點燃。
const SPELL_FX_COLOR = {
  flash: 0xfde047, smite: 0x22c55e, teleport: 0x38bdf8, heal: 0x4ade80,
  barrier: 0x93c5fd, ignite: 0xf97316, ghost: 0xc4b5fd, cleanse: 0x67e8f9,
};

export class LogicEngine {
  /**
   * @param {number} seed
   * @param {object|null} loadout   Hero Progress（英雄熟練 → power/tough 倍率）
   * @param {object} [opts]
   * @param {"v1"|"v2"} [opts.rules="v2"]  模擬規則集。
   *   v2（預設）= S29 校準後：本場 XP/等級、真實移速、修好的小兵拆塔。
   *   v1        = S28 之前的舊節奏（**壞的**），只保留供 baseline 對照與回歸比較。
   */
  constructor(seed = 1, loadout = null, opts = {}) {
    let x = seed | 0; this.rng = () => ((x = (x * 1664525 + 1013904223) & 0xffffffff) >>> 0) / 0xffffffff;
    this.seed = seed | 0;          // S24：保留 seed 供戰術層 rng2 派生
    this.tacticOn = false;         // S24：未 configureMatch ⇒ 全部戰術程式碼不生效
    this.playerStatsOn = false;    // S28：未 configurePlayers ⇒ 全部能力程式碼不生效
    this.heroesOn = false;         // H：未 configureHeroes ⇒ 全部英雄定位程式碼不生效
    this.hmod = {}; this.heroMeta = null;
    this.spellsOn = false;         // J：未 configureSpells ⇒ 全部召喚師技能 v2 程式碼不生效
    this.spellMeta = null;
    this.rules = rulesFor(opts.rules);   // S29：模擬規則集（v2 預設）
    const R = this.rules;
    this.t = 0; this.over = false; this.winner = null;
    this.bK = 0; this.rK = 0; this.bGold = 500; this.rGold = 500;
    this.mid = 0; this.fx = []; this.waveTimer = R.waveFirst; this.feed = [];
    this.waveNo = 0;             // H.3：兵線波次序號（只供 snapshot / Replay / 呈現）
    this._fxSeq = 0;             // H.3：技能事件序號（Replay 跨取樣窗去重）

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
        const playerId = side[0] + (i + 1);
        // 同職業鏡像局若所有輸入完全相同，雙方會同時接戰／同時撤退而永遠無法收尾。
        // 用 seed + playerId 的固定 hash 作「平手裁決」；不抽 rng、不依迭代順序、
        // 不改任何數值，跨 seeds 對藍紅自然對稱。
        let decisionHash = 2166136261;
        for (const ch of `${this.seed}:${i + 1}`) {
          decisionHash = Math.imul(decisionHash ^ ch.charCodeAt(0), 16777619) >>> 0;
        }
        const decisionMagnitude = 0.15 + ((decisionHash >>> 1) % 41) / 1000;
        const preferBlue = (decisionHash & 1) === 0;
        const decisionTemper = (preferBlue === (side === "blue") ? 1 : -1) * decisionMagnitude;
        //  ⚠ 生成點必須落在可走區。泉水池只有 ±3 的散佈範圍，但泉水外圈牆
        //  （fountain_rim）就貼在旁邊 ⇒ 直接用亂數散佈時實測 10 人裡會有 2 人
        //  一出生就站在牆裡（淨距 1.00 < 英雄半徑 2.4，H.2-close 真實 Chrome 驗收抓到）。
        //  一旦站進牆裡，`moveTowards` 的起點自救只在「投影找得到落點」時有效，
        //  找不到就整場黏在牆裡不動 ⇒ 必須在生成當下就投影。
        //  ⚠ v1/v2 不走這條（它們是歷史基準，維持原本的亂數座標）。
        const spawnRaw = { x: f.x + (this.rng() - 0.5) * 6, y: f.y + (this.rng() - 0.5) * 6 };
        const spawn = R.navCollision
          ? projectToWalkable(spawnRaw.x, spawnRaw.y, HERO_RADIUS, null)
          : spawnRaw;
        this.players.push({
          id: playerId, side, role, lane: ROLE_LANE[role],
          pos: { x: spawn.x, y: spawn.y },
          maxHp: 600 * tough, hp: 600 * tough, power, tough,
          dead: false, respawn: 0, state: "對線", atkCd: 0, gold: 0,
          k: 0, d: 0, // Sprint04：個人擊殺/死亡累計（純附加儀器化，供呈現層讀取）
          a: 0, dmg: 0, heal: 0, hitBy: new Map(), // Sprint06：助攻/傷害/治療儀器化（純附加）
          twrDmg: 0, // Sprint07：個人推塔傷害（純附加）
          lv, // Sprint08：**英雄熟練等級**（跨場，來自 Hero Progress loadout）— 不是本場等級
          // ── S29：本場英雄等級（單場，終局丟棄）──────────────────────────
          //   與上面的 lv 是**兩套資料**，刻意不同名以防混用（見 matchProgression.js 檔頭）。
          mlv: 1, mxp: 0, mxpBank: 0, xpLevelTick: -Infinity,
          basePower: power,        // Lv1 基準（等級成長以此為錨，不會累乘漂移）
          baseMaxHp: 600 * tough,
          // ── S29B1（v3）交戰狀態機 / 召喚師技能欄位 ─────────────────────
          //   純資料欄位：v1/v2 完全不讀取 ⇒ 舊規則位元行為不變（不消耗 rng）。
          fsm: "LANE", fsmUntil: 0,     // 狀態機（LANE/SETUP/ENGAGE/CHASE/DISENGAGE/RETREAT/RECALL/RESPAWN/RETURN/OBJECTIVE/FARM/ROAM）
          reengageAt: 0,                // 重新接戰冷卻（復活鎖 / 團戰解散冷卻）
          joinEvalT: -1, joinGo: false, // 參團決策黏性（每 joinEvalPeriod 秒重評）
          objEvalT: -1, objGo: false,   // 目標參與決策黏性
          chaseId: null, chaseUntil: 0, chaseFrom: null,  // 追擊：對象 / 期限 / 錨點
          deathsT: [],                  // 近期死亡時刻（連死保守化觀測窗）
          contactSince: null,           // 連續接觸起點（killContext.duration 用）
          // Milestone D-fix2：v3 可解釋局部決策。只影響移動意圖；不抽 rng、
          // 不改傷害，snapshot 的 decision 供 verifier／完整戰鬥觀察使用。
          decisionAt: -1, decisionAction: "LANE", decisionTargetId: null,
          decisionScore: 0, decisionReasons: [], decisionTemper,
          sp: {                         // 召喚師技能（F/D 兩格）
            f: { id: "flash", readyAt: 0, lastUsedAt: null, lastReason: null, uses: 0 },
            d: role === "jungle"
              ? { id: "smite", readyAt: 0, lastUsedAt: null, lastReason: null, uses: 0 }
              : { id: null, status: "reserved" },   // 無可靠引擎作用點 ⇒ 明確 reserved，不虛構
          },
          // ── S29B3：回城 channel ─────────────────────────────────────────
          recallT: 0,          // 引導剩餘秒數（>0 = 回城中，原地不動）
          recallHpLast: 0,     // 上一 tick 血量（受擊中斷判定）
          recallCdAt: 0,       // 中斷後的重試冷卻
          // Milestone D：有限時戰鬥 Buff／Debuff。until 是模擬秒絕對時間；
          // v1/v2 永遠不讀，snapshot 只輸出剩餘秒數。
          redBuffUntil: 0, blueBuffUntil: 0, redSlowUntil: 0,
          // Milestone J：召喚師技能 v2 的狀態欄。純資料：只有 `spellsOn`
          //   （configureSpells 之後）才會被讀寫 ⇒ 不呼叫就恆為初值，
          //   傷害與 rng 序列逐位元不變。
          shield: 0, shieldUntil: 0,          // 護盾（先扣盾再扣血）
          igniteUntil: 0, igniteBy: null,     // 點燃：持續傷害與擊殺歸屬
          healCutUntil: 0,                    // 治療減益（點燃附帶）
          hasteUntil: 0,                      // 幽魂：移速加成
          cleanseUntil: 0,                    // 淨化：短暫免疫再減速
        });
      });
    });

    this.towers = {};
    for (const lane of ["top", "mid", "bot"]) {
      ["blue", "red"].forEach((side) =>
        TOWER_T[side].forEach((t, tier) => {
          const id = `${side}_${lane}_${tier}`;
          //  H.2：塔位改採**單一真實來源**（地圖呈現座標）。
          //  舊寫法用 posOnLane(lane, TOWER_T) 算出來的位置，和畫面上畫的塔平均差 15.4
          //  單位（最大 25.7），而推塔判定距離只有 9 ⇒ 18 座塔有 12 座推不到。
          //  取不到 placement 時退回舊算法（不靜默變成 undefined）。
          //  ⚠ 只有 `navCollision` 規則集（v3）採用；v1/v2 是**歷史基準**，
          //  runtime29 §12/§23 會拿它們重現舊節奏，換了塔位就不再是同一個基準。
          const pl = R.navCollision ? towerPlacementById(id) : null;
          this.towers[id] = pl
            ? { side, lane, tier, t: pl.t, pos: { x: pl.x, y: pl.y }, hp: TOWER_HP, atkCd: 0, targetId: null, targetKind: null, lockShots: 0 }
            : { side, lane, tier, t, pos: posOnLane(lane, t), hp: TOWER_HP, atkCd: 0, targetId: null, targetKind: null, lockShots: 0 };
        }));
    }
    if (R.nexusGuards) {
      for (const side of ["blue", "red"]) {
        for (const index of [0, 1]) {
          const id = `${side}_nexus_${index}`;
          const pl = nexusGuardPlacementById(id);
          if (!pl) continue;
          this.towers[id] = {
            side, lane: "nexus_guard", tier: index,
            // 小兵路線尚未延伸進基地廣場；t 只作既有端點攻城判定，
            // 英雄、碰撞與 renderer 一律使用正式 pl.pos。
            t: side === "blue" ? 0.02 : 0.98,
            pos: { x: pl.x, y: pl.y },
            hp: R.nexusGuardHp ?? TOWER_HP, maxHp: R.nexusGuardHp ?? TOWER_HP,
            atkCd: 0, targetId: null, targetKind: null, lockShots: 0,
          };
        }
      }
    }
    this.towers["blue_nexus"] = { side: "blue", lane: "nexus", tier: 9, t: 0.02, pos: BASE.blue, hp: NEXUS_HP, atkCd: 0, targetId: null, targetKind: null, lockShots: 0 };
    this.towers["red_nexus"] = { side: "red", lane: "nexus", tier: 9, t: 0.98, pos: BASE.red, hp: NEXUS_HP, atkCd: 0, targetId: null, targetKind: null, lockShots: 0 };

    this.lanes = { top: { bm: [], rm: [] }, mid: { bm: [], rm: [] }, bot: { bm: [], rm: [] } };
    this.dragon = { alive: false, hp: 100, respawn: R.neutralObjectives ? R.dragonSpawn : 90, contested: false };
    this.baron = { alive: false, hp: 100, respawn: R.neutralObjectives ? R.baronSpawn : 300, contested: false };
    this._mid = 1;

    // ── S29B1（v3）：中立目標實體 / 狀態機隊伍層 / 技能與擊殺紀錄 ──────────────
    //   v1/v2：neutrals=null、fsm3=null ⇒ 舊路徑一行都不會執行。
    this.killContexts = [];   // [{ id, t, type, location, participants, startedAt, duration }]
    this.spellLog = [];       // [{ id, t, playerId, side, spell, reason, from, to }]
    this._spellSeq = 1;
    this.recallLog = [];      // S29B3：回城事件 [{ id, t, playerId, side, phase, from? }]
    this._recallSeq = 1;
    if (R.neutralObjectives) {
      const mk = (id, type, side, pos, maxHp, spawnAt, respawn, presentationKey = id) => {
        const isCamp = type === "camp" || type === "buff";
        // Milestone C-fix：營地不再是一條群體 HP。三個成員各自保有生命、
        // 受擊、攻擊 CD 與仇恨；offset 對齊既有 mapMonsterShapes 正式群體輪廓，
        // 不在引擎複製模型資料，也不改營地總 HP。
        const weights = type === "buff" ? [0.6, 0.2, 0.2] : [0.46, 0.29, 0.25];
        const offsets = type === "buff"
          ? [[0, 0], [-3.4, -3.5], [-3.4, 3.5]]
          : [[2.2, 0], [-2.2, -2.7], [-2.2, 2.7]];
        const members = isCamp ? offsets.map(([dx, dy], index) => ({
          id: `${id}:${index}`, index, dx, dy, pos: { x: pos.x + dx, y: pos.y + dy },
          homePos: { x: pos.x + dx, y: pos.y + dy }, hp: 0, maxHp: maxHp * weights[index],
          alive: false, targetId: null, atkCd: 0, hitAt: -Infinity, attackAt: -Infinity,
          spawnAt, respawnAt: spawnAt, deathAt: null, spawnedOnce: false,
          killerTeam: null, participants: new Set(), dmgBy: { blue: 0, red: 0 },
          _settled: false,
        })) : null;
        return {
          id, type, side, presentationKey, pos: { ...pos }, homePos: { ...pos }, alive: false, hp: 0, maxHp,
          spawnAt, respawnAt: spawnAt, respawn, killerTeam: null,
          deathAt: null, spawnedOnce: false,
          participants: new Set(), dmgBy: { blue: 0, red: 0 }, members,
          state: "idle", targetId: null, atkCd: 0, hitAt: -Infinity,
          attackAt: -Infinity,
          idlePhase: String(id).split("").reduce((n, ch) => (n * 33 + ch.charCodeAt(0)) % 628, 0) / 100,
        };
      };
      const list = [
        mk("dragon", "dragon", null, PITS.dragon, R.dragonHp, R.dragonSpawn, R.dragonRespawn ?? R.objRespawn),
        mk("baron", "baron", null, PITS.baron, R.baronHp, R.baronSpawn, R.baronRespawn ?? R.objRespawn),
        ...CAMPS.map((c) => mk(c.id, c.type, c.side, { x: c.x, y: c.y },
          c.type === "buff" ? R.buffCampHp : R.campHp, R.campFirstSpawn, R.campRespawn, c.presentationKey)),
      ];
      this.neutrals = { list, dragon: list[0], baron: list[1], camps: list.slice(2) };
    } else this.neutrals = null;
    const initSide = () => ({
      objEvalT: -1, objGo: false, objUntil: 0, objKey: null,
      gankLane: null, gankUntil: 0, gankNext: 45, dragonStacks: 0, baronBuffUntil: 0,
      // ── Milestone F：團戰勝方的主動權窗 ───────────────────────────────
      //   initKind: "baron" | "dragon" | "siege" | null；siege 時 initTarget 是塔 id。
      initUntil: 0, initKind: null, initTarget: null, initFrom: null,
      defendUntil: 0,          // 敗方：短暫回防窗
    });
    this.fsm3 = R.engagementFsm ? { blue: initSide(), red: initSide() } : null;
    this.hot3 = null;         // 上一 tick 的團戰熱點（解散 ⇒ 參與者 DISENGAGE）
    // Milestone F：進行中的團戰（帶遲滯；接觸暫斷不算結束）。v1/v2 永遠是 null。
    this.fight3 = null;
    this.fightLog = [];       // [{ start, end, dur, deaths, winner, kind, converted }]（觀測用）
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
      if (this.rng2() < invadeChance) { st.invadeUntil = this.rules.invasionWindow ?? 50; this.exec[side].invadeAttempts++; }
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
  // ── Milestone H：英雄定位層（configureHeroes）──────────────────────────
  /**
   * 英雄定位 → 行為偏移。與 S28 的能力層同構、同一組限幅風格，
   * 但**只影響行為**（站位距離／目標選擇／進退／參團／技能就緒權重），
   * 絕不乘進傷害（S28 §2 紅線；理由見 mobaHeroProfile.js 檔頭）。
   *
   * 不呼叫 ⇒ `heroesOn` 為 false ⇒ 全部相關程式碼短路 ⇒ 與 Milestone G 逐位元相同。
   * @param {object} blue/red  { [engineId]: mods }
   * @param {object} meta      { version, arch } → snapshot.heroMeta
   */
  configureHeroes({ blue = null, red = null, meta = null } = {}) {
    if (!blue && !red) return;
    this.heroesOn = true;
    this.heroMeta = meta;
    this.hmod = { ...(blue ?? {}), ...(red ?? {}) };
  }
  /** 該英雄的定位 mods；未啟用 / 無資料 ⇒ null（＝走原始路徑）。 */
  _heroMod(p) { return this.heroesOn ? (this.hmod[p.id] ?? null) : null; }

  // ── Milestone M：戰鬥原型層（configureArchetypes）──────────────────────
  /**
   * 近戰／遠程、交戰距離、追擊距離與站位線位。
   *
   * 沿用既有的四個 opt-in 行為層慣例（configureMatch / configurePlayers /
   * configureHeroes / configureSpells）：
   *   · **不呼叫 = 逐位元回到舊行為**（交戰距離恆為硬編碼的 8）
   *   · 形狀由呼叫端準備（引擎不 import heroDatabase、不認得 heroId）
   *   · 只改「打得到誰、站哪裡」，**不改任何傷害公式、不新增抽樣**
   *
   * @param blue/red `{ playerId: { attackType, engageRange, preferredDistance,
   *                    chaseDistance, retreatDistance, formationLine, formationSpread } }`
   */
  configureArchetypes({ blue = null, red = null, meta = null } = {}) {
    if (!blue && !red) return;
    this.archOn = true;
    this.archMeta = meta;
    this.arch = { ...(blue ?? {}), ...(red ?? {}) };
  }
  /** 該英雄的戰鬥原型；未啟用 / 無資料 ⇒ null（＝走原始路徑）。 */
  _arch(p) { return this.archOn ? (this.arch[p.id] ?? null) : null; }
  /** 交戰距離：有原型就用原型的，否則沿用舊的硬編碼 8。 */
  _engageRange(p) { return this._arch(p)?.engageRange ?? 8; }

  /**
   * Milestone M：職業站位。把「要去哪裡」的目標點依戰鬥原型微調。
   *
   * 刻意做得很便宜——**沒有新的尋路、沒有群體 AI**：只是把既有的 `tgt` 沿著
   * 「我 → 敵人」這條線推到 `preferredDistance`，再加一個**決定性的**側向 slot 偏移。
   * 真正的走路仍然交給既有的 `_navMove`（碰撞、牆體、A* 全部不變）。
   *
   * 六個線位：
   *   front（坦克／戰士）壓到 preferredDistance，站得寬
   *   back （法師／射手）維持 preferredDistance；敵人比 retreatDistance 近就往後挪
   *   flank（刺客）      走側向切入，不站在正面
   *   support（輔助）    貼在最需要保護的隊友旁，同時和敵人保持距離
   *
   * ⚠ 決定性：slot 由 playerId 的字元碼推導，沒有亂數、不看時間。
   * ⚠ 未啟用原型層 ⇒ 直接回傳原本的 tgt，一個位元都不動。
   */
  _archPosition(p, tgt, alive) {
    const a = this._arch(p);
    if (!a || !tgt) return tgt;
    //  最近的敵方英雄當作站位錨點（沒有敵人就不調整，維持推線目標）
    let foe = null, fd = Infinity;
    for (const q of alive) {
      if (q.side === p.side || q.dead) continue;
      const dd = dist(p.pos, q.pos);
      if (dd < fd) { fd = dd; foe = q; }
    }
    //  錨點太遠 ⇒ 還在行軍，維持原本的推線／游走目標
    if (!foe || fd > a.chaseDistance + 6) return tgt;

    //  決定性 slot：同一條線上的隊友靠這個散開，不會疊成一點
    const seat = String(p.id);
    const slot = ((seat.charCodeAt(seat.length - 1) || 0) % 5) - 2;   // -2..2
    const ux = (foe.pos.x - p.pos.x) / (fd || 1);
    const uy = (foe.pos.y - p.pos.y) / (fd || 1);
    const px = -uy, py = ux;                                          // 垂直向量
    const lateral = slot * (a.formationSpread ?? 2) * 0.55;

    let want = a.preferredDistance;
    if (a.formationLine === "back" || a.formationLine === "support") {
      //  遠程／輔助：敵人比 retreatDistance 更近就往後拉開（有限度，不是無限風箏）
      if (a.retreatDistance > 0 && fd < a.retreatDistance) want = a.retreatDistance + 0.6;
    }
    //  站到「離敵人 want 距離」的點上，再加側向 slot 偏移
    let gx = foe.pos.x - ux * want + px * lateral;
    let gy = foe.pos.y - uy * want + py * lateral;

    if (a.formationLine === "flank") {
      //  刺客：從側面切入（側向權重更大），但不繞遠路——只是把接近角度推開
      gx += px * (slot >= 0 ? 2.2 : -2.2);
      gy += py * (slot >= 0 ? 2.2 : -2.2);
    } else if (a.formationLine === "support") {
      //  輔助：往「最需要保護的隊友」靠（血量比例最低的在場隊友）
      let ally = null, worst = Infinity;
      for (const q of alive) {
        if (q.side !== p.side || q.id === p.id || q.dead) continue;
        const r = q.hp / Math.max(1, q.maxHp);
        if (r < worst) { worst = r; ally = q; }
      }
      if (ally) { gx = (gx + ally.pos.x * 2) / 3; gy = (gy + ally.pos.y * 2) / 3; }
    }
    return { x: clampMapX(gx), y: clampMapY(gy) };
  }

  // ── Milestone J：召喚師技能層（configureSpells）────────────────────────
  /**
   * 賽前配置的兩個召喚師技能 → 引擎真的會使用的技能欄。
   *
   * 在此之前，第二格是引擎自己決定的：打野固定懲戒、其餘一律 `reserved`
   * ⇒ 賽前選了「傳送／治療／點燃…」在對戰中完全不存在，畫面上有圖示、
   * 引擎卻不認得。這是 Ray 明確點名的「不可只顯示圖示卻沒有引擎效果」。
   *
   * 邊界（與前三個行為層同構）：
   *   · 不呼叫 ⇒ `spellsOn` 為 false ⇒ 全部 v2 程式碼短路，第二格維持舊行為，
   *     傷害與 rng 序列逐位元不變 ⇒ regress / runtime29 的歷史基準不受影響。
   *   · 懲戒是**硬性規則**：打野一定有、非打野一定沒有。賽前資料若違反，
   *     以引擎為準改回來——這是最後一道防線，不是信任呼叫端。
   *
   * @param {object} blue/red  { [engineId]: [spellId, spellId] }
   * @param {object} meta      { version } → snapshot.spellMeta
   */
  configureSpells({ blue = null, red = null, meta = null } = {}) {
    if (!blue && !red) return;
    this.spellsOn = true;
    this.spellMeta = meta;
    const table = { ...(blue ?? {}), ...(red ?? {}) };
    for (const p of this.players) {
      const want = table[p.id];
      if (!Array.isArray(want) || want.length !== 2) continue;
      const known = this.rules.spellCd ?? {};
      const ok = (id) => typeof id === "string" && known[id] != null;
      const isJungle = p.role === "jungle";
      //  懲戒的歸屬由引擎裁決，不看賽前資料怎麼寫。
      const cleaned = want.map((id) => (ok(id) ? id : null))
        .map((id) => (id === "smite" && !isJungle ? null : id));
      if (isJungle && !cleaned.includes("smite")) cleaned[1] = "smite";
      p.sp.f = { id: cleaned[0] ?? "flash", readyAt: 0, lastUsedAt: null, lastReason: null, uses: 0 };
      p.sp.d = cleaned[1]
        ? { id: cleaned[1], readyAt: 0, lastUsedAt: null, lastReason: null, uses: 0 }
        : { id: null, status: "reserved" };
    }
  }

  /** 技能冷卻（單一查表出口；未知技能 ⇒ 用閃現的冷卻，不會變成 undefined）。 */
  _spellCd(spell) {
    const R = this.rules;
    return (R.spellCd && R.spellCd[spell] != null) ? R.spellCd[spell] : R.flashCd;
  }

  /** 這名英雄持有該技能的欄位（沒有 ⇒ null）。 */
  _spellSlot(p, spell) {
    if (p.sp?.f?.id === spell) return p.sp.f;
    if (p.sp?.d?.id === spell) return p.sp.d;
    return null;
  }

  /** 技能是否可用（持有 ＋ 已過冷卻）。 */
  _spellReady(p, spell) {
    const slot = this._spellSlot(p, spell);
    return !!slot && this.t >= slot.readyAt;
  }

  /**
   * Milestone J：英雄受到傷害的唯一出口——先扣護盾再扣血。
   * 未啟用技能層 ⇒ `shield` 恆為 0 ⇒ 與基準逐位元相同（`foe.hp -= amt`）。
   */
  _damageHero(foe, amt) {
    if (this.spellsOn && foe.shield > 0 && this.t < foe.shieldUntil) {
      const absorbed = Math.min(foe.shield, amt);
      foe.shield -= absorbed;
      amt -= absorbed;
      if (foe.shield <= 0) { foe.shield = 0; foe.shieldUntil = 0; }
    }
    foe.hp -= amt;
  }

  /** 依 engineId 取 mods；未啟用 / 該席位無資料 ⇒ null（＝走原始路徑）。 */
  _modById(id) { return this.playerStatsOn ? (this.pmod[id] ?? null) : null; }
  /** 該選手的能力 mods；未啟用 / 該席位無資料 ⇒ null（＝走原始路徑）。 */
  _mod(p) { return this._modById(p.id); }

  // ── S29 本場英雄 XP／等級 ─────────────────────────────────────────────────
  /** 加本場 XP；升級即重算 power/maxHp（雙方對稱，不是勝率係數）。rules v1 ⇒ 完全短路。 */
  _addXp(p, amt, drain = false) {
    if (!this.rules.matchXp || p.dead) return;
    if (this.rules.maxXpLevelsPerTick) {
      if (amt > 0) p.mxpBank = (p.mxpBank ?? 0) + amt;
      if (!(p.mxpBank > 0) || (!(amt > 0) && !drain)) return;
      const alreadyLeveled = p.xpLevelTick === this.t;
      // 同一 tick 最多跨一級；多出的真實 XP 留在 bank，後續 tick 繼續結算，
      // 不丟棄、不偽造，也不會因同幀 7 隻兵死亡讓 UI 從 Lv2 瞬跳 Lv4。
      const currentNeed = xpToNext(p.mlv);
      const nextNeed = xpToNext(p.mlv + 1);
      const room = alreadyLeveled
        ? Math.max(0, currentNeed - p.mxp - 1e-6)
        : Math.max(0, currentNeed - p.mxp) +
          (Number.isFinite(nextNeed) ? Math.max(0, nextNeed - 1e-6) : 0);
      amt = Math.min(p.mxpBank, room);
      if (!(amt > 0)) return;
      p.mxpBank -= amt;
    } else if (!(amt > 0)) return;
    const r = addMatchXp(p.mlv, p.mxp, amt);
    p.mxp = r.mxp;
    if (r.levelsGained > 0) {
      p.mlv = r.mlv;
      if (this.rules.maxXpLevelsPerTick) p.xpLevelTick = this.t;
      this._applyMatchLevel(p);
    }
  }
  /** 等級 → 本場 power / maxHp（以 Lv1 基準錨定；升級補上「新增的那段血」，不是全補）。 */
  _applyMatchLevel(p) {
    p.power = p.basePower * powerMultFor(p.mlv);
    const newMax = p.baseMaxHp * hpMultFor(p.mlv);
    const gain = newMax - p.maxHp;
    p.maxHp = newMax;
    p.hp = Math.min(newMax, p.hp + Math.max(0, gain));
  }
  /** 小兵陣亡 XP：引擎無「補刀」概念 ⇒ 以距離歸屬給敵方英雄（輔助同樣分得到）。 */
  _awardMinionXp(side, pos) {
    const near = this.players.filter((q) => q.side === side && !q.dead && dist(q.pos, pos) < XP.MINION_RADIUS);
    if (!near.length) return;                              // 沒人在線 ⇒ XP 流失（合理：無人吃線）
    const base = this.rules.minionXp ?? XP.MINION;
    const share = this.rules.minionXpShare ?? XP.MINION_SHARE;
    const each = near.length === 1 ? base : base * share;
    for (const q of near) this._addXp(q, each);
  }
  /** 團隊目標 XP：擊殺方**全隊存活者**皆得 ⇒ 輔助/打野不因低擊殺而卡等級（S29 §3）。 */
  _awardObjectiveXp(side, key) {
    const amt = key === "baron" ? XP.BARON : XP.DRAGON;
    for (const q of this.players) if (q.side === side && !q.dead) this._addXp(q, amt);
  }

  // ══ S29B1（v3）：交戰狀態機輔助 ═══════════════════════════════════════════
  //  設計原則：全部只讀真實觀測（位置/血量/比分/塔數），不寫死勝負；
  //  rng 抽樣沿用既有雙流（tacticOn ⇒ rng2、否則 rng），不引入第三流。

  /** 近期（repeatDeathWindow 秒內）死亡次數——連死 ⇒ 行為保守化。 */
  _recentDeathsV3(p) {
    const w = this.rules.repeatDeathWindow;
    while (p.deathsT.length && p.deathsT[0] < this.t - w) p.deathsT.shift();
    return p.deathsT.length;
  }
  /** 劣勢判定（雙方對稱規則；不是勝率係數，只影響「更常防守」的行為傾向）。 */
  _teamBehindV3(side) {
    const R = this.rules;
    const myK = side === "blue" ? this.bK : this.rK, foeK = side === "blue" ? this.rK : this.bK;
    if (foeK - myK >= R.defenseKillDeficit) return true;
    const twDead = (s) => Object.values(this.towers).filter((t) => t.side === s && t.lane !== "nexus" && t.hp <= 0).length;
    return twDead(side) - twDead(side === "blue" ? "red" : "blue") >= R.defenseTowerDeficit;
  }
  /** 參團判定（黏性決策）：距離圈 + 重接戰冷卻 + 人數 + 連死保守 + 機率（吃戰術/能力）。 */
  _joinV3(p, hot, K, M, alive) {
    const R = this.rules;
    if (this.t < p.reengageAt) return false;                    // 復活鎖 / 團戰解散冷卻
    if (dist(p.pos, hot) > R.joinRadius) return false;          // 太遠不吸（原本全圖吸）
    if (this._recentDeathsV3(p) >= 2) return false;             // 連死 ⇒ 不再進場
    const foesAtHot = alive.filter((q) => q.side !== p.side && dist(q.pos, hot) < 20).length;
    const alliesAtHot = alive.filter((q) => q.side === p.side && dist(q.pos, hot) < 20).length;
    if (alliesAtHot < foesAtHot - 1) return false;              // 明顯人數劣勢 ⇒ 不接
    if (this.t >= p.joinEvalT) {                                // 黏性：每 joinEvalPeriod 秒重評
      p.joinEvalT = this.t + R.joinEvalPeriod;
      let c = this._joinChance(K, hot, M);                      // 戰術 joinFight + 能力 joinAdj
      //  Milestone H：英雄定位的參團傾向（坦克／輔助更常進團、刺客更常單獨行動）。
      //    ⚠ 只有真的有偏移時才套用夾限——無條件加一層 clamp 會在英雄層關閉時
      //    也改變邊界值的行為，中性就不再是「結構上保證」而是碰運氣。
      const hJoin = this._heroMod(p)?.joinAdj ?? 0;
      if (hJoin) c = clamp(c + hJoin, 0.02, 0.98);
      if (p.role === "jungle" || p.role === "sup") c = clamp(c + R.jgSupJoinBonus, 0.05, 0.98);
      if (this._teamBehindV3(p.side)) c = Math.max(0.05, c - 0.2);   // 劣勢 ⇒ 更常防守
      p.joinGo = (K ? this.rng2() : this.rng()) < c;
    }
    return p.joinGo;
  }
  /** 目標（龍/巴龍）參與判定：窗開著才會有人去；打野/輔助必去、其他人吃 knob。 */
  _objJoinV3(p, key, K, M) {
    const R = this.rules;
    if (this.t < p.reengageAt || this._recentDeathsV3(p) >= 2) return false;
    if (p.role === "jungle" || p.role === "sup") return true;   // 打野控目標、輔助佔視野
    if (this.t >= p.objEvalT) {
      p.objEvalT = this.t + R.joinEvalPeriod;
      //  Milestone H：英雄定位的目標集結傾向（同樣只在有偏移時才夾，保持中性）。
      const hObj = this._heroMod(p)?.objAdj ?? 0;
      const base = this._joinChance(K, PITS[key], M);
      const c = hObj ? clamp(base + hObj, 0.02, 0.98) : base;
      p.objGo = (K ? this.rng2() : this.rng()) < c;
    }
    return p.objGo;
  }
  /**
   * Milestone F：主動權窗的「攻城」分支是否適用於這名英雄。
   * 條件刻意保守：窗要開著、目標塔還在、血量夠、不是剛復活、也不在追擊中。
   * 血量不足的人**不跟進**（走既有回城／撤退路徑）——贏了團戰不該接著送人頭。
   */
  _initiativeSiegeV3(p) {
    const T = this.fsm3?.[p.side];
    if (!T || T.initKind !== "siege" || this.t >= T.initUntil) return false;
    const tw = this.towers[T.initTarget];
    if (!tw || tw.hp <= 0) { T.initKind = null; T.initTarget = null; return false; }
    if (p.dead || p.retreating || p.recallT > 0) return false;
    if (p.fsm === "RETURN" || p.fsm === "RESPAWN") return false;
    if (p.hp / p.maxHp < this.rules.initiativeHpMin) return false;
    return true;
  }
  /** 追擊維持判定：對象死亡/超時/拉開距離/離錨點太遠/血量回升 ⇒ 放棄。 */
  _chaseAliveV3(p) {
    const R = this.rules;
    if (!p.chaseId) return null;
    const foe = this.players.find((q) => q.id === p.chaseId);
    if (!foe || foe.dead || this.t > p.chaseUntil ||
        dist(p.pos, foe.pos) > R.chaseGiveUpDist ||
        (p.chaseFrom && dist(p.pos, p.chaseFrom) > R.chaseLeash) ||
        foe.hp > foe.maxHp * R.chaseHpMax * 1.3) { p.chaseId = null; return null; }
    return foe;
  }
  /** 追擊取得：貼身、殘血、正在逃的敵人 ⇒ 進入 CHASE（有時間/距離上限）。 */
  _tryChaseV3(p, alive) {
    const R = this.rules;
    if (p.retreating || this.t < p.reengageAt || p.hp < p.maxHp * 0.4) return null;
    let best = null, bd = R.chaseTriggerDist;
    for (const q of alive) {
      if (q.side === p.side || q.dead || !q.retreating) continue;
      if (q.hp > q.maxHp * R.chaseHpMax) continue;
      const dd = dist(p.pos, q.pos);
      if (dd < bd) { bd = dd; best = q; }
    }
    if (best) { p.chaseId = best.id; p.chaseUntil = this.t + R.chaseMaxT; p.chaseFrom = { ...p.pos }; }
    return best;
  }
  /**
   * Milestone D-fix2：v3 局部戰鬥決策。
   *
   * 呼叫端會先替所有存活英雄建立 decisionPlan，再開始移動，因此雙方讀到的是同一份
   * 凍結位置。此函式不抽 rng、不寫傷害，只把可解釋的移動意圖記在英雄自己身上。
   */
  _combatDecisionV3(p, alive) {
    const R = this.rules;
    const awareness = R.decisionAwareness;
    const hpRatio = clamp(p.hp / p.maxHp, 0, 1);
    const enemyAwareness = alive
      .filter((q) => q.side !== p.side && !q.dead && dist(q.pos, p.pos) <= awareness)
      .map((q) => ({ q, d: dist(q.pos, p.pos) }));
    //  Milestone H：英雄定位影響**目標選擇**——刺客更看殘血、坦克更看誰擋在前面。
    //    只改排序權重，不改可選目標集合、不改傷害。
    const H = this._heroMod(p);
    const lowHpWeight = 5 + (H?.focusLowHp ?? 0) * 10;
    const foes = enemyAwareness
      // 只對已進入實際攻擊／貼身圈的敵人改寫路線；14 單位 awareness 仍用於
      // 人數與支援風險，但不再把遠方敵人當磁鐵，避免過早聚團。
      .filter(({ d }) => d <= R.decisionContact)
      .sort((a, b) => {
        const av = (1 - a.q.hp / a.q.maxHp) * lowHpWeight + (a.q.role === "adc" || a.q.role === "mid" ? 0.25 : 0) - a.d * 0.05;
        const bv = (1 - b.q.hp / b.q.maxHp) * lowHpWeight + (b.q.role === "adc" || b.q.role === "mid" ? 0.25 : 0) - b.d * 0.05;
        return bv - av || a.q.id.localeCompare(b.q.id);
      });
    const allies = alive.filter((q) => q.side === p.side && !q.dead && dist(q.pos, p.pos) <= awareness);
    const target = foes[0]?.q ?? null;
    const targetDist = foes[0]?.d ?? Infinity;
    const targetHp = target ? clamp(target.hp / target.maxHp, 0, 1) : 1;
    // D-fix3：人數比較採同一個「可在短時間加入交戰」半徑。D-fix2 舊版把
    // 14 單位內盟友全算進來，卻只算 9 單位內敵人，會高估支援、產生不合理硬開。
    const combatRadius = R.decisionContact + 2;
    const alliesN = allies.filter((q) => dist(q.pos, p.pos) <= combatRadius).length;
    const foesN = enemyAwareness.filter(({ d }) => d <= combatRadius).length;

    let enemyTower = null, towerDist = Infinity;
    for (const tw of Object.values(this.towers)) {
      if (tw.side === p.side || tw.hp <= 0) continue;
      const dd = dist(p.pos, tw.pos);
      if (dd < towerDist) { towerDist = dd; enemyTower = tw; }
    }
    let hasWave = false;
    if (enemyTower) hasWave = this._hasWaveAtStructure(p.side, enemyTower);
    const inTowerRisk = !!enemyTower && towerDist <= (R.towerAggroRange ?? 8) + 2;
    const towerDefenders = enemyTower
      ? alive.filter((q) => q.side !== p.side && dist(q.pos, enemyTower.pos) < 11).length
      : 0;

    //  Milestone H：保護低血隊友原本綁死在 `role === "sup"`（席位），
    //    現在改由**英雄定位**也能取得（輔助定位的英雄不管坐哪一路都會護人）。
    const protective = p.role === "sup" || (H?.protectAdj ?? 0) >= 0.12;
    const lowAlly = protective
      ? allies
        .filter((q) => q !== p && q.hp / q.maxHp < 0.55 &&
          enemyAwareness.some(({ q: foe }) => dist(foe.pos, q.pos) < awareness))
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0] ?? null
      : null;
    const skillReady = p.atkCd <= 0.08;
    //  Milestone H：接戰意願＝席位基準 ＋ 英雄定位偏移（坦克戰士更願意開、
    //    射手法師更保守）。仍是分數層的加項，不碰傷害。
    const roleBias = (p.role === "top" || p.role === "jungle" ? 0.13 :
      p.role === "mid" ? 0.04 : p.role === "adc" ? -0.08 : -0.12) + (H?.engageAdj ?? 0);
    const nearbyObjective = ["dragon", "baron"]
      .map((key) => this.neutrals?.[key])
      .find((objective) => objective?.alive && dist(p.pos, objective.pos) <= 11) ?? null;
    // 高血量本身不是開戰理由：主要看「相對血量」與人數，才不會健康的 1v1
    // 一見面就固定互毆到死。滿血鏡像局通常拉扯；有血量／人數優勢才接戰。
    let score = (target ? (hpRatio - targetHp) * 0.9 : 0) +
      (hpRatio - 0.5) * 0.5 +
      (alliesN - foesN) * 0.42 +
      (target ? (1 - targetHp) * 0.65 : 0) +
      //  Milestone H：技能就緒的權重吃英雄定位（法師／刺客更依賴時機，
      //    坦克／輔助比較不看）。倍率有限幅，不改 CD 也不改傷害。
      roleBias + (skillReady ? 0.12 : -0.10) * (H?.skillWeight ?? 1) + (p.decisionTemper ?? 0);
    if (target) score -= Math.max(0, targetDist - 8) * 0.025;
    if (this.t < R.decisionEarlyT && target) score -= 0.14;
    if (this._teamBehindV3(p.side)) score -= 0.10;
    if (inTowerRisk && (!hasWave || towerDefenders >= alliesN)) score -= R.decisionTowerRisk;

    //  Milestone H：撤退門檻吃英雄定位（刺客／射手更早脫離、坦克撐得久一點）。
    //    ⚠ 只平移門檻，不改移速、不改傷害、不改復活時間。
    const retreatShift = H?.retreatAdj ?? 0;
    const emergencyRetreat = hpRatio < 0.28 + retreatShift ||
      (hpRatio < 0.44 + retreatShift && foesN > alliesN);
    // 無守軍時沿用既有 0.30× 單人拆塔效率，讓比賽仍能收尾；真正危險的
    // 「無兵線闖入有人守的塔」或殘血進塔才撤，不把所有推線都改成來回走。
    const towerFallback = inTowerRisk &&
      ((!hasWave && towerDefenders > 0 && alliesN === 1) ||
       (!hasWave && towerDefenders > alliesN) || hpRatio < 0.45);
    const cachedTargetAlive = !p.decisionTargetId ||
      alive.some((q) => q.id === p.decisionTargetId && !q.dead);
    const immediateContact = target && (!p.decisionTargetId || p.decisionAction === "LANE");
    if (!emergencyRetreat && !towerFallback && !immediateContact &&
        this.t < p.decisionAt && cachedTargetAlive) {
      return {
        action: p.decisionAction, targetId: p.decisionTargetId,
        score: p.decisionScore, reasons: [...p.decisionReasons], fresh: false,
      };
    }

    let action = "LANE", decisionTarget = target;
    if (emergencyRetreat) {
      action = "RETREAT";
    } else if (towerFallback) {
      action = "FALLBACK";
      decisionTarget = enemyTower;
    } else if (target && foesN > alliesN && score <= R.decisionRetreatScore) {
      action = "RETREAT";
    } else if (lowAlly) {
      action = "SUPPORT";
      decisionTarget = lowAlly;
    } else if (target && targetHp <= 0.40 && score >= 0.30 &&
               targetDist <= R.decisionContact &&
               // Milestone F：不追進敵塔射程。追殘血本身合理，但「追到塔下被塔
               //   打殘再被反殺」是白送——除非我方在該塔區有人數優勢。
               (!inTowerRisk || alliesN > towerDefenders + 1) &&
               // 打龍／巴龍時只追真正能立刻收掉的近身殘血，不為追人離開坑區。
               (!nearbyObjective || (targetHp <= 0.25 && targetDist <= 5))) {
      action = "PURSUE";
    } else if (target && score >= R.decisionEngageScore) {
      action = "ENGAGE";
    } else if (target) {
      action = "KITE";
    }

    const reasons = [
      `hp:${Math.round(hpRatio * 100)}`,
      `numbers:${alliesN}:${foesN}`,
      `role:${p.role}`,
      skillReady ? "skill:ready" : "skill:cooling",
      `commit:${(p.decisionTemper ?? 0) >= 0 ? "+" : ""}${(p.decisionTemper ?? 0).toFixed(2)}`,
    ];
    if (target && targetHp <= 0.4) reasons.push("target:low");
    if (this.t < R.decisionEarlyT && target) reasons.push("phase:lane");
    if (towerFallback) reasons.push(hasWave ? "tower:defended" : "tower:no-wave");
    if (lowAlly) reasons.push(`ally:low:${lowAlly.id}`);
    if (nearbyObjective) reasons.push(`objective:${nearbyObjective.id}`);
    if (this._teamBehindV3(p.side)) reasons.push("team:behind");

    p.decisionAt = this.t + R.decisionEvalPeriod;
    p.decisionAction = action;
    p.decisionTargetId = decisionTarget?.id ?? null;
    p.decisionScore = Math.round(score * 100) / 100;
    p.decisionReasons = reasons;
    return {
      action, targetId: p.decisionTargetId,
      score: p.decisionScore, reasons: [...reasons], fresh: true,
    };
  }
  /** 打野的下一個農怪目標：自家野區最近的存活營地。 */
  _nextCampV3(p) {
    if (!this.neutrals) return null;
    let best = null, bd = Infinity;
    for (const c of this.neutrals.camps) {
      if (!c.alive || c.side !== p.side) continue;
      const dd = dist(p.pos, c.pos);
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  }
  /** S29B3：回城事件（唯一出口；phase = start / done / cancel；done 帶傳送起點）。 */
  _recallEventV3(p, phase, from = null) {
    this.recallLog.push({
      id: "r" + this._recallSeq++, t: Math.round(this.t * 10) / 10,
      playerId: p.id, side: p.side, phase,
      ...(from ? { from: { x: from.x, y: from.y } } : {}),
    });
    if (this.recallLog.length > 200) this.recallLog.shift();
    if (phase === "done") this.pushFx({ type: "ult", pos: FOUNTAIN[p.side], color: 0x60a5fa, exp: 0.5 });
  }

  /** 召喚師技能事件（唯一出口；Replay 由 battleStore.log 原封保存，不重判定）。 */
  _spellEventV3(p, spell, reason, from, to) {
    //  Milestone J：欄位與冷卻都改由技能 id 決定（`_spellSlot` / `_spellCd`）。
    //    舊寫法是「flash 走 f 欄、其餘一律 d 欄」＋兩個寫死的冷卻常數，
    //    第二格能放八種技能之後就不成立了。找不到欄位 ⇒ 退回舊的二選一，
    //    讓未啟用 v2 的路徑逐位元不變。
    const slot = this._spellSlot(p, spell) ?? (spell === "flash" ? p.sp.f : p.sp.d);
    slot.readyAt = this.t + this._spellCd(spell);
    slot.lastUsedAt = this.t; slot.lastReason = reason; slot.uses++;
    this.spellLog.push({
      id: "s" + this._spellSeq++, t: this.t, playerId: p.id, side: p.side,
      spell, reason, from: { x: from.x, y: from.y }, to: to ? { x: to.x, y: to.y } : null,
    });
    if (this.spellLog.length > 400) this.spellLog.shift();
    this.pushFx({ type: "ult", pos: { x: from.x, y: from.y }, color: SPELL_FX_COLOR[spell] ?? 0x22c55e, exp: 0.45 });
  }

  // ── Milestone J：召喚師技能 v2 的施放判定 ───────────────────────────────
  /**
   * 每 tick 一次，在**全員移動與傷害都結算完**的凍結位置上判定（與 `_postCombatV3`
   * 同一個理由：先收集後套用 ⇒ 與迭代順序無關。F 的順序優勢事故就是這樣來的）。
   *
   * 每名英雄每 tick 最多施放一個技能，依「救命 → 續戰 → 收頭 → 機動」排序，
   * 兩個欄位都會被檢查。全部條件都用當下可觀測的狀態，不擲 rng
   * ⇒ 同 seed 同輸入必得同結果。
   */
  _summonerSpellsV2(alive, dt) {
    const R = this.rules;
    if (!this.spellsOn || !R.spellsV2) return;
    const casts = [];
    for (const p of alive) {
      if (p.dead || p.recallT > 0) continue;
      const hpR = p.hp / p.maxHp;
      const foes = alive.filter((q) => q.side !== p.side && !q.dead);
      const nearFoe = foes.reduce((best, q) => {
        const d = dist(p.pos, q.pos);
        return (!best || d < best.d) ? { q, d } : best;
      }, null);

      // 1) 淨化：身上有減速就解掉（最便宜也最直觀的一條）
      if (this.t < (p.redSlowUntil ?? 0) && this._spellReady(p, "cleanse")) {
        casts.push([p, "cleanse", "slow", null]); continue;
      }
      // 2) 護盾：血量低且敵人就在身邊 ⇒ 擋下這一波
      if (hpR < R.barrierHpTrigger && nearFoe && nearFoe.d < R.barrierFoeDist
        && this._spellReady(p, "barrier")) {
        casts.push([p, "barrier", "survive", null]); continue;
      }
      // 3) 治療：自己殘血、或身邊隊友殘血（雙人路的用法）
      if (this._spellReady(p, "heal")) {
        const ally = alive.find((q) => q !== p && q.side === p.side && !q.dead
          && q.hp / q.maxHp < R.healAllyHpTrigger && dist(p.pos, q.pos) < R.healAllyRange);
        const selfLow = hpR < R.healHpTrigger && nearFoe && nearFoe.d < R.healFoeDist;
        if (selfLow || ally) { casts.push([p, "heal", selfLow ? "survive" : "assist", ally ?? null]); continue; }
      }
      // 4) 點燃：射程內有殘血敵人且尚未被點燃 ⇒ 收頭／逼退
      if (this._spellReady(p, "ignite") && nearFoe && nearFoe.d < R.igniteRange
        && nearFoe.q.hp / nearFoe.q.maxHp < R.igniteHpTrigger
        && this.t >= (nearFoe.q.igniteUntil ?? 0)) {
        casts.push([p, "ignite", "execute", nearFoe.q]); continue;
      }
      // 5) 幽魂：追擊或撤退時的機動
      if (this._spellReady(p, "ghost") && nearFoe && nearFoe.d < R.ghostFoeDist
        && (p.retreating ? hpR < R.ghostHpTrigger : p.fsm === "CHASE" && !!p.chaseId)) {
        casts.push([p, "ghost", p.retreating ? "escape" : "chase", null]); continue;
      }
      // 6) 傳送：自己遠離戰場，而我方某座塔正被多人圍攻 ⇒ 支援
      //    ⚠ 條件是「身邊沒有敵人」，不是「場上沒有敵人」——`nearFoe` 取的是最近的
      //    存活敵人，幾乎永遠存在，寫成 `!nearFoe` 會讓傳送一輩子放不出來。
      const disengaged = !nearFoe || nearFoe.d > R.teleportSafeDist;
      if (this._spellReady(p, "teleport") && this.t >= R.teleportMinT && disengaged) {
        let target = null;
        for (const tw of Object.values(this.towers)) {
          if (tw.side !== p.side || tw.hp <= 0) continue;
          if (dist(p.pos, tw.pos) < R.teleportMinDist) continue;
          const sieging = foes.filter((q) => dist(q.pos, tw.pos) < 9).length;
          if (sieging >= R.teleportTowerFoeN) { target = tw; break; }
        }
        if (target) { casts.push([p, "teleport", "defend", target]); continue; }
      }
    }

    // 套用（位置已凍結；施放順序不影響結果，因為效果彼此不搶同一個資源）
    for (const [p, spell, reason, arg] of casts) {
      const from = { x: p.pos.x, y: p.pos.y };
      let to = null;
      switch (spell) {
        case "cleanse":
          p.redSlowUntil = 0;
          p.cleanseUntil = this.t + R.cleanseT;
          break;
        case "barrier":
          p.shield = p.maxHp * R.barrierPct;
          p.shieldUntil = this.t + R.barrierT;
          break;
        case "heal": {
          const gain = Math.min(p.maxHp, p.hp + p.maxHp * R.healPct) - p.hp;
          p.hp += gain; p.heal += gain;
          if (arg && !arg.dead) {
            const g2 = Math.min(arg.maxHp, arg.hp + arg.maxHp * R.healAllyPct) - arg.hp;
            arg.hp += g2; p.heal += g2;       // 治療量記在施放者身上（是他救的）
          }
          break;
        }
        case "ignite":
          arg.igniteUntil = this.t + R.igniteT;
          arg.igniteBy = p.id;
          arg.healCutUntil = this.t + R.igniteT;
          to = { x: arg.pos.x, y: arg.pos.y };
          break;
        case "ghost":
          p.hasteUntil = this.t + R.ghostT;
          break;
        case "teleport": {
          const d = dist(p.pos, arg.pos) || 1;
          const land = {
            x: clampMapX(arg.pos.x + ((p.pos.x - arg.pos.x) / d) * R.teleportArrive),
            y: clampMapY(arg.pos.y + ((p.pos.y - arg.pos.y) / d) * R.teleportArrive),
          };
          this._navTeleport(p, land);         // 落點必須是可走區（沿用閃現的同一條保證）
          to = { x: p.pos.x, y: p.pos.y };
          break;
        }
        default: break;
      }
      this._spellEventV3(p, spell, reason, from, to);
    }
  }

  /**
   * 點燃的持續傷害。獨立傷害源，不乘進普攻公式
   * ⇒ 不違反 S28 §2「不得有傷害乘數」的紅線，且雙方同一套參數。
   */
  _igniteTickV2(dt) {
    const R = this.rules;
    if (!this.spellsOn || !R.spellsV2) return;
    for (const p of this.players) {
      if (p.dead || this.t >= (p.igniteUntil ?? 0)) continue;
      const src = this.players.find((q) => q.id === p.igniteBy) ?? null;
      const amt = R.igniteDps * dt;
      this._damageHero(p, amt);
      if (src) { src.dmg += amt; p.hitBy.set(src.id, this.t); }
      if (p.hp <= 0 && !p.dead && src) this._resolveKill(src, p);
    }
  }
  /** killContext 分類（優先級瀑布；全部來自擊殺當下的真實觀測）。 */
  _killCtxV3(p, foe, assists) {
    const alive = this.players.filter((q) => !q.dead);
    const killersNear = alive.filter((q) => q.side === p.side && dist(q.pos, foe.pos) < 12).length;
    const victimsNear = alive.filter((q) => q.side === foe.side && q !== foe && dist(q.pos, foe.pos) < 12).length;
    const nearPit = (key) => this.neutrals?.[key]?.alive && dist(foe.pos, PITS[key]) < 12;
    const ownTower = Object.values(this.towers).some((tw) => tw.side === foe.side && tw.hp > 0 && dist(foe.pos, tw.pos) < 9);
    const gankWin = (this.tacticOn && p.role === "jungle" && this.t < (this._tac[p.side]?.gankUntil ?? 0)) ||
      (this.fsm3 && p.role === "jungle" && this.t < this.fsm3[p.side].gankUntil);
    const inBush = BUSHES.some((b) => dist(p.pos, b) < b.r + 1.5);
    const type =
      nearPit("dragon") || nearPit("baron") ? "objective" :
      ownTower ? "towerDive" :
      killersNear >= 2 && victimsNear >= 1 ? "teamfight" :
      gankWin ? "gank" :
      inBush ? "ambush" :
      victimsNear === 0 && killersNear >= 2 ? "pick" :
      foe.retreating || p.fsm === "CHASE" ? "chase" : "pick";
    const startedAt = foe.contactSince ?? p.contactSince ?? this.t;
    return {
      type, location: { x: foe.pos.x, y: foe.pos.y },
      participants: [p.id, ...assists, foe.id],
      startedAt: Math.round(startedAt * 10) / 10,
      duration: Math.round((this.t - startedAt) * 10) / 10,
    };
  }
  /**
   * S29B1（v3）：tick 後置階段——追擊取得 + 閃現（逃生/追擊/切入）。
   * 順序公平性：所有判定都在全員移動與傷害結算完成後、以**凍結位置**進行；
   * 閃現先收集全部施放、再一起套用位移 ⇒ 彼此讀到的都是套用前的位置，
   * 與 players 陣列迭代順序無關（同 S29A pendingHits 的兩相手法）。
   */
  /**
   * Milestone F：一場團戰結束 —— 判定勝負，並把勝利**轉化成地圖收益**。
   *
   * 這是 Sprint28 技術債 2 的正解。當時的觀察是「團隊天賦單投 = 負回報」，
   * 因為勝負來自主堡血量（靠兵線與推塔），而打贏團戰之後所有人只是進入
   * DISENGAGE、走回自家塔、再重新對線 ⇒ 打得多不會變成推進。
   * E baseline 量到的數字：**只有 23% 的決勝團戰能在 25 秒內換到任何收益**。
   *
   * 修法刻意「接線」而不是「加係數」：勝方開一個主動權窗，窗內把既有的
   * 目標窗（龍／巴龍）或推塔路徑接上去，敗方進短暫回防窗。
   * 不抽 rng、不改傷害、不加陣營係數 —— 勝負仍由雙方各自的機制產生。
   *
   * @param {{pos:Object,start:number,lastContact:number,deaths:Object,members:Set}} F
   */
  _resolveFightV3(F, alive) {
    const R = this.rules;
    const dur = this.t - F.start;
    const total = F.deaths.blue + F.deaths.red;
    const participants = [...F.members]
      .map((id) => this.players.find((q) => q.id === id))
      .filter(Boolean);

    // 太短且零陣亡 ⇒ 只是擦身而過，不算一場團戰：不送冷卻、不開窗。
    // （這一條就是把 baseline 那 49% 的零碎碰撞排除在「團戰」定義之外的地方。）
    if (dur < R.fightMinDur && total === 0) return;

    // 參與者一律進入 DISENGAGE + 重接戰冷卻（沿用 S29B1 的收手機制）
    for (const p of participants) {
      if (p.dead) continue;
      p.reengageAt = Math.max(p.reengageAt, this.t + R.reengageAfterFight);
      p.joinGo = false;
      if (!p.retreating) { p.fsm = "DISENGAGE"; p.fsmUntil = this.t + 4; }
    }

    // ── 勝負判定：先看陣亡數，平手則看參與者剩餘血量比例總和 ─────────────
    let winner = null;
    if (F.deaths.blue !== F.deaths.red) winner = F.deaths.blue < F.deaths.red ? "blue" : "red";
    else if (total > 0) {
      const hpOf = (side) => participants
        .filter((q) => q.side === side && !q.dead)
        .reduce((s, q) => s + q.hp / q.maxHp, 0);
      const hb = hpOf("blue"), hr = hpOf("red");
      if (Math.abs(hb - hr) > 0.6) winner = hb > hr ? "blue" : "red";
    }
    const record = {
      start: Math.round(F.start * 10) / 10, end: Math.round(this.t * 10) / 10,
      dur: Math.round(dur * 10) / 10, deaths: { ...F.deaths }, winner, kind: null,
    };
    if (!winner) { this.fightLog.push(record); return; }

    // ── 勝方開主動權窗：把戰果導向一個**具體目標** ───────────────────────
    const foeSide = winner === "blue" ? "red" : "blue";
    const winnersAlive = participants.filter((q) => q.side === winner && !q.dead);
    if (winnersAlive.length < R.initiativeMinAlive) { this.fightLog.push(record); return; }

    record.kind = this._openInitiativeV3(winner, F.pos, winnersAlive);
    // 敗方：短暫回防窗（不是懲罰係數，只是行為傾向）
    this.fsm3[foeSide].defendUntil = this.t + R.initiativeWindow * 0.8;
    this.fightLog.push(record);
  }

  /**
   * Milestone F：開一個主動權窗，並選定要把戰果換成什麼。
   * 決定性：完全不抽 rng，只看目標存活、距離與勝方人數。
   * @returns {string|null} 選定的目標種類（沒有可換的東西 ⇒ null，不硬塞）
   */
  _openInitiativeV3(side, pos, winnersAlive) {
    const R = this.rules;
    const T = this.fsm3?.[side];
    if (!T || winnersAlive.length < R.initiativeMinAlive) return null;
    if (this.t < (R.initiativeAfterT ?? 0)) return null;      // 對線期不開窗
    const foeSide = side === "blue" ? "red" : "blue";
    const objReach = (key) => {
      const o = this.neutrals?.[key];
      return o?.alive && dist(pos, o.pos) <= R.initiativeObjRange;
    };
    let kind = null, targetId = null;
    if (objReach("baron") && winnersAlive.length >= 3) kind = "baron";
    else if (objReach("dragon")) kind = "dragon";
    else {
      // 沒有可打的中立目標 ⇒ 推最近的敵方建築（＝把人數優勢換成塔）
      let best = null, bd = Infinity;
      for (const [id, tw] of Object.entries(this.towers)) {
        if (tw.side !== foeSide || tw.hp <= 0) continue;
        const dd = dist(pos, tw.pos);
        if (dd < bd) { bd = dd; best = id; }
      }
      if (best) { kind = "siege"; targetId = best; }
    }
    if (!kind) return null;
    T.initUntil = this.t + R.initiativeWindow;
    T.initKind = kind;
    T.initTarget = targetId;
    T.initFrom = { ...pos };
    // 窗內不受「剛打完架」的重接戰冷卻綁住 —— 否則勝方會站在原地發呆，
    // 這正是 baseline 轉化率只有 23% 的直接原因。
    for (const p of winnersAlive) p.reengageAt = Math.min(p.reengageAt, this.t + 2);
    return kind;
  }

  /**
   * Milestone F：擊殺後的主動權判定。
   *
   * 為什麼不只靠團戰窗：seed 1000 實測 **42 個擊殺裡有 31 個發生在引擎沒認定
   * 團戰的時候**——引擎的 `hot` 抓到的多半是「兩邊各兩人對峙但沒人死」，
   * 真正的收益機會是抓單與以多打少。只綁團戰窗 ⇒ 轉化率量不動（實測 0.23 → 0.24）。
   * 所以這裡把「剛剛打贏一波」的定義擴大到擊殺事件本身，
   * 但仍要求**現場真的還有人數優勢**，避免換完命就去送塔。
   */
  _maybeInitiativeV3(killer, victim) {
    const R = this.rules;
    if (!R.engagementFsm || !this.fsm3) return;
    const T = this.fsm3[killer.side];
    if (this.t < T.initUntil) return;                      // 已經有窗，不重開
    const near = (q, d) => dist(q.pos, victim.pos) <= d;
    // 現場必須真的有優勢（否則就只是換命，不該接著去推）
    const localAllies = this.players.filter((q) => q.side === killer.side && !q.dead && near(q, 25));
    const localFoes = this.players.filter((q) => q.side !== killer.side && !q.dead && near(q, 18));
    if (localFoes.length >= localAllies.length) return;
    // 但「誰去換收益」可以是稍遠的隊友——抓單之後由隊伍接手，才是真的把優勢
    // 用出去。實測只認 25 單位內的健康隊友時，一場只開得起 6 次窗（22 次擊殺），
    // 轉化率量不動；放寬響應半徑是讓機制真的接上的關鍵。
    const responders = this.players.filter((q) =>
      q.side === killer.side && !q.dead && near(q, R.initiativeRespondRange) &&
      q.hp / q.maxHp >= R.initiativeHpMin);
    if (responders.length < R.initiativeMinAlive) return;
    this._openInitiativeV3(killer.side, victim.pos, responders);
    this.fsm3[victim.side].defendUntil = this.t + R.initiativeWindow * 0.8;
  }

  _postCombatV3(alive, hot) {
    const R = this.rules;
    // 1) 追擊取得（本 tick 陣亡者不取得；維持判定仍在決策迴圈）
    for (const p of alive) {
      if (p.dead || p.chaseId) continue;
      if (p.retreating || this.t < p.reengageAt) continue;
      this._tryChaseV3(p, alive);
    }
    // 2) Flash（追擊/切入；逃生閃現在 tick 開頭的前置階段）：先收集（凍結位置）
    if (!R.summonerSpells) return;
    const casts = [];
    for (const p of alive) {
      if (p.dead || this.t < p.sp.f.readyAt) continue;
      if (p.fsm === "CHASE" && p.chaseId) {
        // 追擊收頭：目標殘血、卡在攻擊圈外 ⇒ 閃到身邊
        const foe = this.players.find((q) => q.id === p.chaseId);
        if (foe && !foe.dead) {
          const dd = dist(p.pos, foe.pos);
          if (dd > R.contactKeep && dd <= 8 && foe.hp < foe.maxHp * R.flashChaseHp) {
            casts.push([p, "chase", {
              x: clampMapX(foe.pos.x + ((p.pos.x - foe.pos.x) / dd) * 1.5),
              y: clampMapY(foe.pos.y + ((p.pos.y - foe.pos.y) / dd) * 1.5),
            }]);
          }
        }
      } else if (p.state === "團戰!" && hot) {
        // 切入：正要進場、距熱點一步之遙、且我方人數不劣 ⇒ 閃進去
        const dh = dist(p.pos, hot);
        if (dh > 9 && dh <= 13) {
          const foesH = alive.filter((q) => !q.dead && q.side !== p.side && dist(q.pos, hot) < 20).length;
          const alliesH = alive.filter((q) => !q.dead && q.side === p.side && dist(q.pos, hot) < 20).length;
          if (alliesH >= foesH) {
            casts.push([p, "engage", {
              x: clampMapX(p.pos.x + ((hot.x - p.pos.x) / dh) * 6),
              y: clampMapY(p.pos.y + ((hot.y - p.pos.y) / dh) * 6),
            }]);
          }
        }
      }
    }
    // 3) 一起套用
    for (const [p, reason, to] of casts) {
      const from = { x: p.pos.x, y: p.pos.y };
      this._navTeleport(p, to);            // H.2：閃現落點必須是可走區（不得閃進牆裡）
      this._spellEventV3(p, "flash", reason, from, p.pos);
    }
  }

  /**
   * S29B1（v3）：中立目標完整生命週期——
   *   出生 → 集結（團隊目標窗）→ 被攻擊（真實 HP 下降、participants 記錄）→ Smite →
   *   被擊殺（killerTeam = 傷害較多的一方 ⇒「不保證搶到」）→ 金幣/XP → 重生倒數 → 再出生。
   *   結束後同步 legacy 鏡射欄位（this.dragon/this.baron），舊消費者（HUD/regress/
   *   tactic24 objRate/mobaPlayerStats objTicks/battleFocus）零改動。
   */
  _updateNeutralsV3(alive, dt) {
    const R = this.rules, N = this.neutrals;
    // S29B2：攻擊中立目標的可視化 fx（每整數秒最多一輪、零 rng ⇒ 不影響模擬與決定性）
    const fxTick = Math.floor(this.t) !== Math.floor(this.t - dt);
    const resetMember = (o, m) => {
      m.alive = true; m.hp = m.maxHp; m.targetId = null; m.atkCd = 0;
      m.hitAt = -Infinity; m.attackAt = -Infinity;
      m.pos.x = m.homePos.x; m.pos.y = m.homePos.y;
      m.deathAt = null; m.spawnedOnce = true; m.killerTeam = null; m._settled = false;
      m.participants.clear(); m.dmgBy.blue = 0; m.dmgBy.red = 0;
      o.spawnedOnce = true;
    };
    const reset = (o) => {
      o.alive = true; o.hp = o.maxHp; o.killerTeam = null;
      o.deathAt = null; o.spawnedOnce = true;
      o.participants.clear(); o.dmgBy.blue = 0; o.dmgBy.red = 0;
      if (o.members) for (const m of o.members) {
        resetMember(o, m);
      }
      if (o.homePos) {
        o.pos.x = o.homePos.x; o.pos.y = o.homePos.y;
        o.state = "idle"; o.targetId = null; o.atkCd = 0;
      }
    };
    const syncCamp = (o) => {
      if (!o.members) return;
      o.hp = o.members.reduce((sum, m) => sum + Math.max(0, m.hp), 0);
      o.alive = o.members.some((m) => m.alive && m.hp > 0);
      o.dmgBy.blue = o.members.reduce((sum, m) => sum + m.dmgBy.blue, 0);
      o.dmgBy.red = o.members.reduce((sum, m) => sum + m.dmgBy.red, 0);
      o.participants.clear();
      for (const m of o.members) for (const id of m.participants) o.participants.add(id);
      if (!o.alive) {
        const next = o.members.filter((m) => Number.isFinite(m.respawnAt))
          .reduce((best, m) => Math.min(best, m.respawnAt), Infinity);
        o.respawnAt = Number.isFinite(next) ? next : this.t + o.respawn;
      }
      for (const m of o.members) {
        m.pos.x = o.pos.x + m.dx; m.pos.y = o.pos.y + m.dy;
      }
    };
    const moveToward = (o, to, speed) => {
      const d = dist(o.pos, to);
      if (d <= 1e-6) return d;
      const step = Math.min(d, speed * dt);
      o.pos.x += ((to.x - o.pos.x) / d) * step;
      o.pos.y += ((to.y - o.pos.y) / d) * step;
      return d - step;
    };
    const settleCampMember = (c, m) => {
      if (!m || m._settled) return;
      m._settled = true; m.alive = false; m.hp = 0; m.targetId = null;
      m.deathAt = this.t; m.respawnAt = this.t + c.respawn;
      const kt = m.dmgBy.blue > m.dmgBy.red ? "blue" : m.dmgBy.red > m.dmgBy.blue ? "red" : null;
      m.killerTeam = kt; c.killerTeam = kt;
      this.pushFx({
        type: "ult", pos: { ...m.pos },
        color: c.type === "buff" ? (c.presentationKey === "redBuff" ? 0xff563d : 0x4ca8ff) : 0xa3e635,
        sourceId: m.id, targetId: m.id, ability: "neutral:defeated", feedback: "skill",
        exp: 0.6,
      });
      if (!kt) return;
      const share = m.maxHp / c.maxHp;
      const campGold = c.type === "buff" ? R.buffCampGold : R.campGold;
      const campXp = c.type === "buff" ? (R.buffCampXp ?? XP.BUFF_CAMP) : (R.campXp ?? XP.CAMP);
      this._dmgGold(kt, campGold * share);
      for (const q of alive) {
        if (q.side !== kt || dist(q.pos, m.pos) > XP.CAMP_RADIUS) continue;
        q.gold += campGold * share;
        if (R.matchXp) this._addXp(q, campXp * share);
      }
      // Buff 只屬於主怪（index 0），由真正參與該個體擊殺且仍在場的英雄取得。
      if (c.type === "buff" && m.index === 0) {
        const receiver = alive.filter((q) => q.side === kt && m.participants.has(q.id))
          .sort((a, b) => dist(a.pos, m.pos) - dist(b.pos, m.pos) ||
            String(a.id).localeCompare(String(b.id)))[0] ?? null;
        if (receiver) {
          if (c.presentationKey === "redBuff") receiver.redBuffUntil = this.t + R.combatBuffT;
          if (c.presentationKey === "blueBuff") receiver.blueBuffUntil = this.t + R.combatBuffT;
          this.pushFx({
            type: "ult", pos: { ...receiver.pos },
            color: c.presentationKey === "redBuff" ? 0xff563d : 0x4ca8ff,
            sourceId: c.id, targetId: receiver.id,
            ability: `buff:${c.presentationKey}`, feedback: "skill", style: "buffAcquire",
          });
        }
      }
    };
    // D-fix3：同一 tick 先凍結個體目標，再按 side 比例一次結算。
    // 直接依 alive 陣列逐人扣血會讓先迭代者殺掉主怪、後迭代者改打下一隻；
    // 反轉 players 陣列便可能改變 Buff 歸屬。這裡不新增 rng，只消除順序來源。
    const applyMemberHits = (c, victim, hits) => {
      if (!victim || !victim.alive || victim.hp <= 0 || !hits.length) return 0;
      const ordered = [...hits].sort((a, b) => String(a.p.id).localeCompare(String(b.p.id)));
      const rawBlue = ordered.filter((hit) => hit.p.side === "blue")
        .reduce((sum, hit) => sum + hit.amount, 0);
      const rawRed = ordered.filter((hit) => hit.p.side === "red")
        .reduce((sum, hit) => sum + hit.amount, 0);
      const rawTotal = rawBlue + rawRed;
      if (rawTotal <= 0) return 0;
      const applied = Math.min(victim.hp, rawTotal);
      victim.hp = Math.max(0, victim.hp - applied);
      victim.hitAt = this.t;
      victim.dmgBy.blue += applied * rawBlue / rawTotal;
      victim.dmgBy.red += applied * rawRed / rawTotal;
      for (const hit of ordered) victim.participants.add(hit.p.id);
      if (victim.hp <= 0) settleCampMember(c, victim);
      return applied;
    };
    const trySmite = (o) => {
      // 兩側打野同時評估、同時結算 ⇒ 無迭代順序偏差；只在「能斬殺」時施放（secure）
      const casts = alive.filter((p) =>
        p.role === "jungle" && p.sp.d.id === "smite" && this.t >= p.sp.d.readyAt &&
        dist(p.pos, o.pos) <= R.smiteRange && o.hp > 0 && o.hp <= R.smiteDmg)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (!casts.length) return;
      const victim = o.members?.find((m) => m.alive && m.hp > 0) ?? o;
      if (o.members) {
        applyMemberHits(o, victim, casts.map((p) => ({ p, amount: R.smiteDmg })));
        syncCamp(o);
      } else {
        const rawBlue = casts.filter((p) => p.side === "blue").length * R.smiteDmg;
        const rawRed = casts.filter((p) => p.side === "red").length * R.smiteDmg;
        const rawTotal = rawBlue + rawRed;
        const applied = Math.min(o.hp, rawTotal);
        o.hp = Math.max(0, o.hp - applied);
        o.dmgBy.blue += applied * rawBlue / rawTotal;
        o.dmgBy.red += applied * rawRed / rawTotal;
        for (const p of casts) o.participants.add(p.id);
        o.hitAt = this.t;
      }
      for (const p of casts) {
        this._spellEventV3(p, "smite", o.id, p.pos, victim.pos ?? o.pos);
      }
    };
    for (const key of ["dragon", "baron"]) {
      const o = N[key];
      if (!o.alive) { if (this.t >= o.respawnAt) reset(o); }
      else {
        const b = alive.filter((p) => p.side === "blue" && dist(p.pos, o.pos) < 9);
        const r = alive.filter((p) => p.side === "red" && dist(p.pos, o.pos) < 9);
        const side = b.length > r.length ? "blue" : r.length > b.length ? "red" : null;
        if (side) {
          const members = side === "blue" ? b : r;
          const dmg = members.reduce((s, p) => s + p.power, 0) *
            this._dragonPowerK(side) * R.objDmgK * dt;
          o.hp -= dmg; o.dmgBy[side] += dmg; o.hitAt = this.t;
          for (const p of members) o.participants.add(p.id);
          // S29B2：打龍/巴龍的可視化彈道（每秒最多 2 條；純呈現，零 rng）
          if (fxTick) for (const p of members.slice(0, 2)) {
            this.pushFx({
              type: "line", pos: { x: p.pos.x, y: p.pos.y }, target: { ...o.pos }, color: SIDE[side],
              sourceId: p.id, targetId: o.id, ability: `${p.role}:basic`, feedback: "attack",
            });
          }
        }
        // Boss 會黏著坑內最近的真實英雄反擊；不執行最後一擊，以免破壞
        // Σk == Σd 的既有公平性／結果契約。attackAt/targetId 同步給地圖與 HUD。
        o.atkCd = Math.max(0, (o.atkCd ?? 0) - dt);
        //  L Hotfix 2：只挑**還打得動**的目標。舊碼永遠鎖最近的人，一旦最近的人
        //  被打到 1 HP 下限（Boss 不執行擊殺），`amount` 就恆為 0 ⇒ Boss 既不出手
        //  也不重置冷卻，之後整段站在那裡不動作（實測 249/1500 tick 有人在坑內
        //  卻完全沒反應）。改成跳過打不動的人，坑裡只要還有人就會挨打。
        const bossTargets = [...b, ...r].filter((p) => p.hp > 1.01).sort((a, z) =>
          dist(a.pos, o.pos) - dist(z.pos, o.pos) || String(a.id).localeCompare(String(z.id)));
        const bossTarget = bossTargets[0] ?? null;
        o.targetId = bossTarget?.id ?? null;
        if (bossTarget && o.atkCd <= 0) {
          const interval = key === "baron" ? R.baronAttackInterval : R.dragonAttackInterval;
          const raw = key === "baron" ? R.baronAttackDamage : R.dragonAttackDamage;
          const amount = Math.min(
            raw / this._dragonGuardK(bossTarget.side),
            Math.max(0, bossTarget.hp - 1));
          if (amount > 0) {
            bossTarget.hp -= amount;
            o.atkCd = interval; o.attackAt = this.t;
            this.pushFx({
              type: "neutral", pos: { ...o.pos }, target: { ...bossTarget.pos },
              color: key === "dragon" ? 0xb794f6 : 0xfbbf24,
              sourceId: o.id, targetId: bossTarget.id, ability: `boss:${key}`,
              feedback: "attack", style: key === "dragon" ? "wingBolt" : "monsterClaw",
              width: key === "dragon" ? 1.65 : 1.9,
            });
          }
        }
        trySmite(o);
        if (o.hp <= 0) {
          o.alive = false; o.deathAt = this.t; o.respawnAt = this.t + o.respawn;
          const kt = o.dmgBy.blue > o.dmgBy.red ? "blue" : o.dmgBy.red > o.dmgBy.blue ? "red"
            : b.length > r.length ? "blue" : r.length > b.length ? "red" : null;
          o.killerTeam = kt;
          if (kt) {
            this._dmgGold(kt, key === "baron" ? 400 : 200);
            if (R.matchXp) this._awardObjectiveXp(kt, key);
            // 巴龍 buff：擊殺方限時兵線強化（收尾機制；不是傷害/勝率係數，是攻城節奏）
            if (key === "baron" && this.fsm3) this.fsm3[kt].baronBuffUntil = this.t + R.baronBuffT;
            // 巨龍脈動：本場永久團隊層數（最多 dragonMaxStacks），死亡不移除。
            if (key === "dragon" && this.fsm3) {
              this.fsm3[kt].dragonStacks = Math.min(
                R.dragonMaxStacks, (this.fsm3[kt].dragonStacks ?? 0) + 1);
            }
          }
          this.pushFx({ type: "ult", pos: { ...o.pos }, color: key === "dragon" ? 0xb794f6 : 0xfbbf24, exp: 0.8 });
        }
      }
    }
    for (const c of N.camps) {
      // D-fix3：營地成員各自依死亡時刻重生；不再把整營一次回滿／一起出現。
      for (const m of c.members ?? []) {
        if (!m.alive && this.t >= m.respawnAt) resetMember(c, m);
      }
      syncCamp(c);
      if (!c.alive) { c.state = "dead"; c.targetId = null; continue; }
      c.atkCd = Math.max(0, (c.atkCd ?? 0) - dt);
      if (c.members) for (const m of c.members) {
        m.atkCd = Math.max(0, (m.atkCd ?? 0) - dt);
      }

      // Milestone C：營地使用黏著目標；目標死亡、離營或把怪拉出 leash 才回營。
      const eligible = alive.filter((p) =>
        dist(p.pos, c.homePos) <= R.campLeashRange &&
        dist(p.pos, c.pos) <= R.campAggroRange);
      const hadTarget = !!c.targetId;
      let target = c.targetId ? eligible.find((p) => p.id === c.targetId) : null;
      if (!target && c.state !== "return") {
        target = eligible.slice().sort((a, b) =>
          dist(a.pos, c.pos) - dist(b.pos, c.pos) || String(a.id).localeCompare(String(b.id)))[0] ?? null;
        c.targetId = target?.id ?? null;
      }
      if (c.state === "return" || dist(c.pos, c.homePos) > R.campLeashRange ||
          (hadTarget && !target)) {
        c.state = "return"; c.targetId = null;
        if (moveToward(c, c.homePos, R.campReturnSpeed) <= 0.05) {
          // leash reset：回到出生點才回滿，清掉本次傷害歸屬，避免隔牆拖怪取利。
          c.pos.x = c.homePos.x; c.pos.y = c.homePos.y;
          c.hp = c.maxHp; c.participants.clear(); c.dmgBy.blue = 0; c.dmgBy.red = 0;
          if (c.members) for (const m of c.members) {
            if (!m.alive) continue;
            m.hp = m.maxHp; m.targetId = null; m.atkCd = 0;
            m.hitAt = -Infinity; m.attackAt = -Infinity;
            m.participants.clear(); m.dmgBy.blue = 0; m.dmgBy.red = 0;
          }
          c.state = "idle";
        }
      } else if (target) {
        const gap = dist(c.pos, target.pos);
        c.state = gap <= R.campAttackRange ? "attack" : "chase";
        if (gap > R.campAttackRange) moveToward(c, target.pos, R.campMoveSpeed);
      } else {
        c.state = "idle"; c.targetId = null;
        // 小幅決定性巡遊；半徑遠小於營地 clearR，不會穿進牆或路線。
        const a = this.t * R.campIdleSpeed + c.idlePhase;
        moveToward(c, {
          x: c.homePos.x + Math.cos(a) * R.campIdleRadius,
          y: c.homePos.y + Math.sin(a) * R.campIdleRadius,
        }, R.campMoveSpeed * 0.45);
      }

      // 群體會一起追擊／回營，但每個存活成員各自選目標、計算距離與攻擊 CD。
      // 因此兩位英雄進營時可各自拉到仇恨；一隻死亡不會讓同營其它成員同步死亡。
      syncCamp(c);
      if (c.state === "return") {
        if (c.members) for (const m of c.members) m.targetId = null;
      } else if (c.members) {
        for (const m of c.members) {
          if (!m.alive || m.hp <= 0) { m.targetId = null; continue; }
          let memberTarget = m.targetId ? eligible.find((p) => p.id === m.targetId) : null;
          if (!memberTarget) {
            memberTarget = eligible.slice().sort((a, b) =>
              dist(a.pos, m.pos) - dist(b.pos, m.pos) ||
              String(a.id).localeCompare(String(b.id)))[0] ?? null;
            m.targetId = memberTarget?.id ?? null;
          }
          if (!memberTarget || dist(m.pos, memberTarget.pos) > R.campAttackRange || m.atkCd > 0) continue;
          //  L Hotfix 2：Buff 野怪比小野怪更痛（產品目標：前期不能完全無壓力）
          const campDmgBase = c.type === "buff"
            ? (R.buffCampAttackDamage ?? R.campAttackDamage) : R.campAttackDamage;
          const amount = Math.min(
            campDmgBase / this._dragonGuardK(memberTarget.side),
            Math.max(0, memberTarget.hp - 1));
          if (amount <= 0) continue;
          memberTarget.hp -= amount;
          m.atkCd = R.campAttackInterval; m.attackAt = this.t;
          c.atkCd = Math.max(c.atkCd, R.campAttackInterval); c.attackAt = this.t;
          this.pushFx({
            type: "neutral", pos: { ...m.pos }, target: { ...memberTarget.pos },
            color: c.type === "buff" ? 0xfbbf24 : 0xa3e635,
            sourceId: m.id, targetId: memberTarget.id, ability: "neutral:basic",
            feedback: "attack", style: "monsterClaw", width: m.index === 0 ? 1.25 : 0.78,
            exp: 1.1, life: 1.1,
          });
        }
      }

      const livingMembers = (c.members ?? []).filter((m) => m.alive && m.hp > 0)
        .sort((a, b) => a.index - b.index);
      const campHits = alive.filter((p) => p.role === "jungle")
        .map((p) => {
          const victim = livingMembers.slice().sort((a, b) =>
            dist(p.pos, a.pos) - dist(p.pos, b.pos) || a.index - b.index)[0] ?? null;
          if (!victim || dist(p.pos, victim.pos) > 3.5) return null;
          return {
            p, victim,
            amount: p.power * this._dragonPowerK(p.side) * R.campDmgK * dt,
          };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.p.id).localeCompare(String(b.p.id)));
      for (const victim of livingMembers) {
        const hits = campHits.filter((hit) => hit.victim === victim);
        if (hits.length) applyMemberHits(c, victim, hits);
      }
      if (campHits.length) {
        c.hitAt = this.t;
        syncCamp(c);
        if (c.state !== "return" && !c.targetId) {
          const target = campHits.slice().sort((a, b) =>
            dist(a.p.pos, c.pos) - dist(b.p.pos, c.pos) ||
            String(a.p.id).localeCompare(String(b.p.id)))[0].p;
          c.targetId = target.id; c.state = "chase";
        }
        // S29B2：打野清怪的可視化彈道（每秒一條；純呈現，零 rng）
        if (fxTick) for (const { p, victim } of campHits) this.pushFx({
          type: "line", pos: { x: p.pos.x, y: p.pos.y },
          target: { ...victim.pos }, color: SIDE[p.side],
          sourceId: p.id, targetId: victim.id, ability: `${p.role}:basic`,
          feedback: "attack",
        });
      }
      trySmite(c);
      syncCamp(c);
      if (c.hp <= 0) {
        c.alive = false; c.state = "dead"; c.targetId = null;
      }
    }
    // legacy 鏡射（alive/respawn/contested/hp%）——舊消費者唯一的讀取面
    for (const key of ["dragon", "baron"]) {
      const o = N[key], m = this[key];
      m.alive = o.alive;
      m.hp = o.alive ? (o.hp / o.maxHp) * 100 : 0;
      m.respawn = o.alive ? 0 : Math.max(0, o.respawnAt - this.t);
      m.contested = o.alive &&
        alive.some((p) => p.side === "blue" && dist(p.pos, o.pos) < 9) &&
        alive.some((p) => p.side === "red" && dist(p.pos, o.pos) < 9);
    }
  }

  /**
   * 交戰步驟（自 tick 內聯區塊抽出，行為逐字保留）：回血 / 選敵 / 造成傷害 / 推塔。
   * v1：在移動迴圈內就地呼叫（舊行為）。
   * v2：全員移動完後才統一呼叫 ⇒ 所有人看到的是彼此的**最終位置**，與迭代順序無關。
   */
  _combatStep(p, effLane, alive, dt, lateFactor, pendingHits) {
    const R = this.rules;
    const K = this.tacticOn ? this.tk[p.side] : null;
    const S = this.tacticOn ? this._tac[p.side] : null;
    // 回血：靠泉水快速回、脫離戰鬥緩慢回
    const nearFountain = dist(p.pos, FOUNTAIN[p.side]) < 10;
    // S29（順序偏差修正 ③）：舊碼 alive.find ⇒ 一律打「陣列索引最小」的敵人
    //   （藍方永遠先集火 r1、紅方永遠先集火 b1）。改為打**最近的**敵人 ⇒ 順序無關。
    let foe = null;
    if (R.nearestTarget) {
      //  Milestone M：交戰距離改由戰鬥原型決定（近戰 ≈4.0–4.3、遠程 ≈7.9–8.4）。
      //  未啟用原型層 ⇒ `_engageRange` 回傳 8 ⇒ 逐位元是舊行為。
      let bd = this._engageRange(p);
      for (const q of alive) {
        if (q.side === p.side || q.dead) continue;
        const dd = dist(p.pos, q.pos);
        if (dd >= bd) continue;
        if (R.engagementFsm) {
          // S29B1：撤退中的敵人一旦脫出貼身圈就放手（除非我正在 CHASE 他）——
          //   修掉「99% 受害者死時已在撤退」的死亡行軍（audit 實測數字）。
          if (q.retreating && dd > R.contactKeep && p.chaseId !== q.id) continue;
          // 自己在撤退/脫戰/回線：不主動出手；貼身（≤contactKeep）被纏住仍會還手。
          if ((p.retreating || p.fsm === "DISENGAGE" || p.fsm === "RETURN") && dd > R.contactKeep) continue;
        }
        bd = dd; foe = q;
      }
    } else {
      const legacyRange = this._engageRange(p);
      foe = alive.find((q) => q.side !== p.side && !q.dead && dist(p.pos, q.pos) < legacyRange) ?? null;
    }
    // S29B1：連續接觸起點（killContext.startedAt/duration 的資料來源）
    if (R.engagementFsm) p.contactSince = foe ? (p.contactSince ?? this.t) : null;
    //  Milestone J：點燃期間回復量打折（未啟用技能層 ⇒ healK 恆為 1 ⇒ 逐位元不變）
    const healK = (this.spellsOn && this.t < (p.healCutUntil ?? 0)) ? (1 - R.igniteHealCut) : 1;
    //  Milestone M1.5：三段式回復（交戰中／脫戰延遲後／泉水），數值全部來自 R.regen 單一設定源。
    //  舊規則集（v1/v2）沒有 regen 契約 ⇒ 走下面的 legacy 分支 ⇒ 歷史基準逐位元不變。
    const RG = R.regen;
    if (RG) {
      const inFountain = nearFountain;
      let pctPerSec;
      if (inFountain) pctPerSec = RG.fountainPctPerSec;
      else {
        //  lastDamagedAt 由 tick 尾端的統一比對點寫入（涵蓋英雄／技能／塔／小兵／野怪／Boss）
        const since = this.t - (p.lastDamagedAt ?? -Infinity);
        const settled = since >= RG.outOfCombatDelaySec;
        pctPerSec = (!foe && settled) ? RG.outOfCombatPctPerSec : RG.inCombatPctPerSec;
      }
      const h = Math.min(p.maxHp, p.hp + p.maxHp * pctPerSec * dt * healK) - p.hp;
      p.hp += h; p.heal += h;
      p.regenMode = inFountain ? "fountain"
        : pctPerSec === RG.outOfCombatPctPerSec ? "outOfCombat"
          : (foe ? "combat" : "waiting");
    } else {
      if (nearFountain) { const h = Math.min(p.maxHp, p.hp + p.maxHp * 0.20 * dt * healK) - p.hp; p.hp += h; p.heal += h; }
      else if (!foe) { const h = Math.min(p.maxHp, p.hp + p.maxHp * 0.02 * dt * healK) - p.hp; p.hp += h; p.heal += h; }
    }
    if (foe) {
      // S29：dmgK 由規則集決定（v1 0.92 ⇒ TTK 20–30 秒、前 5 分鐘幾乎零擊殺）
      const hasRedBuff = R.neutralObjectives && this.t < (p.redBuffUntil ?? 0);
      const hasBlueBuff = R.neutralObjectives && this.t < (p.blueBuffUntil ?? 0);
      // 兩座固定 Buff camp 在地圖上分屬不同側；共同傷害收益必須等值，否則會把
      // presentation 類型變成陣營公平性。紅＝命中減速，藍＝移速＋技能循環。
      const dmgAmt = p.power * dt * R.dmgK * lateFactor *
        (hasRedBuff || hasBlueBuff ? R.combatBuffDamageK : 1) *
        this._dragonPowerK(p.side) / this._dragonGuardK(foe.side);
      p.dmg += dmgAmt; foe.hitBy.set(p.id, this.t); // Sprint06：傷害/助攻追蹤（附加）
      //  Milestone J：淨化後的短暫免疫期內不再被掛上減速（否則解了等於沒解）。
      const cleansed = this.spellsOn && this.t < (foe.cleanseUntil ?? 0);
      if (hasRedBuff && !cleansed) foe.redSlowUntil = Math.max(foe.redSlowUntil ?? 0, this.t + R.redBuffSlowT);
      if (R.towerAttackInterval) {
        // Milestone C：英雄在敵方塔下攻擊該塔隊友時，短時間成為優先仇恨目標。
        // 只記錄事實，不改英雄傷害；塔端仍會檢查射程與存活。
        const threatened = Object.values(this.towers).some((tw) =>
          tw.hp > 0 && tw.side === foe.side &&
          dist(foe.pos, tw.pos) <= R.towerAggroRange + 1 &&
          dist(p.pos, tw.pos) <= R.towerAggroRange);
        if (threatened) p.towerThreatUntil = this.t + R.towerChampionThreatT;
      }
      if (p.atkCd <= 0) {
        // Milestone B.2：沿用既有傷害 tick，只附加呈現語意；不改傷害/CD/rng 次數。
        const power = this.rng() < 0.2;
        this.pushFx({
          type: power ? "ult" : "line",
          pos: { ...p.pos }, target: { ...foe.pos }, color: SIDE[p.side],
          sourceId: p.id, targetId: foe.id,
          ability: `${p.role}:${power ? "power" : "basic"}`,
          feedback: power ? "skill" : "attack",
        });
        p.atkCd = 0.5 * (hasBlueBuff ? R.blueBuffCooldownK : 1);
      }
      if (R.simultaneousCombat) pendingHits.push([p, foe, dmgAmt]);
      else { this._damageHero(foe, dmgAmt); if (foe.hp <= 0 && !foe.dead) this._resolveKill(p, foe); }
    }
    let tw = this.frontStructure(p.side, effLane, p.pos);
    // 可攻塔判定：v1/v2 = 塔邊有任何敵人就完全打不了塔（Legacy 簡化）。
    // S29B1（v3）：塔邊**人數優勢**即可強攻——否則只要守方站一個人在主堡旁，
    //   圍攻永遠零進度，比賽收不掉（實測主堡 7200 HP 要磨 18 分鐘）。
    let canSiege = false;
    if (tw && dist(p.pos, tw.pos) < 6) {
      if (R.engagementFsm) {
        const defN = alive.filter((q) => q.side !== p.side && !q.retreating && dist(q.pos, tw.pos) < 9).length;
        const atkN = alive.filter((q) => q.side === p.side && dist(q.pos, tw.pos) < 9).length;
        canSiege = defN === 0 || atkN > defN;
      } else canSiege = !alive.some((q) => q.side !== p.side && dist(q.pos, tw.pos) < 9);
    }
    if (canSiege) {
      // S29B1（v3）：沒有己方兵線抵塔 ⇒ 拆塔效率大減（孤軍不融塔；修 6 分鐘推穿主堡）
      let soloK = 1;
      //  ── M1.5：基地建築的兵線硬閘門 ──────────────────────────────────────
      //  在此之前「兵線」對建築只是傷害倍率（`soloK`），而且主堡完全跳過判定
      //  ⇒ 五個人可以在沒有任何小兵的情況下直接拆穿基地，兵線在收尾階段沒有意義。
      //  M1.5 把**門牙塔與主堡**改成硬閘門：沒有己方兵線抵達就完全打不動，
      //  逼收尾回到「先推兵線、再進基地」的真實 MOBA 節奏。
      //  ⚠ 這條之所以現在才能收，是因為本次同步修好了兵線推進（縱隊 + 強化兵）；
      //    在那之前門牙塔前**永遠**不可能有兵線，硬閘門會讓比賽收不掉。
      //  ⚠ 路上的三座塔不套用（維持 Milestone F 的分級懲罰，孤軍推塔只是慢，不是零）。
      const gateHard = R.nexusWaveGate &&
        (tw.lane === "nexus_guard" || tw.lane === "nexus");
      if (R.engagementFsm && (tw.lane !== "nexus" || gateHard)) {
        const hasWave = this._hasWaveAtStructure(p.side, tw);
        if (!hasWave && gateHard) soloK = 0;
        else if (!hasWave) {
          // Milestone F：這個懲罰的原意是「**孤軍**拆不動」，不是「沒有兵線就永遠
          //   拆不動」。實測 baseline 打贏一波後三、四個人站在塔下，仍吃 0.30
          //   ⇒ 22 秒的主動權窗根本推不掉一座塔，轉化率因此卡在 ~0.23。
          //   改為依**同時攻擊同一座建築的人數**分級：單人維持原懲罰，
          //   成群集火給 heroTowerGroupK（仍低於有兵線的 1.0）。
          const groupN = alive.filter((q) =>
            q.side === p.side && !q.dead && dist(q.pos, tw.pos) < 6).length;
          soloK = groupN >= (R.heroTowerGroupMin ?? Infinity)
            ? (R.heroTowerGroupK ?? R.heroTowerSoloK)
            : R.heroTowerSoloK;
          // Milestone F 收尾校準：門牙塔（`nexus_guard`）的「沒有兵線」不是戰術選擇
          //   ——小兵路線根本沒有延伸進基地廣場（見建構子 nexus_guard 的 `t` 註解），
          //   那裡**永遠**不可能有兵線。對它套用「帶兵才拆得動」的懲罰等於要求一件
          //   做不到的事，實測收尾階段門牙塔前平均只有 1.4 人 ⇒ 全程吃 0.30。
          //   只解除「不可能達成的前提」，不動塔血、不動 heroTowerDmg、
          //   也不加速任何一座路上塔。
          //   M1.5：兵線修好後這個放寬已不需要，`nexusWaveGate` 啟用時走不到這裡；
          //   保留分支是為了舊規則集（未開 `nexusWaveGate`）仍逐位元不變。
          if (tw.lane === "nexus_guard") {
            soloK = Math.max(soloK, R.nexusGuardNoWaveK ?? R.heroTowerSoloK);
          }
        }
      }
      const structureFactor = R.structureAccelT ? 1 + Math.max(0, this.t - R.structureAccelT) / R.structureAccelDiv : 1;
      const baronK = this.fsm3 && this.t < (this.fsm3[p.side].baronBuffUntil ?? 0)
        ? (R.baronHeroSiegeK ?? 1) : 1;
      const td = R.heroTowerDmg * soloK * baronK * dt * lateFactor * structureFactor;
      if (td <= 0) return;                 // M1.5 硬閘門：沒有兵線 ⇒ 不扣血、也不算推塔波次
      tw.hp -= td; p.twrDmg += td;
      // S24：推塔波次（同隊 10 秒節流一次的真實計數）
      if (K && this.t - S.pushTick > 10) { S.pushTick = this.t; this.exec[p.side].towerPushes++; }
    }
  }

  /**
   * 擊殺結算（自原本 tick 內聯區塊抽出，行為逐字保留）：
   * 死亡/復活、bK/rK、個人 K/D、助攻（8 秒窗）、擊殺與助攻 XP、賞金、擊殺 feed、
   * 擊殺特效、S24 Gank/入侵歸因。v1 立即呼叫；v2 由 tick 尾端同時結算後呼叫。
   */
  _resolveKill(p, foe) {
    const R = this.rules;
    // S29B1（v3）：死亡計時器隨時間成長（收尾機制——團戰勝利 ⇒ 真實的推進窗）
    foe.dead = true;
    foe.respawn = R.engagementFsm
      ? R.respawnBase + Math.min(this.t / R.respawnScaleT, R.respawnCap)
      : 6 + Math.min(this.t / 30, 20);
    foe.hp = 0;
    if (p.side === "blue") this.bK++; else this.rK++;
    p.k += 1; foe.d += 1; // Sprint04：個人統計（附加）
    // Milestone F：這一死算在哪一場團戰頭上（勝負判定的唯一輸入）。
    //   只認距離團戰中心 18 單位內的死亡，避免把另一邊的單殺算進來。
    if (this.fight3 && dist(foe.pos, this.fight3.pos) < 18) {
      this.fight3.deaths[foe.side] += 1;
      this.fight3.members.add(foe.id); this.fight3.members.add(p.id);
    }
    // Milestone F：擊殺 ⇒ 判斷要不要開主動權窗（把人頭換成地圖收益）
    if (R.initiativeWindow) this._maybeInitiativeV3(p, foe);
    const assists = []; // Sprint06：助攻結算（8 秒窗，附加）
    for (const [aid, at] of foe.hitBy) {
      if (aid !== p.id && this.t - at <= 8) {
        const q = this.players.find((x) => x.id === aid && x.side === p.side);
        if (q) { q.a += 1; assists.push(aid); }
      }
    }
    // S29：擊殺/助攻 XP（受害者等級越高，賞金越高）。必須在 hitBy.clear() 之前用 assists。
    if (R.matchXp) {
      const kx = XP.KILL_BASE + XP.KILL_PER_VICTIM_LV * foe.mlv;
      this._addXp(p, kx);
      for (const aid of assists) {
        const q = this.players.find((x) => x.id === aid);
        if (q) this._addXp(q, kx * XP.ASSIST_SHARE);
      }
    }
    foe.hitBy.clear();
    this._dmgGold(p.side, 300); p.gold += 300;
    // S29B1：killContext（v3；擊殺當下的真實分類，Timeline/Replay/verifier 消費，
    //   不進 BattleResult.v2——契約不變）
    let ctx = null;
    if (R.killContext) {
      ctx = this._killCtxV3(p, foe, assists);
      this.killContexts.push({ id: this._mid, t: Math.round(this.t * 10) / 10, ...ctx });
      if (this.killContexts.length > 400) this.killContexts.shift();
      foe.deathsT.push(this.t);
      if (foe.deathsT.length > 8) foe.deathsT.shift();
      foe.recallT = 0;   // S29B3：死亡中斷回城引導
      for (const q of this.players) if (q.chaseId === foe.id) q.chaseId = null;   // 目標已死 ⇒ 停止追擊
    }
    this.feed.unshift({ id: this._mid++, killer: p.id, victim: foe.id, side: p.side, assists, vpos: { x: foe.pos.x, y: foe.pos.y }, ...(ctx ? { ctx } : {}) });
    this.feed = this.feed.slice(0, 5);
    this.pushFx({ type: "ult", pos: { ...foe.pos }, color: 0xfbbf24, exp: 0.6 });
    // S24：擊殺歸因（真實計數，非編造）——Gank 窗內打野擊殺 / 入侵窗內中野擊殺
    if (this.tacticOn) {
      const S2 = this._tac[p.side];
      if (p.role === "jungle" && this.t < S2.gankUntil) this.exec[p.side].gankKills++;
      if (this.t < (S2.invadeUntil || 0) && (p.role === "jungle" || p.role === "mid")) this.exec[p.side].invadeKills++;
    }
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
  /** 一路清空後先拆兩座門牙塔，最後才能傷害主堡；來源仍是 this.towers。 */
  frontStructure(attacker, lane, from = null) {
    const laneTower = this.frontTower(attacker, lane);
    if (laneTower || !this.laneCleared(attacker)) return laneTower;
    const def = attacker === "blue" ? "red" : "blue";
    const guards = [0, 1].map((i) => this.towers[`${def}_nexus_${i}`])
      .filter((tw) => tw?.hp > 0);
    if (guards.length) {
      const anchor = from ?? posOnLane(lane, attacker === "blue" ? 1 : 0);
      return guards.sort((a, b) =>
        dist(anchor, a.pos) - dist(anchor, b.pos) ||
        a.tier - b.tier)[0];
    }
    return this.towers[`${def}_nexus`] ?? null;
  }
  _dragonStacksV3(side) {
    return this.fsm3 ? Math.max(0, this.fsm3[side]?.dragonStacks ?? 0) : 0;
  }
  _dragonPowerK(side) {
    return 1 + this._dragonStacksV3(side) * (this.rules.dragonPowerPerStack ?? 0);
  }
  _dragonGuardK(side) {
    return 1 + this._dragonStacksV3(side) * (this.rules.dragonGuardPerStack ?? 0);
  }
  _hasWaveAtStructure(attacker, tw) {
    if (!tw) return false;
    const key = attacker === "blue" ? "bm" : "rm";
    if (this.lanes[tw.lane]) {
      return this.lanes[tw.lane][key].some((m) => Math.abs(m.t - tw.t) < 0.07);
    }
    if (tw.lane === "nexus_guard" || tw.lane === "nexus") {
      return ["top", "mid", "bot"].some((lane) =>
        this.lanes[lane][key].some((m) => this._minionAtBase(attacker, tw, lane, m)));
    }
    return false;
  }
  /**
   * M1.5：「這隻小兵算不算抵達基地建築」的**單一判定**。
   *
   * 門牙塔與主堡不在任何一條 lane 上，它們的 `t`（0.02 / 0.98）只是建構子裡的
   * 佔位值（見該處註解）。在此之前有兩套互相矛盾的標準：
   *   · 兵線存在判定（`_hasWaveAtStructure`）用**世界距離 13**
   *   · 小兵攻城判定用 `|m.t − tw.t| ≤ minionSiegeBand(0.06)`，比的是**佔位 t**
   * 後者在 t≈0.92（離門牙塔 20 單位以上、還在基地外）就成立
   * ⇒ 小兵在「還沒進基地」的位置就把門牙塔拆掉，兩個判定永遠對不起來
   *   （實測：兵線走進 13 單位 6/30 seeds，但那時門牙塔早就沒了 ⇒ 進基地率恆為 0）。
   * 統一成同一個述詞之後，攻城與閘門看的是同一件事。
   */
  _minionAtBase(attacker, tw, lane, m) {
    const pos = posOnLane(lane, m.t);
    return dist(pos, tw.pos) <= 13 ||
      (attacker === "blue" ? m.t >= 0.95 : m.t <= 0.05);
  }
  /**
   * H.2：把一個英雄朝 tgt 推進 spd（模擬單位），全程遵守 mobaNavigation 的可走區。
   *
   * 三段式，成本由低到高：
   *   ① 目標處理：tgt 先推回通道中心（`recenterToCorridor`；落在牆裡時等同投影到可走區）
   *   ② 子步進直走：每步 ≤ 0.8 單位，撞牆沿牆**切線**滑動 ⇒ 不會高速穿透、也不會黏死在牆角
   *   ③ 尋路：前方 `NAV_LOOKAHEAD`(25) 單位內有障礙就叫 A*（近場預判），
   *      或雖然看起來通、實際幾乎走不動兩次時叫 A*；每名英雄有 `NAV_REPATH_CD`(8) tick 冷卻。
   *      A* 實測 1.3ms（結構阻擋先蓋章成遮罩 + 加權啟發），一場約 1,000 次。
   *
   * ⚠ 決定性：投影是固定角度的螺旋搜尋、A* 是固定鄰居順序，皆無 Math.random
   *   ⇒ 同 seed 仍得到同一場比賽。
   * ⚠ `p._nav` 是純內部狀態，snapshot() 逐欄挑欄位，不會外洩到重播或存檔。
   */
  _navMove(p, tgt, spd) {
    const alive = this._aliveStructs;
    const nav = p._nav ?? (p._nav = { path: null, goal: null, stuck: 0, cd: 0 });
    if (nav.cd > 0) nav.cd--;
    //  H.2 診斷：「想走多少 / 真的走了多少」。移速補償係數是否夠，不能憑感覺，要看這個。
    //  純觀測欄位（不進 snapshot、不影響模擬），verifier 與 bench 會讀。
    //  ⚠ requestedIdeal 是「扣掉『快走到目標就只能走剩下那一點』之後」該走的距離。
    //  舊引擎（穿牆直線）也有這一項損耗，所以**只有 moved / requestedIdeal 才是碰撞造成的損失**，
    //  moveSpeed 的補償係數要用它算，用 moved/requested 會過度補償。
    const ns = this.navStats ?? (this.navStats = {
      requested: 0, requestedIdeal: 0, moved: 0, blockedTicks: 0, pathCalls: 0, pathNull: 0, ticks: 0,
    });
    const x0 = p.pos.x, y0 = p.pos.y;
    ns.requested += spd; ns.ticks++;
    ns.requestedIdeal += Math.min(spd, Math.hypot(tgt.x - p.pos.x, tgt.y - p.pos.y));

    //  目標點先推回通道中心（見 recenterToCorridor）：手繪 lane 折線有兩成落在牆邊，
    //  直接拿來當目標的話英雄會整場貼牆磨，移速被系統性吃掉。
    const goal = recenterToCorridor(tgt.x, tgt.y, HERO_RADIUS, alive);
    //  目標明顯換位置 ⇒ 舊路徑作廢
    if (!nav.goal || Math.hypot(nav.goal.x - goal.x, nav.goal.y - goal.y) > 6) {
      nav.goal = goal; nav.path = null;
    }

    let remain = spd;
    //  ② 先跟著既有路徑走
    while (remain > 1e-6 && nav.path && nav.path.length) {
      const wp = nav.path[0];
      const r = moveTowards(p.pos, wp, remain, HERO_RADIUS, alive);
      p.pos.x = r.x; p.pos.y = r.y;
      remain -= Math.max(0, r.moved);
      if (Math.hypot(wp.x - p.pos.x, wp.y - p.pos.y) < 1.2) { nav.path.shift(); continue; }
      if (r.moved < 1e-3) { nav.path = null; }     // 路徑失效（例如中途蓋了塔）
      break;
    }
    if (nav.path && nav.path.length === 0) nav.path = null;

    //  ③ 沒路徑（或路徑走完）就直接朝目標推進
    if (remain > 1e-6) {
      //  ⚠ 先做**近場預判**再走：只在「撞牆兩次」之後才尋路的話，英雄會先沿著牆磨很久
      //  （實測從泉水走到中線要 193 秒，舊引擎穿牆只要 146 秒 ⇒ 前 5 分等級從 4.12 掉到 3.62）。
      //  只檢查前方 NAV_LOOKAHEAD 單位（不是整段）：整段 lineWalkable 每 tick 要取樣近 300 點，
      //  近場 25 單位只要約 35 點，10 名英雄 × 每秒 2 tick 的成本可以接受。
      if (!nav.path && nav.cd === 0) {
        const dx = goal.x - p.pos.x, dy = goal.y - p.pos.y;
        const dd = Math.hypot(dx, dy) || 1;
        const look = Math.min(NAV_LOOKAHEAD, dd);
        const ahead = { x: p.pos.x + (dx / dd) * look, y: p.pos.y + (dy / dd) * look };
        if (!lineWalkable(p.pos, ahead, HERO_RADIUS, alive)) {
          nav.path = findPath(p.pos, goal, HERO_RADIUS, alive);
          ns.pathCalls++; if (!nav.path) ns.pathNull++;
          nav.cd = NAV_REPATH_CD;
          if (nav.path && nav.path.length) {
            const wp = nav.path[0];
            const r0 = moveTowards(p.pos, wp, remain, HERO_RADIUS, alive);
            p.pos.x = r0.x; p.pos.y = r0.y;
            remain -= Math.max(0, r0.moved);
            if (Math.hypot(wp.x - p.pos.x, wp.y - p.pos.y) < 1.2) nav.path.shift();
          }
        }
      }
    }
    if (remain > 1e-6) {
      const r = moveTowards(p.pos, goal, remain, HERO_RADIUS, alive);
      p.pos.x = r.x; p.pos.y = r.y;
      if (r.blocked && r.moved < spd * 0.25) {
        ns.blockedTicks++;
        //  仍然走不動（例如近場看起來通、實際被塔或人堵住）⇒ 退回原本的「卡住才尋路」
        if (++nav.stuck >= 2 && nav.cd === 0) {
          nav.path = findPath(p.pos, goal, HERO_RADIUS, alive);
          ns.pathCalls++; if (!nav.path) ns.pathNull++;
          nav.stuck = 0;
          nav.cd = NAV_REPATH_CD;
        }
      } else nav.stuck = 0;
    }
    ns.moved += Math.hypot(p.pos.x - x0, p.pos.y - y0);
    p.pos.x = clampMapX(p.pos.x); p.pos.y = clampMapY(p.pos.y);
  }

  /**
   * H.2：瞬移（閃現 / 回城 / 重生）也必須落在可走區，
   * 否則英雄會被塞進牆裡，然後每 tick 被推來推去。
   */
  _navTeleport(p, to) {
    if (!this.rules.navCollision) {          // v1/v2：維持舊行為（直接瞬移）
      p.pos.x = to.x; p.pos.y = to.y;
      return;
    }
    const q = projectToWalkable(to.x, to.y, HERO_RADIUS, this._aliveStructs);
    p.pos.x = clampMapX(q.x); p.pos.y = clampMapY(q.y);
    if (p._nav) { p._nav.path = null; p._nav.goal = null; p._nav.stuck = 0; }
  }

  pushFx(f) {
    // D-fix2：`exp` 是事件在 snapshot 裡的保留窗（Replay 每 2 秒取樣仍要拿得到），
    // `life` 才是 renderer 的實際 cast→travel→impact 時長。D 曾把兩者都拉到
    // 3.4/4.2 秒；英雄每 0.5 秒攻擊會同時疊 6–8 顆 additive FX，最後只剩白圈／白塊。
    // 現在保留窗不變，但視覺時長控制在 1× 肉眼可讀且不長期遮場的範圍。
    const minRetention = f.type === "tower" ? 3.4
      : (f.feedback === "skill" || f.type === "ult" ? 4.2
        : (f.feedback === "attack" || f.type === "line" ? 2.8 : 0.9));
    const minVisualLife = f.type === "tower" ? 1.45
      : (f.feedback === "skill" || f.type === "ult" ? 1.6
        : (f.feedback === "attack" || f.type === "line" ? 1.1 : 0.9));
    const retention = Math.max(f.exp ?? minRetention, minRetention);
    const visualLife = Math.max(f.life ?? minVisualLife, minVisualLife);
    this.fx.push({
      ...f, id: f.id ?? `fx${this._fxSeq++}`, at: f.at ?? this.t,
      exp: retention, life: visualLife,
    });
    if (this.fx.length > 60) this.fx.shift();
  }

  tick(dt) {
    if (this.over) return;
    const R = this.rules;                       // S29：模擬規則集（移速/傷害/兵線/攻塔）
    //  M1.5：本 tick 開始時的血量快照。tick 尾端比對即可涵蓋**所有**傷害來源
    //  （英雄／技能／塔／小兵／野怪／龍／巴龍），不必在十幾個扣血點各埋一次時間戳。
    const _hpAtTickStart = R.regen ? this.players.map((p) => p.hp) : null;
    this.t += dt;
    if (R.maxXpLevelsPerTick) {
      for (const p of this.players) this._addXp(p, 0, true);
    }
    if (R.towerAttackInterval) {
      for (const tw of Object.values(this.towers)) tw.atkCd = Math.max(0, (tw.atkCd ?? 0) - dt);
    }
    //  H.2：本 tick 還活著的結構（塔 hp>0 才擋人）。**已摧毀的塔碰撞完全解除**
    //  ⇒ 推掉的塔不再擋路，和畫面上塌成殘骸樁一致。每 tick 只算一次，
    //    傳 Set 進 nav 層（傳陣列的話 nav 每次查詢都要重建 Set，會很慢）。
    this._aliveStructs = new Set();
    for (const [id, tw] of Object.entries(this.towers)) {
      if (tw.hp > 0) this._aliveStructs.add(id);
    }
    // S29B1（v3）：lateAccelT 之後額外增陡（sudden death，雙方對稱）⇒ 無戰術平局
    //   不再拖出 30 分鐘長尾。v1/v2 無此欄位 ⇒ 第二項恆為 0，行為不變。
    const lateFactor = 1 + Math.max(0, this.t - 360) / 600 +
      (R.lateAccelT ? Math.max(0, this.t - R.lateAccelT) / R.lateAccelDiv : 0);

    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer = R.wavePeriod;
      const wave = this.waveNo++;
      const minionMaxHp = R.minionMaxHp ?? 130;
      const combatMeta = R.minionAttackInterval ? { atkCd: 0 } : {};
      for (const ln of ["top", "mid", "bot"]) {
        //  M1.5：該路高地塔（tier 0）已倒 ⇒ 攻方出強化兵（真實 MOBA 的超級兵）。
        //  只看建築狀態、雙方同規則；v1/v2 沒有 `laneBreachHpK` ⇒ 恆為 1 ⇒ 歷史基準不變。
        const breachHp = (side) => {
          const foe = side === "blue" ? "red" : "blue";
          return R.laneBreachHpK && this.towers[`${foe}_${ln}_0`].hp <= 0
            ? R.laneBreachHpK : 1;
        };
        const bHp = minionMaxHp * breachHp("blue");
        const rHp = minionMaxHp * breachHp("red");
        for (let i = 0; i < 4; i++) {
          const meta = { wave, slot: i, kind: i === 3 ? "caster" : "melee" };
          if (this.lanes[ln].bm.length < 16) {
            this.lanes[ln].bm.push({ id: "b" + this._mid++, t: 0.06, hp: bHp, maxHp: bHp, ...combatMeta, ...meta, super: bHp > minionMaxHp });
          }
          if (this.lanes[ln].rm.length < 16) {
            this.lanes[ln].rm.push({ id: "r" + this._mid++, t: 0.94, hp: rHp, maxHp: rHp, ...combatMeta, ...meta, super: rHp > minionMaxHp });
          }
        }
      }
    }
    for (const ln of ["top", "mid", "bot"]) {
      // S29B5：v2/v3 以世界單位/秒推進，地圖變長就真實增加 travel time。
      // v1 保留舊 progress/秒作為檢定力對照，不因新世界回寫歷史規則。
      const minionStep = R.minionWorldSpeed
        ? (R.minionWorldSpeed / laneLength(ln)) * dt
        : (R.minionProgressSpeed ?? 0.018) * dt;
      if (R.minionCollision) {
        // H.3：既有小兵原本「每 tick 無條件前進」，即使正在兵對兵交戰或存活塔仍在，
        // t 也照樣穿過去。以下只修 v3：用 tick 開始時的位置同時計算雙方 next，
        // 接敵就停在接觸距離、遇存活塔/主堡就停在攻擊帶外緣；不改傷害、金錢或波次數量。
        const contact = R.minionAttackRangeProgress ?? 0.035;
        //  M1.5：友軍排隊間距。以**世界單位**設定再換算成該路的 progress，
        //  三條長度不同的路才有相同的實際隊形（與 minionWorldSpeed 同一套慣例）。
        const queueGap = R.minionQueueGapWorld
          ? R.minionQueueGapWorld / laneLength(ln) : 0;
        // Keep the center inside the existing 0.05 tower targeting band. A
        // larger offset let minions damage a tower from just outside retaliation.
        const advance = (arr, foes, side) => {
          const dir = side === "blue" ? 1 : -1;
          let blocker = this.frontStructure(
            side, ln, posOnLane(ln, side === "blue" ? 1 : 0));
          // 固定 progress 差在三條不同長度／曲率的路上不是固定世界距離，會讓一條路
          // 貼塔、另一條路離塔很遠。以塔中心的實際距離反解停位，並保留在既有
          // siege / tower targeting band 內；只改 v3 minionCollision 路徑。
          let stopT = null;
          if (blocker) {
            const wanted = R.minionTowerStopRange ?? 4.6;
            let lo = 0, hi = 0.08;
            while (hi < 0.25 &&
              dist(posOnLane(ln, clamp(blocker.t - dir * hi, 0, 1)), blocker.pos) < wanted) hi *= 1.5;
            for (let i = 0; i < 14; i++) {
              const mid = (lo + hi) * 0.5;
              const p = posOnLane(ln, clamp(blocker.t - dir * mid, 0, 1));
              if (dist(p, blocker.pos) < wanted) lo = mid;
              else hi = mid;
            }
            stopT = clamp(blocker.t - dir * hi, 0, 1);
          }
          const next = arr.map((m) => {
            let next = clamp(m.t + dir * minionStep, 0, 1);
            let nearest = null;
            let nearestGap = Infinity;
            for (const foe of foes) {
              const gap = (foe.t - m.t) * dir;
              if (gap >= -contact * 0.25 && gap < nearestGap) {
                nearest = foe;
                nearestGap = gap;
              }
            }
            if (nearest && nearestGap <= contact + minionStep * 2) {
              const meet = (m.t + nearest.t) * 0.5;
              next = side === "blue"
                ? Math.min(next, meet - contact * 0.25)
                : Math.max(next, meet + contact * 0.25);
            }
            if (stopT != null) {
              next = side === "blue" ? Math.min(next, stopT) : Math.max(next, stopT);
            }
            return clamp(next, 0, 1);
          });
          //  ── M1.5：友軍排隊（兵線推進的關鍵環節）────────────────────────────
          //  在此之前小兵**只被敵人與建築擋**，友軍之間完全穿透 ⇒ 同一波 4 隻的 t
          //  一路維持完全相同（實測 `B[0.441 ×4 | 0.267 ×4 | 0.092 ×4]`），波與波固定
          //  相隔 wavePeriod × 速度（0.174）。後果：兩波接觸時 `strike()` 的
          //  `|slot 差|` tie-break 把 4v4 配成完美 1:1 對決，雙方同 tick 同歸於盡；
          //  後續波次距離 0.17，8 秒的對決期只推進 0.046 ⇒ **永遠來不及參戰**。
          //  兵線位置因此變成週期 = wavePeriod 的極限環（實測 30/30 seeds：高地全倒、
          //  一路清空，但兵線最深只到 t≈0.72，抵達門牙塔 13 單位 **0 次**）。
          //  推塔換來的兵力優勢（該路塔倒 ⇒ 我方小兵不再被塔清掉 ⇒ 12 隻 vs 8 隻）
          //  完全卡在後方，轉不成推進。
          //  讓後方小兵貼到前方友軍後面 queueGap 排隊，一波才會變成縱隊、整支兵力
          //  進入攻擊距離，人數優勢才能打穿敵波並繼續往基地走。
          //  ⚠ 只慢不退：排隊上限永遠不會把小兵推回它現在的位置之後。
          //  ⚠ 雙方同一條規則、順序以 next 排序 + 陣列索引破平手 ⇒ 決定性不變。
          //  ⚠ v1/v2 沒有 `minionQueueGapWorld` ⇒ queueGap 恆為 0 ⇒ 歷史基準逐位元不變。
          if (queueGap > 0 && arr.length > 1) {
            const order = arr.map((_, i) => i)
              .sort((a, b) => (next[b] - next[a]) * dir || a - b);
            for (let k = 1; k < order.length; k++) {
              const cur = order[k], ahead = order[k - 1];
              const limit = next[ahead] - dir * queueGap;
              const lim = side === "blue"
                ? Math.max(limit, arr[cur].t) : Math.min(limit, arr[cur].t);
              next[cur] = side === "blue"
                ? Math.min(next[cur], lim) : Math.max(next[cur], lim);
            }
          }
          return next;
        };
        const bNext = advance(this.lanes[ln].bm, this.lanes[ln].rm, "blue");
        const rNext = advance(this.lanes[ln].rm, this.lanes[ln].bm, "red");
        this.lanes[ln].bm.forEach((m, i) => { m.t = bNext[i]; });
        this.lanes[ln].rm.forEach((m, i) => { m.t = rNext[i]; });
      } else {
        // v1/v2 歷史基準保持逐位元相同行為。
        this.lanes[ln].bm.forEach((m) => (m.t = Math.min(1, m.t + minionStep)));
        this.lanes[ln].rm.forEach((m) => (m.t = Math.max(0, m.t - minionStep)));
      }
      if (R.symmetricMinionCombat) {
        // S29 修正（公平性 bug）：舊碼只迭代**藍方**小兵——多隻藍兵會挑到同一隻紅兵、
        //   把傷害集中在牠身上（死得快），藍兵受到的傷害卻是分散的 ⇒ 紅兵系統性先死。
        //   舊版塔會被瞬間融化，掩蓋了這個偏差；一旦小兵存活與否開始決定推塔，
        //   偏差就放大成「藍方 20/20 全勝」。改成雙方各自出手、傷害同時結算。
        // S29B1（v3）：巴龍 buff 兵線兵對兵也加成——否則強化波永遠被敵方新波次
        //   擋在出兵點，到不了主堡（收尾機制的關鍵環節；雙方對稱規則）。
        //  M1.5：高地塔（tier 0，最內層）被推掉 ⇒ 該路強化兵（真實 MOBA 的水晶/超級兵）。
        //    加上縱隊之後兵線仍卡在**中線**：交戰點落在 t≈0.5，離雙方任何一座塔都很遠，
        //    「推掉塔」根本沒有進到兵線交換裡 ⇒ 兩軍出兵數、傷害、HP 完全對稱 ⇒ 對稱系統
        //    只有對稱平衡點，前線永遠不動（實測縱隊後最深仍只到 t=0.84、進基地 0/30）。
        //    這裡把「拆掉該路最內層塔」變成該路兵線的**明確不對稱**，收尾才有因果鏈。
        //    雙方同一條規則、只看建築狀態，不看 seed。
        const breachK = (side) =>
          R.laneBreachFightK &&
            this.towers[`${side === "blue" ? "red" : "blue"}_${ln}_0`].hp <= 0
            ? R.laneBreachFightK : 1;
        const bkOf = (side) => (R.engagementFsm && this.fsm3 && this.t < (this.fsm3[side].baronBuffUntil ?? 0) ? R.baronMinionFightK : 1) * breachK(side);
        const bkB = bkOf("blue"), bkR = bkOf("red");
        const dmg = new Map();
        if (R.minionAttackInterval) {
          for (const m of [...this.lanes[ln].bm, ...this.lanes[ln].rm]) {
            m.atkCd = Math.max(0, (m.atkCd ?? 0) - dt);
          }
        }
        const strike = (atk, def, k) => atk.forEach((a) => {
          let foe = null;
          if (R.minionAttackInterval) {
            // B.4：先找射程內 lane 位置最近者，再以 slot 差打破平手；避免四隻兵
            // 每波都無條件集火陣列第一隻。規則對雙方相同，仍在同一張 dmg 表同時結算。
            let best = Infinity;
            for (const b of def) {
              const gap = Math.abs(b.t - a.t);
              if (gap >= R.minionAttackRangeProgress) continue;
              const score = gap * 1000 + Math.abs((b.slot ?? 0) - (a.slot ?? 0));
              if (score < best) { best = score; foe = b; }
            }
            if (foe && a.atkCd <= 0) {
              dmg.set(foe, (dmg.get(foe) ?? 0) + R.minionAttackDamage * k);
              a.atkCd = R.minionAttackInterval;
            }
          } else {
            // v2 歷史基準：維持舊 70 DPS 與陣列第一目標，避免改寫 runtime29 baseline。
            foe = def.find((b) => Math.abs(b.t - a.t) < 0.035);
            if (foe) dmg.set(foe, (dmg.get(foe) ?? 0) + 70 * k * dt);
          }
        });
        strike(this.lanes[ln].bm, this.lanes[ln].rm, bkB);
        strike(this.lanes[ln].rm, this.lanes[ln].bm, bkR);
        for (const [m, v] of dmg) m.hp -= v;
      } else {
        this.lanes[ln].bm.forEach((b) => {
          const foe = this.lanes[ln].rm.find((r) => Math.abs(r.t - b.t) < 0.035);
          if (foe) { b.hp -= 70 * dt; foe.hp -= 70 * dt; }
        });
      }
      [["blue", "bm"], ["red", "rm"]].forEach(([side, key]) => {
        const arr = this.lanes[ln][key]; if (!arr.length) return;
        let tw = this.frontStructure(
          side, ln, posOnLane(ln, side === "blue" ? 1 : 0));
        if (!tw) return;
        if (R.minionSiegeBand === Infinity) {
          // v1（舊）：只看「最前方小兵」是否到位，傷害卻乘上**整路小兵數**（最多 16）
          //   ⇒ 416 dmg/秒、塔 5 秒就倒。這是 S29 問題 5 的根因，保留供 baseline 對照。
          const lead = side === "blue" ? Math.max(...arr.map((m) => m.t)) : Math.min(...arr.map((m) => m.t));
          const reach = side === "blue" ? lead >= tw.t - 0.04 : lead <= tw.t + 0.04;
          if (reach) { tw.hp -= R.minionTowerDmg * arr.length * dt * lateFactor; this._dmgGold(side, 0); }
        } else {
          // v2（S29）：只有**實際貼在塔附近**的小兵能打塔，且同時計入上限 minionSiegeCap
          //   ⇒ 兵線堆疊不再瞬間拆塔；塔必須被持續圍攻才會倒。
          //  M1.5：基地建築（門牙塔／主堡）不在 lane 上，改用與兵線閘門同一個述詞；
          //  路上的三座塔維持既有的 lane band 判定不動。
          const baseStruct = R.nexusWaveGate &&
            (tw.lane === "nexus_guard" || tw.lane === "nexus");
          const n = Math.min(arr.filter((m) => baseStruct
            ? this._minionAtBase(side, tw, ln, m)
            : Math.abs(m.t - tw.t) <= R.minionSiegeBand).length, R.minionSiegeCap);
          // S29B1（v3）：巴龍 buff——擊殺方限時兵線攻城強化（收尾機制）
          const bk = R.engagementFsm && this.fsm3 && this.t < (this.fsm3[side].baronBuffUntil ?? 0) ? R.baronMinionK : 1;
          const structureFactor = R.structureAccelT ? 1 + Math.max(0, this.t - R.structureAccelT) / R.structureAccelDiv : 1;
          if (n > 0) { tw.hp -= R.minionTowerDmg * n * bk * dt * lateFactor * structureFactor; this._dmgGold(side, 0); }
        }
      });
      ["blue", "red"].forEach((side) => {
        for (const tr of [0, 1, 2]) {
          const tw = this.towers[`${side}_${ln}_${tr}`]; if (tw.hp <= 0) continue;
          const enemyKey = side === "blue" ? "rm" : "bm";
          //  L Hotfix 2：band 原本寫死 0.05，比 minionSiegeBand(0.06) 還窄
          //  ⇒ 小兵打得到塔、塔打不到它。改讀規則（v3 = 0.10）。
          const mBand = R.towerMinionBand ?? 0.05;
          const inRange = this.lanes[ln][enemyKey].filter((mm) => Math.abs(mm.t - tw.t) < mBand);
          if (R.towerAttackInterval) {
            const enemySide = side === "blue" ? "red" : "blue";
            const priorityHero = this.players.some((p) =>
              !p.dead && p.side === enemySide && (p.towerThreatUntil ?? 0) > this.t &&
              dist(p.pos, tw.pos) < R.towerAggroRange);
            if (priorityHero) continue; // 塔下攻擊英雄：下一發切到英雄，符合 MOBA 仇恨規則。
            // 固定鎖定仍在射程內的目標；目標離場後才換人，避免血條與鎖定提示抖動。
            let m = tw.targetKind === "minion" ? inRange.find((mm) => mm.id === tw.targetId) : null;
            if (!m) {
              m = inRange.slice().sort((a, b) =>
                Math.abs(a.t - tw.t) - Math.abs(b.t - tw.t) || String(a.id).localeCompare(String(b.id)))[0] ?? null;
              tw.targetId = m?.id ?? null; tw.targetKind = m ? "minion" : null; tw.lockShots = 0;
            }
            // 舊 v3 每個「塔有目標」tick 都為 renderer FX 消耗一次主 rng。
            // 離散射擊不再靠該骰值決定顯示，但仍消耗，避免視覺重構污染後續戰鬥決策序列。
            if (m) this.rng();
            if (m && tw.atkCd <= 0) {
              m.hp -= R.towerMinionDamage;
              tw.atkCd = R.towerAttackInterval; tw.lockShots += 1;
              this.pushFx({
                type: "tower", pos: { ...tw.pos }, target: posOnLane(ln, m.t),
                color: SIDE[side], sourceId: `${side}_${ln}_${tr}`, targetId: m.id,
                ability: "tower:basic", feedback: "attack", width: 1.2, exp: 1.15, life: 1.1,
                lockShots: tw.lockShots,
              });
            }
          } else {
            const m = inRange[0];
            if (m) { m.hp -= 120 * dt; if (this.rng() < dt * 1.5) this.pushFx({ type: "tower", pos: tw.pos, target: posOnLane(ln, m.t), color: SIDE[side] }); }
          }
        }
      });
      ["bm", "rm"].forEach((key) => {
        const deadMs = this.lanes[ln][key].filter((m) => m.hp <= 0);
        if (deadMs.length) {
          const foe = key === "bm" ? "red" : "blue";
          this._dmgGold(foe, deadMs.length * 20);
          // S29：小兵陣亡 → 敵方在場英雄分 XP（真實事件驅動，非時間流逝自動加）
          if (R.matchXp) for (const m of deadMs) this._awardMinionXp(foe, posOnLane(ln, m.t));
        }
        this.lanes[ln][key] = this.lanes[ln][key].filter((m) => m.hp > 0);
      });
    }

    // ── S29B1（v3）：塔反擊英雄 ─────────────────────────────────────────────
    //  射程內有敵方小兵 ⇒ 塔打兵；英雄攻擊塔下隊友 ⇒ 英雄短暫優先；
    //  其他情況沒有兵才打最近英雄。目標黏著到離開射程，避免每 tick 跳目標。
    //  ⚠ 塔傷**不執行擊殺**（最低打到 1 HP）：確保每個死亡都有英雄擊殺者
    //    （KDA 不變量 Σk == bK+rK == Σd），塔的作用是把越塔者打殘、逼撤退。
    if (R.engagementFsm) {
      for (const k in this.towers) {
        const tw = this.towers[k]; if (tw.hp <= 0) continue;
        const enemySide = tw.side === "blue" ? "red" : "blue";
        const candidates = this.players.filter((p) =>
          !p.dead && p.side === enemySide && dist(p.pos, tw.pos) < R.towerAggroRange);
        const threats = R.towerAttackInterval
          ? candidates.filter((p) => (p.towerThreatUntil ?? 0) > this.t) : [];
        if (tw.lane === "nexus_guard" && !threats.length) {
          const enemyKey = tw.side === "blue" ? "rm" : "bm";
          const inRange = [];
          for (const lane of ["top", "mid", "bot"]) {
            for (const m of this.lanes[lane][enemyKey]) {
              const pos = posOnLane(lane, m.t);
              const gap = dist(pos, tw.pos);
              if (gap <= 13 || (enemySide === "blue" ? m.t >= 0.95 : m.t <= 0.05)) {
                inRange.push({ m, lane, pos, gap });
              }
            }
          }
          const locked = tw.targetKind === "minion"
            ? inRange.find((entry) => entry.m.id === tw.targetId) : null;
          const target = locked ?? inRange.sort((a, b) =>
            a.gap - b.gap || String(a.m.id).localeCompare(String(b.m.id)))[0] ?? null;
          if (target) {
            if (tw.targetId !== target.m.id || tw.targetKind !== "minion") {
              tw.targetId = target.m.id; tw.targetKind = "minion"; tw.lockShots = 0;
            }
            if (tw.atkCd <= 0) {
              target.m.hp -= R.towerMinionDamage;
              tw.atkCd = R.towerAttackInterval; tw.lockShots += 1;
              this.pushFx({
                type: "tower", pos: { ...tw.pos }, target: { ...target.pos },
                color: SIDE[tw.side], sourceId: k, targetId: target.m.id,
                ability: "tower:basic", feedback: "attack", width: 1.2,
                exp: 1.15, life: 1.1, lockShots: tw.lockShots,
              });
            }
            continue; // 有兵線時保持標準塔仇恨；下一 tick 先清理死亡小兵。
          }
        }
        if (tw.lane !== "nexus" && this.lanes[tw.lane]) {
          const arr = this.lanes[tw.lane][tw.side === "blue" ? "rm" : "bm"];
          if (arr.some((m) => Math.abs(m.t - tw.t) < 0.05) && !threats.length) continue;
        }
        const nearest = (arr) => arr.slice().sort((a, b) =>
          dist(a.pos, tw.pos) - dist(b.pos, tw.pos) || String(a.id).localeCompare(String(b.id)))[0] ?? null;
        let best = threats.length ? nearest(threats)
          : (tw.targetKind === "hero" ? candidates.find((p) => p.id === tw.targetId) : null);
        if (!best) best = nearest(candidates);
        if (best) {
          if (R.towerAttackInterval) this.rng(); // 保留舊塔 FX 的 rng 消耗序列，見清兵分支註解。
          if (tw.targetId !== best.id || tw.targetKind !== "hero") {
            tw.targetId = best.id; tw.targetKind = "hero"; tw.lockShots = 0;
          }
          if (R.towerAttackInterval) {
            if (tw.atkCd <= 0) {
              //  L Hotfix 2：連續命中同一英雄的威脅增幅。塔仍不執行擊殺，
              //  改用「越站越痛」逼退——這是「不能站在塔下無視塔」的機制。
              const ramp = Math.min(R.towerLockRampMax ?? 1,
                1 + (tw.lockShots ?? 0) * (R.towerLockRamp ?? 0));
              const shot = R.towerAggroDmg * R.towerAttackInterval * lateFactor * ramp;
              best.hp -= Math.min(shot, Math.max(0, best.hp - 1));
              tw.atkCd = R.towerAttackInterval; tw.lockShots += 1;
              this.pushFx({
                type: "tower", pos: { ...tw.pos }, target: { x: best.pos.x, y: best.pos.y },
                color: SIDE[tw.side], sourceId: k, targetId: best.id,
                ability: "tower:basic", feedback: "attack", width: 1.2, exp: 1.15, life: 1.1,
                lockShots: tw.lockShots,
              });
            }
          } else {
            best.hp -= Math.min(R.towerAggroDmg * dt * lateFactor, Math.max(0, best.hp - 1));
            if (this.rng() < dt * 1.2) this.pushFx({ type: "tower", pos: tw.pos, target: { x: best.pos.x, y: best.pos.y }, color: SIDE[tw.side] });
          }
        } else if (R.towerAttackInterval && tw.targetKind === "hero") {
          tw.targetId = null; tw.targetKind = null; tw.lockShots = 0;
        }
      }
    }

    const alive = this.players.filter((p) => !p.dead);

    // ── S29B1（v3）：逃生閃現前置階段——tick 開頭的**凍結位置**、先收集後套用 ──
    //  「敵人此刻貼身」必須在移動前判定（撤退位移會把敵人甩出觸發圈）；
    //  凍結位置 + 收集後套用 ⇒ 與 players 迭代順序無關（追擊/切入閃現在後置階段）。
    if (R.engagementFsm && R.summonerSpells) {
      const casts = [];
      for (const p of alive) {
        if (this.t < p.sp.f.readyAt || !p.retreating || p.hp >= p.maxHp * R.flashEscapeHp) continue;
        let nd = R.flashEscapeFoeDist, nf = null;
        for (const q of alive) { if (q.side === p.side) continue; const dd = dist(p.pos, q.pos); if (dd < nd) { nd = dd; nf = q; } }
        if (nf) {
          const f = FOUNTAIN[p.side], dd = dist(p.pos, f) || 1;
          casts.push([p, {
            x: clampMapX(p.pos.x + ((f.x - p.pos.x) / dd) * R.flashDist),
            y: clampMapY(p.pos.y + ((f.y - p.pos.y) / dd) * R.flashDist),
          }]);
        }
      }
      for (const [p, to] of casts) {
        const from = { x: p.pos.x, y: p.pos.y };
        this._navTeleport(p, to);          // H.2：逃生閃現同樣要落在可走區
        this._spellEventV3(p, "flash", "escape", from, p.pos);
      }
    }

    let hot = null;
    if (R.engagementFsm) {
      // ── S29B1（v3）團戰熱點 ────────────────────────────────────────────────
      //  v2 病灶（audit 實測）：龍/巴龍活著 ⇒ hot 永久掛坑上；任意「3 人 + 1 敵」小群
      //  也成 hot ⇒ 80% 的 tick 都有熱點、88% 擊殺發生在熱點。
      //  v3：熱點只由**實際交戰**構成——每側 ≥hotMinPerSide 人、且存在
      //  <hotContactDist 的實際接觸。目標坑的吸引改由下方「團隊目標窗」處理。
      let bestN = 0, cands = [];
      for (const a of alive) {
        const near = alive.filter((b) => dist(a.pos, b.pos) < 14);
        const bl = near.filter((b) => b.side === "blue").length, rd = near.length - bl;
        if (bl < R.hotMinPerSide || rd < R.hotMinPerSide) continue;
        if (!near.some((b) => b.side !== a.side && dist(a.pos, b.pos) < R.hotContactDist)) continue;
        if (near.length > bestN) { bestN = near.length; cands = [near]; }
        else if (near.length === bestN) cands.push(near);
      }
      if (cands.length) {
        const all = [...new Set(cands.flat())];
        hot = { x: all.reduce((s, p) => s + p.pos.x, 0) / all.length, y: all.reduce((s, p) => s + p.pos.y, 0) / all.length };
      }
      // ── Milestone F：團戰窗遲滯 ──────────────────────────────────────────
      //  E baseline 實測：單場 20.8 個熱點窗、49% 短於 3 秒且零陣亡、中位 2.0 秒。
      //  根因不是「熱點太難成立」，而是**接觸一斷就立刻解散**：每次解散都送出
      //  DISENGAGE + 13 秒重接戰冷卻，於是同一場遭遇被切成好幾段擦撞，
      //  既形不成團戰，也永遠沒有「贏了這一波」可以轉化。
      //  修法：成立條件**完全不放寬**（一樣要每側 2 人 + 實際接觸），
      //  但成立之後給 fightHoldT 秒的遲滯——接觸暫斷仍算同一場。
      const holdOn = R.fightHoldT > 0 && this.t >= (R.fightHoldAfterT ?? 0);
      if (holdOn || this.fight3) {
        if (hot) {
          if (this.fight3 && this.t - this.fight3.start > (R.fightMaxDur ?? Infinity)) {
            // 已經打滿上限仍在接觸 ⇒ 先結算這一場（含轉化），下一 tick 重新開一場
            this._resolveFightV3(this.fight3, alive);
            this.fight3 = null;
          }
          if (!this.fight3) {
            this.fight3 = {
              pos: { ...hot }, start: this.t, lastContact: this.t,
              deaths: { blue: 0, red: 0 }, members: new Set(),
            };
          } else {
            this.fight3.pos = { ...hot };
            this.fight3.lastContact = this.t;
          }
          for (const p of alive) {
            if (dist(p.pos, hot) < 16) this.fight3.members.add(p.id);
          }
        } else if (this.fight3 && holdOn && this.t - this.fight3.lastContact <= R.fightHoldT &&
                   this.t - this.fight3.start <= (R.fightMaxDur ?? Infinity)) {
          hot = { ...this.fight3.pos };          // 遲滯窗內：維持同一場團戰
        } else if (this.fight3) {
          this._resolveFightV3(this.fight3, alive);
          this.fight3 = null;
        }
      } else if (this.hot3 && !hot) {
        // 熱點解散 ⇒ 參與者（雙方）進入 DISENGAGE + 重接戰冷卻：斬斷連環互毆
        for (const p of alive) {
          if (dist(p.pos, this.hot3.pos) < 16) {
            p.reengageAt = Math.max(p.reengageAt, this.t + R.reengageAfterFight);
            p.joinGo = false;
            if (!p.retreating) { p.fsm = "DISENGAGE"; p.fsmUntil = this.t + 4; }
          }
        }
      }
      this.hot3 = hot ? { pos: { ...hot } } : null;
      // ── 團隊目標窗（取代「坑 = 永久熱點」）───────────────────────────────
      //  每 10 秒各隊擲一次「要不要打這個目標」（機率 = dragonJoin/baronJoin knob，
      //  無戰術 = 0.6）；開窗 20 秒 ⇒ 坑邊集結有始有終，不再常駐。
      if (this.neutrals) {
        for (const side of ["blue", "red"]) {
          const T = this.fsm3[side];
          const key = this.neutrals.baron.alive ? "baron" : this.neutrals.dragon.alive ? "dragon" : null;
          if (!key) { T.objGo = false; T.objKey = null; continue; }
          // Milestone F：主動權窗指向龍／巴龍時，直接把目標窗打開。
          //   這是刻意「接既有路徑」而不是另寫一套集結：目標窗的距離、承諾上限、
          //   打野/輔助必去、knob 單調性（tactic24 C4c）全部沿用，不重複實作。
          if (T.initKind && this.t < T.initUntil && (T.initKind === "baron" || T.initKind === "dragon")
              && this.neutrals[T.initKind]?.alive) {
            if (!T.objGo || T.objKey !== T.initKind) {
              T.objGo = true; T.objKey = T.initKind;
              T.objChance = 0.6; T.objStart = this.t;
            }
            T.objUntil = Math.max(T.objUntil, T.initUntil);
            continue;
          }
          if (this.t >= T.objEvalT) {
            T.objEvalT = this.t + 12;
            const K = this.tacticOn ? this.tk[side] : null;
            const chance = K ? (key === "baron" ? K.baronJoin : K.dragonJoin) : 0.6;
            const roll = K ? this.rng2() : this.rng();
            // 窗長由 knob 決定：高目標投入的戰術蹲得久、低投入的淺嘗即走
            //  ⇒ dragonJoin/baronJoin → 行為的單調性放在機制本身（tactic24 C4c）
            if (!T.objGo && roll < chance) {
              T.objGo = true; T.objKey = key; T.objChance = chance;
              T.objStart = this.t; T.objUntil = this.t + 8 + 14 * chance;
            }
          }
          // 已開打（目標 HP 有真實下降）⇒ 延長，但承諾上限同樣吃 knob（不無限蹲坑）
          if (T.objGo && this.neutrals[T.objKey]?.alive && this.neutrals[T.objKey].hp < this.neutrals[T.objKey].maxHp) {
            T.objUntil = Math.min(Math.max(T.objUntil, this.t + 6), T.objStart + 10 + 32 * (T.objChance ?? 0.6));
          }
          if (T.objGo && (this.t > T.objUntil || !this.neutrals[T.objKey]?.alive)) { T.objGo = false; T.objKey = null; }
        }
      }
    } else {
    if (this.dragon.alive) hot = PITS.dragon;
    if (this.baron.alive) hot = PITS.baron;
    if (!hot) {
      if (R.symmetricHot) {
        // S29（決定性公平性 bug 修正）：舊碼取「**陣列順序第一個**符合條件的玩家」的鄰域
        //   當中心。players 是 b1–b5 在前 ⇒ 熱點永遠繞著**藍方**隊形長，紅方只能一個一個
        //   走進藍方陣中被集火。實測把 players 反轉即可讓勝負完全翻轉（藍 20/20 → 0/20）。
        //   改為：取「最密集」的交戰鄰域；並列時合併取 centroid ⇒ 與陣列順序完全無關。
        let bestN = 0, cands = [];
        for (const a of alive) {
          const near = alive.filter((b) => dist(a.pos, b.pos) < 14);
          if (near.filter((b) => b.side !== a.side).length >= 1 && near.length >= 3) {
            if (near.length > bestN) { bestN = near.length; cands = [near]; }
            else if (near.length === bestN) cands.push(near);
          }
        }
        if (cands.length) {
          const all = [...new Set(cands.flat())];
          hot = { x: all.reduce((s, p) => s + p.pos.x, 0) / all.length, y: all.reduce((s, p) => s + p.pos.y, 0) / all.length };
        }
      } else {
        for (const a of alive) {
          const near = alive.filter((b) => dist(a.pos, b.pos) < 14);
          if (near.filter((b) => b.side !== a.side).length >= 1 && near.length >= 3) {
            hot = { x: near.reduce((s, p) => s + p.pos.x, 0) / near.length, y: near.reduce((s, p) => s + p.pos.y, 0) / near.length };
            break;
          }
        }
      }
    }
    }   // ← v1/v2 熱點路徑結束（v3 走上方 engagementFsm 分支）

    const pendingHits = [];       // S29：本 tick 的英雄傷害（同時結算，見下方 flush）
    const effLanes = new Map();   // S29：loop1 決定的 effLane → loop2 的推塔判定沿用
    // Milestone D-fix2：在任何英雄移動前，用同一份凍結位置建立全員局部決策。
    // 這維持 S29 的順序公平性；plan 本身不抽 rng，也不改傷害／技能 CD。
    const decisionPlans = new Map();
    if (R.explainableCombatDecisions) {
      for (const p of alive) decisionPlans.set(p.id, this._combatDecisionV3(p, alive));
    }
    for (const p of this.players) {
      if (p.dead) {
        if (R.explainableCombatDecisions) {
          p.decisionAction = "RESPAWN"; p.decisionTargetId = null;
          p.decisionScore = 0; p.decisionReasons = ["state:dead"];
        }
        p.respawn -= dt;
        if (p.respawn <= 0) {
          p.dead = false; p.hp = p.maxHp; p.retreating = false; p.hitBy.clear();
          const f = FOUNTAIN[p.side]; this._navTeleport(p, f); p.state = "回防";   // H.2：重生點投影到可走區
          // S29B1（v3）：復活鎖——RETURN 期間不得參團/追擊，必須先走回戰線
          if (R.engagementFsm) {
            p.fsm = "RETURN"; p.reengageAt = this.t + R.respawnLock; p.chaseId = null;
            p.joinGo = false; p.objGo = false; p.contactSince = null; p.recallT = 0;
            p.decisionAt = -1; p.decisionAction = "RETURN"; p.decisionTargetId = null;
          }
        } else if (R.engagementFsm) p.fsm = "RESPAWN";
        continue;
      }
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
      let retreatAt = M ? clamp(retreatAt0 + M.retreatAdj, 0.10, 0.45) : retreatAt0;
      const returnAt = M ? clamp(0.60 + M.returnAdj, 0.45, 0.80) : 0.60;
      let returnAtEff = returnAt;
      if (R.engagementFsm) {
        // S29B1：情境化撤退——被包（敵多於友 +1）提早撤、近期連死提早撤、劣勢隊更保守。
        //   全部是「門檻平移」（同 S28 手法），不引入新 rng 抽樣、不碰傷害。
        if (R.explainableCombatDecisions) {
          // 鏡像同職業以固定 commitment 作撤退平手裁決：高 commitment 多承擔一點
          // 風險、低 commitment 早一步拉開。幅度上限約 5.7pp，且不依陣營或迭代順序。
          retreatAt = clamp(retreatAt - (p.decisionTemper ?? 0) * 0.22, 0.10, 0.45);
        }
        const foesN = alive.filter((q) => q.side !== p.side && dist(q.pos, p.pos) < 10).length;
        const alliesN = alive.filter((q) => q.side === p.side && q !== p && dist(q.pos, p.pos) < 10).length;
        retreatAt = Math.min(0.50, retreatAt + R.baseRetreatBonus);   // 基礎餘裕：撤退要撤得活
        if (foesN > alliesN + 1) retreatAt = Math.min(0.50, retreatAt + R.outnumberRetreatBonus);
        if (this._recentDeathsV3(p) >= 2) retreatAt = Math.min(0.55, retreatAt + R.repeatDeathRetreatBonus);
        if (this._teamBehindV3(p.side)) retreatAt = Math.min(0.55, retreatAt + 0.05);
        // RECALL：已撤到泉水附近 ⇒ 補到 88% 才重新出門（回城/補給有始有終）
        if (p.retreating && dist(p.pos, FOUNTAIN[p.side]) < 12) returnAtEff = Math.max(returnAt, 0.88);
      }
      if (p.hp < p.maxHp * retreatAt) {
        if (this.playerStatsOn && !p.retreating) this.pexec[p.id].retreats++;   // 真實計數
        p.retreating = true;
      } else if (p.hp >= p.maxHp * returnAtEff) p.retreating = false;
      const localDecision = decisionPlans.get(p.id) ?? null;
      // 低血量／人數劣勢的局部評估可比固定 25% 門檻更早觸發撤退；
      // 一旦進入既有 retreating 流程，回城、受擊中斷與回血遲滯仍沿用原機制。
      if (localDecision?.action === "RETREAT") p.retreating = true;
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
        tacTgt = INVASION_POINT[p.side]; stOv = "入侵";
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
      // S29B1（v3）：追擊**維持**判定（取得已移到 _postCombatV3——在全員移動與
      //   傷害結算完的凍結位置上判定，否則先迭代方用敵方舊位置搶先取得追擊，
      //   實測會累積成 ~17pp 的系統性順序優勢）
      let chaseFoe = null;
      if (R.engagementFsm && !p.retreating && !tacTgt && !skipFight && this.t >= p.reengageAt) {
        chaseFoe = this._chaseAliveV3(p);
      } else if (R.engagementFsm && p.chaseId) p.chaseId = null;
      const localTarget = localDecision?.targetId
        ? alive.find((q) => q.id === localDecision.targetId && !q.dead) ?? null
        : null;
      if (p.retreating) {
        tgt = FOUNTAIN[p.side];
        st = R.engagementFsm && dist(p.pos, FOUNTAIN[p.side]) < 10 ? "回城" : "撤退";
        if (R.engagementFsm) p.fsm = st === "回城" ? "RECALL" : "RETREAT";
        // ── S29B3：回城 channel——撤退中、安全且離泉水遠 ⇒ 原地引導 → 傳送。
        //    「走路回泉水回血」與「回城傳送回血」從此是兩件可分辨的事。
        if (R.recallChannel) {
          const fdist = dist(p.pos, FOUNTAIN[p.side]);
          const danger = alive.some((q) => q.side !== p.side && dist(q.pos, p.pos) < R.recallSafeDist);
          if (p.recallT > 0) {
            if (danger || p.hp + 1e-9 < p.recallHpLast) {
              // 受擊或敵人接近 ⇒ 中斷，恢復走路撤退（recallCd 內不重試）
              p.recallT = 0; p.recallCdAt = this.t + R.recallCd;
              this._recallEventV3(p, "cancel");
            } else {
              p.recallT -= dt;
              if (p.recallT <= 0) {
                const from = { x: p.pos.x, y: p.pos.y }, f = FOUNTAIN[p.side];
                this._navTeleport(p, f);     // H.2：回城落點投影到可走區
                p.contactSince = null;
                this._recallEventV3(p, "done", from);
                st = "回城"; p.fsm = "RECALL";
              } else {
                tgt = { x: p.pos.x, y: p.pos.y };   // 原地引導（不移動）
                st = "回城中"; p.fsm = "RECALL";
              }
            }
          } else if (fdist > R.recallMinDist && this.t >= p.recallCdAt &&
                     // 啟動遲滯：開始引導需要更大的淨空（1.4×），中斷判定維持 recallSafeDist
                     !alive.some((q) => q.side !== p.side && dist(q.pos, p.pos) < R.recallSafeDist * 1.4)) {
            p.recallT = R.recallChannelT;
            this._recallEventV3(p, "start");
            tgt = { x: p.pos.x, y: p.pos.y };
            st = "回城中"; p.fsm = "RECALL";
          }
          p.recallHpLast = p.hp;
        }
      }
      else if (tacTgt) { tgt = tacTgt; st = stOv; if (R.engagementFsm) p.fsm = "ROAM"; }
      else if (chaseFoe) { tgt = { x: chaseFoe.pos.x, y: chaseFoe.pos.y }; st = "追擊"; p.fsm = "CHASE"; }
      // S29B1（v3）：脫戰——團戰解散後短暫退到自家前線塔，不立即找下一場架
      else if (R.engagementFsm && p.fsm === "DISENGAGE" && this.t < p.fsmUntil) {
        const ownTw = this.frontTower(p.side === "blue" ? "red" : "blue", p.lane);
        tgt = ownTw ? ownTw.pos : BASE[p.side]; st = "脫戰";
      }
      // Milestone D-fix2：沒有兵線或人數不夠時不單人硬闖敵塔。這只改移動目標；
      // 塔傷、塔仇恨、碰撞與正式 tower single source 均不變。
      else if (localDecision?.action === "FALLBACK") {
        let threatTower = null, threatDist = Infinity;
        for (const tw of Object.values(this.towers)) {
          if (tw.side === p.side || tw.hp <= 0) continue;
          const dd = dist(p.pos, tw.pos);
          if (dd < threatDist) { threatDist = dd; threatTower = tw; }
        }
        if (threatTower) {
          const safeDist = (R.towerAggroRange ?? 8) + 2.5;
          const ux = (p.pos.x - threatTower.pos.x) / (threatDist || 1);
          const uy = (p.pos.y - threatTower.pos.y) / (threatDist || 1);
          tgt = { x: threatTower.pos.x + ux * safeDist, y: threatTower.pos.y + uy * safeDist };
        } else tgt = BASE[p.side];
        st = "避塔"; p.fsm = "SETUP";
      }
      // S29B1（v3）：團隊目標窗（龍/巴龍）——窗開著才集結；打野/輔助必去、其他人吃 knob
      else if (R.engagementFsm && this.neutrals && !skipFight && this.fsm3[p.side].objGo &&
               this._objJoinV3(p, this.fsm3[p.side].objKey, K, M)) {
        tgt = PITS[this.fsm3[p.side].objKey]; st = "團戰!"; p.fsm = "OBJECTIVE";
      }
      // ── Milestone F：主動權窗 · 攻城 ──────────────────────────────────
      //  剛打贏一波、附近沒有可打的龍／巴龍 ⇒ 把人數優勢換成塔，而不是各自走回線上。
      //  殘血的人不跟進（交給既有回城邏輯），避免「贏了團戰卻送掉一波人」。
      else if (R.engagementFsm && !skipFight && this._initiativeSiegeV3(p)) {
        const tw = this.towers[this.fsm3[p.side].initTarget];
        tgt = tw.pos; st = "圍攻"; p.fsm = "OBJECTIVE";
      }
      // S28：團戰/目標集結門檻 += joinAdj（勇氣/戰術/配合/溝通/反應＋隊伍領導平均）
      //   或 objAdj（龍/巴龍坑：視野/戰術/專注/溝通＋隊伍領導平均）。
      //   ⚠ 抽樣次數與來源流不變（K ⇒ rng2、無 K ⇒ rng）；只平移門檻。
      //   S29B1（v3）：參團改走 _joinV3（黏性決策 + 距離圈 + 人數 + 冷卻；
      //   打野/輔助從「無條件」改為「+jgSupJoinBonus 加成」——這是 15 分 44 殺的主根因之一）
      else if (!skipFight && hot && (R.engagementFsm
        ? this._joinV3(p, hot, K, M, alive)
        : (p.role === "jungle" || p.role === "sup" || (K ? this.rng2() < this._joinChance(K, hot, M) : this.rng() < this._joinChance(null, hot, M))))) {
        tgt = hot; st = "團戰!";
        if (R.engagementFsm) p.fsm = dist(p.pos, hot) < 10 ? "ENGAGE" : "SETUP";
      }
      // 1v1／小規模接觸不一定會形成 hot；依血量、人數、角色距離、CD 與目標價值
      // 選擇支援、接戰、拉扯或追擊，避免「擦身而過仍照原路走」。
      else if (!skipFight && localDecision?.fresh &&
               localDecision?.action === "SUPPORT" && localTarget) {
        tgt = { x: localTarget.pos.x, y: localTarget.pos.y };
        st = "支援"; p.fsm = "SETUP";
      }
      else if (!skipFight && localTarget &&
               ((localDecision?.action === "ENGAGE" && dist(p.pos, localTarget.pos) <= 6.5) ||
                (localDecision?.action === "PURSUE" &&
                 dist(p.pos, localTarget.pos) <= R.decisionContact) ||
                (localDecision?.fresh && localDecision?.action === "KITE" &&
                 dist(p.pos, localTarget.pos) <= 6.5))) {
        //  Milestone H：**站位**＝席位基準距離 × 英雄定位倍率。
        //    坦克／戰士貼得更近、射手／法師站得更遠；倍率限幅 0.7–1.25，
        //    不改移速、不改攻擊距離判定、不改傷害。
        const engageDistance = (p.role === "top" ? 2.6 : p.role === "jungle" ? 2.2 :
          p.role === "mid" ? 5.0 : p.role === "adc" ? 5.8 : 5.2)
          * (this._heroMod(p)?.engageDistK ?? 1);
        const desired = engageDistance;
        const dd = dist(p.pos, localTarget.pos) || 1;
        const ux = (p.pos.x - localTarget.pos.x) / dd;
        const uy = (p.pos.y - localTarget.pos.y) / dd;
        if (localDecision.action === "PURSUE") {
          tgt = { x: localTarget.pos.x, y: localTarget.pos.y };
          st = "追擊"; p.fsm = "CHASE";
        } else if (localDecision.action === "KITE" && dd < desired - 0.5) {
          tgt = { x: p.pos.x + ux * 3.5, y: p.pos.y + uy * 3.5 };
          st = "拉扯"; p.fsm = "SETUP";
        } else if (localDecision.action === "KITE" && dd <= desired + 1) {
          // 保持職業射程並側移，不把「拉扯」實作成直接退出 8 單位戰鬥圈。
          // 同席位編號採相同旋向（b3/r3 一致）⇒ 不引入陣營特例。
          const turn = Number(p.id.slice(1)) % 2 ? 1 : -1;
          const angle = 0.18 * turn, cos = Math.cos(angle), sin = Math.sin(angle);
          tgt = {
            x: localTarget.pos.x + (ux * cos - uy * sin) * dd,
            y: localTarget.pos.y + (ux * sin + uy * cos) * dd,
          };
          st = "拉扯"; p.fsm = "SETUP";
        } else {
          tgt = { x: localTarget.pos.x + ux * desired, y: localTarget.pos.y + uy * desired };
          st = localDecision.action === "ENGAGE" ? "接戰" : "拉扯";
          p.fsm = localDecision.action === "ENGAGE" ? "ENGAGE" : "SETUP";
        }
      }
      else {
        // S29B1（v3）：防守——自己這路（或主堡）有敵方英雄壓塔 ⇒ 回防
        if (R.engagementFsm) {
          let dtw = null, ddw = 55;
          for (const k2 in this.towers) {
            const tw2 = this.towers[k2];
            if (tw2.side !== p.side || tw2.hp <= 0) continue;
            if (tw2.lane !== effLane && tw2.lane !== "nexus" && tw2.lane !== "nexus_guard") continue;
            if (!alive.some((q) => q.side !== p.side && dist(q.pos, tw2.pos) < 8)) continue;
            const dd = dist(p.pos, tw2.pos);
            if (dd < ddw) { ddw = dd; dtw = tw2; }
          }
          if (dtw) { tgt = dtw.pos; st = "回防"; p.fsm = "LANE"; }
        }
        // S29B1（v3）：打野預設行為——無戰術時有節奏地 Gank（有 cooldown），
        //   其餘時間農自家野區營地（不再吃中路兵線——S29A 已知技術債）
        if (R.engagementFsm && !tgt && p.role === "jungle") {
          const T = this.fsm3[p.side];
          if (!K && this.t >= T.gankNext && !hot) {
            const r3 = this.rng();
            T.gankLane = r3 < 1 / 3 ? "top" : r3 < 2 / 3 ? "mid" : "bot";
            T.gankUntil = this.t + R.defaultGankWindow;
            T.gankNext = this.t + R.defaultGankInterval + this.rng() * 12;   // 窗關即進冷卻
          }
          if (!K && this.t < T.gankUntil) { effLane = T.gankLane; stOv = "抓人"; p.fsm = "ROAM"; }
          if (stOv !== "抓人") {
            const camp = this._nextCampV3(p);
            if (camp) { tgt = camp.pos; st = "打野"; p.fsm = "FARM"; }
          }
        }
        if (!tgt) {
          const ftw = this.frontStructure(p.side, effLane, p.pos);
          if (!ftw) { tgt = BASE[p.side === "blue" ? "red" : "blue"]; st = "圍攻"; }
          else if (ftw.lane === "nexus_guard" || ftw.lane === "nexus") {
            tgt = ftw.pos;
            st = ftw.lane === "nexus_guard" ? "攻門牙塔" : "圍攻主堡";
          }
          else {
            // 壓向該路敵方前線塔（塔破 frontTower 前移 → 自然逐塔推進）
            // S24：推線深度偏移（lanePlan/aggression/towerPriority 派生，±0.09；未啟用 = 0）
            const laneAdvance = R.laneAdvanceWorldSpeed
              ? (this.t * R.laneAdvanceWorldSpeed) / laneLength(effLane)
              : this.t / 600;
            let base = p.side === "blue" ? 0.30 + laneAdvance : 0.70 - laneAdvance;
            if (K) base += (p.side === "blue" ? 1 : -1) * (K.laneOffset[effLane] || 0);
            // S28：推線深度 += laneAdj（勇氣/手速/抗壓 → 壓得更深；走位/決策 → 站得更安全）
            if (M) base += (p.side === "blue" ? 1 : -1) * M.laneAdj;
            const adv = p.side === "blue" ? clamp(Math.min(base, ftw.t + 0.02), 0.3, 0.98) : clamp(Math.max(base, ftw.t - 0.02), 0.02, 0.7);
            tgt = posOnLane(effLane, adv); st = stOv ?? (p.role === "jungle" ? "游走" : "對線");
          }
          if (R.engagementFsm) p.fsm = stOv ? "ROAM" : "LANE";
        }
      }
      // S29：移速校準——舊值 13/16 單位/模擬秒 ＝ 小兵的 7.3×（真實 MOBA ≈ 1.3×）
      //   ⇒「英雄移動看起來過快」。v2 = 2.5/3.0（約小兵 1.4×/1.7×）。
      //   S29B1（v3）：追擊視同交戰移速；撤退者有逃生移速加成（追擊者沒有）⇒
      //   「撤退＝死亡行軍」的結構性問題從機制面解掉，不是調傷害。
      //  Milestone M：職業站位（未啟用原型層 ⇒ 原樣回傳，逐位元不變）
      tgt = this._archPosition(p, tgt, alive);
      const d = dist(p.pos, tgt),
        spd = ((st === "團戰!" || st === "追擊" || st === "接戰" || st === "拉扯") ? R.fightSpeed : R.moveSpeed) *
          (R.engagementFsm && p.retreating ? R.retreatSpeedMult : 1) *
          (R.neutralObjectives && this.t < (p.redSlowUntil ?? 0) ? R.redBuffSlowK : 1) *
          (R.neutralObjectives && this.t < (p.blueBuffUntil ?? 0) ? R.blueBuffMoveK : 1) *
          //  Milestone J：幽魂的移速加成。未啟用技能層 ⇒ hasteUntil 恆為 0 ⇒ 係數恆為 1。
          (this.spellsOn && this.t < (p.hasteUntil ?? 0) ? R.ghostSpeedK : 1) * dt;
      //  ── H.2：真正的碰撞與導航 ────────────────────────────────────────────
      //  舊版是「直線位移 + 對 28 個手寫圓做推開」，那和畫面上的牆體無關 ⇒ 會穿牆。
      //  現在：目標點先推回通道中心 → 子步進前進（沿牆切線滑動）→ 需要時尋路。
      //  ⚠ 只在 `navCollision`（v3）啟用。v1/v2 保留舊路徑：它們是 runtime29 用來
      //  重現「修改前病灶」的歷史基準，一旦也吃到碰撞就不再可比（實測 §12/§23/§29 會紅）。
      if (R.navCollision) {
        if (d > 0.6) this._navMove(p, tgt, spd);
      } else {
        if (d > 0.6) { p.pos.x += ((tgt.x - p.pos.x) / d) * Math.min(spd, d); p.pos.y += ((tgt.y - p.pos.y) / d) * Math.min(spd, d); }
        for (const o of WALLS) { const dd = dist(p.pos, o); if (dd < o.r + 1.4) { p.pos.x += ((p.pos.x - o.x) / (dd || 1)) * (o.r + 1.4 - dd); p.pos.y += ((p.pos.y - o.y) / (dd || 1)) * (o.r + 1.4 - dd); } }
        p.pos.x = clampMapX(p.pos.x); p.pos.y = clampMapY(p.pos.y);
      }
      // S28：個人行為計數（真實觀測，非編造）——進入團戰的次數、貼在存活目標坑的 tick 數。
      //   紅方（無能力資料）同樣計數 ⇒ 天然對照組：藍方隨天賦變、紅方不變。
      if (this.playerStatsOn) {
        if (st === "團戰!" && p.state !== "團戰!") this.pexec[p.id].fights++;
        if (this.dragon.alive && dist(p.pos, PITS.dragon) < 9) this.pexec[p.id].objTicks++;
        if (this.baron.alive && dist(p.pos, PITS.baron) < 9) this.pexec[p.id].objTicks++;
      }
      p.state = st;
      effLanes.set(p, effLane);
      // v1：交戰緊接著移動、在同一迴圈內處理（＝舊行為，含「用敵方舊位置判定接戰」）。
      if (!R.twoPhaseTick) this._combatStep(p, effLane, alive, dt, lateFactor, pendingHits);
    }

    // S29（順序偏差修正 ②）：兩相 tick —— 先讓**全員**移動完，再讓全員交戰。
    //   舊碼把移動與交戰混在同一迴圈：藍方先移動，且用紅方的**舊位置**判定接戰；
    //   紅方則用藍方的**新位置**。這與 ①（先手扣血）、③（熱點取陣列第一人）疊加後，
    //   造成「先被迭代的一方 100% 獲勝」——實測反轉 players 陣列即可讓勝負完全翻轉。
    //   兩相之後，交戰判定看到的是所有人的最終位置 ⇒ 與迭代順序無關。
    if (R.twoPhaseTick) {
      for (const p of this.players) {
        if (p.dead) continue;
        this._combatStep(p, effLanes.get(p) ?? p.lane, alive, dt, lateFactor, pendingHits);
      }
    }

    // S29（順序偏差修正 ①）：同時結算 —— 本 tick 所有傷害一起套用，再判定死亡。
    //   ⇒ 兩名英雄可在同一 tick 互相擊殺（真實換命），沒有任何一方享有「先手」。
    if (R.simultaneousCombat && pendingHits.length) {
      for (const [, foe, amt] of pendingHits) this._damageHero(foe, amt);
      for (const [atk, foe] of pendingHits) {
        if (foe.hp <= 0 && !foe.dead) this._resolveKill(atk, foe);
      }
    }
    //  Milestone J：點燃的持續傷害在同時結算之後、後置階段之前扣。
    //    放這裡才會與普攻共用同一個「本 tick 的死亡判定」語意。
    this._igniteTickV2(dt);

    // S29B1（v3）：後置階段——追擊取得與閃現在**全員移動+傷害結算完**的凍結位置上
    //   判定並「先收集、後套用」⇒ 與迭代順序無關（否則先迭代方用敵方舊位置搶先
    //   取得追擊/閃現，lateAccel 提高致命度後實測放大成 ~17pp 的系統性順序優勢）。
    if (R.engagementFsm) this._postCombatV3(alive, hot);
    //  Milestone J：其餘六個召喚師技能同樣在凍結位置上判定（先收集後套用）。
    this._summonerSpellsV2(alive, dt);

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

    for (const k in this.towers) {
      const tw = this.towers[k];
      if (tw.hp <= 0 && !tw._dead) {
        tw._dead = true;
        const atk = tw.side === "blue" ? "red" : "blue";
        this._dmgGold(atk, tw.lane === "nexus" ? 0 : 250);
        // S29：拆塔 XP（拆塔方在場英雄；主堡不給，因為那就結束了）
        if (R.matchXp && tw.lane !== "nexus") {
          for (const q of this.players) {
            if (q.side === atk && !q.dead && dist(q.pos, tw.pos) < XP.TOWER_RADIUS) this._addXp(q, XP.TOWER);
          }
        }
      }
    }

    if (R.neutralObjectives) {
      // S29B1（v3）：正式中立目標（真實 HP / participants / killerTeam / Smite）
      this._updateNeutralsV3(alive, dt);
    } else {
      const upd = (o, key, gold) => {
        if (!o.alive) { o.respawn -= dt; if (o.respawn <= 0) { o.alive = true; o.hp = 100; } return; }
        const pit = PITS[key]; const b = alive.filter((p) => p.side === "blue" && dist(p.pos, pit) < 9).length;
        const r = alive.filter((p) => p.side === "red" && dist(p.pos, pit) < 9).length;
        o.contested = b > 0 && r > 0;
        // S29：目標擊殺 → 全隊存活者分 XP（輔助/打野不因低擊殺卡等級）
        if (b > r) { o.hp -= 28 * dt; if (o.hp <= 0) { o.alive = false; o.respawn = 150; this._dmgGold("blue", gold); if (R.matchXp) this._awardObjectiveXp("blue", key); } }
        else if (r > b) { o.hp -= 28 * dt; if (o.hp <= 0) { o.alive = false; o.respawn = 150; this._dmgGold("red", gold); if (R.matchXp) this._awardObjectiveXp("red", key); } }
      };
      if (this.t > 90) upd(this.dragon, "dragon", 200);
      if (this.t > 300) upd(this.baron, "baron", 400);
    }

    this.bGold += 14 * dt; this.rGold += 14 * dt;
    this.fx = this.fx.filter((f) => (f.exp -= dt) > 0);
    //  M1.5：脫戰計時器的**唯一**寫入點（見 tick 開頭的血量快照）。
    if (_hpAtTickStart) {
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.dead) { p.lastDamagedAt = undefined; p.regenMode = "dead"; continue; }
        if (p.hp < _hpAtTickStart[i] - 1e-9) p.lastDamagedAt = this.t;
      }
    }

    if (this.towers.blue_nexus.hp <= 0) { this.over = true; this.winner = "red"; }
    if (this.towers.red_nexus.hp <= 0) { this.over = true; this.winner = "blue"; }
  }
  _dmgGold(side, g) { if (side === "blue") this.bGold += g; else this.rGold += g; }

  snapshot() {
    const gd = this.bGold - this.rGold;
    const tw = (s) => Object.values(this.towers).filter((t) => t.side === s && t.lane !== "nexus" && t.hp <= 0).length;
    const winProb = clamp(0.5 + gd / 14000 + (tw("red") - tw("blue")) * 0.05, 0.05, 0.95);
    const R = this.rules;
    // S29B1：F/D 召喚師技能欄（v3 才出現；HUD 的唯一資料來源）
    //  Milestone J：兩格都改成「這一格實際裝了什麼」。舊碼寫死「第一格 flash、
    //    第二格只認 smite」，其餘一律 reserved ⇒ 賽前配置的技能在 HUD 上永遠是空的。
    //    未呼叫 configureSpells ⇒ 欄位內容與舊碼相同 ⇒ 輸出逐鍵不變。
    const slotOf = (slot) => (slot?.id
      ? {
        id: slot.id, ready: this.t >= slot.readyAt,
        cd: Math.max(0, Math.round((slot.readyAt - this.t) * 10) / 10),
        cdMax: this._spellCd(slot.id), reason: slot.lastReason, uses: slot.uses,
      }
      : { id: null, status: "reserved" });
    const spOf = (p) => [slotOf(p.sp.f), slotOf(p.sp.d)];
    const xpNextOf = (p) => {
      const next = xpToNext(p.mlv);
      return Number.isFinite(next) ? next : 0; // Lv18 已滿等，snapshot 不輸出 Infinity。
    };
    return {
      ts: this.t,
      // S29：mlv/mxp = **本場**英雄等級（1–18，終局丟棄）；lv = 英雄熟練等級（跨場，
      //   來自 Hero Progress loadout）。兩者並存且不同名 ⇒ 消費端不可能混用。
      players: this.players.map((p) => ({ id: p.id, side: p.side, role: p.role, pos: { ...p.pos }, hp: clamp(p.hp / p.maxHp, 0, 1), dead: p.dead, respawn: p.respawn, state: p.state, ...(R.explainableCombatDecisions ? {
        decision: {
          action: p.decisionAction, targetId: p.decisionTargetId,
          score: p.decisionScore, reasons: [...p.decisionReasons],
        },
      } : {}), k: p.k, d: p.d, a: p.a, gold: Math.round(p.gold), dmg: Math.round(p.dmg), heal: Math.round(p.heal), twrDmg: Math.round(p.twrDmg), lv: p.lv, mlv: p.mlv, mxp: Math.round(p.mxp), mxpNext: xpNextOf(p), ...(R.summonerSpells ? { sp: spOf(p) } : {}), ...(R.recallChannel ? { rc: p.recallT > 0 ? Math.round(p.recallT * 10) / 10 : 0 } : {}), ...(R.neutralObjectives ? {
        buffs: [
          ...(this.t < (p.redBuffUntil ?? 0) ? [{ id: "red", remaining: Math.round((p.redBuffUntil - this.t) * 10) / 10 }] : []),
          ...(this.t < (p.blueBuffUntil ?? 0) ? [{ id: "blue", remaining: Math.round((p.blueBuffUntil - this.t) * 10) / 10 }] : []),
          ...(this.fsm3 && this.t < (this.fsm3[p.side].baronBuffUntil ?? 0) ? [{ id: "baron", remaining: Math.round((this.fsm3[p.side].baronBuffUntil - this.t) * 10) / 10 }] : []),
          ...(this._dragonStacksV3(p.side) > 0 ? [{
            id: "dragon", stacks: this._dragonStacksV3(p.side), remaining: null,
          }] : []),
        ],
        statusEffects: [
          ...(this.t < (p.redSlowUntil ?? 0)
            ? [{ id: "slow", remaining: Math.round((p.redSlowUntil - this.t) * 10) / 10 }] : []),
          //  Milestone J：召喚師技能造成的狀態。未啟用 ⇒ 全為初值 ⇒ 陣列與舊碼相同。
          ...(this.spellsOn && this.t < (p.igniteUntil ?? 0)
            ? [{ id: "ignite", remaining: Math.round((p.igniteUntil - this.t) * 10) / 10 }] : []),
          ...(this.spellsOn && this.t < (p.hasteUntil ?? 0)
            ? [{ id: "haste", remaining: Math.round((p.hasteUntil - this.t) * 10) / 10 }] : []),
          ...(this.spellsOn && p.shield > 0 && this.t < (p.shieldUntil ?? 0)
            ? [{ id: "shield", remaining: Math.round((p.shieldUntil - this.t) * 10) / 10,
              amount: Math.round(p.shield) }] : []),
        ],
      } : {}) })),
      towers: Object.fromEntries(Object.entries(this.towers).map(([k, t]) => [k, { side: t.side, lane: t.lane, tier: t.tier, pos: t.pos, hp: clamp(t.hp / (t.maxHp ?? (t.lane === "nexus" ? NEXUS_HP : TOWER_HP)), 0, 1) }])),
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
      // Milestone H：英雄定位層中繼資料（同樣只在啟用時出現 ⇒ 舊快照形狀不變）
      ...(this.heroesOn ? { heroMeta: this.heroMeta ? { ...this.heroMeta } : null } : {}),
      // S29B1（v3 才出現 → 舊快照形狀不變）：中立目標 / 召喚師技能事件
      ...(R.neutralObjectives ? {
        teamBuffs: Object.fromEntries(["blue", "red"].map((side) => [side, {
          dragonStacks: this._dragonStacksV3(side),
          dragonPowerK: this._dragonPowerK(side),
          dragonGuardK: this._dragonGuardK(side),
          baronRemaining: this.fsm3
            ? Math.max(0, Math.round(((this.fsm3[side].baronBuffUntil ?? 0) - this.t) * 10) / 10)
            : 0,
        }])),
        objectives: this.neutrals.list.map((o) => ({
          id: o.id, type: o.type, side: o.side, presentationKey: o.presentationKey, pos: { ...o.pos },
          ...(o.homePos ? {
            homePos: { ...o.homePos }, state: o.state, targetId: o.targetId,
            hitAt: Number.isFinite(o.hitAt) ? o.hitAt : null,
            attackAt: Number.isFinite(o.attackAt) ? o.attackAt : null,
          } : {}),
          alive: o.alive, hp: o.alive ? clamp(o.hp / o.maxHp, 0, 1) : 0, maxHp: o.maxHp,
          spawnedOnce: !!o.spawnedOnce,
          deathAt: Number.isFinite(o.deathAt) ? o.deathAt : null,
          respawn: o.alive ? 0 : Math.max(0, Math.round((o.respawnAt - this.t) * 10) / 10),
          killerTeam: o.killerTeam, participants: [...o.participants],
          ...(o.members ? { members: o.members.map((m) => ({
            id: m.id, pos: { ...m.pos }, homePos: { ...m.homePos },
            hp: m.alive ? clamp(m.hp / m.maxHp, 0, 1) : 0, maxHp: m.maxHp,
            alive: !!m.alive, targetId: m.targetId ?? null,
            spawnedOnce: !!m.spawnedOnce,
            deathAt: Number.isFinite(m.deathAt) ? m.deathAt : null,
            respawn: m.alive ? 0 : Math.max(0, Math.round((m.respawnAt - this.t) * 10) / 10),
            killerTeam: m.killerTeam ?? null,
            hitAt: Number.isFinite(m.hitAt) ? m.hitAt : null,
            attackAt: Number.isFinite(m.attackAt) ? m.attackAt : null,
          })) } : {}),
        })),
      } : {}),
      ...(R.summonerSpells ? { spellEvents: this.spellLog.slice(-8).map((e) => ({ ...e })) } : {}),
      // S29B3：回城事件（最近 8 筆；view 的傳送/引導特效 + Timeline 事件來源）
      ...(R.recallChannel ? { recallEvents: this.recallLog.slice(-8).map((e) => ({ ...e })) } : {}),
    };
  }
  _snapLane(ln) {
    // S29B2：小兵 hp（0–1）進 snapshot——受擊/瀕死可視化的真實資料來源
    //   （引擎一直都有 m.hp，只是沒輸出；純觀測欄位，不影響任何模擬行為）。
    //   小兵死亡事件 = 消費端以「id 從陣列消失」推導（小兵只會因 hp≤0 離場）。
    const maxHp = this.rules.minionMaxHp ?? 130;
    const mm = (m) => ({
      //  M1.5：強化兵的最大生命不是 minionMaxHp，用牠自己的 maxHp 正規化，
      //  否則血條在掉到 240 之前都會顯示滿血。普通兵 maxHp === minionMaxHp ⇒ 數值不變。
      id: m.id, t: m.t, hp: clamp(m.hp / (m.maxHp ?? maxHp), 0, 1),
      // H.3：純附加呈現欄位。舊 consumer 只讀 id/t/hp，不受影響。
      wave: m.wave ?? 0, slot: m.slot ?? 0, kind: m.kind ?? "melee",
      // M1.5：該路高地塔已倒 ⇒ 強化兵，給渲染層區分用（引擎不讀）。
      super: m.super === true,
    });
    return { bm: this.lanes[ln].bm.map(mm), rm: this.lanes[ln].rm.map(mm) };
  }
}
