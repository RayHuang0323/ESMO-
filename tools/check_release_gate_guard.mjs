#!/usr/bin/env node
// ============================================================================
//  tools/check_release_gate_guard.mjs — Release Gate SHA 守門的正向／負向測試
//
//    node tools/check_release_gate_guard.mjs
//
//  用拋棄式的臨時 git repo 當 fixture（含第二個 worktree、本機 bare「遠端」、junction），
//  不依賴任何真實 worktree，也不碰真實 repo 的任何檔案。每個案例都透過真正的 CLI
//  （子行程）驗 exit code 與輸出，因為 exit code 才是 Codex／CI 看的契約：PASS 0｜FAIL 1｜BLOCKED 2｜用法 64。
//
//  ⚠ 每條負向測試都連「原因」一起斷言（check id），不只斷言「沒過」——
//    否則「別的原因也會讓它沒過」會讓測試假綠（BP-9 的教訓）。
//  ⚠ 這支測的是守門機制本身，不是任何產品行為；沒有放寬任何既有 gate 的標準。
// ============================================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "release_gate.mjs");
const LIBFILE = path.join(HERE, "lib", "releaseGate.mjs");
const LIB = await import(pathToFileURL(LIBFILE).href);

let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 400) : ""}`); } };

// ── 暫存區（只在系統暫存目錄下、前綴固定，結束時只刪自己建的）──────────────────
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-rgg-"));
const JUNCTIONS = [];
function cleanup() {
  for (const j of JUNCTIONS) { try { fs.rmdirSync(j); } catch { /* 已不在 */ } }
  const safeToRemove = path.resolve(BASE).startsWith(path.resolve(os.tmpdir())) && path.basename(BASE).startsWith("esmo-rgg-");
  if (safeToRemove && fs.existsSync(BASE)) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch (e) { console.log(`（暫存目錄清除失敗，可手動刪：${BASE}：${e.code}）`); } }
}
process.on("exit", () => cleanup());
let seq = 0;
const git = (cwd, ...args) => spawnSync("git", ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

function nodeModules(dir, { fakeVersion = "1.2.3", viteOk = true } = {}) {
  write(path.join(dir, "node_modules", "fakepkg", "package.json"), JSON.stringify({ name: "fakepkg", version: fakeVersion }));
  write(path.join(dir, "node_modules", "vite", "package.json"), JSON.stringify({ name: "vite", version: "5.4.0" }));
  write(path.join(dir, "node_modules", "vite", "bin", "vite.js"), viteOk ? 'console.log("vite/5.4.0");\n' : "process.exit(7);\n");
}
/** 建一個乾淨、可通過預檢的 fixture repo。回傳 { dir, sha }。 */
function makeRepo(label, { engines, lock = true, build = true, deps = true } = {}) {
  // 目錄名不用 label（label 可能含 Windows 不合法的字元如 > <）
  const dir = path.join(BASE, `fx${++seq}`); fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main"); git(dir, "config", "core.autocrlf", "false"); git(dir, "config", "core.safecrlf", "false");
  write(path.join(dir, ".gitignore"), "node_modules/\ndist/\n");
  const pkg = { name: "fx", private: true, type: "module", dependencies: { fakepkg: "^1.2.0" }, devDependencies: { vite: "^5.0.0" } };
  if (build) pkg.scripts = { build: "echo build" };
  if (engines) pkg.engines = { node: engines };
  write(path.join(dir, "package.json"), JSON.stringify(pkg, null, 1));
  if (lock) write(path.join(dir, "package-lock.json"), JSON.stringify({ name: "fx", lockfileVersion: 3, packages: { "": { name: "fx" }, "node_modules/fakepkg": { version: "1.2.3" }, "node_modules/vite": { version: "5.4.0" } } }, null, 1));
  write(path.join(dir, "index.html"), "<!doctype html><title>fx</title>\n");
  write(path.join(dir, "vite.config.js"), "export default {};\n");
  write(path.join(dir, "src", "main.js"), "export const x = 1;\n");
  write(path.join(dir, "docs", "readme.md"), "hello\n");
  git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", "c1");
  if (deps) nodeModules(dir);
  return { dir, sha: git(dir, "rev-parse", "HEAD").stdout.trim(), rdir: path.join(BASE, `receipts-${seq}`) };
}
const commit = (r, file = "docs/readme.md", text = null) => { write(path.join(r.dir, file), text ?? `v${++seq}\n`); git(r.dir, "add", "-A"); git(r.dir, "commit", "-q", "-m", `c${seq}`); return git(r.dir, "rev-parse", "HEAD").stdout.trim(); };

// 被包住的指令（都是檔案，避開 Windows shell 引號問題）
const CM = path.join(BASE, "cmds"); fs.mkdirSync(CM);
write(path.join(CM, "ok.mjs"), 'import fs from "node:fs"; if (process.argv[2]) fs.writeFileSync(process.argv[2], (process.env.ESMO_GATE_TARGET_SHA || "") + "|" + (process.env.ESMO_GATE_NAME || "")); process.exit(0);\n');
write(path.join(CM, "fail.mjs"), 'import fs from "node:fs"; if (process.argv[2]) fs.writeFileSync(process.argv[2], "ran"); process.exit(1);\n');
write(path.join(CM, "blocked.mjs"), "process.exit(2);\n");
write(path.join(CM, "slow.mjs"), "setTimeout(() => {}, 20000);\n");
write(path.join(CM, "commit.mjs"), 'import { spawnSync } from "node:child_process"; spawnSync("git", ["-c","user.name=t","-c","user.email=t@t","commit","--allow-empty","-q","-m","moved"], { stdio: "ignore" }); process.exit(0);\n');
write(path.join(CM, "dirty.mjs"), 'import fs from "node:fs"; fs.appendFileSync("docs/readme.md", "changed by gate\\n"); process.exit(0);\n');
const cmd = (f, ...a) => `node "${path.join(CM, f)}"${a.map((x) => ` "${x}"`).join("")}`;
const marker = (n) => path.join(BASE, `marker-${n}-${++seq}.txt`);

// ── CLI 呼叫 ──────────────────────────────────────────────────────────────
function cli(argv) { const r = spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8", timeout: 180000 }); return { code: r.status, out: (r.stdout || "") + (r.stderr || "") }; }
const has = (out, status, id) => new RegExp(`${status}\\s+${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(out);
const base = (r, sha, extra = []) => ["--repo", r.dir, "--target-sha", sha, "--receipts-dir", r.rdir, ...extra];
const preflight = (r, sha, extra = []) => cli(["preflight", ...base(r, sha, extra)]);
const run = (r, sha, gate, cmds, extra = []) => cli(["run", ...base(r, sha, extra), "--gate", gate, ...cmds.flatMap((c) => ["--cmd", c])]);
const assertG = (r, sha, gates, extra = []) => cli(["assert", ...base(r, sha, extra), ...gates.flatMap((g) => ["--require-gate", g])]);
const receipts = (r) => { try { return fs.readdirSync(r.rdir).filter((f) => f.endsWith(".json")).map((f) => ({ f, j: JSON.parse(fs.readFileSync(path.join(r.rdir, f), "utf8")) })); } catch { return []; } };
const newest = (r) => receipts(r).sort((a, b) => (Date.parse(b.j.finishedAt) - Date.parse(a.j.finishedAt)) || (a.f < b.f ? 1 : -1))[0];
/** 取代最新一張收據：改內容、重算摘要（模擬「別人重算過摘要的偽造／舊收據」）。 */
function replaceNewest(r, mutate, { redigest = true } = {}) {
  const n = newest(r); const j = JSON.parse(JSON.stringify(n.j)); mutate(j); if (redigest) j.digest = LIB.digestOf(j);
  fs.unlinkSync(path.join(r.rdir, n.f)); fs.writeFileSync(path.join(r.rdir, n.f), JSON.stringify(j, null, 1));
}
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();

console.log("Release Gate guard 測試（fixture 全在系統暫存目錄，結束時清除）\n");

// ══ §1 單元：Node 版本範圍 ═══════════════════════════════════════════════
console.log("§1 nodeSatisfies");
{
  const t = [["24.18.0", ">=20", true], ["24.18.0", ">=99", false], ["24.18.0", "^18", false], ["20.1.0", "^20", true], ["20.1.0", "^20.2.0", false],
    ["24.1.0", ">=18 <19 || >=20", true], ["19.0.0", ">=18 <19 || >=20", false], ["22.3.0", "22.x", true], ["22.3.0", "22", true], ["22.3.0", "~22.3.0", true], ["22.4.0", "~22.3.0", false],
    ["24.1.0", "this is not a range", null]];
  for (const [v, rng, want] of t) ck(`nodeSatisfies(${v}, "${rng}") = ${want}`, LIB.nodeSatisfies(v, rng) === want, String(LIB.nodeSatisfies(v, rng)));
}

// ══ §2 正向：全流程 PASS ═════════════════════════════════════════════════
console.log("\n§2 正向：預檢通過 → 執行 → 收據 → 查驗");
{
  const r = makeRepo("pass"); const m = marker("pass");
  const p = preflight(r, r.sha);
  ck("預檢 PASS：exit 0、有 RESULT=PASS 行", p.code === 0 && /RELEASE_GATE RESULT=PASS exit=0/.test(p.out), p.out.slice(-300));
  ck("預檢沒有寫收據（預設）", receipts(r).length === 0);
  const x = run(r, r.sha, "build", [cmd("ok.mjs", m)]);
  ck("run：exit 0、RESULT=PASS", x.code === 0 && /RESULT=PASS/.test(x.out), x.out.slice(-300));
  ck("run：指令真的在 repo 裡執行，並拿到 ESMO_GATE_TARGET_SHA／ESMO_GATE_NAME", fs.existsSync(m) && fs.readFileSync(m, "utf8") === `${r.sha}|build`);
  const n = newest(r);
  ck("收據：status PASS、targetSha＝actualSha＝actualShaAfter＝指定 SHA", n && n.j.status === "PASS" && n.j.targetSha === r.sha && n.j.actualSha === r.sha && n.j.actualShaAfter === r.sha);
  ck("收據：記錄 Gate 版本、驗證環境（node／平台／依賴摘要）、時間、指令結果", n.j.gateVersion === LIB.RELEASE_GATE_VERSION && n.j.env.nodeMajor >= 20 && !!n.j.env.platform && !!n.j.env.depsDigest && !!n.j.startedAt && !!n.j.finishedAt && n.j.commands.length === 1 && n.j.commands[0].exitCode === 0);
  ck("收據：摘要正確", n.j.digest === LIB.digestOf(n.j));
  const a = assertG(r, r.sha, ["build"]);
  ck("assert：有效收據 ⇒ exit 0", a.code === 0 && /RESULT=PASS/.test(a.out), a.out.slice(-300));
  const r2 = makeRepo("abbr"); const ab = run(r2, r2.sha.slice(0, 7), "build", [cmd("ok.mjs")]);
  ck("7 位縮寫 SHA 也可以，收據記錄的是完整 40 位", ab.code === 0 && newest(r2).j.targetSha === r2.sha && newest(r2).j.requestedTarget === r2.sha.slice(0, 7));
  const r3 = makeRepo("upper2"); const uc = run(r3, r3.sha.toUpperCase(), "build", [cmd("ok.mjs")]);
  ck("大寫 SHA 可以", uc.code === 0);
  const jx = cli(["preflight", ...base(r, r.sha), "--json"]); let jj = null; try { jj = JSON.parse(jx.out); } catch { /* */ }
  ck("--json：輸出可解析，status／checks／target／actual 齊全", jj && jj.status === "PASS" && Array.isArray(jj.checks) && jj.target === r.sha && jj.actual === r.sha && jj.exit === 0);
}

// ══ §3 SHA 驗證（負向）═══════════════════════════════════════════════════
console.log("\n§3 SHA 驗證（FAIL）");
{
  const r = makeRepo("sha"); const sha1 = r.sha; const sha2 = commit(r); const m = marker("sha");
  const x = run(r, sha1, "build", [cmd("ok.mjs", m)]);
  ck("目標＝舊 commit、工作目錄在新 commit ⇒ FAIL exit 1，原因是 sha_match", x.code === 1 && has(x.out, "FAIL", "sha_match") && /RESULT=FAIL/.test(x.out), x.out.slice(-400));
  ck("SHA 不符時被包的指令根本沒有執行", !fs.existsSync(m));
  const n = newest(r);
  ck("SHA 不符仍留下 FAIL 收據（targetSha＝指定、actualSha＝實際），且不是 PASS", n && n.j.status === "FAIL" && n.j.targetSha === sha1 && n.j.actualSha === sha2);
  ck("FAIL 收據無法讓 assert 通過", assertG(r, sha1, ["build"]).code !== 0);
  const ne = preflight(r, "0123456789abcdef0123456789abcdef01234567");
  ck("目標是不存在的 40 位 SHA ⇒ FAIL sha_match", ne.code === 1 && has(ne.out, "FAIL", "sha_match"));
  for (const bad of ["main", "HEAD", "origin/main", "refs/heads/main", "v1.0", "abc12"]) {
    const b = preflight(r, bad);
    ck(`目標「${bad}」不是 SHA ⇒ FAIL target_sha_format（分支名／tag／HEAD／太短都不收）`, b.code === 1 && has(b.out, "FAIL", "target_sha_format"), b.out.slice(-200));
  }
  git(r.dir, "branch", "cafe1234", sha1);
  const disguised = preflight(r, "cafe1234");
  ck("『長得像 SHA 的分支名』不能冒充 SHA ⇒ FAIL", disguised.code === 1 && has(disguised.out, "FAIL", "target_sha_format"), disguised.out.slice(-250));
  const nos = cli(["preflight", "--repo", r.dir, "--receipts-dir", r.rdir]);
  ck("沒給 --target-sha ⇒ FAIL target_sha_specified（驗證前必須明確指定）", nos.code === 1 && has(nos.out, "FAIL", "target_sha_specified"));
  const sub = preflight({ ...r, dir: path.join(r.dir, "src") }, sha2);
  ck("--repo 給子資料夾 ⇒ FAIL repo_is_worktree_root（避免驗到別的 checkout）", sub.code === 1 && has(sub.out, "FAIL", "repo_is_worktree_root"));
  const plain = path.join(BASE, "plain"); fs.mkdirSync(plain);
  const np = preflight({ dir: plain, rdir: r.rdir }, sha2);
  ck("不是 git 目錄 ⇒ BLOCKED repo_is_git_worktree", np.code === 2 && has(np.out, "BLOCKED", "repo_is_git_worktree"), np.out.slice(-250));
  const nx = preflight({ dir: path.join(BASE, "does-not-exist"), rdir: r.rdir }, sha2);
  ck("路徑不存在 ⇒ BLOCKED repo_exists", nx.code === 2 && has(nx.out, "BLOCKED", "repo_exists"));
  ck("SHA 不符 ＋ 缺依賴同時發生 ⇒ FAIL 優先於 BLOCKED（exit 1）", (() => { const q = makeRepo("both", { deps: false }); const o = commit(q); const y = preflight(q, q.sha); return y.code === 1 && has(y.out, "FAIL", "sha_match") && has(y.out, "BLOCKED", "node_modules_present"); })());
}

// ══ §4 工作目錄 ═════════════════════════════════════════════════════════
console.log("\n§4 工作目錄（實際程式碼必須就是指定 commit）");
{
  const mkdirty = (label, f) => { const r = makeRepo(label); f(r); const m = marker(label); const x = run(r, r.sha, "build", [cmd("ok.mjs", m)]); return { r, x, m }; };
  let t = mkdirty("tracked", (r) => write(path.join(r.dir, "src", "main.js"), "export const x = 2;\n"));
  ck("追蹤檔被改 ⇒ FAIL working_tree_clean，指令沒執行", t.x.code === 1 && has(t.x.out, "FAIL", "working_tree_clean") && !fs.existsSync(t.m), t.x.out.slice(-300));
  t = mkdirty("staged", (r) => { write(path.join(r.dir, "src", "new.js"), "x\n"); git(r.dir, "add", "src/new.js"); });
  ck("已暫存的新檔 ⇒ FAIL working_tree_clean", t.x.code === 1 && has(t.x.out, "FAIL", "working_tree_clean"));
  t = mkdirty("untracked-src", (r) => write(path.join(r.dir, "src", "extra.js"), "x\n"));
  ck("src/ 內的未追蹤檔（會被打包）⇒ FAIL working_tree_clean", t.x.code === 1 && has(t.x.out, "FAIL", "working_tree_clean"));
  t = mkdirty("untracked-docs", (r) => write(path.join(r.dir, "docs", "scratch.txt"), "x\n"));
  ck("docs/ 內的未追蹤檔（不進 build）⇒ 只警告，仍 PASS", t.x.code === 0 && /警告/.test(t.x.out), t.x.out.slice(-300));
  t = mkdirty("ignored", (r) => write(path.join(r.dir, "dist", "x.js"), "x\n"));
  ck("被 .gitignore 忽略的檔案不影響 ⇒ PASS", t.x.code === 0);
  t = mkdirty("merging", (r) => write(path.join(r.dir, ".git", "MERGE_HEAD"), "0000000000000000000000000000000000000000\n"));
  ck("進行中的 merge ⇒ FAIL no_git_operation_in_progress", t.x.code === 1 && has(t.x.out, "FAIL", "no_git_operation_in_progress"), t.x.out.slice(-250));
}

// ══ §5 依賴／環境（BLOCKED）══════════════════════════════════════════════
console.log("\n§5 依賴與環境（BLOCKED）");
{
  const blocked = (label, mutate, id, opts) => { const r = makeRepo(label, opts); if (mutate) mutate(r); const m = marker(label); const x = run(r, r.sha, "build", [cmd("ok.mjs", m)]); ck(`${label} ⇒ BLOCKED ${id}（exit 2，指令沒執行，沒有 PASS 收據）`, x.code === 2 && has(x.out, "BLOCKED", id) && !fs.existsSync(m) && receipts(r).every((e) => e.j.status !== "PASS"), x.out.slice(-350)); return r; };
  blocked("缺 node_modules", (r) => fs.rmSync(path.join(r.dir, "node_modules"), { recursive: true, force: true }), "node_modules_present");
  blocked("node_modules 是空的", (r) => { fs.rmSync(path.join(r.dir, "node_modules"), { recursive: true, force: true }); fs.mkdirSync(path.join(r.dir, "node_modules")); }, "node_modules_present");
  blocked("node_modules 是失效的 junction", (r) => { fs.rmSync(path.join(r.dir, "node_modules"), { recursive: true, force: true }); const gone = path.join(BASE, `gone-${++seq}`); fs.mkdirSync(gone); fs.symlinkSync(gone, path.join(r.dir, "node_modules"), "junction"); JUNCTIONS.push(path.join(r.dir, "node_modules")); fs.rmdirSync(gone); }, "node_modules_present");
  blocked("缺一個頂層依賴", (r) => fs.rmSync(path.join(r.dir, "node_modules", "fakepkg"), { recursive: true, force: true }), "deps_installed");
  blocked("安裝版本與 package-lock 不符", (r) => nodeModules(r.dir, { fakeVersion: "9.9.9" }), "deps_match_lockfile");
  blocked("沒有 package-lock.json", null, "deps_match_lockfile", { lock: false });
  blocked("Node 版本不符 engines（>=99）", null, "node_version", { engines: ">=99" });
  blocked("Node 版本不符 engines（^18）", null, "node_version", { engines: "^18" });
  blocked("vite 跑不起來", (r) => nodeModules(r.dir, { viteOk: false }), "build_prerequisites");
  blocked("package.json 沒有 scripts.build", null, "build_prerequisites", { build: false });
  const ok = makeRepo("engines-ok", { engines: ">=18 <19 || >=20" }); ck("engines「>=18 <19 || >=20」在目前 Node 下 ⇒ PASS", preflight(ok, ok.sha).code === 0);
  const rb = makeRepo("recdir"); fs.mkdirSync(path.dirname(rb.rdir), { recursive: true }); fs.writeFileSync(rb.rdir, "i am a file, not a directory");
  const xr = preflight(rb, rb.sha);
  ck("收據目錄不可寫 ⇒ BLOCKED receipt_dir_writable", xr.code === 2 && has(xr.out, "BLOCKED", "receipt_dir_writable"), xr.out.slice(-250));
  const br = makeRepo("browser"); const bx = preflight(br, br.sha, ["--require-browser"]);
  ck("--require-browser：找得到 Chrome ⇒ PASS，找不到 ⇒ BLOCKED（兩者都不是 FAIL）", (bx.code === 0 && has(bx.out, "PASS", "browser_available")) || (bx.code === 2 && has(bx.out, "BLOCKED", "browser_available")), bx.out.slice(-200));
}

// ══ §6 被包住的指令 ═════════════════════════════════════════════════════
console.log("\n§6 被包住的指令與事後檢查");
{
  let r = makeRepo("cmdfail"); let m2 = marker("second");
  let x = run(r, r.sha, "build", [cmd("fail.mjs", marker("f")), cmd("ok.mjs", m2)]);
  ck("指令 exit 1 ⇒ FAIL（exit 1），後面的指令不執行，收據 FAIL", x.code === 1 && /RESULT=FAIL/.test(x.out) && !fs.existsSync(m2) && newest(r).j.status === "FAIL" && newest(r).j.commands.length === 1, x.out.slice(-300));
  r = makeRepo("cmdblocked"); x = run(r, r.sha, "build", [cmd("blocked.mjs")]);
  ck("指令 exit 2（既有慣例＝環境／未跑完）⇒ BLOCKED（exit 2）", x.code === 2 && newest(r).j.status === "BLOCKED");
  r = makeRepo("cmdslow"); x = run(r, r.sha, "build", [cmd("slow.mjs")], ["--timeout-min", "0.002"]);
  ck("指令逾時 ⇒ BLOCKED（無法完成驗證），收據不是 PASS", x.code === 2 && newest(r).j.status === "BLOCKED" && newest(r).j.commands[0].timedOut === true, x.out.slice(-300));
  r = makeRepo("cmdmove"); x = run(r, r.sha, "build", [cmd("commit.mjs")]);
  ck("指令執行期間把 HEAD 往前推 ⇒ FAIL post_head_unchanged（驗的跟記錄的不是同一份）", x.code === 1 && has(x.out, "FAIL", "post_head_unchanged") && newest(r).j.status === "FAIL" && newest(r).j.actualShaAfter !== newest(r).j.actualSha, x.out.slice(-350));
  r = makeRepo("cmddirty"); x = run(r, r.sha, "build", [cmd("dirty.mjs")]);
  ck("指令改動了追蹤檔 ⇒ FAIL post_tracked_files_unchanged", x.code === 1 && has(x.out, "FAIL", "post_tracked_files_unchanged"));
  r = makeRepo("twocmd"); x = run(r, r.sha, "build", [cmd("ok.mjs"), cmd("ok.mjs")]);
  ck("兩個指令都 exit 0 ⇒ PASS，收據記錄兩個", x.code === 0 && newest(r).j.commands.length === 2);
}

// ══ §7 收據查驗（assert）＝防舊收據冒充 ═══════════════════════════════════
console.log("\n§7 收據查驗：舊 SHA、舊環境、過期、被改過的收據都不能冒充");
{
  let r = makeRepo("assert");
  ck("完全沒有收據 ⇒ BLOCKED（不是 PASS）", assertG(r, r.sha, ["build"]).code === 2);
  run(r, r.sha, "build", [cmd("ok.mjs")]);
  ck("有 build 的收據，但要求另一個 gate「regress」⇒ BLOCKED", assertG(r, r.sha, ["regress"]).code === 2);
  ck("要求兩個 gate、只有一個有收據 ⇒ BLOCKED（不會因為一個過就全過）", assertG(r, r.sha, ["build", "regress"]).code === 2);
  const oldSha = r.sha; const newSha = commit(r);
  let y = assertG(r, oldSha, ["build"]);
  ck("工作目錄已前進到新 commit，再拿舊 SHA 的收據查驗 ⇒ FAIL sha_match", y.code === 1 && has(y.out, "FAIL", "sha_match"), y.out.slice(-250));
  y = assertG(r, newSha, ["build"]);
  ck("新 SHA 沒有收據（只有舊 SHA 有）⇒ BLOCKED，舊收據不能冒充", y.code === 2 && has(y.out, "BLOCKED", "gate:build"), y.out.slice(-250));
  // 失敗與被擋的收據
  r = makeRepo("assertfail"); run(r, r.sha, "build", [cmd("fail.mjs")]);
  ck("最新收據是 FAIL ⇒ assert FAIL（exit 1）", assertG(r, r.sha, ["build"]).code === 1);
  r = makeRepo("assertblock"); run(r, r.sha, "build", [cmd("blocked.mjs")]);
  ck("最新收據是 BLOCKED ⇒ assert BLOCKED（exit 2）", assertG(r, r.sha, ["build"]).code === 2);
  // 新的蓋掉舊的
  r = makeRepo("newest"); run(r, r.sha, "build", [cmd("ok.mjs")]);
  ck("先 PASS ⇒ assert 通過", assertG(r, r.sha, ["build"]).code === 0);
  sleep(1100); // 收據檔名時間戳是秒，確保「較新」
  run(r, r.sha, "build", [cmd("fail.mjs")]);
  y = assertG(r, r.sha, ["build"]);
  ck("之後同 SHA、同 gate 重驗失敗 ⇒ 較新的 FAIL 蓋掉舊 PASS，assert FAIL", y.code === 1 && has(y.out, "FAIL", "gate:build") && /receipt_status/.test(y.out), y.out.slice(-350));
  sleep(1200);
  run(r, r.sha, "build", [cmd("ok.mjs")]);
  ck("再重驗通過 ⇒ 最新是 PASS，assert 又通過", assertG(r, r.sha, ["build"]).code === 0);
  // 被改過
  r = makeRepo("tamper"); run(r, r.sha, "build", [cmd("fail.mjs")]);
  replaceNewest(r, (j) => { j.status = "PASS"; }, { redigest: false });
  y = assertG(r, r.sha, ["build"]);
  ck("把 FAIL 收據手動改成 PASS（沒重算摘要）⇒ FAIL receipt_digest", y.code === 1 && /receipt_digest/.test(y.out), y.out.slice(-300));
  r = makeRepo("tamper2"); run(r, r.sha, "build", [cmd("ok.mjs")]);
  replaceNewest(r, (j) => { j.commands[0].exitCode = 0; j.durationMs = 1; }, { redigest: false });
  ck("收據任一欄位被改（沒重算摘要）⇒ FAIL", assertG(r, r.sha, ["build"]).code === 1);
  // 重算過摘要的「舊／錯環境」收據
  const forge = (label, mutate, id, why) => { const q = makeRepo(label); run(q, q.sha, "build", [cmd("ok.mjs")]); replaceNewest(q, mutate); const z = assertG(q, q.sha, ["build"]); ck(`${why} ⇒ FAIL ${id}`, z.code === 1 && new RegExp(id).test(z.out), z.out.slice(-350)); };
  forge("expired", (j) => { j.startedAt = ago(49); j.finishedAt = ago(48.9); }, "receipt_age", "收據 48 小時前（上限 24 小時，摘要已重算）");
  forge("future", (j) => { j.finishedAt = new Date(Date.now() + 3 * 3600000).toISOString(); }, "receipt_age", "收據時間在未來");
  forge("oldgate", (j) => { j.gateVersion = "0.9.0"; }, "receipt_gate_version", "收據由舊版 Gate 產生");
  forge("oldnode", (j) => { j.env.nodeMajor = 18; }, "receipt_env", "收據是在 Node 18 驗的");
  forge("otherplat", (j) => { j.env.platform = "linux"; }, "receipt_env", "收據是在別的作業系統驗的");
  forge("otherdeps", (j) => { j.env.depsDigest = "0".repeat(64); }, "receipt_env", "收據當時安裝的依賴組合與現在不同");
  forge("otherlock", (j) => { j.env.lockfileBlob = "1".repeat(40); }, "receipt_env", "收據當時的 lockfile 與現在不同");
  forge("othertree", (j) => { j.treeSha = "2".repeat(40); }, "receipt_tree", "收據的 tree 與該 commit 的 tree 不符");
  forge("chain", (j) => { j.actualShaAfter = "3".repeat(40); }, "receipt_sha_chain", "收據顯示驗證後 HEAD 已不是指定 SHA");
  forge("inconsistent", (j) => { j.checks.push({ id: "x", status: "FAIL", detail: "" }); }, "receipt_internal_consistency", "收據標 PASS 但內含 FAIL 檢查");
  forge("nocmd", (j) => { j.commands = []; }, "receipt_commands", "PASS 收據沒有任何驗證指令");
  forge("badschema", (j) => { j.schema = "something/else"; }, "receipt_schema", "收據 schema 不認得");
  // 只有預檢的收據
  r = makeRepo("preonly"); cli(["preflight", ...base(r, r.sha), "--gate", "pre", "--write-receipt"]);
  ck("只有預檢的收據（沒跑任何指令）不算驗證通過 ⇒ assert FAIL receipt_commands", assertG(r, r.sha, ["pre"]).code === 1 && /receipt_commands/.test(assertG(r, r.sha, ["pre"]).out));
  ck("明確加 --allow-preflight-only 才接受", assertG(r, r.sha, ["pre"], ["--allow-preflight-only"]).code === 0);
  // 環境現在壞了，也不能用舊收據
  r = makeRepo("envbroke"); run(r, r.sha, "build", [cmd("ok.mjs")]);
  fs.rmSync(path.join(r.dir, "node_modules"), { recursive: true, force: true });
  y = assertG(r, r.sha, ["build"]);
  ck("收據原本有效，但現在 node_modules 不見了 ⇒ assert BLOCKED，不是 PASS", y.code === 2 && has(y.out, "BLOCKED", "node_modules_present"), y.out.slice(-250));
  r = makeRepo("dirtynow"); run(r, r.sha, "build", [cmd("ok.mjs")]);
  write(path.join(r.dir, "src", "main.js"), "export const x = 99;\n");
  ck("收據原本有效，但現在工作目錄被改了 ⇒ assert FAIL", assertG(r, r.sha, ["build"]).code === 1);
  r = makeRepo("age"); run(r, r.sha, "build", [cmd("ok.mjs")]);
  sleep(1500);
  ck("--max-age-hours 設得比收據年齡還小 ⇒ FAIL receipt_age", (() => { const z = assertG(r, r.sha, ["build"], ["--max-age-hours", "0.0001"]); return z.code === 1 && /receipt_age/.test(z.out); })());
}

// ══ §8 多個 worktree、不寫死 ═══════════════════════════════════════════
console.log("\n§8 不同 worktree、不寫死名稱或 commit");
{
  const A = makeRepo("wtA"); const sha1 = A.sha; const sha2 = commit(A);
  const B = path.join(BASE, "ESMO-acceptance-lookalike"); // 刻意取成容易讓人誤信的名字：機制只看 SHA
  git(A.dir, "worktree", "add", "-q", "--detach", B, sha1);
  fs.symlinkSync(path.join(A.dir, "node_modules"), path.join(B, "node_modules"), "junction"); JUNCTIONS.push(path.join(B, "node_modules"));
  const shared = path.join(A.dir, ".git", "esmo-release-gate", "receipts");
  let x = cli(["run", "--repo", B, "--target-sha", sha1, "--gate", "build", "--cmd", cmd("ok.mjs")]);
  ck("另一個 worktree（node_modules 是 junction、名字像基線）以自己的 HEAD 為目標 ⇒ PASS", x.code === 0, x.out.slice(-400));
  ck("預設收據目錄在 git common dir：所有 worktree 共用，B 的 git status 仍然乾淨（收據不在工作目錄內、不會被 commit）", fs.existsSync(shared) && fs.readdirSync(shared).length === 1 && git(B, "status", "--porcelain").stdout.trim() === "");
  const y = cli(["assert", "--repo", B, "--target-sha", sha1, "--require-gate", "build"]);
  ck("從 B 查驗 ⇒ PASS（同一個收據庫）", y.code === 0, y.out.slice(-300));
  const z = cli(["assert", "--repo", A.dir, "--target-sha", sha2, "--require-gate", "build"]);
  ck("A 在較新的 sha2：sha2 沒有收據 ⇒ BLOCKED（不會拿 sha1 的收據頂替）", z.code === 2, z.out.slice(-250));
  const wrong = cli(["assert", "--repo", B, "--target-sha", sha2, "--require-gate", "build"]);
  ck("『用錯 worktree』：要驗 sha2 卻指到停在 sha1 的 B ⇒ FAIL sha_match", wrong.code === 1 && has(wrong.out, "FAIL", "sha_match"), wrong.out.slice(-250));
  const src = fs.readFileSync(CLI, "utf8") + fs.readFileSync(LIBFILE, "utf8");
  ck("原始碼沒有寫死 ESMO-acceptance", !/ESMO-acceptance/.test(src.replace(/\/\/.*$/gm, "").replace(/`[^`]*`/g, "")));
  ck("原始碼沒有寫死任何 40 位 SHA", !/\b[0-9a-f]{40}\b/.test(src));
}

// ══ §9 整合條件：祖先、遠端 main ═══════════════════════════════════════
console.log("\n§9 整合條件（--require-ancestor／--expect-remote-main／resolve-main）");
{
  const R = makeRepo("integ"); const c1 = R.sha; const c2 = commit(R); const c3 = commit(R);
  let x = preflight(R, c3, ["--require-ancestor", c1]);
  ck("候選包含指定祖先 ⇒ PASS target_descends_from", x.code === 0 && has(x.out, "PASS", "target_descends_from"));
  git(R.dir, "checkout", "-q", "--orphan", "unrelated"); write(path.join(R.dir, "docs", "other.md"), "u\n"); git(R.dir, "add", "-A"); git(R.dir, "commit", "-q", "-m", "unrelated"); const u = git(R.dir, "rev-parse", "HEAD").stdout.trim();
  git(R.dir, "checkout", "-q", "-f", "main");
  x = preflight(R, c3, ["--require-ancestor", u]);
  ck("候選不包含 main 的 commit（還沒 rebase）⇒ FAIL target_descends_from", x.code === 1 && has(x.out, "FAIL", "target_descends_from"), x.out.slice(-250));
  x = preflight(R, c3, ["--require-ancestor", "main"]);
  ck("--require-ancestor 也只收 SHA，不收分支名 ⇒ FAIL", x.code === 1 && has(x.out, "FAIL", "target_descends_from"));
  // 本機 bare 當 origin
  const bare = path.join(BASE, "origin.git"); git(BASE, "init", "-q", "--bare", "-b", "main", bare);
  git(R.dir, "remote", "add", "origin", bare); git(R.dir, "push", "-q", "origin", "main");
  const r1 = cli(["resolve-main", "--repo", R.dir]);
  ck("resolve-main：印出遠端 main 的真實 SHA", r1.code === 0 && r1.out.trim() === c3, r1.out);
  x = preflight(R, c3, ["--expect-remote-main", c3]);
  ck("遠端 main 正是預期值 ⇒ PASS remote_main_unchanged", x.code === 0 && has(x.out, "PASS", "remote_main_unchanged"));
  const c4 = commit(R); git(R.dir, "push", "-q", "origin", "main");
  x = preflight(R, c4, ["--expect-remote-main", c3]);
  ck("遠端 main 已經移動（c3→c4）⇒ FAIL remote_main_unchanged（不能假設 main 的 SHA 不變）", x.code === 1 && has(x.out, "FAIL", "remote_main_unchanged"), x.out.slice(-250));
  x = preflight(R, c4, ["--expect-remote-main", c4, "--remote", "nonexistent"]);
  ck("遠端連不上 ⇒ BLOCKED remote_main_unchanged", x.code === 2 && has(x.out, "BLOCKED", "remote_main_unchanged"), x.out.slice(-250));
  const r2 = cli(["resolve-main", "--repo", R.dir, "--remote", "nonexistent"]);
  ck("resolve-main 連不上 ⇒ exit 2", r2.code === 2);
}

// ══ §10 用法錯誤 ═══════════════════════════════════════════════════════
console.log("\n§10 用法錯誤（exit 64，不是驗證結果）");
{
  const r = makeRepo("usage");
  ck("未知子命令 ⇒ 64", cli(["bogus"]).code === 64);
  ck("沒有子命令 ⇒ 64", cli([]).code === 64);
  ck("缺 --repo ⇒ 64（刻意不預設為目前目錄）", cli(["preflight", "--target-sha", r.sha]).code === 64);
  ck("run 沒有 --gate ⇒ 64", cli(["run", ...base(r, r.sha), "--cmd", cmd("ok.mjs")]).code === 64);
  ck("run 沒有 --cmd ⇒ 64", cli(["run", ...base(r, r.sha), "--gate", "g"]).code === 64);
  ck("assert 沒有 --require-gate ⇒ 64", cli(["assert", ...base(r, r.sha)]).code === 64);
  ck("--max-age-hours 不是正數 ⇒ 64", cli(["assert", ...base(r, r.sha), "--require-gate", "g", "--max-age-hours", "-1"]).code === 64);
  ck("exit code 契約：PASS 0／FAIL 1／BLOCKED 2／用法 64（常數）", LIB.EXIT.PASS === 0 && LIB.EXIT.FAIL === 1 && LIB.EXIT.BLOCKED === 2 && LIB.EXIT.USAGE === 64);
  ck("aggregate：FAIL＞BLOCKED＞PASS", LIB.aggregate([{ status: "PASS" }, { status: "BLOCKED" }, { status: "FAIL" }]) === "FAIL" && LIB.aggregate([{ status: "PASS" }, { status: "BLOCKED" }]) === "BLOCKED" && LIB.aggregate([{ status: "PASS" }, { status: "WARN" }]) === "PASS");
}

// ── 清理（只刪自己建的暫存目錄；先拆 junction，絕不跟著 junction 刪）────────────
// 另外註冊在 'exit'（見檔案上方）：測試中途丟例外也會清，不會留下殘骸。
cleanup();
console.log(`\nRelease Gate guard：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log(`紅：${fails.join("｜")}`);
process.exit(fail ? 1 : 0);
