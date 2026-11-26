#!/usr/bin/env node
// ============================================================================
//  tools/check_crossengine_checkpoint.mjs — TD-66：四引擎 Checkpoint 續跑（tools/lib/crossengineCheckpoint.mjs）
//  與瀏覽器批次的版本綁定（tools/checkpoint_run.mjs --bind-browser）的測試
//
//    node tools/check_crossengine_checkpoint.mjs
//
//  全部用合成 fixture（假的 Node 參考結果、假的引擎；系統暫存區），不開真的瀏覽器、不跑真的對局：
//  正常執行、人工停止、瀏覽器崩潰後續跑、舊 FAIL 保留、沒有重複／遺漏、匯出後用「原封不動」的
//  tools/c2/judge_c2_crossengine.mjs 判定（PASS 與真的有差異時 FAIL 都要照實）、瀏覽器版本改變、候選／工具／計畫改變、
//  原始資料被改、匯出目錄非空、src 有未提交變更、Session 沒有正常結束。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, "..");
const X = await import(pathToFileURL(path.join(HERE, "lib", "crossengineCheckpoint.mjs")).href);
const CP = await import(pathToFileURL(path.join(HERE, "lib", "checkpoint.mjs")).href);
let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 500) : ""}`); } };
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-xcp-"));
process.on("exit", () => { if (path.resolve(BASE).startsWith(path.resolve(os.tmpdir())) && path.basename(BASE).startsWith("esmo-xcp-")) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* 暫存 */ } } });
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof s === "string" ? s : JSON.stringify(s, null, 1)); };
const SHA = "1".repeat(40), TREE = "2".repeat(40), FP = "360474218ca774b9";
const ENGINES = ["chrome", "firefox", "webkit"];
const plan = { planId: "xcp-fixture", items: [{ id: "A1", seed: 11 }, { id: "A2", seed: 12 }, { id: "A3", seed: 13 }], rulesets: { det: "balanceTool.v26" } };
const rplan = { planId: "xcp-fixture-repeat", items: [{ id: "A1", seed: 11 }, { id: "A3", seed: 13 }], rulesets: { det: "balanceTool.v26" } };
const planPath = path.join(BASE, "plan.json"), rplanPath = path.join(BASE, "rplan.json"); write(planPath, plan); write(rplanPath, rplan);
const toolA = path.join(BASE, "tools", "runner.mjs"); write(toolA, "// runner v1\n");
const recordEnv = { head: SHA, srcDirty: false, sim: "moba-sim.v26", fingerprint: FP };
const perTick = (seed, n = 40) => Array.from({ length: n }, (_, k) => crypto.createHash("sha1").update(`${seed}:${k}`).digest("hex").slice(0, 12));
const nodeRun = async (it) => { const p = perTick(it.seed); return { setupHash: `h${it.seed}`, setupJson: JSON.stringify({ seed: it.seed }), ticks: p.length, over: true, winner: it.seed % 2 ? "blue" : "red", endT: 600, kills: [1, 2], gold: [3, 4], final: p[p.length - 1], perTick: p }; };
const versions = { chrome: "158.0.1", firefox: "155.0", webkit: "26.6" };
/** 假引擎：opts.crashAt＝{ engine, id }、opts.diff＝{ engine, id }（回傳不同的 tick） */
const fakeDeps = (opts = {}) => {
  const seen = [];
  return { seen, recordEnv, stopAfter: opts.stopAfter,
    nodeRun,
    openEngine: async (name) => ({ name, ua: `${name}-ua`, browserVersion: (opts.versions || versions)[name], close: async () => {} }),
    runOnEngine: async (E, N) => {
      const seed = JSON.parse(N.setupJson).seed; const id = plan.items.find((x) => x.seed === seed).id; seen.push(`${E.name}/${id}`);
      if (opts.crashAt && opts.crashAt.engine === E.name && opts.crashAt.id === id) throw new Error("Target page, context or browser has been closed");
      const p = [...N.perTick]; if (opts.diff && opts.diff.engine === E.name && opts.diff.id === id) p[7] = "deadbeef0000";
      return { ticks: p.length, over: true, winner: N.winner, endT: N.endT, kills: N.kills, gold: N.gold, final: p[p.length - 1], perTick: p };
    } };
};
const open = (dir, o = {}) => X.openRun({ dir, resume: !!o.resume, plan: o.plan || plan, planPath: o.planPath || planPath, engines: ENGINES, candidateSha: o.sha || SHA, treeSha: TREE, srcDirty: !!o.srcDirty, tools: [toolA],
  env: { nodeVersion: "v24.18.0", sim: "moba-sim.v26", fingerprint: FP, kernel: "det" }, procedure: { url: "http://127.0.0.1:5647/ESMO-/", cap: 3000, engines: ENGINES } });
const journal = (dir) => fs.readFileSync(path.join(dir, "journal.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const JUDGE = path.join(HERE, "c2", "judge_c2_crossengine.mjs");
const judge = (data, rep) => spawnSync(process.execPath, [JUDGE, `--plan=${planPath}`, `--data=${data}`, `--repeatPlan=${rplanPath}`, `--repeat=${rep}`, `--fingerprint=${FP}`], { encoding: "utf8" });

// ═══ 1. 正常＋中斷＋崩潰＋續跑 ═══════════════════════════════════════════════
const D = path.join(BASE, "cp-main");
let o = open(D);
ck("建立：manifest 釘住計畫、工具、候選、指紋；案例＝node＋3 引擎 × 3 項 = 12", o.validation.status === "PASS" && o.cp.manifest.cases.length === 12 && o.cp.manifest.contract?.sha256 && o.cp.manifest.tools.length === 1);
let r = await X.runAll(o.cp, plan, ENGINES, fakeDeps({ stopAfter: 4 }));
ck("人工安全停止（4 個案例後）⇒ INTERRUPTED，剩 8 個", r.status === "INTERRUPTED" && o.cp.status().pending.length === 8, JSON.stringify(r));
o = open(D, { resume: true });
r = await X.runAll(o.cp, plan, ENGINES, fakeDeps({ crashAt: { engine: "firefox", id: "A2" } }));
ck("續跑中 Firefox 崩潰 ⇒ INTERRUPTED（browser-crash），已完成的保留", r.status === "INTERRUPTED" && /firefox A2/.test(r.detail) && o.cp.status().done.has("firefox/A1"), JSON.stringify(r));
o = open(D, { resume: true });
const deps3 = fakeDeps(); r = await X.runAll(o.cp, plan, ENGINES, deps3);
ck("再續跑 ⇒ COMPLETE；只跑剩下的（沒有重跑已完成的案例）", r.status === "COMPLETE" && !deps3.seen.includes("firefox/A1") && deps3.seen.includes("firefox/A2"), JSON.stringify({ r, seen: deps3.seen }));
const J = journal(D); const doneEv = J.filter((e) => e.event === "case-done");
ck("沒有重複、沒有遺漏：12 個案例各完成恰好一次", doneEv.length === 12 && new Set(doneEv.map((e) => e.caseId)).size === 12);
ck("原始 FAIL 與恢復歷史保留：case-failed（firefox/A2 browser-crash）、interrupted（manual-stop、browser-crash）、resume ×2", J.some((e) => e.event === "case-failed" && e.caseId === "firefox/A2" && e.reason === "browser-crash") && J.filter((e) => e.event === "interrupted").map((e) => e.reason).join(",") === "manual-stop,browser-crash" && J.filter((e) => e.event === "resume").length === 3);
ck("每筆引擎 raw 記錄實際瀏覽器版本與 UA", (() => { const e = o.cp.status().done.get("webkit/A3"); const raw = JSON.parse(fs.readFileSync(path.join(D, e.raw), "utf8")); return raw.browserVersion === "26.6" && raw.ua === "webkit-ua" && e.actual === "26.6|webkit-ua"; })());
ck("重複記錄同一個案例 ⇒ 拒絕（duplicate_case）", (() => { try { o.cp.validate({ candidateSha: SHA, treeSha: TREE, env: { ...o.cp.manifest.env }, procedure: o.cp.manifest.procedure }); const p = path.join(D, "raw", "dup.json"); fs.writeFileSync(p, "{}"); o.cp.record("chrome/A1", p); return false; } catch (e) { return e.code === "duplicate_case"; } })());

// ═══ 2. 匯出 → 原封不動的 judge ═════════════════════════════════════════════
const R = path.join(BASE, "cp-repeat"); let ro = X.openRun({ dir: R, resume: false, plan: rplan, planPath: rplanPath, engines: ENGINES, candidateSha: SHA, treeSha: TREE, srcDirty: false, tools: [toolA], env: { sim: "moba-sim.v26", fingerprint: FP }, procedure: {} });
await X.runAll(ro.cp, rplan, ENGINES, fakeDeps());
const E1 = path.join(BASE, "export-formal"), E2 = path.join(BASE, "export-repeat");
const x1 = X.exportFormal(o.cp, E1, SHA), x2 = X.exportFormal(ro.cp, E2, SHA);
ck("匯出：完整性 PASS 才匯出，檔案數 = 案例數（12＋8）", x1.status === "PASS" && x1.files === 12 && x2.status === "PASS" && x2.files === 8, JSON.stringify({ x1, x2 }));
let jr = judge(E1, E2);
ck("judge（tools/c2/judge_c2_crossengine.mjs，未修改）讀匯出資料 ⇒ PASS（3 引擎 3/3、重複性、環境一致）", jr.status === 0 && /"overall":"PASS"/.test(jr.stdout), jr.stdout + jr.stderr);
{
  // 審查修正（I3）：judge 不比對正式與重複兩份的瀏覽器版本 ⇒ 匯出時配對檢查
  const Rv = path.join(BASE, "cp-repeat-newff"); const rv = X.openRun({ dir: Rv, resume: false, plan: rplan, planPath: rplanPath, engines: ENGINES, candidateSha: SHA, treeSha: TREE, srcDirty: false, tools: [toolA], env: { sim: "moba-sim.v26", fingerprint: FP }, procedure: {} });
  await X.runAll(rv.cp, rplan, ENGINES, fakeDeps({ versions: { ...versions, firefox: "156.0" } }));
  const xp = X.exportFormal(o.cp, path.join(BASE, "export-paired-bad"), SHA, { pairWith: rv.cp });
  ck("I3：正式（Firefox 155）與重複（Firefox 156）兩份 checkpoint 配對匯出 ⇒ BLOCKED engine_versions_paired", xp.status === "BLOCKED" && xp.checks[0].id === "engine_versions_paired", JSON.stringify(xp));
  const xok = X.exportFormal(o.cp, path.join(BASE, "export-paired-ok"), SHA, { pairWith: ro.cp });
  ck("I3：版本相同的配對 ⇒ 匯出 PASS，並記錄各引擎實際版本", xok.status === "PASS" && JSON.parse(fs.readFileSync(path.join(BASE, "export-paired-ok", "EXPORTED_FROM_CHECKPOINT.json"), "utf8")).engineVersions.firefox[0] === "155.0|firefox-ua");
}
ck("匯出目錄已有內容 ⇒ BLOCKED，不覆寫", X.exportFormal(o.cp, E1, SHA).status === "BLOCKED" && fs.readdirSync(path.join(E1, "chrome")).length === 3);
ck("匯出時要求的候選 SHA 不同 ⇒ 不匯出", X.exportFormal(o.cp, path.join(BASE, "export-x"), "9".repeat(40)).status !== "PASS");
{
  const Dd = path.join(BASE, "cp-diff"); const od = open(Dd); await X.runAll(od.cp, plan, ENGINES, fakeDeps({ diff: { engine: "webkit", id: "A2" } }));
  const Ed = path.join(BASE, "export-diff"); X.exportFormal(od.cp, Ed, SHA);
  const jd = judge(Ed, E2);
  ck("真的有差異（WebKit A2 第 7 tick）⇒ judge FAIL，差異照實保留（checkpoint 不掩蓋結果）", jd.status === 1 && /"overall":"FAIL"/.test(jd.stdout) && /"webkit":"FAIL 2\/3"/.test(jd.stdout), jd.stdout);
}

// ═══ 3. 不得混用：瀏覽器版本、候選、工具、計畫 ════════════════════════════════
{
  const Dv = path.join(BASE, "cp-ver"); let ov = open(Dv); await X.runAll(ov.cp, plan, ENGINES, fakeDeps({ crashAt: { engine: "firefox", id: "A2" } }));
  ov = open(Dv, { resume: true });
  const rv = await X.runAll(ov.cp, plan, ENGINES, fakeDeps({ versions: { ...versions, firefox: "156.0" } }));
  ck("續跑時 Firefox 已更新（155.0 → 156.0）⇒ BLOCKED environment-changed，不混用", rv.status === "BLOCKED" && /firefox 的實際版本變了/.test(rv.detail) && journal(Dv).some((e) => e.event === "interrupted" && e.reason === "environment-changed"), JSON.stringify(rv));
  ck("…而且沒有寫入任何新版本的 Firefox 結果", !ov.cp.status().done.has("firefox/A2") && [...ov.cp.status().done.values()].filter((e) => e.caseId.startsWith("firefox/")).every((e) => e.actual === "155.0|firefox-ua"));
  const os2 = open(Dv, { resume: true, sha: "3".repeat(40) });
  ck("候選 SHA 不同 ⇒ 驗證 BLOCKED（candidate_sha）", os2.validation.status === "BLOCKED" && os2.validation.checks.some((c) => c.id === "candidate_sha" && c.status === "BLOCKED"));
  fs.writeFileSync(toolA, "// runner v2\n");
  const ot = open(Dv, { resume: true });
  ck("runner／工具內容改變 ⇒ BLOCKED（tool hash）", ot.validation.status === "BLOCKED" && ot.validation.checks.some((c) => c.id.startsWith("tool:") && c.status === "BLOCKED"));
  fs.writeFileSync(toolA, "// runner v1\n");
  const p2 = path.join(BASE, "plan-edited.json"); write(p2, plan); fs.copyFileSync(planPath, p2 + ".bak"); write(planPath, { ...plan, note: "edited" });
  const oc = open(Dv, { resume: true });
  ck("事前登記的計畫檔被改 ⇒ BLOCKED（contract）", oc.validation.status === "BLOCKED" && oc.validation.checks.some((c) => c.id === "contract" && c.status === "BLOCKED"));
  write(planPath, plan);
  let threw = null; try { X.openRun({ dir: Dv, resume: true, plan: { ...plan, items: plan.items.slice(0, 2) }, planPath, engines: ENGINES, candidateSha: SHA, treeSha: TREE, srcDirty: false, tools: [toolA], env: {}, procedure: {} }); } catch (e) { threw = e.code; }
  ck("續跑時案例清單不同（少一項）⇒ 拒絕 cases_changed（不能漏掉案例）", threw === "cases_changed");
}
// ═══ 4. 資料損壞、src 未提交、Session 未正常結束 ══════════════════════════════
{
  const Dt = path.join(BASE, "cp-tamper"); const ot = open(Dt); await X.runAll(ot.cp, plan, ENGINES, fakeDeps({ stopAfter: 5 }));
  const e = ot.cp.status().done.get("chrome/A1"); const p = path.join(Dt, e.raw); const j = JSON.parse(fs.readFileSync(p, "utf8")); j.identical = true; j.result.perTick[3] = "x"; fs.writeFileSync(p, JSON.stringify(j));
  const v = open(Dt, { resume: true });
  ck("已完成的 raw 被改過 ⇒ 續跑驗證 FAIL（raw:chrome/A1），不會被拿來判定", v.validation.status === "FAIL" && v.validation.checks.some((c) => c.id === "raw:chrome/A1" && c.status === "FAIL"));
  let t = null; try { open(path.join(BASE, "cp-dirty"), { srcDirty: true }); } catch (err) { t = err.code; }
  ck("src 有未提交的變更 ⇒ 拒絕建立（src_dirty）", t === "src_dirty");
  const Du = path.join(BASE, "cp-unclean"); const ou = open(Du); ou.cp.begin({}); // 模擬 Session 中斷：begin 之後沒有 end
  const ou2 = open(Du, { resume: true });
  ck("上一個 Session 沒有正常結束（中斷／休眠／被終止）⇒ 續跑時自動記錄 interrupted（unclean-stop）", ou2.validation.status === "PASS" && journal(Du).some((e2) => e2.event === "interrupted" && e2.reason === "unclean-stop"));
}
// ═══ 5. 瀏覽器批次（checkpoint_run --bind-browser）═══════════════════════════
{
  const git = (cwd, ...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...a], { cwd, encoding: "utf8" });
  const repo = path.join(BASE, "brepo"); fs.mkdirSync(repo); git(repo, "init", "-q", "-b", "main");
  write(path.join(repo, "tools", "fake_gate.mjs"), "import fs from 'node:fs'; fs.writeFileSync(process.argv[2], 'ok ' + process.argv[3]);\n"); git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "x");
  const sha = git(repo, "rev-parse", "HEAD").stdout.trim(); const bdir = path.join(BASE, "bcp");
  const runB = (ver, extra = []) => spawnSync(process.execPath, [path.join(HERE, "checkpoint_run.mjs"), "--dir", bdir, "--task", "browser-batch", "--repo", repo, "--target-sha", sha, "--cases", "g1,g2,g3", "--cmd", "node tools/fake_gate.mjs {out} {case}", "--bind-browser", "chrome", ...extra],
    { encoding: "utf8", env: { ...process.env, ESMO_TEST_MODE: "1", ESMO_TEST_BROWSER_VERSIONS: JSON.stringify({ chrome: ver }) } });
  let b = runB("158.0.1", ["--stop-after", "1"]);
  ck("瀏覽器批次：建立時記錄 Chrome 版本；人工停止 ⇒ exit 3", b.status === 3 && JSON.parse(fs.readFileSync(path.join(bdir, "manifest.json"), "utf8")).env.browsers.chrome === "158.0.1 (test-override)", b.stdout.slice(-300));
  b = runB("159.0.0", ["--resume"]);
  ck("瀏覽器批次：續跑時 Chrome 已自動更新 ⇒ BLOCKED exit 2（env:browsers），不混用", b.status === 2 && /env:browsers/.test(b.stdout), b.stdout.slice(-300));
  b = runB("158.0.1", ["--resume"]);
  ck("瀏覽器批次：版本相同 ⇒ 續跑完成 exit 0", b.status === 0, b.stdout.slice(-300));
  const sb = spawnSync(process.execPath, [path.join(HERE, "checkpoint_run.mjs"), "--dir", path.join(BASE, "bcp2"), "--task", "b2", "--repo", repo, "--target-sha", sha, "--cases", "g1", "--cmd", "node tools/fake_gate.mjs {out} {case}", "--bind-browser", "chrome"], { encoding: "utf8", env: { ...process.env, ESMO_TEST_MODE: "1", ESMO_TEST_BROWSER_VERSIONS: JSON.stringify({ chrome: null }) } });
  ck("瀏覽器批次：查不到 Chrome 版本 ⇒ 不開始（exit 2）", sb.status === 2 && /查不到 chrome/.test(sb.stdout), sb.stdout.slice(-200));
}
// ═══ 6. 歷史工具沒有被改動 ═══════════════════════════════════════════════════
{
  const g = spawnSync("git", ["diff", "--quiet", "43d2b757baaf33117d82012990bd6956e5acd84e", "--", "tools/c1/run_c1_crossengine.mjs", "tools/c2/judge_c2_crossengine.mjs", "tools/c1/c1_engines.mjs", "tools/c1/c1_state_digest.js"], { cwd: ROOT });
  ck("歷史四引擎 runner、judge、引擎介面、digest 與 main 43d2b757 完全相同（只新增候選，不覆寫）", g.status === 0);
}

console.log(`\nCrossengine checkpoint（TD-66）：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log("失敗：" + fails.join("；"));
process.exit(fail ? 1 : 0);
