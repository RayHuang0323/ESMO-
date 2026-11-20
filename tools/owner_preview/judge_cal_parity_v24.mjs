#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/judge_cal_parity_v24.mjs — v24 Calibration Sprint 正式判定（S16_REGISTRATION.md §3、§4；離線、唯讀；2026-11-20）
//
//  自然對局（--natural=<資料夾>）：工具無天賦、工具有天賦、生涯三者分開判定，不合併。
//   S2-A／S2-C：s2_contract_v2.judgePath（登記的場數到齊才給 PASS／FAIL，否則 NOT_JUDGED）
//   S5：與 judge_tactic_exec_v24 相同——每場兩邊都算的配對差（v1.3 − off），shadowDecideV24.summ 的區間（t 臨界值；原工具的區間取到小數 3 位，這裡照原樣）
//   S6：與 judge_tactic_exec_v24 相同——（自家營＋敵方營）配對差，平均 ± 1.96 × 標準差 ÷ √n（未四捨五入）
//  壓力（--stress=<資料夾>）：E7、E2（工具）、E3 照登記判定；佈局／陣營／模板／版本效果只報。
//  用法：node tools/owner_preview/judge_cal_parity_v24.mjs --natural=<dir> --stress=<dir> --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { judgePath } from "./s2_contract_v2.mjs";
import { summ } from "../lib/shadowDecideV24.mjs";
import { wilson, verdictE7 } from "./closure_verdicts_v24.mjs";
import { COMBOS, effectiveSeeds } from "./stress_parity_e7_v24.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const NAT = arg("natural"), STR = arg("stress"), OUT = arg("out");
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
export const NATURAL_STRATA = Object.freeze({
  tool: { cells: ["tool_inv", "tool_AB", "tool_BA"], expected: 150 },
  tool_talents: { cells: ["tal_inv"], expected: 50 },
  career: { cells: ["career_low", "career_mid", "career_high"], expected: 240 },
});
export const STRESS_TARGET = 75;
const J = { registration: "review/tactic-book-3a/v24_calibration/S16_REGISTRATION.md" };

if (NAT) {
  J.natural = {};
  for (const [name, S] of Object.entries(NATURAL_STRATA)) {
    const v13 = S.cells.flatMap((c) => jsonl(path.join(NAT, `${c}_v13.jsonl`)).map((r) => ({ ...r, cell: c }))), off = S.cells.flatMap((c) => jsonl(path.join(NAT, `${c}_off.jsonl`)).map((r) => ({ ...r, cell: c })));
    const envOk = [...v13, ...off].every((r) => r.desc?.skills && r.desc?.passives && r.desc?.curve && r.desc?.talents === (name !== "tool"));
    const s2rows = v13.map((r) => ({ path: r.path, seed: r.seed, te: r.obs }));
    const complete = v13.length === S.expected && off.length === S.expected && envOk;
    const s2 = s2rows.length ? judgePath(s2rows, { registered: complete }) : null;
    //  S5／S6：同 Seed、同格、兩邊都算
    const offBy = new Map(off.map((r) => [`${r.cell}|${r.seed}`, r])), dDeaths = [], dTower = [], dCamps = [];
    for (const r of v13) { const o = offBy.get(`${r.cell}|${r.seed}`); if (!o) continue; for (const side of ["blue", "red"]) { dDeaths.push(r.stats[side].deaths - o.stats[side].deaths); dTower.push(r.stats[side].towerDeaths - o.stats[side].towerDeaths); dCamps.push((r.stats[side].ownCampKills + r.stats[side].enemyCampKills) - (o.stats[side].ownCampKills + o.stats[side].enemyCampKills)); } }
    const de = summ(dDeaths), td = summ(dTower);
    const n = dCamps.length, m = n ? dCamps.reduce((s, x) => s + x, 0) / n : NaN, sd = n > 1 ? Math.sqrt(dCamps.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) : NaN, hw = (1.96 * sd) / Math.sqrt(n);
    const judged = complete ? "REGISTERED" : "NOT_JUDGED";
    J.natural[name] = { matches: { v13: v13.length, off: off.length, expected: S.expected }, envVerified: envOk, mode: judged,
      S2A: s2 && { starts: s2.A.starts, arrived: s2.A.arrived, value: r3(s2.A.value), ci: s2.A.ci.map(r3), ciRaw: s2.A.ci, verdict: s2.A.verdict },
      S2C: s2 && { sides: s2.C.sides, c1: r3(s2.C.c1), c2: r3(s2.C.c2), c1Ci: s2.C.c1Ci.map(r3), c2Ci: s2.C.c2Ci.map(r3), verdict: s2.C.verdict },
      S5: { towerDeaths: td, deaths: de, verdict: complete ? (td.ci && de.ci && td.ci[1] <= 0.3 && de.ci[1] <= 1.0 ? "PASS" : "FAIL") : "NOT_JUDGED" },
      S6: { n, mean: r3(m), ci: [r3(m - hw), r3(m + hw)], ciRaw: [m - hw, m + hw], verdict: complete ? (m - hw >= -1.0 ? "PASS" : "FAIL") : "NOT_JUDGED" } };
  }
}
if (STR) {
  const rows = jsonl(path.join(STR, "stress.jsonl")), eff = effectiveSeeds(rows), effSet = new Set(eff);
  const E = rows.filter((r) => effSet.has(r.seed));
  const envOk = E.every((r) => r.desc?.skills && r.desc?.passives && r.desc?.curve && !r.desc?.talents && r.desc?.layout === r.layout && r.desc?.variant === r.variant);
  const s13 = E.filter((r) => r.arm === "s13"), s12 = E.filter((r) => r.arm === "s12"), fin = s13.filter((r) => r.over), blue = fin.filter((r) => r.winner === "blue").length;
  const complete = eff.length === STRESS_TARGET && envOk;
  const e7ci = wilson(blue, fin.length), e2ci = wilson(fin.length, s13.length);
  const rate = (l) => { const f = l.filter((r) => r.over); return { finished: f.length, blue: f.filter((r) => r.winner === "blue").length, rate: r3(f.filter((r) => r.winner === "blue").length / Math.max(1, f.length)), ci95: wilson(f.filter((r) => r.winner === "blue").length, f.length).map(r3) }; };
  const by = (arm) => Object.fromEntries(["AB", "BA"].flatMap((c) => ["STANDARD", "SWAPPED"].map((L) => [`${c}|${L}`, rate(E.filter((r) => r.arm === arm && r.cfg === c && r.layout === L))])));
  const get = (seed, cfg, layout, arm) => E.find((r) => r.seed === seed && r.cfg === cfg && r.layout === layout && r.arm === arm);
  const bw = (r) => (r?.over ? (r.winner === "blue" ? 1 : 0) : null);
  //  佈局效果：同 Seed、同配置、v1.3；STANDARD − SWAPPED（兩場都完賽）
  const layoutD = []; for (const s of eff) for (const c of ["AB", "BA"]) { const a = bw(get(s, c, "STANDARD", "s13")), b = bw(get(s, c, "SWAPPED", "s13")); if (a != null && b != null) layoutD.push(a - b); }
  const P = (arm, cfg, layout) => { const l = E.filter((r) => r.arm === arm && r.cfg === cfg && (!layout || r.layout === layout) && r.over); return l.filter((r) => r.winner === "blue").length / Math.max(1, l.length); };
  const sideEff = (arm, layout) => r3((P(arm, "AB", layout) + P(arm, "BA", layout)) / 2 - 0.5), tplEff = (arm, layout) => r3((P(arm, "AB", layout) - P(arm, "BA", layout)) / 2);
  //  版本效果：同 Seed／配置／佈局，兩版都完賽
  let bb = 0, br = 0, rb = 0, rr = 0, unf12 = 0, unf13 = 0;
  for (const s of eff) for (const c of ["AB", "BA"]) for (const L of ["STANDARD", "SWAPPED"]) { const a = get(s, c, L, "s12"), b = get(s, c, L, "s13"); if (!a?.over) unf12++; if (!b?.over) unf13++; if (!a?.over || !b?.over) continue; const k = (a.winner === "blue" ? "b" : "r") + (b.winner === "blue" ? "b" : "r"); if (k === "bb") bb++; else if (k === "br") br++; else if (k === "rb") rb++; else rr++; }
  const noWave = s13.reduce((a, r) => a + (r.noWaveHits ?? 0), 0), hits = s13.reduce((a, r) => a + (r.nexusHits ?? 0), 0);
  J.stress = { seedsWalked: new Set(rows.map((r) => r.seed)).size, effectiveSeeds: eff.length, target: STRESS_TARGET, envVerified: envOk, mode: complete ? "REGISTERED" : "NOT_JUDGED",
    E7: { finished: fin.length, blueWins: blue, rate: r3(blue / Math.max(1, fin.length)), ci95: e7ci.map(r3), ciRaw: e7ci, verdict: complete ? verdictE7(e7ci) : "NOT_JUDGED" },
    E2tool: { finished: fin.length, injected: s13.length, ci95: e2ci.map(r3), ciRaw: e2ci, verdict: complete ? (e2ci[0] >= 0.97 ? "PASS" : e2ci[1] < 0.97 ? "FAIL" : "INCONCLUSIVE") : "NOT_JUDGED" },
    E3: { nexusHitTicks: hits, noWaveHits: noWave, verdict: complete ? (noWave === 0 ? "PASS" : "FAIL") : "NOT_JUDGED" },
    reportOnly: { byCell: { v13: by("s13"), v12: by("s12") }, layoutEffect: { pairs: layoutD.length, standardMinusSwapped: summ(layoutD) },
      sideEffect: { all: sideEff("s13"), STANDARD: sideEff("s13", "STANDARD"), SWAPPED: sideEff("s13", "SWAPPED") }, templateEffect: { all: tplEff("s13"), STANDARD: tplEff("s13", "STANDARD"), SWAPPED: tplEff("s13", "SWAPPED") },
      version: { bothFinished: bb + br + rb + rr, v12Blue: r3((bb + br) / Math.max(1, bb + br + rb + rr)), v13Blue: r3((bb + rb) / Math.max(1, bb + br + rb + rr)), flipsToBlue: rb, flipsToRed: br, mcnemarZ: br + rb ? r3((rb - br) / Math.sqrt(br + rb)) : 0, unfinishedV12: unf12, unfinishedV13: unf13 },
      v12: { finished: s12.filter((r) => r.over).length, injected: s12.length, blueRate: rate(s12) } } };
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(J, null, 1));
console.log(JSON.stringify(J, (k, v) => (k === "ciRaw" ? undefined : v), 1));
