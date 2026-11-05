// ============================================================================
//  platform/persistence/matchCommit.js — BP-9 P0-A：比賽提交的日誌與警示（只管儲存）
//
//  ── 為什麼要有這一層 ──────────────────────────────────────────────
//  一場 MOBA 比賽要改三把 localStorage 鍵：profile（帳本、資金、賽程）、
//  heroProgress、season。localStorage 沒有交易，以前是各寫各的，所以配額不足時
//  會留下「熟練與 Season 寫了、帳本沒寫」的狀態，而且重打一次就再算一次（W2 實測）。
//
//  現在的規則：**profile 是唯一權威**。單次 setItem 本身是原子的，那一筆帳本寫進去，
//  這場才算發生。流程在 `progress/commitMatch.js`：
//    ① 寫日誌（這裡的 journal）② 一次寫完 profile ③ 寫熟練與 Season（都有防重）④ 刪日誌
//  任何一步中斷，開機時看 profile 有沒有那筆帳：有就補完 ③，沒有就當作沒發生。
//
//  ⚠ 日誌不含 `timeline`：它佔單場七成以上，而恢復只用得到勝負與數據。
//    放進去會讓日誌本身就寫不進快滿的儲存空間。
//  ⚠ 警示獨立存放，並且在 sessionStorage 留一份：空間滿到連警示都寫不進去時，
//    同一個分頁重新整理仍然要告訴玩家。
//  ⚠ 本檔不 import 任何 store（profileStore 會 import 本檔）。
// ============================================================================
import { create } from "zustand";

export const COMMIT_JOURNAL_KEY = "esmo.commit.journal.v1";
export const COMMIT_ALERT_KEY = "esmo.commit.alert.v1";
export const COMMIT_AUDIT_KEY = "esmo.commit.audit.v1";
export const COMMIT_JOURNAL_SCHEMA = "MatchCommitJournal.v1";
export const JOURNAL_STATES = Object.freeze({ prepared: "prepared", failed: "failed" });
export const ALERT_KINDS = Object.freeze({ match: "match", derived: "derived", save: "save" });

const MAX_AUDIT_FINDINGS = 12;

const local = () => (typeof localStorage !== "undefined" ? localStorage : null);
const session = () => (typeof sessionStorage !== "undefined" ? sessionStorage : null);

/**
 * 這一場比賽的穩定識別。同一場怎麼重打都是同一個值。
 *
 * ⚠ 不能用 `matchId`：它由賽果內容推導，同一場賽程重打結果不同，id 就不同。
 * ⚠ 賽程優先用 fixtureId：房間逾時重開會換 sessionId，但還是同一場。
 * ⚠ 帶上賽季：賽程 id 是決定性的，不靠它永遠不重複。
 * ⚠ BO3 同一個賽程有多張地圖，用「已打完幾張」區分。結算失敗時 series 會還原，
 *   所以同一張地圖重打還是同一個值（不能用 matchId，理由同上）。
 */
export function commitKeyOf(sess, matchId) {
  const fixtureId = sess?.origin?.fixtureId ?? null;
  const seasonTag = /:s(\d+):/.exec(sess?.origin?.competitionId ?? "")?.[1] ?? "";
  const base = fixtureId ? `${fixtureId}:s${seasonTag}` : sess?.sessionId ? `s:${sess.sessionId}` : `m:${matchId}`;
  return sess?.series ? `${base}:m${sess.series.maps?.length ?? 0}` : base;
}

/** 日誌裡的賽果：拿掉 timeline，其他照舊（恢復時寫進 Season 的就是這一份）。 */
export function journalResult(result) {
  if (!result || typeof result !== "object") return result;
  return { ...result, timeline: [] };
}

export function readJournal() {
  const s = local();
  if (!s) return null;
  let raw = null;
  try { raw = s.getItem(COMMIT_JOURNAL_KEY); } catch { return null; }
  if (raw === null || raw === "") return null;
  try {
    const j = JSON.parse(raw);
    if (j?.schema === COMMIT_JOURNAL_SCHEMA && j.commitKey) return j;
  } catch { /* noop: 下面當成壞掉回報 */ }
  return { corrupt: true };
}

export function writeJournal(entry) {
  const s = local();
  if (!s) return { ok: false, error: "no_storage" };
  try {
    s.setItem(COMMIT_JOURNAL_KEY, JSON.stringify({ ...entry, schema: COMMIT_JOURNAL_SCHEMA }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.name ?? e?.message ?? e) };
  }
}

export function clearJournal() {
  const s = local();
  if (!s) return false;
  try { s.removeItem(COMMIT_JOURNAL_KEY); return true; } catch { return false; }
}

/**
 * 畫面讀這裡。不進 profile，所以不會被存進存檔、也不影響 dirty 判斷。
 * `retry` 只活在記憶體：它握著完整賽果，重新整理之後由日誌重建或讓玩家重打。
 */
export const useCommitAlertStore = create(() => ({ alert: null, retry: null }));

/** 同時寫 local 與 session：空間滿時至少留一份。回傳實際寫到哪裡。 */
export function setCommitAlert(alert, { retry = null } = {}) {
  const raw = JSON.stringify(alert);
  let wrote = false;
  try { local()?.setItem(COMMIT_ALERT_KEY, raw); wrote = true; } catch { /* noop: 空間滿：下面還有 session */ }
  let wroteSession = false;
  try { session()?.setItem(COMMIT_ALERT_KEY, raw); wroteSession = true; } catch { /* noop: 還有記憶體那份 */ }
  useCommitAlertStore.setState({ alert, retry });
  return { local: wrote, session: wroteSession };
}

export function clearCommitAlert() {
  try { local()?.removeItem(COMMIT_ALERT_KEY); } catch { /* noop: 下次再清 */ }
  try { session()?.removeItem(COMMIT_ALERT_KEY); } catch { /* noop: 下次再清 */ }
  useCommitAlertStore.setState({ alert: null, retry: null });
}

/** 開機讀回警示：local 優先，空間滿寫不進去時才看 session。 */
export function loadCommitAlert() {
  for (const store of [local(), session()]) {
    let raw = null;
    try { raw = store?.getItem(COMMIT_ALERT_KEY) ?? null; } catch { raw = null; }
    if (!raw) continue;
    try {
      const a = JSON.parse(raw);
      if (a?.kind) { useCommitAlertStore.setState({ alert: a, retry: null }); return a; }
    } catch { /* noop: 讀不懂就看下一份 */ }
  }
  return null;
}

/** 這場賽程已經收尾（棄權），它留下的日誌與警示都不再有意義。 */
export function dropCommitForFixture(fixtureId) {
  if (!fixtureId) return;
  if (useCommitAlertStore.getState().alert?.fixtureId === fixtureId) clearCommitAlert();
  if (readJournal()?.fixtureId === fixtureId) clearJournal();
}

/** 開新局或還原整份存檔時用：舊的日誌與警示不屬於新的那份存檔。 */
export function resetCommitState() {
  clearJournal();
  clearCommitAlert();
  try { local()?.removeItem(COMMIT_AUDIT_KEY); } catch { /* noop: 只是診斷資料 */ }
}

/**
 * 偵測歷史異常。**只回報，不修。** W2 證實舊版可能留下這些狀態，而這裡分辨不出
 * 當時玩家的哪一場才是真的，所以 Owner 決定不自動補償。
 *
 * @param {object} p.profile
 * @param {object} p.heroProgress
 * @param {Array}  p.seasonHistory
 * @returns {{ checkedAt:number, findings:Array<object> }}
 */
export function detectCommitAnomalies({ profile = null, heroProgress = null, seasonHistory = [], now = 0 } = {}) {
  const findings = [];
  const mobaTx = Object.keys(profile?.processedMatchTransactions ?? {}).filter((k) => k.startsWith("moba:")).length;
  const heroGames = Object.values(heroProgress ?? {}).reduce((n, h) => n + (h?.mastery?.games ?? 0), 0);
  //  一場 MOBA 兩邊共 10 位英雄。⚠ 只有「多出來」才算異常：少的可能是舊版本或練習賽的差異。
  const heroMatches = heroGames / 10;
  if (heroMatches > mobaTx) findings.push({ code: "hero_ahead_of_ledger", heroMatches, mobaTx, excess: heroMatches - mobaTx });
  const sessionLive = profile?.matchmaking?.session ?? null;
  for (const mode of ["moba", "cs"]) {
    for (const f of profile?.competitionByMode?.[mode]?.fixtures ?? []) {
      if (f.status === "launched" && sessionLive?.origin?.fixtureId !== f.id) findings.push({ code: "launched_without_session", mode, fixtureId: f.id });
    }
  }
  const seen = new Map();
  for (const r of seasonHistory ?? []) {
    if (r?.commitKey) seen.set(r.commitKey, (seen.get(r.commitKey) ?? 0) + 1);
  }
  for (const [commitKey, count] of seen) if (count > 1) findings.push({ code: "season_duplicate_commit", commitKey, count });
  return { checkedAt: now, findings: findings.slice(0, MAX_AUDIT_FINDINGS) };
}

export function recordAudit(audit) {
  if (!audit?.findings?.length) { try { local()?.removeItem(COMMIT_AUDIT_KEY); } catch { /* noop: 只是診斷資料 */ } return false; }
  try { local()?.setItem(COMMIT_AUDIT_KEY, JSON.stringify(audit)); return true; } catch { return false; }
}
