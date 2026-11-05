#!/usr/bin/env node
// ============================================================================
//  tools/check_bp9_commit_p0a.mjs — BP-9 P0-A：比賽提交的故障注入
//
//    node tools/check_bp9_commit_p0a.mjs [--prep-dir=<資料夾>]
//
//  --prep-dir 可重用上一次的真模擬結果（放在 repo 外）。沒給就重跑，約 2–4 分鐘。
//
//  ── 這一支驗什麼 ──────────────────────────────────────────────────
//  Owner 要求：配額不足、每個寫入邊界失敗、中途重新整理、同場重試，都不能重複入帳、
//  重複熟練或產生矛盾賽果。所以：
//    · 賽果來自真模擬（MOBA 走 LogicEngine，CS 走 simulateFps），各打兩份，
//      第二份當作「同一場重打、結果不同」。
//    · 先跑一次正常提交，記下**每一次** localStorage 寫入。
//    · §2 對每一次寫入注入失敗（只失敗一次、之後全部失敗兩種）。
//    · §3 對每一次寫入後的磁碟內容，開新行程冷啟動（＝當下重新整理），再重打。
//    · 新行程才是真的重新整理：store 是 import 時讀磁碟的，同一個行程驗不到。
//
//  ⚠ useBattleFeed 是 React hook，node 跑不到，所以 §0 掃原始碼確認它只走 commitMobaMatch，
//    真實畫面流程交給 browser_check_bp9_commit_p0a。
//  ⚠ §11 的異常是這裡手動做出來的舊版壞狀態，只驗「偵測得到、不會自動修」。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

const PROFILE_KEY = "esmo.profile.v1";
const HERO_KEY = "esmo.heroProgress.v2";
const SEASON_KEY = "esmo.season.v1";
const JOURNAL_KEY = "esmo.commit.journal.v1";
const ALERT_KEY = "esmo.commit.alert.v1";
const AUDIT_KEY = "esmo.commit.audit.v1";

// ── 可以注入故障的假 localStorage（一定要在 import store 之前）──────────────
function installStorage(initial = {}, initialSession = {}) {
  const map = new Map(Object.entries(initial));
  const sess = new Map(Object.entries(initialSession));
  const ctl = { map, sess, trace: [], snapshots: [], keep: false, armed: null, armedKey: null, sets: 0, quota: null };
  const used = () => { let n = 0; for (const [k, v] of map) n += k.length + v.length; return n; };
  ctl.used = used;
  const quotaError = () => Object.assign(new Error("QuotaExceededError (injected)"), { name: "QuotaExceededError" });
  const remember = () => { if (ctl.keep) ctl.snapshots.push({ storage: Object.fromEntries(map), session: Object.fromEntries(sess) }); };
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      const s = String(v);
      if (ctl.armedKey?.key === k && ctl.armedKey.times > 0) {
        ctl.armedKey.times -= 1;
        ctl.trace.push({ op: "fail", key: k, size: s.length });
        throw quotaError();
      }
      if (ctl.armed) {
        ctl.sets += 1;
        const hit = ctl.armed.mode === "sticky" ? ctl.sets >= ctl.armed.at : ctl.sets === ctl.armed.at;
        if (hit) { ctl.trace.push({ op: "fail", key: k, size: s.length }); throw quotaError(); }
      }
      if (ctl.quota !== null) {
        const prev = map.has(k) ? k.length + map.get(k).length : 0;
        if (used() - prev + k.length + s.length > ctl.quota) { ctl.trace.push({ op: "quota", key: k, size: s.length }); throw quotaError(); }
      }
      map.set(k, s);
      ctl.trace.push({ op: "set", key: k, size: s.length });
      remember();
    },
    removeItem(k) {
      if (map.delete(k)) { ctl.trace.push({ op: "remove", key: k }); remember(); }
    },
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
  globalThis.sessionStorage = {
    getItem: (k) => (sess.has(k) ? sess.get(k) : null),
    setItem: (k, v) => { sess.set(k, String(v)); },
    removeItem: (k) => { sess.delete(k); },
    key: (i) => [...sess.keys()][i] ?? null,
    get length() { return sess.size; },
  };
  return ctl;
}

// ── CS worker：一個行程只跑一張地圖 ─────────────────────────────────────
if (arg("cs-worker")) {
  process.chdir(ROOT);
  const job = JSON.parse(fs.readFileSync(arg("cs-worker"), "utf8"));
  const { loadFpsMajorTestApi } = await import("./lib/fpsMajorTestApi.mjs");
  const api = await loadFpsMajorTestApi(fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8"));
  const lib = api.TACTICS_DB[job.mapKey];
  const tacticT = lib.t[job.seed % lib.t.length], tacticCT = lib.ct[(job.seed >>> 3) % lib.ct.length];
  const rs = [...job.roster.map((p) => ({ ...p, side: "t" })), ...api.ROSTER.filter((p) => p.side === "ct")];
  const sim = api.simulateFps(job.mapKey, tacticT, tacticCT, job.seed, rs, null, "major.v1");
  const raw = api.buildMatchResult(sim, { tacticT, tacticCT, tName: job.teamName, ctName: "Compulsary", seed: job.seed });
  fs.writeFileSync(arg("out"), JSON.stringify({ raw, tacticT: { id: tacticT.id, name: tacticT.name, type: tacticT.type }, completed: sim.completed }));
  process.exit(0);
}

// ── 準備：真模擬產生賽果 ─────────────────────────────────────────────────
async function prep(dir) {
  process.chdir(ROOT);
  const ctl = installStorage();
  let clock = 1800000000000;
  Date.now = () => clock;
  const tick = (ms = 1000) => { clock += ms; return clock; };
  const dump = () => ({ storage: Object.fromEntries(ctl.map), session: {}, clock });

  const { useProfileStore } = await import("../src/platform/profileStore.js");
  const { useHeroProgressStore } = await import("../src/hero/heroProgressStore.js");
  const SS = await import("../src/platform/competition/seasonState.js");
  const { prepareLiveMatch } = await import("../src/useLocalServer.js");
  const { resolveLiveRuleset } = await import("../src/battle/moba/liveMatchSetup.js");
  const { FEATURE_FLAGS } = await import("../src/featureFlags.js");
  const { aiTeamById } = await import("../src/platform/competition/aiTeams.js");
  const { mobaTacticById, MOBA_TACTICS } = await import("../src/platform/contracts/MobaTacticConfig.js");
  const { BattleEventTracker } = await import("../src/battle/battleEvents.js");
  const { snapshotToBattleResult } = await import("../src/battle/battleResult.js");
  const { TEAMS } = await import("../src/data/roster.js");
  const { selectTeamName, selectOpponentName } = await import("../src/platform/matchTeamNames.js");
  const { mobaResultToTransaction, mobaMatchId } = await import("../src/platform/progress/adapters/mobaProgressAdapter.js");
  const { toCsMatchResult } = await import("../src/platform/contracts/CsMatchResult.js");
  const { csResultToTransaction } = await import("../src/platform/progress/adapters/csProgressAdapter.js");
  const { toFpsRoster } = await import("../src/battle/fps/fpsRoster.js");
  const { appRoster } = await import("./lib/liveGolden.mjs");
  const Runner = await import("./balance/moba_items_balance_runner.mjs");
  const RM = await Runner.modules();
  const st = () => useProfileStore.getState();
  const modes = ["moba", "cs"];
  const seasonOf = (m) => st().competitionByMode?.[m] ?? null;
  const die = (why) => { console.error(`PREP_FAILED ${why}`); process.exit(3); };

  const playMoba = (seed) => {
    const launch = st().matchmaking?.launch;
    const rosterRaw = Runner.mirroredRoster(seed, RM);
    const tactic = mobaTacticById(MOBA_TACTICS[seed % MOBA_TACTICS.length].tacticId);
    const prepared = prepareLiveMatch({
      opts: { seed, roster: appRoster(rosterRaw), tactic, buildStrategy: "standard", opponentId: launch.opponentId ?? null, sessionId: launch.sessionId ?? null, mode: "moba" },
      ruleset: resolveLiveRuleset({ flags: FEATURE_FLAGS, dev: null, allowTool: false }).ruleset,
      seed, seedSource: "session",
      profile: { players: st().players ?? [], lineup: st().lineup ?? null },
      heroProgress: { loadout: useHeroProgressStore.getState().getLoadout() },
      opponentTeam: launch.opponentId ? aiTeamById(launch.opponentId) : null,
    });
    if (!prepared.ok) die(`prepareLiveMatch ${JSON.stringify(prepared.errors)}`);
    const e = prepared.engine;
    const tracker = new BattleEventTracker();
    const log = [];
    for (let i = 1; i * 0.5 <= 3600 && !e.over; i++) {
      e.tick(0.5);
      if (i % 2 === 0) for (const ev of tracker.update(e.snapshot())) log.push(ev);
    }
    const snap = e.snapshot();
    for (const ev of tracker.update(snap)) log.push(ev);
    if (!snap.over) die("moba engine not over");
    const ps = st();
    const blueName = selectTeamName(ps), redName = selectOpponentName(ps);
    const result = snapshotToBattleResult(snap, log, {
      heroAssign: Object.fromEntries(Object.entries(rosterRaw).map(([pid, r]) => [pid, r.heroId])),
      teams: { blue: { ...TEAMS.blue, ...(blueName ? { name: blueName } : {}) }, red: { ...TEAMS.red, ...(redName ? { name: redName } : {}) } },
    });
    const tx = mobaResultToTransaction(result, { players: ps.players ?? [], lineup: ps.lineup ?? null, streak: 0, fansNow: ps.meta?.fans ?? 0, origin: ps.matchmaking?.session?.origin ?? null });
    return { result, tx, matchId: mobaMatchId(result) };
  };

  const playCs = (seed, mapKey) => {
    const roster = toFpsRoster(st().players ?? [], st().csLineup);
    if (!roster) die("no cs roster");
    const job = path.join(dir, "cs-job.json"), out = path.join(dir, "cs-out.json");
    fs.writeFileSync(job, JSON.stringify({ mapKey, seed, roster, teamName: st().team?.name }));
    const r = spawnSync(process.execPath, ["--max-old-space-size=3584", SELF, `--cs-worker=${job}`, `--out=${out}`], { cwd: ROOT, encoding: "utf8", timeout: 420000, maxBuffer: 1 << 24, windowsHide: true });
    if (r.status !== 0) die(`cs worker exit=${r.status} ${String(r.stderr).slice(-300)}`);
    const w = JSON.parse(fs.readFileSync(out, "utf8"));
    if (!w.completed) die("cs not completed");
    const cr = toCsMatchResult(w.raw, { seed, mapKey, mapName: mapKey, tacticId: w.tacticT.id, tacticName: w.tacticT.name, tacticType: w.tacticT.type, roster });
    const ps = st();
    const tx = csResultToTransaction(cr, { players: ps.players ?? [], streak: 0, fansNow: ps.meta?.fans ?? 0, origin: ps.matchmaking?.session?.origin ?? null });
    return { result: cr, tx, matchId: cr.matchId };
  };

  const toLaunch = (fixtureId) => {
    const started = st().startFixtureMatch(fixtureId, tick());
    if (!started.ok) die(`startFixtureMatch ${JSON.stringify(started.errors ?? started.reason)}`);
    for (let i = 0; i < 40; i++) {
      const rs = st().matchmaking?.room?.state;
      if (rs === "confirmed") break;
      if (rs === "ready_check") st().confirmMatchReady(tick());
      st().pollMatchRoom(tick(1500));
    }
    if (!st().createMatchSession(tick()).ok) die("createMatchSession");
    if (!st().launchMatchSession(tick()).ok) die("launchMatchSession");
  };

  st().startNewGame("standard");
  for (const m of modes) if (!st().ensureCompetitionSeason(m).ok) die(`season ${m}`);
  fs.writeFileSync(path.join(dir, "plain.json"), JSON.stringify({ kind: "plain", ...dump() }));

  const captured = {};
  for (let guard = 0; guard < 300 && !(captured.moba && captured.cs); guard++) {
    const day = Number(st().meta?.days) || 1;
    const today = modes.flatMap((m) => {
      const s = seasonOf(m);
      if (!s?.schema) return [];
      return (s.fixtures ?? [])
        .filter((f) => (f.sideA === st().team.id || f.sideB === st().team.id) && !["completed", "forfeited"].includes(f.status) && SS.absoluteDayOf(s, f) <= day)
        .map((f) => ({ m, f }));
    });
    if (today.length) {
      const { m, f } = today[0];
      if (captured[m]) { if (!st().forfeitFixture(f.id).ok) die("forfeit in prep"); continue; }
      if (!st().matchEntry(m).ok) st().autoFillLineup(m);
      toLaunch(f.id);
      const launch = st().matchmaking?.launch;
      if (m === "moba") {
        const snapshot = dump();
        const a = playMoba(launch.seed);
        const b = playMoba(launch.seed + 1);
        if (a.matchId === b.matchId) die("two moba results share a matchId");
        fs.writeFileSync(path.join(dir, "moba.json"), JSON.stringify({ kind: "moba", ...snapshot, fixtureId: f.id, a, b }));
      } else {
        for (let i = 0; i < 8; i++) {
          const v = st().csMapSelectionView();
          if (v.resolved || !v.selection) break;
          let acted = false;
          for (const k of ["mirage", "dust2", "inferno"]) { if (st().applyCsMapVeto(k, tick()).ok) { acted = true; break; } }
          if (!acted) die("cs veto");
        }
        const mapKey = st().csMapSelectionView().mapKey;
        if (!mapKey) die("cs map");
        const snapshot = dump();
        const a = playCs(launch.seed, mapKey);
        const b = playCs(launch.seed + 1, mapKey);
        if (a.matchId === b.matchId) die("two cs results share a matchId");
        fs.writeFileSync(path.join(dir, "cs.json"), JSON.stringify({ kind: "cs", ...snapshot, fixtureId: f.id, a, b }));
      }
      captured[m] = true;
      console.log(`  已備妥 ${m}（第 ${day} 天，${f.id}）`);
      if (!st().forfeitFixture(f.id).ok) die("forfeit after capture");
      continue;
    }
    const r = st().advanceToNextStop();
    if (r.ok === false || !(r.daysAdvanced > 0)) die(`advance ${r.reason}`);
  }
  if (!captured.moba || !captured.cs) die("fixtures not reached");
}

// ── 子行程：載入磁碟內容，照腳本做事，每一步回報狀態 ─────────────────────
async function child(jobFile) {
  process.chdir(ROOT);
  const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
  const fx = job.fx ? JSON.parse(fs.readFileSync(job.fx, "utf8")) : {};
  const from = job.from ? JSON.parse(fs.readFileSync(job.from, "utf8")) : fx;
  const patched = { ...from.storage };
  for (const p of job.patchDisk ?? []) {
    const o = JSON.parse(patched[p.key]);
    if (p.kind === "hero_games") { const heroes = o.progress ?? o; const id = Object.keys(heroes)[0]; heroes[id].mastery.games += p.add; }
    if (p.kind === "drop_session") { o.matchmaking = { ...o.matchmaking, session: null, launch: null }; }
    if (p.kind === "dup_season") { o.history = [...(o.history ?? []), { schema: "x", commitKey: "dup" }, { schema: "x", commitKey: "dup" }]; }
    patched[p.key] = JSON.stringify(o);
  }
  const ctl = installStorage(patched, from.session ?? {});
  ctl.keep = !!job.keepSnapshots;
  let clock = (from.clock ?? 1800000000000) + 60000;
  Date.now = () => { clock += 1; return clock; };
  const tick = (ms = 1000) => { clock += ms; return clock; };

  const { useProfileStore } = await import("../src/platform/profileStore.js");
  const { useHeroProgressStore } = await import("../src/hero/heroProgressStore.js");
  const { useSeasonStore } = await import("../src/platform/seasonStore.js");
  const C = await import("../src/platform/progress/commitMatch.js");
  const { settleCsMatch } = await import("../src/platform/progress/settleCsMatch.js");
  const { useCommitAlertStore, commitKeyOf } = await import("../src/platform/persistence/matchCommit.js");
  const { createMatchSeries } = await import("../src/platform/contracts/matchSeries.js");
  const { mobaResultToTransaction, mobaMatchId } = await import("../src/platform/progress/adapters/mobaProgressAdapter.js");
  const st = () => useProfileStore.getState();

  const games = (progress) => Object.values(progress ?? {}).reduce((n, h) => n + (h?.mastery?.games ?? 0), 0);
  const parse = (k) => { const raw = ctl.map.get(k); return raw ? JSON.parse(raw) : null; };
  const fixtureIn = (p) => {
    for (const mode of ["moba", "cs"]) {
      const f = (p?.competitionByMode?.[mode]?.fixtures ?? []).find((x) => x.id === fx.fixtureId);
      if (f) return f.status;
    }
    return null;
  };
  const view = (p) => {
    const ledger = p?.processedMatchTransactions ?? {};
    return {
      hasA: !!(fx.a && ledger[fx.a.tx.transactionId]),
      hasB: !!(fx.b && ledger[fx.b.tx.transactionId]),
      tx: Object.keys(ledger).length,
      sessionId: p?.matchmaking?.session?.sessionId ?? null,
      funds: p?.finance?.funds ?? null,
      fixture: fixtureIn(p),
      cs: (p?.csHistory ?? []).length,
      days: p?.meta?.days ?? null,
      week: p?.economy?.lastSettledWeek ?? null,
    };
  };
  const sum = () => {
    const heroDisk = parse(HERO_KEY);
    const seasonDisk = parse(SEASON_KEY);
    const alertStore = useCommitAlertStore.getState();
    const s = st();
    return {
      mem: view(s),
      disk: view(parse(PROFILE_KEY)),
      heroMem: games(useHeroProgressStore.getState().progress),
      heroDisk: games(heroDisk?.progress ?? heroDisk),
      seasonMem: (useSeasonStore.getState().history ?? []).length,
      seasonDisk: (seasonDisk?.history ?? seasonDisk ?? []).length,
      journal: ctl.map.has(JOURNAL_KEY) ? JSON.parse(ctl.map.get(JOURNAL_KEY)).state ?? "?" : null,
      alertDisk: ctl.map.has(ALERT_KEY) ? JSON.parse(ctl.map.get(ALERT_KEY)).kind : null,
      alertSession: ctl.sess.has(ALERT_KEY) ? JSON.parse(ctl.sess.get(ALERT_KEY)).kind : null,
      alertMem: alertStore.alert?.kind ?? null,
      canRetry: !!alertStore.retry,
      saveStatus: s.saveState?.status ?? null,
      detail: !!useHeroProgressStore.getState().lastDetail,
      commitKey: commitKeyOf(s.matchmaking?.session ?? null, "x"),
      seriesMaps: s.matchmaking?.session?.series?.maps?.length ?? null,
      sessionState: s.matchmaking?.session?.state ?? null,
      audit: ctl.map.has(AUDIT_KEY) ? JSON.parse(ctl.map.get(AUDIT_KEY)).findings.map((f) => f.code) : [],
    };
  };
  const brief = (r) => (r && typeof r === "object" ? {
    ok: r.ok, stage: r.stage, reason: r.reason, code: r.errors?.[0]?.code, alreadySettled: r.alreadySettled,
    daysAdvanced: r.daysAdvanced, recovered: r.recovered, aborted: r.aborted, kept: r.kept,
  } : r);
  const handlers = {
    boot: () => C.recoverPendingCommits(),
    commit: ({ which = "a" }) => (fx.kind === "moba"
      ? C.commitMobaMatch({ result: fx[which].result, transaction: fx[which].tx, matchId: fx[which].matchId })
      : settleCsMatch(fx[which].result)),
    retry: () => C.retryPendingCommit(),
    arm: ({ at = 1, mode = "once" }) => { ctl.armed = { at, mode }; ctl.sets = 0; return { ok: true }; },
    disarm: () => { ctl.armed = null; ctl.armedKey = null; ctl.quota = null; return { ok: true }; },
    armKey: ({ key, times = 99 }) => { ctl.armedKey = { key, times }; return { ok: true }; },
    requeue: () => st().requeueMatch("moba", tick(120000)),
    cancelQueue: () => st().cancelMatchmaking(tick(1000)),
    practice: () => st().startPracticeMatch("moba", tick(1000)),
    //  走到真的開賽：與一般對戰的畫面流程同一串 store 動作。
    drive: () => {
      tick(120000);
      st().pollMatchmaking(clock);
      st().openMatchRoom(tick());
      for (let i = 0; i < 12; i++) {
        st().pollMatchRoom(tick());
        if (st().matchmaking?.room?.state === "ready_check" && !st().matchmaking?.room?.confirmations?.us) st().confirmMatchReady(clock);
      }
      const made = st().createMatchSession(tick());
      const launched = st().launchMatchSession(tick());
      return { ok: !!launched?.ok, reason: made?.errors?.[0]?.message ?? launched?.errors?.[0]?.message };
    },
    //  另一場比賽的賽果：真模擬那份改數字，交易由當下的場次建立（與 useBattleFeed 同一條）。
    commitOther: ({ n = 1, isPractice = false }) => {
      const c = JSON.parse(JSON.stringify(fx.a.result));
      c.duration = (c.duration ?? 600) + n * 7;
      const p = st();
      const tx = mobaResultToTransaction(c, { players: p.players ?? [], lineup: p.lineup ?? null, streak: 0, fansNow: p.meta?.fans ?? 0, origin: p.matchmaking?.session?.origin ?? null });
      return C.commitMobaMatch({ result: c, transaction: tx, matchId: mobaMatchId(c), isPractice });
    },
    dropJournal: () => { ctl.map.delete(JOURNAL_KEY); return { ok: true }; },
    forceCreated: () => {
      const mm = st().matchmaking;
      useProfileStore.setState({ matchmaking: { ...mm, session: { ...mm.session, state: "created", launchedAt: null } } });
      return { ok: st().save() };
    },
    quota: ({ extra }) => { ctl.quota = ctl.used() + extra; return { ok: true, quota: ctl.quota }; },
    forfeit: () => st().forfeitFixture(fx.fixtureId),
    advance: ({ n = 1 }) => st().advanceWorldDays(n, { reason: "rest" }),
    relaunch: () => st().startFixtureMatch(fx.fixtureId, Date.now()),
    abandon: () => st().abandonMatchSession(),
    enqueue: () => st().enqueueMatch("moba", Date.now()),
    save: () => ({ ok: st().save() }),
    patchSeries: () => {
      const made = createMatchSeries({ series: "bo3", mapPool: ["mirage", "dust2", "inferno"] }, { mapOrder: ["mirage", "dust2", "inferno"] });
      const mm = st().matchmaking;
      useProfileStore.setState({ matchmaking: { ...mm, session: { ...mm.session, series: made.series } } });
      return { ok: st().save() };
    },
    resume: () => st().resumeMatchSession(Date.now()),
    heroShape: () => {
      const progress = useHeroProgressStore.getState().progress;
      const assign = fx.a?.result?.players?.map((p) => p.heroId) ?? [];
      const marked = Object.entries(progress).filter(([, h]) => h?.lastCommitKey).map(([id]) => id);
      const nonHero = Object.entries(progress).filter(([, h]) => !h || typeof h !== "object" || !h.mastery).map(([id]) => id);
      return { ok: true, marked: marked.length, inMatch: marked.every((id) => assign.includes(id)), nonHero: nonHero.length, players: assign.length };
    },
    applyOther: () => {
      const br = fx.a.result;
      const r = useHeroProgressStore.getState().applyCommitted("test:other", br);
      return { ok: r.applied };
    },
  };
  const steps = [];
  for (const step of job.script ?? []) {
    let ret;
    try { ret = handlers[step.do](step); }
    catch (e) { ret = { threw: String(e?.message ?? e) }; }
    steps.push({ do: step.do, ret: step.do === "heroShape" ? ret : brief(ret), sum: sum() });
  }
  const out = {
    start: job.script?.length ? undefined : sum(),
    steps,
    trace: ctl.trace,
    used: ctl.used(),
    final: { storage: Object.fromEntries(ctl.map), session: Object.fromEntries(ctl.sess), clock },
    snapshots: job.keepSnapshots ? ctl.snapshots : undefined,
  };
  fs.writeFileSync(job.out, JSON.stringify(out));
  process.exit(0);
}

if (arg("cs-prep")) { await prep(arg("cs-prep")); process.exit(0); }
if (arg("child")) { await child(arg("child")); }

// ── 主行程 ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
const ck = (name, ok, detail = "") => {
  if (ok) { passed += 1; return; }
  failed += 1;
  failures.push(name);
  console.log(`❌ ${name}${detail ? `　${String(detail).slice(0, 240)}` : ""}`);
};
const section = (t) => console.log(`── ${t}（累計 ${passed + failed} 條，紅 ${failed}）`);

const work = arg("prep-dir") ?? fs.mkdtempSync(path.join(os.tmpdir(), "esmo-bp9-"));
fs.mkdirSync(work, { recursive: true });
const need = ["plain.json", "moba.json", "cs.json"].filter((f) => !fs.existsSync(path.join(work, f)));
if (need.length) {
  console.log(`準備真模擬賽果（${work}）…`);
  const r = spawnSync(process.execPath, ["--max-old-space-size=3584", SELF, `--cs-prep=${work}`], { cwd: ROOT, encoding: "utf8", timeout: 590000, maxBuffer: 1 << 26, windowsHide: true });
  if (r.status !== 0) { console.log(`❌ 準備失敗 exit=${r.status}\n${String(r.stdout).slice(-600)}\n${String(r.stderr).slice(-800)}`); process.exit(1); }
  console.log(String(r.stdout).trim());
}
const FX = { moba: path.join(work, "moba.json"), cs: path.join(work, "cs.json"), plain: path.join(work, "plain.json") };

let seq = 0;
function run(fx, script, { from = null, keepSnapshots = false, patchDisk = null } = {}) {
  seq += 1;
  const jobFile = path.join(work, `job-${seq}.json`), out = path.join(work, `out-${seq}.json`);
  fs.writeFileSync(jobFile, JSON.stringify({ fx, from, script, keepSnapshots, patchDisk, out }));
  const r = spawnSync(process.execPath, [SELF, `--child=${jobFile}`], { cwd: ROOT, encoding: "utf8", timeout: 180000, maxBuffer: 1 << 26, windowsHide: true });
  if (r.status !== 0 || !fs.existsSync(out)) {
    ck(`子行程正常結束 #${seq}`, false, `exit=${r.status} ${String(r.stderr).slice(-300)}`);
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(jobFile);
  fs.rmSync(out);
  return parsed;
}
function freeze(state) {
  seq += 1;
  const f = path.join(work, `state-${seq}.json`);
  fs.writeFileSync(f, JSON.stringify(state));
  return f;
}
const last = (r) => r.steps[r.steps.length - 1];

//  帳本是權威：寫進帳本的場數決定其他東西應該是多少。
function checkLedgerRules(label, kind, s, base, full) {
  const n = (s.disk.hasA ? 1 : 0) + (s.disk.hasB ? 1 : 0);
  ck(`${label}：同一場只會有一筆帳`, n <= 1, JSON.stringify(s.disk));
  ck(`${label}：記憶體與磁碟的帳本一致`, s.mem.hasA === s.disk.hasA && s.mem.hasB === s.disk.hasB && s.mem.tx === s.disk.tx, `${JSON.stringify(s.mem)} / ${JSON.stringify(s.disk)}`);
  ck(`${label}：記憶體與磁碟的資金一致`, s.mem.funds === s.disk.funds, `${s.mem.funds} / ${s.disk.funds}`);
  ck(`${label}：記憶體與磁碟的賽程一致`, s.mem.fixture === s.disk.fixture, `${s.mem.fixture} / ${s.disk.fixture}`);
  ck(`${label}：帳本筆數只多這一場`, s.disk.tx === base.disk.tx + n, `${s.disk.tx} vs ${base.disk.tx}+${n}`);
  if (n === 0) {
    ck(`${label}：沒入帳 ⇒ 資金不變`, s.disk.funds === base.disk.funds, `${s.disk.funds} vs ${base.disk.funds}`);
    ck(`${label}：沒入帳 ⇒ 賽程維持 launched`, s.disk.fixture === "launched", s.disk.fixture);
  } else {
    ck(`${label}：有入帳 ⇒ 賽程已收尾`, s.disk.fixture === "completed", s.disk.fixture);
    if (s.disk.hasA) ck(`${label}：有入帳 ⇒ 資金等於正常流程`, s.disk.funds === full.disk.funds, `${s.disk.funds} vs ${full.disk.funds}`);
  }
  if (kind === "moba") {
    ck(`${label}：英雄熟練恰好是帳本場數 × 10`, s.heroDisk === base.heroDisk + 10 * n && s.heroMem === s.heroDisk, `disk ${s.heroDisk} mem ${s.heroMem} base ${base.heroDisk} n ${n}`);
    ck(`${label}：Season 恰好是帳本場數`, s.seasonDisk === base.seasonDisk + n && s.seasonMem === s.seasonDisk, `disk ${s.seasonDisk} mem ${s.seasonMem} base ${base.seasonDisk} n ${n}`);
  } else {
    ck(`${label}：CS 紀錄恰好是帳本場數`, s.disk.cs === base.disk.cs + n && s.mem.cs === s.disk.cs, `${s.disk.cs} mem ${s.mem.cs} base ${base.disk.cs} n ${n}`);
    ck(`${label}：CS 不動英雄熟練與 Season`, s.heroDisk === base.heroDisk && s.seasonDisk === base.seasonDisk, `${s.heroDisk}/${s.seasonDisk}`);
  }
}

//  冷啟動一次（＝重新整理），查規則，再啟動一次查冪等，最後同一場重打一份不同的結果。
function coldBootAndReplay(label, fx, state, kind, base, full) {
  const from = freeze(state);
  const r = run(fx, [{ do: "boot" }, { do: "boot" }, { do: "commit", which: "b" }, { do: "boot" }], { from });
  if (!r) return null;
  const [b1, b2, replay, b3] = r.steps;
  checkLedgerRules(`${label}／冷啟動`, kind, b1.sum, base, full);
  const n = (b1.sum.disk.hasA ? 1 : 0) + (b1.sum.disk.hasB ? 1 : 0);
  if (n === 0) {
    const alerted = state.storage[ALERT_KEY] || state.session?.[ALERT_KEY];
    if (alerted) ck(`${label}／冷啟動：沒入帳的警示撐過重新整理`, !!b1.sum.alertMem, JSON.stringify(b1.sum.alertMem));
  } else {
    ck(`${label}／冷啟動：有入帳 ⇒ 日誌已處理`, b1.sum.journal === null, b1.sum.journal);
  }
  ck(`${label}／再啟動一次不會多算`, b2.sum.heroDisk === b1.sum.heroDisk && b2.sum.seasonDisk === b1.sum.seasonDisk && b2.sum.disk.funds === b1.sum.disk.funds && b2.sum.disk.tx === b1.sum.disk.tx && b2.sum.disk.cs === b1.sum.disk.cs, `${b1.sum.heroDisk}->${b2.sum.heroDisk}`);
  checkLedgerRules(`${label}／重打`, kind, b3.sum, base, full);
  ck(`${label}／重打後最多一筆帳，而且一定有帳`, (b3.sum.disk.hasA ? 1 : 0) + (b3.sum.disk.hasB ? 1 : 0) === 1, JSON.stringify(b3.sum.disk));
  ck(`${label}／重打後日誌與比賽警示都清掉`, b3.sum.journal === null && b3.sum.alertMem !== "match" && b3.sum.alertMem !== "derived", `${b3.sum.journal}/${b3.sum.alertMem}`);
  if (n > 0) ck(`${label}／已入帳後重打被拒絕或略過`, replay.sum.heroDisk === b1.sum.heroDisk && replay.sum.disk.funds === b1.sum.disk.funds, JSON.stringify(replay.ret));
  return r;
}

const src = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// ── §0 原始碼 ────────────────────────────────────────────────────────────
section("§0 原始碼");
{
  const feed = strip(src("src/battle/useBattleFeed.js"));
  ck("useBattleFeed 只走 commitMobaMatch", feed.includes("commitMobaMatch(") && !feed.includes("settleMatchThroughSession("));
  ck("useBattleFeed 不再自己寫熟練與 Season", !feed.includes("recordBattleResult(") && !feed.includes("recordResult("));
  const cs = strip(src("src/platform/progress/settleCsMatch.js"));
  ck("settleCsMatch 把結算與 csHistory 包在同一次提交", cs.includes("commitCsMatch(") && cs.indexOf("commitCsMatch(") < cs.indexOf("recordCsMatch("));
  ck("開機會跑恢復", strip(src("src/AppShell.jsx")).includes("recoverPendingCommits()"));
  const store = strip(src("src/platform/profileStore.js"));
  ck("profileStore 不 import 其他 store（還原才完整）", !/from "[^"]*(heroProgressStore|seasonStore)\.js"/.test(store));
  ck("重置與開新局會清提交狀態", (store.match(/resetCommitState\(\)/g) ?? []).length >= 2);
  ck("還原存檔會清提交狀態", strip(src("src/platform/persistence/saveGateway.js")).includes("resetCommitState()"));
  ck("沒有改到 heroProgress.js 的語意", !src("src/hero/heroProgress.js").includes("commitKey"));
}

// ── §1 正常流程 ──────────────────────────────────────────────────────────
section("§1 MOBA 正常流程");
const mobaBase = run(FX.moba, [{ do: "save" }]).steps[0].sum;
const mobaOk = run(FX.moba, [{ do: "commit", which: "a" }, { do: "heroShape" }], { keepSnapshots: true });
const mobaFull = mobaOk.steps[0].sum;
const mobaWrites = mobaOk.trace.filter((t) => t.op === "set").length;
ck("基準狀態：賽程 launched、帳本沒有這場", mobaBase.disk.fixture === "launched" && !mobaBase.disk.hasA, JSON.stringify(mobaBase.disk));
ck("提交成功", mobaOk.steps[0].ret.ok === true && mobaOk.steps[0].ret.stage === "done", JSON.stringify(mobaOk.steps[0].ret));
checkLedgerRules("正常流程", "moba", mobaFull, mobaBase, mobaFull);
ck("正常流程：真的入帳了", mobaFull.disk.hasA && mobaFull.disk.tx === mobaBase.disk.tx + 1);
ck("正常流程：日誌與警示都沒留", mobaFull.journal === null && mobaFull.alertMem === null && mobaFull.alertDisk === null);
ck("正常流程：賽後畫面有這場的成長明細", mobaFull.detail === true);
{
  const order = mobaOk.trace.filter((t) => t.op === "set" || t.op === "remove").map((t) => t.key);
  const iJ = order.indexOf(JOURNAL_KEY), iP = order.indexOf(PROFILE_KEY), iS = order.indexOf(SEASON_KEY), iR = order.lastIndexOf(JOURNAL_KEY);
  ck("順序：日誌 → profile → Season → 刪日誌", iJ < iP && iP < iS && iS < iR, order.join(" > "));
  ck("profile 只寫一次（結算與賽程回寫沒有分開）", order.filter((k) => k === PROFILE_KEY).length === 1, order.join(" > "));
  const hero = mobaOk.steps[1].ret;
  ck("熟練標記只留在這場出賽的英雄身上", hero.marked > 0 && hero.marked <= hero.players && hero.inMatch, JSON.stringify(hero));
  ck("progress 裡沒有不是英雄的鍵", hero.nonHero === 0, JSON.stringify(hero));
  const j = mobaOk.snapshots.find((x) => x.storage[JOURNAL_KEY]);
  const size = j.storage[JOURNAL_KEY].length;
  ck(`日誌夠小（${size} 字元），不含 timeline`, size < 30000 && JSON.parse(j.storage[JOURNAL_KEY]).result.timeline.length === 0, size);
}
console.log(`  MOBA 一次提交：${mobaWrites} 次 setItem，${mobaOk.trace.length} 次寫入或刪除`);

// ── §2 每個寫入邊界注入失敗 ──────────────────────────────────────────────
section("§2 MOBA 每次寫入都注入失敗");
for (const mode of ["once", "sticky"]) {
  for (let at = 1; at <= mobaWrites; at++) {
    const label = `MOBA 第 ${at} 次寫入失敗（${mode === "once" ? "只失敗一次" : "之後全部失敗"}）`;
    const r = run(FX.moba, [{ do: "arm", at, mode }, { do: "commit", which: "a" }, { do: "disarm" }]);
    if (!r) continue;
    const s = r.steps[1].sum;
    ck(`${label}：有告訴玩家`, r.steps[1].ret.ok === true || !!s.alertMem, JSON.stringify(r.steps[1].ret));
    ck(`${label}：Season 與熟練不會跑在帳本前面`, s.disk.hasA || (s.heroDisk === mobaBase.heroDisk && s.seasonDisk === mobaBase.seasonDisk && s.heroMem === mobaBase.heroMem), `hero ${s.heroDisk}/${s.heroMem} season ${s.seasonDisk}`);
    //  ⚠ 不看磁碟：profile 寫進去、熟練寫失敗、復原也失敗時，磁碟有帳而記憶體還原，那是合法的（冷啟動那邊會驗）。
    const counted = r.steps[1].ret.ok === true || r.steps[1].ret.stage === "derived";
    ck(`${label}：記憶體與提交結果一致`, s.mem.hasA === counted, `${s.mem.hasA} ${JSON.stringify(r.steps[1].ret)}`);
    if (!counted) ck(`${label}：提交失敗 ⇒ 記憶體還原到提交之前`, s.mem.funds === mobaBase.disk.funds && s.mem.fixture === "launched" && s.heroMem === mobaBase.heroMem && s.seasonMem === mobaBase.seasonMem, JSON.stringify(s.mem));
    if (!counted) ck(`${label}：提交失敗 ⇒ 賽後畫面不會顯示別場的成長`, !s.detail);
    coldBootAndReplay(label, FX.moba, r.final, "moba", mobaBase, mobaFull);
    //  同一個分頁按重試。
    const retried = run(FX.moba, [{ do: "arm", at, mode }, { do: "commit", which: "a" }, { do: "disarm" }, { do: "retry" }, { do: "retry" }]);
    if (retried) {
      const after = last(retried).sum;
      checkLedgerRules(`${label}／按兩次重試`, "moba", after, mobaBase, mobaFull);
      ck(`${label}／按兩次重試：入帳成功且清掉警示`, after.disk.hasA && after.journal === null && after.alertMem === null, `${after.disk.hasA}/${after.journal}/${after.alertMem}`);
    }
  }
  section(`§2 MOBA ${mode} 完成`);
}

// ── §3 每次寫入之後重新整理 ──────────────────────────────────────────────
section("§3 MOBA 每次寫入之後重新整理");
mobaOk.snapshots.forEach((snap, i) => {
  const label = `MOBA 第 ${i + 1} 次寫入後重新整理`;
  coldBootAndReplay(label, FX.moba, snap, "moba", mobaBase, mobaFull);
  //  帳沒進、日誌還在：開機後可以直接把那一場補送，不用重打。
  if (snap.storage[JOURNAL_KEY] && !JSON.parse(snap.storage[PROFILE_KEY]).processedMatchTransactions?.[JSON.parse(snap.storage[JOURNAL_KEY]).txId]) {
    const r = run(FX.moba, [{ do: "boot" }, { do: "retry" }, { do: "boot" }], { from: freeze(snap) });
    if (r) {
      ck(`${label}：開機後有重試可按`, r.steps[0].sum.canRetry === true, JSON.stringify(r.steps[0].ret));
      checkLedgerRules(`${label}／用日誌重試`, "moba", last(r).sum, mobaBase, mobaFull);
      ck(`${label}／用日誌重試：入帳成功`, last(r).sum.disk.hasA && last(r).sum.journal === null, JSON.stringify(r.steps[1].ret));
    }
  }
});

// ── §4 同場重複與重送 ────────────────────────────────────────────────────
section("§4 同場重複送出");
{
  const r = run(FX.moba, [{ do: "commit", which: "a" }, { do: "commit", which: "a" }, { do: "commit", which: "b" }, { do: "commit", which: "a" }]);
  const s = last(r).sum;
  checkLedgerRules("同一份賽果連送、再送不同結果", "moba", s, mobaBase, mobaFull);
  ck("第二次送同一份：判定重複", r.steps[1].ret.stage === "duplicate", JSON.stringify(r.steps[1].ret));
  ck("送不同結果：被拒絕，不會改賽果", r.steps[2].ret.ok === false && s.disk.hasA && !s.disk.hasB, JSON.stringify(r.steps[2].ret));
}
{
  //  重打很多次都失敗（W2 的情況：熟練 790 → 800 → 810）。
  const script = [];
  for (let i = 0; i < 4; i++) script.push({ do: "arm", at: 2, mode: "sticky" }, { do: "commit", which: i % 2 ? "b" : "a" }, { do: "disarm" });
  const r = run(FX.moba, script);
  const s = last(r).sum;
  ck("連續四次存檔失敗：熟練一格都沒動", s.heroDisk === mobaBase.heroDisk && s.heroMem === mobaBase.heroMem, `${s.heroDisk}/${s.heroMem}`);
  ck("連續四次存檔失敗：Season 一筆都沒多", s.seasonDisk === mobaBase.seasonDisk && s.seasonMem === mobaBase.seasonMem);
  ck("連續四次存檔失敗：沒有帳、沒有錢", s.disk.tx === mobaBase.disk.tx && s.disk.funds === mobaBase.disk.funds);
  coldBootAndReplay("連續四次失敗後", FX.moba, r.final, "moba", mobaBase, mobaFull);
}

// ── §5 真的配額不足 ──────────────────────────────────────────────────────
section("§5 配額不足");
{
  const sizes = mobaOk.trace.filter((t) => t.op === "set");
  const journalSize = sizes.find((t) => t.key === JOURNAL_KEY).size + JOURNAL_KEY.length;
  const baseProfile = run(FX.moba, []).final.storage[PROFILE_KEY].length;
  const profileGrowth = sizes.find((t) => t.key === PROFILE_KEY).size - baseProfile;
  const heroSet = sizes.filter((t) => t.key === HERO_KEY);
  const heroGrowth = heroSet[heroSet.length - 1].size - run(FX.moba, []).final.storage[HERO_KEY].length;
  const plans = [
    ["連日誌都寫不進去", 50, "journal"],
    ["日誌進得去、profile 進不去", journalSize + Math.floor(profileGrowth / 2), "profile"],
    ["帳本進得去、Season 連精簡版都進不去", journalSize + profileGrowth + heroGrowth + 200, "derived"],
    ["帳本進得去、Season 只進得去精簡版", journalSize + profileGrowth + heroGrowth + Math.floor(journalSize * 0.9), "done"],
  ];
  for (const [name, extra, expect] of plans) {
    const r = run(FX.moba, [{ do: "quota", extra }, { do: "commit", which: "a" }]);
    if (!r) continue;
    const c = r.steps[1];
    ck(`配額：${name}：停在預期的那一步`, c.ret.stage === expect, JSON.stringify(c.ret));
    if (expect === "done") {
      ck(`配額：${name}：不用停下來，全部寫完`, c.sum.disk.hasA && c.sum.heroDisk === mobaBase.heroDisk + 10 && c.sum.seasonDisk === mobaBase.seasonDisk + 1 && c.sum.journal === null && c.sum.alertMem === null, JSON.stringify(c.sum));
      continue;
    }
    if (expect !== "derived") {
      ck(`配額：${name}：什麼都沒發生`, !c.sum.disk.hasA && c.sum.heroDisk === mobaBase.heroDisk && c.sum.seasonDisk === mobaBase.seasonDisk && c.sum.disk.funds === mobaBase.disk.funds, JSON.stringify(c.sum.disk));
    } else {
      ck(`配額：${name}：帳與熟練都在，Season 待補`, c.sum.disk.hasA && c.sum.heroDisk === mobaBase.heroDisk + 10 && c.sum.seasonDisk === mobaBase.seasonDisk && c.sum.journal !== null && c.sum.alertMem === "derived", JSON.stringify(c.sum));
      //  還是滿的情況下重新整理：不能再多算一次熟練，也要繼續提示。
      const stillFull = run(FX.moba, [{ do: "quota", extra: 0 }, { do: "boot" }, { do: "boot" }], { from: freeze(r.final) });
      const s = last(stillFull).sum;
      ck(`配額：${name}：還是滿的時候重新整理不會多算熟練`, s.heroDisk === mobaBase.heroDisk + 10 && s.heroMem === mobaBase.heroMem + 10, `${s.heroDisk}/${s.heroMem}`);
      ck(`配額：${name}：還是滿的時候繼續提示`, s.alertMem === "derived" && s.canRetry === true && s.journal !== null, `${s.alertMem}/${s.canRetry}/${s.journal}`);
    }
    coldBootAndReplay(`配額：${name}`, FX.moba, r.final, "moba", mobaBase, mobaFull);
  }
}

// ── §6 CS ────────────────────────────────────────────────────────────────
section("§6 CS 每個寫入邊界");
const csBase = run(FX.cs, [{ do: "save" }]).steps[0].sum;
const csOk = run(FX.cs, [{ do: "commit", which: "a" }], { keepSnapshots: true });
const csFull = csOk.steps[0].sum;
const csWrites = csOk.trace.filter((t) => t.op === "set").length;
ck("CS 基準狀態正確", csBase.disk.fixture === "launched" && !csBase.disk.hasA, JSON.stringify(csBase.disk));
ck("CS 提交成功", csOk.steps[0].ret.ok === true, JSON.stringify(csOk.steps[0].ret));
checkLedgerRules("CS 正常流程", "cs", csFull, csBase, csFull);
ck("CS 正常流程：真的入帳，戰報也在", csFull.disk.hasA && csFull.disk.cs === csBase.disk.cs + 1, JSON.stringify(csFull.disk));
ck("CS 結算與 csHistory 同一次寫入", csOk.trace.filter((t) => t.op === "set" && t.key === PROFILE_KEY).length === 1, JSON.stringify(csOk.trace.map((t) => t.key)));
console.log(`  CS 一次提交：${csWrites} 次 setItem`);
for (const mode of ["once", "sticky"]) {
  for (let at = 1; at <= csWrites; at++) {
    const label = `CS 第 ${at} 次寫入失敗（${mode === "once" ? "只失敗一次" : "之後全部失敗"}）`;
    const r = run(FX.cs, [{ do: "arm", at, mode }, { do: "commit", which: "a" }, { do: "disarm" }]);
    if (!r) continue;
    const s = r.steps[1].sum;
    ck(`${label}：沒有「獎金入了、紀錄沒了」`, s.disk.hasA === (s.disk.cs === csBase.disk.cs + 1), JSON.stringify(s.disk));
    ck(`${label}：有告訴玩家`, r.steps[1].ret.ok === true || !!s.alertMem);
    ck(`${label}：沒入帳 ⇒ 記憶體還原`, s.disk.hasA || (!s.mem.hasA && s.mem.cs === csBase.disk.cs && s.mem.fixture === "launched"), JSON.stringify(s.mem));
    coldBootAndReplay(label, FX.cs, r.final, "cs", csBase, csFull);
    const retried = run(FX.cs, [{ do: "arm", at, mode }, { do: "commit", which: "a" }, { do: "disarm" }, { do: "retry" }, { do: "retry" }]);
    if (retried) {
      const after = last(retried).sum;
      checkLedgerRules(`${label}／按兩次重試`, "cs", after, csBase, csFull);
      ck(`${label}／按兩次重試：入帳成功且清掉警示`, after.disk.hasA && after.alertMem === null, `${after.disk.hasA}/${after.alertMem}`);
    }
  }
}
csOk.snapshots.forEach((snap, i) => coldBootAndReplay(`CS 第 ${i + 1} 次寫入後重新整理`, FX.cs, snap, "cs", csBase, csFull));
{
  const r = run(FX.cs, [{ do: "commit", which: "a" }, { do: "commit", which: "a" }]);
  checkLedgerRules("CS 同一份賽果連送", "cs", last(r).sum, csBase, csFull);
}

// ── §7 重試時場次已經換了 ────────────────────────────────────────────────
section("§7 場次換掉後的重試");
{
  const live = run(FX.moba, [{ do: "arm", at: 2, mode: "once" }, { do: "commit", which: "a" }, { do: "disarm" }, { do: "relaunch" }, { do: "retry" }]);
  ck("場次還活著時不能重開，重試照常入帳", live.steps[3].ret.code === "live_session" && last(live).ret.ok === true && last(live).sum.disk.hasA, JSON.stringify(live.steps[3].ret));
  const r = run(FX.moba, [{ do: "arm", at: 2, mode: "once" }, { do: "commit", which: "a" }, { do: "disarm" }, { do: "abandon" }, { do: "relaunch" }, { do: "retry" }]);
  ck("放棄場次後可以重開房", r.steps[4].ret.ok === true, JSON.stringify(r.steps[4].ret));
  const s = last(r).sum;
  ck("重新開房後，舊的重試不會入帳", last(r).ret.stage === "stale" && !s.disk.hasA, `${JSON.stringify(last(r).ret)} ${s.sessionState}`);
  ck("重新開房後，舊的重試不會動資金與熟練", s.disk.funds === mobaBase.disk.funds && s.heroDisk === mobaBase.heroDisk);
  ck("重新開房後，警示留著，但不再給重試", s.alertMem === "match" && s.canRetry === false, `${s.alertMem}/${s.canRetry}`);
}

// ── §8 棄權 ──────────────────────────────────────────────────────────────
section("§8 棄權");
{
  const r = run(FX.moba, [{ do: "arm", at: 2, mode: "once" }, { do: "commit", which: "a" }, { do: "disarm" }, { do: "forfeit" }, { do: "boot" }]);
  const f = r.steps[3], b = r.steps[4];
  ck("失敗後棄權成功，賽程收尾", f.ret.ok === true && f.sum.disk.fixture === "forfeited", JSON.stringify(f.ret));
  ck("棄權清掉這場的日誌與警示", f.sum.journal === null && f.sum.alertMem === null, `${f.sum.journal}/${f.sum.alertMem}`);
  ck("棄權後熟練、Season 沒動", b.sum.heroDisk === mobaBase.heroDisk && b.sum.seasonDisk === mobaBase.seasonDisk);
  ck("棄權會把這場的場次一起結束", f.sum.sessionState === "abandoned", f.sum.sessionState);
  //  W2 留下的洞：棄權之後賽果還能進來。
  const late = run(FX.moba, [{ do: "forfeit" }, { do: "commit", which: "a" }, { do: "boot" }]);
  const ls = last(late).sum;
  ck("棄權之後再送賽果：拒絕", late.steps[1].ret.stage === "given_up" && !ls.disk.hasA, JSON.stringify(late.steps[1].ret));
  ck("棄權之後再送賽果：資金、熟練、Season 都不動", ls.disk.funds === late.steps[0].sum.disk.funds && ls.heroDisk === mobaBase.heroDisk && ls.seasonDisk === mobaBase.seasonDisk);
  ck("棄權之後再送賽果：賽程維持已棄權", ls.disk.fixture === "forfeited", ls.disk.fixture);
  const csLate = run(FX.cs, [{ do: "forfeit" }, { do: "commit", which: "a" }]);
  const cl = last(csLate).sum;
  ck("CS 棄權之後再送賽果：拒絕，也不留紀錄", !cl.disk.hasA && cl.disk.cs === csBase.disk.cs && cl.disk.funds === csLate.steps[0].sum.disk.funds, JSON.stringify(cl.disk));
  const stale = run(FX.moba, [{ do: "arm", at: 2, mode: "once" }, { do: "commit", which: "a" }, { do: "disarm" }, { do: "forfeit" }, { do: "retry" }]);
  ck("失敗 → 棄權之後，手上的重試不會再入帳", !last(stale).sum.disk.hasA && last(stale).sum.disk.fixture === "forfeited", JSON.stringify(last(stale).ret));
  const blocked = run(FX.moba, [{ do: "arm", at: 1, mode: "sticky" }, { do: "forfeit" }, { do: "disarm" }, { do: "forfeit" }]);
  const b1 = blocked.steps[1];
  ck("存不進去時棄權會失敗，記憶體與磁碟都維持原樣", b1.ret.ok === false && b1.sum.mem.fixture === "launched" && b1.sum.disk.fixture === "launched", JSON.stringify(b1.ret));
  ck("恢復後可以棄權", last(blocked).ret.ok === true && last(blocked).sum.disk.fixture === "forfeited", JSON.stringify(last(blocked).ret));
}

// ── §9 存不進去時不推進 ──────────────────────────────────────────────────
section("§9 存不進去時不推進");
{
  const clean = run(FX.plain, [{ do: "advance", n: 7 }]);
  ck("基準：可以正常推進", clean.steps[0].ret.ok === true && clean.steps[0].sum.disk.days > 1, JSON.stringify(clean.steps[0].ret));
  const startDay = run(FX.plain, []).start.disk.days;
  const r = run(FX.plain, [{ do: "arm", at: 1, mode: "sticky" }, { do: "advance", n: 7 }, { do: "advance", n: 1 }, { do: "enqueue" }, { do: "disarm" }, { do: "advance", n: 7 }]);
  const a1 = r.steps[1], a2 = r.steps[2], q = r.steps[3], ok = r.steps[5];
  ck("存不進去：不前進，還有告訴玩家原因", a1.ret.ok === false && !!a1.ret.reason, JSON.stringify(a1.ret));
  ck("存不進去：記憶體與磁碟的日子都沒動", a1.sum.mem.days === startDay && a1.sum.disk.days === startDay, `${a1.sum.mem.days}/${a1.sum.disk.days}/${startDay}`);
  ck("存不進去：週結算與資金都還原", a1.sum.mem.funds === a1.sum.disk.funds && a1.sum.mem.week === a1.sum.disk.week, `${a1.sum.mem.funds}/${a1.sum.disk.funds}`);
  ck("存檔還在失敗時，第二次推進也被擋", a2.ret.ok === false && a2.sum.mem.days === startDay, JSON.stringify(a2.ret));
  ck("存檔還在失敗時，不能開新比賽", q.ret.ok === false && q.ret.code === "save_failed", JSON.stringify(q.ret));
  ck("恢復之後可以推進，結果與沒出事時相同", ok.ret.ok === true && ok.sum.disk.days === clean.steps[0].sum.disk.days && ok.sum.disk.funds === clean.steps[0].sum.disk.funds, `${ok.sum.disk.days}/${clean.steps[0].sum.disk.days} ${ok.sum.disk.funds}/${clean.steps[0].sum.disk.funds}`);
  const blockedStart = run(FX.moba, [{ do: "arm", at: 1, mode: "sticky" }, { do: "save" }, { do: "relaunch" }, { do: "disarm" }, { do: "relaunch" }]);
  const seasonHeld = run(FX.moba, [{ do: "commit", which: "a" }, { do: "armKey", key: SEASON_KEY }, { do: "commit", which: "a" }]);
  ck("基準：同一份賽果在 Season 卡住前後都不重複", last(seasonHeld).sum.heroDisk === mobaBase.heroDisk + 10, last(seasonHeld).sum.heroDisk);
  ck("存檔還在失敗時，開賽程被存檔保護擋下", blockedStart.steps[2].ret.code === "save_failed", JSON.stringify(blockedStart.steps[2].ret));
  ck("恢復之後不再是存檔保護擋下（場次還活著，規則照舊）", last(blockedStart).ret.code === "live_session", JSON.stringify(last(blockedStart).ret));
}

// ── §10 警示 ─────────────────────────────────────────────────────────────
section("§10 警示撐過重新整理");
{
  const r = run(FX.plain, [{ do: "arm", at: 1, mode: "sticky" }, { do: "save" }]);
  const s = r.steps[1].sum;
  ck("一般存檔失敗有警示", s.alertMem === "save" && s.saveStatus === "error", `${s.alertMem}/${s.saveStatus}`);
  ck("磁碟寫不進去時，sessionStorage 還有一份", s.alertDisk === null && s.alertSession === "save", `${s.alertDisk}/${s.alertSession}`);
  const reload = run(FX.plain, [{ do: "boot" }, { do: "save" }], { from: freeze(r.final) });
  ck("重新整理之後警示還在", reload.steps[0].sum.alertMem === "save", reload.steps[0].sum.alertMem);
  ck("存檔成功之後警示清掉", reload.steps[1].sum.alertMem === null && reload.steps[1].sum.alertSession === null, reload.steps[1].sum.alertMem);
  const cold = run(FX.moba, [{ do: "arm", at: 2, mode: "sticky" }, { do: "commit", which: "a" }, { do: "disarm" }, { do: "save" }]);
  ck("比賽沒入帳時，一般存檔成功不會把警示洗掉", last(cold).sum.alertMem === "match", last(cold).sum.alertMem);
}

// ── §11 舊版留下的異常：只偵測，不自動修 ─────────────────────────────────
section("§11 歷史異常");
{
  const clean = run(FX.moba, [{ do: "boot" }]);
  ck("正常存檔沒有異常", clean.steps[0].sum.audit.length === 0, clean.steps[0].sum.audit.join(","));
  const ahead = run(FX.moba, [{ do: "boot" }, { do: "boot" }], { patchDisk: [{ key: HERO_KEY, kind: "hero_games", add: 100 }] });
  const a = last(ahead).sum;
  ck("熟練多於帳本：偵測得到", a.audit.includes("hero_ahead_of_ledger"), a.audit.join(","));
  ck("熟練多於帳本：沒有自動修改", a.heroDisk === mobaBase.heroDisk + 100, `${a.heroDisk} vs ${mobaBase.heroDisk + 100}`);
  const dup = run(FX.moba, [{ do: "boot" }], { patchDisk: [{ key: SEASON_KEY, kind: "dup_season" }] });
  if (dup) ck("Season 同一場兩筆：偵測得到", last(dup).sum.audit.includes("season_duplicate_commit"), last(dup).sum.audit.join(","));
  const orphan = run(FX.moba, [{ do: "boot" }], { patchDisk: [{ key: PROFILE_KEY, kind: "drop_session" }] });
  const o = last(orphan).sum;
  ck("賽程 launched 卻沒有場次：偵測得到", o.audit.includes("launched_without_session"), o.audit.join(","));
  ck("賽程 launched 卻沒有場次：賽程維持原狀", o.disk.fixture === "launched", o.disk.fixture);
}

// ── §12 熟練標記不會累積 ─────────────────────────────────────────────────
section("§12 熟練標記");
{
  const r = run(FX.moba, [{ do: "commit", which: "a" }, { do: "applyOther" }, { do: "heroShape" }]);
  const h = last(r).ret;
  ck("換一場之後標記不累積", h.marked > 0 && h.marked <= h.players && h.nonHero === 0, JSON.stringify(h));
}

// ── §13 BO3 ──────────────────────────────────────────────────────────────
section("§13 BO3 每張地圖");
{
  const r = run(FX.cs, [
    { do: "patchSeries" },
    { do: "arm", at: 1, mode: "sticky" }, { do: "commit", which: "a" }, { do: "disarm" },
    { do: "commit", which: "a" }, { do: "resume" }, { do: "boot" }, { do: "commit", which: "b" },
  ]);
  if (r) {
    const start = r.steps[0].sum, failedMap = r.steps[2].sum, map1 = r.steps[4].sum, map2 = r.steps[7].sum;
    ck("BO3 第一張失敗：series 還原，沒有多一張", failedMap.seriesMaps === 0 && !failedMap.disk.hasA, JSON.stringify(failedMap.seriesMaps));
    ck("BO3 同一張重打：識別不變", failedMap.commitKey === start.commitKey, `${failedMap.commitKey} / ${start.commitKey}`);
    ck("BO3 第一張成功：記一張、入一筆", map1.seriesMaps === 1 && map1.disk.hasA && map1.disk.cs === csBase.disk.cs + 1, `${map1.seriesMaps} ${JSON.stringify(map1.disk)}`);
    ck("BO3 下一張：識別不同", map1.commitKey !== start.commitKey, `${map1.commitKey}`);
    ck("BO3 第二張：再入一筆，不會重複", map2.disk.hasB && map2.disk.tx === csBase.disk.tx + 2 && map2.disk.cs === csBase.disk.cs + 2, `${JSON.stringify(map2.disk)} ${JSON.stringify(r.steps[7].ret)}`);
    ck("BO3：熟練與 Season 都沒被 CS 動到", map2.heroDisk === csBase.heroDisk && map2.seasonDisk === csBase.seasonDisk);
  }
}

// ── §15 失敗前後各一場（第一輪 Review 重現的序列）───────────────────────
section("§15 失敗前後各一場");
{
  const held = { do: "armKey", key: SEASON_KEY };
  //  A 卡在 Season 時，玩家不能開下一場，也不能推進日曆。
  const stop = run(FX.moba, [held, { do: "commit", which: "a" }, { do: "requeue" }, { do: "advance", n: 1 }, { do: "disarm" }, { do: "requeue" }, { do: "drive" }, { do: "commitOther", n: 1 }, { do: "retry" }, { do: "boot" }]);
  if (stop) {
    const [, a, q1, adv, , q2, drv, b, again, end] = stop.steps;
    ck("A 帳已入、Season 待補", a.ret.stage === "derived" && a.sum.disk.hasA && a.sum.seasonDisk === mobaBase.seasonDisk, JSON.stringify(a.ret));
    ck("Season 還寫不進去：不能開下一場", q1.ret.ok === false && q1.ret.code === "save_failed", JSON.stringify(q1.ret));
    ck("Season 還寫不進去：不能推進日曆", adv.ret.ok === false && adv.sum.disk.days === a.sum.disk.days, JSON.stringify(adv.ret));
    ck("被擋的時候沒有清掉場次與日誌", q1.sum.journal !== null && q1.sum.sessionState === a.sum.sessionState, `${q1.sum.journal} ${q1.sum.sessionState}`);
    ck("排除之後開下一場：A 先補完", q2.ret.ok === true && q2.sum.seasonDisk === mobaBase.seasonDisk + 1 && q2.sum.journal === null && q2.sum.alertMem === null, JSON.stringify(q2.ret));
    ck("下一場真的開賽", drv.ret.ok === true && drv.sum.sessionState === "launched", JSON.stringify(drv.ret));
    ck("B 入帳", b.ret.ok === true && b.sum.disk.tx === mobaBase.disk.tx + 2, JSON.stringify(b.ret));
    ck("兩場：熟練恰好 +20（Review 重現時是 30）", end.sum.heroDisk === mobaBase.heroDisk + 20 && end.sum.heroMem === mobaBase.heroMem + 20, `${end.sum.heroDisk}/${end.sum.heroMem}`);
    ck("兩場：Season 恰好 +2", end.sum.seasonDisk === mobaBase.seasonDisk + 2, end.sum.seasonDisk);
    ck("打完還按重試：什麼都不做", again.ret.stage === "nothing_pending", JSON.stringify(again.ret));
  }
  //  重試按鈕握著 A，日誌已經不是 A 了：絕對不能再套用一次。
  const stale = run(FX.moba, [held, { do: "commit", which: "a" }, { do: "disarm" }, { do: "dropJournal" }, { do: "retry" }]);
  if (stale) {
    const s = last(stale);
    ck("日誌不是這筆時重試：不動作", s.ret.stage === "stale" && s.sum.heroDisk === mobaBase.heroDisk + 10, `${JSON.stringify(s.ret)} ${s.sum.heroDisk}`);
    ck("日誌不是這筆時重試：提示清掉", s.sum.alertMem === null, s.sum.alertMem);
  }
  //  已入帳的日誌不能被下一份賽果蓋掉。
  const keep = run(FX.moba, [held, { do: "commit", which: "a" }, { do: "commit", which: "b" }, { do: "disarm" }, { do: "retry" }, { do: "boot" }]);
  if (keep) {
    const [, , b, , retried, end] = keep.steps;
    ck("A 沒寫完時送另一份賽果：拒絕，不入帳", b.ret.stage === "derived_pending" && !b.sum.disk.hasB && b.sum.journal !== null, JSON.stringify(b.ret));
    ck("排除之後 A 補完", retried.ret.ok === true && end.sum.seasonDisk === mobaBase.seasonDisk + 1 && end.sum.heroDisk === mobaBase.heroDisk + 10, JSON.stringify(retried.ret));
    ck("排除之後還是只有 A 這筆帳", end.sum.disk.hasA && !end.sum.disk.hasB && end.sum.disk.tx === mobaBase.disk.tx + 1, JSON.stringify(end.sum.disk));
  }
  //  同一份 sessionId 再開一次賽（取消排隊會把 attempt 歸零）：是另一場，要算。
  const reuse = run(FX.moba, [
    { do: "commit", which: "a" },
    { do: "requeue" }, { do: "drive" }, { do: "commitOther", n: 1 },
    { do: "requeue" }, { do: "cancelQueue" }, { do: "requeue" }, { do: "drive" }, { do: "commitOther", n: 2 },
  ]);
  if (reuse) {
    const first = reuse.steps[2].sum.mem.sessionId, second = reuse.steps[7].sum.mem.sessionId;
    ck("這個序列真的讓 sessionId 重複（前提成立）", !!first && first === second, `${first} / ${second}`);
    const end = last(reuse);
    ck("sessionId 重複的另一場：入帳", end.ret.ok === true && end.sum.disk.tx === mobaBase.disk.tx + 3, JSON.stringify(end.ret));
    ck("sessionId 重複的另一場：熟練照算（Review 重現時被略過）", end.sum.heroDisk === mobaBase.heroDisk + 30, end.sum.heroDisk);
    ck("sessionId 重複的另一場：Season 照記", end.sum.seasonDisk === mobaBase.seasonDisk + 3, end.sum.seasonDisk);
  }
  //  一般對戰失敗 → 提示 → 放棄：提示要清掉，不能永遠掛著。
  const general = run(FX.moba, [
    { do: "commit", which: "a" }, { do: "requeue" }, { do: "drive" },
    { do: "arm", at: 1, mode: "sticky" }, { do: "commitOther", n: 1 }, { do: "disarm" },
    { do: "boot" }, { do: "abandon" }, { do: "boot" },
  ]);
  if (general) {
    const failed = general.steps[4], reload = general.steps[6], gone = general.steps[7];
    ck("一般對戰失敗：提示、不入帳", failed.sum.alertMem === "match" && failed.sum.disk.tx === mobaBase.disk.tx + 1, JSON.stringify(failed.ret));
    ck("一般對戰失敗：熟練與 Season 不動", failed.sum.heroDisk === mobaBase.heroDisk + 10 && failed.sum.seasonDisk === mobaBase.seasonDisk + 1);
    ck("一般對戰失敗：重新整理後提示還在", reload.sum.alertMem === "match", reload.sum.alertMem);
    ck("放棄這場：提示與日誌都清掉", gone.sum.alertMem === null && gone.sum.journal === null, `${gone.sum.alertMem}/${gone.sum.journal}`);
  }
  //  快速練習：不寫熟練與 Season、沒有日誌；存檔失敗也不會要玩家去棄權。
  const practice = run(FX.moba, [
    { do: "commit", which: "a" }, { do: "practice" }, { do: "drive" },
    { do: "commitOther", n: 1, isPractice: true },
  ], { keepSnapshots: true });
  if (practice) {
    const p = last(practice).sum;
    ck("練習賽真的開賽（前提成立）", practice.steps[2].sum.sessionState === "launched", `${practice.steps[2].sum.sessionState} ${JSON.stringify(practice.steps[1].ret)} ${JSON.stringify(practice.steps[2].ret)}`);
    ck("練習賽：熟練與 Season 不動", p.heroDisk === mobaBase.heroDisk + 10 && p.seasonDisk === mobaBase.seasonDisk + 1, `${p.heroDisk}/${p.seasonDisk}`);
    ck("練習賽：沒有留下日誌", p.journal === null, p.journal);
  }
  const pf = run(FX.moba, [
    { do: "commit", which: "a" }, { do: "practice" }, { do: "drive" },
    { do: "arm", at: 1, mode: "sticky" }, { do: "commitOther", n: 1, isPractice: true }, { do: "disarm" },
  ]);
  if (pf) {
    const p = pf.steps[4].sum;
    ck("練習賽存檔失敗：只提示沒存到，不要求棄權", p.alertMem === "save", p.alertMem);
    ck("練習賽存檔失敗：熟練與 Season 不動", p.heroDisk === mobaBase.heroDisk + 10 && p.seasonDisk === mobaBase.seasonDisk + 1);
  }
  //  還沒開打的場次也要跟著棄權結束，否則賽果還是進得來。
  const created = run(FX.moba, [{ do: "forceCreated" }, { do: "forfeit" }, { do: "commit", which: "a" }]);
  if (created) {
    const f = created.steps[1], c = created.steps[2];
    ck("created 場次棄權：場次一起結束", f.ret.ok === true && f.sum.sessionState === "cancelled", `${JSON.stringify(f.ret)} ${f.sum.sessionState}`);
    ck("created 場次棄權後送賽果：拒絕", c.ret.stage === "given_up" && !c.sum.disk.hasA && c.sum.disk.fixture === "forfeited", JSON.stringify(c.ret));
  }
  const corrupt = run(FX.moba, [{ do: "boot" }], { from: freeze({ storage: { ...JSON.parse(fs.readFileSync(FX.moba, "utf8")).storage, [JOURNAL_KEY]: "{broken" }, session: {}, clock: 1800000000000 }) });
  if (corrupt) ck("日誌壞掉：丟掉並留下紀錄", last(corrupt).sum.journal === null && last(corrupt).sum.audit.includes("journal_corrupt"), last(corrupt).sum.audit.join(","));
}

// ── §14 識別 ─────────────────────────────────────────────────────────────
section("§14 穩定識別");
{
  const { commitKeyOf } = await import("../src/platform/persistence/matchCommit.js");
  const origin = { fixtureId: "fx:moba:abc", competitionId: "comp:moba:s3:official:regular" };
  ck("同一賽程、不同場次：識別相同", commitKeyOf({ sessionId: "s1", origin }, "m1") === commitKeyOf({ sessionId: "s2", origin }, "m2"));
  ck("同一賽程 id、不同賽季：識別不同", commitKeyOf({ origin }, "m") !== commitKeyOf({ origin: { ...origin, competitionId: "comp:moba:s4:official:regular" } }, "m"));
  ck("沒有賽程：同一次開賽，賽果不同也是同一場", commitKeyOf({ sessionId: "s1", launchedAt: 5, origin: {} }, "m1") === commitKeyOf({ sessionId: "s1", launchedAt: 5, origin: {} }, "m2"));
  ck("沒有賽程：sessionId 重複但另一次開賽，不是同一場", commitKeyOf({ sessionId: "s1", launchedAt: 5, origin: {} }, "m") !== commitKeyOf({ sessionId: "s1", launchedAt: 6, origin: {} }, "m"));
  ck("沒有場次：用比賽 id", commitKeyOf(null, "m1") !== commitKeyOf(null, "m2"));
  ck("BO3：已打張數不同，識別不同", commitKeyOf({ origin, series: { maps: [] } }, "m") !== commitKeyOf({ origin, series: { maps: [{}] } }, "m"));
}

console.log("");
if (failures.length) console.log(`紅的（前 20 條）：\n${failures.slice(0, 20).map((f) => `  ${f}`).join("\n")}`);
console.log(`BP-9 P0-A：${passed}/${passed + failed} ${failed ? "FAIL" : "PASS"}`);
process.exit(failed ? 1 : 0);
