// ============================================================================
//  platform/challenge/opponentProvider.js — 對手來源邊界（Slice 4 → Slice 8）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  目標很小：**讓挑戰看板不知道這筆對手是 fixture 還是真玩家。**
//  日後把 fixture provider 換成 server snapshot provider 時，
//  看板與挑戰流程一行都不用改。
//
//  ⚠ 刻意**不做**過度抽象：沒有 plugin、沒有 DI 容器。
//    就是一個「回傳 `OpponentEntry` 陣列」的物件，加一個形狀契約。
//
//  ── `OpponentEntry` 是什麼 ───────────────────────────────────────────────
//  **一份權威層簽發的 `SquadSnapshot.v1` ＋ 一個穩定的身分鍵**，其餘全無。
//
//  ⚠ 這是最重要的一條：看板需要的每一項資訊——俱樂部身分、先發、
//    英雄熟練、流派、戰術、發布時間、選角傾向——**都必須從快照本身讀得出來**。
//    Slice 3 的看板還在讀 fixture 定義上的 `traits` / `doctrineHint` /
//    `recentLineupChange` / `note`，那些欄位在真玩家快照上**不存在**
//    ⇒ 換 provider 的那天看板會直接空掉。Slice 4 把它們全部改成從快照推導。
//
//  ⇒ provider 的合約因此只有一句：**給我快照，不要給我形容詞。**
//
//  ── Slice 8 加了什麼 ─────────────────────────────────────────────────────
//  Slice 4 的 provider 只有 `list()`。那對「決定性的本機 fixture」夠用，
//  但接真伺服器時會發現兩個洞：
//    ① 只想拿**一個** key 的快照時（發起挑戰、恢復選角），呼叫端只能
//       `list()` 全撈再自己 find ⇒ 真 API 上是一次多餘的整批請求。
//    ② 沒有「再去拿一次」的語意 ⇒ 資料只能在載入時取一次，
//       UI 之後必須自己想辦法重抓，那就是 UI 又長出了資料層知識。
//  ⇒ 本輪把 Owner 概念上的三支補齊（名稱沿用既有架構）：
//       listOpponents()       → `provider.list(ctx)`
//       getOpponentSnapshot() → `provider.getSnapshot(key, ctx)`
//       refreshOpponents()    → `provider.refresh(ctx)`
//
//  ⚠ **本輪仍然沒有真伺服器。** 這裡建立的是**邊界**，不是後端，
//    也不因此獲得任何防作弊能力（同 `snapshotAuthority.js` 檔頭的誠實規則）。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
//  ⚠ provider 允許 **throw**：那是「來源掛了」的訊號，由 `opponentDirectory.js`
//    接住並轉成 error 狀態。這裡刻意不吞例外——吞掉就沒有錯誤態可測了。
// ============================================================================
import { validateSquadSnapshot } from "../contracts/squadSnapshot.js";

export const OPPONENT_PROVIDER_VERSION = "OpponentProvider.v2";

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
 * ⚠ `displayIdentity` / `publishedAt` 刻意**不落成欄位**：它們是快照裡讀得到
 *   的東西（`snapshot.team` / `snapshot.issuedAt`），存第二份就是第二個真相
 *   來源。要用請走下面兩支推導函式。
 *
 * @param {object} p
 * @param {string} p.key         穩定身分鍵（= `opponentId`）
 * @param {object} p.snapshot    `SquadSnapshot.v1`
 * @param {string} [p.source]    `OPPONENT_SOURCE` 之一
 */
export function opponentEntry({ key, snapshot, source = OPPONENT_SOURCE.fixture }) {
  const opponentId = String(key);
  //  ⚠ `key` 與 `opponentId` 是**同一個值的兩個名字**，不是兩個欄位：
  //    Slice 2–7 全部的呼叫端寫 `key`，Owner 的契約寫 `opponentId`。
  //    留兩個名字比全域改名安全，但值必須永遠相同（`validateOpponentEntry` 有驗）。
  return { opponentId, key: opponentId, source, snapshot };
}

/** 對外顯示的身分。⚠ 從快照讀，不是 provider 給的形容詞。 */
export const displayIdentityOf = (entry) => entry?.snapshot?.team ?? null;

/** 這份快照的發布時刻。⚠ 同上，從快照讀。 */
export const publishedAtOf = (entry) => entry?.snapshot?.issuedAt ?? null;

/** 驗證一筆對手：快照必須通過完整驗證（含雜湊重算）。 */
export function validateOpponentEntry(e) {
  const errors = [];
  if (!e || typeof e !== "object") return { ok: false, errors: [{ code: "invalid", message: "對手項目不是物件" }] };
  if (!e.key) errors.push({ code: "key", message: "缺少身分鍵" });
  if (e.opponentId != null && String(e.opponentId) !== String(e.key)) {
    errors.push({ code: "opponentId", message: "opponentId 與 key 不一致" });
  }
  if (!(e.source in OPPONENT_SOURCE)) errors.push({ code: "source", message: `未知的對手來源 ${e.source}` });
  const v = validateSquadSnapshot(e.snapshot);
  if (!v.ok) errors.push(...v.errors.map((x) => ({ ...x, code: `snapshot_${x.code}` })));
  return { ok: errors.length === 0, errors };
}

/**
 * 建立一個 provider。
 *
 * @param {object} p
 * @param {string}   p.providerId   這個來源的穩定 id（診斷／驗證用）
 * @param {string}   p.source       `OPPONENT_SOURCE` 之一
 * @param {string}   [p.label]      給診斷讀的短名（**不是**玩家 UI 文案）
 * @param {Function} p.list         `(ctx) => OpponentEntry[]`
 * @param {Function} [p.getSnapshot]`(key, ctx) => { ok, snapshot, errors }`
 * @param {Function} [p.refresh]    `(ctx) => OpponentEntry[]`（預設 = `list`）
 */
export function createOpponentProvider({ providerId, source, label = null, list, getSnapshot = null, refresh = null }) {
  if (!(source in OPPONENT_SOURCE)) throw new Error(`未知的對手來源 ${source}`);
  if (typeof list !== "function") throw new Error("provider 必須提供 list()");
  const id = String(providerId ?? source);

  /**
   * ⚠ 壞掉的一筆**直接丟掉**，不修補。與讀存檔同一條原則：
   *   一份驗不過的快照拿去挑戰，會產生「看起來正常但其實錯誤」的結果。
   */
  const sift = (raw) => {
    const out = [];
    for (const e of raw ?? []) {
      if (validateOpponentEntry(e).ok) out.push(e);
    }
    return out;
  };

  return {
    schema: OPPONENT_PROVIDER_VERSION,
    providerId: id,
    source,
    label: label ?? id,

    /** listOpponents()。 */
    list(ctx = {}) { return sift(list(ctx)); },

    /**
     * refreshOpponents()。**語意是「再去拿一次」**，不是「拿快取」。
     *
     * ⚠ fixture 是決定性的 ⇒ 兩者結果相同，但呼叫端的意圖不同，
     *   所以仍然分成兩支：真 provider 在這裡才會丟快取／重打 API。
     */
    refresh(ctx = {}) { return sift((refresh ?? list)(ctx)); },

    /**
     * getOpponentSnapshot()。
     *
     * ⚠ 沒有自訂實作時退回 `list()` 再 find——**行為正確但效率差**，
     *   真 provider 必須自己實作成單筆請求。
     */
    getSnapshot(key, ctx = {}) {
      if (typeof getSnapshot === "function") {
        const r = getSnapshot(key, ctx) ?? {};
        return { ok: !!r.ok && !!r.snapshot, snapshot: r.snapshot ?? null, errors: r.errors ?? [] };
      }
      const hit = sift(list(ctx)).find((e) => e.key === String(key));
      return hit
        ? { ok: true, snapshot: hit.snapshot, errors: [] }
        : { ok: false, snapshot: null, errors: [{ code: "opponent", message: `找不到這個對手 ${key}` }] };
    },
  };
}

/**
 * 未來要接真伺服器時，**只要新增一個這樣的 provider**：
 *
 * ```js
 * createOpponentProvider({
 *   providerId: "server",
 *   source: OPPONENT_SOURCE.server,
 *   list: ({ limit }) => fetchedSnapshots.map((s) => opponentEntry({
 *     key: s.team.teamId, snapshot: s, source: OPPONENT_SOURCE.server,
 *   })),
 *   getSnapshot: (key) => ({ ok: true, snapshot: fetchOne(key) }),
 *   refresh: (ctx) => { dropCache(); return fetchAll(ctx); },
 * });
 * ```
 *
 * 看板與挑戰流程**一行都不用改**——前提是看板只讀快照，不讀 fixture 定義，
 * 而且呼叫端只透過 `opponentDirectory.js` 取得目前的 provider。
 */
export const PROVIDER_SWAP_NOTE = "swap provider only; board reads snapshots";
