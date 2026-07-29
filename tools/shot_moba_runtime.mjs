// ============================================================================
//  tools/shot_moba_runtime.mjs — **正式戰鬥畫面**的真實 Chrome 截圖（Milestone H.1-close）
//
//  與 tools/shot_moba_map.mjs 的差別：那支拍的是 Debug 地圖預覽頁，這支拍的是
//  **正式的 GameView**（同一個元件、同一個 LogicEngine、同一份 useGameStore），
//  只是用 ?debug=moba-runtime-battle 跳過首頁與賽前流程直接開局。
//  ⇒ 截到的畫面可以證明是正式對戰 snapshot，不是地圖示意圖。
//
//  ── H.1-close 為什麼整支重寫 ────────────────────────────────────────────────
//  舊版用 `--headless=new` + `--use-angle=swiftshader`（CPU 軟體 WebGL）。
//  那能證明「畫得出來」，但**不能拿來當效能數字**：SwiftShader 的 FPS 與真實
//  GPU 無關。H.1 驗收要求真實 GPU 的 FPS / draw call / 三角形數
//  ⇒ 本版改用**有視窗的真實 Chrome**（真的 GPU），並從 three.js 的
//    `renderer.info` 與 rAF 計數讀回真實數字（不是估的、不是手抄的）。
//
//  另外補齊三件舊版沒做的事：
//    ① 全場截圖會先把相機拉到「剛好看得見整張地圖」（舊版預設距離只拍得到 4–5 人）
//    ② 每張圖都連帶抓 window.__ESMO_RUNTIME_DIAG()（每名英雄的
//       id/team/alive/position/scale/visible/geometryType）寫進 shot_stats.json
//    ③ 拍完戰鬥再走「快速完成 → 觀看重播」把 Replay 也拍下來（09）
//
//  用法：
//    node tools/shot_moba_runtime.mjs
//    node tools/shot_moba_runtime.mjs --out review/moba-runtime/h1
//    node tools/shot_moba_runtime.mjs --url http://localhost:5173/ESMO-
//    node tools/shot_moba_runtime.mjs --headless        # 只想看畫面對不對，不取效能數字
//    node tools/shot_moba_runtime.mjs --mobile-only --mobile-width 390 --mobile-height 844
//                                            # 只拍指定手機 viewport（正式 GameView）
//  無 npm 相依（CDP 走 Node 內建 WebSocket）。
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
const has = (k) => process.argv.includes(k);
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/h1"));
const HEADLESS = has("--headless");
const MOBILE_ONLY = has("--mobile-only");
const MOBILE_WAIT_TS = Math.max(1, Number(arg("--mobile-wait-ts", "160")) || 160);

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

//  桌機拍大一點：全場截圖要看得出 10 個人，1600×1000 每個人只有 ~25px。
const DESK = { w: 1920, h: 1200 };
const MOB = {
  w: Math.max(320, Number(arg("--mobile-width", "430")) || 430),
  h: Math.max(568, Number(arg("--mobile-height", "900")) || 900),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { redirect: "manual" }); if (r.status < 500) return true; }
    catch { /* 還沒起來 */ }
    await sleep(500);
  }
  return false;
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    return c;
  }
  /**
   * ⚠ 一定要有 timeout。CDP 連線若中途斷掉（分頁崩潰、dist 被別的行程重建、
   * 瀏覽器被關掉），沒有 timeout 的話這個 Promise 永遠不會 settle
   * ⇒ Node 直接以「unsettled top-level await」結束，錯誤訊息完全看不出原因
   * （H.1-close 真的踩過：背景同時跑 runtime29 重建了 dist）。
   */
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`CDP ${method} 逾時 ${timeoutMs}ms（連線可能已中斷）`));
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

/** 讀 runtime 的驗收探針（未掛載時回 null，不丟例外）。 */
const diag = (cdp) => evaluate(cdp, "window.__ESMO_RUNTIME_DIAG ? window.__ESMO_RUNTIME_DIAG() : null");

/**
 * 依文字內容點畫面上的控制項。
 * ⚠ 不能只找 <button>：HUD 有不少控制項是帶 onClick 的 <div>（例如十人面板的收合把手）。
 *   這裡掃全部元素，取**最內層**的相符節點再 click（React 的委派監聽照樣收得到）。
 */
const clickByText = (cdp, text) => evaluate(cdp, `(() => {
  const needle = ${JSON.stringify(text)};
  const hits = [...document.querySelectorAll("button,[role=button],div,span,a")]
    .filter((el) => (el.textContent || "").includes(needle) && el.offsetParent !== null);
  if (!hits.length) return false;
  //  最內層 = 沒有其它命中節點是它的子孫
  const el = hits.find((a) => !hits.some((b) => b !== a && a.contains(b))) ?? hits[hits.length - 1];
  el.click();
  return true;
})()`);

/**
 * 收合底部十人面板。
 * 全場截圖時它會蓋住藍方半場（驗收要求「HUD 不得遮住主要戰鬥區」）。
 * 這是**呈現層**的收合鈕，玩家自己也按得到；不影響任何比賽資料。
 */
async function collapseTeamPanel(cdp) {
  //  收合後把手文字會從「▾ 收合」變成「▴ 展開」⇒ 用它確認真的收起來了（點錯就再試一次）
  for (let i = 0; i < 2; i++) {
    const collapsed = await evaluate(cdp, `(document.body.innerText || "").includes("▴ 展開")`);
    if (collapsed) return true;
    await clickByText(cdp, "隊伍面板");
    await sleep(400);
  }
  return !!(await evaluate(cdp, `(document.body.innerText || "").includes("▴ 展開")`));
}

/** 收合 DEV／診斷面板；它只提供文字探針，不應蓋住正式視覺證據。 */
async function collapseRuntimeDiagnostics(cdp) {
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll("button")]
      .find((el) => (el.textContent || "").trim() === "收合");
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (clicked) await sleep(300);
  return clicked;
}

/**
 * 「這張圖真的是正式 GameView 嗎」的畫面內證據：
 *   · GameView.jsx 底部的掛載信標 "ESMO 主幹"
 *   · 沒有任何 Debug 地圖預覽頁的痕跡（圖層鈕 / 可走性 / 座標標記）
 */
const formalGameViewCheck = (cdp) => evaluate(cdp, `(() => {
  const txt = document.body.innerText || "";
  const debugUi = ["可走性", "鏡射檢查", "圖層", "座標標記"].filter((k) => txt.includes(k));
  return { beacon: txt.includes("ESMO 主幹"), debugUiFound: debugUi };
})()`);

/**
 * HUD 是否蓋住英雄？
 * 把每個 HUD 面板的實際 bounding rect 和每名英雄的畫面座標比對
 * ⇒ 「HUD 不得遮住主要戰鬥區」這條驗收有客觀數字，不必只靠目視。
 */
const hudOcclusion = (cdp, heroes) => evaluate(cdp, `(() => {
  const heroes = ${JSON.stringify(heroes)};
  //  ⚠ 英雄的 xPct/yPct 是**相對於 3D 畫布**的 NDC，不是相對於視窗。
  //  重播畫面的 Canvas 只佔視窗的一部分（上有標頭、下有播放列）
  //  ⇒ 用 window 尺寸換算會把英雄算到錯的像素位置，得出假的「被 HUD 蓋住」。
  //  一律取**最後一個**（= 最上層 / 目前這一套）canvas 的實際 bounding rect。
  const cvs = [...document.querySelectorAll("canvas")];
  const cv = cvs[cvs.length - 1];
  if (!cv) return { hudPanelCount: null, heroesCoveredByHud: null, note: "no canvas" };
  const cr = cv.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  //  取「會擋住畫面」的 HUD 區塊：明確不透明背景、面積夠大、不是 canvas
  const panels = [...document.querySelectorAll("div")]
    .filter((el) => {
      const s = getComputedStyle(el);
      if (s.pointerEvents === "none" && s.background.includes("rgba(0, 0, 0, 0)")) return false;
      const bg = s.backgroundColor;
      const m = bg.match(/rgba?\\(([^)]+)\\)/);
      const alpha = m ? (Number(m[1].split(",")[3] ?? 1)) : 0;
      if (!(alpha >= 0.5)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 90 && r.height > 40 && r.width * r.height < W * H * 0.6;
    })
    .map((el) => el.getBoundingClientRect())
    //  只留最外層的面板（避免同一面板的內層 div 重複計算）
    .filter((r, i, all) => !all.some((o, j) => j !== i && o.left <= r.left && o.top <= r.top && o.right >= r.right && o.bottom >= r.bottom && (o.width * o.height) > (r.width * r.height)));
  const covered = heroes.filter((h) => {
    if (!h.screen || !h.onScreen) return false;
    const x = cr.left + (h.screen.xPct / 100) * cr.width;
    const y = cr.top + (h.screen.yPct / 100) * cr.height;
    return panels.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  }).map((h) => h.id);
  return {
    hudPanelCount: panels.length,
    heroesCoveredByHud: covered,
    canvasRect: { x: Math.round(cr.left), y: Math.round(cr.top), w: Math.round(cr.width), h: Math.round(cr.height) },
    canvasCount: cvs.length,
  };
})()`);

/**
 * 畫面中央那條擊殺快報（BattleFloatingText，top:26% / zIndex:11，壽命 2.6 秒）
 * 正在播嗎？它會蓋住中路與大型目標區，Codex H.1 視覺驗收就是被它擋到。
 * 它是**短暫**的，所以按快門前等它播完就好，不必改任何 UI。
 */
const announcementUp = (cdp) => evaluate(cdp, `(() => {
  return [...document.querySelectorAll("div")].some((d) => {
    const s = getComputedStyle(d);
    if (s.position !== "absolute" || s.zIndex !== "11" || s.pointerEvents !== "none") return false;
    const r = d.getBoundingClientRect();
    return r.height > 20 && (d.textContent || "").trim().length > 0;
  });
})()`);

async function waitNoAnnouncement(cdp, maxMs = 8000) {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    if (!(await announcementUp(cdp).catch(() => false))) return true;
    await sleep(400);
  }
  return false;
}

/**
 * 十名英雄在畫面上「數得出來」嗎？
 * 回傳最小的兩兩畫面距離（以畫面寬的百分比計）。互相重疊時這個值會趨近 0
 * ⇒ 全場截圖就挑這個值最大的一瞬間按快門，而不是隨便一幀。
 */
function separationOf(d) {
  const hs = (d?.heroRenderDiagnostics ?? []).filter((h) => h.onScreen && h.screen);
  if (hs.length < 10) return { onScreen: hs.length, minGapPct: 0 };
  let min = Infinity;
  for (let i = 0; i < hs.length; i++) {
    for (let j = i + 1; j < hs.length; j++) {
      const dx = hs[i].screen.xPct - hs[j].screen.xPct;
      const dy = hs[i].screen.yPct - hs[j].screen.yPct;
      min = Math.min(min, Math.hypot(dx, dy));
    }
  }
  return { onScreen: hs.length, minGapPct: +min.toFixed(2) };
}

/**
 * 等一個「十人全在畫面上、彼此分得開、而且沒有中央快報擋住」的瞬間。
 * 找不到理想幀就取這段時間內**最好的一幀**，並如實回報實際分離度（不假裝達標）。
 */
async function waitCountableFrame(cdp, { targetGapPct = 2.2, maxSec = 150 } = {}) {
  let best = { minGapPct: -1 };
  for (let i = 0; i < maxSec; i++) {
    const d = await diag(cdp);
    const sep = separationOf(d);
    const clear = !(await announcementUp(cdp).catch(() => false));
    if (clear && sep.minGapPct > best.minGapPct) best = { ...sep, at: i };
    if (clear && sep.onScreen === 10 && sep.minGapPct >= targetGapPct) return { ...sep, ideal: true };
    await sleep(1000);
  }
  await waitNoAnnouncement(cdp);
  return { ...best, ideal: false };
}

async function shoot(cdp, file, extra = {}) {
  await sleep(500);                                  // 讓 WebGL 多畫幾幀再按快門
  const d = await diag(cdp);
  const occ = d ? await hudOcclusion(cdp, d.heroRenderDiagnostics ?? []).catch(() => null) : null;
  const gv = await formalGameViewCheck(cdp).catch(() => null);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT_DIR, file), Buffer.from(shot.data, "base64"));
  return {
    file, diag: d,
    isFormalGameView: gv ? gv.beacon : null,
    debugUiFound: gv ? gv.debugUiFound : null,
    hudOcclusion: occ,
    ...extra,
  };
}

// ── 主流程 ────────────────────────────────────────────────────────────────
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error("找不到 Chrome / Edge。"); process.exit(2); }

let server = null;
let baseUrl = arg("--url", "");
if (!baseUrl) {
  baseUrl = "http://localhost:4174";
  server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "preview", "--", "--port", "4174", "--strictPort"],
    { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
}
if (!await waitForServer(baseUrl)) {
  console.error(`伺服器沒起來：${baseUrl}（先 npm run build）`); server?.kill(); process.exit(3);
}

const profile = resolve(ROOT, "node_modules/.cache", `esmo-rt-${process.pid}`);
const port = 9600 + (process.pid % 200);
//  ⚠ 真實 GPU：**不加** --headless、不加 --use-angle=swiftshader。
//    效能數字必須來自真的顯示卡，否則 H.1 的效能驗收沒有意義。
const flags = [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--hide-scrollbars", "--force-device-scale-factor=1",
  `--window-size=${DESK.w},${DESK.h}`, "--window-position=0,0",
  "--autoplay-policy=no-user-gesture-required",
];
if (HEADLESS) flags.push("--headless=new", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader");
const browser = spawn(chrome, [...flags, "about:blank"], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  await sleep(250);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { /* 還沒起來 */ }
}
if (!wsUrl) { console.error("Chrome CDP 沒開起來。"); browser.kill(); server?.kill(); process.exit(4); }

mkdirSync(OUT_DIR, { recursive: true });
const root = await CDP.connect(wsUrl);
const { targetId } = await root.send("Target.createTarget", { url: "about:blank" });
const tab = await CDP.connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
await tab.send("Page.enable");
await tab.send("Runtime.enable");

const results = [];
let failed = 0;
const fail = (file, why) => { console.error(`  ✗ ${file}：${why}`); failed++; results.push({ file, ok: false, error: why }); };

/** 開一場新的正式對戰，並等到指定模擬秒數。 */
async function openBattle({ w, h, query, waitTs, label }) {
  await tab.send("Emulation.setDeviceMetricsOverride",
    { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  const qs = new URLSearchParams({
    //  ⚠ waitTs 設 1（不是 999）：harness 只用它決定何時把「等待戰鬥推進到 …s」
    //  這行**截圖模式提示字**收掉。設 999 的話它永遠不會消失，會壓在小地圖上，
    //  被視覺驗收當成「HUD 文字被裁切」（Codex H.1 實際提過）。
    //  真正的取樣時機由本工具自己輪詢 __BATTLE_TS 決定，不靠這個參數。
    debug: "moba-runtime-battle", shot: label, waitTs: String(waitTs), ...query,
  }).toString();
  const url = `${baseUrl}/?${qs}`;
  await tab.send("Page.navigate", { url });
  console.log(`— PASS ${label}：${url}`);
  //  等 GameView 掛好、Canvas 出現、探針就緒
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const ready = await evaluate(tab, "!!(document.querySelector('canvas') && window.__ESMO_RUNTIME_DIAG)")
      .catch(() => false);
    if (ready) return true;
  }
  return false;
}

/** 等比賽推進到 ts（回傳實際 ts；逾時回 null）。 */
async function waitTs(target, maxMin = 12) {
  const deadline = Date.now() + maxMin * 60 * 1000;
  //  ⚠ 不可以無限吞錯：瀏覽器視窗被關掉 / 分頁崩潰時，evaluate 會一直失敗，
  //  舊寫法只是 catch 成 -1 繼續空轉滿 12 分鐘，最後什麼都沒拍到也看不出原因。
  //  連續失敗就直接拋，讓上層立刻報「瀏覽器不見了」。
  let consecutiveErrors = 0;
  while (Date.now() < deadline) {
    let ts = -1, over = false, errored = false;
    try {
      ts = Number(await evaluate(tab, "window.__BATTLE_TS ?? -1"));
      over = !!(await evaluate(tab, "(window.__BATTLE_STATS && window.__BATTLE_STATS.over) || false"));
    } catch { errored = true; }
    if (errored) {
      if (++consecutiveErrors >= 5) {
        throw new Error("與瀏覽器的連線已中斷（視窗被關閉或分頁崩潰）——截圖中止");
      }
    } else consecutiveErrors = 0;
    if (!errored && (ts >= target || over)) return ts;
    await sleep(1000);
  }
  return null;
}

const setCam = (o) => evaluate(tab, `window.__ESMO_RUNTIME_SETCAM ? JSON.stringify(window.__ESMO_RUNTIME_SETCAM(${JSON.stringify(o)})) : null`);

// ── PASS 1：桌機 runtime-v2（01 / 02 / 03 / 04 / 05）────────────────────────
if (!MOBILE_ONLY) {
  const okOpen = await openBattle({ ...DESK, query: { mapPresentation: "runtime-v2" }, waitTs: 1, label: "runtime-desktop" });
  if (!okOpen) fail("01_runtime_full_battle.png", "GameView / runtime 探針未就緒");
  else {
    await collapseTeamPanel(tab);
    await collapseRuntimeDiagnostics(tab);

    // ② 前期三路分布（拉到全場才看得出三路）
    let ts = await waitTs(80);
    await setCam({ fitAll: true });
    results.push(await shoot(tab, "02_runtime_early_lane.png", { ok: true, phase: "early", simTs: ts }));
    console.log(`  ✓ 02_runtime_early_lane.png @ ts=${ts}`);

    // ① 全場：相機拉到剛好看得見整張地圖，且**等到十人真的數得出來**才按快門。
    //    Codex H.1 視覺驗收把「全場圖數不出 10 人」列為 blocking：原因是隨便取一幀時
    //    常常好幾個人疊在同一個點上，再加上中央擊殺快報蓋住中路。
    ts = await waitTs(240);
    await setCam({ fitAll: true });
    const sep = await waitCountableFrame(tab);
    results.push(await shoot(tab, "01_runtime_full_battle.png", {
      ok: true, phase: "full", simTs: ts, heroSeparation: sep,
    }));
    console.log(`  ✓ 01_runtime_full_battle.png @ ts=${ts}（十人分離度 ${sep.minGapPct}%${sep.ideal ? "" : "：未達理想值，取區間內最佳幀"}）`);

    // ④ 大型目標區：把相機對準 dragon / baron，等有英雄靠近再按快門
    {
      const d0 = await diag(tab);
      const pit = (d0?.objectiveState ?? []).find((o) => o.type === "dragon")
        ?? (d0?.objectiveState ?? []).find((o) => o.type === "baron");
      if (pit) {
        await setCam({ dist: 150, panX: pit.world.x, panZ: pit.world.z });
        //  等到真的有英雄站在坑口附近（世界距離 < 90）才拍，不然只是拍一個空坑
        let near = 0;
        for (let i = 0; i < 90; i++) {
          const d = await diag(tab);
          near = (d?.heroRenderDiagnostics ?? []).filter((h) =>
            h.position && Math.hypot(h.position.x - pit.world.x, h.position.z - pit.world.z) < 90).length;
          if (near > 0) break;
          await sleep(1000);
        }
        results.push(await shoot(tab, "04_runtime_objective.png", { ok: true, phase: "objective", heroesNearObjective: near, objective: pit.type }));
        console.log(`  ✓ 04_runtime_objective.png（目標區 ${pit.type}，附近英雄 ${near}）`);
      } else fail("04_runtime_objective.png", "diag 沒有回報任何大型目標");
    }

    // ⑤ 英雄近景：對準藍紅距離最近的一對，確認膠囊本體 / 血條 / 等級 / 名稱 / 選取環
    {
      const d = await diag(tab);
      const hs = d?.heroRenderDiagnostics ?? [];
      let best = null;
      for (const b of hs.filter((h) => h.team === "blue" && h.position)) {
        for (const r of hs.filter((h) => h.team === "red" && h.position)) {
          const dist = Math.hypot(b.position.x - r.position.x, b.position.z - r.position.z);
          if (!best || dist < best.dist) best = { dist, x: (b.position.x + r.position.x) / 2, z: (b.position.z + r.position.z) / 2 };
        }
      }
      if (best) {
        await setCam({ dist: 95, panX: best.x, panZ: best.z });
        results.push(await shoot(tab, "05_runtime_hero_closeup.png", { ok: true, phase: "closeup", blueRedGap: +best.dist.toFixed(1) }));
        console.log(`  ✓ 05_runtime_hero_closeup.png（藍紅最近距離 ${best.dist.toFixed(1)}）`);
      } else fail("05_runtime_hero_closeup.png", "diag 沒有可用的英雄座標");
    }

    // ③ 中期：塔有狀態變化 + 有英雄交戰／死亡
    {
      const ts3 = await waitTs(400);
      await setCam({ fitAll: true });
      //  驗收要求這張要同時看得到「塔有狀態變化」與「英雄交戰／死亡狀態」。
      //  塔被推掉是**不可逆**的（等到就一直成立），但死亡只持續到重生
      //  ⇒ 優先等到「有塔被推掉 **且** 有人正躺著」的那一瞬間；等不到就退而求其次，
      //     並如實記錄實際拍到什麼（不假裝拍到了死亡狀態）。
      let d3 = await diag(tab);
      for (let i = 0; i < 150; i++) {
        d3 = await diag(tab);
        if ((d3?.towerDestroyedCount ?? 0) > 0 && (d3?.deadHeroCount ?? 0) > 0) break;
        await sleep(1000);
      }
      //  ⚠ 拍到「資料上有屍體」不等於「畫面上看得出屍體」——Codex 視覺驗收就是卡在這裡。
      //  有陣亡英雄時，把鏡頭拉到看得清楚的距離並對準他，讓陣亡狀態成為**可見證據**；
      //  距離仍留得夠遠，周圍的塔與戰況一起入鏡。
      const corpse = (d3?.heroRenderDiagnostics ?? []).find((h) => h.alive === false && h.positionFinite);
      if (corpse) await setCam({ dist: 165, panX: corpse.position.x, panZ: corpse.position.z });
      else await setCam({ fitAll: true });
      await sleep(400);
      const d3b = await diag(tab);
      const corpseNow = (d3b?.heroRenderDiagnostics ?? []).find((h) => h.alive === false);
      results.push(await shoot(tab, "03_runtime_midgame.png", {
        ok: true, phase: "mid", simTs: ts3,
        capturedTowerChange: (d3?.towerDestroyedCount ?? 0) > 0,
        capturedDeadHero: (d3?.deadHeroCount ?? 0) > 0,
        //  陣亡呈現的可查證訊號（畫面證據仍以截圖為準，這只是輔助）
        deadHeroRender: corpseNow ? {
          id: corpseNow.id, team: corpseNow.team,
          onScreen: corpseNow.onScreen, screen: corpseNow.screen,
          deathMarkVisible: corpseNow.deathMarkVisible,
          bodyLyingDown: corpseNow.bodyLyingDown,
          materialOpacity: corpseNow.materialOpacity,
        } : null,
      }));
      console.log(`  ✓ 03_runtime_midgame.png @ ts=${ts3}（塔已推 ${d3?.towerDestroyedCount ?? 0}／陣亡中 ${d3?.deadHeroCount ?? 0}）`);
    }

    // ── ⑥ legacy 對照：**同一場戰鬥**按畫面上的「地圖 新版／舊版」切過去再切回來 ──
    //    舊版是另外開一場（不同 seed）⇒ 只能比「畫面長相」，不能比資料。
    //    直接在同一場切呈現模式，兩張圖就是**同一顆引擎、同一份 snapshot**的兩種畫法。
    {
      const before = JSON.parse(await evaluate(tab, "JSON.stringify(window.__BATTLE_STATS ?? {})") || "{}");
      const toggled = await clickByText(tab, "地圖 新版");
      if (!toggled) fail("06_legacy_compare.png", "找不到「地圖 新版」切換鈕");
      else {
        await sleep(2500);                                  // 等 legacy 的 Canvas 掛好並畫幾幀
        const isLegacy = await evaluate(tab, `(document.body.innerText || "").includes("地圖 舊版")`);
        const after = JSON.parse(await evaluate(tab, "JSON.stringify(window.__BATTLE_STATS ?? {})") || "{}");
        results.push(await shoot(tab, "06_legacy_compare.png", {
          ok: true, phase: "legacy", simTs: after.ts ?? null, legacyStats: after,
          sameMatchToggle: true, switchedToLegacy: !!isLegacy,
          //  切換前後是同一場的證據：比分／塔數連續，ts 只往前走
          continuityBefore: before, continuityAfter: after,
        }));
        console.log(`  ✓ 06_legacy_compare.png @ ts=${after.ts}（同一場切 legacy＝${isLegacy}）`);
        //  切回 runtime-v2，後面的 Replay 才會用新地圖
        await clickByText(tab, "地圖 舊版");
        await sleep(2000);
      }
    }

    // ── 09：Replay（快速完成比賽 → 觀看重播 → 同一個 Runtime Renderer）──────
    {
      //  ⏩ 只在測試模式出現；harness 的 ?debug= 值被路由用掉了 ⇒ 直接寫 localStorage 旗標
      await evaluate(tab, "window.localStorage.setItem('esmo_debug','1')");
      await sleep(300);
      const clicked = await clickByText(tab, "快速完成");
      if (!clicked) fail("09_runtime_replay.png", "找不到「快速完成比賽」按鈕（測試模式未生效）");
      else {
        //  等終局畫面
        let end = false;
        for (let i = 0; i < 90 && !end; i++) {
          await sleep(1000);
          end = !!(await evaluate(tab, `[...document.querySelectorAll("button")].some((b)=>(b.textContent||"").includes("觀看重播"))`));
        }
        if (!end) fail("09_runtime_replay.png", "比賽未進入終局畫面（或此場無重播）");
        else if (!(await clickByText(tab, "觀看重播"))) fail("09_runtime_replay.png", "「觀看重播」按鈕不可點");
        else {
          //  等 replay 的 runtime-v2 畫面掛好且英雄還原
          let rdiag = null;
          for (let i = 0; i < 60; i++) {
            await sleep(1000);
            const mode = await evaluate(tab, `document.querySelector("[data-replay-presentation]")?.getAttribute("data-replay-presentation") ?? null`);
            rdiag = await diag(tab);
            if (mode === "runtime-v2" && (rdiag?.heroCount ?? 0) === 10) break;
          }
          if ((rdiag?.heroCount ?? 0) !== 10) {
            fail("09_runtime_replay.png", `Replay 未還原 10 名英雄（實得 ${rdiag?.heroCount ?? 0}）`);
          } else {
            //  驗收要求：暫停後畫面穩定 + 時間軸跳轉後位置更新
            const posOf = (d) => (d?.heroRenderDiagnostics ?? []).map((h) => `${h.id}:${h.position?.x?.toFixed(1)},${h.position?.z?.toFixed(1)}`).join("|");
            await clickByText(tab, "⏸");
            await sleep(900);
            const p1 = posOf(await diag(tab));
            await sleep(1200);
            const p2 = posOf(await diag(tab));
            const pauseStable = p1 === p2;
            //  時間軸跳轉：把 range slider 拉到 35%
            const seeked = await evaluate(tab, `(() => {
              const r = document.querySelector('input[type=range]');
              if (!r) return false;
              const max = Number(r.max) || 1;
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              setter.call(r, String(max * 0.35));
              r.dispatchEvent(new Event('input', { bubbles: true }));
              r.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            })()`);
            await sleep(1200);
            const p3 = posOf(await diag(tab));
            await setCam({ fitAll: true });
            //  重播是**疊在**還活著的 GameView 上面開的 ⇒ 底下那個 Canvas 會不會還掛著？
            //  這會影響效能與殘留的英雄名牌，必須量出來而不是猜。
            const layers = await evaluate(tab, `(() => ({
              canvasCount: document.querySelectorAll("canvas").length,
              heroLabelCount: [...document.querySelectorAll("div")].filter((d) => /^Lv\\d+\\s/.test((d.textContent||"").trim()) && d.children.length <= 2).length,
            }))()`);
            results.push(await shoot(tab, "09_runtime_replay.png", {
              ok: true, phase: "replay", presentation: "runtime-v2",
              replayLayerCheck: layers,
              replayPauseStable: pauseStable, replaySeekSupported: !!seeked, replaySeekChangedPositions: seeked ? p3 !== p2 : null,
            }));
            console.log(`  ✓ 09_runtime_replay.png（暫停穩定 ${pauseStable}／跳轉更新 ${seeked ? p3 !== p2 : "n/a"}）`);
            //  ⚠ 一定要把測試模式旗標關掉：它寫在 localStorage，會**跨頁面留下來**，
            //  讓後面 legacy / 手機幾張截圖出現紫色的「⏩ 快速完成比賽」Debug 按鈕
            //  ⇒ 驗收條件「Debug UI 未混入」直接不成立（H.1-close 實測踩過）。
            await evaluate(tab, "window.localStorage.removeItem('esmo_debug')");
          }
        }
      }
    }
  }
}

//  ⚠ 06 已經在 PASS 1 用「同一場切換呈現模式」拍完（見上面），
//    不再另外開一場 legacy ⇒ 兩張圖確定是同一顆引擎的同一份資料。

// ── PASS 2 / 3：手機（07 一般 / 08 mobile-low）──────────────────────────────
for (const [file, q, presetLabel] of [
  ["07_runtime_mobile.png", { mapPresentation: "runtime-v2", quality: "medium" }, "mobile"],
  ["08_runtime_mobile_low.png", { mapPresentation: "runtime-v2", quality: "low" }, "mobile-low"],
]) {
  const okOpen = await openBattle({ ...MOB, query: q, waitTs: 1, label: presetLabel });
  if (!okOpen) { fail(file, "手機視窗的 runtime 探針未就緒"); continue; }
  const ts = await waitTs(MOBILE_WAIT_TS);
  await collapseTeamPanel(tab);
  await collapseRuntimeDiagnostics(tab);
  //  手機不拍全場（430 寬拉到全場後英雄只剩幾個 px、什麼都認不出來）。
  //  驗收要求低階模式仍保留「英雄 / 塔 / 主堡 / 血條 / 關鍵 HUD」
  //  ⇒ 把鏡頭對到「藍方主堡 ↔ 英雄重心」的中點，讓這幾樣同時入鏡。
  let framing = null;
  {
    const d0 = await diag(tab);
    const nexus = (d0?.nexusWorld ?? []).find((n) => n.team === "blue") ?? (d0?.nexusWorld ?? [])[0];
    const hs = (d0?.heroRenderDiagnostics ?? []).filter((h) => h.position && h.positionFinite);
    const cx = hs.length ? hs.reduce((a, h) => a + h.position.x, 0) / hs.length : 0;
    const cz = hs.length ? hs.reduce((a, h) => a + h.position.z, 0) / hs.length : 0;
    //  往主堡方向由遠而近試幾個構圖，取**第一個真的同時看得到主堡與 ≥2 名英雄**的。
    //  （不是猜；每個候選都用 __ESMO_RUNTIME_PROJECT 投影回畫面驗證過。）
    //  由近而遠試：近的構圖英雄與血條才讀得出來，所以優先採用最近的可行構圖。
    const cands = [];
    for (const dist of [200, 240, 280, 320, 360]) {
      for (const w of [0.55, 0.75, 1.0]) {
        cands.push({
          dist,
          panX: nexus ? cx + (nexus.world.x - cx) * w : cx,
          panZ: nexus ? cz + (nexus.world.z - cz) * w : cz,
        });
      }
    }
    let best = null;
    for (const c of cands) {
      await setCam(c);
      await sleep(240);
      const d = await diag(tab);
      const nexusOn = (d?.nexusWorld ?? []).filter((n) => n.screen?.onScreen).length;
      const heroesOn = (d?.heroRenderDiagnostics ?? []).filter((h) => h.onScreen).length;
      const cand = { ...c, nexusOnScreen: nexusOn, heroesOnScreen: heroesOn };
      if (!best || heroesOn > best.heroesOnScreen) best = cand;      // 保底：至少挑英雄最多的
      if (nexusOn >= 1 && heroesOn >= 3) { best = cand; break; }     // 理想：主堡＋３名以上英雄
    }
    framing = best;
    if (framing) { await setCam(framing); await sleep(300); }
    console.log(`     構圖：dist=${framing?.dist} 主堡入鏡 ${framing?.nexusOnScreen} 英雄入鏡 ${framing?.heroesOnScreen}`);
  }
  //  小地圖有沒有被底部十人面板蓋住（Codex H.1 把它列為 blocking，修完要有數字證明）
  const safeArea = await evaluate(tab, `(() => {
    const cv = [...document.querySelectorAll("canvas")].find((c) => c.width === 150 && c.height === 150);
    //  ⚠ 不能用 find()：document 順序最前面的命中通常是**外層容器**（幾乎滿版），
    //  量出來會是假的重疊。要取所有命中裡**面積最小**的那個＝真正的面板本體。
    const panel = [...document.querySelectorAll("div")]
      .filter((d) => (d.textContent || "").includes("隊伍面板") && d.getBoundingClientRect().height > 20)
      .sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return (ra.width * ra.height) - (rb.width * rb.height);
      })[0];
    if (!cv || !panel) return { measured: false };
    const m = cv.getBoundingClientRect(), p = panel.getBoundingClientRect();
    const overlapY = Math.min(m.bottom, p.bottom) - Math.max(m.top, p.top);
    const overlapX = Math.min(m.right, p.right) - Math.max(m.left, p.left);
    return {
      measured: true,
      minimap: { top: Math.round(m.top), bottom: Math.round(m.bottom), right: Math.round(m.right) },
      teamPanel: { top: Math.round(p.top), bottom: Math.round(p.bottom) },
      overlapPx: Math.round(Math.max(0, Math.min(overlapY, overlapX)) > 0 ? Math.max(0, overlapY) : 0),
      minimapOverlapsTeamPanel: overlapY > 0 && overlapX > 0,
      minimapInsideViewport: m.right <= window.innerWidth + 1 && m.bottom <= window.innerHeight + 1,
    };
  })()`);
  console.log(`     safe area：小地圖與十人面板重疊 ${safeArea?.minimapOverlapsTeamPanel} (${safeArea?.overlapPx}px)`);
  results.push(await shoot(tab, file, { ok: true, phase: presetLabel, simTs: ts, activePreset: presetLabel, framing, safeArea }));
  console.log(`  ✓ ${file} @ ts=${ts}`);
}

// ── 組裝 shot_stats.json ────────────────────────────────────────────────────
const VIEWPORT = {
  "01_runtime_full_battle.png": DESK, "02_runtime_early_lane.png": DESK,
  "03_runtime_midgame.png": DESK, "04_runtime_objective.png": DESK,
  "05_runtime_hero_closeup.png": DESK, "06_legacy_compare.png": DESK,
  "09_runtime_replay.png": DESK,
  "07_runtime_mobile.png": MOB, "08_runtime_mobile_low.png": MOB,
};
const PRESET = {
  "07_runtime_mobile.png": "mobile", "08_runtime_mobile_low.png": "mobile-low",
};

const stats = results.map((r) => {
  const d = r.diag ?? null;
  const legacy = r.phase === "legacy";
  return {
    filename: r.file,
    screenshotSuccess: !!r.ok,
    error: r.error ?? null,
    phase: r.phase ?? null,
    capturedAt: new Date().toISOString(),
    snapshotTs: d?.ts ?? r.simTs ?? r.legacyStats?.ts ?? null,
    viewport: VIEWPORT[r.file] ?? null,
    presentationMode: legacy ? "legacy" : "runtime-v2",
    isRuntimeV2: !legacy,
    //  正式 GameView 的掛載信標（GameView.jsx 底部那行 "ESMO 主幹 · S16"）
    isFormalGameView: r.isFormalGameView ?? null,
    debugUiFound: r.debugUiFound ?? null,
    hudPanelCount: r.hudOcclusion?.hudPanelCount ?? null,
    heroesCoveredByHud: r.hudOcclusion?.heroesCoveredByHud ?? null,
    canvasRect: r.hudOcclusion?.canvasRect ?? null,
    canvasCount: r.hudOcclusion?.canvasCount ?? null,
    ...(r.capturedTowerChange !== undefined
      ? {
        capturedTowerChange: r.capturedTowerChange,
        capturedDeadHero: r.capturedDeadHero,
        deadHeroRender: r.deadHeroRender ?? null,
      } : {}),
    activePreset: PRESET[r.file] ?? "desktop",
    heroCount: d?.heroCount ?? r.legacyStats?.heroes ?? null,
    blueHeroCount: d?.blueHeroCount ?? r.legacyStats?.blue ?? null,
    redHeroCount: d?.redHeroCount ?? r.legacyStats?.red ?? null,
    visibleHeroIds: d?.visibleHeroIds ?? null,
    deadHeroCount: d?.deadHeroCount ?? r.legacyStats?.dead ?? null,
    towerAliveCount: d?.towerAliveCount ?? null,
    towerDestroyedCount: d?.towerDestroyedCount ?? r.legacyStats?.towersDown ?? null,
    nexusCount: d?.nexusCount ?? null,
    objectiveState: d?.objectiveState ?? null,
    cameraDistance: d?.cameraDistance ?? null,
    camera: d?.camera ?? null,
    adapterWarnings: d?.warnings ?? null,
    //  §4 要求：逐英雄的 id/team/alive/position/scale/visible/geometryType
    heroRenderDiagnostics: d?.heroRenderDiagnostics ?? null,
    performance: d?.performance ?? null,
    ...(r.heroesNearObjective !== undefined ? { heroesNearObjective: r.heroesNearObjective, objective: r.objective } : {}),
    ...(r.blueRedGap !== undefined ? { blueRedGap: r.blueRedGap } : {}),
    ...(r.framing ? { framing: r.framing, nexusOnScreen: r.framing.nexusOnScreen } : {}),
    ...(r.safeArea ? { safeArea: r.safeArea } : {}),
    ...(r.heroSeparation ? { heroSeparation: r.heroSeparation } : {}),
    ...(r.sameMatchToggle ? {
      sameMatchToggle: true, switchedToLegacy: r.switchedToLegacy,
      continuityBefore: r.continuityBefore, continuityAfter: r.continuityAfter,
    } : {}),
    nexusWorld: r.diag?.nexusWorld ?? null,
    ...(r.replayPauseStable !== undefined ? {
      replayPauseStable: r.replayPauseStable,
      replaySeekSupported: r.replaySeekSupported,
      replaySeekChangedPositions: r.replaySeekChangedPositions,
      replayLayerCheck: r.replayLayerCheck ?? null,
    } : {}),
  };
});

writeFileSync(resolve(OUT_DIR, "shot_stats.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  tool: "tools/shot_moba_runtime.mjs",
  browser: HEADLESS ? "chrome --headless=new (SwiftShader；效能數字不可採用)" : "chrome（有視窗、真實 GPU）",
  note: "所有截圖與統計皆來自正式 GameView（?debug=moba-runtime-battle）的同一套 LogicEngine / useGameStore。",
  shots: stats,
}, null, 2), "utf8");

// ── 效能表：desktop / mobile / mobile-low ───────────────────────────────────
const perfOf = (file) => stats.find((s) => s.filename === file)?.performance ?? null;
const perf = {
  generatedAt: new Date().toISOString(),
  method: HEADLESS
    ? "headless SwiftShader —— **不可作為正式效能依據**"
    : "有視窗的真實 Chrome；FPS 由 rAF 計數、draw calls / triangles / geometries / textures / programs 直接讀 three.js renderer.info（非估算、非人工抄錄）",
  manualVisualRead: false,
  desktop: perfOf("01_runtime_full_battle.png") ?? perfOf("03_runtime_midgame.png"),
  mobile: perfOf("07_runtime_mobile.png"),
  "mobile-low": perfOf("08_runtime_mobile_low.png"),
};
writeFileSync(resolve(OUT_DIR, "runtime_performance.json"), JSON.stringify(perf, null, 2), "utf8");

tab.close(); root.close(); browser.kill(); server?.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* 清不掉不影響 */ }

const okCount = stats.filter((s) => s.screenshotSuccess).length;
const expectedCount = MOBILE_ONLY ? 2 : 9;
console.log(`\n${okCount}/${expectedCount} 張正式戰鬥截圖已輸出：${OUT_DIR}`);
console.log(`   shot_stats.json / runtime_performance.json 已重建`);
if (perf.desktop?.renderer) console.log(`   GPU：${perf.desktop.renderer}`);
process.exit(failed === 0 && okCount === expectedCount ? 0 : 1);
