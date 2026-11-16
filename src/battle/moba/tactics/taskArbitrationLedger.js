// ============================================================================
//  battle/moba/tactics/taskArbitrationLedger.js — TaskArbitration.v1 觀測帳（moba-sim.v24 候選，taskArbitration "v1"）
//
//  步驟 A（2026-11-14）的觀測器在引擎外面包方法；這一支是同一份契約搬進引擎的版本：
//  LogicEngine 在英雄決策鏈的每個分支直接告訴它「誰贏」，在第二段每一層告訴它「有沒有改寫移動目標」。
//  **只寫紀錄，不回傳任何東西給決策**：引擎讀不到這裡的任何欄位 ⇒ 帶不帶這個層，對局逐 tick 相同
//  （tools/check_layer_isolation_v24.mjs 釘住）。純函式模組：不 import 引擎、不讀 rng。
//
//  每名存活英雄每 tick 一筆：
//    winner      第一段贏的任務（TASKS）
//    kind        winner 為 default 時的子類（DEFAULT_KINDS）
//    reason      原因碼（REASONS）
//    suppressed  前提也成立、但優先序較低而沒被採用的任務（只記引擎在決策當下就有的前提，見 SUPPRESSED_KEYS）
//    rewrites    第二段實際改了移動目標的層，依套用順序（REWRITES）
//  與步驟 A 的差別（精確度）：winner 直接由分支決定（不需要從標籤反推）；push／other 子類由引擎的最終預設標籤決定。
//  被壓下的任務只記 5 種（入侵被撤退接手、物件窗、團戰集結、抓人窗、遊走窗）；其餘的前提要重算判定函式，那會改到狀態，不做。
// ============================================================================

export const TASK_ARBITRATION_CONTRACT = "TaskArbitration.v1";
//  "defend"（v24 Sprint 1）：tacticExec 的回防者。與 invade 同一個優先序位置（排在 invade 之後）。
export const TASKS = Object.freeze(["retreat", "invade", "defend", "chase", "disengage", "tower_fallback", "objective_window",
  "initiative_siege", "team_call", "fight_join", "local", "default"]);
export const DEFAULT_KINDS = Object.freeze(["lane", "farm", "gank", "roam", "push", "other"]);
export const REASONS = Object.freeze(["hp_low", "local_retreat", "edge_retreat", "invade_window", "chase_hold", "disengage",
  "tower_fallback", "objective_window", "initiative_siege", "call_focus", "call_lowhp", "fight_join", "local_engage",
  "default_lane", "default_farm", "gank_window", "roam_window", "default_push", "default_other", "defend_window"]);
export const REWRITES = Object.freeze(["rewrite:formation", "rewrite:task_commit", "rewrite:tower_zone", "rewrite:idle_retask",
  "rewrite:edge_hold", "rewrite:safe_route", "rewrite:taunt"]);
export const SUPPRESSED_KEYS = Object.freeze(["invade", "objective_window", "fight_join", "default:gank", "default:roam"]);
/** 第一段的決定不應被第二段「發呆再任務／再任務承諾」改掉的任務（步驟 B 的鎖定對象；這一層只記錄，不鎖）。 */
export const LOCKABLE = Object.freeze(["invade", "chase", "objective_window", "team_call", "fight_join"]);

const RANK = Object.fromEntries(TASKS.map((k, i) => [k, i]));
const DEFAULT_KIND = { "對線": "lane", "游走": "lane", "打野": "farm", "抓人": "gank", "遊走": "roam",
  "帶線": "push", "推進": "push", "攻門牙塔": "push", "圍攻主堡": "push", "圍攻": "push", "回防": "other" };
const KIND_REASON = { lane: "default_lane", farm: "default_farm", gank: "gank_window", roam: "roam_window", push: "default_push", other: "default_other" };
const SUPP_RANK = { invade: RANK.invade, objective_window: RANK.objective_window, fight_join: RANK.fight_join, "default:gank": RANK.default, "default:roam": RANK.default };
const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const EPS = 1e-6;
export const movedTarget = (a, b) => (!a || !b ? a !== b : Math.abs(a.x - b.x) > EPS || Math.abs(a.y - b.y) > EPS);

const sideAcc = () => ({ records: 0, winners: {}, kinds: {}, reasons: {}, suppressed: {}, rewrites: {}, overridden: {} });

/** 一場對局一份。引擎只呼叫 beginTick／turn／endTick。 */
export function createTaskArbitrationLedger() {
  const acc = { blue: sideAcc(), red: sideAcc() };
  let ticks = 0, tick = [];
  return {
    contract: TASK_ARBITRATION_CONTRACT,
    acc,
    /** 這個 tick 的紀錄（每名存活英雄一筆；下一個 tick 開始時清空）。 */
    get lastTick() { return tick; },
    get ticks() { return ticks; },
    beginTick() { tick = []; ticks++; },
    /** 開一名英雄的回合；回傳一個只給引擎填的暫存物件（引擎不得讀它來做決定）。 */
    turn(p) { return { p, w: null, label: null, reason: null, sup: [], rw: [] }; },
    /** 回合結束：分類並累計。 */
    close(T, t) {
      const p = T.p, w = T.w ?? "default";
      let kind = null, reason = T.reason;
      if (w === "default") { kind = DEFAULT_KIND[T.label] ?? "other"; reason = KIND_REASON[kind]; }
      const wr = RANK[w];
      const sup = T.sup.filter((k) => (SUPP_RANK[k] ?? -1) > wr || (k.startsWith("default:") && w !== "default"));
      const rec = { t, id: p.id, side: p.side, winner: w, reason, suppressed: sup, rewrites: T.rw };
      if (kind) rec.kind = kind;
      tick.push(rec);
      const A = acc[p.side];
      A.records++; inc(A.winners, w); if (kind) inc(A.kinds, kind); inc(A.reasons, reason);
      for (const k of sup) inc(A.suppressed, `${k}>${w}`);
      for (const k of T.rw) {
        inc(A.rewrites, `${k}|${w}`);
        if ((k === "rewrite:idle_retask" || k === "rewrite:task_commit") && LOCKABLE.includes(w)) inc(A.overridden, `${k}|${w}`);
      }
      return rec;
    },
    summary() { return { contract: TASK_ARBITRATION_CONTRACT, ticks, blue: acc.blue, red: acc.red }; },
  };
}
