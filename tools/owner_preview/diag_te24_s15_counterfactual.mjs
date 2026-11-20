#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/diag_te24_s15_counterfactual.mjs — Sprint 2 Preflight A §2.7：單一修改的離線推估（只讀；2026-11-20）
//
//  ⚠ 只作根因證據，不是調參、不是驗證：用 diag_te24_s15_invade 的決策快照，照實際冷卻（120 秒）與入侵時長（約 25 秒）逐次重播「會不會出發」。
//    忽略出發後對局面的回饋、忽略編隊與威脅的後段條件；數字只看方向（現況重播比實際出發多 1.2～1.7 倍）。
//  每一種假設只改一個環節：
//   base               ＝現況（ev ≥ 0.9 × cost）
//   lam0NonOverlap     ＝沒有自家營可打的那段時間，成本改用先驗 λ0（0.009）而不是我方實際清營速度
//   lamTool008         ＝時間價值整段改成無技能工具路徑的 λ（0.008）
//   econK08_globalRef  ＝參考：全域 econK 改 0.8（Owner 禁止的做法，只拿來比較）
//   pAtruth_illegalRef ＝參考：存活信念改成真值（不合法資訊，只當上限）
//  用法：node tools/owner_preview/diag_te24_s15_counterfactual.mjs --dir=<diag 資料夾> --out=<json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DIR = arg("dir"), OUT = arg("out");
const K = 0.9, COOLDOWN = 120, INV_SEC = 25, LAM0 = 0.009, LOSS = 0.0173;
const FREE_BUSY = new Set(["invading", "executing"]);
const r3 = (x) => Math.round(x * 1000) / 1000;
const CF = {
  base: (c) => c.ev >= K * c.cost,
  lam0NonOverlap: (c) => c.ev >= K * (c.ownValue * (Math.max(LOSS, c.lam) * c.overlap + LAM0 * (c.trip - c.overlap))),
  lamTool008: (c) => c.ev >= K * (c.ownValue * (Math.max(LOSS, 0.008) * c.overlap + 0.008 * (c.trip - c.overlap))),
  econK08_globalRef: (c) => c.ev >= 0.8 * c.cost,
  pAtruth_illegalRef: (c) => (c.pA > 0 ? (c.ev / c.pA) * (c.tAlive ? 1 : 0) : 0) >= K * c.cost,
};
const out = {};
for (const cell of fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl") && !["batches.jsonl", "interruptions.jsonl"].includes(f)).map((f) => f.replace(/\.jsonl$/, ""))) {
  const rows = fs.readFileSync(path.join(DIR, `${cell}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const res = {};
  for (const [name, pass] of Object.entries(CF)) {
    let sm = 0, starts = 0, any = 0, alive = 0;
    for (const r of rows) for (const S of ["blue", "red"]) {
      if (!r.obs[S]?.posture) continue;
      sm++; let cd = -Infinity, busyTo = -Infinity, n = 0;
      for (const v of r.evals[S]) {
        if (!v.camps || v.jg?.dead) continue;
        const gated = /declined:(hp|no_leader)/.test(v.d) || (v.d === "declined:busy" && !FREE_BUSY.has(v.busy));
        if (gated || v.t < cd || v.t < busyTo || /declined:objective/.test(v.d)) continue;
        const ok = v.camps.filter((c) => c.ev != null && pass(c)).sort((a, b) => a.eta - b.eta);
        if (!ok.length) continue;
        n++; starts++; if (ok[0].tAlive) alive++; cd = v.t + COOLDOWN; busyTo = v.t + INV_SEC;
      }
      if (n) any++;
    }
    res[name] = { startsPerSide: r3(starts / sm), atLeastOne: r3(any / sm), chosenTargetTrulyAlive: r3(alive / Math.max(1, starts)), starts };
  }
  const actual = rows.reduce((s, r) => s + ["blue", "red"].reduce((a, S) => a + (r.obs[S]?.posture ? r.obs[S].starts : 0), 0), 0);
  out[cell] = { actualStarts: actual, ...res };
  console.log(cell, "actual", actual, JSON.stringify(res));
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
