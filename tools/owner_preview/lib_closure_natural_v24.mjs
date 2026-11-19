// ============================================================================
//  tools/owner_preview/lib_closure_natural_v24.mjs — Acceptance Closure 自然對局的逐場量測（只讀；2026-11-19）
//
//  同一場對局同時記三件事：S2-A／C 的計數、S2-B 判定器與每次出發的結果、S11 可行性的特徵與真值。
//  全部在 e.tick() 之後讀取，不寫入引擎。hash 與 pin_v20_v23_stream.streamHash 同格式，用來證明量測沒有改變對局。
// ============================================================================
import { createHash } from "node:crypto";
import { createOracle, oracleFinish, oracleStartFlags, oracleStep } from "./lib_s2_oracle_v24.mjs";
import { createLegalTracker, featuresFromView, legalView, NEW_FEATURES, observeLegal } from "./lib_s11_legal_features_v24.mjs";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r3 = (x) => Math.round(x * 1000) / 1000;
export const OUTCOME = Object.freeze({ captureSec: 60, deathSec: 45, goldSec: 60, labelSec: 15, labelR: 14 });
export const S11_COLUMNS = Object.freeze(["t", "side", "go", "arrivals", "threat", "reach", "seenNear", "ejKind", "ejAge", "buff", ...NEW_FEATURES.map((f) => f[0])]);

export function runInstrumented(e, meta) {
  const h = createHash("sha1"), oracle = createOracle(e), tracker = createLegalTracker();
  const open = [], starts = [], pendingLabels = [], s11 = [], campAlive = new Map();
  let logIdx = 0, ticks = 0;
  const jungler = (S) => e.players.find((p) => p.side === S && p.role === "jungle");
  while (!e.over && e.t < 3000) {
    e.tick(0.5); ticks++;
    let s = String(e.t);
    for (const p of e.players) s += `|${p.id},${p.pos.x},${p.pos.y},${p.hp},${p.dead ? 1 : 0},${p.state ?? ""},${p.gold ?? ""}`;
    h.update(s + "\n");
    oracleStep(oracle, e);
    //  新的決策紀錄：用「這個 tick 之前」的視野紀錄算特徵（tracker 在下面才更新），真值窗從下一個 tick 開始
    const log = e.tacExec?.log ?? [];
    for (; logIdx < log.length; logIdx++) {
      const r = log[logIdx];
      if (r.kind !== "invade" || !r.target) continue;
      const c = e.neutrals.camps.find((x) => x.id === r.target);
      if (!c) continue;
      if (r.d === "go") {
        const J = jungler(r.side), st = { t: r.t, side: r.side, target: r.target, type: c.type === "buff" ? "buff" : "camp", n: r.n ?? 1, flags: oracleStartFlags(e, r.side, r.target), captured: false, leaderDied: false, gold0: J?.gold ?? 0, gold60: null };
        starts.push(st); open.push({ st, J });
      }
      if (r.threat != null) {
        const f = featuresFromView(legalView(e, tracker, r.side, r.target), r);
        pendingLabels.push({ t: r.t, side: r.side, pos: { x: c.pos.x, y: c.pos.y }, mask: 0, base: [r.t, r.side === "blue" ? 0 : 1, r.d === "go" ? 1 : 0], rest: [r.threat, r.threatReach ?? 0, r.seenNear ?? 0, r.ej ?? "none", r.ejAge ?? -1, c.type === "buff" ? 1 : 0, ...NEW_FEATURES.map(([k]) => r3(f[k]))] });
      }
    }
    observeLegal(tracker, e);
    for (const c of e.neutrals?.camps ?? []) {
      const was = campAlive.get(c.id) ?? false;
      if (was && !c.alive && c.killerTeam) for (const o of open) if (o.st.target === c.id && o.st.side === c.killerTeam && e.t <= o.st.t + OUTCOME.captureSec) o.st.captured = true;
      campAlive.set(c.id, !!c.alive);
    }
    for (let i = open.length - 1; i >= 0; i--) {
      const o = open[i];
      if (o.J?.dead && e.t <= o.st.t + OUTCOME.deathSec) o.st.leaderDied = true;
      if (e.t >= o.st.t + OUTCOME.goldSec) { o.st.gold60 = (o.J?.gold ?? 0) - o.st.gold0; open.splice(i, 1); }
    }
    for (let i = pendingLabels.length - 1; i >= 0; i--) {
      const o = pendingLabels[i];
      if (e.t > o.t && e.t <= o.t + OUTCOME.labelSec) e.players.forEach((q, k) => { if (!q.dead && q.side !== o.side && dist(q.pos, o.pos) <= OUTCOME.labelR) o.mask |= 1 << k; });
      if (e.t >= o.t + OUTCOME.labelSec) { let n = 0, m = o.mask; while (m) { n += m & 1; m >>>= 1; } s11.push([...o.base, n, ...o.rest]); pendingLabels.splice(i, 1); }
    }
  }
  h.update(`END|${e.winner ?? "none"}|${e.t}|${e.exec !== undefined ? JSON.stringify(e.exec) : ""}`);
  for (const o of open) { o.st.gold60 = (o.J?.gold ?? 0) - o.st.gold0; o.st.goldCut = true; }   // 對局在 60 秒內結束：照實標記
  const log = e.tacExec?.log ?? [], ends = log.filter((r) => r.kind === "invade_end");
  for (const st of starts) { const end = ends.find((x) => x.side === st.side && x.t >= st.t); st.arrived = !!end?.arrived; st.endReason = end?.reason ?? null; delete st.gold0; }
  const { sides, inOpp } = oracleFinish(oracle, starts.map((g) => ({ t: g.t, side: g.side, target: g.target })));
  starts.forEach((g, i) => { g.inOpp = inOpp[i]; });
  const te = Object.fromEntries(["blue", "red"].map((S) => { const O = e.tacExec?.obs?.[S]; return [S, O ? { posture: O.posture ?? null, starts: O.starts ?? 0, arrived: O.arrived ?? 0 } : null]; }));
  return { ...meta, duration: e.t, over: !!e.over, winner: e.winner ?? null, ticks, hash: h.digest("hex").slice(0, 20), te, s2b: sides, starts, s11, logSize: log.length };
}
