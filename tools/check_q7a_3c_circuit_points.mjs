#!/usr/bin/env node
// ============================================================================
//  tools/check_q7a_3c_circuit_points.mjs — Q7a-3c：巡迴積分與晉級資格
//
//  執行：repo 根目錄 `node tools/check_q7a_3c_circuit_points.mjs`；失敗 exit 1。
//
//  ── 這一支在證明什麼 ────────────────────────────────────────────────────
//  積分是**會累積、會決定晉級、而且不可變**的東西。算錯一次不會當場爆掉，
//  只會讓錯的隊伍進年度總決賽——所以每一條規則都要有對照組：
//    ・給分正確 ⇒ 而且**改了 final／政策／層級才會變，改名字不會變**
//    ・沒有政策 ⇒ **擋住**，不是默默給 0（0 分紀錄與「沒有政策」必須分得開）
//    ・重複結算／重載 ⇒ 帳本逐字不變
//    ・同分 ⇒ 決定性排序（打亂輸入順序結果相同）
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
import { readFileSync } from "node:fs";

const S = await import("../src/platform/competition/seasonState.js");
const P = await import("../src/platform/competition/circuitPoints.js");
const { createCircuit, createEvent, competitionIdForEvent } = await import("../src/platform/contracts/circuit.js");
const { createCompetition, createStage, createFixture, STAGE_FORMATS } = await import("../src/platform/contracts/competition.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const store = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const readCode = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const J = (x) => JSON.stringify(x);

// ── 測試素材 ────────────────────────────────────────────────────────────────

/**
 * 在既有賽季上加一個 Event：4 隊單循環（6 場），可指定強弱順序。
 * `order[0]` 全勝、`order[1]` 勝兩場……⇒ 封存後名次必然是 order 的順序。
 */
function addEvent(state, { circuit, eventKey, tier, order, days = 1 }) {
  const event = createEvent({ circuit, eventKey, tier, name: `${circuit.name} ${eventKey}` }).event;
  const c0 = createCompetition({ gameMode: "moba", season: state.season, organizerId: eventKey, tier }).competition;
  const comp = { ...c0, id: competitionIdForEvent(event, tier), eventId: event.id, circuitId: circuit.id, idScheme: "event-v2" };
  const stage = createStage({
    competition: comp, format: STAGE_FORMATS.round_robin, participants: order,
    dayRange: { from: days, to: days + 6 }, key: eventKey, legs: 1,
  }).stage;

  const fixtures = [];
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      fixtures.push(createFixture({ stage, round: 1, day: days + i, sideA: order[i].id, sideB: order[j].id }).fixture);
    }
  }
  let next = {
    ...state,
    circuits: {
      ...state.circuits,
      [circuit.id]: { ...circuit, eventIds: [...(state.circuits?.[circuit.id]?.eventIds ?? []), event.id] },
    },
    events: {
      ...state.events,
      [event.id]: { ...event, competitionIds: [comp.id], rankingCompetitionId: comp.id, prizePolicy: null, final: null },
    },
    competitions: {
      ...state.competitions,
      [comp.id]: { competition: { ...comp, stageIds: [stage.id] }, stage, playoff: null, expectsPlayoff: false },
    },
    fixtures: [...state.fixtures, ...fixtures],
  };
  //  排名靠前的一律贏：名次 ＝ order 的順序（win3 之下不會有同分）
  for (const f of fixtures) {
    next = S.applyLaunch(next, f.id).state;
    next = S.applyCompleted(next, {
      fixtureId: f.id, winner: f.sideA, score: { a: 2, b: 0 }, duration: 1800, seed: 7,
    }).state;
  }
  return { state: next, eventId: event.id, competitionId: comp.id };
}

/** 造一個「一條巡迴賽、兩站、名次相反」的賽季。 */
function buildCircuitSeason({ policy = P.DEFAULT_POINTS_POLICY, tiers = ["regular", "major"] } = {}) {
  const base = S.createSeasonState({
    playerTeam: { id: "team:aaaaaaaa", name: "白貓戰隊", tag: "GSEAL" }, season: 1, seasonSeed: 4242,
  }).state;
  const teams = S.activeStageOf(base).participants.slice(0, 4);
  const circuit = createCircuit({
    gameMode: "moba", season: 1, circuitKey: "asia", name: "亞洲巡迴", pointsPolicy: policy,
  }).circuit;

  let s = { ...base, circuits: { ...base.circuits, [circuit.id]: circuit } };
  const a = addEvent(s, { circuit, eventKey: "spring", tier: tiers[0], order: teams, days: 1 });
  s = a.state;
  const b = addEvent(s, { circuit, eventKey: "summer", tier: tiers[1], order: [...teams].reverse(), days: 20 });
  s = b.state;

  //  兩站都封存（積分只能從封存後的 final 產生）
  const unsealed = s;
  s = S.applySealEvent(s, a.eventId, 30).state;
  s = S.applySealEvent(s, b.eventId, 40).state;
  //  `unsealed`：兩站都打完但**還沒封存**，留給 §11 驗 Store 的自動編排
  return { state: s, unsealed, circuitId: circuit.id, spring: a.eventId, summer: b.eventId, teams };
}

console.log("══ Q7a-3c：巡迴積分與晉級資格 ══\n");

// ── §1 政策表（純函式）──────────────────────────────────────────────────
{
  console.log("── §1 積分政策 ──");
  const pol = P.DEFAULT_POINTS_POLICY;
  const table = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => P.pointsForRank(pol, r));
  ck("1a) 保守表逐格正確（1/2/3/4/5–8/其餘）",
    J(table) === J([100, 70, 50, 35, 15, 15, 15, 15, 0]), J(table));
  //  ⚠ 把**政策物件本身**整段挖掉，剩下的才是「規則程式碼」。
  //    第一版寫成 `.split("DEFAULT_POINTS_POLICY")[2] ?? ""`——那個索引根本不存在，
  //    等於在空字串上跑正則，**永遠綠**。假綠比沒有這條還糟。
  const rules = (() => {
    const code = readCode("src/platform/competition/circuitPoints.js");
    const [head, rest] = code.split("export const DEFAULT_POINTS_POLICY");
    const tail = (rest ?? "").split("});").slice(1).join("});");
    return head + tail;
  })();
  ck("1b) 所有數字集中在政策物件裡（規則程式碼不寫死分數）",
    rules.length > 2000 && !/\b(100|70|50|35|15)\b/.test(rules), `掃了 ${rules.length} 字元`);
  const mul = (tier) => P.multiplierFor(pol, { tier });
  ck("1c) 層級倍率 regular/major/championship = 1.0 / 1.5 / 2.0",
    mul("regular") === 1.0 && mul("major") === 1.5 && mul("championship") === 2.0);
  ck("1d) **沒定義的層級不是 1.0，是擋下來**（回 null）",
    mul("cup") === null && mul(undefined) === null, J(mul("cup")));
  ck("1e) Event 可自帶 tierMultiplier 覆寫", P.multiplierFor(pol, { tier: "regular", tierMultiplier: 3 }) === 3);
}

// ── §2 依 final 給分（驗收項 1、10）─────────────────────────────────────
let fx = null;
{
  console.log("\n── §2 封存後依最終名次給分 ──");
  fx = buildCircuitSeason();
  const springFinal = S.eventFinalOf(fx.state, fx.spring);
  ck("2a) 兩站都已封存、名次順序相反（不是同一份 final）",
    !!springFinal && J(springFinal.rows.map((r) => r.teamId)) !==
      J(S.eventFinalOf(fx.state, fx.summer).rows.map((r) => r.teamId)));

  const before = P.pointsLogOf(fx.state).length;
  const r1 = P.applySettleEventPoints(fx.state, fx.spring, S.eventFinalOf);
  ck("2b) 結算成功", r1.ok && !r1.alreadySettled, `${r1.entries.length} 筆`);
  ck("2c) **每一筆分數 ＝ 政策(名次) × 層級倍率**（逐列比對 final）",
    r1.entries.every((e) => {
      const row = springFinal.rows.find((x) => x.teamId === e.teamId);
      return e.rank === row.rank && e.points === Math.round(P.pointsForRank(P.DEFAULT_POINTS_POLICY, row.rank) * 1.0);
    }), J(r1.entries.map((e) => `${e.rank}:${e.points}`)));
  ck("2d) **每一筆都帶 finalId**（來源是封存名次，可回溯）",
    r1.entries.every((e) => e.finalId && e.finalId === springFinal.id), springFinal.id);
  ck("2e) 帳本只 append（原 state 不被就地改動）",
    P.pointsLogOf(fx.state).length === before && P.pointsLogOf(r1.state).length === before + 4);

  const r2 = P.applySettleEventPoints(r1.state, fx.summer, S.eventFinalOf);
  ck("2f) major 站套 1.5 倍（含 35 × 1.5 = 52.5 → 53 的四捨五入）",
    J(r2.entries.map((e) => e.points)) === J([150, 105, 75, 53]), J(r2.entries.map((e) => e.points)));

  fx.settled = r2.state;
}

// ── §3 fail-closed（驗收項 2）───────────────────────────────────────────
{
  console.log("\n── §3 沒有政策 ⇒ 擋住，不是 0 分 ──");
  const noPolicy = buildCircuitSeason({ policy: null });
  const st = P.pointsStatusOfEvent(noPolicy.state, noPolicy.spring, S.eventFinalOf);
  ck("3a) 已封存但沒有政策 ⇒ **policy_required**",
    st.status === P.POINTS_STATUS.policy_required, st.reason);
  const r = P.applySettleEventPoints(noPolicy.state, noPolicy.spring, S.eventFinalOf);
  ck("3b) **結算被拒絕**", !r.ok && r.errors[0].code === "policy_required", r.errors[0]?.message);
  ck("3c) **沒有產生任何假 0 分紀錄**", P.pointsLogOf(r.state).length === 0);
  ck("3d) **沒有產生假收據**（Event 上沒有 pointsSettlementRef）",
    !r.state.events[noPolicy.spring].pointsSettlementRef);

  const all = P.settleAllPendingPoints(noPolicy.state, S.eventFinalOf);
  ck("3e) 批次結算也一樣擋住（不會繞過）", P.pointsLogOf(all.state).length === 0 && all.settled.length === 0);

  //  未封存 ⇒ not_started（與 policy_required 分得開）
  const unsealed = { ...fx.state, events: { ...fx.state.events, [fx.spring]: { ...fx.state.events[fx.spring], final: null } } };
  ck("3f) 還沒封存 ⇒ **not_started**（三態分得開）",
    P.pointsStatusOfEvent(unsealed, fx.spring, () => null).status === P.POINTS_STATUS.not_started);
  ck("3g) 層級沒有倍率 ⇒ 也是 policy_required（不默認 1.0）",
    P.pointsStatusOfEvent(
      { ...fx.state, events: { ...fx.state.events, [fx.spring]: { ...fx.state.events[fx.spring], tier: "cup" } } },
      fx.spring, S.eventFinalOf).status === P.POINTS_STATUS.policy_required);
  ck("3h) 已結算 ⇒ settled", P.pointsStatusOfEvent(fx.settled, fx.spring, S.eventFinalOf).status === P.POINTS_STATUS.settled);
}

// ── §4 重複結算（驗收項 3）──────────────────────────────────────────────
{
  console.log("\n── §4 重複結算不重複給分 ──");
  const s0 = fx.settled;
  const snap = J(P.pointsLogOf(s0));
  const again = P.applySettleEventPoints(s0, fx.spring, S.eventFinalOf);
  ck("4a) 第二次結算回報 alreadySettled", again.ok && again.alreadySettled);
  ck("4b) **帳本逐字不變**", J(P.pointsLogOf(again.state)) === snap && again.state === s0);

  let s = s0;
  for (let i = 0; i < 5; i++) s = P.settleAllPendingPoints(s, S.eventFinalOf).state;
  ck("4c) 批次結算跑 5 次，帳本仍逐字不變", J(P.pointsLogOf(s)) === snap, `${P.pointsLogOf(s).length} 筆`);

  //  重複封存也不得再給一次
  const resealed = S.applySealEvent(s, fx.spring, 99);
  ck("4d) 重複封存不改 final ⇒ 積分也不會再算一次",
    resealed.alreadySealed && J(P.pointsLogOf(P.settleAllPendingPoints(resealed.state, S.eventFinalOf).state)) === snap);
}

// ── §5 跨站累積與帳本推導（驗收項 4、5）─────────────────────────────────
{
  console.log("\n── §5 跨站累積 ＝ 帳本加總 ──");
  const s = fx.settled;
  const table = P.circuitStandings(s, fx.circuitId);
  ck("5a) 兩站都進了同一條巡迴賽的帳本",
    P.pointsEntriesOfCircuit(s, fx.circuitId).length === 8 && table.rows.length === 4);

  //  ⚠ 驗證器**自己**從原始帳本加總一次，不呼叫被測的彙總函式
  const mine = new Map();
  for (const e of P.pointsLogOf(s)) {
    if (e.circuitId !== fx.circuitId) continue;
    mine.set(e.teamId, (mine.get(e.teamId) ?? 0) + e.points);
  }
  ck("5b) **每一列的 points ＝ 帳本裡該隊所有紀錄之和**（獨立重算）",
    table.rows.every((r) => r.points === mine.get(r.teamId)),
    J(table.rows.map((r) => `${r.rank}. ${r.teamId.slice(5, 9)} ${r.points}`)));
  ck("5c) `circuitPointsOf` 與榜上的分數一致",
    table.rows.every((r) => P.circuitPointsOf(s, fx.circuitId, r.teamId) === r.points));
  ck("5d) 名次由累積分數決定（第一站冠軍不必然是巡迴第一）",
    table.rows[0].teamId !== S.eventFinalOf(s, fx.spring).rows[0].teamId,
    `巡迴第一 ${table.rows[0].teamId.slice(5, 9)} / 春季站冠軍 ${S.eventFinalOf(s, fx.spring).rows[0].teamId.slice(5, 9)}`);
  ck("5e) 每支隊伍的參賽站數正確", table.rows.every((r) => r.events === 2));

  //  Event 只留收據，不複製分數
  const ref = s.events[fx.spring].pointsSettlementRef;
  ck("5f) Event 只留 pointsSettlementRef", !!ref && ref.finalId === S.eventFinalOf(s, fx.spring).id);
  ck("5g) **收據裡沒有任何分數**（不複製積分真相）",
    !("points" in ref) && !("totalPoints" in ref) && !JSON.stringify(ref).includes("\"points\""), J(ref));
}

// ── §6 重載／遷移不漂移（驗收項 6）──────────────────────────────────────
{
  console.log("\n── §6 重載與 legacy 遷移 ──");
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  useProfileStore.setState({ competition: fx.settled });
  store().save();
  const before = J(P.pointsLogOf(store().competition));
  const standingsBefore = J(P.circuitStandings(store().competition, fx.circuitId));

  const fresh = (await import("../src/platform/profileStore.js?q7a3c=1")).useProfileStore;
  ck("6a) **重載後帳本逐字不變**", J(P.pointsLogOf(fresh.getState().competition)) === before,
    `${P.pointsLogOf(fresh.getState().competition).length} 筆`);
  ck("6b) **重載後巡迴榜逐字不變**", J(P.circuitStandings(fresh.getState().competition, fx.circuitId)) === standingsBefore);

  //  legacy v1 形狀升級不得吃掉帳本
  const v1 = { ...fx.settled, schema: "SeasonState.v1", competition: S.activeCompetitionOf(fx.settled), stage: S.activeStageOf(fx.settled), playoff: null };
  delete v1.competitions; delete v1.events; delete v1.circuits; delete v1.activeEventId;
  const upped = S.upgradeSeasonShape(v1);
  ck("6c) **v1 → v2 升級保留 pointsLog**", J(P.pointsLogOf(upped)) === before);

  //  真正的 legacy 存檔（沒有 pointsLog）也不得炸
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  ck("6d) legacy 存檔沒有帳本時一切照舊（空陣列，不是 undefined 爆炸）",
    P.pointsLogOf(store().competition).length === 0 &&
    P.circuitStandings(store().competition, "circuit:不存在").rows.length === 0);
  ck("6e) legacy 的巡迴賽沒有政策 ⇒ 舊存檔行為完全不變",
    Object.values(store().competition.circuits)[0].pointsPolicy == null);
}

// ── §7 同分 tie-break（驗收項 7）────────────────────────────────────────
{
  console.log("\n── §7 同分決定性 ──");
  //  ⚠ 直接餵合成帳本：同分要造得精準，走完整賽程反而控制不了。
  const mk = (teamId, eventId, rank, points, day) => ({
    schema: "CircuitPointsEntry.v1", id: `cpt:${eventId}:${teamId}`,
    circuitId: "circuit:t", eventId, teamId, teamName: teamId, rank, points, sealedAtDay: day,
  });
  const state = (log) => ({ circuits: { "circuit:t": {} }, events: {}, pointsLog: log });
  const order = (log) => P.circuitStandings(state(log), "circuit:t").rows.map((r) => r.teamId);

  //  ① 冠軍數
  const l1 = [mk("team:b", "e1", 1, 100, 1), mk("team:b", "e2", 9, 0, 2),
              mk("team:a", "e1", 2, 70, 1), mk("team:a", "e2", 4, 30, 2)];
  ck("7a) 同分 ⇒ 先比**冠軍數**", J(order(l1)) === J(["team:b", "team:a"]), J(order(l1)));

  //  ② 前三名次數（冠軍數相同）
  const l2 = [mk("team:a", "e1", 2, 50, 1), mk("team:a", "e2", 5, 50, 2),
              mk("team:b", "e1", 3, 50, 1), mk("team:b", "e2", 3, 50, 2)];
  ck("7b) 冠軍數相同 ⇒ 比**前三名次數**", J(order(l2)) === J(["team:b", "team:a"]), J(order(l2)));

  //  ③ 最近一站名次（前兩項都相同）
  const l3 = [mk("team:a", "e1", 5, 50, 1), mk("team:a", "e2", 6, 50, 2),
              mk("team:b", "e1", 6, 50, 1), mk("team:b", "e2", 5, 50, 2)];
  ck("7c) 再相同 ⇒ 比**最近一站名次**", J(order(l3)) === J(["team:b", "team:a"]), J(order(l3)));

  //  ④ team.id（全部相同）
  const l4 = [mk("team:b", "e1", 5, 50, 1), mk("team:a", "e1", 5, 50, 1)];
  ck("7d) 全部相同 ⇒ 依 **team.id** 決定性排序", J(order(l4)) === J(["team:a", "team:b"]), J(order(l4)));

  //  決定性：打亂輸入順序，結果必須一樣
  const shuffled = [...l3].reverse();
  ck("7e) **打亂帳本順序，排名逐字相同**（排序是全序、不依輸入）",
    J(order(shuffled)) === J(order(l3)));
  ck("7f) 同一份帳本重算 3 次結果相同",
    new Set([0, 1, 2].map(() => J(P.circuitStandings(state(l3), "circuit:t")))).size === 1);
}

// ── §8 Top 4 晉級資格（驗收項 8）────────────────────────────────────────
{
  console.log("\n── §8 年度總決賽晉級資格 ──");
  const s = fx.settled;
  const g = P.applyGrantCircuitQualification(s, fx.circuitId, 50, S.eventFinalOf);
  ck("8a) 每一站都結算完 ⇒ 發得出資格", g.ok && !g.alreadyGranted, g.errors?.[0]?.message);
  const q = g.qualification;
  ck("8b) **Top 4、種子與巡迴榜一致**",
    q.qualified.length === 4 &&
    J(q.qualified.map((x) => x.teamId)) === J(P.circuitStandings(s, fx.circuitId).rows.slice(0, 4).map((r) => r.teamId)),
    J(q.qualified.map((x) => `${x.seed}.${x.points}`)));
  ck("8c) **是正式資料，不是畫面標籤**（存進 state.qualifications、帶得走）",
    !!g.state.qualifications[q.id] && q.schema === "CircuitQualification.v1" && !!q.circuitId);
  ck("8d) 帶得出來源（哪幾站算的）", J([...q.sourceEventIds].sort()) === J([fx.spring, fx.summer].sort()));
  ck("8e) `isQualified` 查得到／查不到", P.isQualified(g.state, q.qualified[0].teamId, fx.circuitId));

  const g2 = P.applyGrantCircuitQualification(g.state, fx.circuitId, 77, S.eventFinalOf);
  ck("8f) **重複核發不重算、不覆寫**", g2.alreadyGranted && J(g2.qualification) === J(q) && g2.state === g.state);

  //  少一站沒結算 ⇒ 一律擋住（暫時的積分榜不得拿來發資格）
  const partial = P.applySettleEventPoints(
    { ...fx.state, pointsLog: [] }, fx.spring, S.eventFinalOf).state;
  const blocked = P.canGrantCircuitQualification(partial, fx.circuitId, S.eventFinalOf);
  ck("8g) **有任何一站沒結算 ⇒ 不發**（fail-closed）", !blocked.ok && !blocked.granted, blocked.reason);

  //  隊伍不足
  //  ⚠ 只留各站冠軍。兩站名次相反，所以留 rank ≤ 2 反而會湊出 4 支不同隊伍
  //    ——第一版就是這樣寫的，測試自己錯了（程式碼是對的）。
  const few = { ...s, pointsLog: P.pointsLogOf(s).filter((e) => e.rank === 1) };
  ck("8h) 隊伍不足 4 支 ⇒ 不發", !P.canGrantCircuitQualification(few, fx.circuitId, S.eventFinalOf).ok);
}

// ── §9 只有真的改了才會變（驗收項 9、10）────────────────────────────────
{
  console.log("\n── §9 檢定力：什麼會改變積分、什麼不會 ──");
  const settle = (st) => J(P.applySettleEventPoints(st, fx.spring, S.eventFinalOf).entries.map((e) => [e.teamId, e.points]));
  const baseline = settle(fx.state);

  const renamed = {
    ...fx.state,
    events: { ...fx.state.events, [fx.spring]: { ...fx.state.events[fx.spring], name: "改個名字而已" } },
    circuits: { ...fx.state.circuits, [fx.circuitId]: { ...fx.state.circuits[fx.circuitId], name: "巡迴賽改名" } },
  };
  ck("9a) **改 Event／Circuit 名稱 ⇒ 積分逐字不變**", settle(renamed) === baseline);

  const retiered = { ...fx.state, events: { ...fx.state.events, [fx.spring]: { ...fx.state.events[fx.spring], tier: "championship" } } };
  ck("9b) **改層級 ⇒ 積分改變**（×2.0）", settle(retiered) !== baseline, settle(retiered));

  const repolicied = {
    ...fx.state,
    circuits: { ...fx.state.circuits, [fx.circuitId]: {
      ...fx.state.circuits[fx.circuitId],
      pointsPolicy: { ...P.DEFAULT_POINTS_POLICY, key: "flat", bands: [{ from: 1, to: 99, points: 1 }] } } },
  };
  ck("9c) **改政策 ⇒ 積分改變**", settle(repolicied) !== baseline, settle(repolicied));

  const f = S.eventFinalOf(fx.state, fx.spring);
  const flipped = {
    ...fx.state,
    events: { ...fx.state.events, [fx.spring]: { ...fx.state.events[fx.spring],
      final: { ...f, rows: f.rows.map((r, i) => ({ ...r, rank: f.rows.length - i })) } } },
  };
  ck("9d) **改 final 名次 ⇒ 積分改變**", settle(flipped) !== baseline, settle(flipped));
}

// ── §10 紅線（原始碼掃描）───────────────────────────────────────────────
{
  console.log("\n── §10 紅線 ──");
  const cp = readCode("src/platform/competition/circuitPoints.js");
  const ss = readCode("src/platform/competition/seasonState.js");

  ck("10a) 積分層是純函式（不 import React／zustand／localStorage／亂數／時鐘）",
    !/from\s+["'](react|zustand)|localStorage|Math\.random|Date\.now/.test(cp));
  ck("10b) **積分不碰錢**", !/funds|transactions|COMPETITION_PRIZE|settleCompetitionAward|amount/.test(cp));
  ck("10c) **積分不從 FixtureOutcome 重算**（只吃封存後的 final）",
    !/outcomes|outcomeFor|FixtureOutcome|computeStandings/.test(cp) && /finalId/.test(cp));
  ck("10d) Q5 §7d 仍然成立：**賽季層沒有積分玩法**", !/circuitPoints/i.test(ss));
  ck("10e) 沒有做時段／老化／轉會／Shop／MMR／CS 巡迴",
    !/timeSlot|agePlayer|retire|transfer|shop|\bmmr\b|entitlement/i.test(cp));
  ck("10f) 沒有把積分寫進 FinalStandings",
    !/createFinalStandings|final\.(points|circuitPoints)/.test(cp) &&
    !/pointsLog|circuitPoints/.test(readCode("src/platform/contracts/finalStandings.js")));
  ck("10g) 沒有做 Season Award／複雜邀請制",
    !/seasonAward|lastChance|invitational|region/i.test(cp));
}

// ── §11 Store 端到端：封存時真的會結算 ──────────────────────────────────
{
  console.log("\n── §11 Store 端到端（production 的編排）──");
  //  ⚠ 上面全部是純函式。**production 會不會真的呼叫它們**是另一回事——
  //    少接一條線，上面 60 條照樣全綠而遊戲裡一分都不會給。這一節補的就是那一段。
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  //  兩站都打完但**還沒封存**
  const pre = fx.unsealed;
  useProfileStore.setState({ competition: pre });
  const fundsBefore = store().finance.funds;
  ck("11a) 起點：兩站都打完、都還沒封存、帳本是空的",
    !S.eventFinalOf(pre, fx.spring) && !S.eventFinalOf(pre, fx.summer) &&
    P.pointsLogOf(pre).length === 0);

  store()._sealSeasonIfFinished();
  const after = store().competition;
  ck("11b) **封存時自動結算積分**（不必另外呼叫）",
    P.pointsLogOf(after).length === 8, `${P.pointsLogOf(after).length} 筆`);
  ck("11c) **每一站都結算完 ⇒ 自動核發晉級資格**",
    P.qualificationsOf(after).length === 1 &&
    P.qualificationsOf(after)[0].qualified.length === 4,
    J(P.qualificationsOf(after)[0]?.qualified?.map((x) => `${x.seed}.${x.points}`)));
  ck("11d) 玩家收得到晉級通知",
    (store().inbox ?? []).some((m) => /晉級|巡迴積分/.test(m.subject ?? "")));

  const snap = J({ log: P.pointsLogOf(after), qual: P.qualificationsOf(after) });
  for (let i = 0; i < 3; i++) store()._sealSeasonIfFinished();
  ck("11e) **再跑 3 次，帳本與資格逐字不變**",
    J({ log: P.pointsLogOf(store().competition), qual: P.qualificationsOf(store().competition) }) === snap);

  //  存檔 → 重載 → 再跑一次：不得重複給分
  store().save();
  const fresh2 = (await import("../src/platform/profileStore.js?q7a3c=2")).useProfileStore;
  fresh2.getState()._sealSeasonIfFinished();
  ck("11f) **重載後再結算一次，仍然逐字不變**（跨重開不重複給分）",
    J({ log: P.pointsLogOf(fresh2.getState().competition), qual: P.qualificationsOf(fresh2.getState().competition) }) === snap);

  //  畫面拿得到（唯讀推導，不是第二份真相）
  const view = store().competitionView();
  ck("11g) `competitionView()` 給得出積分狀態與巡迴榜",
    view.circuitPoints.logSize === 8 &&
    view.circuitPoints.eventStatus[fx.spring].status === P.POINTS_STATUS.settled &&
    view.circuitPoints.standings[fx.circuitId].rows.length === 4 &&
    view.circuitPoints.qualifications.length === 1);
  ck("11h) legacy 那個沒有政策的賽事，畫面上看得到**為什麼**不給分",
    Object.values(view.circuitPoints.eventStatus).some((s) =>
      s.status === P.POINTS_STATUS.not_started || s.status === P.POINTS_STATUS.policy_required));
  //  ⚠ 這兩站的 prizePolicy 都是 null ⇒ 整段封存不該有任何金流。
  //    第一版把「現在的資金」跟「現在的資金」相比，是句廢話——重寫成跟 §11 起點比。
  ck("11i) **積分沒有動到錢**（封存前後資金逐元相同）",
    store().finance.funds === fundsBefore, `$${fundsBefore} → $${store().finance.funds}`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
