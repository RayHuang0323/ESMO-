#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/report_te24_s15_invade.mjs — Sprint 2 Preflight A 的彙總（只讀 diag_te24_s15_invade 的輸出；2026-11-20）
//
//  每格（生涯低／中／高、工具 inv／AB／BA，另可加傾向臂）報：
//   · 非擾動：整場雜湊與 S14 已記錄的值相同的場數（只對「原樣」臂有意義）
//   · 漏斗：評估 → 過了冷卻／忙碌／血量 → 有相信活著的敵方營 → 有在到場上限內的 → 走得到 → 經濟過關（任一目標）→ 實際出發
//   · 「太遠」的拆解：打野離自家營／敵方營的距離、最近一座「相信活著」與「真的活著」的敵方營到場秒數
//   · 經濟：在上限內、走得到的目標上，期望收益、成本、存活信念、時間價值、成功率與情況分類的平均；過關比例
//   · 忙碌的原因、出發後的結束原因、隊友到場
//  用法：node tools/owner_preview/report_te24_s15_invade.mjs --dir=<diag 資料夾> --ref=<S14 natural 資料夾> --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), REF = arg("ref"), OUT = arg("out"), K = 0.9;
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const q = (a, p) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : NaN; };
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const pct = (o, n) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r3(v / n)]));
const GATE = new Set(["declined:cooldown", "declined:in_progress", "declined:busy", "declined:hp", "declined:no_leader"]);

const cells = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl") && !["batches.jsonl", "interruptions.jsonl"].includes(f)).map((f) => f.replace(/\.jsonl$/, ""));
const out = {};
for (const cell of cells) {
  const rows = jsonl(path.join(DIR, `${cell}.jsonl`));
  const refName = cell.startsWith("career") ? cell.replace(/_p[a-z]+$/, "") : `holdout_${cell.replace(/_p[a-z]+$/, "")}`;
  const ref = new Map(jsonl(path.join(REF, `${refName}.jsonl`)).map((r) => [r.seed, r]));
  const O = { matches: rows.length, hashSame: rows.filter((r) => ref.get(r.seed)?.hash === r.hash).length, sideMatches: 0, evals: 0, starts: 0, arrived: 0,
    decisions: {}, busy: {}, funnel: { evals: 0, pastGate: 0, anyBelieved: 0, anyInCap: 0, anyRoute: 0, anyEcon: 0, go: 0 },
    tooFar: { n: 0, dOwnCamp: [], dEnemyCamp: [], etaBelieved: [], etaTrue: [], believedAlive: [], trueAlive: [], state: {} },
    pastGateLoc: { dOwnCamp: [], dEnemyCamp: [], etaBelieved: [] },
    belief: { believedAliveTrulyDead: 0, believedDeadTrulyAlive: 0, agree: 0 },
    econ: { n: 0, pass: 0, byType: {}, cond: {}, ev: [], cost: [], pA: [], lam: [], succ: [], ratio: [], trip: [], overlap: [] },
    econCheck: { fail: [0, 0], go: [0, 0] }, ends: {}, partnerEnds: {}, partnerArrived: 0, starts2: 0 };
  for (const r of rows) {
    for (const S of ["blue", "red"]) {
      const ob = r.obs[S];
      if (!ob?.posture) continue;
      O.sideMatches++; O.starts += ob.starts; O.arrived += ob.arrived; O.partnerArrived += ob.partnerArrived ?? 0;
      for (const [k, v] of Object.entries(ob.partnerEnds ?? {})) inc(O.partnerEnds, k, v);
      for (const t of r.tail) if (t.side === S && t.kind === "invade_end") { inc(O.ends, t.reason); if ((t.n ?? 1) === 2) O.starts2++; }
      for (const v of r.evals[S]) {
        O.evals++; O.funnel.evals++; inc(O.decisions, v.d);
        if (v.busy) inc(O.busy, String(v.busy).split(":")[0] === "state" || String(v.busy).split(":")[0] === "fsm" ? v.busy : v.busy);
        if (v.econCheckFail != null) O.econCheck.fail[v.econCheckFail ? 0 : 1]++;
        if (v.econCheckGo != null) O.econCheck.go[v.econCheckGo ? 0 : 1]++;
        if (GATE.has(v.d) || !v.camps) continue;
        O.funnel.pastGate++;
        const bel = v.camps.filter((c) => c.bAlive), inCap = bel.filter((c) => c.eta <= c.cap && c.exit), route = inCap.filter((c) => c.route != null && c.route <= c.cap), econ = route.filter((c) => c.ev != null && c.ev >= K * c.cost);
        if (bel.length) O.funnel.anyBelieved++;
        if (inCap.length) O.funnel.anyInCap++;
        if (route.length) O.funnel.anyRoute++;
        if (econ.length) O.funnel.anyEcon++;
        if (v.d === "go") O.funnel.go++;
        for (const c of v.camps) { if (c.bAlive && !c.tAlive) O.belief.believedAliveTrulyDead++; else if (!c.bAlive && c.tAlive) O.belief.believedDeadTrulyAlive++; else O.belief.agree++; }
        const minEta = (l) => (l.length ? Math.min(...l.map((c) => c.eta)) : NaN);
        O.pastGateLoc.dOwnCamp.push(v.jg.dOwnCamp); O.pastGateLoc.dEnemyCamp.push(v.jg.dEnemyCamp); O.pastGateLoc.etaBelieved.push(minEta(bel));
        if (v.d === "declined:too_far") {
          const T = O.tooFar; T.n++; T.dOwnCamp.push(v.jg.dOwnCamp); T.dEnemyCamp.push(v.jg.dEnemyCamp); T.etaBelieved.push(minEta(bel)); T.etaTrue.push(minEta(v.camps.filter((c) => c.tAlive)));
          T.believedAlive.push(bel.length); T.trueAlive.push(v.camps.filter((c) => c.tAlive).length); inc(T.state, `${v.jg.fsm}|${v.jg.state}`);
        }
        for (const c of route) {
          if (c.ev == null) continue;
          const E = O.econ; E.n++; if (c.ev >= K * c.cost) E.pass++;
          inc(E.cond, `${c.type}|${c.cond}`); const bt = (E.byType[c.type] ??= { n: 0, pass: 0 }); bt.n++; if (c.ev >= K * c.cost) bt.pass++;
          E.ev.push(c.ev); E.cost.push(c.cost); E.pA.push(c.pA); E.lam.push(c.lam); E.succ.push(c.succ); E.ratio.push(c.cost > 0 ? c.ev / (K * c.cost) : Infinity); E.trip.push(c.trip); E.overlap.push(c.trip > 0 ? c.overlap / c.trip : 0);
        }
      }
    }
  }
  const T = O.tooFar, E = O.econ, F = O.funnel, L = O.pastGateLoc;
  out[cell] = {
    matches: O.matches, hashSameAsS14: O.hashSame, sideMatches: O.sideMatches, startsPerSide: r3(O.starts / O.sideMatches), arrivedPerStart: r3(O.arrived / Math.max(1, O.starts)),
    decisions: pct(O.decisions, O.evals), busyTop: pct(O.busy, Object.values(O.busy).reduce((s, x) => s + x, 0) || 1),
    funnel: { pastGate: r3(F.pastGate / F.evals), anyBelievedGivenPast: r3(F.anyBelieved / F.pastGate), anyInCapGivenPast: r3(F.anyInCap / F.pastGate), anyRouteGivenPast: r3(F.anyRoute / F.pastGate), anyEconGivenRoute: r3(F.anyEcon / Math.max(1, F.anyRoute)), goPerPast: r3(F.go / F.pastGate) },
    pastGateLocation: { dOwnCampMed: r3(q(L.dOwnCamp, 0.5)), dEnemyCampMed: r3(q(L.dEnemyCamp, 0.5)), etaBelievedMed: r3(q(L.etaBelieved, 0.5)), etaBelievedP25: r3(q(L.etaBelieved, 0.25)), shareOwnCampWithin15: r3(L.dOwnCamp.filter((x) => x <= 15).length / L.dOwnCamp.length) },
    tooFar: { n: T.n, dOwnCampMed: r3(q(T.dOwnCamp, 0.5)), dEnemyCampMed: r3(q(T.dEnemyCamp, 0.5)), etaBelievedMed: r3(q(T.etaBelieved, 0.5)), etaTrueMed: r3(q(T.etaTrue, 0.5)), believedAliveMean: r3(mean(T.believedAlive)), trueAliveMean: r3(mean(T.trueAlive)), stateTop: pct(T.state, T.n) },
    beliefVsTruth: { ...O.belief, believedAliveTrulyDeadShare: r3(O.belief.believedAliveTrulyDead / (O.belief.believedAliveTrulyDead + O.belief.believedDeadTrulyAlive + O.belief.agree)) },
    econ: { candidates: E.n, passShare: r3(E.pass / Math.max(1, E.n)), byType: Object.fromEntries(Object.entries(E.byType).map(([k, v]) => [k, { n: v.n, pass: r3(v.pass / v.n) }])), cond: pct(E.cond, E.n),
      evMean: r3(mean(E.ev)), costMean: r3(mean(E.cost)), pAMean: r3(mean(E.pA)), lamMean: r3(mean(E.lam)), succMean: r3(mean(E.succ)), ratioMed: r3(q(E.ratio, 0.5)), ratioP90: r3(q(E.ratio, 0.9)), tripMean: r3(mean(E.trip)), overlapShareMean: r3(mean(E.overlap)) },
    econReplicaCheck: { failRecordsMatch: `${O.econCheck.fail[0]}/${O.econCheck.fail[0] + O.econCheck.fail[1]}`, goRecordsMatch: `${O.econCheck.go[0]}/${O.econCheck.go[0] + O.econCheck.go[1]}` },
    afterStart: { ends: pct(O.ends, Math.max(1, O.starts)), duoStarts: O.starts2, partnerEnds: O.partnerEnds, partnerArrived: O.partnerArrived },
  };
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
