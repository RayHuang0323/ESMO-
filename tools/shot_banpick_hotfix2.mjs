#!/usr/bin/env node
// ============================================================================
//  tools/shot_banpick_hotfix2.mjs — J-close Hotfix2 驗收
//    目標 1：手機 Ban/Pick 英雄格真的捲得到最後一位英雄
//    目標 2：Ban/Pick 不再顯示「誰克制誰」
//
//  為什麼要新寫一支，而不是加在 hotfix1 上：
//    hotfix1 的 §5k「頁面可縱向捲動」寫成
//      `(root.scrollHeight-root.clientHeight)>0 || all.some(e=>e.scrollHeight>e.clientHeight+8)`
//    ——它問的是「有沒有元素的內容超出自己」，不是「使用者捲得動嗎」。
//    AppShell 外框是 `overflow:hidden` 且 scrollHeight(2057) > clientHeight(743)，
//    所以這條斷言在**英雄完全捲不到**的情況下照樣是綠的。這就是 Hotfix1 明明量了
//    版面卻沒抓到阻斷的原因。
//
//  本檔的判準一律是**行為**：
//    · 捲動 = 派真的單指觸控拖曳（桌機派滾輪），看 scrollTop 有沒有動、
//      最後一位英雄有沒有完整落在捲動框與 viewport 內、有沒有被東西蓋住
//      （用 elementFromPoint 反查，不是用座標推論）。
//    · 選取 = 點下去之後那隻英雄有沒有真的進到已選頭像（比對 hero id）。
//    · 誤選 = 從英雄卡上開始拖曳之後，已選數量有沒有變。
//  英雄一律用 `data-hero` 定位，不用 DOM 索引猜（08 制度教訓（二））。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/j-close-hotfix2/evidence"));
//  Ray 指定的六個驗收尺寸。前兩個是桌機（不可退化），後四個是手機。
const SIZES = [
  { w: 1920, h: 1080, tag: "desk1920", mobile: false },
  { w: 1366, h: 768,  tag: "desk1366", mobile: false },
  { w: 430,  h: 932,  tag: "mob430",   mobile: true },
  { w: 412,  h: 915,  tag: "mob412",   mobile: true },
  { w: 390,  h: 844,  tag: "mob390",   mobile: true },
  { w: 360,  h: 800,  tag: "mob360",   mobile: true },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); }
  static async connect(u) {
    const ws = new WebSocket(u);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && c.p.has(m.id)) { const { res, rej } = c.p.get(m.id); c.p.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    return c;
  }
  send(method, params = {}, t = 30000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.p.delete(id); rej(new Error(`CDP ${method} 逾時`)); }, t);
      this.p.set(id, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      try { this.ws.send(JSON.stringify({ id, method, params })); } catch (e) { clearTimeout(timer); rej(e); }
    });
  }
}
const ev = async (c, expr) => {
  const r = await c.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? "evaluate failed");
  return r.result?.value;
};
const text = (c) => ev(c, "document.body.innerText || ''");
const clickByText = (c, n) => ev(c, `(() => {
  const n = ${JSON.stringify(n)};
  const hits = [...document.querySelectorAll("button,[role=button],div,span,a")]
    .filter((el) => (el.textContent || "").includes(n) && el.offsetParent !== null);
  if (!hits.length) return false;
  const el = hits.find((a) => !hits.some((b) => b !== a && a.contains(b))) ?? hits[hits.length - 1];
  el.click(); return true;
})()`);
async function clickUntil(c, n, expect, s = 25) {
  for (let i = 0; i < s; i++) {
    if ((await text(c).catch(() => "")).includes(expect)) return true;
    await clickByText(c, n); await sleep(900);
  }
  return (await text(c).catch(() => "")).includes(expect);
}
const readRows = (c, sel, keys) => ev(c, `[...document.querySelectorAll(${JSON.stringify(sel)})].map((el) => ({
  ${keys.map((k) => `${JSON.stringify(k)}: el.getAttribute("data-${k}")`).join(",")}
}))`);

const results = { notes: [], shots: [], data: {} };
let failed = 0;
const ck = (label, cond, extra = null) => {
  results.notes.push({ label, ok: !!cond, extra });
  console.log(`${cond ? "✅" : "❌"} ${label}${!cond && extra != null ? `　→ ${JSON.stringify(extra)}` : ""}`);
  if (!cond) failed++;
  return !!cond;
};

if (!CHROME) { console.error("找不到 Chrome"); process.exit(2); }
const baseUrl = "http://localhost:4188";
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--port", "4188", "--strictPort"], { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
for (let i = 0; i < 120; i++) { try { const r = await fetch(baseUrl, { redirect: "manual" }); if (r.status < 500) break; } catch { /* wait */ } await sleep(500); }
const profileDir = resolve(ROOT, "node_modules/.cache", `esmo-hf2-${process.pid}`);
const port = 9500 + (process.pid % 300);
const HEADLESS = process.env.ESMO_SHOT_HEADED !== "1";
const browser = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  ...(HEADLESS ? ["--headless=new", "--disable-gpu-sandbox", "--use-angle=swiftshader"] : []),
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--force-device-scale-factor=1", "--window-size=1920,1080", "--window-position=0,0", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250); try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* wait */ } }
if (!wsUrl) { console.error("Chrome CDP 沒開起來"); browser.kill(); server.kill(); process.exit(4); }
mkdirSync(OUT_DIR, { recursive: true });
const root = await CDP.connect(wsUrl);
const { targetId } = await root.send("Target.createTarget", { url: "about:blank" });
const tab = await CDP.connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
await tab.send("Page.enable"); await tab.send("Runtime.enable");

async function shot(name) {
  try { await tab.send("Page.bringToFront", {}, 10000); } catch { /* non-fatal */ }
  for (const p of [{ format: "png" }, { format: "png", fromSurface: false }]) {
    try {
      const { data } = await tab.send("Page.captureScreenshot", p, 45000);
      writeFileSync(resolve(OUT_DIR, name), Buffer.from(data, "base64"));
      results.shots.push(name); console.log(`  📸 ${name}`); return true;
    } catch { /* fallback */ }
  }
  console.log(`  ⚠ ${name} 截圖失敗`); return false;
}

/** 捲動區的幾何（座標都是 viewport 座標，直接餵給 Input.*）。 */
const scrollerBox = (c) => ev(c, `(() => {
  const s = document.querySelector('[data-testid="hero-grid-scroll"]');
  if (!s) return null;
  const b = s.getBoundingClientRect();
  return { x: Math.round(b.left + b.width / 2), top: Math.round(b.top), bottom: Math.round(b.bottom),
    h: Math.round(b.height), scrollTop: Math.round(s.scrollTop),
    maxScroll: Math.round(s.scrollHeight - s.clientHeight) };
})()`);

/** 單指上滑一次（手機）／滾輪一次（桌機）。回傳捲動後的 scrollTop。 */
async function scrollOnce(box, mobile, dir = 1) {
  if (mobile) {
    const y0 = dir > 0 ? box.bottom - 18 : box.top + 18;
    const y1 = dir > 0 ? box.top + 18 : box.bottom - 18;
    const stepPx = dir > 0 ? -28 : 28;
    await tab.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: y0 }] });
    for (let y = y0; dir > 0 ? y >= y1 : y <= y1; y += stepPx) {
      await tab.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x, y }] });
      await sleep(14);
    }
    await tab.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await tab.send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x: box.x, y: Math.round((box.top + box.bottom) / 2),
      deltaX: 0, deltaY: dir * 240, pointerType: "mouse",
    });
  }
  await sleep(130);
}

/** 一路捲到底（最多 n 次手勢），回傳最後一次的量測。 */
async function scrollToEnd(mobile, n = 40) {
  let box = await scrollerBox(tab);
  let last = -1;
  for (let i = 0; i < n && box; i++) {
    if (box.scrollTop >= box.maxScroll - 1) break;
    if (box.scrollTop === last) break;                 // 完全推不動了 ⇒ 提早停，讓斷言去紅
    last = box.scrollTop;
    await scrollOnce(box, mobile, 1);
    box = await scrollerBox(tab);
  }
  await sleep(350);
  return scrollerBox(tab);
}

/** 最後一張卡的可見性：完整落在捲動框內、落在 viewport 內、而且沒有被別的東西蓋住。 */
const lastCardState = (c) => ev(c, `(() => {
  const s = document.querySelector('[data-testid="hero-grid-scroll"]');
  const cards = [...document.querySelectorAll('[data-testid="hero-card"]')];
  if (!s || !cards.length) return null;
  const last = cards[cards.length - 1];
  const lb = last.getBoundingClientRect(), sb = s.getBoundingClientRect();
  const cx = Math.round(lb.left + lb.width / 2), cy = Math.round(lb.top + lb.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return {
    hero: last.getAttribute("data-hero"), total: cards.length,
    top: Math.round(lb.top), bottom: Math.round(lb.bottom),
    scrollerTop: Math.round(sb.top), scrollerBottom: Math.round(sb.bottom), vh: window.innerHeight,
    insideScroller: lb.top >= sb.top - 1 && lb.bottom <= sb.bottom + 1,
    insideViewport: lb.top >= 0 && lb.bottom <= window.innerHeight,
    //  被遮住的判定：畫面上那個點打到的元素，必須就是這張卡或它的後代。
    notCovered: !!hit && (hit === last || last.contains(hit)),
    hitTestId: hit ? (hit.getAttribute("data-testid") || hit.tagName) : null,
  };
})()`);

const setSearch = (c, q) => ev(c, `(() => {
  const el = document.querySelector('[data-testid="hero-search"]');
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, ${JSON.stringify(q)});
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`);

const expandPlan = async (c) => {
  await ev(c, `(() => {
    const b = document.querySelector('[data-testid="draft-plan-toggle"]');
    if (!b) return false;
    if (b.getAttribute("aria-expanded") !== "true") b.click();
    return true;
  })()`).catch(() => null);
  await sleep(320);
};

/** 把某個 data-hero 捲進捲動框中央，回傳它的座標。 */
const bringHeroIntoView = (c, id) => ev(c, `(() => {
  const el = document.querySelector('[data-testid="hero-card"][data-hero="${id}"]');
  if (!el) return null;
  el.scrollIntoView({ block: "center" });
  const b = el.getBoundingClientRect();
  return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
})()`);

// ══════════════════════════════════════════════════════════════════════════
async function runSize(size) {
  const tag = size.tag;
  const cap = {};
  await tab.send("Emulation.setDeviceMetricsOverride", { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.mobile });
  await tab.send("Emulation.setTouchEmulationEnabled", { enabled: size.mobile, maxTouchPoints: 5 });
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1` });
  await sleep(2800);

  ck(`${tag} 0a) 進入賽前配置`, await clickUntil(tab, "MOBA", "先發五人", 20));
  await clickUntil(tab, "確認陣容", "進入 Ban/Pick", 20);
  ck(`${tag} 0b) 進入 Ban/Pick`, await clickUntil(tab, "進入 Ban/Pick", "選角動態", 25));
  await sleep(900);

  // ── §1 版面框架：捲動責任在誰身上 ────────────────────────────────────────
  const frame = await ev(tab, `(() => {
    const s = document.querySelector('[data-testid="hero-grid-scroll"]');
    if (!s) return { error: "no scroller" };
    const cs = getComputedStyle(s);
    const clipping = [];
    let el = s.parentElement;
    while (el && el !== document.documentElement) {
      const c = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 2 && (c.overflowY === "hidden" || c.overflowY === "clip")) {
        clipping.push({ tag: el.tagName, testid: el.getAttribute("data-testid"),
          clientH: el.clientHeight, scrollH: el.scrollHeight });
      }
      el = el.parentElement;
    }
    const realScrollers = [...document.querySelectorAll("*")].filter((e) => {
      const c = getComputedStyle(e);
      return e.scrollHeight > e.clientHeight + 8 && /auto|scroll/.test(c.overflowY);
    }).map((e) => e.getAttribute("data-testid") || e.tagName);
    const r = (sel) => { const e = typeof sel === "string" ? document.querySelector(sel) : sel; if (!e) return null;
      const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
    return {
      vh: window.innerHeight,
      overflowY: cs.overflowY, overscroll: cs.overscrollBehaviorY, touchAction: cs.touchAction,
      clientH: s.clientHeight, scrollH: s.scrollHeight,
      canScroll: s.scrollHeight > s.clientHeight + 2 && /auto|scroll/.test(cs.overflowY),
      clippingAncestors: clipping, realScrollers,
      plan: r('[data-testid="draft-plan"]'), search: r('[data-testid="hero-search"]'),
      filters: r('[data-testid="pick-filter"]'), scroller: r(s),
      docScrollable: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight + 2,
    };
  })()`);
  cap.frame = frame;
  ck(`${tag} 1a) 英雄格是真正的捲動容器（overflow-y ${frame?.overflowY}，${frame?.clientH}／${frame?.scrollH}）`,
    !!frame?.canScroll, frame);
  ck(`${tag} 1b) 捲動區沒有任何「裁掉內容又不能捲」的祖先`,
    Array.isArray(frame?.clippingAncestors) && frame.clippingAncestors.length === 0, frame?.clippingAncestors);
  ck(`${tag} 1c) 全頁只有這一個真捲動軸（不是巢狀捲動）`,
    Array.isArray(frame?.realScrollers) && frame.realScrollers.length === 1
    && frame.realScrollers[0] === "hero-grid-scroll", frame?.realScrollers);
  ck(`${tag} 1d) overscroll-behavior 為 contain（捲到底不帶動外層）`,
    frame?.overscroll === "contain", frame?.overscroll);
  ck(`${tag} 1e) touch-action 為 pan-y（明確吃垂直手勢）`,
    frame?.touchAction === "pan-y", frame?.touchAction);
  ck(`${tag} 1f) 上方出戰配置摘要仍在首屏`,
    !!frame?.plan && frame.plan.top >= 0 && frame.plan.bottom <= frame.vh, frame?.plan);
  ck(`${tag} 1g) 位置篩選列仍在首屏`,
    !!frame?.filters && frame.filters.top >= 0 && frame.filters.bottom <= frame.vh, frame?.filters);
  ck(`${tag} 1h) 搜尋框存在且在首屏`,
    !!frame?.search && frame.search.top >= 0 && frame.search.bottom <= frame.vh, frame?.search);
  ck(`${tag} 1i) 捲動區整個在 viewport 內（沒有被外框裁掉）`,
    !!frame?.scroller && frame.scroller.top >= 0 && frame.scroller.bottom <= frame.vh,
    { scroller: frame?.scroller, vh: frame?.vh });
  await shot(`${tag}-01-banpick-frame.png`);

  // ── §2 產生「至少六至七列」的篩選結果 ────────────────────────────────────
  //   定位頁籤最多只有 20 隻（4 列），要 6 列以上得靠搜尋或「全部」。
  //   「之」在 100 隻裡命中 30 隻 ＝ 剛好 6 列；「全部」是 20 列的最壞情況。
  await setSearch(tab, "之");
  await sleep(400);
  const q6 = await ev(tab, `(() => {
    const n = document.querySelectorAll('[data-testid="hero-card"]').length;
    const c = document.querySelector('[data-testid="pick-count"]');
    return { cards: n, badge: Number(c?.getAttribute("data-count") ?? -1), rows: Math.ceil(n / 5) };
  })()`);
  cap.query6 = q6;
  ck(`${tag} 2a) 搜尋「之」產生 ≥6 列（實測 ${q6?.rows} 列／${q6?.cards} 隻）`,
    (q6?.rows ?? 0) >= 6, q6);
  ck(`${tag} 2b) 計數徽章與實際卡片數一致`, q6?.cards === q6?.badge, q6);

  // ── §3 從第一列滑到最後一列（真手勢）────────────────────────────────────
  const before = await scrollerBox(tab);
  const after = await scrollToEnd(size.mobile);
  const lastCard = await lastCardState(tab);
  cap.scroll6 = { before, after, lastCard };
  ck(`${tag} 3a) 6 列情境：手勢真的捲動了（${before?.scrollTop} → ${after?.scrollTop}）`,
    (after?.scrollTop ?? 0) > (before?.scrollTop ?? 0), { before, after });
  ck(`${tag} 3b) 6 列情境：捲到最底（${after?.scrollTop}／${after?.maxScroll}）`,
    !!after && after.scrollTop >= after.maxScroll - 2, after);
  ck(`${tag} 3c) 6 列情境：最後一位英雄（${lastCard?.hero}）完整落在捲動框內`,
    !!lastCard?.insideScroller, lastCard);
  ck(`${tag} 3d) 6 列情境：最後一位英雄完整落在 viewport 內`,
    !!lastCard?.insideViewport, lastCard);
  ck(`${tag} 3e) 6 列情境：最後一位英雄沒有被任何東西蓋住（elementFromPoint 命中卡片本身）`,
    !!lastCard?.notCovered, lastCard);
  await shot(`${tag}-02-scrolled-bottom-6rows.png`);

  // ── §3' 最壞情況：全部 100 隻（20 列）也要捲得到底 ──────────────────────
  await setSearch(tab, "");
  await sleep(400);
  const allBefore = await scrollerBox(tab);
  const allAfter = await scrollToEnd(size.mobile, 60);
  const allLast = await lastCardState(tab);
  cap.scrollAll = { before: allBefore, after: allAfter, lastCard: allLast };
  ck(`${tag} 3f) 全部（${allLast?.total} 隻／${Math.ceil((allLast?.total ?? 0) / 5)} 列）也能捲到最底`,
    !!allAfter && allAfter.scrollTop >= allAfter.maxScroll - 2, allAfter);
  ck(`${tag} 3g) 全部情境：最後一位英雄（${allLast?.hero}）完整可見且未被遮住`,
    !!allLast?.insideScroller && !!allLast?.insideViewport && !!allLast?.notCovered, allLast);

  // ── §4 換篩選／換關鍵字 ⇒ 回到頂部 ──────────────────────────────────────
  const filterReset = await ev(tab, `(() => {
    const s = document.querySelector('[data-testid="hero-grid-scroll"]');
    const before = Math.round(s.scrollTop);
    const b = [...document.querySelectorAll('[data-testid="pick-filter"]')].find((e) => e.getAttribute("data-filter") === "戰士");
    if (!b) return { error: "no filter" };
    b.click();
    return { before };
  })()`);
  await sleep(450);
  const afterFilter = await scrollerBox(tab);
  cap.filterReset = { ...filterReset, after: afterFilter?.scrollTop };
  ck(`${tag} 4a) 切換位置篩選後英雄格回到頂部（${filterReset?.before} → ${afterFilter?.scrollTop}）`,
    (filterReset?.before ?? 0) > 0 && afterFilter?.scrollTop === 0, cap.filterReset);
  //  再捲下去，然後改關鍵字。
  //  ⚠ 先切回「全部」再捲：戰士只有 20 隻（4 列），在 1920×1080 這種高捲動框裡
  //    根本捲不動 ⇒ before 會是 0，那時候「回到頂部」就不是有效的檢定。
  await ev(tab, `(() => { const b=[...document.querySelectorAll('[data-testid="pick-filter"]')].find(e=>e.getAttribute("data-filter")==="全部"); if(b) b.click(); return true; })()`);
  await sleep(400);
  await ev(tab, `(() => { const s=document.querySelector('[data-testid="hero-grid-scroll"]'); s.scrollTop = s.scrollHeight; return true; })()`);
  await sleep(300);
  const beforeQuery = (await scrollerBox(tab))?.scrollTop ?? 0;
  await setSearch(tab, "之");
  await sleep(450);
  const afterQuery = await scrollerBox(tab);
  cap.queryReset = { before: beforeQuery, after: afterQuery?.scrollTop };
  ck(`${tag} 4b) 輸入搜尋關鍵字後英雄格回到頂部（${beforeQuery} → ${afterQuery?.scrollTop}）`,
    beforeQuery > 0 && afterQuery?.scrollTop === 0, cap.queryReset);
  //  回到可選全部英雄的狀態
  await setSearch(tab, "");
  await sleep(400);

  // ── §5 上下滑動不得誤選英雄 ─────────────────────────────────────────────
  //   從**英雄卡上**起手拖曳（最容易誤觸的姿勢），事後已選數量必須沒變。
  const dragProbe = await ev(tab, `(() => {
    const cards = [...document.querySelectorAll('[data-testid="hero-card"]')];
    const el = cards[Math.min(7, cards.length - 1)];
    const b = el.getBoundingClientRect();
    return { hero: el.getAttribute("data-hero"),
      x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2),
      picks: document.querySelectorAll('[data-testid="pick-avatar"]').length,
      cards: cards.length };
  })()`);
  {
    const box = await scrollerBox(tab);
    if (size.mobile) {
      await tab.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: dragProbe.x, y: dragProbe.y }] });
      for (let y = dragProbe.y; y >= Math.max(box.top + 12, dragProbe.y - 220); y -= 22) {
        await tab.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: dragProbe.x, y }] });
        await sleep(14);
      }
      await tab.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      //  桌機的等價動作：在卡片上按住拖曳（滑鼠選取手勢），同樣不該選到英雄
      await tab.send("Input.dispatchMouseEvent", { type: "mousePressed", x: dragProbe.x, y: dragProbe.y, button: "left", clickCount: 1 });
      for (let y = dragProbe.y; y >= Math.max(box.top + 12, dragProbe.y - 200); y -= 20) {
        await tab.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragProbe.x, y, button: "left" });
        await sleep(14);
      }
      await tab.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: dragProbe.x, y: Math.max(box.top + 12, dragProbe.y - 200), button: "left", clickCount: 1 });
    }
    await sleep(700);
  }
  const afterDrag = await ev(tab, `(() => ({
    picks: document.querySelectorAll('[data-testid="pick-avatar"]').length,
    stillInGrid: !!document.querySelector('[data-testid="hero-card"][data-hero="' + ${JSON.stringify(dragProbe.hero)} + '"]'),
    pickerOpen: !!document.querySelector('[data-testid="hero-grid-scroll"]'),
  }))()`);
  cap.drag = { dragProbe, afterDrag };
  ck(`${tag} 5a) 從英雄卡上起手拖曳後，被拖的那隻（${dragProbe?.hero}）仍在池子裡（沒被選走）`,
    !!afterDrag?.stillInGrid, cap.drag);
  ck(`${tag} 5b) 拖曳後已選數量不變（${dragProbe?.picks} → ${afterDrag?.picks}）`,
    afterDrag?.picks === dragProbe?.picks, cap.drag);
  ck(`${tag} 5c) 拖曳後仍停在選角格（沒有被帶去別的畫面／彈窗）`,
    !!afterDrag?.pickerOpen, afterDrag);

  // ── §6 短點擊要能正常選取（用 data-hero 指名，不用索引猜）────────────────
  //   刻意挑一隻要捲動才看得到的（第 40 張之後），順便證明捲動之後仍可點選。
  const targetHero = await ev(tab, `(() => {
    const cards = [...document.querySelectorAll('[data-testid="hero-card"]')];
    const el = cards[Math.min(47, cards.length - 1)];
    return el ? el.getAttribute("data-hero") : null;
  })()`);
  const pos = await bringHeroIntoView(tab, targetHero);
  await sleep(300);
  const beforeTap = await ev(tab, `(() => ({
    picks: document.querySelectorAll('[data-testid="pick-avatar"]').length,
    log: (document.querySelector('[data-testid="draft-log"]')?.innerText || "").slice(0, 60),
  }))()`);
  if (size.mobile) {
    await tab.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pos.x, y: pos.y }] });
    await sleep(60);
    await tab.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await tab.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
    await sleep(50);
    await tab.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
  }
  await sleep(900);
  const afterTap = await ev(tab, `(() => ({
    gone: !document.querySelector('[data-testid="hero-card"][data-hero="' + ${JSON.stringify(targetHero)} + '"]'),
    log: (document.querySelector('[data-testid="draft-log"]')?.innerText || "").slice(0, 60),
    picks: document.querySelectorAll('[data-testid="pick-avatar"]').length,
  }))()`);
  cap.tap = { targetHero, pos, beforeTap, afterTap };
  ck(`${tag} 6a) 短點擊選到了指名的那一隻（${targetHero}：已離開英雄池）`, !!afterTap?.gone, cap.tap);
  ck(`${tag} 6b) 短點擊確實產生了一次選角動作（動態有更新）`,
    !!afterTap?.log && afterTap.log !== beforeTap?.log, { before: beforeTap?.log, after: afterTap?.log });

  // ── §7 「誰克制誰」已從 Ban/Pick 移除 ────────────────────────────────────
  await expandPlan(tab);
  const counter = await ev(tab, `(() => {
    const body = document.body.innerText || "";
    const rows = [...document.querySelectorAll('[data-testid="draft-plan-row"]')];
    return {
      counterNodes: document.querySelectorAll('[data-testid="draft-plan-counter"]').length,
      rowsWithCounterAttr: rows.filter((r) => r.hasAttribute("data-counter")).length,
      rows: rows.length,
      hasCounterWord: /克制|被壓制/.test(body),
      hasFitWord: /適性/.test(body),
      hasNeedsWord: /尚缺|五路到齊/.test(body),
    };
  })()`);
  cap.counter = counter;
  ck(`${tag} 7a) 沒有任何「被壓制」節點（draft-plan-counter = 0）`, counter?.counterNodes === 0, counter);
  ck(`${tag} 7b) 摘要列不再帶 data-counter 屬性`, counter?.rowsWithCounterAttr === 0, counter);
  ck(`${tag} 7c) 整頁文字不再出現「克制／被壓制」`, counter?.hasCounterWord === false, counter);
  //  ── §8 真正與選角決策相關的資訊必須留著 ────────────────────────────────
  ck(`${tag} 8a) 適性仍在`, counter?.hasFitWord === true, counter);
  ck(`${tag} 8b) 陣容需求（尚缺／五路到齊）仍在`, counter?.hasNeedsWord === true, counter);
  const needs = await readRows(tab, '[data-testid="comp-needs"]', ["have", "need"]);
  ck(`${tag} 8c) comp-needs 錨點仍在且有值`, needs.length === 1 && (needs[0].have !== null), needs);
  await shot(`${tag}-03-plan-no-counter.png`);

  results.data[tag] = cap;
  return cap;
}

// ══════════════════════════════════════════════════════════════════════════
//  完整流程：Lineup → Ban/Pick → Loading → GameView → Result → Replay
//  每個驗收尺寸都跑一次。這裡刻意**不**重做 hotfix1 的逐席配置比對
//  （那支還在跑，且四個尺寸都比過），本節只證「這個尺寸走得完、選得完角」。
// ══════════════════════════════════════════════════════════════════════════
async function runFullFlow(size) {
  const tag = `${size.tag} flow`;
  const cap = {};
  await tab.send("Emulation.setDeviceMetricsOverride", { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.mobile });
  await tab.send("Emulation.setTouchEmulationEnabled", { enabled: size.mobile, maxTouchPoints: 5 });
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1` });
  await sleep(2800);
  await clickUntil(tab, "MOBA", "先發五人", 20);
  await clickUntil(tab, "確認陣容", "進入 Ban/Pick", 20);
  ck(`${tag} F1) 進入 Ban/Pick`, await clickUntil(tab, "進入 Ban/Pick", "選角動態", 25));

  //  一路選到底。每次都點捲動區裡的第一張卡（用 data-testid，不用索引猜結構）。
  for (let i = 0; i < 60; i++) {
    if ((await text(tab)).includes("選角完成")) break;
    await ev(tab, `(() => {
      const b = document.querySelector('[data-testid="hero-choose"]');
      if (!b) return false; b.click(); return true;
    })()`).catch(() => null);
    await sleep(700);
  }
  const doneDraft = (await text(tab)).includes("選角完成");
  ck(`${tag} F2) 這個尺寸選得完角（14 步走到「選角完成」）`, doneDraft);
  cap.picks = await readRows(tab, '[data-testid="pick-avatar"]', ["hero", "code"]);
  ck(`${tag} F3) 我方五隻都選好且都有分路`,
    cap.picks.length === 5 && cap.picks.every((p) => !!p.code), cap.picks);
  await shot(`${size.tag}-04-draft-done.png`);

  ck(`${tag} F4) 確認鈕可見可按`, await ev(tab, `!!document.querySelector('[data-testid="confirm-draft"]')`));
  await ev(tab, `(() => { const b=document.querySelector('[data-testid="confirm-draft"]'); if(b){b.click();return true;} return false; })()`);
  await sleep(1200);
  ck(`${tag} F5) 進入 Loading`, await clickUntil(tab, "開始載入", "VS", 20));
  for (let i = 0; i < 120; i++) { await sleep(500); if (await ev(tab, "!!document.querySelector('canvas')").catch(() => false)) break; }
  ck(`${tag} F6) 進入正式 GameView`, await ev(tab, "!!document.querySelector('canvas')"));
  await ev(tab, `(() => { const b=document.querySelector('[data-testid="dev-fast-forward"]'); if(b){b.click();return true;} return false; })()`);
  let ended = false;
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const t = await text(tab).catch(() => "");
    if (t.includes("觀看重播") || t.includes("查看賽後")) { ended = true; break; }
  }
  ck(`${tag} F7) 打到終局並進入 Result`, ended);
  await shot(`${size.tag}-05-result.png`);
  ck(`${tag} F8) 可以進入 Replay`, await clickUntil(tab, "觀看重播", "REPLAY", 20));
  await shot(`${size.tag}-06-replay.png`);
  results.data[`${size.tag}-flow`] = cap;
}

try {
  for (const sz of SIZES) await runSize(sz);
  for (const sz of SIZES) await runFullFlow(sz);
  //  ── 跨尺寸總結 ──────────────────────────────────────────────────────────
  const all = SIZES.map((z) => results.data[z.tag]);
  ck("跨尺寸 A) 六個尺寸都只有一個真捲動軸，且就是英雄格",
    all.every((c) => c?.frame?.realScrollers?.length === 1 && c.frame.realScrollers[0] === "hero-grid-scroll"),
    SIZES.map((z, i) => [z.tag, all[i]?.frame?.realScrollers]));
  ck("跨尺寸 B) 六個尺寸都沒有「裁掉又不能捲」的祖先",
    all.every((c) => (c?.frame?.clippingAncestors?.length ?? 99) === 0),
    SIZES.map((z, i) => [z.tag, all[i]?.frame?.clippingAncestors]));
  ck("跨尺寸 C) 六個尺寸都捲得到最後一位英雄且未被遮住（100 隻的最壞情況）",
    all.every((c) => c?.scrollAll?.lastCard?.insideScroller && c.scrollAll.lastCard.insideViewport && c.scrollAll.lastCard.notCovered),
    SIZES.map((z, i) => [z.tag, all[i]?.scrollAll?.lastCard?.hero, all[i]?.scrollAll?.lastCard?.notCovered]));
  ck("跨尺寸 D) 六個尺寸切換篩選與搜尋都回到頂部",
    all.every((c) => c?.filterReset?.after === 0 && c?.queryReset?.after === 0),
    SIZES.map((z, i) => [z.tag, all[i]?.filterReset, all[i]?.queryReset]));
  ck("跨尺寸 E) 六個尺寸都沒有克制關係顯示",
    all.every((c) => c?.counter?.counterNodes === 0 && c?.counter?.hasCounterWord === false),
    SIZES.map((z, i) => [z.tag, all[i]?.counter]));
} catch (e) {
  ck(`流程中斷：${e.message}`, false);
} finally {
  writeFileSync(resolve(OUT_DIR, "banpick_hotfix2_browser.json"), JSON.stringify(results, null, 2), "utf8");
  console.log(`\n${failed === 0 ? "✅ PASS" : `❌ FAIL（${failed} 項）`}　證據：${OUT_DIR}`);
  try { await tab.send("Browser.close", {}, 5000); } catch { /* ignore */ }
  browser.kill(); server.kill();
  process.exit(failed === 0 ? 0 : 1);
}
