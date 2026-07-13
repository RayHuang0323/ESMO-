// ============================================================================
//  progress/adapters/mobaProgressAdapter.js — BattleResult.v2 → Transaction（Sprint25）
//
//  只讀 BattleResult.v2 真實提供的欄位（winner / score / players[].rating /
//  participation / mvp / id）。**不修改 BattleResult.v2**。
//
//  ⚠ matchId：BattleResult.v2 **沒有 matchId、也沒有時間戳**（契約凍結，不能加）。
//    → 本 Adapter 以「比賽內容」決定性推導 matchId（內容雜湊）。
//    影響（誠實）：兩場「完全相同」的比賽（同勝方、同時長、同比分、10 人 KDA/
//    金錢/傷害全等）會得到同一個 matchId → 第二場不重複發獎。
//    這在實務上機率極低（duration 是 0.5 秒步進的浮點、dmg 是浮點），
//    而且 **比現況更安全**：seasonStore 現有的 resultKey 只用
//    winner|duration|score 四個值，碰撞面遠大於此。列為技術債（見交付報告）。
// ============================================================================
import { createMatchProgressTransaction } from "../../contracts/matchProgressTransaction.js";
import { calculateLevelProgress, PLAYER_LEVEL_FORMULA_VERSION } from "../playerLevel.js";
import {
  teamRewardsFor, mobaPerfFactor, playerXpFor,
  MOBA_REWARD_FORMULA_VERSION, PLAYER_XP_FORMULA_VERSION,
} from "../rewardFormulas.js";

/** 我方固定為藍隊（與 roster.js / draftRoster 一致）。 */
const HOME = "blue";

/** 決定性 matchId：BattleResult 內容 → 穩定字串（同一場永遠同一個 id）。 */
export function mobaMatchId(br) {
  const parts = [
    br.winner,
    round3(br.duration),
    br.score?.blue, br.score?.red,
    round3(br.gold?.blue), round3(br.gold?.red),
    br.towers?.blue, br.towers?.red,
    br.mvpId ?? "-",
    ...(br.players ?? []).map((p) => `${p.id}:${p.k}/${p.d}/${p.a}:${round3(p.gold)}:${round3(p.dmg)}`),
  ];
  return "m" + fnv1a(parts.join("|"));
}

/**
 * BattleResult.v2 → MatchProgressTransaction.v1
 * @param {object} br      BattleResult.v2（唯一資料來源，不重新統計）
 * @param {object} ctx     { players, streak, fansNow }
 *   players = profileStore.players（用來取 previousXp；只讀，不寫）
 *   streak  = 我方 MOBA 連勝（由呼叫端從 seasonStore 推導；本檔不讀 Store）
 *   fansNow = 目前粉絲數（updateEconomy 需要）
 */
export function mobaResultToTransaction(br, ctx = {}) {
  if (!br || br.schema !== "BattleResult.v2") return null;

  const roster = ctx.players ?? [];
  const byId = new Map(roster.map((p) => [p.id, p]));
  const win = br.winner === HOME;

  // ── 團隊獎勵（Legacy updateEconomy 逐字；marginF 用 Legacy 非 CS 分支的語意）──
  //    Legacy deriveMatchContext：非 CS ⇒ margin = win ? 3 : 0 → marginF = 3/8 或 0。
  const marginF = win ? 3 / 8 : 0;
  const team = teamRewardsFor({ win, marginF, streak: ctx.streak ?? 0, fansNow: ctx.fansNow ?? 0 });

  // ── 選手 XP（只給「我方且在名單裡」的選手；引擎的紅隊/示範選手不入帳）──
  const ours = (br.players ?? []).filter((p) => p.side === HOME);
  const meanRating = ours.length
    ? ours.reduce((s, p) => s + (Number.isFinite(p.rating) ? p.rating : 0), 0) / ours.length
    : 0;

  const playerProgress = [];
  for (const p of ours) {
    const me = byId.get(p.id);
    if (!me) continue;                       // 不在經營名單（引擎預設陣容）→ 不發 XP，不虛構選手
    const perf = mobaPerfFactor(p, meanRating);
    const isMvp = br.mvpId === p.id;
    const xpGained = playerXpFor({ win, perf, isMvp });
    const prog = calculateLevelProgress(me.xp ?? 0, xpGained);
    playerProgress.push({
      playerId: p.id,
      ...prog,
      reasons: [
        win ? "勝利" : "落敗",
        `表現 ×${perf.toFixed(2)}`,
        `參與度 ${Math.round((p.participation ?? 0) * 100)}%`,
        ...(isMvp ? ["MVP"] : []),
      ],
    });
  }

  return createMatchProgressTransaction({
    matchId: mobaMatchId(br),
    mode: "moba",
    sourceResultVersion: br.schema,
    teamRewards: { money: team.money, fans: team.fans, reputation: 0 },  // 聲望無經驗證公式 → 0
    playerProgress,
    unlocks: [],
    metadata: {
      winner: win ? "us" : "enemy",
      score: { us: br.score?.blue ?? 0, enemy: br.score?.red ?? 0 },
      rewardFormulaVersion: MOBA_REWARD_FORMULA_VERSION,
      playerXpFormulaVersion: PLAYER_XP_FORMULA_VERSION,
      playerLevelFormulaVersion: PLAYER_LEVEL_FORMULA_VERSION,
    },
  });
}

const round3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0);

/** FNV-1a 32-bit：決定性、無相依、跨 Node/瀏覽器一致。 */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}
