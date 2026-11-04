#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_release_3aB.mjs — Phase 3a-B 旗標關閉發布：正式站 smoke（Owner 2026-11-04 最終 Review 第 5 項）
//
//  部署前（舊版正式站）先存一份真存檔：
//    node tools/browser_check_prod_release_3aB.mjs --mode=capture --dir=<repo 外資料夾>
//  部署後：
//    node tools/browser_check_prod_release_3aB.mjs --old-save=<dir>/prod-save-before.json --expect-entry-not=<舊 bundle 檔名>
//  彩排可設 ESMO_PROD_URL 指向本機 preview。
//
//  1366 與 390 各走一次，全程獨立 profile，碰不到 Owner 的存檔：
//    A  首頁、打包結果、旗標在 bundle 裡是關的、看不到戰術書
//    M  MOBA 真 UI：賽前 → 選角 → v20 戰術頁 → 對戰 → 快速完成 → 結算，只入帳一次
//    R  結算 → 重播：陣容 10 列、時間軸前進
//    S  重整後存檔還在、沒有隔離檔、沒有 v21 標記
//    T  Training：真 UI 安排一門課，存檔真的有，重整後還在
//    H  Competition Hub：分頁都切得動，沒有水平溢出
//    O  部署前存的舊存檔（只在 1366）：讀得回來、資料沒被改、還能再打一場
//    E  page error 與 console error 全部列出，要 0
//  CS 比賽結算另跑 browser_check_cs_major_formal_flow --url=<正式站>（同一支 Gate，1366 與 390）。
//
//  ⚠ 正式站讀不到 /src/（TD-31），全程只走 DOM 與 localStorage。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。導航一律用 testid 或從程式碼讀到的字串。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { runGate, finishGate } from "./browser/harness.mjs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const MODE = arg("mode") ?? "verify";
const DIR = arg("dir");
const OLD_SAVE = arg("old-save");
const NOT_ENTRY = arg("expect-entry-not");
const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";
const PROFILE = "esmo.profile.v1";
const LEAK = "moba-sim\\.v21|career\\.v21|challenge\\.v21|balanceTool\\.v21|v21\\.b[0-9]|core\\.v1";
if (MODE === "capture" && !DIR) { console.error("capture 要 --dir"); process.exit(2); }

const J = (raw) => { const s = String(raw); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
const tid = (id) => "[data-testid=\"" + id + "\"]";
const clickSel = (sel) => "const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll(" + JSON.stringify(sel) + ")].find(vis); if (el) el.click(); return JSON.stringify({ ok: !!el });";
const clickText = (needle) => "const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll('button')].filter(vis).find((b) => (b.innerText || '').includes(" + JSON.stringify(needle) + ")); if (el) el.click(); return JSON.stringify({ ok: !!el });";

const result = await runGate({
  name: `Prod release 3a-B（${MODE}）`,
  externalUrl: PROD,
  timeoutMs: 2400000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => J(await chrome.evaluate(body));
    const waitFor = async (expr, timeoutMs, everyMs = 400) => {
      const t = Date.now();
      while (Date.now() - t < timeoutMs) { const r = await ev("return JSON.stringify({ v: Boolean(" + expr + ") });"); if (r?.v) return true; await sleep(everyMs); }
      return false;
    };
    const profile = async () => J(await ev("return JSON.stringify(localStorage.getItem(" + JSON.stringify(PROFILE) + "));"));
    const leakOf = () => ev("const re=new RegExp(" + JSON.stringify(LEAK) + "); const hit=[]; for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); const m=String(localStorage.getItem(k)).match(re); if(m) hit.push([k,m[0]]); } return JSON.stringify(hit);");
    const corrupt = () => ev("const k=[]; for (let i=0;i<localStorage.length;i++) k.push(localStorage.key(i)); return JSON.stringify(k.filter((x)=>x.endsWith('.corrupt')));");
    const overflow = () => ev("const d=document.documentElement; return JSON.stringify(d.scrollWidth - d.clientWidth);");
    const txCount = (p) => Object.keys(p?.processedMatchTransactions ?? {}).length;
    const realClick = async (sel) => {
      const p = await ev("const el = [...document.querySelectorAll(" + JSON.stringify(sel) + ")].find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; }); if (!el) return JSON.stringify(null); const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });");
      if (!p) return null;
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await chrome.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", clickCount: 1 });
      return p;
    };
    const home = async () => { await chrome.navigate(url); return waitFor("document.querySelector('" + tid("home-mode-moba") + "')", 90000); };

    const walkToTactic = async (label) => {
      await ev(clickSel(tid("home-mode-moba")));
      ck(`${label} 進入賽前頁`, await waitFor("document.querySelector('" + tid("prep-primary-action") + "')", 60000));
      const prepDeadline = Date.now() + 180000;
      while (Date.now() < prepDeadline) {
        if ((await ev("return JSON.stringify({ v: !!document.querySelector('" + tid("hero-grid-scroll") + "') });"))?.v) break;
        if ((await ev("const b=document.querySelector('" + tid("matchmaking-enter-banpick") + "'); return JSON.stringify({ v: !!b && !b.disabled });"))?.v) { await ev(clickSel(tid("matchmaking-enter-banpick"))); await sleep(900); continue; }
        const a = await ev("const el = document.querySelector('" + tid("prep-primary-action") + "'); return JSON.stringify({ action: el ? el.dataset.action : null, disabled: !!(el && el.disabled) });");
        if (a?.action === "blocked") { await ev(clickText("自動")); await sleep(800); continue; }
        if (a?.action && !a.disabled) { await ev(clickSel(tid("prep-primary-action"))); await sleep(900); continue; }
        await sleep(600);
      }
      const inBan = await waitFor("document.querySelector('" + tid("hero-grid-scroll") + "')", 60000);
      ck(`${label} 進入 Ban/Pick`, inBan);
      if (!inBan) return false;
      const draftDeadline = Date.now() + 300000;
      while (Date.now() < draftDeadline) {
        if ((await ev("const b = document.querySelector('" + tid("confirm-draft") + "'); return JSON.stringify({ v: !!b && !b.disabled });"))?.v) break;
        if (!(await realClick(tid("hero-choose")))) await ev(clickSel(tid("hero-choose")));
        await sleep(1200);
      }
      await ev(clickSel(tid("confirm-draft")));
      const inTactic = await waitFor("[...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('開始載入'))", 60000);
      ck(`${label} 進入戰術頁`, inTactic);
      return inTactic;
    };
    const playToEnd = async (label) => {
      await ev(clickText("開始載入"));
      const inBattle = await waitFor("document.querySelector('" + tid("battle-hud") + "')", 240000, 500);
      ck(`${label} 進入對戰`, inBattle);
      if (!inBattle) return false;
      await sleep(2500);
      await ev("window.confirm = () => true; return JSON.stringify({});");
      await ev(clickSel(tid("quick-finish-match")));
      const ended = await waitFor("[...document.querySelectorAll('button')].some((b) => /觀看重播|無法重播/.test(b.innerText || '')) || [...document.querySelectorAll('span')].some((s) => /無法重播/.test(s.innerText || ''))", 300000, 500);
      ck(`${label} 快速完成後到結算`, ended);
      return ended;
    };

    // ── capture：舊版正式站打一場，把真存檔留下來 ───────────────────────────
    if (MODE === "capture") {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }).catch(() => {});
      ck("C0 舊版首頁", await home());
      const scripts = await ev("return JSON.stringify([...document.scripts].map((s) => s.src).filter(Boolean));");
      if (await walkToTactic("C")) await playToEnd("C");
      await sleep(1500);
      const all = await ev("const o={}; for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); o[k]=localStorage.getItem(k); } return JSON.stringify(o);");
      ck("C1 舊版存檔有一場比賽", all?.[PROFILE] && txCount(JSON.parse(all[PROFILE])) >= 1, String(Object.keys(all ?? {})));
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(path.join(DIR, "prod-save-before.json"), JSON.stringify({ url, scripts, capturedAt: new Date().toISOString(), storage: all }, null, 1), { flag: "wx" });
      console.log("entry:", (scripts ?? []).join(" "));
      ck("E 舊版 page error 0", chrome.pageErrors.length === 0, chrome.pageErrors.slice(0, 3).join(" ¦ "));
      return;
    }

    // ── verify ──────────────────────────────────────────────────────────────
    let entry = null;
    for (const [label, w, h, mob] of [["1366", 1366, 900, false], ["390", 390, 844, true]]) {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
      await chrome.navigate(url); await sleep(2000);
      await ev("localStorage.clear(); return JSON.stringify({});");
      ck(`A0[${label}] 新局首頁有 MOBA 入口`, await home());
      const scripts = await ev("return JSON.stringify([...document.scripts].map((s) => s.src).filter(Boolean));");
      const mainJs = (scripts ?? []).find((s) => /\/assets\/index-/.test(s));
      ck(`A1[${label}] 跑的是打包結果（assets/，沒有 /src/）`, !!mainJs && !(scripts ?? []).some((s) => /\/src\//.test(s)), String(mainJs));
      if (label === "1366" && mainJs) {
        entry = mainJs.split("/").pop();
        console.log("entry:", entry);
        if (NOT_ENTRY) ck("A2 bundle 檔名已經換掉，不是舊版", entry !== NOT_ENTRY, `${entry} ／ 舊 ${NOT_ENTRY}`);
        const code = await (await fetch(mainJs)).text();
        ck("A3 bundle 裡兩個 v21 旗標都是關的", code.includes("mobaTacticalDirectorV21:!1") && code.includes("mobaChallengeV21:!1"));
      }
      const homeText = await ev("return JSON.stringify(document.body.innerText);");
      ck(`A4[${label}] 首頁沒有「戰術書」`, !(homeText ?? "").includes("戰術書"));
      ck(`A5[${label}] 首頁沒有水平溢出`, (await overflow()) <= 0, String(await overflow()));

      // ── M MOBA v20 ──
      const before = txCount(await profile());
      if (await walkToTactic(`M[${label}]`)) {
        const book = await ev("return JSON.stringify({ steps: !!document.querySelector('" + tid("tb-steps") + "'), strip: !!document.querySelector('" + tid("tb-template-strip") + "') });");
        const txt = await ev("return JSON.stringify(document.body.innerText);");
        ck(`M1[${label}] 戰術頁是 v20 畫面（沒有戰術書步驟與模板列；「8 套戰術」；沒有「戰術書」）`, !book?.steps && !book?.strip && (txt ?? "").includes("8 套戰術") && !(txt ?? "").includes("戰術書"));
        if (await playToEnd(`M[${label}]`)) {
          await sleep(1500);
          const after = await profile();
          ck(`M2[${label}] 入帳恰好一次`, txCount(after) === before + 1, `${before} → ${txCount(after)}`);
          ck(`M3[${label}] 結算沒有水平溢出`, (await overflow()) <= 0, String(await overflow()));
          // ── R Replay ──
          const opened = await ev(clickText("觀看重播"));
          ck(`R0[${label}] 「觀看重播」可點`, !!opened?.ok);
          if (opened?.ok) {
            ck(`R1[${label}] 重播畫面開啟`, await waitFor("document.querySelector('" + tid("replay-play-toggle") + "')", 30000));
            ck(`R2[${label}] 重播地圖載入完成`, await waitFor("!document.querySelector('" + tid("rift-entry-loading") + "')", 90000));
            await ev("const t=document.querySelector('" + tid("replay-lineup-toggle") + "'); if(t&&t.getAttribute('aria-pressed')!=='true') t.click(); return JSON.stringify(1);");
            await sleep(800);
            const rows = await ev("return JSON.stringify(document.querySelectorAll('" + tid("replay-lineup-row") + "').length);");
            ck(`R3[${label}] 陣容 10 列`, rows === 10, String(rows));
            const tl = () => ev("const s=document.querySelector('input[aria-label=\"重播時間軸\"]'); return JSON.stringify(s?Number(s.value):null);");
            const t0 = await tl(); await sleep(3500); const t1 = await tl();
            ck(`R4[${label}] 時間軸前進`, t1 > t0, `${t0} → ${t1}`);
            ck(`R5[${label}] 關閉重播`, !!(await ev(clickText("關閉重播")))?.ok);
          }
        }
      }

      // ── S 存檔 ──
      const saved = await profile();
      ck(`S0[${label}] 回首頁`, await home());
      const reloaded = await profile();
      ck(`S1[${label}] 重整後存檔還在：選手、入帳帳本相同`, txCount(reloaded) === txCount(saved) && (reloaded?.players ?? []).length === (saved?.players ?? []).length && (saved?.players ?? []).length > 0, `${(saved?.players ?? []).length} 人 ${txCount(saved)} 筆`);
      const bad = await corrupt();
      ck(`S2[${label}] 沒有隔離檔`, Array.isArray(bad) && !bad.length, JSON.stringify(bad));
      const leak = await leakOf();
      ck(`S3[${label}] 所有 localStorage 沒有 v21 標記`, Array.isArray(leak) && !leak.length, JSON.stringify(leak));
      ck(`S4[${label}] 戰術書是空的`, (reloaded?.tacticBook?.plans ?? []).length === 0);

      // ── T Training ──
      if (mob) { await ev(clickSel(tid("home-nav-team"))); await sleep(700); await ev(clickSel(tid("home-sheet-training"))); }
      else await ev(clickSel(tid("home-utility-training")));
      //  ⚠ 課程要先選選手才會出現（TrainingScreen 的 selId 初值是 null）。選手卡片上有「體力 N」。
      const onPage = await waitFor("[...document.querySelectorAll('button')].some((b) => /體力 \\d+/.test(b.innerText || ''))", 30000);
      if (onPage) {
        const pick = ((await profile())?.players ?? []).filter((x) => !x.training).sort((a, b) => (b.energy ?? 100) - (a.energy ?? 100))[0];
        await ev("const el=[...document.querySelectorAll('button')].find((b)=>/體力 \\d+/.test(b.innerText||'') && (b.innerText||'').includes(" + JSON.stringify(pick?.name ?? "") + ")); if(el) el.click(); return JSON.stringify({ ok: !!el });");
      }
      const inTraining = onPage && await waitFor("[...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('精準射擊訓練'))", 15000);
      ck(`T0[${label}] 進入 Training，選手後出現課程`, inTraining);
      if (inTraining) {
        ck(`T1[${label}] Training 沒有水平溢出`, (await overflow()) <= 0, String(await overflow()));
        ck(`T2[${label}] 點「精準射擊訓練」`, !!(await ev(clickText("精準射擊訓練")))?.ok);
        await sleep(1200);
        const p = await profile();
        const n = (p?.players ?? []).filter((x) => x.training).length;
        ck(`T3[${label}] 存檔真的有訓練中的選手`, n >= 1, `${n} 人`);
        await home();
        const p2 = await profile();
        ck(`T4[${label}] 重整後還在`, (p2?.players ?? []).filter((x) => x.training).length === n);
      }

      // ── H Competition Hub ──
      ck(`H0[${label}] 回首頁`, await home());
      await ev(clickSel(tid("home-mode-bracket")));
      const inHub = await waitFor("document.querySelector('" + tid("competition-hub-tabs") + "')", 30000);
      ck(`H1[${label}] 進入 Competition Hub`, inHub);
      if (inHub) {
        for (const mode of ["moba", "cs"]) {
          const c = await ev(clickSel(tid(`competition-hub-tab-${mode}`)));
          await sleep(900);
          const panel = await ev("const p=document.querySelector('" + tid("competition-hub-panel") + "'); return JSON.stringify(p ? p.dataset.mode : null);");
          ck(`H2[${label}] 分頁 ${mode} 切得動`, !!c?.ok && panel === mode, String(panel));
          ck(`H3[${label}] 分頁 ${mode} 沒有水平溢出`, (await overflow()) <= 0, String(await overflow()));
        }
      }
    }

    // ── O 部署前的舊存檔 ──
    if (OLD_SAVE) {
      const old = JSON.parse(fs.readFileSync(OLD_SAVE, "utf8")).storage;
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
      await chrome.navigate(url); await sleep(1500);
      await ev("localStorage.clear(); const o=" + JSON.stringify(JSON.stringify(old)) + "; const d=JSON.parse(o); for (const k of Object.keys(d)) localStorage.setItem(k,d[k]); return JSON.stringify(Object.keys(d).length);");
      ck("O0 舊存檔注入後首頁開得起來", await home());
      const want = JSON.parse(old[PROFILE]);
      const now = await profile();
      const bad = await corrupt();
      ck("O1 舊存檔沒有被隔離", Array.isArray(bad) && !bad.length, JSON.stringify(bad));
      const same = (k) => JSON.stringify(now?.[k]) === JSON.stringify(want[k]);
      for (const k of ["manager", "team", "lineup", "players", "finance", "processedMatchTransactions", "competitionByMode", "csHistory"]) ck(`O2 舊存檔 ${k} 逐值相同`, same(k));
      const dropped = Object.keys(want).filter((k) => !(k in (now ?? {})));
      ck("O3 舊存檔沒有欄位被丟掉", !dropped.length, JSON.stringify(dropped));
      const nb = txCount(now);
      if (await walkToTactic("O4") && await playToEnd("O4")) {
        await sleep(1500);
        const after = await profile();
        ck("O5 舊存檔再打一場，入帳恰好多一筆，隊伍與選手數不變", txCount(after) === nb + 1 && (after?.players ?? []).length === (want.players ?? []).length && JSON.stringify(after?.team?.id ?? null) === JSON.stringify(want.team?.id ?? null), `${nb} → ${txCount(after)}`);
        const leak = await leakOf();
        ck("O6 舊存檔打完沒有 v21 標記", Array.isArray(leak) && !leak.length, JSON.stringify(leak));
      }
    }

    // ── E 錯誤 ──
    const errs = chrome.consoleLines.filter((l) => l.startsWith("[error]"));
    ck("E1 page error 0", chrome.pageErrors.length === 0, chrome.pageErrors.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0", errs.length === 0, errs.slice(0, 5).join(" ¦ ").slice(0, 600));
  },
});
await finishGate(result);
