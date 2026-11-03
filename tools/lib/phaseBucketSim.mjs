// ============================================================================
//  tools/lib/phaseBucketSim.mjs — Phase 3a-C3-2：分時期分桶的量測儀器（C3 開工清單 §3.4；D-19「三桶相加＝整場值」）
//
//  ⚠ 技能層：runner 在第一次 modules() 時讀 ESMO_BALANCE_SKILLS；沒設 ⇒ 英雄技能／被動／成長曲線**靜默關閉**。
//    G-A7／複驗的慣例是 skills on、talents off；呼叫端必須在第一次呼叫前設好（measure_phase_stance_c3 的 worker、check_phase_bucket_c3）。
//    每筆紀錄的 layers 欄位記下實際載入的層，量測工具據此做儀器檢查。（2026-10-21 C3-2 第一次研究漏設、在技能關閉下跑完：
//    tools/fixtures/phase_stance_result_c3_2.json 的證據範圍因此是「無技能」，見 phase_stance_registration_c3_2_rev1.json。）
//  身分：只讀。走 balance runner 的同一條組裝路徑（configure → assembleMatch；規則集由呼叫端指定，預設 balanceTool.v21），
//  在 tick 迴圈外側**只讀**引擎狀態，不加計數器、不改任何引擎行為。每一場回傳一筆小紀錄。
//  tools/lib/tacticTruthSim.mjs（真實性表的儀器）一個字都不改：它的檔案雜湊是真實性表過期判定的一部分。
//
//  ── 時期怎麼分 ──────────────────────────────────────────────────────────────
//   · 時期一律問 e.director.phase(e.t)（本檔不寫 480／960；check_phase_bucket_c3 掃原始碼）。
//   · 每一 tick 結束後讀 e.t：引擎在 tick 的第一個敘述就把 this.t 加上 dt，之後該 tick 的所有決策都用新的 t
//     （check_tactical_director_3c C6 釘住）⇒ 這一 tick 發生的事件與這一 tick 的秒數，都記到 phase(新的 t) 那一桶，
//     與引擎做決策時 Director 回答的時期相同。dt＝0.5 ⇒ 結束於 480.0 的那一 tick 算中期（前期桶是 0.5–479.5 秒的 959 個 tick）。
//  ── 每一桶數什麼（全是「瞬間事件」，定義與 tacticTruthSim 相同）──────────────────────────────
//   engages[p]       p.decisionAt 變了且 decisionAction 是 ENGAGE（新的接戰決策）
//   engageStarts[p]  同上，而且上一個決策不是 ENGAGE（只數開始；責任週期的對照）
//   fights[p]        己方英雄 state 從非「團戰!」變成「團戰!」
//   exec[p].<k>      引擎自己的 exec 計數（topGanks／midGanks／botGanks／dragonContests／baronContests）在該時期內的增量：
//                    時期改變的那一 tick 之前（上一 tick 結束時）讀快照、相減
//   phaseSecs[p]     該時期實際經過的秒數（tick 數 × dt）
//  ── 整場累計（自檢用）──────────────────────────────────────────────────────
//   whole.engages／whole.engageStarts／whole.fights（與分桶在同一個分支加一），以及比賽結束時引擎自己的 exec 總數。
//   自檢（selfCheck）：每一側、每一個量，三桶相加＝整場累計；phaseSecs 相加＝比賽長度。這是**內部一致性**（防記帳錯誤）；
//   「三桶相加＝整場值」的獨立證據是 check_phase_bucket_c3 X1：同 seed 同規則集，與未改動的 tacticTruthSim 的整場計數比對。
//  ── 每分鐘比率（D-19：事件數可分桶加總，比率必須重算）──────────────────────────────────
//   ratePerMin(rec, side, kind, p)＝該桶事件數 ÷（該桶秒數 ÷ 60）；該時期不足 60 秒 ⇒ null（事前寫死的納入規則，沿用 tacticTruthSim）。
//   **不是**整場比率按時期拆，也不能拿三個時期的比率平均回整場。
// ============================================================================
import { tacticInputOf } from "./tacticTruthSim.mjs";

export const PHASE_BUCKET_SIM_VERSION = "phaseBucketSim.v1";
export const PHASE_NAMES = Object.freeze(["early", "mid", "late"]);
export const DEFAULT_RULESET = "balanceTool.v21";
export const EXEC_KEYS = Object.freeze(["topGanks", "midGanks", "botGanks", "dragonContests", "baronContests"]);
const DT = 0.5;
const CAP_S = 3600;
const MIN_PHASE_SECS = 60;

const execOf = (e, side) => Object.fromEntries(EXEC_KEYS.map((k) => [k, e.exec?.[side]?.[k] ?? 0]));
const zeroExec = () => Object.fromEntries(EXEC_KEYS.map((k) => [k, 0]));

/**
 * @param {number} seed
 * @param {{blue?: object|null, red?: object|null, ruleset?: string, items?: string}} spec  blue／red＝tacticTruthSim 的 arm 形狀
 *   （null＝std；{ legacyConfig }＝完整的 MobaTacticConfig）
 */
export async function runPhaseMatch(seed, spec = {}) {
  const { modules, configure } = await import("../balance/moba_items_balance_runner.mjs");
  const M = await modules();
  const tactic = { blue: tacticInputOf(spec.blue ?? null), red: tacticInputOf(spec.red ?? null) };
  const ruleset = spec.ruleset ?? DEFAULT_RULESET;
  const { e } = configure(seed, spec.items ?? "standard", M, 1, null, tactic, ruleset);
  const players = e.players;
  const zero = () => ({ engages: [0, 0, 0], engageStarts: [0, 0, 0], fights: [0, 0, 0], exec: [zeroExec(), zeroExec(), zeroExec()],
    whole: { engages: 0, engageStarts: 0, fights: 0 } });
  const S = { blue: zero(), red: zero() };
  const prev = new Map(players.map((p) => [p.id, { state: p.state, decisionAt: p.decisionAt, action: p.decisionAction ?? null }]));
  const phaseSecs = [0, 0, 0];
  //  exec 快照：openAt[side]＝目前時期開始時的累計值；lastEnd[side]＝上一 tick 結束時的累計值。
  const openAt = { blue: execOf(e, "blue"), red: execOf(e, "red") };
  let lastEnd = { blue: execOf(e, "blue"), red: execOf(e, "red") };
  let cur = e.director.phase(e.t);
  const closePhase = (ph, endSnap) => {
    for (const side of ["blue", "red"]) for (const k of EXEC_KEYS) S[side].exec[ph][k] += endSnap[side][k] - openAt[side][k];
  };
  const firstTick = [null, null, null];
  for (let i = 1; i * DT <= CAP_S && !e.over; i++) {
    e.tick(DT);
    const t = e.t, ph = e.director.phase(t);
    if (ph !== cur) {
      //  時期改變：上一個時期的 exec 增量算到「上一 tick 結束時」為止；新時期從那個快照開始。
      closePhase(cur, lastEnd);
      for (const side of ["blue", "red"]) openAt[side] = { ...lastEnd[side] };
      cur = ph;
    }
    if (firstTick[ph] === null) firstTick[ph] = t;
    phaseSecs[ph] += DT;
    for (const p of players) {
      const s = S[p.side], q = prev.get(p.id);
      if (p.state === "團戰!" && q.state !== "團戰!") { s.fights[ph]++; s.whole.fights++; }
      if (p.decisionAt !== q.decisionAt && p.decisionAction === "ENGAGE") {
        s.engages[ph]++; s.whole.engages++;
        if (q.action !== "ENGAGE") { s.engageStarts[ph]++; s.whole.engageStarts++; }
      }
      q.state = p.state; q.decisionAt = p.decisionAt; q.action = p.decisionAction ?? null;   // 每 tick 都記（與 tacticTruthSim 相同）
    }
    lastEnd = { blue: execOf(e, "blue"), red: execOf(e, "red") };
  }
  closePhase(cur, lastEnd);
  const final = { blue: execOf(e, "blue"), red: execOf(e, "red") };
  const sideOut = (side) => ({ ...S[side], execFinal: final[side] });
  return {
    tool: PHASE_BUCKET_SIM_VERSION, seed, ruleset, directorMode: e.director?.mode ?? null,
    layers: { heroSkills: !!M.skills, heroPassives: !!M.passives, heroPowerCurve: !!M.curves, battleTalents: !!M.talents },
    duration: e.t, over: e.over ? 1 : 0, winner: e.winner ?? null, kills: e.bK + e.rK, phaseSecs, firstTick,
    blue: sideOut("blue"), red: sideOut("red"),
  };
}

/**
 * 時期姿態的臂（C3-2）：std 模板＋單一時期的一個選擇，經 Resolver 的 mergeTacticConfig 合成完整的 MobaTacticConfig，走 legacy 輸入。
 * 為什麼不走 createTacticPlan：被 MEASURED_EXCLUSIONS 排除的選擇（8 個時期姿態全在表上）會被拒絕，無法模擬；排除表只管「提供給玩家」，
 * 不改解析結果。對照組＝std 模板不加選擇、走**同一條** legacy 路徑（內容與 STANDARD_OPP_TACTIC 相同；check_phase_bucket_c3 驗）。
 * choice＝null ⇒ 對照組。
 */
export async function phaseStanceArm(dim, choice) {
  const { TACTIC_TEMPLATES } = await import("../../src/platform/tactics/tacticTemplates.js");
  const { mergeTacticConfig } = await import("../../src/platform/tactics/tacticChoiceMapping.js");
  const choices = {};
  if (choice !== null) {
    const m = /^phases\.(early|mid|late)\.stance$/.exec(dim);
    if (!m) throw new Error(`phaseStanceArm: not a phase stance dimension: ${dim}`);
    choices.phases = { [m[1]]: { stance: choice } };
  }
  return { legacyConfig: mergeTacticConfig(TACTIC_TEMPLATES.std, [], choices) };
}

/** 一筆紀錄的自檢：每一側、每一個量，三桶相加＝獨立的整場值；phaseSecs 相加＝比賽長度。回傳問題清單（空＝通過）。 */
export function selfCheck(rec) {
  const out = [];
  const sum = (a) => a[0] + a[1] + a[2];
  for (const side of ["blue", "red"]) {
    const s = rec[side];
    for (const k of ["engages", "engageStarts", "fights"]) if (sum(s[k]) !== s.whole[k]) out.push(`${side}.${k} 三桶 ${s[k].join("+")} ≠ 整場 ${s.whole[k]}`);
    for (const k of EXEC_KEYS) { const b = s.exec.map((x) => x[k]); if (sum(b) !== s.execFinal[k]) out.push(`${side}.exec.${k} 三桶 ${b.join("+")} ≠ 整場 ${s.execFinal[k]}`); }
    for (let p = 0; p < 3; p++) if (s.engageStarts[p] > s.engages[p]) out.push(`${side}.engageStarts[${p}] > engages[${p}]`);
  }
  if (Math.abs(rec.phaseSecs[0] + rec.phaseSecs[1] + rec.phaseSecs[2] - rec.duration) > 1e-9) out.push(`phaseSecs ${rec.phaseSecs.join("+")} ≠ duration ${rec.duration}`);
  return out;
}

/** 分時期每分鐘比率（D-19：由該桶自己的秒數重算）；不足 60 秒 ⇒ null。kind＝"engages"｜"engageStarts"｜"fights"。 */
export function ratePerMin(rec, side, kind, phaseName) {
  const p = PHASE_NAMES.indexOf(phaseName);
  if (p < 0 || !["engages", "engageStarts", "fights"].includes(kind)) throw new Error(`ratePerMin: bad ${kind}/${phaseName}`);
  const secs = rec.phaseSecs[p];
  return secs >= MIN_PHASE_SECS ? rec[side][kind][p] / (secs / 60) : null;
}

/** 事前登記的指標 id → 值（null＝不適用）。 */
export const PHASE_METRICS = Object.freeze({
  engageDecisionsPerMin: (rec, side, ph) => ratePerMin(rec, side, "engages", ph),
  engageStartsPerMin: (rec, side, ph) => ratePerMin(rec, side, "engageStarts", ph),
});
export function phaseMetricValue(rec, side, id) {
  const [name, ph] = String(id).split(".");
  if (!PHASE_METRICS[name] || !PHASE_NAMES.includes(ph)) throw new Error(`unknown phase metric ${id}`);
  const v = PHASE_METRICS[name](rec, side, ph);
  return Number.isFinite(v) ? v : null;
}
