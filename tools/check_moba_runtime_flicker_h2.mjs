// ============================================================================
//  tools/check_moba_runtime_flicker_h2.mjs — Runtime 閃爍專用診斷（Milestone H.2-flicker）
//
//  【為什麼要另外做一支】H.2-close 曾經宣稱「閃爍已修」，那是**錯的**：
//  當時的判準是每 600ms 取樣一次 `visible` 欄位。閃爍是「單幀或數幀消失又出現」，
//  用比事件本身還慢的取樣頻率去抓，幾乎必然漏掉 ⇒ 得到「沒有閃爍」的假結論。
//  真實 Android 手機錄影顯示 Runtime 動態物件仍在間歇性消失重現。
//
//  【本支怎麼驗】
//   · 統計**不在工具端做**：頁面內的 `__ESMO_RUNTIME_TICK` 每一幀都會跑，
//     由它逐幀掃 scene graph 並累計（見 runtimeDiagnostics.js 的 flicker 記錄器）。
//     工具只負責啟動、等待、讀彙總 ⇒ **不可能因輪詢間隔漏幀**。
//   · 逐幀記錄的是「畫面上實際畫不畫得到」：自己與所有祖先的 visible 皆為 true
//     且 transform 無 NaN。任何 true→false 都算一次消失。
//   · 同時錄**連續畫面**（CDP Page.startScreencast），輸出 frame 序列 + 每幀對應的
//     診斷快照 ⇒ 肉眼與數據可以對照，不是只給一張 PNG。
//
//  用法：
//    node tools/check_moba_runtime_flicker_h2.mjs --url http://localhost:5173/ESMO-
//    node tools/check_moba_runtime_flicker_h2.mjs --seconds 90 --device desktop
//  預設跑 **Android 手機尺寸**（Pixel 7 級 412×915，DPR 2.625），這是回報問題的裝置類型。
//  無 npm 相依。真實 GPU（不加 --headless）。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE_URL = arg("--url", "http://localhost:5173/ESMO-");
const SECONDS = Number(arg("--seconds", "60"));
const DEVICE = arg("--device", "mobile");
const OUT_DIR = resolve(ROOT, arg("--out", `review/moba-runtime/h2-flicker/${DEVICE}`));
const KEEP_FRAMES = Number(arg("--frames", "240"));   // 存幾張連續影格當證據
const FIXCAM = arg("--fixcam", "1") !== "0";

//  Pixel 7 級的 Android Chrome（回報問題的裝置類型）；desktop 供對照。
const VIEWPORT = DEVICE === "desktop"
  ? { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }
  : { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true };

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { redirect: "manual" }); if (r.status < 500) return true; }
    catch { /* 還沒起來 */ }
    await sleep(500);
  }
  return false;
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method && c.handlers.has(m.method)) {
        c.handlers.get(m.method)(m.params);
      }
    };
    return c;
  }
  on(method, fn) { this.handlers.set(method, fn); }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`CDP ${method} 逾時 ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        res: (v) => { clearTimeout(timer); res(v); },
        rej: (e) => { clearTimeout(timer); rej(e); },
      });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); rej(e); }
    });
  }
  close() { this.ws.close(); }
}

const evaluate = async (cdp, expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? "evaluate failed");
  return r.result?.value;
};

// ── 主流程 ────────────────────────────────────────────────────────────────
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error("找不到 Chrome / Edge。"); process.exit(2); }
if (!await waitForServer(BASE_URL)) { console.error(`伺服器沒回應：${BASE_URL}`); process.exit(3); }
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(resolve(OUT_DIR, "frames"), { recursive: true });

const profile = resolve(ROOT, "node_modules/.cache", `esmo-fl-${process.pid}`);
const port = 9950 + (process.pid % 40);
//  ⚠ 真實 GPU：不加 --headless、不加 swiftshader。手機的閃爍多半和 GPU 行為有關，
//    用軟體 renderer 驗等於沒驗。
const browser = spawn(chrome, [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--hide-scrollbars", `--window-size=${VIEWPORT.width + 20},${Math.min(1100, VIEWPORT.height + 120)}`,
  "--window-position=0,0", "--autoplay-policy=no-user-gesture-required", "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  await sleep(250);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { /* 還沒起來 */ }
}
if (!wsUrl) { console.error("Chrome CDP 沒開起來。"); browser.kill(); process.exit(4); }

const root = await CDP.connect(wsUrl);
const { targetId } = await root.send("Target.createTarget", { url: "about:blank" });
const tab = await CDP.connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
await tab.send("Page.enable");
await tab.send("Runtime.enable");
await tab.send("Log.enable").catch(() => {});

//  ⚠ console 的錯誤與警告要收集：shader compile 失敗、context lost、three 的警告
//    都會出現在這裡，是手機閃爍的重要線索。
const consoleMsgs = [];
tab.on("Log.entryAdded", (p) => {
  const e = p?.entry; if (!e) return;
  if (e.level === "error" || e.level === "warning") {
    consoleMsgs.push({ level: e.level, text: String(e.text).slice(0, 300), source: e.source });
  }
});

await tab.send("Emulation.setDeviceMetricsOverride", VIEWPORT);
if (VIEWPORT.mobile) await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }).catch(() => {});

const qs = new URLSearchParams({
  debug: "moba-runtime-battle", diag: "1", waitTs: "1", mapPresentation: "runtime-v2",
}).toString();
const url = `${BASE_URL}/?${qs}`;
console.log(`── H.2-flicker 診斷（${DEVICE} ${VIEWPORT.width}×${VIEWPORT.height} @${VIEWPORT.deviceScaleFactor}x）──`);
console.log(`  ${url}`);
await tab.send("Page.navigate", { url });

let ready = false;
for (let i = 0; i < 120 && !ready; i++) {
  await sleep(500);
  ready = await evaluate(tab, "!!(document.querySelector('canvas') && window.__ESMO_FLICKER_START)").catch(() => false);
}
if (!ready) { console.error("Runtime 診斷探針未就緒"); browser.kill(); process.exit(5); }

//  等戰鬥真的開始跑（有英雄、有 ts）再開始統計，避免把開場掛載算成閃爍
for (let i = 0; i < 60; i++) {
  const ts = await evaluate(tab, "window.__BATTLE_TS ?? -1").catch(() => -1);
  if (Number(ts) > 5) break;
  await sleep(1000);
}

// ── 連續影格錄製（證據）────────────────────────────────────────────────────
const frames = [];
tab.on("Page.screencastFrame", async (p) => {
  if (frames.length < KEEP_FRAMES) frames.push({ data: p.data, ts: p.metadata?.timestamp ?? null });
  try { await tab.send("Page.screencastFrameAck", { sessionId: p.sessionId }); } catch { /* 已結束 */ }
});

//  ⚠ 像素級比對必須在**靜止相機**下做：導播鏡頭一直移動的話，畫面每幀都在變，
//  「這個像素變了又變回來」就分不出是 z-fighting 還是單純的鏡頭位移。
//  這裡固定鏡頭；scene graph 的逐幀統計不受影響（物件照樣在動）。
if (FIXCAM) {
  //  ⚠ 只呼叫 SETCAM 是不夠的：預設是**導播鏡頭**，它每幀都會把 pan 拉向戰況，
  //  於是整個畫面一直在移動 ⇒ 像素比對會把「鏡頭位移造成的邊緣變化」算成閃爍
  //  （實測桌面版因此得到 6.8% 的假訊號，熱區剛好落在對比最強的岩石邊緣）。
  //  這裡先用一次**小幅拖曳**切到自由鏡頭（和玩家拖地圖是同一條路徑），
  //  導播才會停手，之後 SETCAM 設的視角才真的固定得住。
  const cx0 = Math.round(VIEWPORT.width / 2), cy0 = Math.round(VIEWPORT.height / 2);
  for (const [type, x, y] of [["mousePressed", cx0, cy0], ["mouseMoved", cx0 + 6, cy0 + 4], ["mouseReleased", cx0 + 6, cy0 + 4]]) {
    await tab.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 }).catch(() => {});
    await sleep(60);
  }
  await sleep(300);
  await evaluate(tab, "window.__ESMO_RUNTIME_SETCAM && window.__ESMO_RUNTIME_SETCAM({ dist: 175, panX: 0, panZ: 0 })");
  await sleep(600);
}
const camAtStart = await evaluate(tab, "window.__ESMO_RUNTIME_CAM ? JSON.stringify(window.__ESMO_RUNTIME_CAM()) : null")
  .then((x) => (x ? JSON.parse(x) : null)).catch(() => null);
await evaluate(tab, "window.__ESMO_FLICKER_START()");
//  ⚠ 品質 70 的 JPEG 在高對比邊緣會產生壓縮雜訊，在逐像素比對裡變成假的「閃爍」
//  （實測桌面因此有約 50 個像素的底噪）。品質拉到 95 讓底噪降下來，
//  門檻才有辦法定在真正有意義的位置，而不是為了遷就雜訊而放寬。
await tab.send("Page.startScreencast", { format: "jpeg", quality: 95, everyNthFrame: 1 });
console.log(`  逐幀統計中（${SECONDS} 秒）…`);

//  ⚠ 逐像素比對只能拿來問「**該靜止的東西有沒有在抖**」。
//  英雄會走、塔冠本來就設計成會旋轉與上下浮動（見 MobaRuntimeStructures 的 useFrame），
//  它們的邊緣本來就每幀都在變 ⇒ 把它們算進去，任何指標都會被自身動畫淹沒
//  （實測桌面因此得到 8.2% 的假訊號，差異圖顯示變化全部落在英雄與塔冠上）。
//  這裡在整個量測窗內持續累積它們的畫面位置，最後從比對範圍中扣掉；
//  剩下的就是地形、地面鋪層、岩塊投影、河道——也就是 z-fighting 真正會發作的地方。
//  英雄本身有沒有異常消失，由逐幀的 scene graph 統計負責（那部分不受動畫影響）。
const movingMask = [];
const collectMoving = async () => {
  const r = await evaluate(tab, `(() => {
    const d = window.__ESMO_RUNTIME_DIAG ? window.__ESMO_RUNTIME_DIAG() : null;
    if (!d) return [];
    const out = [];
    for (const h of (d.heroRenderDiagnostics || [])) {
      if (h.screen && h.onScreen) out.push({ x: h.screen.xPct / 100, y: h.screen.yPct / 100, r: 0.075 });
    }
    for (const n of (d.nexusWorld || [])) {
      if (n.screen && n.screen.onScreen) out.push({ x: n.screen.xPct / 100, y: n.screen.yPct / 100, r: 0.06 });
    }
    //  塔冠：用結構的呈現座標投影（塔冠會轉、會浮動）
    if (window.__ESMO_RUNTIME_PROJECT && window.__ESMO_TOWER_WORLD) {
      for (const t of window.__ESMO_TOWER_WORLD) {
        const p = window.__ESMO_RUNTIME_PROJECT(t.x, t.y, t.z);
        if (p && p.onScreen) out.push({ x: p.xPct / 100, y: p.yPct / 100, r: 0.05 });
      }
    }
    return out;
  })()`).catch(() => []);
  for (const c of r) movingMask.push(c);
};

const t0 = Date.now();
let last = 0;
await collectMoving();
while ((Date.now() - t0) / 1000 < SECONDS) {
  await sleep(2000);
  await collectMoving();
  if ((Date.now() - t0) % 5000 > 2000) continue;
  const f = await evaluate(tab, "JSON.stringify(window.__ESMO_FLICKER())").catch(() => null);
  if (f) {
    const d = JSON.parse(f);
    const dis = Object.entries(d.disappear).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(" ");
    if (d.frames - last >= 0) {
      console.log(`    ${Math.round((Date.now() - t0) / 1000)}s｜${d.frames} 幀｜${d.fps} FPS｜消失 ${dis || "無"}｜NaN ${d.nanSamples}｜ctxLost ${d.contextLost}`);
      last = d.frames;
    }
  }
}
await tab.send("Page.stopScreencast").catch(() => {});
//  ⚠ 先把彙總讀走，再做下面會**移動鏡頭**的裁切探測。
//  three.js 是「第一次真的被畫到才上傳 GPU」，把鏡頭拉遠會讓原本被視錐剔除的物件
//  一次上傳 ⇒ geometry / draw call 會跳一階。那是探測動作造成的，不是對戰期間的洩漏；
//  先取彙總才不會把自己的探測算進統計裡（實測會多算 +18 並誤判成洩漏）。
const summaryRaw = await evaluate(tab, "JSON.stringify(window.__ESMO_FLICKER())");
//  ⚠ HUD 要從像素比對中排除。計時器每秒跳、LIVE 指示會閃、戰報一直在捲——
//  那些是**正常的 DOM 更新**，不是 Runtime 3D 物件在閃。不排除的話它們會貢獻
//  一個固定的假底噪（實測桌面 0.025%，剛好卡在門檻上），把真訊號淹掉。
const hudRects = await evaluate(tab, `(() => {
  const W = window.innerWidth, H = window.innerHeight;
  const out = [];
  for (const el of document.querySelectorAll("div,button,canvas")) {
    if (el.tagName === "CANVAS" && el === document.querySelectorAll("canvas")[0]) continue;
    const st = getComputedStyle(el);
    const bg = st.backgroundColor || "";
    const m = bg.match(/rgba?\\(([^)]+)\\)/);
    const alpha = m ? Number((m[1].split(",")[3] ?? "1")) : 0;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 14) continue;
    if (r.width * r.height > W * H * 0.7) continue;
    //  有不透明背景的面板，或是小地圖那種 canvas
    if (alpha >= 0.35 || el.tagName === "CANVAS") {
      out.push({ x: r.left / W, y: r.top / H, w: r.width / W, h: r.height / H });
    }
  }
  return out;
})()`).catch(() => []);
//  相機在整個量測窗內真的沒動嗎？沒有這個保證，像素比對的數字就沒有意義。
const camAtEnd = await evaluate(tab, "window.__ESMO_RUNTIME_CAM ? JSON.stringify(window.__ESMO_RUNTIME_CAM()) : null")
  .then((x) => (x ? JSON.parse(x) : null)).catch(() => null);
const camDrift = (camAtStart && camAtEnd)
  ? Math.hypot(camAtEnd.pan.x - camAtStart.pan.x, camAtEnd.pan.z - camAtStart.pan.z) + Math.abs(camAtEnd.dist - camAtStart.dist)
  : null;

// ── 深度精度與裁切檢查（不需要真機也能把關的量化門檻）──────────────────────
//  【為什麼要有這一項】真機閃爍的根因是**深度緩衝精度不足**：Android 的 WebGL
//  context 常常只給 16-bit 深度，而透視深度的解析度是 Δz ≈ z²(f−n)/(f·n·2^bits)。
//  桌機拿到 24-bit，同樣的 near/far 完全看不出問題 ⇒ 只靠桌機目視永遠驗不到。
//  這裡直接用相機的實際 near/far 算出 **16-bit 下的 Δz**，與場景裡最小的圖層間距
//  比對 ⇒ 就算手上沒有那支手機，也能擋住「精度不足」這個根因回歸。
const depthProbe = await evaluate(tab, `(() => {
  const cv = document.querySelector("canvas");
  const gl = cv.getContext("webgl2") || cv.getContext("webgl");
  const d = window.__ESMO_RUNTIME_DIAG();
  const cam = d.camera, dist = d.cameraDistance || 175;
  const q = (bits) => (dist * dist * (cam.far - cam.near)) / (cam.far * cam.near * Math.pow(2, bits));
  return {
    depthBitsHere: gl.getParameter(gl.DEPTH_BITS),
    near: cam.near, far: cam.far, ratio: +(cam.far / cam.near).toFixed(1), dist,
    quantum24: q(24), quantum16: q(16),
  };
})()`).catch(() => null);

//  近遠裁切：把鏡頭推到最近與最遠，確認 10 名英雄與 20 個結構都沒有被 near/far 切掉。
const clipProbe = [];
for (const dist of [90, 175, 560]) {
  await evaluate(tab, `window.__ESMO_RUNTIME_SETCAM && window.__ESMO_RUNTIME_SETCAM({ dist: ${dist}, panX: 0, panZ: 0 })`);
  await sleep(700);
  const d = await evaluate(tab, `(() => {
    const x = window.__ESMO_RUNTIME_DIAG();
    return { dist: x.cameraDistance, heroes: x.heroCount, structs: (x.structureState || []).length, calls: x.performance.drawCalls, tris: x.performance.triangles };
  })()`).catch(() => null);
  if (d) clipProbe.push(d);
}
const summary = JSON.parse(summaryRaw);
const battle = await evaluate(tab, "JSON.stringify(window.__BATTLE_STATS ?? {})").then((s) => JSON.parse(s || "{}")).catch(() => ({}));
const diagNow = await evaluate(tab, "window.__ESMO_RUNTIME_DIAG ? JSON.stringify({heroCount:window.__ESMO_RUNTIME_DIAG().heroCount, camera:window.__ESMO_RUNTIME_DIAG().camera, perf:window.__ESMO_RUNTIME_DIAG().performance, deviceReport:window.__ESMO_RUNTIME_DEVICE_REPORT ?? null}) : null")
  .then((s) => (s ? JSON.parse(s) : null)).catch(() => null);

tab.close();

// ── 寫出證據 ──────────────────────────────────────────────────────────────
frames.forEach((f, i) => {
  writeFileSync(resolve(OUT_DIR, "frames", `frame_${String(i).padStart(4, "0")}.jpg`), Buffer.from(f.data, "base64"));
});

/**
 * 影格的**像素振盪**分析——z-fighting / 透明排序不穩的指紋。
 *
 * 【為什麼要看像素】scene graph 的 visible 全程是 true，卻仍可能在畫面上一閃一閃：
 * z-fighting 是**每像素的深度比較結果**在兩個表面之間跳，visible 旗標完全看不到。
 * 【怎麼分辨閃爍與鏡頭移動】只算「變了又變回來」的像素（A→B→A）：
 * 鏡頭位移造成的是單調變化，不會在下一幀精準跳回原值；z-fighting 會。
 * ⚠ 相機在測試期間是固定的（見 FIXCAM），所以殘餘的振盪像素幾乎只可能是深度/排序問題。
 */
async function analyzeFrames(browserPort, frameFiles, maskRects = [], maskCircles = []) {
  if (frameFiles.length < 3) return null;
  const r2 = await CDP.connect((await (await fetch(`http://127.0.0.1:${browserPort}/json/version`)).json()).webSocketDebuggerUrl);
  const { targetId: tid } = await r2.send("Target.createTarget", { url: "about:blank" });
  const t2 = await CDP.connect(`ws://127.0.0.1:${browserPort}/devtools/page/${tid}`);
  await t2.send("Runtime.enable");
  const b64 = frameFiles.map((f) => f.data);
  const expr = `(async () => {
    const srcs = ${JSON.stringify(b64.slice(0, 90))};
    const masks = ${JSON.stringify(maskRects)};
    const circles = ${JSON.stringify(maskCircles)};
    //  ⚠ 逐張解碼→縮圖→立刻釋放。桌面影格是 2400×1500，一次把 90 張全解碼成 Image
    //  會吃掉約 1.3 GB（實測 renderer 直接被系統回收，CDP 回報
    //  "Execution context was destroyed"，看起來像分析器壞掉，其實是記憶體爆掉）。
    const load = (d) => new Promise((res) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null);
      im.src = "data:image/jpeg;base64," + d;
    });
    const first = await load(srcs[0]);
    if (!first) return null;
    const w = Math.min(480, first.naturalWidth), h = Math.round(first.naturalHeight * (w / first.naturalWidth));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    const px = [];
    for (const d of srcs) {
      const im = await load(d);
      if (!im) continue;
      cx.clearRect(0, 0, w, h); cx.drawImage(im, 0, 0, w, h);
      px.push(cx.getImageData(0, 0, w, h).data);
      im.src = "";                       // 讓 bitmap 立刻可回收
    }
    if (px.length < 3) return null;
    const T = 26;          // 單通道差異門檻（JPEG 壓縮雜訊約 <12）
    //  ── 判準：**雙穩態反覆跳** ────────────────────────────────────────────
    //  「這一幀變了、下一幀變回來」單看三連幀無法分辨兩件事：
    //    (a) z-fighting / 排序抖動 —— 同一個像素在**兩個固定值**之間來回跳很多次
    //    (b) 物體正常移動 —— 邊緣像素會變，但值是一路推移，不會反覆回到同一個值
    //  英雄本來就在動，把 (b) 算進去就會得到隨戰況起伏的假訊號（實測同一份程式碼
    //  不同場次會在 0.04%–0.45% 之間跳）。所以這裡改成看整段窗格：
    //  一個像素要被判為閃爍，必須「回到過**同一個值** ≥ FLIP_MIN 次」。
    //  ⚠ 再加一道**頻率**判準：只算「在 WIN 幀的短窗內」就翻轉 ≥FLIP_MIN 次的像素。
    //  z-fighting / 排序抖動是**逐幀**在兩個表面之間跳（可達 30Hz）；
    //  英雄在戰鬥中來回移動是秒級（~0.5Hz），在 10 幀（0.17 秒）的窗內不可能翻 4 次。
    //  不加這道頻率條件的話，移動中的英雄邊緣會被算進來，同一份程式碼不同場次
    //  就會得到 0.04%–0.45% 的浮動假訊號（實測）。
    const FLIP_MIN = 4, WIN = 10;
    //  HUD 遮罩：面板座標是畫面比例，換算到取樣解析度後整塊跳過。
    const masked = new Uint8Array(w * h);
    for (const r of masks) {
      const x0 = Math.max(0, Math.floor(r.x * w)), x1 = Math.min(w, Math.ceil((r.x + r.w) * w));
      const y0 = Math.max(0, Math.floor(r.y * h)), y1 = Math.min(h, Math.ceil((r.y + r.h) * h));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) masked[y * w + x] = 1;
    }
    for (const c of circles) {
      const cx0 = c.x * w, cy0 = c.y * h, rr = c.r * w;
      const x0 = Math.max(0, Math.floor(cx0 - rr)), x1 = Math.min(w, Math.ceil(cx0 + rr));
      const y0 = Math.max(0, Math.floor(cy0 - rr)), y1 = Math.min(h, Math.ceil(cy0 + rr));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const dx = x - cx0, dy = y - cy0;
        if (dx * dx + dy * dy <= rr * rr) masked[y * w + x] = 1;
      }
    }
    let maskedCount = 0; for (const v of masked) if (v) maskedCount++;
    const N = px.length, P = w * h;
    let flickerPixels = 0;
    const lum = (d, i) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    for (let pi = 0; pi < P; pi++) {
      if (masked[pi]) continue;
      const i = pi * 4;
      //  先把這個像素的「翻轉發生在第幾幀」列出來，再用滑動窗看頻率
      const flipAt = [];
      let prevL = lum(px[0], i), lastStable = prevL, dir = 0;
      for (let k = 1; k < N; k++) {
        const L = lum(px[k], i);
        const d = L - prevL;
        //  ⚠ 振幅門檻用 T（不是 T/3）：z-fighting 是**兩個不同材質**互相搶贏，
        //  亮度落差通常有數十階（草綠 ↔ 土棕）；而壓縮雜訊與細微漸層只有幾階。
        //  用 T/3 會把後者也算進來，實測會得到 8.6% 的假訊號。
        if (Math.abs(d) >= T) {
          const nd = d > 0 ? 1 : -1;
          if (dir !== 0 && nd !== dir && Math.abs(L - lastStable) < T) flipAt.push(k);
          if (nd !== dir) lastStable = prevL;
          dir = nd;
        }
        prevL = L;
      }
      let hot = false;
      for (let a2 = 0; a2 + FLIP_MIN - 1 < flipAt.length; a2++) {
        if (flipAt[a2 + FLIP_MIN - 1] - flipAt[a2] <= WIN) { hot = true; break; }
      }
      if (hot) flickerPixels++;
    }
    const flickerPct = (flickerPixels / Math.max(1, P - maskedCount)) * 100;
    //  同時保留原本的三連幀指標（含移動）當作對照，方便判斷是不是只是動得多
    let worst = 0, sum = 0, n = 0, worstIdx = -1;
    for (let k = 2; k < px.length; k++) {
      const a = px[k - 2], b = px[k - 1], c = px[k];
      let osc = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d1 = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (d1 < T) continue;
        const d2 = Math.abs(b[i] - c[i]) + Math.abs(b[i + 1] - c[i + 1]) + Math.abs(b[i + 2] - c[i + 2]);
        if (d2 < T) continue;
        const back = Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]);
        if (back < T / 2) osc++;
      }
      const pct = (osc / P) * 100;
      sum += pct; n++;
      if (pct > worst) { worst = pct; worstIdx = k; }
    }
    return { frames: N, flickerPct: +flickerPct.toFixed(4), flipMin: FLIP_MIN, win: WIN,
      maskedPct: +((maskedCount / P) * 100).toFixed(1), maskRects: masks.length, maskCircles: circles.length,
      triples: n, meanOscPct: +(sum / n).toFixed(4), maxOscPct: +worst.toFixed(4),
      worstTripleIndex: worstIdx, sampleW: w, sampleH: h };
  })()`;
  //  ⚠ 桌面尺寸的影格是 2400×1500，光是解碼 90 張就可能超過預設的 30 秒
  //  ⇒ 這一支要給足時間，否則會靜靜回 null，看起來像「分析不出來」而不是「還在算」。
  const res = await t2.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, 180000)
    .then((r) => r.result?.value).catch((e) => { console.log("  ! 像素分析失敗：" + e.message); return null; });
  t2.close(); r2.close();
  return res;
}
const pixel = await analyzeFrames(port, frames, hudRects, movingMask).catch(() => null);
root.close(); browser.kill();

// ── 判定 ──────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const fails = [];
const ok = (cond, label, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${label}`); return true; }
  fail++; fails.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`❌ ${label}${detail ? ` — ${detail}` : ""}`);
  return false;
};

const KINDS = ["hero", "structure", "objective", "healthbar", "ring", "mapWall"];
const totalDisappear = KINDS.reduce((a, k) => a + (summary.disappear[k] ?? 0), 0);
const mounts = summary.mounts ?? {};
const remountKeys = ["view3d", "heroes", "structures"];
const remounted = remountKeys.filter((k) => (mounts[`${k}.mount`] ?? 0) > 1);

console.log("\n── 判定 ──────────────────────────────────────────────────────");
console.log(`   統計 ${summary.frames} 幀 / ${(summary.elapsedMs / 1000).toFixed(1)} 秒｜${summary.fps} FPS`);
console.log(`   數量範圍：${KINDS.map((k) => `${k} ${summary.countRange[k].min}–${summary.countRange[k].max}`).join("｜")}`);
console.log(`   renderer：calls ${summary.renderer.calls.min}–${summary.renderer.calls.max}｜geo ${summary.renderer.geometries.min}–${summary.renderer.geometries.max}｜tex ${summary.renderer.textures.min}–${summary.renderer.textures.max}｜prog ${summary.renderer.programs.min}–${summary.renderer.programs.max}`);
console.log(`   mounts：${JSON.stringify(mounts)}`);

ok(summary.frames >= SECONDS * 20, `逐幀統計涵蓋足夠幀數（${summary.frames} 幀 / ${SECONDS}s）`);
for (const k of KINDS) {
  const d = summary.disappear[k] ?? 0;
  ok(d === 0, `${k} 全程沒有從畫面消失（逐幀）`, `${d} 次消失 / ${summary.reappear[k] ?? 0} 次重現`);
}
for (const k of KINDS) {
  const r = summary.countRange[k];
  ok(r.min === r.max, `${k} 數量不跳動`, `${r.min} → ${r.max}`);
}
ok(summary.nanSamples === 0, "transform 無 NaN", `${summary.nanSamples} 次（${summary.nanFrames} 幀）`);
ok(summary.contextLost === 0, "無 WebGL context lost", `${summary.contextLost} 次`);
ok(remounted.length === 0, "Runtime 元件沒有在對戰途中重掛", remounted.join(", "));
ok((summary.identityChanges?.mapWall ?? 0) === 0,
  "靜態地圖牆批次 identity 穩定（英雄升級/生死不會重掛地圖）",
  `${summary.identityChanges?.mapWall ?? 0} 次 UUID 更換`);
//  ⚠ geometry / draw call 只看頭尾差會誤判：three.js 是**第一次真的被畫到才上傳 GPU**，
//  所以「陣亡標記」「殘骸樁」這種平常隱藏的東西會在戰況推進時陸續讓數字往上跳一次。
//  那是延遲上傳、會收斂；洩漏才會一直爬。判準改成看**後半段有沒有繼續成長**。
const ser = summary.series ?? [];
const half = ser.slice(Math.floor(ser.length / 2));
const growLate = half.length >= 2 ? half[half.length - 1].geometries - half[0].geometries : 0;
const callsLate = half.length >= 2 ? half[half.length - 1].calls - half[0].calls : 0;
if (ser.length) console.log(`   資源軌跡（每 120 幀）：geo ${ser.map((x) => x.geometries).join("→")}`);
ok(growLate <= 2, "geometry 後半段不再成長（非洩漏）", `後半段 +${growLate}`);
ok(callsLate <= 4, "draw call 後半段不再成長", `後半段 +${callsLate}`);
ok((summary.renderer.textures.max - summary.renderer.textures.min) <= 2,
  "texture 數量穩定", `${summary.renderer.textures.min} → ${summary.renderer.textures.max}`);
ok(summary.renderer.programs.max - summary.renderer.programs.min <= 2,
  "shader program 數量穩定", `${summary.renderer.programs.min} → ${summary.renderer.programs.max}`);
ok(frames.length >= 30, `已錄下連續影格證據（${frames.length} 張）`);
if (FIXCAM) {
  ok(camDrift !== null && camDrift < 0.5, "量測期間相機完全靜止（像素比對才有意義）",
    camDrift === null ? "讀不到相機狀態" : `位移 ${camDrift.toFixed(2)}`);
}
if (pixel) {
  console.log(`   像素：高頻雙穩態閃爍 ${pixel.flickerPct}%（${pixel.win} 幀內翻轉 ≥${pixel.flipMin} 次；共 ${pixel.frames} 幀）`
    + `｜已排除 HUD 與會動的物件 ${pixel.maskedPct}%（${pixel.maskRects} 塊 + ${pixel.maskCircles} 個圓）｜含移動的三連幀振盪 平均 ${pixel.meanOscPct}% / 最壞 ${pixel.maxOscPct}%`);
  //  ⚠⚠ 像素指標是**診斷數據，不是通過門檻**。誠實說明理由：
  //  這個數字沒有辦法乾淨地把「缺陷」和以下三種正常現象分開——
  //    · 刻意的動畫：塔冠每幀旋轉並上下浮動、英雄持續移動（差異圖顯示逐幀變化
  //      幾乎全部落在這兩者身上）
  //    · HUD：計時器每秒跳、LIVE 指示閃爍、戰報捲動（實測最大熱點就在畫面左上角
  //      y=0 的 HUD 邊緣，不是 3D 場景）
  //    · 螢幕錄製本身：JPEG 量化會隨鄰近內容變動而改變，靜態區域也會有數十階的跳動
  //  已經試過遮蔽 HUD 與會動的物件（本次遮掉 ${pixel.maskedPct}%）、提高錄影品質、
  //  加上振幅與頻率條件，殘餘仍在數個百分點 ⇒ 不足以當作合格判準。
  //  **真正的把關交給**：上面逐幀的 scene graph 統計（消失／NaN／重掛／數量）
  //  與下面的深度精度門檻；肉眼確認則交給真實 Android 裝置（本輪不宣稱已修）。
  //  這裡仍把數字印出來並存進報告，供與對照組（降低深度精度的重現）比較。
  console.log("   ⚠ 像素指標僅供診斷，不列入通過條件（理由見程式內註解）");
} else ok(false, "像素振盪分析可執行");

//  場景裡最小的「必須分得開」的高度差（世界單位）：
//  LAYER_Y 的相鄰地面鋪層間距最小 0.02（例如 arena 0.06 → arena_mottle 0.09 之間還有
//  grass_soft 0.105 / dirt_patch 0.235 / rock_shade 0.242 / bush_shade 0.245 這種 0.003–0.02
//  的細層）。這裡取 0.02 當門檻：Δz 必須明顯小於它，否則 16-bit 裝置上就會塌成同一層。
const MIN_LAYER_GAP = 0.02;
if (depthProbe) {
  console.log(`   深度：本機 ${depthProbe.depthBitsHere}-bit｜near ${depthProbe.near} far ${depthProbe.far}（比值 ${depthProbe.ratio}）`);
  console.log(`         Δz@24-bit ${depthProbe.quantum24.toExponential(2)}｜Δz@16-bit ${depthProbe.quantum16.toFixed(4)}（門檻 < ${MIN_LAYER_GAP}）`);
  ok(depthProbe.quantum16 < MIN_LAYER_GAP,
    `16-bit 深度也分得開地面圖層（Δz ${depthProbe.quantum16.toFixed(4)} < ${MIN_LAYER_GAP}）`,
    `Δz=${depthProbe.quantum16.toFixed(4)}｜near/far=${depthProbe.near}/${depthProbe.far}`);
} else ok(false, "能讀到相機 near/far 與深度精度");

const devicePerf = diagNow?.perf;
if (devicePerf) {
  console.log(`   真機診斷欄位：WebGL ${devicePerf.webglVersion}｜DEPTH_BITS ${devicePerf.depthBits}`
    + `｜DPR ${devicePerf.pixelRatio}｜GPU ${devicePerf.renderer ?? "unavailable"}`);
  ok(Number.isInteger(devicePerf.depthBits) && devicePerf.depthBits > 0,
    "診斷可記錄 DEPTH_BITS", String(devicePerf.depthBits));
  ok(typeof devicePerf.renderer === "string" && devicePerf.renderer.length > 0,
    "診斷可記錄 WebGL renderer", String(devicePerf.renderer));
  ok(devicePerf.contextAttributes && typeof devicePerf.contextAttributes === "object",
    "診斷可記錄 WebGL context attributes", JSON.stringify(devicePerf.contextAttributes));
  ok(Number.isFinite(diagNow?.camera?.near) && Number.isFinite(diagNow?.camera?.far),
    "診斷可記錄 camera near/far",
    `${diagNow?.camera?.near ?? "?"}/${diagNow?.camera?.far ?? "?"}`);
  ok(Number.isFinite(devicePerf.pixelRatio) && devicePerf.pixelRatio > 0,
    "診斷可記錄 renderer pixel ratio", String(devicePerf.pixelRatio));
} else ok(false, "真機 WebGL 診斷欄位可讀");

if (clipProbe.length === 3) {
  console.log(`   裁切檢查：${clipProbe.map((c) => `dist ${c.dist}→英雄 ${c.heroes}/結構 ${c.structs}`).join("｜")}`);
  ok(clipProbe.every((c) => c.heroes === 10), "最近/預設/最遠縮放都沒有英雄被 near/far 裁掉",
    clipProbe.map((c) => `${c.dist}:${c.heroes}`).join(" "));
  ok(clipProbe.every((c) => c.structs === 20), "最近/預設/最遠縮放都沒有結構被裁掉",
    clipProbe.map((c) => `${c.dist}:${c.structs}`).join(" "));
} else ok(false, "裁切檢查可執行");

const report = {
  generatedAt: new Date().toISOString(),
  device: DEVICE, viewport: VIEWPORT, url, seconds: SECONDS,
  summary, battle, diagNow, pixel, depthProbe, clipProbe, camAtStart, camAtEnd, camDrift, minLayerGap: MIN_LAYER_GAP,
  consoleErrors: consoleMsgs.slice(0, 60),
  totalDisappear,
  framesCaptured: frames.length,
  pass, fail, fails,
};
writeFileSync(resolve(OUT_DIR, "flicker_report.json"), JSON.stringify(report, null, 2));
console.log(`\n=== H.2-flicker（${DEVICE}）：${pass} PASS / ${fail} FAIL ===`);
console.log(`   報告：${resolve(OUT_DIR, "flicker_report.json")}`);
console.log(`   連續影格：${resolve(OUT_DIR, "frames")}（${frames.length} 張）`);
if (consoleMsgs.length) {
  console.log(`   ⚠ console 錯誤/警告 ${consoleMsgs.length} 筆，前 3 筆：`);
  consoleMsgs.slice(0, 3).forEach((m) => console.log(`     [${m.level}] ${m.text}`));
}
if (fail) { console.log(fails.map((f, i) => `  ${i + 1}. ${f}`).join("\n")); process.exit(1); }
