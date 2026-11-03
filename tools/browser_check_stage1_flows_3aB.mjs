#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_stage1_flows_3aB.mjs — Phase 3a-B 第一階段：真正的 AppShell 流程（瀏覽器；桌機 1366，賽後面板另看 390）
//
//  執行：node tools/browser_check_stage1_flows_3aB.mjs（本地 dev server；一次只跑這一支；一支約 5–10 分鐘）
//  Owner 2026-11-01：補上次回報「未經瀏覽器實測」的三項，全程從首頁點進去，不單獨掛元件。
//  旗標：用 CDP Fetch 攔截 dev server 的 src/featureFlags.js（只在這個分頁；不改 src）。
//    C  旗標關：首頁 → 賽前 → 選角 → 戰術頁＝v20 畫面（沒有戰術書）→ 讀取畫面 → 對戰 HUD → 賽後面板照舊評分（有執行度）
//    B  旗標開：戰術書選 m3／m8 看文案；選 m7 → 讀取畫面、HUD 顯示 v21 文案 → 賽後面板未評分 → 重播顯示 v21 名稱；390 沒有橫向溢出
//    A  戰術書選 v2 模板確認後、開局前把旗標關掉（重新載入）→ 從首頁恢復 → 讀取畫面與 HUD 都是標準運營，對戰中顯示替換那一行
//    E  page error 0、console error 0
//  ⚠ chrome.evaluate 的字串裡不能有反引號。導航一律用 testid 或從程式碼讀到的字串。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";
import { templateById, templateCopyFor } from "../src/platform/tactics/tacticTemplates.js";
import { MOBA_TACTICS, STANDARD_OPP_TACTIC } from "../src/platform/contracts/MobaTacticConfig.js";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/tactic-book-3a/gate";
mkdirSync(OUT, { recursive: true });
const FLAG_LINE = "mobaTacticalDirectorV21: false,";
const TB = "v21.b2";
const COPY = { m3: templateCopyFor("classic.m3", TB), m7: templateCopyFor("classic.m7", TB), m8: templateCopyFor("classic.m8", TB), m6: templateCopyFor("classic.m6", TB), he: templateCopyFor("v2.hard_engage_stack", TB), dh: templateCopyFor("v2.defensive_hold", TB), tl: templateCopyFor("v2.three_lane_pressure", TB) };
const V2_ID = "v2.jungle_invasion", V2_NAME = templateById(V2_ID).name;
const STD_NAME = STANDARD_OPP_TACTIC.name;

const J = (raw) => { const s = String(raw); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
const clickSel = (sel) => "const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll(" + JSON.stringify(sel) + ")].find(vis); if (!el || el.disabled) return JSON.stringify({ ok: false }); el.scrollIntoView({ block: 'center' }); el.click(); return JSON.stringify({ ok: true });";
const clickText = (needle) => "const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll('button')].filter(vis).find((n) => !n.disabled && (n.innerText || '').includes(" + JSON.stringify(needle) + ")); if (!el) return JSON.stringify({ ok: false }); el.scrollIntoView({ block: 'center' }); el.click(); return JSON.stringify({ ok: true });";
const tid = (id) => '[data-testid="' + id + '"]';

const result = await runGate({
  name: "Stage-1 flows 3a-B（真正的 AppShell 流程）",
  timeoutMs: 1800000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => J(await chrome.evaluate(body));
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const BASE = new URL(".", url.endsWith("/") ? url : url + "/").pathname;
    const waitFor = async (expr, timeoutMs, everyMs = 300) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) { const r = await ev("return JSON.stringify({ v: Boolean(" + expr + ") });"); if (r?.v) return true; await sleep(everyMs); }
      return false;
    };
    const pageText = () => ev("return JSON.stringify(document.body.innerText);");
    const textOf = (id) => ev("const e=document.querySelector(" + JSON.stringify(tid(id)) + "); return JSON.stringify(e?e.innerText:null);");
    let intercept = false, flagHits = 0, flagReplaced = 0;
    chrome.on("Fetch.requestPaused", async (p) => {
      try {
        const body = await chrome.send("Fetch.getResponseBody", { requestId: p.requestId });
        const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
        let out = text;
        if (intercept) { flagHits++; if (text.split(FLAG_LINE).length - 1 === 1) { flagReplaced++; out = text.replace(FLAG_LINE, "mobaTacticalDirectorV21: true,"); } }
        await chrome.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: p.responseStatusCode ?? 200,
          responseHeaders: (p.responseHeaders ?? []).filter((h) => !/^content-length$/i.test(h.name)), body: Buffer.from(out, "utf8").toString("base64") });
      } catch { await chrome.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {}); }
    });
    await chrome.send("Network.enable").catch(() => {});
    await chrome.send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {});
    await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*src/featureFlags.js*", requestStage: "Response" }] });
    const desktop = async () => { await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false }); await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); };
    const mobile = async () => { await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); };
    const realClick = async (sel) => {
      const p = await ev("const el = [...document.querySelectorAll(" + JSON.stringify(sel) + ")].find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && !n.disabled; }); if (!el) return JSON.stringify(null); const r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });");
      if (!p) return null;
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await chrome.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", clickCount: 1 });
      return p;
    };
    const flagNow = () => ev("const B=" + JSON.stringify(BASE) + "; return (async()=>{ const F=await import(B+'src/featureFlags.js'); return JSON.stringify(F.FEATURE_FLAGS.mobaTacticalDirectorV21); })();");
    const newGame = async (flagOn) => {
      intercept = flagOn;
      await chrome.navigate(url); await sleep(2500);
      await ev("localStorage.removeItem('esmo.profile.v1'); return JSON.stringify({});");
      await chrome.navigate(url); await sleep(3000);
    };
    /** 首頁 → 賽前 → 選角 → 戰術頁。 */
    const walkToTactic = async (label) => {
      ck(`${label} 首頁有 MOBA 入口`, await waitFor("document.querySelector('[data-testid=\"home-mode-moba\"]')", 60000));
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
    //  戰術標籤只在展開的記分板顯示（預設精簡，hud-toggle 切換；同一個 battle-hud）。
    const hudText = async () => {
      await ev("const b=document.querySelector('[data-testid=\"hud-toggle\"]'); if(b && b.getAttribute('data-mode')==='compact') b.click(); return JSON.stringify(!!b);");
      await sleep(500);
      return textOf("battle-hud");
    };
    const quickFinish = async () => {
      await ev("window.confirm = () => true; return JSON.stringify({});");
      await ev(clickSel(tid("quick-finish-match")));
      return waitFor("[...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('觀看重播'))", 300000, 500);
    };
    /** 賽後面板的戰術執行那一格（標題開頭是「戰術執行 ·」的 Panel）。 */
    const execPanelText = () => ev("const all=[...document.querySelectorAll('div')].filter(d=>(d.innerText||'').startsWith('戰術執行 ·')); const e=all[0]; return JSON.stringify(e?e.innerText:null);");

    // ── C 旗標關：完整流程（v20 畫面）──────────────────────────────────────
    await desktop();
    await newGame(false);
    const okC = await walkToTactic("C");
    if (okC) {
      const flagOff = await flagNow();
      const book = await ev("return JSON.stringify({ steps: !!document.querySelector('[data-testid=\"tb-steps\"]'), strip: !!document.querySelector('[data-testid=\"tb-template-strip\"]') });");
      const txt = await pageText();
      ck("C1 旗標關：戰術頁是 v20 畫面（沒有戰術書步驟與模板列；副標「8 套戰術」）", flagOff === false && !book?.steps && !book?.strip && (txt ?? "").includes("8 套戰術"), JSON.stringify(book));
      await shot("stage1_c_v20_tactic");
      const pick = MOBA_TACTICS.find((t) => (txt ?? "").includes(t.name));
      await ev(clickText("開始載入"));
      const loaded = await waitFor("document.querySelector('[data-testid=\"moba-loading-progress\"]')", 30000);
      const loadTxt = await pageText();
      ck("C2 讀取畫面顯示出貨版的戰術名稱與描述", loaded && !!pick && MOBA_TACTICS.some((t) => (loadTxt ?? "").includes(`${t.name} · ${t.desc}`) || ((loadTxt ?? "").includes(t.name) && (loadTxt ?? "").includes(t.desc))), (loadTxt ?? "").slice(0, 200));
      const inBattle = await waitFor("document.querySelector('[data-testid=\"battle-hud\"]')", 180000, 500);
      ck("C3 進入對戰（battle-hud）", inBattle);
      await sleep(2500);
      const hud = await hudText();
      ck("C4 HUD 顯示戰術名稱（出貨版）", MOBA_TACTICS.some((t) => (hud ?? "").includes(`戰術 · ${t.name}`)), (hud ?? "").slice(0, 160));
      const ended = await quickFinish();
      ck("C5 快速完成後到賽後畫面", ended);
      if (ended) {
        await sleep(800);
        const p = await execPanelText();
        const un = await ev("return JSON.stringify(!!document.querySelector('[data-testid=\"tactic-exec-unscored\"]'));");
        ck("C6 旗標關：賽後面板照舊評分（有「執行度（非勝負）」、有目標）；沒有未評分區塊", !un && (p ?? "").includes("執行度") && /\d+\/\d+/.test(p ?? ""), (p ?? "").slice(0, 220));
        await shot("stage1_c_v20_result");
      }
    }

    // ── B 旗標開：文案、讀取畫面、HUD、賽後、重播 ──────────────────────────────
    await newGame(true);
    const okB = await walkToTactic("B");
    if (okB) {
      ck("B0 旗標開（攔截恰好換掉那一行）", (await flagNow()) === true && flagHits >= 1 && flagReplaced === flagHits, `hits ${flagHits} replaced ${flagReplaced}`);
      ck("B1 戰術頁是戰術書（有步驟與模板列）", await waitFor("document.querySelector('[data-testid=\"tb-steps\"]') && document.querySelector('[data-testid=\"tb-template-strip\"]')", 10000));
      const pickTpl = async (id) => { await ev(clickSel(tid(`tb-template-${id}`))); await sleep(700); return pageText(); };
      const t3 = await pickTpl("classic.m3");
      ck("B2 m3：中風險、v21 優勢與缺點；沒有已刪除的句子", (t3 ?? "").includes(`${COPY.m3.risk}風險`) && (t3 ?? "").includes(COPY.m3.detail) && (t3 ?? "").includes(COPY.m3.cons) && !/撤退門檻極低|崩盤|刺客切後排/.test(t3 ?? ""));
      await shot("stage1_b_m3_copy");
      ck("B2b m3 選項（P6）：團戰姿態整個維度不顯示、推塔高有提供", await ev(`return !document.querySelector('[data-testid="tb-dim-teamfight.posture"]') && !!document.querySelector('[data-testid="tb-choice-objectives.tower-high"]');`) === true);
      const t6 = await pickTpl("classic.m6");
      const card = async (id) => (await textOf(`tb-template-${id}`)) ?? "";
      const cardRisk = (txt, risk) => new RegExp(`(^|\\s)${risk}(風險)?(\\s|$)`).test(txt);
      ck("B2c m6（v21.b2）：中風險（看自己的卡片）、新優勢與缺點；已刪的詞不在", cardRisk(await card("classic.m6"), COPY.m6.risk) && (t6 ?? "").includes(COPY.m6.detail) && (t6 ?? "").includes(COPY.m6.cons) && !/碾壓|雪上加霜/.test(t6 ?? ""));
      ck("B2c2 m6（v21.b2）：團戰姿態整個維度不顯示", await ev(`return !document.querySelector('[data-testid="tb-dim-teamfight.posture"]');`) === true);
      const the = await pickTpl("v2.hard_engage_stack");
      ck("B2d hard_engage（v21.b2）：中風險、無代價句；舊的整句都不在（這兩個詞組單獨出現在 defensive_hold 的描述是正當的，所以比整句）", cardRisk(await card("v2.hard_engage_stack"), COPY.he.risk) && (the ?? "").includes(COPY.he.cons) && (the ?? "").includes(COPY.he.desc) && !["隊伍加入團戰的程度比平常高很多，投入團戰的門檻也稍微比較低。", "隊伍撤退的時機比平常稍微晚一點，投入團戰的門檻也比平常稍微低一些。", "隊員默契好的時候"].some((x) => (the ?? "").includes(x)));
      const tdh = await pickTpl("v2.defensive_hold");
      ck("B2e defensive_hold（v21.b2）：沒有「比對手弱」；缺點還在", !(tdh ?? "").includes("比對手弱") && (tdh ?? "").includes(COPY.dh.cons));
      const ttl = await pickTpl("v2.three_lane_pressure");
      ck("B2f three_lane（v21.b2）：缺點不變、風險標示高（看自己的卡片）；沒有「比對手強」", cardRisk(await card("v2.three_lane_pressure"), COPY.tl.risk) && (ttl ?? "").includes(COPY.tl.cons) && !(ttl ?? "").includes("比對手強"));
      const t8 = await pickTpl("classic.m8");
      const m8cons = await ev("return JSON.stringify([...document.querySelectorAll('span')].some(s=>s.innerText==='缺點：'));");
      ck("B3 m8：中風險、v21 優勢；缺點整行不顯示；沒有已刪除的句子", (t8 ?? "").includes(`${COPY.m8.risk}風險`) && (t8 ?? "").includes(COPY.m8.detail) && !m8cons && !/全讓|20 分鐘|一波定勝/.test(t8 ?? ""), String(m8cons));
      await shot("stage1_b_m8_copy");
      const t7 = await pickTpl("classic.m7");
      ck("B4 m7：名稱、優勢＝描述、缺點照 Owner 文案", (t7 ?? "").includes(COPY.m7.name) && (t7 ?? "").includes(`優勢：${COPY.m7.desc}`) && (t7 ?? "").includes(COPY.m7.cons));
      await ev(clickText("開始載入"));
      const loaded = await waitFor("document.querySelector('[data-testid=\"moba-loading-progress\"]')", 30000);
      const loadTxt = await pageText();
      ck("B5 讀取畫面：前期野區入侵＋v21 描述；沒有「前期壓制」", loaded && (loadTxt ?? "").includes(COPY.m7.name) && (loadTxt ?? "").includes(COPY.m7.desc) && !(loadTxt ?? "").includes("前期壓制"), (loadTxt ?? "").slice(0, 200));
      await shot("stage1_b_m7_loading");
      const inBattle = await waitFor("document.querySelector('[data-testid=\"battle-hud\"]')", 180000, 500);
      ck("B6 進入對戰", inBattle);
      await sleep(2500);
      const hud = await hudText();
      ck("B7 HUD：戰術 · 前期野區入侵", (hud ?? "").includes(`戰術 · ${COPY.m7.name}`), (hud ?? "").slice(0, 200));
      await shot("stage1_b_m7_hud");
      const ended = await quickFinish();
      ck("B8 快速完成後到賽後畫面", ended);
      if (ended) {
        await sleep(800);
        const p = await execPanelText();
        const un = await textOf("tactic-exec-unscored");
        ck("B9 賽後面板：標題＝戰術執行 · 前期野區入侵；未評分；沒有「執行度」、沒有 x/y 目標、沒有打勾", (p ?? "").includes(`戰術執行 · ${COPY.m7.name}`) && (un ?? "").includes("未評分") && !(p ?? "").includes("執行度") && !/\d+\/\d+/.test(un ?? "") && !/[✅▫]/.test(p ?? ""), (p ?? "").slice(0, 260));
        await shot("stage1_b_m7_result");
        await mobile(); await sleep(1000);
        const ov = await ev("return JSON.stringify(document.documentElement.scrollWidth-document.documentElement.clientWidth);");
        ck("B10[m] 390：賽後畫面沒有頁面級橫向溢出；未評分區塊看得到", ov <= 1 && !!(await textOf("tactic-exec-unscored")), String(ov));
        await shot("stage1_b_m7_result_m390");
        await desktop(); await sleep(600);
        await ev(clickText("觀看重播"));
        const inReplay = await waitFor("[...document.querySelectorAll('span')].some((s)=>(s.innerText||'').startsWith('戰術 '))", 150000, 500);
        const rep = await ev("const s=[...document.querySelectorAll('span')].find((x)=>(x.innerText||'').startsWith('戰術 ')); return JSON.stringify(s?s.innerText:null);");
        ck("B11 重播顯示 v21 名稱", inReplay && rep === `戰術 ${COPY.m7.name}`, String(rep));
      }
    }

    // ── A 確認 v2 模板後、開局前關掉旗標，從首頁恢復 ───────────────────────────
    await newGame(true);
    const okA = await walkToTactic("A");
    if (okA) {
      await ev(clickSel(tid(`tb-template-${V2_ID}`))); await sleep(800);
      const tA = await pageText();
      ck(`A0 前置：戰術書選了 v2 模板「${V2_NAME}」`, (tA ?? "").includes(V2_NAME));
      await ev(clickText("開始載入"));
      await sleep(150);
      const pre = await ev("const B=" + JSON.stringify(BASE) + "; return (async()=>{ const S=(await import(B+'src/platform/profileStore.js')).useProfileStore.getState(); const am=S.matchmaking?.session?.activeMatch; return JSON.stringify({phase:am?.phase??null,tpl:am?.config?.tacticPlanBinding?.plan?.templateId??null,hasRuleset:!!am?.config?.ruleset}); })();");
      ck("A1 前置：本場已確認未開打（phase loading、binding 是 v2 模板、規則集還沒落盤）", pre?.phase === "loading" && pre?.tpl === V2_ID && pre?.hasRuleset === false, JSON.stringify(pre));
      intercept = false;
      await chrome.navigate(url); await sleep(3500);
      ck("A2 重新載入後旗標是關的", (await flagNow()) === false);
      const hasResume = await waitFor("document.querySelector('[data-testid=\"resume-active-match\"]')", 60000);
      ck("A3 首頁有「返回進行中的比賽」", hasResume);
      if (hasResume) {
        await ev(clickSel(tid("resume-active-match")));
        const loaded = await waitFor("document.querySelector('[data-testid=\"moba-loading-progress\"]')", 30000);
        const loadTxt = await pageText();
        ck(`A4 讀取畫面：${STD_NAME}（不是選的 v2 名稱）`, loaded && (loadTxt ?? "").includes(STD_NAME) && !(loadTxt ?? "").includes(V2_NAME), (loadTxt ?? "").slice(0, 200));
        await shot("stage1_a_v2_loading");
        const inBattle = await waitFor("document.querySelector('[data-testid=\"battle-hud\"]')", 180000, 500);
        ck("A5 進入對戰", inBattle);
        await sleep(2500);
        const sub = await textOf("battle-dropped-note-substitution");
        ck(`A6 對戰中的替換提示：列出「${V2_NAME}」與「${STD_NAME}」`, (sub ?? "").includes(V2_NAME) && (sub ?? "").includes(STD_NAME), String(sub));
        const hud = await hudText();
        ck(`A7 HUD：戰術 · ${STD_NAME}；沒有 v2 名稱的戰術標籤`, (hud ?? "").includes(`戰術 · ${STD_NAME}`) && !(hud ?? "").includes(`戰術 · ${V2_NAME}`), (hud ?? "").slice(0, 200));
        await shot("stage1_a_v2_battle");
        const book = await ev("const B=" + JSON.stringify(BASE) + "; return (async()=>{ const S=(await import(B+'src/platform/profileStore.js')).useProfileStore.getState(); return JSON.stringify({binding:S.matchmaking?.session?.activeMatch?.config?.tacticPlanBinding?.plan?.templateId??null}); })();");
        ck("A8 本場設定裡的 binding 沒有被刪（玩家的計畫原樣）", book?.binding === V2_ID, JSON.stringify(book));
      }
    }

    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0", consoleErrs.length === 0, consoleErrs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
