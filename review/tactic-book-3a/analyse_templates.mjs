// 讀 tools/fixtures/tactic_followup_3a_templates.json，算出「模板行為分群」報告所需的全部數字，並產生報告。
// 用法：node review/tactic-book-3a/analyse_templates.mjs   （只讀一個 JSON；輸出 review/tactic-book-3a/模板行為分群.md 與 stdout 的核對摘要）
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\\/g, "/").replace(/\/$/, "");
const SRC = ROOT + "/tools/fixtures/tactic_followup_3a_templates.json";
const OUT = ROOT + "/review/tactic-book-3a/模板行為分群.md";
const r = JSON.parse(fs.readFileSync(SRC, "utf8"));
const M = r.rule.metrics, Z = r.rule.minAbsZ, N = r.summary[0].n;
const ids = r.summary.map((s) => s.template);
const mean = Object.fromEntries(r.summary.map((s) => [s.template, s.means]));
const wr = Object.fromEntries(r.summary.map((s) => [s.template, s]));
const c = (s) => "`" + s + "`";
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);
const pct = (x) => (x >= 0 ? "+" : "") + (100 * x).toFixed(0) + "%";
const pct1 = (x) => (x >= 0 ? "+" : "") + (100 * x).toFixed(1) + "%";

// ── 慣例驗證：z>0 ⇒ b 的平均較高；rel＝(b−a)/a ──
let convZ = 0, convRel = 0;
for (const p of r.pairs) {
  const A = mean[p.a][p.strongest.metric], B = mean[p.b][p.strongest.metric];
  if (Math.sign(B - A) === Math.sign(p.strongest.z)) convZ++;
  if (Math.abs((B - A) / A - p.strongest.rel) < 0.002) convRel++;
}
const pairOf = (x, y) => r.pairs.find((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x));
// 以 (x→y) 方向表示：z>0 ⇒ y 較高
const orient = (x, y) => { const p = pairOf(x, y); const flip = p.a !== x; const s = p.strongest; return { p, z: flip ? -s.z : s.z, rel: (mean[y][s.metric] - mean[x][s.metric]) / mean[x][s.metric] }; };

// ── 1. 不可區分圖 ──
const edges = r.pairs.filter((p) => !p.distinct);
const edgeSet = new Set(edges.map((p) => [p.a, p.b].sort().join("|")));
const adj = Object.fromEntries(ids.map((i) => [i, new Set()]));
for (const p of edges) { adj[p.a].add(p.b); adj[p.b].add(p.a); }
const comps = [], seen = new Set();
for (const i of ids) { if (seen.has(i)) continue; const q = [i], comp = []; seen.add(i); while (q.length) { const x = q.pop(); comp.push(x); for (const y of adj[x]) if (!seen.has(y)) { seen.add(y); q.push(y); } } comp.sort((a, b) => ids.indexOf(a) - ids.indexOf(b)); comps.push(comp); }
const multi = comps.filter((x) => x.length > 1).sort((a, b) => b.length - a.length);
const cliques = [];
(function bk(R, P, X) { if (!P.length && !X.length) { if (R.length >= 2) cliques.push(R.slice().sort((a, b) => ids.indexOf(a) - ids.indexOf(b))); return; } for (const v of P.slice()) { bk([...R, v], P.filter((u) => adj[v].has(u)), X.filter((u) => adj[v].has(u))); P = P.filter((u) => u !== v); X = [...X, v]; } })([], ids.slice(), []);
cliques.sort((a, b) => b.length - a.length || ids.indexOf(a[0]) - ids.indexOf(b[0]));
const big = multi[0];
const bigPairs = [];
for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) bigPairs.push(pairOf(big[i], big[j]));
const bigInd = bigPairs.filter((p) => !p.distinct), bigDis = bigPairs.filter((p) => p.distinct);
const groupsMatch = JSON.stringify(multi.map((x) => [...x].sort())) === JSON.stringify([...r.groups].map((g) => [...g].sort()).sort((a, b) => b.length - a.length));
const cliquesInBig = cliques.filter((q) => q.every((x) => big.includes(x)));
const sizeCount = {}; for (const q of cliques) sizeCount[q.length] = (sizeCount[q.length] || 0) + 1;
const edgesInBig = edges.filter((p) => big.includes(p.a) && big.includes(p.b)).length;

// ── 2. 對 std 簽名 ──
const short = (m) => m;
const sig = {};
for (const t of ids) {
  if (t === "std") continue;
  const p = pairOf("std", t), o = orient("std", t);
  sig[t] = { metrics: p.distinctMetrics.map((m) => ({ m, d: mean[t][m] - mean.std[m], rel: (mean[t][m] - mean.std[m]) / mean.std[m] })), strongest: { metric: p.strongest.metric, z: o.z, rel: o.rel }, distinct: p.distinct };
}
const sigStr = (t) => sig[t].metrics.length ? sig[t].metrics.map((x) => (x.d > 0 ? "↑" : "↓") + c(x.m) + " " + pct(x.rel)).join("；") : "（無指標達 |z|≥4）";

// ── 3. 指標鑑別力 ──
const pow = Object.fromEntries(M.map((m) => [m, 0])), powStd = Object.fromEntries(M.map((m) => [m, 0]));
for (const p of r.pairs) for (const m of p.distinctMetrics) { pow[m]++; if (p.a === "std" || p.b === "std") powStd[m]++; }
const strongestCount = Object.fromEntries(M.map((m) => [m, 0])); for (const p of r.pairs) strongestCount[p.strongest.metric]++;

// ── 4. 軸 ──
const AXES = [
  ["站位", ["laneForward.top", "laneForward.mid", "laneForward.bot"]],
  ["打野抓人／入侵", ["ganksPerMin", "invasionsActed"]],
  ["輔助遊走／保護", ["supportRoamsPerMin", "supportProtectsPerMin"]],
  ["接戰與撤退", ["retreatStartsPerMin", "fightEntriesPerMinAll", "engageDecisionsPerMin"]],
  ["物件團戰", ["objectiveFightEntriesPerMin.dragon", "objectiveFightEntriesPerMin.baron"]],
  ["圍塔", ["siegeWindowsPerMin"]],
  ["席位參團", ["seatFightEntriesPerMin.b1", "seatFightEntriesPerMin.b3"]],
  ["核心保護", ["coreProtectsPerMin.adc"]],
];
const axisOf = Object.fromEntries(AXES.flatMap(([a, ms]) => ms.map((m) => [m, a])));
const axisCover = AXES.reduce((n, [, ms]) => n + ms.length, 0);
const tplAxes = {}; for (const t of Object.keys(sig)) tplAxes[t] = [...new Set(sig[t].metrics.map((x) => axisOf[x.m]))];
const axisTpl = Object.fromEntries(AXES.map(([a]) => [a, Object.keys(sig).filter((t) => tplAxes[t].includes(a))]));
const axisPairs = Object.fromEntries(AXES.map(([a]) => [a, 0])), axisOnly = Object.fromEntries(AXES.map(([a]) => [a, 0])), axisPow = Object.fromEntries(AXES.map(([a]) => [a, 0]));
let multiAxisPairs = 0;
for (const p of r.pairs) { if (!p.distinct) continue; const ax = [...new Set(p.distinctMetrics.map((m) => axisOf[m]))]; for (const a of ax) axisPairs[a]++; if (ax.length === 1) axisOnly[ax[0]]++; else multiAxisPairs++; for (const m of p.distinctMetrics) axisPow[axisOf[m]]++; }
const strongestAxis = Object.fromEntries(AXES.map(([a]) => [a, 0])); for (const p of r.pairs) if (p.distinct) strongestAxis[axisOf[p.strongest.metric]]++;
const nStdDistinct = Object.keys(sig).filter((t) => sig[t].distinct).length;

// ── 5. 名稱／說明 vs 實測（v2：加入出處、時機類、無法對應類）──
// 主張＝人工從 name／desc／detail／cons 原文讀出、且原文「明確說到」的說法。一條主張的 kind：
//   n＝可對應到某指標的次數／位置主張（u＝高於 std，d＝低於）→ 判定 量到／方向相反／沒量到
//   t＝時機主張（較早救人、撤退較晚…），指標只數「次數」→ 判定「次數有變、時機未量」（不論次數達不達標都歸此類）
//   x＝無法對應（階段限定的主張而指標不分階段；或原文沒有指明可量測行為）→ 判定「無法對應」
const L = (x) => "laneForward." + x, S = (x) => "seatFightEntriesPerMin." + x, O = (x) => "objectiveFightEntriesPerMin." + x;
const GK = "ganksPerMin", INV = "invasionsActed", ROAM = "supportRoamsPerMin", PROT = "supportProtectsPerMin", RET = "retreatStartsPerMin", FE = "fightEntriesPerMinAll", ENG = "engageDecisionsPerMin", SIEGE = "siegeWindowsPerMin", CORE = "coreProtectsPerMin.adc";
const TC = "src/platform/tactics/tacticTemplates.js", MC = "src/platform/contracts/MobaTacticConfig.js";
const n = (m, d, note) => [m, d, "n", note], t = (m, d, note) => [m, d, "t", note], x = (note) => [null, null, "x", note];
const PROT_T = t(PROT, "u", "「出手救人的時機也比較早」是時機；指標只數新增保護決策次數");
const CLAIMS = {
  "classic.m1": { src: MC + ":60-62", text: "速推流：desc「集中兵線快速推塔」；cons「壓線深、撤退晚…Dragon 讓渡給對手」（「壓線深」未指明哪一路；本報告對到 focus 欄「中路」的 laneForward.mid）", cl: [n(SIEGE, "u"), n(L("mid"), "u", "cons「壓線深」"), t(RET, "d", "cons「撤退晚」是時機；指標只數撤退開始次數"), n(O("dragon"), "d", "cons「Dragon 讓渡給對手」")] },
  "classic.m2": { src: MC + ":74-76", text: "四一分推：detail「其餘四人控 Dragon 與視野」；「一人帶線牽制」；cons「上路缺席會戰，4v5 打團吃虧」", cl: [n(O("dragon"), "u"), n(S("b1"), "d", "cons「上路缺席會戰」"), x("「一人帶線牽制」：原文未指明可量測行為")] },
  "classic.m3": { src: MC + ":89-91", text: "強開團：desc「先手開團強起會戰」；cons「撤退門檻極低」（方向有歧義，本表依字面解為「較易撤退」）", cl: [n(ENG, "u"), n(FE, "u"), n(RET, "u", "cons「撤退門檻極低」，對到撤退開始次數")] },
  "classic.m4": { src: MC + ":104-106", text: "龍堆運營：desc「圍繞 Dragon / Baron 資源」；detail「打野控制 Dragon / Baron 節奏」；cons「推塔慢、前期被壓也不還手」", cl: [n(O("dragon"), "u"), n(O("baron"), "u"), n(SIEGE, "d", "cons「推塔慢」"), x("「前期被壓也不還手」：前期限定，指標不分階段")] },
  "classic.m5": { src: MC + ":118-120", text: "下路強攻：detail「打野頻繁下路 gank」（註：ganksPerMin 不分路，三路合計）；cons「資源全押下路，上中被放養」", cl: [n(GK, "u"), x("「資源全押下路，上中被放養」：原文指資源分配，16 指標無對應")] },
  "classic.m6": { src: MC + ":133-135", text: "全圖游走：desc「中野聯動全圖製造人數差」；detail「中單與打野高機動游走」；cons「游走撲空就虧線…」（結果性敘述）", cl: [x("「中野聯動／高機動游走」：16 指標中沒有中單或打野游走的對應指標；原文未寫抓人次數")] },
  "classic.m7": { src: MC + ":148-150", text: "前期壓制：desc「前期強勢全線壓制」；archetype「前期入侵」；cons「入侵翻車直接送節奏；拖入後期全面劣勢」（結果性敘述）", cl: [n(L("top"), "u"), n(L("mid"), "u"), n(L("bot"), "u"), n(INV, "u", "來源為 archetype 欄「前期入侵」")] },
  "classic.m8": { src: MC + ":163-165", text: "後期決戰：detail「前期穩健防守，靠後期陣容強度決勝」；cons「前期塔與資源全讓」", cl: [x("「前期穩健防守」：階段限定，且原文未指明可量測行為"), x("「前期塔與資源全讓」：前期限定，指標不分階段（siegeWindowsPerMin、物件接戰皆為全場）")] },
  "v2.three_lane_pressure": { src: TC + ":82-84", text: "上、中、下三路站位都推得更前面；打野抓人次數更多；輔助較少離開下路；出手救人時機較早；前期更敢主動接戰", cl: [n(L("top"), "u"), n(L("mid"), "u"), n(L("bot"), "u"), n(GK, "u"), n(ROAM, "d"), PROT_T, x("「前期隊伍更敢主動接戰」：前期限定的接戰意願；fightEntriesPerMinAll 為全場進入團戰次數")] },
  "v2.jungle_invasion": { src: TC + ":92-94", text: "開局入侵；打野抓人更勤；中路站位更前；輔助更常離開下路；前期更敢接戰；cons：撤退稍晚、投入團戰門檻稍低", cl: [n(INV, "u"), n(GK, "u"), n(L("mid"), "u"), n(ROAM, "u"), n(ENG, "u"), t(RET, "d", "「撤退的時機比平常稍微晚一點」是時機；指標只數撤退開始次數"), x("「前期隊伍比較敢主動接戰」：前期限定的接戰意願，指標不分階段")] },
  "v2.bot_duo_pressure": { src: TC + ":103-105", text: "下路站位更前、上路稍後；打野抓人更多；輔助較少離開下路；優先救射手；救人時機較早；前／中／後期對龍參與皆更多；前期更敢接戰", cl: [n(L("bot"), "u"), n(L("top"), "d"), n(GK, "u"), n(ROAM, "d"), n(CORE, "u"), PROT_T, n(O("dragon"), "u"), x("「前期隊伍比較敢主動接戰」：前期限定的接戰意願，指標不分階段")] },
  "v2.mid_jungle_sync": { src: TC + ":115-117", text: "中路站位更前；輔助更常離開下路；前／中／後期對龍參與皆更多；中期更敢接戰", cl: [n(L("mid"), "u"), n(ROAM, "u"), n(O("dragon"), "u"), x("「中期隊伍更敢主動接戰」：中期限定的接戰意願，指標不分階段")] },
  "v2.support_roamer": { src: TC + ":126-128", text: "輔助離開下路的次數多很多；射手站位靠後；對龍稍微更願意參與", cl: [n(ROAM, "u"), n(L("bot"), "d"), n(O("dragon"), "u")] },
  "v2.dragon_pit_macro": { src: TC + ":137-139", text: "對龍的爭奪遠比平常更願意參與；稍微更願意加入團戰；輔助較少離開下路；出手救人時機較早", cl: [n(O("dragon"), "u"), n(FE, "u"), n(ROAM, "d"), PROT_T] },
  "v2.top_solo_split": { src: TC + ":148-150", text: "上路通常不參加團戰；上路站位更前；中路站位靠後；隊伍稍微更願意加入團戰；救人時機較早", cl: [n(S("b1"), "d"), n(L("top"), "u"), n(L("mid"), "d"), n(FE, "u"), PROT_T] },
  "v2.mid_solo_split": { src: TC + ":159-161", text: "中單打團時通常不參加團戰；中路站位更前；射手站位靠後；救人時機較早；對龍稍微更願意參與", cl: [n(S("b3"), "d"), n(L("mid"), "u"), n(L("bot"), "d"), PROT_T, n(O("dragon"), "u")] },
  "v2.hard_engage_stack": { src: TC + ":171-173", text: "加入團戰的程度高很多；投入團戰門檻較低；救人時機較早；cons：撤退稍晚；中期更敢接戰、中後期對巴龍更願意參與", cl: [n(FE, "u"), n(ENG, "u"), PROT_T, t(RET, "d", "「撤退的時機比平常稍微晚一點」是時機；指標只數撤退開始次數"), x("「中期隊伍更敢主動接戰」：中期限定，指標不分階段"), x("「中期對巴龍…後期對巴龍稍微更願意參與」：只主張中後期，指標不分階段")] },
  "v2.protect_core_scaling": { src: TC + ":182-184", text: "上路和中路站位靠後；打野抓人較少；優先救射手；救人時機較早、撤退時機較早；前期不太主動接戰；中後期更願意加入團戰與爭龍巴龍", cl: [n(L("top"), "d"), n(L("mid"), "d"), n(GK, "d"), n(CORE, "u"), PROT_T, t(RET, "u", "「撤退的時機也比平常稍微早一點」是時機；指標只數撤退開始次數"), x("「前期不太主動接戰」：前期限定，指標不分階段"), x("「中期稍微／後期更願意加入團戰」：只主張中後期，指標不分階段"), x("「中期對龍和巴龍稍微／後期更願意參與」：只主張中後期，指標不分階段")] },
  "v2.standard_macro": { src: TC + ":194-196", text: "輔助較少離開下路；出手救人時機較早；對龍稍微更願意參與", cl: [n(ROAM, "d"), PROT_T, n(O("dragon"), "u")] },
  "v2.defensive_hold": { src: TC + ":204-206", text: "三路站位全部往後；打野抓人明顯較少；投入團戰門檻較高；救人時機較早；撤退時機較早；前期和中期不太主動接戰、前期和中期較少爭龍", cl: [n(L("top"), "d"), n(L("mid"), "d"), n(L("bot"), "d"), n(GK, "d"), n(ENG, "d"), PROT_T, t(RET, "u", "「撤退的時機比平常稍微早一點」是時機；指標只數撤退開始次數"), x("「前期和中期不太主動接戰」：前中期限定，指標不分階段"), x("「前期和中期對龍的爭奪比較少參與」：前中期限定，指標不分階段")] },
};
const dirWord = (d) => (d === "u" ? "高於" : "低於");
const claimRows = [];
const cnt = { hit: 0, opp: 0, miss: 0, timing: 0, na: 0 };
let nClaims = 0;
for (const tid of ids) {
  if (tid === "std") { claimRows.push({ t: tid, src: MC + ":183-184", claim: "中性基準（「對手預設：均衡分路與資源分配」）", base: true }); continue; }
  const cl = CLAIMS[tid], row = { t: tid, src: cl.src, claim: cl.text, hit: [], opp: [], miss: [], timing: [], na: [], extra: [] };
  const claimed = new Set();
  for (const [m, d, kind, note] of cl.cl) {
    nClaims++;
    if (kind === "x") { row.na.push(note); cnt.na++; continue; }
    claimed.add(m);
    const sx = sig[tid].metrics.find((y) => y.m === m), rel = (mean[tid][m] - mean.std[m]) / mean.std[m];
    if (kind === "t") { row.timing.push(c(m) + " 次數" + (sx ? "達標 " + (sx.d > 0 ? "↑" : "↓") + pct(sx.rel) : "未達門檻（平均差 " + pct(rel) + "）") + "；" + note); cnt.timing++; continue; }
    if (sx) { if ((sx.d > 0) === (d === "u")) { row.hit.push(c(m) + " " + pct(sx.rel)); cnt.hit++; } else { row.opp.push(c(m) + " 主張" + dirWord(d) + "、實測" + pct(sx.rel)); cnt.opp++; } }
    else { row.miss.push(c(m) + " 主張" + dirWord(d) + "（平均差 " + pct(rel) + "，未達門檻）"); cnt.miss++; }
  }
  row.extra = sig[tid].metrics.filter((y) => !claimed.has(y.m)).map((y) => c(y.m) + " " + pct(y.rel));
  claimRows.push(row);
}
const nHit = cnt.hit, nOpp = cnt.opp, nMiss = cnt.miss, nTim = cnt.timing, nNA = cnt.na;
const claimSum = nHit + nOpp + nMiss + nTim + nNA;

// M4：決策事件計數類指標的依賴度（獨立由 pairs 重算）
const SETS = {
  "A（鑑別力最高的三個指標）supportRoamsPerMin＋supportProtectsPerMin＋coreProtectsPerMin.adc": [ROAM, PROT, CORE],
  "B（專案事前登記增補點名）engageDecisionsPerMin＋supportProtectsPerMin＋coreProtectsPerMin.adc": [ENG, PROT, CORE],
  "C（A∪B：以上四個）": [ROAM, PROT, CORE, ENG],
};
const dep = Object.fromEntries(Object.entries(SETS).map(([k, ms]) => {
  const dp = r.pairs.filter((p) => p.distinct);
  return [k, { any: dp.filter((p) => p.distinctMetrics.some((m) => ms.includes(m))).length, only: dp.filter((p) => p.distinctMetrics.every((m) => ms.includes(m))).length, total: dp.length }];
}));

// 特別檢查用
const meanRow = (t, ms) => ms.map((m) => f3(mean[t][m])).join(" / ");
const pairLine = (x, y) => { const o = orient(x, y), p = o.p; return c(x) + " vs " + c(y) + "：" + (p.distinct ? "可區分" : "量不出差別") + "；達標指標 " + (p.distinctMetrics.length ? p.distinctMetrics.map(c).join("、") : "無") + "；最強 " + c(p.strongest.metric) + " z=" + f2(o.z) + "（以 " + y + " 減 " + x + " 為正）、相對差 " + pct1(o.rel); };

// ── 6. 家族（依實測簽名的規則分派；規則順序即優先序）──
const has = (t, m) => sig[t].metrics.some((x) => x.m === m);
const dirOf = (t, m) => { const x = sig[t].metrics.find((y) => y.m === m); return x ? (x.d > 0 ? 1 : -1) : 0; };
const fam = {};
const FAMS = [
  ["F0 與 std 量不出差別", (t) => sig[t].metrics.length === 0],
  ["F1 入侵型", (t) => has(t, INV)],
  ["F2 輔助遊走增加型", (t) => dirOf(t, ROAM) === 1],
  ["F3 輔助保護增加＋接戰降低型", (t) => dirOf(t, PROT) !== -1 && (dirOf(t, ENG) === -1 || dirOf(t, FE) === -1) && (has(t, PROT) || has(t, CORE))],
  ["F4 輔助保護增加＋接戰／巨龍增加型", (t) => (dirOf(t, ENG) === 1 || dirOf(t, O("dragon")) === 1) && has(t, PROT)],
  ["F5 輔助保護增加型（其餘）", (t) => has(t, PROT) || has(t, CORE)],
  ["F6 接戰降低型（其餘）", (t) => dirOf(t, FE) === -1 || dirOf(t, ENG) === -1],
];
// F3 排除 defensive_hold 這類沒有 PROT 但有 CORE 的情形時，仍以規則判斷（見輸出）
for (const t of Object.keys(sig)) { const k = FAMS.find(([, fn]) => fn(t)); fam[t] = k ? k[0] : "未分類"; }
// 家族表（以規則結果為準，並輸出每個成員的簽名供核對）
const famGroups = {}; for (const t of Object.keys(sig)) (famGroups[fam[t]] ??= []).push(t);

// ── 7. 勝率信賴區間（Wilson 95%）──
const wilson = (k, n) => { const z = 1.959964, p = k / n, d = 1 + z * z / n, ctr = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [ctr - h, ctr + h]; };
const ciRows = ids.map((t) => { const k = Math.round(wr[t].blueWinRate * wr[t].n); const [lo, hi] = wilson(k, wr[t].n); return { t, k, n: wr[t].n, wr: wr[t].blueWinRate, lo, hi, w: hi - lo, dur: wr[t].avgDurationMin }; });
const wMin = Math.min(...ciRows.map((x) => x.w)), wMax = Math.max(...ciRows.map((x) => x.w));
const w50 = (() => { const [lo, hi] = wilson(30, 60); return [lo, hi, hi - lo]; })();
const diffHalf = 1.959964 * Math.sqrt(2 * 0.25 / 60);
const nTests = r.pairs.length * M.length, pTail = 6.334248e-5, expFalse = nTests * pTail;
const nonFull = ids.filter((t) => wr[t].n !== N).length;
const borderline = r.pairs.filter((p) => p.distinct && Math.abs(p.strongest.z) < 5);

// ───────────────────────── 產生報告 ─────────────────────────
const out = [];
const w = (s = "") => out.push(s);
w("# 21 個戰術模板的行為分群（只依實測結果檔）");
w();
w("資料來源：" + c("tools/fixtures/tactic_followup_3a_templates.json") + "（" + c(r.schema) + "；" + c(r.meta.simVersion) + "／" + c(r.meta.harnessVersion) + "；git " + r.meta.gitHead.slice(0, 7) + "；items=" + r.meta.items + "、skills=" + r.meta.skills + "）。");
w("方法（事前登記）：每個模板當藍方、紅方固定 " + c("std") + "，seeds " + r.rule.seeds[0] + "–" + r.rule.seeds[1] + "，n=" + N + "；取 16 個藍方行為指標；兩模板任一指標的配對 |z| ≥ " + Z + " 才算「行為上可區分」。本文所有數字都由結果檔經 " + c("analyse.mjs") + " 重算（見最後一節）。");
w("慣例：結果檔的 z 與 rel 一律以「b 減 a」為正（已逐筆驗證：" + convZ + "/210 筆 z 的正負號與平均差相符，" + convRel + "/210 筆 rel 等於 (b平均−a平均)/a平均）。下文凡寫「相對 std」的百分比，皆為 (模板平均 − std 平均)/std 平均，由 " + c("summary.means") + " 重算。");
w();
w("## 0. 結論摘要");
w();
w("- 210 對中 " + r.counts.distinctPairs + " 對可區分、" + edges.length + " 對量不出差別。連通分量有 " + multi.length + " 個多成員群（成員數 " + multi.map((x) => x.length).join("、") + "），加上 " + (comps.length - multi.length) + " 個單獨模板，共 " + comps.length + " 群（與結果檔 " + c("counts.behaviourGroups") + "=" + r.counts.behaviourGroups + " 一致）。");
w("- 連通分量不是等價類：8 成員分量內 " + bigPairs.length + " 對中，" + bigInd.length + " 對量不出差別、" + bigDis.length + " 對可區分。分量內極大團（兩兩都量不出差別的最大集合）共 " + cliquesInBig.length + " 個，最大者 " + Math.max(...cliquesInBig.map((q) => q.length)) + " 個成員。");
w("- 與 std 相比，" + nStdDistinct + "/20 個模板至少在一個指標上可區分；只有 " + Object.keys(sig).filter((t) => !sig[t].distinct).join("、") + " 量不出與 std 的差別。");
const dead = M.filter((m) => pow[m] === 0), low = M.filter((m) => pow[m] > 0 && pow[m] <= 5);
w("- 16 個指標中，區分 0 對的有 " + (dead.length ? dead.map(c).join("、") : "無") + "；區分 5 對以下的有 " + (low.length ? low.map((m) => c(m) + "（" + pow[m] + "）").join("、") : "無") + "。");
w("- 軸（第 5 節）：相對 std 動到的模板數由多到少：" + AXES.map(([a]) => [a, axisTpl[a].length]).sort((x, y) => y[1] - x[1]).map(([a, n]) => a + " " + n).join("、") + "（/20）。依實測簽名分成 " + Object.keys(famGroups).length + " 個行為家族（第 7 節，含「與 std 量不出差別」一族）。");
w("- 名稱／說明主張與實測的對照見第 6 節（" + nClaims + " 條原文明確的主張＝量到 " + nHit + " ＋ 方向相反 " + nOpp + " ＋ 沒量到 " + nMiss + " ＋ 次數有變、時機未量 " + nTim + " ＋ 無法對應 " + nNA + "）。");
w("- 195 對可區分、12 個連通分量、7 個行為家族是**三個不同的量**（分別是配對數、依「量不出差別」邊連出的分量數、依對 std 簽名分派的描述性家族數），**都不是「打法種類數」**。");
w("- 檢定共 " + nTests + " 個（" + r.counts.pairs + " 對 × " + M.length + " 指標）；「量不出差別」不等於「相同」，只代表在 n=" + N + " 下沒有指標達 |z|≥" + Z + "。");
w("- 鑑別力最高的指標多是決策事件計數，帶責任週期成分（第 3 節）：" + Object.entries(dep).map(([k, v]) => k.split("）")[0] + "）組：含其一者 " + v.any + "/" + v.total + " 對、只靠它們者 " + v.only + " 對").join("；") + "。");
w();

w("## 1. 不可區分圖");
w();
w("### 1.1 全部 " + edges.length + " 條「量不出差別」的邊");
w();
w("| # | a | b | 最強指標 | z（b−a） | 相對差 |");
w("|---|---|---|---|---|---|");
edges.forEach((p, i) => w("| " + (i + 1) + " | " + c(p.a) + " | " + c(p.b) + " | " + c(p.strongest.metric) + " | " + f2(p.strongest.z) + " | " + pct1(p.strongest.rel) + " |"));
w();
w("這些邊的最強 |z| 最大為 " + f2(Math.max(...edges.map((p) => Math.abs(p.strongest.z)))) + "，皆低於門檻 " + Z + "。（量不出差別 ≠ 證明相同。）");
w();
w("### 1.2 連通分量（把 " + edges.length + " 條邊當無向圖）");
w();
w("| 分量 | 成員數 | 成員 |");
w("|---|---|---|");
multi.forEach((x, i) => w("| C" + (i + 1) + " | " + x.length + " | " + x.map(c).join("、") + " |"));
w("| 其餘 | " + (comps.length - multi.length) + "（各自單獨） | " + comps.filter((x) => x.length === 1).map((x) => c(x[0])).join("、") + " |");
w();
w("核對：分量成員與結果檔 " + c("groups") + " " + (groupsMatch ? "完全相符" : "**不相符**") + "；分量內邊數 " + multi.map((x) => edges.filter((p) => x.includes(p.a) && x.includes(p.b)).length).join(" + ") + " = " + edges.length + "。");
w();
w("### 1.3 極大團（maximal cliques，大小 ≥ 2；Bron–Kerbosch）");
w();
w("共 " + cliques.length + " 個：" + Object.entries(sizeCount).sort((a, b) => b[0] - a[0]).map(([k, v]) => v + " 個大小 " + k).join("、") + "。極大團＝一組模板「兩兩之間都量不出差別」且無法再加入任何成員。");
w();
w("| # | 大小 | 成員 |");
w("|---|---|---|");
cliques.forEach((q, i) => w("| " + (i + 1) + " | " + q.length + " | " + q.map(c).join("、") + " |"));
w();
w("核對：每條邊至少落在一個極大團內：" + (edges.every((p) => cliques.some((q) => q.includes(p.a) && q.includes(p.b))) ? "是" : "否") + "；團內所有配對皆為「量不出差別」：" + (cliques.every((q) => q.every((x, i) => q.slice(i + 1).every((y) => edgeSet.has([x, y].sort().join("|"))))) ? "是" : "否") + "。");
w();
w("### 1.4 C1（" + big.length + " 成員）內 " + bigPairs.length + " 對逐對判定");
w();
w("連通分量只表示「可經由一串量不出差別的配對連起來」，**不表示成員彼此量不出差別**。C1 內 " + bigInd.length + " 對量不出差別、" + bigDis.length + " 對可區分（合計 " + (bigInd.length + bigDis.length) + " = C(" + big.length + ",2) = " + bigPairs.length + "）。");
w();
w("| a | b | 判定 | 達標指標數 | 最強指標 | z（b−a） | 相對差 |");
w("|---|---|---|---|---|---|---|");
for (const p of bigPairs) w("| " + c(p.a) + " | " + c(p.b) + " | " + (p.distinct ? "**可區分**" : "量不出差別") + " | " + p.distinctMetrics.length + " | " + c(p.strongest.metric) + " | " + f2(p.strongest.z) + " | " + pct1(p.strongest.rel) + " |");
w();
w("C1 內「真正兩兩都量不出差別」的極大團（" + cliquesInBig.length + " 個）：");
w();
cliquesInBig.forEach((q) => w("- " + q.length + " 成員：" + q.map(c).join("、")));
w();
w("C1 內每個成員所在的極大團數：" + big.map((x) => c(x) + " " + cliquesInBig.filter((q) => q.includes(x)).length).join("；") + "。");
w();
w("另外兩個多成員分量只有 2 個成員，邊本身就是團：" + multi.slice(1).map((x) => x.map(c).join(" ↔ ")).join("；") + "。");
w();

w("## 2. 每個模板相對 std 的行為簽名");
w();
w(c("std") + " 為基準（其 16 指標平均見下表末列）。「達標」＝與 std 的配對 |z| ≥ " + Z + "；↑／↓＝模板平均高於／低於 std；百分比＝相對 std 的差。結果檔只保存每對的「最強指標」z，其餘達標指標的 z 未保存，故只列方向與相對差。");
w();
w("| 模板 | 達標指標數 | 簽名 | 最強指標（z, 以模板減 std 為正） |");
w("|---|---|---|---|");
for (const t of Object.keys(sig)) w("| " + c(t) + " | " + sig[t].metrics.length + " | " + sigStr(t) + " | " + c(sig[t].strongest.metric) + " z=" + f2(sig[t].strongest.z) + "、" + pct1(sig[t].strongest.rel) + " |");
w();
w("std 基準平均：" + M.map((m) => c(m) + "=" + f3(mean.std[m])).join("；") + "。");
w();

w("## 3. 每個指標的鑑別力（210 對中有幾對達標）");
w();
w("| 指標 | 軸 | 區分幾對（/210） | 其中與 std 的配對（/20） | 作為該對「最強指標」的次數（分母：全部 210 對） |");
w("|---|---|---|---|---|");
[...M].sort((a, b) => pow[b] - pow[a]).forEach((m) => w("| " + c(m) + " | " + axisOf[m] + " | " + pow[m] + " | " + powStd[m] + " | " + strongestCount[m] + " |"));
w();
w("區分 0 對：" + (dead.length ? dead.map(c).join("、") : "無") + "。區分 5 對以下：" + (low.length ? low.map((m) => c(m) + "（" + pow[m] + "）").join("、") : "無") + "。");
w("**對決策事件計數指標的依賴**：鑑別力最高的三個指標（" + c(ROAM) + " " + pow[ROAM] + " 對、" + c(PROT) + " " + pow[PROT] + " 對、" + c(CORE) + " " + pow[CORE] + " 對）數的是決策／事件次數。專案事前登記增補（" + c("tools/measure_tactic_followup_3a.mjs") + " 第 29–33 行）點名的是 " + c(ENG) + "、" + c(PROT) + "、" + c(CORE) + " 三個：它們數「每次重評決策的結果」，帶責任週期成分；" + c(ROAM) + " 依 " + c("tacticTruthSim.mjs") + " 第 13 行是「設定遊走路線那一刻」的事件計數，**不在該登記點名之列**——「鑑別力最高的三個」與「登記點名的三個」因此不是同一組，所以兩組都算：");
w();
w("| 指標組 | 195 對可區分中，含其中至少一個達標的對數 | **只**靠這組指標達標的對數（其餘指標皆未達標） |");
w("|---|---|---|");
for (const [k, v] of Object.entries(dep)) w("| " + k + " | " + v.any + " / " + v.total + " | " + v.only + " / " + v.total + " |");
w();
w("說明：「區分幾對」可重複計入同一對（一對可能有多個指標達標），所以總和（" + M.reduce((s, m) => s + pow[m], 0) + "）大於 " + r.counts.distinctPairs + "。");
w();

w("## 4. 行為軸");
w();
w("16 個指標歸為 " + AXES.length + " 個軸（歸類是本報告的分組，不是結果檔的欄位；共涵蓋 " + axisCover + " 個指標）：");
w();
w("| 軸 | 指標 |");
w("|---|---|");
AXES.forEach(([a, ms]) => w("| " + a + " | " + ms.map(c).join("、") + " |"));
w();
w("## 5. 每個模板動到哪些軸，以及差異落在哪些軸");
w();
w("### 5.1 各模板相對 std 動到的軸");
w();
w("| 模板 | 動到的軸 |");
w("|---|---|");
for (const t of Object.keys(sig)) w("| " + c(t) + " | " + (tplAxes[t].length ? tplAxes[t].join("、") : "（無）") + " |");
w();
w("### 5.2 每個軸被幾個模板動到、在多少配對中是差異來源");
w();
w("| 軸 | 相對 std 動到該軸的模板數（/20） | 含該軸達標的可區分配對數（/" + r.counts.distinctPairs + "） | 差異只落在該單一軸的配對數 | 該軸指標當「最強指標」的配對數（分母：" + r.counts.distinctPairs + " 個可區分配對） |");
w("|---|---|---|---|---|");
AXES.forEach(([a]) => w("| " + a + " | " + axisTpl[a].length + " | " + axisPairs[a] + " | " + axisOnly[a] + " | " + strongestAxis[a] + " |"));
w();
w("可區分的 " + r.counts.distinctPairs + " 對中，差異橫跨 ≥2 個軸的有 " + multiAxisPairs + " 對，只落在單一軸的有 " + (r.counts.distinctPairs - multiAxisPairs) + " 對。");
w();
const zeroAx = AXES.filter(([a]) => axisTpl[a].length === 0).map(([a]) => a), fewAx = AXES.filter(([a]) => axisTpl[a].length > 0 && axisTpl[a].length <= 3).map(([a]) => a + "（" + axisTpl[a].length + "：" + axisTpl[a].map(c).join("、") + "）");
w("沒有任何模板（相對 std）動到的軸：" + (zeroAx.length ? zeroAx.join("、") : "無") + "。");
w("只有 3 個以下模板動到的軸：" + (fewAx.length ? fewAx.join("；") : "無") + "。");
w("以「各軸指標中至少一個指標有達標」計，被最多模板動到的軸是：" + AXES.map(([a]) => [a, axisTpl[a].length]).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([a, n]) => a + "（" + n + "/20）").join("、") + "。");
w("單一指標層面：" + c("laneForward.top") + "、" + c("laneForward.bot") + "、" + c("seatFightEntriesPerMin.b1") + "、" + c("objectiveFightEntriesPerMin.baron") + "、" + c("siegeWindowsPerMin") + "、" + c("retreatStartsPerMin") + " 相對 std 被動到的模板數分別為 " + [L("top"), L("bot"), S("b1"), O("baron"), SIEGE, RET].map((m) => Object.keys(sig).filter((t) => has(t, m)).length).join("、") + "（見第 3 節）。");
w();

w("## 6. 名稱／說明主張 vs 實測");
w();
w("「主張」欄是從結果檔以外的模板定義（" + c("src/platform/tactics/tacticTemplates.js" ) + " 的 name／desc／cons，經典八套的 " + c("MobaTacticConfig.js") + " name／desc／detail）讀出、**能對應到 16 指標之一**的說法；名稱與文案只當「被檢驗的主張」，不當證據。實測一律是模板相對 std 的配對 |z| ≥ " + Z + " 且方向一致才算「量到」。");
w("**來源規則（21 個模板一律相同）**：收錄每個模板的 name／desc／detail／cons（有哪欄收哪欄；經典八套另有 archetype、focus 欄，僅在引用時註明），只寫原文明確說到的；推論不列。每列附原文出處 " + c("檔案:行號") + "，行號範圍涵蓋該模板的 name 到 cons 所在行（經典八套與 std 在 " + c("src/platform/contracts/MobaTacticConfig.js") + "，v2 在 " + c("src/platform/tactics/tacticTemplates.js") + "）。std 沒有 cons 欄。");
w();
w("**各指標實際的取樣範圍**（讀自 " + c("tools/lib/tacticTruthSim.mjs") + " 第 5–28、80–146 行；除特別註明外，皆為全場事件計數 ÷ 場時長（分））：");
w();
w("| 指標 | 取樣範圍與數的是什麼 |");
w("|---|---|");
w("| " + c("laneForward.top/mid/bot") + " | **只取對線期 60–480 秒**、角色存活、state=「對線」的 tick，與己方主堡距離的平均（樣本 < 20 tick 為空值）；是位置，不是次數 |");
w("| " + c("ganksPerMin") + " | 全場；exec 的上／中／下三路抓人計數合計，**不分路** |");
w("| " + c("invasionsActed") + " | 全場**總次數**（不除以時間）；己方英雄 state 變成「入侵」的次數，**只在開局 50 秒窗內走向敵方野區時才可能發生**（tacticTruthSim.mjs 第 14 行） |");
w("| " + c("supportRoamsPerMin") + " | 全場；引擎在輔助真的設定遊走路線那一刻加一（事件瞬間） |");
w("| " + c("supportProtectsPerMin") + " | 全場；5 號席（輔助）每次**新做出**的 SUPPORT 決策（決策每個重評週期可能重複數到；不是救人時機） |");
w("| " + c("coreProtectsPerMin.adc") + " | 全場；任一隊友的新 SUPPORT 決策且對象是 adc 角色的隊友（同為重評決策計數） |");
w("| " + c("retreatStartsPerMin") + " | 全場；英雄 retreating 由 false 變 true 的次數（只數開始，不量早晚） |");
w("| " + c("fightEntriesPerMinAll") + " | 全場三個階段合計；英雄 state 由非「團戰!」變「團戰!」的次數 |");
w("| " + c("engageDecisionsPerMin") + " | 全場；新做出的 ENGAGE 決策次數（重評計數） |");
w("| " + c("siegeWindowsPerMin") + " | 全場；己方 fsm3 主動權窗被設定且種類為 siege 的次數 |");
w("| " + c("seatFightEntriesPerMin.b1/b3") + " | 全場；該席位英雄進入團戰的次數 |");
w("| " + c("objectiveFightEntriesPerMin.dragon/baron") + " | 全場；進入團戰那一刻距該物件坑不超過 OBJ_RADIUS 的次數 |");
w();
w("所以：除 " + c("laneForward.*") + "（對線期 60–480 秒）外，指標都是全場彙總，不分前／中／後期。限制：(a) 「前期」「中期」「後期」限定、而指標不分階段的主張，歸「無法對應」；(b) 「較早／較晚」這類**時機**主張，指標只數次數，歸「次數有變、時機未量」（不論次數有沒有達標）；(c) 「主張 X」是本報告人工讀原文的結果，可能與設計者意圖有出入；(d) 「沒量到」＝未達 |z|≥" + Z + "，不是「證明沒有差別」。");
w();
w("判定五類：**量到**＝主張可對應某指標、達標且方向一致；**方向相反**＝主張與指標確實對得上、達標但方向相反；**沒量到**＝可對應、未達門檻；**次數有變、時機未量**＝時機主張（顯示該指標次數是否達標，但不能據此說時機有量到）；**無法對應**＝階段限定或原文未指明可量測行為。");
w();
w("| 模板 | 原文出處 | 主張（原文明確說到者） | 量到 | 方向相反 | 沒量到 | 次數有變、時機未量 | 無法對應 | 達標但原文未主張 |");
w("|---|---|---|---|---|---|---|---|---|");
for (const row of claimRows) {
  if (row.base) { w("| " + c(row.t) + " | " + c(row.src) + " | " + row.claim + " | （基準） | — | — | — | — | — |"); continue; }
  const j = (a) => a.join("；") || "—";
  w("| " + c(row.t) + " | " + c(row.src) + " | " + row.claim + " | " + j(row.hit) + " | " + j(row.opp) + " | " + j(row.miss) + " | " + j(row.timing) + " | " + j(row.na) + " | " + j(row.extra) + " |");
}
w();
w("主張條數合計 " + nClaims + " ＝ 量到 " + nHit + " ＋ 方向相反 " + nOpp + " ＋ 沒量到 " + nMiss + " ＋ 次數有變、時機未量 " + nTim + " ＋ 無法對應 " + nNA + " ＝ " + claimSum + (claimSum === nClaims ? "（相符）" : "（**不符**）") + "。");
w();
w("### 6.1 指定的特別檢查");
w();
w("**(1) " + c("v2.dragon_pit_macro") + "（巨龍相關）**");
w();
w("- 主張：對龍的爭奪「遠比平常更願意參與」（desc）。相關指標 " + c(O("dragon")) + "。");
w("- 實測：相對 std，" + c(O("dragon")) + " 平均 " + f3(mean["v2.dragon_pit_macro"][O("dragon")]) + " vs std " + f3(mean.std[O("dragon")]) + "（" + pct1((mean["v2.dragon_pit_macro"][O("dragon")] - mean.std[O("dragon")]) / mean.std[O("dragon")]) + "），" + (has("v2.dragon_pit_macro", O("dragon")) ? "達標" : "**未達標**") + "。與 std 的達標指標為 " + (sig["v2.dragon_pit_macro"].metrics.map((x) => c(x.m)).join("、") || "無") + "。");
w("- 對照：21 個模板的 " + c(O("dragon")) + " 平均（由高到低）：" + ids.slice().sort((a, b) => mean[b][O("dragon")] - mean[a][O("dragon")]).map((t) => c(t) + " " + f3(mean[t][O("dragon")])).join("；") + "。");
w("- 相對 std 在 " + c(O("dragon")) + " 達標的模板：" + (Object.keys(sig).filter((t) => has(t, O("dragon"))).map(c).join("、") || "無") + "（共 " + Object.keys(sig).filter((t) => has(t, O("dragon"))).length + " 個）。");
w("- 與相關配對：" + pairLine("std", "v2.dragon_pit_macro") + "。 " + pairLine("classic.m4", "v2.dragon_pit_macro") + "。 " + pairLine("v2.standard_macro", "v2.dragon_pit_macro") + "。");
w();
w("**(2) " + c("v2.top_solo_split") + " 與 " + c("v2.mid_solo_split") + "（對應路站位與席位參團）**");
w();
w("指標順序：" + [L("top"), L("mid"), L("bot"), S("b1"), S("b3")].map(c).join(" / ") + "（b1＝上路席位、b3＝中路席位，依 measure 工具的登記）。");
w();
w("| 模板 | 平均（依上列順序） | 相對 std 達標的站位／席位指標 |");
w("|---|---|---|");
for (const t of ["std", "classic.m2", "v2.top_solo_split", "v2.mid_solo_split"]) w("| " + c(t) + " | " + meanRow(t, [L("top"), L("mid"), L("bot"), S("b1"), S("b3")]) + " | " + (t === "std" ? "（基準）" : (sig[t].metrics.filter((x) => axisOf[x.m] === "站位" || axisOf[x.m] === "席位參團").map((x) => (x.d > 0 ? "↑" : "↓") + c(x.m) + " " + pct(x.rel)).join("；") || "無")) + " |");
w();
w("- 主張：top_solo_split「上路通常不參加團戰、上路站位更前、中路站位靠後」；mid_solo_split「中單通常不參加團戰、中路站位更前、射手站位靠後」。");
w("- 配對：" + pairLine("std", "v2.top_solo_split") + "。 " + pairLine("std", "v2.mid_solo_split") + "。 " + pairLine("v2.top_solo_split", "v2.mid_solo_split") + "。 " + pairLine("classic.m2", "v2.top_solo_split") + "。 " + pairLine("classic.m2", "v2.mid_solo_split") + "。");
w();
w("**(3) " + c("classic.m4") + " vs " + c("std") + "**");
w();
w("- " + pairLine("classic.m4", "std") + "。");
w("- m4 的主張（龍堆運營：圍繞 Dragon／Baron）對應 " + c(O("dragon")) + "、" + c(O("baron")) + "：m4 平均 " + meanRow("classic.m4", [O("dragon"), O("baron")]) + "，std 平均 " + meanRow("std", [O("dragon"), O("baron")]) + "。16 指標皆未達標。");
w("- 16 指標的平均（m4 / std）：" + M.map((m) => c(m) + " " + f3(mean["classic.m4"][m]) + "/" + f3(mean.std[m])).join("；") + "。");
w();
w("**(4) " + c("classic.m8") + " vs " + c("v2.defensive_hold") + "**");
w();
w("- " + pairLine("classic.m8", "v2.defensive_hold") + "。");
w("- 兩者相對 std 的簽名：m8 " + sigStr("classic.m8") + "；defensive_hold " + sigStr("v2.defensive_hold") + "。");
w("- 16 指標的平均（m8 / defensive_hold）：" + M.map((m) => c(m) + " " + f3(mean["classic.m8"][m]) + "/" + f3(mean["v2.defensive_hold"][m])).join("；") + "。");
w("- defensive_hold 主張「三路站位全部往後」，對應 " + c(L("top")) + " / " + c(L("mid")) + " / " + c(L("bot")) + "：defensive_hold 平均 " + meanRow("v2.defensive_hold", [L("top"), L("mid"), L("bot")]) + "；m8 平均 " + meanRow("classic.m8", [L("top"), L("mid"), L("bot")]) + "；std 平均 " + meanRow("std", [L("top"), L("mid"), L("bot")]) + "。defensive_hold 相對 std 在這三個指標達標者：" + ([L("top"), L("mid"), L("bot")].filter((m) => has("v2.defensive_hold", m)).map(c).join("、") || "無") + "。");
w();

w("## 7. 建議的行為分群表");
w();
w("分派規則只用第 2 節的實測簽名（規則依序比對，先符合者為準），不使用名稱、說明或 UI 分類。家族是**描述性**分組：同一家族內成員彼此仍可能可區分（見表後的「彼此量不出差別」清單）。");
w();
const FAM_DESC = {
  "F0 與 std 量不出差別": "16 指標全數未達 |z|≥4。",
  "F1 入侵型": "invasionsActed 明顯高於 std（相對差在數百至數千 %；std 基準值很小）；其餘達標指標因成員而異（見右欄）。",
  "F2 輔助遊走增加型": "supportRoamsPerMin 高於 std，沒有入侵指標達標。",
  "F3 輔助保護增加＋接戰降低型": "coreProtectsPerMin.adc／supportProtectsPerMin 其一或兩者高於 std，同時 engageDecisionsPerMin 或 fightEntriesPerMinAll 低於 std。",
  "F4 輔助保護增加＋接戰／巨龍增加型": "supportProtectsPerMin 高於 std，且 engageDecisionsPerMin 或巨龍接戰指標高於 std。",
  "F5 輔助保護增加型（其餘）": "supportRoamsPerMin 低於 std（或不變）、supportProtectsPerMin／coreProtectsPerMin.adc 高於 std，其他軸未達標。",
  "F6 接戰降低型（其餘）": "fightEntriesPerMinAll 或 engageDecisionsPerMin 低於 std，沒有輔助軸達標。",
};
w("| 家族 | 共同簽名 | 成員與各自相對 std 的簽名 |");
w("|---|---|---|");
for (const [name] of FAMS) { const mem = famGroups[name] || []; if (!mem.length) continue; w("| " + name + "（" + mem.length + "） | " + FAM_DESC[name] + " | " + mem.map((t) => c(t) + "：" + sigStr(t)).join("<br>") + " |"); }
if (famGroups["未分類"]) w("| 未分類 | — | " + famGroups["未分類"].map(c).join("、") + " |");
w("| 基準 | — | " + c("std") + " |");
w();
const allFam = Object.values(famGroups).flat();
w("核對：20 個非 std 模板中被分派者 " + allFam.length + " 個；家族數（含 F0、不含基準）= " + Object.keys(famGroups).length + "。");
w();
w("### 7.1 量不出與 std 差別");
w();
w(Object.keys(sig).filter((t) => !sig[t].distinct).map(c).join("、") + "（共 " + Object.keys(sig).filter((t) => !sig[t].distinct).length + " 個）。");
w();
w("### 7.2 彼此量不出差別");
w();
w("全部 " + edges.length + " 條邊見 1.1；兩兩皆量不出差別的極大團見 1.3（共 " + cliques.length + " 個）。注意：量不出與 std 差別的只有上列模板；其餘「彼此量不出差別」的配對不代表它們與 std 量不出差別。");
w();

w("## 8. 限制");
w();
w("1. **n=" + N + "**：每個模板 " + N + " 場（seeds " + r.rule.seeds[0] + "–" + r.rule.seeds[1] + "，" + (nonFull ? nonFull + " 個模板場數不足" : "21 個模板皆滿 " + N + " 場") + "）；對手固定為 std，所以量到的是「對 std 時」的行為，不是對任意對手。");
w("2. **門檻 |z| ≥ " + Z + " 是事前登記**，且 z 的分布假設（近似常態、配對）在結果檔中沒有另外驗證；計數型指標（如 invasionsActed 為零偏重的整數）可能偏離常態。");
w("3. **量不出差別 ≠ 證明相同**：未達門檻只代表在 n=" + N + " 下沒有一個指標超過 " + Z + "，可能是差異小於可偵測量、也可能是 16 個指標沒涵蓋到差異所在。");
w("4. **多重檢定**：" + r.counts.pairs + " 對 × " + M.length + " 指標 = " + nTests + " 個檢定。若全為虛無假設且近似常態，|z|≥4 的雙尾機率約 6.3e-5，期望偶然達標 ≈ " + f2(expFalse) + " 次；但 16 指標彼此相關，且「任一指標達標即可區分」的規則偏向判為可區分。可區分配對中最強 |z| 小於 5 的有 " + borderline.length + " 對" + (borderline.length ? "（" + borderline.map((p) => c(p.a) + "–" + c(p.b) + " " + f2(Math.abs(p.strongest.z))).join("、") + "）" : "") + "，這些屬於邊界案例。");
w("5. **指標涵蓋面有限**：除 laneForward（只取對線期 60–480 秒）外，其餘指標都是全場彙總、不分前／中／後期，也沒有涵蓋所有 knob（例如打野偏向哪一路、優先救哪個席位），因此「沒量到」可能是指標看不到。");
w("6. **勝率只列不解讀**：n=" + N + " 時，勝率 50% 的 Wilson 95% 信賴區間為 [" + f3(w50[0]) + "," + f3(w50[1]) + "]，寬度 " + f3(w50[2]) + "（約 ±" + f3(w50[2] / 2) + "）；21 個模板的區間寬度在 " + f3(wMin) + "–" + f3(wMax) + " 之間；兩個模板勝率之差的 95% 半寬約 ±" + f3(diffHalf) + "（獨立兩組、p=0.5 近似）。勝率與平均時長如下，不據以比較模板。");
w();
w("| 模板 | 藍方勝場／場數 | 藍方勝率 | Wilson 95% 區間 | 區間寬度 | 平均時長（分） |");
w("|---|---|---|---|---|---|");
ciRows.forEach((x) => w("| " + c(x.t) + " | " + x.k + "/" + x.n + " | " + f3(x.wr) + " | [" + f3(x.lo) + ", " + f3(x.hi) + "] | " + f3(x.w) + " | " + f2(x.dur) + " |"));
w();
w("## 9. 重算方式");
w();
w("計算腳本：" + c("review/tactic-book-3a/analyse_templates.mjs") + "（只讀結果檔；執行 " + c("node review/tactic-book-3a/analyse_templates.mjs") + " 會重新產生本檔）。第 6 節的「主張」是人工讀文字後寫在腳本 " + c("CLAIMS") + " 表內的資料，其餘數字皆由結果檔運算得出。");
fs.mkdirSync(OUT.replace(/\/[^/]*$/, ""), { recursive: true });
fs.writeFileSync(OUT, out.join("\n") + "\n", "utf8");

console.log(JSON.stringify({ convZ, convRel, edges: edges.length, comps: comps.length, multi: multi.map((x) => x.length), groupsMatch, cliques: cliques.length, sizeCount, cliquesInBig: cliquesInBig.map((q) => q.length), bigPairs: bigPairs.length, bigInd: bigInd.length, bigDis: bigDis.length, edgesInBig, nStdDistinct, dead, low, pow, axisTpl: Object.fromEntries(Object.entries(axisTpl).map(([k, v]) => [k, v.length])), nClaims, nHit, nOpp, nMiss, fam: Object.fromEntries(Object.entries(famGroups).map(([k, v]) => [k, v.length])), borderline: borderline.length, w50, wMin, wMax, diffHalf, expFalse, lines: out.length }, null, 1));
