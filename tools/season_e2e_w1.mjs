#!/usr/bin/env node
// ============================================================================
//  tools/season_e2e_w1.mjs — Season End-to-End Audit v1 W1：同一份生涯，真模擬走完整季
//
//  執行（可重複跑同一個 --dir，會從 state.json 接著跑）：
//    node tools/season_e2e_w1.mjs --dir=<repo 外資料夾> [--target-day=300] [--max-matches=30] [--scenario=standard]
//  結束碼：0 跑到目標、10 這一段跑完（再跑一次接著走）、3 遇到阻斷（已存 checkpoint）、4 記憶體不夠、1 程式錯誤。
//
//  ── 這一支的紅線（Owner 2026-11-04）────────────────────────────────
//  · **賽果只來自真模擬**：MOBA 走 prepareLiveMatch → LogicEngine；CS 走 simulateFps → buildMatchResult。
//    不得直接寫勝負，也不走 forfeit。賽程狀態一律由 reportMatchResult 回寫。
//  · **只呼叫既有 Store Action**：startFixtureMatch → 房間 → createMatchSession → launchMatchSession →
//    settle（與 useBattleFeed／settleCsMatch 同一條），沒有第二套賽季、賽程或時間規則。
//  · **遇到阻斷就停**：存 checkpoint、寫 blockers.jsonl，不改日曆規則，也不繞過去。
//  · **不設勝率或經濟門檻**：這裡只查流程與資料正確性（violations.jsonl）。
//
//  ── 與真實遊玩的差異（照實寫進報告）──────────────────────────────
//  · 沒有 UI、沒有 3D。Hero Progress 與 Season 紀錄照寫；MOBA 的 Replay buffer 是畫面層，沒有跑。
//  · MOBA 選角用 balance runner 的 mirroredRoster（兩邊同英雄），不是玩家在 Ban/Pick 選的。
//  · CS 的 T／CT 戰術由 seed 挑，沒有四層戰術部署（tacticalLayout=null）。地圖 Veto 走真的 applyCsMapVeto。
//  · 比賽一律跑到自然終局，沒有用快速完成。
//  · 時鐘是虛擬的（Date.now 被換掉），讓場次逾時與續跑可重現。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

// ── CS worker：一個行程只跑一張地圖，跑完就釋放記憶體 ─────────────────────
if (arg("cs-worker")) {
  process.chdir(ROOT);
  const job = JSON.parse(fs.readFileSync(arg("cs-worker"), "utf8"));
  const { loadFpsMajorTestApi } = await import("./lib/fpsMajorTestApi.mjs");
  const api = await loadFpsMajorTestApi(fs.readFileSync("src/battle/fps/EsportsFPS3D.jsx", "utf8"));
  const lib = api.TACTICS_DB[job.mapKey];
  const tacticT = lib.t[job.seed % lib.t.length], tacticCT = lib.ct[(job.seed >>> 3) % lib.ct.length];
  //  與 EsportsFPS3D 的 normalRoster 相同：我方是 t，對手是內建 ct 名單（CsMatchScreen 沒有傳對手名單）。
  const rs = [...job.roster.map((p) => ({ ...p, side: "t" })), ...api.ROSTER.filter((p) => p.side === "ct")];
  const started = performance.now();
  const sim = api.simulateFps(job.mapKey, tacticT, tacticCT, job.seed, rs, null, "major.v1");
  const raw = api.buildMatchResult(sim, { tacticT, tacticCT, tName: job.teamName, ctName: "Compulsary", seed: job.seed });
  fs.writeFileSync(arg("out"), JSON.stringify({ raw, tacticT: { id: tacticT.id, name: tacticT.name, type: tacticT.type }, tacticCT: tacticCT.id, completed: sim.completed, frames: sim.frames.length, rounds: sim.roundHist.length, ms: Math.round(performance.now() - started) }));
  process.exit(0);
}

// ── 記憶體假 localStorage（一定要在 import store 之前）──────────────────
const COLD = arg("cold");
const DIR = arg("dir");
if (!COLD && !DIR) { console.error("需要 --dir"); process.exit(2); }
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  key: (i) => [...storage.keys()][i] ?? null,
  get length() { return storage.size; },
};

const STATE = DIR ? path.join(DIR, "state.json") : null;
let saved = null;
if (COLD) {
  saved = JSON.parse(fs.readFileSync(COLD, "utf8"));
} else if (fs.existsSync(STATE)) {
  saved = JSON.parse(fs.readFileSync(STATE, "utf8"));
}
for (const [k, v] of Object.entries(saved?.storage ?? {})) storage.set(k, v);
let clock = saved?.clock ?? 1800000000000;
Date.now = () => clock;
const tick = (ms = 1000) => { clock += ms; return clock; };

const { useProfileStore } = await import("../src/platform/profileStore.js");
const { useHeroProgressStore } = await import("../src/hero/heroProgressStore.js");
const { useSeasonStore } = await import("../src/platform/seasonStore.js");
const { CLOUD_PROFILE_KEYS } = await import("../src/platform/persistence/saveBundle.js");
const SS = await import("../src/platform/competition/seasonState.js");
const st = () => useProfileStore.getState();
const modes = ["moba", "cs"];
const seasonOf = (m) => st().competitionByMode?.[m] ?? null;
const auxOf = () => ({ seasonHistory: (useSeasonStore.getState().history ?? []).length, heroProgress: sha(stable(useHeroProgressStore.getState().progress ?? useHeroProgressStore.getState().heroes ?? null)) });
const digestOf = () => { const s = st(); const keys = {}; for (const k of CLOUD_PROFILE_KEYS) keys[k] = sha(stable(s[k] ?? null)); return { all: sha(stable(keys)), keys, aux: auxOf() }; };

// ── 冷啟動：新行程、新 Store，從序列化的存檔讀回，再查一次 ────────────────
if (COLD) {
  const out = { label: saved.label, checks: [] };
  const ck = (n, ok, d = "") => out.checks.push({ n, ok: !!ok, d: String(d).slice(0, 300) });
  const got = digestOf();
  const diff = Object.keys(got.keys).filter((k) => got.keys[k] !== saved.digest.keys[k]);
  ck("冷啟動讀回，所有雲端存檔欄位與寫入當下相同", diff.length === 0, diff.join(","));
  ck("Season 紀錄與英雄熟練度相同", stable(got.aux) === stable(saved.digest.aux), `${stable(got.aux)} vs ${stable(saved.digest.aux)}`);
  const quarantined = [...storage.keys()].filter((k) => k.endsWith(".corrupt"));
  ck("沒有產生隔離檔", quarantined.length === 0, quarantined.join(","));
  const fundsBefore = st().finance?.funds;
  const txBefore = Object.keys(st().processedMatchTransactions ?? {}).length;
  const awardsBefore = stable(st().processedCompetitionAwards ?? {});
  for (const m of modes) if (seasonOf(m)?.schema) st()._sealSeasonIfFinished(m);
  ck("重跑封存不會多發獎金", st().finance?.funds === fundsBefore && stable(st().processedCompetitionAwards ?? {}) === awardsBefore, `${fundsBefore} → ${st().finance?.funds}`);
  if (saved.lastTx) {
    const again = st().applyMatchProgress(saved.lastTx);
    ck("把上一場的交易再送一次，判定已入帳、不重複發獎", again?.alreadyApplied === true && st().finance?.funds === fundsBefore && Object.keys(st().processedMatchTransactions ?? {}).length === txBefore, `alreadyApplied=${again?.alreadyApplied}`);
  }
  st().save();
  const after = digestOf();
  const moved = Object.keys(after.keys).filter((k) => after.keys[k] !== got.keys[k]);
  ck("再存一次，雲端存檔欄位不變", moved.length === 0, moved.join(","));
  ck("世界時間沒有被讀檔推進", st().meta?.days === saved.day, `${st().meta?.days} vs ${saved.day}`);
  console.log(JSON.stringify(out));
  process.exit(0);
}

// ── 真比賽用到的模組 ──────────────────────────────────────────────────────
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
const { settleMatchThroughSession, outcomeFromBattleResult } = await import("../src/platform/progress/settleMatchBoundary.js");
const { settleCsMatch } = await import("../src/platform/progress/settleCsMatch.js");
const { toCsMatchResult } = await import("../src/platform/contracts/CsMatchResult.js");
const { csResultToTransaction } = await import("../src/platform/progress/adapters/csProgressAdapter.js");
const { toFpsRoster } = await import("../src/battle/fps/fpsRoster.js");
const { TRAINING_COURSES } = await import("../src/data/playerModel.js");
const { appRoster } = await import("./lib/liveGolden.mjs");
const Runner = await import("./balance/moba_items_balance_runner.mjs");
const RM = await Runner.modules();

const TARGET = Number(arg("target-day") ?? 300);
const MAX_MATCHES = Number(arg("max-matches") ?? 30);
const SCENARIO = arg("scenario") ?? "standard";
fs.mkdirSync(path.join(DIR, "checkpoints"), { recursive: true });
fs.mkdirSync(path.join(DIR, "tmp"), { recursive: true });
const append = (f, row) => fs.appendFileSync(path.join(DIR, f), JSON.stringify(row) + "\n");
const say = (line) => { fs.appendFileSync(path.join(DIR, "progress.log"), line + "\n"); console.log(line); };

const meta = saved?.meta ?? { matches: 0, moba: 0, cs: 0, csMaps: 0, fixtures: 0, checkpoint: 0, lastTrainDay: 0, trainings: 0, offseasons: [], finals: {}, rolled: {}, startedFunds: null, wallMs: 0 };
let lastTx = saved?.lastTx ?? null;
const violation = (kind, data = {}) => { append("violations.jsonl", { day: st().meta?.days, kind, ...data }); say(`⚠ VIOLATION ${kind} ${JSON.stringify(data).slice(0, 180)}`); };

function persist() {
  const body = JSON.stringify({ storage: Object.fromEntries(storage), clock, meta, lastTx });
  const tmp = STATE + ".tmp";
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, STATE);
}
function checkpoint(label) {
  meta.checkpoint++;
  const name = `${String(meta.checkpoint).padStart(3, "0")}-${label}.json`;
  const file = path.join(DIR, "checkpoints", name);
  st().save();
  const digest = digestOf();
  fs.writeFileSync(file, JSON.stringify({ label, day: st().meta?.days, storage: Object.fromEntries(storage), clock, digest, lastTx }));
  const r = spawnSync(process.execPath, [SELF, `--cold=${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26, timeout: 180000, windowsHide: true });
  let res = null;
  try { res = JSON.parse(String(r.stdout).trim().split("\n").filter(Boolean).pop()); } catch { /* 下面報 */ }
  const bad = res ? res.checks.filter((c) => !c.ok) : [{ n: "冷啟動行程失敗", d: String(r.stderr).slice(-300) }];
  append("cold.jsonl", { label, day: st().meta?.days, file: name, digest: digest.all, checks: res?.checks?.length ?? 0, failed: bad });
  say(`COLD ${label} 第 ${st().meta?.days} 天 ${res ? `${res.checks.length - bad.length}/${res.checks.length}` : "FAILED"}${bad.length ? " ❌ " + JSON.stringify(bad).slice(0, 200) : ""}`);
  for (const b of bad) violation("cold_start", { label, check: b.n, detail: b.d });
}
function stop(code, kind, data = {}) {
  append("blockers.jsonl", { day: st().meta?.days, kind, ...data });
  say(`BLOCKER ${kind} 第 ${st().meta?.days} 天 ${JSON.stringify(data).slice(0, 300)}`);
  checkpoint(`blocker-${kind}`);
  persist();
  process.exit(code);
}
function memoryOk() {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$o=Get-CimInstance Win32_OperatingSystem;\"{0} {1}\" -f [int]($o.FreePhysicalMemory/1024),[int]($o.FreeVirtualMemory/1024)"], { encoding: "utf8", windowsHide: true });
  const [p, c] = String(r.stdout).trim().split(/\s+/).map(Number);
  return { ok: !(p < 900 || c < 3000), p, c };
}
async function waitForMemory() {
  for (let i = 0; i < 20; i++) {
    const m = memoryOk();
    if (m.ok) return;
    if (i === 0) say(`HOLD 記憶體不足，等待 physical=${m.p} commit=${m.c}`);
    await new Promise((r) => setTimeout(r, 60000));
  }
  const m = memoryOk();
  if (!m.ok) { say(`STOP_MEMORY physical=${m.p} commit=${m.c}`); persist(); process.exit(4); }
}

// ── 開局 ──────────────────────────────────────────────────────────────────
if (!saved) {
  st().reset?.();
  st().startNewGame(SCENARIO);
  meta.startedFunds = st().finance?.funds;
  say(`START scenario=${SCENARIO} funds=${meta.startedFunds} day=${st().meta?.days} flags v21=${FEATURE_FLAGS.mobaTacticalDirectorV21}/${FEATURE_FLAGS.mobaChallengeV21}`);
  if (FEATURE_FLAGS.mobaTacticalDirectorV21 !== false || FEATURE_FLAGS.mobaChallengeV21 !== false) stop(3, "v21_flag_on");
  for (const m of modes) { const r = st().ensureCompetitionSeason(m); if (!r.ok) stop(3, "season_open_failed", { mode: m, errors: r.errors }); }
  checkpoint("new-game");
}

// ── 進房到開賽：與 useMatchFlow 同一個順序 ────────────────────────────────
function roomToLaunch(fixtureId) {
  const started = st().startFixtureMatch(fixtureId, tick());
  if (!started.ok) return { ok: false, step: "startFixtureMatch", reason: started.reason ?? started.errors };
  for (let i = 0; i < 40; i++) {
    const rs = st().matchmaking?.room?.state;
    if (rs === "confirmed") break;
    if (rs === "ready_check") { const c = st().confirmMatchReady(tick()); if (!c.ok && !/已確認|重複/.test(JSON.stringify(c.errors ?? ""))) { /* 已確認時繼續輪詢對手 */ } }
    st().pollMatchRoom(tick(1500));
  }
  if (st().matchmaking?.room?.state !== "confirmed") return { ok: false, step: "room", reason: st().matchmaking?.room?.state };
  const made = st().createMatchSession(tick());
  if (!made.ok) return { ok: false, step: "createMatchSession", reason: made.errors };
  const launched = st().launchMatchSession(tick());
  if (!launched.ok) return { ok: false, step: "launchMatchSession", reason: launched.errors };
  return { ok: true, launch: st().matchmaking?.launch };
}

// ── MOBA：與 useLocalServer／useBattleFeed 同一條 ─────────────────────────
function playMoba(fixture) {
  const t0 = performance.now();
  const launch = st().matchmaking?.launch;
  const rosterRaw = Runner.mirroredRoster(launch.seed, RM);
  const tactic = mobaTacticById(MOBA_TACTICS[launch.seed % MOBA_TACTICS.length].tacticId);
  const prepared = prepareLiveMatch({
    opts: { seed: launch.seed, roster: appRoster(rosterRaw), tactic, buildStrategy: "standard", opponentId: launch.opponentId ?? null, sessionId: launch.sessionId ?? null, mode: "moba" },
    ruleset: resolveLiveRuleset({ flags: FEATURE_FLAGS, dev: null, allowTool: false }).ruleset,
    seed: launch.seed, seedSource: "session",
    profile: { players: st().players ?? [], lineup: st().lineup ?? null },
    heroProgress: { loadout: useHeroProgressStore.getState().getLoadout() },
    opponentTeam: launch.opponentId ? aiTeamById(launch.opponentId) : null,
  });
  if (!prepared.ok) return { ok: false, step: "prepareLiveMatch", reason: prepared.errors };
  if (prepared.setup?.rulesetId !== "career.v20") violation("moba_not_v20", { ruleset: prepared.setup?.rulesetId });
  const e = prepared.engine;
  const tracker = new BattleEventTracker();
  const log = [];
  let snap = e.snapshot();
  for (let i = 1; i * 0.5 <= 3600 && !e.over; i++) {
    e.tick(0.5);
    if (i % 2 === 0) { snap = e.snapshot(); for (const ev of tracker.update(snap)) log.push(ev); }
  }
  snap = e.snapshot();
  for (const ev of tracker.update(snap)) log.push(ev);
  if (!snap.over) return { ok: false, step: "engine_not_over", reason: `ts=${snap.ts}` };
  const ps = st();
  const blueName = selectTeamName(ps), redName = selectOpponentName(ps);
  const result = snapshotToBattleResult(snap, log, {
    heroAssign: Object.fromEntries(Object.entries(rosterRaw).map(([pid, r]) => [pid, r.heroId])),
    teams: { blue: { ...TEAMS.blue, ...(blueName ? { name: blueName } : {}) }, red: { ...TEAMS.red, ...(redName ? { name: redName } : {}) } },
  });
  useHeroProgressStore.getState().recordBattleResult(result);
  const season = useSeasonStore.getState();
  let streak = 0;
  for (const h of season.history ?? []) { if (h?.winner === "blue") streak++; else break; }
  const tx = mobaResultToTransaction(result, { players: ps.players ?? [], lineup: ps.lineup ?? null, streak, fansNow: ps.meta?.fans ?? 0, origin: ps.matchmaking?.session?.origin ?? null });
  const id = mobaMatchId(result);
  const settled = settleMatchThroughSession({ mode: "moba", outcome: outcomeFromBattleResult(result, id), transaction: tx });
  useSeasonStore.getState().recordResult(result);
  return { ok: true, tx, receipt: settled.receipt, viaSession: settled.viaSession, errors: settled.errors, row: { matchId: id, engine: "LogicEngine", ruleset: prepared.setup?.rulesetId, seed: launch.seed, tactic: tactic.tacticId, opponent: launch.opponentId, winner: result.winner === "blue" ? "us" : "opponent", score: result.score, durationSec: result.duration, ms: Math.round(performance.now() - t0) } };
}

// ── CS：一張地圖一個行程；BO3 走 store 的 series 狀態 ─────────────────────
async function playCsMap(fixture) {
  const t0 = performance.now();
  for (let i = 0; i < 8; i++) {
    const v = st().csMapSelectionView();
    if (v.resolved || !v.selection) break;
    let acted = false;
    for (const k of ["mirage", "dust2", "inferno"]) { const r = st().applyCsMapVeto(k, tick()); if (r.ok) { acted = true; break; } }
    if (!acted) return { ok: false, step: "applyCsMapVeto", reason: v.selection?.status };
  }
  const view = st().csMapSelectionView();
  const launch = st().matchmaking?.launch;
  const seed = launch?.seed;
  const mapKey = view.mapKey;
  if (!mapKey) return { ok: false, step: "no_map", reason: view.selection?.status };
  const roster = toFpsRoster(st().players ?? [], st().csLineup);
  if (!roster) return { ok: false, step: "no_cs_roster", reason: "toFpsRoster null" };
  const job = path.join(DIR, "tmp", "cs-job.json"), out = path.join(DIR, "tmp", "cs-out.json");
  fs.writeFileSync(job, JSON.stringify({ mapKey, seed, roster, teamName: st().team?.name }));
  if (fs.existsSync(out)) fs.rmSync(out);
  await waitForMemory();
  const r = spawnSync(process.execPath, ["--max-old-space-size=3584", SELF, `--cs-worker=${job}`, `--out=${out}`], { cwd: ROOT, encoding: "utf8", timeout: 420000, maxBuffer: 1 << 24, windowsHide: true });
  if (r.status !== 0 || !fs.existsSync(out)) return { ok: false, step: "cs_worker", reason: `exit=${r.status} ${String(r.stderr).slice(-400)}` };
  const w = JSON.parse(fs.readFileSync(out, "utf8"));
  if (!w.completed) return { ok: false, step: "cs_not_completed", reason: `rounds=${w.rounds}` };
  const cr = toCsMatchResult(w.raw, { seed, mapKey, mapName: mapKey, tacticId: w.tacticT.id, tacticName: w.tacticT.name, tacticType: w.tacticT.type, roster });
  const ps = st();
  const hist = ps.csHistory ?? [];
  let streak = 0;
  for (const h of hist) { if (h?.winner === "us") streak++; else break; }
  const tx = csResultToTransaction(cr, { players: ps.players ?? [], streak, fansNow: ps.meta?.fans ?? 0, origin: ps.matchmaking?.session?.origin ?? null });
  const receipt = settleCsMatch(cr);
  return { ok: true, tx, receipt, viaSession: true, errors: [], row: { matchId: cr.matchId, engine: "simulateFps", seed, map: mapKey, tacticT: w.tacticT.id, tacticCT: w.tacticCT, winner: cr.winner === "us" ? "us" : "opponent", score: { us: cr.ourScore, opponent: cr.enemyScore }, rounds: w.rounds, frames: w.frames, ms: Math.round(performance.now() - t0) } };
}

const money = (receipt) => Number(receipt?.team?.money ?? 0);
const fundsNow = () => Number(st().finance?.funds ?? 0);
const txCount = () => Object.keys(st().processedMatchTransactions ?? {}).length;
const awardsCount = () => Object.keys(st().processedCompetitionAwards ?? {}).length;

function afterMap(mode, fixture, res, before) {
  const dFunds = fundsNow() - before.funds;
  const award = awardsCount() !== before.awards;
  const expected = money(res.receipt);
  const row = { ...res.row, fixture: fixture.id, mode, season: seasonOf(mode)?.season, day: st().meta?.days, viaSession: res.viaSession, applied: res.receipt?.applied ?? res.receipt?.ok ?? null, money: expected, fundsBefore: before.funds, fundsAfter: fundsNow(), award };
  append("matches.jsonl", row);
  if (txCount() !== before.tx + 1) violation("tx_not_exactly_one", { fixture: fixture.id, before: before.tx, after: txCount() });
  if (!res.viaSession) violation("not_via_session", { fixture: fixture.id });
  if (res.errors?.length) violation("settle_errors", { fixture: fixture.id, errors: res.errors });
  //  入帳金額對得起來：receipt.team.money 與 finance.funds 都是「元」。封存同場發獎時另外記，不混在一起比。
  if (!award && dFunds !== expected) violation("funds_mismatch", { fixture: fixture.id, dFunds, money: expected });
  //  重送同一筆交易：不得重複發獎
  const f0 = fundsNow(), t0 = txCount();
  const again = st().applyMatchProgress(res.tx);
  if (again?.alreadyApplied !== true || fundsNow() !== f0 || txCount() !== t0) violation("replay_not_idempotent", { fixture: fixture.id, alreadyApplied: again?.alreadyApplied });
  lastTx = res.tx;
  meta.matches++; meta[mode]++; if (mode === "cs") meta.csMaps++;
  say(`MATCH #${meta.matches} 第 ${st().meta?.days} 天 ${mode} S${row.season} ${row.winner === "us" ? "勝" : "敗"} ${row.score?.us ?? row.score?.blue ?? ""}:${row.score?.opponent ?? row.score?.red ?? ""} ${row.map ?? ""} ${row.ms}ms 資金 ${row.fundsAfter}`);
}

function afterFixture(mode, fixture) {
  const s = seasonOf(mode);
  const f = SS.fixtureById(s, fixture.id);
  if (!["completed"].includes(f?.status)) violation("fixture_not_completed", { fixture: fixture.id, status: f?.status });
  const outs = (Array.isArray(s.outcomes) ? s.outcomes : Object.values(s.outcomes ?? {})).filter((o) => o?.fixtureId === fixture.id);
  if (outs.length !== 1) violation("outcome_count", { fixture: fixture.id, count: outs.length });
  if (outs[0]?.resultSource !== "engine") violation("outcome_not_engine", { fixture: fixture.id, source: outs[0]?.resultSource });
  meta.fixtures++;
}

/** 排名同源：積分榜要等於賽果累加，不是另算一份。 */
function checkStandings(mode, label) {
  const s = seasonOf(mode);
  if (!s?.schema) return;
  const v = st().competitionView(mode);
  const rows = v.standings?.rows ?? [];
  const me = rows.find((r) => r.teamId === st().team.id);
  if (!me) return;
  //  由賽程與賽果重算玩家的主賽事戰績，一場一場比（不是拿積分榜自己比自己）。
  const regular = new Set(SS.regularFixturesOf(s).map((f) => f.id));
  const outs = (Array.isArray(s.outcomes) ? s.outcomes : Object.values(s.outcomes ?? {})).filter((o) => regular.has(o?.fixtureId) && [SS.fixtureById(s, o.fixtureId)?.sideA, SS.fixtureById(s, o.fixtureId)?.sideB].includes(st().team.id));
  const wins = outs.filter((o) => o.winner === st().team.id).length;
  if (me.played !== outs.length || me.wins !== wins || me.losses !== outs.length - wins) violation("standings_not_from_outcomes", { mode, label, rows: { played: me.played, wins: me.wins, losses: me.losses }, outcomes: { played: outs.length, wins } });
  append("standings.jsonl", { label, mode, season: s.season, day: st().meta?.days, rank: me.rank, played: me.played, wins: me.wins, losses: me.losses, points: me.points });
}

async function playFixture(mode, fixture) {
  await waitForMemory();
  if (!st().matchEntry(mode).ok) {
    const filled = Object.values((mode === "cs" ? st().csLineup : st().lineup) ?? {}).filter(Boolean).length;
    append("events.jsonl", { day: st().meta?.days, kind: "lineup_autofill", mode, filled, why: "出賽申請單不成立，走玩家按的自動填入" });
    say(`LINEUP 第 ${st().meta?.days} 天 ${mode} 先發 ${filled} 人，自動填入`);
    st().autoFillLineup(mode);
    if (!st().matchEntry(mode).ok) stop(3, "lineup_cannot_fill", { mode, errors: st().matchEntry(mode).errors });
  }
  const up = roomToLaunch(fixture.id);
  if (!up.ok) stop(3, "launch_failed", { mode, fixture: fixture.id, step: up.step, reason: up.reason });
  if (mode === "moba") {
    const before = { funds: fundsNow(), tx: txCount(), awards: awardsCount() };
    const res = playMoba(fixture);
    if (!res.ok) stop(3, "moba_failed", { fixture: fixture.id, step: res.step, reason: res.reason });
    afterMap(mode, fixture, res, before);
  } else {
    for (let map = 0; map < 5; map++) {
      const before = { funds: fundsNow(), tx: txCount(), awards: awardsCount() };
      const res = await playCsMap(fixture);
      if (!res.ok) stop(3, "cs_failed", { fixture: fixture.id, map, step: res.step, reason: res.reason });
      afterMap(mode, fixture, res, before);
      const series = st().activeSeriesView();
      if (!series || series.decided) break;
      const resumed = st().resumeMatchSession(tick());
      if (!resumed.ok) stop(3, "series_resume_failed", { fixture: fixture.id, errors: resumed.errors });
    }
  }
  afterFixture(mode, fixture);
}

function trainWeekly() {
  const day = st().meta?.days;
  if (day - meta.lastTrainDay < 7) return;
  meta.lastTrainDay = day;
  const starters = new Set([...Object.values(st().lineup ?? {}), ...Object.values(st().csLineup ?? {})].filter(Boolean));
  const idle = (st().players ?? []).filter((p) => !p.training);
  const pick = [...idle.filter((p) => !starters.has(p.id)), ...idle.filter((p) => starters.has(p.id))].slice(0, 2);
  const courses = TRAINING_COURSES.filter((c) => c.id !== "rest");
  for (const p of pick) {
    const c = courses[meta.trainings % courses.length];
    const ok = st().assignTraining(p.id, c.id);
    append("events.jsonl", { day, kind: "training", player: p.id, course: c.id, ok, energy: p.energy });
    if (ok) meta.trainings++;
  }
}

function handleSeasons() {
  for (const m of modes) {
    const s = seasonOf(m);
    if (!s?.schema || !s.final) continue;
    const key = `${m}:${s.season}`;
    if (meta.finals[key]) continue;
    const day = st().meta?.days;
    const honors = (st().honors ?? []).length;
    const histBefore = m === "moba" ? (st().competitionHistory ?? []).length : (st().competitionHistoryByMode?.cs ?? []).length;
    meta.finals[key] = { day, funds: fundsNow(), awards: awardsCount(), honors };
    checkStandings(m, `final:${key}`);
    say(`FINAL ${key} 第 ${day} 天 名次帳本 ${awardsCount()} 資金 ${fundsNow()}`);
    checkpoint(`final-${m}-s${s.season}`);
    const r = m === "moba" ? st().rollToNextCompetitionSeason() : st().rollToNextCsSeason();
    const histAfter = m === "moba" ? (st().competitionHistory ?? []).length : (st().competitionHistoryByMode?.cs ?? []).length;
    meta.rolled[key] = { day, ok: r.ok, reason: r.reason ?? null, histBefore, histAfter };
    if (!r.ok) stop(3, "roll_failed", { mode: m, season: s.season, reason: r.reason });
    if (histAfter !== histBefore + 1) violation("history_not_plus_one", { mode: m, histBefore, histAfter });
    say(`ROLL ${key} → S${seasonOf(m)?.season} 第 ${day} 天，歷史 ${histBefore} → ${histAfter}`);
    checkpoint(`roll-${m}-s${s.season}`);
  }
}

function handleOffSeason() {
  const view = st().offSeasonSessionView();
  const day = st().meta?.days;
  const pendingFixtures = Object.fromEntries(modes.map((m) => [m, (seasonOf(m)?.fixtures ?? []).filter((f) => (f.sideA === st().team.id || f.sideB === st().team.id) && !["completed", "forfeited"].includes(f.status)).length]));
  const entry = { day, careerYear: view.careerYear, expiring: view.expiring?.length ?? 0, intents: view.intents?.length ?? 0, fundsAtOpen: view.fundsAtOpen, pendingFixtures, renewed: [], renewFailed: [], rosterBefore: (st().players ?? []).length };
  say(`OFFSEASON 第 ${day} 天 第 ${view.careerYear} 年度 到期 ${entry.expiring} 退役意向 ${entry.intents} 未打賽程 ${JSON.stringify(pendingFixtures)}`);
  checkpoint(`offseason-open-d${day}`);
  for (const c of view.expiring ?? []) {
    const r = st().renewPlayerContract(c.id);
    if (r.ok) entry.renewed.push({ id: c.id, cost: r.cost }); else entry.renewFailed.push({ id: c.id, reason: r.reason });
  }
  const done = st().completeOffSeason();
  entry.completed = done.ok;
  entry.rosterAfter = (st().players ?? []).length;
  entry.fundsAfter = fundsNow();
  meta.offseasons.push(entry);
  append("events.jsonl", { kind: "offseason", ...entry });
  if (!done.ok) stop(3, "offseason_cannot_complete", { day });
  say(`OFFSEASON 完成 續約 ${entry.renewed.length} 失敗 ${entry.renewFailed.length} 名單 ${entry.rosterBefore}→${entry.rosterAfter} 資金 ${entry.fundsAfter}`);
  checkpoint(`offseason-done-d${day}`);
}

// ── 主迴圈 ────────────────────────────────────────────────────────────────
const wall0 = performance.now();
let inSegment = 0;
let same = 0, lastDay = -1;
for (;;) {
  const day = Number(st().meta?.days) || 1;
  if (day >= TARGET) break;
  handleSeasons();
  const today = modes.flatMap((m) => {
    const s = seasonOf(m);
    return s?.schema ? (s.fixtures ?? []).filter((f) => (f.sideA === st().team.id || f.sideB === st().team.id) && !["completed", "forfeited"].includes(f.status) && SS.absoluteDayOf(s, f) <= day).map((f) => ({ m, f })) : [];
  });
  if (today.length) {
    const { m, f } = today[0];
    if (SS.absoluteDayOf(seasonOf(m), f) < day) violation("overdue_fixture", { fixture: f.id, due: SS.absoluteDayOf(seasonOf(m), f) });
    await playFixture(m, f);
    if (meta.fixtures === 1 || meta.matches === 1) checkpoint("first-match");
    if (m === "cs" && meta.cs === 1) checkpoint("first-cs-match");
    if (meta.fixtures % 10 === 0) { for (const x of modes) checkStandings(x, `every10:${meta.fixtures}`); checkpoint(`every10-f${meta.fixtures}`); }
    persist();
    inSegment++;
    if (inSegment >= MAX_MATCHES) { meta.wallMs += performance.now() - wall0; persist(); say(`SEGMENT 第 ${day} 天 累計 ${meta.matches} 場`); process.exit(10); }
    continue;
  }
  if (st().offSeasonSessionView().open) { handleOffSeason(); persist(); continue; }
  trainWeekly();
  const res = st().advanceToNextStop();
  if (res.ok === false || !(res.daysAdvanced > 0)) {
    const s2 = st().offSeasonSessionView().open;
    if (s2) { handleOffSeason(); persist(); continue; }
    const stillToday = modes.some((m) => { const s = seasonOf(m); return s?.schema && (s.fixtures ?? []).some((f) => (f.sideA === st().team.id || f.sideB === st().team.id) && !["completed", "forfeited"].includes(f.status) && SS.absoluteDayOf(s, f) <= day); });
    if (stillToday) continue;
    stop(3, "calendar_stuck", { reason: res.reason ?? null, stoppedBy: res.stoppedBy ?? null, stop: res.stop ?? null });
  }
  append("events.jsonl", { kind: "advance", from: day, to: st().meta?.days, stop: res.stop?.code ?? null, label: res.stop?.label ?? null, funds: fundsNow() });
  const now = Number(st().meta?.days) || 1;
  if (now === lastDay) { same++; if (same > 6) stop(3, "no_progress", { day: now }); } else same = 0;
  lastDay = now;
  persist();
}
handleSeasons();
for (const m of modes) checkStandings(m, "end");
checkpoint("end");
meta.done = true;
meta.wallMs += performance.now() - wall0;
persist();
const summary = { day: st().meta?.days, matches: meta.matches, moba: meta.moba, csMaps: meta.csMaps, fixtures: meta.fixtures, trainings: meta.trainings, offseasons: meta.offseasons, finals: meta.finals, rolled: meta.rolled, startedFunds: meta.startedFunds, funds: fundsNow(), checkpoints: meta.checkpoint };
fs.writeFileSync(path.join(DIR, "summary.json"), JSON.stringify(summary, null, 1));
say(`DONE 第 ${summary.day} 天 真比賽 ${summary.matches} 場（MOBA ${summary.moba}，CS 地圖 ${summary.csMaps}），賽程 ${summary.fixtures}，訓練 ${summary.trainings}，checkpoint ${summary.checkpoints}`);
process.exit(0);
