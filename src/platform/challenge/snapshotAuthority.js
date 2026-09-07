// ============================================================================
//  platform/challenge/snapshotAuthority.js — 快照發布的權威層（Player Challenge Slice 1）
//
//  ── ⚠ 這不是防作弊伺服器 ─────────────────────────────────────────────────
//  **目前沒有真正的後端。** 本檔是一個 server-ready 的**邊界**：它把
//  「誰有權決定數值」這件事集中到一個地方，讓日後換成真伺服器時
//  只要換掉這一層，契約與消費端都不用動。
//
//  它現在**擋得住**：客戶端夾帶數值、發布請求繞過取值、快照被意外改動。
//  它現在**擋不住**：蓄意偽造。雜湊是 FNV-1a（變更偵測），不是密碼學簽章；
//  整個流程跑在玩家自己的瀏覽器裡。
//  ⇒ 任何文件與 UI **不得**宣稱目前已有防作弊能力。
//    （這與 `mockGateway.js` 檔頭「**不是後端**」是同一條誠實規則。）
//
//  ── 責任鏈（順序不可交換）───────────────────────────────────────────────
//    玩家請求發布（只送**身分與選擇**：teamId / 席位指派 / 戰術 id）
//       ▼
//    ① 擋下夾帶的數值（遞迴掃描 `FORBIDDEN_CLIENT_KEYS`）
//       ▼
//    ② 節流：每個生涯日最多一份
//       ▼
//    ③ 讀**正式 Career state**，依 playerId **自己查值**
//         · 選手能力 ← `buildPlayerStatSlots`（＝正式開局用的同一支）
//         · 英雄熟練 ← `buildLoadout`（＝正式開局用的同一支）
//       ▼
//    ④ 套 Online 正規化（I13：condition / morale / energy 寫基準值）
//       ▼
//    ⑤ 建立 SquadSnapshot.v1 → hash → 標記簽發者 → 交給呼叫端儲存
//
//  ⚠ ③ 刻意用**正式開局路徑用的同兩支函式**。自己另寫一套取值，
//    就是第二個真相來源，而它與模擬的分歧不會有任何人發現——
//    直到某天重播對不上為止。
//
//  ── 為什麼 `heroAssign` 是注入的 ─────────────────────────────────────────
//  `data/roster.js` 會連帶 import `heroDatabase.js`（396KB 的 data URI），
//  而 Node verifier 會 import 本檔。沿用 `buildBattleRoster` 的 `heroLookup`
//  既有慣例：**由呼叫端注入**，本檔不 import 重資產。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
//  ⚠ 時刻由呼叫端注入（`now`）⇒ 本層完全決定性，verifier 可逐值重跑。
// ============================================================================
import {
  createSquadSnapshot, findForbiddenClientKeys, ONLINE_NORMALIZATION, SNAPSHOT_SEATS,
} from "../contracts/squadSnapshot.js";
import { MOBA_SIMULATION_VERSION } from "../contracts/simulationVersion.js";
import { buildPlayerStatSlots } from "../../battle/moba/mobaRosterAdapter.js";
import { buildLoadout } from "../../hero/heroProgress.js";
import { tierOf } from "../contracts/matchSquad.js";

/** 簽發者標記。⚠ `kind` 明說目前是本機模擬，讓消費端無法誤以為有真伺服器。 */
export const SNAPSHOT_AUTHORITY = Object.freeze({
  id: "esmo.local-authority.v1",
  kind: "mock-authority",
  trusted: false,          // ⚠ 目前不可信。接上真伺服器之前一律 false。
});

/** 發布理由。`auto` 跟著存檔時機，`manual` 是玩家按「更新我的防守陣容」。 */
export const PUBLISH_REASONS = Object.freeze({ auto: "auto", manual: "manual" });

/**
 * 快照的用途。**兩者的節流規則不同，所以必須分開。**
 *
 * · `defense` **對外掛著的防守陣容**。別人挑戰你時遇到的就是它。
 *   每個生涯日最多一份 —— 否則玩家能高速輪換，看板上同一支隊伍會出現十幾個版本。
 * · `entry`   **這一場的出賽陣容**（Slice 3）。你去挑戰別人時用的是**當下**的隊伍，
 *   在建立 challenge 的當下凍結（＝ Season vNext 的 I10「報名／進場時產生」）。
 *   ⚠ **不吃節流**：它不是掛在外面給別人打的東西，換先發、練熟練之後
 *     下一場就該生效——那正是「賽前決策有意義」的前提。
 *   ⚠ 也**不寫入** `challenge.defense`：出賽用的快照不會改變你的防守陣容。
 *
 * ⚠ 兩者用**同一支**產生函式、同一套正規化、同一種雜湊 ⇒ 不可能分歧。
 *   差別只在「要不要節流」與「要不要存成防守陣容」，由呼叫端決定。
 */
export const SNAPSHOT_INTENT = Object.freeze({ defense: "defense", entry: "entry" });

/**
 * 節流：**每個生涯日最多一份**。
 *
 * ⚠ 為什麼不是「每次改陣容就發」：那會讓玩家能高速輪換快照，
 *   也會讓看板上同一支隊伍出現十幾個版本。
 * ⚠ `auto` 與 `manual` **共用同一格配額**。分開計會讓手動變成繞過自動節流的後門。
 */
export function publishThrottle({ lastPublishedCareerDay = null, careerDay = 0 } = {}) {
  const day = Math.max(0, Math.floor(Number(careerDay) || 0));
  if (lastPublishedCareerDay === null || lastPublishedCareerDay === undefined) {
    return { allowed: true, reason: null, careerDay: day };
  }
  const last = Math.floor(Number(lastPublishedCareerDay));
  if (day > last) return { allowed: true, reason: null, careerDay: day };
  return {
    allowed: false,
    careerDay: day,
    reason: `今天（第 ${day} 天）已經更新過防守陣容，明天才能再更新`,
  };
}

/**
 * 驗證發布請求：客戶端**只能送身分與選擇**。
 *
 * ⚠ 這一支是 client trust boundary 的入口。它拒絕的不只是「錯的值」，
 *   而是「**任何值**」——因為只要接受一個值，之後就會有人問「那再加一個呢」。
 */
export function validatePublishRequest(request) {
  const errors = [];
  if (!request || typeof request !== "object") {
    return { ok: false, errors: [{ code: "invalid", message: "發布請求不是物件" }] };
  }
  const leaked = findForbiddenClientKeys(request);
  if (leaked.length) {
    errors.push({
      code: "value_leak",
      message: `發布請求不得夾帶數值欄位：${[...new Set(leaked)].join(", ")}（數值一律由權威層自行取得）`,
    });
  }
  if (!request.teamId) errors.push({ code: "team", message: "發布請求缺少 teamId" });
  if (!request.tacticId) errors.push({ code: "tactic", message: "發布請求缺少戰術選擇" });
  if (request.reason && !(request.reason in PUBLISH_REASONS)) {
    errors.push({ code: "reason", message: `未知的發布理由 ${request.reason}` });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 發布一份防守快照。
 *
 * @param {object} p
 * @param {object} p.request      **客戶端送的**：{ teamId, tacticId, seats?, reason? }
 * @param {object} p.careerState  **權威層讀的**：
 *   { players, lineup, heroProgress, heroAssign, team, careerDay, lastPublishedCareerDay }
 * @param {number} p.now          呼叫端注入的時刻（本層不讀時鐘）
 * @returns {{ ok:boolean, snapshot:object|null, errors:Array, throttled:boolean }}
 */
export function publishDefensiveSnapshot({
  request = null, careerState = {}, now = null, intent = SNAPSHOT_INTENT.defense,
} = {}) {
  //  ── ① 客戶端信任邊界 ──────────────────────────────────────────────────
  const rv = validatePublishRequest(request);
  if (!rv.ok) return { ok: false, snapshot: null, errors: rv.errors, throttled: false };
  if (!Number.isFinite(now)) {
    return { ok: false, snapshot: null, throttled: false, errors: [{ code: "now", message: "缺少發布時刻" }] };
  }
  if (!(intent in SNAPSHOT_INTENT)) {
    return { ok: false, snapshot: null, throttled: false, errors: [{ code: "intent", message: `未知的快照用途 ${intent}` }] };
  }

  //  ── ② 節流 ────────────────────────────────────────────────────────────
  //  ⚠ 只有**防守快照**吃節流。出賽快照（`entry`）是「這一場的陣容」，
  //    在建立 challenge 當下凍結；擋它等於讓玩家換了先發也不能出賽。
  const th = intent === SNAPSHOT_INTENT.defense
    ? publishThrottle({
      lastPublishedCareerDay: careerState.lastPublishedCareerDay,
      careerDay: careerState.careerDay,
    })
    : { allowed: true, reason: null, careerDay: Math.max(0, Math.floor(Number(careerState.careerDay) || 0)) };
  if (!th.allowed) {
    return { ok: false, snapshot: null, throttled: true, errors: [{ code: "throttled", message: th.reason }] };
  }

  //  ── ③ 讀正式 Career state，自己查值 ───────────────────────────────────
  //  ⚠ `request.seats` 只是**選擇**：權威層仍用自己的 `players` 重新解析席位，
  //    客戶端指到不存在的人 ⇒ 這裡就查不到 ⇒ 下面的完整性檢查會擋下來。
  const players = Array.isArray(careerState.players) ? careerState.players : [];
  const lineup = request.seats ?? careerState.lineup ?? null;
  const slots = buildPlayerStatSlots(players, "blue", lineup);
  if (slots.length !== SNAPSHOT_SEATS.length) {
    return {
      ok: false, snapshot: null, throttled: false,
      errors: [{ code: "lineup", message: `先發不完整：只解析出 ${slots.length}/${SNAPSHOT_SEATS.length} 個席位` }],
    };
  }

  //  英雄熟練：與正式開局同一支（`useLocalServer.start()` 用的就是它）。
  const heroLoadout = buildLoadout(careerState.heroProgress ?? {}, careerState.heroAssign ?? {});

  const byId = new Map(players.filter((p) => p?.id).map((p) => [p.id, p]));
  const seats = [];
  const stats = {};
  const loadout = {};
  for (const slot of slots) {
    const me = byId.get(slot.playerId);
    seats.push({
      seat: slot.id,
      playerId: slot.playerId,
      role: me?.role ?? null,
      seatRole: null,
      tier: me ? tierOf(me) : null,
    });
    //  ── ④ 正規化（I13）─────────────────────────────────────────────────
    //  ⚠ 就地做，**不是**比賽時才做。比賽時做，定價與模擬就有機會拿到
    //    不同的輸入——那正是 I13 要擋的分歧。
    stats[slot.id] = normalizeCombatStats(slot.stats);
    const lo = heroLoadout[slot.id];
    if (!lo) {
      return {
        ok: false, snapshot: null, throttled: false,
        errors: [{ code: "loadout", message: `席位 ${slot.id} 查不到英雄熟練（heroAssign 未涵蓋）` }],
      };
    }
    loadout[slot.id] = lo;
  }

  //  ── ⑤ 建立、雜湊、標記簽發者 ──────────────────────────────────────────
  const built = createSquadSnapshot({
    team: careerState.team ?? { teamId: request.teamId },
    careerDay: th.careerDay,
    seats, stats, loadout,
    standingOrders: { tacticId: request.tacticId },
    issuedBy: SNAPSHOT_AUTHORITY.id,
    issuedAt: now,
    simulationVersion: MOBA_SIMULATION_VERSION,
  });
  if (!built.ok) return { ok: false, snapshot: null, throttled: false, errors: built.errors };
  return { ok: true, snapshot: built.snapshot, errors: [], throttled: false };
}

/**
 * Online 正規化：**白名單**只留 16 項能力，其餘一律不進快照。
 *
 * ⚠ 為什麼是白名單而不是「把 condition/morale/energy 改成基準值」：
 *   引擎讀的是 `STAT_MAP` 加權過的那 16 項（見 `mobaPlayerStats.js`），
 *   狀態三欄**根本不在裡面**。把它們寫成基準值放進快照，等於在
 *   「影響模擬的資料」旁邊放三個不影響模擬的欄位——而它們會進雜湊，
 *   於是「狀態變了 ⇒ 快照雜湊變了 ⇒ 看起來像換了一支隊伍」。
 *   ⇒ 直接**不收**。基準值宣告在 `snapshot.normalization`（一份，隊伍層級），
 *     未來接定價時讀那一份，兩邊仍然同源（I13），但不污染每位選手的資料。
 *
 * ⚠ 能力值本身**不做任何加權或縮放**：那會變成第二套戰力公式。
 * ⚠ 白名單也順帶擋住「有人把 `power` / `rating` 塞進 stats」。
 */
export const COMBAT_STAT_KEYS = Object.freeze([
  "reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ",
  "decision", "adaptability", "courage", "clutch", "focus", "resilience",
  "comms", "leadership", "synergy", "learning",
]);

export function normalizeCombatStats(rawStats) {
  const out = {};
  for (const k of COMBAT_STAT_KEYS) {
    const n = Number(rawStats?.[k]);
    out[k] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

/** 這份快照宣告的正規化基準（隊伍層級一份，不逐選手複製）。 */
export const normalizationOf = () => ({ ...ONLINE_NORMALIZATION });
