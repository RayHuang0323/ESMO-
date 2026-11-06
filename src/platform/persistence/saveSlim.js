// ============================================================================
//  persistence/saveSlim.js — BP-9 P0-B：存檔瘦身規則（純函式，不碰任何 store）
//
//  ── 為什麼 ────────────────────────────────────────────────────────────
//  W1 真模擬第 300 天的存檔有 5,272,004 字元，已超過 Chrome 上限 5,242,880。
//  其中 CS 完整戰報 2.81 M、Season timeline 約 1.4 M；防重帳本與結算沒有上限，
//  每場約 +4.4 K。Owner 2026-11-06 核准的規則：
//    · CS 最近 5 場保留完整戰報，較舊的只留摘要（比分、地圖、結果、主要選手數據）
//    · Season 最近 10 場保留完整 timeline，較舊的拿掉 timeline
//    · 帳本與結算最近 20 筆保留完整收據，較舊的摘要化
//    · **所有交易識別（鍵）永久保留**：防重只看鍵在不在，所以縮小值不會讓同一場再算一次
//
//  ── 什麼時候套用 ──────────────────────────────────────────────────────
//  只有玩家下載備份並確認、整理寫進磁碟之後（`meta.saveSlim.mode === "migrated"`）才套用。
//  在那之前寫入行為與 P0-A 完全相同：Owner 要求第一次不可逆的整理之前要先給備份、
//  取得玩家確認（2026-11-07 起新局與小存檔也一樣，不再靜默啟用）。
//
//  ⚠ 本檔不 import 任何 store（profileStore、seasonStore 都會 import 它）。
// ============================================================================

export const SAVE_SLIM_VERSION = 1;
export const CS_FULL_KEEP = 5;
export const SEASON_TIMELINE_KEEP = 10;
export const LEDGER_FULL_KEEP = 20;
/** 摘要化的紀錄都帶這個標記；畫面看到它就顯示「此場比賽已保留歷史摘要」。 */
export const ARCHIVED_SUMMARY = "summary";
export const ARCHIVED_SUMMARY_TEXT = "此場比賽已保留歷史摘要";

/** CS 戰報裡只有完整報告會讀的兩塊（W1 實測約占單場 98%）。 */
const CS_DETAIL_FIELDS = ["analytics", "roundDetails"];

// ══════════════════════════════════════════════════════════════════════════
//  開關
// ══════════════════════════════════════════════════════════════════════════

/**
 * 玩家下載備份並勾選確認之後寫下的標記模式。**只有這一種**會讓規則生效。
 *
 * ⚠ Owner 2026-11-07：第一次真的摘要化之前一定要先備份並取得確認，首次授權之後才可以自動維持精簡。
 *   舊版（`d9b918cc`..`fc51e1ea`，從未上 main）會在「現在沒有東西要摘要」時直接寫下 `new`／`auto` 標記，
 *   等於還沒授權就先啟用了。那兩種標記一律當成「沒有授權」：不套用規則、可以重新走整理流程。
 */
export const SLIM_CONSENTED_MODE = "migrated";
export const isConsentedSlimMark = (mark) => !!mark && Number(mark.v) >= SAVE_SLIM_VERSION && mark.mode === SLIM_CONSENTED_MODE;

/** 這份存檔是否已啟用瘦身規則。 */
//  ⚠ 整理後的驗證失敗（failed）就停用：畫面說「之後不會再自動改動存檔」，規則本身也可能就是出錯的原因（Review 第 1 輪 m2）。
export const isSlimEnabled = (meta) => isConsentedSlimMark(meta?.saveSlim) && !meta?.saveSlim?.failed;

//  Season 存在另一個 store，讀不到 profile 的 meta：由 profileStore 在載入與遷移時設定。
let seasonSlimActive = false;
export const setSeasonSlimActive = (on) => { seasonSlimActive = !!on; };
export const seasonSlimActive_ = () => seasonSlimActive;

//  遷移寫進磁碟之後、重新整理之前，記憶體裡還是舊的那份。
//  ⚠ 這段時間任何寫入（包括離開頁面的保底存檔）都會把舊資料寫回去，所以全部擋住。
let writesFrozen = false;
export const freezeSaveWrites = () => { writesFrozen = true; };
export const saveWritesFrozen = () => writesFrozen;
/**
 * 解除凍結。⚠ 只有在「磁碟確定還是記憶體那一份」時才可以：整理在寫任何東西之前就失敗、
 * 或還原失敗但已經放回原值。其他情況一律重新整理（Review 第 1 輪 M1）。
 */
export const unfreezeSaveWrites = () => { writesFrozen = false; };
export const _unfreezeSaveWritesForTest = unfreezeSaveWrites;

// ══════════════════════════════════════════════════════════════════════════
//  單筆摘要化（都可以重複套用：已經是摘要的原樣回傳）
// ══════════════════════════════════════════════════════════════════════════

const without = (obj, fields) => {
  const out = { ...obj };
  for (const f of fields) delete out[f];
  return out;
};

export function summarizeCsEntry(e) {
  if (!e || typeof e !== "object" || e.archived === ARCHIVED_SUMMARY) return e;
  if (!CS_DETAIL_FIELDS.some((f) => f in e)) return e;
  return { ...without(e, CS_DETAIL_FIELDS), archived: ARCHIVED_SUMMARY };
}

export function stripSeasonTimeline(r) {
  if (!r || typeof r !== "object" || !Array.isArray(r.timeline) || r.timeline.length === 0) return r;
  return { ...r, timeline: [], timelineArchived: true };
}

/**
 * 舊收據／舊結算只留最小摘要：成立與否、哪一場、勝負、這場的獎金、時間。
 *
 * ⚠ 第一版只拿掉逐選手明細（每筆仍約 700 字元），20 季壓力測試第 19 季就頂到上限
 *   （每季 +176 K）。帳本的鍵必須永久保留，所以值一定要小到可以一直累積。
 * ⚠ 防重只看鍵在不在；`ok`／`applied`／`settled` 留著，舊交易重送時回傳的收據仍然判得出成立。
 */
const LEDGER_KEEP = ["ok", "applied", "settled", "matchId", "mode", "recordedAt", "settledAt"];
export function compactLedgerEntry(r) {
  if (!r || typeof r !== "object" || r.archived === ARCHIVED_SUMMARY) return r;
  const out = {};
  for (const k of LEDGER_KEEP) if (r[k] !== undefined) out[k] = r[k];
  const winner = r.winner ?? r.metadata?.winner;
  if (winner !== undefined) out.winner = winner;
  if (r.team?.money !== undefined) out.money = r.team.money;
  //  ⚠ 結算的 trace 要留場次與比賽識別：settleMatchResult 的 settledInThisSession 用它判斷「已在本場次結算」，
  //    拿掉會讓舊結果重送從「已結算」變成 foreign_result（Review 第 1 輪 m1）。
  if (r.trace) out.trace = { sessionId: r.trace.sessionId ?? null, matchId: r.trace.matchId ?? null, transactionId: r.trace.transactionId ?? null };
  out.archived = ARCHIVED_SUMMARY;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
//  整份套用
// ══════════════════════════════════════════════════════════════════════════

/** csHistory 最新在前：前 5 場完整。 */
export function slimCsHistory(list) {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const out = list.map((e, i) => {
    if (i < CS_FULL_KEEP) return e;
    const s = summarizeCsEntry(e);
    if (s !== e) changed = true;
    return s;
  });
  return changed ? out : list;
}

/** Season history 最舊在前：最後 10 場保留 timeline。 */
export function slimSeasonHistory(history) {
  if (!Array.isArray(history)) return history;
  const cut = history.length - SEASON_TIMELINE_KEEP;
  let changed = false;
  const out = history.map((r, i) => {
    if (i >= cut) return r;
    const s = stripSeasonTimeline(r);
    if (s !== r) changed = true;
    return s;
  });
  return changed ? out : history;
}

/**
 * 帳本／結算：物件的插入順序就是入帳順序（鍵都是 `moba:`、`cs:`、`settle:` 開頭的字串，
 * 不會被 JS 當成整數重排）。最後 20 筆完整，其餘摘要化。**鍵一個都不刪。**
 */
export function slimLedger(ledger) {
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) return ledger;
  const keys = Object.keys(ledger);
  const cut = keys.length - LEDGER_FULL_KEEP;
  let changed = false;
  const out = {};
  keys.forEach((k, i) => {
    const v = ledger[k];
    const s = i < cut ? compactLedgerEntry(v) : v;
    if (s !== v) changed = true;
    out[k] = s;
  });
  return changed ? out : ledger;
}

/**
 * profile 物件（記憶體 state 或磁碟上那份）套用規則。沒有變動的欄位回傳同一個參考。
 * @returns {{ csHistory, processedMatchTransactions, matchmaking }}
 */
export function slimProfileParts(profile) {
  const mm = profile?.matchmaking;
  const settlements = mm?.settlements;
  const slimSettlements = slimLedger(settlements);
  return {
    csHistory: slimCsHistory(profile?.csHistory),
    processedMatchTransactions: slimLedger(profile?.processedMatchTransactions),
    matchmaking: slimSettlements === settlements ? mm : { ...mm, settlements: slimSettlements },
  };
}

/** 整份 profile 套用（不改 meta）。 */
export function slimProfileRecord(profile) {
  const parts = slimProfileParts(profile);
  return { ...profile, ...parts };
}

// ══════════════════════════════════════════════════════════════════════════
//  計畫：會動到幾筆、大約省多少
// ══════════════════════════════════════════════════════════════════════════

const len = (v) => (v === undefined ? 0 : JSON.stringify(v).length);
const countChanged = (a, b) => {
  if (a === b || !a) return 0;
  const av = Array.isArray(a) ? a : Object.values(a);
  const bv = Array.isArray(b) ? b : Object.values(b);
  let n = 0;
  for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) n++;
  return n;
};

/**
 * @param {object} p.profile        磁碟上那份 profile 物件
 * @param {Array}  p.seasonHistory  Season history
 */
export function planSaveSlim({ profile = null, seasonHistory = [] } = {}) {
  const parts = slimProfileParts(profile ?? {});
  const season = slimSeasonHistory(seasonHistory ?? []);
  const changes = {
    cs: countChanged(profile?.csHistory, parts.csHistory),
    receipts: countChanged(profile?.processedMatchTransactions, parts.processedMatchTransactions),
    settlements: countChanged(profile?.matchmaking?.settlements, parts.matchmaking?.settlements),
    season: countChanged(seasonHistory, season),
  };
  const total = changes.cs + changes.receipts + changes.settlements + changes.season;
  const before = len(profile) + len(seasonHistory);
  const after = total ? len({ ...profile, ...parts }) + len(season) : before;
  return { changes, total, before, after, saved: before - after };
}

// ══════════════════════════════════════════════════════════════════════════
//  遷移前後一致性：先記下「不能變的東西」，寫入並冷啟動讀回之後逐項比對
// ══════════════════════════════════════════════════════════════════════════

/** 32-bit FNV-1a。只用來比對「有沒有變」，不是安全用途。 */
export function fnv(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
const fp = (v) => `${fnv(JSON.stringify(v ?? null))}:${len(v)}`;

/** profile 扣掉會被瘦身的欄位與遷移標記：其餘每一個欄位都不能變。 */
function profileRest(profile) {
  const rest = without(profile ?? {}, ["csHistory", "processedMatchTransactions", "matchmaking"]);
  rest.meta = without(rest.meta ?? {}, ["saveSlim"]);
  rest.matchmaking = without(profile?.matchmaking ?? {}, ["settlements"]);
  return rest;
}

const csIdentity = (e) => ({ ...summarizeCsEntry(e), archived: undefined });
const seasonIdentity = (r) => ({ ...r, timeline: undefined, timelineArchived: undefined });
const ledgerIdentity = (r) => ({ ...compactLedgerEntry(r), archived: undefined });

/**
 * 遷移前要記下的東西。都只是雜湊，存在 `meta.saveSlim.expect`，大約 1 KB。
 * @param {string|null} p.heroRaw  熟練的原始字串（遷移不碰它，逐位元比）
 */
export function slimExpectation({ profile = null, seasonHistory = [], heroRaw = null } = {}) {
  const cs = Array.isArray(profile?.csHistory) ? profile.csHistory : [];
  const ledger = profile?.processedMatchTransactions ?? {};
  const settle = profile?.matchmaking?.settlements ?? {};
  const season = Array.isArray(seasonHistory) ? seasonHistory : [];
  const cut = season.length - SEASON_TIMELINE_KEEP;
  return {
    rest: fp(profileRest(profile)),
    ledgerKeys: fp(Object.keys(ledger)),
    ledgerCount: Object.keys(ledger).length,
    ledgerBody: fp(Object.values(ledger).map(ledgerIdentity)),
    ledgerTail: fp(Object.values(ledger).slice(-LEDGER_FULL_KEEP)),
    settleKeys: fp(Object.keys(settle)),
    settleCount: Object.keys(settle).length,
    settleBody: fp(Object.values(settle).map(ledgerIdentity)),
    settleTail: fp(Object.values(settle).slice(-LEDGER_FULL_KEEP)),
    csCount: cs.length,
    csHead: fp(cs.slice(0, CS_FULL_KEEP)),
    csBody: fp(cs.map(csIdentity)),
    seasonCount: season.length,
    seasonTail: fp(season.slice(Math.max(0, cut))),
    seasonBody: fp(season.map(seasonIdentity)),
    hero: heroRaw === null ? null : fp(heroRaw),
  };
}

/**
 * 冷啟動讀回後比對。任何一項不同就不算完成。
 * @returns {{ ok:boolean, mismatches:string[] }}
 */
export function verifySlim(expect, actual) {
  if (!expect || typeof expect !== "object") return { ok: false, mismatches: ["no_expectation"] };
  const now = slimExpectation(actual);
  const mismatches = Object.keys(expect).filter((k) => JSON.stringify(expect[k]) !== JSON.stringify(now[k]));
  //  完整那一段也要真的還是完整的（不是被摘要化後湊巧一樣）。
  const cs = actual?.profile?.csHistory ?? [];
  if (cs.slice(0, CS_FULL_KEEP).some((e) => e?.archived === ARCHIVED_SUMMARY)) mismatches.push("cs_head_archived");
  return { ok: mismatches.length === 0, mismatches };
}

/** localStorage 全部鍵的字元數（與 P0-A 的 `storageLooksFull` 同一個算法）。 */
export function storageChars(storage) {
  if (!storage) return 0;
  let n = 0;
  try {
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); n += k.length + (storage.getItem(k)?.length ?? 0); }
  } catch { return 0; }
  return n;
}
