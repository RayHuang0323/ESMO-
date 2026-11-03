#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_flags_off_release_3aB.mjs — Phase 3a-B 測試性整合：打包後的 bundle，旗標關閉的玩家流程（Owner 2026-11-04 第 D 項）
//
//  執行：先 npm run build，再 node tools/browser_check_flags_off_release_3aB.mjs（一次只跑這一支；約 5–10 分鐘）
//  打的是本地 vite preview（打包結果），不是 dev server：沒有 /src、不攔截旗標，看到的就是部署後玩家會拿到的東西。
//    N  新局：首頁 → 賽前 → 選角 → 戰術頁是 v20 畫面 → 對戰 → 賽後；全程看不到戰術書；存檔沒有 v21 標記
//    V  帶 v21 計畫的舊存檔（模擬旗標開過又關）：戰術頁仍是 v20 畫面；打完一場 tacticBook 逐位元相同，其他資料沒有被清掉
//    E  page error 0
//  ⚠ chrome.evaluate 的字串裡不能有反引號。導航一律用 testid 或從程式碼讀到的字串。
// ============================================================================
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { runGate, finishGate, killProcessTree } from "./browser/harness.mjs";
import { createTacticPlan } from "../src/platform/tactics/tacticPlan.js";
import { addTacticPlan, normalizeTacticBook } from "../src/platform/tactics/tacticBook.js";

if (!existsSync("dist/index.html")) { console.error("找不到 dist/index.html，要先 npm run build"); process.exit(2); }

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });
const port = await freePort();
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "ignore" });
const url = `http://127.0.0.1:${port}/ESMO-/`;
const t0 = Date.now();
let up = false;
while (Date.now() - t0 < 60000 && !up) { try { up = (await fetch(url)).ok; } catch { /* not yet */ } if (!up) await new Promise((r) => setTimeout(r, 500)); }
if (!up) { killProcessTree?.(preview.pid); console.error("vite preview 沒有起來"); process.exit(2); }

const J = (raw) => { const s = String(raw); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
const clickSel = (sel) => "const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll(" + JSON.stringify(sel) + ")].find(vis); if (el) el.click(); return JSON.stringify(!!el);";
const clickText = (needle) => "const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll('button')].filter(vis).find((b) => (b.innerText || '').includes(" + JSON.stringify(needle) + ")); if (el) el.click(); return JSON.stringify(!!el);";
const tid = (id) => '[data-testid="' + id + '"]';
const PROFILE = "esmo.profile.v1";
const LEAK = "moba-sim\\.v21|career\\.v21|challenge\\.v21|balanceTool\\.v21|v21\\.b[0-9]|core\\.v1";
//  舊存檔裡的 v21 計畫：用真的純函式建，形狀與玩家存下來的相同
let V21_BOOK = normalizeTacticBook(null);
for (const [templateId, choices] of [["classic.m7", { phases: { early: { focusLane: "bot" } } }], ["std", { winCondition: "earlySnowball" }], ["v2.jungle_invasion", {}]]) {
  const p = createTacticPlan({ templateId, choices });
  if (!p.ok) throw new Error(`plan ${templateId}: ${JSON.stringify(p.errors)}`);
  const r = addTacticPlan(V21_BOOK, { plan: p.plan });
  if (!r.ok) throw new Error(`book ${templateId}: ${JSON.stringify(r.errors)}`);
  V21_BOOK = r.book;
}

const result = await runGate({
  name: "Flags-off release 3a-B（打包結果的玩家流程）",
  timeoutMs: 1800000,
  externalUrl: url,
  async run({ chrome, ck, sleep }) {
    const ev = async (body) => J(await chrome.evaluate(body));
    const waitFor = async (expr, timeoutMs, everyMs = 300) => {
      const t = Date.now();
      while (Date.now() - t < timeoutMs) { const r = await ev("return JSON.stringify({ v: Boolean(" + expr + ") });"); if (r?.v) return true; await sleep(everyMs); }
      return false;
    };
    const pageText = () => ev("return JSON.stringify(document.body.innerText);");
    const lsProfile = () => ev("return JSON.stringify(localStorage.getItem(" + JSON.stringify(PROFILE) + "));");
    const leakOf = () => ev("const re=new RegExp(" + JSON.stringify(LEAK) + "); const hit=[]; for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); const m=String(localStorage.getItem(k)).match(re); if(m) hit.push([k,m[0]]); } return JSON.stringify(hit);");
    const bookOf = () => ev("const raw=localStorage.getItem(" + JSON.stringify(PROFILE) + "); if(!raw) return JSON.stringify(null); const o=JSON.parse(raw); return JSON.stringify(o.tacticBook ?? o.data?.tacticBook ?? o.profile?.tacticBook ?? null);");
    const realClick = async (sel) => {
      const p = await ev("const el = [...document.querySelectorAll(" + JSON.stringify(sel) + ")].find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && !n.disabled; }); if (!el) return JSON.stringify(null); const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });");
      if (!p) return null;
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await chrome.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", clickCount: 1 });
      return p;
    };
    const walkToTactic = async (label) => {
      ck(`${label} 首頁有 MOBA 入口`, await waitFor("document.querySelector('[data-testid=\"home-mode-moba\"]')", 60000));
      const homeText = await pageText();
      ck(`${label} 首頁沒有「戰術書」字樣`, !(homeText ?? "").includes("戰術書"));
      await ev(clickSel(tid("home-mode-moba")));
      ck(`${label} 進入賽前頁`, await waitFor("document.querySelector('[data-testid=\"prep-primary-action\"]')", 60000));
      const prepDeadline = Date.now() + 180000;
      while (Date.now() < prepDeadline) {
        if ((await ev("return JSON.stringify({ v: !!document.querySelector('[data-testid=\"hero-grid-scroll\"]') });"))?.v) break;
        if ((await ev("const b=document.querySelector('[data-testid=\"matchmaking-enter-banpick\"]'); return JSON.stringify({ v: !!b && !b.disabled });"))?.v) { await ev(clickSel(tid("matchmaking-enter-banpick"))); await sleep(1000); continue; }
        const a = await ev("const el = document.querySelector('[data-testid=\"prep-primary-action\"]'); return JSON.stringify({ action: el ? el.dataset.action : null, disabled: !!(el && el.disabled) });");
        if (a?.action === "blocked") { await ev(clickText("自動")); await sleep(800); continue; }
        if (a?.action && !a.disabled) { await ev(clickSel(tid("prep-primary-action"))); await sleep(900); continue; }
        await sleep(600);
      }
      const inBan = await waitFor("document.querySelector('[data-testid=\"hero-grid-scroll\"]')", 60000);
      ck(`${label} 進入 Ban/Pick`, inBan);
      if (!inBan) return false;
      const draftDeadline = Date.now() + 300000;
      while (Date.now() < draftDeadline) {
        if ((await ev("const b = document.querySelector('[data-testid=\"confirm-draft\"]'); return JSON.stringify({ v: !!b && !b.disabled });"))?.v) break;
        await realClick(tid("hero-choose"));
        await sleep(1200);
      }
      await ev(clickSel(tid("confirm-draft")));
      const inTactic = await waitFor("[...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('開始載入'))", 60000);
      ck(`${label} 進入戰術頁`, inTactic);
      return inTactic;
    };
    const playToEnd = async (label) => {
      const book = await ev("return JSON.stringify({ steps: !!document.querySelector('[data-testid=\"tb-steps\"]'), strip: !!document.querySelector('[data-testid=\"tb-template-strip\"]') });");
      const txt = await pageText();
      ck(`${label} 戰術頁是 v20 畫面（沒有戰術書步驟與模板列；副標「8 套戰術」；沒有「戰術書」字樣）`, !book?.steps && !book?.strip && (txt ?? "").includes("8 套戰術") && !(txt ?? "").includes("戰術書"), JSON.stringify(book));
      await ev(clickText("開始載入"));
      const inBattle = await waitFor("document.querySelector('[data-testid=\"battle-hud\"]')", 180000, 500);
      ck(`${label} 進入對戰`, inBattle);
      if (!inBattle) return false;
      await sleep(2500);
      await ev("window.confirm = () => true; return JSON.stringify({});");
      await ev(clickSel(tid("quick-finish-match")));
      const ended = await waitFor("[...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('觀看重播'))", 300000, 500);
      ck(`${label} 快速完成後到賽後畫面`, ended);
      return ended;
    };

    // ── N 新局 ────────────────────────────────────────────────────────────
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }).catch(() => {});
    await chrome.navigate(url); await sleep(2500);
    await ev("localStorage.clear(); return JSON.stringify({});");
    await chrome.navigate(url); await sleep(3000);
    const assets = await ev("return JSON.stringify([...document.scripts].map((s) => s.src).filter(Boolean));");
    ck("N0 跑的是打包結果（assets/ 底下的 bundle，沒有 /src/）", (assets ?? []).some((s) => /\/assets\//.test(s)) && !(assets ?? []).some((s) => /\/src\//.test(s)), JSON.stringify(assets));
    const okN = await walkToTactic("N");
    if (okN) {
      const ended = await playToEnd("N");
      if (ended) {
        await sleep(1200);
        const leak = await leakOf();
        ck("N9 打完一場：存檔沒有任何 v21 標記", Array.isArray(leak) && !leak.length, JSON.stringify(leak));
        const b = await bookOf();
        ck("N10 打完一場：戰術書是空的（玩家做不出計畫）", (b?.plans ?? []).length === 0, JSON.stringify(b));
      }
    }

    // ── V 帶 v21 計畫的舊存檔 ─────────────────────────────────────────────
    const rawBefore = await lsProfile();
    const parsed = rawBefore ? J(rawBefore) : null;
    const holder = parsed?.tacticBook ? parsed : parsed?.data?.tacticBook ? parsed.data : parsed?.profile?.tacticBook ? parsed.profile : null;
    ck("V0 看得到存檔裡的 tacticBook 欄位（否則下面的測試不成立）", !!holder, Object.keys(parsed ?? {}).slice(0, 8).join(","));
    if (holder) {
      const careerBefore = JSON.stringify({ players: holder.players, lineup: holder.lineup, team: holder.team });
      holder.tacticBook = V21_BOOK;
      const want = JSON.stringify(V21_BOOK);
      const injected = JSON.stringify(parsed);
      await ev("localStorage.setItem(" + JSON.stringify(PROFILE) + ", " + JSON.stringify(injected) + "); return JSON.stringify({});");
      await chrome.navigate(url); await sleep(3000);
      const quarantined = await ev("const k=[]; for (let i=0;i<localStorage.length;i++) k.push(localStorage.key(i)); return JSON.stringify(k.filter((x)=>x.endsWith('.corrupt')));");
      ck("V1 帶 3 份 v21 計畫的存檔讀得回來，沒有被隔離", Array.isArray(quarantined) && !quarantined.length, JSON.stringify(quarantined));
      const okV = await walkToTactic("V");
      if (okV) {
        const mid = await bookOf();
        ck("V2 走到戰術頁：tacticBook 逐位元相同", JSON.stringify(mid) === want, JSON.stringify(mid).slice(0, 200));
        const ended = await playToEnd("V");
        if (ended) {
          await sleep(1200);
          const after = await bookOf();
          ck("V8 打完一場：tacticBook 逐位元相同（流程不會改寫玩家的計畫）", JSON.stringify(after) === want, JSON.stringify(after).slice(0, 200));
          const raw = await lsProfile();
          const o = raw ? J(raw) : null;
          const h = o?.tacticBook ? o : o?.data?.tacticBook ? o.data : o?.profile?.tacticBook ? o.profile : null;
          const teamSame = h && JSON.stringify(h.team?.id ?? null) === JSON.stringify(JSON.parse(careerBefore).team?.id ?? null) && (h.players ?? []).length === (JSON.parse(careerBefore).players ?? []).length;
          ck("V9 打完一場：隊伍與選手名單還在（舊存檔沒有被覆寫成新局）", !!teamSame);
        }
      }
    }

    // ── E ─────────────────────────────────────────────────────────────────
    const errs = chrome.pageErrors ?? [];
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
  },
});
await killProcessTree(preview.pid).catch(() => {});
try { preview.kill(); } catch { /* already gone */ }
await finishGate(result);
