#!/usr/bin/env node
// ============================================================================
//  tools/check_release_readiness.mjs — Release Readiness 報告（tools/release_readiness.mjs）的測試
//
//    node tools/check_release_readiness.mjs
//
//  拋棄式 git repo＋本機 bare「遠端」＋真的 release_gate run 收據。
//  重點是反向：過期、未跑、RUNNING、中斷、旗標、main 前進、工作目錄不乾淨，一律不能是 GO。
// ============================================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RR = await import(pathToFileURL(path.join(HERE, "release_readiness.mjs")).href);
const CPL = await import(pathToFileURL(path.join(HERE, "lib", "checkpoint.mjs")).href);
const CLI = path.join(HERE, "release_gate.mjs");
let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 500) : ""}`); } };
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-rrd-"));
process.on("exit", () => { if (path.basename(BASE).startsWith("esmo-rrd-")) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* 暫存 */ } } });
const git = (cwd, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8" });
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const FLAGS = RR.DEFAULT_FORMAL_FLAGS;

const REMOTE = path.join(BASE, "remote.git"); git(BASE, "init", "-q", "--bare", "-b", "main", REMOTE);
const R = path.join(BASE, "r"); fs.mkdirSync(R);
git(R, "init", "-q", "-b", "main"); git(R, "remote", "add", "origin", REMOTE);
write(path.join(R, ".gitignore"), "node_modules/\ndist/\n");
write(path.join(R, "package.json"), JSON.stringify({ name: "fx", private: true, type: "module", scripts: { build: "x" }, dependencies: { fakepkg: "^1.2.0" }, devDependencies: { vite: "^5.0.0" } }));
write(path.join(R, "package-lock.json"), JSON.stringify({ name: "fx", lockfileVersion: 3, packages: { "": {}, "node_modules/fakepkg": { version: "1.2.3" }, "node_modules/vite": { version: "5.4.0" } } }));
write(path.join(R, "index.html"), "<html></html>\n"); write(path.join(R, "vite.config.js"), "export default {};\n");
write(path.join(R, "src", "featureFlags.js"), `export const FLAGS = Object.freeze({\n  devFastForward: true,\n${FLAGS.map((f) => `  ${f}: false,`).join("\n")}\n});\n`);
write(path.join(R, "tools", "ok.mjs"), "process.exit(0);\n"); write(path.join(R, "tools", "bad.mjs"), "process.exit(1);\n");
write(path.join(R, "docs", "a.md"), "a\n");
git(R, "add", "-A"); git(R, "commit", "-q", "-m", "base"); git(R, "push", "-q", "origin", "main");
write(path.join(R, "node_modules", "fakepkg", "package.json"), JSON.stringify({ name: "fakepkg", version: "1.2.3" }));
write(path.join(R, "node_modules", "vite", "package.json"), JSON.stringify({ name: "vite", version: "5.4.0" }));
write(path.join(R, "node_modules", "vite", "bin", "vite.js"), 'import fs from "node:fs"; import path from "node:path"; const a = process.argv.slice(2); if (a[0] === "--version") { console.log("vite/5.4.0"); process.exit(0); } const o = path.resolve(a[a.indexOf("--outDir") + 1]); fs.rmSync(o, { recursive: true, force: true }); fs.mkdirSync(o, { recursive: true }); fs.writeFileSync(path.join(o, "index.html"), fs.readFileSync("index.html")); process.exit(0);\n');
const B = git(R, "rev-parse", "HEAD").stdout.trim();
const RD = path.join(BASE, "receipts");
const run = (sha, gate, cmd, extra = []) => spawnSync(process.execPath, [CLI, "run", "--repo", R, "--target-sha", sha, "--receipts-dir", RD, "--gate", gate, "--cmd", cmd, "--json", ...extra], { encoding: "utf8" }).status;
run(B, "logic", "node tools/bad.mjs"); run(B, "logic", "node tools/ok.mjs");
run(B, "prod", "node node_modules/vite/bin/vite.js build --outDir dist", ["--record-bundle", "dist"]);
const collect = (o = {}) => RR.collect({ repo: R, target: B, gates: ["logic", "prod"], receiptsDir: RD, ...o });

{ const r = await collect();
  ck("全部 PASS、旗標 false、候選＝遠端 main ⇒ GO", r.decision === "GO", JSON.stringify(r.blockers));
  ck("歷史：同 gate 先 FAIL 後 PASS ⇒ 目前 PASS，歷史保留 FAIL→PASS", r.gates[0].state === "PASS" && r.gates[0].history.map((h) => h.status).join("→") === "FAIL→PASS", JSON.stringify(r.gates[0].history));
  ck("Build：顯示收據記錄的 bundle 雜湊", /^[0-9a-f]{64}$/.test(r.build.aggregateSha256 || ""));
  ck("旗標：7 個正式旗標都讀到 false；dev 旗標也列出", Object.values(r.flags.expectFalse).every((v) => v === false) && r.flags.values.devFastForward === true);
  ck("沒有 simulationVersion.js 的 repo ⇒ 指紋 N/A（不假裝 MATCH）", r.fingerprint.state === "N/A");
  const html = RR.toHtml(r), md = RR.toMarkdown(r);
  ck("HTML：單檔、含手機版 media query、GO 標示", /<!doctype html>/.test(html) && /@media \(max-width:640px\)/.test(html) && />GO</.test(html) && !/<script/i.test(html));
  ck("Markdown：含決策與 Gate 表", /# Release Readiness：GO/.test(md) && /\| logic \| \*\*PASS\*\*/.test(md)); }
{ const r = await collect({ now: Date.now() + 25 * 3600000 });
  ck("收據超過 24 小時 ⇒ 該 gate 是 EXPIRED、NO-GO（不會把過期的標成 PASS）", r.decision === "NO-GO" && r.gates.every((g) => g.state === "EXPIRED"), JSON.stringify(r.gates.map((g) => g.state)));
  ck("HTML 裡過期 gate 顯示 EXPIRED，不出現 PASS 標記", !/class="chip s-pass">PASS<\/span><\/td><td data-l="分類"/.test(RR.toHtml(r)) && /s-expired/.test(RR.toHtml(r))); }
{ const r = await collect({ gates: ["logic", "prod", "never"] });
  ck("有 gate 沒跑 ⇒ NOT_RUN、NO-GO", r.decision === "NO-GO" && r.gates[2].state === "NOT_RUN"); }
{ const d1 = path.join(BASE, "cp-run"); const c1 = CPL.createCheckpoint(d1, { task: "long", candidateSha: B, cases: ["a", "b"], env: {} }); c1.validate({ candidateSha: B, env: {} }); c1.begin();
  const r = await collect({ checkpoints: [`prod=${d1}`] });
  ck("checkpoint 進行中（session 的 PID 還活著）⇒ RUNNING、NO-GO（即使有舊的 PASS 收據）", r.decision === "NO-GO" && r.gates[1].state === "RUNNING", JSON.stringify(r.gates[1]));
  const d2 = path.join(BASE, "cp-dead"); const c2 = CPL.createCheckpoint(d2, { task: "long", candidateSha: B, cases: ["a"], env: {} }); c2.validate({ candidateSha: B, env: {} }); c2._append({ event: "session-start", pid: 2147480000 });
  const r2 = await collect({ checkpoints: [`prod=${d2}`] });
  ck("checkpoint 沒跑完、session 行程已不在 ⇒ INTERRUPTED、NO-GO", r2.decision === "NO-GO" && r2.gates[1].state === "INTERRUPTED", JSON.stringify(r2.gates[1])); }
{ const r = await collect({ remoteMain: null });
  ck("查不到遠端 main ⇒ NO-GO", r.decision === "NO-GO" && r.blockers.some((b) => /遠端 main/.test(b))); }
{ git(R, "checkout", "-q", "-b", "other"); write(path.join(R, "docs", "b.md"), "b\n"); git(R, "add", "-A"); git(R, "commit", "-q", "-m", "o"); git(R, "push", "-q", "origin", "other:main"); git(R, "checkout", "-q", "--detach", B);
  const r = await collect();
  ck("遠端 main 已前進、候選不包含它 ⇒ NO-GO", r.decision === "NO-GO" && r.blockers.some((b) => /不包含遠端 main/.test(b)), JSON.stringify(r.blockers));
  git(R, "push", "-q", "-f", "origin", `${B}:main`); }
{ write(path.join(R, "docs", "a.md"), "dirty\n");
  const r = await collect();
  ck("工作目錄有未提交變更 ⇒ NO-GO", r.decision === "NO-GO" && r.blockers.some((b) => /未提交/.test(b)));
  git(R, "checkout", "-q", "--", "docs/a.md"); }
{ git(R, "checkout", "-q", "-B", "flagon", B); fs.writeFileSync(path.join(R, "src", "featureFlags.js"), fs.readFileSync(path.join(R, "src", "featureFlags.js"), "utf8").replace("mobaDetMathV26: false", "mobaDetMathV26: true")); git(R, "commit", "-qam", "flag on"); const F = git(R, "rev-parse", "HEAD").stdout.trim();
  const r = await RR.collect({ repo: R, target: F, gates: ["logic"], receiptsDir: RD, remoteMain: B });
  ck("正式旗標被打開 ⇒ NO-GO（列出 mobaDetMathV26 是 true）", r.decision === "NO-GO" && r.blockers.some((b) => /mobaDetMathV26 是 true/.test(b)), JSON.stringify(r.blockers)); }
{ git(R, "checkout", "-q", "-B", "docs", B); write(path.join(R, "docs", "a.md"), "doc change\n"); git(R, "commit", "-qam", "docs"); const D = git(R, "rev-parse", "HEAD").stdout.trim();
  const c = spawnSync(process.execPath, [CLI, "carry", "--repo", R, "--base-sha", B, "--target-sha", D, "--receipts-dir", RD, "--require-gate", "logic", "--require-gate", "prod", "--json"], { encoding: "utf8" });
  const r = await RR.collect({ repo: R, target: D, gates: ["logic", "prod"], receiptsDir: RD, remoteMain: B });
  ck("純文件候選：docs-carry 沿用 ⇒ GO，來源標示 docs-carry", c.status === 0 && r.decision === "GO" && r.gates.every((g) => g.via === "docs-carry" && g.state === "PASS"), JSON.stringify({ code: c.status, blockers: r.blockers, gates: r.gates.map((g) => [g.state, g.via]) })); }
{ const r = await collect({ gates: ["<script>alert(1)</script>"] });
  ck("HTML 會跳脫 gate 名稱（不會注入 script）", !/<script>alert/.test(RR.toHtml(r)) && /&lt;script&gt;/.test(RR.toHtml(r))); }
{ const out = path.join(BASE, "out-existing"); write(path.join(out, "x"), "1");
  const r = spawnSync(process.execPath, [path.join(HERE, "release_readiness.mjs"), "--repo", R, "--target-sha", B, "--require-gate", "logic", "--out", out], { encoding: "utf8" });
  ck("CLI：輸出資料夾已有內容 ⇒ 拒絕覆寫（exit 64）", r.status === 64); }

console.log(`\nRelease Readiness 報告：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log("失敗：" + fails.join("；"));
process.exit(fail ? 1 : 0);
