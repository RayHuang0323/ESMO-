#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/judge_tactic_exec_v24.mjs — 依 review/tactic-book-3a/v24_sprint1/REGISTRATION.md §4 判定 S1～S11（2026-11-17；離線）
//  --dir=<驗證批次資料夾（measure_tactic_exec_v24 的 *.json）>  --analysis=<analyze_tactic_exec_v24 的輸出>  [--out=<json>]
//  S9、S12 由 gate 判（check_tactic_exec_v24、check_layer_isolation_v24），這裡不重算。數字照登記文件，不調整。
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const DIR = arg("dir"), A = JSON.parse(fs.readFileSync(arg("analysis"), "utf8")), OUT = arg("out");
const rows = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) for (const r of JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).rows ?? []) rows.push(r);
const ad = rows.filter((r) => r.arm === "adaptive");
const out = [];
const put = (id, verdict, detail) => { out.push({ id, verdict, detail }); console.log(`${verdict}\t${id}\t${detail}`); };
const r3 = (x) => Math.round(x * 1000) / 1000;

//  S1
{ let n = 0, ok = 0; for (const r of ad) for (const S of ["blue", "red"]) { const O = r.te[S]; if (!O.posture) continue; n++; if (O.evals > 0) ok++; }
  put("S1 有入侵意圖的每一邊都有評估紀錄", n > 0 && ok === n ? "PASS" : "FAIL", `${ok}/${n}`); }
//  S2
{ let n = 0, ok = 0; for (const r of ad) for (const S of ["blue", "red"]) { const O = r.te[S]; if (!O.posture) continue; n++; if (O.arrived > 0) ok++; }
  put("S2 有意圖的邊×場中，至少一次帶隊者到營地 ≥ 0.8", n && ok / n >= 0.8 ? "PASS" : "FAIL", `${ok}/${n} = ${r3(ok / n)}`); }
//  S3
{ let n = 0, ok = 0; for (const r of ad) for (const S of ["blue", "red"]) { if (r.te[S].starts === 0) continue; const foe = S === "blue" ? "red" : "blue"; n++; if (r.te[foe].defend.triggers > 0) ok++; }
  put("S3 有入侵出發時，對方至少觸發一次回防 ≥ 0.9", n && ok / n >= 0.9 ? "PASS" : "FAIL", `${ok}/${n} = ${r3(ok / n)}`); }
//  S4
{ const withContact = ad.filter((r) => ["blue", "red"].some((S) => (r.invObs?.[S]?.contactSecs ?? 0) > 0)).length;
  put("S4 入侵期間有英雄接觸的對局比例 > 0", withContact > 0 ? "PASS" : "FAIL", `${withContact}/${ad.length} = ${r3(withContact / ad.length)}`); }
const C = A.compare.all;
//  S5
{ const td = C.towerDeaths.diff, de = C.deaths.diff;
  put("S5 安全：被塔擊殺配對差上界 ≤ +0.3、陣亡配對差上界 ≤ +1.0", td.ci[1] <= 0.3 && de.ci[1] <= 1.0 ? "PASS" : "FAIL",
    `被塔擊殺 ${C.towerDeaths.off}→${C.towerDeaths.adaptive} Δ${td.mean} [${td.ci}]；陣亡 ${C.deaths.off}→${C.deaths.adaptive} Δ${de.mean} [${de.ci}]`); }
//  S6（自家營＋敵方營的配對差：用兩項的和重算）
{ const key = (r) => `${r.path}|${r.tier ?? "-"}|${r.cfg}|${r.seed}`, P = new Map();
  for (const r of rows) { const k = key(r); if (!P.has(k)) P.set(k, {}); P.get(k)[r.arm] = r; }
  const d = [];
  for (const p of P.values()) if (p.off && p.adaptive) for (const S of ["blue", "red"]) d.push((p.adaptive.stats[S].ownCampKills + p.adaptive.stats[S].enemyCampKills) - (p.off.stats[S].ownCampKills + p.off.stats[S].enemyCampKills));
  const n = d.length, m = d.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)), hw = 1.96 * sd / Math.sqrt(n);
  put("S6 野怪收益：（自家營＋敵方營）配對差下界 ≥ −1.0", m - hw >= -1.0 ? "PASS" : "FAIL", `Δ${r3(m)} [${r3(m - hw)},${r3(m + hw)}]（自家營 Δ${C.ownCamp.diff.mean}、敵方營 Δ${C.enemyCamp.diff.mean}）`); }
//  S7
{ const t = C.towersLost.diff; put("S7 被拆的塔（只報）", "REPORT", `${C.towersLost.off}→${C.towersLost.adaptive} Δ${t.mean} [${t.ci}]`); }
//  S8：入侵方（AB 藍、BA 紅、生涯藍）勝率
{ const key = (r) => `${r.path}|${r.tier ?? "-"}|${r.cfg}|${r.seed}`, P = new Map();
  for (const r of rows) { const k = key(r); if (!P.has(k)) P.set(k, {}); P.get(k)[r.arm] = r; }
  const d = [];
  for (const p of P.values()) {
    if (!p.off || !p.adaptive) continue;
    const inv = p.off.cfg === "AB" || p.off.path === "career" ? "blue" : p.off.cfg === "BA" ? "red" : null;
    if (!inv) continue;
    d.push((p.adaptive.winner === inv ? 1 : 0) - (p.off.winner === inv ? 1 : 0));
  }
  const n = d.length, m = d.reduce((s, x) => s + x, 0) / n, sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)), hw = 1.96 * sd / Math.sqrt(n);
  const lo = m - hw, hi = m + hw;
  put("S8 入侵方勝率配對差（只報；區間跨出 ±0.05 ⇒ INCONCLUSIVE）", lo >= -0.05 && hi <= 0.05 ? "REPORT(within ±0.05)" : "INCONCLUSIVE", `n=${n} Δ${r3(m)} [${r3(lo)},${r3(hi)}]`); }
//  S10
{ const F = A.fairness8b, w = F.didBlueWin, g = F.didBlueGold;
  const tri = (ci, mgn) => (ci[0] >= -mgn && ci[1] <= mgn ? "PASS" : ci[0] > mgn || ci[1] < -mgn ? "FAIL" : "INCONCLUSIVE");
  put("S10a 8b 藍方勝率 DiD（±0.08）", tri(w.ci, 0.08), `seeds=${F.seeds} off ${F.blueWinOff} → adaptive ${F.blueWinAdaptive}；DiD ${w.mean} [${w.ci}]`);
  put("S10b 8b 藍方金錢差 DiD（±800）", tri(g.ci, 800), `DiD ${g.mean} [${g.ci}]`); }
//  S11
{ const t = A.threat.all.s05; const ok = Math.abs(t.bias) <= 0.5 && t.mae <= 0.75 && t.coverWhenArrivals >= 0.6;
  put("S11 威脅模型 s05：|偏差| ≤ 0.5、誤差 ≤ 0.75、涵蓋 ≥ 0.6", ok ? "PASS" : "FAIL", `n=${A.threat.all.n} 偏差 ${t.bias} 誤差 ${t.mae} 涵蓋 ${t.coverWhenArrivals}（s05reach 偏差 ${A.threat.all.s05reach.bias}）`); }
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
