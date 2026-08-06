#!/usr/bin/env node
// ============================================================================
//  tools/check_finance_n31.mjs — Milestone N3.1：新手開局扶持贊助
//
//  執行：repo 根目錄 `node tools/check_finance_n31.mjs`；**失敗時 exit 1**。
//
//  N3 交付後量到的問題：新手情境無贊助時每週淨額 −11.7 萬，約 5 週見底，
//  開局壓力來得太早。N3.1 只調新手：開局自動附帶一份 6～8 週的扶持贊助。
//
//  本檔驗：
//    ① 扶持贊助只給新手，一般／頂級**數值完全不變**（回歸保護）
//    ② 新手開局接近平衡（小幅虧損），且成績仍然有意義
//    ③ 扶持贊助**不在贊助市集**（不可被主動簽、不污染 Legacy 目錄）
//    ④ 到期效果正確：領滿週數 → 清空 → 之後不再入帳 → 回到原本的壓力
//    ⑤ 四週預測正確顯示扶持與到期斷崖，且與實際結算一致
// ============================================================================
import { buildWeekLines, settleWeekInState, advanceDaysInState } from "../src/platform/economy/weeklySettlement.js";
import { forecastWeeks } from "../src/platform/economy/forecast.js";
import { teamWeeklySalary } from "../src/platform/economy/salary.js";
import { SCENARIOS, SPONSOR_SPLIT, FORM } from "../src/platform/economy/economyConfig.js";
import { resolveSponsor, isStarterSponsor, STARTER_SPONSORS } from "../src/platform/economy/sponsors.js";
import { newGameFinancials } from "../src/platform/economy/newGame.js";
import { WAN } from "../src/platform/economy/units.js";
import { INITIAL_PLAYERS } from "../src/data/players.js";
import { SPONSORS } from "../src/data/playerModel.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const wan = (yuan) => (yuan / WAN).toFixed(1);

//  與 profileStore.startNewGame 同一組規則——共用 economy/newGame.js，不各寫一份
const newGameState = (scenarioId, formLog = []) => {
  const ng = newGameFinancials(scenarioId);
  return {
    meta: { days: ng.time.day, week: ng.time.week, season: ng.time.season },
    finance: { funds: ng.funds, transactions: [] },
    players: INITIAL_PLAYERS.map((p) => ({ ...p })),
    activeSponsor: ng.activeSponsor,
    csHistory: [],
    economy: { ...ng.economy, formLog },
    processedMatchTransactions: {},
  };
};
const wins = (w, n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, mode: "moba", win: i < w, week: 1 }));

console.log("══ Milestone N3.1：新手開局扶持贊助 ══\n");

// ── 1) 扶持贊助只給新手；一般／頂級數值不得改變 ──────────────────────────
{
  ck("1) 只有新手情境帶扶持贊助",
    !!SCENARIOS.rookie.starterSponsor && !SCENARIOS.standard.starterSponsor && !SCENARIOS.elite.starterSponsor);
  const s = newGameState("standard"), e = newGameState("elite");
  ck("1b) 一般情境開局仍無贊助（未被波及）", s.activeSponsor === null);
  ck("1c) 頂級情境開局仍無贊助（未被波及）", e.activeSponsor === null);
  //  數值回歸：一般／頂級的週收支必須與 N3 記錄的數字完全一致
  const sw = buildWeekLines(s), ew = buildWeekLines(e);
  ck("1d) 一般情境週收支不變（12.0 / 19.7 / −7.7 萬）",
    wan(sw.income) === "12.0" && wan(sw.expense) === "19.7" && wan(sw.net) === "-7.7",
    `${wan(sw.income)} / ${wan(sw.expense)} / ${wan(sw.net)}`);
  ck("1e) 頂級情境週收支不變（22.0 / 22.7 / −0.7 萬）",
    wan(ew.income) === "22.0" && wan(ew.expense) === "22.7" && wan(ew.net) === "-0.7",
    `${wan(ew.income)} / ${wan(ew.expense)} / ${wan(ew.net)}`);
  //  薪資公式未動
  ck("1f) 薪資公式未動（種子五人仍為 12.2 萬/週）",
    teamWeeklySalary(INITIAL_PLAYERS).total === 12.2, `${teamWeeklySalary(INITIAL_PLAYERS).total} 萬`);
}

// ── 2) 扶持贊助的合約條件 ────────────────────────────────────────────────
{
  const g = resolveSponsor(SCENARIOS.rookie.starterSponsor);
  ck("2) 扶持合約長度落在 6～8 週", g.weeks >= 6 && g.weeks <= 8, `${g.weeks} 週`);
  ck("2b) 沒有簽約金（開局贈與，不是簽約）", (g.signBonus ?? 0) === 0);
  ck("2c) 標記為扶持方案", isStarterSponsor(g.id) && g.starter === true);
}

// ── 3) 新手開局：接近平衡的小幅虧損 ──────────────────────────────────────
{
  const r = newGameState("rookie");
  const w = buildWeekLines(r);
  console.log(`   [新手開局] 收 ${wan(w.income)} / 支 ${wan(w.expense)} / 淨 ${wan(w.net)} 萬（戰績中性）`);
  ck("3) 新手開局淨額介於 −3 萬與 +1 萬（接近平衡／小幅虧損）",
    w.net >= -3 * WAN && w.net <= 1 * WAN, `${wan(w.net)} 萬`);
  ck("3b) 比未附帶扶持時明顯改善（原 −11.7 萬）",
    w.net > -11.7 * WAN + 5 * WAN, `${wan(w.net)} 萬`);
  //  成績仍然有意義
  const good = buildWeekLines(newGameState("rookie", wins(6, 6)));
  const bad = buildWeekLines(newGameState("rookie", wins(0, 6)));
  ck("3c) 全勝 → 由虧轉盈（成績仍然有意義）", good.net > 0, `${wan(good.net)} 萬`);
  ck("3d) 全敗 → 虧損明顯擴大", bad.net < w.net, `${wan(bad.net)} 萬`);
  //  跑滿扶持期：不能在期限內見底
  const { nextState } = advanceDaysInState(r, 7 * resolveSponsor(SCENARIOS.rookie.starterSponsor).weeks);
  ck("3e) 扶持期內不會見底（資金仍為正）",
    nextState.finance.funds > 0, `扶持期末資金 ${wan(nextState.finance.funds)} 萬`);
}

// ── 4) 扶持贊助不得進入贊助市集 ──────────────────────────────────────────
{
  const ids = SPONSORS.map((s) => s.id);
  ck("4) 扶持方案不在 Legacy 贊助目錄（不可被主動簽）",
    Object.keys(STARTER_SPONSORS).every((id) => !ids.includes(id)),
    `市集 ${ids.length} 家`);
  ck("4b) resolveSponsor 同時認得市集與扶持（畫面不會出現「有合約卻查無贊助商」）",
    !!resolveSponsor("hyperx") && !!resolveSponsor("rookie_grant") && resolveSponsor("nope") === null);
  ck("4c) 市集贊助不會被誤判為扶持", !isStarterSponsor("hyperx"));
}

// ── 5) 到期效果：領滿 → 清空 → 不再入帳 ────────────────────────────────
{
  const g = resolveSponsor(SCENARIOS.rookie.starterSponsor);
  let cur = newGameState("rookie");
  const paid = [];
  for (let w = 1; w <= g.weeks + 3; w++) {
    const r = settleWeekInState(cur, w);
    if (r.nextState) cur = { ...cur, ...r.nextState };
    if (r.receipt.lines?.some((l) => l.cat === "sponsor")) paid.push(w);
  }
  ck("5) 扶持恰好領滿合約週數，不多不少",
    paid.length === g.weeks && paid[paid.length - 1] === g.weeks,
    `入帳週次 ${paid.join(",")}（合約 ${g.weeks} 週）`);
  ck("5b) 到期後 activeSponsor 清空", cur.activeSponsor === null);
  ck("5c) 到期後不再有任何扶持收入（固定與績效都沒有）",
    !cur.economy.settledWeeks[g.weeks + 1].lines.some((l) => l.cat === "sponsor" || l.cat === "bonus"));
  const afterNet = cur.economy.settledWeeks[g.weeks + 1].net;
  ck("5d) 到期後回到原本的壓力（約 −11.7 萬）",
    Math.abs(afterNet - (-11.7 * WAN)) < 0.2 * WAN, `${wan(afterNet)} 萬`);
  ck("5e) 到期當週有發出通知",
    Object.values(cur.economy.settledWeeks).some((r) => r.sponsorExpired === true));
}

// ── 6) 四週預測：顯示扶持與到期斷崖，且與實際結算一致 ────────────────────
{
  const r = newGameState("rookie");
  const fc = forecastWeeks(r, 4);
  ck("6) 預測前四週都含扶持收入（合約 8 週，四週內不會斷）",
    fc.weeks.every((x) => x.income > SCENARIOS.rookie.baselineWeekly * WAN),
    fc.weeks.map((x) => wan(x.income) + "萬").join(" → "));
  ck("6b) 預測四週內不見底 ⇒ 不是 danger",
    fc.level !== "danger" && fc.bankruptWeek === null, `level=${fc.level}`);
  //  推到合約剩 2 週，預測就要看得到斷崖
  const late = { ...r, activeSponsor: { ...r.activeSponsor, weeksLeft: 2 } };
  const fl = forecastWeeks(late, 4);
  ck("6c) 合約剩 2 週時，預測看得到第 3 週起收入斷崖",
    fl.weeks[1].income > fl.weeks[2].income && fl.weeks[2].income === fl.weeks[3].income,
    fl.weeks.map((x) => wan(x.income) + "萬").join(" → "));
  ck("6d) 到期那一週有標記", fl.weeks.some((x) => x.sponsorExpiring));
  //  預測 = 實際
  const fc3 = forecastWeeks(r, 3);
  const { nextState } = advanceDaysInState(r, 21);
  ck("6e) 預測與實際結算一致（同一份計算）",
    Math.abs(fc3.endFunds - nextState.finance.funds) < 1,
    `預測 ${wan(fc3.endFunds)}萬 vs 實際 ${wan(nextState.finance.funds)}萬`);
  //  跨越到期點也要一致
  const fc10 = forecastWeeks(r, 10);
  const { nextState: after10 } = advanceDaysInState(r, 70);
  ck("6f) 跨越合約到期點後，預測與實際仍一致",
    Math.abs(fc10.endFunds - after10.finance.funds) < 1,
    `預測 ${wan(fc10.endFunds)}萬 vs 實際 ${wan(after10.finance.funds)}萬`);
}

// ── 7) 機制保證未被破壞 ──────────────────────────────────────────────────
{
  const r = newGameState("rookie");
  const first = settleWeekInState(r, 1);
  const after = { ...r, ...first.nextState };
  ck("7) 不重複結算", settleWeekInState(after, 1).nextState === null);
  const txSum = after.finance.transactions.filter((t) => t.week === 1).reduce((a, t) => a + t.amount, 0);
  ck("7b) 帳目相平（含扶持收入）",
    txSum === first.receipt.net && after.finance.funds - r.finance.funds === first.receipt.net);
  const round = JSON.parse(JSON.stringify(after));
  ck("7c) 存檔往返後扶持合約不失真",
    round.activeSponsor.id === "rookie_grant" && round.activeSponsor.weeksLeft === after.activeSponsor.weeksLeft);
}

// ── 三情境對照 ───────────────────────────────────────────────────────────
console.log("\n── 新局起手對照（種子五人・戰績中性）──────────────────────────");
{
  const rows = Object.values(SCENARIOS).map((sc) => {
    const s = newGameState(sc.id);
    const w = buildWeekLines(s);
    const fc = forecastWeeks(s, 4);
    const st = sc.starterSponsor ? resolveSponsor(sc.starterSponsor) : null;
    return {
      情境: sc.name,
      開局贊助: st ? `${st.name} ${st.weekly}萬×${st.weeks}週` : "無",
      起始資金: `${sc.startingFunds}萬`,
      週收入: `${wan(w.income)}萬`,
      週支出: `${wan(w.expense)}萬`,
      週淨額: `${wan(w.net)}萬`,
      "四週後": `${wan(fc.endFunds)}萬`,
      警告: fc.level,
    };
  });
  console.table(rows);
  const g = resolveSponsor(SCENARIOS.rookie.starterSponsor);
  console.log(`   扶持拆分：固定 ${g.weekly * SPONSOR_SPLIT.fixed}萬 + 績效 ${g.weekly * SPONSOR_SPLIT.performance}萬×戰績（中性 ${FORM.neutral}）`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
