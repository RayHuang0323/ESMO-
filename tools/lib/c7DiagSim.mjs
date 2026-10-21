// ============================================================================
//  tools/lib/c7DiagSim.mjs — Phase 3a-C：C7 §4-A／§4-B／§4-D 診斷的單場儀器（只讀；不改引擎、不改係數）
//
//  依據：review/tactic-book-3a/C7_未通過選項根因分類.md §4（指標與判讀在那裡事前寫死；本檔只實作）。
//  走 balance runner 的同一條組裝路徑；規則集由呼叫端指定（預設 balanceTool.v21）。
//  ⚠ 技能層：呼叫端必須在第一次呼叫前設 ESMO_BALANCE_SKILLS=on、清掉 ESMO_BALANCE_TALENTS（G-A7 慣例）；紀錄的 layers 記下實際載入的層。
//
//  ── §4-A 站位（60–480 秒，該英雄存活；對每一側的上路與中路英雄，role＝top／mid）─────────────────────
//   laneFwd       state＝對線 的 tick 上，英雄與己方主堡的距離（＝tacticTruthSim 的 laneForward，複現用）
//   relWave       state＝對線 的 tick 上，英雄與主堡距離 − 己方兵線前緣與主堡距離（前緣＝該路我方存活小兵中最靠敵方的那一個，
//                 位置用 gameData.posOnLane；沒有我方小兵的 tick 不計）。正＝站在兵線前面。
//   laneTicks／aliveTicks  對線狀態占存活時間的比例
//   retreats／recalls      p.retreating 由 false 變 true 的次數；state 變成「回城」或「回城中」的次數
//   enemyGanks    敵方 exec.<該英雄所在世界路>Ganks 在 60–480 秒內的增量（敵方打野去這條世界路抓人的次數）
//  ── §4-B 參團擲骰（整場；上／中／下路英雄，role＝top／mid／adc）──────────────────────────────────────
//   以**實例層包裝** e._joinV3 觀察「哪一個熱點、有沒有重擲、結果」：呼叫原方法、原樣回傳，不改引數、不碰亂數
//   （check_c7_diag_3c 驗證包裝前後的對局逐欄相同）。熱點分類與引擎相同，以參照比對 e._pitOf（交戰狀態機下一律是一般熱點）。
//   rolls[type]／rollGo[type]   p.joinEvalT 在這次呼叫中改變 ⇒ 重擲一次；擲完 p.joinGo＝true ⇒ 成功
//   goStarts[type]              擲完 joinGo 由 false 變 true（C7 §4-B 的定義；判讀用這個）
//   entries／laneEntries        state 變成「團戰!」那一刻 p.objGo 為 true ⇒ 物件窗；否則一般（laneEntries 只算上／中／下路英雄，判讀用）
//  ── §4-D 巴龍（整場）────────────────────────────────────────────────────────────────────────────
//   baronEntries   進入團戰那一刻離巴龍坑 ≤ 20（＝tacticTruthSim 的 objFights.baron，複現用）
//   entryBaronDists  每一次進入團戰時與巴龍坑的距離（C7 §4-D：不另加篩選；取中位數）
//   baronPitSecs   state＝團戰! 且離巴龍坑 ≤ 20 的秒數
//  ── 給 C4 的觀測（不屬於 C7 判讀）──────────────────────────────────────────────────────────────
//   captures.<dragon|baron>  objectiveLog 新增、side＝該側（真的取得物件）；exec.<dragon|baron>Contests 照引擎原值
// ============================================================================
import { tacticInputOf } from "./tacticTruthSim.mjs";

export const C7_DIAG_SIM_VERSION = "c7DiagSim.v1";
export const DEFAULT_RULESET = "balanceTool.v21";
const DT = 0.5, CAP_S = 3600, LANE_WINDOW = [60, 480], R20 = 20;
const SIDES = ["blue", "red"];
const LANE_ROLES = ["top", "mid", "adc"];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** 任何維度的單一選擇：std 模板＋該選擇，經 Resolver 的 mergeTacticConfig（被量測排除的選擇 createTacticPlan 會拒絕）。choice＝null ⇒ 對照組。 */
export async function diagArm(dim, choice) {
  const { TACTIC_TEMPLATES } = await import("../../src/platform/tactics/tacticTemplates.js");
  const { mergeTacticConfig } = await import("../../src/platform/tactics/tacticChoiceMapping.js");
  const choices = {};
  if (choice !== null) {
    let o = choices; const ks = dim.split(".");
    ks.forEach((k, i) => { if (i === ks.length - 1) o[k] = choice; else o = o[k] ??= {}; });
  }
  return { legacyConfig: mergeTacticConfig(TACTIC_TEMPLATES.std, [], choices) };
}

/**
 * @param {number} seed
 * @param {{blue:object, red:object, ruleset?:string, wrapJoin?:boolean, neutralGankSide?:"blue"|null}} spec
 *   neutralGankSide：診斷臂（C7 §4-A 第 4 臂）——configure 之後把該側交給引擎的 knobs 的 gankWeights 換成 {1,1,1}（同一個物件、只換屬性）。
 */
export async function runDiagMatch(seed, spec) {
  const { modules, configure } = await import("../balance/moba_items_balance_runner.mjs");
  const { posOnLane } = await import("../../src/gameData.js");
  const M = await modules();
  const tactic = { blue: tacticInputOf(spec.blue ?? null), red: tacticInputOf(spec.red ?? null) };
  const ruleset = spec.ruleset ?? DEFAULT_RULESET;
  const { e } = configure(seed, "standard", M, 1, null, tactic, ruleset);
  if (spec.neutralGankSide) {
    //  三個時期必須是同一個物件（沒有任何每時期維度 ⇒ R-4），否則只換掉前期那一份。
    const at = (t) => { const s = e.t; e.t = t; const k = e.director.knobs(spec.neutralGankSide); e.t = s; return k; };
    const K = at(0);
    if (at(600) !== K || at(1200) !== K) throw new Error("diag: phase knobs are not one shared object");
    if (Object.isFrozen(K)) throw new Error("diag: knobs frozen, cannot neutralise gankWeights");
    K.gankWeights = { top: 1, mid: 1, bot: 1 };
  }
  const players = e.players;
  const nexus = { blue: e.towers.blue_nexus.pos, red: e.towers.red_nexus.pos };
  const zeroLane = () => ({ laneFwdSum: 0, laneFwdN: 0, relSum: 0, relN: 0, laneTicks: 0, aliveTicks: 0, retreats: 0, recalls: 0, enemyGanks: 0 });
  const zero = () => ({ lane: { top: zeroLane(), mid: zeroLane() },
    rolls: { dragon: 0, baron: 0, general: 0 }, rollGo: { dragon: 0, baron: 0, general: 0 }, goStarts: { dragon: 0, baron: 0, general: 0 },
    entries: { objective: 0, general: 0 }, laneEntries: { objective: 0, general: 0 },
    baronEntries: 0, entryBaronDists: [], baronPitTicks: 0, captures: { dragon: 0, baron: 0 },
    //  C4 觀測（依物件「出現」那一刻的時期分桶；契約 §3.3 的分桶規則）：每次出現有沒有被這一側爭奪、有沒有被這一側拿到。
    objApps: { dragon: [0, 0, 0], baron: [0, 0, 0] }, objContested: { dragon: [0, 0, 0], baron: [0, 0, 0] }, objCaptured: { dragon: [0, 0, 0], baron: [0, 0, 0] },
    siegePh: [0, 0, 0] });
  const S = { blue: zero(), red: zero() };
  //  §4-B 包裝：觀察、不改變（原方法、原引數、原回傳值）。
  if (spec.wrapJoin !== false) {
    const orig = e._joinV3;
    const pitD = e._pitOf("dragon"), pitB = e._pitOf("baron");
    e._joinV3 = function (p, hot, ...rest) {
      const before = p.joinEvalT, goBefore = !!p.joinGo;
      const r = orig.call(this, p, hot, ...rest);
      if (p.joinEvalT !== before && LANE_ROLES.includes(p.role)) {
        //  與引擎 _joinChance 相同的判法：以**參照**比對坑位（LogicEngine.js:436）。交戰狀態機下 hot 是新物件 ⇒ 一律算一般熱點。
        const type = hot === pitD ? "dragon" : hot === pitB ? "baron" : "general";
        S[p.side].rolls[type]++;
        if (p.joinGo) S[p.side].rollGo[type]++;
        if (p.joinGo && !goBefore) S[p.side].goStarts[type]++;     // C7 §4-B 的定義：joinGo 由 false 變 true（重擲仍為 true 不算）
      }
      return r;
    };
  }
  const prev = new Map(players.map((p) => [p.id, { state: p.state, retreating: !!p.retreating }]));
  const laneHero = (side, role) => players.find((p) => p.side === side && p.role === role);
  const heroes = { blue: { top: laneHero("blue", "top"), mid: laneHero("blue", "mid") }, red: { top: laneHero("red", "top"), mid: laneHero("red", "mid") } };
  const gk = (w) => `${w}Ganks`;
  let logSeq = e._objLogSeq ?? 0;
  //  C4 觀測：物件的一次「出現」＝alive 由 false 變 true；那一次出現期間 exec.<key>Contests 增加 ⇒ 該側爭奪過（引擎每次重生最多加一）；
  //  objectiveLog 出現該物件的擊殺 ⇒ 擊殺方取得。比賽結束時還活著的那一次照算出現、不算取得。
  const life = { dragon: null, baron: null }, wasAlive = { dragon: !!e.dragon?.alive, baron: !!e.baron?.alive };
  const initSeen = { blue: e.fsm3?.blue?.initUntil, red: e.fsm3?.red?.initUntil };
  const closeLife = (key) => {
    const L = life[key]; if (!L) return;
    for (const side of SIDES) { S[side].objApps[key][L.ph]++; if (L.contested[side]) S[side].objContested[key][L.ph]++; if (L.captured === side) S[side].objCaptured[key][L.ph]++; }
    life[key] = null;
  };
  for (let i = 1; i * DT <= CAP_S && !e.over; i++) {
    const execBefore = Object.fromEntries(SIDES.map((s) => [s, { ...e.exec[s] }]));
    e.tick(DT);
    const t = e.t;
    const inWin = t >= LANE_WINDOW[0] && t < LANE_WINDOW[1];
    for (const p of players) {
      const s = S[p.side], q = prev.get(p.id);
      if (p.state === "團戰!" && q.state !== "團戰!") {
        if (p.objGo) s.entries.objective++; else s.entries.general++;
        //  §4-B 的判讀只看上／中／下路英雄（擲骰的對象）；打野／輔助有 jgSupJoinBonus，會稀釋效果。全員數字留給跨儀器比對。
        if (LANE_ROLES.includes(p.role)) { if (p.objGo) s.laneEntries.objective++; else s.laneEntries.general++; }
        //  所有英雄（與 tacticTruthSim 的 objFights 相同的對象）；距離分布照 C7 §4-D：每一次進入團戰（不另加篩選）。
        const dB = dist(p.pos, e._pitOf("baron"));
        if (dB <= R20) s.baronEntries++;
        s.entryBaronDists.push(dB);
      }
      if (p.state === "團戰!" && dist(p.pos, e._pitOf("baron")) <= R20) s.baronPitTicks++;
      for (const role of ["top", "mid"]) {
        if (heroes[p.side][role] !== p || !inWin || p.dead) continue;
        const L = s.lane[role];
        L.aliveTicks++;
        if (p.retreating && !q.retreating) L.retreats++;
        if ((p.state === "回城" || p.state === "回城中") && q.state !== "回城" && q.state !== "回城中") L.recalls++;
        if (p.state === "對線") {
          L.laneTicks++;
          const dN = dist(p.pos, nexus[p.side]);
          L.laneFwdSum += dN; L.laneFwdN++;
          const lane = e.lanes[p.lane], own = lane ? (p.side === "blue" ? lane.bm : lane.rm).filter((m) => m.hp > 0) : [];
          if (own.length) {
            const tf = p.side === "blue" ? Math.max(...own.map((m) => m.t)) : Math.min(...own.map((m) => m.t));
            L.relSum += dN - dist(posOnLane(p.lane, tf), nexus[p.side]); L.relN++;
          }
        }
      }
      q.state = p.state; q.retreating = !!p.retreating;
    }
    if (inWin) for (const side of SIDES) {
      const foe = side === "blue" ? "red" : "blue";
      for (const role of ["top", "mid"]) {
        const h = heroes[side][role];
        if (h) S[side].lane[role].enemyGanks += (e.exec[foe][gk(h.lane)] ?? 0) - (execBefore[foe][gk(h.lane)] ?? 0);
      }
    }
    const ph = e.director.phase(t);
    for (const key of ["dragon", "baron"]) {
      const alive = !!e[key]?.alive;
      if (alive && !wasAlive[key]) life[key] = { ph, contested: { blue: false, red: false }, captured: null };
      if (life[key]) for (const side of SIDES) if ((e.exec[side][`${key}Contests`] ?? 0) > (execBefore[side][`${key}Contests`] ?? 0)) life[key].contested[side] = true;
    }
    if ((e._objLogSeq ?? 0) !== logSeq) {
      for (const ev of e.objectiveLog) if (ev.seq > logSeq && S[ev.side] && (ev.key === "dragon" || ev.key === "baron")) {
        S[ev.side].captures[ev.key]++;
        if (life[ev.key] && life[ev.key].captured === null) life[ev.key].captured = ev.side;
      }
      logSeq = e._objLogSeq;
    }
    for (const key of ["dragon", "baron"]) { const alive = !!e[key]?.alive; if (!alive && wasAlive[key]) closeLife(key); wasAlive[key] = alive; }
    for (const side of SIDES) {
      const F = e.fsm3?.[side];
      if (F && F.initUntil !== initSeen[side]) { initSeen[side] = F.initUntil; if (F.initKind === "siege") S[side].siegePh[ph]++; }
    }
  }
  closeLife("dragon"); closeLife("baron");
  const out = (side) => {
    const s = S[side];
    return { ...s, entryBaronDistMedian: median(s.entryBaronDists), entryN: s.entryBaronDists.length, entryBaronDists: undefined,
      contests: { dragon: e.exec[side].dragonContests, baron: e.exec[side].baronContests } };
  };
  return { tool: C7_DIAG_SIM_VERSION, seed, ruleset, directorMode: e.director?.mode ?? null,
    layers: { heroSkills: !!M.skills, heroPassives: !!M.passives, heroPowerCurve: !!M.curves, battleTalents: !!M.talents },
    duration: e.t, over: e.over ? 1 : 0, winner: e.winner ?? null, kills: e.bK + e.rK, blue: out("blue"), red: out("red") };
}

const perMin = (n, secs) => (secs >= 60 ? n / (secs / 60) : null);
/** 指標 id → 值（null＝不適用）。lane 類用 60–480 秒窗、該英雄存活的 tick（站位樣本 < 20 tick ⇒ null）。 */
export const DIAG_METRICS = Object.freeze({
  "laneForward.top": (r, s) => { const L = r[s].lane.top; return L.laneFwdN >= 20 ? L.laneFwdSum / L.laneFwdN : null; },
  "laneForward.mid": (r, s) => { const L = r[s].lane.mid; return L.laneFwdN >= 20 ? L.laneFwdSum / L.laneFwdN : null; },
  "relWave.top": (r, s) => { const L = r[s].lane.top; return L.relN >= 20 ? L.relSum / L.relN : null; },
  "relWave.mid": (r, s) => { const L = r[s].lane.mid; return L.relN >= 20 ? L.relSum / L.relN : null; },
  "laneShare.top": (r, s) => { const L = r[s].lane.top; return L.aliveTicks >= 20 ? L.laneTicks / L.aliveTicks : null; },
  "laneShare.mid": (r, s) => { const L = r[s].lane.mid; return L.aliveTicks >= 20 ? L.laneTicks / L.aliveTicks : null; },
  "retreatRecall.top": (r, s) => r[s].lane.top.retreats + r[s].lane.top.recalls,
  "retreatRecall.mid": (r, s) => r[s].lane.mid.retreats + r[s].lane.mid.recalls,
  "enemyGanks.top": (r, s) => r[s].lane.top.enemyGanks,
  "enemyGanks.mid": (r, s) => r[s].lane.mid.enemyGanks,
  "joinGoStartsPerMin.general": (r, s) => perMin(r[s].goStarts.general, r.duration),
  "joinRollGoPerMin.general": (r, s) => perMin(r[s].rollGo.general, r.duration),
  "joinRollsPerMin.general": (r, s) => perMin(r[s].rolls.general, r.duration),
  "fightEntriesPerMin.general": (r, s) => perMin(r[s].entries.general, r.duration),
  "laneFightEntriesPerMin.general": (r, s) => perMin(r[s].laneEntries.general, r.duration),
  "fightEntriesPerMin.objective": (r, s) => perMin(r[s].entries.objective, r.duration),
  "objectiveFightEntriesPerMin.baron": (r, s) => perMin(r[s].baronEntries, r.duration),
  "entryBaronDistMedian": (r, s) => r[s].entryBaronDistMedian,
  "baronPitFightSecsPerMin": (r, s) => perMin(r[s].baronPitTicks * DT, r.duration),
  "baronContestsPerMin": (r, s) => perMin(r[s].contests.baron, r.duration),
  "baronCaptures": (r, s) => r[s].captures.baron,
  "dragonContestsPerMin": (r, s) => perMin(r[s].contests.dragon, r.duration),
  "dragonCaptures": (r, s) => r[s].captures.dragon,
  //  C4 觀測（只記錄，不屬於 C7 判讀；給 C4 事前登記的天花板檢查與基準）：每次出現的爭奪比例／取得比例，分母 0 ⇒ null。
  ...Object.fromEntries(["dragon", "baron"].flatMap((k) => ["early", "mid", "late"].flatMap((p, i) => [
    [`contestShare.${k}.${p}`, (r, s) => (r[s].objApps[k][i] ? r[s].objContested[k][i] / r[s].objApps[k][i] : null)],
    [`captureShare.${k}.${p}`, (r, s) => (r[s].objApps[k][i] ? r[s].objCaptured[k][i] / r[s].objApps[k][i] : null)],
    [`appearances.${k}.${p}`, (r, s) => r[s].objApps[k][i]],
  ]))),
  ...Object.fromEntries(["early", "mid", "late"].map((p, i) => [`siegeWindowsPhase.${p}`, (r, s) => r[s].siegePh[i]])),
});
export function diagMetricValue(rec, side, id) {
  const f = DIAG_METRICS[id];
  if (!f) throw new Error(`unknown diag metric ${id}`);
  const v = f(rec, side);
  return Number.isFinite(v) ? v : null;
}
