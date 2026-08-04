#!/usr/bin/env node
// ============================================================================
//  tools/check_finance_n.mjs — Milestone N：經營時間軸與財務閉環
//
//  執行：repo 根目錄 `node tools/check_finance_n.mjs`；**失敗時 exit 1**。
//
//  驗的是三件容易出錯、而且錯了會直接損害存檔的事：
//    ① 重複結算   同一週被結算兩次 ⇒ 錢憑空增減
//    ② 帳目不平   交易帳本加總 ≠ 資金變化 ⇒ 帳對不起來
//    ③ 到期後仍入帳  合約走完還在收贊助 ⇒ 合約系統形同虛設
//
//  只測純 reducer（timeline / weeklySettlement），不需要瀏覽器、不碰 React。
// ============================================================================
import { deriveTime, weeksCompletedBetween, DAYS_PER_WEEK, WEEKS_PER_SEASON } from "../src/platform/economy/timeline.js";
import { buildWeekLines, settleWeekInState, advanceDaysInState } from "../src/platform/economy/weeklySettlement.js";
import { WAN } from "../src/platform/economy/units.js";
import { SPONSORS } from "../src/data/playerModel.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

//  ── 測試用狀態（不依賴 localStorage / zustand）──────────────────────────
const mkState = (over = {}) => ({
  meta: { days: 1, week: 1, season: 1 },
  finance: { funds: 1_000_000, weeklyIncome: 85_000, weeklyCost: 62_000, transactions: [] },
  players: [
    { id: "b1", salary: 8, training: null },
    { id: "b2", salary: 7, training: null },
    { id: "b3", salary: 12, training: null },
  ],
  activeSponsor: null,
  economy: { settledWeeks: {}, lastSettledWeek: 0 },
  ...over,
});
const SALARY = (8 + 7 + 12) * WAN;   // 27 萬 = 270,000 元

console.log("══ Milestone N：經營時間軸與財務閉環 ══\n");

// ── 1) 時間軸：日 → 週 → 賽季 的唯一換算 ──────────────────────────────────
ck("1) 第 1 天 = 第 1 週第 1 天、第 1 賽季",
  deriveTime(1).week === 1 && deriveTime(1).dayOfWeek === 1 && deriveTime(1).season === 1);
ck("1b) 第 7 天仍是第 1 週；第 8 天進第 2 週",
  deriveTime(7).week === 1 && deriveTime(7).dayOfWeek === 7 && deriveTime(8).week === 2 && deriveTime(8).dayOfWeek === 1,
  `day7→W${deriveTime(7).week} day8→W${deriveTime(8).week}`);
ck("1c) 賽季長度 = 12 週：第 12 週仍是 S1，第 13 週進 S2",
  deriveTime(12 * DAYS_PER_WEEK).season === 1 && deriveTime(12 * DAYS_PER_WEEK + 1).season === 2,
  `WEEKS_PER_SEASON=${WEEKS_PER_SEASON}`);
ck("1d) 週次跨賽季不重置（冪等鍵才會全域唯一）",
  deriveTime(13 * DAYS_PER_WEEK).week === 13 && deriveTime(13 * DAYS_PER_WEEK).weekOfSeason === 1);
ck("1e) 一次推進多天不漏週：day 8 → 22 跨過第 2、3 週",
  JSON.stringify(weeksCompletedBetween(8, 22)) === JSON.stringify([2, 3]),
  JSON.stringify(weeksCompletedBetween(8, 22)));

// ── 2) 週結算：金額正確、帳目相平 ────────────────────────────────────────
{
  const s = mkState();
  const { nextState, receipt } = settleWeekInState(s, 1);
  const expectIncome = 85_000;
  const expectExpense = SALARY + 62_000;
  ck("2) 收入 = 基礎營收（無贊助時）", receipt.income === expectIncome, `${receipt.income}`);
  ck("2b) 支出 = 選手薪資 + 營運成本", receipt.expense === expectExpense, `${receipt.expense}（薪資 ${SALARY} + 營運 62000）`);
  ck("2c) 淨額 = 收入 − 支出", receipt.net === expectIncome - expectExpense, `${receipt.net}`);
  ck("2d) 資金實際變化 = 淨額",
    nextState.finance.funds - s.finance.funds === receipt.net,
    `${s.finance.funds} → ${nextState.finance.funds}`);
  //  帳目相平：本週交易的金額加總必須等於淨額（有正有負，直接相加）
  const txSum = nextState.finance.transactions.filter((t) => t.week === 1).reduce((a, t) => a + t.amount, 0);
  ck("2e) 帳本相平：本週交易加總 = 淨額 = 資金變化", txSum === receipt.net, `交易加總 ${txSum}`);
  ck("2f) 每一筆交易都帶週次與決定性 id（不用 Date.now）",
    nextState.finance.transactions.filter((t) => t.week === 1).every((t) => t.id === `w1-${t.cat}`));
}

// ── 3) 冪等：同一週不可能結算兩次 ────────────────────────────────────────
{
  const s = mkState();
  const first = settleWeekInState(s, 1);
  const after = { ...s, ...first.nextState };
  const second = settleWeekInState(after, 1);
  ck("3) 同一週再次結算 → 完全不寫入", second.nextState === null);
  ck("3b) 回傳既有 receipt 並標記 alreadySettled", second.receipt.alreadySettled === true);
  ck("3c) 資金沒有被扣第二次", after.finance.funds === first.nextState.finance.funds);
}

// ── 4) 推進天數：不漏結算、不重複結算 ────────────────────────────────────
{
  const s = mkState();
  //  day 1 → 15：跨過第 1、2 週結尾 ⇒ 剛好兩次結算
  const { nextState, receipts } = advanceDaysInState(s, 14);
  ck("4) 推進 14 天 → 結算 2 次（第 1、2 週）",
    receipts.length === 2 && receipts[0].week === 1 && receipts[1].week === 2,
    receipts.map((r) => `W${r.week}`).join(","));
  ck("4b) 沒有任何一次是重複結算", receipts.every((r) => r.alreadySettled === false));
  const perWeek = receipts.reduce((a, r) => a + r.net, 0);
  ck("4c) 兩週淨額合計 = 資金總變化",
    nextState.finance.funds - s.finance.funds === perWeek,
    `${s.finance.funds} → ${nextState.finance.funds}（Σnet ${perWeek}）`);
  ck("4d) 週內推進不觸發結算：day 1 → 5 不結算",
    advanceDaysInState(mkState(), 4).receipts.length === 0);
  ck("4e) 時間由 days 唯一導出（week/season 同步更新）",
    nextState.meta.days === 15 && nextState.meta.week === deriveTime(15).week && nextState.meta.season === deriveTime(15).season,
    `day${nextState.meta.days} W${nextState.meta.week} S${nextState.meta.season}`);
}

// ── 5) 贊助合約：入帳、倒數、到期停止 ────────────────────────────────────
{
  const sp = SPONSORS.find((x) => x.id === "local");     // weekly 6 萬、weeks 6
  const s = mkState({ activeSponsor: { id: sp.id, weeksLeft: sp.weeks, signedWeek: 1 } });
  const first = settleWeekInState(s, 1);
  ck("5) 合約有效時，贊助收入有入帳",
    first.receipt.lines.some((l) => l.cat === "sponsor" && l.amount === sp.weekly * WAN),
    `+${sp.weekly}萬`);
  ck("5b) 結算後合約週數 −1", first.nextState.activeSponsor.weeksLeft === sp.weeks - 1);

  //  一路跑到合約走完
  let cur = { ...s };
  const paid = [];
  for (let w = 1; w <= sp.weeks + 2; w++) {
    const r = settleWeekInState(cur, w);
    if (r.nextState) cur = { ...cur, ...r.nextState };
    const line = r.receipt.lines?.find((l) => l.cat === "sponsor");
    if (line) paid.push(w);
  }
  ck("5c) 恰好領滿合約週數，不多不少",
    paid.length === sp.weeks && paid[paid.length - 1] === sp.weeks,
    `入帳週次 ${paid.join(",")}（合約 ${sp.weeks} 週）`);
  ck("5d) 到期後 activeSponsor 清空", cur.activeSponsor === null);
  //  ③ 最重要的一條：到期之後再結算，**不得**再有贊助收入
  const afterExpiry = settleWeekInState(cur, sp.weeks + 5);
  ck("5e) 到期後仍結算 → 沒有任何贊助收入",
    !afterExpiry.receipt.lines.some((l) => l.cat === "sponsor"),
    afterExpiry.receipt.lines.map((l) => l.cat).join(","));
  ck("5f) 到期當週有發出通知（收件匣）",
    Object.values(cur.economy.settledWeeks).some((r) => r.sponsorExpired === true));
}

// ── 6) 邊界與防呆 ────────────────────────────────────────────────────────
{
  ck("6) week ≤ 0 拒絕結算", settleWeekInState(mkState(), 0).nextState === null);
  const noPlayers = mkState({ players: [] });
  const r = settleWeekInState(noPlayers, 1);
  ck("6b) 沒有選手 → 沒有薪資支出（不產生 0 元交易）",
    !r.receipt.lines.some((l) => l.cat === "salary"));
  //  預覽不得寫入任何狀態
  const s = mkState();
  const snapshot = JSON.stringify(s);
  buildWeekLines(s);
  ck("6c) 本週預覽是唯讀（不改變任何狀態）", JSON.stringify(s) === snapshot);
  //  資金可以是負的（負債），不得被夾成 0——那會讓帳目對不起來
  const broke = mkState({ finance: { ...mkState().finance, funds: 1_000 } });
  const rb = settleWeekInState(broke, 1);
  ck("6d) 資金允許為負（負債），帳目仍相平",
    rb.nextState.finance.funds === 1_000 + rb.receipt.net && rb.nextState.finance.funds < 0,
    `${rb.nextState.finance.funds}`);
}

// ── 7) 存檔往返：結算結果可保存與重新載入 ────────────────────────────────
{
  const s = mkState();
  const { nextState } = advanceDaysInState(s, 14);
  const roundTrip = JSON.parse(JSON.stringify(nextState));   // = localStorage 的 JSON 往返
  ck("7) 帳本可 JSON 往返（存檔／重新載入不失真）",
    JSON.stringify(roundTrip.economy) === JSON.stringify(nextState.economy));
  //  重新載入後再推進，已結算的週不會再算一次
  const again = advanceDaysInState(roundTrip, 7);
  ck("7b) 重新載入後續推進：只結算新的一週，舊週不重算",
    again.receipts.length === 1 && again.receipts[0].week === 3 && again.receipts[0].alreadySettled === false,
    again.receipts.map((r) => `W${r.week}`).join(","));
  ck("7c) 帳本累積三週且不重複",
    Object.keys(again.nextState.economy.settledWeeks).sort().join(",") === "1,2,3");
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
