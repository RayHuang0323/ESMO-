#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/analyze_shadow_v24_s05.mjs — 影子量測 0.5 版的離線分析（2026-11-14；只讀 JSON，不跑對局）
//
//  輸入：--dir=<資料夾>（讀其中所有 *.json；每檔有 rows[]，由 shadow_tactic_exec_v24_s05.mjs 產生）
//  選項：--config=<json>（傾向定義）  --out=<json>  --explore（只看因子分布；與 --config 並用則兩者都輸出）
//  分組：career_low|career_mid|career_high|inv|AB|BA。一列（row）＝一場。
//
//  決策（單筆評估 × 單一傾向；第一個不通過的檢查就是理由）：
//   1 noTarget → declined:no_target
//   2 jAvail!==1 或 jHp<jHpMin → declined:no_leader
//   3 etaJ>etaMax → declined:too_far
//   4 成員＝打野＋（mid、sup、top 依紀錄順序）baseAvail=1、hpFrac>=memberHpMin、eta<=etaJ+partyEtaSlack；
//     不足 sizeMin → declined:no_party
//   5 T＝popcount(nowKnown|apprKnown)；在 [sizeMin, min(sizeMax, 成員數)] 找最小 n 使 n−T>=marginMin 且
//     前 n 名 laneCost 總和<=laneCostMax ⇒ go(n)；否則有 n 過了 margin 卻卡 laneCost → declined:lane_cost，再否則 declined:threat
//
//  信賴區間：t 分布 95%（雙尾）；df<=30 查表，df>30 用 Cornish–Fisher 展開（z＋(z³+z)/4df＋(5z⁵+16z³+3z)/96df²）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir", null), CONFIG = arg("config", null), OUT = arg("out", null), EXPLORE = process.argv.includes("--explore");
if (!DIR) { console.error("need --dir"); process.exit(2); }
if (!CONFIG && !EXPLORE) { console.error("need --config or --explore"); process.exit(2); }

const popcount = (m) => { let c = 0; m = m >>> 0; while (m) { c += m & 1; m >>>= 1; } return c; };
const r3 = (x) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 1000) / 1000);
const EARLY_T = 90, EVAL_GAP = 5;

//  ---- 讀檔 ----
const rows = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.toLowerCase().endsWith(".json")).sort()) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch (err) { console.error(`skip ${f}: ${err.message}`); continue; }
  if (!Array.isArray(j?.rows)) { console.error(`skip ${f}: no rows[]`); continue; }
  for (const r of j.rows) rows.push({ ...r, _file: f, group: r.path === "career" ? `career_${r.tier}` : r.path });
}
const GROUPS = [...new Set(rows.map((r) => r.group))].sort();

//  ---- 統計工具 ----
const T_TABLE = [null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
  2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
function tCrit(df) {
  if (df < 1) return null;
  if (df <= 30) return T_TABLE[df];
  const z = 1.959964;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
}
function summ(xs) {
  xs = xs.filter((x) => x != null && Number.isFinite(x));
  const n = xs.length;
  if (!n) return { mean: null, sd: null, n: 0, ci: null };
  const m = xs.reduce((s, x) => s + x, 0) / n;
  if (n < 2) return { mean: r3(m), sd: null, n, ci: null };
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
  const hw = tCrit(n - 1) * sd / Math.sqrt(n);
  return { mean: r3(m), sd: r3(sd), n, ci: [r3(m - hw), r3(m + hw)] };
}
const excludes0 = (s) => (s.ci ? s.ci[0] > 0 || s.ci[1] < 0 : null);
function quantiles(xs) {
  xs = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length) return { n: 0 };
  const q = (p) => { const i = (xs.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return r3(xs[lo] + (xs[hi] - xs[lo]) * (i - lo)); };
  return { n: xs.length, p5: q(0.05), p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95) };
}
function hist05(xs) {
  const h = [0, 0, 0, 0, 0, 0]; let n = 0;
  for (const x of xs) { if (x == null) continue; h[Math.min(5, Math.max(0, x))]++; n++; }
  return { n, counts: h, share: h.map((c) => (n ? r3(c / n) : null)) };
}
const median = (xs) => quantiles(xs).p50 ?? null;

//  ---- 走訪 ----
const withTarget = (r) => r.evals.filter((ev) => !ev.noTarget);

//  ======================== A. explore ========================
function factorBlock(evs) {
  const pc = (k) => evs.map((ev) => (ev[k] == null ? null : popcount(ev[k])));
  return {
    evals: evs.length,
    etaJ: quantiles(evs.map((ev) => ev.etaJ)), jHp: quantiles(evs.map((ev) => ev.jHp)), tgtHp: quantiles(evs.map((ev) => ev.tgtHp)),
    nowKnown: hist05(pc("nowKnown")), apprKnown: hist05(pc("apprKnown")),
    nowOrApprKnown: hist05(evs.map((ev) => popcount((ev.nowKnown ?? 0) | (ev.apprKnown ?? 0)))),
    apprNearKnown: hist05(pc("apprNearKnown")),
    nowOrApprNearKnown: hist05(evs.map((ev) => popcount((ev.nowKnown ?? 0) | (ev.apprNearKnown ?? 0)))),
    reachKnown: hist05(evs.map((ev) => ev.reachKnown ?? null)),
    arr15: hist05(pc("arrMask15")), arrW: hist05(pc("arrMaskW")),
  };
}
function explore() {
  const all = rows.flatMap(withTarget);
  const roles = {};
  for (const ev of all) for (const c of ev.cands ?? []) {
    const [role, , eta, hpFrac] = c;
    (roles[role] ??= { hpFrac: [], etaMinusEtaJ: [] });
    roles[role].hpFrac.push(hpFrac); roles[role].etaMinusEtaJ.push(eta != null && ev.etaJ != null ? eta - ev.etaJ : null);
  }
  return {
    all: factorBlock(all),
    enRoute: factorBlock(all.filter((ev) => ev.invading && ev.jDist > 14)),
    afterT90: factorBlock(all.filter((ev) => ev.t > EARLY_T)),
    jAvailShare: all.length ? r3(all.filter((ev) => ev.jAvail === 1).length / all.length) : null,
    candidates: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, { hpFrac: quantiles(v.hpFrac), etaMinusEtaJ: quantiles(v.etaMinusEtaJ) }])),
  };
}

//  ======================== B. 決策 ========================
function decide(ev, P, maskMode = "known") {
  if (ev.noTarget) return { d: "declined:no_target" };
  if (ev.jAvail !== 1 || !(ev.jHp >= P.jHpMin)) return { d: "declined:no_leader" };
  if (!(ev.etaJ <= P.etaMax)) return { d: "declined:too_far" };
  const cands = ev.cands ?? [];
  const jc = cands.find((c) => c[0] === "jungle");
  const members = [jc ?? ["jungle", 1, ev.etaJ, ev.jHp, ev.jLv, 0]];
  for (const c of cands) {
    if (c[0] === "jungle") continue;
    const [, baseAvail, eta, hpFrac] = c;
    if (baseAvail === 1 && hpFrac >= P.memberHpMin && eta <= ev.etaJ + P.partyEtaSlack) members.push(c);
  }
  if (members.length < P.sizeMin) return { d: "declined:no_party" };
  //  威脅集合：P.threat === "all" ⇒ 現在＋所有逼近；預設 "near" ⇒ 現在＋逼近而且 15 秒內到得了（主對話 2026-11-14 加，量測前）
  const aF = P.threat === "all" ? ev.apprFull : ev.apprNearFull, aK = P.threat === "all" ? ev.apprKnown : ev.apprNearKnown;
  const T = maskMode === "full" ? popcount((ev.nowFull ?? 0) | (aF ?? 0)) : popcount((ev.nowKnown ?? 0) | (aK ?? 0));
  let marginOk = false;
  for (let n = P.sizeMin; n <= Math.min(P.sizeMax, members.length); n++) {
    if (n - T < P.marginMin) continue;
    marginOk = true;
    const lc = members.slice(0, n).reduce((s, c) => s + (c[5] ?? 0), 0);
    if (lc <= P.laneCostMax) return { d: "go", n };
  }
  return { d: marginOk ? "declined:lane_cost" : "declined:threat" };
}

//  ======================== C. 指標 ========================
function perMatchStats(r, dec, sideFilter = null) {
  //  dec[i]＝r.evals[i] 的決策
  const idx = r.evals.map((_, i) => i).filter((i) => !sideFilter || r.evals[i].side === sideFilter);
  let go = 0, goLate = 0, episodes = 0, episodesLate = 0, sizeSum = 0;
  const epLens = [];
  for (const S of ["blue", "red"]) {
    if (sideFilter && S !== sideFilter) continue;
    let run = 0, runLateStart = false;
    const flush = () => { if (run) { episodes++; epLens.push(run); if (runLateStart) episodesLate++; } run = 0; };
    for (const i of idx) {
      if (r.evals[i].side !== S) continue;
      if (dec[i].d === "go") { if (!run) runLateStart = r.evals[i].t > EARLY_T; run++; } else flush();
    }
    flush();
  }
  for (const i of idx) if (dec[i].d === "go") { go++; sizeSum += dec[i].n; if (r.evals[i].t > EARLY_T) goLate++; }
  return { evals: idx.length, go, goRate: idx.length ? go / idx.length : null, episodes, epLens, goLate, episodesLate, meanSize: go ? sizeSum / go : null };
}
//  註：t>90 的段落數＝「開始於 t>90」的段落（一段跨越 90 秒時算在開始那一側）。

function metricsFor(rs, decOf, sideFilter = null) {
  const st = rs.map((r) => perMatchStats(r, decOf(r), sideFilter));
  const sizes = [0, 0, 0, 0, 0], reasons = {};
  for (const r of rs) {
    const dec = decOf(r);
    r.evals.forEach((ev, i) => {
      if (sideFilter && ev.side !== sideFilter) return;
      const d = dec[i];
      if (d.d === "go") sizes[d.n] = (sizes[d.n] ?? 0) + 1; else reasons[d.d] = (reasons[d.d] ?? 0) + 1;
    });
  }
  const goTot = sizes.reduce((s, x) => s + x, 0), evTot = st.reduce((s, x) => s + x.evals, 0);
  const epAll = st.flatMap((x) => x.epLens);
  return {
    matches: rs.length,
    goEvalsPerMatch: summ(st.map((x) => x.go)),
    goRatePerMatch: summ(st.map((x) => x.goRate)),
    goRatePooled: evTot ? r3(goTot / evTot) : null,
    episodesPerMatch: summ(st.map((x) => x.episodes)),
    meanEpisodeLenEvals: epAll.length ? r3(epAll.reduce((s, x) => s + x, 0) / epAll.length) : null,
    sizeShare: Object.fromEntries([1, 2, 3, 4].map((n) => [n, goTot ? r3(sizes[n] / goTot) : null])),
    declineReasons: reasons,
    afterT90: { goEvalsPerMatch: summ(st.map((x) => x.goLate)), episodesPerMatch: summ(st.map((x) => x.episodesLate)) },
    _st: st,
  };
}
const strip = (m) => { const { _st, ...rest } = m; return rest; };

function analyze(cfg) {
  const props = cfg.propensities ?? {};
  const order = cfg.order ?? Object.keys(props);
  for (const k of order) if (!props[k]) throw new Error(`order 中的 ${k} 不在 propensities`);
  //  決策快取
  const D = {}, DF = {};
  for (const k of order) {
    D[k] = new Map(); DF[k] = new Map();
    for (const r of rows) { D[k].set(r, r.evals.map((ev) => decide(ev, props[k], "known"))); DF[k].set(r, r.evals.map((ev) => decide(ev, props[k], "full"))); }
  }
  const out = { propensities: props, order, matches: rows.length, groups: GROUPS, metrics: {}, paired: [], symmetry: {}, stages: {}, threatModel: null, infoCost: null };
  const statsCache = {};
  for (const k of order) {
    const dk = (r) => D[k].get(r);
    const overall = metricsFor(rows, dk);
    statsCache[k] = overall._st;
    out.metrics[k] = {
      overall: strip(overall),
      byGroup: Object.fromEntries(GROUPS.map((g) => [g, strip(metricsFor(rows.filter((r) => r.group === g), dk))])),
      bySide: Object.fromEntries(["blue", "red"].map((S) => [S, strip(metricsFor(rows, dk, S))])),
    };
    //  對稱：inv 組每場（藍 go rate − 紅 go rate）
    const inv = rows.filter((r) => r.group === "inv");
    out.symmetry[k] = summ(inv.map((r) => {
      const b = perMatchStats(r, dk(r), "blue"), rd = perMatchStats(r, dk(r), "red");
      return b.goRate == null || rd.goRate == null ? null : b.goRate - rd.goRate;
    }));
  }
  //  相鄰傾向的配對差（後減前）
  for (let i = 1; i < order.length; i++) {
    const a = statsCache[order[i - 1]], b = statsCache[order[i]];
    const pd = (f) => { const s = summ(rows.map((_, j) => { const x = f(a[j]), y = f(b[j]); return x == null || y == null ? null : y - x; })); return { ...s, ciExcludes0: excludes0(s) }; };
    out.paired.push({ from: order[i - 1], to: order[i], goEvalsPerMatch: pd((x) => x.go), episodesPerMatch: pd((x) => x.episodes), meanGoSize: pd((x) => x.meanSize) });
  }

  //  ======================== D. 三段 ========================
  out.stages.evalPass = Object.fromEntries(order.map((k) => [k, { goEvalsPerMatch: out.metrics[k].overall.goEvalsPerMatch, episodesPerMatch: out.metrics[k].overall.episodesPerMatch }]));
  out.stages.evalPassAutoName = order.includes("auto") ? "auto" : null;
  const jStarts = (r) => (r.invasionStarts ?? []).filter((x) => x.role === "jungle");
  const depShare = {};
  for (const k of order) {
    let n = 0, go = 0;
    for (const r of rows) for (const s of jStarts(r)) { if (s.evalIdx == null) continue; n++; if (D[k].get(r)[s.evalIdx]?.d === "go") go++; }
    depShare[k] = { n, goShare: n ? r3(go / n) : null };
  }
  out.stages.actualDeparture = {
    junglerStartsPerMatch: { overall: summ(rows.map((r) => jStarts(r).length)), byGroup: Object.fromEntries(GROUPS.map((g) => [g, summ(rows.filter((r) => r.group === g).map((r) => jStarts(r).length))])) },
    shadowDecisionAtStart: depShare,
  };
  const jEnds = rows.flatMap((r) => (r.invasionEnds ?? []).filter((x) => x.role === "jungle" && x.reason !== "open"));
  const reasons = {};
  for (const x of jEnds) reasons[x.reason] = (reasons[x.reason] ?? 0) + 1;
  const arrGo = {};
  for (const k of order) {
    const acc = { all: [0, 0], invading: [0, 0], notInvading: [0, 0] };
    for (const r of rows) r.evals.forEach((ev, i) => {
      if (D[k].get(r)[i].d !== "go" || ev.jArr == null) return;
      const add = (key) => { acc[key][0]++; if (ev.jArr === 1) acc[key][1]++; };
      add("all"); add(ev.invading ? "invading" : "notInvading");
    });
    arrGo[k] = Object.fromEntries(Object.entries(acc).map(([key, [n, a]]) => [key, { n, jArrShare: n ? r3(a / n) : null }]));
  }
  out.stages.actualArrival = {
    junglerEnds: jEnds.length,
    arrivedShare: jEnds.length ? r3(jEnds.filter((x) => x.arrivedAt != null).length / jEnds.length) : null,
    medianArriveAfterStart: median(jEnds.filter((x) => x.arrivedAt != null).map((x) => x.arrivedAt - x.tStart)),
    endReasons: reasons,
    shadowGoJunglerArrival: arrGo,
  };

  //  ======================== E. 威脅模型 ========================
  const base = rows.flatMap(withTarget).filter((ev) => ev.arrMask15 != null);
  const accBlock = (evs) => {
    const preds = {
      nowOrApprKnown: (ev) => (ev.nowKnown ?? 0) | (ev.apprKnown ?? 0),
      nowOrApprNearKnown: (ev) => (ev.nowKnown ?? 0) | (ev.apprNearKnown ?? 0),
      nowOrApprNearFull: (ev) => (ev.nowFull ?? 0) | (ev.apprNearFull ?? 0),
      nowKnown: (ev) => ev.nowKnown ?? 0,
    };
    const res = { evals: evs.length };
    for (const [truthName, truthOf] of [["arr15", (ev) => ev.arrMask15], ["arrW", (ev) => ev.arrMaskW]]) {
      const es = evs.filter((ev) => truthOf(ev) != null);
      const blk = { evals: es.length };
      for (const [pn, pf] of Object.entries(preds)) {
        let sp = 0, sa = 0, sae = 0, tp = 0;
        for (const ev of es) { const p = pf(ev), t = truthOf(ev); const cp = popcount(p), ct = popcount(t); sp += cp; sa += ct; sae += Math.abs(cp - ct); tp += popcount(p & t); }
        const n = es.length;
        blk[pn] = { meanPred: n ? r3(sp / n) : null, meanActual: n ? r3(sa / n) : null, bias: n ? r3((sp - sa) / n) : null, mae: n ? r3(sae / n) : null,
          precision: sp ? r3(tp / sp) : null, recall: sa ? r3(tp / sa) : null };
      }
      {
        let sp = 0, sa = 0, sae = 0;
        for (const ev of es) { const cp = ev.reachKnown ?? 0, ct = popcount(truthOf(ev)); sp += cp; sa += ct; sae += Math.abs(cp - ct); }
        const n = es.length;
        blk.reachKnownCount = { meanPred: n ? r3(sp / n) : null, meanActual: n ? r3(sa / n) : null, bias: n ? r3((sp - sa) / n) : null, mae: n ? r3(sae / n) : null };
      }
      res[truthName] = blk;
    }
    return res;
  };
  out.threatModel = {
    all: accBlock(base),
    tLe90: accBlock(base.filter((ev) => ev.t <= EARLY_T)), tGt90: accBlock(base.filter((ev) => ev.t > EARLY_T)),
    invading: accBlock(base.filter((ev) => ev.invading)), notInvading: accBlock(base.filter((ev) => !ev.invading)),
  };

  //  ======================== F. 資訊成本 ========================
  const autoK = order.includes("auto") ? "auto" : order[0];
  let n = 0, diff = 0, fullGoOnly = 0, knownGoOnly = 0;
  for (const r of rows) r.evals.forEach((ev, i) => {
    if (ev.noTarget) return;
    n++;
    const a = D[autoK].get(r)[i].d === "go", b = DF[autoK].get(r)[i].d === "go";
    if (a !== b) { diff++; if (b) fullGoOnly++; else knownGoOnly++; }
  });
  out.infoCost = { propensity: autoK, evals: n, differShare: n ? r3(diff / n) : null, goOnlyWithFull: fullGoOnly, goOnlyWithKnown: knownGoOnly };
  return out;
}

//  ======================== 主程式 ========================
const result = { tool: "analyze_shadow_v24_s05", dir: DIR, files: [...new Set(rows.map((r) => r._file))], matches: rows.length, groups: GROUPS,
  tCritMethod: "two-sided 95%: table for df<=30, Cornish-Fisher expansion for df>30" };
if (EXPLORE) result.explore = explore();
if (CONFIG) {
  const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  result.analysis = analyze(cfg);
  //  人看的小表（stderr）
  const A = result.analysis, f = (s) => (s?.mean == null ? "   -  " : `${s.mean}${s.ci ? ` [${s.ci[0]},${s.ci[1]}]` : ""}`);
  process.stderr.write(`propensity        go/match              episodes/match        goRate  epLen  size1/2/3/4\n`);
  for (const k of A.order) {
    const m = A.metrics[k].overall;
    process.stderr.write(`${k.padEnd(16)}  ${f(m.goEvalsPerMatch).padEnd(20)}  ${f(m.episodesPerMatch).padEnd(20)}  ${String(m.goRatePooled).padEnd(6)}  ${String(m.meanEpisodeLenEvals).padEnd(5)}  ${[1, 2, 3, 4].map((x) => m.sizeShare[x]).join("/")}\n`);
  }
  process.stderr.write(`infoCost(${A.infoCost.propensity}): differShare=${A.infoCost.differShare}  n=${A.infoCost.evals}\n`);
}
const text = JSON.stringify(result);
if (OUT) fs.writeFileSync(OUT, text);
console.log(text);
