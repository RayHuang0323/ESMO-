//  TD-21（runtime29 §29「v2 陣列順序不決定勝負」）到底是**偏差**還是**混沌**？
//
//  ── 問題 ──────────────────────────────────────────────────────────────────
//  §29 的斷言是：把 `e.players` 反序之後，藍方勝率位移必須 ≤ 15pp。
//  實測 43% / 63% ⇒ 位移 20pp ⇒ 長期紅燈（TD-21）。
//
//  但它只用 **40 個 seed**。兩組 40 場的比例差，噪音底線就有：
//      配對二項的 95% CI ≈ 1.96 × sqrt(0.5 / 40) ≈ **±22pp**
//  ⇒ **這個檢定在 n=40 時分不出「20pp 位移」與「0」。**
//
//  而 `check_moba_runtime29.mjs:414-417` 自己已經記錄了機制：
//      「rng 抽樣順序跟著 players 迭代順序走 … 那是**混沌**（同一場的隨機序列不同），
//        不是**偏差**（沒有哪一方系統性佔便宜）」
//
//  ── 本探針怎麼分辨 ────────────────────────────────────────────────────────
//  混沌 ⇒ 位移是抽樣噪音 ⇒ 隨樣本數以 **1/√n 收斂到 0**。
//  偏差 ⇒ 位移是系統性offset ⇒ **不隨樣本數縮小，停在某個值**。
//
//  於是在 n = 40 / 80 / 120 / 200 各算一次位移，看它往哪走。
//  另外用 **McNemar 配對檢定**（正序贏/反序贏的不一致對）給出正式的 p 值——
//  這才是「同一批 seed、只換陣列順序」該用的檢定，不是兩組獨立比例。
//
//  ⚠ 只跑模擬、不改任何引擎狀態、不改任何門檻。
//  用法：node tools/probe_order_fairness.mjs [--max=200] [--rules=v2]

import fs from "fs";
import { LogicEngine } from "../src/LogicEngine.js";

const argv = process.argv.slice(2);
const arg = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const MAX_N = Number(arg("max", 200));
const RULES = arg("rules", "v2");
const DT = 0.5;

//  §29 用的前 40 個 seed 原封不動放最前面 ⇒ 前 40 的結果必須與 runtime29 一致（可交叉核對）
const BASE40 = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242,
  31337, 65535, 1024, 2048, 4096,
  13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
//  之後補的 seed（純粹擴充樣本，不挑選）
const EXTRA = [];
for (let s = 101; EXTRA.length < Math.max(0, MAX_N - BASE40.length); s += 2) EXTRA.push(s);
const SEEDS = [...BASE40, ...EXTRA].slice(0, MAX_N);

function winnerOf(seed, reverse) {
  const e = new LogicEngine(seed, null, { rules: RULES });
  if (reverse) e.players.reverse();
  for (let t = DT; t <= 2700 && !e.over; t += DT) e.tick(DT);
  return e.winner ?? null;
}

console.log(`# 陣列順序公平性：偏差 vs 混沌｜規則集 ${RULES}｜最多 ${SEEDS.length} seeds`);
console.log(`# 混沌 ⇒ 位移隨 n 以 1/√n 收斂到 0；偏差 ⇒ 位移不隨 n 縮小\n`);

const rows = [];
for (let i = 0; i < SEEDS.length; i++) {
  const s = SEEDS[i];
  rows.push({ seed: s, fwd: winnerOf(s, false), rev: winnerOf(s, true) });
  if ((i + 1) % 20 === 0) process.stdout.write(`  … ${i + 1}/${SEEDS.length}\n`);
}

const report = (n) => {
  const r = rows.slice(0, n);
  const fb = r.filter((x) => x.fwd === "blue").length / n;
  const bb = r.filter((x) => x.rev === "blue").length / n;
  const shift = Math.abs(fb - bb);
  //  McNemar：只看「正序藍勝但反序非藍勝」與反之的不一致對
  const b = r.filter((x) => x.fwd === "blue" && x.rev !== "blue").length;
  const c = r.filter((x) => x.fwd !== "blue" && x.rev === "blue").length;
  const disc = b + c;
  //  連續性校正的 McNemar 統計量；disc 小的時候不做結論
  const chi = disc > 0 ? ((Math.abs(b - c) - 1) ** 2) / disc : 0;
  //  卡方 1 自由度的雙尾 p（用 erfc 近似）
  const pOf = (x) => { const z = Math.sqrt(Math.max(0, x)); return erfc(z / Math.SQRT2); };
  //  95% CI（配對二項的常態近似）
  const ci = 1.96 * Math.sqrt(Math.max(disc, 1)) / n;
  return { n, fb, bb, shift, b, c, disc, chi, p: pOf(chi), ci };
};
//  erfc 近似（Abramowitz & Stegun 7.1.26），夠這裡判讀用
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const y = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? y : 2 - y;
}

console.log(`\n${"n".padStart(5)}${"藍勝(正序)".padStart(12)}${"藍勝(反序)".padStart(12)}${"位移".padStart(9)}${"噪音±95%".padStart(11)}${"不一致對".padStart(10)}${"McNemar p".padStart(11)}`);
const marks = [40, 80, 120, 160, 200].filter((n) => n <= SEEDS.length);
if (!marks.includes(SEEDS.length)) marks.push(SEEDS.length);
const out = [];
for (const n of marks) {
  const r = report(n);
  out.push(r);
  console.log(
    String(r.n).padStart(5) + `${(r.fb * 100).toFixed(1)}%`.padStart(12) + `${(r.bb * 100).toFixed(1)}%`.padStart(12) +
    `${(r.shift * 100).toFixed(1)}pp`.padStart(9) + `±${(r.ci * 100).toFixed(1)}pp`.padStart(11) +
    `${r.b}/${r.c}`.padStart(10) + r.p.toFixed(3).padStart(11));
}

const last = out[out.length - 1];
console.log(`\n## 判讀`);
console.log(`  §29 門檻：位移 ≤ 15pp 且兩者都在 30–70%`);
console.log(`  n=40（§29 目前用的樣本數）位移 ${(out[0].shift * 100).toFixed(1)}pp，噪音底線 ±${(out[0].ci * 100).toFixed(1)}pp`);
console.log(`  n=${last.n} 位移 ${(last.shift * 100).toFixed(1)}pp，噪音底線 ±${(last.ci * 100).toFixed(1)}pp，McNemar p=${last.p.toFixed(3)}`);
console.log(`  ⇒ ${last.p >= 0.05
  ? "**混沌**：沒有統計證據顯示任一方系統性佔便宜。§29 在 n=40 時檢定力不足。"
  : "**偏差**：有統計證據顯示系統性偏斜，屬引擎缺陷，需 per-player rng 流。"}`);

fs.mkdirSync("review/moba-combat", { recursive: true });
fs.writeFileSync("review/moba-combat/order_fairness.json", JSON.stringify({
  generatedBy: "tools/probe_order_fairness.mjs", rules: RULES, seeds: SEEDS.length,
  marks: out, rows,
}, null, 2), "utf8");
console.log(`\n⇒ review/moba-combat/order_fairness.json`);
