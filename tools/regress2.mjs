// ============================================================================
//  regress2 — MOBA 節奏回歸門檻（S29 重寫）
//  執行：repo 根目錄 `node tools/regress2.mjs`；**失敗時 exit code 1**。
//
//  S29 之前：本檔只 console.log，沒有任何斷言、永遠 exit 0；由呼叫端去 grep
//    「15-25分達標 19/20」這個**數值快照**當門檻。那個門檻有兩個致命問題：
//
//    1) 它是為當時的輸出量身訂做的（19/20 就是那次跑出來的數字）。
//    2) **它對真正的病灶零檢定力。** 實測（60 seeds）：
//         v1（S28 舊引擎，5 分鐘就倒 8.8 座塔、全場 Lv1 的壞節奏）
//           → 時長 15.4~21.4 分 ⇒ 「15-25 分達標」**20/20 全中**、完美過關。
//         v2（S29 校準後）
//           → 時長 10.5~29.0 分 ⇒ 「15-25 分達標」只有 15/20。
//       也就是說：舊門檻會把壞引擎判為滿分、把修好的引擎判為退步。時長分布
//       根本不是節奏是否健康的判準——「5 分鐘的塔數與等級」才是。
//
//  S29 之後：改為四類門檻（見下方 GATES），全部取自 **60 seeds 真實分布**，
//    並要求能區分 v1 與 v2（有檢定力），而非框住某一次輸出。
//    門檻依據與 v1/v2 對照表：docs/design/MOBA對戰執行與時間系統.md §節奏門檻
// ============================================================================
import { NEXUS_HP, PITS, dist, clamp } from "../src/gameData.js";
const { LogicEngine } = await import("../src/LogicEngine.js");

const DT = 0.5;
const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 5555, 314, 271, 1618, 8080, 4242, 11, 88, 256, 1000, 9999];
// 觀測上限 45 分：刻意**高於**門檻上限 32 分 ⇒ 「拖過 32 分」是可觀測的失敗，
//   而不是被 loop 上限截斷成「沒結束」而已（舊版 cap=30 分，看不出到底拖多久）。
const CAP = 2700;

// ── 門檻（依據：60 seeds 分布 + v1/v2 鑑別力，見檔頭與設計文件）─────────────────
const GATES = {
  // 1) 收得掉：MOBA 對局必須結束。v1/v2 都是 60/60，這是底線不是成就。
  endRate: 1.0,
  // 2) 無極端過早／過長（逐場）。v2 實測 10.5~29.0 分。
  //    下限 8 分：低於此 = 塔又在融化（v1 病灶區；v1 首塔 <2.5 分）。留 2.5 分餘裕。
  //    上限 32 分：設計目標 15–25 分 + 約 1 個標準差（sd≈5）。留 3 分餘裕。
  minMinutes: 8.0,
  maxMinutes: 32.0,
  // 3) 平均／中位數落在合理 MOBA 區間。v2 實測 平均 19.65、中位 20.4（20 seeds）。
  //    區間 [14,26] = 設計目標 15–25 分左右各留 1 分容忍。
  meanLo: 14.0, meanHi: 26.0,
  medLo: 14.0, medHi: 26.0,
  // 4) 5 分鐘節奏符合 S29 規格（**這組才是有鑑別力的**）：
  //    塔：全場 18 座非主堡塔。v1 平均 8.83（最少也有 8 座）、v2 平均 0.48（最多 2 座）。
  //      門檻 平均 ≤3.0 / 逐場 ≤5：夾在 v1 的 8 與 v2 的 2 之間，兩邊都有大餘裕。
  tw5MeanMax: 3.0, tw5Max: 5,
  //    等級：v1 恆為 1.00（沒有本場 XP）、v2 平均 5.67（最低 4.8）。
  //      門檻 逐場 ≥3.0 / 平均落在 [4.0, 9.0]：v1 直接掛，v2 留 1.8 級餘裕。
  lv5Min: 3.0, lv5MeanLo: 4.0, lv5MeanHi: 9.0,
};

let ends = 0, blueW = 0, aceGames = 0, comebacks = 0, totK = 0, baronGames = 0;
const durs = [], tw5s = [], lv5s = [];
for (const seed of SEEDS) {
  const e = new LogicEngine(seed);
  let aces = 0, pAll = { blue: false, red: false }, minWinProb = 1, maxWinProb = 0, baronKilled = 0, pb = false, m5 = null;
  for (let t = DT; t <= CAP && !e.over; t += DT) {
    e.tick(DT);
    for (const s of ["blue", "red"]) {
      const sq = e.players.filter((p) => p.side === s);
      const all = sq.length && sq.every((p) => p.dead);
      if (all && !pAll[s]) aces++;
      pAll[s] = all;
    }
    const wp = e.snapshot().winProb;
    minWinProb = Math.min(minWinProb, wp); maxWinProb = Math.max(maxWinProb, wp);
    if (pb && !e.baron.alive) baronKilled++;
    pb = e.baron.alive;
    // 5 分鐘節奏取樣（S29 規格的核心判準）
    if (!m5 && e.t >= 300) m5 = {
      tw: Object.values(e.towers).filter((x) => x.lane !== "nexus" && x.hp <= 0).length,
      lv: e.players.reduce((s, p) => s + p.mlv, 0) / 10,
    };
  }
  ends += e.over ? 1 : 0;
  if (e.winner === "blue") blueW++;
  if (aces > 0) aceGames++;
  totK += e.bK + e.rK;
  durs.push(e.t / 60);
  tw5s.push(m5?.tw ?? 0);
  lv5s.push(m5?.lv ?? 1);
  if (baronKilled > 0) baronGames++;
  const finalBlue = e.winner === "blue";
  if ((finalBlue && minWinProb < 0.4) || (!finalBlue && maxWinProb > 0.6)) comebacks++;
}

const n = SEEDS.length;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sorted = [...durs].sort((a, b) => a - b);
const median = sorted[Math.floor(n / 2)];
const dMean = mean(durs), dMin = Math.min(...durs), dMax = Math.max(...durs);
const tw5Mean = mean(tw5s), lv5Mean = mean(lv5s), lv5Min = Math.min(...lv5s);

// ── 報告（保留舊的觀測輸出，呼叫端仍 grep「結束率 20/20」）────────────────────
console.log(`結束率 ${ends}/${n} | 藍勝 ${blueW} 紅勝 ${ends - blueW}（平衡度 ${Math.abs(blueW / ends - 0.5).toFixed(2)}）`);
console.log(`時長 平均${dMean.toFixed(1)}分 中位${median.toFixed(1)} 範圍${dMin.toFixed(1)}~${dMax.toFixed(1)}分`);
console.log(`平均擊殺 ${(totK / n).toFixed(1)} | ACE場次 ${aceGames}/${n} | Baron場次 ${baronGames}/${n} | 逆轉場次 ${comebacks}/${n}`);
console.log(`5分鐘節奏 塔倒 平均${tw5Mean.toFixed(2)}座(最多${Math.max(...tw5s)}) | 英雄均等級 平均${lv5Mean.toFixed(2)}(最低${lv5Min.toFixed(1)})`);

// ── 門檻判定 ───────────────────────────────────────────────────────────────
const G = [];
const gate = (name, ok) => G.push([name, !!ok]);
gate(`收得掉：${ends}/${n} 場正常結束（需 ${n}/${n}）`, ends === n);
gate(`無極端過早：最短 ${dMin.toFixed(1)} 分（需 ≥ ${GATES.minMinutes}）`, dMin >= GATES.minMinutes);
gate(`無極端過長：最長 ${dMax.toFixed(1)} 分（需 ≤ ${GATES.maxMinutes}）`, dMax <= GATES.maxMinutes);
gate(`平均時長 ${dMean.toFixed(1)} 分落在 [${GATES.meanLo}, ${GATES.meanHi}]`, dMean >= GATES.meanLo && dMean <= GATES.meanHi);
gate(`中位時長 ${median.toFixed(1)} 分落在 [${GATES.medLo}, ${GATES.medHi}]`, median >= GATES.medLo && median <= GATES.medHi);
gate(`5分塔數 平均 ${tw5Mean.toFixed(2)} ≤ ${GATES.tw5MeanMax} 且逐場 ≤ ${GATES.tw5Max}（v1 病灶：平均 8.83）`,
  tw5Mean <= GATES.tw5MeanMax && Math.max(...tw5s) <= GATES.tw5Max);
gate(`5分英雄等級 逐場均等級 ≥ ${GATES.lv5Min}（最低 ${lv5Min.toFixed(1)}；v1 病灶：恆為 1.0）`, lv5Min >= GATES.lv5Min);
gate(`5分英雄等級 平均 ${lv5Mean.toFixed(2)} 落在 [${GATES.lv5MeanLo}, ${GATES.lv5MeanHi}]`,
  lv5Mean >= GATES.lv5MeanLo && lv5Mean <= GATES.lv5MeanHi);

console.log("");
let pass = 0;
for (const [name, ok] of G) { console.log(`${ok ? "✅" : "❌"} ${name}`); if (ok) pass++; }
console.log(`\n節奏門檻 ${pass}/${G.length} 通過`);
process.exit(pass === G.length ? 0 : 1);
