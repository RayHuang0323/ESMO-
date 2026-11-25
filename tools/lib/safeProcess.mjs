// ============================================================================
//  tools/lib/safeProcess.mjs — 測試行程的安全登記與終止（2026-11-25 事件的程式級防護）
//
//  事件：以埠號查行程時撿到 TIME_WAIT 列（PID 0），`taskkill /PID 0 /T /F` 掃過整台機器，
//  關掉了 Owner 自己的 Chrome。AGENTS.md §12 的文字規則擋不住下一次手滑，所以這裡把規則寫成程式：
//
//    1. 只能終止「自己登記過」的行程：登記時記下 PID、OS 回報的啟動時間、命令列、工作區、任務 ID。
//    2. 終止前重新向 OS 查身分：PID 不在了 ⇒ 已結束（不動手）；啟動時間或命令列不同 ⇒ PID 被重複使用，拒絕。
//    3. PID 必須是 > 4 的整數，不是自己、不是父行程，也不在系統保護名單（System、csrss、explorer…）。
//    4. 沒有「依名稱」或「依埠號」終止的 API。埠號只提供唯讀查詢（只回 Listen 且 PID > 4 的那一筆）。
//    5. 先正常關閉（呼叫端的 graceful 或 ChildProcess.kill），等一段時間；還在才強制終止，
//       而且強制終止不用 `taskkill /T`：先列出後代（每一層都要「子行程啟動時間 ≥ 父行程」，
//       擋掉 PID 被重用後掛錯的父子關係），逐一確認身分後由葉往根各自 `taskkill /PID x /F`。
//    6. 每次登記與終止都寫進 JSONL 紀錄（預設在 git common dir 的 esmo-release-gate/processes/）。
//
//  只用 Node 內建模組。Windows 身分查詢用 PowerShell Get-CimInstance（約 0.5–1 秒），只在登記與終止時呼叫。
// ============================================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SAFE_PROCESS_VERSION = "1.0.0";
/** 永遠不能被這套工具終止的行程名稱（小寫，不含路徑）。 */
export const PROTECTED_NAMES = new Set([
  "system", "system idle process", "idle", "registry", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe",
  "lsaiso.exe", "svchost.exe", "fontdrvhost.exe", "dwm.exe", "explorer.exe", "sihost.exe", "taskhostw.exe", "ctfmon.exe", "spoolsv.exe",
  "memory compression", "secure system", "conhost.exe", "runtimebroker.exe", "searchindexer.exe", "msmpeng.exe", "onedrive.exe",
  "launchd", "init", "systemd", "kernel_task", "kthreadd",
]);
const START_TOLERANCE_MS = 1500;

export class UnsafeProcessError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/** PID 的基本安全檢查（不需要查 OS）。不安全就丟 UnsafeProcessError。 */
export function assertSafePid(pid) {
  if (!Number.isInteger(pid)) throw new UnsafeProcessError("pid_not_integer", `PID「${pid}」不是整數`);
  if (pid <= 4) throw new UnsafeProcessError("pid_reserved", `PID ${pid} 是保留／系統行程（PID 0 會讓 taskkill /T 掃過整台機器）`);
  if (pid === process.pid) throw new UnsafeProcessError("pid_self", "不能終止自己");
  if (pid === process.ppid) throw new UnsafeProcessError("pid_parent", "不能終止父行程");
  return pid;
}

// ── OS 身分查詢 ───────────────────────────────────────────────────────────
function psJson(script) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`], { encoding: "utf8", timeout: 30000, windowsHide: true, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`PowerShell 查詢失敗：${(r.stderr || "").trim().slice(0, 200) || r.error?.code}`);
  const t = (r.stdout || "").trim(); if (!t) return [];
  const j = JSON.parse(t); return Array.isArray(j) ? j : [j];
}
const WIN_SELECT = "ForEach-Object { [pscustomobject]@{ pid=[int]$_.ProcessId; ppid=[int]$_.ParentProcessId; name=$_.Name; start=$(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null }); cmd=$_.CommandLine } } | ConvertTo-Json -Compress -Depth 2";
const norm = (x) => ({ pid: Number(x.pid), ppid: Number(x.ppid), name: x.name ?? null, startMs: x.start ? Date.parse(x.start) : null, commandLine: x.cmd ?? null });
/** 系統的真實探針。測試可以換成假的（同樣的介面）。 */
export const osProbe = {
  info(pid) {
    if (process.platform === "win32") { const rows = psJson(`Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}" | ${WIN_SELECT}`); return rows.length ? norm(rows[0]) : null; }
    return this.snapshot().find((p) => p.pid === pid) ?? null;
  },
  snapshot() {
    if (process.platform === "win32") return psJson(`Get-CimInstance Win32_Process | ${WIN_SELECT}`).map(norm);
    const r = spawnSync("ps", ["-A", "-o", "pid=,ppid=,etimes=,comm=,args="], { encoding: "utf8", timeout: 15000 });
    const now = Date.now();
    return (r.stdout || "").split("\n").filter(Boolean).map((l) => { const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l); return m ? { pid: +m[1], ppid: +m[2], startMs: Math.round((now - +m[3] * 1000) / 1000) * 1000, name: path.basename(m[4]), commandLine: m[5] } : null; }).filter(Boolean);
  },
  kill(pid) {
    assertSafePid(pid);
    if (process.platform === "win32") { const r = spawnSync("taskkill", ["/PID", String(pid), "/F"], { encoding: "utf8", timeout: 15000, windowsHide: true }); return { ok: r.status === 0, detail: (r.stdout || r.stderr || "").trim().slice(0, 160) }; }
    try { process.kill(pid, "SIGKILL"); return { ok: true }; } catch (e) { return { ok: false, detail: e.code }; }
  },
  alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sameStart = (a, b, tol = START_TOLERANCE_MS) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

/** 預設紀錄目錄：git common dir 底下（所有 worktree 共用、不進版控）；不在 git 裡就用系統暫存區。 */
export function defaultRegistryDir(cwd = process.cwd()) {
  const r = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" });
  return r.status === 0 ? path.join(path.resolve(cwd, r.stdout.trim()), "esmo-release-gate", "processes") : path.join(os.tmpdir(), "esmo-release-gate", "processes");
}

/**
 * 建立一個任務的行程登記簿。
 * opts: { taskId, dir, workspace, probe }  probe 預設是 osProbe（測試可注入假的）
 */
export function createProcessRegistry({ taskId, dir = defaultRegistryDir(), workspace = process.cwd(), probe = osProbe } = {}) {
  if (!taskId || !/^[\w.-]{1,80}$/.test(taskId)) throw new UnsafeProcessError("bad_task_id", `taskId「${taskId}」不合法（英數、點、底線、連字號）`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${taskId}.jsonl`);
  const log = (ev) => { fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), taskId, ...ev }) + "\n"); };
  const entries = () => {
    const map = new Map();
    let lines = []; try { lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean); } catch { /* 新任務 */ }
    for (const l of lines) { let e; try { e = JSON.parse(l); } catch { continue; } if (e.taskId !== taskId) continue; if (e.event === "register") map.set(`${e.pid}@${e.startMs}`, e); if (e.event === "released") map.delete(`${e.pid}@${e.startMs}`); }
    return [...map.values()];
  };

  /**
   * 登記一個自己剛啟動的行程。child 可以是 ChildProcess 或 PID。
   * 會立刻向 OS 查啟動時間與命令列（最多重試 5 次，新行程有時要一下子才查得到）。
   */
  function register(child, { label = "", expectCmdIncludes = null } = {}) {
    const pid = typeof child === "number" ? child : child?.pid;
    assertSafePid(pid);
    let info = null;
    for (let i = 0; i < 5 && !info; i++) { info = probe.info(pid); if (!info) spawnSync(process.execPath, ["-e", "setTimeout(()=>{},150)"]); }
    if (!info) throw new UnsafeProcessError("not_found_at_register", `登記時就查不到 PID ${pid}（行程已結束？）`);
    if (expectCmdIncludes && !String(info.commandLine || "").includes(expectCmdIncludes)) throw new UnsafeProcessError("register_cmd_mismatch", `PID ${pid} 的命令列不含預期字串，不是剛啟動的那個行程`);
    if (PROTECTED_NAMES.has(String(info.name || "").toLowerCase())) throw new UnsafeProcessError("protected_name", `${info.name} 是系統保護行程，不能登記`);
    const entry = { event: "register", pid, startMs: info.startMs, name: info.name, commandLine: info.commandLine, ppid: info.ppid, workspace: path.resolve(workspace), label, version: SAFE_PROCESS_VERSION };
    log(entry);
    if (child && typeof child === "object") handles.set(`${pid}@${info.startMs}`, child);
    return entry;
  }
  const handles = new Map();

  /** 從登記簿裡找這個 PID 的登記（必須是本任務登記的）。 */
  const findEntry = (pidOrEntry) => {
    const pid = typeof pidOrEntry === "object" ? pidOrEntry.pid : pidOrEntry;
    const list = entries().filter((e) => e.pid === pid && (typeof pidOrEntry !== "object" || pidOrEntry.startMs === undefined || e.startMs === pidOrEntry.startMs));
    return list.length ? list[list.length - 1] : null;
  };

  /** 確認 OS 上的這個 PID 現在仍是登記的那個行程。回傳 { state: "same"|"gone"|"reused", info } */
  function identify(entry) {
    const info = probe.info(entry.pid);
    if (!info) return { state: "gone", info: null };
    if (!sameStart(info.startMs, entry.startMs) || (entry.commandLine ?? null) !== (info.commandLine ?? null)) return { state: "reused", info };
    return { state: "same", info };
  }

  /** 列出已確認屬於 root 的後代（每層：子行程啟動時間 ≥ 父行程啟動時間）。由葉到根排序（不含 root）。 */
  function descendantsOf(rootInfo) {
    const snap = probe.snapshot(); const byParent = new Map();
    for (const p of snap) { if (!byParent.has(p.ppid)) byParent.set(p.ppid, []); byParent.get(p.ppid).push(p); }
    const out = []; const seen = new Set([rootInfo.pid]);
    const walk = (parent, depth) => {
      for (const c of byParent.get(parent.pid) || []) {
        if (seen.has(c.pid) || c.pid <= 4) continue;
        if (!(Number.isFinite(c.startMs) && Number.isFinite(parent.startMs) && c.startMs + START_TOLERANCE_MS >= parent.startMs)) continue; // PID 重用造成的假父子關係
        if (PROTECTED_NAMES.has(String(c.name || "").toLowerCase())) continue;
        seen.add(c.pid); walk(c, depth + 1); out.push({ ...c, depth });
      }
    };
    walk(rootInfo, 1);
    return out;
  }

  /**
   * 終止一個登記過的行程（含已確認的後代）。
   * opts: { graceMs=3000, graceful: async () => void, includeDescendants=true, reason }
   * 回傳 { result: "terminated"|"already-exited"|"refused", code?, detail, killed: [...] }
   */
  async function terminate(pidOrEntry, { graceMs = 3000, graceful = null, includeDescendants = true, reason = "" } = {}) {
    const pid = typeof pidOrEntry === "object" ? pidOrEntry?.pid : pidOrEntry;
    const refuse = (code, detail) => { log({ event: "refused", pid, code, detail, reason }); return { result: "refused", code, detail, killed: [] }; };
    try { assertSafePid(pid); } catch (e) { return refuse(e.code, e.message); }
    const entry = findEntry(pidOrEntry);
    if (!entry) return refuse("not_registered", `PID ${pid} 不是任務「${taskId}」登記的行程；未登記或來源不明的行程一律不動`);
    const id = identify(entry);
    if (id.state === "gone") { log({ event: "released", pid, startMs: entry.startMs, why: "already-exited" }); return { result: "already-exited", detail: "行程已經結束", killed: [] }; }
    if (id.state === "reused") return refuse("pid_reused", `PID ${pid} 現在是另一個行程（${id.info.name}，啟動 ${new Date(id.info.startMs).toISOString()}，登記時 ${new Date(entry.startMs).toISOString()}）`);
    if (PROTECTED_NAMES.has(String(id.info.name || "").toLowerCase())) return refuse("protected_name", `${id.info.name} 是系統保護行程`);
    log({ event: "terminate-begin", pid, startMs: entry.startMs, name: id.info.name, commandLine: id.info.commandLine, reason });

    // 0) 先列出已確認的後代：Windows 上結束父行程不會帶走子行程，等父行程不在了就找不到它們了
    const tree = includeDescendants ? descendantsOf(id.info) : [];
    log({ event: "tree", pid, descendants: tree.map((p) => ({ pid: p.pid, name: p.name, startMs: p.startMs })) });
    const stillSame = (p) => { const now = probe.info(p.pid); return !!now && sameStart(now.startMs, p.startMs) && (now.commandLine ?? null) === (p.commandLine ?? null); };

    // 1) 正常關閉
    const handle = handles.get(`${entry.pid}@${entry.startMs}`);
    try { if (graceful) await graceful(); else if (handle && handle.exitCode === null && handle.signalCode === null) handle.kill(); } catch (e) { log({ event: "graceful-error", pid, detail: String(e.message || e) }); }
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline) { if (identify(entry).state !== "same" && !tree.some(stillSame)) break; await sleep(150); }
    if (identify(entry).state !== "same" && !tree.some(stillSame)) { log({ event: "released", pid, startMs: entry.startMs, why: "graceful" }); return { result: "terminated", detail: "正常關閉", killed: [] }; }

    // 2) 強制：由葉到根，逐一再確認身分後單獨終止（不用 /T）
    const killed = [];
    for (const p of [...tree.sort((a, b) => b.depth - a.depth), { ...id.info, depth: 0, root: true }]) {
      const now = probe.info(p.pid);
      if (!now) continue;
      if (!sameStart(now.startMs, p.startMs) || (now.commandLine ?? null) !== (p.commandLine ?? null)) { log({ event: "skip-changed", pid: p.pid }); continue; }
      try { assertSafePid(p.pid); } catch { continue; }
      const k = probe.kill(p.pid);
      killed.push({ pid: p.pid, name: p.name, ok: k.ok, root: !!p.root });
      log({ event: "kill", pid: p.pid, name: p.name, startMs: p.startMs, commandLine: p.commandLine, ok: k.ok, detail: k.detail });
    }
    await sleep(200);
    const still = identify(entry).state === "same" || tree.some(stillSame);
    log({ event: still ? "terminate-unconfirmed" : "released", pid, startMs: entry.startMs, why: "forced" });
    return { result: still ? "refused" : "terminated", code: still ? "still_alive" : undefined, detail: still ? "強制終止後仍存活" : `強制終止 ${killed.length} 個行程（含已確認的後代）`, killed };
  }

  return { taskId, file, register, terminate, entries, identify };
}

/** 唯讀：誰在 Listen 這個埠。只回 State=Listen 且 PID > 4 的那幾筆。這裡刻意沒有任何終止功能。 */
export function listenersOnPort(port) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new UnsafeProcessError("bad_port", `埠號「${port}」不合法`);
  if (process.platform !== "win32") return [];
  const rows = psJson(`Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 } | ForEach-Object { [pscustomobject]@{ pid=[int]$_.OwningProcess; addr=$_.LocalAddress } } | ConvertTo-Json -Compress`);
  return rows.filter((r) => Number(r.pid) > 4).map((r) => ({ pid: Number(r.pid), address: r.addr, informationalOnly: true }));
}
