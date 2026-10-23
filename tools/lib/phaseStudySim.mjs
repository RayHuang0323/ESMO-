// ============================================================================
//  tools/lib/phaseStudySim.mjs — Phase 3a-C3-3／C4／C5：每時期選擇的量測儀器（只讀；不改引擎、不改係數）
//
//  走 balance runner 的同一條組裝路徑（規則集預設 balanceTool.v21）。戰術輸入一律是 legacy 設定（std 模板＋整場選擇，經 Resolver 的
//  mergeTacticConfig）＋可選的 phaseChoices（每時期選擇，只有工具規則集接受；PHASE_CHOICE_MAPPING）。
//  ⚠ 技能層：呼叫端必須在第一次呼叫前設 ESMO_BALANCE_SKILLS=on、清掉 ESMO_BALANCE_TALENTS（G-A7 慣例）；紀錄的 layers 記下實際載入的層。
//  時期一律問 e.director.phase(e.t)（tick 結束時；引擎在 tick 第一個敘述推進時間）。本檔不寫 480／960。
//
//  ── 每時期（依事件發生那一 tick 的時期分桶；物件類依「出現」那一刻的時期，契約 §3.3）──────────────────
//   phaseSecs[p]          該時期經過的秒數
//   C3-3 集結：joinGoStarts[p]（上／中／下路英雄的參團擲骰由 false 變 true，_joinV3 的觀察包裝，同 c7DiagSim）、
//              joinGoGeneralStarts[p]（同上，只算一般熱點：hot 不是巨龍／巴龍坑的**參照**，與引擎 _joinChance、c7DiagSim 同判法；
//              坑位擲骰讀 dragonJoin／baronJoin，不受 joinFight 影響 ⇒ C3-3 的宣稱指標用這個）、
//              laneGeneralEntries[p]（上／中／下路英雄在物件窗以外進入「團戰!」）
//   C4 物件：  objApps.<k>[p]、objContested.<k>[p]（那一次出現期間 exec.<k>Contests 增加）、objCaptured.<k>[p]（objectiveLog 擊殺方）、
//              siegeOpens[p]（fsm3 主動權窗被設定且種類是 siege）
//   C5 強邊：  ganksOwn.<top|mid|bot>[p]（打野出發抓人，exec.<world>Ganks 的增量換成**己方路名**：gameData.sideRelativeLane）
//              指標：gankShare.<lane>.<p>（占比）、ganksPerMin.<p>（總量）、ganksOwnPerMin.<lane>.<p>（C5R：該路次數 ÷ 分）
//   C3-2 對照：engages[p]／engageStarts[p]（同 phaseBucketSim）
//   整場：duration、winner、kills。
//   ── v2（2026-10-24，Phase 3a-C6；只**新增**欄位與指標，上面每一個計數的算法都沒動）──
//   seatFightsPh[seat][p]  己方該席位（b1–b5，依 p.id 的席號）的英雄從非「團戰!」變成「團戰!」（同 tacticTruthSim 的 seatFights，依時期分桶）。
//   goldAtPhaseEnd[p]      時期結束那一 tick 的雙方隊伍金錢 { blue, red }（e.bGold／e.rGold；比賽在該時期內結束 ⇒ null）。
//   指標：seatFightEntriesPerMin.<seat>.<p 或 p+p>、goldLeadAt.<early|mid>（己方 − 對方）、win（該側獲勝＝1；未分勝負 ⇒ null）、durationMin。
//   勝利條件：studyInput 的 choices 可帶 winCondition（經 tacticChoiceMapping.effectiveTacticChoices 展開，與正式解析同一個函式）。
// ============================================================================
import { tacticInputOf } from "./tacticTruthSim.mjs";

export const PHASE_STUDY_SIM_VERSION = "phaseStudySim.v2";
export const DEFAULT_RULESET = "balanceTool.v21";
export const PHASE_NAMES = Object.freeze(["early", "mid", "late"]);
const DT = 0.5, CAP_S = 3600, MIN_PHASE_SECS = 60;
const SIDES = ["blue", "red"], LANE_ROLES = ["top", "mid", "adc"], WORLD = ["top", "mid", "bot"];

/** std 模板＋整場選擇（巢狀 choices，可空）＋每時期選擇（可空）→ runner 的戰術輸入。 */
export async function studyInput(choices = {}, phaseChoices = null) {
  const { TACTIC_TEMPLATES } = await import("../../src/platform/tactics/tacticTemplates.js");
  const { mergeTacticConfig, effectiveTacticChoices, leavesOf, nestedOf, PHASE_CHOICE_MAPPING } = await import("../../src/platform/tactics/tacticChoiceMapping.js");
  //  v2：choices 可以帶 winCondition，也可以直接帶每時期維度（phases.<p>.focusLane 等）；先展開勝利條件（只填沒選的格），
  //  再把每時期維度分到 phaseChoices。沒有 winCondition、也沒有每時期維度 ⇒ 與 v1 逐字相同（舊登記的輸入照舊）。
  const leaves = leavesOf(effectiveTacticChoices("std", [], choices ?? {}));
  const isPhase = ([d]) => Object.hasOwn(PHASE_CHOICE_MAPPING.rows, d);
  const config = mergeTacticConfig(TACTIC_TEMPLATES.std, [], nestedOf(leaves.filter((l) => !isPhase(l))));
  const fromChoices = leaves.filter(isPhase).map(([d, v]) => { const [, p, f] = d.split("."); return [p + "." + f, v]; });
  const pc = structuredClone(phaseChoices ?? {});
  for (const [pf, v] of fromChoices) {
    const [p, f] = pf.split(".");
    if (pc[p]?.[f] !== undefined) throw new Error("studyInput: phases." + pf + " given twice");
    (pc[p] ??= {})[f] = v;
  }
  return { kind: "legacy", config, ...(Object.keys(pc).length ? { phaseChoices: pc } : {}) };
}

export async function runPhaseStudyMatch(seed, spec) {
  const { modules, configure } = await import("../balance/moba_items_balance_runner.mjs");
  const { sideRelativeLane } = await import("../../src/gameData.js");
  const M = await modules();
  const ruleset = spec.ruleset ?? DEFAULT_RULESET;
  const { e } = configure(seed, "standard", M, 1, null, { blue: spec.blue ?? tacticInputOf(null), red: spec.red ?? tacticInputOf(null) }, ruleset);
  const players = e.players;
  const z3 = () => [0, 0, 0];
  const zero = () => ({ engages: z3(), engageStarts: z3(), joinGoStarts: z3(), joinGoGeneralStarts: z3(), laneGeneralEntries: z3(), siegeOpens: z3(),
    objApps: { dragon: z3(), baron: z3() }, objContested: { dragon: z3(), baron: z3() }, objCaptured: { dragon: z3(), baron: z3() },
    ganksOwn: { top: z3(), mid: z3(), bot: z3() }, seatFightsPh: { b1: z3(), b2: z3(), b3: z3(), b4: z3(), b5: z3() } });
  const S = { blue: zero(), red: zero() };
  const phaseSecs = z3();
  const goldAtPhaseEnd = [null, null, null];
  let ph = e.director.phase(e.t);
  //  C3-3：參團擲骰的觀察包裝（呼叫原方法、原樣回傳；check_phase_study_c3 驗證包裝前後對局逐欄相同）。
  const orig = e._joinV3;
  const pitD = e._pitOf("dragon"), pitB = e._pitOf("baron");
  e._joinV3 = function (p, hot, ...rest) {
    const before = p.joinEvalT, goBefore = !!p.joinGo;
    const r = orig.call(this, p, hot, ...rest);
    if (p.joinEvalT !== before && LANE_ROLES.includes(p.role) && p.joinGo && !goBefore) { S[p.side].joinGoStarts[ph]++; if (hot !== pitD && hot !== pitB) S[p.side].joinGoGeneralStarts[ph]++; }
    return r;
  };
  const prev = new Map(players.map((p) => [p.id, { state: p.state, decisionAt: p.decisionAt, action: p.decisionAction ?? null }]));
  const life = { dragon: null, baron: null }, wasAlive = { dragon: !!e.dragon?.alive, baron: !!e.baron?.alive };
  const initSeen = { blue: e.fsm3?.blue?.initUntil, red: e.fsm3?.red?.initUntil };
  let logSeq = e._objLogSeq ?? 0;
  const closeLife = (key) => {
    const L = life[key]; if (!L) return;
    for (const side of SIDES) { S[side].objApps[key][L.ph]++; if (L.contested[side]) S[side].objContested[key][L.ph]++; if (L.captured === side) S[side].objCaptured[key][L.ph]++; }
    life[key] = null;
  };
  for (let i = 1; i * DT <= CAP_S && !e.over; i++) {
    const execBefore = Object.fromEntries(SIDES.map((s) => [s, { ...e.exec[s] }]));
    //  包裝在 tick 裡被呼叫時，用的是這一 tick 的時期：引擎第一個敘述就推進時間，所以先算好 tick 結束時刻的時期。
    ph = e.director.phase(e.t + DT);
    e.tick(DT);
    const t = e.t;
    const phPrev = ph;
    ph = e.director.phase(t);
    //  v2：時期換了 ⇒ 記下「上一個時期結束」時的雙方金錢（這一 tick 結束時的值；邊界上至多差一個 tick，同其他分桶）。
    if (ph !== phPrev && goldAtPhaseEnd[phPrev] === null) goldAtPhaseEnd[phPrev] = { blue: e.bGold, red: e.rGold };
    phaseSecs[ph] += DT;
    for (const p of players) {
      const s = S[p.side], q = prev.get(p.id);
      if (p.state === "團戰!" && q.state !== "團戰!" && LANE_ROLES.includes(p.role) && !p.objGo) s.laneGeneralEntries[ph]++;
      if (p.state === "團戰!" && q.state !== "團戰!") s.seatFightsPh["b" + Number(p.id.slice(1))][ph]++;
      if (p.decisionAt !== q.decisionAt && p.decisionAction === "ENGAGE") { s.engages[ph]++; if (q.action !== "ENGAGE") s.engageStarts[ph]++; }
      q.state = p.state; q.decisionAt = p.decisionAt; q.action = p.decisionAction ?? null;
    }
    for (const side of SIDES) for (const w of WORLD) {
      const d = (e.exec[side][`${w}Ganks`] ?? 0) - (execBefore[side][`${w}Ganks`] ?? 0);
      if (d) S[side].ganksOwn[sideRelativeLane(side, w)][ph] += d;
    }
    for (const key of ["dragon", "baron"]) {
      const alive = !!e[key]?.alive;
      if (alive && !wasAlive[key]) life[key] = { ph, contested: { blue: false, red: false }, captured: null };
      if (life[key]) for (const side of SIDES) if ((e.exec[side][`${key}Contests`] ?? 0) > (execBefore[side][`${key}Contests`] ?? 0)) life[key].contested[side] = true;
    }
    if ((e._objLogSeq ?? 0) !== logSeq) {
      for (const ev of e.objectiveLog) if (ev.seq > logSeq && life[ev.key] && life[ev.key].captured === null && SIDES.includes(ev.side)) life[ev.key].captured = ev.side;
      logSeq = e._objLogSeq;
    }
    for (const key of ["dragon", "baron"]) { const alive = !!e[key]?.alive; if (!alive && wasAlive[key]) closeLife(key); wasAlive[key] = alive; }
    for (const side of SIDES) {
      const F = e.fsm3?.[side];
      if (F && F.initUntil !== initSeen[side]) { initSeen[side] = F.initUntil; if (F.initKind === "siege") S[side].siegeOpens[ph]++; }
    }
  }
  closeLife("dragon"); closeLife("baron");
  const execFinal = Object.fromEntries(SIDES.map((s) => [s, { ...e.exec[s] }]));
  return { tool: PHASE_STUDY_SIM_VERSION, seed, ruleset, directorMode: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null,
    layers: { heroSkills: !!M.skills, heroPassives: !!M.passives, heroPowerCurve: !!M.curves, battleTalents: !!M.talents },
    duration: e.t, over: e.over ? 1 : 0, winner: e.winner ?? null, kills: e.bK + e.rK, phaseSecs, goldAtPhaseEnd, blue: S.blue, red: S.red, execFinal };
}

/** 一筆紀錄的自檢（內部一致性）：每時期桶相加＝引擎整場值（爭奪、抓人）；秒數相加＝長度；每側物件出現次數相同。 */
export function selfCheck(r) {
  const out = [], sum = (a) => a[0] + a[1] + a[2];
  for (const side of SIDES) {
    for (const k of ["dragon", "baron"]) if (sum(r[side].objContested[k]) !== r.execFinal[side][`${k}Contests`]) out.push(`${side}.${k} contested ${sum(r[side].objContested[k])}≠${r.execFinal[side][`${k}Contests`]}`);
    const g = WORLD.reduce((n, w) => n + (r.execFinal[side][`${w}Ganks`] ?? 0), 0), gb = ["top", "mid", "bot"].reduce((n, l) => n + sum(r[side].ganksOwn[l]), 0);
    if (g !== gb) out.push(`${side} ganks ${gb}≠${g}`);
  }
  if (JSON.stringify(r.blue.objApps) !== JSON.stringify(r.red.objApps)) out.push("objApps differ between sides");
  if (Math.abs(sum(r.phaseSecs) - r.duration) > 1e-9) out.push("phaseSecs≠duration");
  return out;
}

const per = (n, secs) => (secs >= MIN_PHASE_SECS ? n / (secs / 60) : null);
const pi = (p) => PHASE_NAMES.indexOf(p);
/** 指標 id → 值（null＝不適用）。合併桶用「+」連接時期（例 contestShare.dragon.early+mid：分子分母各自相加）。 */
export function studyMetricValue(r, side, id) {
  const [name, a, b] = id.split(".");
  const S = r[side];
  const phases = (s) => s.split("+").map(pi);
  const sumIdx = (arr, idx) => idx.reduce((n, i) => n + arr[i], 0);
  if (name === "contestShare" || name === "captureShare") {
    const idx = phases(b), apps = sumIdx(S.objApps[a], idx);
    if (!apps) return null;
    return sumIdx(name === "contestShare" ? S.objContested[a] : S.objCaptured[a], idx) / apps;
  }
  if (name === "siegeWindowsPerMin") return per(S.siegeOpens[pi(a)], r.phaseSecs[pi(a)]);
  if (name === "joinGoStartsPerMin") return per(S.joinGoStarts[pi(a)], r.phaseSecs[pi(a)]);
  if (name === "joinGoGeneralStartsPerMin") return per(S.joinGoGeneralStarts[pi(a)], r.phaseSecs[pi(a)]);
  if (name === "laneGeneralEntriesPerMin") return per(S.laneGeneralEntries[pi(a)], r.phaseSecs[pi(a)]);
  if (name === "engageStartsPerMin") return per(S.engageStarts[pi(a)], r.phaseSecs[pi(a)]);
  if (name === "engageDecisionsPerMin") return per(S.engages[pi(a)], r.phaseSecs[pi(a)]);
  if (name === "gankShare") {           // gankShare.<ownLane>.<phase>：該時期抓人裡去這一路（己方路名）的比例；沒有抓人 ⇒ null
    const i = pi(b), tot = ["top", "mid", "bot"].reduce((n, l) => n + S.ganksOwn[l][i], 0);
    return tot ? S.ganksOwn[a][i] / tot : null;
  }
  if (name === "ganksPerMin") { const i = pi(a); return per(["top", "mid", "bot"].reduce((n, l) => n + S.ganksOwn[l][i], 0), r.phaseSecs[i]); }
  //  C5R：ganksOwnPerMin.<ownLane>.<phase>＝該時期去這一路（己方路名）的實際抓人次數 ÷ 分；沒有抓人的場次＝0（只要該時期有經過，同 ganksPerMin）。
  if (name === "ganksOwnPerMin") { const i = pi(b); return per(S.ganksOwn[a][i], r.phaseSecs[i]); }
  //  v2（Phase 3a-C6）：seatFightEntriesPerMin.<seat>.<p 或 p+p>＝該席位進入團戰的次數 ÷ 這些時期合計的分鐘數（合計不足 60 秒 ⇒ null）。
  if (name === "seatFightEntriesPerMin") { const idx = phases(b); return per(sumIdx(S.seatFightsPh[a], idx), sumIdx(r.phaseSecs, idx)); }
  //  goldLeadAt.<early|mid>：該時期結束時己方隊伍金錢 − 對方（比賽在該時期內結束 ⇒ null）。只報告，不判定。
  if (name === "goldLeadAt") { const g = r.goldAtPhaseEnd?.[pi(a)]; return g ? g[side] - g[side === "blue" ? "red" : "blue"] : null; }
  //  win：該側獲勝＝1、落敗＝0；時間上限內未分勝負 ⇒ null。durationMin：比賽分鐘數（兩側同值）。只報告，不判定。
  if (name === "win") return r.over && SIDES.includes(r.winner) ? (r.winner === side ? 1 : 0) : null;
  if (name === "durationMin") return r.duration / 60;
  throw new Error(`unknown study metric ${id}`);
}
