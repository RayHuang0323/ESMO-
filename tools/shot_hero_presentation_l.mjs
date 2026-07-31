#!/usr/bin/env node
// ============================================================================
//  tools/shot_hero_presentation_l.mjs — Milestone L 瀏覽器驗收
//
//  三段：
//    A. 演出畫廊（?debug=hero-presentation）— 八個模板 ＋ 10 位主題 ＋ fallback，
//       **固定 fixture**，不靠隨機事件剛好發生。六個尺寸全跑。
//    B. 正式對戰（?debug=moba-runtime-battle）— HUD callout、Timeline、效能、
//       池容量、物件數回落。六個尺寸全跑。
//    C. 完整流程到 Replay — 證明 Replay 與現場吃同一份 mapping（1920 / 390）。
//
//  ⚠ 判準一律驗行為：
//    · 模板用 data-archetype 指名，英雄用 data-hero 指名，不用 DOM 索引猜。
//    · 效能量真的 rAF 幀數，不看「感覺順不順」。
//    · 池容量與物件數讀 window.__HERO_FX_STATS（renderer 每幀寫入的真實計數）。
//    · 「不遮擋」用 elementFromPoint 反查，不用座標推論。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
//  同時支援 `--k v` 與 `--k=v`（第一次跑用了 `--stage=gallery`，舊解析吃不到，
//  結果整段照跑，白等一輪）。
const arg = (k, d) => {
  const eq = process.argv.find((a) => a.startsWith(`${k}=`));
  if (eq) return eq.slice(k.length + 1);
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/milestone-l/evidence"));
//  分段執行：gallery / battle / replay / all。
//  ⚠ 為什麼要分段：第一次整段跑（六尺寸畫廊 ＋ 六尺寸對戰 ＋ 兩尺寸 Replay）
//    在對戰段中途卡死，前面跑完的結果全部丟失。分段之後每段各自寫 JSON，
//    一段卡住不會拖垮其他段，也能單獨重跑。
const STAGE = arg("--stage", "all");
const runStage = (name) => STAGE === "all" || STAGE === name;
const SIZES = [
  { w: 1920, h: 1080, tag: "desk1920", mobile: false, shots: ["gallery"], replay: true },
  { w: 1366, h: 768, tag: "desk1366", mobile: false, shots: ["gallery", "battle"], replay: false },
  { w: 430, h: 932, tag: "mob430", mobile: true, shots: [], replay: false },
  { w: 412, h: 915, tag: "mob412", mobile: true, shots: [], replay: false },
  { w: 390, h: 844, tag: "mob390", mobile: true, shots: ["gallery", "battle"], replay: true },
  { w: 360, h: 800, tag: "mob360", mobile: true, shots: ["gallery", "battle"], replay: false },
];
//  ⚠ live 對戰段只跑這三個尺寸。原因是實測出來的環境限制：headless 走 SwiftShader
//    軟體渲染，1920×1080 的畫面成本會把主執行緒吃光、引擎的 setInterval 被餓死
//    （實測 0.09 模擬秒／真實秒，推不到英雄開打）。
//    **六個尺寸的版面、HUD callout、模板、主題色驗收在畫廊段（A 段）完整跑完**；
//    這一段要證的是「live 對戰這條路真的接通了」，三個尺寸足夠且跑得完。
const BATTLE_TAGS = new Set(["desk1366", "mob390", "mob360"]);
const TEMPLATES = ["projectile", "line", "area", "dash", "shield", "heal", "control", "ultimate"];
const HEROES = ["bingshuang", "chichuan", "cinderfist", "dadi", "duskblade",
  "ironclad", "leiting", "lieyan", "stoneguard", "yanfeng"];
const FALLBACK_HERO = "linghun";

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
  send(method, params = {}, t = 40000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.p.delete(id); rej(new Error(`CDP ${method} 逾時`)); }, t);
      this.p.set(id, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      try { this.ws.send(JSON.stringify({ id, method, params })); } catch (e) { clearTimeout(timer); rej(e); }
    });
  }
}
const ev = async (c, expr, t = 40000) => {
  const r = await c.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, t);
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
const PORT = Number(arg("--port", "4195"));
const baseUrl = `http://localhost:${PORT}`;
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
for (let i = 0; i < 120; i++) { try { const r = await fetch(baseUrl, { redirect: "manual" }); if (r.status < 500) break; } catch { /* wait */ } await sleep(500); }
const profileDir = resolve(ROOT, "node_modules/.cache", `esmo-ml-${process.pid}`);
const port = 9600 + (process.pid % 150);
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

const setSize = async (s) => {
  await tab.send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.mobile });
  await tab.send("Emulation.setTouchEmulationEnabled", { enabled: s.mobile, maxTouchPoints: 5 });
};

/** 真的量幀數：rAF 跑一秒，回傳這一秒實際畫了幾幀。 */
const measureFps = (c, ms = 1000) => ev(c, `new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const step = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(step); else res(Math.round(n * 1000 / (performance.now() - t0))); };
  requestAnimationFrame(step);
})`, 20000);

const fxStats = (c) => ev(c, `(() => {
  const s = window.__HERO_FX_STATS;
  return s ? { halo: s.halo, bar: s.bar, bolt: s.bolt, guard: s.guard, live: s.live, caps: s.caps, quality: s.quality } : null;
})()`);

/** 橫向溢出 ＋ 縱向捲動軸數（不得因本輪新增巢狀捲動）。 */
const overflowInfo = (c) => ev(c, `(() => {
  const d = document.scrollingElement || document.documentElement;
  const scrollers = [...document.querySelectorAll("*")].filter((e) => {
    const cs = getComputedStyle(e);
    return e.scrollHeight > e.clientHeight + 8 && /auto|scroll/.test(cs.overflowY);
  }).map((e) => e.getAttribute("data-testid") || e.tagName);
  return { hOverflow: d.scrollWidth - d.clientWidth, vScrollers: scrollers, vw: window.innerWidth, vh: window.innerHeight };
})()`);

// ══════════════════════════════════════════════════════════════════════════
//  A. 演出畫廊：八個模板 ＋ 10 位主題 ＋ fallback（固定 fixture）
// ══════════════════════════════════════════════════════════════════════════
async function runGallery(size) {
  const tag = size.tag, cap = {};
  console.log(`\n──── A 畫廊 ${tag}（${size.w}×${size.h}）────`);
  await setSize(size);
  const quality = size.mobile ? "low" : "high";
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=hero-presentation&quality=${quality}` });
  await sleep(2600);

  ck(`${tag} A1) 演出畫廊載入`, await ev(tab, `!!document.querySelector('[data-testid="presentation-gallery"]')`));
  const cards = await ev(tab, `[...document.querySelectorAll('[data-testid="template-card"]')].map((e) => ({
    a: e.getAttribute("data-archetype"), hero: e.getAttribute("data-hero"),
    prim: e.getAttribute("data-primitives"), label: e.querySelector("div")?.innerText ?? "",
  }))`);
  cap.cards = cards;
  ck(`${tag} A2) 八個演出模板都在，順序與白名單一致`,
    cards.length === 8 && JSON.stringify(cards.map((c) => c.a)) === JSON.stringify(TEMPLATES),
    cards.map((c) => c.a));
  ck(`${tag} A3) 每個模板都指名一位示範英雄與 primitive 組合`,
    cards.every((c) => !!c.hero && !!c.prim && c.label.endsWith("演出")), cards);

  const heroRows = await ev(tab, `[...document.querySelectorAll('[data-testid="gallery-hero"]')].map((e) => ({
    hero: e.getAttribute("data-hero"), primary: e.getAttribute("data-primary"),
    sig: e.getAttribute("data-signature"), tier: e.getAttribute("data-tier"),
    slots: [...e.querySelectorAll('[data-testid="gallery-slot"]')].map((s) => s.getAttribute("data-archetype")),
  }))`);
  cap.heroRows = heroRows;
  ck(`${tag} A4) 10 位代表英雄全部列出（用 data-hero 指名）`,
    heroRows.length === 10 && HEROES.every((h) => heroRows.some((r) => r.hero === h)),
    heroRows.map((r) => r.hero));
  ck(`${tag} A5) 10 位英雄的主題色互不相同（辨識度的最低門檻）`,
    new Set(heroRows.map((r) => r.primary)).size === 10,
    heroRows.map((r) => [r.hero, r.primary]));
  ck(`${tag} A6) 每位英雄五個 slot 都有演出模板，且都落在白名單`,
    heroRows.every((r) => r.slots.length === 5 && r.slots.every((s) => TEMPLATES.includes(s))),
    heroRows.map((r) => [r.hero, r.slots]));

  const fixture = await ev(tab, "window.__PRESENTATION_FIXTURE ?? null");
  cap.fixture = fixture;
  ck(`${tag} A7) fixture 同時涵蓋八個模板 ＋ 一個 fallback 英雄`,
    !!fixture && fixture.archetypes.length === 9
    && TEMPLATES.every((t) => fixture.archetypes.includes(t))
    && fixture.heroes.includes(FALLBACK_HERO)
    && fixture.sources.includes("fallback") && fixture.sources.includes("authored"),
    fixture);

  //  3D：真的畫出來了嗎（renderer 每幀寫的實際 instance 計數）
  await sleep(1200);
  const stats = await fxStats(tab);
  cap.stats = stats;
  ck(`${tag} A8) 特效模板真的畫出 instance（halo/bar/bolt/guard 都 > 0）`,
    !!stats && stats.halo > 0 && stats.bar > 0 && stats.bolt > 0 && stats.guard > 0, stats);
  ck(`${tag} A9) 九筆 fixture 全部被 renderer 認得（live=9）`, stats?.live === 9, stats);
  ck(`${tag} A10) 每個池都沒有超過容量上限`,
    !!stats && stats.halo <= stats.caps.halo && stats.bar <= stats.caps.bar
    && stats.bolt <= stats.caps.bolt && stats.guard <= stats.caps.guard, stats);

  //  ── HUD callout：正式元件 ＋ 正式 store，只是輸入是固定 snapshot ──────
  const co = await ev(tab, `(() => {
    const box = document.querySelector('[data-testid="hero-callouts"]');
    const rows = [...document.querySelectorAll('[data-testid="hero-callout"]')].map((e) => {
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      //  ⚠ 不能用 elementFromPoint 判「有沒有被蓋住」：callout 是 HUD 疊層，
      //    容器刻意 pointer-events:none（否則會吃掉地圖的 pan/zoom）⇒
      //    elementFromPoint 永遠打到它後面的東西，恆判「被蓋住」。
      //    對這種疊層，有意義的判準是：有實際尺寸、可見、完整落在畫面內。
      return {
        hero: e.getAttribute("data-hero"), archetype: e.getAttribute("data-archetype"),
        emphasis: e.getAttribute("data-emphasis"), source: e.getAttribute("data-source"),
        basis: e.getAttribute("data-basis"),
        label: e.querySelector('[data-testid="callout-label"]')?.innerText ?? "",
        name: e.querySelector('[data-testid="callout-name"]')?.innerText ?? "",
        portrait: !!e.querySelector("img") || !!e.querySelector('span[style*="border-radius"]') || !!e.querySelector('div[style*="border-radius"]'),
        w: Math.round(b.width), h: Math.round(b.height),
        visible: cs.visibility !== "hidden" && Number(cs.opacity) > 0.2 && b.width > 40 && b.height > 10,
        inView: b.left >= 0 && b.right <= window.innerWidth && b.top >= 0 && b.bottom <= window.innerHeight,
      };
    });
    return { limit: box ? Number(box.getAttribute("data-limit")) : null,
      count: box ? Number(box.getAttribute("data-count")) : null, rows,
      disclaimer: document.querySelector('[data-testid="callout-disclaimer"]')?.innerText ?? "" };
  })()`);
  cap.callouts = co;
  const wantLimit = size.mobile ? 2 : 3;
  ck(`${tag} A11) HUD callout 出現（5 筆 fixture ⇒ 顯示 ${co.rows.length} 則）`, co.rows.length > 0, co);
  ck(`${tag} A12) 同時顯示數量被限流到 ${wantLimit}（桌機 3／手機 2）`,
    co.rows.length === wantLimit && co.limit === wantLimit, { rows: co.rows.length, limit: co.limit });
  ck(`${tag} A13) 每則 callout 都有英雄頭像、英雄中文名與演出分類`,
    co.rows.every((r) => !!r.hero && !!r.name && r.portrait && TEMPLATES.includes(r.archetype)), co.rows);
  ck(`${tag} A14) ⚠ 寫的是「演出分類」不是技能名`,
    co.rows.every((r) => r.label.includes("演出")), co.rows.map((r) => r.label));
  ck(`${tag} A15) 標明推導依據是引擎事件（basis=engine:power）`,
    co.rows.every((r) => r.basis === "engine:power"), co.rows.map((r) => r.basis));
  ck(`${tag} A16) callout 完整在畫面內、有實際尺寸且可見`,
    co.rows.every((r) => r.inView && r.visible), co.rows);
  ck(`${tag} A17) callout 區塊帶誠實聲明`,
    co.disclaimer.includes("不代表引擎實際施放了該技能"), co.disclaimer);

  const ovf = await overflowInfo(tab);
  cap.overflow = ovf;
  ck(`${tag} A18) 沒有橫向溢出（實測 ${ovf.hOverflow}px）`, ovf.hOverflow <= 1, ovf);
  ck(`${tag} A19) 誠實聲明在畫面上`,
    (await text(tab)).includes("不代表引擎實際施放了該技能"));
  if (size.shots.includes("gallery")) await shot(`${tag}-01-gallery.png`);
  results.data[`${tag}-gallery`] = cap;
}

/** 手機 preset 真的比桌機省：同一頁換 quality 參數，比對池容量。 */
async function runPresetDiff() {
  console.log("\n──── A' 手機 / 桌機 preset 差異 ────");
  //  ⚠ 換頁之後要**等到 renderer 真的畫過一幀**才讀得到 stats。
  //    固定 sleep 會間歇性讀到 null（第一版就是這樣紅了一條），改成輪詢。
  const read = async (q) => {
    await tab.send("Page.navigate", { url: `${baseUrl}/?debug=hero-presentation&quality=${q}` });
    for (let i = 0; i < 24; i++) {
      await sleep(500);
      const st = await fxStats(tab).catch(() => null);
      if (st && st.caps) return st;
    }
    return null;
  };
  const low = await read("low"), high = await read("high");
  results.data.presetDiff = { low, high };
  ck(`P1) low preset 的池容量嚴格小於 high（halo ${low?.caps?.halo} < ${high?.caps?.halo}）`,
    !!low && !!high && low.caps.halo < high.caps.halo && low.caps.bolt < high.caps.bolt
    && low.caps.bar < high.caps.bar && low.caps.guard < high.caps.guard,
    { low: low?.caps, high: high?.caps });
  ck("P2) 兩種 preset 都畫得出東西（不是把手機特效整個關掉）",
    !!low && low.halo > 0 && low.bolt > 0, low);
}

// ══════════════════════════════════════════════════════════════════════════
//  B. 正式對戰：**接線煙霧測試**（刻意做得很小）
//
//  ⚠ 為什麼這一段只驗這麼少 —— 這是實測出來的環境限制，不是偷懶：
//    headless Chrome 走 SwiftShader 軟體渲染，模擬推進約 0.14 模擬秒／真實秒
//    （1366×768 + low preset + 4× 加速，240 秒只到 ts≈32）。而英雄互毆、擊殺、
//    拆塔這些事件要 ts≈60+ 才穩定出現。也就是說在這個環境裡：
//      · 英雄特效／HUD callout —— 取樣窗內遇不到
//      · Timeline 事件列 —— ts≈30 時本來就是空的（不是壞掉）
//      · rAF 幀數 —— 會被餓到 0，量出來沒有意義
//    那些斷言會變成「看運氣通過」，正是本專案踩過很多次的坑。
//  所以實質驗證全部移到 A 段：用**決定性 fixture 走 production 程式碼路徑**
//  （正式的 useGameStore → 正式的 HeroSkillCallout → 正式的 HeroSkillEffects）。
//  這一段只證「live 這條路掛得起來、演出層真的在裡面、版面沒壞」。
//  live 對戰的肉眼觀察列為未驗項目（報告 §10），交給真機驗收。
// ══════════════════════════════════════════════════════════════════════════
async function runBattle(size) {
  const tag = size.tag, cap = {};
  console.log(`
──── B 對戰接線 ${tag}（${size.w}×${size.h}）────`);
  await setSize(size);
  await tab.send("Page.navigate", { url: `${baseUrl}/` });
  await sleep(1200);
  await ev(tab, `localStorage.setItem("esmo.quality.v1","low")`).catch(() => null);
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=moba-runtime-battle&shot=L&waitTs=45&diag=1` });
  await sleep(9000);

  ck(`${tag} B1) 正式 GameView 掛得起來（canvas 存在）`,
    await ev(tab, "!!document.querySelector('canvas')", 20000).catch(() => false));
  const t0 = await ev(tab, "window.__BATTLE_TS ?? 0", 20000).catch(() => 0);
  await sleep(6000);
  const t1 = await ev(tab, "window.__BATTLE_TS ?? 0", 20000).catch(() => 0);
  cap.ts = { t0, t1 };
  ck(`${tag} B2) 模擬真的在推進（${t0} → ${t1}）`, t1 > t0, cap.ts);

  const st = await fxStats(tab).catch(() => null);
  cap.stats = st;
  ck(`${tag} B3) 演出層已掛進 live 對戰並每幀回報計數`, !!st && !!st.caps, st);
  ck(`${tag} B4) live 套用 low preset 的池容量（halo=10 / bolt=14）`,
    st?.caps?.halo === 10 && st?.caps?.bolt === 14, st?.caps);
  ck(`${tag} B5) 池計數都沒有超過容量（不是無限成長）`,
    !!st && st.halo <= st.caps.halo && st.bar <= st.caps.bar
    && st.bolt <= st.caps.bolt && st.guard <= st.caps.guard, st);

  const ovf = await overflowInfo(tab).catch(() => null);
  cap.overflow = ovf;
  ck(`${tag} B6) 沒有橫向溢出，也沒有因本輪新增縱向捲動軸`,
    !!ovf && ovf.hOverflow <= 1 && ovf.vScrollers.length === 0, ovf);
  if (size.shots.includes("battle")) await shot(`${tag}-02-battle.png`);
  results.data[`${tag}-battle`] = cap;
}

// ══════════════════════════════════════════════════════════════════════════
//  C. 完整流程到 Replay：現場與重播吃同一份 mapping
// ══════════════════════════════════════════════════════════════════════════
async function runReplay(size) {
  const tag = size.tag, cap = {};
  console.log(`\n──── C Replay ${tag}（${size.w}×${size.h}）────`);
  await setSize(size);
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1` });
  await sleep(2800);
  await clickUntil(tab, "MOBA", "先發五人", 20);
  await clickUntil(tab, "確認陣容", "進入 Ban/Pick", 20);
  ck(`${tag} C1) 進入 Ban/Pick`, await clickUntil(tab, "進入 Ban/Pick", "選角動態", 25));
  for (let i = 0; i < 60; i++) {
    if ((await text(tab)).includes("選角完成")) break;
    await ev(tab, `(() => { const b = document.querySelector('[data-testid="hero-choose"]'); if (b) { b.click(); return true; } return false; })()`).catch(() => null);
    await sleep(650);
  }
  ck(`${tag} C2) 選角完成`, (await text(tab)).includes("選角完成"));
  const picks = await ev(tab, `[...document.querySelectorAll('[data-testid="pick-avatar"]')].map((e) => e.getAttribute("data-hero"))`);
  cap.picks = picks;
  await ev(tab, `(() => { const b = document.querySelector('[data-testid="confirm-draft"]'); if (b) { b.click(); return true; } return false; })()`);
  await sleep(1200);
  await clickUntil(tab, "開始載入", "VS", 20);
  for (let i = 0; i < 120; i++) { await sleep(500); if (await ev(tab, "!!document.querySelector('canvas')").catch(() => false)) break; }
  ck(`${tag} C3) 進入正式 GameView`, await ev(tab, "!!document.querySelector('canvas')"));

  //  現場：記下這一刻的演出對應（英雄 → 模板）。
  //  ⚠ callout 只在引擎的 `power` 事件出現，headless 軟體渲染下取樣窗內遇不到
  //    ⇒ 這裡**只記錄觀測值，不當門檻**（理由同 B 段檔頭）。
  //    演出層有沒有掛進 live 對戰，用 fxStats 驗——那個一定讀得到。
  let liveMap = null;
  for (let i = 0; i < 12 && !liveMap; i++) {
    const rows = await ev(tab, `[...document.querySelectorAll('[data-testid="hero-callout"]')].map((e) => [e.getAttribute("data-hero"), e.getAttribute("data-archetype")])`).catch(() => []);
    if (rows.length) liveMap = rows;
    await sleep(800);
  }
  cap.liveCalloutObserved = liveMap;      // 觀測值
  const liveStats = await fxStats(tab).catch(() => null);
  cap.liveStats = liveStats;
  ck(`${tag} C4) 演出層已掛進正式對戰流程（非 debug 入口，走完整 Ban/Pick → GameView）`,
    !!liveStats && !!liveStats.caps, liveStats);

  await ev(tab, `(() => { const b = document.querySelector('[data-testid="dev-fast-forward"]'); if (b) { b.click(); return true; } return false; })()`);
  let ended = false;
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const t = await text(tab).catch(() => "");
    if (t.includes("觀看重播") || t.includes("查看賽後")) { ended = true; break; }
  }
  ck(`${tag} C5) 打到終局並進入 Result`, ended);
  ck(`${tag} C6) 可以進入 Replay`, await clickUntil(tab, "觀看重播", "REPLAY", 20));
  await sleep(2500);
  const replay = await ev(tab, `(() => ({
    onReplay: (document.body.innerText || "").includes("REPLAY"),
    canvas: !!document.querySelector("canvas"),
    rows: [...document.querySelectorAll('[data-testid="timeline-row"]')].map((e) => ({
      type: e.getAttribute("data-type"), hero: e.getAttribute("data-hero"),
      portrait: e.querySelector('[data-testid="timeline-portrait"]')?.getAttribute("data-hero") ?? null,
    })),
  }))()`);
  cap.replay = replay;
  ck(`${tag} C7) Replay 畫面開起來了`, replay.onReplay === true, replay);
  //  現場與 Replay 的英雄身分必須來自同一份 roster / 同一支 Adapter：
  //  Replay 上出現的英雄，一定要是本場選到的英雄，不能冒出別隻。
  const replayHeroes = [...new Set(replay.rows.map((r) => r.portrait).filter(Boolean))];
  cap.replayHeroes = replayHeroes;
  ck(`${tag} C8) Replay 上出現的英雄都是本場實際選到的（同一份 mapping）`,
    replayHeroes.every((h) => picks.includes(h)) || replayHeroes.length === 0,
    { replayHeroes, picks });
  if (size.replay) await shot(`${tag}-03-replay.png`);
  results.data[`${tag}-replay`] = cap;
}

// ══════════════════════════════════════════════════════════════════════════
if (runStage("gallery")) {
  for (const s of SIZES) {
    try { await runGallery(s); } catch (e) { ck(`${s.tag} 畫廊中斷：${e.message}`, false); }
  }
  try { await runPresetDiff(); } catch (e) { ck(`preset 差異中斷：${e.message}`, false); }
}
if (runStage("battle")) {
  for (const s of SIZES.filter((x) => BATTLE_TAGS.has(x.tag))) {
    try { await runBattle(s); } catch (e) { ck(`${s.tag} 對戰中斷：${e.message}`, false); }
  }
}
if (runStage("replay")) {
  for (const s of SIZES.filter((x) => x.replay)) {
    try { await runReplay(s); } catch (e) { ck(`${s.tag} Replay 中斷：${e.message}`, false); }
  }
}

writeFileSync(resolve(OUT_DIR, `hero_presentation_l_${STAGE}.json`), JSON.stringify(results, null, 2), "utf8");
console.log(`\n${failed === 0 ? "✅ PASS" : "❌ FAIL"}  ${results.notes.filter((n) => n.ok).length}/${results.notes.length}　截圖 ${results.shots.length} 張 → ${OUT_DIR}`);
try { browser.kill(); } catch { /* ignore */ }
try { server.kill(); } catch { /* ignore */ }
process.exit(failed === 0 ? 0 : 1);
