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
//  ── 2026-11-26 第二輪審查（S1.1）加強 ───────────────────────────────────────
//    7. 歸屬證據：登記 ChildProcess 時，OS 回報的父行程必須正是本行程（不是就拒絕登記）；只給 PID 登記時必須附 expectCmdIncludes。
//       terminateLiveTree（沒有登記簿的舊呼叫端）也要求根行程的父行程＝本行程、而且在本行程之後啟動——
//       「比本行程晚啟動」不再單獨足夠（使用者在測試開始後才開的 Chrome 也比較晚啟動，但父行程是 explorer）。
//    8. 多個 Session／AI：登記紀錄帶擁有者（PID＋OS 啟動時間）。別的 Session 還活著 ⇒ 拒絕（owned_by_other_session）；
//       擁有者已不在（前一個 Session 遺留）⇒ 預設拒絕並回報（stale_registration），只有明確 allowStale 才清理（仍要重驗身分）。
//    9. 本行程的祖先鏈（父、祖父…Claude Code、終端機）一律不終止，不只直接父行程。
//   10. 查身分與終止之間的競態：Windows 上強制終止改成一次 PowerShell「先開行程控制代碼、再驗啟動時間與命令列、用同一個
//       控制代碼終止」——持有控制代碼期間 PID 不會被系統重用。非 Windows 沒有 pidfd，仍是「重驗後立刻 SIGKILL」（殘餘風險已記錄）。
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
  /**
   * 驗證後終止（由呼叫端給的順序逐一處理）。items: [{ pid, startMs, commandLine }]。
   * Windows：一次 PowerShell。每個 PID 先開控制代碼（Process.Handle），持有期間 PID 不會被重用；再比對啟動時間（±1.5s）與命令列，
   * 全部相同才用同一個 Process 物件 Kill()。回傳 [{ pid, result: "killed"|"changed"|"gone"|"error", detail }]。
   */
  killVerified(items) {
    for (const it of items) assertSafePid(it.pid);
    if (process.platform !== "win32") {
      return items.map((it) => { const now = this.info(it.pid); if (!now) return { pid: it.pid, result: "gone" }; if (!sameStart(now.startMs, it.startMs) || (now.commandLine ?? null) !== (it.commandLine ?? null)) return { pid: it.pid, result: "changed" }; try { process.kill(it.pid, "SIGKILL"); return { pid: it.pid, result: "killed" }; } catch (e) { return { pid: it.pid, result: "error", detail: e.code }; } });
    }
    const script = `$items = $env:ESMO_KILL_LIST | ConvertFrom-Json
$out = foreach ($it in @($items)) {
  $r = 'error'; $d = ''
  try {
    $p = [System.Diagnostics.Process]::GetProcessById([int]$it.pid)
    $null = $p.Handle
    $st = $p.StartTime.ToUniversalTime()
    $exp = [DateTime]::Parse($it.start, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    $cim = Get-CimInstance Win32_Process -Filter ("ProcessId=" + [int]$it.pid)
    $cmdOk = ($null -ne $cim) -and ([string]$cim.CommandLine -ceq [string]$it.cmd)
    if ([Math]::Abs(($st - $exp).TotalMilliseconds) -le ${START_TOLERANCE_MS} -and $cmdOk) { $p.Kill(); $null = $p.WaitForExit(5000); $r = 'killed' } else { $r = 'changed' }
  } catch [System.ArgumentException] { $r = 'gone' } catch { $r = 'error'; $d = $_.Exception.Message }
  [pscustomobject]@{ pid = [int]$it.pid; result = $r; detail = $d }
}
@($out) | ConvertTo-Json -Compress -Depth 2`;
    const list = JSON.stringify(items.map((it) => ({ pid: it.pid, start: new Date(it.startMs).toISOString(), cmd: it.commandLine ?? "" })));
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`], { encoding: "utf8", timeout: 60000, windowsHide: true, env: { ...process.env, ESMO_KILL_LIST: list } });
    if (r.status !== 0) return items.map((it) => ({ pid: it.pid, result: "error", detail: (r.stderr || String(r.error?.code || "")).trim().slice(0, 160) }));
    let j = []; try { j = JSON.parse((r.stdout || "").trim() || "[]"); } catch { return items.map((it) => ({ pid: it.pid, result: "error", detail: "PowerShell 輸出讀不懂" })); }
    return (Array.isArray(j) ? j : [j]).map((x) => ({ pid: Number(x.pid), result: x.result, detail: x.detail || "" }));
  },
};

/** 本行程的祖先鏈（父、祖父…）。由 snapshot 往上走，每一層祖先的啟動時間必須早於子（擋掉 PID 重用造成的假鏈）。 */
export function ancestorsOf(pid, snap) {
  const by = new Map(snap.map((p) => [p.pid, p])); const out = new Set(); const seen = new Set([pid]); let cur = by.get(pid);
  if (pid === process.pid && process.ppid > 4) out.add(process.ppid);
  for (let i = 0; i < 64 && cur; i++) {
    const par = by.get(cur.ppid);
    if (!par || par.pid <= 4 || seen.has(par.pid)) break;
    if (Number.isFinite(par.startMs) && Number.isFinite(cur.startMs) && par.startMs > cur.startMs + START_TOLERANCE_MS) break; // 假鏈（PID 重用）
    seen.add(par.pid); out.add(par.pid); cur = par;
  }
  return out;
}
/** 本行程的 OS 啟動時間（查不到就用 uptime 推算）。 */
let SELF_START = null;
export function selfStartMs(probe = osProbe) {
  if (SELF_START !== null && probe === osProbe) return SELF_START;
  let s = null; try { s = probe.info(process.pid)?.startMs ?? null; } catch { s = null; }
  const v = Number.isFinite(s) ? s : Date.now() - process.uptime() * 1000;
  if (probe === osProbe) SELF_START = v;
  return v;
}

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
    const isHandle = !!child && typeof child === "object";
    const pid = isHandle ? child.pid : child;
    assertSafePid(pid);
    if (!isHandle && !expectCmdIncludes) throw new UnsafeProcessError("pid_only_needs_cmd", `只給 PID ${pid} 登記時必須附 expectCmdIncludes（沒有 ChildProcess 就沒有「是自己啟動的」證據）`);
    let info = null;
    for (let i = 0; i < 5 && !info; i++) { info = probe.info(pid); if (!info) spawnSync(process.execPath, ["-e", "setTimeout(()=>{},150)"]); }
    if (!info) throw new UnsafeProcessError("not_found_at_register", `登記時就查不到 PID ${pid}（行程已結束？）`);
    if (expectCmdIncludes && !String(info.commandLine || "").includes(expectCmdIncludes)) throw new UnsafeProcessError("register_cmd_mismatch", `PID ${pid} 的命令列不含預期字串，不是剛啟動的那個行程`);
    if (PROTECTED_NAMES.has(String(info.name || "").toLowerCase())) throw new UnsafeProcessError("protected_name", `${info.name} 是系統保護行程，不能登記`);
    // 歸屬證據：手上有 ChildProcess ⇒ OS 回報的父行程必須正是本行程（否則 PID 已經被別人重用，或根本不是自己啟動的）
    if (isHandle && info.ppid !== process.pid) throw new UnsafeProcessError("not_our_child", `PID ${pid} 的父行程是 ${info.ppid}，不是本行程 ${process.pid}：不是自己剛啟動的那個行程`);
    const entry = { event: "register", pid, startMs: info.startMs, name: info.name, commandLine: info.commandLine, ppid: info.ppid, workspace: path.resolve(workspace), label, version: SAFE_PROCESS_VERSION,
      evidence: isHandle ? "child-process" : "pid+cmd", ownerPid: process.pid, ownerStartMs: selfStartMs(probe) };
    log(entry);
    if (child && typeof child === "object") handles.set(`${pid}@${info.startMs}`, child);
    return entry;
  }
  const handles = new Map();
  /** 登記的擁有者狀態：self（本行程）｜other-alive（別的 Session 還在）｜stale（擁有者已結束）｜legacy（舊紀錄沒有擁有者欄位） */
  function ownerState(entry) {
    if (!entry.ownerPid) return "legacy";
    if (entry.ownerPid === process.pid) return "self";
    let o = null; try { o = probe.info(entry.ownerPid); } catch { o = null; }
    return o && sameStart(o.startMs, entry.ownerStartMs, 5000) ? "other-alive" : "stale";
  }
  /** 唯讀：列出登記簿裡「擁有者已結束」的遺留登記，以及它們現在的身分狀態（不終止任何行程）。 */
  function stale() { return entries().filter((e) => ownerState(e) === "stale").map((e) => ({ pid: e.pid, name: e.name, label: e.label, ownerPid: e.ownerPid, state: identify(e).state })); }

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
  function descendantsOf(rootInfo, snap = probe.snapshot()) {
    const byParent = new Map();
    for (const p of snap) { if (!byParent.has(p.ppid)) byParent.set(p.ppid, []); byParent.get(p.ppid).push(p); }
    const anc = ancestorsOf(process.pid, snap);
    const out = []; const seen = new Set([rootInfo.pid, process.pid, ...anc]);
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
  async function terminate(pidOrEntry, { graceMs = 3000, graceful = null, includeDescendants = true, reason = "", allowStale = false } = {}) {
    const pid = typeof pidOrEntry === "object" ? pidOrEntry?.pid : pidOrEntry;
    const refuse = (code, detail) => { log({ event: "refused", pid, code, detail, reason }); return { result: "refused", code, detail, killed: [] }; };
    try { assertSafePid(pid); } catch (e) { return refuse(e.code, e.message); }
    const entry = findEntry(pidOrEntry);
    if (!entry) return refuse("not_registered", `PID ${pid} 不是任務「${taskId}」登記的行程；未登記或來源不明的行程一律不動`);
    // 擁有者：另一個還活著的 Session／AI 登記的 ⇒ 不碰；擁有者已不在（前一個 Session 遺留）⇒ 預設只回報
    const own = ownerState(entry);
    if (own === "other-alive") return refuse("owned_by_other_session", `PID ${pid} 是另一個仍在執行的 Session（PID ${entry.ownerPid}）登記的，不能由這裡終止`);
    if (own === "stale" && !allowStale) return refuse("stale_registration", `PID ${pid} 是前一個 Session（PID ${entry.ownerPid}，已結束）遺留的登記：預設只回報不終止；確認要清理請明確加 allowStale（仍會重驗身分）`);
    const id = identify(entry);
    if (id.state === "gone") { log({ event: "released", pid, startMs: entry.startMs, why: "already-exited" }); return { result: "already-exited", detail: "行程已經結束", killed: [] }; }
    if (id.state === "reused") return refuse("pid_reused", `PID ${pid} 現在是另一個行程（${id.info.name}，啟動 ${new Date(id.info.startMs).toISOString()}，登記時 ${new Date(entry.startMs).toISOString()}）`);
    if (PROTECTED_NAMES.has(String(id.info.name || "").toLowerCase())) return refuse("protected_name", `${id.info.name} 是系統保護行程`);
    let snap0 = []; try { snap0 = probe.snapshot(); } catch { /* 查不到就只靠 assertSafePid 的父行程檢查 */ }
    if (ancestorsOf(process.pid, snap0).has(pid)) return refuse("pid_ancestor", `PID ${pid} 是本行程的祖先（父、祖父…）`);
    log({ event: "terminate-begin", pid, startMs: entry.startMs, name: id.info.name, commandLine: id.info.commandLine, reason });

    // 0) 先列出已確認的後代：Windows 上結束父行程不會帶走子行程，等父行程不在了就找不到它們了
    // 同一份快照同時用於祖先檢查與後代列舉（少一次系統查詢：終止要快，否則被終止的行程會多跑一段）
    const tree = includeDescendants ? descendantsOf(id.info, snap0) : [];
    log({ event: "tree", pid, descendants: tree.map((p) => ({ pid: p.pid, name: p.name, startMs: p.startMs })) });
    const stillSame = (p) => { const now = probe.info(p.pid); return !!now && sameStart(now.startMs, p.startMs) && (now.commandLine ?? null) === (p.commandLine ?? null); };

    // 1) 正常關閉
    const handle = handles.get(`${entry.pid}@${entry.startMs}`);
    try { if (graceful) await graceful(); else if (handle && handle.exitCode === null && handle.signalCode === null) handle.kill(); } catch (e) { log({ event: "graceful-error", pid, detail: String(e.message || e) }); }
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline) { if (identify(entry).state !== "same" && !tree.some(stillSame)) break; await sleep(150); }
    if (identify(entry).state !== "same" && !tree.some(stillSame)) { log({ event: "released", pid, startMs: entry.startMs, why: "graceful" }); return { result: "terminated", detail: "正常關閉", killed: [] }; }

    // 2) 強制：由葉到根，逐一再確認身分後單獨終止（不用 /T）
    const killed = forceKill(probe, [...tree.sort((a, b) => b.depth - a.depth), { ...id.info, depth: 0, root: true }], (ev) => log(ev));
    await sleep(200);
    const still = identify(entry).state === "same" || tree.some(stillSame);
    log({ event: still ? "terminate-unconfirmed" : "released", pid, startMs: entry.startMs, why: "forced" });
    return { result: still ? "refused" : "terminated", code: still ? "still_alive" : undefined, detail: still ? "強制終止後仍存活" : `強制終止 ${killed.length} 個行程（含已確認的後代）`, killed };
  }

  return { taskId, file, register, terminate, entries, identify, stale };
}

/**
 * 強制終止一串已確認身分的行程（由葉到根）。probe 有 killVerified（真實 OS）⇒ 一次「開控制代碼→驗身分→同一控制代碼終止」，
 * 沒有（測試的假探針）⇒ 逐一重驗後 kill。回傳 killed[]。
 */
function forceKill(probe, list, log = () => {}) {
  const safe = list.filter((p) => { try { assertSafePid(p.pid); return true; } catch { return false; } });
  const killed = [];
  if (typeof probe.killVerified === "function") {
    const res = probe.killVerified(safe.map((p) => ({ pid: p.pid, startMs: p.startMs, commandLine: p.commandLine })));
    for (const p of safe) {
      const r = res.find((x) => x.pid === p.pid) || { result: "error", detail: "沒有結果" };
      if (r.result === "changed") { log({ event: "skip-changed", pid: p.pid }); continue; }
      if (r.result === "gone") continue;
      killed.push({ pid: p.pid, name: p.name, ok: r.result === "killed", root: !!p.root });
      log({ event: "kill", pid: p.pid, name: p.name, startMs: p.startMs, commandLine: p.commandLine, ok: r.result === "killed", detail: r.detail, verified: "handle" });
    }
    return killed;
  }
  for (const p of safe) {
    const now = probe.info(p.pid);
    if (!now) continue;
    if (!sameStart(now.startMs, p.startMs) || (now.commandLine ?? null) !== (p.commandLine ?? null)) { log({ event: "skip-changed", pid: p.pid }); continue; }
    const k = probe.kill(p.pid);
    killed.push({ pid: p.pid, name: p.name, ok: k.ok, root: !!p.root });
    log({ event: "kill", pid: p.pid, name: p.name, startMs: p.startMs, commandLine: p.commandLine, ok: k.ok, detail: k.detail });
  }
  return killed;
}

/**
 * 給「手上有自己剛啟動的行程、但沒有登記簿」的舊呼叫端（browser harness、cdp、舊 gate 的 preview）用的樹狀終止。取代 `taskkill /T`。
 * 根行程的歸屬證據（2026-11-26 S1.1 第二輪審查加強；「比本行程晚啟動」不再單獨足夠）：
 *   ① OS 回報的父行程必須正是本行程（parentPid，預設 process.pid）——本行程活著時它的 PID 不會被重用，
 *      所以「父行程＝我」＋「在我之後啟動」只可能是自己啟動的子行程。使用者在測試開始後才開的 Chrome 父行程是 explorer ⇒ 拒絕。
 *   ② 啟動時間不早於本行程（notBeforeMs）：擋掉「父行程 PID 剛好被重用成我」的孤兒。
 *   ③ 有 expectArgs（ChildProcess.spawnargs）時命令列必須含其中最長的一個參數。
 *   ④ 不是系統保護名稱、不是本行程的祖先。
 * 後代：每層「父行程在樹內、子行程啟動時間 ≥ 父行程」，排除祖先與保護名稱；由葉到根經 forceKill（Windows：控制代碼驗證）逐一終止。
 * 不能確認歸屬 ⇒ refused（寧可留下行程並回報，也不要誤殺）。
 * 回傳 { result: "terminated"|"already-exited"|"refused", code?, detail?, killed: [...] }
 */
export async function terminateLiveTree(pid, { probe = osProbe, expectArgs = null, notBeforeMs = null, parentPid = process.pid } = {}) {
  try { assertSafePid(pid); } catch (e) { return { result: "refused", code: e.code, detail: e.message, killed: [] }; }
  const root = probe.info(pid);
  if (!root) return { result: "already-exited", killed: [] };
  if (PROTECTED_NAMES.has(String(root.name || "").toLowerCase())) return { result: "refused", code: "protected_name", detail: root.name, killed: [] };
  if (root.ppid !== parentPid) return { result: "refused", code: "not_our_child", detail: `PID ${pid}（${root.name}）的父行程是 ${root.ppid}，不是本行程 ${parentPid}：無法證明是自己啟動的（使用者自己開的程式？）`, killed: [] };
  const nb = Number.isFinite(notBeforeMs) ? notBeforeMs : selfStartMs(probe);
  if (!Number.isFinite(root.startMs) || root.startMs + START_TOLERANCE_MS < nb) return { result: "refused", code: "started_before_owner", detail: `PID ${pid}（${root.name}）比呼叫端更早啟動，不可能是自己啟動的行程（PID 被重用？）`, killed: [] };
  const hint = (expectArgs || []).slice(1).map(String).filter((s) => s.length >= 8).sort((a, b) => b.length - a.length)[0];
  if (hint && !String(root.commandLine || "").includes(hint)) return { result: "refused", code: "cmd_mismatch", detail: `PID ${pid} 的命令列不含啟動參數，不是自己啟動的那個行程`, killed: [] };
  const snap = probe.snapshot(); const byParent = new Map();
  for (const p of snap) { if (!byParent.has(p.ppid)) byParent.set(p.ppid, []); byParent.get(p.ppid).push(p); }
  const anc = ancestorsOf(process.pid, snap);
  if (anc.has(pid)) return { result: "refused", code: "pid_ancestor", detail: `PID ${pid} 是本行程的祖先`, killed: [] };
  const tree = []; const seen = new Set([root.pid, process.pid, ...anc]);
  const walk = (parent, depth) => { for (const c of byParent.get(parent.pid) || []) { if (seen.has(c.pid) || c.pid <= 4 || PROTECTED_NAMES.has(String(c.name || "").toLowerCase())) continue; if (!(Number.isFinite(c.startMs) && c.startMs + START_TOLERANCE_MS >= parent.startMs)) continue; seen.add(c.pid); walk(c, depth + 1); tree.push({ ...c, depth }); } };
  walk(root, 1);
  const killed = forceKill(probe, [...tree.sort((a, b) => b.depth - a.depth), { ...root, depth: 0, root: true }]);
  await sleep(150);
  const still = !!probe.info(pid) && sameStart(probe.info(pid)?.startMs, root.startMs);
  return { result: still ? "refused" : "terminated", code: still ? "still_alive" : undefined, killed };
}

/** 唯讀：誰在 Listen 這個埠。只回 State=Listen 且 PID > 4 的那幾筆。這裡刻意沒有任何終止功能。 */
export function listenersOnPort(port) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new UnsafeProcessError("bad_port", `埠號「${port}」不合法`);
  if (process.platform !== "win32") return [];
  const rows = psJson(`Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 } | ForEach-Object { [pscustomobject]@{ pid=[int]$_.OwningProcess; addr=$_.LocalAddress } } | ConvertTo-Json -Compress`);
  return rows.filter((r) => Number(r.pid) > 4).map((r) => ({ pid: Number(r.pid), address: r.addr, informationalOnly: true }));
}
