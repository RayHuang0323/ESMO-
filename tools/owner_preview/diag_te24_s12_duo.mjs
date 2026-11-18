#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s12_duo.mjs — v24 Sprint 1.2 item 5: why duo partners arrive only ~11% (read-only observer; 2026-11-18)
//  Used seeds only. Builds adaptive.v1.1 engines; to get enough duos it can force the invading side's posture (--posture=aggressive)
//  and set the diagnostic econK hook (--econK=0). Per partner task it records, every tick, the partner's displayed state, fsm,
//  retreat flag, distance to the camp and to the leader; at the end: partner end reason, leader end reason, who ended first,
//  whether the partner arrived, and the start context (role, distance, hp, lane pressure).
//  --path=tool|career --seeds=a,b --configs=inv,AB,BA --tier=mid [--posture=aggressive] [--econK=0] --out=<json>
// ============================================================================
import fs from "node:fs";
import * as P from "./pin_v20_v23_stream.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PATH = arg("path", "tool"), TIER = arg("tier", "mid"), OUT = arg("out", null), POSTURE = arg("posture", null), ECONK = arg("econK", null);
const seeds = arg("seeds", "").split(",").filter(Boolean).map(Number);
const CONFIGS = arg("configs", "inv,AB,BA").split(",");
const TPL = { inv: ["v2.jungle_invasion", "v2.jungle_invasion"], AB: ["v2.jungle_invasion", "classic.m7"], BA: ["classic.m7", "v2.jungle_invasion"] };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tasks = [];
for (const seed of seeds) for (const cfg of PATH === "tool" ? CONFIGS : ["career"]) {
  const e = PATH === "tool" ? P.build("balanceTool.v24", TPL[cfg][0], TPL[cfg][1], seed, null) : P.build("career.v24", "v2.jungle_invasion", null, seed, TIER);
  for (const S of ["blue", "red"]) if (e.tacExec.side[S].posture && POSTURE) { e.tacExec.side[S].posture = POSTURE; e.tacExec.obs[S].posture = POSTURE; }
  if (ECONK != null) e.tacExec.tune = { econK: Number(ECONK) };
  const live = new Map();   // partnerId -> task
  while (!e.over && e.t < 1500) {
    e.tick(0.5);
    for (const p of e.players) {
      const A = p._tacPartnerV24;
      let T = live.get(p.id);
      if (A && !T) {
        const L = e.players.find((q) => q.id === A.leaderId), camp = e.neutrals.camps.find((c) => c.id === A.camp);
        const foesNear = e.players.filter((q) => q.side !== p.side && !q.dead && dist(q.pos, p.pos) < 14).length;
        T = { seed, cfg, side: p.side, role: p.role, t0: e.t, d0Camp: +dist(p.pos, camp.pos).toFixed(1), d0Leader: +dist(p.pos, L.pos).toFixed(1), leaderD0: +dist(L.pos, camp.pos).toFixed(1),
          hp0: +(p.hp / p.maxHp).toFixed(2), foesNear0: foesNear, state0: p.state, states: {}, arrived: false, camp: A.camp, leaderId: A.leaderId, end: null, leaderEnd: null, firstNonInvade: null };
        live.set(p.id, T);
      }
      if (T && A) {
        T.states[p.state ?? "-"] = (T.states[p.state ?? "-"] ?? 0) + 1;
        if (p.state !== "入侵" && T.firstNonInvade == null) T.firstNonInvade = { dt: +(e.t - T.t0).toFixed(1), state: p.state, fsm: p.fsm, retreating: !!p.retreating, retreatReason: p.retreatReason ?? null };
        if (A.arrivedAt != null) T.arrived = true;
      }
      if (T && !A) {
        const ev = [...e.tacExec.log].reverse().find((r) => r.kind === "partner_end" && r.id === p.id);
        T.end = ev?.reason ?? "?"; T.dur = +(e.t - T.t0).toFixed(1);
        tasks.push(T); live.delete(p.id);
      }
    }
  }
  //  帶隊者的結束紀錄在下一個 tick 開頭才寫入 ⇒ 對局結束後再對回去（同一邊、出發之後的第一筆 invade_end）
  for (const T of tasks) if (T.seed === seed && T.cfg === cfg && T.leaderEnd == null) {
    const le = e.tacExec.log.find((r) => r.kind === "invade_end" && r.side === T.side && r.t >= T.t0);
    T.leaderEnd = le?.reason ?? "none"; T.leaderArrived = le?.arrived ?? null; T.leaderDur = le?.dur ?? null;
  }
  process.stderr.write(`[duo] ${PATH} ${cfg} seed ${seed} tasks=${tasks.length}\n`);
}
const by = (f) => { const o = {}; for (const t of tasks) { const k = f(t); o[k] = (o[k] ?? 0) + 1; } return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1])); };
const summary = {
  tasks: tasks.length, arrived: tasks.filter((t) => t.arrived).length,
  endReason: by((t) => t.end), firstOverride: by((t) => (t.firstNonInvade ? `${t.firstNonInvade.state}${t.firstNonInvade.retreating ? "(retreating:" + (t.firstNonInvade.retreatReason ?? "local") + ")" : ""}` : "never")),
  leaderEndedFirst: tasks.filter((t) => String(t.end).startsWith("leader_")).length, role: by((t) => t.role),
  leaderEndWhenPartnerEndedByLeader: by((t) => (String(t.end).startsWith("leader_") ? `${t.leaderEnd}|leaderArrived=${t.leaderArrived}|partnerArrived=${t.arrived}` : "partner-own-end")),
  arrivedByStart: by((t) => `${t.arrived ? "arr" : "no"}|foesNear0=${Math.min(2, t.foesNear0)}|state0=${t.state0}`),
};
console.log(JSON.stringify(summary, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ tool: "diag_te24_s12_duo", path: PATH, seeds, posture: POSTURE, econK: ECONK, summary, tasks }, null, 1));
