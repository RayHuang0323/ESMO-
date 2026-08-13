// ============================================================================
//  tools/browser/cdp.mjs — 瀏覽器驗證的共用底座（零依賴）
//
//  Node 22+ 已內建 `fetch` 與 `WebSocket` ⇒ **不裝 puppeteer／playwright**，
//  不為了驗證腳本增加相依。這一支只做三件事：起獨立 dev server、開獨立 Chrome、
//  用 CDP 驅動頁面。
//
//  ⚠ 為什麼是獨立的：驗證不得驅動 Ray 的日常 Chrome、不得碰他的正式存檔。
//    每次都是全新的 `--user-data-dir`（跑完刪掉）、獨立 port、獨立 vite。
//
//  ⚠ 反節流那三個旗標是必要的，不是保險：沒有它們，背景視窗的計時器會被節流到
//    每秒一次，跑一整季要等三十分鐘（`browser_check_q6.mjs` 的實測教訓）。
//
//  ⚠ 既有的 `tools/browser_check_q6.mjs` 內嵌了一份自己的 CDP client。本檔是把
//    同一套東西抽成共用模組給後續的驗證用；**沒有回頭改 q6**——那是一支正在
//    綠燈的 gate，為了整併去動它不划算。合併成一套列為技術債（見 08）。
// ============================================================================
/**
 * 頁面端前導程式：取得**與 `settleMatchBoundary` 閉包裡同一個** profileStore。
 *
 * ── 為什麼不能直接 import profileStore ────────────────────────────────────
 * 實測（2026-08-13）：在同一頁裡自己 `import("/src/platform/profileStore.js")`，
 * 拿到的可能**不是** `settleMatchBoundary` 內部那一個。當時的證據是：
 *   · 把場次塞進「自己 import 的」store ⇒ `usableMine = true`
 *   · 同一個 evaluate 呼叫 `settleMatchThroughSession` ⇒ `viaSession = false`
 *   · 而「事後再 import 一次」與「自己第一次 import 的」卻是同一個
 * ⇒ 第二份是從 boundary 的 `../profileStore.js` 這條邊進來的。
 * 後果很惡劣：驗證器會**靜默地驗到另一個 store**，綠或紅都與被測行為無關。
 *
 * ── 做法 ────────────────────────────────────────────────────────────────
 * 抓 dev server 供應的 **boundary 轉譯後原始碼**，讀出它實際 import 的
 * profileStore URL，再 import 那個 URL。這樣「測試驅動的 store」與
 * 「production 路徑使用的 store」在定義上就是同一個，不是靠假設。
 */
export const RESOLVE_APP_MODULES = `
  const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
  const boundaryUrl = B + "/src/platform/progress/settleMatchBoundary.js";
  const boundary = await import(boundaryUrl);

  //  從 boundary 自己的原始碼推導 store 的 URL（不猜、不自己組）
  const src = await (await fetch(boundaryUrl)).text();
  const m = src.match(/from\\s*["']([^"']*profileStore[^"']*)["']/);
  if (!m) throw new Error("讀不到 settleMatchBoundary 對 profileStore 的 import，無法確定 store 實例");
  const storeUrl = new URL(m[1], new URL(boundaryUrl, location.href)).href;
  const profile = await import(storeUrl);

  //  這幾支是純函式，實例是誰都無所謂
  const adapter = await import(B + "/src/platform/progress/adapters/mobaProgressAdapter.js");
  const battleResult = await import(B + "/src/battle/battleResult.js");
  const engineMod = await import(B + "/src/LogicEngine.js");
  const S = () => profile.useProfileStore.getState();
`;

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeoutMs = 30_000, everyMs = 250, what = "條件" } = {}) {
  const until = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < until) {
    try { const v = await fn(); if (v) return v; } catch (e) { lastErr = e; }
    await sleep(everyMs);
  }
  throw new Error(`等待「${what}」逾時（${timeoutMs}ms）${lastErr ? `：${lastErr.message}` : ""}`);
}

/**
 * 起一個**獨立 port** 的 vite dev server，回傳 { url, stop }。
 * dev server 供應原始模組 ⇒ 頁面裡 `import()` 同一個 URL 拿到的是同一個單例。
 */
export async function startDevServer({ port, base = "/ESMO-/" } = {}) {
  //  ⚠ 這兩道防護是實測踩出來的，缺一不可：
  //
  //  ① **先確認 port 是空的**。`--strictPort` 撞 port 時 vite 會直接結束，但
  //     下面的 `fetch` 仍然會成功——成功的是**上一次留下來的那一個 dev server**。
  //     它可能供應的是另一個 worktree 的原始碼，於是驗證器靜默地測到不是自己
  //     要測的程式碼（同一個 commit 一下 24/24 一下 19/24 就是這樣來的）。
  //     所以 port 有人佔就直接 throw，不猜、不重試、不換 port。
  //
  //  ② **收工要殺整棵行程樹**。`shell: true` 之下 `proc.kill()` 只殺得到 shell，
  //     真正的 vite 會活下來繼續佔 port ⇒ 每跑一次就漏一個，下一次就踩 ①。
  if (!(await isPortFree(port))) {
    throw new Error(
      `port ${port} 已經有人在聽。多半是上一次跑剩下的 dev server。\n` +
      `   驗證器**拒絕**連上不是自己起的 server——那會靜默地測到別的原始碼。\n` +
      `   請先關掉佔用 ${port} 的行程再跑。`);
  }
  const url = `http://localhost:${port}${base}`;
  const proc = spawn("npx", ["vite", "--port", String(port), "--strictPort"], { shell: true, stdio: "ignore" });
  await waitFor(async () => (await fetch(url)).ok, { timeoutMs: 90_000, what: `dev server ${url}` });
  return {
    url, proc,
    stop: () => {
      try {
        if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
        else proc.kill();
      } catch { /* 已經死了就算了 */ }
    },
  };
}

/** port 現在有沒有人在聽（用「綁得起來嗎」判定，不猜）。 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

/**
 * 開一個獨立 profile、獨立 debug port 的 Chrome，並連上它的 page target。
 * 回傳的 client 另帶 `close()`，會關掉 Chrome 並刪掉暫存 profile。
 */
export async function launchChrome({ url, port, headless = true }) {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error(`找不到 Chrome：${CHROME_CANDIDATES.join(" / ")}`);
  const userDataDir = mkdtempSync(join(tmpdir(), "esmo-cdp-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-background-networking", "--disable-sync", "--disable-features=Translate",
    //  ⚠ 反節流：headless 的背景視窗會把計時器壓到 1/秒
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1280,900",
  ];
  if (headless) args.push("--headless=new", "--disable-gpu");
  args.push(url);

  const proc = spawn(exe, args, { stdio: "ignore" });
  //  ⚠ 起手可能先抓到 about:blank 那個分頁（讀 localStorage 會 SecurityError），
  //    所以優先挑已經指向目標 URL 的 target。
  const target = await waitFor(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const pages = list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
    return pages.find((t) => t.url?.startsWith(url)) ?? pages[0];
  }, { timeoutMs: 30_000, what: "Chrome page target" });

  const client = await attach(target.webSocketDebuggerUrl);
  client.close = async () => {
    try { client.ws.close(); } catch {}
    try { proc.kill("SIGKILL"); } catch {}
    await sleep(300);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  };
  return client;
}

/** 連上 page target，回傳 { evaluate, navigate, reload, consoleLines, pageErrors }。 */
async function attach(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("CDP WebSocket 連線失敗")), { once: true });
  });

  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  const consoleLines = [];
  const pageErrors = [];

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(`${msg.error.message}${msg.error.data ? ` — ${msg.error.data}` : ""}`)) : p.resolve(msg.result);
      return;
    }
    for (const h of listeners.get(msg.method) ?? []) h(msg.params);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
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

  /** 在頁面裡跑一段 async 程式碼，回傳其 JSON 值。頁面丟例外 ⇒ 這裡 throw。 */
  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true, returnByValue: true,
    });
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

  /** 真實 reload（走完整 document 生命週期 ⇒ store 從 localStorage 重新水合）。 */
  async function reload() {
    const loaded = new Promise((res) => on("Page.loadEventFired", res));
    await send("Page.reload", { ignoreCache: false });
    await Promise.race([loaded, sleep(15_000)]);
    await waitForLoad("reload 後載入完成");
  }

  /** 明確導到目標 URL（不倚賴 Chrome 啟動參數把哪個分頁帶到哪）。 */
  async function navigate(url) {
    await send("Page.navigate", { url });
    await waitForLoad(`導向 ${url}`);
    await waitFor(async () => await evaluate("return location.href;").then((h) => h?.startsWith(url.split("#")[0])),
      { timeoutMs: 15_000, what: "URL 就位" });
  }

  return { ws, send, on, evaluate, navigate, reload, waitForLoad, consoleLines, pageErrors };
}
