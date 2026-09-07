// ============================================================================
//  platform/contracts/squadSnapshot.js — SquadSnapshot.v1（Player Challenge Slice 1）
//
//  ── 這份契約是什麼 ────────────────────────────────────────────────────────
//  **權威層簽發的凍結裁決資料**。Player Challenge 是非同步的：真正打起來的時候，
//  對手已經離線，沒有人可以去查他的隊伍。所以這份東西**必須帶值**。
//
//  ⚠ 它與 `MatchEntryRequest.v1` **方向相反，而且兩者都對**：
//
//    |            | MatchEntryRequest.v1   | SquadSnapshot.v1（本檔）      |
//    |------------|------------------------|-------------------------------|
//    | 是什麼     | 客戶端 → 伺服器的請求  | **權威層簽發的產物**          |
//    | 帶不帶值   | 絕對不帶（遞迴掃描擋） | **必須帶**                    |
//    | 誰決定值   | **權威層**             | **權威層**（同一個答案）      |
//    | 何時查值   | 比賽當下查             | **發布時先查好、凍結、簽章**  |
//
//    ⇒ 差別**不是「誰能決定數值」**——那一條兩邊完全一樣。
//      差別只在**權威層什麼時候查值**。非同步讓查值時點提前，
//      於是快照必須額外靠雜湊證明「之後沒被動過」。
//    ⇒ **不因為 async 就放寬 client trust boundary。**
//      客戶端能說的只有「用我這五個人、這套戰術」，
//      不能說「他們的數值是這些」（見 `FORBIDDEN_CLIENT_KEYS`）。
//
//  ── 欄位是怎麼決定的：以**實際的 LogicEngine 消費端**為準 ────────────────
//  ⚠ **不照 `teamStrength` / `calcPower` 的欄位猜。** 271b31d 實測過：
//    `calcPower` 看不到英雄熟練，而英雄熟練是勝負的主要決定者
//    （power ×1.25 ⇒ 勝率 94.4%）。照定價欄位列表，**一定會漏掉它**，
//    而漏掉就是重播對不上。
//
//  真正的清單來自 `src/useLocalServer.js` 的 `start()`（唯一的正式開局路徑）：
//
//      new LogicEngine(seed, loadout)      ← ① seed  ② 英雄熟練 loadout
//      eng.configurePlayers(...)           ← ③ 選手能力 × 席位
//      eng.configureHeroes(...)            ← ④ 英雄選角        ⟍
//      eng.configureArchetypes(...)        ← ⑤ 戰鬥原型        ⟩ 都來自 roster（Ban/Pick）
//      eng.configureSpells(...)            ← ⑥ 召喚師技能      ⟋
//      eng.configureMatch(...)             ← ⑦ 戰術 → 行為權重
//
//  Slice 1 涵蓋 ②③⑦（①由 ChallengeInstance 持有），**④⑤⑥ 尚未涵蓋**。
//  ⚠ 這不是偷偷略過：`capturedInputs` 會把涵蓋範圍寫進快照本身，
//    重播驗證器只允許使用被宣告過的輸入。等 Slice 2 補上選角，
//    版本會跟著 bump，舊快照仍然誠實地宣告自己只有 ②③⑦。
//
//  ── 正規化（I13）────────────────────────────────────────────────────────
//  `condition` / `morale` / `energy` 在 `LogicEngine.js` 出現 **0 次**，
//  卻能讓 `calcPower` 擺動 28.7% ⇒ 壓低狀態換到弱分級、打起來卻滿血。
//  ⇒ 發布時就地寫成基準值，**不是**比賽時才正規化。
//
//  純函式：不 import React / zustand / localStorage / profileStore。
// ============================================================================
import { MOBA_SIMULATION_VERSION } from "./simulationVersion.js";

export const SQUAD_SNAPSHOT_VERSION = "SquadSnapshot.v1";

/** 快照涵蓋哪些引擎輸入。**寫進快照本身**，重播只能用被宣告的那些。 */
export const SNAPSHOT_INPUTS = Object.freeze({
  playerStats: "playerStats",   // configurePlayers（選手能力 × 席位）
  heroLoadout: "heroLoadout",   // new LogicEngine(seed, loadout)（英雄熟練）
  tactic: "tactic",             // configureMatch（戰術 → 行為權重）
  lineup: "lineup",             // 席位指派本身
});

/** Slice 1 涵蓋的輸入。⚠ 未涵蓋：heroPick / archetypes / spells（Slice 2）。 */
export const SLICE1_CAPTURED_INPUTS = Object.freeze([
  SNAPSHOT_INPUTS.lineup,
  SNAPSHOT_INPUTS.playerStats,
  SNAPSHOT_INPUTS.heroLoadout,
  SNAPSHOT_INPUTS.tactic,
]);

/** 引擎席位（藍方語彙；紅方由 runner 在組裝時對映）。 */
export const SNAPSHOT_SEATS = Object.freeze(["b1", "b2", "b3", "b4", "b5"]);

/**
 * 正規化基準（I13）。
 *
 * ⚠ 這三個欄位**引擎完全不讀**，所以基準值取什麼都不影響模擬結果——
 *   它們寫進快照的唯一理由是：讓「快照裡的狀態」與「定價會看到的狀態」
 *   永遠是同一個值，未來接上定價時不可能分歧。
 */
export const ONLINE_NORMALIZATION = Object.freeze({
  policy: "online-normalize.v1",
  condition: "正常",
  morale: 70,
  energy: 100,
});

/**
 * **客戶端不得提交**的欄位名。發布請求會被遞迴掃描。
 *
 * ⚠ 與 `matchEntry.js` 的 `FORBIDDEN_VALUE_KEYS` 是**兩份不同的清單**，
 *   不要合併：那一份守的是「出賽申請單不得帶值」，這一份守的是
 *   「**發布請求**不得帶值」。兩者的請求形狀不同，合併之後會有一邊擋不住。
 */
export const FORBIDDEN_CLIENT_KEYS = Object.freeze([
  "stats", "combat", "loadout", "powerMult", "toughMult", "mastery",
  "normalized", "normalization", "effectivePower", "power", "tough",
  "rating", "modifiers", "mods", "hash", "issuedBy",
]);

/** FNV-1a → 8 位十六進位。與 `matchEntry.js` / `matchOrigin.js` 同一套手法。 */
export function stableHash(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * 快照雜湊：**涵蓋所有影響模擬的欄位**（Season vNext I12）。
 *
 * ⚠ 做法刻意是「**排除法**」而不是「列舉法」：把 `hash` 自己拿掉，
 *   其餘整份序列化。列舉法會在有人新增欄位卻忘了加進雜湊清單時默默失效，
 *   而那正是 I12 要擋的事。
 * ⚠ 序列化前把鍵**排序**，否則同一份內容因為插入順序不同會得到不同雜湊。
 * ⚠ 這是**變更偵測**用的雜湊，**不是**密碼學簽章。目前沒有真伺服器，
 *   它擋得住意外改動，擋不住蓄意偽造——見 `snapshotAuthority.js` 檔頭。
 */
export function snapshotHashOf(snapshot) {
  const { hash: _drop, ...rest } = snapshot ?? {};
  return stableHash(stableStringify(rest));
}

/** 決定性序列化：物件鍵一律排序（陣列順序保留，因為席位順序有意義）。 */
export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
}

/**
 * 組出一份快照。
 *
 * ⚠ **本函式只接受已經查好的值**，它自己不去讀 Store——取值是權威層的責任
 *   （`platform/challenge/snapshotAuthority.js`）。契約層負責形狀與雜湊，
 *   權威層負責來源與信任。兩件事分開，才可能在接真伺服器時只換掉後者。
 *
 * @param {object}   p
 * @param {object}   p.team          { teamId, teamName, tag }
 * @param {number}   p.careerDay     發布時的生涯日（節流與顯示用）
 * @param {Array}    p.seats         [{ seat, playerId, role, seatRole, tier }]
 * @param {object}   p.stats         { [seat]: {16 項能力} }
 * @param {object}   p.loadout       { [seat]: { level, toughMult, powerMult } }
 * @param {object}   p.standingOrders{ tacticId }
 * @param {string}   p.issuedBy      簽發者標記（權威層給）
 * @param {number}   p.issuedAt      簽發時刻（權威層給；契約層不讀時鐘）
 * @param {string}   [p.simulationVersion]
 * @returns {{ ok:boolean, snapshot:object|null, errors:Array }}
 */
export function createSquadSnapshot({
  team = {}, careerDay = 0, seats = [], stats = {}, loadout = {},
  standingOrders = {}, issuedBy = null, issuedAt = null,
  simulationVersion = MOBA_SIMULATION_VERSION,
} = {}) {
  const errors = [];
  if (!team?.teamId) errors.push({ code: "team", message: "快照必須有 teamId" });
  if (!issuedBy) errors.push({ code: "authority", message: "快照必須帶簽發者（不得由客戶端自建）" });
  if (!Number.isFinite(issuedAt)) errors.push({ code: "issued_at", message: "快照必須帶簽發時刻" });
  if (!standingOrders?.tacticId) errors.push({ code: "tactic", message: "快照必須有預存戰術" });

  const bySeat = new Map((seats ?? []).filter((s) => s?.seat).map((s) => [s.seat, s]));
  for (const seat of SNAPSHOT_SEATS) {
    if (!bySeat.has(seat)) { errors.push({ code: "seat", message: `席位 ${seat} 沒有選手` }); continue; }
    if (!stats?.[seat]) errors.push({ code: "stats", message: `席位 ${seat} 缺少能力值` });
    if (!loadout?.[seat]) errors.push({ code: "loadout", message: `席位 ${seat} 缺少英雄熟練` });
  }
  if (errors.length) return { ok: false, snapshot: null, errors };

  const ordered = SNAPSHOT_SEATS.map((seat) => {
    const s = bySeat.get(seat);
    return {
      seat,
      playerId: String(s.playerId),
      role: s.role ?? null,
      seatRole: s.seatRole ?? null,
      tier: s.tier ?? null,
    };
  });

  const body = {
    schema: SQUAD_SNAPSHOT_VERSION,
    simulationVersion,
    capturedInputs: [...SLICE1_CAPTURED_INPUTS],
    mode: "moba",
    team: { teamId: String(team.teamId), teamName: team.teamName ?? null, tag: team.tag ?? null },
    careerDay: Math.max(0, Math.floor(Number(careerDay) || 0)),
    issuedBy,
    issuedAt,
    seats: ordered,
    combat: {
      //  ⚠ 只留席位 → 值。**不存 `players[]` 的參照**（I11：存值不存參照）。
      stats: Object.fromEntries(SNAPSHOT_SEATS.map((s) => [s, { ...stats[s] }])),
      loadout: Object.fromEntries(SNAPSHOT_SEATS.map((s) => [s, {
        level: Number(loadout[s].level) || 1,
        powerMult: Number(loadout[s].powerMult) || 1,
        toughMult: Number(loadout[s].toughMult) || 1,
      }])),
    },
    standingOrders: { tacticId: String(standingOrders.tacticId) },
    normalization: { ...ONLINE_NORMALIZATION },
  };

  return { ok: true, errors: [], snapshot: { ...body, hash: snapshotHashOf(body) } };
}

/**
 * 驗證一份快照：形狀、簽發者、雜湊、涵蓋範圍。
 *
 * ⚠ 雜湊不符 ⇒ **一律拒絕**，不修補、不重算後放行。
 *   「重算一次就對了」等於把 I12 關掉。
 */
export function validateSquadSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, errors: [{ code: "invalid", message: "快照不是物件" }] };
  }
  if (snapshot.schema !== SQUAD_SNAPSHOT_VERSION) {
    errors.push({ code: "schema", message: `schema 必須為 ${SQUAD_SNAPSHOT_VERSION}` });
  }
  if (!snapshot.issuedBy) errors.push({ code: "authority", message: "快照沒有簽發者" });
  if (!Array.isArray(snapshot.capturedInputs) || snapshot.capturedInputs.length === 0) {
    errors.push({ code: "captured_inputs", message: "快照必須宣告涵蓋哪些引擎輸入" });
  }
  const seats = Array.isArray(snapshot.seats) ? snapshot.seats : [];
  if (seats.length !== SNAPSHOT_SEATS.length) {
    errors.push({ code: "seats", message: `席位必須有 ${SNAPSHOT_SEATS.length} 個，收到 ${seats.length}` });
  }
  for (const seat of SNAPSHOT_SEATS) {
    if (!snapshot.combat?.stats?.[seat]) errors.push({ code: "stats", message: `席位 ${seat} 缺少能力值` });
    if (!snapshot.combat?.loadout?.[seat]) errors.push({ code: "loadout", message: `席位 ${seat} 缺少英雄熟練` });
  }
  if (!snapshot.standingOrders?.tacticId) errors.push({ code: "tactic", message: "快照缺少預存戰術" });
  if (errors.length) return { ok: false, errors };

  const expect = snapshotHashOf(snapshot);
  if (snapshot.hash !== expect) {
    errors.push({ code: "hash", message: `快照雜湊不符（記錄 ${snapshot.hash}，重算 ${expect}）——內容被改過` });
  }
  return { ok: errors.length === 0, errors };
}

/** 遞迴找出發布請求裡不該出現的欄位名（客戶端不得提交數值）。 */
export function findForbiddenClientKeys(node, found = [], depth = 0) {
  if (depth > 6 || !node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const x of node) findForbiddenClientKeys(x, found, depth + 1);
    return found;
  }
  for (const k of Object.keys(node)) {
    if (FORBIDDEN_CLIENT_KEYS.includes(k)) found.push(k);
    findForbiddenClientKeys(node[k], found, depth + 1);
  }
  return found;
}

/** 快照有沒有涵蓋這個引擎輸入。重播組裝時用它決定「可不可以呼叫這個 configure」。 */
export const snapshotCovers = (snapshot, input) =>
  Array.isArray(snapshot?.capturedInputs) && snapshot.capturedInputs.includes(input);
