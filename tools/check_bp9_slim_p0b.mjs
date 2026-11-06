#!/usr/bin/env node
// ============================================================================
//  tools/check_bp9_slim_p0b.mjs — BP-9 P0-B：存檔瘦身與舊存檔恢復
//
//    node tools/check_bp9_slim_p0b.mjs [--checkpoints=<W1 checkpoints 資料夾>] [--seasons=20]
//
//  ── 驗什麼（Owner 2026-11-06 必要驗收的 Node 部分）──────────────────────
//  §1 規則：最近 5／10／20 筆完整、其餘摘要化、鍵一個都不刪、重複套用結果相同
//  §2 W1 真模擬存檔（第 228／254／300 天）：實際節省多少
//  §3 遷移：沒確認備份就拒絕且不寫；確認後寫入；**新行程冷啟動**讀回比對通過；
//     再開一次不再變動；資金、賽程、帳本鍵、熟練逐位元不變
//  §4 中斷與失敗：Season／profile 寫入失敗、寫完 Season 就中斷、寫完 profile 還沒重新整理、
//     凍結期間的存檔、磁碟被動過（比對要抓到）
//  §5 防重：遷移後把已摘要化的舊交易、最新的交易再送一次，都判定已入帳、資金不動
//  §6 備份：匯出→整理→還原，逐位元等於備份；改過的備份被拒；空間不夠時還原失敗且目前存檔不變
//  §7 寫入時持續套用：啟用後新增的比賽照規則摘要化；未啟用時行為與 P0-A 相同
//  §8 輕量容量壓力：真實資料樣板經真的 Store Action 灌 N 季，總量不超過上限
//  §9 P0-A 保護：已滿提示在整理後清掉；凍結期間 save() 不寫
//  §7b 首次授權（Owner 2026-11-07）：新局與小存檔不靜默啟用；超過門檻也不摘要化，直到備份並確認；
//      舊版未授權的 new／auto 標記不算授權；授權過的玩家開新局要重新授權
//  §10 兩個分頁：舊備份接著整理被拒、已整理的不會再整理、同時整理結果一致、舊分頁蓋回不會讓資料變少
//
//  ⚠ store 在 import 時讀磁碟，所以每一次「重新整理」都是新的子行程。
//  ⚠ 真比賽連打交給 tools/season_e2e_w1.mjs（從整理後的存檔接著跑），真畫面交給
//    browser_check_bp9_slim_p0b。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const CHROME_QUOTA = 5_242_880;
const PROFILE_KEY = "esmo.profile.v1", HERO_KEY = "esmo.heroProgress.v2", SEASON_KEY = "esmo.season.v1";
const ALERT_KEY = "esmo.commit.alert.v1";

// ══════════════════════════════════════════════════════════════════════════
//  子行程：一次「開遊戲」
// ══════════════════════════════════════════════════════════════════════════
function installStorage(initial, quota, faults = []) {
  const map = new Map(Object.entries(initial ?? {}));
  const used = () => { let n = 0; for (const [k, v] of map) n += k.length + v.length; return n; };
  const quotaError = () => Object.assign(new Error("QuotaExceededError (injected)"), { name: "QuotaExceededError" });
  const ctl = { map, used, writes: [], faults: faults.map((f) => ({ ...f })) };
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      const s = String(v);
      const f = ctl.faults.find((x) => x.key === k && x.times > 0);
      if (f) { f.times -= 1; ctl.writes.push({ op: "fail", key: k }); throw quotaError(); }
      if (quota) {
        const prev = map.has(k) ? k.length + map.get(k).length : 0;
        if (used() - prev + k.length + s.length > quota) { ctl.writes.push({ op: "quota", key: k }); throw quotaError(); }
      }
      map.set(k, s); ctl.writes.push({ op: "set", key: k, size: s.length });
    },
    removeItem: (k) => { if (map.delete(k)) ctl.writes.push({ op: "remove", key: k }); },
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
  const sess = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (sess.has(k) ? sess.get(k) : null), setItem: (k, v) => sess.set(k, String(v)),
    removeItem: (k) => sess.delete(k), key: (i) => [...sess.keys()][i] ?? null, get length() { return sess.size; },
  };
  return ctl;
}

if (arg("child")) {
  process.chdir(ROOT);
  const job = JSON.parse(fs.readFileSync(arg("child"), "utf8"));
  const ctl = installStorage(job.storage, job.quota ?? null, job.faults ?? []);
  let clock = job.clock ?? 1800100000000;
  Date.now = () => clock;
  const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
  const { useProfileStore } = await imp("src/platform/profileStore.js");
  const { useSeasonStore } = await imp("src/platform/seasonStore.js");
  const { useHeroProgressStore } = await imp("src/hero/heroProgressStore.js");
  const MIG = await imp("src/platform/persistence/saveSlimMigration.js");
  const SLIM = await imp("src/platform/persistence/saveSlim.js");
  const BK = await imp("src/platform/persistence/saveBackup.js");
  const MC = await imp("src/platform/persistence/matchCommit.js");
  const st = () => useProfileStore.getState();
  const out = { steps: [] };
  const note = (k, v) => { out[k] = v; };
  //  ⚠ 依鍵排序：還原失敗時會先刪再放回，Map 的順序會變，但內容要逐位元相同。
  const disk = () => Object.fromEntries([...ctl.map].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
  const facts = () => {
    const p = JSON.parse(ctl.map.get(PROFILE_KEY) ?? "{}");
    return {
      funds: p.finance?.funds ?? null, day: p.meta?.days ?? null,
      ledgerKeys: Object.keys(p.processedMatchTransactions ?? {}), settleKeys: Object.keys(p.matchmaking?.settlements ?? {}),
      cs: (p.csHistory ?? []).length, csArchived: (p.csHistory ?? []).filter((e) => e.archived === "summary").length,
      fixtures: JSON.stringify(Object.fromEntries(["moba", "cs"].map((m) => [m, (p.competitionByMode?.[m]?.fixtures ?? []).map((f) => `${f.id}:${f.status}`)]))),
      slim: p.meta?.saveSlim ? { ...p.meta.saveSlim, expect: !!p.meta.saveSlim.expect } : null,
      hero: ctl.map.get(HERO_KEY) ?? null, chars: ctl.used(),
    };
  };
  try {
    for (const s of job.steps) {
      if (s.op === "boot") { out.steps.push({ op: "boot", r: MIG.bootSaveSlim(), state: MIG.useSaveSlimStore.getState().state }); continue; }
      if (s.op === "migrate") {
        //  預設：指紋取自目前磁碟（＝剛下載的備份）。stale：模擬下載之後存檔又變了。
        let fp = s.fingerprint === "none" ? null : MIG.diskFingerprint();
        if (s.fingerprint === "stale" && fp) fp = { ...fp, "esmo.profile.v1": "00000000:1" };
        const r = MIG.runSaveSlimMigration({ backupConfirmed: s.confirmed, backupFingerprint: fp });
        out.steps.push({ op: "migrate", r: { ok: r.ok, stage: r.stage, error: r.error ?? null, saved: r.plan?.saved ?? null, frozen: r.frozen ?? null }, frozenNow: SLIM.saveWritesFrozen() });
        continue;
      }
      if (s.op === "staleAfterBackup") {
        //  真實順序：下載備份（取得指紋）→ 存檔又被寫入 → 開始整理（Review 第 2 輪 n2）。
        const b = await BK.buildSaveBackup(globalThis.localStorage, { now: clock });
        const fp = MIG.fingerprintOf((k) => b.backup.keys[k] ?? null);
        clock += 60_000;
        st().pushInbox({ type: "match", from: "測試", subject: "下載之後又存了一次", text: "x" });
        const before = JSON.stringify(Object.fromEntries(ctl.map));
        const r = MIG.runSaveSlimMigration({ backupConfirmed: true, backupFingerprint: fp });
        out.steps.push({ op: "staleAfterBackup", stage: r.stage, ok: r.ok, unchanged: JSON.stringify(Object.fromEntries(ctl.map)) === before, frozenNow: SLIM.saveWritesFrozen() });
        continue;
      }
      if (s.op === "remigrate") {
        const r = MIG.runSaveSlimMigration({ backupConfirmed: true, backupFingerprint: MIG.diskFingerprint() });
        out.steps.push({ op: "remigrate", stage: r.stage, ok: r.ok });
        continue;
      }
      if (s.op === "applyRestore") {
        //  畫面上的還原動作（含凍結與失敗時解除凍結），reload 換成空函式。
        const SBA = await imp("src/ui/saveBackupActions.js");
        const parsed = await BK.parseSaveBackup(fs.readFileSync(s.file, "utf8"));
        const r = SBA.applyBackupAndReload(parsed.backup, { reload: () => {} });
        out.steps.push({ op: "applyRestore", ok: r.ok, rolledBack: r.rolledBack ?? null, frozenNow: SLIM.saveWritesFrozen() });
        continue;
      }
      if (s.op === "saveAfter") {
        //  凍結期間：記憶體裡是舊的那份，任何寫入都不能落盤。
        const before = ctl.map.get(PROFILE_KEY);
        const ok = st().save();
        const flush = st().flushIfDirty?.();
        st().pushInbox?.({ type: "match", from: "測試", subject: "凍結中", text: "x" });
        const seasonW = useSeasonStore.getState().resetSeason ? null : null;
        out.steps.push({ op: "saveAfter", ok, flush, unchanged: ctl.map.get(PROFILE_KEY) === before, seasonW });
        continue;
      }
      if (s.op === "resend") {
        //  已摘要化的舊交易與最新那筆都再送一次：只看鍵就要判定已入帳。
        const p = st();
        const keys = Object.keys(p.processedMatchTransactions ?? {});
        const fundsBefore = p.finance?.funds;
        const res = [];
        for (const pick of [keys[0], keys[Math.floor(keys.length / 2)], keys[keys.length - 1]]) {
          const rec = p.processedMatchTransactions[pick];
          const tx = JSON.parse(JSON.stringify(job.lastTx));
          tx.transactionId = pick; tx.matchId = rec.matchId; tx.mode = rec.mode ?? tx.mode;
          const r = st().applyMatchProgress(tx);
          res.push({ key: pick, archived: rec.archived ?? null, alreadyApplied: r?.alreadyApplied ?? null, ok: r?.ok ?? null, code: r?.errors?.[0]?.code ?? null });
        }
        out.steps.push({ op: "resend", res, fundsSame: st().finance?.funds === fundsBefore, ledgerSame: Object.keys(st().processedMatchTransactions).length === keys.length });
        continue;
      }
      if (s.op === "backup") {
        const r = await BK.buildSaveBackup(globalThis.localStorage, { now: clock });
        out.steps.push({ op: "backup", ok: r.ok, chars: r.backup?.chars ?? null, keys: r.backup ? Object.keys(r.backup.keys) : [] });
        if (r.ok) fs.writeFileSync(s.file, r.text);
        continue;
      }
      if (s.op === "restore") {
        const parsed = await BK.parseSaveBackup(fs.readFileSync(s.file, "utf8"));
        const before = JSON.stringify(disk());
        const r = parsed.ok ? BK.restoreSaveBackup(globalThis.localStorage, parsed.backup) : { ok: false, error: parsed.error };
        out.steps.push({ op: "restore", parsed: parsed.ok, parseError: parsed.error ?? null, ok: r.ok, error: r.error ?? null, rolledBack: r.rolledBack ?? null,
          matches: parsed.ok ? BK.storageMatchesBackup(globalThis.localStorage, parsed.backup) : null, unchanged: JSON.stringify(disk()) === before });
        continue;
      }
      if (s.op === "tamperDisk") {
        //  模擬「寫入之後、驗證之前磁碟被動過」：拿掉一個帳本鍵。
        const p = JSON.parse(ctl.map.get(PROFILE_KEY));
        const k = Object.keys(p.processedMatchTransactions)[0];
        delete p.processedMatchTransactions[k];
        ctl.map.set(PROFILE_KEY, JSON.stringify(p));
        out.steps.push({ op: "tamperDisk", removed: k });
        continue;
      }
      if (s.op === "alertFull") { MC.setCommitAlert({ kind: "save", at: clock, full: true }); out.steps.push({ op: "alertFull" }); continue; }
      if (s.op === "readAlert") { out.steps.push({ op: "readAlert", alert: JSON.parse(ctl.map.get(ALERT_KEY) ?? "null"), quotaHit: MC.storageLooksFull() }); continue; }
      if (s.op === "grow") {
        //  §7／§8：用真實資料樣板，經真的 Store Action 加比賽。
        const T = job.templates;
        let n = 0;
        const series = [];
        for (let i = 0; i < s.matches; i++) {
          clock += 3_600_000;
          const id = `${s.tag}${i}`;
          const tx = JSON.parse(JSON.stringify(T.tx));
          tx.matchId = `m${id}`; tx.transactionId = `${tx.mode}:m${id}:progress-v1`;
          const r = st().applyMatchProgress(tx);
          if (r?.ok) n++;
          if (T.cs) st().recordCsMatch({ ...T.cs, matchId: `cs_${id}` }, r);
          if (T.season) useSeasonStore.getState().recordCommitted(`grow:${id}`, { ...T.season, matchId: `g${id}` });
          //  結算帳本：與 settleMatchResult 同一個寫法（同一個函式），只是不經場次。
          if (T.settle) {
            const mm = st().matchmaking ?? {};
            const ledger = { ...(mm.settlements ?? {}), [`settle:${id}`]: { ...T.settle, settlementId: `settle:${id}` } };
            useProfileStore.setState({ matchmaking: { ...mm, settlements: SLIM.isSlimEnabled(st().meta) ? SLIM.slimLedger(ledger) : ledger } });
          }
          if ((i + 1) % (s.every ?? 1e9) === 0) { st().save(); series.push({ at: i + 1, chars: ctl.used() }); }
        }
        const okSave = st().save();
        out.steps.push({ op: "grow", applied: n, okSave, chars: ctl.used(), series, writesFailed: ctl.writes.filter((w) => w.op !== "set" && w.op !== "remove").length });
        continue;
      }
      if (s.op === "rememberFp") {
        //  分頁 B 下載備份當下的指紋（之後磁碟可能被分頁 A 改掉）。
        out.savedFp = MIG.diskFingerprint();
        out.steps.push({ op: "rememberFp" });
        continue;
      }
      if (s.op === "replaceDisk") {
        //  另一個分頁寫了磁碟：本分頁的 store 仍是開機時讀進來的那份（store 只在載入時讀磁碟）。
        ctl.map.clear();
        for (const [k, v] of Object.entries(s.storage)) ctl.map.set(k, v);
        out.steps.push({ op: "replaceDisk" });
        continue;
      }
      if (s.op === "migrateSavedFp") {
        const r = MIG.runSaveSlimMigration({ backupConfirmed: true, backupFingerprint: out.savedFp ?? null });
        out.steps.push({ op: "migrateSavedFp", r: { ok: r.ok, stage: r.stage }, frozenNow: SLIM.saveWritesFrozen() });
        continue;
      }
      if (s.op === "saveNow") {
        const ok = st().save();
        out.steps.push({ op: "saveNow", ok, frozenNow: SLIM.saveWritesFrozen() });
        continue;
      }
      if (s.op === "newGame") {
        //  玩家在遊戲裡開新局（Owner 2026-11-07：新局也要重新授權）。
        //  ⚠ 情境 id 不對時 startNewGame 回 false、什麼都不做：一定要把回傳值記下來，否則測的是舊局。
        const { DEFAULT_SCENARIO } = await imp("src/platform/economy/economyConfig.js");
        const started = st().startNewGame(s.scenario ?? DEFAULT_SCENARIO);
        out.steps.push({ op: "newGame", started, day: st().meta?.days ?? null, slim: st().meta?.saveSlim ?? null, seasonActive: SLIM.seasonSlimActive_() });
        continue;
      }
      if (s.op === "setMark") {
        //  模擬舊版（d9b918cc..fc51e1ea）在沒授權時寫下的 new／auto 標記。
        const p = JSON.parse(ctl.map.get(PROFILE_KEY));
        p.meta = { ...(p.meta ?? {}), saveSlim: s.mark };
        ctl.map.set(PROFILE_KEY, JSON.stringify(p));
        out.steps.push({ op: "setMark" });
        continue;
      }
      if (s.op === "facts") { out.steps.push({ op: "facts", ...facts() }); continue; }
      if (s.op === "plan") {
        const d = MIG.readDiskSave();
        out.steps.push({ op: "plan", plan: d ? SLIM.planSaveSlim(d) : null });
        continue;
      }
      if (s.op === "storeView") {
        const p = st();
        out.steps.push({ op: "storeView", slim: p.meta?.saveSlim ?? null, seasonLen: useSeasonStore.getState().history.length, seasonActive: SLIM.seasonSlimActive_(),
          seasonTimelines: useSeasonStore.getState().history.filter((r) => (r.timeline ?? []).length > 0).length, heroSame: null });
        continue;
      }
      throw new Error(`unknown op ${s.op}`);
    }
  } catch (e) {
    out.error = String(e?.stack ?? e).slice(0, 800);
  }
  out.storage = disk();
  out.writes = ctl.writes.map((w) => `${w.op}:${w.key}`);
  out.clock = clock;
  fs.writeFileSync(arg("out"), JSON.stringify(out));
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════
//  主行程
// ══════════════════════════════════════════════════════════════════════════
process.chdir(ROOT);
const CK_DIR = arg("checkpoints") ?? "C:/Users/ifikn/esmo-measure/w1/checkpoints";
const SEASONS = Number(arg("seasons") ?? 20);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bp9-slim-"));
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const SLIM = await imp("src/platform/persistence/saveSlim.js");

let pass = 0, fail = 0;
const fails = [];
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? `　${String(detail).slice(0, 300)}` : ""}`); }
};
let seq = 0;
function run(storage, steps, { quota = null, faults = [], clock, lastTx = null, templates = null } = {}) {
  const job = path.join(TMP, `job${++seq}.json`), out = path.join(TMP, `out${seq}.json`);
  fs.writeFileSync(job, JSON.stringify({ storage, steps, quota, faults, clock, lastTx, templates }));
  const r = spawnSync(process.execPath, [SELF, `--child=${job}`, `--out=${out}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26, timeout: 600000 });
  if (!fs.existsSync(out)) throw new Error(`子行程沒有輸出：${r.status} ${String(r.stderr).slice(0, 600)}`);
  const o = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(job); fs.rmSync(out);
  if (o.error) console.log(`   ⚠ 子行程例外：${o.error.split("\n")[0]}`);
  return o;
}
const step = (o, op) => o.steps.find((s) => s.op === op);
const steps = (o, op) => o.steps.filter((s) => s.op === op);
const canon = (o) => JSON.stringify(Object.keys(o ?? {}).sort().map((k) => [k, o[k]]));
const charsOf = (st) => Object.entries(st).reduce((n, [k, v]) => n + k.length + v.length, 0);
const loadCk = (name) => JSON.parse(fs.readFileSync(path.join(CK_DIR, name), "utf8"));

// ── §1 規則（純函式）────────────────────────────────────────────────────
console.log("\n§1 規則");
{
  const c = loadCk("027-end.json");
  const p = JSON.parse(c.storage[PROFILE_KEY]);
  const season = JSON.parse(c.storage[SEASON_KEY]).history;
  const cs = SLIM.slimCsHistory(p.csHistory);
  ck("CS 前 5 場與原本同一個物件（完整）", cs.slice(0, 5).every((e, i) => e === p.csHistory[i]));
  ck("CS 第 6 場起都是摘要", cs.slice(5).every((e) => e.archived === "summary" && !("analytics" in e) && !("roundDetails" in e)), cs.length);
  const keep = ["matchId", "mapId", "mapName", "winner", "ourScore", "enemyScore", "players", "opponents", "mvp", "rewards", "transactionId", "recordedAt", "tacticName"];
  ck("CS 摘要保留比分、地圖、結果、主要選手數據與獎勵", cs.slice(5).every((e, i) => keep.every((k) => JSON.stringify(e[k]) === JSON.stringify(p.csHistory[i + 5][k]))));
  const ss = SLIM.slimSeasonHistory(season);
  ck("Season 最後 10 場保留 timeline", ss.slice(-10).every((r, i) => r === season[season.length - 10 + i]));
  ck("Season 較舊的拿掉 timeline，其餘欄位不變", ss.slice(0, -10).every((r, i) => r.timeline.length === 0 && JSON.stringify({ ...r, timeline: 0, timelineArchived: 0 }) === JSON.stringify({ ...season[i], timeline: 0, timelineArchived: 0 })));
  const led = SLIM.slimLedger(p.processedMatchTransactions);
  const lk = Object.keys(p.processedMatchTransactions);
  ck("帳本鍵一個都沒少、順序相同", JSON.stringify(Object.keys(led)) === JSON.stringify(lk), `${lk.length}`);
  ck("帳本最後 20 筆完整", lk.slice(-20).every((k) => led[k] === p.processedMatchTransactions[k]));
  const P = p.processedMatchTransactions;
  ck("帳本較舊的只留最小摘要：成立、場次、勝負、獎金、時間", lk.slice(0, -20).every((k) => led[k].archived === "summary" && !("players" in led[k]) && led[k].ok === P[k].ok && led[k].applied === P[k].applied && led[k].matchId === P[k].matchId && led[k].mode === P[k].mode && led[k].winner === P[k].metadata?.winner && led[k].money === P[k].team?.money && led[k].recordedAt === P[k].recordedAt));
  ck("帳本摘要每筆（含鍵）不超過 220 字元", lk.slice(0, -20).every((k) => k.length + JSON.stringify(led[k]).length <= 220), Math.max(...lk.slice(0, -20).map((k) => k.length + JSON.stringify(led[k]).length)));
  const set = SLIM.slimLedger(p.matchmaking.settlements);
  ck("結算鍵一個都沒少", JSON.stringify(Object.keys(set)) === JSON.stringify(Object.keys(p.matchmaking.settlements)));
  const SK = Object.keys(p.matchmaking.settlements), SP = p.matchmaking.settlements;
  ck("結算較舊的只留最小摘要，並記著對應的交易識別", SK.slice(0, -20).every((k) => set[k].archived === "summary" && set[k].ok === SP[k].ok && set[k].settled === SP[k].settled && set[k].winner === SP[k].winner && set[k].trace?.transactionId === SP[k].trace?.transactionId && set[k].trace?.sessionId === SP[k].trace?.sessionId && set[k].trace?.matchId === SP[k].trace?.matchId && k.length + JSON.stringify(set[k]).length <= 300));
  ck("重複套用結果相同（同一個參考）", SLIM.slimCsHistory(cs) === cs && SLIM.slimSeasonHistory(ss) === ss && SLIM.slimLedger(led) === led && SLIM.slimLedger(set) === set);
  ck("少於門檻時完全不動", SLIM.slimCsHistory(p.csHistory.slice(0, 5)) !== null && SLIM.slimLedger({ a: 1 }) !== null && SLIM.slimCsHistory(p.csHistory.slice(0, 5)).every((e, i) => e === p.csHistory[i]));
}

// ── §2 實際節省 ───────────────────────────────────────────────────────────
console.log("\n§2 W1 真模擬存檔的實際節省");
const savings = [];
for (const name of ["019-every10-f100.json", "024-every10-f110.json", "027-end.json"]) {
  const c = loadCk(name);
  const before = charsOf(c.storage);
  const o = run(c.storage, [{ op: "boot" }, { op: "migrate", confirmed: true }], { clock: c.clock + 1000 });
  const after = charsOf(o.storage);
  savings.push({ name, day: c.day, before, after, saved: before - after, pct: +(100 * (before - after) / before).toFixed(1) });
  console.log(`   ${name} 第 ${c.day} 天：${before.toLocaleString()} → ${after.toLocaleString()}（省 ${(before - after).toLocaleString()}，${(100 * (before - after) / before).toFixed(1)}%；上限的 ${(100 * after / CHROME_QUOTA).toFixed(1)}%）`);
  ck(`${name}：整理後低於上限的 40%`, after < CHROME_QUOTA * 0.4, after);
}

// ── §3 遷移與冷啟動（第 254 天，Chrome 配額）───────────────────────────────
console.log("\n§3 遷移與冷啟動");
const C24 = loadCk("024-every10-f110.json");
const Q = CHROME_QUOTA;
let migrated = null;
{
  const orig = C24.storage;
  const b0 = run(orig, [{ op: "boot" }, { op: "facts" }], { quota: Q, clock: C24.clock });
  ck("舊版近滿存檔開機判定要整理", step(b0, "boot").state === "needed", step(b0, "boot").state);
  ck("開機判定不寫任何東西", canon(b0.storage) === canon(orig), b0.writes.join(","));
  const refused = run(orig, [{ op: "boot" }, { op: "migrate", confirmed: false }], { quota: Q, clock: C24.clock });
  ck("沒確認備份就拒絕", step(refused, "migrate").r.ok === false && step(refused, "migrate").r.stage === "no_backup");
  ck("拒絕時存檔逐位元不變", canon(refused.storage) === canon(orig));
  const stale = run(orig, [{ op: "boot" }, { op: "migrate", confirmed: true, fingerprint: "stale" }], { quota: Q, clock: C24.clock });
  ck("備份之後存檔變了：拒絕（backup_stale）且不寫、不凍結", step(stale, "migrate").r.stage === "backup_stale" && canon(stale.storage) === canon(orig) && step(stale, "migrate").frozenNow === false, JSON.stringify(step(stale, "migrate")));
  const nofp = run(orig, [{ op: "boot" }, { op: "migrate", confirmed: true, fingerprint: "none" }], { quota: Q, clock: C24.clock });
  ck("勾選了但沒有備份指紋：拒絕且不寫", step(nofp, "migrate").r.stage === "no_backup" && canon(nofp.storage) === canon(orig));
  const sab = run(orig, [{ op: "boot" }, { op: "staleAfterBackup" }], { quota: Q, clock: C24.clock });
  ck("真實順序：下載備份後存檔又被寫入，開始整理被拒（backup_stale）、不再寫、不凍結", step(sab, "staleAfterBackup").stage === "backup_stale" && step(sab, "staleAfterBackup").unchanged && step(sab, "staleAfterBackup").frozenNow === false, JSON.stringify(step(sab, "staleAfterBackup")));
  const m = run(orig, [{ op: "boot" }, { op: "migrate", confirmed: true }, { op: "saveAfter" }, { op: "facts" }], { quota: Q, clock: C24.clock });
  ck("確認後整理成功", step(m, "migrate").r.ok, JSON.stringify(step(m, "migrate").r));
  ck("寫入順序：先 Season 再 profile", m.writes.filter((w) => w.startsWith("set:")).join(",") === `set:${SEASON_KEY},set:${PROFILE_KEY}`, m.writes.join(","));
  ck("整理後重新整理前：save() 不寫（凍結）", step(m, "saveAfter").ok === false && step(m, "saveAfter").unchanged, JSON.stringify(step(m, "saveAfter")));
  const f0 = step(b0, "facts"), f1 = step(m, "facts");
  ck("整理後還沒驗證：標記 verified=false 且帶比對雜湊", f1.slim?.verified === false && f1.slim?.expect === true, JSON.stringify(f1.slim));
  ck("資金、天數、賽程不變", f1.funds === f0.funds && f1.day === f0.day && f1.fixtures === f0.fixtures);
  ck("帳本鍵、結算鍵逐一相同", JSON.stringify(f1.ledgerKeys) === JSON.stringify(f0.ledgerKeys) && JSON.stringify(f1.settleKeys) === JSON.stringify(f0.settleKeys), `${f0.ledgerKeys.length}/${f1.ledgerKeys.length}`);
  ck("熟練逐位元不變", f1.hero === f0.hero);
  ck("CS 場數不變、25 場摘要化", f1.cs === f0.cs && f1.csArchived === f0.cs - 5, `${f1.cs}/${f1.csArchived}`);
  //  冷啟動
  const cold = run(m.storage, [{ op: "boot" }, { op: "facts" }, { op: "storeView" }, { op: "plan" }], { quota: Q, clock: m.clock + 5000 });
  ck("冷啟動驗證通過", step(cold, "boot").state === "none" && step(cold, "boot").r.verify?.ok === true, JSON.stringify(step(cold, "boot").r.verify ?? step(cold, "boot")));
  const f2 = step(cold, "facts");
  ck("冷啟動後標記 verified=true，拿掉比對雜湊", f2.slim?.verified === true && f2.slim?.expect === false && f2.slim?.mode === "migrated", JSON.stringify(f2.slim));
  ck("冷啟動存檔後：資金、賽程、帳本鍵、熟練仍不變", f2.funds === f0.funds && f2.fixtures === f0.fixtures && JSON.stringify(f2.ledgerKeys) === JSON.stringify(f0.ledgerKeys) && f2.hero === f0.hero);
  ck("冷啟動後 Season 也啟用規則", step(cold, "storeView").seasonActive === true && step(cold, "storeView").seasonTimelines === 10, JSON.stringify(step(cold, "storeView")));
  ck("再次遷移不變：計畫為 0 筆", step(cold, "plan").plan?.total === 0, JSON.stringify(step(cold, "plan").plan?.changes));
  const again = run(cold.storage, [{ op: "boot" }, { op: "facts" }], { quota: Q, clock: cold.clock + 5000 });
  ck("第二次開機什麼都不寫", again.writes.length === 0, again.writes.join(","));
  ck("第二次開機狀態仍是完成", step(again, "boot").state === "none");
  migrated = cold;
}

const TT = () => {
  const c = loadCk("027-end.json");
  const p = JSON.parse(c.storage[PROFILE_KEY]);
  const season = JSON.parse(c.storage[SEASON_KEY]).history;
  const cs = [...p.csHistory].sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
  const sr = [...season].sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
  return { tx: c.lastTx, cs: { ...cs, transactionId: undefined, recordedAt: undefined }, season: { ...sr, commitKey: undefined }, settle: Object.values(p.matchmaking.settlements).slice(-1)[0] };
};
// ── §4 中斷與失敗 ─────────────────────────────────────────────────────────
console.log("\n§4 中斷與寫入失敗");
{
  const orig = C24.storage;
  const s1 = run(orig, [{ op: "boot" }, { op: "migrate", confirmed: true }], { quota: Q, faults: [{ key: SEASON_KEY, times: 1 }], clock: C24.clock });
  ck("Season 寫入失敗：回報失敗", step(s1, "migrate").r.ok === false && step(s1, "migrate").r.stage === "season");
  ck("Season 寫入失敗：存檔逐位元不變", canon(s1.storage) === canon(orig));
  ck("Season 寫入失敗：不凍結（可以照常存檔）", step(s1, "migrate").frozenNow === false && step(s1, "migrate").r.frozen === false);
  const s2 = run(orig, [{ op: "boot" }, { op: "migrate", confirmed: true }], { quota: Q, faults: [{ key: PROFILE_KEY, times: 1 }], clock: C24.clock });
  ck("profile 寫入失敗：回報失敗", step(s2, "migrate").r.ok === false && step(s2, "migrate").r.stage === "profile");
  ck("profile 寫入失敗：profile 與熟練逐位元不變", s2.storage[PROFILE_KEY] === orig[PROFILE_KEY] && s2.storage[HERO_KEY] === orig[HERO_KEY]);
  ck("profile 寫入失敗：保持凍結並回報要重新整理", step(s2, "migrate").frozenNow === true && step(s2, "migrate").r.frozen === true);
  //  ＝寫完 Season 就中斷：下次開機還是要整理，再整理一次要成功、冷啟動要通過。
  const r2 = run(s2.storage, [{ op: "boot" }, { op: "migrate", confirmed: true }], { quota: Q, clock: s2.clock + 1000 });
  ck("中斷後重開：仍判定要整理，並能整理成功", step(r2, "boot").state === "needed" && step(r2, "migrate").r.ok, JSON.stringify(step(r2, "migrate").r));
  const r3 = run(r2.storage, [{ op: "boot" }, { op: "facts" }], { quota: Q, clock: r2.clock + 1000 });
  ck("中斷後重做：冷啟動驗證通過", step(r3, "boot").r.verify?.ok === true, JSON.stringify(step(r3, "boot").r.verify));
  ck("中斷後重做：與一次做完的結果相同（帳本、CS、Season）", (() => {
    const a = JSON.parse(r3.storage[PROFILE_KEY]), b = JSON.parse(migrated.storage[PROFILE_KEY]);
    return JSON.stringify(a.processedMatchTransactions) === JSON.stringify(b.processedMatchTransactions) && JSON.stringify(a.csHistory) === JSON.stringify(b.csHistory) && r3.storage[SEASON_KEY] === migrated.storage[SEASON_KEY];
  })());
  //  寫完 profile、還沒重新整理就關掉：下次開機就是冷啟動驗證。（§3 的 cold 就是這個情況）
  //  磁碟在寫入與驗證之間被動過：要抓到，標記失敗，不再自動改動。
  const m = run(orig, [{ op: "boot" }, { op: "migrate", confirmed: true }], { quota: Q, clock: C24.clock });
  const t = run(m.storage, [{ op: "tamperDisk" }, { op: "boot" }, { op: "facts" }], { quota: Q, clock: m.clock + 1000 });
  ck("磁碟被動過：冷啟動比對抓到", step(t, "boot").state === "failed" && step(t, "boot").r.verify?.mismatches?.includes("ledgerKeys"), JSON.stringify(step(t, "boot").r.verify));
  ck("比對失敗：標記 failed，之後開機不再寫", (() => { const t2 = run(t.storage, [{ op: "boot" }], { quota: Q, clock: t.clock + 1000 }); return step(t2, "boot").state === "failed" && t2.writes.length === 0; })());
  {
    const before = step(t, "facts");
    const g = run(t.storage, [{ op: "boot" }, { op: "grow", matches: 6, tag: "f" }, { op: "facts" }, { op: "storeView" }], { quota: Q, clock: t.clock + 2000, templates: TT() });
    const after = step(g, "facts");
    const gp = JSON.parse(g.storage[PROFILE_KEY]), tp = JSON.parse(t.storage[PROFILE_KEY]);
    const archivedCount = (o) => Object.values(o ?? {}).filter((r) => r?.archived).length;
    //  ⚠ 前 11 筆（新加的 6 場＋原本完整的 5 場）都必須是完整的；帳本與結算的摘要數不得增加（Review 第 2 輪 n1：只比 <= 會恆真）。
    ck("比對失敗之後：不再套用規則（新比賽與原本完整的 CS 都不摘要化、帳本結算不再摘要化、Season 不精簡）",
      step(g, "storeView").seasonActive === false && gp.meta.saveSlim.failed === true
      && gp.csHistory.slice(0, 11).every((e) => e.archived !== "summary")
      && archivedCount(gp.processedMatchTransactions) === archivedCount(tp.processedMatchTransactions)
      && archivedCount(gp.matchmaking?.settlements) === archivedCount(tp.matchmaking?.settlements),
      JSON.stringify({ head: gp.csHistory.slice(0, 11).map((e) => e.archived ?? "-"), tx: [archivedCount(tp.processedMatchTransactions), archivedCount(gp.processedMatchTransactions)], season: step(g, "storeView").seasonActive }));
    const rm = run(t.storage, [{ op: "boot" }, { op: "remigrate" }], { quota: Q, clock: t.clock + 3000 });
    ck("比對失敗的存檔不會被再次整理（already_marked）", step(rm, "remigrate").stage === "already_marked" && canon(rm.storage) === canon(t.storage), JSON.stringify(step(rm, "remigrate")));
  }
  //  驗證時存檔寫不進去（標記 verified 失敗）：下次開機會再驗一次。
  const v = run(m.storage, [{ op: "boot" }, { op: "facts" }], { quota: Q, faults: [{ key: PROFILE_KEY, times: 1 }], clock: m.clock + 1000 });
  const v2 = run(v.storage, [{ op: "boot" }, { op: "facts" }], { quota: Q, clock: v.clock + 1000 });
  ck("驗證後標記寫不進去：下次開機再驗並完成", step(v, "facts").slim?.verified === false && step(v2, "facts").slim?.verified === true, `${JSON.stringify(step(v, "facts").slim)} / ${JSON.stringify(step(v2, "facts").slim)}`);
}

// ── §5 防重 ──────────────────────────────────────────────────────────────
console.log("\n§5 整理後的防重");
{
  const r = run(migrated.storage, [{ op: "boot" }, { op: "resend" }], { quota: Q, clock: migrated.clock + 1000, lastTx: C24.lastTx });
  const s = step(r, "resend");
  ck("舊交易（已摘要化）再送：判定已入帳", s.res[0].archived === "summary" && s.res[0].alreadyApplied === true, JSON.stringify(s.res[0]));
  ck("中間那筆再送：判定已入帳", s.res[1].alreadyApplied === true, JSON.stringify(s.res[1]));
  ck("最新那筆再送：判定已入帳", s.res[2].alreadyApplied === true && !s.res[2].archived, JSON.stringify(s.res[2]));
  ck("再送三筆：資金、帳本筆數都不動", s.fundsSame && s.ledgerSame);
}

// ── §6 備份與還原 ────────────────────────────────────────────────────────
console.log("\n§6 備份與還原");
{
  const orig = C24.storage;
  const file = path.join(TMP, "backup.json");
  const b = run(orig, [{ op: "boot" }, { op: "backup", file }], { quota: Q, clock: C24.clock });
  ck("匯出成功、包含存檔的鍵", step(b, "backup").ok && step(b, "backup").keys.includes(PROFILE_KEY) && step(b, "backup").keys.includes(SEASON_KEY) && step(b, "backup").keys.includes(HERO_KEY), JSON.stringify(step(b, "backup")));
  ck("匯出不寫 localStorage", b.writes.length === 0 && canon(b.storage) === canon(orig));
  const m = run(orig, [{ op: "boot" }, { op: "migrate", confirmed: true }], { quota: Q, clock: C24.clock });
  const cold = run(m.storage, [{ op: "boot" }], { quota: Q, clock: m.clock + 1000 });
  const r = run(cold.storage, [{ op: "restore", file }], { quota: Q, clock: cold.clock + 1000 });
  ck("整理後還原：成功", step(r, "restore").ok, JSON.stringify(step(r, "restore")));
  ck("整理後還原：存檔鍵逐位元等於備份", step(r, "restore").matches === true);
  const save = (st) => Object.fromEntries(Object.entries(st).filter(([k]) => k.startsWith("esmo.")));
  ck("整理後還原：與匯出當下完全相同", canon(save(r.storage)) === canon(save(orig)));
  const rb = run(r.storage, [{ op: "boot" }], { quota: Q, clock: r.clock + 1000 });
  ck("還原後開機：又判定要整理（可以再整理一次）", step(rb, "boot").state === "needed");
  const m2 = run(r.storage, [{ op: "boot" }, { op: "migrate", confirmed: true }], { quota: Q, clock: m.clock });
  ck("再整理一次：結果與第一次逐位元相同", m2.storage[PROFILE_KEY] === m.storage[PROFILE_KEY] && m2.storage[SEASON_KEY] === m.storage[SEASON_KEY]);
  //  改過的備份
  const bad = JSON.parse(fs.readFileSync(file, "utf8"));
  bad.keys[PROFILE_KEY] = bad.keys[PROFILE_KEY].replace(/"funds":\d+/, '"funds":999999999');
  const badFile = path.join(TMP, "bad.json"); fs.writeFileSync(badFile, JSON.stringify(bad));
  const rbad = run(cold.storage, [{ op: "restore", file: badFile }], { quota: Q, clock: cold.clock });
  ck("改過內容的備份被拒（SHA-256 對不上）", step(rbad, "restore").parsed === false && step(rbad, "restore").parseError === "digest_mismatch", JSON.stringify(step(rbad, "restore")));
  ck("被拒時目前存檔不變", step(rbad, "restore").unchanged === true);
  const notJson = path.join(TMP, "x.json"); fs.writeFileSync(notJson, "{not json");
  ck("不是備份檔被拒", step(run(cold.storage, [{ op: "restore", file: notJson }], { quota: Q }), "restore").parseError === "not_json");
  //  空間不夠：額外占掉空間，讓整份備份放不下。
  const crowded = { ...cold.storage, "other.app.data": "y".repeat(Q - charsOf(orig) + 2000) };
  const rq = run(crowded, [{ op: "restore", file }], { quota: Q, clock: cold.clock });
  ck("空間不夠還原：失敗並放回原樣", step(rq, "restore").ok === false && step(rq, "restore").rolledBack === true && step(rq, "restore").unchanged === true, JSON.stringify(step(rq, "restore")));
  const rq2 = run(crowded, [{ op: "boot" }, { op: "applyRestore", file }], { quota: Q, clock: cold.clock });
  ck("畫面的還原失敗但已放回原樣：解除凍結，可以繼續玩", step(rq2, "applyRestore").ok === false && step(rq2, "applyRestore").rolledBack === true && step(rq2, "applyRestore").frozenNow === false, JSON.stringify(step(rq2, "applyRestore")));
  const withQ = { ...cold.storage, "esmo.profile.v1.corrupt": "{broken" };
  const rk = run(withQ, [{ op: "restore", file }], { quota: Q, clock: cold.clock });
  ck("還原不刪備份裡沒有的隔離副本（*.corrupt）", step(rk, "restore").ok === true && rk.storage["esmo.profile.v1.corrupt"] === "{broken" && step(rk, "restore").matches === true, JSON.stringify(step(rk, "restore")));
}

// ── §7 寫入時持續套用 ────────────────────────────────────────────────────
console.log("\n§7 啟用後新比賽照規則；未啟用時與 P0-A 相同");
const T = (() => {
  const c = loadCk("027-end.json");
  const p = JSON.parse(c.storage[PROFILE_KEY]);
  const season = JSON.parse(c.storage[SEASON_KEY]).history;
  const settle = Object.values(p.matchmaking.settlements).slice(-1)[0];
  //  樣板挑最大的一筆（保守）。
  const cs = [...p.csHistory].sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
  const sr = [...season].sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
  return { tx: c.lastTx, cs: { ...cs, transactionId: undefined, recordedAt: undefined }, season: { ...sr, commitKey: undefined }, settle };
})();
{
  const g = run(migrated.storage, [{ op: "boot" }, { op: "grow", matches: 12, tag: "a" }, { op: "facts" }, { op: "storeView" }, { op: "plan" }], { quota: Q, clock: migrated.clock + 1000, templates: T });
  const f = step(g, "facts");
  ck("啟用後加 12 場：全部入帳", step(g, "grow").applied === 12, JSON.stringify(step(g, "grow")));
  ck("啟用後：CS 前 5 場完整、其餘摘要", f.cs === 30 && f.csArchived === 25, `${f.cs}/${f.csArchived}`);
  ck("啟用後：Season 只有最近 10 場有 timeline", step(g, "storeView").seasonTimelines === 10, step(g, "storeView").seasonTimelines);
  ck("啟用後：磁碟上已經是規則的結果（計畫 0 筆）", step(g, "plan").plan?.total === 0, JSON.stringify(step(g, "plan").plan?.changes));
  ck("啟用後：帳本鍵只增不減", f.ledgerKeys.length === step(run(migrated.storage, [{ op: "facts" }]), "facts").ledgerKeys.length + 12);
  //  未啟用：P0-A 行為（不摘要化）
  const small = loadCk("012-every10-f50.json");
  const n = run(small.storage, [{ op: "boot" }, { op: "grow", matches: 6, tag: "b" }, { op: "facts" }], { clock: small.clock + 1000, templates: T });
  ck("未啟用的存檔：開機判定要整理（前提成立）", step(n, "boot").state === "needed", step(n, "boot").state);
  const np = JSON.parse(n.storage[PROFILE_KEY]);
  const ns = JSON.parse(n.storage[SEASON_KEY]).history;
  ck("未啟用的存檔：新比賽不做任何摘要化（CS、帳本、結算、Season）", step(n, "facts").csArchived === 0
    && Object.values(np.processedMatchTransactions).every((r) => !r.archived) && Object.values(np.matchmaking?.settlements ?? {}).every((r) => !r.archived)
    && ns.filter((r) => (r.timeline ?? []).length > 0).length === ns.length, `${step(n, "facts").csArchived}`);
  //  新玩家：沒有存檔。⚠ Owner 2026-11-07：沒有授權就不啟用（只檢查、不寫）。
  const fresh = run({}, [{ op: "boot" }, { op: "facts" }, { op: "storeView" }], { clock: 1800000000000 });
  ck("新玩家：不啟用規則、記憶體裡沒有標記", step(fresh, "boot").state === "none" && step(fresh, "storeView").slim === null && step(fresh, "storeView").seasonActive === false, JSON.stringify(step(fresh, "storeView")));
  ck("新玩家第一次開機：localStorage 維持全空", Object.keys(fresh.storage).length === 0, Object.keys(fresh.storage).join(","));
}

// ── §7b 首次授權（Owner 2026-11-07）─────────────────────────────────────
console.log("\n§7b 第一次真的摘要化之前一定要備份並確認；授權後才自動維持精簡");
{
  const archivedCount = (o) => Object.values(o ?? {}).filter((r) => r?.archived).length;
  const noSummaries = (storage) => {
    const p = JSON.parse(storage[PROFILE_KEY]);
    const season = storage[SEASON_KEY] ? JSON.parse(storage[SEASON_KEY]).history : [];
    return { cs: (p.csHistory ?? []).filter((e) => e.archived).length, tx: archivedCount(p.processedMatchTransactions), settle: archivedCount(p.matchmaking?.settlements),
      seasonStripped: season.filter((r) => r.timelineArchived).length, mark: p.meta?.saveSlim ?? null };
  };
  //  ① 小存檔（第 1 場之後）：現在沒有東西要摘要。
  const small = loadCk("002-first-match.json");
  const b = run(small.storage, [{ op: "boot" }, { op: "storeView" }, { op: "plan" }], { clock: small.clock + 1000 });
  ck("小存檔：前提成立（計畫 0 筆）", step(b, "plan").plan?.total === 0, JSON.stringify(step(b, "plan").plan?.changes));
  ck("小存檔開機：不啟用、不寫任何東西", step(b, "boot").state === "none" && step(b, "storeView").slim === null && step(b, "storeView").seasonActive === false && b.writes.length === 0, `${b.writes.join(",")} ${JSON.stringify(step(b, "storeView").slim)}`);
  //  ② 不授權就一直長：超過 5／10／20 筆門檻也不得摘要化（行為與 P0-A 相同）。
  const g = run(small.storage, [{ op: "boot" }, { op: "grow", matches: 32, tag: "u" }, { op: "storeView" }], { clock: small.clock + 2000, templates: T });
  const gs = noSummaries(g.storage);
  ck("未授權加 32 場：全部入帳", step(g, "grow").applied === 32, JSON.stringify(step(g, "grow")));
  ck("未授權加 32 場：CS、帳本、結算、Season 都沒有任何摘要化，也沒有標記", gs.cs === 0 && gs.tx === 0 && gs.settle === 0 && gs.seasonStripped === 0 && gs.mark === null, JSON.stringify(gs));
  const gp = JSON.parse(g.storage[PROFILE_KEY]);
  ck("未授權加 32 場：前提成立（已超過門檻：CS > 5、帳本 > 20）", (gp.csHistory ?? []).length > 5 && Object.keys(gp.processedMatchTransactions ?? {}).length > 20, `${(gp.csHistory ?? []).length}/${Object.keys(gp.processedMatchTransactions ?? {}).length}`);
  //  ③ 再開機：這時才判定要整理（走備份＋確認）。沒確認就拒絕。
  const n = run(g.storage, [{ op: "boot" }, { op: "migrate", confirmed: false }], { clock: g.clock + 1000 });
  ck("長大之後開機：判定要整理（needed），不自動做", step(n, "boot").state === "needed" && canon(n.storage) === canon(g.storage), step(n, "boot").state);
  ck("長大之後：沒確認備份就拒絕", step(n, "migrate").r.stage === "no_backup");
  //  ④ 備份並確認 → 整理 → 冷啟動 → 之後自動維持精簡。
  const m = run(g.storage, [{ op: "boot" }, { op: "migrate", confirmed: true }], { clock: g.clock + 1000 });
  const c = run(m.storage, [{ op: "boot" }, { op: "grow", matches: 8, tag: "v" }, { op: "storeView" }], { clock: m.clock + 1000, templates: T });
  const cp = JSON.parse(c.storage[PROFILE_KEY]);
  ck("授權後：冷啟動驗證通過、標記 migrated", step(c, "boot").r.verify?.ok === true && cp.meta.saveSlim?.mode === "migrated" && cp.meta.saveSlim?.verified === true, JSON.stringify(step(c, "boot").r.verify));
  ck("授權後：新比賽自動照規則（CS 前 5 場完整、其餘摘要；帳本最後 20 筆完整）",
    cp.csHistory.slice(0, 5).every((e) => !e.archived) && cp.csHistory.slice(5).every((e) => e.archived === "summary")
    && Object.values(cp.processedMatchTransactions).slice(-20).every((r) => !r.archived) && Object.values(cp.processedMatchTransactions).slice(0, -20).every((r) => r.archived === "summary")
    && step(c, "storeView").seasonActive === true,
    `${cp.csHistory.map((e) => e.archived ? "s" : "F").join("")}`);
  //  ⑤ 舊版留下的未授權標記（new／auto）：不得當成授權。
  for (const mode of ["auto", "new"]) {
    const legacy = run(g.storage, [{ op: "setMark", mark: { v: 1, at: 1, mode, verified: true } }, { op: "boot" }, { op: "storeView" }, { op: "grow", matches: 3, tag: `l${mode}` }], { clock: g.clock + 3000, templates: T });
    const ls = noSummaries(legacy.storage);
    ck(`舊版 ${mode} 標記：不套用規則、判定要整理、新比賽不摘要化`, step(legacy, "boot").state === "needed" && step(legacy, "storeView").seasonActive === false && ls.cs === 0 && ls.tx === 0 && ls.settle === 0 && ls.seasonStripped === 0, JSON.stringify({ boot: step(legacy, "boot").state, ls }));
    const lm = run(legacy.storage, [{ op: "boot" }, { op: "migrate", confirmed: true }], { clock: legacy.clock + 1000 });
    const lc = run(lm.storage, [{ op: "boot" }], { clock: lm.clock + 1000 });
    ck(`舊版 ${mode} 標記：備份並確認後可以整理，冷啟動通過並換成 migrated`, step(lm, "migrate").r.ok && step(lc, "boot").r.verify?.ok === true && JSON.parse(lc.storage[PROFILE_KEY]).meta.saveSlim.mode === "migrated", JSON.stringify(step(lm, "migrate").r));
  }
  //  ⑥ 授權過的玩家開新局：新局沒有授權，規則要關掉。
  const ng = run(c.storage, [{ op: "boot" }, { op: "newGame" }, { op: "grow", matches: 30, tag: "w" }, { op: "storeView" }], { clock: c.clock + 1000, templates: T });
  const ns = noSummaries(ng.storage);
  ck("授權後開新局：前提成立（新局真的開了、回到第 1 天附近）", step(ng, "newGame").started !== false && step(ng, "newGame").day < 30, JSON.stringify(step(ng, "newGame")));
  ck("授權後開新局：記憶體沒有標記、Season 規則關閉", step(ng, "newGame").slim === null && step(ng, "newGame").seasonActive === false, JSON.stringify(step(ng, "newGame")));
  ck("授權後開新局再打 30 場：沒有任何摘要化（要重新授權）", ns.cs === 0 && ns.tx === 0 && ns.settle === 0 && ns.seasonStripped === 0 && ns.mark === null, JSON.stringify(ns));
}

// ── §10 兩個分頁（Owner 2026-11-07 第 3 項）────────────────────────────────
//  同一份存檔開在兩個分頁。不能發生：兩次不可逆整理互相覆寫成不一致的存檔、
//  或舊分頁把整理後的存檔蓋成「資料比整理前少」的樣子。
console.log("\n§10 兩個分頁同時開著同一份存檔");
{
  const S0 = C24.storage;
  const base = JSON.parse(S0[PROFILE_KEY]);
  const sameCore = (storage) => {
    const p = JSON.parse(storage[PROFILE_KEY]);
    return p.finance?.funds === base.finance?.funds && p.meta?.days === base.meta?.days
      && JSON.stringify(Object.keys(p.processedMatchTransactions ?? {})) === JSON.stringify(Object.keys(base.processedMatchTransactions ?? {}))
      && JSON.stringify(Object.keys(p.matchmaking?.settlements ?? {})) === JSON.stringify(Object.keys(base.matchmaking?.settlements ?? {}))
      && (p.csHistory ?? []).length === (base.csHistory ?? []).length && storage[HERO_KEY] === S0[HERO_KEY];
  };
  //  分頁 A 整理完成（寫進磁碟，還沒重新整理）。
  const A = run(S0, [{ op: "boot" }, { op: "migrate", confirmed: true }], { quota: Q, clock: C24.clock });
  const S1 = A.storage;
  ck("前提：分頁 A 整理成功", step(A, "migrate").r.ok);
  //  ① 分頁 B 在 A 之前就下載了備份，A 整理後 B 也按「開始整理」：指紋對不上，拒絕、不寫、不凍結。
  const B1 = run(S0, [{ op: "boot" }, { op: "rememberFp" }, { op: "replaceDisk", storage: S1 }, { op: "migrateSavedFp" }], { quota: Q, clock: C24.clock + 500 });
  ck("B 拿舊備份接著整理：拒絕（backup_stale），磁碟仍是 A 的結果、B 沒凍結", step(B1, "migrateSavedFp").r.stage === "backup_stale" && canon(B1.storage) === canon(S1) && step(B1, "migrateSavedFp").frozenNow === false, JSON.stringify(step(B1, "migrateSavedFp")));
  //  ② 已整理且有標記的存檔，B 重新下載備份後再整理：already_marked，不會第二次摘要化。
  const B2 = run(S0, [{ op: "boot" }, { op: "replaceDisk", storage: S1 }, { op: "rememberFp" }, { op: "migrateSavedFp" }], { quota: Q, clock: C24.clock + 600 });
  ck("B 對 A 已整理的存檔重新備份再整理：拒絕（already_marked），磁碟不變", step(B2, "migrateSavedFp").r.stage === "already_marked" && canon(B2.storage) === canon(S1), JSON.stringify(step(B2, "migrateSavedFp")));
  //  ③ 真的同時：兩個分頁都在對方寫入前通過指紋檢查（瀏覽器跨分頁同步有延遲）。
  //     兩次整理都來自同一份磁碟，結果除了時間戳記之外必須逐位元相同，後寫的蓋掉先寫的也一致。
  const A2 = run(S0, [{ op: "boot" }, { op: "migrate", confirmed: true }], { quota: Q, clock: C24.clock + 99_000 });
  const stripAt = (raw) => { const p = JSON.parse(raw); return JSON.stringify({ ...p, meta: { ...p.meta, saveSlim: { ...p.meta.saveSlim, at: 0 } } }); };
  ck("兩個分頁同時整理：profile 除了時間戳記逐位元相同、Season 逐位元相同", stripAt(A2.storage[PROFILE_KEY]) === stripAt(S1[PROFILE_KEY]) && A2.storage[SEASON_KEY] === S1[SEASON_KEY]);
  const mixed = { ...S1, [PROFILE_KEY]: A2.storage[PROFILE_KEY] };   // A 的 Season ＋ B 的 profile
  const mixedBoot = run(mixed, [{ op: "boot" }], { quota: Q, clock: C24.clock + 100_000 });
  ck("兩個分頁同時整理、交錯落盤：冷啟動驗證通過", step(mixedBoot, "boot").r.verify?.ok === true, JSON.stringify(step(mixedBoot, "boot").r.verify));
  //  ④ A 整理後、重新整理前，B（記憶體還是整理前的完整資料）照常存檔：B 的完整 profile 蓋回去。
  const B4 = run(S0, [{ op: "boot" }, { op: "replaceDisk", storage: S1 }, { op: "saveNow" }], { quota: Q, clock: C24.clock + 700 });
  const after = run(B4.storage, [{ op: "boot" }, { op: "facts" }], { quota: Q, clock: C24.clock + 800 });
  const ap = JSON.parse(after.storage[PROFILE_KEY]);
  ck("舊分頁蓋回完整存檔後 A 冷啟動：不是 failed，回到「要整理」，沒有標記", step(after, "boot").state === "needed" && !ap.meta?.saveSlim, `${step(after, "boot").state} ${JSON.stringify(ap.meta?.saveSlim ?? null)}`);
  ck("舊分頁蓋回後：profile 的資金、天數、帳本鍵、結算鍵、CS 場數（全部完整）與熟練都與整理前相同", sameCore(after.storage) && (ap.csHistory ?? []).filter((e) => e.archived).length === 0);
  //  Review m1：舊分頁只寫 profile，Season 停在 A 已授權、已備份的摘要狀態（不是遺失，是玩家同意過的整理）。
  ck("舊分頁蓋回後：Season 停在 A 已授權的整理結果", after.storage[SEASON_KEY] === S1[SEASON_KEY]);
  //  Review m2：反過來，舊分頁只寫了 Season（profile 還是 A 的、帶未驗證標記）。
  //  ⚠ Review 預測會變 failed；實測不會：驗證比的是 Season「拿掉 timeline 之後的內容」與「最後 10 場完整內容」，
  //    完整版在這兩項與整理版相同，只是多了 timeline（＝資料比整理版多）。所以驗證通過，下次寫 Season 時依已授權規則再精簡。
  //    這條斷言釘住實際行為：通過、Season 原樣是完整的、帳本鍵與熟練不變。
  const B5 = { ...S1, [SEASON_KEY]: S0[SEASON_KEY] };
  const b5 = run(B5, [{ op: "boot" }, { op: "facts" }, { op: "storeView" }], { quota: Q, clock: C24.clock + 1100 });
  ck("舊分頁只寫回 Season：冷啟動驗證通過、標記 verified（完整 Season 是整理版的超集）", step(b5, "boot").r?.verify?.ok === true && step(b5, "facts").slim?.verified === true && !step(b5, "facts").slim?.failed, JSON.stringify(step(b5, "boot").r?.verify ?? step(b5, "boot")));
  ck("舊分頁只寫回 Season：開機不改 Season（仍是完整版）、帳本鍵與熟練不變（沒有資料比整理前少）", b5.storage[SEASON_KEY] === S0[SEASON_KEY] && JSON.stringify(step(b5, "facts").ledgerKeys) === JSON.stringify(Object.keys(base.processedMatchTransactions ?? {})) && b5.storage[HERO_KEY] === S0[HERO_KEY]);
  ck("舊分頁只寫回 Season：規則已啟用，之後寫 Season 會依授權精簡", step(b5, "storeView").seasonActive === true);
  ck("舊分頁蓋回後：重新備份並確認可以再整理，冷啟動通過", (() => {
    const m = run(after.storage, [{ op: "boot" }, { op: "migrate", confirmed: true }], { quota: Q, clock: C24.clock + 900 });
    const c = run(m.storage, [{ op: "boot" }], { quota: Q, clock: C24.clock + 1000 });
    return step(m, "migrate").r.ok && step(c, "boot").r.verify?.ok === true && sameCore(c.storage);
  })());
}

// ── §8 輕量容量壓力：N 季 ─────────────────────────────────────────────────
console.log(`\n§8 輕量容量壓力（${SEASONS} 季，每季 136 場：MOBA＋CS＋Season＋結算同時增加）`);
{
  const perSeason = 136;
  const g = run(migrated.storage, [{ op: "boot" }, { op: "grow", matches: perSeason * SEASONS, tag: "s", every: perSeason }], { quota: Q, clock: migrated.clock + 1000, templates: T });
  const s = step(g, "grow");
  const peak = Math.max(...s.series.map((x) => x.chars));
  console.log(`   每季末總量：${s.series.map((x) => (x.chars / 1e6).toFixed(2)).join(" → ")} M`);
  ck(`${SEASONS} 季全部入帳`, s.applied === perSeason * SEASONS, s.applied);
  ck(`${SEASONS} 季沒有任何寫入失敗`, s.writesFailed === 0 && s.okSave, `${s.writesFailed}`);
  ck(`${SEASONS} 季最高總量低於上限的 60%`, peak < Q * 0.6, peak);
  const growth = (s.series.at(-1).chars - s.series[0].chars) / Math.max(1, s.series.length - 1);
  console.log(`   每季淨增約 ${Math.round(growth).toLocaleString()} 字元（只剩帳本與結算的鍵與摘要在長）`);
  ck("每季淨增低於 60,000 字元", growth < 60000, Math.round(growth));
  fs.writeFileSync(path.join(TMP, "stress.json"), JSON.stringify(s.series));
}

// ── §9 P0-A 保護與「已滿」────────────────────────────────────────────────
console.log("\n§9 整理後清掉「已滿」");
{
  const m = run(C24.storage, [{ op: "boot" }, { op: "alertFull" }, { op: "migrate", confirmed: true }], { quota: Q, clock: C24.clock });
  const cold = run(m.storage, [{ op: "boot" }, { op: "readAlert" }], { quota: Q, clock: m.clock + 1000 });
  ck("整理前提示記著已滿", JSON.parse(m.storage[ALERT_KEY] ?? "null")?.full === true);
  ck("冷啟動驗證後提示不再說已滿（TD-BP9-14）", step(cold, "readAlert").alert?.full === false && step(cold, "readAlert").quotaHit === false, JSON.stringify(step(cold, "readAlert")));
}

console.log(`\n節省：${JSON.stringify(savings)}`);
console.log(`\nBP-9 P0-B save slim：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log(`紅：${fails.join("｜")}`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
