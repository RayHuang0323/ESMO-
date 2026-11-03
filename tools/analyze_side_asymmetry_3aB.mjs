// ============================================================================
//  tools/analyze_side_asymmetry_3aB.mjs — Phase 3a-B P0-3 第 0 步：既有逐場紀錄的紅藍不對稱重分析（只讀，0 場新對局）
//
//  執行：node tools/analyze_side_asymmetry_3aB.mjs [--raw=<原始紀錄根目錄>] [--json=<輸出檔，repo 外>]
//
//  ⚠ 這是**描述性**分析：資料是 C6（seeds 4201–4600）與 C5R（8201–8600）已經看過的場次，**不是新證據**，不得拿來通過任何判準。
//    用途只有兩個：① 決定 E1 要量什麼、怎麼分層 ② 用既有資料的變異估 E1 的檢定能力（等價界限 ±150 金有沒有測得出來）。
//
//  分層：每一場的大型物件配置由 seed 決定（objectiveLayout.objectiveLayoutForSeed；STANDARD＝巨龍在下方坑），下方坑緊鄰藍方雙人路
//  （2026-09-30 Objective Access Audit）⇒ STANDARD 的場次藍方是「巨龍側」、SWAPPED 的場次紅方是巨龍側。
//  每一臂、每一側：Δ＝處理場 − 同 seed 的對照場（同側），再依「處理方是不是巨龍側」拆開。
//  側別差（Δ紅 − Δ藍）是同 seed 配對；顏色效果（同為巨龍側時紅藍的差）與配置效果（同色時巨龍側與非巨龍側的差）是不同 seeds 的比較（Welch）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const RAW = val("raw", "C:/Users/ifikn/esmo-measure");
const { objectiveLayoutForSeed } = await import(pathToFileURL(path.join(ROOT, "src/platform/contracts/objectiveLayout.js")).href);
const dragonSideOf = (seed) => (objectiveLayoutForSeed(seed) === "STANDARD" ? "blue" : "red");

const readRecs = (f) => { const m = new Map(); for (const l of fs.readFileSync(f, "utf8").split("\n")) { if (!l.trim()) continue; const o = JSON.parse(l); if (o.rec) m.set(o.seed, o.rec); } return m; };
const finite = (v) => typeof v === "number" && Number.isFinite(v);
function stats(xs) {
  const n = xs.length; if (n < 2) return { n, mean: n ? xs[0] : null, sd: null, se: null, z: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)), se = sd / Math.sqrt(n);
  return { n, mean, sd, se, z: se > 0 ? mean / se : null };
}
const welch = (a, b) => { const A = stats(a), B = stats(b); const se = Math.sqrt(A.se ** 2 + B.se ** 2); return { diff: A.mean - B.mean, se, z: se > 0 ? (A.mean - B.mean) / se : null, nA: A.n, nB: B.n }; };
//  TOST（兩個單側 z 檢定，α 0.05 ⇒ 臨界 1.645）：真實差＝d、標準誤＝se、界限 ±m 時的檢定能力（常態近似）。
const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const tostPower = (d, se, m) => Math.max(0, Phi((m - d) / se - 1.645) - Phi((-m - d) / se + 1.645));

function analyze(study, metrics) {
  const dir = path.join(RAW, study);
  const ctrl = readRecs(path.join(dir, "ctrl.jsonl"));
  const ids = [...new Set(fs.readdirSync(dir).filter((f) => /_(blue|red)\.jsonl$/.test(f)).map((f) => f.replace(/_(blue|red)\.jsonl$/, "")))].sort();
  const out = { study, control: {}, arms: [] };
  //  對照組本身：己方金幣差依配置（兩隊都用 std）——佈局造成的基準不對稱。
  for (const m of metrics) {
    const by = { blue: { D: [], N: [] }, red: { D: [], N: [] } };
    for (const [seed, r] of ctrl) for (const s of ["blue", "red"]) { const v = r.vals[s][m]; if (finite(v)) by[s][dragonSideOf(seed) === s ? "D" : "N"].push(v); }
    out.control[m] = { blueDragonSide: stats(by.blue.D), blueOther: stats(by.blue.N), redDragonSide: stats(by.red.D), redOther: stats(by.red.N) };
  }
  for (const id of ids) {
    const arm = { blue: readRecs(path.join(dir, `${id}_blue.jsonl`)), red: readRecs(path.join(dir, `${id}_red.jsonl`)) };
    const row = { id, metrics: {} };
    for (const m of metrics) {
      const d = { blue: { all: [], D: [], N: [] }, red: { all: [], D: [], N: [] } }, sideDiff = [];
      for (const [seed, c] of ctrl) {
        const per = {};
        for (const s of ["blue", "red"]) {
          const t = arm[s].get(seed); if (!t) continue;
          const a = c.vals[s][m], b = t.vals[s][m];
          if (finite(a) && finite(b)) { per[s] = b - a; d[s].all.push(b - a); d[s][dragonSideOf(seed) === s ? "D" : "N"].push(b - a); }
        }
        if (finite(per.blue) && finite(per.red)) sideDiff.push(per.red - per.blue);
      }
      const sd = stats(sideDiff);
      row.metrics[m] = {
        deltaBlue: stats(d.blue.all), deltaRed: stats(d.red.all), sideDiffRedMinusBlue: sd,
        byDragonSide: { blueD: stats(d.blue.D), blueN: stats(d.blue.N), redD: stats(d.red.D), redN: stats(d.red.N) },
        colorWithinDragonSide: welch(d.red.D, d.blue.D), colorWithinOther: welch(d.red.N, d.blue.N),
        layoutEffect: welch([...d.blue.D, ...d.red.D], [...d.blue.N, ...d.red.N]),
        //  E1 檢定能力（n＝400、以本臂的側別差變異估標準誤）：真實差 0／50／100 時，±150 等價界限的 TOST 能力。
        tost150: sd.sd ? { se400: sd.sd / Math.sqrt(400), power0: tostPower(0, sd.sd / 20, 150), power50: tostPower(50, sd.sd / 20, 150), power100: tostPower(100, sd.sd / 20, 150) } : null,
      };
    }
    out.arms.push(row);
  }
  return out;
}

const res = [analyze("phase-options-c6", ["goldLeadAt.early", "goldLeadAt.mid", "ganksPerMin.early", "win"]), analyze("phase-options-c5r", ["ganksPerMin.early", "ganksPerMin.mid"])];
const f0 = (v, k = 0) => (v === null || v === undefined ? "—" : Number(v).toFixed(k));
for (const r of res) {
  console.log(`\n══ ${r.study}`);
  for (const [m, c] of Object.entries(r.control)) console.log(`對照 ${m}：藍(巨龍側) ${f0(c.blueDragonSide.mean, 2)} n${c.blueDragonSide.n}／藍(另側) ${f0(c.blueOther.mean, 2)} n${c.blueOther.n}／紅(巨龍側) ${f0(c.redDragonSide.mean, 2)}／紅(另側) ${f0(c.redOther.mean, 2)}`);
  for (const a of r.arms) for (const [m, x] of Object.entries(a.metrics)) {
    const k = m.startsWith("gold") ? 0 : 3;
    console.log(`${a.id.padEnd(18)} ${m.padEnd(18)} Δ藍 ${f0(x.deltaBlue.mean, k)}  Δ紅 ${f0(x.deltaRed.mean, k)}  紅−藍 ${f0(x.sideDiffRedMinusBlue.mean, k)} (z ${f0(x.sideDiffRedMinusBlue.z, 2)}, sd ${f0(x.sideDiffRedMinusBlue.sd, k)})`
      + `｜巨龍側 藍 ${f0(x.byDragonSide.blueD.mean, k)} 紅 ${f0(x.byDragonSide.redD.mean, k)}（顏色 z ${f0(x.colorWithinDragonSide.z, 2)}）｜另側 藍 ${f0(x.byDragonSide.blueN.mean, k)} 紅 ${f0(x.byDragonSide.redN.mean, k)}（顏色 z ${f0(x.colorWithinOther.z, 2)}）｜配置 z ${f0(x.layoutEffect.z, 2)}`
      + (m === "goldLeadAt.early" && x.tost150 ? `｜TOST±150 n400 se ${f0(x.tost150.se400, 1)} 能力(真差0/50/100) ${f0(x.tost150.power0, 2)}/${f0(x.tost150.power50, 2)}/${f0(x.tost150.power100, 2)}` : ""));
  }
}
const J = val("json");
if (J) { fs.writeFileSync(J, JSON.stringify(res, null, 2)); console.log(`\n寫入 ${J}`); }
