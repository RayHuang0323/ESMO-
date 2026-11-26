#!/usr/bin/env node
// ============================================================================
//  tools/ci/check_installed_tree.mjs — 安裝好的「整棵」依賴樹是否與 package-lock.json 逐一相同
//
//    node tools/ci/check_installed_tree.mjs [--root <含 package-lock.json 與 node_modules 的資料夾>] [--json]
//
//  比對邏輯在 tools/lib/installedTree.mjs（Release Gate preflight 共用同一份，TD-67）。
//  平台專屬的 optional 依賴（例如 Windows 上的 @esbuild/linux-x64）依 os/cpu/libc 判斷：不屬於目前平台而沒裝＝合法；
//  屬於目前平台卻沒裝、版本不同、integrity 不符、lockfile 以外的頂層套件＝失敗。
//  輸出 installedTreeDigest（同平台可比）與 portableTreeDigest（Windows 與 Linux 可直接比對）。
//  exit：0 一致｜1 有不符｜2 無法判斷（沒有 lockfile／node_modules）。唯讀，不安裝、不修改任何檔案。
// ============================================================================
import path from "node:path";
import { spawnSync } from "node:child_process";
import { inspectInstalledTree } from "../lib/installedTree.mjs";
import { bundledNpmVersion } from "../lib/releaseGate.mjs";
import { annotate } from "./annotate.mjs";

const argv = process.argv.slice(2);
const root = path.resolve(argv.indexOf("--root") >= 0 ? argv[argv.indexOf("--root") + 1] : process.cwd());
const t = inspectInstalledTree(root);
//  Final Integration（2026-11-26）：安裝「之後」package.json／package-lock.json 必須仍與 git 相同（npm ci 不應改 lockfile）。
//  不在 git 工作樹裡（例如測試用的暫存資料夾）⇒ 標成未檢查，不影響結果。
const gs = spawnSync("git", ["-C", root, "status", "--porcelain", "--", "package.json", "package-lock.json"], { encoding: "utf8", windowsHide: true });
const lockState = gs.status !== 0 ? "未檢查（不是 git 工作樹）" : gs.stdout.trim() ? "已被修改" : "與 git 相同";
if (lockState === "已被修改" && t.status === "PASS") { t.status = "FAIL"; t.reason = `安裝後 package.json／package-lock.json 與 git 不同：${gs.stdout.trim().replace(/\s+/g, " ")}`; }
annotate(t.status === "PASS" ? "INSTALLED_TREE" : "INSTALLED_TREE FAIL",
  `RESULT=${t.status} node=${process.version} npm=${bundledNpmVersion() ?? "?"} platform=${t.platform.platform}/${t.platform.arch}${t.platform.libc ? "/" + t.platform.libc : ""} entries=${t.entries} ok=${t.ok} platformSkipped=${t.platformSkipped.length} optionalMissing=${t.optionalMissing.length} foreignPlatform=${t.foreignPlatform.length} integrityChecked=${t.integrityChecked} integrityMismatch=${t.integrityMismatch.length} nestedChecked=${t.nestedChecked} nestedExtra=${t.nestedExtra.length} extraTopLevel=${t.extraTopLevel.length} lockfileAfterInstall=${lockState} portableTreeDigest=${t.portableTreeDigest} installedTreeDigest=${t.installedTreeDigest}${t.reason ? " reason=" + t.reason : ""}`,
  t.status === "PASS" ? "notice" : "error");
if (argv.includes("--json")) console.log(JSON.stringify({ root, ...t }, null, 1));
else {
  const p = t.platform;
  console.log(`平台 ${p.platform}/${p.arch}${p.libc ? "/" + p.libc : ""}｜lockfile v${t.lockfileVersion}：${t.entries} 條目，${t.ok} 相同；版本不同 ${t.mismatched.length}、缺少 ${t.missing.length}、` +
    `符合平台卻未裝的 optional ${t.optionalMissing.length}、其他平台專屬（合法未裝）${t.platformSkipped.length}、不屬於此平台卻已安裝 ${t.foreignPlatform.length}、` +
    `integrity 不符 ${t.integrityMismatch.length}${t.integrityChecked ? "" : "（沒有 npm 隱藏 lockfile，未比對 integrity）"}、lock 以外的頂層套件 ${t.extraTopLevel.length}、lock 以外的巢狀套件 ${t.nestedExtra.length}`);
  console.log(`安裝後 lockfile：${lockState}`);
  if (t.nestedExtra.length) console.log("  lock 以外（巢狀）：" + t.nestedExtra.slice(0, 20).join("、"));
  for (const x of [...t.mismatched, ...t.missing, ...t.optionalMissing, ...t.foreignPlatform, ...t.integrityMismatch].slice(0, 20)) console.log("  " + x);
  if (t.extraTopLevel.length) console.log("  lock 以外：" + t.extraTopLevel.slice(0, 20).join("、"));
  if (t.reason) console.log(`  原因：${t.reason}`);
  console.log(`installedTreeDigest=${t.installedTreeDigest}`);
  console.log(`portableTreeDigest=${t.portableTreeDigest}`);
  console.log(`INSTALLED_TREE RESULT=${t.status}`);
}
process.exitCode = { PASS: 0, FAIL: 1, BLOCKED: 2 }[t.status]; // 不用 process.exit：pipe 輸出在 Windows 上可能被吃掉最後幾行
