#!/usr/bin/env node
// ============================================================================
//  tools/shot_hero_matchups_k.mjs — Milestone K 瀏覽器驗收（Hero Codex 對位頁）
//
//  驗的是**行為**，不是字串：
//    · 頁籤：用 data-tab 指名，不用 DOM 索引數第幾顆。
//    · 點擊：派真的滑鼠／觸控事件到卡片中心，而且先用 elementFromPoint
//      確認那個點打到的就是這張卡（＝沒被蓋住），再看詳情的 data-hero 有沒有換人。
//    · 捲動：派真手勢（手機單指拖曳／桌機滾輪）看 scrollTop 有沒有動，
//      最後一張對位卡是否完整落在面板與 viewport 內、而且沒被遮住。
//      ⚠ 不用 `scrollHeight > clientHeight` 推論「捲得動」——J-close Hotfix 2
//        的教訓就是這個推論在 overflow:hidden 祖先下完全失效。
//    · 空狀態：挑一隻**確定沒有資料**的英雄（靈魂共鳴），看文案有沒有出現。
//    · 假數據：讀對位面板的 innerText，比對禁用詞（勝率／場次／版本統計）。
//
//  六個尺寸全跑；截圖只在三個代表性版型各留必要張數（避免大量重複圖片）。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/milestone-k/evidence"));
//  六個尺寸全部跑完整斷言；`shots` 只決定「哪幾張圖值得留下來當證據」——
//  同一個版型不重複存圖（Milestone K 的證據上限是 10 張左右）。
const SIZES = [
  { w: 1920, h: 1080, tag: "desk1920", mobile: false, shots: ["top", "empty", "banpick"] },
  { w: 1366, h: 768, tag: "desk1366", mobile: false, shots: ["banpick"] },
  { w: 430, h: 932, tag: "mob430", mobile: true, shots: [] },
  { w: 412, h: 915, tag: "mob412", mobile: true, shots: [] },
  { w: 390, h: 844, tag: "mob390", mobile: true, shots: ["top", "bottom", "empty", "banpick"] },
  { w: 360, h: 800, tag: "mob360", mobile: true, shots: ["top", "banpick"] },
];
//  對位資料的期望值（與 src/data/heroMatchups.js 同源；不符就是資料被改了）
const EXPECT = {
  ironclad: { strongAgainst: 2, weakAgainst: 2, synergies: 2, inferred: true },
  luminary: { strongAgainst: 0, weakAgainst: 1, synergies: 2, inferred: false },
};
const NO_DATA_HERO = "linghun";     // 靈魂共鳴：本輪確定沒有對位資料
//  本輪有對位資料的 10 隻（與 src/data/heroMatchups.js 同源）。Ban/Pick 那一段要
//  「清單裡第一個還在池子裡的」，因為選角流程會把英雄禁掉／選走。
const MATCHUP_HEROES = ["ironclad", "ravager", "stoneguard", "voidrift", "bingshuang",
  "maestro", "luminary", "duskblade", "sting", "leiting"];
const BANNED = /勝率|勝場|敗率|場次|對局數|樣本數|選用率|禁用率|patch|版本\s*\d/i;

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

const results = { notes: [], shots: [], data: {} };
let failed = 0;
const ck = (label, cond, extra = null) => {
  results.notes.push({ label, ok: !!cond, extra });
  console.log(`${cond ? "✅" : "❌"} ${label}${!cond && extra != null ? `　→ ${JSON.stringify(extra)}` : ""}`);
  if (!cond) failed++;
  return !!cond;
};

if (!CHROME) { console.error("找不到 Chrome"); process.exit(2); }
const baseUrl = "http://localhost:4191";
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--port", "4191", "--strictPort"], { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
for (let i = 0; i < 120; i++) { try { const r = await fetch(baseUrl, { redirect: "manual" }); if (r.status < 500) break; } catch { /* wait */ } await sleep(500); }
const profileDir = resolve(ROOT, "node_modules/.cache", `esmo-mk-${process.pid}`);
const port = 9800 + (process.pid % 150);
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

// ── DOM 量測 ────────────────────────────────────────────────────────────────
const detailState = () => ev(tab, `(() => {
  const d = document.querySelector('[data-testid="codex-detail"]');
  if (!d) return null;
  const b = d.getBoundingClientRect(), cs = getComputedStyle(d);
  //  巢狀捲動：面板**內部**還有沒有第二個縱向捲動容器
  const nested = [...d.querySelectorAll("*")].filter((e) => {
    const c = getComputedStyle(e);
    return e.scrollHeight > e.clientHeight + 8 && /auto|scroll/.test(c.overflowY);
  }).map((e) => e.getAttribute("data-testid") || e.tagName);
  //  裁掉內容又不能捲的祖先（Hotfix 2 的病根）
  const clipping = [];
  let el = d.parentElement;
  while (el && el !== document.documentElement) {
    const c = getComputedStyle(el);
    if (el.scrollHeight > el.clientHeight + 2 && (c.overflowY === "hidden" || c.overflowY === "clip")) {
      clipping.push(el.getAttribute("data-testid") || el.tagName);
    }
    el = el.parentElement;
  }
  return {
    hero: d.getAttribute("data-hero"), tab: d.getAttribute("data-tab"),
    hasBack: !!document.querySelector('[data-testid="codex-detail-back"]'),
    x: Math.round(b.left + b.width / 2), top: Math.round(b.top), bottom: Math.round(b.bottom),
    scrollTop: Math.round(d.scrollTop), maxScroll: Math.round(d.scrollHeight - d.clientHeight),
    overflowY: cs.overflowY, overscroll: cs.overscrollBehaviorY, padBottom: cs.paddingBottom,
    nested, clipping, vh: window.innerHeight,
    insideViewport: b.top >= -1 && b.bottom <= window.innerHeight + 1,
    matchupText: (document.querySelector('[data-testid="codex-matchups"]')?.innerText || ""),
    //  「有沒有假數據」要問的是**宣稱資料的區域**，不是連我們自己的免責聲明
    //  一起掃（那兩句本來就寫著「不顯示勝率、場次」，掃全頁會誤判）。
    dataText: (() => {
      const p = document.querySelector('[data-testid="codex-matchups"]');
      if (!p) return "";
      const c = p.cloneNode(true);
      c.querySelectorAll('[data-testid="matchup-inferred-note"],[data-testid="matchup-disclaimer"]').forEach((n) => n.remove());
      return c.textContent || "";
    })(),
    disclaimer: (document.querySelector('[data-testid="matchup-disclaimer"]')?.innerText || ""),
    emptyText: (document.querySelector('[data-testid="matchup-empty"]')?.innerText || ""),
    inferredNote: (document.querySelector('[data-testid="matchup-inferred-note"]')?.innerText || ""),
  };
})()`);

const tabsInfo = () => ev(tab, `[...document.querySelectorAll('[data-testid="codex-tab"]')].map((e) => {
  const b = e.getBoundingClientRect();
  const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return { tab: e.getAttribute("data-tab"), label: e.textContent.trim(),
    active: e.getAttribute("data-active") === "1", x: cx, y: cy,
    w: Math.round(b.width), inView: b.top >= 0 && b.bottom <= window.innerHeight,
    reachable: !!hit && (hit === e || e.contains(hit)) };
})`);

const sectionsInfo = () => ev(tab, `[...document.querySelectorAll('[data-testid="matchup-section"]')].map((e) => ({
  section: e.getAttribute("data-section"), count: Number(e.getAttribute("data-count")),
  empty: !!e.querySelector('[data-testid="matchup-section-empty"]'),
  emptyText: e.querySelector('[data-testid="matchup-section-empty"]')?.innerText || "",
  title: e.querySelector("span:nth-child(2)")?.innerText || "",
}))`);

const cardsInfo = () => ev(tab, `[...document.querySelectorAll('[data-testid="matchup-card"]')].map((e) => {
  const b = e.getBoundingClientRect();
  return { hero: e.getAttribute("data-hero"), source: e.getAttribute("data-source"),
    conf: e.getAttribute("data-confidence"), section: e.closest('[data-testid="matchup-section"]')?.getAttribute("data-section"),
    left: Math.round(b.left), top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width),
    srcLabel: e.querySelector('[data-testid="matchup-source"]')?.innerText || "",
    confLabel: e.querySelector('[data-testid="matchup-confidence"]')?.innerText || "" };
})`);

/** 某張對位卡在畫面上的可點狀態（含 elementFromPoint 反查有沒有被蓋住）。 */
const cardHit = (id) => ev(tab, `(() => {
  const e = document.querySelector('[data-testid="matchup-card"][data-hero="${id}"]');
  if (!e) return null;
  const b = e.getBoundingClientRect();
  const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
  const hit = document.elementFromPoint(x, y);
  return { x, y, inView: b.top >= 0 && b.bottom <= window.innerHeight,
    notCovered: !!hit && (hit === e || e.contains(hit)),
    hitId: hit ? (hit.getAttribute("data-testid") || hit.tagName) : null };
})()`);

/** 派真手勢：手機觸控點擊，桌機滑鼠點擊。 */
async function tapAt(x, y, mobile) {
  if (mobile) {
    await tab.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await sleep(40);
    await tab.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await tab.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(40);
    await tab.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  await sleep(420);
}

/** 面板捲動一次（手機單指拖曳／桌機滾輪）。 */
async function scrollPanelOnce(d, mobile, dir = 1) {
  const x = d.x;
  const top = Math.max(2, d.top), bottom = Math.min(d.vh - 2, d.bottom);
  if (mobile) {
    const y0 = dir > 0 ? bottom - 20 : top + 20;
    const y1 = dir > 0 ? top + 20 : bottom - 20;
    const step = dir > 0 ? -26 : 26;
    await tab.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
    for (let y = y0; dir > 0 ? y >= y1 : y <= y1; y += step) {
      await tab.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      await sleep(14);
    }
    await tab.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await tab.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y: Math.round((top + bottom) / 2), deltaX: 0, deltaY: dir * 260, pointerType: "mouse" });
  }
  await sleep(140);
}

async function scrollPanelToEnd(mobile, n = 40) {
  let d = await detailState(); let last = -1;
  for (let i = 0; i < n && d; i++) {
    if (d.scrollTop >= d.maxScroll - 1) break;
    if (d.scrollTop === last) break;
    last = d.scrollTop;
    await scrollPanelOnce(d, mobile, 1);
    d = await detailState();
  }
  await sleep(320);
  return detailState();
}

const setCodexSearch = (q) => ev(tab, `(() => {
  const el = document.querySelector('[data-testid="codex-search"]');
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, ${JSON.stringify(q)});
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`);

/** 從圖鑑列表開一隻英雄（先搜尋縮小範圍，再捲進視野、確認沒被蓋住，然後派真點擊）。 */
async function openHeroFromGrid(id, name, mobile) {
  await setCodexSearch(name); await sleep(420);
  const pos = await ev(tab, `(() => {
    const e = document.querySelector('[data-testid="codex-hero"][data-hero="${id}"]');
    if (!e) return null;
    e.scrollIntoView({ block: "center" });
    const b = e.getBoundingClientRect();
    const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { x, y, notCovered: !!hit && (hit === e || e.contains(hit)) };
  })()`);
  if (!pos) return null;
  await tapAt(pos.x, pos.y, mobile);
  return { ...pos, state: await detailState() };
}

const goTab = async (id, mobile) => {
  const t = (await tabsInfo()).find((x) => x.tab === id);
  if (!t) return null;
  await tapAt(t.x, t.y, mobile);
  return detailState();
};

/**
 * 把選角推進到「我方至少選了一隻英雄，而且現在輪到玩家」。
 * 為什麼要這個：BanPickScreen 只在 `!isMyTurn` 掛 AI 的 setTimeout，
 * 而 `step` 一變就會把英雄格 scrollTop 歸零。要驗「關閉彈窗不會弄丟狀態」，
 * 就必須挑一個**畫面不會自己動**的時刻，否則量到的是 AI 回合造成的重置。
 */
async function playToBluePick(maxRounds = 40) {
  for (let i = 0; i < maxRounds; i++) {
    const s = await ev(tab, `(() => ({
      myTurn: !!document.querySelector('[data-testid="hero-picker"]'),
      blue: document.querySelectorAll('[data-testid="pick-avatar"]').length,
      done: (document.body.innerText || "").includes("確認出戰配置"),
    }))()`);
    if (s.done) return s;                       // 選完了也算穩定狀態
    if (s.myTurn && s.blue >= 1) return s;
    if (s.myTurn) {
      await ev(tab, `(() => {
        const b = document.querySelector('[data-testid="hero-choose"]');
        if (b) { b.click(); return true; } return false;
      })()`);
      await sleep(500);
    } else {
      await sleep(700);                          // AI 回合，等它的 setTimeout
    }
  }
  return ev(tab, `(() => ({ myTurn: !!document.querySelector('[data-testid="hero-picker"]'),
    blue: document.querySelectorAll('[data-testid="pick-avatar"]').length, done: false }))()`);
}

const closeDetail = () => ev(tab, `(() => {
  const d = document.querySelector('[data-testid="codex-detail"]');
  const btns = d ? [...d.querySelectorAll("button")].filter((b) => b.textContent.trim() === "✕") : [];
  if (btns[0]) { btns[0].click(); return true; }
  return false;
})()`);

// ══════════════════════════════════════════════════════════════════════════
async function runSize(size) {
  const tag = size.tag, mobile = size.mobile;
  const cap = {};
  await tab.send("Emulation.setDeviceMetricsOverride", { width: size.w, height: size.h, deviceScaleFactor: 1, mobile });
  await tab.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1` });
  await sleep(2800);

  console.log(`\n──────── ${tag}（${size.w}×${size.h}）────────`);
  ck(`${tag} 0a) 進入賽前配置`, await clickUntil(tab, "MOBA", "先發五人", 20));
  await clickUntil(tab, "確認陣容", "進入 Ban/Pick", 20);
  ck(`${tag} 0b) 進入 Ban/Pick`, await clickUntil(tab, "進入 Ban/Pick", "選角動態", 25));
  ck(`${tag} 0c) 從 Ban/Pick 進入英雄圖鑑`, await clickUntil(tab, "📖 圖鑑", "英雄圖鑑", 20));
  await sleep(700);

  // ── §1 開啟有資料的英雄，第五頁「對位」必須存在且順序正確 ─────────────
  const opened = await openHeroFromGrid("ironclad", "鋼鐵衛士", mobile);
  ck(`${tag} 1a) 圖鑑卡沒被遮住，真點擊後開出鋼鐵衛士的詳情`,
    !!opened?.notCovered && opened?.state?.hero === "ironclad", opened);
  const tabs0 = await tabsInfo();
  cap.tabs = tabs0;
  ck(`${tag} 1b) 五個頁籤且順序為 概覽｜數據｜技能｜戰術｜對位`,
    tabs0.length === 5 && JSON.stringify(tabs0.map((t) => t.tab)) === JSON.stringify(["overview", "stats", "skills", "tactics", "matchups"])
    && JSON.stringify(tabs0.map((t) => t.label)) === JSON.stringify(["概覽", "數據", "技能", "戰術", "對位"]),
    tabs0.map((t) => [t.tab, t.label]));
  ck(`${tag} 1c) 五個頁籤全部在 viewport 內且點得到（沒被蓋住、沒被擠爆）`,
    tabs0.every((t) => t.inView && t.reachable && t.w >= 34),
    tabs0.map((t) => [t.tab, t.inView, t.reachable, t.w]));
  ck(`${tag} 1d) 預設停在概覽（開新英雄不會莫名其妙跳到對位）`,
    tabs0.find((t) => t.active)?.tab === "overview", tabs0.find((t) => t.active)?.tab);

  const st1 = await goTab("matchups", mobile);
  ck(`${tag} 1e) 點「對位」真的切過去（data-tab=matchups）`, st1?.tab === "matchups", st1?.tab);

  // ── §2 三個區塊與卡片內容 ───────────────────────────────────────────────
  const secs = await sectionsInfo();
  const cards = await cardsInfo();
  cap.sections = secs; cap.cards = cards;
  ck(`${tag} 2a) 三個區塊都在，順序為 較有優勢／較難應付／適合搭配`,
    secs.length === 3 && JSON.stringify(secs.map((s) => s.section)) === JSON.stringify(["strongAgainst", "weakAgainst", "synergies"])
    && JSON.stringify(secs.map((s) => s.title)) === JSON.stringify(["較有優勢", "較難應付", "適合搭配"]),
    secs.map((s) => [s.section, s.title]));
  ck(`${tag} 2b) 各區數量與資料層一致（2／2／2）`,
    JSON.stringify(secs.map((s) => s.count)) === JSON.stringify([EXPECT.ironclad.strongAgainst, EXPECT.ironclad.weakAgainst, EXPECT.ironclad.synergies]),
    secs.map((s) => s.count));
  ck(`${tag} 2c) 卡片數量與各區宣告的數量吻合（${cards.length} 張）`,
    cards.length === secs.reduce((n, s) => n + s.count, 0), { cards: cards.length, secs: secs.map((s) => s.count) });
  ck(`${tag} 2d) 每張卡都有來源標籤與信心程度（文案就是規格那三種／三種）`,
    cards.length > 0 && cards.every((c) => ["設計資料", "系統推測", "實戰驗證"].includes(c.srcLabel)
      && ["信心低", "信心中", "信心高"].includes(c.confLabel)),
    cards.map((c) => [c.hero, c.srcLabel, c.confLabel]));
  ck(`${tag} 2e) 卡片以 heroId 指名（測試不靠 DOM 索引猜英雄）`,
    cards.every((c) => !!c.hero) && new Set(cards.map((c) => c.hero + c.section)).size === cards.length,
    cards.map((c) => c.hero));

  // ── §3 inferred 警語與「沒有假數據」 ───────────────────────────────────
  const d3 = await detailState();
  cap.matchupText = d3?.matchupText;
  ck(`${tag} 3a) 有 inferred 條目 ⇒ 顯示推測警語（原文一字不差）`,
    cards.some((c) => c.source === "inferred")
    && d3.inferredNote.includes("此內容依英雄定位與技能特性推測，不代表真實玩家勝率。"),
    d3?.inferredNote);
  ck(`${tag} 3b) 對位資料區沒有勝率／場次／選用率／版本統計（免責聲明本身不算）`,
    !BANNED.test(d3?.dataText || ""), (d3?.dataText || "").match(BANNED)?.[0] ?? null);
  ck(`${tag} 3c) 系統推測的卡片標籤就寫「系統推測」，不會冒充實戰驗證`,
    cards.filter((c) => c.source === "inferred").every((c) => c.srcLabel === "系統推測")
    && cards.every((c) => c.source !== "verified"),
    cards.map((c) => [c.hero, c.source, c.srcLabel]));
  ck(`${tag} 3d) 頁面主動聲明「沒有真實對局樣本，不顯示勝率／場次／版本統計」`,
    (d3?.disclaimer || "").includes("本作沒有真實對局樣本，因此不顯示勝率、場次或版本統計。"),
    d3?.disclaimer);

  // ── §4 版型：手機單欄／桌機兩欄、無巢狀捲動、底部不被吃掉 ──────────────
  const colsOf = (list) => new Set(list.map((c) => c.left)).size;
  const strong = cards.filter((c) => c.section === "strongAgainst");
  cap.cols = colsOf(strong);
  ck(`${tag} 4a) ${mobile ? "手機對位卡單欄" : "桌機對位卡兩欄"}（實測 ${cap.cols} 欄）`,
    cap.cols === (mobile ? 1 : 2), strong.map((c) => [c.hero, c.left, c.w]));
  ck(`${tag} 4b) 面板內部沒有第二個縱向捲動容器（不是巢狀捲動）`,
    Array.isArray(d3?.nested) && d3.nested.length === 0, d3?.nested);
  ck(`${tag} 4c) 面板沒有「裁掉內容又捲不動」的祖先`,
    Array.isArray(d3?.clipping) && d3.clipping.length === 0, d3?.clipping);
  ck(`${tag} 4d) 面板整個在 viewport 內`, d3?.insideViewport === true, { top: d3?.top, bottom: d3?.bottom, vh: d3?.vh });
  ck(`${tag} 4e) 面板底部保留 safe-area padding（≥26px）`,
    parseFloat(d3?.padBottom || "0") >= 26, d3?.padBottom);
  ck(`${tag} 4f) overscroll-behavior 為 contain（捲到底不帶動外層）`,
    d3?.overscroll === "contain", d3?.overscroll);
  if (size.shots.includes("top")) await shot(`${tag}-01-matchups-top.png`);

  // ── §5 真手勢捲到底，最後一張卡完整可見且沒被遮住 ──────────────────────
  const before = d3.scrollTop;
  const after = await scrollPanelToEnd(mobile);
  cap.scroll = { before, after: after?.scrollTop, max: after?.maxScroll };
  ck(`${tag} 5a) ${mobile ? "單指拖曳" : "滾輪"}真的捲得動面板（${before} → ${after?.scrollTop}／上限 ${after?.maxScroll}）`,
    (after?.maxScroll ?? 0) === 0 ? true : after.scrollTop > before, cap.scroll);
  const lastCard = cards[cards.length - 1];
  const lastHit = await cardHit(lastCard.hero);
  cap.lastCard = { hero: lastCard.hero, ...lastHit };
  ck(`${tag} 5b) 捲到底後最後一張卡（${lastCard.hero}）完整在 viewport 內`,
    lastHit?.inView === true, cap.lastCard);
  ck(`${tag} 5c) 最後一張卡沒有被底部安全區或任何東西蓋住（elementFromPoint 反查）`,
    lastHit?.notCovered === true, cap.lastCard);
  if (size.shots.includes("bottom")) await shot(`${tag}-02-matchups-bottom.png`);

  // ── §6 點對位卡 → 開該英雄；返回 → 回到原英雄且仍停在「對位」 ───────────
  //   挑「較難應付」的第一張（毀滅者），它同時驗證了 design 高信心條目。
  const target = cards.find((c) => c.section === "weakAgainst") || cards[0];
  const hitT = await cardHit(target.hero);
  ck(`${tag} 6a) 目標對位卡（${target.hero}）在畫面上且沒被蓋住`,
    hitT?.inView && hitT?.notCovered, hitT);
  await tapAt(hitT.x, hitT.y, mobile);
  const st6 = await detailState();
  cap.pushed = st6 && { hero: st6.hero, tab: st6.tab, hasBack: st6.hasBack };
  ck(`${tag} 6b) 點下去真的開了那隻英雄的詳情（hero=${st6?.hero}）`,
    st6?.hero === target.hero, cap.pushed);
  ck(`${tag} 6c) 跳過去後仍停在「對位」頁，且出現「← 上一隻」`,
    st6?.tab === "matchups" && st6?.hasBack === true, cap.pushed);
  await ev(tab, `document.querySelector('[data-testid="codex-detail-back"]').click()`);
  await sleep(420);
  const st7 = await detailState();
  cap.popped = st7 && { hero: st7.hero, tab: st7.tab, hasBack: st7.hasBack };
  ck(`${tag} 6d) 返回後回到原英雄（ironclad）**且仍在「對位」頁籤**`,
    st7?.hero === "ironclad" && st7?.tab === "matchups", cap.popped);
  ck(`${tag} 6e) 回到最上層後不再顯示「← 上一隻」`, st7?.hasBack === false, cap.popped);

  // ── §7 關閉再開同一隻 ⇒ 保留原英雄與原頁籤 ──────────────────────────────
  await closeDetail(); await sleep(420);
  ck(`${tag} 7a) 關閉後回到圖鑑列表`, (await detailState()) === null);
  const re = await openHeroFromGrid("ironclad", "鋼鐵衛士", mobile);
  ck(`${tag} 7b) 再開同一隻英雄 ⇒ 停回「對位」頁（狀態有保留）`,
    re?.state?.hero === "ironclad" && re?.state?.tab === "matchups", re?.state);

  // ── §8 區塊空狀態（星輝的「較有優勢」是空的）─────────────────────────
  await closeDetail(); await sleep(380);
  const lum = await openHeroFromGrid("luminary", "星輝", mobile);
  ck(`${tag} 8a) 開啟星輝`, lum?.state?.hero === "luminary", lum?.state);
  await goTab("matchups", mobile);
  const lsec = await sectionsInfo();
  cap.luminary = lsec;
  ck(`${tag} 8b) 星輝的「較有優勢」是空的，並顯示區塊空狀態文案`,
    lsec[0]?.section === "strongAgainst" && lsec[0]?.count === 0 && lsec[0]?.empty === true
    && lsec[0]?.emptyText.includes("目前尚無已整理的對位資料。"), lsec[0]);
  ck(`${tag} 8c) 另外兩區照常有資料（1／2），空的只有該區`,
    lsec[1]?.count === EXPECT.luminary.weakAgainst && lsec[2]?.count === EXPECT.luminary.synergies
    && !lsec[1]?.empty && !lsec[2]?.empty, lsec.map((s) => [s.section, s.count, s.empty]));

  // ── §9 整隻英雄沒資料 ⇒ 全頁空狀態 ─────────────────────────────────────
  await closeDetail(); await sleep(380);
  const none = await openHeroFromGrid(NO_DATA_HERO, "靈魂共鳴", mobile);
  ck(`${tag} 9a) 開啟靈魂共鳴（本輪沒有整理對位資料的英雄）`,
    none?.state?.hero === NO_DATA_HERO, none?.state);
  const st9 = await goTab("matchups", mobile);
  cap.empty = st9 && { tab: st9.tab, emptyText: st9.emptyText, matchupText: st9.matchupText };
  ck(`${tag} 9b) 顯示空狀態文案「目前尚無已整理的對位資料。」`,
    st9?.emptyText.includes("目前尚無已整理的對位資料。"), cap.empty);
  ck(`${tag} 9c) 空狀態不會冒出任何卡片，也沒有假數據`,
    (await cardsInfo()).length === 0 && !BANNED.test(st9?.emptyText || ""), cap.empty);
  if (size.shots.includes("empty")) await shot(`${tag}-03-matchups-empty.png`);

  // ── §10 回 Ban/Pick：克制動態不得復活 ──────────────────────────────────
  await closeDetail(); await sleep(320);
  await clickUntil(tab, "← 返回", "選角動態", 20);
  await sleep(700);
  const bp = await ev(tab, `(() => {
    const t = document.body.innerText || "";
    return {
      onBanPick: t.includes("選角動態"),
      counterNodes: document.querySelectorAll('[data-counter],[data-testid="draft-plan-counter"]').length,
      counterText: /克制/.test(t) ? (t.match(/.{0,12}克制.{0,12}/)?.[0] ?? "hit") : null,
    };
  })()`);
  cap.banpick = bp;
  ck(`${tag} 10a) 回到 Ban/Pick`, bp?.onBanPick === true, bp);
  ck(`${tag} 10b) Ban/Pick 沒有任何克制節點或克制字樣（Hotfix 2 未被推翻）`,
    bp?.counterNodes === 0 && bp?.counterText === null, bp);
  // ── §11 Ban/Pick 的 ⓘ 也要有五頁，而且關掉之後不能弄丟選角狀態 ──────────
  //   ⚠ 這一段必須在**輪到玩家**的時候做。BanPickScreen 只有在 !isMyTurn 才會掛
  //     AI 的 setTimeout；而且 `[pickFilter, pickQuery, step, showPicker]` 一變
  //     就會把英雄格 scrollTop 歸零（Hotfix 2 刻意的行為）。若在 AI 回合量測，
  //     step 會在彈窗開著的時候前進 ⇒ scrollTop 歸零，測出來的紅燈不是本輪造成的。
  await playToBluePick();
  const turn = await ev(tab, `(() => {
    const picker = document.querySelector('[data-testid="hero-picker"]');
    return { myTurn: !!picker,
      blue: [...document.querySelectorAll('[data-testid="pick-avatar"]')].map((e) => e.getAttribute("data-hero")) };
  })()`);
  ck(`${tag} 11a) 已推進到「輪到玩家」且我方已有 ${turn?.blue?.length ?? 0} 隻已選英雄`,
    turn?.myTurn === true && (turn?.blue?.length ?? 0) >= 1, turn);

  const setFilter = async (f) => {
    await ev(tab, `(() => {
      const b = [...document.querySelectorAll('[data-testid="pick-filter"]')].find((x) => x.getAttribute("data-filter") === ${JSON.stringify("")} + ${JSON.stringify(f)});
      if (b) b.click(); return !!b;
    })()`);
    await sleep(420);
  };
  const setQuery = async (q) => {
    await ev(tab, `(() => {
      const el = document.querySelector('[data-testid="hero-search"]');
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      s.call(el, ${JSON.stringify(q)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true;
    })()`);
    await sleep(480);
  };

  /** 開一次英雄卡的 ⓘ 再關掉（給「開關詳情不會弄丟狀態」用）。 */
  const openInfoAndClose = async () => {
    const p = await ev(tab, `(() => {
      const card = document.querySelector('[data-testid="hero-card"]');
      const info = card && [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "ⓘ");
      if (!info) return null;
      const b = info.getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    })()`);
    if (!p) return false;
    await tapAt(p.x, p.y, mobile);
    await closeDetail();
    await sleep(500);
    return true;
  };

  const snapBp = () => ev(tab, `(() => {
    const g = document.querySelector('[data-testid="hero-grid-scroll"]');
    return {
      filter: [...document.querySelectorAll('[data-testid="pick-filter"]')].find((b) => b.getAttribute("data-active") === "1")?.getAttribute("data-filter") ?? null,
      query: document.querySelector('[data-testid="hero-search"]')?.value ?? null,
      scrollTop: g ? Math.round(g.scrollTop) : null,
      pool: Number(document.querySelector('[data-testid="pick-count"]')?.getAttribute("data-count") ?? -1),
      blue: [...document.querySelectorAll('[data-testid="pick-avatar"]')].map((e) => e.getAttribute("data-hero")),
      cards: [...document.querySelectorAll('[data-testid="hero-card"]')].length,
    };
  })()`);
  //  ── 11b–11c：非預設**篩選**要撐得住開關詳情 ──────────────────────────
  //    ⚠ 為什麼篩選與捲動要分兩步量：實測任何非「全部」的定位篩選最多只有
  //      20 隻英雄（4 列），六個尺寸裡有四個根本捲不動（maxScroll=0）。
  //      硬把兩件事塞在同一個狀態，捲動那條斷言就會變成永遠測不到東西。
  await setFilter("戰士");
  const f1 = await snapBp();
  cap.bpFilterBefore = f1;
  ck(`${tag} 11b) 切到非預設篩選「戰士」（英雄池 ${f1?.pool} 位）`,
    f1?.filter === "戰士" && f1?.pool > 0, f1);
  await openInfoAndClose();
  const f2 = await snapBp();
  ck(`${tag} 11c) 開關英雄詳情後，篩選仍是「戰士」且英雄池數量不變`,
    f2?.filter === "戰士" && f2?.pool === f1?.pool, { before: f1, after: f2 });

  //  ── 11d 起：搜尋 ＋ 捲動位置（要一個真的捲得動的狀態）──────────────
  await setFilter("全部");
  await setQuery("之");
  await ev(tab, `(() => { const g = document.querySelector('[data-testid="hero-grid-scroll"]'); g.scrollTop = Math.min(120, g.scrollHeight - g.clientHeight); return g.scrollTop; })()`);
  await sleep(300);
  const b4 = await snapBp();
  cap.bpBefore = b4;
  ck(`${tag} 11d) 量測前狀態已就緒（搜尋「${b4?.query}」／${b4?.pool} 位／捲動 ${b4?.scrollTop}）`,
    b4?.query === "之" && b4?.pool >= 20 && b4?.scrollTop > 0, b4);

  //  開 ⓘ：挑一張**當下已經看得到**的卡，用 data-hero 指名。
  //  ⚠ 這裡刻意不呼叫 scrollIntoView——它會把英雄格捲回去，
  //    等於在量測之後偷改了「捲動位置」這個受測狀態（第一版就是這樣自己害自己紅燈）。
  const infoHero = await ev(tab, `(() => {
    const g = document.querySelector('[data-testid="hero-grid-scroll"]');
    const gb = g.getBoundingClientRect();
    const card = [...document.querySelectorAll('[data-testid="hero-card"]')].find((c) => {
      const b = c.getBoundingClientRect();
      return b.top >= gb.top - 1 && b.bottom <= gb.bottom + 1 && b.top >= 0 && b.bottom <= window.innerHeight;
    });
    if (!card) return null;
    const id = card.getAttribute("data-hero");
    const info = [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "ⓘ");
    if (!info) return null;
    const b = info.getBoundingClientRect();
    const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { id, x, y, notCovered: !!hit && (hit === info || info.contains(hit)),
      scrollTop: Math.round(g.scrollTop) };
  })()`);
  ck(`${tag} 11e) 找得到一張看得到的英雄卡的 ⓘ（${infoHero?.id}），而且沒被蓋住、沒動到捲動位置`,
    !!infoHero && infoHero.notCovered === true && infoHero.scrollTop === b4?.scrollTop, infoHero);
  await tapAt(infoHero.x, infoHero.y, mobile);
  const bpDetail = await detailState();
  const bpTabs = await tabsInfo();
  cap.banpickTabs = bpTabs.map((t) => t.tab);
  ck(`${tag} 11f) Ban/Pick 的 ⓘ 開出**五個**頁籤，第五個是「對位」`,
    bpTabs.length === 5
    && JSON.stringify(bpTabs.map((t) => t.tab)) === JSON.stringify(["overview", "stats", "skills", "tactics", "matchups"])
    && bpTabs[4].label === "對位", { hero: bpDetail?.hero, tabs: cap.banpickTabs });
  ck(`${tag} 11g) 五個頁籤在 Ban/Pick 這條路徑上也都點得到`,
    bpTabs.every((t) => t.inView && t.reachable && t.w >= 34),
    bpTabs.map((t) => [t.tab, t.inView, t.reachable, t.w]));
  {
    //  真的切到對位頁看它能不能畫（不是只看頁籤存在）
    const st = await goTab("matchups", mobile);
    const secs2 = await sectionsInfo();
    const empty = await ev(tab, `!!document.querySelector('[data-testid="matchup-empty"]')`);
    cap.banpickMatchups = { hero: bpDetail?.hero, tab: st?.tab, sections: secs2.length, empty };
    ck(`${tag} 11h) 對位頁在 Ban/Pick 路徑上真的畫得出來（三區塊或空狀態）`,
      st?.tab === "matchups" && (secs2.length === 3 || empty === true), cap.banpickMatchups);
    ck(`${tag} 11i) 這一頁一樣沒有勝率／場次／版本統計`,
      !BANNED.test(st?.dataText || ""), (st?.dataText || "").match(BANNED)?.[0] ?? null);
  }
  await closeDetail(); await sleep(520);
  const af = await snapBp();
  cap.bpAfter = af;
  ck(`${tag} 11j) 關閉詳情後，搜尋關鍵字仍是「${b4?.query}」（英雄池 ${af?.pool} 位不變）`,
    af?.query === b4?.query && af?.pool === b4?.pool, { before: b4, after: af });
  ck(`${tag} 11k) 關閉詳情後，英雄格捲動位置沒有被歸零（${b4?.scrollTop} → ${af?.scrollTop}）`,
    af?.scrollTop === b4?.scrollTop, { before: b4?.scrollTop, after: af?.scrollTop });
  ck(`${tag} 11l) 關閉詳情後，已選英雄一隻都沒少`,
    JSON.stringify(af?.blue) === JSON.stringify(b4?.blue), { before: b4?.blue, after: af?.blue });
  ck(`${tag} 11m) 關閉詳情後仍停在 Ban/Pick，而且還是輪到玩家（沒有被彈窗打斷流程）`,
    await ev(tab, `!!document.querySelector('[data-testid="hero-picker"]') && (document.body.innerText||"").includes("選角動態")`));
  ck(`${tag} 11n) 關閉詳情後 Ban/Pick 主畫面依然沒有克制節點或克制字樣`,
    await ev(tab, `(() => {
      const t = document.body.innerText || "";
      return document.querySelectorAll('[data-counter],[data-testid="draft-plan-counter"]').length === 0 && !/克制/.test(t);
    })()`));

  //  ── 11o：在 Ban/Pick 路徑上開一隻**真的有對位資料**的英雄 ────────────────
  //    上面 11h 寫成「三區塊**或**空狀態」，因為那張卡是誰要看當下的篩選結果。
  //    只靠那條，「三區塊能不能在 Ban/Pick 這條路徑畫出來」其實一次都沒被證明過
  //    （實測抽到的都是沒資料的英雄 ⇒ 永遠走空狀態分支）。這裡指名一隻有資料的。
  //    ⚠ 不可以指名單一英雄——選角流程會把英雄從池子裡吃掉（第一版指名鋼鐵衛士，
  //      六個尺寸全紅，因為他早就被禁用／選走了）。改成「清單裡第一個還在池子裡的」。
  await setQuery("");
  const withData = await ev(tab, `(() => {
    const want = ${JSON.stringify(MATCHUP_HEROES)};
    const cards = [...document.querySelectorAll('[data-testid="hero-card"]')];
    const card = want.map((id) => cards.find((c) => c.getAttribute("data-hero") === id)).find(Boolean);
    if (!card) return null;
    card.scrollIntoView({ block: "center" });
    const info = [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === "ⓘ");
    if (!info) return null;
    const b = info.getBoundingClientRect();
    return { hero: card.getAttribute("data-hero"),
      x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  })()`);
  ck(`${tag} 11o) Ban/Pick 池子裡找得到有對位資料的英雄（${withData?.hero ?? "無"}）`, !!withData, withData);
  if (withData) {
    await tapAt(withData.x, withData.y, mobile);
    const st = await goTab("matchups", mobile);
    const secs3 = await sectionsInfo();
    const cards3 = await cardsInfo();
    cap.banpickWithData = { hero: st?.hero, sections: secs3.map((s) => [s.section, s.count]), cards: cards3.length };
    ck(`${tag} 11p) 在 Ban/Pick 路徑上真的畫出三個區塊與 ${cards3.length} 張對位卡（不是空狀態）`,
      st?.hero === withData.hero && secs3.length === 3 && cards3.length > 0
      && cards3.length === secs3.reduce((n, s) => n + s.count, 0), cap.banpickWithData);
    ck(`${tag} 11q) 這條路徑上的卡片一樣有來源標籤與信心程度`,
      cards3.every((c) => ["設計資料", "系統推測", "實戰驗證"].includes(c.srcLabel)
        && ["信心低", "信心中", "信心高"].includes(c.confLabel)),
      cards3.map((c) => [c.hero, c.srcLabel, c.confLabel]));
    if (size.shots.includes("banpick")) await shot(`${tag}-04-banpick-matchups.png`);
    await closeDetail(); await sleep(400);
  }

  results.data[tag] = cap;
}

for (const s of SIZES) {
  try { await runSize(s); } catch (e) { ck(`${s.tag} 執行中斷：${e.message}`, false); }
}

writeFileSync(resolve(OUT_DIR, "hero_matchups_k.json"), JSON.stringify(results, null, 2), "utf8");
console.log(`\n${failed === 0 ? "✅ PASS" : "❌ FAIL"}  ${results.notes.filter((n) => n.ok).length}/${results.notes.length}　截圖 ${results.shots.length} 張 → ${OUT_DIR}`);
try { browser.kill(); } catch { /* ignore */ }
try { server.kill(); } catch { /* ignore */ }
process.exit(failed === 0 ? 0 : 1);
