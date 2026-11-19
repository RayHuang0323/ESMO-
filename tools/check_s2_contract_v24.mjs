#!/usr/bin/env node
// ============================================================================
//  tools/check_s2_contract_v24.mjs — v24 Sprint 1.3 Acceptance Closure 的量測工具 Gate（2026-11-19）
//
//  守的事：
//   T1～T5  S2-A／S2-C 契約的門檻、分母、路徑不合併、回看舊資料不給判定
//   T6      舊 S2 的判定工具與舊結論沒有被改動
//   T7～T9  判定器驗證、S11 決策、E2／E7 的判定規則與有效樣本的停止規則
//   T10     量測不改變對局（整場串流雜湊相同）
//   T11     判定器與上一輪的 v1 量測結果相同；壓力工具與上一輪的紀錄相同
//   T12     隱藏資訊不會進入 S11 特徵（移動看不見的敵人，特徵不變）
//   T13     src/ 沒有引用量測工具，v24 指紋沒有變
//  用法：node tools/check_s2_contract_v24.mjs
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bootCI, judgeA, judgeC, judgePath, S2_CONTRACT_V2, sideUnits, statA, validateOracle } from "./owner_preview/s2_contract_v2.mjs";
import { conservative, verdictE2, verdictE7, wilson } from "./owner_preview/closure_verdicts_v24.mjs";
import { effectivePairs } from "./owner_preview/closure_stress_v24.mjs";
import { s11Decision } from "./owner_preview/judge_s11_feasibility_v24.mjs";
import { createLegalTracker, featuresFromView, legalView, observeLegal } from "./owner_preview/lib_s11_legal_features_v24.mjs";
import { runInstrumented } from "./owner_preview/lib_closure_natural_v24.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), BASELINE = "541721dd";
let pass = 0, fail = 0;
const ck = (name, ok, extra = "") => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });

// T1 S2-A
ck("T1a 出發 59 次即使全部到場也是 INCONCLUSIVE", judgeA({ starts: 59, ci: [0.9, 1] }) === "INCONCLUSIVE");
ck("T1b 出發 60 次、下界 0.65 是 PASS", judgeA({ starts: 60, ci: [0.65, 0.8] }) === "PASS");
ck("T1c 下界 0.649、上界高於 0.65 是 INCONCLUSIVE", judgeA({ starts: 200, ci: [0.649, 0.7] }) === "INCONCLUSIVE");
ck("T1d 上界低於 0.65 是 FAIL", judgeA({ starts: 200, ci: [0.5, 0.649] }) === "FAIL");
// T2 S2-C
ck("T2a 0.6 次、0.5 比例是 PASS", judgeC({ sides: 100, c1: 0.6, c2: 0.5 }) === "PASS");
ck("T2b 1.5 次是 PASS", judgeC({ sides: 100, c1: 1.5, c2: 0.8 }) === "PASS");
ck("T2c 0.59 次是 FAIL", judgeC({ sides: 100, c1: 0.59, c2: 0.8 }) === "FAIL");
ck("T2d 1.51 次是 FAIL", judgeC({ sides: 100, c1: 1.51, c2: 0.8 }) === "FAIL");
ck("T2e 比例 0.49 是 FAIL", judgeC({ sides: 100, c1: 1, c2: 0.49 }) === "FAIL");
ck("T2f 沒有資料是 INCONCLUSIVE", judgeC({ sides: 0, c1: NaN, c2: NaN }) === "INCONCLUSIVE");
// T3 分母
const row = (seed, b, r, p = "tool") => ({ seed, path: p, te: { blue: b, red: r } }), side = (starts, arrived) => ({ posture: "auto", starts, arrived });
const u3 = sideUnits([row(1, side(0, 0), side(2, 1)), row(2, side(1, 1), { posture: null, starts: 5, arrived: 5 })]);
ck("T3a 沒出發的邊留在分母", u3.length === 3 && u3.some((x) => x.starts === 0));
ck("T3b 沒有入侵意圖的邊不計入", !u3.some((x) => x.starts === 5));
ck("T3c 到場數不超過出發數", sideUnits([row(1, side(1, 3), side(0, 0))])[0].arrived === 1);
// T4 路徑不合併
let threw = false; try { sideUnits([row(1, side(1, 1), side(1, 1), "tool"), row(2, side(1, 1), side(1, 1), "career")]); } catch { threw = true; }
ck("T4a 工具與生涯混在一起直接拒絕", threw);
ck("T4b 判定結果沒有合併欄位", !("overall" in judgePath([row(1, side(1, 1), side(1, 1))], { registered: true })));
// T5 回看不判定
const perfect = Array.from({ length: 200 }, (_, i) => row(i, side(1, 1), side(1, 1)));
const retro = judgePath(perfect, { registered: false }), formal = judgePath(perfect, { registered: true });
ck("T5a 回看舊資料不給 PASS／FAIL", retro.A.verdict === "NOT_JUDGED" && retro.C.verdict === "NOT_JUDGED" && retro.mode === "RETROSPECTIVE");
ck("T5b 登記過的資料才判定", formal.A.verdict === "PASS" && formal.C.verdict === "PASS");
ck("T5c 區間以 Seed 為叢集", (() => { const c = bootCI(sideUnits(perfect), statA); return c[0] === 1 && c[1] === 1; })());
// T6 舊判準不動
const oldFiles = ["tools/owner_preview/judge_te24_s11.mjs", "review/tactic-book-3a/v24_sprint1/s13_results/judgement_v13.json", "review/tactic-book-3a/v24_sprint1/s13_results/judgement_s12.json", "review/tactic-book-3a/v24_sprint1/s13_results/judgement_s13_endgame.json", "tools/owner_preview/stress_endgame_v24.mjs", "tools/owner_preview/measure_s2_opportunity_v24.mjs"];
ck("T6a 舊判定工具與舊結果沒有變更", git("diff", "--name-only", BASELINE, "--", ...oldFiles).trim() === "" && git("status", "--porcelain", "--", ...oldFiles).trim() === "");
const s2Old = JSON.parse(fs.readFileSync(path.join(ROOT, oldFiles[1]), "utf8")).find((x) => x.id.startsWith("S2 "));
ck("T6b 舊 S2 仍是 FAIL（0.464）", s2Old?.verdict === "FAIL" && s2Old.detail.includes("0.464"), JSON.stringify(s2Old));
// T7 判定器驗證
const mk = (n, inOpp, cap, gold, die) => Array.from({ length: n }, (_, i) => ({ cluster: String(i % 40), inOpp, captured: i % 100 < cap, gold60: gold + (i % 7), leaderDied: i % 100 < die }));
ck("T7a 機會內出發少於 30 次是 INCONCLUSIVE", validateOracle([...mk(29, true, 90, 200, 0), ...mk(300, false, 20, 50, 10)], { B: 300, seed: 1 }).verdict === "INCONCLUSIVE");
ck("T7b 明顯較好是 VALID", validateOracle([...mk(200, true, 90, 200, 5), ...mk(300, false, 20, 50, 10)], { B: 300, seed: 1 }).verdict === "VALID");
ck("T7c 明顯較差是 INVALID", validateOracle([...mk(200, true, 10, 20, 5), ...mk(300, false, 70, 200, 10)], { B: 300, seed: 1 }).verdict === "INVALID");
// T8 S11 決策
const good = { deltaBssCi: [0.01, 0.05], bss: 0.08, bssCi: [0.03, 0.12], ece: 0.03, maxGap: 0.08, hrm: 0.3, intercepted: 120 };
ck("T8a 全部成立是 CREDIBLE", s11Decision(good) === "CREDIBLE");
ck("T8b 樣本外沒有改善是 STOP", s11Decision({ ...good, deltaBssCi: [-0.01, 0.05] }) === "STOP");
ck("T8c 技巧不足是 STOP", s11Decision({ ...good, bss: 0.04 }) === "STOP");
ck("T8d 高風險漏判超線是 STOP", s11Decision({ ...good, hrm: 0.41 }) === "STOP");
ck("T8e 校準超線是 STOP", s11Decision({ ...good, ece: 0.06 }) === "STOP");
ck("T8f 被攔截樣本不足是 INCONCLUSIVE_SAMPLE", s11Decision({ ...good, intercepted: 99 }) === "INCONCLUSIVE_SAMPLE");
// T9 E2／E7 與停止規則
const c = (k, n) => ({ ci95: wilson(k, n) });
ck("T9a 上一輪的 E2（生涯 53／53）維持 INCONCLUSIVE", verdictE2(c(169, 169), c(53, 53)) === "INCONCLUSIVE");
ck("T9b 工具 200／200、生涯 125／125 才是 PASS", verdictE2(c(200, 200), c(125, 125)) === "PASS");
ck("T9c 生涯 124／124 不夠", verdictE2(c(200, 200), c(124, 124)) === "INCONCLUSIVE");
ck("T9d 完賽率明顯低於 97% 是 FAIL", verdictE2(c(180, 200), c(125, 125)) === "FAIL");
ck("T9e 上一輪的 E7（86／169）維持 INCONCLUSIVE", verdictE7(wilson(86, 169)) === "INCONCLUSIVE");
ck("T9f 藍方 100／200 是 PASS", verdictE7(wilson(100, 200)) === "PASS");
ck("T9g 藍方 140／200 是 FAIL", verdictE7(wilson(140, 200)) === "FAIL");
ck("T9h 兩個結論不同時取保守", conservative("PASS", "INCONCLUSIVE") === "INCONCLUSIVE" && conservative("FAIL", "PASS") === "FAIL" && conservative("PASS", "PASS") === "PASS");
const cell = { name: "x", seeds: [1, 3, 5, 7, 9, 11], target: 3 }, rowsOf = (over) => cell.seeds.map((seed, i) => ({ seed, injected: i !== 1, over }));
const a = effectivePairs(cell, rowsOf(true), rowsOf(true)).map((p) => p.seed), b = effectivePairs(cell, rowsOf(false), rowsOf(false)).map((p) => p.seed);
ck("T9i 有效樣本湊滿目標就停", JSON.stringify(a) === "[1,5,7]");
ck("T9j 納入哪些 Seed 與注入後的結果無關", JSON.stringify(a) === JSON.stringify(b));
threw = false; try { effectivePairs(cell, [{ seed: 99, injected: true }], [{ seed: 1, injected: true }]); } catch { threw = true; }
ck("T9k Seed 順序不對直接拒絕", threw);

// T10、T11：需要實際跑對局（只用上一輪用過的 Seeds）
const P = await import("./owner_preview/pin_v20_v23_stream.mjs");
for (const [label, mk2] of [["工具 inv", () => P.build("balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 130001, null)], ["生涯 中素質", () => P.build("career.v24", "v2.jungle_invasion", null, 130201, "mid")]]) {
  const plain = P.streamHash(mk2()), inst = runInstrumented(mk2(), { seed: 0 });
  ck(`T10 掛上量測後整場雜湊相同（${label}）`, plain.hash === inst.hash && plain.ticks === inst.ticks, `${plain.hash} vs ${inst.hash}`);
}
const rec = JSON.parse(fs.readFileSync(path.join(ROOT, "review/tactic-book-3a/v24_sprint1/s13_results/shadow/s2b_tool_inv.json"), "utf8")).rows.find((r) => r.seed === 120001 && r.arm === "s12");
process.env.ESMO_BALANCE_TACTICEXEC = "adaptive.v1.2";
const e11 = P.build("balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 120001, null);
delete process.env.ESMO_BALANCE_TACTICEXEC;
const o11 = runInstrumented(e11, { seed: 120001 });
ck("T11a 判定器與上一輪 v1 的紀錄相同", ["blue", "red"].every((S) => ["episodes", "buffEpisodes", "takenAny", "takenSame", "starts", "startsInOpportunity"].every((k) => o11.s2b[S][k] === rec.sides[S][k])), JSON.stringify({ now: o11.s2b, rec: rec.sides }));
const oldDir = "C:/Users/ifikn/esmo-measure/v24-s13-val-130001/stress";
for (const [file, args] of [["tool_inv_s13", ["--path=tool", "--cfg=inv", "--arm=s13"]], ["career_low_s12", ["--path=career", "--tier=low", "--arm=s12"]]]) {
  const f = `${oldDir}/${file}.jsonl`;
  if (!fs.existsSync(f)) { ck(`T11b 壓力工具與上一輪紀錄相同（${file}）`, false, "missing old data"); continue; }
  const old = fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((r) => r.injected);
  const tmp = path.join(os.tmpdir(), `esmo_closure_gate_${process.pid}_${file}.jsonl`);
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/owner_preview/closure_stress_v24.mjs"), ...args, `--seeds=${old.seed}`, `--out=${tmp}`], { encoding: "utf8" });
  const now = r.status === 0 ? JSON.parse(fs.readFileSync(tmp, "utf8").trim()) : null;
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  ck(`T11b 壓力工具與上一輪紀錄相同（${file}）`, !!now && ["injected", "over", "winner", "end", "afterInject", "nexusHits", "noWaveHits"].every((k) => now[k] === old[k]), JSON.stringify({ now, old }));
}
// T12 隱藏資訊
const e = P.build("balanceTool.v24", "v2.jungle_invasion", "v2.jungle_invasion", 130001, null), tracker = createLegalTracker();
let hidden = null, shown = null;
while (!e.over && e.t < 1500) {
  e.tick(0.5); observeLegal(tracker, e);
  if (e.t < 300) continue;
  const alive = e.players.filter((p) => !p.dead), foes = alive.filter((q) => q.side === "red");
  hidden = foes.find((q) => !e._seenV20("blue", q, alive)); shown = foes.find((q) => e._seenV20("blue", q, alive));
  if (hidden && shown) break;
}
ck("T12a 找到同時有看得見與看不見敵人的時刻", !!hidden && !!shown);
if (hidden && shown) {
  const camp = e.neutrals.camps.find((c2) => c2.side === "red").id, snap = () => JSON.stringify(legalView(e, tracker, "blue", camp)), feat = () => JSON.stringify(featuresFromView(legalView(e, tracker, "blue", camp), { etaJ: 10 }));
  const v0 = snap(), f0 = feat(), px = hidden.pos.x, py = hidden.pos.y;
  hidden.pos.x += 2; hidden.pos.y -= 2;
  const alive = e.players.filter((p) => !p.dead);
  ck("T12b 移動後那名敵人仍然看不見", !e._seenV20("blue", hidden, alive));
  observeLegal(tracker, e);
  ck("T12c 移動看不見的敵人，合法視圖完全不變", snap() === v0);
  ck("T12d 移動看不見的敵人，特徵完全不變", feat() === f0);
  hidden.pos.x = px; hidden.pos.y = py;
  shown.pos.x += 1.5;
  observeLegal(tracker, e);
  ck("T12e 移動看得見的敵人，合法視圖會變（正向對照）", snap() !== v0);
}
// T13 src 隔離
//  只擋 import：src/ 的註解可以正當地提到 owner_preview 底下的量測工具
const importRe = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'`][^"'`]*(?:owner_preview|lib_s2_oracle|lib_s11_legal|lib_closure_natural|s2_contract_v2|closure_stress|closure_natural)[^"'`]*["'`]/;
const offenders = git("ls-files", "src").trim().split("\n").filter((f) => /\.(js|jsx|mjs)$/.test(f) && !f.endsWith("heroImages.js")).filter((f) => importRe.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
ck("T13a src/ 沒有引用量測工具", offenders.length === 0, offenders.join(","));
ck("T13b src/ 與上一輪結果 commit 相同", git("diff", "--name-only", BASELINE, "--", "src").trim() === "" && git("status", "--porcelain", "--", "src").trim() === "");
const { SIMULATION_SEMANTICS_FINGERPRINTS: FP } = await import("../src/platform/contracts/simulationVersion.js");
ck("T13c v24 與 v23 指紋不變", FP["moba-sim.v24"] === "9727c0b4ae8beb3d" && FP["moba-sim.v23"] === "69237cce78edf2be", JSON.stringify({ v24: FP["moba-sim.v24"], v23: FP["moba-sim.v23"] }));
ck("T13d 契約版本與門檻", S2_CONTRACT_V2.version === "s2.v2" && S2_CONTRACT_V2.A.lowerMin === 0.65 && S2_CONTRACT_V2.A.minStarts === 60 && S2_CONTRACT_V2.C.c1Min === 0.6 && S2_CONTRACT_V2.C.c1Max === 1.5 && S2_CONTRACT_V2.C.c2Min === 0.5);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
