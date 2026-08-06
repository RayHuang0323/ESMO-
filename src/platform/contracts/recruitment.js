// ============================================================================
//  platform/contracts/recruitment.js — RecruitmentTransaction.v1（Milestone O）
//
//  ── 這份契約要解決什麼 ────────────────────────────────────────────────────
//  ESMO 未來以線上連線對戰為核心，招募最終要由**伺服器**發放與裁決
//  （新秀池由伺服器產生、簽約要防止兩個客戶端搶同一人、金流要可稽核）。
//  所以招募不能只是「畫面呼叫 store 改陣列」，必須有一張**可驗證、可重播、
//  可由伺服器簽發**的交易單。
//
//  這份契約刻意與 S25 的 `MatchProgressTransaction.v1` 同一套手法：
//    · `transactionId` **決定性推導**（poolSeed + prospectId）⇒ 冪等鍵天然唯一，
//      同一位新秀不可能被簽兩次，客戶端重試或雙掛載都安全。
//    · 交易單自帶**簽約當下的選手快照**（stats/potential/age…）⇒ 伺服器日後
//      即使改了新秀池演算法，既有合約也能原樣重播。
//    · 純資料 + 純函式，不 import React / zustand / localStorage。
//
//  ⚠ 這**不是**第二套選手資料：交易單只是「入隊的憑證」，
//    選手唯一存放處仍是 `profileStore.players[]`。
// ============================================================================

export const RECRUITMENT_TX_VERSION = "RecruitmentTransaction.v1";

/**
 * 冪等鍵：由「新秀池 seed + 池內編號」決定性推導。
 *
 * 新秀池 `genProspects(seed)` 是固定 seed 的決定性亂數，池內編號 0–39，
 * 因此 (seed, id) 唯一指向一位新秀。日後改由伺服器發池時，
 * seed 換成伺服器的池識別碼即可，形狀不變。
 */
export function makeRecruitmentId(poolSeed, prospectId) {
  return `recruit:${poolSeed}:${prospectId}:v1`;
}

/**
 * 由新秀資料建立一張招募交易單。
 *
 * @param {object}   p
 * @param {number|string} p.poolSeed   新秀池識別（目前是本機 seed；日後為伺服器池 id）
 * @param {object}   p.prospect        `data/recruitPool.js` 的新秀物件
 * @param {object}   p.signedAt        {day, week, season}（簽約當下的遊戲時間）
 * @returns {object} RecruitmentTransaction.v1
 */
export function createRecruitmentTransaction({ poolSeed, prospect, signedAt }) {
  const pid = prospect?.id;
  return {
    schema: RECRUITMENT_TX_VERSION,
    transactionId: makeRecruitmentId(poolSeed, pid),
    poolSeed,
    prospectId: pid,
    //  簽約金（單位：**萬**，與新秀池 cost 同單位；換算成元由 reducer 負責）
    costWan: num(prospect?.cost),
    //  簽約當下的選手快照——伺服器接管後仍能原樣重建這名選手
    player: {
      name: prospect?.name ?? "",
      role: prospect?.role ?? "",
      age: num(prospect?.age),
      potential: num(prospect?.potential),
      personality: prospect?.personality ?? null,
      traits: Array.isArray(prospect?.traits) ? [...prospect.traits] : [],
      tier: prospect?.tier?.grade ?? null,
      stats: { ...(prospect?.stats ?? {}) },
    },
    signedAt: {
      day: num(signedAt?.day),
      week: num(signedAt?.week),
      season: num(signedAt?.season),
    },
  };
}

/**
 * 驗證交易單。**不合法一律拒絕，呼叫端不得部分套用**
 * （半套狀態＝扣了錢沒進人，或進了人沒扣錢）。
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateRecruitmentTransaction(t) {
  const errors = [];
  if (!t || typeof t !== "object") return { ok: false, errors: ["交易單不是物件"] };
  if (t.schema !== RECRUITMENT_TX_VERSION) errors.push(`schema 必須為 ${RECRUITMENT_TX_VERSION}，收到 ${t.schema}`);
  if (t.prospectId === undefined || t.prospectId === null) errors.push("缺 prospectId");
  if (t.poolSeed === undefined || t.poolSeed === null) errors.push("缺 poolSeed");
  if (t.transactionId !== makeRecruitmentId(t.poolSeed, t.prospectId)) {
    errors.push("transactionId 與 poolSeed/prospectId 不一致（冪等鍵必須可決定性推導）");
  }
  if (!Number.isFinite(Number(t.costWan)) || Number(t.costWan) < 0) errors.push("costWan 必須為非負有限數字");
  const p = t.player;
  if (!p || typeof p !== "object") errors.push("缺 player 快照");
  else {
    if (!p.name) errors.push("player.name 不可為空");
    if (!p.role) errors.push("player.role 不可為空");
    if (!Number.isFinite(Number(p.potential))) errors.push("player.potential 必須為數字");
    if (!p.stats || typeof p.stats !== "object" || !Object.keys(p.stats).length) errors.push("player.stats 不可為空");
  }
  return { ok: errors.length === 0, errors };
}

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
