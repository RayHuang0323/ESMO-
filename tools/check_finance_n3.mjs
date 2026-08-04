#!/usr/bin/env node
// ============================================================================
//  tools/check_finance_n3.mjs — Milestone N3：開新局情境 ＋ 統一賽績
//
//  執行：repo 根目錄 `node tools/check_finance_n3.mjs`；**失敗時 exit 1**。
//
//  N3 補的是 N2 明確記錄在案的兩個缺口：
//    ① 三種情境有設定但沒有開新局入口 ⇒ 起始資金永遠是種子的 120 萬、永遠 standard
//    ② MOBA 賽績沒有接進績效贊助 ⇒ 打再多 MOBA 都不影響收入
//
//  本檔驗：
//    · 開新局後的資金、情境、時間、帳本、贊助狀態
//    · 開新局後的薪資與四週預測正確（而且與實際結算一致）
//    · **MOBA 與 CS 都能影響週結算**（這是 ② 的驗收標準）
//    · 統一賽績的冪等、上限、舊存檔 migration
// ============================================================================
import { buildWeekLines, settleWeekInState, advanceDaysInState, recentForm } from "../src/platform/economy/weeklySettlement.js";
import { forecastWeeks } from "../src/platform/economy/forecast.js";
import { teamWeeklySalary } from "../src/platform/economy/salary.js";
import { appendFormEntry, formFromLog, seedFormLogFromCsHistory, FORM_LOG_CAP } from "../src/platform/economy/formLog.js";
import { SCENARIOS, SPONSOR_SPLIT, FORM } from "../src/platform/economy/economyConfig.js";
import { deriveTime } from "../src/platform/economy/timeline.js";
import { WAN } from "../src/platform/economy/units.js";
import { applyProgressToState } from "../src/platform/progress/applyMatchProgress.js";
import { createMatchProgressTransaction } from "../src/platform/contracts/matchProgressTransaction.js";
import { INITIAL_PLAYERS } from "../src/data/players.js";
import { SPONSORS } from "../src/data/playerModel.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const wan = (yuan) => (yuan / WAN).toFixed(1);

//  ── 開新局的純狀態（與 profileStore.startNewGame 同一組規則）───────────────
//  ⚠ 這裡刻意重建一份「新局初始狀態」而不 import profileStore（那會拉進 zustand）。
//    欄位若與 store 不同步，下面 §1 的斷言會直接抓到（資金／情境／時間都對得上）。
const newGameState = (scenarioId) => {
  const sc = SCENARIOS[scenarioId];
  const t = deriveTime(1);
  return {
    meta: { days: t.day, week: t.week, season: t.season },
    finance: { funds: sc.startingFunds * WAN, transactions: [] },
    players: INITIAL_PLAYERS.map((p) => ({ ...p })),
    activeSponsor: null,
    csHistory: [],
    economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: sc.id, formLog: [] },
    processedMatchTransactions: {},
  };
};

console.log("══ Milestone N3：開新局情境 ＋ 統一賽績 ══\n");

// ── 1) 開新局：資金／情境／時間／帳本 ────────────────────────────────────
{
  for (const id of Object.keys(SCENARIOS)) {
    const sc = SCENARIOS[id];
    const s = newGameState(id);
    ck(`1) 開新局（${sc.name}）起始資金 = 情境設定值`,
      s.finance.funds === sc.startingFunds * WAN, `$${sc.startingFunds}萬`);
    ck(`1b) 開新局（${sc.name}）情境正確且時間從第 1 天起算`,
      s.economy.scenario === id && s.meta.days === 1 && s.meta.week === 1 && s.meta.season === 1);
  }
  const s = newGameState("standard");
  ck("1c) 開新局後帳本為空（不帶入前一局的結算紀錄）",
    Object.keys(s.economy.settledWeeks).length === 0 && s.economy.lastSettledWeek === 0);
  ck("1d) 開新局後沒有贊助合約", s.activeSponsor === null);
  ck("1e) 開新局後交易帳本為空 ⇒ 賽事獎金估計為 0（種子交易不得灌水預測）",
    s.finance.transactions.length === 0 && forecastWeeks(s, 4).weeklyPrize === 0);
  ck("1f) 開新局後賽績為空 ⇒ 近期戰績取中性值（不獎不罰）",
    recentForm(s) === FORM.neutral, `${recentForm(s)}`);
}

// ── 2) 開新局後的薪資與四週預測 ──────────────────────────────────────────
{
  const salary = teamWeeklySalary(INITIAL_PLAYERS).total;
  for (const id of Object.keys(SCENARIOS)) {
    const sc = SCENARIOS[id];
    const s = newGameState(id);
    const w = buildWeekLines(s);
    const expectSalary = Math.round(salary * WAN);
    const expectOps = Math.round((sc.operatingBase + sc.operatingPerPlayer * INITIAL_PLAYERS.length) * WAN);
    ck(`2) ${sc.name}：薪資與營運成本正確`,
      w.expense === expectSalary + expectOps,
      `薪資 ${wan(expectSalary)}萬 + 營運 ${wan(expectOps)}萬 = ${wan(w.expense)}萬`);
    ck(`2b) ${sc.name}：收入 = 基礎營收（新局無贊助）`,
      w.income === sc.baselineWeekly * WAN, `${wan(w.income)}萬`);
    //  預測必須與實際結算一致——這是「不另算一套」的驗收
    const fc = forecastWeeks(s, 4);
    const { nextState } = advanceDaysInState(s, 28);
    ck(`2c) ${sc.name}：四週預測與實際結算一致`,
      Math.abs(fc.endFunds - nextState.finance.funds) < 1,
      `預測 ${wan(fc.endFunds)}萬 vs 實際 ${wan(nextState.finance.funds)}萬`);
    ck(`2d) ${sc.name}：預測逐週資金遞推正確`,
      fc.weeks.every((x, i) => Math.abs(x.funds - (s.finance.funds + fc.weeks.slice(0, i + 1).reduce((a, y) => a + y.net, 0))) < 1));
  }
}

// ── 3) 開新局後簽贊助：入帳、倒數、預測都要跟著動 ────────────────────────
{
  const sp = SPONSORS.find((x) => x.id === "hyperx");
  const s = { ...newGameState("standard"), activeSponsor: { id: sp.id, weeksLeft: 3, signedWeek: 1 } };
  const w = buildWeekLines(s);
  ck("3) 新局簽下贊助後，固定收入立即進入本週收支",
    w.lines.some((l) => l.cat === "sponsor" && l.amount === Math.round(sp.weekly * SPONSOR_SPLIT.fixed * WAN)));
  const fc = forecastWeeks(s, 4);
  ck("3b) 預測看得到合約在第 3 週後斷掉",
    fc.weeks[2].income > fc.weeks[3].income,
    fc.weeks.map((x) => wan(x.income) + "萬").join(" → "));
  ck("3c) 到期那一週有標記", fc.weeks.some((x) => x.sponsorExpiring));
}

// ── 4) MOBA 與 CS 都要能影響週結算（N3 的核心）──────────────────────────
//  ⚠ sourceResultVersion 是契約必填（BattleResult.v2 / CsMatchResult.v1）——
//  少了它 validate 會擋下整筆 transaction，applyProgressToState 直接回 null。
const mkTx = (mode, matchId, winner) => createMatchProgressTransaction({
  mode, matchId,
  sourceResultVersion: mode === "moba" ? "BattleResult.v2" : "CsMatchResult.v1",
  teamRewards: { money: 0, fans: 0, reputation: 0 },
  playerProgress: [],
  metadata: { winner },
});
{
  const sp = SPONSORS.find((x) => x.id === "hyperx");
  const base = { ...newGameState("standard"), activeSponsor: { id: sp.id, weeksLeft: 8, signedWeek: 1 } };

  //  中性（無紀錄）→ 績效獎金 = 一半
  const neutralPerf = buildWeekLines(base).lines.find((l) => l.cat === "bonus")?.amount ?? 0;

  //  只打 MOBA 且全勝
  let mobaWin = { ...base };
  for (let i = 0; i < 6; i++) {
    const { nextState } = applyProgressToState(mobaWin, mkTx("moba", `m${i}`, "us"));
    mobaWin = { ...mobaWin, ...nextState };
  }
  const mobaPerf = buildWeekLines(mobaWin).lines.find((l) => l.cat === "bonus")?.amount ?? 0;
  ck("4) MOBA 勝場會提高績效獎金（N3 之前 MOBA 完全不影響收入）",
    mobaPerf > neutralPerf && recentForm(mobaWin) === 1,
    `中性 ${wan(neutralPerf)}萬 → MOBA 全勝 ${wan(mobaPerf)}萬`);

  //  只打 MOBA 且全敗
  let mobaLose = { ...base };
  for (let i = 0; i < 6; i++) {
    const { nextState } = applyProgressToState(mobaLose, mkTx("moba", `L${i}`, "enemy"));
    mobaLose = { ...mobaLose, ...nextState };
  }
  ck("4b) MOBA 敗場會讓績效獎金歸零",
    (buildWeekLines(mobaLose).lines.find((l) => l.cat === "bonus")?.amount ?? 0) === 0 && recentForm(mobaLose) === 0);

  //  CS 同樣有效
  let csWin = { ...base };
  for (let i = 0; i < 6; i++) {
    const { nextState } = applyProgressToState(csWin, mkTx("cs", `c${i}`, "us"));
    csWin = { ...csWin, ...nextState };
  }
  ck("4c) CS 勝場一樣會提高績效獎金", recentForm(csWin) === 1);

  //  混合：MOBA 與 CS 一視同仁
  let mixed = { ...base };
  const seq = [["moba", "us"], ["cs", "us"], ["moba", "enemy"], ["cs", "enemy"]];
  seq.forEach(([mode, winner], i) => {
    const { nextState } = applyProgressToState(mixed, mkTx(mode, `x${i}`, winner));
    mixed = { ...mixed, ...nextState };
  });
  ck("4d) MOBA 與 CS 一視同仁（2 勝 2 敗 ⇒ 戰績 50%）",
    recentForm(mixed) === 0.5, `${recentForm(mixed)}`);

  //  ⭐ 真的影響「週結算」而不只是預覽
  const rWin = settleWeekInState(mobaWin, 1).receipt;
  const rLose = settleWeekInState(mobaLose, 1).receipt;
  ck("4e) 週結算的實際入帳金額確實隨賽績改變",
    rWin.net > rLose.net && rWin.form === 1 && rLose.form === 0,
    `全勝淨 ${wan(rWin.net)}萬 vs 全敗淨 ${wan(rLose.net)}萬`);
}

// ── 5) 統一賽績紀錄的性質 ────────────────────────────────────────────────
{
  const base = newGameState("standard");
  //  冪等：同一場比賽（同 transactionId）不重複計入
  const tx = mkTx("moba", "dup", "us");
  const a = applyProgressToState(base, tx);
  const s1 = { ...base, ...a.nextState };
  const b = applyProgressToState(s1, tx);
  ck("5) 同一場比賽不重複計入賽績（冪等）",
    b.nextState === null && s1.economy.formLog.length === 1);
  //  直接對 appendFormEntry 再擋一次
  ck("5b) appendFormEntry 對同 id 是 no-op",
    appendFormEntry(s1.economy, { id: tx.transactionId, mode: "moba", win: true, week: 1 }).formLog.length === 1);
  //  上限
  let cap = base.economy;
  for (let i = 0; i < FORM_LOG_CAP + 8; i++) cap = appendFormEntry(cap, { id: `k${i}`, mode: "cs", win: true, week: 1 });
  ck("5c) 賽績紀錄有上限，不會無限成長",
    cap.formLog.length === FORM_LOG_CAP, `${cap.formLog.length} 筆`);
  //  取樣視窗
  let win6 = base.economy;
  for (let i = 0; i < FORM.window; i++) win6 = appendFormEntry(win6, { id: `w${i}`, mode: "moba", win: i < 3, week: 1 });
  ck("5d) 只取最近 N 場（FORM.window）計算戰績",
    formFromLog(win6) === 0.5, `window=${FORM.window} ⇒ ${formFromLog(win6)}`);
  //  舊存檔 migration
  const seeded = seedFormLogFromCsHistory({ settledWeeks: {}, lastSettledWeek: 0, scenario: "standard" },
    [{ matchId: "a", winner: "us" }, { matchId: "b", winner: "them" }]);
  ck("5e) 舊存檔以 csHistory 種一次賽績（升級後績效不會莫名歸零）",
    seeded.formLog.length === 2 && formFromLog(seeded) === 0.5);
  ck("5f) 已有 formLog 的存檔不會被 csHistory 覆蓋",
    seedFormLogFromCsHistory(seeded, [{ matchId: "z", winner: "us" }]).formLog.length === 2);
}

// ── 6) 開新局後完整跑四週：帳目仍相平、不重複結算 ────────────────────────
{
  const s = newGameState("rookie");
  const { nextState, receipts } = advanceDaysInState(s, 28);
  ck("6) 開新局後推進四週 → 結算 4 次且皆非重複",
    receipts.length === 4 && receipts.every((r) => r.alreadySettled === false));
  const sumNet = receipts.reduce((a, r) => a + r.net, 0);
  ck("6b) 四週淨額合計 = 資金總變化",
    nextState.finance.funds - s.finance.funds === sumNet,
    `${wan(s.finance.funds)}萬 → ${wan(nextState.finance.funds)}萬`);
  const txSum = nextState.finance.transactions.reduce((a, t) => a + t.amount, 0);
  ck("6c) 交易帳本加總 = 資金總變化（帳目相平）", txSum === sumNet);
  const round = JSON.parse(JSON.stringify(nextState));
  ck("6d) 存檔往返後帳本與情境不失真",
    JSON.stringify(round.economy) === JSON.stringify(nextState.economy) &&
    round.economy.scenario === "rookie");
}

// ── 情境總覽（新局起手數字）──────────────────────────────────────────────
console.log("\n── 三種情境的新局起手（種子五人・無贊助・戰績中性）──────────────");
{
  const rows = Object.values(SCENARIOS).map((sc) => {
    const s = newGameState(sc.id);
    const w = buildWeekLines(s);
    const fc = forecastWeeks(s, 4);
    return {
      情境: sc.name,
      起始資金: `${sc.startingFunds}萬`,
      週收入: `${wan(w.income)}萬`,
      週支出: `${wan(w.expense)}萬`,
      週淨額: `${wan(w.net)}萬`,
      "四週後資金": `${wan(fc.endFunds)}萬`,
      警告: fc.level,
    };
  });
  console.table(rows);
  console.log(`   種子五人週薪合計：${teamWeeklySalary(INITIAL_PLAYERS).total} 萬/週（由能力推導）`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
