// ============================================================================
//  battle/moba/tacticalComms.js — 規則式戰術溝通播報（Sprint29 §八）
//
//  ⚠ 紅線：
//    · **不接生成式 API**（純規則、純函式、可 Node 驗證、決定性）。
//    · **只由真實事件觸發**——每一則訊息都必須能指回一個引擎/事件層的事實
//      （擊殺、推塔、龍/巴龍、撤退、Gank 窗、分推、入侵、人數差…）。
//      不存在「隨機找句子講」的路徑（S29 §11：不得讓對話使用不存在的事件）。
//    · **有冷卻**：同類訊息 cooldown、全域最小間隔 ⇒ 不洗版。
//    · 純函式 + 顯式狀態（CommsEngine 實例），不碰 Store、不碰 LogicEngine。
//
//  訊息選擇會考慮：說話者定位（role）、個性（personality）、本場戰術（tacticId）、
//  當下地圖狀態（人數差、血量、目標存活）、優先級與冷卻。
//  ⚠ 個性/定位只決定「誰講、講哪一句變體」，**不會**憑空生出事件。
// ============================================================================

import { dist, PITS, ROLE_NAME } from "../../gameData.js";

export const COMMS_VERSION = "TacticalComms.v1";

/** 全域最小間隔（模擬秒）：任兩則播報之間至少隔這麼久 ⇒ 不洗版。 */
export const GLOBAL_COOLDOWN = 6;
/** 每場上限（防呆；正常一場約 40–80 則）。 */
export const MAX_COMMS = 400;

/**
 * 訊息規則表。每條規則：
 *   id        唯一鍵（cooldown 以此為單位）
 *   priority  數字越大越優先（同一 tick 只會播最高優先的一則）
 *   cooldown  同一 id 的冷卻（模擬秒）
 *   lines     句子變體；依 role / personality 挑選（不影響是否觸發）
 * 觸發條件一律在 CommsEngine.update() 內以**真實狀態**判斷。
 */
export const COMMS_RULES = {
  ENEMY_MISSING:   { priority: 55, cooldown: 40 },
  GANK_INCOMING:   { priority: 80, cooldown: 18 },
  COUNTER_GANK:    { priority: 78, cooldown: 25 },
  INVADE:          { priority: 70, cooldown: 40 },
  OBJECTIVE_SOON:  { priority: 60, cooldown: 35 },
  OBJECTIVE_TAKEN: { priority: 90, cooldown: 10 },
  TOWER_PUSH:      { priority: 45, cooldown: 30 },
  TOWER_DOWN:      { priority: 75, cooldown: 10 },
  RETREAT:         { priority: 85, cooldown: 15 },
  SPLIT_PUSH:      { priority: 40, cooldown: 35 },
  TEAMFIGHT:       { priority: 72, cooldown: 20 },
  DEFEND_BEHIND:   { priority: 68, cooldown: 30 },
  KILL_SUCCESS:    { priority: 65, cooldown: 8 },
  TRADE:           { priority: 62, cooldown: 20 },
  //  feature/moba-combat-polish-r2：新增情境（一樣只由真實狀態觸發）
  CAUGHT:          { priority: 88, cooldown: 25 },     // 我方英雄低血、身邊 ≥2 敵、附近沒有隊友
  OBJECTIVE_CONTEST: { priority: 76, cooldown: 30 },   // 龍／巴龍活著、坑邊雙方各 ≥2 人
  SUPPORT_MOVE:    { priority: 50, cooldown: 30 },     // 引擎 state === "支援"
  CHASE:           { priority: 58, cooldown: 22 },     // 引擎 state === "追擊"（≥2 人）
  WAVE_DEFEND:     { priority: 48, cooldown: 35 },     // 引擎 state === "回防"（兵線進塔、回去清）
};

/**
 * 句子庫。{lane} / {obj} 會被實際值替換。個性／位置只挑語氣，不改事實。
 *   default      任何人都會講的
 *   <個性>        aggressive / calm / steady / shotcaller / lonewolf / passionate / grinder / creative / defensive
 *   role:<位置>   top / jungle / mid / adc / sup 特有的說法
 * 挑選：個性句 → 位置句 → 通用句串成一池，依「這個情境第幾次說」＋說話者輪替，不會連續兩次同一句。
 * 句子刻意短（語音頻道的長度），不寫長篇。
 */
const LINES = {
  ENEMY_MISSING: {
    default: ["{lane}不見了，注意視野", "對面{lane}消失，小心", "{lane} miss，各路注意", "{lane}看不到了，別壓太前"],
    shotcaller: ["{lane} miss，全體退到安全位", "報一下，{lane}不在線上", "{lane}消失，所有人往後站"],
    lonewolf: ["{lane}不見，我自己小心"],
    calm: ["{lane}不在，先別動"],
    defensive: ["{lane}不見了，我先回塔下"],
    "role:sup": ["我去插個眼，{lane}不見了", "{lane}沒視野，我去看"],
  },
  GANK_INCOMING: {
    default: ["我去{lane}，準備上", "{lane}可以抓，跟我", "打野往{lane}，配合一下", "{lane}等我三秒"],
    aggressive: ["{lane}給我壓住，我馬上到！", "抓{lane}，別讓他跑"],
    calm: ["{lane}有機會，我慢慢繞"],
    creative: ["我從河道後面繞{lane}，他看不到"],
    passionate: ["{lane}來了來了，一起上！"],
  },
  COUNTER_GANK: {
    default: ["對面打野在我這，反蹲", "有人來抓我，過來包", "反蹲成立，上"],
    "role:jungle": ["他打野在這，我在旁邊，放他進來"],
    "role:sup": ["我在草裡，讓他進來"],
    calm: ["對面打野來了，別慌，等他出手"],
  },
  INVADE: { default: ["進他們野區，一起", "開局入侵，跟上", "壓野區，別落單"], aggressive: ["吃他野怪，走！"], "role:jungle": ["跟我進去，拿他的 Buff"] },
  OBJECTIVE_SOON: {
    default: ["{obj}快出了，集合", "準備{obj}，先清線", "{obj} 30 秒，站好位"],
    shotcaller: ["{obj} 30 秒，先推線再集合", "{obj}快了，大家先回城補一下"],
    "role:sup": ["我先去{obj}附近插眼"],
    "role:jungle": ["{obj}我來打，懲戒留著"],
  },
  OBJECTIVE_CONTEST: {
    default: ["{obj}對面也在，搶！", "{obj}這邊要打起來了", "{obj}別讓他們拿"],
    "role:jungle": ["懲戒準備好了，{obj}交給我", "{obj}我在算血，別搶我懲戒"],
    "role:sup": ["我先把{obj}視野清掉"],
    defensive: ["{obj}搶不到就放，別送"],
    aggressive: ["{obj}直接開，打他們！"],
  },
  OBJECTIVE_TAKEN: { default: ["{obj}拿下！", "{obj}到手，撤", "{obj}收掉，推一波"], passionate: ["{obj}是我們的了！"], "role:jungle": ["懲戒到了，{obj}拿下"] },
  TOWER_PUSH: {
    default: ["{lane}塔可以推，來人", "一起壓{lane}塔", "{lane}進塔，掩護我"],
    "role:adc": ["兵進塔了，我來點塔"],
    "role:top": ["{lane}我來扛塔，你們打"],
    grinder: ["{lane}塔慢慢磨，不急"],
  },
  TOWER_DOWN: { default: ["{lane}塔破！", "拆了{lane}，轉線", "{lane}塔倒，換路"], shotcaller: ["{lane}塔拿了，準備轉線"] },
  RETREAT: {
    default: ["血量不夠，先撤", "撤！打不過", "退回去，重整"],
    steady: ["先退，等下一波"],
    aggressive: ["可惡…先退一下"],
    calm: ["不划算，退"],
    "role:sup": ["我掩護，你們先走"],
  },
  CAUGHT: {
    default: ["被抓了！救我", "我被包了…", "他們好幾個在我這！", "我這邊撐不住了"],
    calm: ["我被抓，別過來送"],
    lonewolf: ["被抓了，我自己想辦法"],
    passionate: ["快來！快來！"],
    "role:adc": ["射手被抓了，誰來幫一下"],
  },
  SPLIT_PUSH: { default: ["我帶{lane}線，你們牽制", "分推{lane}，別讓他們回防", "我單帶，撐住"], lonewolf: ["{lane}交給我一個人"] },
  TEAMFIGHT: {
    default: ["開了！全上", "團戰！集火", "打起來了，跟上"],
    shotcaller: ["集火後排！", "先打射手，其他人別管"],
    "role:top": ["我先進，跟上！"],
    "role:sup": ["我開了，接上！", "保護射手！"],
    "role:adc": ["我在後面輸出，擋住他們"],
    "role:mid": ["技能好了，我丟"],
    calm: ["穩住，一個一個打"],
  },
  SUPPORT_MOVE: {
    default: ["我過去幫忙", "撐住，我到了", "我往這邊支援"],
    "role:sup": ["我來保你", "跟著我，我幫你看"],
    "role:mid": ["中路推完了，我去邊路"],
    "role:jungle": ["我往這邊靠"],
  },
  CHASE: {
    default: ["追！他沒血了", "別放他走", "追到塔前就好"],
    calm: ["追一下就好，別深入"],
    aggressive: ["追到底！"],
    defensive: ["別追太深，回來"],
  },
  WAVE_DEFEND: {
    default: ["兵進塔了，我回去清", "我回家守一下線", "兵線我來處理"],
    grinder: ["我回去吃兵"],
    "role:mid": ["中線我來清"],
  },
  DEFEND_BEHIND: { default: ["我們落後，先守塔", "別衝，守家等機會", "劣勢局，穩住兵線"], passionate: ["還沒完，穩住就有機會"], calm: ["慢慢來，等他們犯錯"] },
  KILL_SUCCESS: { default: ["拿下一個！", "擊殺！", "解決了", "漂亮"], aggressive: ["再來一個！"], calm: ["好，下一步"], "role:sup": ["幫到了！"] },
  TRADE: { default: ["換掉了", "一換一，可以接受", "互相交換"], defensive: ["換得不虧"] },
};

const LANE_ZH = { top: "上路", mid: "中路", bot: "下路" };
const OBJ_ZH = { dragon: "Dragon", baron: "Baron" };   // 可見命名統一 Dragon / Baron；語音句子不帶括號說明
//  敵人消失時用「他的位置」稱呼（打野不在任何一路上），比「最近哪一路」自然
const FOE_ROLE_ZH = { top: "上路", jungle: "打野", mid: "中路", adc: "射手", sup: "輔助" };

/** 一個說話者可用的句子池：個性句 → 位置句 → 通用句（決定性，不擲骰）。 */
export function linePool(ruleId, personality, role) {
  const bank = LINES[ruleId] ?? {};
  const pool = [...((personality && bank[personality]) || []), ...((role && bank["role:" + role]) || []), ...(bank.default || [])];
  return pool.length ? pool : ["…"];
}
const hashStr = (str) => { let h = 7; for (const ch of String(str ?? "")) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h; };
/** 輪替挑句：依「這個情境第幾次說」＋說話者，避開這個情境上一次講過的那句。 */
function pickLine(ruleId, speaker, turn, lastTmpl) {
  const pool = linePool(ruleId, speaker?.personality ?? null, speaker?.role ?? null);
  const base = (turn * 7 + hashStr(speaker?.id)) % pool.length;
  for (let k = 0; k < pool.length; k++) {
    const line = pool[(base + k) % pool.length];
    if (line !== lastTmpl || pool.length === 1) return line;
  }
  return pool[base];
}

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

/**
 * 播報引擎。每個 tick 餵一次 snapshot（＋該幀的新事件），輸出 0 或 1 則訊息。
 * 決定性：同 seed 同一場 ⇒ 同一串播報（無 Math.random）。
 */
export class CommsEngine {
  /**
   * @param {object} opts
   * @param {object} [opts.roster]   { b1: { player, personality, role } }（誰在講話；缺 ⇒ 用 role 名）
   * @param {string} [opts.tacticId] 本場戰術（只影響句子傾向與部分規則權重）
   * @param {string} [opts.side]     我方（只播我方隊伍的通訊）
   */
  constructor({ roster = null, tacticId = null, side = "blue" } = {}) {
    this.roster = roster; this.tacticId = tacticId; this.side = side;
    this.cooldowns = {};        // { ruleId: 下次可用的模擬秒 }
    this.lastAny = -Infinity;   // 全域冷卻
    this.messages = [];         // 已產出的訊息（Replay 直接存這份，不重新生成）
    this.seq = 0;
    this.ruleTurns = {};        // { ruleId: 這個情境說過幾次 }（輪替用）
    this.ruleLast = {};         // { ruleId: 上一次的句子模板 }（避免連續重複）
    this._prev = null;          // 上一幀 snapshot 的精簡狀態（用來偵測「變化」）
  }

  /** 冷卻檢查（純讀）。 */
  _ready(id, t) {
    return t >= this.lastAny + GLOBAL_COOLDOWN && t >= (this.cooldowns[id] ?? -Infinity);
  }

  /** 產生一則訊息（唯一出口；一定帶 ruleId + 觸發事實 evidence）。 */
  _emit(id, t, speaker, vars, evidence) {
    const rule = COMMS_RULES[id];
    const turn = this.ruleTurns[id] ?? 0;
    const tmpl = pickLine(id, speaker, turn, this.ruleLast[id]);
    this.ruleTurns[id] = turn + 1; this.ruleLast[id] = tmpl;
    const text = fill(tmpl, vars);
    const msg = {
      id: `c${this.seq++}`,
      t: Math.round(t * 10) / 10,
      type: "COMMS",             // Timeline 用 type 區分：系統事件 / 擊殺 / 隊伍溝通
      ruleId: id,
      side: this.side,
      speakerId: speaker?.id ?? null,
      speaker: speaker?.name ?? (speaker?.role ? ROLE_NAME[speaker.role] : "隊伍"),
      text,
      priority: rule.priority,
      evidence,                  // ⭐ 觸發這則訊息的真實事實（可回溯，不可能是編造的）
    };
    this.cooldowns[id] = t + rule.cooldown;
    this.lastAny = t;
    if (this.messages.length < MAX_COMMS) this.messages.push(msg);
    return msg;
  }

  /** 取得說話者（roster 有名字/個性就用，否則退回引擎 player）。 */
  _who(snapPlayer) {
    if (!snapPlayer) return null;
    const r = this.roster?.[snapPlayer.id] ?? null;
    return {
      id: snapPlayer.id,
      role: snapPlayer.role,
      name: r?.player ?? null,
      personality: r?.personality ?? null,
    };
  }

  /**
   * 每幀呼叫。回傳本幀新增的訊息（0 或 1 則）。
   * @param {object} snap    LogicEngine snapshot
   * @param {Array}  events  本幀新事件（battleEvents 產出；已是「真實事件」）
   */
  update(snap, events = []) {
    const t = snap.ts;
    const mine = snap.players.filter((p) => p.side === this.side);
    const foes = snap.players.filter((p) => p.side !== this.side);
    const prev = this._prev;
    const cands = [];   // { id, speaker, vars, evidence }

    const push = (id, speaker, vars, evidence) => {
      if (this._ready(id, t)) cands.push({ id, speaker, vars, evidence });
    };

    // ── 1) 事件驅動（events 來自 BattleEventTracker ＝ 真實引擎事實）────────
    for (const e of events) {
      if (e.type === "TOWER_DESTROYED") {
        const lane = e.data?.lane ?? "mid";
        if (e.side === this.side) push("TOWER_DOWN", this._who(mine[0]), { lane: LANE_ZH[lane] ?? lane }, { event: e.type, lane, t: e.t });
      }
      if (e.type === "DRAGON_SLAIN" && e.side === this.side) {
        push("OBJECTIVE_TAKEN", this._who(mine.find((p) => p.role === "jungle")), { obj: OBJ_ZH.dragon }, { event: e.type, t: e.t });
      }
      if (e.type === "BARON_SLAIN" && e.side === this.side) {
        push("OBJECTIVE_TAKEN", this._who(mine.find((p) => p.role === "jungle")), { obj: OBJ_ZH.baron }, { event: e.type, t: e.t });
      }
    }

    // ── 2) 擊殺 / 換命（snapshot.feed ＝ 引擎真實擊殺紀錄）──────────────────
    const feed = snap.feed ?? [];
    const fresh = feed.filter((f) => !prev || !prev.feedIds.has(f.id));
    const myKills = fresh.filter((f) => f.side === this.side);
    const myDeaths = fresh.filter((f) => f.side !== this.side);
    if (myKills.length && myDeaths.length) {
      push("TRADE", this._who(mine.find((p) => p.id === myKills[0].killer)), {}, { kills: myKills.length, deaths: myDeaths.length, t });
    } else if (myKills.length) {
      push("KILL_SUCCESS", this._who(mine.find((p) => p.id === myKills[0].killer)), {}, { killer: myKills[0].killer, victim: myKills[0].victim, t });
    }

    // ── 3) 撤退（引擎的 state === "撤退" 是真實狀態，不是猜的）──────────────
    const retreating = mine.filter((p) => p.state === "撤退" && !p.dead);
    if (retreating.length >= 2) {
      push("RETREAT", this._who(retreating[0]), {}, { retreatingIds: retreating.map((p) => p.id), t });
    }

    // ── 4) 團戰（引擎的 state === "團戰!"）──────────────────────────────────
    const fighting = mine.filter((p) => p.state === "團戰!" && !p.dead);
    if (fighting.length >= 3) {
      push("TEAMFIGHT", this._who(fighting[0]), {}, { fighters: fighting.length, t });
    }

    // ── 5) 打野狀態（引擎 state：抓人 / 入侵）───────────────────────────────
    const jg = mine.find((p) => p.role === "jungle");
    if (jg && !jg.dead) {
      if (jg.state === "抓人" && (!prev || prev.jgState !== "抓人")) {
        const lane = nearestLane(jg);
        push("GANK_INCOMING", this._who(jg), { lane: LANE_ZH[lane] }, { state: "抓人", lane, t });
      }
      if (jg.state === "入侵" && (!prev || prev.jgState !== "入侵")) {
        push("INVADE", this._who(jg), {}, { state: "入侵", t });
      }
    }
    // 反蹲：敵方打野出現在我方半場且靠近我方英雄
    const efj = foes.find((p) => p.role === "jungle" && !p.dead);
    if (efj) {
      const near = mine.find((p) => !p.dead && dist(p.pos, efj.pos) < 12);
      if (near) push("COUNTER_GANK", this._who(near), {}, { enemyJungle: efj.id, near: near.id, t });
    }

    // ── 6) 敵方消失（真實：敵方英雄不在我方視野半徑內）──────────────────────
    //  polish-r2：原本是「≥2 名敵人不在視野內」的**狀態**判斷 ⇒ MOBA 裡幾乎永遠成立，佔全部播報 37%，
    //  開局 0:00 就在喊。改成**變化**：上一幀看得到、這一幀消失的敵人；開局 90 秒後才報。
    const visible = (p) => mine.some((m) => !m.dead && dist(m.pos, p.pos) < 20);
    const seenNow = new Set(foes.filter((p) => !p.dead && visible(p)).map((p) => p.id));
    const vanished = foes.filter((p) => !p.dead && prev?.seen?.has(p.id) && !seenNow.has(p.id));
    if (vanished.length && t > 90) {
      push("ENEMY_MISSING", this._who(mine.find((p) => p.role === "sup" && !p.dead) ?? mine.find((p) => !p.dead)),
        { lane: FOE_ROLE_ZH[vanished[0].role] ?? LANE_ZH[nearestLane(vanished[0])] ?? "對面" },
        { missingIds: vanished.map((p) => p.id), t });
    }

    // ── 7) 目標即將刷新（引擎 respawn 是真實倒數）──────────────────────────
    for (const k of ["dragon", "baron"]) {
      const o = snap[k];
      if (o && !o.alive && o.respawn > 0 && o.respawn <= 30) {
        push("OBJECTIVE_SOON", this._who(mine.find((p) => p.role === "sup")), { obj: OBJ_ZH[k] }, { obj: k, respawn: Math.round(o.respawn), t });
      }
    }

    // ── 8) 分推（引擎 state === "帶線"）─────────────────────────────────────
    const split = mine.find((p) => p.state === "帶線" && !p.dead);
    if (split) push("SPLIT_PUSH", this._who(split), { lane: LANE_ZH[split.role === "top" ? "top" : "bot"] ?? "邊路" }, { state: "帶線", id: split.id, t });

    // ── 9) 推塔（引擎 state === "圍攻" 或多人貼塔）──────────────────────────
    const sieging = mine.filter((p) => p.state === "圍攻" && !p.dead);
    if (sieging.length >= 2 && snap.ts > 300) {
      push("TOWER_PUSH", this._who(sieging[0]), { lane: LANE_ZH[nearestLane(sieging[0])] }, { count: sieging.length, t });
    }

    // ── 10) 落後防守（真實：經濟差 + 塔差）─────────────────────────────────
    const myGold = this.side === "blue" ? snap.bGold : snap.rGold;
    const foeGold = this.side === "blue" ? snap.rGold : snap.bGold;
    if (foeGold - myGold > 4000) {
      push("DEFEND_BEHIND", this._who(mine.find((p) => p.role === "sup") ?? mine[0]), {}, { goldGap: Math.round(foeGold - myGold), t });
    }

    // ── 11) 被抓（真實：低血、身邊 10 內 ≥2 名敵人、12 內沒有隊友）──────────
    for (const p of mine) {
      if (p.dead || !(p.hp < 0.35)) continue;
      const foesNear = foes.filter((q) => !q.dead && dist(q.pos, p.pos) < 10).length;
      const matesNear = mine.some((q) => q !== p && !q.dead && dist(q.pos, p.pos) < 12);
      if (foesNear >= 2 && !matesNear) { push("CAUGHT", this._who(p), {}, { id: p.id, hp: Math.round(p.hp * 100) / 100, foesNear, t }); break; }
    }

    // ── 12) 爭奪龍／巴龍（真實：目標活著、坑邊 18 內雙方各 ≥2 人）──────────
    for (const k of ["dragon", "baron"]) {
      const o = snap[k];
      if (!o?.alive || !PITS[k]) continue;
      const nearPit = (arr) => arr.filter((q) => !q.dead && dist(q.pos, PITS[k]) < 18).length;
      const m = nearPit(mine), f = nearPit(foes);
      if (m >= 2 && f >= 2) {
        push("OBJECTIVE_CONTEST", this._who(mine.find((p) => p.role === "jungle" && !p.dead) ?? mine.find((p) => !p.dead)), { obj: OBJ_ZH[k] }, { obj: k, mine: m, foes: f, t });
        break;
      }
    }

    // ── 13) 支援／追擊／回防清線（引擎 state 是真實狀態）─────────────────────
    const helper = mine.find((p) => p.state === "支援" && !p.dead);
    if (helper) push("SUPPORT_MOVE", this._who(helper), {}, { state: "支援", id: helper.id, t });
    const chasing = mine.filter((p) => p.state === "追擊" && !p.dead);
    if (chasing.length >= 2) push("CHASE", this._who(chasing[0]), {}, { state: "追擊", ids: chasing.map((p) => p.id), t });
    const defender = mine.find((p) => p.state === "回防" && !p.dead && snap.ts > 240);
    if (defender) push("WAVE_DEFEND", this._who(defender), {}, { state: "回防", id: defender.id, t });

    // ── 記錄本幀狀態（供下幀比對「變化」）─────────────────────────────────
    this._prev = {
      feedIds: new Set(feed.map((f) => f.id)),
      jgState: jg?.state ?? null,
      seen: seenNow,
    };

    if (!cands.length) return [];
    // 同一 tick 只播**優先級最高**的一則（不洗版；同優先級取先加入者 ⇒ 決定性）
    cands.sort((a, b) => COMMS_RULES[b.id].priority - COMMS_RULES[a.id].priority);
    const c = cands[0];
    return [this._emit(c.id, t, c.speaker, c.vars, c.evidence)];
  }

  /** Replay 用：本場所有播報（已產生的原始訊息；Replay 不重新生成）。 */
  getMessages() { return this.messages; }
}

/** 依世界座標判斷最接近哪一路（純幾何，不猜測）。 */
function nearestLane(p) {
  const d = {
    top: Math.min(dist(p.pos, { x: 20, y: 30 }), dist(p.pos, { x: 50, y: 12 })),
    mid: dist(p.pos, { x: 50, y: 50 }),
    bot: Math.min(dist(p.pos, { x: 50, y: 88 }), dist(p.pos, { x: 82, y: 60 })),
  };
  return Object.entries(d).sort((a, b) => a[1] - b[1])[0][0];
}
