#!/usr/bin/env node
// ============================================================================
//  tools/browser/run-gate.mjs — Browser Harness v1：外層 supervisor
//
//  用法：
//    node tools/browser/run-gate.mjs <gate.mjs 路徑> [--timeout ms] [-- 傳給 gate 的參數...]
//
//  ── 為什麼需要一個獨立的 process，不能只在 gate 自己裡面設 timeout ────────
//  `harness.mjs` 的 `runGate()` 已經有一個 in-process 的軟總時限
//  （`Promise.race` 對 `sleep(timeoutMs)`）。那個機制在**大多數**情況下有效，
//  但治不好事故①的根因：Windows 的 `taskkill`（或任何同步系統呼叫）一旦真的
//  卡住，會鎖死呼叫它的 Node process 的**整個事件迴圈**——鎖死之後，連
//  `setTimeout` 排的計時器都不會再被觸發。換句話說：**卡在同一個 process
//  裡的東西，沒有辦法靠同一個 process 裡的計時器把自己救出來。**
//
//  唯一可靠的解法是「外部行程盯著」：這支檔案把 gate 腳本當**真正的子行程**
//  跑起來，自己的計時器活在**另一個** process、**另一個**事件迴圈裡——子行程
//  內部再怎麼卡，都不會影響這支 supervisor 自己的計時器準時觸發。逾時了，
//  supervisor 直接把子行程的整棵 process tree 砍掉（`taskkill /T /F` 在這裡
//  也可能卡住，但那沒關係——卡住的是 supervisor 自己"嘗試砍"的那個動作，
//  supervisor 給它一個短逾時，逾時就放棄並回報，不會讓整支 supervisor 也跟著
//  卡住；最壞情況下 supervisor 仍會在自己的時限內结束並回報 HARNESS_FAIL）。
//
//  這是「4. Total Timeout：即使測試已 PASS 但 cleanup 卡住，也必須能結束」
//  唯一站得住腳的實作方式——不是這支檔案想把設計做複雜，是需求本身要求
//  一個獨立 process 才做得到。
//
//  ⚠ 這支不驗證任何產品行為，只負責「幫子行程的總執行時間畫一條硬線」。
// ============================================================================
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const DEFAULT_TIMEOUT_MS = 600_000; // 10 分鐘：比目前最重的 gate（C5C 三張圖）留寬裕

function parseArgs(argv) {
  const args = argv.slice(2);
  const dashDash = args.indexOf("--");
  const own = dashDash === -1 ? args : args.slice(0, dashDash);
  const passthrough = dashDash === -1 ? [] : args.slice(dashDash + 1);

  const gatePath = own.find((a) => !a.startsWith("--"));
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const ti = own.indexOf("--timeout");
  if (ti !== -1 && own[ti + 1]) {
    const n = Number(own[ti + 1]);
    if (Number.isFinite(n) && n > 0) timeoutMs = n;
  }
  return { gatePath, timeoutMs, passthrough };
}

/** PID 現在還在不在——不猜殺手行程的 exit code 意義，直接探測目標本身。 */
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

async function killTreeBounded(pid, timeoutMs) {
  if (pid == null) return { confirmed: true, timedOut: false };
  if (process.platform !== "win32") {
    try { process.kill(-pid, "SIGKILL"); return { confirmed: !pidAlive(pid), timedOut: false }; }
    catch (e) { return { confirmed: !pidAlive(pid), timedOut: false, error: String(e?.message ?? e) }; }
  }
  return await new Promise((res) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    killer.unref(); // 這個幫手行程不該讓 supervisor 自己也拖著不退出
    const timer = setTimeout(() => {
      try { killer.kill(); } catch { /* 放棄，回報未確認 */ }
      res({ confirmed: !pidAlive(pid), timedOut: true });
    }, timeoutMs);
    killer.once("exit", () => {
      clearTimeout(timer);
      res({ confirmed: !pidAlive(pid), timedOut: false });
    });
    killer.once("error", () => {
      clearTimeout(timer);
      res({ confirmed: !pidAlive(pid), timedOut: false });
    });
  });
}

async function main() {
  const { gatePath, timeoutMs, passthrough } = parseArgs(process.argv);
  if (!gatePath) {
    console.error("用法：node tools/browser/run-gate.mjs <gate.mjs> [--timeout ms] [-- gate 參數...]");
    process.exit(2);
  }
  const abs = resolve(gatePath);
  const startedAt = Date.now();

  //  ⚠ `detached:true`＋自己的 process group：子行程若又轉手 spawn 出
  //    vite／Chrome（它們是子行程的子行程，不是這支 supervisor 的直接子行程），
  //    Windows 的 `taskkill /T` 從子行程的 PID 往下砍整棵樹，含這些孫行程。
  const child = spawn(process.execPath, [abs, ...passthrough], {
    stdio: "inherit", windowsHide: true,
  });

  let timedOut = false;
  const timer = setTimeout(async () => {
    timedOut = true;
    console.log(`\n❌ HARNESS_FAIL｜supervisor 總時限逾時（${timeoutMs}ms），強制終止子行程樹（pid=${child.pid}）`);
    const r = await killTreeBounded(child.pid, 8_000);
    console.log(`   kill 結果：${JSON.stringify(r)}`);
  }, timeoutMs);

  const exitCode = await new Promise((res) => {
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      res(timedOut ? 2 : (code ?? (signal ? 2 : 0)));
    });
    child.once("error", (e) => {
      clearTimeout(timer);
      console.log(`\n❌ HARNESS_FAIL｜supervisor 無法啟動子行程：${e.message}`);
      res(2);
    });
  });

  const elapsedMs = Date.now() - startedAt;
  if (timedOut) {
    console.log(`supervisor：逾時終止，耗時 ${elapsedMs}ms（timeout=${timeoutMs}ms）`);
  }
  process.exit(exitCode);
}

main();
