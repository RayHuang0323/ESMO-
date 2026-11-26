// ============================================================================
//  tools/lib/docsCarry.mjs — TD-62：純文件 Commit 的證據沿用（docs-carry）
//
//  問題：收據綁完整 SHA＋tree。已驗證的 B 之上只加一個文件 Commit D，D 就沒有任何收據，
//  只能重跑全部 Gate（數小時）或請 Owner 書面例外。
//
//  做法：不轉移、不修改、不重簽 B 的收據。另外產生一張「沿用收據」，綁在 D 上，
//  逐項證明 D 和 B 的差異只是「不影響任何驗證」的文件，並記錄它引用了 B 的哪幾張收據（digest）。
//  assert 驗 D 時，D 沒有直接收據的 gate 才會改看沿用收據，而且當下重新驗證被引用的 B 收據
//  （digest、效期、環境）——所以沿用永遠不會比原收據活得更久。
//
//  檢查（任一 FAIL ⇒ FAIL；任一 BLOCKED ⇒ BLOCKED；都沒有才 PASS）：
//    C1 B 是 D 的祖先、B..D 全是單一 parent 的一般 Commit
//    C2 B 的每個 gate 都有「直接」PASS 收據，且現在仍有效（digest／效期／環境）；沿用收據不能當來源
//    C3 git diff --raw B D：每列都是 100644 一般檔，路徑在白名單；mode 變更、symlink、submodule ⇒ FAIL
//    C4 白名單以外的 tree 逐項相同（與 C3 互相獨立的第二道計算）
//    C5 被讀取的文件不算文件：產品輸入（src／public／index.html／vite.config／package*）引用到 ⇒ FAIL；
//       工具引用到 ⇒ 找出會跑到那支工具的 gate，那些 gate 不能沿用（要在 D 上直接重跑）
//    C6 環境：目前 Node 主版本、平台、依賴摘要、lockfile blob 與 B 收據相同
//    C7 在 D 上用 B 記錄的建置環境重新 build，dist 雜湊必須等於 B 收據記錄的雜湊；B 沒記錄 ⇒ BLOCKED
//
//  ⚠ 跟 releaseGate.mjs 一樣只用 Node 內建模組，收據只有 SHA-256 摘要、沒有簽章。
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  git, sha256, canonical, aggregate, preflight, loadReceipts, verifyReceipt, digestOf, RECEIPT_SCHEMA, DEFAULT_MAX_AGE_HOURS,
  hashDir, viteEnvFingerprint, browserProbe, probeDeployment,
} from "./releaseGate.mjs";
import { classifyGate } from "./gatePolicy.mjs";

export const CARRY_SCHEMA = "esmo.release-gate.docs-carry/1";
export const CARRY_GATE = "docs-carry";
export const CARRY_VERSION = "1.0.0";
/** 只有這些路徑可能是「純文件」。預設拒絕：其他一律不是。 */
export const DOC_WHITELIST = [/^docs\/.+\.md$/, /^review\/.+\.md$/, /^AGENTS\.md$/, /^CLAUDE\.md$/, /^README[^/]*\.md$/];
export const isWhitelisted = (p) => DOC_WHITELIST.some((re) => re.test(p));
/** 被這些路徑引用到的文件會進 bundle 或影響建置 ⇒ 直接 FAIL。 */
const PRODUCT_INPUT = [/^src\//, /^public\//, /^index\.html$/, /^vite\.config\./, /^package(-lock)?\.json$/, /^\.github\//];
const isProductInput = (p) => PRODUCT_INPUT.some((re) => re.test(p));
const SCAN_MAX_BYTES = 4 * 1024 * 1024;
const mk = (id, status, detail = "") => ({ id, status, detail });

// ── git 小工具 ───────────────────────────────────────────────────────────
function revFull(repo, ref) { const r = git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]); return r.ok && /^[0-9a-f]{40}$/.test(r.out) ? r.out : null; }
function treeOf(repo, sha) { const r = git(repo, ["rev-parse", `${sha}^{tree}`]); return r.ok ? r.out : null; }
/** `git diff --raw -z --no-renames`：[{ oldMode, newMode, status, path }] */
export function rawDiff(repo, a, b) {
  const r = git(repo, ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", a, b]);
  if (!r.ok) return null;
  const parts = r.raw.split("\0"); const out = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const m = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])\d*$/.exec(parts[i]);
    if (!m) return null;
    out.push({ oldMode: m[1], newMode: m[2], oldBlob: m[3], newBlob: m[4], status: m[5], path: parts[i + 1] });
  }
  return out;
}
/** ls-tree -r 全部條目（含 mode 與型別），回傳 [{ mode, type, oid, path }] */
export function lsTree(repo, sha) {
  const r = git(repo, ["ls-tree", "-r", "-l", "-z", "--full-tree", sha]);
  if (!r.ok) return null;
  return r.raw.split("\0").filter(Boolean).map((e) => { const t = e.indexOf("\t"); const [mode, type, oid, size] = e.slice(0, t).trim().split(/\s+/); return { mode, type, oid, size: size === "-" ? 0 : Number(size), path: e.slice(t + 1) }; });
}
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|glb|gltf|bin|ktx2|hdr|exr|wav|mp3|ogg|m4a|mp4|webm|woff2?|ttf|otf|zip|gz|7z|pdf|psd|blend|fbx|obj)$/i;
/** 一次讀很多個 blob（git cat-file --batch），回傳 Map(oid → utf8 文字)。略過二進位（含 NUL）。 */
function readBlobs(repo, oids) {
  const out = new Map();
  for (let i = 0; i < oids.length; i += 400) {
    const chunk = oids.slice(i, i + 400);
    const r = spawnSync("git", ["--no-optional-locks", "cat-file", "--batch"], { cwd: repo, input: chunk.join("\n") + "\n", maxBuffer: 1 << 30 });
    if (r.status !== 0 || !r.stdout) throw new Error(`git cat-file --batch 失敗（exit ${r.status}）`);
    const buf = r.stdout; let pos = 0;
    while (pos < buf.length) {
      const nl = buf.indexOf(10, pos); if (nl < 0) break;
      const [oid, type, size] = buf.subarray(pos, nl).toString("utf8").split(" ");
      if (type === "missing" || size === undefined) { pos = nl + 1; continue; }
      const n = Number(size); const body = buf.subarray(nl + 1, nl + 1 + n); pos = nl + 1 + n + 1;
      if (!body.includes(0)) out.set(oid, body.toString("utf8"));
    }
  }
  return out;
}
const scannable = (e) => e.type === "blob" && e.size <= SCAN_MAX_BYTES && !BINARY_EXT.test(e.path) && !e.path.startsWith("node_modules/");
export function nonDocTreeDigest(entries) {
  return sha256(entries.filter((e) => !(isWhitelisted(e.path) && e.mode === "100644")).map((e) => `${e.mode} ${e.type} ${e.oid}\t${e.path}`).sort().join("\n"));
}

// ── C3：逐列檢查 diff ─────────────────────────────────────────────────────
export function classifyDiff(rows) {
  const bad = [];
  for (const r of rows) {
    const modesOk = (r.status === "M" && r.oldMode === "100644" && r.newMode === "100644")
      || (r.status === "A" && r.oldMode === "000000" && r.newMode === "100644")
      || (r.status === "D" && r.oldMode === "100644" && r.newMode === "000000");
    if (!modesOk) { bad.push(`${r.path}（${r.status} ${r.oldMode}→${r.newMode}：${r.newMode === "120000" || r.oldMode === "120000" ? "符號連結" : r.newMode === "160000" || r.oldMode === "160000" ? "submodule" : r.newMode === "100755" || r.oldMode === "100755" ? "執行權限位元" : "非一般文件變更"}）`); continue; }
    if (!isWhitelisted(r.path)) bad.push(`${r.path}（不在文件白名單）`);
  }
  return bad;
}

// ── C5：誰讀了這些文件 ─────────────────────────────────────────────────────
/** 會被 Vite 打包的原始碼（只看 bundler 讀檔語法）。.github、工具、package.json 仍用保守的全文比對。 */
const BUNDLED_SOURCE = /^(src\/.+\.(m?[jt]sx?|cjs|css|vue|svelte)|vite\.config\.[cm]?[jt]s|index\.html)$/;
/** 取出 bundler 會解析的路徑：import／export from／import()／import.meta.glob()／new URL()／<script src>／<link href>。 */
export function bundlerSpecifiers(text) {
  const out = [];
  const res = [
    /\bimport\s+(?:[\w*{}\s,$]+\s+from\s+)?["'`]([^"'`]+)["'`]/g, /\bexport\s+[\w*{}\s,$]+\s+from\s+["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]/g, /\bimport\.meta\.glob(?:Eager)?\s*\(\s*(\[[^\]]*\]|["'`][^"'`]+["'`])/g,
    /\bnew\s+URL\s*\(\s*["'`]([^"'`]+)["'`]/g, /\b(?:src|href)\s*=\s*["']([^"']+)["']/g,
  ];
  for (const re of res) for (const m of text.matchAll(re)) for (const s of String(m[1]).split(",")) out.push(s.replace(/^[\s\[]*["'`]|["'`][\s\]]*$/g, "").trim());
  return out.filter(Boolean);
}
/**
 * 一個 bundler 路徑會不會碰到變更的文件。fromDir＝引用它的檔案所在目錄（repo 相對）。
 * ⚠ 2026-11-26 審查修正：Vite 的 `/docs/**` 是相對專案根目錄；`?raw` 等 query 要去掉；樣板字串 `${x}` 與 glob 一律以
 *   「靜態前綴解析後落在哪裡」判斷——落在白名單文件目錄、repo 根目錄或往上跳出 repo，都保守視為會讀到文件。
 */
export function specTouchesDocs(spec, fromDir, changedPaths) {
  let s = String(spec).trim().replace(/[?#].*$/, "");
  if (/^(https?:|data:|node:|virtual:|\0)/.test(s)) return false;
  if (!/^[./]/.test(s)) return false;                                   // 套件名稱（react、three…）
  const resolve = (p) => (p.startsWith("/") ? path.posix.normalize(p.slice(1)) : path.posix.normalize(path.posix.join(fromDir || ".", p)));
  const dyn = s.search(/\$\{|[*{[]/);
  if (dyn < 0) { const r = resolve(s); return changedPaths.includes(r) || (!/\.[\w]+$/.test(r) && changedPaths.some((p) => p === `${r}.md` || p.startsWith(`${r}/`))); }
  const lastSeg = s.slice(s.lastIndexOf("/") + 1);
  if (/\.(?!md\b)[\w]+$/.test(lastSeg) && !/[{*$]/.test(lastSeg.slice(lastSeg.lastIndexOf(".")))) return false; // 動態但明確是 .js／.json 等非 md
  const prefix = s.slice(0, dyn); const dirPart = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/") + 1) : "";
  const base = resolve(dirPart || ".").replace(/\/+$/, "").replace(/^\.\/?$/, ".") || ".";
  if (base === "." || base.startsWith("..")) return true;                 // 從 repo 根目錄或更上層展開：保守
  return changedPaths.some((p) => p === base || p.startsWith(base.endsWith("/") ? base : `${base}/`));
}
const globMayMatch = (glob, p) => specTouchesDocs(glob, ".", [p]);
/** 回傳引用到任一變更文件的已追蹤檔（不含白名單文件本身）。比對完整路徑、檔名、以及所在目錄字串。 */
export function findReaders(repo, sha, changedPaths, entries) {
  const needles = new Set();
  for (const p of changedPaths) {
    needles.add(p); needles.add(p.replace(/\//g, "\\\\")); needles.add(path.posix.basename(p));
    const dir = path.posix.dirname(p); if (dir && dir !== "." && dir.split("/").length >= 2) needles.add(dir);
  }
  const list = [...needles].filter((n) => n.length >= 4);
  const readers = [];
  const cand = entries.filter((e) => scannable(e) && !(isWhitelisted(e.path) && e.mode === "100644"));
  const texts = readBlobs(repo, [...new Set(cand.map((e) => e.oid))]);
  for (const e of cand) {
    const text = texts.get(e.oid); if (text === undefined) continue;
    if (BUNDLED_SOURCE.test(e.path)) {
      // 產品原始碼：文件只會經由 import／import.meta.glob／new URL 進 bundle。註解或文案裡提到檔名不算讀取
      // （CLAUDE.md：「不得出現 X」類斷言要先問 X 會不會正當地出現在註解裡）。
      const specs = bundlerSpecifiers(text); const fromDir = path.posix.dirname(e.path);
      const hits = specs.filter((s) => list.some((n) => s.includes(n)) || specTouchesDocs(s, fromDir, changedPaths));
      if (hits.length) readers.push({ path: e.path, needles: hits.slice(0, 5) });
      continue;
    }
    const hits = list.filter((n) => text.includes(n));
    if (hits.length) readers.push({ path: e.path, needles: hits.slice(0, 5) });
  }
  return readers;
}

/** 由 gate 收據的指令字串找出起點腳本，沿著工具之間的靜態引用（檔名字串）找出會被跑到的工具集合。 */
export function reachableTools(repo, sha, commands, entries) {
  const toolFiles = entries.filter((e) => e.type === "blob" && /^(tools|scripts)\/.+\.(m?js|cjs)$/.test(e.path));
  const byBase = new Map(); for (const e of toolFiles) { const b = path.posix.basename(e.path); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(e); }
  const texts = readBlobs(repo, [...new Set(toolFiles.filter(scannable).map((e) => e.oid))]);
  const read = (e) => (e ? texts.get(e.oid) ?? "" : "");
  const seeds = new Set(); let unknown = false;
  // npm run <script> ⇒ 展開成 package.json 裡的指令（目標 SHA 的版本）；其他套件管理器一律保守處理
  const pkgEntry = entries.find((e) => e.path === "package.json");
  let scripts = {}; try { scripts = JSON.parse(readBlobs(repo, [pkgEntry.oid]).get(pkgEntry.oid)).scripts || {}; } catch { /* 沒有 scripts */ }
  const expand = (c, depth = 0) => String(c).replace(/\bnpm\s+(?:run(?:-script)?\s+)?([\w:.-]+)(?:\s+--)?/g, (m, s) => (depth < 3 && scripts[s] !== undefined ? expand(scripts[s], depth + 1) : `__UNKNOWN_NPM_${s}__`));
  for (const c0 of commands) {
    const c = expand(c0);
    if (/__UNKNOWN_NPM_|\bnpx\b|\byarn\b|\bpnpm\b|\.(?:sh|ps1|bat|cmd)\b|\bnode(?:\.exe)?"?\s+(?:-e|--eval|-p|--print)\b/.test(c)) unknown = true;
    for (const m of c.matchAll(/((?:[\w.\-]+[\\/])*)([\w.\-]+\.(?:m?js|cjs))\b/g)) {
      if (/(^|[\\/])node_modules[\\/]/.test(m[1])) continue;            // 依賴套件的 bin（例：vite）不會去跑 repo 的檢查工具
      const hits = byBase.get(m[2]) || [];
      if (!hits.length) unknown = true; else for (const h of hits) seeds.add(h.path);
    }
    // vite／vite build 會載入 vite.config.*：它引用到的工具也算跑得到
    if (/\bvite(\.js)?\b/.test(c)) for (const e of entries) if (/^vite\.config\./.test(e.path)) for (const m of (readBlobs(repo, [e.oid]).get(e.oid) || "").matchAll(/([\w.\-]+\.(?:m?js|cjs))\b/g)) for (const h of byBase.get(m[1]) || []) seeds.add(h.path);
  }
  const reach = new Set(seeds); const queue = [...seeds];
  const entryOf = new Map(toolFiles.map((e) => [e.path, e]));
  while (queue.length) {
    const p = queue.shift(); const t = read(entryOf.get(p));
    for (const m of t.matchAll(/([\w.\-]+\.(?:m?js|cjs))\b/g)) for (const e of byBase.get(m[1]) || []) if (!reach.has(e.path)) { reach.add(e.path); queue.push(e.path); }
  }
  return { reach, unknown, textOf: (p) => read(entryOf.get(p)) };
}

/** 工具依賴 git 歷史（diff／log／HEAD…）：文件 commit 會讓它的結果不同 ⇒ 不能沿用。 */
export const GIT_HISTORY_RE = /\bgit\b[^\n]{0,120}?\b(diff|log|show|rev-list|whatchanged|ls-files|status)\b|["'`](diff|log|show|rev-list|whatchanged|ls-files)["'`]|rev-parse[^\n]{0,40}HEAD|["'`]HEAD["'`]/;
/** 工具以任何形式碰到這些變更所在的目錄（"docs"、'docs/'、/^docs\//、path.join(ROOT,"docs")…）。 */
export function docAccessRegex(changedPaths) {
  const tops = new Set(changedPaths.map((p) => (p.includes("/") ? p.slice(0, p.indexOf("/")) : null)).filter(Boolean));
  const parts = [...tops].map((t) => `(^|[^\\w-])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[\\\\/"'\`]|\\\\\\/)`);
  if (changedPaths.some((p) => !p.includes("/"))) parts.push("\\.md\\b");                    // 根目錄 .md：保守看任何 .md 讀取
  return parts.length ? new RegExp(parts.join("|")) : null;
}

// ── C7：在目標上重新 build ─────────────────────────────────────────────────
function rebuild(repoTop, nodeModulesReal, baseBundle) {
  const viteJs = nodeModulesReal ? path.join(nodeModulesReal, "vite", "bin", "vite.js") : null;
  if (!viteJs || !fs.existsSync(viteJs)) return { status: "BLOCKED", detail: "找不到 node_modules/vite/bin/vite.js，無法在目標上重新 build" };
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("VITE_")) delete env[k];
  for (const [k, v] of Object.entries(baseBundle.buildEnv || {})) {
    if (v !== sha256("")) return { status: "BLOCKED", detail: `來源 build 時 ${k} 有非空值（只記了雜湊），無法重現同樣的 build` };
    env[k] = "";
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-carry-build-"));
  try {
    const r = spawnSync(process.execPath, [viteJs, "build", "--outDir", out, "--emptyOutDir"], { cwd: repoTop, env, encoding: "utf8", timeout: 20 * 60000, maxBuffer: 1 << 26 });
    if (r.status !== 0) return { status: "BLOCKED", detail: `目標 build 失敗 exit=${r.status}${r.error ? `（${r.error.code}）` : ""}：${String(r.stderr || r.stdout).slice(-200)}` };
    const h = hashDir(out);
    return { status: h.aggregateSha256 === baseBundle.aggregateSha256 && h.files === baseBundle.files ? "PASS" : "FAIL", hash: h };
  } finally {
    if (path.basename(out).startsWith("esmo-carry-build-") && path.resolve(out).startsWith(path.resolve(os.tmpdir()))) { try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* 留在暫存區 */ } }
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────
/**
 * opts: { repo, target(D), base(B), gates[], receiptsDir, maxAgeHours, now }
 * 回傳 { status, checks, ctx, receipt }（receipt 尚未寫檔）
 */
export function buildCarry(opts) {
  const startedAt = new Date().toISOString();
  const maxAgeHours = opts.maxAgeHours ?? null; const now = opts.now ?? Date.now();
  const probes = { currentBrowser: opts.currentBrowser || browserProbe(), deploymentProbe: opts.deploymentProbe || probeDeployment };
  const pre = preflight({ repo: opts.repo, target: opts.target, receiptsDir: opts.receiptsDir });
  const checks = [...pre.checks]; const ctx = pre.ctx;
  const info = { baseSha: null, baseTree: null, diff: [], readers: [], toolReaders: [], carriedGates: [], requiresDirect: [], base: [], bundle: null, nonDocDigest: null, commits: [] };
  const finish = () => {
    const status = aggregate(checks); const finishedAt = new Date().toISOString();
    const expiries = info.base.filter((b) => info.carriedGates.includes(b.gate)).map((b) => Date.parse(b.expiresAt));
    const receipt = {
      schema: CARRY_SCHEMA, kind: CARRY_GATE, carryVersion: CARRY_VERSION, gate: CARRY_GATE, status,
      targetSha: ctx.targetFull, actualSha: ctx.actualSha, treeSha: ctx.treeSha, repo: ctx.repoTop,
      baseSha: info.baseSha, baseTree: info.baseTree, commits: info.commits, diff: info.diff, nonDocTreeDigest: info.nonDocDigest,
      readers: info.readers, toolReaders: info.toolReaders, carriedGates: info.carriedGates, requiresDirect: info.requiresDirect,
      base: info.base, bundle: info.bundle, env: ctx.env, maxAgeHours,
      expiresAt: expiries.length ? new Date(Math.min(...expiries)).toISOString() : null,
      startedAt, finishedAt, checks, whitelist: DOC_WHITELIST.map(String),
    };
    receipt.digest = digestOf(receipt);
    return { status, checks, ctx, receipt };
  };
  if (pre.status !== "PASS") return finish();
  const repo = ctx.repoTop, D = ctx.targetFull;

  // C1
  const B = revFull(repo, String(opts.base || "").trim().toLowerCase());
  if (!B || !/^[0-9a-f]{7,40}$/.test(String(opts.base || "").trim())) { checks.push(mk("carry_base_sha", "FAIL", `--base-sha「${opts.base}」不是這個 repo 的 commit SHA`)); return finish(); }
  info.baseSha = B; info.baseTree = treeOf(repo, B);
  if (B === D) { checks.push(mk("carry_base_sha", "FAIL", "來源與目標是同一個 commit：直接用原收據即可，不需要沿用")); return finish(); }
  const anc = git(repo, ["merge-base", "--is-ancestor", B, D]);
  if (anc.status !== 0) { checks.push(mk("carry_ancestry", "FAIL", `${B.slice(0, 12)} 不是 ${D.slice(0, 12)} 的祖先`)); return finish(); }
  const rl = git(repo, ["rev-list", "--parents", `${B}..${D}`]);
  const commits = rl.out.split("\n").filter(Boolean).map((l) => l.split(" "));
  info.commits = commits.map((c) => c[0]);
  const merges = commits.filter((c) => c.length !== 2);
  checks.push(merges.length ? mk("carry_linear_history", "FAIL", `B..D 內有 merge／多 parent commit：${merges.map((c) => c[0].slice(0, 12)).join("、")}`) : mk("carry_linear_history", "PASS", `${commits.length} 個一般 commit`));

  // C3
  const rows = rawDiff(repo, B, D);
  if (!rows) { checks.push(mk("carry_diff_docs_only", "BLOCKED", "git diff --raw 讀不懂")); return finish(); }
  info.diff = rows.map((r) => ({ status: r.status, mode: r.newMode === "000000" ? r.oldMode : r.newMode, path: r.path, oldBlob: r.oldBlob, newBlob: r.newBlob }));
  const bad = classifyDiff(rows);
  checks.push(bad.length ? mk("carry_diff_docs_only", "FAIL", `${bad.length} 列不是白名單內的一般文件：${bad.slice(0, 4).join("；")}`) : mk("carry_diff_docs_only", "PASS", `${rows.length} 個文件變更`));
  if (!rows.length) checks.push(mk("carry_diff_nonempty", "FAIL", "B 與 D 的內容完全相同（tree 相同卻不同 commit），不需要也不允許沿用"));

  // C4
  const eB = lsTree(repo, B), eD = lsTree(repo, D);
  if (!eB || !eD) { checks.push(mk("carry_nondoc_tree_identical", "BLOCKED", "ls-tree 失敗")); return finish(); }
  const dB = nonDocTreeDigest(eB), dD = nonDocTreeDigest(eD); info.nonDocDigest = dD;
  checks.push(dB === dD ? mk("carry_nondoc_tree_identical", "PASS", dD.slice(0, 16)) : mk("carry_nondoc_tree_identical", "FAIL", "白名單以外的檔案（產品、依賴、工具、CI、權限位元）與來源不同"));
  if (bad.length || dB !== dD) return finish();

  // C5
  const changed = rows.map((r) => r.path);
  info.readers = findReaders(repo, D, changed, eD);
  const productReaders = info.readers.filter((r) => isProductInput(r.path));
  info.toolReaders = info.readers.filter((r) => !isProductInput(r.path)).map((r) => r.path);
  checks.push(productReaders.length ? mk("carry_docs_not_product_input", "FAIL", `產品／建置輸入引用了變更的文件：${productReaders.map((r) => r.path).slice(0, 4).join("、")}`) : mk("carry_docs_not_product_input", "PASS"));

  // C2 + 決定哪些 gate 可以沿用
  const gates = [...new Set(opts.gates || [])];
  if (!gates.length) checks.push(mk("carry_gates_specified", "FAIL", "至少要指定一個 --require-gate（要沿用哪幾張收據）"));
  const baseCtx = { targetFull: B, treeSha: info.baseTree, env: ctx.env, repoTop: repo };
  let bundles = [];
  for (const g of gates) {
    if (g === CARRY_GATE) { checks.push(mk(`carry_base:${g}`, "FAIL", "沿用收據本身不能被沿用")); continue; }
    const found = loadReceipts(ctx.receiptsDir, { targetSha: B, gate: g }).filter((f) => f.receipt.schema === RECEIPT_SCHEMA);
    if (!found.length) { checks.push(mk(`carry_base:${g}`, "BLOCKED", `來源 ${B.slice(0, 12)} 沒有 gate「${g}」的直接收據（沿用收據不能當來源，不能連鎖沿用）`)); continue; }
    const rc = found[0].receipt;
    // TD-64：綁定部署的 gate（正式站 smoke）只代表當下那一版正式站，一律不沿用
    let det = null; try { det = detectTightening(repo, B, (rc.commands || []).map((c) => c.cmd)).class; } catch { det = null; }
    const cls = classifyGate(g, (rc.commands || []).map((c) => c.cmd), { detected: det || rc.policy?.class || null });
    if (cls.neverCarry) { info.requiresDirect.push({ gate: g, reason: `${cls.label}綁定正式站部署，不能沿用（要在目標上直接重跑）` }); checks.push(mk(`carry_base:${g}`, "PASS", "不沿用（綁定部署）")); continue; }
    const v = verifyReceipt(rc, baseCtx, { maxAgeHours, now, ...probes });
    const failed = v.checks.filter((c) => c.status !== "PASS");
    if (failed.length) {
      const tampered = failed.some((c) => c.id === "receipt_digest");
      checks.push(mk(`carry_base:${g}`, tampered ? "FAIL" : "BLOCKED", failed.map((c) => `${c.id}: ${c.detail}`).join("｜")));
      continue;
    }
    const fin = Date.parse(rc.finishedAt);
    // 沿用不延長效期：到期時間＝來源收據自己依分類表算出的到期時間（舊收據 24h）
    info.base.push({ gate: g, file: path.basename(found[0].file), digest: rc.digest, finishedAt: rc.finishedAt, expiresAt: v.policy.expiresAt, tier: v.policy.tier, commands: (rc.commands || []).map((c) => c.cmd) });
    if (rc.bundle) bundles.push({ gate: g, ...rc.bundle });
    checks.push(mk(`carry_base:${g}`, "PASS", `${path.basename(found[0].file)}（${((now - fin) / 3600000).toFixed(1)} 小時前）`));
  }

  // 哪些 gate 跑得到讀文件的工具 ⇒ 不能沿用
  // ⚠ 2026-11-26 審查修正：不只看「字面引用了變更檔名」——工具用 path.join(ROOT,"docs")、/^docs\//、列目錄，
  //   或依賴 git 歷史（文件 commit 本身就會改變 diff／log／HEAD）都算受影響，一律要在目標 SHA 直接重跑。
  const docRe = docAccessRegex(changed);
  for (const b of info.base) {
    const { reach, unknown, textOf } = reachableTools(repo, D, b.commands, eD);
    const hit = info.toolReaders.filter((t) => reach.has(t));
    const touch = docRe ? [...reach].filter((t) => docRe.test(textOf(t))) : [];
    const hist = [...reach].filter((t) => GIT_HISTORY_RE.test(textOf(t)));
    const reason = hit.length ? `會跑到讀取變更文件的工具：${hit.slice(0, 3).join("、")}`
      : unknown ? "指令無法靜態判定會跑到哪些工具（保守處理）"
      : touch.length ? `會跑到存取文件目錄的工具：${touch.slice(0, 3).join("、")}`
      : hist.length ? `會跑到依賴 git 歷史的工具：${hist.slice(0, 3).join("、")}` : null;
    if (reason) info.requiresDirect.push({ gate: b.gate, reason }); else info.carriedGates.push(b.gate);
  }
  if (info.requiresDirect.length) checks.push(mk("carry_affected_gates", "PASS", `${info.requiresDirect.length} 個 gate 受文件變更影響，必須在目標 SHA 直接重跑：${info.requiresDirect.map((r) => r.gate).join("、")}`));

  // C7
  const distinct = [...new Set(bundles.map((b) => b.aggregateSha256))];
  if (!bundles.length) checks.push(mk("carry_bundle_identical", "BLOCKED", "來源收據沒有記錄 bundle 雜湊（舊收據、或 production gate 沒加 --record-bundle）：無法證明產品輸出相同"));
  else if (distinct.length > 1) checks.push(mk("carry_bundle_identical", "FAIL", `來源各收據記錄的 bundle 雜湊互相矛盾：${distinct.map((d) => d.slice(0, 12)).join("、")}`));
  else if (aggregate(checks) === "PASS") {
    const rb = rebuild(repo, ctx.env?.nodeModules?.real, bundles[0]);
    info.bundle = { base: { gate: bundles[0].gate, aggregateSha256: bundles[0].aggregateSha256, files: bundles[0].files, buildEnv: bundles[0].buildEnv }, target: rb.hash || null };
    checks.push(rb.status === "PASS" ? mk("carry_bundle_identical", "PASS", `${rb.hash.files} 檔，${rb.hash.aggregateSha256.slice(0, 16)}`) : mk("carry_bundle_identical", rb.status, rb.detail || `目標 build ${rb.hash.files} 檔 ${rb.hash.aggregateSha256.slice(0, 16)} ≠ 來源 ${bundles[0].files} 檔 ${bundles[0].aggregateSha256.slice(0, 16)}`));
  }
  if (!info.carriedGates.length && aggregate(checks) === "PASS") checks.push(mk("carry_something_carried", "BLOCKED", "沒有任何 gate 可以沿用"));
  return finish();
}

/** assert 用：一張沿用收據能不能替 gate g 作證（現在、這個 SHA、這個環境）。 */
export function verifyCarry(carry, ctx, gate, { receiptsDir, maxAgeHours = null, now = Date.now(), currentBrowser = null, deploymentProbe = probeDeployment } = {}) {
  const c = [];
  c.push(carry.schema === CARRY_SCHEMA ? mk("carry_schema", "PASS") : mk("carry_schema", "FAIL", `schema「${carry.schema}」不是沿用收據`));
  c.push(carry.digest && carry.digest === digestOf(carry) ? mk("carry_digest", "PASS") : mk("carry_digest", "FAIL", "沿用收據摘要不符：被改過或不完整"));
  c.push(carry.status === "PASS" ? mk("carry_status", "PASS") : mk("carry_status", carry.status === "BLOCKED" ? "BLOCKED" : "FAIL", `最新的沿用收據是 ${carry.status}`));
  c.push(carry.targetSha === ctx.targetFull && carry.actualSha === ctx.targetFull ? mk("carry_sha", "PASS") : mk("carry_sha", "FAIL", `沿用收據綁 ${carry.targetSha}，要驗的是 ${ctx.targetFull}`));
  c.push(carry.treeSha && carry.treeSha === ctx.treeSha ? mk("carry_tree", "PASS") : mk("carry_tree", "FAIL", "tree 不同"));
  // 不只相信沿用收據自己的紀錄：結構檢查（祖先、白名單外 tree 相同、diff 全是文件）在 assert 當下用 git 重算（便宜）
  if (ctx.repoTop && carry.baseSha && ctx.targetFull) {
    const anc = git(ctx.repoTop, ["merge-base", "--is-ancestor", carry.baseSha, ctx.targetFull]).status === 0;
    const eB = lsTree(ctx.repoTop, carry.baseSha), eD = lsTree(ctx.repoTop, ctx.targetFull);
    const same = !!eB && !!eD && nonDocTreeDigest(eB) === nonDocTreeDigest(eD) && nonDocTreeDigest(eD) === carry.nonDocTreeDigest;
    const rows = rawDiff(ctx.repoTop, carry.baseSha, ctx.targetFull);
    const docsOnly = !!rows && rows.length > 0 && classifyDiff(rows).length === 0;
    c.push(anc && same && docsOnly ? mk("carry_structure_recheck", "PASS") : mk("carry_structure_recheck", "FAIL", `當下重算不成立（祖先 ${anc}、白名單外 tree 相同 ${same}、只有文件 ${docsOnly}）`));
  }
  const e = carry.env || {}, cur = ctx.env || {}; const diff = [];
  for (const k of ["nodeMajor", "platform", "arch", "depsDigest", "lockfileBlob"]) if (e[k] !== cur[k]) diff.push(`${k}: ${e[k]} ≠ ${cur[k]}`);
  if (e.installedTree && e.installedTree.digest !== cur.installedTree?.digest) diff.push(`整棵依賴樹: ${String(e.installedTree.digest).slice(0, 12)} ≠ ${String(cur.installedTree?.digest ?? "未知").slice(0, 12)}`);
  c.push(diff.length ? mk("carry_env", "FAIL", diff.join("；")) : mk("carry_env", "PASS"));
  if (!(carry.carriedGates || []).includes(gate)) {
    const why = (carry.requiresDirect || []).find((r) => r.gate === gate);
    c.push(mk("carry_covers_gate", "BLOCKED", why ? `gate「${gate}」受文件變更影響，必須在目標 SHA 直接重跑（${why.reason}）` : `沿用收據不涵蓋 gate「${gate}」`));
    return { status: aggregate(c), checks: c };
  }
  const exp = Date.parse(carry.expiresAt);
  c.push(Number.isFinite(exp) && now <= exp ? mk("carry_not_expired", "PASS", `到期 ${carry.expiresAt}`) : mk("carry_not_expired", "FAIL", `沿用收據已過期（${carry.expiresAt}；沿用不延長原收據效期）`));
  const ref = (carry.base || []).find((b) => b.gate === gate);
  if (!ref) { c.push(mk("carry_base_ref", "FAIL", "沿用收據沒有記錄這個 gate 的來源收據")); return { status: aggregate(c), checks: c }; }
  const file = path.join(receiptsDir || "", ref.file);
  let base = null; try { base = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* 下面處理 */ }
  if (!base) { c.push(mk("carry_base_present", "BLOCKED", `來源收據不見了：${ref.file}（原收據必須永久保留）`)); return { status: aggregate(c), checks: c }; }
  c.push(base.digest === ref.digest ? mk("carry_base_digest_pinned", "PASS") : mk("carry_base_digest_pinned", "FAIL", "來源收據與沿用時記錄的 digest 不同（被換掉或改過）"));
  c.push(base.schema === RECEIPT_SCHEMA && base.gate === gate && base.targetSha === carry.baseSha ? mk("carry_base_identity", "PASS") : mk("carry_base_identity", "FAIL", "來源收據不是該 gate／該來源 SHA 的直接收據"));
  const v = verifyReceipt(base, { targetFull: carry.baseSha, treeSha: carry.baseTree, env: ctx.env, repoTop: ctx.repoTop }, { maxAgeHours, now, currentBrowser, deploymentProbe });
  for (const x of v.checks) c.push({ ...x, id: `base_${x.id}` });
  // 審查修正（I4）：實際到期＝沿用收據的到期與「來源收據現在重驗的到期」取早（環境小改變會讓來源從 72h 退回 24h）
  const e1 = Date.parse(carry.expiresAt), e2 = Date.parse(v.policy?.expiresAt);
  const expiresAt = new Date(Math.min(Number.isFinite(e1) ? e1 : Infinity, Number.isFinite(e2) ? e2 : Infinity)).toISOString();
  return { status: aggregate(c), checks: c, ref, policy: { ...v.policy, expiresAt, via: "docs-carry" } };
}

// ── 加嚴偵測（TD-64 審查修正 I5）────────────────────────────────────────────
/**
 * 指令實際會跑到的工具會不會開瀏覽器或打正式站（只沿著真正的 import 走，不用「提到檔名」這種寬鬆比對，
 * 否則讀取 harness 原始碼做靜態檢查的測試會被誤判成瀏覽器 gate）。只用來「加嚴」分類，永遠不會延長效期。
 * 回傳 { class: "prod-smoke"|"cross-engine"|"browser"|null, modules: [...] }
 */
export function detectTightening(repo, sha, commands) {
  const entries = lsTree(repo, sha); if (!entries) return { class: null, modules: [] };
  const files = new Map(entries.filter((e) => e.type === "blob" && /^(tools|scripts)\/.+\.(m?js|cjs)$/.test(e.path)).map((e) => [e.path, e]));
  const seeds = [];
  for (const c of commands) for (const m of String(c).matchAll(/((?:[\w.\-]+[\\/])*[\w.\-]+\.(?:m?js|cjs))\b/g)) { const p = m[1].replace(/\\/g, "/").replace(/^\.\//, ""); if (files.has(p)) seeds.push(p); }
  const seen = new Set(seeds); const q = [...seeds]; let pw = false, prod = false;
  while (q.length) {
    const p = q.shift(); const e = files.get(p); let t = "";
    try { t = readBlobs(repo, [e.oid]).get(e.oid) || ""; } catch { t = ""; }
    if (/["'](?:playwright(?:-core)?|puppeteer(?:-core)?)["']/.test(t)) pw = true;
    if (/["'`]https:\/\/[a-z0-9-]+\.github\.io\//i.test(t)) prod = true;
    for (const m of t.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'`](\.{1,2}\/[^"'`]+)["'`]/g)) {
      const r = path.posix.normalize(path.posix.join(path.posix.dirname(p), m[1]));
      if (files.has(r) && !seen.has(r)) { seen.add(r); q.push(r); }
    }
  }
  const mods = [...seen];
  const xe = pw || mods.includes("tools/c1/c1_engines.mjs");
  const br = mods.some((p) => p === "tools/browser/cdp.mjs" || p === "tools/browser/harness.mjs");
  return { class: prod && (br || xe) ? "prod-smoke" : xe ? "cross-engine" : br ? "browser" : null, modules: mods.filter((p) => /browser\/(cdp|harness)\.mjs|c1_engines\.mjs/.test(p)) };
}
