// ============================================================================
//  tools/owner_preview/lib_s11_legal_features_v24.mjs — 機率版 S11 可行性診斷的「合法特徵」（影子研究；2026-11-19）
//
//  【合法的定義】特徵只能來自決策當下這一邊本來就知道的事：
//    · 敵方英雄：只有被我方看見時的位置（引擎的 _seenV20，與 AI 相同的視野規則）、角色、是否陣亡（AI 的 threatOf 也讀陣亡）
//    · 我方英雄與我方小兵的位置、公開的建築、營地位置與類型、對局時間
//  【做法】所有特徵都從 legalView() 算出來；featuresFromView() 拿不到引擎，也就讀不到看不見的敵人位置。
//         check_s2_contract_v24.mjs 驗證：移動看不見的敵人，legalView 完全不變；移動看得見的敵人，legalView 會變（正向對照）。
//  【不影響決策】這裡只有離線量測，src/ 不 import 這個檔案，現役 s12 威脅模型不變。
// ============================================================================
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const LANES = ["top", "mid", "bot"];
export const LEGAL = Object.freeze({ detour: 1.17, reachR: 14, ringSec: 3, prevGap: 1, freshSec: 10, dirFreshSec: 5, closingMin: 2, closingRt: 25, reach: 15, reachNear: 8, rtCap: 40, ageCap: 60, waveAtTower: 18, allyNear: 20, seenR: 16, tCap: 1800, etaCap: 30 });
const L = LEGAL;

export function createLegalTracker() { return { blue: new Map(), red: new Map() }; }

/** 每個 tick 更新一次「我方看見的敵人位置」。只用 _seenV20，看不見的敵人不留下任何紀錄。 */
export function observeLegal(tracker, E) {
  const alive = E.players.filter((p) => !p.dead);
  for (const S of ["blue", "red"]) for (const q of alive) {
    if (q.side === S || !E._seenV20(S, q, alive)) continue;
    const ring = tracker[S].get(q.id) ?? [];
    ring.push({ t: E.t, x: q.pos.x, y: q.pos.y });
    while (ring.length && E.t - ring[0].t > L.ringSec) ring.shift();
    tracker[S].set(q.id, ring);
  }
}

/** 決策當下這一邊的合法資訊快照。回傳值只含可序列化的資料。 */
export function legalView(E, tracker, S, campId) {
  const foe = S === "blue" ? "red" : "blue", ownKey = S === "blue" ? "bm" : "rm", c = E.neutrals.camps.find((x) => x.id === campId);
  const foes = E.players.filter((q) => q.side === foe).map((q) => {
    const ring = tracker[S].get(q.id) ?? [], last = ring.at(-1) ?? null;
    const prev = last ? ring.filter((s) => s.t <= last.t - L.prevGap).at(-1) ?? null : null;
    return { id: q.id, role: q.role, dead: !!q.dead, last, prev };
  });
  const allies = E.players.filter((q) => q.side === S).map((q) => ({ role: q.role, dead: !!q.dead, x: q.pos.x, y: q.pos.y }));
  const lanes = LANES.map((ln) => {
    const mins = (E.lanes?.[ln]?.[ownKey] ?? []).filter((m) => m.hp > 0), tw = E.frontTower?.(foe, ln) ?? null;
    return { lane: ln, front: mins.length ? Math.max(...mins.map((m) => (S === "blue" ? m.t : 1 - m.t))) : 0, atTower: !!tw && mins.some((m) => dist(E._minionPos(ln, m), tw.pos) <= L.waveAtTower) };
  });
  return { t: E.t, speed: Math.max(1e-6, E.rules.moveSpeed ?? 5.6), camp: c ? { x: c.pos.x, y: c.pos.y, buff: c.type === "buff" } : null, foes, allies, lanes };
}

/** 新特徵的名稱（順序固定，事前登記）；分組用來做只報的分組貢獻。 */
export const NEW_FEATURES = Object.freeze([
  ["rtMin", "reach"], ["nReach15", "reach"], ["nReach8", "reach"], ["ejRt", "reach"],
  ["nNever", "lastKnown"], ["nFresh15", "lastKnown"], ["ejFresh", "lastKnown"], ["ageNearest", "lastKnown"],
  ["nClosing", "direction"], ["ejClosing", "direction"],
  ["wavesAtTower", "lane"], ["nearLaneFront", "lane"],
  ["foeDead", "context"], ["allyNear", "context"], ["campSeen", "context"], ["tNorm", "context"], ["etaJ", "context"],
]);

/** 從 legalView 算特徵（全部縮放到約 0～1）。rec＝決策紀錄（etaJ）。 */
export function featuresFromView(v, rec) {
  const c = v.camp, live = v.foes.filter((q) => !q.dead);
  const rtOf = (q) => { if (!q.last) return null; const age = v.t - q.last.t, d = Math.max(0, dist(q.last, c) - L.reachR); return Math.max(0, (d * L.detour) / v.speed - age); };
  const rows = live.map((q) => ({ q, rt: rtOf(q), age: q.last ? v.t - q.last.t : Infinity }));
  const known = rows.filter((r) => r.rt != null), ej = rows.find((r) => r.q.role === "jungle") ?? null;
  const closingOf = (r) => { const { last, prev } = r.q; if (!last || !prev || r.age > L.dirFreshSec || r.rt > L.closingRt) return false; return (dist(prev, c) - dist(last, c)) / (last.t - prev.t) >= L.closingMin; };
  const nearest = known.slice().sort((a, b) => dist(a.q.last, c) - dist(b.q.last, c))[0] ?? null;
  const laneNear = v.lanes.map((l) => l.front).reduce((a, b) => Math.max(a, b), 0);
  return {
    rtMin: known.length ? Math.min(L.rtCap, Math.min(...known.map((r) => r.rt))) / L.rtCap : 1,
    nReach15: known.filter((r) => r.rt <= L.reach).length / 5,
    nReach8: known.filter((r) => r.rt <= L.reachNear).length / 5,
    ejRt: ej && ej.rt != null ? Math.min(L.rtCap, ej.rt) / L.rtCap : 1,
    nNever: rows.filter((r) => r.rt == null).length / 5,
    nFresh15: known.filter((r) => r.age <= L.freshSec && r.rt <= L.reach).length / 5,
    ejFresh: ej && ej.rt != null && ej.age <= L.freshSec && ej.rt <= L.reach ? 1 : 0,
    ageNearest: nearest ? Math.min(L.ageCap, nearest.age) / L.ageCap : 1,
    nClosing: rows.filter(closingOf).length / 5,
    ejClosing: ej && closingOf(ej) ? 1 : 0,
    wavesAtTower: v.lanes.filter((l) => l.atTower).length / 3,
    nearLaneFront: laneNear,
    foeDead: v.foes.filter((q) => q.dead).length / 5,
    allyNear: v.allies.filter((a) => !a.dead && a.role !== "jungle" && dist(a, c) <= L.allyNear).length / 4,
    campSeen: v.allies.some((a) => !a.dead && dist(a, c) <= L.seenR) ? 1 : 0,
    tNorm: Math.min(L.tCap, v.t) / L.tCap,
    etaJ: Math.min(L.etaCap, rec.etaJ ?? L.etaCap) / L.etaCap,
  };
}
