#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_side_asymmetry_v24.mjs — 自適應入侵門檻紅藍不對稱的診斷（2026-11-15；離線，只讀影子紀錄）
//
//  輸入：--dir=<影子批次資料夾>（shadow_tactic_exec_v24_s05.mjs 的輸出）  --config=<propensity_config.json>
//        [--group=inv]（預設只看雙方入侵組：同模板、鏡像陣容，紅藍唯一的差別是邊）  [--out=<json>]
//  輸出（每個傾向）：
//   A 漏斗：每場、每邊，各個不出發原因占評估的比例；藍 − 紅 的配對差（95% 區間）。
//     出發率的差＝ −Σ（各原因占比的差），所以這張表就是不對稱的分解。
//   B 條件通過率：到達該關卡的評估中，通過的比例（藍、紅）。
//   C 目標營地：鏡像營地類別（buff／a／b）每邊被選中的比例、各自的出發率。
//   D 編隊角色：出發時的角色組合（每邊）。
//   E 反事實：成員改依到場時間排序（partyOrder="eta"）後的紅藍差。
//   F 原始因子：打野可用、血量、到場時間、威脅人數的分布（每邊）。
//   G 對局本身：勝方、時長（每邊），看是不是上游的戰況不對稱。
//  被動：不跑對局、不 import 引擎。
// ============================================================================
import fs from "node:fs";
import { decide, membersOf, threatCount, loadRows, summ, excludes0, r3, popcount } from "../lib/shadowDecideV24.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir", null), CONFIG = arg("config", null), OUT = arg("out", null), GROUP = arg("group", "inv");
if (!DIR || !CONFIG) { console.error("need --dir and --config"); process.exit(2); }

const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const all = await loadRows(DIR);
const rows = GROUP === "all" ? all : all.filter((r) => r.group === GROUP);
const SIDES = ["blue", "red"];
const CAMP_CLASS = (id) => (id == null ? null : id.endsWith("_buff") ? "buff" : id.endsWith("_a") ? "a" : id.endsWith("_b") ? "b" : "?");
const OUTCOMES = ["go", "declined:no_target", "declined:no_leader", "declined:too_far", "declined:no_party", "declined:threat", "declined:lane_cost"];
const GATES = ["no_target", "no_leader", "too_far", "no_party", "threat_or_lane"];
const q = (xs, p) => { xs = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); if (!xs.length) return null; const i = (xs.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return r3(xs[lo] + (xs[hi] - xs[lo]) * (i - lo)); };
const quart = (xs) => ({ n: xs.filter((x) => x != null).length, p10: q(xs, 0.1), p25: q(xs, 0.25), p50: q(xs, 0.5), p75: q(xs, 0.75), p90: q(xs, 0.9) });
const share = (n, d) => (d ? r3(n / d) : null);

function sideShares(r, dec, S, filt = () => true) {
  const o = Object.fromEntries(OUTCOMES.map((k) => [k, 0])); let n = 0;
  r.evals.forEach((ev, i) => { if (ev.side !== S || !filt(ev)) return; n++; o[dec[i].d]++; });
  return { n, share: Object.fromEntries(OUTCOMES.map((k) => [k, n ? o[k] / n : null])) };
}

function analyzeProp(name, P, partyOrder) {
  const decOf = new Map(rows.map((r) => [r, r.evals.map((ev) => decide(ev, P, "known", { partyOrder }))]));
  const res = { partyOrder };
  //  A 漏斗＋配對差（全部時段、t<=90、t>90）
  for (const [label, filt] of [["all", () => true], ["tLe90", (ev) => ev.t <= 90], ["tGt90", (ev) => ev.t > 90]]) {
    const blk = { bySide: {}, pairedDiff: {} };
    for (const S of SIDES) {
      const tot = Object.fromEntries(OUTCOMES.map((k) => [k, 0])); let n = 0;
      for (const r of rows) r.evals.forEach((ev, i) => { if (ev.side !== S || !filt(ev)) return; n++; tot[decOf.get(r)[i].d]++; });
      blk.bySide[S] = { evals: n, share: Object.fromEntries(OUTCOMES.map((k) => [k, share(tot[k], n)])) };
    }
    for (const k of OUTCOMES) {
      const s = summ(rows.map((r) => { const b = sideShares(r, decOf.get(r), "blue", filt), d = sideShares(r, decOf.get(r), "red", filt); return b.n && d.n ? b.share[k] - d.share[k] : null; }));
      blk.pairedDiff[k] = { ...s, ciExcludes0: excludes0(s) };
    }
    res[label] = blk;
  }
  //  B 條件通過率
  res.conditional = {};
  for (const S of SIDES) {
    const reach = Object.fromEntries(GATES.map((g) => [g, 0])), pass = Object.fromEntries(GATES.map((g) => [g, 0]));
    for (const r of rows) r.evals.forEach((ev, i) => {
      if (ev.side !== S) return;
      const d = decOf.get(r)[i].d;
      const stop = d === "go" ? 99 : d === "declined:no_target" ? 0 : d === "declined:no_leader" ? 1 : d === "declined:too_far" ? 2 : d === "declined:no_party" ? 3 : 4;
      GATES.forEach((g, gi) => { if (stop >= gi) { reach[g]++; if (stop > gi) pass[g]++; } });
    });
    res.conditional[S] = Object.fromEntries(GATES.map((g) => [g, { reached: reach[g], passShare: share(pass[g], reach[g]) }]));
  }
  //  C 目標營地類別
  res.targetClass = {};
  for (const S of SIDES) {
    const c = {}; let n = 0;
    for (const r of rows) r.evals.forEach((ev, i) => {
      if (ev.side !== S || ev.noTarget) return;
      n++; const k = CAMP_CLASS(ev.targetId); (c[k] ??= { evals: 0, go: 0 }); c[k].evals++; if (decOf.get(r)[i].d === "go") c[k].go++;
    });
    res.targetClass[S] = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { evalShare: share(v.evals, n), goRate: share(v.go, v.evals), evals: v.evals }]));
  }
  //  D 編隊角色
  res.partyRoles = {};
  for (const S of SIDES) {
    const c = {}; let n = 0;
    for (const r of rows) r.evals.forEach((ev, i) => { const d = decOf.get(r)[i]; if (ev.side !== S || d.d !== "go") return; n++; const k = d.roles.join("+"); c[k] = (c[k] ?? 0) + 1; });
    res.partyRoles[S] = Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, share(v, n)]));
  }
  //  對稱（與登記分析器相同的定義：每場 藍 goRate − 紅 goRate）
  const sym = summ(rows.map((r) => {
    const b = sideShares(r, decOf.get(r), "blue"), d = sideShares(r, decOf.get(r), "red");
    return b.n && d.n ? b.share.go - d.share.go : null;
  }));
  res.symmetry = { ...sym, ciExcludes0: excludes0(sym) };
  return res;
}

//  F 原始因子（與傾向無關）
function factors() {
  const out = {};
  for (const S of SIDES) {
    const evs = rows.flatMap((r) => r.evals.filter((ev) => ev.side === S && !ev.noTarget));
    const helper = (role) => quart(evs.map((ev) => { const c = (ev.cands ?? []).find((x) => x[0] === role); return c && c[1] === 1 ? r3(c[2] - ev.etaJ) : null; }));
    const helperAvail = (role) => share(evs.filter((ev) => (ev.cands ?? []).some((x) => x[0] === role && x[1] === 1)).length, evs.length);
    const T = [0, 0, 0, 0, 0, 0];
    for (const ev of evs) T[Math.min(5, threatCount(ev, { threat: "prior" }))]++;
    out[S] = {
      evals: evs.length,
      jAvail: share(evs.filter((ev) => ev.jAvail === 1).length, evs.length),
      jHp: quart(evs.map((ev) => ev.jHp)), etaJ: quart(evs.map((ev) => ev.etaJ)),
      etaJ_whenAvail: quart(evs.filter((ev) => ev.jAvail === 1).map((ev) => ev.etaJ)),
      threatPrior: T.map((x) => share(x, evs.length)),
      ejPriorOn: share(evs.filter((ev) => (threatCount(ev, { threat: "prior" }) > 0)).length, evs.length),
      helperEtaMinusEtaJ: { mid: helper("mid"), sup: helper("sup"), top: helper("top") },
      helperAvail: { mid: helperAvail("mid"), sup: helperAvail("sup"), top: helperAvail("top") },
      laneCost: { mid: share(evs.filter((ev) => (ev.cands ?? []).some((x) => x[0] === "mid" && x[5] === 1)).length, evs.length),
        sup: share(evs.filter((ev) => (ev.cands ?? []).some((x) => x[0] === "sup" && x[5] === 1)).length, evs.length),
        top: share(evs.filter((ev) => (ev.cands ?? []).some((x) => x[0] === "top" && x[5] === 1)).length, evs.length) },
    };
  }
  return out;
}

//  G 對局本身
function matches() {
  const w = { blue: 0, red: 0, none: 0 };
  for (const r of rows) w[r.winner ?? "none"] = (w[r.winner ?? "none"] ?? 0) + 1;
  const jStarts = Object.fromEntries(SIDES.map((S) => [S, summ(rows.map((r) => (r.invasionStarts ?? []).filter((x) => x.role === "jungle" && x.side === S).length))]));
  const jEnds = {};
  for (const S of SIDES) { const c = {}; for (const r of rows) for (const x of r.invasionEnds ?? []) if (x.role === "jungle" && x.side === S) c[x.reason] = (c[x.reason] ?? 0) + 1; jEnds[S] = c; }
  return { n: rows.length, winners: w, blueWinShare: share(w.blue, rows.length), meanDuration: summ(rows.map((r) => r.duration)), junglerInvasionStarts: jStarts, junglerInvasionEnds: jEnds };
}

//  H 打野狀態隨時間（每邊）：可用比例、血量中位數、目標是 Buff 的比例
const TIME_BINS = [[0, 90], [90, 180], [180, 300], [300, 450], [450, 600]];
function timeline() {
  const out = {};
  for (const S of SIDES) {
    out[S] = TIME_BINS.map(([a, b]) => {
      const evs = rows.flatMap((r) => r.evals.filter((ev) => ev.side === S && !ev.noTarget && ev.t > a && ev.t <= b));
      return { bin: `${a}-${b}`, evals: evs.length, jAvail: share(evs.filter((ev) => ev.jAvail === 1).length, evs.length),
        jHpP50: q(evs.map((ev) => ev.jHp), 0.5), jHpLt065: share(evs.filter((ev) => ev.jHp < 0.65).length, evs.length),
        etaJP50: q(evs.map((ev) => ev.etaJ), 0.5), buffShare: share(evs.filter((ev) => CAMP_CLASS(ev.targetId) === "buff").length, evs.length) };
    });
  }
  return out;
}
//  I 換邊對照（只在 --group=all 且有 AB／BA 時）：同一個入侵模板放在藍方（AB）與紅方（BA）
function templateSwap(P, partyOrder = "role") {
  const pick = (g, S) => {
    const rs = all.filter((r) => r.group === g);
    return summ(rs.map((r) => { const dec = r.evals.map((ev) => decide(ev, P, "known", { partyOrder })); const s = sideShares(r, dec, S); return s.n ? s.share.go : null; }));
  };
  return { invaderBlue_AB: pick("AB", "blue"), invaderRed_BA: pick("BA", "red"), passiveRed_AB: pick("AB", "red"), passiveBlue_BA: pick("BA", "blue") };
}

const order = cfg.order ?? Object.keys(cfg.propensities);
const result = { tool: "diag_side_asymmetry_v24", dir: DIR, group: GROUP, matches: rows.length, factors: factors(), matchFacts: matches(), timeline: timeline(), propensities: {} };
for (const k of order) result.propensities[k] = { role: analyzeProp(k, cfg.propensities[k], "role"), eta: analyzeProp(k, cfg.propensities[k], "eta") };
if (all.some((r) => r.group === "AB") && all.some((r) => r.group === "BA")) result.templateSwap = Object.fromEntries(order.map((k) => [k, templateSwap(cfg.propensities[k])]));

//  人看的摘要（stderr）
const f = (s) => (s?.mean == null ? "-" : `${s.mean >= 0 ? "+" : ""}${s.mean} [${s.ci?.[0]},${s.ci?.[1]}]${s.ciExcludes0 ? " *" : ""}`);
process.stderr.write(`group=${GROUP} matches=${rows.length}  blueWin=${result.matchFacts.blueWinShare}\n`);
for (const k of order) {
  const R = result.propensities[k];
  process.stderr.write(`${k.padEnd(13)} sym(role) ${f(R.role.symmetry).padEnd(30)} sym(eta) ${f(R.eta.symmetry)}\n`);
  for (const o of OUTCOMES.slice(1)) { const d = R.role.all.pairedDiff[o]; if (d.mean != null && Math.abs(d.mean) >= 0.005) process.stderr.write(`   ${o.padEnd(22)} blue-red ${f(d)}\n`); }
}
const text = JSON.stringify(result);
if (OUT) fs.writeFileSync(OUT, text);
console.log(text.length > 4000 ? JSON.stringify({ ok: true, out: OUT, bytes: text.length }) : text);
