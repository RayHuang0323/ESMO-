// ============================================================================
//  tools/owner_preview/lib_cdp_chrome.mjs — 量測工具專用的最小 Chrome 啟動器（2026-11-12）
//  為什麼不用 tools/browser/harness.mjs：harness 只允許 ANGLE 後端 gl／d3d11，而這次要重現的是 Owner 的 Chrome
//  『硬體加速關閉』⇒ GPU 行程用 --use-angle=d3d11-warp-webgl（Windows 的 CPU 軟體繪製）。共用 harness 不動。
//  介面與 harness 的 chrome 物件相容（send／evaluate／navigate／pageErrors），讓 lib_battle_flow.mjs 可以直接用。
//  一律 headed、獨立暫存 profile，結束時關閉並刪除 profile。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXE = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ url = "about:blank", extraArgs = [], port = 9300 + Math.floor(Math.random() * 500) }) {
  const profile = mkdtempSync(join(tmpdir(), "esmo-rd-"));
  const args = [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-sync",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion", "--window-size=1280,720", ...extraArgs, url];
  const proc = spawn(EXE, args, { stdio: "ignore", windowsHide: false });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(500);
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null; } catch { /* 還沒起來 */ }
  }
  if (!wsUrl) { try { proc.kill(); } catch { /* 已結束 */ } throw new Error("Chrome CDP 沒有起來"); }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
  let seq = 0; const pending = new Map(); const listeners = new Map(); const pageErrors = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id != null) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
    for (const h of listeners.get(m.method) ?? []) h(m.params);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const on = (method, h) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(h); };
  on("Runtime.exceptionThrown", (p) => pageErrors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "exception"));
  await send("Runtime.enable"); await send("Page.enable");
  async function evaluate(expression) {
    const r = await send("Runtime.evaluate", { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`頁面例外：${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  }
  async function navigate(u) {
    await send("Page.navigate", { url: u });
    for (let i = 0; i < 120; i++) { await sleep(250); try { if (await evaluate("return document.readyState === 'complete' && location.href.startsWith(" + JSON.stringify(u.split("#")[0]) + ");")) return; } catch { /* 換頁中 */ } }
  }
  async function close() {
    try { await send("Browser.close"); } catch { /* 已關 */ }
    for (let i = 0; i < 20 && proc.exitCode == null; i++) await sleep(250);
    if (proc.exitCode == null) { try { spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* 忽略 */ } await sleep(1000); }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 檔案鎖住就留著（暫存資料夾） */ }
  }
  return { send, on, evaluate, navigate, close, pageErrors };
}
