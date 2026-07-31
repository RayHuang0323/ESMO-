#!/usr/bin/env node
// ============================================================================
//  tools/shot_banpick_hotfix1.mjs — J-close Hotfix1 驗收（Ban/Pick 版面可用性）
//
//  走完整條路：Dashboard → Lineup → Matchmaking → Ban/Pick → Tactic → Loading
//  → GameView → Result → Replay，桌機（1600×1000）與手機（390×844）各一次。
//
//  I-close 證的是「五個畫面看到同一份配置」。J 要多證一件事：
//  **賽前選的技能在引擎裡真的被放出來了**——所以除了逐席比對配置，還會去讀
//  對戰中面板的冷卻、Timeline 的技能事件、以及 Result 的實際使用次數。
//  圖示相同而引擎沒動，正是這個 Milestone 要消滅的狀態，所以不能只比圖示。
//
//  抓法一律用 `data-testid` 的 data-* 屬性（Ban/Pick、Loading、面板、記分板、
//  Replay 都掛了），不靠讀畫面文字猜——文字會因排版換行而抓錯。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/j-close-hotfix1/evidence"));
const SIZES = [
  { w: 1920, h: 1080, tag: "desk1920" },
  { w: 1366, h: 768,  tag: "desk1366" },
  { w: 390,  h: 844,  tag: "mob390" },
  { w: 360,  h: 800,  tag: "mob360" },
];
const DESK = SIZES[0];
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
    await clickByText(c, n); await sleep(1000);
  }
  return (await text(c).catch(() => "")).includes(expect);
}
/** 讀一組 data-testid 節點的 data-* → 陣列（沒有就回 []）。 */
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
const baseUrl = "http://localhost:4187";
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--port", "4187", "--strictPort"], { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
for (let i = 0; i < 120; i++) { try { const r = await fetch(baseUrl, { redirect: "manual" }); if (r.status < 500) break; } catch { /* wait */ } await sleep(500); }
const profileDir = resolve(ROOT, "node_modules/.cache", `esmo-hf1-${process.pid}`);
const port = 9940 + (process.pid % 140);
//  預設 headless：驗收要跑十幾分鐘，彈出來的視窗會一直搶焦點、打斷正在工作的人。
//  要用肉眼看瀏覽器在做什麼時，設 ESMO_SHOT_HEADED=1 就會開實體視窗。
const HEADLESS = process.env.ESMO_SHOT_HEADED !== "1";
const browser = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  ...(HEADLESS ? ["--headless=new", "--disable-gpu-sandbox", "--use-angle=swiftshader"] : []),
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars",
  "--force-device-scale-factor=1", `--window-size=${DESK.w},${DESK.h}`, "--window-position=0,0", "about:blank"], { stdio: "ignore" });
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

/** 一輪完整流程；回傳每一站抓到的配置，供最後逐席比對。 */
async function runFlow(size, tag) {
  const cap = {};
  await tab.send("Emulation.setDeviceMetricsOverride", { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.w < 600 });
  if (size.w < 600) await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1` });
  await sleep(3000);

  //  Hotfix1：出戰配置預設收合 ⇒ 要讀明細就得像使用者一樣先展開。
  //  （「預設收合」本身由版面量測驗證，不是靠這個 helper。）
  const expandPlan = async () => {
    await ev(tab, `(() => {
      const b = document.querySelector('[data-testid="draft-plan-toggle"]');
      if (!b) return false;
      if (b.getAttribute("aria-expanded") !== "true") b.click();
      return true;
    })()`).catch(() => null);
    await sleep(350);
  };

  // ── 1. Lineup（賽前配置）────────────────────────────────────────────────
  ck(`${tag} 1) 進入賽前配置`, await clickUntil(tab, "MOBA", "先發五人", 20));
  const sources = await readRows(tab, '[data-testid="hero-source"]', ["seat", "source"]);
  cap.sources = sources;
  ck(`${tag} 2) 五個席位都標示英雄來源`, sources.length === 5, sources);
  ck(`${tag} 3) 來源值都是五種之一（沒有空徽章）`,
    sources.every((s) => ["unpicked", "locked", "mastery", "recent", "suggested"].includes(s.source)), sources);
  ck(`${tag} 4) 明講「不是固定綁定」且指向 Ban/Pick`,
    (await text(tab)).includes("不是固定綁定") && (await text(tab)).includes("Ban/Pick"));
  await shot(`${tag}-01-lineup.png`);

  // ── 2. Ban/Pick ────────────────────────────────────────────────────────
  await clickUntil(tab, "確認陣容", "進入 Ban/Pick", 20);
  ck(`${tag} 5) 進入 Ban/Pick`, await clickUntil(tab, "進入 Ban/Pick", "選角動態", 25));
  //  ── Hotfix1：版面可用性（這就是阻斷問題本體）────────────────────────
  {
    const L = await ev(tab, `(()=>{ try {
      const all=[...document.querySelectorAll("div")];
      const grid=all.find(d=>(d.style.gridTemplateColumns||"").includes("repeat(5"));
      const label=all.find(e=>{const t=(e.textContent||"").trim();return t.startsWith("選擇你的英雄")||t.startsWith("選擇要禁用");});
      const plan=document.querySelector('[data-testid="draft-plan"]');
      const filters=all.find(d=>d.style.overflowX==="auto");
      const r=(e)=>{if(!e)return null;const b=e.getBoundingClientRect();return{top:Math.round(b.top),bottom:Math.round(b.bottom),h:Math.round(b.height)};};
      const nested=all.filter(e=>e.scrollHeight>e.clientHeight+8&&/auto|scroll/.test(getComputedStyle(e).overflowY)).length;
      const root=document.scrollingElement;
      return{vh:window.innerHeight, plan:r(plan), label:r(label), grid:r(grid), filters:r(filters),
        nestedScrollers:nested,
        pageScrollable:(root.scrollHeight-root.clientHeight)>0||all.some(e=>e.scrollHeight>e.clientHeight+8)};
    } catch(err){return {error:String(err)};} })()`);
    cap.layout = L;
    ck(`${tag} 5f) 出戰配置預設收合（≤46px，實測 ${L?.plan?.h ?? "—"}）`, !!L?.plan && L.plan.h <= 46, L?.plan);
    ck(`${tag} 5f2) 出戰配置摘要在首屏可見（top ${L?.plan?.top ?? "—"} < ${L?.vh}）`,
      !!L?.plan && L.plan.top >= 0 && L.plan.top < L.vh, { plan: L?.plan, vh: L?.vh });
    ck(`${tag} 5g) 「選擇你的英雄」在首屏（top ${L?.label?.top ?? "—"} < ${L?.vh}）`,
      !!L?.label && L.label.top >= 0 && L.label.top < L.vh, { label: L?.label, vh: L?.vh });
    ck(`${tag} 5h) 英雄格從首屏開始（top ${L?.grid?.top ?? "—"}）`, !!L?.grid && L.grid.top < L.vh, { grid: L?.grid, vh: L?.vh });
    ck(`${tag} 5i) 篩選列可見`, !!L?.filters && L.filters.top >= 0 && L.filters.top < L.vh, L?.filters);
    ck(`${tag} 5j) 沒有巢狀捲動陷阱（${L?.nestedScrollers ?? "—"} ≤ 1）`, (L?.nestedScrollers ?? 99) <= 1, L?.nestedScrollers);
    ck(`${tag} 5k) 頁面可縱向捲動`, !!L?.pageScrollable, L?.pageScrollable);
    await shot(`${tag}-00-banpick-layout.png`);
  }

  //  ── J-close：摘要必須**一進來就在**，不是選完才冒出來 ────────────────
  {
    await expandPlan();
    const early = await readRows(tab, '[data-testid="draft-plan-row"]', ["seat", "lane", "hero"]);
    cap.planEarly = early;
    ck(`${tag} 5b) 尚未選角時摘要就已常駐（五路皆在，英雄留白）`,
      early.length === 5 && early.every((r) => !r.hero), early);
    const needs = await readRows(tab, '[data-testid="comp-needs"]', ["have", "need"]);
    cap.needsEarly = needs[0] ?? null;
    ck(`${tag} 5c) 陣容需求一開始就顯示「五路皆缺」`,
      !!needs[0] && (needs[0].have || "") === "" && (needs[0].need || "").split(",").length === 5, needs[0]);
  }
  //  中途快照：選到一半時，摘要與頭像標示要同步反映目前狀態
  let midCaptured = false;
  for (let i = 0; i < 60; i++) {
    if (!midCaptured) {
      const av = await readRows(tab, '[data-testid="pick-avatar"]', ["hero", "code", "lowfit"]);
      if (av.length >= 2) {
        midCaptured = true;
        cap.avatarsMid = av;
        await expandPlan();
        const rows = await readRows(tab, '[data-testid="draft-plan-row"]', ["seat", "lane", "hero"]);
        const needs = await readRows(tab, '[data-testid="comp-needs"]', ["have", "need"]);
        cap.needsMid = needs[0] ?? null;
        //  頭像上的位置碼必須與摘要同一份 assignment ⇒ 逐一對得起來
        const CODE_OF = { 上路: "TOP", 打野: "JUNGLE", 中路: "MID", 下路: "ADC", 輔助: "SUPPORT" };
        const byHero = Object.fromEntries(rows.filter((r) => r.hero).map((r) => [r.hero, CODE_OF[r.lane]]));
        ck(`${tag} 5d) 選角途中：頭像位置碼與摘要逐一相同（同一份 assignment）`,
          av.length > 0 && av.every((a) => a.code && byHero[a.hero] === a.code),
          { avatars: av, byHero });
        ck(`${tag} 5e) 選角途中：陣容需求的已有數＝已選英雄數`,
          !!needs[0] && (needs[0].have ? needs[0].have.split(",").length : 0) === av.length,
          { need: needs[0], picked: av.length });
        await shot(`${tag}-02a-banpick-mid.png`);
      }
    }
    if ((await text(tab)).includes("選角完成")) break;
    await ev(tab, `(() => {
      const g = [...document.querySelectorAll("div")].find((d) => (d.style.gridTemplateColumns || "").includes("repeat(5") && d.offsetParent !== null);
      if (!g || !g.children.length) return false;
      const b = g.children[0].querySelectorAll("button"); if (b.length < 2) return false; b[1].click(); return true;
    })()`);
    await sleep(700);
  }
  await expandPlan();
  const plan = await readRows(tab, '[data-testid="draft-plan-row"]', ["seat", "lane", "hero", "spells"]);
  cap.plan = plan;
  ck(`${tag} 6) Ban/Pick 顯示五路出戰配置`, plan.length === 5, plan);
  ck(`${tag} 7) 五路唯一、五隻英雄不重複`,
    new Set(plan.map((r) => r.lane)).size === 5 && new Set(plan.map((r) => r.hero)).size === 5, plan);
  ck(`${tag} 8) 每一路都恰好 2 個召喚師技能`,
    plan.every((r) => (r.spells || "").split(",").filter(Boolean).length === 2), plan.map((r) => r.spells));
  ck(`${tag} 9) 打野帶懲戒，且只有打野`,
    plan.filter((r) => (r.spells || "").includes("smite")).length === 1
    && plan.find((r) => r.lane === "打野")?.spells.includes("smite"), plan.map((r) => [r.lane, r.spells]));
  {
    //  J-close：選完之後**不會自動跳頁**，摘要要一直在，且五個頭像都有位置碼。
    const av = await readRows(tab, '[data-testid="pick-avatar"]', ["hero", "code", "lane", "lowfit"]);
    cap.avatars = av;
    ck(`${tag} 9b) 五個已選頭像都標了位置`,
      av.length === 5 && av.every((a) => ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"].includes(a.code)), av);
    //  介面一律繁中：畫面上顯示的是中文路名，英文碼只存在 data-* 錨點裡
    const shown = await ev(tab, `[...document.querySelectorAll('[data-testid="pick-avatar"]')].map((e) => (e.innerText || "").trim())`);
    cap.avatarText = shown;
    ck(`${tag} 9b2) 頭像上顯示的是中文路名（不是 TOP/JUNGLE 等英文）`,
      shown.length === 5 && shown.every((t) => /上路|打野|中路|下路|輔助|待分配/.test(t))
      && !shown.some((t) => /TOP|JUNGLE|MID|ADC|SUPPORT/.test(t)), shown);
    const CODE_OF = { 上路: "TOP", 打野: "JUNGLE", 中路: "MID", 下路: "ADC", 輔助: "SUPPORT" };
    const byHero = Object.fromEntries(plan.map((r) => [r.hero, CODE_OF[r.lane]]));
    ck(`${tag} 9c) 頭像位置碼與摘要逐一相同（沒有兩套判定）`,
      av.every((a) => byHero[a.hero] === a.code), { av, byHero });
    const needs = await readRows(tab, '[data-testid="comp-needs"]', ["have", "need"]);
    ck(`${tag} 9d) 五路到齊時陣容需求顯示無缺口`,
      !!needs[0] && (needs[0].need || "") === "", needs[0]);
    //  停留 3 秒再確認：摘要仍在（舊版 1.2 秒就換頁了）
    await sleep(3000);
    await expandPlan();
    const still = await readRows(tab, '[data-testid="draft-plan-row"]', ["seat"]);
    ck(`${tag} 9e) 選角完成 3 秒後仍停在 Ban/Pick（不再只閃現 1.2 秒）`,
      still.length === 5 && (await text(tab)).includes("選角完成"), still.length);
  }
  await shot(`${tag}-02-banpick.png`);

  // ── 3. Loading ─────────────────────────────────────────────────────────
  //  J-close：改為玩家自己按「確認出戰配置」才前進
  ck(`${tag} 9f) 有明確的確認鈕`, await ev(tab, `!!document.querySelector('[data-testid="confirm-draft"]')`));
  await ev(tab, `(() => { const b = document.querySelector('[data-testid="confirm-draft"]'); if (b) { b.click(); return true; } return false; })()`);
  await sleep(1200);
  ck(`${tag} 10) 進入 Loading`, await clickUntil(tab, "開始載入", "VS", 20));
  const loading = await readRows(tab, '[data-testid="loading-spells"]', ["lane", "spells"]);
  cap.loading = loading;
  ck(`${tag} 11) Loading 十人都顯示召喚師技能`,
    loading.length === 10 && loading.every((r) => (r.spells || "").split(",").filter(Boolean).length === 2),
    loading.map((r) => r.spells));
  await shot(`${tag}-03-loading.png`);

  // ── 4. GameView ────────────────────────────────────────────────────────
  for (let i = 0; i < 120; i++) { await sleep(500); if (await ev(tab, "!!document.querySelector('canvas')").catch(() => false)) break; }
  ck(`${tag} 12) 正式 GameView 掛載`, await ev(tab, "!!document.querySelector('canvas')"));
  await clickByText(tab, "4×");
  //  ── Milestone J：邊跑邊收 Timeline 的技能事件 ─────────────────────────
  //    這是「引擎真的放了技能」最直接的證據，也是舊 bug 的照妖鏡：以前事件文字
  //    是「不是閃現就叫懲戒」，所以只要抓到某個席位放出**它沒帶的技能**，
  //    就代表命名又壞了。Timeline 只留最近幾筆 ⇒ 邊跑邊取樣。
  //  ⚠ 取樣窗要夠長：Timeline 只留最近 11 筆，而第一顆懲戒大約在 60–90 模擬秒
  //    才會出現。首次驗收用 12 秒的窗，結果一筆都沒抓到——那是取樣太短，
  //    不是引擎沒放技能（同一場的 Result 使用次數合計是 84）。
  //  ── J-close：隊伍面板的兩個技能要並排、等大、不擠壓血條 ────────────────
  {
    const geo = await ev(tab, `(() => {
      const cell = document.querySelector('[data-testid="cell-spells"]');
      if (!cell) return null;
      const sq = [...cell.querySelectorAll('[data-testid="spell-square"]')].map((e) => {
        const r = e.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), id: e.getAttribute("data-spell") };
      });
      const row = cell.closest('[data-testid="hero-cell"]');
      const bar = row ? row.querySelector('div[title^="HP"], div[title^="陣亡"]') : null;
      const br = bar ? bar.getBoundingClientRect() : null;
      return { sq, hpWidth: br ? Math.round(br.width) : null };
    })()`);
    cap.spellGeo = geo;
    ck(`${tag} 12b) 隊伍面板同時渲染兩個技能格`, !!geo && geo.sq.length === 2, geo);
    ck(`${tag} 12c) 兩格**並排**（y 相同、x 不同），不是上下疊`,
      !!geo && geo.sq.length === 2 && geo.sq[0].y === geo.sq[1].y && geo.sq[0].x !== geo.sq[1].x,
      geo?.sq);
    ck(`${tag} 12d) 兩格等大且看得見（≥14px）`,
      !!geo && geo.sq.every((s) => s.w >= 14 && s.h >= 14)
      && geo.sq[0].w === geo.sq[1].w && geo.sq[0].h === geo.sq[1].h, geo?.sq);
    ck(`${tag} 12e) 血條沒有被擠掉（仍有可讀寬度 ≥30px）`,
      !!geo && geo.hpWidth !== null && geo.hpWidth >= 30, geo?.hpWidth);
    ck(`${tag} 12f) 兩格都是真的技能（不是 reserved 佔位）`,
      !!geo && geo.sq.every((s) => !!s.id), geo?.sq);
  }
  //  J-close：開發用「快速完成」按鈕（?debug=1 ＋ feature flag 兩道閘門）
  ck(`${tag} 12g) 測試模式下看得到「快速完成」開發按鈕`,
    await ev(tab, `!!document.querySelector('[data-testid="dev-fast-forward"]')`));

  //  手機版戰報預設收合（只顯示最新一則）⇒ 先展開，否則永遠抓不到技能事件。
  await ev(tab, `(() => {
    const el = document.querySelector('[data-testid="timeline-toggle"]');
    if (!el) return false;
    if (el.getAttribute("aria-expanded") === "false") el.click();
    return true;
  })()`).catch(() => null);
  await sleep(500);
  //  ⚠ 這裡**不**在現場戰鬥取樣技能事件。J 的時候試過，很脆弱：戰報只留最近
  //    11 筆，而前幾分鐘幾乎沒有技能事件（第一顆懲戒約 60–90 模擬秒），
  //    取樣窗一短就抓到 0 筆，看起來像產品壞了，其實只是還沒發生。
  //    改到 Replay 取樣（見下方 §21）——重播帶著整場的事件，密度穩定得多。
  cap.spellEvents = [];
  //  點藍方第一個英雄格 → 戰鬥資訊面板。
  //  ⚠ 手機版十人面板預設收合、只渲染目前這一路 ⇒ 不能假設索引 0 就是 b1，
  //    要記下**實際點到的席位**，最後拿那個席位的配置來比。
  cap.clickedSeat = await ev(tab, `(() => {
    const c = [...document.querySelectorAll('[data-testid="hero-cell"][data-side="blue"]')];
    if (!c.length) return null; c[0].click(); return c[0].getAttribute("data-seat");
  })()`);
  await sleep(900);
  const sheet = await readRows(tab, '[data-testid="sheet-spells"]', ["spells"]);
  cap.sheet = sheet[0]?.spells ?? null;
  ck(`${tag} 13) 戰鬥中面板顯示 2 個召喚師技能（不再有「未配置」）`,
    (cap.sheet || "").split(",").filter(Boolean).length === 2
    && !(await text(tab)).includes("未配置"), cap.sheet);
  //  ── Milestone J：這兩格必須是**引擎的**技能，不是純配置 ───────────────
  //    引擎技能會顯示「可用」或秒數；只有配置沒有引擎效果時會顯示「配置」。
  //    看到「配置」就代表這一格又退回成純圖示了。
  const sheetText = await ev(tab, `(() => {
    const el = document.querySelector('[data-testid="sheet-spells"]');
    return el ? (el.innerText || "") : "";
  })()`);
  cap.sheetText = sheetText;
  ck(`${tag} 13b) 兩格都有引擎狀態（可用／冷卻秒數），沒有純「配置」佔位`,
    !!sheetText && !sheetText.includes("配置")
    && (sheetText.includes("可用") || /\ds/.test(sheetText)), sheetText);
  await shot(`${tag}-04-battle-sheet.png`);
  await ev(tab, `(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || "") === "關閉"); if (b) { b.click(); return true; } return false; })()`);
  await sleep(500);

  // ── 5. Result ──────────────────────────────────────────────────────────
  //  用錨點點「快速完成」，順便證明它真的把比賽帶進正式 Result（不是跳頁）
  await ev(tab, `(() => { const b = document.querySelector('[data-testid="dev-fast-forward"]'); if (b) { b.click(); return true; } return false; })()`);
  for (let i = 0; i < 300; i++) { await sleep(1000); if ((await text(tab)).includes("觀看重播") || (await text(tab)).includes("查看賽後")) break; }
  const board = await readRows(tab, '[data-testid="board-spells"]', ["spells", "uses"]);
  cap.board = board;
  ck(`${tag} 14) 賽後記分板顯示召喚師技能`,
    board.length === 10 && board.every((r) => (r.spells || "").split(",").filter(Boolean).length === 2),
    board.map((r) => r.spells));
  //  Milestone J：Result 要答得出「這場實際放了幾次」，而不只是「帶了什麼」。
  const totalUses = board.reduce((s, r) => s
    + (r.uses || "").split(",").reduce((a, v) => a + (Number(v) || 0), 0), 0);
  cap.totalUses = totalUses;
  ck(`${tag} 14b) 記分板帶有實際使用次數，且整場至少放過一次（合計 ${totalUses}）`,
    board.every((r) => (r.uses || "").split(",").length === 2) && totalUses > 0,
    board.map((r) => [r.spells, r.uses]));
  await shot(`${tag}-05-result.png`);

  // ── 6. Replay ──────────────────────────────────────────────────────────
  const replayable = await clickUntil(tab, "觀看重播", "REPLAY", 20);
  ck(`${tag} 15) 可以進入重播`, replayable);
  if (replayable) {
    await sleep(1500);
    if (!(await ev(tab, `!!document.querySelector('[data-testid="replay-lineup"]')`))) {
      await clickByText(tab, "陣容"); await sleep(800);
    }
    const rep = await readRows(tab, '[data-testid="replay-lineup-row"]', ["seat", "hero", "spells"]);
    cap.replay = rep;
    //  ── 在重播裡收技能事件（整場都在，密度穩定）────────────────────────
    //    這是「戰報命名正確」的照妖鏡：舊碼把所有技能都寫成「懲戒」，
    //    只要抓到某席位放出它沒帶的技能就會紅。
    //  用**拖時間軸**掃過整場，而不是播放後碰運氣：播放取樣的結果會隨
    //  「取樣窗剛好落在哪一段」而變（實測桌機 0 筆、手機 2 筆，同一份程式碼）。
    //  逐格 seek 是決定性的，整場都掃得到。
    await ev(tab, `(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "⏸ 暫停"); if (b) b.click(); return true; })()`).catch(() => null);
    const seen = new Set();
    for (let i = 0; i <= 40; i++) {
      await ev(tab, `(() => {
        const el = document.querySelector('input[type="range"]');
        if (!el) return false;
        const max = Number(el.max) || 0;
        const v = String(max * ${i} / 40);
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`).catch(() => null);
      await sleep(220);
      const t = await text(tab).catch(() => "");
      for (const m of t.matchAll(/([BR]\d)\s*使用(\S+?)（/g)) seen.add(`${m[1]}|${m[2]}`);
    }
    cap.spellEvents = [...seen];
    ck(`${tag} 16) 重播帶著本場出戰配置（十席）`,
      rep.length === 10 && rep.every((r) => (r.spells || "").split(",").filter(Boolean).length === 2),
      rep.map((r) => [r.seat, r.spells]));
    await shot(`${tag}-06-replay.png`);
  }

  // ── 7. 跨畫面逐席比對（本腳本真正的目的）─────────────────────────────
  const planBySeat = Object.fromEntries((cap.plan ?? []).map((r) => [r.seat, r.spells]));
  const repBySeat = Object.fromEntries((cap.replay ?? []).map((r) => [r.seat, r.spells]));
  const blueSeats = Object.keys(planBySeat);
  ck(`${tag} 17) Ban/Pick 與 Replay 的技能逐席相同`,
    cap.replay ? blueSeats.every((s) => planBySeat[s] === repBySeat[s]) : false,
    blueSeats.map((s) => [s, planBySeat[s], repBySeat[s]]));
  ck(`${tag} 18) Ban/Pick 與 Replay 的英雄逐席相同`,
    cap.replay
      ? blueSeats.every((s) => (cap.plan.find((r) => r.seat === s)?.hero) === (cap.replay.find((r) => r.seat === s)?.hero))
      : false);
  {
    //  Loading 的藍方五列（DOM 順序＝b1–b5）要對得上 Ban/Pick
    const blueLoading = (cap.loading ?? []).slice(0, 5).map((r) => r.spells);
    const planSpells = (cap.plan ?? []).map((r) => r.spells);
    ck(`${tag} 19) Loading 與 Ban/Pick 的技能逐席相同`,
      blueLoading.length === 5 && blueLoading.every((s, i) => s === planSpells[i]),
      [blueLoading, planSpells]);
  }
  ck(`${tag} 20) 戰鬥中面板的技能＝Ban/Pick 給「實際點到的那個席位」的那一組`,
    !!cap.clickedSeat && cap.sheet === planBySeat[cap.clickedSeat],
    [cap.clickedSeat, cap.sheet, planBySeat[cap.clickedSeat]]);
  {
    //  Milestone J：Timeline 播報的技能必須是**那個席位真的帶著的技能**。
    //  ZH 名 → id，才能和 data-spells 的 id 對照。
    const ZH = {
      閃現: "flash", 懲戒: "smite", 傳送: "teleport", 治療: "heal",
      護盾: "barrier", 點燃: "ignite", 幽魂: "ghost", 淨化: "cleanse",
    };
    const evs = (cap.spellEvents ?? []).map((s) => s.split("|"));
    const bad = evs.filter(([seat, zh]) => {
      const id = ZH[zh];
      if (!id) return true;                       // 出現表外名稱 ⇒ 命名壞了
      const owned = planBySeat[seat.toLowerCase()];
      if (owned == null) return false;            // 紅方沒有 plan ⇒ 不判定
      return !owned.split(",").includes(id);
    });
    ck(`${tag} 21) Timeline 有技能事件，且每一筆都是該席位帶著的技能（共 ${evs.length} 種）`,
      evs.length > 0 && bad.length === 0, { evs: cap.spellEvents, bad });
  }
  results.data[tag] = cap;
  return cap;
}

try {
  for (const sz of SIZES) await runFlow(sz, sz.tag);
  //  ── 跨尺寸：四個尺寸都要走得完、看得到、捲得動 ────────────────────────
  const all = SIZES.map((z) => results.data[z.tag]);
  ck("跨尺寸 A) 四個尺寸都走完整條流程並取得配置",
    all.every((c) => c?.plan?.length === 5 && c?.replay?.length === 10),
    SIZES.map((z, i) => [z.tag, all[i]?.plan?.length ?? 0, all[i]?.replay?.length ?? 0]));
  ck("跨尺寸 B) 四個尺寸的配置規則一致（5 路 × 2 技能 × 打野懲戒）",
    all.every((c) => c?.plan?.length === 5
      && c.plan.every((r) => (r.spells || "").split(",").filter(Boolean).length === 2)
      && c.plan.find((r) => r.lane === "打野")?.spells.includes("smite")));
  ck("跨尺寸 C) 四個尺寸的出戰配置都預設收合（≤46px）且在首屏",
    all.every((c) => (c?.layout?.plan?.h ?? 999) <= 46 && c?.layout?.plan?.top < c?.layout?.vh),
    SIZES.map((z, i) => [z.tag, all[i]?.layout?.plan?.h, all[i]?.layout?.plan?.top]));
  ck("跨尺寸 D) 四個尺寸的英雄格都從首屏開始",
    all.every((c) => c?.layout?.grid && c.layout.grid.top < c.layout.vh),
    SIZES.map((z, i) => [z.tag, all[i]?.layout?.grid?.top, all[i]?.layout?.vh]));
  ck("跨尺寸 E) 四個尺寸都沒有巢狀捲動陷阱",
    all.every((c) => (c?.layout?.nestedScrollers ?? 99) <= 1),
    SIZES.map((z, i) => [z.tag, all[i]?.layout?.nestedScrollers]));
} catch (e) {
  ck(`流程中斷：${e.message}`, false);
} finally {
  writeFileSync(resolve(OUT_DIR, "j_close_hotfix1_browser.json"), JSON.stringify(results, null, 2), "utf8");
  console.log(`\n${failed === 0 ? "✅ PASS" : `❌ FAIL（${failed} 項）`}　證據：${OUT_DIR}`);
  try { await tab.send("Browser.close", {}, 5000); } catch { /* ignore */ }
  browser.kill(); server.kill();
  process.exit(failed === 0 ? 0 : 1);
}
