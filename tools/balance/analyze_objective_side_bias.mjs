#!/usr/bin/env node
// ============================================================================
//  tools/balance/analyze_objective_side_bias.mjs — v15 vs v16 物件側邊偏差歸因（只讀既有 A/B 原始資料）
//
//  用法：node tools/balance/analyze_objective_side_bias.mjs [--dir=review/moba-objective-v16/ab] [--json=<檔>]
//  讀 n1000_v15_objective.jsonl／n1000_v16_objective.jsonl（moba_items_balance_runner 的 objective.jsonl），不重跑模擬。
//  TD-CS1 歸因：用 runner 的 mirroredRoster（決定性，只依 seed）找出 liuxing／miwu 上場的 seed。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { mirroredRoster, modules } from "./moba_items_balance_runner.mjs";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const DIR = arg("dir", "review/moba-objective-v16/ab");
const load = (f) => fs.readFileSync(path.join(DIR, f), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const med = (xs) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };

function sideStats(rows) {
  const S = {};
  for (const side of ["blue", "red"]) {
    const other = side === "blue" ? "red" : "blue";
    let firstDragon = 0, dragons = 0, soul = 0, soulWin = 0, firstBaron = 0, firstBaronWin = 0, barons = 0;
    let late = 0, lateWin = 0, bounty = 0, bountyWin = 0, objKills = 0, objKillWin = 0, soulFirst = 0;
    const dragonT = [], baronT = [], soulT = [];
    let games = 0, wins = 0;
    for (const r of rows) {
      if (!r.over) continue;
      games++; if (r.winner === side) wins++;
      const k = r.objective.kills.filter((x) => x[2]);
      const fd = k.find((x) => x[1] === "dragon"); if (fd?.[2] === side) firstDragon++;
      const fb = k.find((x) => x[1] === "baron"); if (fb?.[2] === side) { firstBaron++; if (r.winner === side) firstBaronWin++; }
      for (const x of k) {
        if (x[2] !== side) continue;
        objKills++; if (r.winner === side) objKillWin++;
        if (x[1] === "dragon") { dragons++; dragonT.push(x[0]); } else { barons++; baronT.push(x[0]); }
        if (x[0] >= 840) { late++; if (r.winner === side) lateWin++; }
        if (x[3] > 0) { bounty++; if (r.winner === side) bountyWin++; }
      }
      const s = r.objective.soul?.[side];
      if (s !== null && s !== undefined) { soul++; soulT.push(s); if (r.winner === side) soulWin++;
        const o = r.objective.soul?.[other]; if (o === null || o === undefined || s < o) soulFirst++; }
    }
    S[side] = {
      winPct: pct(wins, games),
      firstDragonPct: pct(firstDragon, games), dragonsTotal: dragons, dragonMedianT: med(dragonT),
      soulRatePct: pct(soul, games), soulWinPct: pct(soulWin, soul), soulMedianT: med(soulT),
      firstBaronPct: pct(firstBaron, games), firstBaronWinPct: pct(firstBaronWin, firstBaron), baronsTotal: barons, baronMedianT: med(baronT),
      lateObjTaken: late, lateObjWinPct: pct(lateWin, late),
      bountyEvents: bounty, bountyWinPct: pct(bountyWin, bounty),
      objKillWinPct: pct(objKillWin, objKills),
    };
  }
  return S;
}

const v15 = load("n1000_v15_objective.jsonl"), v16 = load("n1000_v16_objective.jsonl");
const by15 = new Map(v15.map((r) => [r.seed, r]));
const flips = { toBlue: 0, toRed: 0 };
for (const r of v16) { const b = by15.get(r.seed); if (b?.over && r.over && b.winner !== r.winner) flips[r.winner === "blue" ? "toBlue" : "toRed"]++; }

//  TD-CS1：哪些 seed 有 liuxing／miwu（鏡像：雙方同英雄）
const M = await modules();
const tdSeeds = new Set();
for (const r of v16) { const ro = mirroredRoster(r.seed, M); if (Object.values(ro).some((x) => x.heroId === "liuxing" || x.heroId === "miwu")) tdSeeds.add(r.seed); }
const blueRate = (rows, pred) => { const x = rows.filter((r) => r.over && pred(r.seed)); return { n: x.length, bluePct: pct(x.filter((r) => r.winner === "blue").length, x.length) }; };
const td = {
  seedsWithTdcs1Heroes: tdSeeds.size,
  withHeroes: { v15: blueRate(v15, (s) => tdSeeds.has(s)), v16: blueRate(v16, (s) => tdSeeds.has(s)) },
  withoutHeroes: { v15: blueRate(v15, (s) => !tdSeeds.has(s)), v16: blueRate(v16, (s) => !tdSeeds.has(s)) },
};

const out = { v15: sideStats(v15), v16: sideStats(v16), winnerFlips: flips, tdcs1: td };
console.log(JSON.stringify(out, null, 1));
const j = arg("json", null); if (j) fs.writeFileSync(j, JSON.stringify(out, null, 2));
