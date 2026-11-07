// ============================================================================
//  tools/lib/releaseGate.mjs — Release Gate 的共用防護庫（SHA／依賴／環境／收據）
//
//  ── 為什麼需要 ───────────────────────────────────────────────────────────
//  2026-11-08 盤點發現：記憶裡寫的「乾淨基線 worktree」(ESMO-acceptance) 其實停在
//  689 個 commit 之前、而且沒有 node_modules。拿它跑 Release Gate 會「驗到錯的程式碼」
//  或一開始就壞掉，而紅綠燈本身看不出來。這個庫把「實際驗的是哪個 commit、環境對不對」
//  變成每次驗證的第一道關卡，並留下收據。
//
//  ── 不做什麼 ─────────────────────────────────────────────────────────────
//  · 不是第二套驗證框架：不定義任何產品斷言、不改任何既有 gate 的通過標準，
//    只負責「驗之前確認對象正確」與「驗之後留下收據」。
//  · 只依賴 Node 內建模組：沒有 node_modules 也要能跑（這樣才判得出 BLOCKED）。
//  · 不寫死任何 worktree 名稱、路徑或 commit。目標永遠是參數。
//
//  ── 三種結果（與 AGENTS.md §7 的 PASS／PRODUCT_FAIL／HARNESS_FAIL 同一套 exit code）──
//    PASS    exit 0   所有檢查通過，且（run 時）所有被包的指令 exit 0
//    FAIL    exit 1   驗的東西不是指定的東西，或指令本身失敗（SHA 不符、工作目錄髒、指令非 0…）
//    BLOCKED exit 2   無法完成驗證（缺依賴、環境不符、指令逾時、無收據可查…）
//    usage   exit 64  命令列用法錯誤（不是驗證結果）
//  FAIL ＞ BLOCKED ＞ PASS：只要有一項 FAIL 就是 FAIL。任何 FAIL／BLOCKED 都不會產生 PASS 收據。
//
//  ⚠ 收據只有 SHA-256 摘要，沒有簽章：它擋得住「誤改、拿錯、過期、拿舊環境冒充」，
//    擋不住有心人重算摘要。要防有心人需要 CI 簽章，不在本版範圍。
//  ⚠ 依賴檢查只看 package.json 的頂層依賴（版本對 package-lock.json），不驗整棵依賴樹。
// ============================================================================
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const RELEASE_GATE_VERSION = "1.0.0";
export const RECEIPT_SCHEMA = "esmo.release-gate.receipt/1";
export const EXIT = Object.freeze({ PASS: 0, FAIL: 1, BLOCKED: 2, USAGE: 64 });
export const DEFAULT_MAX_AGE_HOURS = 24;
export const MIN_NODE_MAJOR = 20;           // package.json 沒寫 engines 時的下限（deploy.yml 用 Node 20）
export const MIN_FREE_BYTES = 512 * 1024 * 1024;
/** 這些路徑（相對 repo 根）內出現未追蹤檔 ⇒ 實際跑的程式碼 ≠ 指定 commit ⇒ FAIL。其餘未追蹤檔只警告。 */
export const BUILD_INPUT_PREFIXES = ["src/", "public/", "index.html", "vite.config.", "package.json", "package-lock.json"];
/** 與 tools/browser/cdp.mjs 的 CHROME_CANDIDATES 相同（那份是模組私有常數，這裡只在 --require-browser 時用）。 */
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
].filter(Boolean);

// ── 小工具 ────────────────────────────────────────────────────────────────
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
export function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  return JSON.stringify(v) ?? "null";
}
const mk = (id, status, detail = "") => ({ id, status, detail });
export function aggregate(checks) {
  if (checks.some((c) => c.status === "FAIL")) return "FAIL";
  if (checks.some((c) => c.status === "BLOCKED")) return "BLOCKED";
  return "PASS";
}
const samePath = (a, b) => {
  const f = (p) => { let r = path.resolve(p); try { r = fs.realpathSync.native(r); } catch { /* keep */ } return process.platform === "win32" ? r.toLowerCase() : r; };
  return f(a) === f(b);
};
/** 唯讀 git：永不寫 index（--no-optional-locks）。回傳 { ok, status, out(trim), raw }。 */
export function git(repo, args, { timeout = 60000 } = {}) {
  const r = spawnSync("git", ["--no-optional-locks", "-c", "core.quotepath=off", ...args], {
    cwd: repo, encoding: "utf8", maxBuffer: 1 << 26, timeout,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
  });
  const raw = r.stdout || "";
  return { ok: r.status === 0, status: r.status, out: raw.trim(), raw, err: (r.stderr || "").trim(), spawnError: r.error ? r.error.code || String(r.error.message) : null };
}
const readJson = (p) => { try { return { ok: true, value: JSON.parse(fs.readFileSync(p, "utf8")) }; } catch (e) { return { ok: false, error: String(e.message || e) }; } };

// ── Node 版本範圍（只支援 engines 常見寫法；不認得就回 null，改用 MIN_NODE_MAJOR）─────────
function verTuple(s) {
  const m = /^v?(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/.exec(String(s).trim());
  if (!m) return null;
  const n = (x) => (x === undefined || x === "x" || x === "*" ? null : Number(x));
  return [n(m[1]), n(m[2]), n(m[3])];
}
const cmpT = (a, b) => { for (let i = 0; i < 3; i++) { const x = a[i] ?? 0, y = b[i] ?? 0; if (x !== y) return x < y ? -1 : 1; } return 0; };
export function nodeSatisfies(version, range) {
  const v = verTuple(version); if (!v) return null;
  const alts = String(range).split("||").map((s) => s.trim()).filter(Boolean);
  if (!alts.length) return null;
  let known = false;
  for (const alt of alts) {
    let ok = true, parsed = true;
    for (const tok of alt.split(/\s+/).filter(Boolean)) {
      const m = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(tok); if (!m) { parsed = false; break; }
      const op = m[1] || "", t = verTuple(m[2]); if (!t || t[0] === null) { parsed = false; break; }
      const full = [t[0], t[1] ?? 0, t[2] ?? 0];
      if (op === ">=") ok = ok && cmpT(v, full) >= 0;
      else if (op === ">") ok = ok && cmpT(v, full) > 0;
      else if (op === "<=") ok = ok && cmpT(v, full) <= 0;
      else if (op === "<") ok = ok && cmpT(v, full) < 0;
      else if (op === "^") ok = ok && cmpT(v, full) >= 0 && cmpT(v, [t[0] + 1, 0, 0]) < 0;
      else if (op === "~") ok = ok && cmpT(v, full) >= 0 && cmpT(v, [t[0], (t[1] ?? 0) + 1, 0]) < 0;
      else if (t[1] === null || t[1] === undefined) ok = ok && v[0] === t[0];          // "20" / "20.x"
      else ok = ok && cmpT(v, full) === 0;
    }
    if (!parsed) continue;
    known = true;
    if (ok) return true;
  }
  return known ? false : null;
}

// ── 目標 SHA ──────────────────────────────────────────────────────────────
/** 只收 7–40 位十六進位。分支名、tag、HEAD、origin/main 一律拒絕。 */
export function resolveTarget(repo, requested) {
  const t = String(requested ?? "").trim();
  if (!t) return { check: mk("target_sha_specified", "FAIL", "沒有指定 Target SHA。驗證前必須明確給 --target-sha <commit sha>"), full: null };
  if (!/^[0-9a-fA-F]{7,40}$/.test(t)) return { check: mk("target_sha_format", "FAIL", `「${t}」不是 commit SHA（需要 7–40 位十六進位）。不接受分支名、tag、HEAD、origin/main——它們會移動`), full: null };
  const low = t.toLowerCase();
  if (low.length === 40) return { check: mk("target_sha_format", "PASS", low), full: low };
  const r = git(repo, ["rev-parse", "--verify", "--quiet", `${low}^{commit}`]);
  if (!r.ok || !r.out.startsWith(low)) return { check: mk("target_sha_format", "FAIL", `縮寫 ${low} 在這個 repo 解析不到唯一的 commit（找不到、有歧義，或其實是分支名）`), full: null };
  return { check: mk("target_sha_format", "PASS", `${low} → ${r.out}`), full: r.out };
}

// ── 依賴 ─────────────────────────────────────────────────────────────────
function lockedVersion(lock, name) {
  if (!lock) return null;
  if (lock.packages) return lock.packages["node_modules/" + name]?.version ?? null;
  if (lock.dependencies) return lock.dependencies[name]?.version ?? null;
  return null;
}
export function inspectDeps(repoTop) {
  const out = { pkg: null, lock: null, nodeModules: { kind: "missing" }, installed: {}, missing: [], mismatched: [], digest: null, errors: [] };
  const p = readJson(path.join(repoTop, "package.json"));
  if (!p.ok) { out.errors.push(`package.json 讀不到：${p.error}`); return out; }
  out.pkg = p.value;
  const l = readJson(path.join(repoTop, "package-lock.json")); if (l.ok) out.lock = l.value;
  const nm = path.join(repoTop, "node_modules");
  let st; try { st = fs.lstatSync(nm); } catch { return out; }
  if (st.isSymbolicLink()) {
    let real = null; try { real = fs.realpathSync(nm); } catch { /* dangling */ }
    out.nodeModules = real ? { kind: "link", target: fs.readlinkSync(nm), real } : { kind: "dangling", target: fs.readlinkSync(nm) };
    if (!real) return out;
  } else out.nodeModules = { kind: "dir", real: nm };
  const real = out.nodeModules.real;
  let n = 0; try { n = fs.readdirSync(real).length; } catch { /* ignore */ }
  if (n === 0) { out.nodeModules.kind = "empty"; return out; }
  const names = Object.keys({ ...(out.pkg.dependencies || {}), ...(out.pkg.devDependencies || {}) }).sort();
  for (const name of names) {
    const v = readJson(path.join(real, name, "package.json"));
    if (!v.ok || !v.value.version) { out.missing.push(name); out.installed[name] = null; continue; }
    out.installed[name] = v.value.version;
    const locked = lockedVersion(out.lock, name);
    if (locked && locked !== v.value.version) out.mismatched.push(`${name}: 安裝 ${v.value.version} ≠ lock ${locked}`);
  }
  out.digest = sha256(names.map((k) => `${k}@${out.installed[k] ?? "-"}`).join("\n"));
  return out;
}

// ── 預檢 ─────────────────────────────────────────────────────────────────
export function defaultReceiptsDir(commonDir) { return path.join(commonDir, "esmo-release-gate", "receipts"); }

/**
 * 預檢。回傳 { status, checks, ctx }。ctx 內有 targetFull／actualSha／treeSha／env 等，供收據與驗收使用。
 * opts: { repo, target, requireAncestor, expectRemoteMain, remote, branch, requireBrowser, receiptsDir }
 */
export function preflight(opts) {
  const checks = []; const ctx = { requested: opts.target ?? null, targetFull: null, actualSha: null, treeSha: null, branch: null, detached: null, repoTop: null, commonDir: null, receiptsDir: null, env: null, warnings: [] };
  const repo = path.resolve(opts.repo || ".");
  const done = () => ({ status: aggregate(checks), checks, ctx });

  const tgt = resolveTarget(fs.existsSync(repo) ? repo : process.cwd(), opts.target); checks.push(tgt.check); ctx.targetFull = tgt.full;
  if (!fs.existsSync(repo)) { checks.push(mk("repo_exists", "BLOCKED", `路徑不存在：${repo}`)); return done(); }

  const top = git(repo, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) { checks.push(mk("repo_is_git_worktree", "BLOCKED", top.spawnError === "ENOENT" ? "找不到 git 指令" : `不是 git worktree：${repo}`)); return done(); }
  ctx.repoTop = top.out;
  if (!samePath(repo, top.out)) { checks.push(mk("repo_is_worktree_root", "FAIL", `--repo 必須是 worktree 根目錄（給的是 ${repo}，根是 ${top.out}）。子資料夾可能讓你驗到別的 checkout`)); return done(); }
  checks.push(mk("repo_is_worktree_root", "PASS", top.out));

  // 實際 HEAD：永遠讀工作目錄，不信分支名、worktree 名稱或舊紀錄
  const head = git(repo, ["rev-parse", "--verify", "HEAD"]);
  if (!head.ok) { checks.push(mk("actual_sha_read", "BLOCKED", "讀不到 HEAD（空 repo 或 git 失敗）")); return done(); }
  ctx.actualSha = head.out; ctx.treeSha = git(repo, ["rev-parse", "HEAD^{tree}"]).out || null;
  const br = git(repo, ["symbolic-ref", "--short", "-q", "HEAD"]); ctx.branch = br.ok ? br.out : null; ctx.detached = !br.ok;
  const cd = git(repo, ["rev-parse", "--git-common-dir"]); ctx.commonDir = cd.ok ? path.resolve(repo, cd.out) : null;
  const gd = git(repo, ["rev-parse", "--git-dir"]); const gitDir = gd.ok ? path.resolve(repo, gd.out) : null;
  checks.push(mk("actual_sha_read", "PASS", `${ctx.actualSha}${ctx.detached ? "（detached）" : `（分支 ${ctx.branch}，僅供參考）`}`));

  if (ctx.targetFull) {
    if (ctx.actualSha === ctx.targetFull) checks.push(mk("sha_match", "PASS", ctx.actualSha));
    else checks.push(mk("sha_match", "FAIL", `指定 ${ctx.targetFull}，但這個工作目錄的 HEAD 是 ${ctx.actualSha}。驗到的不是指定的 commit`));
  }

  if (gitDir) {
    const busy = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "BISECT_LOG"].filter((f) => fs.existsSync(path.join(gitDir, f)));
    checks.push(busy.length ? mk("no_git_operation_in_progress", "FAIL", `進行中的 git 操作：${busy.join("、")}`) : mk("no_git_operation_in_progress", "PASS"));
  }

  // 工作目錄：追蹤檔不得有任何修改；build 輸入範圍內不得有未追蹤檔
  const stt = git(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { timeout: 180000 });
  if (!stt.ok) checks.push(mk("working_tree_clean", "BLOCKED", "git status 失敗"));
  else {
    const ents = stt.raw.split("\0").filter(Boolean); const tracked = [], untracked = [];
    for (let i = 0; i < ents.length; i++) { const e = ents[i], xy = e.slice(0, 2), p = e.slice(3); if (xy === "??") untracked.push(p); else { tracked.push(`${xy.trim() || "?"} ${p}`); if (/[RC]/.test(xy)) i++; } }
    const input = untracked.filter((p) => BUILD_INPUT_PREFIXES.some((pre) => p === pre || p.startsWith(pre)));
    if (tracked.length || input.length) checks.push(mk("working_tree_clean", "FAIL", `實際程式碼 ≠ 指定 commit：追蹤檔變動 ${tracked.length}（${tracked.slice(0, 3).join("；")}）、build 輸入範圍內未追蹤 ${input.length}（${input.slice(0, 3).join("；")}）`));
    else checks.push(mk("working_tree_clean", "PASS", untracked.length ? `另有 ${untracked.length} 個與 build 無關的未追蹤檔（警告）` : ""));
    if (untracked.length && !input.length) ctx.warnings.push(`未追蹤檔 ${untracked.length} 個（不在 build 輸入範圍）`);
  }

  // Node
  const di = inspectDeps(ctx.repoTop);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const engines = di.pkg?.engines?.node;
  let nodeOk = nodeMajor >= MIN_NODE_MAJOR, nodeNote = `需要 ≥ ${MIN_NODE_MAJOR}（package.json 沒寫 engines）`;
  if (engines) { const s = nodeSatisfies(process.versions.node, engines); if (s === null) nodeNote = `engines「${engines}」看不懂，改用下限 ≥ ${MIN_NODE_MAJOR}`; else { nodeOk = s; nodeNote = `需要 ${engines}`; } }
  checks.push(nodeOk ? mk("node_version", "PASS", `v${process.versions.node}（${nodeNote}）`) : mk("node_version", "BLOCKED", `v${process.versions.node} 不符：${nodeNote}`));

  // 依賴
  if (!di.pkg) checks.push(mk("package_manifest", "BLOCKED", di.errors.join("；")));
  else {
    checks.push(mk("package_manifest", "PASS"));
    const k = di.nodeModules.kind;
    if (k === "missing") checks.push(mk("node_modules_present", "BLOCKED", "node_modules 不存在。這個 worktree 沒有依賴，無法 build 或跑 gate"));
    else if (k === "dangling") checks.push(mk("node_modules_present", "BLOCKED", `node_modules 是失效的 junction／symlink（指向不存在的 ${di.nodeModules.target}）`));
    else if (k === "empty") checks.push(mk("node_modules_present", "BLOCKED", "node_modules 是空的"));
    else checks.push(mk("node_modules_present", "PASS", k === "link" ? `連結 → ${di.nodeModules.real}` : "真實目錄"));
    if (k === "dir" || k === "link") {
      checks.push(di.missing.length ? mk("deps_installed", "BLOCKED", `缺少 ${di.missing.length} 個頂層依賴：${di.missing.slice(0, 6).join("、")}`) : mk("deps_installed", "PASS", `${Object.keys(di.installed).length} 個頂層依賴都在`));
      if (!di.lock) checks.push(mk("deps_match_lockfile", "BLOCKED", "沒有 package-lock.json，無法確認安裝的版本"));
      else checks.push(di.mismatched.length ? mk("deps_match_lockfile", "BLOCKED", `安裝版本與 package-lock.json 不符 ${di.mismatched.length} 個：${di.mismatched.slice(0, 3).join("；")}`) : mk("deps_match_lockfile", "PASS"));
    }
    // build 條件
    const reasons = [];
    if (!di.pkg.scripts?.build) reasons.push("package.json 沒有 scripts.build");
    if (!fs.existsSync(path.join(ctx.repoTop, "index.html"))) reasons.push("缺 index.html");
    if (!fs.readdirSync(ctx.repoTop).some((f) => /^vite\.config\./.test(f))) reasons.push("缺 vite.config.*");
    const viteJs = di.nodeModules.real ? path.join(di.nodeModules.real, "vite", "bin", "vite.js") : null;
    if (viteJs && fs.existsSync(viteJs)) {
      const v = spawnSync(process.execPath, [viteJs, "--version"], { cwd: ctx.repoTop, encoding: "utf8", timeout: 30000 });
      if (v.status !== 0) reasons.push(`vite --version 跑不起來：${(v.stderr || v.stdout || String(v.error || "")).trim().slice(0, 120)}`);
    } else if (k === "dir" || k === "link") reasons.push("node_modules/vite/bin/vite.js 不存在");
    checks.push(reasons.length ? mk("build_prerequisites", "BLOCKED", reasons.join("；")) : mk("build_prerequisites", "PASS"));
  }

  // 磁碟與收據目錄
  try { const s = fs.statfsSync(ctx.repoTop); const free = Number(s.bavail) * Number(s.bsize); checks.push(free < MIN_FREE_BYTES ? mk("disk_space", "BLOCKED", `可用空間只剩 ${(free / 1048576).toFixed(0)} MB（需要 ≥ ${MIN_FREE_BYTES / 1048576} MB）`) : mk("disk_space", "PASS", `${(free / 1073741824).toFixed(1)} GB 可用`)); } catch { ctx.warnings.push("無法讀取磁碟可用空間"); }
  ctx.receiptsDir = path.resolve(opts.receiptsDir || (ctx.commonDir ? defaultReceiptsDir(ctx.commonDir) : path.join(os.tmpdir(), "esmo-release-gate", "receipts")));
  try { fs.mkdirSync(ctx.receiptsDir, { recursive: true }); const probe = path.join(ctx.receiptsDir, `.w-${process.pid}`); fs.writeFileSync(probe, "x"); fs.unlinkSync(probe); checks.push(mk("receipt_dir_writable", "PASS", ctx.receiptsDir)); }
  catch (e) { checks.push(mk("receipt_dir_writable", "BLOCKED", `收據目錄不可寫：${ctx.receiptsDir}（${e.code || e.message}）`)); }

  // 選用：整合條件
  if (opts.requireAncestor) {
    const a = String(opts.requireAncestor).trim().toLowerCase();
    if (!/^[0-9a-f]{7,40}$/.test(a)) checks.push(mk("target_descends_from", "FAIL", `--require-ancestor「${a}」不是 SHA`));
    else if (!ctx.targetFull) checks.push(mk("target_descends_from", "FAIL", "沒有有效的 Target SHA"));
    else { const r = git(repo, ["merge-base", "--is-ancestor", a, ctx.targetFull]); checks.push(r.status === 0 ? mk("target_descends_from", "PASS", `${ctx.targetFull.slice(0, 12)} 包含 ${a}`) : mk("target_descends_from", "FAIL", r.status === 1 ? `候選 ${ctx.targetFull.slice(0, 12)} 不包含 ${a}（要先 rebase／merge 才能整合）` : `無法判斷 ${a} 是否為祖先（commit 不存在？）`)); }
  }
  if (opts.expectRemoteMain) {
    const e = String(opts.expectRemoteMain).trim().toLowerCase(), remote = opts.remote || "origin", branch = opts.branch || "main";
    const r = remoteHead(repo, remote, branch);
    if (!/^[0-9a-f]{7,40}$/.test(e)) checks.push(mk("remote_main_unchanged", "FAIL", `--expect-remote-main「${e}」不是 SHA`));
    else if (!r.ok) checks.push(mk("remote_main_unchanged", "BLOCKED", `查不到 ${remote}/${branch} 的遠端 SHA：${r.error}`));
    else checks.push(r.sha.startsWith(e) ? mk("remote_main_unchanged", "PASS", `${remote}/${branch} = ${r.sha}`) : mk("remote_main_unchanged", "FAIL", `${remote}/${branch} 現在是 ${r.sha}，不是預期的 ${e}（main 已移動，需要重新確認）`));
  }
  if (opts.requireBrowser) {
    const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
    checks.push(chrome ? mk("browser_available", "PASS", chrome) : mk("browser_available", "BLOCKED", "找不到 Chrome（browser gate 需要）"));
  }

  ctx.env = captureEnv(ctx, di, repo);
  return done();
}

/** 查遠端分支的真實 SHA（ls-remote）。不能假設 main 的 SHA 不變。 */
export function remoteHead(repo, remote = "origin", branch = "main") {
  const r = git(repo, ["ls-remote", remote, `refs/heads/${branch}`], { timeout: 30000 });
  if (!r.ok) return { ok: false, error: (r.err || r.spawnError || "ls-remote 失敗").slice(0, 160) };
  const sha = r.out.split(/\s+/)[0];
  return /^[0-9a-f]{40}$/.test(sha) ? { ok: true, sha } : { ok: false, error: `${remote} 上沒有 ${branch} 分支` };
}

function captureEnv(ctx, di, repo) {
  const lockBlob = ctx.targetFull ? git(repo, ["rev-parse", `${ctx.targetFull}:package-lock.json`]).out || null : null;
  const gv = git(repo, ["--version"]).out;
  return {
    node: process.versions.node, nodeMajor: Number(process.versions.node.split(".")[0]), platform: process.platform, arch: process.arch,
    osRelease: os.release(), git: gv, nodeModules: { kind: di.nodeModules.kind, real: di.nodeModules.real || null },
    depsDigest: di.digest, depCount: Object.keys(di.installed).length, lockfileBlob: lockBlob,
  };
}

// ── 收據 ─────────────────────────────────────────────────────────────────
export function digestOf(receipt) { const { digest, ...rest } = receipt; return sha256(canonical(rest)); }
const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60);
export function buildReceipt({ gate, pre, commands, post, startedAt, finishedAt, status, reasons }) {
  const r = {
    schema: RECEIPT_SCHEMA, gateVersion: RELEASE_GATE_VERSION, gate, status,
    requestedTarget: pre.ctx.requested, targetSha: pre.ctx.targetFull, actualSha: pre.ctx.actualSha,
    actualShaAfter: post ? post.actualShaAfter : pre.ctx.actualSha, treeSha: pre.ctx.treeSha,
    branch: pre.ctx.branch, detached: pre.ctx.detached, repo: pre.ctx.repoTop,
    startedAt, finishedAt, durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    env: pre.ctx.env, checks: [...pre.checks, ...(post ? post.checks : [])], commands, warnings: pre.ctx.warnings, reasons,
  };
  r.digest = digestOf(r);
  return r;
}
export function writeReceipt(dir, receipt) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = receipt.finishedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const name = `${stamp}__${(receipt.targetSha || "nosha").slice(0, 12)}__${safe(receipt.gate)}__${receipt.status}.json`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(receipt, null, 1) + "\n", { flag: "wx" });
  return file;
}
export function loadReceipts(dir, { targetSha, gate }) {
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const f of files) { const j = readJson(path.join(dir, f)); if (j.ok && j.value && j.value.targetSha === targetSha && j.value.gate === gate) out.push({ file: path.join(dir, f), receipt: j.value }); }
  out.sort((a, b) => (Date.parse(b.receipt.finishedAt) || 0) - (Date.parse(a.receipt.finishedAt) || 0) || (a.file < b.file ? 1 : -1));
  return out;
}

/** 驗收一張收據是否能代表「現在、這個 SHA、這個環境」的驗證通過。 */
export function verifyReceipt(receipt, ctx, { maxAgeHours = DEFAULT_MAX_AGE_HOURS, now = Date.now(), allowPreflightOnly = false, acceptGateVersion = null } = {}) {
  const c = [];
  c.push(receipt.schema === RECEIPT_SCHEMA ? mk("receipt_schema", "PASS") : mk("receipt_schema", "FAIL", `schema「${receipt.schema}」不認得`));
  c.push(receipt.digest && receipt.digest === digestOf(receipt) ? mk("receipt_digest", "PASS") : mk("receipt_digest", "FAIL", "摘要不符：收據被改過或不完整"));
  const gv = acceptGateVersion || RELEASE_GATE_VERSION;
  c.push(receipt.gateVersion === gv ? mk("receipt_gate_version", "PASS", gv) : mk("receipt_gate_version", "FAIL", `收據由 Gate v${receipt.gateVersion} 產生，現行是 v${gv}，要重跑`));
  if (receipt.status === "PASS") c.push(mk("receipt_status", "PASS"));
  else c.push(mk("receipt_status", receipt.status === "BLOCKED" ? "BLOCKED" : "FAIL", `最新一張收據的結果是 ${receipt.status}`));
  const chain = receipt.targetSha === ctx.targetFull && receipt.actualSha === ctx.targetFull && receipt.actualShaAfter === ctx.targetFull;
  c.push(chain ? mk("receipt_sha_chain", "PASS", ctx.targetFull) : mk("receipt_sha_chain", "FAIL", `收據的 target/actual/after = ${receipt.targetSha}/${receipt.actualSha}/${receipt.actualShaAfter}，要驗的是 ${ctx.targetFull}`));
  c.push(receipt.treeSha && receipt.treeSha === ctx.treeSha ? mk("receipt_tree", "PASS") : mk("receipt_tree", "FAIL", `收據的 tree ${receipt.treeSha} ≠ 現在的 ${ctx.treeSha}`));
  const fin = Date.parse(receipt.finishedAt);
  if (!Number.isFinite(fin)) c.push(mk("receipt_age", "FAIL", "finishedAt 讀不懂"));
  else if (fin > now + 5 * 60000) c.push(mk("receipt_age", "FAIL", "收據時間在未來"));
  else { const h = (now - fin) / 3600000; c.push(h > maxAgeHours ? mk("receipt_age", "FAIL", `收據已過期：${h.toFixed(1)} 小時前（上限 ${maxAgeHours} 小時）`) : mk("receipt_age", "PASS", `${h.toFixed(2)} 小時前`)); }
  const e = receipt.env || {}, cur = ctx.env || {}; const diff = [];
  for (const k of ["nodeMajor", "platform", "arch", "depsDigest", "lockfileBlob"]) if (e[k] !== cur[k]) diff.push(`${k}: 收據 ${e[k]} ≠ 現在 ${cur[k]}`);
  c.push(diff.length ? mk("receipt_env", "FAIL", `驗證環境與現在不同（${diff.join("；")}）`) : mk("receipt_env", "PASS"));
  // 只對「宣稱 PASS」的收據做內容一致性檢查。非 PASS 的收據由上面的 receipt_status 決定類別
  // （FAIL 或 BLOCKED）；再用指令 exit code 去改寫它的類別，會把「環境類阻挡」誤報成「指令失敗」。
  if (receipt.status === "PASS") {
    const cmds = Array.isArray(receipt.commands) ? receipt.commands : [];
    if (!allowPreflightOnly) c.push(cmds.length && cmds.every((x) => x.exitCode === 0) ? mk("receipt_commands", "PASS", `${cmds.length} 個指令全部 exit 0`) : mk("receipt_commands", "FAIL", cmds.length ? "有指令不是 exit 0" : "收據沒有執行任何驗證指令（只有預檢不算驗證）"));
    const bad = (receipt.checks || []).filter((x) => x.status === "FAIL" || x.status === "BLOCKED");
    c.push(bad.length ? mk("receipt_internal_consistency", "FAIL", `收據標 PASS 但內含 ${bad.length} 項 FAIL／BLOCKED 檢查`) : mk("receipt_internal_consistency", "PASS"));
  }
  return { status: aggregate(c), checks: c };
}

/** assert：重新預檢（現在的 HEAD、環境），再逐個 gate 驗最新一張收據。 */
export function assertReceipts(opts) {
  const pre = preflight(opts); const all = [...pre.checks]; const gates = opts.gates || [];
  const detail = {};
  if (pre.status === "PASS") {
    for (const g of gates) {
      const found = loadReceipts(pre.ctx.receiptsDir, { targetSha: pre.ctx.targetFull, gate: g });
      if (!found.length) { all.push(mk(`gate:${g}`, "BLOCKED", `這個 SHA 沒有 gate「${g}」的收據。請先執行 run`)); continue; }
      const v = verifyReceipt(found[0].receipt, pre.ctx, { maxAgeHours: opts.maxAgeHours, allowPreflightOnly: opts.allowPreflightOnly });
      detail[g] = { file: found[0].file, olderIgnored: found.length - 1, checks: v.checks };
      all.push(mk(`gate:${g}`, v.status, v.status === "PASS" ? `最新收據有效（${path.basename(found[0].file)}${found.length > 1 ? `；${found.length - 1} 張較舊的不採用` : ""}）` : v.checks.filter((x) => x.status !== "PASS").map((x) => `${x.id}: ${x.detail}`).join("｜")));
    }
  }
  return { status: aggregate(all), checks: all, ctx: pre.ctx, detail };
}

// ── 執行被包住的指令 ─────────────────────────────────────────────────────
export function runCommand(cmd, { cwd, env, timeoutMs, echo = true }) {
  return new Promise((resolve) => {
    const started = Date.now(); let tail = ""; let timedOut = false; let spawnError = null;
    const child = spawn(cmd, { cwd, env, shell: true, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const feed = (d) => { const s = d.toString(); tail = (tail + s).slice(-4000); if (echo) process.stdout.write(s); };
    child.stdout.on("data", feed); child.stderr.on("data", feed);
    const timer = setTimeout(() => { timedOut = true; if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { timeout: 15000 }); else child.kill("SIGKILL"); }, timeoutMs);
    child.on("error", (e) => { spawnError = String(e.message || e); });
    child.on("close", (code, sig) => { clearTimeout(timer); resolve({ cmd, exitCode: timedOut ? null : code, signal: sig || null, timedOut, spawnError, durationMs: Date.now() - started, tail: tail.split(/\r?\n/).slice(-12).join("\n") }); });
  });
}
/** 指令結果 → 狀態。0=過；2（既有慣例：HARNESS_FAIL／未跑完）、逾時、起不來 = BLOCKED；其他非 0 = FAIL。 */
export function commandStatus(r) {
  if (r.spawnError || r.timedOut) return "BLOCKED";
  if (r.exitCode === 0) return "PASS";
  return r.exitCode === 2 ? "BLOCKED" : "FAIL";
}
