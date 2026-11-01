#!/usr/bin/env node
// ============================================================================
//  tools/check_formal_acceptance_3aB.mjs — 第一階段正式驗收規格的機械核對（Phase 3a-B；登記 tools/fixtures/stage1_formal_acceptance_registration_3aB.json preFreezeWork W9）
//
//  不跑任何保留 seed。核對的事：
//    D  Owner 決策與已知驗證缺口都寫在登記檔；缺口不算 PASS
//    R  五份確認登記：凍結前不可執行、結果路徑獨立且不存在、門檻與原始登記逐欄相同
//    S  Seeds：每份都等於 study_seed_plan 的保留區段、彼此不重疊、沒有結果檔
//    P  計畫規模：工具 --plan 算出來的場數
//    X  拒跑：每支工具帶確認登記 --run 一定拒絕，而且不建立資料夾
//    W  每支工具的 worker 實跑一場（只用原始研究已觀察過的 seed）：儀器檢查通過，修正表真的進了引擎
//    B  verify 基準已由機械產生，commit 是分支點
//    G  P7 的 gate 清單與工具都存在
//  單線約 1–2 分鐘。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync, fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stableStringify } from "../src/platform/contracts/squadSnapshot.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const J = JSON.stringify;
const FX = (f) => path.join(ROOT, "tools/fixtures", f);
const R = (f) => JSON.parse(fs.readFileSync(FX(f), "utf8"));
const same = (a, b) => stableStringify(a) === stableStringify(b);

const P7 = R("stage1_formal_acceptance_registration_3aB.json");
const FORMAL = {
  ga8: { file: "ga8_fix_confirm_registration_3aB.json", original: "ga8_registration_3aB.json", block: "G-A8.fixConfirm", range: (r) => r.seeds.range, step: () => 1, tool: "measure_ga8_3aB" },
  sideBias: { file: "sidebias_career_fixconfirm_registration_3aB.json", original: "side_bias_registration_3aB.json", block: "sideBias.career.fixConfirm", range: (r) => r.paths.career.seeds.range, step: (r) => r.paths.career.seeds.step, tool: "measure_side_bias_3aB", extra: ["--path=career"] },
  e1: { file: "e1_fix_confirm_registration_3aB.json", original: "e1_registration_3aB.json", block: "E1.fixConfirm", range: (r) => r.seeds.control, step: () => 1, tool: "measure_e1_3aB" },
  e2: { file: "e2_fix_confirm_registration_3aB.json", original: "e2_registration_3aB.json", block: "E2.fixConfirm", range: (r) => r.seeds.range, step: (r) => r.seeds.step, tool: "measure_e2_3aB" },
  confirm: { file: "exclusion_v21b1_confirm_registration_3aB.json", original: null, block: "exclusion.v21b1.confirm", range: (r) => r.seeds.range, step: (r) => r.seeds.step, tool: "measure_exclusion_v21b1_3aB" },
};
for (const f of Object.values(FORMAL)) f.reg = R(f.file);

// ── D 決策與缺口 ─────────────────────────────────────────────────────────────
{
  const d = P7.ownerDecisions ?? [];
  ck("D1 三項 Owner 決策都寫在登記檔，每項都有結論與來源；舊的待決清單已移除", d.length === 3 && d.map((x) => x.item).join() === "1,2,3" && d.every((x) => x.decision && x.source && x.question) && !("ownerDecisionsBeforeFreeze" in P7));
  ck("D1b 第 2、3 項如實標明是建議＋實作者的解讀，不是 Owner 逐字裁定（第 1 項才是）", /stated by the Owner/.test(d[0]?.source ?? "") && [d[1], d[2]].every((x) => /implementer's reading/.test(x?.source ?? "")));
  const gap = (P7.knownVerificationGaps ?? []).find((g) => g.id === "table-template-plus-choice-win-rate");
  ck("D2 未做的勝率組合是已知驗證缺口：NOT TESTED、notAPass，不可視為 PASS", gap?.status === "NOT TESTED" && gap?.notAPass === true && /never counted as a PASS/.test(d[0]?.decision ?? ""));
  ck("D3 step 4b 的登記也聲明不是勝率結論、指回這個缺口", /known verification gap and not a pass/.test(FORMAL.confirm.reg.notClaimed ?? ""));
  ck("D4 Owner 2026-11-02 指示逐字保存：先獨立 Reviewer、再回報核准凍結；STOP 保留", /獨立 Reviewer/.test(P7.ownerInstruction20261102?.verbatim ?? "") && /STOP 繼續保留/.test(P7.ownerInstruction20261102?.verbatim ?? "") && /independent Reviewer/.test(P7.status));
  ck("D5 STOP 規則原文還在：G-A8 0.60／0.55、STOP 後不放寬、不換 seeds、Challenge STOP 保留", /win rate >= 0.60 AND the lower 95% bound > 0.55/.test(P7.stopRules.ga8) && /No relaxed threshold, no new seeds, no template dropped/.test(P7.stopRules.ga8) && /stays/.test(P7.stopRules.challenge));
}

// ── R 確認登記 ───────────────────────────────────────────────────────────────
{
  for (const [id, f] of Object.entries(FORMAL)) {
    const r = f.reg;
    ck(`R1 ${id}：凍結前 READY_FOR_FREEZE、指紋 TBD_AT_FREEZE；結果路徑在登記裡、與原始結果不同、不存在`,
      /^READY_FOR_FREEZE/.test(r.status) && r.fingerprint === "TBD_AT_FREEZE" && /^tools\/fixtures\/.+_result_3aB\.json$/.test(r.result) && !fs.existsSync(path.join(ROOT, r.result)) && !/^tools\/fixtures\/(ga8|e1|e2|side_bias)_result/.test(r.result), r.result);
  }
  const fieldsSame = (cur, orig, fields, map = (x) => x) => fields.filter((k) => !same(cur[k], map(orig[k])));
  const ga8 = FORMAL.ga8.reg, ga8o = R(FORMAL.ga8.original);
  const d1 = fieldsSame(ga8, ga8o, ga8.copiedFrom.unchangedFields);
  ck("R2 G-A8：門檻、對照、範圍、指標、錯誤規則與原始登記逐欄相同（含 control 那行 STOP(INSTRUMENT) 原文）", !d1.length && ga8.thresholds.control === "std vs std must have a win rate within 0.50 +/- 0.05 (instrument sanity); outside => STOP(INSTRUMENT)" && ga8.copiedFrom.unchangedFields.includes("thresholds"), d1.join());
  const sb = FORMAL.sideBias.reg, sbo = R(FORMAL.sideBias.original);
  const d2 = fieldsSame(sb, sbo, sb.copiedFrom.unchangedFields);
  ck("R3 career 側偏：指標、比較、門檻、斷路器與原始登記逐欄相同；兩臂相同；走法與目標相同", !d2.length && same(sb.paths.career.arms, sbo.paths.career.arms) && sb.paths.career.seeds.targetPerLayout === sbo.paths.career.seeds.targetPerLayout && sb.paths.career.seeds.step === sbo.paths.career.seeds.step, d2.join());
  const e1 = FORMAL.e1.reg, e1o = R(FORMAL.e1.original);
  const swap = (o) => JSON.parse(J(o).replaceAll("21001-22200", "66001-67200").replaceAll("21001-21400", "66001-66400"));
  const d3 = fieldsSame(e1, e1o, e1.copiedFrom.unchangedFields, swap);
  ck("R4 E1：臂、主比較 TOST ±150、護欄、交互作用、整體規則與原始登記逐欄相同（只換 seed 區段）", !d3.length && e1.primary.margin === 150, d3.join());
  const e2 = FORMAL.e2.reg, e2o = R(FORMAL.e2.original);
  const d4 = fieldsSame(e2, e2o, e2.copiedFrom.unchangedFields);
  ck("R5 E2：臂、宣稱、規則、錯誤規則與原始登記逐欄相同", !d4.length, d4.join());
  const c = FORMAL.confirm.reg, r1 = R("exclusion_v21b1_result_3aB.json").rows, r2 = R("exclusion_v21b1_stage2_result_3aB.json").rows;
  const want = r1.filter((x) => x.verdict === "pass" || (x.verdict === "marginal" && r2.find((y) => y.template === x.template && y.dimension === x.dimension && y.choice === x.choice)?.verdict === "confirmed")).map((x) => ({ template: x.template, dimension: x.dimension, choice: x.choice, metric: x.metric, direction: x.direction }));
  ck("R6 step 4b：清單＝P6 提供的 13 個選擇（由兩份結果檔推出）；門檻與 P6 第二階段同一條（z ≥ 3、rel ≥ 0.05、紅藍都要）", same(c.plan.items, want) && want.length === 13 && /z >= 3 and relative effect >= 0.05/.test(c.decisionRule.confirmed) && /BOTH/.test(c.decisionRule.confirmed));
  ck("R7 step 4b：沒站住＝失敗（回報，不改列）；有錯誤場次＝不判定；review 留到凍結", /not edited/.test(c.decisionRule.overall.FAILED) && /no verdict/.test(c.decisionRule.overall.INCONCLUSIVE) && c.review === null);
}

// ── S Seeds ──────────────────────────────────────────────────────────────────
{
  const plan = R("study_seed_plan_3aB.json");
  const blocks = plan.studies;
  const toRange = (s) => s.split("-").map(Number);
  const bad = [];
  for (const [id, f] of Object.entries(FORMAL)) {
    const b = blocks.find((x) => x.id === f.block);
    if (!b) { bad.push(`${id} 沒有保留區段 ${f.block}`); continue; }
    const [a0, a1] = toRange(f.range(f.reg)), [b0, b1] = toRange(b.range);
    if (a0 < b0 || a1 > b1) bad.push(`${id} ${f.range(f.reg)} 超出 ${b.range}`);
    if (f.step(f.reg) !== b.step) bad.push(`${id} step ${f.step(f.reg)} ≠ ${b.step}`);
  }
  ck("S1 五份確認登記的 seeds 都在 study_seed_plan 自己的保留區段內，step 相同", !bad.length, bad.join(" | "));
  const rs = Object.entries(FORMAL).map(([id, f]) => [id, ...toRange(f.range(f.reg))]);
  const over = rs.flatMap((a, i) => rs.slice(i + 1).filter((b) => a[1] <= b[2] && b[1] <= a[2]).map((b) => `${a[0]}/${b[0]}`));
  ck("S2 五份確認登記的 seeds 彼此不重疊", !over.length, over.join());
  const seen = [["ga8 原始", "25001-25400"], ["E1 原始", "21001-22200"], ["E2 原始", "23001-23799"], ["career 原始", "27001-31999"], ["G-A8 篩選", "41001-41400"], ["P6 第一階段", "65001-65100"], ["P6 第二階段", "65501-65900"]].map(([n, s]) => [n, ...toRange(s)]);
  const reuse = rs.flatMap((a) => seen.filter((b) => a[1] <= b[2] && b[1] <= a[2]).map((b) => `${a[0]}/${b[0]}`));
  ck("S3 都不與已觀察過的區段重疊（原始研究、篩選、P6 兩階段）", !reuse.length, reuse.join());
  const run = spawnSync(process.execPath, ["tools/check_study_seed_plan_3aB.mjs"], { cwd: ROOT, encoding: "utf8" });
  ck("S4 check_study_seed_plan_3aB 全綠（有效 seed 去重）", run.status === 0, (run.stdout ?? "").trim().split("\n").slice(-1)[0]);
  ck("S5 P7 的 step 1–4 寫的 seeds 與登記相同", /43001-43400/.test(P7.order[0].seeds) && /51001-55999/.test(P7.order[1].seeds) && /66001-67200/.test(P7.order[2].seeds) && /67501-68299/.test(P7.order[2].seeds) && /65101-65500/.test(P7.order[3].seeds));
}

// ── P 規模與 X 拒跑 ──────────────────────────────────────────────────────────
{
  const tool = (f, ...a) => spawnSync(process.execPath, [`tools/${f.tool}.mjs`, ...(f.tool === "measure_exclusion_v21b1_3aB" ? [] : [`--reg=tools/fixtures/${f.file}`]), ...(f.extra ?? []), ...a], { cwd: ROOT, encoding: "utf8" });
  const planOf = (id) => (tool(FORMAL[id], id === "confirm" ? "--confirm-plan" : "--plan").stdout ?? "").trim();
  const pg = planOf("ga8"), ps = planOf("sideBias"), pe1 = planOf("e1"), pe2 = planOf("e2"), pc = planOf("confirm");
  ck("P1 計畫規模：G-A8 8,400、career 4,018（走到 55017）、E1 8,400、E2 1,600、step 4b 12,800", /8400 場/.test(pg) && /走到 55017/.test(ps) && /4018 場/.test(ps) && /共 8400 場/.test(pe1) && /1600 場/.test(pe2) && /12800 場/.test(pc), J([pg, ps, pe2, pc]).slice(0, 220));
  const tmp = path.join(os.tmpdir(), `esmo-formal-never-${process.pid}`);
  const bad = [];
  for (const [id, f] of Object.entries(FORMAL)) {
    const r = tool(f, id === "confirm" ? "--confirm-run" : "--run", `--dir=${tmp}`);
    if (r.status !== 2) bad.push(`${id} exit ${r.status}`);
    if (fs.existsSync(tmp)) bad.push(`${id} 建了資料夾`);
  }
  ck("X1 五支工具帶確認登記 --run 都拒絕（exit 2）、沒有建立資料夾：凍結前開不了跑", !bad.length, bad.join(" | "));
  const g = spawnSync(process.execPath, ["tools/measure_ga8_3aB.mjs", "--reg=../evil.json", "--plan"], { cwd: ROOT, encoding: "utf8" });
  ck("X2 --reg 只收 tools/fixtures/ 底下的 json", g.status === 2);
}

// ── W worker 實跑（只用已觀察過的 seed）──────────────────────────────────────
const oneMatch = (toolFile, args, task) => new Promise((resolve) => {
  const c = fork(path.join(ROOT, "tools", toolFile), args, { cwd: ROOT, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const timer = setTimeout(() => { c.kill(); resolve({ error: "timeout" }); }, 120000);
  c.on("message", (m) => {
    if (m.type === "ready") c.send(task);
    else if (m.type === "done" || m.type === "error") { clearTimeout(timer); c.kill(); resolve(m); }
  });
});
{
  const reg = (f) => `--reg=tools/fixtures/${f}`;
  const g = await oneMatch("measure_ga8_3aB.mjs", ["--ga8-worker", reg(FORMAL.ga8.file)], { id: "classic.m7#25001", key: "classic.m7", seed: 25001, template: "classic.m7" });
  const gr = g.rec;
  ck("W1 G-A8 worker（m7，已觀察的 25001）：balanceTool.v21、core.v1、修正表真的進了引擎（tableApplied）", gr?.ruleset === "balanceTool.v21" && gr?.director === "core.v1" && gr?.laneFrame === "teamRelative" && gr?.tableApplied === true, J(g.error ?? { t: gr?.tableApplied, d: gr?.duration }));
  //  藍紅都要實跑：只驗藍方時，紅方的誤判要到正式 G-A8 第 2 個 seed 才會出現（凍結彩排抓到）。表內與表外模板都驗。
  const redCases = [];
  for (const [tpl, seed] of [["classic.m7", 25002], ["classic.m2", 25002], ["std", 25004]]) { const m = await oneMatch("measure_ga8_3aB.mjs", ["--ga8-worker", reg(FORMAL.ga8.file)], { id: `${tpl}#${seed}`, key: tpl, seed, template: tpl }); redCases.push([tpl, m.rec?.side, m.rec?.tableApplied, m.error ?? null]); }
  ck("W1a G-A8 worker 模板打紅方（已觀察的偶數 seed）：表內 m7、表外 m2、std 的 tableApplied 都成立", redCases.every(([, s, t]) => s === "red" && t === true), J(redCases));
  const { resolveTactic } = await import("../src/battle/moba/tactics/tacticResolver.js");
  const { tacticInputOf } = await import("./lib/tacticTruthSim.mjs");
  const m7 = tacticInputOf({ templateId: "classic.m7", choices: {} });
  ck("W1b tableApplied 不是空轉：m7 修正表下的旋鈕與出貨版不同", J(resolveTactic(m7, {}, { phases: true, templateBalance: "v21.b1" }).phases[0].knobs) !== J(resolveTactic(m7, {}, { phases: true, templateBalance: null }).phases[0].knobs));
  const s = await oneMatch("measure_side_bias_3aB.mjs", ["--sb-worker", reg(FORMAL.sideBias.file)], { id: "career.v21#27001", key: "career.v21", seed: 27001, arm: "career.v21", path: "career" });
  ck("W2 career 側偏 worker（已觀察的 27001）：career.v21、core.v1、紅方 AI 教練 binding", s.rec?.ruleset === "career.v21" && s.rec?.director === "core.v1" && s.rec?.engineSeed === 27001 && s.rec?.redKind === "binding", J(s.error ?? { rs: s.rec?.ruleset, red: s.rec?.redKind }));
  const e1 = await oneMatch("measure_e1_3aB.mjs", ["--e1-worker", reg(FORMAL.e1.file)], { id: "snowball@blue#21001", key: "snowball@blue", seed: 21001, arm: "snowball", side: "blue" });
  ck("W3 E1 worker（已觀察的 21001）讀確認登記的臂：balanceTool.v21、儀器版本相同、自我檢查沒問題", e1.rec?.ruleset === "balanceTool.v21" && e1.rec?.tool === "phaseStudySim.v3" && !e1.rec?.selfCheck?.length, J(e1.error ?? { sc: e1.rec?.selfCheck }));
  const e2 = await oneMatch("measure_e2_3aB.mjs", ["--e2-worker", reg(FORMAL.e2.file)], { id: "ctrl#23001", key: "ctrl", seed: 23001, arm: "ctrl" });
  ck("W4 E2 worker（已觀察的 23001）：career.v21 正式入口、紅方 binding、選擇沒被拿掉", e2.rec?.ruleset === "career.v21" && e2.rec?.redKind === "binding" && !e2.rec?.dropped?.length && e2.rec?.engineSeed === 23001, J(e2.error ?? { rs: e2.rec?.ruleset, red: e2.rec?.redKind }));
  const armC = { templateId: "classic.m3", choices: { objectives: { tower: "high" } } };
  const c = await oneMatch("measure_exclusion_v21b1_3aB.mjs", ["--exclusion-worker"], { id: "c|red|x#65001", key: "c|red|x", seed: 65001, red: armC });
  ck("W5 step 4b worker（已觀察的 65001，紅方帶選擇）：seed 與任務相符", c.rec?.seed === 65001 && c.rec?.taskId === "c|red|x#65001", J(c.error ?? { s: c.rec?.seed }));
}

// ── B verify 基準 ────────────────────────────────────────────────────────────
{
  const f = FX("stage1_verify_baseline_3aB.json");
  if (!fs.existsSync(f)) ck("B1 verify 基準存在（tools/record_verify_baseline_3aB.mjs --record）", false, "尚未記錄");
  else {
    const b = JSON.parse(fs.readFileSync(f, "utf8"));
    const base = execFileSync("git", ["merge-base", "origin/main", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    ck("B1 verify 基準存在：commit＝分支點、每段都有結果、失敗段都有文字", b.commit === base && b.totals.segments === b.passing.length + b.skipped.length + b.failing.length && b.failing.every((x) => x.id && typeof x.failureText === "string"), `${b.commit.slice(0, 8)} 通過 ${b.totals.pass}／跳過 ${b.totals.skip}／失敗 ${b.totals.fail}`);
    const last = execFileSync("git", ["log", "--format=%H", "--", "tools/fixtures/stage1_verify_baseline_3aB.json"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    ck("B2 verify 基準提交後沒有被改過（只有一個 commit）", last.length <= 1, `${last.length} commit`);
  }
}

// ── G 清單 ───────────────────────────────────────────────────────────────────
{
  const miss = P7.gateList.filter((g) => !fs.existsSync(path.join(ROOT, "tools", `${g}.mjs`)));
  ck("G1 P7 gateList 每支都存在", !miss.length && P7.gateList.length >= 46, `${P7.gateList.length} 支 ${miss.join()}`);
  ck("G2 新 gate 進了清單：回滾演練、這支核對", P7.gateList.includes("check_stage1_rollback_drill_3aB") && P7.gateList.includes("check_formal_acceptance_3aB"));
  ck("G3 step 8 指到回滾演練 gate、step 4b 指到 --confirm-*", /check_stage1_rollback_drill_3aB/.test(P7.order[7].tool) && /--confirm-run/.test(P7.order[3].tool));
  ck("G4 P7 沒有授權 Push、Deploy、整合 main、啟用旗標", /does not authorise push, deploy or main/.test(P7.status) && /never enables a release flag/.test(P7.status));
}

console.log(`\nFormal Acceptance 3a-B：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
