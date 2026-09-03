// ============================================================================
//  tools/browser/harness.mjs — Browser Harness v1（可靠性層，蓋在 cdp.mjs 之上）
//
//  ── 這一支存在的理由：三起真實事故，不是預防性工程 ─────────────────────────
//  2026-09-03 Club Identity v2 release 當輪：
//    ① `browser_check_club_mastery_ui` 印出 `68/68 PASS` 後卡在收尾近一小時。
//       根因追到：`server?.close?.()`——`startDevServer()` 回傳的物件只有
//       `.stop`，沒有 `.close`。`undefined?.()` 靜默短路，dev server **從來
//       沒被真的關過**，每次跑都在洩漏行程（`browser_check_club_identity_ui`
//       同一個 typo）。另一半（Chrome 收尾）卡在 `cdp.mjs` 的
//       `spawnSync("taskkill", ...)`——**沒有 timeout 參數**，一旦 taskkill
//       本身卡住，`spawnSync` 會整個鎖死 Node 的事件迴圈，連 `setTimeout`
//       都不會再觸發。這是為什麼「只在同一個 process 裡加 timeout」治不好
//       這個病：卡住的是事件迴圈本身。
//    ② 終止上一個卡住的行程那瞬間（機器只剩 ~4GB／19.84GB 可用記憶體），
//       `browser_check_cs_c5c_presentation` 以 `mirage Battle mount timeout`
//       失敗；乾淨環境隔離重跑：三張圖 `completed:true`、`exit=0`。
//       ⇒ 這是 HARNESS_FAIL（資源尖峰造成的一次性逾時），不是 PRODUCT_FAIL，
//       但當時的 gate 輸出把它跟真正的產品斷言混在同一組 pass/fail 計數裡，
//       兩者從輸出上完全分不出來。
//    ③ Sprint 紀錄裡本來就記著「port 重複、cleanup 無 timeout」是已知風險
//       （`08_目前待辦與風險.md`）——這三件事合起來，才是這支檔案存在的理由。
//
//  ── 設計回應 ────────────────────────────────────────────────────────────
//  1. **Unique Port**：`allocatePort()` 問 OS 要一個目前空的 port（bind 0 號
//     port 讀出實際配到的號碼），不再用寫死的 5180／5383 之類。
//  2. **Process Ownership**：每次 `runGate()` 產生一個 `ownership` 物件，
//     只記錄「這次呼叫自己起的」PID（vite、Chrome）。清理只清這些 PID，
//     不掃描、不用行程名稱猜、不動使用者的 Chrome／Codex／其他 gate。
//  3. **Startup Timeout**：dev server／Chrome／CDP 三段各自有上限
//     （見 `DEFAULT_TIMEOUTS`），逾時直接判 `HARNESS_FAIL`，不無限等。
//  4. **Total Timeout**：`runGate()` 自己的 `timeoutMs` 是 best-effort
//     （`Promise.race`，在事件迴圈沒被同步呼叫卡住的一般情況下有效）。
//     **真正的硬保證在 `run-gate.mjs`**——外層 supervisor 是獨立 process，
//     它的計時器不會被子行程內部卡住的同步呼叫影響，逾時直接砍掉整棵
//     process tree。這支檔案負責「盡量正常結束」，`run-gate.mjs` 負責
//     「保證一定結束」。
//  5. **Liveness 分類**：`run()` 內部的 `ck()` 只累計**產品斷言**；任何
//     從 `run()` 逃出來的例外（CDP 斷線、evaluate 逾時、Chrome crash、
//     gate 腳本自己的 bug）一律是 `HARNESS_FAIL`，**不會**被灌進產品的
//     pass/fail 計數——這是修 ② 那個事故的直接對策。
//  6. **finally Cleanup**：PASS／PRODUCT_FAIL／HARNESS_FAIL／timeout 四種
//     結局都走同一段 cleanup，每一步各自有時限、各自 best-effort，一步卡住
//     不擋下一步。
//  7. **Result Classification**：`runGate()` 回傳
//     `{ verdict: "PASS"|"PRODUCT_FAIL"|"HARNESS_FAIL", ... }` 並以三種
//     不同 exit code（0／1／2）結束，不必解析文字就分得出來。
//  8. **Evidence**：一份精簡的 JSON 印到 stdout（port、PID、耗時、失敗
//     phase、cleanup 結果）。不預設寫永久檔案——避免第 8 條「不要產生大量
//     永久 evidence 垃圾」；呼叫端要留檔就自己接 `--evidence-out`。
//
//  ⚠ 這支不改任何遊戲產品行為，只改「怎麼跑瀏覽器驗證」。
// ============================================================================
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VITE_CLI = resolve(ROOT, "node_modules/vite/bin/vite.js");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
].filter(Boolean);

export const DEFAULT_TIMEOUTS = Object.freeze({
  devServerStartMs: 90_000,
  chromeTargetMs: 30_000,
  wsOpenMs: 15_000,
  killConfirmMs: 6_000,
  profileRemoveMs: 10_000,
  //  ⚠ 這是 in-process 的軟上限（見檔頭 §4）。硬上限在 `run-gate.mjs`。
  //
  //  ⚠ **這個預設值要比最重的 gate 寬裕**。第一版設 300_000（5 分）就踩到：
  //    `browser_check_cs_c6c_progress` 本來就要跑 ~280 秒（完整 BO1 練習賽
  //    ＋ BO3 系列賽的真實 simulation），在稍慢的一次執行直接撞上軟上限，
  //    被判成 `HARNESS_FAIL`——**產品完全沒問題（11/11 斷言全過），是我把
  //    上限設太緊**。分類機制當時正確地沒有誣賴產品，但門檻本身是錯的。
  //    重的 gate 應該自己傳 `timeoutMs`（C6C 就有），這裡的預設只是保底。
  totalMs: 600_000,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exited = (proc) => proc == null || proc.exitCode != null || proc.signalCode != null;

/** `run()` 裡的 infra 錯誤都包成這個類別，`runGate()` 用 `instanceof` 分類，不猜字串。 */
export class HarnessError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = "HarnessError";
  }
}

async function waitFor(fn, { timeoutMs = 30_000, everyMs = 250, what = "條件" } = {}) {
  const until = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < until) {
    try { const v = await fn(); if (v) return v; } catch (e) { lastErr = e; }
    await sleep(everyMs);
  }
  throw new HarnessError(`等待「${what}」逾時（${timeoutMs}ms）${lastErr ? `：${lastErr.message}` : ""}`);
}

/** 問 OS 要一個目前空的 port。有極小的 TOCTOU race（業界標準做法），
 *  真正佔用前 `startDevServer`/`launchChrome` 各自還會再 `isPortFree` 確認一次。
 *
 * ⚠ `unref()`：這個 server 只活一瞬間就會 `close()`，不該在那一瞬間
 *   計入「事件迴圈還有事要做」——不 unref 的話，在極端時序下（close 的
 *   callback 還沒觸發、process 卻已經想結束）它會被算進 active handles，
 *   拖長（不是卡死，但拖長）gate 印完結果後才真正退出的時間。 */
function allocatePort() {
  return new Promise((resolvePort, reject) => {
    const s = createServer();
    s.unref();
    s.once("error", reject);
    s.listen(0, () => {
      const { port } = s.address();
      s.close((err) => (err ? reject(err) : resolvePort(port)));
    });
  });
}

function isPortFree(port) {
  return new Promise((res) => {
    const s = createServer();
    s.unref();
    s.once("error", () => res(false));
    s.once("listening", () => s.close(() => res(true)));
    s.listen(port);
  });
}

/** PID 現在還在不在——不猜殺手行程的 exit code 意義，直接探測目標本身。 */
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

/**
 * 有時限、非同步（不用 `spawnSync`）的行程樹終止。
 *
 * ⚠ 這是修事故①的核心：舊版用 `spawnSync("taskkill", ...)` 沒帶 timeout，
 *   taskkill 卡住就等於整個 Node process 的事件迴圈被鎖死——`setTimeout`
 *   都不會再觸發，`Promise.race` 這種 in-process 的保護完全沒用。
 *   換成 `spawn`（非同步）＋自己的計時器，taskkill 卡住頂多是「這一步
 *   沒能確認」，不會拖垮呼叫它的 process 本身。
 *
 * ⚠ `confirmed` 不是猜 taskkill 的 exit code 代表什麼（實測：同一個成功案例
 *   在不同情境會回不同的碼，殺一棵含 Chrome 子行程樹時尤其不穩定）——kill
 *   完之後**直接探測目標 PID 還在不在**，這才是唯一誠實的答案。
 *
 * @returns {{confirmed:boolean, timedOut:boolean, error:string|null}}
 */
async function killProcessTree(pid, { timeoutMs = DEFAULT_TIMEOUTS.killConfirmMs } = {}) {
  if (pid == null) return { confirmed: true, timedOut: false, error: null };
  if (!pidAlive(pid)) return { confirmed: true, timedOut: false, error: null };
  try {
    if (process.platform === "win32") {
      const result = await new Promise((res) => {
        const child = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        child.unref(); // 幫手行程本身也不該拖著呼叫端的 process 不退出
        const timer = setTimeout(() => {
          //  taskkill 這個「幫手」行程本身卡住 ⇒ 放棄等它，回報未確認，
          //  不要對它再做任何同步等待。
          try { child.kill(); } catch { /* 盡力而為 */ }
          res({ confirmed: !pidAlive(pid), timedOut: true, error: null });
        }, timeoutMs);
        child.once("exit", (code) => {
          clearTimeout(timer);
          const alive = pidAlive(pid);
          res({ confirmed: !alive, timedOut: false, error: alive ? `taskkill exit=${code}，目標仍存活` : null });
        });
        child.once("error", (e) => {
          clearTimeout(timer);
          res({ confirmed: !pidAlive(pid), timedOut: false, error: e.message });
        });
      });
      return result;
    }
    process.kill(-pid, "SIGKILL");
    return { confirmed: !pidAlive(pid), timedOut: false, error: null };
  } catch (e) {
    //  ESRCH／找不到行程＝已經不在了，等同確認終止。
    if (String(e?.message ?? e).includes("ESRCH")) return { confirmed: true, timedOut: false, error: null };
    return { confirmed: !pidAlive(pid), timedOut: false, error: String(e?.message ?? e) };
  }
}

/** 先客氣地 `proc.kill()`，等一下；還在的話才動用 `killProcessTree`。 */
async function stopOwnedProcess(proc, { graceMs = 3_000, killMs = DEFAULT_TIMEOUTS.killConfirmMs } = {}) {
  //  ⚠ 這是修「gate 印完 PASS 卻還活著好幾分鐘」的地方——實測用
  //    `process._getActiveHandles()` 抓到：即使 vite／Chrome 都已經被
  //    `taskkill /F` 終止，殘留的 `ChildProcess` wrapper（Windows 上被強制
  //    終止的子行程，其 stdio pipe 不見得乾淨觸發 EOF）仍會被算進「事件
  //    迴圈還有事要做」，Node 要等自己的內部機制才會真的放手——不是死鎖，
  //    是拖長。`unref()` 是對的解法：明確告訴事件迴圈「這個 handle 不算」，
  //    我們自己已經用 `await` 追蹤過它的生死，不需要事件迴圈幫忙等。
  const release = () => {
    try { proc.unref?.(); } catch { /* 盡力而為 */ }
    try { proc.stdout?.destroy(); } catch { /* 盡力而為 */ }
    try { proc.stderr?.destroy(); } catch { /* 盡力而為 */ }
  };
  if (exited(proc)) { release(); return { confirmed: true, timedOut: false, error: null, forced: false }; }
  try { proc.kill(); } catch { /* 盡力而為 */ }
  const gracefulExit = await Promise.race([
    new Promise((res) => proc.once("exit", () => res(true))),
    sleep(graceMs).then(() => false),
  ]);
  if (gracefulExit || exited(proc)) { release(); return { confirmed: true, timedOut: false, error: null, forced: false }; }
  const forced = await killProcessTree(proc.pid, { timeoutMs: killMs });
  release();
  return { ...forced, forced: true };
}

/** 有時限的 profile 目錄清除；逾時就放棄，回報而不是掛住呼叫端。 */
async function removeProfileBounded(path, { timeoutMs = DEFAULT_TIMEOUTS.profileRemoveMs } = {}) {
  const until = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < until) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 });
      if (!existsSync(path)) return { removed: true, error: null };
    } catch (error) { lastError = error; }
    await sleep(300);
  }
  return { removed: false, error: lastError ? lastError.message : "timeout" };
}

/**
 * 起一個**獨立 port**（預設向 OS 要一個空的）的 vite dev server。
 * 回傳的 handle 帶 `pid`（Process Ownership 用）與有時限的 `stop()`。
 */
async function startOwnedDevServer({ port, base = "/ESMO-/", timeoutMs = DEFAULT_TIMEOUTS.devServerStartMs } = {}) {
  const p = port ?? await allocatePort();
  if (!(await isPortFree(p))) {
    throw new HarnessError(`port ${p} 已經有人在聽（allocatePort 給的號碼被搶走了，機率極低但不是零）`);
  }
  const url = `http://localhost:${p}${base}`;
  const proc = spawn(process.execPath, [VITE_CLI, "--port", String(p), "--strictPort"], {
    cwd: ROOT, stdio: "ignore", windowsHide: true,
  });
  //  ⚠ **不要在這裡 `proc.unref()`。** 實測（Node v24 / Windows）：unref 之後
  //    這個子行程的 `'exit'` 事件就不再送達，`stopOwnedProcess()` 等 exit 的
  //    await 會永遠不 settle（最小重現腳本直接以 exit code 13
  //    「unsettled top-level await」結束）。收尾要靠得住，就得留著它的 exit 事件。
  //    「gate 跑完卻不馬上退出」改用 `finishGate()` 明確結束（見該函式）。
  try {
    await waitFor(async () => {
      if (exited(proc)) throw new HarnessError(`Vite 提前退出（exit=${proc.exitCode}, signal=${proc.signalCode}）`);
      const res = await fetch(url);
      //  ⚠ **一定要排空 body**，否則 undici 不會把這個 keep-alive socket
      //    放回可回收狀態——起手 readiness 輪詢（250ms 一次）會在 dev server
      //    的 origin 上留下好幾個沒排空的連線，process 要等 undici 自己的
      //    keep-alive idle timeout（實測：幾分鐘等級）到了才會真的退出。
      //    這正是「gate 印完 PASS 卻遲遲不結束」的第二個根因（跟事故①的
      //    taskkill 卡死是兩回事，比較溫和——會自己好，但不該讓使用者等）。
      await res.arrayBuffer().catch(() => {});
      return res.ok;
    }, { timeoutMs, what: `dev server ${url}` });
  } catch (error) {
    await stopOwnedProcess(proc);
    throw error instanceof HarnessError ? error : new HarnessError(String(error?.message ?? error), { cause: error });
  }
  let stopped = false;
  return {
    url, port: p, pid: proc.pid,
    stop: async () => {
      if (stopped) return { confirmed: true, timedOut: false, error: null, forced: false };
      stopped = true;
      const r = await stopOwnedProcess(proc);
      //  port 真的釋放了才算數，但這一步本身也有時限，不無限等。
      try { await waitFor(() => isPortFree(p), { timeoutMs: 8_000, what: `dev server port ${p} 釋放` }); }
      catch { /* 記在 r 裡但不重丟——cleanup 階段一步卡住不擋下一步 */ }
      return r;
    },
  };
}

/**
 * 開一個獨立 profile、獨立 CDP port 的 Chrome。回傳 client 帶 `pid`
 * 與有時限的 `close()`。與 `cdp.mjs` 的 `launchChrome` 行為相同，
 * 差在：CDP port 預設用 `allocatePort()`、kill 路徑不用 `spawnSync`、
 * WebSocket 開啟也有明確逾時。
 */
async function launchOwnedChrome({ url, port, headless = true,
  targetTimeoutMs = DEFAULT_TIMEOUTS.chromeTargetMs, wsOpenMs = DEFAULT_TIMEOUTS.wsOpenMs } = {}) {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new HarnessError(`找不到 Chrome：${CHROME_CANDIDATES.join(" / ")}`);
  const cdpPort = port ?? await allocatePort();
  if (!(await isPortFree(cdpPort))) {
    throw new HarnessError(`Chrome CDP port ${cdpPort} 已經有人在聽（allocatePort 給的號碼被搶走了）`);
  }
  const userDataDir = mkdtempSync(join(tmpdir(), "esmo-cdp-"));
  const args = [
    `--remote-debugging-port=${cdpPort}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-background-networking", "--disable-sync",
    "--disable-features=Translate,SkiaGraphiteUsePersistentCache,GpuPersistentCache",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1280,900",
  ];
  if (headless) args.push("--headless=new", "--disable-gpu", "--disable-gpu-sandbox", "--no-sandbox");
  args.push(url);

  let stderrTail = "";
  const proc = spawn(exe, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  //  ⚠ 同 `startOwnedDevServer`：這裡也**不要** unref——unref 之後 `'exit'`
  //    事件不再送達，收尾就沒辦法確認 Chrome 真的關掉了。
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk) => { stderrTail = `${stderrTail}${chunk}`.slice(-4_000); });

  let client;
  try {
    const target = await waitFor(async () => {
      if (exited(proc)) throw new HarnessError(`Chrome 提前退出（exit=${proc.exitCode}, signal=${proc.signalCode}）`);
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      const pages = list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
      return pages.find((t) => t.url?.startsWith(url)) ?? pages[0];
    }, { timeoutMs: targetTimeoutMs, what: "Chrome page target" });
    client = await attach(target.webSocketDebuggerUrl, { wsOpenMs });
  } catch (error) {
    await stopOwnedProcess(proc);
    await removeProfileBounded(userDataDir);
    const detail = stderrTail.trim() ? `\nChrome stderr（末段）：${stderrTail.trim()}` : "";
    throw error instanceof HarnessError
      ? new HarnessError(`${error.message}${detail}`, { cause: error })
      : new HarnessError(`${error.message}${detail}`, { cause: error });
  }

  let closed = false;
  client.pid = proc.pid;
  client.port = cdpPort;
  client.close = async () => {
    if (closed) return { confirmed: true, timedOut: false, error: null, forced: false, profileRemoved: true };
    closed = true;
    try { await client.send("Browser.close", {}, 4_000); } catch { /* 盡力而為，下面還有硬清 */ }
    try { client.ws.close(); } catch { /* 同上 */ }
    const killResult = await stopOwnedProcess(proc);
    const profileResult = await removeProfileBounded(userDataDir);
    return { ...killResult, profileRemoved: profileResult.removed, profileError: profileResult.error };
  };
  return client;
}

/** 同 `cdp.mjs` 的 `attach()`，差在 WebSocket open 也有明確逾時（原本沒有）。 */
async function attach(wsUrl, { wsOpenMs = DEFAULT_TIMEOUTS.wsOpenMs } = {}) {
  const ws = new WebSocket(wsUrl);
  await Promise.race([
    new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", () => rej(new HarnessError("CDP WebSocket 連線失敗")), { once: true });
    }),
    sleep(wsOpenMs).then(() => { throw new HarnessError(`CDP WebSocket 開啟逾時（${wsOpenMs}ms）`); }),
  ]);

  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  const consoleLines = [];
  const pageErrors = [];

  const rejectPending = (error) => { for (const p of pending.values()) p.reject(error); pending.clear(); };

  ws.addEventListener("close", () => rejectPending(new HarnessError("CDP WebSocket 已關閉（Chrome／renderer 可能已退出）")));
  ws.addEventListener("error", () => rejectPending(new HarnessError("CDP WebSocket 發生錯誤")));

  ws.addEventListener("message", (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); }
    catch (error) { rejectPending(new HarnessError(`CDP 回應不是有效 JSON：${error.message}`)); return; }
    if (msg.id != null) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(`${msg.error.message}${msg.error.data ? ` — ${msg.error.data}` : ""}`)) : p.resolve(msg.result);
      return;
    }
    for (const h of listeners.get(msg.method) ?? []) h(msg.params);
  });

  const send = (method, params = {}, timeoutMs = 60_000) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new HarnessError(`CDP ${method} 逾時（${timeoutMs}ms）`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    try { ws.send(JSON.stringify({ id, method, params })); }
    catch (error) {
      const p = pending.get(id);
      pending.delete(id);
      p?.reject(error);
    }
  });
  const on = (method, handler) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(handler);
  };

  on("Runtime.consoleAPICalled", (p) => {
    consoleLines.push(`[${p.type}] ${(p.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(" ")}`);
  });
  on("Runtime.exceptionThrown", (p) => {
    const d = p.exceptionDetails ?? {};
    pageErrors.push(d.exception?.description ?? d.text ?? "unknown exception");
  });

  await send("Runtime.enable");
  await send("Page.enable");

  //  ⚠ 頁面自己的例外（`頁面例外：...`）是**產品層**的錯誤（比如 assertion
  //    在頁面內丟出），不包成 HarnessError——runGate 會把它當一般例外處理，
  //    但因為它是從 `run()` 裡逃出來的，仍然落在「未經 ck() 分類」的路徑，
  //    一樣算 HARNESS_FAIL（gate 應該自己 try/catch 把頁面例外轉成 `ck()`
  //    失敗，而不是讓它裸露逃出——這是寫 gate 的規範，不是這支檔案的責任）。
  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true, returnByValue: true,
    }, 840_000);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`頁面例外：${d.exception?.description ?? d.text}`);
    }
    return r.result?.value;
  }

  async function waitForLoad(what = "頁面載入完成") {
    await waitFor(async () => await evaluate("return document.readyState === 'complete';"),
      { timeoutMs: 30_000, what });
  }

  async function reload() {
    const loaded = new Promise((res) => on("Page.loadEventFired", res));
    await send("Page.reload", { ignoreCache: false });
    await Promise.race([loaded, sleep(15_000)]);
    await waitForLoad("reload 後載入完成");
  }

  async function navigate(url) {
    await send("Page.navigate", { url });
    await waitForLoad(`導向 ${url}`);
    await waitFor(async () => await evaluate("return location.href;").then((h) => h?.startsWith(url.split("#")[0])),
      { timeoutMs: 15_000, what: "URL 就位" });
  }

  return { ws, send, on, evaluate, navigate, reload, waitForLoad, consoleLines, pageErrors };
}

/**
 * ── 唯一的對外入口 ─────────────────────────────────────────────────────
 *
 * @param {object} opts
 * @param {string} opts.name          gate 名稱，出現在最終結果行與 evidence。
 * @param {(ctx: object) => Promise<void>} opts.run
 *        gate 的測試主體。`ctx` 給：`{ chrome, ck, sleep, J, pass, fail }`。
 *        **只用 `ctx.ck()` 表達產品斷言**——任何從這裡拋出去的例外都會被
 *        判成 `HARNESS_FAIL`，不會混進產品的 pass/fail。
 * @param {string} [opts.base]        vite base，預設 `/ESMO-/`。
 * @param {boolean} [opts.headless]   預設讀 `--headed` 旗標。
 * @param {number} [opts.timeoutMs]   in-process 軟總時限（見檔頭 §4）。
 * @param {string} [opts.evidenceOut] 給了才把 evidence JSON 寫檔（預設不寫）。
 *
 * @returns {Promise<{verdict:"PASS"|"PRODUCT_FAIL"|"HARNESS_FAIL", pass:number,
 *   fail:number, elapsedMs:number, failurePhase:string|null, evidence:object}>}
 *   **不會拋例外**——所有錯誤都被吸收並分類進回傳值，呼叫端只要看 `verdict`。
 */
export async function runGate({
  name, run, base = "/ESMO-/", headless = !process.argv.includes("--headed"),
  timeoutMs = DEFAULT_TIMEOUTS.totalMs, evidenceOut = null,
  //  ⚠ `port`／`cdpPort` 只給**驗證 harness 自己**用（人工製造 port 撞號、
  //    確認 startup 階段真的判成 HARNESS_FAIL）。正常 gate 不要傳這兩個——
  //    不傳就是預設行為：向 OS 要一個目前空的 port。
  port = null, cdpPort = null,
  //  ⚠ `externalUrl` 是給**正式站 smoke** 用的：目標已經在線上，不需要（也不該）
  //    起本地 dev server。傳了就跳過 startOwnedDevServer，其餘（Chrome 擁有權、
  //    總時限、PASS / PRODUCT_FAIL / HARNESS_FAIL 分類、保證收尾）完全相同。
  //    正式站是打包後的 bundle，沒有 `/src/...` ⇒ gate 內只能點 UI 與讀 localStorage。
  externalUrl = null,
} = {}) {
  const startedAt = Date.now();
  let phase = "startup";
  let pass = 0, fail = 0;
  const ck = (n, ok, d = "") => {
    ok ? pass++ : fail++;
    console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`);
  };

  let server = null, chrome = null;
  let verdict = "PASS";
  let harnessReason = null;

  try {
    if (!externalUrl) {
      server = await startOwnedDevServer({ port, base, timeoutMs: DEFAULT_TIMEOUTS.devServerStartMs });
    }
    const targetUrl = externalUrl ?? server.url;
    chrome = await launchOwnedChrome({ url: targetUrl, port: cdpPort, headless });

    phase = "test";
    await Promise.race([
      run({ chrome, url: targetUrl, ck, sleep, J: (raw) => JSON.parse(String(raw).replace(/^"|"$/g, "")) }),
      sleep(timeoutMs).then(() => {
        throw new HarnessError(`gate 總時限逾時（軟上限 ${timeoutMs}ms；硬上限見 run-gate.mjs 的 supervisor）`);
      }),
    ]);

    verdict = fail === 0 ? "PASS" : "PRODUCT_FAIL";
  } catch (error) {
    //  任何從 startup／test 階段逃出來的例外一律是 HARNESS_FAIL——
    //  這是修事故②的直接對策：資源尖峰、CDP 斷線、Chrome crash、
    //  gate 腳本自己的 bug，都不該被算成產品 regression。
    verdict = "HARNESS_FAIL";
    harnessReason = `[${phase}] ${error?.message ?? String(error)}`;
    console.log(`❌ HARNESS_FAIL｜${harnessReason}`);
  }

  phase = "cleanup";
  const cleanup = { chromeClose: null, serverStop: null };
  try { cleanup.chromeClose = chrome ? await chrome.close() : { confirmed: true, skipped: true }; }
  catch (e) { cleanup.chromeClose = { confirmed: false, error: String(e?.message ?? e) }; }
  try { cleanup.serverStop = server ? await server.stop() : { confirmed: true, skipped: true }; }
  catch (e) { cleanup.serverStop = { confirmed: false, error: String(e?.message ?? e) }; }

  const elapsedMs = Date.now() - startedAt;
  const evidence = {
    name, verdict, pass, fail, elapsedMs,
    failurePhase: verdict === "HARNESS_FAIL" ? harnessReason : null,
    ports: { vite: server?.port ?? null, cdp: chrome?.port ?? null },
    pids: { vite: server?.pid ?? null, chrome: chrome?.pid ?? null },
    cleanup,
    ts: new Date().toISOString(),
  };
  if (evidenceOut) {
    try { writeFileSync(evidenceOut, JSON.stringify(evidence, null, 2)); }
    catch { /* evidence 檔案寫不出去不影響判定 */ }
  }

  console.log(`\n${name}：${pass}/${pass + fail}　RESULT=${verdict}　耗時 ${elapsedMs}ms`);
  if (verdict !== "PASS") console.log(`   evidence: ${JSON.stringify(evidence)}`);

  return { verdict, pass, fail, elapsedMs, failurePhase: evidence.failurePhase, evidence };
}

/**
 * `verdict` → exit code。三種結局各自一個數字，呼叫端（含 CI）不必解析文字：
 *   0 = PASS　1 = PRODUCT_FAIL　2 = HARNESS_FAIL
 */
export const exitCodeFor = (verdict) => (verdict === "PASS" ? 0 : verdict === "PRODUCT_FAIL" ? 1 : 2);

/**
 * gate 的標準收尾：**明確結束行程**，不要等事件迴圈自己排空。
 *
 * ── 為什麼一定要明確 exit ─────────────────────────────────────────────
 * 實測（Node v24 / Windows）：gate 的結果都印完、`_getActiveHandles()` 與
 * `_getActiveRequests()` 都已經是空的，process 卻仍然不會自己結束——原始
 * 事故「印出 68/68 PASS 之後卡住」有一部分就是這個現象（另一部分是
 * `spawnSync("taskkill")` 鎖死事件迴圈，那個已在 `killProcessTree` 修掉）。
 *
 * 追到最後：Windows 上被外部 `taskkill` 終止的子行程，其 `ChildProcess`
 * 物件不一定會收到自己的 `'exit'`；而改用 `unref()` 迴避又會讓 `'exit'`
 * 永遠不送達、收尾反而更不可靠（最小重現：exit code 13
 * 「unsettled top-level await」）。與其繼續猜 libuv 在 Windows 上的 handle
 * 語意，不如照 CLI 工具的通則辦：**跑完就明確結束**。
 *
 * ⚠ `process.exit()` 有截斷輸出的風險（stdout 被導向檔案／pipe 時尤其），
 *   所以這裡**先等 stdout 真的排空**再結束。
 */
export async function finishGate(result) {
  const code = exitCodeFor(result?.verdict);
  await new Promise((res) => {
    if (process.stdout.writableLength === 0) return res();
    process.stdout.write("", res);
  });
  process.exit(code);
}

/** `run-gate.mjs` supervisor 用得到，也留給想直接管 port/PID 的呼叫端。 */
export { allocatePort, isPortFree, killProcessTree, startOwnedDevServer, launchOwnedChrome };
