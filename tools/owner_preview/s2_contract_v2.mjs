// ============================================================================
//  tools/owner_preview/s2_contract_v2.mjs — S2 新契約（Owner 2026-11-19 核准 S2-A、S2-C；S2-B 只報）的純函式
//
//  舊 S2（judge_te24_s11.mjs）一字不改，舊 FAIL 維持。這份契約只用於事前登記過的新驗證。
//  分母是所有有入侵意圖的邊×場，沒出發的也留在分母；工具與生涯永遠分開判定，沒有合併的結果。
// ============================================================================
export const S2_CONTRACT_V2 = Object.freeze({
  version: "s2.v2",
  A: Object.freeze({ lowerMin: 0.65, minStarts: 60 }),
  C: Object.freeze({ c1Min: 0.6, c1Max: 1.5, c2Min: 0.5 }),
  boot: Object.freeze({ B: 4000, seed: 20261119 }),
});

/** 把對局列展開成「有入侵意圖的邊×場」。row.te[side].posture 為空的一邊沒有入侵意圖，不算。 */
export function sideUnits(rows) {
  const paths = new Set(rows.map((r) => r.path));
  if (paths.size > 1) throw new Error(`S2 contract refuses to merge paths: ${[...paths].join(",")}`);
  return rows.flatMap((r) => ["blue", "red"].filter((S) => r.te?.[S]?.posture).map((S) => ({ cluster: String(r.seed), starts: r.te[S].starts ?? 0, arrived: Math.min(r.te[S].arrived ?? 0, r.te[S].starts ?? 0) })));
}
export const statA = (u) => { const st = u.reduce((a, x) => a + x.starts, 0); return st ? u.reduce((a, x) => a + x.arrived, 0) / st : NaN; };
export const statC1 = (u) => (u.length ? u.reduce((a, x) => a + x.starts, 0) / u.length : NaN);
export const statC2 = (u) => (u.length ? u.filter((x) => x.starts >= 1).length / u.length : NaN);

/** 以 Seed 為叢集的百分位 bootstrap。 */
export function bootCI(units, stat, { B, seed } = S2_CONTRACT_V2.boot) {
  const groups = new Map();
  for (const x of units) { if (!groups.has(x.cluster)) groups.set(x.cluster, []); groups.get(x.cluster).push(x); }
  const keys = [...groups.keys()], out = [];
  let s = seed;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let b = 0; b < B; b++) { const u = []; for (let i = 0; i < keys.length; i++) u.push(...groups.get(keys[Math.floor(rnd() * keys.length)])); const v = stat(u); if (Number.isFinite(v)) out.push(v); }
  out.sort((a, b) => a - b);
  return out.length ? [out[Math.floor(out.length * 0.025)], out[Math.min(out.length - 1, Math.floor(out.length * 0.975))]] : [NaN, NaN];
}

export function judgeA({ starts, ci }) {
  const T = S2_CONTRACT_V2.A;
  if (starts < T.minStarts) return "INCONCLUSIVE";
  if (ci[0] >= T.lowerMin) return "PASS";
  if (ci[1] < T.lowerMin) return "FAIL";
  return "INCONCLUSIVE";
}
/** Owner 核准的文字是平均值與比例本身的門檻，所以用點估計判定，區間只報。 */
export function judgeC({ sides, c1, c2 }) {
  const T = S2_CONTRACT_V2.C;
  if (!sides) return "INCONCLUSIVE";
  return c1 >= T.c1Min && c1 <= T.c1Max && c2 >= T.c2Min ? "PASS" : "FAIL";
}

/** 判定一條路徑。registered＝false（回看舊資料）時一律不給 PASS／FAIL，只列數字。 */
export function judgePath(rows, { registered }) {
  const u = sideUnits(rows), starts = u.reduce((a, x) => a + x.starts, 0), arrived = u.reduce((a, x) => a + x.arrived, 0);
  const A = { starts, arrived, value: statA(u), ci: bootCI(u, statA) }, c1 = statC1(u), c2 = statC2(u);
  const C = { sides: u.length, c1, c2, c1Ci: bootCI(u, statC1), c2Ci: bootCI(u, statC2) };
  return { mode: registered ? "REGISTERED" : "RETROSPECTIVE", matches: rows.length, A: { ...A, verdict: registered ? judgeA(A) : "NOT_JUDGED" }, C: { ...C, verdict: registered ? judgeC(C) : "NOT_JUDGED" } };
}

/**
 * S2-B 判定器驗證（只報，不是 S2-B 的通過門檻）。starts：每次出發一筆 { cluster, inOpp, captured, leaderDied, gold60, goldCut }。
 * 問題只有一個：被判定器標成「機會」的出發，實際結果是否比其他出發好。
 * VALID＝搶到營地率與 60 秒金錢的差都顯著為正，而且帶隊者陣亡率沒有多 5 個百分點以上；INVALID＝任一項明確相反；其他或機會內出發少於 30 次＝INCONCLUSIVE。
 */
export const ORACLE_VALIDATION = Object.freeze({ minPositive: 30, deathMargin: 0.05 });
export function validateOracle(starts, { B, seed } = S2_CONTRACT_V2.boot) {
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const diffs = (list) => {
    const pos = list.filter((s) => s.inOpp), neg = list.filter((s) => !s.inOpp), g = (a) => a.filter((s) => !s.goldCut && Number.isFinite(s.gold60)).map((s) => s.gold60);
    return { capture: mean(pos.map((s) => +s.captured)) - mean(neg.map((s) => +s.captured)), gold: mean(g(pos)) - mean(g(neg)), death: mean(pos.map((s) => +s.leaderDied)) - mean(neg.map((s) => +s.leaderDied)) };
  };
  const groups = new Map();
  for (const s of starts) { if (!groups.has(s.cluster)) groups.set(s.cluster, []); groups.get(s.cluster).push(s); }
  const keys = [...groups.keys()], draws = { capture: [], gold: [], death: [] };
  let r = seed;
  const rnd = () => (r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let b = 0; b < B; b++) { const x = []; for (let i = 0; i < keys.length; i++) x.push(...groups.get(keys[Math.floor(rnd() * keys.length)])); const d = diffs(x); for (const k of Object.keys(draws)) if (Number.isFinite(d[k])) draws[k].push(d[k]); }
  const ci = (a) => { const v = a.slice().sort((p, q) => p - q); return v.length ? [v[Math.floor(v.length * 0.025)], v[Math.min(v.length - 1, Math.floor(v.length * 0.975))]] : [NaN, NaN]; };
  const point = diffs(starts), cis = { capture: ci(draws.capture), gold: ci(draws.gold), death: ci(draws.death) }, positive = starts.filter((s) => s.inOpp).length;
  let verdict = "INCONCLUSIVE";
  if (positive >= ORACLE_VALIDATION.minPositive) {
    if (cis.capture[1] < 0 || cis.gold[1] < 0 || cis.death[0] > ORACLE_VALIDATION.deathMargin) verdict = "INVALID";
    else if (cis.capture[0] > 0 && cis.gold[0] > 0 && cis.death[1] <= ORACLE_VALIDATION.deathMargin) verdict = "VALID";
  }
  return { verdict, starts: starts.length, positive, point, ci: cis };
}
