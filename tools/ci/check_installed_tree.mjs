#!/usr/bin/env node
// ============================================================================
//  tools/ci/check_installed_tree.mjs — 安裝好的「整棵」依賴樹是否與 package-lock.json 逐一相同
//
//    node tools/ci/check_installed_tree.mjs [--root <含 package-lock.json 與 node_modules 的資料夾>] [--json]
//
//  Release Gate 的 deps_match_lockfile 只看 package.json 的頂層依賴；這支逐一比對 lockfile v2/v3 的
//  每一個 packages["node_modules/…"] 條目（含巢狀）。平台專屬的 optional 依賴（例如 @esbuild/linux-x64
//  在 Windows 上不會安裝）缺少時只列為 optional-missing，不算失敗。
//  輸出 installedTreeDigest：CI 可以印出來，跟本機比對「兩邊裝到的是不是同一棵樹」。
//  exit：0 一致｜1 有不符（缺少非 optional、版本不同）｜2 無法判斷（沒有 lockfile／node_modules）
//  只用 Node 內建模組；唯讀，不安裝、不修改任何檔案。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const rootArg = argv.indexOf("--root") >= 0 ? argv[argv.indexOf("--root") + 1] : process.cwd();
const root = path.resolve(rootArg); const json = argv.includes("--json");
const out = { root, lockfileVersion: null, entries: 0, ok: 0, mismatched: [], missing: [], optionalMissing: [], extraTopLevel: [], installedTreeDigest: null, status: null };
const finish = (status) => { out.status = status; if (json) console.log(JSON.stringify(out, null, 1)); else { console.log(`lockfile v${out.lockfileVersion}：${out.entries} 條目，${out.ok} 相同；版本不同 ${out.mismatched.length}、缺少 ${out.missing.length}、平台 optional 未裝 ${out.optionalMissing.length}、lock 以外的頂層套件 ${out.extraTopLevel.length}`); for (const x of [...out.mismatched, ...out.missing].slice(0, 20)) console.log("  " + x); if (out.extraTopLevel.length) console.log("  lock 以外：" + out.extraTopLevel.slice(0, 20).join("、")); console.log(`installedTreeDigest=${out.installedTreeDigest}`); console.log(`INSTALLED_TREE RESULT=${status}`); } process.exit({ PASS: 0, FAIL: 1, BLOCKED: 2 }[status]); };

let lock; try { lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")); } catch { finish("BLOCKED"); }
out.lockfileVersion = lock.lockfileVersion;
if (!lock.packages) finish("BLOCKED");
let nm; try { nm = fs.realpathSync(path.join(root, "node_modules")); } catch { finish("BLOCKED"); }
const rows = [];
for (const [key, meta] of Object.entries(lock.packages)) {
  if (!key.startsWith("node_modules/")) continue;
  out.entries++;
  const dir = path.join(nm, key.slice("node_modules/".length));
  let v = null; try { v = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version; } catch { /* 缺 */ }
  if (meta.link) { out.ok++; continue; }
  if (v === null) { (meta.optional || meta.devOptional && meta.optional ? out.optionalMissing : out.missing).push(`${key}（lock ${meta.version}）`); continue; }
  if (v !== meta.version) { out.mismatched.push(`${key}：安裝 ${v} ≠ lock ${meta.version}`); continue; }
  out.ok++; rows.push(`${key}@${v}`);
}
const lockTop = new Set(Object.keys(lock.packages).filter((k) => /^node_modules\/(@[^/]+\/)?[^/]+$/.test(k)).map((k) => k.slice(13)));
for (const e of fs.readdirSync(nm)) {
  if (e.startsWith(".")) continue;
  if (e.startsWith("@")) { for (const s of fs.readdirSync(path.join(nm, e))) if (!lockTop.has(`${e}/${s}`)) out.extraTopLevel.push(`${e}/${s}`); }
  else if (!lockTop.has(e)) out.extraTopLevel.push(e);
}
out.installedTreeDigest = crypto.createHash("sha256").update(rows.sort().join("\n")).digest("hex");
finish(out.mismatched.length || out.missing.length ? "FAIL" : "PASS");
