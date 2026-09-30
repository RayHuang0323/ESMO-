#!/usr/bin/env node
// ============================================================================
//  tools/balance/summarize_objective_ab.mjs — Objective Stakes／TD-CS1 A/B 摘要（只讀 runner 輸出）
//
//  用法：node tools/balance/summarize_objective_ab.mjs <標籤>=<runner 輸出目錄> ... [--json=<檔>]
//    第一組當基準（逐 seed 勝方翻轉以它為準）。每個目錄需有 moba_items_balance_runner 寫出的 objective.jsonl。
//  指標定義：
//    擊殺比＝Σ藍方擊殺 ÷ Σ紅方擊殺；未結束＝60 分上限內沒有結束（runner CAP）；病態＝未結束或 > 45 分
//    後期物件轉換＝14 分（840 s）後被擊殺的龍／巴龍中，擊殺方最後獲勝的比例
//    第一條巴龍勝率＝拿到本場第一條巴龍的隊伍最後獲勝的比例
//    龍魂＝某隊龍層達上限；龍魂方勝率＝取得龍魂的隊伍最後獲勝的比例
//    龍層領先方勝率＝終局龍擊殺數較多的隊伍獲勝比例（平手不計）
//    逆轉賞金＝objectiveLog 記錄的 bounty > 0（v15 基準沒有此機制 ⇒ 0）
// ============================================================================
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((a) => a.includes("=") && !a.startsWith("--"));
const jsonOut = process.argv.find((a) => a.startsWith("--json="))?.slice(7) ?? null;
const load = (dir) => fs.readFileSync(path.join(dir, "objective.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const q = (arr, p) => { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const r1 = (v, d = 1) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const pct = (num, den) => (den ? r1((num / den) * 100) : null);

function summarize(rows) {
  const fin = rows.filter((r) => r.over);
  const dur = fin.map((r) => r.duration / 60);
  const bW = fin.filter((r) => r.winner === "blue").length;
  const sumB = rows.reduce((a, r) => a + r.bK, 0), sumR = rows.reduce((a, r) => a + r.rK, 0);
  let late = 0, lateWon = 0, fb = 0, fbWon = 0, soulGames = 0, soulWon = 0, leadGames = 0, leadWon = 0;
  let bountyEvents = 0, bountyGames = 0, bountyWon = 0, bountyGold = 0, dragons = 0, barons = 0;
  const nexusSiege = [], towers = [];
  for (const r of fin) {
    const k = r.objective?.kills ?? [];
    dragons += k.filter((x) => x[1] === "dragon").length;
    barons += k.filter((x) => x[1] === "baron").length;
    for (const x of k) if (x[0] >= 840 && x[2]) { late++; if (x[2] === r.winner) lateWon++; }
    const firstBaron = k.find((x) => x[1] === "baron" && x[2]);
    if (firstBaron) { fb++; if (firstBaron[2] === r.winner) fbWon++; }
    const soulSide = ["blue", "red"].filter((s) => r.objective?.soul?.[s] !== null && r.objective?.soul?.[s] !== undefined)
      .sort((a, b) => r.objective.soul[a] - r.objective.soul[b])[0];
    if (soulSide) { soulGames++; if (soulSide === r.winner) soulWon++; }
    const dB = k.filter((x) => x[1] === "dragon" && x[2] === "blue").length, dR = k.filter((x) => x[1] === "dragon" && x[2] === "red").length;
    if (dB !== dR) { leadGames++; if ((dB > dR ? "blue" : "red") === r.winner) leadWon++; }
    const bounties = k.filter((x) => x[3] > 0);
    if (bounties.length) { bountyGames++; bountyEvents += bounties.length; bountyGold += bounties.reduce((a, x) => a + x[3], 0);
      if (bounties.some((x) => x[2] === r.winner)) bountyWon++; }
    const loser = r.winner === "blue" ? "red" : "blue";
    const hit = r.objective?.nexusHitT?.[loser];
    if (Number.isFinite(hit)) nexusSiege.push(r.duration - hit);
    towers.push((r.towers?.blue ?? 0) + (r.towers?.red ?? 0));
  }
  return {
    n: rows.length, finished: fin.length, unfinished: rows.length - fin.length,
    pathological: rows.filter((r) => !r.over || r.duration > 2700).length,
    blueWinPct: pct(bW, fin.length), redWinPct: pct(fin.length - bW, fin.length),
    killRatio: sumR ? r1(sumB / sumR, 3) : null, killsPerGame: r1((sumB + sumR) / rows.length),
    durMedianMin: r1(q(dur, 0.5), 2), durP90Min: r1(q(dur, 0.9), 2), durMaxMin: r1(Math.max(...dur), 2),
    dragonsPerGame: r1(dragons / Math.max(1, fin.length), 2), baronsPerGame: r1(barons / Math.max(1, fin.length), 2),
    lateObjPerGame: r1(late / Math.max(1, fin.length), 2), lateObjConversionPct: pct(lateWon, late),
    firstBaronWinPct: pct(fbWon, fb), firstBaronGames: fb,
    soulRatePct: pct(soulGames, fin.length), soulWinPct: pct(soulWon, soulGames),
    dragonLeadWinPct: pct(leadWon, leadGames),
    bountyGamesPct: pct(bountyGames, fin.length), bountyEventsPerGame: r1(bountyEvents / Math.max(1, fin.length), 2),
    bountyTeamWinPct: pct(bountyWon, bountyGames), bountyGoldPerEvent: bountyEvents ? Math.round(bountyGold / bountyEvents) : null,
    towersDownPerGame: r1(towers.reduce((a, x) => a + x, 0) / Math.max(1, towers.length), 2),
    nexusSiegeMedianS: r1(q(nexusSiege, 0.5), 0),
  };
}

const groups = args.map((a) => { const i = a.indexOf("="); return { label: a.slice(0, i), rows: load(a.slice(i + 1)) }; });
const base = groups[0];
const baseBySeed = new Map(base.rows.map((r) => [r.seed, r]));
const out = {};
for (const g of groups) {
  const s = summarize(g.rows);
  let flips = 0, compared = 0;
  for (const r of g.rows) { const b = baseBySeed.get(r.seed); if (b && b.over && r.over) { compared++; if (b.winner !== r.winner) flips++; } }
  s.winnerFlipsVsBase = g === base ? 0 : flips;
  s.winnerFlipPct = g === base ? 0 : pct(flips, compared);
  out[g.label] = s;
}
const keys = Object.keys(out[base.label]);
const labels = groups.map((g) => g.label);
const pad = (x, n) => String(x ?? "—").padStart(n);
console.log(`${"指標".padEnd(24)}${labels.map((l) => pad(l, 14)).join("")}`);
for (const k of keys) console.log(`${k.padEnd(24)}${labels.map((l) => pad(out[l][k], 14)).join("")}`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ generatedFrom: args, groups: out }, null, 2));
