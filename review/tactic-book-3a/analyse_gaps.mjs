// 《戰術能力缺口》用到的所有數字，由這支腳本從 repo 內的結果檔與資料表重算。唯讀、不跑模擬。
// 用法：node review/tactic-book-3a/analyse_gaps.mjs
// 讀取：tools/fixtures/tactic_followup_3a_replication.json、tactic_truth_3a.json、tactic_followup_3a_templates.json、
//       src/platform/tactics/{capabilityRegistry,tacticChoiceMapping,tacticTemplates}.js、review/tactic-book-3a/模板行為分群.md
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const J = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { CAPABILITY_ROWS, MEASURED_EXCLUSIONS, REPLICATION_WITHHELD } = await imp("src/platform/tactics/capabilityRegistry.js");
const { suppressedRuleIds, CONTRADICTION_RULES } = await imp("src/platform/tactics/tacticIndicators.js");
const { tacticBookOptions, offeredChoiceDetail } = await imp("src/platform/tactics/tacticChoiceMapping.js");
const { TACTIC_TEMPLATE_LIST } = await imp("src/platform/tactics/tacticTemplates.js");
const rep = J("tools/fixtures/tactic_followup_3a_replication.json");
const truth = J("tools/fixtures/tactic_truth_3a.json");
const tpl = J("tools/fixtures/tactic_followup_3a_templates.json");
const f = (x, d = 2) => (x === null || x === undefined ? "—" : Number(x).toFixed(d));
const pc = (x, d = 1) => (x === null || x === undefined ? "—" : (x >= 0 ? "+" : "") + (100 * x).toFixed(d) + "%");
const H = (s) => console.log("\n=== " + s + " ===");

// ── 1. Registry ──
H("1 Registry 維度");
const live = CAPABILITY_ROWS.filter((r) => r.status === "live"), design = CAPABILITY_ROWS.filter((r) => r.status === "design");
console.log("維度總數", CAPABILITY_ROWS.length, "live", live.length, "design", design.length);
console.log("live 維度的選項總數", live.reduce((s, r) => s + r.choices.length, 0), "；非預設(每維度選項數-1，std 視角需看 own)");
const byNote = {};
for (const r of design) { const k = r.note.replace(/（.*?）/g, "").replace(/屬 3b.*/, "屬 3b（規格標 *）").replace(/^引擎的對應旋鈕是整場共用.*/, "旋鈕整場共用、無法依此鍵細分"); (byNote[k] ??= []).push(r.dimension); }
for (const [k, v] of Object.entries(byNote)) console.log(v.length, k, "→", v.join(","));

// ── 2. 提供的非預設選項 ──
H("2 提供的非預設選項（撤下前重建 vs 現況）");
//  現況（已撤下）：tacticBookOptions／offeredChoiceDetail 預設套用 MEASURED_EXCLUSIONS 與 REPLICATION_WITHHELD。
//  撤下前：把「因複驗撤下（reason=not_replicated）」的選項加回來，其餘不動；再核對它重現 393（見下面的核對行）。
const isW = (d, c) => REPLICATION_WITHHELD.some((w) => w.dimension === d && w.choice === c);
const pairsNow = [], withheldNR = [], ownOf = {};
for (const t of TACTIC_TEMPLATE_LIST) {
  for (const d of tacticBookOptions(t.templateId)) {
    ownOf[t.templateId + "|" + d.dimension] = d.own;
    for (const c of d.offered) if (c !== d.own) pairsNow.push({ tpl: t.templateId, dim: d.dimension, choice: c, own: d.own });
  }
  for (const r of live) { const det = offeredChoiceDetail(t.templateId, r.dimension); for (const w of det?.withheld ?? []) if (w.reason === "not_replicated" && w.choice !== det.own && offeredChoiceDetail(t.templateId, r.dimension, [], {}, { withMeasured: false }).offered.includes(w.choice)) withheldNR.push({ tpl: t.templateId, dim: r.dimension, choice: w.choice, own: det.own }); }
}
const offeredPairs = [...pairsNow, ...withheldNR];   // 撤下前（重建）
const tot = offeredPairs.length, totAfter = pairsNow.length;
const stdN = offeredPairs.filter((p) => p.tpl === "std").length, stdAfter = pairsNow.filter((p) => p.tpl === "std").length;
console.log("【現況實算】REPLICATION_WITHHELD 筆數", REPLICATION_WITHHELD.length, REPLICATION_WITHHELD.map((w) => `${w.template}|${w.dimension}=${w.choice}|${w.reason}|${w.verdict}`).join("；"), "；MEASURED_EXCLUSIONS 筆數", MEASURED_EXCLUSIONS.length);
console.log("21 模板合計：撤下前(重建)", tot, "→ 現況(已撤下)", totAfter, "；少了", tot - totAfter, "；撤下前重建是否＝393？", tot === 393);
console.log("std：撤下前", stdN, "→ 現況", stdAfter);
const perTpl = TACTIC_TEMPLATE_LIST.map((t) => [t.templateId, offeredPairs.filter((p) => p.tpl === t.templateId).length, pairsNow.filter((p) => p.tpl === t.templateId).length]);
console.log("各模板 (撤下前/現況):", perTpl.map(([a, b, c]) => `${a}:${b}/${c}`).join(" "));
console.log("現況清單 ＝ 撤下前清單扣掉撤下清單？", pairsNow.length === offeredPairs.filter((p) => !isW(p.dim, p.choice)).length);
console.log("被撤下的 4 個 維度=選項，各自有幾個模板『本來提供非預設選項』→『現在還提供』（模板數）:");
for (const w of REPLICATION_WITHHELD) console.log("  ", w.dimension + "=" + w.choice, offeredPairs.filter((p) => p.dim === w.dimension && p.choice === w.choice).length, "→", pairsNow.filter((p) => p.dim === w.dimension && p.choice === w.choice).length);
console.log("有『非預設可見選項』的模板數，按維度（撤下前→現況）:");
const tplCount = (pairs, dim) => new Set(pairs.filter((p) => p.dim === dim).map((p) => p.tpl)).size;
for (const r of live) { const a = tplCount(offeredPairs, r.dimension), b = tplCount(pairsNow, r.dimension); if (a !== b) console.log("  ", r.dimension, a, "→", b); }
const stdDimsNow = [...new Set(pairsNow.filter((p) => p.tpl === "std").map((p) => p.dim))];
console.log("std 畫面現況剩", stdDimsNow.length, "個維度:", stdDimsNow.join(","));
const noVisible = live.filter((r) => tplCount(pairsNow, r.dimension) === 0).map((r) => r.dimension);
console.log("現況在 21 個模板上都沒有任何可見非預設選項、但 Registry 仍為 live 的維度:", noVisible.join(",") || "（無）");
console.log("模板自己的預設值就是被撤下的選擇（模板預設值不受撤下影響）:");
for (const w of REPLICATION_WITHHELD) console.log("  ", w.dimension + "=" + w.choice, "→", TACTIC_TEMPLATE_LIST.filter((t) => ownOf[t.templateId + "|" + w.dimension] === w.choice).map((t) => t.templateId).join(", ") || "（無）");
const ownTotal = REPLICATION_WITHHELD.reduce((s, w) => s + TACTIC_TEMPLATE_LIST.filter((t) => ownOf[t.templateId + "|" + w.dimension] === w.choice).length, 0); console.log("  合計模板數", ownTotal);
console.log("被抑制的矛盾提示（std 視角）:", JSON.stringify(suppressedRuleIds("std")));
for (const id of suppressedRuleIds("std")) { const r = CONTRADICTION_RULES?.find?.((x) => x.id === id); if (r) console.log("  ", id, "when", JSON.stringify(r.when), "→", r.text); }
console.log("各維度被提供的模板×選項數:");
const byDC = {}; for (const p of offeredPairs) { const k = p.dim + "=" + p.choice; byDC[k] = (byDC[k] || 0) + 1; }
console.log(Object.entries(byDC).map(([k, v]) => `${k}:${v}`).join(" "));
const dimsOffered = new Set(offeredPairs.map((p) => p.dim)); console.log("至少有一個模板提供非預設選項的維度數", dimsOffered.size, "/", live.length);
console.log("在所有模板上都只剩預設值的 live 維度:", live.filter((r) => !dimsOffered.has(r.dimension)).map((r) => r.dimension).join(","));
const dimsAfter = new Set(offeredPairs.filter((p) => !isW(p.dim, p.choice)).map((p) => p.dim)); console.log("撤下後", dimsAfter.size, "個維度仍有非預設選項；不再有：", [...dimsOffered].filter((d) => !dimsAfter.has(d)).join(",") || "（無）");

// ── 3. 量測排除 ──
H("3 MEASURED_EXCLUSIONS");
const rs = {}; for (const e of MEASURED_EXCLUSIONS) (rs[e.reason] ??= []).push(e);
for (const [k, v] of Object.entries(rs)) { console.log(k, v.length); for (const e of v) console.log("   ", e.template, e.dimension + "=" + e.choice, e.metric, "n=" + e.n, "z=" + e.z); }
console.log("template='*' 的筆數", MEASURED_EXCLUSIONS.filter((e) => e.template === "*").length, "；指定模板的筆數", MEASURED_EXCLUSIONS.filter((e) => e.template !== "*").length);
const stdNon = live.reduce((s, r) => s + r.choices.length - 1, 0); console.log("(註)live 維度 choices-1 之和", stdNon);

// ── 4. 複驗 ──
H("4 複驗（seeds " + rep.rule.seedsFull.join("–") + "）");
const sideStr = (s) => `n=${s.n} Δ${pc(s.rel)} z=${f(s.z)} ci95[${f(s.ci95[0], 4)},${f(s.ci95[1], 4)}] ${s.meets ? "達標" : "未達"}${s.reversed ? " 反向" : ""}`;
for (const x of rep.rows) {
  console.log(`${x.verdict.padEnd(12)} ${x.dimension}=${x.choice} [${x.metric} ${x.direction}] 原${x.originalClass} z=${f(x.originalZ)}`);
  console.log("     藍", sideStr(x.blue)); console.log("     紅", sideStr(x.red));
  if (x.strict) console.log("     只數開始", x.strictMetric, "藍", sideStr(x.strict.blue), "｜紅", sideStr(x.strict.red), "meets?", JSON.stringify(Object.fromEntries(Object.entries(x.strict).filter(([k]) => !["blue", "red"].includes(k)))));
}
const vc = {}; for (const x of rep.rows) vc[x.verdict] = (vc[x.verdict] || 0) + 1; console.log("判定統計", JSON.stringify(vc));

// ── 5. 真實性表 ──
H("5 tactic_truth_3a");
console.log("總列數", truth.rows.length, "seeds", truth.meta.seeds.join("–"), "minZ", truth.meta.minZ, "marginalBelowZ", truth.meta.marginalBelowZ);
const stdRows = truth.rows.filter((r) => r.role !== "weak"), weakRows = truth.rows.filter((r) => r.role === "weak");
const cnt = (rows) => { const o = {}; for (const r of rows) o[r.verdict] = (o[r.verdict] || 0) + 1; return JSON.stringify(o); };
console.log("std 列", stdRows.length, cnt(stdRows), "（其中 primary", truth.rows.filter((r) => r.role === "primary").length, "red", truth.rows.filter((r) => r.role === "red").length, "）");
console.log("其他模板(weak)列", weakRows.length, cnt(weakRows), "；涉及模板", [...new Set(weakRows.map((r) => r.template))].join(","));
const keyOf = (r) => `${r.template}|${r.dimension}|${r.choice}`;
const direct = new Map(); for (const r of truth.rows.filter((r) => r.side === "blue" || r.role !== "red")) { const k = keyOf(r); (direct.get(k) ?? direct.set(k, []).get(k)).push(r); }
console.log("量測過的不同 模板×維度=選項 數", direct.size);
const offeredKeys = new Set(offeredPairs.map((p) => `${p.tpl}|${p.dim}|${p.choice}`));
const directOffered = offeredPairs.filter((p) => direct.has(`${p.tpl}|${p.dim}|${p.choice}`));
console.log("【涵蓋率】提供的模板×選項", tot, "；其中有直接量測列者", directOffered.length, "（" + pc(directOffered.length / tot, 1).replace("+", "") + "）；其餘靠推論", tot - directOffered.length);
const dStd = directOffered.filter((p) => p.tpl === "std").length; console.log("  其中 std", dStd, "/", stdN, "；非 std", directOffered.length - dStd, "/", tot - stdN);
console.log("  直接量測的列的判定(取 std 上與該模板上的 blue 列)：");
const vcount = {}; for (const p of directOffered) { const rows = direct.get(`${p.tpl}|${p.dim}|${p.choice}`); const v = rows.map((r) => r.verdict).join("/"); vcount[v] = (vcount[v] || 0) + 1; } console.log("  ", JSON.stringify(vcount));
console.log("  非 std 的直接量測：", directOffered.filter((p) => p.tpl !== "std").map((p) => `${p.tpl} ${p.dim}=${p.choice}[${direct.get(`${p.tpl}|${p.dim}|${p.choice}`).map((r) => r.verdict + " z=" + f(r.z)).join(";")}]`).join(" ｜ "));
H("5b 以「維度=選項」彙整：std 上的狀態，與其他模板提供數");
const stdStatus = {}; for (const x of rep.rows) stdStatus[x.dimension + "=" + x.choice] = x.verdict;
const groupInf = {};
for (const p of offeredPairs) { const k = p.dim + "=" + p.choice; const g = (groupInf[k] ??= { n: 0, direct: 0 }); g.n++; if (direct.has(`${p.tpl}|${p.dim}|${p.choice}`)) g.direct++; }
for (const [k, g] of Object.entries(groupInf)) console.log(k.padEnd(34), "提供", String(g.n).padStart(2), "直接量測", g.direct, "std 複驗:", stdStatus[k] ?? "（std 未複驗/不在 12 個內）", stdRows.some((r) => `${r.dimension}=${r.choice}` === k && r.role === "primary") ? "std 初測有列" : "std 初測無列");
const inferredStatus = {}; for (const p of offeredPairs) { if (direct.has(`${p.tpl}|${p.dim}|${p.choice}`)) continue; const s = stdStatus[p.dim + "=" + p.choice] ?? "no_std_replication"; inferredStatus[s] = (inferredStatus[s] || 0) + 1; }
console.log("推論的模板×選項，按「std 上的複驗狀態」分:", JSON.stringify(inferredStatus));
const noStdBasis = offeredPairs.filter((p) => !direct.has(`${p.tpl}|${p.dim}|${p.choice}`) && !(p.dim + "=" + p.choice in stdStatus));
console.log("  推論且該 維度=選項 連 std 的 12 個複驗都沒有：", noStdBasis.length, "→", [...new Set(noStdBasis.map((p) => p.dim + "=" + p.choice))].join(","));
const stdOwn = Object.fromEntries(tacticBookOptions("std").map((d) => [d.dimension, d.own]));
const ownNonStd = offeredPairs.filter((p) => p.own !== stdOwn[p.dim]);
console.log("提供選項時，模板自己的預設值 ≠ std 的預設值：", ownNonStd.length, "/", tot, "（TD-3A-8：量測是 std→選項；這些是『從別的值改成選項』，沒有直接量）；= std 預設值：", tot - ownNonStd.length);
const backStd = offeredPairs.filter((p) => p.choice === stdOwn[p.dim]);
console.log("其中『改回 std 預設值』型的選項（選項本身＝std 的預設值，std 上不可能量到）：", backStd.length, "；直接量測", backStd.filter((p) => direct.has(`${p.tpl}|${p.dim}|${p.choice}`)).length);
{
  const nsNow = pairsNow.filter((p) => p.own !== stdOwn[p.dim]), backNow = pairsNow.filter((p) => p.choice === stdOwn[p.dim]);
  console.log("【現況（已撤下）】提供", pairsNow.length, "；模板預設值 ≠ std 預設值", nsNow.length, "；＝std 預設值", pairsNow.length - nsNow.length, "；改回標準值型", backNow.length, "（全在『≠』內？", backNow.every((p) => p.own !== stdOwn[p.dim]), "）；『≠』中非改回標準值型", nsNow.length - backNow.length, "；改回標準值型直接量測", backNow.filter((p) => direct.has(`${p.tpl}|${p.dim}|${p.choice}`)).length);
}
const bd = {}; for (const p of backStd) bd[p.dim] = (bd[p.dim] || 0) + 1; console.log("  按維度:", JSON.stringify(bd));
H("5d 現況（已撤下）的涵蓋率");
const after = pairsNow;
const dAfter = after.filter((p) => direct.has(`${p.tpl}|${p.dim}|${p.choice}`));
console.log("提供", after.length, "；直接量測", dAfter.length, "（std", dAfter.filter((p) => p.tpl === "std").length, "＋非 std", dAfter.filter((p) => p.tpl !== "std").length, "）；推論", after.length - dAfter.length, "＝", (100 * dAfter.length / after.length).toFixed(1) + "% 直接");
const infAfter = {}; for (const p of after) { if (direct.has(`${p.tpl}|${p.dim}|${p.choice}`)) continue; const s = stdStatus[p.dim + "=" + p.choice] ?? (p.choice === stdOwn[p.dim] ? "改回std預設(從未量過)" : "其他無std複驗"); infAfter[s] = (infAfter[s] || 0) + 1; }
console.log("  推論者依 std 狀態:", JSON.stringify(infAfter));
const cDims = new Set(rep.rows.filter((x) => x.verdict === "confirmed").map((x) => x.dimension)); console.log("有至少一個複驗通過選項的維度", cDims.size, "/", live.length, "：", [...cDims].join(","));
const tplConfirmed = {}; for (const p of after) { if (stdStatus[p.dim + "=" + p.choice] === "confirmed") tplConfirmed[p.tpl] = (tplConfirmed[p.tpl] || 0) + 1; }
console.log("撤下後，提供且 std 上複驗通過的 模板×選項 合計", Object.values(tplConfirmed).reduce((a, b) => a + b, 0), "（占", after.length, "）；其中 std 上", tplConfirmed.std ?? 0, "；8/322 =", (100 * (tplConfirmed.std ?? 0) / after.length).toFixed(1) + "%（新 seeds 紅藍雙方都複驗過的，只有 std 的這幾個）");
H("5e 6 筆『只在指定模板排除』與其選項在 std 的複驗狀態；185 與 288 的包含關係");
for (const e of MEASURED_EXCLUSIONS.filter((e) => e.template !== "*")) console.log(e.template, e.dimension + "=" + e.choice, "n=" + e.n, "z=" + e.z, "→ std 複驗:", stdStatus[e.dimension + "=" + e.choice] ?? "（無）");
console.log("全模板排除(template='*')", MEASURED_EXCLUSIONS.filter((e) => e.template === "*").length, "＝沒量到", MEASURED_EXCLUSIONS.filter((e) => e.template === "*" && e.reason === "no_measured_effect").length, "＋反向", MEASURED_EXCLUSIONS.filter((e) => e.template === "*" && e.reason === "reversed_effect").length);
console.log("185 ⊂ 288？", backStd.every((p) => p.own !== stdOwn[p.dim]), "；288 中非『改回標準值』型", ownNonStd.length - backStd.length, "；模板預設值＝std 預設值", tot - ownNonStd.length);
H("5c 仍在提供、但初測為邊際的弱點模板列");
for (const r of weakRows.filter((r) => r.verdict === "marginal")) console.log(keyOf(r), r.metric, r.direction, "n=" + r.n, "z=" + f(r.z), "rel=" + pc(r.rel), "仍提供?", offeredKeys.has(keyOf(r)));
console.log("weak pass 列：", weakRows.filter((r) => r.verdict === "pass").map((r) => `${keyOf(r)} z=${f(r.z)} 仍提供=${offeredKeys.has(keyOf(r))}`).join(" ｜ "));
console.log("weak unmeasurable：", weakRows.filter((r) => r.verdict === "unmeasurable").map((r) => `${keyOf(r)} ${r.metric}`).join(" ｜ "));
console.log("weak reversed：", weakRows.filter((r) => r.verdict === "reversed").map((r) => `${keyOf(r)} z=${f(r.z)} 仍提供=${offeredKeys.has(keyOf(r))}`).join(" ｜ "));
console.log("asymmetries(藍/紅不對稱)：", truth.asymmetries.map((a) => `${a.dimension}=${a.choice} 藍${a.blue}(${f(a.zBlue)}) 紅${a.red}(${f(a.zRed)})`).join(" ｜ "));
console.log("splitStayOut：", truth.splitStayOut.map((s) => `${s.key} 留線率${f(s.stayRate)} 留線時間占比${f(s.stayTicksShare, 3)} 每場帶線行動${f(s.splitPushActionsPerMatch)} 席位團戰進入/分 control ${f(s.seatFightEntriesPerMin.control, 3)} → split ${f(s.seatFightEntriesPerMin.split, 3)}`).join(" ｜ "));
console.log("std primary 列的逐項結果(藍方)：");
for (const r of truth.rows.filter((r) => r.role === "primary")) console.log("   ", r.dimension + "=" + r.choice, r.metric, r.direction, "z=" + f(r.z), "rel=" + pc(r.rel), r.verdict);

// ── 6. 模板層（引用分群報告）──
H("6 模板層（tactic_followup_3a_templates.json）");
const ind = tpl.indistinguishable; console.log("量不出差別的配對", ind.length, "；可區分", tpl.counts.distinctPairs, "/", tpl.counts.pairs, "；群數", tpl.counts.behaviourGroups, "；多成員群", tpl.groups.map((g) => g.length).join("+"));
const vs = tpl.vsStd.filter((v) => !v.distinct).map((v) => v.template); console.log("與 std 量不出差別的模板", vs.join(","));
const md = fs.readFileSync(path.join(ROOT, "review/tactic-book-3a/模板行為分群.md"), "utf8");
console.log("分群報告第 6 節統計行：", (md.match(/主張條數合計[^\n]*/) || ["（找不到）"])[0]);
const m8 = tpl.pairs.find((p) => p.a === "classic.m8" && p.b === "v2.defensive_hold"); console.log("m8 vs defensive_hold distinct?", m8.distinct, "最強", m8.strongest.metric, f(m8.strongest.z));
const zeroPow = {}; for (const m of tpl.rule.metrics) zeroPow[m] = 0; for (const p of tpl.pairs) for (const m of p.distinctMetrics) zeroPow[m]++;
console.log("指標區分對數: ", Object.entries(zeroPow).map(([k, v]) => `${k}:${v}`).join(" "));

// ── 7. 快速模式 ──
H("7 快速模式");
const qm = path.join(ROOT, "tools/fixtures/tactic_followup_3a_quickmode.json");
console.log("quickmode 結果檔存在？", fs.existsSync(qm));
if (fs.existsSync(qm)) {
  const q = JSON.parse(fs.readFileSync(qm, "utf8"));
  console.log("schema", q.schema, "；seeds", q.rule.seeds.join("–"), "minZ", q.rule.minZ, "minRel", q.rule.minRel, "；gitHead", q.meta.gitHead.slice(0, 7), "；problems", JSON.stringify(q.problems), "；note:", q.note);
  const vq = {}; for (const r of q.rows) vq[r.verdict] = (vq[r.verdict] || 0) + 1; console.log("判定統計", JSON.stringify(vq), "共", q.rows.length, "列");
  const sd = (s) => `n=${s.n} 對照${f(s.meanA, 3)}→${f(s.meanB, 3)} Δ${pc(s.rel)} z=${f(s.z)} ci95[${f(s.ci95[0], 4)},${f(s.ci95[1], 4)}] ${s.meets ? "達標" : "未達"}`;
  const primary = (d, c) => truth.rows.find((r) => r.role === "primary" && r.dimension === d && r.choice === c);
  const exclAll = (d, c) => MEASURED_EXCLUSIONS.find((e) => e.template === "*" && e.dimension === d && e.choice === c);
  for (const r of q.rows) {
    const key = r.dimension + "=" + r.choice, p = primary(r.dimension, r.choice), rp = rep.rows.find((x) => x.dimension === r.dimension && x.choice === r.choice);
    const offeredN = offeredPairs.filter((o) => o.dim === r.dimension && o.choice === r.choice).length;
    console.log(`\n[${r.verdict}] ${key}  快速模式指標 ${r.metric} (${r.direction})`);
    console.log("   快速模式 藍", sd(r.blue)); console.log("   快速模式 紅", sd(r.red));
    console.log("   真實性初測(std,n=40)", p ? `${p.metric} z=${f(p.z)} Δ${pc(p.rel)} ${p.verdict}` : "（無）", "｜複驗", rp ? `${rp.metric} 藍 Δ${pc(rp.blue.rel)} z=${f(rp.blue.z)} 紅 Δ${pc(rp.red.rel)} z=${f(rp.red.z)} ${rp.verdict}` : "（無，不在 12 個複驗內）");
    console.log("   目前提供給的模板數", offeredN, "；全模板排除?", exclAll(r.dimension, r.choice) ? exclAll(r.dimension, r.choice).reason : "否");
  }
  const nn = q.rows.filter((r) => r.blue.n < 400 || r.red.n < 400).map((r) => `${r.dimension}=${r.choice} 藍${r.blue.n}/紅${r.red.n}`); console.log("\nn<400 的列:", nn.join(" ｜ "));
}
