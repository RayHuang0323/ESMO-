#!/usr/bin/env node
// ============================================================================
//  tools/check_club_mastery_v1.mjs — Meta Progression v1 不變式
//
//  執行：`node tools/check_club_mastery_v1.mjs`；失敗 exit 1。
//  純契約檢查：不跑引擎、不開瀏覽器、不改任何 production 行為。
//
//  ── Task 1 守的是什麼 ────────────────────────────────────────────────────
//  `retentionState.js` 原本 `tier: clubTierOf(R.clubPoints)` **讀的是餘額**。
//  在 Retention v1 那個「只進不出」的世界裡這沒問題，但 Meta Progression 讓
//  Club Points 有了出口 ⇒ **玩家一花點數，俱樂部等級就會倒退**。
//  那是進度條倒退，不是消費——所以 lifetime 與 balance 必須分開。
// ============================================================================
import {
  emptyRetention, normalizeRetention, clubTierOf, spendClubPoints,
  claimObjective, retentionViewOf, coordsOf, recordMatchActivity, recordTrainingActivity,
} from "../src/platform/retention/retentionState.js";

const checks = [];
const ck = (label, ok, detail = "") => {
  checks.push({ label, ok: Boolean(ok) });
  if (!ok) console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
};

// ── ① lifetime 與 balance 是兩個欄位 ────────────────────────────────────
const fresh = emptyRetention();
ck("空狀態有 clubPointsLifetime", fresh.clubPointsLifetime === 0);
ck("空狀態有 clubPoints", fresh.clubPoints === 0);

// ── ② 花點數：只減餘額，lifetime 不動，等級不倒退 ───────────────────────
const rich = { ...emptyRetention(), clubPoints: 6000, clubPointsLifetime: 6000 };
const tierBefore = clubTierOf(rich.clubPointsLifetime);
const spent = spendClubPoints(rich, 5000);
ck("花得起就成功", spent.ok, spent.reason ?? "");
ck("餘額扣掉", spent.ok && spent.retention.clubPoints === 1000, String(spent.retention?.clubPoints));
ck("lifetime 不變", spent.ok && spent.retention.clubPointsLifetime === 6000, String(spent.retention?.clubPointsLifetime));
ck("等級不倒退", spent.ok && clubTierOf(spent.retention.clubPointsLifetime).id === tierBefore.id,
  `${tierBefore.id} -> ${spent.ok ? clubTierOf(spent.retention.clubPointsLifetime).id : "?"}`);
ck("餘額 1000 但仍是名門（讀 lifetime 6000）", spent.ok && clubTierOf(spent.retention.clubPointsLifetime).id === "prestige");

// ── ③ 不得透支、不得負數、不得零或負數金額 ──────────────────────────────
ck("餘額不足 ⇒ 失敗", spendClubPoints({ ...emptyRetention(), clubPoints: 100, clubPointsLifetime: 100 }, 500).ok === false);
ck("餘額不足時狀態不變", (() => {
  const r = { ...emptyRetention(), clubPoints: 100, clubPointsLifetime: 100 };
  const out = spendClubPoints(r, 500);
  return out.retention.clubPoints === 100 && out.retention.clubPointsLifetime === 100;
})());
ck("金額 0 ⇒ 失敗", spendClubPoints(rich, 0).ok === false);
ck("金額負數 ⇒ 失敗", spendClubPoints(rich, -50).ok === false);
ck("花光剛好可以", (() => { const o = spendClubPoints(rich, 6000); return o.ok && o.retention.clubPoints === 0; })());

// ── ④ 領獎同時推進兩個欄位 ──────────────────────────────────────────────
//  ⚠ 日目標是**依日期抽的**，不能假設哪一個會出現。第 3 天抽到的是
//    train / tryout / scout ⇒ fixture 要做的是「安排訓練」而不是「出賽」。
const coords = coordsOf({ day: 3, week: 1, year: 1 });
const played = recordTrainingActivity(
  recordMatchActivity(emptyRetention(), { matchSource: "competitive", win: true, income: 1000, appeared: [] }, coords),
  coords,
);
const view = retentionViewOf(played, { coords });
const doneItem = view.groups.flatMap((g) => g.items).find((i) => i.done && !i.claimed);
ck("fixture: 有一個可領的目標", Boolean(doneItem), "找不到已完成未領取的目標");
if (doneItem) {
  const claimed = claimObjective(played, doneItem.id, view);
  ck("領獎成功", claimed.ok, claimed.reason ?? "");
  ck("領獎推進 balance", claimed.ok && claimed.retention.clubPoints === claimed.gained);
  ck("領獎推進 lifetime", claimed.ok && claimed.retention.clubPointsLifetime === claimed.gained);
  //  ⚠ claim 冪等是 Retention v1 既有保證，Task 1 不得破壞它。
  const view2 = retentionViewOf(claimed.retention, { coords });
  ck("同一目標不得重複領（冪等未破壞）", claimObjective(claimed.retention, doneItem.id, view2).ok === false);
}

// ── ⑤ 舊存檔 migration ──────────────────────────────────────────────────
//  Task 1 之前 clubPoints 只進不出 ⇒ 當時的餘額**就是**累計值，回填才不會讓
//  老玩家一升級就掉等級。這是唯一安全的回填假設，且只在缺欄位時適用。
const legacy = normalizeRetention({ schema: "Retention.v1", clubPoints: 2500, counters: {}, sets: {}, claims: {} });
ck("舊存檔缺 lifetime ⇒ 以餘額回填", legacy.clubPointsLifetime === 2500, String(legacy.clubPointsLifetime));
ck("舊存檔等級不變（精英）", clubTierOf(legacy.clubPointsLifetime).id === "elite");
ck("新存檔的 lifetime 照讀不回填", normalizeRetention({ clubPoints: 100, clubPointsLifetime: 900 }).clubPointsLifetime === 900);
ck("lifetime 不得小於 balance（壞存檔自我修正）",
  normalizeRetention({ clubPoints: 800, clubPointsLifetime: 100 }).clubPointsLifetime >= 800);
ck("完全空的存檔安全", normalizeRetention(undefined).clubPointsLifetime === 0);
ck("垃圾值不炸", normalizeRetention({ clubPoints: "x", clubPointsLifetime: null }).clubPointsLifetime === 0);

// ── ⑥ view 同時給出兩個數字 ─────────────────────────────────────────────
const v2 = retentionViewOf({ ...emptyRetention(), clubPoints: 300, clubPointsLifetime: 2500 }, { coords });
ck("view 帶可花餘額", v2.clubPoints === 300, String(v2.clubPoints));
ck("view 帶 lifetime", v2.clubPointsLifetime === 2500, String(v2.clubPointsLifetime));
ck("view 的 tier 讀 lifetime 而非餘額", v2.tier.id === "elite", `${v2.tier.id}（餘額 300 若被誤讀會是 rookie）`);


// ══════════════════════════════════════════════════════════════════════════
//  Task 2：Career mastery bag ＋ tactic usage recording
// ══════════════════════════════════════════════════════════════════════════
const M = await import("../src/platform/mastery/clubMasteryState.js");
const P = await import("../src/platform/progress/applyMatchProgress.js");
const TX = await import("../src/platform/contracts/matchProgressTransaction.js");
const { mobaTacticById } = await import("../src/platform/contracts/MobaTacticConfig.js");

console.log("\n【Task 2：生涯打法累積】");

// ── ⑦ 袋子形狀：只存不可推導的東西 ──────────────────────────────────────
const bag = M.emptyClubMastery();
ck("袋子鍵固定（不存可推導的快取）",
  JSON.stringify(Object.keys(bag).sort()) === JSON.stringify(["activeDoctrine", "claims", "schema", "tacticIntent", "tacticUsage"]),
  Object.keys(bag).join(", "));
ck("MOBA 與 CS 各自一格（不互相污染）",
  bag.tacticUsage.moba && bag.tacticUsage.cs && bag.tacticIntent.moba && bag.tacticIntent.cs);

// ── ⑧ tacticIntentOf：純推導、fail closed ───────────────────────────────
const m1 = mobaTacticById("m1");
const goalsHit = Object.fromEntries(m1.evidence.map((e) => [e.key, e.goal]));
const goalsMiss = Object.fromEntries(m1.evidence.map((e) => [e.key, 0]));
ck("evidence 全達成 ⇒ intent true", M.tacticIntentOf("moba", "m1", goalsHit).intent === true);
ck("evidence 全未達 ⇒ intent false", M.tacticIntentOf("moba", "m1", goalsMiss).intent === false);
ck("evidence 過半 ⇒ intent true", (() => {
  const half = { ...goalsMiss, [m1.evidence[0].key]: m1.evidence[0].goal, [m1.evidence[1].key]: m1.evidence[1].goal };
  return M.tacticIntentOf("moba", "m1", half).intent === true;   // 3 項中 2 項 ⇒ 2/3 ≥ 0.5
})());
ck("未知 tacticId fail closed", M.tacticIntentOf("moba", "nope", goalsHit).ok === false);
ck("執行統計缺失 fail closed", M.tacticIntentOf("moba", "m1", null).ok === false);
ck("執行統計是陣列 fail closed", M.tacticIntentOf("moba", "m1", []).ok === false);
ck("CS 不判定 intent（DESIGN_ONLY）", M.tacticIntentOf("cs", "t_apalace", goalsHit).ok === false);

// ── ⑨ recordTacticUsage ────────────────────────────────────────────────
const rec = (b, over = {}) => M.recordTacticUsage(b, { mode: "moba", tacticId: "m1", matchSource: "competitive", intent: false, ...over });
ck("正式比賽 +1", rec(bag).tacticUsage.moba.m1 === 1);
ck("快速練習 +0", rec(bag, { matchSource: "practice" }).tacticUsage.moba.m1 === undefined);
ck("intent 達成才記 intent", rec(bag, { intent: true }).tacticIntent.moba.m1 === 1);
ck("intent 未達成不記 intent", rec(bag, { intent: false }).tacticIntent.moba.m1 === undefined);
ck("未知 tacticId 不建立欄位", Object.keys(rec(bag, { tacticId: "nope" }).tacticUsage.moba).length === 0);
ck("未知模式不建立欄位", (() => {
  const out = rec(bag, { mode: "lol" });
  return Object.keys(out.tacticUsage.moba).length === 0 && Object.keys(out.tacticUsage.cs).length === 0;
})());
ck("CS 記使用不記 intent", (() => {
  const out = M.recordTacticUsage(bag, { mode: "cs", tacticId: "t_apalace", matchSource: "competitive", intent: false });
  return out.tacticUsage.cs.t_apalace === 1 && Object.keys(out.tacticUsage.moba).length === 0;
})());
ck("MOBA 記錄不污染 CS", rec(bag).tacticUsage.cs && Object.keys(rec(bag).tacticUsage.cs).length === 0);
ck("累加正確", (() => { let b = bag; for (let i = 0; i < 3; i++) b = rec(b, { intent: true }); return b.tacticUsage.moba.m1 === 3 && b.tacticIntent.moba.m1 === 3; })());
ck("distinctTacticsUsed 推導正確", (() => {
  let b = rec(bag); b = M.recordTacticUsage(b, { mode: "moba", tacticId: "m4", matchSource: "competitive" });
  return M.distinctTacticsUsed(b, "moba") === 2;
})());

// ── ⑩ 冪等：同一場再結算不得重複累計 ────────────────────────────────────
const mkTx = () => TX.createMatchProgressTransaction({
  matchId: "fixture-1", mode: "moba", sourceResultVersion: "BattleResult.v2",
  teamRewards: { money: 1000, fans: 10, reputation: 0 }, playerProgress: [], unlocks: [],
  metadata: { matchSource: "competitive", winner: "us", score: { us: 1, enemy: 0 }, tacticId: "m1", tacticIntent: true },
});
const tx1 = mkTx();
ck("交易單帶得動 tacticId", tx1.metadata.tacticId === "m1");
ck("交易單帶得動 tacticIntent", tx1.metadata.tacticIntent === true);
const state0 = { players: [], finance: { funds: 0, transactions: [] }, meta: { days: 3, fans: 0 }, processedMatchTransactions: {}, retention: emptyRetention(), clubMastery: M.emptyClubMastery() };
const r1 = P.applyProgressToState(state0, tx1);
ck("第一次結算：usage +1", r1.nextState?.clubMastery?.tacticUsage.moba.m1 === 1, JSON.stringify(r1.nextState?.clubMastery?.tacticUsage));
ck("第一次結算：intent +1", r1.nextState?.clubMastery?.tacticIntent.moba.m1 === 1);
const r2 = P.applyProgressToState({ ...state0, ...r1.nextState }, mkTx());
ck("同一場再結算被冪等擋下", r2.receipt.alreadyApplied === true);
ck("重複結算不重複累計（nextState 為 null ⇒ 不寫入）", r2.nextState === null);

// ── ⑪ migration ────────────────────────────────────────────────────────
ck("舊存檔沒有 clubMastery ⇒ 空袋子", M.normalizeClubMastery(undefined).tacticUsage.moba && Object.keys(M.normalizeClubMastery(undefined).tacticUsage.moba).length === 0);
ck("垃圾值不炸", M.normalizeClubMastery({ tacticUsage: "x", tacticIntent: 5, claims: [] }).tacticUsage.cs !== undefined);
ck("負數／非整數計數被丟棄", M.normalizeClubMastery({ tacticUsage: { moba: { m1: -3, m2: "x", m3: 2 } } }).tacticUsage.moba.m3 === 2
  && M.normalizeClubMastery({ tacticUsage: { moba: { m1: -3 } } }).tacticUsage.moba.m1 === undefined);
ck("reload 後 usage 保存", (() => {
  const saved = JSON.parse(JSON.stringify(r1.nextState.clubMastery));
  return M.normalizeClubMastery(saved).tacticUsage.moba.m1 === 1;
})());
ck("activeDoctrine 保存", M.normalizeClubMastery({ activeDoctrine: "tempo" }).activeDoctrine === "tempo");
ck("activeDoctrine 壞值 ⇒ null", M.normalizeClubMastery({ activeDoctrine: 5 }).activeDoctrine === null);

// ── ⑫ domain 邊界：mastery 不寫進 retention ─────────────────────────────
ck("結算後 retention 沒有多出 mastery 欄位",
  JSON.stringify(Object.keys(r1.nextState.retention).sort()) === JSON.stringify(["claims", "clubPoints", "clubPointsLifetime", "counters", "schema", "sets"]),
  Object.keys(r1.nextState.retention).join(", "));
ck("Task 1 未退化：結算後 lifetime 仍存在", Number.isFinite(r1.nextState.retention.clubPointsLifetime));

const passed = checks.filter((c) => c.ok).length;
console.log(`\nClub Mastery v1：${passed}/${checks.length} ${passed === checks.length ? "PASS" : "FAIL"}`);
if (passed !== checks.length) process.exitCode = 1;
