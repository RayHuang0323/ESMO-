#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/analyze_shadow_v24.mjs — v24 Sprint 0「自適應戰術執行」影子研究分析（2026-11-14；量測前提交）
//  判準：review/tactic-book-3a/v24_sprint0/REGISTRATION.md §4（S1–S7）、§5（R1–R5）、§7（修訂）。固定，不依結果調整。
//  輸入：shadow_tactic_exec_v24.mjs 的批次 JSON（{ tool, path, tier, seeds, detour, rows: [...] }）。
//  分組：career:low／career:mid／career:high、inv、AB、BA，另加 all（全部合併）。
//  慣例：「n 人」的戰力比＝ratioKnown[n − 1]（陣列索引從 0 開始；n＝1 ⇒ 索引 0），與量測工具摘要的 meanRatioKnown1 相同。
//  旗標 R1–R4 只描述（🚩 成立／✅ 不成立），不是通過或不通過；R5 由量測工具 --selfcheck 檢查。結束碼一律 0。
//  用法：node tools/owner_preview/analyze_shadow_v24.mjs --dir=<batches> [--out=<analysis.json>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out", null);
if (!DIR) { console.error("need --dir"); process.exit(0); }

let rows = [];
try {
  rows = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().flatMap((f) => {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      return (Array.isArray(b?.rows) ? b.rows : []).map((r) => ({ ...r, path: r?.path ?? b.path ?? null, tier: r?.tier ?? b.tier ?? null }));
    } catch (err) { console.error(`略過無法讀取的檔案 ${f}：${err.message}`); return []; }
  });
} catch (err) { console.error(`無法讀取資料夾 ${DIR}：${err.message}`); }

// ---------------------------------------------------------------- 小工具
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);
const mean = (a) => { const v = a.map(num).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
//  線性內插分位數（type 7）
function quantile(a, q) {
  const v = a.map(num).filter((x) => x != null).sort((x, y) => x - y);
  if (!v.length) return null;
  const h = (v.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return v[lo] + (v[hi] - v[lo]) * (h - lo);
}
const median = (a) => quantile(a, 0.5);
//  等級雙列相關：2·U/(n1·n2) − 1，U＝「搶到」組大於「其他」組的配對數（平手算 0.5）
function rankBiserial(xs, ys) {
  const a = xs.map(num).filter((x) => x != null), b = ys.map(num).filter((x) => x != null);
  if (!a.length || !b.length) return null;
  let U = 0;
  for (const x of a) for (const y of b) U += x > y ? 1 : x === y ? 0.5 : 0;
  return 2 * U / (a.length * b.length) - 1;
}
const countBy = (a) => { const o = {}; for (const k of a) o[k] = (o[k] ?? 0) + 1; return o; };
const evalsOf = (r) => (Array.isArray(r?.evals) ? r.evals : []);
const endsOf = (r) => (Array.isArray(r?.invasionEnds) ? r.invasionEnds : []);
const startsOf = (r) => (Array.isArray(r?.invasionStarts) ? r.invasionStarts : []);
const at = (arr, i) => (Array.isArray(arr) ? num(arr[i]) : null);

// ---------------------------------------------------------------- 分組
const groupKeyOf = (r) => r.path === "career" ? (r.tier ? `career:${r.tier}` : null) : ["inv", "AB", "BA"].includes(r.path) ? r.path : null;
const GROUP_ORDER = ["career:low", "career:mid", "career:high", "inv", "AB", "BA", "all"];
const groups = {};
for (const r of rows) { const k = groupKeyOf(r); if (k) (groups[k] ??= []).push(r); }
if (rows.length) groups.all = rows;
const groupNames = GROUP_ORDER.filter((g) => groups[g]?.length);

// ---------------------------------------------------------------- S1：入侵期間評估的因素
const FACTORS = {
  ratioKnown1: (e) => at(e.ratioKnown, 0),
  ratioFull1: (e) => at(e.ratioFull, 0),
  enemyKnownCount: (e) => num(e.enemyKnown?.count),
  etaJ: (e) => num(e.etaJ),
  junglerStrength: (e) => (Array.isArray(e.cands) && Array.isArray(e.cands[0]) ? num(e.cands[0][3]) : null),
};
//  每一筆「已結束（reason ≠ open）且 evalIdxs 非空」的入侵 ⇒ 各因素取期間評估的平均
function invasionsOf(set) {
  const out = [];
  for (const r of set) {
    const ev = evalsOf(r);
    for (const x of endsOf(r)) {
      if (!x || x.reason === "open") continue;
      const idx = Array.isArray(x.evalIdxs) ? x.evalIdxs.filter((i) => ev[i]) : [];
      if (!idx.length) continue;
      const f = Object.fromEntries(Object.entries(FACTORS).map(([k, fn]) => [k, mean(idx.map((i) => fn(ev[i])))]));
      out.push({ seed: r.seed, side: x.side ?? null, role: x.role ?? null, reason: x.reason ?? null, stolen: x.reason === "stolen", nEvals: idx.length, ...f });
    }
  }
  return out;
}
function s1(set) {
  const endReasons = countBy(set.flatMap((r) => endsOf(r).map((x) => x?.reason ?? "?")));
  const inv = invasionsOf(set), st = inv.filter((x) => x.stolen), ot = inv.filter((x) => !x.stolen);
  const factors = Object.fromEntries(Object.keys(FACTORS).map((k) => [k, {
    medianStolen: r4(median(st.map((x) => x[k]))), medianOther: r4(median(ot.map((x) => x[k]))),
    rankBiserial: r4(rankBiserial(st.map((x) => x[k]), ot.map((x) => x[k]))),
  }]));
  return { endReasons, endedWithEvals: inv.length, n: { stolen: st.length, other: ot.length }, factors };
}

// ---------------------------------------------------------------- S2：門檻（以 all 的「搶到」入侵決定）
const POSTURES = {
  conservative: { q: 0.75, range: [1, 2] },
  auto: { q: 0.50, range: [1, 3] },
  aggressive: { q: 0.25, range: [2, 3] },
  allIn: { q: 0.10, range: [3, 4] },
};
const stolenAll = invasionsOf(groups.all ?? []).filter((x) => x.stolen).map((x) => x.ratioKnown1);
const S2 = {
  basis: { stolenInvasions: stolenAll.filter((x) => num(x) != null).length },
  postures: Object.fromEntries(Object.entries(POSTURES).map(([k, p]) => [k, { percentile: p.q * 100, threshold: r4(quantile(stolenAll, p.q)), partySize: p.range }])),
};
const TH = Object.fromEntries(Object.keys(POSTURES).map((k) => [k, S2.postures[k].threshold]));

// ---------------------------------------------------------------- S3：每次評估的決定
//  回傳 { go, size, reason }；ratioKey＝ratioKnown 或 ratioFull
function decide(e, posture, ratioKey) {
  if (e?.noTarget) return { go: false, size: null, reason: "no_target" };
  if (e?.noLeader) return { go: false, size: null, reason: "no_leader" };
  const [lo, hi] = POSTURES[posture].range, th = TH[posture];
  if (th != null) for (let n = lo; n <= hi; n++) { const v = at(e?.[ratioKey], n - 1); if (v != null && v >= th) return { go: true, size: n, reason: null }; }
  if (at(e?.ownPower, lo - 1) == null) return { go: false, size: null, reason: "no_one_free" };
  return { go: false, size: null, reason: th == null ? "no_threshold" : "threat" };
}
function s3(set) {
  const matches = set.length, ev = set.flatMap(evalsOf);
  const starts = set.flatMap(startsOf);
  const actual = { invasionStartsPerMatch: matches ? r4(starts.length / matches) : null,
    junglerStartsPerMatch: matches ? r4(starts.filter((x) => x?.role === "jungle").length / matches) : null };
  const one = (ratioKey) => Object.fromEntries(Object.keys(POSTURES).map((p) => {
    const ds = ev.map((e) => decide(e, p, ratioKey)), go = ds.filter((d) => d.go);
    return [p, { evals: ds.length, go: go.length, goPerMatch: matches ? r4(go.length / matches) : null,
      partySize: countBy(go.map((d) => d.size)), declineReasons: countBy(ds.filter((d) => !d.go).map((d) => d.reason)) }];
  }));
  return { matches, actual, known: one("ratioKnown"), full: one("ratioFull") };
}

// ---------------------------------------------------------------- S4：只用已知資訊的代價
function s4(set) {
  const ev = set.flatMap(evalsOf);
  const res = ev.filter((e) => num(e?.actualArrivals) != null);
  const err = (k) => { const v = res.filter((e) => num(e[k]?.count) != null).map((e) => e[k].count - e.actualArrivals);
    return { n: v.length, mae: r4(mean(v.map(Math.abs))), bias: r4(mean(v)) }; };
  const elig = ev.filter((e) => !e?.noTarget && !e?.noLeader);
  const diff = elig.filter((e) => decide(e, "auto", "ratioKnown").go !== decide(e, "auto", "ratioFull").go).length;
  const withKnown = ev.filter((e) => e?.enemyKnown);
  return {
    arrivalError: { resolved: res.length, full: err("enemyFull"), known: err("enemyKnown") },
    autoDecisionDisagreement: { evals: elig.length, differ: diff, rate: elig.length ? r4(diff / elig.length) : null },
    neverSeen: { evals: withKnown.length, withNever: withKnown.filter((e) => (num(e.enemyKnown.never) ?? 0) > 0).length,
      rate: withKnown.length ? r4(withKnown.filter((e) => (num(e.enemyKnown.never) ?? 0) > 0).length / withKnown.length) : null,
      meanUnseen: r4(mean(withKnown.map((e) => e.enemyKnown.unseen))) },
  };
}

// ---------------------------------------------------------------- S5：計算成本
const BASE_TICK_MS = 2.1, EVALS_PER_TICK = 2 / 10;
function s5(set) {
  const sum = (k) => set.reduce((s, r) => s + (num(r?.cost?.[k]) ?? 0), 0);
  const nEval = sum("evals"), nPath = sum("pathCalls");
  const msEval = nEval ? sum("euclidMs") / nEval : null, msPath = nPath ? sum("pathMs") / nPath : null;
  const tickE = msEval == null ? null : EVALS_PER_TICK * msEval;
  const tickP = msEval == null || msPath == null ? null : EVALS_PER_TICK * (msEval + msPath);
  return { evals: nEval, pathCalls: nPath, msPerEval: r4(msEval), msPerPathCall: r4(msPath),
    perTick: { euclidOnly: { ms: r4(tickE), pctOfBase: tickE == null ? null : r4(100 * tickE / BASE_TICK_MS) },
      withExactPath: { ms: r4(tickP), pctOfBase: tickP == null ? null : r4(100 * tickP / BASE_TICK_MS) } }, baseTickMs: BASE_TICK_MS };
}

// ---------------------------------------------------------------- S6：紅藍對稱
//  出發率＝「自動」下出發的評估數 ÷ 該方全部評估數（含沒目標／沒有帶隊者）
function sideStats(set, side) {
  const ev = set.flatMap(evalsOf).filter((e) => e?.side === side);
  const go = ev.filter((e) => decide(e, "auto", "ratioKnown").go).length;
  return { evals: ev.length, medianRatioKnown1: r4(median(ev.map((e) => at(e.ratioKnown, 0)))), autoGo: go, autoGoRate: ev.length ? r4(go / ev.length) : null };
}

// ---------------------------------------------------------------- S7：路徑係數
function s7(set) {
  const v = set.flatMap(evalsOf).map((e) => num(e?.pathRatio)).filter((x) => x != null);
  return { n: v.length, p50: r4(quantile(v, 0.5)), p90: r4(quantile(v, 0.9)), mean: r4(mean(v)) };
}

// ---------------------------------------------------------------- 陣容：打野英雄分布
function lineups(set) {
  const o = {};
  for (const side of ["blue", "red"]) {
    const ids = set.map((r) => (Array.isArray(r?.lineup?.[side]) ? r.lineup[side] : []).find((x) => typeof x === "string" && x.startsWith("jungle:"))).filter(Boolean).map((x) => x.slice(7));
    const c = Object.entries(countBy(ids)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    o[side] = { matchesWithLineup: ids.length, distinct: c.length, top8: c.slice(0, 8) };
  }
  return o;
}

// ---------------------------------------------------------------- 彙整
const lines = [], G = {};
const L = (prefix, label, detail) => lines.push(`${prefix} ${label}　${JSON.stringify(detail)}`);
L("ℹ", `樣本：${rows.length} 場`, Object.fromEntries(groupNames.map((g) => [g, groups[g].length])));
for (const g of groupNames) {
  const set = groups[g], o = (G[g] = { matches: set.length });
  o.S1 = s1(set); L("S1", `${g} 入侵結果因素（搶到 ${o.S1.n.stolen}／其他 ${o.S1.n.other}）`, o.S1);
}
L("S2", "四種傾向門檻（all 的「搶到」入侵，已知資訊單人戰力比）", S2);
for (const g of groupNames) { G[g].S3 = s3(groups[g]); L("S3", `${g} 門檻下的出發／不出發（已知資訊；full＝完整資訊）`, G[g].S3); }
for (const g of groupNames) { G[g].S4 = s4(groups[g]); L("S4", `${g} 只用已知資訊的代價`, G[g].S4); }
for (const g of groupNames) { G[g].S5 = s5(groups[g]); L("S5", `${g} 計算成本`, G[g].S5); }
if (groups.inv?.length) { G.inv.S6 = { blue: sideStats(groups.inv, "blue"), red: sideStats(groups.inv, "red") }; L("S6", "inv 雙方入侵：藍 vs 紅", G.inv.S6); }
if (groups.AB?.length) { G.AB.S6 = { invader: "blue", ...sideStats(groups.AB, "blue") }; L("S6", "AB 入侵方（藍）", G.AB.S6); }
if (groups.BA?.length) { G.BA.S6 = { invader: "red", ...sideStats(groups.BA, "red") }; L("S6", "BA 入侵方（紅）", G.BA.S6); }
for (const g of groupNames) { G[g].S7 = s7(groups[g]); L("S7", `${g} 實際路徑長 ÷ 直線距離`, G[g].S7); }
for (const g of groupNames) { G[g].lineups = lineups(groups[g]); L("陣容", `${g} 打野英雄分布`, G[g].lineups); }

// ---------------------------------------------------------------- 旗標（以 all 為準）
const A = G.all ?? {};
const flags = {};
{
  const rate = A.S4?.autoDecisionDisagreement?.rate ?? null;
  flags.R1 = { on: rate != null && rate > 0.30, rate, limit: 0.30 };
  const pct = A.S5?.perTick?.euclidOnly?.pctOfBase ?? null;
  flags.R2 = { on: pct != null && pct > 10, perTickPctOfBase: pct, limit: 10 };
  const ended = A.S1?.endedWithEvals ?? 0, rb = A.S1?.factors?.ratioKnown1?.rankBiserial ?? null;
  flags.R3 = { on: ended >= 30 && rb != null && Math.abs(rb) < 0.1, endedWithEvals: ended, rankBiserialRatioKnown1: rb };
  const stolen = A.S1?.n?.stolen ?? 0;
  flags.R4 = { on: ended < 30 || stolen < 10, endedWithEvals: ended, stolen };
}
const FLAG_LABEL = { R1: "資訊模型不可用", R2: "計算太貴", R3: "戰力比沒有預測力", R4: "樣本不足" };
for (const [k, v] of Object.entries(flags)) lines.push(`${v.on ? "🚩" : "✅"} ${k} ${v.on ? "成立" : "不成立"}（${FLAG_LABEL[k]}）　${JSON.stringify(v)}`);
lines.push("ℹ R5 影子不被動：由 shadow_tactic_exec_v24.mjs --selfcheck 檢查，本腳本不判定");

const result = { generatedAt: new Date().toISOString(), rows: rows.length, convention: "ratioKnown[n-1] = party size n", groups: G, S2, flags };
try { if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1)); } catch (err) { console.error(`無法寫入 ${OUT}：${err.message}`); }
for (const l of lines) console.log(l);
process.exit(0);
