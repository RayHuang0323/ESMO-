#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_tactic_book_v21.mjs — 戰術書畫面，v21 旗標開啟（Phase 3a-C5／C6，瀏覽器；桌機 1366＋手機 390）
//
//  執行：node tools/browser_check_tactic_book_v21.mjs（本地 dev server；一次只跑這一支）
//  旗標：正式站 mobaTacticalDirectorV21 預設 OFF（只有 Owner 能打開）⇒ 本 gate **不改 src**，而是在這個測試分頁裡用 CDP Fetch 攔截
//  dev server 送出的 src/featureFlags.js，把那一行 `mobaTacticalDirectorV21: false` 換成 true（恰好一處，否則 F0 紅）。
//  TacticScreen 因此照正式路徑 resolveRulesetForMode → career.v21 → tacticalDirectorModeOf ＝ core.v1。
//  static（旗標關）的同一個畫面由 tools/browser_check_tactic_book_3a.mjs 驗，兩支都要跑。
//    F  旗標真的開了：頁面裡的 FEATURE_FLAGS 與 resolveRulesetForMode 解析出 career.v21
//    O  畫面上的選項＝tacticBookView({ tacticalDirector:"core.v1" })（每時期維度、強邊、快速強邊、勝利條件；撤下的不在 DOM）
//    W  勝利條件：只有前期滾雪球可選（控圖運營、中路分推維持不提供）；點了 ⇒ 被填的格標「勝利條件」，送出的 binding＝Node 算的；
//       玩家再自己點其中一格 ⇒ 那一格以玩家為準、標記消失（R-8），其他被填的格不變
//    Q  快速強邊：點「下路」⇒ 前期、中期強邊都選下路；與積極姿態同時選用 ⇒ 計畫合法、binding＝Node 算的
//    L  390 與 1366 都沒有橫向溢出；選項觸控大小足夠
//    E  page error 0、console error 0
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";
import { tacticBookView, withChoice, QUICK_STRONG_SIDE } from "../src/screens/moba/tacticBook/tacticBookOptions.js";
import { resolveTactic } from "../src/battle/moba/tactics/tacticResolver.js";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/tactic-book-3a/gate";
mkdirSync(OUT, { recursive: true });
const J = JSON.stringify;
const MODE = "core.v1";
const expectedIds = (view) => view.dimensions.flatMap((d) => [...(d.templateCustom ? [`tb-choice-${d.dimension}-_template`] : []), ...d.choices.map((c) => `tb-choice-${d.dimension}-${c.id}`)]).sort();
const FLAG_LINE = "mobaTacticalDirectorV21: false,";

const result = await runGate({
  name: "Tactic Book v21（戰術書畫面，v21 旗標開啟）",
  timeoutMs: 600000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const BASE = new URL(".", url.endsWith("/") ? url : url + "/").pathname;
    const click = (sel) => ev("const el=document.querySelector('#tb-host '+" + J(sel) + "); if(!el) return JSON.stringify(false); el.click(); return JSON.stringify(true);");
    const tid = (id) => '[data-testid="' + id + '"]';
    const has = (id) => ev("return JSON.stringify(!!document.querySelector('#tb-host '+" + J(tid(id)) + "));");
    const choiceIds = () => ev("return JSON.stringify([...document.querySelectorAll('#tb-host button[data-testid^=\"tb-choice-\"]')].map(e=>e.getAttribute('data-testid')).sort());");
    const selectedIds = () => ev("return JSON.stringify([...document.querySelectorAll('#tb-host button[data-testid^=\"tb-choice-\"][data-selected=\"1\"]')].map(e=>e.getAttribute('data-testid')).sort());");
    const filledDims = () => ev("return JSON.stringify([...document.querySelectorAll('#tb-host [data-testid^=\"tb-wc-filled-\"]')].map(e=>e.getAttribute('data-testid').slice(13)).sort());");
    const overflow = () => ev("const h=document.getElementById('tb-host'); return JSON.stringify(h?h.scrollWidth-h.clientWidth:null);");
    const mobile = async () => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };
    const desktop = async () => {
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await chrome.send("Emulation.clearDeviceMetricsOverride", {});
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    };

    // ── 旗標：攔截 dev server 的 src/featureFlags.js（只在這個分頁；不改 src）─────────────
    let flagHits = 0, flagReplaced = 0;
    chrome.on("Fetch.requestPaused", async (p) => {
      try {
        const body = await chrome.send("Fetch.getResponseBody", { requestId: p.requestId });
        const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
        flagHits++;
        const n = text.split(FLAG_LINE).length - 1;
        if (n === 1) flagReplaced++;
        const out = n === 1 ? text.replace(FLAG_LINE, "mobaTacticalDirectorV21: true,") : text;
        await chrome.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: p.responseStatusCode ?? 200,
          responseHeaders: (p.responseHeaders ?? []).filter((h) => !/^content-length$/i.test(h.name)), body: Buffer.from(out, "utf8").toString("base64") });
      } catch { await chrome.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {}); }
    });
    await chrome.send("Network.enable").catch(() => {});
    await chrome.send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {});
    await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*src/featureFlags.js*", requestStage: "Response" }] });

    await desktop();
    await chrome.navigate(url);
    await sleep(4000);
    const mount = await ev("const B=" + J(BASE) + "; return (async()=>{ const ts=await (await fetch(B+'src/screens/moba/TacticScreen.jsx')).text(); const mn=await (await fetch(B+'src/main.jsx')).text();"
      + "const ru=(ts.match(/from\\s+\"([^\"]*\\/deps\\/react\\.js[^\"]*)\"/)||[])[1]; const du=(mn.match(/from\\s+\"([^\"]*\\/deps\\/react-dom_client\\.js[^\"]*)\"/)||[])[1];"
      + "if(!ru||!du) return JSON.stringify({ok:false,ru,du}); const R=await import(ru); const D=await import(du); const T=await import(B+'src/screens/moba/TacticScreen.jsx');"
      + "const React=R.default||R; const createRoot=(D.default||D).createRoot; const host=document.createElement('div'); host.id='tb-host'; host.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#0b0f14;overflow:auto';"
      + "document.body.appendChild(host); window.__TB_NEXT=null; createRoot(host).render(React.createElement(T.default,{onNext:(t,s,talents,binding)=>{window.__TB_NEXT={tacticId:t&&t.tacticId,binding:binding||null};},onBack:()=>{}})); return JSON.stringify({ok:true}); })();");
    ck("M0 正式 TacticScreen 掛載成功", mount?.ok, J(mount));
    if (!mount?.ok) return;
    await sleep(1200);

    // ── F 旗標真的開了（頁面裡同一份模組）─────────────────────────────────
    const flag = await ev("const B=" + J(BASE) + "; return (async()=>{ const F=await import(B+'src/featureFlags.js'); const M=await import(B+'src/platform/contracts/matchRuleset.js'); const L=await import(B+'src/battle/moba/liveMatchSetup.js').catch(()=>null);"
      + "const rs=M.resolveRulesetForMode({mode:'career',flags:F.FEATURE_FLAGS}); return JSON.stringify({flag:F.FEATURE_FLAGS.mobaTacticalDirectorV21,rulesetId:rs.rulesetId,mode:M.tacticalDirectorModeOf(rs)}); })();");
    ck("F0 攔截恰好換掉 featureFlags.js 的那一行（不是整檔改寫）", flagHits >= 1 && flagReplaced === flagHits, `hits ${flagHits} replaced ${flagReplaced}`);
    ck("F1 頁面裡 FEATURE_FLAGS.mobaTacticalDirectorV21＝true；resolveRulesetForMode(career) ＝ career.v21、Director 模式 core.v1", flag?.flag === true && flag.rulesetId === "career.v21" && flag.mode === MODE, J(flag));

    const pick = async (templateId) => { const ok = await click(tid("tb-template-" + templateId)); await sleep(500); return ok; };
    const next = async () => { await ev("window.__TB_NEXT=null; const b=[...document.querySelectorAll('#tb-host button')].find(x=>(x.textContent||'').includes('開始載入')); if(b) b.click(); return JSON.stringify(!!b);"); await sleep(300); return ev("return JSON.stringify(window.__TB_NEXT);"); };

    // ── O 選項＝view-model（core.v1）──────────────────────────────────────
    for (const templateId of ["classic.m1", "std", "classic.m2", "v2.mid_solo_split", "classic.m8"]) {
      const picked = await pick(templateId);
      const want = expectedIds(tacticBookView({ templateId, tacticalDirector: MODE }));
      const got = await choiceIds();
      ck(`O1 ${templateId}：畫面上的選項按鈕＝view-model（core.v1，${want.length} 顆）`, picked && J(got) === J(want), `got ${got?.length} want ${want.length}`);
    }
    await pick("std");
    const stdView = tacticBookView({ templateId: "std", tacticalDirector: MODE });
    const domDims = await ev("return JSON.stringify([...document.querySelectorAll('#tb-host [data-testid^=\"tb-dim-\"]')].map(e=>e.getAttribute('data-testid').slice(7)).sort());");
    const viewDims = stdView.dimensions.map((d) => d.dimension).sort();
    ck("O2 std 的 DOM 維度＝view-model；含每時期強邊（前／中／後期）、快速強邊、勝利條件", J(domDims) === J(viewDims)
      && ["phases.early.focusLane", "phases.mid.focusLane", "phases.late.focusLane", QUICK_STRONG_SIDE, "winCondition"].every((d) => domDims?.includes(d)), J(domDims));
    ck("O3 勝利條件只提供「前期滾雪球」（控圖運營、中路分推維持不提供；後期團戰不在列舉）",
      (await has("tb-choice-winCondition-earlySnowball")) && !(await has("tb-choice-winCondition-objectiveControl")) && !(await has("tb-choice-winCondition-midSplitPressure")) && !(await has("tb-choice-winCondition-teamfightScaling")));
    ck("O4 複驗撤下的每時期選擇不在 DOM（後期巴龍優先、後期推塔優先）", !(await has("tb-choice-phases.late.objectiveOrder-baron")) && !(await has("tb-choice-phases.late.objectiveOrder-towers")));
    await shot("d1366_tactic_book_v21_choices");

    // ── W 勝利條件 ──────────────────────────────────────────────────────
    const plain = await next();
    ck("W0 std、沒有調整：送出的 binding＝Node（core.v1）算的", plain?.tacticId === "std" && J(plain.binding) === J(stdView.binding), `${plain?.binding?.planHash} vs ${stdView.binding.planHash}`);
    await click(tid("tb-choice-winCondition-earlySnowball")); await sleep(500);
    const c1 = withChoice({}, "winCondition", "earlySnowball", "none");
    const v1 = tacticBookView({ templateId: "std", choices: c1, tacticalDirector: MODE });
    const wantFilled = v1.winCondition.filled.map(([d]) => d).sort();
    const filled1 = await filledDims(), sel1 = await selectedIds();
    ck("W1 點「前期滾雪球」⇒ 被填的格（前期姿態積極、中期姿態積極、前期物件優先巨龍）都標「勝利條件」且顯示被選中",
      J(filled1) === J(wantFilled) && J(wantFilled) === J(["phases.early.objectiveOrder", "phases.early.stance", "phases.mid.stance"])
      && ["tb-choice-phases.early.stance-aggressive", "tb-choice-phases.mid.stance-aggressive", "tb-choice-phases.early.objectiveOrder-dragon", "tb-choice-winCondition-earlySnowball"].every((x) => sel1?.includes(x)), `${J(filled1)} ${J(sel1?.filter((x) => /phases|winCondition/.test(x)))}`);
    const sent1 = await next();
    const r1 = resolveTactic({ kind: "binding", binding: v1.binding }, {}, { phases: true });
    ck("W2 送出的 binding＝Node 以同一份選擇算的（逐字元），且以每時期方針解析得出", J(sent1?.binding) === J(v1.binding) && r1.ok && sent1.binding.planHash !== stdView.binding.planHash, `${sent1?.binding?.planHash} vs ${v1.binding.planHash}`);
    //  R-8：玩家自己點被填的一格（前期姿態改防守）⇒ 那格以玩家為準、標記消失；其他兩格仍是勝利條件填的
    await click(tid("tb-choice-phases.early.stance-defensive")); await sleep(500);
    const c2 = withChoice(c1, "phases.early.stance", "defensive", null);
    const v2 = tacticBookView({ templateId: "std", choices: c2, tacticalDirector: MODE });
    const filled2 = await filledDims(), sel2 = await selectedIds();
    ck("W3 玩家優先（R-8）：自己點了前期姿態＝防守 ⇒ 那格選中防守、不再標勝利條件；另外兩格仍標勝利條件",
      J(filled2) === J(["phases.early.objectiveOrder", "phases.mid.stance"]) && sel2?.includes("tb-choice-phases.early.stance-defensive") && !sel2.includes("tb-choice-phases.early.stance-aggressive"), `${J(filled2)}`);
    const sent2 = await next();
    ck("W4 送出的 binding＝Node（勝利條件＋玩家自己的前期姿態）", J(sent2?.binding) === J(v2.binding), `${sent2?.binding?.planHash} vs ${v2.binding.planHash}`);
    await shot("d1366_tactic_book_v21_wincondition");

    // ── Q 快速強邊＋積極姿態 ──────────────────────────────────────────────
    await click(tid("tb-reset")); await sleep(500);
    await click(tid("tb-choice-" + QUICK_STRONG_SIDE + "-bot")); await sleep(500);
    const c3 = withChoice({}, QUICK_STRONG_SIDE, "bot", null);
    const sel3 = await selectedIds();
    ck("Q1 點快速強邊「下路」⇒ 前期、中期強邊都選下路", sel3?.includes("tb-choice-phases.early.focusLane-bot") && sel3.includes("tb-choice-phases.mid.focusLane-bot") && sel3.includes("tb-choice-" + QUICK_STRONG_SIDE + "-bot"), J(sel3?.filter((x) => /focusLane|quick/.test(x))));
    await click(tid("tb-choice-phases.early.stance-aggressive")); await sleep(400);
    await click(tid("tb-choice-phases.mid.stance-aggressive")); await sleep(400);
    const c4 = withChoice(withChoice(c3, "phases.early.stance", "aggressive", "standard"), "phases.mid.stance", "aggressive", "standard");
    const v4 = tacticBookView({ templateId: "std", choices: c4, tacticalDirector: MODE });
    const sent4 = await next();
    const r4 = resolveTactic({ kind: "binding", binding: v4.binding }, {}, { phases: true });
    ck("Q2 強邊（下路）＋前期／中期積極同時選用 ⇒ 計畫合法（沒有被拒或拿掉）、送出的 binding＝Node 算的、以每時期方針解析得出",
      v4.ok && J(sent4?.binding) === J(v4.binding) && r4.ok && r4.phases[0].knobs.gankFocusLane !== undefined, `${sent4?.binding?.planHash} vs ${v4.binding?.planHash}`);
    ck("L1[d] 1366 沒有橫向溢出", (await overflow()) <= 0, String(await overflow()));

    // ── L 手機 390 ─────────────────────────────────────────────────────
    await click(tid("tb-choice-winCondition-earlySnowball")); await sleep(500);
    await mobile(); await sleep(1200);
    ck("L2[m] 390 沒有橫向溢出（含每時期、強邊、勝利條件列）", (await overflow()) <= 0, String(await overflow()));
    const small = await ev("return JSON.stringify([...document.querySelectorAll('#tb-host button[data-testid^=\"tb-choice-\"]')].filter(e=>{const r=e.getBoundingClientRect(); return r.height<32||r.width<40;}).length);");
    ck("L3[m] 選項按鈕的觸控大小足夠（高 ≥ 32、寬 ≥ 40）", small === 0, String(small));
    await ev("const e=document.querySelector('#tb-host [data-testid=\"tb-group-win\"]')||document.querySelector('#tb-host [data-testid=\"tb-choice-panel\"]'); if(e) e.scrollIntoView({block:'start'}); return JSON.stringify(1);"); await sleep(300);
    await shot("m390_tactic_book_v21_wincondition");
    await ev("const e=document.querySelector('#tb-host [data-testid=\"tb-dim-" + QUICK_STRONG_SIDE + "\"]'); if(e) e.scrollIntoView({block:'start'}); return JSON.stringify(1);"); await sleep(300);
    await shot("m390_tactic_book_v21_strongside");
    await desktop(); await sleep(400);

    // ── E 錯誤 ─────────────────────────────────────────────────────────
    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0", consoleErrs.length === 0, consoleErrs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
