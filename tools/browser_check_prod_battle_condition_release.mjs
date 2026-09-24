#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_battle_condition_release.mjs — Battle Condition UX 正式站 smoke
//
//  執行：ESMO_EXTERNAL_URL=https://rayhuang0323.github.io/ESMO-/ \
//        node tools/browser/run-gate.mjs tools/browser_check_prod_battle_condition_release.mjs --timeout 1800000
//  （不設 ESMO_EXTERNAL_URL 時打本機 dev server，同一支。）
//
//  ⚠ 瀏覽器端完全不 import /src/（打包後沒有那些路徑，TD-31）：只走 UI ＋ localStorage。
//    存檔由 Node 端用**同一個 commit** 的 profileStore 產生，再整包寫進 localStorage。
//    測試瀏覽器是獨立 profile ⇒ 不會碰到 Owner 自己的正式站存檔。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
//
//  桌機 1366×900 與 390×844 各一輪：
//    B  線上 bundle 是新版（含只存在於本版的 `teamStrength.v2`）
//    E  首頁「安排選手休息」→ 體力管理面板 → 全選 → 安排休息：寫進正式訓練槽、不改體力、不推進日期
//    M  全隊低體力（0／5／12／20／35）走正式流程進 MOBA 戰鬥：十名英雄在跑、腳下沒有隊伍環、
//       沒有常駐英雄名牌、技能施放標籤出現且同時 ≤ 3、文字是「欄位 · 技能名」
//    C  同一批低體力選手走 CS Practice：選手卡「素質」區顯示真實體力（不是引擎內部封頂的 70）
//    X  page error 0、console／shader error 0
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const OUT = process.env.ESMO_REVIEW_OUT ?? (TARGET_URL ? "tmp/battle-condition-prod" : "tmp/battle-condition-release");
mkdirSync(OUT, { recursive: true });
const KEY = "esmo.profile.v1";
const ENERGIES = [0, 5, 12, 20, 35];

//  ── 存檔（Node 端，同 commit 的正式 store）────────────────────────────────
let savedJson = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? savedJson : null),
  setItem: (k, v) => { if (k === KEY) savedJson = String(v); },
  removeItem: (k) => { if (k === KEY) savedJson = null; },
  clear: () => { savedJson = null; },
};
const { useProfileStore } = await import("../src/platform/profileStore.js");
const st = () => useProfileStore.getState();
st().startNewGame("standard");
st().autoFillLineup("moba");
st().autoFillLineup("cs");
st().setCsPracticeMap("dust2");
st().setCsAcceptedMapPool(["dust2", "mirage", "inferno"]);
st().save();
const SAVE = JSON.parse(savedJson);
const csExpected = {};
["f1", "f2", "f3", "f4", "f5"].forEach((seat, i) => {
  const p = SAVE.players.find((x) => x.id === SAVE.csLineup[seat]);
  p.energy = ENERGIES[i];
  csExpected[`t${i + 1}`] = ENERGIES[i];
});
const SAVE_TEXT = JSON.stringify(SAVE);

const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

const result = await runGate({
  name: TARGET_URL ? "Battle Condition UX release（正式站）" : "Battle Condition UX release",
  timeoutMs: 1_700_000,
  externalUrl: TARGET_URL,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* 下一個候選 */ } } return r.replace(/^"|"$/g, ""); };
    const wait = async (expr, ms, every = 400) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁中 */ } await sleep(every); } return false; };
    const click = (sel) => chrome.evaluate(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el&&!el.disabled) el.click(); return JSON.stringify(!!el);");
    const clickText = (t) => chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const readSave = async () => { const v = await ev("return localStorage.getItem(" + JSON.stringify(KEY) + ") || 'null';"); return typeof v === "string" ? JSON.parse(v) : v; };
    const inject = async (query = "") => {
      await chrome.navigate(url);
      await chrome.evaluate("try{localStorage.clear();sessionStorage.clear();localStorage.setItem(" + JSON.stringify(KEY) + "," + JSON.stringify(SAVE_TEXT) + ");}catch(e){} return 1;");
      await chrome.navigate(url + query);
    };
    const inBattle = "document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')";

    async function toMobaBattle(label) {
      ck(`${label}｜首頁有 MOBA 入口`, await wait("q('[data-testid=\"home-mode-moba\"]')", 90000));
      await click('[data-testid="home-mode-moba"]');
      await wait("q('[data-testid=\"prep-primary-action\"]')", 60000);
      const t0 = Date.now();
      while (Date.now() - t0 < 150000) {
        const s = await ev(VIS + "if(q('[data-testid=\"hero-grid-scroll\"]')) return JSON.stringify('bp'); const b=q('[data-testid=\"matchmaking-enter-banpick\"]'); if(b&&!b.disabled){b.click();return JSON.stringify('mm');} const a=q('[data-testid=\"prep-primary-action\"]'); if(a&&a.dataset.action==='blocked'){return JSON.stringify('blocked');} if(a&&!a.disabled){a.click(); return JSON.stringify('prep');} return JSON.stringify('wait');");
        if (s === "bp") break;
        if (s === "blocked") { ck(`${label}｜低體力陣容沒有被擋下（prep 不是 blocked）`, false, "prep-primary-action = blocked"); return false; }
        await sleep(900);
      }
      const t1 = Date.now();
      while (Date.now() - t1 < 150000) {
        const done = await ev(VIS + "const c=q('[data-testid=\"confirm-draft\"]'); if(c&&!c.disabled){c.click(); return JSON.stringify(true);} const h=q('[data-testid=\"hero-choose\"]'); if(h){for(const t of ['pointerdown','mousedown','pointerup','mouseup','click']) h.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true}));} return JSON.stringify(false);");
        if (done) break; await sleep(1200);
      }
      await wait("[...document.querySelectorAll('button')].some(b=>(b.innerText||'').includes('開始載入'))", 60000);
      await clickText("開始載入");
      const t2 = Date.now();
      while (Date.now() - t2 < 150000) {
        if (await ev(VIS + "return JSON.stringify(!!(" + inBattle + "));")) return true;
        await chrome.evaluate(VIS + "const s=[...document.querySelectorAll('button')].filter(vis).find(b=>/開始比賽|進入戰鬥|開始戰鬥/.test(b.innerText||'')); if(s&&!s.disabled) s.click(); return 1;");
        await sleep(700);
      }
      return false;
    }

    async function toCsBattle() {
      if (!(await wait("q('[data-testid=\"home-mode-cs\"]')", 60000))) return false;
      await click('[data-testid="home-mode-cs"]');
      if (!(await wait("q('[data-testid=\"prep-start-practice\"]')", 30000))) return false;
      await click('[data-testid="prep-start-practice"]');
      await wait("document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action === 'confirm' || document.querySelector('[data-testid=\"cs-map-confirm\"]')", 30000);
      if (await ev("return JSON.stringify(document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action === 'confirm');")) await click('[data-testid="prep-primary-action"]');
      if (!(await wait("document.querySelector('[data-testid=\"cs-map-confirm\"]') && !document.querySelector('[data-testid=\"cs-map-confirm\"]').disabled", 45000))) return false;
      await chrome.evaluate("document.querySelector('[data-testid=\"cs-map-confirm\"]').click(); return 1;");
      if (!(await wait("document.querySelector('[data-testid=\"cs-tactic-confirm\"]')", 30000))) return false;
      await chrome.evaluate("document.querySelector('[data-testid=\"cs-tactic-confirm\"]').click(); return 1;");
      return wait("document.querySelector('[data-esmo-fps-player-card=\"t1\"]')", 150000);
    }
    const readCsCard = (id) => ev(
      "return (async () => {" +
      " const btn = document.querySelector('[data-esmo-fps-player-card=\"" + id + "\"]'); if (!btn) return JSON.stringify({ok:false, why:'no row'});" +
      " btn.scrollIntoView({block:'center'}); btn.click();" +
      " for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100));" +
      "  const tg = [...document.querySelectorAll('button')].find((b) => /^素質▾$/.test((b.textContent||'').trim())); if (tg) { tg.click(); continue; }" +
      "  const line = [...document.querySelectorAll('div')].filter((d) => /FPS戰力/.test(d.textContent) && /體力\\s*-?\\d/.test(d.textContent)).sort((a, b) => a.textContent.length - b.textContent.length)[0];" +
      "  if (line) { const m = /體力\\s*(-?\\d+)/.exec(line.textContent); return JSON.stringify({ok:true, energy: m ? Number(m[1]) : null, text: line.textContent.replace(/\\s+/g,' ').trim()}); } }" +
      " return JSON.stringify({ok:false, why:'card not shown'}); })();");

    // ── B 線上 bundle 是新版 ────────────────────────────────────────────────
    await chrome.navigate(url);
    await wait("q('[data-testid=\"home-mode-moba\"]') || document.querySelector('#root *')", 60000);
    const bundle = await ev(
      "return (async () => { const urls = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\\.js(\\?|$)/.test(n)))];" +
      " for (const s of document.querySelectorAll('script[src],link[rel=modulepreload]')) urls.push(s.src || s.href);" +
      " let hit = null; for (const u of [...new Set(urls)]) { try { const t = await (await fetch(u)).text(); if (t.includes('teamStrength.v2')) { hit = u.split('/').pop(); break; } } catch (e) {} }" +
      " return JSON.stringify({ hit, n: urls.length }); })();");
    ck("B1 線上 bundle 含本版字串 teamStrength.v2（不是舊站）", !!bundle?.hit, JSON.stringify(bundle));

    for (const vp of [
      { label: "Desktop", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false },
      { label: "390", width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    ]) {
      const L = vp.label;
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile });

      // ── E Dashboard 批次休息 ────────────────────────────────────────────
      await inject();
      ck(`${L}｜E0 首頁載入`, await wait("q('[data-testid=\"home-mode-moba\"]')", 90000));
      const s0 = await readSave();
      const todo = await wait("[...document.querySelectorAll('button')].filter(vis).some(b=>(b.innerText||'').includes('安排選手休息'))", 15000);
      ck(`${L}｜E1 首頁出現「安排選手休息」待辦`, todo);
      await clickText("安排選手休息");
      ck(`${L}｜E2 打開體力管理面板`, await wait("q('[data-testid=\"rest-planner\"]')", 8000));
      const rows = await ev("return JSON.stringify(document.querySelectorAll('[data-testid=rest-player-row]').length);");
      ck(`${L}｜E3 面板列出低體力選手（含疲勞百分比）`, rows >= 5 && await ev("return JSON.stringify(!!document.querySelector('[data-testid=rest-player-fatigue]'));"), `${rows} 列`);
      //  全選是 toggle：點到「全部被選取」為止（最多兩次）
      for (let i = 0; i < 2; i++) {
        const all = await ev("const cs=[...document.querySelectorAll('[data-testid=rest-player-check]')]; return JSON.stringify(cs.length>0 && cs.every(c=>c.checked||c.getAttribute('aria-checked')==='true'||c.getAttribute('aria-pressed')==='true'));");
        if (all) break;
        await click('[data-testid="rest-select-all"]'); await sleep(250);
      }
      const assigned = await ev("const b=document.querySelector('[data-testid=rest-assign]'); if(!b||b.disabled) return JSON.stringify(false); b.click(); return JSON.stringify(true);");
      ck(`${L}｜E4 全選後一次安排休息`, assigned && await wait("q('[data-testid=\"rest-planner-result\"]')", 6000));
      await shot(`${L}-rest-planner`);
      await sleep(500);
      const s1 = await readSave();
      const resting = (s1?.players ?? []).filter((p) => p.training?.courseId === "rest").length;
      ck(`${L}｜E5 休息寫進正式訓練槽（${resting}/5）、體力沒有被直接改`,
        resting === 5 && JSON.stringify(s1.players.map((p) => p.energy)) === JSON.stringify(s0.players.map((p) => p.energy)),
        `energies ${s1?.players?.map((p) => p.energy).join("/")}`);
      ck(`${L}｜E6 安排休息不推進遊戲日期`, s1?.meta?.days === s0?.meta?.days, `${s0?.meta?.days} → ${s1?.meta?.days}`);

      // ── M MOBA（低體力陣容）──────────────────────────────────────────────
      await inject("?diag=1");
      ck(`${L}｜M0 全隊體力 ${ENERGIES.join("／")} 走正式流程進入 MOBA 戰鬥`, await toMobaBattle(L));
      await click('[data-testid="match-speed-4"]');
      let heroes = 0, ringOn = -1, calloutMax = 0, label = null, tsMax = 0, samples = 0;
      for (let i = 0; i < 60; i++) {
        const d = await ev("const d=window.__ESMO_RUNTIME_DIAG?window.__ESMO_RUNTIME_DIAG():null; const c=[...document.querySelectorAll('[data-testid=skill-cast-callout]')]; return JSON.stringify({ts:d?d.ts:null, heroes:d?d.heroCount:0, ring:d&&d.heroRenderDiagnostics?d.heroRenderDiagnostics.filter(h=>h.ringVisible).length:null, c:c.length, t:c[0]?c[0].textContent:null});");
        if (d) {
          samples++;
          heroes = Math.max(heroes, Number(d.heroes) || 0);
          if (d.ring !== null) ringOn = Math.max(ringOn, d.ring);
          calloutMax = Math.max(calloutMax, d.c);
          if (d.t && !label) label = d.t;
          tsMax = Math.max(tsMax, Number(d.ts) || 0);
        }
        if (i > 20 && label && calloutMax > 0) break;
        await sleep(500);
      }
      ck(`${L}｜M1 對戰在跑（十名英雄、時間前進）`, heroes === 10 && tsMax > 0, `heroes ${heroes} ts ${tsMax}`);
      ck(`${L}｜M2 英雄腳下沒有隊伍環（ringVisible 全為 false）`, ringOn === 0, `ringVisible max ${ringOn}／${samples} 次取樣`);
      ck(`${L}｜M3 沒有常駐英雄名牌`, await ev("return JSON.stringify(!document.querySelector('[data-hero-nameplate]'));"));
      ck(`${L}｜M4 技能施放標籤出現，且同時 ≤ 3`, calloutMax > 0 && calloutMax <= 3, `max ${calloutMax}`);
      ck(`${L}｜M5 標籤文字是「欄位 · 技能名」`, !!label && /^[QWER] · \S/.test(label), String(label));
      ck(`${L}｜M6 戰鬥畫面無橫向 overflow`, await ev("return JSON.stringify(document.documentElement.scrollWidth <= innerWidth + 1);"));
      await shot(`${L}-moba-4x`);

      // ── C CS 低體力選手卡 ────────────────────────────────────────────────
      await inject();
      ck(`${L}｜C0 同一批低體力選手走 CS Practice 進入對戰`, await toCsBattle());
      await sleep(1500);
      const cards = {};
      for (const id of Object.keys(csExpected)) cards[id] = await readCsCard(id);
      ck(`${L}｜C1 選手卡顯示真實體力 ${Object.values(csExpected).join("／")}（不是封頂值 70）`,
        Object.entries(csExpected).every(([id, e]) => cards[id]?.ok && cards[id].energy === e),
        Object.entries(cards).map(([id, r]) => `${id}:${r?.ok ? r.energy : r?.why}`).join(" "));
      ck(`${L}｜C2 CS 畫面無橫向 overflow`, await ev("return JSON.stringify(document.documentElement.scrollWidth <= innerWidth + 1);"));
      await shot(`${L}-cs-card`);
    }

    // ── X 錯誤 ──────────────────────────────────────────────────────────────
    const errs = chrome.consoleLines.filter((l) => /shader error|VALIDATE_STATUS|WebGL.*error|Uncaught|TypeError|ReferenceError/i.test(JSON.stringify(l)));
    ck("X1 page error = 0（桌機＋390）", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 400));
    ck("X2 console／shader error = 0", errs.length === 0, JSON.stringify(errs).slice(0, 400));
  },
});
await finishGate(result);
