// ============================================================================
//  tools/c1/c1_engines.mjs — one small interface over the browser engines used by the C1 cross-engine checks (2026-11-23).
//
//   · chrome  — the repo's own CDP helper (tools/browser/cdp.mjs), headless Chrome, fresh profile.
//   · firefox / webkit — Playwright's builds (playwright-core from the locally installed Python Playwright package; browsers in its cache).
//     WebKit here is Playwright's WebKit build on Windows: it is NOT iOS/macOS Safari and must never be reported as Safari certification.
//  openEngine(name) → { name, ua, evaluate(body), goto(url), mouseClick(x, y), screenshot(path), setViewport(w, h, mobile), close() }
//  evaluate(body) runs `(async () => { body })()` in the page and returns its JSON-serialisable value.
//  importModule(engine, absPath, globalName) loads a dependency-free ES module into the page (Blob URL) and stores its namespace on window[globalName].
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

let PW = null;
/** playwright-core: $ESMO_PLAYWRIGHT_CORE, else the driver package that ships inside the Python `playwright` module. */
export async function playwrightCore() {
  if (PW) return PW;
  let dir = process.env.ESMO_PLAYWRIGHT_CORE;
  if (!dir) {
    const pkg = execFileSync("python", ["-c", "import playwright, os; print(os.path.dirname(playwright.__file__))"], { encoding: "utf8" }).trim();
    dir = path.join(pkg, "driver", "package");
  }
  if (!fs.existsSync(path.join(dir, "package.json"))) throw new Error(`playwright-core not found at ${dir}`);
  const mod = await import(pathToFileURL(path.join(dir, "index.js")).href);
  PW = mod.default ?? mod;
  PW.__version = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
  return PW;
}

export async function openEngine(name, { port = 9475 } = {}) {
  if (name === "chrome") {
    const { launchChrome } = await import("../browser/cdp.mjs");
    const c = await launchChrome({ url: "about:blank", port, headless: true });
    const api = {
      name, evaluate: (body) => c.evaluate(body),
      goto: async (url) => { await c.navigate(url); },
      mouseClick: async (x, y) => { for (const type of ["mousePressed", "mouseReleased"]) await c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); },
      screenshot: async (p) => { const r = await c.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(p, Buffer.from(r.data, "base64")); },
      setViewport: async (w, h, mobile) => { await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile }); await c.send("Emulation.setTouchEmulationEnabled", { enabled: !!mobile, maxTouchPoints: mobile ? 5 : 1 }); },
      close: () => c.close(),
    };
    api.ua = await api.evaluate("return navigator.userAgent;");
    return api;
  }
  if (name !== "firefox" && name !== "webkit") throw new Error(`unknown engine ${name}`);
  const pw = await playwrightCore();
  const browser = await pw[name].launch({ headless: true });
  let context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  let page = await context.newPage();
  const api = {
    name, browserVersion: browser.version(), playwright: pw.__version,
    evaluate: (body) => page.evaluate(`(async () => { ${body} })()`),
    goto: async (url) => { await page.goto(url, { waitUntil: "load", timeout: 120000 }); },
    mouseClick: (x, y) => page.mouse.click(x, y),
    screenshot: (p) => page.screenshot({ path: p }),
    //  Playwright fixes viewport/touch per context ⇒ a new context (fresh profile) at the requested size; call before goto.
    setViewport: async (w, h, mobile) => {
      await context.close();
      context = await browser.newContext({ viewport: { width: w, height: h }, ...(mobile ? { hasTouch: true, isMobile: name !== "firefox", deviceScaleFactor: 2 } : {}) });
      page = await context.newPage();
    },
    close: () => browser.close(),
  };
  api.ua = await api.evaluate("return navigator.userAgent;");
  return api;
}

/** Load a dependency-free ES module (absolute path) into the current page as window[globalName]. */
export async function importModule(engine, absPath, globalName) {
  const src = fs.readFileSync(absPath, "utf8");
  return engine.evaluate(`const u = URL.createObjectURL(new Blob([${JSON.stringify(src)}], { type: "text/javascript" }));
    window[${JSON.stringify(globalName)}] = await import(u); return Object.keys(window[${JSON.stringify(globalName)}]).length;`);
}
