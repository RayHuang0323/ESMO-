// ============================================================================
//  platform/progress/rewardFormulas.js — 獎勵公式（Sprint25，純函式）
//
//  這裡是**唯一**的獎勵公式所在地。Result Screen / Store / Adapter 都不得自己算。
//
//  團隊獎勵（錢 / 粉絲）：直接重用 matchRecorder.updateEconomy —— Legacy 逐字、
//    CS 自 Sprint23 起已在用。Sprint25 讓 MOBA 也走同一條，**不重新平衡**。
//
//  選手 XP：Sprint25 之前**完全不存在**（players[] 連 xp 欄位都沒有）。
//    沒有 Legacy 公式可重用 → 本檔新建，並沿用 Legacy 團隊 xpGain 的 50/20 刻度
//    當作 base，讓兩者量級一致。
//
//  §9 要求（角色公平 / 防雪球）：
//    · 不可只看擊殺數。
//    · performance multiplier 必須有上下限 → PERF_MIN / PERF_MAX。
//    · MOBA Support / CS IGL 不可因定位長期吃虧 → 表現分一半來自
//      「參與度 / KAST」這類角色公平指標，不只看 rating。
//    · 不依比賽長度放大獎勵 → 公式完全不含 duration。
// ============================================================================
import { updateEconomy } from "../data/matchRecorder.js";

export const MOBA_REWARD_FORMULA_VERSION = "moba-reward.v1";   // = Legacy updateEconomy（逐字重用）
export const CS_REWARD_FORMULA_VERSION = "cs-reward.v1";       // = Legacy updateEconomy（逐字重用）
export const PLAYER_XP_FORMULA_VERSION = "player-xp.v1";       // Sprint25 新建（無 Legacy 可用）

/** 表現係數上下限（防雪球、防定位歧視；MOBA / CS 共用同一組，避免兩款遊戲失衡） */
export const PERF_MIN = 0.75;
export const PERF_MAX = 1.35;

/** 基礎 XP：沿用 Legacy 團隊 xpGain 刻度（勝 50 / 負 20） */
export const BASE_XP_WIN = 50;
export const BASE_XP_LOSS = 20;
/** MVP 小幅加成（§9：僅「小幅調整」，不可讓 MVP XP 異常高） */
export const MVP_BONUS_XP = 10;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

/**
 * 團隊獎勵（錢 / 粉絲）。兩種模式共用，只有 marginF / streak 由 Adapter 依自己的
 * 比分語意算出來 → 保證「打一場 CS ≠ 打十場 MOBA」。
 * @returns {{ money:number, fans:number, prizeWan:number }} money 單位為「元」
 */
export function teamRewardsFor({ win, marginF, streak, fansNow }) {
  const eco = updateEconomy(
    {
      record: { streak: fin(streak, 0) },
      fanCount: fin(fansNow, 0),
      budget: 0,
      // 哨兵：只借用 fanGain / prizeGain，不觸發 team 等級迴圈
      // （team.lv/xp 是「萬 XP」展示刻度，與此處刻度不符 —— Sprint23 已標記，S25 不碰）
      xp: { lv: 0, cur: 0, max: Number.MAX_SAFE_INTEGER },
    },
    { win, marginF: clamp(fin(marginF, 0), 0, 1) }
  );
  return {
    prizeWan: eco.prizeGain,          // Legacy 以「萬」計價
    money: eco.prizeGain * 10_000,    // profileStore.finance 以「元」存放
    fans: eco.fanGain,
  };
}

/**
 * MOBA 表現係數。
 *
 * ⚠ 為什麼不能拿 playerRating 當主要依據（這是本 Sprint 實測抓到的真問題）：
 *   playerRating = k×3 + a×1.5 − d×2 + dmg/800 + heal/1600 + gold/400，
 *   是**未正規化的原始分**，且重金錢與擊殺。實測 fixture 中
 *   carry 62 分 vs 輔助 10 分（差 6 倍）——若讓它佔一半權重，
 *   輔助永遠被壓在下限 → 正是 §9 明文禁止的「Support 因 KDA 低而無法成長」。
 *
 * 因此改成：
 *   · **participation（(k+a)/隊伍總擊殺）為主**——這是對定位公平的貢獻度指標，
 *     助攻與擊殺同權，輔助不吃虧。
 *   · rating 只當「相對隊友」的**有限修正**（±15%），保留 carry / 混子的差別，
 *     但不讓它主宰結果。
 *   基準 0.75 + 參與度(0–0.5) + 相對 rating 修正(±0.15) → 再夾在 0.75–1.35。
 */
export function mobaPerfFactor(player, teamMeanRating) {
  const mean = fin(teamMeanRating, 0);
  const rel = mean > 0 ? clamp(fin(player.rating, 0) / mean, 0, 2) : 1;
  const part = clamp(fin(player.participation, 0), 0, 1);
  const raw = PERF_MIN + part * 0.5 + (rel - 1) * 0.15;
  return clamp(raw, PERF_MIN, PERF_MAX);
}

/**
 * CS 表現係數。
 *   一半看 rating（引擎輸出，本來就以 1.0 為基準），
 *   一半看 KAST（回合貢獻率）——IGL / support 的 rating 天生偏低但 KAST 高，
 *   這一半把他們拉回來（§9）。KAST 缺值 → 中性 1.0，不虛構貢獻。
 */
export function csPerfFactor(player) {
  const rating = clamp(fin(player.rating, 1), 0.5, 1.8);
  const kast = player.kast == null ? null : fin(player.kast, null);
  const kastF = kast == null ? 1 : clamp(kast / 70, 0.6, 1.4);
  return clamp(0.5 * rating + 0.5 * kastF, PERF_MIN, PERF_MAX);
}

/**
 * 選手單場 XP（兩種模式共用最後這一步，保證量級一致）。
 * 公式：round(base × perf) + MVP 加成
 *   base：勝 50 / 負 20（Legacy 刻度）
 *   perf：0.75–1.35（有限幅）
 *   → 勝 37–68（+MVP 10）、負 15–27 ⇒ 贏一定比輸多，MVP 只是小幅領先。
 *   ⚠ 不含 duration / roundCount：比賽拖長不會放大獎勵（§8）。
 */
export function playerXpFor({ win, perf, isMvp }) {
  const base = win ? BASE_XP_WIN : BASE_XP_LOSS;
  const p = clamp(fin(perf, 1), PERF_MIN, PERF_MAX);
  const xp = Math.round(base * p) + (isMvp ? MVP_BONUS_XP : 0);
  return Math.max(0, xp);   // XP 不可為負
}
