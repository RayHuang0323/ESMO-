#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/analyze_shadow_v24_diag.mjs — 目標價值、冷卻、任務仲裁的影子定義（2026-11-15，診斷 Sprint；離線）
//
//  輸入：--dir=<shadow_tactic_exec_v24_diag.mjs 的批次資料夾>  --config=<diag_config.json>  [--out=<json>]
//  每筆評估、每個傾向，依序套四層（每一層都在前一層之上）：
//    L0 門檻   Sprint 0.5 登記的 decide()（tools/lib/shadowDecideV24.mjs，partyOrder="role"）
//    L1 仲裁   ev.invading（現行引擎的入侵進行中）⇒ hold（不是新的出發）；
//              打野這一刻贏的任務 ∈ arbitration.busyJungle ⇒ declined:busy:<任務>；
//              arbitration.blockObjGo 而且本隊物件窗開著 ⇒ declined:objective；
//              arbitration.blockObjAlive 而且龍或巴龍存活 ⇒ declined:objective_alive；
//              隊友這一刻贏的任務 ∈ arbitration.busyHelper ⇒ 那名隊友視為不可用，再跑一次 decide()
//    L2 價值   一般營地（非 Buff）只在 etaJ ≤ value.campEtaMax 時值得去 ⇒ 否則 declined:low_value
//    L3 冷卻   每邊：出發（start）之後 cooldown[傾向] 秒內不再出發；這段時間內的 go 記成 hold
//  起點的定義：
//    L0～L2 的「段」＝連續 go 的評估（與 Sprint 0.5 的「機會段」相同）；每段的第一筆算一次出發。
//    L3 的出發＝冷卻外的 go。
//  被打斷（預測）：出發時刻 t0 之後 (t0, t0+H]，H＝min(etaJ＋horizon.clearSec, horizon.capSec)，
//    打野的任務時間線（jTimeline）出現 horizon.preempt 裡的任務（或陣亡）⇒ 記成被那個任務打斷。
//    這是代理指標：現行引擎沒有這個行為，所以量的是「那段時間打野實際被什麼更高優先的事占住」。
//  評估只到 600 秒（影子工具的 EVAL_UNTIL），所以「每場」都是開局 10 分鐘內。
// ============================================================================
import fs from "node:fs";
import { decide, loadRows, summ, excludes0, r3 } from "../lib/shadowDecideV24.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir", null), CONFIG = arg("config", null), OUT = arg("out", null);
if (!DIR || !CONFIG) { console.error("need --dir and --config"); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const rows = await loadRows(DIR);
const GROUPS = [...new Set(rows.map((r) => r.group))].sort();
const SIDES = ["blue", "red"];
const LAYERS = ["L0", "L1", "L2", "L3"];
const order = cfg.order;
const A = cfg.arbitration, V = cfg.value, H = cfg.horizon;
const busyJ = new Set(A.busyJungle), busyH = new Set(A.busyHelper), preempt = new Set(H.preempt);
const share = (n, d) => (d ? r3(n / d) : null);

/** 一筆評估在第 k 層之前（L0～L2）的決策。 */
function decideLayer(ev, P, layer) {
  const d0 = decide(ev, P, "known");
  if (layer === "L0") return d0;
  if (ev.noTarget) return d0;
  if (ev.invading) return { d: "hold:invading" };
  const jb = ev.arb?.jungle;
  if (jb && busyJ.has(jb)) return { d: `declined:busy:${jb}` };
  if (A.blockObjGo && ev.objGo === 1) return { d: "declined:objective" };
  //  物件存活（龍或巴龍已重生、還沒被打掉）：物件的重生是公開資訊；校準資料上這時判出發有八成會被物件窗打斷。
  if (A.blockObjAlive && (ev.dragon === 1 || ev.baron === 1)) return { d: "declined:objective_alive" };
  let d1 = d0;
  if (ev.arb && (ev.cands ?? []).some((c) => c[0] !== "jungle" && busyH.has(ev.arb[c[0]]))) {
    const ev2 = { ...ev, cands: ev.cands.map((c) => (c[0] !== "jungle" && busyH.has(ev.arb[c[0]]) ? [c[0], 0, ...c.slice(2)] : c)) };
    d1 = decide(ev2, P, "known");
    if (d1.d === "declined:no_party" && d0.d === "go") d1 = { d: "declined:busy_party" };
  }
  if (layer === "L1") return d1;
  if (d1.d !== "go") return d1;
  if (ev.tgtBuff !== 1 && !(ev.etaJ <= V.campEtaMax)) return { d: "declined:low_value" };
  return d1;
}

function interruptedBy(r, S, t0, etaJ) {
  const h = Math.min((etaJ ?? 0) + H.clearSec, H.capSec), tl = r.jTimeline?.[S] ?? [];
  for (const [t, code] of tl) { if (t <= t0) continue; if (t > t0 + h) break; if (code === "dead" || preempt.has(code)) return code; }
  return null;
}

/** 每場、每邊的出發清單與決策統計。 */
function perMatch(r, P, layer, cooldown) {
  const out = { blue: null, red: null };
  for (const S of SIDES) {
    const idx = r.evals.map((ev, i) => [ev, i]).filter(([ev]) => ev.side === S);
    const dec = idx.map(([ev]) => decideLayer(ev, P, layer === "L3" ? "L2" : layer));
    const starts = []; let goEvals = 0, holdCd = 0, prevGo = false, nextAllowed = -Infinity;
    const reasons = {};
    idx.forEach(([ev], j) => {
      const d = dec[j];
      if (d.d === "go") goEvals++; else reasons[d.d] = (reasons[d.d] ?? 0) + 1;
      if (layer === "L3") {
        if (d.d === "go") { if (ev.t >= nextAllowed) { starts.push({ t: ev.t, n: d.n, etaJ: ev.etaJ, buff: ev.tgtBuff }); nextAllowed = ev.t + cooldown; } else holdCd++; }
      } else {
        if (d.d === "go" && !prevGo) starts.push({ t: ev.t, n: d.n, etaJ: ev.etaJ, buff: ev.tgtBuff });
        prevGo = d.d === "go";
      }
    });
    for (const s of starts) s.intr = interruptedBy(r, S, s.t, s.etaJ);
    out[S] = { evals: idx.length, goEvals, holdCd, starts, reasons };
  }
  return out;
}

function layerMetrics(rs, P, layer, cooldown) {
  const pm = rs.map((r) => perMatch(r, P, layer, cooldown));
  const perSide = pm.flatMap((m) => SIDES.map((S) => m[S]));
  const startsAll = perSide.flatMap((x) => x.starts);
  const intr = {}; for (const s of startsAll) if (s.intr) intr[s.intr] = (intr[s.intr] ?? 0) + 1;
  const reasons = {}; for (const x of perSide) for (const [k, v] of Object.entries(x.reasons)) reasons[k] = (reasons[k] ?? 0) + v;
  const sizes = {}; for (const s of startsAll) sizes[s.n] = (sizes[s.n] ?? 0) + 1;
  //  分邊：每場每邊的平均原因碼次數與出發次數（看紅藍差在哪一層、哪個原因碼放大）
  const bySide = {};
  for (const S of SIDES) {
    const xs = pm.map((m) => m[S]), n = xs.length || 1, rs = {};
    for (const x of xs) for (const [k, v] of Object.entries(x.reasons)) rs[k] = (rs[k] ?? 0) + v;
    bySide[S] = { startsPerMatch: r3(xs.reduce((s, x) => s + x.starts.length, 0) / n), goEvalsPerMatch: r3(xs.reduce((s, x) => s + x.goEvals, 0) / n),
      reasonsPerMatch: Object.fromEntries(Object.entries(rs).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r3(v / n)])) };
  }
  return {
    goEvalsPerSideMatch: summ(perSide.map((x) => x.goEvals)),
    startsPerSideMatch: summ(perSide.map((x) => x.starts.length)),
    startsAfter90PerSideMatch: summ(perSide.map((x) => x.starts.filter((s) => s.t > 90).length)),
    interruptedShare: share(startsAll.filter((s) => s.intr).length, startsAll.length), interruptedBy: intr, starts: startsAll.length,
    buffShareOfStarts: share(startsAll.filter((s) => s.buff === 1).length, startsAll.length),
    sizeShare: Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, share(v, startsAll.length)])),
    holdCooldownPerSideMatch: layer === "L3" ? summ(perSide.map((x) => x.holdCd)) : null,
    reasons, bySide,
    _pm: pm,
  };
}
const strip = ({ _pm, ...rest }) => rest;

const result = { tool: "analyze_shadow_v24_diag", dir: DIR, matches: rows.length, groups: GROUPS, config: cfg, propensities: {} };
//  完整性：觀測器錯誤、缺欄位
result.integrity = {
  arbErrors: rows.reduce((s, r) => s + (r.arb?.errors ?? 0), 0),
  evalsMissingArb: rows.reduce((s, r) => s + r.evals.filter((ev) => !ev.noTarget && !ev.arb).length, 0),
  rowsMissingTimeline: rows.filter((r) => !r.jTimeline).length,
};
//  L0 go 的那一刻，打野在做什麼（「通過評估卻不可能執行」的直接量）
function busyAtGo(P) {
  const c = {}; let n = 0;
  for (const r of rows) for (const ev of r.evals) { if (decide(ev, P, "known").d !== "go") continue; n++; const k = ev.invading ? "invading" : ev.arb?.jungle ?? "none"; c[k] = (c[k] ?? 0) + 1; }
  return { goEvals: n, share: Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, share(v, n)])) };
}
const pmCache = {};
for (const k of order) {
  const P = cfg.propensities[k], cd = cfg.cooldown[k];
  const blk = { cooldown: cd, junglerTaskAtL0Go: busyAtGo(P), layers: {}, byGroupL3: {}, symmetryL3: null };
  for (const L of LAYERS) { const m = layerMetrics(rows, P, L, cd); blk.layers[L] = strip(m); if (L === "L3") pmCache[k] = m._pm; }
  for (const g of GROUPS) blk.byGroupL3[g] = strip(layerMetrics(rows.filter((r) => r.group === g), P, "L3", cd));
  //  紅藍：inv 組每場（藍 starts − 紅 starts）
  const inv = rows.map((r, i) => [r, i]).filter(([r]) => r.group === "inv");
  const sym = summ(inv.map(([, i]) => pmCache[k][i].blue.starts.length - pmCache[k][i].red.starts.length));
  blk.symmetryL3 = { ...sym, ciExcludes0: excludes0(sym) };
  result.propensities[k] = blk;
}
//  相鄰傾向的配對差（L3 每場兩邊合計的出發數）
result.pairedL3 = [];
for (let i = 1; i < order.length; i++) {
  const a = pmCache[order[i - 1]], b = pmCache[order[i]];
  const s = summ(rows.map((_, j) => (b[j].blue.starts.length + b[j].red.starts.length) - (a[j].blue.starts.length + a[j].red.starts.length)));
  result.pairedL3.push({ from: order[i - 1], to: order[i], startsPerMatch: { ...s, ciExcludes0: excludes0(s) } });
}

const f = (s) => (s?.mean == null ? "-" : `${s.mean} [${s.ci?.[0]},${s.ci?.[1]}]`);
process.stderr.write(`matches=${rows.length} integrity=${JSON.stringify(result.integrity)}\n`);
for (const k of order) {
  const B = result.propensities[k];
  process.stderr.write(`${k}  (cooldown ${B.cooldown}s)\n`);
  for (const L of LAYERS) { const m = B.layers[L]; process.stderr.write(`   ${L} go/side ${f(m.goEvalsPerSideMatch).padEnd(24)} starts/side ${f(m.startsPerSideMatch).padEnd(22)} intr ${m.interruptedShare}\n`); }
  process.stderr.write(`   sym(L3 starts, inv) ${f(B.symmetryL3)}${B.symmetryL3.ciExcludes0 ? " *" : ""}\n`);
}
const text = JSON.stringify(result);
if (OUT) fs.writeFileSync(OUT, text);
console.log(text.length > 4000 ? JSON.stringify({ ok: true, out: OUT, bytes: text.length }) : text);
