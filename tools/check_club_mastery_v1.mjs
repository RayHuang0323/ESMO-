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

const passed = checks.filter((c) => c.ok).length;
console.log(`\nClub Mastery v1：${passed}/${checks.length} ${passed === checks.length ? "PASS" : "FAIL"}`);
if (passed !== checks.length) process.exitCode = 1;
