#!/usr/bin/env node
// ============================================================================
//  tools/check_safe_process.mjs — tools/lib/safeProcess.mjs 的正向／反向測試
//
//    node tools/check_safe_process.mjs
//
//  ⚠ 絕不對 PID 0、系統行程或使用者的應用程式做真正的終止測試：
//    反向案例全部用「假的 OS 探針」（記錄有沒有被呼叫 kill），
//    真實終止只對本測試自己剛啟動的無害 node 子行程（setInterval 空轉）。
// ============================================================================
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SP = await import(pathToFileURL(path.join(HERE, "lib", "safeProcess.mjs")).href);
let pass = 0, fail = 0; const fails = [];
const ck = (name, ok, detail = "") => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; fails.push(name); console.log(`❌ ${name}${detail ? "　" + String(detail).slice(0, 400) : ""}`); } };
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "esmo-sp-"));
const ownChildren = [];
process.on("exit", () => {
  for (const c of ownChildren) { try { if (c.exitCode === null) c.kill(); } catch { /* 已結束 */ } }
  if (path.basename(DIR).startsWith("esmo-sp-")) { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* 暫存區 */ } }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { return e.code === code; } };

// ── 假的 OS：記錄每一次 kill ─────────────────────────────────────────────
function fakeOs(procs) {
  const table = new Map(procs.map((p) => [p.pid, { ...p, alive: true }])); const kills = [];
  return {
    kills, table,
    probe: {
      info: (pid) => { const p = table.get(pid); return p && p.alive ? { pid: p.pid, ppid: p.ppid, name: p.name, startMs: p.startMs, commandLine: p.commandLine } : null; },
      snapshot: () => [...table.values()].filter((p) => p.alive).map((p) => ({ pid: p.pid, ppid: p.ppid, name: p.name, startMs: p.startMs, commandLine: p.commandLine })),
      kill: (pid) => { SP.assertSafePid(pid); kills.push(pid); const p = table.get(pid); if (p) p.alive = false; return { ok: true }; },
    },
  };
}
const T0 = Date.parse("2026-11-26T00:00:00Z");
const P = (pid, ppid, name, dt, cmd) => ({ pid, ppid, name, startMs: T0 + dt * 1000, commandLine: cmd ?? `${name} --task ${pid}` });

// ═══ 1. PID 基本防護 ═══════════════════════════════════════════════════
ck("PID 0 拒絕（pid_reserved）", throwsCode(() => SP.assertSafePid(0), "pid_reserved"));
ck("PID 4（System）拒絕", throwsCode(() => SP.assertSafePid(4), "pid_reserved"));
ck("負數 PID 拒絕", throwsCode(() => SP.assertSafePid(-1), "pid_reserved"));
ck("非整數 PID（1.5、NaN、字串）拒絕", ["1.5", NaN, "123"].every((x) => throwsCode(() => SP.assertSafePid(x === "1.5" ? 1.5 : x), "pid_not_integer")));
ck("自己與父行程拒絕", throwsCode(() => SP.assertSafePid(process.pid), "pid_self") && throwsCode(() => SP.assertSafePid(process.ppid), "pid_parent"));
ck("真實 osProbe.kill(0) 在呼叫 taskkill 前就丟例外", throwsCode(() => SP.osProbe.kill(0), "pid_reserved"));
ck("模組沒有依名稱／依埠號／全部終止的 API", !Object.keys(SP).some((k) => /byName|byPort|killAll|killName|killPort/i.test(k)));
ck("不合法的 taskId 拒絕", throwsCode(() => SP.createProcessRegistry({ taskId: "../x", dir: DIR }), "bad_task_id"));

// ═══ 2. 假 OS：登記、身分、行程樹 ═══════════════════════════════════════
{
  const f = fakeOs([P(1000, 900, "node.exe", 0), P(1001, 1000, "chrome.exe", 1), P(1002, 1001, "chrome.exe", 2), P(1003, 1000, "notepad.exe", -50, "notepad 使用者的"), P(1004, 1000, "conhost.exe", 1), P(5000, 1, "chrome.exe", -999, "使用者的 Chrome"), P(900, 1, "node.exe", -10)]);
  const reg = SP.createProcessRegistry({ taskId: "fake-a", dir: DIR, probe: f.probe });
  const e = reg.register(1000, { label: "gate root" });
  ck("登記記下 PID、啟動時間、命令列、工作區", e.pid === 1000 && e.startMs === T0 && e.commandLine === "node.exe --task 1000" && path.isAbsolute(e.workspace));
  const r0 = await reg.terminate(0); ck("terminate(0) ⇒ refused pid_reserved，沒有呼叫 kill", r0.result === "refused" && r0.code === "pid_reserved" && f.kills.length === 0);
  const r1 = await reg.terminate(5000); ck("未登記的行程（使用者的 Chrome）⇒ refused not_registered，沒有呼叫 kill", r1.result === "refused" && r1.code === "not_registered" && f.kills.length === 0);
  const other = SP.createProcessRegistry({ taskId: "fake-b", dir: DIR, probe: f.probe });
  const r2 = await other.terminate(1000); ck("別的任務登記的行程 ⇒ refused not_registered", r2.result === "refused" && r2.code === "not_registered" && f.kills.length === 0);
  const r3 = await reg.terminate(1000, { graceMs: 50 });
  ck("強制終止：由葉到根 1002→1001→1000", JSON.stringify(f.kills) === "[1002,1001,1000]", JSON.stringify(f.kills));
  ck("啟動時間早於父行程的「假子行程」（PID 重用）不被終止", f.table.get(1003).alive);
  ck("系統保護名稱的子行程不被終止", f.table.get(1004).alive);
  ck("使用者的 Chrome 與父行程都還活著", f.table.get(5000).alive && f.table.get(900).alive);
  ck("結果為 terminated，列出被終止的 3 個行程", r3.result === "terminated" && r3.killed.length === 3);
  const log = fs.readFileSync(reg.file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  ck("清理紀錄有 register／tree／kill／released，且被拒絕的也有紀錄", ["register", "tree", "kill", "released", "refused"].every((ev) => log.some((x) => x.event === ev)) && log.filter((x) => x.event === "kill").every((x) => x.commandLine));
  const r4 = await reg.terminate(1000); ck("已釋放的登記不能再終止（not_registered）", r4.result === "refused" && r4.code === "not_registered");
}
{
  const f = fakeOs([P(2000, 1, "node.exe", 0)]);
  const reg = SP.createProcessRegistry({ taskId: "fake-reuse", dir: DIR, probe: f.probe });
  reg.register(2000);
  f.table.set(2000, { ...P(2000, 1, "chrome.exe", 600, "使用者的 Chrome"), alive: true });
  const r = await reg.terminate(2000); ck("PID 被系統重複使用（啟動時間不同）⇒ refused pid_reused，沒有呼叫 kill", r.result === "refused" && r.code === "pid_reused" && f.kills.length === 0, JSON.stringify(r));
  f.table.set(2000, { ...P(2000, 1, "node.exe", 0, "node 另一個指令"), alive: true });
  const r2 = await reg.terminate(2000); ck("同 PID 同啟動時間但命令列不同 ⇒ refused pid_reused", r2.result === "refused" && r2.code === "pid_reused" && f.kills.length === 0);
}
{
  const f = fakeOs([P(3000, 1, "node.exe", 0)]);
  const reg = SP.createProcessRegistry({ taskId: "fake-gone", dir: DIR, probe: f.probe });
  reg.register(3000); f.table.get(3000).alive = false;
  const r = await reg.terminate(3000); ck("已經結束的登記行程 ⇒ already-exited，不呼叫 kill", r.result === "already-exited" && f.kills.length === 0);
}
{
  const f = fakeOs([P(3100, 1, "node.exe", 0), P(3101, 3100, "node.exe", 1)]);
  const reg = SP.createProcessRegistry({ taskId: "fake-grace", dir: DIR, probe: f.probe });
  reg.register(3100);
  const r = await reg.terminate(3100, { graceful: async () => { f.table.get(3101).alive = false; f.table.get(3100).alive = false; }, graceMs: 500 });
  ck("正常關閉成功時不強制終止（graceful 優先）", r.result === "terminated" && r.detail === "正常關閉" && f.kills.length === 0);
}
{
  const f = fakeOs([P(3200, 1, "node.exe", 0), P(3201, 3200, "node.exe", 1)]);
  const reg = SP.createProcessRegistry({ taskId: "fake-orphan", dir: DIR, probe: f.probe });
  reg.register(3200);
  const r = await reg.terminate(3200, { graceful: async () => { f.table.get(3200).alive = false; }, graceMs: 200 });
  ck("正常關閉只結束父行程時，事先列出的後代仍會被清掉（不留孤兒）", r.result === "terminated" && f.kills.includes(3201) && !f.kills.includes(3200), JSON.stringify(f.kills));
}
{
  const f = fakeOs([P(4000, 1, "csrss.exe", 0)]);
  const reg = SP.createProcessRegistry({ taskId: "fake-prot", dir: DIR, probe: f.probe });
  ck("系統保護名稱的行程不能登記", throwsCode(() => reg.register(4000), "protected_name"));
}
{
  const f = fakeOs([P(4100, 1, "node.exe", 0)]);
  SP.createProcessRegistry({ taskId: "fake-session", dir: DIR, probe: f.probe }).register(4100);
  const again = SP.createProcessRegistry({ taskId: "fake-session", dir: DIR, probe: f.probe });
  const r = await again.terminate(4100, { graceMs: 50 });
  ck("跨 Session：同任務 ID 重新載入登記簿後可以清理（Claude Code 中斷後）", r.result === "terminated" && f.kills.includes(4100));
}

// ═══ 2b. terminateLiveTree（browser harness／cdp 取代 taskkill /T）════════════
{
  const nb = T0 + 100 * 1000; // 呼叫端（gate）在 T0+100s 啟動
  const f = fakeOs([P(6000, 1, "chrome.exe", -3600, "使用者的 Chrome --user-data-dir=C:\\Users\\me"), P(6001, 6000, "chrome.exe", -3500, "使用者的分頁")]);
  const r = await SP.terminateLiveTree(6000, { probe: f.probe, notBeforeMs: nb });
  ck("terminateLiveTree：比 gate 更早啟動的行程（使用者的 Chrome，PID 被重用的情境）⇒ refused，不呼叫 kill", r.result === "refused" && r.code === "started_before_owner" && f.kills.length === 0, JSON.stringify(r));
  const g = fakeOs([P(7000, 1, "chrome.exe", 200, "chrome.exe --user-data-dir=C:\\Temp\\esmo-gate-profile-1 --remote-debugging-port=0")]);
  const r2 = await SP.terminateLiveTree(7000, { probe: g.probe, notBeforeMs: nb, expectArgs: ["chrome.exe", "--user-data-dir=C:\\Temp\\esmo-gate-profile-OTHER"] });
  ck("terminateLiveTree：命令列不含自己的啟動參數 ⇒ refused cmd_mismatch", r2.result === "refused" && r2.code === "cmd_mismatch" && g.kills.length === 0);
  const h = fakeOs([P(8000, 1, "chrome.exe", 200, "chrome.exe --user-data-dir=C:\\Temp\\esmo-gate-profile-1"), P(8001, 8000, "chrome.exe", 201), P(8002, 8000, "chrome.exe", 50, "PID 重用：比父行程早啟動")]);
  const r3 = await SP.terminateLiveTree(8000, { probe: h.probe, notBeforeMs: nb, expectArgs: ["chrome.exe", "--user-data-dir=C:\\Temp\\esmo-gate-profile-1"] });
  ck("terminateLiveTree：自己的 Chrome 樹由葉到根逐一終止；比父行程早啟動的「假子行程」不動", r3.result === "terminated" && JSON.stringify(h.kills) === "[8001,8000]" && h.table.get(8002).alive, JSON.stringify(h.kills));
  ck("terminateLiveTree：PID 0 ⇒ refused", (await SP.terminateLiveTree(0)).result === "refused");
  const src = ["browser/harness.mjs", "browser/cdp.mjs", "browser/run-gate.mjs", "lib/releaseGate.mjs"].map((f2) => fs.readFileSync(path.join(HERE, f2), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n"));
  ck("原始碼：harness／cdp／run-gate／Release Gate 已沒有 taskkill /T（註解除外）", !src.some((t) => /["']\/T["']/.test(t)));
}

// ═══ 3. 真實行程（只對自己剛啟動的無害 node 子行程）═════════════════════
const idle = () => { const c = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore", windowsHide: true }); ownChildren.push(c); return c; };
{
  const reg = SP.createProcessRegistry({ taskId: "real-1", dir: DIR });
  const c = idle(); await sleep(300);
  const e = reg.register(c, { label: "idle", expectCmdIncludes: "setInterval" });
  ck("真實：登記查得到 OS 的啟動時間與命令列", Number.isFinite(e.startMs) && /setInterval/.test(e.commandLine || ""), JSON.stringify(e));
  const r = await reg.terminate(c.pid, { graceMs: 2000 });
  await sleep(300);
  ck("真實：登記過的無害子行程被終止", r.result === "terminated" && !SP.osProbe.alive(c.pid), JSON.stringify(r));
}
{
  const reg = SP.createProcessRegistry({ taskId: "real-2", dir: DIR });
  const parent = spawn(process.execPath, ["-e", "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)"], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  ownChildren.push(parent);
  const grandPid = await new Promise((res) => { parent.stdout.once("data", (d) => res(Number(String(d).trim()))); setTimeout(() => res(null), 5000); });
  await sleep(300);
  reg.register(parent);
  const r = await reg.terminate(parent.pid, { graceMs: 500 });
  await sleep(500);
  ck("真實：行程樹（父＋孫）都被終止，不留孤兒", r.result === "terminated" && grandPid && !SP.osProbe.alive(grandPid) && !SP.osProbe.alive(parent.pid), JSON.stringify({ r, grandPid }));
}
{
  const c = idle(); await sleep(300);
  const r = await SP.terminateLiveTree(c.pid, { expectArgs: c.spawnargs });
  await sleep(300);
  ck("真實：terminateLiveTree 終止自己剛啟動的無害子行程", r.result === "terminated" && !SP.osProbe.alive(c.pid), JSON.stringify(r));
}
{
  const reg = SP.createProcessRegistry({ taskId: "real-3", dir: DIR });
  const c = idle(); await sleep(300);
  const r = await reg.terminate(c.pid);
  ck("真實：沒登記的行程（即使是自己啟動的）一律拒絕，行程仍存活", r.result === "refused" && r.code === "not_registered" && SP.osProbe.alive(c.pid));
  c.kill();
}
{
  // 整合：Release Gate 的 runCommand 逾時 ⇒ 經由登記簿終止整棵樹（shell → node → 孫 node）
  const RG = await import(pathToFileURL(path.join(HERE, "lib", "releaseGate.mjs")).href);
  const pidFile = path.join(DIR, "grand.pid");
  const script = path.join(DIR, "tree.mjs");
  fs.writeFileSync(script, `import { spawn } from "node:child_process"; import fs from "node:fs"; const c = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" }); fs.writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(() => {}, 1000);\n`);
  const reg = SP.createProcessRegistry({ taskId: "real-rg", dir: DIR, workspace: DIR });
  const r = await RG.runCommand(`node "${script}"`, { cwd: DIR, env: process.env, timeoutMs: 2500, echo: false, registry: reg });
  await sleep(500);
  const grand = Number(fs.readFileSync(pidFile, "utf8"));
  ck("整合：Release Gate 指令逾時 ⇒ 透過登記簿終止整棵樹（含孫行程），結果標為逾時", r.timedOut && r.kill?.result === "terminated" && grand > 4 && !SP.osProbe.alive(grand), JSON.stringify({ kill: r.kill, grand, alive: SP.osProbe.alive(grand) }));
  const ev = fs.readFileSync(reg.file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  ck("整合：紀錄裡有 shell、node、孫行程的逐一終止", ev.filter((x) => x.event === "kill").length >= 2 && ev.some((x) => x.event === "tree"), JSON.stringify(ev.map((x) => x.event)));
}
{
  // 整合：browser gate supervisor（tools/browser/run-gate.mjs）總時限逾時 ⇒ 經由登記簿終止 gate 與它的孫行程，exit 2
  const pidFile = path.join(DIR, "rg-grand.pid"); const gateFile = path.join(DIR, "hang_gate.mjs");
  fs.writeFileSync(gateFile, `import { spawn } from "node:child_process"; import fs from "node:fs"; const c = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" }); fs.writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(() => {}, 1000);\n`);
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [path.join(HERE, "browser", "run-gate.mjs"), gateFile, "--timeout", "4000"], { encoding: "utf8", timeout: 90000, cwd: DIR });
  await sleep(500);
  const grand = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf8")) : null;
  ck("整合：run-gate 逾時 ⇒ exit 2（HARNESS_FAIL），gate 與孫行程都經登記簿終止", r.status === 2 && /"result":"terminated"/.test(r.stdout) && grand > 4 && !SP.osProbe.alive(grand), (r.stdout || "").slice(-400) + ` grand=${grand}`);
}
if (process.platform === "win32") {
  const srv = spawn(process.execPath, ["-e", "const s=require('http').createServer(()=>{}).listen(0,'127.0.0.1',()=>console.log(s.address().port));"], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  ownChildren.push(srv);
  const port = await new Promise((res) => { srv.stdout.once("data", (d) => res(Number(String(d).trim()))); setTimeout(() => res(null), 5000); });
  const ls = port ? SP.listenersOnPort(port) : [];
  ck("埠號查詢只回 Listen 且 PID > 4，標記為唯讀資訊，且不終止任何行程", ls.length >= 1 && ls.every((x) => x.pid > 4 && x.informationalOnly) && ls.some((x) => x.pid === srv.pid) && SP.osProbe.alive(srv.pid), JSON.stringify({ port, ls }));
  srv.kill();
}
void http;

console.log(`\nSafe process（行程安全）：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
if (fail) console.log("失敗：" + fails.join("；"));
process.exit(fail ? 1 : 0);
