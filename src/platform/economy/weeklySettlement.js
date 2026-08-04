// ============================================================================
//  platform/economy/weeklySettlement.js — 每週財務結算（Milestone N）
//
//  這是**唯一**的週結算寫入點。畫面與其他 Store 動作一律不得自己加減 funds：
//      ✅  const receipt = advanceDay(n)        // profileStore 薄包裝
//      ❌  set({ finance: { funds: funds + 贊助 } })
//
//  核心是純 reducer `settleWeekInState(state, week)`：
//    · 不 import React / zustand / localStorage ⇒ 可直接 Node 測試
//      （驗證器：tools/check_finance_n.mjs）。
//    · profileStore 只是薄包裝，一次 set() 寫完 ⇒ 不會出現「合約遞減了但錢沒入帳」
//      的半套狀態。
//
//  ── 冪等（與 S25 賽後結算同一套手法）──────────────────────────────────────
//    · 冪等鍵 = **累計週次**（`timeline.deriveTime().week`，跨賽季不重置 ⇒ 全域唯一）。
//    · `state.economy.settledWeeks[week]` 存 receipt。
//    · 同一週再次結算 → 不加錢、不扣錢、合約不遞減，回傳既有 receipt 並標記
//      `alreadySettled: true`。⇒ React StrictMode 雙掛載、重整後重進都不會重複結算。
//
//  ── 金額單位 ──────────────────────────────────────────────────────────────
//  Store 一律以**元**存放；Legacy 資料表以「萬」計價，換算用 `WAN`。
//    · 選手 `salary`：**週薪（萬）**——依 Legacy 規格
//      （`EsportsGame.jsx:559` 註解 `salary週薪`、`:5822` 顯示「週薪 $N萬」）。
//    · 贊助 `weekly`：每週收入（萬），見 `data/playerModel.js` SPONSORS。
//    · `finance.weeklyCost`：**營運成本（不含薪資）**。種子表 `expenseBd` 另外列了
//      「選手薪資」一項，那是 Legacy 寫死的展示分解；本結算以 players[].salary
//      為薪資的唯一來源，`weeklyCost` 只當場地/行政等固定營運支出，避免重複計算。
//    · `finance.weeklyIncome`：基礎營收（直播分潤／周邊等）的週固定值。
//
//  ⚠ 平衡注意（不是 bug，是種子資料的數字關係）：種子五人週薪合計 42 萬，
//    而種子資金只有 120 萬、基礎營收 8.5 萬/週。以 Legacy 規格直接結算會在
//    數週內見底。本檔只負責**機制正確**，費率全部集中在下方一處可調；
//    是否調整費率屬 Balance 決策（見 CLAUDE.md：Balance 變更需 Ray 核准）。
// ============================================================================
import { WAN } from "./units.js";
import { sponsorById } from "../../data/playerModel.js";
import { deriveTime } from "./timeline.js";

/** 交易分類 → 顏色（沿用 finance.transactions 既有色票，畫面不必改對照表）。 */
const COLOR = Object.freeze({
  sponsor: "#a78bfa",
  base: "#60a5fa",
  salary: "#f87171",
  ops: "#94a3b8",
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * 這一週的收支明細（不寫入任何狀態，畫面可以直接拿去預覽「本週」）。
 *
 * @param {object} state profileStore 切片（players / finance / activeSponsor）
 * @returns {{lines:Array, income:number, expense:number, net:number}} 金額單位為元
 */
export function buildWeekLines(state) {
  const finance = state.finance ?? {};
  const players = state.players ?? [];
  const active = state.activeSponsor ?? null;
  const lines = [];

  //  ── 收入 ────────────────────────────────────────────────────────────────
  const base = num(finance.weeklyIncome);
  if (base > 0) lines.push({ cat: "base", label: "基礎營收（直播分潤・周邊）", amount: base, color: COLOR.base });

  //  贊助：只有**合約仍有效**（weeksLeft > 0）才入帳。到期後 activeSponsor 會被
  //  清成 null（見下方 settleWeekInState），所以這裡不會再有收入——「到期後仍入帳」
  //  是本 Milestone 明確要擋掉的錯誤，驗證器有對應斷言。
  if (active && num(active.weeksLeft) > 0) {
    const sp = sponsorById(active.id);
    if (sp) {
      lines.push({
        cat: "sponsor",
        label: `贊助收入 · ${sp.name}`,
        amount: num(sp.weekly) * WAN,
        color: COLOR.sponsor,
      });
    }
  }

  //  ── 支出（一律存負數，帳本才能直接相加）────────────────────────────────
  //  薪資唯一來源 = players[].salary（週薪・萬）。不讀 expenseBd 的展示值。
  const salary = players.reduce((s, p) => s + num(p.salary), 0) * WAN;
  if (salary > 0) lines.push({ cat: "salary", label: `選手薪資 × ${players.length} 人`, amount: -salary, color: COLOR.salary });

  const ops = num(finance.weeklyCost);
  if (ops > 0) lines.push({ cat: "ops", label: "營運成本（場地・行政）", amount: -ops, color: COLOR.ops });

  const income = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const expense = lines.filter((l) => l.amount < 0).reduce((s, l) => s - l.amount, 0);
  return { lines, income, expense, net: income - expense };
}

/**
 * 純 reducer：結算指定週次。
 *
 * @param {object} state profileStore 狀態
 * @param {number} week  累計週次（timeline.deriveTime().week）
 * @returns {{nextState:object|null, receipt:object}}
 *   nextState = null 代表**完全沒有寫入**（已結算過）。
 */
export function settleWeekInState(state, week) {
  const w = Math.floor(Number(week) || 0);
  const economy = state.economy ?? { settledWeeks: {}, lastSettledWeek: 0 };
  const settled = economy.settledWeeks ?? {};
  if (w <= 0) {
    return { nextState: null, receipt: { ok: false, settled: false, alreadySettled: false, errors: ["week 必須 ≥ 1"] } };
  }
  const existing = settled[w];
  if (existing) return { nextState: null, receipt: { ...existing, alreadySettled: true } };

  const finance = state.finance ?? {};
  const { lines, income, expense, net } = buildWeekLines(state);
  const fundsBefore = num(finance.funds);
  const fundsAfter = fundsBefore + net;

  //  ── 合約倒數與到期 ──────────────────────────────────────────────────────
  //  先入帳、再遞減：合約有 N 週，就要領滿 N 週。遞減到 0 ⇒ 本週是最後一次入帳，
  //  下一週 activeSponsor 已是 null，不會再有贊助收入。
  const active = state.activeSponsor ?? null;
  const notices = [];
  let nextSponsor = active;
  if (active && num(active.weeksLeft) > 0) {
    const left = num(active.weeksLeft) - 1;
    const sp = sponsorById(active.id);
    if (left <= 0) {
      nextSponsor = null;
      notices.push({
        type: "sponsor",
        from: sp?.name ?? "贊助商",
        subject: `合約到期 · ${sp?.name ?? active.id}`,
        text: `與 ${sp?.name ?? active.id} 的贊助合約已於第 ${w} 週到期，每週 $${num(sp?.weekly)}萬 的收入停止入帳。可前往贊助商頁面洽談新合約。`,
      });
    } else {
      nextSponsor = { ...active, weeksLeft: left };
      if (left <= 2) {
        notices.push({
          type: "sponsor",
          from: sp?.name ?? "贊助商",
          subject: `合約即將到期（剩 ${left} 週）`,
          text: `與 ${sp?.name ?? active.id} 的合約剩 ${left} 週。到期後每週 $${num(sp?.weekly)}萬 的收入將停止。`,
        });
      }
    }
  }

  //  ── 交易帳本 ────────────────────────────────────────────────────────────
  //  id 由「週次 + 分類」決定性推導 ⇒ 不用 Date.now()，同一週不可能產生兩組。
  const txs = lines.map((l) => ({
    id: `w${w}-${l.cat}`,
    date: `第${w}週`,
    type: l.amount >= 0 ? "income" : "expense",
    cat: l.cat,
    label: l.label,
    amount: l.amount,
    color: l.color,
    week: w,
  }));

  const receipt = {
    ok: true,
    settled: true,
    alreadySettled: false,
    week: w,
    lines,
    income,
    expense,
    net,
    fundsBefore,
    fundsAfter,
    sponsorExpired: !!active && !nextSponsor,
    notices,
  };

  const nextState = {
    finance: {
      ...finance,
      funds: fundsAfter,
      //  新交易排在最前（與既有 transactions 相同慣例），上限 60 筆避免無限成長。
      transactions: [...txs, ...(finance.transactions ?? [])].slice(0, 60),
    },
    activeSponsor: nextSponsor,
    economy: {
      ...economy,
      settledWeeks: { ...settled, [w]: receipt },
      lastSettledWeek: Math.max(num(economy.lastSettledWeek), w),
    },
  };
  return { nextState, receipt };
}

/**
 * 純 reducer：推進 n 天，沿路把**已完整結束**的每一週都結算掉。
 *
 * 時間是唯一的：`meta.days` 是唯一計數，week / season 一律由它導出，
 * 不另存第二份（避免兩邊不同步）。
 *
 * @param {object} state
 * @param {number} n 推進天數（≥1）
 * @param {(state:object)=>object} onDay 每一天要套用的額外變化（例如訓練日結算）；
 *        回傳新的 state 切片合併結果。不提供則不做事。
 * @returns {{nextState:object, receipts:object[]}}
 */
export function advanceDaysInState(state, n = 1, onDay = null) {
  const steps = Math.max(1, Math.floor(Number(n) || 1));
  let cur = { ...state };
  const receipts = [];
  for (let i = 0; i < steps; i++) {
    if (typeof onDay === "function") cur = { ...cur, ...onDay(cur) };
    const meta = cur.meta ?? {};
    const beforeDays = num(meta.days) || 1;
    const afterDays = beforeDays + 1;
    const t = deriveTime(afterDays);
    cur = { ...cur, meta: { ...meta, days: afterDays, week: t.week, season: t.season } };
    //  跨過週結尾 ⇒ 結算**剛結束的那一週**（deriveTime(beforeDays).week）。
    const endedWeek = deriveTime(beforeDays).week;
    if (t.week > endedWeek) {
      const { nextState, receipt } = settleWeekInState(cur, endedWeek);
      if (nextState) cur = { ...cur, ...nextState };
      receipts.push(receipt);
    }
  }
  return { nextState: cur, receipts };
}
