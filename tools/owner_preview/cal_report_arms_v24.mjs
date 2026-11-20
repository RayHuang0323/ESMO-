#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/cal_report_arms_v24.mjs — v24 Calibration Sprint：各臂的對照報告（只讀 diag_te24_cal_invade 的輸出；2026-11-20）
//
//  每一臂 × 路徑（工具 inv／AB／BA 合併、生涯低／中／高合併；也可逐格）：
//   S2-C：C1＝每邊每場出發、C2＝至少一次的比例；S2-A：到營地 ÷ 出發；搶到率、帶隊者 45 秒內陣亡率
//   與 off 臂同 Seed 配對（同一個 Seed、同一個配置、同一邊）：陣亡差、被塔擊殺差、營地合計（自家＋敵方）差 ⇒ S5／S6 的同一種計數；
//   95% 區間＝以 Seed 為叢集的百分位 bootstrap（4,000 次，固定亂數種子 20261120）
//  這是校準用的對照，不是判定；正式判定在事先登記的新 Seeds 上做。
//  用法：node tools/owner_preview/cal_report_arms_v24.mjs --dirs=<資料夾1>,<資料夾2> --arms=v13,v14,... --off=off --out=<json>
//   （格名必須是 <path>_<配置或素質>_<臂>，例如 tool_inv_v14、career_mid_v14t）
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIRS = arg("dirs", "").split(",").filter(Boolean), ARMS = arg("arms", "").split(",").filter(Boolean), OFF = arg("off", "off"), OUT = arg("out"), MAXSEEDS = Number(arg("maxSeeds", "0"));
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const load = (cell) => { for (const d of DIRS) { const f = path.join(d, `${cell}.jsonl`); if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } return []; };
const GROUPS = { tool: ["tool_inv", "tool_AB", "tool_BA"], career: ["career_low", "career_mid", "career_high"] };
function boot(units, f, B = 4000) {
  const g = new Map(); for (const u of units) { const k = String(u.seed); if (!g.has(k)) g.set(k, []); g.get(k).push(u); }
  const keys = [...g.keys()]; let s = 20261120; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; const out = [];
  for (let b = 0; b < B; b++) { const pick = []; for (let i = 0; i < keys.length; i++) pick.push(...g.get(keys[Math.floor(rnd() * keys.length)])); out.push(f(pick)); }
  out.sort((a, c) => a - c); return [r3(out[Math.floor(B * 0.025)]), r3(out[Math.floor(B * 0.975)])];
}
const mean = (l, f) => l.reduce((a, x) => a + f(x), 0) / Math.max(1, l.length);
function report(cells, arm) {
  const units = [], paired = [];
  for (const cell of cells) {
    let rows = load(`${cell}_${arm}`); if (MAXSEEDS) rows = rows.slice(0, MAXSEEDS);
    const off = new Map(load(`${cell}_${OFF}`).map((r) => [r.seed, r]));
    for (const r of rows) for (const S of ["blue", "red"]) {
      const ob = r.obs?.[S]; if (!ob?.posture) continue;
      const st = r.starts.filter((s) => s.side === S);
      const u = { seed: r.seed, cell, starts: st.length, arrived: st.filter((s) => s.arrived).length, captured: st.filter((s) => s.captured).length, died: st.filter((s) => s.leaderDied).length };
      units.push(u);
      const o = off.get(r.seed);
      if (o) paired.push({ seed: r.seed, dDeaths: r.stats[S].deaths - o.stats[S].deaths, dTower: r.stats[S].towerDeaths - o.stats[S].towerDeaths,
        dCamps: (r.stats[S].ownCampKills + r.stats[S].enemyCampKills) - (o.stats[S].ownCampKills + o.stats[S].enemyCampKills), dOwn: r.stats[S].ownCampKills - o.stats[S].ownCampKills, dEnemy: r.stats[S].enemyCampKills - o.stats[S].enemyCampKills });
    }
  }
  const S = units.reduce((a, u) => a + u.starts, 0), A = units.reduce((a, u) => a + u.arrived, 0);
  const ratio = (l, num) => { const d = l.reduce((a, u) => a + u.starts, 0); return d ? l.reduce((a, u) => a + u[num], 0) / d : NaN; };
  return { sideMatches: units.length, starts: S,
    C1: r3(S / Math.max(1, units.length)), C1ci: boot(units, (l) => mean(l, (u) => u.starts)), C2: r3(units.filter((u) => u.starts > 0).length / Math.max(1, units.length)),
    S2A: r3(A / Math.max(1, S)), S2Aci: S ? boot(units, (l) => ratio(l, "arrived")) : null, captured: r3(ratio(units, "captured")), leaderDied: r3(ratio(units, "died")),
    vsOff: paired.length ? { n: paired.length, deaths: r3(mean(paired, (p) => p.dDeaths)), deathsCi: boot(paired, (l) => mean(l, (p) => p.dDeaths)), towerDeaths: r3(mean(paired, (p) => p.dTower)), towerCi: boot(paired, (l) => mean(l, (p) => p.dTower)),
      camps: r3(mean(paired, (p) => p.dCamps)), campsCi: boot(paired, (l) => mean(l, (p) => p.dCamps)), own: r3(mean(paired, (p) => p.dOwn)), enemy: r3(mean(paired, (p) => p.dEnemy)) } : null };
}
const J = {};
for (const arm of ARMS) for (const [g, cells] of Object.entries(GROUPS)) { const rep = report(cells, arm); if (rep.sideMatches) J[`${g}|${arm}`] = rep; }
if (OUT) fs.writeFileSync(OUT, JSON.stringify(J, null, 1));
for (const [k, v] of Object.entries(J)) console.log(k.padEnd(18), `sm ${v.sideMatches} C1 ${v.C1} ${JSON.stringify(v.C1ci)} C2 ${v.C2} | S2A ${v.S2A} ${JSON.stringify(v.S2Aci)} n=${v.starts} cap ${v.captured} died ${v.leaderDied}`, v.vsOff ? `| vsOff deaths ${v.vsOff.deaths} ${JSON.stringify(v.vsOff.deathsCi)} tower ${v.vsOff.towerDeaths} ${JSON.stringify(v.vsOff.towerCi)} camps ${v.vsOff.camps} ${JSON.stringify(v.vsOff.campsCi)}` : "");
