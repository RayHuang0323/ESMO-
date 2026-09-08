// ============================================================================
//  platform/challenge/opponentProvider.js — 對手來源邊界（Slice 4）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  目標很小：**讓挑戰看板不知道這筆對手是 fixture 還是真玩家。**
//  日後把 fixture provider 換成 server snapshot provider 時，
//  看板與挑戰流程一行都不用改。
//
//  ⚠ 刻意**不做**過度抽象：沒有 registry、沒有 plugin、沒有 DI 容器。
//    就是一個「回傳 `OpponentEntry` 陣列」的函式，加一個形狀契約。
//
//  ── `OpponentEntry` 是什麼 ───────────────────────────────────────────────
//  **一份權威層簽發的 `SquadSnapshot.v1` ＋ 一個穩定的身分鍵**，其餘全無。
//
//  ⚠ 這是本輪最重要的一條：看板需要的每一項資訊——俱樂部身分、先發、
//    英雄熟練、流派、戰術、發布時間、選角傾向——**都必須從快照本身讀得出來**。
//    Slice 3 的看板還在讀 fixture 定義上的 `traits` / `doctrineHint` /
//    `recentLineupChange` / `note`，那些欄位在真玩家快照上**不存在**
//    ⇒ 換 provider 的那天看板會直接空掉。本輪把它們全部改成從快照推導。
//
//  ⇒ provider 的合約因此只有一句：**給我快照，不要給我形容詞。**
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { validateSquadSnapshot } from "../contracts/squadSnapshot.js";

export const OPPONENT_PROVIDER_VERSION = "OpponentProvider.v1";

/** 對手來源種類。⚠ UI 必須照實顯示——不得把 fixture 講成真玩家。 */
export const OPPONENT_SOURCE = Object.freeze({
  /** 決定性的練習對手（目前唯一有實作的）。 */
  fixture: "fixture",
  /** 伺服器簽發的其他玩家快照（尚未實作）。 */
  server: "server",
});

/**
 * 一筆對手。**只有身分鍵與快照。**
 *
 * ⚠ 不得再加「難度」「強度」「推薦度」之類的欄位——那些是我們證明不了的東西
 *   （271b31d）。看板的分類一律由**觀測紀錄**與**快照事實**推導。
 */
export function opponentEntry({ key, snapshot, source = OPPONENT_SOURCE.fixture }) {
  return { key: String(key), source, snapshot };
}

/** 驗證一筆對手：快照必須通過完整驗證（含雜湊重算）。 */
export function validateOpponentEntry(e) {
  const errors = [];
  if (!e || typeof e !== "object") return { ok: false, errors: [{ code: "invalid", message: "對手項目不是物件" }] };
  if (!e.key) errors.push({ code: "key", message: "缺少身分鍵" });
  if (!(e.source in OPPONENT_SOURCE)) errors.push({ code: "source", message: `未知的對手來源 ${e.source}` });
  const v = validateSquadSnapshot(e.snapshot);
  if (!v.ok) errors.push(...v.errors.map((x) => ({ ...x, code: `snapshot_${x.code}` })));
  return { ok: errors.length === 0, errors };
}

/**
 * 建立一個 provider。
 *
 * @param {object} p
 * @param {string}   p.source  `OPPONENT_SOURCE` 之一
 * @param {Function} p.list    `(ctx) => OpponentEntry[]`
 */
export function createOpponentProvider({ source, list }) {
  if (!(source in OPPONENT_SOURCE)) throw new Error(`未知的對手來源 ${source}`);
  if (typeof list !== "function") throw new Error("provider 必須提供 list()");
  return {
    schema: OPPONENT_PROVIDER_VERSION,
    source,
    /**
     * ⚠ 壞掉的一筆**直接丟掉**，不修補。與讀存檔同一條原則：
     *   一份驗不過的快照拿去挑戰，會產生「看起來正常但其實錯誤」的結果。
     */
    list(ctx = {}) {
      const out = [];
      for (const e of list(ctx) ?? []) {
        if (validateOpponentEntry(e).ok) out.push(e);
      }
      return out;
    },
  };
}

/**
 * 未來要接真伺服器時，**只要新增一個這樣的 provider**：
 *
 * ```js
 * createOpponentProvider({
 *   source: OPPONENT_SOURCE.server,
 *   list: ({ limit }) => fetchedSnapshots.map((s) => opponentEntry({
 *     key: s.team.teamId, snapshot: s, source: OPPONENT_SOURCE.server,
 *   })),
 * });
 * ```
 *
 * 看板與挑戰流程**一行都不用改**——前提是看板只讀快照，不讀 fixture 定義。
 * 那正是 `challengeBoard.js` 在 Slice 4 被修掉的東西。
 */
export const PROVIDER_SWAP_NOTE = "swap provider only; board reads snapshots";
