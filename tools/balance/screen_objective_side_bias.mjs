#!/usr/bin/env node
// ============================================================================
//  tools/balance/screen_objective_side_bias.mjs — Objective Stakes 側邊偏差 screening 比較（只讀 runner 輸出）
//
//  用法：node tools/balance/screen_objective_side_bias.mjs <標籤>=<objective.jsonl 或其目錄> ... [--seeds=1-200] [--json=<檔>]
//    第一組＝v15 基準（算「對 v15 的藍方勝率差」與翻轉）；第二組＝目前 v16（A，算「對 A 的翻轉」）。
//    --seeds 只取該區間的 seed，讓 n=1000 的既有資料可以直接切出 screening 區間當 v15／A，不必重跑。
//  分邊指標（side = blue／red）：
//    firstDragon%／firstBaron%＝拿到本場第一條的比例；dragonShare%＝全部龍擊殺中的占比
//    soulRate%＝該隊取得龍魂的場次比例；soulWin%／firstBaronWin%＝條件勝率（取得者最後獲勝）
//    late%＝14 分（840 s）後該隊擊殺物件、最後獲勝的比例
//  結構偏差訊號：
//    blueDeltaVsV15（pp）＝同 seed 下藍方勝率相對 v15 的變化
//    soulWinGap（pp）＝藍方龍魂勝率 − 紅方（v16 放大的主要來源）；soulAmp＝龍魂方勝率相對 v15 的增加
//    comebackWin%＝拿到逆轉賞金的隊伍最後獲勝的比例（必須 < 50，否則「落後反而有利」）
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const [s0, s1] = (flag("seeds") ?? "1-1000000").split("-").map(Number);
const jsonOut = flag("json");
const pairs = argv.filter((a) => !a.startsWith("--") && a.includes("="));
const load = (p) => {
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "objective.jsonl") : p;
  return fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.seed >= s0 && r.seed <= s1);
};
const r1 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const pct = (a, b) => (b ? r1((a / b) * 100) : null);
const q = (xs, p) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };

function stats(rows) {
  const fin = rows.filter((r) => r.over);
  const S = { n: rows.length, finished: fin.length, unfinished: rows.length - fin.length,
    pathological: rows.filter((r) => !r.over || r.duration > 2700).length };
  S.bluePct = pct(fin.filter((r) => r.winner === "blue").length, fin.length);
  S.redPct = pct(fin.filter((r) => r.winner === "red").length, fin.length);
  const dur = fin.map((r) => r.duration / 60);
  S.durMedMin = r1(q(dur, 0.5)); S.durP90Min = r1(q(dur, 0.9)); S.durMaxMin = r1(Math.max(...dur));
  let allDragons = 0, late = 0, lateWon = 0, bountyGames = 0, bountyWon = 0, soulAny = 0, soulAnyWon = 0;
  const side = {};
  for (const sd of ["blue", "red"]) side[sd] = { fd: 0, fb: 0, fbWon: 0, dragons: 0, barons: 0, baronWon: 0, soul: 0, soulWon: 0, late: 0, lateWon: 0 };
  for (const r of fin) {
    const k = (r.objective?.kills ?? []).filter((x) => x[2]);
    const fd = k.find((x) => x[1] === "dragon"); if (fd) side[fd[2]].fd++;
    const fb = k.find((x) => x[1] === "baron"); if (fb) { side[fb[2]].fb++; if (fb[2] === r.winner) side[fb[2]].fbWon++; }
    for (const x of k) {
      const s = side[x[2]];
      if (x[1] === "dragon") { s.dragons++; allDragons++; } else { s.barons++; if (x[2] === r.winner) s.baronWon++; }
      if (x[0] >= 840) { s.late++; late++; if (x[2] === r.winner) { s.lateWon++; lateWon++; } }
    }
    for (const sd of ["blue", "red"]) {
      const t = r.objective?.soul?.[sd];
      if (t !== null && t !== undefined) { side[sd].soul++; if (sd === r.winner) side[sd].soulWon++; }
    }
    const first = ["blue", "red"].filter((sd) => Number.isFinite(r.objective?.soul?.[sd])).sort((a, b) => r.objective.soul[a] - r.objective.soul[b])[0];
    if (first) { soulAny++; if (first === r.winner) soulAnyWon++; }
    const b = k.filter((x) => x[3] > 0);
    if (b.length) { bountyGames++; if (b.some((x) => x[2] === r.winner)) bountyWon++; }
  }
  for (const sd of ["blue", "red"]) {
    const s = side[sd], p = sd[0];
    S[`${p}FirstDragon%`] = pct(s.fd, fin.length); S[`${p}DragonShare%`] = pct(s.dragons, allDragons);
    S[`${p}SoulRate%`] = pct(s.soul, fin.length); S[`${p}SoulWin%`] = pct(s.soulWon, s.soul);
    S[`${p}FirstBaron%`] = pct(s.fb, fin.length); S[`${p}FirstBaronWin%`] = pct(s.fbWon, s.fb);
    S[`${p}BaronWin%`] = pct(s.baronWon, s.barons); S[`${p}LateWin%`] = pct(s.lateWon, s.late);
  }
  S.soulWinPct = pct(soulAnyWon, soulAny);
  S.soulWinGapPP = S["bSoulWin%"] !== null && S["rSoulWin%"] !== null ? r1(S["bSoulWin%"] - S["rSoulWin%"]) : null;
  S.lateObjConv = pct(lateWon, late);
  S.comebackWin = pct(bountyWon, bountyGames);
  return S;
}

const groups = pairs.map((a) => { const i = a.indexOf("="); return { label: a.slice(0, i), rows: load(a.slice(i + 1)) }; });
const bySeed = (g) => new Map(g.rows.map((r) => [r.seed, r]));
const v15 = groups[0], A = groups[1] ?? groups[0];
const out = {};
for (const g of groups) {
  const s = stats(g.rows);
  for (const [tag, ref] of [["V15", v15], ["A", A]]) {
    const m = bySeed(ref); let flips = 0, n = 0, bNow = 0, bRef = 0;
    for (const r of g.rows) { const b = m.get(r.seed); if (b?.over && r.over) { n++; if (b.winner !== r.winner) flips++; if (r.winner === "blue") bNow++; if (b.winner === "blue") bRef++; } }
    s[`flipsVs${tag}`] = g === ref ? 0 : flips;
    s[`blueDeltaVs${tag}PP`] = n ? r1(((bNow - bRef) / n) * 100) : null;
  }
  s.soulAmpVsV15PP = s.soulWinPct !== null && out[v15.label]?.soulWinPct != null ? r1(s.soulWinPct - out[v15.label].soulWinPct) : (g === v15 ? 0 : null);
  out[g.label] = s;
}
const labels = groups.map((g) => g.label);
const pad = (x, n) => String(x ?? "—").padStart(n);
console.log(`seeds ${s0}–${Math.min(s1, Math.max(...groups.flatMap((g) => g.rows.map((r) => r.seed))))}`);
console.log(`${"指標".padEnd(22)}${labels.map((l) => pad(l, 10)).join("")}`);
for (const k of Object.keys(out[labels[0]])) console.log(`${k.padEnd(22)}${labels.map((l) => pad(out[l][k], 10)).join("")}`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ generatedFrom: pairs, seeds: [s0, s1], groups: out }, null, 2));
