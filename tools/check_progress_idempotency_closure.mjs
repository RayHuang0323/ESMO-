#!/usr/bin/env node
// ============================================================================
//  tools/check_progress_idempotency_closure.mjs — 同一場比賽重複結算不得重複發獎（行為回歸＋反向測試）
//
//  2026-11-25 C1＋C2 Release Closure（Owner 核准）。背景：check_moba_stats28 §18 從 09-28（BattleResult 升 v3）起一直紅，
//  查明是斷言寫死 "BattleResult.v2"，冪等本身正確。Owner 要求另外補一支「真正的冪等回歸」，且故意破壞冪等時必須 FAIL。
//
//  做法（全部走真實模組，不 mock）：
//    · 真實 LogicEngine 打完整場 → snapshotToBattleResult → mobaResultToTransaction（唯一結算入口用的交易）
//    · commit(state, tx) 模擬呼叫端：applyProgressToState 回傳 nextState 就換上，回傳 null（已套用）就保留原 state
//    · 同一場比賽的重複結算以四種方式送進來：同一個 tx、存檔來回（JSON）後再送、tx 深拷貝、對同一份 BattleResult 重新產生 tx
//    · 每次重複之後，整份 state 必須與第一次結算後**逐位元相同**（資金、名氣、聲望、每位選手 XP／等級／天賦點／成長紀錄／體力、交易紀錄筆數…）
//    · 兩種帳本路徑都驗：未啟用存檔瘦身、已啟用（consented mark，帳本會被 slimLedger 縮小）
//    · 對照組：另一場不同的比賽必須照常入帳（防止「全部擋掉」也會綠）
//    · 反向測試：把同一套檢查套在兩個故意改壞的結算函式上——①忽略已處理帳本 ②同一場每次產生不同交易 id——必須判 FAIL
//
//  執行：repo 根目錄 `node tools/check_progress_idempotency_closure.mjs`（約 20–40 秒）
// ============================================================================
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = process.cwd();
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const { LogicEngine } = await import(u("src/LogicEngine.js"));
const { INITIAL_PLAYERS } = await import(u("src/data/players.js"));
const { snapshotToBattleResult } = await import(u("src/battle/battleResult.js"));
const { mobaResultToTransaction } = await import(u("src/platform/progress/adapters/mobaProgressAdapter.js"));
const { applyProgressToState } = await import(u("src/platform/progress/applyMatchProgress.js"));
const { SAVE_SLIM_VERSION, SLIM_CONSENTED_MODE, isSlimEnabled } = await import(u("src/platform/persistence/saveSlim.js"));

const A = [];
const ck = (name, ok, detail = "") => { A.push([name, !!ok]); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 真實引擎打一場（與 stats28 相同的推進方式，DT 0.5、上限 1800 秒）。 */
function playMatch(seed) {
  const eng = new LogicEngine(seed);
  for (let t = 0.5; t <= 1800 && !eng.over; t += 0.5) eng.tick(0.5);
  return snapshotToBattleResult(eng.snapshot(), []);
}
const txFor = (br) => mobaResultToTransaction(br, { players: clone(INITIAL_PLAYERS), streak: 0, fansNow: 1000 });

/** 呼叫端行為：拿到 nextState 就換上；null（已套用或被拒）就保留原 state。 */
const commitWith = (applyFn) => (state, tx) => { const r = applyFn(state, tx); return { state: r.nextState ?? state, receipt: r.receipt }; };

/** 報表用的關鍵數值（全量比較仍以整份 state 為準）。 */
const view = (s) => ({
  funds: s.finance?.funds, fans: s.meta?.fans, reputation: s.meta?.reputation,
  ledger: Object.keys(s.processedMatchTransactions || {}).length,
  players: (s.players || []).map((p) => [p.id, p.xp ?? p.progress?.xp ?? null, p.level ?? p.progress?.level ?? null, p.talentPoints ?? p.progress?.talentPoints ?? null]),
});

const baseState = (slim) => ({
  players: clone(INITIAL_PLAYERS), finance: { funds: 0 },
  meta: { fans: 0, reputation: 0, ...(slim ? { saveSlim: { v: SAVE_SLIM_VERSION, mode: SLIM_CONSENTED_MODE } } : {}) },
  processedMatchTransactions: {},
});

/**
 * 冪等檢查套件：回傳 { ok, rows }。real＝真實結算；反向測試把改壞的 applyFn 傳進來，期望 ok=false。
 * quiet＝反向測試時不逐條印。
 */
function idempotencySuite(applyFn, { seed, otherSeed, slim, quiet = false }) {
  const rows = [];
  const check = (name, ok, detail) => { rows.push([name, !!ok]); if (!quiet) ck(name, ok, detail); };
  const commit = commitWith(applyFn);
  const br = playMatch(seed), tx = txFor(br);
  const s0 = baseState(slim);
  const first = commit(s0, tx);
  const s1 = first.state;
  check(`[seed ${seed}${slim ? "，瘦身帳本" : ""}] 第一次結算確實入帳（資金、帳本 +1、至少一人 XP 增加）`,
    first.receipt?.applied === true && first.receipt?.alreadyApplied === false && view(s1).funds > view(s0).funds && view(s1).ledger === 1 &&
    s1.players.some((p, i) => JSON.stringify(p) !== JSON.stringify(s0.players[i])),
    JSON.stringify({ before: view(s0).funds, after: view(s1).funds, ledger: view(s1).ledger }));
  // 同一場比賽的四種重複結算
  const dupes = [
    ["同一個交易物件再送一次", () => commit(s1, tx)],
    ["存檔來回（JSON 序列化再讀回）後再送", () => commit(clone(s1), tx)],
    ["交易深拷貝（不靠物件同一性）", () => commit(s1, clone(tx))],
    ["對同一份 BattleResult 重新產生交易", () => commit(s1, txFor(br))],
  ];
  let chained = s1;
  for (const [label, fn] of dupes) {
    const r = fn();
    check(`[seed ${seed}${slim ? "，瘦身帳本" : ""}] ${label} ⇒ 整份 state 與第一次結算後逐位元相同、回條 alreadyApplied`,
      same(r.state, s1) && r.receipt?.alreadyApplied === true, JSON.stringify(view(r.state)));
    chained = commit(chained, tx).state;
  }
  check(`[seed ${seed}${slim ? "，瘦身帳本" : ""}] 連續重送 4 次後仍與第一次結算後相同（資金／XP／帳本不累積）`, same(chained, s1), JSON.stringify(view(chained)));
  // 對照組：不同比賽必須照常入帳
  const other = commit(s1, txFor(playMatch(otherSeed)));
  check(`[seed ${seed}${slim ? "，瘦身帳本" : ""}] 對照：另一場比賽（seed ${otherSeed}）照常入帳，帳本 1 → 2`,
    other.receipt?.applied === true && other.receipt?.alreadyApplied === false && view(other.state).ledger === 2 && view(other.state).funds > view(s1).funds,
    JSON.stringify({ funds: view(other.state).funds, ledger: view(other.state).ledger }));
  return { ok: rows.every(([, ok]) => ok), rows };
}

// ── 契約版本：明確寫死，不讀產品常數 ───────────────────────────────────────
const brProbe = playMatch(4242);
ck('BattleResult 契約版本＝"BattleResult.v3"（字面寫死，不與產品共用常數）', brProbe.schema === "BattleResult.v3", brProbe.schema);
ck("瘦身帳本路徑確實被啟用（否則第二組只是重跑第一組）", isSlimEnabled(baseState(true).meta) === true && isSlimEnabled(baseState(false).meta) === false);

// ── 真實結算：兩條帳本路徑 × 兩個 seed ─────────────────────────────────────
for (const slim of [false, true]) for (const [seed, otherSeed] of [[4242, 7], [2024, 99]]) idempotencySuite(applyProgressToState, { seed, otherSeed, slim });

// ── 反向測試：故意改壞冪等，同一套檢查必須 FAIL ─────────────────────────────
//  ① 忽略已處理帳本（每次都當成第一次）
const ignoreLedger = (state, tx) => {
  const r = applyProgressToState({ ...state, processedMatchTransactions: {} }, tx);
  return r.nextState ? { ...r, nextState: { ...r.nextState, processedMatchTransactions: { ...(state.processedMatchTransactions || {}), ...r.nextState.processedMatchTransactions } } } : r;
};
//  ② 同一場比賽每次產生不同的交易 id（冪等鍵不穩定）
let salt = 0;
const unstableKey = (state, tx) => applyProgressToState(state, { ...tx, transactionId: `${tx.transactionId}#${++salt}` });
for (const [label, fn] of [["忽略已處理帳本", ignoreLedger], ["交易 id 每次不同", unstableKey]]) {
  const r = idempotencySuite(fn, { seed: 4242, otherSeed: 7, slim: false, quiet: true });
  const failed = r.rows.filter(([, ok]) => !ok).map(([n]) => n.replace(/^\[[^\]]*\]\s*/, ""));
  ck(`反向測試「${label}」⇒ 冪等檢查判 FAIL（偵測到重複入帳）`, !r.ok, `紅 ${failed.length} 條：${failed.slice(0, 2).join("；")}`);
}

const pass = A.filter(([, ok]) => ok).length;
console.log(`\nProgress Idempotency Closure：${pass}/${A.length} ${pass === A.length ? "PASS" : "FAIL"}`);
process.exit(pass === A.length ? 0 : 1);
