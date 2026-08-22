#!/usr/bin/env node
// ============================================================================
//  tools/check_recruit_o.mjs — Milestone O：選手招募與隊伍養成基礎閉環
//
//  執行：repo 根目錄 `node tools/check_recruit_o.mjs`；**失敗時 exit 1**。
//
//  驗的是招募閉環最容易出錯、而且錯了會損害存檔或經濟的事：
//    ① 契約：冪等鍵可決定性推導、不合法交易單一律拒絕
//    ② 三道保護：名額滿／餘額不足／重複招募
//    ③ 金流：確實從既有 finance.funds 扣款，且進交易帳本（不是第二套資金）
//    ④ 入隊：選手真的進 players[]（不是第二套選手資料）
//    ⑤ 決定性：同一張交易單重播 → 逐欄相同（未來由伺服器接管的前提）
//    ⑥ 養成：招募進來的選手能用**既有**訓練系統提升能力
//    ⑦ 存檔往返：招募帳本與選手不失真
// ============================================================================
import { createRecruitmentTransaction, validateRecruitmentTransaction, makeRecruitmentId, RECRUITMENT_TX_VERSION } from "../src/platform/contracts/recruitment.js";
import { applyRecruitmentToState, recruitPlayerId } from "../src/platform/recruit/applyRecruitment.js";
import { genProspects } from "../src/data/recruitPool.js";
import { ROSTER_CAP, applyCourse, courseById, TRAINING_COURSES } from "../src/data/playerModel.js";
import { teamWeeklySalary, overallOf } from "../src/platform/economy/salary.js";
import { buildWeekLines } from "../src/platform/economy/weeklySettlement.js";
import { WAN } from "../src/platform/economy/units.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const wan = (yuan) => (yuan / WAN).toFixed(1);

const SEED = 7;
const POOL = genProspects(SEED);
const SIGN_TIME = { day: 1, week: 1, season: 1 };
const mkState = (over = {}) => ({
  meta: { days: 1, week: 1, season: 1, players: 0 },
  finance: { funds: 500 * WAN, transactions: [] },
  players: [],
  economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: "standard", formLog: [] },
  recruitment: { signed: {} },
  ...over,
});
const txFor = (p) => createRecruitmentTransaction({ poolSeed: SEED, prospect: p, signedAt: SIGN_TIME });
const cheapest = [...POOL].sort((a, b) => a.cost - b.cost)[0];

console.log("══ Milestone O：選手招募與隊伍養成 ══\n");

// ── 1) 契約 ──────────────────────────────────────────────────────────────
{
  const tx = txFor(cheapest);
  ck("1) 交易單 schema 正確", tx.schema === RECRUITMENT_TX_VERSION, tx.schema);
  ck("1b) 冪等鍵由 池seed + 池內編號 決定性推導",
    tx.transactionId === makeRecruitmentId(SEED, cheapest.id) && tx.transactionId === `recruit:${SEED}:${cheapest.id}:v1`,
    tx.transactionId);
  ck("1c) 交易單帶簽約當下的選手快照（伺服器接管後可原樣重建）",
    tx.player.name === cheapest.name && tx.player.potential === cheapest.potential &&
    Object.keys(tx.player.stats).length === Object.keys(cheapest.stats).length);
  ck("1d) 合法交易單通過驗證", validateRecruitmentTransaction(tx).ok);
  ck("1e) 竄改冪等鍵會被擋下",
    !validateRecruitmentTransaction({ ...tx, transactionId: "recruit:0:0:v1" }).ok);
  ck("1f) 缺欄位會被擋下",
    !validateRecruitmentTransaction({ ...tx, player: { ...tx.player, name: "" } }).ok &&
    !validateRecruitmentTransaction({ ...tx, costWan: -1 }).ok);
  const bad = applyRecruitmentToState(mkState(), { ...tx, schema: "nope" });
  ck("1g) 不合法交易單 → 完全不寫入", bad.nextState === null && bad.receipt.reason === "invalid");
}

// ── 2) 招募成功：扣款、入隊、進帳本 ──────────────────────────────────────
{
  const s = mkState();
  const tx = txFor(cheapest);
  const { nextState, receipt } = applyRecruitmentToState(s, tx);
  const cost = cheapest.cost * WAN;
  ck("2) 招募成功", receipt.ok && receipt.signed);
  ck("2b) 從既有 finance.funds 扣款（不是第二套資金）",
    nextState.finance.funds === s.finance.funds - cost,
    `${wan(s.finance.funds)}萬 → ${wan(nextState.finance.funds)}萬（簽約金 ${wan(cost)}萬）`);
  ck("2c) 選手進入既有 players[]（不是第二套選手資料）",
    nextState.players.length === 1 && nextState.players[0].name === cheapest.name);
  ck("2d) 選手 id 由冪等鍵推導（可重播）",
    nextState.players[0].id === recruitPlayerId(SEED, cheapest.id), nextState.players[0].id);
  ck("2e) 招募進交易帳本（財務頁看得到這筆金流）", (() => {
    const t = nextState.finance.transactions[0];
    return t && t.cat === "recruit" && t.amount === -cost && t.id === `sign-${tx.transactionId}`;
  })());
  ck("2f) meta.players 同步", nextState.meta.players === 1);
  ck("2g) 招募帳本記下這張交易單", !!nextState.recruitment.signed[tx.transactionId]);
  ck("2h) 選手帶有招募來源（可稽核）", nextState.players[0].signedVia === tx.transactionId);
  ck("2i) 新秀未綁定英雄時誠實留空，不亂塞", nextState.players[0].heroId === null);
  ck("2j) 新秀從 Lv1 / 0 XP 起算（等級閉環在選手層）",
    nextState.players[0].lv === 1 && nextState.players[0].xp === 0 && nextState.players[0].talentPoints === 0);
}

// ── 3) 三道保護 ──────────────────────────────────────────────────────────
{
  //  ③ 重複
  const s = mkState();
  const tx = txFor(cheapest);
  const a = applyRecruitmentToState(s, tx);
  const s1 = { ...s, ...a.nextState };
  const b = applyRecruitmentToState(s1, tx);
  ck("3) 重複招募 → 完全不寫入、標記 alreadySigned",
    b.nextState === null && b.receipt.alreadySigned === true);
  ck("3b) 重複招募不會重複扣款、不會複製選手",
    s1.finance.funds === a.nextState.finance.funds && s1.players.length === 1);

  //  ② 餘額不足
  const poor = mkState({ finance: { funds: 1, transactions: [] } });
  const r = applyRecruitmentToState(poor, tx);
  ck("3c) 餘額不足 → 拒絕且不寫入",
    r.nextState === null && r.receipt.reason === "insufficient_funds");
  ck("3d) 餘額不足時 receipt 帶得出缺口（畫面不必自己算）",
    r.receipt.cost === cheapest.cost * WAN && r.receipt.funds === 1);

  //  ① 名額滿
  const fullRoster = mkState({ players: Array.from({ length: ROSTER_CAP }, (_, i) => ({ id: `x${i}`, name: `P${i}` })) });
  const f = applyRecruitmentToState(fullRoster, tx);
  ck("3e) 名額已滿 → 拒絕且不寫入",
    f.nextState === null && f.receipt.reason === "roster_full" && f.receipt.rosterCap === ROSTER_CAP);
  //  剛好差一個名額 → 應該可以簽
  const oneLeft = mkState({ players: Array.from({ length: ROSTER_CAP - 1 }, (_, i) => ({ id: `x${i}`, name: `P${i}` })) });
  ck("3f) 剩最後一個名額仍可簽（邊界不誤擋）",
    applyRecruitmentToState(oneLeft, tx).receipt.signed === true);
}

// ── 4) 連續招募多人 ──────────────────────────────────────────────────────
{
  let cur = mkState();
  const picks = [...POOL].sort((a, b) => a.cost - b.cost).slice(0, 5);
  let spent = 0;
  for (const p of picks) {
    const { nextState } = applyRecruitmentToState(cur, txFor(p));
    if (nextState) { cur = { ...cur, ...nextState }; spent += p.cost * WAN; }
  }
  ck("4) 連續招募 5 人全部入隊", cur.players.length === 5);
  ck("4b) 總扣款 = 各簽約金總和",
    cur.finance.funds === 500 * WAN - spent, `共 ${wan(spent)}萬`);
  ck("4c) 每位選手 id 唯一", new Set(cur.players.map((p) => p.id)).size === 5);
  ck("4d) 招募帳本筆數 = 招募人數", Object.keys(cur.recruitment.signed).length === 5);
  //  招募進來的人會計入週薪（薪資由能力推導，見 N2）
  const salary = teamWeeklySalary(cur.players).total;
  ck("4e) 新隊員計入週薪（與既有薪資公式同一套）",
    salary > 0 && buildWeekLines(cur).lines.some((l) => l.cat === "salary"),
    `週薪合計 ${salary} 萬`);
}

// ── 5) 決定性（未來由伺服器接管的前提）──────────────────────────────────
{
  const tx = txFor(cheapest);
  const a = applyRecruitmentToState(mkState(), tx).nextState.players[0];
  const b = applyRecruitmentToState(mkState(), tx).nextState.players[0];
  ck("5) 同一張交易單重播 → 選手逐欄相同（無亂數、無時鐘）",
    JSON.stringify(a) === JSON.stringify(b));
  ck("5b) 士氣由能力推導而非亂數（重播一致且落在合理區間）",
    a.morale === b.morale && a.morale >= 72 && a.morale <= 92, `morale=${a.morale}`);
  ck("5c) 交易單本身也是決定性的",
    JSON.stringify(txFor(cheapest)) === JSON.stringify(txFor(cheapest)));
}

// ── 6) 養成：既有訓練系統對招募選手有效 ──────────────────────────────────
{
  const s = mkState();
  const { nextState } = applyRecruitmentToState(s, txFor(cheapest));
  const rookie = nextState.players[0];
  const before = overallOf(rookie);
  //  用既有課程結算（applyCourse 是訓練系統的唯一成長入口）
  const course = TRAINING_COURSES.find((c) => c.id === "mechanics");
  const runCourse = (p, id) => applyCourse({ ...p, training: { courseId: id, daysLeft: 0, totalDays: 1 } }, id);
  const trained = runCourse(rookie, course.id);
  const after = overallOf(trained);
  ck("6) 招募選手能用既有訓練課程提升能力",
    after > before, `綜合 ${before.toFixed(2)} → ${after.toFixed(2)}`);
  ck("6b) 訓練提升的是課程指定的能力項",
    course.stats.every((k) => trained.stats[k] > rookie.stats[k]),
    course.stats.join("/"));
  ck("6c) 訓練結束後 training 清空（可以排下一門課）", !trained.training);
  const trainToCap = (p) => {
    let g = p;
    for (let round = 0; round < 12; round++) {
      for (const c of TRAINING_COURSES) if (c.id !== "rest") g = runCourse(g, c.id);
    }
    return g;
  };
  const salaryOf = (p) => teamWeeklySalary([p]).total;
  //  Case A：在 current-main 的課程集合中找出一個能力提升但沒有跨過
  //  canonical salary 計算／四捨五入門檻的決定性案例。這裡不複製 salary
  // 公式，也不硬編薪資值；候選人的 before / after 都直接走 production API。
  const stableGrowth = (() => {
    const courses = TRAINING_COURSES.filter((c) => c.id !== "rest");
    for (const candidate of [...POOL].sort((a, b) => a.id - b.id)) {
      const state = applyRecruitmentToState(
        mkState({ finance: { funds: 900 * WAN, transactions: [] } }),
        txFor(candidate),
      ).nextState;
      let current = state.players[0];
      for (let step = 0; step < courses.length * 2; step++) {
        const course = courses[step % courses.length];
        const next = runCourse(current, course.id);
        const beforeOverall = overallOf(current);
        const afterOverall = overallOf(next);
        const beforeSalary = salaryOf(current);
        const afterSalary = salaryOf(next);
        if (afterOverall > beforeOverall && afterSalary === beforeSalary) {
          return { candidate, course, step: step + 1, beforeOverall, afterOverall, beforeSalary, afterSalary };
        }
        current = next;
      }
    }
    return null;
  })();
  ck("6d) Case A：能力提升但未跨薪資門檻 → 週薪可維持不變",
    !!stableGrowth && stableGrowth.afterOverall > stableGrowth.beforeOverall && stableGrowth.afterSalary === stableGrowth.beforeSalary,
    stableGrowth
      ? `第 ${stableGrowth.step} 次「${stableGrowth.course.name}」｜綜合 ${stableGrowth.beforeOverall.toFixed(2)} → ${stableGrowth.afterOverall.toFixed(2)}｜週薪 ${stableGrowth.beforeSalary} → ${stableGrowth.afterSalary} 萬`
      : "current-main 課程序列未觀測到 salary-stable growth");

  const star = [...POOL].sort((a, b) => b.potential - a.potential)[0];
  const starState = applyRecruitmentToState(mkState({ finance: { funds: 900 * WAN, transactions: [] } }), txFor(star)).nextState;
  const starRookie = starState.players[0];
  const starGrown = trainToCap(starRookie);

  //  Case B：同一個決定性新秀與固定課程序列，找出第一次由 production salary
  //  API 觀測到週薪上升的課程；verifier 不複製 salary formula 或硬編 expected value。
  const salaryCrossing = (start) => {
    const courses = TRAINING_COURSES.filter((c) => c.id !== "rest");
    let current = start;
    for (let step = 0; step < courses.length * 16; step++) {
      const course = courses[step % courses.length];
      const next = runCourse(current, course.id);
      const beforeSalary = salaryOf(current);
      const afterSalary = salaryOf(next);
      const beforeOverall = overallOf(current);
      const afterOverall = overallOf(next);
      if (afterOverall > beforeOverall && afterSalary > beforeSalary) {
        return { course, step: step + 1, beforeOverall, afterOverall, beforeSalary, afterSalary };
      }
      current = next;
    }
    return null;
  };
  const caseB = salaryCrossing(starRookie);
  ck("6e) Case B：跨 canonical 薪資門檻 → 週薪必須上升",
    !!caseB && caseB.afterOverall > caseB.beforeOverall && caseB.afterSalary > caseB.beforeSalary,
    caseB
      ? `第 ${caseB.step} 次「${caseB.course.name}」｜綜合 ${caseB.beforeOverall.toFixed(2)} → ${caseB.afterOverall.toFixed(2)}｜週薪 ${caseB.beforeSalary} → ${caseB.afterSalary} 萬`
      : "固定課程序列未觀測到 canonical salary crossing");
  //  ⚠ 低潛力新秀是另一回事，而且是**刻意的**：薪資公式的加項門檻是
  //    綜合 60 / 等級 30，潛力低的新秀就算練到潛力上限也跨不過去 ⇒ 永遠是下限 1.0 萬。
  //    這不是 bug（便宜的人本來就便宜），但養成他們不會反映在薪資上。
  const lowGrown = trainToCap(rookie);
  ck("6f) 低潛力新秀練到頂仍在薪資下限（刻意：便宜的人本來就便宜）",
    teamWeeklySalary([lowGrown]).total === teamWeeklySalary([rookie]).total,
    `潛力 ${rookie.potential}｜綜合 ${overallOf(lowGrown).toFixed(2)}｜週薪維持 ${teamWeeklySalary([lowGrown]).total} 萬`);
  ck("6g) 能力不會超過潛力上限（既有規則仍生效，長期練也不破表）",
    Object.values(lowGrown.stats).every((v) => v <= rookie.potential) &&
    Object.values(starGrown.stats).every((v) => v <= star.potential),
    `低潛力 ${rookie.potential}／高潛力 ${star.potential} 皆未破表`);
}

// ── 7) 存檔往返 ──────────────────────────────────────────────────────────
{
  let cur = mkState();
  for (const p of [...POOL].sort((a, b) => a.cost - b.cost).slice(0, 3)) {
    const { nextState } = applyRecruitmentToState(cur, txFor(p));
    if (nextState) cur = { ...cur, ...nextState };
  }
  const round = JSON.parse(JSON.stringify(cur));
  ck("7) 招募帳本 JSON 往返不失真",
    JSON.stringify(round.recruitment) === JSON.stringify(cur.recruitment));
  ck("7b) 選手資料往返不失真", JSON.stringify(round.players) === JSON.stringify(cur.players));
  //  重新載入後重複招募仍被擋
  const again = applyRecruitmentToState(round, txFor([...POOL].sort((a, b) => a.cost - b.cost)[0]));
  ck("7c) 重新載入後，已簽過的新秀仍不能再簽",
    again.nextState === null && again.receipt.alreadySigned === true);
}

// ── 招募概況 ─────────────────────────────────────────────────────────────
console.log("\n── 新秀池概況（seed 7）──────────────────────────────────────────");
{
  const costs = POOL.map((p) => p.cost);
  console.log(`   新秀 ${POOL.length} 名｜簽約金 ${Math.min(...costs)}～${Math.max(...costs)} 萬（平均 ${(costs.reduce((a, b) => a + b, 0) / POOL.length).toFixed(1)} 萬）`);
  console.log(`   名單上限 ${ROSTER_CAP} 人｜訓練課程 ${TRAINING_COURSES.length} 門｜冪等鍵格式 ${makeRecruitmentId("<pool>", "<id>")}`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
