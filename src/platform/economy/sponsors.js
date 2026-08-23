// ============================================================================
//  platform/economy/sponsors.js — 贊助資料的統一解析（Milestone N3.1）
//
//  ── 為什麼需要這支 ────────────────────────────────────────────────────────
//  N3.1 要給新手情境一份「開局自動附帶」的扶持贊助。它**不應該**進
//  `data/playerModel.js` 的 SPONSORS：
//    · 那份是 Legacy 逐字保留的**贊助市集目錄**，任何人都能簽。
//      扶持贊助是開局贈與，不該出現在市集裡讓玩家重複簽。
//    · 那是 Legacy 資料，非必要不動。
//
//  所以扶持贊助定義在本檔，並提供 `resolveSponsor(id)` 作為**唯一**的解析入口：
//  先查市集目錄，再查扶持方案。週結算、現金預測與所有畫面都改用它 ⇒
//  不會出現「經濟層有收入、但畫面說沒有贊助商」的不一致。
//
//  ⚠ 這不是第二套贊助資料：市集目錄仍然只有 SPONSORS 一份，
//    本檔只是多了一組**不可簽、只能被贈與**的方案。
// ============================================================================
import { SPONSORS } from "../../data/playerModel.js";

/**
 * 開局扶持方案（不進市集，只能由 `startNewGame` 依情境贈與）。
 *
 * 金額設計（新手情境，種子五人）：
 *   支出 = 薪資 12.2 + 營運 5.5 = 17.7 萬／週
 *   收入 = 基礎營收 6 + 扶持固定 7 + 扶持績效 7×戰績
 *   ⇒ 戰績 50% 時淨額 **−1.2 萬／週**（接近平衡、小幅虧損）
 *      戰績 100% 時 +2.3 萬；戰績 0% 時 −4.7 萬 ⇒ 成績仍然有意義。
 *   8 週到期後回到 −11.7 萬／週 ⇒ 扶持是**緩衝期**，不是永久補貼，
 *   玩家必須在期限內談到真正的贊助。
 */
export const STARTER_SPONSORS = Object.freeze({
  rookie_grant: Object.freeze({
    id: "rookie_grant",
    name: "新創扶持計畫",
    emoji: "🌱",
    tier: "扶持",
    weekly: 14,        // 萬／週（與 SPONSORS 同單位）
    weeks: 8,          // 合約週數（需求指定 6～8 週）
    signBonus: 0,      // 開局贈與，沒有簽約金
    color: "#34d399",
    perk: "開局扶持，到期後不續約",
    starter: true,     // 標記：畫面可據此顯示「扶持」而非一般贊助
  }),
});

/**
 * 贊助資料的唯一解析入口：市集目錄 → 扶持方案。
 * 找不到回 null（呼叫端一律要處理 null，不得假設有值）。
 */
export function resolveSponsor(id) {
  if (!id) return null;
  return SPONSORS.find((s) => s.id === id) ?? STARTER_SPONSORS[id] ?? null;
}

/**
 * 贊助資格判定（Fan System F1）——**唯一的資格規則**。
 *
 * ── 為什麼要有這一支 ──────────────────────────────────────────────────────
 * F1 之前，同一條規則寫在兩個地方：
 *   · `profileStore.signSponsor()`：`ctx.fans < sp.reqFans || ctx.wins < sp.reqWins` → 拒絕
 *   · `SponsorScreen.jsx`：`const qualifies = (sp) => fans >= sp.reqFans && wins >= sp.reqWins`
 * 兩份實作只要有一份改了，畫面就會說「條件達標」而 Store 拒簽（或反過來）。
 * `reqFans` 全部達標的時候看不出來；F1 讓粉絲**真的**擋人之後，這就是會被玩家踩到的 bug。
 *
 * 所以資格集中在這裡：Store 判定用它，畫面顯示也用它，**畫面不自己算**。
 *
 * ⚠ 只回報「夠不夠」，不回報「值多少」——價碼分級是 Fan v1.1（裁決 3）。
 * ⚠ `fans` 必須是 canonical 的 `meta.fans`，呼叫端不得自己另算一份粉絲數。
 *
 * @param {object} sponsor  SPONSORS 之一（扶持方案沒有門檻，一律視為不可主動簽）
 * @param {{fans:number, wins:number}} ctx
 * @returns {{ok:boolean, fansOk:boolean, winsOk:boolean, fansShort:number, winsShort:number}}
 */
export function sponsorEligibility(sponsor, ctx = {}) {
  const deny = { ok: false, fansOk: false, winsOk: false, fansShort: 0, winsShort: 0 };
  if (!sponsor) return deny;
  //  扶持方案是開局贈與，不走資格判定，也不可主動簽。
  if (isStarterSponsor(sponsor.id)) return deny;

  const fans = Number.isFinite(ctx.fans) ? ctx.fans : 0;
  const wins = Number.isFinite(ctx.wins) ? ctx.wins : 0;
  const reqFans = Number.isFinite(sponsor.reqFans) ? sponsor.reqFans : 0;
  const reqWins = Number.isFinite(sponsor.reqWins) ? sponsor.reqWins : 0;

  const fansOk = fans >= reqFans;
  const winsOk = wins >= reqWins;
  return {
    ok: fansOk && winsOk,
    fansOk,
    winsOk,
    fansShort: Math.max(0, reqFans - fans),
    winsShort: Math.max(0, reqWins - wins),
  };
}

/** 這個 id 是不是開局扶持方案（市集不顯示、不可主動簽）。 */
export const isStarterSponsor = (id) => !!STARTER_SPONSORS[id];
