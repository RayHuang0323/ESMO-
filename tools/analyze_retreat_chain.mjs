//  撤退 → 存活 → 再投入 → 推進 這條收益鏈的專項分析。
//
//  為什麼需要：`analyze_sensitivity_raw.mjs` 已經能對每一個「每場一個值」的欄位
//  給出 CI，但它是**逐欄獨立**的。要判斷「高 decision / positioning → 更常撤退
//  → 少死 → 推塔下降」是合理 trade-off 還是收益結構有問題，必須看的是**欄位之間
//  的轉換率**，那是逐欄檢定給不出來的。
//
//  本檔計算三層：
//
//   1. 離場成本：撤退是否換得等量的重返（`returns / retreats`），
//      以及作戰持續率實際掉了多少。
//   2. 轉換效率：`towerPushes / (minutes × fightUptime)`
//      ——「真正在作戰的每一分鐘，換到多少推塔」。
//      若高能力方的這個值也下降，代表推塔的損失**不只是「人不在場」**，
//      而是引擎沒把存活轉回推進價值。
//   3. 存活的回報：`k/d`、`towerPushes / d`（每死一次換到的推塔）。
//
//  另外做**跨素質回歸**：把所有素質的 (Δretreats, Δd) 對 ΔtowerPushes 做最小平方，
//  檢查「推塔下降」到底跟撤退量還是死亡量綁在一起。
//
//  用法：node tools/analyze_retreat_chain.mjs <tag> [tag...]
//
//  ⚠ 只讀檔、不跑模擬、不改任何東西。

import fs from "fs";

const DIR = "review/moba-combat";
const TAGS = process.argv.slice(2);
if (!TAGS.length) { console.error("用法：node tools/analyze_retreat_chain.mjs <tag> [tag...]"); process.exit(1); }

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const varS = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };

//  配對差（同 seed 同陣營的 90 減 40）——鏡像對跑讓兩格共用隨機源，
//  配對後可消掉場次間變異，是本檔所有 CI 的基礎。
function pairedDiff(A, B, f) {
  const key = (r) => `${r.seed}|${r.side}`;
  const mapA = new Map(A.map((r) => [key(r), r]));
  const d = [];
  for (const rb of B) { const ra = mapA.get(key(rb)); if (ra) d.push(f(rb) - f(ra)); }
  if (d.length < 3) return null;
  const m = mean(d), se = Math.sqrt(varS(d) / d.length);
  return { n: d.length, d: m, se, lo: m - 1.96 * se, hi: m + 1.96 * se, sig: Math.abs(m) > 1.96 * se };
}

//  Pearson 相關 + Fisher z 的 95% CI
function corr(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { const a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  if (sxx <= 0 || syy <= 0) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  const n = xs.length;
  if (n < 5 || Math.abs(r) >= 1) return { r, lo: NaN, hi: NaN, n };
  const z = 0.5 * Math.log((1 + r) / (1 - r)), se = 1 / Math.sqrt(n - 3);
  const t = (v) => (Math.exp(2 * v) - 1) / (Math.exp(2 * v) + 1);
  return { r, lo: t(z - 1.96 * se), hi: t(z + 1.96 * se), n };
}

//  ── 衍生量（全部由逐場欄位算出，不依賴摘要）
//  ⚠ 每一項都是「每場先算、再跨場平均」，不是「先平均再相除」。
//     比率的平均 ≠ 平均的比率，後者會被長場次灌權重。
const FIGHT_MIN = (r) => r.minutes * r.fightUptime;          // 實際在作戰的分鐘數
const DERIVED = {
  "推塔/場":        (r) => r.towerPushes,
  "推塔/分":        (r) => r.towerPushes / Math.max(r.minutes, 1e-9),
  "推塔/作戰分":    (r) => r.towerPushes / Math.max(FIGHT_MIN(r), 1e-9),
  "重返/撤退":      (r) => r.returns / Math.max(r.retreats, 1e-9),
  //  ⚠ `returns` 是工具逐 tick 偵測 `retreating: true → false` 的轉換
  //     （`measure_stat_sensitivity.mjs:236`），**死亡也會清掉 retreating**
  //     ⇒ 每死一次就白送一個「重返」。死亡數在各素質間差到 ±38%，
  //     不扣掉的話這個比值會被死亡數污染（實測 clutch 的 +8.9% 幾乎全是這個假訊號）。
  //     最保守的扣法：假設每次死亡恰好貢獻一個假重返 ⇒ 這是**下界**。
  "重返(扣死)/撤退": (r) => Math.max(r.returns - r.d, 0) / Math.max(r.retreats, 1e-9),
  "作戰持續率":     (r) => r.fightUptime,
  "撤退/場":        (r) => r.retreats,
  "重返/場":        (r) => r.returns,
  "死亡/場":        (r) => r.d,
  "K/D":            (r) => r.k / Math.max(r.d, 1e-9),
  "推塔/死亡":      (r) => r.towerPushes / Math.max(r.d, 1e-9),
  "團戰段落/作戰分": (r) => r.tfEpisodes / Math.max(FIGHT_MIN(r), 1e-9),
  "場長(分)":       (r) => r.minutes,
};

const crossRows = [];   //  跨素質回歸用

for (const TAG of TAGS) {
  const raw = JSON.parse(fs.readFileSync(`${DIR}/${TAG}.raw.json`, "utf8"));
  const rows = raw.rows;
  const base = rows.filter((r) => r.stat === "__baseline__");
  const stats = [...new Set(rows.map((r) => r.stat))].filter((s) => s !== "__baseline__");

  console.log(`\n${"=".repeat(100)}`);
  console.log(`# ${TAG}｜情境 ${raw.scenario}｜${raw.seeds.length} seeds × 鏡像 = 每格 ${raw.matchesPerCell} 場`);
  console.log(`${"=".repeat(100)}`);

  //  ── 層 0：中性基準內部的相關性（能力固定全 70 ⇒ 純粹是「這場剛好撤得多」的效果）
  //  這一層回答：撤退與推塔的負相關，是不是能力層造成的？還是引擎本身就這樣？
  console.log(`\n## 層 0：中性基準內的逐場相關（全 70，n=${base.length}）——排除能力層的干擾`);
  const pairs = [
    ["撤退", (r) => r.retreats, "推塔", (r) => r.towerPushes],
    ["死亡", (r) => r.d, "推塔", (r) => r.towerPushes],
    ["作戰持續率", (r) => r.fightUptime, "推塔", (r) => r.towerPushes],
    ["撤退", (r) => r.retreats, "死亡", (r) => r.d],
    ["撤退", (r) => r.retreats, "作戰持續率", (r) => r.fightUptime],
    ["死亡", (r) => r.d, "推塔/作戰分", (r) => r.towerPushes / Math.max(FIGHT_MIN(r), 1e-9)],
  ];
  for (const [nx, fx, ny, fy] of pairs) {
    const c = corr(base.map(fx), base.map(fy));
    if (c) console.log(`  r(${nx}, ${ny})`.padEnd(30) + `= ${c.r.toFixed(3)}  [${c.lo.toFixed(3)}, ${c.hi.toFixed(3)}]` + (c.lo * c.hi > 0 ? "  ★" : "  ·"));
  }

  //  ── 層 1/2/3：每個素質的 40 → 90 配對變化
  for (const stat of stats) {
    const A = rows.filter((r) => r.stat === stat && r.value === 40);
    const B = rows.filter((r) => r.stat === stat && r.value === 90);
    if (!A.length || !B.length) continue;
    console.log(`\n## ${stat}（40 → 90，配對 n=${Math.min(A.length, B.length)}）`);
    console.log(`${"衍生量".padEnd(18)}${"40".padStart(10)}${"70".padStart(10)}${"90".padStart(10)}${"配對Δ".padStart(10)}${"95% CI".padStart(22)}  顯著   相對`);
    for (const [name, f] of Object.entries(DERIVED)) {
      const p = pairedDiff(A, B, f);
      if (!p) continue;
      const mA = mean(A.map(f)), mM = mean(base.map(f)), mB = mean(B.map(f));
      const rel = mA !== 0 ? (p.d / Math.abs(mA)) * 100 : NaN;
      console.log(
        name.padEnd(18) +
        mA.toFixed(3).padStart(10) + mM.toFixed(3).padStart(10) + mB.toFixed(3).padStart(10) +
        p.d.toFixed(3).padStart(10) +
        `[${p.lo.toFixed(3)}, ${p.hi.toFixed(3)}]`.padStart(22) +
        (p.sig ? "  ★  " : "  ·  ") +
        (Number.isFinite(rel) ? `${rel >= 0 ? "+" : ""}${rel.toFixed(1)}%` : "—").padStart(8));
    }
    crossRows.push({
      tag: TAG, stat,
      dRetreat: pairedDiff(A, B, (r) => r.retreats)?.d ?? 0,
      dDeath: pairedDiff(A, B, (r) => r.d)?.d ?? 0,
      dUptime: pairedDiff(A, B, (r) => r.fightUptime)?.d ?? 0,
      dPush: pairedDiff(A, B, (r) => r.towerPushes)?.d ?? 0,
      dPushPerFightMin: pairedDiff(A, B, DERIVED["推塔/作戰分"])?.d ?? 0,
      dReturnRatio: pairedDiff(A, B, DERIVED["重返/撤退"])?.d ?? 0,
    });
  }
}

//  ── 跨素質回歸：ΔtowerPushes ~ a·Δretreats + b·Δdeaths + c
//  每一個素質貢獻一個點。這在問：把所有素質放在一起看，推塔的變化到底
//  是跟著「撤退變多」走，還是跟著「死亡變少」走。
if (crossRows.length >= 4) {
  console.log(`\n${"=".repeat(100)}`);
  console.log(`# 跨素質回歸（每個素質一個點，n=${crossRows.length}）`);
  console.log(`${"=".repeat(100)}`);
  console.log(`${"素質".padEnd(16)}${"Δ撤退".padStart(10)}${"Δ死亡".padStart(10)}${"Δ作戰持續".padStart(12)}${"Δ推塔".padStart(10)}${"Δ推塔/作戰分".padStart(14)}${"Δ重返率".padStart(11)}`);
  for (const c of crossRows) {
    console.log(c.stat.padEnd(16) + c.dRetreat.toFixed(2).padStart(10) + c.dDeath.toFixed(2).padStart(10) +
      (c.dUptime * 100).toFixed(2).padStart(11) + "pp" + c.dPush.toFixed(2).padStart(10) +
      c.dPushPerFightMin.toFixed(4).padStart(14) + c.dReturnRatio.toFixed(4).padStart(11));
  }
  for (const [nx, key] of [["Δ撤退", "dRetreat"], ["Δ死亡", "dDeath"], ["Δ作戰持續", "dUptime"]]) {
    const c1 = corr(crossRows.map((r) => r[key]), crossRows.map((r) => r.dPush));
    const c2 = corr(crossRows.map((r) => r[key]), crossRows.map((r) => r.dPushPerFightMin));
    if (c1) console.log(`\n  r(${nx}, Δ推塔)      = ${c1.r.toFixed(3)}  [${c1.lo.toFixed(3)}, ${c1.hi.toFixed(3)}]` + (c1.lo * c1.hi > 0 ? "  ★" : "  ·"));
    if (c2) console.log(`  r(${nx}, Δ推塔/作戰分) = ${c2.r.toFixed(3)}  [${c2.lo.toFixed(3)}, ${c2.hi.toFixed(3)}]` + (c2.lo * c2.hi > 0 ? "  ★" : "  ·"));
  }
  const cD = corr(crossRows.map((r) => r.dDeath), crossRows.map((r) => r.dPush));
  if (cD) console.log(`\n  ⇒ 關鍵：r(Δ死亡, Δ推塔) = ${cD.r.toFixed(3)}  [${cD.lo.toFixed(3)}, ${cD.hi.toFixed(3)}]`);
  console.log(`     正相關 = 「死得多的同時推得多」⇒ 少死並沒有換到推進，收益鏈斷在轉換這一段。`);
}

console.log(`\n★ = 95% CI 不含 0`);
