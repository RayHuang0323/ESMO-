#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_battle_notices_3aB.mjs — Phase 3a-B：對戰中「未使用／沿用」的戰術提示與真實 AI 對手情報（瀏覽器；桌機 1366＋手機 390）
//
//  執行：node tools/browser_check_battle_notices_3aB.mjs（本地 dev server；一次只跑這一支）
//  旗標：v21 情境用 CDP Fetch 攔截 dev server 的 src/featureFlags.js，把 `mobaTacticalDirectorV21: false,` 換成 true（只在這個測試分頁；不改 src）。
//    D  旗標關（career.v20）：正式 GameView（autoStart）帶含 v21 專用選擇（前期滾雪球）的 binding 開局 ⇒ 對戰畫面顯示「本場未使用的戰術選項」
//       列出勝利條件＝前期滾雪球；沒有「沿用」那一行；可關閉；比賽照常開始（沒有開局錯誤畫面）
//    K  旗標開（career.v21）：帶含已撤下選擇（後期強邊下路，Owner 暫緩）的 binding 開局（＝恢復舊場次會遇到的 binding）⇒
//       顯示「本場沿用開局時的戰術設定，包含目前已不再提供的選項」列出後期強邊——這一行是從**組好的 setup**（useLocalServer 的 prepared.setup.tactic.blue）
//       算出來的，列得出後期強邊＝本場 binding 仍帶著它、沒有被改寫
//    I  戰術畫面（正式 TacticScreen）在 store 的場次指定真實 AI 對手：旗標開 ⇒ ① 情報顯示 AI 教練概要（data-source aiCoach，預計戰術名稱＝Node 算的）；
//       旗標關 ⇒ 風格模板名稱（data-source styleTemplate）；兩者都不含數字
//    L  390：提示沒有橫向溢出　　E  page error 0、console error 0
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";
import { createTacticPlan } from "../src/platform/tactics/tacticPlan.js";
import { bindTacticPlanToCurrentVersions } from "../src/battle/moba/tactics/tacticResolver.js";
import { opponentIntelOf } from "../src/screens/moba/tacticBook/tacticBookOptions.js";
import { AI_TEAMS } from "../src/platform/competition/aiTeams.js";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/tactic-book-3a/gate";
mkdirSync(OUT, { recursive: true });
const J = JSON.stringify;
const FLAG_LINE = "mobaTacticalDirectorV21: false,";
const bindingOf = (choices) => bindTacticPlanToCurrentVersions(createTacticPlan({ templateId: "std", choices }).plan);
const B_DROP = bindingOf({ winCondition: "earlySnowball" });
const B_KEEP = bindingOf({ phases: { late: { focusLane: "bot" } } });
const TEAM = AI_TEAMS.find((t) => t.style === "aggressive");

const result = await runGate({
  name: "Battle notices 3a-B（對戰中戰術提示＋真實 AI 對手情報）",
  timeoutMs: 900000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const BASE = new URL(".", url.endsWith("/") ? url : url + "/").pathname;
    let intercept = false, flagHits = 0, flagReplaced = 0;
    chrome.on("Fetch.requestPaused", async (p) => {
      try {
        const body = await chrome.send("Fetch.getResponseBody", { requestId: p.requestId });
        const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
        let out = text;
        if (intercept) { flagHits++; const n = text.split(FLAG_LINE).length - 1; if (n === 1) { flagReplaced++; out = text.replace(FLAG_LINE, "mobaTacticalDirectorV21: true,"); } }
        await chrome.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: p.responseStatusCode ?? 200,
          responseHeaders: (p.responseHeaders ?? []).filter((h) => !/^content-length$/i.test(h.name)), body: Buffer.from(out, "utf8").toString("base64") });
      } catch { await chrome.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {}); }
    });
    await chrome.send("Network.enable").catch(() => {});
    await chrome.send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {});
    await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*src/featureFlags.js*", requestStage: "Response" }] });
    const desktop = async () => { await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false }); await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }); };
    const mobile = async () => { await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); };
    //  正式元件直接掛到 #nb-host（同戰術書 gate 的做法：用頁面已載入的 react／react-dom）。
    const mount = (modulePath, propsJs, preJs = "") => ev("const B=" + J(BASE) + "; return (async()=>{ const ts=await (await fetch(B+'src/screens/moba/TacticScreen.jsx')).text(); const mn=await (await fetch(B+'src/main.jsx')).text();"
      + "const ru=(ts.match(/from\\s+\"([^\"]*\\/deps\\/react\\.js[^\"]*)\"/)||[])[1]; const du=(mn.match(/from\\s+\"([^\"]*\\/deps\\/react-dom_client\\.js[^\"]*)\"/)||[])[1];"
      + "if(!ru||!du) return JSON.stringify({ok:false}); const R=await import(ru); const D=await import(du); " + preJs + " const T=await import(B+" + J(modulePath) + ");"
      + "const React=R.default||R; const createRoot=(D.default||D).createRoot; const host=document.createElement('div'); host.id='nb-host'; host.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#0b0f14;overflow:auto';"
      + "document.body.appendChild(host); createRoot(host).render(React.createElement(T.default," + propsJs + ")); return JSON.stringify({ok:true}); })();");
    const text = (tid) => ev("const e=document.querySelector('#nb-host [data-testid=\"" + tid + "\"]'); return JSON.stringify(e?e.textContent:null);");
    const overflow = () => ev("const h=document.getElementById('nb-host'); return JSON.stringify(h?h.scrollWidth-h.clientWidth:null);");
    const fresh = async (v21) => { intercept = v21; await chrome.navigate(url); await sleep(3500); };
    const flagNow = () => ev("const B=" + J(BASE) + "; return (async()=>{ const F=await import(B+'src/featureFlags.js'); return JSON.stringify(F.FEATURE_FLAGS.mobaTacticalDirectorV21); })();");

    // ── D 旗標關：v21 專用選擇本場未使用 ─────────────────────────────────
    await desktop(); await fresh(false);
    const m1 = await mount("src/GameView.jsx", "{autoStart:true,tacticPlanBinding:" + J(B_DROP) + "}");
    await sleep(6000);
    const dropT = await text("battle-dropped-note-dropped"), keepT1 = await text("battle-dropped-note-kept"), err1 = await text("battle-assembly-error");
    ck("D0 旗標關、GameView 掛載成功", m1?.ok && (await flagNow()) === false);
    ck("D1 對戰畫面顯示「本場未使用的戰術選項」並列出勝利條件＝前期滾雪球；沒有「沿用」那一行；沒有開局錯誤", (dropT ?? "").includes("本場未使用的戰術選項") && (dropT ?? "").includes("前期滾雪球") && keepT1 === null && err1 === null, J({ dropT, keepT1 }));
    await shot("d1366_battle_dropped_note");
    await mobile(); await sleep(1200);
    ck("L1[m] 390：提示沒有橫向溢出", (await overflow()) <= 0, String(await overflow()));
    await shot("m390_battle_dropped_note");
    await ev("const b=document.querySelector('#nb-host [data-testid=\"battle-dropped-note-close\"]'); if(b) b.click(); return JSON.stringify(!!b);"); await sleep(400);
    ck("D2 提示可以關閉", (await text("battle-dropped-note-dropped")) === null);
    await desktop();

    // ── K 旗標開：沿用已撤下的選擇（不改寫）─────────────────────────────
    await fresh(true);
    const m2 = await mount("src/GameView.jsx", "{autoStart:true,tacticPlanBinding:" + J(B_KEEP) + "}");
    await sleep(6000);
    const keepT = await text("battle-dropped-note-kept"), dropT2 = await text("battle-dropped-note-dropped");
    ck("K0 旗標開（攔截恰好換掉那一行）、GameView 掛載成功", m2?.ok && (await flagNow()) === true && flagHits >= 1 && flagReplaced === flagHits, `hits ${flagHits} replaced ${flagReplaced}`);
    ck("K1 顯示「本場沿用開局時的戰術設定，包含目前已不再提供的選項」並列出後期強邊；沒有「未使用」那一行", (keepT ?? "").includes("本場沿用開局時的戰術設定") && (keepT ?? "").includes("後期") && dropT2 === null, J({ keepT, dropT2 }));
    await shot("d1366_battle_kept_note");

    // ── I 真實 AI 對手情報 ───────────────────────────────────────────────
    const setOpp = "const S=(await import(B+'src/platform/profileStore.js')).useProfileStore; const st=S.getState(); S.setState({ matchmaking: { ...(st.matchmaking||{}), launch: { ...((st.matchmaking||{}).launch||{}), opponentId: " + J(TEAM.id) + " } } });";
    const intelOf = async () => { await ev("const b=document.querySelector('#nb-host [data-testid=\"tb-step-intel\"]'); if(b) b.click(); return JSON.stringify(!!b);"); await sleep(500);
      return ev("const p=document.querySelector('#nb-host [data-testid=\"tb-intel-plan\"]'); const t=document.querySelector('#nb-host [data-testid=\"tb-intel-team\"]'); const n=document.querySelector('#nb-host [data-testid=\"tb-intel-notes\"]'); return JSON.stringify(p?{src:p.getAttribute('data-source'),plan:p.textContent,team:t&&t.textContent,notes:n?n.textContent:''}:null);"); };
    await fresh(true);
    await mount("src/screens/moba/TacticScreen.jsx", "{onNext:()=>{},onBack:()=>{}}", setOpp); await sleep(1200);
    const i21 = await intelOf(), want21 = opponentIntelOf({ team: TEAM, tacticalDirector: "core.v1", redTactic: "aiCoachV1" });
    ck(`I1 旗標開、真實 AI 對手（${TEAM.name}）：情報顯示 AI 教練概要（data-source aiCoach），預計戰術＝Node 算的「${want21.planName}」，描述＝Node 的，沒有數字`,
      i21?.src === "aiCoach" && (i21.plan ?? "").includes(want21.planName) && (i21.team ?? "").includes(TEAM.name) && want21.notes.every((x) => (i21.notes ?? "").includes(x)) && !/[0-9]/.test((i21.plan ?? "") + (i21.notes ?? "")), J(i21));
    await shot("d1366_tactic_intel_ai_coach");
    await fresh(false);
    await mount("src/screens/moba/TacticScreen.jsx", "{onNext:()=>{},onBack:()=>{}}", setOpp); await sleep(1200);
    const i20 = await intelOf(), want20 = opponentIntelOf({ team: TEAM, tacticalDirector: "static", redTactic: "styleTemplate" });
    ck(`I2 旗標關、同一個對手：情報顯示風格模板名稱「${want20.planName}」（data-source styleTemplate）`, i20?.src === "styleTemplate" && (i20.plan ?? "").includes(want20.planName), J(i20));
    await mobile(); await sleep(1000);
    ck("L2[m] 390：情報畫面沒有橫向溢出", (await overflow()) <= 0, String(await overflow()));
    await shot("m390_tactic_intel_style_template");
    await desktop();
    //  清掉測試寫進 store 的對手（不留測試資料）。
    await ev("const B=" + J(BASE) + "; return (async()=>{ const S=(await import(B+'src/platform/profileStore.js')).useProfileStore; const st=S.getState(); const l={...((st.matchmaking||{}).launch||{})}; delete l.opponentId; S.setState({ matchmaking: { ...(st.matchmaking||{}), launch: l } }); return JSON.stringify(1); })();");

    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0", consoleErrs.length === 0, consoleErrs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
