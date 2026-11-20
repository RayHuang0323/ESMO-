#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/judge_v24_diag.mjs — 依 review/tactic-book-3a/v24_diag/REGISTRATION.md 判定 D1／D2／D3（2026-11-15；離線）
//  --sideInv=<diag_side_asymmetry --group=inv 的輸出>  --sideAll=<--group=all 的輸出>
//  --diag=<analyze_shadow_v24_diag 的驗證輸出>  --cal=<calibration_analysis.json>  --push=<analyze_task_commit_push_v24 的輸出>
//  判準的數字全部照登記文件；這支只做比較，不改任何門檻。
// ============================================================================
import fs from "node:fs";
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const rd = (k) => { const p = arg(k); return p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };
const SI = rd("sideInv"), SA = rd("sideAll"), DG = rd("diag"), CAL = rd("cal"), PU = rd("push");
const out = [];
const put = (id, ok, detail) => { out.push({ id, ok, detail }); console.log(`${ok === null ? "—" : ok ? "成立" : "不成立"}\t${id}\t${detail}`); };
const ex0 = (s) => s?.ci && (s.ci[0] > 0 || s.ci[1] < 0);

if (SI) {
  const P = SI.propensities;
  put("D1-a", P.auto.role.symmetry.mean > 0 && P.allin.role.symmetry.mean < 0, `auto ${P.auto.role.symmetry.mean} ${JSON.stringify(P.auto.role.symmetry.ci)}  allin ${P.allin.role.symmetry.mean} ${JSON.stringify(P.allin.role.symmetry.ci)}`);
  const gaps = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, +(v.eta.symmetry.mean - v.role.symmetry.mean).toFixed(4)]));
  put("D1-b", Object.values(gaps).every((g) => Math.abs(g) <= 0.01), `eta−role ${JSON.stringify(gaps)}（gate ⑤ 另跑）`);
  const nl = P.auto.role.all.pairedDiff["declined:no_leader"], t0 = SI.timeline;
  const lt = { blue: t0.blue[0].jHpLt065, red: t0.red[0].jHpLt065 };
  put("D1-c", nl.mean < 0 && lt.red > lt.blue, `auto no_leader 藍−紅 ${nl.mean} ${JSON.stringify(nl.ci)}；0–90 秒血量<0.65 藍 ${lt.blue} 紅 ${lt.red}`);
}
if (SA?.templateSwap) {
  const t = SA.templateSwap.allin;
  put("D1-d", t.invaderRed_BA.mean > t.invaderBlue_AB.mean && t.passiveRed_AB.mean > t.passiveBlue_BA.mean,
    `入侵方 紅(BA) ${t.invaderRed_BA.mean} vs 藍(AB) ${t.invaderBlue_AB.mean}；被動方 紅(AB) ${t.passiveRed_AB.mean} vs 藍(BA) ${t.passiveBlue_BA.mean}`);
}
if (DG && CAL) {
  const ks = DG.config.order;
  const tr = ks.map((k) => { const c = CAL.propensities[k].layers.L3.startsPerSideMatch.mean, v = DG.propensities[k].layers.L3.startsPerSideMatch.mean; return { k, c, v, ok: v >= c * 0.75 && v <= c * 1.25 }; });
  put("D2-1", tr.every((x) => x.ok), tr.map((x) => `${x.k} ${x.v}（校準 ${x.c}，範圍 ${(x.c * 0.75).toFixed(2)}–${(x.c * 1.25).toFixed(2)}）${x.ok ? "" : " ✗"}`).join("；"));
  const pr = DG.pairedL3.filter((p) => p.to !== "allin");
  put("D2-2", pr.every((p) => p.startsPerMatch.ci && p.startsPerMatch.ci[0] > 0), pr.map((p) => `${p.from}→${p.to} ${p.startsPerMatch.mean} ${JSON.stringify(p.startsPerMatch.ci)}`).join("；"));
  const ir = ["auto", "aggressive", "allin"].map((k) => { const L = DG.propensities[k].layers; const a = L.L3.interruptedShare, b = L.L0.interruptedShare; return { k, a, b, ok: a <= 0.35 && a <= 0.7 * b }; });
  put("D2-3", ir.every((x) => x.ok), ir.map((x) => `${x.k} L3 ${x.a}／L0 ${x.b}（上限 ${Math.min(0.35, 0.7 * x.b).toFixed(3)}）${x.ok ? "" : " ✗"}`).join("；"));
  put("D2-4", null, `自動：L0 判出發時打野的任務 ${JSON.stringify(DG.propensities.auto.junglerTaskAtL0Go.share)}`);
  const fl = ks.map((k) => { const s = DG.propensities[k].symmetryL3; return { k, s, flag: ex0(s) && Math.abs(s.mean) >= 0.3 }; });
  put("D2-5", null, `亮旗：${fl.filter((x) => x.flag).map((x) => x.k).join("、") || "無"}；` + fl.map((x) => `${x.k} ${x.s.mean} ${JSON.stringify(x.s.ci)}`).join("；"));
  put("D2-integrity", DG.integrity.arbErrors === 0 && DG.integrity.evalsMissingArb === 0 && DG.integrity.rowsMissingTimeline === 0, JSON.stringify(DG.integrity));
}
if (PU) {
  for (const [g, b] of Object.entries(PU.byGroup)) {
    const m = b.stateLanePushPerHeroMin;
    put(`D3-1 ${g}`, m.diff.ci && m.diff.ci[1] < 0, `對線↔推進 每英雄分鐘 ${m.off?.toFixed?.(3)} → ${m.on?.toFixed?.(3)}，Δ ${m.diff.mean} ${JSON.stringify(m.diff.ci)}`);
  }
  put("D3-2", null, `承諾改寫每場 off ${PU.all.commitPerMatch.off} → on ${PU.all.commitPerMatch.on}；覆寫值 ${JSON.stringify(PU.all.overrideSeen)}`);
  for (const [g, b] of [["all", PU.all], ...Object.entries(PU.byGroup)]) {
    const d = b.durationMin, st = b.stuckPerMatch, tw = b.towersLostTotal;
    const flags = [];
    if (d.diff.ci && d.diff.ci[0] > 0 && d.relChange > 0.05) flags.push("①時長");
    if (st.diff.ci && st.diff.ci[0] > 0) flags.push("②卡住");
    if (b.durationOver35.on - b.durationOver35.off >= 3) flags.push("③>35分");
    if (b.over.on < b.over.off) flags.push("④未打完");
    if (tw.diff.ci && tw.diff.ci[1] < 0) flags.push("⑤拆塔減少");
    put(`D3-3 ${g}`, null, `副作用旗：${flags.join("、") || "無"}｜時長 ${d.off?.toFixed?.(2)}→${d.on?.toFixed?.(2)} 分 Δ ${d.diff.mean} ${JSON.stringify(d.diff.ci)}；卡住 Δ ${st.diff.mean} ${JSON.stringify(st.diff.ci)}；>35 分 ${b.durationOver35.off}→${b.durationOver35.on}；最長 ${b.durationMax.off}→${b.durationMax.on}；拆塔 Δ ${tw.diff.mean} ${JSON.stringify(tw.diff.ci)}；勝方改變 ${b.winnerChanged}/${b.pairs}`);
  }
}
const o = arg("out"); if (o) fs.writeFileSync(o, JSON.stringify(out, null, 1));
