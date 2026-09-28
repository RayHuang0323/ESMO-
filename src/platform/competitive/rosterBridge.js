// ============================================================================
//  platform/competitive/rosterBridge.js — 生涯 roster → CompetitiveEntry.v1
//
//  ── 這一條橋只有一個方向 ────────────────────────────────────────────────
//    生涯存檔 ──(權威層依 playerId 自己查值)──▶ SquadSnapshot.v1 ──▶ CompetitiveEntry.v1
//    生涯存檔 ◀──────────────── ✗ 沒有任何回寫 ──────────────────────
//
//  ⚠ **不自己取值**：直接走 Player Challenge 已經在用的權威層
//    `publishDefensiveSnapshot(intent: "entry")` ——同一支取值函式、同一套 Online 正規化、
//    同一種雜湊。自己另寫一套就是第二個真相來源（Challenge 與競技排位會對同一支隊伍
//    算出不同的值，而且沒有人會發現）。
//  ⚠ `entry` 用途**不吃防守節流**：這一場的陣容在進場時凍結（I10）。
//
//  ── 兩個雜湊，兩個用途 ────────────────────────────────────────────────────
//    · `snapshotHash`：整份快照（含簽發時刻、生涯日）⇒ **查帳**用，能回答「是哪一份」。
//    · `powerHash`：只含**會影響模擬的輸入**（能力、英雄熟練、戰術、選角方針、正規化）
//       ⇒ **公平**用。I4：線上戰力的輸入不含 `meta.days` / careerYear / 即時體力 ——
//       所以生涯快轉 400 天、陣容沒變，`powerHash` 逐字元相同。
//
//  ── MOBA 與 CS ─────────────────────────────────────────────────────────────
//  MOBA：Player Challenge 的權威層（`publishDefensiveSnapshot`）。
//  CS（Online Foundation v1 起）：`online/csSquadSnapshot.js`，一樣只走正式開局的取值函式
//  （`toFpsRoster`），同一套信封、正規化、雜湊與簽章。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store。
// ============================================================================
import { publishDefensiveSnapshot, SNAPSHOT_INTENT, SNAPSHOT_AUTHORITY } from "../challenge/snapshotAuthority.js";
import { stableHash } from "../contracts/squadSnapshot.js";
//  Online Backend Foundation v1：CS 線上快照（csSquadSnapshot）**延後**。
//  理由：① CS 沒有登記的模擬版本（TD-58）⇒ 快照無法做版本一致的驗證；
//        ② main 的 `toFpsRoster` 已套用 csStatDamp 疲勞 ⇒ 舊快照會把當下體力帶進線上數值，違反 ONLINE_NORMALIZATION。
//  在這兩件事修好之前，CS 的競技出賽單**一律拒絕**，不做任何替代推導。
export const CS_ENTRY_DEFERRED = Object.freeze({ code: "cs_snapshot_deferred", message: "CS 線上快照尚未開放（需先登記 CS 模擬版本，TD-58）" });

export const COMPETITIVE_ENTRY_VERSION = "CompetitiveEntry.v1";
export const BRIDGE_MODES = Object.freeze(["moba", "cs"]);

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

/**
 * 快照 → **影響模擬的輸入**。這就是未來 Cap 定價與模擬**共同**要吃的那一份（I13）。
 * ⚠ 刻意排除：`careerDay`、`issuedAt`、`issuedBy`、隊名、`hash`。
 */
export function powerInputsOf(snapshot) {
  return {
    mode: snapshot.mode,
    simulationVersion: snapshot.simulationVersion,
    capturedInputs: [...(snapshot.capturedInputs ?? [])],
    seats: (snapshot.seats ?? []).map((s) => ({ seat: s.seat, playerId: s.playerId, role: s.role })),
    stats: JSON.parse(JSON.stringify(snapshot.combat?.stats ?? {})),
    loadout: JSON.parse(JSON.stringify(snapshot.combat?.loadout ?? null)),
    //  CS 引擎另外讀定位與個性（MOBA 沒有這兩格 ⇒ null）。
    roles: JSON.parse(JSON.stringify(snapshot.combat?.roles ?? null)),
    personality: JSON.parse(JSON.stringify(snapshot.combat?.personality ?? null)),
    standingOrders: JSON.parse(JSON.stringify(snapshot.standingOrders ?? {})),
    normalization: { ...(snapshot.normalization ?? {}) },
  };
}

/**
 * 由生涯狀態建出一份競技排位出賽單。
 *
 * @param {object} p
 * @param {object} p.request      **客戶端送的**：{ teamId, tacticId, seats?, draftPolicy? } —— 不得帶任何數值
 * @param {object} p.careerState  **權威層讀的**：{ players, lineup, heroProgress, heroAssign, team, careerDay }
 * @param {number} p.now          呼叫端注入的時刻（本層不讀時鐘）
 * @param {"moba"|"cs"} p.mode
 */
export function buildCompetitiveEntry({ request = null, careerState = {}, now = null, mode = "moba" } = {}) {
  if (!BRIDGE_MODES.includes(mode)) {
    return { ok: false, entry: null, errors: [{ code: "mode", message: `未知的模式：${mode}` }] };
  }
  if (mode === "cs") return { ok: false, entry: null, errors: [{ ...CS_ENTRY_DEFERRED }] };
  const pub = publishDefensiveSnapshot({ request, careerState, now, intent: SNAPSHOT_INTENT.entry });
  if (!pub.ok) return { ok: false, entry: null, errors: pub.errors };

  const snapshot = pub.snapshot;
  const powerInputs = powerInputsOf(snapshot);
  const powerHash = stableHash(powerInputs);
  const entry = {
    schema: COMPETITIVE_ENTRY_VERSION,
    mode,
    teamId: snapshot.team.teamId,
    snapshot,
    powerInputs,
    powerHash,
    //  Online Power Contract v1 §5（依 §11 更正後的形狀）：
    //  guardrail 未作用時 effective 逐值等於 raw ⇒ 「這個 88 是不是原值」可以直接讀出來。
    provenance: {
      source: "career",
      snapshotVersion: snapshot.schema,
      snapshotHash: snapshot.hash,
      powerHash,
      normalized: Object.keys(snapshot.normalization ?? {}),
      guardrail: { applied: false, policy: "none", version: "v1" },
      issuedBy: snapshot.issuedBy,
      trusted: SNAPSHOT_AUTHORITY.trusted,
    },
  };
  return { ok: true, entry: deepFreeze(entry), errors: [] };
}
