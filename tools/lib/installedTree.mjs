// ============================================================================
//  tools/lib/installedTree.mjs — 安裝好的「整棵」依賴樹 vs package-lock.json（TD-67，2026-11-26 S1.1）
//
//  唯一的依賴樹比對實作：CI（tools/ci/check_installed_tree.mjs）與 Release Gate preflight 共用這一份，
//  不另寫第二套解析器。只讀 lockfile v2/v3 的 packages["node_modules/…"]（含巢狀）與各套件自己的 package.json，
//  不解析 semver、不重算依賴關係：npm 已經把解析結果寫進 lockfile，這裡只確認「裝到的就是 lockfile 寫的」。
//
//  每個 lockfile 條目分類：
//    ok                 已安裝且版本相同（link 條目視為 ok）
//    mismatched         已安裝但版本不同                                        ⇒ FAIL
//    missing            沒裝，而且不是 optional                                 ⇒ FAIL
//    optionalMissing    沒裝、optional、而且 os/cpu/libc 符合目前平台（npm 應該會裝）⇒ FAIL（保守：可能是安裝失敗）
//    platformSkipped    沒裝、optional、os/cpu/libc 不符合目前平台               ⇒ 合法（Windows 不裝 @esbuild/linux-x64）
//    foreignPlatform    已安裝，但 os/cpu/libc 不符合目前平台（從別台機器複製來的 node_modules？）⇒ FAIL
//    integrityMismatch  npm 的隱藏 lockfile（node_modules/.package-lock.json）記錄的 integrity／版本與 lockfile 不同 ⇒ FAIL
//  另外：node_modules 頂層有 lockfile 沒有的套件（extraTopLevel）⇒ FAIL（共用 junction 混到別的分支的依賴）。
//  peer：lockfile 有寫的 peer 條目就照一般條目檢查；--legacy-peer-deps 產生的 lockfile 本來就不含未安裝的 peer，
//        所以不會因為 legacy-peer-deps 而誤判。
//
//  摘要（不含任何秘密，只有套件名稱、版本、integrity）：
//    installedTreeDigest  實際裝到的全部條目（含平台專屬套件）⇒ 同平台才可比
//    portableTreeDigest   只算「沒有 os/cpu/libc 限制」的條目（名稱＋版本＋integrity）⇒ Windows 與 Linux 可以直接比對
//  只用 Node 內建模組；唯讀，不安裝、不修改任何檔案。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const INSTALLED_TREE_SCHEMA = "esmo.installed-tree/1";
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** 目前平台（npm 判斷 optional 平台套件用的三個維度）。libc 只在 Linux 有意義。 */
export function currentPlatform() {
  let libc = null;
  if (process.platform === "linux") {
    try { const h = process.report?.getReport?.().header; libc = h?.glibcVersionRuntime ? "glibc" : "musl"; } catch { libc = null; }
  }
  return { platform: process.platform, arch: process.arch, libc };
}

/** npm 的 os／cpu／libc 欄位語意：陣列；"!x" 表示排除；空或沒寫表示不限。 */
function fieldAllows(list, value) {
  if (!list || (Array.isArray(list) && !list.length)) return true;
  const arr = Array.isArray(list) ? list : [list];
  const neg = arr.filter((x) => String(x).startsWith("!")).map((x) => String(x).slice(1));
  const pos = arr.filter((x) => !String(x).startsWith("!"));
  if (neg.includes(value)) return false;
  return pos.length ? pos.includes(value) : true;
}
export function isPlatformSpecific(meta) { return !!(meta && (meta.os || meta.cpu || meta.libc)); }
/** 這個 lockfile 條目在 plat 上會不會被 npm 安裝。 */
export function appliesTo(meta, plat) {
  if (!fieldAllows(meta.os, plat.platform)) return false;
  if (!fieldAllows(meta.cpu, plat.arch)) return false;
  if (meta.libc && plat.platform === "linux") return plat.libc ? fieldAllows(meta.libc, plat.libc) : false; // libc 不明 ⇒ 視為不適用（不會被當成「該裝沒裝」）
  if (meta.libc && plat.platform !== "linux") return false; // npm：libc 限制只會在 Linux 上安裝
  return true;
}

/**
 * 檢查 root（含 package-lock.json）底下的 node_modules（可以是 junction）。
 * opts: { nodeModulesDir, platform: currentPlatform() 形狀（測試可注入）}
 * 回傳 { schema, status: PASS|FAIL|BLOCKED, reason, lockfileVersion, platform, entries, ok, mismatched[], missing[], optionalMissing[],
 *        platformSkipped[], foreignPlatform[], integrityMismatch[], integrityChecked, extraTopLevel[], installedTreeDigest, portableTreeDigest }
 */
export function inspectInstalledTree(root, opts = {}) {
  const plat = opts.platform || currentPlatform();
  const out = { schema: INSTALLED_TREE_SCHEMA, status: null, reason: "", lockfileVersion: null, platform: plat, entries: 0, ok: 0,
    mismatched: [], missing: [], optionalMissing: [], platformSkipped: [], foreignPlatform: [], integrityMismatch: [], integrityChecked: false,
    extraTopLevel: [], installedTreeDigest: null, portableTreeDigest: null };
  const done = (status, reason = "") => { out.status = status; out.reason = reason; return out; };
  const lock = readJson(path.join(root, "package-lock.json"));
  if (!lock) return done("BLOCKED", "沒有可讀的 package-lock.json");
  out.lockfileVersion = lock.lockfileVersion ?? null;
  if (!lock.packages) return done("BLOCKED", `lockfile v${out.lockfileVersion} 沒有 packages 欄位（需要 lockfile v2/v3）`);
  let nm; try { nm = fs.realpathSync(opts.nodeModulesDir || path.join(root, "node_modules")); } catch { return done("BLOCKED", "node_modules 不存在或是失效的連結"); }
  let hidden = readJson(path.join(nm, ".package-lock.json"));
  if (hidden && !hidden.packages) hidden = null;
  out.integrityChecked = !!hidden;

  const installedRows = [], portableRows = [];
  for (const [key, meta] of Object.entries(lock.packages)) {
    if (!key.startsWith("node_modules/")) continue;
    out.entries++;
    if (meta.link) { out.ok++; continue; }
    const rel = key.slice("node_modules/".length);
    const pj = readJson(path.join(nm, rel, "package.json"));
    const v = pj?.version ?? null;
    const specific = isPlatformSpecific(meta), applies = appliesTo(meta, plat);
    if (v === null) {
      if (!meta.optional) out.missing.push(`${key}（lock ${meta.version}）`);
      else if (specific && !applies) out.platformSkipped.push(key);
      else out.optionalMissing.push(`${key}（lock ${meta.version}，optional，但符合目前平台 ${plat.platform}/${plat.arch}${plat.libc ? "/" + plat.libc : ""}）`);
      if (!specific) portableRows.push(`${key}@${meta.version}#${meta.integrity ?? ""}`); // 讓缺少也反映在可攜摘要上
      continue;
    }
    if (specific && !applies) { out.foreignPlatform.push(`${key}@${v}（限 ${JSON.stringify({ os: meta.os, cpu: meta.cpu, libc: meta.libc })}）`); continue; }
    if (v !== meta.version) { out.mismatched.push(`${key}：安裝 ${v} ≠ lock ${meta.version}`); continue; }
    if (hidden) {
      const h = hidden.packages[key];
      if (!h) out.integrityMismatch.push(`${key}：npm 隱藏 lockfile 沒有這個條目（node_modules 不是由這份 lockfile 安裝？）`);
      else if (h.version !== meta.version || (meta.integrity && h.integrity && h.integrity !== meta.integrity)) out.integrityMismatch.push(`${key}：隱藏 lockfile ${h.version} ${String(h.integrity).slice(0, 20)} ≠ lock ${meta.version} ${String(meta.integrity).slice(0, 20)}`);
    }
    out.ok++;
    installedRows.push(`${key}@${v}#${meta.integrity ?? ""}`);
    if (!specific) portableRows.push(`${key}@${v}#${meta.integrity ?? ""}`);
  }
  const lockTop = new Set(Object.keys(lock.packages).filter((k) => /^node_modules\/(@[^/]+\/)?[^/]+$/.test(k)).map((k) => k.slice(13)));
  let top = []; try { top = fs.readdirSync(nm); } catch { /* 下面 */ }
  for (const e of top) {
    if (e.startsWith(".")) continue;
    if (e.startsWith("@")) { let subs = []; try { subs = fs.readdirSync(path.join(nm, e)); } catch { /* */ } for (const s of subs) if (!lockTop.has(`${e}/${s}`)) out.extraTopLevel.push(`${e}/${s}`); }
    else if (!lockTop.has(e)) out.extraTopLevel.push(e);
  }
  out.installedTreeDigest = sha256(installedRows.sort().join("\n"));
  out.portableTreeDigest = sha256(portableRows.sort().join("\n"));
  const bad = [["版本不同", out.mismatched], ["缺少", out.missing], ["符合平台卻未安裝的 optional", out.optionalMissing], ["不屬於此平台卻已安裝", out.foreignPlatform], ["integrity 不符", out.integrityMismatch], ["lockfile 以外的頂層套件", out.extraTopLevel]].filter(([, l]) => l.length);
  return bad.length ? done("FAIL", bad.map(([n, l]) => `${n} ${l.length}（${l.slice(0, 2).join("；")}）`).join("｜")) : done("PASS");
}

/** 收據用的精簡摘要（不放清單細節）。 */
export function treeSummary(t) {
  if (!t) return null;
  return { schema: t.schema, status: t.status, lockfileVersion: t.lockfileVersion, platform: t.platform, entries: t.entries, ok: t.ok,
    platformSkipped: t.platformSkipped.length, integrityChecked: t.integrityChecked, digest: t.installedTreeDigest, portableDigest: t.portableTreeDigest };
}
