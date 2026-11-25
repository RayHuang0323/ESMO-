#!/usr/bin/env node
// ============================================================================
//  tools/check_release_docs_carry.mjs — TD-62 docs-carry（純文件證據沿用）的正向／反向測試
//
//    node tools/check_release_docs_carry.mjs
//
//  全部用拋棄式臨時 git repo（系統暫存區、前綴 esmo-rdc-）＋假的 vite（真的會輸出 dist，
//  而且會把 VITE_* 環境變數寫進輸出，模擬 Vite 內嵌）。不碰真實 repo、不跑任何 MOBA／CS Gate。
//  每條反向測試都連「原因」（check id）一起斷言，避免「別的原因也讓它沒過」的假綠。
// ============================================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "release_gate.mjs");
const LIB = await import(pathToFileURL(path.join(HERE, "lib", "releaseGate.mjs")).href);
const DC = await import(pathToFileURL(path.join(HERE, "lib", "docsCarry.mjs")).href);

let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 600) : ""}`); } };

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-rdc-"));
process.on("exit", () => {
  if (path.resolve(BASE).startsWith(path.resolve(os.tmpdir())) && path.basename(BASE).startsWith("esmo-rdc-")) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* 留給系統清 */ } }
});
let seq = 0;
const git = (cwd, ...args) => spawnSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const head = (dir) => git(dir, "rev-parse", "HEAD").stdout.trim();

const FAKE_VITE = `import fs from "node:fs"; import path from "node:path";
const a = process.argv.slice(2);
if (a[0] === "--version") { console.log("vite/5.4.0"); process.exit(0); }
if (a[0] === "build") {
  const out = path.resolve(a[a.indexOf("--outDir") + 1]);
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, "assets"), { recursive: true });
  fs.writeFileSync(path.join(out, "index.html"), fs.readFileSync("index.html"));
  const env = Object.keys(process.env).filter((k) => k.startsWith("VITE_")).sort().map((k) => k + "=" + process.env[k]).join(",");
  fs.writeFileSync(path.join(out, "assets", "main.js"), fs.readFileSync("src/main.js", "utf8") + "\\n// env:" + env + "\\n");
  if (fs.readFileSync("vite.config.js", "utf8").includes("EMBED_DOCS")) fs.writeFileSync(path.join(out, "assets", "notes.txt"), fs.readFileSync("docs/readme.md"));
  process.exit(0);
}
process.exit(3);
`;
/** 可通過預檢的 fixture：含一支會讀 docs/contract.md 的契約工具、一支普通工具。 */
function makeRepo({ embedDocs = false, srcReadsDoc = false, srcMentionsDoc = false, srcGlobsDocs = false } = {}) {
  const dir = path.join(BASE, `fx${++seq}`); fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main"); git(dir, "config", "core.autocrlf", "false"); git(dir, "config", "core.symlinks", "false"); git(dir, "config", "core.filemode", "false");
  write(path.join(dir, ".gitignore"), "node_modules/\ndist/\n");
  write(path.join(dir, "package.json"), JSON.stringify({ name: "fx", private: true, type: "module", scripts: { build: "vite build" }, dependencies: { fakepkg: "^1.2.0" }, devDependencies: { vite: "^5.0.0" } }, null, 1));
  write(path.join(dir, "package-lock.json"), JSON.stringify({ name: "fx", lockfileVersion: 3, packages: { "": { name: "fx" }, "node_modules/fakepkg": { version: "1.2.3" }, "node_modules/vite": { version: "5.4.0" } } }, null, 1));
  write(path.join(dir, "index.html"), "<!doctype html><title>fx</title>\n");
  write(path.join(dir, "vite.config.js"), embedDocs ? "export default {}; // EMBED_DOCS\n" : "export default {};\n");
  write(path.join(dir, "src", "main.js"), srcReadsDoc ? 'import notes from "../docs/notes.md?raw";\nexport { notes };\n'
    : srcGlobsDocs ? 'export const all = import.meta.glob("../docs/**/*.md", { query: "?raw" });\n'
    : srcMentionsDoc ? '// 用途寫在 docs/notes.md 與 AGENTS.md（只是註解）\nexport const msg = "詳見 notes.md";\n'
    : "export const x = 1;\n");
  write(path.join(dir, "docs", "readme.md"), "hello\n");
  write(path.join(dir, "docs", "notes.md"), "notes\n");
  write(path.join(dir, "docs", "contract.md"), "## Contract\nprotected\n");
  write(path.join(dir, "AGENTS.md"), "rules\n");
  write(path.join(dir, "tools", "check_logic.mjs"), "process.exit(0);\n");
  write(path.join(dir, "tools", "check_contract.mjs"), 'import fs from "node:fs"; process.exit(fs.readFileSync("docs/contract.md", "utf8").includes("protected") ? 0 : 1);\n');
  write(path.join(dir, ".github", "workflows", "deploy.yml"), "on: push\n");
  git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", "base");
  write(path.join(dir, "node_modules", "fakepkg", "package.json"), JSON.stringify({ name: "fakepkg", version: "1.2.3" }));
  write(path.join(dir, "node_modules", "vite", "package.json"), JSON.stringify({ name: "vite", version: "5.4.0" }));
  write(path.join(dir, "node_modules", "vite", "bin", "vite.js"), FAKE_VITE);
  return { dir, rdir: path.join(BASE, `receipts-${seq}`) };
}
const edit = (r, file, text) => { write(path.join(r.dir, file), text ?? `v${++seq}\n`); git(r.dir, "add", "-A"); git(r.dir, "commit", "-q", "-m", `c${++seq}`); return head(r.dir); };
function cli(argv) { const r = spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8", timeout: 300000 }); return { code: r.status, out: (r.stdout || "") + (r.stderr || "") }; }
const BUILD = "node node_modules/vite/bin/vite.js build --outDir dist --emptyOutDir";
/** 在 sha 上跑三個來源 gate：prod（含 --record-bundle）、logic、contract。 */
function runBaseGates(r, sha, { recordBundle = true, env } = {}) {
  git(r.dir, "checkout", "-q", "--detach", sha);
  const common = ["run", "--repo", r.dir, "--target-sha", sha, "--receipts-dir", r.rdir, "--json"];
  const out = {};
  const run = (argv) => { const res = spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8", timeout: 300000, env: env || process.env }); return { code: res.status, out: (res.stdout || "") + (res.stderr || "") }; };
  out.prod = run([...common, "--gate", "prod", "--cmd", BUILD, ...(recordBundle ? ["--record-bundle", "dist"] : [])]);
  out.logic = run([...common, "--gate", "logic", "--cmd", "node tools/check_logic.mjs"]);
  out.contract = run([...common, "--gate", "contract", "--cmd", "node tools/check_contract.mjs"]);
  return out;
}
const checkout = (r, sha) => git(r.dir, "checkout", "-q", "--detach", sha);
const carry = (r, base, target, gates = ["prod", "logic", "contract"]) => { checkout(r, target); return cli(["carry", "--repo", r.dir, "--base-sha", base, "--target-sha", target, "--receipts-dir", r.rdir, "--json", ...gates.flatMap((g) => ["--require-gate", g])]); };
const assert = (r, target, gates) => { checkout(r, target); return cli(["assert", "--repo", r.dir, "--target-sha", target, "--receipts-dir", r.rdir, "--json", ...gates.flatMap((g) => ["--require-gate", g])]); };
const J = (o) => { try { return JSON.parse(o.out.slice(o.out.indexOf("{"), o.out.lastIndexOf("}") + 1)); } catch { return null; } };
const checkOf = (o, id) => (J(o)?.checks || []).find((c) => c.id === id);
const has = (o, id, status) => { const c = checkOf(o, id); return !!c && (!status || c.status === status); };
const receiptFiles = (r, pred) => fs.readdirSync(r.rdir).filter(pred).map((f) => path.join(r.rdir, f));
const rewriteReceipt = (file, mutate, { redigest = true } = {}) => { const j = JSON.parse(fs.readFileSync(file, "utf8")); mutate(j); if (redigest) j.digest = LIB.digestOf(j); fs.writeFileSync(file, JSON.stringify(j, null, 1)); };

// ═══ 0. 單元：白名單與 diff 分類 ═══════════════════════════════════════════
ck("白名單：docs/**/*.md、review/**/*.md、AGENTS.md 是文件", ["docs/a/b.md", "review/x.md", "AGENTS.md", "CLAUDE.md", "README.md"].every(DC.isWhitelisted));
ck("白名單：public/**/*.md、src、tools、.github、.claude、docs 非 md 都不是文件", !["public/a/SOURCES.md", "src/x.md", "tools/a.md", ".github/x.md", ".claude/skills/a.md", "docs/a.txt", "docs/img.png", "review/a.json", "docs"].some(DC.isWhitelisted));
ck("diff 分類：mode 100755／120000／160000 一律拒絕", DC.classifyDiff([{ status: "M", oldMode: "100644", newMode: "100755", path: "docs/a.md" }, { status: "A", oldMode: "000000", newMode: "120000", path: "docs/l.md" }, { status: "A", oldMode: "000000", newMode: "160000", path: "docs/s.md" }]).length === 3);
ck("diff 分類：一般 M／A／D 文件放行", DC.classifyDiff([{ status: "M", oldMode: "100644", newMode: "100644", path: "docs/a.md" }, { status: "A", oldMode: "000000", newMode: "100644", path: "review/b.md" }, { status: "D", oldMode: "100644", newMode: "000000", path: "docs/c.md" }]).length === 0);

// ═══ 1. 正常純文件 Commit ═══════════════════════════════════════════════
{
  const r = makeRepo(); const B = head(r.dir);
  const g = runBaseGates(r, B);
  ck("來源：三個 gate 直接 run PASS（prod 含 --record-bundle）", g.prod.code === 0 && g.logic.code === 0 && g.contract.code === 0, g.prod.out.slice(-400));
  const prodRc = JSON.parse(fs.readFileSync(receiptFiles(r, (f) => f.includes("__prod__PASS"))[0], "utf8"));
  ck("來源 prod 收據記錄了 bundle 雜湊與 VITE_* 建置環境", /^[0-9a-f]{64}$/.test(prodRc.bundle?.aggregateSha256 || "") && prodRc.bundle.files === 2 && typeof prodRc.bundle.buildEnv === "object", JSON.stringify(prodRc.bundle));
  const D = edit(r, "docs/readme.md", "hello again\n");
  const c = carry(r, B, D); const cj = J(c);
  ck("正常：carry PASS（exit 0）", c.code === 0 && cj?.status === "PASS", c.out.slice(-800));
  ck("正常：prod、logic 可沿用；contract 會讀 docs/ 目錄（即使改的是別的文件）⇒ 保守要求直接重跑", JSON.stringify(cj?.carriedGates) === JSON.stringify(["prod", "logic"]) && cj?.requiresDirect?.length === 1 && cj.requiresDirect[0].gate === "contract", JSON.stringify({ carried: cj?.carriedGates, rd: cj?.requiresDirect }));
  ck("正常：在目標重新 build，bundle 與來源相同", has(c, "carry_bundle_identical", "PASS"));
  const baseFin = ["prod", "logic"].map((gname) => Date.parse(JSON.parse(fs.readFileSync(receiptFiles(r, (f) => f.includes(`__${gname}__PASS`))[0], "utf8")).finishedAt));
  ck("正常：沿用到期時間 = 來源最早收據 +24h（不延長）", Date.parse(cj?.expiresAt) === Math.min(...baseFin) + 24 * 3600000, `${cj?.expiresAt}`);
  const a = assert(r, D, ["prod", "logic"]);
  ck("正常：assert 目標 SHA PASS，且標示沿用來源", a.code === 0 && (J(a)?.checks || []).filter((x) => x.id.startsWith("gate:")).every((x) => x.status === "PASS" && x.detail.includes("沿用自")), a.out.slice(-600));
  const origB = fs.readdirSync(r.rdir).filter((f) => f.includes(B.slice(0, 12)));
  ck("正常：原收據檔名與內容不變（沒有被搬移或改寫）", origB.length === 3 && origB.every((f) => { const j = JSON.parse(fs.readFileSync(path.join(r.rdir, f), "utf8")); return j.targetSha === B && j.digest === LIB.digestOf(j); }));
  ck("正常：沒有為目標 SHA 產生任何一般（直接）收據", !fs.readdirSync(r.rdir).some((f) => f.includes(D.slice(0, 12)) && !f.includes("__docs-carry__")));
  ck("assert --require-gate docs-carry 本身不被當成 gate PASS", assert(r, D, ["docs-carry"]).code === 2);
  // 時間往後推：沿用不能比原收據活得更久（lib 層，注入 now）
  checkout(r, D);
  const late = LIB.assertReceipts({ repo: r.dir, target: D, receiptsDir: r.rdir, gates: ["logic"], maxAgeHours: 24, now: Math.min(...baseFin) + 24 * 3600000 + 60000 });
  ck("過期：來源最早收據過 24h 後，assert 目標 SHA 不再 PASS", late.status === "FAIL" && late.checks.some((x) => x.id === "gate:logic" && /carry_not_expired|base_receipt_age/.test(x.detail)), JSON.stringify(late.checks.filter((x) => x.status !== "PASS")));
  // 多層沿用
  const D2 = edit(r, "docs/readme.md", "third\n");
  const c2 = carry(r, D, D2);
  ck("多層沿用：以沿用過的 SHA 當來源 ⇒ BLOCKED（沒有直接收據）", c2.code === 2 && has(c2, "carry_base:logic", "BLOCKED"), c2.out.slice(-500));
  const c3 = carry(r, B, D2);
  ck("跨兩個文件 commit 直接從原來源沿用 ⇒ PASS（仍以原收據到期為準）", c3.code === 0 && J(c3)?.expiresAt === cj?.expiresAt, c3.out.slice(-400));
  // 沿用收據被竄改
  const carryFile = receiptFiles(r, (f) => f.includes(D.slice(0, 12)) && f.includes("__docs-carry__PASS"))[0];
  rewriteReceipt(carryFile, (j) => { j.carriedGates.push("extra"); }, { redigest: false });
  ck("沿用收據被改（沒重算 digest）⇒ assert FAIL carry_digest", (() => { const x = assert(r, D, ["logic"]); return x.code === 1 && x.out.includes("carry_digest"); })());
  // 來源收據在沿用之後被換掉（重算 digest 讓它「看起來合法」）
  const D3 = edit(r, "docs/readme.md", "fourth\n"); const c4 = carry(r, B, D3);
  const logicFile = receiptFiles(r, (f) => f.includes(B.slice(0, 12)) && f.includes("__logic__PASS"))[0];
  const logicBackup = fs.readFileSync(logicFile, "utf8");
  rewriteReceipt(logicFile, (j) => { j.durationMs += 1; });
  const a4 = assert(r, D3, ["logic"]);
  ck("沿用之後來源收據被換掉 ⇒ assert FAIL carry_base_digest_pinned", c4.code === 0 && a4.code === 1 && a4.out.includes("carry_base_digest_pinned"), a4.out.slice(-400));
  fs.writeFileSync(logicFile, logicBackup);
  // 直接收據優先
  checkout(r, D3);
  cli(["run", "--repo", r.dir, "--target-sha", D3, "--receipts-dir", r.rdir, "--gate", "logic", "--cmd", 'node -e "process.exit(1)"', "--json"]);
  const a5 = assert(r, D3, ["logic"]);
  ck("目標 SHA 上真的跑過而 FAIL ⇒ 沿用不能蓋掉（assert FAIL）", a5.code === 1 && !a5.out.includes("沿用自"), a5.out.slice(-300));
}

// ═══ 2. 非文件變更一律 FAIL ═══════════════════════════════════════════════
{
  const r = makeRepo(); const B = head(r.dir); runBaseGates(r, B);
  const cases = [["src 變更", "src/main.js", "export const x = 2;\n"], ["package-lock 變更", "package-lock.json", null], ["tools 變更", "tools/check_logic.mjs", "process.exit(0); // t\n"], ["GitHub Actions 變更", ".github/workflows/deploy.yml", "on: [push]\n"], ["未知文件（docs/*.txt）", "docs/a.txt", "x\n"], ["public 內的 .md", "public/SOURCES.md", "x\n"]];
  for (const [label, file, text] of cases) {
    checkout(r, B); git(r.dir, "checkout", "-q", "-B", `t${++seq}`);
    let t = text;
    if (file === "package-lock.json") { const j = JSON.parse(fs.readFileSync(path.join(r.dir, file), "utf8")); j.packages["node_modules/extra"] = { version: "0.0.1" }; t = JSON.stringify(j, null, 1); }
    const D = edit(r, file, t); const c = carry(r, B, D);
    ck(`${label} ⇒ FAIL carry_diff_docs_only`, c.code === 1 && has(c, "carry_diff_docs_only", "FAIL") && has(c, "carry_nondoc_tree_identical", "FAIL"), c.out.slice(-400));
  }
}

// ═══ 3. 權限位元、符號連結、submodule、merge ═════════════════════════════
{
  const r = makeRepo(); const B = head(r.dir); runBaseGates(r, B);
  git(r.dir, "checkout", "-q", "-B", "mode");
  git(r.dir, "update-index", "--chmod=+x", "docs/readme.md"); git(r.dir, "commit", "-q", "-m", "chmod");
  const c1 = carry(r, B, head(r.dir));
  ck("權限位元變更（100644→100755）⇒ FAIL", c1.code === 1 && has(c1, "carry_diff_docs_only", "FAIL") && /權限位元/.test(checkOf(c1, "carry_diff_docs_only")?.detail || ""), c1.out.slice(-400));
  checkout(r, B); git(r.dir, "checkout", "-q", "-B", "link");
  const oid = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: r.dir, input: "readme.md", encoding: "utf8" }).stdout.trim();
  git(r.dir, "update-index", "--add", "--cacheinfo", `120000,${oid},docs/link.md`); git(r.dir, "commit", "-q", "-m", "link"); git(r.dir, "checkout", "-q", "--", "docs/link.md");
  const c2 = carry(r, B, head(r.dir));
  ck("符號連結（mode 120000）⇒ FAIL", c2.code === 1 && /符號連結/.test(checkOf(c2, "carry_diff_docs_only")?.detail || ""), c2.out.slice(-400));
  checkout(r, B); git(r.dir, "checkout", "-q", "-B", "sub");
  git(r.dir, "update-index", "--add", "--cacheinfo", `160000,${B},docs/sub.md`); git(r.dir, "commit", "-q", "-m", "sub");
  const c3 = carry(r, B, head(r.dir));
  ck("submodule（mode 160000）⇒ FAIL（或因 worktree 狀態被擋，但絕不 PASS）", c3.code !== 0 && (/submodule/.test(checkOf(c3, "carry_diff_docs_only")?.detail || "") || has(c3, "working_tree_clean", "FAIL")), c3.out.slice(-400));
  checkout(r, B); git(r.dir, "checkout", "-q", "-B", "m1"); edit(r, "docs/readme.md", "m1\n");
  checkout(r, B); git(r.dir, "checkout", "-q", "-B", "m2"); edit(r, "docs/notes.md", "m2\n");
  git(r.dir, "merge", "-q", "--no-edit", "m1");
  const c4 = carry(r, B, head(r.dir));
  ck("B..D 內有 merge commit ⇒ FAIL carry_linear_history", c4.code === 1 && has(c4, "carry_linear_history", "FAIL"), c4.out.slice(-400));
  const c5 = carry(r, head(r.dir), head(r.dir));
  ck("來源與目標相同 ⇒ FAIL", c5.code === 1 && has(c5, "carry_base_sha", "FAIL"));
  checkout(r, B); git(r.dir, "checkout", "-q", "-B", "side"); const side = edit(r, "docs/readme.md", "side\n");
  checkout(r, B); git(r.dir, "checkout", "-q", "-B", "other"); const other = edit(r, "docs/notes.md", "other\n");
  const c6 = carry(r, side, other);
  ck("來源不是目標的祖先 ⇒ FAIL carry_ancestry", c6.code === 1 && has(c6, "carry_ancestry", "FAIL"), c6.out.slice(-300));
}

// ═══ 4. 文件被工具或產品讀取 ════════════════════════════════════════════
{
  const r = makeRepo(); const B = head(r.dir); runBaseGates(r, B);
  const D = edit(r, "docs/contract.md", "## Contract\nprotected\nmore\n");
  const c = carry(r, B, D); const cj = J(c);
  ck("被工具讀取的文件：carry PASS，但讀它的 gate 被標為必須直接重跑", c.code === 0 && cj?.requiresDirect?.some((x) => x.gate === "contract") && !cj?.carriedGates.includes("contract") && cj?.carriedGates.includes("logic"), JSON.stringify(cj?.requiresDirect));
  const a1 = assert(r, D, ["contract"]);
  ck("被讀取文件的 gate：assert 不能靠沿用（BLOCKED carry_covers_gate）", a1.code === 2 && a1.out.includes("carry_covers_gate"), a1.out.slice(-300));
  ck("同一張沿用收據對不受影響的 gate 仍有效", assert(r, D, ["logic", "prod"]).code === 0);
  checkout(r, D); cli(["run", "--repo", r.dir, "--target-sha", D, "--receipts-dir", r.rdir, "--gate", "contract", "--cmd", "node tools/check_contract.mjs"]);
  ck("在目標 SHA 直接重跑受影響 gate 後，三個 gate 合起來 PASS", assert(r, D, ["contract", "logic", "prod"]).code === 0);
  // 指令形式：npm run 展開、inline node -e、未知 shell 腳本
  const r3 = makeRepo(); const B3 = head(r3.dir);
  { const pkg = JSON.parse(fs.readFileSync(path.join(r3.dir, "package.json"), "utf8")); pkg.scripts.contract = "node tools/check_contract.mjs"; pkg.scripts.build = "node node_modules/vite/bin/vite.js build --outDir dist --emptyOutDir"; write(path.join(r3.dir, "package.json"), JSON.stringify(pkg, null, 1)); }
  const B3b = edit(r3, "package.json", fs.readFileSync(path.join(r3.dir, "package.json"), "utf8"));
  checkout(r3, B3b);
  const base3 = ["run", "--repo", r3.dir, "--target-sha", B3b, "--receipts-dir", r3.rdir, "--json"];
  cli([...base3, "--gate", "prod", "--cmd", "npm run build", "--record-bundle", "dist"]);
  cli([...base3, "--gate", "viaNpm", "--cmd", "npm run contract"]);
  cli([...base3, "--gate", "inline", "--cmd", 'node -e "process.exit(0)"']);
  const D3 = edit(r3, "docs/contract.md", "## Contract\nprotected\nv3\n");
  const c3 = carry(r3, B3b, D3, ["prod", "viaNpm", "inline"]); const c3j = J(c3);
  const rd = (g) => c3j?.requiresDirect?.some((x) => x.gate === g);
  ck("npm run build（只跑 vite）可沿用；npm run contract（展開後跑到讀文件的工具）必須直接重跑", c3.code === 0 && c3j?.carriedGates.includes("prod") && rd("viaNpm"), JSON.stringify(c3j?.requiresDirect) + c3.out.slice(-300));
  ck("inline node -e（無法靜態判定讀了什麼）保守處理：必須直接重跑", rd("inline"), JSON.stringify(c3j?.requiresDirect));
  void B3;
  const r2 = makeRepo({ srcReadsDoc: true }); const B2 = head(r2.dir); runBaseGates(r2, B2);
  const D2 = edit(r2, "docs/notes.md", "changed\n"); const c2 = carry(r2, B2, D2);
  ck("被產品程式 import（?raw）的文件 ⇒ FAIL carry_docs_not_product_input", c2.code === 1 && has(c2, "carry_docs_not_product_input", "FAIL"), c2.out.slice(-300));
  const r4 = makeRepo({ srcGlobsDocs: true }); const B4 = head(r4.dir); runBaseGates(r4, B4);
  const c4 = carry(r4, B4, edit(r4, "docs/deep/new.md", "new\n"));
  ck("被 import.meta.glob 涵蓋的新文件 ⇒ FAIL carry_docs_not_product_input", c4.code === 1 && has(c4, "carry_docs_not_product_input", "FAIL"), c4.out.slice(-300));
  const r5 = makeRepo({ srcMentionsDoc: true }); const B5 = head(r5.dir); runBaseGates(r5, B5);
  const c5 = carry(r5, B5, edit(r5, "docs/notes.md", "changed\n"));
  ck("src 只在註解／文案提到文件名稱（不是 import）⇒ 不算產品讀取，carry PASS", c5.code === 0 && has(c5, "carry_docs_not_product_input", "PASS"), c5.out.slice(-300));
}

// ═══ 5. bundle、收據竄改、過期、缺雜湊、環境 ═════════════════════════════
{
  const r = makeRepo({ embedDocs: true }); const B = head(r.dir); runBaseGates(r, B);
  const D = edit(r, "docs/readme.md", "embedded change\n"); const c = carry(r, B, D);
  ck("bundle 不一致（建置設定把文件打包進去）⇒ FAIL carry_bundle_identical", c.code === 1 && has(c, "carry_bundle_identical", "FAIL"), c.out.slice(-400));
}
{
  const r = makeRepo(); const B = head(r.dir); runBaseGates(r, B, { recordBundle: false });
  const D = edit(r, "docs/readme.md", "x2\n"); const c = carry(r, B, D);
  ck("來源沒有記錄 bundle 雜湊 ⇒ BLOCKED carry_bundle_identical", c.code === 2 && has(c, "carry_bundle_identical", "BLOCKED"), c.out.slice(-300));
}
{
  const r = makeRepo(); const B = head(r.dir); runBaseGates(r, B);
  const D = edit(r, "docs/readme.md", "x3\n");
  const f = receiptFiles(r, (x) => x.includes("__logic__PASS"))[0]; const keep = fs.readFileSync(f, "utf8");
  rewriteReceipt(f, (j) => { j.status = "PASS"; j.durationMs = 1; }, { redigest: false });
  const c1 = carry(r, B, D);
  ck("來源收據被竄改（digest 不符）⇒ FAIL", c1.code === 1 && has(c1, "carry_base:logic", "FAIL") && /receipt_digest/.test(checkOf(c1, "carry_base:logic")?.detail || ""), c1.out.slice(-300));
  fs.writeFileSync(f, keep);
  rewriteReceipt(f, (j) => { j.finishedAt = new Date(Date.now() - 30 * 3600000).toISOString(); });
  const c2 = carry(r, B, D);
  ck("來源收據已過期 ⇒ BLOCKED（receipt_age）", c2.code === 2 && has(c2, "carry_base:logic", "BLOCKED") && /receipt_age/.test(checkOf(c2, "carry_base:logic")?.detail || ""), c2.out.slice(-300));
  fs.writeFileSync(f, keep);
  rewriteReceipt(f, (j) => { j.env.nodeMajor = 18; });
  const c3 = carry(r, B, D);
  ck("來源收據的執行環境不同（Node 主版本）⇒ BLOCKED（receipt_env）", c3.code === 2 && /receipt_env/.test(checkOf(c3, "carry_base:logic")?.detail || ""), c3.out.slice(-300));
  fs.writeFileSync(f, keep);
  checkout(r, D);
  write(path.join(r.dir, "node_modules", "fakepkg", "package.json"), JSON.stringify({ name: "fakepkg", version: "1.9.9" }));
  const c4 = carry(r, B, D);
  ck("目標環境依賴與 lockfile 不同 ⇒ BLOCKED（deps_match_lockfile）", c4.code === 2 && has(c4, "deps_match_lockfile", "BLOCKED"), c4.out.slice(-300));
  write(path.join(r.dir, "node_modules", "fakepkg", "package.json"), JSON.stringify({ name: "fakepkg", version: "1.2.3" }));
  ck("還原依賴後同一案例 PASS（確認上面不是別的原因）", carry(r, B, D).code === 0);
}
{
  const r = makeRepo(); const B = head(r.dir);
  runBaseGates(r, B, { env: { ...process.env, VITE_SECRET: "abc" } });
  const D = edit(r, "docs/readme.md", "x4\n"); const c = carry(r, B, D);
  ck("來源 build 帶非空 VITE_* 值（無法重現）⇒ BLOCKED", c.code === 2 && /非空值/.test(checkOf(c, "carry_bundle_identical")?.detail || ""), c.out.slice(-300));
}

// ═══ 6. 收據引用 checkpoint（Phase D 與 Release Gate 的連結）══════════════
{
  const CPL = await import(pathToFileURL(path.join(HERE, "lib", "checkpoint.mjs")).href);
  const r = makeRepo(); const B = head(r.dir); checkout(r, B);
  const mkcp = (complete, sha = B) => { const d = path.join(BASE, `cp${++seq}`); const cp = CPL.createCheckpoint(d, { task: "t", candidateSha: sha, cases: ["a"], env: {} }); cp.validate({ candidateSha: sha, env: {} }); cp.interrupt("hibernate", "測試"); cp.validate({ candidateSha: sha, env: {} }); if (complete) { fs.writeFileSync(path.join(d, "raw", "a"), "1"); cp.record("a", path.join(d, "raw", "a")); cp.finalize(); } return d; };
  const base = ["run", "--repo", r.dir, "--target-sha", B, "--receipts-dir", r.rdir, "--json", "--gate", "long", "--cmd", "node tools/check_logic.mjs"];
  const ok = cli([...base, "--checkpoint", mkcp(true)]);
  const rc = JSON.parse(fs.readFileSync(receiptFiles(r, (f) => f.includes("__long__PASS"))[0], "utf8"));
  ck("收據引用已完成的 checkpoint：PASS，記錄中斷 1 次、續跑 2 次與原始資料雜湊", ok.code === 0 && rc.checkpoint?.interrupts?.length === 1 && rc.checkpoint.resumes === 2 && /^[0-9a-f]{64}$/.test(rc.checkpoint.rawAggregateSha256), JSON.stringify(rc.checkpoint));
  const inc = cli([...base, "--checkpoint", mkcp(false)]);
  ck("checkpoint 未完成 ⇒ BLOCKED checkpoint_complete", inc.code === 2 && has(inc, "checkpoint_complete", "BLOCKED"), inc.out.slice(-300));
  const other = cli([...base, "--checkpoint", mkcp(true, "f".repeat(40))]);
  ck("checkpoint 屬於別的 SHA ⇒ BLOCKED（不同候選的結果不能掛到這張收據）", other.code === 2 && /checkpoint 屬於/.test(checkOf(other, "checkpoint_complete")?.detail || ""), other.out.slice(-300));
  const tam = mkcp(true); fs.appendFileSync(path.join(tam, "raw", "a"), "tampered");
  const t = cli([...base, "--checkpoint", tam]);
  ck("checkpoint 完成後原始資料被改 ⇒ FAIL checkpoint_complete（不只看 journal）", t.code === 1 && has(t, "checkpoint_complete", "FAIL") && /raw:a/.test(checkOf(t, "checkpoint_complete")?.detail || ""), t.out.slice(-300));
}

// ═══ 7. 審查修正：根目錄絕對 glob、工具以其他形式碰文件目錄、依賴 git 歷史、assert 當下重算結構 ═══
{
  const r = makeRepo(); const B = head(r.dir); checkout(r, B);
  write(path.join(r.dir, "src", "main.js"), 'export const all = import.meta.glob("/docs/**/*.md", { query: "?raw", eager: true });\n');
  write(path.join(r.dir, "tools", "check_dir.mjs"), 'import path from "node:path"; const d = path.join(process.cwd(), "docs"); process.exit(d ? 0 : 1);\n');
  write(path.join(r.dir, "tools", "check_hist.mjs"), 'import { spawnSync } from "node:child_process"; spawnSync("git", ["diff", "--name-only", "HEAD~1"]); process.exit(0);\n');
  git(r.dir, "add", "-A"); git(r.dir, "commit", "-q", "-m", "readers"); const B2 = head(r.dir);
  const common = ["run", "--repo", r.dir, "--target-sha", B2, "--receipts-dir", r.rdir, "--json"];
  cli([...common, "--gate", "prod", "--cmd", BUILD, "--record-bundle", "dist"]);
  cli([...common, "--gate", "dirgate", "--cmd", "node tools/check_dir.mjs"]);
  cli([...common, "--gate", "histgate", "--cmd", "node tools/check_hist.mjs"]);
  cli([...common, "--gate", "logic", "--cmd", "node tools/check_logic.mjs"]);
  const D = edit(r, "docs/deep/x.md", "x\n");
  const c = carry(r, B2, D, ["prod", "dirgate", "histgate", "logic"]); const cj = J(c);
  ck("src 用 Vite 根目錄絕對 glob（/docs/**/*.md?raw）匯入文件 ⇒ FAIL carry_docs_not_product_input", c.code === 1 && has(c, "carry_docs_not_product_input", "FAIL"), c.out.slice(-300));
  void cj;
  // 去掉產品讀取者，單獨看 gate 影響判斷
  checkout(r, B2); write(path.join(r.dir, "src", "main.js"), "export const x = 1;\n"); git(r.dir, "add", "-A"); git(r.dir, "commit", "-q", "-m", "no glob"); const B3 = head(r.dir);
  const common3 = ["run", "--repo", r.dir, "--target-sha", B3, "--receipts-dir", r.rdir, "--json"];
  for (const [g, cmd] of [["prod", BUILD], ["dirgate", "node tools/check_dir.mjs"], ["histgate", "node tools/check_hist.mjs"], ["logic", "node tools/check_logic.mjs"]]) cli([...common3, "--gate", g, "--cmd", cmd, ...(g === "prod" ? ["--record-bundle", "dist"] : [])]);
  const D3 = edit(r, "docs/deep/y.md", "y\n");
  const c3 = carry(r, B3, D3, ["prod", "dirgate", "histgate", "logic"]); const j3 = J(c3);
  const rd = (g) => j3?.requiresDirect?.find((x) => x.gate === g)?.reason || "";
  ck("工具用 path.join(…, \"docs\") 碰文件目錄（沒有字面檔名）⇒ 該 gate 必須直接重跑", c3.code === 0 && /存取文件目錄/.test(rd("dirgate")), JSON.stringify(j3?.requiresDirect));
  ck("工具依賴 git 歷史（git diff）⇒ 該 gate 必須直接重跑", /git 歷史/.test(rd("histgate")), JSON.stringify(j3?.requiresDirect));
  ck("不碰文件、不碰歷史的 gate（logic、prod）仍可沿用", j3?.carriedGates?.includes("logic") && j3?.carriedGates?.includes("prod"), JSON.stringify(j3?.carriedGates));
  // 偽造：拿 D3 的沿用收據改綁到一個不是只改文件的 commit（重算 digest 讓它看起來合法）
  checkout(r, B3); git(r.dir, "checkout", "-q", "-B", "forge"); const F = edit(r, "src/main.js", "export const x = 999;\n");
  const cf = receiptFiles(r, (f) => f.includes(D3.slice(0, 12)) && f.includes("__docs-carry__PASS"))[0];
  const forged = JSON.parse(fs.readFileSync(cf, "utf8")); forged.targetSha = F; forged.actualSha = F; forged.treeSha = git(r.dir, "rev-parse", `${F}^{tree}`).stdout.trim(); forged.digest = LIB.digestOf(forged);
  fs.writeFileSync(path.join(r.rdir, path.basename(cf).replace(D3.slice(0, 12), F.slice(0, 12))), JSON.stringify(forged));
  const af = assert(r, F, ["logic"]);
  ck("偽造的沿用收據（改綁到改了 src 的 commit、digest 重算）⇒ assert 當下重算結構 FAIL", af.code === 1 && af.out.includes("carry_structure_recheck"), af.out.slice(-400));
}

console.log(`\nRelease docs-carry（TD-62）：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log("失敗：" + fails.join("；"));
process.exit(fail ? 1 : 0);
