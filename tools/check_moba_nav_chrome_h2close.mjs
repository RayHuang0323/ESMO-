// ============================================================================
//  tools/check_moba_nav_chrome_h2close.mjs — H.2 碰撞／尋路的**真實 Chrome 驗收**
//
//  【為什麼需要這一支】H.2 的所有既有驗收都是 Node 端的幾何與統計
//  （`check_moba_nav_h2` 的距離場對稱、`bench_moba_baseline` 的勝率分布…）。
//  那些能證明「規則算對了」，但**證明不了畫面上的英雄真的不再穿牆**——
//  因為畫面走的是另一條路：GameView → MobaRuntimeView3D → mobaRuntimeMapAdapter。
//  H.2 的核心宣稱是「畫面上是牆、模擬裡就是牆」，就必須在**真實瀏覽器的正式戰鬥**裡驗。
//
//  【怎麼驗（不靠目視）】在真實 Chrome 開正式 GameView 的對戰（runtime-v2），
//  整場每 ~0.6 秒讀一次 `window.__ESMO_RUNTIME_DIAG()`，記下 10 名英雄的
//  **模擬座標**（`simPosition`，就是引擎 snapshot 的座標，不是畫面估算），
//  然後回 Node 用 `mobaNavigation` 對每一個取樣點實際判定：
//
//    A. 穿牆     clearanceAt(p) < HERO_RADIUS  ⇒ 這一幀英雄站在牆體裡
//    B. 穿結構   落在任何存活塔／主堡的碰撞圓內
//    C. 穿坑壁   落在龍坑／巴龍坑牆段裡（含在 A 的距離場，另外分類回報）
//    D. 卡死     連續 N 次取樣位移 < 門檻，且該英雄活著、狀態不是回城/待命
//    E. 抖動     在小範圍內來回、淨位移趨近 0 但路徑長很長
//    F. 走得到   有英雄從基地走到三路（lane 中段）、有英雄進出野區
//    G. 閃爍     每幀 `visibleHeroIds` / `positionFinite` 是否有英雄無故消失
//
//  ⚠ 取樣的是**引擎座標**，判定用的是**畫面地圖幾何**（mobaNavigation 的距離場
//    來自 mapTerrainShapes 的 wallItems，就是 Renderer 畫出來的那些牆）。
//    兩者對得上才算 H.2 成立——這正是要驗的東西。
//
//  用法：
//    node tools/check_moba_nav_chrome_h2close.mjs --url http://localhost:5173/ESMO-
//    node tools/check_moba_nav_chrome_h2close.mjs --out review/moba-runtime/h2-close
//  無 npm 相依（CDP 走 Node 內建 WebSocket）。真實 GPU（不加 --headless）。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HERO_RADIUS, clearanceAt, structureAt, structureList } from "../src/battle/moba/nav/mobaNavigation.js";
import { PITS, BASE, posOnLane } from "../src/gameData.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/h2-close"));
const BASE_URL = arg("--url", "http://localhost:5173/ESMO-");
const SAMPLE_MS = 600;
const MAX_MIN = Number(arg("--maxmin", "14"));

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const DESK = { w: 1920, h: 1200 };
const MOB = { w: 430, h: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

//  ── 判定門檻（都寫成常數並在報告裡印出來，不埋在程式裡）────────────────────
const TOL = {
  //  clearance 是 1.0 格點距離場的取樣值，量化誤差約半格
  //  ⇒ 低於 HERO_RADIUS 超過這個容差才算「真的站進牆裡」，避免把格點雜訊報成穿牆。
  wall: 0.75,
  //  結構圓同理留一點餘裕（碰撞用的是圓，取樣是離散時間點）
  struct: 0.6,
  //  卡死：連續這麼多次取樣（× SAMPLE_MS）幾乎沒動
  stuckSamples: 25,          // 25 × 0.6s ≈ 15 秒
  stuckMove: 1.5,            // 模擬單位
  //  抖動：一段窗內走了很多路但淨位移很小
  jitterWindow: 20,
  jitterPathMin: 18,
  jitterNetMax: 3,
};

async function waitForServer(url, tries = 60) {
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
const diag = (cdp) => evaluate(cdp, "window.__ESMO_RUNTIME_DIAG ? window.__ESMO_RUNTIME_DIAG() : null");
const setCam = (cdp, o) => evaluate(cdp, `window.__ESMO_RUNTIME_SETCAM ? JSON.stringify(window.__ESMO_RUNTIME_SETCAM(${JSON.stringify(o)})) : null`);
const clickByText = (cdp, text) => evaluate(cdp, `(() => {
  const needle = ${JSON.stringify(text)};
  const hits = [...document.querySelectorAll("button,[role=button],div,span,a")]
    .filter((el) => (el.textContent || "").includes(needle) && el.offsetParent !== null);
  if (!hits.length) return false;
  const el = hits.find((a) => !hits.some((b) => b !== a && a.contains(b))) ?? hits[hits.length - 1];
  el.click();
  return true;
})()`);

async function collapseTeamPanel(cdp) {
  for (let i = 0; i < 2; i++) {
    if (await evaluate(cdp, `(document.body.innerText || "").includes("▴ 展開")`)) return true;
    await clickByText(cdp, "隊伍面板");
    await sleep(400);
  }
  return !!(await evaluate(cdp, `(document.body.innerText || "").includes("▴ 展開")`));
}

async function shoot(cdp, file) {
  await sleep(500);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(resolve(OUT_DIR, file), Buffer.from(shot.data, "base64"));
  return file;
}

// ── 主流程 ────────────────────────────────────────────────────────────────
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error("找不到 Chrome / Edge。"); process.exit(2); }
if (!await waitForServer(BASE_URL)) { console.error(`伺服器沒回應：${BASE_URL}`); process.exit(3); }
mkdirSync(OUT_DIR, { recursive: true });

const profile = resolve(ROOT, "node_modules/.cache", `esmo-h2c-${process.pid}`);
const port = 9800 + (process.pid % 150);
//  ⚠ 真實 GPU：不加 --headless、不加 swiftshader。
const browser = spawn(chrome, [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--hide-scrollbars", "--force-device-scale-factor=1",
  `--window-size=${DESK.w},${DESK.h}`, "--window-position=0,0",
  "--autoplay-policy=no-user-gesture-required", "about:blank",
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

const shots = [];
const samples = [];          // [{ ts, heroes:[{id,team,alive,sim:{x,y},visible,positionFinite,onScreen}] }]
let perfSample = null;
let gameViewBeacon = null;

async function openBattle({ w, h, label }) {
  await tab.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  const qs = new URLSearchParams({
    debug: "moba-runtime-battle", shot: label, waitTs: "1", mapPresentation: "runtime-v2",
  }).toString();
  const url = `${BASE_URL}/?${qs}`;
  await tab.send("Page.navigate", { url });
  console.log(`  開啟正式戰鬥：${url}`);
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const ready = await evaluate(tab, "!!(document.querySelector('canvas') && window.__ESMO_RUNTIME_DIAG)").catch(() => false);
    if (ready) return true;
  }
  return false;
}

console.log("── H.2-close：真實 Chrome 碰撞／尋路驗收 ──");
if (!await openBattle({ ...DESK, label: "h2close-desktop" })) {
  console.error("GameView / runtime 探針未就緒"); browser.kill(); process.exit(5);
}
gameViewBeacon = await evaluate(tab, `(() => {
  const txt = document.body.innerText || "";
  return { beacon: txt.includes("ESMO 主幹"), debugUi: ["可走性","鏡射檢查","圖層","座標標記"].filter((k) => txt.includes(k)) };
})()`).catch(() => null);
await collapseTeamPanel(tab);
await setCam(tab, { fitAll: true });

//  ── 整場取樣 ──────────────────────────────────────────────────────────────
console.log("  取樣中（每 0.6 秒一次，直到比賽結束）…");
//  ⚠ 截圖必須在**比賽進行中**拍。第一版是取樣結束後才拍，結果整組截圖都被終局
//  結算畫面（DEFEAT / MVP / 記分板）蓋住，完全看不到戰場——那種圖不能當驗收證據。
//  這裡把截圖排進取樣迴圈：到指定的比賽時間就拍一張，拍完繼續取樣。
const shotPlan = [
  { at: 240, name: "01_desktop_full_battle.png", kind: "full" },
  { at: 330, name: "02_desktop_hero_near_jungle_wall.png", kind: "jungleWall" },
  { at: 420, name: "03_desktop_hero_near_tower.png", kind: "tower" },
  { at: 510, name: "04_mobile_full_battle.png", kind: "mobileFull" },
  { at: 560, name: "05_mobile_closeup.png", kind: "mobileCloseup" },
];
let shotIdx = 0;
const deadline = Date.now() + MAX_MIN * 60 * 1000;
let over = false, errs = 0, lastLog = 0;
while (Date.now() < deadline && !over) {
  let d = null;
  try { d = await diag(tab); } catch { if (++errs >= 5) { console.error("與瀏覽器連線中斷"); break; } }
  if (d) {
    errs = 0;
    over = !!d.over;
    samples.push({
      ts: d.ts ?? null,
      heroes: (d.heroRenderDiagnostics ?? []).map((h) => ({
        id: h.id, team: h.team, alive: h.alive, actionState: h.actionState,
        sim: h.simPosition, raw: h.rawSimPosition,
        visible: h.visible, positionFinite: h.positionFinite, onScreen: h.onScreen,
      })),
      //  ⚠ 逐座結構的存活狀態：已摧毀的塔在 H.2 是明確放行的，
      //  拿「全部塔都活著」去判定會把「站在拆掉的塔原地」誤報成穿塔。
      aliveStructs: (d.structureState ?? []).filter((x) => x.alive).map((x) => x.id),
      towerAlive: d.towerAliveCount ?? null,
      towerDead: d.towerDestroyedCount ?? null,
    });
    if (!perfSample && d.performance) perfSample = d.performance;
    if (d.performance) perfSample = d.performance;
    if (d.ts != null && d.ts - lastLog >= 120) { lastLog = d.ts; console.log(`    ts=${Math.round(d.ts)}s 取樣 ${samples.length} 筆（塔已推 ${d.towerDestroyedCount ?? 0}）`); }

    //  ── 到點就拍（比賽仍在進行中）────────────────────────────────────────
    const plan = shotPlan[shotIdx];
    if (plan && d.ts != null && d.ts >= plan.at) {
      const hs = (d.heroRenderDiagnostics ?? []).filter((h) => h.simPosition && h.alive !== false);
      const aliveSet = new Set((d.structureState ?? []).filter((x) => x.alive).map((x) => x.id));
      const toWorld = (sim) => ({ x: (sim.x - 110) * 1.7, z: (sim.y - 110) * 1.7 });
      try {
        if (plan.kind === "full" || plan.kind === "mobileFull") {
          if (plan.kind === "mobileFull") {
            await tab.send("Emulation.setDeviceMetricsOverride", { width: MOB.w, height: MOB.h, deviceScaleFactor: 1, mobile: true });
            await sleep(1200);
          }
          await setCam(tab, { fitAll: true });
          shots.push(await shoot(tab, plan.name));
          console.log(`  ✓ ${plan.name} @ ts=${Math.round(d.ts)}`);
        } else if (plan.kind === "jungleWall") {
          //  離牆最近的活人（排除基地內；那是 03 的題目）
          let best = null;
          for (const h of hs) {
            const c = clearanceAt(h.simPosition.x, h.simPosition.y);
            const inBase = Math.min(
              Math.hypot(h.simPosition.x - BASE.blue.x, h.simPosition.y - BASE.blue.y),
              Math.hypot(h.simPosition.x - BASE.red.x, h.simPosition.y - BASE.red.y)) < 45;
            if (inBase || c < 0) continue;
            if (!best || c < best.c) best = { c, h };
          }
          if (best) {
            await setCam(tab, { dist: 85, ...(() => { const w = toWorld(best.h.simPosition); return { panX: w.x, panZ: w.z }; })() });
            shots.push(await shoot(tab, plan.name));
            console.log(`  ✓ ${plan.name} @ ts=${Math.round(d.ts)}（該英雄離牆 ${best.c.toFixed(2)}，英雄半徑 ${HERO_RADIUS}）`);
          }
        } else if (plan.kind === "tower") {
          //  離「還活著的塔」最近的活人
          let best = null;
          for (const h of hs) {
            for (const st of structureList()) {
              if (!aliveSet.has(st.id)) continue;
              const dd = Math.hypot(h.simPosition.x - st.x, h.simPosition.y - st.y);
              if (!best || dd < best.d) best = { d: dd, h, st };
            }
          }
          if (best) {
            await setCam(tab, { dist: 85, panX: (best.st.x - 110) * 1.7, panZ: (best.st.y - 110) * 1.7 });
            shots.push(await shoot(tab, plan.name));
            console.log(`  ✓ ${plan.name} @ ts=${Math.round(d.ts)}（最近 ${best.st.id}，距離 ${best.d.toFixed(2)}，碰撞門檻 ${(best.st.r + HERO_RADIUS).toFixed(2)}）`);
          }
        } else if (plan.kind === "mobileCloseup") {
          const h = hs[0];
          if (h) {
            const w = toWorld(h.simPosition);
            await setCam(tab, { dist: 110, panX: w.x, panZ: w.z });
            shots.push(await shoot(tab, plan.name));
            console.log(`  ✓ ${plan.name} @ ts=${Math.round(d.ts)}`);
          }
          //  拍完手機圖切回桌機，剩下的取樣仍在桌機視窗下進行
          await tab.send("Emulation.setDeviceMetricsOverride", { width: DESK.w, height: DESK.h, deviceScaleFactor: 1, mobile: false });
          await sleep(800);
          await setCam(tab, { fitAll: true });
        }
      } catch (e) { console.log(`  ! ${plan.name} 拍攝失敗：${e.message}`); }
      shotIdx++;
    }
  }
  await sleep(SAMPLE_MS);
}
console.log(`  取樣結束：${samples.length} 筆，比賽${over ? "已結束" : "未結束（達時間上限）"}`);

//  （截圖已在取樣迴圈中於比賽進行時完成，見 shotPlan）

const finalDiag = await diag(tab).catch(() => null);
tab.close(); root.close(); browser.kill();

// ══ 分析 ═══════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const fails = [];
const ok = (cond, label, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${label}`); return true; }
  fail++; fails.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`❌ ${label}${detail ? ` — ${detail}` : ""}`);
  return false;
};

const byHero = new Map();
for (const s of samples) {
  for (const h of s.heroes) {
    if (!h.sim) continue;
    if (!byHero.has(h.id)) byHero.set(h.id, []);
    byHero.get(h.id).push({ ts: s.ts, aliveStructs: s.aliveStructs, ...h });
  }
}

//  A. 穿牆（靜態牆體：基地牆／城門／岩壁／大石／崖／坑壁）
//  ⚠ 分兩本帳：
//    engineWallHits  = **引擎座標**（未內插）踩進牆體 ⇒ 碰撞真的算錯，必須修引擎
//    renderWallHits  = **畫面座標**（內插後）踩進牆體 ⇒ 內插切到牆角，修呈現層
//  兩者在畫面上長得一樣，但修的地方完全不同；混在一起報就會修錯東西。
const wallHits = [], engineWallHits = [];
for (const [id, track] of byHero) {
  for (const p of track) {
    if (p.alive === false) continue;            // 屍體不受碰撞約束（設計如此）
    const c = clearanceAt(p.sim.x, p.sim.y);
    if (c >= 0 && c < HERO_RADIUS - TOL.wall) {
      wallHits.push({ id, ts: p.ts, sim: p.sim, clearance: +c.toFixed(2), raw: p.raw ?? null });
    }
    if (p.raw) {
      const rc = clearanceAt(p.raw.x, p.raw.y);
      if (rc >= 0 && rc < HERO_RADIUS - TOL.wall) {
        engineWallHits.push({ id, ts: p.ts, raw: p.raw, clearance: +rc.toFixed(2) });
      }
    }
  }
}
//  坑壁單獨分類（龍坑／巴龍坑周邊）
const pitHits = wallHits.filter((w) =>
  Math.min(Math.hypot(w.sim.x - PITS.dragon.x, w.sim.y - PITS.dragon.y),
           Math.hypot(w.sim.x - PITS.baron.x, w.sim.y - PITS.baron.y)) < 22);

//  B. 穿結構（存活的塔／主堡）
const structHits = [];
for (const [id, track] of byHero) {
  for (const p of track) {
    if (p.alive === false) continue;
    //  ⚠ 只有**這一刻還活著**的結構才擋人（已摧毀的塔碰撞完全解除，是 H.2 的明文設計）
    const aliveSet = p.aliveStructs ? new Set(p.aliveStructs) : null;
    const s = structureAt(p.sim.x, p.sim.y, HERO_RADIUS - TOL.struct, aliveSet);
    if (s) {
      const depth = (s.r + HERO_RADIUS) - Math.hypot(p.sim.x - s.x, p.sim.y - s.y);
      structHits.push({ id, ts: p.ts, sim: p.sim, structure: s.id, depth: +depth.toFixed(2) });
    }
  }
}

//  D/E. 卡死與抖動
const stuckList = [], jitterList = [];
//  ⚠ 這些狀態下「站著不動」是**設計行為**，不是卡死：
//  對線＝站在兵線平衡點消耗，團戰／追擊／撤退＝交戰狀態機在運作，
//  回城／回防／待命＝引導或等重生。把它們算成卡死只會製造假警報
//  （第一次跑就把「對線 15 秒」報成卡死）。
const STATIONARY_OK = ["對線", "團戰", "追擊", "回城", "待命", "回防", "守塔", "撤退"];
for (const [id, track] of byHero) {
  //  ⚠ 「站著不動」不等於卡死：團戰、追擊、守塔、回城、在泉水等重生，
  //  這些狀態下英雄本來就會待在原地。卡死的定義收斂成
  //  **「不動 + 貼著幾何」**——也就是被牆或結構黏住走不掉，那才是導航的錯。
  let run = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (b.alive === false || a.alive === false) { run = 0; continue; }
    if (STATIONARY_OK.some((k) => String(b.actionState ?? "").includes(k))) { run = 0; continue; }
    //  貼著幾何 = 離牆不到半個身位，或落在某個存活結構的碰撞圈邊上
    const clr = clearanceAt(b.sim.x, b.sim.y);
    const aliveSet = b.aliveStructs ? new Set(b.aliveStructs) : null;
    //  「貼著幾何」= 幾乎沒有餘裕（0.4 單位內），不是「附近有牆」。
    //  離牆還有一個身位卻站著不動，那是戰術行為，不是導航把人黏住。
    const hugging = (clr >= 0 && clr < HERO_RADIUS + 0.4)
      || !!structureAt(b.sim.x, b.sim.y, HERO_RADIUS + 0.4, aliveSet);
    if (!hugging) { run = 0; continue; }
    const moved = Math.hypot(b.sim.x - a.sim.x, b.sim.y - a.sim.y);
    run = moved < TOL.stuckMove / TOL.stuckSamples * 5 ? run + 1 : 0;
    if (run >= TOL.stuckSamples) {
      stuckList.push({ id, ts: b.ts, sim: b.sim, samples: run, clearance: +clr.toFixed(2), state: b.actionState });
      run = 0;
    }
  }
  for (let i = TOL.jitterWindow; i < track.length; i++) {
    const w = track.slice(i - TOL.jitterWindow, i);
    if (w.some((p) => p.alive === false)) continue;
    //  ⚠ 交戰狀態下的進退（v3 的 chase / retreat 狀態機）本來就是「走很多路、淨位移很小」，
    //  那是設計行為不是抖動。只在**全程貼著幾何**時才算導航把人磨在牆上。
    if (w.some((p) => STATIONARY_OK.some((k) => String(p.actionState ?? "").includes(k)))) continue;
    const hugAll = w.every((p) => {
      const c = clearanceAt(p.sim.x, p.sim.y);
      return c >= 0 && c < HERO_RADIUS + 0.4;
    });
    if (!hugAll) continue;
    let path = 0;
    for (let k = 1; k < w.length; k++) path += Math.hypot(w[k].sim.x - w[k - 1].sim.x, w[k].sim.y - w[k - 1].sim.y);
    const net = Math.hypot(w[w.length - 1].sim.x - w[0].sim.x, w[w.length - 1].sim.y - w[0].sim.y);
    if (path > TOL.jitterPathMin && net < TOL.jitterNetMax) {
      jitterList.push({ id, ts: w[w.length - 1].ts, path: +path.toFixed(1), net: +net.toFixed(1) });
      i += TOL.jitterWindow;                    // 同一段只報一次
    }
  }
}

//  F. 走得到：基地 → 三路中段；以及進出野區
const laneMid = ["top", "mid", "bot"].map((ln) => ({ ln, p: posOnLane(ln, 0.5) }));
const reachedLane = new Set(), enteredJungle = new Set(), leftBase = new Set();
for (const [id, track] of byHero) {
  for (const p of track) {
    const dBase = Math.min(Math.hypot(p.sim.x - BASE.blue.x, p.sim.y - BASE.blue.y),
                           Math.hypot(p.sim.x - BASE.red.x, p.sim.y - BASE.red.y));
    if (dBase > 60) leftBase.add(id);
    for (const L of laneMid) if (Math.hypot(p.sim.x - L.p.x, p.sim.y - L.p.y) < 22) reachedLane.add(id);
    //  野區 = 離三路中心線都 > 24 且在競技場內（河道與坑口也算野區側）
    const offLane = ["top", "mid", "bot"].every((ln) => {
      let best = Infinity;
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const q = posOnLane(ln, t);
        best = Math.min(best, Math.hypot(p.sim.x - q.x, p.sim.y - q.y));
      }
      return best > 24;
    });
    if (offLane && dBase > 55) enteredJungle.add(id);
  }
}

//  G. 閃爍 / 突然消失：活著、在畫面內、座標有效，卻回報不可見
const flickers = [];
for (const [id, track] of byHero) {
  for (const p of track) {
    if (p.alive === false) continue;
    if (p.onScreen && p.positionFinite && !p.visible) flickers.push({ id, ts: p.ts });
  }
}

const heroIds = [...byHero.keys()];
console.log("\n── 判定 ──────────────────────────────────────────────────────");
ok(samples.length >= 200, `取樣充足（${samples.length} 筆 × ${SAMPLE_MS}ms）`, `只有 ${samples.length} 筆`);
ok(gameViewBeacon?.beacon === true, "畫面是正式 GameView（非 debug 地圖預覽）",
  `beacon=${gameViewBeacon?.beacon} debugUi=${JSON.stringify(gameViewBeacon?.debugUi ?? [])}`);
ok((gameViewBeacon?.debugUi ?? []).length === 0, "畫面沒有混入 debug 地圖 UI");
ok(heroIds.length === 10, `10 名英雄全程有座標（實際 ${heroIds.length}）`);
ok(engineWallHits.length === 0, `不穿牆——**引擎座標**（碰撞正確性）`,
  `${engineWallHits.length} 次；最壞 ${engineWallHits.length ? JSON.stringify(engineWallHits.sort((a, b) => a.clearance - b.clearance)[0]) : ""}`);
ok(wallHits.length === 0, `不穿牆——**畫面座標**（含內插）`,
  `${wallHits.length} 次；最壞 ${wallHits.length ? JSON.stringify(wallHits.sort((a, b) => a.clearance - b.clearance)[0]) : ""}`);
ok(pitHits.length === 0, "不穿龍坑／巴龍坑牆體", `${pitHits.length} 次`);
ok(structHits.length === 0, "不穿防禦塔與主堡",
  `${structHits.length} 次；例：${structHits.length ? JSON.stringify(structHits[0]) : ""}`);
ok(stuckList.length === 0, `不卡死（連續 ${TOL.stuckSamples} 次取樣 ≈ ${(TOL.stuckSamples * SAMPLE_MS / 1000).toFixed(0)} 秒幾乎不動）`,
  `${stuckList.length} 次；例：${stuckList.length ? JSON.stringify(stuckList[0]) : ""}`);
ok(jitterList.length === 0, "不原地抖動／打轉",
  `${jitterList.length} 段；例：${jitterList.length ? JSON.stringify(jitterList[0]) : ""}`);
ok(leftBase.size === 10, `10 人都走得出基地（實際 ${leftBase.size}）`);
ok(reachedLane.size >= 8, `英雄走得到三路中段（實際 ${reachedLane.size}/10）`);
ok(enteredJungle.size >= 2, `有英雄進得了野區（實際 ${enteredJungle.size} 人）`);
ok(flickers.length === 0, "沒有英雄無故從畫面消失（閃爍）", `${flickers.length} 次`);
ok(shots.length >= 5, `截圖齊備（${shots.length} 張）`);

const report = {
  generatedAt: new Date().toISOString(),
  url: BASE_URL,
  sampleCount: samples.length,
  sampleIntervalMs: SAMPLE_MS,
  matchOver: over,
  finalTs: finalDiag?.ts ?? samples[samples.length - 1]?.ts ?? null,
  towerDestroyed: finalDiag?.towerDestroyedCount ?? null,
  heroIds,
  thresholds: { ...TOL, heroRadius: HERO_RADIUS },
  results: {
    wallHits: wallHits.slice(0, 20), wallHitCount: wallHits.length,
    engineWallHits: engineWallHits.slice(0, 20), engineWallHitCount: engineWallHits.length,
    pitHitCount: pitHits.length,
    structHits: structHits.slice(0, 20), structHitCount: structHits.length,
    stuck: stuckList.slice(0, 20), stuckCount: stuckList.length,
    jitter: jitterList.slice(0, 20), jitterCount: jitterList.length,
    leftBase: [...leftBase], reachedLane: [...reachedLane], enteredJungle: [...enteredJungle],
    flickerCount: flickers.length,
  },
  //  每名英雄的最小淨距（= 全程離牆最近的一刻），這是「不穿牆」的量化證據
  minClearanceByHero: Object.fromEntries([...byHero].map(([id, tr]) => {
    let min = Infinity, at = null;
    for (const p of tr) {
      if (p.alive === false) continue;
      const c = clearanceAt(p.sim.x, p.sim.y);
      if (c >= 0 && c < min) { min = c; at = { ts: p.ts, sim: p.sim }; }
    }
    return [id, { minClearance: +min.toFixed(2), at }];
  })),
  performance: perfSample,
  screenshots: shots,
  pass, fail, fails,
};
writeFileSync(resolve(OUT_DIR, "h2close_chrome_acceptance.json"), JSON.stringify(report, null, 2));

console.log(`\n=== H.2-close 真實 Chrome 驗收：${pass} PASS / ${fail} FAIL ===`);
console.log(`   報告：${resolve(OUT_DIR, "h2close_chrome_acceptance.json")}`);
if (perfSample) console.log(`   效能：${perfSample.fps} FPS｜${perfSample.drawCalls} draw calls｜GPU=${perfSample.renderer}`);
if (fail) { console.log(fails.map((f, i) => `  ${i + 1}. ${f}`).join("\n")); process.exit(1); }
