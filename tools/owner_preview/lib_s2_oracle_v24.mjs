// ============================================================================
//  tools/owner_preview/lib_s2_oracle_v24.mjs — S2-B 獨立機會判定器 v1 的共用邏輯（離線量測專用；2026-11-19）
//
//  判定條件與 measure_s2_opportunity_v24.mjs 的 v1 相同（O1～O6），這裡拆成可重用的函式，並多提供「某一次出發當下的條件」。
//  【隱藏資訊】判定器讀完整真實狀態，只當離線評估標籤。它只在 tick 之後讀取引擎，不寫入任何欄位，決策層也讀不到它的輸出。
//             tools/check_s2_contract_v24.mjs 用整場串流雜湊驗證：掛上判定器與不掛，對局逐 tick 相同。
// ============================================================================
export const ORACLE_V1 = Object.freeze({ version: "v1", everySec: 5, mergeGap: 10, hpMin: 0.6, foeNear: 12, etaMax: 25, detour: 1.17, reachR: 14, racePad: 3, rateMin: 1, value: Object.freeze({ buff: 90, camp: 60 }), clear: Object.freeze({ buff: 12, camp: 8 }) });
const O = ORACLE_V1;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const speedOf = (e) => Math.max(1e-6, e.rules.moveSpeed ?? 5.6);
const typeOf = (c) => (c.type === "buff" ? "buff" : "camp");

export function createOracle(e) { return { speed: speedOf(e), pending: [], points: { blue: [], red: [] }, next: O.everySec }; }

/** 每個 tick 之後呼叫一次（與 measure_s2_opportunity_v24.mjs 的迴圈同序）。 */
export function oracleStep(o, e) {
  for (let i = o.pending.length - 1; i >= 0; i--) {
    const c = o.pending[i];
    if (e.t < c.resolveAt) continue;
    const camp = e.neutrals.camps.find((x) => x.id === c.camp);
    if (camp.alive || camp.killerTeam === c.side) o.points[c.side].push(c);   // O1 的後半：到場時還活著，或被自己清掉
    o.pending.splice(i, 1);
  }
  if (e.t < o.next) return;
  o.next += O.everySec;
  const alive = e.players.filter((p) => !p.dead);
  for (const S of ["blue", "red"]) {
    const J = alive.find((p) => p.side === S && p.role === "jungle");
    if (!J || J.hp / J.maxHp < O.hpMin || (J.recallT ?? 0) > 0 || (J._invV2 && !J._invV2.done)) continue;      // O2
    if (alive.some((q) => q.side !== S && dist(q.pos, J.pos) <= O.foeNear)) continue;                            // O2
    if (e.fsm3?.[S]?.objGo) continue;                                                                            // O5
    for (const c of e.neutrals.camps) {
      if (c.side === S || !c.alive) continue;                                                                    // O1
      const type = typeOf(c), eta = dist(J.pos, c.pos) * O.detour / o.speed, clear = O.clear[type];
      if (eta > O.etaMax || O.value[type] / (eta + clear) < O.rateMin) continue;                                 // O3、O6
      if (alive.some((q) => q.side !== S && Math.max(0, dist(q.pos, c.pos) - O.reachR) * O.detour / o.speed <= eta + O.racePad)) continue;  // O4
      o.pending.push({ t: e.t, side: S, camp: c.id, type, resolveAt: e.t + eta });
    }
  }
}

/** 某一次出發當下，目標營地各條件是否成立（只報用）。出發本身會讓打野進入入侵狀態，所以 O2 不看「正在入侵」這一項。 */
export function oracleStartFlags(e, S, campId) {
  const c = e.neutrals.camps.find((x) => x.id === campId), alive = e.players.filter((p) => !p.dead), J = alive.find((p) => p.side === S && p.role === "jungle");
  if (!c || !J) return { o1: false, o2: false, o3: false, o4: false, o5: false, o6: false };
  const speed = speedOf(e), type = typeOf(c), eta = dist(J.pos, c.pos) * O.detour / speed;
  return {
    o1: !!c.alive,
    o2: J.hp / J.maxHp >= O.hpMin && !((J.recallT ?? 0) > 0) && !alive.some((q) => q.side !== S && dist(q.pos, J.pos) <= O.foeNear),
    o3: eta <= O.etaMax,
    o4: !alive.some((q) => q.side !== S && Math.max(0, dist(q.pos, c.pos) - O.reachR) * O.detour / speed <= eta + O.racePad),
    o5: !e.fsm3?.[S]?.objGo,
    o6: O.value[type] / (eta + O.clear[type]) >= O.rateMin,
  };
}

/** 對局結束後：合併機會段，算每邊的機會與利用；go＝[{ t, side, target }]。回傳的 inOpp 與 go 同序。 */
export function oracleFinish(o, go) {
  const sides = {}, inOpp = go.map(() => false);
  for (const S of ["blue", "red"]) {
    const eps = [], byCamp = new Map();
    for (const p of o.points[S].slice().sort((a, b) => a.t - b.t)) { const cur = byCamp.get(p.camp); if (cur && p.t - cur.end <= O.mergeGap) cur.end = p.t; else { const ep = { camp: p.camp, type: p.type, start: p.t, end: p.t }; byCamp.set(p.camp, ep); eps.push(ep); } }
    const mine = go.filter((g) => g.side === S);
    go.forEach((g, i) => { if (g.side === S && eps.some((ep) => g.target === ep.camp && g.t >= ep.start - 5 && g.t <= ep.end + 10)) inOpp[i] = true; });
    sides[S] = {
      episodes: eps.length, buffEpisodes: eps.filter((x) => x.type === "buff").length,
      takenAny: eps.filter((ep) => mine.some((g) => g.t >= ep.start - 5 && g.t <= ep.end + 10)).length,
      takenSame: eps.filter((ep) => mine.some((g) => g.target === ep.camp && g.t >= ep.start - 5 && g.t <= ep.end + 10)).length,
      starts: mine.length, startsInOpportunity: go.filter((g, i) => g.side === S && inOpp[i]).length,
    };
  }
  return { sides, inOpp };
}
