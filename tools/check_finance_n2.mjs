#!/usr/bin/env node
// ============================================================================
//  tools/check_finance_n2.mjs — Milestone N2：經濟平衡
//
//  執行：repo 根目錄 `node tools/check_finance_n2.mjs`；**失敗時 exit 1**。
//
//  N1 驗的是「機制不會壞」（不重複結算／帳目相平／到期不入帳）——那些在
//  check_finance_n.mjs，本檔**不重複**，只在最後複驗三條仍然成立。
//
//  本檔驗的是「數值是否合理」：
//    ① 費率集中：結算不再讀 Legacy 種子值（weeklyIncome / weeklyCost / salary）
//    ② 薪資由能力決定：對能力、等級、潛力單調遞增，且有上下限
//    ③ 贊助拆成固定 + 績效：固定的保證拿到，績效的隨戰績縮放
//    ④ 三種情境：新手勉強打平、一般有盈餘、頂級盈餘明顯
//    ⑤ 風險成立：贊助到期／戰績低落／高薪陣容都會由正轉負
//    ⑥ 現金預測：與實際結算一致（不是另算一套），且看得到贊助斷崖
//
//  最後印出**平衡前後對照表**（N1 舊費率 vs N2 新費率）。
// ============================================================================
import { buildWeekLines, settleWeekInState, advanceDaysInState, recentForm } from "../src/platform/economy/weeklySettlement.js";
import { forecastWeeks } from "../src/platform/economy/forecast.js";
import { weeklySalaryOf, teamWeeklySalary, overallOf } from "../src/platform/economy/salary.js";
import { SCENARIOS, SPONSOR_SPLIT, SALARY } from "../src/platform/economy/economyConfig.js";
import { WAN } from "../src/platform/economy/units.js";
import { INITIAL_PLAYERS } from "../src/data/players.js";
import { SPONSORS } from "../src/data/playerModel.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const wan = (yuan) => (yuan / WAN).toFixed(1);

//  ── 測試素材 ────────────────────────────────────────────────────────────
const seedPlayers = INITIAL_PLAYERS.map((p) => ({ ...p }));
const mkPlayer = (over) => ({
  id: "x", lv: 35, potential: 85,
  stats: Object.fromEntries("a".repeat(16).split("").map((_, i) => [`s${i}`, 70])),
  ...over,
});
const statsAll = (v) => Object.fromEntries("a".repeat(16).split("").map((_, i) => [`s${i}`, v]));
const mkState = (over = {}) => ({
  meta: { days: 1, week: 1, season: 1 },
  finance: { funds: 120 * WAN, transactions: [] },
  players: seedPlayers,
  activeSponsor: null,
  csHistory: [],
  economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: "standard" },
  ...over,
});
const withSponsor = (id, weeksLeft) => ({ activeSponsor: { id, weeksLeft, signedWeek: 1 } });
const formHistory = (wins, total) => Array.from({ length: total }, (_, i) => ({ winner: i < wins ? "us" : "them" }));

console.log("══ Milestone N2：經濟平衡 ══\n");

// ── 1) 費率集中：不再讀 Legacy 種子值 ────────────────────────────────────
{
  const a = mkState();
  //  刻意塞入荒謬的舊種子值：如果結算還在讀它們，數字就會跟著變
  const b = mkState({ finance: { funds: 120 * WAN, transactions: [], weeklyIncome: 999 * WAN, weeklyCost: 888 * WAN } });
  const ra = buildWeekLines(a), rb = buildWeekLines(b);
  ck("1) 結算不再讀 finance.weeklyIncome / weeklyCost（種子值不影響結果）",
    ra.income === rb.income && ra.expense === rb.expense,
    `${wan(ra.income)}萬 / ${wan(ra.expense)}萬`);
  //  同理：players[].salary 被改成天價也不該影響
  const c = mkState({ players: seedPlayers.map((p) => ({ ...p, salary: 9999 })) });
  ck("1b) 薪資不再讀 players[].salary（改成 9999 也不影響）",
    buildWeekLines(c).expense === ra.expense);
  ck("1c) 情境切換會改變基礎營收與營運成本（費率確實來自 economyConfig）",
    buildWeekLines(mkState({ economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: "elite" } })).income > ra.income);
}

// ── 2) 薪資由能力決定 ────────────────────────────────────────────────────
{
  const lo = mkPlayer({ stats: statsAll(60), lv: 30, potential: 80 });
  const mid = mkPlayer({ stats: statsAll(75), lv: 35, potential: 85 });
  const hi = mkPlayer({ stats: statsAll(90), lv: 45, potential: 95 });
  ck("2) 綜合能力越高，週薪越高",
    weeklySalaryOf(lo) < weeklySalaryOf(mid) && weeklySalaryOf(mid) < weeklySalaryOf(hi),
    `${weeklySalaryOf(lo)} < ${weeklySalaryOf(mid)} < ${weeklySalaryOf(hi)} 萬`);
  ck("2b) 等級單調：其他條件相同，等級高的薪水高",
    weeklySalaryOf(mkPlayer({ lv: 40 })) > weeklySalaryOf(mkPlayer({ lv: 30 })));
  ck("2c) 潛力只有超過門檻才加價",
    weeklySalaryOf(mkPlayer({ potential: 80 })) === weeklySalaryOf(mkPlayer({ potential: 85 })) &&
    weeklySalaryOf(mkPlayer({ potential: 95 })) > weeklySalaryOf(mkPlayer({ potential: 85 })),
    `門檻 ${SALARY.potentialFloor}`);
  const floor = weeklySalaryOf(mkPlayer({ stats: statsAll(10), lv: 1, potential: 10 }));
  const cap = weeklySalaryOf(mkPlayer({ stats: statsAll(100), lv: 99, potential: 100 }));
  ck("2d) 有下限，不會出現負薪或零薪", floor === SALARY.min, `${floor} 萬`);
  ck("2e) 有上限，極端值不會把帳算爆", cap === SALARY.max, `${cap} 萬`);
  const { total, lines } = teamWeeklySalary(seedPlayers);
  ck("2f) 明細加總 = 總額（畫面逐列顯示不會對不起來）",
    Math.abs(lines.reduce((s, l) => s + l.salary, 0) - total) < 1e-9,
    `${lines.map((l) => l.salary).join("+")} = ${total} 萬`);
}

// ── 3) 贊助拆成固定 + 績效 ───────────────────────────────────────────────
{
  const sp = SPONSORS.find((s) => s.id === "hyperx");   // weekly 15 萬
  const good = mkState({ ...withSponsor(sp.id, 8), csHistory: formHistory(6, 6) });   // 全勝
  const bad = mkState({ ...withSponsor(sp.id, 8), csHistory: formHistory(0, 6) });    // 全敗
  const g = buildWeekLines(good), b = buildWeekLines(bad);
  const fixedOf = (r) => r.lines.find((l) => l.cat === "sponsor")?.amount ?? 0;
  const perfOf = (r) => r.lines.find((l) => l.cat === "bonus")?.amount ?? 0;
  ck("3) 固定收入不看成績（全勝與全敗相同）", fixedOf(g) === fixedOf(b), `${wan(fixedOf(g))}萬`);
  ck("3b) 固定收入 = 贊助週費 × 固定比例",
    fixedOf(g) === Math.round(sp.weekly * SPONSOR_SPLIT.fixed * WAN),
    `${sp.weekly}萬 × ${SPONSOR_SPLIT.fixed}`);
  ck("3c) 績效獎金隨戰績縮放：全勝拿滿、全敗歸零",
    perfOf(g) === Math.round(sp.weekly * SPONSOR_SPLIT.performance * WAN) && perfOf(b) === 0,
    `全勝 ${wan(perfOf(g))}萬 / 全敗 ${wan(perfOf(b))}萬`);
  ck("3d) 沒有比賽紀錄 → 中性戰績（不獎不罰）",
    recentForm(mkState()) === 0.5 && perfOf(buildWeekLines(mkState(withSponsor(sp.id, 8)))) === Math.round(sp.weekly * SPONSOR_SPLIT.performance * 0.5 * WAN));
  ck("3e) 賽事獎金不在週結算重複發放（避免與 S25 賽後結算雙重入帳）",
    !g.lines.some((l) => l.cat === "prize"));
}

// ── 4) 三種情境的財務體質 ────────────────────────────────────────────────
const scenarioNet = (id, players, sponsorId, form) => {
  const st = mkState({
    players,
    economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: id },
    ...(sponsorId ? withSponsor(sponsorId, 8) : {}),
    csHistory: formHistory(Math.round((form ?? 0.5) * 6), 6),
  });
  return buildWeekLines(st);
};
{
  const rookieRoster = seedPlayers.map((p) => ({ ...p, stats: statsAll(62), lv: 22, potential: 80 }));
  const eliteRoster = seedPlayers.map((p) => ({ ...p, stats: statsAll(88), lv: 46, potential: 94 }));
  const r = scenarioNet("rookie", rookieRoster, "local", 0.5);
  const s = scenarioNet("standard", seedPlayers, "hyperx", 0.5);
  const e = scenarioNet("elite", eliteRoster, "crypto", 0.5);
  console.log(`   [情境] 新手 收${wan(r.income)}/支${wan(r.expense)}/淨${wan(r.net)}萬　一般 收${wan(s.income)}/支${wan(s.expense)}/淨${wan(s.net)}萬　頂級 收${wan(e.income)}/支${wan(e.expense)}/淨${wan(e.net)}萬`);
  ck("4) 新手：勉強打平（淨額介於 −2 萬與 +3 萬之間，有壓力但活得下去）",
    r.net >= -2 * WAN && r.net <= 3 * WAN, `淨 ${wan(r.net)}萬`);
  ck("4b) 一般：正常經營有盈餘", s.net > 0, `淨 ${wan(s.net)}萬`);
  ck("4c) 頂級：盈餘明顯高於一般", e.net > s.net, `${wan(e.net)} > ${wan(s.net)} 萬`);
  ck("4d) 頂級的薪資基數確實比較大（贊助斷掉時跌得最重）",
    teamWeeklySalary(eliteRoster).total > teamWeeklySalary(seedPlayers).total,
    `${teamWeeklySalary(eliteRoster).total} vs ${teamWeeklySalary(seedPlayers).total} 萬`);
}

// ── 5) 風險必須成立 ──────────────────────────────────────────────────────
{
  const withSp = scenarioNet("standard", seedPlayers, "hyperx", 0.5);
  const noSp = scenarioNet("standard", seedPlayers, null, 0.5);
  ck("5) 贊助到期 → 由盈轉虧", withSp.net > 0 && noSp.net < 0,
    `有贊助 ${wan(withSp.net)}萬 → 無贊助 ${wan(noSp.net)}萬`);
  const poor = scenarioNet("standard", seedPlayers, "hyperx", 0);
  ck("5b) 戰績低落 → 績效獎金歸零，淨額明顯下滑",
    poor.net < withSp.net, `${wan(withSp.net)} → ${wan(poor.net)} 萬`);
  const stars = seedPlayers.map((p) => ({ ...p, stats: statsAll(95), lv: 50, potential: 99 }));
  const heavy = scenarioNet("standard", stars, "hyperx", 0.5);
  ck("5c) 高薪陣容撐不起一般隊的營收 → 由盈轉虧",
    heavy.net < 0, `全明星陣容淨 ${wan(heavy.net)}萬（薪資 ${teamWeeklySalary(stars).total}萬）`);
  ck("5d) 新手隊簽不起頂級贊助也不會爆掉（下限保護）",
    Number.isFinite(scenarioNet("rookie", seedPlayers, null, 0).net));
}

// ── 6) 現金預測 ──────────────────────────────────────────────────────────
{
  const st = mkState({ ...withSponsor("hyperx", 2), csHistory: formHistory(3, 6) });
  const f = forecastWeeks(st, 4);
  ck("6) 預測長度 = 展望週數", f.weeks.length === 4);
  ck("6b) 預測看得到贊助到期：合約剩 2 週 ⇒ 第 3 週起沒有贊助收入",
    f.weeks[2].income < f.weeks[1].income && f.weeks[3].income === f.weeks[2].income,
    f.weeks.map((w) => wan(w.income) + "萬").join(" → "));
  ck("6c) 到期那一週有標記", f.weeks.some((w) => w.sponsorExpiring === true));
  //  ⭐ 最重要：預測與實際結算一致（不是另算一套）
  const noPrize = mkState({ ...withSponsor("hyperx", 8), csHistory: formHistory(3, 6) });
  const fc = forecastWeeks(noPrize, 3);
  const { nextState } = advanceDaysInState(noPrize, 21);   // 實際跑三週
  ck("6d) 預測與實際結算一致（同一份計算，不是另算一套）",
    Math.abs(fc.endFunds - nextState.finance.funds) < 1,
    `預測 ${wan(fc.endFunds)}萬 vs 實際 ${wan(nextState.finance.funds)}萬`);
  //  資金警告
  const broke = mkState({ finance: { funds: 5 * WAN, transactions: [] }, players: seedPlayers });
  ck("6e) 預測期內會見底 → danger",
    forecastWeeks(broke, 4).level === "danger" && forecastWeeks(broke, 4).bankruptWeek !== null);
  ck("6f) 健康的隊伍 → ok",
    forecastWeeks(mkState({ ...withSponsor("hyperx", 20), csHistory: formHistory(5, 6) }), 4).level === "ok");
  ck("6g) 預測是唯讀的（不會動到合約或資金）", (() => {
    const s2 = mkState(withSponsor("hyperx", 2));
    const snap = JSON.stringify(s2);
    forecastWeeks(s2, 6);
    return JSON.stringify(s2) === snap;
  })());
  ck("6h) 賽事獎金只認帳本裡的真實紀錄，沒有就估 0",
    forecastWeeks(mkState(), 4).weeklyPrize === 0);
}

// ── 7) N1 的三條保證仍然成立（平衡改動沒有弄壞機制）────────────────────
{
  const st = mkState(withSponsor("local", 2));
  const first = settleWeekInState(st, 1);
  const after = { ...st, ...first.nextState };
  ck("7) 不重複結算：同一週再結算完全不寫入", settleWeekInState(after, 1).nextState === null);
  const txSum = after.finance.transactions.filter((t) => t.week === 1).reduce((a, t) => a + t.amount, 0);
  ck("7b) 帳目相平：交易加總 = 淨額 = 資金變化",
    txSum === first.receipt.net && after.finance.funds - st.finance.funds === first.receipt.net);
  let cur = { ...st };
  for (let w = 1; w <= 4; w++) {
    const r = settleWeekInState(cur, w);
    if (r.nextState) cur = { ...cur, ...r.nextState };
  }
  ck("7c) 到期贊助不入帳（合約 2 週，第 3、4 週沒有任何贊助收入）",
    cur.activeSponsor === null &&
    !cur.economy.settledWeeks[3].lines.some((l) => l.cat === "sponsor" || l.cat === "bonus"));
  const round = JSON.parse(JSON.stringify(cur));
  ck("7d) 存檔重新載入後結果一致（JSON 往返不失真）",
    JSON.stringify(round.economy) === JSON.stringify(cur.economy) &&
    round.finance.funds === cur.finance.funds);
  //  這個狀態的 meta.days 仍停在第 1 天（上面是直接呼叫 settleWeekInState 結算的），
  //  所以推進 7 天跨過的是**已經結算過的第 1 週**——正好用來驗「不重算」：
  //  必須標記 alreadySettled、資金不變、帳本筆數不增加。
  const fundsBefore = round.finance.funds;
  const weeksBefore = Object.keys(round.economy.settledWeeks).length;
  const again = advanceDaysInState(round, 7);
  ck("7e) 重新載入後跨過已結算的週 → 標記 alreadySettled、資金不變、帳本不增加",
    again.receipts.length === 1 && again.receipts[0].alreadySettled === true &&
    again.nextState.finance.funds === fundsBefore &&
    Object.keys(again.nextState.economy.settledWeeks).length === weeksBefore,
    `週數 ${weeksBefore} → ${Object.keys(again.nextState.economy.settledWeeks).length}，資金 ${wan(fundsBefore)}萬不變`);
}

// ── 平衡前後對照（N1 舊費率 vs N2 新費率）────────────────────────────────
console.log("\n── 平衡前後對照（一般情境・種子五人）──────────────────────────");
{
  //  N1 舊費率：基礎營收 8.5 萬、營運 6.2 萬、薪資讀 players[].salary、贊助全額入帳
  const oldSalary = seedPlayers.reduce((s, p) => s + (p.salary ?? 0), 0);
  const rows = [];
  for (const spId of [null, "local", "hyperx", "crypto"]) {
    const sp = spId ? SPONSORS.find((s) => s.id === spId) : null;
    const oldIncome = 8.5 + (sp ? sp.weekly : 0);
    const oldNet = oldIncome - oldSalary - 6.2;
    const now = scenarioNet("standard", seedPlayers, spId, 0.5);
    rows.push({
      贊助: sp ? `${sp.name}(${sp.weekly}萬)` : "無",
      "N1 淨額": `${oldNet.toFixed(1)}萬`,
      "N2 淨額": `${wan(now.net)}萬`,
      "N2 收入": `${wan(now.income)}萬`,
      "N2 支出": `${wan(now.expense)}萬`,
    });
  }
  console.table(rows);
  console.log(`   N1 薪資（種子寫死）：${oldSalary} 萬/週　→　N2 薪資（能力推導）：${teamWeeklySalary(seedPlayers).total} 萬/週`);
  console.log(`   種子五人綜合能力：${seedPlayers.map((p) => Math.round(overallOf(p))).join(" / ")}`);
  console.log(`   情境營收/營運：${Object.values(SCENARIOS).map((s) => `${s.name} ${s.baselineWeekly}萬 / ${s.operatingBase}+${s.operatingPerPlayer}×人`).join("　")}`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
