#!/usr/bin/env node
// ============================================================================
//  tools/check_installed_tree_lib.mjs — TD-67 整棵依賴樹比對（tools/lib/installedTree.mjs）的測試
//
//    node tools/check_installed_tree_lib.mjs
//
//  合成 lockfile＋node_modules（系統暫存區），注入平台（win32／linux glibc／linux musl／darwin），驗：
//  頂層與巢狀版本、缺少、optional、平台專屬（os／cpu／libc 與 "!x" 排除）、別台機器的平台套件、integrity（npm 隱藏 lockfile）、
//  lockfile 以外的頂層套件、link 條目、可攜摘要（Windows 與 Linux 相同）、preflight 接入（deps_full_tree）、收據環境比對、CI CLI 輸出格式。
//  最後對本機真實 node_modules 跑一次（唯讀）。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = await import(pathToFileURL(path.join(HERE, "lib", "installedTree.mjs")).href);
const LIB = await import(pathToFileURL(path.join(HERE, "lib", "releaseGate.mjs")).href);
let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 400) : ""}`); } };
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-itree-"));
process.on("exit", () => { if (path.resolve(BASE).startsWith(path.resolve(os.tmpdir())) && path.basename(BASE).startsWith("esmo-itree-")) { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { /* 暫存 */ } } });
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof s === "string" ? s : JSON.stringify(s)); };
const WIN = { platform: "win32", arch: "x64", libc: null }, GLIBC = { platform: "linux", arch: "x64", libc: "glibc" }, MUSL = { platform: "linux", arch: "x64", libc: "musl" }, MAC = { platform: "darwin", arch: "arm64", libc: null };
const LOCK = { name: "fx", lockfileVersion: 3, packages: {
  "": { name: "fx" },
  "node_modules/a": { version: "1.0.0", integrity: "sha512-A" },
  "node_modules/a/node_modules/b": { version: "2.0.0", integrity: "sha512-B" },
  "node_modules/@s/c": { version: "3.0.0", integrity: "sha512-C", dev: true },
  "node_modules/opt": { version: "1.0.0", integrity: "sha512-O", optional: true },
  "node_modules/@esb/win32-x64": { version: "0.1.0", integrity: "sha512-W", optional: true, os: ["win32"], cpu: ["x64"] },
  "node_modules/@esb/linux-x64": { version: "0.1.0", integrity: "sha512-L", optional: true, os: ["linux"], cpu: ["x64"] },
  "node_modules/@r/linux-x64-gnu": { version: "0.2.0", integrity: "sha512-G", optional: true, os: ["linux"], cpu: ["x64"], libc: ["glibc"] },
  "node_modules/@r/linux-x64-musl": { version: "0.2.0", integrity: "sha512-M", optional: true, os: ["linux"], cpu: ["x64"], libc: ["musl"] },
  "node_modules/fsevents": { version: "2.3.3", integrity: "sha512-F", optional: true, os: ["darwin"] },
  "node_modules/notwin": { version: "1.0.0", integrity: "sha512-N", optional: true, os: ["!win32"] },
  "node_modules/linked": { link: true, resolved: "packages/linked" },
} };
let seq = 0;
/** 依平台建一份「npm 會裝出來」的 node_modules。mut(root) 可再改。 */
function fixture(plat, { hidden = true, mut } = {}) {
  const root = path.join(BASE, `r${++seq}`); write(path.join(root, "package-lock.json"), LOCK);
  const hiddenPk = {};
  for (const [k, m] of Object.entries(LOCK.packages)) {
    if (!k.startsWith("node_modules/") || m.link) continue;
    if ((m.os || m.cpu || m.libc) && !T.appliesTo(m, plat)) continue;
    write(path.join(root, k, "package.json"), { name: k.split("node_modules/").pop(), version: m.version });
    hiddenPk[k] = { version: m.version, integrity: m.integrity };
  }
  if (hidden) write(path.join(root, "node_modules", ".package-lock.json"), { name: "fx", lockfileVersion: 3, packages: hiddenPk });
  if (mut) mut(root);
  return root;
}
const I = (root, plat) => T.inspectInstalledTree(root, { platform: plat });

// §1 合法狀態
let w = I(fixture(WIN), WIN), g = I(fixture(GLIBC), GLIBC), m = I(fixture(MUSL), MUSL), mac = I(fixture(MAC), MAC);
ck("Windows：npm 會裝的都在 ⇒ PASS；其他平台套件合法未裝", w.status === "PASS" && w.platformSkipped.length === 5 && w.platformSkipped.includes("node_modules/@esb/linux-x64"), JSON.stringify(w));
ck("Linux glibc ⇒ PASS（裝 linux-x64、gnu；不裝 musl）", g.status === "PASS" && g.platformSkipped.includes("node_modules/@r/linux-x64-musl") && !g.platformSkipped.includes("node_modules/@r/linux-x64-gnu"), JSON.stringify(g.platformSkipped));
ck("Linux musl ⇒ PASS（裝 musl、不裝 gnu）", m.status === "PASS" && m.platformSkipped.includes("node_modules/@r/linux-x64-gnu"));
ck("macOS ⇒ PASS（裝 fsevents）", mac.status === "PASS" && !mac.platformSkipped.includes("node_modules/fsevents"));
ck("\"!win32\" 排除：Windows 不裝 notwin、Linux 會裝", w.platformSkipped.includes("node_modules/notwin") && !g.platformSkipped.includes("node_modules/notwin"));
ck("巢狀依賴（a/node_modules/b）有被檢查", w.ok >= 4 && w.entries === 11);
ck("可攜摘要：Windows 與 Linux 的整棵樹相同 ⇒ portableTreeDigest 相同（平台合法差異不算損壞）", w.portableTreeDigest === g.portableTreeDigest && g.portableTreeDigest === m.portableTreeDigest);
ck("平台摘要：Windows 與 Linux 不同（installedTreeDigest 只做同平台比對）", w.installedTreeDigest !== g.installedTreeDigest);
ck("integrity 有比對（有 npm 隱藏 lockfile）", w.integrityChecked === true);
ck("沒有隱藏 lockfile ⇒ 仍 PASS，但標示 integrity 未比對", (() => { const x = I(fixture(WIN, { hidden: false }), WIN); return x.status === "PASS" && x.integrityChecked === false; })());
ck("link 條目視為 ok（不要求 node_modules 內有實體）", w.missing.every((x) => !x.includes("linked")));
ck("devDependencies（dev: true）照樣檢查", (() => { const x = I(fixture(WIN, { mut: (r) => fs.rmSync(path.join(r, "node_modules/@s/c"), { recursive: true }) }), WIN); return x.status === "FAIL" && x.missing.some((s) => s.includes("@s/c")); })());

// §2 不一致 ⇒ FAIL
const bad = (label, plat, mut, pick) => { const x = I(fixture(plat, { mut }), plat); ck(label, x.status === "FAIL" && pick(x), JSON.stringify({ s: x.status, r: x.reason })); };
bad("深層依賴版本不同（a/node_modules/b 2.0.1）⇒ FAIL mismatched", WIN, (r) => write(path.join(r, "node_modules/a/node_modules/b/package.json"), { name: "b", version: "2.0.1" }), (x) => x.mismatched.some((s) => s.includes("a/node_modules/b")));
bad("深層依賴缺少 ⇒ FAIL missing", WIN, (r) => fs.rmSync(path.join(r, "node_modules/a/node_modules/b"), { recursive: true }), (x) => x.missing.length === 1);
bad("一般 optional（沒有平台限制）沒裝 ⇒ FAIL（保守：可能是安裝失敗）", WIN, (r) => fs.rmSync(path.join(r, "node_modules/opt"), { recursive: true }), (x) => x.optionalMissing.length === 1);
bad("符合目前平台的平台套件沒裝（Windows 少了 win32-x64）⇒ FAIL", WIN, (r) => fs.rmSync(path.join(r, "node_modules/@esb/win32-x64"), { recursive: true }), (x) => x.optionalMissing.some((s) => s.includes("win32-x64")));
bad("Linux 少了 glibc 版 ⇒ FAIL", GLIBC, (r) => fs.rmSync(path.join(r, "node_modules/@r/linux-x64-gnu"), { recursive: true }), (x) => x.optionalMissing.length === 1);
bad("別台機器的平台套件出現在 Windows（從 Linux 複製的 node_modules）⇒ FAIL foreignPlatform", WIN, (r) => write(path.join(r, "node_modules/@esb/linux-x64/package.json"), { name: "x", version: "0.1.0" }), (x) => x.foreignPlatform.length === 1);
bad("隱藏 lockfile 的 integrity 不同（同版本、不同內容）⇒ FAIL integrityMismatch", WIN, (r) => { const p = path.join(r, "node_modules/.package-lock.json"); const j = JSON.parse(fs.readFileSync(p, "utf8")); j.packages["node_modules/a"].integrity = "sha512-EVIL"; write(p, j); }, (x) => x.integrityMismatch.length === 1);
bad("隱藏 lockfile 少了已安裝的條目 ⇒ FAIL", WIN, (r) => { const p = path.join(r, "node_modules/.package-lock.json"); const j = JSON.parse(fs.readFileSync(p, "utf8")); delete j.packages["node_modules/a"]; write(p, j); }, (x) => x.integrityMismatch.length === 1);
bad("lockfile 以外的頂層套件（共用 junction 混到別的分支）⇒ FAIL extraTopLevel", WIN, (r) => write(path.join(r, "node_modules/gsap/package.json"), { name: "gsap", version: "3.0.0" }), (x) => x.extraTopLevel.includes("gsap"));
bad("lockfile 以外的 scope 套件 ⇒ FAIL", WIN, (r) => write(path.join(r, "node_modules/@s/zz/package.json"), { name: "@s/zz", version: "1.0.0" }), (x) => x.extraTopLevel.includes("@s/zz"));
ck("版本不同 ⇒ 可攜摘要也會改變", (() => { const x = I(fixture(GLIBC, { mut: (r) => write(path.join(r, "node_modules/a/package.json"), { name: "a", version: "1.0.1" }) }), GLIBC); return x.portableTreeDigest !== g.portableTreeDigest; })());
// §3 BLOCKED
ck("沒有 package-lock.json ⇒ BLOCKED", (() => { const r = path.join(BASE, "nolock"); fs.mkdirSync(path.join(r, "node_modules"), { recursive: true }); return I(r, WIN).status === "BLOCKED"; })());
ck("lockfile v1（沒有 packages）⇒ BLOCKED", (() => { const r = path.join(BASE, "v1"); write(path.join(r, "package-lock.json"), { lockfileVersion: 1, dependencies: {} }); fs.mkdirSync(path.join(r, "node_modules"), { recursive: true }); return I(r, WIN).status === "BLOCKED"; })());
ck("沒有 node_modules ⇒ BLOCKED", (() => { const r = path.join(BASE, "nonm"); write(path.join(r, "package-lock.json"), LOCK); return I(r, WIN).status === "BLOCKED"; })());
ck("appliesTo：libc 限制在非 Linux 一律不適用；Linux libc 不明 ⇒ 不適用（不會被當成「該裝沒裝」）", !T.appliesTo({ libc: ["glibc"] }, WIN) && !T.appliesTo({ os: ["linux"], libc: ["glibc"] }, { platform: "linux", arch: "x64", libc: null }));
// §4 CI CLI（輸出格式不變：deploy.yml 與既有說明依賴這兩行）
{
  const root = fixture(process.platform === "win32" ? WIN : T.currentPlatform());
  const r = spawnSync(process.execPath, [path.join(HERE, "ci", "check_installed_tree.mjs"), "--root", root], { encoding: "utf8" });
  ck("CI CLI：PASS exit 0，印出 installedTreeDigest=、portableTreeDigest=、INSTALLED_TREE RESULT=PASS", r.status === 0 && /installedTreeDigest=[0-9a-f]{64}/.test(r.stdout) && /portableTreeDigest=[0-9a-f]{64}/.test(r.stdout) && /INSTALLED_TREE RESULT=PASS/.test(r.stdout), r.stdout + r.stderr);
  write(path.join(root, "node_modules/a/package.json"), { name: "a", version: "9.9.9" });
  const r2 = spawnSync(process.execPath, [path.join(HERE, "ci", "check_installed_tree.mjs"), "--root", root], { encoding: "utf8" });
  ck("CI CLI：版本不同 ⇒ exit 1、RESULT=FAIL", r2.status === 1 && /INSTALLED_TREE RESULT=FAIL/.test(r2.stdout));
}
// §5 preflight 接入與收據相容
{
  const git = (cwd, ...a) => spawnSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd, encoding: "utf8" });
  const repo = path.join(BASE, "repo"); fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  write(path.join(repo, ".gitignore"), "node_modules/\n");
  write(path.join(repo, "package.json"), { name: "fx", scripts: { build: "vite build" }, devDependencies: { vite: "^5.0.0" } });
  write(path.join(repo, "package-lock.json"), { name: "fx", lockfileVersion: 3, packages: { "": { name: "fx" }, "node_modules/vite": { version: "5.4.0" }, "node_modules/vite/node_modules/deep": { version: "1.0.0" } } });
  write(path.join(repo, "index.html"), "<!doctype html>\n"); write(path.join(repo, "vite.config.js"), "export default {};\n");
  git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "x");
  write(path.join(repo, "node_modules/vite/package.json"), { name: "vite", version: "5.4.0" }); write(path.join(repo, "node_modules/vite/bin/vite.js"), 'console.log("vite/5.4.0");\n');
  write(path.join(repo, "node_modules/vite/node_modules/deep/package.json"), { name: "deep", version: "1.0.0" });
  const sha = git(repo, "rev-parse", "HEAD").stdout.trim(); const rd = path.join(BASE, "rcpt");
  let p = LIB.preflight({ repo, target: sha, receiptsDir: rd });
  const chk = (id) => p.checks.find((c) => c.id === id);
  ck("preflight：整棵樹一致 ⇒ deps_full_tree PASS，env 記錄 installedTree 摘要與 npm", chk("deps_full_tree")?.status === "PASS" && !!p.ctx.env.installedTree?.digest && "bundled" in (p.ctx.env.npm || {}), JSON.stringify(chk("deps_full_tree")));
  write(path.join(repo, "node_modules/vite/node_modules/deep/package.json"), { name: "deep", version: "1.0.1" });
  p = LIB.preflight({ repo, target: sha, receiptsDir: rd });
  ck("preflight：只有深層依賴不同（頂層都對）⇒ deps_full_tree BLOCKED、整體 BLOCKED（頂層檢查看不到的差異）", chk("deps_match_lockfile")?.status === "PASS" && chk("deps_full_tree")?.status === "BLOCKED" && p.status === "BLOCKED", JSON.stringify(p.checks.filter((c) => c.status !== "PASS")));
  const cli = spawnSync(process.execPath, [path.join(HERE, "release_gate.mjs"), "run", "--repo", repo, "--target-sha", sha, "--receipts-dir", rd, "--gate", "x", "--cmd", "node -e 0"], { encoding: "utf8" });
  ck("run：深層依賴不同 ⇒ BLOCKED exit 2，指令不執行", cli.status === 2 && /deps_full_tree/.test(cli.stdout), cli.stdout.slice(-300));
}
// §6 本機真實 node_modules（唯讀）
{
  const real = T.inspectInstalledTree(path.resolve(HERE, ".."));
  ck(`本機真實依賴樹（${real.platform.platform}/${real.platform.arch}）：${real.entries} 條目 ⇒ ${real.status}`, real.status === "PASS", real.reason);
}

console.log(`\nInstalled tree（TD-67 整棵依賴樹）：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log("失敗：" + fails.join("；"));
process.exit(fail ? 1 : 0);
