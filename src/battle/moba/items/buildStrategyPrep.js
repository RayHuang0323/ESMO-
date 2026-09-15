// ============================================================================
//  battle/moba/items/buildStrategyPrep.js — 出裝策略的賽前輸入與預覽（Item System M3d）
//
//  一條線（不另算出裝）：
//    TacticScreen 選卡 → activeMatch.config.buildStrategy（當下存檔）→ AppShell → GameView
//    → useLocalServer.start({ buildStrategy }) → matchItemsConfig → engine.configureItems
//  · 我方五人套用同一策略；對手固定「標準」（Owner D4）；不做單英雄覆寫。
//  · 沒選／非法值 ⇒ 標準。策略為「標準」時輸出與 toEngineItems 預設逐欄相同（M2 指紋不變）。
//  · 預覽＝引擎開局那一次 buildTargets 的輸入：同一份 roster → toEngineItems（定位、治療判定），
//    席位定位＝LogicEngine 的 ROLES，敵方開局背包為空。M3 驗證器 G11 逐席位對照引擎 snapshot。
//  純函式：不讀時間、亂數、瀏覽器或 store。
// ============================================================================
import { ROLES } from "../../../gameData.js";
import { BUILD_STRATEGIES } from "./buildPolicy.js";
import { DAMAGE_PROFILE_BY_ARCH } from "./combatStatsV1.js";
import { toEngineItems } from "./itemsEngineAdapter.js";
import { previewStrategy } from "./itemsUiSelectors.js";

export const BUILD_STRATEGY_PREP_VERSION = "moba-items.strategy-prep.v1";
export const DEFAULT_BUILD_STRATEGY = "standard";
export const OPPONENT_BUILD_STRATEGY = "standard";

/** 與 itemsEngineRuntime 相同的缺定位退路（G11 用缺英雄資料的席位對照引擎 snapshot，改一邊就會紅）。 */
const FALLBACK_ARCH_BY_ROLE = Object.freeze({ top: "戰士", jungle: "刺客", mid: "法師", adc: "射手", sup: "輔助" });

const sideOf = (pid) => (String(pid)[0] === "r" ? "red" : "blue");
const seatRoleOf = (pid) => ROLES[Number(String(pid).slice(1)) - 1] ?? null;
const seatRank = (pid) => (sideOf(pid) === "blue" ? 0 : 10) + Number(String(pid).slice(1));

/** 五種策略之一原樣回傳；其他（null、打錯字、大小寫不同）一律回「標準」。 */
export function normalizeBuildStrategy(value) {
  return BUILD_STRATEGIES.includes(value) ? value : DEFAULT_BUILD_STRATEGY;
}

/**
 * 本場 configureItems 的輸入（useLocalServer 唯一呼叫點）。
 * @returns {{ players, meta } | null}
 */
export function matchItemsConfig({ roster, heroLookup, buildStrategy = null } = {}) {
  if (!roster) return null;
  const strategies = Object.fromEntries(Object.keys(roster)
    .filter((pid) => sideOf(pid) === "red")
    .map((pid) => [pid, OPPONENT_BUILD_STRATEGY]));
  return toEngineItems({ roster, heroLookup, strategies, defaultStrategy: normalizeBuildStrategy(buildStrategy) });
}

/**
 * 戰術頁的出裝策略預覽（五張卡各一份，同一位英雄）。
 * @param focusSeat 要預覽的我方席位；沒指定／無效 ⇒ 五人中「五張卡核心預覽差異最多」的英雄（同分：射手席 → 中路席 → 席位順序）
 * @returns {{ side, seats: [{ seat, heroId, arch, seatRole }], focusSeat, previews: { [strategy]: ReturnType<previewStrategy> }, spread, opponentStrategy } | null}
 */
export function selectStrategyPrepView({ roster, heroLookup, focusSeat = null, side = "blue" } = {}) {
  const cfg = toEngineItems({ roster, heroLookup });
  if (!cfg) return null;
  const all = Object.keys(cfg.players)
    .filter((pid) => seatRoleOf(pid))
    .sort((a, b) => seatRank(a) - seatRank(b))
    .map((pid) => {
      const c = cfg.players[pid];
      const seatRole = seatRoleOf(pid);
      return {
        seat: pid, side: sideOf(pid), heroId: c.heroId, seatRole, healer: c.healer,
        arch: DAMAGE_PROFILE_BY_ARCH[c.arch] ? c.arch : FALLBACK_ARCH_BY_ROLE[seatRole],
      };
    });
  const seats = all.filter((s) => s.side === side);
  if (!seats.length) return null;
  const enemies = all.filter((s) => s.side !== side).map((s) => ({ arch: s.arch, healer: s.healer, items: [] }));
  const previewsOf = (s) => Object.fromEntries(BUILD_STRATEGIES.map((strategy) => [
    strategy, previewStrategy({ arch: s.arch, seatRole: s.seatRole, strategy, enemies }),
  ]));
  //  五張卡顯示的是核心三件 ⇒ 差異只算核心（M3d 實測：選角後射手席是戰士，五種策略的核心完全相同，卡片看起來一模一樣）
  const spreadOf = (pv) => new Set(Object.values(pv).map((p) => p.core.join(","))).size;
  let focus = seats.find((s) => s.seat === focusSeat) ?? null;
  let previews = focus ? previewsOf(focus) : null;
  if (!focus) {
    const ROLE_PRIORITY = { adc: 0, mid: 1 };
    const order = [...seats].sort((a, b) => ((ROLE_PRIORITY[a.seatRole] ?? 2) - (ROLE_PRIORITY[b.seatRole] ?? 2)) || (seatRank(a.seat) - seatRank(b.seat)));
    let best = -1;
    for (const s of order) {
      const pv = previewsOf(s);
      const n = spreadOf(pv);
      if (n > best) { best = n; focus = s; previews = pv; }
    }
  }
  return {
    side,
    seats: seats.map(({ seat, heroId, arch, seatRole }) => ({ seat, heroId, arch, seatRole })),
    focusSeat: focus.seat,
    previews,
    spread: spreadOf(previews),
    opponentStrategy: OPPONENT_BUILD_STRATEGY,
  };
}
